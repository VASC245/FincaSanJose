// ============================================================
// supabase/functions/ai-chat/index.ts
// Proxy seguro hacia la API de Anthropic para el asistente IA.
// La API key vive como secreto del servidor (ANTHROPIC_API_KEY)
// y nunca llega al navegador. El modelo, el system prompt y el
// límite de tokens se fuerzan aquí para que la función no pueda
// usarse como proxy genérico.
//
// El frontend envía: { messages, tools } y recibe la respuesta
// cruda de la API de Anthropic (content blocks + stop_reason).
//
// Costos: las herramientas + la parte fija del system prompt se
// cachean (se cobran ~10% en cada llamada después de la primera);
// la fecha de hoy va en un bloque aparte, después del caché, para
// no invalidarlo cada día. El último mensaje también se marca para
// que las vueltas de herramientas dentro de una misma pregunta
// reutilicen el caché.
//
// Desplegar con: supabase functions deploy ai-chat
// ============================================================

import Anthropic from "npm:@anthropic-ai/sdk@^0.100.1";

const MODEL = "claude-sonnet-5-5";
const MAX_TOKENS = 8000;
// Asistente de voz: respuestas rápidas y baratas. "low" piensa poco en
// preguntas simples y sigue encadenando herramientas cuando hace falta.
const EFFORT = "low";

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

// Fecha local (UTC-5), formato YYYY-MM-DD
function localToday(): string {
  return new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
}

function localWeekday(): string {
  const d = new Date(Date.now() - 5 * 3600_000);
  return ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"][d.getUTCDay()];
}

// Parte fija del system prompt — NO meter aquí nada que cambie entre
// llamadas (fecha, hora, ids), o se pierde el caché.
const STATIC_PROMPT = `Eres el asistente de la Finca San José, una finca de ganado lechero y cerdos. Te usan sobre todo por voz desde el celular, muchas veces en pleno trabajo (ordeño, corrales).

═══ CÓMO RESPONDER ═══
- Siempre en español sencillo, directo y corto: una o dos oraciones si se puede.
- Tus respuestas se leen en voz alta: escribe como se habla, en frases corridas. NO uses markdown, listas con guiones o números, tablas, asteriscos ni emojis. Si hay varios datos, dilos en una frase ("Junio dio 2.789 litros, julio 2.676 y agosto 2.857, el mejor mes").
- Si la lista es larga (más de 5 cosas), di lo más importante y el total ("Hay 21 animales atrasados con la desparasitación, los más atrasados son…").
- Di los números de forma natural y redondea cuando ayude ("unos 115 litros", "37 dólares con 50").
- Los montos de dinero están en DÓLARES (USD). Nunca digas pesos.
- Al registrar algo, confirma con los datos clave para que la persona note si la voz entendió mal ("Listo, anoté 115 litros para hoy").
- Si la persona dicta varias cosas en un mensaje, hazlas todas (puedes llamar varias herramientas a la vez) y confirma todo junto.
- Si no se dice fecha al REGISTRAR algo, es hoy. "Ayer", "el lunes", etc. calcúlalos a partir de la fecha de hoy.
- Al CONSULTAR: "en total", "desde siempre" o sin período en preguntas de totales = todo el historial (las herramientas con days aceptan un número grande, ej. 3650, o usa query_data sin filtro de fecha). Di siempre de qué período hablas.

═══ CÓMO BUSCAR ═══
- Nunca digas que no tienes un dato sin buscarlo antes. Usa la herramienta específica si existe; si no, usa query_data, que puede leer cualquier tabla con filtros, orden y totales (stats_columns / group_by para sumas y promedios — no sumes tú a mano listas largas).
- Para animales, el usuario dice el arete o el nombre ("la 7", "la Eva"). Las herramientas buscan primero coincidencia exacta. Si una herramienta responde que hay varios animales posibles, pregunta cuál.
- Las herramientas específicas ya aplican la lógica de la finca (descontar inventario, crear recordatorios, marcar vendidos). Úsalas para registrar; insert_record/update_record/delete_record solo para lo que no tenga herramienta propia o para corregir errores.
- BORRAR: antes de delete_record di exactamente qué vas a borrar y espera que la persona confirme en su siguiente mensaje. Nunca borres en el mismo turno en que lo propones.
- Para corregir un dato mal dictado ("no eran 150, eran 115"), busca el registro con query_data y usa update_record.

═══ TABLAS (para query_data) ═══
Todas tienen id (uuid) y created_at. Fechas en formato YYYY-MM-DD.
- animals: name, ear_tag (arete), species (cattle=bovino | pig=porcino), sex (male|female), birth_date, status (active|sold|deceased|culled), stage (solo cerdos: lactancia|destete|iniciacion|crecimiento|engorde|reproduccion; null en bovinos), mother_id, father_id, mother_name, father_name, notes
- cattle_details (1 por bovino): animal_id, is_pregnant, conception_date, expected_birth, last_birth_date, birth_count
- pig_details (1 por cerdo): animal_id, is_pregnant, service_date, expected_birth, litter_count
- calf_births: cow_id, calf_id, birth_date, notes
- litters (camadas de cerdas): sow_id, birth_date, total_born, born_alive, weaned_count, notes
- heat_records (celos): animal_id, observed_date, notes — ciclo de 21 días
- insemination_records: animal_id, insemination_date, semen_source (toro/pajuela), expected_birth, heat_check_date, pregnancy_confirmed (null=pendiente, true, false), pregnancy_confirmed_date, notes
- vaccination_records (vacunas y medicamentos aplicados): animal_id, vaccine_id, inventory_item_id, applied_date, next_date, applied_by, notes, milk_withdrawal_days, milk_withdrawal_until
- vaccines (catálogo): name, description, manufacturer, disease_target
- milk_sessions (leche total del hato por ordeño): recorded_date, liters, notes
- milk_records (leche por vaca): animal_id, recorded_date, liters, notes
- weight_records (pesajes): animal_id, recorded_date, weight_kg, notes
- bcs_records (condición corporal 1-5): animal_id, recorded_date, score, moment (secado|parto|servicio|destete|otro), notes
- inventory_categories: name, description
- inventory_items: name, category_id, quantity (stock actual), unit, min_quantity, description
- inventory_movements: item_id, type (in=entrada | out=salida), quantity, date, notes — un trigger actualiza el stock al insertar
- tasks: title, description, status (pending|in_progress|completed), priority (low|medium|high), category (health|feeding|maintenance|reproduction|other), due_date, animal_id
- gastos: fecha, monto (USD), descripcion, categoria (alimentacion|veterinaria|mantenimiento|equipos|combustible|personal|otro), foto_url
- ventas: fecha, monto (USD), tipo (leche|animal|otro), descripcion, cantidad, unidad, comprador, animal_id
- iot_alerts, sensor_readings, camera_events: datos de sensores (hoy vacíos)
Relaciones útiles en select de query_data: en tablas con animal_id usa "*, animal:animals(ear_tag,name)"; en vaccination_records "inventory_item:inventory_items(name,unit)"; en inventory_items "category:inventory_categories(name)"; en inventory_movements "item:inventory_items(name,unit)"; en litters "sow:animals!litters_sow_id_fkey(ear_tag,name)"; en calf_births "cow:animals!calf_births_cow_id_fkey(ear_tag,name), calf:animals!calf_births_calf_id_fkey(ear_tag,name,sex)".

═══ REGLAS DE LA FINCA ═══
- Gestación: bovinos 280 días, cerdas 114 días. Chequeo de retorno de celo a los 21 días de la inseminación.
- Inseminación o monta → register_insemination (crea chequeo del día 21 y una tarea). La preñez se confirma después con update_pregnancy si no hubo retorno de celo.
- Parto de vaca → register_cattle_birth (crea el ternero con su madre y el padre de la pajuela). Parto de cerda → register_litter.
- RETIRO DE LECHE: antibióticos y antiparasitarios tienen días de retiro. Pásalos en milk_withdrawal_days al aplicar. Si preguntan si se puede vender la leche, revisa get_milk_withdrawals.
- Engorde: meta de ganancia 600–900 g/día. Condición corporal ideal 3–3.5 en parto y secado; <2.5 flaca; >4 pasada.
- Destetados por cerda por año: meta ≥ 22.
- Venta de un animal → create_sale con animal_ear_tag (lo marca vendido). Para saber si la finca gana o pierde → get_finance_summary.
- "¿Qué toca hoy?" o "¿qué hay pendiente?" → get_work_list (y get_alerts para alertas).`;

function buildSystem(): Anthropic.Beta.Messages.BetaTextBlockParam[] {
  return [
    { type: "text", text: STATIC_PROMPT, cache_control: { type: "ephemeral" } },
    { type: "text", text: `HOY: ${localWeekday()} ${localToday()}` },
  ];
}

// Marca el último bloque del último mensaje para cachear la conversación
// hasta ese punto (sirve en las vueltas de herramientas de una pregunta).
// deno-lint-ignore no-explicit-any
function withMessageCache(messages: any[]): any[] {
  const out = messages.slice();
  const last = out[out.length - 1];
  if (!last) return out;
  if (typeof last.content === "string") {
    out[out.length - 1] = {
      ...last,
      content: [{ type: "text", text: last.content, cache_control: { type: "ephemeral" } }],
    };
  } else if (Array.isArray(last.content) && last.content.length > 0) {
    const blocks = last.content.slice();
    blocks[blocks.length - 1] = { ...blocks[blocks.length - 1], cache_control: { type: "ephemeral" } };
    out[out.length - 1] = { ...last, content: blocks };
  }
  return out;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "ANTHROPIC_API_KEY no configurada." }, 500);

  let body: { messages?: unknown[]; tools?: unknown[] };
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido." }, 400);
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return json({ error: "Se requiere el arreglo messages." }, 400);
  }
  if (body.messages.length > 80) {
    return json({ error: "Conversación demasiado larga — empieza un chat nuevo." }, 400);
  }

  const client = new Anthropic({ apiKey });

  try {
    // deno-lint-ignore no-explicit-any
    const params: any = {
      model: MODEL,
      max_tokens: MAX_TOKENS,
      output_config: { effort: EFFORT },
      system: buildSystem(),
      tools: Array.isArray(body.tools) ? body.tools : [],
      messages: withMessageCache(body.messages),
      // Si el modelo rechaza por un falso positivo de seguridad, la API
      // reintenta sola con el modelo de respaldo recomendado.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    };
    const response = await client.beta.messages.create(params);

    // Registro de consumo para vigilar costos (Supabase → Functions → Logs)
    const u = response.usage;
    console.log(JSON.stringify({
      stop: response.stop_reason,
      in: u?.input_tokens,
      cache_read: u?.cache_read_input_tokens,
      cache_write: u?.cache_creation_input_tokens,
      out: u?.output_tokens,
    }));

    return json(response);
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      const status = typeof e.status === "number" ? e.status : 502;
      // deno-lint-ignore no-explicit-any
      const message = (e.error as any)?.error?.message ?? e.message;
      console.error("anthropic error", status, message);
      return json({ error: message }, status);
    }
    console.error("ai-chat error", e);
    return json({ error: (e as Error).message ?? "Error desconocido." }, 500);
  }
});
