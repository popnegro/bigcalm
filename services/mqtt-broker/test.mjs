import assert from "node:assert/strict";
import http from "node:http";
import { Aedes } from "aedes";
import { WebSocketServer, createWebSocketStream } from "ws";
import mqtt from "mqtt";

const bridgeUser = "bridge";
const bridgePassword = "bridge-secret";
const devicePassword = "device-secret";
const port = 18990;

const broker = await Aedes.createBroker({
  authenticate(client, username, password, callback) {
    const user = username?.toString() ?? "";
    const pass = password?.toString() ?? "";

    if (user === bridgeUser && pass === bridgePassword) {
      client.user = "bridge";
      callback(null, true);
      return;
    }

    if (user.startsWith("device-") && pass === devicePassword) {
      client.user = user;
      client.deviceKey = user;
      callback(null, true);
      return;
    }

    callback(new Error("AUTH_FAILED"), false);
  },
  authorizePublish(client, packet, callback) {
    if (client.user === "bridge") return callback(null);

    const expected = `bigcalm/${String(client.deviceKey ?? client.user)}/telemetry`;
    callback(packet.topic === expected ? null : new Error("PUBLISH_NOT_ALLOWED"));
  },
});

const httpServer = http.createServer();
const wss = new WebSocketServer({ server: httpServer, perMessageDeflate: false });
wss.on("connection", (socket, request) => broker.handle(createWebSocketStream(socket), request));
await new Promise((resolve) => httpServer.listen(port, "127.0.0.1", resolve));

const connect = (options) => new Promise((resolve, reject) => {
  const client = mqtt.connect(`ws://127.0.0.1:${port}`, {
    ...options,
    protocolVersion: 4,
    reconnectPeriod: 0,
  });
  const timer = setTimeout(() => {
    client.end();
    reject(new Error("CONNECT_TIMEOUT"));
  }, 2500);
  client.once("connect", () => {
    clearTimeout(timer);
    resolve(client);
  });
  client.once("error", (error) => {
    clearTimeout(timer);
    reject(error);
  });
});

const invalid = await Promise.race([
  connect({ username: "device-01", password: "wrong" }).then(
    (client) => {
      client.end();
      return false;
    },
    () => true,
  ),
  new Promise((resolve) => setTimeout(() => resolve(true), 1200)),
]);
assert.equal(invalid, true, "invalid credentials must be rejected");

const bridge = await connect({ username: bridgeUser, password: bridgePassword });
const allowed = await connect({ username: "device-01", password: devicePassword });

let messages = 0;
bridge.subscribe("bigcalm/+/telemetry", { qos: 1 }, (error) => {
  if (error) throw error;
});
bridge.on("message", () => {
  messages += 1;
});

await new Promise((resolve, reject) => {
  allowed.publish("bigcalm/device-01/telemetry", JSON.stringify({ temperature: 24.2 }), { qos: 1 }, (error) => {
    if (error) reject(error);
    else resolve();
  });
});

await new Promise((resolve) => setTimeout(resolve, 200));
assert.equal(messages, 1, "authorized telemetry must reach bridge");

allowed.publish("bigcalm/device-02/telemetry", JSON.stringify({ temperature: 99 }), { qos: 1 });
await new Promise((resolve) => setTimeout(resolve, 300));
assert.equal(messages, 1, "cross-device telemetry must be blocked");

allowed.end();
bridge.end();
await new Promise((resolve) => broker.close(() => httpServer.close(resolve)));

console.log(JSON.stringify({
  validAuth: true,
  invalidAuthRejected: true,
  authorizedPublishDelivered: true,
  crossDevicePublishBlocked: true,
}));
