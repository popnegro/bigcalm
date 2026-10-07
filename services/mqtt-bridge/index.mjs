import http from "node:http";
import mqtt from "mqtt";
import { neon } from "@neondatabase/serverless";

const brokerUrl = mqttUrl();
const databaseUrl = required("DATABASE_URL");
const sql = neon(databaseUrl);
const topic = process.env.BIGCALM_MQTT_TOPIC ?? "bigcalm/+/telemetry";
const clientId = process.env.BIGCALM_MQTT_CLIENT_ID ?? `bigcalm-bridge-${process.pid}`;
const port = Number(process.env.PORT ?? 10000);
const allowedMetrics = new Set(["temperature", "humidity", "power", "wifi"]);

const client = mqtt.connect(brokerUrl, {
  clientId,
  username: process.env.BIGCALM_MQTT_USERNAME,
  password: process.env.BIGCALM_MQTT_PASSWORD,
  protocolVersion: Number(process.env.BIGCALM_MQTT_PROTOCOL_VERSION ?? 4),
  clean: true,
  reconnectPeriod: 1_000,
  connectTimeout: 10_000,
  keepalive: 30,
});

const healthServer = http.createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify({ ok: true, service: "bigcalm-mqtt-bridge" }));
    return;
  }
  response.writeHead(404);
  response.end();
});

healthServer.listen(port, "0.0.0.0", () =>
  console.log(JSON.stringify({ service: "bigcalm-mqtt-bridge", status: "health_ready", port })),
);

client.on("connect", () => {
  console.log(JSON.stringify({ service: "bigcalm-mqtt-bridge", status: "connected", topic }));
  client.subscribe(topic, { qos: 1 }, (error) => {
    if (error) {
      console.error(JSON.stringify({
        service: "bigcalm-mqtt-bridge",
        status: "subscribe_error",
        message: error.message,
      }));
    }
  });
});

client.on("reconnect", () =>
  console.log(JSON.stringify({ service: "bigcalm-mqtt-bridge", status: "reconnecting" })),
);
client.on("close", () =>
  console.log(JSON.stringify({ service: "bigcalm-mqtt-bridge", status: "disconnected" })),
);
client.on("error", (error) =>
  console.error(JSON.stringify({
    service: "bigcalm-mqtt-bridge",
    status: "mqtt_error",
    message: error.message,
  })),
);

client.on("message", async (messageTopic, buffer) => {
  try {
    if (buffer.byteLength > 16_384) throw new Error("PAYLOAD_TOO_LARGE");

    const deviceKey = extractDeviceKey(messageTopic);
    if (!deviceKey) return;

    const incoming = JSON.parse(buffer.toString("utf8"));
    const body = normalizePayload(deviceKey, incoming);
    const result = await persistTelemetry(body);

    console.log(JSON.stringify({
      service: "bigcalm-mqtt-bridge",
      status: "telemetry_forwarded",
      deviceKey,
      metrics: result.metrics,
      event: result.event,
    }));
  } catch (error) {
    console.error(JSON.stringify({
      service: "bigcalm-mqtt-bridge",
      status: "message_error",
      message: error instanceof Error ? error.message : "unknown_error",
    }));
  }
});

async function persistTelemetry(body) {
  const device = await sql`
    SELECT id, home_id, name
    FROM devices
    WHERE device_key = ${body.deviceKey}
    LIMIT 1
  `;

  if (!device[0]) throw new Error("DEVICE_NOT_FOUND");

  const state = isRecord(body.state) ? body.state : {};
  const readings = isRecord(body.readings) ? body.readings : {};
  const event = isRecord(body.event) ? body.event : null;

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

  const normalizedReadings = {};
  for (const [metric, rawValue] of Object.entries(readings)) {
    if (!allowedMetrics.has(metric)) continue;
    if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) continue;

    normalizedReadings[metric] = rawValue;
    const unit = metric === "temperature" ? "°C" : metric === "power" ? "kW" : "%";

    await sql`
      INSERT INTO telemetry (device_id, metric, numeric_value, unit)
      VALUES (${device[0].id}, ${metric}, ${rawValue}, ${unit})
    `;
  }

  let normalizedEvent = null;
  if (event) {
    const severity = typeof event.severity === "string" && ["info", "warning", "critical"].includes(event.severity)
      ? event.severity
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

  const realtimeState = {
    status,
    ...(battery === null ? {} : { batteryPercent: battery }),
    ...(typeof state.value === "string" ? { value: state.value.slice(0, 120) } : {}),
    ...(typeof state.label === "string" ? { label: state.label.slice(0, 120) } : {}),
  };

  await sql`
    SELECT pg_notify(
      'bigcalm_events',
      ${JSON.stringify({
        type: "telemetry",
        deviceId: device[0].id,
        deviceKey: body.deviceKey,
        deviceName: device[0].name,
        readings: normalizedReadings,
        state: realtimeState,
        event: normalizedEvent
          ? { ...normalizedEvent, timestamp: new Date().toISOString() }
          : null,
        occurredAt: new Date().toISOString(),
      })}
    )
  `;

  return {
    metrics: Object.keys(normalizedReadings),
    event: Boolean(normalizedEvent),
  };
}

function normalizePayload(deviceKey, value) {
  if (!isRecord(value)) throw new Error("INVALID_JSON_OBJECT");

  return {
    deviceKey,
    readings: isRecord(value.readings) ? value.readings : value,
    state: isRecord(value.state) ? value.state : undefined,
    event: isRecord(value.event) ? value.event : undefined,
  };
}

function extractDeviceKey(messageTopic) {
  const parts = messageTopic.split("/");
  return parts.length === 3 && parts[0] === "bigcalm" && parts[2] === "telemetry"
    ? parts[1].trim().slice(0, 120)
    : null;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mqttUrl() {
  if (process.env.BIGCALM_MQTT_URL) return process.env.BIGCALM_MQTT_URL;
  const host = required("BIGCALM_MQTT_HOST");
  const port = required("BIGCALM_MQTT_PORT");
  return `ws://${host}:${port}/mqtt`;
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function shutdown() {
  client.end(false, {}, () => healthServer.close(() => process.exit(0)));
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
