// ============================================================
// CONFERÊNCIA VISUAL POR PAREDE — foto/PDF → projeto (2026-11-01)
// ============================================================
// Matt: "são erros grandes, que ao bater o olho eu vejo. como a IA não pega
// isso? por isso eu acho que ela deve olhar parede por parede e ser mais
// fiel com essas incoerências".
//
// Depois que o projeto é montado (projectPhotoApplyState), pra cada parede
// com módulo:
//   1. desenha a ELEVAÇÃO montada (ptRenderWall do Plano Técnico — módulos
//      numerados, mesma numeração do painel);
//   2. manda pra função (stage 'check') junto com as REFERÊNCIAS do ambiente
//      (recortes das elevações do PDF / render / foto) e a lista dos módulos;
//   3. a IA devolve só diferenças grandes + operações por número
//      (move/resize/remove/extend/to_floor/swap);
//   4. as operações são aplicadas nos ITENS do estado (não nos slots) e o
//      projeto é remontado do zero com o estado corrigido — uma passada.
// Tudo aqui é best-effort: qualquer erro deixa o projeto como estava.
//
// Integração: <script> clássico, carregado antes do portal-09.

const VISUAL_CHECK_MAX_WALLS = 6;
const VISUAL_CHECK_MAX_REFS = 6;
const VISUAL_CHECK_MIN_CONFIDENCE = 0.4;

function vcT(k, vars) { return I18n.t('visual_check.' + k, vars); }

// Elevação da parede montada → { base64, mime } (jpeg). Usa o renderizador
// do Plano Técnico; devolve null se não der (sem cena, sem THREE…).
function visualCheckRenderWall(wallIndex) {
  try {
    if (typeof ptRenderWall !== 'function' || typeof projectEditScene !== 'function') return null;
    const scene = projectEditScene();
    const geo = (getProjectWallGeometry() || []).find((g) => g.wallIndex === wallIndex);
    if (!scene || !geo) return null;
    const nums = ptNumberMap();
    const canvas = ptRenderWall(scene, geo, nums, false);
    if (!canvas) return null;
    // limita a 1600 px no lado maior (payload)
    const max = 1600, sc = Math.min(1, max / Math.max(canvas.width, canvas.height));
    let c = canvas;
    if (sc < 1) {
      c = document.createElement('canvas');
      c.width = Math.round(canvas.width * sc); c.height = Math.round(canvas.height * sc);
      c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
    }
    const url = c.toDataURL('image/jpeg', 0.85);
    return { base64: url.split(',')[1], mime: 'image/jpeg' };
  } catch (e) {
    console.warn('[conferência visual] render da parede falhou:', e);
    return null;
  }
}

// Itens do estado que viraram slot nesta parede, com o número que aparece
// na elevação (ptNumberMap: slot.id → nº).
function visualCheckWallItems(st, wallIndex) {
  const nums = (typeof ptNumberMap === 'function') ? ptNumberMap() : new Map();
  return (st.items || []).filter((it) => it.include !== false && it.layer !== 'floor' && it.wall_index === wallIndex && it._slotId && nums.has(it._slotId))
    .map((it) => ({ n: nums.get(it._slotId), module_name: it.module_name, label: it.label, kind: it.kind,
      x_mm: it.x_mm, width_mm: it.width_mm, height_mm: it.height_mm, depth_mm: it.depth_mm,
      floor_height_mm: it.floor_height_mm, wall_offset_mm: it.wall_offset_mm || 0, _it: it }));
}

// Aplica as operações da IA nos itens (por nº). Devolve quantas aplicou.
function visualCheckApplyOps(ops, wallItems, wall) {
  const byN = new Map(wallItems.map((w) => [w.n, w._it]));
  const L = Number(wall.length_mm) || 0, H = Number(wall.height_mm) || 0;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  let n = 0;
  (ops || []).forEach((o) => {
    const it = byN.get(o.n); if (!it) return;
    const other = o.other_n != null ? byN.get(o.other_n) : null;
    switch (o.op) {
      case 'move':
        if (o.x_mm != null) it.x_mm = clamp(o.x_mm, 0, Math.max(0, L - it.width_mm));
        if (o.floor_height_mm != null) it.floor_height_mm = clamp(o.floor_height_mm, 0, Math.max(0, H - it.height_mm));
        if (o.wall_offset_mm != null) { it.wall_offset_mm = Math.max(0, o.wall_offset_mm); if (it.wall_offset_mm === 0 && it.layer === 'front') it.layer = 'wall'; }
        n++; break;
      case 'resize':
        if (o.width_mm != null) it.width_mm = clamp(o.width_mm, 50, L || o.width_mm);
        if (o.height_mm != null) it.height_mm = clamp(o.height_mm, 18, H || o.height_mm);
        if (o.depth_mm != null) it.depth_mm = clamp(o.depth_mm, 5, 3000);
        n++; break;
      case 'remove': it.include = false; n++; break;
      case 'to_floor': it.floor_height_mm = 0; n++; break;
      case 'extend_left': {
        const alvo = other ? other.x_mm + other.width_mm : 0;
        if (alvo < it.x_mm) { it.width_mm += it.x_mm - alvo; it.x_mm = alvo; n++; }
        break;
      }
      case 'extend_right': {
        const alvo = other ? other.x_mm : L;
        if (alvo > it.x_mm + it.width_mm) { it.width_mm = alvo - it.x_mm; n++; }
        break;
      }
      case 'swap':
        if (other) { const x = it.x_mm, f = it.floor_height_mm; it.x_mm = other.x_mm; it.floor_height_mm = other.floor_height_mm; other.x_mm = x; other.floor_height_mm = f; n++; }
        break;
      default: break;
    }
  });
  return n;
}

// Roda a conferência em todas as paredes com módulo. refs = [{base64, mime,
// label}] (recortes/pranchas/foto). Devolve { changed, report:[...] }.
// Se mudou algo, quem chamou remonta o projeto (st já está corrigido).
async function projectPhotoVisualCheck(st, refs, opts) {
  const report = [];
  const say = (opts && opts.status) || (() => {});
  const lang = (typeof I18n !== 'undefined' && typeof I18n.getLanguage === 'function') ? (I18n.getLanguage() || 'pt') : 'pt';
  const referencias = (refs || []).slice(0, VISUAL_CHECK_MAX_REFS);
  if (!referencias.length || !st || !st.room) return { changed: 0, report };
  const lessons = (typeof loadAiLessons === 'function') ? await loadAiLessons() : [];
  const lessonsPayload = lessons.map((l) => ({ title: l.title, stage: l.stage, trigger: l.trigger, how: l.how, target: l.target }));
  const paredes = st.room.walls.map((w, i) => i).filter((i) => (st.items || []).some((it) => it.include !== false && it.layer !== 'floor' && it.wall_index === i && it._slotId)).slice(0, VISUAL_CHECK_MAX_WALLS);
  let changed = 0;
  for (const wi of paredes) {
    say(vcT('status_wall', { i: wi + 1, n: st.room.walls.length }));
    const rendered = visualCheckRenderWall(wi);
    if (!rendered) continue;
    const wallItems = visualCheckWallItems(st, wi);
    if (!wallItems.length) continue;
    const wall = Object.assign({ index: wi }, st.room.walls[wi], { openings: (st.room.openings || []).filter((o) => o.wall_index === wi) });
    let res;
    try {
      res = await invokeProjectPhotoStage({
        stage: 'check', lang, lessons: lessonsPayload, rendered, references: referencias,
        wall, items: wallItems.map(({ _it, ...rest }) => rest)
      });
    } catch (err) {
      console.warn('[conferência visual] parede', wi + 1, err);
      report.push(vcT('wall_failed', { i: wi + 1, msg: err.message || String(err) }));
      continue;
    }
    console.info('[conferência visual] parede', wi + 1, res);
    if (!res || res.confidence < VISUAL_CHECK_MIN_CONFIDENCE) { report.push(vcT('wall_no_ref', { i: wi + 1 })); continue; }
    const n = visualCheckApplyOps(res.operations, wallItems, st.room.walls[wi]);
    changed += n;
    (res.differences || []).forEach((d) => report.push(vcT('diff', { i: wi + 1, msg: d })));
    (res.operations || []).forEach((o) => report.push(vcT('op', { i: wi + 1, n: o.n, op: o.op, msg: o.reason })));
    if (!res.operations || !res.operations.length) report.push(vcT('wall_ok', { i: wi + 1 }));
  }
  return { changed, report };
}
