/* Bancada Oven Tower inteiriça (2026-11-01, migration 253).
 * Rodar no terminal: node scripts/tests/teste-oven-tower.js
 * Torre com lateral inteira (casco da Pantry) e interior de fábrica:
 *   embaixo gaveta com frente da gaveta com o topo a 447 do chão (igual ao drawer de 18": 457 − 10),
 *   Base Divisoria, nicho do forno (1270 mm) com Painel Fixo atrás do forno, Base Divisoria,
 *   em cima porta(s) até o topo.
 * Confere: 2 divisórias só (entre os "módulos"), frente da gaveta 457,
 * piso do nicho = topo da frente da gaveta, nicho sem frente, porta de cima
 * nasce no teto do nicho.
 */
const fs = require('fs'), vm = require('vm'), path = require('path');
const R = path.join(__dirname, '..', '..');
const g = { console }; g.window = g; vm.createContext(g);
vm.runInContext(fs.readFileSync(path.join(R, 'js/layout-engine.js'), 'utf8') + '\n;this.LayoutEngine=LayoutEngine;', g);
const L = g.LayoutEngine;
let falhas = 0;
const pn0 = (b) => b.pieces.find((p) => p.kind === 'front' && p.accKey === 'painel_fixo');
const fgTop = (b) => { const f = b.pieces.filter((p) => p.kind === 'front').sort((a, c) => a.y - c.y)[0]; return f.y + f.h; };
const ok = (n, c, d) => { console.log((c ? '  OK   ' : '  FALHA') + '  ' + n + (d !== undefined ? '  [' + d + ']' : '')); if (!c) falhas++; };
const cat = {
  bdiv: { id: 'bdiv', name: 'Base Divisoria', role: 'split', axis: 'y', espessura: null, params: {} },
  gav: { id: 'gav', name: 'Drawer', role: 'content', group_name: 'Drawers', params: {} },
  frente_gaveta_externa: { id: 'frente_gaveta_externa', slug: 'frente_gaveta_externa', name: 'Frente de Gaveta Externa', role: 'front', door_position: 'externa', params: { sobrepoe: true } },
  painel_fixo: { id: 'painel_fixo', slug: 'painel_fixo', name: 'Painel Fixo', role: 'front', door_position: 'externa', params: { sobrepoe: true } },
  porta: { id: 'porta', name: 'Porta Giro Externa', role: 'front', door_position: 'externa', params: { sobrepoe: true } }
};
const GAV = 333, NICHO = 1270, PE = 114;
[[18, 2286], [19.5, 2286], [18, 2438]].forEach(([E, H]) => {
  const zona = { x: E, y: PE + E, z: 0, w: 762 - 2 * E, h: (H - E) - (PE + E), d: 560 };
  const root = L.newVoid({ params: { fabrica: true } });
  root.splitAxis = 'y'; root.splitAcc = 'bdiv';
  const gav = L.newVoid({ sizeMode: 'fixed', sizeValue: 457 - PE - 2 * 18, params: { base_frente_acima_casco_mm: 0, frente_altura_mm: GAV } });
  gav.content = { acc: 'gav', params: { quantidade: 1 } };
  const nicho = L.newVoid({ sizeMode: 'fixed', sizeValue: NICHO, params: { base_frente_acima_casco_mm: GAV + 4 }, fronts: [{ acc: 'painel_fixo', params: {}, from: null, to: null }] });
  const topo = L.newVoid({ fronts: [{ acc: 'porta', params: {}, from: null, to: null }] });
  root.children = [gav, nicho, topo];
  const b = L.build(root, zona, { catalogo: cat, espessura: 19.5, espessuraCasco: E, folgaDobradica: 2 });
  const tag = 'E ' + E + ' H ' + H + ': ';
  const frentes = b.pieces.filter((p) => p.kind === 'front');
  const divs = b.pieces.filter((p) => p.label === 'Base Divisoria').sort((a, c) => a.y - c.y);
  const fg = frentes.slice().sort((a, c) => a.y - c.y)[0];
  ok(tag + '2 divisórias (só entre gaveta/forno/portas)', divs.length === 2, divs.length);
  ok(tag + 'frente da gaveta ' + PE + ' → ' + (PE + GAV), fg && Math.abs(fg.y - PE) < 0.6 && Math.abs(fg.y + fg.h - (PE + GAV)) < 0.6, fg && (fg.y + ' → ' + (fg.y + fg.h)));
  // divisória no MESMO lugar da travessa de cima do drawer de 18" (439..457 em plywood 18)
  ok(tag + 'divisória de baixo do forno acaba onde acaba o drawer de 18" (457, chapa 18)', divs[0] && (E !== 18 || Math.abs(divs[0].y + divs[0].h - 457) < 0.6), divs[0] && (divs[0].y + divs[0].h));
  ok(tag + 'divisória atrás da folga gaveta/painel (painel apoia nela)', divs[0] && pn0(b) && divs[0].y <= fgTop(b) && divs[0].y + divs[0].h >= pn0(b).y, divs[0] && (divs[0].y + '..' + (divs[0].y + divs[0].h)));
  ok(tag + 'nicho livre ' + NICHO, divs[1] && Math.abs(divs[1].y - (divs[0].y + divs[0].h) - NICHO) < 0.6, divs[1] && (divs[1].y - divs[0].y - divs[0].h));
  ok(tag + 'tem gaveta', b.pieces.some((p) => p.kind === 'content'));
  const pn = frentes.find((p) => p.accKey === 'painel_fixo');
  ok(tag + 'painel do forno cobre o nicho', pn && pn.y < divs[0].y + divs[0].h + 5 && pn.y + pn.h > divs[1].y - 5, pn && (Math.round(pn.y) + ' → ' + Math.round(pn.y + pn.h)));
  ok(tag + 'painel no mesmo plano das portas', pn && frentes.every((p) => Math.abs(p.z - pn.z) < 0.6 && Math.abs(p.d - pn.d) < 0.6), frentes.map((p) => p.z + '/' + p.d).join(' '));
  ok(tag + 'painel não encosta na gaveta (folga ≥ 2)', pn && pn.y - (fg.y + fg.h) >= 2, pn && (pn.y - fg.y - fg.h).toFixed(1));
  const fTopo = frentes.filter((p) => p !== fg && p !== pn);
  ok(tag + 'porta em cima (folga ≥ 2 do painel)', fTopo.length >= 1 && fTopo.every((p) => p.y - (pn.y + pn.h) >= 2), fTopo.map((p) => (p.y - pn.y - pn.h).toFixed(1)).join(' '));
  ok(tag + 'porta de cima vai até o topo do casco', fTopo.every((p) => Math.abs(p.y + p.h - H) < 5), fTopo.map((p) => Math.round(p.y + p.h)).join(' '));
});
console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nTUDO OK');
process.exitCode = falhas ? 1 : 0;
