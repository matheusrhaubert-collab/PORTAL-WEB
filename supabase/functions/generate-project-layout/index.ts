// Edge Function: generate-project-layout
//
// O "gerar projeto com IA" da aba Projetos do portal. Diferente da irmã
// generate-gallery-render (que gera IMAGEM), esta gera TEXTO estruturado:
// recebe o catálogo real + as medidas da parede + as respostas do
// questionário e devolve uma LISTA DE MÓDULOS.
//
//   Modelo: gemini-2.5-flash (texto), chave GEMINI_API_KEY — a MESMA já
//   configurada pro modo 'gallery'. Não precisa de secret novo.
//
// ==========================================================================
// A REGRA MAIS IMPORTANTE DESTE ARQUIVO
// ==========================================================================
// A IA NÃO calcula preço, NÃO inventa módulo e NÃO decide coordenada.
// Ela só ESCOLHE, de uma lista fechada que vai no prompt, qual módulo cumpre
// cada função da receita e com que largura. Tudo o mais é determinístico:
//
//   - o id do módulo é validado contra o catálogo enviado (alucinou um id? o
//     item é descartado pelo portal);
//   - a largura é clampada contra width_min_mm/width_max_mm do próprio
//     módulo, aqui E de novo no portal;
//   - a posição X é calculada no portal, sequencialmente;
//   - o preço sai do Pricing.calculateModulePrice de sempre, no cliente;
//   - se faltar função obrigatória (room_recipes.min_qty >= 1), quem completa
//     é o validador do portal, não a IA.
//
// Isso é de propósito. Um LLM é bom em "que combinação de móveis faz sentido
// nesta cozinha de 3200mm" e ruim em "quanto custa e onde exatamente encosta".
// Não afrouxar essa divisão depois — é ela que faz o resultado sair idêntico
// ao fluxo manual (mesmo preço, mesma furação, mesmo 3D).
//
// Deploy (rodar localmente, precisa do Supabase CLI — não dá pra fazer daqui):
//   supabase functions deploy generate-project-layout
//   (a GEMINI_API_KEY já deve estar setada; se não:
//    supabase secrets set GEMINI_API_KEY=sua_chave_aqui)
//
// Se a chave não estiver configurada, devolve 500 com mensagem clara e o
// portal cai num aviso — sem travar a aba Projetos.

// ==========================================================================
// Qual modelo usar — descoberto, não chumbado
// ==========================================================================
// 1ª versão fixava 'gemini-2.5-flash' e tomou 404 na estreia (2026-08-06).
// Nome de modelo do Gemini é alvo móvel: são renomeados, ganham sufixo de
// data e são descontinuados — 404 por nome inválido é o erro mais comum da
// API. Chumbar um nome aqui garante que isso volte a quebrar sozinho daqui a
// alguns meses, sem ninguém ter mexido em nada.
//
// Então: tenta os preferidos na ordem e, se todos derem 404, pergunta pra
// PRÓPRIA API quais modelos existem (ListModels) e escolhe um flash que
// suporte generateContent. O resultado fica em cache no processo, então a
// descoberta acontece no máximo uma vez por instância.
//
// Pra forçar um modelo específico sem mexer no código:
//   supabase secrets set GEMINI_TEXT_MODEL=nome-do-modelo
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_MODEL_CANDIDATES = [
  'gemini-2.5-flash',
  'gemini-flash-latest',
  'gemini-2.0-flash'
];

// Cache do modelo que funcionou (por instância da function).
let resolvedGeminiModel: string | null = null;

function geminiEndpoint(model: string): string {
  return `${GEMINI_API_BASE}/models/${model}:generateContent`;
}

// Pergunta pra API quais modelos existem e escolhe o melhor pro nosso caso:
// texto, rápido e barato. Exclui explicitamente os de imagem/áudio/embedding,
// que também aparecem na lista e dariam erro em generateContent de texto.
async function listUsableGeminiModels(apiKey: string): Promise<string[]> {
  try {
    const res = await fetch(`${GEMINI_API_BASE}/models?key=${apiKey}&pageSize=200`);
    if (!res.ok) {
      console.error('ListModels falhou:', res.status, (await res.text()).slice(0, 400));
      return [];
    }
    const body = await res.json();
    const models: string[] = (body?.models || [])
      .filter((m: any) => Array.isArray(m?.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
      .map((m: any) => String(m.name || '').replace(/^models\//, ''))
      .filter((name: string) => name && !/image|tts|audio|embedding|vision|live|thinking/i.test(name));

    // Flash primeiro (mais barato/rápido pra escolher itens de catálogo),
    // depois o resto como último recurso.
    const flash = models.filter((n) => /flash/i.test(n));
    const outros = models.filter((n) => !/flash/i.test(n));
    console.log('Modelos utilizáveis encontrados:', flash.concat(outros).slice(0, 10).join(', '));
    return flash.concat(outros);
  } catch (err) {
    console.error('Erro ao listar modelos do Gemini:', err);
    return [];
  }
}

// Teto defensivo: catálogo gigante estoura o contexto e deixa a resposta
// lenta e cara à toa. O portal já manda só módulo ativo, visível e COM
// função cadastrada; isto aqui é a segunda linha.
const MAX_CATALOG_ITEMS = 120;
const MAX_PLAN_ITEMS = 40;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function cleanText(value: unknown, maxLen = 400): string | null {
  if (typeof value !== 'string') return null;
  const t = value.replace(/[\r\n]+/g, ' ').trim();
  return t ? t.slice(0, maxLen) : null;
}

// ==========================================================================
// Schema da resposta
// ==========================================================================
// responseSchema + responseMimeType 'application/json' fazem o Gemini
// devolver JSON válido de verdade (structured output), em vez de markdown
// com ```json em volta. Ainda assim o parse abaixo é defensivo — modelo é
// modelo.
//
// `reasoning` NÃO é enfeite: é o que o portal mostra pro cliente ("por que
// essa cozinha ficou assim") e é o primeiro lugar onde você olha quando o
// resultado sai estranho. Vale o custo dos tokens.
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          module_id: { type: 'string' },
          function_key: { type: 'string' },
          width_mm: { type: 'number' },
          wall_index: { type: 'integer' },
          order: { type: 'integer' },
          reasoning: { type: 'string' }
        },
        required: ['module_id', 'function_key', 'width_mm', 'wall_index', 'order']
      }
    }
  },
  required: ['summary', 'items']
};

// ==========================================================================
// Prompt
// ==========================================================================
// Escrito em inglês de propósito (o modelo segue instrução melhor em inglês),
// mas o `summary` é pedido em português porque vai direto pra tela do cliente.
//
// O catálogo entra como JSON compacto em vez de prosa: é uma lista fechada e
// o modelo precisa copiar o id EXATO. Prosa aqui aumenta alucinação de id.
function buildPrompt(params: {
  room: { key: string; name: string; note: string | null };
  walls: Array<{ index: number; width_mm: number; label: string | null }>;
  ceilingMm: number;
  baseboardMm: number;
  recipe: Array<{
    function_key: string;
    function_name: string;
    function_description: string | null;
    mount_hint: string | null;
    min_qty: number;
    max_qty: number | null;
    priority: number;
    placement_note: string | null;
  }>;
  catalog: Array<{
    id: string;
    name: string;
    function_key: string | null;
    mount_type: string | null;
    width_min_mm: number;
    width_max_mm: number;
    width_default_mm: number;
    height_default_mm: number;
    depth_default_mm: number;
    is_decoration: boolean;
    price_hint: number | null;
    ai_hint: string | null;
  }>;
  answers: Record<string, unknown>;
}): string {
  const { room, walls, ceilingMm, baseboardMm, recipe, catalog, answers } = params;

  const wallsText = walls
    .map((w) => `  - wall_index ${w.index}: ${Math.round(w.width_mm)} mm wide${w.label ? ` (${w.label})` : ''}`)
    .join('\n');

  const recipeText = recipe
    .map((r) => {
      const qty = r.max_qty == null
        ? `at least ${r.min_qty}`
        : (r.min_qty === r.max_qty ? `exactly ${r.min_qty}` : `between ${r.min_qty} and ${r.max_qty}`);
      const required = r.min_qty >= 1 ? 'REQUIRED' : 'optional';
      const parts = [
        `  - "${r.function_key}" (${r.function_name}) — ${required}, quantity: ${qty}, priority ${r.priority}`
      ];
      if (r.function_description) parts.push(`      what it is: ${r.function_description}`);
      if (r.placement_note) parts.push(`      placement: ${r.placement_note}`);
      if (r.mount_hint) parts.push(`      mounting: ${r.mount_hint}`);
      return parts.join('\n');
    })
    .join('\n');

  const answersText = Object.entries(answers)
    .map(([k, v]) => `  - ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join('\n');

  return `You are a kitchen and cabinetry designer laying out modular furniture against real walls.

## The room
Room type: ${room.name} (${room.key})
${room.note ? `Design notes for this room type: ${room.note}\n` : ''}Ceiling height: ${ceilingMm} mm
Baseboard height: ${baseboardMm} mm
Walls available:
${wallsText}

## What the customer told us
${answersText || '  (no answers provided)'}

## The recipe — this is a checklist, not a suggestion
Each entry is a FUNCTION the room needs. Fill every REQUIRED function. Respect
the quantity ranges exactly. Higher priority means it gets the good spot and
gets placed first if the wall runs out of room.
${recipeText}

## The catalog — the ONLY modules that exist
You must pick "module_id" values verbatim from this list. Never invent an id,
never modify an id, never output a module that is not in this list.
Widths are in millimetres; you may choose any width between width_min_mm and
width_max_mm for each module you place.

${JSON.stringify(catalog)}

## Your task
Produce the module list for this room.

Rules:
1. Every REQUIRED function in the recipe must be covered by at least its
   min quantity. Never exceed max quantity.
2. Only use module_ids from the catalog above. If no catalog module has the
   function you need, skip that function and say so in the summary — do NOT
   substitute a module with a different function.
3. The sum of width_mm of all FLOOR-standing and TALL modules on a wall must
   not exceed that wall's width. Wall-mounted modules (mount_type "wall")
   form a SEPARATE row above the counter — their widths sum separately and
   also must not exceed the wall width.
4. Prefer filling the wall well: leaving more than ~150 mm of empty wall is a
   wasted opportunity — widen modules (within their min/max) before leaving a
   gap. Never make anything narrower than its width_min_mm.
5. "order" is the left-to-right sequence on that wall, starting at 0, counted
   separately for each wall and for each row (floor row and wall row).
6. Decoration modules (is_decoration true) represent appliances. Place them
   at the same position as the cabinet that hosts them, and give them the
   same width as that cabinet when it makes sense.
7. Use price_hint only as a rough relative signal of how expensive a module
   is, to respect the customer's budget answer. Do not compute any total.
8. "summary" must be written in Brazilian Portuguese, 2 to 4 sentences,
   addressed to the customer, explaining the layout choices in plain words.
   Everything else stays in English/ids.

Output only the JSON described by the schema.`;
}

// ==========================================================================
// Chamada ao Gemini
// ==========================================================================
async function callGemini(prompt: string): Promise<{ data?: any; error?: string; status?: number }> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    return {
      error: 'GEMINI_API_KEY não configurada nesta Edge Function. Rode: supabase secrets set GEMINI_API_KEY=sua_chave',
      status: 500
    };
  }

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      // Temperatura baixa: aqui não se quer criatividade, se quer uma
      // escolha defensável e reproduzível dentro de uma lista fechada.
      temperature: 0.4,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA
    }
  };

  // Ordem de tentativa: o que já funcionou nesta instância > o forçado por
  // secret > os preferidos. Só se TODOS derem 404 é que vale perguntar a
  // lista real pra API (uma requisição a mais, evitada no caminho feliz).
  const forced = Deno.env.get('GEMINI_TEXT_MODEL');
  let tentativas = [resolvedGeminiModel, forced, ...GEMINI_MODEL_CANDIDATES]
    .filter((m): m is string => !!m);
  tentativas = [...new Set(tentativas)];

  let ultimoErro = '';
  let jaListou = false;

  for (let i = 0; i < tentativas.length; i++) {
    const model = tentativas[i];
    let res: Response;
    try {
      res = await fetch(`${geminiEndpoint(model)}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    } catch (err) {
      return { error: `Falha de rede ao chamar o Gemini: ${String(err)}`, status: 502 };
    }

    const raw = await res.text();

    if (res.ok) {
      if (resolvedGeminiModel !== model) {
        resolvedGeminiModel = model;
        console.log('Modelo do Gemini em uso:', model);
      }
      return parseGeminiText(raw);
    }

    // 404 = esse nome de modelo não existe (ou não serve pra generateContent).
    // Segue pro próximo candidato; se acabaram, pergunta pra API quais existem.
    if (res.status === 404) {
      console.warn(`Modelo "${model}" devolveu 404, tentando o próximo.`);
      ultimoErro = `nenhum dos modelos testados existe (último: ${model})`;
      if (resolvedGeminiModel === model) resolvedGeminiModel = null;
      if (i === tentativas.length - 1 && !jaListou) {
        jaListou = true;
        const descobertos = await listUsableGeminiModels(apiKey);
        // Só os que ainda não foram tentados, no máximo 3 (evita varrer a
        // lista inteira e estourar o tempo da function).
        const novos = descobertos.filter((m) => !tentativas.includes(m)).slice(0, 3);
        if (novos.length === 0) {
          return {
            error: 'Nenhum modelo de texto do Gemini disponível para esta chave. Confira a GEMINI_API_KEY no Google AI Studio.',
            status: 502
          };
        }
        tentativas = tentativas.concat(novos);
      }
      continue;
    }

    // Qualquer outro status é erro de verdade (chave inválida, cota, etc.) —
    // não adianta tentar outro modelo. Devolve a mensagem REAL do Google,
    // que costuma dizer exatamente o que fazer.
    console.error('Gemini respondeu erro:', res.status, raw.slice(0, 800));
    let detalhe = '';
    try {
      const parsedErr = JSON.parse(raw);
      detalhe = parsedErr?.error?.message || '';
    } catch { /* corpo não-JSON */ }
    if (res.status === 429) {
      return { error: 'Cota do Gemini esgotada no momento. Tente daqui a pouco.', status: 502 };
    }
    if (res.status === 400 && /API key/i.test(detalhe)) {
      return { error: 'A GEMINI_API_KEY parece inválida. Confira no Google AI Studio.', status: 502 };
    }
    return { error: `Gemini respondeu ${res.status}${detalhe ? ': ' + detalhe.slice(0, 200) : '.'}`, status: 502 };
  }

  return { error: `Não consegui falar com o Gemini — ${ultimoErro}.`, status: 502 };
}

// Extrai o JSON de dentro da resposta do Gemini. Separado de callGemini
// porque agora existem várias tentativas de modelo e o parse é o mesmo pra
// qualquer uma delas.
function parseGeminiText(raw: string): { data?: any; error?: string; status?: number } {

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: 'Resposta do Gemini não é JSON.', status: 502 };
  }

  // O texto vem dentro de candidates[0].content.parts[].text, mesmo com
  // responseMimeType json — o schema garante o CONTEÚDO do texto, não que ele
  // deixe de ser texto.
  const text = parsed?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || '').join('') || '';
  if (!text.trim()) {
    // Bloqueio de segurança do Gemini cai aqui (finishReason SAFETY, sem
    // parts) — vale logar o finishReason porque a mensagem genérica não diz
    // nada quando isso acontece.
    console.error('Gemini devolveu resposta vazia. finishReason:', parsed?.candidates?.[0]?.finishReason);
    return { error: 'Gemini devolveu uma resposta vazia.', status: 502 };
  }

  try {
    return { data: JSON.parse(text) };
  } catch {
    // Cinto e suspensório: se mesmo com responseSchema vier ```json em volta,
    // tenta extrair o primeiro objeto JSON do texto.
    const match = /\{[\s\S]*\}/.exec(text);
    if (match) {
      try { return { data: JSON.parse(match[0]) }; } catch { /* cai no erro abaixo */ }
    }
    console.error('Não consegui parsear o JSON do Gemini:', text.slice(0, 800));
    return { error: 'Gemini devolveu um JSON inválido.', status: 502 };
  }
}

// ==========================================================================
// Saneamento da resposta
// ==========================================================================
// Roda ANTES de devolver pro portal. O portal valida de novo (receita,
// espaço, preço) — isto aqui só garante que nada obviamente inválido
// atravesse: id fora do catálogo, largura fora do min/max, parede que não
// existe.
function sanitizePlan(
  plan: any,
  catalog: Array<{ id: string; width_min_mm: number; width_max_mm: number; width_default_mm: number; function_key: string | null }>,
  wallCount: number
) {
  const byId = new Map(catalog.map((m) => [m.id, m]));
  const rawItems = Array.isArray(plan?.items) ? plan.items : [];
  const dropped: string[] = [];

  const items = rawItems.slice(0, MAX_PLAN_ITEMS).map((it: any) => {
    const mod = byId.get(String(it?.module_id || ''));
    if (!mod) {
      dropped.push(String(it?.module_id || '(vazio)'));
      return null;
    }
    return {
      module_id: mod.id,
      // A função de verdade é a cadastrada no módulo, não a que a IA disse —
      // se ela mentir aqui, o validador do portal contaria função errada.
      function_key: mod.function_key,
      width_mm: Math.round(clampNumber(it?.width_mm, mod.width_min_mm, mod.width_max_mm, mod.width_default_mm)),
      wall_index: Math.round(clampNumber(it?.wall_index, 0, Math.max(wallCount - 1, 0), 0)),
      order: Math.round(clampNumber(it?.order, 0, MAX_PLAN_ITEMS, 0)),
      reasoning: cleanText(it?.reasoning, 240)
    };
  }).filter((x: unknown) => !!x);

  if (dropped.length > 0) {
    console.warn('Itens descartados por module_id fora do catálogo:', dropped.join(', '));
  }

  return {
    summary: cleanText(plan?.summary, 800) || '',
    items,
    dropped_count: dropped.length
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Use POST.' }, 405);

  try {
    const payload = await req.json();
    const room = payload?.room;
    const walls = Array.isArray(payload?.walls) ? payload.walls : [];
    const recipe = Array.isArray(payload?.recipe) ? payload.recipe : [];
    const catalog = Array.isArray(payload?.catalog) ? payload.catalog.slice(0, MAX_CATALOG_ITEMS) : [];
    const answers = (payload?.answers && typeof payload.answers === 'object') ? payload.answers : {};

    if (!room || !room.key) return jsonResponse({ error: 'room.key é obrigatório.' }, 400);
    if (walls.length === 0) return jsonResponse({ error: 'Nenhuma parede informada.' }, 400);
    if (catalog.length === 0) {
      return jsonResponse({
        error: 'Nenhum módulo com função cadastrada. Marque a função dos módulos no admin (aba Taxonomia > Funções) antes de usar o gerador.'
      }, 400);
    }
    if (recipe.length === 0) {
      return jsonResponse({
        error: 'Este ambiente não tem receita cadastrada. Configure em Taxonomia > Receitas de ambiente no admin.'
      }, 400);
    }

    const prompt = buildPrompt({
      room: { key: String(room.key), name: String(room.name || room.key), note: cleanText(room.note, 1200) },
      walls: walls.map((w: any, i: number) => ({
        index: Number(w?.index ?? i),
        width_mm: Number(w?.width_mm) || 0,
        label: cleanText(w?.label, 60)
      })),
      ceilingMm: Number(payload?.ceiling_mm) || 2400,
      baseboardMm: Number(payload?.baseboard_mm) || 0,
      recipe,
      catalog,
      answers
    });

    const { data, error, status } = await callGemini(prompt);
    if (error) return jsonResponse({ error }, status || 500);

    const plan = sanitizePlan(data, catalog, walls.length);
    if (plan.items.length === 0) {
      return jsonResponse({ error: 'A IA não conseguiu montar nenhum módulo válido para este ambiente.' }, 502);
    }
    return jsonResponse(plan, 200);
  } catch (err) {
    console.error('Erro inesperado em generate-project-layout:', err);
    return jsonResponse({ error: String(err && (err as Error).message ? (err as Error).message : err) }, 500);
  }
});
