// Bancada dos gaveteiros Gola Base 2 / 3 Drawers (24/11, migration 342).
// node scripts/tests/teste-gola-gaveteiros.js   (só o layout-engine de verdade, sem jsdom)
// Números do módulo do Matt (projeto "TESTE 2 GAVETAS"): 800,1 × 876,3 × 609,6, pés de 114.
const fs = require('fs'); const path = require('path'); const vm = require('vm');
const R = path.join(__dirname, '..', '..');
const g = { console }; vm.createContext(g);
vm.runInContext(fs.readFileSync(path.join(R, 'js/layout-engine.js'), 'utf8') + '\n;this.LayoutEngine=LayoutEngine;', g);
const LE = g.LayoutEngine;
let falhas = 0; const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) falhas++; };
const cat = {
  gola: { id: 'gola', name: 'Gola (meio)', role: 'split', axis: 'y', espessura: 76, params: { gola_l: true, recorte_d_mm: 40 } },
  gav: { id: 'gav', name: 'Drawer', role: 'content', group_name: 'Drawers', params: {} },
  frente_gaveta_externa: { id: 'frente_gaveta_externa', slug: 'frente_gaveta_externa', name: 'Frente de Gaveta Externa', role: 'front', door_position: 'externa', params: { sobrepoe: true } }
};
const H = 876.3;
// zona do portal com gola em cima: começa no fundo (114 + 19,5) e para embaixo da gola (H − 76)
const zona = { x: 19.5, y: 133.5, z: 19.5, w: 761.1, h: (H - 76) - 133.5, d: 589.1, temFundo: true };
const opts = { catalogo: cat, espessura: 19.5, espessuraCasco: 19.5, folgaDobradica: 2, temFundo: true, golaFrenteTopo: H - 40, golaRebaixoMm: 40 };

// mesma árvore que a migration 342 grava
function arvore(qtdCima, comParams) {
  const r = LE.newVoid(); r.splitAxis = 'y'; r.splitAcc = 'gola'; r.params = { fabrica: true };
  const baixo = LE.newVoid({ content: { acc: 'gav', params: {} } });
  baixo.sizeMode = 'fixed'; baixo.sizeValue = 288;
  const cimaParams = qtdCima > 1 ? { quantidade: qtdCima } : {};
  const cima = LE.newVoid({ content: { acc: 'gav', params: cimaParams } });
  if (comParams) {
    cima.params = { base_frente_acima_casco_mm: 382 };
    if (qtdCima > 1) cima.params.caixote_cima_subir_mm = 30;
  }
  r.children = [baixo, cima];
  return r;
}
const fr = (b) => b.pieces.filter((p) => p.kind === 'front').sort((a, c) => a.y - c.y);
const cx = (b) => b.pieces.filter((p) => p.kind === 'content').sort((a, c) => a.y - c.y);
const vista = (b) => b.pieces.find((p) => p.kind === 'split' && /vista/.test(p.label || ''));
const f1 = (n) => n.toFixed(1);

console.log('Gola Base 2 Drawers');
let b = LE.build(arvore(1, true), zona, opts);
let f = fr(b), v = vista(b);
ok(f.length === 2 && !!v, '2 frentes + gola do meio');
ok(Math.abs(v.y + v.h - 498) <= 1, 'gola do meio com o topo a 498 do chão (' + f1(v.y + v.h) + ')');
ok(Math.abs(f[0].y - 116) <= 1 && Math.abs(f[0].y + f[0].h - 458) <= 1, 'frente de baixo 116..458 = 342 (' + f1(f[0].y) + '..' + f1(f[0].y + f[0].h) + ')');
ok(Math.abs(f[1].y - 496) <= 1 && Math.abs(f[1].y + f[1].h - (H - 40)) <= 1, 'frente de cima 496..836,3 = 340 (' + f1(f[1].y) + '..' + f1(f[1].y + f[1].h) + ')');
ok(Math.abs(f[1].y - (f[0].y + f[0].h) - 38) <= 1, '38 mm livres pra mão na gola do meio (igual ao ajuste do Matt)');

console.log('Gola Base 3 Drawers');
b = LE.build(arvore(2, true), zona, opts);
f = fr(b); const c = cx(b);
ok(f.length === 3 && c.length === 3, '3 frentes + 3 caixotes');
ok(Math.abs(f[0].y + f[0].h - 458) <= 1, 'frente de baixo igual à do 2 Drawers (até 458)');
ok(Math.abs(f[1].y - 496) <= 1, '1ª frente de cima começa em 496 (' + f1(f[1].y) + ')');
ok(Math.abs(f[2].y + f[2].h - (H - 40)) <= 1, 'última frente vai até 40 mm do topo (' + f1(f[2].y + f[2].h) + ')');
ok(Math.abs(f[1].h - f[2].h) < 0.01, 'as 2 frentes de cima iguais (' + f1(f[1].h) + ' / ' + f1(f[2].h) + ')');
ok(Math.abs(f[2].y - (f[1].y + f[1].h) - 3) <= 1, '3 mm entre as 2 frentes de cima');
const bSem = LE.build(arvore(2, false), zona, opts); const cSem = cx(bSem);
ok(Math.abs(c[2].y - cSem[2].y - 30) < 0.01, 'caixote de CIMA subiu 30 mm (' + f1(cSem[2].y) + ' → ' + f1(c[2].y) + ')');
ok(Math.abs(c[1].y - cSem[1].y) < 0.01 && Math.abs(c[0].y - cSem[0].y) < 0.01, 'os outros caixotes não mudaram');
ok(Math.abs(c[2].h - cSem[2].h) < 0.01, 'altura do caixote não mudou');
const vaoTopo = zona.y + zona.h;
ok(c[2].y + c[2].h <= vaoTopo - 2 + 1, 'caixote de cima não passa da gola de cima (topo ' + f1(c[2].y + c[2].h) + ' ≤ ' + f1(vaoTopo - 2) + ')');
const corredica = c[2].y - 14;
ok(corredica > f[1].y + f[1].h, 'corrediça de cima (' + f1(corredica) + ') acima do topo da frente de baixo (' + f1(f[1].y + f[1].h) + ')');
ok(corredica - (c[1].y + c[1].h) > 50, 'folga da corrediça de cima até o caixote do meio: ' + f1(corredica - (c[1].y + c[1].h)) + ' mm');

console.log('subida limitada pelo topo do vão');
const rx = arvore(2, true); rx.children[1].params.caixote_cima_subir_mm = 500;
const cx2 = cx(LE.build(rx, zona, opts));
ok(Math.abs(cx2[2].y + cx2[2].h - (vaoTopo - 2)) <= 1, 'pedindo 500 mm, para 2 mm abaixo do topo do vão');

console.log('sem os params novos nada muda');
const r0 = arvore(2, false);
const a0 = JSON.stringify(LE.build(r0, zona, opts).pieces.map((p) => [p.kind, p.y, p.h]));
const r1 = arvore(2, false); r1.children[1].params = { caixote_cima_subir_mm: 0 };
const a1 = JSON.stringify(LE.build(r1, zona, opts).pieces.map((p) => [p.kind, p.y, p.h]));
ok(a0 === a1, 'árvore sem base/subida: peças idênticas');

console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nTudo certo.'); process.exit(falhas ? 1 : 0);
