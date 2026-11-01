/* Bancada da fase 2 (recorte por vista, 2026-11-01).
 * Rodar no terminal: node scripts/tests/teste-pdf-recorte-vista.js
 * Confere projectPdfCropPlan (escala/retângulo) e projectPdfPickViews
 * (quais vistas viram recorte) sem DOM.
 */
const fs = require('fs'), vm = require('vm'), path = require('path');
const R = path.join(__dirname, '..', '..');
const src = fs.readFileSync(path.join(R, 'js/portal-12-pdf-projetos.js'), 'utf8');
const pega = (re) => { const m = src.match(re); if (!m) throw new Error('não achei ' + re); return m[0]; };
const g = { console }; vm.createContext(g);
vm.runInContext(
  pega(/const PROJECT_PDF_CROP_PX = [^\n]*\n/) + pega(/const PROJECT_PDF_MAX_CROPS_PER_ROOM = [^\n]*\n/) +
  pega(/const PROJECT_PDF_CROP_SKIP_AREA = [^\n]*\n/) + pega(/const PROJECT_PDF_CROP_KINDS = [^\n]*\n/) +
  pega(/const PROJECT_PDF_CANVAS_MAX_PX = [^\n]*\n/) +
  pega(/function projectPdfCropPlan\([\s\S]*?\n}\n/) + pega(/function projectPdfPickViews\([\s\S]*?\n}\n/) +
  ';this.plan = projectPdfCropPlan; this.pick = projectPdfPickViews;', g);
let falhas = 0;
const ok = (n, c, d) => { console.log((c ? '  OK   ' : '  FALHA') + '  ' + n + (d !== undefined ? '  [' + JSON.stringify(d) + ']' : '')); if (!c) falhas++; };

// página Canva 1440×810 pt; vista pequena de 30% × 40%
let p = g.plan({ x: 10, y: 20, w: 30, h: 40 }, 1440, 810, 2000);
// 30% de 1440 = 432 pt; 4× (teto do pdf.js) = 1728 px — era ~660 px na prancha inteira de 2200
ok('recorte pequeno: lado maior = 432 × 4 = 1728 px (teto de 4×)', Math.abs(Math.max(p.sw, p.sh) - 1728) < 3, [p.sw, p.sh]);
ok('escala ≤ 4', p.scale <= 4, p.scale);
ok('retângulo começa em 10%/20% da página na escala', Math.abs(p.sx - 144 * p.scale) < 1 && Math.abs(p.sy - 162 * p.scale) < 1);
// vista grande (90% × 90%): escala limitada pelo lado maior
p = g.plan({ x: 5, y: 5, w: 90, h: 90 }, 1440, 810, 2000);
ok('vista grande: lado maior ≈ 2000', Math.abs(Math.max(p.sw, p.sh) - 2000) < 3, [p.sw, p.sh]);
// página A0 (3370×2384 pt): canvas limitado a 24 Mpx
p = g.plan({ x: 0, y: 0, w: 10, h: 10 }, 3370, 2384, 2000);
ok('A0: escala respeita o limite do canvas', p.scale * p.scale * 3370 * 2384 <= 24e6 + 1, p.scale);

const vistas = [
  { page: 3, kind: 'elevation', label: 'Elevação fundo', x: 2, y: 2, w: 96, h: 96 },   // página toda → pula
  { page: 6, kind: 'elevation', label: 'Elevação grande', x: 5, y: 5, w: 60, h: 70 },
  { page: 6, kind: 'section', label: 'Corte lateral', x: 70, y: 5, w: 25, h: 70 },
  { page: 6, kind: 'render', label: 'Render', x: 0, y: 0, w: 100, h: 100 },          // render → pula
  { page: 9, kind: 'plan', label: 'Planta', x: 10, y: 10, w: 40, h: 40 },              // página fora do ambiente → pula
  { page: 4, kind: 'detail', label: 'Detalhe', x: 10, y: 10, w: 20, h: 20 },
  { page: 4, kind: 'plan', label: 'Planta', x: 50, y: 10, w: 40, h: 40 }
];
const esc = g.pick(vistas, [3, 4, 6]);
ok('4 recortes (sem página inteira, render e página de fora)', esc.length === 4, esc.map((v) => v.label));
ok('planta vem primeiro, detalhe por último', esc[0].kind === 'plan' && esc[esc.length - 1].kind === 'detail');
const muitos = Array.from({ length: 15 }, (_, i) => ({ page: 4, kind: 'elevation', label: 'v' + i, x: (i % 5) * 18, y: Math.floor(i / 5) * 30, w: 15, h: 25 }));
ok('máximo 10 recortes', g.pick(muitos, [4]).length === 10);
console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nTUDO OK');
process.exitCode = falhas ? 1 : 0;
