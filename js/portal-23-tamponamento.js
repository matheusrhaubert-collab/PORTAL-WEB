// ============================================================
// Tamponamento — painéis em volta do módulo ou do grupo selecionado
// ============================================================
// Pedido do Matt (2026-10-14): "quero mais uma nova ferramenta aqui que
// funciona ou pro modulo ou pro grupo de modulos selecionados. a funcao e
// tamponamento. abre uma tela visao 2d paralela frontal do modulo ou grupo.
// e quando clico dos lados (fora do movel) ele insere um tamponamento
// (painel vertical) buscando a altura e profundidade do movel, profundidade
// do movel + 25mm. pode ser colocado um tamponamento (painel horizontal)
// esse quando e superior ou inferior deve ter 1mm a mais pra cada lado, uma
// coisa importante - se tiver painel lateral inserido o tampo inferior e
// superior devem cobrir esse painel lateral."
//
// Painéis = módulos de catálogo já existentes (família Panels, categoria
// 3/4): "Painel 3/4 · Vertical" (lateral; espessura na LARGURA) e
// "Painel 3/4 · Horizontal" (superior/inferior; espessura na ALTURA).
// Cada painel entra como um slot comum (preço, plano de corte, cor, arrasta).
//
// Referencial: tudo é calculado no "plano frontal" do conjunto —
//   · parede: a = x_mm ao longo da parede, y = altura do chão;
//   · ilha (piso): a = projeção no eixo X LOCAL do módulo (mesmo giro).
// Os painéis que já existem são achados pela GEOMETRIA (encostados no
// conjunto, ±3 mm), não por marcação — funciona igual depois de salvar e
// reabrir o projeto, e se a pessoa mover um painel pra longe ele deixa de
// contar.
//
// Medidas:
//   · lateral: largura = espessura do painel; altura = altura do conjunto;
//     profundidade = profundidade do conjunto + 25 mm (costa alinhada com a
//     do móvel, sobra 25 na frente).
//   · superior/inferior: profundidade = profundidade + 25 (mesma das
//     laterais); largura = largura do conjunto + 1 mm de cada lado + a
//     espessura das laterais que existirem (o tampo COBRE a lateral).
//     Inserir/tirar lateral reajusta os tampos existentes.

const TAMP_EXTRA_DEPTH_MM = 25;
const TAMP_OVERHANG_MM = 1;
const TAMP_TOL_MM = 3;
const TAMP_PANEL_NAMES = { vertical: 'Painel 3/4 · Vertical', horizontal: 'Painel 3/4 · Horizontal' };
const TAMP_PANEL_IDS = { vertical: 'bcb414ca-d129-4b8d-ab74-21369b326cbf', horizontal: 'c9c358dc-1de1-423a-8ebf-e7186a9edf36' };

let tampState = null; // { ids: [...] } enquanto o modal está aberto

function tampT(k, vars) { return I18n.t('tamp.' + k, vars); }

function tampPanelModule(kind) {
  const mods = (typeof allModules !== 'undefined' ? allModules : []);
  return mods.find((m) => m.id === TAMP_PANEL_IDS[kind])
    || mods.find((m) => m.name === TAMP_PANEL_NAMES[kind])
    || null;
}

function tampThicknessMm() {
  const v = tampPanelModule('vertical');
  return (v && Number(v.width_default_mm)) || 19.5;
}

function tampSelectionIds() {
  const ids = [];
  try { (projectMultiSelectIds || new Set()).forEach((id) => ids.push(id)); } catch (e) { /* ok */ }
  if (!ids.length && selectedProjectSlotId != null) ids.push(selectedProjectSlotId);
  return ids;
}

// ---------- Referencial do conjunto ----------
// Devolve { kind:'wall'|'floor', wallIndex, rot, ex, ez, A0, A1, Y0, Y1, V0, D,
// toFrame(slot) -> {a0,a1,y0,y1} } ou { error }.
function tampFrame(slots) {
  if (!slots.length) return { error: 'err_none' };
  const naParede = slots.filter((s) => !isFloorSlot(s));
  const noPiso = slots.filter((s) => isFloorSlot(s));
  if (naParede.length && noPiso.length) return { error: 'err_mixed' };
  let f;
  if (naParede.length) {
    const wi = Number(naParede[0].wall_index || 0);
    if (naParede.some((s) => Number(s.wall_index || 0) !== wi)) return { error: 'err_mixed' };
    f = {
      kind: 'wall', wallIndex: wi,
      toFrame: (s) => {
        const a0 = Number(s.x_mm) || 0, y0 = Number(s.floor_height_mm) || 0;
        return { a0, a1: a0 + (Number(s.width_mm) || 0), y0, y1: y0 + (Number(s.height_mm) || 0), v0: 0, v1: Number(s.depth_mm) || 0 };
      }
    };
  } else {
    const rot = Number(noPiso[0].floor_rotation_deg) || 0;
    const mesmoGiro = (r) => { const d = Math.abs((((Number(r) || 0) - rot) % 360 + 540) % 360 - 180); return d < 0.5; };
    if (noPiso.some((s) => !mesmoGiro(s.floor_rotation_deg))) return { error: 'err_mixed' };
    const r = rot * Math.PI / 180;
    // Mesmo referencial do Three.js (rotation.y): X local → (cos, −sin), Z local (frente) → (sin, cos).
    const ex = { x: Math.cos(r), z: -Math.sin(r) }, ez = { x: Math.sin(r), z: Math.cos(r) };
    f = {
      kind: 'floor', rot, ex, ez,
      toFrame: (s) => {
        const fx = Number(s.floor_x_mm) || 0, fz = Number(s.floor_z_mm) || 0;
        const cu = fx * ex.x + fz * ex.z, cv = fx * ez.x + fz * ez.z;
        const w = Number(s.width_mm) || 0, d = Number(s.depth_mm) || 0;
        const y0 = Number(s.floor_height_mm) || 0;
        return { a0: cu - w / 2, a1: cu + w / 2, y0, y1: y0 + (Number(s.height_mm) || 0), v0: cv - d / 2, v1: cv + d / 2 };
      }
    };
  }
  const boxes = slots.map(f.toFrame);
  f.A0 = Math.min(...boxes.map((b) => b.a0));
  f.A1 = Math.max(...boxes.map((b) => b.a1));
  f.Y0 = Math.min(...boxes.map((b) => b.y0));
  f.Y1 = Math.max(...boxes.map((b) => b.y1));
  f.V0 = Math.min(...boxes.map((b) => b.v0));
  f.D = Math.max(...boxes.map((b) => b.v1)) - f.V0;
  f.boxes = boxes;
  return f;
}

// Mesmo plano do conjunto (mesma parede / mesmo giro no piso)?
function tampSameFrame(f, s) {
  if (f.kind === 'wall') return !isFloorSlot(s) && Number(s.wall_index || 0) === f.wallIndex;
  if (!isFloorSlot(s)) return false;
  const d = Math.abs((((Number(s.floor_rotation_deg) || 0) - f.rot) % 360 + 540) % 360 - 180);
  return d < 0.5;
}

// Painéis que já existem encostados no conjunto.
function tampFindExisting(f, ids) {
  const vId = (tampPanelModule('vertical') || {}).id;
  const hId = (tampPanelModule('horizontal') || {}).id;
  const out = { left: null, right: null, top: null, bottom: null };
  const cruzaY = (b) => Math.min(b.y1, f.Y1) - Math.max(b.y0, f.Y0) > 10;
  const cruzaA = (b) => Math.min(b.a1, f.A1) - Math.max(b.a0, f.A0) > 10;
  (projectSlots || []).forEach((s) => {
    if (!s.module || ids.includes(s.id) || !tampSameFrame(f, s)) return;
    const b = f.toFrame(s);
    if (s.module.id === vId) {
      if (!out.left && Math.abs(b.a1 - f.A0) <= TAMP_TOL_MM && cruzaY(b)) out.left = s;
      else if (!out.right && Math.abs(b.a0 - f.A1) <= TAMP_TOL_MM && cruzaY(b)) out.right = s;
    } else if (s.module.id === hId) {
      if (!out.top && Math.abs(b.y0 - f.Y1) <= TAMP_TOL_MM && cruzaA(b)) out.top = s;
      else if (!out.bottom && Math.abs(b.y1 - f.Y0) <= TAMP_TOL_MM && cruzaA(b)) out.bottom = s;
    }
  });
  return out;
}

// ---------- Posicionar um painel no referencial ----------
function tampApplyPlacement(f, slot, a0, width, y0, depth) {
  slot.width_mm = projectSlotClampedDimensionMm(slot, 'width', width);
  slot.depth_mm = projectSlotClampedDimensionMm(slot, 'depth', depth);
  // Sem arredondar: a espessura é 19,5 — inteiro deixaria 0,5 mm de folga/sobreposição.
  slot.floor_height_mm = Math.max(0, Math.round(y0 * 10) / 10);
  if (f.kind === 'wall') {
    convertProjectSlotToWall(slot, f.wallIndex, Math.round(a0 * 10) / 10, slot.floor_height_mm);
  } else {
    const u = a0 + slot.width_mm / 2;
    const v = f.V0 + slot.depth_mm / 2;
    convertProjectSlotToFloor(slot, Math.round((u * f.ex.x + v * f.ez.x) * 10) / 10, Math.round((u * f.ex.z + v * f.ez.z) * 10) / 10);
    slot.floor_rotation_deg = f.rot;
    slot.floor_height_mm = Math.max(0, Math.round(y0 * 10) / 10);
  }
  recomputeProjectSlotPricing(slot);
}

// Cor: tenta a MESMA cor (pelo nome) que o conjunto já usa, em cada papel do
// painel. Sem nada igual, fica a padrão do painel.
function tampCopyColors(panelSlot, slots) {
  const nomes = [];
  slots.forEach((s) => (s.selectedColors || []).forEach((sc) => { if (sc && sc.color_name && !nomes.includes(sc.color_name)) nomes.push(sc.color_name); }));
  Object.entries(panelSlot.colorOptionsByRole || {}).forEach(([roleId, opts]) => {
    const hit = nomes.map((n) => (opts || []).find((o) => o && o.name === n)).find(Boolean);
    if (hit && typeof applyColorToProjectSlot === 'function') applyColorToProjectSlot(panelSlot, roleId, hit);
  });
}

// Larg./posição dos tampos considerando as laterais presentes.
function tampHorizontalSpan(f, ex) {
  const T = tampThicknessMm();
  const temL = !!ex.left, temR = !!ex.right;
  return {
    a0: f.A0 - TAMP_OVERHANG_MM - (temL ? T : 0),
    width: (f.A1 - f.A0) + 2 * TAMP_OVERHANG_MM + (temL ? T : 0) + (temR ? T : 0)
  };
}

function tampRefitHorizontals(f, ex) {
  const span = tampHorizontalSpan(f, ex);
  ['top', 'bottom'].forEach((k) => {
    const s = ex[k];
    if (!s) return;
    tampApplyPlacement(f, s, span.a0, span.width, Number(s.floor_height_mm) || 0, Number(s.depth_mm) || (f.D + TAMP_EXTRA_DEPTH_MM));
  });
}

async function tampInsert(side) {
  const ids = tampState ? tampState.ids : [];
  const slots = ids.map((id) => projectSlots.find((s) => s.id === id)).filter(Boolean);
  const f = tampFrame(slots);
  if (f.error) { tampMsg(tampT(f.error), true); return; }
  const kind = (side === 'left' || side === 'right') ? 'vertical' : 'horizontal';
  const mod = tampPanelModule(kind);
  if (!mod) { tampMsg(tampT('err_no_panel', { name: TAMP_PANEL_NAMES[kind] }), true); return; }
  const T = tampThicknessMm();
  const ex = tampFindExisting(f, ids);
  if (ex[side]) return; // já existe
  const depth = f.D + TAMP_EXTRA_DEPTH_MM;
  let a0, width, y0, height;
  if (kind === 'vertical') {
    width = T; height = f.Y1 - f.Y0; y0 = f.Y0;
    a0 = side === 'left' ? f.A0 - T : f.A1;
  } else {
    const span = tampHorizontalSpan(f, ex);
    a0 = span.a0; width = span.width; height = T;
    if (side === 'top') y0 = f.Y1;
    else {
      y0 = f.Y0 - T;
      if (y0 < -0.5) { tampMsg(tampT('err_no_space_below'), true); return; }
    }
  }
  const overrides = f.kind === 'wall'
    ? { wall_index: f.wallIndex, x_mm: a0, width_mm: width, height_mm: height, floor_height_mm: Math.max(0, y0) }
    : { placement: 'floor', floor_x_mm: 0, floor_z_mm: 0, width_mm: width, height_mm: height };
  const slot = await insertProjectModuleDefault(mod.id, overrides);
  if (!slot) { tampMsg(tampT('err_insert'), true); return; }
  slot.height_mm = projectSlotClampedDimensionMm(slot, 'height', height);
  tampApplyPlacement(f, slot, a0, width, y0, depth);
  tampCopyColors(slot, slots);
  recomputeProjectSlotPricing(slot);
  if (kind === 'vertical') {
    ex[side] = slot;
    tampRefitHorizontals(f, ex);
  }
  renderProjectCanvas();
  markProjectDirty();
  tampMsg('', false);
  tampRender();
}

function tampRemove(side) {
  const ids = tampState ? tampState.ids : [];
  const slots = ids.map((id) => projectSlots.find((s) => s.id === id)).filter(Boolean);
  const f = tampFrame(slots);
  if (f.error) return;
  const ex = tampFindExisting(f, ids);
  const alvo = ex[side];
  if (!alvo) return;
  projectSlots = projectSlots.filter((s) => s.id !== alvo.id);
  if (side === 'left' || side === 'right') {
    ex[side] = null;
    tampRefitHorizontals(f, ex);
  }
  renderProjectCanvas();
  markProjectDirty();
  tampRender();
}

// ---------- Modal (vista frontal 2D) ----------
function tampEnsureModal() {
  let m = document.getElementById('po-tamp-modal');
  if (m) return m;
  m = document.createElement('div');
  m.id = 'po-tamp-modal';
  m.innerHTML = '<div class="po-tamp-card" role="dialog" aria-modal="true">'
    + '<button type="button" class="po-auth-modal-close" id="po-tamp-close" aria-label="×">&times;</button>'
    + '<h2 id="po-tamp-title"></h2><p class="hint" id="po-tamp-hint"></p>'
    + '<div id="po-tamp-view"></div><div id="po-tamp-msg" class="hint" style="display:none;"></div>'
    + '<div class="po-proj-ai-modal-actions"><button type="button" id="po-tamp-done"></button></div></div>';
  document.body.appendChild(m);
  const fecha = () => { m.classList.remove('open'); tampState = null; };
  m.addEventListener('click', (e) => { if (e.target === m) fecha(); });
  m.querySelector('#po-tamp-close').addEventListener('click', fecha);
  m.querySelector('#po-tamp-done').addEventListener('click', fecha);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && m.classList.contains('open')) fecha(); });
  m.querySelector('#po-tamp-view').addEventListener('click', (e) => {
    const z = e.target.closest('[data-tamp]');
    if (!z) return;
    const side = z.getAttribute('data-tamp');
    if (z.getAttribute('data-has') === '1') tampRemove(side);
    else tampInsert(side);
  });
  return m;
}

function tampMsg(msg, isErr) {
  const el = document.getElementById('po-tamp-msg');
  if (!el) return;
  el.textContent = msg || '';
  el.style.display = msg ? 'block' : 'none';
  el.className = isErr ? 'error' : 'hint';
}

function openProjectTamponamento() {
  // Painel de tamponamento que esteja na seleção (grupo que já tem os
  // painéis) não conta como "móvel" — senão o conjunto cresce a cada clique.
  const painelIds = [(tampPanelModule('vertical') || {}).id, (tampPanelModule('horizontal') || {}).id].filter(Boolean);
  const ids = tampSelectionIds().filter((id) => {
    const s = projectSlots.find((x) => x.id === id);
    return s && s.module && !painelIds.includes(s.module.id);
  });
  if (!ids.length) return;
  tampState = { ids };
  const m = tampEnsureModal();
  m.querySelector('#po-tamp-title').textContent = tampT('title');
  m.querySelector('#po-tamp-hint').textContent = tampT('hint');
  m.querySelector('#po-tamp-done').textContent = tampT('done');
  tampMsg('', false);
  m.classList.add('open');
  tampRender();
}

function tampFmt(mm) {
  const un = (document.getElementById('po-unit-select') || {}).value || 'mm';
  return (typeof formatDimension === 'function') ? formatDimension(Math.round(mm * 10) / 10, un) : Math.round(mm) + ' mm';
}

function tampRender() {
  const view = document.getElementById('po-tamp-view');
  if (!view || !tampState) return;
  const slots = tampState.ids.map((id) => projectSlots.find((s) => s.id === id)).filter(Boolean);
  const f = tampFrame(slots);
  if (f.error) { view.innerHTML = ''; tampMsg(tampT(f.error), true); return; }
  const ex = tampFindExisting(f, tampState.ids);
  const T = tampThicknessMm();
  const W = f.A1 - f.A0, H = f.Y1 - f.Y0;
  const M = Math.max(220, Math.max(W, H) * 0.22); // margem = área de clique
  const vbX = f.A0 - M, vbW = W + 2 * M;
  const yTop = f.Y1 + M, vbH = H + 2 * M;
  const X = (a) => (a - vbX).toFixed(1);
  const Y = (y) => (yTop - y).toFixed(1);
  const sw = Math.max(vbW, vbH) / 300; // espessura de traço proporcional
  const fs = Math.max(vbW, vbH) / 38;
  const rect = (a0, a1, y0, y1, cls, extra) =>
    `<rect class="${cls}" x="${X(a0)}" y="${Y(y1)}" width="${(a1 - a0).toFixed(1)}" height="${(y1 - y0).toFixed(1)}" stroke-width="${sw}" ${extra || ''}/>`;
  const label = (a, y, txt) => `<text x="${X(a)}" y="${Y(y)}" font-size="${fs}" text-anchor="middle" dominant-baseline="middle">${txt}</text>`;

  let svg = '';
  // módulos do conjunto
  f.boxes.forEach((b) => { svg += rect(b.a0, b.a1, b.y0, b.y1, 'po-tamp-mod'); });
  // zonas / painéis existentes
  const span = tampHorizontalSpan(f, ex);
  const zonas = {
    left: { a0: f.A0 - M * 0.85, a1: f.A0 - 4, y0: f.Y0, y1: f.Y1, real: [f.A0 - T, f.A0, f.Y0, f.Y1] },
    right: { a0: f.A1 + 4, a1: f.A1 + M * 0.85, y0: f.Y0, y1: f.Y1, real: [f.A1, f.A1 + T, f.Y0, f.Y1] },
    top: { a0: f.A0, a1: f.A1, y0: f.Y1 + 4, y1: f.Y1 + M * 0.85, real: [span.a0, span.a0 + span.width, f.Y1, f.Y1 + T] },
    bottom: { a0: f.A0, a1: f.A1, y0: f.Y0 - M * 0.85, y1: f.Y0 - 4, real: [span.a0, span.a0 + span.width, f.Y0 - T, f.Y0] }
  };
  Object.entries(zonas).forEach(([k, z]) => {
    const tem = !!ex[k];
    if (tem) {
      const s = ex[k];
      svg += rect(z.real[0], z.real[1], z.real[2], z.real[3], 'po-tamp-panel');
      svg += `<g data-tamp="${k}" data-has="1" class="po-tamp-zone po-tamp-zone-on">`
        + rect(z.a0, z.a1, z.y0, z.y1, 'po-tamp-hit')
        + label((z.a0 + z.a1) / 2, (z.y0 + z.y1) / 2, '✕ ' + tampT('side_' + k))
        + label((z.a0 + z.a1) / 2, (z.y0 + z.y1) / 2 - fs * 1.3,
          (k === 'left' || k === 'right')
            ? `${tampFmt(s.height_mm)} × ${tampFmt(s.depth_mm)}`
            : `${tampFmt(s.width_mm)} × ${tampFmt(s.depth_mm)}`)
        + '</g>';
    } else {
      svg += `<g data-tamp="${k}" data-has="0" class="po-tamp-zone">`
        + rect(z.a0, z.a1, z.y0, z.y1, 'po-tamp-hit', `stroke-dasharray="${sw * 4} ${sw * 3}"`)
        + label((z.a0 + z.a1) / 2, (z.y0 + z.y1) / 2, '+ ' + tampT('side_' + k))
        + '</g>';
    }
  });
  // cotas do conjunto
  svg += label((f.A0 + f.A1) / 2, f.Y0 + H / 2 + fs * 0.7, tampFmt(W) + ' × ' + tampFmt(H));
  svg += label((f.A0 + f.A1) / 2, f.Y0 + H / 2 - fs * 0.7, tampT('depth_line', { d: tampFmt(f.D), p: tampFmt(f.D + TAMP_EXTRA_DEPTH_MM) }));
  view.innerHTML = `<svg class="po-tamp-svg" viewBox="0 0 ${vbW.toFixed(1)} ${vbH.toFixed(1)}" preserveAspectRatio="xMidYMid meet">${svg}</svg>`;
}

// ---------- Ligações ----------
(function attachTamponamento() {
  if (typeof document === 'undefined') return;
  const btn = document.getElementById('po-proj-slot-tamp-btn');
  if (btn) btn.addEventListener('click', (e) => { e.stopPropagation(); openProjectTamponamento(); });
  // Menu do botão direito do grupo (po-proj-group-toolbar): o botão é
  // acrescentado aqui e tratado por este listener próprio.
  const menu = document.getElementById('po-proj-group-toolbar');
  if (menu) {
    menu.addEventListener('click', (e) => {
      const b = e.target.closest('[data-group-action="tamponamento"]');
      if (!b) return;
      menu.style.display = 'none';
      openProjectTamponamento();
    });
    if (typeof MutationObserver === 'function') {
      new MutationObserver(() => {
        if (!menu.innerHTML || menu.querySelector('[data-group-action="tamponamento"]')) return;
        const nb = document.createElement('button');
        nb.type = 'button';
        nb.className = 'po-proj-group-toolbar-btn';
        nb.setAttribute('data-group-action', 'tamponamento');
        nb.textContent = tampT('group_btn');
        menu.appendChild(nb);
      }).observe(menu, { childList: true });
    }
  }
})();
