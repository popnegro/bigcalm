import type { VercelResponse } from "@vercel/node";

export function json(res: VercelResponse, status: number, body: unknown): VercelResponse {
  res.status(status).setHeader("Cache-Control", "no-store").json(body);
  return res;
}

export function cors(res: VercelResponse): void {
  res.setHeader("Vary", "Origin");
}
