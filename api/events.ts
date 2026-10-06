import { Client } from "pg";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { cors, json, method } from "./_lib/http.js";

const CHANNEL = "bigcalm_events";
const HEARTBEAT_MS = 20_000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (method(req) !== "GET") return json(res, 405, { error: "METHOD_NOT_ALLOWED" });

  const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!connectionString) return json(res, 503, { error: "DATABASE_NOT_CONFIGURED" });

  const client = new Client({ connectionString });
  let closed = false;
  let heartbeat: NodeJS.Timeout | undefined;

  const cleanup = async () => {
    if (closed) return;
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    client.removeAllListeners("notification");
    try { await client.query("UNLISTEN " + CHANNEL); } catch { /* connection may already be closed */ }
    await client.end().catch(() => undefined);
  };

  req.on("close", () => void cleanup());

  try {
    await client.connect();
    await client.query("LISTEN " + CHANNEL);

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.write("event: ready\ndata: {\\"connected\\":true}\n\n");

    client.on("notification", (message) => {
      if (closed || !message.payload) return;
      try {
        JSON.parse(message.payload);
        res.write("event: telemetry\ndata: " + message.payload + "\n\n");
      } catch { /* never stream malformed payloads */ }
    });

    client.on("error", () => {
      if (!closed) res.end();
    });

    heartbeat = setInterval(() => {
      if (!closed) res.write(": heartbeat\n\n");
    }, HEARTBEAT_MS);
  } catch (error) {
    console.error("bigcalm.events", error);
    await cleanup();
    return json(res, 503, { error: "REALTIME_UNAVAILABLE" });
  }
}