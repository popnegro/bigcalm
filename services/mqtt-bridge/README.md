# BigCalm MQTT Bridge

Servicio Node.js de larga duración que suscribe un broker MQTT y reenvía cada mensaje a POST /api/telemetry.

## Topic

bigcalm/{deviceKey}/telemetry

Ejemplo: bigcalm/gateway-01/telemetry

## Payload

{"readings":{"temperature":23.7,"humidity":46,"power":1.28,"wifi":96},"state":{"status":"online","batteryPercent":91,"value":"Normal"},"event":{"type":"motion.detected","severity":"warning","message":"Movimiento detectado"}}

El bridge requiere un broker MQTT real y credenciales del broker. BIGCALM_INGEST_TOKEN solo vive en el servicio y nunca se entrega al navegador.
