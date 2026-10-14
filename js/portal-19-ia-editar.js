// ============================================================
// IA · EDITAR PROJETO — grupo IA Services da barra do Projetos (2026-10-14)
// ============================================================
// Pedido do Matt: "quero um novo botão em IA Services que é uma caixa de
// texto pro projetista escrever o que quer mudar no projeto e executar.
// exemplo: reduzir as alturas dos aéreos, aumentar prateleiras, trocar as
// cores, alinhar a pia do balcão com a janela, trocar as gavetas por
// portas, acrescentar um rack de TV abaixo do painel da TV."
//
// COMO FUNCIONA
//   1. Monta o projeto ABERTO como JSON compacto (editProjectAiContext):
//      cada slot com módulo, posição, medidas, limites, cores atuais e
//      opções de cor por papel, quantidades configuráveis (prateleiras);
//      paredes com comprimento e aberturas (janela/porta); catálogo
//      (buildProjectPhotoCatalog, portal-11).
//   2. Manda pra Edge Function generate-project-from-photo, stage='edit'
//      (texto só, Gemini). Ela devolve uma LISTA DE OPERAÇÕES — resize,
//      move, set_color, set_quantity, replace_module, add_module,
//      remove_module — nunca o projeto inteiro.
//   3. Este arquivo executa as operações pelas MESMAS funções da tela
//      (projectSlotClampedDimensionMm, clampProjectSlotPosition,
//      applyColorToProjectSlot, repointProjectSlotToModule,
//      insertProjectModuleDefault, recomputeProjectSlotPricing). IA decide
//      O QUÊ; o JS decide se cabe e quanto custa — mesma divisão do gerador
//      por IA (portal-06b). Preço, 3D, furação: idênticos a editar na mão.
//   4. O lote inteiro vira UM passo do Desfazer (ver editProjectAiRun).
//
// LIMITE DA 1ª VERSÃO: interior montado no Construtor (slot.layout) não é
// editado — a IA é instruída a dizer isso em "não feito".
// Visível só pra administrador, igual aos outros botões de IA (ver
// refreshProjectAdminOnlyButtons, portal-11).
//
// Pontos de integração tocados: nenhum motor (preço/posição/cor/furação)
// ganhou conta nova — tudo passa pelos funis que já existem.

let editProjectAiRunning = false;
let editProjectAiCatalogCache = null;
const EDIT_AI_QUALITY_KEY = 'legno_edit_ai_quality';

function tIae(k, vars) { return I18n.t('ai_edit.' + k, vars); }
function iaeEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function iaeUnit() { return ((document.getElementById('po-unit-select') || {}).value || 'mm') === 'in' ? 'in' : 'mm'; }
function iaeRound(v) { const n = Number(v); return Number.isFinite(n) ? Math.round(n) : null; }
function iaeRoleName(roleId) { return ((colorRolesCache || []).find((r) => r.id === roleId) || {}).name || String(roleId); }
function iaeSlotById(id) { return projectSlots.find((s) => String(s.id) === String(id)) || null; }
function iaeSlotName(s) { return (s && s.module && s.module.name) || '?'; }

// ---------- Contexto (projeto como texto) ----------
function iaeQtyItems(pieces, acc) {
  acc = acc || [];
  (pieces || []).forEach((p) => {
    if (p.quantity_configurable) acc.push(p);
    if (p.child_pieces && p.child_pieces.length) iaeQtyItems(p.child_pieces, acc);
  });
  return acc;
}

function iaeSlotContext(s, catById) {
  const m = s.module || {};
  const cat = catById.get(m.id) || {};
  const colors = {}, colorOptions = {};
  Object.keys(s.colorsByRole || {}).forEach((roleId) => {
    const nome = iaeRoleName(roleId);
    const atual = s.colorsByRole[roleId];
    colors[nome] = atual ? atual.name : null;
    colorOptions[nome] = ((s.colorOptionsByRole || {})[roleId] || []).map((c) => c.name).slice(0, 60);
  });
  const quantities = iaeQtyItems(s.pieces).map((p) => ({
    piece_id: String(p.id),
    ref: p.reference || p.name || (p.components && p.components.name) || null,
    qty: Number((s.shelfQuantities || {})[p.id] != null ? s.shelfQuantities[p.id] : (p.quantity_default != null ? p.quantity_default : p.quantity)),
    min: p.quantity_min != null ? Number(p.quantity_min) : null,
    max: p.quantity_max != null ? Number(p.quantity_max) : null
  }));
  const floor = isFloorSlot(s);
  const lim = (a) => [iaeRoundOrNull(m[a + '_min_mm']), iaeRoundOrNull(m[a + '_max_mm'])];
  const out = {
    id: String(s.id),
    module_id: m.id,
    module: m.name || null,
    family: cat.family || null,
    category: cat.category || null,
    mount_type: m.mount_type || null,
    hint: m.ai_hint || null,
    placement: floor ? 'floor' : 'wall',
    wall_index: floor ? null : Number(s.wall_index || 0),
    x_mm: floor ? null : iaeRound(s.x_mm),
    floor_height_mm: iaeRound(s.floor_height_mm || 0),
    width_mm: iaeRound(s.width_mm),
    height_mm: iaeRound(s.height_mm),
    depth_mm: iaeRound(s.depth_mm),
    top_mm: iaeRound(Number(s.floor_height_mm || 0) + Number(s.height_mm || 0)),
    limits: { w: lim('width'), h: lim('height'), d: lim('depth') },
    colors,
    color_options: colorOptions
  };
  if (m.width_locked && (s.widthPresetsMm || []).length) out.width_presets = s.widthPresetsMm.map(iaeRound);
  if (m.height_locked && (s.heightPresetsMm || []).length) out.height_presets = s.heightPresetsMm.map(iaeRound);
  if (quantities.length) out.quantities = quantities;
  if (s.layout) out.builder = true;
  if (s.group_name) out.group = s.group_name;
  if (m.is_decoration) out.decoration = true;
  return out;
}
function iaeRoundOrNull(v) { const n = Number(v); return v != null && Number.isFinite(n) && n > 0 ? Math.round(n) : null; }

async function editProjectAiContext() {
  if (!editProjectAiCatalogCache) editProjectAiCatalogCache = await buildProjectPhotoCatalog();
  const catalog = editProjectAiCatalogCache;
  const catById = new Map(catalog.map((c) => [c.id, c]));
  const walls = [];
  const n = getProjectWallCount();
  for (let i = 0; i < n; i++) {
    walls.push({
      index: i,
      length_mm: iaeRound(getProjectWallWidthMm(i)),
      openings: (getProjectWallOpenings(i) || []).map((o) => ({
        type: o.type, x_mm: iaeRound(o.x_mm), width_mm: iaeRound(o.width_mm),
        height_mm: iaeRound(o.height_mm), sill_mm: iaeRound(o.sill_mm || 0)
      }))
    });
  }
  const sel = new Set();
  if (selectedProjectSlotId != null) sel.add(String(selectedProjectSlotId));
  try { (projectMultiSelectIds || new Set()).forEach((id) => sel.add(String(id))); } catch (e) { /* ok */ }
  return {
    project: {
      room: { ceiling_mm: iaeRound(roomSettings.ceiling_mm), baseboard_mm: iaeRound(roomSettings.baseboard_mm || 0) },
      walls,
      selected_slot_ids: Array.from(sel),
      slots: projectSlots.map((s) => iaeSlotContext(s, catById))
    },
    catalog
  };
}

// ---------- Execução das operações ----------
// Cada função devolve { ok, text } pro relatório. Nenhuma chama
// markProjectDirty/render — quem faz isso é editProjectAiApply, uma vez só.

function iaeAfterGeometry(s) {
  recomputeProjectSlotPricing(s);
  if (!isFloorSlot(s)) {
    clampProjectSlotPosition(s);
    resolveProjectSlotDepth(s, projectSlotsSameWallExcluding(s));
  } else if (typeof clampFloorSlotIntoRoom === 'function') {
    try { clampFloorSlotIntoRoom(s); } catch (e) { /* mantém */ }
  }
}

function iaeDims(s, op, warnings) {
  [['width', op.width_mm], ['height', op.height_mm], ['depth', op.depth_mm]].forEach(([axis, v]) => {
    if (v == null) return;
    const got = projectSlotClampedDimensionMm(s, axis, v);
    if (Math.abs(got - v) > 1) warnings.push(tIae('warn_clamped', { mod: iaeSlotName(s), axis: tIae('axis_' + axis), v: formatDimension(got, iaeUnit()) }));
    s[axis + '_mm'] = got;
  });
}

function iaeOpResize(op, warnings) {
  op.slot_ids.forEach((id) => {
    const s = iaeSlotById(id);
    if (!s) return;
    iaeDims(s, op, warnings);
    if (op.floor_height_mm != null && !isFloorSlot(s)) s.floor_height_mm = Math.max(0, op.floor_height_mm);
    iaeAfterGeometry(s);
  });
}

function iaeOpMove(op, warnings) {
  op.slot_ids.forEach((id) => {
    const s = iaeSlotById(id);
    if (!s) return;
    if (isFloorSlot(s)) { warnings.push(tIae('warn_floor_move', { mod: iaeSlotName(s) })); return; }
    if (op.wall_index != null) s.wall_index = op.wall_index;
    if (op.x_mm != null) s.x_mm = op.x_mm;
    if (op.floor_height_mm != null) s.floor_height_mm = Math.max(0, op.floor_height_mm);
    clampProjectSlotPosition(s);
    resolveProjectSlotDepth(s, projectSlotsSameWallExcluding(s));
  });
}

function iaeFindRoleIds(s, roleName) {
  const ids = Object.keys(s.colorOptionsByRole || {}).filter((rid) => (s.colorsByRole || {})[rid] !== undefined);
  if (!roleName) return ids;
  const alvo = String(roleName).trim().toLowerCase();
  return ids.filter((rid) => iaeRoleName(rid).trim().toLowerCase() === alvo);
}
function iaeFindColor(s, roleId, colorName) {
  const alvo = String(colorName || '').trim().toLowerCase();
  return ((s.colorOptionsByRole || {})[roleId] || []).find((c) => String(c.name || '').trim().toLowerCase() === alvo) || null;
}

function iaeOpSetColor(op, warnings) {
  const slots = op.slot_ids.length ? op.slot_ids.map(iaeSlotById).filter(Boolean) : projectSlots.slice();
  let applied = 0;
  slots.forEach((s) => {
    iaeFindRoleIds(s, op.role).forEach((rid) => {
      const c = iaeFindColor(s, rid, op.color_name);
      if (!c) return;
      applyColorToProjectSlot(s, rid, c);
      applied++;
    });
    recomputeProjectSlotPricing(s);
  });
  if (!applied) warnings.push(tIae('warn_color_missing', { color: op.color_name || '?' }));
  return applied > 0;
}

function iaeOpSetQuantity(op, warnings) {
  op.slot_ids.forEach((id) => {
    const s = iaeSlotById(id);
    if (!s) return;
    const p = iaeQtyItems(s.pieces).find((x) => String(x.id) === String(op.piece_id));
    if (!p) { warnings.push(tIae('warn_qty_missing', { mod: iaeSlotName(s) })); return; }
    let q = Number(op.quantity);
    if (!Number.isFinite(q)) return;
    if (p.quantity_min != null) q = Math.max(q, Number(p.quantity_min));
    if (p.quantity_max != null) q = Math.min(q, Number(p.quantity_max));
    if (q !== Number(op.quantity)) warnings.push(tIae('warn_qty_clamped', { mod: iaeSlotName(s), q }));
    s.shelfQuantities = Object.assign({}, s.shelfQuantities || {}, { [p.id]: q });
    recomputeProjectSlotPricing(s);
  });
}

async function iaeOpReplace(op, warnings) {
  for (const id of op.slot_ids) {
    const s = iaeSlotById(id);
    if (!s) continue;
    const antes = { w: s.width_mm, h: s.height_mm, d: s.depth_mm };
    // repointProjectSlotToModule renderiza e marca sujo por conta própria —
    // tudo bem: o Desfazer é consolidado num passo só no fim (editProjectAiRun).
    await repointProjectSlotToModule(s, op.module_id);
    s.layout = null;
    s.layoutPieces = [];
    s.thumbnail_data_url = null;
    s.width_mm = projectSlotClampedDimensionMm(s, 'width', op.width_mm != null ? op.width_mm : antes.w);
    s.height_mm = projectSlotClampedDimensionMm(s, 'height', op.height_mm != null ? op.height_mm : antes.h);
    s.depth_mm = projectSlotClampedDimensionMm(s, 'depth', op.depth_mm != null ? op.depth_mm : antes.d);
    if (Math.abs(s.width_mm - antes.w) > 1 && op.width_mm == null) {
      warnings.push(tIae('warn_clamped', { mod: iaeSlotName(s), axis: tIae('axis_width'), v: formatDimension(s.width_mm, iaeUnit()) }));
    }
    iaeAfterGeometry(s);
  }
}

function iaeCopyColors(from, to) {
  if (!from) return 0;
  let n = 0;
  Object.keys(to.colorOptionsByRole || {}).forEach((rid) => {
    if ((to.colorsByRole || {})[rid] === undefined) return;
    // mesmo papel; senão, mesmo NOME de papel
    let src = (from.colorsByRole || {})[rid];
    if (!src) {
      const nome = iaeRoleName(rid).toLowerCase();
      const rid2 = Object.keys(from.colorsByRole || {}).find((r) => iaeRoleName(r).toLowerCase() === nome);
      src = rid2 ? from.colorsByRole[rid2] : null;
    }
    if (!src) return;
    const c = (to.colorOptionsByRole[rid] || []).find((o) => o.id === src.id) || iaeFindColor(to, rid, src.name);
    if (c) { applyColorToProjectSlot(to, rid, c); n++; }
  });
  return n;
}

async function iaeOpAdd(op, warnings) {
  const naParede = op.wall_index != null;
  const overrides = naParede
    ? { wall_index: op.wall_index, x_mm: op.x_mm != null ? op.x_mm : undefined, width_mm: op.width_mm, height_mm: op.height_mm, floor_height_mm: op.floor_height_mm }
    : { fromLibrary: true, width_mm: op.width_mm, height_mm: op.height_mm };
  const s = await insertProjectModuleDefault(op.module_id, overrides);
  if (!s) { warnings.push(tIae('warn_add_failed', { r: op.reason })); return null; }
  if (op.depth_mm != null) s.depth_mm = projectSlotClampedDimensionMm(s, 'depth', op.depth_mm);
  if (naParede) {
    if (op.floor_height_mm != null) s.floor_height_mm = Math.max(0, op.floor_height_mm);
    if (op.x_mm != null) s.x_mm = op.x_mm;
  }
  if (op.color_from_slot_id) iaeCopyColors(iaeSlotById(op.color_from_slot_id), s);
  else if (op.color_name) iaeOpSetColor({ slot_ids: [String(s.id)], role: op.role, color_name: op.color_name }, warnings);
  iaeAfterGeometry(s);
  return s;
}

function iaeOpRemove(op) {
  const ids = new Set(op.slot_ids.map(String));
  projectSlots = projectSlots.filter((s) => !ids.has(String(s.id)));
  if (selectedProjectSlotId != null && ids.has(String(selectedProjectSlotId))) selectedProjectSlotId = null;
  try { ids.forEach((id) => projectMultiSelectIds.delete(id)); } catch (e) { /* ok */ }
  projectSlots.forEach((s) => {
    if (s.attached_to_slot_id != null && ids.has(String(s.attached_to_slot_id))) { s.attached_to_slot_id = null; s.attached_face = null; }
  });
}

async function editProjectAiApply(ops) {
  const results = [];
  const warnings = [];
  const touched = new Set();
  for (const op of ops) {
    // nomes ANTES de executar (remover/trocar mudam o que o id aponta)
    op._names = (op.slot_ids || []).map((id) => iaeSlotName(iaeSlotById(id))).filter((x) => x !== '?');
    const w0 = warnings.length;
    let ok = true;
    try {
      if (op.op === 'resize') iaeOpResize(op, warnings);
      else if (op.op === 'move') iaeOpMove(op, warnings);
      else if (op.op === 'set_color') ok = iaeOpSetColor(op, warnings);
      else if (op.op === 'set_quantity') iaeOpSetQuantity(op, warnings);
      else if (op.op === 'replace_module') await iaeOpReplace(op, warnings);
      else if (op.op === 'add_module') { const s = await iaeOpAdd(op, warnings); ok = !!s; if (s) touched.add(String(s.id)); }
      else if (op.op === 'remove_module') iaeOpRemove(op);
    } catch (e) {
      ok = false;
      console.error('[ia-editar] operação falhou:', op, e);
      warnings.push(tIae('warn_op_failed', { r: op.reason || op.op, msg: (e && e.message) || String(e) }));
    }
    if (op.op !== 'remove_module') (op.slot_ids || []).forEach((id) => touched.add(String(id)));
    results.push({ op, ok, warnings: warnings.slice(w0) });
  }
  // Sobreposição que sobrou (a IA move vizinhos, mas o clamp pode ter
  // segurado algum): avisa em vez de empurrar às cegas.
  touched.forEach((id) => {
    const s = iaeSlotById(id);
    if (!s || isFloorSlot(s)) return;
    try {
      if (projectSlotOverlapsNeighbor(s, Number(s.x_mm || 0))) warnings.push(tIae('warn_overlap', { mod: iaeSlotName(s) }));
    } catch (e) { /* ok */ }
  });
  return { results, warnings };
}

// ---------- Fluxo ----------
async function editProjectAiRun() {
  if (editProjectAiRunning) return;
  const ta = document.getElementById('po-ai-edit-text');
  const instruction = (ta && ta.value || '').trim();
  if (!instruction) { iaeStatus(tIae('err_empty'), true); return; }
  if (!projectSlots.length) { iaeStatus(tIae('err_no_modules'), true); return; }
  const quality = (document.getElementById('po-ai-edit-quality') || {}).value === 'pro' ? 'pro' : 'flash';
  try { localStorage.setItem(EDIT_AI_QUALITY_KEY, quality); } catch (e) { /* ok */ }

  editProjectAiRunning = true;
  iaeBusy(true);
  iaeStatus(tIae('status_thinking'));
  document.getElementById('po-ai-edit-result').innerHTML = '';
  try {
    const ctx = await editProjectAiContext();
    const body = {
      stage: 'edit', instruction, quality,
      lang: (I18n.getLanguage && I18n.getLanguage()) || 'pt',
      unit: iaeUnit(),
      project: ctx.project,
      catalog: ctx.catalog
    };
    const { data, error } = await supabaseClient.functions.invoke('generate-project-from-photo', { body });
    if (error || !data || data.error) {
      console.error('generate-project-from-photo (edit) falhou:', error, data);
      throw new Error(await describeEdgeFunctionError(error, data, 'generate-project-from-photo'));
    }
    const ops = Array.isArray(data.operations) ? data.operations : [];
    if (!ops.length) {
      iaeStatus('');
      iaeRenderResult(data, { results: [], warnings: [] }, false);
      return;
    }

    iaeStatus(tIae('status_applying', { n: ops.length }));
    // UM PASSO SÓ NO DESFAZER: guarda a pilha e a foto de antes; as
    // funções reaproveitadas (repointProjectSlotToModule etc.) podem chamar
    // markProjectDirty no meio, e se o lote demorar mais que a coalescência
    // (600 ms) isso viraria vários passos. No fim a pilha é reescrita como
    // "pilha de antes + foto de antes" — um Voltar desfaz o pedido inteiro.
    const stackAntes = projectUndoStack.slice();
    const fotoAntes = projectUndoSnapshot();
    const out = await editProjectAiApply(ops);
    renderProjectCanvas();
    markProjectDirty();
    projectUndoStack = stackAntes.concat([fotoAntes]);
    if (projectUndoStack.length > PROJECT_UNDO_MAX) projectUndoStack.shift();
    projectRedoStack = [];
    projectUndoBaseline = projectUndoSnapshot();
    projectUndoLastPushAt = Date.now();
    refreshProjectUndoButton();
    refreshProjectRedoButton();
    try { if (typeof renderProjectSummary === 'function') renderProjectSummary(); } catch (e) { /* ok */ }

    iaeStatus('');
    iaeRenderResult(data, out, true);
    if (ta) ta.select();
  } catch (e) {
    iaeStatus((e && e.message) || String(e), true);
  } finally {
    editProjectAiRunning = false;
    iaeBusy(false);
  }
}

// ---------- Tela ----------
function iaeStatus(msg, isError) {
  const el = document.getElementById('po-ai-edit-status');
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('erro', !!isError);
}
function iaeBusy(on) {
  const b = document.getElementById('po-ai-edit-run');
  if (b) { b.disabled = on; b.textContent = on ? tIae('run_busy') : tIae('run_btn'); }
}

function iaeOpLabel(op) {
  const nomes = op._names || (op.slot_ids || []).map((id) => iaeSlotName(iaeSlotById(id))).filter((x) => x !== '?');
  const alvo = nomes.length > 3 ? tIae('n_modules', { n: nomes.length }) : nomes.join(', ');
  return tIae('op_' + op.op) + (alvo ? ' · ' + alvo : '');
}

function iaeRenderResult(data, out, applied) {
  const box = document.getElementById('po-ai-edit-result');
  if (!box) return;
  let html = '';
  if (data.summary || data.understanding) {
    html += '<p class="po-ai-edit-summary">' + iaeEsc(data.summary || data.understanding) + '</p>';
  }
  if (out.results.length) {
    html += '<ul class="po-ai-edit-ops">' + out.results.map((r) =>
      '<li class="' + (r.ok ? 'ok' : 'falhou') + '"><span class="po-ai-edit-mark">' + (r.ok ? '✓' : '✗') + '</span>'
      + '<div><strong>' + iaeEsc(iaeOpLabel(r.op)) + '</strong>'
      + (r.op.reason ? '<br><span>' + iaeEsc(r.op.reason) + '</span>' : '')
      + r.warnings.map((w) => '<br><em>' + iaeEsc(w) + '</em>').join('')
      + '</div></li>').join('') + '</ul>';
  }
  const restantes = out.warnings.filter((w) => !out.results.some((r) => r.warnings.includes(w)));
  const naoFeito = (data.not_done || []).concat(restantes);
  if (naoFeito.length) {
    html += '<div class="po-ai-edit-notdone"><strong>' + iaeEsc(tIae('not_done_title')) + '</strong><ul>'
      + naoFeito.map((t) => '<li>' + iaeEsc(t) + '</li>').join('') + '</ul></div>';
  }
  if (!out.results.length && !naoFeito.length) html += '<p class="po-ai-edit-summary">' + iaeEsc(tIae('nothing_to_do')) + '</p>';
  if (applied) {
    html += '<div class="po-client-actions"><button type="button" class="secondary" id="po-ai-edit-undo">' + iaeEsc(tIae('undo_btn')) + '</button></div>';
  }
  box.innerHTML = html;
  const u = document.getElementById('po-ai-edit-undo');
  if (u) u.addEventListener('click', () => {
    undoProjectChange();
    u.disabled = true;
    u.textContent = tIae('undone');
  });
}

const IAE_EXAMPLES = ['ex_1', 'ex_2', 'ex_3', 'ex_4', 'ex_5', 'ex_6'];

function ensureEditProjectAiModal() {
  if (document.getElementById('po-ai-edit-modal')) return;
  let q = 'flash';
  try { q = localStorage.getItem(EDIT_AI_QUALITY_KEY) === 'pro' ? 'pro' : 'flash'; } catch (e) { /* ok */ }
  const m = document.createElement('div');
  m.id = 'po-ai-edit-modal';
  m.className = 'po-dimview-modal po-ai-walls-modal';
  m.innerHTML = '<div class="po-dimview-modal-backdrop" id="po-ai-edit-backdrop"></div>'
    + '<div class="po-dimview-modal-card po-ai-walls-card po-ai-edit-card">'
    + '<div class="po-dimview-modal-head"><span class="po-dimview-modal-title">' + iaeEsc(tIae('title')) + '</span>'
    + '<button type="button" class="po-dimview-modal-close" id="po-ai-edit-close" aria-label="×">×</button></div>'
    + '<div class="po-dimview-modal-body po-ai-walls-body">'
    + '<p class="po-ai-walls-intro">' + iaeEsc(tIae('intro')) + '</p>'
    + '<textarea id="po-ai-edit-text" class="po-ai-edit-text" rows="4" placeholder="' + iaeEsc(tIae('placeholder')) + '"></textarea>'
    + '<div class="po-ai-edit-chips">' + IAE_EXAMPLES.map((k) => '<button type="button" class="po-ai-edit-chip">' + iaeEsc(tIae(k)) + '</button>').join('') + '</div>'
    + '<div class="po-ai-edit-bar">'
    + '<label class="po-ai-edit-quality"><span>' + iaeEsc(tIae('quality_label')) + '</span><select id="po-ai-edit-quality">'
    + '<option value="flash"' + (q === 'flash' ? ' selected' : '') + '>' + iaeEsc(tIae('quality_fast')) + '</option>'
    + '<option value="pro"' + (q === 'pro' ? ' selected' : '') + '>' + iaeEsc(tIae('quality_pro')) + '</option></select></label>'
    + '<button type="button" class="po-btn-primary-block po-ai-edit-run" id="po-ai-edit-run">' + iaeEsc(tIae('run_btn')) + '</button>'
    + '</div>'
    + '<div class="po-ai-walls-status" id="po-ai-edit-status"></div>'
    + '<div class="po-ai-edit-result" id="po-ai-edit-result"></div>'
    + '</div></div>';
  document.body.appendChild(m);
  const fechar = () => { if (!editProjectAiRunning) m.classList.remove('aberto'); };
  document.getElementById('po-ai-edit-backdrop').addEventListener('click', fechar);
  document.getElementById('po-ai-edit-close').addEventListener('click', fechar);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && m.classList.contains('aberto')) fechar(); });
  document.getElementById('po-ai-edit-run').addEventListener('click', editProjectAiRun);
  const ta = document.getElementById('po-ai-edit-text');
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); editProjectAiRun(); }
  });
  m.querySelectorAll('.po-ai-edit-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      ta.value = ta.value.trim() ? ta.value.trim() + '\n' + chip.textContent : chip.textContent;
      ta.focus();
    });
  });
}

function openEditProjectAiModal() {
  ensureEditProjectAiModal();
  const m = document.getElementById('po-ai-edit-modal');
  m.classList.add('aberto');
  iaeStatus(projectSlots.length ? '' : tIae('err_no_modules'), !projectSlots.length);
  setTimeout(() => { const ta = document.getElementById('po-ai-edit-text'); if (ta) ta.focus(); }, 50);
}

(function attachEditProjectAiBtn() {
  const btn = document.getElementById('po-proj-ai-edit-btn');
  if (btn) btn.addEventListener('click', openEditProjectAiModal);
  if (typeof I18n !== 'undefined' && typeof I18n.onLanguageChange === 'function') {
    I18n.onLanguageChange(() => { const m = document.getElementById('po-ai-edit-modal'); if (m && !m.classList.contains('aberto')) m.remove(); });
  }
})();
