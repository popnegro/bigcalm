# BigCalm

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
