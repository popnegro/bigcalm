# bigcalm-serverless

PMV de monitoreo doméstico enfocado en una operación clara: saber si la casa está bien, qué cambió y qué requiere atención.

## PMV incluido

- Dashboard responsive.
- Temperatura, humedad, consumo y Wi-Fi.
- Inventario de sensores, cámaras y gateway.
- Historial de eventos con severidad.
- Cámaras de demostración con estado LIVE.
- Telemetría simulada en tiempo real.
- Simulación manual de movimiento y puerta.
- Estado protegido/desarmado persistido en localStorage.
- Headers básicos de seguridad para Vercel.
- CI de typecheck + build.

## Ejecutar

    npm install
    npm run dev

Validación:

    npm run check
    npm run build

## Arquitectura futura

Sensores/ESP32 y cámaras -> gateway doméstico -> HTTPS/MQTT -> API/event processor -> PostgreSQL/Neon -> WebSocket/SSE -> BigCalm UI.

El PMV no controla hardware real ni expone RTSP directamente a Internet. Antes de incorporar comandos de apertura, cerraduras o alarmas deben existir identidad, autorización, auditoría, rate limiting y gestión segura de credenciales.

## API real

La UI consulta `GET /api/state` cada 5 segundos. El backend usa `@neondatabase/serverless` y crea de forma idempotente las tablas base cuando existe `DATABASE_URL`.

### Endpoints

- `GET /api/health` — salud de la API y PostgreSQL.
- `GET /api/state` — casa, métricas, dispositivos y eventos recientes.
- `POST /api/telemetry` — ingestión autenticada de lecturas y eventos.

### Variables

- `DATABASE_URL` — connection string de Neon.
- `BIGCALM_INGEST_TOKEN` — token privado para dispositivos que envían telemetría.

Para producción, añadir autenticación de usuario para el dashboard y autorización por vivienda antes de exponer datos reales de una casa.

## Tiempo real

El dashboard obtiene un snapshot inicial con `GET /api/state` y después mantiene una conexión `EventSource` a `GET /api/events`.

El backend usa PostgreSQL `LISTEN/NOTIFY`: cada `POST /api/telemetry` persiste la lectura y publica un evento en el canal `bigcalm_events`. El navegador recibe únicamente los cambios, sin polling periódico. `EventSource` se reconecta automáticamente; al reconectar, el cliente vuelve a pedir el snapshot para recuperar estado perdido.

### MQTT

El servicio `services/mqtt-bridge` mantiene una conexión MQTT persistente, suscribe `bigcalm/+/telemetry` y reenvía cada mensaje autenticado a `/api/telemetry`.

Topic: `bigcalm/{deviceKey}/telemetry`

Variables del bridge: `BIGCALM_MQTT_URL`, `BIGCALM_MQTT_USERNAME`, `BIGCALM_MQTT_PASSWORD`, `BIGCALM_MQTT_TOPIC`, `BIGCALM_MQTT_CLIENT_ID`, `BIGCALM_API_URL`, `BIGCALM_INGEST_TOKEN`.

El broker MQTT debe ser un servicio persistente real; no se recomienda usar un broker público para datos domésticos. El token de ingestión nunca llega al navegador.

## Arquitectura de tiempo real

ESP32 → MQTT broker → `services/mqtt-bridge` → `POST /api/telemetry` → Neon PostgreSQL → `NOTIFY bigcalm_events` → `/api/events` (SSE) → Dashboard.

Se elige SSE para la UI porque el flujo navegador ← servidor es predominantemente unidireccional y conserva la reconexión nativa de `EventSource`. WebSockets quedan disponibles para una futura capa bidireccional (comandos, presencia, controladores).