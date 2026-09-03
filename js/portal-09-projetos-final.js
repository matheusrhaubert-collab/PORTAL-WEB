// portal-09-projetos-final.js — parte 9/9 (ÚLTIMO — tem que ser o ÚLTIMO
// <script> a carregar) de js/portal.js (ver portal-01-core-catalogo.js).
// Salvar projeto, favoritos de projeto, totais, geração de imagem por IA a
// partir de um Projeto, modal de login/logout, tooltip de peça — e, no fim
// do arquivo, o BOOT do portal inteiro ((async function init(){...})()):
// inicializa o Viewer3D e decide tela logada/deslogada. Só roda depois que
// TODOS os outros 8 arquivos já carregaram (é por isso que tem que ser o
// último <script> no portal.html).

// ==========================================================================
// SALVAR PROJETO NA BARRA DE AÇÕES (2026-08-16)
// ==========================================================================
// Matt: "aqui nao quero enviar direto pra ordem, quero salvar projeto
// primeiro". O "💾 Salvar projeto" existia só no painel lateral, longe do
// "Enviar pro pedido" — dava pra mandar pro pedido sem nunca ter salvo.
//
// DELEGA, não duplica: no clique ele aciona o botão real do painel. Toda a
// regra de "projeto novo x projeto carregado" (loadedProjectFavorite, nome,
// thumbnail, foto realista) mora lá e continua num lugar só — copiar a
// chamada aqui é como as telas de furação divergirem, erro que esta base já
// pagou caro.
//
// O RÓTULO SEGUE O ESTADO: com um projeto carregado ele vira "Salvar
// alterações", igual ao do painel. refreshProjectFavoriteButtons chama isto.
function syncProjToolbarSaveButton() {
  const barra = document.getElementById('po-proj-toolbar-save-btn');
  if (!barra) return;
  // Só o RÓTULO troca de texto (2026-09-02: o botão virou ícone 💾 + <span>,
  // pra poder encolher só pro ícone em tela estreita — ver
  // #po-proj-canvas-tools .po-tb-seg-btn span no CSS). Escrever em
  // barra.textContent como antes apagaria o ícone junto.
  const label = document.getElementById('po-proj-toolbar-save-label') || barra;
  const updateBtn = document.getElementById('po-proj-update-fav-btn');
  const editando = updateBtn && updateBtn.style.display !== 'none' && updateBtn.textContent;
  label.textContent = editando ? updateBtn.textContent : I18n.t('project.save_label');
}

function bindProjToolbarSaveButton() {
  const barra = document.getElementById('po-proj-toolbar-save-btn');
  if (!barra || barra.dataset.bound) return;
  barra.dataset.bound = '1';
  barra.addEventListener('click', () => {
    const updateBtn = document.getElementById('po-proj-update-fav-btn');
    // Projeto carregado da lista: "Salvar alterações" (atualiza o registro).
    // Projeto novo: "Salvar projeto" (cria). É a mesma escolha que ele faria
    // no painel, sem obrigá-lo a abrir o painel.
    if (updateBtn && updateBtn.style.display !== 'none') { updateBtn.click(); return; }
    const saveBtn = document.getElementById('po-proj-save-fav-btn');
    if (saveBtn) saveBtn.click();
  });
  syncProjToolbarSaveButton();
}

// Indicador PERSISTENTE de salvo/não salvo, ao lado do botão da barra de
// ferramentas (Matt, 2026-08-28: "deixa um verdinho dizendo que o projeto ta
// salvo, e se alterei alguma coisa sai o verde... pra eu saber se ta salvo ou
// nao"). Diferente de #po-proj-fav-status — aquele span é uma mensagem de
// alguns segundos que some sozinha (setTimeout) e é reaproveitado por vários
// fluxos (salvar projeto, salvar peça do Construtor...); este aqui fica
// ligado o tempo todo, refletindo `projectDirty` ao vivo, sem timeout nenhum.
//
// forceState opcional ('saving') pra cobrir a JANELA ASSÍNCRONA do próprio
// salvar (entre o clique e a resposta do banco) — sem isso o indicador
// ficaria mostrando "não salvo" (vazio) até a resposta chegar, mesmo com o
// salvamento já em andamento. Sem argumento, deriva o estado direto de
// projectDirty (o caso normal: toda mutação do projeto passa por
// markProjectDirty, ver portal-06a-projetos-canvas-core.js).
function refreshProjectSaveIndicator(forceState) {
  const el = document.getElementById('po-proj-save-indicator');
  if (!el) return;
  const state = forceState || ((typeof projectDirty !== 'undefined' && projectDirty) ? 'dirty' : 'saved');
  el.classList.remove('is-saved', 'is-saving');
  if (state === 'saving') {
    el.classList.add('is-saving');
    el.textContent = I18n.t('project.save_indicator_saving');
  } else if (state === 'saved') {
    el.classList.add('is-saved');
    el.textContent = I18n.t('project.save_indicator_saved');
  } else {
    el.textContent = ''; // 'dirty' — nada a mostrar, é o próprio sumiço do verde que avisa
  }
}

function refreshProjectFavoriteButtons() {
  const updateBtn = document.getElementById('po-proj-update-fav-btn');
  // Grade de fotos realistas salvas (migration 077) segue o projeto
  // "amarrado" na tela — mesmos 3 pontos que chamam esta função (salvou
  // novo, restaurou da lista, excluiu o carregado) precisam recarregar.
  refreshProjectPhotorealGallery();
  if (!updateBtn) return;
  if (loadedProjectFavorite) {
    updateBtn.textContent = I18n.t('fav.update_btn', { name: loadedProjectFavorite.name });
    updateBtn.style.display = 'inline-block';
  } else {
    updateBtn.style.display = 'none';
  }
  syncProjToolbarSaveButton();
}

// Miniatura do PROJETO INTEIRO (todas as paredes juntas), pra mostrar na
// lista "Meus Projetos" (pedido do usuário 2026-08-02: "preciso o 3d...
// quadrado para cada pedido" — hoje só existe thumbnail POR MÓDULO dentro de
// slots, não do projeto todo). Mesma técnica de
// generateAiPreviewForProjectGallery/publishProjectToGallery:
// renderProjectForAiSnapshot() monta uma cena "limpa" (sem cotas/ambiente
// decorativo) e funciona mesmo com o canvas #po-proj-3d-canvas escondido
// (display:none não impede o WebGL de renderizar pro buffer — só afeta o
// que aparece na tela; ver comentário de fallback de tamanho em
// viewer3d_composition.js/init). SEMPRE restaura a cena normal depois
// (generateProject3D()), mesmo em erro — nunca deixa o "Visualizar 3D" da
// sessão do usuário mostrando a versão "limpa" por engano.
async function captureProjectThumbnail() {
  if (!projectSlots.length) return null;
  const usedCleanScene = renderProjectForAiSnapshot();
  try {
    if (!ViewerProject || !ViewerProject.snapshot) return null;
    const snapshotOptions = getProjectWallCount() > 1 ? { angle: 'corner' } : { frontal: true };
    const raw = ViewerProject.snapshot(snapshotOptions);
    return raw ? await trimTransparentPng(raw) : null;
  } catch (e) {
    return null; // sem miniatura nunca deve travar o "Salvar"
  } finally {
    if (usedCleanScene) generateProject3D();
  }
}

// Trava de reentrância do salvar (BUG corrigido 2026-08-08, relato do usuário:
// "coloquei gerar imagem realista sem salvar, ele pediu pra salvar 2x, gerou 2
// projetos iguais"). Salvar é uma sequência LONGA e assíncrona — captura da
// miniatura 3D + cálculo do valor + insert — com um prompt() de nome no meio.
// Qualquer segundo disparo nessa janela (toque duplicado no iPad, clique
// impaciente, ou um segundo caminho de código chamando a mesma função) entrava
// em paralelo, cada um com seu prompt, e cada um fazia o SEU insert: dois
// projetos idênticos no banco. A trava é global (e não só um `disabled` no
// botão) porque a função tem mais de um chamador — o botão Salvar, o botão
// Atualizar e o fluxo da foto realista.
let projectSaveInFlight = false;

async function saveProjectFavorite(overwriteId) {
  if (projectSaveInFlight) return;
  projectSaveInFlight = true;
  try {
    await saveProjectFavoriteInner(overwriteId);
  } finally {
    projectSaveInFlight = false;
  }
}

async function saveProjectFavoriteInner(overwriteId) {
  const statusEl = document.getElementById('po-proj-fav-status');
  const errorEl = document.getElementById('po-proj-error');
  errorEl.style.display = 'none';
  statusEl.textContent = '';
  if (!currentUser) {
    errorEl.textContent = I18n.t('fav.need_login');
    errorEl.style.display = 'block';
    return;
  }
  if (projectSlots.length === 0) {
    errorEl.textContent = I18n.t('project.need_slots');
    errorEl.style.display = 'block';
    return;
  }
  refreshProjectSaveIndicator('saving');
  try {
    // wall_width_mm (coluna antiga, só 1 número) continua gravada com a
    // largura da parede 'main' pra qualquer projeto salvo antes desta
    // funcionalidade que ainda dependa dela — wall_shape/wall_widths_mm
    // (migration 058) é quem manda de verdade a partir de agora.
    const mainWidthMm = getProjectWallWidthMm(Math.max(getProjectWallRoles().indexOf('main'), 0));
    // Miniatura automática (ver captureProjectThumbnail acima) — só entra no
    // payload se REALMENTE capturou algo; se falhar (sem 3D disponível etc.),
    // não sobrescreve com null uma miniatura boa que já estava salva.
    const thumbnailDataUrl = await captureProjectThumbnail();
    // Valor cacheado (migration 076) — calculado AGORA, no salvar, pra o
    // card de "Meus Projetos" mostrar direto sem recalcular a lista toda
    // (pedido do usuário 2026-08-03). skipped>0 → não grava (valor parcial
    // fixo seria mentira; card recalcula em background até resolver).
    // Se a migration 076 ainda não rodou, o update/insert com a coluna
    // falharia e DERRUBARIA o salvar inteiro — por isso o retry sem a
    // coluna no catch mais abaixo.
    const slotsPayload = serializeProjectSlots();
    let cachedValueUsd = null;
    try {
      const r = await computeProjectSlotsTotal(slotsPayload);
      if (r && r.skipped === 0) cachedValueUsd = r.total;
    } catch (e) { /* sem cache — card recalcula em background */ }
    const basePayload = {
      slots: slotsPayload,
      wall_width_mm: mainWidthMm,
      wall_shape: projectWallShape,
      wall_widths_mm: projectWallWidthsMm,
      // Paredes desenhadas (2026-08-13). Vai junto com as antigas de propósito:
      // projeto salvo no modelo velho continua abrindo pelo caminho de sempre,
      // e projeto novo ignora as duas de cima. Cabe no jsonb que já existe.
      wall_segments: projectWallSegments.length ? projectWallSegments : null,
      ...(thumbnailDataUrl ? { thumbnail_data_url: thumbnailDataUrl } : {}),
      ...(cachedValueUsd !== null ? { cached_value_usd: cachedValueUsd } : {})
    };
    // Roda a operação; se falhar POR CAUSA de uma coluna que ainda não existe
    // no banco (migration pendente), TIRA essa coluna do payload e tenta de
    // novo — uma por vez, até passar. Salvar projeto nunca pode quebrar por
    // causa de um campo acessório: o essencial (slots + paredes) tem que ir
    // pro banco mesmo com o schema atrasado. Era só cached_value_usd
    // (migration 076); em 2026-08-14 o wall_segments (migration 100) caiu no
    // mesmo buraco e derrubou o salvar inteiro com "Could not find the
    // 'wall_segments' column of 'user_projects' in the schema cache"
    // (PGRST204) — daí a lista, em vez de um if por coluna.
    const OPTIONAL_COLUMNS = ['wall_segments', 'cached_value_usd', 'thumbnail_data_url'];
    const runWithCacheFallback = async (op) => {
      let payload = basePayload;
      let res = await op(payload);
      for (let i = 0; i < OPTIONAL_COLUMNS.length; i++) {
        if (!res.error) break;
        const msg = res.error.message || '';
        const missing = OPTIONAL_COLUMNS.find((c) => (c in payload) && msg.includes(c));
        if (!missing) break;
        payload = { ...payload };
        delete payload[missing];
        res = await op(payload);
      }
      return res;
    };
    if (overwriteId) {
      const { error } = await runWithCacheFallback((payload) => supabaseClient
        .from('user_projects')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', overwriteId));
      if (error) throw error;
      statusEl.textContent = I18n.t('project.updated_status', { name: loadedProjectFavorite ? loadedProjectFavorite.name : '' });
    } else {
      const name = (prompt(I18n.t('project.name_prompt'), I18n.t('project.default_name')) || '').trim();
      if (!name) return;
      const { data, error } = await runWithCacheFallback((payload) => supabaseClient
        .from('user_projects')
        .insert({ client_user_id: currentUser.id, name, ...payload })
        .select('id, name')
        .single());
      if (error) throw error;
      loadedProjectFavorite = { id: data.id, name: data.name, ai_preview_url: null };
      statusEl.textContent = I18n.t('project.saved_status');
    }
    refreshProjectFavoriteButtons();
    projectDirty = false; // acabou de salvar — pedido do usuário 2026-07-29 ("preciso... uma mensagem salvar alteracoes")
    refreshProjectSaveIndicator();
    setTimeout(() => { statusEl.textContent = ''; }, 4000);
  } catch (err) {
    errorEl.textContent = err.message || String(err);
    errorEl.style.display = 'block';
    refreshProjectSaveIndicator(); // salvar falhou — sai do "Salvando…", volta a refletir projectDirty (continua true)
  }
}

bindProjToolbarSaveButton();
const projSaveFavBtn = document.getElementById('po-proj-save-fav-btn');
if (projSaveFavBtn) projSaveFavBtn.addEventListener('click', () => saveProjectFavorite(null));
const projUpdateFavBtn = document.getElementById('po-proj-update-fav-btn');
if (projUpdateFavBtn) {
  projUpdateFavBtn.addEventListener('click', () => {
    if (loadedProjectFavorite) saveProjectFavorite(loadedProjectFavorite.id);
  });
}

// Grid de cards quadrados (pedido do usuário 2026-08-02: "essa tela ta
// muito baguncada... quer mais alinhados, quadrado para cada pedido") —
// mesmo padrão visual de .po-gallery-card (Galeria pública), só com a
// imagem em 1:1 em vez de 4:3 e um "split" quando o projeto tem os DOIS
// tipos de imagem (thumbnail_data_url = snapshot 3D automático, ver
// captureProjectThumbnail; ai_preview_url = última imagem de IA publicada,
// ver publishProjectToGallery) — "ambos pra dar zoom se precisar" veio
// literal: os dois ficam visíveis e cada um abre sozinho no lightbox
// (openGalleryLightbox, reaproveitado da Galeria).
// Recalcula o preço total de um projeto salvo SEM carregá-lo no editor —
// usado só pra mostrar o valor no card da lista "Meus Projetos" (pedido do
// usuário 2026-08-02). Reaproveita a mesma lógica de precificação de
// restoreFavoriteProject (busca colors/hinge/slide em lote, Pricing.
// calculateModulePrice por slot) mas SEM montar os slots completos pro
// canvas/3D — só soma result.total. Sequencial de propósito, mesmo motivo de
// restoreFavoriteProject: loadModuleColors mexe no global moduleColorsByRole.
async function computeProjectSlotsTotal(slotConfigs) {
  if (!Array.isArray(slotConfigs) || slotConfigs.length === 0) return { total: 0, skipped: 0 };
  if (!allModules.length) await loadModules();
  const pieceColorOverrideColorIds = slotConfigs.flatMap((s) =>
    Object.values(s.piece_color_overrides || {}).flatMap((perRole) => Object.values(perRole).map((e) => e.color_id))
  );
  const colorIds = [...new Set(
    slotConfigs.flatMap((s) => (s.selected_colors || []).map((c) => c.color_id))
      .concat(pieceColorOverrideColorIds)
      .filter(Boolean)
  )];
  const hingeIds = [...new Set(slotConfigs.map((s) => s.hinge_model_id).filter(Boolean))];
  const slideIds = [...new Set(slotConfigs.map((s) => s.slide_model_id).filter(Boolean))];
  const [colorsRes, hingeRes, slideRes] = await Promise.all([
    colorIds.length ? supabaseClient.from('colors').select('*').in('id', colorIds) : { data: [] },
    hingeIds.length ? supabaseClient.from('hinge_models').select('*').in('id', hingeIds) : { data: [] },
    slideIds.length ? supabaseClient.from('slide_models').select('*').in('id', slideIds) : { data: [] }
  ]);
  const colorById = new Map((colorsRes.data || []).map((c) => [c.id, c]));
  const hingeById = new Map((hingeRes.data || []).map((h) => [h.id, h]));
  const slideById = new Map((slideRes.data || []).map((s) => [s.id, s]));

  let total = 0;
  let skipped = 0;
  for (const cfg of slotConfigs) {
    const module = allModules.find((m) => m.id === cfg.module_id);
    if (!module) { skipped += 1; continue; }
    try {
      const piecesList = await loadRecursivePiecesForModule(module.id);
      if (!piecesList || piecesList.length === 0) { skipped += 1; continue; }
      const optionalIds = cfg.selected_optional_ids || [];
      const removedIds = cfg.removed_piece_ids || [];
      const effectivePieces = piecesList
        .filter((p) => !p.client_optional || optionalIds.includes(p.id))
        .filter((p) => !removedIds.includes(p.id));
      await loadModuleColors(module.id); // preenche moduleColorsByRole pra ESTE módulo, igual restoreFavoriteProject
      const colorsByRole = {};
      (cfg.selected_colors || []).forEach((sc) => {
        const color = colorById.get(sc.color_id);
        if (color) colorsByRole[sc.role_id] = color;
      });
      collectUsedColorRoleIds(effectivePieces).forEach((roleId) => {
        if (colorsByRole[roleId]) return;
        const fallback = (moduleColorsByRole[roleId] || [])[0];
        if (fallback) colorsByRole[roleId] = fallback;
      });
      const hingeModel = cfg.hinge_model_id ? (hingeById.get(cfg.hinge_model_id) || null) : null;
      const slideModel = cfg.slide_model_id ? (slideById.get(cfg.slide_model_id) || null) : null;
      const pieceColorOverrides = {};
      Object.keys(cfg.piece_color_overrides || {}).forEach((pieceId) => {
        const perRole = cfg.piece_color_overrides[pieceId];
        const resolved = {};
        Object.keys(perRole).forEach((roleId) => {
          const color = colorById.get(perRole[roleId].color_id);
          if (color) resolved[roleId] = color;
        });
        if (Object.keys(resolved).length) pieceColorOverrides[pieceId] = resolved;
      });
      const result = module.is_decoration
        ? { total: 0 }
        : Pricing.calculateModulePrice({
          module, pieces: effectivePieces, colorsByRole, hingeModel, slideModel,
          shelfQuantities: cfg.shelf_quantities || {}, dimOverrides: cfg.dim_overrides || {},
          pieceColorOverrides,
          width_mm: cfg.width_mm, height_mm: cfg.height_mm, depth_mm: cfg.depth_mm,
          markupMultiplier: resolveMarkupMultiplierForModule(module)
        });
      total += Number(result.total) || 0;
    } catch (calcErr) { skipped += 1; } // catálogo mudou e a config não fecha mais — não entra na soma
  }
  return { total, skipped };
}

async function loadProjectFavoritesList() {
  const listEl = document.getElementById('po-proj-fav-list');
  const errorEl = document.getElementById('po-proj-fav-error');
  if (!listEl) return;
  errorEl.style.display = 'none';
  listEl.className = 'po-myproj-grid';
  listEl.innerHTML = '';
  // Colunas de migration recente (076 = cached_value_usd, 100 =
  // wall_segments): se a migration ainda não rodou no banco, o select com a
  // coluna falha inteiro. Mesma ideia do salvar: tira a coluna que faltou e
  // refaz, uma por vez, até a lista carregar. Sem cached_value_usd os cards
  // caem no recálculo em background de antes; sem wall_segments o projeto
  // abre pelo caminho das paredes antigas (wall_shape/wall_widths_mm).
  const BASE_COLS = ['id', 'name', 'slots', 'wall_width_mm', 'wall_shape', 'wall_widths_mm', 'thumbnail_data_url', 'ai_preview_url', 'updated_at'];
  const OPTIONAL_COLS = ['cached_value_usd', 'wall_segments', 'share_code', 'view3d_code', 'view3d_expires_at'];
  let optional = OPTIONAL_COLS.slice();
  const runSelect = () => supabaseClient
    .from('user_projects')
    .select(BASE_COLS.concat(optional).join(', '))
    .order('updated_at', { ascending: false });
  let { data, error } = await runSelect();
  for (let i = 0; i < OPTIONAL_COLS.length; i++) {
    if (!error) break;
    const msg = error.message || '';
    const missing = optional.find((c) => msg.includes(c));
    if (!missing) break;
    optional = optional.filter((c) => c !== missing);
    ({ data, error } = await runSelect());
  }
  const cacheColumnAvailable = optional.includes('cached_value_usd');
  if (error) { errorEl.textContent = error.message; errorEl.style.display = 'block'; return; }
  if (!data || data.length === 0) {
    listEl.className = ''; // sem grid pro texto solo de "lista vazia"
    listEl.innerHTML = `<p class="hint">${I18n.t('project.saved_list_empty')}</p>`;
    return;
  }
  const totalSpans = []; // preenchido no forEach abaixo, usado depois pra calcular o valor em background (sem travar o render da lista)
  data.forEach((proj) => {
    const card = document.createElement('div');
    card.className = 'po-myproj-card';
    const slots = Array.isArray(proj.slots) ? proj.slots : [];
    const dateStr = proj.updated_at ? new Date(proj.updated_at).toLocaleString() : '—';
    // UMA imagem só por card (Matt, 02/09: "quero so a foto renderizada ou
    // se nao tiver render a imagem 3d centralizada do ambiente, nao duas
    // imagens como esta mostrando agora") — antes, com as duas presentes,
    // o card dividia a largura ao meio (3D | IA) lado a lado; agora prioriza
    // a foto realista (ai_preview_url) e só cai pro 3D (thumbnail_data_url)
    // se não tiver render nenhum ainda. .po-myproj-card-image já centraliza
    // via object-fit — a "imagem-split"/badge 3D-IA saiu de uso.
    const cardImageSrc = proj.ai_preview_url || proj.thumbnail_data_url;
    let imageHtml;
    if (cardImageSrc) {
      imageHtml = `
        <img src="${cardImageSrc}" alt="" class="po-myproj-card-image" />
        <div class="po-myproj-card-image-zoom-hint">🔍</div>`;
    } else {
      imageHtml = `<div class="po-myproj-card-image-empty"></div>`;
    }
    card.innerHTML = `
      <div class="po-myproj-card-image-wrap">${imageHtml}</div>
      <div class="po-myproj-card-body">
        <div class="po-myproj-card-name"></div>
        <div class="po-myproj-card-meta hint">${I18n.t('fav.modules_label', { n: slots.length })} · ${I18n.t('project.updated_label', { date: dateStr })}</div>
        <div class="po-myproj-card-total hint">${I18n.t('fav.total_calculating')}</div>
        <div class="po-myproj-card-actions">
          <button type="button" class="po-proj-fav-load">${I18n.t('project.load_btn')}</button>
          <button type="button" class="secondary po-proj-fav-rename">${I18n.t('fav.rename_btn')}</button>
          <button type="button" class="secondary po-proj-fav-duplicate">${I18n.t('fav.duplicate_btn')}</button>
          <button type="button" class="secondary po-proj-fav-share">${I18n.t('project.share_btn')}</button>
          <button type="button" class="secondary po-proj-fav-view3d">${I18n.t('fav.view3d_btn')}</button>
          <button type="button" class="secondary po-proj-fav-delete">${I18n.t('fav.delete_btn')}</button>
        </div>
      </div>
    `;
    card.querySelector('.po-myproj-card-name').textContent = proj.name; // textContent: nome é texto livre do cliente
    card.querySelectorAll('.po-myproj-card-image').forEach((img) => {
      img.addEventListener('click', () => openGalleryLightbox(img.src));
    });
    card.querySelector('.po-proj-fav-load').addEventListener('click', () => restoreFavoriteProject(proj));
    card.querySelector('.po-proj-fav-share').addEventListener('click', () => shareProjectFavorite(proj));
    card.querySelector('.po-proj-fav-view3d').addEventListener('click', () => view3DFavoriteProject(proj));
    card.querySelector('.po-proj-fav-rename').addEventListener('click', async () => {
      const newName = (prompt(I18n.t('project.name_prompt'), proj.name) || '').trim();
      if (!newName || newName === proj.name) return;
      const { error: renameErr } = await supabaseClient
        .from('user_projects')
        .update({ name: newName, updated_at: new Date().toISOString() })
        .eq('id', proj.id);
      if (renameErr) { errorEl.textContent = renameErr.message; errorEl.style.display = 'block'; return; }
      if (loadedProjectFavorite && loadedProjectFavorite.id === proj.id) { loadedProjectFavorite.name = newName; refreshProjectFavoriteButtons(); }
      loadProjectFavoritesList();
    });
    card.querySelector('.po-proj-fav-delete').addEventListener('click', async () => {
      if (!confirm(I18n.t('project.delete_confirm', { name: proj.name }))) return;
      const { error: delErr } = await supabaseClient.from('user_projects').delete().eq('id', proj.id);
      if (delErr) { errorEl.textContent = delErr.message; errorEl.style.display = 'block'; return; }
      if (loadedProjectFavorite && loadedProjectFavorite.id === proj.id) { loadedProjectFavorite = null; refreshProjectFavoriteButtons(); }
      loadProjectFavoritesList();
    });
    // Duplicar projeto (Matt, 02/09: "quero um botao de duplicar projeto,
    // onde eu possa duplicar e trocar o nome do cliente, pra poder usar um
    // projeto ja feito e agilizar meu processo para um outro cliente que
    // quer algo parecido") — pergunta o nome NA HORA (não cria "cópia de X"
    // pra depois renomear em 2 passos) e insere uma linha NOVA em
    // user_projects com os mesmos dados. `proj` aqui já É a linha inteira
    // que a lista carregou (BASE_COLS + as colunas opcionais que existirem
    // no banco desta sessão) — não precisa buscar de novo no Supabase.
    // client_user_id sempre currentUser.id (é sempre um projeto SEU sendo
    // duplicado, "select own projects" não deixaria ver de outro dono
    // mesmo que tentasse). share_code NUNCA copiado de propósito: tem
    // índice ÚNICO (migration 147) — se o original já foi compartilhado,
    // copiar o código quebraria o insert (ou pior, os dois projetos
    // passariam a abrir pelo MESMO código de importação). O histórico de
    // fotos realistas alternativas (project_photoreal_photos, migration
    // 077) NÃO é duplicado — só a última (ai_preview_url) vai junto, que é
    // a mesma foto que o card já estava mostrando.
    card.querySelector('.po-proj-fav-duplicate').addEventListener('click', async () => {
      const suggested = proj.name + I18n.t('fav.duplicate_name_suffix');
      const newName = (prompt(I18n.t('fav.duplicate_name_prompt'), suggested) || '').trim();
      if (!newName) return;
      const dupPayload = {
        client_user_id: currentUser.id,
        name: newName,
        slots: proj.slots,
        wall_width_mm: proj.wall_width_mm,
        wall_shape: proj.wall_shape,
        wall_widths_mm: proj.wall_widths_mm,
        ...(proj.wall_segments ? { wall_segments: proj.wall_segments } : {}),
        ...(proj.thumbnail_data_url ? { thumbnail_data_url: proj.thumbnail_data_url } : {}),
        ...(proj.ai_preview_url ? { ai_preview_url: proj.ai_preview_url } : {}),
        ...(proj.cached_value_usd != null ? { cached_value_usd: proj.cached_value_usd } : {})
      };
      const { error: dupErr } = await supabaseClient.from('user_projects').insert(dupPayload);
      if (dupErr) { errorEl.textContent = dupErr.message; errorEl.style.display = 'block'; return; }
      loadProjectFavoritesList();
    });
    listEl.appendChild(card);
    totalSpans.push({ el: card.querySelector('.po-myproj-card-total'), slots, proj });
  });

  // Formata "Value: X · Suggested resale: Y" a partir de um total já
  // conhecido — a margem de revenda (getResaleMarginPct) é aplicada NA
  // EXIBIÇÃO, nunca entra no cache (pode mudar a qualquer momento).
  const renderCardTotal = (el, total, skipped) => {
    // Vendedor (migration 149) nunca vê o valor de fábrica cru — só o
    // "preço de venda loja" (getDisplayPrice, já com a margem do dealer),
    // sem a linha "· Suggested resale" (aqui a margem NÃO é sugestão, é o
    // preço de verdade que ele pratica).
    if (isSellerAccount()) {
      el.textContent = I18n.t('fav.total_label', { total: formatMoney(getDisplayPrice(total)) })
        + (skipped > 0 ? ' ' + I18n.t('project.load_partial', { n: skipped }) : '');
      return;
    }
    // Migration 151 (2026-09-03): mesmo getDisplayPrice() de sempre, agora
    // também com desconto de fábrica + extras do dealer — ver comentário
    // de escopo em computeCustoBase (portal-05-cutlist.js). Sem nada
    // configurado, resultado idêntico a antes (migration 072).
    const resaleTotal = getDisplayPrice(total);
    const resaleSuffix = Math.abs(resaleTotal - total) >= 0.005
      ? ' · ' + I18n.t('fav.resale_total_label', { total: formatMoney(resaleTotal) })
      : '';
    el.textContent = I18n.t('fav.total_label', { total: formatMoney(total) })
      + resaleSuffix
      + (skipped > 0 ? ' ' + I18n.t('project.load_partial', { n: skipped }) : '');
  };

  // VALOR CACHEADO (migration 076, pedido do usuário 2026-08-03: "fica
  // calculando valor e perde tempo, deixa o valor fixo e só quando abre
  // recalcula") — antes TODO projeto recalculava em background a cada
  // abertura da aba ("Calculating value…" demorado, sequencial). Agora:
  // 1) cached_value_usd preenchido → mostra NA HORA, zero cálculo;
  // 2) NULL (projeto antigo, pré-migration) → calcula UMA vez em background
  //    (comportamento antigo) e PERSISTE na linha — da próxima vez cai no
  //    caso 1. O cache é re-gravado ao salvar (saveProjectFavorite) e ao
  //    abrir (restoreFavoriteProject) o projeto.
  const legacySpans = [];
  totalSpans.forEach(({ el, slots, proj }) => {
    if (!el) return;
    if (proj.cached_value_usd !== null && proj.cached_value_usd !== undefined) {
      renderCardTotal(el, Number(proj.cached_value_usd), 0);
    } else {
      legacySpans.push({ el, slots, proj });
    }
  });
  // Backfill sequencial de propósito (mesmo motivo interno de
  // computeProjectSlotsTotal/restoreFavoriteProject: loadModuleColors mexe
  // no global moduleColorsByRole).
  for (const { el, slots, proj } of legacySpans) {
    try {
      const { total, skipped } = await computeProjectSlotsTotal(slots);
      renderCardTotal(el, total, skipped);
      // Persiste SÓ se calculou tudo (skipped=0) — um total parcial salvo
      // viraria um valor "fixo" errado pra sempre; parcial continua
      // recalculando nas próximas aberturas até o catálogo se resolver.
      if (skipped === 0 && cacheColumnAvailable) {
        supabaseClient.from('user_projects').update({ cached_value_usd: total }).eq('id', proj.id)
          .then(() => {}, () => {});
      }
    } catch (err) {
      el.textContent = '';
    }
  }
}

// Toggle antigo (po-proj-fav-list-toggle-btn/po-proj-fav-list-wrap) foi
// REMOVIDO do HTML — a lista agora vive na aba própria "Meus Projetos"
// (po-tab-my-projects, carregada no listener de troca de aba, ver
// 'po-tab-my-projects' perto do fim deste arquivo). loadProjectFavoritesList
// continua igual, só passou a escrever direto em po-proj-fav-list (mesmo id,
// só mudou de aba-pai).

// ---------- COMPARTILHAR / IMPORTAR PROJETO ENTRE USUÁRIOS (migration 147) ----------
// Pedido do Matt (2026-08-28): "quero passar um projeto de um usuario pra
// outro... exportar projeto, outro usuario pode abrir, ou o dealer passar
// pro cliente". Em vez de transferir a linha (client_user_id fixo, precisa
// de acesso direto ao banco), o dono gera um CÓDIGO curto; quem recebe cola
// o link/código e abre uma cópia no editor da aba Projetos (mesmo caminho
// de "Personalizar" um post da Galeria — restoreGalleryPostAsProject usa o
// mesmo restoreFavoriteProject abaixo) — depois é só clicar em "Salvar"
// pra virar um projeto próprio, dono original nunca perde o dele.

// Gera um código curto (8 caracteres, base36 maiúsculo) — não precisa ser
// criptograficamente perfeito, só difícil de adivinhar por acaso; unicidade
// de verdade é garantida pelo índice único (migration 147), com retry aqui
// se colidir.
function generateProjectShareCode() {
  const rnd = crypto.getRandomValues(new Uint32Array(2));
  return Array.from(rnd, (n) => n.toString(36)).join('').toUpperCase().slice(0, 8);
}

async function shareProjectFavorite(proj) {
  const errorEl = document.getElementById('po-proj-fav-error');
  if (errorEl) errorEl.style.display = 'none';
  try {
    let code = proj.share_code || null;
    if (!code) {
      // .select('id') no update é DE PROPÓSITO (achado 28/08, testando com
      // o Matt: 1º código gerado dava "Invalid code" na hora de importar) —
      // .update() sem .select() no supabase-js usa Prefer: return=minimal,
      // que NÃO acusa erro nenhum se o UPDATE bater 0 linhas (RLS silenciosa
      // filtrando a linha, id errado, etc.) — parecia "sucesso" e mostrava
      // um link com um código que nunca foi gravado. Com .select('id'), dá
      // pra saber de verdade se a linha voltou.
      for (let attempt = 0; attempt < 5 && !code; attempt++) {
        const candidate = generateProjectShareCode();
        const { data, error } = await supabaseClient.from('user_projects').update({ share_code: candidate }).eq('id', proj.id).select('id');
        if (!error && data && data.length) { code = candidate; proj.share_code = candidate; }
        else if (error && !/duplicate key|unique/i.test(error.message || '')) throw error; // erro real (ex.: migration 147 não rodou) — não adianta tentar de novo
        else if (!error && (!data || !data.length)) throw new Error('Não consegui gravar o código nesse projeto (a atualização não encontrou a linha — recarregue a página e tente de novo).');
      }
      if (!code) throw new Error(I18n.t('project.share_error_retry'));
    }
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = ''; // link limpo (achado 28/08: um '#' solto sobrevivia da URL de origem e ficava pendurado no fim do link, confuso de colar embora o import já ignorasse)
    url.searchParams.set('importProject', code);
    const link = url.toString();
    try { await navigator.clipboard.writeText(link); } catch (e) { /* clipboard pode não estar disponível (http/permissão) — o alert abaixo mostra o link igual */ }
    alert(`${I18n.t('project.share_link_label')}\n${link}\n\n${I18n.t('project.share_code_hint', { code })}`);
  } catch (err) {
    if (errorEl) { errorEl.textContent = err.message || String(err); errorEl.style.display = 'block'; }
  }
}

// Link de visualização 3D pública (view3d, NOVO 02/09) — pedido do Matt:
// "quero um botao pra compartilhar um link so do 3d, para por exemplo um
// cliente poder ver. ou um montador poder consultar o projeto... o cliente
// nao pode mudar nada, so opcao de visualizar rotacionar e dar zoom".
// Diferente do "Compartilhar" acima (share_code — exige login, abre uma
// CÓPIA editável): este é um código separado (view3d_code, migration 148),
// não exige login nenhum e EXPIRA sozinho em 30 dias (esclarecido com o
// Matt via pergunta: link com validade, não permanente). Mesmo cuidado do
// bug de 28/08 documentado acima em shareProjectFavorite: .update() só
// conta como sucesso com .select('id') retornando a linha de volta.
const PROJECT_VIEW3D_LINK_DAYS = 30;

async function generateOrGetView3DLink(proj) {
  const now = Date.now();
  const stillValid = proj.view3d_code && proj.view3d_expires_at && new Date(proj.view3d_expires_at).getTime() > now;
  if (!stillValid) {
    let code = null;
    const newExpiresAt = new Date(now + PROJECT_VIEW3D_LINK_DAYS * 24 * 60 * 60 * 1000).toISOString();
    for (let attempt = 0; attempt < 5 && !code; attempt++) {
      const candidate = generateProjectShareCode();
      const { data, error } = await supabaseClient.from('user_projects')
        .update({ view3d_code: candidate, view3d_expires_at: newExpiresAt })
        .eq('id', proj.id).select('id');
      if (!error && data && data.length) { code = candidate; proj.view3d_code = candidate; proj.view3d_expires_at = newExpiresAt; }
      else if (error && !/duplicate key|unique/i.test(error.message || '')) throw error; // erro real (ex.: migration 148 não rodou) — não adianta tentar de novo
      else if (!error && (!data || !data.length)) throw new Error(I18n.t('fav.view3d_error'));
    }
    if (!code) throw new Error(I18n.t('fav.view3d_error'));
  }
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = ''; // link limpo, mesmo cuidado de shareProjectFavorite
  url.searchParams.set('view3d', proj.view3d_code);
  return { link: url.toString(), expiresAt: proj.view3d_expires_at };
}

async function view3DFavoriteProject(proj) {
  const errorEl = document.getElementById('po-proj-fav-error');
  if (errorEl) errorEl.style.display = 'none';
  try {
    const { link, expiresAt } = await generateOrGetView3DLink(proj);
    try { await navigator.clipboard.writeText(link); } catch (e) { /* clipboard pode não estar disponível — o alert abaixo mostra o link igual */ }
    const dateLabel = new Date(expiresAt).toLocaleDateString();
    alert(`${I18n.t('fav.view3d_link_label')}\n${link}\n\n${I18n.t('fav.view3d_link_expires', { date: dateLabel })}`);
  } catch (err) {
    if (errorEl) { errorEl.textContent = err.message || String(err); errorEl.style.display = 'block'; }
  }
}

// Busca um projeto pelo código (function SECURITY DEFINER get_shared_project,
// migration 147 — não é uma policy de SELECT aberta, só devolve a linha
// exata que bate com o código) e abre no editor, SEM salvar sozinho — quem
// importou revisa e decide clicando em "Salvar" (vira INSERT novo,
// client_user_id = quem está logado, dono original intacto).
async function openSharedProjectByCode(rawCode) {
  const errorEl = document.getElementById('po-proj-fav-error');
  const statusEl = document.getElementById('po-proj-import-status');
  if (errorEl) errorEl.style.display = 'none';
  if (statusEl) statusEl.textContent = '';
  if (!currentUser) {
    if (errorEl) { errorEl.textContent = I18n.t('fav.need_login'); errorEl.style.display = 'block'; }
    return;
  }
  // Aceita tanto o link inteiro colado quanto só o código.
  let code = (rawCode || '').trim();
  const fromLink = code.match(/[?&]importProject=([A-Za-z0-9]+)/i);
  if (fromLink) code = fromLink[1];
  code = code.toUpperCase();
  if (!code) return;
  try {
    const { data, error } = await supabaseClient.rpc('get_shared_project', { p_code: code });
    if (error) throw error;
    const source = Array.isArray(data) ? data[0] : data;
    if (!source) {
      if (errorEl) { errorEl.textContent = I18n.t('project.import_error_notfound'); errorEl.style.display = 'block'; }
      return;
    }
    const input = document.getElementById('po-proj-import-code');
    if (input) input.value = '';
    await restoreFavoriteProject({
      id: null, // força INSERT novo ao salvar — nunca aponta pro projeto do dono original
      name: I18n.t('project.import_copy_name', { name: source.name }),
      slots: source.slots,
      wall_width_mm: source.wall_width_mm,
      wall_shape: source.wall_shape,
      wall_widths_mm: source.wall_widths_mm,
      wall_segments: source.wall_segments,
      ai_preview_url: null
    }, false);
    if (statusEl) statusEl.textContent = I18n.t('project.import_success', { name: source.name });
  } catch (err) {
    if (errorEl) { errorEl.textContent = err.message || String(err); errorEl.style.display = 'block'; }
  }
}

const projImportBtn = document.getElementById('po-proj-import-btn');
const projImportInput = document.getElementById('po-proj-import-code');
if (projImportBtn && projImportInput) {
  projImportBtn.addEventListener('click', () => openSharedProjectByCode(projImportInput.value));
  projImportInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') openSharedProjectByCode(projImportInput.value); });
}

// Link clicado direto (?importProject=CODE) — abre sozinho assim que há
// sessão, mesmo padrão de maybeOpenSharedGalleryPost (portal-04-galeria.js)
// pro post de Galeria compartilhado: chamado depois de showLoggedIn (usa
// currentUser) tanto no init() quanto no submit do login. Tira o parâmetro
// da URL depois de abrir — um F5 acidental não deve reabrir por cima de
// alterações que o cliente já tenha feito.
async function maybeOpenSharedProjectImport() {
  const code = new URLSearchParams(window.location.search).get('importProject');
  if (!code || !currentUser) return;
  await openSharedProjectByCode(code);
  const url = new URL(window.location.href);
  url.searchParams.delete('importProject');
  window.history.replaceState({}, '', url);
}

// Reconstrói projectSlots a partir da configuração salva (ver
// restoreFavoriteComposition acima pro mesmo raciocínio linha a linha, não
// repetido aqui) — as diferenças: x_mm/z_order em vez de stack_on_id,
// wall_width_mm próprio (ver setProjectWallWidthMm), e cada slot precisa de
// colorOptionsByRole recarregado (loadModuleColors) pra alimentar o painel
// de swatch inline (renderProjectConfigPanel) — a Composição não tem esse
// painel inline, só o configurador completo, então não precisa disso.
async function restoreFavoriteProject(fav, bindAsFavorite = true) {
  const errorEl = document.getElementById('po-proj-fav-error') || document.getElementById('po-proj-error');
  if (errorEl) errorEl.style.display = 'none';
  try {
    // Corrida no login: allModules só fica pronto depois de um showLoggedIn()
    // assíncrono (loadColorRoles → ... → loadModules, no fim da cadeia — ver
    // showLoggedIn). Clicar "Carregar no Projeto" rápido demais (ex.: acabou
    // de logar/recarregar a página) pega allModules ainda vazio ([]) — e
    // TODO módulo salvo é pulado por engano (.find nunca acha nada num
    // array vazio), mesmo o módulo existindo de verdade no catálogo. Isso
    // bate exatamente com o relato do usuário: "6 de 6" pulados, 100% —
    // sinal de allModules vazio, não de módulo realmente apagado.
    if (!allModules.length) await loadModules();
    const slotConfigs = Array.isArray(fav.slots) ? fav.slots : [];

    const pieceColorOverrideColorIds = slotConfigs.flatMap((s) =>
      Object.values(s.piece_color_overrides || {}).flatMap((perRole) => Object.values(perRole).map((e) => e.color_id))
    );
    const colorIds = [...new Set(
      slotConfigs.flatMap((s) => (s.selected_colors || []).map((c) => c.color_id))
        .concat(pieceColorOverrideColorIds)
        .filter(Boolean)
    )];
    const hingeIds = [...new Set(slotConfigs.map((s) => s.hinge_model_id).filter(Boolean))];
    const slideIds = [...new Set(slotConfigs.map((s) => s.slide_model_id).filter(Boolean))];
    const [colorsRes, hingeRes, slideRes] = await Promise.all([
      colorIds.length ? supabaseClient.from('colors').select('*').in('id', colorIds) : { data: [] },
      hingeIds.length ? supabaseClient.from('hinge_models').select('*').in('id', hingeIds) : { data: [] },
      slideIds.length ? supabaseClient.from('slide_models').select('*').in('id', slideIds) : { data: [] }
    ]);
    const colorById = new Map((colorsRes.data || []).map((c) => [c.id, c]));
    const hingeById = new Map((hingeRes.data || []).map((h) => [h.id, h]));
    const slideById = new Map((slideRes.data || []).map((s) => [s.id, s]));

    const restored = [];
    let skipped = 0;
    // Sequencial (não Promise.all) de propósito: loadModuleColors mexe no
    // global moduleColorsByRole — chamadas concorrentes se sobrescreveriam.
    for (const cfg of slotConfigs) {
      const module = allModules.find((m) => m.id === cfg.module_id);
      if (!module) { skipped += 1; continue; }
      const piecesList = await loadRecursivePiecesForModule(module.id);
      if (!piecesList || piecesList.length === 0) { skipped += 1; continue; }
      const optionalIds = cfg.selected_optional_ids || [];
      const effectivePieces = piecesList.filter((p) => !p.client_optional || optionalIds.includes(p.id));
      await loadModuleColors(module.id); // preenche o global moduleColorsByRole pra ESTE módulo — precisa vir ANTES do fallback abaixo
      // Valores de largura/altura TRAVADOS (module.width_locked/height_locked)
      // — precisa buscar de novo aqui (o slot restaurado é um objeto NOVO,
      // não carrega nada do que insertProjectModuleDefault já tinha buscado
      // da 1ª vez) pras setinhas de esticar do canvas funcionarem também num
      // projeto salvo recarregado (pedido do usuário 2026-07-26, ver
      // widthPresetsMm/heightPresetsMm no slot).
      const lockedDimensionPresets = await fetchModuleLockedDimensionPresets(module.id);
      const selectedColorsResolved = [...(cfg.selected_colors || [])];
      const colorsByRole = {};
      selectedColorsResolved.forEach((sc) => {
        const color = colorById.get(sc.color_id);
        if (color) colorsByRole[sc.role_id] = color;
      });
      // Autocura (2026-07-21) — projetos salvos ANTES do fix de
      // insertProjectModuleDefault (clicar na biblioteca insere direto)
      // gravaram selected_colors VAZIO mesmo com peça exigindo cor, e o
      // slot inteiro era pulado no restore ("Nenhuma cor selecionada para a
      // peça X", relatado pelo usuário — projeto "bed3"). Em vez de só
      // corrigir daqui pra frente, preenche aqui também qualquer papel de
      // cor que as peças REALMENTE usam (recursivo, ver
      // collectUsedColorRoleIds) mas que ficou faltando — com a 1ª opção
      // disponível do catálogo, mesmo critério de "cor padrão" que
      // insertProjectModuleDefault já usa pra módulo novo. Atualiza
      // selectedColorsResolved junto, pra "Salvar alterações" gravar o
      // preenchimento de volta e o projeto parar de precisar disso a cada load.
      collectUsedColorRoleIds(effectivePieces).forEach((roleId) => {
        if (colorsByRole[roleId]) return;
        const fallback = (moduleColorsByRole[roleId] || [])[0];
        if (!fallback) return;
        colorsByRole[roleId] = fallback;
        const idx = selectedColorsResolved.findIndex((sc) => sc.role_id === roleId);
        const entry = { role_id: roleId, role_name: (colorRolesCache.find((r) => r.id === roleId) || {}).name || null, color_id: fallback.id, color_name: fallback.name };
        if (idx >= 0) selectedColorsResolved[idx] = entry; else selectedColorsResolved.push(entry);
      });
      const hingeModel = cfg.hinge_model_id ? (hingeById.get(cfg.hinge_model_id) || null) : null;
      const slideModel = cfg.slide_model_id ? (slideById.get(cfg.slide_model_id) || null) : null;
      const pieceColorOverrides = {};
      Object.keys(cfg.piece_color_overrides || {}).forEach((pieceId) => {
        const perRole = cfg.piece_color_overrides[pieceId];
        const resolved = {};
        Object.keys(perRole).forEach((roleId) => {
          const color = colorById.get(perRole[roleId].color_id);
          if (color) resolved[roleId] = color;
        });
        if (Object.keys(resolved).length) pieceColorOverrides[pieceId] = resolved;
      });
      let result;
      try {
        result = module.is_decoration
          ? { total: 0, breakdown: [] }
          : Pricing.calculateModulePrice({
            module, pieces: effectivePieces, colorsByRole, hingeModel, slideModel,
            shelfQuantities: cfg.shelf_quantities || {}, dimOverrides: cfg.dim_overrides || {},
            pieceColorOverrides,
            width_mm: cfg.width_mm, height_mm: cfg.height_mm, depth_mm: cfg.depth_mm,
            markupMultiplier: resolveMarkupMultiplierForModule(module)
          });
      } catch (calcErr) { skipped += 1; continue; } // catálogo mudou e a config não fecha mais
      restored.push({
        id: cfg.id || newProjectSlotId(),
        wall_index: Number(cfg.wall_index || 0), // clampado mais abaixo, depois que a forma/parede é restaurada
        x_mm: Number(cfg.x_mm || 0),
        floor_height_mm: Number(cfg.floor_height_mm || 0),
        z_order: Number(cfg.z_order || 0),
        // Módulo ILHA (2026-08-08, ver isFloorSlot) — projeto salvo antes
        // disso não tem `placement` nenhum e cai em 'wall', idêntico a antes.
        placement: cfg.placement === 'floor' ? 'floor' : 'wall',
        floor_x_mm: Number(cfg.floor_x_mm || 0),
        floor_z_mm: Number(cfg.floor_z_mm || 0),
        floor_rotation_deg: Number(cfg.floor_rotation_deg || 0),
        // Movimentação/Rotação fina 3 eixos (2026-08-23) — ver
        // serializeProjectSlots (portal-08-projetos-paredes.js). Projeto
        // salvo antes disso não tem essas chaves, cai no default 0.
        fineOffsetZMm: Number(cfg.fine_offset_z_mm || 0),
        fineOffsetYMm: Number(cfg.fine_offset_y_mm || 0),
        fineRotXDeg: Number(cfg.fine_rot_x_deg || 0),
        fineRotYDeg: Number(cfg.fine_rot_y_deg || 0),
        fineRotZDeg: Number(cfg.fine_rot_z_deg || 0),
        module,
        pieces: effectivePieces,
        colorOptionsByRole: moduleColorsByRole,
        colorsByRole,
        selectedColors: selectedColorsResolved,
        pieceColorOverrides,
        hingeModel, slideModel,
        width_mm: cfg.width_mm, height_mm: cfg.height_mm, depth_mm: cfg.depth_mm,
        shelfQuantities: cfg.shelf_quantities || {},
        dimOverrides: cfg.dim_overrides || {},
        selectedOptionalIds: optionalIds,
        // removedPieceIds (2026-08-20): peça removida manualmente pelo
        // cliente ("Peças do móvel") — fica de fora de `pieces` acima (que
        // guarda a árvore INTEIRA, igual selectedOptionalIds) e é filtrada
        // depois por projectSlotEffectivePieces junto com layoutPieces.
        removedPieceIds: cfg.removed_piece_ids || [],
        // Construtor de armário: a árvore volta como veio (o motor só a lê
        // quando a janela abre). Projeto salvo antes disso não tem a chave.
        layout: cfg.layout || null,
        // Grupo de módulos (2026-09-03) — projeto salvo antes disso não tem
        // essas chaves, cai em null/null (avulso), igual sempre foi. Ver
        // serializeProjectSlots (portal-08-projetos-paredes.js).
        group_id: cfg.group_id || null,
        group_name: cfg.group_name || null,
        result,
        thumbnail_data_url: cfg.thumbnail_data_url || null,
        widthPresetsMm: lockedDimensionPresets.width,
        heightPresetsMm: lockedDimensionPresets.height,
        // Ver mesmo comentário em insertProjectModuleDefault — dropdown de
        // SKU no painel da direita precisa do rótulo, não só do mm.
        widthPresetsLabeled: lockedDimensionPresets.widthLabeled,
        heightPresetsLabeled: lockedDimensionPresets.heightLabeled
      });
    }

    // Vai pra aba Projetos ANTES de atribuir os dados novos — o canvas
    // (renderProjectCanvas) mede o clientWidth do wrap pra calcular a escala
    // px/mm, e isso só funciona com display:block (mesmo motivo do
    // comentário em "if (btn.dataset.tab === 'po-tab-projects')" no listener
    // de troca de aba, mais abaixo neste arquivo).
    const projTabBtn = document.querySelector('#po-sidebar .portal-tab-btn[data-tab="po-tab-projects"]');
    if (projTabBtn) projTabBtn.click();

    // Forma/largura das paredes (migration 058) — projeto salvo ANTES desta
    // funcionalidade não tem wall_shape/wall_widths_mm, só o wall_width_mm
    // antigo (1 parede só): cai em 'single' com essa largura, mesmo
    // comportamento de sempre.
    const restoredShape = (fav.wall_shape && PROJECT_WALL_ROLES_BY_SHAPE[fav.wall_shape]) ? fav.wall_shape : 'single';
    const restoredRoleCount = PROJECT_WALL_ROLES_BY_SHAPE[restoredShape].length;
    let restoredWidths = Array.isArray(fav.wall_widths_mm) ? fav.wall_widths_mm.map((w) => Number(w) || PROJECT_WALL_WIDTH_DEFAULT_MM) : [];
    if (!restoredWidths.length) restoredWidths = [Number(fav.wall_width_mm) || PROJECT_WALL_WIDTH_DEFAULT_MM];
    while (restoredWidths.length < restoredRoleCount) restoredWidths.push(PROJECT_WALL_WIDTH_DEFAULT_MM);
    restoredWidths = restoredWidths.slice(0, restoredRoleCount).map((w) => clamp(w, PROJECT_WALL_WIDTH_MIN_MM, PROJECT_WALL_WIDTH_MAX_MM));

    projectWallShape = restoredShape;
    projectWallWidthsMm = restoredWidths;
    // Paredes desenhadas, quando o projeto foi salvo com elas. Sem esta chave
    // (projeto antigo), a lista fica vazia e getProjectWallGeometry segue pelo
    // caminho das formas fixas, exatamente como sempre foi.
    projectWallSegments = Array.isArray(fav.wall_segments) ? fav.wall_segments : [];
    projectActiveWallIndex = Math.max(PROJECT_WALL_ROLES_BY_SHAPE[restoredShape].indexOf('main'), 0);
    persistProjectWallConfig();
    refreshProjectWallShapeButtons();
    refreshProjectWallTabs();

    // Só agora dá pra clampar wall_index com segurança (já sabemos quantas
    // paredes o ambiente restaurado tem de verdade) — módulo apontando pra
    // uma parede que não existe mais cai na primeira.
    //
    // BUG CORRIGIDO (2026-09-03, relato do usuário: "salvei um projeto bem
    // grande com 3 paredes de moveis, ao reabri-lo... todos os modulos das
    // outras paredes foram parar na primeira parede"). Usava
    // restoredRoleCount — PROJECT_WALL_ROLES_BY_SHAPE[restoredShape].length,
    // do sistema ANTIGO de formas fixas (single/double/U). Desde a "Ajustar
    // paredes" (2026-08-13) o ambiente é uma PLANTA DESENHADA
    // (projectWallSegments) e wall_shape fica 'single' PRA SEMPRE em
    // qualquer projeto novo — restoredRoleCount vinha sempre 1, e todo
    // módulo de wall_index >= 1 (ou seja, de qualquer parede que não a
    // primeira) era jogado de volta pra 0 aqui, mesmo com o dado certo já
    // salvo no banco. Mesma classe de bug já corrigida em
    // getProjectWallCount() (ver comentário lá, "QUANTAS PAREDES O AMBIENTE
    // TEM, DE VERDADE") — esta chamada específica tinha ficado de fora
    // daquela auditoria. getProjectWallCount() já lê projectWallSegments
    // (atribuído 3 linhas acima) quando existe, senão cai no mesmo legado
    // de antes — projeto salvo no modelo velho continua funcionando igual.
    const restoredWallCount = getProjectWallCount();
    restored.forEach((slot) => {
      if (isFloorSlot(slot)) return; // ilha não pertence a parede nenhuma
      if (slot.wall_index < 0 || slot.wall_index >= restoredWallCount) slot.wall_index = 0;
    });

    projectSlots = restored;
    // Construtor de armário: o projeto salvo traz a ÁRVORE (slot.layout), não
    // as peças. Carrega o catálogo de agregados e refaz a geometria em
    // background — ver hydrateProjectLayoutPieces.
    hydrateProjectLayoutPieces();
    selectedProjectSlotId = null;
    project3DLastFitKey = null; // projeto TROCOU inteiro — reenquadra a câmera 3D mesmo se a chave coincidir (ver comentário na declaração)
    refreshProjectWallWidthInput();
    loadedProjectFavorite = bindAsFavorite ? { id: fav.id, name: fav.name, ai_preview_url: fav.ai_preview_url || null } : null;
    refreshProjectFavoriteButtons();
    renderProjectCanvas();
    projectDirty = false; // acabou de carregar do banco, nada pendente ainda
    refreshProjectSaveIndicator();
    resetProjectUndo();    // projeto TROCOU inteiro — ver comentário em resetProjectUndo

    const statusEl = document.getElementById('po-proj-fav-status');
    if (statusEl) {
      statusEl.textContent = I18n.t('project.loaded_status', { name: fav.name })
        + (skipped > 0 ? ' ' + I18n.t('project.load_partial', { n: skipped }) : '');
      setTimeout(() => { statusEl.textContent = ''; }, 6000);
    }

    // Recálculo do valor cacheado AO ABRIR (migration 076 — "só quando abre
    // ele recalcula"): atualiza cached_value_usd em background com os preços
    // ATUAIS do catálogo (o cache do salvar pode ter ficado velho se preço/
    // margem mudou desde então). Fire-and-forget de propósito: roda DEPOIS
    // do restore completo (computeProjectSlotsTotal mexe no global
    // moduleColorsByRole — não pode rodar em paralelo com o restore), nunca
    // atrasa a abertura nem quebra nada se falhar (coluna ausente, rede).
    // Só o projeto que abriu — a lista continua sem recálculo em massa.
    if (bindAsFavorite && fav.id) {
      (async () => {
        try {
          const r = await computeProjectSlotsTotal(Array.isArray(fav.slots) ? fav.slots : []);
          if (r && r.skipped === 0) {
            await supabaseClient.from('user_projects').update({ cached_value_usd: r.total }).eq('id', fav.id);
          }
        } catch (e) { /* silencioso — cache é só conveniência */ }
      })();
    }
  } catch (err) {
    if (errorEl) {
      errorEl.textContent = I18n.t('project.load_error', { msg: err.message || String(err) });
      errorEl.style.display = 'block';
    }
  }
}

// ---------- GERAR IMAGEM COM IA + GALERIA PARA PROJETOS (migration 056) ----------
// Cópia adaptada do bloco da Composição (generateAiPreviewForGallery/
// publishCompositionToGallery e os helpers que eles chamam — ver comentários
// perto de cada um lá pro raciocínio completo, não repetido aqui) operando
// em cima de projectSlots/ViewerProject em vez de compositionSlots/
// ViewerComposition. gallery_posts ganha source_type='project' +
// wall_width_mm (migration 056) pra "Personalizar" saber reconstruir de
// volta na aba Projetos (ver restoreGalleryPostAsProject mais abaixo).

// Largura = a da PAREDE (getProjectWallWidthMm), não a soma dos módulos
// (teria vãos vazios contados errado) — equivalente a
// computeCompositionTotalsMm(), que soma colunas em vez disso.
function computeProjectTotalsMm() {
  if (projectSlots.length === 0) return null;
  let totalHeight = 0;
  let totalDepth = 0;
  projectSlots.forEach((s) => {
    totalHeight = Math.max(totalHeight, Number(s.floor_height_mm || 0) + Number(s.height_mm || 0));
    totalDepth = Math.max(totalDepth, Number(s.depth_mm || 0));
  });
  return { totalWidth: getProjectWallWidthMm(), totalHeight, totalDepth };
}

function aggregateColorsUsedForProject() {
  const byColorId = new Map();
  projectSlots.forEach((slot) => {
    (slot.selectedColors || []).forEach((c) => { if (c.color_id) byColorId.set(c.color_id, c); });
    Object.values(slot.pieceColorOverrides || {}).forEach((perRole) => {
      Object.keys(perRole).forEach((roleId) => {
        const color = perRole[roleId];
        if (color && color.id && !byColorId.has(color.id)) {
          byColorId.set(color.id, { role_id: roleId, role_name: null, color_id: color.id, color_name: color.name });
        }
      });
    });
  });
  return [...byColorId.values()];
}

function aggregateColorsUsedPerModuleForProject() {
  const byModule = new Map(); // moduleName -> Map(colorId -> colorEntry)
  projectSlots.forEach((slot) => {
    const moduleName = (slot.module && slot.module.name) || '?';
    if (!byModule.has(moduleName)) byModule.set(moduleName, new Map());
    const colorMap = byModule.get(moduleName);
    (slot.selectedColors || []).forEach((c) => { if (c.color_id) colorMap.set(c.color_id, c); });
    Object.values(slot.pieceColorOverrides || {}).forEach((perRole) => {
      Object.keys(perRole).forEach((roleId) => {
        const color = perRole[roleId];
        if (color && color.id && !colorMap.has(color.id)) {
          colorMap.set(color.id, { role_id: roleId, role_name: null, color_id: color.id, color_name: color.name });
        }
      });
    });
  });
  return [...byModule.entries()].map(([moduleName, colorMap]) => ({ moduleName, colors: [...colorMap.values()] }));
}

async function buildColorDescriptionForProject() {
  const perModule = aggregateColorsUsedPerModuleForProject();
  if (!perModule.length) return null;
  const allColorIds = [...new Set(perModule.flatMap((m) => m.colors.map((c) => c.color_id)).filter(Boolean))];
  const hexByColorId = new Map();
  if (allColorIds.length) {
    try {
      const { data } = await supabaseClient.from('colors').select('id, swatch_hex').in('id', allColorIds);
      (data || []).forEach((c) => { if (c.swatch_hex) hexByColorId.set(c.id, c.swatch_hex); });
    } catch (err) { /* segue só com o nome, sem hex */ }
  }
  const moduleLabels = perModule
    .map(({ moduleName, colors }) => {
      const names = [...new Set(colors
        .map((c) => {
          if (!c.color_name) return null;
          const hex = hexByColorId.get(c.color_id);
          return hex ? `${c.color_name} (hex aproximado ${hex})` : c.color_name;
        })
        .filter(Boolean))];
      return names.length ? `${moduleName}: ${names.join(', ')}` : null;
    })
    .filter(Boolean);
  return moduleLabels.length ? moduleLabels.join('; ') : null;
}

const MAX_COLOR_REF_PHOTOS_PROJECT = 4;
async function buildColorReferencesForProject() {
  const perModule = aggregateColorsUsedPerModuleForProject();
  if (!perModule.length) return [];
  const colorIds = [...new Set(perModule.flatMap((m) => m.colors.map((c) => c.color_id)).filter(Boolean))];
  if (!colorIds.length) return [];
  const modulesByColorId = new Map();
  perModule.forEach(({ moduleName, colors }) => {
    colors.forEach((c) => {
      if (!c.color_id) return;
      if (!modulesByColorId.has(c.color_id)) modulesByColorId.set(c.color_id, new Set());
      modulesByColorId.get(c.color_id).add(moduleName);
    });
  });
  try {
    const { data } = await supabaseClient.from('colors').select('id, name, texture_url').in('id', colorIds);
    const withPhoto = (data || []).filter((c) => c.texture_url).slice(0, MAX_COLOR_REF_PHOTOS_PROJECT);
    const images = (await Promise.all(withPhoto.map(async (c) => {
      const rawDataUrl = await fetchUrlAsDataUrl(c.texture_url);
      if (!rawDataUrl) return null;
      const dataUrl = await toJpegDataUrl(rawDataUrl);
      const moduleNames = [...(modulesByColorId.get(c.id) || [])].join(', ');
      const label = moduleNames ? `${moduleNames}: ${c.name}` : c.name;
      return { label, dataUrl };
    }))).filter(Boolean);
    return images;
  } catch (err) {
    return [];
  }
}

const MAX_MODULE_REF_PHOTOS_PROJECT = 3;
async function fetchReferencePhotosForProject() {
  const moduleNameById = new Map();
  projectSlots.forEach((s) => { if (s.module && s.module.id) moduleNameById.set(s.module.id, s.module.name); });
  const moduleIds = [...moduleNameById.keys()];
  if (!moduleIds.length) return { moduleRefImages: [] };
  try {
    const { data } = await supabaseClient.from('reference_photos').select('id, module_id, photo_url').in('module_id', moduleIds);
    const firstPhotoByModule = new Map();
    (data || []).forEach((p) => { if (!firstPhotoByModule.has(p.module_id)) firstPhotoByModule.set(p.module_id, p.photo_url); });
    const chosen = [...firstPhotoByModule.entries()].slice(0, MAX_MODULE_REF_PHOTOS_PROJECT);
    const moduleRefImages = (await Promise.all(chosen.map(async ([moduleId, photoUrl]) => {
      const dataUrl = await fetchUrlAsDataUrl(photoUrl);
      return dataUrl ? { moduleName: moduleNameById.get(moduleId) || null, dataUrl } : null;
    }))).filter(Boolean);
    return { moduleRefImages };
  } catch (err) {
    return { moduleRefImages: [] };
  }
}

async function captureProjectAngleReferences() {
  if (!ViewerProject || !ViewerProject.snapshot) return [];
  const angles = [
    { angle: 'three_quarter', label: 'vista 3/4 (referência de geometria)' },
    { angle: 'side', label: 'vista lateral (referência de geometria)' }
  ];
  const images = [];
  for (const { angle, label } of angles) {
    const raw = ViewerProject.snapshot({ angle });
    if (!raw) continue;
    const trimmed = await trimTransparentPng(raw);
    if (trimmed) images.push({ label, dataUrl: trimmed });
  }
  return images;
}

// Versão "limpa" da cena do Projeto só pra tirar o(s) print(s) que viram
// base pra IA — mesmo princípio de renderCompositionForAiSnapshot (ver
// comentário lá). SEMPRE temporária: quem chamar isto tem que chamar
// generateProject3D() de novo depois, pra devolver a cena normal.
function renderProjectForAiSnapshot() {
  if (!ViewerProject || !ViewerProject.available()
    || typeof Viewer3D === 'undefined' || !Viewer3D.buildStandaloneAssembly) {
    return false;
  }
  const cleanSlots = projectSlots.filter((slot) => !(slot.module && slot.module.is_decoration));
  if (!cleanSlots.length) return false;
  const room = { ...viewerRoomEnvConfig(), minimal: true };
  ViewerProject.init('po-proj-3d-canvas');
  // Mesma ramificação single vs. dupla/C-U de generateProject3D (ver
  // comentário lá) — só muda a origem dos slots (cleanSlots, sem decoração).
  // Módulos ILHA (2026-08-08) forçam o caminho multi-parede, mesmo com uma
  // parede só — é renderFreeformWalls quem sabe posicionar por coordenada de
  // mundo (ver a mesma ramificação em generateProject3D).
  const floorAssemblies = buildProjectAssemblies(cleanSlots.filter(isFloorSlot));
  // PLANTA DESENHADA SEMPRE PELO CAMINHO MULTI-PAREDE (2026-08-18): so quem
  // NAO tem wall_segments (projeto salvo no modelo velho de forma fixa) cai
  // no renderFreeform de uma parede centrada na origem. Com planta desenhada
  // a parede pode estar em qualquer lugar/angulo, e quem sabe posicionar por
  // coordenada de mundo e o renderFreeformWalls — mesmo caminho da cena de
  // edicao (renderProjectCanvasFrontCorner), pra os dois 3D concordarem.
  if (!projectWallSegments.length && getProjectWallCount() <= 1 && !floorAssemblies.length) {
    const assemblies = buildProjectAssemblies(cleanSlots);
    ViewerProject.renderFreeform(assemblies, getProjectWallWidthMm() / 1000, room);
  } else {
    const wallsData = getProjectWallGeometry().map((wall) => ({
      ...wall,
      assemblies: buildProjectAssemblies(cleanSlots.filter((s) => !isFloorSlot(s) && Number(s.wall_index || 0) === wall.wallIndex))
    }));
    ViewerProject.renderFreeformWalls(wallsData, room, null, { floorAssemblies });
  }
  return true;
}

let projectGalleryAiPreviewImage = null;
let projectGalleryAiPreviewStatus = null;

const projGalleryPublishToggleBtn = document.getElementById('po-proj-gallery-publish-toggle-btn');
if (projGalleryPublishToggleBtn) {
  projGalleryPublishToggleBtn.addEventListener('click', () => {
    const form = document.getElementById('po-proj-gallery-publish-form');
    if (!form) return;
    const isHidden = form.style.display === 'none';
    if (isHidden) {
      populateGalleryFamilySelect(document.getElementById('po-proj-gallery-room-type'), false);
      projectGalleryAiPreviewImage = null;
      projectGalleryAiPreviewStatus = null;
      document.getElementById('po-proj-gallery-ai-preview-wrap').style.display = 'none';
      const baseWrap = document.getElementById('po-proj-gallery-base-preview-wrap');
      if (baseWrap) baseWrap.style.display = 'none';
    }
    form.style.display = isHidden ? 'block' : 'none';
  });
}

async function generateAiPreviewForProjectGallery() {
  const btn = document.getElementById('po-proj-gallery-generate-ai-btn');
  const previewWrap = document.getElementById('po-proj-gallery-ai-preview-wrap');
  const previewImg = document.getElementById('po-proj-gallery-ai-preview-img');
  const previewHint = document.getElementById('po-proj-gallery-ai-preview-hint');
  const basePreviewWrap = document.getElementById('po-proj-gallery-base-preview-wrap');
  const basePreviewImg = document.getElementById('po-proj-gallery-base-preview-img');
  const errorEl = document.getElementById('po-proj-gallery-publish-error');
  errorEl.style.display = 'none';
  if (!projectSlots.length) {
    errorEl.textContent = I18n.t('fav.need_slots');
    errorEl.style.display = 'block';
    return;
  }
  btn.disabled = true;
  const originalLabel = btn.textContent;
  btn.textContent = I18n.t('gallery.generating_ai_status');
  // Base fixa (2026-08-03, pedido do usuário: "quero que a IA use dessa nova
  // imagem renderizada como base"): se existe foto realista salva pra este
  // projeto (loadedProjectFavorite.ai_preview_url, ver
  // savePhotorealRenderToProject/photoreal.js), ela vira a base mandada ao
  // Gemini em vez de tirar um screenshot novo do 3D — sempre no MESMO
  // tamanho/proporção (4:3 travado no photoreal.js), então
  // padImageToAspectRatio mais abaixo vira no-op pra ela (já bate exato) e a
  // IA nunca precisa redimensionar/inventar nada pra encaixar formato. Sem
  // foto salva, cai no comportamento de sempre (screenshot da cena limpa).
  const photorealBaseUrl = loadedProjectFavorite && loadedProjectFavorite.ai_preview_url;
  let usedCleanScene = false;
  try {
    let trimmedSnapshot;
    if (photorealBaseUrl) {
      trimmedSnapshot = await fetchUrlAsDataUrl(photorealBaseUrl);
    } else {
      usedCleanScene = renderProjectForAiSnapshot();
      // 2+ paredes (L/C-U) usa angle:'corner' (pedido do usuário 2026-07-26:
      // "Imagem de IA 2 paredes ou 3 paredes, camera pegando as duas
      // paredes") — {frontal:true} é quase Z puro, pensado pra 1 parede só,
      // e cortava as laterais fora do print principal. Ver comentário grande
      // em snapshot()/lastFitDir (viewer3d_composition.js).
      const snapshotOptions = getProjectWallCount() > 1 ? { angle: 'corner' } : { frontal: true };
      const rawSnapshot = (ViewerProject && ViewerProject.snapshot) ? ViewerProject.snapshot(snapshotOptions) : null;
      trimmedSnapshot = rawSnapshot ? await trimTransparentPng(rawSnapshot) : null;
    }
    if (!trimmedSnapshot) {
      errorEl.textContent = I18n.t('gallery.generate_ai_no_3d_error');
      errorEl.style.display = 'block';
      return;
    }
    const roomFamilyId = document.getElementById('po-proj-gallery-room-type').value || null;
    const roomLabel = roomFamilyId ? galleryFamilyName(roomFamilyId) : null;
    const aspectRatio = currentGalleryAspectRatio(await getImageAspectRatio(trimmedSnapshot));
    // Preenche a imagem ANTES de mandar pro Gemini, pra ela já sair
    // exatamente na proporção pedida acima (nunca corta/estica o projeto) —
    // ver padImageToAspectRatio, corrige o "muda o projeto pra caber".
    const sourceImageForAi = (await padImageToAspectRatio(trimmedSnapshot, aspectRatioLabelToValue(aspectRatio))) || trimmedSnapshot;

    if (basePreviewImg && basePreviewWrap) {
      basePreviewImg.src = sourceImageForAi;
      basePreviewWrap.style.display = 'block';
    }

    let imageDataUrl = sourceImageForAi;
    let renderStatus = 'failed';
    try {
      const angleRefImages = await captureProjectAngleReferences();
      const [{ moduleRefImages }, colorLabel, colorRefImages] = await Promise.all([
        fetchReferencePhotosForProject(),
        buildColorDescriptionForProject(),
        buildColorReferencesForProject()
      ]);
      const { data: renderData, error: renderError } = await supabaseClient.functions.invoke('generate-gallery-render', {
        body: { imageDataUrl: sourceImageForAi, moduleRefImages, colorLabel, colorRefImages, angleRefImages, roomLabel, aspectRatio }
      });
      if (!renderError && renderData && renderData.imageDataUrl) {
        imageDataUrl = renderData.imageDataUrl;
        renderStatus = 'ready';
      } else {
        console.error('generate-gallery-render falhou (projeto):', renderError, renderData);
        if (renderError && typeof renderError.context?.json === 'function') {
          renderError.context.json().then((body) => console.error('Corpo do erro:', body)).catch(() => {});
        }
      }
    } catch (aiErr) {
      console.error('generate-gallery-render: erro ao chamar a function (projeto):', aiErr);
    }

    projectGalleryAiPreviewImage = imageDataUrl;
    projectGalleryAiPreviewStatus = renderStatus;
    previewImg.src = imageDataUrl;
    previewHint.textContent = renderStatus === 'ready'
      ? I18n.t('gallery.generate_ai_ready_hint')
      : I18n.t('gallery.generate_ai_fallback_hint');
    previewWrap.style.display = 'block';
  } finally {
    if (usedCleanScene) generateProject3D();
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
}

const projGalleryGenerateAiBtn = document.getElementById('po-proj-gallery-generate-ai-btn');
if (projGalleryGenerateAiBtn) projGalleryGenerateAiBtn.addEventListener('click', generateAiPreviewForProjectGallery);

const projGalleryAiPreviewImgEl = document.getElementById('po-proj-gallery-ai-preview-img');
if (projGalleryAiPreviewImgEl) {
  projGalleryAiPreviewImgEl.addEventListener('click', () => {
    if (projGalleryAiPreviewImgEl.src) openGalleryLightbox(projGalleryAiPreviewImgEl.src);
  });
}
const projGalleryBasePreviewImgEl = document.getElementById('po-proj-gallery-base-preview-img');
if (projGalleryBasePreviewImgEl) {
  projGalleryBasePreviewImgEl.addEventListener('click', () => {
    if (projGalleryBasePreviewImgEl.src) openGalleryLightbox(projGalleryBasePreviewImgEl.src);
  });
}

// "⬇️ Baixar" / "↗️ Compartilhar" — mesma coisa da Composição (ver
// downloadGeneratedImage/shareGeneratedImage acima), só lendo
// projectGalleryAiPreviewImage em vez de galleryAiPreviewImage.
const projGalleryAiDownloadBtn = document.getElementById('po-proj-gallery-ai-download-btn');
if (projGalleryAiDownloadBtn) {
  projGalleryAiDownloadBtn.addEventListener('click', () => downloadGeneratedImage(projectGalleryAiPreviewImage, 'projeto'));
}
const projGalleryAiShareBtn = document.getElementById('po-proj-gallery-ai-share-btn');
if (projGalleryAiShareBtn) {
  projGalleryAiShareBtn.addEventListener('click', () => shareGeneratedImage(projectGalleryAiPreviewImage, 'projeto', document.getElementById('po-proj-gallery-ai-preview-hint')));
}

async function publishProjectToGallery() {
  const errorEl = document.getElementById('po-proj-gallery-publish-error');
  const statusEl = document.getElementById('po-proj-gallery-publish-status');
  errorEl.style.display = 'none';
  statusEl.textContent = '';
  if (!currentUser) {
    errorEl.textContent = I18n.t('fav.need_login');
    errorEl.style.display = 'block';
    return;
  }
  if (!projectSlots.length) {
    errorEl.textContent = I18n.t('fav.need_slots');
    errorEl.style.display = 'block';
    return;
  }
  const submitBtn = document.getElementById('po-proj-gallery-publish-submit-btn');
  submitBtn.disabled = true;
  try {
    let imageDataUrl;
    let renderStatus;
    if (projectGalleryAiPreviewImage) {
      imageDataUrl = projectGalleryAiPreviewImage;
      renderStatus = projectGalleryAiPreviewStatus;
    } else {
      // Mesma preferência de generateAiPreviewForProjectGallery: foto
      // realista salva (loadedProjectFavorite.ai_preview_url) vira a base,
      // sem screenshot novo nem re-render da cena limpa.
      const photorealBaseUrlFallback = loadedProjectFavorite && loadedProjectFavorite.ai_preview_url;
      const usedCleanSceneFallback = photorealBaseUrlFallback ? false : renderProjectForAiSnapshot();
      let trimmedSnapshot;
      if (photorealBaseUrlFallback) {
        trimmedSnapshot = await fetchUrlAsDataUrl(photorealBaseUrlFallback);
      } else {
        const rawSnapshot = (ViewerProject && ViewerProject.snapshot) ? ViewerProject.snapshot({ frontal: true }) : null;
        trimmedSnapshot = rawSnapshot ? await trimTransparentPng(rawSnapshot) : null;
      }
      imageDataUrl = trimmedSnapshot;
      renderStatus = trimmedSnapshot ? 'pending' : 'failed';
      if (trimmedSnapshot) {
        try {
          const fallbackFamilyId = document.getElementById('po-proj-gallery-room-type').value || null;
          const fallbackRoomLabel = fallbackFamilyId ? galleryFamilyName(fallbackFamilyId) : null;
          const fallbackAspectRatio = currentGalleryAspectRatio(await getImageAspectRatio(trimmedSnapshot));
          // Mesma correção do preview: preenche pra bater exatamente a
          // proporção pedida ao Gemini antes de mandar (ver padImageToAspectRatio).
          const fallbackSourceImage = (await padImageToAspectRatio(trimmedSnapshot, aspectRatioLabelToValue(fallbackAspectRatio))) || trimmedSnapshot;
          imageDataUrl = fallbackSourceImage;
          const fallbackAngleRefImages = await captureProjectAngleReferences();
          const [{ moduleRefImages }, fallbackColorLabel, fallbackColorRefImages] = await Promise.all([
            fetchReferencePhotosForProject(),
            buildColorDescriptionForProject(),
            buildColorReferencesForProject()
          ]);
          const { data: renderData, error: renderError } = await supabaseClient.functions.invoke('generate-gallery-render', {
            body: { imageDataUrl: fallbackSourceImage, moduleRefImages, colorLabel: fallbackColorLabel, colorRefImages: fallbackColorRefImages, angleRefImages: fallbackAngleRefImages, roomLabel: fallbackRoomLabel, aspectRatio: fallbackAspectRatio }
          });
          if (!renderError && renderData && renderData.imageDataUrl) {
            imageDataUrl = renderData.imageDataUrl;
            renderStatus = 'ready';
          }
        } catch (aiErr) {
          // segue com o screenshot 3D mesmo (renderStatus continua 'pending')
        } finally {
          if (usedCleanSceneFallback) generateProject3D();
        }
      } else if (usedCleanSceneFallback) {
        generateProject3D();
      }
    }

    try {
      imageDataUrl = await uploadGalleryImageToStorage(imageDataUrl);
    } catch (uploadErr) {
      console.error('Falha ao subir imagem da Galeria pro Storage (projeto), mantendo base64:', uploadErr);
    }

    const totalsMm = computeProjectTotalsMm();
    const priceSale = projectSlots.reduce((sum, slot) => sum + Number((slot.result && slot.result.total) || 0), 0);
    const priceCost = projectSlots.reduce((sum, slot) => sum + Number((slot.result && slot.result.cost_total) || 0), 0);
    const isAnonymous = !!document.getElementById('po-proj-gallery-anonymous-chk').checked;
    const familyId = document.getElementById('po-proj-gallery-room-type').value || null;

    const payload = {
      author_user_id: currentUser.id,
      author_display_name: currentUser.email || null,
      is_anonymous: isAnonymous,
      status: 'pending',
      render_status: renderStatus,
      ai_image_data_url: imageDataUrl,
      composition_name: loadedProjectFavorite ? loadedProjectFavorite.name : null,
      family_id: familyId,
      source_type: 'project',
      // Sempre a largura da parede 'main' (não a da parede ativa no
      // momento de publicar) — gallery_posts só guarda 1 número (não passou
      // pela migration 058 de wall_shape/wall_widths_mm ainda), então isso é
      // só um resumo aproximado pra forma dupla/C-U (a peça "Personalizar"
      // de um post assim reabre em 'single', só com essa largura — gap
      // conhecido, não implementado).
      wall_width_mm: getProjectWallWidthMm(Math.max(getProjectWallRoles().indexOf('main'), 0)),
      total_width_mm: totalsMm ? totalsMm.totalWidth : null,
      total_height_mm: totalsMm ? totalsMm.totalHeight : null,
      total_depth_mm: totalsMm ? totalsMm.totalDepth : null,
      price_sale: priceSale,
      price_cost: priceCost,
      colors_used: aggregateColorsUsedForProject(),
      slots: serializeProjectSlots()
    };
    const { error } = await supabaseClient.from('gallery_posts').insert(payload);
    if (error) throw error;
    // Vincula a imagem de IA final (já em URL pública do Storage, ver
    // uploadGalleryImageToStorage acima) ao projeto salvo, se este publish
    // veio de um projeto vinculado em "Meus Projetos" (migration 069) — pra
    // ela também aparecer no card do grid, além de ir pra Galeria pública.
    // Não crítico: publicar sem projeto salvo (loadedProjectFavorite null)
    // ou essa gravação falhando não deve travar o fluxo, a Galeria já foi
    // publicada de qualquer jeito.
    if (loadedProjectFavorite && loadedProjectFavorite.id) {
      try {
        await supabaseClient.from('user_projects').update({ ai_preview_url: imageDataUrl }).eq('id', loadedProjectFavorite.id);
        loadedProjectFavorite.ai_preview_url = imageDataUrl; // mesma base que a próxima geração de IA vai preferir (ver generateAiPreviewForProjectGallery)
      } catch (linkErr) { /* card de "Meus Projetos" só fica sem a imagem de IA */ }
    }
    statusEl.textContent = I18n.t('gallery.publish_success');
    document.getElementById('po-proj-gallery-anonymous-chk').checked = false;
    projectGalleryAiPreviewImage = null;
    projectGalleryAiPreviewStatus = null;
    document.getElementById('po-proj-gallery-ai-preview-wrap').style.display = 'none';
    const baseWrapAfterPublish = document.getElementById('po-proj-gallery-base-preview-wrap');
    if (baseWrapAfterPublish) baseWrapAfterPublish.style.display = 'none';
    setTimeout(() => {
      statusEl.textContent = '';
      document.getElementById('po-proj-gallery-publish-form').style.display = 'none';
    }, 4000);
  } catch (err) {
    errorEl.textContent = err.message || String(err);
    errorEl.style.display = 'block';
  } finally {
    submitBtn.disabled = false;
  }
}

const projGalleryPublishSubmitBtn = document.getElementById('po-proj-gallery-publish-submit-btn');
if (projGalleryPublishSubmitBtn) projGalleryPublishSubmitBtn.addEventListener('click', publishProjectToGallery);

// "Personalizar" num post de PROJETO (source_type='project') — mesma ideia
// de restoreGalleryPostAsComposition (ver acima), só que carrega em
// projectSlots (ver restoreFavoriteProject) + a largura do ambiente salva
// junto (post.wall_width_mm). id null: não existe (nem poderia, RLS
// owner-only) nenhuma user_projects correspondente a um post de outra
// pessoa.
function restoreGalleryPostAsProject(post) {
  restoreFavoriteProject({ id: null, name: post.composition_name || I18n.t('gallery.untitled'), slots: post.slots, wall_width_mm: post.wall_width_mm }, false);
}

// Despacha "Personalizar" pro restore certo conforme source_type do post
// (migration 056) — composição (coluna empilhada, sem largura de ambiente)
// ou projeto (módulos soltos, com wall_width_mm). Usada nos 3 pontos que
// abrem um post da Galeria fora da própria tela (card "Personalizar", link
// compartilhado ?galleryPost=, retomada de login pendente) — cada restore já
// troca de aba sozinho (Composição ou Projetos), então quem chama isto não
// precisa mais decidir a aba na mão.
function restoreGalleryPostBySourceType(post) {
  if (post && post.source_type === 'project') restoreGalleryPostAsProject(post);
  else restoreGalleryPostAsComposition(post);
}

// Delete/Backspace remove o módulo SELECIONADO do projeto (pedido do
// usuário, 2026-07-21: "clicando no modulo e delete ele deve ser deletado
// do projeto") — só age quando: a aba Projetos está visível, tem um módulo
// selecionado (ver selectProjectSlot) e o foco NÃO está num campo de texto
// (senão apagaria o módulo enquanto o cliente só queria apagar uma letra
// digitando a largura/nome de busca, etc.).
document.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Delete' && ev.key !== 'Backspace') return;
  if (!selectedProjectSlotId) return;
  const projectsTab = document.getElementById('po-tab-projects');
  if (!projectsTab || projectsTab.style.display === 'none') return;
  const active = document.activeElement;
  const tag = active && active.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (active && active.isContentEditable)) return;
  ev.preventDefault();
  removeProjectSlot(selectedProjectSlotId);
});

// ---------- Abas ----------

document.getElementById('po-sidebar').querySelectorAll('.portal-tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    // Aviso de alterações não salvas (pedido do usuário 2026-07-29: "depois
    // que mudo a cor dos modulos ja inseridos no projeto ele nao salva essa
    // alteracao... preciso no botao voltar uma mensagem salvar alteracoes")
    // — Projetos SEMPRE foi só-salva-manual (troca de cor, mover, redimensionar,
    // forma da parede... nada disso grava sozinho, só o botão "Salvar
    // projeto"/"Salvar alterações", ver saveProjectFavorite); antes disso não
    // existia nenhum aviso ao sair da aba, então dava pra perder edição sem
    // perceber. projectDirty (ver markProjectDirty) fica true a partir da
    // primeira edição de verdade e só volta a false ao salvar/carregar um
    // projeto — checado aqui, ANTES de qualquer outra coisa no handler, pra
    // cancelar a troca de aba inteira se o cliente desistir no confirm().
    if (
      document.getElementById('po-tab-projects').style.display !== 'none' &&
      btn.dataset.tab !== 'po-tab-projects' &&
      projectDirty &&
      !confirm(I18n.t('project.unsaved_changes_confirm'))
    ) {
      return;
    }
    // Mesmo aviso, agora pra tela do pedido (ver orderDetailHasUnsavedChanges/
    // po-order-detail-back-btn acima) — trocar de aba pelo menu lateral
    // enquanto a tela do pedido está aberta é OUTRO jeito de "sair" dela além
    // do botão "Voltar", e tinha o mesmo buraco (perdia troca de cor em massa
    // pendente/quantidade digitada sem confirmar).
    if (
      document.getElementById('po-order-detail-section').style.display !== 'none' &&
      btn.dataset.tab !== 'po-tab-my-orders' &&
      orderDetailHasUnsavedChanges() &&
      !confirm(I18n.t('order_detail.unsaved_changes_confirm'))
    ) {
      return;
    }
    // Segurança: se o cliente clicar numa aba de verdade enquanto o modal de
    // "escolher módulo da composição" está aberto por cima (ver
    // startCompositionSlotConfig), fecha o modal primeiro — equivalente a
    // cancelar, evita addTargetSlotIndex ficar "preso" e o botão de
    // "Adicionar" com o texto errado na próxima vez.
    if (addTargetSlotIndex !== null) {
      exitCompositionSlotConfig();
    }
    // Mesma segurança acima, pro modal de "configurar módulo do Projeto"
    // (ver startProjectSlotConfig) — nunca fica setado ao mesmo tempo que
    // addTargetSlotIndex.
    if (addTargetProjectSlotId !== null) {
      exitProjectSlotConfig();
    }
    document.getElementById('po-sidebar').querySelectorAll('.portal-tab-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.portal-tab-page').forEach((page) => { page.style.display = 'none'; });
    const target = document.getElementById(btn.dataset.tab);
    if (target) target.style.display = 'block';
    // Tela cheia ANTES de renderizar: renderProjectCanvas mede o clientWidth
    // do wrap pra calcular a escala px/mm — se a largura mudasse depois, o
    // desenho ficaria na escala da largura antiga até o próximo redraw.
    setProjectFullBleed(btn.dataset.tab === 'po-tab-projects');
    if (btn.dataset.tab === 'po-tab-projects') {
      // display:block já aplicado logo acima — canvas consegue medir
      // clientWidth do wrap agora pra calcular a escala px/mm (ver
      // renderProjectCanvas). Biblioteca reconstruída toda vez (barata,
      // allModules já está em memória) pra pegar módulo novo/alterado.
      renderProjectLibraryFilterBars();
      renderProjectLibrary();
      refreshProjectWallWidthInput();
      renderProjectCanvas();
    }
    if (btn.dataset.tab === 'po-tab-my-orders' && !myOrdersLoaded) {
      loadMyOrders();
    }
    // Recarrega a lista de módulos disponíveis pra colar na foto sempre que
    // a aba abre — o carrinho pode ter mudado desde a última visita.
    if (btn.dataset.tab === 'po-tab-room-view') {
      renderRoomCartPicker();
    }
    if (btn.dataset.tab === 'po-tab-composition') {
      renderCompositionSlots();
    }
    // Favoritos (migration 042) — recarrega a lista a cada visita (pode ter
    // salvo/renomeado/excluído desde a última vez).
    if (btn.dataset.tab === 'po-tab-favorites') {
      loadFavoritesList();
    }
    // Meus Projetos (pedido do usuário, 2026-07-24) — mesma ideia de
    // Favoritos: recarrega a cada visita (loadProjectFavoritesList já
    // existia, só rodava atrás do toggle antigo dentro da aba Projetos).
    if (btn.dataset.tab === 'po-tab-my-projects') {
      loadProjectFavoritesList();
    }
    // Galeria pública (migration 048) — recarrega a cada visita (outros
    // clientes podem ter publicado desde a última vez).
    if (btn.dataset.tab === 'po-tab-gallery') {
      loadGalleryList();
    }
    // Plano de Corte (migration 051) — carrega o catálogo de cores só na
    // primeira visita (cutlistInitialized), já parte com 1 linha vazia.
    if (btn.dataset.tab === 'po-tab-cutting-list') {
      initCuttingListTabIfNeeded();
    }
  });
});

// ---------- Autenticação ----------

// Guarda a composição que o VISITANTE tentou abrir/curtir sem estar logado
// — usada pra retomar a ação assim que o login (email/senha OU Google)
// terminar, em vez de simplesmente cair na tela normal sem contexto. Ver
// openAuthModal/resumePendingGalleryAction.
let pendingGalleryPostForAuth = null;

// Modal de login (pedido do usuário 2026-07-20: "deixa a pagina GALLERY
// publica... ao clicar customizar pedir login") — reaproveita o MESMO
// #po-auth-section de sempre (forms/ids intocados), só que agora abre por
// cima em vez de ser a única coisa na tela. `post` é opcional — quando
// existe, é a composição que o visitante estava tentando abrir (guardada
// em pendingGalleryPostForAuth pra retomar depois do login).
function openAuthModal(post) {
  pendingGalleryPostForAuth = post || null;
  document.getElementById('po-auth-section').classList.add('open');
  document.getElementById('po-login-error').style.display = 'none';
  document.getElementById('po-login-email').focus();
}

function closeAuthModal() {
  document.getElementById('po-auth-section').classList.remove('open');
}

// Chamada depois de login/cadastro bem-sucedido (email+senha OU Google via
// redirect, ver maybeOpenSharedGalleryPost/init) — se o visitante tinha
// clicado em "Customizar" numa composição específica antes de ser
// interrompido pelo login, abre ela agora em vez de só cair na tela normal.
function resumePendingGalleryAction() {
  if (!pendingGalleryPostForAuth) return;
  const post = pendingGalleryPostForAuth;
  pendingGalleryPostForAuth = null;
  restoreGalleryPostBySourceType(post);
}

function showLoggedOut() {
  currentUser = null;
  currentUserProfile = null;
  if (typeof refreshDealerUiVisibility === 'function') refreshDealerUiVisibility();
  closeAuthModal();
  document.getElementById('po-content').style.display = 'block';
  document.getElementById('po-logout-btn').style.display = 'none';
  // Modo visitante (pedido do usuário: Galeria pública) — só a aba Galeria
  // fica acessível na navegação (ver CSS #po-sidebar.guest-mode); o resto
  // do app continua exigindo conta de verdade.
  const sidebar = document.getElementById('po-sidebar');
  if (sidebar) sidebar.classList.add('guest-mode');
  const guestLoginBtn = document.getElementById('po-guest-login-btn');
  if (guestLoginBtn) guestLoginBtn.style.display = 'inline-block';
  const userChip = document.getElementById('po-user-chip');
  if (userChip) userChip.style.display = 'none';
  // Nomes de família (usados em galleryFamilyName, pro filtro/legenda de
  // cada card) normalmente só carregavam em showLoggedIn — visitante
  // também precisa, senão o "Ambiente" do card fica em branco. Tabela
  // pública (sem dado sensível), então seguro tentar mesmo sem sessão; se
  // a RLS um dia mudar pra exigir login, isso só volta a ficar vazio (sem
  // travar nada, ver loadTaxonomyFilters).
  if (typeof loadTaxonomyFilters === 'function') loadTaxonomyFilters().catch(() => {});
  const galleryTabBtn = document.querySelector('#po-sidebar .portal-tab-btn[data-tab="po-tab-gallery"]');
  if (galleryTabBtn) galleryTabBtn.click();
}

async function showLoggedIn(user) {
  currentUser = user;
  closeAuthModal();
  document.getElementById('po-content').style.display = 'block';
  document.getElementById('po-logout-btn').style.display = 'inline-block';
  // Sai do modo visitante — nav completa de volta, chip de usuário no lugar
  // do botão "Entrar".
  const sidebar = document.getElementById('po-sidebar');
  if (sidebar) sidebar.classList.remove('guest-mode');
  const guestLoginBtn = document.getElementById('po-guest-login-btn');
  if (guestLoginBtn) guestLoginBtn.style.display = 'none';
  const userChip = document.getElementById('po-user-chip');
  if (userChip) userChip.style.display = 'flex';
  // Chip de usuário no nav superior (reskin 2026-07-09) — só exibe o e-mail
  // da sessão logada, não há tabela de perfil/nome cadastrado pra puxar daqui.
  const userNameEl = document.getElementById('po-user-name');
  const userAvatarEl = document.getElementById('po-user-avatar');
  if (userNameEl) userNameEl.textContent = user.email || I18n.t('account.my_account');
  if (userAvatarEl) userAvatarEl.textContent = (user.email || '?').charAt(0).toUpperCase();
  myOrdersLoaded = false;
  currentDraftOrderId = null;
  cartItems = [];
  await loadColorRoles();
  await loadPricingMarkup();
  // Perfil (migration 051) — decide se a aba "Plano de Corte" aparece
  // (só Contractor/Administrador). Precisa vir antes de
  // applyCuttingListTabVisibility, e a config de preço do plano de corte
  // pode carregar em paralelo (não bloqueia o resto do login).
  await ensureOwnUserProfile();
  touchLastActive();
  await resolveDisplayMarginPct();
  refreshResaleMarginInput();
  refreshDealerUiVisibility();
  applyCuttingListTabVisibility();
  loadCuttingListPricingSettings();
  await loadTaxonomyFilters();
  await loadModules();
  // Depois de loadModules: refreshProjectAiButton() precisa de allModules
  // preenchido pra saber se existe módulo com função cadastrada.
  await loadProjectAiConfig();
  await loadDraftOrderIfAny();
}

document.getElementById('po-show-signup').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('po-login-block').style.display = 'none';
  document.getElementById('po-signup-block').style.display = 'block';
});
document.getElementById('po-show-login').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('po-signup-block').style.display = 'none';
  document.getElementById('po-login-block').style.display = 'block';
});

document.getElementById('po-login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('po-login-error');
  errorEl.style.display = 'none';
  const email = document.getElementById('po-login-email').value.trim();
  const password = document.getElementById('po-login-password').value;
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    errorEl.textContent = error.message;
    errorEl.style.display = 'block';
    return;
  }
  await showLoggedIn(data.user);
  await maybeOpenSharedGalleryPost();
  await maybeOpenSharedProjectImport();
  resumePendingGalleryAction();
});

// Fechar o modal de login: botão X, clicar no fundo escuro, ou Esc — igual
// ao padrão já usado no lightbox da galeria (openGalleryLightbox). Guest
// pode desistir e continuar navegando a Galeria sem logar.
document.getElementById('po-auth-modal-close').addEventListener('click', () => { pendingGalleryPostForAuth = null; closeAuthModal(); });
document.getElementById('po-auth-section').addEventListener('click', (ev) => {
  if (ev.target.id === 'po-auth-section') { pendingGalleryPostForAuth = null; closeAuthModal(); }
});
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && document.getElementById('po-auth-section').classList.contains('open')) {
    pendingGalleryPostForAuth = null;
    closeAuthModal();
  }
});

// Botão "Entrar" do topo (visitante, modo guest) — abre o modal sem
// composição pendente nenhuma (é só o cliente pedindo pra entrar direto,
// não uma ação interrompida).
const guestLoginBtnEl = document.getElementById('po-guest-login-btn');
if (guestLoginBtnEl) guestLoginBtnEl.addEventListener('click', () => openAuthModal(null));

// Login com Google (pedido do usuário 2026-07-20: "faz ligar com google da
// pessoa pra ser rapido") — supabaseClient.auth.signInWithOAuth manda a
// pessoa pro Google e VOLTA pra esta mesma URL (redirectTo). Se tinha uma
// composição pendente (pendingGalleryPostForAuth), embute ?galleryPost=<id>
// no redirect — maybeOpenSharedGalleryPost() já roda no init() assim que a
// sessão voltar, então reabre a composição certa sozinho, sem precisar de
// nenhum código extra pra esse caminho (diferente do login por senha, que
// não recarrega a página e por isso chama resumePendingGalleryAction()
// direto). Só funciona depois do Matt configurar o provider Google no
// painel do Supabase (Authentication > Providers) + OAuth client no Google
// Cloud Console — sem isso, o Supabase devolve um erro claro (mostrado
// em po-login-error), não trava nada.
document.getElementById('po-google-login-btn').addEventListener('click', async () => {
  const errorEl = document.getElementById('po-login-error');
  errorEl.style.display = 'none';
  const basePath = `${window.location.origin}${window.location.pathname}`;
  const redirectTo = pendingGalleryPostForAuth ? `${basePath}?galleryPost=${pendingGalleryPostForAuth.id}` : basePath;
  const { error } = await supabaseClient.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
  if (error) {
    errorEl.textContent = error.message;
    errorEl.style.display = 'block';
  }
});

document.getElementById('po-signup-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('po-signup-error');
  const successEl = document.getElementById('po-signup-success');
  errorEl.style.display = 'none';
  successEl.style.display = 'none';
  const name = document.getElementById('po-signup-name').value.trim();
  const phone = document.getElementById('po-signup-phone').value.trim();
  const email = document.getElementById('po-signup-email').value.trim();
  const password = document.getElementById('po-signup-password').value;
  const { data, error } = await supabaseClient.auth.signUp({
    email, password,
    options: { data: { name, phone } }
  });
  if (error) {
    errorEl.textContent = error.message;
    errorEl.style.display = 'block';
    return;
  }
  // Se o projeto Supabase exige confirmação de e-mail, não há sessão ainda
  // — pede pra checar o e-mail e ir pra tela de login depois de confirmar.
  if (data.session) {
    await showLoggedIn(data.user);
    resumePendingGalleryAction();
  } else {
    successEl.textContent = I18n.t('auth.signup_success');
    successEl.style.display = 'block';
    document.getElementById('po-signup-form').reset();
  }
});

// Mesmo guard de "alterações não salvas" que já existia pra troca de aba
// (ver po-sidebar .portal-tab-btn acima) — faltava aqui, então deslogar
// direto (sem salvar) descartava silenciosamente troca de cor/medida/posição
// feita na aba Projetos ou na tela do pedido: o próximo login carregava de
// novo os dados do banco (a última versão SALVA), que pareciam "voltar pro
// antigo" porque a edição nunca tinha sido persistida.
document.getElementById('po-logout-btn').addEventListener('click', async () => {
  if (
    document.getElementById('po-tab-projects').style.display !== 'none' &&
    projectDirty &&
    !confirm(I18n.t('project.unsaved_changes_confirm'))
  ) {
    return;
  }
  if (
    document.getElementById('po-order-detail-section').style.display !== 'none' &&
    orderDetailHasUnsavedChanges() &&
    !confirm(I18n.t('order_detail.unsaved_changes_confirm'))
  ) {
    return;
  }
  await supabaseClient.auth.signOut();
  showLoggedOut();
});

// Balão de info da peça (duplo-clique no 3D) — mesma lógica de client.js,
// só que lendo a unidade e escrevendo no tooltip com prefixo "po-" (ver
// portal.html). Mostra nome/referência, L/A/P e cor — nunca preço.
function showPieceInfoTooltip(info, clientX, clientY) {
  const tooltip = document.getElementById('po-piece-info-tooltip');
  if (!tooltip) return;
  const unitSelect = document.getElementById('po-unit-select');
  const unit = unitSelect ? unitSelect.value : 'mm';
  const dims = `${I18n.t('dims.width_abbrev')} ${formatDimension(info.width_mm, unit)} × ${I18n.t('dims.height_abbrev')} ${formatDimension(info.height_mm, unit)} × ${I18n.t('dims.depth_abbrev')} ${formatDimension(info.depth_mm, unit)}`;
  tooltip.innerHTML = `
    <button type="button" class="piece-info-close" aria-label="${I18n.t('tooltip.close_label')}">&times;</button>
    <strong>${info.reference || I18n.t('tooltip.piece_fallback')}</strong>
    <div>${dims}</div>
    ${info.color_name ? `<div>${info.color_name}</div>` : ''}
  `;
  tooltip.style.display = 'block';
  positionPieceInfoTooltip(tooltip, clientX, clientY);
  const closeBtn = tooltip.querySelector('.piece-info-close');
  if (closeBtn) closeBtn.addEventListener('click', () => { tooltip.style.display = 'none'; });
}

function positionPieceInfoTooltip(tooltip, clientX, clientY) {
  const rect = tooltip.getBoundingClientRect();
  let left = clientX + 14;
  let top = clientY + 14;
  if (left + rect.width > window.innerWidth) left = clientX - rect.width - 14;
  if (top + rect.height > window.innerHeight) top = clientY - rect.height - 14;
  tooltip.style.left = Math.max(8, left) + 'px';
  tooltip.style.top = Math.max(8, top) + 'px';
}

document.addEventListener('click', (e) => {
  const tooltip = document.getElementById('po-piece-info-tooltip');
  if (tooltip && tooltip.style.display !== 'none' && !tooltip.contains(e.target)) {
    tooltip.style.display = 'none';
  }
});

// Re-renderiza o conteúdo montado dinamicamente em JS (galeria, carrinho,
// meus pedidos, slots de composição) sempre que o idioma muda — esses
// pedaços já chamam I18n.t() na hora de montar a string, então não têm
// data-i18n pra applyStaticTranslations() re-aplicar sozinha, e ficariam
// "congelados" no idioma antigo até o próximo re-render natural.
if (typeof I18n !== 'undefined' && I18n.onLanguageChange) {
  I18n.onLanguageChange(() => {
    if (typeof allModules !== 'undefined' && allModules.length) renderModuleGallery();
    renderCart();
    if (myOrdersLoaded) loadMyOrders();
    if (compositionSlots.length) renderCompositionSlots();
    // Rótulos das linhas do ambiente (Ceiling/altura máx) traduzidos.
    applyViewerRoomEnvironment();
    // Cabeçalho/hint de unidade + textos traduzidos (Sim/Não do veio etc.)
    // da tabela do Plano de Corte — sem data-i18n porque o hint de limites
    // mistura tradução com valor formatado na unidade global (ver
    // updateCutlistUnitLabels/commitCutlistDimensionInput).
    if (typeof cutlistRows !== 'undefined' && cutlistRows.length) renderCutlistTable();
    else if (typeof updateCutlistUnitLabels === 'function') updateCutlistUnitLabels();
  });
}

// ==========================================================================
// Link público de visualização 3D (view3d, NOVO 02/09) — pedido do Matt:
// cliente/montador SEM CONTA abre um link e só vê a cena 3D pronta,
// podendo girar/dar zoom (OrbitControls nativo), sem nenhuma opção de
// editar.
//
// 1ª versão (mesmo dia) reaproveitava o painel "Visualizar 3D" aposentado
// (#po-proj-3d-wrap/generateProject3D) por parecer mais seguro (nunca teve
// arrastar/editar módulo) — só que o Matt testou ao vivo e voltou bugado:
// "depois que subiu jogou todos modulos na primeira parede". Esse painel é
// um caminho raro (só usado por foto realista/exportação AR), enquanto a
// Vista de Canto normal (ViewerProjectEdit, renderProjectCanvas) é o que
// TODO projeto salvo já renderiza certo todo dia — então a troca foi usar
// ESSA MESMA vista também pro visitante (restoreFavoriteProject já a
// desenha sozinho, não precisa chamar mais nada) e, pra não reabrir a porta
// de editar, travar na ORIGEM: attachProject3DEditDrag (o ÚNICO lugar que
// liga clique/arrastar/redimensionar nela, ver portal-06c-projetos-canvas-
// 3d-acoes.js) agora sai cedo se window.PO_VIEW3D_READONLY, setado bem no
// início desta função. O resto da interface (nav, login, biblioteca, painel
// de config, barra de ferramentas inteira, Salvar/Proposta/Enviar/$) fica
// escondido via CSS (body.po-view3d-guest, ver style.css) +
// simplifyToolbarForGuestView (abaixo) — ver bootView3DGuestView, chamado
// no init() ANTES de getSession(), pulando login por completo.
function endView3DBootOverlay() {
  // Tira o overlay "Carregando projeto..." (anti-flash inline no <head>/
  // topo do <body>) — precisa rodar tanto no sucesso quanto no erro, senão
  // um link com código inválido/expirado fica preso na tela de loading pra
  // sempre.
  document.documentElement.classList.remove('po-view3d-boot');
}

async function bootView3DGuestView(code) {
  // Trava attachProject3DEditDrag (portal-06c-projetos-canvas-3d-acoes.js) —
  // é o ÚNICO lugar que liga clique/arrastar/redimensionar na Vista de
  // Canto, então bloquear ALI é suficiente pra reaproveitar essa MESMA vista
  // (a que todo projeto salvo já desenha certo, ao contrário do painel
  // aposentado) sem abrir edição nenhuma pro visitante.
  window.PO_VIEW3D_READONLY = true;
  document.body.classList.add('po-view3d-guest');
  const contentEl = document.getElementById('po-content');
  if (contentEl) contentEl.style.display = 'block';
  const errorEl = document.getElementById('po-view3d-guest-error');
  try {
    const { data, error } = await supabaseClient.rpc('get_view3d_project', { p_code: code });
    const source = Array.isArray(data) ? data[0] : data;
    if (error || !source) {
      if (errorEl) { errorEl.textContent = I18n.t('view3d.not_found'); errorEl.style.display = 'block'; }
      endView3DBootOverlay();
      return;
    }
    await restoreFavoriteProject({
      id: null,
      name: source.name,
      slots: source.slots,
      wall_width_mm: source.wall_width_mm,
      wall_shape: source.wall_shape,
      wall_widths_mm: source.wall_widths_mm,
      wall_segments: source.wall_segments,
      ai_preview_url: null
    }, false);
    // restoreFavoriteProject() já chama renderProjectCanvas() por dentro,
    // que desenha a Vista de Canto (ViewerProjectEdit) sozinha — NÃO chamar
    // generateProject3D() aqui (1ª versão chamava): aquilo pinta um painel
    // separado e raramente exercitado (#po-proj-3d-wrap/ViewerProject, só
    // usado hoje por foto realista/exportação AR) que não estava dando conta
    // de layouts com mais de uma parede direito.
    renderView3DGuestHeader(source.name);
    simplifyToolbarForGuestView();
  } catch (err) {
    if (errorEl) { errorEl.textContent = I18n.t('view3d.not_found'); errorEl.style.display = 'block'; }
  } finally {
    endView3DBootOverlay();
  }
}

// Barra de ferramentas do editor normal (#po-proj-canvas-tools) tem MUITO
// botão que não serve pro visitante (Matt, 02/09, depois de ver o link ao
// vivo: "ainda tem toda aba la em cima, so quero maximo abertura. e vistas.
// mas os botoes salvar, enviar ordem, proposta, preco isso deve ser
// eliminado dessa visualizacao simples. nao precisa renderizar nem
// linhas..."). Em vez de reescrever a barra inteira só pro modo visitante,
// esconde grupo por grupo (cada grupo é um <div class="po-tb-group"> ou
// "po-tb-group-solo", ver portal.html) que NÃO tem nenhum dos botões que
// ficam — Vista (Frontal/Superior) e Projeção (Perspectiva/Paralelo). Tela
// cheia também fica (ajuda o "máximo abertura" pedido). Os filetes
// separadores (.po-tb-sep) somem juntos — o gap do flex já dá o espaçamento
// entre os grupos que sobraram, não precisam de linha divisória.
function simplifyToolbarForGuestView() {
  const tools = document.getElementById('po-proj-canvas-tools');
  if (!tools) return;
  const KEEP_BTN_IDS = [
    'po-proj-view-front-btn', 'po-proj-view-top-btn',
    'po-proj-camproj-btn', 'po-proj-camproj-orto-btn',
    'po-proj-fullscreen-btn'
  ];
  tools.querySelectorAll(':scope > .po-tb-group, :scope > .po-tb-group-solo').forEach((group) => {
    const keep = KEEP_BTN_IDS.some((id) => group.querySelector('#' + id));
    if (!keep) group.style.display = 'none';
  });
  tools.querySelectorAll(':scope > .po-tb-sep').forEach((sep) => { sep.style.display = 'none'; });
}

function renderView3DGuestHeader(name) {
  const headerEl = document.getElementById('po-view3d-guest-header');
  const nameEl = document.getElementById('po-view3d-guest-name');
  const toggleBtn = document.getElementById('po-view3d-measurements-toggle-btn');
  if (!headerEl) return;
  headerEl.style.display = 'flex';
  if (nameEl) nameEl.textContent = name || '';
  if (toggleBtn) {
    toggleBtn.textContent = I18n.t('view3d.measurements_btn_show');
    toggleBtn.addEventListener('click', () => {
      const panel = document.getElementById('po-view3d-guest-measurements');
      if (!panel) return;
      const showing = panel.style.display === 'block';
      if (showing) {
        panel.style.display = 'none';
        toggleBtn.textContent = I18n.t('view3d.measurements_btn_show');
      } else {
        renderView3DGuestMeasurements();
        panel.style.display = 'block';
        toggleBtn.textContent = I18n.t('view3d.measurements_btn_hide');
      }
    });
  }
}

// Lista de medidas (montador: "preciso saber medida, nao so olhar") —
// tamanho de cada módulo + distância até o chão/parede mais próxima,
// reaproveitando as MESMAS funções de limite que o painel "Posição no
// ambiente" do editor usa (projectFloorRoomBoundsMm/projectWallSlotXBoundsMm,
// 02/09) — o número aqui nunca diverge do que o app realmente desenhou.
// Unidade fixa em polegada (padrão do app pra público US, ver po-unit-select
// no HTML) — não depende de nenhuma preferência de conta, visitante não tem.
function renderView3DGuestMeasurements() {
  const panel = document.getElementById('po-view3d-guest-measurements');
  if (!panel) return;
  const unit = 'in';
  const fmt = (mm) => `${formatDimensionNumber(mm, unit)}${unitAbbrev(unit)}`;
  const rows = (projectSlots || []).map((slot) => {
    const dims = `${I18n.t('view3d.measurements_dims_label')}: ${fmt(slot.width_mm)} × ${fmt(slot.height_mm)} × ${fmt(slot.depth_mm)}`;
    let posLine;
    if (isFloorSlot(slot)) {
      const b = projectFloorRoomBoundsMm(slot);
      const left = Number(slot.floor_x_mm || 0) - b.xMin;
      const floorY = Number(slot.fineOffsetYMm || 0);
      posLine = `${I18n.t('project.position_left_label')}: ${fmt(left)} · ${I18n.t('project.position_floor_label')}: ${fmt(floorY)}`;
    } else {
      const b = projectWallSlotXBoundsMm(slot);
      const left = Number(slot.x_mm || 0) - b.min;
      posLine = `${I18n.t('project.position_left_label')}: ${fmt(left)} · ${I18n.t('project.position_floor_label')}: ${fmt(slot.floor_height_mm || 0)}`;
    }
    const nameLabel = (slot.module && slot.module.name) || '';
    return `<div class="po-view3d-measure-row"><strong>${nameLabel}</strong><br>${dims}<br>${posLine}</div>`;
  }).join('');
  panel.innerHTML = `<h3>${I18n.t('view3d.measurements_title')}</h3>${rows}`;
}

(async function init() {
  try {
    Viewer3D.init('po-viewer3d-canvas');
    Viewer3D.onPieceDoubleClick(showPieceInfoTooltip);
  } catch (err) {
    // Sem Three.js/WebGL o portal continua funcionando, só sem o 3D.
  }

  // Link público de visualização 3D (view3d, NOVO 02/09) — ?view3d=CODE na
  // URL pula LOGIN INTEIRO (é o ponto da feature: cliente/montador sem
  // conta) e cai direto no modo visitante-kiosk. Checado ANTES de
  // getSession() de propósito — nem tenta achar sessão nenhuma.
  const view3dCode = new URLSearchParams(window.location.search).get('view3d');
  if (view3dCode) {
    await bootView3DGuestView(view3dCode);
    return;
  }

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    await showLoggedIn(session.user);
    // Precisa vir DEPOIS de showLoggedIn (usa currentUser) — ver
    // maybeLoadGalleryPostForAdminEdit.
    await maybeLoadGalleryPostForAdminEdit();
    await maybeOpenSharedGalleryPost();
    await maybeOpenSharedProjectImport();
  } else {
    showLoggedOut();
  }

  supabaseClient.auth.onAuthStateChange(async (event) => {
    if (event === 'SIGNED_OUT') showLoggedOut();
  });
})();
// fim de portal.js
