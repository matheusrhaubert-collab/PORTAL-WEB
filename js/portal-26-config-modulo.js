// ==========================================================================
// CONFIGURADOR DO NEW QUOTE ("2. Configure...") COM O MESMO MOTOR DO PROJETOS
// (2026-10-24)
// ==========================================================================
// Matt: "ao selecionar um módulo em new quote ele fica sem as portas e
// frentes". A família NEW Classic Kitchens traz porta/gaveta/prateleira na
// ÁRVORE DE FÁBRICA (module_layout_nodes, params.fabrica = true — migrations
// 208-217), não em module_components. Só o Projetos aplicava essa árvore
// (applyProjectFactoryLayout, portal-07); o configurador de 1 módulo e o
// atalho "Select a reference" do New Quote só liam module_components — o
// módulo saía caixa pura no 3D, no preço, na miniatura e no PEDIDO (a
// fábrica receberia sem porta).
//
// Em vez de duplicar o motor, o configurador agora monta um SLOT do Projetos
// "de mentira" (quoteSlot, nunca entra em projectSlots) e passa por
// recomputeProjectSlotPricing — o mesmo funil do Projetos: árvore de
// fábrica, modelo de porta/gaveta, lado da porta (pieceAdjustments),
// furação real e ferragem no preço. Pedido grava `layout` (geometria
// congelada, o que o ERP fura/corta), `piece_adjustments` e
// `drawer_model_id`, igual o envio do Projetos (portal-08).
//
// Também mora aqui o PAINEL DE OPÇÕES do 3D (Matt, mesmo dia: "um ícone do
// lado pra configurar quantidade de prateleiras, giro da porta, modelo da
// porta, modelo da gaveta").
// ==========================================================================

let quoteSlot = null;      // slot sintético do configurador (null = caminho antigo)
let quoteSlotSeq = 0;      // só pra dar id único a cada slot sintético
let quotePrepareToken = 0; // corrida entre cliques seguidos em módulos diferentes

function quoteDefaultDim(m, ax) {
  return clamp(Number(m[ax + '_default_mm'] || 0), Number(m[ax + '_min_mm'] || 0), Number(m[ax + '_max_mm'] || Infinity));
}

// Monta o slot sintético de UM módulo. `cfg` = o que o chamador já tem
// carregado (peças cruas, opções de cor, medidas...). Devolve o slot já
// precificado (slot.result) ou lança se nem isso deu.
async function buildQuoteSlot(cfg) {
  const m = cfg.module;
  const colorOptionsByRole = Object.assign({}, cfg.colorOptionsByRole || {});
  const colorsByRole = Object.assign({}, cfg.colorsByRole || {});
  collectUsedColorRoleIds(cfg.pieces || []).forEach((roleId) => {
    if (!colorsByRole[roleId] && (colorOptionsByRole[roleId] || []).length) colorsByRole[roleId] = colorOptionsByRole[roleId][0];
  });
  const slot = {
    id: '__quote__' + (++quoteSlotSeq),
    _quote: true,
    module: m,
    pieces: cfg.pieces || [],
    colorOptionsByRole,
    colorsByRole,
    selectedColors: [],
    pieceColorOverrides: cfg.pieceColorOverrides || {},
    hingeModel: cfg.hingeModel || null,
    slideModel: cfg.slideModel || null,
    width_mm: cfg.width_mm != null ? cfg.width_mm : quoteDefaultDim(m, 'width'),
    height_mm: cfg.height_mm != null ? cfg.height_mm : quoteDefaultDim(m, 'height'),
    depth_mm: cfg.depth_mm != null ? cfg.depth_mm : quoteDefaultDim(m, 'depth'),
    shelfQuantities: cfg.shelfQuantities || {},
    dimOverrides: cfg.dimOverrides || {},
    selectedOptionalIds: cfg.selectedOptionalIds || [],
    removedPieceIds: [],
    ledConfigs: {},
    pieceAdjustments: {},
    layout: null,
    layoutPieces: [],
    doorModelId: null,
    drawerModelId: null
  };
  // Catálogo de agregados (porta de giro do cadastro também depende dele pro
  // modelo de porta) e a corrediça própria do módulo — o Projetos carrega
  // isso em segundo plano e repreça os SEUS slots quando chega; aqui o slot
  // não está em projectSlots, então espera antes de precificar.
  try { await ensureAccessoryCatalog(); } catch (e) { /* segue sem agregado */ }
  if (typeof projectOwnHingeSlideCache !== 'undefined' && !projectOwnHingeSlideCache[m.id]
    && typeof fetchModuleOwnHingeAndSlideModels === 'function') {
    try { projectOwnHingeSlideCache[m.id] = (await fetchModuleOwnHingeAndSlideModels(m.id)) || { hinge: null, slide: null, slides: [] }; }
    catch (e) { /* preço cai no slideModel do slot */ }
  }
  try { await Promise.all([ensureProjectDoorModels(), ensureProjectDrawerModels()]); } catch (e) { /* sem modelos */ }
  let temFabrica = false;
  try { temFabrica = await applyProjectFactoryLayout(slot); } catch (e) { console.warn('[configurador] interior de fábrica', e); }
  if (!temFabrica) recomputeProjectSlotPricing(slot);   // lança se o preço falhar
  else if (!slot.result) recomputeProjectSlotPricing(slot);
  return slot;
}

// Peças que o 3D/miniatura desenham (cadastro + árvore + modelos + ajustes).
function quoteSlotViewerPieces(slot) {
  return projectSlotEffectivePieces(slot);
}

// Papéis de cor que o configurador mostra: os do cadastro + os da árvore de
// fábrica / modelo de porta (ex.: Porta/Frente emprestado, Vidro, Perfil).
function quoteSlotUsedRoleIds(basePieces) {
  const ids = collectUsedColorRoleIds(basePieces || []);
  if (quoteSlot) {
    try { collectUsedColorRoleIds(quoteSlotViewerPieces(quoteSlot)).forEach((id) => ids.add(id)); } catch (e) { /* ok */ }
  }
  return ids;
}

// Chamado por selectModule (portal-01) com as peças/cores do módulo já
// carregadas. Publica as opções de cor que a árvore/modelo trouxeram em
// moduleColorsByRole (global do configurador) pra os swatches existirem.
async function prepareQuoteSlotForCurrentModule() {
  quoteSlot = null;
  renderQuoteOptionsPanel();
  if (!currentModule) return;
  const token = ++quotePrepareToken;
  const mod = currentModule;
  let slot = null;
  try {
    slot = await buildQuoteSlot({
      module: mod,
      pieces,
      colorOptionsByRole: moduleColorsByRole,
      selectedOptionalIds: Array.from(selectedOptionalComponentIds || [])
    });
  } catch (e) {
    console.warn('[configurador] slot do módulo não montou, segue o caminho antigo:', e);
    slot = null;
  }
  if (token !== quotePrepareToken || currentModule !== mod) return;
  quoteSlot = slot;
  if (slot) {
    Object.keys(slot.colorOptionsByRole || {}).forEach((roleId) => {
      if (!(moduleColorsByRole[roleId] || []).length) moduleColorsByRole[roleId] = slot.colorOptionsByRole[roleId];
    });
  }
  renderQuoteOptionsPanel();
}

// Sincroniza o slot com o que está na tela e recalcula. Devolve null se o
// slot não serve (aí recalculatePreview segue o caminho antigo).
function syncQuoteSlotFromConfigurator(st) {
  const s = quoteSlot;
  if (!s || !currentModule || s.module.id !== currentModule.id) return null;
  s.width_mm = st.width_mm; s.height_mm = st.height_mm; s.depth_mm = st.depth_mm;
  // Cores escolhidas na tela por cima das que o slot adotou sozinho (papel
  // emprestado/modelo que ainda não tem swatch fica com a 1ª opção).
  s.colorsByRole = Object.assign({}, s.colorsByRole || {}, st.colorsByRole || {});
  s.hingeModel = st.hingeModel; s.slideModel = st.slideModel;
  s.shelfQuantities = st.shelfQuantities || {};
  s.dimOverrides = st.dimOverrides || {};
  s.pieceColorOverrides = st.pieceColorOverrides || {};
  s.selectedOptionalIds = st.selectedOptionalIds || [];
  recomputeProjectSlotPricing(s);   // lança se o preço falhar (quem chama mostra)
  return s;
}

function quoteSlotSelectedColors(colorsByRole) {
  return Object.keys(colorsByRole || {}).filter((roleId) => colorsByRole[roleId]).map((roleId) => ({
    role_id: roleId,
    role_name: (colorRolesCache.find((r) => r.id === roleId) || {}).name || null,
    color_id: colorsByRole[roleId].id || null,
    color_name: colorsByRole[roleId].name || null
  }));
}

// Campos extras do order_item (mesmo formato do envio do Projetos, portal-08).
// `src` = lastItemResult ou um slot da Composição. Sem nada disso = {} e o
// payload fica idêntico ao de antes.
function quoteOrderItemExtras(src) {
  if (!src) return {};
  const out = {};
  if (src.layoutGeometry) out.layout = src.layoutGeometry;
  if (src.pieceAdjustments && Object.keys(src.pieceAdjustments).length) out.piece_adjustments = src.pieceAdjustments;
  if (src.drawerModelId) out.drawer_model_id = src.drawerModelId;
  return out;
}

// Snapshot do slot pro lastItemResult (o que os botões de adicionar gravam).
function quoteSlotSnapshot(s) {
  if (!s) return {};
  return {
    layout: s.layout ? JSON.parse(JSON.stringify(s.layout)) : null,
    layoutGeometry: s._layoutGeometry || null,
    layoutPieces: s.layoutPieces || [],
    pieceAdjustments: Object.assign({}, s.pieceAdjustments || {}),
    doorModelId: s.doorModelId || null,
    drawerModelId: s.drawerModelId || null,
    viewerPieces: quoteSlotViewerPieces(s)
  };
}

// ==========================================================================
// PAINEL DE OPÇÕES DO 3D (ícone ao lado do desenho)
// ==========================================================================

// Vãos com prateleira regulável da árvore (ou que podem ganhar uma: vão com
// porta e sem nada dentro). Cada um vira um contador.
function quoteRegulavelAccId() {
  const cat = accessoryCatalogCache || {};
  const ids = Object.keys(cat).filter((k) => cat[k] && cat[k].prateleira_regulavel);
  return ids.find((k) => cat[k].slug === 'prat_regulavel') || ids[0] || null;
}
function quoteShelfZones(slot) {
  const out = [];
  if (!slot || !slot.layout) return out;
  const reg = quoteRegulavelAccId();
  if (!reg) return out;
  const folhaVazia = (n) => !(n.children || []).length && !n.content && !(n.fronts || []).length && !n.splitAxis;
  (function anda(n) {
    if (!n) return;
    const filhos = n.children || [];
    if (n.splitAxis === 'y' && n.splitAcc === reg && filhos.length && filhos.every(folhaVazia)) {
      out.push({ node: n, qtd: filhos.length - 1 });
      return;
    }
    // vão com porta e vazio por dentro (ex.: aéreo baixo, 0 prateleira)
    if (!n.splitAxis && !filhos.length && !n.content && (n.fronts || []).length) {
      out.push({ node: n, qtd: 0 });
      return;
    }
    filhos.forEach(anda);
  })(slot.layout);
  return out;
}
function setQuoteShelfCount(slot, nodeId, qtd) {
  const reg = quoteRegulavelAccId();
  if (!slot || !slot.layout || !reg) return;
  const n = (function acha(x) {
    if (!x) return null;
    if (x.id === nodeId) return x;
    for (const c of (x.children || [])) { const r = acha(c); if (r) return r; }
    return null;
  })(slot.layout);
  if (!n) return;
  qtd = Math.max(0, Math.min(8, Math.round(qtd)));
  if (qtd === 0) {
    n.splitAxis = null; n.splitAcc = null; n.children = [];
  } else {
    n.splitAxis = 'y'; n.splitAcc = reg;
    n.children = [];
    for (let i = 0; i <= qtd; i++) {
      n.children.push({ id: n.id + '-p' + i, splitAxis: null, splitAcc: null, sizeMode: 'fill', sizeValue: null,
        content: null, fronts: [], params: {}, locked: false, children: [] });
    }
  }
}

function quoteOptionsIconSvg() {
  return `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    <line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/>
    <circle cx="9" cy="7" r="2" fill="var(--panel, #fff)"/><circle cx="15" cy="12" r="2" fill="var(--panel, #fff)"/><circle cx="8" cy="17" r="2" fill="var(--panel, #fff)"/></svg>`;
}

function quoteOptionsPanelHtml(slot) {
  let html = '';
  // Prateleiras — da árvore de fábrica
  const zonas = quoteShelfZones(slot);
  if (zonas.length) {
    const linhas = zonas.map((z, i) => `<div class="po-qopt-shelf-row">
      ${zonas.length > 1 ? `<span>${I18n.t('qopt.shelves_zone', { n: i + 1 })}</span>` : '<span></span>'}
      <span class="po-qopt-stepper">
        <button type="button" class="po-qopt-shelf-btn" data-node="${z.node.id}" data-qtd="${z.qtd - 1}" ${z.qtd <= 0 ? 'disabled' : ''}>−</button>
        <b>${z.qtd}</b>
        <button type="button" class="po-qopt-shelf-btn" data-node="${z.node.id}" data-qtd="${z.qtd + 1}" ${z.qtd >= 8 ? 'disabled' : ''}>+</button>
      </span></div>`).join('');
    html += `<div class="po-qopt-section"><span class="po-proj-config-section-label">${I18n.t('qopt.shelves_label')}</span>${linhas}</div>`;
  }
  // Prateleiras — do cadastro (quantity_configurable): os inputs de sempre
  // (po-shelf-quantities-wrap) são movidos pra dentro do painel no init.
  if (pieces.some((p) => p.quantity_configurable)) html += '<div class="po-qopt-section" data-slot="shelf-catalog"></div>';
  // Giro da porta
  const lado = (typeof projectDoorSideBlock === 'function') ? projectDoorSideBlock(slot) : '';
  if (lado) html += `<div class="po-qopt-section">${lado}</div>`;
  // Modelo de porta
  if (projectSlotHasPortaGiro(slot) && (projectDoorModelsCache || []).length > 1) {
    const atual = projectSlotDoorModel(slot);
    const cards = projectDoorModelsCache.map((dm) => {
      const ehFlat = !dm.child_module_id || dm.slug === 'flat';
      const id = ehFlat ? null : dm.id;
      const sel = (atual ? atual.id : null) === id;
      return `<button type="button" class="po-proj-door-model-card po-qopt-door-model${sel ? ' selected' : ''}" data-id="${id || ''}" title="${dm.name}">
        ${projectDoorModelPreviewSvg(dm.preview || (ehFlat ? 'flat' : 'shaker'))}<span>${dm.name}</span></button>`;
    }).join('');
    html += `<div class="po-qopt-section"><span class="po-proj-config-section-label">${I18n.t('project.door_model_label')}</span><div class="po-proj-door-model-cards">${cards}</div><p class="hint po-qopt-aviso" style="display:none;"></p></div>`;
  }
  // Modelo de gaveta
  if (projectSlotHasDrawerBody(slot) && (projectDrawerModelsCache || []).length > 1) {
    const atual = projectSlotDrawerModel(slot);
    const cards = projectDrawerModelsCache.map((gm) => {
      const ehPadrao = !gm.child_module_id;
      const id = ehPadrao ? null : gm.id;
      const sel = (atual ? atual.id : null) === id;
      return `<button type="button" class="po-proj-door-model-card po-proj-drawer-model-card po-qopt-drawer-model${sel ? ' selected' : ''}" data-id="${id || ''}" title="${gm.name}">
        ${projectDrawerModelPreviewSvg(gm.preview || (ehPadrao ? 'standard' : 'dovetail'))}<span>${gm.name}</span></button>`;
    }).join('');
    html += `<div class="po-qopt-section"><span class="po-proj-config-section-label">${I18n.t('project.drawer_model_label')}</span><div class="po-proj-door-model-cards">${cards}</div></div>`;
  }
  // ÍCONE DO CATÁLOGO (25/10, Matt: "o ícone dos drawers com cooktop quero
  // que mostre o cooktop"). O "Gerar imagem 3D" do ERP só monta as peças do
  // cadastro — não aplica o interior de fábrica (gavetas, portas, trash) da
  // NEW Classic, e a foto saía só com a caixa. Aqui o 3D JÁ está montado com
  // tudo, então o administrador grava este desenho como ícone do card.
  if (quoteIconeAdmin()) {
    html += `<div class="po-qopt-section"><span class="po-proj-config-section-label">${I18n.t('qopt.icon_label')}</span>
      <button type="button" class="po-qopt-icone-btn">${I18n.t('qopt.icon_btn')}</button><p class="hint po-qopt-icone-status">${quoteIconeMsg && quoteIconeMsg.mod === (currentModule && currentModule.id) ? quoteIconeMsg.txt : ''}</p></div>`;
  }
  return html;
}
let quoteIconeMsg = null; // última mensagem do botão (o painel é redesenhado no meio)
function quoteIconeAdmin() {
  return typeof currentUserProfile !== 'undefined' && currentUserProfile && currentUserProfile.role === 'administrador';
}
// Mesmo enquadramento do ERP (refit + tightFrame + traço grosso), PNG recortado
// e reduzido pra no máximo 360 px — o card mostra pequeno.
async function quoteSalvarIconeModulo(statusEl) {
  const s = quoteSlot, mod = currentModule;
  if (!s || !mod || !quoteIconeAdmin()) return;
  const status = (t) => {
    quoteIconeMsg = { mod: mod.id, txt: t };
    const el = document.querySelector('.po-qopt-icone-status') || statusEl;
    if (el) el.textContent = t;
  };
  status(I18n.t('qopt.icon_saving'));
  const estiloAnt = (typeof Viewer3D.getDrawStyle === 'function') ? Viewer3D.getDrawStyle() : null;
  const projAnt = (typeof Viewer3D.getProjectionMode === 'function') ? Viewer3D.getProjectionMode() : 'perspective';
  let raw = null;
  try {
    const parts = resolvePiecesForViewer(quoteSlotViewerPieces(s), { W: s.width_mm, H: s.height_mm, D: s.depth_mm },
      s.colorsByRole, s.shelfQuantities, s.dimOverrides, s.pieceColorOverrides);
    if (typeof Viewer3D.setDrawStyle === 'function') Viewer3D.setDrawStyle({ contorno: 'grosso' });
    // visão PARALELA (Matt 25/10: "troca visão perspectiva por paralela")
    if (typeof Viewer3D.setProjectionMode === 'function') Viewer3D.setProjectionMode('orthographic');
    Viewer3D.update({ width_mm: s.width_mm, height_mm: s.height_mm, depth_mm: s.depth_mm, parts, refit: true, tightFrame: true });
    if (typeof Viewer3D.waitForPendingTextures === 'function') await Viewer3D.waitForPendingTextures();
    raw = Viewer3D.snapshot();
  } catch (e) {
    console.error('[ícone do módulo]', e);
  } finally {
    if (estiloAnt && typeof Viewer3D.setDrawStyle === 'function') Viewer3D.setDrawStyle(estiloAnt);
    if (typeof Viewer3D.setProjectionMode === 'function') Viewer3D.setProjectionMode(projAnt || 'perspective');
    viewer3dNeedsRefit = true;
    try { recalculatePreview(); } catch (e) { /* volta ao normal no próximo clique */ }
  }
  if (!raw) { status(I18n.t('qopt.icon_error')); return; }
  let png = await trimTransparentPng(raw);
  png = await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 360 / Math.max(img.naturalWidth, img.naturalHeight));
      if (k >= 1) { resolve(png); return; }
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = () => resolve(png);
    img.src = png;
  });
  const { error } = await supabaseClient.from('modules').update({ thumbnail_data_url: png }).eq('id', mod.id);
  if (error) { status(I18n.t('qopt.icon_error') + ' ' + error.message); return; }
  mod.thumbnail_data_url = png;
  const naLista = (typeof allModules !== 'undefined' && allModules) ? allModules.find((m) => m.id === mod.id) : null;
  if (naLista) naLista.thumbnail_data_url = png;
  try { if (typeof renderModuleGallery === 'function') renderModuleGallery(); } catch (e) { /* card atualiza no próximo carregamento */ }
  status(I18n.t('qopt.icon_saved'));
}

function renderQuoteOptionsPanel() {
  const btn = document.getElementById('po-qopt-btn');
  const panel = document.getElementById('po-qopt-panel');
  const body = document.getElementById('po-qopt-body');
  if (!btn || !panel || !body) return;
  const shelfWrap = document.getElementById('po-shelf-quantities-wrap');
  // devolve os inputs de prateleira do cadastro pro lugar-parking antes de refazer o HTML
  const parking = document.getElementById('po-qopt-parking');
  if (shelfWrap && parking && shelfWrap.parentElement !== parking) parking.appendChild(shelfWrap);
  let html = '';
  try { html = currentModule ? quoteOptionsPanelHtml(quoteSlot) : ''; } catch (e) { console.warn('[opções do 3D]', e); html = ''; }
  body.innerHTML = html;
  const vagaCatalogo = body.querySelector('[data-slot="shelf-catalog"]');
  if (vagaCatalogo && shelfWrap) vagaCatalogo.appendChild(shelfWrap);
  btn.style.display = html ? '' : 'none';
  if (!html) panel.classList.remove('open');

  const reprocessar = () => { renderQuoteOptionsPanel(); recalculatePreview(); };
  body.querySelectorAll('.po-qopt-shelf-btn').forEach((el) => el.addEventListener('click', () => {
    setQuoteShelfCount(quoteSlot, el.dataset.node, Number(el.dataset.qtd));
    reprocessar();
  }));
  const iconeBtn = body.querySelector('.po-qopt-icone-btn');
  if (iconeBtn) iconeBtn.addEventListener('click', async () => {
    iconeBtn.disabled = true;
    try { await quoteSalvarIconeModulo(body.querySelector('.po-qopt-icone-status')); } finally { iconeBtn.disabled = false; }
  });
  body.querySelectorAll('.po-proj-door-leaves-btn').forEach((el) => el.addEventListener('click', () => {
    if (el.classList.contains('selected') || !quoteSlot) return;
    if (setSlotDoorLeavesChoice(quoteSlot, el.dataset.node, Number(el.dataset.front) || 0, Number(el.dataset.n))) reprocessar();
  }));
  body.querySelectorAll('.po-proj-door-side-toggle').forEach((el) => el.addEventListener('click', () => {
    const s = quoteSlot;
    if (!s) return;
    const todos = Object.assign({}, s.pieceAdjustments || {});
    todos[el.dataset.pieceId] = Object.assign({}, todos[el.dataset.pieceId] || {}, { hinge: el.dataset.side });
    s.pieceAdjustments = todos;
    reprocessar();
  }));
  body.querySelectorAll('.po-qopt-door-model').forEach((el) => el.addEventListener('click', async () => {
    if (!quoteSlot || el.classList.contains('selected')) return;
    el.disabled = true;
    const r = await setProjectSlotDoorModel(quoteSlot, el.dataset.id || null, { lote: true });
    if (r === 'bloq') {
      el.disabled = false;
      const a = body.querySelector('.po-qopt-aviso');
      if (a) { a.textContent = I18n.t('qopt.door_model_blocked'); a.style.display = 'block'; }
      return;
    }
    Object.keys(quoteSlot.colorOptionsByRole || {}).forEach((roleId) => {
      if (!(moduleColorsByRole[roleId] || []).length) moduleColorsByRole[roleId] = quoteSlot.colorOptionsByRole[roleId];
    });
    refreshQuoteColorSwatches();
    reprocessar();
  }));
  body.querySelectorAll('.po-qopt-drawer-model').forEach((el) => el.addEventListener('click', async () => {
    if (!quoteSlot || el.classList.contains('selected')) return;
    el.disabled = true;
    await setProjectSlotDrawerModel(quoteSlot, el.dataset.id || null, { lote: true });
    reprocessar();
  }));
}

// Modelo de porta pode trazer papel de cor novo (Vidro, Perfil alumínio):
// redesenha os grupos de swatches mantendo as cores já escolhidas.
function refreshQuoteColorSwatches() {
  if (typeof renderColorRoleSwatchGroups !== 'function') return;
  const preset = {};
  Object.keys(selectedColorIdByRole || {}).forEach((roleId) => { preset[roleId] = { id: selectedColorIdByRole[roleId] }; });
  renderColorRoleSwatchGroups(preset);
}

(function initQuoteOptionsPanel() {
  const btn = document.getElementById('po-qopt-btn');
  const panel = document.getElementById('po-qopt-panel');
  if (!btn || !panel) return;
  btn.innerHTML = quoteOptionsIconSvg();
  btn.addEventListener('click', () => panel.classList.toggle('open'));
  const fechar = document.getElementById('po-qopt-close');
  if (fechar) fechar.addEventListener('click', () => panel.classList.remove('open'));
})();

// Fim de recalculatePreview (portal-01) pelo slot: 3D + preço + lastItemResult.
// Mesma saída do caminho antigo, com os campos extras do slot no
// lastItemResult (layout/ajustes/modelos) pros botões de adicionar gravarem.
function recalculatePreviewFromQuoteSlot(st) {
  const s = quoteSlot;
  let erroPreco = null;
  try { syncQuoteSlotFromConfigurator(st); } catch (e) { erroPreco = e; }

  try {
    const parts = resolvePiecesForViewer(
      quoteSlotViewerPieces(s), { W: s.width_mm, H: s.height_mm, D: s.depth_mm },
      s.colorsByRole, s.shelfQuantities, s.dimOverrides, s.pieceColorOverrides
    );
    Viewer3D.update({ width_mm: s.width_mm, height_mm: s.height_mm, depth_mm: s.depth_mm, parts,
      refit: viewer3dNeedsRefit, floor_height_mm: currentFloorHeightMm });
    viewer3dNeedsRefit = false;
  } catch (err) { /* sem 3D a calculadora continua normal */ }

  if (erroPreco || !s.result) {
    showError(I18n.t('step2.price_calc_error', { msg: (erroPreco && erroPreco.message) || '?' }));
    document.getElementById('po-price-section').style.display = 'none';
    lastItemResult = null;
    return;
  }
  const result = s.result;
  const colorsByRole = Object.assign({}, s.colorsByRole);
  lastItemResult = Object.assign({
    result, colorsByRole, selectedColors: quoteSlotSelectedColors(colorsByRole),
    hingeModel: st.hingeModel, slideModel: st.slideModel,
    shelfQuantities: st.shelfQuantities, dimOverrides: st.dimOverrides, pieceColorOverrides: st.pieceColorOverrides,
    selectedOptionalIds: st.selectedOptionalIds,
    width_mm: s.width_mm, height_mm: s.height_mm, depth_mm: s.depth_mm
  }, quoteSlotSnapshot(s));
  try { syncUntouchedPieceDimSliders(result.breakdown); } catch (e) { /* ok */ }
  document.getElementById('po-item-price').textContent = currentModule.is_decoration
    ? I18n.t('decor.not_included')
    : '$' + (isSellerAccount() ? getDisplayPrice(result.total) : result.total).toFixed(2);
  const itemVwEl = document.getElementById('po-item-volume-weight');
  if (itemVwEl) itemVwEl.textContent = currentModule.is_decoration ? '' : formatVolumeWeight(result.breakdown, undefined, colorsByRole);
  document.getElementById('po-price-section').style.display = 'block';
}

// ==========================================================================
// MODO APLICATIVO SÓ PRA ADMINISTRADOR (2026-10-24)
// ==========================================================================
// Matt: "pode subir o modo aplicativo, deixa só como administrador". O
// Chrome/Edge só oferecem "Instalar" quando a página tem <link rel=
// "manifest">. Ele saiu do portal.html e entra aqui, depois do login, se
// is_admin() (a mesma checagem de servidor da moderação da Galeria) disser
// que sim. Quem já instalou continua abrindo — só a oferta de instalar some
// pros outros.
(function attachAdminAppManifest() {
  if (typeof supabaseClient === 'undefined' || !supabaseClient.auth) return;
  let feito = false;
  window.LEGNO_IS_ADMIN = false;
  const confere = async (session) => {
    if (!session) { window.LEGNO_IS_ADMIN = false; return; }
    try {
      const { data: ehAdmin, error } = await supabaseClient.rpc('is_admin');
      // Flag global de administrador — também trava a aba $ Fábrica
      // (portal-06b moneyFabricaBloqueada).
      window.LEGNO_IS_ADMIN = !error && ehAdmin === true;
      const modal = document.getElementById('po-money-modal');
      if (modal && modal.classList.contains('open') && typeof renderMoneyModal === 'function') renderMoneyModal();
      if (error || ehAdmin !== true || feito) return;
      feito = true;
      if (document.querySelector('link[rel="manifest"]')) return;
      const link = document.createElement('link');
      link.rel = 'manifest';
      link.href = 'manifest.webmanifest';
      document.head.appendChild(link);
    } catch (e) { /* sem manifest = sem instalar, nada quebra */ }
  };
  try {
    supabaseClient.auth.getSession().then(({ data }) => confere(data && data.session)).catch(() => {});
    supabaseClient.auth.onAuthStateChange((_ev, session) => { confere(session); });
  } catch (e) { /* ok */ }
})();
