// ==========================================================================
// REPOSICIONAR MÓDULO — refeito do zero no modelo do Promob (2026-10-30)
// ==========================================================================
// Gesto (inalterado, ver attachProject3DEditDrag em portal-08): arrastar um
// módulo com o BOTÃO DIREITO e soltar em cima de OUTRO módulo abre esta tela.
//
// Por que foi refeito (Matt, 30/10: "essa tela definitivamente nao funciona
// ... no Promob o controle de alinhamento e direção é absurdamente confiável,
// aqui é descontrolado"): a versão antiga (RODADAS 4–19, set/2026) prendia o
// filho a uma FACE do alvo (px/nx/py/ny/pz/nz) e cada face tinha eixos,
// âncoras e regras próprias (giro só no topo/fundo, "normal" ancorado
// diferente por face, clamp num gesto e não no outro). O mesmo número
// significava coisas diferentes dependendo de onde se soltou.
//
// O Promob (conferido ao vivo no Promob Catalog do Matt, 30/10) NÃO usa face:
//   1. Tudo é relativo ao MÓDULO DE REFERÊNCIA, num referencial só: X = ao
//      longo da largura dele, Y = profundidade (positivo = pra TRÁS, rumo à
//      parede), Z = altura a partir do pé dele. Origem = canto de trás /
//      esquerdo / de baixo da referência (o "X" azul nas vistas).
//   2. Os números mostram a ORIGEM do filho (o canto de trás/esquerdo/de baixo
//      dele) nesse referencial. Ex.: filho encostado à direita e alinhado:
//      X = largura da referência, Y = 0, Z = 0. Na frente dela: Y = -prof.
//   3. O giro é em volta de um canto FIXO do filho: o canto da frente /
//      esquerdo (o círculo vermelho). Conferido nos números do Promob: +10°
//      → X caiu 600·sen10° = 104,2 e Y caiu 600·(1−cos10°) = 9,12 (filho de
//      600 de prof.). Por isso o módulo nunca "voa" ao girar. Positivo =
//      anti-horário visto de cima.
//   4. Clicar perto de um lado da referência numa das vistas PUXA o filho
//      pra encostar daquele lado e alinha pela borda mais próxima (Matt:
//      "quando clico proximo ele puxa certinho. do lado e alinha proximo").
//      Arrastar o filho nas vistas gruda (ímã) nas bordas da referência.
//   5. As 2 vistas mostram os 2 módulos inteiros, com zoom automático (roda
//      do mouse dá zoom, arrastar o fundo move a vista, duplo clique reajusta).
//
// Ao dar OK o filho vira um módulo SOLTO no chão na pose final (igual ao
// Promob depois do OK — não fica "pendurado" no outro). Cancelar volta tudo
// como estava antes do gesto. Nada aqui usa attached_face / slide / normal.
// ==========================================================================

let projectReposicionarState = null;
// Passo do teclado — guardado por unidade, sobrevive entre aberturas da tela.
const projectReposicionarSteps = { lenMm: null, rotDeg: 15 };

function reposUnit() {
  return (document.getElementById('po-unit-select') || {}).value || 'mm';
}
function reposDefaultStepMm(unit) {
  return (unit === 'in' || unit === 'ft') ? 25.4 / 16 : 10; // 1/16" ou 10 mm (padrão Promob)
}
function reposFmt(mm, unit) {
  const v = Number(mm) || 0;
  if (Math.abs(v) < 0.01) return formatDimensionNumber(0, unit);
  return (v < 0 ? '-' : '') + formatDimensionNumber(Math.abs(v), unit);
}
function reposParse(str, unit) {
  let s = String(str == null ? '' : str).trim();
  let neg = false;
  if (s.startsWith('-')) { neg = true; s = s.slice(1).trim(); }
  const v = parseDimensionInput(s, unit);
  if (v === null || isNaN(v)) return null;
  return neg ? -v : v;
}
function reposNormDeg(d) {
  let x = ((Number(d) || 0) % 360 + 360) % 360;
  if (x > 180) x -= 360;
  return Math.round(x * 1000) / 1000;
}

// ---------- geometria (tudo em mm, no referencial da referência) ----------
// Direções do filho no referencial de exibição (X = direita da referência,
// Y = pra trás): a direita do filho = (cos a, sen a); a frente = (sen a, −cos a).
function reposChildCorners(p) {
  const a = p.rotDeg * Math.PI / 180;
  const r = { x: Math.cos(a), y: Math.sin(a) };
  const f = { x: Math.sin(a), y: -Math.cos(a) };
  const O = { x: p.x, y: p.y };
  const BR = { x: O.x + r.x * p.w, y: O.y + r.y * p.w };
  const FL = { x: O.x + f.x * p.d, y: O.y + f.y * p.d };
  const FR = { x: BR.x + f.x * p.d, y: BR.y + f.y * p.d };
  return { BL: O, BR, FR, FL, r, f };
}
function reposChildBBox(p) {
  const c = reposChildCorners(p);
  const xs = [c.BL.x, c.BR.x, c.FR.x, c.FL.x];
  const ys = [c.BL.y, c.BR.y, c.FR.y, c.FL.y];
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}
// Gira mantendo o canto da frente/esquerdo (pivô) parado — regra do Promob.
function reposRotateKeepingPivot(p, newDeg) {
  const c = reposChildCorners(p);
  const pivot = c.FL;
  const a = newDeg * Math.PI / 180;
  const f = { x: Math.sin(a), y: -Math.cos(a) };
  p.x = pivot.x - f.x * p.d;
  p.y = pivot.y - f.y * p.d;
  p.rotDeg = reposNormDeg(newDeg);
}

// Lê a pose ATUAL do filho no mundo e expressa no referencial da referência.
function reposPoseFromWorld(refFrame, childFrame) {
  const r = refFrame.rotY;
  const U = { x: Math.cos(r), z: -Math.sin(r) };
  const N = { x: Math.sin(r), z: Math.cos(r) };
  const W = refFrame.widthM * 1000, D = refFrame.depthM * 1000;
  const w = childFrame.widthM * 1000, d = childFrame.depthM * 1000;
  const dx = (childFrame.ox - refFrame.ox) * 1000;
  const dz = (childFrame.oz - refFrame.oz) * 1000;
  const lx = dx * U.x + dz * U.z;
  const lz = dx * N.x + dz * N.z;
  const cx = lx + W / 2, cy = -lz - D / 2; // centro do filho, exibição
  const rotDeg = reposNormDeg((childFrame.rotY - r) * 180 / Math.PI);
  const a = rotDeg * Math.PI / 180;
  const rx = Math.cos(a), ry = Math.sin(a), fx = Math.sin(a), fy = -Math.cos(a);
  return {
    x: cx - rx * w / 2 - fx * d / 2,
    y: cy - ry * w / 2 - fy * d / 2,
    z: (childFrame.oy - refFrame.oy) * 1000,
    rotDeg, w, d, h: childFrame.heightM * 1000
  };
}

// Pose relativa → campos do slot (módulo solto no chão).
function reposApplyPoseToSlot(slot, refFrame, p) {
  const r = refFrame.rotY;
  const U = { x: Math.cos(r), z: -Math.sin(r) };
  const N = { x: Math.sin(r), z: Math.cos(r) };
  const W = refFrame.widthM * 1000, D = refFrame.depthM * 1000;
  const c = reposChildCorners(p);
  const cx = p.x + c.r.x * p.w / 2 + c.f.x * p.d / 2;
  const cy = p.y + c.r.y * p.w / 2 + c.f.y * p.d / 2;
  const lx = cx - W / 2, lz = -cy - D / 2;
  const wx = refFrame.ox * 1000 + U.x * lx + N.x * lz;
  const wz = refFrame.oz * 1000 + U.z * lx + N.z * lz;
  convertProjectSlotToFloor(slot, wx, wz); // solta de parede/anexo e zera subida fina
  slot.floor_height_mm = refFrame.oy * 1000 + p.z;
  slot.floor_rotation_deg = (((r * 180 / Math.PI) + p.rotDeg) % 360 + 360) % 360;
}

// ---------- abrir / fechar ----------
function beginProjectReposicionarFromDrag(childSlotId, targetSlotId /*, faceKey, x, y */) {
  const slot = projectSlots.find((s) => s.id === childSlotId);
  const target = projectSlots.find((s) => s.id === targetSlotId);
  if (!slot || !target || slot.id === target.id) return;
  if (projectReposicionarState) closeProjectReposicionarModal(false);
  const refFrame = getSlotWorldFrame(target);
  const childFrame = getSlotWorldFrame(slot);
  if (!refFrame || !childFrame) return;
  const snapshot = JSON.parse(JSON.stringify(slot));
  const pose = reposPoseFromWorld(refFrame, childFrame);
  projectReposicionarState = {
    slotId: slot.id, targetId: target.id, snapshot, pose,
    view: null,          // null = zoom automático; {k, cx, cyFront, cyPlan} depois que a pessoa mexe
    history: [], future: []
  };
  selectProjectSlot(slot.id);
  openProjectReposicionarModal();
}

function openProjectReposicionarModal() {
  let el = document.getElementById('po-proj-reposicionar-panel');
  if (!el) {
    el = document.createElement('div');
    el.className = 'po-proj-reposicionar-panel';
    el.id = 'po-proj-reposicionar-panel';
    document.body.appendChild(el);
  }
  renderProjectReposicionarModalContent();
  el.style.display = 'block';
}

function closeProjectReposicionarModal(commit) {
  const el = document.getElementById('po-proj-reposicionar-panel');
  const st = projectReposicionarState;
  projectReposicionarState = null;
  if (st && st.cleanup) st.cleanup();
  if (el) { el.style.display = 'none'; el.innerHTML = ''; }
  if (!st) return;
  const slot = projectSlots.find((s) => s.id === st.slotId);
  if (!commit && slot) {
    Object.keys(slot).forEach((k) => { if (!(k in st.snapshot)) delete slot[k]; });
    Object.assign(slot, st.snapshot);
  }
  renderProjectCanvas();
  refreshProject3DResizeArrows();
  if (commit && st.history.length) markProjectDirty();
}

// ---------- mudar a pose (todo caminho passa aqui) ----------
function reposCommitPose(mutator) {
  const st = projectReposicionarState;
  if (!st) return;
  const before = JSON.stringify(st.pose);
  mutator(st.pose);
  if (JSON.stringify(st.pose) === before) { renderProjectReposicionarModalContent(); return; }
  st.history.push(JSON.parse(before));
  st.future = [];
  reposPushToScene();
  renderProjectReposicionarModalContent();
}
function reposPushToScene() {
  const st = projectReposicionarState;
  if (!st) return;
  const slot = projectSlots.find((s) => s.id === st.slotId);
  const target = projectSlots.find((s) => s.id === st.targetId);
  const refFrame = target ? getSlotWorldFrame(target) : null;
  if (!slot || !refFrame) return;
  reposApplyPoseToSlot(slot, refFrame, st.pose);
  renderProjectCanvas();
  refreshProject3DResizeArrows();
}
function reposUndo(redo) {
  const st = projectReposicionarState;
  if (!st) return;
  const from = redo ? st.future : st.history;
  const to = redo ? st.history : st.future;
  if (!from.length) return;
  to.push(JSON.parse(JSON.stringify(st.pose)));
  st.pose = from.pop();
  reposPushToScene();
  renderProjectReposicionarModalContent();
}

// Clique numa vista: encosta do lado onde clicou e alinha pela borda mais
// próxima. `axisV` = 'y' (planta) ou 'z' (frontal).
function reposSnapToClick(px, pv, axisV) {
  const st = projectReposicionarState;
  const ref = reposRefDims();
  if (!st || !ref) return;
  reposCommitPose((p) => {
    const bb = reposChildBBox(p);
    const box = axisV === 'y'
      ? { h0: bb.x0, h1: bb.x1, v0: bb.y0, v1: bb.y1, r0h: 0, r1h: ref.W, r0v: -ref.D, r1v: 0 }
      : { h0: bb.x0, h1: bb.x1, v0: p.z, v1: p.z + p.h, r0h: 0, r1h: ref.W, r0v: 0, r1v: ref.H };
    const lenH = box.h1 - box.h0, lenV = box.v1 - box.v0;
    const outH = px < box.r0h ? 'before' : (px > box.r1h ? 'after' : null);
    const outV = pv < box.r0v ? 'before' : (pv > box.r1v ? 'after' : null);
    const align = (p0, r0, r1, len) => (p0 < (r0 + r1) / 2 ? r0 : r1 - len);
    const adj = (side, r0, r1, len) => (side === 'before' ? r0 - len : r1);
    let newH, newV;
    if (outH || outV) {
      newH = outH ? adj(outH, box.r0h, box.r1h, lenH) : align(px, box.r0h, box.r1h, lenH);
      newV = outV ? adj(outV, box.r0v, box.r1v, lenV) : align(pv, box.r0v, box.r1v, lenV);
    } else {
      // Clicou DENTRO da referência: vai pro lado mais perto do clique.
      const dists = [
        { k: 'h', side: 'before', dist: px - box.r0h }, { k: 'h', side: 'after', dist: box.r1h - px },
        { k: 'v', side: 'before', dist: pv - box.r0v }, { k: 'v', side: 'after', dist: box.r1v - pv }
      ].sort((a, b) => a.dist - b.dist);
      const best = dists[0];
      if (best.k === 'h') {
        newH = adj(best.side, box.r0h, box.r1h, lenH);
        newV = align(pv, box.r0v, box.r1v, lenV);
      } else {
        newV = adj(best.side, box.r0v, box.r1v, lenV);
        newH = align(px, box.r0h, box.r1h, lenH);
      }
    }
    p.x += newH - box.h0;
    if (axisV === 'y') p.y += newV - box.v0; else p.z += newV - box.v0;
  });
}

function reposRefDims() {
  const st = projectReposicionarState;
  if (!st) return null;
  const target = projectSlots.find((s) => s.id === st.targetId);
  const f = target ? getSlotWorldFrame(target) : null;
  if (!f) return null;
  return { W: f.widthM * 1000, D: f.depthM * 1000, H: f.heightM * 1000 };
}

// ---------- desenho ----------
const REPOS_VIEW_W = 268, REPOS_VIEW_H = 150;

function reposAutoView(p, ref) {
  const bb = reposChildBBox(p);
  const x0 = Math.min(0, bb.x0), x1 = Math.max(ref.W, bb.x1);
  const fy0 = Math.min(0, p.z), fy1 = Math.max(ref.H, p.z + p.h);
  const py0 = Math.min(-ref.D, bb.y0), py1 = Math.max(0, bb.y1);
  const pad = 1.3;
  const k = Math.min(
    REPOS_VIEW_W / Math.max((x1 - x0) * pad, 1),
    REPOS_VIEW_H / Math.max((fy1 - fy0) * pad, 1),
    REPOS_VIEW_H / Math.max((py1 - py0) * pad, 1)
  );
  return { k, cx: (x0 + x1) / 2, cyFront: (fy0 + fy1) / 2, cyPlan: (py0 + py1) / 2 };
}

function reposViewBox(view, which) {
  const w = REPOS_VIEW_W / view.k, h = REPOS_VIEW_H / view.k;
  const cy = which === 'front' ? view.cyFront : view.cyPlan;
  // SVG tem y pra baixo; desenhamos com y = −vertical.
  return { x: view.cx - w / 2, y: -cy - h / 2, w, h };
}

function reposMarkerX(x, v, s) {
  return `<path class="repos-ref-pt" d="M${x - s} ${-v - s}L${x + s} ${-v + s}M${x - s} ${-v + s}L${x + s} ${-v - s}" />`;
}

function reposBuildSvg(which, p, ref, view) {
  const vb = reposViewBox(view, which);
  const px = 1 / view.k; // 1 pixel em mm
  let body = '';
  if (which === 'plan') {
    // Referência: retângulo X 0..W, Y −D..0 (frente embaixo).
    body += `<rect class="repos-ref" x="0" y="0" width="${ref.W}" height="${ref.D}" />`;
    body += `<path class="repos-front-mark" d="M${ref.W / 2 - 6 * px} ${ref.D - 9 * px}L${ref.W / 2 + 6 * px} ${ref.D - 9 * px}L${ref.W / 2} ${ref.D - 3 * px}Z" />`;
    const c = reposChildCorners(p);
    const pts = [c.BL, c.BR, c.FR, c.FL].map((q) => `${q.x},${-q.y}`).join(' ');
    body += `<polygon class="repos-child" data-drag="1" points="${pts}" />`;
    // Triângulo da frente do filho (no meio da borda da frente, apontando pra fora).
    const mid = { x: (c.FL.x + c.FR.x) / 2, y: (c.FL.y + c.FR.y) / 2 };
    const inX = -c.f.x, inY = -c.f.y, s = 6 * px;
    const tip = { x: mid.x - inX * 3 * px, y: mid.y - inY * 3 * px };
    const b1 = { x: mid.x + inX * 9 * px + c.r.x * s, y: mid.y + inY * 9 * px + c.r.y * s };
    const b2 = { x: mid.x + inX * 9 * px - c.r.x * s, y: mid.y + inY * 9 * px - c.r.y * s };
    body += `<path class="repos-front-mark child" d="M${tip.x} ${-tip.y}L${b1.x} ${-b1.y}L${b2.x} ${-b2.y}Z" />`;
    body += reposMarkerX(0, 0, 5 * px);
    body += reposMarkerX(c.BL.x, c.BL.y, 4 * px);
    body += `<circle class="repos-pivot" cx="${c.FL.x}" cy="${-c.FL.y}" r="${4.5 * px}" />`;
  } else {
    body += `<rect class="repos-ref" x="0" y="${-ref.H}" width="${ref.W}" height="${ref.H}" />`;
    const bb = reposChildBBox(p);
    body += `<rect class="repos-child" data-drag="1" x="${bb.x0}" y="${-(p.z + p.h)}" width="${bb.x1 - bb.x0}" height="${p.h}" />`;
    body += reposMarkerX(0, 0, 5 * px);
    const c = reposChildCorners(p);
    body += `<circle class="repos-pivot" cx="${c.FL.x}" cy="${-p.z}" r="${4.5 * px}" />`;
  }
  return `<svg class="po-proj-reposicionar-svg repos-svg" id="repos-svg-${which}" data-which="${which}"
      viewBox="${vb.x} ${vb.y} ${vb.w} ${vb.h}" preserveAspectRatio="xMidYMid meet">
      <rect class="repos-bg" x="${vb.x}" y="${vb.y}" width="${vb.w}" height="${vb.h}" />
      ${body}
    </svg>`;
}

function reposFieldRow(id, value, unitLabel, label) {
  return `<div class="po-proj-position-field repos-field">
      <div class="repos-spin">
        <input type="text" inputmode="decimal" id="${id}" value="${value}" />
        <span class="repos-spin-btns">
          <button type="button" tabindex="-1" data-spin="${id}" data-dir="1">▲</button>
          <button type="button" tabindex="-1" data-spin="${id}" data-dir="-1">▼</button>
        </span>
      </div>
      <span class="po-proj-dim-unit">${unitLabel}</span>
      <label for="${id}">${label}</label>
    </div>`;
}

function renderProjectReposicionarModalContent() {
  const el = document.getElementById('po-proj-reposicionar-panel');
  const st = projectReposicionarState;
  if (!el || !st) return;
  const slot = projectSlots.find((s) => s.id === st.slotId);
  const ref = reposRefDims();
  if (!slot || !ref) { closeProjectReposicionarModal(false); return; }
  const unit = reposUnit();
  if (projectReposicionarSteps.lenMm == null || projectReposicionarSteps.unit !== unit) {
    projectReposicionarSteps.lenMm = reposDefaultStepMm(unit);
    projectReposicionarSteps.unit = unit;
  }
  const p = st.pose;
  const view = st.view || reposAutoView(p, ref);
  const ua = unitAbbrev(unit);
  const t = (k) => I18n.t(k);
  if (st.cleanup) { st.cleanup(); st.cleanup = null; }

  el.innerHTML = `
    <div class="repos-head">
      <h4>${t('project.reposicionar_title')}</h4>
      <span class="repos-tools">
        <button type="button" class="repos-tool" id="repos-undo" title="${t('project.reposicionar_undo')}" ${st.history.length ? '' : 'disabled'}>↶</button>
        <button type="button" class="repos-tool" id="repos-redo" title="${t('project.reposicionar_redo')}" ${st.future.length ? '' : 'disabled'}>↷</button>
        <button type="button" class="repos-tool" id="repos-fit" title="${t('project.reposicionar_fit')}">⤢</button>
      </span>
    </div>
    <div class="po-proj-reposicionar-views-row">
      <div class="po-proj-reposicionar-view-col">
        <div class="po-proj-reposicionar-view-label">${t('project.reposicionar_view_frontal')}</div>
        <div class="po-proj-reposicionar-view-wrap">${reposBuildSvg('front', p, ref, view)}</div>
      </div>
      <div class="po-proj-reposicionar-view-col">
        <div class="po-proj-reposicionar-view-label">${t('project.reposicionar_view_planta')}</div>
        <div class="po-proj-reposicionar-view-wrap">${reposBuildSvg('plan', p, ref, view)}</div>
      </div>
    </div>
    <p class="hint">${t('project.reposicionar_click_hint')}</p>
    ${reposFieldRow('repos-x', reposFmt(p.x, unit), ua, t('project.reposicionar_field_x'))}
    ${reposFieldRow('repos-y', reposFmt(p.y, unit), ua, t('project.reposicionar_field_y'))}
    ${reposFieldRow('repos-z', reposFmt(p.z, unit), ua, t('project.reposicionar_field_z'))}
    ${reposFieldRow('repos-rot', String(Math.round(p.rotDeg * 100) / 100), '°', t('project.reposicionar_field_rotation'))}
    <div class="po-proj-reposicionar-step-row">
      <label for="repos-step">${t('project.reposicionar_step_label')}</label>
      <input type="text" inputmode="decimal" id="repos-step" value="${reposFmt(projectReposicionarSteps.lenMm, unit)}" />
      <span class="po-proj-dim-unit">${ua}</span>
      <input type="text" inputmode="decimal" id="repos-rot-step" class="repos-rot-step" value="${projectReposicionarSteps.rotDeg}" />
      <span class="po-proj-dim-unit">°</span>
    </div>
    <div class="po-proj-reposicionar-actions">
      <button type="button" class="secondary" id="po-reposicionar-cancel-btn">${t('project.reposicionar_cancel_btn')}</button>
      <button type="button" id="po-reposicionar-ok-btn">${t('project.reposicionar_ok_btn')}</button>
    </div>`;

  const $ = (id) => document.getElementById(id);
  $('po-reposicionar-cancel-btn').onclick = () => closeProjectReposicionarModal(false);
  $('po-reposicionar-ok-btn').onclick = () => closeProjectReposicionarModal(true);
  $('repos-undo').onclick = () => reposUndo(false);
  $('repos-redo').onclick = () => reposUndo(true);
  $('repos-fit').onclick = () => { st.view = null; renderProjectReposicionarModalContent(); };

  // ----- campos -----
  const applyField = (id, raw) => {
    if (id === 'repos-rot') {
      const v = parseFloat(String(raw).replace(',', '.'));
      if (isNaN(v)) return renderProjectReposicionarModalContent();
      return reposCommitPose((q) => reposRotateKeepingPivot(q, v));
    }
    const v = reposParse(raw, unit);
    if (v === null) return renderProjectReposicionarModalContent();
    const key = { 'repos-x': 'x', 'repos-y': 'y', 'repos-z': 'z' }[id];
    reposCommitPose((q) => { q[key] = v; });
  };
  const spin = (id, dir) => {
    if (id === 'repos-rot') {
      return reposCommitPose((q) => reposRotateKeepingPivot(q, q.rotDeg + dir * projectReposicionarSteps.rotDeg));
    }
    const key = { 'repos-x': 'x', 'repos-y': 'y', 'repos-z': 'z' }[id];
    reposCommitPose((q) => { q[key] = Math.round((q[key] + dir * projectReposicionarSteps.lenMm) * 1000) / 1000; });
  };
  ['repos-x', 'repos-y', 'repos-z', 'repos-rot'].forEach((id) => {
    const inp = $(id);
    inp.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); applyField(id, inp.value); setTimeout(() => { const n = $(id); if (n) { n.focus(); n.select(); } }, 0); }
      else if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') {
        ev.preventDefault();
        spin(id, ev.key === 'ArrowUp' ? 1 : -1);
        setTimeout(() => { const n = $(id); if (n) { n.focus(); n.select(); } }, 0);
      } else if (ev.key === 'Escape') { ev.preventDefault(); closeProjectReposicionarModal(false); }
      ev.stopPropagation(); // não deixa atalho da cena (Delete, setas) agir enquanto digita
    });
    inp.addEventListener('change', () => applyField(id, inp.value));
    inp.addEventListener('focus', () => inp.select());
  });
  el.querySelectorAll('[data-spin]').forEach((b) => {
    b.onclick = () => spin(b.getAttribute('data-spin'), Number(b.getAttribute('data-dir')));
  });
  $('repos-step').addEventListener('change', (ev) => {
    const v = reposParse(ev.target.value, unit);
    if (v !== null && v > 0) projectReposicionarSteps.lenMm = v;
    renderProjectReposicionarModalContent();
  });
  $('repos-rot-step').addEventListener('change', (ev) => {
    const v = parseFloat(String(ev.target.value).replace(',', '.'));
    if (!isNaN(v) && v > 0) projectReposicionarSteps.rotDeg = v;
    renderProjectReposicionarModalContent();
  });
  [$('repos-step'), $('repos-rot-step')].forEach((inp) => inp.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); inp.blur(); }
    ev.stopPropagation();
  }));

  // ----- vistas: clique encaixa, arrasto do filho com ímã, fundo move a vista, roda dá zoom -----
  ['front', 'plan'].forEach((which) => reposWireView($('repos-svg-' + which), which, view));

  const onKey = (ev) => {
    if (!projectReposicionarState) return;
    const tag = (ev.target && ev.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (ev.key === 'Escape') { ev.preventDefault(); closeProjectReposicionarModal(false); }
    else if (ev.key === 'Enter') { ev.preventDefault(); closeProjectReposicionarModal(true); }
    else if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'z' || ev.key === 'Z')) { ev.preventDefault(); ev.stopPropagation(); reposUndo(ev.shiftKey); }
  };
  document.addEventListener('keydown', onKey, true);
  st.cleanup = () => document.removeEventListener('keydown', onKey, true);
}

function reposWireView(svg, which, view) {
  const st = projectReposicionarState;
  if (!svg || !st) return;
  const toMm = (ev) => {
    const pt = svg.createSVGPoint();
    pt.x = ev.clientX; pt.y = ev.clientY;
    const m = svg.getScreenCTM();
    if (!m) return { h: 0, v: 0 };
    const q = pt.matrixTransform(m.inverse());
    return { h: q.x, v: -q.y };
  };
  const SNAP_PX = 10;

  svg.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const s = projectReposicionarState;
    if (!s) return;
    const cur = s.view || Object.assign({}, view);
    const at = toMm(ev);
    const f = ev.deltaY < 0 ? 1.2 : 1 / 1.2;
    const nk = Math.min(Math.max(cur.k * f, 0.005), 20);
    const ratio = cur.k / nk;
    const next = Object.assign({}, cur, { k: nk });
    next.cx = at.h - (at.h - cur.cx) * ratio;
    if (which === 'front') next.cyFront = at.v - (at.v - cur.cyFront) * ratio;
    else next.cyPlan = at.v - (at.v - cur.cyPlan) * ratio;
    s.view = next;
    renderProjectReposicionarModalContent();
  }, { passive: false });

  svg.addEventListener('dblclick', (ev) => {
    ev.preventDefault();
    const s = projectReposicionarState;
    if (s) { s.view = null; renderProjectReposicionarModalContent(); }
  });

  svg.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    ev.preventDefault();
    const s = projectReposicionarState;
    if (!s) return;
    const onChild = !!(ev.target && ev.target.getAttribute && ev.target.getAttribute('data-drag'));
    const start = toMm(ev);
    const startClient = { x: ev.clientX, y: ev.clientY };
    const startPose = JSON.parse(JSON.stringify(s.pose));
    const startView = Object.assign({}, s.view || view);
    const ref = reposRefDims();
    let moved = false;
    try { svg.setPointerCapture(ev.pointerId); } catch (e) { /* ok */ }

    const onMove = (mv) => {
      if (!projectReposicionarState) return;
      if (!moved && Math.hypot(mv.clientX - startClient.x, mv.clientY - startClient.y) < 4) return;
      moved = true;
      if (!onChild) {
        // Fundo: move a vista (pan).
        const dxPx = mv.clientX - startClient.x, dyPx = mv.clientY - startClient.y;
        const k = startView.k;
        const next = Object.assign({}, startView, { cx: startView.cx - dxPx / k });
        if (which === 'front') next.cyFront = startView.cyFront + dyPx / k;
        else next.cyPlan = startView.cyPlan + dyPx / k;
        projectReposicionarState.view = next;
        const vb = reposViewBox(next, which);
        svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
        return;
      }
      // Filho: arrasta com ímã nas bordas da referência (e passo do teclado fora do ímã).
      const cur = toMm(mv);
      const k = startView.k;
      const snapMm = SNAP_PX / k;
      const step = projectReposicionarSteps.lenMm || 1;
      const p = JSON.parse(JSON.stringify(startPose));
      const bb = reposChildBBox(p);
      const snapAxis = (min0, len, delta, r0, r1) => {
        const raw = min0 + delta;
        const cands = [r0 - len, r0, r1 - len, r1];
        let best = null;
        cands.forEach((c) => { if (Math.abs(c - raw) <= snapMm && (best === null || Math.abs(c - raw) < Math.abs(best - raw))) best = c; });
        if (best !== null) return best - min0;
        return Math.round(delta / step) * step;
      };
      const dH = snapAxis(bb.x0, bb.x1 - bb.x0, cur.h - start.h, 0, ref.W);
      p.x += dH;
      if (which === 'plan') p.y += snapAxis(bb.y0, bb.y1 - bb.y0, cur.v - start.v, -ref.D, 0);
      else p.z += snapAxis(p.z, p.h, cur.v - start.v, 0, ref.H);
      projectReposicionarState.pose = p;
      projectReposicionarState.view = startView; // congela o zoom durante o arraste
      reposPushToScene();
      reposRedrawViewsOnly();
    };
    const onUp = (up) => {
      svg.removeEventListener('pointermove', onMove);
      svg.removeEventListener('pointerup', onUp);
      svg.removeEventListener('pointercancel', onUp);
      const s2 = projectReposicionarState;
      if (!s2) return;
      if (!moved) {
        const at = toMm(up);
        reposSnapToClick(at.h, at.v, which === 'plan' ? 'y' : 'z');
        return;
      }
      if (onChild && JSON.stringify(s2.pose) !== JSON.stringify(startPose)) {
        s2.history.push(startPose);
        s2.future = [];
      }
      renderProjectReposicionarModalContent();
    };
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerup', onUp);
    svg.addEventListener('pointercancel', onUp);
  });
}

// Durante o arraste: redesenha só o miolo das 2 vistas e os números, sem
// recriar o painel (senão o pointer capture se perde).
function reposRedrawViewsOnly() {
  const st = projectReposicionarState;
  const ref = reposRefDims();
  if (!st || !ref) return;
  const view = st.view || reposAutoView(st.pose, ref);
  ['front', 'plan'].forEach((which) => {
    const svg = document.getElementById('repos-svg-' + which);
    if (!svg) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = reposBuildSvg(which, st.pose, ref, view);
    const fresh = tmp.firstElementChild;
    svg.setAttribute('viewBox', fresh.getAttribute('viewBox'));
    svg.innerHTML = fresh.innerHTML;
  });
  const unit = reposUnit();
  const set = (id, v) => { const i = document.getElementById(id); if (i) i.value = v; };
  set('repos-x', reposFmt(st.pose.x, unit));
  set('repos-y', reposFmt(st.pose.y, unit));
  set('repos-z', reposFmt(st.pose.z, unit));
}
