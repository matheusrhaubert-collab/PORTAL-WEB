/* Bancada do PASSO A PASSO DE MONTAGEM (js/portal-40-montagem.js, piloto 16/11).
 *   node scripts/tests/teste-montagem-passos.js
 * Monta os passos de uma caixa simples (2 laterais, base, travessa, fundo,
 * prateleira com suporte) com a furação de verdade (Drilling.holesNoModulo +
 * programas do dump do Base Canto 90°) e confere a ordem e as contagens. */
const fs = require('fs'), vm = require('vm'), path = require('path');
const R = path.join(__dirname, '..', '..');
const g = { console }; g.window = g; vm.createContext(g);
['pricing.js', 'drilling.js'].forEach((f) => vm.runInContext(fs.readFileSync(path.join(R, 'js', f), 'utf8'), g, { filename: f }));
const m = { module: { exports: {} } }; vm.createContext(m);
vm.runInContext(fs.readFileSync(path.join(R, 'js/portal-40-montagem.js'), 'utf8'), m, { filename: 'portal-40-montagem.js' });
const M = m.module.exports, Dr = g.Drilling, I = Dr._internals;
const dump = JSON.parse(fs.readFileSync(path.join(__dirname, 'teste-base-canto-90.dump.json'), 'utf8'));
const id = (nome) => Object.keys(dump.nomes).find((k) => dump.nomes[k] === nome);
let falhas = 0;
const ok = (c, msg) => { console.log((c ? '  OK   ' : '  FALHA') + ' ' + msg); if (!c) falhas++; };
const E = 19.5, W = 600, H = 762, D = 580;
const P = (ref, role, w, h, d, x, y, z, prog, extra) => Object.assign({ id: ref, reference: ref, position_role: role, width_mm: w, height_mm: h, depth_mm: d,
  offset_x_mm: x, offset_y_mm: y, offset_z_mm: z, rotation_y_deg: 0, recortes: [], drilling_pattern_id: prog, shape_type: 'box', origin: 'fabricacao', is_module: false, positioning: null }, extra || {});
const parts = [
  P('Lateral esquerda', 'left', E, H, D, 0, 0, 0, null),
  P('Lateral direita', 'right', E, H, D, W - E, 0, 0, null),
  P('Base', 'bottom', W - 2 * E, E, D - E, E, 0, E, id('TOP BOTTOM')),
  P('Travessa', 'free', W - 2 * E, E, 76, E, H - E, D - 76, id('STRETCHER')),
  P('Fundo', 'back', W - 2 * E, H, E, E, 0, 0, id('Back')),
  P('Prateleira', 'free', W - 2 * E, E, D - E - 20, E, 380, E, null, { drill_shelf_support: true })
];
const settings = { touch_tolerance_mm: 5, counter_face_depth_mm: 12, hinge_enabled: false, hinge_plate_enabled: false, shelf_enabled: true,
  shelf_diameter_mm: 3, shelf_depth_mm: 10, shelf_front_setback_mm: 37, shelf_back_setback_mm: 37, slide_enabled: false };
const furos = Dr.holesNoModulo(parts, W, H, D, { holesByPattern: dump.programas, settings });
const chave = (b) => [b.x0, b.y0, b.z0, b.sx, b.sy, b.sz].map((v) => Math.round(v * 10) / 10).join(',');
const caixas = I.buildBoxes(parts, W, H, D).boxes.map((b) => ({ chave: chave(b), papel: M.classificaCaixa(b, false), nome: b.part.reference }));
ok(furos.length > 0 && furos.every((h) => typeof h.cx === 'string'), 'furos vêm com a caixa da peça (cx) — ' + furos.length + ' furos');
ok(caixas.map((c) => c.nome + '=' + c.papel).sort().join(',') === 'Base=horiz,Fundo=fundo,Lateral direita=lado,Lateral esquerda=lado,Prateleira=prat,Travessa=horiz', 'papéis: ' + caixas.map((c) => c.nome + '=' + c.papel).join(' | '));
const r = M.montarPassos(caixas, furos);
console.log('  passos: ' + r.passos.map((p) => p.id + ' ' + JSON.stringify(p.conta)).join('  '));
ok(r.passos.map((p) => p.id).join(',') === 's1,s3,s4,s5,s6,s7', 'ordem: pinos/cavilhas → suportes → juntar → tambores → prateleira → fim (sem dobradiça/corrediça o passo 2 é pulado)');
const s1 = r.passos[0], s5 = r.passos.find((p) => p.id === 's5');
ok(s1.conta.pino > 0 && s1.conta.cavilha > 0, 'passo 1 conta pinos (' + s1.conta.pino + ') e cavilhas (' + s1.conta.cavilha + ')');
ok(s5.conta.tambor >= s1.conta.pino && !s5.conta.pino, 'passo dos tambores: só tambor, pelo menos 1 por pino (' + s5.conta.tambor + ' tambores, ' + s1.conta.pino + ' pinos)');
ok(r.passos.find((p) => p.id === 's3').conta.suporte === 4, 'passo 3: 4 suportes de prateleira');
const vis = (p) => caixas.filter((c) => p.mostra(c) === 'forte').map((c) => c.nome).join(',');
ok(vis(s1) === 'Lateral esquerda,Lateral direita', 'passo 1 destaca só as chapas que recebem pino/cavilha: ' + vis(s1));
ok(vis(r.passos.find((p) => p.id === 's4')) === 'Lateral esquerda,Lateral direita,Base,Travessa,Fundo', 'passo 4 junta o corpo (sem a prateleira)');
ok(vis(r.passos.find((p) => p.id === 's6')) === 'Prateleira', 'passo 6 destaca a prateleira');
ok(r.passos[r.passos.length - 1].semFrente === true, 'último passo sem porta = "módulo montado"');
console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nTudo OK');
process.exit(falhas ? 1 : 0);
