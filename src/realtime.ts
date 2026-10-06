import type { Device, HouseEvent, HomeMetrics } from "./types";

export interface RealtimeTelemetry {
  type: "telemetry";
  deviceId: string;
  deviceKey: string;
  deviceName: string;
  readings: Partial<Record<keyof HomeMetrics, number>>;
  state: {
    status?: Device["status"];
    batteryPercent?: number;
    value?: string;
    label?: string;
  };
  event: {
    type: string;
    severity: HouseEvent["severity"];
    message: string;
    timestamp: string;
  } | null;
  occurredAt: string;
}

interface RealtimeHandlers {
  onOpen: () => void;
  onTelemetry: (event: RealtimeTelemetry) => void;
  onError: () => void;
}

export function subscribeToRealtime({ onOpen, onTelemetry, onError }: RealtimeHandlers): () => void {
  const source = new EventSource("/api/events");

  source.addEventListener("open", onOpen);
  source.addEventListener("telemetry", (message) => {
    try {
      const payload = JSON.parse((message as MessageEvent<string>).data) as RealtimeTelemetry;
      if (payload.type === "telemetry" && typeof payload.deviceId === "string") onTelemetry(payload);
    } catch { onError(); }
  });
  source.addEventListener("error", onError);

  return () => source.close();
}