/* Legno ERP — PDFs de retalho do plano de corte
 *
 * Pedido do Matt (22/09-15), na tela do plano ("Enviar para a máquina"):
 *   1) "um pdf com os retalhos que preciso pegar, separados por chapa e na
 *      ordem de utilização"  -> RETALHOS_PDF.pegar(planId)
 *   2) "um [relatório] de conferência dos retalhos que vão entrar no
 *      estoque depois de cortado o material" -> RETALHOS_PDF.conferencia(planId)
 *   3) (22/09-16) "separação de chapas, só chapas inteiras a serem separadas
 *      pro plano" -> RETALHOS_PDF.chapas(planId)
 *
 * Os dois saem do plano SALVO (erp.cut_plan_sheets + erp.offcuts):
 *   - a pegar: chapas com source='retalho', na ordem de index_no (= ordem em
 *     que a máquina corta), com o código RET- do estoque, medida, local e um
 *     código de barras Code 39 pra dar baixa com leitor;
 *   - conferência: linhas de erp.offcuts com origin_plan_id = plano (as
 *     sobras que o plano cadastrou ao salvar, medida limpa), por chapa de
 *     origem, com caixa pra marcar, campo de medida real e observação.
 *
 * jsPDF: o ERP não carregava; aqui carrega sob demanda do cdnjs (mesma
 * versão que o Portal usa, 2.5.1). Tabela desenhada na mão — sem autotable,
 * uma dependência a menos. Código de barras vem de BARCODE.rects (o mesmo
 * das etiquetas .emf), desenhado em mm direto na página.
 */

const RETALHOS_PDF = {};

RETALHOS_PDF._jsPDF = async function () {
  if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
  await new Promise(function (resolve, reject) {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload = resolve;
    s.onerror = function () { reject(new Error('Não consegui carregar o gerador de PDF (jsPDF). Sem internet?')); };
    document.head.appendChild(s);
  });
  return window.jspdf.jsPDF;
};

RETALHOS_PDF._carregar = async function (planId) {
  const plan = await LOTES.plan(planId);
  if (!plan) throw new Error('Plano não encontrado.');
  const { data, error } = await LOTES.erp().from('offcuts')
    .select('id, code, color_name, espessura_mm, width_mm, height_mm, location, status, origin_sheet_id, consumed_by_plan_id, origin_plan_id')
    .or('consumed_by_plan_id.eq.' + planId + ',origin_plan_id.eq.' + planId);
  if (error) throw error;
  plan._ocUsados = (data || []).filter(function (o) { return o.consumed_by_plan_id === planId; });
  plan._ocGerados = (data || []).filter(function (o) { return o.origin_plan_id === planId; });
  return plan;
};

RETALHOS_PDF._mm = function (v) { return LOTES_UI.mm(v); };
RETALHOS_PDF._medida = function (w, h) { return RETALHOS_PDF._mm(w) + ' × ' + RETALHOS_PDF._mm(h) + ' mm'; };
RETALHOS_PDF._material = function (cor, esp) {
  const e = Number(esp);
  return (cor || '') + (isFinite(e) && e > 0 ? ' · ' + String(e).replace('.', ',') + ' mm' : '');
};
RETALHOS_PDF._nomeArquivo = function (plan, sufixo) {
  const codeBatch = (plan._batch && plan._batch.code) || plan.batch_id;
  return ('Lote_' + codeBatch + '_v' + plan.version + '_' + sufixo + '.pdf').replace(/[\\/:*?"<>|]/g, '');
};

/* ---- tabela genérica: colunas {key,label,w,align,bold?}, linhas por
   função de células; repete cabeçalho a cada página. ---- */
RETALHOS_PDF._Doc = function (jsPDF, titulo, plan, subtitulo) {
  this.doc = new jsPDF({ unit: 'mm', format: 'a4' });
  this.titulo = titulo;
  this.subtitulo = subtitulo;
  this.plan = plan;
  this.pagina = 0;
  this.y = 0;
  this.margem = 12;
  this.largura = 210 - 2 * this.margem;
  this.fim = 297 - 14;
};
RETALHOS_PDF._Doc.prototype.novaPagina = function () {
  const d = this.doc;
  if (this.pagina > 0) d.addPage();
  this.pagina++;
  const plan = this.plan;
  const codeBatch = (plan._batch && plan._batch.code) || '';
  d.setFont('helvetica', 'bold'); d.setFontSize(15); d.setTextColor(30);
  d.text(this.titulo, this.margem, 16);
  d.setFont('helvetica', 'normal'); d.setFontSize(9); d.setTextColor(90);
  d.text('Lote ' + codeBatch + ' · Plano ' + (plan.code || '') + ' v' + plan.version +
    ' · gerado ' + MAQUINA_EXPORT._dataBR(plan.created_at) + ' · impresso ' + MAQUINA_EXPORT._dataBR(), this.margem, 21.5);
  let yTop = 24;
  if (this.subtitulo) {
    const ls = d.splitTextToSize(this.subtitulo, this.largura);
    d.text(ls, this.margem, 26);
    yTop = 26 + (ls.length - 1) * 4;
  }
  d.setDrawColor(200); d.line(this.margem, yTop + 2.5, 210 - this.margem, yTop + 2.5);
  d.setFontSize(8); d.setTextColor(150);
  d.text('Legno Home · página ' + this.pagina, 210 - this.margem, 292, { align: 'right' });
  d.setTextColor(30);
  this.y = yTop + 7;
};
RETALHOS_PDF._Doc.prototype.cabecalho = function (cols) {
  const d = this.doc;
  d.setFillColor(238, 235, 228); d.rect(this.margem, this.y, this.largura, 7, 'F');
  d.setFont('helvetica', 'bold'); d.setFontSize(8); d.setTextColor(60);
  let x = this.margem;
  cols.forEach(function (c) {
    d.text(c.label, c.align === 'center' ? x + c.w / 2 : (c.align === 'right' ? x + c.w - 1.5 : x + 1.5), this.y + 4.8, { align: c.align || 'left' });
    x += c.w;
  }, this);
  this.y += 7;
  d.setTextColor(30);
};
RETALHOS_PDF._Doc.prototype.secao = function (texto, cols) {
  if (this.y + 20 > this.fim) { this.novaPagina(); }
  const d = this.doc;
  this.y += 2.5;
  d.setFont('helvetica', 'bold'); d.setFontSize(10); d.setTextColor(30);
  d.text(texto, this.margem, this.y + 4);
  this.y += 6.5;
  this.cabecalho(cols);
};
RETALHOS_PDF._Doc.prototype.barcode = function (valor, x, y, largMax) {
  const bc = BARCODE.rects(valor, { height: 6, narrow: 0.22, ratio: 2.6 });
  const escala = bc.totalWidth > largMax ? largMax / bc.totalWidth : 1;
  const d = this.doc;
  d.setFillColor(0);
  bc.rects.forEach(function (r) { d.rect(x + r.x * escala, y + r.y, r.w * escala, r.h, 'F'); });
  return bc.totalWidth * escala;
};
/* linha: cells = [{text, bold?, size?, sub?, barcode?, box?}] alinhado a cols */
RETALHOS_PDF._Doc.prototype.linha = function (cols, cells, altura, cabecalhoSeQuebrar) {
  if (this.y + altura > this.fim) { this.novaPagina(); if (cabecalhoSeQuebrar) this.cabecalho(cols); }
  const d = this.doc;
  d.setDrawColor(215); d.line(this.margem, this.y + altura, 210 - this.margem, this.y + altura);
  let x = this.margem;
  cols.forEach(function (c, i) {
    const cell = cells[i] || {};
    const tx = c.align === 'center' ? x + c.w / 2 : (c.align === 'right' ? x + c.w - 1.5 : x + 1.5);
    if (cell.box) {
      d.setDrawColor(90); d.setLineWidth(0.3);
      d.rect(x + c.w / 2 - 2.5, this.y + altura / 2 - 2.5, 5, 5);
      d.setLineWidth(0.2);
    } else if (cell.blank) {
      d.setDrawColor(170); d.line(x + 2, this.y + altura - 3, x + c.w - 2, this.y + altura - 3);
    } else {
      d.setFont('helvetica', cell.bold ? 'bold' : 'normal');
      d.setFontSize(cell.size || 9);
      d.setTextColor(cell.muted ? 120 : 30);
      const txt = String(cell.text == null ? '' : cell.text);
      const linhas = d.splitTextToSize(txt, c.w - 3);
      const baseY = cell.barcode ? this.y + 4.5 : (cell.sub ? this.y + 4.8 : this.y + altura / 2 + 1.2);
      d.text(linhas.slice(0, 2), tx, baseY, { align: c.align || 'left' });
      if (cell.sub) {
        d.setFont('helvetica', 'normal'); d.setFontSize(7.5); d.setTextColor(110);
        d.text(String(cell.sub), tx, baseY + 4, { align: c.align || 'left' });
      }
      if (cell.barcode) this.barcode(cell.barcode, x + 1.5, this.y + 6.5, c.w - 3);
    }
    x += c.w;
  }, this);
  d.setTextColor(30);
  this.y += altura;
};
RETALHOS_PDF._Doc.prototype.rodape = function (linhas) {
  if (this.y + 6 * linhas.length + 6 > this.fim) this.novaPagina();
  const d = this.doc;
  this.y += 4;
  d.setFont('helvetica', 'normal'); d.setFontSize(9); d.setTextColor(60);
  linhas.forEach(function (t) {
    const ls = d.splitTextToSize(String(t), this.largura);
    d.text(ls, this.margem, this.y + 4); this.y += 5.5 * ls.length;
  }, this);
  d.setTextColor(30);
};

/* ============================================================
   1) Retalhos a PEGAR — na ordem em que a máquina vai usar
   ============================================================ */
RETALHOS_PDF.pegar = async function (planId, btn) {
  if (btn) LOTES_UI.busy(btn, true, 'Gerando PDF…');
  try {
    const jsPDF = await RETALHOS_PDF._jsPDF();
    const plan = await RETALHOS_PDF._carregar(planId);
    const usadosPorId = {};
    plan._ocUsados.forEach(function (o) { usadosPorId[o.id] = o; });
    const machineNo = LOTES.sheetMachineNo(plan);

    const sheets = plan._sheets.slice().sort(function (a, b) { return a.index_no - b.index_no; })
      .filter(function (s) { return s.source === 'retalho'; });
    if (!sheets.length) { LOTES_UI.toast('Este plano não usa retalho nenhum do estoque.', true); return; }

    const D = new RETALHOS_PDF._Doc(jsPDF, 'RETALHOS A PEGAR', plan,
      sheets.length + ' retalho(s) do estoque, na ordem em que entram na máquina. Marque ao separar; o código de barras dá baixa com o leitor.');
    D.novaPagina();
    const cols = [
      { label: 'Chapa', w: 17, align: 'center' },
      { label: 'Código do estoque', w: 42 },
      { label: 'Material', w: 40 },
      { label: 'Medida', w: 34 },
      { label: 'Local', w: 23 },
      { label: 'Peças', w: 14, align: 'center' },
      { label: 'Pego', w: 16, align: 'center' }
    ];
    D.cabecalho(cols);
    let areaM2 = 0, pecas = 0;
    sheets.forEach(function (s) {
      const oc = (s.offcut_id && usadosPorId[s.offcut_id]) || null;
      const codigo = oc ? oc.code : 'retalho';
      const local = oc && oc.location ? oc.location : '—';
      const n = (s._pieces || []).length;
      areaM2 += Number(s.width_mm) * Number(s.height_mm) / 1e6; pecas += n;
      D.linha(cols, [
        { text: 'Chapa ' + (machineNo[s.id] ? machineNo[s.id].n : s.index_no), bold: true, size: 9, sub: '#' + s.index_no + ' no plano' },
        { text: codigo, bold: true, size: 10, barcode: oc ? oc.code : null },
        { text: RETALHOS_PDF._material(s.color_name, s.espessura_mm) },
        { text: RETALHOS_PDF._medida(s.width_mm, s.height_mm), bold: true },
        { text: local, muted: local === '—' },
        { text: String(n) },
        { box: true }
      ], 15, true);
    });
    D.rodape([
      'Total: ' + sheets.length + ' retalho(s) · ' + areaM2.toFixed(2).replace('.', ',') + ' m2 · ' + pecas + ' peça(s) saem deles.',
      'Se um retalho não estiver no local indicado ou a medida não bater, NÃO corte a chapa dele — avise antes de mandar o plano pra máquina.'
    ]);
    D.doc.save(RETALHOS_PDF._nomeArquivo(plan, 'retalhos_a_pegar'));
    LOTES_UI.toast('PDF gerado: ' + sheets.length + ' retalho(s) a pegar.');
  } catch (err) {
    console.error(err);
    LOTES_UI.toast('Erro ao gerar o PDF: ' + (err.message || err), true);
  } finally {
    if (btn) LOTES_UI.busy(btn, false);
  }
};

/* ============================================================
   3) SEPARAÇÃO DE CHAPAS — só chapa inteira, por material
   ============================================================
   Pedido do Matt (22/09-16): "um outro pdf com separação de chapas, só
   chapas inteiras a serem separadas pro plano". Agrupa as chapas novas
   (source='chapa_nova') por material + tamanho e mostra a quantidade a
   separar; a lista de "Chapa N" de cada grupo diz em que ordem entram. */
RETALHOS_PDF.chapas = async function (planId, btn) {
  if (btn) LOTES_UI.busy(btn, true, 'Gerando PDF…');
  try {
    const jsPDF = await RETALHOS_PDF._jsPDF();
    const plan = await LOTES.plan(planId);
    if (!plan) throw new Error('Plano não encontrado.');
    const sheets = plan._sheets.slice().sort(function (a, b) { return a.index_no - b.index_no; })
      .filter(function (s) { return s.source !== 'retalho'; });
    if (!sheets.length) { LOTES_UI.toast('Este plano não usa chapa inteira nenhuma — só retalho.', true); return; }

    const machineNo = LOTES.sheetMachineNo(plan);
    const grupos = {};
    const ordem = [];
    sheets.forEach(function (s) {
      const k = [s.color_name || '', s.espessura_mm, s.sheet_size_name || '', Math.round(s.width_mm), Math.round(s.height_mm)].join('|');
      if (!grupos[k]) { grupos[k] = { sheet: s, n: 0, idx: [] }; ordem.push(k); }
      grupos[k].n++; grupos[k].idx.push(machineNo[s.id] ? machineNo[s.id].n : s.index_no);
    });
    // Mesmo material junto, mais espesso primeiro.
    ordem.sort(function (a, b) {
      const ga = grupos[a].sheet, gb = grupos[b].sheet;
      const c = String(ga.color_name || '').localeCompare(String(gb.color_name || ''));
      if (c) return c;
      return Number(gb.espessura_mm) - Number(ga.espessura_mm);
    });
    function faixas(idx) {
      const out = []; let ini = idx[0], fim = idx[0];
      for (let i = 1; i <= idx.length; i++) {
        if (i < idx.length && idx[i] === fim + 1) { fim = idx[i]; continue; }
        out.push(ini === fim ? String(ini) : ini + '–' + fim);
        if (i < idx.length) { ini = idx[i]; fim = idx[i]; }
      }
      return out.join(', ');
    }

    const D = new RETALHOS_PDF._Doc(jsPDF, 'SEPARAÇÃO DE CHAPAS', plan,
      sheets.length + ' chapa(s) inteira(s) pro plano, por material. Retalhos do estoque NÃO estão aqui — saem no PDF "Retalhos a pegar".');
    D.novaPagina();
    const cols = [
      { label: 'Material', w: 52 },
      { label: 'Chapa', w: 52 },
      { label: 'Qtd', w: 20, align: 'center' },
      { label: 'Nº da chapa na máquina', w: 44 },
      { label: 'Separado', w: 18, align: 'center' }
    ];
    D.cabecalho(cols);
    let areaM2 = 0;
    ordem.forEach(function (k) {
      const g = grupos[k], s = g.sheet;
      areaM2 += g.n * Number(s.width_mm) * Number(s.height_mm) / 1e6;
      D.linha(cols, [
        { text: RETALHOS_PDF._material(s.color_name, s.espessura_mm), bold: true, size: 10 },
        { text: (s.sheet_size_name ? s.sheet_size_name + ' — ' : '') + RETALHOS_PDF._medida(s.width_mm, s.height_mm) },
        { text: String(g.n), bold: true, size: 14 },
        { text: faixas(g.idx), size: 8.5 },
        { box: true }
      ], 12, true);
    });
    D.rodape([
      'Total: ' + sheets.length + ' chapa(s) · ' + areaM2.toFixed(2).replace('.', ',') + ' m2 · ' + ordem.length + ' material(is)/tamanho(s).',
      'Confira cor e espessura na etiqueta do fabricante antes de separar. Chapa empenada ou lascada na borda: troca antes de entrar na máquina.'
    ]);
    D.doc.save(RETALHOS_PDF._nomeArquivo(plan, 'separacao_chapas'));
    LOTES_UI.toast('PDF gerado: ' + sheets.length + ' chapa(s) inteira(s) a separar.');
  } catch (err) {
    console.error(err);
    LOTES_UI.toast('Erro ao gerar o PDF: ' + (err.message || err), true);
  } finally {
    if (btn) LOTES_UI.busy(btn, false);
  }
};

/* ============================================================
   2) CONFERÊNCIA — sobras que entram no estoque depois do corte
   ============================================================ */
RETALHOS_PDF.conferencia = async function (planId, btn) {
  if (btn) LOTES_UI.busy(btn, true, 'Gerando PDF…');
  try {
    const jsPDF = await RETALHOS_PDF._jsPDF();
    const plan = await RETALHOS_PDF._carregar(planId);
    const sheets = plan._sheets.slice().sort(function (a, b) { return a.index_no - b.index_no; });
    const sheetById = {};
    sheets.forEach(function (s) { sheetById[s.id] = s; });
    const machineNo = LOTES.sheetMachineNo(plan);

    const gerados = plan._ocGerados.slice();
    if (!gerados.length) { LOTES_UI.toast('Este plano não cadastrou sobra nenhuma como retalho.', true); return; }
    gerados.sort(function (a, b) {
      const ia = sheetById[a.origin_sheet_id] ? sheetById[a.origin_sheet_id].index_no : 9999;
      const ib = sheetById[b.origin_sheet_id] ? sheetById[b.origin_sheet_id].index_no : 9999;
      if (ia !== ib) return ia - ib;
      return String(a.code).localeCompare(String(b.code));
    });

    const D = new RETALHOS_PDF._Doc(jsPDF, 'CONFERÊNCIA DE RETALHOS — entrada no estoque', plan,
      gerados.length + ' sobra(s) que o plano cadastrou como retalho. Depois do corte: confira a medida, anote o local e marque. A etiqueta OC da máquina tem o mesmo código.');
    D.novaPagina();
    const cols = [
      { label: 'Código', w: 40 },
      { label: 'Material', w: 36 },
      { label: 'Medida no plano', w: 32 },
      { label: 'Medida real', w: 30, align: 'center' },
      { label: 'Local', w: 30, align: 'center' },
      { label: 'OK', w: 18, align: 'center' }
    ];
    let chapaAtual = null, areaM2 = 0;
    gerados.forEach(function (o) {
      const s = sheetById[o.origin_sheet_id];
      const chave = s ? s.id : '?';
      if (chave !== chapaAtual) {
        chapaAtual = chave;
        const titulo = s
          ? 'Chapa ' + (machineNo[s.id] ? machineNo[s.id].n : s.index_no) + ' (#' + s.index_no + ' no plano) — ' + (s.source === 'retalho' ? 'retalho' : (s.sheet_size_name || 'chapa nova')) +
            ' ' + RETALHOS_PDF._medida(s.width_mm, s.height_mm) + ' · ' + RETALHOS_PDF._material(s.color_name, s.espessura_mm)
          : 'Chapa não identificada';
        D.secao(titulo, cols);
      }
      areaM2 += Number(o.width_mm) * Number(o.height_mm) / 1e6;
      D.linha(cols, [
        { text: o.code, bold: true, size: 10, barcode: o.code },
        { text: RETALHOS_PDF._material(o.color_name, o.espessura_mm) },
        { text: RETALHOS_PDF._medida(o.width_mm, o.height_mm), bold: true },
        { blank: true },
        { blank: true },
        { box: true }
      ], 15, true);
    });
    D.rodape([
      'Total: ' + gerados.length + ' retalho(s) · ' + areaM2.toFixed(2).replace('.', ',') + ' m2 previstos no estoque.',
      'Sobra que saiu menor que o mínimo, lascada ou que foi usada de outro jeito: risque a linha e ajuste no ERP (Estoque de retalhos).'
    ]);
    D.doc.save(RETALHOS_PDF._nomeArquivo(plan, 'conferencia_retalhos'));
    LOTES_UI.toast('PDF gerado: ' + gerados.length + ' retalho(s) pra conferir.');
  } catch (err) {
    console.error(err);
    LOTES_UI.toast('Erro ao gerar o PDF: ' + (err.message || err), true);
  } finally {
    if (btn) LOTES_UI.busy(btn, false);
  }
};
