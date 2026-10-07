import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ensureDatabase, getDatabase } from "./_lib/database.js";
import { cors, json, method } from "./_lib/http.js";

type HomeRow = { id: string; name: string; timezone: string; armed: boolean };
type DeviceRow = { id: string; name: string; kind: string; room: string; status: "online" | "offline" | "alert"; battery_percent: string | number | null; state: Record<string, unknown> | null; last_seen_at: string | Date };
type EventRow = { id: string | number; timestamp: string; device_id: string | null; device_name: string; message: string; severity: "info" | "warning" | "critical" };
type MetricRow = { metric: string; numeric_value: string | number };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (method(req) !== "GET") return json(res, 405, { error: "METHOD_NOT_ALLOWED" });

  const sql = getDatabase();
  if (!sql) return json(res, 503, { error: "DATABASE_NOT_CONFIGURED" });

  try {
    await ensureDatabase(sql);

    const homes = await sql`
      SELECT id, name, timezone, armed
      FROM homes
      ORDER BY created_at ASC
      LIMIT 1
    ` as unknown as HomeRow[];

    const devices = await sql`
      SELECT
        id,
        name,
        kind,
        room,
        status,
        battery_percent,
        state,
        last_seen_at
      FROM devices
      WHERE home_id = ${homes[0].id}
      ORDER BY kind DESC, name ASC
    ` as unknown as DeviceRow[];

    const events = await sql`
      SELECT
        e.id,
        TO_CHAR(e.occurred_at AT TIME ZONE ${homes[0].timezone}, 'HH24:MI') AS timestamp,
        e.device_id,
        COALESCE(d.name, 'Sistema') AS device_name,
        e.message,
        e.severity
      FROM events e
      LEFT JOIN devices d ON d.id = e.device_id
      WHERE d.home_id = ${homes[0].id} OR e.device_id IS NULL
      ORDER BY e.occurred_at DESC
      LIMIT 30
    ` as unknown as EventRow[];

    const metricsRows = await sql`
      SELECT metric, numeric_value
      FROM (
        SELECT DISTINCT ON (metric)
          metric,
          numeric_value,
          recorded_at
        FROM telemetry
        WHERE device_id = 'gateway-01'
        ORDER BY metric, recorded_at DESC
      ) latest
    ` as unknown as MetricRow[];

    const metricMap = Object.fromEntries(metricsRows.map((row) => [row.metric, Number(row.numeric_value)]));

    return json(res, 200, {
      home: {
        id: homes[0].id,
        name: homes[0].name,
        timezone: homes[0].timezone,
        armed: Boolean(homes[0].armed),
      },
      metrics: {
        temperature: metricMap.temperature ?? 0,
        humidity: metricMap.humidity ?? 0,
        power: metricMap.power ?? 0,
        wifi: metricMap.wifi ?? 0,
      },
      devices: devices.map((device) => ({
        id: device.id,
        name: device.name,
        kind: device.kind,
        room: device.room,
        status: device.status,
        battery: device.battery_percent === null ? undefined : Number(device.battery_percent),
        value: formatDeviceValue(device.kind, device.state),
        lastSeen: formatLastSeen(device.last_seen_at),
      })),
      events: events.map((event) => ({
        id: String(event.id),
        timestamp: event.timestamp,
        deviceId: event.device_id ?? 'system',
        deviceName: event.device_name,
        message: event.message,
        severity: event.severity,
      })),
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error("bigcalm.state", error);
    return json(res, 500, { error: "DATABASE_QUERY_FAILED" });
  }
}

function formatDeviceValue(kind: string, state: Record<string, unknown> | null): string {
  if (!state) return kind === "camera" ? "1080p / Live" : "Sin datos";
  if (typeof state.value === "string") return state.value;
  if (typeof state.label === "string") return state.label;
  return kind === "camera" ? "1080p / Live" : "Sin datos";
}

function formatLastSeen(value: string | Date): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin datos";
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "Ahora";
  if (seconds < 3600) return `Hace ${Math.floor(seconds / 60)} min`;
  return `Hace ${Math.floor(seconds / 3600)} h`;
}
