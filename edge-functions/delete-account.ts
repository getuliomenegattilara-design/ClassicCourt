// Edge Function: delete-account
// Deleta o usuario da Auth do Supabase e anonimiza o registro em `jogadores`.
// Atende requisito Apple Guideline 5.1.1(v) - exclusao real de conta.
//
// Requer SUPABASE_SERVICE_ROLE_KEY como env var (configurada via Supabase Dashboard).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Use POST" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return new Response(JSON.stringify({ error: "Sem token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Cliente admin (service role) para verificar token e fazer admin actions
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Valida o token e pega o user
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "Token invalido" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userId = userData.user.id;

  // 1) Anonimiza o registro em `jogadores` (preserva historico de partidas)
  try {
    await admin.from("jogadores").update({
      nome: "Conta excluida",
      apelido: null,
      email: null,
      telefone: null,
      foto_url: null,
      caracteristicas: null,
      ativo: false,
      fofoqueiro: false,
      user_id: null,
    }).eq("user_id", userId);
  } catch (e) {
    // Nao bloqueia delecao do auth se a tabela nao tiver alguma coluna
    console.error("anonimizacao jogadores falhou:", e);
  }

  // 2) Deleta o auth user (irreversivel)
  const { error: delErr } = await admin.auth.admin.deleteUser(userId);
  if (delErr) {
    return new Response(JSON.stringify({ error: "Falha ao deletar auth: " + delErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 3) Log opcional
  try {
    await admin.from("logs").insert({
      origem: "conta",
      mensagem: "Conta excluida (Auth + anonimizacao)",
      dados: { user_id: userId },
    });
  } catch {}

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
