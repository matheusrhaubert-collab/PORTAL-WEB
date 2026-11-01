// ============================================================
// Projetos a partir de PDF — aba Projetos (2026-10-01)
// ============================================================
// Pedido do Matt: "quero outra ferramenta que leia projetos em pdf
// completos. separe por ambiente, crie uma lista a serem selecionados os
// ambientes para serem criados pela IA separadamente. com mesmo nome de
// cliente final. e depois de selecionados joga pra ia da foto e faz os
// projetos separados no portal. podemos criar pasta de cliente final para
// ajudar na organização em 'meus projetos'".
//
// Fluxo:
//   1. Anexar o PDF → pdf.js renderiza cada página em miniatura (900px) e
//      extrai o texto.
//   2. [Ler o PDF] → Edge Function generate-project-from-photo stage='split'
//      devolve cliente final + lista de ambientes com as PÁGINAS de cada um.
//   3. Lista editável: marcar/desmarcar ambiente, renomear, corrigir páginas,
//      corrigir o nome do cliente (vira o nome da PASTA em Meus projetos).
//   4. [Criar projetos] → por ambiente: páginas dele renderizadas em alta
//      (1800px) → MESMA IA da foto (projectPhotoRunPipeline, portal-11) em
//      modo prancha (source='drawing': cota escrita vale mais que estimativa)
//      → projectPhotoApplyState monta paredes+módulos no projeto aberto →
//      salva como projeto NOVO "<Cliente> · <Ambiente>" na pasta do cliente
//      (saveProjectFavorite com opts, portal-09; coluna client_folder,
//      migration 184).
//      A IA dos ambientes roda em paralelo (2 por vez); montar/salvar é em
//      fila, porque usa o projeto aberto (estado global único do portal).
//
// Sem revisão por ambiente de propósito (pedido: "joga pra IA e faz os
// projetos"): cada projeto fica salvo e é revisado abrindo em Meus projetos.
// Os avisos da IA (canto ajustado, módulo sobre porta…) aparecem na linha
// de cada ambiente.
//
// Carregado depois do portal-11 (usa as funções dele) e antes do portal-09.

let projectPdfDoc = null;          // documento pdf.js
let projectPdfPages = [];          // [{ page, thumb, text }]
let projectPdfSplit = null;        // { client_name, project_title, notes, rooms:[...] }
let projectPdfRunning = false;
const projectPdfHiResCache = new Map(); // página → { base64, mime }

const PROJECT_PDF_MAX_PAGES = 60;
const PROJECT_PDF_THUMB_PX = 900;
// 2200 (era 1800): PDF de apresentação em paisagem (ex.: RITU, 1440×810)
// tem cota de "0,15 m" pequena num canto da elevação — com 1800 ficava ilegível.
const PROJECT_PDF_HIRES_PX = 2200;
const PROJECT_PDF_MAX_PAGES_PER_ROOM = 6;
// FASE 2 fidelidade (2026-11-01): recorte por vista em alta resolução.
const PROJECT_PDF_CROP_PX = 2000;          // lado maior de cada recorte
const PROJECT_PDF_MAX_CROPS_PER_ROOM = 10;
const PROJECT_PDF_CROP_SKIP_AREA = 0.72;   // vista que é a página quase toda: já vai inteira
const PROJECT_PDF_CROP_KINDS = ['plan', 'elevation', 'section', 'detail', 'table'];
const PROJECT_PDF_CANVAS_MAX_PX = 24e6;    // limite de pixels do canvas (Chrome)
const PROJECT_PDF_AI_PARALLEL = 2;
const PROJECT_PDF_MAX_REF_PAGES = 12;
let projectPdfFileName = '';

function tPdf(key, vars) { return I18n.t('project_pdf.' + key, vars); }

function setProjectPdfError(msg) {
  const el = document.getElementById('po-proj-pdf-error');
  if (!el) return;
  el.textContent = msg || '';
  el.style.display = msg ? 'block' : 'none';
}
function setProjectPdfStatus(msg) {
  if (typeof aiBusy !== 'undefined') aiBusy.status(msg);
  const el = document.getElementById('po-proj-pdf-status');
  if (!el) return;
  el.textContent = msg || '';
  el.style.display = msg ? 'block' : 'none';
}
// VERSÃO ÚNICA (01/11, Matt: "acho que tem que ter uma só versão"): sempre
// Flash. O Pro estourava o tempo da função com pranchas + recortes, e com as
// cotas em texto o Flash lê o número certo do mesmo jeito. O seletor ficou
// escondido no HTML (display:none) caso precise voltar.
function projectPdfQuality() { return 'flash'; }

// ---------- pdf.js ----------
function ensureProjectPdfJs() {
  if (typeof pdfjsLib === 'undefined') throw new Error(tPdf('err_pdfjs_missing'));
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  }
}

async function renderProjectPdfPage(pageNum, maxSidePx, quality) {
  const page = await projectPdfDoc.getPage(pageNum);
  const v1 = page.getViewport({ scale: 1 });
  const scale = Math.min(4, maxSidePx / Math.max(v1.width, v1.height));
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(vp.width));
  canvas.height = Math.max(1, Math.round(vp.height));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  return { dataUrl, base64: dataUrl.split(',')[1], mime: 'image/jpeg' };
}

// Itens de texto do pdf.js → [{ s, x, y }] em % da página (x pra direita,
// y pra baixo). pdf.js devolve a posição no espaço do PDF (origem embaixo,
// página pode estar girada): Util.transform com a matriz do viewport
// resolve os dois. Pedaços na MESMA linha que se encostam viram um texto só
// ("0," + "51 m" → "0,51 m"); cota vertical (girada) também vem, só que
// cada pedaço com o seu próprio giro — a junção só olha a distância.
// Função pura (sem DOM) pra bancada: scripts/tests/teste-pdf-texto-posicao.js.
function projectPdfTextItems(items, vp, util) {
  const U = util || (typeof pdfjsLib !== 'undefined' ? pdfjsLib.Util : null);
  const W = Math.max(1, vp.width), H = Math.max(1, vp.height);
  const raw = [];
  (items || []).forEach((it) => {
    const str = String(it && it.str || '').replace(/\s+/g, ' ');
    if (!str.trim() || !Array.isArray(it.transform)) return;
    const t = U && U.transform ? U.transform(vp.transform, it.transform) : it.transform;
    // escala do texto (módulo do vetor x da matriz) → largura em px da página
    const sx = Math.hypot(t[0], t[1]) || 1;
    const wPx = (Number(it.width) || 0) * sx;
    const hPx = (Number(it.height) || 0) * (Math.hypot(t[2], t[3]) || 1);
    const vertical = Math.abs(t[1]) > Math.abs(t[0]); // texto girado (cota vertical)
    raw.push({ s: str, x: t[4], y: t[5], w: wPx, h: hPx, vertical });
  });
  // junta pedaços encostados na mesma linha (x cresce; y igual ± 1/3 da altura)
  const out = [];
  raw.forEach((it) => {
    const prev = out[out.length - 1];
    if (prev && !it.vertical && !prev.vertical) {
      const tol = Math.max(2, (prev.h || 8) / 3);
      const endX = prev.x + prev.w;
      const gap = it.x - endX;
      if (Math.abs(it.y - prev.y) <= tol && gap >= -tol && gap <= Math.max(2, (prev.h || 8) * 0.35)) {
        prev.s = (prev.s + (gap > (prev.h || 8) * 0.12 && !/\s$/.test(prev.s) && !/^\s/.test(it.s) ? ' ' : '') + it.s);
        prev.w = it.x + it.w - prev.x;
        return;
      }
    }
    out.push({ s: it.s, x: it.x, y: it.y, w: it.w, h: it.h, vertical: it.vertical });
  });
  return out
    .map((it) => ({ s: it.s.trim().slice(0, 60), x: Math.round(it.x / W * 1000) / 10, y: Math.round(it.y / H * 1000) / 10 }))
    .filter((it) => it.s);
}

// ---------- Fase 2: vistas → recortes em alta ----------
// Plano do recorte (função pura, bancada em teste-pdf-recorte-vista.js):
// bbox em % da página → escala de render e retângulo em px. A escala é a
// que deixa o lado maior do recorte com PROJECT_PDF_CROP_PX, limitada a 4×
// (pdf.js) e ao tamanho máximo do canvas da página inteira.
function projectPdfCropPlan(bbox, pageW, pageH, maxPx) {
  const max = maxPx || PROJECT_PDF_CROP_PX;
  const bw = Math.max(1, pageW * bbox.w / 100), bh = Math.max(1, pageH * bbox.h / 100);
  let scale = max / Math.max(bw, bh);
  scale = Math.min(4, scale, Math.sqrt(PROJECT_PDF_CANVAS_MAX_PX / (pageW * pageH)));
  scale = Math.max(0.5, scale);
  return {
    scale,
    sx: Math.round(pageW * bbox.x / 100 * scale), sy: Math.round(pageH * bbox.y / 100 * scale),
    sw: Math.max(1, Math.round(bw * scale)), sh: Math.max(1, Math.round(bh * scale))
  };
}

// Quais vistas viram recorte: só desenho (não render), não a página inteira,
// e no máximo N por ambiente — planta/elevação/corte antes de detalhe/tabela.
function projectPdfPickViews(views, pages) {
  const ordem = (k) => Math.max(0, PROJECT_PDF_CROP_KINDS.indexOf(k));
  return (views || [])
    .filter((v) => v && pages.includes(v.page) && PROJECT_PDF_CROP_KINDS.includes(v.kind))
    .filter((v) => (v.w * v.h) / 10000 < PROJECT_PDF_CROP_SKIP_AREA)
    .sort((a, b) => ordem(a.kind) - ordem(b.kind) || a.page - b.page || a.y - b.y || a.x - b.x)
    .slice(0, PROJECT_PDF_MAX_CROPS_PER_ROOM);
}

const projectPdfScaledCache = new Map(); // "página@escala" → canvas
async function projectPdfPageCanvas(pageNum, scale) {
  const key = pageNum + '@' + scale.toFixed(3);
  if (projectPdfScaledCache.has(key)) return projectPdfScaledCache.get(key);
  const page = await projectPdfDoc.getPage(pageNum);
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(vp.width));
  canvas.height = Math.max(1, Math.round(vp.height));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  if (projectPdfScaledCache.size > 6) projectPdfScaledCache.delete(projectPdfScaledCache.keys().next().value);
  projectPdfScaledCache.set(key, canvas);
  return canvas;
}

async function projectPdfCropView(view) {
  const page = await projectPdfDoc.getPage(view.page);
  const v1 = page.getViewport({ scale: 1 });
  const plan = projectPdfCropPlan(view, v1.width, v1.height);
  const full = await projectPdfPageCanvas(view.page, plan.scale);
  const c = document.createElement('canvas');
  c.width = Math.min(plan.sw, full.width - plan.sx);
  c.height = Math.min(plan.sh, full.height - plan.sy);
  c.getContext('2d').drawImage(full, plan.sx, plan.sy, c.width, c.height, 0, 0, c.width, c.height);
  const dataUrl = c.toDataURL('image/jpeg', 0.85);
  return { base64: dataUrl.split(',')[1], mime: 'image/jpeg', px: Math.max(c.width, c.height) };
}

// Etapa 'views' (Flash, miniaturas) + recortes. Qualquer erro aqui NÃO
// derruba o ambiente: volta [] e o read segue só com as pranchas inteiras.
async function projectPdfCropsForRoom(r, pages, lang, say) {
  try {
    aiBusy.step('views');
    say(tPdf('st_views'));
    const data = await invokeProjectPhotoStage({
      stage: 'views', lang, room_name: r.name,
      pages: pages.map((n) => { const pg = projectPdfPages[n - 1]; return { page: n, base64: pg.base64, mime: pg.mime }; })
    });
    const vistas = projectPdfPickViews(data.views, pages);
    const out = [];
    if (vistas.length) aiBusy.step('crops');
    for (let i = 0; i < vistas.length; i++) {
      const v = vistas[i];
      say(tPdf('st_cropping', { i: i + 1, n: vistas.length }));
      const im = await projectPdfCropView(v);
      out.push({
        base64: im.base64, mime: im.mime,
        label: tPdf('crop_label', { n: v.page, label: v.label || v.kind, x1: Math.round(v.x), x2: Math.round(v.x + v.w), y1: Math.round(v.y), y2: Math.round(v.y + v.h) })
      });
    }
    console.info('[pdf] vistas:', data.views, '→ recortes:', out.length);
    return out;
  } catch (err) {
    console.warn('[pdf] recorte por vista falhou (segue sem):', err);
    return [];
  }
}

async function projectPdfHiRes(pageNum) {
  if (projectPdfHiResCache.has(pageNum)) return projectPdfHiResCache.get(pageNum);
  const r = await renderProjectPdfPage(pageNum, PROJECT_PDF_HIRES_PX, 0.85);
  const v = { base64: r.base64, mime: r.mime };
  projectPdfHiResCache.set(pageNum, v);
  return v;
}

// ---------- Modal ----------
function openProjectPdfModal() {
  const modal = document.getElementById('po-proj-pdf-modal');
  if (!modal) return;
  projectPdfDoc = null; projectPdfPages = []; projectPdfSplit = null; projectPdfHiResCache.clear();
  const input = document.getElementById('po-proj-pdf-input');
  if (input) input.value = '';
  const fileLbl = document.getElementById('po-proj-pdf-file');
  if (fileLbl) fileLbl.textContent = '';
  const review = document.getElementById('po-proj-pdf-review');
  if (review) { review.innerHTML = ''; review.style.display = 'none'; }
  const runBtn = document.getElementById('po-proj-pdf-run-btn');
  if (runBtn) { runBtn.style.display = ''; runBtn.disabled = true; }
  const createBtn = document.getElementById('po-proj-pdf-create-btn');
  if (createBtn) createBtn.style.display = 'none';
  const unit = projectPhotoUnit();
  const ceil = document.getElementById('po-proj-pdf-ceiling-input');
  if (ceil) ceil.value = projectPhotoFormatMm(roomSettings.ceiling_mm, unit);
  modal.querySelectorAll('.po-proj-pdf-unit').forEach((el) => { el.textContent = unit; });
  let q = 'pro';
  try { q = localStorage.getItem('legno_pdf_quality') === 'flash' ? 'flash' : 'pro'; } catch (e) { /* ok */ }
  modal.querySelectorAll('input[name="po-proj-pdf-quality"]').forEach((r) => { r.checked = r.value === q; });
  setProjectPdfError('');
  setProjectPdfStatus('');
  modal.classList.add('open');
}
function closeProjectPdfModal() {
  if (projectPdfRunning && !confirm(tPdf('confirm_close_running'))) return;
  const modal = document.getElementById('po-proj-pdf-modal');
  if (modal) modal.classList.remove('open');
}

async function runProjectPdfAttach(file) {
  setProjectPdfError('');
  if (!file || !(/pdf$/i.test(file.type) || /\.pdf$/i.test(file.name))) { setProjectPdfError(tPdf('err_not_pdf')); return; }
  const runBtn = document.getElementById('po-proj-pdf-run-btn');
  if (runBtn) runBtn.disabled = true;
  try {
    ensureProjectPdfJs();
    setProjectPdfStatus(tPdf('status_opening'));
    projectPdfFileName = file.name.replace(/\.pdf$/i, '');
    const buf = await file.arrayBuffer();
    projectPdfDoc = await pdfjsLib.getDocument({ data: buf }).promise;
    projectPdfHiResCache.clear();
    const n = Math.min(projectPdfDoc.numPages, PROJECT_PDF_MAX_PAGES);
    projectPdfPages = [];
    for (let i = 1; i <= n; i++) {
      setProjectPdfStatus(tPdf('status_rendering', { i, n }));
      const r = await renderProjectPdfPage(i, PROJECT_PDF_THUMB_PX, 0.6);
      let text = '', textItems = [];
      try {
        const page = await projectPdfDoc.getPage(i);
        const tc = await page.getTextContent();
        text = tc.items.map((it) => it.str).join(' ').replace(/\s+/g, ' ').trim();
        // FIDELIDADE AO PDF, fase 1 (2026-11-01): cada texto COM POSIÇÃO
        // (% da página, origem no canto superior esquerdo) vai pro 'read' —
        // a IA lê a cota como texto exato em vez de adivinhar pela imagem.
        const vp = page.getViewport({ scale: 1 });
        textItems = projectPdfTextItems(tc.items, vp);
      } catch (e) { /* PDF escaneado: sem texto, só imagem */ }
      projectPdfPages.push({ page: i, thumb: r.dataUrl, base64: r.base64, mime: r.mime, text, textItems });
    }
    const fileLbl = document.getElementById('po-proj-pdf-file');
    if (fileLbl) {
      fileLbl.textContent = file.name + ' · ' + tPdf('pages_count', { n: projectPdfDoc.numPages }) +
        (projectPdfDoc.numPages > PROJECT_PDF_MAX_PAGES ? ' · ' + tPdf('pages_limited', { n: PROJECT_PDF_MAX_PAGES }) : '');
    }
    if (runBtn) { runBtn.disabled = false; runBtn.style.display = ''; }
    setProjectPdfStatus('');
  } catch (err) {
    console.error('[pdf-projetos] falha abrindo PDF:', err);
    setProjectPdfStatus('');
    setProjectPdfError(err.message || String(err));
  }
}

// Espelhar e recriar (01/11): inverte a ordem das paredes do estado lido e
// monta de novo por cima do MESMO projeto salvo (overwrite pelo id).
async function projectPdfRecreateMirrored(r) {
  if (projectPdfRunning || !r._state) return;
  projectPdfRunning = true;
  aiBusy.show(tPdf('mirror_busy'), { steps: [{ key: 'build', label: I18n.t('ai_busy.s_build'), est: 20 }] });
  const setRoom = (status, message) => { r.status = status; if (message != null) r.message = message; renderProjectPdfReview(); };
  try {
    const st = projectPhotoMirrorState(r._state);
    projectPdfResetOpenProject();
    const { created, warnings } = await projectPhotoApplyState(st);
    if (!created) throw new Error(tPhoto('err_nothing_created'));
    r._state = st;
    r.warnings = [...st.warnings, ...warnings];
    renderProjectCanvas();
    await new Promise((res) => setTimeout(res, 400));
    const id = await saveProjectFavorite(r.projectId || null, { name: r.name, clientFolder: (projectPdfSplit && projectPdfSplit.client_name) || null });
    if (id) r.projectId = id;
    setRoom('done', tPdf('st_done', { n: created, w: r.warnings.length }) + (st.mirrored ? ' · ' + tPdf('mirrored_tag') : ''));
  } catch (err) {
    setRoom('error', err.message || String(err));
  } finally {
    projectPdfRunning = false;
    aiBusy.hide();
    renderProjectPdfReview();
  }
}

// ---------- 1. Separar por ambiente ----------
async function runProjectPdfSplit() {
  if (projectPdfRunning || !projectPdfPages.length) return;
  projectPdfRunning = true;
  aiBusy.show(I18n.t('ai_busy.pdf_split'), { steps: [{ key: 'split', label: I18n.t('ai_busy.s_split'), est: 40 }] });
  setProjectPdfError('');
  const runBtn = document.getElementById('po-proj-pdf-run-btn');
  if (runBtn) runBtn.disabled = true;
  const quality = projectPdfQuality();
  try { localStorage.setItem('legno_pdf_quality', quality); } catch (e) { /* ok */ }
  const t0 = Date.now();
  const tick = setInterval(() => setProjectPdfStatus(tPdf('status_splitting') + ' ' + Math.round((Date.now() - t0) / 1000) + ' s'), 1000);
  try {
    setProjectPdfStatus(tPdf('status_splitting'));
    const lang = (typeof I18n !== 'undefined' && typeof I18n.getLanguage === 'function') ? (I18n.getLanguage() || 'pt') : 'pt';
    const data = await invokeProjectPhotoStage({
      stage: 'split', quality, lang,
      pages: projectPdfPages.map((p) => ({ page: p.page, base64: p.base64, mime: p.mime, text: p.text.slice(0, 1500) }))
    });
    const rooms = (data.rooms || []).map((r) => ({ ...r, include: true, status: 'idle', message: '', warnings: [] }));
    if (!rooms.length) throw new Error(tPdf('err_no_rooms'));
    projectPdfCleanRoomPages(rooms);
    projectPdfSplit = { client_name: data.client_name || '', project_title: data.project_title || '', notes: data.notes || '', model: data.model || '', rooms };
    projectPdfRunning = false; // antes do render: a lista nasce editável
    aiBusy.hide();
    renderProjectPdfReview();
    if (runBtn) runBtn.style.display = 'none';
    const createBtn = document.getElementById('po-proj-pdf-create-btn');
    if (createBtn) createBtn.style.display = '';
    refreshProjectPdfCreateBtn();
  } catch (err) {
    setProjectPdfError(err.message || String(err));
    if (runBtn) runBtn.disabled = false;
  } finally {
    clearInterval(tick);
    projectPdfRunning = false;
    aiBusy.hide();
    setProjectPdfStatus('');
  }
}

// PÁGINA DE OUTRO AMBIENTE (01/10, Matt, Indiana: "pegou o armário de apoio
// e fez outro projeto em cima" — o separador pôs o render "Armário de apoio |
// garagem" (p. 20) também no "Closet do quarto 3", que não tinha render
// próprio; a leitura usou a imagem e a Proposta anexou). Página que não é
// planta geral (está em < 3 ambientes) e cujo título/código fala de OUTRO
// ambiente — e não deste — sai da lista deste. Nunca esvazia a lista.
function projectPdfNorm(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');
}
function projectPdfRoomKeys(r) {
  const keys = [];
  const nome = projectPdfNorm(String(r.name || '').split(/\s[|\/–-]\s/)[0]).trim();
  if (nome.length >= 6) keys.push(nome);
  const code = projectPdfNorm(r.code || '').trim();
  if (code.length >= 3) keys.push(code);
  return keys;
}
function projectPdfCleanRoomPages(rooms) {
  const usos = (n) => rooms.filter((r) => r.pages.includes(n)).length;
  const keys = rooms.map(projectPdfRoomKeys);
  const saidas = rooms.map(() => []);
  rooms.forEach((r, i) => {
    const meus = keys[i];
    if (!meus.length) return;
    r.pages.forEach((n) => {
      if (usos(n) >= 3) return;
      const tit = projectPdfNorm(((projectPdfPages[n - 1] || {}).text || '').slice(0, 400));
      if (meus.some((k) => tit.includes(k))) return;
      const deOutro = rooms.some((o, j) => j !== i && keys[j].some((k) => tit.includes(k) && !meus.some((m) => m.includes(k))));
      if (deOutro) saidas[i].push(n);
    });
  });
  rooms.forEach((r, i) => {
    const fica = r.pages.filter((n) => !saidas[i].includes(n));
    if (fica.length && saidas[i].length) {
      r.pages = fica;
      r.summary = (r.summary ? r.summary + ' · ' : '') + tPdf('pages_removed', { pages: saidas[i].join(', ') });
    }
  });
}

function projectPdfParsePages(text) {
  const out = new Set();
  String(text || '').split(/[,;\s]+/).forEach((tok) => {
    const m = tok.match(/^(\d+)(?:-(\d+))?$/);
    if (!m) return;
    const a = Number(m[1]), b = Number(m[2] || m[1]);
    for (let i = Math.min(a, b); i <= Math.max(a, b) && i - Math.min(a, b) < 100; i++) {
      if (i >= 1 && i <= projectPdfPages.length) out.add(i);
    }
  });
  return [...out].sort((x, y) => x - y);
}

const PROJECT_PDF_STATUS_ICON = { idle: '', queued: '⏳', reading: '🔎', building: '🛠', done: '✔', error: '✖' };

function renderProjectPdfReview() {
  const el = document.getElementById('po-proj-pdf-review');
  const sp = projectPdfSplit;
  if (!el || !sp) return;
  const thumbOf = (n) => (projectPdfPages[n - 1] || {}).thumb || '';
  const rows = sp.rooms.map((r, i) => `
    <div class="po-proj-pdf-room${r.include ? '' : ' off'}" data-room="${i}">
      <div class="po-proj-pdf-room-head">
        <input type="checkbox" data-room-inc="${i}" ${r.include ? 'checked' : ''} ${projectPdfRunning ? 'disabled' : ''}>
        <input type="text" class="po-proj-pdf-room-name" data-room-name="${i}" value="${escapeHtmlPhoto(r.name)}" ${projectPdfRunning ? 'disabled' : ''}>
        <label class="po-proj-pdf-room-pages">${tPdf('col_pages')}
          <input type="text" data-room-pages="${i}" value="${escapeHtmlPhoto(r.pages.join(', '))}" ${projectPdfRunning ? 'disabled' : ''}></label>
        <span class="po-proj-pdf-room-status st-${r.status}" title="${escapeHtmlPhoto((r.warnings || []).join('\n'))}">${PROJECT_PDF_STATUS_ICON[r.status] || ''} ${escapeHtmlPhoto(r.message || '')}</span>
        ${r.status === 'done' && r._state && !projectPdfRunning ? `<button type="button" class="secondary po-proj-pdf-mirror" data-room-mirror="${i}" title="${escapeHtmlPhoto(tPdf('mirror_title'))}">↔ ${escapeHtmlPhoto(tPdf('mirror'))}</button>` : ''}
      </div>
      <div class="po-proj-pdf-room-sum hint">${escapeHtmlPhoto(r.summary || '')}${r.has_dimensions ? '' : ' · <strong>' + escapeHtmlPhoto(tPdf('no_dimensions')) + '</strong>'}</div>
      ${(r.warnings || []).length ? `<details class="po-proj-pdf-warns"><summary>${escapeHtmlPhoto(tPdf('warns_title', { n: r.warnings.length }))}</summary><ul>${r.warnings.map((w) => `<li>${escapeHtmlPhoto(w)}</li>`).join('')}</ul></details>` : ''}
      <div class="po-proj-pdf-thumbs">${r.pages.map((n) => `<figure><img src="${thumbOf(n)}" alt="" loading="lazy" data-pdf-zoom="${n}"><figcaption>${n}</figcaption></figure>`).join('')}</div>
    </div>`).join('');
  el.innerHTML = `
    ${sp.notes ? `<p class="hint">${escapeHtmlPhoto(sp.notes)}</p>` : ''}
    <div class="po-proj-pdf-client">
      <label for="po-proj-pdf-client-input">${tPdf('client_label')}</label>
      <input type="text" id="po-proj-pdf-client-input" value="${escapeHtmlPhoto(sp.client_name)}" ${projectPdfRunning ? 'disabled' : ''} placeholder="${escapeHtmlPhoto(tPdf('client_placeholder'))}">
      <span class="hint">${tPdf('client_hint')}</span>
    </div>
    <div class="po-proj-pdf-selall">
      <button type="button" class="secondary" data-pdf-all="1" ${projectPdfRunning ? 'disabled' : ''}>${tPdf('select_all')}</button>
      <button type="button" class="secondary" data-pdf-all="0" ${projectPdfRunning ? 'disabled' : ''}>${tPdf('select_none')}</button>
    </div>
    <div class="po-proj-pdf-rooms">${rows}</div>`;
  el.style.display = '';
}

function refreshProjectPdfCreateBtn() {
  const btn = document.getElementById('po-proj-pdf-create-btn');
  if (!btn || !projectPdfSplit) return;
  const n = projectPdfSplit.rooms.filter((r) => r.include && r.status !== 'done').length;
  btn.textContent = tPdf('create_btn', { n });
  btn.disabled = projectPdfRunning || n === 0;
}

function onProjectPdfReviewChange(ev) {
  const sp = projectPdfSplit;
  if (!sp) return;
  const t = ev.target;
  if (t.id === 'po-proj-pdf-client-input') { sp.client_name = t.value.trim(); return; }
  if (t.dataset.roomMirror != null) { const r = sp.rooms[Number(t.dataset.roomMirror)]; if (r) projectPdfRecreateMirrored(r); return; }
  if (t.dataset.roomInc != null) { const r = sp.rooms[Number(t.dataset.roomInc)]; if (r) r.include = t.checked; renderProjectPdfReview(); refreshProjectPdfCreateBtn(); return; }
  if (t.dataset.roomName != null) { const r = sp.rooms[Number(t.dataset.roomName)]; if (r) r.name = t.value.trim() || r.name; return; }
  if (t.dataset.roomPages != null) {
    const r = sp.rooms[Number(t.dataset.roomPages)];
    if (r) { const p = projectPdfParsePages(t.value); if (p.length) r.pages = p; }
    renderProjectPdfReview();
  }
}
function onProjectPdfReviewClick(ev) {
  const sp = projectPdfSplit;
  const all = ev.target.closest('[data-pdf-all]');
  if (all && sp && !projectPdfRunning) {
    sp.rooms.forEach((r) => { if (r.status !== 'done') r.include = all.dataset.pdfAll === '1'; });
    renderProjectPdfReview(); refreshProjectPdfCreateBtn();
    return;
  }
  const img = ev.target.closest('[data-pdf-zoom]');
  if (img && typeof openGalleryLightbox === 'function') openGalleryLightbox(img.src);
}

// Quais páginas do ambiente vão pra IA (máx. 6), EM ORDEM DE PRIORIDADE (o
// plano B do portal-11 corta pras 3 primeiras se a leitura estourar o tempo):
//   1. no máximo UMA planta geral — página que aparece em 3+ ambientes (ex.:
//      Indiana: "planta original pés/polegadas" e "planta convertida cm" iam
//      em TODOS os 11 ambientes, ocupando 2 das 6 vagas com a casa inteira);
//   2. as páginas PRÓPRIAS do ambiente com mais cotas (elevações/vistas);
//   3. renders/sem cota completam o que sobrar.
// PDF de apresentação (RITU) tem muito render — sem isso, as pranchas de
// medida ficavam de fora.
const PROJECT_PDF_DIM_RE = /\d+[.,]\d+\s*(?:m|cm|mm)\b|\d+\s*(?:mm|cm)\b|\d+'\s*-?\s*\d*(?:\s\d+\/\d+)?"|\d+(?:\s\d+\/\d+)?"/g;
function projectPdfDimScore(n) {
  const t = (projectPdfPages[n - 1] || {}).text || '';
  return (t.match(PROJECT_PDF_DIM_RE) || []).length;
}
function projectPdfPickPages(pages) {
  const rooms = (projectPdfSplit && projectPdfSplit.rooms) || [];
  const usos = (n) => rooms.filter((r) => r.pages.includes(n)).length;
  const geral = pages.filter((n) => usos(n) >= 3);
  const proprias = pages.filter((n) => usos(n) < 3);
  const comCota = proprias.filter((n) => projectPdfDimScore(n) >= 2).sort((a, b) => projectPdfDimScore(b) - projectPdfDimScore(a));
  const semCota = proprias.filter((n) => projectPdfDimScore(n) < 2);
  return [...geral.slice(0, 1), ...comCota, ...semCota].slice(0, PROJECT_PDF_MAX_PAGES_PER_ROOM);
}

// ---------- 2. Criar os projetos ----------
// Mesmo "zerar" do botão ↺ Novo projeto (resetProject, portal-08), sem o
// confirm — o lote já perguntou uma vez só no começo.
function projectPdfResetOpenProject() {
  if (typeof projectReferencePending !== 'undefined') projectReferencePending = [];
  projectSlots = [];
  selectedProjectSlotId = null;
  projectWallSegments = defaultProjectWallSegments();
  projectActiveWallIndex = 0;
  loadedProjectFavorite = null;
  if (typeof setProjectClientInfo === 'function') setProjectClientInfo(null);
  if (typeof refreshProjectFavoriteButtons === 'function') refreshProjectFavoriteButtons();
  try { project3DLastFitKey = null; } catch (e) { /* ok */ }
  if (typeof resetProjectUndo === 'function') resetProjectUndo();
}

// Roda tarefas assíncronas com no máximo `n` ao mesmo tempo; devolve uma
// Promise por tarefa, na ordem (quem consome pode esperar uma a uma).
function projectPdfPool(tasks, n) {
  let next = 0;
  const results = tasks.map(() => {
    let res, rej;
    const p = new Promise((a, b) => { res = a; rej = b; });
    p.catch(() => {});
    return { p, res, rej };
  });
  const worker = async () => {
    while (next < tasks.length) {
      const i = next++;
      try { results[i].res(await tasks[i]()); } catch (e) { results[i].rej(e); }
    }
  };
  for (let k = 0; k < Math.min(n, tasks.length); k++) worker();
  return results.map((r) => r.p);
}

async function runProjectPdfCreate() {
  const sp = projectPdfSplit;
  if (!sp || projectPdfRunning) return;
  const chosen = sp.rooms.filter((r) => r.include && r.status !== 'done');
  if (!chosen.length) return;
  const clientInput = document.getElementById('po-proj-pdf-client-input');
  if (clientInput) sp.client_name = clientInput.value.trim();
  if (projectSlots.length > 0 && typeof projectDirty !== 'undefined' && projectDirty && !confirm(tPdf('confirm_unsaved'))) return;

  const unit = projectPhotoUnit();
  const ceilingMm = projectPhotoParseToMm((document.getElementById('po-proj-pdf-ceiling-input') || {}).value, unit);
  if (!(ceilingMm > 0)) { setProjectPdfError(tPhoto('err_bad_measures')); return; }
  const quality = projectPdfQuality();
  const notes = (document.getElementById('po-proj-pdf-notes') || {}).value || '';
  const lang = (typeof I18n !== 'undefined' && typeof I18n.getLanguage === 'function') ? (I18n.getLanguage() || 'pt') : 'pt';

  projectPdfRunning = true;
  projectPdfShowDone(0, []);
  // etapas × ambientes (2 em paralelo): estimativa por ambiente ~ 3 min
  const passosAmb = [
    { key: 'views', label: I18n.t('ai_busy.s_views'), est: 15 },
    { key: 'crops', label: I18n.t('ai_busy.s_crops'), est: 10 },
    { key: 'read', label: I18n.t('ai_busy.s_read'), est: 75 },
    { key: 'match', label: I18n.t('ai_busy.s_match'), est: 45 },
    { key: 'build', label: I18n.t('ai_busy.s_build'), est: 15 },
    { key: 'check', label: I18n.t('ai_busy.s_check'), est: 60 }
  ];
  const rodadas = Math.ceil(chosen.length / PROJECT_PDF_AI_PARALLEL);
  aiBusy.show(I18n.t('ai_busy.pdf_create'), { steps: passosAmb.map((p) => ({ ...p, est: p.est * rodadas })) });
  setProjectPdfError('');
  chosen.forEach((r) => { r.status = 'queued'; r.message = ''; r.warnings = []; });
  renderProjectPdfReview(); refreshProjectPdfCreateBtn();
  const setRoom = (r, status, message) => { r.status = status; if (message != null) r.message = message; renderProjectPdfReview(); if (message) aiBusy.status(r.name + ' — ' + message); };

  const catalogP = Promise.all([buildProjectPhotoCatalog(), buildProjectPhotoColorList()]);
  catalogP.catch(() => {});
  let feitos = 0;
  try {
    // IA de todos os ambientes, 2 por vez (cada um: leitura + casamento)
    const aiPromises = projectPdfPool(chosen.map((r) => async () => {
      setRoom(r, 'reading', tPdf('st_reading'));
      const pages = projectPdfPickPages(r.pages);
      const images = [], pageTexts = [];
      for (const n of pages) {
        const im = await projectPdfHiRes(n);
        images.push({ base64: im.base64, mime: im.mime, label: tPdf('page_label', { n }) });
        const pg = projectPdfPages[n - 1];
        if (pg && pg.textItems && pg.textItems.length) pageTexts.push({ label: tPdf('page_label', { n }), items: pg.textItems });
      }
      // fase 2: recortes das vistas DEPOIS das pranchas inteiras (o plano B
      // corta pelo fim da lista, então perde recorte antes de perder prancha)
      const crops = await projectPdfCropsForRoom(r, pages, lang, (msg) => setRoom(r, 'reading', msg));
      // referências pra conferência visual: recortes das vistas (se houver), senão as pranchas
      r._refs = (crops.length ? crops : images).slice(0, 6);
      return projectPhotoRunPipeline({
        images: images.concat(crops), pageTexts, quality, ceilingMm, source: 'drawing', roomName: r.name, roomKind: r.kind, catalogP,
        notes: [sp.project_title ? 'Projeto: ' + sp.project_title : '', notes].filter(Boolean).join(' · ')
      }, (msg) => setRoom(r, 'reading', msg));
    }), PROJECT_PDF_AI_PARALLEL);

    // montar + salvar em fila (projeto aberto é um só)
    for (let i = 0; i < chosen.length; i++) {
      const r = chosen[i];
      let st;
      try {
        st = await aiPromises[i];
      } catch (err) {
        setRoom(r, 'error', err.message || String(err));
        continue;
      }
      try {
        aiBusy.step('build');
        setRoom(r, 'building', tPdf('st_building'));
        r._state = st; // pra "Espelhar" recriar sem ler de novo
        projectPdfResetOpenProject();
        let { created, warnings } = await projectPhotoApplyState(st);
        r.warnings = [...st.warnings, ...warnings];
        if (st.unmatched.length) r.warnings.push(tPhoto('skipped_title') + ' ' + st.unmatched.map((u) => u.volume.label).join(' · '));
        if (!created) throw new Error(tPhoto('err_nothing_created'));
        renderProjectCanvas();
        await new Promise((res) => setTimeout(res, 400)); // 3D desenhar antes da miniatura
        // CONFERÊNCIA VISUAL POR PAREDE (01/11, portal-34): compara a elevação
        // montada com as referências; se a IA pediu correções, remonta.
        if (typeof projectPhotoVisualCheck === 'function' && r._refs && r._refs.length) {
          aiBusy.step('check');
          try {
            const vc = await projectPhotoVisualCheck(st, r._refs, { status: (msg) => setRoom(r, 'building', msg) });
            r.warnings.push(...vc.report);
            if (vc.changed) {
              setRoom(r, 'building', tPdf('st_rebuilding'));
              projectPdfResetOpenProject();
              const again = await projectPhotoApplyState(st);
              created = again.created; r.warnings.push(...again.warnings);
              renderProjectCanvas();
              await new Promise((res) => setTimeout(res, 400));
            }
          } catch (e) { console.warn('[conferência visual]', e); }
        }
        // Pranchas e renders do ambiente viram "Referências" do projeto
        // (migration 185, portal-13): sobem logo depois do salvar e entram
        // na Proposta. TODAS as páginas do ambiente (não só as 6 da IA),
        // até 12, na ordem do PDF.
        if (typeof projectReferencePending !== 'undefined') {
          const refPages = r.pages.slice(0, PROJECT_PDF_MAX_REF_PAGES);
          const refs = [];
          for (const n of refPages) {
            const im = await projectPdfHiRes(n);
            refs.push({
              dataUrl: 'data:' + im.mime + ';base64,' + im.base64,
              kind: projectPdfDimScore(n) >= 2 ? 'drawing' : 'render',
              label: tPdf('ref_label', { name: projectPdfFileName || 'PDF', n }),
              page_number: n
            });
          }
          projectReferencePending = refs;
        }
        // Nome do projeto = só o AMBIENTE (Matt, 01/10: "quero o nome do
        // ambiente, e só no nome do cliente colocar o nome dele") — o cliente
        // já é a PASTA em Meus projetos.
        const name = r.name;
        const id = await saveProjectFavorite(null, { name, clientFolder: sp.client_name || null });
        if (!id) throw new Error(tPdf('err_save'));
        r.projectId = id;
        feitos++;
        setRoom(r, 'done', tPdf('st_done', { n: created, w: r.warnings.length }));
      } catch (err) {
        setRoom(r, 'error', err.message || String(err));
      }
    }
  } finally {
    projectPdfRunning = false;
    aiBusy.hide();
    renderProjectPdfReview();
    refreshProjectPdfCreateBtn();
    setProjectPdfStatus(feitos ? tPdf('status_done', { n: feitos, folder: sp.client_name || '—' }) : '');
    projectPdfShowDone(feitos, chosen);
    if (typeof loadProjectFavoritesList === 'function') loadProjectFavoritesList();
  }
}

// AVISO DE "PRONTO" (01/11, Matt: "precisa uma mensagem tipo projeto gerado,
// ir pro projeto. porque assim parece que nada aconteceu"). Faixa verde no
// fim do modal com o que foi criado e o botão "Ir pro projeto" (fecha o
// modal — o último ambiente já está aberto no canvas — e enquadra o 3D).
function projectPdfShowDone(feitos, rooms) {
  let box = document.getElementById('po-proj-pdf-done');
  if (!box) {
    box = document.createElement('div');
    box.id = 'po-proj-pdf-done';
    box.className = 'po-proj-pdf-done';
    const st = document.getElementById('po-proj-pdf-status');
    if (st && st.parentNode) st.parentNode.insertBefore(box, st.nextSibling); else return;
    box.addEventListener('click', (e) => {
      if (e.target.closest('[data-pdf-goto]')) {
        closeProjectPdfModal();
        try { if (typeof fitProject3DToRoom === 'function') fitProject3DToRoom(); } catch (err) { /* ok */ }
        const cv = document.getElementById('po-proj-canvas') || document.querySelector('.po-proj-canvas');
        if (cv && cv.scrollIntoView) cv.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }
  if (!feitos) { box.innerHTML = ''; box.style.display = 'none'; return; }
  const ok = (rooms || []).filter((r) => r.status === 'done');
  const linhas = ok.map((r) => `<li><strong>${escapeHtmlPhoto(r.name)}</strong> — ${escapeHtmlPhoto(r.message || '')}</li>`).join('');
  box.innerHTML = `<div class="po-proj-pdf-done-title">✅ ${escapeHtmlPhoto(tPdf('done_title', { n: feitos }))}</div>
    <ul>${linhas}</ul>
    <div class="po-proj-pdf-done-actions"><button type="button" class="primary" data-pdf-goto="1">${escapeHtmlPhoto(tPdf('done_goto'))}</button>
    <span class="hint">${escapeHtmlPhoto(tPdf('done_hint'))}</span></div>`;
  box.style.display = '';
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ---------- Listeners ----------
(function attachProjectPdfListeners() {
  const on = (id, fn) => { const b = document.getElementById(id); if (b) b.addEventListener('click', fn); };
  on('po-proj-pdf-open-btn', openProjectPdfModal);
  on('po-proj-pdf-modal-close', closeProjectPdfModal);
  on('po-proj-pdf-cancel-btn', closeProjectPdfModal);
  on('po-proj-pdf-run-btn', runProjectPdfSplit);
  on('po-proj-pdf-create-btn', runProjectPdfCreate);
  const attachBtn = document.getElementById('po-proj-pdf-attach-btn');
  const input = document.getElementById('po-proj-pdf-input');
  if (attachBtn && input) {
    attachBtn.addEventListener('click', () => input.click());
    input.addEventListener('change', () => { const f = input.files && input.files[0]; if (f) runProjectPdfAttach(f); });
  }
  const review = document.getElementById('po-proj-pdf-review');
  if (review) {
    review.addEventListener('change', onProjectPdfReviewChange);
    review.addEventListener('click', onProjectPdfReviewClick);
  }
  const modal = document.getElementById('po-proj-pdf-modal');
  if (modal) {
    modal.addEventListener('click', (e) => { if (e.target === modal) closeProjectPdfModal(); });
    modal.addEventListener('dragover', (e) => { e.preventDefault(); });
    modal.addEventListener('drop', (e) => {
      e.preventDefault();
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) runProjectPdfAttach(f);
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && modal.classList.contains('open')) closeProjectPdfModal();
  });
})();

// Globais usados: pdfjsLib, supabaseClient, roomSettings, projectSlots,
// selectedProjectSlotId, projectWallSegments, projectActiveWallIndex,
// loadedProjectFavorite, projectDirty, project3DLastFitKey,
// defaultProjectWallSegments, refreshProjectFavoriteButtons, resetProjectUndo,
// renderProjectCanvas, saveProjectFavorite, loadProjectFavoritesList,
// openGalleryLightbox; do portal-11: projectPhotoRunPipeline,
// projectPhotoApplyState, invokeProjectPhotoStage, buildProjectPhotoCatalog,
// buildProjectPhotoColorList, projectPhotoUnit, projectPhotoFormatMm,
// projectPhotoParseToMm, escapeHtmlPhoto, tPhoto; I18n.
