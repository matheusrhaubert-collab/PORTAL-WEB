// sahra-fluxo — Edge Function (Supabase / Deno), 2026-11-07
// IA da tela "Fluxo da SAHRA" (sahra-fluxo.html, aberta pelo botão "SAHRA · Fluxo",
// js/portal-38-sahra-fluxo.js). SÓ ADMIN: confere is_admin() com o token de quem
// chamou (403 pros outros). Função NOVA e separada: não toca na sahra-chat nem em
// nenhuma outra.
//
// Ações (corpo JSON):
//   { acao: 'json', prompt, images?: [{mime, data(base64)}], modo?: 'leve'|'profundo' }
//       → { data, model }   texto do prompt → objeto JSON (Gemini Flash)
//   { acao: 'render', prompt, image: {mime, data(base64)} }
//       → { image(base64), mime, model }   edita a foto real do cliente (Gemini imagem)
//
// Publicar: dois cliques em publicar-funcao-sahra-fluxo.bat.

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const SOFT_LIMIT_MS = Number(Deno.env.get("EDGE_SOFT_LIMIT_MS")) || 135_000;
const IMG_MODELS = ["gemini-2.5-flash-image", "gemini-2.5-flash-image-preview"];
const FALLBACK = ["gemini-flash-latest", "gemini-2.5-flash"];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
class HttpError extends Error {
  constructor(public status: number, message: string, public code: string) { super(message); }
}

function versionOf(name: string): number {
  const m = name.match(/gemini-(\d+(?:\.\d+)?)/i);
  return m ? Number(m[1]) : 0;
}
let flashCache: string[] | null = null;
let workingModel: string | null = null;
const semThinking = new Set<string>();
async function flashModels(apiKey: string): Promise<string[]> {
  const list: string[] = [];
  if (workingModel) list.push(workingModel);
  const forced = Deno.env.get("GEMINI_TEXT_MODEL");
  if (forced) list.push(forced);
  if (!flashCache) {
    flashCache = [];
    try {
      const res = await fetch(`${GEMINI_API_BASE}/models?key=${apiKey}&pageSize=200`);
      if (res.ok) {
        const body = await res.json();
        flashCache = (body?.models || [])
          .filter((m: any) => Array.isArray(m?.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent"))
          .map((m: any) => String(m.name || "").replace(/^models\//, ""))
          .filter((n: string) => /^gemini-.*-flash\b/i.test(n))
          .filter((n: string) => !/image|tts|audio|embedding|live|lite|robotics|computer|nano|learnlm|exp-/i.test(n))
          .sort((a: string, b: string) => (versionOf(b) - versionOf(a)) || (Number(/preview/i.test(a)) - Number(/preview/i.test(b))));
      }
    } catch { /* fica no fallback */ }
  }
  list.push(...flashCache, ...FALLBACK);
  return list.filter((m, i, a) => !!m && a.indexOf(m) === i);
}

function parseLooseJson(text: string): any {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  try { return JSON.parse(t); } catch { /* segue */ }
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch { /* segue */ } }
  return null;
}

async function geraJson(apiKey: string, prompt: string, images: any[], profundo: boolean) {
  const deadline = Date.now() + SOFT_LIMIT_MS;
  const parts: any[] = [{ text: prompt }];
  for (const im of images.slice(0, 6)) {
    if (im && typeof im.data === "string" && /^image\//.test(String(im.mime || ""))) parts.push({ inlineData: { mimeType: im.mime, data: im.data } });
  }
  let lastErr = "";
  for (const model of await flashModels(apiKey)) {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (deadline - Date.now() < 10_000) throw new HttpError(504, "A IA demorou demais pra responder.", "timeout");
      const cfg: any = { responseMimeType: "application/json", maxOutputTokens: 65536 };
      if (versionOf(model) < 3) cfg.temperature = 0.4;
      if (!semThinking.has(model)) {
        cfg.thinkingConfig = versionOf(model) >= 3 ? { thinkingLevel: profundo ? "medium" : "low" } : { thinkingBudget: profundo ? 6144 : 512 };
      }
      let res: Response;
      try {
        res = await fetch(`${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: cfg }),
          signal: AbortSignal.timeout(Math.max(5_000, deadline - Date.now())),
        });
      } catch (e) {
        const n = (e as Error).name;
        if (n === "TimeoutError" || n === "AbortError") throw new HttpError(504, "A IA demorou demais pra responder.", "timeout");
        lastErr = `${model}: ${(e as Error).message}`; break;
      }
      if (res.status === 404) { lastErr = `${model}: 404`; if (workingModel === model) workingModel = null; break; }
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        if (res.status === 400 && /thinking/i.test(txt) && cfg.thinkingConfig) { semThinking.add(model); attempt--; continue; }
        if (res.status === 429 || res.status >= 500) { lastErr = `${model}: ${res.status}`; break; }
        throw new HttpError(502, `Gemini (${model}) respondeu ${res.status}: ${txt.slice(0, 300)}`, "gemini_http");
      }
      workingModel = model;
      const payload = await res.json().catch(() => null);
      const cand = payload?.candidates?.[0];
      const text = (cand?.content?.parts || []).filter((p: any) => !p.thought).map((p: any) => p.text || "").join("");
      if (!text) {
        if (cand?.finishReason === "SAFETY" || payload?.promptFeedback?.blockReason) throw new HttpError(502, "A IA recusou o pedido ou a imagem.", "blocked");
        lastErr = `${model}: sem texto`; continue;
      }
      const data = parseLooseJson(text);
      if (data) return { data, model };
      lastErr = `${model}: JSON inválido`;
    }
  }
  throw new HttpError(502, `A IA não devolveu uma resposta utilizável (${lastErr}).`, "no_result");
}

// OBRA SEM FOTO (2026-11-08, Matt: "ela pede uma imagem do ambiente, mas se
// a casa estiver sendo construída não existe"). Sem foto do cliente, gera do
// zero; as vistas do projeto (elevações) e a planta vão como REFERÊNCIA de
// layout, não como foto a ser editada.
async function geraRender(apiKey: string, prompt: string, image: any, referencias: any[] = []) {
  const forced = Deno.env.get("GEMINI_IMAGE_MODEL");
  const temFoto = !!(image && typeof image.data === "string");
  const refs = (Array.isArray(referencias) ? referencias : []).filter((r) => r && typeof r.data === "string").slice(0, 4);
  const sufixo = temFoto
    ? "Photorealistic, architectural magazine quality. Keep the original photo's camera, perspective and everything not mentioned exactly as it is. No people, no text, no logos, no watermark."
    : "There is NO photo of the room: the house is still under construction. Create the finished room from scratch as a photorealistic interior photograph, architectural magazine quality, natural daylight, eye-level camera at a natural three-quarter angle. "
      + (refs.length ? "The attached images are the project's technical drawings (front elevations of each wall and the floor plan). Follow them exactly for the layout, proportions, positions and number of cabinets, doors, drawers, niches, panels and appliances, and for the materials and colors described; do not copy the drawing style, labels or dimension lines. " : "")
      + "Plain finished walls, simple finished floor and ceiling. No people, no text, no logos, no watermark.";
  const parts: any[] = [{ text: `${prompt}\n${sufixo}` }];
  if (temFoto) parts.push({ inlineData: { mimeType: image.mime || "image/jpeg", data: image.data } });
  for (const r of refs) parts.push({ inlineData: { mimeType: r.mime || "image/png", data: r.data } });
  let lastErr = "";
  for (const model of [forced, ...IMG_MODELS].filter((m, i, a) => !!m && a.indexOf(m) === i) as string[]) {
    const res = await fetch(`${GEMINI_API_BASE}/models/${model}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { responseModalities: ["IMAGE"] } }),
      signal: AbortSignal.timeout(120_000),
    }).catch((e) => { lastErr = `${model}: ${(e as Error).message}`; return null; });
    if (!res) continue;
    if (!res.ok) { lastErr = `${model}: ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`; continue; }
    const payload = await res.json().catch(() => null);
    const part = (payload?.candidates?.[0]?.content?.parts || []).find((p: any) => (p.inlineData || p.inline_data)?.data);
    const inline = part && (part.inlineData || part.inline_data);
    if (inline) return { image: inline.data, mime: inline.mimeType || inline.mime_type || "image/png", model };
    lastErr = `${model}: sem imagem`;
  }
  throw new HttpError(502, `Render indisponível (${lastErr}).`, "image_failed");
}

async function confereAdmin(req: Request): Promise<boolean> {
  const url = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY");
  const auth = req.headers.get("Authorization") || "";
  if (!url || !anon || !auth) return false;
  try {
    const r = await fetch(`${url}/rest/v1/rpc/is_admin`, {
      method: "POST",
      headers: { apikey: anon, Authorization: auth, "Content-Type": "application/json" },
      body: "{}",
    });
    if (!r.ok) return false;
    return (await r.json()) === true;
  } catch { return false; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Use POST." });
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return json(500, { error: "GEMINI_API_KEY não configurada.", code: "no_key" });
  if (!(await confereAdmin(req))) return json(403, { error: "Só administrador.", code: "forbidden" });
  let b: any;
  try { b = await req.json(); } catch { return json(400, { error: "Corpo inválido (JSON esperado).", code: "bad_body" }); }
  const prompt = String(b?.prompt || "").slice(0, 200_000);
  if (!prompt.trim()) return json(400, { error: "Prompt vazio.", code: "no_prompt" });
  try {
    if (b.acao === "render") {
      if (!b.image?.data && !(Array.isArray(b.referencias) && b.referencias.length) && !b.sem_foto) return json(400, { error: "Mande a foto do cliente ou as vistas do projeto.", code: "no_image" });
      return json(200, await geraRender(apiKey, prompt.slice(0, 6000), b.image?.data ? b.image : null, b.referencias || []));
    }
    return json(200, await geraJson(apiKey, prompt, Array.isArray(b.images) ? b.images : [], b.modo === "profundo"));
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, { error: e.message, code: e.code });
    return json(500, { error: (e as Error).message || String(e), code: "internal" });
  }
});
