import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ensureDatabase, getDatabase } from "./_lib/database.js";
import { cors, json, method } from "./_lib/http.js";

const allowedMetrics = new Set(["temperature", "humidity", "power", "wifi"]);

interface TelemetryBody {
  deviceKey?: unknown;
  readings?: unknown;
  state?: unknown;
  event?: unknown;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (method(req) !== "POST") return json(res, 405, { error: "METHOD_NOT_ALLOWED" });

  const configuredToken = process.env.BIGCALM_INGEST_TOKEN;
  if (!configuredToken) return json(res, 503, { error: "INGEST_NOT_CONFIGURED" });

  const providedToken = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!providedToken || !timingSafeEqual(providedToken, configuredToken)) {
    return json(res, 401, { error: "UNAUTHORIZED" });
  }

  const body = (req.body ?? {}) as TelemetryBody;
  if (typeof body.deviceKey !== "string" || !body.deviceKey.trim()) {
    return json(res, 400, { error: "INVALID_DEVICE_KEY" });
  }

  const readings = isRecord(body.readings) ? body.readings : {};
  const state = isRecord(body.state) ? body.state : {};
  const event = isRecord(body.event) ? body.event : null;

  const sql = getDatabase();
  if (!sql) return json(res, 503, { error: "DATABASE_NOT_CONFIGURED" });

  try {
    await ensureDatabase(sql);

    const device = await sql`
      SELECT id, home_id
      FROM devices
      WHERE device_key = ${body.deviceKey}
      LIMIT 1
    `;
    if (!device[0]) return json(res, 404, { error: "DEVICE_NOT_FOUND" });

    const status = typeof state.status === "string" && ["online", "offline", "alert"].includes(state.status)
      ? state.status
      : "online";
    const battery = typeof state.batteryPercent === "number" && Number.isFinite(state.batteryPercent)
      ? Math.min(100, Math.max(0, state.batteryPercent))
      : null;

    await sql`
      UPDATE devices
      SET
        status = ${status},
        battery_percent = COALESCE(${battery}, battery_percent),
        state = ${JSON.stringify(state)}::jsonb,
        last_seen_at = NOW()
      WHERE id = ${device[0].id}
    `;

    for (const [metric, rawValue] of Object.entries(readings)) {
      if (!allowedMetrics.has(metric)) continue;
      if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) continue;
      const unit = metric === "temperature" ? "°C" : metric === "power" ? "kW" : "%";
      await sql`
        INSERT INTO telemetry (device_id, metric, numeric_value, unit)
        VALUES (${device[0].id}, ${metric}, ${rawValue}, ${unit})
      `;
    }

    let normalizedEvent: {
      type: string;
      severity: "info" | "warning" | "critical";
      message: string;
    } | null = null;

    if (event) {
      const severity = typeof event.severity === "string" && ["info", "warning", "critical"].includes(event.severity)
        ? event.severity as "info" | "warning" | "critical"
        : "info";
      const eventType = typeof event.type === "string" ? event.type.slice(0, 80) : "telemetry";
      const message = typeof event.message === "string" && event.message.trim()
        ? event.message.slice(0, 300)
        : "Telemetría recibida";

      normalizedEvent = { type: eventType, severity, message };

      await sql`
        INSERT INTO events (device_id, event_type, severity, message, payload)
        VALUES (${device[0].id}, ${eventType}, ${severity}, ${message}, ${JSON.stringify(event)}::jsonb)
      `;
    }

    const normalizedReadings = Object.fromEntries(
      Object.entries(readings)
        .filter(([metric, value]) => allowedMetrics.has(metric) && typeof value === "number" && Number.isFinite(value))
        .map(([metric, value]) => [metric, value]),
    );

    const realtimeState = {
      status,
      ...(battery === null ? {} : { batteryPercent: battery }),
      ...(typeof state.value === "string" ? { value: state.value.slice(0, 120) } : {}),
      ...(typeof state.label === "string" ? { label: state.label.slice(0, 120) } : {}),
    };

    await sql`
      SELECT pg_notify(
        "bigcalm_events",
        ${JSON.stringify({
          type: "telemetry",
          deviceId: device[0].id,
          deviceKey: body.deviceKey,
          readings: normalizedReadings,
          state: realtimeState,
          event: normalizedEvent
            ? { ...normalizedEvent, timestamp: new Date().toISOString() }
            : null,
          occurredAt: new Date().toISOString(),
        })}
      )
    `;

    return json(res, 202, {
      accepted: true,
      deviceKey: body.deviceKey,
      recordedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("bigcalm.telemetry", error);
    return json(res, 500, { error: "TELEMETRY_WRITE_FAILED" });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
}
