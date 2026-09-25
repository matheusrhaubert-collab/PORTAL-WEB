// generate-project-from-photo — Edge Function (Supabase / Deno)
// ------------------------------------------------------------
// Recebe UMA foto de um ambiente + o catálogo compacto de módulos + a lista
// de cores, e devolve a proposta de projeto: quais módulos, em que posição
// (x a partir da esquerda, altura do chão), com que medidas e cor.
//
// Irmã da generate-project-layout (mesma GEMINI_API_KEY, modelo flash
// multimodal — a foto vai como inlineData no
// mesmo generateContent, não precisa de outro modelo nem outra chave).
//
// Regras (decididas com o Matt em 24/09):
//  - A IA só pode usar module_id que esteja no catálogo recebido. Qualquer
//    coisa da foto sem equivalente (TV, LED, gesso, sofá, cortina) vai pra
//    lista `skipped`, em texto, e NUNCA vira módulo "parecido".
//  - A resposta é sanitizada AQUI (id fora do catálogo descartado, medidas
//    clampadas no min/max, x dentro da parede) e DE NOVO no cliente.
//  - Nada de preço: o cliente cria os módulos pelo motor normal.
//
// Deploy: supabase functions deploy generate-project-from-photo
// (a GEMINI_API_KEY já está nos secrets do projeto — usada pelas outras
// functions; se não estiver: supabase secrets set GEMINI_API_KEY=...)

// Nome de modelo do Gemini é alvo móvel (o 2.5-flash deu 404 na estreia
// desta function, 24/09: "no longer available to new users"). Mesma
// estratégia da generate-project-layout: tenta os candidatos na ordem e cai
// pro próximo em 404. Pra forçar um sem mexer no código:
//   supabase secrets set GEMINI_TEXT_MODEL=nome-do-modelo
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_MODEL_CANDIDATES = [
  "gemini-3.8-flash",
  "gemini-flash-latest",
  "gemini-2.5-flash",
];
let resolvedGeminiModel: string | null = null;
function geminiUrl(model: string) {
  return `${GEMINI_API_BASE}/models/${model}:generateContent`;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type CatalogModule = {
  id: string;
  name: string;
  family: string | null;
  category: string | null;
  subcategory: string | null;
  mount_type: string | null;
  is_decoration: boolean;
  hint: string | null;
  w: [number | null, number | null, number | null];
  h: [number | null, number | null, number | null];
  d: [number | null, number | null, number | null];
};

type ColorEntry = { name: string; hex: string | null; grain: boolean };

type RequestBody = {
  image_base64: string;
  image_mime?: string;
  wall_width_mm: number;
  ceiling_mm: number;
  baseboard_mm?: number;
  notes?: string;
  catalog: CatalogModule[];
  colors: ColorEntry[];
  lang?: string;
};

// Schema fixo da resposta — o Gemini é obrigado a responder nesse formato
// (responseSchema + responseMimeType json). floor_height_mm é OBRIGATÓRIO
// aqui de propósito: é o que expressa "esse rack flutua a 250mm", metade do
// que uma foto comunica (aprendizado do teste de 08/08).
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    wall: {
      type: "OBJECT",
      properties: {
        width_mm: { type: "NUMBER" },
        ceiling_mm: { type: "NUMBER" },
      },
      required: ["width_mm", "ceiling_mm"],
    },
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          label: { type: "STRING" },
          module_id: { type: "STRING" },
          x_mm: { type: "NUMBER" },
          width_mm: { type: "NUMBER" },
          height_mm: { type: "NUMBER" },
          depth_mm: { type: "NUMBER" },
          floor_height_mm: { type: "NUMBER" },
          color_name: { type: "STRING" },
          reason: { type: "STRING" },
        },
        required: ["label", "module_id", "x_mm", "width_mm", "height_mm", "depth_mm", "floor_height_mm", "color_name"],
      },
    },
    skipped: { type: "ARRAY", items: { type: "STRING" } },
    summary: { type: "STRING" },
  },
  required: ["wall", "items", "skipped", "summary"],
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function fmtRange(r: [number | null, number | null, number | null]) {
  const [min, def, max] = r;
  if (min != null && max != null && min === max) return `${min} (fixo)`;
  return `${min ?? "?"}–${max ?? "?"} (padrão ${def ?? "?"})`;
}

function buildCatalogText(catalog: CatalogModule[]) {
  return catalog.map((m) => {
    const tax = [m.family, m.category, m.subcategory].filter(Boolean).join(" › ");
    const extra = [
      m.mount_type ? `montagem: ${m.mount_type}` : null,
      m.is_decoration ? "decoração (não é marcenaria)" : null,
      m.hint ? `dica: ${m.hint}` : null,
    ].filter(Boolean).join("; ");
    return `- id=${m.id} | ${m.name} | ${tax} | L ${fmtRange(m.w)} × A ${fmtRange(m.h)} × P ${fmtRange(m.d)} mm${extra ? " | " + extra : ""}`;
  }).join("\n");
}

function buildColorsText(colors: ColorEntry[]) {
  return colors.map((c) => `- ${c.name}${c.hex ? ` (${c.hex})` : ""}${c.grain ? " — com veio de madeira" : ""}`).join("\n");
}

function buildPrompt(body: RequestBody) {
  const lang = body.lang === "en" ? "English" : body.lang === "es" ? "Spanish" : "Portuguese (Brazil)";
  return `Você é um projetista de móveis planejados. Vai receber a FOTO de um ambiente e deve reproduzi-la como um projeto usando SOMENTE os módulos do catálogo abaixo.

CONTEXTO DA PAREDE (informado pelo usuário — use como escala principal):
- Largura da parede: ${Math.round(body.wall_width_mm)} mm
- Pé-direito (teto): ${Math.round(body.ceiling_mm)} mm
- Rodapé: ${Math.round(body.baseboard_mm || 0)} mm
${body.notes ? `- Observações do usuário: ${body.notes}` : ""}

PROCESSO (siga nesta ordem):
1. DECODIFICAR: liste toda peça de marcenaria visível — painéis (lisos, ripados), prateleiras, nichos, racks/aparadores suspensos, armários, gaveteiros, tampos de fechamento em cima/embaixo de módulos suspensos, laterais de fechamento, rodapés. Estime medidas usando referências de escala (largura da parede, teto, TV ~1230 mm p/ 55", porta ~2100 mm, sofá, tomada a ~300 mm do chão).
2. BUSCAR: para cada peça escolha o módulo do catálogo que melhor corresponde (mesma função: painel ripado → módulo de ripas/slats; painel liso → painel de parede; prateleira → painel horizontal fino; rack suspenso com porta → floating doors; nicho aberto suspenso → floating open; tampo/fechamento → painel horizontal). Respeite min/max de cada eixo. Se uma peça é mais larga que o máximo do módulo, divida em 2 ou mais módulos lado a lado, encostados. Se um rack tem trechos com porta e trechos abertos, separe em módulos por trecho.
3. POSICIONAR: x_mm = distância da borda ESQUERDA da parede até a borda esquerda da peça. floor_height_mm = distância do piso até a base da peça (0 = apoiado no chão). Peças que se sobrepõem em profundidade (prateleira na frente do painel) são normais: painel fica com sua profundidade e a prateleira/rack ganham profundidade = profundidade visível + espessura do painel de fundo, porque encostam na parede atravessando o painel.
4. TAMANHO: width_mm/height_mm/depth_mm em mm, dentro dos limites do módulo. Painel de chão ao teto: altura = teto − rodapé.
5. COR: escolha color_name da lista de cores pelo aspecto visual (madeira clara → cor com veio claro; branco/bege fosco → cor lisa clara; preto → Black…). Use o MESMO nome de cor para peças que na foto são iguais.

REGRAS DURAS:
- module_id tem que ser um id EXATO do catálogo. Nunca invente id.
- O que não tem módulo equivalente (TV, luminária/LED, gesso, cortina, sofá, quadro, eletrodomésticos sem módulo de decoração) vai para "skipped" como texto curto. Não substitua por módulo parecido.
- Não crie módulo para a parede/piso em si.
- Ordene items de trás pra frente: painéis de fundo primeiro, depois prateleiras, depois racks/armários.
- "summary": 2–3 frases em ${lang} explicando a leitura da foto e a escala usada. "label" e "reason" também em ${lang}. "skipped" em ${lang}.
- "wall": sua melhor estimativa da largura da parede e do teto na foto (se bater com o informado, repita o informado).

CATÁLOGO DE MÓDULOS (id | nome | família › categoria › subcategoria | L × A × P em mm):
${buildCatalogText(body.catalog)}

CORES DISPONÍVEIS (use o nome exato):
${buildColorsText(body.colors)}

Responda SOMENTE o JSON no schema pedido.`;
}

function clamp(v: unknown, min: number | null, max: number | null, fallback: number) {
  let n = Number(v);
  if (!Number.isFinite(n)) n = fallback;
  if (min != null) n = Math.max(n, min);
  if (max != null) n = Math.min(n, max);
  return n;
}

// Sanitiza a resposta do modelo: só id do catálogo, medidas clampadas,
// posição dentro da parede, cor existente (senão vai vazio e o cliente usa o
// default do módulo).
function sanitize(raw: any, body: RequestBody) {
  const byId = new Map(body.catalog.map((m) => [m.id, m]));
  const colorNames = new Set(body.colors.map((c) => c.name));
  const skipped: string[] = Array.isArray(raw?.skipped) ? raw.skipped.map((s: unknown) => String(s)).filter(Boolean) : [];
  const items: any[] = [];

  for (const it of (Array.isArray(raw?.items) ? raw.items : [])) {
    const m = byId.get(String(it?.module_id || ""));
    if (!m) {
      if (it?.label) skipped.push(`${it.label} (módulo não encontrado no catálogo)`);
      continue;
    }
    const width_mm = clamp(it.width_mm, m.w[0], m.w[2], m.w[1] ?? 600);
    const height_mm = clamp(it.height_mm, m.h[0], m.h[2], m.h[1] ?? 600);
    const depth_mm = clamp(it.depth_mm, m.d[0], m.d[2], m.d[1] ?? 400);
    const floor_height_mm = clamp(it.floor_height_mm, 0, Math.max(body.ceiling_mm - height_mm, 0), 0);
    const x_mm = clamp(it.x_mm, 0, Math.max(body.wall_width_mm - width_mm, 0), 0);
    const color_name = colorNames.has(String(it.color_name)) ? String(it.color_name) : null;
    items.push({
      label: String(it.label || m.name),
      module_id: m.id,
      x_mm: Math.round(x_mm),
      width_mm: Math.round(width_mm * 2) / 2,
      height_mm: Math.round(height_mm * 2) / 2,
      depth_mm: Math.round(depth_mm * 2) / 2,
      floor_height_mm: Math.round(floor_height_mm),
      color_name,
      reason: it.reason ? String(it.reason) : "",
    });
  }

  return {
    wall: {
      width_mm: clamp(raw?.wall?.width_mm, 500, 20000, body.wall_width_mm),
      ceiling_mm: clamp(raw?.wall?.ceiling_mm, 1800, 6000, body.ceiling_mm),
    },
    items,
    skipped,
    summary: raw?.summary ? String(raw.summary) : "",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Use POST." });

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return json(500, { error: "GEMINI_API_KEY não configurada nos secrets da função." });

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Corpo inválido (JSON esperado)." });
  }

  if (!body?.image_base64) return json(400, { error: "Foto ausente (image_base64)." });
  if (!Array.isArray(body.catalog) || body.catalog.length === 0) return json(400, { error: "Catálogo vazio." });
  if (!Array.isArray(body.colors)) body.colors = [];
  if (!(Number(body.wall_width_mm) > 0) || !(Number(body.ceiling_mm) > 0)) {
    return json(400, { error: "Informe a largura da parede e o pé-direito." });
  }
  // ~1280px JPEG q0.85 fica bem abaixo disso; é só proteção contra payload absurdo.
  if (body.image_base64.length > 6_000_000) return json(413, { error: "Foto grande demais — use uma imagem menor." });

  const geminiReq = {
    contents: [{
      role: "user",
      parts: [
        { text: buildPrompt(body) },
        { inlineData: { mimeType: body.image_mime || "image/jpeg", data: body.image_base64 } },
      ],
    }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      maxOutputTokens: 8192,
    },
  };

  const forced = Deno.env.get("GEMINI_TEXT_MODEL") || null;
  const tentativas = [resolvedGeminiModel, forced, ...GEMINI_MODEL_CANDIDATES]
    .filter((m, i, arr): m is string => !!m && arr.indexOf(m) === i);

  let geminiRes: Response | null = null;
  let lastErr = "";
  for (const model of tentativas) {
    try {
      const res = await fetch(`${geminiUrl(model)}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiReq),
      });
      if (res.status === 404) {
        lastErr = `${model}: 404 (modelo indisponível)`;
        if (resolvedGeminiModel === model) resolvedGeminiModel = null;
        continue;
      }
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        return json(502, { error: `Gemini (${model}) respondeu ${res.status}: ${txt.slice(0, 400)}` });
      }
      resolvedGeminiModel = model;
      geminiRes = res;
      break;
    } catch (e) {
      lastErr = `${model}: ${(e as Error).message}`;
    }
  }
  if (!geminiRes) {
    return json(502, { error: `Nenhum modelo Gemini respondeu (${lastErr}). Tente: supabase secrets set GEMINI_TEXT_MODEL=<modelo>` });
  }

  const payload = await geminiRes.json().catch(() => null);
  const text = payload?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
  if (!text) {
    const reason = payload?.candidates?.[0]?.finishReason || payload?.promptFeedback?.blockReason || "sem texto";
    return json(502, { error: `A IA não devolveu conteúdo (${reason}).` });
  }

  let raw: any;
  try {
    raw = JSON.parse(text);
  } catch {
    return json(502, { error: "A IA devolveu JSON inválido — tente de novo." });
  }

  return json(200, sanitize(raw, body));
});
