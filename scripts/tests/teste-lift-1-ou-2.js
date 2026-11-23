// Porta lift (Blum HK-XS): 1 ou 2 mecanismos + vão máximo (migration 336).
// Rodar: node scripts/tests/teste-lift-1-ou-2.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const JS = path.join(__dirname, '..', '..', 'js');
const ctx = { console, window: {} }; ctx.global = ctx; ctx.globalThis = ctx; ctx.self = ctx;
vm.createContext(ctx);
['pricing.js', 'layout-engine.js'].forEach((f) => vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f }));
const P = ctx.Pricing || ctx.window.Pricing, LE = ctx.LayoutEngine || ctx.window.LayoutEngine;
let falhas = 0;
const ok = (c, m) => { if (!c) { falhas++; console.log('FALHOU: ' + m); } else console.log('ok: ' + m); };
// porta 19,5 mm a 700 kg/m3; kh = altura do módulo
const kit = (wMm, hMm) => P.liftKitFor(hMm, wMm * hMm * 19.5 / 1e9 * 700, 1, wMm);
const q = (k, code) => (k.itens.find((i) => i.code === code) || {}).qty || 0;
let k = kit(457, 305);
console.log(' 18x12', JSON.stringify({ ff: k.ff, modelo: k.modelo, n: k.mecanismos, aviso: k.aviso }));
ok(k.mecanismos === 1 && !k.aviso, '18"x12": 1 mecanismo, sem aviso');
ok(q(k, 'BLUM-20K5101') === 1 && q(k, 'BLUM-20K4101') === 1, '18"x12": 1 placa de corpo + 1 de porta');
k = kit(600, 381);
console.log(' 600x381', JSON.stringify({ ff: k.ff, modelo: k.modelo, n: k.mecanismos, aviso: k.aviso }));
ok(k.mecanismos === 1, '600 de largura: ainda 1 mecanismo');
k = kit(762, 381);
console.log(' 30x15', JSON.stringify({ ff: k.ff, modelo: k.modelo, n: k.mecanismos, aviso: k.aviso }));
ok(k.mecanismos === 2 && !k.aviso, '30"x15" (larga): 2 mecanismos');
ok(q(k, k.modelo) === 2 && q(k, 'BLUM-20K5101') === 2 && q(k, 'BLUM-20K4101') === 2, '30"x15": 2 de cada');
k = kit(914, 457);
console.log(' 36x18', JSON.stringify({ ff: k.ff, modelo: k.modelo, n: k.mecanismos, aviso: k.aviso }));
ok(k.mecanismos === 2 && !k.aviso, '36"x18": 2 mecanismos, sem aviso');
k = kit(1200, 600);
console.log(' 1200x600', JSON.stringify({ ff: k.ff, modelo: k.modelo, n: k.mecanismos, aviso: k.aviso }));
ok(k.mecanismos === 2 && k.aviso === 'lift_acima_da_faixa', '1200x600: passa do limite, avisa');
k = P.liftKitFor(560, 4.2, 1, 550);
console.log(' estreita pesada', JSON.stringify({ ff: k.ff, modelo: k.modelo, n: k.mecanismos, aviso: k.aviso }));
ok(k.mecanismos === 2, 'porta estreita mas alta/pesada (FF > faixa de 1): 2 mecanismos');
k = P.liftKitFor(381, 4, 3, 500);
ok(q(k, k.modelo) === 3 * k.mecanismos, 'quantidade multiplica pelo nº de portas');
// vão máximo
const acc = { minW: 250, minH: 200, minD: 125, maxW: 1200, maxH: 560 };
ok(LE.cabeNoVao(acc, { w: 800, h: 400, d: 300 }) === true, 'vão 800x400 cabe');
ok(LE.cabeNoVao(acc, { w: 1300, h: 400, d: 300 }) === false, 'vão 1300 de largura NÃO cabe');
ok(LE.cabeNoVao(acc, { w: 800, h: 700, d: 300 }) === false, 'vão 700 de altura NÃO cabe');
ok(LE.cabeNoVao(acc, { w: 800, h: 150, d: 300 }) === false, 'vão 150 de altura NÃO cabe');
ok(LE.cabeNoVao({ minW: 100, minH: 100, minD: 0 }, { w: 5000, h: 5000, d: 300 }) === true, 'agregado sem máximo segue sem teto');
console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\ntudo passou');
process.exit(falhas ? 1 : 0);
