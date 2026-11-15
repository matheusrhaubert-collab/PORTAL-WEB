/* Bancada dos PUXADORES (migration 289). `node scripts/tests/teste-puxador.js`
 * Confere: quais frentes ganham puxador, linha comprada pro preço, posição
 * (porta/gaveta/lift, knob e barra) e a marcação no .ban (folha e modelo). */
const fs = require('fs'), vm = require('vm'), path = require('path');
const R = path.join(__dirname, '..', '..');
const g = { console, supabaseClient: null };
g.window = g; vm.createContext(g);
const load = (f, extra) => vm.runInContext(fs.readFileSync(path.join(R, f), 'utf8') + (extra || ''), g, { filename: f });
load('js/pricing.js');
load('js/module-pieces.js', '\n;this.resolvePiecesForViewer=resolvePiecesForViewer;this.handleFrontKind=handleFrontKind;');
load('js/drilling.js');
const P = g.Pricing, D = g.Drilling;
let falhas = 0;
const ok = (n, c, d) => { console.log((c ? '  OK   ' : '  FALHA') + '  ' + n + (d !== undefined ? '  [' + d + ']' : '')); if (!c) falhas++; };

const itemKnob = { id: 'k1', code: 'PUX-KNOB-OVAL-GD', name: 'Knob oval — dourado', kind: 'puxador', unit: 'un', purchase_price: 4,
  attrs: { tipo: 'knob', furos: 1, comprimento_mm: 37.6, largura_mm: 18, altura_mm: 23.6, cor_hex: '#c9a45c' } };
const itemBarra = { id: 'b1', code: 'PUX-BARRA-160-GD', name: 'Barra 160 mm — dourado', kind: 'puxador', unit: 'un', purchase_price: 6,
  attrs: { tipo: 'barra', furos: 2, entre_furos_mm: 160, comprimento_mm: 182, largura_mm: 11, altura_mm: 23, cor_hex: '#c9a45c' } };
P.setPurchasedItems({ k1: itemKnob, b1: itemBarra });
const knob = g.handleModelFromItem(itemKnob), barra = g.handleModelFromItem(itemBarra);

const folha = (id, ref, w, h, d, ox, oy, oz, extra) => Object.assign({ id, piece_id: id, reference: ref, quantity: 1, is_module: false, origin: 'fabricacao',
  position_role: 'free', color_role_id: 'caixa', width_formula: w, height_formula: h, depth_formula: d,
  offset_x_formula: ox || '0', offset_y_formula: oy || '0', offset_z_formula: oz || '0',
  area_m2_formula: 'w*h/1000000', edge_band_linear_m_formula: '0', labor_cost_per_unit: 3 }, extra || {});
const porta = folha('p1', 'Porta', '400', '700', '19.5', '0', '0', '560', { _layoutKind: 'front', opening_type: 'hinge_left', hinge_side: 'left' });
const frente = folha('f1', 'Frente gaveta', '600', '180', '19.5', '0', '0', '560', { _layoutKind: 'front', opening_type: 'slide_out', slide_distance_mm: 300 });
const fixo = folha('x1', 'Painel fixo', '600', '300', '19.5', '0', '0', '560', { _layoutKind: 'front', opening_type: 'none' });
const lateral = folha('le', 'Lateral', '18', '720', '560');
const lista = [lateral, porta, frente, fixo];

console.log('\n— quem ganha puxador');
ok('porta = door', g.handleFrontKind(porta) === 'door');
ok('frente de gaveta = drawer', g.handleFrontKind(frente) === 'drawer');
ok('painel fixo = sem puxador', g.handleFrontKind(fixo) === null);
ok('lateral = sem puxador', g.handleFrontKind(lateral) === null);
ok('sem cfg = mesmo array', g.applyHandleConfigDeep(lista, null) === lista);
const cfgK = Object.assign({}, knob, { door_pos: 'top', drawer_pos: 'center' });
const com = g.applyHandleConfigDeep(lista, cfgK);
ok('2 frentes + 2 linhas compradas', com.length === 6, com.length);
ok('porta tem handle, lateral intacta', !!com[1].handle && com[0] === lateral);
ok('linha comprada depois da porta', com[2]._handleRow && com[2].purchased_item_id === 'k1' && com[2].origin === 'comprado');
ok('cache devolve o mesmo', g.applyHandleConfigDeep(lista, cfgK) === com);

console.log('\n— preço');
const cores = { caixa: { id: 'c', name: 'Branco', sheet_price_per_m2: 10, edge_price_per_linear_m: 1, espessura_mm: 19.5 } };
const base = { module: { id: 'm' }, colorsByRole: cores, width_mm: 600, height_mm: 720, depth_mm: 580, markupMultiplier: 1 };
const r0 = P.calculateModulePrice(Object.assign({}, base, { pieces: lista }));
const r1 = P.calculateModulePrice(Object.assign({}, base, { pieces: com }));
ok('2 knobs de $4 = +$8 no total', Math.abs((r1.total - r0.total) - 8) < 0.001, (r1.total - r0.total).toFixed(2));
const comB = g.applyHandleConfigDeep(lista, Object.assign({}, barra, { door_pos: 'top', drawer_pos: 'center' }));
const r2 = P.calculateModulePrice(Object.assign({}, base, { pieces: comB }));
ok('2 barras de $6 = +$12 no total', Math.abs((r2.total - r0.total) - 12) < 0.001, (r2.total - r0.total).toFixed(2));

console.log('\n— 2 knobs na frente de gaveta');
const com2 = g.applyHandleConfigDeep(lista, Object.assign({}, knob, { door_pos: 'top', drawer_pos: 'center', drawer_qty: 2 }));
const fr2 = com2.find((p) => p.id === 'f1'), po2 = com2.find((p) => p.id === 'p1');
ok('gaveta com qty 2, porta com 1', fr2.handle.qty === 2 && po2.handle.qty === 1);
const pl2 = g.handlePlacement(fr2.handle, 600, 180);
ok('furos a 1/4 e 3/4 da largura, no meio da altura', pl2.points.length === 2 && pl2.points[0].u === 150 && pl2.points[1].u === 450 && pl2.points.every((p) => p.v === 90), JSON.stringify(pl2.points));
const r3 = P.calculateModulePrice(Object.assign({}, { module: { id: 'm' }, colorsByRole: { caixa: { id: 'c', name: 'Branco', sheet_price_per_m2: 10, edge_price_per_linear_m: 1, espessura_mm: 19.5 } }, width_mm: 600, height_mm: 720, depth_mm: 580, markupMultiplier: 1 }, { pieces: com2 }));
const r3b = P.calculateModulePrice(Object.assign({}, { module: { id: 'm' }, colorsByRole: { caixa: { id: 'c', name: 'Branco', sheet_price_per_m2: 10, edge_price_per_linear_m: 1, espessura_mm: 19.5 } }, width_mm: 600, height_mm: 720, depth_mm: 580, markupMultiplier: 1 }, { pieces: lista }));
ok('preço: 3 knobs de $4 (1 na porta + 2 na gaveta) = +$12', Math.abs((r3.total - r3b.total) - 12) < 0.001, (r3.total - r3b.total).toFixed(2));
const comB2 = g.applyHandleConfigDeep(lista, Object.assign({}, barra, { door_pos: 'top', drawer_pos: 'center', drawer_qty: 2 }));
ok('barra ignora o "2" (sempre 1)', comB2.find((p) => p.id === 'f1').handle.qty === 1 && g.handlePlacement(comB2.find((p) => p.id === 'f1').handle, 600, 180).points.length === 2);
{
  const st = new Map();
  D._internals.collectAssembly(st, g.resolvePiecesForViewer(com2, { W: 600, H: 720, D: 580 }, { caixa: { id: 'c', espessura_mm: 19.5 } }, {}, {}, {}), 600, 720, 580, { holesByPattern: {}, settings: { hinge_enabled: false, slide_enabled: false, shelf_enabled: false } });
  let marcasFrente = 0;
  st.forEach((hs, part) => { if (part.piece_id === 'f1' || part.id === 'f1') marcasFrente = hs.filter((h) => h.tipo === 'marcacao_puxador').length; });
  ok('.ban: 2 marcações atrás da frente de gaveta', marcasFrente === 2, marcasFrente);
}

console.log('\n— posição (u da esquerda, v de baixo)');
const hp = g.handlePlacement;
let pl = hp(com[1].handle, 400, 700);
ok('knob, dobradiça esq., em cima: furo a 30 da lateral direita e 30 do topo', pl.vertical && pl.points.length === 1 && pl.points[0].u === 370 && pl.points[0].v === 670, JSON.stringify(pl.points));
pl = hp(Object.assign({}, com[1].handle, { hinge: 'right', pos: 'bottom' }), 400, 700);
ok('knob, dobradiça dir., embaixo: furo a 30 da esquerda e 30 da base', pl.points[0].u === 30 && pl.points[0].v === 30);
pl = hp(Object.assign({}, barra, { kind: 'door', hinge: 'left', pos: 'top' }), 400, 700);
ok('barra em pé, em cima: 1º furo a 30 do topo, 2º a 160, lateral 30', pl.vertical && pl.points[1].v === 670 && pl.points[0].v === 510 && pl.points[0].u === 370, JSON.stringify(pl.points));
pl = hp(Object.assign({}, barra, { kind: 'door', hinge: 'left', pos: 'bottom' }), 400, 700);
ok('barra em pé, embaixo: 1º furo a 30 da base', pl.points[0].v === 30 && pl.points[1].v === 190);
pl = hp(Object.assign({}, barra, { kind: 'door', hinge: 'left', pos: 'top', orient: 'horizontal' }), 400, 700);
ok('barra deitada, em cima: 1º furo a 30 da lateral e 30 do topo', !pl.vertical && pl.points[1].u === 370 && pl.points[0].u === 210 && pl.points[0].v === 670, JSON.stringify(pl.points));
pl = hp(Object.assign({}, barra, { kind: 'drawer', pos: 'center' }), 600, 180);
ok('barra na gaveta: horizontal, centrada', !pl.vertical && pl.cu === 300 && pl.cv === 90 && Math.abs(pl.points[1].u - pl.points[0].u - 160) < 0.01);
pl = hp(Object.assign({}, barra, { kind: 'drawer', pos: 'center', orient: 'vertical' }), 600, 400);
ok('barra EM PÉ na gaveta: vertical, centrada', pl.vertical && pl.cu === 300 && pl.cv === 200);
pl = hp(Object.assign({}, knob, { kind: 'lift' }), 600, 350);
ok('lift: embaixo no centro, furo a 30', pl.cu === 300 && pl.cv === 30);

console.log('\n— porta de vidro');
const vidroAl = { id: 'pv', is_module: true, reference: 'Porta', module_name: 'Glass Aluminium · engenharia', position_role: 'free', _layoutKind: 'front', opening_type: 'hinge_left',
  child_pieces: [folha('pf', 'Perfil', 'W', 'H', '20', '0', '0', '0', { origin: 'comprado' })] };
const shakerVidro = { id: 'sv', is_module: true, reference: 'Porta A', module_name: 'Porta Shaker', position_role: 'free', _layoutKind: 'front', opening_type: 'hinge_left',
  child_pieces: [folha('m1', 'Montante', '76', 'H', '19.5'), folha('v1', 'Vidro 4mm', 'W-152', 'H-152', '4', '76', '76', '0', { origin: 'comprado' })] };
ok('vidro com perfil de alumínio: sem puxador', g.handleFrontKind(vidroAl) === null);
ok('Shaker Glass (moldura de madeira): LEVA puxador', g.handleFrontKind(shakerVidro) === 'door');
const sv = g.applyHandleConfigDeep([lateral, Object.assign({}, shakerVidro, { child_pieces: [folha('m1', 'Montante esq.', '60', 'H', '19.5'), folha('m2', 'Montante dir.', '60', 'H', '19.5', 'W-60'), folha('v1', 'Vidro', 'W-100', 'H-100', '4', '50', '50', '0', { origin: 'comprado' })] })], Object.assign({}, knob, { door_pos: 'top' }));
ok('Shaker: furo no meio do montante (60 / 2 = 30)', sv[1].handle.lateral_mm === 30 && hp(sv[1].handle, 400, 700).points[0].u === 370, sv[1].handle.lateral_mm);
const s76 = g.applyHandleConfigDeep([Object.assign({}, shakerVidro, { id: 's76', child_pieces: [folha('n1', 'Montante', '76', 'H', '19.5')] })], Object.assign({}, knob, { door_pos: 'top' }));
ok('moldura de 76: furo a 38 da borda', hp(s76[0].handle, 400, 700).points[0].u === 362);
ok('módulo só com porta de vidro: seletor some', g.piecesHaveHandleFront([lateral, vidroAl]) === false);

console.log('\n— marcação no .ban');
const I = D._internals;
const marcasDe = (pieces) => {
  const parts = g.resolvePiecesForViewer(pieces, { W: 600, H: 720, D: 580 }, cores, {}, {}, {});
  const store = new Map();
  I.collectAssembly(store, parts, 600, 720, 580, { holesByPattern: {}, drillingsByComponent: {}, settings: { hinge_enabled: false } });
  const out = [];
  store.forEach((hs, part) => (hs || []).forEach((h) => { if (h.tipo === 'marcacao_puxador') out.push(Object.assign({ ref: part.reference }, h)); }));
  return { out, parts };
};
let m = marcasDe(com);
ok('part da porta carrega handle', !!m.parts.find((p) => p.reference === 'Porta').handle);
ok('knob: 1 marca na porta + 1 na frente, Ø3 × 2, face', m.out.length === 2 && m.out.every((h) => h.diameter === 3 && h.depth === 2 && h.face === 'face'), JSON.stringify(m.out));
m = marcasDe(comB);
ok('barra: 2 marcas na porta + 2 na frente', m.out.length === 4, m.out.length);
const naPorta = m.out.filter((h) => h.ref === 'Porta');
ok('barra na porta: marcas a 160 uma da outra', naPorta.length === 2 && Math.abs(Math.hypot(naPorta[0].x - naPorta[1].x, naPorta[0].y - naPorta[1].y) - 160) < 0.01);
ok('sem puxador = nenhuma marca', marcasDe(lista).out.length === 0);
// porta de MODELO (peça-módulo com a chapa dentro)
const portaMod = { id: 'pm', is_module: true, reference: 'Porta Shaker', position_role: 'free', _layoutKind: 'front', opening_type: 'hinge_right', quantity: 1,
  color_role_id: 'caixa', width_formula: '400', height_formula: '700', depth_formula: '19.5', offset_x_formula: '0', offset_y_formula: '0', offset_z_formula: '560',
  child_pieces: [folha('pm1', 'Painel porta', 'W', 'H', '19.5', '0', '0', '0', { positioning: 'vertical_no_plano' })] };
const comM = g.applyHandleConfigDeep([lateral, portaMod], Object.assign({}, barra, { door_pos: 'bottom', drawer_pos: 'center' }));
m = marcasDe(comM);
ok('porta de modelo: 2 marcas na chapa de dentro, 1ª a 30 × 30', m.out.length === 2 && m.out.every((h) => h.ref === 'Painel porta') && m.out[0].x === 30 && m.out[0].y === 30, JSON.stringify(m.out.map((h) => [h.ref, h.x, h.y])));
console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nTudo OK');
process.exit(falhas ? 1 : 0);
