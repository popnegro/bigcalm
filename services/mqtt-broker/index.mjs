import aedes from "aedes";
import http from "node:http";
import websocketStream from "websocket-stream";

const broker = aedes({
  authenticate(client, username, password, callback) {
    const user = username?.toString() ?? "";
    const pass = password?.toString() ?? "";

    if (user === process.env.BIGCALM_MQTT_BRIDGE_USER && pass === process.env.BIGCALM_MQTT_BRIDGE_PASSWORD) {
      client.user = "bridge";
      callback(null, true);
      return;
    }

    if (!user || !pass || pass !== process.env.BIGCALM_MQTT_DEVICE_PASSWORD) {
      callback(new Error("AUTH_FAILED"), false);
      return;
    }

    client.user = user;
    callback(null, true);
  },

  authorizePublish(client, packet, callback) {
    const topic = packet.topic;
    if (client.user === "bridge") return callback(null);
    const expected = "bigcalm/" + String(client.user).slice(0, 120) + "/telemetry";
    callback(null, topic === expected ? null : new Error("PUBLISH_NOT_ALLOWED"));
  },

  authorizeSubscribe(client, subscription, callback) {
    if (client.user === "bridge") return callback(null, subscription);
    callback(null, subscription.topic === "bigcalm/" + String(client.user).slice(0, 120) + "/commands" ? subscription : null);
  },
});

const port = Number(process.env.PORT ?? 10000);
const httpServer = http.createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify({ ok: true, service: "bigcalm-mqtt-broker", clients: broker.connectedClients }));
    return;
  }

  response.writeHead(404);
  response.end();
});

websocketStream.createServer({
  server: httpServer,
  perMessageDeflate: false,
}, (stream) => {
  broker.handle(stream);
});

broker.on("client", (client) => console.log(JSON.stringify({ service:"bigcalm-mqtt-broker", status:"client_connected", clientId:client.id })));
broker.on("clientDisconnect", (client) => console.log(JSON.stringify({ service:"bigcalm-mqtt-broker", status:"client_disconnected", clientId:client.id })));
broker.on("publish", (packet, client) => {
  if (client && packet.topic.startsWith("bigcalm/")) {
    console.log(JSON.stringify({ service:"bigcalm-mqtt-broker", status:"message", clientId:client.id, topic:packet.topic }));
  }
});

httpServer.listen(port, "0.0.0.0", () => {
  console.log(JSON.stringify({ service:"bigcalm-mqtt-broker", status:"ready", port, transport:"websocket" }));
});

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
function shutdown() {
  broker.close(() => httpServer.close(() => process.exit(0)));
}