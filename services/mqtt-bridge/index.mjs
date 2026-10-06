import mqtt from "mqtt";

const brokerUrl = required("BIGCALM_MQTT_URL");
const apiUrl = required("BIGCALM_API_URL").replace(/\/$/, "");
const ingestToken = required("BIGCALM_INGEST_TOKEN");
const topic = process.env.BIGCALM_MQTT_TOPIC ?? "bigcalm/+/telemetry";
const clientId = process.env.BIGCALM_MQTT_CLIENT_ID ?? `bigcalm-bridge-${process.pid}`;

const client = mqtt.connect(brokerUrl, {
  clientId,
  username: process.env.BIGCALM_MQTT_USERNAME,
  password: process.env.BIGCALM_MQTT_PASSWORD,
  protocolVersion: 5,
  clean: true,
  reconnectPeriod: 1_000,
  connectTimeout: 10_000,
  keepalive: 30,
});

client.on("connect", () => {
  console.log(JSON.stringify({ service: "bigcalm-mqtt-bridge", status: "connected", topic }));
  client.subscribe(topic, { qos: 1 }, (error) => {
    if (error) console.error(JSON.stringify({ service: "bigcalm-mqtt-bridge", status: "subscribe_error", message: error.message }));
  });
});

client.on("reconnect", () => console.log(JSON.stringify({ service: "bigcalm-mqtt-bridge", status: "reconnecting" })));
client.on("close", () => console.log(JSON.stringify({ service: "bigcalm-mqtt-bridge", status: "disconnected" })));
client.on("error", (error) => console.error(JSON.stringify({ service: "bigcalm-mqtt-bridge", status: "mqtt_error", message: error.message })));

client.on("message", async (messageTopic, buffer) => {
  try {
    if (buffer.byteLength > 16_384) throw new Error("PAYLOAD_TOO_LARGE");
    const deviceKey = extractDeviceKey(messageTopic);
    if (!deviceKey) return;
    const incoming = JSON.parse(buffer.toString("utf8"));
    const body = normalizePayload(deviceKey, incoming);

    const response = await fetch(apiUrl + "/api/telemetry", {
      method:"POST",
      headers:{ Authorization:`Bearer ${ingestToken}`, "Content-Type":"application/json" },
      body:JSON.stringify(body),
    });

    if (!response.ok) {
      const responseText = await response.text();
      console.error(JSON.stringify({ service:"bigcalm-mqtt-bridge", status:"api_error", httpStatus:response.status, deviceKey, response:responseText.slice(0,300) }));
      return;
    }

    console.log(JSON.stringify({ service:"bigcalm-mqtt-bridge", status:"telemetry_forwarded", deviceKey }));
  } catch (error) {
    console.error(JSON.stringify({ service:"bigcalm-mqtt-bridge", status:"message_error", message:error instanceof Error ? error.message : "unknown_error" }));
  }
});

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

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
    ? parts[1].trim().slice(0,120)
    : null;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function shutdown() {
  client.end(false, {}, () => process.exit(0));
}