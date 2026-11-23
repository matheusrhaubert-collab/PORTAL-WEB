// ============================================================
// ACERVO DE IMAGENS DO PROJETO (23/11/2026)
// ============================================================
// Matt, 23/11: "quero que quando eu faça um print ou render ele fique
// registrado no projeto, e quero que busque os prints para primeira folha da
// proposta ou plano técnico. pode criar um acervo de imagens geradas e um
// botão pra consultar imagens (na própria aba de foto)".
//
// O QUE JÁ EXISTIA: print e render de projeto SALVO entram em
// project_photoreal_photos (migration 077, savePhotorealRenderToProject no
// portal-08) e a Proposta já levava todas. Este arquivo acrescenta:
// - Botão "Imagens" (#po-proj-acervo-btn, menu Render) → janela #po-acervo
//   com TODAS as imagens do projeto: tipo (Print / Render / Render decorado),
//   data, ver grande, baixar, excluir, ★ capa. Filtro por tipo.
// - Tipo: acervoTipo(row) — camera_state.print (gravado pelo botão Print
//   desde hoje) / camera_state.decorated (portal-36) / senão render. Print
//   antigo (antes de 23/11) aparece como Render.
// - PRINT COM PROJETO NÃO SALVO: fica na fila (acervo.pendentes, só na
//   memória) e é registrado sozinho no 1º Salvar (embrulha
//   refreshProjectPhotorealGallery). Abrir/limpar outro projeto descarta a
//   fila (embrulha setProjectClientInfo, chamado só nesses 2 pontos).
// - 1ª FOLHA: LegnoAcervo.ordena(rows) = ★ primeiro, depois prints, depois o
//   resto (cada grupo do mais novo pro mais velho) — a Proposta (portal-10)
//   usa essa ordem. LegnoAcervo.capasCanvas() = ★ ou, sem nenhuma, os prints
//   (máx. ACERVO_MAX_CAPAS) como canvas pro Plano técnico (portal-14), que
//   troca as perspectivas automáticas por elas.
// - ★ precisa da migration 339 (coluna is_cover + UPDATE pro dono). Sem ela
//   a estrela avisa e a 1ª folha usa os prints.
// Carregado por último. Bancada: node scripts/tests/teste-acervo.js

const ACERVO_MAX_CAPAS = 4;
const acervo = { pendentes: [], filtro: 'todos', subindo: false };

const ACERVO_TXT = {
  pt: { titulo: 'Imagens do projeto', sub: '★ = vai na primeira folha da proposta e do plano técnico. Sem nenhuma ★, entram os prints.', todos: 'Todas', print: 'Print', render: 'Render', decorated: 'Render decorado', prints: 'Prints', renders: 'Renders', vazio: 'Nenhuma imagem ainda. Use Print ou Render no menu Render — cada imagem fica guardada aqui.', vazio_f: 'Nenhuma imagem desse tipo.', pend: 'Aguardando salvar o projeto', pend_sub: 'Estes prints são registrados sozinhos quando você salvar o projeto.', capa_on: 'Tirar da primeira folha', capa_off: 'Usar na primeira folha', baixar: 'Baixar', excluir: 'Excluir', descartar: 'Descartar', fechar: 'Fechar', need339: 'Para marcar a capa falta rodar a migration 339 no Supabase. Enquanto isso, a primeira folha usa os prints.', print_ok: 'Print guardado nas imagens do projeto', print_pend: 'Print guardado — será registrado quando você salvar o projeto', flush_ok: '{n} print(s) registrado(s) no projeto', capa: 'capa' },
  en: { titulo: 'Project images', sub: '★ = goes on the first page of the proposal and the technical plan. With no ★, the prints are used.', todos: 'All', print: 'Print', render: 'Render', decorated: 'Decorated render', prints: 'Prints', renders: 'Renders', vazio: 'No images yet. Use Print or Render in the Render menu — every image is kept here.', vazio_f: 'No images of this kind.', pend: 'Waiting for the project to be saved', pend_sub: 'These prints are registered automatically when you save the project.', capa_on: 'Remove from first page', capa_off: 'Use on first page', baixar: 'Download', excluir: 'Delete', descartar: 'Discard', fechar: 'Close', need339: 'Marking the cover needs migration 339 in Supabase. Meanwhile the first page uses the prints.', print_ok: 'Print saved to the project images', print_pend: 'Print kept — it will be registered when you save the project', flush_ok: '{n} print(s) registered in the project', capa: 'cover' },
  es: { titulo: 'Imágenes del proyecto', sub: '★ = va en la primera hoja de la propuesta y del plano técnico. Sin ninguna ★, entran las capturas.', todos: 'Todas', print: 'Captura', render: 'Render', decorated: 'Render decorado', prints: 'Capturas', renders: 'Renders', vazio: 'Aún no hay imágenes. Usa Print o Render en el menú Render — cada imagen queda guardada aquí.', vazio_f: 'No hay imágenes de ese tipo.', pend: 'Esperando guardar el proyecto', pend_sub: 'Estas capturas se registran solas cuando guardes el proyecto.', capa_on: 'Quitar de la primera hoja', capa_off: 'Usar en la primera hoja', baixar: 'Descargar', excluir: 'Eliminar', descartar: 'Descartar', fechar: 'Cerrar', need339: 'Para marcar la portada falta ejecutar la migration 339 en Supabase. Mientras tanto la primera hoja usa las capturas.', print_ok: 'Captura guardada en las imágenes del proyecto', print_pend: 'Captura guardada — se registrará cuando guardes el proyecto', flush_ok: '{n} captura(s) registrada(s) en el proyecto', capa: 'portada' }
};
function acervoT(k, n) {
  let l = 'en';
  try { l = (typeof I18n !== 'undefined' && I18n.getLanguage) ? I18n.getLanguage() : 'en'; } catch (e) { /* en */ }
  const v = (ACERVO_TXT[l] || ACERVO_TXT.en)[k]; const s = v != null ? v : (ACERVO_TXT.en[k] || k);
  return n != null ? s.replace('{n}', n) : s;
}
function acervoEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ---------- tipo e ordem ----------
function acervoTipo(row) {
  const c = row && row.camera_state;
  if (c && typeof c === 'object') { if (c.decorated) return 'decorated'; if (c.print) return 'print'; }
  return 'render';
}
function acervoOrdena(rows) {
  const peso = (r) => (r.is_cover === true ? 0 : acervoTipo(r) === 'print' ? 1 : 2);
  return (rows || []).map((r, i) => ({ r, i })).sort((a, b) => {
    const d = peso(a.r) - peso(b.r);
    if (d) return d;
    const ta = String(a.r.created_at || ''), tb = String(b.r.created_at || '');
    if (ta !== tb) return ta < tb ? 1 : -1;
    return a.i - b.i;
  }).map((x) => x.r);
}
// As que abrem a proposta/plano: ★; sem nenhuma, os prints.
function acervoCapas(rows) {
  const ord = acervoOrdena(rows);
  const estrela = ord.filter((r) => r.is_cover === true);
  return (estrela.length ? estrela : ord.filter((r) => acervoTipo(r) === 'print')).slice(0, ACERVO_MAX_CAPAS);
}
function acervoProjetoId() {
  return (typeof loadedProjectFavorite !== 'undefined' && loadedProjectFavorite && loadedProjectFavorite.id) ? loadedProjectFavorite.id : null;
}
function acervoLinhas() { return (typeof projectPhotorealPhotos !== 'undefined' && Array.isArray(projectPhotorealPhotos)) ? projectPhotorealPhotos : []; }

async function acervoUrlParaCanvas(url) {
  let src = url;
  try { if (typeof proposalUrlToDataUrl === 'function') src = (await proposalUrlToDataUrl(url)) || url; } catch (e) { /* tenta direto */ }
  const img = await new Promise((ok, erro) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => ok(i); i.onerror = erro; i.src = src; });
  const c = document.createElement('canvas');
  c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height;
  c.getContext('2d').drawImage(img, 0, 0);
  return c;
}
// Plano técnico: lê do banco na hora (o plano da PASTA abre projeto por
// projeto e a grade da tela pode ainda não ter chegado).
async function acervoCapasCanvas() {
  const pid = acervoProjetoId();
  if (!pid) return [];
  let rows = [];
  try {
    const { data, error } = await supabaseClient.from('project_photoreal_photos').select('*').eq('project_id', pid).order('created_at', { ascending: false });
    if (!error) rows = data || [];
  } catch (e) { rows = []; }
  const out = [];
  for (const r of acervoCapas(rows)) {
    try { out.push(await acervoUrlParaCanvas(r.image_url)); } catch (e) { /* imagem que não abriu fica de fora */ }
  }
  return out;
}

// ---------- aviso curto ----------
function acervoAviso(k, n) {
  let el = document.getElementById('po-acervo-toast');
  if (!el) { el = document.createElement('div'); el.id = 'po-acervo-toast'; document.body.appendChild(el); }
  acervoCss();
  el.textContent = acervoT(k, n);
  el.classList.add('on');
  clearTimeout(acervoAviso._t);
  acervoAviso._t = setTimeout(() => el.classList.remove('on'), 3200);
}

// ---------- prints de projeto ainda não salvo ----------
function acervoGuardaPendente(dataUrl) {
  if (!dataUrl) return;
  acervo.pendentes.unshift({ dataUrl, em: new Date().toISOString() });
  acervoAviso('print_pend');
  acervoDesenha();
}
async function acervoSobePendentes() {
  if (acervo.subindo || !acervo.pendentes.length || !acervoProjetoId()) return;
  if (typeof savePhotorealRenderToProject !== 'function') return;
  acervo.subindo = true;
  const pid = acervoProjetoId(); let n = 0;
  try {
    // do mais velho pro mais novo: o último print feito fica como o mais recente
    while (acervo.pendentes.length && acervoProjetoId() === pid) {
      const p = acervo.pendentes[acervo.pendentes.length - 1];
      await savePhotorealRenderToProject(p.dataUrl, { kind: 'print' });
      acervo.pendentes.pop(); n++;
    }
  } catch (e) { console.warn('[acervo] não consegui registrar um print pendente', e); }
  acervo.subindo = false;
  if (n) acervoAviso('flush_ok', n);
  acervoDesenha();
}
if (typeof refreshProjectPhotorealGallery === 'function') {
  const orig = refreshProjectPhotorealGallery;
  window.refreshProjectPhotorealGallery = function () {
    const r = orig.apply(this, arguments);
    if (acervo.pendentes.length && acervoProjetoId()) setTimeout(acervoSobePendentes, 0);
    return r;
  };
}
if (typeof setProjectClientInfo === 'function') {
  const orig = setProjectClientInfo; // abrir ou limpar projeto = a fila era do projeto anterior
  window.setProjectClientInfo = function () { acervo.pendentes = []; return orig.apply(this, arguments); };
}
if (typeof renderProjectPhotorealGallery === 'function') {
  const orig = renderProjectPhotorealGallery; // a grade mudou = a janela acompanha
  window.renderProjectPhotorealGallery = function () { const r = orig.apply(this, arguments); acervoDesenha(); return r; };
}

// ---------- janela ----------
function acervoCss() {
  if (document.getElementById('po-acervo-css')) return;
  const st = document.createElement('style'); st.id = 'po-acervo-css';
  st.textContent = '#po-acervo{position:fixed;inset:0;z-index:3300;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.55);padding:16px}#po-acervo.open{display:flex}'
    + '#po-acervo .ac-box{background:var(--panel,#fff);color:var(--text,#2b2621);border-radius:14px;width:1100px;max-width:96vw;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.3)}'
    + '#po-acervo .ac-top{display:flex;align-items:flex-start;gap:12px;padding:16px 18px 8px}#po-acervo .ac-top h3{margin:0;font-size:17px}#po-acervo .ac-top p{margin:3px 0 0;font-size:12px;color:var(--muted,#766f64)}'
    + '#po-acervo .ac-x{margin-left:auto;width:auto;background:none;border:0;box-shadow:none;color:var(--muted,#766f64);font-size:22px;line-height:1;cursor:pointer;padding:0 4px}'
    + '#po-acervo .ac-filtros{display:flex;gap:6px;padding:4px 18px 10px;flex-wrap:wrap}'
    + '#po-acervo .ac-f{width:auto;margin:0;padding:5px 12px;border-radius:999px;border:1px solid var(--border,#ddd6cb);background:var(--panel,#fff);color:var(--text,#2b2621);font-size:12px;box-shadow:none;cursor:pointer}'
    + '#po-acervo .ac-f.on{background:#2b2621;border-color:#2b2621;color:#fff}'
    + '#po-acervo .ac-corpo{overflow:auto;padding:0 18px 18px}'
    + '#po-acervo .ac-sec{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--muted,#766f64);margin:8px 0 2px}#po-acervo .ac-sec + p{margin:0 0 8px;font-size:12px;color:var(--muted,#766f64)}'
    + '#po-acervo .ac-grade{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px;margin-bottom:10px}'
    + '#po-acervo .ac-card{border:1px solid var(--border,#ddd6cb);border-radius:10px;overflow:hidden;background:var(--panel,#fff);display:flex;flex-direction:column}'
    + '#po-acervo .ac-card.capa{border-color:#c98a1b;box-shadow:0 0 0 2px rgba(201,138,27,.25)}'
    + '#po-acervo .ac-img{position:relative;aspect-ratio:16/10;background:#f1ede7;cursor:zoom-in}#po-acervo .ac-img img{width:100%;height:100%;object-fit:contain;display:block}'
    + '#po-acervo .ac-tag{position:absolute;left:6px;top:6px;font-size:10px;font-weight:700;text-transform:uppercase;padding:2px 6px;border-radius:5px;background:rgba(43,38,33,.82);color:#fff}'
    + '#po-acervo .ac-tag.print{background:#2f6f4f}#po-acervo .ac-tag.decorated{background:#6e4527}'
    + '#po-acervo .ac-tagc{position:absolute;right:6px;top:6px;font-size:10px;font-weight:700;text-transform:uppercase;padding:2px 6px;border-radius:5px;background:#c98a1b;color:#fff}'
    + '#po-acervo .ac-pe{display:flex;align-items:center;gap:4px;padding:6px 8px;font-size:11px;color:var(--muted,#766f64)}#po-acervo .ac-pe span{margin-right:auto}'
    + '#po-acervo .ac-b{width:30px;height:28px;margin:0;padding:0;border:1px solid var(--border,#ddd6cb);border-radius:7px;background:var(--panel,#fff);color:var(--text,#2b2621);font-size:14px;line-height:1;box-shadow:none;cursor:pointer}'
    + '#po-acervo .ac-b:hover{border-color:var(--accent,#8a5a36)}#po-acervo .ac-b.on{background:#c98a1b;border-color:#c98a1b;color:#fff}'
    + '#po-acervo .ac-vazio{padding:40px 10px;text-align:center;color:var(--muted,#766f64);font-size:13px}'
    + '#po-acervo-toast{position:fixed;left:50%;bottom:28px;transform:translate(-50%,20px);z-index:3600;background:#2b2621;color:#fff;font-size:13px;padding:9px 16px;border-radius:999px;opacity:0;pointer-events:none;transition:opacity .2s,transform .2s}'
    + '#po-acervo-toast.on{opacity:1;transform:translate(-50%,0)}';
  document.head.appendChild(st);
}
function acervoData(iso) {
  try { return new Date(iso).toLocaleString([], { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; }
}
function acervoHtml() {
  const linhas = acervoOrdena(acervoLinhas());
  const conta = { todos: linhas.length, print: 0, render: 0 };
  linhas.forEach((r) => { if (acervoTipo(r) === 'print') conta.print++; else conta.render++; });
  const f = acervo.filtro;
  const vis = linhas.filter((r) => f === 'todos' || (f === 'print' ? acervoTipo(r) === 'print' : acervoTipo(r) !== 'print'));
  const chip = (k, rot) => '<button type="button" class="ac-f' + (f === k ? ' on' : '') + '" data-ac-f="' + k + '">' + acervoEsc(rot) + ' (' + conta[k] + ')</button>';
  let h = '<div class="ac-top"><div><h3>' + acervoEsc(acervoT('titulo')) + '</h3><p>' + acervoEsc(acervoT('sub')) + '</p></div>'
    + '<button type="button" class="ac-x" data-ac="fechar" title="' + acervoEsc(acervoT('fechar')) + '">×</button></div>'
    + '<div class="ac-filtros">' + chip('todos', acervoT('todos')) + chip('print', acervoT('prints')) + chip('render', acervoT('renders')) + '</div><div class="ac-corpo">';
  if (acervo.pendentes.length && f !== 'render') {
    h += '<div class="ac-sec">' + acervoEsc(acervoT('pend')) + '</div><p>' + acervoEsc(acervoT('pend_sub')) + '</p><div class="ac-grade">'
      + acervo.pendentes.map((p, i) => '<div class="ac-card"><div class="ac-img" data-ac="ver" data-url="' + acervoEsc(p.dataUrl) + '"><img src="' + acervoEsc(p.dataUrl) + '" alt=""><span class="ac-tag print">' + acervoEsc(acervoT('print')) + '</span></div>'
        + '<div class="ac-pe"><span>' + acervoEsc(acervoData(p.em)) + '</span><button type="button" class="ac-b" data-ac="descartar" data-i="' + i + '" title="' + acervoEsc(acervoT('descartar')) + '">🗑</button></div></div>').join('')
      + '</div>';
  }
  if (!vis.length) {
    if (!acervo.pendentes.length || f === 'render') h += '<div class="ac-vazio">' + acervoEsc(acervoT(linhas.length ? 'vazio_f' : 'vazio')) + '</div>';
  } else {
    h += '<div class="ac-grade">' + vis.map((r) => {
      const t = acervoTipo(r); const capa = r.is_cover === true;
      return '<div class="ac-card' + (capa ? ' capa' : '') + '"><div class="ac-img" data-ac="ver" data-url="' + acervoEsc(r.image_url) + '"><img src="' + acervoEsc(r.image_url) + '" alt="" loading="lazy">'
        + '<span class="ac-tag ' + t + '">' + acervoEsc(acervoT(t)) + '</span>' + (capa ? '<span class="ac-tagc">★ ' + acervoEsc(acervoT('capa')) + '</span>' : '') + '</div>'
        + '<div class="ac-pe"><span>' + acervoEsc(acervoData(r.created_at)) + '</span>'
        + '<button type="button" class="ac-b' + (capa ? ' on' : '') + '" data-ac="capa" data-id="' + acervoEsc(r.id) + '" title="' + acervoEsc(acervoT(capa ? 'capa_on' : 'capa_off')) + '">★</button>'
        + '<button type="button" class="ac-b" data-ac="baixar" data-url="' + acervoEsc(r.image_url) + '" title="' + acervoEsc(acervoT('baixar')) + '">⬇</button>'
        + '<button type="button" class="ac-b" data-ac="excluir" data-id="' + acervoEsc(r.id) + '" title="' + acervoEsc(acervoT('excluir')) + '">🗑</button></div></div>';
    }).join('') + '</div>';
  }
  return h + '</div>';
}
function acervoDesenha() {
  const m = document.getElementById('po-acervo');
  if (!m || !m.classList.contains('open')) return;
  m.querySelector('.ac-box').innerHTML = acervoHtml();
}
function acervoFecha() { const m = document.getElementById('po-acervo'); if (m) m.classList.remove('open'); }
async function acervoBaixa(url) {
  try {
    const blob = await (await fetch(url)).blob();
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'project-image-' + Date.now() + (/png/i.test(blob.type) ? '.png' : '.jpg');
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  } catch (e) { window.open(url, '_blank', 'noopener'); }
}
async function acervoCapa(id) {
  const row = acervoLinhas().find((r) => String(r.id) === String(id));
  if (!row) return;
  const novo = !(row.is_cover === true);
  const { data, error } = await supabaseClient.from('project_photoreal_photos').update({ is_cover: novo }).eq('id', id).select('id');
  if (error || !data || !data.length) { alert(acervoT('need339')); return; }
  row.is_cover = novo;
  acervoDesenha();
}
async function acervoClique(ev) {
  const m = document.getElementById('po-acervo');
  if (ev.target === m) { acervoFecha(); return; }
  const fb = ev.target.closest('[data-ac-f]');
  if (fb) { acervo.filtro = fb.getAttribute('data-ac-f'); acervoDesenha(); return; }
  const el = ev.target.closest('[data-ac]');
  if (!el) return;
  const a = el.getAttribute('data-ac');
  if (a === 'fechar') acervoFecha();
  else if (a === 'ver') { if (typeof openGalleryLightbox === 'function') openGalleryLightbox(el.getAttribute('data-url')); else window.open(el.getAttribute('data-url'), '_blank', 'noopener'); }
  else if (a === 'baixar') acervoBaixa(el.getAttribute('data-url'));
  else if (a === 'capa') acervoCapa(el.getAttribute('data-id'));
  else if (a === 'descartar') { acervo.pendentes.splice(Number(el.getAttribute('data-i')), 1); acervoDesenha(); }
  else if (a === 'excluir' && typeof deleteProjectPhotorealPhoto === 'function') { await deleteProjectPhotorealPhoto(el.getAttribute('data-id')); acervoDesenha(); }
}
function acervoAbre() {
  acervoCss();
  let m = document.getElementById('po-acervo');
  if (!m) {
    m = document.createElement('div'); m.id = 'po-acervo'; m.innerHTML = '<div class="ac-box"></div>';
    document.body.appendChild(m);
    m.addEventListener('click', acervoClique);
  }
  acervo.filtro = 'todos';
  m.classList.add('open');
  acervoDesenha();
  // relê do banco: pega imagem feita em outra aba/computador
  const pid = acervoProjetoId();
  if (pid && typeof loadProjectPhotorealPhotos === 'function') {
    loadProjectPhotorealPhotos(pid).then(() => { if (typeof renderProjectPhotorealGallery === 'function') renderProjectPhotorealGallery(); else acervoDesenha(); });
  }
}
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') acervoFecha(); });
(function () {
  const liga = () => { const b = document.getElementById('po-proj-acervo-btn'); if (b && !b._acervo) { b._acervo = true; b.addEventListener('click', acervoAbre); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', liga); else liga();
})();

window.LegnoAcervo = {
  abrir: acervoAbre, tipo: acervoTipo, ordena: acervoOrdena, capas: acervoCapas, capasCanvas: acervoCapasCanvas,
  guardaPendente: acervoGuardaPendente, aviso: acervoAviso, _state: acervo, _sobe: acervoSobePendentes
};
