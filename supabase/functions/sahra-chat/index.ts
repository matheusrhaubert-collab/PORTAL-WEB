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

const EDIT_OPS = ["resize", "move", "set_color", "set_quantity", "replace_module", "add_module", "remove_module"];

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
        },
        required: ["reason", "op"],
        propertyOrdering: ["reason", "op", "slot_ids", "module_id", "wall_index", "x_mm", "floor_height_mm",
          "width_mm", "height_mm", "depth_mm", "role", "color_name", "piece_id", "quantity", "color_from_slot_id"],
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
    });
  });
  return { understanding: String(data?.understanding || ""), summary: String(data?.summary || ""), operations: ops, not_done: notDone };
}

// ==========================================================================
// CONVERSA DA SAHRA
// ==========================================================================
const CHAT_SCHEMA = {
  type: "OBJECT",
  properties: {
    reply: { type: "STRING" },
    spoken: { type: "STRING" },
    operations: EDIT_SCHEMA.properties.operations,
    not_done: { type: "ARRAY", items: { type: "STRING" } },
    actions: { type: "ARRAY", items: { type: "STRING", enum: ["render", "audit"] } },
    understanding: { type: "STRING" },
    summary: { type: "STRING" },
  },
  required: ["reply", "spoken", "operations", "not_done", "actions"],
  propertyOrdering: ["reply", "spoken", "understanding", "operations", "not_done", "actions", "summary"],
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

COMO VOCÊ CONVERSA (campo reply):
- Em ${lang}, direto, caloroso e prático. Quem fala com você entende de marcenaria: não explique o básico.
- Respostas curtas: no máximo uns 8–12 linhas, a não ser que peçam detalhe. Pode usar listas com "- " e **negrito**. Nada de tabelas.
- Cite a fonte do seu gosto quando couber ("como na ficha 7, next125", "Codex seção 2").
- Medidas pro usuário em ${unidade}. Nunca chame de madeira maciça o que é lâmina ou padrão impresso.
- Use o nome dos módulos como aparecem no projeto (ex.: "#4 Wall Cabinet 30''"; o número é a ordem em slots, começando em 1).
- Quando não souber se a Legno tem um componente, pergunte em vez de inventar.
- Pedido de crítica ("o que achou?"): dê a nota de prêmio (seção 17: ideia, forma, função e usabilidade, diferenciação, responsabilidade, detalhe, de 1 a 5) em uma linha, o que funciona, o que quebra o Codex e as 3 mudanças que mais elevam.
- Custo ("como diminuir o custo?"): use pricing (preço de venda e custo de fábrica por módulo, com chapa, fita, mão de obra, ferragem e comprados, e área de chapa). Aponte os módulos que mais pesam e sugestões concretas que mantêm o desenho: padronizar larguras/alturas, trocar gaveteiro por porta onde não faz falta, unificar cores (menos chapas abertas), menos peças pequenas, painel no lugar de módulo, cor mais barata no interior. Dê a economia estimada quando os números permitirem. Ofereça aplicar.
- Descrição técnica ("descreve o projeto"): texto pronto pra mandar ao cliente ou à produção: ambiente e paredes (medidas), módulos por parede da esquerda para a direita com medidas, materiais/cores por papel, ferragens (dobradiça, corrediça), quantidades e total de venda. Organize por parede, com títulos em **negrito**.
- Renders pra apresentação: o portal tem o "Render decorado" (render realista com IA). Quando pedirem render/imagens/apresentação, coloque "render" em actions (o usuário verá um botão pra abrir) e no reply dê a direção de arte: ângulo, luz, decoração e clima que valorizam o protagonista do projeto, segundo o Codex. Você NÃO gera a imagem sozinha.
- Quando a resposta falar dos erros de produção do Auditor, coloque "audit" em actions.
- Pergunta de cor/tendência: responda com o porquê e diga quais cores do projeto (color_options) fazem isso; ofereça aplicar.

FALA (campo spoken) — o que a SAHRA diz em voz alta. NÃO é a leitura do reply:
- É como uma pessoa de verdade falaria a mesma coisa pra um colega do lado: 2 a 5 frases curtas, tom de conversa, com expressões naturais ("olha", "sabe o que eu faria?", "ficou bonito, mas…", "hmm"), contrações e ritmo de fala.
- Sem listas, sem asteriscos, sem números longos ou medidas exatas (arredonde: "uns trinta polegadas"), sem códigos de módulo. Se o reply é longo (descrição técnica, lista de custos), a fala só resume o principal e diz "deixei os detalhes aqui no texto".
- Mesmo idioma do reply.

QUANDO MEXER NO PROJETO (campo operations):
- Só devolva operações quando o usuário PEDIR para mudar, aplicar, montar ou fazer ("muda", "aplica", "troca", "faz um projeto", "monta", "pode fazer"). Pergunta, opinião ou crítica = operations VAZIO; no reply, ofereça fazer.
- As operações NÃO são aplicadas sozinhas: o usuário vê um botão "Aplicar" e decide. No reply, diga em uma frase o que as operações vão fazer.
- "Faz um projeto" com paredes prontas e poucos ou nenhum módulo: proponha a composição primeiro (protagonista, eixo, onde ficam pia, cooktop/range, geladeira, lava-louças), depois monte com add_module usando SÓ módulos do catálogo, encostados, sem sobrepor, dentro de 0..length_mm de cada parede, desviando de portas e janelas (openings). Bases no chão (floor_height_mm 0); aéreos com o topo alinhado. Prefira torres de altura total e menos aéreos padrão, como manda o Codex. Seja completo: preencha as corridas de verdade (pode passar de 20 operações).
- Formato das operações: igual ao abaixo.

OPERAÇÕES (campo op) — preencha só os campos que a operação usa, o resto null:
- resize: slot_ids + width_mm/height_mm/depth_mm novos (só os que mudam). Pode vir junto floor_height_mm.
- move: slot_ids (normalmente 1) + x_mm e/ou floor_height_mm e/ou wall_index. Só pra placement 'wall'.
- set_color: slot_ids (vazio/null = TODOS) + color_name EXATAMENTE como em color_options + role = chave de color_options ou null.
- set_quantity: slot_ids (1) + piece_id + quantity (dentro de min..max).
- replace_module: slot_ids + module_id do catálogo.
- add_module: module_id + wall_index + x_mm + floor_height_mm + width_mm/height_mm/depth_mm (dentro de w/h/d do catálogo); color_from_slot_id ou color_name.
- remove_module: slot_ids.
TODOS os números das operações em MILÍMETROS. Nunca invente slot_id, module_id, piece_id, papel ou cor. A ordem é a de execução. O que não dá pra fazer vai em not_done.

COMO LER O PROJETO (JSON): room.ceiling_mm = pé-direito; walls[i].length_mm e openings (x_mm, width_mm, height_mm, sill_mm, mesma origem do x dos módulos); slots[] = módulos atuais (id, module, family, category, mount_type, hint, placement wall/floor, wall_index, x_mm, floor_height_mm, top_mm, width/height/depth_mm, limits, colors, color_options, quantities, builder); selected_slot_ids = selecionados agora ("este", "esse"); pricing = { total_venda, por slot: venda, custo (chapa, fita, mao_obra, ferragem, comprados), area_m2, pecas } (valores em US$; só admin vê); audit = achados do Auditor de produção (erros e avisos reais do projeto — use quando criticar); catalog = módulos disponíveis (w/h/d = [mín, padrão, máx]).

${SKILL_SUSPENSO}

===== CODEX =====
${CODEX}

===== PORTFÓLIO =====
${PORTFOLIO}

===== PROJETO (JSON) =====
${JSON.stringify(b.project || {})}

===== CATÁLOGO (JSON) =====
${JSON.stringify(b.catalog || [])}

===== CONVERSA ATÉ AGORA =====
${hist}

Responda à ÚLTIMA mensagem do USUÁRIO.`;
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
  const estilo = lang === "en" ? "Say it like a real person chatting, not reading: a warm, relaxed interior designer talking to a colleague next to her, with natural pauses, lively intonation and conversational rhythm:"
    : lang === "es" ? "Dilo como una persona real conversando, no leyendo: una diseñadora cálida y relajada hablando con un colega a su lado, con pausas naturales y entonación viva:"
    : "Fale em português do Brasil como uma pessoa de verdade conversando, não como quem lê um texto: tom caloroso e descontraído de uma designer brasileira falando com um colega do lado, com pausas naturais, entonação viva e ritmo de conversa:";
  let lastErr = "";
  for (const model of await ttsCandidates(apiKey)) {
    const res = await fetch(`${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `${estilo}\n${texto}` }] }],
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
  const msgs = Array.isArray(b?.messages) ? b.messages : [];
  if (!msgs.length || !String(msgs[msgs.length - 1]?.text || "").trim()) return json(400, { error: "Escreva uma mensagem.", code: "no_message" });
  if (!b.project || !Array.isArray(b.project.slots)) b.project = { slots: [], walls: [] };
  if (!Array.isArray(b.catalog)) b.catalog = [];

  try {
    const { data, model } = await callGemini(apiKey, "flash", [{ text: buildChatPrompt(b) }], CHAT_SCHEMA, "deep");
    const ops = sanitizeEdit(data, b);
    const actions = (Array.isArray(data?.actions) ? data.actions : []).filter((a: any) => a === "render" || a === "audit");
    return json(200, { reply: String(data?.reply || ""), spoken: String(data?.spoken || ""), operations: ops.operations, not_done: ops.not_done, summary: ops.summary, actions, model });
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, { error: e.message, code: e.code });
    return json(500, { error: (e as Error).message || String(e), code: "internal" });
  }
});
