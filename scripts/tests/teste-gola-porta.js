// Bancada da gola em cima (23/11): vão embaixo da gola e porta/frente até 30 mm do topo.
// node scripts/tests/teste-gola-porta.js   (só o layout-engine de verdade, sem jsdom)
const fs = require('fs'); const path = require('path'); const vm = require('vm');
const R = path.join(__dirname, '..', '..');
const g = { console }; vm.createContext(g);
vm.runInContext(fs.readFileSync(path.join(R, 'js/layout-engine.js'), 'utf8') + '\n;this.LayoutEngine=LayoutEngine;', g);
const LE = g.LayoutEngine;
let falhas = 0; const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) falhas++; };
const cat = {
  porta: { id: 'porta', name: 'Porta Giro Externa', role: 'front', door_position: 'externa', door_mechanism: 'porta_giro', params: { lado: 'left', sobrepoe: true } },
  prat: { id: 'prat', name: 'Base Divisória', role: 'split', axis: 'y', espessura: null, params: {} },
  gola: { id: 'gola', name: 'Gola (meio)', role: 'split', axis: 'y', espessura: 76, params: { gola_l: true, recorte_d_mm: 40 } },
  gav: { id: 'gav', name: 'Drawer', role: 'content', group_name: 'Drawers', params: {} },
  frente_gaveta_externa: { id: 'frente_gaveta_externa', slug: 'frente_gaveta_externa', name: 'Frente de Gaveta Externa', role: 'front', door_position: 'externa', params: { sobrepoe: true } }
};
// módulo 800 × 900: zona 19,5..780,5 em x; 133,5 até embaixo da gola (900 − 76 = 824)
const zona = { x: 19.5, y: 133.5, z: 19.5, w: 761, h: 824 - 133.5, d: 539.5, temFundo: true };
const opts = (gola) => ({ catalogo: cat, espessura: 19.5, espessuraCasco: 19.5, folgaDobradica: 2, temFundo: true, golaFrenteTopo: gola ? 860 : 0, golaRebaixoMm: gola ? 40 : 0 });
const portaRaiz = () => LE.newVoid({ fronts: [{ acc: 'porta', params: {}, from: null, to: null }] });
const frente = (b) => b.pieces.filter((p) => p.kind === 'front');
let sem = frente(LE.build(portaRaiz(), zona, opts(false)));
let com = frente(LE.build(portaRaiz(), zona, opts(true)));
ok(sem.length >= 1 && com.length >= 1, 'porta gerada nos dois casos');
const topo = (l) => Math.max.apply(null, l.map((p) => p.y + p.h));
const base = (l) => Math.min.apply(null, l.map((p) => p.y));
ok(Math.abs(topo(com) - 860) < 0.01, 'com gola: topo da porta = 900 − 40 = 860 (' + topo(com).toFixed(1) + ')');
ok(topo(sem) < 860, 'sem o opt: porta para no vão (' + topo(sem).toFixed(1) + ') — nada muda pra quem não é gola');
ok(Math.abs(base(com) - base(sem)) < 0.01, 'a base da porta não muda');
// porta num vão de BAIXO (não encosta no topo): não mexe
const r2 = LE.newVoid(); r2.splitAxis = 'y'; r2.splitAcc = 'prat';
r2.children = [LE.newVoid({ fronts: [{ acc: 'porta', params: {}, from: null, to: null }] }), LE.newVoid()];
const baixo = frente(LE.build(r2, zona, opts(true)));
ok(baixo.length && topo(baixo) < 600, 'porta de um vão que não encosta no topo: não sobe (' + (baixo.length ? topo(baixo).toFixed(1) : '-') + ')');
// regra de fábrica ganha
const r3 = portaRaiz(); r3.params = { frente_topo_abaixo_casco_mm: 10 };
const fab = frente(LE.build(r3, zona, opts(true)));
ok(Math.abs(topo(fab) - 860) > 1, 'árvore com frente_topo_abaixo_casco_mm: vale a regra da fábrica, não a da gola (' + topo(fab).toFixed(1) + ')');

console.log('gola do MEIO com 2 gavetas (caso da tela do Matt)');
const duas = () => {
  const r = LE.newVoid(); r.splitAxis = 'y'; r.splitAcc = 'gola';
  r.children = [LE.newVoid({ content: { acc: 'gav', params: { count: 1 } } }), LE.newVoid({ content: { acc: 'gav', params: { count: 1 } } })];
  return r;
};
const fr = (b) => b.pieces.filter((p) => p.kind === 'front').sort((a, c) => a.y - c.y);
const golaV = (b) => b.pieces.find((p) => p.kind === 'split' && /vista/.test(p.label || ''));
let bSem = LE.build(duas(), zona, opts(false)), bCom = LE.build(duas(), zona, opts(true));
const gv = golaV(bCom), fSem = fr(bSem), fCom = fr(bCom);
ok(!!gv && fCom.length === 2 && fSem.length === 2, 'gola do meio e 2 frentes de gaveta geradas');
const gTop = gv.y + gv.h;
ok(Math.abs(fCom[0].y + fCom[0].h - (gTop - 40)) < 0.01, 'gaveta de BAIXO sobe por cima da gola até 40 mm do topo dela (' + (fCom[0].y + fCom[0].h).toFixed(1) + ' = ' + (gTop - 40).toFixed(1) + ')');
ok(Math.abs(fCom[1].y - gTop) < 0.01, 'gaveta de CIMA não desce por cima da gola (base = topo da gola, ' + fCom[1].y.toFixed(1) + ')');
ok(Math.abs(fCom[1].y - (fCom[0].y + fCom[0].h) - 40) < 0.01, 'sobram 40 mm livres pra mão entre as duas frentes');
ok(Math.abs(fCom[1].y + fCom[1].h - 860) < 0.01, 'gaveta de cima continua até 40 mm do topo do módulo (gola de cima)');
ok(Math.abs(fCom[0].y - fSem[0].y) < 0.01, 'base da gaveta de baixo não muda');

console.log('gavetas normais (sem gola) NÃO mudam');
const normais = () => {
  const r = LE.newVoid(); r.splitAxis = 'y'; r.splitAcc = 'prat';
  r.children = [LE.newVoid({ content: { acc: 'gav', params: { count: 1 } } }), LE.newVoid({ content: { acc: 'gav', params: { count: 2 } } })];
  return r;
};
const zonaNormal = { x: 19.5, y: 133.5, z: 19.5, w: 761, h: 880.5 - 133.5, d: 539.5, temFundo: true };
const nSem = LE.build(normais(), zonaNormal, { catalogo: cat, espessura: 19.5, espessuraCasco: 19.5, folgaDobradica: 2, temFundo: true });
const nCom = LE.build(normais(), zonaNormal, { catalogo: cat, espessura: 19.5, espessuraCasco: 19.5, folgaDobradica: 2, temFundo: true, golaRebaixoMm: 40 });
ok(JSON.stringify(fr(nSem).map((p) => [p.y, p.h])) === JSON.stringify(fr(nCom).map((p) => [p.y, p.h])), 'módulo sem gola: frentes idênticas com ou sem a regra nova');
console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nTudo certo.'); process.exit(falhas ? 1 : 0);
