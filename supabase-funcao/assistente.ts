// Sistema da loja · função "assistente" (Supabase Edge Function)
// Recebe a pergunta do sistema, confere se a pessoa está logada e repassa ao Claude.
// A chave da Anthropic fica no segredo ANTHROPIC_API_KEY do Supabase, nunca no site.
import Anthropic from "npm:@anthropic-ai/sdk@1.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const MODELOS: Record<string, string> = {
  quick: "claude-haiku-5-5", // modo "Rápido" no sistema
  default: "claude-opus-5-5", // modo "Completo" no sistema
};
const LIMITE_ENTRADA = 1_500_000; // caracteres por pergunta (dados da loja + conversa)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const erro = (status: number, code: string, message: string) =>
  new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

type Msg = { role: "user" | "assistant"; content: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return erro(405, "metodo", "Use POST.");

  // 1) só quem está logado e ativo no sistema
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return erro(401, "sem_login", "Entre no sistema de novo.");
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY") || req.headers.get("apikey") || "", // chave pública do projeto
    { global: { headers: { Authorization: auth } }, auth: { persistSession: false } },
  );
  const { data: papel, error: ePapel } = await sb.rpc("meu_papel");
  if (ePapel || !papel) return erro(401, "sem_login", "Entre no sistema de novo.");

  // 2) pergunta
  let corpo: { messages?: unknown; tier?: string; json?: boolean };
  try {
    corpo = await req.json();
  } catch {
    return erro(400, "pedido", "Pedido inválido.");
  }
  const msgs = Array.isArray(corpo.messages) ? corpo.messages as Msg[] : [];
  const valido = msgs.length > 0 && msgs.length <= 40 &&
    msgs.every((m) => (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string") &&
    msgs[msgs.length - 1].role === "user";
  if (!valido) return erro(400, "pedido", "Pedido inválido.");
  const tamanho = msgs.reduce((n, m) => n + m.content.length, 0);
  if (tamanho > LIMITE_ENTRADA) return erro(413, "grande", "Dados demais para uma pergunta.");

  const tier = corpo.tier === "quick" ? "quick" : "default";
  const model = MODELOS[tier];
  if (!Deno.env.get("ANTHROPIC_API_KEY")) {
    return erro(503, "sem_chave", "Falta configurar a chave da IA no Supabase.");
  }
  const client = new Anthropic();

  // 3) resposta aos poucos: uma linha JSON por pedaço de texto
  const enc = new TextEncoder();
  const corpoResposta = new ReadableStream({
    async start(ctrl) {
      const linha = (o: unknown) => ctrl.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      try {
        const params = {
          model,
          max_tokens: corpo.json ? 4000 : 16000,
          cache_control: { type: "ephemeral" as const },
          output_config: { effort: tier === "quick" ? "low" as const : "medium" as const },
          messages: msgs,
        };
        // no Opus, se a IA recusar por engano, o próprio servidor tenta de novo com outro modelo
        const stream = client.beta.messages.stream(
          model === "claude-opus-5-5"
            ? { ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" }
            : params,
        );
        req.signal.addEventListener("abort", () => stream.abort());
        stream.on("text", (delta: string) => linha({ t: delta }));
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") linha({ error: { code: "refused", message: "A IA não respondeu a esta pergunta." } });
        else linha({ done: true, stop: final.stop_reason, model: final.model });
      } catch (e) {
        const st = e instanceof Anthropic.APIError ? e.status : 0;
        const code = st === 401 ? "sem_chave" : st === 429 ? "rate_limited" : st === 400 && /credit|balance/i.test(String(e)) ? "sem_credito" : "upstream_error";
        linha({ error: { code, message: code === "sem_credito" ? "Sem crédito na conta da Anthropic." : "A IA não respondeu agora." } });
      } finally {
        ctrl.close();
      }
    },
  });
  return new Response(corpoResposta, {
    headers: { ...CORS, "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache" },
  });
});
