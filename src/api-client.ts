import type { Device, HouseEvent, HomeMetrics } from "./types";

export interface RemoteHomeState {
  home: {
    id: string;
    name: string;
    timezone: string;
    armed: boolean;
  };
  metrics: HomeMetrics;
  devices: Device[];
  events: HouseEvent[];
  serverTime: string;
}

export async function fetchRemoteState(signal?: AbortSignal): Promise<RemoteHomeState> {
  const response = await fetch("/api/state", {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    throw new Error(`API_STATE_${response.status}`);
  }

  return response.json() as Promise<RemoteHomeState>;
}
