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
  return { colors: colors, sizes: sizes, stock: stock, tapes: tapes, offcuts: offcuts, moves: moves };
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
   Aba RETALHOS
   ============================================================
   Mesma tabela que o nesting consome. A entrada manual serve pra sobra que já
   existe na fábrica hoje e nunca passou por um plano daqui. */
MAT.tabRetalhos = function (d) {
  const disponiveis = d.offcuts.filter(function (o) { return o.status === 'disponivel'; });
  const area = disponiveis.reduce(function (s, o) { return s + (o.width_mm / 1000) * (o.height_mm / 1000); }, 0);

  const rows = d.offcuts.map(function (o) {
    const st = LOTES_UI.OFFCUT_STATUS[o.status] || LOTES_UI.OFFCUT_STATUS.disponivel;
    const c = MAT.colorById(o.color_id);
    return {
      code: '<span class="erp-mono erp-strong">' + UI.esc(o.code) + '</span>',
      cor: UI.swatch(c && c.swatch_hex, o.color_name || (c && c.name) || '—'),
      esp: LOTES_UI.mm(o.espessura_mm) + ' mm',
      dim: '<span class="erp-strong">' + LOTES_UI.mm(o.width_mm) + ' × ' + LOTES_UI.mm(o.height_mm) + '</span> mm' +
        '<div class="erp-xs erp-muted">' + ((o.width_mm / 1000) * (o.height_mm / 1000)).toFixed(2).replace('.', ',') + ' m²</div>',
      local: o.location ? UI.esc(o.location) : '<span class="erp-muted erp-xs">sem local</span>',
      origem: o.origin_plan_id
        ? '<a class="erp-xs" href="#/planos/' + o.origin_plan_id + '">plano</a>'
        : '<span class="erp-xs erp-muted">manual</span>',
      when: UI.date(o.created_at),
      status: UI.pill(st.label, st.pill),
      acao: (o.status === 'disponivel'
        ? '<button class="erp-btn-ghost erp-btn-sm" onclick="LOTES_UI.mudarRetalho(\'' + o.id + '\',\'descartado\')">descartar</button>'
        : (o.status === 'descartado'
          ? '<button class="erp-btn-ghost erp-btn-sm" onclick="LOTES_UI.mudarRetalho(\'' + o.id + '\',\'disponivel\')">reativar</button>'
          : '<span class="erp-xs erp-muted">' + (o.consumed_by_plan_id
            ? '<a href="#/planos/' + o.consumed_by_plan_id + '">usado no plano</a>' : '—') + '</span>')) +
        ' <button class="erp-btn-ghost erp-btn-sm" onclick="LOTES_UI.editarLocal(\'' + o.id + '\')">local</button>'
    };
  });

  const colorOpts = '<option value="">— cor —</option>' + d.colors.map(function (c) {
    return '<option value="' + c.id + '">' + UI.esc(c.name) + '</option>';
  }).join('');

  return '<div class="erp-grid erp-grid-4" style="margin-bottom:16px">' +
      UI.kpi('Disponíveis', disponiveis.length, 'prontos pra usar') +
      UI.kpi('Área parada', LOTES_UI.m2(area), 'chapa que não precisa comprar') +
      UI.kpi('Consumidos', d.offcuts.filter(function (o) { return o.status === 'consumido'; }).length, 'baixados por plano') +
      UI.kpi('Descartados', d.offcuts.filter(function (o) { return o.status === 'descartado'; }).length, 'tirados do estoque') +
    '</div>' +
    UI.panel('Entrada manual de retalho',
      '<div class="erp-muted erp-small" style="margin-bottom:10px">Pra sobra que já está na prateleira e nunca passou por um plano daqui.</div>' +
      '<div class="erp-grid erp-grid-4">' +
        '<label class="erp-field"><span>Cor</span><select id="ret-cor">' + colorOpts + '</select></label>' +
        '<label class="erp-field"><span>Espessura (mm)</span><input type="number" id="ret-esp" value="18" step="0.1" min="1"></label>' +
        '<label class="erp-field"><span>Comprimento (mm)</span><input type="number" id="ret-w" step="1" min="1"></label>' +
        '<label class="erp-field"><span>Largura (mm)</span><input type="number" id="ret-h" step="1" min="1"></label>' +
        '<label class="erp-field"><span>Local</span><input type="text" id="ret-loc" placeholder="Cavalete 3"></label>' +
        '<label class="erp-field"><span>Quantidade iguais</span><input type="number" id="ret-qtd" value="1" step="1" min="1"></label>' +
      '</div>' +
      '<button class="erp-btn-secondary erp-btn-sm" style="margin-top:10px" onclick="MAT.cadastrarRetalho(this)">Cadastrar</button>', false) +
    UI.panel('Estoque de retalhos',
      UI.table([
        { key: 'code', label: 'Código' },
        { key: 'cor', label: 'Cor' },
        { key: 'esp', label: 'Esp.' },
        { key: 'dim', label: 'Medida' },
        { key: 'local', label: 'Local' },
        { key: 'origem', label: 'Origem' },
        { key: 'when', label: 'Entrada' },
        { key: 'status', label: 'Status' },
        { key: 'acao', label: '' }
      ], rows), true);
};

MAT.cadastrarRetalho = async function (btn) {
  const v = function (id) { const el = document.getElementById(id); return el ? el.value : ''; };
  const w = Number(v('ret-w')), h = Number(v('ret-h')), esp = Number(v('ret-esp'));
  const colorId = v('ret-cor');
  const qtd = Math.max(1, Math.round(Number(v('ret-qtd'))) || 1);
  if (!colorId) { MAT.toast('Escolha a cor — o nesting procura retalho por cor e espessura.', true); return; }
  if (!(w > 0) || !(h > 0) || !(esp > 0)) { MAT.toast('Preencha as medidas.', true); return; }
  const color = MAT.colorById(colorId);
  LOTES_UI.busy(btn, true, 'Cadastrando…');
  try {
    /* Retalhos iguais viram LINHAS separadas, não uma linha com quantidade:
       cada pedaço é uma peça física com código e localização próprios, e o
       nesting encaixa em um de cada vez. */
    for (let i = 0; i < qtd; i++) {
      await LOTES.saveOffcut({
        color_id: colorId, color_name: color ? color.name : null,
        espessura_mm: esp,
        width_mm: Math.max(w, h), height_mm: Math.min(w, h),
        location: v('ret-loc') || null, status: 'disponivel',
        notes: 'Entrada manual'
      });
    }
    APP.render();
  } catch (err) { console.error(err); MAT.toast(LOTES.explainError(err), true); LOTES_UI.busy(btn, false); }
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
