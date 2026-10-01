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
const PROJECT_PDF_AI_PARALLEL = 2;

function tPdf(key, vars) { return I18n.t('project_pdf.' + key, vars); }

function setProjectPdfError(msg) {
  const el = document.getElementById('po-proj-pdf-error');
  if (!el) return;
  el.textContent = msg || '';
  el.style.display = msg ? 'block' : 'none';
}
function setProjectPdfStatus(msg) {
  const el = document.getElementById('po-proj-pdf-status');
  if (!el) return;
  el.textContent = msg || '';
  el.style.display = msg ? 'block' : 'none';
}
function projectPdfQuality() {
  const r = document.querySelector('input[name="po-proj-pdf-quality"]:checked');
  return r && r.value === 'pro' ? 'pro' : 'flash';
}

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
    const buf = await file.arrayBuffer();
    projectPdfDoc = await pdfjsLib.getDocument({ data: buf }).promise;
    projectPdfHiResCache.clear();
    const n = Math.min(projectPdfDoc.numPages, PROJECT_PDF_MAX_PAGES);
    projectPdfPages = [];
    for (let i = 1; i <= n; i++) {
      setProjectPdfStatus(tPdf('status_rendering', { i, n }));
      const r = await renderProjectPdfPage(i, PROJECT_PDF_THUMB_PX, 0.6);
      let text = '';
      try {
        const page = await projectPdfDoc.getPage(i);
        const tc = await page.getTextContent();
        text = tc.items.map((it) => it.str).join(' ').replace(/\s+/g, ' ').trim();
      } catch (e) { /* PDF escaneado: sem texto, só imagem */ }
      projectPdfPages.push({ page: i, thumb: r.dataUrl, base64: r.base64, mime: r.mime, text });
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

// ---------- 1. Separar por ambiente ----------
async function runProjectPdfSplit() {
  if (projectPdfRunning || !projectPdfPages.length) return;
  projectPdfRunning = true;
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
    projectPdfSplit = { client_name: data.client_name || '', project_title: data.project_title || '', notes: data.notes || '', model: data.model || '', rooms };
    projectPdfRunning = false; // antes do render: a lista nasce editável
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
    setProjectPdfStatus('');
  }
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
      </div>
      <div class="po-proj-pdf-room-sum hint">${escapeHtmlPhoto(r.summary || '')}${r.has_dimensions ? '' : ' · <strong>' + escapeHtmlPhoto(tPdf('no_dimensions')) + '</strong>'}</div>
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

// Quais páginas do ambiente vão pra IA (máx. 6): as COTADAS primeiro (mais
// cotas no texto extraído = planta/elevação) e os renders só completam o que
// sobrar — sempre com vaga pra pelo menos 1 render (aparência). PDF de
// apresentação tem muito render; mandar 6 renders deixaria as medidas de fora.
const PROJECT_PDF_DIM_RE = /\d+[.,]\d+\s*(?:m|cm|mm)\b|\d+\s*(?:mm|cm)\b|\d+'\s*-?\s*\d*(?:\s\d+\/\d+)?"|\d+(?:\s\d+\/\d+)?"/g;
function projectPdfDimScore(n) {
  const t = (projectPdfPages[n - 1] || {}).text || '';
  return (t.match(PROJECT_PDF_DIM_RE) || []).length;
}
function projectPdfPickPages(pages) {
  const comCota = pages.filter((n) => projectPdfDimScore(n) >= 2).sort((a, b) => projectPdfDimScore(b) - projectPdfDimScore(a));
  const semCota = pages.filter((n) => projectPdfDimScore(n) < 2);
  const max = PROJECT_PDF_MAX_PAGES_PER_ROOM;
  const escolhidas = comCota.slice(0, semCota.length ? max - 1 : max).concat(semCota).slice(0, max);
  // ordem do PDF dentro do escolhido (planta antes de elevação, como o autor pôs)
  return escolhidas.sort((a, b) => pages.indexOf(a) - pages.indexOf(b));
}

// ---------- 2. Criar os projetos ----------
// Mesmo "zerar" do botão ↺ Novo projeto (resetProject, portal-08), sem o
// confirm — o lote já perguntou uma vez só no começo.
function projectPdfResetOpenProject() {
  projectSlots = [];
  selectedProjectSlotId = null;
  projectWallSegments = defaultProjectWallSegments();
  projectActiveWallIndex = 0;
  loadedProjectFavorite = null;
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

  projectPdfRunning = true;
  setProjectPdfError('');
  chosen.forEach((r) => { r.status = 'queued'; r.message = ''; r.warnings = []; });
  renderProjectPdfReview(); refreshProjectPdfCreateBtn();
  const setRoom = (r, status, message) => { r.status = status; if (message != null) r.message = message; renderProjectPdfReview(); };

  const catalogP = Promise.all([buildProjectPhotoCatalog(), buildProjectPhotoColorList()]);
  catalogP.catch(() => {});
  let feitos = 0;
  try {
    // IA de todos os ambientes, 2 por vez (cada um: leitura + casamento)
    const aiPromises = projectPdfPool(chosen.map((r) => async () => {
      setRoom(r, 'reading', tPdf('st_reading'));
      const pages = projectPdfPickPages(r.pages);
      const images = [];
      for (const n of pages) {
        const im = await projectPdfHiRes(n);
        images.push({ base64: im.base64, mime: im.mime, label: tPdf('page_label', { n }) });
      }
      return projectPhotoRunPipeline({
        images, quality, ceilingMm, source: 'drawing', roomName: r.name, catalogP,
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
        setRoom(r, 'building', tPdf('st_building'));
        projectPdfResetOpenProject();
        const { created, warnings } = await projectPhotoApplyState(st);
        r.warnings = [...st.warnings, ...warnings];
        if (st.unmatched.length) r.warnings.push(tPhoto('skipped_title') + ' ' + st.unmatched.map((u) => u.volume.label).join(' · '));
        if (!created) throw new Error(tPhoto('err_nothing_created'));
        renderProjectCanvas();
        await new Promise((res) => setTimeout(res, 400)); // 3D desenhar antes da miniatura
        const name = sp.client_name ? sp.client_name + ' · ' + r.name : r.name;
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
    renderProjectPdfReview();
    refreshProjectPdfCreateBtn();
    setProjectPdfStatus(feitos ? tPdf('status_done', { n: feitos, folder: sp.client_name || '—' }) : '');
    if (typeof loadProjectFavoritesList === 'function') loadProjectFavoritesList();
  }
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
