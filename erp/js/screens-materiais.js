/* Legno ERP — Materiais: chapa, retalho e fita num lugar só.
 *
 * Pedido do Matt (2026-08-08): "onde vejo os cadastros das chapas e retalhos?
 * quero uma tela so pra isso, ja coloca fita tambem, com estoque pra dar
 * baixa" + "algum lugar pra dar entrada manual de retalhos".
 *
 * A tela tem quatro abas, e a ordem não é aleatória — é o caminho que o
 * material faz na fábrica:
 *
 *   Chapas  → o que você compra e quanto tem
 *   Fita    → o que cola na borda do que você cortou
 *   Retalhos→ o que sobrou e volta pro começo
 *   Extrato → por que os números mudaram
 *
 * A aba antiga #/retalhos continua existindo como atalho, mas agora aponta
 * pra cá (aba retalhos) — não faria sentido manter duas telas mexendo no
 * mesmo estoque.
 *
 * MATERIAL É A COR. Cor, no banco, não é só um swatch: é o material (preço de
 * chapa, preço de fita, chapa padrão, e agora o veio). Por isso a aba Chapas
 * edita a tabela `colors` — não é gambiarra, é onde o dado sempre morou.
 */

const MAT = {};

MAT.TABS = [
  { id: 'chapas', label: 'Chapas' },
  { id: 'fita', label: 'Fita de borda' },
  { id: 'retalhos', label: 'Retalhos' },
  { id: 'extrato', label: 'Extrato' }
];

MAT.load = async function (params) {
  const [colors, sizes, stock, tapes, offcuts, moves] = await Promise.all([
    LOTES.colors(),
    LOTES.sheetSizes(),
    LOTES.sheetStock(),
    LOTES.edgeTapes(),
    LOTES.offcuts(),
    LOTES.stockMoves(80)
  ]);
  // Perfil de alumínio / vidro (migration 187) não são chapa — ficam em
  // Itens comprados, não no estoque de chapas.
  const chapas = (colors || []).filter(function (c) { return !c.purchased_item_id; });
  return { colors: chapas, sizes: sizes, stock: stock, tapes: tapes, offcuts: offcuts, moves: moves };
};

MAT.render = function (params, d) {
  MAT._d = d;
  const tab = params.tab || 'chapas';
  MAT._tab = tab;

  const nav = '<div class="erp-tabs">' + MAT.TABS.map(function (t) {
    return '<a href="#/materiais?tab=' + t.id + '" class="' + (t.id === tab ? 'active' : '') + '">' + t.label + '</a>';
  }).join('') + '</div>';

  const body = tab === 'fita' ? MAT.tabFita(d)
    : tab === 'retalhos' ? MAT.tabRetalhos(d)
    : tab === 'extrato' ? MAT.tabExtrato(d)
    : MAT.tabChapas(d);

  return UI.head('Materiais',
    'Chapa, fita e retalho — o que existe, quanto tem e por onde saiu. ' +
    'O plano de corte lê tudo daqui e dá baixa sozinho quando você salva.') +
    '<div id="mat-toast" style="display:none"></div>' +
    nav + '<div id="mat-form"></div>' + body;
};

MAT.toast = function (msg, isError) {
  const el = document.getElementById('mat-toast');
  if (!el) { if (isError) alert(msg); return; }
  el.className = isError ? 'erp-error' : 'erp-note';
  el.innerHTML = isError
    ? '<div class="erp-error-title">Não deu certo</div><div class="erp-error-detail">' + UI.esc(msg) + '</div>'
    : UI.esc(msg);
  el.style.display = 'block';
  if (!isError) setTimeout(function () { el.style.display = 'none'; }, 4000);
};

MAT.colorById = function (id) {
  return (MAT._d.colors || []).find(function (c) { return c.id === id; }) || null;
};
MAT.sizeById = function (id) {
  return (MAT._d.sizes || []).find(function (s) { return s.id === id; }) || null;
};

/* ============================================================
   Aba CHAPAS
   ============================================================ */
MAT.tabChapas = function (d) {
  const stockByKey = {};
  d.stock.forEach(function (s) { stockByKey[s.color_id + '|' + s.sheet_size_id] = s; });

  /* Uma linha por MATERIAL (cor). A chapa padrão da cor define qual tamanho o
     estoque dela conta — cor com duas chapas diferentes é caso raro o
     bastante pra resolver na tela de estoque, não na listagem principal. */
  const rows = d.colors.filter(function (c) { return c.active !== false; }).map(function (c) {
    const size = c.default_sheet_size_id ? MAT.sizeById(c.default_sheet_size_id) : null;
    const st = size ? stockByKey[c.id + '|' + size.id] : null;
    const qtd = st ? st.quantity : null;
    const baixo = st && qtd <= st.min_quantity;
    return {
      cor: UI.swatch(c.swatch_hex, c.name),
      veio: c.has_grain
        ? UI.pill('tem veio', 'erp-pill-warn')
        : '<span class="erp-muted erp-xs">liso</span>',
      chapa: size
        ? '<span class="erp-small">' + UI.esc(size.name) + '</span>' +
          '<div class="erp-xs erp-muted">' + LOTES_UI.mm(size.width_mm) + ' × ' + LOTES_UI.mm(size.height_mm) +
          ' · serra ' + Number(size.kerf_mm) + 'mm</div>'
        : '<span class="erp-pill erp-pill-danger">sem chapa padrão</span>',
      estoque: qtd == null
        ? '<span class="erp-muted erp-xs">não controlado</span>'
        : '<span class="erp-strong ' + (qtd < 0 ? 'erp-pill erp-pill-danger' : '') + '">' + qtd + '</span>' +
          '<div class="erp-xs erp-muted">mín ' + st.min_quantity + (baixo && qtd >= 0 ? ' · <b>repor</b>' : '') + '</div>',
      local: st && st.location ? UI.esc(st.location) : '<span class="erp-muted erp-xs">—</span>',
      acao: '<button class="erp-btn-secondary erp-btn-sm" onclick="MAT.editarMaterial(\'' + c.id + '\')">Editar</button> ' +
        (size
          ? '<button class="erp-btn-ghost erp-btn-sm" onclick="MAT.entradaChapa(\'' + c.id + '\',\'' + size.id + '\')">Entrada</button>'
          : '')
    };
  });

  const sizeRows = d.sizes.map(function (s) {
    const usos = d.colors.filter(function (c) { return c.default_sheet_size_id === s.id; }).length;
    return {
      nome: '<span class="erp-strong">' + UI.esc(s.name) + '</span>',
      dim: LOTES_UI.mm(s.width_mm) + ' × ' + LOTES_UI.mm(s.height_mm) + ' mm',
      kerf: Number(s.kerf_mm) + ' mm',
      usos: usos + ' cor(es)',
      acao: '<button class="erp-btn-secondary erp-btn-sm" onclick="MAT.editarTamanho(\'' + s.id + '\')">Editar</button>'
    };
  });

  return UI.panel('Materiais e estoque',
    '<div class="erp-muted erp-small" style="margin-bottom:10px">' +
      'O <span class="erp-strong">veio</span> é propriedade do material, não da peça: marcado aqui, toda peça ' +
      'desse material trava a orientação no nesting (comprimento sempre no sentido do veio). ' +
      'Era isso que faltava — antes o veio vinha marcado peça a peça, o que é o mesmo dado repetido 200 vezes.' +
    '</div>' +
    UI.table([
      { key: 'cor', label: 'Material' },
      { key: 'veio', label: 'Veio' },
      { key: 'chapa', label: 'Chapa padrão' },
      { key: 'estoque', label: 'Em estoque', align: 'right' },
      { key: 'local', label: 'Local' },
      { key: 'acao', label: '' }
    ], rows), true) +
  UI.panel('Tamanhos de chapa',
    '<div class="erp-toolbar">' +
      '<button class="erp-btn-secondary erp-btn-sm" onclick="MAT.editarTamanho(null)">+ Novo tamanho</button>' +
      '<span class="erp-muted erp-small">O mesmo cadastro que o portal usa no Plano de Corte do Contractor ' +
      '(<span class="erp-mono">cutting_list_sheet_sizes</span>) — não é uma cópia.</span>' +
    '</div>' +
    UI.table([
      { key: 'nome', label: 'Tamanho' },
      { key: 'dim', label: 'Medida' },
      { key: 'kerf', label: 'Serra (kerf)' },
      { key: 'usos', label: 'Usado por' },
      { key: 'acao', label: '' }
    ], sizeRows), true);
};

MAT.editarMaterial = function (colorId) {
  const c = MAT.colorById(colorId);
  if (!c) return;
  const st = (MAT._d.stock || []).find(function (s) {
    return s.color_id === colorId && s.sheet_size_id === c.default_sheet_size_id;
  });
  const sizeOpts = '<option value="">— sem chapa padrão —</option>' + MAT._d.sizes.map(function (s) {
    return '<option value="' + s.id + '"' + (c.default_sheet_size_id === s.id ? ' selected' : '') + '>' +
      UI.esc(s.name) + ' (' + LOTES_UI.mm(s.width_mm) + ' × ' + LOTES_UI.mm(s.height_mm) + ')</option>';
  }).join('');

  document.getElementById('mat-form').innerHTML = UI.panel('Material — ' + UI.esc(c.name),
    '<div class="erp-grid erp-grid-3">' +
      '<label class="erp-field"><span>Chapa padrão</span><select id="mt-size">' + sizeOpts + '</select></label>' +
      '<label class="erp-field"><span>Em estoque (chapas)</span><input type="number" id="mt-qtd" step="1" value="' +
        (st ? st.quantity : 0) + '"></label>' +
      '<label class="erp-field"><span>Estoque mínimo</span><input type="number" id="mt-min" step="1" min="0" value="' +
        (st ? st.min_quantity : 0) + '"></label>' +
      '<label class="erp-field"><span>Local</span><input type="text" id="mt-loc" value="' +
        UI.esc(st && st.location ? st.location : '') + '" placeholder="Cavalete 1"></label>' +
    '</div>' +
    /* VEIO virou LEITURA aqui (2026-08-16). Ele é cadastro do material, não
       estoque, e passou pra Engenharia → Cadastro de cores. Deixar o checkbox
       nos dois lugares seria a mesma informação com dois donos — e o dia em
       que os dois divergissem, quem cortaria errado era a fábrica. */
    '<div class="erp-note" style="margin:12px 0">Veio: <b>' +
      (c.has_grain ? 'este material TEM veio' : 'sem veio') + '</b> — ' +
      'edite em <a href="#/eng/cores">Engenharia → Cadastro de cores</a>. ' +
      'É propriedade do material, não do estoque.</div>' +
    '<div class="erp-note">Mexer no estoque por aqui grava um lançamento de <b>ajuste</b> no extrato, ' +
      'com a diferença. Pra contar chapa que chegou do fornecedor, prefira o botão <b>Entrada</b> — ' +
      'ele soma em vez de sobrescrever, que é mais difícil de errar.</div>' +
    '<div style="display:flex;gap:8px;margin-top:12px">' +
      '<button onclick="MAT.salvarMaterial(\'' + colorId + '\', this)">Salvar</button>' +
      '<button class="erp-btn-secondary" onclick="MAT.fecharForm()">Cancelar</button>' +
    '</div>');
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

MAT.fecharForm = function () {
  const el = document.getElementById('mat-form');
  if (el) el.innerHTML = '';
};

MAT.salvarMaterial = async function (colorId, btn) {
  const v = function (id) { const el = document.getElementById(id); return el ? el.value : ''; };
  const sizeId = v('mt-size') || null;

  const qtd = Math.round(Number(v('mt-qtd')) || 0);
  const min = Math.round(Number(v('mt-min')) || 0);
  const loc = v('mt-loc').trim() || null;

  LOTES_UI.busy(btn, true, 'Salvando…');
  try {
    /* has_grain NÃO vai mais daqui: quem edita é o Cadastro de cores. Mandar
       o valor da tela junto sobrescreveria com o que estava na hora em que a
       tela abriu — trocar o veio numa aba e salvar estoque na outra
       desfaria a troca sem ninguém ver. */
    await LOTES.saveColorMaterial(colorId, { default_sheet_size_id: sizeId });

    if (sizeId) {
      const antes = (MAT._d.stock || []).find(function (s) {
        return s.color_id === colorId && s.sheet_size_id === sizeId;
      });
      const delta = qtd - (antes ? antes.quantity : 0);
      const linha = await LOTES.saveSheetStock({
        id: antes ? antes.id : null,
        color_id: colorId, sheet_size_id: sizeId,
        quantity: qtd, min_quantity: min, location: loc
      });
      /* Só lança movimento se o saldo mudou de fato — salvar o mínimo ou o
         local não é movimentação de estoque e poluiria o extrato. */
      if (delta !== 0 && linha) {
        await LOTES.addStockMove({
          kind: 'chapa', sheet_stock_id: linha.id, color_id: colorId,
          quantity: delta, reason: 'ajuste', note: 'Ajuste pela tela de Materiais'
        });
      }
    }
    APP.render();
  } catch (err) {
    console.error(err);
    MAT.toast(LOTES.explainError(err), true);
    LOTES_UI.busy(btn, false);
  }
};

MAT.entradaChapa = async function (colorId, sizeId) {
  const txt = prompt('Quantas chapas ENTRARAM?\n\nUse número negativo para tirar do estoque.');
  if (txt === null) return;
  const delta = Math.round(Number(txt.replace(',', '.')));
  if (!delta) { MAT.toast('Informe um número diferente de zero.', true); return; }
  try {
    let linha = (MAT._d.stock || []).find(function (s) { return s.color_id === colorId && s.sheet_size_id === sizeId; });
    if (!linha) {
      linha = await LOTES.saveSheetStock({ color_id: colorId, sheet_size_id: sizeId, quantity: 0, min_quantity: 0 });
    }
    await LOTES.adjustSheetStock(linha, delta, 'entrada_manual', 'Entrada pela tela de Materiais');
    APP.render();
  } catch (err) { console.error(err); MAT.toast(LOTES.explainError(err), true); }
};

MAT.editarTamanho = function (id) {
  const s = id ? MAT.sizeById(id) : { name: '', width_mm: 2750, height_mm: 1830, kerf_mm: 4 };
  if (!s) return;
  document.getElementById('mat-form').innerHTML = UI.panel(id ? 'Editar tamanho de chapa' : 'Novo tamanho de chapa',
    '<div class="erp-grid erp-grid-4">' +
      '<label class="erp-field"><span>Nome</span><input type="text" id="ts-nome" value="' + UI.esc(s.name) + '" placeholder="EGGER 5X9"></label>' +
      '<label class="erp-field"><span>Comprimento (mm)</span><input type="number" id="ts-w" step="1" min="1" value="' + s.width_mm + '"></label>' +
      '<label class="erp-field"><span>Largura (mm)</span><input type="number" id="ts-h" step="1" min="1" value="' + s.height_mm + '"></label>' +
      '<label class="erp-field"><span>Serra / kerf (mm)</span><input type="number" id="ts-kerf" step="0.1" min="0" value="' + s.kerf_mm + '"></label>' +
    '</div>' +
    '<div class="erp-note">O kerf daqui é o padrão do tamanho. O plano de corte usa o kerf do ' +
      '<b>perfil de parâmetros</b> na hora de otimizar — este serve de referência do que a chapa costuma pedir.</div>' +
    '<div style="display:flex;gap:8px;margin-top:12px">' +
      '<button onclick="MAT.salvarTamanho(' + (id ? '\'' + id + '\'' : 'null') + ', this)">Salvar</button>' +
      '<button class="erp-btn-secondary" onclick="MAT.fecharForm()">Cancelar</button>' +
    '</div>');
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

MAT.salvarTamanho = async function (id, btn) {
  const v = function (x) { const el = document.getElementById(x); return el ? el.value : ''; };
  const nome = v('ts-nome').trim();
  if (!nome) { MAT.toast('O tamanho precisa de nome.', true); return; }
  LOTES_UI.busy(btn, true, 'Salvando…');
  try {
    await LOTES.saveSheetSize({
      id: id || undefined, name: nome,
      width_mm: Number(v('ts-w')), height_mm: Number(v('ts-h')), kerf_mm: Number(v('ts-kerf'))
    });
    APP.render();
  } catch (err) { console.error(err); MAT.toast(LOTES.explainError(err), true); LOTES_UI.busy(btn, false); }
};

/* ============================================================
   Aba FITA
   ============================================================ */
MAT.tabFita = function (d) {
  const rows = d.tapes.map(function (t) {
    const c = MAT.colorById(t.color_id);
    const baixo = Number(t.stock_m) <= Number(t.min_stock_m);
    const negativo = Number(t.stock_m) < 0;
    return {
      cor: UI.swatch(c && c.swatch_hex, (c && c.name) || t.name || '—') +
        (t.is_default ? ' ' + UI.pill('padrão', 'erp-pill-ok') : ''),
      medida: Number(t.width_mm) + ' × ' + Number(t.thickness_mm) + ' mm' +
        (t.name ? '<div class="erp-xs erp-muted">' + UI.esc(t.name) + '</div>' : ''),
      estoque: '<span class="erp-strong' + (negativo ? ' erp-pill erp-pill-danger' : '') + '">' +
        Number(t.stock_m).toFixed(1).replace('.', ',') + ' m</span>' +
        '<div class="erp-xs erp-muted">mín ' + Number(t.min_stock_m).toFixed(0) + ' m' +
        (baixo && !negativo ? ' · <b>repor</b>' : '') + '</div>',
      local: t.location ? UI.esc(t.location) : '<span class="erp-muted erp-xs">—</span>',
      forn: t.supplier ? UI.esc(t.supplier) : '<span class="erp-muted erp-xs">—</span>',
      acao: '<button class="erp-btn-ghost erp-btn-sm" onclick="MAT.entradaFita(\'' + t.id + '\')">Entrada</button> ' +
        '<button class="erp-btn-secondary erp-btn-sm" onclick="MAT.editarFita(\'' + t.id + '\')">Editar</button>'
    };
  });

  const semFita = d.colors.filter(function (c) {
    return c.active !== false && !d.tapes.some(function (t) { return t.color_id === c.id; });
  });

  return UI.panel('Fita de borda',
    '<div class="erp-toolbar">' +
      '<button class="erp-btn-secondary erp-btn-sm" onclick="MAT.editarFita(null)">+ Nova fita</button>' +
      '<span class="erp-muted erp-small">Estoque em metros. Salvar um plano de corte baixa automaticamente ' +
        'os metros que o lote consome, na fita <b>padrão</b> daquela cor.</span>' +
    '</div>' +
    UI.table([
      { key: 'cor', label: 'Cor / material' },
      { key: 'medida', label: 'Largura × espessura' },
      { key: 'estoque', label: 'Estoque', align: 'right' },
      { key: 'local', label: 'Local' },
      { key: 'forn', label: 'Fornecedor' },
      { key: 'acao', label: '' }
    ], rows), true) +
    (semFita.length
      ? UI.panel(null, '<div class="erp-note"><b>' + semFita.length + ' cor(es) sem fita cadastrada.</b> ' +
          'O plano de corte dessas cores vai calcular os metros mas não vai conseguir dar baixa — ' +
          'ele avisa na hora de salvar. Cores: ' +
          semFita.slice(0, 12).map(function (c) { return UI.esc(c.name); }).join(', ') +
          (semFita.length > 12 ? '…' : '') + '</div>')
      : '');
};

MAT.editarFita = function (id) {
  const t = id ? (MAT._d.tapes || []).find(function (x) { return x.id === id; })
    : { width_mm: 22, thickness_mm: 0.45, stock_m: 0, min_stock_m: 50, is_default: true };
  if (!t) return;
  const colorOpts = '<option value="">— escolher —</option>' + MAT._d.colors.map(function (c) {
    return '<option value="' + c.id + '"' + (t.color_id === c.id ? ' selected' : '') + '>' + UI.esc(c.name) + '</option>';
  }).join('');

  document.getElementById('mat-form').innerHTML = UI.panel(id ? 'Editar fita' : 'Nova fita',
    '<div class="erp-grid erp-grid-4">' +
      '<label class="erp-field"><span>Cor / material</span><select id="ft-cor">' + colorOpts + '</select></label>' +
      '<label class="erp-field"><span>Descrição (opcional)</span><input type="text" id="ft-nome" value="' +
        UI.esc(t.name || '') + '" placeholder="PVC 0,45 Branco TX"></label>' +
      '<label class="erp-field"><span>Largura (mm)</span><input type="number" id="ft-w" step="0.5" min="1" value="' + t.width_mm + '"></label>' +
      '<label class="erp-field"><span>Espessura (mm)</span><input type="number" id="ft-e" step="0.05" min="0.1" value="' + t.thickness_mm + '"></label>' +
      '<label class="erp-field"><span>Estoque (m)</span><input type="number" id="ft-stock" step="0.1" value="' + t.stock_m + '"></label>' +
      '<label class="erp-field"><span>Mínimo (m)</span><input type="number" id="ft-min" step="1" min="0" value="' + t.min_stock_m + '"></label>' +
      '<label class="erp-field"><span>Fornecedor</span><input type="text" id="ft-forn" value="' + UI.esc(t.supplier || '') + '"></label>' +
      '<label class="erp-field"><span>Local</span><input type="text" id="ft-loc" value="' + UI.esc(t.location || '') + '"></label>' +
    '</div>' +
    '<label style="display:flex;gap:8px;align-items:center;margin:12px 0">' +
      '<input type="checkbox" id="ft-def"' + (t.is_default ? ' checked' : '') + '> ' +
      '<span class="erp-small">Fita <b>padrão</b> desta cor — é dela que o plano de corte tira os metros</span></label>' +
    '<div style="display:flex;gap:8px">' +
      '<button onclick="MAT.salvarFita(' + (id ? '\'' + id + '\'' : 'null') + ', this)">Salvar</button>' +
      (id ? '<button class="erp-btn-ghost" onclick="MAT.excluirFita(\'' + id + '\')">Excluir</button>' : '') +
      '<button class="erp-btn-secondary" onclick="MAT.fecharForm()">Cancelar</button>' +
    '</div>');
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

MAT.salvarFita = async function (id, btn) {
  const v = function (x) { const el = document.getElementById(x); return el ? el.value : ''; };
  const colorId = v('ft-cor');
  if (!colorId) { MAT.toast('Escolha a cor — é por ela que o plano acha a fita.', true); return; }
  LOTES_UI.busy(btn, true, 'Salvando…');
  try {
    const antes = id ? (MAT._d.tapes || []).find(function (x) { return x.id === id; }) : null;
    const novoStock = Math.round(Number(v('ft-stock')) * 100) / 100;
    await LOTES.saveEdgeTape({
      id: id || undefined,
      color_id: colorId,
      name: v('ft-nome').trim() || null,
      width_mm: Number(v('ft-w')), thickness_mm: Number(v('ft-e')),
      stock_m: novoStock, min_stock_m: Number(v('ft-min')) || 0,
      supplier: v('ft-forn').trim() || null, location: v('ft-loc').trim() || null,
      is_default: document.getElementById('ft-def').checked
    });
    const delta = novoStock - (antes ? Number(antes.stock_m) : 0);
    if (delta !== 0 && id) {
      await LOTES.addStockMove({
        kind: 'fita', edge_tape_id: id, color_id: colorId,
        quantity: delta, reason: 'ajuste', note: 'Ajuste pela tela de Materiais'
      });
    }
    APP.render();
  } catch (err) { console.error(err); MAT.toast(LOTES.explainError(err), true); LOTES_UI.busy(btn, false); }
};

MAT.excluirFita = async function (id) {
  if (!confirm('Tirar esta fita da lista? O histórico de movimentação dela continua no extrato.')) return;
  try { await LOTES.deleteEdgeTape(id); APP.render(); }
  catch (err) { MAT.toast(LOTES.explainError(err), true); }
};

MAT.entradaFita = async function (id) {
  const t = (MAT._d.tapes || []).find(function (x) { return x.id === id; });
  if (!t) return;
  const txt = prompt('Quantos METROS entraram?\n\nUse número negativo para tirar do estoque.');
  if (txt === null) return;
  const delta = Math.round(Number(txt.replace(',', '.')) * 100) / 100;
  if (!delta) { MAT.toast('Informe um número diferente de zero.', true); return; }
  try { await LOTES.adjustEdgeTape(t, delta, 'entrada_manual', 'Entrada pela tela de Materiais'); APP.render(); }
  catch (err) { console.error(err); MAT.toast(LOTES.explainError(err), true); }
};

/* ============================================================
   Aba RETALHOS — PLANILHA (2026-11-27)
   ============================================================
   Matt: "uma linha abaixo da outra como se fosse excel... poder editar
   qualquer retalho disponível, ou abrir uma linha nova com retalho novo...
   o veio e a espessura puxam junto com a cor... só aparece os retalhos pra
   uso, os usados ficam em outra aba... clicar no título e a coluna ordena".

   - Aba "Em estoque" (disponível + reservado): cada célula é editável no
     lugar (cor, comprimento, largura, local). Salva ao sair da célula ou
     no Enter. Enter / ↑ ↓ andam na mesma coluna, como planilha.
   - Reservado aparece mas não edita (está preso a um plano).
   - Cor = busca nas cores cadastradas (datalist). VEIO e ESPESSURA não se
     digitam: vêm da cor (colors.has_grain / LOTES.espessuraDaCor).
   - "+ Nova linha" abre uma linha de rascunho no topo; Enter (ou ✓) grava
     com a quantidade escolhida (iguais = linhas separadas, um código cada).
   - Aba "Usados e descartados": só leitura, com "reativar" no descartado.
   - Entrada pelo plano continua automática (o plano grava em erp.offcuts).
   - VEIO: comprimento (width_mm) = sentido do veio, gravado como digitado.
     NUNCA reordenar por maior/menor (ver nota de 16/10). */
MAT.RET_COLS = [
  { k: 'code',   l: 'Código' },
  { k: 'cor',    l: 'Cor' },
  { k: 'veio',   l: 'Veio' },
  { k: 'esp',    l: 'Esp.', n: 1 },
  { k: 'comp',   l: 'Compr. ↕ veio', n: 1, t: 'Comprimento = medida no SENTIDO DO VEIO (as linhas da madeira), mesmo que seja o lado menor.' },
  { k: 'larg',   l: 'Largura', n: 1 },
  { k: 'area',   l: 'm²', n: 1 },
  { k: 'local',  l: 'Local' },
  { k: 'origem', l: 'Origem' },
  { k: 'when',   l: 'Entrada' },
  { k: 'st',     l: 'Status' },
  { k: 'acao',   l: '', ns: 1 }
];

MAT._ret = MAT._ret || { aba: 'estoque', sort: { k: 'when', dir: -1 }, busca: '', novas: [], seq: 0 };

MAT.retCss = function () {
  return '<style id="ret-css">' +
    '.ret-bar{display:flex;align-items:center;gap:12px;margin:0 0 8px;flex-wrap:wrap}' +
    '.ret-seg{display:inline-flex;border:1px solid var(--border);border-radius:8px;overflow:hidden;background:#fff}' +
    '.ret-seg button{background:#fff;color:var(--muted);border:0;border-radius:0;padding:7px 14px;font-size:13px}' +
    '.ret-seg button:hover{background:#f4f2ee;color:var(--text)}' +
    '.ret-seg button+button{border-left:1px solid var(--border)}' +
    '.ret-seg button.on{background:var(--accent);color:#fff;font-weight:600}' +
    '.ret-seg button .n{opacity:.75;font-weight:400;margin-left:6px}' +
    '.ret-bar input[type=search]{max-width:240px;padding:7px 10px}' +
    '.ret-bar .sp{flex:1}' +
    '.ret-kpi{font-size:12px;color:var(--muted)}' +
    '.ret-kpi b{font-size:15px;color:var(--text);font-variant-numeric:tabular-nums;margin-right:4px}' +
    '.ret-hint{font-size:12px;color:var(--muted);margin:0 0 8px}' +
    '.ret-hint b{color:var(--accent-dark)}' +
    '.ret-wrap{background:#fff;border:1px solid var(--border);border-radius:10px;overflow:auto;max-height:calc(100vh - 280px)}' +
    'table.ret-g{border-collapse:separate;border-spacing:0;width:100%;font-size:13px}' +
    'table.ret-g th{position:sticky;top:0;z-index:2;background:#f4f2ee;color:var(--muted);font-size:11px;font-weight:600;' +
      'text-transform:uppercase;letter-spacing:.04em;text-align:left;padding:0;border-bottom:1px solid var(--border);' +
      'border-right:1px solid #e9e5de;white-space:nowrap;user-select:none}' +
    'table.ret-g th>span{display:block;padding:9px 10px;cursor:pointer}' +
    'table.ret-g th>span:hover{color:var(--text);background:#ece8e1}' +
    'table.ret-g th.on>span{color:var(--accent-dark);background:#efe7dc}' +
    'table.ret-g th .ar{display:inline-block;width:10px;margin-left:3px;font-size:9px;font-style:normal}' +
    'table.ret-g th.n{text-align:right}' +
    'table.ret-g td{padding:0;border-bottom:1px solid #efece6;border-right:1px solid #f3f0eb;height:34px;vertical-align:middle;white-space:nowrap}' +
    'table.ret-g td.tx{padding:0 10px}' +
    'table.ret-g td.n{text-align:right;font-variant-numeric:tabular-nums}' +
    'table.ret-g tbody tr:hover td{background:#fbf9f5}' +
    '.ret-c{width:100%;height:33px;border:1px solid transparent;border-radius:0;background:transparent;padding:0 10px;' +
      'font:inherit;color:inherit;box-shadow:none;margin:0}' +
    '.ret-c.n{text-align:right;font-variant-numeric:tabular-nums;min-width:80px}' +
    '.ret-c:hover{border-color:#e2ddd4}' +
    '.ret-c:focus{outline:none;border-color:var(--accent);background:#fff;box-shadow:inset 0 0 0 1px var(--accent)}' +
    '.ret-c.ok{background:#e6f2e9}.ret-c.err{background:#fbe9e5;border-color:var(--danger)}' +
    '.ret-cor{display:flex;align-items:center;padding-left:10px}' +
    '.ret-cor .erp-swatch{flex:none;margin:0}' +
    '.ret-cor .ret-c{padding-left:8px;min-width:170px}' +
    '.ret-veio{display:inline-block;font-size:11px;padding:2px 8px;border-radius:10px;background:#f6ecd9;color:#7a4f12;font-weight:600}' +
    '.ret-liso{font-size:11px;color:#a39b8f}' +
    'tr.ret-new td{background:#fffaf0}' +
    'tr.ret-new td:first-child{box-shadow:inset 3px 0 0 var(--accent)}' +
    'tr.ret-res td{color:var(--muted)}' +
    '.ret-act{display:flex;gap:2px;align-items:center;padding:0 6px;font-size:12px;color:var(--muted)}' +
    '.ret-act button{background:transparent;border:0;color:var(--muted);padding:4px 7px;font-size:12px;border-radius:5px}' +
    '.ret-act button:hover{background:rgba(0,0,0,.06);color:var(--text)}' +
    '.ret-act button.go{background:var(--accent);color:#fff;font-weight:600}' +
    '.ret-act button.go:hover{background:var(--accent-dark)}' +
    '.ret-act .q{width:44px;min-width:0;height:26px;padding:0 6px;font-size:12px;text-align:right;border-color:#e2ddd4;background:#fff}' +
    '.ret-vazio{padding:28px;text-align:center;color:var(--muted)}' +
    '.ret-foot{display:flex;justify-content:space-between;font-size:12px;color:var(--muted);padding:8px 2px}' +
  '</style>';
};

MAT.tabRetalhos = function (d) {
  const cores = (d.colors || []).filter(function (c) { return c.active !== false; });
  return MAT.retCss() +
    '<datalist id="ret-cores">' + cores.map(function (c) {
      return '<option value="' + UI.esc(c.name) + '">';
    }).join('') + '</datalist>' +
    '<div id="ret-root" onclick="MAT.retClick(event)" onchange="MAT.retChange(event)" ' +
      'onkeydown="MAT.retKey(event)" oninput="MAT.retInput(event)">' +
      MAT.retTopo() +
      '<div class="ret-wrap"><table class="ret-g" id="ret-g">' + MAT.retTabela() + '</table></div>' +
      '<div class="ret-foot" id="ret-foot">' + MAT.retRodape() + '</div>' +
    '</div>';
};

MAT.retEstoque = function (o) { return o.status === 'disponivel' || o.status === 'reservado'; };

MAT.retTopo = function () {
  const s = MAT._ret, all = MAT._d.offcuts || [];
  const est = all.filter(MAT.retEstoque);
  const hist = all.length - est.length;
  const area = est.reduce(function (t, o) { return t + (o.width_mm / 1000) * (o.height_mm / 1000); }, 0);
  return '<div class="ret-bar">' +
      '<div class="ret-seg">' +
        '<button data-a="aba" data-v="estoque" class="' + (s.aba === 'estoque' ? 'on' : '') + '">Em estoque<span class="n">' + est.length + '</span></button>' +
        '<button data-a="aba" data-v="hist" class="' + (s.aba === 'hist' ? 'on' : '') + '">Usados e descartados<span class="n">' + hist + '</span></button>' +
      '</div>' +
      '<input type="search" id="ret-busca" placeholder="Buscar cor, código, local…" value="' + UI.esc(s.busca) + '">' +
      '<span class="ret-kpi"><b>' + LOTES_UI.m2(area) + '</b>parados em estoque</span>' +
      '<div class="sp"></div>' +
      (s.aba === 'estoque' ? '<button class="erp-btn erp-btn-sm" data-a="nova">+ Nova linha</button>' : '') +
    '</div>' +
    (s.aba === 'estoque'
      ? '<div class="ret-hint">Clique na célula pra editar · Enter salva e desce · ' +
        '<b>Compr. ↕ veio</b> = medida no sentido das linhas da madeira · veio e espessura vêm da cor · ' +
        'retalho do plano de corte entra sozinho.</div>'
      : '<div class="ret-hint">Histórico — só leitura. Retalho descartado por engano pode ser reativado.</div>');
};

MAT.retFmtEsp = function (v) {
  const n = Number(v) || 0;
  return (Math.round(n * 10) / 10).toLocaleString('pt-BR');
};

MAT.retVal = function (o, k) {
  const c = o.color_id ? MAT.colorById(o.color_id) : null;
  switch (k) {
    case 'code': return o.code || '';
    case 'cor': return (o.color_name || (c && c.name) || '').toLowerCase();
    case 'veio': return c && c.has_grain ? 1 : 0;
    case 'esp': return Number(o.espessura_mm) || 0;
    case 'comp': return Number(o.width_mm) || 0;
    case 'larg': return Number(o.height_mm) || 0;
    case 'area': return (o.width_mm || 0) * (o.height_mm || 0);
    case 'local': return (o.location || '').toLowerCase();
    case 'origem': return o.origin_plan_id ? 1 : 0;
    case 'when': return o.created_at || '';
    case 'st': return o.status || '';
  }
  return '';
};

MAT.retLinhas = function () {
  const s = MAT._ret;
  let rows = (MAT._d.offcuts || []).filter(function (o) {
    return s.aba === 'estoque' ? MAT.retEstoque(o) : !MAT.retEstoque(o);
  });
  const q = s.busca.trim().toLowerCase();
  if (q) rows = rows.filter(function (o) {
    return [o.code, o.color_name, o.location, LOTES_UI.mm(o.width_mm) + '×' + LOTES_UI.mm(o.height_mm)]
      .join(' ').toLowerCase().indexOf(q) >= 0;
  });
  const k = s.sort.k, dir = s.sort.dir;
  rows.sort(function (a, b) {
    const va = MAT.retVal(a, k), vb = MAT.retVal(b, k);
    const r = (typeof va === 'number' && typeof vb === 'number') ? va - vb
      : String(va).localeCompare(String(vb), 'pt-BR', { numeric: true });
    return r * dir || String(b.created_at).localeCompare(String(a.created_at));
  });
  return rows;
};

MAT.retCell = {
  cor: function (o, id, edit) {
    const c = o.color_id ? MAT.colorById(o.color_id) : null;
    const nome = o.color_name || (c && c.name) || '';
    if (!edit) return '<td class="tx">' + UI.swatch(c && c.swatch_hex, nome || '—') + '</td>';
    return '<td><div class="ret-cor"><span class="erp-swatch" style="background:' + UI.esc((c && c.swatch_hex) || '#e5e1da') + '"></span>' +
      '<input class="ret-c" data-f="cor" data-id="' + id + '" list="ret-cores" value="' + UI.esc(nome) + '" placeholder="buscar cor…" autocomplete="off"></div></td>';
  },
  veio: function (o) {
    const c = o.color_id ? MAT.colorById(o.color_id) : null;
    if (!c) return '<td class="tx"><span class="ret-liso">—</span></td>';
    return '<td class="tx">' + (c.has_grain
      ? '<span class="ret-veio" title="Comprimento no sentido do veio">↕ veio</span>'
      : '<span class="ret-liso">liso</span>') + '</td>';
  },
  num: function (v, f, id, edit) {
    if (!edit) return '<td class="tx n">' + (v ? LOTES_UI.mm(v) : '—') + '</td>';
    return '<td><input class="ret-c n" data-f="' + f + '" data-id="' + id + '" inputmode="numeric" value="' +
      (v ? LOTES.mmCorte(Number(v)) : '') + '"></td>';
  },
  local: function (o, id, edit) {
    if (!edit) return '<td class="tx">' + (o.location ? UI.esc(o.location) : '<span class="ret-liso">—</span>') + '</td>';
    return '<td><input class="ret-c" data-f="local" data-id="' + id + '" value="' + UI.esc(o.location || '') + '" placeholder="—"></td>';
  }
};

MAT.retRowHtml = function (o, draft) {
  const C = MAT.retCell;
  const edit = draft || o.status === 'disponivel';
  const id = draft ? 'n:' + o._k : o.id;
  const st = LOTES_UI.OFFCUT_STATUS[o.status] || LOTES_UI.OFFCUT_STATUS.disponivel;
  const area = (o.width_mm && o.height_mm) ? ((o.width_mm / 1000) * (o.height_mm / 1000)).toFixed(2).replace('.', ',') : '';
  let acao;
  if (draft) {
    acao = '<div class="ret-act">× <input class="ret-c q" data-f="qtd" data-id="' + id + '" value="' + (o._qtd || 1) + '" title="Quantos retalhos iguais">' +
      '<button class="go" data-a="gravar" data-id="' + id + '" title="Gravar (Enter)">✓ Gravar</button>' +
      '<button data-a="cancelar" data-id="' + id + '" title="Descartar rascunho">✕</button></div>';
  } else if (o.status === 'disponivel') {
    acao = '<div class="ret-act"><button data-a="dup" data-id="' + o.id + '" title="Nova linha igual a esta">duplicar</button>' +
      '<button data-a="desc" data-id="' + o.id + '">descartar</button></div>';
  } else if (o.status === 'descartado') {
    acao = '<div class="ret-act"><button data-a="reat" data-id="' + o.id + '">reativar</button></div>';
  } else {
    acao = '<div class="ret-act">' + (o.consumed_by_plan_id
      ? '<a class="erp-xs" href="#/planos/' + o.consumed_by_plan_id + '">ver plano</a>' : '') + '</div>';
  }
  return '<tr class="' + (draft ? 'ret-new' : (o.status === 'reservado' ? 'ret-res' : '')) + '" data-row="' + id + '">' +
    '<td class="tx"><span class="erp-mono' + (draft ? ' erp-muted' : ' erp-strong') + '">' + (draft ? 'novo' : UI.esc(o.code || '')) + '</span></td>' +
    C.cor(o, id, edit) +
    C.veio(o) +
    '<td class="tx n">' + (o.espessura_mm ? MAT.retFmtEsp(o.espessura_mm) : '<span class="ret-liso">—</span>') + '</td>' +
    C.num(o.width_mm, 'comp', id, edit) +
    C.num(o.height_mm, 'larg', id, edit) +
    '<td class="tx n erp-muted" data-area="' + id + '">' + area + '</td>' +
    C.local(o, id, edit) +
    '<td class="tx">' + (!draft && o.origin_plan_id
      ? '<a class="erp-xs" href="#/planos/' + o.origin_plan_id + '">plano</a>'
      : '<span class="ret-liso">manual</span>') + '</td>' +
    '<td class="tx">' + (draft ? '<span class="ret-liso">hoje</span>' : UI.date(o.created_at)) + '</td>' +
    '<td class="tx">' + (draft ? '' : UI.pill(st.label, st.pill)) + '</td>' +
    '<td>' + acao + '</td></tr>';
};

MAT.retTabela = function () {
  const s = MAT._ret;
  const head = '<thead><tr>' + MAT.RET_COLS.map(function (c) {
    if (c.ns) return '<th></th>';
    const on = s.sort.k === c.k;
    return '<th class="' + (c.n ? 'n ' : '') + (on ? 'on' : '') + '"' + (c.t ? ' title="' + UI.esc(c.t) + '"' : '') + '>' +
      '<span data-a="sort" data-v="' + c.k + '">' + c.l + '<i class="ar">' + (on ? (s.sort.dir > 0 ? '▲' : '▼') : '') + '</i></span></th>';
  }).join('') + '</tr></thead>';
  let body = '';
  if (s.aba === 'estoque') body += s.novas.map(function (n) { return MAT.retRowHtml(n, true); }).join('');
  body += MAT.retLinhas().map(function (o) { return MAT.retRowHtml(o, false); }).join('');
  if (!body) body = '<tr><td colspan="' + MAT.RET_COLS.length + '" class="ret-vazio">' +
    (s.busca ? 'Nada encontrado pra "' + UI.esc(s.busca) + '".'
      : (s.aba === 'estoque' ? 'Nenhum retalho em estoque. Use “+ Nova linha”.' : 'Nenhum retalho usado ou descartado.')) +
    '</td></tr>';
  return head + '<tbody>' + body + '</tbody>';
};

MAT.retRodape = function () {
  const s = MAT._ret, rows = MAT.retLinhas();
  const area = rows.reduce(function (t, o) { return t + (o.width_mm / 1000) * (o.height_mm / 1000); }, 0);
  const col = MAT.RET_COLS.find(function (c) { return c.k === s.sort.k; }) || {};
  return '<span>' + rows.length + ' retalho(s)' + (s.busca ? ' na busca' : '') + ' · ' + LOTES_UI.m2(area) + '</span>' +
    '<span>Ordenado por ' + col.l + (s.sort.dir > 0 ? ' ▲' : ' ▼') + ' — clique no título da coluna pra trocar</span>';
};

MAT.retDesenha = function () {
  const tb = document.getElementById('ret-g');
  if (!tb) return;
  tb.innerHTML = MAT.retTabela();
  const f = document.getElementById('ret-foot');
  if (f) f.innerHTML = MAT.retRodape();
};

MAT.retTopoRedesenha = function () {
  const root = document.getElementById('ret-root');
  if (!root) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = MAT.retTopo();
  root.querySelector('.ret-bar').replaceWith(tmp.querySelector('.ret-bar'));
  root.querySelector('.ret-hint').replaceWith(tmp.querySelector('.ret-hint'));
};

MAT.retAchar = function (id) {
  if (String(id).indexOf('n:') === 0) {
    const k = Number(String(id).slice(2));
    return MAT._ret.novas.find(function (n) { return n._k === k; }) || null;
  }
  return (MAT._d.offcuts || []).find(function (o) { return o.id === id; }) || null;
};

MAT.retNovaLinha = function (base) {
  const s = MAT._ret;
  const n = { _k: ++s.seq, color_id: null, color_name: '', espessura_mm: null, width_mm: null, height_mm: null, location: '', _qtd: 1 };
  if (base) Object.assign(n, {
    color_id: base.color_id, color_name: base.color_name, espessura_mm: base.espessura_mm,
    width_mm: base.width_mm, height_mm: base.height_mm, location: base.location || ''
  });
  s.novas.unshift(n);
  MAT.retDesenha();
  const el = document.querySelector('[data-id="n:' + n._k + '"][data-f="' + (base ? 'comp' : 'cor') + '"]');
  if (el) { el.focus(); if (el.select) el.select(); }
};

MAT.retClick = async function (ev) {
  const b = ev.target.closest('[data-a]');
  if (!b) return;
  const a = b.dataset.a, s = MAT._ret;
  if (a === 'sort') {
    const k = b.dataset.v;
    s.sort = s.sort.k === k ? { k: k, dir: -s.sort.dir } : { k: k, dir: (k === 'when' || k === 'area') ? -1 : 1 };
    MAT.retDesenha();
  } else if (a === 'aba') {
    s.aba = b.dataset.v; MAT.retTopoRedesenha(); MAT.retDesenha();
  } else if (a === 'nova') {
    MAT.retNovaLinha(null);
  } else if (a === 'dup') {
    MAT.retNovaLinha(MAT.retAchar(b.dataset.id));
  } else if (a === 'cancelar') {
    const k = Number(b.dataset.id.slice(2));
    s.novas = s.novas.filter(function (n) { return n._k !== k; });
    MAT.retDesenha();
  } else if (a === 'gravar') {
    MAT.retGravar(b.dataset.id, b);
  } else if (a === 'desc' || a === 'reat') {
    const o = MAT.retAchar(b.dataset.id);
    if (!o) return;
    if (a === 'desc' && !confirm('Descartar o retalho ' + (o.code || '') + '? Ele sai do estoque (dá pra reativar em "Usados e descartados").')) return;
    const novo = a === 'desc' ? 'descartado' : 'disponivel';
    try { await LOTES.setOffcutStatus(o.id, novo); o.status = novo; MAT.retTopoRedesenha(); MAT.retDesenha(); }
    catch (err) { console.error(err); MAT.toast(LOTES.explainError(err), true); }
  }
};

MAT.retInput = function (ev) {
  const t = ev.target;
  if (t.id === 'ret-busca') { MAT._ret.busca = t.value; MAT.retDesenha(); return; }
  if (t.dataset.f === 'comp' || t.dataset.f === 'larg') {
    // Prévia do m² enquanto digita (só visual).
    const tr = t.closest('tr');
    const w = MAT.retNum(tr.querySelector('[data-f="comp"]').value), h = MAT.retNum(tr.querySelector('[data-f="larg"]').value);
    const cel = tr.querySelector('[data-area]');
    if (cel) cel.textContent = (w > 0 && h > 0) ? ((w / 1000) * (h / 1000)).toFixed(2).replace('.', ',') : '';
  }
};

// Medida inteira (regra de 16/10): 300,2 -> 300, 300,8 -> 301.
MAT.retNum = function (txt) {
  const n = Number(String(txt || '').replace(/\s/g, '').replace(',', '.'));
  return n > 0 ? LOTES.mmCorte(n) : 0;
};

MAT.retCorPorNome = function (nome) {
  const q = String(nome || '').trim().toLowerCase();
  if (!q) return null;
  const cs = (MAT._d.colors || []).filter(function (c) { return c.active !== false; });
  const exata = cs.find(function (c) { return String(c.name).toLowerCase() === q; });
  if (exata) return exata;
  const parc = cs.filter(function (c) { return String(c.name).toLowerCase().indexOf(q) >= 0; });
  return parc.length === 1 ? parc[0] : null;
};

MAT.retFlash = function (el, ok) {
  if (!el) return;
  el.classList.remove('ok', 'err'); void el.offsetWidth;
  el.classList.add(ok ? 'ok' : 'err');
  if (ok) setTimeout(function () { el.classList.remove('ok'); }, 900);
};

/* Muda UM campo. Rascunho: só memória. Retalho gravado: salva na hora. */
MAT.retChange = async function (ev) {
  const t = ev.target, f = t.dataset && t.dataset.f, id = t.dataset && t.dataset.id;
  if (!f || !id) return;
  const o = MAT.retAchar(id);
  if (!o) return;
  const draft = String(id).indexOf('n:') === 0;
  const patch = {};
  if (f === 'cor') {
    const c = MAT.retCorPorNome(t.value);
    if (!c) {
      MAT.retFlash(t, false);
      if (t.value.trim()) MAT.toast('A cor "' + t.value + '" não está cadastrada. Escolha uma da lista.', true);
      t.value = o.color_name || '';
      return;
    }
    patch.color_id = c.id; patch.color_name = c.name;
    patch.espessura_mm = LOTES.espessuraDaCor(c);   // espessura vem da cor
  } else if (f === 'comp' || f === 'larg') {
    const campo = f === 'comp' ? 'width_mm' : 'height_mm';
    const n = MAT.retNum(t.value);
    if (!n && !draft) { MAT.retFlash(t, false); t.value = LOTES.mmCorte(Number(o[campo])); return; }
    if (!draft && n === LOTES.mmCorte(Number(o[campo]))) return;
    patch[campo] = n || null;
  } else if (f === 'local') {
    patch.location = t.value.trim() || null;
    if (!draft && (patch.location || null) === (o.location || null)) return;
  } else if (f === 'qtd') {
    o._qtd = Math.max(1, Math.min(50, Math.round(Number(t.value)) || 1)); t.value = o._qtd; return;
  }
  if (draft) {
    Object.assign(o, patch);
    if (f === 'cor') MAT.retRedesenhaLinha(id, 'comp');
    return;
  }
  if (f === 'cor' && patch.color_id === o.color_id) return;
  try {
    await LOTES.saveOffcut(Object.assign({ id: o.id }, patch));
    Object.assign(o, patch);
    if (f === 'cor') MAT.retRedesenhaLinha(id, null, true);
    else MAT.retFlash(t, true);
  } catch (err) { console.error(err); MAT.retFlash(t, false); MAT.toast(LOTES.explainError(err), true); }
};

/* Troca só a linha (cor nova muda bolinha, veio e espessura) sem perder o foco da planilha. */
MAT.retRedesenhaLinha = function (id, focoCampo, flashCor) {
  const tr = document.querySelector('tr[data-row="' + id + '"]');
  const o = MAT.retAchar(id);
  if (!tr || !o) return;
  const tmp = document.createElement('tbody');
  tmp.innerHTML = MAT.retRowHtml(o, String(id).indexOf('n:') === 0);
  const nova = tmp.firstChild;
  tr.replaceWith(nova);
  if (flashCor) MAT.retFlash(nova.querySelector('[data-f="cor"]'), true);
  if (focoCampo) { const el = nova.querySelector('[data-f="' + focoCampo + '"]'); if (el) { el.focus(); if (el.select) el.select(); } }
};

MAT.retGravar = async function (id, btn) {
  const o = MAT.retAchar(id);
  if (!o) return;
  const tr = document.querySelector('tr[data-row="' + id + '"]');
  // Pega o que está digitado mesmo sem ter saído da célula.
  if (tr) {
    const v = function (f) { const el = tr.querySelector('[data-f="' + f + '"]'); return el ? el.value : ''; };
    const c = MAT.retCorPorNome(v('cor'));
    if (c) { o.color_id = c.id; o.color_name = c.name; o.espessura_mm = LOTES.espessuraDaCor(c); }
    o.width_mm = MAT.retNum(v('comp')) || null;
    o.height_mm = MAT.retNum(v('larg')) || null;
    o.location = v('local').trim();
    o._qtd = Math.max(1, Math.min(50, Math.round(Number(v('qtd'))) || 1));
  }
  const falta = !o.color_id ? 'cor' : !(o.width_mm > 0) ? 'comp' : !(o.height_mm > 0) ? 'larg' : null;
  if (falta) {
    const el = tr && tr.querySelector('[data-f="' + falta + '"]');
    MAT.retFlash(el, false); if (el) el.focus();
    MAT.toast(falta === 'cor' ? 'Escolha a cor — o plano procura retalho por cor e espessura.' : 'Preencha comprimento e largura.', true);
    return;
  }
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  try {
    /* Iguais = LINHAS separadas (cada pedaço é uma peça física com código
       e local próprios; o nesting encaixa um de cada vez). */
    for (let i = 0; i < o._qtd; i++) {
      await LOTES.saveOffcut({
        color_id: o.color_id, color_name: o.color_name, espessura_mm: o.espessura_mm,
        // Como digitado: comprimento = sentido do veio. NUNCA reordenar.
        width_mm: o.width_mm, height_mm: o.height_mm,
        location: o.location || null, status: 'disponivel', notes: 'Entrada manual'
      });
    }
    MAT._ret.novas = MAT._ret.novas.filter(function (n) { return n._k !== o._k; });
    MAT._d.offcuts = await LOTES.offcuts();
    MAT.retTopoRedesenha(); MAT.retDesenha();
    MAT.toast(o._qtd > 1 ? o._qtd + ' retalhos gravados.' : 'Retalho gravado.');
  } catch (err) {
    console.error(err); MAT.toast(LOTES.explainError(err), true);
    if (btn) { btn.disabled = false; btn.textContent = '✓ Gravar'; }
  }
};

/* Teclado de planilha: Enter = confirma e desce (no rascunho, grava);
   ↑ ↓ = mesma coluna na linha de cima/baixo; Esc = desfaz a célula. */
MAT.retKey = function (ev) {
  const t = ev.target, f = t.dataset && t.dataset.f, id = t.dataset && t.dataset.id;
  if (!f) return;
  const draft = String(id).indexOf('n:') === 0;
  if (ev.key === 'Enter' && draft) { ev.preventDefault(); MAT.retGravar(id, null); return; }
  if (ev.key === 'Escape') {
    const o = MAT.retAchar(id);
    if (o && !draft) {
      t.value = f === 'cor' ? (o.color_name || '') : f === 'comp' ? LOTES.mmCorte(o.width_mm)
        : f === 'larg' ? LOTES.mmCorte(o.height_mm) : (o.location || '');
    }
    t.blur(); return;
  }
  // No campo de cor, ↑ ↓ são da lista de sugestões.
  const mover = ev.key === 'Enter' ? 1 : (ev.key === 'ArrowDown' && f !== 'cor') ? 1 : (ev.key === 'ArrowUp' && f !== 'cor') ? -1 : 0;
  if (!mover) return;
  ev.preventDefault();
  const cels = Array.prototype.slice.call(document.querySelectorAll('#ret-g [data-f="' + f + '"]'));
  const prox = cels[cels.indexOf(t) + mover];
  t.blur();   // dispara o change (salva)
  if (prox) { prox.focus(); if (prox.select) prox.select(); }
};

/* ============================================================
   Aba EXTRATO
   ============================================================ */
MAT.KIND = { chapa: 'Chapa', fita: 'Fita', retalho: 'Retalho' };
MAT.REASON = {
  plano: { label: 'Plano de corte', pill: 'erp-pill-accent' },
  estorno_plano: { label: 'Estorno de plano', pill: 'erp-pill-warn' },
  entrada_manual: { label: 'Entrada manual', pill: 'erp-pill-ok' },
  ajuste: { label: 'Ajuste', pill: 'erp-pill-neutral' },
  descarte: { label: 'Descarte', pill: 'erp-pill-danger' },
  inventario: { label: 'Inventário', pill: 'erp-pill-info' }
};

MAT.tabExtrato = function (d) {
  const rows = d.moves.map(function (m) {
    const c = m.color_id ? MAT.colorById(m.color_id) : null;
    const r = MAT.REASON[m.reason] || { label: m.reason, pill: 'erp-pill-neutral' };
    const un = m.kind === 'fita' ? ' m' : ' un';
    const q = Number(m.quantity);
    return {
      when: UI.date(m.created_at) +
        '<div class="erp-xs erp-muted">' + String(m.created_at).slice(11, 16) + '</div>',
      kind: MAT.KIND[m.kind] || m.kind,
      cor: c ? UI.swatch(c.swatch_hex, c.name) : '<span class="erp-muted erp-xs">—</span>',
      qtd: '<span class="erp-strong" style="color:' + (q < 0 ? '#b3261e' : '#2f6b3d') + '">' +
        (q > 0 ? '+' : '') + q.toFixed(m.kind === 'fita' ? 2 : 0).replace('.', ',') + un + '</span>',
      motivo: UI.pill(r.label, r.pill) +
        (m.plan_id ? ' <a class="erp-xs" href="#/planos/' + m.plan_id + '">ver plano</a>' : ''),
      note: m.note ? '<span class="erp-small erp-muted">' + UI.esc(m.note) + '</span>' : '—'
    };
  });

  return UI.panel('Últimas movimentações',
    '<div class="erp-muted erp-small" style="margin-bottom:10px">Toda mudança de saldo passa por aqui. ' +
      'É o que permite responder "cadê as 12 chapas?" — e é o que torna seguro apagar um plano, ' +
      'porque o estorno lê exatamente o que aquele plano consumiu em vez de recalcular.</div>' +
    UI.table([
      { key: 'when', label: 'Quando' },
      { key: 'kind', label: 'Tipo' },
      { key: 'cor', label: 'Material' },
      { key: 'qtd', label: 'Quantidade', align: 'right' },
      { key: 'motivo', label: 'Motivo' },
      { key: 'note', label: 'Observação' }
    ], rows), true);
};
