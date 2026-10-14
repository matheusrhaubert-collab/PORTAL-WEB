// ============================================================
// IA · PAREDES — grupo Paredes da barra do Projetos (2026-10-13)
// ============================================================
// Pedido do Matt: "quero um novo ícone na walls que é uma IA que lê uma foto
// ou PDF e faz só as paredes, com janela e portas. mas o foco é só paredes.
// lembrando que todas medições que aparecem no desenho da foto devem ser
// consideradas por dentro, interno de uma parede pra outra. então
// considerar a espessura da parede pra fora."
//
// Reaproveita a MESMA leitura do "Projeto a partir de foto"
// (generate-project-from-photo, stage='read'), com walls_only=true: o prompt
// manda devolver volumes vazio, ler TODO o contorno interno numa planta e
// tratar toda cota como medida INTERNA. Do lado de cá, as paredes viram
// segmentos pelo mesmo projectPhotoWallsToSegments (portal-11): o segmento é
// a FACE INTERNA e a espessura é desenhada pra fora do ambiente — então a
// medida lida é exatamente o comprimento interno, sem conta nenhuma.
//
// Aplicar troca SÓ as paredes (e o pé-direito) do projeto aberto. Módulos
// ficam onde estão (índice de parede preso no que existir). Entra no
// Desfazer e marca o projeto como não salvo.
// Visível só pra administrador, igual aos outros botões de IA (ver
// refreshProjectAdminOnlyButtons, portal-11).

const AI_WALLS_MAX_PAGES = 6;
const AI_WALLS_PAGE_PX = 2200;
let aiWallsState = null; // { room, segs } depois de ler
let aiWallsRunning = false;

function tAiw(k, vars) { return I18n.t('ai_walls.' + k, vars); }
function aiwEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function aiwUnit() { return (document.getElementById('po-unit-select') || {}).value || 'mm'; }
function aiwFmt(mm) { return formatDimension(Math.round(Number(mm) || 0), aiwUnit()); }

function ensureAiWallsModal() {
  if (document.getElementById('po-ai-walls-modal')) return;
  const un = aiwUnit() === 'in' ? 'in' : 'mm';
  const m = document.createElement('div');
  m.id = 'po-ai-walls-modal';
  m.className = 'po-dimview-modal po-ai-walls-modal';
  m.innerHTML = '<div class="po-dimview-modal-backdrop" id="po-ai-walls-backdrop"></div>'
    + '<div class="po-dimview-modal-card po-ai-walls-card">'
    + '<div class="po-dimview-modal-head"><span class="po-dimview-modal-title">' + tAiw('title') + '</span>'
    + '<button type="button" class="po-dimview-modal-close" id="po-ai-walls-close" aria-label="×">×</button></div>'
    + '<div class="po-dimview-modal-body po-ai-walls-body">'
    + '<p class="po-ai-walls-intro">' + tAiw('intro') + '</p>'
    + '<label class="po-client-field"><span>' + tAiw('file_label') + '</span>'
    + '<input type="file" id="po-ai-walls-file" accept="image/*,application/pdf" multiple /></label>'
    + '<div class="po-ai-walls-row">'
    + '<label class="po-client-field"><span>' + tAiw('ceiling_label', { u: un }) + '</span><input type="text" id="po-ai-walls-ceiling" inputmode="decimal" /></label>'
    + '<label class="po-client-field"><span>' + tAiw('quality_label') + '</span><select id="po-ai-walls-quality">'
    + '<option value="flash">' + tAiw('quality_fast') + '</option><option value="pro">' + tAiw('quality_pro') + '</option></select></label>'
    + '</div>'
    + '<label class="po-client-field"><span>' + tAiw('notes_label') + '</span><textarea id="po-ai-walls-notes" rows="2" placeholder="' + aiwEsc(tAiw('notes_ph')) + '"></textarea></label>'
    + '<div class="po-client-actions"><button type="button" class="secondary" id="po-ai-walls-read">' + tAiw('read_btn') + '</button></div>'
    + '<div class="po-ai-walls-status" id="po-ai-walls-status"></div>'
    + '<div class="po-ai-walls-result" id="po-ai-walls-result"></div>'
    + '<div class="po-client-actions"><button type="button" class="po-btn-primary-block" id="po-ai-walls-apply" disabled>' + tAiw('apply_btn') + '</button></div>'
    + '</div></div>';
  document.body.appendChild(m);
  const fechar = () => { if (!aiWallsRunning) m.classList.remove('aberto'); };
  document.getElementById('po-ai-walls-backdrop').addEventListener('click', fechar);
  document.getElementById('po-ai-walls-close').addEventListener('click', fechar);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && m.classList.contains('aberto')) fechar(); });
  document.getElementById('po-ai-walls-read').addEventListener('click', runAiWallsRead);
  document.getElementById('po-ai-walls-apply').addEventListener('click', applyAiWalls);
}

function openAiWallsModal() {
  ensureAiWallsModal();
  const m = document.getElementById('po-ai-walls-modal');
  const ceil = document.getElementById('po-ai-walls-ceiling');
  if (ceil && !ceil.value) ceil.value = projectPhotoFormatMm((roomSettings && roomSettings.ceiling_mm) || 2600, projectPhotoUnit());
  m.classList.add('aberto');
}

function aiwStatus(msg, isError) {
  const el = document.getElementById('po-ai-walls-status');
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('erro', !!isError);
}

// PDF → páginas em JPEG (até AI_WALLS_MAX_PAGES), mesmo pdf.js do portal-12.
async function aiwPdfPages(file) {
  if (typeof pdfjsLib === 'undefined') throw new Error(tAiw('err_pdfjs'));
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  }
  const doc = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const out = [];
  const n = Math.min(doc.numPages, AI_WALLS_MAX_PAGES);
  for (let i = 1; i <= n; i++) {
    const page = await doc.getPage(i);
    const v1 = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: Math.min(4, AI_WALLS_PAGE_PX / Math.max(v1.width, v1.height)) });
    const c = document.createElement('canvas');
    c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    const d = c.toDataURL('image/jpeg', 0.85);
    out.push({ base64: d.split(',')[1], mime: 'image/jpeg', label: file.name + ' · ' + tAiw('page', { n: i }) });
  }
  if (doc.numPages > n) aiwStatus(tAiw('pdf_truncated', { n }));
  return out;
}

async function runAiWallsRead() {
  if (aiWallsRunning) return;
  const files = Array.from((document.getElementById('po-ai-walls-file') || {}).files || []);
  if (!files.length) { aiwStatus(tAiw('err_no_file'), true); return; }
  const ceilingMm = projectPhotoParseToMm((document.getElementById('po-ai-walls-ceiling') || {}).value, projectPhotoUnit());
  if (!(ceilingMm > 1500)) { aiwStatus(tAiw('err_ceiling'), true); return; }
  aiWallsRunning = true;
  aiWallsState = null;
  const btn = document.getElementById('po-ai-walls-read');
  const apply = document.getElementById('po-ai-walls-apply');
  if (btn) btn.disabled = true;
  if (apply) apply.disabled = true;
  document.getElementById('po-ai-walls-result').innerHTML = '';
  try {
    aiwStatus(tAiw('status_prepare'));
    const images = [];
    let temPdf = false;
    for (const f of files) {
      if (images.length >= AI_WALLS_MAX_PAGES) break;
      if (/pdf$/i.test(f.type) || /\.pdf$/i.test(f.name)) {
        temPdf = true;
        (await aiwPdfPages(f)).forEach((p) => { if (images.length < AI_WALLS_MAX_PAGES) images.push(p); });
      } else {
        const r = await readProjectPhotoFile(f);
        images.push({ base64: r.base64, mime: r.mime, label: f.name });
      }
    }
    aiwStatus(tAiw('status_reading'));
    const lang = (typeof I18n.getLanguage === 'function' && I18n.getLanguage()) || 'pt';
    const room = await invokeProjectPhotoStage({
      stage: 'read', walls_only: true,
      quality: (document.getElementById('po-ai-walls-quality') || {}).value === 'pro' ? 'pro' : 'flash',
      images, source: temPdf ? 'drawing' : 'photo', room_name: '',
      ceiling_mm: Math.round(ceilingMm), ref_wall_mm: null,
      baseboard_mm: (roomSettings && roomSettings.baseboard_mm) || 0,
      notes: (document.getElementById('po-ai-walls-notes') || {}).value || '', lang
    });
    if (!room || !Array.isArray(room.walls) || !room.walls.length) throw new Error(tAiw('err_empty'));
    room.volumes = [];
    room.openings = Array.isArray(room.openings) ? room.openings : [];
    // parede "principal" = a mais comprida (não tem móvel pra decidir)
    const main = room.walls.reduce((bi, w, i) => (Number(w.length_mm) > Number(room.walls[bi].length_mm) ? i : bi), 0);
    const segs = projectPhotoWallsToSegments(room.walls, room.openings, room.ceiling_mm, main);
    aiWallsState = { room, segs, main };
    renderAiWallsResult();
    aiwStatus(room.summary || '');
    if (apply) apply.disabled = false;
  } catch (e) {
    console.error('[ia-paredes]', e);
    aiwStatus(tAiw('err_read', { msg: (e && e.message) || String(e) }), true);
  } finally {
    aiWallsRunning = false;
    if (btn) btn.disabled = false;
  }
}

// Planta (SVG) + lista de paredes/aberturas pra conferir antes de aplicar.
function renderAiWallsResult() {
  const box = document.getElementById('po-ai-walls-result');
  if (!box || !aiWallsState) return;
  const { room, segs } = aiWallsState;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  segs.forEach((s) => { [[s.ax, s.az], [s.bx, s.bz]].forEach(([x, z]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }); });
  const K = Math.max(x1 - x0, z1 - z0, 1000);
  const fs = K / 26, T = 150, pad = K * 0.16;
  const parts = [];
  segs.forEach((s, i) => {
    const len = Math.hypot(s.bx - s.ax, s.bz - s.az) || 1;
    const ux = (s.bx - s.ax) / len, uz = (s.bz - s.az) / len;
    let ix = -uz, iz = ux;
    if (s.inverterLado) { ix = -ix; iz = -iz; }
    const P = (u, d) => [s.ax + ux * u + ix * d, s.az + uz * u + iz * d];
    const poly = (pts, attrs) => '<polygon points="' + pts.map((p) => p[0].toFixed(0) + ',' + p[1].toFixed(0)).join(' ') + '" ' + attrs + '/>';
    // espessura pra FORA (−dentro): a face interna é a linha do segmento
    parts.push(poly([P(0, 0), P(len, 0), P(len, -T), P(0, -T)], 'fill="#6f6a63"'));
    (s.openings || []).forEach((o) => {
      parts.push(poly([P(o.x_mm, 8), P(o.x_mm + o.width_mm, 8), P(o.x_mm + o.width_mm, -T - 8), P(o.x_mm, -T - 8)],
        'fill="' + (o.type === 'window' ? '#cfe3f2' : '#ffffff') + '" stroke="#3a6f9a" stroke-width="' + (fs / 10) + '"'));
    });
    const mid = P(len / 2, fs * 1.6);
    let ang = Math.atan2(uz, ux) * 180 / Math.PI;
    if (ang > 90) ang -= 180; if (ang <= -90) ang += 180;
    parts.push('<text x="' + mid[0] + '" y="' + mid[1] + '" font-size="' + fs + '" text-anchor="middle" dominant-baseline="middle" fill="#1b1f8a" transform="rotate(' + ang.toFixed(1) + ' ' + mid[0] + ' ' + mid[1] + ')">'
      + (i + 1) + ' · ' + aiwEsc(aiwFmt(len)) + '</text>');
  });
  const svg = '<svg class="po-ai-walls-svg" viewBox="' + (x0 - pad) + ' ' + (z0 - pad) + ' ' + (x1 - x0 + 2 * pad) + ' ' + (z1 - z0 + 2 * pad) + '" preserveAspectRatio="xMidYMid meet">' + parts.join('') + '</svg>';
  const lista = room.walls.map((w, i) => {
    const ab = room.openings.filter((o) => o.wall_index === i).map((o) => {
      const nome = I18n.t('wall_editor.op_' + (o.type === 'door' ? 'door' : o.type === 'window' ? 'window' : 'passage'));
      return aiwEsc(nome) + ' ' + aiwEsc(aiwFmt(o.width_mm)) + ' × ' + aiwEsc(aiwFmt(o.height_mm))
        + (Number(o.sill_mm) > 0 ? ' · ' + aiwEsc(tAiw('sill')) + ' ' + aiwEsc(aiwFmt(o.sill_mm)) : '')
        + ' · ' + aiwEsc(tAiw('from_start')) + ' ' + aiwEsc(aiwFmt(o.x_mm));
    });
    const ang = i < room.walls.length - 1 ? ' · ' + Math.round(Number(w.angle_to_next_deg) || 0) + '°' : '';
    return '<li><strong>' + tAiw('wall_n', { n: i + 1 }) + '</strong> — ' + aiwEsc(aiwFmt(w.length_mm)) + ang
      + (ab.length ? '<br><span>' + ab.join('<br>') + '</span>' : '') + '</li>';
  }).join('');
  box.innerHTML = svg
    + '<p class="po-ai-walls-ceiling">' + aiwEsc(tAiw('ceiling_read', { v: aiwFmt(room.ceiling_mm) })) + '</p>'
    + '<ol class="po-ai-walls-list">' + lista + '</ol>'
    + (room.scale_notes ? '<p class="po-ai-walls-notes">' + aiwEsc(room.scale_notes) + '</p>' : '');
}

function applyAiWalls() {
  if (!aiWallsState) return;
  if (projectSlots.length && !confirm(tAiw('confirm_with_modules'))) return;
  const { room, segs, main } = aiWallsState;
  projectWallSegments = segs;
  // pé-direito: mesmo caminho do campo da tela (recalcula o que depende dele)
  const ceilInput = document.getElementById('po-proj-ceiling-input');
  if (Math.abs(room.ceiling_mm - roomSettings.ceiling_mm) > 1) {
    if (ceilInput) {
      ceilInput.value = formatDimension(room.ceiling_mm, aiwUnit());
      ceilInput.dispatchEvent(new Event('change'));
    } else {
      roomSettings.ceiling_mm = room.ceiling_mm;
      if (typeof refreshRoomSettingsInputs === 'function') refreshRoomSettingsInputs();
    }
  }
  const n = segs.length;
  projectSlots.forEach((s) => {
    if (isFloorSlot(s)) return;
    if (!(Number(s.wall_index) >= 0 && Number(s.wall_index) < n)) s.wall_index = Math.min(Math.max(0, Number(s.wall_index) || 0), n - 1);
    if (typeof clampProjectSlotPosition === 'function') clampProjectSlotPosition(s);
  });
  projectActiveWallIndex = Math.min(main || 0, n - 1);
  try { project3DLastFitKey = null; } catch (e) { /* vista 3D ainda não carregou */ }
  if (typeof refreshProjectWallTabs === 'function') refreshProjectWallTabs();
  if (typeof refreshProjectWallWidthInput === 'function') refreshProjectWallWidthInput();
  renderProjectCanvas();
  markProjectDirty();
  document.getElementById('po-ai-walls-modal').classList.remove('aberto');
}

(function attachAiWallsBtn() {
  const btn = document.getElementById('po-proj-ai-walls-btn');
  if (btn) btn.addEventListener('click', openAiWallsModal);
  if (typeof I18n !== 'undefined' && typeof I18n.onLanguageChange === 'function') {
    I18n.onLanguageChange(() => { const m = document.getElementById('po-ai-walls-modal'); if (m && !m.classList.contains('aberto')) m.remove(); });
  }
})();
