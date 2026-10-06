import type { VercelRequest, VercelResponse } from "@vercel/node";

export function method(req: VercelRequest): string {
  return (req.method ?? "GET").toUpperCase();
}

export function json(res: VercelResponse, status: number, body: unknown): VercelResponse {
  res.status(status).setHeader("Cache-Control", "no-store").json(body);
  return res;
}

export function cors(res: VercelResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "same-origin");
  res.setHeader("Vary", "Origin");
}
