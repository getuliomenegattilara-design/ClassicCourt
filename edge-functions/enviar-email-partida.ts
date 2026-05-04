// Edge Function: enviar-email-partida (Gmail SMTP via raw TCP)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as b64encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const GMAIL_USER = Deno.env.get("GMAIL_USER") ?? "getuliomenegattilara@gmail.com";
const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD") ?? "";

if (!GMAIL_APP_PASSWORD) {
  console.error("GMAIL_APP_PASSWORD nao configurada — email nao sera enviado");
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
};

async function sendGmail(to: string[], subject: string, html: string) {
  const conn = await Deno.connectTls({ hostname: "smtp.gmail.com", port: 465 });
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  async function read(): Promise<string> {
    const buf = new Uint8Array(4096);
    const n = await conn.read(buf);
    return decoder.decode(buf.subarray(0, n!));
  }

  async function write(cmd: string) {
    await conn.write(encoder.encode(cmd + "\r\n"));
  }

  await read(); // greeting
  await write("EHLO localhost");
  await read();
  await write("AUTH LOGIN");
  await read();
  await write(b64encode(encoder.encode(GMAIL_USER)));
  await read();
  await write(b64encode(encoder.encode(GMAIL_APP_PASSWORD)));
  await read();
  await write(`MAIL FROM:<${GMAIL_USER}>`);
  await read();
  for (const addr of to) {
    await write(`RCPT TO:<${addr}>`);
    await read();
  }
  await write("DATA");
  await read();

  const boundary = "----boundary" + Date.now();
  const msg = [
    `From: Classic Court <${GMAIL_USER}>`,
    `To: ${to.join(", ")}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset=utf-8`,
    ``,
    html,
    ``,
    `--${boundary}--`,
    `.`,
  ].join("\r\n");

  await conn.write(encoder.encode(msg + "\r\n"));
  await read();
  await write("QUIT");
  conn.close();
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { nomes, placar, vencedor, emails, tipo, comentario_ia } = await req.json();

    if (!emails || !emails.length) {
      return new Response(JSON.stringify({ error: "Sem destinatarios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tipoLabel = tipo === "simples" ? "Simples" : "Duplas";
    const emoji = tipo === "simples" ? "🎾" : "🤝";

    const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px">
      <div style="background:#2563EB;color:white;padding:16px 20px;border-radius:12px 12px 0 0;text-align:center">
        <div style="font-size:32px">${emoji}</div>
        <div style="font-size:18px;font-weight:bold;margin-top:4px">Classic Court</div>
        <div style="font-size:12px;opacity:0.8">Partida de ${tipoLabel}</div>
      </div>
      <div style="background:#F8FAFC;padding:20px;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 12px 12px">
        <div style="font-size:16px;font-weight:bold;color:#1E293B;margin-bottom:4px">
          ${nomes}
        </div>
        <div style="font-size:22px;font-weight:bold;color:#2563EB;margin-bottom:8px">
          ${placar}
        </div>
        <div style="font-size:14px;color:#16A34A;font-weight:bold;margin-bottom:12px">
          🏆 ${vencedor}
        </div>
        ${comentario_ia ? `<div style="background:#EFF6FF;padding:12px;border-radius:8px;font-size:13px;color:#334155;font-style:italic;border-left:3px solid #2563EB">${comentario_ia}</div>` : ""}
        <div style="margin-top:16px;text-align:center">
          <a href="https://getuliomenegattilara-design.github.io/ClassicCourt/"
             style="display:inline-block;background:#2563EB;color:white;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:13px">
            Abrir Classic Court
          </a>
        </div>
      </div>
    </div>`;

    await sendGmail(emails, `${emoji} ${nomes} — ${placar}`, html);

    return new Response(JSON.stringify({ ok: true, enviados: emails.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
