// ============================================================
// PLANO TÉCNICO — aba Projetos (2026-10-13)
// ============================================================
// Pedido do Matt: "quero um novo botão de ia integrado que gere as imagens
// com as cotas em paralelo de cada parede que tiver algum componente e uma
// vista de planta baixa mostrando cada parede e os móveis do chão. tudo em
// um plano bem explicado e cotado. com e sem portas e painéis (portas e
// painéis ocultos)" + referência visual (elevação estilo 2020: parede cinza
// ao fundo, código do módulo azul sublinhado dentro dele, corrente de cotas
// em cima e embaixo com traço inclinado, 2ª linha embaixo com cota até o
// centro ℄ dos eletros).
//
// Decisão: o desenho NÃO é gerado por IA de imagem — IA inventa medida. É
// automático a partir da cena 3D real (ViewerProjectEdit.getScene()):
//   - Um WebGLRenderer PRÓPRIO, fora da tela, com câmera ORTOGRÁFICA
//     (paralela) enquadrada exatamente na parede. A câmera/tela do usuário
//     não é tocada. A visibilidade dos objetos da cena é trocada e
//     restaurada de forma SÍNCRONA em volta de cada render, então o loop de
//     animação do viewer nunca chega a desenhar o estado temporário.
//   - Como a projeção é paralela, mundo → pixel é linear (Vector3.project),
//     e as cotas/rótulos são desenhados num canvas 2D por cima, com texto
//     nítido e tamanho controlado.
//   - "Sem portas e painéis": esconde peça com userData.isFrontPiece
//     (porta/frente de gaveta, ver tagPieceUserData em viewer3d.js) e peça
//     cujo papel de cor é painel/puxador (PT_HIDE_ROLE_RE).
//   - Planta baixa: câmera de cima, só móveis apoiados no piso + ilhas
//     (aéreos viram contorno tracejado), paredes/aberturas desenhadas em
//     vetor por cima com cota por parede.
//   - Tudo vai pra 1 PDF (jsPDF, mesmo da Proposta), carta paisagem, com
//     texto explicativo em cada página e a lista de módulos no fim.
// Numeração = projectSlotsOrderSequence() (portal-08), o mesmo número que o
// módulo ganha no pedido/etiqueta.
// Carregado depois do portal-10 e antes do portal-09 (boot).

const PT_PX_PER_M = 420;          // resolução base do render (px por metro)
const PT_MAX_IMG_PX = 3400;        // teto do lado maior da imagem 3D
const PT_UPPER_MIN_MM = 1000;      // módulo com base acima disto = aéreo
const PT_HIDE_ROLE_RE = /painel|panel|tampon|puxador|handle|tirador/i;
const PT_PANEL_NAME_RE = /painel|panel|tampon|filler/i;
const PT_COLOR_DIM = '#1b1f8a';    // azul-marinho das cotas (referência)
const PT_COLOR_LABEL = '#1b3fae';  // azul do código do módulo
const PT_COLOR_WALL = '#e4e4e4';   // parede cinza ao fundo
const PT_COLOR_WALL_PLAN = '#6f6a63';
let ptRunning = false;

function ptT(k, vars) { return I18n.t('tech_plan.' + k, vars); }
function ptUnit() { return (document.getElementById('po-unit-select') || {}).value || 'mm'; }
// Em mm o número vai sem o " mm" (a unidade está no cabeçalho de toda página —
// repetir em cada cota polui o desenho); polegada mantém o " (padrão da
// referência).
function ptFmt(mm) {
  const u = ptUnit();
  const v = Math.round(Number(mm) || 0);
  return u === 'mm' ? formatDimensionNumber(v, u) : formatDimension(v, u);
}
function ptSleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function ptSlotById(id) { return (projectSlots || []).find((s) => s.id === id) || null; }
function ptIsDecor(slot) { return !!(slot && slot.module && slot.module.is_decoration); }
function ptIsVisualOnly(slot) { return !!(slot && slot.module && slot.module.visual_only); }
function ptIsUpper(slot) { return !isFloorSlot(slot) && Number(slot.floor_height_mm || 0) >= PT_UPPER_MIN_MM; }
function ptRoleName(id) {
  const r = (colorRolesCache || []).find((x) => x.id === id);
  return (r && r.name) || '';
}

// ---------- status flutuante ----------
function ptStatus(msg) {
  let el = document.getElementById('po-techplan-status');
  if (!msg) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement('div');
    el.id = 'po-techplan-status';
    el.className = 'po-techplan-status';
    document.body.appendChild(el);
  }
  el.textContent = msg;
}

// ---------- visibilidade temporária da cena ----------
function ptSaveVisibility(scene) {
  const saved = [];
  scene.traverse((o) => saved.push([o, o.visible]));
  const bg = scene.background;
  return () => { saved.forEach(([o, v]) => { o.visible = v; }); scene.background = bg; };
}

// Liga/desliga as peças DENTRO de um módulo: ignora o que o usuário escondeu
// em Camadas (o plano é técnico, mostra tudo) e, no modo "sem portas",
// esconde frentes e painéis.
function ptShowPieces(group, hideFronts) {
  const walk = (o) => {
    const ud = o.userData || {};
    if (hideFronts && ud.isFrontPiece) { o.visible = false; return; }
    if (ud.colorRoleId) {
      o.visible = !(hideFronts && PT_HIDE_ROLE_RE.test(ptRoleName(ud.colorRoleId)));
      if (!o.visible) return;
    }
    (o.children || []).forEach(walk);
  };
  walk(group);
}

// opts.include(group, slot) → bool; opts.includeLoose(obj) → bool (rodapé
// emendado e afins, que ficam soltos na cena sem slotId).
function ptApplyView(scene, opts) {
  scene.children.forEach((top) => {
    if (top.isLight) return;
    const ud = top.userData || {};
    if (ud.slotId != null) {
      const slot = ptSlotById(ud.slotId);
      let on = !!slot && !ptIsVisualOnly(slot) && opts.include(top, slot);
      if (on && opts.hideFronts && PT_PANEL_NAME_RE.test(String((slot.module && slot.module.name) || ''))) on = false;
      top.visible = on;
      if (on) ptShowPieces(top, opts.hideFronts);
      return;
    }
    if (ud.isMergedBaseboard) { top.visible = !!(opts.includeLoose && opts.includeLoose(top)); return; }
    top.visible = false; // ambiente, cotas, setas, contorno de seleção…
  });
}

// ---------- render ortográfico fora da tela ----------
let ptRenderer = null;
function ptGetRenderer() {
  if (ptRenderer) return ptRenderer;
  ptRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  ptRenderer.setPixelRatio(1);
  if ('outputColorSpace' in ptRenderer) ptRenderer.outputColorSpace = THREE.SRGBColorSpace;
  else if ('outputEncoding' in ptRenderer) ptRenderer.outputEncoding = THREE.sRGBEncoding;
  return ptRenderer;
}
function ptDisposeRenderer() {
  if (!ptRenderer) return;
  try { ptRenderer.dispose(); if (ptRenderer.forceContextLoss) ptRenderer.forceContextLoss(); } catch (e) { /* ok */ }
  ptRenderer = null;
}

// Monta a câmera paralela: center (Vector3), viewDir (de onde a câmera olha
// PRA o centro), up, meia-largura/meia-altura em metros.
function ptMakeCamera(center, fromDir, up, halfW, halfH) {
  const cam = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.05, 60);
  cam.position.copy(center).addScaledVector(fromDir.clone().normalize(), 25);
  cam.up.copy(up);
  cam.lookAt(center);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);
  return cam;
}

// Renderiza com fundo transparente (a parede cinza é pintada por baixo no
// 2D). Tudo síncrono: aplica visibilidade → render → restaura.
function ptRender(scene, cam, wPx, hPx, viewOpts) {
  const r = ptGetRenderer();
  r.setSize(wPx, hPx, false);
  r.setClearColor(0xffffff, 0);
  const restore = ptSaveVisibility(scene);
  let canvas = null;
  try {
    ptApplyView(scene, viewOpts);
    scene.background = null;
    r.render(scene, cam);
    canvas = document.createElement('canvas');
    canvas.width = wPx; canvas.height = hPx;
    canvas.getContext('2d').drawImage(r.domElement, 0, 0);
  } finally {
    restore();
  }
  return canvas;
}

function ptProjector(cam, wPx, hPx, offX, offY) {
  const v = new THREE.Vector3();
  return (x, y, z) => {
    v.set(x, y, z).project(cam);
    return { x: offX + (v.x + 1) / 2 * wPx, y: offY + (1 - v.y) / 2 * hPx };
  };
}

// ---------- desenho 2D: cotas ----------
function ptFont(px, bold) { return (bold ? 'bold ' : '') + Math.round(px) + 'px Arial, Helvetica, sans-serif'; }

function ptLine(ctx, a, b, color, width, dash) {
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = width || 1.5;
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  ctx.restore();
}

// Texto centrado em (x,y), girado pra acompanhar a linha mas sempre legível
// (nunca de cabeça pra baixo), com fundo branco "cortando" a linha de cota.
function ptTextOnLine(ctx, text, x, y, angle, fs, color) {
  let a = angle;
  while (a > Math.PI / 2 + 1e-3) a -= Math.PI;
  while (a <= -Math.PI / 2 + 1e-3) a += Math.PI;
  ctx.save();
  ctx.translate(x, y); ctx.rotate(a);
  ctx.font = ptFont(fs);
  const w = ctx.measureText(text).width;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-w / 2 - fs * 0.25, -fs * 0.62, w + fs * 0.5, fs * 1.24);
  ctx.fillStyle = color || PT_COLOR_DIM;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 1);
  ctx.restore();
  return w;
}

// Corrente de cotas: pts = pontos MEDIDOS (tela) já ordenados ao longo da
// linha, n = normal unitária (tela) apontando pra FORA do desenho,
// off = distância (px) da linha de cota até os pontos. Ticks inclinados nas
// pontas (estilo da referência). Rótulo que não cabe no segmento sai pra
// fora com uma "perninha", alternando 2 fileiras pra não encavalar.
// labels (opcional) = texto por segmento; marks (opcional) = símbolo por
// ponto (ex.: ℄). Devolve quantos px pra fora a corrente ocupou.
function ptDimChain(ctx, pts, n, off, fs, opts) {
  opts = opts || {};
  if (!pts || pts.length < 2) return 0;
  const gap = fs * 0.3, ext = fs * 0.45, tick = fs * 0.38;
  const q = pts.map((p) => ({ x: p.x + n.x * off, y: p.y + n.y * off }));
  const col = opts.color || PT_COLOR_DIM;
  // linhas de extensão
  pts.forEach((p, i) => {
    if (opts.noExtAt && opts.noExtAt[i]) return;
    ptLine(ctx, { x: p.x + n.x * gap, y: p.y + n.y * gap }, { x: q[i].x + n.x * ext, y: q[i].y + n.y * ext }, col, 1.2);
  });
  ptLine(ctx, q[0], q[q.length - 1], col, 1.5);
  const dx = q[q.length - 1].x - q[0].x, dy = q[q.length - 1].y - q[0].y;
  const len = Math.hypot(dx, dy) || 1;
  const d = { x: dx / len, y: dy / len };
  const sl = { x: (d.x + n.x) * tick / Math.SQRT2, y: (d.y + n.y) * tick / Math.SQRT2 };
  q.forEach((p) => ptLine(ctx, { x: p.x - sl.x, y: p.y - sl.y }, { x: p.x + sl.x, y: p.y + sl.y }, col, 2));
  const ang = Math.atan2(d.y, d.x);
  ctx.font = ptFont(fs);
  let maxOut = off + fs * 0.7;
  let row = 0;
  for (let i = 0; i < q.length - 1; i++) {
    const segLen = Math.hypot(q[i + 1].x - q[i].x, q[i + 1].y - q[i].y);
    if (segLen < 1) continue;
    const text = opts.labels ? opts.labels[i] : null;
    if (!text) continue;
    const tw = ctx.measureText(text).width;
    const mid = { x: (q[i].x + q[i + 1].x) / 2, y: (q[i].y + q[i + 1].y) / 2 };
    if (tw + fs * 0.8 <= segLen) {
      ptTextOnLine(ctx, text, mid.x, mid.y, ang, fs, col);
      row = 0;
    } else {
      row = row === 1 ? 2 : 1;
      const out = fs * 1.35 * row;
      const tp = { x: mid.x + n.x * out, y: mid.y + n.y * out };
      ptLine(ctx, mid, { x: tp.x - n.x * fs * 0.6, y: tp.y - n.y * fs * 0.6 }, col, 1);
      ptTextOnLine(ctx, text, tp.x, tp.y, ang, fs * 0.9, col);
      maxOut = Math.max(maxOut, off + out + fs * 0.7);
    }
  }
  if (opts.marks) {
    opts.marks.forEach((m, i) => {
      if (!m) return;
      const p = { x: q[i].x + n.x * fs * 1.1, y: q[i].y + n.y * fs * 1.1 };
      ctx.save();
      ctx.font = ptFont(fs * 1.15, true); ctx.fillStyle = '#111';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(m, p.x, p.y);
      ctx.restore();
      maxOut = Math.max(maxOut, off + fs * 1.8);
    });
  }
  return maxOut;
}

function ptChainLabels(valuesMm) {
  return valuesMm.map((v) => (Math.round(v) > 0 ? ptFmt(v) : null));
}

// Rótulo do módulo dentro do retângulo dele (tela): código/nome azul
// sublinhado + número oficial pequeno + medidas. Encolhe a fonte pra caber.
function ptModuleLabel(ctx, rect, slot, num, fs) {
  const name = String((slot.module && slot.module.name) || '').trim() || '—';
  const cx = (rect.x0 + rect.x1) / 2, cy = (rect.y0 + rect.y1) / 2;
  const maxW = Math.max(10, (rect.x1 - rect.x0) - fs * 0.5);
  const maxH = rect.y1 - rect.y0;
  let f = fs;
  ctx.font = ptFont(f, true);
  while (f > fs * 0.55 && ctx.measureText(name).width > maxW) { f -= 1; ctx.font = ptFont(f, true); }
  let shown = name;
  while (shown.length > 3 && ctx.measureText(shown).width > maxW) shown = shown.slice(0, -2);
  if (shown !== name) shown = shown.slice(0, -1) + '…';
  const dims = ptFmt(slot.width_mm) + ' × ' + ptFmt(slot.height_mm) + ' × ' + ptFmt(slot.depth_mm);
  const lines = [];
  if (num != null) lines.push({ t: '#' + num, f: f * 0.8, c: '#e6007e', bold: true });
  lines.push({ t: shown, f, c: PT_COLOR_LABEL, bold: true, underline: true });
  const df = Math.max(fs * 0.5, f * 0.72);
  ctx.font = ptFont(df);
  if (ctx.measureText(dims).width <= maxW && maxH > (f * 2.2 + df * 1.3)) lines.push({ t: dims, f: df, c: '#333' });
  const totalH = lines.reduce((s, l) => s + l.f * 1.25, 0);
  let y = cy - totalH / 2;
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  lines.forEach((l) => {
    ctx.font = ptFont(l.f, l.bold);
    const w = ctx.measureText(l.t).width;
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.fillRect(cx - w / 2 - 3, y - 1, w + 6, l.f * 1.18);
    ctx.fillStyle = l.c;
    ctx.fillText(l.t, cx, y);
    if (l.underline) ptLine(ctx, { x: cx - w / 2, y: y + l.f * 1.05 }, { x: cx + w / 2, y: y + l.f * 1.05 }, l.c, Math.max(1, l.f / 14));
    y += l.f * 1.25;
  });
  ctx.restore();
}

// ---------- dados ----------
function ptNumberMap() {
  const map = new Map();
  if (typeof projectSlotsOrderSequence === 'function') {
    projectSlotsOrderSequence().forEach((e) => { if (!ptIsDecor(e.slot)) map.set(e.slot.id, e.numero); });
  }
  return map;
}
function ptWallSlots(wallIndex) {
  return (projectSlots || []).filter((s) => !isFloorSlot(s) && !ptIsVisualOnly(s) && s.module
    && Number(s.wall_index || 0) === wallIndex);
}
function ptCeilingMm(wallGeo) {
  return Number((wallGeo && wallGeo.ceilingMm) || (roomSettings && roomSettings.ceiling_mm) || 2600);
}
function ptOpeningName(type) {
  const k = { door: 'op_door', window: 'op_window', passage: 'op_passage' }[type];
  return k ? I18n.t('wall_editor.' + k) : String(type || '');
}

// Agrupa os limites (mm ao longo da parede) incluindo as pontas da parede.
function ptBounds(list, widthMm) {
  const set = new Set([0, Math.round(widthMm)]);
  list.forEach((s) => {
    const a0 = Math.round(Number(s.x_mm || 0));
    set.add(Math.max(0, Math.min(Math.round(widthMm), a0)));
    set.add(Math.max(0, Math.min(Math.round(widthMm), a0 + Math.round(Number(s.width_mm || 0)))));
  });
  return Array.from(set).sort((a, b) => a - b);
}

// ---------- COMPONENTES do módulo em corte (vista sem portas) ----------
// Pedido do Matt (13/10, 2ª rodada): "quero que mostre os componentes dos
// módulos um pouco melhor, não só uma caixa em branco, mas as laterais, as
// bases". Em vista frontal paralela, lateral/base/prateleira aparecem só de
// TOPO (a espessura da chapa) e o render 3D sozinho vira um bloco claro. Aqui
// cada PEÇA (objeto com userData.pieceInfo, ver tagPieceUserData em
// viewer3d.js) tem a caixa projetada nos eixos da parede (ao longo / altura /
// profundidade) e é redesenhada em vetor por cima do render:
//   - fina na largura (lateral, divisória) ou na altura (base, tampo,
//     prateleira, fundo de gaveta) = chapa vista em CORTE → preenchida escura;
//   - fina na profundidade (fundo/costas, traseira de gaveta) = vista de
//     FRENTE → só contorno, preenchimento claro;
//   - o resto (eletro, peça volumosa) → só contorno.
// Mesmas regras de ocultar do render (frente/painel/puxador não entram).
const PT_THIN_MM = 45;
function ptPieceBoxesForWall(scene, wallGeo) {
  const along = new THREE.Vector3(wallGeo.alongDirX, 0, wallGeo.alongDirZ);
  const into = new THREE.Vector3(wallGeo.intoDirX, 0, wallGeo.intoDirZ);
  const o = new THREE.Vector3(wallGeo.originX, 0, wallGeo.originZ);
  const corner = new THREE.Vector3();
  const out = [];
  scene.updateMatrixWorld(true);
  scene.children.forEach((g) => {
    const ud = g.userData || {};
    if (ud.slotId == null) return;
    if (wallGeo._include ? !wallGeo._include(g) : (ud.isFloorIsland || ud.wallIndex !== wallGeo.wallIndex)) return;
    const slot = ptSlotById(ud.slotId);
    if (!slot || ptIsVisualOnly(slot) || ptIsDecor(slot)) return;
    if (PT_PANEL_NAME_RE.test(String((slot.module && slot.module.name) || ''))) return;
    const walk = (obj) => {
      const u = obj.userData || {};
      if (u.isFrontPiece || u.isDecorPiece) return;
      if (u.colorRoleId && PT_HIDE_ROLE_RE.test(ptRoleName(u.colorRoleId))) return;
      if (u.pieceInfo) {
        let aMin = Infinity, aMax = -Infinity, yMin = Infinity, yMax = -Infinity, nMin = Infinity, nMax = -Infinity;
        obj.traverse((m) => {
          if (!m.isMesh || !m.geometry) return;
          if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
          const bb = m.geometry.boundingBox;
          for (let i = 0; i < 8; i++) {
            corner.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z)
              .applyMatrix4(m.matrixWorld);
            const rel = corner.clone().sub(o);
            const a = rel.dot(along), n = rel.dot(into);
            aMin = Math.min(aMin, a); aMax = Math.max(aMax, a);
            yMin = Math.min(yMin, corner.y); yMax = Math.max(yMax, corner.y);
            nMin = Math.min(nMin, n); nMax = Math.max(nMax, n);
          }
        });
        if (isFinite(aMin)) {
          const w = (aMax - aMin) * 1000, h = (yMax - yMin) * 1000, d = (nMax - nMin) * 1000;
          if (Math.max(w, h, d) >= 8) {
            let kind = 'solid';
            if (d <= PT_THIN_MM && w > PT_THIN_MM && h > PT_THIN_MM) kind = 'face';
            else if (w <= PT_THIN_MM || h <= PT_THIN_MM) kind = 'cut';
            out.push({ aMin, aMax, yMin, yMax, nMin, kind });
          }
        }
        return; // a peça é a unidade — não desce nos filhos (arestas etc.)
      }
      (obj.children || []).forEach(walk);
    };
    walk(g);
  });
  return out;
}

function ptDrawPieces(ctx, boxes, S, fs) {
  const rect = (b) => {
    const p0 = S(b.aMin, b.yMin), p1 = S(b.aMax, b.yMax);
    return { x: Math.min(p0.x, p1.x), y: Math.min(p0.y, p1.y), w: Math.abs(p1.x - p0.x), h: Math.abs(p1.y - p0.y) };
  };
  // fundo primeiro (mais longe da câmera), corte por cima
  const order = { face: 0, solid: 1, cut: 2 };
  boxes.slice().sort((a, b) => (order[a.kind] - order[b.kind]) || (a.nMin - b.nMin)).forEach((b) => {
    const r = rect(b);
    ctx.save();
    if (b.kind === 'face') {
      ctx.fillStyle = '#f3ede2';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = '#8c8173'; ctx.lineWidth = 1.2;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
    } else if (b.kind === 'cut') {
      ctx.fillStyle = '#a0784e';
      ctx.fillRect(r.x, r.y, Math.max(r.w, 2), Math.max(r.h, 2));
      ctx.strokeStyle = '#3d2c1c'; ctx.lineWidth = 1.4;
      ctx.strokeRect(r.x, r.y, Math.max(r.w, 2), Math.max(r.h, 2));
    } else {
      ctx.strokeStyle = '#5c5246'; ctx.lineWidth = 1.2;
      ctx.setLineDash([fs * 0.3, fs * 0.2]);
      ctx.strokeRect(r.x, r.y, r.w, r.h);
    }
    ctx.restore();
  });
}

// ---------- MÓDULOS DO CHÃO (ilhas) como "parede virtual" ----------
// Pedido do Matt (13/10, 3ª rodada): "quero uma vista quando existir módulos
// no chão; se tiverem conectados pode ser uma vista só, se tiverem separados
// faça uma vista pra cada um. como se tivessem em uma parede. pega sempre com
// as portas pra frente."
// Frente do módulo = eixo +Z local do group (mesma convenção dos módulos de
// parede: rotation.y = atan2(intoX, intoZ), ver renderFreeformWalls), em
// mundo via getWorldDirection. Juntos numa vista = encostados (caixas a
// ≤ 2 cm) E virados pro mesmo lado (frentes com < ~45° de diferença) — ilha
// "costas com costas" vira duas vistas, cada uma pelo lado das portas.
// A vista é montada como uma parede de mentira (mesmos campos de
// getProjectWallGeometry) posta atrás dos módulos, e os "slots" passados pro
// desenho são cópias com x_mm/altura/profundidade medidos no próprio 3D.
function ptIslandViews(scene) {
  scene.updateMatrixWorld(true);
  const items = [];
  scene.children.forEach((g) => {
    if (!g.userData || !g.userData.isFloorIsland || g.userData.slotId == null) return;
    const slot = ptSlotById(g.userData.slotId);
    if (!slot || ptIsVisualOnly(slot)) return;
    const box = new THREE.Box3().setFromObject(g);
    if (box.isEmpty()) return;
    const f = new THREE.Vector3(); g.getWorldDirection(f); f.y = 0;
    if (f.lengthSq() < 1e-6) f.set(0, 0, 1);
    f.normalize();
    items.push({ g, slot, box: box.clone().expandByScalar(0.02), front: f });
  });
  const parent = items.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (items[i].front.dot(items[j].front) > 0.7 && items[i].box.intersectsBox(items[j].box)) parent[find(i)] = find(j);
    }
  }
  const clusters = new Map();
  items.forEach((it, i) => { const r = find(i); if (!clusters.has(r)) clusters.set(r, []); clusters.get(r).push(it); });
  const views = [];
  const corner = new THREE.Vector3();
  Array.from(clusters.values()).forEach((list) => {
    // frente = média das frentes (todas parecidas por construção)
    const front = list.reduce((acc, it) => acc.add(it.front), new THREE.Vector3()).normalize();
    const along = new THREE.Vector3(front.z, 0, -front.x); // up × front
    const ext = list.map((it) => {
      let aMin = Infinity, aMax = -Infinity, yMin = Infinity, yMax = -Infinity, nMin = Infinity, nMax = -Infinity;
      it.g.traverse((m) => {
        if (!m.isMesh || !m.geometry) return;
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
        const bb = m.geometry.boundingBox;
        for (let k = 0; k < 8; k++) {
          corner.set(k & 1 ? bb.max.x : bb.min.x, k & 2 ? bb.max.y : bb.min.y, k & 4 ? bb.max.z : bb.min.z).applyMatrix4(m.matrixWorld);
          const a = corner.x * along.x + corner.z * along.z, n = corner.x * front.x + corner.z * front.z;
          aMin = Math.min(aMin, a); aMax = Math.max(aMax, a); yMin = Math.min(yMin, corner.y); yMax = Math.max(yMax, corner.y);
          nMin = Math.min(nMin, n); nMax = Math.max(nMax, n);
        }
      });
      return { it, aMin, aMax, yMin, yMax, nMin, nMax };
    }).filter((e) => isFinite(e.aMin));
    if (!ext.length) return;
    const A0 = Math.min(...ext.map((e) => e.aMin)), A1 = Math.max(...ext.map((e) => e.aMax));
    const N0 = Math.min(...ext.map((e) => e.nMin));
    const topM = Math.max(...ext.map((e) => e.yMax));
    const ids = new Set(list.map((it) => it.g.userData.slotId));
    const pseudo = ext.slice().sort((a, b) => a.aMin - b.aMin).map((e) => Object.assign({}, e.it.slot, {
      x_mm: Math.round((e.aMin - A0) * 1000),
      // medida "de catálogo" do módulo quando bate com o 3D (ilha girada 90°
      // ainda mede width ao longo da frente); senão o que o 3D mostra
      width_mm: Number(e.it.slot.width_mm) || Math.round((e.aMax - e.aMin) * 1000),
      floor_height_mm: Math.max(0, Math.round(e.yMin * 1000)),
      height_mm: Number(e.it.slot.height_mm) || Math.round((e.yMax - e.yMin) * 1000),
      depth_mm: Number(e.it.slot.depth_mm) || Math.round((e.nMax - e.nMin) * 1000)
    }));
    views.push({
      wallIndex: -1 - views.length,
      widthM: A1 - A0,
      originX: along.x * A0 + front.x * N0,
      originZ: along.z * A0 + front.z * N0,
      alongDirX: along.x, alongDirZ: along.z,
      intoDirX: front.x, intoDirZ: front.z,
      openings: [],
      _island: true,
      _ceilMm: Math.round(topM * 1000),
      _slots: pseudo,
      _include: (g) => ids.has(g.userData.slotId),
      _ids: ids,
      _center: { x: along.x * (A0 + A1) / 2 + front.x * N0, z: along.z * (A0 + A1) / 2 + front.z * N0 }
    });
  });
  return views;
}

// ---------- ELEVAÇÃO de uma parede ----------
function ptRenderWall(scene, wallGeo, nums, hideFronts) {
  const W = wallGeo.widthM;
  const ceil = (wallGeo._ceilMm || ptCeilingMm(wallGeo)) / 1000;
  const slots = wallGeo._slots || ptWallSlots(wallGeo.wallIndex);
  const aMin = -0.12, aMax = W + 0.12, yMin = -0.06, yMax = ceil + 0.06;
  const spanA = aMax - aMin, spanY = yMax - yMin;
  const ppm = Math.min(PT_PX_PER_M, PT_MAX_IMG_PX / Math.max(spanA, spanY));
  const wPx = Math.round(spanA * ppm), hPx = Math.round(spanY * ppm);
  const along = new THREE.Vector3(wallGeo.alongDirX, 0, wallGeo.alongDirZ);
  const into = new THREE.Vector3(wallGeo.intoDirX, 0, wallGeo.intoDirZ);
  const P = (a, y) => new THREE.Vector3(wallGeo.originX + along.x * a, y, wallGeo.originZ + along.z * a);
  const center = P((aMin + aMax) / 2, (yMin + yMax) / 2);
  const cam = ptMakeCamera(center, into, new THREE.Vector3(0, 1, 0), spanA / 2, spanY / 2);

  const img = ptRender(scene, cam, wPx, hPx, {
    hideFronts,
    include: wallGeo._include || ((g) => !g.userData.isFloorIsland && g.userData.wallIndex === wallGeo.wallIndex),
    includeLoose: (o) => {
      const rel = o.position.clone().sub(P(0, 0));
      const a = rel.dot(along), n = rel.dot(into);
      return a > -0.2 && a < W + 0.2 && n > -0.05 && n < 1.0;
    }
  });

  // tela composta com margem pras cotas
  const fs = Math.max(18, Math.round(Math.max(0.058 * ppm, wPx / 85)));
  const uppers = slots.filter(ptIsUpper);
  const lowers = slots.filter((s) => !ptIsUpper(s));
  const padT = Math.round(fs * (uppers.length ? 8 : 2.5));
  const padB = Math.round(fs * 11);
  const padL = Math.round(fs * 5.5);
  const padR = Math.round(fs * 10);
  const out = document.createElement('canvas');
  out.width = wPx + padL + padR; out.height = hPx + padT + padB;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, out.width, out.height);
  const pr = ptProjector(cam, wPx, hPx, padL, padT);
  const S = (a, y) => { const v = P(a, y); return pr(v.x, v.y, v.z); };

  // parede cinza + piso
  const c0 = S(0, 0), c1 = S(W, ceil);
  const xL = Math.min(c0.x, c1.x), xR = Math.max(c0.x, c1.x);
  const yFloor = c0.y, yCeil = c1.y;
  // ilha: sem parede de fundo (não existe), só o piso
  if (!wallGeo._island) {
    ctx.fillStyle = PT_COLOR_WALL;
    ctx.fillRect(xL, yCeil, xR - xL, yFloor - yCeil);
    ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5;
    ctx.strokeRect(xL, yCeil, xR - xL, yFloor - yCeil);
  }
  // aberturas (porta/janela) recortadas na parede
  const openings = Array.isArray(wallGeo.openings) ? wallGeo.openings : [];
  openings.forEach((o) => {
    const a0 = Number(o.x_mm || 0) / 1000, a1 = a0 + Number(o.width_mm || 0) / 1000;
    const y0 = Number(o.sill_mm || 0) / 1000, y1 = y0 + Number(o.height_mm || 0) / 1000;
    const p0 = S(a0, y0), p1 = S(a1, y1);
    const rx = Math.min(p0.x, p1.x), rw = Math.abs(p1.x - p0.x), ry = Math.min(p0.y, p1.y), rh = Math.abs(p1.y - p0.y);
    ctx.fillStyle = o.type === 'window' ? '#eef5fb' : '#ffffff';
    ctx.fillRect(rx, ry, rw, rh);
    ctx.save(); ctx.setLineDash([fs * 0.4, fs * 0.25]); ctx.strokeStyle = '#7a8899'; ctx.lineWidth = 1.5;
    ctx.strokeRect(rx, ry, rw, rh); ctx.restore();
    ctx.save(); ctx.font = ptFont(fs * 0.8); ctx.fillStyle = '#4a5866'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(ptOpeningName(o.type) + ' ' + ptFmt(o.width_mm) + ' × ' + ptFmt(o.height_mm), rx + rw / 2, ry + fs * 0.3);
    if (Number(o.sill_mm) > 0) ctx.fillText(ptT('sill') + ' ' + ptFmt(o.sill_mm), rx + rw / 2, ry + fs * 1.3);
    ctx.restore();
  });
  ctx.drawImage(img, padL, padT);
  if (hideFronts) ptDrawPieces(ctx, ptPieceBoxesForWall(scene, wallGeo), S, fs);
  ptLine(ctx, { x: xL - fs, y: yFloor }, { x: xR + fs, y: yFloor }, '#222', 3);

  // rótulos dos módulos (dentro do retângulo)
  slots.forEach((s) => {
    const a0 = Number(s.x_mm || 0) / 1000, a1 = a0 + Number(s.width_mm || 0) / 1000;
    const y0 = Number(s.floor_height_mm || 0) / 1000, y1 = y0 + Number(s.height_mm || 0) / 1000;
    const p0 = S(a0, y0), p1 = S(a1, y1);
    ptModuleLabel(ctx, { x0: Math.min(p0.x, p1.x), x1: Math.max(p0.x, p1.x), y0: Math.min(p0.y, p1.y), y1: Math.max(p0.y, p1.y) },
      s, ptIsDecor(s) ? null : nums.get(s.id), fs);
  });

  // ordena os pontos da corrente da ESQUERDA pra direita da tela
  const chainPts = (boundsMm, y) => boundsMm.map((b) => ({ b, p: S(b / 1000, y) })).sort((u, v) => u.p.x - v.p.x);
  const segVals = (arr) => arr.slice(1).map((e, i) => Math.abs(e.b - arr[i].b));

  // EMBAIXO 1: módulos de base + vãos
  const Wmm = W * 1000;
  const low = chainPts(ptBounds(lowers, Wmm), 0);
  let used = ptDimChain(ctx, low.map((e) => e.p), { x: 0, y: 1 }, fs * 1.6, fs, { labels: ptChainLabels(segVals(low)) });
  // EMBAIXO 2: até o centro (℄) dos eletros/decoração apoiados no piso — ou
  // só o comprimento total da parede se não houver nenhum.
  const centers = lowers.filter(ptIsDecor).map((s) => Math.round(Number(s.x_mm || 0) + Number(s.width_mm || 0) / 2));
  const cl = chainPts(Array.from(new Set([0, Math.round(Wmm)].concat(centers))).sort((a, b) => a - b), 0);
  const centerSet = new Set(centers);
  // (pula a 2ª linha quando ela só repetiria a 1ª — um módulo só ocupando tudo)
  if (centers.length || low.length > 2) used = ptDimChain(ctx, cl.map((e) => e.p), { x: 0, y: 1 }, used + fs * 1.3, fs, {
    labels: ptChainLabels(segVals(cl)),
    marks: cl.map((e) => (centerSet.has(e.b) ? '℄' : null))
  });
  // EMBAIXO 3 (só se teve ℄): total da parede
  if (centers.length) {
    const tot = chainPts([0, Math.round(Wmm)], 0);
    ptDimChain(ctx, tot.map((e) => e.p), { x: 0, y: 1 }, used + fs * 1.6, fs, { labels: [ptFmt(Wmm)] });
  }
  // EM CIMA: aéreos + vãos (corrente sobre o teto)
  if (uppers.length) {
    const up = chainPts(ptBounds(uppers, Wmm), ceil);
    ptDimChain(ctx, up.map((e) => e.p), { x: 0, y: -1 }, fs * 1.6, fs, { labels: ptChainLabels(segVals(up)) });
  }
  // DIREITA: níveis a partir do piso (base, topo da base, base do aéreo…)
  const levels = new Set([0, Math.round(ceil * 1000)]);
  slots.forEach((s) => {
    const y0 = Math.round(Number(s.floor_height_mm || 0));
    levels.add(y0); levels.add(y0 + Math.round(Number(s.height_mm || 0)));
  });
  const lv = Array.from(levels).filter((v) => v >= 0 && v <= Math.round(ceil * 1000) + 1).sort((a, b) => a - b);
  const sideA = (S(W, 0).x >= S(0, 0).x) ? W : 0; // ponta da parede que fica à direita na tela
  const vPts = lv.map((mm) => S(sideA, mm / 1000)).reverse(); // de cima pra baixo
  const vVals = lv.slice(1).map((v, i) => v - lv[i]).reverse();
  ptDimChain(ctx, vPts, { x: 1, y: 0 }, fs * 1.8, fs, { labels: ptChainLabels(vVals) });
  // ESQUERDA: pé-direito
  const leftA = sideA === W ? 0 : W;
  if (!wallGeo._island) ptDimChain(ctx, [S(leftA, ceil), S(leftA, 0)], { x: -1, y: 0 }, fs * 1.8, fs, { labels: [ptFmt(ceil * 1000)] });

  return out;
}

// ---------- PLANTA BAIXA ----------
function ptRenderPlan(scene, walls, nums, islandViews) {
  const wallSlotsAll = [];
  walls.forEach((w) => ptWallSlots(w.wallIndex).forEach((s) => wallSlotsAll.push({ s, w })));
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  const add = (x, z) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); };
  walls.forEach((w) => {
    const t = (Number(w.thicknessMm) || 150) / 1000;
    const bx = w.originX + w.alongDirX * w.widthM, bz = w.originZ + w.alongDirZ * w.widthM;
    add(w.originX, w.originZ); add(bx, bz);
    add(w.originX - w.intoDirX * t, w.originZ - w.intoDirZ * t); add(bx - w.intoDirX * t, bz - w.intoDirZ * t);
  });
  const islandBoxes = [];
  scene.children.forEach((g) => {
    if (!g.userData || !g.userData.isFloorIsland) return;
    const slot = ptSlotById(g.userData.slotId);
    if (!slot || ptIsVisualOnly(slot)) return;
    const box = new THREE.Box3().setFromObject(g);
    if (box.isEmpty()) return;
    islandBoxes.push({ slot, box });
    add(box.min.x, box.min.z); add(box.max.x, box.max.z);
  });
  if (!isFinite(minX)) return null;
  const m = 0.1;
  minX -= m; maxX += m; minZ -= m; maxZ += m;
  const spanX = maxX - minX, spanZ = maxZ - minZ;
  const ppm = Math.min(PT_PX_PER_M * 0.75, PT_MAX_IMG_PX / Math.max(spanX, spanZ));
  const wPx = Math.round(spanX * ppm), hPx = Math.round(spanZ * ppm);
  const center = new THREE.Vector3((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
  const cam = ptMakeCamera(center, new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1), spanX / 2, spanZ / 2);
  const img = ptRender(scene, cam, wPx, hPx, {
    hideFronts: false,
    include: (g, slot) => !!g.userData.isFloorIsland || !ptIsUpper(slot),
    includeLoose: () => true
  });

  const fs = Math.max(18, Math.round(Math.max(0.075 * ppm, wPx / 70)));
  const pad = Math.round(fs * 9);
  const out = document.createElement('canvas');
  out.width = wPx + pad * 2; out.height = hPx + pad * 2;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, out.width, out.height);
  const pr = ptProjector(cam, wPx, hPx, pad, pad);
  const S = (x, z) => pr(x, 0, z);
  ctx.drawImage(img, pad, pad);

  // centro da tela (pra saber o lado "de fora" de cada parede na tela)
  walls.forEach((w) => {
    const t = (Number(w.thicknessMm) || 150) / 1000;
    const Pw = (a, n) => S(w.originX + w.alongDirX * a + w.intoDirX * n, w.originZ + w.alongDirZ * a + w.intoDirZ * n);
    const quad = [Pw(0, 0), Pw(w.widthM, 0), Pw(w.widthM, -t), Pw(0, -t)];
    ctx.save();
    ctx.fillStyle = w.oculta ? '#c9c5bf' : PT_COLOR_WALL_PLAN;
    ctx.beginPath(); quad.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.fill();
    ctx.restore();
    // aberturas
    (Array.isArray(w.openings) ? w.openings : []).forEach((o) => {
      const a0 = Number(o.x_mm || 0) / 1000, a1 = a0 + Number(o.width_mm || 0) / 1000;
      const q = [Pw(a0, 0.005), Pw(a1, 0.005), Pw(a1, -t - 0.005), Pw(a0, -t - 0.005)];
      ctx.save();
      ctx.fillStyle = o.type === 'window' ? '#dcecf7' : '#ffffff';
      ctx.beginPath(); q.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#333'; ctx.lineWidth = 1.2; ctx.stroke();
      if (o.type === 'window') ptLine(ctx, Pw(a0, -t / 2), Pw(a1, -t / 2), '#3a7fb5', 1.5);
      ctx.restore();
      const lp = Pw((a0 + a1) / 2, 0.22);
      ctx.save(); ctx.font = ptFont(fs * 0.75); ctx.fillStyle = '#4a5866'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(ptOpeningName(o.type) + ' ' + ptFmt(o.width_mm), lp.x, lp.y);
      ctx.restore();
    });
    // aéreos: contorno tracejado
    ptWallSlots(w.wallIndex).filter(ptIsUpper).forEach((s) => {
      const a0 = Number(s.x_mm || 0) / 1000, a1 = a0 + Number(s.width_mm || 0) / 1000, d = Number(s.depth_mm || 0) / 1000;
      const q = [Pw(a0, 0), Pw(a1, 0), Pw(a1, d), Pw(a0, d)];
      ctx.save(); ctx.setLineDash([fs * 0.45, fs * 0.3]); ctx.strokeStyle = '#555'; ctx.lineWidth = 1.6;
      ctx.beginPath(); q.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.stroke();
      ctx.restore();
    });
    // número de cada módulo (base no meio, aéreo perto da parede)
    ptWallSlots(w.wallIndex).forEach((s) => {
      if (ptIsDecor(s)) return;
      const num = nums.get(s.id);
      if (num == null) return;
      const a = (Number(s.x_mm || 0) + Number(s.width_mm || 0) / 2) / 1000;
      const d = Number(s.depth_mm || 0) / 1000;
      const p = Pw(a, ptIsUpper(s) ? Math.min(0.12, d / 2) : d * 0.62);
      ptBadge(ctx, p.x, p.y, fs * 0.62, num, ptIsUpper(s));
    });

    // cotas por fora da parede
    const o0 = S(w.originX, w.originZ);
    const o1 = S(w.originX - w.intoDirX, w.originZ - w.intoDirZ);
    const nl = Math.hypot(o1.x - o0.x, o1.y - o0.y) || 1;
    const nOut = { x: (o1.x - o0.x) / nl, y: (o1.y - o0.y) / nl };
    const tPx = t * ppm;
    const lowers = ptWallSlots(w.wallIndex).filter((s) => !ptIsUpper(s));
    const bounds = ptBounds(lowers, w.widthM * 1000);
    const pts = bounds.map((b) => Pw(b / 1000, -t));
    const vals = bounds.slice(1).map((b, i) => b - bounds[i]);
    let used = tPx;
    if (bounds.length > 2) used = ptDimChain(ctx, pts, nOut, fs * 1.4, fs, { labels: ptChainLabels(vals) });
    else used = 0;
    const totOff = used + fs * 1.4;
    const used2 = ptDimChain(ctx, [pts[0], pts[pts.length - 1]], nOut, totOff, fs, { labels: [ptFmt(w.widthM * 1000)] });
    // nome da parede
    const mid = Pw(w.widthM / 2, -t);
    const lp = { x: mid.x + nOut.x * (used2 + fs * 1.3), y: mid.y + nOut.y * (used2 + fs * 1.3) };
    ctx.save(); ctx.font = ptFont(fs * 1.05, true); ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.translate(lp.x, lp.y);
    let ang = Math.atan2(pts[pts.length - 1].y - pts[0].y, pts[pts.length - 1].x - pts[0].x);
    while (ang > Math.PI / 2 + 1e-3) ang -= Math.PI;
    while (ang <= -Math.PI / 2 + 1e-3) ang += Math.PI;
    ctx.rotate(ang);
    ctx.fillText(I18n.t('proposal.wall_label', { n: w.wallIndex + 1 }), 0, 0);
    ctx.restore();
  });

  // ilhas: número + medidas
  islandBoxes.forEach(({ slot, box }) => {
    const p = S((box.min.x + box.max.x) / 2, (box.min.z + box.max.z) / 2);
    const num = nums.get(slot.id);
    if (num != null && !ptIsDecor(slot)) ptBadge(ctx, p.x, p.y - fs * 0.7, fs * 0.62, num, false);
    ctx.save(); ctx.font = ptFont(fs * 0.8); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const txt = ptFmt(slot.width_mm) + ' × ' + ptFmt(slot.depth_mm);
    const tw = ctx.measureText(txt).width;
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(p.x - tw / 2 - 3, p.y + fs * 0.1, tw + 6, fs);
    ctx.fillStyle = PT_COLOR_DIM; ctx.fillText(txt, p.x, p.y + fs * 0.15);
    ctx.restore();
  });
  // nome de cada conjunto do chão ("Ilha 1"…), batendo com as páginas de vista
  (islandViews || []).forEach((v, i) => {
    const boxes = islandBoxes.filter((b) => v._ids.has(b.slot.id));
    if (!boxes.length) return;
    const minZ = Math.min(...boxes.map((b) => b.box.min.z));
    const cx = boxes.reduce((s2, b) => s2 + (b.box.min.x + b.box.max.x) / 2, 0) / boxes.length;
    const p = S(cx, minZ);
    ctx.save(); ctx.font = ptFont(fs * 1.0, true); ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(ptT('island_label', { n: i + 1 }), p.x, p.y - fs * 0.4);
    ctx.restore();
  });
  return out;
}

function ptBadge(ctx, x, y, r, num, dashed) {
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  if (dashed) {
    ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.setLineDash([3, 2]); ctx.strokeStyle = '#e6007e'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#e6007e';
  } else {
    ctx.fillStyle = '#e6007e'; ctx.fill(); ctx.fillStyle = '#ffffff';
  }
  ctx.font = ptFont(r * 1.15, true); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(num), x, y + 1);
  ctx.restore();
}

// ---------- PDF ----------
// A fonte padrão do jsPDF (helvetica) só fala WinAnsi: caractere acima de
// 0xFF (travessão, reticências, ℄) sai como lixo no PDF. Troca pelos
// equivalentes simples antes de escrever.
function ptPdfTxt(t) {
  if (Array.isArray(t)) return t.map(ptPdfTxt);
  return String(t == null ? '' : t)
    .replace(/[\u2013\u2014]/g, '-').replace(/\u2026/g, '...').replace(/\u2104/g, 'CL')
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"')
    .replace(/[^\x00-\xff]/g, '');
}
function ptPdfPage(doc, st, canvas, title, subtitle, notes) {
  if (st.pages > 0) doc.addPage();
  st.pages++;
  const W = 279.4, H = 215.9, M = 10;
  doc.setFillColor(43, 38, 33); doc.rect(0, 0, W, 16, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
  doc.text(ptT('title') + ' — ' + st.projectName, M, 10.5);
  // Logo do dealer (perfil com logo_url — mesma fonte da Proposta): numa
  // caixa branca no canto direito da faixa escura, pra logo escura não sumir.
  let dateRight = W - M;
  if (st.logo) {
    const maxW = 42, maxH = 10.5;
    const r = Math.min(maxW / st.logo.w, maxH / st.logo.h);
    const lw = st.logo.w * r, lh = st.logo.h * r;
    const boxW = lw + 4;
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(W - M - boxW, 2.2, boxW, 11.6, 1.5, 1.5, 'F');
    try { doc.addImage(st.logo.dataUrl, 'PNG', W - M - boxW + 2, 2.2 + (11.6 - lh) / 2, lw, lh); } catch (e) { /* logo inválida: segue sem */ }
    dateRight = W - M - boxW - 4;
  }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text(st.dateText + '   ·   ' + ptT('units', { u: st.unitText }), dateRight, 10.5, { align: 'right' });
  doc.setTextColor(43, 38, 33);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  doc.text(title, M, 24);
  if (subtitle) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(118, 111, 100); doc.text(subtitle, M, 29.5); }
  doc.setTextColor(0);
  const noteLines = notes ? doc.splitTextToSize(notes, W - 2 * M) : [];
  const noteH = noteLines.length * 3.6;
  const boxY = 33, boxH = H - boxY - 10 - noteH - 3;
  if (canvas) {
    // teto de escala: desenho pequeno (ilha de 1 módulo) não estoura a página
    // com texto gigante — mesma escala aproximada de uma parede de ~4 m
    const r = Math.min((W - 2 * M) / canvas.width, boxH / canvas.height, 0.12);
    const w = canvas.width * r, h = canvas.height * r;
    doc.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', (W - w) / 2, boxY + (boxH - h) / 2, w, h);
  }
  if (noteLines.length) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(90, 84, 76);
    doc.text(noteLines, M, H - 10 - noteH + 2.8);
  }
  doc.setDrawColor(224, 221, 214); doc.line(M, H - 8, W - M, H - 8);
  if (st.storeText) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(118, 111, 100);
    doc.text(st.storeText, M, H - 4);
    doc.setTextColor(0);
  }
  doc.setTextColor(0);
}

function ptPdfModuleList(doc, st, rows) {
  const W = 279.4, H = 215.9, M = 10;
  const cols = [
    { k: 'num', w: 12 }, { k: 'module', w: 78 }, { k: 'place', w: 30 },
    { k: 'dims', w: 62 }, { k: 'floor', w: 28 }, { k: 'colors', w: W - 2 * M - 210 }
  ];
  let y = 0;
  const header = () => {
    ptPdfPage(doc, st, null, ptT('list_title'), ptT('list_sub'), null);
    y = 36;
    doc.setFillColor(246, 240, 232); doc.rect(M, y - 4.5, W - 2 * M, 7, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
    let x = M + 1.5;
    cols.forEach((c) => { doc.text(ptT('col_' + c.k), x, y); x += c.w; });
    y += 7;
  };
  header();
  doc.setFont('helvetica', 'normal');
  rows.forEach((r, i) => {
    const colorLines = doc.splitTextToSize(r.colors || '—', cols[5].w - 2);
    const nameLines = doc.splitTextToSize(r.module, cols[1].w - 2);
    const lh = Math.max(colorLines.length, nameLines.length) * 3.7 + 2.2;
    if (y + lh > H - 14) { header(); doc.setFont('helvetica', 'normal'); }
    if (i % 2) { doc.setFillColor(250, 249, 247); doc.rect(M, y - 3.6, W - 2 * M, lh, 'F'); }
    doc.setFontSize(8.5);
    let x = M + 1.5;
    doc.setFont('helvetica', 'bold'); doc.text(String(r.num), x, y); x += cols[0].w;
    doc.setFont('helvetica', 'normal');
    doc.text(nameLines, x, y); x += cols[1].w;
    doc.text(r.place, x, y); x += cols[2].w;
    doc.text(r.dims, x, y); x += cols[3].w;
    doc.text(r.floor, x, y); x += cols[4].w;
    doc.text(colorLines, x, y);
    y += lh;
  });
}

// Logo do dealer → PNG em data URL (o jsPDF só aceita PNG/JPEG; logo
// cadastrada pode ser webp/svg). Sem logo, ou falhou baixar: null.
async function ptLoadDealerLogo() {
  try {
    const url = (typeof currentUserProfile !== 'undefined' && currentUserProfile && currentUserProfile.logo_url) || null;
    if (!url || typeof proposalUrlToDataUrl !== 'function') return null;
    const src = await proposalUrlToDataUrl(url);
    if (!src) return null;
    const img = await new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
    if (!img || !img.naturalWidth) return null;
    const k = Math.min(1, 600 / img.naturalWidth);
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return { dataUrl: c.toDataURL('image/png'), w: c.width, h: c.height };
  } catch (e) { return null; }
}

// ---------- fluxo do botão ----------
async function generateProjectTechPlan() {
  if (ptRunning) return;
  const errorEl = document.getElementById('po-proj-error');
  const fail = (msg) => { if (errorEl) { errorEl.textContent = msg; errorEl.style.display = 'block'; } else alert(msg); };
  if (errorEl) errorEl.style.display = 'none';
  if (!projectSlots || !projectSlots.some((s) => s.module && !ptIsVisualOnly(s))) { fail(ptT('empty')); return; }
  if (typeof window.jspdf === 'undefined' || typeof THREE === 'undefined') { fail(ptT('error', { msg: 'jsPDF/THREE' })); return; }

  const btn = document.getElementById('po-proj-techplan-btn');
  ptRunning = true;
  if (btn) btn.disabled = true;
  let doorsWereOpen = false, drawersWereOpen = false;
  try {
    // a cena 3D tem que estar montada e atual
    if (typeof projectViewMode !== 'undefined' && projectViewMode !== 'front' && typeof setProjectViewMode === 'function') {
      setProjectViewMode('front');
      await ptSleep(400);
    }
    const scene = projectEditScene();
    if (!scene) { fail(ptT('no_scene')); return; }
    // portas/gavetas abertas no 3D estragariam a elevação — fecha e reabre no fim
    if (ViewerProjectEdit.areDoorsOpen && ViewerProjectEdit.areDoorsOpen()) { doorsWereOpen = true; ViewerProjectEdit.toggleDoors(); }
    if (ViewerProjectEdit.areDrawersOpen && ViewerProjectEdit.areDrawersOpen()) { drawersWereOpen = true; ViewerProjectEdit.toggleDrawers(); }
    if (doorsWereOpen || drawersWereOpen) { ptStatus(ptT('closing_doors')); await ptSleep(1100); }

    const nums = ptNumberMap();
    const walls = getProjectWallGeometry();
    const wallsWithModules = walls.filter((w) => ptWallSlots(w.wallIndex).length > 0);
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
    const rawText = doc.text.bind(doc);
    doc.text = (t, ...rest) => rawText(ptPdfTxt(t), ...rest);
    const rawSplit = doc.splitTextToSize.bind(doc);
    doc.splitTextToSize = (t, ...rest) => rawSplit(ptPdfTxt(t), ...rest);
    const unit = ptUnit();
    const st = {
      pages: 0,
      projectName: (typeof loadedProjectFavorite !== 'undefined' && loadedProjectFavorite && loadedProjectFavorite.name) || ptT('untitled'),
      dateText: new Date().toLocaleDateString(),
      unitText: unit === 'mm' ? 'mm' : (unitAbbrev(unit) || unit),
      logo: await ptLoadDealerLogo(),
      storeText: (() => {
        const pf = (typeof currentUserProfile !== 'undefined' && currentUserProfile) || {};
        return [pf.store_name, pf.store_phone].filter(Boolean).join('  ·  ');
      })()
    };

    ptStatus(ptT('step_plan'));
    await ptSleep(30);
    const islandViews = ptIslandViews(scene);
    const plan = ptRenderPlan(scene, walls, nums, islandViews);
    if (plan) ptPdfPage(doc, st, plan, ptT('plan_title'), ptT('plan_sub'), ptT('notes_plan'));

    for (let i = 0; i < wallsWithModules.length; i++) {
      const w = wallsWithModules[i];
      const n = w.wallIndex + 1;
      ptStatus(ptT('step_wall', { n, i: i + 1, total: wallsWithModules.length }));
      await ptSleep(30);
      const withFronts = ptRenderWall(scene, w, nums, false);
      ptPdfPage(doc, st, withFronts, ptT('wall_title', { n }), ptT('with_fronts'), ptT('notes_wall'));
      await ptSleep(20);
      const noFronts = ptRenderWall(scene, w, nums, true);
      ptPdfPage(doc, st, noFronts, ptT('wall_title', { n }), ptT('without_fronts'), ptT('notes_wall_open'));
    }

    // módulos do chão: 1 vista por conjunto encostado, olhando pras portas
    for (let i = 0; i < islandViews.length; i++) {
      const v = islandViews[i];
      ptStatus(ptT('step_island', { n: i + 1, total: islandViews.length }));
      await ptSleep(30);
      ptPdfPage(doc, st, ptRenderWall(scene, v, nums, false), ptT('island_title', { n: i + 1 }), ptT('with_fronts'), ptT('notes_island'));
      await ptSleep(20);
      ptPdfPage(doc, st, ptRenderWall(scene, v, nums, true), ptT('island_title', { n: i + 1 }), ptT('without_fronts'), ptT('notes_wall_open'));
    }

    // lista de módulos
    const rows = [];
    const seq = (typeof projectSlotsOrderSequence === 'function') ? projectSlotsOrderSequence() : [];
    seq.forEach(({ slot, numero }) => {
      if (ptIsDecor(slot)) return;
      const colors = (slot.selectedColors || [])
        .filter((c) => c && c.color_name)
        .map((c) => (c.role_name || ptRoleName(c.role_id) || '') + ': ' + c.color_name)
        .join(' · ');
      rows.push({
        num: numero,
        module: String((slot.module && slot.module.name) || '—'),
        place: isFloorSlot(slot) ? ptT('place_island') : ptT('place_wall', { n: Number(slot.wall_index || 0) + 1 }) + (ptIsUpper(slot) ? ' · ' + ptT('upper') : ''),
        dims: ptFmt(slot.width_mm) + ' × ' + ptFmt(slot.height_mm) + ' × ' + ptFmt(slot.depth_mm),
        floor: ptFmt(slot.floor_height_mm || 0),
        colors
      });
    });
    if (rows.length) ptPdfModuleList(doc, st, rows);

    // "Página X de Y" — o total só existe no fim
    const total = st.pages;
    for (let p = 1; p <= total; p++) {
      doc.setPage(p);
      // jsPDF não substitui placeholder sozinho em texto já escrito: cobre e reescreve
      doc.setFillColor(255, 255, 255); doc.rect(200, 209, 70, 5, 'F');
      doc.setFontSize(7.5); doc.setTextColor(118, 111, 100);
      doc.text(ptT('page', { p, t: total }), 269.4, 211.9, { align: 'right' });
    }
    const safe = String(st.projectName).replace(/[^\w\-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'projeto';
    doc.save('plano-tecnico-' + safe + '.pdf');
  } catch (e) {
    console.error('[plano técnico]', e);
    fail(ptT('error', { msg: (e && e.message) || String(e) }));
  } finally {
    ptDisposeRenderer();
    try {
      if (doorsWereOpen) ViewerProjectEdit.toggleDoors();
      if (drawersWereOpen) ViewerProjectEdit.toggleDrawers();
    } catch (e) { /* ok */ }
    ptStatus(null);
    ptRunning = false;
    if (btn) btn.disabled = false;
  }
}

(function attachProjectTechPlanBtn() {
  const btn = document.getElementById('po-proj-techplan-btn');
  if (btn) btn.addEventListener('click', () => generateProjectTechPlan());
})();
