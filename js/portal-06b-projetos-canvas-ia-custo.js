// portal-06b-projetos-canvas-ia-custo.js — 2/3 do que era
// portal-06-projetos-canvas.js (quebrado de novo em 2026-08-20, ver
// portal_js_monolito_performance na memória do projeto).
// Aba "Projetos": gerador de projeto por IA (migration 080), colisão entre
// módulos, modo câmera no toque (iPad), barras flutuantes do canvas (com a
// vista frontal 2D real do módulo), propriedades do módulo (segurar
// clique), duplicar módulo, contagem real de furos pro preço, $ Fábrica.
// Carrega depois de portal-06a-projetos-canvas-core.js e ANTES de
// portal-06c-projetos-canvas-3d-acoes.js — a ordem importa.

// ==========================================================================
// GERADOR DE PROJETO POR IA (migration 080)
// ==========================================================================
//
// Fluxo: cliente mede a parede nos campos que já existem -> clica "Gerar com
// IA" -> responde 3-4 perguntas -> a Edge Function generate-project-layout
// (Gemini 2.5 Flash, texto) devolve uma lista de módulos -> ESTE arquivo
// valida a lista contra a receita do ambiente (room_recipes), completa o que
// faltou e cria os slots pelo caminho normal (insertProjectModuleDefault).
//
// A DIVISÃO É PROPOSITAL, não afrouxar:
//   IA decide  -> quais módulos e que largura (gosto/proporção).
//   JS decide  -> se o ambiente está completo, onde cada módulo encosta,
//                 quanto custa. Tudo determinístico e auditável.
//
// Por isso o resultado de um projeto gerado por IA é indistinguível de um
// montado na mão: mesmo slot, mesmo preço, mesma furação, mesmo 3D. Ele entra
// sujo (markProjectDirty) e o cliente continua editando normalmente.

let projectAiFunctions = [];   // module_functions
let projectAiRoomTypes = [];   // room_types
let projectAiRecipesByRoom = {}; // room_type_id -> [room_recipes] (com função embutida)
let projectAiRunning = false;

// Altura do chão onde começa a fileira de aéreos. 1400mm é a convenção de
// bancada (900) + faixa livre (500) — não vira campo de cadastro por ora
// porque o cliente pode arrastar depois; se virar reclamação recorrente,
// promover pra coluna em room_types em vez de espalhar constante.
const PROJECT_AI_UPPER_ROW_FLOOR_MM = 1400;

// Perguntas por ambiente. `key` é o que vai no prompt (em português mesmo —
// o Gemini lê bem, e assim o admin consegue relacionar pergunta e resposta
// olhando o log). Ambiente sem entrada aqui cai em PROJECT_AI_COMMON_QUESTIONS
// só, que já é suficiente pra gerar algo razoável.
// labelKey/optionKeys em vez de texto cravado (2026-08-18): estas perguntas
// aparecem PRA QUEM COMPRA, então precisam sair em pt/en/es como todo o resto.
// O texto é resolvido em renderProjectAiQuestions, na hora de desenhar — a
// resposta escolhida vai pra IA já no idioma do cliente, o que é indiferente
// pro modelo e evita ter que manter uma tabela de-para.
const PROJECT_AI_COMMON_QUESTIONS = [
  {
    key: 'orcamento',
    labelKey: 'project_ai.q_budget',
    optionKeys: ['project_ai.q_budget_1', 'project_ai.q_budget_2', 'project_ai.q_budget_3']
  },
  {
    key: 'estilo',
    labelKey: 'project_ai.q_style',
    optionKeys: ['project_ai.q_style_1', 'project_ai.q_style_2', 'project_ai.q_style_3', 'project_ai.q_style_4']
  }
];

const PROJECT_AI_QUESTIONS = {
  kitchen: [
    {
      key: 'quem_cozinha',
      labelKey: 'project_ai.q_cooking',
      optionKeys: ['project_ai.q_cooking_1', 'project_ai.q_cooking_2', 'project_ai.q_cooking_3']
    },
    {
      key: 'eletros',
      labelKey: 'project_ai.q_appliances',
      optionKeys: ['project_ai.q_appliances_1', 'project_ai.q_appliances_2', 'project_ai.q_appliances_3']
    },
    {
      key: 'aereos',
      labelKey: 'project_ai.q_upper',
      optionKeys: ['project_ai.q_upper_1', 'project_ai.q_upper_2', 'project_ai.q_upper_3']
    }
  ],
  closet: [
    {
      key: 'pendurado_vs_dobrado',
      labelKey: 'project_ai.q_hanging',
      optionKeys: ['project_ai.q_hanging_1', 'project_ai.q_hanging_2', 'project_ai.q_hanging_3']
    },
    { key: 'calcados', labelKey: 'project_ai.q_shoes', optionKeys: ['project_ai.q_shoes_1', 'project_ai.q_shoes_2', 'project_ai.q_shoes_3'] }
  ],
  office: [
    { key: 'uso', labelKey: 'project_ai.q_usage', optionKeys: ['project_ai.q_usage_1', 'project_ai.q_usage_2', 'project_ai.q_usage_3'] },
    { key: 'armazenamento', labelKey: 'project_ai.q_storage', optionKeys: ['project_ai.q_storage_1', 'project_ai.q_storage_2', 'project_ai.q_storage_3'] }
  ]
};

function projectAiQuestionsFor(roomKey) {
  return (PROJECT_AI_QUESTIONS[roomKey] || []).concat(PROJECT_AI_COMMON_QUESTIONS);
}

// Carregado uma vez no boot do portal (ver a chamada em initPortal/loadModules
// — junto do resto do catálogo). Falha aqui não pode derrubar a aba Projetos:
// sem migration 080 rodada, as tabelas nem existem e o botão só fica escondido.
async function loadProjectAiConfig() {
  try {
    const [fnRes, roomRes, recipeRes] = await Promise.all([
      supabaseClient.from('module_functions').select('*').eq('active', true).order('sort_order'),
      supabaseClient.from('room_types').select('*').eq('active', true).order('sort_order'),
      supabaseClient.from('room_recipes').select('*').order('priority', { ascending: false })
    ]);
    if (fnRes.error || roomRes.error || recipeRes.error) throw (fnRes.error || roomRes.error || recipeRes.error);
    projectAiFunctions = fnRes.data || [];
    projectAiRoomTypes = roomRes.data || [];
    projectAiRecipesByRoom = {};
    (recipeRes.data || []).forEach((r) => {
      if (!projectAiRecipesByRoom[r.room_type_id]) projectAiRecipesByRoom[r.room_type_id] = [];
      projectAiRecipesByRoom[r.room_type_id].push(r);
    });
  } catch (err) {
    // Silencioso de propósito: quem não rodou a migration não deve ver erro
    // vermelho numa aba que funciona perfeitamente sem esta funcionalidade.
    console.warn('Gerador por IA indisponível (migration 080 rodada?):', err);
    projectAiFunctions = [];
    projectAiRoomTypes = [];
    projectAiRecipesByRoom = {};
  }
  refreshProjectAiButton();
}

// O botão fica SEMPRE visível. A 1ª versão disto escondia o botão quando
// faltava receita ou função cadastrada — e o resultado foi um botão que
// simplesmente não existia, sem nenhuma pista do porquê (o usuário abriu a
// aba, não achou nada e teve que perguntar). Configuração faltando agora é
// explicada ao abrir o modal (projectAiConfigProblem), não escondida.
function refreshProjectAiButton() {
  const btn = document.getElementById('po-proj-ai-open-btn');
  if (!btn) return;
  // DESLIGADO a pedido do usuário (2026-08-06): "desabilita esse botão por
  // enquanto, vamos seguir com ele no futuro". A Edge Function estava
  // devolvendo 503 e a prioridade virou o controle do módulo no iPad.
  // Nada foi apagado — migration 080, admin, Edge Function e todo o código
  // do questionário seguem intactos. Pra religar, troque a linha abaixo por
  //   btn.style.display = '';
  btn.style.display = 'none';
}

// Devolve a mensagem do que está faltando pra usar o gerador, ou null se está
// tudo pronto. Ordem das checagens = ordem em que a pessoa precisa resolver.
function projectAiConfigProblem() {
  if (projectAiRoomTypes.length === 0) {
    return I18n.t('project_ai.config_missing_tables');
  }
  const hasRoomWithRecipe = projectAiRoomTypes.some((rt) => (projectAiRecipesByRoom[rt.id] || []).length > 0);
  if (!hasRoomWithRecipe) {
    return I18n.t('project_ai.config_no_recipe');
  }
  if (!allModules.some((m) => m.function_id)) {
    return I18n.t('project_ai.config_no_function');
  }
  return null;
}

function projectAiFunctionById(id) {
  return projectAiFunctions.find((f) => f.id === id) || null;
}

// ---------- Modal ----------

function openProjectAiModal() {
  const modal = document.getElementById('po-proj-ai-modal');
  if (!modal) return;

  // Configuração faltando: abre o modal mesmo assim, mostrando exatamente o
  // que falta e escondendo o formulário/botão de gerar. Bem melhor que um
  // botão inerte ou invisível.
  const problem = projectAiConfigProblem();
  const formEl = document.getElementById('po-proj-ai-form');
  const runBtn = document.getElementById('po-proj-ai-run-btn');
  if (problem) {
    if (formEl) formEl.style.display = 'none';
    if (runBtn) runBtn.style.display = 'none';
    setProjectAiError(problem);
    setProjectAiStatus('');
    const summaryEl = document.getElementById('po-proj-ai-walls-summary');
    if (summaryEl) summaryEl.textContent = '';
    modal.classList.add('open');
    return;
  }
  if (formEl) formEl.style.display = '';
  if (runBtn) runBtn.style.display = '';

  const roomSel = document.getElementById('po-proj-ai-room-select');
  roomSel.innerHTML = '';
  projectAiRoomTypes
    .filter((rt) => (projectAiRecipesByRoom[rt.id] || []).length > 0)
    .forEach((rt) => {
      const opt = document.createElement('option');
      opt.value = rt.id;
      opt.textContent = rt.name;
      roomSel.appendChild(opt);
    });
  renderProjectAiQuestions();
  renderProjectAiWallsSummary();
  setProjectAiError('');
  setProjectAiStatus('');
  modal.classList.add('open');
}

function closeProjectAiModal() {
  const modal = document.getElementById('po-proj-ai-modal');
  if (modal) modal.classList.remove('open');
}

function selectedProjectAiRoom() {
  const roomSel = document.getElementById('po-proj-ai-room-select');
  const id = roomSel ? roomSel.value : '';
  return projectAiRoomTypes.find((rt) => rt.id === id) || null;
}

function renderProjectAiQuestions() {
  const wrap = document.getElementById('po-proj-ai-questions');
  if (!wrap) return;
  const room = selectedProjectAiRoom();
  wrap.innerHTML = '';
  if (!room) return;
  projectAiQuestionsFor(room.key).forEach((q) => {
    const field = document.createElement('div');
    field.className = 'dim-field';
    const label = document.createElement('label');
    label.textContent = I18n.t(q.labelKey);
    const sel = document.createElement('select');
    sel.className = 'po-proj-library-filter-select';
    sel.dataset.aiQuestionKey = q.key;
    q.optionKeys.map((k) => I18n.t(k)).forEach((optText) => {
      const opt = document.createElement('option');
      opt.value = optText;
      opt.textContent = optText;
      sel.appendChild(opt);
    });
    field.appendChild(label);
    field.appendChild(sel);
    wrap.appendChild(field);
  });
}

function collectProjectAiAnswers() {
  const answers = {};
  document.querySelectorAll('#po-proj-ai-questions select[data-ai-question-key]').forEach((sel) => {
    answers[sel.dataset.aiQuestionKey] = sel.value;
  });
  return answers;
}

// Mostra as medidas que a IA vai receber — vindas dos campos que já existem
// na tela, nunca digitadas de novo aqui (duas fontes de verdade pra mesma
// medida é receita de divergência).
function renderProjectAiWallsSummary() {
  const el = document.getElementById('po-proj-ai-walls-summary');
  if (!el) return;
  const unit = (document.getElementById('po-unit-select') || {}).value || 'mm';
  const parts = getProjectWallRoles().map((role, idx) => {
    const w = getProjectWallWidthMm(idx);
    return I18n.t('project_ai.wall_label', { n: idx + 1, size: formatDimension(w, unit) });
  });
  parts.push(I18n.t('project_ai.ceiling_label', { size: formatDimension(roomSettings.ceiling_mm, unit) }));
  el.textContent = parts.join(' · ');
}

function setProjectAiError(msg) {
  const el = document.getElementById('po-proj-ai-error');
  if (!el) return;
  el.textContent = msg || '';
  el.style.display = msg ? 'block' : 'none';
}

function setProjectAiStatus(msg) {
  const el = document.getElementById('po-proj-ai-status');
  if (!el) return;
  el.textContent = msg || '';
  el.style.display = msg ? 'block' : 'none';
}

// ---------- Catálogo que vai no prompt ----------
//
// Só módulo ATIVO, VISÍVEL e COM FUNÇÃO. `price_hint` é o preço de catálogo
// aproximado (largura padrão, cores padrão) só pra IA respeitar a resposta de
// orçamento — ela não soma nada, o preço de verdade sai do Pricing depois.
// Aqui é o cached do módulo se existir; senão, null (a IA lida bem com
// ausência).
function buildProjectAiCatalog() {
  return allModules
    .filter((m) => m.function_id)
    .map((m) => {
      const fn = projectAiFunctionById(m.function_id);
      return {
        id: m.id,
        name: m.name,
        function_key: fn ? fn.key : null,
        mount_type: m.mount_type || (fn ? fn.mount_hint : null) || 'floor',
        width_min_mm: Number(m.width_min_mm) || 0,
        width_max_mm: Number(m.width_max_mm) || 0,
        width_default_mm: Number(m.width_default_mm) || 0,
        height_default_mm: Number(m.height_default_mm) || 0,
        depth_default_mm: Number(m.depth_default_mm) || 0,
        is_decoration: !!m.is_decoration,
        price_hint: null,
        ai_hint: m.ai_hint || null
      };
    })
    .filter((m) => m.function_key);
}

function buildProjectAiRecipePayload(room) {
  return (projectAiRecipesByRoom[room.id] || []).map((r) => {
    const fn = projectAiFunctionById(r.function_id);
    return {
      function_key: fn ? fn.key : null,
      function_name: fn ? fn.name : '',
      function_description: fn ? fn.description : null,
      mount_hint: fn ? fn.mount_hint : null,
      min_qty: Number(r.min_qty) || 0,
      max_qty: r.max_qty == null ? null : Number(r.max_qty),
      priority: Number(r.priority) || 0,
      placement_note: r.placement_note || null
    };
  }).filter((r) => r.function_key);
}

// ---------- Validação determinística contra a receita ----------
//
// ESTE é o pedaço que garante "ambiente completo" — não o prompt. Roda DEPOIS
// da IA responder:
//   1. corta o que passou do max_qty da função;
//   2. para cada função obrigatória (min_qty >= 1) que ficou faltando,
//      escolhe sozinho um módulo daquela função (o mais estreito que sirva,
//      pra ter mais chance de caber) e injeta;
//   3. devolve os avisos, que o cliente vê depois de gerar.
//
// Nunca "conserta" silenciosamente sem avisar: se completou ou removeu algo,
// isso aparece na tela. Projeto de cozinha errado e silencioso é pior que
// projeto incompleto e explícito.
function enforceProjectAiRecipe(items, room, catalog) {
  const recipe = projectAiRecipesByRoom[room.id] || [];
  const catalogById = new Map(catalog.map((c) => [c.id, c]));
  const warnings = [];
  const kept = [];
  const countByFunction = {};

  items.forEach((it) => {
    const cat = catalogById.get(it.module_id);
    if (!cat) return; // já filtrado na Edge Function, mas nunca confiar
    const key = cat.function_key;
    const rule = recipe.find((r) => {
      const fn = projectAiFunctionById(r.function_id);
      return fn && fn.key === key;
    });
    const max = rule && rule.max_qty != null ? Number(rule.max_qty) : Infinity;
    const current = countByFunction[key] || 0;
    if (current >= max) {
      warnings.push(I18n.t('project_ai.warn_removed_extra', { name: (projectAiFunctions.find((f) => f.key === key) || {}).name || key }));
      return;
    }
    countByFunction[key] = current + 1;
    kept.push({ ...it, function_key: key, mount_type: cat.mount_type, is_decoration: cat.is_decoration });
  });

  // Completa funções obrigatórias que faltaram.
  recipe.forEach((r) => {
    const fn = projectAiFunctionById(r.function_id);
    if (!fn || Number(r.min_qty) < 1) return;
    const have = countByFunction[fn.key] || 0;
    const missing = Number(r.min_qty) - have;
    if (missing <= 0) return;
    const candidates = catalog
      .filter((c) => c.function_key === fn.key)
      .sort((a, b) => a.width_min_mm - b.width_min_mm);
    if (candidates.length === 0) {
      warnings.push(I18n.t('project_ai.warn_function_without_module', { name: fn.name }));
      return;
    }
    for (let i = 0; i < missing; i++) {
      const pick = candidates[0];
      kept.push({
        module_id: pick.id,
        function_key: fn.key,
        mount_type: pick.mount_type,
        is_decoration: pick.is_decoration,
        width_mm: pick.width_default_mm || pick.width_min_mm,
        wall_index: 0,
        order: 999,
        reasoning: null,
        auto_completed: true
      });
      countByFunction[fn.key] = (countByFunction[fn.key] || 0) + 1;
      warnings.push(I18n.t('project_ai.warn_auto_completed', { missing: fn.name, added: pick.name }));
    }
  });

  return { items: kept, warnings };
}

// ---------- Posicionamento (determinístico, nunca vem da IA) ----------
//
// Duas fileiras independentes por parede: chão (floor+tall) e suspensa
// (wall). Cada uma preenche da esquerda pra direita na ordem que a IA pediu.
// Se o que a IA escolheu não cabe, o excedente é CORTADO com aviso, em vez de
// empilhar módulo em cima de módulo — melhor entregar uma parede correta e
// avisar do que uma parede impossível.
//
// Decoração (fogão, geladeira, cuba) NÃO consome largura da fileira: ela
// representa o eletro em cima/dentro de um móvel que já ocupou o espaço. Ela
// é ancorada no X do último módulo não-decorativo da mesma parede.
function layoutProjectAiItems(items) {
  const placed = [];
  const warnings = [];
  const wallCount = getProjectWallCount();

  for (let wallIndex = 0; wallIndex < wallCount; wallIndex++) {
    const wallWidth = getProjectWallWidthMm(wallIndex);
    const onWall = items
      .filter((it) => Number(it.wall_index || 0) === wallIndex)
      .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));

    const cursor = { floor: 0, wall: 0 };
    let lastFloorX = 0;
    let lastFloorWidth = 0;

    onWall.forEach((it) => {
      const isUpper = it.mount_type === 'wall';
      const row = isUpper ? 'wall' : 'floor';
      const width = Number(it.width_mm) || 0;

      if (it.is_decoration) {
        // Ancorada no último móvel colocado no chão desta parede (ou no
        // início, se ainda não houver nenhum).
        placed.push({
          ...it,
          wall_index: wallIndex,
          x_mm: lastFloorX,
          width_mm: Math.min(width || lastFloorWidth, wallWidth),
          floor_height_mm: 0
        });
        return;
      }

      if (cursor[row] + width > wallWidth + 1) {
        warnings.push(I18n.t('project_ai.warn_did_not_fit', { name: moduleNameById(it.module_id), n: wallIndex + 1 }));
        return;
      }
      const x = cursor[row];
      cursor[row] += width;
      if (!isUpper) { lastFloorX = x; lastFloorWidth = width; }
      placed.push({
        ...it,
        wall_index: wallIndex,
        x_mm: x,
        width_mm: width,
        floor_height_mm: isUpper ? projectAiUpperRowFloorMm() : 0
      });
    });
  }

  return { placed, warnings };
}

// Altura da fileira suspensa, respeitando o pé direito real do ambiente —
// numa sala de pé direito baixo, 1400mm fixo jogaria o aéreo pro teto.
function projectAiUpperRowFloorMm() {
  const usable = Math.max(roomSettings.ceiling_mm - roomSettings.baseboard_mm, 0);
  return Math.min(PROJECT_AI_UPPER_ROW_FLOOR_MM, Math.max(usable - 600, 0));
}

function moduleNameById(id) {
  const m = allModules.find((mm) => mm.id === id);
  return m ? m.name : I18n.t('project_ai.module_fallback_name');
}

// Traduz o erro de supabaseClient.functions.invoke numa frase que diz o que
// FAZER. supabase-js embrulha a resposta HTTP em error.context (um Response),
// e o corpo dela tem a mensagem escrita na própria Edge Function — sem ler
// isso, todo problema vira um "não respondeu" genérico que não ajuda ninguém.
async function describeEdgeFunctionError(error, data, functionName) {
  if (data && data.error) return data.error;

  const status = error && error.context && Number(error.context.status);
  if (status === 404) {
    return I18n.t('project_ai.err_function_not_deployed', { fn: functionName });
  }
  if (status === 401 || status === 403) {
    return I18n.t('project_ai.err_no_permission');
  }

  // Tenta ler a mensagem de dentro do corpo da resposta (pode já ter sido
  // consumido; por isso o try).
  if (error && error.context && typeof error.context.json === 'function') {
    try {
      const body = await error.context.json();
      if (body && body.error) return body.error;
    } catch (e) { /* corpo já lido ou não é JSON — segue pro genérico */ }
  }

  if (status) return I18n.t('project_ai.err_status', { status });
  return I18n.t('project_ai.err_network');
}

// ---------- Execução ----------

async function runProjectAiGeneration() {
  if (projectAiRunning) return;
  const room = selectedProjectAiRoom();
  if (!room) { setProjectAiError(I18n.t('project_ai.err_select_room')); return; }

  // Projeto com módulo já posto: gerar SUBSTITUI tudo. Perguntar antes é
  // obrigatório — perder uma cozinha inteira montada na mão por causa de um
  // clique não é aceitável.
  if (projectSlots.length > 0) {
    const ok = confirm(I18n.t('project_ai.confirm_replace'));
    if (!ok) return;
  }

  projectAiRunning = true;
  setProjectAiError('');
  setProjectAiStatus(I18n.t('project_ai.status_calling'));
  const runBtn = document.getElementById('po-proj-ai-run-btn');
  if (runBtn) runBtn.disabled = true;

  try {
    const catalog = buildProjectAiCatalog();
    const recipe = buildProjectAiRecipePayload(room);
    if (catalog.length === 0) throw new Error(I18n.t('project_ai.err_no_module_function'));
    if (recipe.length === 0) throw new Error(I18n.t('project_ai.err_no_recipe'));

    const walls = getProjectWallRoles().map((role, idx) => ({
      index: idx,
      width_mm: getProjectWallWidthMm(idx),
      label: `parede ${idx + 1} (${role})`
    }));

    const { data, error } = await supabaseClient.functions.invoke('generate-project-layout', {
      body: {
        room: { key: room.key, name: room.name, note: room.questionnaire_note },
        walls,
        ceiling_mm: roomSettings.ceiling_mm,
        baseboard_mm: roomSettings.baseboard_mm,
        recipe,
        catalog,
        answers: collectProjectAiAnswers()
      }
    });

    // supabase-js marca como "error" por status HTTP, mas o corpo ainda traz
    // a mensagem boa da function — mesmo tratamento do generate-gallery-render.
    //
    // A 1ª versão disto devolvia sempre "A IA não respondeu, tente de novo",
    // o que mandou o usuário tentar de novo várias vezes quando a causa real
    // era a Edge Function nem estar publicada (404). Agora o motivo REAL vem
    // pra tela: 404 = falta deploy, 401/403 = login, e nos outros casos o
    // corpo da resposta (que tem a mensagem escrita na própria function,
    // incluindo "GEMINI_API_KEY não configurada").
    if (error && !(data && data.items)) {
      console.error('generate-project-layout falhou:', error, data);
      throw new Error(await describeEdgeFunctionError(error, data, 'generate-project-layout'));
    }
    if (!data || !Array.isArray(data.items) || data.items.length === 0) {
      throw new Error((data && data.error) || I18n.t('project_ai.err_empty_result'));
    }

    setProjectAiStatus(I18n.t('project_ai.status_building'));
    const { items: enforced, warnings: recipeWarnings } = enforceProjectAiRecipe(data.items, room, catalog);
    const { placed, warnings: layoutWarnings } = layoutProjectAiItems(enforced);
    if (placed.length === 0) throw new Error(I18n.t('project_ai.err_nothing_fits'));

    // Limpa e recria. Sequencial de propósito: insertProjectModuleDefault faz
    // várias queries por módulo e resolve profundidade contra os slots que já
    // estão na parede — em paralelo, a profundidade sairia inconsistente.
    projectSlots = [];
    selectedProjectSlotId = null;
    for (const it of placed) {
      await insertProjectModuleDefault(it.module_id, {
        wall_index: it.wall_index,
        x_mm: it.x_mm,
        width_mm: it.width_mm,
        floor_height_mm: it.floor_height_mm
      });
    }

    renderProjectCanvas();
    markProjectDirty();
    closeProjectAiModal();

    const allWarnings = recipeWarnings.concat(layoutWarnings);
    showProjectAiResult(data.summary, allWarnings);
  } catch (err) {
    setProjectAiError(err.message || String(err));
  } finally {
    projectAiRunning = false;
    setProjectAiStatus('');
    if (runBtn) runBtn.disabled = false;
  }
}

// O "porquê" do layout + o que precisou ser corrigido. Vai no bloco de erro/
// aviso que já existe na aba (po-proj-error), não num alert — o cliente
// precisa poder reler enquanto ajusta os módulos.
function showProjectAiResult(summary, warnings) {
  const el = document.getElementById('po-proj-error');
  if (!el) return;
  const lines = [];
  if (summary) lines.push(summary);
  if (warnings && warnings.length) lines.push(I18n.t('project_ai.auto_adjustments_prefix') + warnings.join(' '));
  if (lines.length === 0) return;
  el.textContent = lines.join(' — ');
  el.style.display = 'block';
}

// ---------- Listeners do modal ----------

(function attachProjectAiListeners() {
  const openBtn = document.getElementById('po-proj-ai-open-btn');
  if (openBtn) openBtn.addEventListener('click', openProjectAiModal);

  const closeBtn = document.getElementById('po-proj-ai-modal-close');
  if (closeBtn) closeBtn.addEventListener('click', closeProjectAiModal);

  const cancelBtn = document.getElementById('po-proj-ai-cancel-btn');
  if (cancelBtn) cancelBtn.addEventListener('click', closeProjectAiModal);

  const runBtn = document.getElementById('po-proj-ai-run-btn');
  if (runBtn) runBtn.addEventListener('click', runProjectAiGeneration);

  const roomSel = document.getElementById('po-proj-ai-room-select');
  if (roomSel) roomSel.addEventListener('change', renderProjectAiQuestions);

  // Fecha no clique fora e no Esc — mesmo padrão do modal de busca.
  const modal = document.getElementById('po-proj-ai-modal');
  if (modal) {
    modal.addEventListener('click', (e) => { if (e.target === modal) closeProjectAiModal(); });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && modal.classList.contains('open') && !projectAiRunning) closeProjectAiModal();
  });
})();

// Reabre o configurador já preenchido com a configuração salva de um slot do
// projeto (clicou "Editar configuração completa" no painel da direita) —
// mesmo padrão de editCompositionSlot, reaproveitando
// restoreSlotStateIntoConfigurator (genérica, não é específica de
// Composição) sem duplicar nada.
async function editProjectSlot(slotId) {
  const slot = projectSlots.find((s) => s.id === slotId);
  if (!slot) return;
  startProjectSlotConfig(slotId);
  try {
    await selectModule(slot.module.id);
    if (!currentModule) throw new Error(I18n.t('composition.edit_module_unavailable_error'));
    restoreSlotStateIntoConfigurator(slot);
  } catch (err) {
    exitProjectSlotConfig();
    const errorEl = document.getElementById('po-proj-error');
    if (errorEl) {
      errorEl.textContent = I18n.t('composition.edit_module_unavailable_error');
      errorEl.style.display = 'block';
    }
  }
}

const projModeCancelBtn = document.getElementById('po-proj-mode-cancel-btn');
if (projModeCancelBtn) {
  projModeCancelBtn.addEventListener('click', () => {
    exitProjectSlotConfig();
    highlightSelectedModuleCard('');
    document.getElementById('po-config-section').style.display = 'none';
    document.getElementById('po-module-description').textContent = '';
    currentModule = null;
    lastItemResult = null;
  });
}

// Posição horizontal padrão de um módulo NOVO — encosta à direita do último
// módulo já colocado NA PAREDE ATIVA (se couber na largura dela), senão
// volta pra x=0. Só um ponto de partida: o cliente arrasta pra reposicionar
// depois (o imã cuida do alinhamento fino).
function computeDefaultProjectSlotX(widthMm) {
  // Nasce DENTRO do vão útil, não em x=0 (2026-08-13). x=0 é o eixo do canto:
  // um módulo colocado ali já nasce metido na parede vizinha, e o usuário
  // ainda ia ter que arrastar pra fora. O recuo é a face interna dela.
  const recuo = projectWallCornerInsetMm(projectActiveWallIndex);
  const wallWidthMm = getProjectWallWidthMm(projectActiveWallIndex) - recuo.fim;
  const sameWallSlots = projectSlotsOnWall(projectActiveWallIndex);
  if (!sameWallSlots.length) return recuo.ini;
  const rightmost = sameWallSlots.reduce((max, s) => Math.max(max, Number(s.x_mm || 0) + Number(s.width_mm || 0)), recuo.ini);
  if (rightmost + widthMm <= wallWidthMm) return rightmost;
  return Math.max(recuo.ini, wallWidthMm - widthMm);
}

// ---------- Canvas 2D: medidas, imã (snap) e profundidade ----------

let projectPxPerMm = 1; // escala atual do canvas, recalculada a cada renderProjectCanvas()
let projectDragState = null;
const PROJECT_SNAP_PX = 10;                    // raio do "imã" em px de TELA — igual em qualquer zoom

// Raio do ímã pra Vista de Canto 3D (mm de verdade, não px de tela — ver
// snapMmOverride em snapProjectSlotAxis/snapProjectEdge). Pedido do usuário
// (2026-07-26, depois de testar o arrastar/esticar em 3D: "esperava
// encaixe automatico" e os módulos não estavam grudando): mais generoso que
// os ~10mm equivalentes do 2D, porque mirar com precisão via raycasting
// numa cena 3D em perspectiva é naturalmente menos preciso que um clique
// direto num canvas DOM plano — um raio pequeno quase nunca disparava.
const PROJECT_SNAP_3D_MM = 30;

// ÍMÃ DE CHÃO (2026-08-12) — "não está indo pro chão. preciso que ele se
// conecte ao chão quando eu puxar arrastando ele".
// O ímã de módulo (snapProjectSlotAxis) só encosta em OUTRO módulo: numa
// parede vazia, ou depois de atravessar a esquina pra uma parede sem
// vizinhos, não havia nada pra grudar e o módulo parava a 20/30mm do piso —
// perto o bastante pra parecer encostado na tela e errado de verdade no
// projeto. O chão passa a ser um alvo de ímã como qualquer outro.
//
// Raio generoso de propósito (mais que os 30mm entre módulos): "no chão" é o
// caso mais comum de todos, e módulo suspenso de verdade (aéreo) fica bem
// acima disso — quem quer 60mm de vão usa o campo de altura, não o arraste.
// 2026-08-12, 2ª rodada: 80mm era pouco pra valer na prática ("nao ta indo pro
// chao o movel"). 250mm é maior que qualquer rodapé e menor que qualquer
// módulo aéreo de verdade — na altura em que se arrasta um móvel de chão, ele
// desce; um armário suspenso a 1,4m não sente nada.
const PROJECT_FLOOR_SNAP_MM = 250;
function snapProjectSlotToFloor(yMm) {
  return (yMm > 0 && yMm <= PROJECT_FLOOR_SNAP_MM) ? 0 : yMm;
}

// Tem outro módulo bem embaixo deste, na faixa de parede que ele ocupa? Só
// serve pra decidir se o ímã de chão pode agir depois da colisão: com um
// vizinho embaixo, "encostar no chão" atravessaria ele.
function projectSlotHasNeighborBelow(slot, xMm, yMm) {
  const w = Number(slot.width_mm || 0);
  const x0 = Number(xMm || 0), x1 = x0 + w;
  return projectSlotsSameWallExcluding(slot).some(function (o) {
    const ox0 = Number(o.x_mm || 0), ox1 = ox0 + Number(o.width_mm || 0);
    const sobrepoeX = ox1 > x0 + 1 && ox0 < x1 - 1;   // 1mm de folga: encostar de lado não conta
    if (!sobrepoeX) return false;
    const topoDoVizinho = Number(o.floor_height_mm || 0) + Number(o.height_mm || 0);
    return topoDoVizinho > 1 && topoDoVizinho <= Number(yMm || 0) + 1;
  });
}
const PROJECT_CLICK_MOVE_THRESHOLD_PX = 4;      // abaixo disso, pointerup vira clique (seleciona) em vez de arraste
// Toque (iPad) — ver attachProjectSlotDrag. 4px de tolerância serve pra
// mouse, mas um dedo nunca fica parado nesse raio: o resultado no tablet era
// todo toque virar arraste e nada selecionar. 12px é a folga típica de dedo;
// 220ms é o tempo de "segurar" antes do arraste engatar (curto o suficiente
// pra não parecer travado, longo o suficiente pra não disparar num tap).
const PROJECT_TOUCH_SLOP_PX = 12;
// Escorregão que ainda vale como TOQUE no card da biblioteca (2026-08-16).
// Acima disso o gesto foi rolagem da lista e não insere nada. Ver
// attachProjectLibraryCardDrag.
const PROJECT_LIB_TAP_SLIP_PX = 24;
const PROJECT_TOUCH_HOLD_MS = 220;
// Segurar parado por este tempo abre as PROPRIEDADES do módulo (cor,
// dimensões, prateleiras) — pedido do usuário 2026-08-06, valendo tanto no
// iPad quanto no navegador com mouse. 500ms é o padrão de "long press" que o
// iOS usa; menos que isso dispara sem querer durante um arraste lento.
const PROJECT_HOLD_MENU_MS = 500;
// Raio (px de tela) em que um toque ainda "pertence" ao módulo já SELECIONADO,
// mesmo que o centro do dedo tenha caído em cima do vizinho — ver
// pickAssemblyAtSticky (viewer3d_composition.js). ~22px é meia largura típica
// da área de contato de um dedo adulto num iPad; menos que isso não resolvia o
// relato ("seleciona o modulo do lado"), muito mais e ficaria difícil trocar
// pro vizinho de propósito.
// 12px (era 22, baixado em 2026-08-13 a pedido do Matt no iPad: "clique fora
// do móvel pega móvel"). O anel grudento existe pra o dedo não PERDER o módulo
// já selecionado por 2-3mm de desvio — não pra alcançar o módulo de longe. Com
// 22px ele ia buscar seleção quase meio centímetro fora do contorno, e no dedo
// isso é bem visível. 12px cobre o desvio real do ponto de contato.
const PROJECT_STICKY_PICK_PX = 12;

// Altura máxima que a BASE (floor_height_mm) de um módulo de `heightMm` pode
// ter sem estourar o teto útil — mesma regra de sempre (pé direito − afastamento
// do teto, agora por módulo — migration_060, ver effectiveCeilingClearanceMm
// − rodapé), só isolada aqui pra também travar o eixo Y do arraste, não só a
// régua de altura do configurador (ver ceilingMaxHeightMm acima, que calcula
// o inverso: altura máxima dada uma base já fixa). `module` opcional (default
// null = sem afastamento nenhum, 0) — passar sempre slot.module quando
// disponível.
function projectSlotMaxFloorHeightMm(heightMm, module) {
  return Math.max(roomSettings.ceiling_mm - effectiveCeilingClearanceMm(module) - roomSettings.baseboard_mm - Number(heightMm || 0), 0);
}

// Limites de x_mm (ao longo da parede) pra este slot, em mm — extraído de
// dentro de clampProjectSlotPosition (2026-09-02) pra virar reutilizável: o
// painel "Posição no ambiente" (portal-06c) precisa dos MESMOS limites pra
// mostrar "quanto falta pra parede de cada lado" sem arriscar divergir do
// que o clamp de verdade aceita. NÃO inclui o desvio por colisão de vizinho
// (xAtual/projectSlotOverlapsNeighbor logo abaixo) — esse é só um resgate
// pontual do clamp em si, não faz sentido num limite pra leitura/edição.
function projectWallSlotXBoundsMm(slot) {
  const idx = Number(slot.wall_index || 0);
  const recuo = projectWallCornerInsetMm(idx);
  const largura = getProjectWallWidthMm(idx) - recuo.ini - recuo.fim;
  const maxX = Math.max(0, largura - Number(slot.width_mm || 0));
  return { min: recuo.ini, max: recuo.ini + maxX };
}
function clampProjectSlotPosition(slot) {
  // Ilha no chão não é limitada por largura de parede nem por pé direito ao
  // longo de um plano vertical — o limite dela é o retângulo do ambiente no
  // piso (ver clampFloorSlotIntoRoom).
  if (isFloorSlot(slot)) return;
  // O MÓDULO PARA NA PAREDE VIZINHA, não dentro dela (2026-08-13).
  //
  // O limite era 0..(largura da parede), e a largura vai até o EIXO do canto —
  // então, no fim da parede, o módulo entrava os 150mm da parede
  // perpendicular. Era o "ele permitiu entrar" que o Matt viu.
  //
  // Agora o vão útil desconta a espessura de quem encosta em cada ponta.
  // Resultado: arrastado até o fim, o módulo encosta EXATAMENTE na face
  // interna da parede vizinha — que é o que se quer num canto de marcenaria.
  const xBounds = projectWallSlotXBoundsMm(slot);
  const maxY = projectSlotMaxFloorHeightMm(slot.height_mm, slot.module);
  // O MÍNIMO É O RECUO — MAS SÓ QUANDO DÁ PRA SAIR SEM ATROPELAR NINGUÉM.
  //
  // Duas exigências que brigam entre si, e a solução é atender as duas:
  //   · módulo NÃO PODE ficar dentro da parede vizinha (o "ainda tá entrando
  //     na parede"), então o mínimo tem que ser recuo.ini;
  //   · o clamp roda em vários pontos SEM passar pela colisão (render, resize,
  //     troca de parede), então empurrar cego mete o módulo no vizinho — foi
  //     exatamente o bug do "um módulo entrou no outro".
  //
  // Aqui: tenta tirar da parede; se o lugar novo colidir com outro módulo, o
  // empurrão é ABORTADO e a posição antiga fica. Sair da parede nunca vale
  // criar sobreposição — e o módulo que ficou pra trás continua acessível
  // (basta arrastar, e aí a colisão trabalha de verdade).
  const xAtual = Number(slot.x_mm || 0);
  let xMin = xBounds.min;
  if (xAtual < xMin && projectSlotOverlapsNeighbor(slot, xMin)) xMin = xAtual;
  slot.x_mm = clamp(xAtual, xMin, xBounds.max);
  slot.floor_height_mm = clamp(Number(slot.floor_height_mm || 0), 0, maxY);
}

// Este módulo, se fosse pra xProposto, encostaria em algum vizinho da MESMA
// parede? Só compara o vão horizontal e a faixa vertical — é o mesmo critério
// da colisão do arraste, sem o resolvedor de deslize (aqui a pergunta é
// sim/não, não "pra onde escorregar").
function projectSlotOverlapsNeighbor(slot, xProposto) {
  const w = Number(slot.width_mm || 0), h = Number(slot.height_mm || 0);
  const y0 = Number(slot.floor_height_mm || 0), y1 = y0 + h;
  return projectSlotsSameWallExcluding(slot).some((o) => {
    const ox = Number(o.x_mm || 0), ow = Number(o.width_mm || 0);
    const oy0 = Number(o.floor_height_mm || 0), oy1 = oy0 + Number(o.height_mm || 0);
    const cruzaX = xProposto < ox + ow - 1 && xProposto + w > ox + 1;
    const cruzaY = y0 < oy1 - 1 && y1 > oy0 + 1;
    return cruzaX && cruzaY;
  });
}

// Quanto cada ponta desta parede é "comida" pela parede que encosta nela.
// Zero quando aquela ponta é livre (parede solta) — aí o módulo pode ir até o
// fim de verdade. Só vale no modelo de segmentos; no modelo antigo das 3
// formas as paredes se encontram por construção e nada muda.
// SEMPRE ZERO desde 2026-08-15 — o módulo vai até o canto de verdade.
//
// Esta função descontava a ESPESSURA da parede vizinha (150mm por padrão) de
// cada ponta, partindo da ideia de que o corpo da vizinha come esse pedaço do
// trecho útil. Só que ele NÃO come: makeWallSurface (viewer3d_composition.js)
// posiciona a parede com o centro recuado espessura/2 no sentido CONTRÁRIO ao
// intoDir, ou seja, a FACE INTERNA da parede é exatamente a polilinha
// desenhada e todo o corpo dela fica FORA do ambiente. Duas paredes que se
// encontram num canto têm as duas faces internas passando pelo ponto do
// canto — não sobra nada pra descontar.
//
// O sintoma era o do Matt (2026-08-15): "quando arrasto ele no canto, ele
// afasta automaticamente" — o módulo parava 150mm antes da esquina e ficava
// um vão. Medido no site publicado: recuo {ini:0, fim:150} numa parede de
// 4000mm com vizinha de 150mm de espessura, e a caixa da parede vizinha
// inteiramente fora do ambiente.
//
// Fica como função (em vez de sumir) porque os ~4 chamadores usam o par
// {ini, fim} pra calcular limite esquerdo/direito e a zona morta de troca de
// parede; devolver zero num ponto só mantém todos eles coerentes. Se um dia a
// parede passar a ser desenhada CENTRADA na polilinha, é aqui que o desconto
// volta — e aí ele vale meia espessura, não uma inteira.
function projectWallCornerInsetMm(wallIndex) {
  return { ini: 0, fim: 0 };
}

// Ímã: dado um valor bruto (posição que o ponteiro pediria) e o tamanho do
// módulo nesse eixo, procura entre os cantos "interessantes" (paredes +
// bordas de todo outro módulo já no ambiente) o mais próximo dentro do raio
// de snap — pedido do usuário: "tipo iman que puxe os cantos dele pra eles
// se conectarem melhor e deixar eles bem alinhados". Mesma função pros dois
// eixos (isXAxis diferencia só qual campo/parede usar).
function snapProjectSlotAxis(rawValue, sizeMm, isXAxis, otherSlots, snapMmOverride) {
  // snapMmOverride (novo, 2026-07-26): a Vista de Canto 3D não tem uma
  // escala px/mm de tela de verdade (a posição vem de raycasting num plano
  // 3D, não de um canvas DOM) — usar PROJECT_SNAP_PX/projectPxPerMm ali daria
  // um raio de imã sem relação nenhuma com a precisão real do mouse naquela
  // vista. Chamadores 3D passam um raio fixo em mm (ver PROJECT_SNAP_3D_MM,
  // attachProject3DEditDrag/handleProject3DResizeMove); a Vista Frontal 2D
  // não passa nada e continua com o cálculo de sempre.
  const snapMm = (snapMmOverride != null) ? snapMmOverride : PROJECT_SNAP_PX / (projectPxPerMm || 1);
  const candidates = [0];
  if (isXAxis) candidates.push(getProjectWallWidthMm() - sizeMm);
  otherSlots.forEach((s) => {
    const pos = isXAxis ? Number(s.x_mm || 0) : Number(s.floor_height_mm || 0);
    const size = isXAxis ? Number(s.width_mm || 0) : Number(s.height_mm || 0);
    candidates.push(pos, pos + size, pos - sizeMm, pos + size - sizeMm);
  });
  let best = rawValue;
  let bestDiff = snapMm;
  candidates.forEach((c) => {
    const diff = Math.abs(c - rawValue);
    if (diff <= bestDiff) { bestDiff = diff; best = c; }
  });
  return best;
}

// Ímã pra ESTICAR (pedido do usuário, 2026-07-21: "eu quero que ao esticar
// ele puxe alinhamento com o que esta na tela.. tipo largura do painel de
// tras") — diferente de snapProjectSlotAxis (que snapa a posição de uma
// caixa de tamanho FIXO sendo movida): aqui só uma BORDA se move (a outra
// fica ancorada), então o candidato de imã é a própria borda de outro
// módulo (início OU fim), não as 4 combinações de início/fim de uma caixa
// inteira. Usado pelas 3 setinhas de esticar módulo (largura esq/dir,
// altura topo) em attachProjectSlotResizeHandle/pointermove abaixo.
function snapProjectEdge(rawEdgeMm, isXAxis, otherSlots, snapMmOverride) {
  const snapMm = (snapMmOverride != null) ? snapMmOverride : PROJECT_SNAP_PX / (projectPxPerMm || 1);
  const candidates = [0];
  if (isXAxis) candidates.push(getProjectWallWidthMm());
  otherSlots.forEach((s) => {
    const pos = isXAxis ? Number(s.x_mm || 0) : Number(s.floor_height_mm || 0);
    const size = isXAxis ? Number(s.width_mm || 0) : Number(s.height_mm || 0);
    candidates.push(pos, pos + size);
  });
  let best = rawEdgeMm;
  let bestDiff = snapMm;
  candidates.forEach((c) => {
    const diff = Math.abs(c - rawEdgeMm);
    if (diff <= bestDiff) { bestDiff = diff; best = c; }
  });
  return best;
}

// Sobreposição de dois retângulos. Ficou SEM CHAMADOR em 2026-08-08 (era usada
// só por resolveProjectSlotDepth, cuja regra foi desligada — ver lá). Mantida
// porque é a única definição de "sobrepõe" do arquivo e a colisão/Vista
// Superior podem precisar dela de novo; a colisão de hoje usa a sua própria
// conta com folga (EPS) em resolveCollisionSlide, que não serve pra um teste
// booleano puro.
function projectRectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// Profundidade (z_order) — REGRA DESLIGADA em 2026-08-08.
//
// Como era: ao soltar um módulo, se a posição final SOBREPUSESSE outro módulo
// da mesma parede, ele virava a camada mais à frente entre os que tocava
// (z_order+1), e o 3D empurrava ele pra fora da parede em degraus de
// FREEFORM_DEPTH_STEP_M (6cm). Nasceu de um pedido antigo ("ao colocar um
// modulo na frente do outro, ele deve levar o modulo novo pra frente").
//
// Por que saiu: pedido do usuário 2026-08-08 — "eliminar a regra que afasta da
// parede quando mexe algum modulo se ja tiver um". Na prática, encostar dois
// módulos (o caso NORMAL de um projeto de marcenaria) era detectado como
// sobreposição em algum momento do arraste e o móvel "pulava" pra frente da
// parede sozinho, saindo do lugar onde vai ser instalado de verdade. Agora
// TODO módulo de parede fica encostado na parede, sempre.
//
// A função continua existindo (e sendo chamada nos mesmos ~8 lugares) em vez
// de sair fora: `z_order` ainda é serializado, ainda é lido pelos dois viewers
// e pelo photoreal.js, e a Vista Superior deriva profundidade dele. Zerar aqui,
// num ponto só, garante que qualquer caminho que "resolvia" profundidade agora
// aterrissa em 0 — inclusive projeto ANTIGO salvo com z_order alto, que se
// corrige sozinho no primeiro movimento (e renderProjectCanvas zera de saída,
// ver lá, pra projeto antigo já ABRIR encostado na parede).
function resolveProjectSlotDepth(slot /* , otherSlots */) {
  slot.z_order = 0;
}

// ==========================================================================
// COLISÃO ENTRE MÓDULOS (botão liga/desliga) — 2026-08-08, 3D de verdade em
// 2026-08-28
// ==========================================================================
// Pedido do usuário: "um botao de colisao deve existir, uma vez ligado os
// moveis ligados na parede nao podem se ultrapassar; quando estiver
// movimentando na parede ele deve parar ao encontrar outro modulo. dos lados
// ou abaixo ou acima". Entre as três opções oferecidas (parar encostado /
// parar + empurrar o vizinho / só avisar em vermelho), escolheu PARAR
// ENCOSTADO — o módulo desliza até tocar o vizinho e trava ali.
//
// Desligado por padrão de propósito: o comportamento de sempre (módulos podem
// se sobrepor, e a sobreposição vira camada de profundidade via
// resolveProjectSlotDepth) continua sendo o default, então nada do que já
// existia muda até o cliente ligar o botão.
let projectCollisionEnabled = false;
try {
  projectCollisionEnabled = localStorage.getItem('legno_proj_collision') === '1';
} catch (e) { /* ok sem persistir */ }

function setProjectCollisionEnabled(on) {
  projectCollisionEnabled = !!on;
  try { localStorage.setItem('legno_proj_collision', projectCollisionEnabled ? '1' : '0'); } catch (e) { /* ok */ }
  const btn = document.getElementById('po-proj-collision-btn');
  if (btn) btn.classList.toggle('active', projectCollisionEnabled);
}

const PROJECT_COLLISION_EPS_MM = 0.5;

// ---- COLISÃO 3D DE VERDADE (2026-08-28) ---------------------------------
// Matt: "a colisao esta funcionando so quando os modulos estao na mesma
// parede ou chao. mas ele falha de um modulo do chao pra parede. ou de uma
// parede pra outra. preciso que a colisao funcione nas 3 dimensoes,
// independente de onde tiver conectado."
//
// A versão antiga (resolveCollisionSlide, removida aqui) comparava
// retângulos { x, y, w, h } num referencial 2D LOCAL — "x ao longo desta
// parede" pra módulo de parede, "X/Z do mundo" pra ilha — e só recebia como
// obstáculo quem já estava nesse MESMO referencial (mesma parede, ou outra
// ilha). Por construção nunca dava pra comparar um módulo desta parede
// contra um da parede vizinha (outro ângulo, outro eixo "x ao longo de"
// completamente diferente) nem um módulo de parede contra uma ilha (planos
// diferentes: um é vertical-ao-longo-da-parede, o outro é o piso).
//
// A correção é comparar todo mundo no MESMO referencial — o MUNDO, em mm,
// com Y = altura — que é o que projectSlotWorldBox3D devolve pra QUALQUER
// slot (parede em qualquer ângulo, ou ilha): um retângulo giro (SAT) no
// plano XZ (centro + meia-largura "ao longo" + meia-largura "pra dentro" +
// ângulo) mais o intervalo vertical [yMin,yMax] que o módulo ocupa. Dois
// módulos colidem em 3D quando os intervalos Y se cruzam E os retângulos XZ
// se cruzam (obbOverlapXZ, Separating Axis Theorem — funciona pra
// retângulos em QUALQUER ângulo relativo, ao contrário do "mesmo eixo" que
// o código antigo exigia).
//
// Pra "deslizar até encostar" (em vez de só travar de vez no primeiro
// toque), maxClearParamAlongPath faz uma busca binária ao longo do
// segmento reto de prev até desired: 24 iterações bastam pra sub-décimo de
// milímetro de precisão em qualquer distância de arraste razoável, e ao
// contrário do algoritmo de "bandas" antigo (que só fazia sentido quando os
// dois retângulos já estavam alinhados no mesmo eixo) não depende de
// nenhuma suposição sobre o ângulo do obstáculo.
//
// A regra "só bloqueia quem eu ainda NÃO estava atravessando" (teste contra
// a posição ANTERIOR, com EPS) continua igual — projeto salvo com
// sobreposição antiga, ou colisão ligada no meio da edição, não pode travar
// o módulo pra sempre.
function projectSlotWorldBox3D(slot, overrides) {
  const ov = overrides || {};
  if (isFloorSlot(slot)) {
    const cx = ov.floorXMm != null ? ov.floorXMm : Number(slot.floor_x_mm || 0);
    const cz = ov.floorZMm != null ? ov.floorZMm : Number(slot.floor_z_mm || 0);
    const rotDeg = ov.floorRotationDeg != null ? ov.floorRotationDeg : Number(slot.floor_rotation_deg || 0);
    // BUG (2026-09-03, Matt: "fiz rotacao no modulo, ele perdeu a referencia,
    // e esta esbarrando em coisas que nao existem... como se ele tivesse na
    // posicao anterior ao giro que foi feito"): a versao antiga só tratava
    // rotação de 90°/270° EXATOS (trocando w/d e travando angleRad em 0) —
    // mas o giro por Shift+arrastar (quantizeProjectRotation) anda de 5 em
    // 5° e só GRUDA num múltiplo de 90 dentro de 7° de diferença; qualquer
    // ângulo fora disso (ex.: 15°, 40°, 235°) caía sempre no ramo "não
    // trocado" com angleRad 0 — a caixa de colisão ficava DESALINHADA (sem
    // giro nenhum), exatamente como se o módulo nunca tivesse girado.
    // obbOverlapXZ já é um SAT de retângulo em QUALQUER ângulo — não precisa
    // (nem deve) de caso especial pra 90°: usar o ângulo real sempre resolve
    // 90/180/270 (mesmo resultado de antes) E qualquer ângulo intermediário.
    // Sinal negativo porque group.rotation.y = floor_rotation_deg (radianos)
    // no Three.js gira o eixo local +X do módulo pra (cosθ, -senθ) em
    // (x,z) — ver renderFreeformWalls (rotationY) — enquanto angleRad aqui
    // segue a convenção (cos(angleRad), sen(angleRad)) = (x,z), igual ao
    // ramo de parede logo abaixo (Math.atan2(alongDirZ, alongDirX)).
    const angleRad = -(rotDeg * Math.PI) / 180;
    return {
      cx, cz, angleRad,
      halfAlongMm: Number(slot.width_mm || 0) / 2, halfIntoMm: Number(slot.depth_mm || 0) / 2,
      yMin: 0, yMax: Number(slot.height_mm || 0)
    };
  }
  const wallGeo = (getProjectWallGeometry() || []).find((w) => w.wallIndex === Number(slot.wall_index || 0));
  if (!wallGeo) return null;
  const alongMm = ov.xMm != null ? ov.xMm : Number(slot.x_mm || 0);
  const wMm = Number(slot.width_mm || 0);
  const dMm = Number(slot.depth_mm || 0);
  const yMin = ov.floorHeightMm != null ? ov.floorHeightMm : Number(slot.floor_height_mm || 0);
  // slot.x_mm é a borda ao longo da parede mais perto da origem dela; a
  // profundidade sempre começa encostada na face da parede (z_order zerado
  // em resolveProjectSlotDepth, "TODO módulo de parede fica encostado na
  // parede, sempre") e estica dMm pra dentro do ambiente — por isso o
  // CENTRO é origin + along*(borda + w/2) + into*(d/2), nunca into*qualquer
  // profundidade acumulada de camada.
  const cx = wallGeo.originX * 1000 + wallGeo.alongDirX * (alongMm + wMm / 2) + wallGeo.intoDirX * (dMm / 2);
  const cz = wallGeo.originZ * 1000 + wallGeo.alongDirZ * (alongMm + wMm / 2) + wallGeo.intoDirZ * (dMm / 2);
  return {
    cx, cz, angleRad: Math.atan2(wallGeo.alongDirZ, wallGeo.alongDirX),
    halfAlongMm: wMm / 2, halfIntoMm: dMm / 2,
    yMin, yMax: yMin + Number(slot.height_mm || 0)
  };
}

// Sobreposição de dois retângulos girados no plano XZ (Separating Axis
// Theorem — 4 eixos candidatos, os 2 lados de cada retângulo; achar UM eixo
// onde as projeções não se tocam já prova que não há sobreposição).
function obbOverlapXZ(a, b, epsMm) {
  const eps = epsMm || 0;
  const axisOf = (rect, i) => (i === 0
    ? [Math.cos(rect.angleRad), Math.sin(rect.angleRad)]
    : [-Math.sin(rect.angleRad), Math.cos(rect.angleRad)]);
  const axes = [axisOf(a, 0), axisOf(a, 1), axisOf(b, 0), axisOf(b, 1)];
  const dx = b.cx - a.cx, dz = b.cz - a.cz;
  const projHalf = (rect, ux, uz) => {
    const ax0 = axisOf(rect, 0), ax1 = axisOf(rect, 1);
    return Math.abs(ax0[0] * ux + ax0[1] * uz) * rect.halfAlongMm
      + Math.abs(ax1[0] * ux + ax1[1] * uz) * rect.halfIntoMm;
  };
  for (const [ux, uz] of axes) {
    const centerDist = Math.abs(dx * ux + dz * uz);
    const reach = projHalf(a, ux, uz) + projHalf(b, ux, uz);
    if (centerDist >= reach - eps) return false; // eixo separador achado
  }
  return true;
}

// Sobreposição 3D = intervalo Y se cruza E retângulo XZ se cruza.
function slotsOverlap3D(boxA, boxB, epsMm) {
  if (!boxA || !boxB) return false;
  const eps = epsMm || 0;
  if (boxA.yMax <= boxB.yMin + eps || boxB.yMax <= boxA.yMin + eps) return false;
  return obbOverlapXZ(boxA, boxB, eps);
}

// TODOS os outros módulos do projeto (parede, qualquer parede, ou ilha),
// convertidos pra caixa 3D em mundo — é isso que permite comparar módulos
// de referenciais diferentes.
function projectAllOtherSlotWorldBoxes(slot) {
  const boxes = [];
  (projectSlots || []).forEach((s) => {
    if (s.id === slot.id) return;
    const b = projectSlotWorldBox3D(s);
    if (b) boxes.push(b);
  });
  return boxes;
}

// Maior fração t (0=prev, 1=desired) do caminho reto prev->desired em que o
// módulo (boxAtT(t)) ainda não colide com nenhum obstáculo — busca binária,
// não assume nada sobre o ângulo/plano do obstáculo. `obstacles` já vem
// filtrada por quem chama (exclui quem já atravessava a posição prev).
function maxClearParamAlongPath(boxAtT, obstacles, epsMm) {
  if (!obstacles.length) return 1;
  if (!obstacles.some((o) => slotsOverlap3D(boxAtT(1), o, epsMm))) return 1;
  if (obstacles.some((o) => slotsOverlap3D(boxAtT(0), o, epsMm))) return 1; // prev já colide: não é obstáculo válido, não trava
  let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (obstacles.some((o) => slotsOverlap3D(boxAtT(mid), o, epsMm))) hi = mid; else lo = mid;
  }
  return lo;
}

// Colisão de um módulo de PAREDE: dois passes (X ao longo da parede, depois
// Y/altura) — cada um desliza pelo caminho reto até o primeiro toque real em
// 3D contra QUALQUER outro módulo do projeto (mesma parede, parede
// diferente em qualquer ângulo, ou ilha). Devolve a posição já corrigida;
// com o botão desligado devolve o pedido intacto.
function clampWallSlotAgainstCollision(slot, desiredXMm, desiredYMm, prevXMm, prevYMm) {
  if (!projectCollisionEnabled) return { x: desiredXMm, y: desiredYMm };
  const EPS = PROJECT_COLLISION_EPS_MM;
  const boxAt = (alongMm, floorHeightMm) => projectSlotWorldBox3D(slot, { xMm: alongMm, floorHeightMm: floorHeightMm });
  const allObstacles = projectAllOtherSlotWorldBoxes(slot);
  const prevBox = boxAt(prevXMm, prevYMm);
  const freeObstacles = allObstacles.filter((o) => !slotsOverlap3D(prevBox, o, EPS));

  const tx = maxClearParamAlongPath(
    (t) => boxAt(prevXMm + (desiredXMm - prevXMm) * t, prevYMm), freeObstacles, EPS);
  const x = prevXMm + (desiredXMm - prevXMm) * tx;

  const ty = maxClearParamAlongPath(
    (t) => boxAt(x, prevYMm + (desiredYMm - prevYMm) * t), freeObstacles, EPS);
  const y = prevYMm + (desiredYMm - prevYMm) * ty;

  return { x, y };
}

// Pegada (footprint) de um módulo ILHA no piso, em mm de MUNDO — { x, y, w, h }
// com y = Z do mundo. Retângulo alinhado aos eixos que ENVOLVE a peça já
// girada (AABB do retângulo rotacionado, formula |hw·cosθ|+|hd·senθ| /
// |hw·senθ|+|hd·cosθ|) — antes só cobria 90°/270° EXATOS (troca w/d);
// qualquer ângulo livre (giro por Shift+arrastar — quantizeProjectRotation
// anda de 5 em 5° e só gruda num múltiplo de 90 dentro de 7°) caía sempre
// no ramo "sem troca", devolvendo uma pegada do tamanho/orientação de ANTES
// do giro. Mesma causa-raiz do bug corrigido em projectSlotWorldBox3D (ver
// ali) — aqui é só a caixa alinhada usada pro limite do AMBIENTE
// (projectFloorRoomBoundsMm), não a colisão módulo-a-módulo (essa já usa
// projectSlotWorldBox3D, com o ângulo real via SAT). A fórmula abaixo cai
// exatamente no comportamento antigo em 0°/90°/180°/270° e generaliza pros
// ângulos intermediários.
function floorSlotFootprint(slot, centerXMm, centerZMm) {
  const rad = (Number(slot.floor_rotation_deg || 0) * Math.PI) / 180;
  const halfW = Number(slot.width_mm || 0) / 2;
  const halfD = Number(slot.depth_mm || 0) / 2;
  const cosA = Math.abs(Math.cos(rad));
  const sinA = Math.abs(Math.sin(rad));
  const w = 2 * (halfW * cosA + halfD * sinA);
  const h = 2 * (halfW * sinA + halfD * cosA);
  const cx = (centerXMm != null) ? centerXMm : Number(slot.floor_x_mm || 0);
  const cz = (centerZMm != null) ? centerZMm : Number(slot.floor_z_mm || 0);
  return { x: cx - w / 2, y: cz - h / 2, w, h };
}

// Colisão de um módulo ILHA: dois passes (X, depois Z do mundo), mesma busca
// binária em 3D de clampWallSlotAgainstCollision — agora colide com
// QUALQUER módulo do projeto, não só outras ilhas. Um módulo de parede vira
// obstáculo de verdade aqui (antes não entrava: "sua pegada no chão não é
// informação que o app guarda" — mas agora projectSlotWorldBox3D calcula
// essa pegada a partir da própria geometria da parede, então não é mais
// aproximação nenhuma). Recebe/devolve o CENTRO do módulo.
function clampFloorSlotAgainstCollision(slot, desiredXMm, desiredZMm, prevXMm, prevZMm) {
  if (!projectCollisionEnabled) return { x: desiredXMm, y: desiredZMm };
  const EPS = PROJECT_COLLISION_EPS_MM;
  const boxAt = (fx, fz) => projectSlotWorldBox3D(slot, { floorXMm: fx, floorZMm: fz });
  const allObstacles = projectAllOtherSlotWorldBoxes(slot);
  const prevBox = boxAt(prevXMm, prevZMm);
  const freeObstacles = allObstacles.filter((o) => !slotsOverlap3D(prevBox, o, EPS));

  const tx = maxClearParamAlongPath(
    (t) => boxAt(prevXMm + (desiredXMm - prevXMm) * t, prevZMm), freeObstacles, EPS);
  const x = prevXMm + (desiredXMm - prevXMm) * tx;

  const tz = maxClearParamAlongPath(
    (t) => boxAt(x, prevZMm + (desiredZMm - prevZMm) * t), freeObstacles, EPS);
  const z = prevZMm + (desiredZMm - prevZMm) * tz;

  return { x, y: z };
}

// ==========================================================================
// MODO CÂMERA NO TOQUE (iPad) — 2026-08-08
// ==========================================================================
// Pedido do usuário: "IPAD - A camera so pode movimentar se clicar no botao
// de rotacao da camera". No iPad a cena 3D acumulava dois papéis no MESMO
// gesto de um dedo (arrastar módulo vs. orbitar a câmera) e qualquer toque
// que escapasse do módulo saía girando a cena. Agora o dedo tem um dono só de
// cada vez, escolhido por um botão em MODO TRAVADO (liga/desliga — opção
// escolhida pelo usuário, em vez de "segurar o botão"):
//   · botão APAGADO ("tela travada"): o dedo edita módulos; o OrbitControls
//     fica desligado e nenhum gesto de 1 dedo move a câmera.
//   · botão ACESO: o dedo orbita/dá zoom; nenhum toque seleciona ou arrasta
//     módulo (o pointerdown de attachProject3DEditDrag sai fora logo no
//     início, ver lá).
// Mouse NUNCA passa por aqui: no desktop o botão do meio já gira e o esquerdo
// já arrasta módulo, sem ambiguidade nenhuma — por isso o botão só aparece em
// dispositivo de toque (projectIsTouchDevice).
let projectCameraModeOn = false;

function projectIsTouchDevice() {
  try {
    return (typeof window !== 'undefined')
      && (('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0)
      && window.matchMedia('(pointer: coarse)').matches;
  } catch (e) { return false; }
}

function setProjectCameraMode(on) {
  projectCameraModeOn = !!on;
  const btn = document.getElementById('po-proj-camera-btn');
  if (btn) btn.classList.toggle('active', projectCameraModeOn);
  // Em modo câmera some tudo que é alça de edição (setas e botões) — o dedo
  // ali é só da câmera, e alça visível sem função só confunde.
  if (typeof refreshProject3DResizeArrows === 'function') refreshProject3DResizeArrows();
  if (typeof refreshProjectSlotActions === 'function') refreshProjectSlotActions();
  // Com o modo desligado o OrbitControls sai de cena por completo no toque —
  // é isso que faz a "tela travada" ser travada de verdade. No mouse os
  // controles continuam sempre ligados (ver applyProjectViewerControls).
  applyProjectViewerControls();
}

// Fonte ÚNICA da verdade de "o OrbitControls está ligado?" nesta cena —
// chamada tanto pelo toggle acima quanto por renderProjectCanvasFrontCorner
// (que roda a cada re-render e antes reativava incondicionalmente).
function applyProjectViewerControls() {
  if (!ViewerProjectEdit || !ViewerProjectEdit.setControlsEnabled) return;
  const enabled = projectIsTouchDevice() ? projectCameraModeOn : true;
  ViewerProjectEdit.setControlsEnabled(enabled);
}

// ==========================================================================
// BARRAS FLUTUANTES DO CANVAS — 2026-08-08 (etapa 2 do redesenho)
// ==========================================================================
// Os botões que antes moravam numa faixa acima do desenho agora flutuam POR
// CIMA dele (ver .po-proj-canvas-hud em style.css). O que muda em JS é pouco,
// de propósito: os ids continuam os mesmos, então todo listener antigo segue
// valendo. Só entram três botões novos de câmera e uma função que decide o que
// aparece em cada vista.
function refreshProjectCanvasHud() {
  // Barra de CÂMERA (ajustar/zoom) só existe na cena 3D: a Vista Superior é um
  // desenho 2D plano com escala calculada pra caber na tela (ver
  // renderProjectCanvasTop), não tem câmera pra mexer.
  const cameraHud = document.getElementById('po-proj-canvas-camera-hud');
  const edit3dWrap = document.getElementById('po-proj-canvas-3d-edit-wrap');
  const is3d = !!edit3dWrap && edit3dWrap.style.display !== 'none' && projectViewMode !== 'top';
  if (cameraHud) cameraHud.style.display = is3d ? 'flex' : 'none';
  // Botão de girar câmera (2026-09-02, Matt: "no ipad o botao rotacionar
  // esta bem longe, deixa ele dentro da tela do projeto bem no canto
  // superior direito") — saiu da barra de cima e virou um HUD flutuante
  // igual ao de ajustar/zoom, só que no canto SUPERIOR direito (ver
  // .po-proj-hud-tr no CSS). Mesma regra de quando aparece: só faz sentido
  // na cena 3D E em dispositivo de toque (mouse já gira com o botão do
  // meio, ver projectIsTouchDevice/setProjectCameraMode acima).
  const rotateHud = document.getElementById('po-proj-canvas-rotate-hud');
  if (rotateHud) rotateHud.style.display = (is3d && projectIsTouchDevice()) ? 'flex' : 'none';
  // (A lixeira desta barra saiu a pedido do usuário — "pra nao clicar errado".
  // Remover continua na bolinha ✕ ao lado do módulo e no painel da direita.)
}

const projFitBtn = document.getElementById('po-proj-fit-btn');
if (projFitBtn) {
  projFitBtn.addEventListener('click', () => {
    // Reenquadrar = zerar a chave de fit e re-renderizar. É exatamente o que
    // resetProject/restoreFavoriteProject já fazem (ver project3DLastFitKey):
    // com a chave nula, renderProjectCanvasFrontCorner passa keepCamera=false
    // e renderFreeformWalls recalcula a distância/alvo pela caixa da cena.
    // Nenhuma matemática de câmera nova precisou ser escrita.
    project3DLastFitKey = null;
    renderProjectCanvas();
  });
}
// Mesma escala por passo que o OrbitControls usa por "notch" de scroll — o
// botão dá o mesmo salto que uma volta da rodinha, então os dois gestos
// parecem o mesmo zoom. factor < 1 aproxima (ver zoomByStep).
const PROJECT_ZOOM_STEP = 0.82;
const projZoomInBtn = document.getElementById('po-proj-zoom-in-btn');
if (projZoomInBtn) {
  projZoomInBtn.addEventListener('click', () => {
    if (ViewerProjectEdit && ViewerProjectEdit.zoomByStep) ViewerProjectEdit.zoomByStep(PROJECT_ZOOM_STEP);
  });
}
const projZoomOutBtn = document.getElementById('po-proj-zoom-out-btn');
if (projZoomOutBtn) {
  projZoomOutBtn.addEventListener('click', () => {
    if (ViewerProjectEdit && ViewerProjectEdit.zoomByStep) ViewerProjectEdit.zoomByStep(1 / PROJECT_ZOOM_STEP);
  });
}
const projUndoBtn = document.getElementById('po-proj-undo-btn');
if (projUndoBtn) projUndoBtn.addEventListener('click', () => undoProjectChange());
// Ctrl+Z / ⌘Z também desfazem — mas só com a aba Projetos aberta e fora de
// qualquer campo de texto (senão roubaria o desfazer nativo de quem está
// digitando uma medida).
document.addEventListener('keydown', (ev) => {
  if (!(ev.ctrlKey || ev.metaKey) || ev.key !== 'z' || ev.shiftKey) return;
  const tab = document.getElementById('po-tab-projects');
  if (!tab || tab.style.display === 'none') return;
  const el = document.activeElement;
  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
  ev.preventDefault();
  undoProjectChange();
});

const projCollisionBtn = document.getElementById('po-proj-collision-btn');
if (projCollisionBtn) {
  projCollisionBtn.addEventListener('click', () => setProjectCollisionEnabled(!projectCollisionEnabled));
  projCollisionBtn.classList.toggle('active', projectCollisionEnabled);
}
const projCameraBtn = document.getElementById('po-proj-camera-btn');
if (projCameraBtn) {
  // A visibilidade do botão (tela de toque + cena 3D) agora é toda decidida
  // por refreshProjectCanvasHud, que controla o HUD #po-proj-canvas-rotate-hud
  // que o envolve — aqui só liga o clique.
  projCameraBtn.addEventListener('click', () => setProjectCameraMode(!projectCameraModeOn));
}

// Cor de fundo do retângulo do módulo no canvas — usa a primeira cor
// escolhida que tiver um swatch_hex (ver renderSwatches acima), senão um
// tom neutro só pra não ficar cinza genérico.
function projectSlotColorSwatch(slot) {
  const colors = Object.values(slot.colorsByRole || {});
  const withHex = colors.find((c) => c && c.swatch_hex);
  return withHex ? withHex.swatch_hex : '#e4d9c8';
}

// ---------- Vista frontal 2D REAL do módulo (pedido do usuário, 2026-07-21) ----------
// "quero ver o modulo 2d na tela. nao me serve esse bloco cinza. quero ver
// com as cores escolhidas e os componentes. versão 2D paralela da vista
// frontal" — desenha as peças de verdade (portas, gavetas, prateleiras,
// laterais) dentro da caixa do módulo, com a cor resolvida de cada uma, em
// vez de um retângulo cinza sólido. NÃO usa Three.js (mais simples/leve pra
// caber dentro de uma caixinha do canvas) — projeta em 2D só o subconjunto
// de placePieceInBox (viewer3d.js) que faz sentido numa vista SEM
// profundidade: cada posição automática (left/right/top/bottom/back/
// baseboard/countertop) vira uma tira fina na borda correspondente (mesma
// convenção "zero absoluto" documentada lá — offset_x/y_mm JÁ é a posição
// do canto chão-esquerda, não precisa de nenhuma âncora por papel); 'free'
// (a maioria das portas — ver hinge_side/resolveHingeSide em viewer3d.js) e
// 'drawer' têm posição própria; 'shelf' é uma aproximação (distribui no vão
// 0..H inteiro, sem descontar espessura de base/topo cadastrados — barato
// de calcular aqui, próximo o bastante pra uma prévia); 'leg'/'handle'/
// 'other' não desenham (mesma regra do 3D — ferragem sem relevância na
// chapa). Isso é DESENHO, não um novo motor de posicionamento — qualquer
// peça que caia fora dessas regras simplesmente não aparece, sem quebrar
// nada do 3D/preço de verdade (só usa resolvePiecesForViewer, já existente,
// pra pegar medida/offset/cor resolvidos).

// Réplica de splitThickness (viewer3d.js) — decide qual das 3 medidas de
// uma peça de posição automática é a "espessura" (chapa fina), conforme o
// positioning cadastrado (mesma lógica, mesmos 4 casos + fallback pela
// menor medida).
function projectSplitThickness(w, h, d, positioning) {
  if (positioning === 'horizontal') return { thickness: h, faceA: w, faceB: d };
  if (positioning === 'vertical') return { thickness: w, faceA: h, faceB: d };
  if (positioning === 'vertical_no_plano' || positioning === 'horizontal_no_plano') {
    return { thickness: d, faceA: w, faceB: h };
  }
  const dims = [w, h, d];
  const minIdx = dims.indexOf(Math.min(w, h, d));
  const thickness = dims[minIdx];
  const rest = dims.filter((_, i) => i !== minIdx);
  return { thickness, faceA: rest[0], faceB: rest[1] };
}

// Achata a árvore de peças JÁ RESOLVIDAS (resolvePiecesForViewer) numa
// lista de retângulos { x, y, w, h, color, zPriority, depth }, em mm,
// relativos ao canto chão-esquerda do módulo RAIZ (offsetXmm/offsetYmm
// acumulam a posição de peças-módulo aninhadas — ver recursão em
// 'free'/'drawer' abaixo, os únicos papéis que fazem sentido conter peças
// filhas de verdade).
function computeProjectSlotElevationRects(piecesResolved, offsetXmm, offsetYmm) {
  const rects = [];
  (piecesResolved || []).forEach((part) => {
    const w = Number(part.width_mm || 0);
    const h = Number(part.height_mm || 0);
    const d = Number(part.depth_mm || 0);
    const role = part.position_role || 'other';
    const offX = Number(part.offset_x_mm || 0);
    const offY = Number(part.offset_y_mm || 0);
    // offset_z_mm (profundidade) não entra na posição 2D — só decide a
    // ORDEM de desenho (peça mais pra frente cobre a de trás), ver `depth`.
    const depth = Number(part.offset_z_mm || 0);
    const color = part.color;
    const push = (x, y, rw, rh, zPriority) => {
      rects.push({ x: offsetXmm + x, y: offsetYmm + y, w: Math.max(rw, 1), h: Math.max(rh, 1), color, zPriority, depth });
    };
    if (role === 'left' || role === 'right') {
      const { thickness, faceA } = projectSplitThickness(w, h, d, part.positioning);
      push(offX, offY, thickness, faceA, 1);
    } else if (role === 'drawer_side') {
      // Lateral de gaveta (migration 118): vista de frente ela é a espessura
      // por uma ALTURA que, nesse papel, vem da profundidade cadastrada — a
      // mesma troca de eixos do 3D (ver placePieceInBox em viewer3d.js).
      const { thickness, faceA, faceB } = projectSplitThickness(w, h, d, part.positioning);
      // Vista de frente: espessura por ALTURA — e a altura é a MENOR das duas
      // medidas que sobram (ver a regra em placePieceInBox/viewer3d.js).
      push(offX, offY, thickness, Math.min(faceA, faceB), 1);
    } else if (role === 'top' || role === 'bottom' || role === 'countertop') {
      const { thickness, faceA } = projectSplitThickness(w, h, d, part.positioning);
      push(offX, offY, faceA, thickness, 1);
    } else if (role === 'back' || role === 'baseboard') {
      const { thickness, faceA } = projectSplitThickness(w, h, d, part.positioning);
      push(offX, offY, faceA, thickness, 0);
    } else if (role === 'shelf') {
      push(offX, offY, w, h, 2);
    } else if (role === 'drawer' || role === 'free') {
      push(offX, offY, w, h, role === 'drawer' ? 3 : 4);
      // Peça-módulo aninhada com composição própria (gaveta com fundo/
      // laterais de verdade, ou um módulo usado como "peça") — desenha as
      // peças filhas por cima, deslocadas pro canto chão-esquerda DESTA peça.
      if (part.child_pieces && part.child_pieces.length) {
        computeProjectSlotElevationRects(part.child_pieces, offsetXmm + offX, offsetYmm + offY)
          .forEach((r) => rects.push(r));
      }
    }
    // 'leg'/'handle'/'other' — sem desenho (mesma regra do 3D).
  });
  return rects;
}

// HTML (divs absolutos, em % do próprio módulo — acompanha o resize sem
// precisar recalcular px) pra colocar dentro do .po-proj-slot no lugar do
// preenchimento cinza sólido. widthMm/heightMm são as medidas ATUAIS do
// módulo (pra converter mm->%); erro em qualquer etapa (módulo sem peças
// carregadas ainda, fórmula inválida etc.) devolve string vazia — cai pro
// fallback de cor sólida (div.style.background, ver renderProjectCanvas),
// nunca quebra o card inteiro.
function projectSlotElevationHtml(slot, widthMm, heightMm) {
  if (!slot.pieces || !slot.pieces.length || !widthMm || !heightMm) return '';
  const containerDims = { W: slot.width_mm, H: slot.height_mm, D: slot.depth_mm };
  const effectivePieces = projectSlotEffectivePieces(slot);
  let resolved;
  try {
    resolved = resolvePiecesForViewer(
      effectivePieces,
      containerDims,
      slot.colorsByRole, slot.shelfQuantities, slot.dimOverrides, slot.pieceColorOverrides
    );
  } catch (e) { return ''; }
  // Pés (position_role='leg', não desenhados — ver comentário acima): o
  // corpo inteiro sobe pela altura do pé, igual ao 3D (placePieceInBox soma
  // "legH" a TODA posição Y, ver viewer3d.js). Sem isso, o vão vazio do pé
  // aparecia no TOPO da caixa em vez de embaixo — offset_y_mm de cada peça é
  // calculado contra bodyDims (H já descontado do pé, ver resolveBodyDims em
  // pricing.js), então falta somar de volta aqui pra virar posição absoluta
  // dentro do módulo INTEIRO (0 = chão de verdade, não o topo do pé).
  let legH_mm = 0;
  try { legH_mm = Pricing.resolveBodyDims(effectivePieces, containerDims).legH_mm || 0; } catch (e) { /* sem pé, 0 */ }
  let rects;
  try {
    rects = computeProjectSlotElevationRects(resolved, 0, legH_mm);
  } catch (e) { return ''; }
  if (!rects.length) return '';
  rects.sort((a, b) => (a.zPriority - b.zPriority) || (a.depth - b.depth));
  return rects.map((r) => {
    const leftPct = (r.x / widthMm) * 100;
    const bottomPct = (r.y / heightMm) * 100;
    const wPct = Math.max((r.w / widthMm) * 100, 0.4);
    const hPct = Math.max((r.h / heightMm) * 100, 0.4);
    const style = r.color && r.color.texture_url
      ? `background-image:url('${r.color.texture_url}');background-size:cover;`
      : `background:${(r.color && r.color.swatch_hex) || '#cfc6b4'};`;
    return `<div class="po-proj-slot-piece" style="left:${leftPct}%;bottom:${bottomPct}%;width:${wPct}%;height:${hPct}%;${style}"></div>`;
  }).join('');
}

// Arraste por ponteiro (mouse/touch/caneta, unificado) — pointer capture no
// próprio elemento, então move/up continuam chegando nele mesmo se o
// ponteiro sair por cima de outro módulo.
//
// MOUSE: arrasta na hora; deslocamento abaixo de PROJECT_CLICK_MOVE_THRESHOLD_PX
// vira clique (seleciona) em vez de mover.
//
// TOQUE (iPad) — o mapa de gestos foi refeito 2 vezes em 2026-08-06, então
// vale registrar o porquê de cada volta:
//
//   1ª: tratava toque igual mouse (4px de tolerância). Num dedo isso é nada,
//       então TODO toque virava arraste e nada ficava selecionado.
//   2ª: virou "segurar-pra-arrastar". Resolveu o arraste acidental, mas o
//       usuário ficou SEM controle do módulo: "não consigo esticar o móvel,
//       não tem a seta, o móvel não fica selecionado, nenhum controle".
//   3ª (atual), desenhada pelo próprio usuário: "preciso ao ficar clicando
//       ele permanecer clicado mesmo tirando o clique, e aí abrir opções das
//       setas pra eu esticar" + "penso em segurar o clique e abrir opções de
//       cores, dimensões, agregados".
//
// Mapa atual, igual no dedo e no mouse:
//   - toque/clique curto  -> SELECIONA e continua selecionado (as setinhas de
//                            esticar aparecem e ficam, ver .selected no CSS);
//   - arrastar (passar de PROJECT_TOUCH_SLOP_PX) -> MOVE, sem espera nenhuma;
//   - segurar parado PROJECT_HOLD_MENU_MS -> abre as PROPRIEDADES do módulo
//                            (cor, dimensões, prateleiras) numa janela.
//
// O pointerdown NÃO dá preventDefault no toque: enquanto o gesto não virou
// arraste, a página precisa poder rolar. Depois que vira, quem segura a
// rolagem é o listener de touchmove (passive:false) logo abaixo —
// preventDefault em pointermove não impede scroll no iOS.
function attachProjectSlotDrag(div, slot) {
  // Timer do "segurar pra arrastar". Fica fora do state porque precisa ser
  // limpo em caminhos onde projectDragState já foi zerado (pointercancel).
  let holdTimer = null;
  const clearHoldTimer = () => { if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; } };

  div.addEventListener('pointerdown', (ev) => {
    const isTouch = ev.pointerType === 'touch';
    // Caneta (pen) conta como preciso: engata na hora, igual mouse.
    if (!isTouch) ev.preventDefault();
    try { div.setPointerCapture(ev.pointerId); } catch (e) { /* ok, alguns navegadores não precisam */ }
    projectDragState = {
      slotId: slot.id,
      pointerId: ev.pointerId,
      isTouch,
      // armed = o arraste está valendo. No mouse já nasce engatado; no toque
      // só depois do hold.
      armed: !isTouch,
      canceled: false,
      startClientX: ev.clientX,
      startClientY: ev.clientY,
      startXMm: Number(slot.x_mm || 0),
      startYMm: Number(slot.floor_height_mm || 0),
      moved: false,
      liveX: Number(slot.x_mm || 0),
      liveY: Number(slot.floor_height_mm || 0),
      // "prev" pra COLISÃO (ver clampWallSlotAgainstCollision) — precisa ser
      // a última posição JÁ RESOLVIDA (atualizada a cada pointermove, não a
      // do início do arraste), senão resolveCollisionSlide não sabe de que
      // lado o módulo está batendo num arraste rápido/de várias etapas.
      // Mesmo padrão de state.prevXMm/prevYMm no arraste 3D (ver
      // attachProject3DEditDrag, portal-08-projetos-paredes.js).
      prevXMm: Number(slot.x_mm || 0),
      prevYMm: Number(slot.floor_height_mm || 0)
    };
    // Segurar parado (dedo OU mouse) abre as propriedades do módulo. Se o
    // ponteiro se mexer antes, o pointermove cancela este timer e o gesto
    // vira arraste — as duas coisas nunca disputam.
    clearHoldTimer();
    holdTimer = setTimeout(() => {
      holdTimer = null;
      if (!projectDragState || projectDragState.slotId !== slot.id || projectDragState.canceled || projectDragState.moved) return;
      projectDragState.canceled = true;
      projectDragState = null;
      div.classList.remove('dragging');
      openProjectSlotProps(slot.id);
    }, PROJECT_HOLD_MENU_MS);
  });

  // Segura a rolagem da página SÓ enquanto o arraste está engatado. Precisa
  // ser passive:false, senão o preventDefault é ignorado.
  div.addEventListener('touchmove', (ev) => {
    if (projectDragState && projectDragState.slotId === slot.id && projectDragState.armed) ev.preventDefault();
  }, { passive: false });

  div.addEventListener('pointermove', (ev) => {
    if (!projectDragState || projectDragState.slotId !== slot.id || projectDragState.pointerId !== ev.pointerId) return;
    const dxPx = ev.clientX - projectDragState.startClientX;
    const dyPx = ev.clientY - projectDragState.startClientY;
    const dist = Math.hypot(dxPx, dyPx);

    const threshold = projectDragState.isTouch ? PROJECT_TOUCH_SLOP_PX : PROJECT_CLICK_MOVE_THRESHOLD_PX;
    if (!projectDragState.moved && dist > threshold) {
      // Passou do limiar: é arraste. Cancela o timer das propriedades — o
      // ponteiro se mexeu, então a intenção claramente não era "segurar".
      clearHoldTimer();
      projectDragState.moved = true;
      projectDragState.armed = true;
      div.classList.add('dragging');
    }
    if (!projectDragState.moved) return;

    const dxMm = dxPx / (projectPxPerMm || 1);
    // Canvas posiciona por 'bottom' (sobe = mais mm), tela usa clientY (desce
    // = mais px) — precisa inverter o sinal do eixo vertical.
    const dyMm = -dyPx / (projectPxPerMm || 1);

    // Módulos da MESMA parede + o traçado fantasma da parede vizinha (ver
    // projectGhostSnapTargets — pedido do usuário 2026-07-26, mesmo
    // raciocínio do imã de esticar acima).
    const others = projectSlotsSameWallExcluding(slot).concat(projectGhostSnapTargets(Number(slot.wall_index || 0)));
    const maxX = Math.max(0, getProjectWallWidthMm(Number(slot.wall_index || 0)) - Number(slot.width_mm || 0));
    const maxY = projectSlotMaxFloorHeightMm(slot.height_mm, slot.module);

    let x = clamp(projectDragState.startXMm + dxMm, 0, maxX);
    let y = clamp(projectDragState.startYMm + dyMm, 0, maxY);
    x = clamp(snapProjectSlotAxis(x, Number(slot.width_mm || 0), true, others), 0, maxX);
    y = clamp(snapProjectSlotAxis(y, Number(slot.height_mm || 0), false, others), 0, maxY);
    y = snapProjectSlotToFloor(y);   // mesmo ímã de chão da vista 3D

    // COLISÃO (2026-08-20, relato do Matt: "mesmo o ima ligado, os modulos
    // nao estao respeitando o espaco um do outro. nao deveria poder
    // transpacar um sobre o outro"). O botão de colisão já existia e já
    // funcionava no esticar (attachProjectSlotResizeHandle), na vista de
    // canto 3D (attachProject3DEditDrag) e na Vista em 3D cheia
    // (handleProject3DFloorMove) — só faltava aqui, no arraste da Vista
    // Frontal padrão (a mais usada), que só tinha o ímã de ALINHAR
    // (snapProjectSlotAxis, acima) e nunca um bloqueio de verdade. Mesma
    // ordem das outras vistas: ímã primeiro (pode encostar exatamente na
    // borda do vizinho sem contar como sobreposição), colisão por último.
    if (projectCollisionEnabled) {
      // clampWallSlotAgainstCollision agora monta a lista de obstáculos
      // sozinha a partir de projectSlots (qualquer parede, qualquer ilha) —
      // o traçado fantasma da parede vizinha (projectGhostSnapTargets, usado
      // só pelo ímã de ALINHAR acima) nunca entra nessa lista porque não é
      // um slot de verdade, então não precisa mais ser excluído aqui.
      const solved = clampWallSlotAgainstCollision(
        slot, x, y,
        projectDragState.prevXMm, projectDragState.prevYMm
      );
      x = solved.x;
      y = solved.y;
    }
    projectDragState.prevXMm = x;
    projectDragState.prevYMm = y;

    div.style.left = Math.round(x * projectPxPerMm) + 'px';
    div.style.bottom = Math.round(y * projectPxPerMm) + 'px';
    projectDragState.liveX = x;
    projectDragState.liveY = y;
  });

  const endDrag = (ev) => {
    clearHoldTimer();
    if (!projectDragState || projectDragState.slotId !== slot.id) {
      // Gesto cancelado no meio (rolagem da página, ver pointermove) — só
      // limpa o visual, sem selecionar nem mover.
      div.classList.remove('dragging');
      return;
    }
    div.classList.remove('dragging');
    try { div.releasePointerCapture(ev.pointerId); } catch (e) { /* ok */ }
    const state = projectDragState;
    projectDragState = null;
    // pointercancel = o navegador tomou o gesto (rolagem/zoom). Não é tap:
    // selecionar aqui faria o módulo "pular" pro painel sem a pessoa querer.
    if (ev.type === 'pointercancel') return;
    if (state.moved) {
      slot.x_mm = state.liveX;
      slot.floor_height_mm = state.liveY;
      resolveProjectSlotDepth(slot, projectSlotsSameWallExcluding(slot));
      renderProjectCanvas();
      markProjectDirty();
    } else {
      selectProjectSlot(slot.id);
    }
  };
  div.addEventListener('pointerup', endDrag);
  div.addEventListener('pointercancel', endDrag);
}

// ==========================================================================
// Propriedades do módulo numa janela (segurar o clique) — 2026-08-06
// ==========================================================================
// Pedido do usuário: "penso em segurar o clique (iPad e navegador normal) e
// abrir opções de cores, dimensões, agregados (prateleiras)... abrir as
// propriedades".
//
// Truque pra não duplicar NADA: em vez de recriar cor/medida/prateleira
// dentro do modal (o que significaria IDs repetidos e dois caminhos de
// listener pra manter em sincronia), a janela simplesmente MOVE o
// #po-proj-config-panel — o painel da direita, que já tem tudo isso pronto —
// pra dentro dela, e devolve pro lugar ao fechar. É o MESMO elemento: todo
// listener, render e correção futura vale nos dois lugares de graça.
//
// É também o que resolve o painel da direita estar recolhido no iPad: mesmo
// escondido, ele continua sendo a fonte da verdade.
let projectPropsOpen = false;

function openProjectSlotProps(slotId) {
  const modal = document.getElementById('po-proj-props-modal');
  const body = document.getElementById('po-proj-props-body');
  const panel = document.getElementById('po-proj-config-panel');
  if (!modal || !body || !panel) return;

  selectProjectSlot(slotId);

  const slot = projectSlots.find((s) => s.id === slotId);
  const titleEl = document.getElementById('po-proj-props-title');
  if (titleEl) titleEl.textContent = (slot && slot.module && slot.module.name) || I18n.t('project.props_title');

  body.appendChild(panel);       // move (não copia)
  modal.classList.add('open');
  projectPropsOpen = true;
}

function closeProjectSlotProps() {
  const modal = document.getElementById('po-proj-props-modal');
  const panel = document.getElementById('po-proj-config-panel');
  const home = document.getElementById('po-proj-config-col');
  if (!modal || !panel || !home) return;
  home.appendChild(panel);       // devolve pra coluna da direita
  modal.classList.remove('open');
  projectPropsOpen = false;
}

(function attachProjectPropsModal() {
  const modal = document.getElementById('po-proj-props-modal');
  if (!modal) return;
  const closeBtn = document.getElementById('po-proj-props-close');
  if (closeBtn) closeBtn.addEventListener('click', closeProjectSlotProps);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeProjectSlotProps(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && projectPropsOpen) closeProjectSlotProps();
  });
})();

function selectProjectSlot(slotId) {
  selectedProjectSlotId = slotId;
  document.querySelectorAll('#po-proj-canvas .po-proj-slot').forEach((el) => {
    el.classList.toggle('selected', el.dataset.slotId === slotId);
  });
  // GRUPO SALVO (2026-09-03): clicar em QUALQUER peça de um grupo já feito
  // seleciona o grupo inteiro pra mover/duplicar/ver orçamento juntos — não
  // precisa Ctrl+clicar cada módulo de novo toda vez que reabre o projeto ou
  // clica em outro lugar antes. Clicar num módulo AVULSO esvazia a seleção
  // múltipla (era grupo, virou clique normal em outra coisa).
  const clicked = projectSlots.find((s) => s.id === slotId);
  projectMultiSelectIds = (clicked && clicked.group_id)
    ? new Set(projectSlots.filter((s) => s.group_id === clicked.group_id).map((s) => s.id))
    : new Set();
  // Contorno vermelho da Vista de Canto 3D acompanha a SELEÇÃO (ver
  // refreshProject3DHighlight) — inclusive quando a seleção veio da vista 2D
  // ou da lista, não só de um clique dentro da cena 3D.
  if (typeof refreshProject3DHighlight === 'function') refreshProject3DHighlight();
  renderProjectConfigPanel();
  // Setas 3D de redimensionamento (toque) acompanham a seleção — ver
  // refreshProject3DResizeArrows (não faz nada no mouse nem sem 3D).
  if (typeof refreshProject3DResizeArrows === 'function') refreshProject3DResizeArrows();
  // Botões Duplicar/Remover acompanham a seleção pelo mesmo caminho das setas.
  if (typeof refreshProjectSlotActions === 'function') refreshProjectSlotActions();
  // 🗑 da barra flutuante só habilita com módulo selecionado.
  if (typeof refreshProjectCanvasHud === 'function') refreshProjectCanvasHud();
  // Barra do grupo (contador + total + ações) — some sozinha quando o grupo
  // tem só 1 membro (ver refreshProjectGroupToolbar, portal-06c).
  if (typeof refreshProjectGroupToolbar === 'function') refreshProjectGroupToolbar();
}

// SOLTAR O MÓDULO — o contrário exato de selectProjectSlot.
//
// Virou função porque agora são QUATRO caminhos, e antes cada um repetia (ou
// esquecia) parte da limpeza. O relato que forçou isso (Matt, 2026-08-13):
// "em qualquer lugar que eu clique na parede ou no piso ele nao desclica o
// modulo... preciso dar zoom out, girar camera e ir clicando ate desclicar.
// por isso digo que esta incontrolavel."
//
// Os quatro caminhos: clique no vazio (pointerdown), clique que não acertou
// módulo nenhum conferido de novo no pointerup (rede de segurança pros gestos
// que abortam antes daquele ramo — a SETA é o caso comum, ela fica FORA do
// contorno do módulo, bem onde a pessoa clica pra "soltar"), a tecla Esc, e o
// clique na parede/piso da vista 2D.
function deselectProjectSlot() {
  const hadMultiSelect = projectMultiSelectIds.size > 0;
  projectMultiSelectIds = new Set();
  if (selectedProjectSlotId == null) {
    if (hadMultiSelect && typeof refreshProjectGroupToolbar === 'function') refreshProjectGroupToolbar();
    return;
  }
  selectedProjectSlotId = null;
  if (typeof refreshProject3DHighlight === 'function') refreshProject3DHighlight();
  document.querySelectorAll('#po-proj-canvas .po-proj-slot.selected')
    .forEach((el) => el.classList.remove('selected'));
  renderProjectConfigPanel();
  if (typeof refreshProject3DResizeArrows === 'function') refreshProject3DResizeArrows();
  if (typeof refreshProjectSlotActions === 'function') refreshProjectSlotActions();
  if (typeof refreshProjectCanvasHud === 'function') refreshProjectCanvasHud();
  if (typeof refreshProjectGroupToolbar === 'function') refreshProjectGroupToolbar();
}

// Esc SEMPRE solta o módulo. É a saída que não depende de acertar pixel
// nenhum — com a câmera de perto, o móvel ocupa a tela toda e "clicar no
// vazio" pode simplesmente não existir na viewport.
document.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Escape') return;
  if (selectedProjectSlotId == null) return;
  // Janela aberta por cima: o Esc é dela (fechar a janela), não da seleção.
  const abertas = ['po-proj-builder-modal', 'po-proj-props-modal', 'po-proj-ai-modal'];
  if (abertas.some((id) => { const el = document.getElementById(id); return el && el.classList.contains('open'); })) return;
  deselectProjectSlot();
});

// ==========================================================================
// DUPLICAR MÓDULO — 2026-08-08 (3ª rodada)
// ==========================================================================
// Pedido do usuário: "quero uma opcao de, ao clicado, o modulo poder se
// repetir, com mesma cor e tamanho". Reaproveita cloneProjectSlotForUndo (a
// mesma cópia profunda dos campos mutáveis que o desfazer já usa — cor,
// medidas, prateleiras, opcionais, overrides por peça), então "mesma cor e
// tamanho" sai de graça e sem duplicar regra nenhuma. Módulo/peças/opções de
// cor continuam compartilhados por referência: são catálogo, iguais pros dois.
//
// ONDE A CÓPIA NASCE: colada ao lado do original, no espaço livre mais
// próximo. Preferência pela direita (leitura natural de uma parede); se não
// couber até o fim da parede, tenta a esquerda; se não couber dos dois lados,
// nasce em cima do original mesmo — melhor um módulo sobreposto pro cliente
// arrastar do que um "não coube" que não explica nada.
function duplicateProjectSlot(slotId) {
  const original = projectSlots.find((s) => s.id === slotId);
  if (!original) return null;
  const copy = cloneProjectSlotForUndo(original);
  copy.id = newProjectSlotId();
  copy.thumbnail_data_url = null; // a miniatura é do slot antigo; deixa recalcular
  // Duplicar UM módulo (botão ⧉) nunca entra num grupo sozinho, mesmo se o
  // original pertencer a um — é uma ação por módulo; quem quer duplicar o
  // grupo inteiro junto usa duplicateProjectSlotGroup (menu do grupo).
  copy.group_id = null;
  copy.group_name = null;

  if (isFloorSlot(copy)) {
    // Ilha: desloca no eixo local da largura, sem parede pra limitar.
    const rot = (Number(copy.floor_rotation_deg || 0) * Math.PI) / 180;
    const stepMm = Number(copy.width_mm || 0) || 600;
    copy.floor_x_mm = Number(copy.floor_x_mm || 0) + Math.cos(rot) * stepMm;
    copy.floor_z_mm = Number(copy.floor_z_mm || 0) - Math.sin(rot) * stepMm;
    projectSlots.push(copy);
    clampFloorSlotIntoRoom(copy);
  } else {
    const widthMm = Number(copy.width_mm || 0);
    const wallWidthMm = getProjectWallWidthMm(Number(copy.wall_index || 0));
    const rightX = Number(original.x_mm || 0) + widthMm;
    const leftX = Number(original.x_mm || 0) - widthMm;
    if (rightX + widthMm <= wallWidthMm) copy.x_mm = rightX;
    else if (leftX >= 0) copy.x_mm = leftX;
    projectSlots.push(copy);
    clampProjectSlotPosition(copy);
  }

  selectedProjectSlotId = copy.id;
  renderProjectCanvas();
  renderProjectConfigPanel();
  refreshProject3DResizeArrows();
  markProjectDirty();
  return copy;
}

function removeProjectSlot(slotId) {
  projectSlots = projectSlots.filter((s) => s.id !== slotId);
  if (selectedProjectSlotId === slotId) selectedProjectSlotId = null;
  projectMultiSelectIds.delete(slotId);
  renderProjectCanvas();
  if (typeof refreshProjectGroupToolbar === 'function') refreshProjectGroupToolbar();
  markProjectDirty();
}

// ==========================================================================
// GRUPO DE MÓDULOS (2026-09-03) — pedido do Matt: "quero poder agrupar
// varios modulos, (apertar control e ir clicando) botao direito criar
// grupo. uma vez agrupados quer poder duplicar, movimentar, e ver o
// orcamento so do que esta selecionado."
// ==========================================================================
// SELEÇÃO: Ctrl/Cmd+clique (mouse, ver o topo do pointerdown em
// attachProject3DEditDrag, portal-08) acumula ids em projectMultiSelectIds
// SEM tocar em selectedProjectSlotId nem iniciar arraste nenhum — é só
// marcação. Clicar (sem Ctrl) num módulo de um GRUPO SALVO já expande
// sozinho pra seleção múltipla, ver selectProjectSlot acima.
//
// GRUPO SALVO: "Criar grupo" grava group_id/group_name em CADA slot
// selecionado (cabe no jsonb que já existe — ver serializeProjectSlots/
// restauração em portal-09 —, sem migration, mesmo padrão de todo campo
// novo de slot deste arquivo). Não existe uma lista separada de grupos: o
// nome vive replicado em cada membro (mais simples que manter duas fontes
// de verdade sincronizadas) — renomear/desagrupar escreve nos membros
// atuais, não numa entidade à parte.
function toggleProjectMultiSelect(slotId) {
  const clicked = projectSlots.find((s) => s.id === slotId);
  if (!clicked) return;
  // Módulo já pertence a um grupo salvo: Ctrl+clique alterna o GRUPO INTEIRO
  // de uma vez (não dá pra ficar com metade de um grupo já feito solta na
  // seleção) — mesma regra de "clicar sem Ctrl" em selectProjectSlot.
  const groupIds = clicked.group_id
    ? projectSlots.filter((s) => s.group_id === clicked.group_id).map((s) => s.id)
    : [slotId];
  const ligando = !projectMultiSelectIds.has(slotId);
  groupIds.forEach((id) => {
    if (ligando) projectMultiSelectIds.add(id); else projectMultiSelectIds.delete(id);
  });
  // Ctrl+clique é seleção pura — nunca mexe no painel de config da direita
  // (selectedProjectSlotId fica como estava) nem inicia arraste.
  if (typeof refreshProject3DMultiHighlight === 'function') refreshProject3DMultiHighlight();
  if (typeof refreshProjectGroupToolbar === 'function') refreshProjectGroupToolbar();
}

// ids que devem se mover JUNTO com `primarySlot` num arraste — a seleção
// múltipla ativa (Ctrl+clique solto, ou grupo salvo já expandido pra ela em
// selectProjectSlot), sempre que primarySlot fizer parte dela e ela tiver
// 2+ membros. Usado por beginProjectGroupCoDrag (portal-08).
function projectActiveGroupSelectionIds(primarySlot) {
  if (!primarySlot) return null;
  if (projectMultiSelectIds.has(primarySlot.id) && projectMultiSelectIds.size >= 2) {
    return projectMultiSelectIds;
  }
  return null;
}

function createProjectSlotGroup(ids) {
  const idList = Array.from(ids || []);
  if (idList.length < 2) return null;
  const nome = (typeof prompt === 'function')
    ? prompt(I18n.t('project.group_name_prompt'), I18n.t('project.group_default_name'))
    : I18n.t('project.group_default_name');
  if (nome == null) return null; // cancelou o prompt
  const groupId = newProjectSlotId();
  const groupName = nome.trim() || I18n.t('project.group_default_name');
  idList.forEach((id) => {
    const s = projectSlots.find((x) => x.id === id);
    if (s) { s.group_id = groupId; s.group_name = groupName; }
  });
  projectMultiSelectIds = new Set(idList);
  if (typeof refreshProject3DMultiHighlight === 'function') refreshProject3DMultiHighlight();
  if (typeof refreshProjectGroupToolbar === 'function') refreshProjectGroupToolbar();
  markProjectDirty();
  return groupId;
}

function ungroupProjectSlots(ids) {
  const idList = Array.from(ids || []);
  idList.forEach((id) => {
    const s = projectSlots.find((x) => x.id === id);
    if (s) { s.group_id = null; s.group_name = null; }
  });
  if (typeof refreshProject3DMultiHighlight === 'function') refreshProject3DMultiHighlight();
  if (typeof refreshProjectGroupToolbar === 'function') refreshProjectGroupToolbar();
  markProjectDirty();
}

function renameProjectSlotGroup(ids) {
  const idList = Array.from(ids || []);
  const first = projectSlots.find((s) => s.id === idList[0]);
  if (!first || !first.group_id) return;
  const nome = (typeof prompt === 'function')
    ? prompt(I18n.t('project.group_name_prompt'), first.group_name || I18n.t('project.group_default_name'))
    : null;
  if (nome == null) return;
  const groupName = nome.trim() || I18n.t('project.group_default_name');
  projectSlots.filter((s) => s.group_id === first.group_id).forEach((s) => { s.group_name = groupName; });
  if (typeof refreshProjectGroupToolbar === 'function') refreshProjectGroupToolbar();
  markProjectDirty();
}

// Duplica TODOS os módulos da seleção/grupo de uma vez, mantendo a posição
// RELATIVA entre eles (o bloco inteiro anda junto, não cada peça pro seu
// canto). Reaproveita duplicateProjectSlot pra decidir POR ONDE o bloco
// nasce (o mesmo "cola à direita, senão à esquerda, senão sobrepõe" de
// sempre, só que decidido pelo primeiro módulo = âncora) e depois aplica o
// MESMO delta de mundo que esse primeiro módulo recebeu a todos os outros —
// mecanismo idêntico ao "mover em grupo" (ver commitProjectGroupCoDrag,
// portal-08), só que calculado uma vez em vez de a cada frame de arraste.
function duplicateProjectSlotGroup(ids) {
  const members = Array.from(ids || []).map((id) => projectSlots.find((s) => s.id === id)).filter(Boolean);
  if (members.length < 2) {
    return members.length ? duplicateProjectSlot(members[0].id) : null;
  }
  const anchor = members[0];
  const anchorBoxBefore = projectSlotWorldBox3D(anchor);
  const anchorClone = duplicateProjectSlot(anchor.id);
  if (!anchorClone || !anchorBoxBefore) return null;
  const anchorBoxAfter = projectSlotWorldBox3D(anchorClone);
  if (!anchorBoxAfter) return null;
  const deltaXMm = anchorBoxAfter.cx - anchorBoxBefore.cx;
  const deltaZMm = anchorBoxAfter.cz - anchorBoxBefore.cz;

  const newGroupId = newProjectSlotId();
  const baseName = anchor.group_name || I18n.t('project.group_default_name');
  const newGroupName = baseName + ' ' + I18n.t('project.group_copy_suffix');
  anchorClone.group_id = newGroupId;
  anchorClone.group_name = newGroupName;

  const newIds = [anchorClone.id];
  for (let i = 1; i < members.length; i++) {
    const original = members[i];
    const copy = cloneProjectSlotForUndo(original);
    copy.id = newProjectSlotId();
    copy.thumbnail_data_url = null;
    copy.group_id = newGroupId;
    copy.group_name = newGroupName;
    if (isFloorSlot(copy)) {
      const box = projectSlotWorldBox3D(original);
      copy.floor_x_mm = box.cx + deltaXMm;
      copy.floor_z_mm = box.cz + deltaZMm;
      projectSlots.push(copy);
      clampFloorSlotIntoRoom(copy);
    } else {
      const wallGeo = getProjectWallGeometry().find((w) => w.wallIndex === Number(original.wall_index || 0));
      if (wallGeo) {
        const alongDeltaMm = deltaXMm * wallGeo.alongDirX + deltaZMm * wallGeo.alongDirZ;
        copy.x_mm = Number(original.x_mm || 0) + alongDeltaMm;
      }
      projectSlots.push(copy);
      clampProjectSlotPosition(copy);
    }
    newIds.push(copy.id);
  }

  projectMultiSelectIds = new Set(newIds);
  renderProjectCanvas();
  renderProjectConfigPanel();
  if (typeof refreshProject3DResizeArrows === 'function') refreshProject3DResizeArrows();
  if (typeof refreshProject3DMultiHighlight === 'function') refreshProject3DMultiHighlight();
  if (typeof refreshProjectGroupToolbar === 'function') refreshProjectGroupToolbar();
  markProjectDirty();
  return newIds;
}

// Recalcula slot.result (preço) do zero a partir do estado atual do slot —
// chamado depois de QUALQUER alteração inline (medida ou cor, ver
// updateProjectSlotDimension/updateProjectSlotColor abaixo). Mesma chamada
// de Pricing.calculateModulePrice usada em todo canto do arquivo (ver
// po-add-item-btn/applyColorRoleToComposition) — só os dados vêm do slot
// (slot.pieces/slot.colorsByRole/...) em vez dos globais do configurador de
// tela cheia, já que o slot tem cópia própria (ver insertProjectModuleDefault).
// slot.pieces guarda a árvore INTEIRA (opcionais não marcados incluídos) só
// pra quem veio de insertProjectModuleDefault — quem veio de "Editar
// configuração completa" já grava a lista PRÉ-filtrada (mesmo padrão da
// Composição). Filtrar de novo aqui é idempotente nos dois casos (peça já
// filtrada sempre passa no teste de novo), então funciona pros dois sem
// precisar saber qual caminho o slot veio.
// slot.layoutPieces = o que o CONSTRUTOR DE ARMÁRIO gerou (2026-08-13). São
// linhas idênticas às do catálogo (LayoutEngine.toPieceRows: position_role
// 'free' + offset absoluto), então daqui pra frente ninguém precisa saber que
// elas vieram de uma árvore: preço, 3D, elevação 2D e plano de corte tratam
// como peça normal. Este concat é o ÚNICO ponto de junção — é de propósito.
// removedPieceIds (2026-08-20): remoção manual de QUALQUER peça pelo cliente,
// via modal "Peças do móvel" — inclusive peça de casco sem client_optional
// (pedido explícito do Matt: "quero remover qualquer peca", sobrepondo a
// checagem de client_optional que só decidia o que É opcional por padrão).
// Aplicado por último, depois do concat casco+construtor, pra cobrir os dois
// mundos com um único filtro (mesmo raciocínio do comentário acima: "único
// ponto de junção").
// Mesmo concat de sempre, SEM o filtro de removedPieceIds — usado só pelo
// modal "Peças do móvel" (portal-06c), que precisa listar a peça removida
// também (pra mostrar riscada + botão de restaurar). Preço/3D/furação
// continuam só em projectSlotEffectivePieces (com o filtro).
function projectSlotAllPiecesBeforeRemoval(slot) {
  return slot.pieces
    .filter((p) => !p.client_optional || slot.selectedOptionalIds.includes(p.id))
    .concat(slot.layoutPieces || []);
}

function projectSlotEffectivePieces(slot) {
  const removidas = slot.removedPieceIds;
  const base = projectSlotAllPiecesBeforeRemoval(slot);
  if (!removidas || !removidas.length) return base;
  return base.filter((p) => !removidas.includes(p.id));
}

// ==========================================================================
// CONTAGEM REAL DE FUROS PRO PREÇO (2026-08-15)
// ==========================================================================
// O custo de furação passou a usar os furos que a peça DE FATO recebe — os
// mesmos que saem no .ban, contra-furos propagados incluídos. É o que faz a
// lateral, que não tem furação própria, pagar pelos furos que a base abre
// nela (antes ela pagava só a parcela fixa; o Matt notou).
//
// CACHE, e não por preciosismo: recomputeProjectSlotPricing roda a CADA
// pointermove do arraste de medida, e contar furo exige montar as caixas de
// todas as peças (buildBoxes) — a parte cara do gerador. A chave é o que
// realmente muda a furação: módulo + as três medidas. Cor, margem e
// quantidade de prateleira não mexem em furo nenhum.
const projectHoleCountCache = new Map();
function projectHoleCountsFor(slot, parts) {
  if (typeof Drilling === 'undefined' || !Drilling.countHolesByPiece) return null;
  // CATÁLOGO AINDA NÃO CHEGOU: devolve null (= usa furos_equivalentes) e NÃO
  // guarda no cache. Sem esta guarda, a primeira precificação — que roda
  // antes do fetch terminar — gravava um mapa VAZIO na chave do módulo, e o
  // cache continuava servindo esse vazio pra sempre. O catálogo carregava, a
  // contagem passava a funcionar, e o preço não mudava: exatamente o "não
  // mudou" com 60 furos contados e $0,05 por furo cadastrado.
  if (!projectDrillingsByComponent) {
    // AUTOCORREÇÃO (2026-08-15): em vez de só desistir, dispara o
    // carregamento. Quando ele terminar, repriceAllProjectSlots recalcula
    // tudo sozinho — inclusive este slot, que acabou de ser precificado com
    // o número velho.
    //
    // Sem isto, o preço dependia de a furação ter carregado ANTES da
    // primeira precificação. Quando não carregava (o caso real), o slot
    // ficava com o valor do fallback pra sempre: um número errado com cara
    // de certo, que não avisa que está velho. Foi o que fez este item voltar
    // quatro vezes.
    ensureProjectDrillingCatalog();
    return null;
  }
  const chave = [(slot.module || {}).id, slot.width_mm, slot.height_mm, slot.depth_mm].join('|');
  if (projectHoleCountCache.has(chave)) return projectHoleCountCache.get(chave);
  let mapa = null;
  try {
    mapa = Drilling.countHolesByPiece(
      parts, Number(slot.width_mm) || 0, Number(slot.height_mm) || 0, Number(slot.depth_mm) || 0,
      {
        drillingsByComponent: projectDrillingsByComponent,
        holesByPattern: projectHolesByPattern,
        settings: projectDrillingSettings
      }
    );
  } catch (e) { mapa = null; }
  // O cache não pode crescer sem fim numa sessão longa de arraste: cada
  // milímetro arrastado é uma chave nova.
  if (projectHoleCountCache.size > 300) projectHoleCountCache.clear();
  projectHoleCountCache.set(chave, mapa);
  return mapa;
}

// Furação do catálogo, carregada uma vez por sessão. Sem ela a contagem sai
// vazia e o preço cai no furos_equivalentes do cadastro — o comportamento
// anterior, que continua correto, só menos preciso.
let projectDrillingsByComponent = null;
let projectHolesByPattern = null;
let projectDrillingSettings = null;

// Repreça tudo que já está na tela e atualiza os números. Existe como função
// própria porque é chamada de dentro de ensureProjectDrillingCatalog (quando
// a furação finalmente chega) — e um slot com preço velho não avisa que está
// velho: ele só mostra um número errado com cara de certo.
function repriceAllProjectSlots() {
  if (!projectSlots.length) return;
  projectSlots.forEach((slot) => {
    try { recomputeProjectSlotPricing(slot); } catch (e) { /* mantém o anterior */ }
  });
  try { renderProjectSummary(); } catch (e) { /* a tela pode não estar montada ainda */ }
}
// Promessa única: sem ela, várias precificações seguidas (é o que acontece no
// carregamento) disparariam o mesmo fetch em paralelo.
let projectDrillingCatalogLoading = null;
async function ensureProjectDrillingCatalog() {
  if (projectDrillingsByComponent) return;
  if (projectDrillingCatalogLoading) return projectDrillingCatalogLoading;
  projectDrillingCatalogLoading = (async () => {
  try {
    const [furos, programas, ajustes] = await Promise.all([
      supabaseClient.from('component_drillings').select('*').order('sort_order'),
      supabaseClient.from('drilling_pattern_holes').select('*').order('sort_order'),
      supabaseClient.from('drilling_settings').select('*').eq('id', true).single()
    ]);
    const porComp = {};
    (furos.data || []).forEach((r) => {
      if (!porComp[r.component_id]) porComp[r.component_id] = [];
      porComp[r.component_id].push(r);
    });
    projectDrillingsByComponent = porComp;
    projectHolesByPattern = (typeof Drilling !== 'undefined' && Drilling.groupPatternHoles)
      ? Drilling.groupPatternHoles((programas && programas.data) || []) : {};
    projectDrillingSettings = (ajustes && ajustes.data) || {};
    // Qualquer contagem feita ANTES daqui foi calculada sem catálogo. Zerar o
    // cache é o que faz o preço realmente mudar quando a furação chega —
    // cinto e suspensório junto com a guarda em projectHoleCountsFor.
    projectHoleCountCache.clear();
    // E REPREÇA AQUI DENTRO (2026-08-15). Antes o recálculo ficava nos dois
    // CHAMADORES desta função, e nenhum dos dois pegava o caso real: o
    // projeto era precificado no carregamento (catálogo ainda vindo pela
    // rede), caía no furos_equivalentes, e nada o recalculava depois. O
    // sintoma era o preço parado mostrando 20 furos (o número do cadastro)
    // em vez dos 12 contados — com o mapa funcionando perfeitamente se
    // chamado à mão.
    //
    // Dentro da função é o único lugar por onde TODO caminho passa, e roda
    // uma vez só (a guarda no topo garante).
    repriceAllProjectSlots();
  } catch (e) {
    // Falhar aqui não pode derrubar o preço: segue sem contagem real.
    projectDrillingsByComponent = {};
    projectHolesByPattern = {};
    projectDrillingSettings = {};
  }
  })();
  return projectDrillingCatalogLoading;
}

function recomputeProjectSlotPricing(slot) {
  // As peças da árvore são geometria ABSOLUTA em mm: mudou a medida do módulo,
  // elas têm que nascer de novo. Este é o funil por onde toda mudança de
  // dimensão passa, então é aqui que o recálculo mora.
  rebuildProjectSlotLayoutPieces(slot);
  const effectivePieces = projectSlotEffectivePieces(slot);
  const containerDims = { W: Number(slot.width_mm) || 0, H: Number(slot.height_mm) || 0, D: Number(slot.depth_mm) || 0 };
  // `parts` sai UMA vez e serve tanto a contagem de furos (abaixo) quanto o
  // consumo de ferragem (mais abaixo) — as duas dependem da MESMA resolução
  // (resolvePiecesForViewer), e calcular duas vezes só pra separar os dois
  // blocos seria custo em dobro (buildBoxes é a parte cara) sem ganho nenhum.
  let parts = null;
  try {
    parts = resolvePiecesForViewer(
      effectivePieces, containerDims,
      slot.colorsByRole, slot.shelfQuantities, slot.dimOverrides, slot.pieceColorOverrides
    );
  } catch (e) { parts = null; }
  // Publica a contagem real de furos ANTES de calcular (ver
  // projectHoleCountsFor). Pricing.setHoleCounts(null) volta ao
  // furos_equivalentes do cadastro, então nenhum caminho fica sem número.
  if (typeof Pricing !== 'undefined' && Pricing.setHoleCounts) {
    let contagem = null;
    try { contagem = parts ? projectHoleCountsFor(slot, parts) : null; } catch (e) { contagem = null; }
    Pricing.setHoleCounts(contagem);
  }
  // FERRAGEM DE MONTAGEM (minifix/cavilha/tambor/suporte, migration 119,
  // 2026-08-18) — mesma publicação por-módulo que setHoleCounts acima, e
  // pelo mesmo motivo: Hardware.consumoDoModulo conta a partir dos MESMOS
  // furos deste slot (collectAssembly por dentro), então precisa do `parts`
  // e das medidas de AGORA, não de um valor genérico. Sem isto — que era o
  // bug: hardware.js nem carregava no portal e ninguém chamava esta função
  // — moduleHardware ficava sempre null e a ferragem saía R$0 do $ Fábrica,
  // sem erro nenhum. Ver o carregamento do catálogo (Hardware.setCatalog)
  // logo depois do purchased_items, mais acima neste arquivo.
  if (typeof Pricing !== 'undefined' && Pricing.setModuleHardware) {
    let ferragem = null;
    if (parts && typeof Hardware !== 'undefined' && Hardware.consumoDoModulo) {
      try {
        ferragem = Hardware.consumoDoModulo(parts, containerDims.W, containerDims.H, containerDims.D, {
          drillingsByComponent: projectDrillingsByComponent,
          holesByPattern: projectHolesByPattern,
          settings: projectDrillingSettings
        });
      } catch (e) { ferragem = null; }
    }
    Pricing.setModuleHardware(ferragem);
    // Guarda no PRÓPRIO slot pro $ Fábrica ler sem recalcular (collectProjectCostReport,
    // 2026-08-18 — Matt: "nao esta aparecendo minifix, cavilha, corredica e tambor
    // minifix" no relatório). calculateModulePrice só soma isto no total — não
    // devolve a lista de volta pro chamador — então sem guardar aqui o relatório
    // não tinha como saber QUAIS itens formam aquele custo escondido no total.
    slot._hardwareConsumo = ferragem || [];
  }
  slot.result = slot.module.is_decoration
    ? { total: 0, breakdown: [] }
    : Pricing.calculateModulePrice({
      module: slot.module, pieces: effectivePieces, colorsByRole: slot.colorsByRole,
      hingeModel: slot.hingeModel, slideModel: slot.slideModel,
      shelfQuantities: slot.shelfQuantities, dimOverrides: slot.dimOverrides,
      pieceColorOverrides: slot.pieceColorOverrides,
      width_mm: slot.width_mm, height_mm: slot.height_mm, depth_mm: slot.depth_mm,
      markupMultiplier: resolveMarkupMultiplierForModule(slot.module)
    });
}

// Editor inline de medida (steppers +/- e campo exato do painel da direita)
// — pedido do usuário: "clicando abre as configuracoes na direita e eu
// resolva tudo na mesma tela". Trava no min/max do módulo (mesmas colunas
// width_min_mm/max_mm etc. do catálogo) e, no eixo da altura, também no teto
// útil (mesma regra de sempre — pé direito − 5" − rodapé, considerando a
// posição vertical atual do módulo).
// A senha da aba Fábrica. Fica no código de propósito e isso está DOCUMENTADO
// como decisão consciente: ela impede o cliente de abrir a tela por curiosidade,
// não protege o dado — os custos já trafegam pro navegador dele hoje, e quem
// abrir o DevTools alcança tudo com ou sem senha. Blindar de verdade exige o
// cálculo sair do navegador (RPC com RLS). Adiado com o Matt, não esquecido.
const MONEY_FABRICA_SENHA = 'legno';
let moneyFabricaLiberada = false;
let moneyAbaAtual = 'orcamento';
// ESCOPO por grupo (2026-09-03) — null = projeto inteiro (comportamento de
// sempre). Setado por "Ver orçamento" na barra do grupo (ver
// refreshProjectGroupToolbar, portal-06c) — abre o MESMO modal de sempre,
// só filtrando as linhas/o total pros ids passados. Guardado à parte (não
// dentro de projectMultiSelectIds) porque a seleção pode mudar/sumir
// enquanto o modal ainda está aberto (clicar fora do grupo por engano não
// pode fazer o modal aberto trocar de escopo sozinho).
let moneyModalScopeIds = null;

function openMoneyModal(scopeIds) {
  const modal = document.getElementById('po-money-modal');
  if (!modal) return;
  moneyModalScopeIds = (scopeIds && scopeIds.size) ? new Set(scopeIds) : null;
  modal.classList.add('open');
  // Vendedor (migration 149) nunca chega na aba Fábrica (custo puro + margem
  // real do dealer) — nem a senha compartilhada adianta pra ele: o botão da
  // aba nem aparece, e renderMoneyModal força de volta pra Orçamento se
  // moneyAbaAtual tiver ficado em 'fabrica' de uma sessão anterior.
  const fabricaTabBtn = document.querySelector('.po-money-tab[data-money-tab="fabrica"]');
  if (fabricaTabBtn) fabricaTabBtn.style.display = isSellerAccount() ? 'none' : '';
  if (isSellerAccount()) moneyAbaAtual = 'orcamento';

  // RECALCULA AO ABRIR (2026-08-15). O relatório lê slot.result, que pode ter
  // sido calculado numa condição pior do que a atual — tipicamente no
  // carregamento da página, antes de o catálogo de furação chegar pela rede.
  // O resultado ficava congelado num número do fallback: errado, mas com cara
  // de certo, sem nada na tela avisando que estava velho.
  //
  // Tentei antes garantir isso pela ORDEM (recalcular quando o catálogo
  // chegasse). Falhou quatro vezes seguidas porque sempre havia um caminho de
  // inicialização que não passava pelo gancho. Recalcular na abertura não
  // depende de ordem nenhuma: o que você está olhando acabou de ser
  // calculado, ponto.
  //
  // Custo: uma precificação de todos os módulos por abertura do painel. É um
  // clique manual, não um laço de render — e o cache de furos absorve a parte
  // cara.
  if (!projectDrillingsByComponent) {
    // Catálogo ainda não chegou: espera ele e só então desenha, senão o
    // painel abriria mostrando o número velho de novo.
    ensureProjectDrillingCatalog().then(() => { repriceAllProjectSlots(); renderMoneyModal(); });
  } else {
    repriceAllProjectSlots();
  }
  renderMoneyModal();
}
function closeMoneyModal() {
  const modal = document.getElementById('po-money-modal');
  if (modal) modal.classList.remove('open');
}

function renderMoneyModal() {
  const body = document.getElementById('po-money-body');
  if (!body) return;
  // Segunda trava (defesa em profundidade — a primeira é o clique no botão
  // da aba já nem existir pro vendedor, ver openMoneyModal): mesmo que
  // moneyAbaAtual tivesse ficado 'fabrica' de outra sessão, vendedor nunca
  // renderiza o conteúdo da Fábrica.
  if (isSellerAccount()) moneyAbaAtual = 'orcamento';
  document.querySelectorAll('.po-money-tab').forEach((b) => {
    b.classList.toggle('active', b.dataset.moneyTab === moneyAbaAtual);
  });
  // ESCOPO (ver moneyModalScopeIds acima) — ids que já saíram do projeto
  // (removidos com o modal aberto) somem sozinhos do filtro.
  const scopedSlots = moneyModalScopeIds
    ? projectSlots.filter((s) => moneyModalScopeIds.has(s.id))
    : projectSlots;
  const rel = collectProjectCostReport(scopedSlots);

  if (moneyAbaAtual === 'orcamento') { renderMoneyOrcamento(body, rel, scopedSlots); return; }
  if (isSellerAccount()) { renderMoneyOrcamento(body, rel, scopedSlots); return; }
  if (!moneyFabricaLiberada) { renderMoneySenha(body); return; }
  renderMoneyFabrica(body, rel);
}

// ---- Aba ORÇAMENTO: o que o cliente pode ver. Preço de venda, sem custo.
// Vendedor (migration 149, pedido do Matt 02/09/2026: "tira de todos os
// pontos onde aparecem, so para os vendedores") nunca vê o preço de fábrica
// cru aqui também — nem por módulo nem no total, sempre com a margem do
// dealer já aplicada (getDisplayPrice).
function renderMoneyOrcamento(body, rel, slots) {
  const seller = isSellerAccount();
  const linhas = (slots || projectSlots).filter((s) => s.result).map((s) => {
    const preco = Number(s.result.total) || 0;
    return '<tr><td>' + escapeHtmlCutlist(s.module.name || '') + '</td>'
      + '<td class="num">' + Math.round(s.width_mm) + '×' + Math.round(s.height_mm) + '×' + Math.round(s.depth_mm) + '</td>'
      + '<td class="num">' + formatMoney(seller ? getDisplayPrice(preco) : preco) + '</td></tr>';
  }).join('');
  const subKey = moneyModalScopeIds ? 'money.quote_sub_group' : 'money.quote_sub';
  body.innerHTML = '<p class="po-money-sub">' + I18n.t(subKey) + '</p>'
    + '<table class="po-money-table"><thead><tr><th>' + I18n.t('money.col_module') + '</th><th class="num">' + I18n.t('money.col_dims_mm') + '</th>'
    + '<th class="num">' + I18n.t('money.col_price') + '</th></tr></thead><tbody>' + linhas + '</tbody></table>'
    + '<div class="po-money-total"><span>' + I18n.t('money.quote_total') + '</span>'
    + '<strong>' + formatMoney(seller ? getDisplayPrice(rel.totalVenda) : rel.totalVenda) + '</strong></div>';
}

// ---- Porta da aba FÁBRICA
function renderMoneySenha(body) {
  body.innerHTML = '<div class="po-money-lock">'
    + '<p>' + I18n.t('money.lock_intro') + '</p>'
    + '<input type="password" id="po-money-pass" placeholder="' + I18n.t('money.password_placeholder') + '" autocomplete="off">'
    + '<button type="button" id="po-money-pass-btn">' + I18n.t('money.password_open_btn') + '</button>'
    + '<p class="po-money-erro" id="po-money-erro"></p>'
    + '</div>';
  const tenta = () => {
    const v = (document.getElementById('po-money-pass') || {}).value || '';
    if (v === MONEY_FABRICA_SENHA) { moneyFabricaLiberada = true; renderMoneyModal(); return; }
    const e = document.getElementById('po-money-erro');
    if (e) e.textContent = I18n.t('money.wrong_password');
  };
  document.getElementById('po-money-pass-btn').addEventListener('click', tenta);
  document.getElementById('po-money-pass').addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') tenta();
  });
}

// ---- Aba FÁBRICA: custo puro, aberto por natureza, com o % de cada linha.
function renderMoneyFabrica(body, rel) {
  const T = rel.totalCusto || 1;
  const pct = (v) => ((v / T) * 100).toFixed(1) + '%';
  const linha = (rot, detalhe, valor) => (
    '<tr><td>' + rot + '</td><td class="num dim">' + (detalhe || '') + '</td>'
    + '<td class="num">' + formatMoney(valor) + '</td>'
    + '<td class="num pct">' + pct(valor) + '</td></tr>'
  );
  const secao = (titulo) => '<tr class="po-money-sec"><td colspan="4">' + titulo + '</td></tr>';

  // SUBTOTAL POR NATUREZA (2026-08-15, Matt: "preciso um somatório de matéria-
  // prima e um de mão de obra"). É a divisão que a fábrica usa pra decidir
  // coisa diferente: matéria-prima se compra e se estoca; mão de obra é
  // capacidade de máquina e de gente. Somadas num total só, não dá pra
  // enxergar qual das duas está pesando.
  //
  // A FERRAGEM entra em matéria-prima, e não em mão de obra: dobradiça e
  // corrediça são insumo comprado, igual à chapa e à fita. O rótulo diz o que
  // está dentro pra não restar dúvida.
  const fer = rel.ferragem;
  const ferMontagem = Object.keys(rel.ferragemMontagem).map((k) => rel.ferragemMontagem[k])
    .sort((a, b) => b.custo - a.custo || a.name.localeCompare(b.name));
  const totalFerMontagem = ferMontagem.reduce((s, l) => s + l.custo, 0);
  // PEÇAS COMPRADAS por componente (migration 119/129 — pé plástico, cabide,
  // kit suporte...) — diferente de ferMontagem (ferragem por FURO): esta é
  // ferragem/acessório LIGADO a um componente do catálogo. Ver comentário
  // grande em collectProjectCostReport (rel.pecasCompradas).
  const pecasCompradas = Object.keys(rel.pecasCompradas).map((k) => rel.pecasCompradas[k])
    .sort((a, b) => b.custo - a.custo || a.name.localeCompare(b.name));
  const totalPecasCompradas = pecasCompradas.reduce((s, l) => s + l.custo, 0);
  const totalMateria = Object.keys(rel.material).reduce((s, k) => s + rel.material[k].custo, 0)
    + Object.keys(rel.fita).reduce((s, k) => s + rel.fita[k].custo, 0)
    + fer.dobradica.custo + fer['corrediça'].custo + totalFerMontagem + totalPecasCompradas;
  const totalMO = rel.labor.corte + rel.labor.fita + rel.labor.furacao
    + rel.labor.usinagem + rel.labor.antiga;

  const subtotal = (rot, valor) => (
    '<tr class="po-money-subtotal"><td>' + rot + '</td><td></td>'
    + '<td class="num">' + formatMoney(valor) + '</td>'
    + '<td class="num pct">' + pct(valor) + '</td></tr>'
  );

  let html = '';
  html += secao(I18n.t('money.section_material'));
  Object.keys(rel.material).sort().forEach((cor) => {
    const m = rel.material[cor];
    html += linha(I18n.t('money.row_board') + escapeHtmlCutlist(cor), m.m2.toFixed(3) + ' m²', m.custo);
  });
  Object.keys(rel.fita).sort().forEach((cor) => {
    const f = rel.fita[cor];
    html += linha(I18n.t('money.row_edgeband') + escapeHtmlCutlist(cor), f.m.toFixed(2) + ' m', f.custo);
  });
  // Dobradiça/corrediça QUEBRADA POR MODELO (2026-08-19, Matt: "nao esta
  // especificando qual corredica nem tamanho") — uma linha por modelo
  // realmente usado, com nome + comprimento do trilho quando tem, em vez de
  // um total genérico "Corrediças". Mesmo padrão de ferMontagem logo abaixo.
  // fer.dobradica.custo/fer['corrediça'].custo continuam existindo (usados
  // em totalMateria/rel.totalCusto), só não viram mais linha própria aqui.
  const dobradicaPorModelo = Object.keys(fer.dobradicaPorModelo).map((k) => fer.dobradicaPorModelo[k])
    .sort((a, b) => b.custo - a.custo || a.name.localeCompare(b.name));
  dobradicaPorModelo.forEach((l) => {
    html += linha(I18n.t('money.row_hinges') + ' — ' + l.name, l.qtd + ' ' + I18n.t('money.unit_pieces'), l.custo);
  });
  const corredicaPorModelo = Object.keys(fer.corredicaPorModelo).map((k) => fer.corredicaPorModelo[k])
    .sort((a, b) => b.custo - a.custo || a.name.localeCompare(b.name));
  corredicaPorModelo.forEach((l) => {
    const tam = l.rail_length_mm != null ? ' (' + Math.round(l.rail_length_mm) + 'mm)' : '';
    html += linha(I18n.t('money.row_slides') + ' — ' + l.name + tam, l.qtd + ' ' + I18n.t('money.unit_pairs'), l.custo);
  });
  // FERRAGEM DE MONTAGEM — minifix (pino+tambor), cavilha, suporte de
  // prateleira etc. (migration 119, ligada no $ Fábrica em 2026-08-18). Uma
  // linha por ITEM comprado, nome vem direto do cadastro (Itens Comprados),
  // então cavilha/tambor/pino aparecem com o nome que o Matt deu a eles lá.
  ferMontagem.forEach((l) => {
    html += linha(l.name, l.qtd + ' ' + (l.unit || 'un'), l.custo);
  });
  // PEÇAS COMPRADAS ligadas a um componente do catálogo (migration 119/129 —
  // pé plástico, cabide + kit suporte...) — nome/unidade vêm do cadastro em
  // Itens Comprados, igual ferMontagem acima; diferença é que esta ferragem
  // está LIGADA a um componente (origin='comprado'), não a um FURO.
  pecasCompradas.forEach((l) => {
    const qtdLabel = l.unit === 'm' ? l.qtd.toFixed(2) + ' m' : l.qtd + ' ' + (l.unit || 'un');
    html += linha(l.name, qtdLabel, l.custo);
  });
  html += subtotal(I18n.t('money.subtotal_material'), totalMateria);

  html += secao(I18n.t('money.section_labor'));
  const rotulos = {
    corte: I18n.t('money.labor_cut'), fita: I18n.t('money.labor_glue'),
    furacao: I18n.t('money.labor_drill'), usinagem: I18n.t('money.labor_machining')
  };
  Object.keys(rotulos).forEach((k) => {
    if (rel.labor[k] > 0) html += linha(rotulos[k], '', rel.labor[k]);
  });
  // Peça fora do modelo por processo: aparece SEPARADA, nunca somada num
  // processo — senão o relatório diria que a fábrica gastou em furação um
  // dinheiro que na verdade é de uma labor antiga, indivisível.
  if (rel.labor.antiga > 0) {
    html += linha(I18n.t('money.labor_legacy'), '', rel.labor.antiga);
  }
  html += subtotal(I18n.t('money.subtotal_labor'), totalMO);

  // ---- MÓDULO × VALOR (pedido do Matt: "coloca módulo valor")
  let porMod = '';
  rel.porModulo.forEach((m) => {
    porMod += '<tr><td>' + escapeHtmlCutlist(m.nome) + '</td>'
      + '<td class="num dim">' + m.dims + '</td>'
      + '<td class="num">' + formatMoney(m.custo) + '</td>'
      + '<td class="num pct">' + ((m.custo / T) * 100).toFixed(1) + '%</td></tr>';
  });

  // ---- POR PEÇA, CADA ETAPA SEPARADA. É a tabela que responde "quantos
  // pequenos processos ele está cobrando" — uma linha por peça, uma coluna
  // por etapa. Sem linha por furo, como o Matt pediu.
  let porPeca = '';
  rel.detalhe.forEach((l) => {
    const cel = (v) => '<td class="num">' + (v > 0 ? formatMoney(v) : '<span class="zero">—</span>') + '</td>';
    porPeca += '<tr><td>' + escapeHtmlCutlist(l.peca) + (l.qtd > 1 ? ' <span class="dim">×' + l.qtd + '</span>' : '') + '</td>'
      + '<td class="num dim">' + l.m2.toFixed(3) + '</td>'
      + '<td class="num dim">' + (l.fitaM > 0 ? l.fitaM.toFixed(2) : '—') + '</td>'
      + cel(l.chapa) + cel(l.fita) + cel(l.corte) + cel(l.colagem) + cel(l.furacao)
      + cel(l.usinagem) + cel(l.laborAntiga) + cel(l.ferragem)
      + '<td class="num"><strong>' + formatMoney(l.total) + '</strong></td></tr>';
  });

  const margem = rel.totalVenda - rel.totalCusto;
  const th = (k, num) => '<th' + (num ? ' class="num"' : '') + '>' + I18n.t(k) + '</th>';
  body.innerHTML = '<p class="po-money-sub">' + I18n.t('money.factory_sub', { n: rel.pecas }) + '</p>'
    + '<table class="po-money-table"><thead><tr>' + th('money.col_nature') + th('money.col_qty', 1)
    + th('money.col_cost', 1) + '<th class="num">%</th></tr></thead><tbody>' + html + '</tbody></table>'

    + (rel.porModulo.length ? '<h4 class="po-money-h">' + I18n.t('money.by_module_title') + '</h4>'
      + '<table class="po-money-table"><thead><tr>' + th('money.col_module') + th('money.col_dims', 1)
      + th('money.col_cost', 1) + '<th class="num">%</th></tr></thead><tbody>' + porMod + '</tbody></table>' : '')

    + '<h4 class="po-money-h">' + I18n.t('money.by_piece_title') + '</h4>'
    + '<p class="po-money-sub">' + I18n.t('money.by_piece_sub') + '</p>'
    + '<div class="po-money-scroll"><table class="po-money-table po-money-peca"><thead><tr>'
    + th('money.col_piece') + '<th class="num">m²</th>' + th('money.col_edge_m', 1)
    + th('money.col_board', 1) + th('money.col_edge', 1) + th('money.col_cut', 1)
    + th('money.col_glue', 1) + th('money.col_drill', 1) + th('money.col_machining', 1)
    + th('money.col_legacy_labor', 1) + th('money.col_hardware', 1) + th('money.col_total', 1)
    + '</tr></thead><tbody>' + porPeca + '</tbody></table></div>'

    + '<div class="po-money-total"><span>' + I18n.t('money.total_cost') + '</span><strong>' + formatMoney(rel.totalCusto) + '</strong></div>'
    + '<div class="po-money-total secundario"><span>' + I18n.t('money.total_sale') + '</span>'
    + '<span>' + formatMoney(rel.totalVenda) + '</span></div>'
    + '<div class="po-money-total secundario"><span>' + I18n.t('money.gross_margin') + '</span>'
    + '<span>' + formatMoney(margem)
    + (rel.totalVenda > 0 ? ' · ' + ((margem / rel.totalVenda) * 100).toFixed(1) + I18n.t('money.pct_of_price') : '')
    + '</span></div>';
}

(function ligaMoneyModal() {
  const liga = () => {
    // Dois gatilhos: o da BARRA (principal, 2026-08-15) e o do rodapé do
    // resumo. Se um dia o do resumo sair, o da barra continua valendo.
    const btnTb = document.getElementById('po-proj-money-tb-btn');
    const btn = document.getElementById('po-proj-money-btn');
    if (!btnTb && !btn) return false;
    // Chamada sem argumento explícito (2026-09-03): openMoneyModal(scopeIds)
    // agora aceita um Set opcional pra abrir só num GRUPO (ver barra do
    // grupo, portal-06c) — passar a função direto como listener passaria o
    // MouseEvent no lugar de scopeIds; funcionaria por acidente
    // (event.size é undefined, cai no "projeto inteiro" mesmo assim), mas
    // não vale arriscar num refactor futuro do Event.
    if (btnTb) btnTb.addEventListener('click', () => openMoneyModal());
    if (btn) btn.addEventListener('click', () => openMoneyModal());
    const fechar = document.getElementById('po-money-close');
    if (fechar) fechar.addEventListener('click', closeMoneyModal);
    document.querySelectorAll('.po-money-tab').forEach((b) => {
      b.addEventListener('click', () => { moneyAbaAtual = b.dataset.moneyTab; renderMoneyModal(); });
    });
    const modal = document.getElementById('po-money-modal');
    if (modal) modal.addEventListener('click', (ev) => { if (ev.target === modal) closeMoneyModal(); });
    return true;
  };
  if (!liga()) document.addEventListener('DOMContentLoaded', liga);
})();

// ==========================================================================
// MODAL "MARGENS" — desconto de fábrica + margem do lojista, com extras
// (migration 151, 2026-09-03)
// ==========================================================================
// Pedido do Matt: "preciso uma configuracao de desconto de fabrica...
// aplicado no valor de fabrica, que vira base de custo para ai sim a margem
// do dealer ser acrecentada em cima... novo botao de margens na barra (so
// habilita pra dealer) nao pra vendedores... com custo fabrica tabela -
// desconto, extra tipo frete/tax/extra que pode diminuir ou aumentar... e
// margem do lojista que acrescenta margem bruta, e tambem pode colocar
// outros custos extras como comissao, montagem, tax, outros".
//
// Self-service, sem senha extra (diferente da aba $ Fábrica acima, que TEM
// senha compartilhada) — o botão #po-margins-btn já só aparece pra
// isDealer() (refreshDealerUiVisibility, portal-05-cutlist.js), e as
// funções de leitura/gravação abaixo dependem de currentUser + RLS
// owner-only (migration 151), então não precisa de outra trava na frente.
//
// Números de topo (desconto de fábrica % + margem bruta %) salvam juntos
// num botão "Salvar" (mesmo gesto de sempre no projeto). Extras (linhas
// dinâmicas) salvam IMEDIATAMENTE a cada mudança/adição/remoção — são
// registros próprios (dealer_pricing_extras), não um campo de formulário
// só, então não faz sentido represar num botão só.

function marginsExtraRowHtml(extra) {
  const id = escapeHtmlCutlist(extra.id);
  const name = escapeHtmlCutlist(extra.name || '');
  const kind = extra.kind === 'fixed' ? 'fixed' : 'pct';
  const sign = extra.sign === 'subtract' ? 'subtract' : 'add';
  const value = Number(extra.value) || 0;
  return '<div class="po-margins-extra-row" data-extra-id="' + id + '">'
    + '<input type="text" class="po-margins-extra-name" data-field="name" value="' + name + '" data-i18n-placeholder="margins.extra_name_placeholder" placeholder="' + I18n.t('margins.extra_name_placeholder') + '" />'
    + '<select data-field="sign">'
    + '<option value="add"' + (sign === 'add' ? ' selected' : '') + '>+</option>'
    + '<option value="subtract"' + (sign === 'subtract' ? ' selected' : '') + '>&minus;</option>'
    + '</select>'
    + '<input type="number" class="po-margins-extra-value" data-field="value" min="0" step="0.01" value="' + value + '" />'
    + '<select data-field="kind">'
    + '<option value="pct"' + (kind === 'pct' ? ' selected' : '') + '>%</option>'
    + '<option value="fixed"' + (kind === 'fixed' ? ' selected' : '') + '>$</option>'
    + '</select>'
    + '<button type="button" class="po-margins-extra-remove" data-remove-extra="' + id + '" title="' + I18n.t('margins.remove_extra_title') + '">&times;</button>'
    + '</div>';
}

function marginsSectionExtrasHtml(side) {
  const extras = resolveDealerPricingExtras(side);
  const rows = extras.map(marginsExtraRowHtml).join('');
  return '<div class="po-margins-extras" data-side="' + side + '">'
    + (rows || '<div class="hint">' + I18n.t('margins.no_extras') + '</div>')
    + '<button type="button" class="secondary po-margins-add-extra-btn" data-add-extra-side="' + side + '">' + I18n.t('margins.add_extra_btn') + '</button>'
    + '</div>';
}

// Redesenha o corpo do modal a partir do cache (dealerFactoryDiscountPct/
// resolvedDisplayMarginPct/dealerPricingExtras, todos em
// portal-05-cutlist.js) — chamada ao abrir, depois de qualquer
// salvar/adicionar/remover extra, e de refreshDealerUiVisibility (login).
// Não-dealer: corpo fica vazio (o botão que abre isto nem aparece pra
// esse perfil, ver refreshDealerUiVisibility).
function renderMarginsModal() {
  const body = document.getElementById('po-margins-body');
  if (!body) return;
  if (!isDealer()) { body.innerHTML = ''; return; }
  const discountPct = getFactoryDiscountPct();
  const marginPct = getResaleMarginPct();
  body.innerHTML = ''
    + '<div class="po-margins-section">'
    + '<div class="po-margins-section-title">' + I18n.t('margins.factory_cost_title') + '</div>'
    + '<p class="po-money-sub">' + I18n.t('margins.factory_cost_hint') + '</p>'
    + '<label class="po-margins-field"><span>' + I18n.t('margins.factory_discount_label') + '</span>'
    + '<input type="number" id="po-margins-discount-input" min="0" max="100" step="0.1" value="' + (discountPct || '') + '" /></label>'
    + '<div class="po-margins-section-subtitle">' + I18n.t('margins.extras_title_custo') + '</div>'
    + marginsSectionExtrasHtml('custo')
    + '</div>'
    + '<div class="po-margins-section">'
    + '<div class="po-margins-section-title">' + I18n.t('margins.dealer_margin_title') + '</div>'
    + '<p class="po-money-sub">' + I18n.t('margins.dealer_margin_hint') + '</p>'
    + '<label class="po-margins-field"><span>' + I18n.t('margins.gross_margin_label') + '</span>'
    + '<input type="number" id="po-margins-margin-input" min="0" step="0.1" value="' + (marginPct || '') + '" /></label>'
    + '<div class="po-margins-section-subtitle">' + I18n.t('margins.extras_title_margem') + '</div>'
    + marginsSectionExtrasHtml('margem')
    + '</div>'
    + '<button type="button" class="po-btn-primary-block" id="po-margins-save-btn">' + I18n.t('margins.save_btn') + '</button>'
    + '<span id="po-margins-save-status" class="hint"></span>';
}

function openMarginsModal() {
  const modal = document.getElementById('po-margins-modal');
  if (!modal || !isDealer()) return;
  modal.classList.add('open');
  renderMarginsModal();
}
function closeMarginsModal() {
  const modal = document.getElementById('po-margins-modal');
  if (modal) modal.classList.remove('open');
}

// Salva os 2 números de topo juntos (mesmo update, 1 viagem ao banco):
// desconto de fábrica (coluna nova) + margem bruta (resale_margin_pct,
// já existia — migration 072, só ganhou um 2º lugar pra editar). Atualiza
// os 2 caches síncronos (dealerFactoryDiscountPct/resolvedDisplayMarginPct)
// e o campo antigo do menu de Configurações (refreshResaleMarginInput),
// pra nunca ficar dessincronizado entre os dois lugares que editam a mesma
// coluna.
async function saveMarginsTopFields() {
  if (!currentUser) return;
  const discountInput = document.getElementById('po-margins-discount-input');
  const marginInput = document.getElementById('po-margins-margin-input');
  const statusEl = document.getElementById('po-margins-save-status');
  let discountVal = Number(discountInput && discountInput.value);
  if (!Number.isFinite(discountVal) || discountVal < 0) discountVal = 0;
  if (discountVal > 100) discountVal = 100;
  let marginVal = Number(marginInput && marginInput.value);
  if (!Number.isFinite(marginVal) || marginVal < 0) marginVal = 0;
  if (statusEl) statusEl.textContent = I18n.t('margins.saving');
  try {
    const { data, error } = await supabaseClient
      .from('user_profiles')
      .update({ factory_discount_pct: discountVal, resale_margin_pct: marginVal })
      .eq('user_id', currentUser.id)
      .select()
      .single();
    if (!error && data) {
      currentUserProfile = data;
      dealerFactoryDiscountPct = Number(data.factory_discount_pct) || 0;
      resolvedDisplayMarginPct = Number(data.resale_margin_pct) || 0;
      refreshResaleMarginInput();
      if (typeof repriceAllProjectSlots === 'function') repriceAllProjectSlots();
      if (typeof renderProjectSummary === 'function') renderProjectSummary();
      if (statusEl) statusEl.textContent = I18n.t('margins.saved');
    } else if (statusEl) {
      statusEl.textContent = (error && error.message) || I18n.t('margins.save_error');
    }
  } catch (err) {
    if (statusEl) statusEl.textContent = I18n.t('margins.save_error');
  }
}

// CRUD de uma linha de extra — cada ação já salva na hora (ver comentário
// de escopo no topo desta seção) e redesenha o modal a partir da resposta
// do banco (nunca do valor otimista local), pra ficar sempre fiel ao que
// realmente foi gravado.
async function addDealerPricingExtra(side) {
  if (!currentUser || !isDealer()) return;
  try {
    const sortOrder = resolveDealerPricingExtras(side).length;
    const { data, error } = await supabaseClient
      .from('dealer_pricing_extras')
      .insert({ dealer_user_id: currentUser.id, side, name: I18n.t('margins.new_extra_name'), kind: 'pct', sign: 'add', value: 0, sort_order: sortOrder })
      .select()
      .single();
    if (!error && data) {
      dealerPricingExtras.push(data);
      renderMarginsModal();
      if (typeof repriceAllProjectSlots === 'function') repriceAllProjectSlots();
    }
  } catch (err) {
    // silencioso — mesmo padrão do resto do arquivo
  }
}

async function updateDealerPricingExtraField(id, field, rawValue) {
  if (!currentUser || !isDealer() || !id || !field) return;
  const patch = {};
  if (field === 'value') {
    let v = Number(rawValue);
    if (!Number.isFinite(v) || v < 0) v = 0;
    patch.value = v;
  } else if (field === 'name' || field === 'kind' || field === 'sign') {
    patch[field] = rawValue;
  } else {
    return;
  }
  try {
    const { data, error } = await supabaseClient
      .from('dealer_pricing_extras')
      .update(patch)
      .eq('id', id)
      .eq('dealer_user_id', currentUser.id)
      .select()
      .single();
    if (!error && data) {
      const idx = dealerPricingExtras.findIndex((row) => row.id === id);
      if (idx >= 0) dealerPricingExtras[idx] = data;
      renderMarginsModal();
      if (typeof repriceAllProjectSlots === 'function') repriceAllProjectSlots();
      if (typeof renderProjectSummary === 'function') renderProjectSummary();
    }
  } catch (err) {
    // silencioso
  }
}

async function deleteDealerPricingExtra(id) {
  if (!currentUser || !isDealer() || !id) return;
  try {
    const { error } = await supabaseClient
      .from('dealer_pricing_extras')
      .delete()
      .eq('id', id)
      .eq('dealer_user_id', currentUser.id);
    if (!error) {
      dealerPricingExtras = dealerPricingExtras.filter((row) => row.id !== id);
      renderMarginsModal();
      if (typeof repriceAllProjectSlots === 'function') repriceAllProjectSlots();
      if (typeof renderProjectSummary === 'function') renderProjectSummary();
    }
  } catch (err) {
    // silencioso
  }
}

(function ligaMarginsModal() {
  const liga = () => {
    const btn = document.getElementById('po-margins-btn');
    if (!btn) return false;
    btn.addEventListener('click', openMarginsModal);
    const fechar = document.getElementById('po-margins-close');
    if (fechar) fechar.addEventListener('click', closeMarginsModal);
    const modal = document.getElementById('po-margins-modal');
    if (modal) {
      modal.addEventListener('click', (ev) => {
        if (ev.target === modal) { closeMarginsModal(); return; }
        const saveBtn = ev.target.closest('#po-margins-save-btn');
        if (saveBtn) { saveMarginsTopFields(); return; }
        const addBtn = ev.target.closest('[data-add-extra-side]');
        if (addBtn) { addDealerPricingExtra(addBtn.dataset.addExtraSide); return; }
        const removeBtn = ev.target.closest('[data-remove-extra]');
        if (removeBtn) { deleteDealerPricingExtra(removeBtn.dataset.removeExtra); return; }
      });
      // 'change' (não 'input') — só dispara ao sair do campo/trocar select,
      // então redesenhar o modal inteiro aqui nunca atrapalha quem ainda
      // está digitando (mesmo raciocínio do resto do app: commit só no
      // blur, ver commitCutlistDimensionInput em portal-05-cutlist.js).
      modal.addEventListener('change', (ev) => {
        const row = ev.target.closest('.po-margins-extra-row');
        if (!row) return;
        const field = ev.target.dataset.field;
        if (!field) return;
        updateDealerPricingExtraField(row.dataset.extraId, field, ev.target.value);
      });
    }
    return true;
  };
  if (!liga()) document.addEventListener('DOMContentLoaded', liga);
})();

// ==========================================================================
// $ FÁBRICA — o custo do projeto aberto por natureza (2026-08-15)
// ==========================================================================
// Pedido do Matt: "quero enxergar esses custos todos separados no módulo...
// um relatório completo, mostrando quantos m² de material, fita de borda, por
// cor, e cada labor. % do lado sobre o total. Sem margem, só custo."
//
// NÃO calcula nada novo. Tudo isto já sai de Pricing.calculateModulePrice, por
// peça, no `breakdown` (que o próprio pricing.js marca como "uso interno/admin
// — NÃO mostrar ao cliente: custo puro"). Aqui é só somar e agrupar.
//
// Três detalhes que decidem se o número fecha:
//   1. `area_m2` e `edge_band_m` são POR UNIDADE; sheet_cost/edge_cost/
//      labor_cost já vêm multiplicados pela quantidade. Misturar isso é o
//      jeito mais fácil de o relatório não bater com o total.
//   2. Peça-MÓDULO (is_module) não tem custo próprio: o custo está nas
//      child_breakdown dela. Por isso a travessia é recursiva e só soma folha.
//   3. `labor_breakdown` só existe na peça que está em processo (migration
//      090). Quem não está tem uma labor única e indivisível — ela vai pra
//      linha "Mão de obra (peça antiga)" em vez de sumir ou ser chutada em
//      cima de um processo.
function collectProjectCostReport(slots) {
  const rel = {
    material: {},      // por cor: { m2, custo }
    fita: {},          // por cor: { m, custo }
    labor: { corte: 0, fita: 0, furacao: 0, usinagem: 0, antiga: 0 },
    ferragem: {
      dobradica: { qtd: 0, custo: 0 }, corrediça: { qtd: 0, custo: 0 },
      // POR MODELO (2026-08-19, Matt: "nao esta especificando qual corredica
      // nem tamanho"). Os buckets acima (dobradica/corrediça) continuam
      // existindo pra rel.totalCusto e o "qtd total" — estes aqui são só pra
      // exibir QUAL corrediça/dobradiça pagou por cada parcela, quebrado por
      // modelo (nome + comprimento do trilho, quando tem). Chave: model_id
      // (hinge_model_id/slide_model_id, ver Pricing.calculateModulePiece/
      // calculateLeafPiece) — mesmo padrão de ferragemMontagem abaixo.
      dobradicaPorModelo: {}, corredicaPorModelo: {}
    },
    // FERRAGEM DE MONTAGEM (minifix/cavilha/tambor/suporte, migration 119,
    // 2026-08-18) — Matt: "nao esta aparecendo minifix, cavilha, corredica e
    // tambor minifix" no $ Fábrica. Causa: o cálculo (Hardware.consumoDoModulo,
    // ligado hoje mais cedo em recomputeProjectSlotPricing) já soma certo no
    // TOTAL do módulo, mas essa lista nunca virava linha nenhuma na tela —
    // ficava escondida dentro do total, sem nome nem valor visível. Chave é o
    // item_id (mesmo item comprado repetido em módulos diferentes soma numa
    // linha só, igual dobradiça/corrediça acima).
    ferragemMontagem: {}, // por item_id: { code, name, unit, qtd, custo }
    // PEÇA COMPRADA (migration 119, e migration 129 do cabide — 2026-08-20,
    // Matt: "cabide nao ta cobrando no orcamento"). CAUSA: calculateLeafPiece
    // sempre devolveu purchased_cost/support_cost certinhos (é o que forma
    // slot.result.total, o preço de VENDA que o cliente vê — esse SEMPRE
    // esteve certo), mas ESTE relatório reconstrói o CUSTO peça a peça do
    // zero pra abrir por natureza, e nunca somava purchased_cost/support_cost
    // em lugar nenhum — nem no "total" da linha de detalhe, nem em nenhum
    // balde de rel.totalCusto. Toda peça comprada por COMPONENTE (pé
    // plástico, cabide, kit suporte — diferente de ferragemMontagem, que é
    // ferragem por FURO) ficava invisível aqui, mesmo cobrando certo no
    // preço final. Mesmo padrão de bug de ferragemMontagem acima (18/08) e
    // do hinge/slide de peça-módulo (19/08): dado já calculado que nunca
    // virava linha na tela. Chave: purchased_item_id (peça comprada
    // principal) ou support_purchased_item_id (kit que "vai junto") — os
    // dois podem somar na MESMA linha se forem o mesmo id (não é o caso
    // hoje, mas evita duplicar chave por acidente).
    pecasCompradas: {}, // por item_id: { code, name, unit, qtd, custo }
    totalCusto: 0,
    totalVenda: 0,
    pecas: 0,
    detalhe: [],       // uma linha por PEÇA, com cada etapa separada
    porModulo: []      // { nome, dims, custo, venda } — "módulo × valor"
  };

  const nomeCor = (slot, roleId) => {
    const c = (slot.colorsByRole || {})[roleId];
    return (c && c.name) || I18n.t('money.no_color');
  };

  // Empilha custo de dobradiça/corrediça POR MODELO (2026-08-19) — id ausente
  // (peça antiga calculada antes desta mudança, ou hardware sem modelo
  // identificável) cai num balde "modelo não identificado" em vez de sumir.
  const registraFerragemModelo = (mapa, modelId, modelName, railMm, qtd, custo) => {
    const chave = modelId || ('#' + (modelName || '?'));
    const acc = mapa[chave] || (mapa[chave] = {
      name: modelName || I18n.t('money.no_hardware_model'),
      rail_length_mm: railMm != null ? railMm : null,
      qtd: 0, custo: 0
    });
    acc.qtd += qtd;
    acc.custo += custo;
    if (acc.rail_length_mm == null && railMm != null) acc.rail_length_mm = railMm;
  };

  // Empilha custo de PEÇA COMPRADA por item (migration 119/129) — mesma
  // forma de ferragemMontagem/registraFerragemModelo, só que a chave aqui é
  // sempre um purchased_item_id de verdade (a peça só chega aqui depois de
  // calculateLeafPiece já ter achado o item no catálogo, então não precisa
  // do fallback "#nome" pensado pra dobradiça/corrediça sem modelo).
  const registraPecaComprada = (itemId, itemName, unit, qtd, custo) => {
    const acc = rel.pecasCompradas[itemId] || (rel.pecasCompradas[itemId] = {
      name: itemName || I18n.t('money.no_hardware_model'), unit: unit || 'un', qtd: 0, custo: 0
    });
    acc.qtd += qtd;
    acc.custo += custo;
  };

  // Rótulo da peça com "— Modelo NNNmm" quando tem hardware com nome
  // identificado — é o que faz a tabela "BY PART" também responder "qual
  // corrediça" sem precisar abrir a linha de matéria-prima.
  const labelComModelo = (base, modelName, railMm) => {
    if (!modelName) return base;
    const tam = railMm != null ? ' ' + Math.round(railMm) + 'mm' : '';
    return base + ' — ' + modelName + tam;
  };

  const anda = (slot, linhas, prefixo, fator) => {
    fator = fator || 1;
    (linhas || []).forEach((p) => {
      if (p.is_module) {
        // Peça-módulo não tem CHAPA/FITA/MÃO DE OBRA próprias (isso está nos
        // filhos, por isso a travessia recursiva abaixo) — mas PODE ter
        // dobradiça/corrediça PRÓPRIA, quando ela mesma abre (opening_type/
        // slides_per_unit do módulo filho, OU do agregado que a gerou — ver
        // Pricing.calculateModulePiece, hinge_cost/slide_cost calculados em
        // cima do "efetivo" da peça-módulo, não repassados pros filhos).
        //
        // BUG (Matt, 2026-08-19: "e deixei tudo ligado e no construtor nao
        // apareceu a corredica no preco"): esta função assumia "peça-módulo
        // nunca tem custo próprio" — verdade pra chapa/fita/mão de obra,
        // falso pra dobradiça/corrediça. Uma gaveta usada como agregado
        // (accessory_types.child_module_id, opening_type=slide_out) SEMPRE
        // caía aqui sem a corrediça dela ser contada: nem a linha
        // "Corrediças" aparecia (ferragem.corrediça.custo nunca recebia
        // nada), nem o total "By module"/rel.totalCusto batiam com
        // Pricing.calculateModulePrice (que soma certo — SÓ este relatório,
        // que refaz a soma peça a peça, estava com o buraco). O total de
        // VENDA (slot.result.total, o que o cliente paga) sempre esteve
        // certo — só o detalhamento de CUSTO que escondia a parcela.
        //
        // `fator` acumula a quantidade dos ANCESTRAIS (peça-módulo dentro de
        // peça-módulo) — mesmo padrão de collectPurchasedCost em
        // js/pricing.js. hinge_cost/slide_cost do PRÓPRIO `p` já vêm
        // multiplicados pela quantidade DELE (ver calculateModulePiece), por
        // isso não entra de novo aqui — só o fator dos pais.
        const hingeCost = (Number(p.hinge_cost) || 0) * fator;
        const slideCost = (Number(p.slide_cost) || 0) * fator;
        if (hingeCost > 0 || slideCost > 0) {
          const qtdEfetiva = (Number(p.quantity) || 1) * fator;
          const baseLabel = (prefixo ? prefixo + ' › ' : '') + (p.reference || '');
          // Entra no detalhe (linha própria na tabela "BY PART", coluna
          // HARDWARE) pro total "By module" (que soma rel.detalhe) fechar —
          // sem isto, a linha "Corrediças" apareceria certa mas o total do
          // módulo continuaria batendo errado. NÃO soma em rel.pecas: não é
          // uma peça física cortada, é hardware da peça-módulo. Rótulo ganha
          // "— Modelo NNNmm" (2026-08-19) quando o modelo é identificado.
          rel.detalhe.push({
            modulo: (slot.module && slot.module.name) || '',
            peca: hingeCost > 0
              ? labelComModelo(baseLabel, p.hinge_model_name, null)
              : labelComModelo(baseLabel, p.slide_model_name, p.slide_model_rail_length_mm),
            qtd: qtdEfetiva,
            m2: 0, fitaM: 0, chapa: 0, fita: 0, corte: 0, colagem: 0, furacao: 0, usinagem: 0, laborAntiga: 0,
            ferragem: hingeCost + slideCost,
            total: hingeCost + slideCost
          });
          if (hingeCost > 0) {
            rel.ferragem.dobradica.qtd += (Number(p.hinge_count) || 0) * qtdEfetiva;
            rel.ferragem.dobradica.custo += hingeCost;
            registraFerragemModelo(rel.ferragem.dobradicaPorModelo, p.hinge_model_id, p.hinge_model_name, null,
              (Number(p.hinge_count) || 0) * qtdEfetiva, hingeCost);
          }
          if (slideCost > 0) {
            rel.ferragem['corrediça'].qtd += qtdEfetiva;
            rel.ferragem['corrediça'].custo += slideCost;
            registraFerragemModelo(rel.ferragem.corredicaPorModelo, p.slide_model_id, p.slide_model_name,
              p.slide_model_rail_length_mm, qtdEfetiva, slideCost);
          }
        }
        // O nome dela vira prefixo pra a peça-folha lá dentro não aparecer
        // solta no detalhamento — "Gaveta › Fundo" diz de onde veio.
        anda(slot, p.child_breakdown, (prefixo ? prefixo + ' › ' : '') + (p.reference || ''), fator * (Number(p.quantity) || 1));
        return;
      }
      const qtd = Number(p.quantity) || 1;
      rel.pecas += qtd;

      // DETALHE POR PEÇA (2026-08-15, Matt: "coloca o valor de cada etapa, não
      // só somatório. Quero ver quantos pequenos processos ele está cobrando,
      // não precisa uma linha por furo, mas POR PEÇA o que ele tá cobrando").
      // É a linha que permite auditar: dá pra ver a peça que está pagando
      // furação sem levar furo, ou corte caro demais pro tamanho dela.
      const lb = p.labor_breakdown || {};
      const pecaBase = (prefixo ? prefixo + ' › ' : '') + (p.reference || '');
      // "— Modelo NNNmm" (2026-08-19) na peça-folha comum também — uma porta/
      // gaveta feita de componente de catálogo (não peça-módulo) pode ter
      // hinge_cost/slide_cost própria (calculateLeafPiece), mesmo motivo do
      // branch is_module acima.
      const pecaLabel = (Number(p.hinge_cost) || 0) > 0
        ? labelComModelo(pecaBase, p.hinge_model_name, null)
        : (Number(p.slide_cost) || 0) > 0
          ? labelComModelo(pecaBase, p.slide_model_name, p.slide_model_rail_length_mm)
          : pecaBase;
      rel.detalhe.push({
        modulo: (slot.module && slot.module.name) || '',
        peca: pecaLabel,
        qtd: qtd,
        m2: (Number(p.area_m2) || 0) * qtd,
        fitaM: (Number(p.edge_band_m) || 0) * qtd,
        chapa: Number(p.sheet_cost) || 0,
        fita: Number(p.edge_cost) || 0,
        corte: Number(lb.corte) || 0,
        colagem: Number(lb.fita) || 0,
        furacao: Number(lb.furacao) || 0,
        usinagem: Number(lb.usinagem) || 0,
        // Sem labor_breakdown a peça tem uma labor única e indivisível — ela
        // vai nesta coluna, e NUNCA distribuída pelos processos.
        laborAntiga: p.labor_breakdown ? 0 : (Number(p.labor_cost) || 0),
        ferragem: (Number(p.hinge_cost) || 0) + (Number(p.slide_cost) || 0),
        // purchased_cost (migration 119/129) faltava aqui — ver comentário
        // grande em rel.pecasCompradas acima. Já vem com support_cost somado
        // dentro (calculateLeafPiece), por isso soma só purchased_cost, não
        // os dois.
        comprado: Number(p.purchased_cost) || 0,
        total: (Number(p.sheet_cost) || 0) + (Number(p.edge_cost) || 0)
          + (Number(p.labor_cost) || 0) + (Number(p.hinge_cost) || 0) + (Number(p.slide_cost) || 0)
          + (Number(p.purchased_cost) || 0)
      });

      const cor = nomeCor(slot, p.color_role_id);
      const m = rel.material[cor] || (rel.material[cor] = { m2: 0, custo: 0 });
      m.m2 += (Number(p.area_m2) || 0) * qtd;
      m.custo += Number(p.sheet_cost) || 0;

      if ((Number(p.edge_band_m) || 0) > 0) {
        const f = rel.fita[cor] || (rel.fita[cor] = { m: 0, custo: 0 });
        f.m += (Number(p.edge_band_m) || 0) * qtd;
        f.custo += Number(p.edge_cost) || 0;
      }

      if (p.labor_breakdown) {
        rel.labor.corte += Number(p.labor_breakdown.corte) || 0;
        rel.labor.fita += Number(p.labor_breakdown.fita) || 0;
        rel.labor.furacao += Number(p.labor_breakdown.furacao) || 0;
        rel.labor.usinagem += Number(p.labor_breakdown.usinagem) || 0;
      } else {
        rel.labor.antiga += Number(p.labor_cost) || 0;
      }

      if ((Number(p.hinge_cost) || 0) > 0) {
        rel.ferragem.dobradica.qtd += (Number(p.hinge_count) || 0) * qtd;
        rel.ferragem.dobradica.custo += Number(p.hinge_cost) || 0;
        registraFerragemModelo(rel.ferragem.dobradicaPorModelo, p.hinge_model_id, p.hinge_model_name, null,
          (Number(p.hinge_count) || 0) * qtd, Number(p.hinge_cost) || 0);
      }
      if ((Number(p.slide_cost) || 0) > 0) {
        rel.ferragem['corrediça'].qtd += qtd;
        rel.ferragem['corrediça'].custo += Number(p.slide_cost) || 0;
        registraFerragemModelo(rel.ferragem.corredicaPorModelo, p.slide_model_id, p.slide_model_name,
          p.slide_model_rail_length_mm, qtd, Number(p.slide_cost) || 0);
      }
      // PEÇA COMPRADA (migration 119/129) — ver comentário grande em
      // rel.pecasCompradas. purchased_cost já inclui support_cost somado
      // (calculateLeafPiece), então a peça principal soma só o dela
      // (purchased_cost - support_cost, pra não contar o kit duas vezes) e o
      // kit soma separado, cada um na sua própria linha/nome.
      const custoComprado = (Number(p.purchased_cost) || 0) - (Number(p.support_cost) || 0);
      if (p.purchased_item_id && custoComprado > 0) {
        registraPecaComprada(p.purchased_item_id, p.purchased_item_name, p.purchased_item_unit,
          Number(p.purchased_item_qty) || 0, custoComprado);
      }
      if (p.support_purchased_item_id && (Number(p.support_cost) || 0) > 0) {
        registraPecaComprada(p.support_purchased_item_id, p.support_purchased_item_name, 'un',
          Number(p.support_purchased_item_qty) || 0, Number(p.support_cost) || 0);
      }
    });
  };

  (slots || []).forEach((slot) => {
    if (!slot.result) return;
    const antes = rel.detalhe.length;
    anda(slot, slot.result.breakdown, '');
    // Custo do módulo = soma das peças DELE (as que acabaram de entrar no
    // detalhe). Sai daí, e não de outro campo, pelo mesmo motivo do total
    // geral: se alguma peça deixar de ser contada, o número denuncia.
    let custo = rel.detalhe.slice(antes).reduce((s2, l) => s2 + l.total, 0);
    // FERRAGEM DE MONTAGEM deste módulo (cavilha/tambor/pino/suporte) — é
    // consumo do MÓDULO inteiro (o furo é da junta, não de UMA peça), então
    // não tem como entrar na travessia peça-a-peça (`anda`) acima. Guardado
    // em recomputeProjectSlotPricing (slot._hardwareConsumo).
    (slot._hardwareConsumo || []).forEach((l) => {
      if (!l || !l.item_id) return;
      const c = Number(l.cost) || 0;
      custo += c;
      const acc = rel.ferragemMontagem[l.item_id] || (rel.ferragemMontagem[l.item_id] = {
        code: l.code || null, name: l.name || '', unit: l.unit || 'un', qtd: 0, custo: 0
      });
      acc.qtd += Number(l.qty) || 0;
      acc.custo += c;
    });
    rel.porModulo.push({
      nome: (slot.module && slot.module.name) || '',
      dims: Math.round(slot.width_mm) + '×' + Math.round(slot.height_mm) + '×' + Math.round(slot.depth_mm),
      custo: custo,
      venda: Number(slot.result.total) || 0
    });
    rel.totalVenda += Number(slot.result.total) || 0;
  });

  // O custo total sai da SOMA das partes, não de outro campo: assim, se
  // alguma natureza deixar de ser contada, os percentuais denunciam na hora
  // em vez de fechar 100% escondendo o buraco.
  Object.keys(rel.material).forEach((k) => { rel.totalCusto += rel.material[k].custo; });
  Object.keys(rel.ferragemMontagem).forEach((k) => { rel.totalCusto += rel.ferragemMontagem[k].custo; });
  Object.keys(rel.pecasCompradas).forEach((k) => { rel.totalCusto += rel.pecasCompradas[k].custo; });
  Object.keys(rel.fita).forEach((k) => { rel.totalCusto += rel.fita[k].custo; });
  Object.keys(rel.labor).forEach((k) => { rel.totalCusto += rel.labor[k]; });
  rel.totalCusto += rel.ferragem.dobradica.custo + rel.ferragem['corrediça'].custo;
  return rel;
}
