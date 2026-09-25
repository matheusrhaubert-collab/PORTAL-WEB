// ============================================================
// Projeto a partir de FOTO — aba Projetos (2026-09-24)
// ============================================================
// Pedido do Matt: "quero que recrie esse processo de decodificação e busca,
// posicionamento e cores e tamanhos, para colocar uma nova ferramenta no
// portal". O processo que virou ferramenta é EXATAMENTE o que foi feito à
// mão no teste da sala com painel ripado (24/09), em 5 passos:
//
//   1. DECODIFICAR a foto — listar as peças de marcenaria visíveis (painel
//      ripado, painel liso, prateleiras, rack suspenso, tampo de fechamento…)
//      com escala estimada por referências conhecidas (TV, porta, pé-direito
//      informado).
//   2. BUSCAR no catálogo — cada peça vira um módulo REAL do catálogo Legno
//      (id, nome, família/categoria). Peça sem equivalente (TV, LED, gesso,
//      sofá) NUNCA vira placeholder: entra na lista "não reproduzido".
//      Decisão do Matt (24/09): pular e listar, não substituir por parecido.
//   3. POSICIONAR — x_mm a partir da esquerda da parede, floor_height_mm pra
//      suspenso, tudo numa parede só (a que estiver ativa).
//   4. TAMANHO — largura/altura/profundidade em mm, clampadas no min/max do
//      módulo; painel mais largo que o máximo vira 2+ módulos lado a lado.
//   5. COR — nome de cor do cadastro (tabela colors), aplicada em TODOS os
//      papéis de cor do módulo (Caixa/Painel/Porta…), igual ao teste.
//
// Divisão de responsabilidade (mesma regra do Gerador por IA, não afrouxar):
// a IA (Edge Function generate-project-from-photo, Gemini multimodal) só
// PROPÕE módulo/medida/posição/cor. Quem cria o slot é o motor de sempre —
// insertProjectModuleDefault (preço real via pricing.js), updateProjectSlot-
// Dimension (profundidade), applyColorToProjectSlot (cor por papel),
// clampProjectSlotPosition. Módulo gerado por foto é indistinguível de um
// posto na mão — por isso o projeto salva/recarrega/orça igual.
//
// Tudo que a IA devolve passa por sanitizeProjectPhotoItems() ANTES da
// tela de revisão: id fora do catálogo é descartado, medida clampada,
// x limitado à parede, cor inexistente cai no default do módulo com aviso.
// Depois o usuário ainda revisa (checkbox por item) antes de criar.
//
// Integração: mesmo padrão do js/portal-2020-import.js — <script> clássico,
// carregado depois do portal-08 e antes do portal-09 (que tem o boot). Só
// usa funções globais que já existem (ver lista no fim do arquivo).

let projectPhotoResult = null;     // { wall, items, skipped, summary, warnings } sanitizado
let projectPhotoImage = null;      // { base64, mime, width, height } da foto reduzida
let projectPhotoRunning = false;

// Foto vai reduzida pra não estourar o payload da Edge Function nem gastar
// token à toa — 1280px no lado maior é de sobra pra IA ler uma sala.
const PROJECT_PHOTO_MAX_SIDE_PX = 1280;
const PROJECT_PHOTO_JPEG_QUALITY = 0.85;

// ---------- Catálogo compacto que vai no prompt ----------
//
// Mesmo espírito do buildProjectAiCatalog (portal-06b), mas SEM exigir
// function_id — aqui a IA precisa enxergar o catálogo inteiro (painéis,
// peças soltas, flutuantes) porque uma foto pode ter qualquer coisa. Ficam
// de fora: inativo, invisível, cópia de projeto (project_copy_of).
async function buildProjectPhotoCatalog() {
  const [fam, cat, sub] = await Promise.all([
    supabaseClient.from('families').select('id,name'),
    supabaseClient.from('categories').select('id,name'),
    supabaseClient.from('subcategories').select('id,name')
  ]);
  const nameOf = (res) => Object.fromEntries(((res && res.data) || []).map((x) => [x.id, x.name]));
  const F = nameOf(fam), C = nameOf(cat), S = nameOf(sub);

  return (allModules || [])
    .filter((m) => m && m.active !== false && !m.is_invisible && !m.project_copy_of)
    .map((m) => ({
      id: m.id,
      name: m.name,
      family: F[m.family_id] || null,
      category: C[m.category_id] || null,
      subcategory: S[m.subcategory_id] || null,
      mount_type: m.mount_type || null,
      is_decoration: !!m.is_decoration,
      hint: m.ai_hint || null,
      // [min, default, max] por eixo — a IA escolhe dentro, o cliente clampa
      // de novo por garantia.
      w: [num(m.width_min_mm), num(m.width_default_mm), num(m.width_max_mm)],
      h: [num(m.height_min_mm), num(m.height_default_mm), num(m.height_max_mm)],
      d: [num(m.depth_min_mm), num(m.depth_default_mm), num(m.depth_max_mm)]
    }));

  function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
}

// Lista de cores do cadastro (tabela colors) — só nome + hex + veio. A IA
// escolhe pelo NOME; o cliente depois procura esse nome nas opções de cor de
// cada papel do módulo (fetchModuleColorsByRoleRaw), nunca aplica cor que o
// módulo não aceita.
async function buildProjectPhotoColorList() {
  const { data, error } = await supabaseClient
    .from('colors')
    .select('name, swatch_hex, has_grain, active, sort_order')
    .eq('active', true)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message || String(error));
  return (data || []).map((c) => ({ name: c.name, hex: c.swatch_hex || null, grain: !!c.has_grain }));
}

// ---------- Foto: ler, reduzir, virar base64 ----------

function readProjectPhotoFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      try {
        const scale = Math.min(1, PROJECT_PHOTO_MAX_SIDE_PX / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', PROJECT_PHOTO_JPEG_QUALITY);
        URL.revokeObjectURL(url);
        resolve({ base64: dataUrl.split(',')[1], mime: 'image/jpeg', width: w, height: h, dataUrl });
      } catch (e) { URL.revokeObjectURL(url); reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(I18n.t('project_photo.err_image_read'))); };
    img.src = url;
  });
}

// ---------- Sanitização do que a IA devolveu ----------
//
// A Edge Function já filtra id fora do catálogo e clampa, mas o cliente
// repete porque é ele quem conhece a parede ativa (largura real) e as opções
// de cor por papel — e porque nunca se confia num payload só porque veio
// "do servidor".
function clampNum(v, min, max) {
  let n = Number(v);
  if (!Number.isFinite(n)) n = min;
  if (Number.isFinite(min)) n = Math.max(n, min);
  if (Number.isFinite(max)) n = Math.min(n, max);
  return n;
}

function sanitizeProjectPhotoItems(data, catalog, wallWidthMm, ceilingMm) {
  const byId = new Map(catalog.map((m) => [m.id, m]));
  const warnings = [];
  const items = [];
  (Array.isArray(data.items) ? data.items : []).forEach((raw, idx) => {
    const m = byId.get(raw.module_id);
    if (!m) {
      warnings.push(I18n.t('project_photo.warn_unknown_module', { label: raw.label || ('#' + (idx + 1)) }));
      return;
    }
    const width_mm = clampNum(raw.width_mm, m.w[0], m.w[2]);
    const height_mm = clampNum(raw.height_mm, m.h[0], m.h[2]);
    const depth_mm = clampNum(raw.depth_mm, m.d[0], m.d[2]);
    let floor_height_mm = clampNum(raw.floor_height_mm, 0, Math.max(ceilingMm - height_mm, 0));
    let x_mm = clampNum(raw.x_mm, 0, Math.max(wallWidthMm - width_mm, 0));
    if (Number(raw.width_mm) > m.w[2] + 0.5) {
      warnings.push(I18n.t('project_photo.warn_clamped', { label: raw.label || m.name, axis: 'W', mm: m.w[2] }));
    }
    if (Number(raw.x_mm) + width_mm > wallWidthMm + 0.5) {
      warnings.push(I18n.t('project_photo.warn_moved_into_wall', { label: raw.label || m.name }));
    }
    items.push({
      include: true,
      order: idx,
      module_id: m.id,
      module_name: m.name,
      label: String(raw.label || m.name),
      x_mm, width_mm, height_mm, depth_mm, floor_height_mm,
      color_name: raw.color_name ? String(raw.color_name) : null,
      reason: raw.reason ? String(raw.reason) : ''
    });
  });

  const wall = {
    width_mm: clampNum(data.wall && data.wall.width_mm, 500, 20000),
    ceiling_mm: clampNum(data.wall && data.wall.ceiling_mm, 1800, 6000)
  };
  const skipped = (Array.isArray(data.skipped) ? data.skipped : []).map((s) => String(s)).filter(Boolean);
  return { wall, items, skipped, summary: data.summary ? String(data.summary) : '', warnings };
}

// ---------- Modal: abrir/fechar/status ----------

function openProjectPhotoModal() {
  const modal = document.getElementById('po-proj-photo-modal');
  if (!modal) return;
  projectPhotoResult = null;
  projectPhotoImage = null;
  const input = document.getElementById('po-proj-photo-input');
  if (input) input.value = '';
  const preview = document.getElementById('po-proj-photo-preview');
  if (preview) { preview.src = ''; preview.style.display = 'none'; }
  const review = document.getElementById('po-proj-photo-review');
  if (review) { review.innerHTML = ''; review.style.display = 'none'; }
  const createBtn = document.getElementById('po-proj-photo-create-btn');
  if (createBtn) createBtn.style.display = 'none';
  const runBtn = document.getElementById('po-proj-photo-run-btn');
  if (runBtn) { runBtn.style.display = ''; runBtn.disabled = true; }
  const notes = document.getElementById('po-proj-photo-notes');
  if (notes) notes.value = '';

  // Medidas da parede/teto: pré-preenchidas com o que já está na tela (a
  // parede ativa e o pé-direito do ambiente) — a IA usa como escala. O
  // usuário pode corrigir aqui se souber a medida real da foto.
  const wallInput = document.getElementById('po-proj-photo-wall-input');
  const ceilInput = document.getElementById('po-proj-photo-ceiling-input');
  const unit = projectPhotoUnit();
  if (wallInput) wallInput.value = projectPhotoFormatMm(getProjectWallWidthMm(projectActiveWallIndex || 0), unit);
  if (ceilInput) ceilInput.value = projectPhotoFormatMm(roomSettings.ceiling_mm, unit);
  const unitEls = modal.querySelectorAll('.po-proj-photo-unit');
  unitEls.forEach((el) => { el.textContent = unit; });

  setProjectPhotoError('');
  setProjectPhotoStatus('');
  modal.classList.add('open');
}

function closeProjectPhotoModal() {
  const modal = document.getElementById('po-proj-photo-modal');
  if (modal) modal.classList.remove('open');
}

function setProjectPhotoError(msg) {
  const el = document.getElementById('po-proj-photo-error');
  if (!el) return;
  el.textContent = msg || '';
  el.style.display = msg ? 'block' : 'none';
}

function setProjectPhotoStatus(msg) {
  const el = document.getElementById('po-proj-photo-status');
  if (!el) return;
  el.textContent = msg || '';
  el.style.display = msg ? 'block' : 'none';
}

// Unidade: segue o seletor global (mm/in) — mesma fonte dos campos da faixa.
function projectPhotoUnit() {
  const sel = document.getElementById('po-unit-select');
  return sel && sel.value === 'in' ? 'in' : 'mm';
}
function projectPhotoFormatMm(mm, unit) {
  const n = Number(mm) || 0;
  return unit === 'in' ? String(Math.round((n / 25.4) * 100) / 100) : String(Math.round(n));
}
function projectPhotoParseToMm(text, unit) {
  const s = String(text || '').trim().replace(',', '.');
  if (!s) return NaN;
  // aceita "126", "126.5" e fração tipo "157 15/32"
  const frac = s.match(/^(\d+(?:\.\d+)?)\s+(\d+)\/(\d+)$/);
  let n;
  if (frac) n = Number(frac[1]) + Number(frac[2]) / Number(frac[3]);
  else n = Number(s);
  if (!Number.isFinite(n)) return NaN;
  return unit === 'in' ? n * 25.4 : n;
}

// ---------- Passo 0: anexar a foto ----------

async function runProjectPhotoAttach(file) {
  setProjectPhotoError('');
  if (!/^image\//.test(file.type)) {
    setProjectPhotoError(I18n.t('project_photo.err_not_image'));
    return;
  }
  setProjectPhotoStatus(I18n.t('project_photo.status_reading'));
  try {
    projectPhotoImage = await readProjectPhotoFile(file);
    const preview = document.getElementById('po-proj-photo-preview');
    if (preview) { preview.src = projectPhotoImage.dataUrl; preview.style.display = ''; }
    const runBtn = document.getElementById('po-proj-photo-run-btn');
    if (runBtn) runBtn.disabled = false;
    setProjectPhotoStatus('');
  } catch (err) {
    console.error('[foto-projeto] falha lendo imagem:', err);
    setProjectPhotoStatus('');
    setProjectPhotoError(err.message || I18n.t('project_photo.err_image_read'));
  }
}

// ---------- Passo 1→2: mandar pra IA e mostrar a revisão ----------

async function runProjectPhotoAnalyze() {
  if (projectPhotoRunning) return;
  if (!projectPhotoImage) { setProjectPhotoError(I18n.t('project_photo.err_no_image')); return; }

  const unit = projectPhotoUnit();
  const wallWidthMm = projectPhotoParseToMm((document.getElementById('po-proj-photo-wall-input') || {}).value, unit);
  const ceilingMm = projectPhotoParseToMm((document.getElementById('po-proj-photo-ceiling-input') || {}).value, unit);
  if (!(wallWidthMm > 0) || !(ceilingMm > 0)) {
    setProjectPhotoError(I18n.t('project_photo.err_bad_measures'));
    return;
  }

  projectPhotoRunning = true;
  setProjectPhotoError('');
  setProjectPhotoStatus(I18n.t('project_photo.status_calling'));
  const runBtn = document.getElementById('po-proj-photo-run-btn');
  if (runBtn) runBtn.disabled = true;

  try {
    const [catalog, colors] = await Promise.all([buildProjectPhotoCatalog(), buildProjectPhotoColorList()]);
    if (catalog.length === 0) throw new Error(I18n.t('project_photo.err_no_catalog'));

    const notes = (document.getElementById('po-proj-photo-notes') || {}).value || '';
    const { data, error } = await supabaseClient.functions.invoke('generate-project-from-photo', {
      body: {
        image_base64: projectPhotoImage.base64,
        image_mime: projectPhotoImage.mime,
        wall_width_mm: wallWidthMm,
        ceiling_mm: ceilingMm,
        baseboard_mm: roomSettings.baseboard_mm || 0,
        notes,
        catalog,
        colors,
        lang: (typeof I18n !== 'undefined' && typeof I18n.getLanguage === 'function') ? (I18n.getLanguage() || 'pt') : 'pt'
      }
    });

    // Mesmo tratamento do Gerador por IA: o corpo da resposta traz a
    // mensagem real (404 = falta deploy, GEMINI_API_KEY ausente etc.).
    if (error && !(data && data.items)) {
      console.error('generate-project-from-photo falhou:', error, data);
      throw new Error(await describeEdgeFunctionError(error, data, 'generate-project-from-photo'));
    }
    if (!data || !Array.isArray(data.items)) {
      throw new Error((data && data.error) || I18n.t('project_photo.err_empty_result'));
    }

    const result = sanitizeProjectPhotoItems(data, catalog, wallWidthMm, ceilingMm);
    projectPhotoResult = result;
    renderProjectPhotoReview(result);
    setProjectPhotoStatus('');

    const createBtn = document.getElementById('po-proj-photo-create-btn');
    if (result.items.length === 0) {
      setProjectPhotoError(I18n.t('project_photo.err_nothing_matched'));
      if (createBtn) createBtn.style.display = 'none';
    } else {
      if (createBtn) createBtn.style.display = '';
      if (runBtn) runBtn.style.display = 'none';
    }
  } catch (err) {
    setProjectPhotoError(err.message || String(err));
  } finally {
    projectPhotoRunning = false;
    setProjectPhotoStatus('');
    if (runBtn) runBtn.disabled = false;
  }
}

// ---------- Tela de revisão ----------

function escapeHtmlPhoto(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function renderProjectPhotoReview(result) {
  const el = document.getElementById('po-proj-photo-review');
  if (!el) return;
  const unit = projectPhotoUnit();
  const f = (mm) => projectPhotoFormatMm(mm, unit);

  const rows = result.items.map((it, i) => `
    <tr>
      <td><input type="checkbox" data-photo-idx="${i}" ${it.include ? 'checked' : ''}></td>
      <td>${escapeHtmlPhoto(it.label)}</td>
      <td>${escapeHtmlPhoto(it.module_name)}</td>
      <td class="mono">${f(it.width_mm)} × ${f(it.height_mm)} × ${f(it.depth_mm)}</td>
      <td class="mono">${f(it.x_mm)} / ${f(it.floor_height_mm)}</td>
      <td>${escapeHtmlPhoto(it.color_name || '—')}</td>
    </tr>`).join('');

  const skippedHtml = result.skipped.length
    ? `<p class="hint"><strong>${I18n.t('project_photo.skipped_title')}</strong> ${escapeHtmlPhoto(result.skipped.join(' · '))}</p>`
    : '';
  const warnHtml = result.warnings.length
    ? `<p class="hint">${escapeHtmlPhoto(result.warnings.join(' '))}</p>`
    : '';
  const wallHtml = `
    <p class="hint">${I18n.t('project_photo.wall_line', { w: f(result.wall.width_mm), h: f(result.wall.ceiling_mm), unit })}
      <label class="po-proj-photo-wall-apply"><input type="checkbox" id="po-proj-photo-apply-wall" checked> ${I18n.t('project_photo.apply_wall_label')}</label>
    </p>`;

  el.innerHTML = `
    ${result.summary ? `<p class="hint">${escapeHtmlPhoto(result.summary)}</p>` : ''}
    ${wallHtml}
    <div class="po-import2020-tablewrap">
      <table class="po-import2020-table po-proj-photo-table">
        <thead><tr>
          <th></th>
          <th>${I18n.t('project_photo.col_piece')}</th>
          <th>${I18n.t('project_photo.col_module')}</th>
          <th>${I18n.t('project_photo.col_dims')} (${unit})</th>
          <th>${I18n.t('project_photo.col_pos')} (${unit})</th>
          <th>${I18n.t('project_photo.col_color')}</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${skippedHtml}
    ${warnHtml}`;
  el.style.display = '';

  el.querySelectorAll('input[data-photo-idx]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const it = projectPhotoResult && projectPhotoResult.items[Number(cb.dataset.photoIdx)];
      if (it) it.include = cb.checked;
    });
  });
}

// ---------- Passo 3: criar os módulos no projeto atual ----------
//
// Reproduz o processo do teste manual, item por item e SEQUENCIAL (insert-
// ProjectModuleDefault resolve profundidade contra o que já está na parede):
//   insertProjectModuleDefault(id, {wall_index, x_mm, width_mm, height_mm,
//     floor_height_mm})  → slot com preço real
//   slot.x_mm = x        (o insert pode recalcular x; reafirma o da foto)
//   updateProjectSlotDimension(slot, 'depth', d)   (insert não aceita depth)
//   applyColorToProjectSlot(slot, roleId, cor)     (todos os papéis do módulo)
//   clampProjectSlotPosition(slot)
// Ordem de inserção: profundidade crescente (painel de fundo → prateleira →
// rack), pra que o resolvedor de profundidade veja primeiro o que fica
// encostado na parede.
async function runProjectPhotoBuild() {
  if (!projectPhotoResult) return;
  const chosen = projectPhotoResult.items.filter((it) => it.include);
  if (chosen.length === 0) { setProjectPhotoError(I18n.t('project_photo.err_none_selected')); return; }

  if (projectSlots.length > 0) {
    const ok = confirm(I18n.t('project_photo.confirm_replace'));
    if (!ok) return;
  }

  const createBtn = document.getElementById('po-proj-photo-create-btn');
  if (createBtn) createBtn.disabled = true;
  setProjectPhotoError('');
  setProjectPhotoStatus(I18n.t('project_photo.status_building'));

  const warnings = [];
  try {
    const wallIndex = Number(projectActiveWallIndex || 0);
    const applyWall = document.getElementById('po-proj-photo-apply-wall');
    if (applyWall && applyWall.checked) {
      const w = projectPhotoResult.wall.width_mm;
      if (Math.abs(w - getProjectWallWidthMm(wallIndex)) > 1) setProjectWallWidthMm(w, false, wallIndex);
      const c = projectPhotoResult.wall.ceiling_mm;
      if (Math.abs(c - roomSettings.ceiling_mm) > 1) {
        roomSettings.ceiling_mm = c;
        if (typeof refreshRoomSettingsInputs === 'function') refreshRoomSettingsInputs();
      }
    }
    const wallWidthMm = getProjectWallWidthMm(wallIndex);

    projectSlots = [];
    selectedProjectSlotId = null;

    const ordered = chosen.slice().sort((a, b) => (a.depth_mm - b.depth_mm) || (a.order - b.order));
    const colorCache = new Map(); // module_id -> opções por papel
    let created = 0;

    for (const it of ordered) {
      const slot = await insertProjectModuleDefault(it.module_id, {
        wall_index: wallIndex,
        x_mm: it.x_mm,
        width_mm: it.width_mm,
        height_mm: it.height_mm,
        floor_height_mm: it.floor_height_mm
      });
      if (!slot) { warnings.push(I18n.t('project_photo.warn_insert_failed', { label: it.label })); continue; }
      created++;

      slot.x_mm = Math.max(0, Math.min(it.x_mm, wallWidthMm - Number(slot.width_mm || 0)));
      if (Math.abs(Number(slot.depth_mm) - it.depth_mm) > 0.5) updateProjectSlotDimension(slot, 'depth', it.depth_mm);
      if (Math.abs(Number(slot.height_mm) - it.height_mm) > 0.5) {
        warnings.push(I18n.t('project_photo.warn_height_adjusted', { label: it.label, mm: Math.round(slot.height_mm) }));
      }

      if (it.color_name) {
        let opts = colorCache.get(it.module_id);
        if (!opts) { opts = await fetchModuleColorsByRoleRaw(it.module_id); colorCache.set(it.module_id, opts); }
        let applied = 0;
        Object.keys(opts || {}).forEach((roleId) => {
          const c = (opts[roleId] || []).find((o) => o.name === it.color_name);
          if (c) { applyColorToProjectSlot(slot, roleId, c); applied++; }
        });
        if (applied === 0) warnings.push(I18n.t('project_photo.warn_color_missing', { label: it.label, color: it.color_name }));
      }

      slot.x_mm = Math.max(0, Math.min(it.x_mm, wallWidthMm - Number(slot.width_mm || 0)));
      clampProjectSlotPosition(slot);
    }

    if (created === 0) throw new Error(I18n.t('project_photo.err_nothing_created'));

    renderProjectCanvas();
    markProjectDirty();
    closeProjectPhotoModal();

    const el = document.getElementById('po-proj-error');
    if (el) {
      const lines = [I18n.t('project_photo.done_summary', { n: created })];
      if (projectPhotoResult.skipped.length) lines.push(I18n.t('project_photo.skipped_title') + ' ' + projectPhotoResult.skipped.join(' · '));
      if (warnings.length) lines.push(warnings.join(' '));
      el.textContent = lines.join(' — ');
      el.style.display = 'block';
    }
  } catch (err) {
    setProjectPhotoError(err.message || String(err));
  } finally {
    setProjectPhotoStatus('');
    if (createBtn) createBtn.disabled = false;
  }
}

// ---------- Listeners do modal (mesmo padrão do Importar do 2020) ----------

(function attachProjectPhotoListeners() {
  const openBtn = document.getElementById('po-proj-photo-open-btn');
  if (openBtn) openBtn.addEventListener('click', openProjectPhotoModal);

  const closeBtn = document.getElementById('po-proj-photo-modal-close');
  if (closeBtn) closeBtn.addEventListener('click', closeProjectPhotoModal);

  const cancelBtn = document.getElementById('po-proj-photo-cancel-btn');
  if (cancelBtn) cancelBtn.addEventListener('click', closeProjectPhotoModal);

  const runBtn = document.getElementById('po-proj-photo-run-btn');
  if (runBtn) runBtn.addEventListener('click', runProjectPhotoAnalyze);

  const createBtn = document.getElementById('po-proj-photo-create-btn');
  if (createBtn) createBtn.addEventListener('click', runProjectPhotoBuild);

  const attachBtn = document.getElementById('po-proj-photo-attach-btn');
  const input = document.getElementById('po-proj-photo-input');
  if (attachBtn && input) {
    attachBtn.addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (file) runProjectPhotoAttach(file);
    });
  }

  // Arrastar a foto pra cima do modal também funciona (desktop).
  const modal = document.getElementById('po-proj-photo-modal');
  if (modal) {
    modal.addEventListener('click', (e) => { if (e.target === modal) closeProjectPhotoModal(); });
    modal.addEventListener('dragover', (e) => { e.preventDefault(); });
    modal.addEventListener('drop', (e) => {
      e.preventDefault();
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) runProjectPhotoAttach(file);
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && modal.classList.contains('open')) closeProjectPhotoModal();
  });
})();

// ---------- Visibilidade: só administrador (pedido do Matt, 24/09) ----------
//
// Os dois botões ("📷 Projeto a partir de foto" e "📥 Importar do 2020")
// nascem com display:none no portal.html e só aparecem quando o servidor
// confirma que o usuário logado é admin — a mesma RPC is_admin() (migration
// 018, security definer) que a moderação da galeria usa. Nada de lista de
// e-mail no front: quem decide é o banco. Roda no carregamento e de novo a
// cada mudança de login/logout.
async function refreshProjectAdminOnlyButtons() {
  const ids = ['po-proj-photo-open-btn', 'po-proj-import2020-open-btn'];
  let isAdmin = false;
  try {
    const { data: session } = await supabaseClient.auth.getSession();
    if (session && session.session) {
      const { data, error } = await supabaseClient.rpc('is_admin');
      isAdmin = !error && data === true;
    }
  } catch (e) {
    isAdmin = false;
  }
  ids.forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) btn.style.display = isAdmin ? '' : 'none';
  });
}

(function attachProjectAdminOnlyButtons() {
  if (typeof supabaseClient === 'undefined') return;
  refreshProjectAdminOnlyButtons();
  try {
    supabaseClient.auth.onAuthStateChange(() => { refreshProjectAdminOnlyButtons(); });
  } catch (e) { /* sem auth listener — fica só a checagem do load */ }
})();

// Globais usados (todos já existem no portal antes deste arquivo carregar):
//   supabaseClient, allModules, roomSettings, projectSlots, selectedProjectSlotId,
//   projectActiveWallIndex, getProjectWallWidthMm, setProjectWallWidthMm,
//   refreshRoomSettingsInputs, insertProjectModuleDefault,
//   updateProjectSlotDimension, applyColorToProjectSlot,
//   fetchModuleColorsByRoleRaw, clampProjectSlotPosition, renderProjectCanvas,
//   markProjectDirty, describeEdgeFunctionError, I18n.
