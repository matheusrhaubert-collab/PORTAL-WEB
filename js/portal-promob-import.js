// ============================================================
// Importar do Promob — arquivo .promob → projeto Legno (aba Projetos)
// ============================================================
// Pedido do Matt (2026-10-14): "faz um teste pra um novo importador -
// promob pros projetos". Arquivo de teste usado: Kitchenwolner.promob
// (biblioteca "Legno" no Promob Studio, SYSTEMID 3885).
//
// DIFERENÇA PRO IMPORTADOR DO 2020 (portal-2020-import.js): o relatório do
// 2020 só tinha código + quantidade, então lá tudo entra numa parede só, em
// fila. O .promob traz a CENA INTEIRA — cada módulo com medida, ponto de
// inserção em mm no mundo e giro — então aqui cada módulo entra SOLTO NO
// PISO (placement 'floor') exatamente onde estava no Promob, e as paredes
// do projeto são recriadas a partir das paredes do Promob.
//
// FORMATO (decodificado em 14/10 a partir do arquivo de teste):
//   .promob = zip (caminhos com "\" no lugar de "/").
//   solucao\container1\document0\document0.ambient3d = XML (~12MB) da cena.
//   <AMBIENT3D> > <INFORMACOES> (o piso) > <INFORMACOESCOLECAO> > objetos.
//   Cada objeto é um <INFORMACOES ID="..." TYPE="MODULO|WALL|onlinemodule|
//   GEOMETRY">, com:
//     <INSERTDIMENSION WIDTH HEIGHT DEPTH>   medidas em mm
//     <POSICAOINSERCAO><PONTOBASE X Y Z/><ROTATION>graus</ROTATION>
//     <ATTRIBUTES><ATTRIBUTE ID="DESCRIPTION" VALUE="BASE FULL HIGH CABINET $W$ X $H$ X $D$"/>
//     <INFORMACOESCOLECAO> filhos (peças, ferragens... até 4+ níveis)
//   Módulos encostados numa parede ficam DENTRO da parede (filhos do WALL),
//   mas com coordenada de MUNDO (conferido: não é relativa à parede).
//
// CONVENÇÃO DE EIXOS DO PROMOB (conferida com módulos vizinhos do arquivo):
//   PONTOBASE = canto TRASEIRO-ESQUERDO-INFERIOR do módulo.
//   Giro r anti-horário visto de cima. Largura vai na direção (cos r, sin r);
//   profundidade (frente) vai na direção (sin r, −cos r); Z é altura.
//   Ex.: r=0 → largura +X, frente pra −Y. r=270 → largura −Y, frente −X.
// CONVERSÃO PRO PORTAL: x = X − cx, z = −(Y − cy), altura do chão = Z,
// floor_rotation_deg = r (mesmo sentido — com o Y invertido, o giro
// anti-horário do Promob vira exatamente o rotation.y do Three.js).
// floor_x/z_mm do portal é o CENTRO do módulo (ver getSlotWorldFrame).
//
// CASAMENTO PROMOB → LEGNO: por TIPO (a descrição sem $W$/$H$/$D$/@...@),
// não por peça — o arquivo de teste tem ~70 objetos mas só 13 tipos. Cada
// tipo ganha um dropdown na revisão; a escolha fica lembrada neste
// navegador (localStorage) pra próxima importação já vir casada. Mesma regra
// do 2020: tipo sem módulo escolhido NUNCA vira placeholder — fica de fora e
// aparece na lista. Eletros/pontos elétricos/janela (onlinemodule) e
// geometria solta são listados como ignorados.
//
// TESTE — o que ainda NÃO faz (de propósito, 1ª rodada):
//   · cor/acabamento do Promob (o módulo entra com a cor padrão do catálogo);
//   · internos (prateleira/gaveta/porta que o Promob tem dentro do módulo);
//   · porta/janela da parede (a janela é listada como ignorada);
//   · o mapeamento Promob→Legno fica só neste navegador, não no banco.

let projectImportPromobResult = null; // última análise (ver parsePromobAmbientXml)
const PROMOB_MAP_STORAGE_KEY = 'legno_promob_type_map_v1';

// ---------- Helpers de XML (só filhos DIRETOS — o arquivo é muito aninhado) ----------

function promobChild(el, tag) {
  if (!el) return null;
  for (let c = el.firstChild; c; c = c.nextSibling) {
    if (c.nodeType === 1 && c.nodeName === tag) return c;
  }
  return null;
}

function promobChildren(el, tag) {
  const out = [];
  if (!el) return out;
  for (let c = el.firstChild; c; c = c.nextSibling) {
    if (c.nodeType === 1 && (!tag || c.nodeName === tag)) out.push(c);
  }
  return out;
}

function promobNum(el, attr) {
  if (!el) return 0;
  const v = parseFloat(el.getAttribute(attr));
  return Number.isFinite(v) ? v : 0;
}

function promobAttrValue(entity, id) {
  const attrs = promobChild(entity, 'ATTRIBUTES');
  if (!attrs) return null;
  // ATTRIBUTE pode vir direto ou agrupado — getElementsByTagName só dentro
  // do ATTRIBUTES DESTA entidade (não desce pros filhos da entidade).
  const list = attrs.getElementsByTagName('ATTRIBUTE');
  for (let i = 0; i < list.length; i++) {
    if (list[i].getAttribute('ID') === id) return list[i].getAttribute('VALUE');
  }
  return null;
}

// "BASE FULL HIGH CABINET $W$ X $H$ X $D$"            → "BASE FULL HIGH CABINET"
// "CP1007 RIPADO PANEL 01 19MM $H$ X $W$ X $D$ @mk_co_2@" → "CP1007 RIPADO PANEL 01 19MM"
// "X32007 - 5 SHELVES  $W$ x $H$ x $D$"                → "X32007 - 5 SHELVES"
function promobTypeKey(desc) {
  // "$D.POL$"" (polegada da biblioteca) também é variável — qualquer coisa
  // entre $...$ sai, e as aspas soltas que sobram junto.
  return String(desc || '')
    .replace(/@[^@]*@/g, ' ')
    .replace(/\$[^$\s]*\$/g, ' ')
    .replace(/["“”]/g, ' ')
    .replace(/(\s+[xX](?=\s|$))+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function promobNormalizeName(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

// ---------- Parser da cena ----------

function promobReadPlacement(entity) {
  const p = promobChild(entity, 'POSICAOINSERCAO');
  const pb = promobChild(p, 'PONTOBASE');
  const rotEl = promobChild(p, 'ROTATION');
  const rot = rotEl ? parseFloat(rotEl.textContent) || 0 : 0;
  return { x: promobNum(pb, 'X'), y: promobNum(pb, 'Y'), z: promobNum(pb, 'Z'), rot };
}

function promobReadEntity(entity, parentKind) {
  const dimEl = promobChild(entity, 'INSERTDIMENSION');
  const layerEl = promobChild(entity, 'LAYER');
  const regEl = promobChild(entity, 'ASSOCIATIONREGISTRY');
  const type = entity.getAttribute('TYPE') || '';
  const desc = promobAttrValue(entity, 'DESCRIPTION') || '';
  const w = promobNum(dimEl, 'WIDTH');
  const h = promobNum(dimEl, 'HEIGHT');
  const d = promobNum(dimEl, 'DEPTH');
  const pl = promobReadPlacement(entity);
  const r = (pl.rot * Math.PI) / 180;
  // Centro da caixa no plano do Promob (ver convenção no topo do arquivo).
  const wdx = Math.cos(r), wdy = Math.sin(r);
  const ddx = Math.sin(r), ddy = -Math.cos(r);
  const cx = pl.x + wdx * w / 2 + ddx * d / 2;
  const cy = pl.y + wdy * w / 2 + ddy * d / 2;
  let kind = 'other';
  if (type === 'MODULO') kind = 'module';
  else if (type === 'onlinemodule') kind = 'external';
  else if (type === 'GEOMETRY') kind = 'geometry';
  return {
    guid: regEl ? regEl.getAttribute('GUID') : null,
    promobId: entity.getAttribute('ID') || '',
    type,
    kind,
    parent: parentKind,
    description: desc,
    typeKey: kind === 'module' ? promobTypeKey(desc) : (desc || type),
    layer: layerEl ? layerEl.getAttribute('DESCRIPTION') : '',
    // Atributos da biblioteca que ajudam a IA a casar o tipo (base/aéreo/
    // torre, porta/gaveta). Ficam null quando a biblioteca não tem.
    promobAttrs: kind === 'module' ? {
      MOD_BAS_SUP_TRA: promobAttrValue(entity, 'MOD_BAS_SUP_TRA'),
      TIPO_CAIXA: promobAttrValue(entity, 'TIPO_CAIXA')
    } : null,
    inverted: String(entity.getAttribute('INVERTED') || '').toLowerCase() === 'true',
    width: w, height: h, depth: d,
    x: pl.x, y: pl.y, z: pl.z, rot: pl.rot,
    cx, cy,
    // Pegada no piso (4 cantos, pra planta de conferência e sobreposição).
    corners: [
      [pl.x, pl.y],
      [pl.x + wdx * w, pl.y + wdy * w],
      [pl.x + wdx * w + ddx * d, pl.y + wdy * w + ddy * d],
      [pl.x + ddx * d, pl.y + ddy * d]
    ]
  };
}

// Parede: o contorno vem como polígono na região "PAREDE_FACE_INFERIOR..."
// (face de baixo). Pra parede aberta de k trechos o polígono tem 2(k+1)
// pontos: os k+1 primeiros são uma face, os k+1 últimos a outra face em
// ordem inversa (conferido no arquivo de teste: 12 pontos, 5 trechos,
// espessura 150). Qual das duas é a INTERNA decide quem tem os módulos
// mais perto.
function promobReadWall(entity, nearbyItems) {
  const regions = promobChild(entity, 'REGIONS');
  let face = null;
  promobChildren(regions, 'REGION').forEach((reg) => {
    if (!face && /^PAREDE_FACE_INFERIOR/.test(reg.getAttribute('ID') || '')) face = reg;
  });
  if (!face) return null;
  const pos = promobChild(face, 'POSITION');
  const normal = promobChild(pos, 'NORMAL');
  const regBase = promobChild(pos, 'PONTOBASE');
  // NORMAL C=-1 = região vista "de baixo" → espelha X local.
  const sx = normal && promobNum(normal, 'C') < 0 ? -1 : 1;
  const ox = promobNum(regBase, 'X'), oy = promobNum(regBase, 'Y');
  const pl = promobReadPlacement(entity);
  const r = (pl.rot * Math.PI) / 180;
  const cosR = Math.cos(r), sinR = Math.sin(r);
  // O espelho (NORMAL C=-1) vale só pros pontos do contorno — o PONTOBASE da
  // região é deslocamento já no referencial da parede e NÃO espelha.
  // (Bug do Master Bath, 14/10: a região trazia PONTOBASE 557/1333 e a
  // parede saía deslocada dos móveis; na cozinha o PONTOBASE era zero.)
  const pts = promobChildren(promobChild(face, 'POINTS'), 'POINT').map((p) => {
    const lx = sx * promobNum(p, 'X') + ox;
    const ly = promobNum(p, 'Y') + oy;
    return [pl.x + lx * cosR - ly * sinR, pl.y + lx * sinR + ly * cosR];
  });
  if (pts.length < 4 || pts.length % 2 !== 0) return null;
  const half = pts.length / 2;
  const faceA = pts.slice(0, half);
  const faceB = pts.slice(half).reverse();
  const thickness = Math.round(Math.hypot(faceA[0][0] - faceB[0][0], faceA[0][1] - faceB[0][1])) || 150;
  const distToPolyline = (pt, line) => {
    let best = Infinity;
    for (let i = 0; i < line.length - 1; i++) {
      const [ax, ay] = line[i], [bx, by] = line[i + 1];
      const vx = bx - ax, vy = by - ay;
      const len2 = vx * vx + vy * vy || 1;
      const t = Math.max(0, Math.min(1, ((pt[0] - ax) * vx + (pt[1] - ay) * vy) / len2));
      best = Math.min(best, Math.hypot(pt[0] - (ax + t * vx), pt[1] - (ay + t * vy)));
    }
    return best;
  };
  let inner = faceA;
  const mods = nearbyItems.filter((it) => it.kind === 'module');
  if (mods.length) {
    const score = (line) => mods.reduce((s, it) => s + distToPolyline([it.cx, it.cy], line), 0);
    if (score(faceB) < score(faceA)) inner = faceB;
  }
  const dimEl = promobChild(entity, 'INSERTDIMENSION');
  return { polyline: inner, thicknessMm: thickness, ceilingMm: promobNum(dimEl, 'HEIGHT') || null };
}

// Sobreposição: pares de MÓDULOS (gabinetes) cujas pegadas se cobrem mais de
// 50% da menor E as faixas de altura se cruzam — quase sempre sobra de
// projeto no Promob (ex.: duas bases no mesmo canto). Não decide nada,
// só avisa na revisão.
function promobFindOverlaps(items) {
  // Só gabinete × gabinete: painel/filler/toekick (alguma medida ≤ 40mm)
  // fica DE PROPÓSITO encostado/embaixo dos gabinetes (toekick recuado sob a
  // base, filler dentro do blind corner) e só geraria ruído.
  const isCabinet = (it) => it.kind === 'module' && Math.min(it.width, it.height, it.depth) > 40;
  const boxes = items.filter(isCabinet).map((it) => {
    const xs = it.corners.map((c) => c[0]), ys = it.corners.map((c) => c[1]);
    return { it, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), z0: it.z, z1: it.z + it.height };
  });
  const out = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      const ix = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
      const iy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      const iz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
      if (ix <= 1 || iy <= 1 || iz <= 1) continue;
      const areaA = (a.x1 - a.x0) * (a.y1 - a.y0), areaB = (b.x1 - b.x0) * (b.y1 - b.y0);
      if (ix * iy > 0.5 * Math.min(areaA, areaB)) out.push([a.it, b.it]);
    }
  }
  return out;
}

// Entrada: Document XML do .ambient3d. Saída: { name, items, walls, overlaps, bbox }.
function parsePromobAmbientXml(doc) {
  const root = doc.documentElement;
  if (!root || root.nodeName !== 'AMBIENT3D') throw new Error('AMBIENT3D não encontrado');
  const floor = promobChild(root, 'INFORMACOES');
  const top = promobChildren(promobChild(floor, 'INFORMACOESCOLECAO'), 'INFORMACOES');
  const items = [];
  const wallEntities = [];
  top.forEach((e) => {
    if (e.getAttribute('TYPE') === 'WALL') {
      const kids = promobChildren(promobChild(e, 'INFORMACOESCOLECAO'), 'INFORMACOES').map((k) => promobReadEntity(k, 'wall'));
      kids.forEach((k) => items.push(k));
      wallEntities.push({ e, kids });
    } else {
      items.push(promobReadEntity(e, 'ambient'));
    }
  });
  const walls = wallEntities.map(({ e, kids }) => promobReadWall(e, kids.length ? kids : items)).filter(Boolean);

  const pts = [];
  walls.forEach((w) => w.polyline.forEach((p) => pts.push(p)));
  items.filter((it) => it.kind === 'module').forEach((it) => it.corners.forEach((c) => pts.push(c)));
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const bbox = pts.length
    ? { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }
    : { x0: 0, x1: 0, y0: 0, y1: 0 };

  return {
    name: root.getAttribute('NAME') || '',
    items,
    walls,
    overlaps: promobFindOverlaps(items),
    bbox
  };
}

// Promob (X,Y) em mm → portal (x,z) em mm, com a cena centrada na origem
// (o portal centra o ambiente padrão na origem, ver defaultProjectWallSegments).
function promobToPortalXZ(scene, X, Y) {
  const cx = (scene.bbox.x0 + scene.bbox.x1) / 2;
  const cy = (scene.bbox.y0 + scene.bbox.y1) / 2;
  return { x: Math.round(X - cx), z: Math.round(-(Y - cy)) };
}

// ---------- Leitura do arquivo (.promob = zip) ----------

async function readPromobFile(file) {
  if (typeof JSZip === 'undefined') throw new Error(I18n.t('project_importpromob.err_jszip_missing'));
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  // Caminhos do zip usam "\" — compara pelo final do nome, qualquer barra.
  const ambients = [];
  zip.forEach((path, entry) => {
    if (!entry.dir && /\.ambient3d$/i.test(path)) ambients.push(entry);
  });
  if (!ambients.length) throw new Error(I18n.t('project_importpromob.err_no_ambient'));
  // Mais de um ambiente no mesmo .promob: pega o maior (é a cena principal)
  // e avisa — importar vários ambientes fica pra depois.
  const sizes = await Promise.all(ambients.map(async (a) => ({ a, text: await a.async('string') })));
  sizes.sort((p, q) => q.text.length - p.text.length);
  const xmlText = sizes[0].text.replace(/^﻿/, '');
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error(I18n.t('project_importpromob.err_xml'));
  const scene = parsePromobAmbientXml(doc);
  scene.extraAmbients = sizes.length - 1;
  return scene;
}

// ---------- Mapeamento tipo Promob → módulo Legno (lembrado no navegador) ----------

function loadPromobTypeMap() {
  try {
    const raw = window.localStorage.getItem(PROMOB_MAP_STORAGE_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === 'object' ? obj : {};
  } catch (e) { return {}; }
}

function savePromobTypeMap(map) {
  try { window.localStorage.setItem(PROMOB_MAP_STORAGE_KEY, JSON.stringify(map)); } catch (e) { /* sem storage: só não lembra */ }
}

// Grava no navegador as escolhas JÁ FEITAS (IA ou manual) na hora, não só
// no "Criar" — 16/10: um clique fora do modal fechou a tela e perdeu a rodada
// inteira da IA. Tipo sem módulo não apaga escolha antiga.
function persistPromobMappingNow(mapping) {
  const saved = loadPromobTypeMap();
  Object.entries(mapping || {}).forEach(([k, v]) => { if (v && v.moduleId) saved[k] = v.moduleId; });
  savePromobTypeMap(saved);
}

function promobCatalogModules() {
  return (typeof allModules !== 'undefined' ? allModules : [])
    .filter((m) => m && m.active !== false && !m.is_invisible)
    .slice()
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

// Escolha inicial por tipo: 1) o que foi escolhido da última vez neste
// navegador; 2) módulo do catálogo com nome IGUAL ao tipo (ignorando
// maiúscula/pontuação). Fora isso fica SEM módulo — nunca chuta.
function promobInitialMapping(typeKeys) {
  const saved = loadPromobTypeMap();
  const mods = promobCatalogModules();
  const byName = new Map(mods.map((m) => [promobNormalizeName(m.name), m]));
  const mapping = {};
  typeKeys.forEach((k) => {
    if (saved[k] && mods.some((m) => m.id === saved[k])) { mapping[k] = { moduleId: saved[k], source: 'saved' }; return; }
    const hit = byName.get(promobNormalizeName(k));
    mapping[k] = hit ? { moduleId: hit.id, source: 'name' } : { moduleId: '', source: null };
  });
  return mapping;
}

// ---------- IA: sugerir módulo Legno por tipo (2026-10-14) ----------
//
// Pedido do Matt, com print da revisão toda laranja ("0 with a Legno module
// chosen"): "pode colocar a IA pra ajudar na procura pelo modulo".
// Usa a MESMA Edge Function das outras IAs do Projetos
// (generate-project-from-photo, etapa nova 'promob_match') e o MESMO
// catálogo compacto (buildProjectPhotoCatalog, portal-11).
//
// Regras:
//   · só preenche tipo que está SEM módulo — nunca passa por cima de escolha
//     lembrada, de mesmo nome ou feita à mão;
//   · confiança alta/média entra já escolhida (status "IA", com o porquê no
//     tooltip); baixa NÃO entra — vira só uma dica embaixo da tabela;
//   · nada é criado sem o clique em "Criar no projeto" (a revisão continua
//     sendo o lugar de conferir).
let projectImportPromobAiRunning = false;

function promobAiTypesPayload(res) {
  const modules = res.scene.items.filter((it) => it.kind === 'module');
  return res.typeKeys.map((k) => {
    const list = modules.filter((it) => it.typeKey === k);
    const sizes = [];
    list.forEach((it) => {
      const s = { w: Math.round(it.width), h: Math.round(it.height), d: Math.round(it.depth), z: Math.round(it.z) };
      if (!sizes.some((q) => q.w === s.w && q.h === s.h && q.d === s.d && q.z === s.z)) sizes.push(s);
    });
    const a = list[0].promobAttrs || {};
    const promob = { layer: list[0].layer || null };
    if (a.MOD_BAS_SUP_TRA) promob.MOD_BAS_SUP_TRA = a.MOD_BAS_SUP_TRA;
    if (a.TIPO_CAIXA) promob.TIPO_CAIXA = a.TIPO_CAIXA;
    return { type_key: k, description: list[0].description, count: list.length, sizes: sizes.slice(0, 6), promob };
  });
}

async function runProjectImportPromobAi(onlyMissing) {
  const res = projectImportPromobResult;
  if (!res || projectImportPromobAiRunning) return;
  const keys = res.typeKeys.filter((k) => !onlyMissing || !(res.mapping[k] && res.mapping[k].moduleId));
  if (!keys.length) return;
  projectImportPromobAiRunning = true;
  res.aiHints = {};
  setProjectImportPromobError('');
  setProjectImportPromobStatus(I18n.t('project_importpromob.ai_running', { n: keys.length }));
  renderProjectImportPromobReview();
  try {
    const catalog = await buildProjectPhotoCatalog();
    if (!catalog.length) throw new Error(I18n.t('project_importpromob.ai_no_catalog'));
    const types = promobAiTypesPayload(res).filter((t) => keys.includes(t.type_key));
    const { data, error } = await supabaseClient.functions.invoke('generate-project-from-photo', {
      body: { stage: 'promob_match', types, catalog }
    });
    if (error && !(data && data.matches)) {
      console.error('[importPromob] IA falhou:', error, data);
      throw new Error(typeof describeEdgeFunctionError === 'function'
        ? await describeEdgeFunctionError(error, data, 'generate-project-from-photo')
        : (error.message || String(error)));
    }
    const matches = (data && Array.isArray(data.matches)) ? data.matches : [];
    let applied = 0;
    matches.forEach((m) => {
      if (!m || !m.type_key || !keys.includes(m.type_key) || !m.module_id) return;
      if (!allModules.some((mm) => mm.id === m.module_id)) return;
      const cur = res.mapping[m.type_key];
      if (cur && cur.moduleId) return; // nunca passa por cima de escolha existente
      if (m.confidence === 'high' || m.confidence === 'medium') {
        res.mapping[m.type_key] = { moduleId: m.module_id, source: 'ai', confidence: m.confidence, reasoning: m.reasoning || '' };
        applied++;
      } else {
        res.aiHints[m.type_key] = { moduleId: m.module_id, reasoning: m.reasoning || '' };
      }
    });
    res.aiDone = { applied, asked: keys.length, model: data && data.model };
    if (applied) persistPromobMappingNow(res.mapping);
  } catch (err) {
    setProjectImportPromobError(I18n.t('project_importpromob.ai_err', { msg: err.message || String(err) }));
  } finally {
    projectImportPromobAiRunning = false;
    setProjectImportPromobStatus('');
    renderProjectImportPromobReview();
  }
}

// ---------- Modal ----------

function openProjectImportPromobModal() {
  const modal = document.getElementById('po-proj-importpromob-modal');
  if (!modal) return;
  projectImportPromobResult = null;
  const input = document.getElementById('po-proj-importpromob-input');
  if (input) input.value = '';
  const fn = document.getElementById('po-proj-importpromob-filename');
  if (fn) fn.textContent = '';
  const review = document.getElementById('po-proj-importpromob-review');
  if (review) { review.innerHTML = ''; review.style.display = 'none'; }
  const createBtn = document.getElementById('po-proj-importpromob-create-btn');
  if (createBtn) { createBtn.style.display = 'none'; createBtn.disabled = false; }
  const row = document.querySelector('.po-importpromob-file-row');
  if (row) row.style.display = '';
  setProjectImportPromobError('');
  setProjectImportPromobStatus('');
  modal.classList.add('open');
}

function closeProjectImportPromobModal() {
  const modal = document.getElementById('po-proj-importpromob-modal');
  if (modal) modal.classList.remove('open');
}

function setProjectImportPromobError(msg) {
  const el = document.getElementById('po-proj-importpromob-error');
  if (!el) return;
  el.textContent = msg || '';
  el.style.display = msg ? 'block' : 'none';
}

function setProjectImportPromobStatus(msg) {
  const el = document.getElementById('po-proj-importpromob-status');
  if (!el) return;
  el.textContent = msg || '';
  el.style.display = msg ? 'block' : 'none';
}

async function runProjectImportPromobAttach(file) {
  setProjectImportPromobError('');
  const fn = document.getElementById('po-proj-importpromob-filename');
  if (fn) fn.textContent = file.name;
  const btn = document.getElementById('po-proj-importpromob-file-btn');
  if (btn) btn.disabled = true;
  setProjectImportPromobStatus(I18n.t('project_importpromob.status_reading'));
  try {
    const scene = await readPromobFile(file);
    const modules = scene.items.filter((it) => it.kind === 'module');
    if (!modules.length) throw new Error(I18n.t('project_importpromob.err_no_modules'));
    const typeKeys = Array.from(new Set(modules.map((it) => it.typeKey)));
    projectImportPromobResult = { scene, typeKeys, mapping: promobInitialMapping(typeKeys), replaceWalls: scene.walls.length > 0 };
    renderProjectImportPromobReview();
    setProjectImportPromobStatus('');
    const row = document.querySelector('.po-importpromob-file-row');
    if (row) row.style.display = 'none';
    // Sobrou tipo sem módulo? A IA já procura sozinha (um clique só pro
    // Matt — mesmo espírito do "anexou o PDF, já processa" do 2020).
    if (projectImportPromobResult.typeKeys.some((k) => !projectImportPromobResult.mapping[k].moduleId)) {
      runProjectImportPromobAi(true);
    }
  } catch (err) {
    setProjectImportPromobStatus('');
    console.error('[importPromob] falha lendo arquivo:', err);
    setProjectImportPromobError(I18n.t('project_importpromob.err_read', { msg: err.message || String(err) }));
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ---------- Revisão: tipos + dropdown + planta de conferência ----------

function escapeHtmlImportPromob(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function promobFmtMm(n) { return String(Math.round(Number(n) || 0)); }

// Planta (vista de cima) só pra conferir o posicionamento antes de criar:
// paredes em cinza escuro, módulo casado em verde, sem módulo em laranja.
// Mesma orientação que vai aparecer no portal (frente dos módulos de r=0
// pra baixo da tela).
function renderPromobPlanSvg(res) {
  const { scene, mapping } = res;
  const b = scene.bbox;
  const pad = 200;
  const W = (b.x1 - b.x0) + 2 * pad, H = (b.y1 - b.y0) + 2 * pad;
  if (!(W > 0 && H > 0)) return '';
  // Promob Y cresce pra cima no desenho deles; no SVG Y cresce pra baixo →
  // inverte Y (mesmo que o z = −Y do portal).
  const tx = (x) => (x - b.x0 + pad).toFixed(0);
  const ty = (y) => (b.y1 - y + pad).toFixed(0);
  const walls = scene.walls.map((w) =>
    `<polyline points="${w.polyline.map((p) => `${tx(p[0])},${ty(p[1])}`).join(' ')}" fill="none" stroke="#555" stroke-width="${w.thicknessMm}" stroke-linejoin="miter" opacity="0.55"/>`
  ).join('');
  const mods = scene.items.filter((it) => it.kind === 'module')
    .slice().sort((p, q) => p.z - q.z)
    .map((it) => {
      const ok = mapping[it.typeKey] && mapping[it.typeKey].moduleId;
      const fill = ok ? '#4f9d69' : '#e08a2e';
      const elevated = it.z > 300;
      return `<polygon points="${it.corners.map((c) => `${tx(c[0])},${ty(c[1])}`).join(' ')}" fill="${fill}" fill-opacity="${elevated ? 0.25 : 0.55}" stroke="${fill}" stroke-width="12"${elevated ? ' stroke-dasharray="40 30"' : ''}><title>${escapeHtmlImportPromob(it.typeKey)} ${promobFmtMm(it.width)}×${promobFmtMm(it.height)}×${promobFmtMm(it.depth)}</title></polygon>`;
    }).join('');
  return `<svg class="po-importpromob-plan" viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}" preserveAspectRatio="xMidYMid meet">${walls}${mods}</svg>`;
}

function renderProjectImportPromobReview() {
  const el = document.getElementById('po-proj-importpromob-review');
  const res = projectImportPromobResult;
  if (!el || !res) return;
  const { scene, typeKeys, mapping } = res;
  const modules = scene.items.filter((it) => it.kind === 'module');
  const ignored = scene.items.filter((it) => it.kind !== 'module');
  const catalog = promobCatalogModules();

  const options = (selectedId) => [
    `<option value="">${escapeHtmlImportPromob(I18n.t('project_importpromob.opt_skip'))}</option>`,
    ...catalog.map((m) => `<option value="${escapeHtmlImportPromob(m.id)}"${m.id === selectedId ? ' selected' : ''}>${escapeHtmlImportPromob(m.name)}</option>`)
  ].join('');

  const rows = typeKeys.map((k) => {
    const list = modules.filter((it) => it.typeKey === k);
    const ws = Array.from(new Set(list.map((it) => promobFmtMm(it.width))));
    const sample = list[0];
    const sizes = `${ws.slice(0, 4).join(' / ')}${ws.length > 4 ? '…' : ''} × ${promobFmtMm(sample.height)} × ${promobFmtMm(sample.depth)}`;
    const mp = mapping[k] || {};
    let status;
    if (mp.moduleId && mp.source === 'ai') {
      status = `<span class="po-import2020-status ok po-importpromob-ai" title="${escapeHtmlImportPromob(mp.reasoning || '')}">${escapeHtmlImportPromob(I18n.t(mp.confidence === 'high' ? 'project_importpromob.src_ai_high' : 'project_importpromob.src_ai_medium'))}</span>`;
    } else if (mp.moduleId) {
      status = `<span class="po-import2020-status ok">${escapeHtmlImportPromob(I18n.t(mp.source === 'saved' ? 'project_importpromob.src_saved' : (mp.source === 'name' ? 'project_importpromob.src_name' : 'project_importpromob.src_manual')))}</span>`;
    } else if (projectImportPromobAiRunning) {
      status = `<span class="po-import2020-status warn">${escapeHtmlImportPromob(I18n.t('project_importpromob.src_ai_searching'))}</span>`;
    } else {
      status = `<span class="po-import2020-status warn">${escapeHtmlImportPromob(I18n.t('project_importpromob.src_none'))}</span>`;
    }
    return `
      <tr>
        <td>${escapeHtmlImportPromob(k)}</td>
        <td>${list.length}</td>
        <td class="mono">${escapeHtmlImportPromob(sizes)}</td>
        <td><select class="po-importpromob-map" data-type-key="${escapeHtmlImportPromob(k)}">${options(mp.moduleId)}</select></td>
        <td>${status}</td>
      </tr>`;
  }).join('');

  const nMapped = modules.filter((it) => mapping[it.typeKey] && mapping[it.typeKey].moduleId).length;

  const ignoredCounts = {};
  ignored.forEach((it) => {
    const label = it.description || it.type;
    ignoredCounts[label] = (ignoredCounts[label] || 0) + 1;
  });
  const ignoredHtml = Object.keys(ignoredCounts).length
    ? `<p class="hint">${escapeHtmlImportPromob(I18n.t('project_importpromob.ignored_line'))} ${Object.entries(ignoredCounts).map(([k, n]) => `${escapeHtmlImportPromob(k)} (${n})`).join(', ')}</p>`
    : '';

  const overlapHtml = scene.overlaps.length
    ? `<p class="hint po-importpromob-warn">${escapeHtmlImportPromob(I18n.t('project_importpromob.overlap_line', { n: scene.overlaps.length }))} ${scene.overlaps.map(([a, b]) => `${escapeHtmlImportPromob(a.typeKey)} ${promobFmtMm(a.width)} ↔ ${escapeHtmlImportPromob(b.typeKey)} ${promobFmtMm(b.width)}`).join('; ')}</p>`
    : '';

  const extraHtml = scene.extraAmbients > 0
    ? `<p class="hint po-importpromob-warn">${escapeHtmlImportPromob(I18n.t('project_importpromob.extra_ambients', { n: scene.extraAmbients }))}</p>`
    : '';

  const wallsHtml = scene.walls.length
    ? `<label class="po-importpromob-check"><input type="checkbox" id="po-proj-importpromob-walls"${res.replaceWalls ? ' checked' : ''}> ${escapeHtmlImportPromob(I18n.t('project_importpromob.replace_walls', { n: scene.walls.reduce((s, w) => s + w.polyline.length - 1, 0) }))}</label>`
    : '';

  // Dicas de confiança BAIXA (não aplicadas) + resumo da última rodada da IA.
  const hints = res.aiHints || {};
  const hintKeys = Object.keys(hints).filter((k) => !(mapping[k] && mapping[k].moduleId));
  const hintsHtml = hintKeys.length
    ? `<p class="hint po-importpromob-warn">${escapeHtmlImportPromob(I18n.t('project_importpromob.ai_low_hint'))} ${hintKeys.map((k) => {
        const m = catalog.find((mm) => mm.id === hints[k].moduleId);
        return `<b>${escapeHtmlImportPromob(k)}</b> → ${escapeHtmlImportPromob(m ? m.name : '?')}${hints[k].reasoning ? ` (${escapeHtmlImportPromob(hints[k].reasoning)})` : ''}`;
      }).join('; ')}</p>`
    : '';
  const missing = typeKeys.filter((k) => !(mapping[k] && mapping[k].moduleId)).length;
  const aiDoneHtml = res.aiDone
    ? `<span class="hint">${escapeHtmlImportPromob(I18n.t('project_importpromob.ai_done', { applied: res.aiDone.applied, asked: res.aiDone.asked }))}</span>`
    : '';
  const aiBarHtml = `
    <div class="po-importpromob-aibar">
      <button type="button" id="po-proj-importpromob-ai-btn" class="secondary"${projectImportPromobAiRunning || !missing ? ' disabled' : ''}>${escapeHtmlImportPromob(I18n.t('project_importpromob.ai_btn', { n: missing }))}</button>
      ${aiDoneHtml}
    </div>`;

  el.innerHTML = `
    <p class="hint">${escapeHtmlImportPromob(I18n.t('project_importpromob.summary_line', { name: scene.name || '—', total: modules.length, types: typeKeys.length, mapped: nMapped }))}</p>
    ${renderPromobPlanSvg(res)}
    ${aiBarHtml}
    <div class="po-import2020-tablewrap">
      <table class="po-import2020-table">
        <thead>
          <tr>
            <th>${escapeHtmlImportPromob(I18n.t('project_importpromob.col_type'))}</th>
            <th>${escapeHtmlImportPromob(I18n.t('project_import2020.col_qty'))}</th>
            <th>${escapeHtmlImportPromob(I18n.t('project_importpromob.col_sizes'))}</th>
            <th>${escapeHtmlImportPromob(I18n.t('project_import2020.col_module'))}</th>
            <th>${escapeHtmlImportPromob(I18n.t('project_import2020.col_status'))}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${hintsHtml}
    ${wallsHtml}
    ${overlapHtml}
    ${extraHtml}
    ${ignoredHtml}
  `;
  el.style.display = '';

  el.querySelectorAll('select.po-importpromob-map').forEach((sel) => {
    sel.addEventListener('change', () => {
      const k = sel.getAttribute('data-type-key');
      res.mapping[k] = { moduleId: sel.value, source: sel.value ? 'manual' : null };
      persistPromobMappingNow(res.mapping);
      renderProjectImportPromobReview();
    });
  });
  const aiBtn = document.getElementById('po-proj-importpromob-ai-btn');
  if (aiBtn) aiBtn.addEventListener('click', () => runProjectImportPromobAi(true));
  const wallsCb = document.getElementById('po-proj-importpromob-walls');
  if (wallsCb) wallsCb.addEventListener('change', () => { res.replaceWalls = wallsCb.checked; });

  const createBtn = document.getElementById('po-proj-importpromob-create-btn');
  if (createBtn) {
    createBtn.style.display = nMapped > 0 ? '' : 'none';
    createBtn.disabled = projectImportPromobAiRunning;
  }
}

// ---------- Criar no projeto ----------

// Painel avulso: o Promob às vezes guarda a espessura na LARGURA (painel
// lateral: 19 × 2420 × 909) e o módulo Legno equivalente guarda na
// PROFUNDIDADE (ou o contrário). Se o eixo fino não bate, troca largura ↔
// profundidade e gira 90° — o centro não muda, a pegada no piso fica a mesma.
function promobAdaptDimsToModule(it, m) {
  const THIN = 40;
  let w = it.width, d = it.depth, rot = it.rot;
  const promobThinW = w <= THIN && d > w;
  const promobThinD = d <= THIN && w > d;
  const legnoThinW = Number(m.width_default_mm) > 0 && Number(m.width_default_mm) <= THIN;
  const legnoThinD = Number(m.depth_default_mm) > 0 && Number(m.depth_default_mm) <= THIN;
  if ((promobThinW && legnoThinD && !legnoThinW) || (promobThinD && legnoThinW && !legnoThinD)) {
    [w, d] = [d, w];
    rot += 90;
  }
  return { width: w, height: it.height, depth: d, rot: ((rot % 360) + 360) % 360 };
}

function promobBuildWallSegments(scene) {
  const segs = [];
  scene.walls.forEach((w) => {
    for (let i = 0; i < w.polyline.length - 1; i++) {
      const a = promobToPortalXZ(scene, w.polyline[i][0], w.polyline[i][1]);
      const b = promobToPortalXZ(scene, w.polyline[i + 1][0], w.polyline[i + 1][1]);
      if (Math.hypot(b.x - a.x, b.z - a.z) < 1) continue;
      segs.push({ id: newProjectWallSegmentId(), ax: a.x, az: a.z, bx: b.x, bz: b.z, thicknessMm: w.thicknessMm || PROJECT_WALL_THICKNESS_MM, ceilingMm: null });
    }
  });
  return segs;
}

async function runProjectImportPromobBuild() {
  const res = projectImportPromobResult;
  if (!res) return;
  const { scene, mapping } = res;
  const todo = scene.items.filter((it) => it.kind === 'module' && mapping[it.typeKey] && mapping[it.typeKey].moduleId);
  if (!todo.length) return;

  if (projectSlots.length > 0 && !confirm(I18n.t('project_import2020.confirm_replace'))) return;

  // Lembra as escolhas (só as feitas — tipo sem módulo não apaga escolha antiga).
  const saved = loadPromobTypeMap();
  Object.entries(mapping).forEach(([k, v]) => { if (v && v.moduleId) saved[k] = v.moduleId; });
  savePromobTypeMap(saved);

  const createBtn = document.getElementById('po-proj-importpromob-create-btn');
  if (createBtn) createBtn.disabled = true;
  setProjectImportPromobError('');
  setProjectImportPromobStatus(I18n.t('project_import2020.status_building'));

  const failed = [];
  const adjusted = [];
  try {
    // 1) Paredes ANTES dos módulos — o pé-direito limita a altura na inserção
    // e o retângulo do piso limita onde módulo solto pode ficar.
    if (res.replaceWalls && scene.walls.length) {
      const segs = promobBuildWallSegments(scene);
      if (segs.length) {
        projectWallSegments = segs;
        const ceilingMm = Math.max(...scene.walls.map((w) => w.ceilingMm || 0));
        if (ceilingMm > 0) {
          const un = (document.getElementById('po-unit-select') || {}).value || 'mm';
          const inp = document.getElementById('po-proj-ceiling-input');
          if (inp) { inp.value = formatDimension(ceilingMm, un); inp.dispatchEvent(new Event('change')); }
        }
        if (typeof refreshProjectWallTabs === 'function') refreshProjectWallTabs();
        if (typeof refreshProjectWallWidthInput === 'function') refreshProjectWallWidthInput();
      }
    }

    projectSlots = [];
    selectedProjectSlotId = null;
    // Render vazio pra cena 3D (e o retângulo do piso) já refletir as paredes novas.
    renderProjectCanvas();

    // 2) Módulos, de baixo pra cima (aéreo depois da base).
    const ordered = todo.slice().sort((a, b) => a.z - b.z);
    for (const it of ordered) {
      const m = allModules.find((mm) => mm.id === mapping[it.typeKey].moduleId);
      if (!m) { failed.push(it); continue; }
      const dims = promobAdaptDimsToModule(it, m);
      const c = promobToPortalXZ(scene, it.cx, it.cy);
      const slot = await insertProjectModuleDefault(m.id, {
        placement: 'floor',
        floor_x_mm: c.x,
        floor_z_mm: c.z,
        wall_index: 0,
        width_mm: dims.width,
        height_mm: dims.height
      });
      if (!slot) { failed.push(it); continue; }
      slot.floor_rotation_deg = dims.rot;
      slot.floor_height_mm = Math.max(0, Math.round(it.z));
      if (dims.depth > 0 && typeof projectSlotClampedDimensionMm === 'function') {
        slot.depth_mm = projectSlotClampedDimensionMm(slot, 'depth', dims.depth);
      }
      recomputeProjectSlotPricing(slot);
      const diff = Math.abs(slot.width_mm - dims.width) > 1 || Math.abs(slot.height_mm - dims.height) > 1 || Math.abs(slot.depth_mm - dims.depth) > 1;
      if (diff) adjusted.push({ it, slot, want: dims });
    }

    renderProjectCanvas();
    markProjectDirty();
    closeProjectImportPromobModal();

    if (adjusted.length) {
      console.warn('[importPromob] medidas ajustadas pelo mín/máx do catálogo:', adjusted.map((a) => `${a.it.typeKey} ${a.want.width}×${a.want.height}×${a.want.depth} → ${a.slot.width_mm}×${a.slot.height_mm}×${a.slot.depth_mm}`));
    }
    const msgEl = document.getElementById('po-proj-error');
    if (msgEl) {
      const lines = [I18n.t('project_import2020.done_summary', { n: todo.length - failed.length })];
      if (adjusted.length) lines.push(I18n.t('project_importpromob.done_adjusted', { n: adjusted.length }));
      if (failed.length) lines.push(I18n.t('project_importpromob.done_failed', { n: failed.length }));
      const skipped = scene.items.filter((it) => it.kind === 'module').length - todo.length;
      if (skipped > 0) lines.push(I18n.t('project_importpromob.done_skipped', { n: skipped }));
      msgEl.textContent = lines.join(' — ');
      msgEl.style.display = 'block';
    }
  } catch (err) {
    console.error('[importPromob] falha montando projeto:', err);
    setProjectImportPromobError(err.message || String(err));
  } finally {
    setProjectImportPromobStatus('');
    if (createBtn) createBtn.disabled = false;
  }
}

// ---------- Listeners ----------

(function attachProjectImportPromobListeners() {
  if (typeof document === 'undefined') return;
  const openBtn = document.getElementById('po-proj-importpromob-open-btn');
  if (openBtn) openBtn.addEventListener('click', openProjectImportPromobModal);
  const closeBtn = document.getElementById('po-proj-importpromob-modal-close');
  if (closeBtn) closeBtn.addEventListener('click', closeProjectImportPromobModal);
  const cancelBtn = document.getElementById('po-proj-importpromob-cancel-btn');
  if (cancelBtn) cancelBtn.addEventListener('click', closeProjectImportPromobModal);
  const createBtn = document.getElementById('po-proj-importpromob-create-btn');
  if (createBtn) createBtn.addEventListener('click', runProjectImportPromobBuild);
  const fileBtn = document.getElementById('po-proj-importpromob-file-btn');
  const input = document.getElementById('po-proj-importpromob-input');
  if (fileBtn && input) {
    fileBtn.addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      const f = input.files && input.files[0];
      if (f) runProjectImportPromobAttach(f);
    });
  }
  const modal = document.getElementById('po-proj-importpromob-modal');
  // 16/10: clicar fora do modal e Esc NÃO fecham mais (perdia a revisão +
  // rodada da IA). Só o X e o Cancelar fecham.
})();
