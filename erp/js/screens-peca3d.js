/* Legno ERP — visor 3D de uma peça já cortada (#/peca/:codigo)
 *
 * Pedido do Matt (2026-09-21, olhando o plano de corte de LT-26-0013):
 * "posso criar uma opcao de ao clicar em alguma peca ela abrir o modulo
 * explodido com a peca piscando em vermelho? essa tela ja existe seria so
 * trazer ela aqui. e talvez vou usar ela em outros momentos da fabricacao
 * ou montagem. alem do desenho quero as informacoes, projeto, numero do
 * modulo, cliente."
 *
 * A tela que ele descreve é o modal "Peças do móvel" do Portal
 * (js/portal-06c-projetos-canvas-3d-acoes.js, openProjectSlotPieces/
 * renderProjectSlotPiecesExploded/blinkProjectSlotPieceInViewer) — slider
 * Explode + contorno vermelho piscando na peça certa. Este arquivo NÃO
 * reaproveita aquele modal (ele vive preso ao estado AO VIVO de
 * `projectSlots`, que só existe enquanto alguém está configurando um
 * projeto no Portal) — reconstrói o mesmo desenho a partir do que fica
 * GRAVADO em public.order_items (module_id + medidas + cores + prateleiras
 * + overrides + peças removidas), exatamente como FURACAO_LOTE já faz pra
 * furação (erp/js/furacao-lote.js: "furação é conhecimento de produção...
 * não se usa o snapshot do pedido"). O 3D aqui reflete o cadastro ATUAL do
 * módulo, não um snapshot congelado — se o Matt corrigir uma peça no
 * cadastro depois do pedido fechado, o desenho já sai certo.
 *
 * Rota própria por código de peça (não por lote/plano) DE PROPÓSITO — o
 * código é o mesmo que já sai impresso (código de barras) em cada
 * etiqueta. "vou usar ela em outros momentos da fabricação ou montagem":
 * a ideia é que, no futuro, escanear o código de barras de uma peça em
 * qualquer bancada leve direto pra esta tela, sem depender de saber de
 * qual lote ela veio.
 *
 * De onde vem o link: erp.batch_pieces/cut_plan_pieces.order_item_ids
 * (migration 158) — array (não uuid único) porque LOTES.explodeOrders
 * funde peças IDÊNTICAS de módulos DIFERENTES do mesmo pedido numa linha
 * só (mesma peça de propósito de module_number virar "001, 003", migration
 * 157). Quando isso acontece, abre o primeiro order_item da lista — são
 * peças visualmente idênticas, então não importa qual das duas se mostra.
 */

const PECA3D = {};

PECA3D._viewer = null;
PECA3D._lastCode = null;
PECA3D._assembly = null;
PECA3D._blinkTimer = null;

PECA3D.load = async function (p) {
  const code = p.id;
  const piece = await LOTES.pieceByCode(code);
  if (!piece) return { code: code, notFound: true };

  const orderItemIds = piece.order_item_ids || [];
  if (!orderItemIds.length) return { code: code, piece: piece, semVinculo: true };

  const { data: orderItem, error: eItem } = await supabaseClient
    .from('order_items')
    .select('id, order_id, module_id, module_name, width_mm, height_mm, depth_mm, ' +
      'selected_colors, shelf_quantities, selected_optional_component_ids, dim_overrides, piece_color_overrides, removed_piece_ids')
    .eq('id', orderItemIds[0]).maybeSingle();
  if (eItem) throw eItem;
  if (!orderItem || !orderItem.module_id) return { code: code, piece: piece, orderItemMissing: true };

  const colors = await LOTES.colors();
  const colorById = {};
  colors.forEach(function (c) { colorById[c.id] = c; });

  const rawPieces = await loadRecursivePiecesForModule(orderItem.module_id);

  /* Mesmo filtro de projectSlotAllPiecesBeforeRemoval + projectSlotEffectivePieces
     (js/portal-06b-projetos-canvas-ia-custo.js): peça opcional só entra se foi
     selecionada, peça removida manualmente pelo cliente/vendedor não entra. */
  const selectedOptionalIds = orderItem.selected_optional_component_ids || [];
  const removedIds = orderItem.removed_piece_ids || [];
  const effectivePieces = rawPieces
    .filter(function (pc) { return !pc.client_optional || selectedOptionalIds.includes(pc.id); })
    .filter(function (pc) { return !removedIds.includes(pc.id); });

  const colorsByRole = {};
  (orderItem.selected_colors || []).forEach(function (sc) {
    if (sc && sc.role_id && colorById[sc.color_id]) colorsByRole[sc.role_id] = colorById[sc.color_id];
  });

  const slot = {
    pieces: effectivePieces,
    width_mm: orderItem.width_mm, height_mm: orderItem.height_mm, depth_mm: orderItem.depth_mm,
    colorsByRole: colorsByRole,
    shelfQuantities: orderItem.shelf_quantities || {},
    dimOverrides: orderItem.dim_overrides || {},
    pieceColorOverrides: orderItem.piece_color_overrides || {}
  };

  let resolvedParts = [];
  try {
    resolvedParts = resolvePiecesForViewer(
      slot.pieces, { W: slot.width_mm, H: slot.height_mm, D: slot.depth_mm },
      slot.colorsByRole, slot.shelfQuantities, slot.dimOverrides, slot.pieceColorOverrides
    ) || [];
  } catch (e) { console.error('[peca3d] resolvePiecesForViewer falhou:', e); }

  const flatParts = PECA3D.flatten(resolvedParts);
  const matchedPieceId = PECA3D.bestMatch(flatParts, piece);

  return {
    code: code, piece: piece, orderItem: orderItem, slot: slot,
    extraOrderItems: orderItemIds.length - 1,
    flatParts: flatParts, matchedPieceId: matchedPieceId
  };
};

/* Achata a árvore de peças resolvidas — peça-módulo aninhada (is_module)
   carrega child_pieces, a conferência quer a peça-folha que vai pra serra.
   Mesma lógica de flatProjectPieces (js/portal-06c-projetos-canvas-3d-acoes.js). */
PECA3D.flatten = function (parts, prefixo) {
  const out = [];
  (parts || []).forEach(function (p) {
    if (p.is_module && Array.isArray(p.child_pieces) && p.child_pieces.length) {
      out.push.apply(out, PECA3D.flatten(p.child_pieces, (prefixo ? prefixo + ' · ' : '') + (p.reference || p.module_name || '')));
    } else {
      out.push({ p: p, grupo: prefixo || '' });
    }
  });
  return out;
};

/* A peça clicada no nesting não carrega o piece_id de resolvePiecesForViewer
   (esse id é module_components.id, interno do resolvedor — erp.cut_plan_pieces
   não guarda isso, só a medida/referência já normalizadas, ver migration 081).
   Achar de volta por medida (comprimento×largura×espessura, tolerância 1mm,
   sem importar o eixo) + referência como desempate — igual duas peças
   idênticas (2 prateleiras do mesmo módulo) são visualmente a mesma coisa,
   não importa qual das duas pisca. */
PECA3D.bestMatch = function (flatParts, piece) {
  const target = [Number(piece.w_mm) || 0, Number(piece.h_mm) || 0, Number(piece.espessura_mm) || 0].sort(function (a, b) { return b - a; });
  const targetRef = String(piece.reference || '').trim().toLowerCase();
  const TOL = 1;
  let best = null, bestScore = -1;
  (flatParts || []).forEach(function (row) {
    const p = row.p;
    const dims = [Number(p.width_mm) || 0, Number(p.height_mm) || 0, Number(p.depth_mm) || 0].sort(function (a, b) { return b - a; });
    if (Math.abs(dims[0] - target[0]) > TOL || Math.abs(dims[1] - target[1]) > TOL || Math.abs(dims[2] - target[2]) > TOL) return;
    const score = (String(p.reference || '').trim().toLowerCase() === targetRef) ? 2 : 1;
    if (score > bestScore) { bestScore = score; best = p; }
  });
  return best ? best.piece_id : null;
};

/* Cópia enxuta de buildCompositionAssemblies (js/portal-03-composicao.js) —
   só o necessário pra UM módulo (aquele arquivo monta vários lado a lado
   pra tela de Composição, aqui é sempre um só). Mesma função, mesmas
   chamadas (resolvePiecesForViewer + Viewer3D.buildStandaloneAssembly);
   não copiei o arquivo inteiro (3500+ linhas, é a tela de composição do
   Portal, nada disso existe no ERP) só por causa destas ~10 linhas. */
PECA3D.buildAssembly = function (slot) {
  const parts = resolvePiecesForViewer(
    slot.pieces, { W: slot.width_mm, H: slot.height_mm, D: slot.depth_mm },
    slot.colorsByRole, slot.shelfQuantities, slot.dimOverrides, slot.pieceColorOverrides
  );
  const assembly = Viewer3D.buildStandaloneAssembly(parts, slot.width_mm, slot.height_mm, slot.depth_mm, { doors: false, drawers: false });
  if (assembly) { assembly.id = 'peca3d'; assembly.stack_on_id = null; assembly.floor_height_m = 0; }
  return assembly;
};

PECA3D.render = function (params, d) {
  if (d.notFound) {
    return UI.crumb([{ label: 'Lotes', href: '#/lotes' }, { label: 'Peça' }]) +
      UI.errorBox('Peça não encontrada', 'O código "' + d.code + '" não bate com nenhuma peça de plano de corte salvo.');
  }
  if (d.semVinculo || d.orderItemMissing) {
    const motivo = d.semVinculo
      ? 'Esta peça não tem módulo vinculado — foi cortada antes desta função existir (migration 158), ou veio de um Plano de Corte avulso (sem módulo nenhum pra desenhar).'
      : 'O módulo desta peça não existe mais no pedido (foi removido depois do corte) — não dá pra reconstruir o desenho 3D.';
    return UI.crumb([{ label: 'Lotes', href: '#/lotes' }, { label: 'Peça ' + d.code }]) +
      UI.head('Peça ' + d.code, d.piece.reference || '', '') +
      UI.panel('Sem desenho 3D disponível', '<div class="erp-muted" style="margin-bottom:12px">' + UI.esc(motivo) + '</div>' +
        UI.def([
          ['Peça', UI.esc(d.piece.reference || '—')],
          ['Módulo', UI.esc(d.piece.module_name || '—')],
          ['Nº módulo', UI.esc(d.piece.module_number || '—')],
          ['Projeto', UI.esc(d.piece.po_name || '—')],
          ['Cliente', UI.esc(d.piece.client_name || '—')]
        ]));
  }

  const piece = d.piece;
  const infoHtml = '<div class="pc3-info">' +
    '<div class="pc3-info-item"><span class="pc3-info-label">Projeto</span><span class="pc3-info-value">' + UI.esc(piece.po_name || '—') + '</span></div>' +
    '<div class="pc3-info-item"><span class="pc3-info-label">Nº módulo</span><span class="pc3-info-value">' + UI.esc(piece.module_number || '—') + '</span></div>' +
    '<div class="pc3-info-item"><span class="pc3-info-label">Cliente</span><span class="pc3-info-value">' + UI.esc(piece.client_name || '—') + '</span></div>' +
  '</div>';
  const extraNote = d.extraOrderItems > 0
    ? '<div class="erp-muted erp-small" style="margin-top:8px">Esta peça é idêntica em ' + (d.extraOrderItems + 1) + ' módulos deste pedido — mostrando o primeiro.</div>'
    : '';

  const tableRows = d.flatParts.length
    ? d.flatParts.map(function (row, i) {
        const p = row.p;
        const dim = [Number(p.width_mm) || 0, Number(p.height_mm) || 0, Number(p.depth_mm) || 0].sort(function (a, b) { return b - a; });
        const isMatch = p.piece_id != null && String(p.piece_id) === String(d.matchedPieceId);
        const clickAttr = p.piece_id != null
          ? ' data-piece-id="' + UI.esc(p.piece_id) + '" onclick="PECA3D.blink(\'' + UI.esc(p.piece_id) + '\')" style="cursor:pointer"'
          : '';
        return '<tr class="' + (isMatch ? 'pc3-row-match' : '') + '"' + clickAttr + '>' +
          '<td>' + (i + 1) + '</td>' +
          '<td>' + UI.esc((row.grupo ? row.grupo + ' · ' : '') + (p.reference || p.module_name || '—')) + '</td>' +
          '<td class="erp-num">' + LOTES_UI.mm(dim[0]) + '</td>' +
          '<td class="erp-num">' + LOTES_UI.mm(dim[1]) + '</td>' +
          '<td class="erp-num">' + LOTES_UI.mm(dim[2]) + '</td>' +
          '<td>' + UI.esc((p.color && p.color.name) || '—') + '</td>' +
          '<td>' + (p.veio === 'travado' ? 'travado' : 'livre') + '</td>' +
        '</tr>';
      }).join('')
    : '<tr><td colspan="7"><div class="erp-empty">Nenhuma peça resolvida pra este módulo.</div></td></tr>';

  return UI.crumb([{ label: 'Lotes', href: '#/lotes' }, { label: 'Peça ' + piece.piece_code }]) +
    UI.head('Peça ' + piece.piece_code,
      UI.esc(piece.reference || '') + (piece.module_name ? ' · ' + UI.esc(piece.module_name) : ''), '') +
    '<div class="pc3-layout">' +
      '<div class="pc3-viewer-col">' +
        '<div class="pc3-viewer-head"><span class="erp-strong erp-small">Explodir</span>' +
          '<input id="pc3-explode" type="range" min="0" max="100" value="35"></div>' +
        '<div id="pc3-canvas" class="pc3-canvas"></div>' +
        infoHtml + extraNote +
      '</div>' +
      '<div class="pc3-table-col">' +
        '<table class="erp-table"><thead><tr>' +
          '<th>#</th><th>Peça</th><th class="erp-num">Compr.</th><th class="erp-num">Larg.</th>' +
          '<th class="erp-num">Esp.</th><th>Cor</th><th>Veio</th>' +
        '</tr></thead><tbody>' + tableRows + '</tbody></table>' +
      '</div>' +
    '</div>';
};

PECA3D.after = function (params, d) {
  if (!d || d.notFound || d.semVinculo || d.orderItemMissing) return;
  const cv = document.getElementById('pc3-canvas');
  if (typeof ViewerComposition === 'undefined' || !ViewerComposition.createInstance) {
    if (cv) cv.innerHTML = '<div class="erp-muted" style="padding:16px">Visor 3D indisponível nesta sessão (viewer3d_composition.js não carregou — recarregue a página).</div>';
    return;
  }

  /* Tudo que mexe em WebGL/three.js entra num try/catch — antes, um erro
     aqui dentro só aparecia no F12 (app.js engole o erro de todo `after` de
     rota, console.error('[after]', err), pra não travar a tela) e o Matt
     via só o quadro em branco, sem pista nenhuma do motivo (21/09-6: "e o 3d
     nao aparece"). Agora aparece uma mensagem de verdade no lugar do
     desenho, com o erro real — muito mais rápido de diagnosticar (inclusive
     por mim, no próximo relato) do que pedir pra abrir o console toda vez. */
  try {
    /* Instância NOVA a cada abertura, de propósito: tanto a navegação de
       rota (o roteador troca #erp-main.innerHTML inteiro a cada rota, mesmo
       pra rota igual com :codigo diferente) quanto o popup (ver
       PECA3D.openModal — reconstrói o miolo do modal a cada abertura)
       destroem o <div id="pc3-canvas"> antigo, então reaproveitar a
       instância tentaria desenhar num container morto. Custo: cada abertura
       consome um contexto WebGL novo; sem problema no uso real (conferir
       peça a peça), mas abrir dezenas seguidas na mesma aba sem recarregar
       a página pode esgotar os contextos WebGL do navegador (mesma
       limitação já aceita em erp/js/adm/26-modulo-pecas-3d.js pro singleton
       Viewer3D — sem API de dispose exposta em viewer3d_composition.js pra
       fazer diferente). */
    PECA3D._viewer = ViewerComposition.createInstance();
    PECA3D._lastCode = d.code;
    PECA3D._viewer.init('pc3-canvas');

    const assembly = PECA3D.buildAssembly(d.slot);
    if (!assembly || !assembly.group) {
      if (cv) cv.innerHTML = '<div class="erp-muted" style="padding:16px">Não consegui montar o desenho 3D deste módulo.</div>';
      return;
    }
    PECA3D._assembly = assembly;
    assembly.group.children.forEach(function (c) {
      if (!c.userData.__pos0) c.userData.__pos0 = c.position.clone();
    });
    PECA3D._viewer.render([assembly], null, null);
    PECA3D.explode();
    if (d.matchedPieceId != null) PECA3D.blink(d.matchedPieceId);

    const range = document.getElementById('pc3-explode');
    if (range) range.addEventListener('input', PECA3D.explode);
  } catch (err) {
    console.error('[peca3d]', err);
    if (cv) {
      cv.innerHTML = '<div class="erp-error" style="margin:0"><div class="erp-error-title">Erro ao montar o 3D</div>' +
        '<div class="erp-error-detail">' + UI.esc((err && err.message) || String(err)) + '</div></div>';
    }
  }
};

/* ============================================================
   Popup — clicar numa peça no plano de corte abre isto por cima da tela,
   em vez de navegar (pedido do Matt, 21/09-6: "quando clico na peca do
   plano ele abre uma janela nova, pode deixar so num popup. com fechar no
   botao?"). A rota #/peca/:codigo continua existindo do jeito que estava —
   é o que vai servir pro uso futuro de escanear o código de barras da peça
   (ver cabeçalho do arquivo) — o popup é só uma SEGUNDA porta de entrada
   pro mesmo PECA3D.render/after, sem sair da tela do plano de corte.
   ============================================================ */
PECA3D._modalEl = null;

PECA3D._buildModalShell = function () {
  const el = document.createElement('div');
  el.id = 'pc3-modal';
  el.className = 'pc3-modal-overlay';
  el.innerHTML =
    '<div class="pc3-modal-box">' +
      '<button type="button" class="pc3-modal-close" onclick="PECA3D.closeModal()" aria-label="Fechar">&times;</button>' +
      '<div id="pc3-modal-body"></div>' +
    '</div>';
  /* Clicar no fundo escurecido fecha, clicar dentro da caixa não — mesmo
     comportamento de qualquer modal do sistema. */
  el.addEventListener('click', function (e) { if (e.target === el) PECA3D.closeModal(); });
  document.body.appendChild(el);
  PECA3D._modalEl = el;
};

PECA3D.openModal = async function (pieceCode) {
  if (!pieceCode) return;
  if (!PECA3D._modalEl) PECA3D._buildModalShell();
  PECA3D._modalEl.style.display = 'flex';
  const body = document.getElementById('pc3-modal-body');
  body.innerHTML = '<div class="erp-loading">Buscando peça…</div>';

  let payload;
  try {
    payload = await PECA3D.load({ id: pieceCode });
  } catch (err) {
    console.error('[peca3d modal]', err);
    body.innerHTML = UI.errorBox('Não consegui carregar a peça',
      (typeof LOTES !== 'undefined' && LOTES.explainError) ? LOTES.explainError(err) : ((err && err.message) || String(err)));
    return;
  }
  body.innerHTML = PECA3D.render({ id: pieceCode }, payload);
  PECA3D.after({ id: pieceCode }, payload); // já tem try/catch próprio, ver acima
};

PECA3D.closeModal = function () {
  if (PECA3D._modalEl) PECA3D._modalEl.style.display = 'none';
  if (PECA3D._blinkTimer) { clearInterval(PECA3D._blinkTimer); PECA3D._blinkTimer = null; }
};

/* Mesma lógica de aplicaExplosao (js/portal-06c-projetos-canvas-3d-acoes.js):
   afasta cada peça do centro do módulo, na direção em que ela já está. */
PECA3D.explode = function () {
  const range = document.getElementById('pc3-explode');
  const assembly = PECA3D._assembly;
  if (!assembly || !assembly.group || typeof THREE === 'undefined') return;
  const f = (Number(range && range.value) || 0) / 100;
  const h = (assembly.height_m || 0) / 2;
  assembly.group.children.forEach(function (c) {
    const p0 = c.userData.__pos0;
    if (!p0) return;
    const dir = new THREE.Vector3(p0.x, p0.y - h, p0.z);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1);
    dir.normalize();
    c.position.copy(p0).addScaledVector(dir, f * 0.55);
  });
};

/* Mesma lógica de blinkProjectSlotPieceInViewer (js/portal-06c-projetos-
   canvas-3d-acoes.js) — 3 ciclos liga/desliga, termina ACESO. Reaproveita
   ViewerComposition.setHoverHighlight (o mesmo contorno vermelho do hover
   normal), não inventa desenho novo. */
PECA3D.blink = function (pieceId) {
  if (pieceId == null || !PECA3D._viewer || typeof PECA3D._viewer.setHoverHighlight !== 'function') return;
  if (!PECA3D._assembly || !PECA3D._assembly.group) return;
  let target = null;
  PECA3D._assembly.group.traverse(function (o) {
    if (!target && o.userData && o.userData.pieceId != null && String(o.userData.pieceId) === String(pieceId)) target = o;
  });
  if (!target) return;
  if (PECA3D._blinkTimer) clearInterval(PECA3D._blinkTimer);
  const TICKS = 6;
  let tick = 0, on = true;
  PECA3D._viewer.setHoverHighlight(target);
  PECA3D._blinkTimer = setInterval(function () {
    on = !on;
    PECA3D._viewer.setHoverHighlight(on ? target : null);
    tick++;
    if (tick >= TICKS) {
      clearInterval(PECA3D._blinkTimer);
      PECA3D._blinkTimer = null;
      PECA3D._viewer.setHoverHighlight(target);
    }
  }, 200);
};

/* Chamada pelo onclick de cada peça desenhada no nesting (ver
   NESTING.sheetSVG/LOTES_UI.planView) — abre em POPUP por cima da tela
   (PECA3D.openModal), sem sair do plano de corte que estava sendo
   conferido nem abrir aba nova. */
LOTES_UI.abrirPeca3D = function (pieceCode) {
  if (!pieceCode) return;
  PECA3D.openModal(pieceCode);
};
