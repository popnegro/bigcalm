import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ensureDatabase, getDatabase } from "./_lib/database.js";
import { cors, json, method } from "./_lib/http.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (method(req) !== "GET") return json(res, 405, { error: "METHOD_NOT_ALLOWED" });

  const sql = getDatabase();
  if (!sql) {
    return json(res, 503, {
      ok: false,
      database: "not_configured",
      service: "bigcalm-api",
    });
  }

  try {
    await ensureDatabase(sql);
    await sql`SELECT 1`;
    return json(res, 200, {
      ok: true,
      database: "connected",
      service: "bigcalm-api",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("bigcalm.health", error);
    return json(res, 503, {
      ok: false,
      database: "unavailable",
      service: "bigcalm-api",
    });
  }
}
