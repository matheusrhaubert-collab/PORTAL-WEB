// sahra-chat — Edge Function (Supabase / Deno), 2026-11-05
// Conversa com a SAHRA (designer da Legno) dentro do Projetos — js/portal-37-sahra.js.
// SÓ ADMIN: confere is_admin() com o token de quem chamou (403 pros outros).
// Função NOVA e separada de propósito: não toca na generate-project-from-photo.
// Os blocos de modelo/Gemini, EDIT_SCHEMA e sanitizeEdit são CÓPIA da
// generate-project-from-photo (mesmo formato de operações do IA · Editar,
// executadas no portal por editProjectAiApply do portal-19).
// Publicar: dois cliques em publicar-funcao-sahra.bat.
import { CODEX, PORTFOLIO } from "./conhecimento.ts";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ==========================================================================
// Modelo — descoberto, não chumbado (mesma lição da generate-project-layout)
// ==========================================================================
// tier 'pro'  → maior versão de gemini-*-pro disponível na conta
// tier 'flash'→ maior versão de gemini-*-flash (sem "lite")
// ListModels uma vez por instância; se falhar, cai nos aliases "-latest".
const FALLBACK_BY_TIER: Record<string, string[]> = {
  pro: ["gemini-pro-latest", "gemini-2.5-pro"],
  flash: ["gemini-flash-latest", "gemini-2.5-flash"],
};
const modelCache: Record<string, string[] | null> = { pro: null, flash: null };
const workingModel: Record<string, string | null> = { pro: null, flash: null };
const semThinking = new Set<string>(); // modelos que recusaram thinkingConfig

function versionOf(name: string): number {
  const m = name.match(/gemini-(\d+(?:\.\d+)?)/i);
  return m ? Number(m[1]) : 0;
}

async function candidateModels(apiKey: string, tier: "pro" | "flash"): Promise<string[]> {
  const forced = tier === "pro" ? Deno.env.get("GEMINI_VISION_PRO_MODEL") : Deno.env.get("GEMINI_TEXT_MODEL");
  const list: string[] = [];
  if (workingModel[tier]) list.push(workingModel[tier] as string);
  if (forced) list.push(forced);
  if (!modelCache[tier]) {
    try {
      const res = await fetch(`${GEMINI_API_BASE}/models?key=${apiKey}&pageSize=200`);
      if (res.ok) {
        const body = await res.json();
        const names: string[] = (body?.models || [])
          .filter((m: any) => Array.isArray(m?.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent"))
          .map((m: any) => String(m.name || "").replace(/^models\//, ""))
          .filter((n: string) => /^gemini-/i.test(n))
          .filter((n: string) => !/image|tts|audio|embedding|live|lite|robotics|computer|nano|learnlm|exp-/i.test(n));
        const re = tier === "pro" ? /-pro\b/i : /-flash\b/i;
        modelCache[tier] = names
          .filter((n) => re.test(n))
          // maior versão primeiro; empate: o sem "preview" primeiro
          .sort((a, b) => (versionOf(b) - versionOf(a)) || (Number(/preview/i.test(a)) - Number(/preview/i.test(b))));
      } else {
        modelCache[tier] = [];
      }
    } catch {
      modelCache[tier] = [];
    }
  }
  list.push(...(modelCache[tier] || []), ...FALLBACK_BY_TIER[tier]);
  return list.filter((m, i, arr) => !!m && arr.indexOf(m) === i);
}

// Chama o Gemini com fallback de modelo (404 → próximo) e com UMA nova
// tentativa quando a resposta vem cortada ou não é JSON.
// PRAZO (01/10): a Edge Function tem limite de tempo de parede (150 s no
// plano grátis) — passou disso, o Supabase corta com um 504 cru e o portal
// não sabe o que houve (foi o "Cozinha · erro 504" do Indiana: Pro + 6
// pranchas grandes). Agora a própria função desiste antes (135 s, ajustável
// em EDGE_SOFT_LIMIT_MS) e responde code='timeout', e o portal tenta de novo
// no modo rápido / com menos páginas (projectPhotoRunPipeline, portal-11).
const SOFT_LIMIT_MS = Number(Deno.env.get("EDGE_SOFT_LIMIT_MS")) || 135_000;

// RACIOCÍNIO LIMITADO (01/11, teste ao vivo do PDF "Cuarto niño"): o
// 'read' Pro estourou os 135 s e DEPOIS o 'match' (Flash, 2 imagens) também
// — não era peso de imagem, era o modelo pensando sem teto: Gemini 2.5/3.x
// pensa por padrão e o orçamento de saída (64k) deixa ele pensar por
// minutos. Agora cada etapa diz quanto pode pensar:
//   'deep'  — leitura (read): precisa raciocinar sobre as cotas/vistas
//   'light' — vistas, casamento, correção, split, edit, help: tarefa de
//             lista/JSON, pensar pouco
// Gemini 3.x usa thinkingLevel; 2.5 usa thinkingBudget (tokens).
// VERSÃO ÚNICA (Matt: "acho que tem que ter uma só versão"): o tier Pro
// não é mais usado por nenhuma etapa — tudo Flash. O parâmetro continua
// aceito pra não quebrar chamador antigo.
type Thinking = "deep" | "light";
function thinkingConfigFor(model: string, think: Thinking) {
  const v = versionOf(model);
  if (v >= 3) return { thinkingLevel: think === "deep" ? "medium" : "low" };
  // 2.5 flash: 0..24576; 2.5 pro: mínimo 128
  return { thinkingBudget: think === "deep" ? 8192 : (/pro/i.test(model) ? 256 : 512) };
}

async function callGemini(apiKey: string, tier: "pro" | "flash", parts: any[], schema: any, think: Thinking = "light") {
  tier = "flash";
  const deadline = Date.now() + SOFT_LIMIT_MS;
  const timeout = () => new HttpError(504, "A IA demorou demais pra responder (limite da função).", "timeout");
  const models = await candidateModels(apiKey, tier);
  let lastErr = "";
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (deadline - Date.now() < 15_000) throw timeout();
      const generationConfig: any = {
        responseMimeType: "application/json",
        responseSchema: schema,
        // 64k: o raciocínio do modelo conta no mesmo orçamento. Com 8k
        // (v1) a resposta era cortada no meio = "JSON inválido".
        maxOutputTokens: 65536,
      };
      // Gemini 3+ recomenda temperatura padrão (baixar causa laço);
      // 2.x lê melhor medida com temperatura baixa.
      if (versionOf(model) < 3) generationConfig.temperature = 0.2;
      if (!semThinking.has(model)) generationConfig.thinkingConfig = thinkingConfigFor(model, think);

      let res: Response;
      try {
        res = await fetch(`${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig }),
          signal: AbortSignal.timeout(Math.max(5_000, deadline - Date.now())),
        });
      } catch (e) {
        const nome = (e as Error).name;
        if (nome === "TimeoutError" || nome === "AbortError") throw timeout();
        lastErr = `${model}: ${(e as Error).message}`;
        break; // rede — tenta o próximo modelo
      }
      if (res.status === 404) {
        lastErr = `${model}: 404 (modelo indisponível)`;
        if (workingModel[tier] === model) workingModel[tier] = null;
        break;
      }
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        // modelo que não aceita o thinkingConfig mandado: repete sem ele
        if (res.status === 400 && /thinking/i.test(txt) && generationConfig.thinkingConfig) {
          delete generationConfig.thinkingConfig;
          semThinking.add(model);
          attempt--; // não gasta a tentativa
          continue;
        }
        // 429/5xx: vale tentar o próximo modelo antes de desistir
        if (res.status === 429 || res.status >= 500) { lastErr = `${model}: ${res.status} ${txt.slice(0, 200)}`; break; }
        throw new HttpError(502, `Gemini (${model}) respondeu ${res.status}: ${txt.slice(0, 400)}`, "gemini_http");
      }
      workingModel[tier] = model;
      const payload = await res.json().catch(() => null);
      const cand = payload?.candidates?.[0];
      const finish = cand?.finishReason || "";
      const text = (cand?.content?.parts || []).filter((p: any) => !p.thought).map((p: any) => p.text || "").join("");
      if (!text) {
        lastErr = `${model}: sem texto (${finish || payload?.promptFeedback?.blockReason || "?"})`;
        if (finish === "SAFETY" || payload?.promptFeedback?.blockReason) throw new HttpError(502, `A IA recusou a imagem (${finish || payload?.promptFeedback?.blockReason}).`, "blocked");
        continue;
      }
      const parsed = parseLooseJson(text);
      if (parsed) return { data: parsed, model };
      lastErr = `${model}: JSON inválido${finish === "MAX_TOKENS" ? " (resposta cortada por tamanho)" : ""}`;
      // tenta de novo o MESMO modelo uma vez
    }
  }
  throw new HttpError(502, `A IA não devolveu uma resposta utilizável (${lastErr}).`, "no_result");
}

const SKILL_SUSPENSO = `MÓVEL SUSPENSO (regra da marcenaria — vale mais que semelhança de nome):
- Suspenso = QUALQUER móvel baixo de caixa, em QUALQUER ambiente (base de cozinha, gaveteiro, pia, vanity de banheiro, rack/painel de TV do living, aparador de hall de entrada, móvel de escritório, gaveteiro de closet...), cujo corpo NÃO encosta no chão (vão livre por baixo, o piso passa por baixo dele). Rodapé recuado (faixa fechada até o chão, recuada) NÃO é suspenso.
- Suspenso NUNCA vira módulo com rodapé/toe/plinth/pés ("Toe", "Plastic feets", rodapé). A solução certa é caixa SEM rodapé: stretcher em cima, base embaixo, COM fundo, e o interior montado no Construtor reproduzindo o original (mesmo número de colunas e de gavetas/portas).
- Sem módulo assim no catálogo: deixe sem módulo (unmatched / null) com o motivo — nunca troque por um módulo de rodapé.`;

class HttpError extends Error {
  constructor(public status: number, message: string, public code: string) { super(message); }
}

function parseLooseJson(text: string): any {
  let t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  try { return JSON.parse(t); } catch { /* segue */ }
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) {
    try { return JSON.parse(t.slice(a, b + 1)); } catch { /* segue */ }
  }
  return null;
}

// CONSTRUTOR (05/11, Matt: "a SAHRA não está conseguindo acessar o
// construtor. isso é fundamental pra ela"): op nova set_interior — o portal
// monta a árvore do Construtor com o mesmo motor da leitura por foto
// (projectPhotoInteriorTree, portal-11). Só nesta função (cópia), a
// generate-project-from-photo não muda.
const EDIT_OPS = ["resize", "move", "set_color", "set_quantity", "replace_module", "add_module", "remove_module", "set_interior", "set_led"];
// LED (05/11, Matt: "a SAHRA não tem acesso ao LED. preciso colocar LED nos
// projetos"): op set_led — o portal aplica com as MESMAS funções da tela de
// LED (portal-06c: projectLedPecasElegiveis, ledLinhaPadrao, ledFaceDoBotao,
// ledPosGravar, ledAvaliar) e grava slot.ledConfigs; preço por metro, 3D,
// foto e rasgo no .ban saem sozinhos.
const LED_SCHEMA = {
  type: "OBJECT",
  nullable: true,
  properties: {
    action: { type: "STRING", enum: ["add", "replace", "remove"] },
    piece_ids: { type: "ARRAY", items: { type: "STRING" } },
    roles: { type: "ARRAY", items: { type: "STRING", enum: ["shelf", "top", "bottom", "left", "right", "back", "countertop", "front", "baseboard", "free"] } },
    side: { type: "STRING", enum: ["top", "under"], nullable: true },
    from_front_mm: { type: "NUMBER", nullable: true },
    lines: { type: "INTEGER", nullable: true },
    margin_mm: { type: "NUMBER", nullable: true },
  },
  required: ["action"],
  propertyOrdering: ["action", "piece_ids", "roles", "side", "from_front_mm", "lines", "margin_mm"],
};
function limpaLed(l: any) {
  if (!l || !["add", "replace", "remove"].includes(l.action)) return null;
  const roles = ["shelf", "top", "bottom", "left", "right", "back", "countertop", "front", "baseboard", "free"];
  const num = (v: any, min: number, max: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null; };
  return {
    action: l.action,
    piece_ids: (Array.isArray(l.piece_ids) ? l.piece_ids : []).map(String).slice(0, 60),
    roles: (Array.isArray(l.roles) ? l.roles : []).filter((r: any) => roles.includes(r)),
    side: l.side === "top" || l.side === "under" ? l.side : null,
    from_front_mm: num(l.from_front_mm, 0, 3000),
    lines: num(l.lines, 1, 6) === null ? null : Math.round(num(l.lines, 1, 6) as number),
    margin_mm: num(l.margin_mm, 0, 1000),
  };
}
const INTERIOR_SCHEMA = {
  type: "OBJECT",
  nullable: true,
  properties: {
    columns: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          width_mm: { type: "NUMBER" },
          zones: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                type: { type: "STRING", enum: ["drawers", "shelves", "hanging", "open"] },
                height_mm: { type: "NUMBER" },
                count: { type: "INTEGER" },
              },
              required: ["type", "height_mm", "count"],
              propertyOrdering: ["type", "height_mm", "count"],
            },
          },
          doors: { type: "STRING", enum: ["none", "hinged", "flap"] },
          doors_cover: { type: "STRING", enum: ["all", "above_drawers"] },
        },
        required: ["width_mm", "zones", "doors"],
        propertyOrdering: ["width_mm", "zones", "doors", "doors_cover"],
      },
    },
  },
};
function limpaInterior(it: any) {
  const cols = (Array.isArray(it?.columns) ? it.columns : []).slice(0, 8).map((c: any) => ({
    width_mm: Math.max(100, Math.round(Number(c?.width_mm) || 0)),
    zones: (Array.isArray(c?.zones) ? c.zones : []).slice(0, 10)
      .filter((z: any) => ["drawers", "shelves", "hanging", "open"].includes(z?.type))
      .map((z: any) => ({ type: z.type, height_mm: Math.max(60, Math.round(Number(z.height_mm) || 0)), count: Math.max(0, Math.min(12, Math.round(Number(z.count) || 0))) })),
    doors: ["none", "hinged", "flap"].includes(c?.doors) ? c.doors : "none",
    doors_cover: c?.doors_cover === "above_drawers" ? "above_drawers" : "all",
  })).filter((c: any) => c.zones.length);
  return cols.length ? { columns: cols } : null;
}

const EDIT_SCHEMA = {
  type: "OBJECT",
  properties: {
    understanding: { type: "STRING" },
    operations: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          reason: { type: "STRING" },
          op: { type: "STRING", enum: EDIT_OPS },
          slot_ids: { type: "ARRAY", items: { type: "STRING" }, nullable: true },
          module_id: { type: "STRING", nullable: true },
          wall_index: { type: "INTEGER", nullable: true },
          x_mm: { type: "NUMBER", nullable: true },
          floor_height_mm: { type: "NUMBER", nullable: true },
          width_mm: { type: "NUMBER", nullable: true },
          height_mm: { type: "NUMBER", nullable: true },
          depth_mm: { type: "NUMBER", nullable: true },
          role: { type: "STRING", nullable: true },
          color_name: { type: "STRING", nullable: true },
          piece_id: { type: "STRING", nullable: true },
          quantity: { type: "INTEGER", nullable: true },
          color_from_slot_id: { type: "STRING", nullable: true },
          interior: INTERIOR_SCHEMA,
          led: LED_SCHEMA,
        },
        required: ["reason", "op"],
        propertyOrdering: ["reason", "op", "slot_ids", "module_id", "wall_index", "x_mm", "floor_height_mm",
          "width_mm", "height_mm", "depth_mm", "role", "color_name", "piece_id", "quantity", "color_from_slot_id", "interior", "led"],
      },
    },
    not_done: { type: "ARRAY", items: { type: "STRING" } },
    summary: { type: "STRING" },
  },
  required: ["understanding", "operations", "not_done", "summary"],
  propertyOrdering: ["understanding", "operations", "not_done", "summary"],
};


function sanitizeEdit(data: any, b: any) {
  const slotIds = new Set(((b.project && b.project.slots) || []).map((s: any) => String(s.id)));
  const modIds = new Set((b.catalog || []).map((m: any) => String(m.id)));
  const nWalls = ((b.project && b.project.walls) || []).length;
  const num = (v: any) => { const n = Number(v); return v === null || v === undefined || v === "" || !Number.isFinite(n) ? null : Math.round(n * 10) / 10; };
  const ops: any[] = [];
  const notDone: string[] = Array.isArray(data?.not_done) ? data.not_done.map((x: any) => String(x)).filter(Boolean) : [];
  (Array.isArray(data?.operations) ? data.operations : []).slice(0, 80).forEach((o: any) => {
    if (!o || !EDIT_OPS.includes(o.op)) return;
    const ids = (Array.isArray(o.slot_ids) ? o.slot_ids : []).map((x: any) => String(x)).filter((x: string) => slotIds.has(x));
    const precisaSlot = o.op !== "add_module" && !(o.op === "set_color" && (!o.slot_ids || !o.slot_ids.length));
    if (precisaSlot && !ids.length) { notDone.push(`${o.reason || o.op} (módulo não encontrado)`); return; }
    const mid = o.module_id ? String(o.module_id) : null;
    if ((o.op === "replace_module" || o.op === "add_module") && (!mid || !modIds.has(mid))) {
      notDone.push(`${o.reason || o.op} (módulo de catálogo inválido)`); return;
    }
    const wi = o.wall_index === null || o.wall_index === undefined ? null : Number(o.wall_index);
    if (wi !== null && !(Number.isInteger(wi) && wi >= 0 && wi < nWalls)) {
      // parede inexistente NÃO pode virar "ilha no piso" calada
      notDone.push(`${o.reason || o.op} (parede ${wi} não existe)`); return;
    }
    ops.push({
      op: o.op, reason: String(o.reason || ""), slot_ids: ids, module_id: mid,
      wall_index: wi,
      x_mm: num(o.x_mm), floor_height_mm: num(o.floor_height_mm),
      width_mm: num(o.width_mm), height_mm: num(o.height_mm), depth_mm: num(o.depth_mm),
      role: o.role ? String(o.role) : null, color_name: o.color_name ? String(o.color_name) : null,
      piece_id: o.piece_id ? String(o.piece_id) : null,
      quantity: o.quantity === null || o.quantity === undefined ? null : Math.round(Number(o.quantity)),
      color_from_slot_id: o.color_from_slot_id && slotIds.has(String(o.color_from_slot_id)) ? String(o.color_from_slot_id) : null,
      interior: o.op === "set_interior" ? limpaInterior(o.interior) : null,
      led: o.op === "set_led" ? limpaLed(o.led) : null,
    });
  });
  return { understanding: String(data?.understanding || ""), summary: String(data?.summary || ""), operations: ops, not_done: notDone };
}

// ==========================================================================
// CONVERSA DA SAHRA
// ==========================================================================
// ==========================================================================
// CENTRAIS DA SAHRA (05/11, migration 269) — o "cérebro" organizado:
// cada regra aprendida mora numa central; centrais ligadas entre si. A
// tabela sahra_hubs manda; isto é o reserva se ela não carregar.
// ==========================================================================
const HUBS_PADRAO: any[] = [
  { slug: "composicao", name_pt: "Composição", related: ["eletros", "paineis", "cores", "funcao"] },
  { slug: "eletros", name_pt: "Eletros", related: ["composicao", "funcao", "producao"] },
  { slug: "paineis", name_pt: "Painéis e componentes", related: ["composicao", "materiais", "producao", "custo"] },
  { slug: "materiais", name_pt: "Materiais", related: ["cores", "paineis", "custo", "producao"] },
  { slug: "cores", name_pt: "Cores e tendências", related: ["materiais", "composicao", "iluminacao", "cliente"] },
  { slug: "iluminacao", name_pt: "Iluminação", related: ["cores", "composicao"] },
  { slug: "funcao", name_pt: "Função e ergonomia", related: ["composicao", "eletros", "producao"] },
  { slug: "cliente", name_pt: "Cliente e estilo", related: ["cores", "composicao", "conversa", "negocio"] },
  { slug: "custo", name_pt: "Custo", related: ["materiais", "producao", "paineis", "negocio"] },
  { slug: "producao", name_pt: "Produção", related: ["paineis", "materiais", "custo", "funcao", "eletros"] },
  { slug: "conversa", name_pt: "Jeito de conversar", related: ["cliente", "negocio"] },
  { slug: "negocio", name_pt: "Negócio Legno", related: ["custo", "cliente", "conversa"] },
];
const HUB_SLUGS = HUBS_PADRAO.map((h) => h.slug);
const PESO_TXT: Record<string, string> = { ouro: "REGRA DE OURO", normal: "", preferencia: "preferência" };

function memoriaPrompt(lessons: any[], hubs: any[]): string {
  if (!lessons.length) return "(nenhuma ainda)";
  const nome = (slug: string) => (hubs.find((h) => h.slug === slug) || {}).name_pt || slug || "Sem central";
  const ouro = lessons.filter((l) => l.weight === "ouro");
  let out = "";
  if (ouro.length) out += "REGRAS DE OURO — nunca quebrar, valem acima de tudo:\n" + ouro.map((l) => `- [${nome(l.hub)}] ${l.rule}`).join("\n") + "\n\n";
  const porHub = new Map<string, any[]>();
  lessons.filter((l) => l.weight !== "ouro").forEach((l) => { const k = l.hub || ""; if (!porHub.has(k)) porHub.set(k, []); porHub.get(k)!.push(l); });
  const ordem = [...hubs.map((h) => h.slug), ""];
  ordem.forEach((slug) => {
    const ls = porHub.get(slug);
    if (!ls || !ls.length) return;
    const h = hubs.find((x) => x.slug === slug);
    const lig = h && h.related && h.related.length ? ` (ligada a: ${h.related.map(nome).join(", ")})` : "";
    out += `CENTRAL ${nome(slug).toUpperCase()}${lig}:\n` + ls.map((l) => `- ${l.rule}${l.weight === "preferencia" ? " (preferência — pode flexibilizar com motivo)" : ""}`).join("\n") + "\n\n";
  });
  return out.trim();
}

// DETECTOR DE CHOQUE: cada regra nova contra as ativas da MESMA central, das
// centrais LIGADAS e todas as de ouro. Devolve por regra: status nova |
// duplicada | contradiz, os ids envolvidos e a central/peso corrigidos.
const CHECK_SCHEMA_LEARN = {
  type: "OBJECT",
  properties: {
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          index: { type: "INTEGER" },
          hub: { type: "STRING", enum: HUB_SLUGS },
          weight: { type: "STRING", enum: ["ouro", "normal", "preferencia"] },
          status: { type: "STRING", enum: ["nova", "duplicada", "contradiz"] },
          existing_ids: { type: "ARRAY", items: { type: "STRING" } },
          note: { type: "STRING" },
        },
        required: ["index", "hub", "weight", "status", "existing_ids", "note"],
        propertyOrdering: ["index", "hub", "weight", "status", "existing_ids", "note"],
      },
    },
  },
  required: ["items"],
};
async function checaRegras(apiKey: string, novas: any[], existentes: any[], hubs: any[], lang: string, todas = false) {
  const rel = (slug: string) => { const h = hubs.find((x) => x.slug === slug); return new Set([slug, ...((h && h.related) || [])]); };
  const blocos = novas.map((n, i) => {
    const alvo = n.hub && HUB_SLUGS.includes(n.hub) ? rel(n.hub) : null;
    // todas = REVISÃO GERAL (regra editada à mão, 05/11): compara com o Codex inteiro
    const cands = existentes.filter((e) => todas || e.weight === "ouro" || !alvo || alvo.has(e.hub)).slice(0, todas ? 400 : 120);
    return `NOVA ${i}: "${n.rule}" (central sugerida: ${n.hub || "?"}, peso sugerido: ${n.weight || "?"})\nREGRAS EXISTENTES A COMPARAR:\n` +
      (cands.length ? cands.map((e) => `  id=${e.id} [${e.hub || "-"}|${e.weight}] ${e.rule}`).join("\n") : "  (nenhuma)");
  }).join("\n\n");
  const idioma = lang === "en" ? "inglês" : lang === "es" ? "espanhol" : "português do Brasil";
  const prompt = `Você organiza a memória da SAHRA, designer da Legno (móveis planejados). Regras novas vão entrar na memória.
Para CADA regra nova:
- hub: a central certa (${HUB_SLUGS.join(", ")}). Corrija a sugerida se estiver errada.
- weight: "ouro" só se o texto diz que é inegociável ("nunca", "sempre", "regra de ouro", "obrigatório" com força); "preferencia" se é gosto/tendência ("prefiro", "gosto mais"); senão "normal". Mantenha a sugerida se fizer sentido.
- status: "duplicada" se já existe regra que diz a MESMA coisa (mesmo que com outras palavras); "contradiz" se manda fazer o oposto ou algo incompatível com uma existente NA MESMA SITUAÇÃO; senão "nova". Regras sobre situações diferentes que se complementam NÃO são contradição.
- existing_ids: ids das regras existentes duplicadas/contraditas (vazio se nova). Só ids da lista.
- note: uma frase curta em ${idioma} explicando o choque ou a duplicata (vazio se nova).

${blocos}`;
  const { data } = await callGemini(apiKey, "flash", [{ text: prompt }], CHECK_SCHEMA_LEARN, "light");
  const ids = new Set(existentes.map((e) => String(e.id)));
  const porIdx = new Map<number, any>();
  (Array.isArray(data?.items) ? data.items : []).forEach((it: any) => porIdx.set(Number(it.index), it));
  return novas.map((n, i) => {
    const it = porIdx.get(i) || {};
    const exIds = (Array.isArray(it.existing_ids) ? it.existing_ids : []).map(String).filter((x: string) => ids.has(x)).slice(0, 5);
    let status = ["nova", "duplicada", "contradiz"].includes(it.status) ? it.status : "nova";
    if (status !== "nova" && !exIds.length) status = "nova";
    return {
      rule: n.rule,
      hub: HUB_SLUGS.includes(it.hub) ? it.hub : (HUB_SLUGS.includes(n.hub) ? n.hub : null),
      weight: ["ouro", "normal", "preferencia"].includes(it.weight) ? it.weight : (n.weight || "normal"),
      status, note: String(it.note || ""),
      existing: exIds.map((id: string) => { const e = existentes.find((x) => String(x.id) === id); return { id, rule: e.rule, hub: e.hub, weight: e.weight }; }),
    };
  });
}

const CHAT_SCHEMA = {
  type: "OBJECT",
  properties: {
    reply: { type: "STRING" },
    spoken: { type: "STRING" },
    concepts: { type: "ARRAY", items: { type: "STRING" } },
    learn: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { hub: { type: "STRING", enum: HUB_SLUGS }, weight: { type: "STRING", enum: ["ouro", "normal", "preferencia"] }, rule: { type: "STRING" } },
        required: ["hub", "weight", "rule"], propertyOrdering: ["hub", "weight", "rule"],
      },
    },
    operations: EDIT_SCHEMA.properties.operations,
    not_done: { type: "ARRAY", items: { type: "STRING" } },
    actions: { type: "ARRAY", items: { type: "STRING", enum: ["photoreal", "render", "audit"] } },
    understanding: { type: "STRING" },
    summary: { type: "STRING" },
  },
  required: ["reply", "spoken", "operations", "not_done", "actions"],
  propertyOrdering: ["reply", "spoken", "concepts", "learn", "understanding", "operations", "not_done", "actions", "summary"],
};

function buildChatPrompt(b: any): string {
  const lang = b.lang === "en" ? "inglês" : b.lang === "es" ? "espanhol" : "português do Brasil";
  const unidade = b.unit === "in" ? "polegadas (1 in = 25,4 mm; a Legno fabrica a cada 1/32\")" : "milímetros";
  const hist = (Array.isArray(b.messages) ? b.messages : []).slice(-16)
    .map((m: any) => `${m.role === "user" ? "USUÁRIO" : "SAHRA"}: ${String(m.text || "").slice(0, 3000)}`).join("\n\n");
  return `Você é a SAHRA, designer da Legno Home (fábrica de móveis planejados nos EUA, vende white label para dealers).
Você está DENTRO do software de projetos da Legno, conversando com o projetista sobre o projeto aberto na tela.
Sua missão: fazer cada projeto parecer saído de revista, usando painéis e componentes de forma criativa, não só empilhando módulos.
O CODEX abaixo é a sua identidade e lei de estilo; o PORTFÓLIO são as cozinhas e marcas que você estudou.

O QUE VOCÊ CONSEGUE FAZER NO PROJETO (pelas operações, com o botão Aplicar): mudar medida e posição, cores, quantidade de prateleiras, trocar/inserir/remover módulos, montar o INTERIOR no Construtor (set_interior: gavetas, prateleiras, divisórias, cabideiro, portas, basculante) e colocar LED embutido (set_led: o portal grava o rasgo na peça e ele vai pro .ban, preço, 3D e foto sozinho — é o MESMO caminho do botão LED da barra). Nunca diga que LED ou Construtor só dá pelo botão do portal: você usa exatamente as mesmas funções.

COMO VOCÊ CONVERSA (campo reply):
- No IDIOMA indicado em CONTEXTO DESTA CONVERSA, direto, caloroso e prático. Quem fala com você entende de marcenaria: não explique o básico.
- Respostas curtas: no máximo uns 8–12 linhas, a não ser que peçam detalhe. Pode usar listas com "- " e **negrito**. Nada de tabelas.
- Cite a fonte do seu gosto quando couber ("como na ficha 7, next125", "Codex seção 2").
- Medidas pro usuário na UNIDADE indicada em CONTEXTO DESTA CONVERSA. Nunca chame de madeira maciça o que é lâmina ou padrão impresso.
- Use o nome dos módulos como aparecem no projeto (ex.: "#4 Wall Cabinet 30''"; o número é a ordem em slots, começando em 1).
- Quando não souber se a Legno tem um componente, pergunte em vez de inventar.
- Pedido de crítica ("o que achou?"): dê a nota de prêmio (seção 17: ideia, forma, função e usabilidade, diferenciação, responsabilidade, detalhe, de 1 a 5) em uma linha, o que funciona, o que quebra o Codex e as 3 mudanças que mais elevam.
- Custo ("como diminuir o custo?"): use pricing (preço de venda e custo de fábrica por módulo, com chapa, fita, mão de obra, ferragem e comprados, e área de chapa). Aponte os módulos que mais pesam e sugestões concretas que mantêm o desenho: padronizar larguras/alturas, trocar gaveteiro por porta onde não faz falta, unificar cores (menos chapas abertas), menos peças pequenas, painel no lugar de módulo, cor mais barata no interior. Dê a economia estimada quando os números permitirem. Ofereça aplicar.
- Descrição técnica ("descreve o projeto"): texto pronto pra mandar ao cliente ou à produção: ambiente e paredes (medidas), módulos por parede da esquerda para a direita com medidas, materiais/cores por papel, ferragens (dobradiça, corrediça), quantidades e total de venda. Organize por parede, com títulos em **negrito**.
- Imagens do projeto — são DUAS ferramentas do portal, em ordem (05/11, Matt):
  1) FOTO REALISTA ("Render > Gerar" da barra): render fiel da marcenaria, feito pelo próprio portal a partir do 3D, com a câmera como está na tela. Precisa do projeto SALVO (project.salvo) e de pelo menos 1 módulo. Quando pedirem "foto realista", "render", "imagem do projeto", "como vai ficar de verdade": coloque "photoreal" em actions e diga em uma frase como posicionar a câmera antes (altura dos olhos, uns 1,60 m, de dentro do ambiente, de frente pro protagonista, um pouco na diagonal). Se project.salvo for false, peça pra salvar o projeto primeiro.
  2) RENDER DECORADO (IA): pega uma foto realista JÁ GERADA (project.fotos_realistas > 0) e acrescenta decoração, luz e vida. Quando pedirem decoração/apresentação/lifestyle: se project.fotos_realistas for 0, coloque SÓ "photoreal" e explique que primeiro sai a foto realista; se já houver, coloque "render" e sugira o texto do briefing (quem mora, estilo, dia/noite, objetos) pronto pra colar.
  Você NÃO gera essas imagens sozinha (o que você gera são só as imagens de CONCEITO, em concepts).
- Quando a resposta falar dos erros de produção do Auditor, coloque "audit" em actions.
- Pergunta de cor/tendência: responda com o porquê e diga quais cores do projeto (color_options) fazem isso; ofereça aplicar.

APRENDER (campo learn) — a sua memória cresce com o Matt, organizada em CENTRAIS:
- Quando o usuário te ENSINAR algo que deve valer pra sempre — "aprende", "guarda", "lembra disso", "a partir de agora", "sempre…", "nunca…", "eu prefiro…", "não gosto de…", "na Legno a gente faz assim", ou quando ele DISCORDAR de uma regra sua ou do Codex — devolva em learn 1 a 3 regras curtas, diretas e gerais (ex.: { hub: "eletros", weight: "ouro", rule: "Nunca colocar aéreo acima da geladeira; usar torre de altura total." }). No reply, confirme em uma frase o que aprendeu (o sistema ainda confere se ela duplica ou contradiz outra).
- Não guarde pedido pontual deste projeto ("muda essa cor pra cinza"), só regra que vale pros próximos projetos. Não repita regra que já está em REGRAS APRENDIDAS.
- hub = a central: composicao (protagonista, eixo, alinhamentos), eletros, paineis (painéis e componentes), materiais, cores (e tendências), iluminacao, funcao (ergonomia, NKBA), cliente (perfil e estilo), custo, producao (o que a fábrica faz), conversa (seu jeito de responder), negocio (dealers, marca, mercado).
- weight = "ouro" quando ele diz que é inegociável (nunca/sempre com força), "preferencia" quando é gosto, senão "normal".

FALA (campo spoken) — o que a SAHRA diz em voz alta. NÃO é a leitura do reply:
- É como uma pessoa de verdade falaria a mesma coisa pra um colega do lado: 2 a 5 frases curtas, tom de conversa, com expressões naturais ("olha", "sabe o que eu faria?", "ficou bonito, mas…", "hmm"), contrações e ritmo de fala.
- Sem listas, sem asteriscos, sem números longos ou medidas exatas (arredonde: "uns trinta polegadas"), sem códigos de módulo. Se o reply é longo (descrição técnica, lista de custos), a fala só resume o principal e diz "deixei os detalhes aqui no texto".
- Mesmo idioma do reply.

QUANDO MEXER NO PROJETO (campo operations):
- Só devolva operações quando o usuário PEDIR para mudar, aplicar, montar ou fazer ("muda", "aplica", "troca", "faz um projeto", "monta", "pode fazer"). Pergunta, opinião ou crítica = operations VAZIO; no reply, ofereça fazer.
- As operações NÃO são aplicadas sozinhas: o usuário vê um botão "Aplicar" e decide. No reply, diga em uma frase o que as operações vão fazer.
- "Faz um projeto" (ou "refaz", "nova proposta"): em DUAS etapas. 1ª resposta: conte a ideia (conceito em uma frase, protagonista, eixo, onde ficam os eletros, materiais e cores) e preencha concepts; operations VAZIO; termine perguntando se pode montar assim ou o que mudar. 2ª resposta (quando o usuário confirmar: "pode", "monta", "gostei", "faz"): aí sim as operações.
- concepts = 1 ou 2 descrições EM INGLÊS de imagem de conceito (moodboard simples), uma por imagem, 40–90 palavras cada: tipo de ambiente, layout real das paredes (ex.: "L-shaped kitchen, 12 ft and 9 ft walls, window centered on the long wall"), o protagonista, materiais e cores de verdade (nome do padrão EGGER se houver), luz natural, estilo de foto de revista de arquitetura, câmera em altura de olho. Sem pessoas, sem texto, sem logotipos. Use concepts só nessa 1ª etapa de projeto ou quando pedirem "mostra uma imagem / como ficaria"; no resto deixe vazio.
- Montagem (2ª etapa) com paredes prontas e poucos ou nenhum módulo: proponha a composição primeiro (protagonista, eixo, onde ficam pia, cooktop/range, geladeira, lava-louças), depois monte com add_module usando SÓ módulos do catálogo, encostados, sem sobrepor, dentro de 0..length_mm de cada parede, desviando de portas e janelas (openings). Bases no chão (floor_height_mm 0); aéreos com o topo alinhado. Prefira torres de altura total e menos aéreos padrão, como manda o Codex. Seja completo: preencha as corridas de verdade (pode passar de 20 operações).
- Formato das operações: igual ao abaixo.

OPERAÇÕES (campo op) — preencha só os campos que a operação usa, o resto null:
- resize: slot_ids + width_mm/height_mm/depth_mm novos (só os que mudam). Pode vir junto floor_height_mm.
- move: slot_ids (normalmente 1) + x_mm e/ou floor_height_mm e/ou wall_index. Só pra placement 'wall'.
- set_color: slot_ids (vazio/null = TODOS) + color_name EXATAMENTE como em color_options + role = chave de color_options ou null.
- set_quantity: slot_ids (1) + piece_id + quantity (dentro de min..max).
- replace_module: slot_ids + module_id do catálogo.
- add_module: module_id + wall_index + x_mm + floor_height_mm + width_mm/height_mm/depth_mm (dentro de w/h/d do catálogo); color_from_slot_id ou color_name.
- remove_module: slot_ids.
- set_interior: slot_ids (1 ou mais) + interior = o INTERIOR do Construtor (substitui o que tiver). interior.columns = colunas da esquerda pra direita (divisórias verticais entre elas), cada uma com width_mm (soma ≈ largura útil = largura do módulo − 2×19), zones = faixas de BAIXO pra CIMA (prateleira fixa entre elas), cada zona { type: drawers (gavetas; count = quantas), shelves (prateleiras; count = quantas DENTRO da faixa), hanging (cabideiro), open (vão livre), height_mm, count }, a soma dos height_mm ≈ altura útil (altura − 2×19); doors: none | hinged (porta de giro) | flap (basculante); doors_cover: all (porta cobre a coluna toda) | above_drawers (porta só acima das gavetas).
  Regras do Construtor: gaveta mínima 100 mm de frente (count ≤ altura da zona ÷ 100) e máxima 400 mm; coluna com gaveta até 1200 mm de largura; gaveta em cima de tudo ⇒ nada de porta cobrindo ela. Módulo do catálogo que já tem portas próprias (casco: false e interior_atual com frentes do cadastro) → doors none, a não ser que peçam. Caixa crua de Componentes (casco: true) precisa das portas pelo Construtor. NUNCA set_interior em painel, tampo, prateleira solta, filler ou ripado.
- set_led: slot_ids + led = LED embutido (rasgo na peça + perfil de LED). led.action: add (acrescenta linha), replace (troca o que tem nessas peças), remove (tira). Escolha as peças por led.piece_ids (ids de led_pecas daquele módulo) OU por led.roles (shelf = prateleiras, top = tampo do módulo, bottom = base do módulo, left/right = laterais, back = fundo, front = porta/frente, free = peça solta/painel). led.side: "under" = face de baixo/de dentro (luz pra baixo, o normal sob aéreo e prateleira), "top" = face de cima. led.from_front_mm: distância da FRENTE da peça (padrão 50). led.lines: quantas linhas paralelas (padrão 1). led.margin_mm: margem nas pontas (padrão 0).
  Onde a SAHRA põe LED (Codex seção 6): embaixo dos aéreos (bottom do aéreo, side under) iluminando a bancada; prateleiras de nicho e de vidro (shelf, under); torre de vinho/adega; dentro de closet nas laterais (left/right, vertical). Peça precisa ter espessura pro rasgo — se não der, o portal avisa.
TODOS os números das operações em MILÍMETROS. Nunca invente slot_id, module_id, piece_id, papel ou cor. A ordem é a de execução. O que não dá pra fazer vai em not_done.

COMO LER O PROJETO (JSON): room.ceiling_mm = pé-direito; walls[i].length_mm e openings (x_mm, width_mm, height_mm, sill_mm, mesma origem do x dos módulos); slots[] = módulos atuais (id, module, family, category, mount_type, hint, placement wall/floor, wall_index, x_mm, floor_height_mm, top_mm, width/height/depth_mm, limits, colors, color_options, quantities, builder, interior_atual = como o Construtor está hoje nesse módulo (texto), led_pecas = peças que podem receber LED [{piece_id, papel, nome, LxAxP, leds = linhas já aplicadas}], casco = caixa crua de Componentes); selected_slot_ids = selecionados agora ("este", "esse"); pricing = { total_venda, por slot: venda, custo (chapa, fita, mao_obra, ferragem, comprados), area_m2, pecas } (valores em US$; só admin vê); salvo = projeto salvo em Meus Projetos; fotos_realistas = quantas fotos realistas o projeto já tem; audit = achados do Auditor de produção (erros e avisos reais do projeto — use quando criticar); catalog = módulos disponíveis (w/h/d = [mín, padrão, máx]).

${SKILL_SUSPENSO}

===== CODEX =====
${CODEX}

===== PORTFÓLIO =====
${PORTFOLIO}

===== CONTEXTO DESTA CONVERSA =====
IDIOMA: ${lang}. UNIDADE: ${unidade}.

===== MEMÓRIA DA SAHRA — REGRAS APRENDIDAS COM O MATT, POR CENTRAL =====
Valem MAIS que o Codex quando conflitarem. Regra de ouro vale acima de tudo. Antes de responder, pense em quais centrais a pergunta toca e nas centrais ligadas a elas.
${memoriaPrompt(Array.isArray(b._lessons) ? b._lessons : [], Array.isArray(b._hubs) && b._hubs.length ? b._hubs : HUBS_PADRAO)}

===== PROJETO (JSON) =====
${JSON.stringify(b.project || {})}

===== CATÁLOGO (JSON) =====
${JSON.stringify(b.catalog || [])}

===== CONVERSA ATÉ AGORA =====
${hist}

Responda à ÚLTIMA mensagem do USUÁRIO.`;
}

// ==========================================================================
// IMAGEM DE CONCEITO (05/11, Matt: "ela pode mostrar algumas imagens antes de
// fazer o projeto, pra ter uma ideia melhor. algo simples") — Gemini imagem,
// mesmo modelo da generate-gallery-render (GEMINI_IMAGE_MODEL força outro).
// ==========================================================================
const IMG_MODELS = ["gemini-2.5-flash-image", "gemini-2.5-flash-image-preview"];
async function geraConceito(apiKey: string, descricao: string) {
  const forced = Deno.env.get("GEMINI_IMAGE_MODEL");
  const prompt = `Photorealistic interior design concept image, architectural magazine quality. ${descricao} No people, no text, no logos, no watermark.`;
  let lastErr = "";
  for (const model of [forced, ...IMG_MODELS].filter((m, i, a) => !!m && a.indexOf(m) === i) as string[]) {
    const res = await fetch(`${GEMINI_API_BASE}/models/${model}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "16:9" } },
      }),
      signal: AbortSignal.timeout(90_000),
    }).catch((e) => { lastErr = `${model}: ${(e as Error).message}`; return null; });
    if (!res) continue;
    if (!res.ok) { lastErr = `${model}: ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`; continue; }
    const payload = await res.json().catch(() => null);
    const part = (payload?.candidates?.[0]?.content?.parts || []).find((p: any) => (p.inlineData || p.inline_data)?.data);
    const inline = part && (part.inlineData || part.inline_data);
    if (inline) return { image: inline.data, mime: inline.mimeType || inline.mime_type || "image/png", model };
    lastErr = `${model}: sem imagem`;
  }
  throw new HttpError(502, `Imagem indisponível (${lastErr}).`, "image_failed");
}

// ==========================================================================
// VOZ NATURAL (05/11, Matt: "a voz está muito robô") — Gemini TTS.
// Devolve PCM 16-bit mono (normalmente 24 kHz) em base64; o portal embrulha
// num WAV e toca. Modelo descoberto na conta (nome com "tts"), maior versão.
// ==========================================================================
const TTS_FALLBACK = ["gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"];
let ttsModels: string[] | null = null;
async function ttsCandidates(apiKey: string): Promise<string[]> {
  const forced = Deno.env.get("GEMINI_TTS_MODEL");
  if (!ttsModels) {
    ttsModels = [];
    try {
      const res = await fetch(`${GEMINI_API_BASE}/models?key=${apiKey}&pageSize=200`);
      if (res.ok) {
        const body = await res.json();
        ttsModels = (body?.models || [])
          .map((m: any) => String(m.name || "").replace(/^models\//, ""))
          .filter((n: string) => /^gemini-.*tts/i.test(n))
          .sort((a: string, b: string) => (versionOf(b) - versionOf(a)) || (Number(/pro/i.test(a)) - Number(/pro/i.test(b))));
      }
    } catch { /* fica no fallback */ }
  }
  return [forced, ...(ttsModels || []), ...TTS_FALLBACK].filter((m, i, a) => !!m && a.indexOf(m) === i) as string[];
}

async function sintetizaVoz(apiKey: string, texto: string, lang: string, voz: string) {
  let lastErr = "";
  for (const model of await ttsCandidates(apiKey)) {
    const res = await fetch(`${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // 05/11 (Matt: "ela fala sempre como deve falar antes do que vai falar"):
        // o modelo de TTS lia a instrução de tom em voz alta. Vai só o texto;
        // o tom de conversa já vem do campo "spoken" escrito pela SAHRA.
        contents: [{ role: "user", parts: [{ text: texto }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voz } } },
        },
      }),
      signal: AbortSignal.timeout(60_000),
    }).catch((e) => { lastErr = `${model}: ${(e as Error).message}`; return null; });
    if (!res) continue;
    if (!res.ok) { lastErr = `${model}: ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`; continue; }
    const payload = await res.json().catch(() => null);
    const part = (payload?.candidates?.[0]?.content?.parts || []).find((p: any) => p.inlineData?.data);
    if (part) return { audio: part.inlineData.data, mime: part.inlineData.mimeType || "audio/L16;rate=24000", model };
    lastErr = `${model}: sem áudio`;
  }
  throw new HttpError(502, `Voz indisponível (${lastErr}).`, "tts_failed");
}

// Regras aprendidas (migration 268, sahra_lessons — RLS só admin): lidas com
// o token de quem chamou, ativas, mais antigas primeiro.
async function carregaAprendizado(req: Request): Promise<any[]> {
  const url = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY");
  const auth = req.headers.get("Authorization") || "";
  if (!url || !anon || !auth) return [];
  const pega = async (sel: string) => {
    const r = await fetch(`${url}/rest/v1/sahra_lessons?active=eq.true&select=${sel}&order=created_at.asc&limit=1000`, {
      headers: { apikey: anon, Authorization: auth },
    });
    if (!r.ok) throw new Error(String(r.status));
    return await r.json();
  };
  try {
    let rows: any[];
    // 269 (centrais) ainda não rodada → cai pro formato da 268
    try { rows = await pega("id,hub,weight,topic,rule"); }
    catch { rows = (await pega("id,topic,rule")).map((x: any) => ({ ...x, hub: null, weight: "normal" })); }
    return Array.isArray(rows) ? rows.filter((x: any) => x && x.rule).map((x: any) => ({ ...x, weight: x.weight || "normal" })) : [];
  } catch { return []; }
}
async function carregaCentrais(req: Request): Promise<any[]> {
  const url = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY");
  const auth = req.headers.get("Authorization") || "";
  if (!url || !anon || !auth) return HUBS_PADRAO;
  try {
    const r = await fetch(`${url}/rest/v1/sahra_hubs?select=slug,name_pt,related&order=sort_order.asc`, { headers: { apikey: anon, Authorization: auth } });
    if (!r.ok) return HUBS_PADRAO;
    const rows = await r.json();
    return Array.isArray(rows) && rows.length ? rows : HUBS_PADRAO;
  } catch { return HUBS_PADRAO; }
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
  // SÓ ADMIN (05/11, Matt: "só pra administrador")
  if (!(await confereAdmin(req))) return json(403, { error: "Só administrador.", code: "forbidden" });

  let b: any;
  try { b = await req.json(); } catch { return json(400, { error: "Corpo inválido (JSON esperado).", code: "bad_body" }); }
  if (typeof b?.image === "string") {
    const d = b.image.trim().slice(0, 1500);
    if (!d) return json(400, { error: "Descrição vazia.", code: "no_text" });
    try { return json(200, await geraConceito(apiKey, d)); }
    catch (e) {
      if (e instanceof HttpError) return json(e.status, { error: e.message, code: e.code });
      return json(500, { error: (e as Error).message || String(e), code: "internal" });
    }
  }
  if (typeof b?.tts === "string") {
    const texto = b.tts.trim().slice(0, 2500);
    if (!texto) return json(400, { error: "Texto vazio.", code: "no_text" });
    try {
      const voz = /^[A-Za-z]{2,20}$/.test(String(b.voice || "")) ? String(b.voice) : "Aoede";
      return json(200, await sintetizaVoz(apiKey, texto, b.lang, voz));
    } catch (e) {
      if (e instanceof HttpError) return json(e.status, { error: e.message, code: e.code });
      return json(500, { error: (e as Error).message || String(e), code: "internal" });
    }
  }
  // conferir regras ensinadas à mão (aba Codex) antes de gravar
  if (Array.isArray(b?.check_learn)) {
    const novas = b.check_learn.map((l: any) => ({ rule: String(l?.rule || "").trim().slice(0, 600), hub: l?.hub || null, weight: l?.weight || null }))
      .filter((l: any) => l.rule).slice(0, 5);
    if (!novas.length) return json(400, { error: "Regra vazia.", code: "no_text" });
    try {
      let [ex, hubs] = await Promise.all([carregaAprendizado(req), carregaCentrais(req)]);
      // edição: a própria regra não conta como duplicada de si mesma
      if (b.exclude_id) ex = ex.filter((e: any) => String(e.id) !== String(b.exclude_id));
      return json(200, { learn: await checaRegras(apiKey, novas, ex, hubs, b.lang, b.scope === "all") });
    } catch (e) {
      if (e instanceof HttpError) return json(e.status, { error: e.message, code: e.code });
      return json(500, { error: (e as Error).message || String(e), code: "internal" });
    }
  }
  const msgs = Array.isArray(b?.messages) ? b.messages : [];
  if (!msgs.length || !String(msgs[msgs.length - 1]?.text || "").trim()) return json(400, { error: "Escreva uma mensagem.", code: "no_message" });
  if (!b.project || !Array.isArray(b.project.slots)) b.project = { slots: [], walls: [] };
  if (!Array.isArray(b.catalog)) b.catalog = [];
  [b._lessons, b._hubs] = await Promise.all([carregaAprendizado(req), carregaCentrais(req)]);

  try {
    // VELOCIDADE (05/11, Matt: "tem como diminuir o delay?"): raciocínio
    // profundo só quando o pedido é montar/mexer no projeto; conversa,
    // crítica, cor, custo = raciocínio leve (bem mais rápido).
    const ultima = String(msgs[msgs.length - 1]?.text || "");
    const pesado = /\b(faz|fa[cç]a|monta|montar|aplica|aplicar|refaz|redesenh|cria|criar|muda|mudar|troca|trocar|pode fazer|gostei|manda ver|build|design it|lay ?out|apply|make it|haz|arma|aplica|coloca|colocar|p[oõ]e|bota|adiciona|tira|interior|construtor|gaveta|prateleira|led|luz|ilumina)\b/i.test(ultima);
    const { data, model } = await callGemini(apiKey, "flash", [{ text: buildChatPrompt(b) }], CHAT_SCHEMA, pesado ? "deep" : "light");
    const ops = sanitizeEdit(data, b);
    const actions = (Array.isArray(data?.actions) ? data.actions : []).filter((a: any) => a === "photoreal" || a === "render" || a === "audit");
    const novas = (Array.isArray(data?.learn) ? data.learn : [])
      .map((l: any) => ({ hub: HUB_SLUGS.includes(l?.hub) ? l.hub : null, weight: ["ouro", "normal", "preferencia"].includes(l?.weight) ? l.weight : "normal", rule: String(l?.rule || "").trim().slice(0, 600) }))
      .filter((l: any) => l.rule).slice(0, 3);
    let learn: any[] = novas.map((n: any) => ({ ...n, status: "nova", note: "", existing: [] }));
    if (novas.length && b._lessons.length) {
      try { learn = await checaRegras(apiKey, novas, b._lessons, b._hubs, b.lang); }
      catch (e) { console.error("[sahra] checaRegras", e); /* sem checagem: grava como nova */ }
    }
    const concepts = (Array.isArray(data?.concepts) ? data.concepts : []).map((c: any) => String(c || "").trim()).filter(Boolean).slice(0, 2);
    return json(200, { reply: String(data?.reply || ""), spoken: String(data?.spoken || ""), concepts, learn, lessons_count: b._lessons.length, operations: ops.operations, not_done: ops.not_done, summary: ops.summary, actions, model });
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, { error: e.message, code: e.code });
    return json(500, { error: (e as Error).message || String(e), code: "internal" });
  }
});
