// Bancada do acervo de imagens do projeto (js/portal-48-acervo.js) — jsdom.
// node scripts/tests/teste-acervo.js
const fs = require('fs'); const path = require('path'); const { JSDOM } = require('jsdom');
const src = fs.readFileSync(path.join(__dirname, '../../js/portal-48-acervo.js'), 'utf8');
const p08 = fs.readFileSync(path.join(__dirname, '../../js/portal-08-projetos-paredes.js'), 'utf8');
let falhas = 0; const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) falhas++; };
const espera = () => new Promise((r) => setTimeout(r, 30));
ok(/savePhotorealRenderToProject\(dataUrl, \{ kind: 'print' \}\)/.test(p08) && /ehPrint \? \{ print: true \}/.test(p08), 'portal-08: o botão Print grava a linha marcada como print');
ok(/LegnoAcervo\.guardaPendente\(dataUrl\)/.test(p08), 'portal-08: print sem projeto salvo vai pra fila');
function monta(com339) {
  const dom = new JSDOM('<body><button id="po-proj-acervo-btn"></button></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window; const banco = { salvos: [], updates: [] };
  w.__banco = banco;
  const q = { _id: null, update(v) { q._v = v; return q; }, eq(c, v) { q._id = v; return q; }, select() { banco.updates.push([q._id, q._v]); return Promise.resolve(com339 ? { data: [{ id: q._id }], error: null } : { data: null, error: { message: 'column is_cover does not exist' } }); } };
  w.supabaseClient = { from: () => q };
  w.alert = (m) => { banco.alerta = m; };
  w.eval('var supabaseClient = window.supabaseClient; var loadedProjectFavorite = null; var projectPhotorealPhotos = []; var limpou = 0;'
    + 'async function savePhotorealRenderToProject(d, o) { __banco.salvos.push([loadedProjectFavorite.id, d, o && o.kind]); projectPhotorealPhotos.unshift({ id: "n" + __banco.salvos.length, image_url: d, created_at: new Date().toISOString(), camera_state: { print: true } }); }'
    + 'function refreshProjectPhotorealGallery() {} function renderProjectPhotorealGallery() {} function setProjectClientInfo() { limpou++; }'
    + 'async function deleteProjectPhotorealPhoto(id) { projectPhotorealPhotos = projectPhotorealPhotos.filter(function (p) { return p.id !== id; }); renderProjectPhotorealGallery(); }'
    + 'async function loadProjectPhotorealPhotos() {}');
  w.eval(src);
  return { w, d: w.document, banco };
}
(async () => {
  const t = monta(true); const A = t.w.LegnoAcervo;
  console.log('tipo e ordem');
  const rows = [
    { id: 'r2', image_url: 'r2', created_at: '2026-11-23T10:00:00Z', camera_state: { position: {}, fov: 50 } },
    { id: 'p1', image_url: 'p1', created_at: '2026-11-20T10:00:00Z', camera_state: { print: true } },
    { id: 'd1', image_url: 'd1', created_at: '2026-11-22T10:00:00Z', camera_state: { decorated: true } },
    { id: 'p2', image_url: 'p2', created_at: '2026-11-21T10:00:00Z', camera_state: { print: true } },
    { id: 'r1', image_url: 'r1', created_at: '2026-11-19T10:00:00Z', camera_state: null }
  ];
  ok(rows.map(A.tipo).join() === 'render,print,decorated,print,render', 'print / render / decorado reconhecidos');
  ok(A.ordena(rows).map((r) => r.id).join() === 'p2,p1,r2,d1,r1', 'sem ★: prints primeiro (mais novo antes), depois o resto');
  ok(A.capas(rows).map((r) => r.id).join() === 'p2,p1', 'sem ★: a 1ª folha usa os prints');
  rows[4].is_cover = true;
  ok(A.ordena(rows).map((r) => r.id).join() === 'r1,p2,p1,r2,d1', 'com ★: a marcada vem antes de tudo');
  ok(A.capas(rows).map((r) => r.id).join() === 'r1', 'com ★: só as marcadas abrem o plano');
  ok(A.capas([rows[0], rows[2]]).length === 0, 'projeto só com render sem ★: plano fica com as perspectivas automáticas');

  console.log('print com projeto não salvo');
  A.guardaPendente('data:1'); A.guardaPendente('data:2');
  ok(A._state.pendentes.length === 2 && t.banco.salvos.length === 0, 'fica na fila, nada vai pro banco');
  t.w.refreshProjectPhotorealGallery(); await espera();
  ok(t.banco.salvos.length === 0, 'sem projeto salvo continua na fila');
  t.w.eval('loadedProjectFavorite = { id: "proj1" }'); t.w.refreshProjectPhotorealGallery(); await espera();
  ok(t.banco.salvos.map((s) => s.join()).join('|') === 'proj1,data:1,print|proj1,data:2,print' && A._state.pendentes.length === 0, 'salvou o projeto = registra os 2, na ordem em que foram feitos');
  A._state.pendentes.push({ dataUrl: 'data:3', em: '' }); t.w.setProjectClientInfo(null);
  ok(A._state.pendentes.length === 0 && t.w.eval('limpou') === 1, 'abrir/limpar outro projeto descarta a fila');

  console.log('janela');
  t.w.eval('projectPhotorealPhotos = ' + JSON.stringify(rows.map((r) => Object.assign({}, r, { is_cover: false }))));
  t.d.getElementById('po-proj-acervo-btn').click(); await espera();
  const cards = () => Array.from(t.d.querySelectorAll('#po-acervo .ac-card [data-ac="capa"]')).map((b) => b.getAttribute('data-id')).join();
  ok(t.d.getElementById('po-acervo').classList.contains('open') && cards() === 'p2,p1,r2,d1,r1', 'botão abre a janela com as 5 imagens');
  ok(t.d.querySelectorAll('#po-acervo .ac-tag.print').length === 2 && t.d.querySelectorAll('#po-acervo .ac-tag.decorated').length === 1, 'etiqueta de tipo em cada uma');
  t.d.querySelector('[data-ac-f="print"]').click();
  ok(cards() === 'p2,p1', 'filtro Prints');
  t.d.querySelector('[data-ac-f="render"]').click();
  ok(cards() === 'r2,d1,r1', 'filtro Renders (inclui o decorado)');
  t.d.querySelector('[data-ac-f="todos"]').click();
  t.d.querySelector('[data-ac="capa"][data-id="r2"]').click(); await espera();
  ok(t.banco.updates[0][0] === 'r2' && t.banco.updates[0][1].is_cover === true && cards().indexOf('r2') === 0, '★ grava e a imagem sobe pro começo');
  t.d.querySelector('[data-ac="excluir"][data-id="p1"]').click(); await espera();
  ok(cards() === 'r2,p2,d1,r1', 'excluir tira da janela');
  t.d.querySelector('[data-ac="fechar"]').click();
  ok(!t.d.getElementById('po-acervo').classList.contains('open'), 'fecha no ×');

  console.log('sem a migration 339');
  const u = monta(false); await espera();
  u.w.eval('loadedProjectFavorite = { id: "p" }; projectPhotorealPhotos = [{ id: "a", image_url: "a", created_at: "2026-11-23T10:00:00Z", camera_state: { print: true } }]');
  u.d.getElementById('po-proj-acervo-btn').click(); await espera();
  u.d.querySelector('[data-ac="capa"]').click(); await espera();
  ok(/339/.test(u.banco.alerta || '') && !u.d.querySelector('.ac-card.capa'), '★ avisa que falta a 339 e não marca');
  console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nTudo certo.'); process.exit(falhas ? 1 : 0);
})();
