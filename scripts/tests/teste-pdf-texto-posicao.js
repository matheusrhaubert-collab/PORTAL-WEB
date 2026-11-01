/* Bancada do texto com posição do PDF (fase 1 fidelidade, 2026-11-01).
 * Rodar no terminal: node scripts/tests/teste-pdf-texto-posicao.js [arquivo.pdf]
 * Precisa do pdfjs-dist (npm i pdfjs-dist@3.11.174 — mesma versão do portal).
 * Sem argumento usa scratch/MEDIDAS_PILI_CUARTO_HIJO.pdf (Canva, cotas em m).
 * Confere: cotas "0,51 m" saem inteiras (não "0," + "51 m"), posição em %,
 * e a auditoria acha as cotas (4,60 m -> 4600) na lista.
 */
const fs = require('fs'), vm = require('vm'), path = require('path');
const R = path.join(__dirname, '..', '..');
const arq = process.argv[2] || path.join(R, 'scratch', 'MEDIDAS_PILI_CUARTO_HIJO.pdf');
let pdfjsLib;
try { pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js'); }
catch (e) { console.log('pdfjs-dist não instalado: no terminal, rode  npm i pdfjs-dist@3.11.174'); process.exit(2); }

// carrega só a função pura do portal-12 (sem DOM)
const src = fs.readFileSync(path.join(R, 'js/portal-12-pdf-projetos.js'), 'utf8');
const m = src.match(/function projectPdfTextItems\([\s\S]*?\n}\n/);
if (!m) { console.log('FALHA: projectPdfTextItems não encontrada'); process.exit(1); }
const g = { console }; vm.createContext(g);
vm.runInContext(m[0] + '\n;this.projectPdfTextItems = projectPdfTextItems;', g);

let falhas = 0;
const ok = (n, c, d) => { console.log((c ? '  OK   ' : '  FALHA') + '  ' + n + (d !== undefined ? '  [' + d + ']' : '')); if (!c) falhas++; };

(async () => {
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(fs.readFileSync(arq)) }).promise;
  const pages = [];
  for (let i = 1; i <= Math.min(doc.numPages, 12); i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    const vp = page.getViewport({ scale: 1 });
    const items = g.projectPdfTextItems(tc.items, vp, pdfjsLib.Util);
    pages.push({ label: 'Página ' + i, items });
    console.log('  p.' + i + ': ' + items.length + ' textos — ' + items.slice(0, 12).map((t) => t.s + '@(' + t.x + ',' + t.y + ')').join(' | '));
  }
  const all = pages.flatMap((p) => p.items);
  const cotas = all.filter((t) => /^\d+,\d+ m$/.test(t.s));
  ok('cotas "0,00 m" inteiras', cotas.length > 30, cotas.length);
  ok('nenhum pedaço solto "0," ou "m"', !all.some((t) => /^\d+,$/.test(t.s) || t.s === 'm'), all.filter((t) => /^\d+,$/.test(t.s) || t.s === 'm').length);
  ok('posições em 0..100', all.every((t) => t.x >= -1 && t.x <= 101 && t.y >= -1 && t.y <= 101));
  const p3 = pages[2] && pages[2].items || [];
  const c460 = p3.find((t) => t.s === '4,60 m');
  ok('p.3 tem "4,60 m" no alto (y < 20%)', c460 && c460.y < 20, c460 && c460.y);
  ok('p.3 tem a cota vertical "2,74 m"', p3.some((t) => t.s === '2,74 m'));
  // a auditoria enxerga as cotas
  let audit;
  try {
    const out = require('child_process').execSync('node --experimental-strip-types -e "import(\'./supabase/functions/generate-project-from-photo/audit.ts\').then(a=>{const p=JSON.parse(require(\'fs\').readFileSync(0,\'utf8\'));process.stdout.write(JSON.stringify(a.allCotasMm(p)))})"', { cwd: R, input: JSON.stringify(pages), stdio: ['pipe', 'pipe', 'ignore'] }).toString();
    audit = JSON.parse(out);
  } catch (e) { audit = null; }
  ok('auditoria converte as cotas (tem 4600, 2740, 510)', audit && [4600, 2740, 510].every((v) => audit.includes(v)), audit && audit.length);
  console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nTUDO OK');
  process.exitCode = falhas ? 1 : 0;
})().catch((e) => { console.log('ERRO', e); process.exitCode = 1; });
