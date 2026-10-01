// generate-project-from-photo — Edge Function (Supabase / Deno)
// ------------------------------------------------------------
// v2 (2026-10-01) — "fidelidade máxima" (pedido do Matt: "vamos buscar a
// fidelidade máxima do projeto diante da foto. Passos primordiais:
//   1. identificar onde tem paredes, janelas, portas, aberturas, ângulos,
//      com medidas, altura;
//   2. depois os volumes de móveis, o que tem atrás, na frente, solto no
//      piso").
//
// A v1 pedia TUDO numa resposta só (decodificar + achar módulo + posicionar
// + cor) e numa parede só. Dois problemas:
//   - geometria: cozinha em L/U, pilar, porta, janela — nada disso cabia;
//   - "A IA devolveu JSON inválido": maxOutputTokens 8192 com modelo que
//     PENSA (o raciocínio conta no mesmo orçamento) cortava o JSON no meio
//     (finishReason MAX_TOKENS). Catálogo grande + cozinha cheia = sempre.
//
// Agora são DUAS etapas, cada uma uma chamada desta função (o portal chama
// em sequência, um clique só pro usuário — "tudo de uma vez", decisão do
// Matt 01/10):
//
//   stage='read'  (VISÃO — Pro ou Flash, seletor na tela)
//       Foto → AMBIENTE (paredes em sequência com comprimento, altura e
//       ângulo interno até a próxima; aberturas por parede: porta, janela,
//       passagem, nicho, com x/largura/altura/peitoril) e depois VOLUMES
//       (cada corpo de móvel/eletro com parede, camada — encostado na
//       parede / na frente de outro / solto no piso —, x, medidas, altura do
//       chão, portas, gavetas, acabamento). Sem catálogo no prompt: a
//       atenção do modelo fica 100% na geometria.
//
//   stage='match' (TEXTO+foto — sempre Flash, é casamento de lista)
//       Volumes já medidos + catálogo + cores → módulo real de catálogo por
//       volume (pode dividir uma corrida larga em vários módulos), medidas
//       dentro do min/max, cor do cadastro. O que não tem módulo vai pra
//       `unmatched` e NUNCA vira "parecido" (regra de 24/09 continua).
//
// v3 (2026-10-01, mesmo dia): stage='split' — PDF de projeto inteiro
// separado por ambiente (portal-12-pdf-projetos.js), e o 'read' aceita
// VÁRIAS imagens (images: [{base64, mime, label}]) + source='drawing' (modo
// prancha: cota escrita vale mais que estimativa).
//
// Ordem das propriedades no schema (propertyOrdering) é proposital: o modelo
// escreve as NOTAS de câmera/escala antes dos números, as PAREDES antes das
// aberturas, e as aberturas antes dos volumes — é o raciocínio na ordem que
// o Matt pediu, forçado pela própria estrutura da resposta.
//
// Sanitização continua aqui E no cliente (id fora do catálogo descartado,
// medida clampada, x dentro da parede, abertura dentro da parede).
//
// Deploy (no TERMINAL, na pasta do repo):
//   supabase functions deploy generate-project-from-photo
// Forçar modelo sem mexer no código (opcional, também no terminal):
//   supabase secrets set GEMINI_VISION_PRO_MODEL=nome-do-modelo
//   supabase secrets set GEMINI_TEXT_MODEL=nome-do-modelo

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
async function callGemini(apiKey: string, tier: "pro" | "flash", parts: any[], schema: any) {
  const models = await candidateModels(apiKey, tier);
  let lastErr = "";
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
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

      let res: Response;
      try {
        res = await fetch(`${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig }),
        });
      } catch (e) {
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

class HttpError extends Error {
  constructor(public status: number, message: string, public code: string) { super(message); }
}

// Tolerante: tira cerca ```json, pega do primeiro { ao último }.
function parseLooseJson(text: string): any {
  let t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  try { return JSON.parse(t); } catch { /* segue */ }
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) {
    try { return JSON.parse(t.slice(a, b + 1)); } catch { /* segue */ }
  }
  return null;
}

// ==========================================================================
// ETAPA 1 — LEITURA (ambiente + volumes)
// ==========================================================================
const OPENING_TYPES = ["door", "window", "passage", "niche"];
const VOLUME_LAYERS = ["wall", "front", "floor"];
const VOLUME_KINDS = [
  "base_cabinet", "sink_base", "drawer_base", "corner_base",
  "wall_cabinet", "corner_wall_cabinet", "tall_cabinet", "appliance_housing",
  "open_shelf", "floating_shelf", "wall_panel", "slat_panel", "filler", "end_panel",
  "countertop", "backsplash", "hood", "crown_molding", "toe_kick",
  "refrigerator", "range", "cooktop", "oven", "dishwasher", "microwave", "sink",
  "island", "peninsula", "vanity", "wardrobe", "tv_unit", "desk", "bed", "table",
  "sofa", "tv", "column", "beam", "other",
];

const READ_SCHEMA = {
  type: "OBJECT",
  properties: {
    camera_notes: { type: "STRING" },
    scale_notes: { type: "STRING" },
    ceiling_mm: { type: "NUMBER" },
    walls: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          label: { type: "STRING" },
          length_mm: { type: "NUMBER" },
          height_mm: { type: "NUMBER" },
          angle_to_next_deg: { type: "NUMBER" },
          fully_visible: { type: "BOOLEAN" },
          notes: { type: "STRING" },
        },
        required: ["label", "length_mm", "height_mm", "angle_to_next_deg", "fully_visible"],
        propertyOrdering: ["label", "notes", "fully_visible", "length_mm", "height_mm", "angle_to_next_deg"],
      },
    },
    openings: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          wall_index: { type: "INTEGER" },
          type: { type: "STRING", enum: OPENING_TYPES },
          x_mm: { type: "NUMBER" },
          width_mm: { type: "NUMBER" },
          height_mm: { type: "NUMBER" },
          sill_mm: { type: "NUMBER" },
          notes: { type: "STRING" },
        },
        required: ["wall_index", "type", "x_mm", "width_mm", "height_mm", "sill_mm"],
        propertyOrdering: ["wall_index", "type", "notes", "x_mm", "width_mm", "sill_mm", "height_mm"],
      },
    },
    volumes: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          id: { type: "STRING" },
          label: { type: "STRING" },
          kind: { type: "STRING", enum: VOLUME_KINDS },
          wall_index: { type: "INTEGER" },
          layer: { type: "STRING", enum: VOLUME_LAYERS },
          x_mm: { type: "NUMBER" },
          width_mm: { type: "NUMBER" },
          height_mm: { type: "NUMBER" },
          depth_mm: { type: "NUMBER" },
          floor_height_mm: { type: "NUMBER" },
          wall_offset_mm: { type: "NUMBER" },
          facing: { type: "STRING", enum: ["into_room", "toward_wall"] },
          doors: { type: "INTEGER" },
          drawers: { type: "INTEGER" },
          front_style: { type: "STRING" },
          color_description: { type: "STRING" },
          notes: { type: "STRING" },
        },
        required: ["id", "label", "kind", "wall_index", "layer", "x_mm", "width_mm", "height_mm", "depth_mm", "floor_height_mm", "wall_offset_mm", "doors", "drawers", "front_style", "color_description"],
        propertyOrdering: ["id", "label", "kind", "wall_index", "layer", "notes", "x_mm", "width_mm", "floor_height_mm", "height_mm", "depth_mm", "wall_offset_mm", "facing", "doors", "drawers", "front_style", "color_description"],
      },
    },
    summary: { type: "STRING" },
  },
  required: ["camera_notes", "scale_notes", "ceiling_mm", "walls", "openings", "volumes", "summary"],
  propertyOrdering: ["camera_notes", "scale_notes", "ceiling_mm", "walls", "openings", "volumes", "summary"],
};

function langName(lang?: string) {
  return lang === "en" ? "English" : lang === "es" ? "Spanish" : "Portuguese (Brazil)";
}

function buildReadPrompt(b: any) {
  const ref = Number(b.ref_wall_mm) > 0
    ? `- Comprimento REAL da parede principal (a que tem mais marcenaria, ou a do fundo): ${Math.round(b.ref_wall_mm)} mm — use como escala principal na horizontal.`
    : `- Comprimento da parede principal: NÃO informado — estime pelas referências de escala.`;
  const desenho = b.source === "drawing";
  const intro = desenho
    ? `Você é um projetista de marcenaria planejada com 20 anos de obra. Vai receber PRANCHAS de um projeto em PDF (planta baixa, elevações/vistas, cortes, detalhes, às vezes render) — todas do MESMO ambiente: "${String(b.room_name || "").slice(0, 80)}". Deve LEVANTAR esse ambiente com o máximo de fidelidade. Ainda NÃO escolha produtos — só geometria.

REGRAS DE PRANCHA (valem mais que tudo abaixo):
- COTAS ESCRITAS SÃO A VERDADE. Leia cada cota (mm, cm, m, pés-polegadas como 2'-6" ou 30", frações 34 1/2") e converta pra mm. VÍRGULA DECIMAL é comum (PDF em espanhol/português): "2,83 m" = 2830 mm, "0,6 m" = 600 mm, "85" numa cota em cm = 850 mm. Só estime quando não houver cota.
- Cota total × parciais: confira que as parciais somam a total (ex.: 2,67 + 3,59 + 2,59 = 8,85 m). Se não somarem, confie nas parciais e diga em scale_notes.
- Uma prancha pode ter VÁRIAS vistas (ex.: as duas faces de uma ilha, "lado A"/"lado B", balcão + ilha). Identifique cada vista antes de medir e não some vistas diferentes como se fossem uma parede só.
- RENDERS/fotos do PDF servem pra aparência (cor, veio, puxador, iluminação, o que é porta e o que é painel) — as medidas vêm das pranchas cotadas.
- Use a PLANTA para comprimento das paredes, ângulos, portas/janelas e profundidades; use as ELEVAÇÕES/VISTAS para x, larguras, alturas, altura do chão e divisão de portas/gavetas; CORTES para profundidade.
- Se a prancha tiver outros ambientes junto, IGNORE-OS: levante só "${String(b.room_name || "").slice(0, 80)}".
- Tabelas de módulos/legendas (W24, B36, SB36, DB18, UC…) ajudam a identificar tipo e largura: B=base, W=aéreo, SB=base de pia, DB=gaveteiro, T/UC/P=torre, número = largura em polegadas.
- camera_notes: diga quais pranchas/vistas você usou e para quê.`
    : `Você é um medidor/projetista de marcenaria planejada com 20 anos de obra. Vai receber a FOTO (ou render) de um ambiente e deve LEVANTAR o ambiente com o máximo de fidelidade, como se fosse fazer a medição no local. Ainda NÃO escolha produtos — só geometria.`;
  return `${intro}

DADOS INFORMADOS PELO USUÁRIO (${desenho ? "use só se a prancha não cotar" : "são verdade; prevalecem sobre a sua estimativa"}):
- Pé-direito: ${Math.round(b.ceiling_mm)} mm — ${desenho ? "padrão; se a prancha cotar o pé-direito, use a prancha." : "use como escala principal na vertical."}
${ref}
- Rodapé: ${Math.round(b.baseboard_mm || 0)} mm
${b.notes ? `- Observações: ${String(b.notes).slice(0, 800)}` : ""}

REFERÊNCIAS DE ESCALA (padrão americano e brasileiro — confira umas contra as outras):
- Balcão/base de cozinha: altura do corpo ~ 876 mm (34.5") + tampo ~ 914 mm (36") total; profundidade 610 mm (24"); rodapé recuado ~ 100 mm.
- Aéreo de cozinha: profundidade 305–330 mm (12–13"); base do aéreo ~ 1370–1450 mm do chão (18" acima do tampo); alturas comuns 762/914/1067 mm (30/36/42").
- Torre/paneleiro: 2134–2438 mm (84–96"), profundidade 610 mm.
- Geladeira: 762–914 mm (30–36") de largura, ~1780 mm de altura. Fogão/cooktop: 762 mm (30"). Lava-louças: 610 mm (24"). Coifa: 762–914 mm.
- Porta de passagem: 2032–2134 mm (80–84") de altura, 762–914 mm de largura. Tomada ~ 300 mm do chão; interruptor ~ 1200 mm.
- Larguras de módulo seguem passo de 3" (76,2 mm) em cozinha americana: 229, 305, 381, 457, 533, 610, 762, 914 mm…
- Conte portas: cada porta de base/aéreo tem 230–610 mm de largura. Use a contagem de portas × largura típica pra conferir o comprimento das corridas.

PASSO 1 — CÂMERA E ESCALA ("camera_notes", "scale_notes")
Diga de onde a foto foi tirada (frente, canto, altura do olho), quais paredes aparecem, quais estão cortadas pela borda da foto e quais referências você usou para medir (com o valor de cada uma). Considere a perspectiva: objetos mais longe parecem menores — meça cada coisa RELATIVA às referências que estão no MESMO plano/parede.

PASSO 2 — PAREDES ("walls")
Liste as paredes visíveis em sequência, da ESQUERDA para a DIREITA como aparecem na foto, como se andasse encostado nelas por dentro do ambiente. Inclua os trechos curtos (lados de pilar, recuo de parede, saliência de coluna, chanfro). Para cada parede:
- length_mm: comprimento da face interna, de canto a canto. Se a parede continua fora da foto (fully_visible=false), estime o comprimento provável pelo que aparece + padrão de ambiente, e diga isso em notes.
- height_mm: altura (normalmente = pé-direito; diferente se tiver rebaixo/sanca).
- angle_to_next_deg: ângulo INTERNO (medido por dentro do ambiente) entre esta parede e a próxima: 90 = canto comum de sala; 270 = quina saliente (pilar, coluna que entra no ambiente); 135 = chanfro. Última parede: 0.
Uma parede só = 1 item. Cozinha em L = 2. Em U = 3. Pilar no meio de uma parede = parede, 270, lado do pilar, 90, frente do pilar, 90, outro lado, 270, continuação.

PASSO 3 — ABERTURAS ("openings")
Toda porta, janela, passagem sem porta e nicho/recorte. wall_index = índice em walls (0 = primeira da esquerda). x_mm = distância do INÍCIO da parede (ponta esquerda na foto) até a borda esquerda da abertura (meça pelo vão, sem guarnição). sill_mm = altura do chão até a base (porta/passagem = 0). height_mm = altura do vão. Janela atrás de pia, porta de acesso, vão de corredor — não deixe nenhuma de fora; elas definem onde NÃO pode ter móvel.

PASSO 4 — VOLUMES ("volumes")
Cada corpo de móvel ou equipamento, um por item, em ordem: primeiro tudo que encosta na parede (layer="wall"), depois o que está NA FRENTE de outro móvel (layer="front"), por último o que está SOLTO no piso (layer="floor").
- Corridas de armários: se for possível ver as divisões (juntas, portas, gavetas), crie UM volume por caixa/módulo, não uma corrida inteira. Se não der pra ver, um volume por trecho com o mesmo tipo de frente.
- wall_index: parede em que encosta. Para volume no piso (ilha, mesa), a parede de referência paralela mais próxima.
- x_mm: do início da parede até a borda esquerda do volume (para ilha: projeção da borda esquerda sobre essa parede).
- floor_height_mm: do chão até a base do corpo (base no chão = 0; aéreo = altura da base do aéreo; prateleira = altura da prateleira).
- height_mm/width_mm/depth_mm: do CORPO. Base de cozinha: altura do corpo SEM o tampo (o tampo é volume separado kind="countertop").
- wall_offset_mm: distância da parede até as COSTAS do volume. 0 para tudo encostado. Para layer="front", quanto ele fica afastado da parede (ex.: prateleira na frente de painel ripado de 30 mm = 30). Para layer="floor", distância da parede de referência até as costas da ilha.
- facing (só piso): "into_room" se a frente olha pro centro do ambiente (costas pra parede de referência), "toward_wall" se a frente olha pra parede.
- CANTO EM L (cozinha): olhe o canto com atenção.
  • Base de canto: quando no canto aparecem DUAS portas em 90° (uma em cada parede, se encontrando no canto), é UM volume kind="corner_base" de ~914 × 914 mm (36" × 36"), altura de base. Não divida em duas bases comuns.
  • Aéreo de canto: porta única na DIAGONAL (45°) cortando o canto = kind="corner_wall_cabinet" de ~610 × 610 mm (24" × 24"). Duas portas em 90° no canto alto = também corner_wall_cabinet.
  • O volume de canto vai SEMPRE na parede que vem DEPOIS do canto (a da direita na foto), com x_mm=0, width_mm = o lado dele nessa parede e depth_mm = o lado dele na parede anterior. Os módulos da parede seguinte começam em x = width do canto; a corrida da parede ANTERIOR termina a depth_mm do canto (ex.: canto 914×914 → parede anterior termina em comprimento−914).
  • Sem módulo de canto: a corrida de UMA das paredes vai até o canto e a da outra começa depois da profundidade da primeira (base de 610 de profundidade → x≈610). Nunca sobreponha volumes de paredes vizinhas no canto.
- Nunca coloque volume sobre uma porta/passagem. Embaixo de janela só base (até o peitoril).
- Eletros (geladeira, fogão, coifa, lava-louças, micro-ondas), coluna, viga, TV, sofá também viram volume com o kind certo — eles ocupam espaço.
- doors/drawers: quantas portas e gavetas aparecem na frente do volume. front_style: "shaker", "lisa", "ripada", "vidro", "aberta", "almofadada"… color_description: cor e acabamento como aparecem (ex.: "cinza médio fosco", "carvalho claro com veio").

REGRAS:
- Todas as medidas em mm, números. Coerência: a soma das larguras + vãos numa parede não pode passar do comprimento da parede; aéreo não pode passar do teto; nada fora da parede.
- id dos volumes: "v1", "v2"… únicos.
- label, notes, camera_notes, scale_notes e summary em ${langName(b.lang)}. "summary": 2–3 frases com a leitura do ambiente.
Responda SOMENTE o JSON no schema pedido.`;
}

function num(v: unknown, fb = 0) { const n = Number(v); return Number.isFinite(n) ? n : fb; }
function clamp(n: number, a: number, b: number) { return Math.min(Math.max(n, a), b); }

function sanitizeRead(raw: any, b: any) {
  const ceiling = b.source === "drawing" && num(raw?.ceiling_mm, 0) > 0
    ? clamp(num(raw.ceiling_mm, 2600), 1800, 6000)
    : clamp(num(b.ceiling_mm, num(raw?.ceiling_mm, 2600)), 1800, 6000);
  let walls = (Array.isArray(raw?.walls) ? raw.walls : []).slice(0, 12).map((w: any, i: number) => ({
    label: String(w?.label || `#${i + 1}`).slice(0, 80),
    length_mm: Math.round(clamp(num(w?.length_mm, 3000), 100, 20000)),
    height_mm: Math.round(clamp(num(w?.height_mm, ceiling), 1800, 6000)),
    angle_to_next_deg: num(w?.angle_to_next_deg, 90),
    fully_visible: w?.fully_visible !== false,
    notes: w?.notes ? String(w.notes).slice(0, 300) : "",
  }));
  if (!walls.length) walls = [{ label: "#1", length_mm: Math.round(num(b.ref_wall_mm, 3000)) || 3000, height_mm: Math.round(ceiling), angle_to_next_deg: 0, fully_visible: true, notes: "" }];
  walls.forEach((w: any, i: number) => {
    if (i === walls.length - 1) { w.angle_to_next_deg = 0; return; }
    let a = w.angle_to_next_deg;
    if (!(a >= 20 && a <= 340) || Math.abs(a - 180) < 1) a = 90;
    w.angle_to_next_deg = Math.round(a * 10) / 10;
  });

  const openings = (Array.isArray(raw?.openings) ? raw.openings : []).map((o: any) => {
    const wi = Math.round(num(o?.wall_index, -1));
    if (wi < 0 || wi >= walls.length) return null;
    const L = walls[wi].length_mm, H = walls[wi].height_mm;
    const type = OPENING_TYPES.includes(o?.type) ? o.type : "passage";
    const width = clamp(num(o?.width_mm, 800), 100, L);
    const x = clamp(num(o?.x_mm, 0), 0, Math.max(L - width, 0));
    const sill = type === "door" || type === "passage" ? 0 : clamp(num(o?.sill_mm, 0), 0, H - 100);
    const height = clamp(num(o?.height_mm, 2100), 100, H - sill);
    return { wall_index: wi, type, x_mm: Math.round(x), width_mm: Math.round(width), height_mm: Math.round(height), sill_mm: Math.round(sill), notes: o?.notes ? String(o.notes).slice(0, 200) : "" };
  }).filter(Boolean);

  const seen = new Set<string>();
  const volumes = (Array.isArray(raw?.volumes) ? raw.volumes : []).slice(0, 80).map((v: any, i: number) => {
    let id = String(v?.id || `v${i + 1}`).slice(0, 20);
    if (seen.has(id)) id = `v${i + 1}_${i}`;
    seen.add(id);
    const wi = clamp(Math.round(num(v?.wall_index, 0)), 0, walls.length - 1);
    const L = walls[wi].length_mm, H = walls[wi].height_mm;
    const layer = VOLUME_LAYERS.includes(v?.layer) ? v.layer : "wall";
    const kind = VOLUME_KINDS.includes(v?.kind) ? v.kind : "other";
    const width = clamp(num(v?.width_mm, 600), 10, layer === "floor" ? 20000 : L);
    const height = clamp(num(v?.height_mm, 700), 10, H);
    const depth = clamp(num(v?.depth_mm, 400), 5, 3000);
    const x = layer === "floor" ? clamp(num(v?.x_mm, 0), -5000, L + 5000) : clamp(num(v?.x_mm, 0), 0, Math.max(L - width, 0));
    const fh = clamp(num(v?.floor_height_mm, 0), 0, Math.max(H - height, 0));
    const off = clamp(num(v?.wall_offset_mm, 0), 0, layer === "floor" ? 10000 : 1500);
    return {
      id, label: String(v?.label || kind).slice(0, 80), kind, wall_index: wi, layer,
      x_mm: Math.round(x), width_mm: Math.round(width), height_mm: Math.round(height), depth_mm: Math.round(depth),
      floor_height_mm: Math.round(fh), wall_offset_mm: Math.round(layer === "wall" ? 0 : off),
      facing: v?.facing === "toward_wall" ? "toward_wall" : "into_room",
      doors: clamp(Math.round(num(v?.doors, 0)), 0, 20), drawers: clamp(Math.round(num(v?.drawers, 0)), 0, 20),
      front_style: String(v?.front_style || "").slice(0, 60),
      color_description: String(v?.color_description || "").slice(0, 80),
      notes: v?.notes ? String(v.notes).slice(0, 200) : "",
    };
  });

  return {
    camera_notes: String(raw?.camera_notes || "").slice(0, 800),
    scale_notes: String(raw?.scale_notes || "").slice(0, 800),
    ceiling_mm: Math.round(ceiling),
    walls, openings, volumes,
    summary: String(raw?.summary || "").slice(0, 1000),
  };
}

// ==========================================================================
// ETAPA 2 — CASAMENTO COM O CATÁLOGO
// ==========================================================================
type CatalogModule = {
  id: string; name: string; family: string | null; category: string | null; subcategory: string | null;
  mount_type: string | null; is_decoration: boolean; hint: string | null;
  w: [number | null, number | null, number | null];
  h: [number | null, number | null, number | null];
  d: [number | null, number | null, number | null];
};
type ColorEntry = { name: string; hex: string | null; grain: boolean };

const MATCH_SCHEMA = {
  type: "OBJECT",
  properties: {
    notes: { type: "STRING" },
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          volume_id: { type: "STRING" },
          label: { type: "STRING" },
          module_id: { type: "STRING" },
          x_mm: { type: "NUMBER" },
          width_mm: { type: "NUMBER" },
          height_mm: { type: "NUMBER" },
          depth_mm: { type: "NUMBER" },
          floor_height_mm: { type: "NUMBER" },
          color_name: { type: "STRING" },
        },
        required: ["volume_id", "label", "module_id", "x_mm", "width_mm", "height_mm", "depth_mm", "floor_height_mm", "color_name"],
        propertyOrdering: ["volume_id", "label", "module_id", "x_mm", "width_mm", "height_mm", "depth_mm", "floor_height_mm", "color_name"],
      },
    },
    unmatched: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { volume_id: { type: "STRING" }, reason: { type: "STRING" } },
        required: ["volume_id", "reason"],
      },
    },
  },
  required: ["notes", "items", "unmatched"],
  propertyOrdering: ["notes", "items", "unmatched"],
};

function fmtRange(r: [number | null, number | null, number | null]) {
  const [min, def, max] = r;
  if (min != null && max != null && min === max) return `${min}`;
  return `${min ?? "?"}–${max ?? "?"}(${def ?? "?"})`;
}

function buildMatchPrompt(b: any) {
  const catalog: CatalogModule[] = b.catalog;
  const catText = catalog.map((m) => {
    const tax = [m.family, m.category, m.subcategory].filter(Boolean).join(" › ");
    const extra = [m.mount_type ? `montagem:${m.mount_type}` : null, m.is_decoration ? "decoração" : null, m.hint ? `dica:${m.hint}` : null].filter(Boolean).join("; ");
    return `- ${m.id} | ${m.name} | ${tax} | L ${fmtRange(m.w)} A ${fmtRange(m.h)} P ${fmtRange(m.d)}${extra ? " | " + extra : ""}`;
  }).join("\n");
  const colorsText = (b.colors as ColorEntry[]).map((c) => `- ${c.name}${c.hex ? ` (${c.hex})` : ""}${c.grain ? " — veio de madeira" : ""}`).join("\n");
  const vols = (b.volumes || []).map((v: any) =>
    `- ${v.id} | ${v.kind} | "${v.label}" | parede ${v.wall_index} | camada ${v.layer} | x ${v.x_mm} | L ${v.width_mm} × A ${v.height_mm} × P ${v.depth_mm} | chão ${v.floor_height_mm} | portas ${v.doors} gavetas ${v.drawers} | frente ${v.front_style} | cor "${v.color_description}"`
  ).join("\n");
  return `Você é projetista de móveis planejados. O ambiente da foto JÁ FOI MEDIDO (lista de VOLUMES abaixo, em mm). Sua tarefa é só escolher, para cada volume, o(s) módulo(s) do CATÁLOGO que o reproduzem, e a cor. A foto vai junto só para você conferir estilo de frente, puxador e cor.

REGRAS:
1. module_id = id EXATO do catálogo. Nunca invente.
2. CANTOS: kind="corner_base" → SEMPRE um módulo "Base Canto 90°" (nunca base comum); kind="corner_wall_cabinet" → "Aéreo Canto 45°" (porta Dir./Esq. conforme o lado da dobradiça na foto; na dúvida, Esq.). Medidas do canto: width = lado na parede do volume, depth = lado na parede anterior. Não divida volume de canto.
3. Mesma função: base com portas → módulo base de portas; base de gavetas → gaveteiro; aéreo → aéreo; torre/paneleiro → torre; painel → painel; prateleira → prateleira; etc. Respeite número de portas/gavetas quando o catálogo tiver as duas versões.
4. MEDIDAS: mantenha as do volume (x, largura, altura, profundidade, altura do chão). Só mude quando o módulo não aceitar (fora do min/max) — aí use o valor permitido mais próximo.
5. Volume mais largo que o máximo do módulo (ou que claramente tem 2+ caixas): DIVIDA em vários módulos lado a lado, cobrindo exatamente a largura do volume (soma das larguras = largura do volume; o primeiro começa no x do volume, cada um encostado no anterior). Todos com o mesmo volume_id.
6. Sem módulo equivalente (eletrodoméstico sem módulo de decoração, tampo/countertop sem módulo, TV, sofá, coluna, viga, LED…): vai para "unmatched" com o motivo curto. NUNCA troque por algo parecido de outra função.
7. COR: color_name da lista, pelo aspecto (color_description + foto). Peças iguais na foto = mesmo nome de cor.
8. "notes": 1–3 frases. "label" e "reason" em ${langName(b.lang)}.

VOLUMES MEDIDOS:
${vols}

CATÁLOGO (id | nome | família › categoria › subcategoria | L A P em mm: min–max(padrão)):
${catText}

CORES:
${colorsText}

Responda SOMENTE o JSON no schema pedido.`;
}

function clampR(v: unknown, r: [number | null, number | null, number | null], fb: number) {
  let n = Number(v);
  if (!Number.isFinite(n)) n = r[1] ?? fb;
  if (r[0] != null) n = Math.max(n, r[0]);
  if (r[2] != null) n = Math.min(n, r[2]);
  return Math.round(n * 2) / 2;
}

function sanitizeMatch(raw: any, b: any) {
  const byId = new Map((b.catalog as CatalogModule[]).map((m) => [m.id, m]));
  const volById = new Map((b.volumes || []).map((v: any) => [String(v.id), v]));
  const colorNames = new Set((b.colors as ColorEntry[]).map((c) => c.name));
  const unmatched: { volume_id: string; reason: string }[] = (Array.isArray(raw?.unmatched) ? raw.unmatched : [])
    .map((u: any) => ({ volume_id: String(u?.volume_id || ""), reason: String(u?.reason || "").slice(0, 200) }));
  const items: any[] = [];
  const invalid: { volume_id: string; reason: string }[] = [];
  for (const it of (Array.isArray(raw?.items) ? raw.items : [])) {
    const v: any = volById.get(String(it?.volume_id || ""));
    if (!v) continue;
    const m = byId.get(String(it?.module_id || ""));
    if (!m) { invalid.push({ volume_id: v.id, reason: `módulo "${it?.module_id || "?"}" fora do catálogo` }); continue; }
    let width_mm = clampR(it.width_mm, m.w, v.width_mm);
    // não deixa um módulo ficar bem mais largo que o volume medido
    if (width_mm > v.width_mm + 50) width_mm = clampR(v.width_mm, m.w, v.width_mm);
    // x pode andar dentro do volume (divisão), com folga de 1 módulo pra fora
    const x_mm = Math.round(clamp(num(it.x_mm, v.x_mm), v.x_mm - 50, v.x_mm + v.width_mm - Math.min(width_mm, v.width_mm) + 50));
    items.push({
      volume_id: v.id,
      label: String(it.label || m.name).slice(0, 80),
      module_id: m.id,
      x_mm,
      width_mm,
      height_mm: clampR(it.height_mm, m.h, v.height_mm),
      depth_mm: clampR(it.depth_mm, m.d, v.depth_mm),
      floor_height_mm: Math.round(Math.max(0, num(it.floor_height_mm, v.floor_height_mm))),
      color_name: colorNames.has(String(it.color_name)) ? String(it.color_name) : null,
    });
  }
  // id inventado só vira "não reproduzido" se o volume ficou sem nenhum módulo válido
  for (const u of invalid) if (!items.some((i) => i.volume_id === u.volume_id) && !unmatched.some((x) => x.volume_id === u.volume_id)) unmatched.push(u);
  // volume sem item nenhum e sem motivo → motivo genérico
  const covered = new Set([...items.map((i) => i.volume_id), ...unmatched.map((u) => u.volume_id)]);
  for (const v of (b.volumes || [])) if (!covered.has(String(v.id))) unmatched.push({ volume_id: String(v.id), reason: "" });
  return { notes: String(raw?.notes || "").slice(0, 800), items, unmatched };
}

// ==========================================================================
// ETAPA 0 — SEPARAR UM PDF DE PROJETO POR AMBIENTE (stage='split', 01/10)
// ==========================================================================
// Matt: "ferramenta que leia projetos em pdf completos, separe por ambiente,
// crie uma lista pra selecionar os ambientes a serem criados pela IA
// separadamente, com o mesmo nome de cliente final". O portal renderiza cada
// página do PDF em miniatura (pdf.js) + extrai o texto e manda tudo aqui; a
// IA devolve o cliente e a lista de ambientes com as PÁGINAS de cada um. As
// páginas de cada ambiente selecionado depois vão, em alta, pro stage 'read'
// em modo prancha (source='drawing').
const SPLIT_SCHEMA = {
  type: "OBJECT",
  properties: {
    notes: { type: "STRING" },
    client_name: { type: "STRING" },
    project_title: { type: "STRING" },
    rooms: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          kind: { type: "STRING", enum: ["kitchen", "bathroom", "closet", "bedroom", "living", "laundry", "office", "pantry", "garage", "bar", "other"] },
          pages: { type: "ARRAY", items: { type: "INTEGER" } },
          summary: { type: "STRING" },
          has_dimensions: { type: "BOOLEAN" },
        },
        required: ["name", "kind", "pages", "summary", "has_dimensions"],
        propertyOrdering: ["name", "kind", "pages", "summary", "has_dimensions"],
      },
    },
  },
  required: ["notes", "client_name", "project_title", "rooms"],
  propertyOrdering: ["notes", "client_name", "project_title", "rooms"],
};

function buildSplitPrompt(b: any, nPages: number) {
  const textos = (b.pages || []).map((p: any) => `--- página ${p.page} ---\n${String(p.text || "").slice(0, 1500)}`).join("\n");
  return `Você recebe as ${nPages} páginas de um PDF de projeto de marcenaria/móveis planejados (miniaturas na ordem, cada uma precedida do número da página) e o TEXTO extraído de cada página. Separe o projeto POR AMBIENTE.

O QUE FAZER:
1. "client_name": o nome do cliente final / da obra (carimbo, capa, cabeçalho: "Cliente", "Owner", "Residência X", "Projeto: X"). Só o nome, sem "Residência"/"Projeto". Vazio se não houver.
2. "project_title": título geral do projeto (curto).
3. "rooms": um item por AMBIENTE de marcenaria (Cozinha, Banheiro Suíte, Closet Master, Lavanderia, Sala TV, Home Office, Bar…). Ambientes repetidos com o mesmo nome no PDF (ex.: "Banheiro 1" e "Banheiro 2") são itens SEPARADOS. Para cada um:
   - name: nome curto como aparece no PDF, no idioma do PDF (ex.: "Cocina", "Despensa", "Kitchen", "Master Bath", "Cozinha"); se o PDF não nomear, invente um curto em ${langName(b.lang)}.
   - Projetos em espanhol/inglês: cocina/kitchen, despensa/pantry, baño/bath, vestidor/closet/walk-in, lavandería/laundry, sala/living, bar, barra, oficina/office. Despensa/pantry é ambiente SEPARADO da cozinha quando tem pranchas próprias (ex.: "lado A", "lado B" de um L), mesmo que encostado nela.
   - pages: TODAS as páginas que mostram esse ambiente (planta, elevações, cortes, detalhes, render, tabela de módulos dele), as COTADAS primeiro (plantas/elevações), depois renders. Uma página pode entrar em mais de um ambiente (ex.: planta geral). Em apresentações (PDF de slides com renders e depois pranchas), renders sem cota também contam pro ambiente que mostram.
   - summary: 1 frase do que tem (ex.: "Cozinha em L com ilha, 2 torres").
   - has_dimensions: true se as páginas têm cotas legíveis.
4. Não crie ambiente pra capa, índice, notas gerais, especificações de material ou planta geral sem marcenaria.
5. "notes": 1–2 frases sobre o PDF (quantos ambientes, unidade usada nas cotas).

TEXTO EXTRAÍDO:
${textos}

Responda SOMENTE o JSON no schema pedido.`;
}

function sanitizeSplit(raw: any, nPages: number) {
  const valid = (n: any) => Number.isInteger(Number(n)) && Number(n) >= 1 && Number(n) <= nPages;
  const rooms = (Array.isArray(raw?.rooms) ? raw.rooms : []).slice(0, 40).map((r: any, i: number) => ({
    name: String(r?.name || `Ambiente ${i + 1}`).slice(0, 60),
    kind: String(r?.kind || "other"),
    pages: [...new Set((Array.isArray(r?.pages) ? r.pages : []).filter(valid).map((n: any) => Number(n)))].sort((a: any, b: any) => a - b),
    summary: String(r?.summary || "").slice(0, 200),
    has_dimensions: !!r?.has_dimensions,
  })).filter((r: any) => r.pages.length);
  return {
    notes: String(raw?.notes || "").slice(0, 600),
    client_name: String(raw?.client_name || "").trim().slice(0, 80),
    project_title: String(raw?.project_title || "").trim().slice(0, 120),
    rooms,
  };
}

// Várias imagens (pranchas) por chamada: [{ base64, mime, label }]
function imageParts(b: any) {
  const list = Array.isArray(b.images) && b.images.length
    ? b.images
    : (b.image_base64 ? [{ base64: b.image_base64, mime: b.image_mime || "image/jpeg" }] : []);
  const parts: any[] = [];
  list.slice(0, 8).forEach((im: any, i: number) => {
    if (!im?.base64) return;
    if (list.length > 1) parts.push({ text: im.label ? String(im.label).slice(0, 80) : `Imagem ${i + 1}` });
    parts.push({ inlineData: { mimeType: im.mime || "image/jpeg", data: im.base64 } });
  });
  return parts;
}

// ==========================================================================
// HTTP
// ==========================================================================
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Use POST." });
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return json(500, { error: "GEMINI_API_KEY não configurada nos secrets da função.", code: "no_key" });

  let b: any;
  try { b = await req.json(); } catch { return json(400, { error: "Corpo inválido (JSON esperado).", code: "bad_body" }); }

  const stage = b?.stage === "match" ? "match" : b?.stage === "split" ? "split" : "read";
  const tamanho = JSON.stringify(b.images || b.pages || b.image_base64 || "").length;
  if (tamanho > 14_000_000) return json(413, { error: "Imagens grandes demais — use menos páginas.", code: "too_big" });

  try {
    if (stage === "split") {
      const pages = (Array.isArray(b.pages) ? b.pages : []).slice(0, 60);
      if (!pages.length) return json(400, { error: "PDF sem páginas.", code: "no_image" });
      const parts: any[] = [];
      pages.forEach((p: any) => {
        parts.push({ text: `Página ${p.page}` });
        if (p.base64) parts.push({ inlineData: { mimeType: p.mime || "image/jpeg", data: p.base64 } });
      });
      parts.push({ text: buildSplitPrompt({ ...b, pages }, pages.length) });
      const tier = b.quality === "pro" ? "pro" : "flash";
      const { data, model } = await callGemini(apiKey, tier, parts, SPLIT_SCHEMA);
      return json(200, { ...sanitizeSplit(data, Math.max(...pages.map((p: any) => Number(p.page) || 0))), model });
    }
    const imgs = imageParts(b);
    if (!imgs.length) return json(400, { error: "Foto ausente (image_base64).", code: "no_image" });
    if (stage === "read") {
      if (!(Number(b.ceiling_mm) > 0)) return json(400, { error: "Informe o pé-direito.", code: "bad_measures" });
      const tier = b.quality === "pro" ? "pro" : "flash";
      // imagem ANTES do texto: recomendação do Gemini pra prompt de visão
      const { data, model } = await callGemini(apiKey, tier, [...imgs, { text: buildReadPrompt(b) }], READ_SCHEMA);
      return json(200, { ...sanitizeRead(data, b), model });
    }
    if (!Array.isArray(b.catalog) || !b.catalog.length) return json(400, { error: "Catálogo vazio.", code: "no_catalog" });
    if (!Array.isArray(b.volumes) || !b.volumes.length) return json(200, { notes: "", items: [], unmatched: [], model: null });
    if (!Array.isArray(b.colors)) b.colors = [];
    const { data, model } = await callGemini(apiKey, "flash", [...imgs, { text: buildMatchPrompt(b) }], MATCH_SCHEMA);
    return json(200, { ...sanitizeMatch(data, b), model });
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, { error: e.message, code: e.code });
    return json(500, { error: (e as Error).message || String(e), code: "internal" });
  }
});
