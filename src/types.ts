export type DeviceKind = "sensor" | "camera" | "gateway";
export type DeviceStatus = "online" | "offline" | "alert";
export type EventSeverity = "info" | "warning" | "critical";

export interface Device {
  id: string;
  name: string;
  kind: DeviceKind;
  room: string;
  status: DeviceStatus;
  battery?: number;
  value?: string;
  lastSeen: string;
}

export interface HomeMetrics {
  temperature: number;
  humidity: number;
  power: number;
  wifi: number;
}

export interface HouseEvent {
  id: string;
  timestamp: string;
  deviceId: string;
  deviceName: string;
  message: string;
  severity: EventSeverity;
}

export type ViewId = "dashboard" | "devices" | "events" | "cameras";
