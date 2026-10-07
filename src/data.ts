import type { Device, HouseEvent, HomeMetrics } from "./types";

export const initialMetrics: HomeMetrics = {
  temperature: 23.4,
  humidity: 48,
  power: 1.24,
  wifi: 96,
};

export const initialDevices: Device[] = [
  { id: "gateway-01", name: "Gateway principal", kind: "gateway", room: "Entrada", status: "online", value: "LAN + Internet", lastSeen: "Ahora" },
  { id: "door-front", name: "Puerta principal", kind: "sensor", room: "Entrada", status: "online", battery: 91, value: "Cerrada", lastSeen: "Ahora" },
  { id: "motion-living", name: "Movimiento living", kind: "sensor", room: "Living", status: "online", battery: 78, value: "Sin movimiento", lastSeen: "Ahora" },
  { id: "window-bed", name: "Ventana dormitorio", kind: "sensor", room: "Dormitorio", status: "online", battery: 84, value: "Cerrada", lastSeen: "Ahora" },
  { id: "smoke-kitchen", name: "Humo cocina", kind: "sensor", room: "Cocina", status: "online", battery: 88, value: "Normal", lastSeen: "Ahora" },
  { id: "water-laundry", name: "Agua lavadero", kind: "sensor", room: "Lavadero", status: "online", battery: 67, value: "Seco", lastSeen: "Ahora" },
  { id: "cam-patio", name: "Cámara patio", kind: "camera", room: "Exterior", status: "online", value: "1080p / Live", lastSeen: "Ahora" },
  { id: "cam-garage", name: "Cámara cochera", kind: "camera", room: "Exterior", status: "online", value: "1080p / Live", lastSeen: "Ahora" }
];

export const initialEvents: HouseEvent[] = [
  { id: "evt-001", timestamp: "17:02", deviceId: "motion-living", deviceName: "Movimiento living", message: "Movimiento detectado y confirmado", severity: "info" },
  { id: "evt-002", timestamp: "16:48", deviceId: "door-front", deviceName: "Puerta principal", message: "Puerta cerrada", severity: "info" },
  { id: "evt-003", timestamp: "16:32", deviceId: "gateway-01", deviceName: "Gateway principal", message: "Conexión establecida", severity: "info" },
  { id: "evt-004", timestamp: "15:31", deviceId: "cam-patio", deviceName: "Cámara patio", message: "Cámara conectada al gateway", severity: "info" }
];
