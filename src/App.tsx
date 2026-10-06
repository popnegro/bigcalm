import { useEffect, useMemo, useState, type ReactNode } from "react";
import { initialDevices, initialEvents, initialMetrics } from "./data";
import { fetchRemoteState } from "./api-client";
import { subscribeToRealtime, type RealtimeTelemetry } from "./realtime";
import type { Device, HouseEvent, HomeMetrics, ViewId } from "./types";
import { clamp, nowLabel, severityLabel, statusLabel } from "./utils";

const navItems: { id: ViewId; label: string }[] = [
  { id: "dashboard", label: "Resumen" },
  { id: "devices", label: "Dispositivos" },
  { id: "events", label: "Eventos" },
  { id: "cameras", label: "Cámaras" },
];

function App() {
  const [view, setView] = useState<ViewId>(() => {
    const hash = window.location.hash.replace("#", "") as ViewId;
    return navItems.some((item) => item.id === hash) ? hash : "dashboard";
  });
  const [metrics, setMetrics] = useState<HomeMetrics>(initialMetrics);
  const [devices, setDevices] = useState<Device[]>(initialDevices);
  const [events, setEvents] = useState<HouseEvent[]>(initialEvents);
  const [armed, setArmed] = useState(() => window.localStorage.getItem("bigcalm-armed") !== "false");
  const [updatedAt, setUpdatedAt] = useState(nowLabel());
  const [remoteReady, setRemoteReady] = useState(false);

  const onlineCount = devices.filter((device) => device.status === "online").length;
  const alertCount = devices.filter((device) => device.status === "alert").length;
  const cameras = devices.filter((device) => device.kind === "camera");
  const houseStatus = alertCount > 0 ? "Revisar alertas" : armed ? "Protegida" : "Desarmada";
  const houseStatusTone = alertCount > 0 ? "danger" : armed ? "success" : "neutral";

  useEffect(() => { window.localStorage.setItem("bigcalm-armed", String(armed)); }, [armed]);

  useEffect(() => {
    const syncHash = () => {
      const next = window.location.hash.replace("#", "") as ViewId;
      if (navItems.some((item) => item.id === next)) setView(next);
    };
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const syncRemoteState = async () => {
      try {
        const state = await fetchRemoteState();
        if (cancelled) return;
        setMetrics(state.metrics);
        setDevices(state.devices);
        setEvents(state.events);
        setArmed(state.home.armed);
        setUpdatedAt(nowLabel());
        setRemoteReady(true);
      } catch {
        if (!cancelled) setRemoteReady(false);
      }
    };

    const applyRealtime = (payload: RealtimeTelemetry) => {
      setMetrics((current) => ({ ...current, ...payload.readings }));
      setDevices((current) => current.map((device) => {
        if (device.id !== payload.deviceId) return device;
        return {
          ...device,
          status: payload.state.status ?? device.status,
          battery: payload.state.batteryPercent ?? device.battery,
          value: payload.state.value ?? payload.state.label ?? device.value,
          lastSeen: "Ahora",
        };
      }));

      const incomingEvent = payload.event;
      if (incomingEvent) {
        setEvents((current) => [{
          id: "evt-" + payload.occurredAt,
          timestamp: nowLabel(),
          deviceId: payload.deviceId,
          deviceName: payload.deviceName,
          message: incomingEvent.message,
          severity: incomingEvent.severity,
        }, ...current].slice(0, 30));
      }

      setUpdatedAt(nowLabel());
      setRemoteReady(true);
    };

    const unsubscribe = subscribeToRealtime({
      onOpen: () => void syncRemoteState(),
      onTelemetry: applyRealtime,
      onError: () => undefined,
    });

    void syncRemoteState();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (remoteReady) return;

    const timer = window.setInterval(() => {
      setMetrics((current) => ({
        temperature: Number(clamp(current.temperature + (Math.random() - 0.5) * 0.6, 18, 30).toFixed(1)),
        humidity: Number(clamp(current.humidity + (Math.random() - 0.5) * 2, 35, 68).toFixed(0)),
        power: Number(clamp(current.power + (Math.random() - 0.5) * 0.12, 0.45, 2.4).toFixed(2)),
        wifi: Math.round(clamp(current.wifi + (Math.random() - 0.5) * 4, 80, 100)),
      }));
      setUpdatedAt(nowLabel());
      setDevices((current) => current.map((device) => {
        if (device.kind === "sensor" && Math.random() > 0.84) {
          const isMotion = device.id === "motion-living";
          const isDoor = device.id === "door-front";
          const toggled = isMotion ? Math.random() > 0.55 : isDoor ? Math.random() > 0.65 : Math.random() > 0.8;
          return {
            ...device,
            value: isMotion ? (toggled ? "Movimiento detectado" : "Sin movimiento") : isDoor ? (toggled ? "Abierta" : "Cerrada") : device.value,
            lastSeen: nowLabel(),
            status: "online",
          };
        }
        return { ...device, lastSeen: "Hace <1 min" };
      }));
    }, 4000);

    return () => window.clearInterval(timer);
  }, [remoteReady]);

  useEffect(() => { document.title = "BigCalm — " + houseStatus; }, [houseStatus]);

  const pushEvent = (device: Device, message: string, severity: HouseEvent["severity"] = "info") => {
    const event: HouseEvent = { id: "evt-" + Date.now(), timestamp: nowLabel(), deviceId: device.id, deviceName: device.name, message, severity };
    setEvents((current) => [event, ...current].slice(0, 30));
  };

  const simulateMotion = () => {
    const device = devices.find((item) => item.id === "motion-living");
    if (!device) return;
    setDevices((current) => current.map((item) => item.id === device.id ? { ...item, value: "Movimiento detectado", lastSeen: "Ahora", status: armed ? "alert" : "online" } : item));
    pushEvent(device, "Movimiento detectado en living", armed ? "warning" : "info");
  };

  const simulateDoor = () => {
    const device = devices.find((item) => item.id === "door-front");
    if (!device) return;
    const nextOpen = device.value !== "Abierta";
    setDevices((current) => current.map((item) => item.id === device.id ? { ...item, value: nextOpen ? "Abierta" : "Cerrada", lastSeen: "Ahora", status: nextOpen && armed ? "alert" : "online" } : item));
    pushEvent(device, nextOpen ? "Puerta principal abierta" : "Puerta principal cerrada", nextOpen && armed ? "warning" : "info");
  };

  const clearAlerts = () => {
    setDevices((current) => current.map((device) => device.status === "alert" ? { ...device, status: "online" } : device));
    const gateway = devices.find((device) => device.id === "gateway-01");
    if (gateway) pushEvent(gateway, "Alertas revisadas; sistema normalizado", "info");
  };

  const resetDemo = () => {
    setMetrics(initialMetrics); setDevices(initialDevices); setEvents(initialEvents); setArmed(true); setUpdatedAt(nowLabel()); window.location.hash = "dashboard";
  };

  const navigate = (next: ViewId) => { window.location.hash = next; };
  const deviceSummary = useMemo(() => ({ sensors: devices.filter((device) => device.kind === "sensor").length, cameras: cameras.length, online: onlineCount }), [cameras.length, devices, onlineCount]);

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand-lockup"><div className="brand-mark" aria-hidden="true"><span /></div><div><strong>BigCalm</strong><small>Monitoreo doméstico</small></div></div>
      <nav className="main-nav" aria-label="Navegación principal">{navItems.map((item) => <button key={item.id} className={view === item.id ? "nav-button active" : "nav-button"} onClick={() => navigate(item.id)}>{item.label}</button>)}</nav>
      <div className="topbar-actions"><div className="connection-pill"><span className="dot online" /> {remoteReady ? "API conectada" : "Modo demo local"}</div><button className={armed ? "arm-button armed" : "arm-button"} onClick={() => setArmed((current) => !current)} aria-pressed={armed}>{armed ? "Casa protegida" : "Sistema desarmado"}</button></div>
    </header>
    <main className="page">
      <section className="hero"><div><p className="eyebrow">Estado de la vivienda</p><div className="hero-row"><h1>{houseStatus}</h1><span className={"status-badge " + houseStatusTone}><span className="dot" />{houseStatus}</span></div><p className="muted">Última sincronización: {updatedAt} · {onlineCount}/{devices.length} dispositivos en línea.</p></div><div className="hero-actions"><button className="button primary" onClick={simulateMotion}>Simular movimiento</button><button className="button secondary" onClick={simulateDoor}>Abrir/cerrar puerta</button></div></section>
      {view === "dashboard" && <>
        <section className="metric-grid" aria-label="Métricas de la casa"><MetricCard label="Temperatura" value={metrics.temperature.toFixed(1) + "°"} detail="Interior" /><MetricCard label="Humedad" value={metrics.humidity + "%"} detail="Interior" /><MetricCard label="Consumo" value={metrics.power.toFixed(2) + " kW"} detail="Instantáneo" /><MetricCard label="Wi‑Fi" value={metrics.wifi + "%"} detail="Calidad de enlace" /></section>
        <section className="grid-two"><Panel title="Sensores" subtitle={deviceSummary.sensors + " sensores · " + deviceSummary.online + " conectados"} action={<button className="text-button" onClick={() => navigate("devices")}>Ver todos</button>}><div className="device-list">{devices.filter((device) => device.kind !== "camera").map((device) => <DeviceRow key={device.id} device={device} />)}</div></Panel><Panel title="Actividad reciente" subtitle="Eventos más nuevos" action={<button className="text-button" onClick={() => navigate("events")}>Historial</button>}><div className="event-list">{events.slice(0, 5).map((event) => <EventRow key={event.id} event={event} />)}</div></Panel></section>
        <section className="grid-two"><Panel title="Cámaras" subtitle={deviceSummary.cameras + " cámaras · streaming simulado"} action={<button className="text-button" onClick={() => navigate("cameras")}>Abrir cámaras</button>}><div className="camera-grid compact">{cameras.map((camera) => <CameraCard key={camera.id} camera={camera} compact />)}</div></Panel><Panel title="Controles de demo" subtitle="Acciones seguras para validar el PMV"><div className="demo-controls"><button className="control-card" onClick={simulateMotion}><span className="control-icon">M</span><span><strong>Movimiento</strong><small>Generar un evento</small></span></button><button className="control-card" onClick={simulateDoor}><span className="control-icon">P</span><span><strong>Puerta principal</strong><small>Cambiar estado</small></span></button><button className="control-card" onClick={clearAlerts}><span className="control-icon">✓</span><span><strong>Normalizar</strong><small>Resolver alertas demo</small></span></button><button className="control-card" onClick={resetDemo}><span className="control-icon">↺</span><span><strong>Restablecer demo</strong><small>Volver al estado inicial</small></span></button></div></Panel></section>
      </>}
      {view === "devices" && <section className="content-panel"><div className="section-heading"><div><p className="eyebrow">Inventario IoT</p><h2>Todos los dispositivos</h2></div><span className="count-chip">{devices.length} dispositivos</span></div><div className="device-table"><div className="device-table-head"><span>Dispositivo</span><span>Ubicación</span><span>Estado</span><span>Lectura</span><span>Último contacto</span></div>{devices.map((device) => <div className="device-table-row" key={device.id}><div className="device-name"><span className="kind-chip">{device.kind === "camera" ? "CAM" : device.kind === "gateway" ? "GW" : "SNS"}</span><strong>{device.name}</strong></div><span>{device.room}</span><span><span className={"status-inline " + device.status}><span className="dot" />{statusLabel(device.status)}</span></span><span>{device.value || "—"}{device.battery !== undefined ? " · " + device.battery + "% batería" : ""}</span><span className="muted">{device.lastSeen}</span></div>)}</div></section>}
      {view === "events" && <section className="content-panel"><div className="section-heading"><div><p className="eyebrow">Auditoría</p><h2>Historial de eventos</h2></div><span className="count-chip">{events.length} eventos</span></div><div className="event-list full">{events.map((event) => <EventRow key={event.id} event={event} />)}</div></section>}
      {view === "cameras" && <section className="content-panel"><div className="section-heading"><div><p className="eyebrow">Visualización</p><h2>Cámaras en vivo</h2></div><span className="count-chip">{cameras.length} streams</span></div><div className="camera-grid">{cameras.map((camera) => <CameraCard key={camera.id} camera={camera} />)}</div></section>}
    </main>
    <footer className="footer"><span>BigCalm PMV · {remoteReady ? "PostgreSQL activo" : "Telemetría local de respaldo"} · Sin acceso a hardware físico</span><span>Preparado para MQTT + WebSocket</span></footer>
  </div>;
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) { return <article className="metric-card"><div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className="metric-detail">{detail}</div></article>; }
function Panel({ title, subtitle, action, children }: { title: string; subtitle: string; action?: ReactNode; children: ReactNode }) { return <section className="panel"><div className="panel-heading"><div><h2>{title}</h2><p>{subtitle}</p></div>{action}</div>{children}</section>; }
function DeviceRow({ device }: { device: Device }) { return <div className="device-row"><div className="device-row-main"><span className={"device-indicator " + device.status}><span className="dot" /></span><div><strong>{device.name}</strong><small>{device.room}</small></div></div><div className="device-value"><strong>{device.value}</strong><small>{device.battery !== undefined ? device.battery + "% batería" : device.lastSeen}</small></div></div>; }
function EventRow({ event }: { event: HouseEvent }) { return <div className="event-row"><span className={"severity-marker " + event.severity} /><div className="event-row-main"><strong>{event.message}</strong><small>{event.deviceName}</small></div><div className="event-time"><span className="severity-label">{severityLabel(event.severity)}</span><time>{event.timestamp}</time></div></div>; }
function CameraCard({ camera, compact = false }: { camera: Device; compact?: boolean }) { return <article className={compact ? "camera-card compact" : "camera-card"}><div className="camera-surface"><div className="camera-sky" /><div className="camera-ground" /><div className="camera-home" /><span className="camera-live"><span className="dot" /> LIVE</span><span className="camera-time">{camera.lastSeen}</span></div><div className="camera-meta"><div><strong>{camera.name}</strong><small>{camera.room}</small></div><span>{camera.value}</span></div></article>; }

export default App;
