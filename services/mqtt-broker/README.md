# BigCalm MQTT Broker

Broker MQTT para PMV, expuesto mediante MQTT over WebSocket por HTTPS/WSS en Render.

Topic de telemetría: `bigcalm/{deviceKey}/telemetry`.

Los dispositivos autentican con `username=deviceKey` y `BIGCALM_MQTT_DEVICE_PASSWORD`. El broker solo permite a cada dispositivo publicar en su propio topic.

El bridge usa un usuario separado (`BIGCALM_MQTT_BRIDGE_USER`) con permiso para suscribirse a todos los topics de telemetría.

El transporte público es WSS porque Render entrega TLS al servicio HTTP. Aedes implementa MQTT 3.1/3.1.1 y soporte WebSocket. citeturn904634search1


## Render

El broker expone MQTT sobre WebSocket en `/mqtt` y un health check HTTP en `/health`. La Blueprint genera `BIGCALM_MQTT_BRIDGE_PASSWORD` y `BIGCALM_MQTT_DEVICE_PASSWORD` automáticamente; no deben versionarse.
