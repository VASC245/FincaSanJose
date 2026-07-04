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
// Desplegar con: supabase functions deploy ai-chat
// ============================================================

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-5";
const MAX_TOKENS = 2048;

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
function bogotaToday(): string {
  return new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
}

function buildSystemPrompt(): string {
  const today = bogotaToday();
  return `Eres el asistente inteligente de la Finca San José, una finca agropecuaria en Colombia.
Respondes siempre en español, de forma directa y concisa. Tienes acceso completo a todos los datos de la finca y puedes consultar o registrar cualquier información.

HOY: ${today}

═══ DATOS DISPONIBLES ═══

ANIMALES (tabla: animals)
- Especies: cattle (bovinos), pig (porcinos)
- Estados: active, sold, deceased, culled
- Etapas bovinos: calf, heifer, cow, bull, steer
- Etapas porcinos: piglet, gilt, sow, boar, fattening

BOVINOS (tabla: cattle_details)
- Preñez: is_pregnant, conception_date, expected_birth, last_birth_date, birth_count
- Partos: tabla calf_births (cow_id, calf_id, birth_date)

PORCINOS (tabla: pig_details)
- Preñez: is_pregnant, service_date, expected_birth, litter_count
- Camadas: tabla litters (sow_id, birth_date, total_born, born_alive)
- Celos: tabla heat_records (animal_id, observed_date) — ciclo 21 días

INSEMINACIONES (tabla: insemination_records)
- Flujo: al reportarse una inseminación/monta usa register_insemination
  (crea el registro + chequeo de celo al día 21 + tarea recordatorio).
- La preñez se confirma ~21 días después si NO hubo retorno de celo:
  usa update_pregnancy con is_pregnant=true.
- Gestación: bovinos 280 días, porcinos 114 días.

VACUNAS / MEDICAMENTOS
- vaccination_records: aplicaciones por animal
- vaccines: catálogo de vacunas
- inventory_items: los productos se buscan aquí por nombre

INVENTARIO
- inventory_categories: categorías de productos
- inventory_items: nombre, cantidad, unidad, stock_mínimo
- inventory_movements: entradas (in) y salidas (out) — trigger actualiza stock automáticamente

PRODUCCIÓN DE LECHE
- milk_sessions: producción total del hato por ordeño
- milk_records: producción por vaca individual

TAREAS (tabla: tasks)
- Estados: pending, in_progress, completed
- Prioridades: low, medium, high
- Categorías: health, feeding, maintenance, reproduction, other

GASTOS (tabla: gastos)
- Campos: fecha, monto (COP), descripcion, categoria, foto_url
- Categorías: alimentacion, veterinaria, mantenimiento, equipos, combustible, personal, otro

═══ REGLAS ═══
- Si no se especifica fecha → usa hoy (${today})
- Para acciones, ejecútalas directamente y confirma lo hecho
- Si necesitas más datos para responder bien, usa la herramienta adecuada
- Sé conciso — una o dos oraciones por respuesta si es posible
- Los montos son en pesos colombianos (COP)`;
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
  if (body.messages.length > 60) {
    return json({ error: "Conversación demasiado larga — empieza un chat nuevo." }, 400);
  }

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: buildSystemPrompt(),
      tools: Array.isArray(body.tools) ? body.tools : [],
      messages: body.messages,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = (data as { error?: { message?: string } })?.error?.message ?? `HTTP ${res.status}`;
    return json({ error: message }, res.status);
  }
  return json(data);
});
