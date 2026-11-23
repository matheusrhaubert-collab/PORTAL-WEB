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
// Estrutura de parede (tomada, cano... migration 200) é visual_only (fora do
// pedido) mas TEM que aparecer no desenho — é o que o eletricista/encanador
// usa. Só a visibilidade nas vistas muda; cotas de conjunto continuam
// ignorando (ptIsVisualOnly nos outros pontos) e número de módulo também
// (é decoração).
function ptIsDrawnStructure(slot) { return !!(slot && slot.module && slot.module.wall_structure); }
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
      let on = !!slot && (!ptIsVisualOnly(slot) || ptIsDrawnStructure(slot)) && opts.include(top, slot);
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
  const name = ptNomeDoSlot(slot).trim() || '—';
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
// mode 'fronts' (26/10, folha por módulo do pedido): o contrário — SÓ as
// portas/frentes (userData.isFrontPiece no objeto ou num pai), pra cotar
// porta e frente de gaveta. Puxador continua fora.
function ptPieceBoxesForWall(scene, wallGeo, mode) {
  const onlyFronts = mode === 'fronts';
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
    const walk = (obj, inFront) => {
      const u = obj.userData || {};
      const front = !!inFront || !!u.isFrontPiece;
      if (u.isDecorPiece) return;
      if (!onlyFronts && u.isFrontPiece) return;
      if (u.colorRoleId && (onlyFronts ? /puxador|handle|tirador/i : PT_HIDE_ROLE_RE).test(ptRoleName(u.colorRoleId))) return;
      if (u.pieceInfo) {
        if (onlyFronts && !front) return;
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
            out.push({ aMin, aMax, yMin, yMax, nMin, nMax, kind, slotId: ud.slotId });
          }
        }
        return; // a peça é a unidade — não desce nos filhos (arestas etc.)
      }
      (obj.children || []).forEach((c) => walk(c, front));
    };
    walk(g, false);
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

// ---------- COTAS INTERNAS na vista sem portas (16/11) ----------
// Pedido do Matt: "nessa vista 'sem porta' pode colocar as medidas internas,
// distância entre as peças". Por módulo, a partir das mesmas caixas do corte:
//   - VERTICAL: vão livre entre chapas horizontais seguidas (base, prateleira,
//     tampo) — face de cima de uma até a face de baixo da outra;
//   - HORIZONTAL: vão livre entre chapas verticais (laterais, divisórias).
// Só chapa de verdade conta: fina num sentido, ≥ 150 mm no outro e ≥ 100 mm
// de fundura (cabide, rodapé e fundo ficam de fora). Uma coluna de cotas por
// "baia" (conjunto diferente de chapas atravessadas), desenhada perto da
// lateral esquerda da baia pra não brigar com o nome do módulo no centro.
// Cor própria (verde) pra não confundir com as cotas externas (azul).
const PT_COLOR_DIM_IN = '#0b6e5a';
const PT_IN_MIN_GAP_MM = 40;
function ptDrawInternalDims(ctx, boxes, slots, S, fs) {
  const fi = fs * 0.72, tick = fi * 0.32, col = PT_COLOR_DIM_IN;
  const porSlot = new Map();
  boxes.forEach((b) => {
    if (b.kind !== 'cut' || b.slotId == null) return;
    if ((b.nMax - b.nMin) * 1000 < 100) return;
    const w = (b.aMax - b.aMin) * 1000, h = (b.yMax - b.yMin) * 1000;
    let tipo = null;
    if (h <= PT_THIN_MM && w >= 150) tipo = 'h';
    else if (w <= PT_THIN_MM && h >= 150) tipo = 'v';
    if (!tipo) return;
    if (!porSlot.has(b.slotId)) porSlot.set(b.slotId, { h: [], v: [] });
    porSlot.get(b.slotId)[tipo].push(b);
  });
  const cotaV = (a, y0, y1, evitaY) => {
    const p0 = S(a, y0), p1 = S(a, y1);
    const top = p0.y < p1.y ? p0 : p1, bot = p0.y < p1.y ? p1 : p0;
    const len = bot.y - top.y;
    if (len < fi * 1.1) return;
    ptLine(ctx, top, bot, col, 1.3);
    [top, bot].forEach((q) => ptLine(ctx, { x: q.x - tick, y: q.y + tick }, { x: q.x + tick, y: q.y - tick }, col, 1.8));
    const text = ptFmt((y1 - y0) * 1000);
    ctx.font = ptFont(fi);
    const tw = ctx.measureText(text).width;
    let t = 0.5;
    if (evitaY != null && Math.abs((top.y + bot.y) / 2 - evitaY) < fs * 2.6 && len > fs * 7) t = 0.2;
    const ty = top.y + len * t;
    if (tw + fi * 0.6 <= len) ptTextOnLine(ctx, text, top.x, ty, -Math.PI / 2, fi, col);
    else {
      ctx.save(); ctx.font = ptFont(fi * 0.92);
      const w2 = ctx.measureText(text).width;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillRect(top.x + fi * 0.35, ty - fi * 0.6, w2 + fi * 0.4, fi * 1.2);
      ctx.fillStyle = col; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(text, top.x + fi * 0.55, ty + 1);
      ctx.restore();
    }
  };
  const cotaH = (y, a0, a1) => {
    const p0 = S(a0, y), p1 = S(a1, y);
    const l = p0.x < p1.x ? p0 : p1, r = p0.x < p1.x ? p1 : p0;
    const len = r.x - l.x;
    const text = ptFmt((a1 - a0) * 1000);
    ctx.font = ptFont(fi);
    if (ctx.measureText(text).width + fi * 0.6 > len) return;
    ptLine(ctx, l, r, col, 1.3);
    [l, r].forEach((q) => ptLine(ctx, { x: q.x - tick, y: q.y + tick }, { x: q.x + tick, y: q.y - tick }, col, 1.8));
    ptTextOnLine(ctx, text, (l.x + r.x) / 2, l.y, 0, fi, col);
  };
  // vãos livres (m) entre chapas horizontais que atravessam a posição `a`,
  // dentro da faixa de altura [yLo, yHi]
  const vaosEm = (hz, a, yLo, yHi) => {
    const l = hz.filter((b) => b.aMin < a && b.aMax > a && b.yMax > yLo - 0.001 && b.yMin < yHi + 0.001)
      .sort((u, v) => u.yMin - v.yMin);
    const out = [];
    for (let i = 0; i < l.length - 1; i++) {
      const g0 = l[i].yMax, g1 = l[i + 1].yMin;
      if ((g1 - g0) * 1000 >= PT_IN_MIN_GAP_MM) out.push([g0, g1]);
    }
    return out;
  };
  porSlot.forEach((grp, slotId) => {
    const slot = (slots || []).find((s) => s.id === slotId);
    let evitaY = null;
    if (slot) {
      const a0 = Number(slot.x_mm || 0) / 1000, y0 = Number(slot.floor_height_mm || 0) / 1000;
      evitaY = (S(a0, y0).y + S(a0, y0 + Number(slot.height_mm || 0) / 1000).y) / 2;
    }
    // --- verticais: uma coluna por baia ---
    const vistos = new Set();
    grp.h.slice().sort((u, v) => (u.aMax - u.aMin) - (v.aMax - v.aMin)).forEach((b) => {
      const a = b.aMin + (b.aMax - b.aMin) * 0.16;
      const cruz = grp.h.map((x, i) => ((x.aMin < a && x.aMax > a) ? i : -1)).filter((i) => i >= 0);
      const sig = cruz.join(',');
      if (cruz.length < 2 || vistos.has(sig)) return;
      vistos.add(sig);
      vaosEm(grp.h, a, -Infinity, Infinity).forEach((g) => cotaV(a, g[0], g[1], evitaY));
    });
    // --- horizontais: vão entre laterais/divisórias ---
    const vistosH = new Set();
    grp.v.slice().sort((u, v) => (u.yMax - u.yMin) - (v.yMax - v.yMin)).forEach((b) => {
      const yRef = (b.yMin + b.yMax) / 2;
      const l = grp.v.filter((x) => x.yMin < yRef && x.yMax > yRef).sort((u, v) => u.aMin - v.aMin);
      for (let i = 0; i < l.length - 1; i++) {
        const g0 = l[i].aMax, g1 = l[i + 1].aMin;
        if ((g1 - g0) * 1000 < PT_IN_MIN_GAP_MM) continue;
        const yLo = Math.max(l[i].yMin, l[i + 1].yMin), yHi = Math.min(l[i].yMax, l[i + 1].yMax);
        const sig = Math.round(g0 * 1000) + ':' + Math.round(g1 * 1000);
        if (vistosH.has(sig)) continue;
        vistosH.add(sig);
        // dentro do vão livre mais alto que tenha altura pra cota
        const vs = vaosEm(grp.h, (g0 + g1) / 2, yLo, yHi).filter((g) => (g[1] - g[0]) * 1000 >= 120).sort((u, v) => v[1] - u[1]);
        const y = vs.length ? vs[0][1] - Math.min((vs[0][1] - vs[0][0]) * 0.3, 0.09) : yHi - 0.08;
        cotaH(y, g0, g1);
      }
    });
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
// Fillers/painéis do CHÃO encostados (≤ 2 cm) em algum móvel desta parede —
// entram no desenho da elevação dela (só a imagem; número e medida continuam
// na planta e na lista).
function ptFillersEncostados(scene, wallIndex) {
  const ids = new Set();
  const daParede = [], soltos = [];
  scene.updateMatrixWorld(true);
  scene.children.forEach((g) => {
    const ud = g.userData || {};
    if (ud.slotId == null) return;
    const slot = ptSlotById(ud.slotId);
    if (!slot || !slot.module || ptIsVisualOnly(slot)) return;
    const box = new THREE.Box3().setFromObject(g);
    if (box.isEmpty()) return;
    if (ud.isFloorIsland) { if (ptEhFillerOuPainel(slot)) soltos.push({ id: ud.slotId, box: box.expandByScalar(0.02) }); }
    else if (ud.wallIndex === wallIndex) daParede.push(box);
  });
  // encostado no móvel, ou num filler que já entrou (fillers em fila)
  let mudou = true;
  while (mudou) {
    mudou = false;
    soltos.forEach((f) => {
      if (ids.has(f.id)) return;
      if (daParede.some((b) => b.intersectsBox(f.box)) || soltos.some((o) => ids.has(o.id) && o.box.intersectsBox(f.box))) { ids.add(f.id); mudou = true; }
    });
  }
  return ids;
}
// Vista de Canto (perspectiva, com paredes e piso) como canvas, fundo branco.
// Sem setas de esticar nem contorno de seleção na imagem.
async function ptPerspectiveCanvas() {
  if (typeof ViewerProjectEdit === 'undefined' || !ViewerProjectEdit || typeof ViewerProjectEdit.snapshot !== 'function') return null;
  try { if (ViewerProjectEdit.setResizeArrows) ViewerProjectEdit.setResizeArrows(null); } catch (e) { /* ok */ }
  let dataUrl = null;
  try { dataUrl = ViewerProjectEdit.snapshot({ angle: 'corner' }); }
  finally { try { if (typeof refreshProject3DResizeArrows === 'function') refreshProject3DResizeArrows(); } catch (e) { /* ok */ } }
  if (!dataUrl) return null;
  const img = await new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = dataUrl; });
  if (!img || !img.width || !img.height) return null;
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0);
  return c;
}
// PERSPECTIVAS INTERNAS — câmera grande-angular DENTRO do ambiente, 2 vistas
// de cantos opostos (a 1ª do canto mais longe dos móveis; a 2ª do canto
// diagonalmente oposto). Mostra paredes, piso e todos os móveis; esconde
// cotas, setas e contornos de seleção. Devolve [canvas, canvas].
function ptInteriorViews(scene, walls) {
  scene.updateMatrixWorld(true);
  // caixas dos móveis (pra achar o centro deles e não pôr a câmera dentro de um)
  const caixas = [];
  scene.children.forEach((g) => {
    const ud = g.userData || {};
    if (ud.slotId == null) return;
    const slot = ptSlotById(ud.slotId);
    if (!slot || !slot.module || ptIsVisualOnly(slot)) return;
    const b = new THREE.Box3().setFromObject(g);
    if (!b.isEmpty()) caixas.push(b);
  });
  if (!caixas.length) return [];
  // retângulo do ambiente: pontas das paredes (+ os móveis)
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  const pt = (x, z) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); };
  (walls || []).forEach((w) => {
    pt(w.originX, w.originZ);
    pt(w.originX + w.alongDirX * w.widthM, w.originZ + w.alongDirZ * w.widthM);
  });
  caixas.forEach((b) => { pt(b.min.x, b.min.z); pt(b.max.x, b.max.z); });
  // ambiente de 1 parede só (ou paredes em linha): abre 2,8 m pra dentro
  if ((x1 - x0) < 1.5 || (z1 - z0) < 1.5) {
    (walls || []).forEach((w) => {
      const mx = w.originX + w.alongDirX * w.widthM / 2, mz = w.originZ + w.alongDirZ * w.widthM / 2;
      pt(mx + w.intoDirX * 2.8, mz + w.intoDirZ * 2.8);
    });
  }
  if (!isFinite(x0) || !isFinite(z0)) return [];
  const tetoM = Math.max(2.2, ...((walls || []).map((w) => (Number(w.ceilingMm) || 0) / 1000)),
    (((typeof roomSettings !== 'undefined' && roomSettings && roomSettings.ceiling_mm) || 2600) / 1000));
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const mcx = caixas.reduce((a, b) => a + (b.min.x + b.max.x) / 2, 0) / caixas.length;
  const mcz = caixas.reduce((a, b) => a + (b.min.z + b.max.z) / 2, 0) / caixas.length;
  const cantos = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  let longe = 0, dMax = -1;
  cantos.forEach((c, i) => { const d = Math.hypot(c[0] - mcx, c[1] - mcz); if (d > dMax) { dMax = d; longe = i; } });
  const escolhidos = [cantos[longe], cantos[(longe + 2) % 4]];
  // CÂMERA NIVELADA, NA MEIA ALTURA DOS MÓVEIS (3ª rodada, Matt com a imagem:
  // "ficou pra baixo, não consigo ver a parte de cima dos cabinets"). Antes o
  // olho ficava a 1,65 m mirando 1,15 m — olhava pra baixo e cortava o topo.
  // Agora olha RETO (alvo na mesma altura do olho), com o olho no meio da
  // altura do móvel mais alto: sobra o mesmo tanto pra cima e pra baixo, e as
  // linhas verticais ficam em pé. A abertura se ajusta pra caber do chão ao
  // topo na distância até o centro do ambiente.
  const topoM = Math.max(...caixas.map((b) => b.max.y));
  const olhoY = Math.min(Math.max(topoM / 2, 1.1), 1.6), alvoY = olhoY;
  const dentroDeMovel = (x, z) => caixas.some((b) => x > b.min.x - 0.12 && x < b.max.x + 0.12 && z > b.min.z - 0.12 && z < b.max.z + 0.12 && olhoY < b.max.y + 0.05);
  const wPx = 2000, hPx = 1250;
  const r = ptGetRenderer();
  const out = [];
  escolhidos.forEach((c) => {
    // entra 22 cm do canto e, se cair dentro de um móvel, anda pro centro até sair
    let t = Math.min(0.5, 0.22 / Math.max(Math.hypot(cx - c[0], cz - c[1]), 0.01));
    let px = c[0] + (cx - c[0]) * t, pz = c[1] + (cz - c[1]) * t;
    for (let k = 0; k < 20 && dentroDeMovel(px, pz) && t < 0.9; k++) { t += 0.05; px = c[0] + (cx - c[0]) * t; pz = c[1] + (cz - c[1]) * t; }
    const distM = Math.max(Math.hypot(cx - px, cz - pz) * 0.85, 0.5);
    const meiaAltura = Math.max(topoM - olhoY, olhoY) + 0.2;
    const fovY = Math.min(96, Math.max(70, 2 * Math.atan(meiaAltura / distM) * 180 / Math.PI));
    const cam = new THREE.PerspectiveCamera(fovY, wPx / hPx, 0.03, 80);
    cam.position.set(px, olhoY, pz);
    cam.lookAt(cx + (cx - px) * 0.15, alvoY, cz + (cz - pz) * 0.15);
    cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
    const restore = ptSaveVisibility(scene);
    let canvas = null;
    try {
      scene.children.forEach((top) => {
        if (top.isLight) return;
        const ud = top.userData || {};
        if (ud.slotId != null || ud.isMergedBaseboard) return;   // móveis/rodapé: como estão na tela
        let ambiente = false;
        top.traverse((o) => { if (o.userData && o.userData.isRoomSurface) ambiente = true; });
        if (ambiente) { top.visible = true; top.traverse((o) => { if (o.userData && o.userData.isRoomSurface) o.visible = true; }); return; }
        top.visible = false;   // cotas, setas, contorno de seleção, ajudantes
      });
      scene.background = null;
      r.setSize(wPx, hPx, false);
      r.setClearColor(0xffffff, 1);
      r.render(scene, cam);
      canvas = document.createElement('canvas');
      canvas.width = wPx; canvas.height = hPx;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, wPx, hPx);
      ctx.drawImage(r.domElement, 0, 0);
    } finally { restore(); }
    if (canvas) out.push(canvas);
  });
  return out;
}
// NOME DO MÓDULO NO PLANO QUANDO O INTERIOR FOI MUDADO NO CONSTRUTOR
// (2026-11-16, Matt: "copiei o double hanging e modifiquei pelo construtor,
// mas no plano técnico ele tá chamando de double hanging e na listagem de
// módulos também, isso pode confundir"). O módulo continua sendo o do
// catálogo; o que muda é o RÓTULO: se o interior do slot não bate mais com o
// interior de fábrica, o nome passa a descrever o que tem dentro
// ("Custom Closet · 12 shelves", "… · 1 hanging rod + 4 drawers"). Interior
// igual ao de fábrica (ou módulo sem interior) = nome do catálogo, como sempre.
const ptNomes = new Map();   // slot.id -> nome pra mostrar (preenchido em ptPreparaNomes)
function ptNomeDoSlot(slot) {
  if (slot && ptNomes.has(slot.id)) return ptNomes.get(slot.id);
  return String((slot && slot.module && slot.module.name) || '');
}
function ptAssinaturaInterior(layout, cat) {
  const a = { rods: 0, drawers: 0, shelves: 0, fronts: 0 };
  const walk = (n) => {
    if (!n) return;
    a.fronts += (n.fronts || []).length;
    if (n.content && n.content.acc) {
      const acc = cat[n.content.acc] || {};
      const p = Object.assign({}, acc.params, n.content.params || {});
      if (acc.forma === 'barra' || acc.shape_type === 'oval_rod') a.rods += 1;
      else if (/gavet|drawer/i.test(String(acc.group_name || acc.group || acc.name || ''))) a.drawers += Math.max(1, Math.round(Number(p.quantidade) || 1));
    }
    const kids = n.children || [];
    if (kids.length > 1 && n.splitAxis === 'y') a.shelves += kids.length - 1;
    kids.forEach(walk);
  };
  walk(layout);
  return a;
}
async function ptPreparaNomes() {
  ptNomes.clear();
  if (typeof loadProjectFactoryLayout !== 'function') return;
  try { if (typeof ensureAccessoryCatalog === 'function') await ensureAccessoryCatalog(); } catch (e) { /* segue */ }
  const cat = (typeof accessoryCatalogCache !== 'undefined' && accessoryCatalogCache) || (typeof projectBuilderCat !== 'undefined' && projectBuilderCat) || {};
  const plural = (n, um, varios) => n + ' ' + (n === 1 ? um : varios);
  for (const slot of (projectSlots || [])) {
    if (!slot || !slot.module || !slot.layout) continue;
    let fab = null;
    try { fab = await loadProjectFactoryLayout(slot.module.id); } catch (e) { fab = null; }
    const atual = ptAssinaturaInterior(slot.layout, cat);
    const base = fab ? ptAssinaturaInterior(fab, cat) : null;
    const igual = base && ['rods', 'drawers', 'shelves', 'fronts'].every((k) => base[k] === atual[k]);
    const vazio = !atual.rods && !atual.drawers && !atual.shelves && !atual.fronts;
    if (igual || vazio) continue;
    if (!base && !/custom closet/i.test(String(slot.module.name || ''))) continue;   // caixa montada do zero fora do closet: nome do catálogo
    const partes = [];
    if (atual.rods) partes.push(plural(atual.rods, 'hanging rod', 'hanging rods'));
    if (atual.drawers) partes.push(plural(atual.drawers, 'drawer', 'drawers'));
    if (atual.shelves && (!atual.rods || atual.shelves > atual.rods + 1)) partes.push(plural(atual.shelves, 'shelf', 'shelves'));
    if (atual.fronts) partes.push(plural(atual.fronts, 'door', 'doors'));
    if (!partes.length) continue;
    const nome = String(slot.module.name || '');
    const raiz = nome.replace(/\s*(Double Hanging|Hanging \+ Drawers|Long Hanging|Shelves|Open)\s*$/i, '').trim() || nome;
    ptNomes.set(slot.id, raiz + ' · ' + partes.join(' + '));
  }
}
function ptEhFillerOuPainel(slot) {
  const m = (slot && slot.module) || {};
  return /filler|painel|panel/i.test(String(m.name || '')) || /pain[eé]|panel/i.test(String(m.family || ''));
}
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
  // FILLER / PAINEL SOLTO NÃO GANHA VISTA (2026-11-16, Matt, com uma página
  // inteira "Ilha 4" só pra um filler em pé: "esses fillers ficam sempre
  // aparecendo e tomando muito espaço... eliminar filler dos planos técnicos
  // se eles estiverem soltos; aparecem se estiverem conectados ao móvel ou à
  // parede"). Conjunto do chão só de filler/painel que NÃO encosta em nenhum
  // móvel de verdade fica sem página de vista (e sem o rótulo "Ilha N"). Ele
  // continua na planta baixa, com número e medida, e na listagem final.
  // Filler preso na parede é módulo de parede — sai na elevação dela, como
  // sempre. Filler do chão encostado num móvel (mesmo virado pra outro lado)
  // conta como conectado e mantém a vista.
  // 2ª RODADA (mesmo dia, Matt com o PDF: "ainda aparecem os fillers no plano
  // técnico" — os 3 fillers e o painel estavam ENCOSTADOS nos closets, então a
  // 1ª regra, "só some se estiver solto", mantinha uma página pra cada um).
  // Regra final: conjunto do chão só de filler/painel NUNCA ganha página
  // própria. Encostado num móvel de parede, ele aparece na elevação DAQUELA
  // parede, junto do móvel (ptFillersEncostados, usado em ptRenderWall).
  const soltoSoFiller = (list) => list.every((it) => ptEhFillerOuPainel(it.slot));
  const views = [];
  const corner = new THREE.Vector3();
  Array.from(clusters.values()).forEach((list) => {
    if (soltoSoFiller(list)) return;
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
  const aMin = -0.12, aMax = W + 0.12, yMin = wallGeo._yMinM != null ? wallGeo._yMinM : -0.06, yMax = ceil + 0.06;
  const spanA = aMax - aMin, spanY = yMax - yMin;
  const ppm = Math.min(PT_PX_PER_M, PT_MAX_IMG_PX / Math.max(spanA, spanY));
  const wPx = Math.round(spanA * ppm), hPx = Math.round(spanY * ppm);
  const along = new THREE.Vector3(wallGeo.alongDirX, 0, wallGeo.alongDirZ);
  const into = new THREE.Vector3(wallGeo.intoDirX, 0, wallGeo.intoDirZ);
  const P = (a, y) => new THREE.Vector3(wallGeo.originX + along.x * a, y, wallGeo.originZ + along.z * a);
  const center = P((aMin + aMax) / 2, (yMin + yMax) / 2);
  const cam = ptMakeCamera(center, into, new THREE.Vector3(0, 1, 0), spanA / 2, spanY / 2);

  const fillersJunto = wallGeo._include ? null : ptFillersEncostados(scene, wallGeo.wallIndex);
  const img = ptRender(scene, cam, wPx, hPx, {
    hideFronts,
    include: wallGeo._include || ((g) => g.userData.isFloorIsland
      ? fillersJunto.has(g.userData.slotId)
      : g.userData.wallIndex === wallGeo.wallIndex),
    includeLoose: wallGeo._noLoose ? (() => false) : (o) => {
      const rel = o.position.clone().sub(P(0, 0));
      const a = rel.dot(along), n = rel.dot(into);
      return a > -0.2 && a < W + 0.2 && n > -0.05 && n < (wallGeo._depthM || 1.0);
    }
  });

  // tela composta com margem pras cotas
  const fs = Math.max(18, Math.round(Math.max(0.058 * ppm, wPx / 85)));
  const uppers = slots.filter(ptIsUpper);
  const lowers = slots.filter((s) => !ptIsUpper(s));
  const padT = Math.round(fs * (uppers.length ? 8 : 2.5));
  const padB = Math.round(fs * 11);
  const padL = Math.round(fs * (wallGeo._moduleSheet ? 9 : 5.5));
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
  if (wallGeo._wallRects) {
    // VISTA GERAL (14/10): uma parede de fundo POR PAREDE do plano, cada uma
    // com o seu pé-direito — o recorte entre elas mostra rebaixo/degrau.
    wallGeo._wallRects.forEach((r) => {
      const q0 = S(r.a0, 0), q1 = S(r.a1, r.ceil);
      const rx = Math.min(q0.x, q1.x), rw = Math.abs(q1.x - q0.x), ry = q1.y, rh = q0.y - q1.y;
      ctx.fillStyle = r.cut ? '#b9b4ac' : PT_COLOR_WALL;
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5;
      ctx.strokeRect(rx, ry, rw, rh);
      if (r.label) {
        ctx.save(); ctx.font = ptFont(fs * 0.75, true); ctx.fillStyle = '#7a746b';
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(r.label, rx + rw / 2, ry + fs * 0.35);
        ctx.restore();
      }
    });
  } else if (!wallGeo._island) {
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
  if (hideFronts) {
    const caixas = ptPieceBoxesForWall(scene, wallGeo);
    ptDrawPieces(ctx, caixas, S, fs);
    // cotas internas (vão livre entre as peças) — a folha de um módulo só já
    // tem a corrente dela e a vista lateral sobrepõe os módulos
    if (!wallGeo._moduleSheet && !wallGeo._noLabels) {
      try { ptDrawInternalDims(ctx, caixas, slots, S, fs); } catch (e) { console.warn('[plano técnico] cotas internas', e); }
    }
  }
  ptLine(ctx, { x: xL - fs, y: yFloor }, { x: xR + fs, y: yFloor }, '#222', 3);

  // rótulos dos módulos (dentro do retângulo) — a vista LATERAL não tem
  // (os módulos se sobrepõem de lado e os nomes virariam um borrão)
  if (!wallGeo._noLabels) slots.forEach((s) => {
    const a0 = Number(s.x_mm || 0) / 1000, a1 = a0 + Number(s.width_mm || 0) / 1000;
    const y0 = Number(s.floor_height_mm || 0) / 1000, y1 = y0 + Number(s.height_mm || 0) / 1000;
    const p0 = S(a0, y0), p1 = S(a1, y1);
    ptModuleLabel(ctx, { x0: Math.min(p0.x, p1.x), x1: Math.max(p0.x, p1.x), y0: Math.min(p0.y, p1.y), y1: Math.max(p0.y, p1.y) },
      s, ptIsDecor(s) ? null : nums.get(s.id), fs);
  });

  // FOLHA DE UM MÓDULO SÓ (pedido, 26/10): cotas próprias e para aqui
  if (wallGeo._moduleSheet) { ptModuleSheetDims(ctx, scene, wallGeo, S, fs, hideFronts); return out; }

  // ordena os pontos da corrente da ESQUERDA pra direita da tela
  const chainPts = (boundsMm, y) => boundsMm.map((b) => ({ b, p: S(b / 1000, y) })).sort((u, v) => u.p.x - v.p.x);
  const segVals = (arr) => arr.slice(1).map((e, i) => Math.abs(e.b - arr[i].b));

  // EMBAIXO 1: módulos de base + vãos
  const Wmm = W * 1000;
  // VISTA LATERAL (_noLabels): pontos a menos de 25 mm viram um só (painel
  // fino de 1/16" não vira cota) e as paredes cortadas entram na corrente —
  // o que interessa ali é frente dos móveis, rebaixo e parede.
  const lateral = !!wallGeo._noLabels;
  const juntar = (arr) => {
    const v = arr.slice().sort((a, b) => a - b), out = [];
    v.forEach((x) => { if (!out.length || x - out[out.length - 1] >= 25) out.push(x); });
    if (v.length && out[out.length - 1] !== v[v.length - 1]) out[out.length - 1] = v[v.length - 1];
    return out;
  };
  const paredesMm = lateral ? (wallGeo._wallRects || []).map((r) => Math.round(r.a0 * 1000)) : [];
  // painel de parede (5 cm) não define plano — só módulo com fundura real
  const fundos = (l) => l.filter((s) => Number(s.width_mm) >= 100);
  const low = chainPts(lateral ? juntar(ptBounds(fundos(lowers), Wmm).concat(paredesMm)) : ptBounds(lowers, Wmm), 0);
  let used = ptDimChain(ctx, low.map((e) => e.p), { x: 0, y: 1 }, fs * 1.6, fs, { labels: ptChainLabels(segVals(low)) });
  // EMBAIXO 2: até o centro (℄) dos eletros/decoração apoiados no piso — ou
  // só o comprimento total da parede se não houver nenhum.
  const centers = lateral ? [] : lowers.filter(ptIsDecor).map((s) => Math.round(Number(s.x_mm || 0) + Number(s.width_mm || 0) / 2));
  const cl = chainPts(Array.from(new Set([0, Math.round(Wmm)].concat(centers))).sort((a, b) => a - b), 0);
  const centerSet = new Set(centers);
  // (pula a 2ª linha quando ela só repetiria a 1ª — um módulo só ocupando tudo)
  if (centers.length || (low.length > 2 && !lateral)) used = ptDimChain(ctx, cl.map((e) => e.p), { x: 0, y: 1 }, used + fs * 1.3, fs, {
    labels: ptChainLabels(segVals(cl)),
    marks: cl.map((e) => (centerSet.has(e.b) ? '℄' : null))
  });
  // EMBAIXO 3 (só se teve ℄): total da parede
  if (centers.length || lateral) {
    const tot = chainPts([0, Math.round(Wmm)], 0);
    ptDimChain(ctx, tot.map((e) => e.p), { x: 0, y: 1 }, used + fs * 1.6, fs, { labels: [ptFmt(Wmm)] });
  }
  // EM CIMA: aéreos + vãos (corrente sobre o teto)
  if (uppers.length) {
    const up = chainPts(lateral ? juntar(ptBounds(fundos(uppers), Wmm).concat(paredesMm)) : ptBounds(uppers, Wmm), ceil);
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

// ---------- VISTA GERAL (macro) — paredes no MESMO SENTIDO (14/10) ----------
// Pedido do Matt (com o plano da SALA FABI: paredes 2, 4, 6 e 7 todas de
// frente, em degraus, com rebaixos): "quando tem paredes no mesmo sentido e
// o projeto continua no mesmo plano de vista, podendo ter rebaixos de
// parede, desníveis, entende-se que a vista deve ser uma só, com todos os
// móveis desse plano. olhar do macro, depois ir quebrando por paredes. logo
// abaixo da planta baixa, uma vista cortada no macro, de frente e talvez de
// lado dependendo se for interessante."
//
// Grupo = paredes cuja direção "pra dentro do ambiente" é a mesma (±10°),
// com pelo menos 2 PAREDES com componente (ilha virada pro mesmo lado entra
// junto, mas não conta) — com 1 parede só, a vista geral seria igual à
// página da parede. Parede só com decoração (porta/janela) entra
// no desenho quando está DENTRO do trecho do grupo (aí é contexto), nunca
// sozinha.
// A vista é uma "parede de mentira" (mesmo formato de getProjectWallGeometry,
// igual às ilhas em ptIslandViews) no plano da parede mais ao fundo, com:
//   _wallRects  um fundo cinza por parede real (cada uma no seu pé-direito)
//   _slots      cópias dos slots com x/altura medidos no 3D no eixo comum
//   _depthM     profundidade da vista (rodapé emendado entra no corte)
const PT_SAME_DIR_DOT = 0.985; // cos(10°)
function ptHasComponent(slots) { return (slots || []).some((s) => s && s.module && !ptIsDecor(s) && !ptIsVisualOnly(s)); }

function ptGroupExtents(scene, ids, along, into) {
  const corner = new THREE.Vector3();
  const ext = [];
  scene.children.forEach((g) => {
    const ud = g.userData || {};
    if (ud.slotId == null || !ids.has(ud.slotId)) return;
    const slot = ptSlotById(ud.slotId);
    if (!slot || ptIsVisualOnly(slot)) return;
    let aMin = Infinity, aMax = -Infinity, yMin = Infinity, yMax = -Infinity, nMin = Infinity, nMax = -Infinity;
    g.traverse((m) => {
      if (!m.isMesh || !m.geometry || (m.userData && m.userData.isHitboxProxy)) return;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      const bb = m.geometry.boundingBox;
      for (let k = 0; k < 8; k++) {
        corner.set(k & 1 ? bb.max.x : bb.min.x, k & 2 ? bb.max.y : bb.min.y, k & 4 ? bb.max.z : bb.min.z).applyMatrix4(m.matrixWorld);
        const a = corner.x * along.x + corner.z * along.z, n = corner.x * into.x + corner.z * into.z;
        aMin = Math.min(aMin, a); aMax = Math.max(aMax, a); yMin = Math.min(yMin, corner.y); yMax = Math.max(yMax, corner.y);
        nMin = Math.min(nMin, n); nMax = Math.max(nMax, n);
      }
    });
    if (isFinite(aMin)) ext.push({ slot, aMin, aMax, yMin, yMax, nMin, nMax });
  });
  return ext;
}

function ptMacroViews(scene, walls, islandViews) {
  scene.updateMatrixWorld(true);
  const dirOf = (w) => new THREE.Vector3(w.intoDirX, 0, w.intoDirZ).normalize();
  const unidades = []; // { kind:'wall'|'island', into, along, a0, a1, n, ids, wall?, ceil, comp }
  walls.forEach((w) => {
    const slots = ptWallSlots(w.wallIndex);
    const into = dirOf(w);
    const along = new THREE.Vector3(w.alongDirX, 0, w.alongDirZ).normalize();
    unidades.push({ kind: 'wall', w, into, along, slots, comp: ptHasComponent(slots), ids: new Set(slots.map((s) => s.id)) });
  });
  (islandViews || []).forEach((v) => {
    const slots = v._slots || [];
    unidades.push({ kind: 'island', v, into: new THREE.Vector3(v.intoDirX, 0, v.intoDirZ).normalize(),
      along: new THREE.Vector3(v.alongDirX, 0, v.alongDirZ).normalize(), slots, comp: ptHasComponent(slots), ids: v._ids || new Set() });
  });
  // agrupa por direção (só quem tem componente puxa grupo)
  const grupos = [];
  unidades.filter((u) => u.comp).forEach((u) => {
    const g = grupos.find((x) => x.into.dot(u.into) > PT_SAME_DIR_DOT);
    // eixo horizontal canônico (up × frente): esquerda→direita como quem olha de frente
    if (g) g.membros.push(u); else grupos.push({ into: u.into.clone(), along: new THREE.Vector3(u.into.z, 0, -u.into.x), membros: [u] });
  });
  const views = [];
  // vista geral só com 2+ PAREDES com móvel; ilha virada pro mesmo lado
  // entra junto, mas sozinha (ou com 1 parede) não forma vista geral
  grupos.filter((g) => g.membros.filter((u) => u.kind === 'wall').length >= 2).forEach((g) => {
    const along = g.along, into = g.into;
    // eixo comum: "along" do 1º membro; ponta de cada parede nesse eixo
    const spanOf = (u) => {
      if (u.kind === 'wall') {
        const a = u.w.originX * along.x + u.w.originZ * along.z;
        const b = a + u.w.widthM * (u.along.dot(along) >= 0 ? 1 : -1);
        return { a0: Math.min(a, b), a1: Math.max(a, b), n: u.w.originX * into.x + u.w.originZ * into.z };
      }
      return null;
    };
    let A0 = Infinity, A1 = -Infinity;
    const ids = new Set();
    g.membros.forEach((u) => { u.ids.forEach((id) => ids.add(id)); const sp = spanOf(u); if (sp) { A0 = Math.min(A0, sp.a0); A1 = Math.max(A1, sp.a1); } });
    // parede só de decoração / vazia DENTRO do trecho entra como contexto
    const paredes = g.membros.filter((u) => u.kind === 'wall');
    unidades.filter((u) => u.kind === 'wall' && !u.comp && u.into.dot(into) > PT_SAME_DIR_DOT).forEach((u) => {
      const sp = spanOf(u);
      if (sp && sp.a0 >= A0 - 0.01 && sp.a1 <= A1 + 0.01) { paredes.push(u); u.ids.forEach((id) => ids.add(id)); }
    });
    const ext = ptGroupExtents(scene, ids, along, into);
    if (!ext.length) return;
    A0 = Math.min(A0, ...ext.map((e) => e.aMin));
    A1 = Math.max(A1, ...ext.map((e) => e.aMax));
    const nParedes = paredes.map((u) => spanOf(u).n);
    const N0 = Math.min(...nParedes.concat(ext.map((e) => e.nMin)));
    const NF = Math.max(...ext.map((e) => e.nMax));
    const ceilMax = Math.max(...paredes.map((u) => ptCeilingMm(u.w)), ...ext.map((e) => Math.round(e.yMax * 1000)));
    const pseudo = ext.slice().sort((a, b) => a.aMin - b.aMin).map((e) => Object.assign({}, e.slot, {
      x_mm: Math.round((e.aMin - A0) * 1000),
      width_mm: Math.round((e.aMax - e.aMin) * 1000),
      floor_height_mm: Math.max(0, Math.round(e.yMin * 1000)),
      height_mm: Math.round((e.yMax - e.yMin) * 1000),
      _frontN: e.nMax, _backN: e.nMin
    }));
    const openings = [];
    paredes.forEach((u) => {
      const sp = spanOf(u);
      const dir = u.along.dot(along) >= 0 ? 1 : -1;
      const base = u.w.originX * along.x + u.w.originZ * along.z;
      (u.w.openings || []).forEach((o) => {
        const x0 = base + dir * Number(o.x_mm || 0) / 1000, x1 = base + dir * (Number(o.x_mm || 0) + Number(o.width_mm || 0)) / 1000;
        openings.push(Object.assign({}, o, { x_mm: Math.round((Math.min(x0, x1) - A0) * 1000) }));
      });
      sp.label = ptT('wall_label', { n: u.w.wallIndex + 1 });
      sp.ceil = ptCeilingMm(u.w) / 1000;
      u._sp = sp;
    });
    const wallRects = paredes.map((u) => ({ a0: u._sp.a0 - A0, a1: u._sp.a1 - A0, ceil: u._sp.ceil, label: u._sp.label, n: u._sp.n }))
      .sort((a, b) => a.a0 - b.a0);
    const front = {
      wallIndex: -100 - views.length,
      widthM: A1 - A0,
      originX: along.x * A0 + into.x * N0,
      originZ: along.z * A0 + into.z * N0,
      alongDirX: along.x, alongDirZ: along.z,
      intoDirX: into.x, intoDirZ: into.z,
      openings,
      _ceilMm: ceilMax,
      _slots: pseudo,
      _include: (gr) => ids.has(gr.userData.slotId),
      _depthM: (NF - N0) + 0.3,
      _wallRects: wallRects,
      _nomes: paredes.map((u) => u.w.wallIndex + 1).sort((a, b) => a - b)
    };
    // VISTA LATERAL — só quando é "interessante": paredes em profundidades
    // diferentes (rebaixo) ou frentes de móvel desalinhadas (aéreo mais raso,
    // torre mais funda…). Câmera do lado +along, olhando o perfil.
    const planos = (vals) => { const v = vals.slice().sort((a, b) => a - b); return v.length ? v[v.length - 1] - v[0] : 0; };
    let lateral = null;
    if (planos(nParedes) > 0.03 || planos(ext.map((e) => e.nMax)) > 0.03) {
      const al2 = into.clone().multiplyScalar(-1);           // horizontal da vista = profundidade
      const in2 = along.clone();                              // câmera no lado +along
      const B0 = -NF;                                         // a2 = -n; menor = frente mais saliente
      const pseudo2 = ext.map((e) => Object.assign({}, e.slot, {
        x_mm: Math.round((-e.nMax - B0) * 1000),
        width_mm: Math.round((e.nMax - e.nMin) * 1000),
        floor_height_mm: Math.max(0, Math.round(e.yMin * 1000)),
        height_mm: Math.round((e.yMax - e.yMin) * 1000)
      }));
      // cada parede do plano vira uma faixa de 10 cm (corte) na sua profundidade
      const ESP = 0.1;
      const rects2 = [];
      paredes.forEach((u) => {
        const x0 = -u._sp.n - B0;
        if (!rects2.some((r) => Math.abs(r.a0 - x0) < 0.005)) rects2.push({ a0: x0, a1: x0 + ESP, ceil: u._sp.ceil, cut: true });
      });
      lateral = {
        wallIndex: -200 - views.length,
        widthM: (NF - N0) + ESP,
        originX: al2.x * B0 + in2.x * A0,
        originZ: al2.z * B0 + in2.z * A0,
        alongDirX: al2.x, alongDirZ: al2.z,
        intoDirX: in2.x, intoDirZ: in2.z,
        openings: [],
        _ceilMm: ceilMax,
        _slots: pseudo2,
        _include: (gr) => ids.has(gr.userData.slotId),
        _depthM: (A1 - A0) + 0.3,
        _wallRects: rects2,
        _noLabels: true
      };
    }
    views.push({ front, lateral, largura: A1 - A0 });
  });
  // a maior primeiro (é ela que vai embaixo da planta)
  return views.sort((a, b) => b.largura - a.largura);
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
  // MÓDULOS DE PAREDE ENTRAM NO ENQUADRAMENTO (22/11, Matt: "no plano técnico de
  // uma parede só, ele não mostra a planta direito porque corta o chão"). Antes a
  // área da planta saía só das paredes (+ ilhas): com várias paredes elas cercam
  // os móveis, mas com UMA parede sobrava só a faixa da parede e os módulos eram
  // cortados. Agora cada módulo de parede soma a própria pegada — pela caixa real
  // do 3D (pega recuo/afastamento) e, de garantia, pela conta x/largura/profundidade.
  let temModuloDeParede = false;
  wallSlotsAll.forEach(({ s, w }) => {
    if (ptIsVisualOnly(s)) return;
    const a0 = Number(s.x_mm || 0) / 1000, a1 = a0 + Number(s.width_mm || 0) / 1000, d = Number(s.depth_mm || 0) / 1000;
    if (!(d > 0) || !(a1 > a0)) return;
    temModuloDeParede = true;
    [[a0, 0], [a1, 0], [a0, d], [a1, d]].forEach(([al, n]) => add(w.originX + w.alongDirX * al + w.intoDirX * n, w.originZ + w.alongDirZ * al + w.intoDirZ * n));
  });
  scene.children.forEach((g) => {
    if (!g.userData || !g.userData.slotId || g.userData.isFloorIsland) return;
    const slot = ptSlotById(g.userData.slotId);
    if (!slot || ptIsVisualOnly(slot) || isFloorSlot(slot)) return;
    const box = new THREE.Box3().setFromObject(g);
    if (box.isEmpty() || !isFinite(box.min.x) || !isFinite(box.max.x)) return;
    temModuloDeParede = true;
    add(box.min.x, box.min.z); add(box.max.x, box.max.z);
  });
  if (!isFinite(minX)) return null;
  const m = 0.1;
  minX -= m; maxX += m; minZ -= m; maxZ += m;
  // parede única (ou paredes em linha): um pouco de chão na frente dos móveis,
  // pra planta não terminar rente à frente do módulo
  if (temModuloDeParede && walls.length) {
    const w0 = walls[0];
    const emLinha = walls.every((w) => Math.abs(w.alongDirX * w0.alongDirX + w.alongDirZ * w0.alongDirZ) > 0.985);
    if (emLinha) {
      const f = 0.3;
      if (w0.intoDirX > 0.5) maxX += f; else if (w0.intoDirX < -0.5) minX -= f;
      if (w0.intoDirZ > 0.5) maxZ += f; else if (w0.intoDirZ < -0.5) minZ -= f;
    }
  }
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
function ptPdfPage(doc, st, canvas, title, subtitle, notes, extra) {
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
  if (canvas && extra && extra.canvas) {
    // DOIS desenhos na página (14/10): planta em cima, vista geral embaixo.
    // Cada um cabe na largura; se a soma das alturas não couber, os dois
    // encolhem na mesma proporção.
    const capT = 5;
    const r1 = Math.min((W - 2 * M) / canvas.width, 0.12);
    const r2 = Math.min((W - 2 * M) / extra.canvas.width, 0.12);
    let h1 = canvas.height * r1, h2 = extra.canvas.height * r2;
    const k = Math.min(1, (boxH - capT - 3) / (h1 + h2));
    h1 *= k; h2 *= k;
    const w1 = canvas.width * r1 * k, w2 = extra.canvas.width * r2 * k;
    const sobra = boxH - capT - 3 - h1 - h2;
    const y1 = boxY + sobra / 3;
    doc.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', (W - w1) / 2, y1, w1, h1);
    const yCap = y1 + h1 + sobra / 3 + 3;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(43, 38, 33);
    doc.text(extra.title || '', M, yCap);
    doc.setTextColor(0);
    doc.addImage(extra.canvas.toDataURL('image/jpeg', 0.9), 'JPEG', (W - w2) / 2, yCap + 2, w2, h2);
  } else if (canvas) {
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

// ÍCONE NA LISTA DE CABINETS (02/11, Matt: "quero adicionar nessa parte dos
// cabinets um ícone do lado de cada item"). Miniatura 3D do próprio módulo,
// com as medidas e cores do slot — mesma função que o pedido e a Proposta
// usam (renderProjectSlotThumbnailFallback, portal-08). Reduzida pra ~240 px
// pra o PDF não pesar. Falhou (sem WebGL etc.): linha sai sem ícone.
async function ptIconFromSlot(slot) {
  try {
    if (typeof renderProjectSlotThumbnailFallback !== 'function') return null;
    const url = await renderProjectSlotThumbnailFallback(slot, true);
    if (!url) return null;
    const img = await new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = url; });
    if (!img || !img.naturalWidth) return null;
    const k = Math.min(1, 240 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return { dataUrl: c.toDataURL('image/png'), w: c.width, h: c.height };
  } catch (e) { return null; }
}

function ptPdfModuleList(doc, st, rows) {
  const W = 279.4, H = 215.9, M = 10;
  const ICON_W = 13, ICON_H = 11; // caixa do ícone (mm), a imagem cabe dentro sem distorcer
  const cols = [
    { k: 'num', w: 10 }, { k: 'icon', w: 17 }, { k: 'module', w: 65 }, { k: 'place', w: 30 },
    { k: 'dims', w: 62 }, { k: 'floor', w: 28 }, { k: 'colors', w: W - 2 * M - 212 }
  ];
  const C = (k) => cols.find((c) => c.k === k);
  let y = 0;
  const header = () => {
    ptPdfPage(doc, st, null, ptT('list_title'), ptT('list_sub'), null);
    y = 36;
    doc.setFillColor(246, 240, 232); doc.rect(M, y - 4.5, W - 2 * M, 7, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
    let x = M + 1.5;
    cols.forEach((c) => { if (c.k !== 'icon') doc.text(ptT('col_' + c.k), x, y); x += c.w; });
    y += 7;
  };
  header();
  doc.setFont('helvetica', 'normal');
  const temIcone = rows.some((r) => r.icon);
  rows.forEach((r, i) => {
    const colorLines = doc.splitTextToSize(r.colors || '—', C('colors').w - 2);
    const nameLines = doc.splitTextToSize(r.module, C('module').w - 2);
    const lhTexto = Math.max(colorLines.length, nameLines.length) * 3.7 + 2.2;
    const lh = temIcone ? Math.max(lhTexto, ICON_H + 2.4) : lhTexto;
    if (y + lh > H - 14) { header(); doc.setFont('helvetica', 'normal'); }
    const topo = y - 3.6;
    if (i % 2) { doc.setFillColor(250, 249, 247); doc.rect(M, topo, W - 2 * M, lh, 'F'); }
    // texto centralizado na altura da linha quando o ícone é mais alto que ele
    const yTxt = y + Math.max(0, (lh - lhTexto) / 2);
    doc.setFontSize(8.5);
    let x = M + 1.5;
    doc.setFont('helvetica', 'bold'); doc.text(String(r.num), x, yTxt); x += C('num').w;
    if (r.icon && r.icon.dataUrl) {
      const k = Math.min(ICON_W / r.icon.w, ICON_H / r.icon.h);
      const iw = r.icon.w * k, ih = r.icon.h * k;
      try { doc.addImage(r.icon.dataUrl, 'PNG', x + (ICON_W - iw) / 2, topo + (lh - ih) / 2, iw, ih); } catch (e) { /* imagem ruim: segue sem ícone */ }
    }
    x += C('icon').w;
    doc.setFont('helvetica', 'normal');
    doc.text(nameLines, x, yTxt); x += C('module').w;
    doc.text(r.place, x, yTxt); x += C('place').w;
    doc.text(r.dims, x, yTxt); x += C('dims').w;
    doc.text(r.floor, x, yTxt); x += C('floor').w;
    doc.text(colorLines, x, yTxt);
    y += lh;
  });
}

// Logo do dealer → PNG em data URL (o jsPDF só aceita PNG/JPEG; logo
// cadastrada pode ser webp/svg). Sem logo, ou falhou baixar: null.
// urlOverride (26/10): PDF de pedido gerado pelo admin usa a logo do DEALER
// DONO DO PEDIDO, não a da conta logada (white label — nunca Legno).
async function ptLoadDealerLogo(urlOverride) {
  try {
    const url = urlOverride !== undefined ? urlOverride
      : ((typeof currentUserProfile !== 'undefined' && currentUserProfile && currentUserProfile.logo_url) || null);
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

// ---------- FOLHA POR MÓDULO (26/10/2026 — PDF de desenhos do pedido) ----------
// Matt: "quero todas as specs do módulo... se tem prateleira, qual altura da
// prateleira, as cotas das gavetas, porta e prateleiras". Uma "parede de
// mentira" só com o módulo (mesmo truque das ilhas), renderizada 2x:
//   com portas  → corrente embaixo/direita com a largura e altura de cada
//                 porta / frente de gaveta (medidas no 3D);
//   sem portas  → corrente na esquerda com a altura de cada prateleira/
//                 divisória horizontal a partir da BASE DO MÓDULO.
function ptModuleView(scene, slot) {
  scene.updateMatrixWorld(true);
  const g = scene.children.find((c) => c.userData && c.userData.slotId === slot.id);
  if (!g) return null;
  const front = new THREE.Vector3(); g.getWorldDirection(front); front.y = 0;
  if (front.lengthSq() < 1e-6) front.set(0, 0, 1);
  front.normalize();
  const along = new THREE.Vector3(front.z, 0, -front.x); // up × front (igual ptIslandViews)
  const corner = new THREE.Vector3();
  let aMin = Infinity, aMax = -Infinity, yMin = Infinity, yMax = -Infinity, nMin = Infinity, nMax = -Infinity;
  g.traverse((m) => {
    if (!m.isMesh || !m.geometry || !m.visible) return;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    const bb = m.geometry.boundingBox;
    for (let k = 0; k < 8; k++) {
      corner.set(k & 1 ? bb.max.x : bb.min.x, k & 2 ? bb.max.y : bb.min.y, k & 4 ? bb.max.z : bb.min.z).applyMatrix4(m.matrixWorld);
      const a = corner.x * along.x + corner.z * along.z, n = corner.x * front.x + corner.z * front.z;
      aMin = Math.min(aMin, a); aMax = Math.max(aMax, a); yMin = Math.min(yMin, corner.y); yMax = Math.max(yMax, corner.y);
      nMin = Math.min(nMin, n); nMax = Math.max(nMax, n);
    }
  });
  if (!isFinite(aMin)) return null;
  const pseudo = Object.assign({}, slot, {
    x_mm: 0,
    width_mm: Number(slot.width_mm) || Math.round((aMax - aMin) * 1000),
    floor_height_mm: Math.max(0, Math.round(yMin * 1000)),
    height_mm: Number(slot.height_mm) || Math.round((yMax - yMin) * 1000),
    depth_mm: Number(slot.depth_mm) || Math.round((nMax - nMin) * 1000)
  });
  return {
    wallIndex: -900,
    widthM: aMax - aMin,
    originX: along.x * aMin + front.x * nMin,
    originZ: along.z * aMin + front.z * nMin,
    alongDirX: along.x, alongDirZ: along.z,
    intoDirX: front.x, intoDirZ: front.z,
    openings: [],
    _island: true,
    _moduleSheet: true,
    _noLoose: true,
    _ceilMm: Math.round(yMax * 1000),
    _yMinM: yMin - 0.06,
    _depthM: (nMax - nMin) + 0.05,
    _depthOnlyM: nMax - nMin,
    _slots: [pseudo],
    _include: (gg) => gg.userData.slotId === slot.id
  };
}

// PLANTA BAIXA DO MÓDULO (26/10, Matt: "coloca mais uma 3ª vista em planta
// baixa do módulo"). Câmera de cima, frente do módulo embaixo na tela;
// cota a largura (na frente) e a profundidade (no lado direito).
function ptRenderModuleTop(scene, view, nums) {
  const W = view.widthM, D = view._depthOnlyM || Math.max(0.05, (view._depthM || 0.6) - 0.05);
  const along = new THREE.Vector3(view.alongDirX, 0, view.alongDirZ);
  const front = new THREE.Vector3(view.intoDirX, 0, view.intoDirZ);
  const yTop = (view._ceilMm || 0) / 1000;
  const P = (a, n) => new THREE.Vector3(view.originX + along.x * a + front.x * n, yTop, view.originZ + along.z * a + front.z * n);
  const pad = 0.1, spanA = W + 2 * pad, spanN = D + 2 * pad;
  const ppm = Math.min(PT_PX_PER_M, PT_MAX_IMG_PX / Math.max(spanA, spanN));
  const wPx = Math.round(spanA * ppm), hPx = Math.round(spanN * ppm);
  const cam = ptMakeCamera(P(W / 2, D / 2), new THREE.Vector3(0, 1, 0), front.clone().negate(), spanA / 2, spanN / 2);
  const img = ptRender(scene, cam, wPx, hPx, { hideFronts: false, include: view._include, includeLoose: () => false });
  const fs = Math.max(18, Math.round(Math.max(0.058 * ppm, wPx / 85)));
  const padL = Math.round(fs * 2.5), padR = Math.round(fs * 9), padT = Math.round(fs * 2.5), padB = Math.round(fs * 7);
  const out = document.createElement('canvas');
  out.width = wPx + padL + padR; out.height = hPx + padT + padB;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(img, padL, padT);
  const pr = ptProjector(cam, wPx, hPx, padL, padT);
  const S = (a, n) => { const v = P(a, n); return pr(v.x, v.y, v.z); };
  // contorno da caixa envolvente
  const c = [S(0, 0), S(W, 0), S(W, D), S(0, D)];
  ctx.save(); ctx.strokeStyle = '#5c5246'; ctx.lineWidth = 1.4; ctx.setLineDash([fs * 0.3, fs * 0.2]);
  ctx.beginPath(); ctx.moveTo(c[0].x, c[0].y); c.slice(1).forEach((q) => ctx.lineTo(q.x, q.y)); ctx.closePath(); ctx.stroke(); ctx.restore();
  // frente = aresta mais baixa na tela; lado = aresta mais à direita
  const nFront = S(0, D).y >= S(0, 0).y ? D : 0;
  const aRight = S(W, 0).x >= S(0, 0).x ? W : 0;
  ptDimChain(ctx, [S(0, nFront), S(W, nFront)].sort((u, v) => u.x - v.x), { x: 0, y: 1 }, fs * 1.6, fs, { labels: [ptFmt(W * 1000)] });
  ptDimChain(ctx, [S(aRight, 0), S(aRight, D)].sort((u, v) => u.y - v.y), { x: 1, y: 0 }, fs * 1.8, fs, { labels: [ptFmt(D * 1000)] });
  // "FRENTE" embaixo
  ctx.save(); ctx.font = ptFont(fs * 0.75, true); ctx.fillStyle = '#7a746b'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const fm = S(W / 2, nFront);
  ctx.fillText(ptT('front_label'), fm.x, fm.y + fs * 3.4);
  ctx.restore();
  return out;
}

function ptMergeMm(arr, tol) {
  const v = arr.map((x) => Math.round(x)).sort((a, b) => a - b), out = [];
  v.forEach((x) => { if (!out.length || x - out[out.length - 1] >= tol) out.push(x); });
  return out;
}

function ptModuleSheetDims(ctx, scene, wallGeo, S, fs, hideFronts) {
  const s = wallGeo._slots[0];
  const Wmm = wallGeo.widthM * 1000;
  const y0 = Number(s.floor_height_mm || 0), y1 = y0 + Number(s.height_mm || 0);
  const right = (S(wallGeo.widthM, 0).x >= S(0, 0).x) ? Wmm : 0; // ponta que fica à direita na tela
  const left = right === Wmm ? 0 : Wmm;
  const hPts = (vals, y) => vals.map((a) => ({ a, p: S(a / 1000, y / 1000) })).sort((u, v) => u.p.x - v.p.x);
  const vPts = (vals, a) => vals.map((y) => ({ y, p: S(a / 1000, y / 1000) })).sort((u, v) => u.p.y - v.p.y);
  const labs = (list, key) => ptChainLabels(list.slice(1).map((e, i) => Math.abs(e[key] - list[i][key])));
  const chainH = (vals, off) => { const l = hPts(vals, y0); return ptDimChain(ctx, l.map((e) => e.p), { x: 0, y: 1 }, off, fs, { labels: labs(l, 'a') }); };
  const chainV = (vals, a, dir, off) => { const l = vPts(vals, a); return ptDimChain(ctx, l.map((e) => e.p), { x: dir, y: 0 }, off, fs, { labels: labs(l, 'y') }); };
  let usedB = fs * 1.6, usedR = fs * 1.8;
  if (!hideFronts) {
    const fb = ptPieceBoxesForWall(scene, wallGeo, 'fronts').filter((b) => (b.aMax - b.aMin) > 0.04 && (b.yMax - b.yMin) > 0.04);
    if (fb.length) {
      const xs = ptMergeMm([0, Wmm].concat(...fb.map((b) => [b.aMin * 1000, b.aMax * 1000])).map((x) => Math.max(0, Math.min(Wmm, x))), 6);
      const ys = ptMergeMm([y0, y1].concat(...fb.map((b) => [b.yMin * 1000, b.yMax * 1000])).map((y) => Math.max(y0, Math.min(y1, y))), 6);
      if (xs.length > 2) usedB = chainH(xs, usedB) + fs * 1.2;
      if (ys.length > 2) usedR = chainV(ys, right, right === Wmm ? 1 : -1, usedR) + fs * 1.2;
    }
  } else {
    // prateleira / divisória horizontal / base / tampo: chapa fina na altura e larga
    const hz = ptPieceBoxesForWall(scene, wallGeo).filter((b) => b.kind === 'cut'
      && (b.yMax - b.yMin) * 1000 <= PT_THIN_MM && (b.aMax - b.aMin) * 1000 >= Wmm * 0.3);
    // nível = face de CIMA da chapa (onde apoia), menos a do tampo (face de baixo = vão livre)
    const lv = hz.map((b) => (b.yMax * 1000 >= y1 - 8 ? b.yMin * 1000 : b.yMax * 1000));
    const levels = ptMergeMm([y0, y1].concat(lv).filter((y) => y >= y0 - 1 && y <= y1 + 1), 10);
    // só o VÃO LIVRE ganha número (a espessura da chapa, < 25 mm, fica sem
    // rótulo — senão a corrente vira um monte de 3/4")
    if (levels.length > 2) {
      const l = vPts(levels, left);
      const lb = labs(l, 'y').map((t, i) => (Math.abs(l[i + 1].y - l[i].y) < 25 ? null : t));
      ptDimChain(ctx, l.map((e) => e.p), { x: left === 0 ? -1 : 1, y: 0 }, fs * 1.8, fs, { labels: lb });
    }
  }
  chainH([0, Wmm], usedB);
  chainV([y0, y1], right, right === Wmm ? 1 : -1, usedR);
}

// Página da folha: os 2 desenhos lado a lado + tabela de especificação.
// swatches (26/10): [{label, name, hex, dataUrl}] — a IMAGEM da cor da caixa
// e da porta (textura real do cadastro; sem textura, o swatch_hex).
// seals (26/10): [{label, text}] — selos do material (EGGER: CARB2/TSCA/ECC…;
// plywood: CARB2), largura inteira embaixo da especificação.
function ptPdfModuleSheet(doc, st, title, cWith, cWithout, specRows, swatches, seals, cTop) {
  ptPdfPage(doc, st, null, title, ptT('module_sheet_sub'), null);
  const W = 279.4, M = 10, colW = (W - 2 * M - 8) / 2, top = 37;
  const sw = (swatches || []).filter(Boolean);
  const maxH = sw.length ? 80 : 92;
  const vistas = [[cWith, ptT('with_fronts')], [cWithout, ptT('without_fronts')]].concat(cTop ? [[cTop, ptT('module_top_view')]] : []);
  const imgW = (W - 2 * M - 8 * (vistas.length - 1)) / vistas.length;
  vistas.forEach(([c, cap], i) => {
    const x0 = M + i * (imgW + 8);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(118, 111, 100);
    doc.text(cap, x0, top - 1.5);
    doc.setTextColor(0);
    if (!c) return;
    const r = Math.min(imgW / c.width, maxH / c.height, 0.16);
    const w = c.width * r, h = c.height * r;
    doc.addImage(c.toDataURL('image/jpeg', 0.9), 'JPEG', x0 + (imgW - w) / 2, top + 1, w, h);
  });
  // amostras de cor (caixa / porta) numa faixa entre os desenhos e a tabela
  let yAfter = top + maxH + 6;
  if (sw.length) {
    const sz = 15, gap = 6, yS = top + maxH + 4;
    let x = M;
    sw.forEach((c) => {
      let drew = false;
      if (c.dataUrl) { try { doc.addImage(c.dataUrl, 'JPEG', x, yS, sz, sz); drew = true; } catch (e) { /* imagem ruim: cai pro hex */ } }
      if (!drew) {
        const m = /^#?([0-9a-f]{6})$/i.exec(String(c.hex || ''));
        const n = m ? parseInt(m[1], 16) : 0xdddddd;
        doc.setFillColor((n >> 16) & 255, (n >> 8) & 255, n & 255);
        doc.rect(x, yS, sz, sz, 'F');
      }
      doc.setDrawColor(150); doc.setLineWidth(0.2); doc.rect(x, yS, sz, sz, 'S');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(118, 111, 100);
      doc.text(String(c.label || ''), x + sz + 2.5, yS + 5);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(43, 38, 33);
      const nm = doc.splitTextToSize(String(c.name || '—'), 52);
      doc.text(nm.slice(0, 2), x + sz + 2.5, yS + 10);
      x += sz + 2.5 + 56 + gap;
    });
    doc.setTextColor(0);
    yAfter = yS + sz + 7;
  }
  // especificação em 2 colunas de pares rótulo/valor
  const rows = specRows || [];
  if (!rows.length) return;
  const half = Math.ceil(rows.length / 2);
  const y0 = yAfter, lw = 38, vw = colW - lw - 2;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(110, 69, 39);
  doc.text(ptT('module_spec_title').toUpperCase(), M, y0);
  doc.setDrawColor(224, 221, 214); doc.line(M, y0 + 1.5, W - M, y0 + 1.5);
  doc.setTextColor(0);
  let yEnd = y0 + 6.5;
  [rows.slice(0, half), rows.slice(half)].forEach((col, ci) => {
    let y = y0 + 6.5;
    const x0 = M + ci * (colW + 8);
    col.forEach(([k, v], ri) => {
      doc.setFontSize(8.3);
      doc.setFont('helvetica', 'normal');
      const lines = doc.splitTextToSize(String(v == null || v === '' ? '—' : v), vw);
      // rótulo comprido ("Altura das prateleiras…") quebra na própria coluna
      // em vez de escrever por cima do valor (26/10)
      doc.setFont('helvetica', 'bold');
      const klines = doc.splitTextToSize(String(k), lw - 3);
      const h = Math.max(lines.length, klines.length) * 3.5 + 1.6;
      if (ri % 2) { doc.setFillColor(250, 249, 247); doc.rect(x0, y - 3.4, colW, h, 'F'); }
      doc.text(klines, x0 + 1.2, y);
      doc.setFont('helvetica', 'normal'); doc.text(lines, x0 + lw, y);
      y += h;
    });
    yEnd = Math.max(yEnd, y);
  });
  const sl = (seals || []).filter((x) => x && x.text);
  if (sl.length) {
    let y = yEnd + 3;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(110, 69, 39);
    doc.text(ptT('module_seals_title').toUpperCase(), M, y);
    doc.setDrawColor(224, 221, 214); doc.line(M, y + 1.3, W - M, y + 1.3);
    doc.setTextColor(0);
    y += 5.5;
    sl.forEach((x) => {
      // rótulo (papel — cor) numa linha, selos embaixo na largura toda
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.3);
      doc.text(doc.splitTextToSize(String(x.label || ''), W - 2 * M - 2).slice(0, 1), M + 1.2, y);
      doc.setFont('helvetica', 'normal');
      const lines = doc.splitTextToSize(String(x.text), W - 2 * M - 2);
      doc.text(lines, M + 1.2, y + 3.8);
      y += 3.8 + lines.length * 3.5 + 2;
    });
  }
}

// ---------- fluxo do botão ----------
// opts (26/10, PDF de desenhos do pedido — portal-31): projectName, fileName,
// moduleSpecs(numero, slot) → [[rótulo, valor]] liga a FOLHA POR MÓDULO, e
// rethrow faz o erro subir pro chamador em vez de só aparecer na aba Projetos.
// Sem opts = botão "Technical plan" de sempre, sem mudança nenhuma.
async function generateProjectTechPlan(opts) {
  opts = opts || {};
  if (ptRunning) return false;
  const errorEl = document.getElementById('po-proj-error');
  const fail = (msg) => {
    if (opts.rethrow) throw new Error(msg);
    if (errorEl) { errorEl.textContent = msg; errorEl.style.display = 'block'; } else alert(msg);
  };
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
    try { await ptPreparaNomes(); } catch (e) { console.warn('[plano técnico] nomes dos módulos', e); ptNomes.clear(); }
    const walls = getProjectWallGeometry();
    // Só parede com COMPONENTE ganha página (14/10, Matt: "colocou uma porta,
    // só uma porta. isso é desnecessário. quando está com outros móveis ok,
    // mas sozinha não precisa, nem porta nem janela").
    const wallsWithModules = walls.filter((w) => ptHasComponent(ptWallSlots(w.wallIndex)));
    const { jsPDF } = window.jspdf;
    // PDF ÚNICO DA PASTA (22/11, Matt: "quando pego plano da pasta ele deve dar
    // um pdf com todos ambientes, fazendo um índice pra não confundir"):
    // opts.combine = { sections: [] } passado de projeto em projeto. O 1º cria o
    // documento e RESERVA a página 1 pro índice; os seguintes continuam no mesmo
    // documento. Aqui não salva nem numera — quem fecha é ptFinishCombined.
    const comb = opts.combine || null;
    const reusa = !!(comb && comb.doc);
    const doc = reusa ? comb.doc : new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
    if (!reusa) {
      const rawText = doc.text.bind(doc);
      doc.text = (t, ...rest) => rawText(ptPdfTxt(t), ...rest);
      const rawSplit = doc.splitTextToSize.bind(doc);
      doc.splitTextToSize = (t, ...rest) => rawSplit(ptPdfTxt(t), ...rest);
    }
    const unit = ptUnit();
    const st = reusa ? comb.st : {
      pages: 0,
      projectName: opts.projectName || (typeof loadedProjectFavorite !== 'undefined' && loadedProjectFavorite && loadedProjectFavorite.name) || ptT('untitled'),
      dateText: new Date().toLocaleDateString(),
      unitText: unit === 'mm' ? 'mm' : (unitAbbrev(unit) || unit),
      logo: await ptLoadDealerLogo(opts.dealerProfile ? (opts.dealerProfile.logo_url || null) : undefined),
      storeText: (() => {
        const pf = opts.dealerProfile || (typeof currentUserProfile !== 'undefined' && currentUserProfile) || {};
        return [pf.store_name, pf.store_phone].filter(Boolean).join('  ·  ');
      })()
    };
    if (reusa) st.projectName = opts.projectName || (typeof loadedProjectFavorite !== 'undefined' && loadedProjectFavorite && loadedProjectFavorite.name) || ptT('untitled');
    else if (comb) { comb.doc = doc; comb.st = st; st.pages = 1; }   // página 1 = índice
    const combIni = st.pages + 1;

    // PERSPECTIVA DO AMBIENTE na 1ª página (2026-11-16, Matt, com um print da
    // Vista de Canto: "no plano técnico preciso uma imagem em perspectiva do
    // ambiente como essa foto"). É a própria Vista de Canto, enquadrada no
    // ângulo padrão do projeto (snapshot 'corner' reposiciona a câmera, tira a
    // imagem e devolve a câmera pra onde o usuário estava).
    // 2ª RODADA (mesmo dia, Matt com a 1ª página de um closet FECHADO por 4
    // paredes — a câmera de fora só via a parede: "tem como colocarmos uma
    // câmera com grande abertura de ângulo pra pegar todos os cabinets, aí
    // fazendo de um lado e de outro lado... em perspectiva"). Agora são 2
    // imagens de DENTRO do ambiente, grande-angular, de cantos opostos
    // (ptInteriorViews). Se não der pra montar, cai na vista de fora de antes.
    // ACERVO (23/11, Matt: "quero que busque os prints para primeira folha da
    // proposta ou plano técnico"): imagens marcadas como capa (★) ou, sem
    // nenhuma marcada, os prints do projeto abrem o plano. Só quando o projeto
    // não tem nenhuma é que entram as perspectivas automáticas de sempre.
    try {
      let feitas = 0;
      try {
        const capas = (window.LegnoAcervo && window.LegnoAcervo.capasCanvas) ? await window.LegnoAcervo.capasCanvas() : [];
        capas.forEach((c, i) => {
          ptPdfPage(doc, st, c, ptT('persp_title'), ptT('persp_view', { n: i + 1, total: capas.length }), '');
          feitas++;
        });
      } catch (e) { console.warn('[plano técnico] imagens do acervo', e); }
      let internas = [];
      if (!feitas) try { internas = ptInteriorViews(scene, walls); } catch (e) { console.warn('[plano técnico] perspectiva interna', e); internas = []; }
      internas.forEach((c, i) => {
        if (!c) return;
        ptPdfPage(doc, st, c, ptT('persp_title'), ptT('persp_view', { n: i + 1, total: internas.length }), ptT('notes_persp'));
        feitas++;
      });
      if (!feitas) {
        const persp = await ptPerspectiveCanvas();
        if (persp) ptPdfPage(doc, st, persp, ptT('persp_title'), ptT('persp_sub'), ptT('notes_persp'));
      }
    } catch (e) { console.warn('[plano técnico] perspectiva', e); }

    ptStatus(ptT('step_plan'));
    await ptSleep(30);
    const islandViews = ptIslandViews(scene);
    const plan = ptRenderPlan(scene, walls, nums, islandViews);
    // VISTA GERAL (macro): a maior vai na MESMA página, logo abaixo da planta;
    // em seguida a mesma vista em corte (sem portas) e, se houver
    // profundidades diferentes, a lateral. Depois, parede por parede.
    let macros = [];
    try { macros = ptMacroViews(scene, walls, islandViews); } catch (e) { console.warn('[plano técnico] vista geral', e); macros = []; }
    const macroTitulo = (m) => ptT('macro_title', { walls: m.front._nomes.join(', ') });
    let macroFront0 = null;
    if (macros.length) {
      ptStatus(ptT('step_macro'));
      await ptSleep(30);
      macroFront0 = ptRenderWall(scene, macros[0].front, nums, false);
    }
    if (plan) ptPdfPage(doc, st, plan, ptT('plan_title'), ptT('plan_sub'),
      ptT('notes_plan') + (macroFront0 ? ' ' + ptT('notes_macro') : ''),
      macroFront0 ? { canvas: macroFront0, title: macroTitulo(macros[0]) + ' — ' + ptT('with_fronts') } : null);
    for (let i = 0; i < macros.length; i++) {
      const m = macros[i];
      await ptSleep(20);
      if (i > 0) ptPdfPage(doc, st, ptRenderWall(scene, m.front, nums, false), macroTitulo(m), ptT('with_fronts'), ptT('notes_macro'));
      await ptSleep(20);
      ptPdfPage(doc, st, ptRenderWall(scene, m.front, nums, true), macroTitulo(m), ptT('macro_cut_sub'), ptT('notes_wall_open'));
      if (m.lateral) {
        await ptSleep(20);
        ptPdfPage(doc, st, ptRenderWall(scene, m.lateral, nums, false), ptT('side_title', { walls: m.front._nomes.join(', ') }), ptT('side_sub'), ptT('notes_side'));
      }
    }

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
    // ilha só de decoração (porta/janela/eletro solto) não ganha página
    const islandPages = islandViews.filter((v) => ptHasComponent(v._slots));
    for (let i = 0; i < islandPages.length; i++) {
      const v = islandPages[i];
      ptStatus(ptT('step_island', { n: i + 1, total: islandPages.length }));
      await ptSleep(30);
      ptPdfPage(doc, st, ptRenderWall(scene, v, nums, false), ptT('island_title', { n: i + 1 }), ptT('with_fronts'), ptT('notes_island'));
      await ptSleep(20);
      ptPdfPage(doc, st, ptRenderWall(scene, v, nums, true), ptT('island_title', { n: i + 1 }), ptT('without_fronts'), ptT('notes_wall_open'));
    }

    const seq = (typeof projectSlotsOrderSequence === 'function') ? projectSlotsOrderSequence() : [];
    // FOLHA POR MÓDULO (só quando o chamador pede — PDF do pedido)
    if (typeof opts.moduleSpecs === 'function') {
      const lista = seq.filter(({ slot }) => !ptIsDecor(slot) && !ptIsVisualOnly(slot));
      for (let i = 0; i < lista.length; i++) {
        const { slot, numero } = lista[i];
        ptStatus(ptT('step_module', { n: i + 1, total: lista.length }));
        await ptSleep(20);
        const view = ptModuleView(scene, slot);
        const cWith = view ? ptRenderWall(scene, view, nums, false) : null;
        await ptSleep(10);
        const cWithout = view ? ptRenderWall(scene, view, nums, true) : null;
        await ptSleep(10);
        let cTop = null;
        try { cTop = view ? ptRenderModuleTop(scene, view, nums) : null; } catch (e) { console.warn('[plano técnico] planta do módulo', e); }
        const spec = opts.moduleSpecs(numero, slot);
        ptPdfModuleSheet(doc, st, ptT('module_sheet_title', { n: String(numero).padStart(3, '0'), name: ptNomeDoSlot(slot) }),
          cWith, cWithout, Array.isArray(spec) ? spec : (spec && spec.rows), spec && spec.swatches, spec && spec.seals, cTop);
      }
    }

    // lista de módulos
    const rows = [];
    seq.forEach(({ slot, numero }) => {
      if (ptIsDecor(slot)) return;
      const usadas = (typeof orderItemVisibleColors === 'function')
        ? orderItemVisibleColors({ selected_colors: slot.selectedColors, breakdown: slot.result && slot.result.breakdown })
        : (slot.selectedColors || []);
      const colors = usadas
        .filter((c) => c && c.color_name)
        .map((c) => (typeof I18n !== 'undefined' && I18n.role ? I18n.role(c.role_name || ptRoleName(c.role_id) || '') : (c.role_name || ptRoleName(c.role_id) || '')) + ': ' + c.color_name)
        .join(' · ');
      rows.push({
        num: numero,
        module: ptNomeDoSlot(slot) || '—',
        place: isFloorSlot(slot) ? ptT('place_island') : ptT('place_wall', { n: Number(slot.wall_index || 0) + 1 }) + (ptIsUpper(slot) ? ' · ' + ptT('upper') : ''),
        dims: ptFmt(slot.width_mm) + ' × ' + ptFmt(slot.height_mm) + ' × ' + ptFmt(slot.depth_mm),
        floor: ptFmt(slot.floor_height_mm || 0),
        colors,
        slot
      });
    });
    // ícone de cada linha (02/11) — um render por módulo, em sequência
    // (o viewer escondido é um só e não aguenta renders em paralelo)
    for (const r of rows) r.icon = await ptIconFromSlot(r.slot);
    if (rows.length) ptPdfModuleList(doc, st, rows);

    if (comb) {
      if (st.pages >= combIni) comb.sections.push({ name: st.projectName, from: combIni, to: st.pages, modules: rows.length });
      return true;
    }

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
    const nomeArq = opts.fileName || ('plano-tecnico-' + safe + '.pdf');
    doc.save(nomeArq);
    // guarda nos Documentos do projeto (portal-41) — o novo troca o anterior.
    // Só o plano gerado do PROJETO salvo; o do pedido (opts.fileName) não.
    try {
      const fav = (typeof loadedProjectFavorite !== 'undefined') ? loadedProjectFavorite : null;
      if (!opts.fileName && fav && fav.id && typeof docGuardarPdf === 'function') {
        docGuardarPdf(doc, { kind: 'tech_plan', name: nomeArq, project_id: fav.id, folder: fav.client_folder || null });
      }
    } catch (e) { /* só conveniência */ }
    return true;
  } catch (e) {
    console.error('[plano técnico]', e);
    if (opts.rethrow) throw e;
    fail(ptT('error', { msg: (e && e.message) || String(e) }));
    return false;
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

// FECHA O PDF ÚNICO DA PASTA: desenha o ÍNDICE na página 1 (reservada pelo 1º
// projeto), numera todas as páginas, baixa e guarda nos Documentos da pasta.
// comb = o mesmo objeto passado em opts.combine; info = { folder, fileName }.
function ptFinishCombined(comb, info) {
  if (!comb || !comb.doc || !comb.sections || !comb.sections.length) return false;
  info = info || {};
  const doc = comb.doc, st = comb.st;
  const W = 279.4, H = 215.9, M = 10;
  const idx = { pt: ['Índice', 'Ambiente / projeto', 'Módulos', 'Páginas', 'Pasta'], en: ['Index', 'Room / project', 'Modules', 'Pages', 'Folder'], es: ['Índice', 'Ambiente / proyecto', 'Módulos', 'Páginas', 'Carpeta'] };
  let lang = 'en';
  try { lang = (typeof I18n !== 'undefined' && I18n.getLanguage) ? I18n.getLanguage() : 'en'; } catch (e) { /* en */ }
  const L = idx[lang] || idx.en;
  doc.setPage(1);
  doc.setFillColor(43, 38, 33); doc.rect(0, 0, W, 16, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
  doc.text(ptT('title') + (info.folder ? ' — ' + info.folder : ''), M, 10.5);
  let dateRight = W - M;
  if (st.logo) {
    const r = Math.min(42 / st.logo.w, 10.5 / st.logo.h); const lw = st.logo.w * r, lh = st.logo.h * r; const boxW = lw + 4;
    doc.setFillColor(255, 255, 255); doc.roundedRect(W - M - boxW, 2.2, boxW, 11.6, 1.5, 1.5, 'F');
    try { doc.addImage(st.logo.dataUrl, 'PNG', W - M - boxW + 2, 2.2 + (11.6 - lh) / 2, lw, lh); } catch (e) { /* segue sem */ }
    dateRight = W - M - boxW - 4;
  }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(255, 255, 255);
  doc.text(st.dateText + '   ·   ' + ptT('units', { u: st.unitText }), dateRight, 10.5, { align: 'right' });
  doc.setTextColor(43, 38, 33); doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
  doc.text(L[0], M, 28);
  if (info.folder) { doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(118, 111, 100); doc.text(L[4] + ': ' + info.folder, M, 34); }
  const n = comb.sections.length;
  const passo = Math.max(4.6, Math.min(9, (H - 62) / Math.max(1, n)));   // cabe até ~33 ambientes numa página
  const fsz = Math.max(8, Math.min(12, passo * 1.35));
  let y = 46;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(118, 111, 100);
  doc.text('#', M, y); doc.text(L[1], M + 12, y); doc.text(L[2], W - M - 52, y, { align: 'right' }); doc.text(L[3], W - M, y, { align: 'right' });
  doc.setDrawColor(200, 195, 186); doc.setLineWidth(0.3); doc.line(M, y + 2, W - M, y + 2);
  y += passo + 1;
  comb.sections.forEach((sec, i) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(fsz); doc.setTextColor(43, 38, 33);
    doc.text(String(i + 1).padStart(2, '0'), M, y);
    const nome = doc.splitTextToSize(String(sec.name || '—'), W - 2 * M - 80)[0] || '—';
    doc.text(nome, M + 12, y);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(90, 84, 75);
    doc.text(String(sec.modules || 0), W - M - 52, y, { align: 'right' });
    doc.setFont('helvetica', 'bold'); doc.setTextColor(43, 38, 33);
    doc.text(sec.from === sec.to ? String(sec.from) : sec.from + ' – ' + sec.to, W - M, y, { align: 'right' });
    doc.setDrawColor(232, 228, 221); doc.setLineWidth(0.2); doc.line(M, y + passo * 0.32, W - M, y + passo * 0.32);
    try { doc.link(M, y - passo * 0.7, W - 2 * M, passo, { pageNumber: sec.from }); } catch (e) { /* sem link: só o número */ }
    y += passo;
  });
  if (st.storeText) { doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(118, 111, 100); doc.text(st.storeText, M, 211.9); }
  const total = st.pages;
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFillColor(255, 255, 255); doc.rect(200, 209, 70, 5, 'F');
    doc.setFontSize(7.5); doc.setTextColor(118, 111, 100); doc.setFont('helvetica', 'normal');
    doc.text(ptT('page', { p, t: total }), 269.4, 211.9, { align: 'right' });
  }
  const safe = String(info.folder || 'pasta').replace(/[^\w\-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'pasta';
  const nomeArq = info.fileName || ('plano-tecnico-' + safe + '.pdf');
  doc.save(nomeArq);
  try { if (info.folder && typeof docGuardarPdf === 'function') docGuardarPdf(doc, { kind: 'tech_plan', name: nomeArq, folder: info.folder }); } catch (e) { /* só conveniência */ }
  return true;
}

// DESENHOS PRA PROPOSTA (17/11, Matt: "na proposta quero tirar essas cotas
// todas aqui com esses quadrados estranhos e colocar o mesmo do plano
// técnico"). Mesmos desenhos do plano técnico, só a parte que o cliente
// final precisa: planta (+ vista geral) e cada parede/ilha COM portas. Não
// gera PDF — devolve as imagens pra Proposta (portal-10) montar as páginas.
// Precisa da cena 3D do projeto aberto; sem ela devolve [] e a Proposta cai
// no desenho antigo.
async function ptProposalDrawings() {
  if (ptRunning) return [];
  if (typeof THREE === 'undefined' || !projectSlots || !projectSlots.some((s) => s.module && !ptIsVisualOnly(s))) return [];
  ptRunning = true;
  let doorsWereOpen = false, drawersWereOpen = false;
  const out = [];
  const add = (canvas, title, sub) => {
    if (!canvas || !canvas.width || !canvas.height) return;
    out.push({ dataUrl: canvas.toDataURL('image/jpeg', 0.9), w: canvas.width, h: canvas.height, title, sub: sub || '' });
  };
  try {
    if (typeof projectViewMode !== 'undefined' && projectViewMode !== 'front' && typeof setProjectViewMode === 'function') {
      setProjectViewMode('front');
      await ptSleep(400);
    }
    const scene = projectEditScene();
    if (!scene) return [];
    if (ViewerProjectEdit.areDoorsOpen && ViewerProjectEdit.areDoorsOpen()) { doorsWereOpen = true; ViewerProjectEdit.toggleDoors(); }
    if (ViewerProjectEdit.areDrawersOpen && ViewerProjectEdit.areDrawersOpen()) { drawersWereOpen = true; ViewerProjectEdit.toggleDrawers(); }
    if (doorsWereOpen || drawersWereOpen) await ptSleep(1100);
    const nums = ptNumberMap();
    try { await ptPreparaNomes(); } catch (e) { ptNomes.clear(); }
    const walls = getProjectWallGeometry();
    const islandViews = ptIslandViews(scene);
    await ptSleep(20);
    add(ptRenderPlan(scene, walls, nums, islandViews), ptT('plan_title'), ptT('plan_sub'));
    let macros = [];
    try { macros = ptMacroViews(scene, walls, islandViews); } catch (e) { macros = []; }
    for (const m of macros) {
      await ptSleep(20);
      add(ptRenderWall(scene, m.front, nums, false), ptT('macro_title', { walls: m.front._nomes.join(', ') }), ptT('with_fronts'));
    }
    const wallsWithModules = walls.filter((w) => ptHasComponent(ptWallSlots(w.wallIndex)));
    for (const w of wallsWithModules) {
      await ptSleep(20);
      add(ptRenderWall(scene, w, nums, false), ptT('wall_title', { n: w.wallIndex + 1 }), ptT('with_fronts'));
    }
    const islandPages = islandViews.filter((v) => ptHasComponent(v._slots));
    for (let i = 0; i < islandPages.length; i++) {
      await ptSleep(20);
      add(ptRenderWall(scene, islandPages[i], nums, false), ptT('island_title', { n: i + 1 }), ptT('with_fronts'));
    }
    return out;
  } catch (e) {
    console.warn('[proposta] desenhos do plano técnico', e);
    return [];
  } finally {
    ptDisposeRenderer();
    try {
      if (doorsWereOpen) ViewerProjectEdit.toggleDoors();
      if (drawersWereOpen) ViewerProjectEdit.toggleDrawers();
    } catch (e) { /* ok */ }
    ptRunning = false;
  }
}

(function attachProjectTechPlanBtn() {
  const btn = document.getElementById('po-proj-techplan-btn');
  if (btn) btn.addEventListener('click', () => generateProjectTechPlan());
})();
