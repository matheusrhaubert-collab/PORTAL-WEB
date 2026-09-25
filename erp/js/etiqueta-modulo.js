/* Legno ERP — ETIQUETA DE MÓDULO (½ Letter ≈ A5, 2 por folha, colorida)
 *
 * Pedido do Matt (2026-09-24), com protótipo aprovado no mesmo dia (arquivo
 * prototipo-etiqueta-modulo-A5.html e a versão com os dados reais do
 * KITCHEN01 / LT-26-0014): "gera uma etiqueta A5 (2 de letter) de cada
 * módulo do ambiente. tem que ter o ícone do móvel, cor da caixa, cor da
 * porta (grande) e tamanhos (grande) polegadas e milímetros, com as
 * informações do cliente, projeto, modelo dobradiça, modelo porta, modelo
 * gaveta, modelo corrediça... peso em libras e kg, volume, texturas reais,
 * um ícone só (o do portal) e uma listagem de peças pequena."
 *
 * Onde mora: Produção → Embalagem (#/embalagem), botão "Etiquetas de módulo"
 * — gera pro lote inteiro ou só pro pedido escolhido.
 *
 * De onde vem cada coisa (tudo do PEDIDO, nada recalculado — a etiqueta
 * descreve o que foi vendido/cortado):
 *   número da etiqueta   sequência do item dentro do pedido (sort_order) —
 *                        a MESMA conta de erp/js/data-lotes.js moduleSeq e
 *                        da etiqueta de peça ("Mód 032")
 *   ícone                order_items.thumbnail_data_url (miniatura do portal)
 *   medidas              order_items.width/height/depth_mm
 *   cores + textura      selected_colors (papel → cor) × public.colors
 *                        (texture_url, swatch_hex, substrato, thickness_mm)
 *   dobradiça/corrediça  hinge_models/slide_models do item; quantidades e
 *                        modelos por peça vêm do breakdown congelado
 *                        (hinge_count, hinge_model_name, slide_model_name)
 *   peso                 Pricing.calculateWeightKg(breakdown, cores,
 *                        pricing_settings.weight_density_kg_per_m3) — o
 *                        mesmo número que o portal mostra junto do preço
 *   volume               caixa envolvente L×A×P (o que vai no caminhão)
 *   onde vai             order_items.project_placement (migration 139)
 *   peças                folhas do breakdown (LOTES.flattenBreakdown)
 *
 * Saída: uma janela nova com o HTML pronto pra Ctrl+P (Letter, sem margem,
 * gráficos de fundo ligados). Não passa por jsPDF de propósito: as
 * texturas são <img> de URL pública e a impressão do navegador resolve
 * cor/fonte/quebra de página melhor que o PDF manual.
 */

const ETIQUETA_MODULO = {};

// Link público 3D (portal.html?view3d=...) — o QR da etiqueta aponta pra cá.
ETIQUETA_MODULO.PORTAL_URL = 'https://portal.legnocabinets.com/portal.html';

/* QR em SVG (erp/js/vendor/qrcode.js, qrcode-generator MIT). Correção M
   (aguenta sujeira/risco de chão de fábrica). Sem a lib = sem QR. */
ETIQUETA_MODULO.qrSvg = function (texto) {
  if (typeof qrcode === 'undefined' || !texto) return '';
  const q = qrcode(0, 'M');
  q.addData(texto);
  q.make();
  const n = q.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += 'M' + c + ' ' + r + 'h1v1h-1z';
  return '<svg viewBox="-2 -2 ' + (n + 4) + ' ' + (n + 4) + '" shape-rendering="crispEdges"><rect x="-2" y="-2" width="' + (n + 4) + '" height="' + (n + 4) + '" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
};

ETIQUETA_MODULO.CSS = `
  :root { --ink:#1f1d18; --muted:#6b665c; --line:#cfc9bd; --paper:#fff; --accent-soft:#f4ede3; }
  * { box-sizing:border-box; }
  body { margin:0; background:#e9e6df; font-family:Inter,"Segoe UI",Arial,sans-serif; color:var(--ink); }
  .toolbar { position:sticky; top:0; background:#fff; border-bottom:1px solid var(--line); padding:10px 16px; display:flex; gap:12px; align-items:center; font-size:13px; z-index:5; }
  .toolbar button { padding:8px 14px; border:1px solid var(--line); background:#fff; border-radius:8px; cursor:pointer; font-weight:600; }
  .sheet { width:8.5in; height:11in; margin:16px auto; background:var(--paper); box-shadow:0 2px 12px rgba(0,0,0,.15); display:flex; flex-direction:column; }
  .label { width:8.5in; height:5.5in; padding:0.32in 0.38in 0.28in; display:grid; grid-template-rows:auto 1fr auto; gap:0.1in; position:relative; overflow:hidden; }
  .label + .label { border-top:1.5px dashed #9a9388; }
  .cut { position:absolute; left:0.1in; top:-0.09in; font-size:9px; color:#9a9388; background:#fff; padding:0 4px; }
  .head { display:grid; grid-template-columns:1.25in 1fr auto; gap:0.15in; align-items:center; }
  .num { background:var(--ink); color:#fff; border-radius:10px; text-align:center; padding:6px 4px 2px; }
  .num small { display:block; font-size:10px; letter-spacing:2px; opacity:.8; }
  .num b { display:block; font-size:44px; line-height:1; font-weight:900; letter-spacing:1px; }
  .title h1 { margin:0; font-size:22px; line-height:1.1; }
  .title .sub { margin-top:3px; font-size:12px; color:var(--muted); }
  .title .sub b { color:var(--ink); }
  .meta { text-align:right; font-size:11px; color:var(--muted); line-height:1.45; }
  .meta b { color:var(--ink); font-size:12px; }
  .body { display:grid; grid-template-columns:2.35in 1fr; gap:0.18in; min-height:0; }
  .icons { display:grid; grid-template-rows:auto auto 1fr; gap:0.08in; align-content:start; min-height:0; }
  .icon { border:1px solid var(--line); border-radius:10px; padding:6px; background:#fff; text-align:center; }
  .icon img, .icon svg { width:100%; height:1.3in; display:block; object-fit:contain; }
  .icon .cap { font-size:9px; color:var(--muted); margin-top:3px; text-transform:uppercase; letter-spacing:1px; }
  .place { border:1px solid var(--line); border-radius:10px; padding:5px 8px; font-size:10.5px; background:var(--accent-soft); line-height:1.35; }
  .place.comqr { display:grid; grid-template-columns:1fr 0.95in; gap:6px; align-items:center; padding:5px 5px 5px 8px; }
  .place .qr { width:0.95in; height:0.95in; background:#fff; padding:3px; border-radius:6px; }
  .place .qr svg { width:100%; height:100%; display:block; }
  .place .scan { display:block; margin-top:4px; font-size:9px; color:var(--muted); line-height:1.25; }
  .parts { border:1px solid var(--line); border-radius:10px; padding:4px 7px 5px; font-size:8.2px; line-height:1.3; overflow:hidden; }
  .parts .k { font-size:8.5px; letter-spacing:1.5px; color:var(--muted); text-transform:uppercase; margin-bottom:2px; display:flex; justify-content:space-between; }
  .parts table { width:100%; border-collapse:collapse; }
  .parts td { padding:1px 0; border-bottom:1px dotted #e3ded4; vertical-align:top; }
  .parts td:first-child { width:14px; color:var(--muted); }
  .parts td:last-child { text-align:right; white-space:nowrap; color:var(--muted); font-variant-numeric:tabular-nums; }
  .parts tr:last-child td { border-bottom:none; }
  .dims { display:grid; grid-template-columns:repeat(3,1fr); gap:0.08in; }
  .dim { border:1.5px solid var(--ink); border-radius:10px; padding:6px 8px 5px; text-align:center; }
  .dim .k { font-size:10px; letter-spacing:2px; color:var(--muted); text-transform:uppercase; }
  .dim .in { font-size:30px; font-weight:900; line-height:1.05; margin-top:2px; }
  .dim .in small { font-size:14px; font-weight:700; }
  .dim .mm { font-size:13px; color:var(--muted); margin-top:1px; font-weight:600; }
  .pv { display:grid; grid-template-columns:1fr 1fr; gap:0.08in; margin-top:0.08in; }
  .pv div { border:1px solid var(--ink); border-radius:10px; padding:4px 8px; display:flex; align-items:baseline; justify-content:space-between; gap:8px; }
  .pv .k { font-size:10px; letter-spacing:2px; color:var(--muted); text-transform:uppercase; }
  .pv .v { font-size:18px; font-weight:900; }
  .pv .v small { font-size:12px; font-weight:600; color:var(--muted); margin-left:6px; }
  .colors { display:grid; grid-template-columns:1fr 1fr; gap:0.08in; margin-top:0.08in; }
  .color { border:1px solid var(--line); border-radius:10px; overflow:hidden; display:grid; grid-template-columns:0.95in 1fr; }
  .color.vazio { border-style:dashed; opacity:.55; }
  .swatch { min-height:0.85in; background-size:cover; background-position:center; }
  .color .txt { padding:6px 8px; display:flex; flex-direction:column; justify-content:center; }
  .color .k { font-size:10px; letter-spacing:2px; color:var(--muted); text-transform:uppercase; }
  .color .v { font-size:17px; font-weight:800; line-height:1.15; }
  .color .s { font-size:11px; color:var(--muted); margin-top:2px; }
  .hw { margin-top:0.1in; display:grid; grid-template-columns:repeat(4,1fr); gap:0.06in; }
  .hw div { border:1px solid var(--line); border-radius:8px; padding:5px 7px; font-size:11px; line-height:1.25; }
  .hw .k { font-size:9px; letter-spacing:1.5px; color:var(--muted); text-transform:uppercase; display:block; }
  .hw b { font-size:12px; }
  .foot { display:flex; justify-content:space-between; align-items:flex-end; border-top:1px solid var(--line); padding-top:5px; font-size:10px; color:var(--muted); }
  .foot b { color:var(--ink); }
  .foot .bc svg { height:26px; vertical-align:middle; margin-right:6px; }
  .notes { font-size:10.5px; color:var(--ink); }
  @page { size:letter portrait; margin:0; }
  @media print {
    body { background:#fff; }
    .toolbar { display:none; }
    .sheet { margin:0; box-shadow:none; page-break-after:always; }
    * { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  }
`;

/* ------------------------------------------------------------ util */

ETIQUETA_MODULO.fracIn = function (mm, den) {
  den = den || 16;
  const inch = (Number(mm) || 0) / 25.4;
  let whole = Math.floor(inch);
  let n = Math.round((inch - whole) * den);
  if (n === den) { whole += 1; n = 0; }
  if (n === 0) return whole + '<small>"</small>';
  const g = function (a, b) { return b ? g(b, a % b) : a; };
  const d = g(n, den);
  const frac = (n / d) + '/' + (den / d);
  return (whole ? whole + ' ' : '') + '<small>' + frac + '"</small>';
};
ETIQUETA_MODULO.fracInTxt = function (mm) {
  return ETIQUETA_MODULO.fracIn(mm).replace(/<\/?small>/g, '');
};
ETIQUETA_MODULO.mm = function (v) {
  const n = Number(v) || 0;
  return (Math.round(n * 10) / 10).toString() + ' mm';
};

/* Code 39 em SVG (mesmo alfabeto do BARCODE da etiqueta de peça, mas sem
   depender dele — a janela nova não carrega os scripts do ERP). */
ETIQUETA_MODULO.code39 = function (texto) {
  const MAP = {
    '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '2': 'nnwwnnnnw', '3': 'wnwwnnnnn', '4': 'nnnwwnnnw', '5': 'wnnwwnnnn',
    '6': 'nnwwwnnnn', '7': 'nnnwnnwnw', '8': 'wnnwnnwnn', '9': 'nnwwnnwnn', 'A': 'wnnnnwnnw', 'B': 'nnwnnwnnw',
    'C': 'wnwnnwnnn', 'D': 'nnnnwwnnw', 'E': 'wnnnwwnnn', 'F': 'nnwnwwnnn', 'G': 'nnnnnwwnw', 'H': 'wnnnnwwnn',
    'I': 'nnwnnwwnn', 'J': 'nnnnwwwnn', 'K': 'wnnnnnnww', 'L': 'nnwnnnnww', 'M': 'wnwnnnnwn', 'N': 'nnnnwnnww',
    'O': 'wnnnwnnwn', 'P': 'nnwnwnnwn', 'Q': 'nnnnnnwww', 'R': 'wnnnnnwwn', 'S': 'nnwnnnwwn', 'T': 'nnnnwnwwn',
    'U': 'wwnnnnnnw', 'V': 'nwwnnnnnw', 'W': 'wwwnnnnnn', 'X': 'nwnnwnnnw', 'Y': 'wwnnwnnnn', 'Z': 'nwwnwnnnn',
    '-': 'nwnnnnwnw', '.': 'wwnnnnwnn', ' ': 'nwwnnnwnn', '*': 'nwnnwnwnn'
  };
  const t = '*' + String(texto || '').toUpperCase().replace(/[^0-9A-Z\-. ]/g, '-') + '*';
  const narrow = 1, wide = 2.6, h = 26;
  let x = 0, rects = '';
  for (let i = 0; i < t.length; i++) {
    const pat = MAP[t[i]] || MAP['-'];
    for (let j = 0; j < 9; j++) {
      const w = pat[j] === 'w' ? wide : narrow;
      if (j % 2 === 0) rects += '<rect x="' + x.toFixed(1) + '" width="' + w + '" height="' + h + '"/>';
      x += w;
    }
    x += narrow; // gap entre caracteres
  }
  return '<svg viewBox="0 0 ' + Math.ceil(x) + ' ' + h + '" preserveAspectRatio="none" style="width:' + Math.round(x * 1.1) + 'px"><g fill="#1f1d18">' + rects + '</g></svg>';
};

/* ------------------------------------------------------------ dados */

/* Itens do lote (ou de um pedido dele), já com número da etiqueta, cores
   resolvidas, ferragem e peso. */
ETIQUETA_MODULO.coletar = async function (batchId, orderIdFiltro) {
  const erp = LOTES.erp();
  const sb = DATA.sb();
  const [bRes, boRes, coresRes, psRes] = await Promise.all([
    erp.from('batches').select('*').eq('id', batchId).maybeSingle(),
    erp.from('batch_orders').select('order_id').eq('batch_id', batchId),
    sb.from('colors').select('*'),
    sb.from('pricing_settings').select('weight_density_kg_per_m3').limit(1).maybeSingle()
  ]);
  if (bRes.error) throw bRes.error;
  if (boRes.error) throw boRes.error;
  const lote = bRes.data || {};
  let orderIds = (boRes.data || []).map(function (r) { return r.order_id; });
  if (orderIdFiltro) orderIds = orderIds.filter(function (id) { return id === orderIdFiltro; });
  if (!orderIds.length) return { lote: lote, itens: [] };

  const corPorId = {};
  ((coresRes && coresRes.data) || []).forEach(function (c) { corPorId[c.id] = c; });
  const densidade = Number(psRes && psRes.data && psRes.data.weight_density_kg_per_m3) || 700;

  const [ordRes, itRes] = await Promise.all([
    sb.from('orders').select('*').in('id', orderIds),
    sb.from('order_items').select('*').in('order_id', orderIds).order('sort_order')
  ]);
  if (ordRes.error) throw ordRes.error;
  if (itRes.error) throw itRes.error;
  const pedidoPorId = {};
  (ordRes.data || []).forEach(function (o) { pedidoPorId[o.id] = o; });

  // número da etiqueta = sequência dentro do pedido (mesma conta de data-lotes.js moduleSeq)
  const seq = {};
  const totalPorPedido = {};
  (itRes.data || []).forEach(function (it) { totalPorPedido[it.order_id] = (totalPorPedido[it.order_id] || 0) + 1; });

  const itens = (itRes.data || []).map(function (it) {
    seq[it.order_id] = (seq[it.order_id] || 0) + 1;
    const pedido = pedidoPorId[it.order_id] || {};
    // cores por papel (selected_colors = [{role_id, role_name, color_id, color_name}])
    const cores = [];
    const colorsByRole = {};
    (it.selected_colors || []).forEach(function (sc) {
      if (!sc) return;
      const c = corPorId[sc.color_id] || null;
      if (c && sc.role_id) colorsByRole[sc.role_id] = c;
      cores.push({
        papel: sc.role_name || '', cor: (c && c.name) || sc.color_name || '—',
        hex: (c && c.swatch_hex && c.swatch_hex.toLowerCase() !== '#cccccc') ? c.swatch_hex : '#d7c4a3',
        textura: (c && c.texture_url) || null,
        substrato: (c && c.substrato) || '',
        espessura: (c && Number(c.thickness_mm) > 0) ? Number(c.thickness_mm) : ((typeof Pricing !== 'undefined' && Pricing.DEFAULT_THICKNESS_MM) || 19.5),
        veio: !!(c && c.has_grain)
      });
    });
    // ordem: Caixa, Porta/Frente, Painel, resto
    const ordemPapel = function (p) { p = (p || '').toLowerCase(); return p.indexOf('caixa') >= 0 ? 0 : (p.indexOf('porta') >= 0 || p.indexOf('frente') >= 0) ? 1 : p.indexOf('painel') >= 0 ? 2 : 3; };
    cores.sort(function (a, b) { return ordemPapel(a.papel) - ordemPapel(b.papel); });

    const bd = Array.isArray(it.breakdown) ? it.breakdown : [];
    const folhas = LOTES.flattenBreakdown(bd, 1);
    // ferragem pelo breakdown congelado
    let portas = 0, dobradicas = 0, gavetas = 0, dobradicaNome = null, corredicaNome = null;
    const walk = function (lista) {
      (lista || []).forEach(function (p) {
        if (!p) return;
        const q = p.quantity || 1;
        if (Number(p.hinge_count) > 0) { portas += q; dobradicas += Number(p.hinge_count) * q; dobradicaNome = dobradicaNome || p.hinge_model_name || null; }
        if (Number(p.slide_cost) > 0 || p.slide_model_name) { gavetas += q; corredicaNome = corredicaNome || p.slide_model_name || null; }
        if (p.is_module) walk(p.child_breakdown);
      });
    };
    walk(bd);
    const prateleiras = Object.keys(it.shelf_quantities || {}).reduce(function (s, k) { return s + (Number(it.shelf_quantities[k]) || 0); }, 0);
    let pesoKg = 0;
    try { pesoKg = Pricing.calculateWeightKg(bd, colorsByRole, densidade) * (it.quantity || 1); } catch (e) { pesoKg = 0; }

    return {
      numero: String(seq[it.order_id]).padStart(3, '0'),
      totalPedido: totalPorPedido[it.order_id] || 0,
      pedido: pedido, item: it, cores: cores, folhas: folhas,
      portas: portas, dobradicas: dobradicas, gavetas: gavetas, prateleiras: prateleiras,
      dobradicaNome: dobradicaNome || (it.hinge_model_id ? null : null),
      corredicaNome: corredicaNome,
      pesoKg: pesoKg
    };
  });

  // nomes de dobradiça/corrediça do ITEM quando o breakdown não trouxe (modelo escolhido no pedido)
  const hingeIds = itens.map(function (x) { return x.item.hinge_model_id; }).filter(Boolean);
  const slideIds = itens.map(function (x) { return x.item.slide_model_id; }).filter(Boolean);
  const [hRes, sRes] = await Promise.all([
    hingeIds.length ? sb.from('hinge_models').select('id, name').in('id', hingeIds) : Promise.resolve({ data: [] }),
    slideIds.length ? sb.from('slide_models').select('id, name').in('id', slideIds) : Promise.resolve({ data: [] })
  ]);
  const hNome = {}, sNome = {};
  ((hRes && hRes.data) || []).forEach(function (h) { hNome[h.id] = h.name; });
  ((sRes && sRes.data) || []).forEach(function (s) { sNome[s.id] = s.name; });
  itens.forEach(function (x) {
    if (!x.dobradicaNome && x.item.hinge_model_id) x.dobradicaNome = hNome[x.item.hinge_model_id] || null;
    if (!x.corredicaNome && x.item.slide_model_id) x.corredicaNome = sNome[x.item.slide_model_id] || null;
  });
  // SÓ MÓDULO, NÃO PAINEL (Matt, 24/09: "painel não precisa de etiqueta, só
  // o módulo, quando tem mais de uma peça e vai o conjunto"). Mesmo critério
  // de "módulo antes de painel" do pedido (portal-08 sendProjectToOrder):
  // 2+ peças fabricadas (chapa, não comprado) = conjunto que ganha etiqueta;
  // 1 peça = painel/filler/rodapé avulso, que já tem a etiqueta de peça.
  // A numeração (001…) foi calculada ANTES do filtro, então continua a da
  // etiqueta de peça e da Proposta.
  const conjuntos = itens.filter(function (x) {
    const fabricadas = x.folhas.reduce(function (n, f) { return n + (f.origin === 'comprado' ? 0 : (f.quantity || 1)); }, 0);
    return fabricadas >= 2;
  });
  // QR do instalador (migration 179): link 3D do projeto de onde o pedido
  // veio, já no item. Sem a migration (ou pedido antigo sem origem) = sem QR.
  try {
    const cRes = await sb.rpc('erp_view3d_codes_for_orders', { p_order_ids: orderIds });
    if (cRes.error) throw cRes.error;
    const codigoPorPedido = {};
    (cRes.data || []).forEach(function (r) { codigoPorPedido[r.order_id] = r.view3d_code; });
    conjuntos.forEach(function (x) {
      const c = codigoPorPedido[x.item.order_id];
      if (c) x.linkInstalador = ETIQUETA_MODULO.PORTAL_URL + '?view3d=' + encodeURIComponent(c) + '&item=' + encodeURIComponent(x.item.id);
    });
  } catch (e) { console.warn('[etiqueta-modulo] sem QR do instalador (migration 179 rodou?):', e && e.message ? e.message : e); }
  return { lote: lote, itens: conjuntos, totalItens: itens.length };
};

/* ------------------------------------------------------------ html */

/* ETIQUETA EM INGLÊS (Matt, 24/09: "só passa a etiqueta pra inglês") — o
   texto fixo da etiqueta impressa é todo em inglês; a barra de cima da
   janela (Imprimir etc.) continua em português, é só pra quem imprime.
   Nomes que vêm do banco em português (papel da cor, referência da peça)
   passam por este dicionário; o que não estiver aqui sai como veio. */
ETIQUETA_MODULO.EN = {
  'caixa': 'Box', 'porta/frente': 'Door/Front', 'porta': 'Door', 'frente': 'Front', 'painel': 'Panel',
  'lateral esquerda': 'Left side', 'lateral direita': 'Right side', 'lateral': 'Side',
  'fundo': 'Back', 'base': 'Bottom', 'tampo': 'Top', 'teto': 'Top', 'prateleira': 'Shelf',
  'rodapé': 'Toe kick', 'rodape': 'Toe kick', 'travessa': 'Stretcher', 'divisória': 'Divider', 'divisoria': 'Divider',
  'frente gaveta': 'Drawer front', 'fundo gaveta': 'Drawer bottom', 'lateral gaveta': 'Drawer side',
  'traseira gaveta': 'Drawer back', 'contra frente': 'Drawer sub-front', 'contrafrente': 'Drawer sub-front'
};
ETIQUETA_MODULO.en = function (t) {
  const k = String(t || '').trim().toLowerCase();
  return ETIQUETA_MODULO.EN[k] || t;
};
ETIQUETA_MODULO.dataUS = function (iso) {
  if (!iso) return '—';
  const p = String(iso).slice(0, 10).split('-');
  return p.length === 3 ? p[1] + '/' + p[2] + '/' + p[0] : iso;
};

ETIQUETA_MODULO.label = function (x, lote, idx) {
  const E = ETIQUETA_MODULO, esc = UI.esc;
  const it = x.item, ped = x.pedido;
  const W = Number(it.width_mm) || 0, H = Number(it.height_mm) || 0, D = Number(it.depth_mm) || 0;
  const volM3 = W * H * D / 1e9;
  const pl = it.project_placement || {};
  const parede = pl.wall_index != null ? 'Wall ' + (Number(pl.wall_index) + 1) : 'Room';
  const onde = '<b>Location:</b> ' + parede + ' · ' + E.fracInTxt(pl.x_mm || 0) + ' from left · ' + E.fracInTxt(pl.floor_height_mm || 0) + ' from floor';

  const corHtml = function (c, papelFallback) {
    if (!c) return '<div class="color vazio"><div class="swatch" style="background:#f6f3ee"></div><div class="txt"><div class="k">Color · ' + esc(E.en(papelFallback)) + '</div><div class="v">—</div><div class="s">loose part</div></div></div>';
    const bg = c.textura ? 'background-image:url(' + esc(c.textura) + ')' : 'background:' + esc(c.hex);
    return '<div class="color"><div class="swatch" style="' + bg + '"></div><div class="txt"><div class="k">Color · ' + esc(E.en(c.papel)) + '</div>' +
      '<div class="v">' + esc(c.cor) + '</div><div class="s">' + esc((c.substrato || '').toUpperCase()) + ' ' + c.espessura + ' mm' + (c.veio ? ' · grain' : '') + '</div></div></div>';
  };
  const cores = x.cores.slice(0, 2);
  const coresHtml = cores.length === 2 ? corHtml(cores[0]) + corHtml(cores[1])
    : cores.length === 1 ? corHtml(cores[0]) + corHtml(null, /painel/i.test(cores[0].papel) ? 'Caixa' : 'Porta/Frente')
    : corHtml(null, 'Caixa') + corHtml(null, 'Porta/Frente');

  const fundo = x.folhas.find(function (f) { return /^fundo$/i.test(f.reference || ''); });
  const frentes = x.folhas.filter(function (f) { return /frente|front drawer/i.test(f.reference || ''); }).reduce(function (s, f) { return s + f.quantity; }, 0);
  const hw = [
    ['Door', x.portas ? '<b>' + x.portas + ' door' + (x.portas > 1 ? 's' : '') + '</b><br>hinged' : '<b>—</b><br>no door'],
    ['Hinge', x.portas ? '<b>' + esc(x.dobradicaNome || 'standard') + '</b><br>' + x.dobradicas + ' pcs · Ø35 cup' : '<b>—</b><br>—'],
    ['Drawer', x.gavetas ? '<b>' + x.gavetas + ' drawer' + (x.gavetas > 1 ? 's' : '') + '</b><br>' + frentes + ' front' + (frentes !== 1 ? 's' : '') : (frentes ? '<b>—</b><br>' + frentes + ' fixed front(s)' : '<b>—</b><br>no drawer')],
    ['Slide', x.gavetas ? '<b>' + esc(x.corredicaNome || 'standard') + '</b><br>' + x.gavetas + ' pair' + (x.gavetas > 1 ? 's' : '') : '<b>—</b><br>—'],
    ['Shelves', x.prateleiras ? '<b>' + x.prateleiras + ' × adjustable</b><br>Ø3 pin' : '<b>—</b><br>—'],
    ['Back', fundo ? '<b>' + E.mm(Math.min(fundo.width_mm, fundo.height_mm, fundo.depth_mm)) + '</b><br>dadoed' : '<b>—</b><br>—'],
    ['Qty in order', '<b>' + (it.quantity || 1) + ' pc</b><br>' + (it.module_description ? esc(String(it.module_description).slice(0, 26)) : '')],
    ['Order date', '<b>' + (ped.submitted_at ? E.dataUS(ped.submitted_at) : '—') + '</b><br>' + esc(ped.po_name || '')]
  ].map(function (kv) { return '<div><span class="k">' + kv[0] + '</span>' + kv[1] + '</div>'; }).join('');

  const nPecas = x.folhas.reduce(function (s, f) { return s + f.quantity; }, 0);
  const linhas = x.folhas.slice(0, 14).map(function (f) {
    const w = Math.round(f.width_mm * 10) / 10, h = Math.round(f.height_mm * 10) / 10, d = Math.round(f.depth_mm * 10) / 10;
    return '<tr><td>' + f.quantity + '×</td><td>' + esc(E.en(f.reference)) + (f.origin === 'comprado' ? ' (purchased)' : '') + '</td><td>' + w + ' × ' + h + ' × ' + d + '</td></tr>';
  }).join('') + (x.folhas.length > 14 ? '<tr><td></td><td>… +' + (x.folhas.length - 14) + ' more line(s)</td><td></td></tr>' : '');

  const icone = it.thumbnail_data_url
    ? '<img src="' + it.thumbnail_data_url + '" alt="">'
    : '<svg viewBox="0 0 120 120"><rect x="20" y="10" width="80" height="100" fill="#f3efe6" stroke="#4a3b28" stroke-width="1.5"/><text x="60" y="66" font-size="9" text-anchor="middle" fill="#9a9388">no thumbnail</text></svg>';
  const codigo = String(ped.po_name || 'ORDER').replace(/[^0-9A-Za-z\-. ]/g, '-').toUpperCase() + '-M' + x.numero;

  return '<div class="label">' + (idx % 2 === 1 ? '<span class="cut">✂ cut here</span>' : '') +
    '<div class="head">' +
      '<div class="num"><small>MODULE</small><b>' + x.numero + '</b></div>' +
      '<div class="title"><h1>' + esc(it.module_name || '') + '</h1>' +
        '<div class="sub">Customer: <b>' + esc(ped.client_name || (typeof DATA !== 'undefined' && DATA.clientLabel ? DATA.clientLabel(ped) : '')) + '</b> · Order: <b>' + esc(ped.po_name || '') + '</b>' +
        (ped.client_phone ? ' · ' + esc(ped.client_phone) : '') + '</div></div>' +
      '<div class="meta"><b>' + esc(lote.code || '') + '</b><br>' + (lote.created_at ? 'Batch ' + E.dataUS(lote.created_at) : '') + '<br>Item ' + Number(x.numero) + ' of ' + x.totalPedido + '</div>' +
    '</div>' +
    '<div class="body">' +
      '<div class="icons">' +
        '<div class="icon">' + icone + '<div class="cap">Module</div></div>' +
        (x.linkInstalador
          ? '<div class="place comqr"><div>' + onde + '<span class="scan">📱 Scan: opens the 3D with this module highlighted and the wall with dimensions.</span></div><div class="qr">' + E.qrSvg(x.linkInstalador) + '</div></div>'
          : '<div class="place">' + onde + '</div>') +
        '<div class="parts"><div class="k"><span>Parts (' + nPecas + ')</span><span>W × H × D mm</span></div><table>' + linhas + '</table></div>' +
      '</div>' +
      '<div>' +
        '<div class="dims">' +
          '<div class="dim"><div class="k">Width</div><div class="in">' + E.fracIn(W) + '</div><div class="mm">' + E.mm(W) + '</div></div>' +
          '<div class="dim"><div class="k">Height</div><div class="in">' + E.fracIn(H) + '</div><div class="mm">' + E.mm(H) + '</div></div>' +
          '<div class="dim"><div class="k">Depth</div><div class="in">' + E.fracIn(D) + '</div><div class="mm">' + E.mm(D) + '</div></div>' +
        '</div>' +
        '<div class="pv">' +
          '<div><span class="k">Weight</span><span class="v">' + Math.round(x.pesoKg * 2.20462) + ' lb<small>' + (Math.round(x.pesoKg * 10) / 10) + ' kg</small></span></div>' +
          '<div><span class="k">Volume</span><span class="v">' + (Math.round(volM3 * 35.3147 * 10) / 10) + ' ft³<small>' + (Math.round(volM3 * 1000) / 1000) + ' m³</small></span></div>' +
        '</div>' +
        '<div class="colors">' + coresHtml + '</div>' +
        '<div class="hw">' + hw + '</div>' +
      '</div>' +
    '</div>' +
    '<div class="foot">' +
      '<div class="notes"><b>Notes:</b> ' + esc(it.module_description && it.module_description !== it.module_name ? it.module_description : '—') + '</div>' +
      '<div class="bc">' + E.code39(codigo) + '<b>' + esc(codigo) + '</b></div>' +
    '</div>' +
  '</div>';
};

ETIQUETA_MODULO.html = function (dados) {
  const E = ETIQUETA_MODULO;
  const itens = dados.itens;
  let folhas = '';
  for (let i = 0; i < itens.length; i += 2) {
    folhas += '<div class="sheet">' + E.label(itens[i], dados.lote, 0) + (itens[i + 1] ? E.label(itens[i + 1], dados.lote, 1) : '') + '</div>\n';
  }
  const titulo = 'Etiquetas de módulo — ' + (dados.lote.code || '') + (itens.length ? ' · ' + (itens[0].pedido.po_name || '') : '');
  return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>' + UI.esc(titulo) + '</title><style>' + E.CSS + '</style></head><body>' +
    '<div class="toolbar"><b>' + UI.esc(titulo) + '</b><span>' + itens.length + ' módulo(s)' + (dados.totalItens > itens.length ? ' (' + (dados.totalItens - itens.length) + ' painéis/peças avulsas sem etiqueta de módulo — usam a etiqueta de peça)' : '') + ', 2 por folha Letter. Ctrl+P: Letter, margens Nenhuma, "Gráficos de fundo" ligado.</span>' +
    '<button onclick="window.print()">🖨️ Imprimir</button></div>' + folhas + '</body></html>';
};

/* Botão: abre a janela com as etiquetas (lote inteiro ou só um pedido). */
ETIQUETA_MODULO.gerar = async function (batchId, orderId, btn) {
  const texto = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Montando etiquetas…'; }
  // a janela precisa ser aberta no clique (bloqueador de pop-up), antes do await
  const win = window.open('', '_blank');
  try {
    const dados = await ETIQUETA_MODULO.coletar(batchId, orderId || null);
    if (!dados.itens.length) {
      if (win) win.close();
      alert(dados.totalItens ? 'Este ' + (orderId ? 'pedido' : 'lote') + ' só tem painéis/peças avulsas — a etiqueta de módulo é só pra conjunto (2+ peças); as avulsas já têm a etiqueta de peça.'
        : 'Nenhum item de pedido neste lote' + (orderId ? '/pedido' : '') + '.');
      return;
    }
    const html = ETIQUETA_MODULO.html(dados);
    if (win) { win.document.open(); win.document.write(html); win.document.close(); }
    else {
      const blob = new Blob([html], { type: 'text/html' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = 'etiquetas_' + String(dados.lote.code || batchId).replace(/[^a-zA-Z0-9_-]+/g, '_') + '.html';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }
  } catch (err) {
    if (win) win.close();
    console.error('[etiqueta-modulo]', err);
    alert('Não consegui montar as etiquetas: ' + ((typeof DATA !== 'undefined' && DATA.explainError) ? DATA.explainError(err) : (err.message || err)));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = texto; }
  }
};
