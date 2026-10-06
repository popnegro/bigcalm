import type { EventSeverity } from "./types";

export function nowLabel(): string {
  return new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit" }).format(new Date());
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function statusLabel(status: "online" | "offline" | "alert"): string {
  return status === "online" ? "En línea" : status === "offline" ? "Fuera de línea" : "Alerta";
}

export function severityLabel(severity: EventSeverity): string {
  return severity === "critical" ? "Crítico" : severity === "warning" ? "Atención" : "Informativo";
}
