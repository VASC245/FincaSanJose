// ============================================================
// supabase/functions/send-push/index.ts
// Envía notificaciones push (Web Push) a todos los teléfonos
// suscritos con un resumen de pendientes:
//   - tareas vencidas o que vencen hoy/mañana
//   - partos esperados en los próximos 3 días
//   - productos con stock bajo
//
// Invocación:
//   { "kind": "daily" } → cron diario (solo envía una vez al día)
//   { "kind": "test" }  → prueba inmediata desde la app
//
// Secretos requeridos: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
// Desplegar con: supabase functions deploy send-push --no-verify-jwt
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Fecha local de Colombia (UTC-5), formato YYYY-MM-DD
function bogotaDate(offsetDays = 0): string {
  const now = new Date(Date.now() - 5 * 3600_000 + offsetDays * 86_400_000);
  return now.toISOString().slice(0, 10);
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";

  if (!supabaseUrl || !serviceKey || !vapidPublic || !vapidPrivate) {
    return json({ error: "Faltan secretos de configuración (VAPID/Supabase)." }, 500);
  }

  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
  const supabase = createClient(supabaseUrl, serviceKey);

  let kind = "daily";
  try {
    const body = await req.json();
    if (body?.kind) kind = String(body.kind);
  } catch { /* body vacío → daily */ }

  const today = bogotaDate();
  const tomorrow = bogotaDate(1);

  // El cron puede reintentar: solo un envío "daily" por día
  if (kind === "daily") {
    const { data: already } = await supabase
      .from("push_log")
      .select("id")
      .eq("kind", "daily")
      .eq("sent_date", today)
      .maybeSingle();
    if (already) return json({ ok: true, message: "Ya se envió la notificación de hoy." });
  }

  // ── Recolectar pendientes ────────────────────────────────
  const [tasksRes, birthsRes, stockRes] = await Promise.all([
    supabase
      .from("tasks")
      .select("title, due_date, priority")
      .in("status", ["pending", "in_progress"])
      .not("due_date", "is", null)
      .lte("due_date", tomorrow)
      .order("due_date"),
    supabase.rpc("get_upcoming_births", { days_ahead: 3 }),
    supabase.rpc("get_low_stock_items"),
  ]);

  const tasks = tasksRes.data ?? [];
  const births = (birthsRes.data ?? []) as { ear_tag: string | null; animal_name: string | null; species: string; days_remaining: number }[];
  const lowStock = (stockRes.data ?? []) as { item_name: string }[];

  const overdue = tasks.filter((t) => t.due_date < today);
  const dueToday = tasks.filter((t) => t.due_date === today);
  const dueTomorrow = tasks.filter((t) => t.due_date === tomorrow);

  // ── Armar mensaje ────────────────────────────────────────
  const lines: string[] = [];
  if (overdue.length) lines.push(`⚠️ ${overdue.length} tarea(s) vencida(s): ${overdue.slice(0, 2).map((t) => t.title).join(", ")}${overdue.length > 2 ? "…" : ""}`);
  if (dueToday.length) lines.push(`📋 Hoy vence(n): ${dueToday.slice(0, 3).map((t) => t.title).join(", ")}${dueToday.length > 3 ? "…" : ""}`);
  if (dueTomorrow.length) lines.push(`🕐 Mañana: ${dueTomorrow.slice(0, 2).map((t) => t.title).join(", ")}${dueTomorrow.length > 2 ? "…" : ""}`);
  for (const b of births) {
    const who = b.ear_tag ?? b.animal_name ?? "animal";
    const animal = b.species === "cattle" ? "🐄 Vaca" : "🐷 Cerda";
    lines.push(b.days_remaining <= 0 ? `${animal} ${who}: ¡parto esperado HOY!` : `${animal} ${who}: parto en ${b.days_remaining} día(s)`);
  }
  if (lowStock.length) lines.push(`📦 Stock bajo: ${lowStock.slice(0, 3).map((i) => i.item_name).join(", ")}${lowStock.length > 3 ? "…" : ""}`);

  if (kind === "test" && lines.length === 0) {
    lines.push("✅ Notificación de prueba — todo al día, sin pendientes.");
  }
  if (lines.length === 0) {
    return json({ ok: true, message: "Sin pendientes — no se envió notificación." });
  }

  const payload = JSON.stringify({
    title: kind === "test" ? "🔔 Prueba — Finca San José" : "🌄 Finca San José — Resumen del día",
    body: lines.join("\n"),
    url: "/tasks",
    tag: `finca-${kind}-${today}`,
  });

  // ── Enviar a todos los teléfonos suscritos ───────────────
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth");

  if (!subs?.length) return json({ ok: false, message: "No hay teléfonos suscritos todavía." });

  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload
      );
      sent++;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      // 404/410 = suscripción muerta (app desinstalada) → limpiar
      if (status === 404 || status === 410) {
        await supabase.from("push_subscriptions").delete().eq("id", s.id);
      } else {
        console.error("Error enviando push:", status, (err as Error).message);
      }
    }
  }

  if (kind === "daily" && sent > 0) {
    await supabase.from("push_log").insert({
      kind: "daily",
      sent_date: today,
      message: lines.join(" | "),
      recipients: sent,
    });
  }

  return json({ ok: true, message: `Notificación enviada a ${sent} dispositivo(s).`, sent });
});
