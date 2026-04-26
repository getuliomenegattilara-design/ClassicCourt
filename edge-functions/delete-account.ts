// Edge Function: delete-account
// Deleta o usuario da Auth do Supabase e anonimiza o registro em `jogadores`.
// Atende requisito Apple Guideline 5.1.1(v) - exclusao real de conta.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(status: number, body: object) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }
    if (req.method !== "POST") {
      return jsonResponse(405, { error: "Use POST" });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL) return jsonResponse(500, { error: "SUPABASE_URL ausente no ambiente" });
    if (!SERVICE_ROLE_KEY) return jsonResponse(500, { error: "SUPABASE_SERVICE_ROLE_KEY ausente no ambiente" });

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return jsonResponse(401, { error: "Sem token de autenticacao" });
    }

    let admin;
    try {
      admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
    } catch (e) {
      return jsonResponse(500, { error: "Falha ao criar admin client", detail: String(e) });
    }

    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr) {
      return jsonResponse(401, { error: "Token invalido", detail: userErr.message });
    }
    if (!userData?.user) {
      return jsonResponse(401, { error: "Usuario nao encontrado pelo token" });
    }

    const userId = userData.user.id;
    console.log("delete-account: iniciando para user_id", userId);

    // 1) Anonimiza registro em jogadores (preserva historico de partidas).
    //    CRITICO: precisa setar user_id=null pra FK liberar o delete do auth user.
    //    Se UPDATE completo falhar (coluna inexistente), faz fallback campo a campo.
    const camposAnonimos: Record<string, unknown> = {
      nome: "Conta excluida",
      apelido: null,
      email: null,
      telefone: null,
      foto_url: null,
      caracteristicas: null,
      fofoqueiro: false,
      user_id: null,
    };

    let anonimizou = false;
    try {
      const { error: updErr } = await admin
        .from("jogadores")
        .update(camposAnonimos)
        .eq("user_id", userId);
      if (!updErr) {
        anonimizou = true;
      } else {
        console.error("UPDATE completo falhou:", updErr);
      }
    } catch (e) {
      console.error("excecao UPDATE completo:", e);
    }

    // Fallback: tenta campo a campo, ignorando os que nao existem
    if (!anonimizou) {
      console.log("Aplicando fallback campo a campo");
      for (const [campo, valor] of Object.entries(camposAnonimos)) {
        try {
          const { error: e1 } = await admin
            .from("jogadores")
            .update({ [campo]: valor })
            .eq("user_id", userId);
          if (e1) {
            console.warn(`campo '${campo}' falhou:`, e1.message);
          }
        } catch (e) {
          console.warn(`excecao campo '${campo}':`, e);
        }
      }
    }

    // Verifica que user_id foi efetivamente nulo (critico pro delete do auth)
    const { data: jogadorPos } = await admin
      .from("jogadores")
      .select("id,user_id")
      .eq("user_id", userId);
    if (jogadorPos && jogadorPos.length > 0) {
      return jsonResponse(500, {
        error: "Falha ao desvincular jogador do auth user",
        detail: "user_id ainda aponta pro user, FK bloquearia delete",
      });
    }

    // 2) Deleta o auth user (irreversivel)
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) {
      console.error("deleteUser falhou:", delErr);
      return jsonResponse(500, {
        error: "Falha ao deletar auth user",
        detail: delErr.message,
      });
    }

    // 3) Log
    try {
      await admin.from("logs").insert({
        origem: "conta",
        mensagem: "Conta excluida (Auth + anonimizacao)",
        dados: { user_id: userId },
      });
    } catch {}

    return jsonResponse(200, { ok: true });
  } catch (e) {
    console.error("Excecao geral:", e);
    return jsonResponse(500, {
      error: "Excecao na function",
      detail: String(e?.message || e),
      stack: String(e?.stack || "").substring(0, 500),
    });
  }
});
