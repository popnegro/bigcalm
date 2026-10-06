INSERT INTO homes (id, name, timezone, armed)
VALUES ('home-main', 'Casa principal', 'America/Argentina/Mendoza', TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO devices (id, home_id, device_key, name, kind, room, status, battery_percent)
VALUES
  ('gateway-01','home-main','gateway-01','Gateway principal','gateway','Entrada','online',NULL),
  ('door-front','home-main','door-front','Puerta principal','sensor','Entrada','online',91),
  ('motion-living','home-main','motion-living','Movimiento living','sensor','Living','online',78),
  ('window-bed','home-main','window-bed','Ventana dormitorio','sensor','Dormitorio','online',84),
  ('smoke-kitchen','home-main','smoke-kitchen','Humo cocina','sensor','Cocina','online',88),
  ('water-laundry','home-main','water-laundry','Agua lavadero','sensor','Lavadero','online',67),
  ('cam-patio','home-main','cam-patio','Cámara patio','camera','Exterior','online',NULL),
  ('cam-garage','home-main','cam-garage','Cámara cochera','camera','Exterior','online',NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO telemetry (device_id, metric, numeric_value, unit)
SELECT device_id, metric, numeric_value, unit
FROM (VALUES
  ('gateway-01','temperature',23.4,'°C'),
  ('gateway-01','humidity',48,'%'),
  ('gateway-01','power',1.24,'kW'),
  ('gateway-01','wifi',96,'%')
) AS seed(device_id, metric, numeric_value, unit)
WHERE NOT EXISTS (
  SELECT 1 FROM telemetry t
  WHERE t.device_id = seed.device_id AND t.metric = seed.metric
);
