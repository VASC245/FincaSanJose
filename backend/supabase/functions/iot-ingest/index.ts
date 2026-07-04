// ============================================================
// supabase/functions/iot-ingest/index.ts
// Endpoint de ingesta para dispositivos IoT:
//   POST /iot-ingest/readings  → lecturas de collares (batch)
//   POST /iot-ingest/events    → eventos de cámaras
//   POST /iot-ingest/heartbeat → señal de vida + batería
//
// Autenticación: header "x-device-key" con el API key del
// dispositivo. Se compara contra iot_devices.api_key_hash
// (sha256). La función corre con service_role, por lo que los
// dispositivos nunca tocan la base de datos directamente.
//
// Desplegar con: supabase functions deploy iot-ingest --no-verify-jwt
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface Device {
  id: string;
  device_type: string;
  animal_id: string | null;
  active: boolean;
}

async function authenticateDevice(
  supabase: SupabaseClient,
  req: Request
): Promise<Device | null> {
  const key = req.headers.get("x-device-key");
  if (!key) return null;
  const hash = await sha256Hex(key);
  const { data } = await supabase
    .from("iot_devices")
    .select("id, device_type, animal_id, active")
    .eq("api_key_hash", hash)
    .eq("active", true)
    .maybeSingle();
  return (data as Device) ?? null;
}

// ── Lecturas de collar (acepta 1 o varias) ───────────────────
interface ReadingInput {
  recorded_at: string; // ISO 8601
  reading_type: "activity" | "rumination" | "temperature" | "gps" | "rest" | "battery";
  value?: number;
  lat?: number;
  lng?: number;
  payload?: Record<string, unknown>;
}

async function handleReadings(supabase: SupabaseClient, device: Device, body: unknown) {
  const readings: ReadingInput[] = Array.isArray(body) ? body : [body as ReadingInput];
  if (readings.length === 0 || readings.length > 500) {
    return json({ error: "Se aceptan entre 1 y 500 lecturas por petición." }, 400);
  }
  for (const r of readings) {
    if (!r.recorded_at || !r.reading_type) {
      return json({ error: "Cada lectura requiere recorded_at y reading_type." }, 400);
    }
  }

  const rows = readings.map((r) => ({
    device_id: device.id,
    animal_id: device.animal_id,
    recorded_at: r.recorded_at,
    reading_type: r.reading_type,
    value: r.value ?? null,
    lat: r.lat ?? null,
    lng: r.lng ?? null,
    payload: r.payload ?? {},
  }));

  const { error } = await supabase.from("sensor_readings").insert(rows);
  if (error) return json({ error: error.message }, 500);

  // Reglas simples de alerta (se pueden refinar con más historia)
  const fever = readings.find((r) => r.reading_type === "temperature" && (r.value ?? 0) >= 39.5);
  if (fever && device.animal_id) {
    await supabase.from("iot_alerts").insert({
      source: "collar",
      device_id: device.id,
      animal_id: device.animal_id,
      alert_type: "fever",
      severity: "critical",
      message: `Temperatura alta (${fever.value}°C) detectada por collar.`,
    });
  }
  const lowBattery = readings.find((r) => r.reading_type === "battery" && (r.value ?? 100) <= 15);
  if (lowBattery) {
    await supabase.from("iot_alerts").insert({
      source: "collar",
      device_id: device.id,
      animal_id: device.animal_id,
      alert_type: "low_battery",
      severity: "warning",
      message: `Batería del collar al ${lowBattery.value}%.`,
    });
  }

  await supabase
    .from("iot_devices")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", device.id);

  return json({ ok: true, inserted: rows.length });
}

// ── Eventos de cámara ────────────────────────────────────────
interface CameraEventInput {
  event_type: "motion" | "intrusion" | "animal_down" | "farrowing" | "feeding_anomaly" | "offline" | "other";
  severity?: "info" | "warning" | "critical";
  occurred_at: string;
  clip_url?: string;
  payload?: Record<string, unknown>;
}

async function handleEvents(supabase: SupabaseClient, device: Device, body: unknown) {
  const ev = body as CameraEventInput;
  if (!ev?.event_type || !ev?.occurred_at) {
    return json({ error: "event_type y occurred_at son obligatorios." }, 400);
  }

  const severity = ev.severity ?? (ev.event_type === "intrusion" ? "critical" : "info");

  const { error } = await supabase.from("camera_events").insert({
    device_id: device.id,
    event_type: ev.event_type,
    severity,
    occurred_at: ev.occurred_at,
    clip_url: ev.clip_url ?? null,
    payload: ev.payload ?? {},
  });
  if (error) return json({ error: error.message }, 500);

  if (severity === "critical" || ev.event_type === "farrowing") {
    await supabase.from("iot_alerts").insert({
      source: "camera",
      device_id: device.id,
      alert_type: ev.event_type,
      severity,
      message: `Cámara reportó: ${ev.event_type} a las ${ev.occurred_at}.`,
    });
  }

  await supabase
    .from("iot_devices")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", device.id);

  return json({ ok: true });
}

// ── Heartbeat ────────────────────────────────────────────────
async function handleHeartbeat(supabase: SupabaseClient, device: Device, body: unknown) {
  const { battery_pct } = (body ?? {}) as { battery_pct?: number };
  const update: Record<string, unknown> = { last_seen_at: new Date().toISOString() };
  if (typeof battery_pct === "number") update.battery_pct = battery_pct;
  const { error } = await supabase.from("iot_devices").update(update).eq("id", device.id);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
}

// ── Router ───────────────────────────────────────────────────
serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ error: "Configuración incompleta." }, 500);
  const supabase = createClient(supabaseUrl, serviceKey);

  const device = await authenticateDevice(supabase, req);
  if (!device) return json({ error: "Dispositivo no autorizado." }, 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido." }, 400);
  }

  const path = new URL(req.url).pathname.split("/").pop();
  switch (path) {
    case "readings":  return handleReadings(supabase, device, body);
    case "events":    return handleEvents(supabase, device, body);
    case "heartbeat": return handleHeartbeat(supabase, device, body);
    default:          return json({ error: "Ruta desconocida. Usa /readings, /events o /heartbeat." }, 404);
  }
});
