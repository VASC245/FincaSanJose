// ============================================================
// supabase/functions/send-push/index.ts
// Envía notificaciones push (Web Push) a todos los teléfonos
// suscritos.
//
// Tipos de envío:
//   { "kind": "daily" }   → 6:00 am: tareas vencidas/hoy/mañana,
//                           partos próximos, retorno de celo,
//                           stock bajo
//   { "kind": "evening" } → 6:00 pm: leche de hoy sin registrar,
//                           gastos de hoy sin registrar, tareas
//                           de hoy sin completar
//   { "kind": "test" }    → prueba inmediata (todas las secciones)
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

interface AnimalRef {
  ear_tag: string | null;
  name: string | null;
  species: string;
}
const animalLabel = (a: AnimalRef | null) => a?.ear_tag ?? a?.name ?? "animal";
const speciesEmoji = (a: AnimalRef | null) => (a?.species === "pig" ? "🐷" : "🐄");

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
  const isMorning = kind === "daily" || kind === "test";
  const isEvening = kind === "evening" || kind === "test";

  // El cron puede reintentar: solo un envío por tipo por día
  if (kind === "daily" || kind === "evening") {
    const { data: already } = await supabase
      .from("push_log")
      .select("id")
      .eq("kind", kind)
      .eq("sent_date", today)
      .maybeSingle();
    if (already) return json({ ok: true, message: `Ya se envió la notificación "${kind}" de hoy.` });
  }

  // ── Recolectar datos (solo lo que aplica al tipo de envío) ──
  const [tasksRes, birthsRes, stockRes, heatRes, milkRes, gastosRes] = await Promise.all([
    supabase
      .from("tasks")
      .select("title, due_date, priority")
      .in("status", ["pending", "in_progress"])
      .not("due_date", "is", null)
      .lte("due_date", tomorrow)
      .order("due_date"),
    isMorning ? supabase.rpc("get_upcoming_births", { days_ahead: 3 }) : Promise.resolve({ data: [] }),
    isMorning ? supabase.rpc("get_low_stock_items") : Promise.resolve({ data: [] }),
    isMorning
      ? supabase
          .from("insemination_records")
          .select("insemination_date, heat_check_date, animal:animals(ear_tag, name, species)")
          .is("pregnancy_confirmed", null)
          .not("heat_check_date", "is", null)
          .lte("heat_check_date", today)
      : Promise.resolve({ data: [] }),
    isEvening
      ? supabase.from("milk_sessions").select("id").eq("recorded_date", today).limit(1)
      : Promise.resolve({ data: [] }),
    isEvening
      ? supabase.from("gastos").select("id").eq("fecha", today).limit(1)
      : Promise.resolve({ data: [] }),
  ]);

  const tasks = tasksRes.data ?? [];
  const overdue = tasks.filter((t) => t.due_date < today);
  const dueToday = tasks.filter((t) => t.due_date === today);
  const dueTomorrow = tasks.filter((t) => t.due_date === tomorrow);

  const lines: string[] = [];

  // ── Secciones de la mañana ───────────────────────────────
  if (isMorning) {
    if (overdue.length) lines.push(`⚠️ ${overdue.length} tarea(s) vencida(s): ${overdue.slice(0, 2).map((t) => t.title).join(", ")}${overdue.length > 2 ? "…" : ""}`);
    if (dueToday.length) lines.push(`📋 Hoy vence(n): ${dueToday.slice(0, 3).map((t) => t.title).join(", ")}${dueToday.length > 3 ? "…" : ""}`);
    if (dueTomorrow.length) lines.push(`🕐 Mañana: ${dueTomorrow.slice(0, 2).map((t) => t.title).join(", ")}${dueTomorrow.length > 2 ? "…" : ""}`);

    const births = (birthsRes.data ?? []) as { ear_tag: string | null; animal_name: string | null; species: string; days_remaining: number }[];
    for (const b of births) {
      const who = b.ear_tag ?? b.animal_name ?? "animal";
      const animal = b.species === "pig" ? "🐷 Cerda" : "🐄 Vaca";
      lines.push(b.days_remaining <= 0 ? `${animal} ${who}: ¡parto esperado HOY!` : `${animal} ${who}: parto en ${b.days_remaining} día(s)`);
    }

    // Retorno de celo: inseminadas cuya fecha de chequeo (día 21) ya llegó
    // y aún no se confirma ni descarta la preñez
    const heatChecks = (heatRes.data ?? []) as { insemination_date: string; heat_check_date: string; animal: AnimalRef | null }[];
    for (const h of heatChecks.slice(0, 4)) {
      lines.push(`${speciesEmoji(h.animal)} ${animalLabel(h.animal)}: verificar retorno de celo (inseminada el ${h.insemination_date}) — confirma o descarta la preñez en la app`);
    }
    if (heatChecks.length > 4) lines.push(`…y ${heatChecks.length - 4} hembra(s) más por verificar celo`);

    const lowStock = (stockRes.data ?? []) as { item_name: string }[];
    if (lowStock.length) lines.push(`📦 Stock bajo: ${lowStock.slice(0, 3).map((i) => i.item_name).join(", ")}${lowStock.length > 3 ? "…" : ""}`);
  }

  // ── Secciones de la tarde ────────────────────────────────
  if (isEvening) {
    const milkRegistered = (milkRes.data ?? []).length > 0;
    if (!milkRegistered) lines.push("🥛 Aún no registras la producción de leche de hoy");

    const gastosRegistered = (gastosRes.data ?? []).length > 0;
    if (!gastosRegistered) lines.push("💰 Recuerda registrar los gastos de hoy (si hubo compras)");

    if (kind === "evening" && dueToday.length) {
      lines.push(`📋 ${dueToday.length} tarea(s) de hoy sin completar: ${dueToday.slice(0, 3).map((t) => t.title).join(", ")}${dueToday.length > 3 ? "…" : ""}`);
    }
  }

  if (kind === "test" && lines.length === 0) {
    lines.push("✅ Notificación de prueba — todo al día, sin pendientes.");
  }
  if (lines.length === 0) {
    return json({ ok: true, message: "Sin pendientes — no se envió notificación." });
  }

  const titles: Record<string, string> = {
    daily: "🌄 Finca San José — Resumen del día",
    evening: "🌙 Finca San José — Cierre del día",
    test: "🔔 Prueba — Finca San José",
  };

  const payload = JSON.stringify({
    title: titles[kind] ?? titles.daily,
    body: lines.join("\n"),
    url: kind === "evening" ? "/cattle/milk" : "/tasks",
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

  if ((kind === "daily" || kind === "evening") && sent > 0) {
    await supabase.from("push_log").insert({
      kind,
      sent_date: today,
      message: lines.join(" | "),
      recipients: sent,
    });
  }

  return json({ ok: true, message: `Notificación enviada a ${sent} dispositivo(s).`, sent });
});
