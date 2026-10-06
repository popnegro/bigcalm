import { neon } from "@neondatabase/serverless";

export type Database = ReturnType<typeof neon>;

let initPromise: Promise<void> | null = null;

export function getDatabase(): Database | null {
  const url = process.env.DATABASE_URL;
  return url ? neon(url) : null;
}

export function ensureDatabase(sql: Database): Promise<void> {
  if (!initPromise) {
    initPromise = initialize(sql).catch((error) => {
      initPromise = null;
      throw error;
    });
  }
  return initPromise;
}

async function initialize(sql: Database): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS homes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      timezone TEXT NOT NULL DEFAULT 'America/Argentina/Mendoza',
      armed BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      home_id TEXT NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
      device_key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('sensor', 'camera', 'gateway')),
      room TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'online' CHECK (status IN ('online', 'offline', 'alert')),
      battery_percent NUMERIC(5,2),
      state JSONB NOT NULL DEFAULT '{}'::jsonb,
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS telemetry (
      id BIGSERIAL PRIMARY KEY,
      device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      metric TEXT NOT NULL,
      numeric_value NUMERIC(12,4) NOT NULL,
      unit TEXT,
      recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS events (
      id BIGSERIAL PRIMARY KEY,
      device_id TEXT REFERENCES devices(id) ON DELETE SET NULL,
      event_type TEXT NOT NULL,
      severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
      message TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS telemetry_device_metric_time_idx ON telemetry (device_id, metric, recorded_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS events_occurred_at_idx ON events (occurred_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS devices_home_idx ON devices (home_id)`;

  await sql`
    INSERT INTO homes (id, name, timezone, armed)
    VALUES ('home-main', 'Casa principal', 'America/Argentina/Mendoza', TRUE)
    ON CONFLICT (id) DO NOTHING
  `;

  const seedDevices = [
    ['gateway-01', 'Gateway principal', 'gateway', 'Entrada', 'online', null],
    ['door-front', 'Puerta principal', 'sensor', 'Entrada', 'online', 91],
    ['motion-living', 'Movimiento living', 'sensor', 'Living', 'online', 78],
    ['window-bed', 'Ventana dormitorio', 'sensor', 'Dormitorio', 'online', 84],
    ['smoke-kitchen', 'Humo cocina', 'sensor', 'Cocina', 'online', 88],
    ['water-laundry', 'Agua lavadero', 'sensor', 'Lavadero', 'online', 67],
    ['cam-patio', 'Cámara patio', 'camera', 'Exterior', 'online', null],
    ['cam-garage', 'Cámara cochera', 'camera', 'Exterior', 'online', null],
  ] as const;

  for (const [id, name, kind, room, status, battery] of seedDevices) {
    await sql`
      INSERT INTO devices (id, home_id, device_key, name, kind, room, status, battery_percent)
      VALUES (${id}, 'home-main', ${id}, ${name}, ${kind}, ${room}, ${status}, ${battery})
      ON CONFLICT (id) DO NOTHING
    `;
  }

  const defaultStates: Record<string, Record<string, string>> = {
    "gateway-01": { label: "LAN + Internet" },
    "door-front": { value: "Cerrada" },
    "motion-living": { value: "Sin movimiento" },
    "window-bed": { value: "Cerrada" },
    "smoke-kitchen": { value: "Normal" },
    "water-laundry": { value: "Seco" },
    "cam-patio": { value: "1080p / Live" },
    "cam-garage": { value: "1080p / Live" },
  };

  for (const [deviceId, state] of Object.entries(defaultStates)) {
    await sql`
      UPDATE devices
      SET state = CASE
        WHEN state = '{}'::jsonb THEN ${JSON.stringify(state)}::jsonb
        ELSE state
      END
      WHERE id = ${deviceId}
    `;
  }

  const seedMetrics = [
    ['gateway-01', 'temperature', 23.4, '°C'],
    ['gateway-01', 'humidity', 48, '%'],
    ['gateway-01', 'power', 1.24, 'kW'],
    ['gateway-01', 'wifi', 96, '%'],
  ] as const;

  for (const [deviceId, metric, value, unit] of seedMetrics) {
    await sql`
      INSERT INTO telemetry (device_id, metric, numeric_value, unit)
      SELECT ${deviceId}, ${metric}, ${value}, ${unit}
      WHERE NOT EXISTS (
        SELECT 1 FROM telemetry WHERE device_id = ${deviceId} AND metric = ${metric}
      )
    `;
  }

  await sql`
    INSERT INTO events (device_id, event_type, severity, message)
    SELECT 'motion-living', 'motion.detected', 'info', 'Movimiento detectado y confirmado'
    WHERE NOT EXISTS (SELECT 1 FROM events)
  `;
}
