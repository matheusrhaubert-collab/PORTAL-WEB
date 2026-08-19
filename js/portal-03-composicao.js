// portal-03-composicao.js — parte 3/9 de js/portal.js (ver portal-01-core-catalogo.js).
// Aba "Composição" (hoje oculta, ver composicao_favoritos_hidden_meus_projetos.md)
// — montar vários módulos juntos, cor por peça, gerar 3D — e os Favoritos
// dela (salvar/restaurar composição favorita).

// Botão "↺ Nova composição" (pedido do usuário, 2026-07-19: "colcoar botao
// la em cima noa composition. ai zera pra iniciar um novo") — zera
// compositionSlots e todo estado de UI dependente, sem precisar remover
// módulo por módulo. NÃO mexe em pedidos já adicionados (cartItems) nem em
// favoritos já salvos (user_compositions) — só a composição em EDIÇÃO na
// tela. Confirma antes se já tem algo montado (mesmo padrão de
// fav.delete_confirm, ver saveCompositionFavorite/deleteFavorite).
function resetComposition() {
  if (compositionSlots.length && !confirm(I18n.t('composition.reset_confirm'))) return;
  compositionSlots = [];
  // Solta o vínculo com o favorito que estava sendo editado (se algum) —
  // senão "Salvar alterações" continuaria mirando o favorito antigo depois
  // de começar do zero.
  loadedFavorite = null;
  refreshFavoriteButtons();
  renderCompositionSlots();
  const comp3dWrap = document.getElementById('po-comp-3d-wrap');
  if (comp3dWrap) comp3dWrap.style.display = 'none';
  const comp3dTotal = document.getElementById('po-comp-3d-total');
  if (comp3dTotal) comp3dTotal.textContent = '';
  const favStatus = document.getElementById('po-comp-fav-status');
  if (favStatus) favStatus.textContent = '';
  const compError = document.getElementById('po-comp-error');
  if (compError) compError.style.display = 'none';
  // Prévia de IA/formulário de publicar na Galeria eram da composição
  // ANTERIOR — não faz sentido continuar mostrando (ver
  // generateAiPreviewForGallery/galleryPublishToggleBtn).
  galleryAiPreviewImage = null;
  galleryAiPreviewStatus = null;
  const aiPreviewWrap = document.getElementById('po-gallery-ai-preview-wrap');
  if (aiPreviewWrap) aiPreviewWrap.style.display = 'none';
  const basePreviewWrap = document.getElementById('po-gallery-base-preview-wrap');
  if (basePreviewWrap) basePreviewWrap.style.display = 'none';
  const publishForm = document.getElementById('po-gallery-publish-form');
  if (publishForm) publishForm.style.display = 'none';
  // Solta o vínculo com o post da Galeria em edição admin (se algum) — ver
  // maybeLoadGalleryPostForAdminEdit/saveGalleryPostAdminEdit. Também tira o
  // ?editGalleryPost=<id> da URL (sem recarregar a página) pra um F5
  // acidental não voltar a carregar o post antigo.
  editingGalleryPostId = null;
  editingGalleryPostName = null;
  updateGalleryAdminEditBanner();
  const adminEditStatus = document.getElementById('po-comp-admin-edit-status');
  if (adminEditStatus) adminEditStatus.style.display = 'none';
  if (new URLSearchParams(window.location.search).has('editGalleryPost')) {
    const url = new URL(window.location.href);
    url.searchParams.delete('editGalleryPost');
    window.history.replaceState({}, '', url);
  }
}
const compResetBtn = document.getElementById('po-comp-reset-btn');
if (compResetBtn) compResetBtn.addEventListener('click', resetComposition);

function renderCompositionSlots() {
  const container = document.getElementById('po-comp-slots');
  if (!container) return;
  container.innerHTML = '';
  // Unidade GLOBAL (po-unit-select) — mesmo motivo do card da vitrine
  // (renderModuleGallery) e do carrinho (renderCartItemRow): a medida de
  // cada card da composição também precisa seguir mm/cm/m/ft/pol atual, não
  // ficar travada em mm.
  const compUnit = (document.getElementById('po-unit-select') || {}).value || 'mm';

  // Divisor "+" ANTES de cada COLUNA preenchida (pedido do usuário: "acrescentar
  // algum módulo no meio de dois já configurados") — inserir na posição idx
  // empurra essa coluna e todas depois dela uma casa pra direita. O append no
  // final continua sendo o card vazio de sempre, não precisa de divisor ali.
  const addDivider = (insertIndex) => {
    const divider = document.createElement('div');
    divider.className = 'po-comp-slot-divider';
    divider.textContent = '+';
    divider.title = I18n.t('composition.insert_here_title');
    divider.addEventListener('click', () => startCompositionSlotConfig(insertIndex, { insert: true }));
    container.appendChild(divider);
  };

  // Um card por slot (mesmo HTML/comportamento de sempre) — extraído do
  // antigo forEach pra poder ser chamado tanto pro slot BASE de uma coluna
  // quanto pro slot EMPILHADO em cima dele (ver buildColumn abaixo).
  // slotIndex aqui é sempre o índice de verdade em compositionSlots (não a
  // posição visual), usado por editCompositionSlot/remoção.
  const buildSlotCard = (slot, slotIndex) => {
    const div = document.createElement('div');
    div.className = 'po-comp-slot filled';
    div.title = I18n.t('composition.click_to_edit_title');
    div.innerHTML = `
      ${slot.thumbnail_data_url ? `<img class="po-comp-slot-thumb" src="${slot.thumbnail_data_url}" alt="${slot.module.name}" />` : ''}
      <div class="po-comp-slot-name">${slot.module.name}</div>
      <div class="po-comp-slot-dims">${formatDimension(slot.width_mm, compUnit)} x ${formatDimension(slot.height_mm, compUnit)} x ${formatDimension(slot.depth_mm, compUnit)}</div>
      <label class="po-comp-slot-floor-height">
        <span>${I18n.t('composition.floor_height_short_label')}</span>
        <input type="text" inputmode="decimal" class="po-comp-slot-floor-height-input" value="${formatDimensionNumber(slot.floor_height_mm || 0, compUnit)}" />
        <span class="po-comp-slot-floor-height-unit">${unitAbbrev(compUnit)}</span>
      </label>
      <button type="button" class="po-comp-slot-remove" title="${I18n.t('composition.remove_title')}">×</button>
    `;
    // Clicar no card (fora do X) reabre o configurador já preenchido com a
    // configuração salva deste slot — pedido do usuário: "poder editar os
    // módulos... antes de adicionar ao pedido".
    div.addEventListener('click', () => editCompositionSlot(slotIndex));
    div.querySelector('.po-comp-slot-remove').addEventListener('click', (ev) => {
      ev.stopPropagation(); // não deixa o clique "vazar" pro card e abrir edição junto
      // Remove o slot clicado E, se ele for a BASE de uma coluna, o que
      // estiver empilhado em cima dele junto (senão sobraria um
      // stack_on_id órfão apontando pra um slot que não existe mais).
      compositionSlots = compositionSlots.filter((s) => s.id !== slot.id && s.stack_on_id !== slot.id);
      renderCompositionSlots();
    });

    // Altura do chão editável DIRETO no card (pedido do usuário, 2026-07-16:
    // "poder escolher a altura de cada item... que eu possa mexer depois de
    // inserido vendo os dois no mesmo ambiente") — não precisa reabrir o
    // configurador completo pra ajustar isso. stopPropagation no <label>
    // (cobre clique tanto no texto quanto no input, já que o clique borbulha
    // do input até o label) evita que o clique "vaze" pro card e abra a
    // edição do módulo. Só atualiza os totais (chips) + regera o 3D se já
    // estiver aberto — NÃO chama renderCompositionSlots() de novo aqui,
    // senão o campo perderia o foco a cada edição.
    const floorHeightLabel = div.querySelector('.po-comp-slot-floor-height');
    const floorHeightInput = div.querySelector('.po-comp-slot-floor-height-input');
    if (floorHeightLabel) floorHeightLabel.addEventListener('click', (ev) => ev.stopPropagation());
    if (floorHeightInput) {
      floorHeightInput.addEventListener('change', () => {
        // Texto livre na unidade global (compUnit — mesma variável usada
        // pra formatar largura/altura/profundidade deste card, ver início de
        // renderCompositionSlots), igual ao campo do modal (ver
        // applyFloorHeightInput). Texto inválido é ignorado — devolve o
        // valor válido anterior formatado em vez de zerar o slot.
        const mm = parseDimensionInput(floorHeightInput.value, compUnit);
        const v = mm === null || isNaN(mm) ? Number(slot.floor_height_mm || 0) : Math.max(0, mm);
        slot.floor_height_mm = v;
        floorHeightInput.value = formatDimensionNumber(v, compUnit);
        renderCompositionTotals();
        const comp3dWrap = document.getElementById('po-comp-3d-wrap');
        if (comp3dWrap && comp3dWrap.style.display !== 'none') generateComposition3D();
      });
      floorHeightInput.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); floorHeightInput.blur(); }
      });
    }
    return div;
  };

  // Colunas = slots-base (sem stack_on_id), na ordem em que aparecem em
  // compositionSlots (esquerda->direita, como sempre). Cada coluna pode ter
  // no máximo um slot empilhado em cima dela (stack_on_id === base.id) —
  // "um ou 2 blocos a escolher", pedido do usuário.
  const stackedByBaseId = new Map();
  compositionSlots.forEach((s) => { if (s.stack_on_id) stackedByBaseId.set(s.stack_on_id, s); });

  compositionSlots.forEach((base, baseIdx) => {
    if (base.stack_on_id) return; // só itera colunas (bases) aqui — o empilhado é desenhado junto da base dele
    addDivider(baseIdx);

    const stacked = stackedByBaseId.get(base.id);
    const columnWrap = document.createElement('div');
    columnWrap.className = 'po-comp-slot-column';
    columnWrap.style.display = 'flex';
    columnWrap.style.flexDirection = 'column';
    columnWrap.style.gap = '6px';

    // Botão "Colocar em cima" ACIMA do quadro (pedido do usuário, 2026-07-16:
    // "quero o botao em cima do quadro ao inves de baixo") — só aparece numa
    // coluna que ainda não tem os 2 blocos (base + empilhado); clicar nele
    // abre o configurador igual ao card vazio do final, mas marcando
    // addStackOnId pra esse novo módulo nascer na MESMA coluna de `base`,
    // sem avançar a fileira.
    if (!stacked) {
      const stackBtn = document.createElement('button');
      stackBtn.type = 'button';
      stackBtn.className = 'po-comp-slot-stack-btn secondary';
      stackBtn.textContent = '↑ ' + I18n.t('composition.add_stacked_btn');
      stackBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        startCompositionSlotConfig(compositionSlots.length, { stackOnId: base.id });
      });
      columnWrap.appendChild(stackBtn);
    }

    if (stacked) {
      // Empilhado desenhado ACIMA da base na lista (fisicamente fica em
      // cima dele no ambiente) — índice de verdade em compositionSlots via
      // indexOf, já que stackedByBaseId guarda o objeto, não a posição.
      columnWrap.appendChild(buildSlotCard(stacked, compositionSlots.indexOf(stacked)));
    }
    columnWrap.appendChild(buildSlotCard(base, baseIdx));

    container.appendChild(columnWrap);
  });

  // Sempre um slot vazio no final — é ele que o cliente clica pra adicionar
  // o PRÓXIMO módulo (índice = tamanho atual da fileira).
  const emptyDiv = document.createElement('div');
  emptyDiv.className = 'po-comp-slot empty';
  emptyDiv.innerHTML = `<span class="po-comp-slot-plus">+</span><span>${I18n.t('composition.add_module_slot')}</span>`;
  emptyDiv.addEventListener('click', () => startCompositionSlotConfig(compositionSlots.length));
  container.appendChild(emptyDiv);

  const genBtn = document.getElementById('po-comp-generate-btn');
  const genHint = document.getElementById('po-comp-generate-hint');
  genBtn.disabled = compositionSlots.length < 2;
  genHint.style.display = compositionSlots.length < 2 ? 'block' : 'none';

  renderCompositionTotals();

  // Se o 3D da composição JÁ estava aberto (cliente clicou "Gerar 3D" antes)
  // e agora editou/inseriu/removeu um módulo, regera sozinho em vez de
  // deixar o desenho velho na tela até o próximo clique manual — pedido do
  // usuário: "quando voltei precisei gerar de novo pra atualizar... talvez
  // na alteração já deva gerar automático pra não confundir".
  const comp3dWrap = document.getElementById('po-comp-3d-wrap');
  if (comp3dWrap && comp3dWrap.style.display !== 'none') {
    if (compositionSlots.length >= 2) {
      generateComposition3D();
    } else {
      // Composição deixou de ter módulos suficientes pra gerar (removeu até
      // sobrar só 1) — esconde o resultado velho em vez de deixar uma cena
      // desatualizada visível.
      comp3dWrap.style.display = 'none';
    }
  }
}

// Reabre o configurador já preenchido com a configuração salva de um slot da
// composição (clicou no card, não no X de remover) — mantém o MESMO módulo
// do slot (não dá pra trocar de módulo num slot já configurado nesta
// versão), só restaura cor/medida/opcionais/modelo/sub-configurações salvas
// em vez de voltar tudo pro padrão do módulo. Reaproveita 100% do modo
// "Composição" que já existe (startCompositionSlotConfig) — ao confirmar,
// o handler de po-add-item-btn sobrescreve esta MESMA posição (addTargetSlotIndex),
// exatamente como preencher um slot vazio.
async function editCompositionSlot(slotIndex) {
  const slot = compositionSlots[slotIndex];
  if (!slot) return;
  startCompositionSlotConfig(slotIndex);
  try {
    await selectModule(slot.module.id);
    if (!currentModule) throw new Error(I18n.t('composition.edit_module_unavailable_error'));
    restoreSlotStateIntoConfigurator(slot);
  } catch (err) {
    // Módulo pode ter sido desativado/removido do catálogo desde que este
    // slot foi configurado -- não deixa o modal quebrado aberto, volta pra
    // composição e avisa em vez de estourar um erro sem tratamento.
    exitCompositionSlotConfig();
    const errorEl = document.getElementById('po-comp-error');
    if (errorEl) {
      errorEl.textContent = I18n.t('composition.edit_module_unavailable_error');
      errorEl.style.display = 'block';
    }
  }
}

// Aplica, na tela de configuração recém-aberta pro MESMO módulo (ver
// editCompositionSlot), tudo que o cliente já tinha escolhido antes: medida
// exata, cor por papel, modelo de dobradiça/corrediça, quantidade de
// prateleiras/gavetas configuráveis, opcionais marcados e sub-configuração de
// medida de peças-módulo aninhadas. selectModule() já deixou tudo no valor
// PADRÃO do módulo — aqui só sobrescreve com o que estava salvo no slot.
function restoreSlotStateIntoConfigurator(slot) {
  // Altura do chão salva deste slot — startCompositionSlotConfig (chamado
  // por editCompositionSlot antes desta função) já preencheu o campo com um
  // palpite (0, ou sugestão de empilhamento), mas editar um slot já
  // preenchido é o valor de VERDADE que estava salvo, não um palpite. Feito
  // ANTES de mexer no slider de altura (abaixo) de propósito: o teto
  // efetivo (ceilingMaxHeightMm) depende de currentFloorHeightMm (pedido do
  // usuário, 2026-07-16: "ele tem que considerar de onde parte do chao pra
  // dar o maximo") — se restaurasse a altura primeiro, o clamp usaria o
  // max ANTIGO (calculado com a altura do chão errada, geralmente 0).
  currentFloorHeightMm = Number(slot.floor_height_mm || 0);
  refreshFloorHeightInputUI();
  applyRoomSettingsToConfigurator();

  const widthInput = document.getElementById('po-width-input');
  const heightInput = document.getElementById('po-height-input');
  const depthInput = document.getElementById('po-depth-input');
  if (widthInput) widthInput.value = clamp(slot.width_mm, parseFloat(widthInput.min), parseFloat(widthInput.max));
  if (heightInput) heightInput.value = clamp(slot.height_mm, parseFloat(heightInput.min), parseFloat(heightInput.max));
  if (depthInput) depthInput.value = clamp(slot.depth_mm, parseFloat(depthInput.min), parseFloat(depthInput.max));
  setupDimensionPresetsUI();
  updateDimensionUnitUI();

  // Cores — re-renderiza os grupos de swatches já com a cor salva marcada
  // (ver renderColorRoleSwatchGroups, agora aceita presets opcionais) —
  // colorsByRole pro nível raiz E pieceColorOverrides (migration 046) por
  // peça-módulo aninhada com cor separada.
  renderColorRoleSwatchGroups(slot.colorsByRole, slot.pieceColorOverrides);

  const hingeSelect = document.getElementById('po-hinge-model-select');
  const slideSelect = document.getElementById('po-slide-model-select');
  if (hingeSelect && slot.hingeModel) hingeSelect.value = slot.hingeModel.id;
  if (slideSelect && slot.slideModel) slideSelect.value = slot.slideModel.id;

  document.querySelectorAll('.po-shelf-qty-input').forEach((input) => {
    const saved = slot.shelfQuantities ? slot.shelfQuantities[input.dataset.pieceId] : undefined;
    if (saved !== undefined && saved !== null) input.value = saved;
  });

  selectedOptionalComponentIds = new Set(slot.selectedOptionalIds || []);
  renderOptionalComponents();

  // Sub-configuração de medida de peças-módulo aninhadas (migration 036) —
  // marca os eixos salvos como TOCADOS, senão o próximo recálculo os
  // sobrescreveria de volta pro valor "acompanha o pai" (ver
  // syncUntouchedPieceDimSliders/touchedPieceDimAxes).
  touchedPieceDimAxes = new Set();
  Object.keys(slot.dimOverrides || {}).forEach((pieceId) => {
    const axesMm = slot.dimOverrides[pieceId];
    Object.keys(axesMm).forEach((key) => {
      const axis = key.replace('_mm', '');
      const slider = document.querySelector(`.po-piece-subconfig-slider[data-piece-id="${pieceId}"][data-axis="${axis}"]`);
      if (!slider) return;
      slider.value = axesMm[key];
      touchedPieceDimAxes.add(`${pieceId}:${axis}`);
      const field = slider.closest('.dim-field');
      const resetLink = field ? field.querySelector('.po-piece-subconfig-reset') : null;
      if (resetLink) resetLink.style.display = 'inline';
      if (slider._refreshLabels) slider._refreshLabels();
    });
  });

  recalculatePreview();
}

// Medidas TOTAIS da composição, em mm — como os módulos ficam sempre lado a
// lado da esquerda pra direita (ver hint da aba), a largura total é a SOMA
// de cada slot; altura e profundidade não se somam (são medidas "de pé",
// lado a lado), usa o MAIOR valor entre os slots. Mesma fórmula usada tanto
// pra escrever os chips acima da fileira quanto pras cotas desenhadas na
// cena 3D (ver generateComposition3D/ViewerComposition.render) — um só lugar
// pra essa conta, os dois lugares sempre concordam.
// Empilhamento (2026-07-16): largura total soma uma vez POR COLUNA (base +
// empilhado compartilham o mesmo X no 3D — ver viewer3d_composition.js —
// então contar os dois separadamente infla a largura); usa a MAIOR largura
// entre base/empilhado como largura da coluna (não força os dois a serem
// iguais). Altura total passa a considerar floor_height_mm: o topo de cada
// bloco é floor_height_mm + height_mm, e a altura total da composição é o
// maior topo entre todos os blocos (não só o maior height_mm sozinho).
// Sem nenhum slot empilhado (stack_on_id sempre null, floor_height_mm
// sempre 0 — caso de toda composição existente antes desta feature), essa
// conta é IDÊNTICA à antiga: colunas = todos os slots, largura da coluna =
// width_mm do próprio, topo = height_mm.
function computeCompositionTotalsMm() {
  if (compositionSlots.length === 0) return null;
  const baseSlots = compositionSlots.filter((s) => !s.stack_on_id);
  const stackedByBaseId = new Map();
  compositionSlots.forEach((s) => { if (s.stack_on_id) stackedByBaseId.set(s.stack_on_id, s); });

  let totalWidth = 0;
  let totalHeight = 0;
  baseSlots.forEach((base) => {
    const stacked = stackedByBaseId.get(base.id);
    totalWidth += Math.max(Number(base.width_mm || 0), stacked ? Number(stacked.width_mm || 0) : 0);
    const baseTop = Number(base.floor_height_mm || 0) + Number(base.height_mm || 0);
    const stackedTop = stacked ? Number(stacked.floor_height_mm || 0) + Number(stacked.height_mm || 0) : 0;
    totalHeight = Math.max(totalHeight, baseTop, stackedTop);
  });

  return {
    totalWidth,
    totalHeight,
    totalDepth: Math.max(...compositionSlots.map((s) => Number(s.depth_mm || 0)))
  };
}

// Chips de texto acima da fileira de slots com as medidas totais — sempre
// mostra as 3 (pedido do usuário: "não precisa selecionar ou não", depois de
// pedir inicialmente pra poder esconder cada uma). Fica útil mesmo antes de
// gerar o 3D (ver buildDimensionAnnotations em viewer3d_composition.js, que
// desenha as mesmas medidas direto no desenho quando o 3D já foi gerado).
function renderCompositionTotals() {
  const line = document.getElementById('po-comp-totals-line');
  if (!line) return;
  const totals = computeCompositionTotalsMm();
  if (!totals) { line.innerHTML = ''; return; }

  const unit = (document.getElementById('po-unit-select') || {}).value || 'mm';
  line.innerHTML = [
    `<span class="po-comp-total-chip">${I18n.t('composition.total_width_label')}: ${formatDimension(totals.totalWidth, unit)}</span>`,
    `<span class="po-comp-total-chip">${I18n.t('composition.total_height_label')}: ${formatDimension(totals.totalHeight, unit)}</span>`,
    `<span class="po-comp-total-chip">${I18n.t('composition.total_depth_label')}: ${formatDimension(totals.totalDepth, unit)}</span>`
  ].join('');
}

// Abre o catálogo/configurador de "Novo Orçamento" pra escolher e configurar
// o módulo deste slot — reaproveita a tela inteira (grade de módulos,
// medidas, cores, opcionais) tal como já funciona pra adicionar ao carrinho,
// SEM duplicar nada. A diferença pro fluxo normal: em vez de trocar de aba
// de verdade (o que esconderia a Composição por trás), abre "Novo Orçamento"
// como um MODAL de tela cheia por cima da própria aba Composição — o
// cliente nunca "sai" visualmente da tela de composição, só volta pra ela
// (fechando o modal) ao confirmar ou cancelar. Só marca addTargetSlotIndex
// pra po-add-item-btn saber que o destino deste resultado é um slot da
// composição, não o pedido de verdade. opts.insert=true (divisor "+" entre
// cards) marca o modo INSERÇÃO (ver compositionInsertMode) em vez de
// sobrescrever/editar a posição.
// Atalhos rápidos pro campo de altura do chão — "0 (chão)" e "Rodapé
// (Xmm)" (pedido do usuário, 2026-07-16: "deve ter a opcao proxima do
// rodape, ou 0 ou rodape de padrao e livre como ja esta") — o campo
// continua 100% livre pra digitar qualquer valor, isto é só um atalho pros
// dois casos mais comuns. Rodapé usa roomSettings.baseboard_mm (mesmo
// valor configurado em po-baseboard-input, topo do portal — ver "Pé
// direito (ceiling) e rodapé (baseboard) da casa do cliente" no topo do
// arquivo), arredondado só pro RÓTULO do chip (o valor aplicado no campo é
// o mm exato, sem arredondar).
function renderFloorHeightPresetChips() {
  const wrap = document.getElementById('po-comp-floor-height-preset-chips');
  if (!wrap) return;
  wrap.innerHTML = '';
  const unit = (document.getElementById('po-unit-select') || {}).value || 'mm';
  const presets = [
    { value: 0, label: I18n.t('step2.floor_height_preset_floor') },
    // Rótulo formatado na unidade global atual (não trava em "mm") — mesmo
    // motivo do resto do campo, ver refreshFloorHeightInputUI.
    { value: roomSettings.baseboard_mm, label: `${I18n.t('step2.floor_height_preset_baseboard')} (${formatDimension(roomSettings.baseboard_mm, unit)})` }
  ];
  presets.forEach((p) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'dim-preset-chip';
    chip.textContent = p.label;
    chip.addEventListener('click', () => {
      currentFloorHeightMm = p.value;
      refreshFloorHeightInputUI();
      // Re-trava a régua de altura pro novo teto efetivo (ver
      // applyFloorHeightInput/ceilingMaxHeightMm — mesmo motivo).
      applyRoomSettingsToConfigurator();
      // Clicar num chip não passa pelo 'change' do campo de texto (ver
      // applyFloorHeightInput), então precisa forçar o refit aqui também,
      // senão a câmera não acompanha o chip "Rodapé" erguendo o módulo (ver
      // comentário em applyFloorHeightInput).
      viewer3dNeedsRefit = true;
      recalculatePreview();
    });
    wrap.appendChild(chip);
  });
}

function startCompositionSlotConfig(slotIndex, opts) {
  opts = opts || {};
  addTargetSlotIndex = slotIndex;
  compositionInsertMode = !!opts.insert;
  // Empilhamento (ver botão "Colocar em cima" em renderCompositionSlots):
  // opts.stackOnId = id do slot-base desta coluna. Guarda em addStackOnId
  // pro handler de po-add-item-btn saber que este módulo (novo, sempre
  // ADICIONADO no final do array — nunca insert) deve nascer com
  // stack_on_id apontando pra essa base, em vez de abrir coluna nova.
  addStackOnId = opts.stackOnId || null;
  highlightSelectedModuleCard('');
  document.getElementById('po-config-section').style.display = 'none';
  document.getElementById('po-module-description').textContent = '';
  currentModule = null;
  lastItemResult = null;

  document.getElementById('po-comp-mode-banner').style.display = 'flex';
  document.getElementById('po-comp-mode-slot-label').textContent = String(slotIndex + 1);
  document.getElementById('po-add-item-btn').textContent = I18n.t('step2.add_to_composition_btn');

  // Altura do chão (mm) — só existe em modo Composição, mesma visibilidade
  // do banner acima (ver comentário no HTML, portal.html). Empilhando em
  // cima de uma base (addStackOnId setado), sugere a altura do TOPO dela
  // (floor_height_mm + height_mm) como ponto de partida — editável, não
  // trava o cliente nesse valor. Editando um slot já existente (nem insert
  // nem stack), o valor de verdade vem de restoreSlotStateIntoConfigurator
  // (chamada logo depois por editCompositionSlot), que sobrescreve isto.
  const floorHeightWrap = document.getElementById('po-comp-floor-height-wrap');
  if (floorHeightWrap) floorHeightWrap.style.display = 'block';
  {
    const baseSlot = addStackOnId ? compositionSlots.find((s) => s.id === addStackOnId) : null;
    currentFloorHeightMm = baseSlot ? Number(baseSlot.floor_height_mm || 0) + Number(baseSlot.height_mm || 0) : 0;
    refreshFloorHeightInputUI();
  }
  renderFloorHeightPresetChips();

  const newOrderTab = document.getElementById('po-tab-new-order');
  newOrderTab.classList.add('po-modal-mode');
  newOrderTab.style.display = 'block';
  newOrderTab.scrollTop = 0;
  window.scrollTo(0, 0);
}

// Fecha o modal e devolve o botão/estado normais de "Novo Orçamento"
// (adicionar ao pedido) — a aba Composição nunca foi escondida, então basta
// esconder o modal de volta pra "voltar" pra ela. Não desfaz slots já
// confirmados.
function exitCompositionSlotConfig() {
  addTargetSlotIndex = null;
  compositionInsertMode = false;
  addStackOnId = null;
  document.getElementById('po-comp-mode-banner').style.display = 'none';
  document.getElementById('po-add-item-btn').textContent = I18n.t('step2.add_to_order_btn');
  const floorHeightWrap = document.getElementById('po-comp-floor-height-wrap');
  if (floorHeightWrap) floorHeightWrap.style.display = 'none';
  const newOrderTab = document.getElementById('po-tab-new-order');
  newOrderTab.classList.remove('po-modal-mode');
  newOrderTab.style.display = 'none';
}

const compModeCancelBtn = document.getElementById('po-comp-mode-cancel-btn');
if (compModeCancelBtn) {
  compModeCancelBtn.addEventListener('click', () => {
    exitCompositionSlotConfig();
    highlightSelectedModuleCard('');
    document.getElementById('po-config-section').style.display = 'none';
    document.getElementById('po-module-description').textContent = '';
    currentModule = null;
    lastItemResult = null;
  });
}

// "Gerar 3D da composição" — monta os módulos dos slots lado a lado, em
// escala real, numa cena 3D NOVA e independente (js/viewer3d_composition.js)
// do visualizador de configuração (Viewer3D/#po-viewer3d-canvas, que
// continua intocado e é reaproveitado só como overlay pra configurar cada
// slot). Cada slot já guarda tudo que precisa pra isso (slot.pieces +
// width/height/depth_mm + boxColor/doorColor/shelfQuantities — ver
// po-add-item-btn acima), então não é preciso buscar nada de novo no banco:
// resolvePiecesForViewer (já usado pra desenhar o 3D de configuração de um
// módulo só) resolve as medidas/posições de cada peça, e
// Viewer3D.buildStandaloneAssembly (nova função aditiva em viewer3d.js, que
// não muda nada do comportamento existente) monta essa lista de peças num
// Group 3D autônomo — a mesma lógica de posicionamento de sempre, só
// devolvida pronta pra encaixar noutra cena em vez de desenhar direto na
// cena singleton.
// Extraída do antigo listener de clique do compGenerateBtn (ver abaixo) pra
// poder ser chamada de dois lugares: o clique manual em "Gerar 3D da
// composição" E automaticamente de renderCompositionSlots() sempre que o
// cliente edita/insere/remove um módulo com o 3D JÁ ABERTO na tela — pedido
// do usuário: "alterei a configuração de um módulo já gerado 3D, mas quando
// voltei precisei gerar de novo pra atualizar... talvez na alteração já
// deva gerar automático pra não confundir". Não faz scrollIntoView aqui (só
// no clique manual) — regerar sozinho enquanto o cliente está editando não
// deve ficar puxando a tela pra baixo.
// ---------- Troca rápida de cor das laterais (pedido do usuário, 2026-07-16) ----------
// "quero colocar um troca rapida de cores nas laterias... deve ficar em
// quadros do lado do 3d, sem espremer o visualizador" — um controle SÓ
// (opção escolhida quando perguntado, em vez de um por módulo) que troca a
// cor de TODOS os módulos da composição de uma vez, ao lado do canvas.

// Detecta o papel de cor usado por QUALQUER peça de um módulo (qualquer
// position_role — não só 'left'/'right' — pedido do usuário, 2026-07-16:
// "ainda so tenho uma opcao de cor pra trocar, preciso painel, caixas,
// portas": o catálogo usa um color_role_id PRÓPRIO por peça/papel, ex. um
// papel "Caixa" nas laterais, outro "Porta" nas peças de frente com
// dobradiça, outro "Painel" em alguma peça de fundo/prateleira — restringir
// a busca a left/right escondia todos os outros), olhando recursivamente
// peças-módulo aninhadas — mesmo cuidado do bug já corrigido em
// setupOptionVisibility (ver memória "shallow piece checks"): checar só o
// nível raiz perderia peças escondidas dentro de um módulo usado como peça.
// Soma na Map acc: color_role_id -> quantas peças usam esse papel, em toda a
// composição.
function collectCompositionColorRoleIds(piecesList, acc) {
  (piecesList || []).forEach((p) => {
    if (p.color_role_id) {
      acc.set(p.color_role_id, (acc.get(p.color_role_id) || 0) + 1);
    }
    if (p.child_pieces && p.child_pieces.length) collectCompositionColorRoleIds(p.child_pieces, acc);
  });
  return acc;
}

// true se ALGUMA peça (recursivo, qualquer position_role) deste módulo usa
// o papel de cor roleId — usado pra saber quais slots o painel afeta.
function pieceTreeHasColorRole(piecesList, roleId) {
  return (piecesList || []).some((p) =>
    p.color_role_id === roleId ||
    (p.child_pieces && p.child_pieces.length && pieceTreeHasColorRole(p.child_pieces, roleId))
  );
}

// Descobre TODOS os papéis de cor usados em QUALQUER peça da composição
// atual (não só o mais comum — pedido do usuário, 2026-07-16: "so apareceu
// um modelo de cor pra trocar", depois generalizado pra além de laterais:
// "preciso painel, caixas, portas") e, pra CADA papel, busca as cores
// cadastradas em todos os módulos afetados por ele, devolvendo só a
// INTERSEÇÃO (cor que existe pra todo mundo naquele grupo) — assim qualquer
// swatch mostrado sempre funciona em todos os módulos que aquele grupo
// afeta, sem precisar checar módulo por módulo na hora do clique. Devolve
// [] se a composição não tem nenhuma peça com cor cadastrada (painel fica
// escondido). Um módulo pode aparecer em mais de um grupo (ex: usa "Caixa"
// nas laterais E "Porta" na frente) — cada grupo é independente, vira sua
// própria aba na UI (ver renderCompositionSideColorPanel).
// Extraído pra receber QUALQUER lista de slots (pedido do usuário
// 2026-07-26, aba Projetos: "que eu possa trocar as cores conforme os
// modelos de todos modulos inseridos de uma vez so" — mesmo painel de troca
// rápida que já existia só na Composição, agora também em Projetos, ver
// loadProjectColorRoleGroups/applyColorRoleToAllProjectSlots abaixo). Puro
// leitura (só monta os grupos disponíveis), nenhuma mudança de comportamento
// pra quem já chamava loadCompositionColorRoleGroups().
async function loadColorRoleGroupsForSlots(slotsList) {
  const roleTally = new Map();
  slotsList.forEach((slot) => collectCompositionColorRoleIds(slot.pieces, roleTally));
  if (roleTally.size === 0) return [];

  const roleIds = [...roleTally.keys()];
  const moduleIdsByRole = new Map();
  roleIds.forEach((roleId) => {
    const ids = [...new Set(
      slotsList
        .filter((slot) => pieceTreeHasColorRole(slot.pieces, roleId))
        .map((slot) => slot.module.id)
    )];
    moduleIdsByRole.set(roleId, ids);
  });

  const allModuleIds = [...new Set([].concat(...moduleIdsByRole.values()))];
  if (allModuleIds.length === 0) return [];

  const { data, error } = await supabaseClient
    .from('module_colors')
    .select('module_id, color_role_id, color_id, colors(*)')
    .in('color_role_id', roleIds)
    .in('module_id', allModuleIds);
  if (error || !data) return [];

  // byRoleModule: roleId -> moduleId -> Map(color_id -> colorObj)
  const byRoleModule = new Map();
  data.forEach((row) => {
    if (!row.colors || !row.colors.active) return;
    if (!byRoleModule.has(row.color_role_id)) byRoleModule.set(row.color_role_id, new Map());
    const perModule = byRoleModule.get(row.color_role_id);
    if (!perModule.has(row.module_id)) perModule.set(row.module_id, new Map());
    perModule.get(row.module_id).set(row.color_id, row.colors);
  });

  const groups = [];
  roleIds.forEach((roleId) => {
    const moduleIds = moduleIdsByRole.get(roleId) || [];
    const perModule = byRoleModule.get(roleId);
    if (!perModule || moduleIds.length === 0) return;
    let commonIds = null;
    moduleIds.forEach((mId) => {
      const colorMap = perModule.get(mId);
      const ids = new Set(colorMap ? colorMap.keys() : []);
      commonIds = commonIds === null ? ids : new Set([...commonIds].filter((id) => ids.has(id)));
    });
    if (!commonIds || commonIds.size === 0) return;
    const anyColorMap = perModule.get(moduleIds[0]);
    // Ordem = a mesma do cadastro (colors.sort_order, migration_020) — sem
    // isso a ordem vinha de [...Set] (ordem de retorno da query em
    // module_colors, sem nenhum .order(), então praticamente aleatória/por
    // id). Pedido do usuário (2026-07-29, depois de ver o painel de troca
    // rápida): "as cores ainda nao estao na sequencia certa cadastrada no
    // administrativo" — função COMPARTILHADA (Composição/Projetos/tela do
    // pedido usam todas loadColorRoleGroupsForSlots), corrigir aqui resolve
    // as 3 telas de uma vez.
    const colors = [...commonIds]
      .map((id) => anyColorMap.get(id))
      .filter(Boolean)
      .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0));
    if (colors.length === 0) return;
    const roleName = (colorRolesCache.find((r) => r.id === roleId) || {}).name || '';
    groups.push({ roleId, roleName, colors, moduleIds });
  });
  return groups;
}

async function loadCompositionColorRoleGroups() {
  return loadColorRoleGroupsForSlots(compositionSlots);
}

// Aplica a cor escolhida a um papel de cor (qualquer um — Caixa/Porta/
// Painel/etc., ver loadCompositionColorRoleGroups) em TODO módulo da
// composição que tiver peça com esse papel (ver pieceTreeHasColorRole) —
// recalcula o preço de cada slot afetado (cor muda custo de chapa/fita de
// borda, ver Pricing.calculateLeafPiece) e regera a cena + totais via
// renderCompositionSlots(). Erro num slot específico não trava os outros —
// cada um roda seu próprio try/catch, mantendo o preço/cor anteriores
// daquele slot se a troca não fechar por algum motivo (ex: catálogo mudou
// entre a hora que o slot foi criado e agora).
function applyColorRoleToComposition(roleId, color) {
  const errorEl = document.getElementById('po-comp-side-color-error');
  if (errorEl) errorEl.style.display = 'none';
  let firstErrorMsg = null;
  compositionSlots.forEach((slot) => {
    if (!pieceTreeHasColorRole(slot.pieces, roleId)) return;
    const nextColorsByRole = { ...slot.colorsByRole, [roleId]: color };
    try {
      const result = slot.module.is_decoration
        ? { total: 0, breakdown: [] }
        : Pricing.calculateModulePrice({
          module: slot.module, pieces: slot.pieces, colorsByRole: nextColorsByRole,
          hingeModel: slot.hingeModel, slideModel: slot.slideModel,
          shelfQuantities: slot.shelfQuantities, dimOverrides: slot.dimOverrides,
          // pieceColorOverrides (migration 046) — a troca em massa não pode apagar cor
          // separada que o cliente já tinha escolhido pra uma peça-módulo específica
          // (override sempre vence, ver effectiveColorsForPiece em pricing.js).
          pieceColorOverrides: slot.pieceColorOverrides,
          width_mm: slot.width_mm, height_mm: slot.height_mm, depth_mm: slot.depth_mm,
          markupMultiplier: resolveMarkupMultiplierForModule(slot.module)
        });
      slot.colorsByRole = nextColorsByRole;
      slot.selectedColors = Object.keys(nextColorsByRole).map((rid) => ({
        role_id: rid,
        role_name: (colorRolesCache.find((r) => r.id === rid) || {}).name || null,
        color_id: nextColorsByRole[rid] ? nextColorsByRole[rid].id : null,
        color_name: nextColorsByRole[rid] ? nextColorsByRole[rid].name : null
      }));
      slot.result = result;
    } catch (err) {
      if (!firstErrorMsg) firstErrorMsg = err.message || String(err);
    }
  });
  if (firstErrorMsg && errorEl) {
    errorEl.textContent = I18n.t('composition.side_color_error', { msg: firstErrorMsg });
    errorEl.style.display = 'block';
  }
  renderCompositionSlots(); // atualiza cards/totais + regera o 3D sozinho (já aberto, ver fim da função)
}

// Monta (ou esconde) o painel de troca rápida ao lado do canvas — chamado
// sempre que a composição 3D é (re)gerada, pra continuar em sincronia com
// os módulos atuais (adicionar/remover um slot pode mudar qual papel de
// cor é "o das laterais" ou quais cores são comuns a todos).
async function renderCompositionSideColorPanel() {
  const panel = document.getElementById('po-comp-side-color-panel');
  const tabsEl = document.getElementById('po-comp-side-color-tabs');
  const swatchesEl = document.getElementById('po-comp-side-color-swatches');
  if (!panel || !tabsEl || !swatchesEl) return;
  const groups = await loadCompositionColorRoleGroups();
  tabsEl.innerHTML = '';
  swatchesEl.innerHTML = '';
  if (!groups.length) { panel.style.display = 'none'; return; }
  panel.style.display = 'block';

  // Por ABAS (pedido do usuário, 2026-07-16: "pode fazer por abas pra nao
  // ocupar muito espaco na tela") — um grupo por papel de cor encontrado
  // (Caixa/Porta/Painel/etc., ver loadCompositionColorRoleGroups, generalizado
  // além de só laterais), mas só a aba ATIVA mostra as swatches, em vez de
  // empilhar todos os grupos verticalmente (crescia demais com 3+ papéis).
  // Mantém a aba ativa entre re-renders (compColorActiveTabRoleId) — só cai
  // pro primeiro grupo se a aba ativa não existir mais nesta lista.
  if (!groups.some((g) => g.roleId === compColorActiveTabRoleId)) {
    compColorActiveTabRoleId = groups[0].roleId;
  }

  groups.forEach((group) => {
    const tabBtn = document.createElement('button');
    tabBtn.type = 'button';
    tabBtn.className = 'po-comp-color-tab-btn';
    tabBtn.textContent = group.roleName || I18n.t('color.prefix');
    if (group.roleId === compColorActiveTabRoleId) tabBtn.classList.add('active');
    tabBtn.addEventListener('click', () => {
      compColorActiveTabRoleId = group.roleId;
      renderCompositionColorTabSwatches(groups);
    });
    tabsEl.appendChild(tabBtn);
  });

  renderCompositionColorTabSwatches(groups);
}

// Desenha só as swatches da aba ATIVA (compColorActiveTabRoleId) — separado
// de renderCompositionSideColorPanel pra trocar de aba sem precisar
// reconsultar o banco (loadCompositionColorRoleGroups) de novo, já que
// `groups` (com as cores já resolvidas) é reaproveitado inteiro. Nenhum
// swatch nasce "selecionado" — cada módulo pode ter uma cor diferente até o
// cliente clicar (isto não é uma seleção única salva, é só um atalho de
// troca em massa).
function renderCompositionColorTabSwatches(groups) {
  const tabsEl = document.getElementById('po-comp-side-color-tabs');
  const swatchesEl = document.getElementById('po-comp-side-color-swatches');
  if (!tabsEl || !swatchesEl) return;
  [...tabsEl.children].forEach((btn, i) => {
    btn.classList.toggle('active', groups[i] && groups[i].roleId === compColorActiveTabRoleId);
  });
  const group = groups.find((g) => g.roleId === compColorActiveTabRoleId);
  swatchesEl.innerHTML = '';
  if (!group) return;
  renderSwatches(swatchesEl, group.colors, null, (colorId) => {
    const chosen = group.colors.find((c) => c.id === colorId);
    if (chosen) applyColorRoleToComposition(group.roleId, chosen);
  });
}

// Monta os assemblies 3D de um conjunto de slots (extraído de
// generateComposition3D pra poder ser reaproveitado por
// renderCompositionForAiSnapshot — ver comentário lá — sem duplicar a lógica
// de peças/cor/empilhamento). slotsList = compositionSlots por padrão, mas
// pode vir filtrada (ex.: sem os módulos decorativos).
function buildCompositionAssemblies(slotsList) {
  return slotsList.map((slot) => {
    const moduleDims = { W: slot.width_mm, H: slot.height_mm, D: slot.depth_mm };
    const parts = resolvePiecesForViewer(slot.pieces, moduleDims, slot.colorsByRole, slot.shelfQuantities, slot.dimOverrides, slot.pieceColorOverrides);
    // openState (pedido do usuário, 2026-07-16: "quero opcao abrir portas e
    // gavetas no modulo composicao gerado") — relê o estado ATUAL de
    // porta/gaveta da composição (ver ViewerComposition.areDoorsOpen/
    // areDrawersOpen) antes de montar, pra um módulo reconstruído (troca de
    // cor, empilhamento, novo slot) nascer já aberto/fechado igual aos
    // outros, em vez de sempre fechado.
    const openState = {
      doors: (typeof ViewerComposition !== 'undefined' && ViewerComposition.areDoorsOpen) ? ViewerComposition.areDoorsOpen() : false,
      drawers: (typeof ViewerComposition !== 'undefined' && ViewerComposition.areDrawersOpen) ? ViewerComposition.areDrawersOpen() : false
    };
    const assembly = Viewer3D.buildStandaloneAssembly(parts, slot.width_mm, slot.height_mm, slot.depth_mm, openState);
    // Empilhamento (ver viewer3d_composition.js/render): id/stack_on_id
    // decidem se este assembly abre coluna nova (avança a fileira) ou
    // reaproveita o X de uma coluna já posicionada; floor_height_m (metros,
    // mesma convenção de width_m/height_m/depth_m que buildStandaloneAssembly
    // já devolve) desloca o group no eixo Y a partir do chão de verdade.
    if (assembly) {
      assembly.id = slot.id;
      assembly.stack_on_id = slot.stack_on_id || null;
      assembly.floor_height_m = Number(slot.floor_height_mm || 0) / 1000;
    }
    return assembly;
  });
}

function generateComposition3D() {
  const wrap = document.getElementById('po-comp-3d-wrap');
  const canvas = document.getElementById('po-comp-3d-canvas');
  if (!wrap || !canvas) return;
  wrap.style.display = 'block';

  if (typeof ViewerComposition === 'undefined' || !ViewerComposition.available()
    || typeof Viewer3D === 'undefined' || !Viewer3D.buildStandaloneAssembly) {
    canvas.innerHTML = `<p class="hint">${I18n.t('composition.not_available_3d')}</p>`;
    return;
  }

  const assemblies = buildCompositionAssemblies(compositionSlots);

  // Cotas totais direto no desenho (pedido do usuário: "eu pensei em
  // colocar essas medidas no próprio desenho") — mesma conta de
  // computeCompositionTotalsMm() usada nos chips de texto acima da fileira,
  // só formatada na unidade atual antes de mandar pro viewer3d_composition.js
  // (que não sabe nada de mm/cm/pol — só desenha o texto pronto).
  const totalsMm = computeCompositionTotalsMm();
  const unit = (document.getElementById('po-unit-select') || {}).value || 'mm';
  const dimensionLabels = totalsMm ? {
    width: formatDimension(totalsMm.totalWidth, unit),
    height: formatDimension(totalsMm.totalHeight, unit),
    depth: formatDimension(totalsMm.totalDepth, unit)
  } : null;

  // ViewerComposition.init/render (viewer3d_composition.js) já são seguros
  // de chamar de novo em cima de uma cena existente: init() reaproveita o
  // renderer se já existir, e render() descarta (dispose) os groups antigos
  // antes de montar os novos — não vaza contexto WebGL nem duplica cena.
  // Ambiente da casa (linhas de chão/teto/baseboard, ver
  // buildRoomEnvironment em viewer3d_composition.js) — mesma config usada
  // pelo configurador da aba Quote (viewerRoomEnvConfig, rótulos já na
  // unidade global atual).
  ViewerComposition.init('po-comp-3d-canvas');
  ViewerComposition.render(assemblies, dimensionLabels, viewerRoomEnvConfig());

  // Botões "Abrir portas"/"Abrir gavetas" da composição — mesma checagem
  // recursiva (treeHasHinge/treeHasSlide) usada pro configurador de módulo
  // único, só que em QUALQUER slot da composição (um só módulo com porta já
  // basta pra mostrar o botão, que abre as portas de TODOS os módulos que
  // tiverem). Reaproveita os mesmos rótulos i18n (step2.open_doors/
  // close_doors/open_drawers/close_drawers).
  refreshCompositionOpenButtons();

  // Preço do CONJUNTO — soma o total já calculado de cada slot (cada um
  // já rodou Pricing.calculateModulePrice na hora em que foi configurado,
  // ver po-add-item-btn/compositionSlots acima), sem precisar recalcular
  // nada aqui.
  const totalEl = document.getElementById('po-comp-3d-total');
  if (totalEl) {
    const total = compositionSlots.reduce((sum, slot) => sum + Number((slot.result && slot.result.total) || 0), 0);
    totalEl.textContent = I18n.t('composition.total_estimated', { total: formatMoney(total) });
  }

  // Painel de troca rápida de cor das laterais (ver bloco acima) — refeito
  // toda vez que a cena é (re)gerada, pra continuar batendo com os módulos
  // atuais da composição. Assíncrono (consulta module_colors), não trava o
  // desenho 3D síncrono acima.
  renderCompositionSideColorPanel();
}

// Versão "limpa" da cena, só pra tirar o(s) print(s) que viram base pra IA
// (ver generateAiPreviewForGallery/publishCompositionToGallery) — pedido do
// usuário (2026-07-19): "essas imagens de base, retira as cotas e coloca so
// linha de piso e teto. retira as decoracoes deixa a ia gerar elas".
//   - SEM cotas: manda labels=null pro render() (ver "if (labels)" em
//     viewer3d_composition.js/render — sem isso não desenha as 3 linhas de
//     medida largura/altura/profundidade).
//   - SÓ linha de piso e teto: room.minimal=true (ver buildRoomEnvironment
//     em viewer3d_composition.js) — tira a linha tracejada de altura máxima,
//     o baseboard tracejado, e os rótulos de texto, mantendo só as 2 linhas
//     sólidas.
//   - SEM módulos decorativos (is_decoration): a IA já recebe instrução pra
//     decorar a cena sozinha (ver buildRoomStagingFragment no Edge Function)
//     — um vaso/planta genérico do catálogo dentro do print só confundia
//     (podia sair duplicado ou brigando com a decoração que a IA adiciona).
// SEMPRE temporária: quem chamar isto pra tirar print(s) tem que chamar
// generateComposition3D() de novo depois, pra devolver a cena normal (com
// cotas/decoração/linhas completas) que o cliente estava vendo.
function renderCompositionForAiSnapshot() {
  if (typeof ViewerComposition === 'undefined' || !ViewerComposition.available()
    || typeof Viewer3D === 'undefined' || !Viewer3D.buildStandaloneAssembly) {
    return false;
  }
  const cleanSlots = compositionSlots.filter((slot) => !(slot.module && slot.module.is_decoration));
  if (!cleanSlots.length) return false;
  const assemblies = buildCompositionAssemblies(cleanSlots);
  const room = { ...viewerRoomEnvConfig(), minimal: true };
  ViewerComposition.init('po-comp-3d-canvas');
  ViewerComposition.render(assemblies, null, room);
  return true;
}

// Botões "Abrir portas"/"Abrir gavetas" da composição (pedido do usuário,
// 2026-07-16: "quero opcao abrir portas e gavetas no modulo composicao
// gerado") — mesmo padrão dos botões do configurador de módulo único
// (po-toggle-doors-btn/po-toggle-drawers-btn), só que apontando pro estado
// PRÓPRIO da cena de composição (ViewerComposition.toggleDoors/toggleDrawers,
// ver viewer3d_composition.js) em vez do Viewer3D da cena singleton — os dois
// são independentes de propósito. Mostra cada botão só se ALGUM slot da
// composição tiver peça do tipo correspondente, em qualquer profundidade
// (mesma treeHasHinge/treeHasSlide recursiva já usada pelo configurador
// individual). Chamada de dentro de generateComposition3D() (toda vez que a
// cena é (re)gerada) — assim um módulo removido/adicionado atualiza a
// visibilidade dos botões junto.
function refreshCompositionOpenButtons() {
  const doorsBtn = document.getElementById('po-comp-toggle-doors-btn');
  const drawersBtn = document.getElementById('po-comp-toggle-drawers-btn');
  if (!doorsBtn && !drawersBtn) return;

  const hasHinge = compositionSlots.some((slot) => treeHasHinge(slot.pieces, false, false));
  const hasSlide = compositionSlots.some((slot) => treeHasSlide(slot.pieces, false, false));

  if (doorsBtn) {
    doorsBtn.style.display = hasHinge ? 'inline-block' : 'none';
    doorsBtn.dataset.openLabel = I18n.t('step2.open_doors');
    doorsBtn.dataset.closeLabel = I18n.t('step2.close_doors');
    const isOpen = typeof ViewerComposition !== 'undefined' && ViewerComposition.areDoorsOpen && ViewerComposition.areDoorsOpen();
    doorsBtn.textContent = isOpen ? doorsBtn.dataset.closeLabel : doorsBtn.dataset.openLabel;
  }
  if (drawersBtn) {
    drawersBtn.style.display = hasSlide ? 'inline-block' : 'none';
    drawersBtn.dataset.openLabel = I18n.t('step2.open_drawers');
    drawersBtn.dataset.closeLabel = I18n.t('step2.close_drawers');
    const isOpen = typeof ViewerComposition !== 'undefined' && ViewerComposition.areDrawersOpen && ViewerComposition.areDrawersOpen();
    drawersBtn.textContent = isOpen ? drawersBtn.dataset.closeLabel : drawersBtn.dataset.openLabel;
  }
}

const compToggleDoorsBtn = document.getElementById('po-comp-toggle-doors-btn');
if (compToggleDoorsBtn) {
  compToggleDoorsBtn.addEventListener('click', () => {
    try {
      const isOpen = ViewerComposition.toggleDoors();
      compToggleDoorsBtn.textContent = isOpen
        ? (compToggleDoorsBtn.dataset.closeLabel || I18n.t('step2.close_doors'))
        : (compToggleDoorsBtn.dataset.openLabel || I18n.t('step2.open_doors'));
    } catch (err) {
      // Sem 3D o botão não faz nada.
    }
  });
}

const compToggleDrawersBtn = document.getElementById('po-comp-toggle-drawers-btn');
if (compToggleDrawersBtn) {
  compToggleDrawersBtn.addEventListener('click', () => {
    try {
      const isOpen = ViewerComposition.toggleDrawers();
      compToggleDrawersBtn.textContent = isOpen
        ? (compToggleDrawersBtn.dataset.closeLabel || I18n.t('step2.close_drawers'))
        : (compToggleDrawersBtn.dataset.openLabel || I18n.t('step2.open_drawers'));
    } catch (err) {
      // Sem 3D o botão não faz nada.
    }
  });
}

// Botão "Gerar 3D da composição" — só dispara generateComposition3D() (ver
// acima) + rola a tela até o resultado (a única parte que faz sentido SÓ no
// clique manual, não na regeneração automática).
const compGenerateBtn = document.getElementById('po-comp-generate-btn');
if (compGenerateBtn) {
  compGenerateBtn.addEventListener('click', () => {
    generateComposition3D();
    // O resultado nasce escondido no fim da página (wrap começa
    // display:none) — rola até ele, senão o cliente pode nem perceber que
    // já gerou.
    const wrap = document.getElementById('po-comp-3d-wrap');
    if (wrap) wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

// ---------- COMPOSIÇÕES FAVORITAS (migration 042) ----------
// O cliente logado salva a composição atual com um nome (user_compositions,
// RLS: só as próprias linhas) e recarrega depois na aba Favoritos — pra usar
// de novo ou alterar e salvar por cima. O que vai pro banco é a CONFIGURAÇÃO
// de cada slot (ids + medidas + escolhas), não o preço: ao carregar, tudo é
// re-resolvido contra o catálogo atual (mesma filosofia do export de furação).

let loadedFavorite = null; // { id, name } quando a composição em edição veio de um favorito

// Edição de post da Galeria como ADMIN (pedido do usuário, 2026-07-19: "eu
// como administrador, quero fazer alteracao na composicao dos projetos da
// galeria ... e poder salvar essa composicao, pra ela ficar mais fiel as
// imagens geradas") — ver maybeLoadGalleryPostForAdminEdit/
// saveGalleryPostAdminEdit mais abaixo. null = edição normal (comportamento
// de sempre, sem nenhum post amarrado).
let editingGalleryPostId = null;
// Nome original do post (composition_name) — guardado à parte porque
// restoreFavoriteComposition(..., bindAsFavorite=false) SEMPRE zera
// loadedFavorite pra null (é o comportamento correto pro caso normal, ver
// restoreGalleryPostAsComposition), então sem isso saveGalleryPostAdminEdit
// apagaria o nome do post a cada salvamento.
let editingGalleryPostName = null;

function serializeCompositionSlots() {
  return compositionSlots.map((slot) => ({
    // id/stack_on_id (empilhamento) — id é uma string opaca só de uso
    // interno (newSlotId()), guardada aqui só pra stack_on_id de OUTRO slot
    // desta mesma composição conseguir se referir a ele depois de recarregar
    // o favorito (ver restoreFavoriteComposition). floor_height_mm 0 é o
    // padrão pra composições salvas antes desta feature (chão de verdade).
    id: slot.id,
    stack_on_id: slot.stack_on_id || null,
    floor_height_mm: Number(slot.floor_height_mm || 0),
    module_id: slot.module.id,
    width_mm: slot.width_mm,
    height_mm: slot.height_mm,
    depth_mm: slot.depth_mm,
    selected_colors: slot.selectedColors || [],
    // piece_color_overrides (migration 046) — snapshot compacto (id/nome),
    // mesmo formato gravado em order_items (ver buildPieceColorOverridesSnapshot);
    // resolvido de volta pra registros reais em restoreFavoriteComposition.
    piece_color_overrides: buildPieceColorOverridesSnapshot(slot.pieceColorOverrides),
    hinge_model_id: slot.hingeModel ? slot.hingeModel.id : null,
    slide_model_id: slot.slideModel ? slot.slideModel.id : null,
    shelf_quantities: slot.shelfQuantities || {},
    dim_overrides: slot.dimOverrides || {},
    selected_optional_ids: slot.selectedOptionalIds || [],
    thumbnail_data_url: slot.thumbnail_data_url || null
  }));
}

// Mostra/esconde o botão "Salvar alterações em ..." conforme a composição
// atual veio (ou não) de um favorito carregado.
function refreshFavoriteButtons() {
  const updateBtn = document.getElementById('po-comp-update-fav-btn');
  if (!updateBtn) return;
  if (loadedFavorite) {
    updateBtn.textContent = I18n.t('fav.update_btn', { name: loadedFavorite.name });
    updateBtn.style.display = 'inline-block';
  } else {
    updateBtn.style.display = 'none';
  }
}

async function saveCompositionFavorite(overwriteId) {
  const statusEl = document.getElementById('po-comp-fav-status');
  const errorEl = document.getElementById('po-comp-error');
  errorEl.style.display = 'none';
  statusEl.textContent = '';
  if (!currentUser) {
    errorEl.textContent = I18n.t('fav.need_login');
    errorEl.style.display = 'block';
    return;
  }
  if (compositionSlots.length === 0) {
    errorEl.textContent = I18n.t('fav.need_slots');
    errorEl.style.display = 'block';
    return;
  }
  try {
    if (overwriteId) {
      const { error } = await supabaseClient
        .from('user_compositions')
        .update({ slots: serializeCompositionSlots(), updated_at: new Date().toISOString() })
        .eq('id', overwriteId);
      if (error) throw error;
      statusEl.textContent = I18n.t('fav.updated_status', { name: loadedFavorite ? loadedFavorite.name : '' });
    } else {
      const name = (prompt(I18n.t('fav.name_prompt'), I18n.t('fav.default_name')) || '').trim();
      if (!name) return;
      const { data, error } = await supabaseClient
        .from('user_compositions')
        .insert({ client_user_id: currentUser.id, name, slots: serializeCompositionSlots() })
        .select('id, name')
        .single();
      if (error) throw error;
      loadedFavorite = { id: data.id, name: data.name };
      statusEl.textContent = I18n.t('fav.saved_status');
    }
    refreshFavoriteButtons();
    setTimeout(() => { statusEl.textContent = ''; }, 4000);
  } catch (err) {
    errorEl.textContent = err.message || String(err);
    errorEl.style.display = 'block';
  }
}

const compSaveFavBtn = document.getElementById('po-comp-save-fav-btn');
if (compSaveFavBtn) compSaveFavBtn.addEventListener('click', () => saveCompositionFavorite(null));
const compUpdateFavBtn = document.getElementById('po-comp-update-fav-btn');
if (compUpdateFavBtn) compUpdateFavBtn.addEventListener('click', () => {
  if (loadedFavorite) saveCompositionFavorite(loadedFavorite.id);
});

async function loadFavoritesList() {
  const listEl = document.getElementById('po-fav-list');
  const errorEl = document.getElementById('po-fav-error');
  if (!listEl) return;
  errorEl.style.display = 'none';
  listEl.innerHTML = '';
  const { data, error } = await supabaseClient
    .from('user_compositions')
    .select('id, name, slots, updated_at')
    .order('updated_at', { ascending: false });
  if (error) { errorEl.textContent = error.message; errorEl.style.display = 'block'; return; }
  if (!data || data.length === 0) {
    listEl.innerHTML = `<p class="hint">${I18n.t('fav.empty')}</p>`;
    return;
  }
  data.forEach((fav) => {
    const card = document.createElement('div');
    card.className = 'panel';
    card.style.marginTop = '10px';
    const slots = Array.isArray(fav.slots) ? fav.slots : [];
    const thumbs = slots
      .filter((s) => s.thumbnail_data_url)
      .map((s) => `<img src="${s.thumbnail_data_url}" alt="" style="height:64px;margin-right:4px;" />`)
      .join('');
    const dateStr = fav.updated_at ? new Date(fav.updated_at).toLocaleString() : '—';
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
        <div>
          <strong class="po-fav-name"></strong>
          <div class="hint">${I18n.t('fav.modules_label', { n: slots.length })} · ${I18n.t('fav.updated_label', { date: dateStr })}</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button type="button" class="po-fav-load">${I18n.t('fav.load_btn')}</button>
          <button type="button" class="secondary po-fav-rename" style="margin-top:0;">${I18n.t('fav.rename_btn')}</button>
          <button type="button" class="secondary po-fav-delete" style="margin-top:0;">${I18n.t('fav.delete_btn')}</button>
        </div>
      </div>
      ${thumbs ? `<div style="margin-top:8px;">${thumbs}</div>` : ''}
    `;
    card.querySelector('.po-fav-name').textContent = fav.name; // textContent: nome é texto livre do cliente
    card.querySelector('.po-fav-load').addEventListener('click', () => restoreFavoriteComposition(fav));
    card.querySelector('.po-fav-rename').addEventListener('click', async () => {
      const newName = (prompt(I18n.t('fav.name_prompt'), fav.name) || '').trim();
      if (!newName || newName === fav.name) return;
      const { error: renameErr } = await supabaseClient
        .from('user_compositions')
        .update({ name: newName, updated_at: new Date().toISOString() })
        .eq('id', fav.id);
      if (renameErr) { errorEl.textContent = renameErr.message; errorEl.style.display = 'block'; return; }
      if (loadedFavorite && loadedFavorite.id === fav.id) { loadedFavorite.name = newName; refreshFavoriteButtons(); }
      loadFavoritesList();
    });
    card.querySelector('.po-fav-delete').addEventListener('click', async () => {
      if (!confirm(I18n.t('fav.delete_confirm', { name: fav.name }))) return;
      const { error: delErr } = await supabaseClient.from('user_compositions').delete().eq('id', fav.id);
      if (delErr) { errorEl.textContent = delErr.message; errorEl.style.display = 'block'; return; }
      if (loadedFavorite && loadedFavorite.id === fav.id) { loadedFavorite = null; refreshFavoriteButtons(); }
      loadFavoritesList();
    });
    listEl.appendChild(card);
  });
}

// Reconstrói compositionSlots a partir da configuração salva — re-resolve
// peças/preço contra o catálogo ATUAL (módulo apagado é pulado com aviso;
// módulo que mudou de fórmula/preço volta atualizado, de propósito).
// bindAsFavorite=false (Galeria pública, migration 048): mesma lógica de
// resolução, mas NÃO amarra loadedFavorite a nenhuma user_compositions
// existente — a composição carregada fica "solta", e o próximo "Salvar
// como favorita" cria uma linha NOVA pertencente ao usuário atual (RLS de
// user_compositions já é owner-only, então não daria nem pra sobrescrever a
// composição de outra pessoa). Pedido do usuário: "pode abrir o ambiente e
// fazer suas alterações... o cliente não sai do zero" — ver
// restoreGalleryPostAsComposition.
async function restoreFavoriteComposition(fav, bindAsFavorite = true) {
  const errorEl = document.getElementById('po-fav-error');
  errorEl.style.display = 'none';
  try {
    // Corrida no login (2026-07-21, mesmo bug achado em restoreFavoriteProject
    // — ver comentário lá): allModules só é preenchido depois de um showLoggedIn()
    // assíncrono (loadModules, no fim da cadeia). Se o cliente clicar
    // "Carregar" rápido demais (ex.: acabou de logar), allModules ainda está
    // [] e TODO módulo salvo seria pulado por engano ("módulo não existe mais
    // no catálogo"), mesmo existindo de verdade. Recarrega antes de resolver.
    if (!allModules.length) await loadModules();
    const slotConfigs = Array.isArray(fav.slots) ? fav.slots : [];

    // busca cores/dobradiças/corrediças referenciadas, numa ida só por tabela
    // (inclui os color_id de dentro de piece_color_overrides, migration 046,
    // senão a cor separada de uma peça-módulo se perderia ao recarregar).
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
    for (const cfg of slotConfigs) {
      const module = allModules.find((m) => m.id === cfg.module_id);
      if (!module) { skipped += 1; continue; }
      const piecesList = await loadRecursivePiecesForModule(module.id);
      if (!piecesList || piecesList.length === 0) { skipped += 1; continue; }
      const optionalIds = cfg.selected_optional_ids || [];
      const effectivePieces = piecesList.filter((p) => !p.client_optional || optionalIds.includes(p.id));
      const colorsByRole = {};
      (cfg.selected_colors || []).forEach((sc) => {
        const color = colorById.get(sc.color_id);
        if (color) colorsByRole[sc.role_id] = color;
      });
      const hingeModel = cfg.hinge_model_id ? (hingeById.get(cfg.hinge_model_id) || null) : null;
      const slideModel = cfg.slide_model_id ? (slideById.get(cfg.slide_model_id) || null) : null;
      // piece_color_overrides (migration 046) — resolve o snapshot compacto
      // (id/nome, ver buildPieceColorOverridesSnapshot) de volta pra
      // registros reais de "colors", igual colorsByRole logo acima.
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
        // id/stack_on_id/floor_height_mm (empilhamento) — favoritos salvos
        // ANTES desta feature não têm cfg.id, então cada slot ganha um id
        // novo (newSlotId()) e stack_on_id/floor_height_mm caem nos padrões
        // (null / 0 = sem empilhar, no chão de verdade), reproduzindo
        // exatamente o comportamento antigo pra esses favoritos.
        id: cfg.id || newSlotId(),
        stack_on_id: cfg.stack_on_id || null,
        floor_height_mm: Number(cfg.floor_height_mm || 0),
        module,
        pieces: effectivePieces,
        colorsByRole,
        selectedColors: cfg.selected_colors || [],
        pieceColorOverrides,
        hingeModel, slideModel,
        width_mm: cfg.width_mm, height_mm: cfg.height_mm, depth_mm: cfg.depth_mm,
        shelfQuantities: cfg.shelf_quantities || {},
        dimOverrides: cfg.dim_overrides || {},
        selectedOptionalIds: optionalIds,
        result,
        thumbnail_data_url: cfg.thumbnail_data_url || null
      });
    }

    // Limpa stack_on_id órfão: se o slot-base de uma coluna foi pulado
    // (módulo apagado do catálogo, ver "skipped" acima), o slot que estava
    // empilhado em cima dele não pode continuar apontando pra um id que não
    // existe mais em `restored` — vira uma coluna nova (base) em vez de
    // desaparecer ou quebrar o render.
    const restoredIds = new Set(restored.map((s) => s.id));
    restored.forEach((s) => { if (s.stack_on_id && !restoredIds.has(s.stack_on_id)) s.stack_on_id = null; });

    compositionSlots = restored;
    loadedFavorite = bindAsFavorite ? { id: fav.id, name: fav.name } : null;
    refreshFavoriteButtons();

    // vai pra aba Composição já com os slots montados
    const compTabBtn = document.querySelector('#po-sidebar .portal-tab-btn[data-tab="po-tab-composition"]');
    if (compTabBtn) compTabBtn.click();
    renderCompositionSlots();

    const statusEl = document.getElementById('po-comp-fav-status');
    statusEl.textContent = I18n.t('fav.loaded_status', { name: fav.name })
      + (skipped > 0 ? ' ' + I18n.t('fav.load_partial', { n: skipped }) : '');
    setTimeout(() => { statusEl.textContent = ''; }, 6000);
  } catch (err) {
    errorEl.textContent = I18n.t('fav.load_error', { msg: err.message || String(err) });
    errorEl.style.display = 'block';
  }
}

// "Adicionar composição ao pedido" — grava cada módulo da composição como
// uma linha normal de order_items (mesmo formato/payload de po-add-item-btn,
// só que um insert por slot em vez de um só), já que não existe (nem foi
// pedido) nenhum conceito de "grupo"/"pacote" na tabela hoje — cada módulo
// vira uma linha independente no carrinho, igual a qualquer módulo
// adicionado avulso. slot.result (calculado quando o módulo foi configurado,
// ver po-add-item-btn/compositionSlots) já tem o breakdown/total prontos —
// não recalcula nada aqui.
const compAddCartBtn = document.getElementById('po-comp-add-cart-btn');
if (compAddCartBtn) {
  compAddCartBtn.addEventListener('click', async () => {
    const errorEl = document.getElementById('po-comp-cart-error');
    errorEl.style.display = 'none';
    if (!compositionSlots.length) return;
    compAddCartBtn.disabled = true;
    try {
      const orderId = await ensureDraftOrder();
      for (const slot of compositionSlots) {
        const payload = {
          order_id: orderId,
          module_id: slot.module.id,
          module_name: slot.module.name,
          module_description: slot.module.description || null,
          selected_colors: slot.selectedColors,
          hinge_model_id: slot.hingeModel ? slot.hingeModel.id : null,
          slide_model_id: slot.slideModel ? slot.slideModel.id : null,
          width_mm: slot.width_mm,
          height_mm: slot.height_mm,
          depth_mm: slot.depth_mm,
          shelf_quantities: slot.shelfQuantities,
          dim_overrides: slot.dimOverrides,
          piece_color_overrides: buildPieceColorOverridesSnapshot(slot.pieceColorOverrides),
          selected_optional_component_ids: slot.selectedOptionalIds,
          quantity: 1,
          unit_price: slot.result.total,
          total_price: slot.result.total,
          breakdown: slot.result.breakdown,
          thumbnail_data_url: slot.thumbnail_data_url,
          sort_order: cartItems.length
        };
        const { data, error } = await supabaseClient.from('order_items').insert(payload).select().single();
        if (error) throw error;
        cartItems.push(data);
      }
      renderCart();

      // Composição inserida no pedido — limpa os slots e esconde o
      // resultado 3D, pra deixar claro que já foi adicionada (evita clicar
      // de novo sem querer e duplicar os módulos no carrinho).
      compositionSlots = [];
      renderCompositionSlots();
      document.getElementById('po-comp-3d-wrap').style.display = 'none';
      document.getElementById('po-comp-3d-total').textContent = '';
    } catch (err) {
      errorEl.textContent = I18n.t('composition.add_error', { msg: err.message });
      errorEl.style.display = 'block';
    } finally {
      compAddCartBtn.disabled = false;
    }
  });
}

// ---------- GALERIA PÚBLICA (migration 048) ----------
// Publicar a composição já gerada (3D + preço) como um post público, pra
// virar portfólio de ambientes/produtos: pedido do usuário — "quanto mais
// usuarios fizerem suas composicoes no site maior a galeria e mais conteudo
// vamos ter de base pra novos clientes" — e o ponto central: qualquer
// visitante pode abrir um post e continuar editando a partir dali
// (restoreGalleryPostAsComposition abaixo), "o cliente nao sai do zero".
//
// Geração de IA (Gemini) ainda NÃO está plugada (sem backend neste projeto,
// chave ainda não pronta — ver migration_048_galeria_composicoes.sql) — por
// enquanto a "imagem" publicada é o próprio screenshot 3D da composição
// (ViewerComposition.snapshot(), fundo branco sólido, recortado com
// trimTransparentPng). Trocar por um render de IA de verdade depois é só
// substituir a linha `const rawSnapshot = ...` abaixo por uma chamada pro
// endpoint/edge function que devolve a imagem gerada — nada mais no resto
// do pipeline (DB, grade, filtros, curtidas, "usar esta composição") muda.
