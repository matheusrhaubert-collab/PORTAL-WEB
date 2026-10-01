// ============================================================
// Projeto a partir de FOTO — aba Projetos
// ============================================================
// v1 (2026-09-24): uma parede só, IA escolhia módulo direto da foto.
// v2 (2026-10-01): "fidelidade máxima" — pedido do Matt: "vamos buscar a
// fidelidade máxima do projeto diante da foto. Passos primordiais:
//   1. identificar onde tem paredes, janelas, portas, aberturas, ângulos,
//      com medidas, altura;
//   2. depois os volumes de móveis, o que tem atrás, na frente, solto no
//      piso".
//
// Fluxo (um clique só pro usuário — "tudo de uma vez", decisão de 01/10):
//   [Ler a foto] →
//     etapa 1  generate-project-from-photo stage='read'  (visão; Pro ou
//              Flash, seletor "Precisão máxima" no modal): AMBIENTE (paredes
//              em sequência com comprimento/altura/ângulo interno + aberturas
//              por parede) e VOLUMES (parede, camada parede/frente/piso, x,
//              medidas, altura do chão, portas, gavetas, cor descrita).
//     etapa 2  stage='match' (Flash): volume → módulo REAL do catálogo +
//              cor do cadastro. Sem módulo equivalente → "não reproduzido".
//   → REVISÃO: elevação de cada parede (SVG, aberturas + módulos numerados),
//     planta, tabelas editáveis de paredes e aberturas, checkbox por módulo.
//   [Criar no projeto] →
//     - paredes viram projectWallSegments (contorno com os ângulos lidos,
//       aberturas dentro de cada segmento — 3D recorta o vão, ver
//       makeWallPrism em viewer3d_composition.js);
//     - módulos de parede: insertProjectModuleDefault na parede certa;
//       camada "frente" = afastado da parede (fineOffsetZMm);
//     - piso (ilha/mesa): placement='floor', centro calculado a partir da
//       parede de referência + distância + giro.
//
// Divisão de responsabilidade (mesma regra do Gerador por IA, não afrouxar):
// a IA só PROPÕE. Quem cria o slot é o motor de sempre — preço real, cor por
// papel, clamp de posição. Módulo gerado por foto é indistinguível de um
// posto na mão.
//
// Integração: <script> clássico entre portal-08 e portal-09 (boot).

let projectPhotoImage = null;      // { base64, mime, width, height, dataUrl }
let projectPhotoRunning = false;
let projectPhotoState = null;      // { room, items, unmatched, warnings, notes, models }

// Foto maior que na v1 (1280): medir exige detalhe. 1600px JPEG ~ 300-500KB.
const PROJECT_PHOTO_MAX_SIDE_PX = 1600;
const PROJECT_PHOTO_JPEG_QUALITY = 0.9;
const PROJECT_PHOTO_QUALITY_KEY = 'legno_photo_quality';

function tPhoto(key, vars) { return I18n.t('project_photo.' + key, vars); }

// ---------- Catálogo compacto e cores ----------
async function buildProjectPhotoCatalog() {
  const [fam, cat, sub] = await Promise.all([
    supabaseClient.from('families').select('id,name'),
    supabaseClient.from('categories').select('id,name'),
    supabaseClient.from('subcategories').select('id,name')
  ]);
  const nameOf = (res) => Object.fromEntries(((res && res.data) || []).map((x) => [x.id, x.name]));
  const F = nameOf(fam), C = nameOf(cat), S = nameOf(sub);
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
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
      w: [num(m.width_min_mm), num(m.width_default_mm), num(m.width_max_mm)],
      h: [num(m.height_min_mm), num(m.height_default_mm), num(m.height_max_mm)],
      d: [num(m.depth_min_mm), num(m.depth_default_mm), num(m.depth_max_mm)]
    }));
}

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
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(tPhoto('err_image_read'))); };
    img.src = url;
  });
}

// ---------- Unidade ----------
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
  const frac = s.match(/^(\d+(?:\.\d+)?)\s+(\d+)\/(\d+)$/);
  const n = frac ? Number(frac[1]) + Number(frac[2]) / Number(frac[3]) : Number(s);
  if (!Number.isFinite(n)) return NaN;
  return unit === 'in' ? n * 25.4 : n;
}

function escapeHtmlPhoto(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function clampNum(v, min, max) {
  let n = Number(v);
  if (!Number.isFinite(n)) n = Number.isFinite(min) ? min : 0;
  if (Number.isFinite(min)) n = Math.max(n, min);
  if (Number.isFinite(max)) n = Math.min(n, max);
  return n;
}

// ============================================================
// GEOMETRIA PURA (sem DOM) — testável isolada
// ============================================================

// Paredes lidas (esquerda→direita na foto, ângulo INTERNO até a próxima) →
// segmentos do projeto {id, ax, az, bx, bz, thicknessMm, ceilingMm,
// inverterLado, openings}.
//
// Convenção (a mesma do 3D): parede principal corre em +X e o ambiente fica
// em +Z (intoDir (0,1)). Andando pelas paredes por dentro, da esquerda pra
// direita, um canto côncavo (ângulo interno α<180) gira a direção por
// τ = 180−α no sentido (dx,dz)→(−dz,dx); quina saliente (α>180) gira pro
// outro lado (τ negativo). O lado de dentro de cada parede é sempre
// (−dz, dx) — e como projectWallSegmentGeometry decide "dentro" pelo centro
// do ambiente, aqui se calcula a mesma conta e liga inverterLado quando ela
// discordaria (pilar/quina saliente).
//
// mainIndex: a parede que vira o eixo X (a de mais marcenaria) — o
// contorno inteiro gira pra ela ficar "de frente", e é centrado na origem.
function projectPhotoWallsToSegments(walls, openings, ceilingMm, mainIndex) {
  const n = walls.length;
  if (!n) return [];
  const pts = [{ x: 0, z: 0 }];
  const dirs = [];
  let dx = 1, dz = 0;
  for (let i = 0; i < n; i++) {
    const L = Number(walls[i].length_mm) || 1000;
    dirs.push({ x: dx, z: dz });
    const p = pts[pts.length - 1];
    pts.push({ x: p.x + dx * L, z: p.z + dz * L });
    if (i < n - 1) {
      const tau = (180 - (Number(walls[i].angle_to_next_deg) || 90)) * Math.PI / 180;
      const c = Math.cos(tau), s = Math.sin(tau);
      const ndx = dx * c - dz * s, ndz = dx * s + dz * c;
      dx = ndx; dz = ndz;
    }
  }
  // gira pra parede principal ficar em +X
  const mi = Math.min(Math.max(Number(mainIndex) || 0, 0), n - 1);
  const ang = -Math.atan2(dirs[mi].z, dirs[mi].x);
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const rot = (p) => ({ x: p.x * ca - p.z * sa, z: p.x * sa + p.z * ca });
  let P = pts.map(rot);
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  P.forEach((p) => { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); });
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  P = P.map((p) => ({ x: Math.round((p.x - cx) * 100) / 100, z: Math.round((p.z - cz) * 100) / 100 }));

  // centro como o portal calcula (média das pontas de todos os segmentos)
  let sx = 0, sz = 0;
  for (let i = 0; i < n; i++) { sx += P[i].x + P[i + 1].x; sz += P[i].z + P[i + 1].z; }
  const centro = { x: sx / (2 * n), z: sz / (2 * n) };

  const segs = [];
  for (let i = 0; i < n; i++) {
    const a = P[i], b = P[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const ux = (b.x - a.x) / len, uz = (b.z - a.z) / len;
    const ix = -uz, iz = ux; // normal "à direita" = o que o portal usa como padrão
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
    const portalViraria = ((centro.x - mx) * ix + (centro.z - mz) * iz) < -1e-6;
    // nosso "dentro" é sempre (−dz, dx) = (ix, iz); se o portal fosse virar, desvira.
    const hMm = Number(walls[i].height_mm) || ceilingMm;
    segs.push({
      id: 'wseg_' + Date.now().toString(36) + '_' + i + Math.random().toString(36).slice(2, 5),
      ax: a.x, az: a.z, bx: b.x, bz: b.z,
      thicknessMm: 150,
      ceilingMm: Math.abs(hMm - ceilingMm) > 5 ? Math.round(hMm) : null,
      oculta: false,
      inverterLado: portalViraria,
      openings: (openings || []).filter((o) => o.wall_index === i).map((o, k) => ({
        id: 'op_' + i + '_' + k + '_' + Math.random().toString(36).slice(2, 6),
        type: o.type, x_mm: Math.round(o.x_mm), width_mm: Math.round(o.width_mm),
        height_mm: Math.round(o.height_mm), sill_mm: Math.round(o.sill_mm)
      }))
    });
  }
  return segs;
}

// Parede "principal": a que tem mais largura de marcenaria encostada.
function projectPhotoMainWallIndex(room) {
  const soma = room.walls.map(() => 0);
  room.volumes.forEach((v) => { if (v.layer !== 'floor' && soma[v.wall_index] != null) soma[v.wall_index] += v.width_mm; });
  let best = 0;
  soma.forEach((s, i) => { if (s > soma[best] + 1e-6) best = i; });
  return best;
}

// Cantos: em L/U, a corrida de uma parede vai até o canto e a da próxima
// começa depois da profundidade dela. Se a IA sobrepôs, empurra o módulo da
// parede SEGUINTE pra fora do canto (só cantos 60–120°).
function projectPhotoFixCorners(items, walls, warnings) {
  for (let i = 0; i < walls.length - 1; i++) {
    const ang = Number(walls[i].angle_to_next_deg);
    if (!(ang >= 60 && ang <= 120)) continue;
    const Li = walls[i].length_mm;
    const noFim = items.filter((it) => it.layer !== 'floor' && it.wall_index === i && it.x_mm + it.width_mm >= Li - 30);
    items.filter((it) => it.layer !== 'floor' && it.wall_index === i + 1).forEach((it) => {
      let need = 0;
      noFim.forEach((o) => {
        const sobrepoeAltura = it.floor_height_mm < o.floor_height_mm + o.height_mm && o.floor_height_mm < it.floor_height_mm + it.height_mm;
        if (sobrepoeAltura) need = Math.max(need, (o.wall_offset_mm || 0) + o.depth_mm);
      });
      if (need > 0 && it.x_mm < need - 1) {
        const novo = Math.round(need);
        if (novo + it.width_mm <= walls[i + 1].length_mm + 1) {
          warnings.push(tPhoto('warn_corner_shift', { label: it.label, mm: novo }));
          it.x_mm = novo;
          it._empurrado = true;
        } else {
          warnings.push(tPhoto('warn_corner_conflict', { label: it.label }));
        }
      }
    });
    // Empurrar o 1º módulo da corrida não pode fazê-lo invadir o vizinho:
    // a corrida inteira anda junto (mesma faixa de altura), em cascata.
    const daParede = items.filter((it) => it.layer !== 'floor' && it.wall_index === i + 1).sort((a, b) => a.x_mm - b.x_mm);
    daParede.forEach((a) => {
      if (!a._empurrado) return;
      daParede.forEach((b) => {
        if (b === a || b.x_mm < a.x_mm) return;
        const mesmaFaixa = b.floor_height_mm < a.floor_height_mm + a.height_mm && a.floor_height_mm < b.floor_height_mm + b.height_mm;
        const fimA = a.x_mm + a.width_mm;
        if (mesmaFaixa && b.x_mm < fimA - 1) {
          if (fimA + b.width_mm <= walls[i + 1].length_mm + 1) { b.x_mm = Math.round(fimA); b._empurrado = true; }
          else warnings.push(tPhoto('warn_corner_conflict', { label: b.label }));
        }
      });
    });
    daParede.forEach((it) => { delete it._empurrado; });
  }
}

// MÓDULO DE CANTO (2026-10-01, Matt: "canto 45 graus entrou virado" /
// "canto inferior com duas portas deve ser o canto 90°, ~36×36 pol, e depois
// os módulos ao lado dele").
//
// Os módulos de canto do catálogo (Base Canto 90°, Aéreo Canto 45°) são
// desenhados pra encostar no FUNDO e na ESQUERDA (peças "Fundo (trás)" +
// "Fundo (esquerda)"). Ou seja: só ficam certos no INÍCIO de uma parede
// (x=0), com a parede anterior à esquerda. Posto no FIM da parede (x+L=
// comprimento), o lado aberto/diagonal fica virado pra parede — o "entrou
// virado". Regra: canto no fim da parede i (canto côncavo 60–120° com a
// i+1) muda pra parede i+1, x=0 — é o MESMO canto físico, visto da parede
// seguinte. Depois:
//   - parede i (anterior): o que chegava no canto, na mesma faixa de
//     altura, recua pra terminar em comprimento − profundidade do canto;
//   - parede i+1: o que começa antes da largura do canto anda pra depois
//     dele (em cascata).
function projectPhotoIsCorner(it) {
  return it.kind === 'corner_base' || it.kind === 'corner_wall_cabinet' || /\bcanto\b|corner/i.test(it.module_name || '');
}
function projectPhotoNormalizeCorners(items, walls, warnings) {
  const faixa = (a, b) => a.floor_height_mm < b.floor_height_mm + b.height_mm && b.floor_height_mm < a.floor_height_mm + a.height_mm;
  const anguloOk = (i) => { const a = Number(walls[i] && walls[i].angle_to_next_deg); return a >= 60 && a <= 120; };
  items.filter((it) => it.layer !== 'floor' && projectPhotoIsCorner(it)).forEach((c) => {
    const i = c.wall_index;
    const L = walls[i] ? walls[i].length_mm : 0;
    if (c.x_mm + c.width_mm >= L - 150 && i < walls.length - 1 && anguloOk(i)) {
      // no fim da parede i → começo da parede i+1. Os lados trocam de papel:
      // o que era "largura ao longo da parede i" vira a profundidade.
      const w = c.width_mm, d = c.depth_mm;
      c.wall_index = i + 1; c.x_mm = 0; c.width_mm = d; c.depth_mm = w;
      warnings.push(tPhoto('warn_corner_moved', { label: c.label, n: i + 2 }));
    } else if (c.x_mm <= 150) {
      c.x_mm = 0;
    } else {
      warnings.push(tPhoto('warn_corner_not_in_corner', { label: c.label }));
      return;
    }
    const j = c.wall_index;
    // parede anterior: recua quem invadia o canto
    if (j > 0 && anguloOk(j - 1)) {
      const Lp = walls[j - 1].length_mm;
      let limite = Lp - c.depth_mm;
      items.filter((o) => o !== c && o.layer !== 'floor' && o.wall_index === j - 1 && faixa(o, c))
        .sort((a, b) => b.x_mm - a.x_mm)
        .forEach((o) => {
          if (o.x_mm + o.width_mm > limite + 1) {
            const novo = Math.round(limite - o.width_mm);
            if (novo >= 0) { o.x_mm = novo; warnings.push(tPhoto('warn_corner_shift', { label: o.label, mm: novo })); }
            else warnings.push(tPhoto('warn_corner_conflict', { label: o.label }));
          }
          limite = Math.min(limite, o.x_mm);
        });
    }
    // mesma parede: o resto da corrida começa depois do canto
    let fim = c.x_mm + c.width_mm;
    items.filter((o) => o !== c && o.layer !== 'floor' && o.wall_index === j && faixa(o, c))
      .sort((a, b) => a.x_mm - b.x_mm)
      .forEach((o) => {
        if (o.x_mm < fim - 1) {
          if (fim + o.width_mm <= walls[j].length_mm + 1) { o.x_mm = Math.round(fim); }
          else warnings.push(tPhoto('warn_corner_conflict', { label: o.label }));
        }
        fim = Math.max(fim, o.x_mm + o.width_mm);
      });
  });
}

// Rede de segurança: a IA às vezes lê o canto de base como DUAS bases comuns
// (uma de cada parede, se encontrando no canto). Regra do Matt: base de canto
// com duas portas é o "Base Canto 90°" (~36"×36"). Se num canto côncavo
// 60–120° sem módulo de canto houver base no FIM da parede i e base no
// COMEÇO da parede i+1, a da parede i+1 vira Base Canto 90° 914×914 (o
// normalize logo depois recua a corrida da parede i e empurra a da i+1).
function projectPhotoAutoCornerBase(items, walls, catalog, warnings) {
  const cantos = catalog.filter((m) => /base\s*canto\s*90/i.test(m.name));
  if (!cantos.length) return;
  const ehBase = (it) => it.layer !== 'floor' && it.floor_height_mm < 200 && it.height_mm < 1100 && !projectPhotoIsCorner(it);
  for (let i = 0; i < walls.length - 1; i++) {
    const a = Number(walls[i].angle_to_next_deg);
    if (!(a >= 60 && a <= 120)) continue;
    const temCanto = items.some((it) => projectPhotoIsCorner(it) && it.floor_height_mm < 200 &&
      ((it.wall_index === i + 1 && it.x_mm <= 150) || (it.wall_index === i && it.x_mm + it.width_mm >= walls[i].length_mm - 150)));
    if (temCanto) continue;
    const fimI = items.find((it) => ehBase(it) && it.wall_index === i && it.x_mm + it.width_mm >= walls[i].length_mm - 50);
    const iniJ = items.find((it) => ehBase(it) && it.wall_index === i + 1 && it.x_mm <= (fimI ? fimI.depth_mm : 650) + 50);
    if (!fimI || !iniJ) continue;
    // mesma variante de pé (Toe / Plastic feet) das bases vizinhas, se der pra saber
    const pes = /plastic|feet/i.test(iniJ.module_name + ' ' + fimI.module_name) ? /plastic|feet/i : /toe/i;
    const m = cantos.find((c) => pes.test(c.name)) || cantos[0];
    const lado = (r) => clampNum(914, r[0], r[2]);
    Object.assign(iniJ, {
      kind: 'corner_base', module_id: m.id, module_name: m.name,
      x_mm: 0, width_mm: lado(m.w), depth_mm: lado(m.d),
      height_mm: clampNum(iniJ.height_mm, m.h[0], m.h[2])
    });
    warnings.push(tPhoto('warn_corner_auto', { label: iniJ.label, module: m.name }));
  }
}

// Módulo em cima de porta/passagem, ou cobrindo janela → aviso.
function projectPhotoCheckOpenings(items, openings, warnings) {
  items.forEach((it) => {
    if (it.layer === 'floor') return;
    openings.filter((o) => o.wall_index === it.wall_index).forEach((o) => {
      const sobrepX = it.x_mm < o.x_mm + o.width_mm - 10 && o.x_mm < it.x_mm + it.width_mm - 10;
      const sobrepY = it.floor_height_mm < o.sill_mm + o.height_mm - 10 && o.sill_mm < it.floor_height_mm + it.height_mm - 10;
      if (sobrepX && sobrepY) warnings.push(tPhoto('warn_over_opening', { label: it.label, kind: tPhoto('opening_' + o.type) }));
    });
  });
}

// Itens do casamento + volume de origem → item pronto pra criar, clampado.
function projectPhotoBuildItems(match, room, catalog, warnings) {
  const byId = new Map(catalog.map((m) => [m.id, m]));
  const volById = new Map(room.volumes.map((v) => [v.id, v]));
  const items = [];
  (match.items || []).forEach((raw, idx) => {
    const v = volById.get(raw.volume_id);
    const m = byId.get(raw.module_id);
    if (!v) return;
    if (!m) { warnings.push(tPhoto('warn_unknown_module', { label: raw.label || v.label })); return; }
    const wall = room.walls[v.wall_index] || room.walls[0];
    const width_mm = clampNum(raw.width_mm, m.w[0], m.w[2]);
    const height_mm = clampNum(raw.height_mm, m.h[0], m.h[2]);
    const depth_mm = clampNum(raw.depth_mm, m.d[0], m.d[2]);
    const floor_height_mm = clampNum(raw.floor_height_mm, 0, Math.max(wall.height_mm - height_mm, 0));
    let x_mm = Number(raw.x_mm);
    if (v.layer !== 'floor') {
      const lim = Math.max(wall.length_mm - width_mm, 0);
      if (x_mm > lim + 1) warnings.push(tPhoto('warn_moved_into_wall', { label: raw.label || m.name }));
      x_mm = clampNum(x_mm, 0, lim);
    }
    if (Number(raw.width_mm) > (m.w[2] || Infinity) + 0.5) warnings.push(tPhoto('warn_clamped', { label: raw.label || m.name, axis: 'L', mm: m.w[2] }));
    items.push({
      include: true, order: idx,
      volume_id: v.id, kind: v.kind, layer: v.layer, wall_index: v.wall_index,
      wall_offset_mm: v.wall_offset_mm || 0, facing: v.facing,
      module_id: m.id, module_name: m.name,
      label: String(raw.label || v.label || m.name),
      x_mm, width_mm, height_mm, depth_mm, floor_height_mm,
      color_name: raw.color_name || null
    });
  });
  projectPhotoAutoCornerBase(items, room.walls, catalog, warnings);
  projectPhotoNormalizeCorners(items, room.walls, warnings);
  projectPhotoFixCorners(items, room.walls, warnings);
  projectPhotoCheckOpenings(items, room.openings, warnings);
  items.forEach((it, i) => { it.n = i + 1; });
  return items;
}

// ============================================================
// MODAL
// ============================================================
function openProjectPhotoModal() {
  const modal = document.getElementById('po-proj-photo-modal');
  if (!modal) return;
  projectPhotoState = null;
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

  const unit = projectPhotoUnit();
  // Pé-direito é a escala vertical (obrigatório). Comprimento da parede
  // principal é OPCIONAL — em foto de canto não existe "a" parede, e o
  // número errado aqui atrapalha mais do que ajuda. Vazio = IA estima.
  const wallInput = document.getElementById('po-proj-photo-wall-input');
  const ceilInput = document.getElementById('po-proj-photo-ceiling-input');
  if (wallInput) wallInput.value = '';
  if (ceilInput) ceilInput.value = projectPhotoFormatMm(roomSettings.ceiling_mm, unit);
  modal.querySelectorAll('.po-proj-photo-unit').forEach((el) => { el.textContent = unit; });

  let q = 'flash';
  try { q = localStorage.getItem(PROJECT_PHOTO_QUALITY_KEY) === 'pro' ? 'pro' : 'flash'; } catch (e) { /* ok */ }
  modal.querySelectorAll('input[name="po-proj-photo-quality"]').forEach((r) => { r.checked = r.value === q; });

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
function projectPhotoQuality() {
  const r = document.querySelector('input[name="po-proj-photo-quality"]:checked');
  return r && r.value === 'pro' ? 'pro' : 'flash';
}

async function runProjectPhotoAttach(file) {
  setProjectPhotoError('');
  if (!/^image\//.test(file.type)) { setProjectPhotoError(tPhoto('err_not_image')); return; }
  setProjectPhotoStatus(tPhoto('status_reading'));
  try {
    projectPhotoImage = await readProjectPhotoFile(file);
    const preview = document.getElementById('po-proj-photo-preview');
    if (preview) { preview.src = projectPhotoImage.dataUrl; preview.style.display = ''; }
    const runBtn = document.getElementById('po-proj-photo-run-btn');
    if (runBtn) { runBtn.disabled = false; runBtn.style.display = ''; }
    const createBtn = document.getElementById('po-proj-photo-create-btn');
    if (createBtn) createBtn.style.display = 'none';
    const review = document.getElementById('po-proj-photo-review');
    if (review) { review.innerHTML = ''; review.style.display = 'none'; }
    projectPhotoState = null;
    setProjectPhotoStatus('');
  } catch (err) {
    console.error('[foto-projeto] falha lendo imagem:', err);
    setProjectPhotoStatus('');
    setProjectPhotoError(err.message || tPhoto('err_image_read'));
  }
}

async function invokeProjectPhotoStage(body) {
  const { data, error } = await supabaseClient.functions.invoke('generate-project-from-photo', { body });
  if (error && !(data && !data.error)) {
    console.error('generate-project-from-photo falhou:', body.stage, error, data);
    const status = (error && error.context && error.context.status) || 0;
    const err = new Error(await describeEdgeFunctionError(error, data, 'generate-project-from-photo'));
    err.status = status;
    // 504 = a função desistiu no prazo (code 'timeout') ou o gateway cortou;
    // 546 = WORKER_LIMIT (memória/CPU) — os dois melhoram com menos imagem.
    err.isTimeout = status === 504 || status === 546 || /timeout|demorou|504|546/i.test(err.message);
    throw err;
  }
  if (!data || data.error) throw new Error((data && data.error) || tPhoto('err_empty_result'));
  return data;
}

// ---------- Ler a foto: etapa 1 (ambiente+volumes) → etapa 2 (catálogo) ----------
// Pipeline de IA reaproveitável (01/10): o modal da foto E o "Projeto a
// partir de PDF" (portal-12) passam por aqui. images = [{base64, mime,
// label}] — 1 foto, ou várias pranchas do mesmo ambiente (source='drawing').
// catalogP: Promise de [catalog, colors] (o PDF carrega uma vez só pra todos
// os ambientes). status(msg) é opcional.
async function projectPhotoRunPipeline(opts, status) {
  const say = typeof status === 'function' ? status : () => {};
  const lang = (typeof I18n !== 'undefined' && typeof I18n.getLanguage === 'function') ? (I18n.getLanguage() || 'pt') : 'pt';
  const images = opts.images || [];
  const catalogP = opts.catalogP || Promise.all([buildProjectPhotoCatalog(), buildProjectPhotoColorList()]);
  catalogP.catch(() => {});

  // ESCADA DE PLANO B (01/10, Indiana: "Cozinha · erro 504" com Pro + 6
  // pranchas): se a leitura estoura o tempo da função, tenta de novo no
  // modo rápido e depois com menos páginas — melhor um projeto um pouco
  // menos fiel do que nenhum. Quem caiu pro plano B ganha um aviso.
  const tentativas = [{ quality: opts.quality, n: images.length }];
  if (opts.quality === 'pro') tentativas.push({ quality: 'flash', n: images.length });
  if (images.length > 3) tentativas.push({ quality: 'flash', n: 3 });
  let room = null, planoB = null;
  for (let k = 0; k < tentativas.length && !room; k++) {
    const tt = tentativas[k];
    say(k === 0 ? tPhoto(tt.quality === 'pro' ? 'status_step1_pro' : 'status_step1') : tPhoto('status_retry_fast', { n: tt.n }));
    try {
      room = await invokeProjectPhotoStage({
        stage: 'read', quality: tt.quality, images: images.slice(0, tt.n),
        source: opts.source || 'photo', room_name: opts.roomName || '',
        ceiling_mm: opts.ceilingMm, ref_wall_mm: opts.refWallMm > 0 ? opts.refWallMm : null,
        baseboard_mm: roomSettings.baseboard_mm || 0, notes: opts.notes || '', lang
      });
      if (k > 0) planoB = tt;
    } catch (err) {
      if (!err.isTimeout || k === tentativas.length - 1) throw err;
    }
  }
  if (!Array.isArray(room.walls) || !room.walls.length) throw new Error(tPhoto('err_empty_result'));

  const [catalog, colors] = await catalogP;
  if (!catalog.length) throw new Error(tPhoto('err_no_catalog'));

  say(tPhoto('status_step2'));
  // casamento: a 1ª imagem basta pra estilo/cor (economiza payload)
  const match = await invokeProjectPhotoStage({
    stage: 'match', images: images.slice(0, 2), volumes: room.volumes, catalog, colors, lang
  });

  const warnings = [];
  if (planoB) warnings.push(tPhoto('warn_fallback_fast', { n: planoB.n }));
  const items = projectPhotoBuildItems(match, room, catalog, warnings);
  const volById = new Map(room.volumes.map((v) => [v.id, v]));
  const unmatched = (match.unmatched || []).map((u) => ({ volume: volById.get(u.volume_id), reason: u.reason })).filter((u) => u.volume);
  return {
    room, items, unmatched, warnings,
    notes: match.notes || '',
    models: [room.model, match.model].filter(Boolean),
    applyRoom: true
  };
}

// ---------- Ler a foto: etapa 1 (ambiente+volumes) → etapa 2 (catálogo) ----------
async function runProjectPhotoAnalyze() {
  if (projectPhotoRunning) return;
  if (!projectPhotoImage) { setProjectPhotoError(tPhoto('err_no_image')); return; }

  const unit = projectPhotoUnit();
  const refWallMm = projectPhotoParseToMm((document.getElementById('po-proj-photo-wall-input') || {}).value, unit);
  const ceilingMm = projectPhotoParseToMm((document.getElementById('po-proj-photo-ceiling-input') || {}).value, unit);
  if (!(ceilingMm > 0)) { setProjectPhotoError(tPhoto('err_bad_measures')); return; }
  const quality = projectPhotoQuality();
  try { localStorage.setItem(PROJECT_PHOTO_QUALITY_KEY, quality); } catch (e) { /* ok */ }

  projectPhotoRunning = true;
  setProjectPhotoError('');
  const runBtn = document.getElementById('po-proj-photo-run-btn');
  if (runBtn) runBtn.disabled = true;
  const notes = (document.getElementById('po-proj-photo-notes') || {}).value || '';
  const t0 = Date.now();
  const tick = setInterval(() => {
    const el = document.getElementById('po-proj-photo-status');
    if (el && el.dataset.base) el.textContent = el.dataset.base + ' ' + Math.round((Date.now() - t0) / 1000) + ' s';
  }, 1000);
  const status = (msg) => {
    const el = document.getElementById('po-proj-photo-status');
    if (el) el.dataset.base = msg;
    setProjectPhotoStatus(msg);
  };

  try {
    projectPhotoState = await projectPhotoRunPipeline({
      images: [{ base64: projectPhotoImage.base64, mime: projectPhotoImage.mime }],
      quality, ceilingMm, refWallMm, notes, source: 'photo'
    }, status);
    renderProjectPhotoReview();

    const createBtn = document.getElementById('po-proj-photo-create-btn');
    if (createBtn) createBtn.style.display = '';
    if (runBtn) runBtn.style.display = 'none';
    if (!projectPhotoState.items.length) setProjectPhotoError(tPhoto('err_nothing_matched'));
  } catch (err) {
    setProjectPhotoError(err.message || String(err));
  } finally {
    clearInterval(tick);
    projectPhotoRunning = false;
    setProjectPhotoStatus('');
    if (runBtn) runBtn.disabled = false;
  }
}

// ============================================================
// REVISÃO
// ============================================================
const PHOTO_LAYER_FILL = { wall: '#d9b98c', front: '#e39b5b', floor: '#9cb7a0' };

// Elevação de UMA parede (vista de frente): contorno, rodapé, aberturas,
// volumes não reproduzidos (tracejado vermelho) e módulos numerados.
function projectPhotoElevationSvg(st, wi) {
  const wall = st.room.walls[wi];
  const W = wall.length_mm, H = wall.height_mm;
  const pad = Math.max(W, H) * 0.04;
  const vb = [-pad, -pad, W + 2 * pad, H + 2 * pad].join(' ');
  const y = (mm) => H - mm; // SVG cresce pra baixo
  const fs = Math.max(W, H) / 18;
  const parts = [];
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#f7f4ee" stroke="#8d8375" stroke-width="${fs / 6}"/>`);
  st.room.openings.filter((o) => o.wall_index === wi).forEach((o) => {
    parts.push(`<rect x="${o.x_mm}" y="${y(o.sill_mm + o.height_mm)}" width="${o.width_mm}" height="${o.height_mm}" fill="${o.type === 'window' ? '#dcebf5' : '#ffffff'}" stroke="#4a7fa8" stroke-width="${fs / 5}"${o.type === 'passage' ? ` stroke-dasharray="${fs / 2} ${fs / 3}"` : ''}/>`);
    parts.push(`<text x="${o.x_mm + o.width_mm / 2}" y="${y(o.sill_mm + o.height_mm / 2)}" font-size="${fs * 0.6}" text-anchor="middle" dominant-baseline="middle" fill="#4a7fa8">${escapeHtmlPhoto(tPhoto('opening_' + o.type))}</text>`);
  });
  st.unmatched.filter((u) => u.volume.wall_index === wi && u.volume.layer !== 'floor').forEach((u) => {
    const v = u.volume;
    parts.push(`<rect x="${v.x_mm}" y="${y(v.floor_height_mm + v.height_mm)}" width="${v.width_mm}" height="${v.height_mm}" fill="none" stroke="#c0392b" stroke-width="${fs / 7}" stroke-dasharray="${fs / 2} ${fs / 3}"/>`);
    parts.push(`<text x="${v.x_mm + v.width_mm / 2}" y="${y(v.floor_height_mm + v.height_mm / 2)}" font-size="${fs * 0.5}" text-anchor="middle" dominant-baseline="middle" fill="#c0392b">${escapeHtmlPhoto(v.label)}</text>`);
  });
  st.items.filter((it) => it.wall_index === wi && it.layer !== 'floor').forEach((it) => {
    const op = it.include ? 0.85 : 0.2;
    parts.push(`<rect x="${it.x_mm}" y="${y(it.floor_height_mm + it.height_mm)}" width="${it.width_mm}" height="${it.height_mm}" fill="${PHOTO_LAYER_FILL[it.layer]}" fill-opacity="${op}" stroke="#5b4a35" stroke-width="${fs / 8}"/>`);
    parts.push(`<text x="${it.x_mm + it.width_mm / 2}" y="${y(it.floor_height_mm + it.height_mm / 2)}" font-size="${fs}" font-weight="700" text-anchor="middle" dominant-baseline="middle" fill="#2b2118" fill-opacity="${it.include ? 1 : 0.3}">${it.n}</text>`);
  });
  const unit = projectPhotoUnit();
  parts.push(`<text x="${W / 2}" y="${H + pad * 0.8}" font-size="${fs * 0.8}" text-anchor="middle" fill="#6f665a">${projectPhotoFormatMm(W, unit)} ${unit}</text>`);
  return `<svg viewBox="${vb}" preserveAspectRatio="xMidYMid meet" class="po-proj-photo-elev-svg">${parts.join('')}</svg>`;
}

// Planta: contorno lido + aberturas + pegada dos módulos (inclusive ilha).
function projectPhotoPlanSvg(st) {
  const room = st.room;
  const segs = projectPhotoWallsToSegments(room.walls, room.openings, room.ceiling_mm, projectPhotoMainWallIndex(room));
  if (!segs.length) return '';
  const geo = segs.map((s) => {
    const len = Math.hypot(s.bx - s.ax, s.bz - s.az) || 1;
    const ux = (s.bx - s.ax) / len, uz = (s.bz - s.az) / len;
    let ix = -uz, iz = ux;
    return { s, len, ux, uz, ix, iz };
  });
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  const grow = (x, z) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); };
  segs.forEach((s) => { grow(s.ax, s.az); grow(s.bx, s.bz); });
  const poly = (pts, attrs) => `<polygon points="${pts.map((p) => p.x.toFixed(0) + ',' + p.z.toFixed(0)).join(' ')}" ${attrs}/>`;
  const parts = [];
  const footprint = (it) => {
    const g = geo[it.wall_index] || geo[0];
    const P = (u, d) => ({ x: g.s.ax + g.ux * u + g.ix * d, z: g.s.az + g.uz * u + g.iz * d });
    const d0 = it.wall_offset_mm || 0, d1 = d0 + it.depth_mm;
    const pts = [P(it.x_mm, d0), P(it.x_mm + it.width_mm, d0), P(it.x_mm + it.width_mm, d1), P(it.x_mm, d1)];
    pts.forEach((p) => grow(p.x, p.z));
    return pts;
  };
  const fps = st.items.map((it) => ({ it, pts: footprint(it) }));
  const K = Math.max(x1 - x0, z1 - z0) || 1000;
  const fs = K / 28;
  geo.forEach((g) => {
    const P = (u, d) => ({ x: g.s.ax + g.ux * u + g.ix * d, z: g.s.az + g.uz * u + g.iz * d });
    parts.push(poly([P(0, 0), P(g.len, 0), P(g.len, -150), P(0, -150)], `fill="#cfc9bd" stroke="#8d8375" stroke-width="${fs / 8}"`));
    (g.s.openings || []).forEach((o) => {
      parts.push(poly([P(o.x_mm, 10), P(o.x_mm + o.width_mm, 10), P(o.x_mm + o.width_mm, -160), P(o.x_mm, -160)], `fill="${o.type === 'window' ? '#dcebf5' : '#fff'}" stroke="#4a7fa8" stroke-width="${fs / 8}"`));
    });
  });
  fps.sort((a, b) => ({ wall: 0, front: 1, floor: 2 }[a.it.layer] - { wall: 0, front: 1, floor: 2 }[b.it.layer]));
  fps.forEach(({ it, pts }) => {
    parts.push(poly(pts, `fill="${PHOTO_LAYER_FILL[it.layer]}" fill-opacity="${it.include ? 0.8 : 0.2}" stroke="#5b4a35" stroke-width="${fs / 10}"`));
    const c = pts.reduce((acc, p) => ({ x: acc.x + p.x / 4, z: acc.z + p.z / 4 }), { x: 0, z: 0 });
    parts.push(`<text x="${c.x}" y="${c.z}" font-size="${fs * 0.8}" font-weight="700" text-anchor="middle" dominant-baseline="middle" fill="#2b2118">${it.n}</text>`);
  });
  const pad = K * 0.08;
  return `<svg viewBox="${x0 - pad} ${z0 - pad} ${x1 - x0 + 2 * pad} ${z1 - z0 + 2 * pad}" preserveAspectRatio="xMidYMid meet" class="po-proj-photo-plan-svg">${parts.join('')}</svg>`;
}

function renderProjectPhotoDrawings() {
  const st = projectPhotoState;
  const box = document.getElementById('po-proj-photo-drawings');
  if (!st || !box) return;
  const elevs = st.room.walls.map((w, i) => `
    <figure class="po-proj-photo-elev">
      ${projectPhotoElevationSvg(st, i)}
      <figcaption>${i + 1}. ${escapeHtmlPhoto(w.label)}${w.fully_visible ? '' : ' <span class="po-proj-photo-warn-tag">' + escapeHtmlPhoto(tPhoto('wall_partial')) + '</span>'}</figcaption>
    </figure>`).join('');
  box.innerHTML = `
    <div class="po-proj-photo-elevs">${elevs}</div>
    <figure class="po-proj-photo-plan">${projectPhotoPlanSvg(st)}<figcaption>${escapeHtmlPhoto(tPhoto('plan_caption'))}</figcaption></figure>`;
}

function renderProjectPhotoReview() {
  const st = projectPhotoState;
  const el = document.getElementById('po-proj-photo-review');
  if (!el || !st) return;
  const unit = projectPhotoUnit();
  const f = (mm) => projectPhotoFormatMm(mm, unit);
  const inp = (attrs, val) => `<input type="text" inputmode="decimal" class="po-proj-photo-num" ${attrs} value="${escapeHtmlPhoto(val)}">`;
  const wallOpts = (sel) => st.room.walls.map((w, i) => `<option value="${i}"${i === sel ? ' selected' : ''}>${i + 1}</option>`).join('');

  const wallRows = st.room.walls.map((w, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${escapeHtmlPhoto(w.label)}</td>
      <td>${inp(`data-wall="${i}" data-field="length_mm"`, f(w.length_mm))}</td>
      <td>${inp(`data-wall="${i}" data-field="height_mm"`, f(w.height_mm))}</td>
      <td>${i < st.room.walls.length - 1 ? inp(`data-wall="${i}" data-field="angle_to_next_deg"`, w.angle_to_next_deg) + '°' : '—'}</td>
    </tr>`).join('');

  const types = ['door', 'window', 'passage', 'niche'];
  const openRows = st.room.openings.map((o, i) => `
    <tr>
      <td><select data-open="${i}" data-field="wall_index">${wallOpts(o.wall_index)}</select></td>
      <td><select data-open="${i}" data-field="type">${types.map((t) => `<option value="${t}"${o.type === t ? ' selected' : ''}>${escapeHtmlPhoto(tPhoto('opening_' + t))}</option>`).join('')}</select></td>
      <td>${inp(`data-open="${i}" data-field="x_mm"`, f(o.x_mm))}</td>
      <td>${inp(`data-open="${i}" data-field="width_mm"`, f(o.width_mm))}</td>
      <td>${inp(`data-open="${i}" data-field="sill_mm"`, f(o.sill_mm))}</td>
      <td>${inp(`data-open="${i}" data-field="height_mm"`, f(o.height_mm))}</td>
      <td><button type="button" class="po-proj-photo-x" data-open-del="${i}" title="${escapeHtmlPhoto(tPhoto('remove'))}">&times;</button></td>
    </tr>`).join('');

  const layerName = (l) => tPhoto('layer_' + l);
  const itemRows = st.items.map((it, i) => `
    <tr>
      <td><input type="checkbox" data-photo-idx="${i}" ${it.include ? 'checked' : ''}></td>
      <td><strong>${it.n}</strong></td>
      <td>${it.wall_index + 1}</td>
      <td>${escapeHtmlPhoto(layerName(it.layer))}</td>
      <td>${escapeHtmlPhoto(it.label)}</td>
      <td>${escapeHtmlPhoto(it.module_name)}</td>
      <td class="mono">${f(it.width_mm)} × ${f(it.height_mm)} × ${f(it.depth_mm)}</td>
      <td class="mono">${f(it.x_mm)} / ${f(it.floor_height_mm)}${it.wall_offset_mm ? ' / ↤' + f(it.wall_offset_mm) : ''}</td>
      <td>${escapeHtmlPhoto(it.color_name || '—')}</td>
    </tr>`).join('');

  const unmatchedHtml = st.unmatched.length
    ? `<p class="hint"><strong>${tPhoto('skipped_title')}</strong> ${st.unmatched.map((u) => escapeHtmlPhoto(u.volume.label + (u.reason ? ' (' + u.reason + ')' : ''))).join(' · ')}</p>`
    : '';
  const warnHtml = st.warnings.length
    ? `<ul class="po-proj-photo-warnings">${st.warnings.map((w) => `<li>${escapeHtmlPhoto(w)}</li>`).join('')}</ul>` : '';

  el.innerHTML = `
    ${st.room.summary ? `<p class="hint">${escapeHtmlPhoto(st.room.summary)}</p>` : ''}
    <details class="po-proj-photo-details"><summary>${escapeHtmlPhoto(tPhoto('how_read'))}</summary>
      <p class="hint">${escapeHtmlPhoto(st.room.camera_notes)}</p>
      <p class="hint">${escapeHtmlPhoto(st.room.scale_notes)}</p>
      ${st.notes ? `<p class="hint">${escapeHtmlPhoto(st.notes)}</p>` : ''}
      ${st.models.length ? `<p class="hint mono">${escapeHtmlPhoto(st.models.join(' · '))}</p>` : ''}
    </details>

    <div id="po-proj-photo-drawings"></div>
    <p class="hint po-proj-photo-legend">
      <span class="sw" style="background:${PHOTO_LAYER_FILL.wall}"></span>${escapeHtmlPhoto(layerName('wall'))}
      <span class="sw" style="background:${PHOTO_LAYER_FILL.front}"></span>${escapeHtmlPhoto(layerName('front'))}
      <span class="sw" style="background:${PHOTO_LAYER_FILL.floor}"></span>${escapeHtmlPhoto(layerName('floor'))}
      <span class="sw sw-open"></span>${escapeHtmlPhoto(tPhoto('legend_openings'))}
      <span class="sw sw-miss"></span>${escapeHtmlPhoto(tPhoto('legend_unmatched'))}
    </p>

    <h3 class="po-proj-photo-h">${tPhoto('section_room')}</h3>
    <label class="po-proj-photo-wall-apply"><input type="checkbox" id="po-proj-photo-apply-room" ${st.applyRoom ? 'checked' : ''}> ${tPhoto('apply_room_label')}</label>
    <div class="po-import2020-tablewrap">
      <table class="po-import2020-table po-proj-photo-table">
        <thead><tr><th>#</th><th>${tPhoto('col_wall')}</th><th>${tPhoto('col_length')} (${unit})</th><th>${tPhoto('col_height')} (${unit})</th><th>${tPhoto('col_angle')}</th></tr></thead>
        <tbody>${wallRows}</tbody>
      </table>
    </div>
    <div class="po-import2020-tablewrap">
      <table class="po-import2020-table po-proj-photo-table">
        <thead><tr><th>${tPhoto('col_wall')}</th><th>${tPhoto('col_type')}</th><th>${tPhoto('col_from_start')} (${unit})</th><th>${tPhoto('col_width')} (${unit})</th><th>${tPhoto('col_sill')} (${unit})</th><th>${tPhoto('col_height')} (${unit})</th><th></th></tr></thead>
        <tbody>${openRows || `<tr><td colspan="7" class="hint">${tPhoto('no_openings')}</td></tr>`}</tbody>
      </table>
    </div>
    <button type="button" class="secondary po-proj-photo-addopen" id="po-proj-photo-add-opening">${tPhoto('add_opening')}</button>

    <h3 class="po-proj-photo-h">${tPhoto('section_modules')}</h3>
    <div class="po-import2020-tablewrap">
      <table class="po-import2020-table po-proj-photo-table">
        <thead><tr>
          <th></th><th>#</th><th>${tPhoto('col_wall')}</th><th>${tPhoto('col_layer')}</th>
          <th>${tPhoto('col_piece')}</th><th>${tPhoto('col_module')}</th>
          <th>${tPhoto('col_dims')} (${unit})</th><th>${tPhoto('col_pos')} (${unit})</th><th>${tPhoto('col_color')}</th>
        </tr></thead>
        <tbody>${itemRows}</tbody>
      </table>
    </div>
    ${unmatchedHtml}
    ${warnHtml}`;
  el.style.display = '';
  renderProjectPhotoDrawings();
}

// Edição na revisão (delegação — a tabela é refeita a cada render).
function onProjectPhotoReviewChange(ev) {
  const st = projectPhotoState;
  if (!st) return;
  const t = ev.target;
  const unit = projectPhotoUnit();
  if (t.id === 'po-proj-photo-apply-room') { st.applyRoom = t.checked; return; }
  if (t.dataset.photoIdx != null) {
    const it = st.items[Number(t.dataset.photoIdx)];
    if (it) it.include = t.checked;
    renderProjectPhotoDrawings();
    return;
  }
  if (t.dataset.wall != null) {
    const w = st.room.walls[Number(t.dataset.wall)];
    const field = t.dataset.field;
    const v = field === 'angle_to_next_deg' ? Number(String(t.value).replace(',', '.')) : projectPhotoParseToMm(t.value, unit);
    if (!w || !Number.isFinite(v) || v <= 0) { renderProjectPhotoReview(); return; }
    w[field] = field === 'angle_to_next_deg' ? clampNum(v, 20, 340) : Math.round(v);
    renderProjectPhotoReview();
    return;
  }
  if (t.dataset.open != null) {
    const o = st.room.openings[Number(t.dataset.open)];
    if (!o) return;
    const field = t.dataset.field;
    if (field === 'wall_index') o.wall_index = Number(t.value);
    else if (field === 'type') { o.type = t.value; if (o.type === 'door' || o.type === 'passage') o.sill_mm = 0; }
    else {
      const v = projectPhotoParseToMm(t.value, unit);
      if (Number.isFinite(v) && v >= 0) o[field] = Math.round(v);
    }
    const wall = st.room.walls[o.wall_index];
    if (wall) {
      o.width_mm = clampNum(o.width_mm, 100, wall.length_mm);
      o.x_mm = clampNum(o.x_mm, 0, wall.length_mm - o.width_mm);
    }
    renderProjectPhotoReview();
  }
}
function onProjectPhotoReviewClick(ev) {
  const st = projectPhotoState;
  if (!st) return;
  const del = ev.target.closest('[data-open-del]');
  if (del) { st.room.openings.splice(Number(del.dataset.openDel), 1); renderProjectPhotoReview(); return; }
  if (ev.target.id === 'po-proj-photo-add-opening') {
    const wall = st.room.walls[0];
    st.room.openings.push({ wall_index: 0, type: 'door', x_mm: Math.max(0, Math.round((wall.length_mm - 813) / 2)), width_mm: Math.min(813, wall.length_mm), height_mm: 2032, sill_mm: 0 });
    renderProjectPhotoReview();
  }
}

// ============================================================
// CRIAR NO PROJETO
// ============================================================
// Constrói o estado da IA no PROJETO ABERTO (paredes + módulos), sem UI.
// Usado pelo botão "Criar no projeto" e pelo lote do PDF (portal-12).
// Zera projectSlots — quem chama decide se precisa confirmar.
async function projectPhotoApplyState(st) {
  const chosen = st.items.filter((it) => it.include);
  const warnings = [];
  if (typeof pushProjectUndoState === 'function') pushProjectUndoState();
  const room = st.room;

  // 1. AMBIENTE — paredes (com aberturas dentro) e pé-direito.
  let wallMap = room.walls.map((w, i) => i); // parede lida → índice no projeto
  if (st.applyRoom) {
    projectWallSegments = projectPhotoWallsToSegments(room.walls, room.openings, room.ceiling_mm, projectPhotoMainWallIndex(room));
    const ceilInput = document.getElementById('po-proj-ceiling-input');
    const un = (document.getElementById('po-unit-select') || {}).value || 'mm';
    if (ceilInput && Math.abs(room.ceiling_mm - roomSettings.ceiling_mm) > 1) {
      ceilInput.value = formatDimension(room.ceiling_mm, un);
      ceilInput.dispatchEvent(new Event('change'));
    } else if (Math.abs(room.ceiling_mm - roomSettings.ceiling_mm) > 1) {
      roomSettings.ceiling_mm = room.ceiling_mm;
      if (typeof refreshRoomSettingsInputs === 'function') refreshRoomSettingsInputs();
    }
    projectActiveWallIndex = Math.min(projectPhotoMainWallIndex(room), projectWallSegments.length - 1);
    try { project3DLastFitKey = null; } catch (e) { /* vista 3D ainda não carregou */ }
    if (typeof refreshProjectWallTabs === 'function') refreshProjectWallTabs();
    if (typeof refreshProjectWallWidthInput === 'function') refreshProjectWallWidthInput();
  } else {
    const n = getProjectWallCount();
    wallMap = room.walls.map((w, i) => Math.min(i, n - 1));
    if (room.walls.length > n) warnings.push(tPhoto('warn_walls_merged', { n }));
  }

  // 2. MÓDULOS — parede, depois frente, depois piso.
  projectSlots = [];
  selectedProjectSlotId = null;
  const ordemCamada = { wall: 0, front: 1, floor: 2 };
  const ordered = chosen.slice().sort((a, b) =>
    (ordemCamada[a.layer] - ordemCamada[b.layer]) || (a.wall_index - b.wall_index) || (a.order - b.order));
  const geoByWall = new Map((getProjectWallGeometry() || []).map((g) => [g.wallIndex, g]));
  const colorCache = new Map();
  let created = 0;

  for (const it of ordered) {
    const wi = wallMap[it.wall_index] != null ? wallMap[it.wall_index] : 0;
    const wallLen = getProjectWallWidthMm(wi);
    let slot;
    if (it.layer === 'floor') {
      // Ilha: centro = origem da parede + ao longo (x + L/2) + pra dentro
      // (afastamento + P/2). Giro = o da parede (frente pro ambiente) ou
      // +180° quando a frente olha pra parede.
      const g = geoByWall.get(wi);
      if (!g) { warnings.push(tPhoto('warn_insert_failed', { label: it.label })); continue; }
      const along = it.x_mm + it.width_mm / 2;
      const into = (it.wall_offset_mm || 0) + it.depth_mm / 2;
      const cx = g.originX * 1000 + g.alongDirX * along + g.intoDirX * into;
      const cz = g.originZ * 1000 + g.alongDirZ * along + g.intoDirZ * into;
      slot = await insertProjectModuleDefault(it.module_id, {
        placement: 'floor', floor_x_mm: Math.round(cx), floor_z_mm: Math.round(cz),
        width_mm: it.width_mm, height_mm: it.height_mm, floor_height_mm: it.floor_height_mm
      });
      if (slot) {
        let deg = (g.rotationY * 180 / Math.PI) + (it.facing === 'toward_wall' ? 180 : 0);
        deg = ((deg % 360) + 540) % 360 - 180;
        slot.floor_rotation_deg = Math.round(deg * 10) / 10;
      }
    } else {
      slot = await insertProjectModuleDefault(it.module_id, {
        wall_index: wi, x_mm: it.x_mm, width_mm: it.width_mm,
        height_mm: it.height_mm, floor_height_mm: it.floor_height_mm
      });
    }
    if (!slot) { warnings.push(tPhoto('warn_insert_failed', { label: it.label })); continue; }
    created++;

    if (Math.abs(Number(slot.depth_mm) - it.depth_mm) > 0.5) updateProjectSlotDimension(slot, 'depth', it.depth_mm);
    if (Math.abs(Number(slot.height_mm) - it.height_mm) > 0.5) {
      warnings.push(tPhoto('warn_height_adjusted', { label: it.label, mm: Math.round(slot.height_mm) }));
    }
    // Camada FRENTE: afastado da parede (mesmo campo do ajuste fino de
    // posição Z — é serializado, salva e recarrega).
    if (it.layer === 'front' && it.wall_offset_mm > 0) slot.fineOffsetZMm = Math.round(it.wall_offset_mm);

    if (it.color_name) {
      let opts = colorCache.get(it.module_id);
      if (!opts) { opts = await fetchModuleColorsByRoleRaw(it.module_id); colorCache.set(it.module_id, opts); }
      let applied = 0;
      Object.keys(opts || {}).forEach((roleId) => {
        const c = (opts[roleId] || []).find((o) => o.name === it.color_name);
        if (c) { applyColorToProjectSlot(slot, roleId, c); applied++; }
      });
      if (applied === 0) warnings.push(tPhoto('warn_color_missing', { label: it.label, color: it.color_name }));
    }

    if (it.layer !== 'floor') {
      slot.x_mm = Math.max(0, Math.min(it.x_mm, wallLen - Number(slot.width_mm || 0)));
      clampProjectSlotPosition(slot);
    }
  }

  return { created, warnings, chosen: chosen.length };
}

async function runProjectPhotoBuild() {
  const st = projectPhotoState;
  if (!st) return;
  const chosen = st.items.filter((it) => it.include);
  if (chosen.length === 0 && !st.applyRoom) { setProjectPhotoError(tPhoto('err_none_selected')); return; }
  if (projectSlots.length > 0 && !confirm(tPhoto('confirm_replace'))) return;

  const createBtn = document.getElementById('po-proj-photo-create-btn');
  if (createBtn) createBtn.disabled = true;
  setProjectPhotoError('');
  setProjectPhotoStatus(tPhoto('status_building'));
  try {
    const { created, warnings } = await projectPhotoApplyState(st);
    const room = st.room;
    if (chosen.length && created === 0) throw new Error(tPhoto('err_nothing_created'));
    renderProjectCanvas();
    markProjectDirty();
    closeProjectPhotoModal();

    const el = document.getElementById('po-proj-error');
    if (el) {
      const lines = [tPhoto('done_summary', { n: created, w: st.applyRoom ? room.walls.length : 0, o: st.applyRoom ? room.openings.length : 0 })];
      if (st.unmatched.length) lines.push(tPhoto('skipped_title') + ' ' + st.unmatched.map((u) => u.volume.label).join(' · '));
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

// ---------- Listeners ----------
(function attachProjectPhotoListeners() {
  const on = (id, fn) => { const b = document.getElementById(id); if (b) b.addEventListener('click', fn); };
  on('po-proj-photo-open-btn', openProjectPhotoModal);
  on('po-proj-photo-modal-close', closeProjectPhotoModal);
  on('po-proj-photo-cancel-btn', closeProjectPhotoModal);
  on('po-proj-photo-run-btn', runProjectPhotoAnalyze);
  on('po-proj-photo-create-btn', runProjectPhotoBuild);

  const attachBtn = document.getElementById('po-proj-photo-attach-btn');
  const input = document.getElementById('po-proj-photo-input');
  if (attachBtn && input) {
    attachBtn.addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (file) runProjectPhotoAttach(file);
    });
  }
  const review = document.getElementById('po-proj-photo-review');
  if (review) {
    review.addEventListener('change', onProjectPhotoReviewChange);
    review.addEventListener('click', onProjectPhotoReviewClick);
  }
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
  // Trocar unidade com a revisão aberta redesenha na unidade nova.
  const unitSel = document.getElementById('po-unit-select');
  if (unitSel) unitSel.addEventListener('change', () => {
    if (projectPhotoState && modal && modal.classList.contains('open')) renderProjectPhotoReview();
  });
})();

// ---------- Visibilidade: só administrador (pedido do Matt, 24/09) ----------
async function refreshProjectAdminOnlyButtons() {
  const ids = ['po-proj-photo-open-btn', 'po-proj-pdf-open-btn', 'po-proj-import2020-open-btn'];
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
//   projectActiveWallIndex, projectWallSegments, project3DLastFitKey,
//   getProjectWallCount, getProjectWallWidthMm, getProjectWallGeometry,
//   refreshProjectWallTabs, refreshProjectWallWidthInput, refreshRoomSettingsInputs,
//   formatDimension, insertProjectModuleDefault, updateProjectSlotDimension,
//   applyColorToProjectSlot, fetchModuleColorsByRoleRaw, clampProjectSlotPosition,
//   renderProjectCanvas, markProjectDirty, pushProjectUndoState,
//   describeEdgeFunctionError, I18n.
