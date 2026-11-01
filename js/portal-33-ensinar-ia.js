// ============================================================
// ENSINAR A IA — aba Projetos › AI Services (2026-11-01, migration 255)
// ============================================================
// Matt: "quero ensinar a IA a ler um projeto e selecionar as peças
// corretamente. depois podemos fazer um ambiente de aula, que eu vá
// mostrando pra IA na foto e como deve ser reproduzido no projeto."
//
// Aula = "QUANDO aparecer X → FAÇA Y". Vai no prompt da leitura e do
// casamento (função generate-project-from-photo, b.lessons) e o portal
// garante o alvo (portal-11: projectPhotoLessonFor / compositions).
// Esta tela: lista das aulas, formulário, e "o que faltou na última
// leitura" (window.projectPhotoLastRead) com um clique pra virar aula.
// Só admin (PROJECT_ADMIN_ONLY_BUTTON_IDS, portal-11).
// Fase seguinte: recorte da imagem como exemplo (image_path, bucket).
//
// Integração: <script> clássico, carregado antes do portal-09.

const TEACH_VOLUME_KINDS = ['bench', 'bookcase', 'shelf_unit', 'floating_shelf', 'open_shelf', 'headboard', 'nightstand', 'dresser', 'desk',
  'tv_unit', 'wall_panel', 'slat_panel', 'base_cabinet', 'drawer_base', 'sink_base', 'wall_cabinet', 'tall_cabinet', 'wardrobe', 'closet_tower',
  'closet_drawer_unit', 'vanity', 'island', 'shoe_rack', 'other'];
let teachEditingId = null;

function tTeach(k, vars) { return I18n.t('teach.' + k, vars); }
function teachEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function ensureTeachModal() {
  if (document.getElementById('po-teach-modal')) return;
  const el = document.createElement('div');
  el.id = 'po-teach-modal';
  el.innerHTML = `
  <div class="po-proj-ai-modal-card po-teach-card">
    <button type="button" class="po-auth-modal-close" id="po-teach-close" aria-label="Fechar">&times;</button>
    <h3>${teachEsc(tTeach('title'))}</h3>
    <p class="hint">${teachEsc(tTeach('intro'))}</p>
    <div class="po-teach-cols">
      <div class="po-teach-list-col">
        <div class="po-teach-missing" id="po-teach-missing"></div>
        <h4>${teachEsc(tTeach('list_title'))} <span id="po-teach-count"></span></h4>
        <div id="po-teach-list" class="po-teach-list"></div>
        <button type="button" class="secondary" id="po-teach-new">＋ ${teachEsc(tTeach('new'))}</button>
      </div>
      <form class="po-teach-form" id="po-teach-form" autocomplete="off">
        <h4 id="po-teach-form-title">${teachEsc(tTeach('new'))}</h4>
        <label>${teachEsc(tTeach('f_title'))}<input type="text" id="po-teach-title" required maxlength="80"></label>
        <label>${teachEsc(tTeach('f_trigger'))}<textarea id="po-teach-trigger" rows="2" required placeholder="${teachEsc(tTeach('ph_trigger'))}"></textarea></label>
        <div class="po-teach-row">
          <label>${teachEsc(tTeach('f_keywords'))}<input type="text" id="po-teach-keywords" placeholder="${teachEsc(tTeach('ph_keywords'))}"></label>
          <label>${teachEsc(tTeach('f_rooms'))}<input type="text" id="po-teach-rooms" placeholder="${teachEsc(tTeach('ph_rooms'))}"></label>
        </div>
        <div class="po-teach-kinds" id="po-teach-kinds"><span class="hint">${teachEsc(tTeach('f_kinds'))}</span></div>
        <label>${teachEsc(tTeach('f_how'))}<textarea id="po-teach-how" rows="3" required placeholder="${teachEsc(tTeach('ph_how'))}"></textarea></label>
        <fieldset class="po-teach-target">
          <legend>${teachEsc(tTeach('f_target'))}</legend>
          <label><input type="radio" name="po-teach-mode" value="module" checked> ${teachEsc(tTeach('mode_module'))}</label>
          <div class="po-teach-sub" data-mode="module">
            <input type="text" id="po-teach-module-filter" placeholder="${teachEsc(tTeach('ph_module_filter'))}">
            <select id="po-teach-module" size="6"></select>
          </div>
          <label><input type="radio" name="po-teach-mode" value="composition"> ${teachEsc(tTeach('mode_composition'))}</label>
          <div class="po-teach-sub" data-mode="composition">
            <select id="po-teach-composition"><option value="closet">closet — Bottom · Toe 3 · Back</option><option value="suspenso">suspenso — Bottom · Stretcher · Back</option></select>
            <div class="po-teach-row">
              <label>${teachEsc(tTeach('f_cols'))}<input type="number" id="po-teach-cols" min="1" max="8" value="1"></label>
              <label>${teachEsc(tTeach('f_shelves'))}<input type="number" id="po-teach-shelves" min="0" max="12" value="0"></label>
              <label>${teachEsc(tTeach('f_drawers'))}<input type="number" id="po-teach-drawers" min="0" max="8" value="0"></label>
              <label>${teachEsc(tTeach('f_doors'))}<select id="po-teach-doors"><option value="none">${teachEsc(tTeach('doors_none'))}</option><option value="hinged">${teachEsc(tTeach('doors_hinged'))}</option></select></label>
            </div>
          </div>
          <label><input type="radio" name="po-teach-mode" value="skip"> ${teachEsc(tTeach('mode_skip'))}</label>
        </fieldset>
        <div class="po-teach-row">
          <label><input type="checkbox" id="po-teach-st-read" checked> ${teachEsc(tTeach('st_read'))}</label>
          <label><input type="checkbox" id="po-teach-st-match" checked> ${teachEsc(tTeach('st_match'))}</label>
          <label><input type="checkbox" id="po-teach-active" checked> ${teachEsc(tTeach('f_active'))}</label>
        </div>
        <div class="po-teach-actions">
          <span class="hint" id="po-teach-status"></span>
          <button type="button" class="secondary" id="po-teach-delete" style="display:none">${teachEsc(tTeach('delete'))}</button>
          <button type="submit" class="primary">${teachEsc(tTeach('save'))}</button>
        </div>
      </form>
    </div>
  </div>`;
  document.body.appendChild(el);
  const kinds = el.querySelector('#po-teach-kinds');
  TEACH_VOLUME_KINDS.forEach((k) => {
    const lab = document.createElement('label');
    lab.className = 'po-teach-chip';
    lab.innerHTML = `<input type="checkbox" value="${k}"> ${k}`;
    kinds.appendChild(lab);
  });
  el.querySelector('#po-teach-close').addEventListener('click', closeTeachModal);
  el.addEventListener('click', (e) => { if (e.target === el) closeTeachModal(); });
  el.querySelector('#po-teach-new').addEventListener('click', () => teachFillForm(null));
  el.querySelector('#po-teach-form').addEventListener('submit', teachSave);
  el.querySelector('#po-teach-delete').addEventListener('click', teachDelete);
  el.querySelector('#po-teach-module-filter').addEventListener('input', teachFillModuleSelect);
  el.querySelectorAll('input[name="po-teach-mode"]').forEach((r) => r.addEventListener('change', teachSyncMode));
  el.querySelector('#po-teach-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]'); if (!b) return;
    const l = (aiLessonsAll || []).find((x) => x.id === b.dataset.id);
    if (l) teachFillForm(l);
  });
  el.querySelector('#po-teach-missing').addEventListener('click', (e) => {
    const b = e.target.closest('[data-vol]'); if (!b) return;
    const last = window.projectPhotoLastRead;
    const u = last && last.unmatched[Number(b.dataset.vol)];
    if (u) teachPrefillFromVolume(u.volume, last);
  });
}

let aiLessonsAll = [];
async function openTeachModal() {
  ensureTeachModal();
  document.getElementById('po-teach-modal').classList.add('open');
  teachFillModuleSelect();
  teachRenderMissing();
  await teachReload();
  teachFillForm(null);
}
function closeTeachModal() { const el = document.getElementById('po-teach-modal'); if (el) el.classList.remove('open'); }

async function teachReload() {
  const { data, error } = await supabaseClient.from('ai_lessons').select('*').order('sort_order').order('created_at');
  if (error) { teachStatus(error.message, true); return; }
  aiLessonsAll = data || [];
  if (typeof loadAiLessons === 'function') await loadAiLessons(true);
  teachRenderList();
}
function teachRenderList() {
  const box = document.getElementById('po-teach-list');
  document.getElementById('po-teach-count').textContent = aiLessonsAll.length ? '(' + aiLessonsAll.length + ')' : '';
  if (!aiLessonsAll.length) { box.innerHTML = `<p class="hint">${teachEsc(tTeach('empty'))}</p>`; return; }
  box.innerHTML = aiLessonsAll.map((l) => {
    const t = l.target || {};
    const alvo = t.mode === 'composition' ? tTeach('mode_composition_short', { c: t.composition || 'closet' }) : t.mode === 'skip' ? tTeach('mode_skip') : (t.module_name || '—');
    return `<button type="button" class="po-teach-item${l.active ? '' : ' off'}${l.id === teachEditingId ? ' sel' : ''}" data-id="${l.id}">
      <strong>${teachEsc(l.title)}</strong><span>${teachEsc(l.trigger).slice(0, 90)}</span><em>→ ${teachEsc(alvo)}</em></button>`;
  }).join('');
}
function teachRenderMissing() {
  const box = document.getElementById('po-teach-missing');
  const last = window.projectPhotoLastRead;
  if (!last || !last.unmatched || !last.unmatched.length) { box.innerHTML = ''; return; }
  box.innerHTML = `<h4>${teachEsc(tTeach('missing_title', { room: last.room || '' }))}</h4>` + last.unmatched.map((u, i) =>
    `<button type="button" class="po-teach-item miss" data-vol="${i}"><strong>${teachEsc(u.volume.label || u.volume.kind)}</strong>
     <span>${u.volume.kind} · ${Math.round(u.volume.width_mm)} × ${Math.round(u.volume.height_mm)} × ${Math.round(u.volume.depth_mm)} mm</span><em>${teachEsc(u.reason || '')}</em></button>`).join('');
}
function teachPrefillFromVolume(v, last) {
  teachFillForm(null);
  document.getElementById('po-teach-title').value = v.label || v.kind;
  document.getElementById('po-teach-trigger').value = (v.label || '') + (v.notes ? ' — ' + v.notes : '') + ' (' + Math.round(v.width_mm) + ' × ' + Math.round(v.height_mm) + ' × ' + Math.round(v.depth_mm) + ' mm, ' + (v.doors || 0) + ' portas, ' + (v.drawers || 0) + ' gavetas)';
  document.getElementById('po-teach-keywords').value = String(v.label || '').split(/\s+/).filter((w) => w.length >= 4).slice(0, 4).join(', ');
  if (last && last.roomKind) document.getElementById('po-teach-rooms').value = last.roomKind;
  const chk = document.querySelector('#po-teach-kinds input[value="' + v.kind + '"]');
  if (chk) chk.checked = true;
  document.getElementById('po-teach-how').focus();
}
function teachFillModuleSelect() {
  const sel = document.getElementById('po-teach-module');
  const f = aiLessonNorm((document.getElementById('po-teach-module-filter') || {}).value || '');
  const cur = sel.value;
  const mods = (typeof allModules !== 'undefined' ? allModules : []).filter((m) => m && m.active !== false && !m.is_invisible && !m.project_copy_of)
    .filter((m) => !f || aiLessonNorm(m.name).includes(f)).slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
  sel.innerHTML = mods.map((m) => `<option value="${teachEsc(m.name)}"${m.name === cur ? ' selected' : ''}>${teachEsc(m.name)}</option>`).join('');
}
function teachSyncMode() {
  const mode = (document.querySelector('input[name="po-teach-mode"]:checked') || {}).value || 'module';
  document.querySelectorAll('#po-teach-modal .po-teach-sub').forEach((d) => { d.style.display = d.dataset.mode === mode ? '' : 'none'; });
}
function teachFillForm(l) {
  teachEditingId = l ? l.id : null;
  const g = (id) => document.getElementById(id);
  g('po-teach-form-title').textContent = l ? tTeach('edit') : tTeach('new');
  g('po-teach-title').value = l ? l.title : '';
  g('po-teach-trigger').value = l ? l.trigger : '';
  g('po-teach-keywords').value = l ? (l.keywords || []).join(', ') : '';
  g('po-teach-rooms').value = l ? (l.room_kinds || []).join(', ') : '';
  g('po-teach-how').value = l ? l.how : '';
  document.querySelectorAll('#po-teach-kinds input').forEach((c) => { c.checked = !!(l && (l.volume_kinds || []).includes(c.value)); });
  const t = (l && l.target) || {};
  const mode = t.mode || 'module';
  document.querySelectorAll('input[name="po-teach-mode"]').forEach((r) => { r.checked = r.value === mode; });
  g('po-teach-module-filter').value = '';
  teachFillModuleSelect();
  if (t.module_name) g('po-teach-module').value = t.module_name;
  g('po-teach-composition').value = t.composition || 'closet';
  const col = t.interior && t.interior.columns && t.interior.columns[0];
  const zona = (tipo) => col ? (col.zones || []).filter((z) => z.type === tipo).reduce((a, z) => a + (Number(z.count) || 0), 0) : 0;
  g('po-teach-cols').value = t.interior && t.interior.columns ? t.interior.columns.length : 1;
  g('po-teach-shelves').value = zona('shelves');
  g('po-teach-drawers').value = zona('drawers');
  g('po-teach-doors').value = col && col.doors ? col.doors : 'none';
  g('po-teach-st-read').checked = !l || !Array.isArray(l.stage) || l.stage.includes('read');
  g('po-teach-st-match').checked = !l || !Array.isArray(l.stage) || l.stage.includes('match');
  g('po-teach-active').checked = !l || l.active !== false;
  g('po-teach-delete').style.display = l ? '' : 'none';
  teachStatus('');
  teachSyncMode();
  teachRenderList();
}
function teachInteriorFromForm() {
  const n = Math.max(1, Number(document.getElementById('po-teach-cols').value) || 1);
  const sh = Number(document.getElementById('po-teach-shelves').value) || 0;
  const dr = Number(document.getElementById('po-teach-drawers').value) || 0;
  const doors = document.getElementById('po-teach-doors').value || 'none';
  if (!sh && !dr && doors === 'none') return null;
  const zones = [];
  if (dr) zones.push({ type: 'drawers', height_mm: 0, count: dr });
  if (sh) zones.push({ type: 'shelves', height_mm: 0, count: sh });
  if (!zones.length) zones.push({ type: 'open', height_mm: 0, count: 0 });
  return { columns: Array.from({ length: n }, () => ({ width_mm: 0, zones: JSON.parse(JSON.stringify(zones)), doors, doors_cover: 'all' })) };
}
function teachStatus(msg, erro) { const el = document.getElementById('po-teach-status'); if (el) { el.textContent = msg || ''; el.style.color = erro ? '#c0392b' : ''; } }

async function teachSave(e) {
  e.preventDefault();
  const g = (id) => document.getElementById(id).value;
  const lista = (s) => String(s || '').split(/[,;]/).map((x) => x.trim()).filter(Boolean);
  const mode = (document.querySelector('input[name="po-teach-mode"]:checked') || {}).value || 'module';
  const target = { mode };
  if (mode === 'module') {
    target.module_name = g('po-teach-module');
    if (!target.module_name) { teachStatus(tTeach('err_module'), true); return; }
  } else if (mode === 'composition') {
    target.composition = g('po-teach-composition');
    const interior = teachInteriorFromForm();
    if (interior) target.interior = interior;
  }
  const stage = [];
  if (document.getElementById('po-teach-st-read').checked) stage.push('read');
  if (document.getElementById('po-teach-st-match').checked) stage.push('match');
  const row = {
    title: g('po-teach-title').trim(), trigger: g('po-teach-trigger').trim(), how: g('po-teach-how').trim(),
    keywords: lista(g('po-teach-keywords')), room_kinds: lista(g('po-teach-rooms')),
    volume_kinds: Array.from(document.querySelectorAll('#po-teach-kinds input:checked')).map((c) => c.value),
    stage: stage.length ? stage : ['read', 'match'], target, active: document.getElementById('po-teach-active').checked
  };
  if (!row.title || !row.trigger || !row.how) { teachStatus(tTeach('err_required'), true); return; }
  teachStatus(tTeach('saving'));
  let res;
  if (teachEditingId) res = await supabaseClient.from('ai_lessons').update(row).eq('id', teachEditingId).select().single();
  else {
    try { const { data: s } = await supabaseClient.auth.getSession(); row.created_by = s && s.session && s.session.user ? s.session.user.id : null; } catch (err) { /* ok */ }
    res = await supabaseClient.from('ai_lessons').insert(row).select().single();
  }
  if (res.error) { teachStatus(res.error.message, true); return; }
  teachEditingId = res.data.id;
  await teachReload();
  teachFillForm(aiLessonsAll.find((l) => l.id === teachEditingId) || null);
  teachStatus(tTeach('saved'));
}
async function teachDelete() {
  if (!teachEditingId || !confirm(tTeach('confirm_delete'))) return;
  const { error } = await supabaseClient.from('ai_lessons').delete().eq('id', teachEditingId);
  if (error) { teachStatus(error.message, true); return; }
  await teachReload();
  teachFillForm(null);
}

document.addEventListener('DOMContentLoaded', () => {
  const b = document.getElementById('po-proj-teach-btn');
  if (b) b.addEventListener('click', openTeachModal);
});
