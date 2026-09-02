// portal-02-pedidos.js — parte 2/9 de js/portal.js (ver portal-01-core-catalogo.js
// pro contexto da divisão). Carrinho, rascunho de pedido, "Meus Pedidos"
// (abrir/editar/recolorir/gerar PDF) e a aba "Visualizar no meu ambiente"
// (arrastar módulos sobre foto do cômodo — room-view, hoje oculta).

// Atualiza a linha de volume/peso somado no rodapé da tela do pedido
// (#po-order-detail-volume-weight) — extraído porque tem DOIS lugares que
// recalculam o total do pedido: renderOrderDetail (abre a tela) e
// updateOrderItemQuantity (edita quantidade sem reconstruir a tela toda).
function updateOrderDetailVolumeWeight(items) {
  const el = document.getElementById('po-order-detail-volume-weight');
  if (!el) return;
  el.textContent = (items && items.length > 0)
    ? formatVolumeWeightFromM3(items.reduce((sum, it) => sum + itemVolumeM3(it.breakdown, it.quantity), 0))
    : '';
}

// Preço da Galeria (pedido do usuário 2026-07-19, referência de catálogo
// "Starting at $2,269") — sem casas decimais E sem separador de milhar
// (diferente do formatMoney acima, que continua com centavos pro
// carrinho/pedidos — esse aqui é só cosmético pro card da Galeria).
function formatGalleryPrice(v) { return '$' + Math.round(Number(v || 0)); }

// Preço de revenda sugerido (migration 072) — preço de fábrica × (1 + margem
// geral do cliente logado). Só exibe a linha se o cliente tiver margem > 0
// configurada (getResaleMarginPct, menu de Configurações); visitante/cliente
// sem margem não vê nada extra, card fica igual a antes.
function galleryResaleMarginHtml(priceSale) {
  const marginPct = getResaleMarginPct();
  if (!marginPct) return '';
  const resalePrice = Number(priceSale || 0) * (1 + marginPct / 100);
  return `<div class="po-gallery-card-resale-price hint">${I18n.t('gallery.resale_price_label')} <strong>${formatGalleryPrice(resalePrice)}</strong></div>`;
}

// Locale pra Date.toLocaleString/toLocaleDateString — acompanha o idioma da
// interface (I18n.getLanguage()), não fica sempre travado em pt-BR agora que
// o portal também existe em inglês/espanhol.
const LOCALE_BY_LANG = { pt: 'pt-BR', en: 'en-US', es: 'es-ES' };
function currentLocale() {
  return LOCALE_BY_LANG[(typeof I18n !== 'undefined' && I18n.getLanguage()) || 'pt'] || 'pt-BR';
}

// Constrói a linha de cores exibida por item (carrinho, histórico, PDF) a
// partir de selected_colors (jsonb: [{ role_id, role_name, color_id,
// color_name }]) — substitui os antigos box_color_name/door_color_name
// fixos, já que agora o número de papéis de cor é dinâmico (migration 035).
function formatColorsLine(it) {
  const colors = Array.isArray(it.selected_colors) ? it.selected_colors : [];
  if (colors.length === 0) return '';
  return colors.map((c) => `${c.role_name}: ${c.color_name}`).join(' | ');
}

function cartTotal() {
  return cartItems.reduce((sum, it) => sum + Number(it.total_price || 0), 0);
}

function renderCart() {
  const listEl = document.getElementById('po-cart-list');
  // Reskin (2026-07-09): o carrinho agora é o painel "Seu Pedido", fixo do
  // lado — sempre visível (a antiga display:none até ter item some; em vez
  // disso mostra um estado vazio dentro da lista).
  const countBadge = document.getElementById('po-cart-count-badge');
  if (countBadge) countBadge.textContent = String(cartItems.length);

  listEl.innerHTML = cartItems.length > 0
    ? cartItems.map((it) => renderCartItemRow(it, true)).join('')
    : `<p class="hint po-cart-empty">${I18n.t('cart.empty')}</p>`;
  document.getElementById('po-cart-total').textContent = formatMoney(cartTotal());
  // Volume/peso somados de todos os itens do carrinho — migration 061
  // (quantidade de cada item já considerada, ver itemVolumeM3).
  const cartVwEl = document.getElementById('po-cart-volume-weight');
  if (cartVwEl) {
    cartVwEl.textContent = cartItems.length > 0
      ? formatVolumeWeightFromM3(cartItems.reduce((sum, it) => sum + itemVolumeM3(it.breakdown, it.quantity), 0))
      : '';
  }

  listEl.querySelectorAll('.portal-item-remove').forEach((btn) => {
    btn.addEventListener('click', () => removeCartItem(btn.dataset.itemId));
  });

  // "Revisar pedido" (ver reviewDraftOrder) só faz sentido com algo pra
  // revisar — só aparece depois do 1º módulo adicionado (mesmo momento em
  // que currentDraftOrderId nasce, ver ensureDraftOrder).
  const reviewBtn = document.getElementById('po-cart-review-btn');
  if (reviewBtn) reviewBtn.style.display = cartItems.length > 0 ? 'block' : 'none';
  // "Novo Pedido" (pedido do usuário 2026-07-29, ver startNewOrder) — mesma
  // condição: só faz sentido zerar se tiver algo pra zerar.
  const newOrderBtn = document.getElementById('po-cart-new-order-btn');
  if (newOrderBtn) newOrderBtn.style.display = cartItems.length > 0 ? 'block' : 'none';
}

// Mesmo layout de linha usado no carrinho (pedido sendo montado) e no
// histórico ("Meus pedidos") — imagem, referência/descrição, cor caixa/
// porta, L x A x P, preço. removable=true mostra o botão de remover
// (só faz sentido enquanto o pedido ainda é um rascunho).
function renderCartItemRow(it, removable) {
  const thumb = it.thumbnail_data_url
    ? `<img src="${it.thumbnail_data_url}" alt="${it.module_name}" class="portal-item-thumb" />`
    : `<div class="portal-item-thumb portal-item-thumb-empty"></div>`;
  const colorsLine = formatColorsLine(it);
  const removeBtn = removable
    ? `<button type="button" class="portal-item-remove secondary" data-item-id="${it.id}">${I18n.t('cart.remove_btn')}</button>`
    : '';
  const qty = it.quantity || 1;
  // Módulo decorativo (migration 039): no lugar do preço ($0.00), a linha
  // mostra o aviso "não incluído no orçamento". Detecta pelo cadastro atual
  // do módulo (allModules) — item de pedido antigo cujo módulo sumiu cai no
  // preço normal ($0.00, inofensivo).
  const decorModule = (allModules || []).find((mm) => mm.id === it.module_id);
  const isDecor = !!(decorModule && decorModule.is_decoration);
  // Preço da linha: qty=1 mostra só o total (igual sempre foi); qty>1 (só
  // existe em pedidos antigos, de quando havia o atalho "Adicionar módulo"
  // rápido da vitrine, removido 2026-07-19 — mantido aqui só pra exibir
  // itens já salvos, nada cria qty>1 mais) mostra o preço unitário x
  // quantidade também, pra ficar claro de onde veio o total.
  const priceLine = isDecor
    ? `<span class="hint">${I18n.t('decor.cart_note')}</span>`
    : (qty > 1
      ? `${formatMoney(it.unit_price)} × ${qty} = ${formatMoney(it.total_price)}`
      : formatMoney(it.total_price));
  const qtyLine = qty > 1 ? `<div>${I18n.t('cart.qty_label', { n: qty })}</div>` : '';
  // Unidade GLOBAL (po-unit-select) — mesmo motivo do card da vitrine
  // (renderModuleGallery): não pode ficar preso em mm enquanto o resto do
  // portal já mostra em polegada/cm/etc.
  const cartUnit = (document.getElementById('po-unit-select') || {}).value || 'mm';
  const dimsLine = `${formatDimension(it.width_mm, cartUnit)} x ${formatDimension(it.height_mm, cartUnit)} x ${formatDimension(it.depth_mm, cartUnit)}`;
  // Volume (m³) + peso — migration 061. Não repete pra item decorativo
  // (breakdown vazio, mesma condição do "não incluído no orçamento" acima).
  // qty já considerado (breakdown é por unidade, ver itemVolumeM3).
  const volumeWeightLine = isDecor ? '' : `<div class="hint">${formatVolumeWeight(it.breakdown || [], qty)}</div>`;
  return `
    <div class="portal-item-row">
      ${thumb}
      <div class="portal-item-info">
        <div class="portal-item-title">${it.module_name}</div>
        ${it.module_description ? `<div class="hint">${it.module_description}</div>` : ''}
        ${colorsLine ? `<div>${colorsLine}</div>` : ''}
        <div>${dimsLine}</div>
        ${qtyLine}
      </div>
      <div class="portal-item-price">
        ${priceLine}
        ${volumeWeightLine}
        ${removeBtn}
      </div>
    </div>
  `;
}

// Nome do cliente/PO (client_name/po_name) NÃO nascem mais aqui — desde o
// reskin de 2026-07-29 ("aqui eu quero visualizar minha ordem, e salvo so na
// outra tela") a barra lateral "Seu Pedido" virou só visualização; esses
// campos (junto com telefone/e-mail/endereço) só existem na tela do pedido
// (#po-order-detail-section, ver reviewDraftOrder/renderOrderDetail) —
// preenchidos e gravados só quando o cliente clica "Revisar pedido" e depois
// "Aprovar Pedido" lá.
async function ensureDraftOrder() {
  if (currentDraftOrderId) return currentDraftOrderId;
  const { data, error } = await supabaseClient
    .from('orders')
    .insert({
      client_user_id: currentUser.id,
      client_email: currentUser.email,
      status: 'draft'
    })
    .select()
    .single();
  if (error) throw error;
  currentDraftOrderId = data.id;
  currentDraftOrderStatus = 'draft';
  return currentDraftOrderId;
}

// Corta as bordas "de fundo" de uma miniatura PNG (Viewer3D.snapshot()) —
// o enquadramento da câmera do configurador deixa uma margem grande ao redor
// do móvel (pra caber peças bem maiores em outras configurações), o que
// fazia o desenho final aparecer bem pequeno dentro do quadro do card
// (carrinho, composição, "meu ambiente", tela do pedido) — pedido do
// usuário: "os ícones... estão com desenho muito pequeno" e depois "da bem
// mais zoom nos modulo 3d". Devolve uma nova data URL só com a área que
// realmente tem o desenho + uma margem pequena, assim object-fit:contain do
// CSS preenche o quadro de verdade em vez de mostrar bastante espaço vazio
// ao redor de um desenho minúsculo. Não mexe em nada da câmera/
// posicionamento 3D em si (viewer3d.js intocado) — só pós-processa a
// imagem já capturada.
//
// 2026-07-19: generalizado pra detectar o fundo pela cor do canto (não só
// alpha) — a versão antiga só cortava alpha<=10, então miniaturas antigas
// capturadas com fundo OPACO (sem transparência real) não recortavam nada
// (o canvas inteiro "tinha alpha", a caixa delimitadora virava o canvas
// inteiro = zero de corte, o que explica o desenho continuar minúsculo
// mesmo depois do corte "funcionar" sem erro). Agora qualquer pixel que
// difira o bastante da cor do canto superior-esquerdo (fundo, seja ele
// transparente ou uma cor sólida) conta como "desenho real".
function trimTransparentPng(dataUrl) {
  return new Promise((resolve) => {
    if (!dataUrl) { resolve(dataUrl); return; }
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const w = canvas.width, h = canvas.height;

        // Referência de fundo = cor do canto superior-esquerdo (funciona
        // tanto pra fundo transparente -- alpha 0 -- quanto pra fundo
        // opaco uniforme, ex.: branco).
        const bgI = 0;
        const bg = [data[bgI], data[bgI + 1], data[bgI + 2], data[bgI + 3]];
        const THRESHOLD = 24; // soma de |Δ| nos 4 canais pra contar como "diferente do fundo"

        let minX = w, minY = h, maxX = 0, maxY = 0, found = false;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            const diff = Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1])
              + Math.abs(data[i + 2] - bg[2]) + Math.abs(data[i + 3] - bg[3]);
            if (diff > THRESHOLD) {
              found = true;
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }
        if (!found) { resolve(dataUrl); return; }

        // Margem reduzida (era 4%) — quanto menos sobra ao redor, mais o
        // desenho preenche o quadro (pedido: "da bem mais zoom").
        const pad = Math.round(Math.max(w, h) * 0.015);
        minX = Math.max(0, minX - pad);
        minY = Math.max(0, minY - pad);
        maxX = Math.min(w - 1, maxX + pad);
        maxY = Math.min(h - 1, maxY + pad);

        const trimmedW = maxX - minX + 1;
        const trimmedH = maxY - minY + 1;
        const out = document.createElement('canvas');
        out.width = trimmedW;
        out.height = trimmedH;
        out.getContext('2d').drawImage(canvas, minX, minY, trimmedW, trimmedH, 0, 0, trimmedW, trimmedH);
        resolve(out.toDataURL('image/png'));
      } catch (err) {
        resolve(dataUrl); // canvas "tainted" ou outro erro -- devolve a original, nunca quebra o fluxo
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// Proporção real (largura/altura) de uma data URL de imagem já recortada
// (trimTransparentPng) — usada por currentGalleryAspectRatio pra saber o
// formato VERDADEIRO do móvel, não o do painel/canvas na tela (que tem
// altura fixa de 420px em CSS, sempre parecido, independente do desenho —
// ver #po-comp-3d-canvas em style.css).
function getImageAspectRatio(dataUrl) {
  return new Promise((resolve) => {
    if (!dataUrl) { resolve(null); return; }
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : null);
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

// Preenche (NUNCA corta, nunca estica) uma imagem já recortada até bater
// EXATAMENTE a proporção pedida ao Gemini — fundo branco sólido só nas
// bordas que sobrarem, o móvel fica sempre no tamanho/proporção originais,
// só centralizado numa tela maior. Pedido do usuário (2026-07-31): "a IA
// sempre altera projeto quando a proporcao da imagem e diferente do padrao
// dela... isso nao pode acontecer".
//
// Causa raiz do bug: currentGalleryAspectRatio já calculava a proporção
// suportada mais próxima e mandava esse valor pro parâmetro
// generationConfig.imageConfig.aspectRatio do Gemini (ver Edge Function) —
// mas a IMAGEM em si (trimmedSnapshot) continuava na proporção REAL do
// móvel, quase sempre diferente da proporção pedida. O Gemini então tinha
// que decidir sozinho como encaixar um conteúdo de uma proporção dentro de
// uma tela de saída de outra proporção — e a forma mais "óbvia" pra um
// modelo de edição de imagem resolver isso é redimensionar o conteúdo pra
// caber (exatamente o "muda o projeto pra caber" relatado), não inventar
// espaço vazio do nada.
//
// Fix: a imagem MANDADA já sai pré-preenchida na proporção exata pedida —
// o Gemini nunca mais precisa decidir como encaixar nada, só (no máximo)
// decorar minimamente a borda extra (as regras de "zone-limited decoration"
// do prompt em buildGalleryPrompt já cobrem isso, incluindo proibição
// explícita de adicionar móvel grande).
function padImageToAspectRatio(dataUrl, targetRatio) {
  return new Promise((resolve) => {
    if (!dataUrl || !targetRatio || !isFinite(targetRatio) || targetRatio <= 0) { resolve(dataUrl); return; }
    const img = new Image();
    img.onload = () => {
      try {
        const w = img.naturalWidth, h = img.naturalHeight;
        if (!w || !h) { resolve(dataUrl); return; }
        const currentRatio = w / h;
        // Já bate (tolerância pequena, escala log) — não recria a imagem à toa.
        if (Math.abs(Math.log(currentRatio / targetRatio)) < 0.01) { resolve(dataUrl); return; }
        let outW = w, outH = h;
        if (currentRatio > targetRatio) {
          // Móvel mais largo que o alvo -- aumenta a ALTURA da tela (nunca
          // corta largura, só adiciona fundo em cima/embaixo).
          outH = Math.round(w / targetRatio);
        } else {
          // Móvel mais estreito/alto que o alvo -- aumenta a LARGURA da
          // tela (nunca corta altura, só adiciona fundo nas laterais).
          outW = Math.round(h * targetRatio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = outW;
        canvas.height = outH;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, outW, outH);
        ctx.drawImage(img, Math.round((outW - w) / 2), Math.round((outH - h) / 2));
        resolve(canvas.toDataURL('image/png'));
      } catch (err) {
        resolve(dataUrl); // canvas "tainted" ou outro erro -- devolve a original, nunca quebra o fluxo
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// Reencoda uma data URL de imagem pra JPEG — pedido do usuário (2026-07-19):
// "manda as cores em jpg pra uma melhor textura", ao mandar as fotos reais
// de acabamento (colors.texture_url, ver buildColorReferencesForComposition)
// pro Gemini. O upload original pode estar em qualquer formato (PNG, etc.);
// isto aqui garante JPEG na hora de enviar, sem precisar reconverter o
// arquivo já salvo no Storage. Fundo branco antes de desenhar (JPEG não tem
// canal alpha — se a foto original tiver transparência, viraria preto sem
// isso).
function toJpegDataUrl(dataUrl, quality) {
  return new Promise((resolve) => {
    if (!dataUrl) { resolve(dataUrl); return; }
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', quality || 0.92));
      } catch (err) {
        resolve(dataUrl); // canvas "tainted" ou outro erro -- devolve a original, nunca quebra o fluxo
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

document.getElementById('po-add-item-btn').addEventListener('click', async () => {
  const cartError = document.getElementById('po-cart-error');
  cartError.style.display = 'none';
  if (!lastItemResult || !currentModule) {
    showError(I18n.t('step2.configure_before_add_error'));
    return;
  }

  // Editando um módulo de um PEDIDO JÁ SALVO (ver editOrderItem/tela do
  // pedido, migration 047) — em vez de inserir uma linha nova ou mexer numa
  // composição, faz UPDATE na MESMA linha de order_items e volta pra tela
  // do pedido (ver saveOrderItemEdit). Checado ANTES do modo Composição —
  // os dois nunca ficam setados ao mesmo tempo.
  if (editingOrderItemId) {
    await saveOrderItemEdit();
    return;
  }

  // Modo "Projetos" (ver startProjectSlotConfig, canvas 2D — pedido do
  // usuário 2026-07-21) — grava a configuração completa deste módulo em
  // projectSlots (posição livre x/y + profundidade), não em
  // compositionSlots nem em order_items. Checado ANTES do modo Composição
  // (os dois nunca ficam setados ao mesmo tempo, mesma convenção de
  // editingOrderItemId acima). Posição em si (x_mm/floor_height_mm/z_order)
  // só é ATRIBUÍDA aqui quando o slot é NOVO — editando um já existente
  // (editProjectSlot) preserva onde o cliente já tinha arrastado ele.
  if (addTargetProjectSlotId !== null) {
    let thumbnail_data_url = null;
    try { thumbnail_data_url = await trimTransparentPng(Viewer3D.snapshot()); } catch (e) { /* sem 3D, sem miniatura */ }
    const effectivePieces = pieces.filter((p) => !p.client_optional || selectedOptionalComponentIds.has(p.id));
    if (typeof applyFloorHeightInput === 'function') applyFloorHeightInput();
    const existingSlot = projectSlots.find((s) => s.id === addTargetProjectSlotId);
    const newSlot = {
      id: addTargetProjectSlotId,
      wall_index: existingSlot ? Number(existingSlot.wall_index || 0) : projectActiveWallIndex,
      x_mm: existingSlot ? Number(existingSlot.x_mm || 0) : 0, // recalculado abaixo se for slot novo
      floor_height_mm: currentFloorHeightMm,
      z_order: existingSlot ? Number(existingSlot.z_order || 0) : 0,
      module: currentModule,
      pieces: effectivePieces,
      // Cores DISPONÍVEIS pro módulo (não só a escolhida) — precisa
      // continuar aqui depois de editar via "Editar configuração completa",
      // senão o painel inline (ver renderProjectConfigPanel) perderia as
      // opções de swatch pra trocar cor sem reabrir o modal de novo.
      // moduleColorsByRole é o global que loadModuleColors (chamado por
      // selectModule) acabou de preencher pra este MESMO currentModule.
      colorOptionsByRole: moduleColorsByRole,
      colorsByRole: lastItemResult.colorsByRole,
      selectedColors: lastItemResult.selectedColors,
      pieceColorOverrides: lastItemResult.pieceColorOverrides,
      hingeModel: lastItemResult.hingeModel,
      slideModel: lastItemResult.slideModel,
      width_mm: lastItemResult.width_mm,
      height_mm: lastItemResult.height_mm,
      depth_mm: lastItemResult.depth_mm,
      shelfQuantities: lastItemResult.shelfQuantities,
      dimOverrides: lastItemResult.dimOverrides,
      selectedOptionalIds: lastItemResult.selectedOptionalIds,
      result: lastItemResult.result,
      thumbnail_data_url,
      // Valores de largura/altura TRAVADOS (currentModule.width_locked/
      // height_locked) — o global `dimensionPresets` já está fresco pra
      // ESTE módulo (loadModuleDimensionPresets, chamado dentro de
      // selectModule logo antes de abrir esta tela) — sem precisar de outra
      // consulta. Usado pelas setinhas de esticar do canvas (pedido do
      // usuário 2026-07-26, ver widthResizable/heightResizable e
      // updateProjectSlotDimension/updateProjectSlotWidthFromLeft).
      widthPresetsMm: currentModule.width_locked ? (dimensionPresets.width || []).map((r) => Number(r.value_mm)) : [],
      heightPresetsMm: currentModule.height_locked ? (dimensionPresets.height || []).map((r) => Number(r.value_mm)) : [],
      // Ver mesmo comentário em insertProjectModuleDefault (portal-06a) —
      // dropdown de SKU no painel da direita precisa do rótulo, não só do mm.
      // dimensionPresets já veio com select('*'), então já tem `.label`.
      widthPresetsLabeled: currentModule.width_locked ? (dimensionPresets.width || []).map((r) => ({ value_mm: Number(r.value_mm), label: r.label || null })) : [],
      heightPresetsLabeled: currentModule.height_locked ? (dimensionPresets.height || []).map((r) => ({ value_mm: Number(r.value_mm), label: r.label || null })) : []
    };
    if (!existingSlot) newSlot.x_mm = computeDefaultProjectSlotX(newSlot.width_mm);

    const idx = projectSlots.findIndex((s) => s.id === addTargetProjectSlotId);
    if (idx >= 0) projectSlots[idx] = newSlot; else projectSlots.push(newSlot);
    markProjectDirty();

    exitProjectSlotConfig();
    highlightSelectedModuleCard('');
    document.getElementById('po-config-section').style.display = 'none';
    document.getElementById('po-module-description').textContent = '';
    currentModule = null;
    lastItemResult = null;
    selectedProjectSlotId = newSlot.id;
    renderProjectCanvas();
    return;
  }

  // Modo "Composição" (ver startCompositionSlotConfig, mais abaixo neste
  // arquivo): em vez de gravar em order_items/cartItems (isso é um PEDIDO),
  // guarda a configuração completa deste módulo só na memória, no slot da
  // composição, e volta pra aba "Composição" já mostrando o próximo slot
  // vazio à direita. Nada é salvo no banco aqui — a composição hoje é só
  // uma ferramenta de visualização, não vira pedido sozinha.
  if (addTargetSlotIndex !== null) {
    let thumbnail_data_url = null;
    try { thumbnail_data_url = await trimTransparentPng(Viewer3D.snapshot()); } catch (e) { /* sem 3D, sem miniatura */ }
    const effectivePieces = pieces.filter((p) => !p.client_optional || selectedOptionalComponentIds.has(p.id));
    // id/stack_on_id (empilhamento, ver renderCompositionSlots/addStackOnId):
    // sobrescrevendo um slot JÁ preenchido (edição, nem insert nem stack —
    // ver editCompositionSlot), preserva o id/stack_on_id que esse slot já
    // tinha, senão qualquer módulo empilhado em cima dele ficaria órfão
    // (stack_on_id apontando pra um id que sumiu). Em qualquer outro caso
    // (slot vazio do final, insert lado-a-lado, ou stack em cima de outro)
    // é sempre um slot NOVO: id novo, stack_on_id = addStackOnId (setado só
    // pelo botão "Colocar em cima", null nos outros dois).
    const existingSlot = !compositionInsertMode ? compositionSlots[addTargetSlotIndex] : null;
    // Garante que um valor digitado mas ainda não confirmado (sem Enter/blur
    // — ver applyFloorHeightInput, só roda no 'change') não fique de fora se
    // o cliente for direto pro botão "Adicionar" com o campo ainda focado.
    if (typeof applyFloorHeightInput === 'function') applyFloorHeightInput();
    const floor_height_mm = currentFloorHeightMm;
    const newSlot = {
      id: existingSlot ? existingSlot.id : newSlotId(),
      stack_on_id: existingSlot ? (existingSlot.stack_on_id || null) : addStackOnId,
      floor_height_mm,
      module: currentModule,
      pieces: effectivePieces,
      colorsByRole: lastItemResult.colorsByRole,
      selectedColors: lastItemResult.selectedColors,
      pieceColorOverrides: lastItemResult.pieceColorOverrides,
      hingeModel: lastItemResult.hingeModel,
      slideModel: lastItemResult.slideModel,
      width_mm: lastItemResult.width_mm,
      height_mm: lastItemResult.height_mm,
      depth_mm: lastItemResult.depth_mm,
      shelfQuantities: lastItemResult.shelfQuantities,
      dimOverrides: lastItemResult.dimOverrides,
      selectedOptionalIds: lastItemResult.selectedOptionalIds,
      result: lastItemResult.result,
      thumbnail_data_url
    };
    // Modo INSERIR (ver startCompositionSlotConfig/renderCompositionSlots,
    // divisor "+" entre cards) — abre espaço nessa posição em vez de
    // sobrescrever o que já estava lá; modo normal (editar um slot já
    // preenchido OU adicionar no slot vazio do final) sobrescreve na mesma
    // posição, como sempre.
    if (compositionInsertMode) {
      compositionSlots.splice(addTargetSlotIndex, 0, newSlot);
    } else {
      compositionSlots[addTargetSlotIndex] = newSlot;
    }
    compositionInsertMode = false;
    exitCompositionSlotConfig();
    highlightSelectedModuleCard('');
    document.getElementById('po-config-section').style.display = 'none';
    document.getElementById('po-module-description').textContent = '';
    currentModule = null;
    lastItemResult = null;
    renderCompositionSlots();
    return;
  }

  try {
    const orderId = await ensureDraftOrder();
    let thumbnail_data_url = null;
    try { thumbnail_data_url = await trimTransparentPng(Viewer3D.snapshot()); } catch (e) { /* sem 3D, sem miniatura */ }

    const payload = {
      order_id: orderId,
      module_id: currentModule.id,
      module_name: currentModule.name,
      module_description: currentModule.description || null,
      selected_colors: lastItemResult.selectedColors,
      hinge_model_id: lastItemResult.hingeModel ? lastItemResult.hingeModel.id : null,
      slide_model_id: lastItemResult.slideModel ? lastItemResult.slideModel.id : null,
      width_mm: lastItemResult.width_mm,
      height_mm: lastItemResult.height_mm,
      depth_mm: lastItemResult.depth_mm,
      shelf_quantities: lastItemResult.shelfQuantities,
      dim_overrides: lastItemResult.dimOverrides,
      piece_color_overrides: buildPieceColorOverridesSnapshot(lastItemResult.pieceColorOverrides),
      selected_optional_component_ids: lastItemResult.selectedOptionalIds,
      // Configuração completa sempre adiciona 1 unidade por vez — quantidade
      // >1 só existia no atalho "Adicionar módulo" da vitrine (quickAddModule),
      // removido 2026-07-19 (todo módulo precisa passar pela configuração
      // completa antes de entrar no carrinho agora).
      quantity: 1,
      unit_price: lastItemResult.result.total,
      total_price: lastItemResult.result.total,
      breakdown: lastItemResult.result.breakdown,
      thumbnail_data_url,
      sort_order: cartItems.length
    };

    const { data, error } = await supabaseClient.from('order_items').insert(payload).select().single();
    if (error) throw error;
    cartItems.push(data);
    renderCart();

    // Reseta o configurador pra escolher o PRÓXIMO módulo do zero.
    highlightSelectedModuleCard('');
    document.getElementById('po-config-section').style.display = 'none';
    document.getElementById('po-module-description').textContent = '';
    currentModule = null;
    lastItemResult = null;
    viewer3dNeedsRefit = true;
  } catch (err) {
    cartError.textContent = I18n.t('cart.add_error', { msg: err.message });
    cartError.style.display = 'block';
  }
});

async function removeCartItem(itemId) {
  try {
    const { error } = await supabaseClient.from('order_items').delete().eq('id', itemId);
    if (error) throw error;
    cartItems = cartItems.filter((it) => it.id !== itemId);
    renderCart();
  } catch (err) {
    const cartError = document.getElementById('po-cart-error');
    cartError.textContent = I18n.t('cart.remove_error', { msg: err.message });
    cartError.style.display = 'block';
  }
}

// "Revisar pedido" (pedido do usuário 2026-07-29) — leva a tela do pedido
// (#po-order-detail-section, a mesma que "Meus Pedidos" abre pra pedidos já
// salvos) pro pedido ainda em RASCUNHO sendo montado agora. Antes só dava
// pra chegar nessa tela depois que o antigo botão "Salvar pedido" mudava o
// status pra 'submitted' — esse botão não existe mais (ver ensureDraftOrder/
// renderCart), então essa é a ÚNICA porta de entrada agora. openOrderDetail
// não filtra por status (busca a linha de "orders" direto pelo id), então
// funciona igual pra 'draft' — a diferença toda fica em renderOrderDetail
// (Aprovar Pedido continua exigindo os 5 campos preenchidos, e é isso que
// agora faz o papel de "salvar" o pedido pra valer, ver order_detail_
// approval_screen).
function reviewDraftOrder() {
  if (!currentDraftOrderId) return;
  const myOrdersBtn = document.querySelector('.portal-tab-btn[data-tab="po-tab-my-orders"]');
  if (myOrdersBtn) myOrdersBtn.click();
  openOrderDetail(currentDraftOrderId);
}
const cartReviewBtn = document.getElementById('po-cart-review-btn');
if (cartReviewBtn) cartReviewBtn.addEventListener('click', reviewDraftOrder);

// "Continuar comprando" (pedido do usuário 2026-07-29: "abre o carrinho e vai
// pra tela de new quote pra selecionar poder acrescentar outros itens...
// isso se nao tiver aprovado ainda") — o inverso de reviewDraftOrder: sai da
// tela do pedido de volta pro catálogo, mas com ESTE pedido (o que estava
// aberto — pode ser o rascunho atual OU um "Pendente" antigo revisitado via
// Meus Pedidos) virando o rascunho ATIVO, pra qualquer módulo adicionado
// dali em diante entrar nele (mesmo order_id), não criar um pedido separado.
// isLocked já garante que o botão nem aparece pra pedido aprovado/pago/
// entregue (ver renderOrderDetail), mas o guard de alterações não salvas
// (orderDetailHasUnsavedChanges) roda aqui TAMBÉM, igual ao "Voltar" — senão
// sairia sem avisar igual ao bug que motivou aquele fix.
async function continueShoppingOnOrder() {
  if (!currentOrderDetail) return;
  if (orderDetailHasUnsavedChanges() && !confirm(I18n.t('order_detail.unsaved_changes_confirm'))) return;
  const orderId = currentOrderDetail.order.id;
  currentDraftOrderId = orderId;
  // Guarda o status REAL (pode ser 'submitted' num pedido antigo revisitado)
  // — ver comentário na declaração de currentDraftOrderStatus: isso é o que
  // impede "Novo Pedido" de apagar um pedido que já existia antes desta ida
  // ao catálogo.
  currentDraftOrderStatus = currentOrderDetail.order.status;
  const { data: items } = await supabaseClient
    .from('order_items')
    .select('*')
    .eq('order_id', orderId)
    .order('sort_order');
  cartItems = items || [];
  renderCart();
  // Fecha a tela do pedido igual ao "Voltar" faria (sem chamar
  // closeOrderDetail() inteiro — não queremos voltar pra lista "Meus
  // Pedidos", e sim ir direto pro catálogo) — já confirmamos acima, então
  // esconder a seção agora evita o guard de troca de aba perguntar de novo.
  currentOrderDetail = null;
  document.getElementById('po-order-detail-section').style.display = 'none';
  const newOrderTabBtn = document.querySelector('.portal-tab-btn[data-tab="po-tab-new-order"]');
  if (newOrderTabBtn) newOrderTabBtn.click();
}
const continueShoppingBtnEl = document.getElementById('po-order-detail-continue-shopping-btn');
if (continueShoppingBtnEl) continueShoppingBtnEl.addEventListener('click', continueShoppingOnOrder);

// "Salvar Pedido" (pedido do usuário 2026-07-29: "nao opcao de salvar ordem
// pra comecar uma nova, so de approvar a ordem. esse aprove deve ser ultima
// coisa. preciso um salvar pra liberar o carrinho novo") — finaliza o
// pedido como um registro de verdade ('draft' -> 'submitted', ver
// migration_017), SEM exigir os 5 campos nem travar a tela (diferente de
// "Aprovar Pedido", que continua o ÚLTIMO passo — só quando o cliente
// decidir aprovar de vez, isLocked continua travando tudo só nesse ponto).
// Fecha o ciclo que faltava em "Novo Pedido" (ver startNewOrder logo
// abaixo): antes, escolher "salvar" lá levava pra reviewDraftOrder() e não
// tinha NENHUM jeito de sair dali sem aprovar — agora tem este botão.
async function saveOrderAndFreeCart() {
  if (!currentOrderDetail) return;
  const errorEl = document.getElementById('po-order-detail-error');
  const statusEl = document.getElementById('po-order-detail-save-order-status');
  const btn = document.getElementById('po-order-detail-save-order-btn');
  if (errorEl) errorEl.style.display = 'none';
  if (btn) btn.disabled = true;
  try {
    const orderId = currentOrderDetail.order.id;
    // Só muda o status de verdade se ainda for 'draft' — um 'submitted'
    // revisitado (via Meus Pedidos) já é um registro real, não precisa (nem
    // deve) reescrever submitted_at de novo.
    if (currentOrderDetail.order.status === 'draft') {
      const { data, error } = await supabaseClient
        .from('orders')
        .update({ status: 'submitted', submitted_at: new Date().toISOString() })
        .eq('id', orderId)
        .select()
        .single();
      if (error) throw error;
      currentOrderDetail.order = data;
    }
    // Libera o carrinho — se este pedido era o rascunho ativo, desanexa
    // (mesmo raciocínio de currentDraftOrderStatus/discardCurrentDraftOrder,
    // só que aqui NADA é apagado: o pedido continua intacto, só para de ser
    // "o carrinho" — a próxima adição no catálogo cria um rascunho NOVO).
    if (currentDraftOrderId === orderId) {
      currentDraftOrderId = null;
      currentDraftOrderStatus = null;
      cartItems = [];
      renderCart();
    }
    renderOrderDetail(); // badge/status atualiza pra "Pendente"
    if (statusEl) {
      statusEl.textContent = I18n.t('order_detail.order_saved');
      statusEl.style.display = 'block';
      setTimeout(() => { statusEl.style.display = 'none'; statusEl.textContent = ''; }, 4000);
    }
  } catch (err) {
    if (errorEl) { errorEl.textContent = I18n.t('order_detail.save_order_error', { msg: err.message || String(err) }); errorEl.style.display = 'block'; }
  } finally {
    if (btn) btn.disabled = false;
  }
}
const saveOrderBtnEl = document.getElementById('po-order-detail-save-order-btn');
if (saveOrderBtnEl) saveOrderBtnEl.addEventListener('click', saveOrderAndFreeCart);

// "Novo Pedido" (pedido do usuário 2026-07-29: "preciso um botao novo
// pedido. zera o pedido anteriro (pede se quer salvar) e comeca do zero") —
// 2 confirmações em sequência (só confirm() nativo, mesmo padrão do resto do
// portal, sem modal customizado): primeiro pergunta se quer SALVAR/revisar o
// pedido atual antes (OK leva pra "Revisar pedido" — reviewDraftOrder — o
// cliente decide lá se aprova ou volta e clica "Novo Pedido" de novo
// depois); só se recusar salvar é que confirma de novo, agora no tom de
// "tem certeza" antes de zerar pra valer (evita clique acidental derrubando
// um pedido em andamento).
function startNewOrder() {
  if (cartItems.length === 0) return; // nada pra zerar (guard extra — o botão já nem aparece nesse caso)
  if (confirm(I18n.t('cart.new_order_save_confirm'))) {
    reviewDraftOrder();
    return;
  }
  if (!confirm(I18n.t('cart.new_order_discard_confirm'))) return;
  discardCurrentDraftOrder();
}

// Some com o pedido atual de vez (chamado só depois de confirmado acima) —
// só APAGA a linha de "orders" (cascade em order_items) quando ainda é um
// 'draft' de verdade: um pedido 'submitted' revisitado via "Continuar
// comprando" (continueShoppingOnOrder) é um pedido JÁ EXISTENTE antes desta
// sessão e não pode ser destruído por aqui — só desanexa (o cliente ainda
// enxerga ele intacto em "Meus Pedidos"). Sem essa distinção, um 'draft'
// abandonado (não apagado, só desanexado em memória) voltaria sozinho no
// próximo login (loadDraftOrderIfAny pega o 'draft' mais recente), contendo
// justamente os itens que o cliente pediu pra "zerar".
async function discardCurrentDraftOrder() {
  const orderIdToDiscard = currentDraftOrderId;
  const wasFreshDraft = currentDraftOrderStatus === 'draft';
  currentDraftOrderId = null;
  currentDraftOrderStatus = null;
  cartItems = [];
  renderCart();
  if (wasFreshDraft && orderIdToDiscard) {
    try { await supabaseClient.from('orders').delete().eq('id', orderIdToDiscard); }
    catch (e) { /* best-effort — o carrinho já foi zerado na tela de qualquer forma */ }
  }
}
const cartNewOrderBtn = document.getElementById('po-cart-new-order-btn');
if (cartNewOrderBtn) cartNewOrderBtn.addEventListener('click', startNewOrder);

// Retoma um pedido em rascunho (se o cliente saiu no meio e voltou depois)
// — carrega os itens já adicionados de volta pro carrinho visível. Nome do
// cliente/PO desse rascunho (se já preenchidos via a tela do pedido numa
// visita anterior) não precisam ser repostos em campo nenhum aqui — a barra
// lateral não tem mais esses campos, eles só aparecem de novo se o cliente
// clicar "Revisar pedido" e abrir a tela do pedido.
async function loadDraftOrderIfAny() {
  const { data: draftOrders, error } = await supabaseClient
    .from('orders')
    .select('*')
    .eq('client_user_id', currentUser.id)
    .eq('status', 'draft')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error || !draftOrders || draftOrders.length === 0) return;
  currentDraftOrderId = draftOrders[0].id;
  currentDraftOrderStatus = 'draft';
  const { data: items } = await supabaseClient
    .from('order_items')
    .select('*')
    .eq('order_id', currentDraftOrderId)
    .order('sort_order');
  cartItems = items || [];
  renderCart();
}

// ---------- Meus pedidos (histórico de pedidos salvos) ----------

let myOrdersLoaded = false;

// Mapeamento de status -> texto mostrado no badge. 'submitted' é chamado de
// "Pendente" na interface (pedido do usuário 2026-07-29 — era "Aberta"; o
// status no banco continua o mesmo, só o rótulo mudou); 'approved'
// ("Aprovada") trava os campos de contato/entrega (ver renderOrderDetail).
// 'paid'/'delivered' (migration 059) são os 2 estágios seguintes — sequência
// Pendente → Aprovada → Paga → Entregue, sempre nessa ordem.
function orderStatusLabel(status) {
  if (status === 'draft') return I18n.t('my_orders.status_draft');
  if (status === 'submitted') return I18n.t('my_orders.status_submitted');
  if (status === 'approved') return I18n.t('my_orders.status_approved');
  if (status === 'paid') return I18n.t('my_orders.status_paid');
  if (status === 'delivered') return I18n.t('my_orders.status_delivered');
  // 'saved' (migration 052) — só existe pro Plano de Corte ("Salvar", não
  // "Aprovar"): fica no "Meus Pedidos" do cliente, mas nunca aparece na
  // lista de Pedidos do admin (não filtra por 'saved' lá — ver
  // renderOrdersList em admin.js), ou seja, não vai pra fábrica.
  if (status === 'saved') return I18n.t('my_orders.status_saved');
  return status;
}

async function loadMyOrders() {
  const container = document.getElementById('po-orders-list');
  const errorEl = document.getElementById('po-orders-error');
  errorEl.style.display = 'none';
  container.innerHTML = `<p class="hint">${I18n.t('my_orders.loading')}</p>`;
  try {
    // 'submitted' (Pendente), 'approved' (Aprovada), 'paid' (Paga) e
    // 'delivered' (Entregue, migration 059) aparecem aqui — só 'draft'
    // (carrinho em andamento, ainda não salvo) fica de fora.
    const { data: orders, error } = await supabaseClient
      .from('orders')
      .select('*')
      .eq('client_user_id', currentUser.id)
      // 'saved' (migration 052) — pedido de Plano de Corte salvo mas não
      // aprovado ainda; precisa aparecer aqui pro cliente (é o "Meus
      // Pedidos" DELE), mesmo não aparecendo na lista do admin.
      .in('status', ['submitted', 'saved', 'approved', 'paid', 'delivered'])
      .order('submitted_at', { ascending: false });
    if (error) throw error;

    if (!orders || orders.length === 0) {
      container.innerHTML = `<p class="hint">${I18n.t('my_orders.none_yet')}</p>`;
      myOrdersLoaded = true;
      return;
    }

    // Pedido de módulo (order_items) e pedido de Plano de Corte
    // (cutting_list_items, migration 051) vivem em tabelas diferentes —
    // separa os ids por order_type antes de buscar, senão um pedido de
    // plano de corte apareceria com total $0 (sem order_items nenhum).
    const moduleOrderIds = orders.filter((o) => o.order_type !== 'cutting_list').map((o) => o.id);
    const cutlistOrderIds = orders.filter((o) => o.order_type === 'cutting_list').map((o) => o.id);
    const [{ data: allItems, error: itemsError }, { data: allCutlistItems, error: cutlistItemsError }] = await Promise.all([
      moduleOrderIds.length
        ? supabaseClient.from('order_items').select('*').in('order_id', moduleOrderIds).order('sort_order')
        : Promise.resolve({ data: [] }),
      cutlistOrderIds.length
        ? supabaseClient.from('cutting_list_items').select('*').in('order_id', cutlistOrderIds).order('sort_order')
        : Promise.resolve({ data: [] })
    ]);
    if (itemsError) throw itemsError;
    if (cutlistItemsError) throw cutlistItemsError;

    const itemsByOrder = {};
    (allItems || []).forEach((it) => {
      if (!itemsByOrder[it.order_id]) itemsByOrder[it.order_id] = [];
      itemsByOrder[it.order_id].push(it);
    });
    const cutlistItemsByOrder = {};
    (allCutlistItems || []).forEach((it) => {
      if (!cutlistItemsByOrder[it.order_id]) cutlistItemsByOrder[it.order_id] = [];
      cutlistItemsByOrder[it.order_id].push(it);
    });

    // Clicar no cartão (fora do botão de PDF) abre a tela grande do pedido
    // (ver openOrderDetail/renderOrderDetail, migration 047) — substitui o
    // antigo expand-inline (pedido do usuário 2026-07-19: "abre essa tela").
    // Pedido de Plano de Corte abre uma tela read-only diferente (sem PDF
    // nesta versão — ver openCutlistOrderDetail).
    container.innerHTML = orders.map((o) => {
      const isCutlist = o.order_type === 'cutting_list';
      // 'project' (pedido do usuário 2026-08-02) — pedido próprio criado
      // pela aba Projetos (ver sendProjectToOrder), vive em order_items igual
      // a um pedido normal de módulo, só ganha uma badge extra pra deixar
      // claro de onde veio.
      const isProjectOrder = o.order_type === 'project';
      const items = isCutlist ? (cutlistItemsByOrder[o.id] || []) : (itemsByOrder[o.id] || []);
      const total = items.reduce((sum, it) => sum + Number(it.total_price || 0), 0);
      const date = o.submitted_at ? new Date(o.submitted_at).toLocaleString(currentLocale()) : '';
      // Título do cartão: PO e nome do cliente AGORA os dois em destaque
      // (pedido do usuário 2026-07-29: "quero ver o nome da PO em destaque
      // nessa listagem de pedidos, nome do cliente tambem") — antes só um
      // dos dois aparecia (PO tinha prioridade, cliente só entrava se não
      // tivesse PO). Sem nenhum dos dois, cai no fallback de sempre (data).
      const title = o.po_name || o.client_name || I18n.t('my_orders.order_of', { date });
      // Segunda linha: cliente (se a PO já apareceu no título) + data — só
      // mostra o que ainda não apareceu no título, pra não repetir o mesmo
      // nome duas vezes quando só um dos dois existe.
      const subtitleParts = [];
      if (o.po_name && o.client_name) subtitleParts.push(o.client_name);
      if (date) subtitleParts.push(date);
      const subtitle = subtitleParts.join(' — ');
      return `
        <div class="portal-order-card portal-order-card-clickable" data-order-id="${o.id}">
          <div class="portal-order-header">
            <div class="portal-order-title">
              <strong>${title}</strong>
              ${subtitle ? `<span class="hint">— ${subtitle}</span>` : ''}
              <span class="badge">${orderStatusLabel(o.status)}</span>
              ${isCutlist ? `<span class="badge" data-i18n="admin.orders_type_cutting_list">${I18n.t('admin.orders_type_cutting_list')}</span>` : ''}
              ${isProjectOrder ? `<span class="badge" data-i18n="admin.orders_type_project">${I18n.t('admin.orders_type_project')}</span>` : ''}
            </div>
            <span class="portal-order-total">${formatMoney(total)}</span>
          </div>
          <div class="portal-order-actions">
            <button type="button" class="secondary portal-order-view-btn" data-order-id="${o.id}">${I18n.t('my_orders.view_details')}</button>
            ${isCutlist ? '' : `<button type="button" class="secondary portal-order-pdf-btn" data-order-id="${o.id}">${I18n.t('my_orders.generate_pdf')}</button>`}
          </div>
        </div>
      `;
    }).join('');

    const openDetailFor = (orderId) => {
      const order = orders.find((o) => o.id === orderId);
      if (!order) return;
      if (order.order_type === 'cutting_list') openCutlistOrderDetail(order, cutlistItemsByOrder[order.id] || []);
      else openOrderDetail(orderId);
    };
    container.querySelectorAll('.portal-order-card-clickable').forEach((card) => {
      card.addEventListener('click', () => openDetailFor(card.dataset.orderId));
    });
    container.querySelectorAll('.portal-order-view-btn').forEach((btn) => {
      btn.addEventListener('click', (ev) => { ev.stopPropagation(); openDetailFor(btn.dataset.orderId); });
    });
    container.querySelectorAll('.portal-order-pdf-btn').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation(); // não deixa "vazar" pro card e abrir a tela do pedido junto
        const order = orders.find((o) => o.id === btn.dataset.orderId);
        generateOrderPDF(order, itemsByOrder[btn.dataset.orderId] || []);
      });
    });

    myOrdersLoaded = true;
  } catch (err) {
    errorEl.textContent = I18n.t('my_orders.load_error', { msg: err.message });
    errorEl.style.display = 'block';
    container.innerHTML = '';
  }
}

// ---------- Tela do pedido (migration 047, 2026-07-19) ----------
// Aberta a partir de "Meus Pedidos" — mostra cada módulo configurado
// (imagem grande, medidas, cores, descrição, preço) só pra VISUALIZAR;
// produto não se edita direto aqui (ver editOrderItem pro botão "Editar").
// "Aprovar Pedido" exige nome do cliente/OP/telefone/e-mail/endereço de
// entrega preenchidos e trava a tela pra sempre (sem fluxo de reabertura
// nesta versão — confirmado via AskUserQuestion).

let currentOrderDetail = null; // { order, items } do pedido aberto agora nesta tela, null quando fechada

async function openOrderDetail(orderId) {
  const listErrorEl = document.getElementById('po-orders-error');
  listErrorEl.style.display = 'none';
  try {
    const [{ data: order, error }, { data: items, error: itemsError }] = await Promise.all([
      supabaseClient.from('orders').select('*').eq('id', orderId).single(),
      supabaseClient.from('order_items').select('*').eq('order_id', orderId).order('sort_order')
    ]);
    if (error) throw error;
    if (itemsError) throw itemsError;

    // Bolinha de cor (pedido do usuário 2026-07-19: "quero uma bolinha das
    // cores selecionadas, em cada modelo") — selected_colors é um snapshot
    // congelado no order_item (só role_name/color_name, pra nunca mudar
    // mesmo que a cor seja renomeada depois), sem a APARÊNCIA visual
    // (swatch_hex/texture_url). Busca o registro de "colors" de verdade por
    // color_id no catálogo atual só pra desenhar a bolinha — funciona
    // retroativo em pedidos antigos também (não depende de re-salvar nada).
    const colorIds = [...new Set((items || []).flatMap((it) => (it.selected_colors || []).map((c) => c.color_id)).filter(Boolean))];
    const { data: colorsData } = colorIds.length
      ? await supabaseClient.from('colors').select('id, swatch_hex, texture_url, substrato').in('id', colorIds)
      : { data: [] };
    const colorById = new Map((colorsData || []).map((c) => [c.id, c]));

    currentOrderDetail = { order, items: items || [], colorById };
    // Reseta a aba ativa E qualquer troca de cor pendente (ver
    // orderDetailPendingColorChanges) — cada pedido tem seus próprios
    // papéis de cor disponíveis (ver renderOrderDetailColorPanel), não faz
    // sentido herdar aba ou pendência do pedido anterior.
    orderDetailColorActiveTabRoleId = null;
    orderDetailPendingColorChanges = {};
    document.getElementById('po-orders-list-panel').style.display = 'none';
    document.getElementById('po-order-detail-section').style.display = 'block';
    renderOrderDetail();
  } catch (err) {
    listErrorEl.textContent = I18n.t('order_detail.load_error', { msg: err.message });
    listErrorEl.style.display = 'block';
  }
}

// Aviso de alterações não salvas na tela do pedido (pedido do usuário
// 2026-07-29: "quando dou back, ele nao pede pra salvar alteracoes, nem de
// cor nem de quantidade"; ampliado no mesmo dia — "nao ta salvando
// informacoes do cabecalho do pedido": os campos de nome/OP/telefone/e-mail/
// endereço SÓ gravam quando o cliente clica "Salvar informações" — clicar
// "Voltar" sem clicar nele antes perdia a edição inteira, silenciosamente)
// — mesmo espírito do guard da aba Projetos (ver projectDirty/
// markProjectDirty), mas aqui NADA fica pendente de verdade em memória por
// muito tempo (cor em massa fica em orderDetailPendingColorChanges até
// "Alterar cores"; quantidade grava sozinha no 'change' do campo) — então em
// vez de um flag dedicado, checa na hora: (1) alguma troca de cor em massa
// ainda não aplicada, (2) algum campo de quantidade com valor digitado na
// tela diferente do que está realmente salvo no item, e (3) algum campo do
// cabeçalho (nome/OP/telefone/e-mail/endereço) com valor digitado diferente
// do que está gravado em currentOrderDetail.order. (1)/(2) cobrem tanto
// "ainda nem saiu do campo" quanto "saiu do campo mas o save falhou" (erro de
// rede/RLS); (3) é sempre assim, já que o cabeçalho não tem auto-save nenhum.
function orderDetailHasUnsavedChanges() {
  if (Object.keys(orderDetailPendingColorChanges).length > 0) return true;
  if (!currentOrderDetail) return false;
  const qtyDirty = currentOrderDetail.items.some((it) => {
    const input = document.getElementById(`po-order-item-qty-${it.id}`);
    if (!input) return false;
    const domQty = Math.max(1, Math.round(Number(input.value)) || 1);
    return domQty !== (Number(it.quantity) || 1);
  });
  if (qtyDirty) return true;
  return orderDetailHeaderFieldsDirty();
}

// Compara o que está digitado nos campos do cabeçalho AGORA contra o que
// currentOrderDetail.order tem gravado de verdade (atualizado só pelos
// botões "Salvar informações"/"Aprovar Pedido", ver seus handlers) — string
// vazia e null contam como "iguais" (o campo nunca foi preenchido dos dois
// lados), senão qualquer pedido aberto sem telefone/endereço preenchidos já
// nasceria "sujo" à toa.
function orderDetailHeaderFieldsDirty() {
  if (!currentOrderDetail) return false;
  const order = currentOrderDetail.order;
  const pairs = [
    ['po-order-detail-client-name', order.client_name],
    ['po-order-detail-po-name', order.po_name],
    ['po-order-detail-phone', order.client_phone],
    ['po-order-detail-email', order.client_email],
    ['po-order-detail-address', order.delivery_address]
  ];
  return pairs.some(([id, saved]) => {
    const el = document.getElementById(id);
    if (!el) return false;
    return el.value.trim() !== (saved || '');
  });
}

// Volta pra lista — recarrega ela (myOrdersLoaded=false força loadMyOrders a
// buscar de novo) porque aprovar o pedido muda o status/badge exibido.
function closeOrderDetail() {
  currentOrderDetail = null;
  document.getElementById('po-order-detail-section').style.display = 'none';
  document.getElementById('po-orders-list-panel').style.display = 'block';
  myOrdersLoaded = false;
  loadMyOrders();
}

document.getElementById('po-order-detail-back-btn').addEventListener('click', () => {
  if (orderDetailHasUnsavedChanges() && !confirm(I18n.t('order_detail.unsaved_changes_confirm'))) return;
  closeOrderDetail();
});

function renderOrderDetail() {
  if (!currentOrderDetail) return;
  const { order, items } = currentOrderDetail;
  // isLocked cobre os 3 estágios "pra frente" (Aprovada/Paga/Entregue,
  // migration 059) — antes só existia 'approved' como estágio final, então
  // "isApproved" bastava; com Pago/Entregue vindo DEPOIS de aprovado, usar só
  // isApproved destravaria os campos de novo num pedido já pago/entregue
  // (bug que corrigimos aqui: os 3 têm que travar igual).
  const isApproved = order.status === 'approved';
  const isPaid = order.status === 'paid';
  const isDelivered = order.status === 'delivered';
  const isLocked = isApproved || isPaid || isDelivered;

  document.getElementById('po-order-detail-title').textContent = order.po_name || order.client_name || I18n.t('pdf.order_fallback');
  document.getElementById('po-order-detail-status-badge').textContent = orderStatusLabel(order.status);

  const fieldsWrap = document.getElementById('po-order-detail-fields');
  fieldsWrap.classList.toggle('readonly', isLocked);
  const clientNameInput = document.getElementById('po-order-detail-client-name');
  const poNameInput = document.getElementById('po-order-detail-po-name');
  const phoneInput = document.getElementById('po-order-detail-phone');
  const emailInput = document.getElementById('po-order-detail-email');
  const addressInput = document.getElementById('po-order-detail-address');
  clientNameInput.value = order.client_name || '';
  poNameInput.value = order.po_name || '';
  phoneInput.value = order.client_phone || '';
  emailInput.value = order.client_email || '';
  addressInput.value = order.delivery_address || '';
  [clientNameInput, poNameInput, phoneInput, emailInput, addressInput].forEach((input) => { input.disabled = isLocked; });

  // A tela inteira é reconstruída (innerHTML) a cada render — qualquer
  // seletor de cor por módulo que estivesse aberto não existe mais no DOM
  // novo, então reseta o controle pra não ficar apontando pra um id morto.
  orderItemColorPickerOpenId = null;

  const itemsWrap = document.getElementById('po-order-detail-items');
  itemsWrap.innerHTML = items.map((it, idx) => renderOrderDetailItemCard(it, idx, isLocked, currentOrderDetail.colorById)).join('');
  itemsWrap.querySelectorAll('.po-order-item-color-btn').forEach((btn) => {
    btn.addEventListener('click', () => toggleOrderItemColorPicker(btn.dataset.itemId, btn.dataset.roleId, btn.dataset.pickerId));
  });
  itemsWrap.querySelectorAll('.po-order-item-edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => editOrderItem(order, items.find((it) => it.id === btn.dataset.itemId)));
  });
  itemsWrap.querySelectorAll('.po-order-item-remove-btn').forEach((btn) => {
    btn.addEventListener('click', () => removeOrderDetailItem(btn.dataset.itemId));
  });
  // Quantidade (pedido do usuário 2026-07-29) — 'change' (não 'input') pra só
  // gravar quando o cliente termina de mexer (sai do campo ou aperta Enter),
  // igual ao padrão de "Salvar informações": não fica batendo no banco a cada
  // dígito digitado.
  itemsWrap.querySelectorAll('.po-order-item-qty-input').forEach((input) => {
    input.addEventListener('change', () => updateOrderItemQuantity(input.dataset.itemId, input.value));
  });

  // Recorta a margem transparente de novo, AGORA nesta tela (pedido do
  // usuário 2026-07-19: "ainda esta com desenhos muito distantes") —
  // trimTransparentPng já roda uma vez no momento em que o item é
  // adicionado/editado (ver saveOrderItemEdit/po-add-item-btn), mas pedidos
  // salvos ANTES dessa peça existir (ou cuja captura sobrou com bastante
  // margem transparente) ficam com o desenho pequeno boiando no meio do
  // quadro grande (.po-order-item-image). Reaplicar aqui, na EXIBIÇÃO, é
  // 100% cosmético e retroativo — não mexe no 3D/câmera (viewer3d.js
  // intocado), só reprocessa o PNG já salvo; roda em background e troca o
  // src quando terminar (o cliente já vê a imagem original enquanto isso).
  itemsWrap.querySelectorAll('.po-order-item-image[data-raw-src]').forEach((imgEl) => {
    const raw = imgEl.dataset.rawSrc;
    trimTransparentPng(raw).then((trimmed) => { if (trimmed) imgEl.src = trimmed; });
  });

  const total = items.reduce((sum, it) => sum + Number(it.total_price || 0), 0);
  document.getElementById('po-order-detail-total').textContent = formatMoney(total);
  updateOrderDetailVolumeWeight(items);

  // "Gerar Proposta" (js/portal-10-proposta.js) — pra Dealer (lojista),
  // administrador e contractor (canGenerateProposal, pedido do usuário
  // 2026-08-24: "habilita gerar proposta pro administrador e pro
  // lojista/contractor tambem"; era só isDealer() antes), em QUALQUER
  // status do pedido (diferente de Aprovar/Salvar/Continuar comprando
  // acima, que travam com isLocked) — pode querer gerar a proposta de novo
  // mesmo depois de aprovado/pago.
  const proposalBtn = document.getElementById('po-order-detail-proposal-btn');
  if (proposalBtn) proposalBtn.style.display = canGenerateProposal() ? 'block' : 'none';

  // Aprovar só enquanto NADA foi decidido ainda (Pendente) — some a partir
  // de Aprovada em diante (isLocked cobre Aprovada/Paga/Entregue), não só
  // quando já está Aprovada como era antes de Pago/Entregue existirem.
  const approveBtn = document.getElementById('po-order-detail-approve-btn');
  const approveHint = document.getElementById('po-order-detail-approve-hint');
  approveBtn.style.display = isLocked ? 'none' : 'block';
  approveHint.style.display = isLocked ? 'none' : 'block';

  // "Salvar Pedido" (pedido do usuário 2026-07-29) — mesma trava do "Aprovar
  // Pedido" (isLocked): uma vez aprovado não tem mais "carrinho ativo" pra
  // liberar. Some SÓ quando o pedido já foi enviado pra frente (submitted em
  // diante) — igual às outras ações desta faixa.
  const saveOrderBtn = document.getElementById('po-order-detail-save-order-btn');
  const saveOrderStatus = document.getElementById('po-order-detail-save-order-status');
  if (saveOrderBtn) saveOrderBtn.style.display = isLocked ? 'none' : 'block';
  if (saveOrderStatus) saveOrderStatus.style.display = 'none';

  // "Continuar comprando" (pedido do usuário 2026-07-29) — mesma trava do
  // "Aprovar Pedido" (isLocked): não faz sentido acrescentar item num pedido
  // já decidido.
  const continueShoppingBtn = document.getElementById('po-order-detail-continue-shopping-btn');
  if (continueShoppingBtn) continueShoppingBtn.style.display = isLocked ? 'none' : 'block';

  // "Salvar informações" (pedido do usuário 2026-07-29: "quero um botao
  // salvar informacoes, para poder voltar e manter as informacoes salvas,
  // pra fechar posteriormente") — grava nome/OP/telefone/e-mail/endereço SEM
  // exigir os 5 campos nem travar a tela (diferente de "Aprovar Pedido");
  // só faz sentido enquanto os campos ainda estão editáveis.
  const saveInfoBtn = document.getElementById('po-order-detail-save-info-btn');
  const saveInfoStatus = document.getElementById('po-order-detail-save-info-status');
  if (saveInfoBtn) saveInfoBtn.style.display = isLocked ? 'none' : 'inline-block';
  if (saveInfoStatus) saveInfoStatus.textContent = '';

  // Pago/Entregue (migration 059) — sequência Pendente → Aprovada → Paga →
  // Entregue, sempre nessa ordem: só mostra o botão do PRÓXIMO passo válido
  // pro status atual (cliente E admin podem marcar, ver AskUserQuestion).
  const markPaidBtn = document.getElementById('po-order-detail-mark-paid-btn');
  const markDeliveredBtn = document.getElementById('po-order-detail-mark-delivered-btn');
  const deliveredHint = document.getElementById('po-order-detail-delivered-hint');
  if (markPaidBtn) markPaidBtn.style.display = isApproved ? 'block' : 'none';
  if (markDeliveredBtn) markDeliveredBtn.style.display = isPaid ? 'block' : 'none';
  if (deliveredHint) deliveredHint.style.display = isDelivered ? 'block' : 'none';

  // Painel de troca rápida de cor (ver renderOrderDetailColorPanel) — busca
  // as peças de cada módulo (DB), por isso é assíncrono; roda em paralelo,
  // não trava o resto da tela que já foi montada síncrono acima.
  renderOrderDetailColorPanel();
}

// ---------- Troca rápida de cor na tela do pedido ----------
// Pedido do usuário (2026-07-29): "quero o check list que ja esxite onde eu
// possa trocar rapidamente as cores" — mesmo padrão de abas por papel de cor
// já usado na Composição/Projetos (ver loadColorRoleGroupsForSlots, função
// genérica reaproveitada aqui igualzinho), só que os "slots" aqui são
// order_items JÁ SALVOS no banco (não objetos vivos em memória) — cada troca
// busca o hinge/slide/cores reais (mesmo padrão de editOrderItem), recalcula
// o preço (Pricing.calculateModulePrice) e grava direto via update, sem
// reabrir o configurador completo. Só disponível enquanto o pedido não está
// aprovado (renderOrderDetailColorPanel esconde o painel quando isApproved).
//
// Miniatura grande de cada card (thumbnail_data_url) — pedido do usuário
// (2026-07-29, feedback depois da 1ª versão): "a cor esta trocando, preco
// tambem, mas nao ta puxando a imagem que e bem importante". Esta tela não
// tem nenhum canvas 3D visível (diferente da Composição/Projetos), então a
// miniatura é regenerada num viewer ESCONDIDO, criado uma vez e reaproveitado
// (ver getOrderDetailHiddenViewer/recolorOrderItem) — monta o módulo isolado
// (Viewer3D.buildStandaloneAssembly via buildCompositionAssemblies, mesma
// função que a Composição já usa) num canvas fora da tela
// (#po-order-detail-hidden-viewer), tira o snapshot e recorta a margem
// (trimTransparentPng) antes de salvar. Se a regeneração falhar por algum
// motivo, mantém a miniatura antiga em vez de travar a troca de cor (cor/
// preço são o que importa de verdade; a imagem é best-effort).
let orderDetailColorActiveTabRoleId = null;
let orderDetailHiddenViewer = null; // instância única, reaproveitada (ver ViewerComposition.createInstance)

function getOrderDetailHiddenViewer() {
  if (!orderDetailHiddenViewer) {
    orderDetailHiddenViewer = ViewerComposition.createInstance();
    orderDetailHiddenViewer.init('po-order-detail-hidden-viewer');
  }
  return orderDetailHiddenViewer;
}

async function loadOrderDetailColorRoleGroups() {
  if (!currentOrderDetail) return [];
  const items = currentOrderDetail.items;
  const moduleIds = [...new Set(items.map((it) => it.module_id))];
  const piecesByModule = {};
  await Promise.all(moduleIds.map(async (mid) => {
    try { piecesByModule[mid] = await loadRecursivePiecesForModule(mid); } catch (e) { piecesByModule[mid] = []; }
  }));
  // "slots" falsos só com o suficiente pra loadColorRoleGroupsForSlots
  // funcionar (ela só lê slot.pieces e slot.module.id) — reaproveita a MESMA
  // função genérica da Composição/Projetos, sem duplicar a lógica de
  // interseção de cores comuns.
  const pseudoSlots = items.map((it) => ({ module: { id: it.module_id }, pieces: piecesByModule[it.module_id] || [] }));
  return loadColorRoleGroupsForSlots(pseudoSlots);
}

// Resolve um order_item de volta pro formato "colorsByRole"/
// "pieceColorOverrides" com registros de cor de verdade (mesmo padrão de
// editOrderItem, extraído aqui pra reaproveitar sem reabrir o configurador).
async function resolveOrderItemColorContext(it) {
  const colorIds = [...new Set(
    (it.selected_colors || []).map((c) => c.color_id)
      .concat(Object.values(it.piece_color_overrides || {}).flatMap((perRole) => Object.values(perRole).map((e) => e.color_id)))
      .filter(Boolean)
  )];
  const [{ data: colorsData }, hingeRes, slideRes] = await Promise.all([
    colorIds.length ? supabaseClient.from('colors').select('*').in('id', colorIds) : Promise.resolve({ data: [] }),
    it.hinge_model_id ? supabaseClient.from('hinge_models').select('*').eq('id', it.hinge_model_id).single() : Promise.resolve({ data: null }),
    it.slide_model_id ? supabaseClient.from('slide_models').select('*').eq('id', it.slide_model_id).single() : Promise.resolve({ data: null })
  ]);
  const colorById = new Map((colorsData || []).map((c) => [c.id, c]));
  const colorsByRole = {};
  (it.selected_colors || []).forEach((sc) => {
    const c = colorById.get(sc.color_id);
    if (c) colorsByRole[sc.role_id] = c;
  });
  const pieceColorOverrides = {};
  Object.keys(it.piece_color_overrides || {}).forEach((pieceId) => {
    const perRole = it.piece_color_overrides[pieceId];
    const resolved = {};
    Object.keys(perRole).forEach((roleId) => {
      const c = colorById.get(perRole[roleId].color_id);
      if (c) resolved[roleId] = c;
    });
    if (Object.keys(resolved).length) pieceColorOverrides[pieceId] = resolved;
  });
  return { colorsByRole, pieceColorOverrides, hingeModel: hingeRes.data || null, slideModel: slideRes.data || null };
}

// currentOrderDetail.colorById só é preenchido UMA VEZ, em openOrderDetail,
// com os color_id que já apareciam nos itens NAQUELE momento (ver comentário
// lá) — pra desenhar a bolinha/quadrado de cor de cada linha. Depois de trocar
// uma cor pelo painel (recolorOrderItem grava um color_id NOVO em
// selected_colors), esse mapa fica desatualizado: a cor trocada não está nele,
// então renderOrderDetailItemCard cai no cinza padrão (#cccccc) mesmo com o
// nome da cor certo ao lado. Chamado depois de aplicar troca(s), antes de
// renderOrderDetail(), pra buscar só os color_id que ainda faltam e completar
// o mapa (sem rebuscar os que já estão lá).
async function ensureOrderDetailColorsLoaded() {
  if (!currentOrderDetail) return;
  const colorById = currentOrderDetail.colorById;
  const colorIds = [...new Set(
    currentOrderDetail.items.flatMap((it) => (it.selected_colors || []).map((c) => c.color_id)).filter(Boolean)
  )];
  const missingIds = colorIds.filter((id) => !colorById.has(id));
  if (!missingIds.length) return;
  const { data } = await supabaseClient.from('colors').select('id, swatch_hex, texture_url, substrato').in('id', missingIds);
  (data || []).forEach((c) => colorById.set(c.id, c));
}

// Troca 1 OU MAIS papéis de cor NESTE item de uma vez (changes = [{roleId,
// color}, ...]), recalcula preço, tenta regenerar a miniatura (best-effort,
// ver comentário acima) e grava tudo numa única gravação. Aceitar VÁRIAS
// trocas de uma vez (não só uma) é o que permite ao painel de troca em massa
// aplicar Caixa+Porta+etc juntos com só 1 recálculo de preço + 1 render 3D +
// 1 update por item, em vez de repetir tudo isso por papel trocado — pedido
// do usuário (2026-07-29): "hoje quando troco a cor demora muito... quero um
// botao alterar cores, pra fazer os calculos depois de alterar as cores, pra
// nao ficar muito pesado". Usado por applyPendingColorChangesToOrderItems
// (troca em massa, só executa quando o cliente clica "Alterar cores") e por
// applyColorToSingleOrderItem (troca por módulo, sempre 1 change só). Lança
// erro pra quem chamou decidir como mostrar.
async function recolorOrderItem(it, changes) {
  const m = allModules.find((mm) => mm.id === it.module_id);
  if (!m) throw new Error(I18n.t('order_detail.edit_module_unavailable_error'));
  const pieces = await loadRecursivePiecesForModule(it.module_id);

  const { colorsByRole, pieceColorOverrides, hingeModel, slideModel } = await resolveOrderItemColorContext(it);
  changes.forEach(({ roleId, color }) => {
    colorsByRole[roleId] = color; // troca só os papéis escolhidos, mantém os outros como já estavam
  });

  const selectedOptionalIds = it.selected_optional_component_ids || [];
  const effectivePieces = pieces.filter((p) => !p.client_optional || selectedOptionalIds.includes(p.id));
  const result = m.is_decoration
    ? { total: 0, breakdown: [] }
    : Pricing.calculateModulePrice({
      module: m, pieces: effectivePieces, colorsByRole,
      hingeModel, slideModel,
      shelfQuantities: it.shelf_quantities || {}, dimOverrides: it.dim_overrides || {},
      pieceColorOverrides,
      width_mm: it.width_mm, height_mm: it.height_mm, depth_mm: it.depth_mm,
      markupMultiplier: resolveMarkupMultiplierForModule(m)
    });

  // Ordem = a mesma do cadastro (color_roles.sort_order, reordenável pelas
  // setas ▲▼ na aba "Papéis de cor" do admin) — pedido do usuário
  // (2026-07-29): "quero mesma sequencia de cores do cadastro". Antes disso
  // a ordem vinha de Object.keys(colorsByRole) (ordem de inserção do
  // objeto), que só coincidia com o cadastro por já vir assim de
  // resolveOrderItemColorContext — mas um papel novo (módulo mudou depois do
  // pedido) entraria no FIM em vez da posição certa. Ordenar aqui, sempre que
  // uma cor é trocada, garante a sequência certa pra sempre, não só quando o
  // acaso ajuda.
  const selected_colors = Object.keys(colorsByRole)
    .sort((a, b) => {
      const sa = (colorRolesCache.find((r) => r.id === a) || {}).sort_order || 0;
      const sb = (colorRolesCache.find((r) => r.id === b) || {}).sort_order || 0;
      return sa - sb;
    })
    .map((rid) => ({
      role_id: rid,
      role_name: (colorRolesCache.find((r) => r.id === rid) || {}).name || null,
      color_id: colorsByRole[rid] ? colorsByRole[rid].id : null,
      color_name: colorsByRole[rid] ? colorsByRole[rid].name : null
    }));

  // total_price precisa levar a quantidade em conta (ver
  // updateOrderItemQuantity/pedido do usuário 2026-07-29: "quero opcao de
  // quantidade") — sem isso, trocar a cor DEPOIS de mudar a quantidade
  // resetaria o total de volta pro preço de 1 unidade só.
  const qtyForTotal = Number(it.quantity) || 1;
  const updatePayload = { selected_colors, unit_price: result.total, total_price: result.total * qtyForTotal, breakdown: result.breakdown };

  // Miniatura nova, num viewer escondido (ver comentário acima) — best-
  // effort: se der qualquer problema (textura que não carrega, módulo sem
  // peça nenhuma, etc.), mantém a miniatura antiga em vez de travar a troca
  // de cor por causa só da imagem.
  try {
    const viewer = getOrderDetailHiddenViewer();
    const syntheticSlot = {
      pieces: effectivePieces,
      width_mm: it.width_mm, height_mm: it.height_mm, depth_mm: it.depth_mm,
      colorsByRole, pieceColorOverrides,
      shelfQuantities: it.shelf_quantities || {}, dimOverrides: it.dim_overrides || {}
    };
    viewer.render(buildCompositionAssemblies([syntheticSlot]), null, null);
    if (typeof Viewer3D.waitForPendingTextures === 'function') await Viewer3D.waitForPendingTextures();
    const raw = viewer.snapshot();
    const trimmed = raw ? await trimTransparentPng(raw) : null;
    if (trimmed) updatePayload.thumbnail_data_url = trimmed;
  } catch (e) { /* miniatura não regenerou — mantém a antiga, cor/preço já estão certos */ }

  const { data: updated, error } = await supabaseClient
    .from('order_items')
    .update(updatePayload)
    .eq('id', it.id)
    .select()
    .single();
  if (error) throw error;
  Object.assign(it, updated); // atualiza o item em memória (currentOrderDetail.items) com o que voltou do banco
  return it;
}

// Painel de troca em massa — ESTADO PENDENTE (pedido do usuário 2026-07-29:
// "hoje quando troco a cor demora muito... quero um botao alterar cores,
// pra fazer os calculos depois de alterar as cores, pra nao ficar muito
// pesado num ambiente tao dinamico"). Antes, clicar numa swatch aplicava
// IMEDIATAMENTE (1 recálculo de preço + 1 render 3D escondido + 1 update no
// banco POR ITEM AFETADO, pra cada clique) — lento com vários itens/papéis.
// Agora clicar só marca a escolha aqui (sem tocar no banco); o cálculo de
// verdade só roda quando o cliente clica "Alterar cores"
// (applyPendingColorChangesToOrderItems), UMA vez só, já juntando todos os
// papéis pendentes por item (ver recolorOrderItem(it, changes[])).
// { [roleId]: { color: colorObj, moduleColorIds } } — moduleColorIds
// (moduleId -> Set(color_id), vindo do group de loadColorRoleGroupsForSlots,
// 2026-09-02) é quem sabe se a cor escolhida vale pro módulo de CADA item;
// ver comentário grande em applyPendingColorChangesToOrderItems.
let orderDetailPendingColorChanges = {};

// Só marca a escolha (não grava nada ainda) e atualiza a UI: swatch
// selecionada na aba, e o botão "Alterar cores" aparece/mostra quantas
// trocas estão pendentes. Recebe o GRUPO inteiro (não só o roleId) — ver
// applyPendingColorChangesToOrderItems pra saber por quê.
function stageColorRoleChange(group, color) {
  orderDetailPendingColorChanges[group.roleId] = { color, moduleColorIds: group.moduleColorIds };
  renderOrderDetailColorPendingState();
}

function orderDetailPendingColorCount() {
  return Object.keys(orderDetailPendingColorChanges).length;
}

// Mostra/escreve o botão "Alterar cores" com a contagem de trocas pendentes
// — chamado ao marcar uma escolha nova E ao terminar de aplicar (pra
// esconder de novo, contagem zerada).
function renderOrderDetailColorPendingState() {
  const applyBtn = document.getElementById('po-order-detail-color-apply-btn');
  if (!applyBtn) return;
  const count = orderDetailPendingColorCount();
  applyBtn.style.display = count > 0 ? 'inline-block' : 'none';
  applyBtn.textContent = I18n.t('order_detail.apply_color_changes_btn', { n: count });
  // Reabilita sempre que chamado fora do processamento em si (staging de nova
  // troca ou fim de renderOrderDetailColorPanel) — sem isso, o botão ficava
  // com disabled=true pra sempre depois da 1ª aplicação (só era desabilitado
  // em applyPendingColorChangesToOrderItems, nunca reabilitado), então a 2ª
  // troca reaparecia travada mesmo com display voltando a 'inline-block'.
  applyBtn.disabled = false;
}

// Roda de verdade só quando o cliente clica "Alterar cores" — pra CADA item
// afetado, junta TODOS os papéis pendentes que o módulo dele usa num só
// recolorOrderItem() (1 recálculo de preço + 1 render 3D + 1 update, não um
// por papel). Mostra "Processando..." (pedido do usuário: "talvez uma
// janela de carregamento mostrando que esta processando ate finalizar") —
// desabilita o painel inteiro enquanto roda, pra não deixar clicar de novo
// no meio do processamento.
async function applyPendingColorChangesToOrderItems() {
  if (!currentOrderDetail) return;
  const pending = orderDetailPendingColorChanges;
  const roleIds = Object.keys(pending);
  if (!roleIds.length) return;
  const errorEl = document.getElementById('po-order-detail-color-error');
  if (errorEl) errorEl.style.display = 'none';
  const applyBtn = document.getElementById('po-order-detail-color-apply-btn');
  const panel = document.getElementById('po-order-detail-color-panel');
  if (applyBtn) { applyBtn.disabled = true; applyBtn.textContent = I18n.t('order_detail.applying_color_changes'); }
  if (panel) panel.classList.add('po-order-detail-color-panel-busy');

  const { items } = currentOrderDetail;
  let firstErrorMsg = null;
  for (const it of items) {
    try {
      const pieces = await loadRecursivePiecesForModule(it.module_id);
      // pending[rid].moduleColorIds (2026-09-02, ver comentário na
      // declaração de orderDetailPendingColorChanges) — desde que a lista de
      // cores da aba passou a ser a UNIÃO entre os módulos (não mais só a
      // interseção), uma cor pendente pode não valer pro módulo DESTE item
      // específico (ex.: "Fast Closet" de cores limitadas ao lado de um
      // módulo com o catálogo inteiro). Pula o papel pendente que este
      // módulo não aceita — mantém a cor que ele já tinha nesse papel, só
      // aplica os papéis/cores que ele realmente pode receber.
      const changes = roleIds
        .filter((rid) => pieceTreeHasColorRole(pieces, rid))
        .filter((rid) => {
          const allowedIds = pending[rid].moduleColorIds && pending[rid].moduleColorIds.get(it.module_id);
          return allowedIds && allowedIds.has(pending[rid].color.id);
        })
        .map((rid) => ({ roleId: rid, color: pending[rid].color }));
      if (!changes.length) continue; // este módulo não usa/não aceita nenhum dos papéis pendentes, pula
      await recolorOrderItem(it, changes);
    } catch (err) {
      if (!firstErrorMsg) firstErrorMsg = err.message || String(err);
    }
  }

  orderDetailPendingColorChanges = {};
  if (panel) panel.classList.remove('po-order-detail-color-panel-busy');
  if (firstErrorMsg && errorEl) {
    errorEl.textContent = I18n.t('order_detail.color_swap_error', { msg: firstErrorMsg });
    errorEl.style.display = 'block';
  }
  await ensureOrderDetailColorsLoaded(); // completa colorById com as cores novas antes de desenhar as bolinhas/quadrados
  renderOrderDetail(); // atualiza cards/total com os preços/cores/miniaturas novos (e o próprio painel de cor, já sem pendências)
}

const orderDetailColorApplyBtn = document.getElementById('po-order-detail-color-apply-btn');
if (orderDetailColorApplyBtn) {
  orderDetailColorApplyBtn.addEventListener('click', applyPendingColorChangesToOrderItems);
}

// Troca de cor POR MÓDULO (pedido do usuário 2026-07-29: "quero uma opcao de
// trocar a cor por modulo tambem") — diferente do painel de abas acima (que
// troca o papel escolhido em TODOS os itens que o usam de uma vez), este
// afeta só o card clicado. Ver toggleOrderItemColorPicker pra abertura do
// seletor inline em cada linha de cor do card.
async function applyColorToSingleOrderItem(itemId, roleId, color) {
  if (!currentOrderDetail) return;
  const errorEl = document.getElementById('po-order-detail-color-error');
  if (errorEl) errorEl.style.display = 'none';
  const it = currentOrderDetail.items.find((x) => x.id === itemId);
  if (!it) return;
  try {
    // Troca por módulo continua IMEDIATA (não entra no estado pendente do
    // painel em massa) — é só 1 item, já é rápido o suficiente sozinho.
    await recolorOrderItem(it, [{ roleId, color }]);
    await ensureOrderDetailColorsLoaded(); // completa colorById com a cor nova antes de desenhar as bolinhas/quadrados
    renderOrderDetail();
  } catch (err) {
    if (errorEl) { errorEl.textContent = I18n.t('order_detail.color_swap_error', { msg: err.message }); errorEl.style.display = 'block'; }
  }
}

// Abre/fecha o seletor de cor inline de UMA linha (papel de cor) de UM card
// — só um aberto por vez (fecha qualquer outro antes). Busca as cores
// cadastradas pra este módulo+papel na hora do clique (não pré-carrega pra
// todo card, evitaria N consultas desnecessárias em pedidos grandes).
let orderItemColorPickerOpenId = null; // id do container do picker aberto agora, null = nenhum

async function toggleOrderItemColorPicker(itemId, roleId, pickerId) {
  if (orderItemColorPickerOpenId && orderItemColorPickerOpenId !== pickerId) {
    const prev = document.getElementById(orderItemColorPickerOpenId);
    if (prev) { prev.style.display = 'none'; prev.innerHTML = ''; }
  }
  const el = document.getElementById(pickerId);
  if (!el) return;
  if (orderItemColorPickerOpenId === pickerId) {
    el.style.display = 'none';
    el.innerHTML = '';
    orderItemColorPickerOpenId = null;
    return;
  }
  orderItemColorPickerOpenId = pickerId;
  el.style.display = 'block';
  el.innerHTML = `<p class="hint">${I18n.t('order_detail.color_loading')}</p>`;
  const it = currentOrderDetail && currentOrderDetail.items.find((x) => x.id === itemId);
  if (!it) return;
  const { data, error } = await supabaseClient
    .from('module_colors')
    .select('color_id, colors(*)')
    .eq('module_id', it.module_id)
    .eq('color_role_id', roleId);
  if (error || !data) { el.innerHTML = ''; return; }
  // Mesma ordem do cadastro (colors.sort_order) — mesmo motivo/pedido do
  // usuário do fix em loadColorRoleGroupsForSlots (2026-07-29): este picker
  // por item é um caminho separado (busca module_colors direto, não passa
  // pela função genérica), então precisa da mesma ordenação por conta própria.
  const colors = data.map((row) => row.colors)
    .filter((c) => c && c.active)
    .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0));
  const currentColorId = ((it.selected_colors || []).find((c) => c.role_id === roleId) || {}).color_id || null;
  el.innerHTML = '';
  renderSwatches(el, colors, currentColorId, (colorId) => {
    const chosen = colors.find((c) => c.id === colorId);
    if (chosen) applyColorToSingleOrderItem(itemId, roleId, chosen);
  });
}

async function renderOrderDetailColorPanel() {
  const panel = document.getElementById('po-order-detail-color-panel');
  const tabsEl = document.getElementById('po-order-detail-color-tabs');
  const swatchesEl = document.getElementById('po-order-detail-color-swatches');
  if (!panel || !tabsEl || !swatchesEl || !currentOrderDetail) return;
  // Pago/entregue também travam (migration 059) — não só aprovado. Ver
  // mesma checagem "isLocked" em renderOrderDetail.
  if (['approved', 'paid', 'delivered'].includes(currentOrderDetail.order.status)) { panel.style.display = 'none'; return; }
  const groups = await loadOrderDetailColorRoleGroups();
  // Abas na mesma sequência do cadastro (color_roles.sort_order) — pedido do
  // usuário 2026-07-29. loadColorRoleGroupsForSlots (função genérica
  // compartilhada com Composição/Projetos, não tocada aqui) devolve na ordem
  // que cada papel foi ENCONTRADO percorrendo as peças, que normalmente
  // coincide mas não é garantido; ordenar aqui, só nesta tela, corrige sem
  // arriscar mudar o comportamento de quem já usa a função genérica.
  groups.sort((a, b) => {
    const sa = (colorRolesCache.find((r) => r.id === a.roleId) || {}).sort_order || 0;
    const sb = (colorRolesCache.find((r) => r.id === b.roleId) || {}).sort_order || 0;
    return sa - sb;
  });
  tabsEl.innerHTML = '';
  swatchesEl.innerHTML = '';
  if (!groups.length) { panel.style.display = 'none'; return; }
  panel.style.display = 'block';

  if (!groups.some((g) => g.roleId === orderDetailColorActiveTabRoleId)) {
    orderDetailColorActiveTabRoleId = groups[0].roleId;
  }
  groups.forEach((group) => {
    const tabBtn = document.createElement('button');
    tabBtn.type = 'button';
    tabBtn.className = 'po-comp-color-tab-btn'; // mesmo visual da Composição, reaproveitado
    tabBtn.textContent = group.roleName || I18n.t('color.prefix');
    if (group.roleId === orderDetailColorActiveTabRoleId) tabBtn.classList.add('active');
    tabBtn.addEventListener('click', () => {
      orderDetailColorActiveTabRoleId = group.roleId;
      renderOrderDetailColorTabSwatches(groups);
    });
    tabsEl.appendChild(tabBtn);
  });
  renderOrderDetailColorTabSwatches(groups);
  // Botão "Alterar cores" é um elemento estático (fora de tabsEl/swatchesEl,
  // não recriado a cada render) — sincroniza ele aqui também, não só em
  // stageColorRoleChange, senão ficaria com contagem velha ao reabrir a
  // tela pra um pedido diferente (pendência já foi zerada em openOrderDetail,
  // mas o texto/visibilidade do botão em si só atualiza quando chamado).
  renderOrderDetailColorPendingState();
}

function renderOrderDetailColorTabSwatches(groups) {
  const tabsEl = document.getElementById('po-order-detail-color-tabs');
  const swatchesEl = document.getElementById('po-order-detail-color-swatches');
  if (!tabsEl || !swatchesEl) return;
  [...tabsEl.children].forEach((btn, i) => {
    btn.classList.toggle('active', groups[i] && groups[i].roleId === orderDetailColorActiveTabRoleId);
  });
  const group = groups.find((g) => g.roleId === orderDetailColorActiveTabRoleId);
  swatchesEl.innerHTML = '';
  if (!group) return;
  // Swatch marcada = escolha PENDENTE desta aba (se já clicou uma), não a
  // cor que já estava aplicada — reflete o estado "ainda não confirmado"
  // (ver orderDetailPendingColorChanges/stageColorRoleChange).
  const pendingEntry = orderDetailPendingColorChanges[group.roleId];
  const pendingColor = pendingEntry ? pendingEntry.color : null;
  renderSwatches(swatchesEl, group.colors, pendingColor ? pendingColor.id : null, (colorId) => {
    const chosen = group.colors.find((c) => c.id === colorId);
    if (chosen) stageColorRoleChange(group, chosen);
  });
}

// Mesma imagem grande (thumbnail_data_url — snapshot do 3D no momento em
// que o módulo foi configurado, ver trimTransparentPng) que o carrinho já
// usa pequena (.portal-item-thumb) — aqui só em tamanho maior
// (.po-order-item-image), pedido do usuário: "quero imagem de cada modulo
// grande". Sem 3D novo sendo gerado — reaproveita o PNG já salvo.
function renderOrderDetailItemCard(it, idx, isApproved, colorById) {
  const number = String(idx + 1).padStart(2, '0');
  // data-raw-src (não src direto) — renderOrderDetail troca pro recortado
  // assim que trimTransparentPng terminar (ver comentário lá); o cliente vê
  // esta versão original por uma fração de segundo até isso acontecer.
  const img = it.thumbnail_data_url
    ? `<img src="${it.thumbnail_data_url}" data-raw-src="${it.thumbnail_data_url}" alt="${it.module_name}" class="po-order-item-image" />`
    : `<div class="po-order-item-image po-order-item-image-empty"></div>`;
  // Bolinha de cor (pedido do usuário 2026-07-19) — um span circular por
  // papel, colorido com o swatch_hex (ou texture_url, quando a cor é uma
  // textura de madeira em vez de sólida) do registro em colorById (ver
  // openOrderDetail). Sem o registro (cor apagada do catálogo depois do
  // pedido, caso raro) cai num cinza neutro em vez de quebrar.
  // Cada linha agora é um BOTÃO (pedido do usuário 2026-07-29: "quero uma
  // opcao de trocar a cor por modulo tambem") — clicar abre um seletor
  // inline (ver toggleOrderItemColorPicker/applyColorToSingleOrderItem) só
  // pra ESTE item, diferente do painel de abas no topo da tela (que troca o
  // papel em todos os itens que o usam de uma vez). Desabilitado quando o
  // pedido já foi aprovado (trava tudo, mesma regra do botão "Editar").
  const colors = Array.isArray(it.selected_colors) ? it.selected_colors : [];
  const colorsHtml = colors.length
    ? `<div class="po-order-item-colors">${colors.map((c) => {
        const colorRec = colorById && colorById.get(c.color_id);
        const dotStyle = colorRec && colorRec.texture_url
          ? `background-image:url('${colorRec.texture_url}');background-size:cover;background-position:center;`
          : `background-color:${(colorRec && colorRec.swatch_hex) || '#cccccc'};`;
        const pickerId = `po-order-item-color-picker-${it.id}-${c.role_id}`;
        return `
          <div class="po-order-item-color-line">
            <button type="button" class="po-order-item-color-btn" data-item-id="${it.id}" data-role-id="${c.role_id}" data-picker-id="${pickerId}" ${isApproved ? 'disabled' : ''}>
              <span class="po-order-item-color-dot" style="${dotStyle}"></span>${c.role_name}: ${c.color_name}
            </button>
            <div id="${pickerId}" class="po-order-item-color-picker" style="display:none;"></div>
          </div>
        `;
      }).join('')}</div>`
    : '';
  const detailUnit = (document.getElementById('po-unit-select') || {}).value || 'mm';
  const dimsLine = `${formatDimension(it.width_mm, detailUnit)} x ${formatDimension(it.height_mm, detailUnit)} x ${formatDimension(it.depth_mm, detailUnit)}`;
  // Módulo decorativo (migration 039): mesmo aviso do carrinho, no lugar do preço.
  const decorModule = (allModules || []).find((mm) => mm.id === it.module_id);
  const isDecor = !!(decorModule && decorModule.is_decoration);
  const priceLine = isDecor ? I18n.t('decor.cart_note') : formatMoney(it.total_price);
  // Volume (m³) + peso — migration 061. data-item-id pra updateOrderItemQuantity
  // conseguir atualizar só esta linha depois de mudar a quantidade.
  const volumeWeightLine = isDecor ? '' : formatVolumeWeight(it.breakdown || [], it.quantity);
  const editBtn = isApproved
    ? ''
    : `<button type="button" class="secondary po-order-item-edit-btn" data-item-id="${it.id}">${I18n.t('order_detail.edit_btn')}</button>`;
  // Botão remover (pedido do usuário 2026-07-29: "BOTAO REMOVER item da
  // lista") — mesma trava de "Editar"/quantidade/cor (some quando o pedido já
  // foi decidido). Diferente de removeCartItem (carrinho, sem confirmação —
  // rascunho ainda não é "compromisso" nenhum): aqui já é um pedido salvo, e
  // remover apaga o registro de order_items de vez, então pede confirmação
  // (mesmo padrão de resetProject/project.reset_confirm).
  const removeBtn = isApproved
    ? ''
    : `<button type="button" class="secondary po-order-item-remove-btn" data-item-id="${it.id}" style="color: var(--danger); border-color: var(--danger);">${I18n.t('order_detail.remove_btn')}</button>`;
  // Código de referência (SKU) — pedido do usuário (2026-07-29): "quando
  // tiver referencia cadastrada quero ela bem grande no lado do icone do
  // modulo". Não vem gravado no order_item (evita mais uma migration) — é
  // calculado na hora batendo largura/altura do item contra os códigos
  // cadastrados no módulo (ver findMatchingSkuReference); item sem nenhum
  // código correspondente simplesmente não mostra nada aqui, como sempre.
  const skuRef = findMatchingSkuReference(it.module_id, it.width_mm, it.height_mm);
  const skuHtml = skuRef ? `<div class="po-order-item-sku-code">${skuRef}</div>` : '';
  // Quantidade editável (pedido do usuário 2026-07-29: "quero opcao de
  // quantidade, pode ser alterada e salvar alteracao. muda preco.") —
  // updateOrderItemQuantity recalcula total_price = unit_price × quantidade e
  // grava direto (mesmo padrão de "Salvar informações": sem exigir reabrir o
  // configurador completo). Trava junto com o resto quando o pedido já foi
  // decidido (isApproved aqui já cobre Aprovada/Paga/Entregue, ver isLocked
  // em renderOrderDetail).
  const qty = Number(it.quantity) || 1;
  const qtyHtml = `
    <div class="po-order-item-qty-row">
      <label for="po-order-item-qty-${it.id}">${I18n.t('order_detail.quantity_label')}</label>
      <input type="number" id="po-order-item-qty-${it.id}" min="1" step="1" class="po-order-item-qty-input" data-item-id="${it.id}" value="${qty}" ${isApproved ? 'disabled' : ''} />
    </div>
  `;
  return `
    <div class="po-order-item-card">
      <div class="po-order-item-number">${number}</div>
      ${img}
      ${skuHtml}
      <div class="po-order-item-info">
        <div class="po-order-item-dims">${dimsLine}</div>
        <div class="po-order-item-reference">${it.module_name}</div>
        ${it.module_description ? `<div class="po-order-item-description">${it.module_description}</div>` : ''}
        ${colorsHtml}
      </div>
      <div class="po-order-item-actions">
        ${qtyHtml}
        <div class="po-order-item-unit-price" data-item-id="${it.id}">${priceLine}</div>
        <div class="hint po-order-item-volume-weight" data-item-id="${it.id}">${volumeWeightLine}</div>
        ${editBtn}
        ${removeBtn}
      </div>
    </div>
  `;
}

// Remove um item já salvo do pedido (pedido do usuário 2026-07-29: "BOTAO
// REMOVER item da lista") — apaga direto de order_items, atualiza
// currentOrderDetail.items em memória e reconstrói a tela (números 01/02/...
// e o total precisam se ajustar). Confirmação antes (diferente do carrinho
// em rascunho): aqui é um pedido salvo de verdade.
async function removeOrderDetailItem(itemId) {
  if (!currentOrderDetail) return;
  if (!confirm(I18n.t('order_detail.remove_confirm'))) return;
  const errorEl = document.getElementById('po-order-detail-error');
  if (errorEl) errorEl.style.display = 'none';
  try {
    const { error } = await supabaseClient.from('order_items').delete().eq('id', itemId);
    if (error) throw error;
    currentOrderDetail.items = currentOrderDetail.items.filter((x) => x.id !== itemId);
    renderOrderDetail();
  } catch (err) {
    if (errorEl) { errorEl.textContent = I18n.t('order_detail.remove_error', { msg: err.message || String(err) }); errorEl.style.display = 'block'; }
  }
}

// Quantidade editável no item já salvo (pedido do usuário 2026-07-29: "quero
// opcao de quantidade, pode ser alterada e salvar alteracao. muda preco.") —
// total_price = unit_price × quantidade (unit_price nunca muda aqui, só o
// total); grava direto no order_item e atualiza só a linha de preço deste
// card + o total do pedido no rodapé, sem reconstruir a tela inteira (evita
// fechar um seletor de cor que porventura esteja aberto noutro item).
async function updateOrderItemQuantity(itemId, newQtyRaw) {
  if (!currentOrderDetail) return;
  const it = currentOrderDetail.items.find((x) => x.id === itemId);
  if (!it) return;
  const inputEl = document.getElementById(`po-order-item-qty-${itemId}`);
  const newQty = Math.max(1, Math.round(Number(newQtyRaw)) || 1);
  if (inputEl) { inputEl.value = newQty; inputEl.disabled = true; }
  const errorEl = document.getElementById('po-order-detail-error');
  if (errorEl) errorEl.style.display = 'none';
  try {
    const newTotal = Number(it.unit_price || 0) * newQty;
    const { data, error } = await supabaseClient
      .from('order_items')
      .update({ quantity: newQty, total_price: newTotal })
      .eq('id', itemId)
      .select()
      .single();
    if (error) throw error;
    Object.assign(it, data); // atualiza o item em memória (currentOrderDetail.items) com o que voltou do banco
    const priceEl = document.querySelector(`.po-order-item-unit-price[data-item-id="${itemId}"]`);
    if (priceEl) {
      const decorModule = (allModules || []).find((mm) => mm.id === it.module_id);
      const isDecor = !!(decorModule && decorModule.is_decoration);
      priceEl.textContent = isDecor ? I18n.t('decor.cart_note') : formatMoney(it.total_price);
    }
    const total = currentOrderDetail.items.reduce((sum, x) => sum + Number(x.total_price || 0), 0);
    document.getElementById('po-order-detail-total').textContent = formatMoney(total);
    updateOrderDetailVolumeWeight(currentOrderDetail.items);
    const itemVwEl = document.querySelector(`.po-order-item-volume-weight[data-item-id="${itemId}"]`);
    if (itemVwEl) {
      const decorModule = (allModules || []).find((mm) => mm.id === it.module_id);
      itemVwEl.textContent = (decorModule && decorModule.is_decoration) ? '' : formatVolumeWeight(it.breakdown || [], it.quantity);
    }
  } catch (err) {
    if (inputEl) inputEl.value = it.quantity || 1; // reverte o campo pro valor salvo de verdade
    if (errorEl) { errorEl.textContent = I18n.t('order_detail.quantity_error', { msg: err.message || String(err) }); errorEl.style.display = 'block'; }
  } finally {
    if (inputEl) inputEl.disabled = false;
  }
}

document.getElementById('po-order-detail-approve-btn').addEventListener('click', async () => {
  if (!currentOrderDetail) return;
  const errorEl = document.getElementById('po-order-detail-error');
  errorEl.style.display = 'none';
  const client_name = document.getElementById('po-order-detail-client-name').value.trim();
  const po_name = document.getElementById('po-order-detail-po-name').value.trim();
  const client_phone = document.getElementById('po-order-detail-phone').value.trim();
  const client_email = document.getElementById('po-order-detail-email').value.trim();
  const delivery_address = document.getElementById('po-order-detail-address').value.trim();
  // Pedido do usuário: pra aprovar, precisa ter "nome do OP, nome do
  // cliente, telefone, endereço de entrega e email" — todos os 5.
  if (!client_name || !po_name || !client_phone || !client_email || !delivery_address) {
    errorEl.textContent = I18n.t('order_detail.approve_missing_fields_error');
    errorEl.style.display = 'block';
    return;
  }
  const approveBtn = document.getElementById('po-order-detail-approve-btn');
  approveBtn.disabled = true;
  try {
    const { data, error } = await supabaseClient
      .from('orders')
      .update({
        client_name, po_name, client_phone, client_email, delivery_address,
        status: 'approved', approved_at: new Date().toISOString()
      })
      .eq('id', currentOrderDetail.order.id)
      .select()
      .single();
    if (error) throw error;
    currentOrderDetail.order = data;
    renderOrderDetail(); // trava a tela (isApproved=true) — ver renderOrderDetail
    // Se este era o pedido "ativo" do carrinho (currentDraftOrderId — caso
    // comum: aprovou vindo direto de "Revisar pedido"), desanexa — senão o
    // próximo módulo adicionado no catálogo entraria escondido dentro de um
    // pedido JÁ APROVADO (ensureDraftOrder reaproveitaria o id cego, sem
    // checar status). Descoberto ao implementar "Novo Pedido" (mesmo
    // raciocínio de currentDraftOrderStatus, ver startNewOrder/
    // discardCurrentDraftOrder) — bug pré-existente, não introduzido ali.
    if (currentDraftOrderId === data.id) {
      currentDraftOrderId = null;
      currentDraftOrderStatus = null;
      cartItems = [];
      renderCart();
    }
  } catch (err) {
    errorEl.textContent = I18n.t('order_detail.approve_error', { msg: err.message });
    errorEl.style.display = 'block';
  } finally {
    approveBtn.disabled = false;
  }
});

// "Salvar informações" (pedido do usuário 2026-07-29) — grava nome/OP/
// telefone/e-mail/endereço parcialmente, sem exigir os 5 campos e sem travar
// a tela (diferente de "Aprovar Pedido") — só pra não perder o que já foi
// digitado se o cliente fechar e voltar depois.
const orderDetailSaveInfoBtn = document.getElementById('po-order-detail-save-info-btn');
if (orderDetailSaveInfoBtn) {
  orderDetailSaveInfoBtn.addEventListener('click', async () => {
    if (!currentOrderDetail) return;
    const errorEl = document.getElementById('po-order-detail-error');
    const statusEl = document.getElementById('po-order-detail-save-info-status');
    errorEl.style.display = 'none';
    const client_name = document.getElementById('po-order-detail-client-name').value.trim() || null;
    const po_name = document.getElementById('po-order-detail-po-name').value.trim() || null;
    const client_phone = document.getElementById('po-order-detail-phone').value.trim() || null;
    const client_email = document.getElementById('po-order-detail-email').value.trim() || null;
    const delivery_address = document.getElementById('po-order-detail-address').value.trim() || null;
    orderDetailSaveInfoBtn.disabled = true;
    try {
      const { data, error } = await supabaseClient
        .from('orders')
        .update({ client_name, po_name, client_phone, client_email, delivery_address })
        .eq('id', currentOrderDetail.order.id)
        .select()
        .single();
      if (error) throw error;
      currentOrderDetail.order = data;
      if (statusEl) statusEl.textContent = I18n.t('order_detail.info_saved');
      // Não chama renderOrderDetail() inteiro (reconstruiria os cards/painel
      // de cor sem necessidade) — mas o TÍTULO no topo (po_name/client_name)
      // depende desses campos e precisa refletir o save na hora, senão dá a
      // impressão de que nada foi salvo mesmo tendo salvo de verdade (pedido
      // do usuário 2026-07-29: "nao ta salvando informacoes do cabecalho").
      const titleEl = document.getElementById('po-order-detail-title');
      if (titleEl) titleEl.textContent = data.po_name || data.client_name || I18n.t('pdf.order_fallback');
    } catch (err) {
      errorEl.textContent = I18n.t('order_detail.save_info_error', { msg: err.message });
      errorEl.style.display = 'block';
    } finally {
      orderDetailSaveInfoBtn.disabled = false;
    }
  });
}

// Pago/Entregue (migration 059) — sequência Pendente → Aprovada → Paga →
// Entregue. Cliente E admin podem marcar (confirmado via AskUserQuestion) —
// os mesmos 2 botões existem em admin.js/renderOrdersList.
const orderDetailMarkPaidBtn = document.getElementById('po-order-detail-mark-paid-btn');
if (orderDetailMarkPaidBtn) {
  orderDetailMarkPaidBtn.addEventListener('click', async () => {
    if (!currentOrderDetail) return;
    const errorEl = document.getElementById('po-order-detail-error');
    errorEl.style.display = 'none';
    orderDetailMarkPaidBtn.disabled = true;
    try {
      const { data, error } = await supabaseClient
        .from('orders')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', currentOrderDetail.order.id)
        .select()
        .single();
      if (error) throw error;
      currentOrderDetail.order = data;
      renderOrderDetail();
    } catch (err) {
      errorEl.textContent = I18n.t('order_detail.mark_paid_error', { msg: err.message });
      errorEl.style.display = 'block';
    } finally {
      orderDetailMarkPaidBtn.disabled = false;
    }
  });
}
const orderDetailMarkDeliveredBtn = document.getElementById('po-order-detail-mark-delivered-btn');
if (orderDetailMarkDeliveredBtn) {
  orderDetailMarkDeliveredBtn.addEventListener('click', async () => {
    if (!currentOrderDetail) return;
    const errorEl = document.getElementById('po-order-detail-error');
    errorEl.style.display = 'none';
    orderDetailMarkDeliveredBtn.disabled = true;
    try {
      const { data, error } = await supabaseClient
        .from('orders')
        .update({ status: 'delivered', delivered_at: new Date().toISOString() })
        .eq('id', currentOrderDetail.order.id)
        .select()
        .single();
      if (error) throw error;
      currentOrderDetail.order = data;
      renderOrderDetail();
    } catch (err) {
      errorEl.textContent = I18n.t('order_detail.mark_delivered_error', { msg: err.message });
      errorEl.style.display = 'block';
    } finally {
      orderDetailMarkDeliveredBtn.disabled = false;
    }
  });
}

// ---------- Editar módulo de um pedido já salvo (migration 047) ----------
// "Editar" reabre o configurador de sempre (Passo 2), prefiltrado com o que
// já estava salvo neste order_item — mesmo padrão de editCompositionSlot/
// restoreSlotStateIntoConfigurator, só que a "fonte da verdade" é uma linha
// de order_items já no banco (não um slot em memória), então salvar faz
// UPDATE na mesma linha em vez de inserir uma nova (ver saveOrderItemEdit,
// branch no topo do handler de po-add-item-btn).

let editingOrderItemId = null; // id do order_items sendo editado agora, null = não está editando
let editingOrderId = null; // order_id dono desse item — pra voltar pra tela do pedido certa depois de salvar

async function editOrderItem(order, item) {
  if (!item) return;
  const errorEl = document.getElementById('po-order-detail-error');
  errorEl.style.display = 'none';
  const module = allModules.find((m) => m.id === item.module_id);
  if (!module) {
    // Módulo pode ter sido desativado/removido do catálogo desde que este
    // pedido foi salvo — mesma situação/mensagem de editCompositionSlot.
    errorEl.textContent = I18n.t('order_detail.edit_module_unavailable_error');
    errorEl.style.display = 'block';
    return;
  }
  try {
    // Resolve selected_colors/piece_color_overrides (snapshots id/nome, ver
    // buildPieceColorOverridesSnapshot) de volta pra registros reais de
    // "colors" — mesmo padrão de restoreFavoriteComposition.
    const colorIds = [...new Set(
      (item.selected_colors || []).map((c) => c.color_id)
        .concat(Object.values(item.piece_color_overrides || {}).flatMap((perRole) => Object.values(perRole).map((e) => e.color_id)))
        .filter(Boolean)
    )];
    const [{ data: colorsData }, hingeRes, slideRes] = await Promise.all([
      colorIds.length ? supabaseClient.from('colors').select('*').in('id', colorIds) : Promise.resolve({ data: [] }),
      item.hinge_model_id ? supabaseClient.from('hinge_models').select('*').eq('id', item.hinge_model_id).single() : Promise.resolve({ data: null }),
      item.slide_model_id ? supabaseClient.from('slide_models').select('*').eq('id', item.slide_model_id).single() : Promise.resolve({ data: null })
    ]);
    const colorById = new Map((colorsData || []).map((c) => [c.id, c]));

    const colorsByRole = {};
    (item.selected_colors || []).forEach((sc) => {
      const color = colorById.get(sc.color_id);
      if (color) colorsByRole[sc.role_id] = color;
    });
    const pieceColorOverrides = {};
    Object.keys(item.piece_color_overrides || {}).forEach((pieceId) => {
      const perRole = item.piece_color_overrides[pieceId];
      const resolved = {};
      Object.keys(perRole).forEach((roleId) => {
        const color = colorById.get(perRole[roleId].color_id);
        if (color) resolved[roleId] = color;
      });
      if (Object.keys(resolved).length) pieceColorOverrides[pieceId] = resolved;
    });

    editingOrderItemId = item.id;
    editingOrderId = order.id;

    document.getElementById('po-order-edit-mode-banner').style.display = 'flex';
    document.getElementById('po-order-edit-mode-label').textContent = item.module_name;
    document.getElementById('po-add-item-btn').textContent = I18n.t('order_detail.save_edit_btn');

    const newOrderTab = document.getElementById('po-tab-new-order');
    newOrderTab.classList.add('po-modal-mode');
    newOrderTab.style.display = 'block';
    newOrderTab.scrollTop = 0;
    window.scrollTo(0, 0);

    await selectModule(module.id);
    if (!currentModule) throw new Error(I18n.t('order_detail.edit_module_unavailable_error'));
    restoreSlotStateIntoConfigurator({
      colorsByRole, pieceColorOverrides,
      hingeModel: hingeRes.data || null, slideModel: slideRes.data || null,
      width_mm: item.width_mm, height_mm: item.height_mm, depth_mm: item.depth_mm,
      shelfQuantities: item.shelf_quantities || {},
      dimOverrides: item.dim_overrides || {},
      selectedOptionalIds: item.selected_optional_component_ids || [],
      floor_height_mm: 0
    });
  } catch (err) {
    exitOrderItemEdit();
    errorEl.textContent = I18n.t('order_detail.edit_module_unavailable_error');
    errorEl.style.display = 'block';
  }
}

// Fecha o modal e devolve o botão/estado normais — equivalente a
// exitCompositionSlotConfig, mas pro modo "editando item de pedido salvo".
function exitOrderItemEdit() {
  editingOrderItemId = null;
  editingOrderId = null;
  document.getElementById('po-order-edit-mode-banner').style.display = 'none';
  document.getElementById('po-add-item-btn').textContent = I18n.t('step2.add_to_order_btn');
  const newOrderTab = document.getElementById('po-tab-new-order');
  newOrderTab.classList.remove('po-modal-mode');
  newOrderTab.style.display = 'none';
  highlightSelectedModuleCard('');
  document.getElementById('po-config-section').style.display = 'none';
  document.getElementById('po-module-description').textContent = '';
  currentModule = null;
  lastItemResult = null;
}

const orderEditCancelBtn = document.getElementById('po-order-edit-mode-cancel-btn');
if (orderEditCancelBtn) {
  orderEditCancelBtn.addEventListener('click', () => {
    const orderId = editingOrderId;
    exitOrderItemEdit();
    if (orderId) openOrderDetail(orderId);
  });
}

// Grava as mudanças na MESMA linha de order_items (UPDATE, não insert) e
// volta pra tela do pedido — chamado pelo branch no topo do handler de
// po-add-item-btn quando editingOrderItemId está setado.
async function saveOrderItemEdit() {
  const cartError = document.getElementById('po-cart-error');
  cartError.style.display = 'none';
  try {
    let thumbnail_data_url = null;
    try { thumbnail_data_url = await trimTransparentPng(Viewer3D.snapshot()); } catch (e) { /* sem 3D, mantém a miniatura antiga (não sobrescreve com null) */ }

    const payload = {
      module_id: currentModule.id,
      module_name: currentModule.name,
      module_description: currentModule.description || null,
      selected_colors: lastItemResult.selectedColors,
      hinge_model_id: lastItemResult.hingeModel ? lastItemResult.hingeModel.id : null,
      slide_model_id: lastItemResult.slideModel ? lastItemResult.slideModel.id : null,
      width_mm: lastItemResult.width_mm,
      height_mm: lastItemResult.height_mm,
      depth_mm: lastItemResult.depth_mm,
      shelf_quantities: lastItemResult.shelfQuantities,
      dim_overrides: lastItemResult.dimOverrides,
      piece_color_overrides: buildPieceColorOverridesSnapshot(lastItemResult.pieceColorOverrides),
      selected_optional_component_ids: lastItemResult.selectedOptionalIds,
      unit_price: lastItemResult.result.total,
      // Preserva a quantidade que já estava salva no item (ver
      // updateOrderItemQuantity/pedido do usuário 2026-07-29) — esta tela
      // (configurador completo) não mexe em quantidade, só reconfigura o
      // módulo; sem isso, editar qualquer coisa aqui resetaria o total de
      // volta pro preço de 1 unidade só, perdendo a quantidade escolhida.
      total_price: lastItemResult.result.total * (Number((currentOrderDetail && currentOrderDetail.items.find((x) => x.id === editingOrderItemId) || {}).quantity) || 1),
      breakdown: lastItemResult.result.breakdown
    };
    if (thumbnail_data_url) payload.thumbnail_data_url = thumbnail_data_url;

    const orderId = editingOrderId;
    const { error } = await supabaseClient.from('order_items').update(payload).eq('id', editingOrderItemId);
    if (error) throw error;

    exitOrderItemEdit();
    await openOrderDetail(orderId);
  } catch (err) {
    cartError.textContent = I18n.t('cart.add_error', { msg: err.message });
    cartError.style.display = 'block';
  }
}

// Gera um PDF simples (client-side, via jsPDF) com o resumo do pedido —
// referência/cliente, data, cada módulo com medidas/cores/preço, e o total.
// Não depende de nenhum backend — só reaproveita os dados já carregados na
// tela de "Meus pedidos".
function generateOrderPDF(order, items) {
  if (!order || typeof window.jspdf === 'undefined') {
    alert(I18n.t('pdf.not_available'));
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = 18;
  // Unidade GLOBAL (po-unit-select) — o PDF é gerado na hora que o cliente
  // clica, então usa a mesma unidade que ele está vendo na tela nesse
  // momento (mesmo motivo do card da vitrine/carrinho/composição: não fica
  // travado em mm).
  const pdfUnit = (document.getElementById('po-unit-select') || {}).value || 'mm';

  function ensureSpace(nextLineHeight) {
    if (y + nextLineHeight > pageHeight - 14) {
      doc.addPage();
      y = 18;
    }
  }

  doc.setFontSize(16);
  doc.text(I18n.t('pdf.title'), 14, y);
  y += 9;

  doc.setFontSize(10);
  const title = order.po_name || order.client_name || I18n.t('pdf.order_fallback');
  doc.text(I18n.t('pdf.reference', { title }), 14, y); y += 6;
  if (order.client_name && order.po_name) { doc.text(I18n.t('pdf.client', { name: order.client_name }), 14, y); y += 6; }
  if (order.client_phone) { doc.text(I18n.t('pdf.phone', { phone: order.client_phone }), 14, y); y += 6; }
  const date = order.submitted_at ? new Date(order.submitted_at).toLocaleString(currentLocale()) : '';
  doc.text(I18n.t('pdf.date', { date }), 14, y); y += 6;
  doc.text(I18n.t('pdf.status', { status: orderStatusLabel(order.status) }), 14, y); y += 10;

  doc.setFontSize(12);
  doc.text(I18n.t('pdf.modules'), 14, y); y += 7;

  doc.setFontSize(9);
  items.forEach((it, idx) => {
    ensureSpace(22);
    doc.setFontSize(10);
    doc.text(`${idx + 1}. ${it.module_name}`, 14, y); y += 5;
    doc.setFontSize(9);
    doc.text(`   ${formatDimension(it.width_mm, pdfUnit)} x ${formatDimension(it.height_mm, pdfUnit)} x ${formatDimension(it.depth_mm, pdfUnit)}`, 14, y); y += 5;
    const colorLine = formatColorsLine(it);
    if (colorLine) { doc.text(`   ${colorLine}`, 14, y); y += 5; }
    const qty = it.quantity || 1;
    // Módulo decorativo (migration 039): a linha do PDF avisa que o item é
    // só ambientação, em vez de mostrar "Preço: $0.00".
    const pdfDecorModule = (allModules || []).find((mm) => mm.id === it.module_id);
    const priceLine = (pdfDecorModule && pdfDecorModule.is_decoration)
      ? I18n.t('pdf.decor_line')
      : (qty > 1
        ? I18n.t('pdf.price_line_qty', { unit: formatMoney(it.unit_price), qty, total: formatMoney(it.total_price) })
        : I18n.t('pdf.price_line', { total: formatMoney(it.total_price) }));
    doc.text(`   ${priceLine}`, 14, y); y += 7;
  });

  const total = items.reduce((sum, it) => sum + Number(it.total_price || 0), 0);
  ensureSpace(10);
  doc.setFontSize(12);
  doc.text(I18n.t('pdf.order_total', { total: formatMoney(total) }), 14, y);

  const filenameBase = (order.po_name || order.client_name || I18n.t('pdf.filename_fallback'))
    .toLowerCase().normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || I18n.t('pdf.filename_fallback');
  doc.save(`${filenameBase}.pdf`);
}

// ---------- Visualizar no meu ambiente (overlay manual, sem IA) ----------
//
// Nível 1 de "montar visualmente o ambiente do cliente": sem geração de
// imagem por IA, sem enviar nada ao servidor — o cliente sobe uma foto do
// próprio espaço e arrasta/redimensiona por cima a miniatura de cada módulo
// que já está no carrinho. Reaproveita 100% o que já existia: cada item do
// carrinho ganha um thumbnail_data_url (PNG com fundo TRANSPARENTE, via
// Viewer3D.snapshot() no momento em que foi adicionado — ver
// addCurrentItemToCart) já na medida/cor que o cliente escolheu, então o
// "recorte" colado na foto já reflete a configuração real, sem precisar
// gerar nada novo. Tudo puramente client-side (arquivo local, nunca sobe
// pro Supabase) — o resultado só existe pra visualizar/baixar na hora.

let roomLayers = []; // [{ el, imgEl }] — uma entrada por módulo colocado na foto

function renderRoomCartPicker() {
  const list = document.getElementById('po-room-cart-picker-list');
  const emptyHint = document.getElementById('po-room-cart-empty-hint');
  if (!list) return;
  // Só entram itens com thumbnail (sem 3D disponível, thumbnail_data_url
  // fica null — ver addCurrentItemToCart) — nesse caso não tem o que colar.
  const withThumb = cartItems.filter((it) => it.thumbnail_data_url);
  list.innerHTML = '';
  emptyHint.style.display = withThumb.length === 0 ? 'block' : 'none';
  withThumb.forEach((it) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'po-room-cart-picker-item';
    btn.innerHTML = `<img src="${it.thumbnail_data_url}" alt="${it.module_name}" /><span>${it.module_name}</span>`;
    btn.addEventListener('click', () => addRoomLayer(it.thumbnail_data_url));
    list.appendChild(btn);
  });
}

document.getElementById('po-room-photo-input').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = document.getElementById('po-room-photo');
    img.onload = () => {
      document.getElementById('po-room-empty-hint').style.display = 'none';
      document.getElementById('po-room-editor').style.display = 'block';
      clearRoomLayers();
      renderRoomCartPicker();
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
});

document.getElementById('po-room-clear-btn').addEventListener('click', () => {
  document.getElementById('po-room-photo-input').value = '';
  document.getElementById('po-room-photo').removeAttribute('src');
  document.getElementById('po-room-editor').style.display = 'none';
  document.getElementById('po-room-empty-hint').style.display = 'block';
  clearRoomLayers();
});

function clearRoomLayers() {
  roomLayers.forEach((l) => l.el.remove());
  roomLayers = [];
}

// Cola um módulo (PNG transparente) no centro do stage, num tamanho inicial
// de até 40% da largura da foto exibida (mantendo a proporção real da
// miniatura) — o cliente ajusta posição/tamanho a partir daí.
function addRoomLayer(src) {
  const stage = document.getElementById('po-room-stage');
  const probe = new Image();
  probe.onload = () => {
    const stageRect = stage.getBoundingClientRect();
    const maxW = stageRect.width * 0.4;
    const scale = Math.min(1, maxW / probe.naturalWidth);
    const width = probe.naturalWidth * scale;
    const height = probe.naturalHeight * scale;
    const x = (stageRect.width - width) / 2;
    const y = (stageRect.height - height) / 2;

    const el = document.createElement('div');
    el.className = 'po-room-layer';
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;

    const layerImg = document.createElement('img');
    layerImg.src = src;
    layerImg.draggable = false;
    el.appendChild(layerImg);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'po-room-layer-remove';
    removeBtn.textContent = '×';
    // pointerdown com stopPropagation — senão o listener de arrastar (preso
    // no próprio .po-room-layer, que é o pai) também dispararia junto.
    removeBtn.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    removeBtn.addEventListener('click', () => {
      el.remove();
      roomLayers = roomLayers.filter((l) => l.el !== el);
    });
    el.appendChild(removeBtn);

    const handle = document.createElement('div');
    handle.className = 'po-room-layer-resize-handle';
    el.appendChild(handle);

    stage.appendChild(el);
    roomLayers.push({ el, imgEl: layerImg });
    makeRoomLayerDraggable(el, stage);
    makeRoomLayerResizable(handle, el, probe.naturalWidth / probe.naturalHeight);
  };
  probe.src = src;
}

// Arrastar — Pointer Events cobre mouse E touch com o mesmo código (célula
// principal do uso no celular). setPointerCapture garante que o "arrastar"
// continua recebendo os eventos mesmo se o dedo/cursor sair de cima do
// elemento no meio do gesto.
function makeRoomLayerDraggable(el, stage) {
  el.addEventListener('pointerdown', (e) => {
    // Só arrasta clicando no próprio quadro ou na imagem — não quando o
    // clique já foi tratado pelo botão de remover ou pela alça de resize
    // (ambos param propagation antes de chegar aqui).
    if (e.target !== el && e.target.tagName !== 'IMG') return;
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    const startX = e.clientX, startY = e.clientY;
    const startLeft = parseFloat(el.style.left) || 0;
    const startTop = parseFloat(el.style.top) || 0;

    function onMove(ev) {
      el.style.left = `${startLeft + (ev.clientX - startX)}px`;
      el.style.top = `${startTop + (ev.clientY - startY)}px`;
    }
    function onUp(ev) {
      el.releasePointerCapture(ev.pointerId);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
    }
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
  });
}

// Redimensionar pela alça do canto — mantém a proporção original da
// miniatura (não distorce o módulo).
function makeRoomLayerResizable(handle, el, aspectRatio) {
  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    handle.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startWidth = el.offsetWidth;

    function onMove(ev) {
      const newWidth = Math.max(30, startWidth + (ev.clientX - startX));
      el.style.width = `${newWidth}px`;
      el.style.height = `${newWidth / aspectRatio}px`;
    }
    function onUp(ev) {
      handle.releasePointerCapture(ev.pointerId);
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
    }
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
  });
}

// "Baixar imagem montada" — desenha a foto ORIGINAL (resolução real, não o
// tamanho reduzido exibido na tela) + cada camada num <canvas> escondido,
// escalando a posição/tamanho de cada camada pela mesma razão entre a
// resolução real da foto e o tamanho exibido no stage. Assim o PNG baixado
// sai na qualidade da foto original, não na resolução da tela.
document.getElementById('po-room-download-btn').addEventListener('click', () => {
  const photo = document.getElementById('po-room-photo');
  const stage = document.getElementById('po-room-stage');
  if (!photo.src) return;
  const stageRect = stage.getBoundingClientRect();
  const scaleX = photo.naturalWidth / stageRect.width;
  const scaleY = photo.naturalHeight / stageRect.height;

  const canvas = document.createElement('canvas');
  canvas.width = photo.naturalWidth;
  canvas.height = photo.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(photo, 0, 0, canvas.width, canvas.height);
  roomLayers.forEach((layer) => {
    const x = (parseFloat(layer.el.style.left) || 0) * scaleX;
    const y = (parseFloat(layer.el.style.top) || 0) * scaleY;
    const w = layer.el.offsetWidth * scaleX;
    const h = layer.el.offsetHeight * scaleY;
    ctx.drawImage(layer.imgEl, x, y, w, h);
  });

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = I18n.t('room.download_filename');
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, 'image/png');
});

// ---------- Composição (2+ módulos conectados, cada um configurado independentemente) ----------
//
// Fileira de "slots" sempre da esquerda pra direita: o cliente clica no
// retângulo vazio (sempre o último da fileira), isso ABRE A MESMA tela de
// "Novo Orçamento" (catálogo + configurador — nenhuma UI duplicada) marcando
// addTargetSlotIndex; o clique em "Adicionar este módulo à composição" (ver
// handler de po-add-item-btn acima) captura o resultado no slot em vez de
// gravar em order_items, e a fileira ganha um novo slot vazio à direita.
// "Gerar 3D da composição" é a próxima etapa (ainda não implementada aqui) —
// vai desenhar os módulos juntos, em escala real, numa cena NOVA e separada
// do visualizador de configuração, sem tocar na lógica de posicionamento já
// existente em viewer3d.js.

let compositionSlots = [];
let addTargetSlotIndex = null; // null = configurador normal (adiciona ao carrinho); número = slot da composição sendo configurado agora
// true = addTargetSlotIndex é uma posição de INSERÇÃO (abre espaço, não
// sobrescreve o que já está lá) — ver startCompositionSlotConfig/divisor "+"
// entre cards em renderCompositionSlots. false pros dois outros casos:
// editar um slot já preenchido (sobrescreve o próprio índice) ou adicionar
// no slot vazio do final (sobrescreve uma posição nova, vazia).
let compositionInsertMode = false;
// Empilhamento vertical (pedido do usuário, 2026-07-16): id (string opaca,
// gerada por newSlotId()) da coluna-base em que o PRÓXIMO módulo confirmado
// deve empilhar por cima — null = não está empilhando, o próximo módulo
// abre coluna nova (comportamento de sempre). Setado só pelo botão "Colocar
// em cima" de um card já preenchido (ver renderCompositionSlots) e sempre
// resetado em exitCompositionSlotConfig(), igual compositionInsertMode.
let addStackOnId = null;
// Aba ativa do painel de troca rápida de cor (pedido do usuário, 2026-07-16:
// "pode fazer por abas pra nao ocupar muito espaco na tela") — color_role_id
// do grupo (Caixa/Porta/Painel/etc., ver loadCompositionColorRoleGroups)
// mostrado no momento; null = nenhuma aba escolhida ainda (renderCompositionSideColorPanel
// cai pro primeiro grupo encontrado). Mantido entre re-renders (troca de cor,
// adicionar/remover módulo) pra não voltar sempre pra primeira aba — só reseta
// pra o primeiro grupo se a aba ativa deixar de existir (ex: removeu o único
// módulo que usava aquele papel de cor).
let compColorActiveTabRoleId = null;
// Mesma ideia, versão Projetos (ver renderProjectSideColorPanel/
// applyColorRoleToAllProjectSlots) — painel separado, aba ativa própria.
let projColorActiveTabRoleId = null;

// Cada slot da composição ganha um id opaco e estável (não é o id do
// módulo do catálogo — vários slots podem repetir o mesmo módulo) só pra
// permitir que OUTRO slot se refira a ele via stack_on_id (empilhado em
// cima dele, mesma coluna). Não precisa ser globalmente único, só único
// dentro desta composição em memória.
let compositionSlotIdSeq = 0;
function newSlotId() {
  compositionSlotIdSeq += 1;
  return `slot_${Date.now()}_${compositionSlotIdSeq}`;
}
