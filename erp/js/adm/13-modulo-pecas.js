/* Painel admin — Peças do módulo, aninhamento e prevenção de ciclo
 *
 * Pedaço 14/21 do antigo js/admin.js, que virou módulo quando o
 * ERP passou a ser a única porta de entrada. O corte seguiu os próprios
 * marcadores de assunto do arquivo, então nada mudou de vizinho.
 * A ordem de carregamento em erp/index.html importa: é a mesma de antes. */

// ---------- PREVENÇÃO DE CICLO (módulo-como-componente) ----------
// Migration 023 NÃO impede ciclos no banco (módulo A contendo B contendo A
// de volta) — isso fica por conta da aplicação. Antes de deixar o admin
// escolher um módulo candidato como peça aninhada dentro do módulo atual,
// verificamos se esse candidato JÁ contém (direta ou indiretamente) o
// módulo atual — se contém, permitir a escolha fecharia um ciclo.
async function getModuleDescendantIds(moduleId, seen) {
  seen = seen || new Set();
  if (seen.has(moduleId)) return seen;
  seen.add(moduleId);
  const { data, error } = await supabaseClient
    .from('module_components')
    .select('child_module_id')
    .eq('module_id', moduleId)
    .not('child_module_id', 'is', null);
  if (error) return seen;
  for (const row of (data || [])) {
    if (row.child_module_id && !seen.has(row.child_module_id)) {
      await getModuleDescendantIds(row.child_module_id, seen);
    }
  }
  return seen;
}

let moduleComponentFieldRefs = []; // referências vivas aos controles renderizados — usadas pra ler o estado atual (ainda não salvo) na hora de testar/salvar
let moduleComponentRenderedModuleIds = new Set(); // ids de MÓDULOS já mostrados como peça aninhada (usados + adicionados nesta sessão) — paralelo a moduleComponentRenderedIds (componentes)
let moduleAddModuleSelectEl = null; // <select> vivo da seção "Adicionar módulo (peça aninhada)"
let moduleAddModuleSectionEl = null; // wrapper vivo dessa seção — novas linhas entram antes dele

// "📋 Copiar" / "📋 Colar aqui" (pedido do usuário 2026-07-31: a primeira
// versão — escolher módulo de origem + escolher peça em 2 selects — "ficou
// bem chata de fazer isso, quero copiar e colar mesmo, 2 cliques") —
// clipboard em memória (dura a sessão inteira do admin, sobrevive trocar de
// módulo): 📋 Copiar numa linha (renderModuleComponentRow/renderModuleNestedRow)
// grava aqui a configuração INTEIRA daquela linha (mesmo buildLinkDataFromRef
// já usado por "+ Duplicar" — funciona mesmo se a linha original ainda não
// foi salva); abrir OUTRO módulo e clicar "📋 Colar aqui" (renderPasteComponentSection)
// insere uma linha nova com essa configuração. null = nada copiado ainda.
let copiedModuleComponentLink = null; // { kind: 'component'|'module', catalogId, catalogLabel, sourceModuleName, link }
// Catálogo de PROGRAMAS DE FURAÇÃO (migration 105). Carregado uma vez e lido
// pelo <select> de cada linha de peça. Fica vazio (e o select mostra só
// "usar a furação do componente") enquanto ninguém cadastrar nenhum — que é
// o estado logo depois de rodar a migration.
let drillingPatternsCache = [];
async function loadDrillingPatterns() {
  try {
    const { data, error } = await supabaseClient
      .from('drilling_patterns')
      .select('id, name, furos_equivalentes, fura, active')
      .eq('active', true)
      .order('sort_order').order('name');
    // Erro aqui NÃO pode derrubar a tela do módulo: quem ainda não rodou a
    // migration 105 continua cadastrando módulo normalmente, só sem programas.
    drillingPatternsCache = error ? [] : (data || []);
  } catch (e) { drillingPatternsCache = []; }
  return drillingPatternsCache;
}
let modulePasteLabelEl = null; // <span> vivo que mostra "Copiado: X (de Y)" — atualizado por refreshPasteComponentButton
let modulePasteBtnEl = null; // botão "📋 Colar aqui" vivo — habilitado/desabilitado por refreshPasteComponentButton

// Reconta quais módulos estão em uso como peça aninhada (linhas atualmente
// renderizadas, salvas ou não) — chamado depois de um "🔁 Trocar módulo"
// (ver renderModuleNestedRow) pra manter moduleComponentRenderedModuleIds
// (e por consequência o select de "Adicionar módulo") consistente com o
// novo child_module_id da linha trocada, sem precisar recarregar a lista
// inteira do banco.
function recomputeRenderedModuleIds() {
  moduleComponentRenderedModuleIds = new Set(
    moduleComponentFieldRefs.filter((r) => r.kind === 'module').map((r) => r.childModuleId)
  );
}

async function renderModuleComponentsList() {
  const container = document.getElementById('module-components-list');
  if (!selectedModuleId) { container.innerHTML = ''; return; }

  // Programas de furação antes de montar as linhas — é deles que o <select>
  // de cada peça é preenchido (migration 105). Barato: uma consulta por
  // abertura da tela, e a função engole o erro sozinha se a migration ainda
  // não tiver rodado.
  await loadDrillingPatterns();

  const { data: links, error } = await supabaseClient
    .from('module_components')
    .select('id, component_id, child_module_id, quantity_override, sort_order, width_formula_override, height_formula_override, depth_formula_override, offset_x_mm, offset_y_mm, offset_z_mm, quantity_configurable, quantity_min, quantity_max, quantity_default, client_optional, client_optional_default_on, position_role, color_role_id, opening_type, slides_per_unit, tilt_angle_deg, rotation_y_deg, visibility_dimension, visibility_min_mm, visibility_max_mm, reference_override, drilling_pattern_id, grain_dir, client_dimension_configurable, width_min_mm, width_default_mm, width_max_mm, height_min_mm, height_default_mm, height_max_mm, depth_min_mm, depth_default_mm, depth_max_mm, auto_join_adjacent, join_max_length_mm, drill_shelf_support')
    .eq('module_id', selectedModuleId);
  if (error) { showError('pieces-error', error); return; }
  moduleComponentLinks = links || []; // estado como está gravado no banco agora (linha de base)
  const componentLinks = moduleComponentLinks.filter((l) => l.component_id);
  const moduleLinks = moduleComponentLinks.filter((l) => l.child_module_id);
  // REPETIÇÃO PERMITIDA (migration 025): o mesmo componente/módulo pode
  // aparecer em mais de uma linha (posições diferentes) — por isso agora
  // agrupa num Map de ARRAYS (uma entrada por instância), não mais um valor
  // único por component_id/child_module_id. Usado só pra filtrar as opções
  // já usadas nos selects "Adicionar componente"/"Adicionar módulo" — a
  // ORDEM de exibição na tela vem de allLinksSorted, logo abaixo.
  const linkedMap = new Map();
  componentLinks.forEach((l) => {
    if (!linkedMap.has(l.component_id)) linkedMap.set(l.component_id, []);
    linkedMap.get(l.component_id).push(l);
  });
  const linkedModuleMap = new Map();
  moduleLinks.forEach((l) => {
    if (!linkedModuleMap.has(l.child_module_id)) linkedModuleMap.set(l.child_module_id, []);
    linkedModuleMap.get(l.child_module_id).push(l);
  });
  moduleComponentRenderedIds = new Set(linkedMap.keys());
  moduleComponentRenderedModuleIds = new Set(linkedModuleMap.keys());

  setSaveStatus('', '');
  container.innerHTML = '';
  moduleComponentFieldRefs = [];

  const usedHeading = document.createElement('p');
  usedHeading.className = 'hint';
  usedHeading.style.marginTop = '0';
  usedHeading.textContent = moduleComponentLinks.length > 0
    ? 'Peças usadas neste módulo:'
    : 'Nenhuma peça usada ainda neste módulo — use "Adicionar componente" ou "Adicionar módulo" abaixo.';
  container.appendChild(usedHeading);

  // Uma linha por INSTÂNCIA (não por componente/módulo) — se o mesmo
  // componente tiver 2 linhas gravadas (2 posições diferentes), renderiza as
  // 2, cada uma com seu próprio rowId/offset/quantidade. TODAS as linhas
  // (componente + módulo aninhado) são ordenadas JUNTAS por sort_order — as
  // setas ▲▼ (moveModulePieceRow) reordenam livremente entre os dois tipos,
  // então a exibição tem que respeitar essa ordem única, não mais agrupar
  // por componente/catálogo como antes (o que ignorava qualquer reordenação
  // manual do admin).
  const allLinksSorted = [...moduleComponentLinks].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  allLinksSorted.forEach((link) => {
    if (link.component_id) {
      const c = componentsCache.find((x) => x.id === link.component_id);
      if (c) renderModuleComponentRow(c, link, container);
    } else if (link.child_module_id) {
      const m = modulesCache.find((x) => x.id === link.child_module_id);
      if (m) renderModuleNestedRow(m, link, container);
    }
  });

  renderAddComponentSection(container);
  await renderAddModuleSection(container);
  renderPasteComponentSection(container);

  computeModulePieces();
}

// "📋 Colar aqui" (pedido do usuário 2026-07-31, 2ª versão — a 1ª exigia
// escolher módulo de origem + escolher a peça em 2 selects, "ficou bem
// chata... quero copiar e colar mesmo, 2 cliques"): mostra o que está no
// clipboard em memória (copiedModuleComponentLink, preenchido pelo botão
// "📋 Copiar" de renderModuleComponentRow/renderModuleNestedRow) e um botão
// que insere essa configuração aqui — só 2 cliques no total (Copiar na
// linha de origem, Colar aqui). Sem nada copiado ainda, mostra só a dica e
// o botão fica desabilitado (nunca escondido — senão o admin não saberia
// que o recurso existe antes de usar o Copiar pela 1ª vez).
function renderPasteComponentSection(container) {
  const wrap = document.createElement('div');
  wrap.style.marginTop = '10px';
  wrap.style.borderTop = '1px solid #eee';
  wrap.style.paddingTop = '12px';
  wrap.style.display = 'flex';
  wrap.style.gap = '8px';
  wrap.style.alignItems = 'center';
  wrap.style.flexWrap = 'wrap';

  const label = document.createElement('span');
  label.className = 'hint';
  label.style.flex = '1';

  const pasteBtn = document.createElement('button');
  pasteBtn.type = 'button';
  pasteBtn.className = 'secondary';
  pasteBtn.textContent = '📋 Colar aqui';
  pasteBtn.style.flex = '0 0 auto';

  wrap.appendChild(label);
  wrap.appendChild(pasteBtn);
  container.appendChild(wrap);

  modulePasteLabelEl = label;
  modulePasteBtnEl = pasteBtn;
  refreshPasteComponentButton();

  pasteBtn.addEventListener('click', async () => {
    const copied = copiedModuleComponentLink;
    if (!copied) return;
    pasteBtn.disabled = true;
    try {
      if (copied.kind === 'component') {
        const c = componentsCache.find((x) => x.id === copied.catalogId);
        if (!c) { alert('O componente copiado não existe mais no catálogo — não dá pra colar.'); return; }
        renderModuleComponentRow(c, { ...copied.link, id: null }, container, wrap, true);
        moduleComponentRenderedIds.add(c.id);
        refreshAddComponentOptions();
      } else {
        const m = modulesCache.find((x) => x.id === copied.catalogId);
        if (!m) { alert('O módulo copiado não existe mais — não dá pra colar.'); return; }
        // Mesma trava de ciclo do "Adicionar módulo" (refreshAddModuleOptions)
        // — colar uma peça-módulo que (direta ou indiretamente) contém ESTE
        // módulo criaria uma recursão infinita no desenho 3D/cálculo de preço.
        const descendants = await getModuleDescendantIds(m.id);
        if (descendants.has(selectedModuleId)) {
          alert('Não é possível colar esta peça aqui: ela faria este módulo entrar dentro dele mesmo (ciclo).');
          return;
        }
        renderModuleNestedRow(m, { ...copied.link, id: null }, container, wrap, true);
        moduleComponentRenderedModuleIds.add(m.id);
        await refreshAddModuleOptions();
      }
      setSaveStatus('Alterações não salvas.', 'unsaved');
      computeModulePieces();
    } finally {
      pasteBtn.disabled = false;
    }
  });
}

// Atualiza o texto/estado do botão "📋 Colar aqui" — chamado tanto ao
// renderizar a seção (renderPasteComponentSection) quanto na hora do "📋
// Copiar" de uma linha (pra refletir na hora, caso copiar e colar aconteçam
// dentro do MESMO módulo aberto, sem trocar de tela no meio).
function refreshPasteComponentButton() {
  if (!modulePasteLabelEl || !modulePasteBtnEl) return;
  if (!copiedModuleComponentLink) {
    modulePasteLabelEl.textContent = 'Nada copiado ainda — clique em "📋 Copiar" numa peça (deste ou de outro módulo) pra poder colar aqui.';
    modulePasteBtnEl.disabled = true;
    return;
  }
  const kindLabel = copiedModuleComponentLink.kind === 'module' ? ' (módulo aninhado)' : '';
  modulePasteLabelEl.textContent = `Copiado: ${copiedModuleComponentLink.catalogLabel}${kindLabel} — de "${copiedModuleComponentLink.sourceModuleName}".`;
  modulePasteBtnEl.disabled = false;
}

// Seção "Adicionar componente" — uma lista suspensa só com os componentes do
// catálogo que este módulo AINDA NÃO usa, mais um botão que transforma a
// escolha numa linha configurável normal (igual as de cima). Nada é gravado
// no banco aqui — só quando o admin clicar em "Salvar componentes deste
// módulo", igual a qualquer outra alteração nesta tela.
function renderAddComponentSection(container) {
  const wrap = document.createElement('div');
  wrap.style.marginTop = '20px';
  wrap.style.borderTop = '1px solid #eee';
  wrap.style.paddingTop = '12px';
  wrap.style.display = 'flex';
  wrap.style.gap = '8px';
  wrap.style.alignItems = 'center';

  const select = document.createElement('select');
  select.style.marginTop = '0';
  select.style.flex = '1';

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'secondary';
  addBtn.textContent = '+ Adicionar componente';
  addBtn.style.flex = '0 0 auto';

  wrap.appendChild(select);
  wrap.appendChild(addBtn);
  container.appendChild(wrap);

  moduleAddComponentSelectEl = select;
  moduleAddComponentSectionEl = wrap;
  refreshAddComponentOptions();

  addBtn.addEventListener('click', () => {
    const componentId = select.value;
    if (!componentId) return;
    const c = componentsCache.find((x) => x.id === componentId);
    if (!c) return;
    renderModuleComponentRow(c, null, container, wrap, true);
    moduleComponentRenderedIds.add(componentId);
    refreshAddComponentOptions();
    setSaveStatus('Alterações não salvas.', 'unsaved');
    computeModulePieces();
  });
}

// Reconta quais componentes de catálogo estão em uso nesta lista (linhas
// atualmente renderizadas, salvas ou não) — chamado depois de um "🔁 Trocar"
// (ver renderModuleComponentRow) pra manter moduleComponentRenderedIds (e por
// consequência o select de "Adicionar componente") consistente com o novo
// component_id da linha trocada, sem precisar recarregar a lista inteira do
// banco. Paralelo a recomputeRenderedModuleIds (mesma ideia, pra módulos).
function recomputeRenderedComponentIds() {
  moduleComponentRenderedIds = new Set(
    moduleComponentFieldRefs.filter((r) => r.kind === 'component').map((r) => r.componentId)
  );
}

// Atualiza as opções do select de "Adicionar componente" pra sempre refletir
// só o que ainda não está na lista de cima (usado ou recém-adicionado nesta
// sessão, antes mesmo de salvar).
function refreshAddComponentOptions() {
  if (!moduleAddComponentSelectEl) return;
  const available = componentsCache.filter((c) => !moduleComponentRenderedIds.has(c.id));
  moduleAddComponentSelectEl.innerHTML = available.length > 0
    ? available.map((c) => `<option value="${c.id}">${c.reference}</option>`).join('')
    : '<option value="">Todo o catálogo já foi adicionado</option>';
}

// Seção "Adicionar módulo (peça aninhada)" — MÓDULO-COMO-COMPONENTE (migration
// 023): igual "Adicionar componente", mas a lista é de MÓDULOS em vez de
// componentes do catálogo — ex: um "modelo de porta Shaker" cadastrado como
// módulo comum (normalmente marcado "Invisível"), usado aqui como peça deste
// módulo. Exclui: o próprio módulo selecionado (não pode se conter), módulos
// já usados como peça aqui, e qualquer módulo que já contenha (direta ou
// indiretamente) o módulo atual — nestá-lo aqui fecharia um CICLO (ver
// getModuleDescendantIds e o comentário na migration 023 sobre essa
// prevenção ser responsabilidade da aplicação, não do banco).
async function renderAddModuleSection(container) {
  const wrap = document.createElement('div');
  wrap.style.marginTop = '10px';
  wrap.style.display = 'flex';
  wrap.style.gap = '8px';
  wrap.style.alignItems = 'center';

  const select = document.createElement('select');
  select.style.marginTop = '0';
  select.style.flex = '1';

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'secondary';
  addBtn.textContent = '+ Adicionar módulo (peça aninhada)';
  addBtn.style.flex = '0 0 auto';

  wrap.appendChild(select);
  wrap.appendChild(addBtn);
  container.appendChild(wrap);

  moduleAddModuleSelectEl = select;
  moduleAddModuleSectionEl = wrap;
  await refreshAddModuleOptions();

  addBtn.addEventListener('click', () => {
    const childId = select.value;
    if (!childId) return;
    const m = modulesCache.find((x) => x.id === childId);
    if (!m) return;
    renderModuleNestedRow(m, null, container, wrap, true);
    moduleComponentRenderedModuleIds.add(childId);
    refreshAddModuleOptions();
    setSaveStatus('Alterações não salvas.', 'unsaved');
    computeModulePieces();
  });
}

// Recalcula as opções do select de "Adicionar módulo" — assíncrono porque
// precisa checar, pra cada candidato, se nesta-lo criaria um ciclo.
async function refreshAddModuleOptions() {
  if (!moduleAddModuleSelectEl) return;
  const candidates = modulesCache.filter((m) =>
    m.id !== selectedModuleId && !moduleComponentRenderedModuleIds.has(m.id)
  );
  const allowed = [];
  for (const cand of candidates) {
    const descendants = await getModuleDescendantIds(cand.id);
    if (!descendants.has(selectedModuleId)) allowed.push(cand);
  }
  moduleAddModuleSelectEl.innerHTML = allowed.length > 0
    ? allowed.map((m) => `<option value="${m.id}">${m.name}${m.is_invisible ? ' (invisível)' : ''}</option>`).join('')
    : '<option value="">Nenhum módulo disponível (todos já usados ou formariam ciclo)</option>';
}

// Muda pra aba "Componentes" (biblioteca global) e já abre o componente em
// modo edição lá — atalho pra quando o admin quer mexer na definição do
// componente (fórmulas base, tipo, mão de obra...) sem precisar procurar
// manualmente na tabela.
function goToComponentInCatalog(id) {
  ADM.irPara('tab-components');
  window.editComponent(id);
}

// Reordena as peças (setas ▲▼ de renderModuleComponentRow/
// renderModuleNestedRow) — pura manipulação de DOM, NADA é salvo no banco
// aqui: mesmo espírito de todo o resto desta tela (só grava quando o admin
// clica em "Salvar componentes deste módulo"). collectPendingLinks lê a
// ordem final direto do DOM (via wrap.dataset.rowId) na hora de montar
// sort_order, então mover aqui já é suficiente — não precisa reordenar
// nenhum array em memória junto.
// Só troca de posição com a vizinha de cima/baixo que TAMBÉM for uma linha
// de peça de verdade (classe 'module-piece-row') — nunca ultrapassa pro
// título da lista nem pras seções "Adicionar componente"/"Adicionar módulo"
// no fim do container.
function moveModulePieceRow(wrap, dir) {
  const sibling = dir === -1 ? wrap.previousElementSibling : wrap.nextElementSibling;
  if (!sibling || !sibling.classList.contains('module-piece-row')) return;
  if (dir === -1) {
    wrap.parentNode.insertBefore(wrap, sibling);
  } else {
    wrap.parentNode.insertBefore(sibling, wrap);
  }
  setSaveStatus('Alterações não salvas.', 'unsaved');
  computeModulePieces();
}

// Renderiza UM componente na lista de "Componentes deste módulo" — um
// cabeçalho sempre visível (caixinha + nome + qtd. override) e um painel de
// detalhes (fórmulas, deslocamento, opcionais...) que nasce SEMPRE recolhido
// (nunca abre sozinho, nem em componente já configurado nem em componente
// recém-adicionado) — o admin abre só quando realmente precisa mexer, pra
// não empilhar dezenas de blocos abertos ao mesmo tempo na tela. Um botão
// "Ver componente" leva direto pro cadastro dele na aba Componentes.
//   insertBeforeEl — se passado, a linha entra ANTES desse elemento em vez de
//     no fim do container (usado pra manter a seção "Adicionar componente"
//     sempre por último).
//   forceChecked — true quando a linha nasce de "Adicionar componente"
//     (ainda sem existingLink, mas já deve nascer marcada como usada).
//   suggestedName — nome sugerido (não obrigatório) já pré-preenchido no
//     campo de nome customizado; só vem do botão "+ Duplicar" (ex: "RIPA
//     RIPADO 2"), pra diferenciar instâncias repetidas do mesmo componente
//     sem o admin precisar digitar do zero — ele ainda pode apagar/editar.
function renderModuleComponentRow(c, existingLink, container, insertBeforeEl, forceChecked, suggestedName) {
  // rowId identifica esta INSTÂNCIA (esta linha de module_components), não o
  // componente — desde a migration 025 o mesmo componente pode ter várias
  // linhas (posições diferentes) no mesmo módulo, então a identidade pra
  // salvar/apagar tem que ser por linha, não por componente. Linha existente
  // reusa o id do banco; linha nova (Adicionar/Duplicar) ganha um uuid
  // gerado aqui mesmo, já pronto pro upsert (onConflict: 'id').
  const rowId = (existingLink && existingLink.id) || crypto.randomUUID();

  const wrap = document.createElement('div');
  wrap.style.marginTop = '10px';
  // Marcador usado pelas setas ▲▼ (moveModulePieceRow) e por collectPendingLinks
  // (sort_order) pra achar/reconhecer linhas de peça de verdade dentro do
  // container — distingue de outros elementos que também vivem lá (título,
  // seções "Adicionar componente"/"Adicionar módulo" no fim).
  wrap.className = 'module-piece-row';
  wrap.dataset.rowId = rowId;

  const header = document.createElement('div');
  header.className = 'row';
  header.style.alignItems = 'center';
  header.style.padding = '8px 10px';
  header.style.background = '#f7f5f2';
  header.style.border = '1px solid #e8e4de';
  header.style.borderRadius = '6px';

  const labelDiv = document.createElement('div');
  labelDiv.style.flex = '2';
  const label = document.createElement('label');
  label.style.display = 'flex';
  label.style.alignItems = 'center';
  label.style.gap = '6px';
  label.style.marginTop = '0';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.style.width = 'auto';
  checkbox.checked = forceChecked ? true : !!existingLink;
  label.appendChild(checkbox);
  const nameSpan = document.createElement('span');
  nameSpan.textContent = `${(existingLink && existingLink.reference_override) || suggestedName || c.reference} (padrão: ${c.quantity})`;
  label.appendChild(nameSpan);
  labelDiv.appendChild(label);

  // Quantidade override — o CAMPO em si nasce lá embaixo, no painel de
  // detalhes (ver qtyWrap), fora do cabeçalho sempre visível: raramente
  // usada, e ocupava espaço horizontal que faz falta pro nome do componente
  // quando o módulo tem muitas peças (pedido do usuário — cabeçalho mais
  // estreito, mais peças visíveis por vez sem precisar rolar tanto).
  const qtyInput = document.createElement('input');
  qtyInput.type = 'number';
  qtyInput.min = '0';
  qtyInput.placeholder = 'qtd padrão';
  qtyInput.style.marginTop = '0';
  qtyInput.disabled = !checkbox.checked;
  if (existingLink && existingLink.quantity_override !== undefined && existingLink.quantity_override !== null) {
    qtyInput.value = existingLink.quantity_override;
  }

  // Setas ▲▼ pra reordenar — puro DOM (ver moveModulePieceRow); a ordem só
  // vira sort_order de verdade quando o admin clicar em "Salvar componentes
  // deste módulo" (collectPendingLinks lê a ordem final direto do DOM).
  const moveUpBtn = document.createElement('button');
  moveUpBtn.type = 'button';
  moveUpBtn.className = 'secondary mc-row-btn mc-row-btn-arrow';
  moveUpBtn.style.flex = '0 0 auto';
  moveUpBtn.title = 'Mover pra cima';
  moveUpBtn.textContent = '▲';
  moveUpBtn.addEventListener('click', () => moveModulePieceRow(wrap, -1));

  const moveDownBtn = document.createElement('button');
  moveDownBtn.type = 'button';
  moveDownBtn.className = 'secondary mc-row-btn mc-row-btn-arrow';
  moveDownBtn.style.flex = '0 0 auto';
  moveDownBtn.title = 'Mover pra baixo';
  moveDownBtn.textContent = '▼';
  moveDownBtn.addEventListener('click', () => moveModulePieceRow(wrap, 1));

  // Botão que leva direto pro cadastro deste componente na aba Componentes
  // (biblioteca global) — sempre visível, independe de estar marcado ou não.
  const gotoBtn = document.createElement('button');
  gotoBtn.type = 'button';
  gotoBtn.className = 'secondary mc-row-btn';
  gotoBtn.style.flex = '0 0 auto';
  gotoBtn.textContent = 'Ver componente';
  gotoBtn.addEventListener('click', () => goToComponentInCatalog(c.id));

  // "Duplicar" — cria OUTRA instância deste MESMO componente neste módulo,
  // em posição diferente (migration 025: repetir o mesmo componente
  // várias vezes deixou de ser bloqueado). Pedido do usuário (2026-07-26:
  // "quando duplicar um componente quero que leve todas as configuracoes
  // originais pro novo componente duplicado") — a duplicata agora HERDA
  // tudo o que já estava configurado nesta linha (fórmulas, deslocamento,
  // visibilidade condicional, quantidade configurável, opcional, cor
  // configurável...), lido do estado ATUAL dos campos (buildLinkDataFromRef
  // — funciona mesmo se a linha original ainda não foi salva). Só id e
  // nome customizado NÃO são herdados: id vira um novo (senão colidiria com
  // a linha original ao salvar) e o nome cai pro numerado de sempre (senão
  // as duas instâncias apareceriam com o mesmo nome customizado).
  const dupBtn = document.createElement('button');
  dupBtn.type = 'button';
  dupBtn.className = 'secondary mc-row-btn';
  dupBtn.style.flex = '0 0 auto';
  dupBtn.title = 'Adicionar outra instância deste componente, com a mesma configuração, em outra posição';
  dupBtn.textContent = '+ Duplicar';
  dupBtn.addEventListener('click', () => {
    // Sugere um nome numerado (ex: "RIPA RIPADO 2", "RIPA RIPADO 3"...)
    // contando quantas linhas já existem pra este MESMO componente entre as
    // renderizadas agora (salvas ou ainda não salvas) — 1-indexado a partir
    // da PRÓXIMA instância, já que a original (linha 1) continua sem número.
    const existingCount = moduleComponentFieldRefs.filter((ref) => ref.kind === 'component' && ref.componentId === c.id).length;
    const suggestedName = `${c.reference} ${existingCount + 1}`;
    const thisRef = moduleComponentFieldRefs.find((ref) => ref.rowId === rowId);
    const clonedLink = thisRef ? { ...buildLinkDataFromRef(thisRef, 0), id: null, reference_override: null } : null;
    renderModuleComponentRow(c, clonedLink, container, wrap.nextSibling, true, suggestedName);
    setSaveStatus('Alterações não salvas.', 'unsaved');
    computeModulePieces();
  });

  // "📋 Copiar" — pra colar em OUTRO módulo (pedido do usuário 2026-07-31,
  // "quero copiar um componente de um modulo e colar ele com as mesmas
  // configuracoes em outro modulo... quero copiar e colar mesmo, 2
  // cliques"): grava a configuração INTEIRA desta linha (mesmo
  // buildLinkDataFromRef do "+ Duplicar" acima — funciona mesmo se a linha
  // ainda não foi salva) no clipboard em memória (copiedModuleComponentLink,
  // sobrevive trocar de módulo). O botão "📋 Colar aqui" (fim da lista,
  // renderPasteComponentSection) faz a outra metade.
  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'secondary mc-row-btn';
  copyBtn.style.flex = '0 0 auto';
  copyBtn.title = 'Copiar esta peça (com toda a configuração) pra colar em outro módulo';
  copyBtn.textContent = '📋 Copiar';
  copyBtn.addEventListener('click', () => {
    const thisRef = moduleComponentFieldRefs.find((ref) => ref.rowId === rowId);
    if (!thisRef) return;
    const sourceModule = modulesCache.find((x) => x.id === selectedModuleId);
    copiedModuleComponentLink = {
      kind: 'component',
      catalogId: c.id,
      catalogLabel: c.reference,
      sourceModuleName: (sourceModule && sourceModule.name) || '?',
      link: buildLinkDataFromRef(thisRef, 0)
    };
    refreshPasteComponentButton();
  });

  // "🔁 Trocar" — troca QUAL componente de catálogo esta linha referencia,
  // mantendo tudo o mais já configurado NESTA linha (fórmulas override de
  // L/A/P, posição/deslocamento, visibilidade condicional, quantidade
  // override, opcional...) — mesmo espírito do "🔁 Trocar módulo" já
  // existente pra peça-módulo aninhada (ver renderModuleNestedRow), só que
  // pra componente de catálogo em vez de módulo.
  const swapBtn = document.createElement('button');
  swapBtn.type = 'button';
  swapBtn.className = 'secondary mc-row-btn';
  swapBtn.style.flex = '0 0 auto';
  swapBtn.title = 'Trocar o componente de catálogo usado nesta linha, mantendo fórmulas/posição/quantidade já configurados aqui';
  swapBtn.textContent = '🔁 Trocar';

  const swapWrap = document.createElement('div');
  swapWrap.className = 'row';
  swapWrap.style.padding = '8px 10px';
  swapWrap.style.background = '#fff';
  swapWrap.style.border = '1px solid #e8e4de';
  swapWrap.style.borderTop = 'none';
  swapWrap.style.gap = '8px';
  swapWrap.style.alignItems = 'center';
  swapWrap.style.display = 'none';

  const swapSelect = document.createElement('select');
  swapSelect.style.marginTop = '0';
  swapSelect.style.flex = '1';

  const swapConfirmBtn = document.createElement('button');
  swapConfirmBtn.type = 'button';
  swapConfirmBtn.className = 'secondary';
  swapConfirmBtn.style.flex = '0 0 auto';
  swapConfirmBtn.textContent = 'Confirmar troca';

  const swapCancelBtn = document.createElement('button');
  swapCancelBtn.type = 'button';
  swapCancelBtn.className = 'secondary';
  swapCancelBtn.style.flex = '0 0 auto';
  swapCancelBtn.textContent = 'Cancelar';

  swapWrap.appendChild(swapSelect);
  swapWrap.appendChild(swapConfirmBtn);
  swapWrap.appendChild(swapCancelBtn);

  swapBtn.addEventListener('click', () => {
    if (swapWrap.style.display !== 'none') { swapWrap.style.display = 'none'; return; }
    // Lista o catálogo INTEIRO, sem excluir componentes já usados em outras
    // linhas — mesma decisão do swap de módulo aninhado: migration 025
    // permite repetir o mesmo componente em 2+ linhas, então já usado em
    // outro lugar não é motivo pra tirar da lista aqui.
    swapWrap.style.display = 'flex';
    swapSelect.innerHTML = componentsCache.length > 0
      ? componentsCache.map((cc) => `<option value="${cc.id}" ${cc.id === c.id ? 'selected' : ''}>${cc.reference}</option>`).join('')
      : '<option value="">Nenhum componente disponível</option>';
  });

  swapCancelBtn.addEventListener('click', () => { swapWrap.style.display = 'none'; });

  swapConfirmBtn.addEventListener('click', () => {
    const newId = swapSelect.value;
    if (!newId || newId === c.id) { swapWrap.style.display = 'none'; return; }
    const newComponent = componentsCache.find((x) => x.id === newId);
    if (!newComponent) return;
    c = newComponent; // reatribui o parâmetro — gotoBtn/dupBtn e os placeholders abaixo fecham sobre esta variável, então já passam a enxergar o componente novo
    nameSpan.textContent = `${nameOverrideInput.value.trim() || c.reference} (padrão: ${c.quantity})`;
    nameOverrideInput.placeholder = c.reference;
    qtyLbl.textContent = `Quantidade override (padrão do catálogo: ${c.quantity})`;
    // Placeholders/labels de fórmula override — mostram o padrão do
    // componente NOVO (o valor digitado no override, se houver, continua
    // intocado; só o "padrão: ..." de referência muda).
    widthField.div.querySelector('label').textContent = `Fórmula largura override (padrão: ${c.width_formula})`;
    widthField.input.placeholder = c.width_formula;
    heightField.div.querySelector('label').textContent = `Fórmula altura override (padrão: ${c.height_formula})`;
    heightField.input.placeholder = c.height_formula;
    depthField.div.querySelector('label').textContent = `Fórmula profundidade override (padrão: ${c.depth_formula})`;
    depthField.input.placeholder = c.depth_formula;
    const ref = moduleComponentFieldRefs.find((r) => r.rowId === rowId);
    if (ref) ref.componentId = c.id;
    recomputeRenderedComponentIds();
    refreshAddComponentOptions();
    swapWrap.style.display = 'none';
    setSaveStatus('Alterações não salvas.', 'unsaved');
    computeModulePieces();
  });

  // Botão de recolher/expandir o painel de detalhes — só faz sentido (e só
  // aparece) quando o componente está marcado como usado. Nasce sempre
  // fechado ("▸ Configurar"), mesmo pra um componente já configurado antes.
  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'secondary mc-row-btn';
  toggleBtn.style.flex = '0 0 auto';
  toggleBtn.style.display = checkbox.checked ? 'inline-block' : 'none';
  toggleBtn.textContent = '▸ Configurar';

  header.appendChild(labelDiv);
  header.appendChild(moveUpBtn);
  header.appendChild(moveDownBtn);
  header.appendChild(gotoBtn);
  header.appendChild(dupBtn);
  header.appendChild(copyBtn);
  header.appendChild(swapBtn);
  header.appendChild(toggleBtn);
  wrap.appendChild(header);
  wrap.appendChild(swapWrap);

  // Painel de detalhes — sempre nasce recolhido (o admin abre só quando
  // precisa mexer), mesmo quando o componente já está marcado como usado.
  const detailsDiv = document.createElement('div');
  detailsDiv.style.padding = '10px 10px 4px 10px';
  detailsDiv.style.border = '1px solid #e8e4de';
  detailsDiv.style.borderTop = 'none';
  detailsDiv.style.borderRadius = '0 0 6px 6px';
  detailsDiv.style.display = 'none';
  wrap.appendChild(detailsDiv);

  // Nome customizado desta instância (migration 032) — útil quando o mesmo
  // componente aparece 2+ vezes neste módulo (migration 025) e o admin
  // precisa diferenciar ("Ripa 1", "Ripa 2"...) na tela, no teste de cálculo
  // e no balão de duplo-clique do 3D. Vazio = usa o nome do catálogo, como
  // sempre — não afeta preço nem o cadastro global do componente.
  const nameOverrideWrap = document.createElement('div');
  nameOverrideWrap.style.marginTop = '0';
  const nameOverrideLbl = document.createElement('label');
  nameOverrideLbl.style.fontSize = '12px';
  nameOverrideLbl.style.marginTop = '0';
  nameOverrideLbl.textContent = 'Nome customizado desta instância (opcional — ex: "Ripa 1", "Ripa 2")';
  const nameOverrideInput = document.createElement('input');
  nameOverrideInput.type = 'text';
  nameOverrideInput.placeholder = c.reference;
  nameOverrideInput.style.marginTop = '2px';
  nameOverrideInput.disabled = !checkbox.checked;
  if (existingLink && existingLink.reference_override) nameOverrideInput.value = existingLink.reference_override;
  else if (suggestedName) nameOverrideInput.value = suggestedName;
  nameOverrideWrap.appendChild(nameOverrideLbl);
  nameOverrideWrap.appendChild(nameOverrideInput);
  detailsDiv.appendChild(nameOverrideWrap);

  nameOverrideInput.addEventListener('input', () => {
    nameSpan.textContent = `${nameOverrideInput.value.trim() || c.reference} (padrão: ${c.quantity})`;
    setSaveStatus('Alterações não salvas.', 'unsaved');
    computeModulePieces();
  });

  // Quantidade override (ver qtyDiv/qtyInput criados lá em cima, junto do
  // cabeçalho — só o CAMPO nasceu aqui embaixo, no painel de detalhes, pra
  // não ocupar espaço no cabeçalho sempre visível).
  const qtyWrap = document.createElement('div');
  qtyWrap.style.marginTop = '10px';
  const qtyLbl = document.createElement('label');
  qtyLbl.style.fontSize = '12px';
  qtyLbl.style.marginTop = '0';
  qtyLbl.textContent = `Quantidade override (padrão do catálogo: ${c.quantity})`;
  qtyWrap.appendChild(qtyLbl);
  qtyWrap.appendChild(qtyInput);
  detailsDiv.appendChild(qtyWrap);

  // Fórmulas de L/A/P sobrescritas só pra este módulo — a mesma peça de
  // catálogo pode precisar de fórmula diferente dependendo do módulo pai
  // (ex: espessura de lateral diferente). Vazio = usa a fórmula padrão do
  // componente (mostrada no placeholder/label).
  const formulaRow = document.createElement('div');
  formulaRow.className = 'row';
  formulaRow.style.marginTop = '4px';

  function makeFormulaField(labelText, defaultFormula, existingValue) {
    const div = document.createElement('div');
    div.style.flex = '1';
    const lbl = document.createElement('label');
    lbl.style.fontSize = '12px';
    lbl.style.marginTop = '0';
    lbl.textContent = `${labelText} (padrão: ${defaultFormula})`;
    const input = document.createElement('input');
    input.placeholder = defaultFormula;
    input.style.marginTop = '2px';
    input.disabled = !checkbox.checked;
    if (existingValue !== undefined && existingValue !== null && existingValue !== '') input.value = existingValue;
    div.appendChild(lbl);
    div.appendChild(input);
    return { div, input };
  }

  const widthField = makeFormulaField('Fórmula largura override', c.width_formula, existingLink && existingLink.width_formula_override);
  const heightField = makeFormulaField('Fórmula altura override', c.height_formula, existingLink && existingLink.height_formula_override);
  const depthField = makeFormulaField('Fórmula profundidade override', c.depth_formula, existingLink && existingLink.depth_formula_override);
  formulaRow.appendChild(widthField.div);
  formulaRow.appendChild(heightField.div);
  formulaRow.appendChild(depthField.div);
  detailsDiv.appendChild(formulaRow);

  // Posição/deslocamento — FÓRMULA (aceita W, H, D do módulo, igual as
  // fórmulas de L/A/P) só pro DESENHO 3D. Não afeta preço.
  // ZERO ABSOLUTO (a pedido do usuário) pras 7 posições ÚNICAS — lateral
  // esquerda/direita, topo, base, fundo, rodapé, tampo: esses 3 campos são a
  // posição FINAL e ABSOLUTA do canto chão-fundo-esquerda da peça, a partir
  // do canto chão-fundo-esquerda do módulo — sem nenhuma âncora automática
  // por trás. Ex: pra encostar uma peça "Lateral direita" na direita,
  // escreve "W-19" (W = largura do módulo, 19 = espessura da peça) no
  // Deslocar X; deixado em branco/0, a peça nasce encostada na ESQUERDA
  // (mesmo canto de qualquer peça única). Nas demais posições (prateleira,
  // porta, pé, gaveta, travamento) — que já têm distribuição automática
  // (várias prateleiras espaçadas, portas empilhadas, 4 pés nas quinas...) —
  // esses campos continuam sendo só um AJUSTE FINO em cima dessa
  // distribuição, como sempre foram.
  const offsetRow = document.createElement('div');
  offsetRow.className = 'row';
  offsetRow.style.marginTop = '4px';

  function makeOffsetField(labelText, existingValue) {
    const div = document.createElement('div');
    div.style.flex = '1';
    const lbl = document.createElement('label');
    lbl.style.fontSize = '12px';
    lbl.style.marginTop = '0';
    lbl.textContent = labelText;
    const input = document.createElement('input');
    input.placeholder = '0';
    input.style.marginTop = '2px';
    input.disabled = !checkbox.checked;
    if (existingValue !== undefined && existingValue !== null && String(existingValue).trim() !== '' && String(existingValue).trim() !== '0') {
      input.value = existingValue;
    }
    div.appendChild(lbl);
    div.appendChild(input);
    return { div, input };
  }

  const offsetXField = makeOffsetField('Posição X (fórmula W,H,D,w,h,d — minúsculo = medida da própria peça) — peça única: absoluta a partir da esquerda; senão: ajuste fino', existingLink && existingLink.offset_x_mm);
  const offsetYField = makeOffsetField('Posição Y (fórmula W,H,D,w,h,d — minúsculo = medida da própria peça; RODAPE = altura do rodapé da casa do cliente, ex: "RODAPE" começa em cima do baseboard) — peça única: absoluta a partir do chão; senão: ajuste fino', existingLink && existingLink.offset_y_mm);
  const offsetZField = makeOffsetField('Posição Z (fórmula W,H,D,w,h,d — minúsculo = medida da própria peça, ex "D-d" encosta na frente) — peça única: absoluta a partir do fundo; senão: ajuste fino', existingLink && existingLink.offset_z_mm);
  offsetRow.appendChild(offsetXField.div);
  offsetRow.appendChild(offsetYField.div);
  offsetRow.appendChild(offsetZField.div);
  detailsDiv.appendChild(offsetRow);

  // Visibilidade condicional (migration 031) — esta peça só existe quando a
  // dimensão ESCOLHIDA do MÓDULO (W/H/D, container — não a medida própria já
  // resolvida da peça) estiver dentro do intervalo mín/máx. Sem dimensão
  // escolhida, sempre visível (comportamento padrão, igual antes desta
  // feature existir). Min e/ou máx em branco = sem limite naquele lado (ex:
  // só "Largura >= 1000" = preenche só o mínimo).
  const visibilityWrap = document.createElement('div');
  visibilityWrap.style.marginTop = '10px';
  const visibilityLbl = document.createElement('label');
  visibilityLbl.style.fontSize = '12px';
  visibilityLbl.style.marginTop = '0';
  visibilityLbl.textContent = 'Condição de visibilidade (opcional)';
  visibilityWrap.appendChild(visibilityLbl);

  const visibilityRow = document.createElement('div');
  visibilityRow.className = 'row';
  visibilityRow.style.marginTop = '2px';

  const visibilityDimDiv = document.createElement('div');
  visibilityDimDiv.style.flex = '1';
  const visibilityDimSelect = document.createElement('select');
  visibilityDimSelect.style.marginTop = '0';
  visibilityDimSelect.disabled = !checkbox.checked;
  visibilityDimSelect.innerHTML = `
    <option value="">Sempre visível (sem condição)</option>
    <option value="W">Largura do módulo (W)</option>
    <option value="H">Altura do módulo (H)</option>
    <option value="D">Profundidade do módulo (D)</option>
  `;
  visibilityDimSelect.value = (existingLink && existingLink.visibility_dimension) || '';
  visibilityDimDiv.appendChild(visibilityDimSelect);

  const visibilityMinDiv = document.createElement('div');
  visibilityMinDiv.style.flex = '1';
  const visibilityMinInput = document.createElement('input');
  visibilityMinInput.type = 'number';
  visibilityMinInput.placeholder = 'Mínimo (mm)';
  visibilityMinInput.style.marginTop = '0';
  visibilityMinInput.disabled = !checkbox.checked || !visibilityDimSelect.value;
  if (existingLink && existingLink.visibility_min_mm !== undefined && existingLink.visibility_min_mm !== null) {
    visibilityMinInput.value = existingLink.visibility_min_mm;
  }
  visibilityMinDiv.appendChild(visibilityMinInput);

  const visibilityMaxDiv = document.createElement('div');
  visibilityMaxDiv.style.flex = '1';
  const visibilityMaxInput = document.createElement('input');
  visibilityMaxInput.type = 'number';
  visibilityMaxInput.placeholder = 'Máximo (mm)';
  visibilityMaxInput.style.marginTop = '0';
  visibilityMaxInput.disabled = !checkbox.checked || !visibilityDimSelect.value;
  if (existingLink && existingLink.visibility_max_mm !== undefined && existingLink.visibility_max_mm !== null) {
    visibilityMaxInput.value = existingLink.visibility_max_mm;
  }
  visibilityMaxDiv.appendChild(visibilityMaxInput);

  visibilityRow.appendChild(visibilityDimDiv);
  visibilityRow.appendChild(visibilityMinDiv);
  visibilityRow.appendChild(visibilityMaxDiv);
  visibilityWrap.appendChild(visibilityRow);

  const visibilityHint = document.createElement('p');
  visibilityHint.className = 'hint';
  visibilityHint.textContent = 'Peça só aparece (preço + 3D) quando a dimensão escolhida do módulo estiver dentro do intervalo. Deixe "Sempre visível" pra nunca esconder (padrão).';
  visibilityWrap.appendChild(visibilityHint);
  detailsDiv.appendChild(visibilityWrap);

  visibilityDimSelect.addEventListener('change', () => {
    visibilityMinInput.disabled = !checkbox.checked || !visibilityDimSelect.value;
    visibilityMaxInput.disabled = !checkbox.checked || !visibilityDimSelect.value;
    setSaveStatus('Alterações não salvas.', 'unsaved');
    computeModulePieces();
  });

  // ======================================================================
  // FUNÇÃO DESTA PEÇA — o que transforma a chapa crua em lateral/base/etc.
  // ======================================================================
  // Migration 105 + linha "flatbord" (2026-08-15). Até aqui, peça-COMPONENTE
  // não tinha NADA disso na tela: buildLinkDataFromRef gravava
  // position_role/color_role_id como null de propósito, porque a plataforma
  // assumia que a função morava no componente ("Bottom Inf" É a base).
  //
  // A linha nova inverte isso: existem só dois componentes (flatbord 2C e
  // 4L, a chapa crua) e a função vem do USO. Sem estes campos aqui não há
  // como dizer que ESTA linha é a lateral esquerda, com ESTE programa de
  // furação e ESTE sentido de veio — foi o "não vejo nenhum desses cadastros,
  // está tudo oculto a mim e isso é muito perigoso" do Matt.
  const funcaoWrap = document.createElement('div');
  funcaoWrap.style.marginTop = '10px';
  funcaoWrap.style.paddingTop = '8px';
  funcaoWrap.style.borderTop = '1px dashed #d8d2c6';
  const funcaoTitulo = document.createElement('label');
  funcaoTitulo.style.fontSize = '12px';
  funcaoTitulo.style.marginTop = '0';
  funcaoTitulo.style.fontWeight = '600';
  funcaoTitulo.textContent = 'Função desta peça neste módulo';
  funcaoWrap.appendChild(funcaoTitulo);

  const funcaoRow = document.createElement('div');
  funcaoRow.className = 'row';
  funcaoRow.style.marginTop = '2px';

  // --- Programa de furação (catálogo da migration 105)
  const furoDiv = document.createElement('div');
  furoDiv.style.flex = '1';
  const furoLbl = document.createElement('label');
  furoLbl.style.fontSize = '12px';
  furoLbl.style.marginTop = '0';
  furoLbl.textContent = 'Programa de furação';
  const furoSelect = document.createElement('select');
  furoSelect.style.marginTop = '2px';
  furoSelect.disabled = !checkbox.checked;
  // Vazio = cai na furação do COMPONENTE (component_drillings), que é o
  // comportamento dos módulos antigos. O rótulo diz isso de propósito.
  furoSelect.innerHTML = '<option value="">— usar a furação do componente —</option>'
    + (drillingPatternsCache || []).map((p) =>
      '<option value="' + p.id + '">' + p.name + '</option>').join('');
  furoSelect.value = (existingLink && existingLink.drilling_pattern_id) || '';
  furoDiv.appendChild(furoLbl);
  furoDiv.appendChild(furoSelect);

  // --- Sentido do veio
  const veioDiv = document.createElement('div');
  veioDiv.style.flex = '1';
  const veioLbl = document.createElement('label');
  veioLbl.style.fontSize = '12px';
  veioLbl.style.marginTop = '0';
  veioLbl.textContent = 'Sentido do veio';
  const veioSelect = document.createElement('select');
  veioSelect.style.marginTop = '2px';
  veioSelect.disabled = !checkbox.checked;
  veioSelect.innerHTML = '<option value="">— herda da cor —</option>'
    + '<option value="comprimento">No comprimento</option>'
    + '<option value="largura">Na largura</option>'
    + '<option value="livre">Livre</option>';
  veioSelect.value = (existingLink && existingLink.grain_dir) || '';
  veioDiv.appendChild(veioLbl);
  veioDiv.appendChild(veioSelect);

  funcaoRow.appendChild(furoDiv);
  funcaoRow.appendChild(veioDiv);
  funcaoWrap.appendChild(funcaoRow);

  // --- Posição e cor: as colunas SEMPRE existiram em module_components e o
  // resolvedor já as lê; só a tela nunca as ofereceu pra peça-componente.
  const funcaoRow2 = document.createElement('div');
  funcaoRow2.className = 'row';
  funcaoRow2.style.marginTop = '4px';

  const posDiv = document.createElement('div');
  posDiv.style.flex = '1';
  const posLbl = document.createElement('label');
  posLbl.style.fontSize = '12px';
  posLbl.style.marginTop = '0';
  posLbl.textContent = 'Posição no módulo';
  const posSelect = document.createElement('select');
  posSelect.style.marginTop = '2px';
  posSelect.disabled = !checkbox.checked;
  posSelect.innerHTML = '<option value="">— herda do componente —</option>';
  Object.keys(POSITION_ROLE_LABELS).forEach((role) => {
    const opt = document.createElement('option');
    opt.value = role;
    opt.textContent = POSITION_ROLE_LABELS[role];
    posSelect.appendChild(opt);
  });
  posSelect.value = (existingLink && existingLink.position_role) || '';
  posDiv.appendChild(posLbl);
  posDiv.appendChild(posSelect);

  const corDiv = document.createElement('div');
  corDiv.style.flex = '1';
  const corLbl = document.createElement('label');
  corLbl.style.fontSize = '12px';
  corLbl.style.marginTop = '0';
  corLbl.textContent = 'Cor (papel)';
  const corSelect = document.createElement('select');
  corSelect.style.marginTop = '2px';
  corSelect.disabled = !checkbox.checked;
  corSelect.innerHTML = '<option value="">— herda do componente —</option>'
    + colorRolesCache.map((r) => '<option value="' + r.id + '">' + r.name + '</option>').join('');
  // migration 155 — colorRolesCache já vem SEM os papéis hidden_from_admin
  // (ex: "Rod", da decoração). Se este vínculo já tem um override salvo
  // apontando pra um papel oculto, injeta a opção de volta (marcada) antes
  // de setar o valor — senão o navegador ignora e o select cai em branco,
  // e salvar sem notar gravaria color_role_id vazio (perderia o override).
  const corExistingRoleId = (existingLink && existingLink.color_role_id) || '';
  if (corExistingRoleId && !colorRolesCache.some((r) => r.id === corExistingRoleId)) {
    const hiddenRole = (colorRolesCacheAll || []).find((r) => r.id === corExistingRoleId);
    if (hiddenRole) {
      const opt = document.createElement('option');
      opt.value = hiddenRole.id;
      opt.textContent = hiddenRole.name + ' (oculto)';
      corSelect.appendChild(opt);
    }
  }
  corSelect.value = corExistingRoleId;
  corDiv.appendChild(corLbl);
  corDiv.appendChild(corSelect);

  // --- Abertura (2026-08-27, Matt: "a lixeira e como uma gaveta e preciso
  // colocar uma abertura de gaveta nela... nao estou conseguindo fazer isso
  // nos componentes") — até aqui só a peça-módulo (renderModuleNestedRow,
  // logo abaixo) tinha este campo; peça-componente sempre gravava
  // opening_type='none' fixo (ver buildLinkDataFromRef), mesmo com o
  // 3D (viewer3d.js) já sabendo animar 'front'/'free' com opening_type=
  // 'slide_out' desde 20-23/08. Mesma extensão que position_role/color_role_id
  // já ganharam quando a linha flatbord chegou (comentário logo acima).
  const funcaoOpeningDiv = document.createElement('div');
  funcaoOpeningDiv.style.flex = '1';
  const funcaoOpeningLbl = document.createElement('label');
  funcaoOpeningLbl.style.fontSize = '12px';
  funcaoOpeningLbl.style.marginTop = '0';
  funcaoOpeningLbl.textContent = 'Abertura';
  const funcaoOpeningSelect = document.createElement('select');
  funcaoOpeningSelect.style.marginTop = '2px';
  funcaoOpeningSelect.disabled = !checkbox.checked;
  funcaoOpeningSelect.innerHTML = `
    <option value="">— herda do componente —</option>
    <option value="none">Não abre</option>
    <option value="hinge_left">Gira — dobradiça esquerda</option>
    <option value="hinge_right">Gira — dobradiça direita</option>
    <option value="slide_out">Desliza (corrediça)</option>
  `;
  funcaoOpeningSelect.value = (existingLink && existingLink.opening_type) || '';
  funcaoOpeningDiv.appendChild(funcaoOpeningLbl);
  funcaoOpeningDiv.appendChild(funcaoOpeningSelect);

  funcaoRow2.appendChild(posDiv);
  funcaoRow2.appendChild(corDiv);
  funcaoRow2.appendChild(funcaoOpeningDiv);
  funcaoWrap.appendChild(funcaoRow2);

  const funcaoHint = document.createElement('p');
  funcaoHint.className = 'hint';
  funcaoHint.textContent = 'Em branco = herda do cadastro do componente (comportamento dos módulos antigos). '
    + 'Na linha nova (flatbord), é AQUI que a chapa vira lateral, base ou prateleira. '
    + 'Abertura "Desliza" faz a peça responder ao botão "Abrir gavetas" do 3D — útil pra itens de decoração '
    + 'com hardware que puxa pra fora (ex: lixeira dupla).';
  funcaoWrap.appendChild(funcaoHint);
  detailsDiv.appendChild(funcaoWrap);

  [furoSelect, veioSelect, posSelect, corSelect, funcaoOpeningSelect].forEach((el) => {
    el.addEventListener('change', () => {
      setSaveStatus('Alterações não salvas.', 'unsaved');
      computeModulePieces();
    });
  });

  // "Cliente escolhe a quantidade" (ex: prateleiras) — específico deste
  // módulo usando este componente, não do componente em si (o mesmo
  // componente de catálogo pode ter um intervalo num módulo pequeno e
  // outro num módulo grande). Quando marcado, ignora a quantidade fixa
  // (qtyInput acima) — o cliente escolhe dentro de mín/padrão/máx.
  const qtyConfigWrap = document.createElement('div');
  qtyConfigWrap.style.marginTop = '6px';
  const qtyConfigLabel = document.createElement('label');
  qtyConfigLabel.style.display = 'flex';
  qtyConfigLabel.style.alignItems = 'center';
  qtyConfigLabel.style.gap = '6px';
  qtyConfigLabel.style.fontSize = '12px';
  qtyConfigLabel.style.marginTop = '0';
  const qtyConfigCheckbox = document.createElement('input');
  qtyConfigCheckbox.type = 'checkbox';
  qtyConfigCheckbox.style.width = 'auto';
  qtyConfigCheckbox.checked = !!(existingLink && existingLink.quantity_configurable);
  qtyConfigCheckbox.disabled = !checkbox.checked;
  qtyConfigLabel.appendChild(qtyConfigCheckbox);
  qtyConfigLabel.appendChild(document.createTextNode('Cliente escolhe a quantidade neste módulo (ex: prateleiras)'));
  qtyConfigWrap.appendChild(qtyConfigLabel);
  detailsDiv.appendChild(qtyConfigWrap);

  const qtyRangeRow = document.createElement('div');
  qtyRangeRow.className = 'row';
  qtyRangeRow.style.marginTop = '4px';
  qtyRangeRow.style.display = qtyConfigCheckbox.checked ? 'flex' : 'none';

  function makeQtyRangeField(labelText, existingValue) {
    const div = document.createElement('div');
    div.style.flex = '1';
    const lbl = document.createElement('label');
    lbl.style.fontSize = '12px';
    lbl.style.marginTop = '0';
    lbl.textContent = labelText;
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.style.marginTop = '2px';
    input.disabled = !checkbox.checked || !qtyConfigCheckbox.checked;
    if (existingValue !== undefined && existingValue !== null) input.value = existingValue;
    div.appendChild(lbl);
    div.appendChild(input);
    return { div, input };
  }

  const qtyMinField = makeQtyRangeField('Quantidade mínima', existingLink && existingLink.quantity_min);
  const qtyDefaultField = makeQtyRangeField('Quantidade padrão (cliente)', existingLink && existingLink.quantity_default);
  const qtyMaxField = makeQtyRangeField('Quantidade máxima', existingLink && existingLink.quantity_max);
  qtyRangeRow.appendChild(qtyMinField.div);
  qtyRangeRow.appendChild(qtyDefaultField.div);
  qtyRangeRow.appendChild(qtyMaxField.div);
  detailsDiv.appendChild(qtyRangeRow);

  // "Cliente pode adicionar/remover (opcional)" — ex: puxador, rodapé,
  // tampo, pé. Diferente de "cliente escolhe a quantidade" (que é sobre
  // QUANTAS peças), isso é sobre SE a peça entra ou não — o cliente vê
  // uma caixinha de marcar na calculadora, desmarcada por padrão, e pode
  // marcar vários opcionais diferentes ao mesmo tempo.
  const clientOptionalWrap = document.createElement('div');
  clientOptionalWrap.style.marginTop = '6px';
  const clientOptionalLabel = document.createElement('label');
  clientOptionalLabel.style.display = 'flex';
  clientOptionalLabel.style.alignItems = 'center';
  clientOptionalLabel.style.gap = '6px';
  clientOptionalLabel.style.fontSize = '12px';
  clientOptionalLabel.style.marginTop = '0';
  const clientOptionalCheckbox = document.createElement('input');
  clientOptionalCheckbox.type = 'checkbox';
  clientOptionalCheckbox.style.width = 'auto';
  clientOptionalCheckbox.checked = !!(existingLink && existingLink.client_optional);
  clientOptionalCheckbox.disabled = !checkbox.checked;
  clientOptionalLabel.appendChild(clientOptionalCheckbox);
  clientOptionalLabel.appendChild(document.createTextNode('Cliente pode adicionar/remover (opcional — ex: puxador, rodapé, tampo, pé)'));
  clientOptionalWrap.appendChild(clientOptionalLabel);
  detailsDiv.appendChild(clientOptionalWrap);

  // Só faz sentido quando o opcional acima está marcado: em vez da
  // caixinha nascer desmarcada (cliente precisa clicar pra incluir), ela
  // já nasce MARCADA — o componente já entra por padrão, mas o cliente
  // ainda pode desmarcar e tirar. Cobre o caso do pé/puxador/etc que
  // "quase sempre" é usado, mas ainda precisa poder ser removido.
  const defaultOnWrap = document.createElement('div');
  defaultOnWrap.style.marginTop = '4px';
  defaultOnWrap.style.marginLeft = '20px';
  const defaultOnLabel = document.createElement('label');
  defaultOnLabel.style.display = 'flex';
  defaultOnLabel.style.alignItems = 'center';
  defaultOnLabel.style.gap = '6px';
  defaultOnLabel.style.fontSize = '12px';
  defaultOnLabel.style.marginTop = '0';
  const defaultOnCheckbox = document.createElement('input');
  defaultOnCheckbox.type = 'checkbox';
  defaultOnCheckbox.style.width = 'auto';
  defaultOnCheckbox.checked = !!(existingLink && existingLink.client_optional_default_on);
  defaultOnCheckbox.disabled = !checkbox.checked || !clientOptionalCheckbox.checked;
  defaultOnLabel.appendChild(defaultOnCheckbox);
  defaultOnLabel.appendChild(document.createTextNode('Vem marcado por padrão (cliente ainda pode desmarcar e tirar)'));
  defaultOnWrap.appendChild(defaultOnLabel);
  detailsDiv.appendChild(defaultOnWrap);

  // "Cliente pode escolher a cor desta peça separadamente" (migration 046,
  // generalizado 2026-07-19 pra peça-FOLHA também — pedido do usuário: "pra
  // peca tambem, por que quero deixar por exemplo so uma shelf de cor
  // separada"). Até aqui só existia em peça-MÓDULO aninhada
  // (renderModuleNestedRow) — o motor de preço/3D (effectiveColorsForPiece
  // em pricing.js, resolvePiecesForViewer em portal.js) já mesclava
  // pieceColorOverrides por piece.id pra QUALQUER peça sem precisar de
  // mudança nenhuma; só faltava dar o mesmo botão aqui pra peça-componente
  // (ex: uma prateleira específica usando o mesmo papel "Caixa" das
  // laterais, mas o cliente quer ela numa cor diferente). Sem faixa
  // min/padrão/máx pra configurar (as cores já vêm de module_colors do
  // módulo pai) — só liga/desliga o painel extra no portal.
  const colorConfigWrap = document.createElement('div');
  colorConfigWrap.style.marginTop = '6px';
  const colorConfigLabel = document.createElement('label');
  colorConfigLabel.style.display = 'flex';
  colorConfigLabel.style.alignItems = 'center';
  colorConfigLabel.style.gap = '6px';
  colorConfigLabel.style.fontSize = '12px';
  colorConfigLabel.style.marginTop = '0';
  const colorConfigCheckbox = document.createElement('input');
  colorConfigCheckbox.type = 'checkbox';
  colorConfigCheckbox.style.width = 'auto';
  colorConfigCheckbox.checked = !!(existingLink && existingLink.client_color_configurable);
  colorConfigCheckbox.disabled = !checkbox.checked;
  colorConfigLabel.appendChild(colorConfigCheckbox);
  colorConfigLabel.appendChild(document.createTextNode('Cliente pode escolher a cor desta peça separadamente'));
  colorConfigWrap.appendChild(colorConfigLabel);
  detailsDiv.appendChild(colorConfigWrap);

  // Junção automática com o módulo vizinho (migration 137, 2026-08-23).
  // Fica no VÍNCULO módulo x peça (module_components), NÃO no componente —
  // o Matt corrigiu a 1ª versão disto (que morava em components): "esse
  // componente flatbord2c usa pra tudo" — a mesma chapa genérica vira
  // prateleira, divisória, rodapé... em módulos diferentes, e um toggle no
  // CADASTRO ligaria/desligaria em todo uso de uma vez. Aqui é por USO,
  // mesmo raciocínio de usinagem_m/recortes/veio-por-uso (grain_dir) acima.
  // Só tem efeito de verdade em peça com Posição = "Rodapé" hoje (ver
  // js/viewer3d.js, ramo baseboard) — em qualquer outra posição fica
  // gravado sem efeito, pronto pro dia que a junção generalizar pra outras
  // peças (o Matt já avisou que vem depois).
  const autoJoinWrap = document.createElement('div');
  autoJoinWrap.style.marginTop = '6px';
  const autoJoinLabel = document.createElement('label');
  autoJoinLabel.style.display = 'flex';
  autoJoinLabel.style.alignItems = 'center';
  autoJoinLabel.style.gap = '6px';
  autoJoinLabel.style.fontSize = '12px';
  autoJoinLabel.style.marginTop = '0';
  const autoJoinCheckbox = document.createElement('input');
  autoJoinCheckbox.type = 'checkbox';
  autoJoinCheckbox.style.width = 'auto';
  // Sem link salvo ainda (linha nova) OU auto_join_adjacent null (linha
  // antiga, de antes deste campo existir) = nasce MARCADO — comportamento
  // padrão pedido pelo Matt ("pode até deixar sempre ligado"). Só false
  // explícito desmarca.
  autoJoinCheckbox.checked = !(existingLink && existingLink.auto_join_adjacent === false);
  autoJoinCheckbox.disabled = !checkbox.checked;
  autoJoinLabel.appendChild(autoJoinCheckbox);
  autoJoinLabel.appendChild(document.createTextNode('Juntar com a mesma peça do módulo vizinho quando encostado (ex: rodapé)'));
  autoJoinWrap.appendChild(autoJoinLabel);
  detailsDiv.appendChild(autoJoinWrap);

  // FUROS DE SUPORTE DE PRATELEIRA POR USO (migration 162, 2026-09-24 —
  // Matt: "as prateleiras não saíram com furação, nem na prateleira nem na
  // lateral, módulo 51"). A flag morava só em components (migration 045) e
  // a prateleira de hoje é a chapa genérica (Flatbord 2C) — que não pode
  // ter a flag, senão base/topo também ganhariam os 4 furos Ø3. Vazio =
  // herda do componente (linha antiga não muda nada).
  const shelfSupportWrap = document.createElement('div');
  shelfSupportWrap.style.marginTop = '4px';
  const shelfSupportLabel = document.createElement('label');
  shelfSupportLabel.style.display = 'flex';
  shelfSupportLabel.style.alignItems = 'center';
  shelfSupportLabel.style.gap = '6px';
  shelfSupportLabel.style.fontSize = '12px';
  shelfSupportLabel.style.marginTop = '0';
  shelfSupportLabel.appendChild(document.createTextNode('Furos de suporte de prateleira na lateral:'));
  const shelfSupportSelect = document.createElement('select');
  shelfSupportSelect.style.width = 'auto';
  [['', '— herdar do componente' + (c.drill_shelf_support ? ' (sim)' : ' (não)') + ' —'], ['true', 'Sim — 4 furos Ø3 nas laterais'], ['false', 'Não']].forEach(([val, txt]) => {
    const o = document.createElement('option'); o.value = val; o.textContent = txt; shelfSupportSelect.appendChild(o);
  });
  shelfSupportSelect.value = (existingLink && existingLink.drill_shelf_support != null) ? String(!!existingLink.drill_shelf_support) : '';
  shelfSupportSelect.disabled = !checkbox.checked;
  shelfSupportLabel.appendChild(shelfSupportSelect);
  shelfSupportWrap.appendChild(shelfSupportLabel);
  detailsDiv.appendChild(shelfSupportWrap);

  const joinMaxLenWrap = document.createElement('div');
  joinMaxLenWrap.style.marginTop = '4px';
  joinMaxLenWrap.style.marginLeft = '20px';
  joinMaxLenWrap.style.maxWidth = '220px';
  const joinMaxLenLabel = document.createElement('label');
  joinMaxLenLabel.style.fontSize = '12px';
  joinMaxLenLabel.style.marginTop = '0';
  joinMaxLenLabel.textContent = 'Comprimento máx. da junção (mm)';
  const joinMaxLenInput = document.createElement('input');
  joinMaxLenInput.type = 'number';
  joinMaxLenInput.min = '1';
  joinMaxLenInput.style.marginTop = '2px';
  joinMaxLenInput.value = (existingLink && existingLink.join_max_length_mm != null) ? existingLink.join_max_length_mm : 2700;
  joinMaxLenInput.disabled = !checkbox.checked || !autoJoinCheckbox.checked;
  joinMaxLenWrap.appendChild(joinMaxLenLabel);
  joinMaxLenWrap.appendChild(joinMaxLenInput);
  detailsDiv.appendChild(joinMaxLenWrap);

  // Nada aqui grava no banco — só atualiza a prévia (teste de cálculo) e
  // marca "alterações não salvas". A gravação de verdade só acontece no
  // clique do botão "Salvar componentes deste módulo".
  function onAnyFieldChange() {
    qtyInput.disabled = !checkbox.checked;
    nameOverrideInput.disabled = !checkbox.checked;
    widthField.input.disabled = !checkbox.checked;
    heightField.input.disabled = !checkbox.checked;
    depthField.input.disabled = !checkbox.checked;
    offsetXField.input.disabled = !checkbox.checked;
    offsetYField.input.disabled = !checkbox.checked;
    offsetZField.input.disabled = !checkbox.checked;
    visibilityDimSelect.disabled = !checkbox.checked;
    visibilityMinInput.disabled = !checkbox.checked || !visibilityDimSelect.value;
    visibilityMaxInput.disabled = !checkbox.checked || !visibilityDimSelect.value;
    qtyConfigCheckbox.disabled = !checkbox.checked;
    qtyRangeRow.style.display = qtyConfigCheckbox.checked ? 'flex' : 'none';
    [qtyMinField.input, qtyDefaultField.input, qtyMaxField.input].forEach((input) => {
      input.disabled = !checkbox.checked || !qtyConfigCheckbox.checked;
    });
    clientOptionalCheckbox.disabled = !checkbox.checked;
    defaultOnCheckbox.disabled = !checkbox.checked || !clientOptionalCheckbox.checked;
    colorConfigCheckbox.disabled = !checkbox.checked;
    autoJoinCheckbox.disabled = !checkbox.checked;
    joinMaxLenInput.disabled = !checkbox.checked || !autoJoinCheckbox.checked;
    shelfSupportSelect.disabled = !checkbox.checked;
    setSaveStatus('Alterações não salvas.', 'unsaved');
    computeModulePieces();
  }

  // Marcar/desmarcar "usado neste módulo" só mostra/esconde o botão de
  // recolher — o painel continua sempre fechado ao marcar (o admin abre
  // manualmente se quiser mexer), e some por completo ao desmarcar (não tem
  // nada útil pra mostrar de um componente que não é usado).
  checkbox.addEventListener('change', () => {
    toggleBtn.style.display = checkbox.checked ? 'inline-block' : 'none';
    detailsDiv.style.display = 'none';
    toggleBtn.textContent = '▸ Configurar';
  });

  toggleBtn.addEventListener('click', () => {
    const isOpen = detailsDiv.style.display !== 'none';
    detailsDiv.style.display = isOpen ? 'none' : 'block';
    toggleBtn.textContent = isOpen ? '▸ Configurar' : '▾ Configurar';
  });

  checkbox.addEventListener('change', onAnyFieldChange);
  qtyInput.addEventListener('input', onAnyFieldChange);
  qtyConfigCheckbox.addEventListener('change', onAnyFieldChange);
  clientOptionalCheckbox.addEventListener('change', onAnyFieldChange);
  defaultOnCheckbox.addEventListener('change', onAnyFieldChange);
  colorConfigCheckbox.addEventListener('change', onAnyFieldChange);
  autoJoinCheckbox.addEventListener('change', onAnyFieldChange);
  shelfSupportSelect.addEventListener('change', onAnyFieldChange);
  joinMaxLenInput.addEventListener('input', onAnyFieldChange);
  [widthField.input, heightField.input, depthField.input, offsetXField.input, offsetYField.input, offsetZField.input,
    qtyMinField.input, qtyDefaultField.input, qtyMaxField.input, visibilityMinInput, visibilityMaxInput].forEach((input) => {
    input.addEventListener('input', onAnyFieldChange);
  });

  moduleComponentFieldRefs.push({
    kind: 'component',
    rowId, componentId: c.id, checkbox, qtyInput, nameOverrideInput, widthField, heightField, depthField,
    offsetXField, offsetYField, offsetZField,
    visibilityDimSelect, visibilityMinInput, visibilityMaxInput,
    qtyConfigCheckbox, qtyMinField, qtyDefaultField, qtyMaxField,
    clientOptionalCheckbox, defaultOnCheckbox,
    colorConfigCheckbox,
    // Junção automática de rodapé (migration 137) — ver bloco acima.
    autoJoinCheckbox, joinMaxLenInput,
    // Suporte de prateleira por uso (migration 162) — ver bloco acima.
    shelfSupportSelect,
    // Função da peça POR USO (migration 105) — ver o bloco "Função desta peça"
    // acima. São estes quatro (+ Abertura, 27/08) que fazem a chapa crua
    // virar lateral/base/porta-que-abre.
    furoSelect, veioSelect, posSelect, corSelect, funcaoOpeningSelect
  });
  if (insertBeforeEl) container.insertBefore(wrap, insertBeforeEl);
  else container.appendChild(wrap);
}

// Renderiza UM MÓDULO na lista de "Componentes deste módulo" — mesma
// estrutura visual de renderModuleComponentRow (cabeçalho sempre visível +
// painel de detalhes recolhido), mas pra uma peça-módulo aninhada (migration
// 023): fórmulas de L/A/P são OBRIGATÓRIAS (o módulo aninhado não tem
// fórmula própria pra herdar) e existem campos extras que só fazem sentido
// aqui — posição, cor e tipo de abertura, já que component_types/hinge_side
// não existem pra um módulo. Um botão "Ver módulo" leva direto pra
// configuração do módulo filho na aba "Configurar módulo".
function renderModuleNestedRow(childModule, existingLink, container, insertBeforeEl, forceChecked, suggestedName) {
  // rowId identifica esta INSTÂNCIA (ver mesmo comentário em
  // renderModuleComponentRow) — desde a migration 025 o mesmo módulo
  // aninhado também pode ter várias linhas no mesmo módulo pai.
  const rowId = (existingLink && existingLink.id) || crypto.randomUUID();

  const wrap = document.createElement('div');
  wrap.style.marginTop = '10px';
  // Marcador usado pelas setas ▲▼ (moveModulePieceRow) e por collectPendingLinks
  // (sort_order) pra achar/reconhecer linhas de peça de verdade dentro do
  // container — distingue de outros elementos que também vivem lá (título,
  // seções "Adicionar componente"/"Adicionar módulo" no fim).
  wrap.className = 'module-piece-row';
  wrap.dataset.rowId = rowId;

  const header = document.createElement('div');
  header.className = 'row';
  header.style.alignItems = 'center';
  header.style.padding = '8px 10px';
  header.style.background = '#eef2f7';
  header.style.border = '1px solid #d7e0ea';
  header.style.borderRadius = '6px';

  const labelDiv = document.createElement('div');
  labelDiv.style.flex = '2';
  const label = document.createElement('label');
  label.style.display = 'flex';
  label.style.alignItems = 'center';
  label.style.gap = '6px';
  label.style.marginTop = '0';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.style.width = 'auto';
  checkbox.checked = forceChecked ? true : !!existingLink;
  label.appendChild(checkbox);
  const nameSpan = document.createElement('span');
  nameSpan.textContent = `📦 ${(existingLink && existingLink.reference_override) || suggestedName || childModule.name} (módulo aninhado)`;
  label.appendChild(nameSpan);
  labelDiv.appendChild(label);

  // Quantidade override — o CAMPO em si nasce lá embaixo, no painel de
  // detalhes (ver qtyWrap), fora do cabeçalho sempre visível (mesmo motivo
  // de renderModuleComponentRow — cabeçalho mais estreito/mais peças
  // visíveis por vez).
  const qtyInput = document.createElement('input');
  qtyInput.type = 'number';
  qtyInput.min = '0';
  qtyInput.placeholder = 'qtd (padrão 1)';
  qtyInput.style.marginTop = '0';
  qtyInput.disabled = !checkbox.checked;
  if (existingLink && existingLink.quantity_override !== undefined && existingLink.quantity_override !== null) {
    qtyInput.value = existingLink.quantity_override;
  }

  // Setas ▲▼ pra reordenar — mesmo padrão da peça-componente (ver
  // moveModulePieceRow).
  const moveUpBtn = document.createElement('button');
  moveUpBtn.type = 'button';
  moveUpBtn.className = 'secondary mc-row-btn mc-row-btn-arrow';
  moveUpBtn.style.flex = '0 0 auto';
  moveUpBtn.title = 'Mover pra cima';
  moveUpBtn.textContent = '▲';
  moveUpBtn.addEventListener('click', () => moveModulePieceRow(wrap, -1));

  const moveDownBtn = document.createElement('button');
  moveDownBtn.type = 'button';
  moveDownBtn.className = 'secondary mc-row-btn mc-row-btn-arrow';
  moveDownBtn.style.flex = '0 0 auto';
  moveDownBtn.title = 'Mover pra baixo';
  moveDownBtn.textContent = '▼';
  moveDownBtn.addEventListener('click', () => moveModulePieceRow(wrap, 1));

  const gotoBtn = document.createElement('button');
  gotoBtn.type = 'button';
  gotoBtn.className = 'secondary mc-row-btn';
  gotoBtn.style.flex = '0 0 auto';
  gotoBtn.textContent = 'Ver módulo';
  gotoBtn.addEventListener('click', () => goToModuleConfig(childModule.id));

  // "Duplicar" — mesmo espírito do botão em renderModuleComponentRow: cria
  // outra instância deste MESMO módulo aninhado neste módulo pai, em posição
  // diferente (migration 025). Pedido do usuário (2026-07-26): a duplicata
  // herda tudo o que já estava configurado nesta linha (fórmulas de L/A/P,
  // posição, cor, abertura, deslocamento, visibilidade condicional,
  // quantidade, sub-configuração de medidas...), lido do estado ATUAL dos
  // campos (buildLinkDataFromRef) — só id (novo, senão colidiria ao salvar)
  // e nome customizado (cai pro numerado de sempre) não são herdados.
  const dupBtn = document.createElement('button');
  dupBtn.type = 'button';
  dupBtn.className = 'secondary mc-row-btn';
  dupBtn.style.flex = '0 0 auto';
  dupBtn.title = 'Adicionar outra instância deste módulo aninhado, com a mesma configuração, em outra posição';
  dupBtn.textContent = '+ Duplicar';
  dupBtn.addEventListener('click', () => {
    // Mesmo espírito do "+ Duplicar" de renderModuleComponentRow — sugere um
    // nome numerado pra diferenciar as instâncias repetidas deste módulo.
    const existingCount = moduleComponentFieldRefs.filter((ref) => ref.kind === 'module' && ref.childModuleId === childModule.id).length;
    const suggestedName = `${childModule.name} ${existingCount + 1}`;
    const thisRef = moduleComponentFieldRefs.find((ref) => ref.rowId === rowId);
    const clonedLink = thisRef ? { ...buildLinkDataFromRef(thisRef, 0), id: null, reference_override: null } : null;
    renderModuleNestedRow(childModule, clonedLink, container, wrap.nextSibling, true, suggestedName);
    setSaveStatus('Alterações não salvas.', 'unsaved');
    computeModulePieces();
  });

  // "📋 Copiar" — pra colar em OUTRO módulo, mesmo mecanismo/pedido do
  // usuário do botão gêmeo em renderModuleComponentRow (ver comentário lá).
  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'secondary mc-row-btn';
  copyBtn.style.flex = '0 0 auto';
  copyBtn.title = 'Copiar esta peça-módulo (com toda a configuração) pra colar em outro módulo';
  copyBtn.textContent = '📋 Copiar';
  copyBtn.addEventListener('click', () => {
    const thisRef = moduleComponentFieldRefs.find((ref) => ref.rowId === rowId);
    if (!thisRef) return;
    const sourceModule = modulesCache.find((x) => x.id === selectedModuleId);
    copiedModuleComponentLink = {
      kind: 'module',
      catalogId: childModule.id,
      catalogLabel: childModule.name,
      sourceModuleName: (sourceModule && sourceModule.name) || '?',
      link: buildLinkDataFromRef(thisRef, 0)
    };
    refreshPasteComponentButton();
  });

  // "🔁 Trocar módulo" — troca QUAL módulo aninhado esta linha referencia,
  // mantendo tudo o mais que já foi configurado NESTA linha (fórmulas de
  // L/A/P, posição, cor, abertura, deslocamento, visibilidade condicional,
  // quantidade...) — tudo isso vive no próprio module_components (o link),
  // não no módulo filho, então trocar o child_module_id não mexe em nada
  // disso. Pedido do usuário: reaproveitar o dimensionamento/posicionamento
  // já configurado ao trocar de peça, sem ter que recriar a linha do zero.
  const swapBtn = document.createElement('button');
  swapBtn.type = 'button';
  swapBtn.className = 'secondary mc-row-btn';
  swapBtn.style.flex = '0 0 auto';
  swapBtn.title = 'Trocar o módulo aninhado usado nesta linha, mantendo fórmulas/posição/cor/abertura já configurados aqui';
  swapBtn.textContent = '🔁 Trocar';

  const swapWrap = document.createElement('div');
  swapWrap.className = 'row';
  swapWrap.style.padding = '8px 10px';
  swapWrap.style.background = '#fff';
  swapWrap.style.border = '1px solid #d7e0ea';
  swapWrap.style.borderTop = 'none';
  swapWrap.style.gap = '8px';
  swapWrap.style.alignItems = 'center';
  swapWrap.style.display = 'none';

  const swapSelect = document.createElement('select');
  swapSelect.style.marginTop = '0';
  swapSelect.style.flex = '1';

  const swapConfirmBtn = document.createElement('button');
  swapConfirmBtn.type = 'button';
  swapConfirmBtn.className = 'secondary';
  swapConfirmBtn.style.flex = '0 0 auto';
  swapConfirmBtn.textContent = 'Confirmar troca';

  const swapCancelBtn = document.createElement('button');
  swapCancelBtn.type = 'button';
  swapCancelBtn.className = 'secondary';
  swapCancelBtn.style.flex = '0 0 auto';
  swapCancelBtn.textContent = 'Cancelar';

  swapWrap.appendChild(swapSelect);
  swapWrap.appendChild(swapConfirmBtn);
  swapWrap.appendChild(swapCancelBtn);

  swapBtn.addEventListener('click', async () => {
    if (swapWrap.style.display !== 'none') { swapWrap.style.display = 'none'; return; }
    swapSelect.innerHTML = '<option value="">Carregando...</option>';
    swapWrap.style.display = 'flex';
    // Mesma prevenção de ciclo usada em "Adicionar módulo" (getModuleDescendantIds)
    // — só exclui o módulo pai atual e quem formaria ciclo; o próprio módulo já
    // usado nesta linha continua na lista (caso o admin queira trocar e voltar).
    const candidates = modulesCache.filter((m) => m.id !== selectedModuleId);
    const allowed = [];
    for (const cand of candidates) {
      const descendants = await getModuleDescendantIds(cand.id);
      if (!descendants.has(selectedModuleId)) allowed.push(cand);
    }
    swapSelect.innerHTML = allowed.length > 0
      ? allowed.map((m) => `<option value="${m.id}" ${m.id === childModule.id ? 'selected' : ''}>${m.name}${m.is_invisible ? ' (invisível)' : ''}</option>`).join('')
      : '<option value="">Nenhum módulo disponível</option>';
  });

  swapCancelBtn.addEventListener('click', () => { swapWrap.style.display = 'none'; });

  swapConfirmBtn.addEventListener('click', () => {
    const newId = swapSelect.value;
    if (!newId || newId === childModule.id) { swapWrap.style.display = 'none'; return; }
    const m = modulesCache.find((x) => x.id === newId);
    if (!m) return;
    childModule = m; // reatribui o parâmetro — gotoBtn/dupBtn e o placeholder abaixo fecham sobre esta variável, então já passam a enxergar o novo módulo
    nameSpan.textContent = `📦 ${nameOverrideInput.value.trim() || childModule.name} (módulo aninhado)`;
    nameOverrideInput.placeholder = childModule.name;
    // Se "cliente pode configurar as medidas" já estiver ligado e os 9 campos
    // ainda em branco, sugere a faixa do módulo NOVO (mesma regra de quando o
    // checkbox é marcado pela primeira vez — ver prefillDimRangeFromChildModule).
    if (dimConfigCheckbox.checked) prefillDimRangeFromChildModule();
    const ref = moduleComponentFieldRefs.find((r) => r.rowId === rowId);
    if (ref) ref.childModuleId = m.id;
    recomputeRenderedModuleIds();
    refreshAddModuleOptions();
    swapWrap.style.display = 'none';
    setSaveStatus('Alterações não salvas.', 'unsaved');
    computeModulePieces();
  });

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'secondary mc-row-btn';
  toggleBtn.style.flex = '0 0 auto';
  toggleBtn.style.display = checkbox.checked ? 'inline-block' : 'none';
  toggleBtn.textContent = '▸ Configurar';

  header.appendChild(labelDiv);
  header.appendChild(moveUpBtn);
  header.appendChild(moveDownBtn);
  header.appendChild(gotoBtn);
  header.appendChild(dupBtn);
  header.appendChild(copyBtn);
  header.appendChild(swapBtn);
  header.appendChild(toggleBtn);
  wrap.appendChild(header);
  wrap.appendChild(swapWrap);

  const detailsDiv = document.createElement('div');
  detailsDiv.style.padding = '10px 10px 4px 10px';
  detailsDiv.style.border = '1px solid #d7e0ea';
  detailsDiv.style.borderTop = 'none';
  detailsDiv.style.borderRadius = '0 0 6px 6px';
  detailsDiv.style.display = 'none';
  wrap.appendChild(detailsDiv);

  // Nome customizado desta instância (migration 032) — mesmo campo/mesma
  // regra de uma peça-componente (ver renderModuleComponentRow): útil quando
  // o mesmo módulo aninhado se repete neste módulo pai.
  const nameOverrideWrap = document.createElement('div');
  nameOverrideWrap.style.marginTop = '0';
  const nameOverrideLbl = document.createElement('label');
  nameOverrideLbl.style.fontSize = '12px';
  nameOverrideLbl.style.marginTop = '0';
  nameOverrideLbl.textContent = 'Nome customizado desta instância (opcional)';
  const nameOverrideInput = document.createElement('input');
  nameOverrideInput.type = 'text';
  nameOverrideInput.placeholder = childModule.name;
  nameOverrideInput.style.marginTop = '2px';
  nameOverrideInput.disabled = !checkbox.checked;
  if (existingLink && existingLink.reference_override) nameOverrideInput.value = existingLink.reference_override;
  else if (suggestedName) nameOverrideInput.value = suggestedName;
  nameOverrideWrap.appendChild(nameOverrideLbl);
  nameOverrideWrap.appendChild(nameOverrideInput);
  detailsDiv.appendChild(nameOverrideWrap);

  nameOverrideInput.addEventListener('input', () => {
    nameSpan.textContent = `📦 ${nameOverrideInput.value.trim() || childModule.name} (módulo aninhado)`;
    setSaveStatus('Alterações não salvas.', 'unsaved');
    computeModulePieces();
  });

  // Quantidade override (ver qtyInput criado lá em cima, junto do
  // cabeçalho — só o CAMPO nasceu aqui embaixo, no painel de detalhes, pra
  // não ocupar espaço no cabeçalho sempre visível).
  const qtyWrap = document.createElement('div');
  qtyWrap.style.marginTop = '10px';
  const qtyLbl = document.createElement('label');
  qtyLbl.style.fontSize = '12px';
  qtyLbl.style.marginTop = '0';
  qtyLbl.textContent = 'Quantidade override (padrão: 1)';
  qtyWrap.appendChild(qtyLbl);
  qtyWrap.appendChild(qtyInput);
  detailsDiv.appendChild(qtyWrap);

  // Fórmulas de L/A/P — OBRIGATÓRIAS aqui (diferente do "override" de uma
  // peça-componente): o módulo aninhado não tem fórmula própria de catálogo
  // pra herdar, então isso é a ÚNICA fonte de dimensão dele dentro deste
  // módulo pai. W/H/D nas fórmulas referem-se ao módulo PAI (mesmo espírito
  // de qualquer fórmula de componente).
  const formulaRow = document.createElement('div');
  formulaRow.className = 'row';
  formulaRow.style.marginTop = '4px';

  function makeRequiredFormulaField(labelText, existingValue) {
    const div = document.createElement('div');
    div.style.flex = '1';
    const lbl = document.createElement('label');
    lbl.style.fontSize = '12px';
    lbl.style.marginTop = '0';
    lbl.textContent = `${labelText} (obrigatório)`;
    const input = document.createElement('input');
    input.placeholder = 'ex: W-4';
    input.style.marginTop = '2px';
    input.disabled = !checkbox.checked;
    if (existingValue !== undefined && existingValue !== null && existingValue !== '') input.value = existingValue;
    div.appendChild(lbl);
    div.appendChild(input);
    return { div, input };
  }

  const widthField = makeRequiredFormulaField('Fórmula largura', existingLink && existingLink.width_formula_override);
  const heightField = makeRequiredFormulaField('Fórmula altura', existingLink && existingLink.height_formula_override);
  const depthField = makeRequiredFormulaField('Fórmula profundidade', existingLink && existingLink.depth_formula_override);
  formulaRow.appendChild(widthField.div);
  formulaRow.appendChild(heightField.div);
  formulaRow.appendChild(depthField.div);
  detailsDiv.appendChild(formulaRow);

  // Posição / cor / abertura — só existem aqui (peça-módulo não tem
  // components.position_role/color_role/hinge_side pra herdar).
  const roleRow = document.createElement('div');
  roleRow.className = 'row';
  roleRow.style.marginTop = '4px';

  const positionDiv = document.createElement('div');
  positionDiv.style.flex = '1';
  const positionLbl = document.createElement('label');
  positionLbl.style.fontSize = '12px';
  positionLbl.style.marginTop = '0';
  positionLbl.textContent = 'Posição no módulo';
  const positionSelect = document.createElement('select');
  positionSelect.style.marginTop = '2px';
  positionSelect.disabled = !checkbox.checked;
  Object.keys(POSITION_ROLE_LABELS).forEach((role) => {
    const opt = document.createElement('option');
    opt.value = role;
    opt.textContent = POSITION_ROLE_LABELS[role];
    positionSelect.appendChild(opt);
  });
  positionSelect.value = (existingLink && existingLink.position_role) || 'other';
  positionDiv.appendChild(positionLbl);
  positionDiv.appendChild(positionSelect);

  const colorDiv = document.createElement('div');
  colorDiv.style.flex = '1';
  const colorLbl = document.createElement('label');
  colorLbl.style.fontSize = '12px';
  colorLbl.style.marginTop = '0';
  colorLbl.textContent = 'Cor';
  const colorSelect = document.createElement('select');
  colorSelect.style.marginTop = '2px';
  colorSelect.disabled = !checkbox.checked;
  // Papéis de cor (migration 035) — antes eram 2 <option> fixas (Caixa/Porta),
  // agora vem do catálogo color_roles (o admin pode ter criado mais).
  colorSelect.innerHTML = colorRolesCache.map((r) => `<option value="${r.id}">${r.name}</option>`).join('');
  // migration 155 — mesma proteção do corSelect logo acima: se este vínculo
  // já usa um papel oculto (hidden_from_admin), injeta de volta pra não
  // perder o valor ao salvar sem querer.
  const colorExistingRoleId = (existingLink && existingLink.color_role_id) || '';
  if (colorExistingRoleId && !colorRolesCache.some((r) => r.id === colorExistingRoleId)) {
    const hiddenRole = (colorRolesCacheAll || []).find((r) => r.id === colorExistingRoleId);
    if (hiddenRole) {
      const opt = document.createElement('option');
      opt.value = hiddenRole.id;
      opt.textContent = hiddenRole.name + ' (oculto)';
      colorSelect.appendChild(opt);
    }
  }
  colorSelect.value = colorExistingRoleId || (colorRolesCache[0] ? colorRolesCache[0].id : '');
  colorDiv.appendChild(colorLbl);
  colorDiv.appendChild(colorSelect);

  const openingDiv = document.createElement('div');
  openingDiv.style.flex = '1';
  const openingLbl = document.createElement('label');
  openingLbl.style.fontSize = '12px';
  openingLbl.style.marginTop = '0';
  openingLbl.textContent = 'Abertura';
  const openingSelect = document.createElement('select');
  openingSelect.style.marginTop = '2px';
  openingSelect.disabled = !checkbox.checked;
  openingSelect.innerHTML = `
    <option value="none">Não abre</option>
    <option value="hinge_left">Gira — dobradiça esquerda</option>
    <option value="hinge_right">Gira — dobradiça direita</option>
    <option value="slide_out">Desliza (corrediça)</option>
  `;
  openingSelect.value = (existingLink && existingLink.opening_type) || 'none';
  openingDiv.appendChild(openingLbl);
  openingDiv.appendChild(openingSelect);

  // Inclinação (migration 066) — mesmo campo/mesma regra da peça-componente
  // (migration 065), só que aqui pro CONJUNTO inteiro (este módulo aninhado
  // inteiro gira como um corpo rígido só, ver js/viewer3d.js resolveContent).
  // Funciona com qualquer Posição (positionSelect acima) — em "Prateleira"
  // mantém o pino/empilhamento automático; em "Peça livre" mantém o
  // Deslocar X/Y/Z manual (caso real do usuário: sapateira posicionada à
  // mão, não empilhada).
  const angleDiv = document.createElement('div');
  angleDiv.style.flex = '1';
  const angleLbl = document.createElement('label');
  angleLbl.style.fontSize = '12px';
  angleLbl.style.marginTop = '0';
  angleLbl.textContent = 'Inclinação (graus)';
  const angleInput = document.createElement('input');
  angleInput.type = 'number';
  angleInput.step = '1';
  angleInput.min = '-60';
  angleInput.max = '60';
  angleInput.style.marginTop = '2px';
  angleInput.disabled = !checkbox.checked;
  angleInput.value = (existingLink && existingLink.tilt_angle_deg) || 0;
  angleInput.title = 'Funciona com qualquer Posição (Prateleira mantém o pino automático; Peça livre mantém o Deslocar X/Y/Z). Positivo = frente mais baixa que o fundo (sapateira).';
  angleDiv.appendChild(angleLbl);
  angleDiv.appendChild(angleInput);

  // Giro de canto (migration 067) — pro CONJUNTO inteiro (este módulo
  // aninhado inteiro gira como corpo rígido, mesmo espírito da Inclinação
  // acima, eixo Y em vez de X). SÓ tem efeito de verdade com Posição =
  // "Peça livre" (troca largura<->profundidade na hora de posicionar — ver
  // js/viewer3d.js placePieceInBox); caso real: módulo em L/canto, o mesmo
  // módulo usado 2x, um deles girado 90° encostado no outro sem lateral.
  const rotYDiv = document.createElement('div');
  rotYDiv.style.flex = '1';
  const rotYLbl = document.createElement('label');
  rotYLbl.style.fontSize = '12px';
  rotYLbl.style.marginTop = '0';
  rotYLbl.textContent = 'Giro (canto)';
  const rotYSelect = document.createElement('select');
  rotYSelect.style.marginTop = '2px';
  rotYSelect.disabled = !checkbox.checked;
  rotYSelect.innerHTML = `
    <option value="0">0° (reto)</option>
    <option value="90">90°</option>
    <option value="180">180°</option>
    <option value="270">270°</option>
  `;
  rotYSelect.value = String((existingLink && existingLink.rotation_y_deg) || 0);
  rotYSelect.title = 'Só funciona de verdade com Posição = "Peça livre" (ex: módulo em L/canto). Troca largura por profundidade na posição, sem mudar como o módulo é construído.';
  rotYDiv.appendChild(rotYLbl);
  rotYDiv.appendChild(rotYSelect);

  roleRow.appendChild(positionDiv);
  roleRow.appendChild(colorDiv);
  roleRow.appendChild(openingDiv);
  roleRow.appendChild(angleDiv);
  roleRow.appendChild(rotYDiv);
  detailsDiv.appendChild(roleRow);

  // Corrediças por unidade — só relevante quando Abertura = "Desliza".
  const slidesDiv = document.createElement('div');
  slidesDiv.style.marginTop = '4px';
  slidesDiv.style.display = openingSelect.value === 'slide_out' ? 'block' : 'none';
  const slidesLbl = document.createElement('label');
  slidesLbl.style.fontSize = '12px';
  slidesLbl.style.marginTop = '0';
  slidesLbl.textContent = 'Corrediças por unidade';
  const slidesInput = document.createElement('input');
  slidesInput.type = 'number';
  slidesInput.min = '0';
  slidesInput.style.marginTop = '2px';
  slidesInput.disabled = !checkbox.checked;
  // BUG (Matt, 2026-08-23: "a frente de gaveta ta cobrando corredica...
  // mas nao consigo zerar"). `existingLink.slides_per_unit || 2` tratava um
  // 0 SALVO DE VERDADE (ex: frente decorativa cuja corrediça já mora no
  // caixote da gaveta, não deve cobrar de novo — ver comentário grande em
  // js/layout-engine.js:1320-1327 sobre o mesmo cuidado) exatamente igual a
  // "nenhum valor ainda", porque 0 é falsy em JS. Resultado: Matt zerava e
  // salvava certinho (confirmado no banco: slides_per_unit=0), mas toda vez
  // que reabria esta linha o campo voltava a MOSTRAR "2" — parecia que
  // nunca tinha zerado. O preço em si já respeitava o 0 (pricing.js:1004,
  // `piece.slides_per_unit > 0`); só a exibição aqui mentia. Fix: só cai no
  // padrão 2 quando não há linha existente ainda (peça nova); uma linha
  // existente com 0 salvo mostra 0.
  slidesInput.value = (existingLink && existingLink.slides_per_unit != null) ? existingLink.slides_per_unit : 2;
  slidesDiv.appendChild(slidesLbl);
  slidesDiv.appendChild(slidesInput);
  detailsDiv.appendChild(slidesDiv);

  openingSelect.addEventListener('change', () => {
    slidesDiv.style.display = openingSelect.value === 'slide_out' ? 'block' : 'none';
    setSaveStatus('Alterações não salvas.', 'unsaved');
    computeModulePieces();
  });

  // Deslocamento — mesmo campo/mesma regra de uma peça-componente.
  const offsetRow = document.createElement('div');
  offsetRow.className = 'row';
  offsetRow.style.marginTop = '4px';

  function makeOffsetField(labelText, existingValue) {
    const div = document.createElement('div');
    div.style.flex = '1';
    const lbl = document.createElement('label');
    lbl.style.fontSize = '12px';
    lbl.style.marginTop = '0';
    lbl.textContent = labelText;
    const input = document.createElement('input');
    input.placeholder = '0';
    input.style.marginTop = '2px';
    input.disabled = !checkbox.checked;
    if (existingValue !== undefined && existingValue !== null && String(existingValue).trim() !== '' && String(existingValue).trim() !== '0') {
      input.value = existingValue;
    }
    div.appendChild(lbl);
    div.appendChild(input);
    return { div, input };
  }

  const offsetXField = makeOffsetField('Posição X (fórmula W,H,D,w,h,d — minúsculo = medida da própria peça) — peça única: absoluta a partir da esquerda; senão: ajuste fino', existingLink && existingLink.offset_x_mm);
  const offsetYField = makeOffsetField('Posição Y (fórmula W,H,D,w,h,d — minúsculo = medida da própria peça; RODAPE = altura do rodapé da casa do cliente, ex: "RODAPE" começa em cima do baseboard) — peça única: absoluta a partir do chão; senão: ajuste fino', existingLink && existingLink.offset_y_mm);
  const offsetZField = makeOffsetField('Posição Z (fórmula W,H,D,w,h,d — minúsculo = medida da própria peça, ex "D-d" encosta na frente) — peça única: absoluta a partir do fundo; senão: ajuste fino', existingLink && existingLink.offset_z_mm);
  offsetRow.appendChild(offsetXField.div);
  offsetRow.appendChild(offsetYField.div);
  offsetRow.appendChild(offsetZField.div);
  detailsDiv.appendChild(offsetRow);

  // Visibilidade condicional (migration 031) — mesmo campo/mesma regra de
  // uma peça-componente (ver renderModuleComponentRow): esta peça-módulo só
  // existe quando a dimensão escolhida do módulo PAI estiver dentro do
  // intervalo mín/máx. Sem dimensão escolhida, sempre visível.
  const visibilityWrap = document.createElement('div');
  visibilityWrap.style.marginTop = '10px';
  const visibilityLbl = document.createElement('label');
  visibilityLbl.style.fontSize = '12px';
  visibilityLbl.style.marginTop = '0';
  visibilityLbl.textContent = 'Condição de visibilidade (opcional)';
  visibilityWrap.appendChild(visibilityLbl);

  const visibilityRow = document.createElement('div');
  visibilityRow.className = 'row';
  visibilityRow.style.marginTop = '2px';

  const visibilityDimDiv = document.createElement('div');
  visibilityDimDiv.style.flex = '1';
  const visibilityDimSelect = document.createElement('select');
  visibilityDimSelect.style.marginTop = '0';
  visibilityDimSelect.disabled = !checkbox.checked;
  visibilityDimSelect.innerHTML = `
    <option value="">Sempre visível (sem condição)</option>
    <option value="W">Largura do módulo (W)</option>
    <option value="H">Altura do módulo (H)</option>
    <option value="D">Profundidade do módulo (D)</option>
  `;
  visibilityDimSelect.value = (existingLink && existingLink.visibility_dimension) || '';
  visibilityDimDiv.appendChild(visibilityDimSelect);

  const visibilityMinDiv = document.createElement('div');
  visibilityMinDiv.style.flex = '1';
  const visibilityMinInput = document.createElement('input');
  visibilityMinInput.type = 'number';
  visibilityMinInput.placeholder = 'Mínimo (mm)';
  visibilityMinInput.style.marginTop = '0';
  visibilityMinInput.disabled = !checkbox.checked || !visibilityDimSelect.value;
  if (existingLink && existingLink.visibility_min_mm !== undefined && existingLink.visibility_min_mm !== null) {
    visibilityMinInput.value = existingLink.visibility_min_mm;
  }
  visibilityMinDiv.appendChild(visibilityMinInput);

  const visibilityMaxDiv = document.createElement('div');
  visibilityMaxDiv.style.flex = '1';
  const visibilityMaxInput = document.createElement('input');
  visibilityMaxInput.type = 'number';
  visibilityMaxInput.placeholder = 'Máximo (mm)';
  visibilityMaxInput.style.marginTop = '0';
  visibilityMaxInput.disabled = !checkbox.checked || !visibilityDimSelect.value;
  if (existingLink && existingLink.visibility_max_mm !== undefined && existingLink.visibility_max_mm !== null) {
    visibilityMaxInput.value = existingLink.visibility_max_mm;
  }
  visibilityMaxDiv.appendChild(visibilityMaxInput);

  visibilityRow.appendChild(visibilityDimDiv);
  visibilityRow.appendChild(visibilityMinDiv);
  visibilityRow.appendChild(visibilityMaxDiv);
  visibilityWrap.appendChild(visibilityRow);

  const visibilityHint = document.createElement('p');
  visibilityHint.className = 'hint';
  visibilityHint.textContent = 'Peça só aparece (preço + 3D) quando a dimensão escolhida do módulo estiver dentro do intervalo. Deixe "Sempre visível" pra nunca esconder (padrão).';
  visibilityWrap.appendChild(visibilityHint);
  detailsDiv.appendChild(visibilityWrap);

  visibilityDimSelect.addEventListener('change', () => {
    visibilityMinInput.disabled = !checkbox.checked || !visibilityDimSelect.value;
    visibilityMaxInput.disabled = !checkbox.checked || !visibilityDimSelect.value;
    setSaveStatus('Alterações não salvas.', 'unsaved');
    computeModulePieces();
  });

  // "Cliente escolhe a quantidade" e "Cliente pode adicionar/remover" — mesmo
  // padrão/mesmo significado de uma peça-componente.
  const qtyConfigWrap = document.createElement('div');
  qtyConfigWrap.style.marginTop = '6px';
  const qtyConfigLabel = document.createElement('label');
  qtyConfigLabel.style.display = 'flex';
  qtyConfigLabel.style.alignItems = 'center';
  qtyConfigLabel.style.gap = '6px';
  qtyConfigLabel.style.fontSize = '12px';
  qtyConfigLabel.style.marginTop = '0';
  const qtyConfigCheckbox = document.createElement('input');
  qtyConfigCheckbox.type = 'checkbox';
  qtyConfigCheckbox.style.width = 'auto';
  qtyConfigCheckbox.checked = !!(existingLink && existingLink.quantity_configurable);
  qtyConfigCheckbox.disabled = !checkbox.checked;
  qtyConfigLabel.appendChild(qtyConfigCheckbox);
  qtyConfigLabel.appendChild(document.createTextNode('Cliente escolhe a quantidade neste módulo'));
  qtyConfigWrap.appendChild(qtyConfigLabel);
  detailsDiv.appendChild(qtyConfigWrap);

  const qtyRangeRow = document.createElement('div');
  qtyRangeRow.className = 'row';
  qtyRangeRow.style.marginTop = '4px';
  qtyRangeRow.style.display = qtyConfigCheckbox.checked ? 'flex' : 'none';

  function makeQtyRangeField(labelText, existingValue) {
    const div = document.createElement('div');
    div.style.flex = '1';
    const lbl = document.createElement('label');
    lbl.style.fontSize = '12px';
    lbl.style.marginTop = '0';
    lbl.textContent = labelText;
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.style.marginTop = '2px';
    input.disabled = !checkbox.checked || !qtyConfigCheckbox.checked;
    if (existingValue !== undefined && existingValue !== null) input.value = existingValue;
    div.appendChild(lbl);
    div.appendChild(input);
    return { div, input };
  }

  const qtyMinField = makeQtyRangeField('Quantidade mínima', existingLink && existingLink.quantity_min);
  const qtyDefaultField = makeQtyRangeField('Quantidade padrão (cliente)', existingLink && existingLink.quantity_default);
  const qtyMaxField = makeQtyRangeField('Quantidade máxima', existingLink && existingLink.quantity_max);
  qtyRangeRow.appendChild(qtyMinField.div);
  qtyRangeRow.appendChild(qtyDefaultField.div);
  qtyRangeRow.appendChild(qtyMaxField.div);
  detailsDiv.appendChild(qtyRangeRow);

  // "Cliente pode configurar as medidas desta peça" (migration 036) — pedido
  // do usuário: um módulo composto de peças-módulo aninhadas (ex: "Painel" =
  // "Painel Ripado" + "Bench Hall 1") só deixava o cliente mexer no W/H/D do
  // módulo PAI; a peça aninhada só media o que a fórmula desta linha
  // calculava a partir disso, sem controle nenhum do cliente sobre ELA. Com
  // isso ligado, o cliente ganha (Passo 2 do portal) um bloco "▸ Configurar
  // <peça>" com sliders PRÓPRIOS de L/A/P só pra esta peça — mesmo padrão de
  // dado do W/H/D do módulo (min/padrão/máx em mm), escopado a este vínculo.
  // Quando ligado, o valor do cliente SUBSTITUI o resultado da fórmula desta
  // peça (mesma regra de "Cliente escolhe a quantidade" acima — o override
  // sempre vale, não é "só se o cliente mexer"), mas a fórmula continua
  // obrigatória no cadastro (usada quando esta opção está DESLIGADA).
  const dimConfigWrap = document.createElement('div');
  dimConfigWrap.style.marginTop = '6px';
  const dimConfigLabel = document.createElement('label');
  dimConfigLabel.style.display = 'flex';
  dimConfigLabel.style.alignItems = 'center';
  dimConfigLabel.style.gap = '6px';
  dimConfigLabel.style.fontSize = '12px';
  dimConfigLabel.style.marginTop = '0';
  const dimConfigCheckbox = document.createElement('input');
  dimConfigCheckbox.type = 'checkbox';
  dimConfigCheckbox.style.width = 'auto';
  dimConfigCheckbox.checked = !!(existingLink && existingLink.client_dimension_configurable);
  dimConfigCheckbox.disabled = !checkbox.checked;
  dimConfigLabel.appendChild(dimConfigCheckbox);
  dimConfigLabel.appendChild(document.createTextNode('Cliente pode configurar as medidas desta peça (sub-configuração)'));
  dimConfigWrap.appendChild(dimConfigLabel);
  detailsDiv.appendChild(dimConfigWrap);

  const dimRangeRow = document.createElement('div');
  dimRangeRow.className = 'row';
  dimRangeRow.style.marginTop = '4px';
  dimRangeRow.style.display = dimConfigCheckbox.checked ? 'flex' : 'none';

  function makeDimRangeField(labelText, existingValue) {
    const div = document.createElement('div');
    div.style.flex = '1';
    const lbl = document.createElement('label');
    lbl.style.fontSize = '12px';
    lbl.style.marginTop = '0';
    lbl.textContent = labelText;
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.style.marginTop = '2px';
    input.disabled = !checkbox.checked || !dimConfigCheckbox.checked;
    if (existingValue !== undefined && existingValue !== null) input.value = existingValue;
    div.appendChild(lbl);
    div.appendChild(input);
    return { div, input };
  }

  const dimWidthMinField = makeDimRangeField('Largura mínima (mm)', existingLink && existingLink.width_min_mm);
  const dimWidthDefaultField = makeDimRangeField('Largura padrão (mm)', existingLink && existingLink.width_default_mm);
  const dimWidthMaxField = makeDimRangeField('Largura máxima (mm)', existingLink && existingLink.width_max_mm);
  dimRangeRow.appendChild(dimWidthMinField.div);
  dimRangeRow.appendChild(dimWidthDefaultField.div);
  dimRangeRow.appendChild(dimWidthMaxField.div);
  detailsDiv.appendChild(dimRangeRow);

  const dimHeightRangeRow = document.createElement('div');
  dimHeightRangeRow.className = 'row';
  dimHeightRangeRow.style.marginTop = '4px';
  dimHeightRangeRow.style.display = dimConfigCheckbox.checked ? 'flex' : 'none';
  const dimHeightMinField = makeDimRangeField('Altura mínima (mm)', existingLink && existingLink.height_min_mm);
  const dimHeightDefaultField = makeDimRangeField('Altura padrão (mm)', existingLink && existingLink.height_default_mm);
  const dimHeightMaxField = makeDimRangeField('Altura máxima (mm)', existingLink && existingLink.height_max_mm);
  dimHeightRangeRow.appendChild(dimHeightMinField.div);
  dimHeightRangeRow.appendChild(dimHeightDefaultField.div);
  dimHeightRangeRow.appendChild(dimHeightMaxField.div);
  detailsDiv.appendChild(dimHeightRangeRow);

  const dimDepthRangeRow = document.createElement('div');
  dimDepthRangeRow.className = 'row';
  dimDepthRangeRow.style.marginTop = '4px';
  dimDepthRangeRow.style.display = dimConfigCheckbox.checked ? 'flex' : 'none';
  const dimDepthMinField = makeDimRangeField('Profundidade mínima (mm)', existingLink && existingLink.depth_min_mm);
  const dimDepthDefaultField = makeDimRangeField('Profundidade padrão (mm)', existingLink && existingLink.depth_default_mm);
  const dimDepthMaxField = makeDimRangeField('Profundidade máxima (mm)', existingLink && existingLink.depth_max_mm);
  dimDepthRangeRow.appendChild(dimDepthMinField.div);
  dimDepthRangeRow.appendChild(dimDepthDefaultField.div);
  dimDepthRangeRow.appendChild(dimDepthMaxField.div);
  detailsDiv.appendChild(dimDepthRangeRow);

  const dimConfigHint = document.createElement('p');
  dimConfigHint.className = 'hint';
  dimConfigHint.textContent = 'Ligado, o cliente vê um bloco "▸ Configurar" só desta peça no Passo 2, com sliders de L/A/P dentro desta faixa. Por padrão a peça continua acompanhando a fórmula acima (ou seja, o módulo pai) — só quando o cliente mexe manualmente num desses sliders é que aquele eixo específico vira fixo (o cliente pode voltar ao automático a qualquer momento). Em branco, sugere automaticamente a Largura/Altura/Profundidade mín/padrão/máx já cadastradas no módulo "' + (childModule.name || '') + '" (editar aqui não muda o cadastro original do módulo, só esta linha).';
  detailsDiv.appendChild(dimConfigHint);

  // Sugere automaticamente as 9 faixas (min/padrão/máx x L/A/P) a partir do
  // PRÓPRIO cadastro do módulo filho (childModule.width_min_mm etc., os
  // mesmos campos que aparecem quando esse módulo é configurado DIRETO,
  // fora de qualquer composição) — só quando os 9 campos ainda estão em
  // branco, pra nunca sobrescrever um valor que o admin já customizou aqui.
  // É só um PONTO DE PARTIDA: gravado em module_components (este vínculo),
  // nunca em modules (o cadastro do módulo filho) — editar aqui não altera
  // o módulo "${childModule.name}" original nem nenhum outro lugar que o
  // reaproveite.
  function prefillDimRangeFromChildModule() {
    const allFields = [dimWidthMinField, dimWidthDefaultField, dimWidthMaxField,
      dimHeightMinField, dimHeightDefaultField, dimHeightMaxField,
      dimDepthMinField, dimDepthDefaultField, dimDepthMaxField];
    const allEmpty = allFields.every((f) => f.input.value === '');
    if (!allEmpty) return;
    if (childModule.width_min_mm !== undefined && childModule.width_min_mm !== null) dimWidthMinField.input.value = childModule.width_min_mm;
    if (childModule.width_default_mm !== undefined && childModule.width_default_mm !== null) dimWidthDefaultField.input.value = childModule.width_default_mm;
    if (childModule.width_max_mm !== undefined && childModule.width_max_mm !== null) dimWidthMaxField.input.value = childModule.width_max_mm;
    if (childModule.height_min_mm !== undefined && childModule.height_min_mm !== null) dimHeightMinField.input.value = childModule.height_min_mm;
    if (childModule.height_default_mm !== undefined && childModule.height_default_mm !== null) dimHeightDefaultField.input.value = childModule.height_default_mm;
    if (childModule.height_max_mm !== undefined && childModule.height_max_mm !== null) dimHeightMaxField.input.value = childModule.height_max_mm;
    if (childModule.depth_min_mm !== undefined && childModule.depth_min_mm !== null) dimDepthMinField.input.value = childModule.depth_min_mm;
    if (childModule.depth_default_mm !== undefined && childModule.depth_default_mm !== null) dimDepthDefaultField.input.value = childModule.depth_default_mm;
    if (childModule.depth_max_mm !== undefined && childModule.depth_max_mm !== null) dimDepthMaxField.input.value = childModule.depth_max_mm;
  }

  dimConfigCheckbox.addEventListener('change', () => {
    if (dimConfigCheckbox.checked) prefillDimRangeFromChildModule();
  });

  // "Cliente pode escolher a cor desta peça separadamente" (migration 046) —
  // pedido do usuário: um módulo pai com 2+ peças-módulo aninhadas usando o
  // MESMO papel de cor (ex: duas caixas internas, ambas papel "Caixa") só
  // deixava trocar a cor das duas JUNTAS (um colorsByRole só pra árvore
  // inteira, ver renderColorRoleSwatchGroups no portal). Ligado aqui, o
  // cliente ganha (Passo 2 do portal) um bloco de swatches PRÓPRIO só pra
  // esta instância — a escolha ali substitui, só pra ela e tudo dentro dela,
  // o valor que viria do módulo pai (ver effectiveColorsForPiece em
  // pricing.js). Sem faixa min/padrão/máx pra configurar aqui (diferente do
  // bloco de medida acima) — as CORES disponíveis já vêm de module_colors do
  // módulo pai, isto só liga/desliga o controle extra no portal.
  const colorConfigWrap = document.createElement('div');
  colorConfigWrap.style.marginTop = '6px';
  const colorConfigLabel = document.createElement('label');
  colorConfigLabel.style.display = 'flex';
  colorConfigLabel.style.alignItems = 'center';
  colorConfigLabel.style.gap = '6px';
  colorConfigLabel.style.fontSize = '12px';
  colorConfigLabel.style.marginTop = '0';
  const colorConfigCheckbox = document.createElement('input');
  colorConfigCheckbox.type = 'checkbox';
  colorConfigCheckbox.style.width = 'auto';
  colorConfigCheckbox.checked = !!(existingLink && existingLink.client_color_configurable);
  colorConfigCheckbox.disabled = !checkbox.checked;
  colorConfigLabel.appendChild(colorConfigCheckbox);
  colorConfigLabel.appendChild(document.createTextNode('Cliente pode escolher a cor desta peça separadamente'));
  colorConfigWrap.appendChild(colorConfigLabel);
  detailsDiv.appendChild(colorConfigWrap);

  const clientOptionalWrap = document.createElement('div');
  clientOptionalWrap.style.marginTop = '6px';
  const clientOptionalLabel = document.createElement('label');
  clientOptionalLabel.style.display = 'flex';
  clientOptionalLabel.style.alignItems = 'center';
  clientOptionalLabel.style.gap = '6px';
  clientOptionalLabel.style.fontSize = '12px';
  clientOptionalLabel.style.marginTop = '0';
  const clientOptionalCheckbox = document.createElement('input');
  clientOptionalCheckbox.type = 'checkbox';
  clientOptionalCheckbox.style.width = 'auto';
  clientOptionalCheckbox.checked = !!(existingLink && existingLink.client_optional);
  clientOptionalCheckbox.disabled = !checkbox.checked;
  clientOptionalLabel.appendChild(clientOptionalCheckbox);
  clientOptionalLabel.appendChild(document.createTextNode('Cliente pode adicionar/remover (opcional)'));
  clientOptionalWrap.appendChild(clientOptionalLabel);
  detailsDiv.appendChild(clientOptionalWrap);

  const defaultOnWrap = document.createElement('div');
  defaultOnWrap.style.marginTop = '4px';
  defaultOnWrap.style.marginLeft = '20px';
  const defaultOnLabel = document.createElement('label');
  defaultOnLabel.style.display = 'flex';
  defaultOnLabel.style.alignItems = 'center';
  defaultOnLabel.style.gap = '6px';
  defaultOnLabel.style.fontSize = '12px';
  defaultOnLabel.style.marginTop = '0';
  const defaultOnCheckbox = document.createElement('input');
  defaultOnCheckbox.type = 'checkbox';
  defaultOnCheckbox.style.width = 'auto';
  defaultOnCheckbox.checked = !!(existingLink && existingLink.client_optional_default_on);
  defaultOnCheckbox.disabled = !checkbox.checked || !clientOptionalCheckbox.checked;
  defaultOnLabel.appendChild(defaultOnCheckbox);
  defaultOnLabel.appendChild(document.createTextNode('Vem marcado por padrão (cliente ainda pode desmarcar e tirar)'));
  defaultOnWrap.appendChild(defaultOnLabel);
  detailsDiv.appendChild(defaultOnWrap);

  function onAnyFieldChange() {
    qtyInput.disabled = !checkbox.checked;
    nameOverrideInput.disabled = !checkbox.checked;
    widthField.input.disabled = !checkbox.checked;
    heightField.input.disabled = !checkbox.checked;
    depthField.input.disabled = !checkbox.checked;
    positionSelect.disabled = !checkbox.checked;
    colorSelect.disabled = !checkbox.checked;
    openingSelect.disabled = !checkbox.checked;
    slidesInput.disabled = !checkbox.checked;
    offsetXField.input.disabled = !checkbox.checked;
    offsetYField.input.disabled = !checkbox.checked;
    offsetZField.input.disabled = !checkbox.checked;
    visibilityDimSelect.disabled = !checkbox.checked;
    visibilityMinInput.disabled = !checkbox.checked || !visibilityDimSelect.value;
    visibilityMaxInput.disabled = !checkbox.checked || !visibilityDimSelect.value;
    qtyConfigCheckbox.disabled = !checkbox.checked;
    qtyRangeRow.style.display = qtyConfigCheckbox.checked ? 'flex' : 'none';
    [qtyMinField.input, qtyDefaultField.input, qtyMaxField.input].forEach((input) => {
      input.disabled = !checkbox.checked || !qtyConfigCheckbox.checked;
    });
    clientOptionalCheckbox.disabled = !checkbox.checked;
    defaultOnCheckbox.disabled = !checkbox.checked || !clientOptionalCheckbox.checked;
    dimConfigCheckbox.disabled = !checkbox.checked;
    dimRangeRow.style.display = dimConfigCheckbox.checked ? 'flex' : 'none';
    dimHeightRangeRow.style.display = dimConfigCheckbox.checked ? 'flex' : 'none';
    dimDepthRangeRow.style.display = dimConfigCheckbox.checked ? 'flex' : 'none';
    [dimWidthMinField.input, dimWidthDefaultField.input, dimWidthMaxField.input,
      dimHeightMinField.input, dimHeightDefaultField.input, dimHeightMaxField.input,
      dimDepthMinField.input, dimDepthDefaultField.input, dimDepthMaxField.input].forEach((input) => {
      input.disabled = !checkbox.checked || !dimConfigCheckbox.checked;
    });
    colorConfigCheckbox.disabled = !checkbox.checked;
    setSaveStatus('Alterações não salvas.', 'unsaved');
    computeModulePieces();
  }

  checkbox.addEventListener('change', () => {
    toggleBtn.style.display = checkbox.checked ? 'inline-block' : 'none';
    detailsDiv.style.display = 'none';
    toggleBtn.textContent = '▸ Configurar';
  });

  toggleBtn.addEventListener('click', () => {
    const isOpen = detailsDiv.style.display !== 'none';
    detailsDiv.style.display = isOpen ? 'none' : 'block';
    toggleBtn.textContent = isOpen ? '▸ Configurar' : '▾ Configurar';
  });

  checkbox.addEventListener('change', onAnyFieldChange);
  qtyInput.addEventListener('input', onAnyFieldChange);
  positionSelect.addEventListener('change', onAnyFieldChange);
  colorSelect.addEventListener('change', onAnyFieldChange);
  rotYSelect.addEventListener('change', onAnyFieldChange);
  slidesInput.addEventListener('input', onAnyFieldChange);
  qtyConfigCheckbox.addEventListener('change', onAnyFieldChange);
  clientOptionalCheckbox.addEventListener('change', onAnyFieldChange);
  defaultOnCheckbox.addEventListener('change', onAnyFieldChange);
  dimConfigCheckbox.addEventListener('change', onAnyFieldChange);
  colorConfigCheckbox.addEventListener('change', onAnyFieldChange);
  [widthField.input, heightField.input, depthField.input, offsetXField.input, offsetYField.input, offsetZField.input,
    qtyMinField.input, qtyDefaultField.input, qtyMaxField.input, visibilityMinInput, visibilityMaxInput,
    dimWidthMinField.input, dimWidthDefaultField.input, dimWidthMaxField.input,
    dimHeightMinField.input, dimHeightDefaultField.input, dimHeightMaxField.input,
    dimDepthMinField.input, dimDepthDefaultField.input, dimDepthMaxField.input, angleInput].forEach((input) => {
    input.addEventListener('input', onAnyFieldChange);
  });

  moduleComponentFieldRefs.push({
    kind: 'module',
    rowId, childModuleId: childModule.id, checkbox, qtyInput, nameOverrideInput, widthField, heightField, depthField,
    positionSelect, colorSelect, openingSelect, slidesInput, angleInput, rotYSelect,
    offsetXField, offsetYField, offsetZField,
    visibilityDimSelect, visibilityMinInput, visibilityMaxInput,
    qtyConfigCheckbox, qtyMinField, qtyDefaultField, qtyMaxField,
    clientOptionalCheckbox, defaultOnCheckbox,
    dimConfigCheckbox, dimWidthMinField, dimWidthDefaultField, dimWidthMaxField,
    dimHeightMinField, dimHeightDefaultField, dimHeightMaxField,
    dimDepthMinField, dimDepthDefaultField, dimDepthMaxField,
    colorConfigCheckbox
  });
  if (insertBeforeEl) container.insertBefore(wrap, insertBeforeEl);
  else container.appendChild(wrap);
}

// Lê o estado ATUAL dos controles na tela (marcado/desmarcado, quantidade,
// overrides de fórmula) — inclusive o que ainda não foi salvo — no mesmo
// formato de "link" que vem do banco, pra usar tanto na prévia quanto no
// salvamento.
// Lê o estado ATUAL dos campos de UMA linha (ref, ver moduleComponentFieldRefs)
// e monta um objeto no mesmo formato de uma linha de `module_components` —
// extraído de collectPendingLinks (mesma lógica campo-a-campo de sempre,
// agora reaproveitada em 2 lugares) pra também servir o botão "+ Duplicar"
// (pedido do usuário 2026-07-26: "quando duplicar um componente quero que
// leve todas as configuracoes originais pro novo componente duplicado") —
// lendo do DOM em vez de moduleComponentLinks (o snapshot do banco), a
// duplicata reflete até edição ainda NÃO salva na linha original.
function buildLinkDataFromRef(ref, sortOrder) {
  const quantityConfigurable = ref.qtyConfigCheckbox.checked;
  const base = {
    // id = identidade da PRÓPRIA LINHA (não do componente/módulo) — ver
    // renderModuleComponentRow/renderModuleNestedRow. Permite salvar via
    // upsert(onConflict:'id') e permite 2+ linhas com o mesmo
    // component_id/child_module_id (migration 025).
    id: ref.rowId,
    sort_order: sortOrder,
    component_id: ref.kind === 'component' ? ref.componentId : null,
    child_module_id: ref.kind === 'module' ? ref.childModuleId : null,
    // Nome customizado desta instância (migration 032) — vazio = null =
    // usa o nome do catálogo/módulo, como sempre.
    reference_override: ref.nameOverrideInput.value.trim() === '' ? null : ref.nameOverrideInput.value.trim(),
    quantity_override: ref.qtyInput.value === '' ? null : parseInt(ref.qtyInput.value, 10),
    width_formula_override: ref.widthField.input.value.trim() === '' ? null : ref.widthField.input.value.trim(),
    height_formula_override: ref.heightField.input.value.trim() === '' ? null : ref.heightField.input.value.trim(),
    depth_formula_override: ref.depthField.input.value.trim() === '' ? null : ref.depthField.input.value.trim(),
    // Deslocamento é uma FÓRMULA (aceita W, H, D) — vazio = "0".
    offset_x_mm: ref.offsetXField.input.value.trim() === '' ? '0' : ref.offsetXField.input.value.trim(),
    offset_y_mm: ref.offsetYField.input.value.trim() === '' ? '0' : ref.offsetYField.input.value.trim(),
    offset_z_mm: ref.offsetZField.input.value.trim() === '' ? '0' : ref.offsetZField.input.value.trim(),
    // Visibilidade condicional (migration 031) — sem dimensão escolhida,
    // grava tudo null (sempre visível). Com dimensão escolhida, min/max
    // em branco viram null individualmente (sem limite naquele lado).
    visibility_dimension: ref.visibilityDimSelect.value || null,
    visibility_min_mm: ref.visibilityDimSelect.value && ref.visibilityMinInput.value !== ''
      ? parseFloat(ref.visibilityMinInput.value) : null,
    visibility_max_mm: ref.visibilityDimSelect.value && ref.visibilityMaxInput.value !== ''
      ? parseFloat(ref.visibilityMaxInput.value) : null,
    // "Cliente escolhe a quantidade" — só faz sentido (e só é gravado)
    // neste vínculo módulo x peça, não no componente/módulo global.
    quantity_configurable: quantityConfigurable,
    quantity_min: quantityConfigurable && ref.qtyMinField.input.value !== '' ? parseInt(ref.qtyMinField.input.value, 10) : null,
    quantity_default: quantityConfigurable && ref.qtyDefaultField.input.value !== '' ? parseInt(ref.qtyDefaultField.input.value, 10) : null,
    quantity_max: quantityConfigurable && ref.qtyMaxField.input.value !== '' ? parseInt(ref.qtyMaxField.input.value, 10) : null,
    // "Cliente pode adicionar/remover" (opcional) — ex: puxador, rodapé,
    // tampo, pé. Também só faz sentido por vínculo módulo x peça.
    client_optional: ref.clientOptionalCheckbox.checked,
    // Só grava true se "opcional" também estiver marcado — evita salvar
    // um "vem marcado por padrão" órfão (sem efeito nenhum) se o admin
    // desmarcar o opcional depois de já ter marcado este.
    client_optional_default_on: ref.clientOptionalCheckbox.checked && ref.defaultOnCheckbox.checked,
    // Junção automática de rodapé (migration 137) — por VÍNCULO módulo x
    // peça (ver comentário grande em renderModuleComponentRow). Guarda
    // defensiva (ref.autoJoinCheckbox &&): ainda não existe em
    // renderModuleNestedRow, então uma peça-módulo aninhada grava null
    // aqui por enquanto (cai no default true de module-pieces.js, mesmo
    // comportamento de uma linha antiga sem o campo).
    auto_join_adjacent: ref.autoJoinCheckbox ? ref.autoJoinCheckbox.checked : null,
    join_max_length_mm: (ref.autoJoinCheckbox && ref.autoJoinCheckbox.checked && ref.joinMaxLenInput && ref.joinMaxLenInput.value !== '')
      ? parseFloat(ref.joinMaxLenInput.value) : null,
    // Suporte de prateleira POR USO (migration 162): '' = null = herda do
    // componente. Peça-módulo aninhada não tem o select -> null.
    drill_shelf_support: (ref.shelfSupportSelect && ref.shelfSupportSelect.value !== '')
      ? ref.shelfSupportSelect.value === 'true' : null
  };
  // position_role/color_role_id/opening_type/slides_per_unit só existem
  // (e só são gravados) numa peça-módulo — peça-componente herda tudo
  // isso de components/component_types, então grava null aqui pra não
  // confundir com um valor que na verdade veio de outro lugar.
  if (ref.kind === 'module') {
    // Sub-configuração de medidas (migration 036) — só existe (e só é
    // gravada) numa peça-módulo, mesmo raciocínio de position_role/cor/
    // abertura logo acima. Campos min/padrão/máx em branco viram null
    // individualmente quando a opção está desligada, igual ao padrão já
    // usado em quantity_min/default/max.
    const dimConfigurable = ref.dimConfigCheckbox.checked;
    return {
      ...base,
      position_role: ref.positionSelect.value || 'other',
      color_role_id: ref.colorSelect.value || (colorRolesCache[0] ? colorRolesCache[0].id : null),
      opening_type: ref.openingSelect.value || 'none',
      slides_per_unit: ref.openingSelect.value === 'slide_out' ? (parseInt(ref.slidesInput.value, 10) || 0) : 0,
      // Inclinação do CONJUNTO (migration 066) — só peça-módulo tem esse
      // campo (peça-componente usa components.tilt_angle_deg, migration 065).
      tilt_angle_deg: parseFloat(ref.angleInput.value) || 0,
      // Giro de canto (migration 067) — mesmo raciocínio de tilt_angle_deg
      // acima, só peça-módulo tem esse campo por vínculo.
      rotation_y_deg: parseInt(ref.rotYSelect.value, 10) || 0,
      client_dimension_configurable: dimConfigurable,
      width_min_mm: dimConfigurable && ref.dimWidthMinField.input.value !== '' ? parseFloat(ref.dimWidthMinField.input.value) : null,
      width_default_mm: dimConfigurable && ref.dimWidthDefaultField.input.value !== '' ? parseFloat(ref.dimWidthDefaultField.input.value) : null,
      width_max_mm: dimConfigurable && ref.dimWidthMaxField.input.value !== '' ? parseFloat(ref.dimWidthMaxField.input.value) : null,
      height_min_mm: dimConfigurable && ref.dimHeightMinField.input.value !== '' ? parseFloat(ref.dimHeightMinField.input.value) : null,
      height_default_mm: dimConfigurable && ref.dimHeightDefaultField.input.value !== '' ? parseFloat(ref.dimHeightDefaultField.input.value) : null,
      height_max_mm: dimConfigurable && ref.dimHeightMaxField.input.value !== '' ? parseFloat(ref.dimHeightMaxField.input.value) : null,
      depth_min_mm: dimConfigurable && ref.dimDepthMinField.input.value !== '' ? parseFloat(ref.dimDepthMinField.input.value) : null,
      depth_default_mm: dimConfigurable && ref.dimDepthDefaultField.input.value !== '' ? parseFloat(ref.dimDepthDefaultField.input.value) : null,
      depth_max_mm: dimConfigurable && ref.dimDepthMaxField.input.value !== '' ? parseFloat(ref.dimDepthMaxField.input.value) : null,
      // "Cliente pode escolher a cor desta peça separadamente" (migration
      // 046) — só existe (e só é gravado) numa peça-módulo, mesmo
      // raciocínio de client_dimension_configurable acima.
      client_color_configurable: ref.colorConfigCheckbox.checked
    };
  }
  // PEÇA-COMPONENTE (migration 105) — position_role e color_role_id DEIXARAM
  // de ser sempre null. Antes eram zerados de propósito ("peça-componente
  // herda tudo de components"), premissa que a linha flatbord inverte: com
  // dois componentes crus, a função tem que vir do USO. Vazio continua
  // gravando null = herda do componente, então módulo antigo não muda nada.
  return {
    ...base,
    position_role: (ref.posSelect && ref.posSelect.value) || null,
    color_role_id: (ref.corSelect && ref.corSelect.value) || null,
    drilling_pattern_id: (ref.furoSelect && ref.furoSelect.value) || null,
    grain_dir: (ref.veioSelect && ref.veioSelect.value) || null,
    // Abertura (27/08) — mesma extensão de position_role/color_role_id
    // acima: em branco (opção "herda do componente") grava null, que o
    // resolvedor trata igual a 'none' (sem abertura) — não existe herança
    // de opening_type do cadastro do componente de verdade (componente cru
    // não tem esse campo), o rótulo só segue o padrão visual dos outros
    // três selects desta linha. slides_per_unit fica 0 aqui de propósito —
    // é custo de ferragem de corrediça (peça-módulo/Construtor cobram isso
    // separado); peça-componente com Abertura="Desliza" hoje é só pra itens
    // sem preço próprio (ex: decoração) ou cuja corrediça já está embutida
    // no preço de outra peça do módulo.
    opening_type: (ref.funcaoOpeningSelect && ref.funcaoOpeningSelect.value) || null,
    slides_per_unit: 0, tilt_angle_deg: null, rotation_y_deg: 0,
    client_dimension_configurable: false,
    width_min_mm: null, width_default_mm: null, width_max_mm: null,
    height_min_mm: null, height_default_mm: null, height_max_mm: null,
    depth_min_mm: null, depth_default_mm: null, depth_max_mm: null,
    // "Cliente pode escolher a cor desta peça separadamente" (migration
    // 046, generalizado pra peça-folha 2026-07-19) — aqui SIM existe pra
    // peça-componente (diferente de client_dimension_configurable acima,
    // que continua só pra peça-módulo).
    client_color_configurable: ref.colorConfigCheckbox.checked
  };
}

function collectPendingLinks() {
  // Ordem de exibição (setas ▲▼, ver moveModulePieceRow) — lida direto do
  // DOM (wrap.dataset.rowId, na ordem visual atual dos '.module-piece-row')
  // em vez de qualquer array em memória, já que mover uma linha só mexe no
  // DOM. Linhas fora do container (não deveria acontecer) ficam com
  // sort_order 0 — não quebra nada, só não fica na posição "certa".
  const listContainer = document.getElementById('module-components-list');
  const sortOrderByRowId = new Map();
  if (listContainer) {
    Array.from(listContainer.children)
      .filter((el) => el.classList && el.classList.contains('module-piece-row'))
      .forEach((el, index) => sortOrderByRowId.set(el.dataset.rowId, index));
  }

  return moduleComponentFieldRefs
    .filter((ref) => ref.checkbox.checked)
    .map((ref) => buildLinkDataFromRef(ref, sortOrderByRowId.has(ref.rowId) ? sortOrderByRowId.get(ref.rowId) : 0));
}

function setSaveStatus(text, kind) {
  const el = document.getElementById('module-components-save-status');
  if (!el) return;
  el.textContent = text;
  el.style.color = kind === 'unsaved' ? '#b45309' : (kind === 'error' ? '#b91c1c' : (kind === 'saved' ? '#15803d' : ''));
}

document.getElementById('module-components-save-btn').addEventListener('click', async () => {
  if (!selectedModuleId) return;
  setSaveStatus('Salvando...', '');

  const pending = collectPendingLinks();

  // Migration 025: o mesmo componente/módulo pode ter várias LINHAS no mesmo
  // módulo (posições diferentes) — a identidade de cada linha é o próprio
  // "id" (não mais component_id/child_module_id, que deixaram de ser únicos).
  // Uma linha some do banco quando seu id não aparece mais no que está
  // marcado na tela agora (checkbox desmarcado ou linha removida).
  const pendingIds = new Set(pending.map((p) => p.id));
  const toDeleteIds = moduleComponentLinks
    .filter((l) => !pendingIds.has(l.id))
    .map((l) => l.id);

  // Valida as fórmulas de deslocamento (aceitam W, H, D) antes de gravar,
  // usando as medidas padrão do módulo como teste — mesmo espírito da
  // validação de fórmula no cadastro de componente.
  const module = modulesCache.find((m) => m.id === selectedModuleId);
  const testDims = {
    W: (module && module.width_default_mm) || 800,
    H: (module && module.height_default_mm) || 2000,
    D: (module && module.depth_default_mm) || 560
  };
  for (const p of pending) {
    const label = p.component_id
      ? ((componentsCache.find((x) => x.id === p.component_id) || {}).reference || p.component_id)
      : ((modulesCache.find((x) => x.id === p.child_module_id) || {}).name || p.child_module_id);
    // Peça-módulo exige fórmula de L/A/P preenchida (não é "override" de
    // nada — é a única fonte de dimensão dela, ver comentário na migration
    // 023 e em renderModuleNestedRow).
    if (p.child_module_id && (!p.width_formula_override || !p.height_formula_override || !p.depth_formula_override)) {
      setSaveStatus(`Preencha as 3 fórmulas (largura/altura/profundidade) do módulo aninhado "${label}" — são obrigatórias.`, 'error');
      return;
    }
    try {
      // Deslocamento também aceita w/h/d minúsculo (dimensão RESOLVIDA da
      // PRÓPRIA peça — mesma convenção de area_m2_formula/edge_band_linear_m_
      // formula), pra fórmulas tipo "D-d" (encosta na frente do vão, ver
      // client.js/portal.js resolvePiecesForViewer). Pra peça-módulo, calcula
      // o teste de w/h/d a partir das PRÓPRIAS fórmulas de L/A/P dela (o que
      // já valida essas 3 fórmulas também, substituindo as chamadas
      // separadas que existiam aqui antes). Pra peça-componente (sem L/A/P
      // próprias cadastradas neste vínculo), usa W/H/D do módulo como valor
      // de teste — só precisa ser um número válido pra fórmula não quebrar
      // por "variável desconhecida", não precisa ser a medida real.
      let testPieceW = testDims.W, testPieceH = testDims.H, testPieceD = testDims.D;
      if (p.child_module_id) {
        // Só faz sentido validar aqui porque, pra peça-módulo, essas
        // fórmulas são obrigatórias e sempre estão preenchidas neste ponto.
        testPieceW = Pricing.evalFormula(p.width_formula_override, testDims);
        testPieceH = Pricing.evalFormula(p.height_formula_override, testDims);
        testPieceD = Pricing.evalFormula(p.depth_formula_override, testDims);
      }
      // N/COUNT (2026-07-15) — mesmas variáveis novas de resolvePiecesForViewer
      // (deslocamento por cópia, quantidade configurável); aqui é só validação
      // de fórmula antes de salvar, então usa valores de teste quaisquer
      // (N=1, COUNT=1) só pra "N"/"COUNT" não estourar "variável desconhecida".
      const offsetTestVars = { ...testDims, w: testPieceW, h: testPieceH, d: testPieceD, N: 1, COUNT: 1 };
      Pricing.evalFormula(p.offset_x_mm, offsetTestVars);
      Pricing.evalFormula(p.offset_y_mm, offsetTestVars);
      Pricing.evalFormula(p.offset_z_mm, offsetTestVars);
    } catch (err) {
      setSaveStatus(`Fórmula inválida em "${label}": ${err.message}`, 'error');
      return;
    }
  }

  // Se "cliente escolhe a quantidade" estiver marcado neste módulo, exige um
  // intervalo válido (mín ≤ padrão ≤ máx) — mesma validação que existia
  // antes no cadastro global do componente, agora por vínculo módulo x peça.
  for (const p of pending) {
    if (!p.quantity_configurable) continue;
    const label = p.component_id
      ? ((componentsCache.find((x) => x.id === p.component_id) || {}).reference || p.component_id)
      : ((modulesCache.find((x) => x.id === p.child_module_id) || {}).name || p.child_module_id);
    if ([p.quantity_min, p.quantity_default, p.quantity_max].some((v) => v === null || isNaN(v))) {
      setSaveStatus(`Preencha quantidade mínima, padrão e máxima em "${label}" (marcado como "cliente escolhe a quantidade").`, 'error');
      return;
    }
    if (!(p.quantity_min <= p.quantity_default && p.quantity_default <= p.quantity_max)) {
      setSaveStatus(`O intervalo de quantidade de "${label}" precisa respeitar mínima ≤ padrão ≤ máxima.`, 'error');
      return;
    }
  }

  // Mesma validação acima, agora pra "cliente pode configurar as medidas
  // desta peça" (migration 036) — só existe em peça-módulo, um intervalo
  // válido por eixo (L, A e P, cada um mín ≤ padrão ≤ máx).
  for (const p of pending) {
    if (!p.client_dimension_configurable) continue;
    const label = (modulesCache.find((x) => x.id === p.child_module_id) || {}).name || p.child_module_id;
    const axes = [
      ['Largura', p.width_min_mm, p.width_default_mm, p.width_max_mm],
      ['Altura', p.height_min_mm, p.height_default_mm, p.height_max_mm],
      ['Profundidade', p.depth_min_mm, p.depth_default_mm, p.depth_max_mm]
    ];
    for (const [axisLabel, min, def, max] of axes) {
      if ([min, def, max].some((v) => v === null || isNaN(v))) {
        setSaveStatus(`Preencha ${axisLabel.toLowerCase()} mínima, padrão e máxima em "${label}" (marcado como "cliente pode configurar as medidas").`, 'error');
        return;
      }
      if (!(min <= def && def <= max)) {
        setSaveStatus(`O intervalo de ${axisLabel.toLowerCase()} de "${label}" precisa respeitar mínima ≤ padrão ≤ máxima.`, 'error');
        return;
      }
    }
  }

  try {
    if (toDeleteIds.length > 0) {
      const { error } = await supabaseClient.from('module_components').delete()
        .eq('module_id', selectedModuleId).in('id', toDeleteIds);
      if (error) throw error;
    }
    // Upsert único por "id" (a PK de cada linha) — migration 025 removeu as
    // unique constraints de module_id+component_id/child_module_id que
    // antes exigiam um upsert separado por tipo de peça; agora um só
    // onConflict:'id' cobre componente e módulo aninhado ao mesmo tempo,
    // inclusive quando há 2+ linhas repetindo o mesmo componente/módulo.
    if (pending.length > 0) {
      const { error } = await supabaseClient.from('module_components').upsert(
        pending.map((p) => ({ module_id: selectedModuleId, ...p })),
        { onConflict: 'id' }
      );
      if (error) throw error;
    }
    await renderModuleComponentsList(); // recarrega do banco -> essa vira a nova linha de base
    setSaveStatus('Salvo.', 'saved');
  } catch (err) {
    setSaveStatus('Erro ao salvar: ' + (err.message || err), 'error');
  }
});

// Carrega recursivamente as peças de um módulo (e seus módulos aninhados,
// em qualquer profundidade) DIRETO DO BANCO — usado só pra resolver as
// peças de um módulo aninhado (child_module_id), já que a composição do
// módulo FILHO é editada em outra hora (quando ele mesmo é selecionado
// aqui), não na tela do módulo PAI que está sendo editado agora. Devolve o
// formato de "peça" que Pricing.calculateAssembly espera (ver pricing.js:
// leaf comum, ou is_module=true com child_pieces).
async function loadRecursivePieces(moduleId) {
  const { data: links, error } = await supabaseClient
    .from('module_components')
    .select('id, component_id, child_module_id, quantity_override, width_formula_override, height_formula_override, depth_formula_override, quantity_configurable, quantity_min, quantity_max, quantity_default, client_optional, client_optional_default_on, position_role, color_role_id, opening_type, slides_per_unit, visibility_dimension, visibility_min_mm, visibility_max_mm, reference_override, drilling_pattern_id, grain_dir, tilt_angle_deg, rotation_y_deg, usinagem_m, auto_join_adjacent, join_max_length_mm, drill_shelf_support, components(*, labor_types(*), component_types(*))')
    .eq('module_id', moduleId);
  if (error) { console.error(error); return []; }

  const pieces = [];
  for (const link of (links || [])) {
    if (link.component_id) {
      const component = link.components;
      if (!component || !component.active) continue;
      const quantity = (link.quantity_override !== null && link.quantity_override !== undefined) ? link.quantity_override : component.quantity;
      const labor_cost_per_unit = component.labor_types ? component.labor_types.price_per_unit : 0;
      const color_role_id = component.component_types ? component.component_types.color_role_id : null;
      pieces.push({
        ...component,
        // id vira o da LINHA (module_components.id), não o do catálogo —
        // migration 025 permite repetir o mesmo componente em 2+ linhas do
        // mesmo módulo; se piece.id ficasse com o id do catálogo, as duas
        // instâncias colidiriam em qualquer lógica keyed por id (shelfQuantities,
        // caixinha de opcional marcada) mesmo sendo posições diferentes.
        id: link.id,
        // Nome customizado desta instância (migration 032) — ver mesmo
        // comentário em loadRecursivePiecesForModule.
        reference: link.reference_override || component.reference,
        quantity, labor_cost_per_unit, color_role_id,
        width_formula: link.width_formula_override || component.width_formula,
        height_formula: link.height_formula_override || component.height_formula,
        depth_formula: link.depth_formula_override || component.depth_formula,
        quantity_configurable: !!link.quantity_configurable,
        quantity_min: link.quantity_min, quantity_max: link.quantity_max, quantity_default: link.quantity_default,
        client_optional: !!link.client_optional,
        visibility_dimension: link.visibility_dimension || null,
        visibility_min_mm: link.visibility_min_mm,
        visibility_max_mm: link.visibility_max_mm,
        is_module: false
      });
    } else if (link.child_module_id) {
      const childModule = modulesCache.find((m) => m.id === link.child_module_id);
      const fixedDepths = await fetchModuleFixedDepths(link.child_module_id);
      const childPieces = await loadRecursivePieces(link.child_module_id);
      pieces.push({
        id: link.id,
        reference: link.reference_override || (childModule ? childModule.name : 'Módulo removido'),
        module_name: childModule ? childModule.name : 'Módulo removido',
        is_module: true,
        position_role: link.position_role || 'other',
        color_role_id: link.color_role_id || null,
        opening_type: link.opening_type || 'none',
        slides_per_unit: link.slides_per_unit || 0,
        tilt_angle_deg: link.tilt_angle_deg || 0, // migration 066 — inclinação do conjunto (só 'shelf')
        rotation_y_deg: link.rotation_y_deg || 0, // migration 067 — giro de canto do conjunto (só 'free')
        width_formula: link.width_formula_override,
        height_formula: link.height_formula_override,
        depth_formula: link.depth_formula_override,
        quantity: (link.quantity_override !== null && link.quantity_override !== undefined) ? link.quantity_override : 1,
        quantity_configurable: !!link.quantity_configurable,
        quantity_min: link.quantity_min, quantity_max: link.quantity_max, quantity_default: link.quantity_default,
        client_optional: !!link.client_optional,
        visibility_dimension: link.visibility_dimension || null,
        visibility_min_mm: link.visibility_min_mm,
        visibility_max_mm: link.visibility_max_mm,
        fixed_depths: fixedDepths,
        child_pieces: childPieces
      });
    }
  }
  return pieces;
}

// Resolve as peças marcadas na tela (mesmo o que ainda não foi salvo) numa
// lista de "peças efetivas" no formato que o motor de cálculo espera —
// componentes viram peça-folha (igual sempre foi); módulos aninhados viram
// peça is_module=true com child_pieces resolvidas RECURSIVAMENTE a partir do
// que já está salvo no banco pro módulo filho (ver loadRecursivePieces).
// Assíncrona porque resolver um módulo aninhado exige buscar no banco — usada
// só pra prévia (teste de cálculo), não depende de nada estar salvo no NÍVEL
// atual (module_id = selectedModuleId).
async function computeModulePieces() {
  const pending = collectPendingLinks();
  const resolved = [];
  for (const link of pending) {
    if (link.component_id) {
      const component = componentsCache.find((c) => c.id === link.component_id);
      if (!component) continue;
      const quantity = (link.quantity_override !== null && link.quantity_override !== undefined)
        ? link.quantity_override
        : component.quantity;
      const labor_cost_per_unit = component.labor_types ? component.labor_types.price_per_unit : 0;
      // Papel de cor vem do tipo do componente (migration 035), não mais de
      // um campo manual por componente.
      const color_role_id = component.component_types ? component.component_types.color_role_id : null;
      // Fórmula de L/A/P: usa o override deste módulo se existir, senão a
      // fórmula padrão do componente.
      const width_formula = link.width_formula_override || component.width_formula;
      const height_formula = link.height_formula_override || component.height_formula;
      const depth_formula = link.depth_formula_override || component.depth_formula;
      resolved.push({
        ...component,
        // id = id da LINHA (link.id), não do catálogo — ver mesmo comentário
        // em loadRecursivePieces (migration 025: instâncias repetidas do
        // mesmo componente não podem colidir em shelfQuantities/opcionais).
        id: link.id,
        // Nome customizado desta instância (migration 032).
        reference: link.reference_override || component.reference,
        quantity, labor_cost_per_unit, color_role_id, width_formula, height_formula, depth_formula,
        quantity_configurable: !!link.quantity_configurable,
        quantity_min: link.quantity_min,
        quantity_max: link.quantity_max,
        quantity_default: link.quantity_default,
        client_optional: !!link.client_optional,
        visibility_dimension: link.visibility_dimension || null,
        visibility_min_mm: link.visibility_min_mm,
        visibility_max_mm: link.visibility_max_mm,
        is_module: false
      });
    } else if (link.child_module_id) {
      const childModule = modulesCache.find((m) => m.id === link.child_module_id);
      const fixedDepths = await fetchModuleFixedDepths(link.child_module_id);
      const childPieces = await loadRecursivePieces(link.child_module_id);
      resolved.push({
        id: link.id,
        reference: link.reference_override || (childModule ? childModule.name : 'Módulo removido'),
        module_name: childModule ? childModule.name : 'Módulo removido',
        is_module: true,
        position_role: link.position_role || 'other',
        color_role_id: link.color_role_id || null,
        opening_type: link.opening_type || 'none',
        slides_per_unit: link.slides_per_unit || 0,
        tilt_angle_deg: link.tilt_angle_deg || 0, // migration 066 — inclinação do conjunto (só 'shelf')
        rotation_y_deg: link.rotation_y_deg || 0, // migration 067 — giro de canto do conjunto (só 'free')
        width_formula: link.width_formula_override,
        height_formula: link.height_formula_override,
        depth_formula: link.depth_formula_override,
        quantity: (link.quantity_override !== null && link.quantity_override !== undefined) ? link.quantity_override : 1,
        quantity_configurable: !!link.quantity_configurable,
        quantity_min: link.quantity_min,
        quantity_max: link.quantity_max,
        quantity_default: link.quantity_default,
        client_optional: !!link.client_optional,
        visibility_dimension: link.visibility_dimension || null,
        visibility_min_mm: link.visibility_min_mm,
        visibility_max_mm: link.visibility_max_mm,
        fixed_depths: fixedDepths,
        child_pieces: childPieces
      });
    }
  }
  modulePieces = resolved;

  renderTestCalcShelfInputs();
  renderTestCalcOptionalInputs();
  runTestCalculation();
}
