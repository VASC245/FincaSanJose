// ============================================================
// supabase/functions/send-alerts/index.ts
// Edge Function: revisa stock mínimo y próximos partos
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ──────────────────────────────────────────────
// Tipos
// ──────────────────────────────────────────────
interface UpcomingBirth {
  animal_id: string;
  animal_name: string | null;
  ear_tag: string | null;
  species: "cattle" | "pig";
  expected_birth: string;
  days_remaining: number;
}

interface LowStockItem {
  item_id: string;
  item_name: string;
  category: string | null;
  quantity: number;
  min_quantity: number;
  unit: string;
}

interface AlertsResponse {
  upcoming_births: UpcomingBirth[];
  low_stock_items: LowStockItem[];
  generated_at: string;
  summary: {
    total_upcoming_births: number;
    total_low_stock_items: number;
  };
}

// ──────────────────────────────────────────────
// Headers CORS
// ──────────────────────────────────────────────
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// ──────────────────────────────────────────────
// Handler principal
// ──────────────────────────────────────────────
serve(async (req: Request): Promise<Response> => {
  // Preflight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders, status: 200 });
  }

  try {
    // Leer parámetro opcional ?days=N (default: 7)
    const url = new URL(req.url);
    const daysAhead = parseInt(url.searchParams.get("days") ?? "7", 10);

    if (isNaN(daysAhead) || daysAhead < 1 || daysAhead > 365) {
      return errorResponse(
        'El parámetro "days" debe ser un número entre 1 y 365.',
        400
      );
    }

    // Crear cliente Supabase con las variables de entorno del proyecto
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      return errorResponse(
        "Variables de entorno de Supabase no configuradas.",
        500
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // ── Consultar próximos partos ──────────────────────────
    const { data: birthsData, error: birthsError } = await supabase
      .rpc("get_upcoming_births", { days_ahead: daysAhead });

    if (birthsError) {
      console.error("Error al consultar próximos partos:", birthsError);
      return errorResponse("Error al consultar próximos partos.", 500);
    }

    // ── Consultar stock bajo ───────────────────────────────
    const { data: stockData, error: stockError } = await supabase
      .rpc("get_low_stock_items");

    if (stockError) {
      console.error("Error al consultar stock bajo:", stockError);
      return errorResponse("Error al consultar items con stock bajo.", 500);
    }

    const upcomingBirths: UpcomingBirth[] = birthsData ?? [];
    const lowStockItems: LowStockItem[] = stockData ?? [];

    const response: AlertsResponse = {
      upcoming_births: upcomingBirths,
      low_stock_items: lowStockItems,
      generated_at: new Date().toISOString(),
      summary: {
        total_upcoming_births: upcomingBirths.length,
        total_low_stock_items: lowStockItems.length,
      },
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno inesperado.";
    console.error("Error no controlado en send-alerts:", message);
    return errorResponse(message, 500);
  }
});

// ──────────────────────────────────────────────
// Helper: respuesta de error en JSON
// ──────────────────────────────────────────────
function errorResponse(message: string, status: number): Response {
  return new Response(
    JSON.stringify({ error: message }),
    {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    }
  );
}
