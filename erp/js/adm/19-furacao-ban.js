/* Painel admin — Exportação da furação em .ban
 *
 * Pedaço 20/21 do antigo js/admin.js, que virou módulo quando o
 * ERP passou a ser a única porta de entrada. O corte seguiu os próprios
 * marcadores de assunto do arquivo, então nada mudou de vizinho.
 * A ordem de carregamento em erp/index.html importa: é a mesma de antes. */

// ---------- FURAÇÃO (ZIP de .ban) — migration 038 ----------
// Re-resolve as peças do pedido a partir da CONFIGURAÇÃO gravada em cada
// order_item (module_id + medidas + shelf_quantities + dim_overrides +
// opcionais escolhidos) contra o cadastro ATUAL de módulos/furação — de
// propósito NÃO usa o snapshot breakdown: furação é conhecimento de
// produção e pode ser corrigida/cadastrada DEPOIS do pedido feito (o preço,
// esse sim, fica congelado no breakdown). Um .ban por peça única (mesma
// peça + mesmos furos agrupa e soma quantidade), mais um índice .txt
// mapeando arquivo -> módulo/peça/medidas/quantidade.
document.getElementById('order-drilling-zip-btn').addEventListener('click', async () => {
  const statusEl = document.getElementById('order-drilling-status');
  clearError('order-cutlist-error');
  if (!currentCutlistOrder) return;
  if (typeof JSZip === 'undefined') {
    showError('order-cutlist-error', new Error('Biblioteca de ZIP não carregou — recarregue a página.'));
    return;
  }
  statusEl.textContent = 'Gerando furação...';
  try {
    const [itemsRes, drillsRes, patternHolesRes, settingsRes, catAgregados] = await Promise.all([
      supabaseClient.from('order_items')
        // layout entrou em 2026-08-18 (migration 121): geometria congelada
        // das peças que o cliente montou no construtor de vãos dentro deste
        // item — ver o comentário grande no topo de erp/js/furacao-lote.js
        // e FURACAO_LOTE._catalogoDeAgregados (reaproveitada abaixo). Esta
        // tela é uma SEGUNDA cópia do mesmo resolvedor (furação POR PEDIDO,
        // não por lote — ver [[quatro_copias_do_resolvedor_de_pecas]]);
        // sem este campo aqui a peça do construtor nunca chegava no .ban
        // gerado por este botão, mesmo já chegando no de furacao-lote.js.
        .select('module_id, module_name, quantity, width_mm, height_mm, depth_mm, shelf_quantities, dim_overrides, selected_optional_component_ids, removed_piece_ids, sort_order, layout, modules(is_decoration)')
        .eq('order_id', currentCutlistOrder.id)
        .order('sort_order'),
      supabaseClient.from('component_drillings').select('*').order('sort_order'),
      // Furos dos PROGRAMAS (migration 105). Consulta separada e tolerante:
      // quem ainda não rodou a migration recebe erro aqui e segue só com a
      // furação do componente, em vez de a tela inteira morrer.
      supabaseClient.from('drilling_pattern_holes').select('*').order('sort_order'),
      supabaseClient.from('drilling_settings').select('*').eq('id', true).single(),
      // Catálogo do construtor de vãos — MESMA função que furacao-lote.js já
      // usa (FURACAO_LOTE._catalogoDeAgregados), reaproveitada aqui em vez
      // de escrita de novo. Tolerante: null quando a migration 085 não rodou
      // ou FURACAO_LOTE ainda não carregou por algum motivo.
      (typeof FURACAO_LOTE !== 'undefined' && FURACAO_LOTE._catalogoDeAgregados)
        ? FURACAO_LOTE._catalogoDeAgregados() : Promise.resolve(null)
    ]);
    if (itemsRes.error) throw itemsRes.error;
    if (drillsRes.error) throw drillsRes.error;
    if (settingsRes.error) throw settingsRes.error;

    const drillingsByComponent = {};

    // Mapa dos furos por PROGRAMA (migration 105). Erro é engolido de
    // propósito: sem a migration, holesByPattern fica vazio e tudo segue
    // pela furação do componente, como antes.
    const holesByPattern = Drilling.groupPatternHoles(
      (patternHolesRes && !patternHolesRes.error && patternHolesRes.data) || []);
    (drillsRes.data || []).forEach((row) => {
      if (!drillingsByComponent[row.component_id]) drillingsByComponent[row.component_id] = [];
      drillingsByComponent[row.component_id].push(row);
    });

    // Resolve cada item do pedido pro formato de parts do drilling.js —
    // mesma resolução usada pela aba Imagem 3D (loadRecursivePiecesForModule
    // + resolvePiecesForViewer), com a configuração escolhida pelo cliente.
    const drillingItems = [];
    let skippedModules = 0;
    for (const item of (itemsRes.data || [])) {
      // Módulo decorativo (migration 039) não vai pra produção — nem furação.
      if (item.modules && item.modules.is_decoration) continue;
      const pieces = await loadRecursivePiecesForModule(item.module_id);
      if (!pieces || pieces.length === 0) { skippedModules += 1; continue; }

      // PEÇAS DO CONSTRUTOR DE VÃOS (migration 121) — mesmo trecho de
      // erp/js/furacao-lote.js._itensDoPedido. item.layout é a geometria
      // congelada no checkout; toPieceRows resolve contra o catálogo ATUAL.
      let pecasDoConstrutor = [];
      if (Array.isArray(item.layout) && item.layout.length && catAgregados) {
        try {
          pecasDoConstrutor = LayoutEngine.toPieceRows(item.layout, catAgregados) || [];
        } catch (e) {
          console.error('[furacao-ban] geometria do construtor deste item não resolveu:', e);
        }
      }
      const todasPecas = pecasDoConstrutor.length ? pieces.concat(pecasDoConstrutor) : pieces;

      const selectedIds = item.selected_optional_component_ids || [];
      // removed_piece_ids (migration 134): peça removida manualmente pelo
      // cliente no modal "Peças do móvel" não pode ser cortada/furada aqui.
      const removedIds = item.removed_piece_ids || [];
      const effectivePieces = todasPecas
        .filter((p) => !p.client_optional || selectedIds.includes(p.id))
        .filter((p) => !removedIds.includes(p.id));
      const containerDims = { W: item.width_mm, H: item.height_mm, D: item.depth_mm };
      const parts = resolvePiecesForViewer(
        effectivePieces, containerDims, {}, item.shelf_quantities || {}, item.dim_overrides || {}
      );
      drillingItems.push({
        moduleName: item.module_name,
        parts,
        W: item.width_mm, H: item.height_mm, D: item.depth_mm,
        quantity: item.quantity || 1
      });
    }

    const files = Drilling.generateOrderFiles(drillingItems, {
      drillingsByComponent,
      holesByPattern,
      settings: settingsRes.data || {}
    });

    if (files.length === 0) {
      statusEl.textContent = 'Nenhum furo gerado — cadastre furação padrão nos componentes (incluindo contra-furos de borda) ou dobradiças.';
      return;
    }

    const zip = new JSZip();
    const indexLines = ['arquivo;modulo;peca;comprimento_mm;largura_mm;espessura_mm;quantidade;furos;usinagem'];
    files.forEach((f) => {
      zip.file(f.filename, f.content);
      indexLines.push([
        f.filename, f.module_name, f.reference,
        Math.round(f.comprimento_mm), Math.round(f.largura_mm), Math.round(f.espessura_mm),
        f.quantity, f.holes_count, f.slots_count || 0
      ].join(';'));
    });
    zip.file('00_indice.txt', indexLines.join('\r\n') + '\r\n');

    const blob = await zip.generateAsync({ type: 'blob' });
    const titleText = currentCutlistOrder.po_name || currentCutlistOrder.client_name || 'pedido';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'furacao_' + titleText.replace(/[^a-zA-Z0-9_-]+/g, '_') + '.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);

    statusEl.textContent = files.length + ' arquivo(s) .ban gerado(s)'
      + (skippedModules > 0 ? ' — ' + skippedModules + ' módulo(s) do pedido não existem mais no cadastro e ficaram de fora.' : '.');
  } catch (err) {
    statusEl.textContent = '';
    showError('order-cutlist-error', err);
  }
});
