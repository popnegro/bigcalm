import { Aedes } from "aedes";
import http from "node:http";
import { WebSocketServer, createWebSocketStream } from "ws";

const bridgeUser = required("BIGCALM_MQTT_BRIDGE_USER");
const bridgePassword = required("BIGCALM_MQTT_BRIDGE_PASSWORD");
const devicePassword = required("BIGCALM_MQTT_DEVICE_PASSWORD");
const port = Number(process.env.PORT ?? 10000);

const broker = await Aedes.createBroker({
  drainTimeout: 30_000,
  authenticate(client, username, password, callback) {
    const user = username?.toString() ?? "";
    const pass = password?.toString() ?? "";

    if (user === bridgeUser && pass === bridgePassword) {
      client.user = "bridge";
      callback(null, true);
      return;
    }

    if (!user || pass !== devicePassword) {
      callback(new Error("AUTH_FAILED"), false);
      return;
    }

    client.user = user.slice(0, 120);
    client.deviceKey = user.slice(0, 120);
    callback(null, true);
  },

  authorizePublish(client, packet, callback) {
    if (client.user === "bridge") {
      callback(null);
      return;
    }

    const expected = "bigcalm/" + String(client.deviceKey ?? client.user).slice(0, 120) + "/telemetry";
    callback(packet.topic === expected ? null : new Error("PUBLISH_NOT_ALLOWED"));
  },

  authorizeSubscribe(client, subscription, callback) {
    if (client.user === "bridge") {
      callback(null, subscription);
      return;
    }

    const expected = "bigcalm/" + String(client.deviceKey ?? client.user).slice(0, 120) + "/commands";
    callback(subscription.topic === expected ? null : new Error("SUBSCRIBE_NOT_ALLOWED"));
  },
});

const httpServer = http.createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, {
      "content-type": "application/json",
      "cache-control": "no-store",
    });
    response.end(JSON.stringify({
      ok: true,
      service: "bigcalm-mqtt-broker",
      clients: broker.connectedClients,
    }));
    return;
  }

  response.writeHead(404);
  response.end();
});

const wss = new WebSocketServer({
  server: httpServer,
  perMessageDeflate: false,
});

wss.on("connection", (websocket, request) => {
  const stream = createWebSocketStream(websocket);
  broker.handle(stream, request);
});

broker.on("client", (client) => {
  console.log(JSON.stringify({
    service: "bigcalm-mqtt-broker",
    status: "client_connected",
    clientId: client.id,
  }));
});

broker.on("clientDisconnect", (client) => {
  console.log(JSON.stringify({
    service: "bigcalm-mqtt-broker",
    status: "client_disconnected",
    clientId: client.id,
  }));
});

broker.on("publish", (packet, client) => {
  if (client && packet.topic.startsWith("bigcalm/")) {
    console.log(JSON.stringify({
      service: "bigcalm-mqtt-broker",
      status: "message",
      clientId: client.id,
      topic: packet.topic,
    }));
  }
});

httpServer.listen(port, "0.0.0.0", () => {
  console.log(JSON.stringify({
    service: "bigcalm-mqtt-broker",
    status: "ready",
    port,
    transport: "websocket",
  }));
});

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error("Missing environment variable: " + name);
  return value;
}

function shutdown() {
  broker.close(() => httpServer.close(() => process.exit(0)));
}
