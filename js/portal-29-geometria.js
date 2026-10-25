// ==========================================================================
// GEOMETRIA DA PAREDE — coluna, viga, sanca, escada, lareira... (2026-10-24)
// ==========================================================================
// Matt: "aqui em Wall, quero mais um botão de geometria ... uma coluna, um
// bloco, uma viga ... algo dedicado aqui, pra se integrar com a parede, que
// seja mais parede do que objeto. Não aparecer no orçamento" + "tira tudo
// que tem em móveis. Vamos criar isso separado só pras paredes, como fizemos
// com floor" + "cor da parede (depois acrescentar textura, ex.: tijolinho na
// lareira)".
//
// SEPARADO dos módulos de propósito: não é projectSlots, não tem preço, não
// entra em pedido/plano de corte/Proposta/etiqueta — não existe pra nada
// disso. Mora em projectGeometria (lista própria) e é salvo no projeto em
// user_projects.geometria (migration 222).
//
// Cada elemento: { id, tipo, wall_index, x_mm, y_mm, w_mm, h_mm, d_mm, p:{} }
//   x_mm = borda esquerda ao longo da parede (mesmo referencial do x_mm dos
//          módulos), y_mm = altura do chão, w/h/d = largura/altura/
//          profundidade (pra fora da parede), p = parâmetros do tipo.
// Desenho: viewer3d_composition.setArchitectureBuilder → geometriaMontar
// monta tudo no mundo a cada render (cor da parede, sem custo).
// Arco de passagem e nicho RECORTAM a parede: geometriaAberturasDaParede
// entra em projectWallOpeningsWithSlots (portal-08).
// ==========================================================================

let projectGeometria = [];
let geometriaSelId = null;

const GEO_TXT = {
  pt: {
    btn: 'Geometria', title: 'Geometria da parede', subtitle: 'Elementos da construção — mesma cor da parede, fora do orçamento. Escolha um para adicionar na parede ativa. No 3D: clique para selecionar, arraste para mover (inclusive para outra parede), Delete remove.',
    add: 'Adicionar', in_project: 'No projeto', empty: 'Nenhum elemento ainda.', wall: 'Parede', pos: 'Distância da esquerda', y: 'Altura do chão',
    w: 'Largura', h: 'Altura', d: 'Profundidade', diam: 'Diâmetro', length: 'Comprimento', total_h: 'Altura total', stair_w: 'Largura da escada',
    rail_h: 'Altura do corrimão', rail_off: 'Afastamento da parede', rise: 'Subida (inclinação)', depth_niche: 'Profundidade do nicho',
    top: 'Topo', top_arch: 'Em arco', top_flat: 'Reto', goes_up: 'Sobe para', right: 'Direita', left: 'Esquerda',
    dup: 'Duplicar', del: 'Remover', steps: 'degraus', wall_n: 'Parede {n}',
    t_pilar: 'Pilar', t_coluna_redonda: 'Coluna redonda', t_viga: 'Viga', t_sanca: 'Sanca / rebaixo', t_chase: 'Caixa de tubulação',
    t_mureta: 'Mureta', t_arco: 'Arco de passagem', t_nicho: 'Nicho', t_escada_reta: 'Escada reta', t_corrimao: 'Corrimão', t_lareira: 'Lareira'
  },
  en: {
    btn: 'Geometry', title: 'Wall geometry', subtitle: 'Building elements — same color as the wall, not in the quote. Pick one to add on the active wall. In 3D: click to select, drag to move (also onto another wall), Delete removes.',
    add: 'Add', in_project: 'In this project', empty: 'No elements yet.', wall: 'Wall', pos: 'Distance from left', y: 'Height from floor',
    w: 'Width', h: 'Height', d: 'Depth', diam: 'Diameter', length: 'Length', total_h: 'Total height', stair_w: 'Stair width',
    rail_h: 'Handrail height', rail_off: 'Distance from wall', rise: 'Rise (slope)', depth_niche: 'Niche depth',
    top: 'Top', top_arch: 'Arched', top_flat: 'Flat', goes_up: 'Goes up to the', right: 'Right', left: 'Left',
    dup: 'Duplicate', del: 'Remove', steps: 'steps', wall_n: 'Wall {n}',
    t_pilar: 'Pillar', t_coluna_redonda: 'Round column', t_viga: 'Beam', t_sanca: 'Soffit / bulkhead', t_chase: 'Pipe chase',
    t_mureta: 'Half wall', t_arco: 'Archway', t_nicho: 'Niche', t_escada_reta: 'Straight stairs', t_corrimao: 'Handrail', t_lareira: 'Fireplace'
  },
  es: {
    btn: 'Geometría', title: 'Geometría de la pared', subtitle: 'Elementos de la construcción — mismo color de la pared, fuera del presupuesto. Elige uno para agregar en la pared activa. En el 3D: clic para seleccionar, arrastra para mover (también a otra pared), Supr elimina.',
    add: 'Agregar', in_project: 'En el proyecto', empty: 'Ningún elemento todavía.', wall: 'Pared', pos: 'Distancia desde la izquierda', y: 'Altura del piso',
    w: 'Ancho', h: 'Alto', d: 'Profundidad', diam: 'Diámetro', length: 'Largo', total_h: 'Alto total', stair_w: 'Ancho de la escalera',
    rail_h: 'Altura del pasamanos', rail_off: 'Separación de la pared', rise: 'Subida (inclinación)', depth_niche: 'Profundidad del nicho',
    top: 'Remate', top_arch: 'En arco', top_flat: 'Recto', goes_up: 'Sube hacia la', right: 'Derecha', left: 'Izquierda',
    dup: 'Duplicar', del: 'Quitar', steps: 'escalones', wall_n: 'Pared {n}',
    t_pilar: 'Pilar', t_coluna_redonda: 'Columna redonda', t_viga: 'Viga', t_sanca: 'Plafón / bajada', t_chase: 'Caja de tuberías',
    t_mureta: 'Muro bajo', t_arco: 'Arco de paso', t_nicho: 'Nicho', t_escada_reta: 'Escalera recta', t_corrimao: 'Pasamanos', t_lareira: 'Chimenea'
  }
};
function geoT(k, vars) {
  const lang = (typeof I18n !== 'undefined' && I18n.getLanguage && I18n.getLanguage()) || 'pt';
  let t = (GEO_TXT[lang] && GEO_TXT[lang][k]) || GEO_TXT.pt[k] || k;
  if (vars) Object.keys(vars).forEach((v) => { t = t.replace('{' + v + '}', vars[v]); });
  return t;
}

function geoTeto() {
  try { return Number(roomSettings && roomSettings.ceiling_mm) || 2438; } catch (e) { return 2438; }
}

// Ícones 24×24 no mesmo traço da barra
const GEO_ICONES = {
  pilar: '<rect x="8" y="3" width="8" height="18" rx="0.5"/><path d="M5 21h14"/>',
  coluna_redonda: '<ellipse cx="12" cy="5" rx="4" ry="1.5"/><path d="M8 5v14M16 5v14"/><ellipse cx="12" cy="19" rx="4" ry="1.5"/>',
  viga: '<path d="M3 4h18M3 4v4h18V4"/><path d="M6 8v12M18 8v12" stroke-dasharray="2 2"/>',
  sanca: '<path d="M3 3h18"/><path d="M3 3v5h18V3"/><rect x="4" y="9" width="7" height="6"/><rect x="13" y="9" width="7" height="6"/>',
  chase: '<path d="M4 3v18M4 3h7v18"/><path d="M7 6v12" stroke-dasharray="2 2"/>',
  mureta: '<path d="M3 21h18"/><rect x="5" y="12" width="14" height="9"/>',
  arco: '<path d="M4 21V10a8 8 0 0 1 16 0v11"/><path d="M8 21v-9a4 4 0 0 1 8 0v9"/>',
  nicho: '<rect x="3" y="3" width="18" height="18" rx="0.5"/><rect x="8" y="7" width="8" height="10"/><path d="M8 7l2 2h4l2-2M10 9v8M14 9v8"/>',
  escada_reta: '<path d="M3 21h4v-4h4v-4h4V9h4V5h2"/>',
  corrimao: '<path d="M3 9h18"/><path d="M6 9v4M18 9v4M12 9v4"/><path d="M3 21h18"/>',
  lareira: '<path d="M5 21V8h14v13"/><path d="M3 8h18"/><path d="M9 21v-6a3 3 0 0 1 6 0v6"/>'
};

// Campos de cada tipo: [chave do elemento, rótulo]. 'y' só onde faz sentido.
const GEO_TIPOS = {
  pilar:          { campos: [['w', 'w'], ['d', 'd'], ['h', 'h']], def: () => ({ w: 300, d: 300, h: geoTeto(), y: 0 }) },
  coluna_redonda: { campos: [['w', 'diam'], ['h', 'h']], def: () => ({ w: 300, d: 300, h: geoTeto(), y: 0 }) },
  viga:           { campos: [['w', 'length'], ['h', 'h'], ['d', 'd'], ['y', 'y']], def: () => ({ w: 2000, h: 250, d: 300, y: geoTeto() - 250 }) },
  sanca:          { campos: [['w', 'length'], ['h', 'h'], ['d', 'd'], ['y', 'y']], def: () => ({ w: 2400, h: 305, d: 330, y: geoTeto() - 305 }) },
  chase:          { campos: [['w', 'w'], ['d', 'd'], ['h', 'h']], def: () => ({ w: 300, d: 250, h: geoTeto(), y: 0 }) },
  mureta:         { campos: [['w', 'length'], ['h', 'h'], ['d', 'd']], def: () => ({ w: 1500, h: 1067, d: 114, y: 0 }) },
  arco:           { campos: [['w', 'w'], ['h', 'h']], extra: 'topo', abertura: 'door', def: () => ({ w: 914, h: 2134, d: 0, y: 0, p: { topo: 'arco' } }) },
  nicho:          { campos: [['w', 'w'], ['h', 'h'], ['d', 'depth_niche'], ['y', 'y']], abertura: 'nicho', def: () => ({ w: 600, h: 600, d: 100, y: 1200 }) },
  escada_reta:    { campos: [['w', 'length'], ['h', 'total_h'], ['d', 'stair_w']], extra: 'sobe', def: () => ({ w: 3048, h: Math.min(geoTeto(), 2743), d: 914, y: 0, p: { sobe: 'direita' } }) },
  corrimao:       { campos: [['w', 'length'], ['h', 'rail_h'], ['d', 'rail_off'], ['y', 'y'], ['p.subida', 'rise']], def: () => ({ w: 3000, h: 914, d: 75, y: 0, p: { subida: 0 } }) },
  lareira:        { campos: [['w', 'w'], ['d', 'd'], ['h', 'h']], def: () => ({ w: 1524, d: 400, h: geoTeto(), y: 0 }) }
};
const GEO_ORDEM = ['pilar', 'coluna_redonda', 'viga', 'sanca', 'chase', 'mureta', 'arco', 'nicho', 'escada_reta', 'corrimao', 'lareira'];

function geoNovoId() { return 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function geoParedes() {
  try { return (typeof getProjectWallGeometry === 'function' ? getProjectWallGeometry() : []) || []; } catch (e) { return []; }
}

function adicionarGeometria(tipo) {
  const T = GEO_TIPOS[tipo];
  if (!T) return;
  const d = T.def();
  const paredes = geoParedes();
  const wi = (typeof projectActiveWallIndex !== 'undefined' && paredes.some((p) => p.wallIndex === projectActiveWallIndex)) ? projectActiveWallIndex : ((paredes[0] && paredes[0].wallIndex) || 0);
  const wall = paredes.find((p) => p.wallIndex === wi);
  const larg = wall ? Number(wall.widthM) * 1000 : 3000;
  const el = {
    id: geoNovoId(), tipo, wall_index: wi,
    x_mm: Math.max(0, Math.round((larg - d.w) / 2)), y_mm: d.y || 0,
    w_mm: d.w, h_mm: d.h, d_mm: d.d, p: Object.assign({}, d.p || {})
  };
  projectGeometria.push(el);
  geometriaSelId = el.id;
  geometriaMudou();
}

function geometriaMudou() {
  try { if (typeof markProjectDirty === 'function') markProjectDirty(); } catch (e) { /* ok */ }
  try { if (typeof renderProjectCanvas === 'function') renderProjectCanvas(); } catch (e) { /* ok */ }
  try {
    const w = document.getElementById('po-proj-3d-wrap');
    if (w && w.style.display !== 'none' && typeof generateProject3D === 'function') generateProject3D();
  } catch (e) { /* ok */ }
}

// Salvar / abrir (portal-09) e projeto novo (portal-08)
function getProjectGeometriaForSave() {
  return projectGeometria.length ? JSON.parse(JSON.stringify(projectGeometria)) : null;
}
function restoreProjectGeometria(v) {
  projectGeometria = Array.isArray(v) ? v.filter((e) => e && GEO_TIPOS[e.tipo]).map((e) => Object.assign({ p: {} }, e)) : [];
  geometriaSelId = null;
  const m = document.getElementById('po-geo-modal');
  if (m && m.classList.contains('open')) renderJanelaGeometria();
}

// Recortes na parede (arco de passagem, nicho) — ver projectWallOpeningsWithSlots
function geometriaAberturasDaParede(idx) {
  return projectGeometria
    .filter((e) => GEO_TIPOS[e.tipo] && GEO_TIPOS[e.tipo].abertura && Number(e.wall_index) === Number(idx))
    .map((e) => ({
      id: 'geo_' + e.id,
      type: GEO_TIPOS[e.tipo].abertura,
      x_mm: Number(e.x_mm) || 0,
      width_mm: Number(e.w_mm) || 0,
      height_mm: Number(e.h_mm) || 0,
      sill_mm: e.tipo === 'arco' ? 0 : (Number(e.y_mm) || 0),
      fromGeometria: true
    }));
}

// ---------------------------------------------------------------- 3D
// Local de cada elemento: x 0..w ao longo da parede (da esquerda), y pra
// cima a partir de y_mm, z 0..d saindo da parede pra dentro do ambiente.
function geometriaMontar(THREE, ctx) {
  if (!projectGeometria.length) return null;
  const paredes = geoParedes();
  const raiz = new THREE.Group();
  raiz.userData.isGeometria = true;
  const matParede = new THREE.MeshStandardMaterial({ color: ctx.wallColor, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
  const matEscuro = new THREE.MeshStandardMaterial({ color: 0x2b2a28, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
  const matPedra = new THREE.MeshStandardMaterial({ color: 0x8d8780, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
  const matLinha = new THREE.LineBasicMaterial({ color: 0x9c968b });
  const comContorno = (mesh) => {
    try {
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 30), matLinha);
      mesh.add(e);
    } catch (err) { /* sem contorno */ }
    return mesh;
  };
  const caixa = (g, x0, y0, z0, w, h, d, mat) => {
    if (!(w > 0.0005 && h > 0.0005 && d > 0.0005)) return null;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat || matParede);
    m.position.set(x0 + w / 2, y0 + h / 2, z0 + d / 2);
    g.add(comContorno(m));
    return m;
  };
  const cilindro = (g, cx, cy, cz, r, len, eixo, mat) => {
    const geo = new THREE.CylinderGeometry(r, r, len, 28);
    if (eixo === 'x') geo.rotateZ(Math.PI / 2);
    if (eixo === 'z') geo.rotateX(Math.PI / 2);
    const m = new THREE.Mesh(geo, mat || matParede);
    m.position.set(cx, cy, cz);
    g.add(comContorno(m));
    return m;
  };

  projectGeometria.forEach((el) => {
    const wall = paredes.find((p) => p.wallIndex === Number(el.wall_index));
    if (!wall) return;
    const w = (Number(el.w_mm) || 0) / 1000, h = (Number(el.h_mm) || 0) / 1000, d = (Number(el.d_mm) || 0) / 1000;
    const g = new THREE.Group();
    const p = el.p || {};
    switch (el.tipo) {
      case 'pilar': case 'chase': case 'viga': case 'sanca': case 'mureta':
        caixa(g, 0, 0, 0, w, h, d);
        break;
      case 'coluna_redonda': {
        const r = w / 2;
        const hb = Math.min(0.12, h * 0.1), hc = Math.min(0.08, h * 0.06);
        caixa(g, -0.02, 0, 0, w + 0.04, hb, w + 0.02);             // base (plinto)
        cilindro(g, r, h / 2, r, r * 0.86, h - hb - hc + 0.002, 'y').position.y = hb + (h - hb - hc) / 2; // fuste
        caixa(g, -0.02, h - hc, 0, w + 0.04, hc, w + 0.02);        // capitel
        break;
      }
      case 'arco': {
        const esp = ctx.wallThicknessM || 0.15;
        if (p.topo !== 'reto' && w > 0.05) {
          const r = Math.min(w / 2, h);
          const sh = new THREE.Shape();
          const m = 0.012; // tampa passa 12 mm do vão: o traço do retângulo fica por trás dela, não na borda
          sh.moveTo(-m, h - r); sh.lineTo(-m, h + m); sh.lineTo(w + m, h + m); sh.lineTo(w + m, h - r); sh.lineTo(w, h - r);
          sh.absarc(w / 2, h - r, r, 0, Math.PI, false);
          sh.lineTo(-m, h - r);
          // Tampa os cantos do vão retangular. Passa 2 mm pra fora das duas
          // faces da parede: cobre o traço do retângulo que a parede desenha
          // (Matt: "no arco vejo as linhas"). Contorno só da CURVA.
          const folga = 0.001;
          // Duas placas planas (frente e trás, sem faces laterais pra não
          // aparecer "fresta") + a faixa curva do intradorso.
          const mat = matParede.clone();
          mat.polygonOffset = true; mat.polygonOffsetFactor = -1; mat.polygonOffsetUnits = -1;
          [folga, -esp - folga].forEach((z) => {
            const pg = new THREE.ShapeGeometry(sh, 48);
            pg.translate(0, 0, z);
            g.add(new THREE.Mesh(pg, mat));
          });
          const tira = [];
          const N = 48;
          for (let i = 0; i < N; i++) {
            const a0 = Math.PI * i / N, a1 = Math.PI * (i + 1) / N;
            const p0 = [w / 2 + r * Math.cos(a0), h - r + r * Math.sin(a0)], p1 = [w / 2 + r * Math.cos(a1), h - r + r * Math.sin(a1)];
            const zf = folga, zt = -esp - folga;
            tira.push(p0[0], p0[1], zf, p1[0], p1[1], zf, p1[0], p1[1], zt, p0[0], p0[1], zf, p1[0], p1[1], zt, p0[0], p0[1], zt);
          }
          const tg = new THREE.BufferGeometry();
          tg.setAttribute('position', new THREE.Float32BufferAttribute(tira, 3));
          tg.computeVertexNormals();
          g.add(new THREE.Mesh(tg, matParede));
          const pts = [];
          for (let i = 0; i <= 48; i++) { const a = Math.PI * i / 48; pts.push(new THREE.Vector3(w / 2 + r * Math.cos(a), h - r + r * Math.sin(a), 0)); }
          [folga, -esp - folga].forEach((z) => {
            const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map((q) => new THREE.Vector3(q.x, q.y, z))), matLinha);
            g.add(ln);
          });
        }
        break;
      }
      case 'nicho': {
        const esp = ctx.wallThicknessM || 0.15;
        const prof = Math.min(Math.max(d, 0.02), esp - 0.01);
        const t = 0.006;
        caixa(g, 0, 0, -esp, w, h, esp - prof);      // fundo (fecha o vão até a face de fora)
        caixa(g, 0, 0, -prof, w, t, prof);           // base
        caixa(g, 0, h - t, -prof, w, t, prof);       // teto
        caixa(g, 0, 0, -prof, t, h, prof);           // lado esq.
        caixa(g, w - t, 0, -prof, t, h, prof);       // lado dir.
        break;
      }
      case 'escada_reta': {
        const n = Math.max(2, Math.round(h / 0.19));
        const espelho = h / n, piso = w / n;
        const paraDireita = p.sobe !== 'esquerda';
        // UM bloco só (Matt: "deixa um bloco só") — perfil dos degraus
        // extrudado na largura da escada; contorno só nas quinas dos degraus.
        const fx = (x) => paraDireita ? x : w - x;
        const pts = [[0, 0], [w, 0], [w, h]];
        for (let i = n - 1; i >= 0; i--) { pts.push([i * piso, (i + 1) * espelho]); pts.push([i * piso, i * espelho]); }
        pts.pop();
        const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(fx(x), y)));
        if (d > 0.01) {
          g.add(new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: false }), matParede));
          // Contorno feito à mão: o EdgesGeometry riscava a diagonal da
          // triangulação (cantos internos dos degraus ficam alinhados).
          const seg = [];
          const P = pts.map(([x, y]) => [fx(x), y]);
          P.forEach(([x, y], i) => {
            const [x2, y2] = P[(i + 1) % P.length];
            seg.push(x, y, 0, x2, y2, 0, x, y, d, x2, y2, d, x, y, 0, x, y, d);
          });
          const bg = new THREE.BufferGeometry();
          bg.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
          g.add(new THREE.LineSegments(bg, matLinha));
        }
        break;
      }
      case 'corrimao': {
        const sub = (Number(p.subida) || 0) / 1000;
        const ang = Math.atan2(sub, Math.max(w, 0.01));
        const comp = Math.hypot(w, sub);
        const trilho = cilindro(g, w / 2, h + sub / 2, d, 0.022, comp, 'x');
        trilho.rotation.z = ang;
        const nSup = Math.max(2, Math.ceil(w / 1.2) + 1);
        for (let i = 0; i < nSup; i++) {
          const x = 0.1 + (w - 0.2) * (i / (nSup - 1));
          const y = h + sub * (x / Math.max(w, 0.01)) - 0.04;
          cilindro(g, x, y, d / 2, 0.008, d, 'z');
          cilindro(g, x, y, 0.004, 0.03, 0.008, 'z');   // roseta na parede
        }
        break;
      }
      case 'lareira': {
        const fw = Math.min(0.9, w * 0.6), fh = Math.min(0.78, h * 0.35);
        const rec = Math.min(0.32, Math.max(d - 0.06, 0.05));
        const xl = (w - fw) / 2;
        // Corpo num bloco só (sem emenda entre as partes): contorno em "U
        // invertido" com a boca da lareira, extrudado na profundidade.
        const sh = new THREE.Shape([[0, 0], [xl, 0], [xl, fh], [xl + fw, fh], [xl + fw, 0], [w, 0], [w, h], [0, h]].map(([x, y]) => new THREE.Vector2(x, y)));
        if (d > 0.01) g.add(comContorno(new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: false }), matParede)));
        caixa(g, xl, 0, 0, fw, fh, d - rec, matEscuro);    // fundo da boca (escuro)
        const yM = Math.min(1.37, h - 0.12);
        caixa(g, -0.08, yM, 0, w + 0.16, 0.06, d + 0.08);  // prateleira (mantel)
        caixa(g, -0.15, 0, d, w + 0.3, 0.03, 0.45, matPedra); // soleira (hearth)
        break;
      }
      default: return;
    }
    // Realce de seleção (contorno vermelho, igual módulo) — nasce escondido;
    // geoMostraSelecao liga no selecionado sem refazer a cena.
    try {
      const bb = new THREE.Box3().setFromObject(g);
      if (!bb.isEmpty()) {
        const sz = bb.getSize(new THREE.Vector3()).addScalar(0.02), c = bb.getCenter(new THREE.Vector3());
        const realce = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(sz.x, sz.y, sz.z)),
          new THREE.LineBasicMaterial({ color: 0xe53935, depthTest: false, transparent: true }));
        realce.position.copy(c);
        realce.renderOrder = 20;
        realce.visible = el.id === geometriaSelId;
        realce.userData.geoRealce = true;
        g.add(realce);
      }
    } catch (e) { /* sem realce */ }
    geoPosiciona(g, el, wall);
    g.userData.geometriaId = el.id;
    raiz.add(g);
  });
  return raiz;
}

// Leva o local (x ao longo, z pra dentro) pro mundo. O giro que põe +Z no
// "pra dentro" pode deixar +X no CONTRA da parede (paredes do lado esquerdo)
// — aí espelha em X pra a esquerda do elemento continuar sendo a ponta A da
// parede (mesmo x_mm dos módulos). Usado no render e no arrastar.
function geoPosiciona(g, el, wall) {
  const along = { x: Number(wall.alongDirX) || 0, z: Number(wall.alongDirZ) || 0 };
  const into = { x: Number(wall.intoDirX) || 0, z: Number(wall.intoDirZ) || 0 };
  const rot = Math.atan2(into.x, into.z);
  const lx = { x: Math.cos(rot), z: -Math.sin(rot) };
  const sinal = (lx.x * along.x + lx.z * along.z) < 0 ? -1 : 1;
  const xm = (Number(el.x_mm) || 0) / 1000;
  g.rotation.set(0, rot, 0);
  g.scale.set(sinal, 1, 1);
  g.position.set(Number(wall.originX) + along.x * xm, (Number(el.y_mm) || 0) / 1000, Number(wall.originZ) + along.z * xm);
}

(function ligaViewers() {
  [typeof ViewerProjectEdit !== 'undefined' ? ViewerProjectEdit : null,
    typeof ViewerProject !== 'undefined' ? ViewerProject : null].forEach((v) => {
    if (v && v.setArchitectureBuilder) v.setArchitectureBuilder(geometriaMontar);
  });
})();

// ---------------------------------------------------------------- janela
function geoUnidade() { return (document.getElementById('po-unit-select') || {}).value || 'mm'; }
function geoFmt(mm) {
  try { return (typeof formatDimensionNumber === 'function') ? formatDimensionNumber(mm, geoUnidade()) : String(Math.round(mm)); } catch (e) { return String(Math.round(mm)); }
}
function geoParse(txt) {
  try {
    const v = (typeof parseDimensionInput === 'function') ? parseDimensionInput(txt, geoUnidade()) : parseFloat(txt);
    return (v === null || isNaN(v)) ? null : v;
  } catch (e) { return null; }
}
function geoValor(el, chave) {
  if (chave.indexOf('p.') === 0) return Number((el.p || {})[chave.slice(2)]) || 0;
  return Number(el[chave + '_mm']) || 0;
}
function geoSetValor(el, chave, mm) {
  if (chave.indexOf('p.') === 0) { el.p = el.p || {}; el.p[chave.slice(2)] = mm; return; }
  el[chave + '_mm'] = mm;
  if (el.tipo === 'coluna_redonda' && chave === 'w') el.d_mm = mm;
}

function renderJanelaGeometria() {
  const m = document.getElementById('po-geo-modal');
  if (!m) return;
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const svg = (k) => '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + (GEO_ICONES[k] || '') + '</svg>';
  const cards = GEO_ORDEM.map((k) => '<button type="button" class="po-geo-tipo" data-add="' + k + '">' + svg(k) + '<span>' + esc(geoT('t_' + k)) + '</span></button>').join('');
  const paredes = geoParedes();
  const uni = geoUnidade();
  const lista = projectGeometria.map((el, i) => {
    const T = GEO_TIPOS[el.tipo];
    const aberto = el.id === geometriaSelId;
    let corpo = '';
    if (aberto) {
      const opts = paredes.map((p) => '<option value="' + p.wallIndex + '"' + (Number(el.wall_index) === p.wallIndex ? ' selected' : '') + '>' + esc(geoT('wall_n', { n: p.wallIndex + 1 })) + '</option>').join('');
      const campos = [['x', 'pos']].concat(T.campos).map(([k, rot]) => {
        const v = k === 'x' ? Number(el.x_mm) || 0 : geoValor(el, k);
        return '<label>' + esc(geoT(rot)) + '<span class="po-geo-inp"><input type="text" data-campo="' + k + '" value="' + esc(geoFmt(v)) + '"><em>' + esc(uni) + '</em></span></label>';
      }).join('');
      let extra = '';
      if (T.extra === 'topo') {
        extra = '<label>' + esc(geoT('top')) + '<select data-p="topo"><option value="arco"' + (el.p.topo !== 'reto' ? ' selected' : '') + '>' + esc(geoT('top_arch')) + '</option><option value="reto"' + (el.p.topo === 'reto' ? ' selected' : '') + '>' + esc(geoT('top_flat')) + '</option></select></label>';
      } else if (T.extra === 'sobe') {
        const n = Math.max(2, Math.round((Number(el.h_mm) || 0) / 190));
        extra = '<label>' + esc(geoT('goes_up')) + '<select data-p="sobe"><option value="direita"' + (el.p.sobe !== 'esquerda' ? ' selected' : '') + '>' + esc(geoT('right')) + '</option><option value="esquerda"' + (el.p.sobe === 'esquerda' ? ' selected' : '') + '>' + esc(geoT('left')) + '</option></select></label>'
          + '<p class="hint">' + n + ' ' + esc(geoT('steps')) + '</p>';
      }
      corpo = '<div class="po-geo-campos"><label>' + esc(geoT('wall')) + '<select data-wall>' + opts + '</select></label>' + campos + extra + '</div>'
        + '<div class="po-geo-acoes"><button type="button" class="secondary" data-dup="' + el.id + '">' + esc(geoT('dup')) + '</button><button type="button" class="secondary po-geo-del" data-del="' + el.id + '">' + esc(geoT('del')) + '</button></div>';
    }
    return '<div class="po-geo-item' + (aberto ? ' aberto' : '') + '" data-id="' + el.id + '"><button type="button" class="po-geo-item-cab" data-sel="' + el.id + '">' + svg(el.tipo) + '<span>' + esc(geoT('t_' + el.tipo)) + ' · ' + esc(geoT('wall_n', { n: Number(el.wall_index) + 1 })) + '</span><b>' + (aberto ? '▾' : '▸') + '</b></button>' + corpo + '</div>';
  }).join('');
  m.querySelector('.po-geo-corpo').innerHTML =
    '<h4 class="po-geo-grupo">' + esc(geoT('add')) + '</h4><div class="po-geo-tipos">' + cards + '</div>'
    + '<h4 class="po-geo-grupo">' + esc(geoT('in_project')) + '</h4>'
    + (lista || '<p class="hint">' + esc(geoT('empty')) + '</p>');
}

function abrirJanelaGeometria() {
  let m = document.getElementById('po-geo-modal');
  if (!m) {
    m = document.createElement('div');
    m.id = 'po-geo-modal';
    m.innerHTML = '<div class="po-geo-card" role="dialog" aria-modal="true">'
      + '<button type="button" class="po-auth-modal-close po-geo-fechar" aria-label="×">&times;</button>'
      + '<h2></h2><p class="hint po-geo-sub"></p><div class="po-geo-corpo"></div></div>';
    document.body.appendChild(m);
    const fechar = () => { m.classList.remove('open'); geoSelecionar(null, false); };
    const achar = (id) => projectGeometria.find((e) => e.id === id);
    m.addEventListener('click', (ev) => {
      if (ev.target.closest('.po-geo-fechar')) { fechar(); return; }
      const add = ev.target.closest('[data-add]');
      if (add) { adicionarGeometria(add.dataset.add); renderJanelaGeometria(); return; }
      const sel = ev.target.closest('[data-sel]');
      if (sel) { geoSelecionar(geometriaSelId === sel.dataset.sel ? null : sel.dataset.sel, false); return; }
      const dup = ev.target.closest('[data-dup]');
      if (dup) {
        const el = achar(dup.dataset.dup);
        if (!el) return;
        const c = JSON.parse(JSON.stringify(el));
        c.id = geoNovoId();
        c.x_mm = (Number(el.x_mm) || 0) + (Number(el.w_mm) || 0) + 100;
        projectGeometria.push(c);
        geometriaSelId = c.id;
        geometriaMudou(); renderJanelaGeometria();
        return;
      }
      const del = ev.target.closest('[data-del]');
      if (del) {
        projectGeometria = projectGeometria.filter((e) => e.id !== del.dataset.del);
        geometriaSelId = null;
        geometriaMudou(); renderJanelaGeometria();
      }
    });
    m.addEventListener('change', (ev) => {
      const item = ev.target.closest('.po-geo-item');
      const el = item && achar(item.dataset.id);
      if (!el) return;
      if (ev.target.matches('[data-wall]')) {
        el.wall_index = Number(ev.target.value) || 0;
      } else if (ev.target.dataset.p) {
        el.p = el.p || {};
        el.p[ev.target.dataset.p] = ev.target.value;
      } else if (ev.target.dataset.campo) {
        const mm = geoParse(ev.target.value);
        if (mm === null) { renderJanelaGeometria(); return; }
        const k = ev.target.dataset.campo;
        if (k === 'x') el.x_mm = Math.max(0, mm); else geoSetValor(el, k, k === 'p.subida' ? mm : Math.max(0, mm));
      }
      geometriaMudou();
      renderJanelaGeometria();
    });
    m.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && ev.target.matches('input[data-campo]')) { ev.preventDefault(); ev.target.blur(); }
    });
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && m.classList.contains('open')) fechar(); });
  }
  m.querySelector('h2').textContent = geoT('title');
  m.querySelector('.po-geo-sub').textContent = geoT('subtitle');
  renderJanelaGeometria();
  m.classList.add('open');
}

(function attachGeometria() {
  const btn = document.getElementById('po-proj-geometry-btn');
  const rotulo = () => {
    if (!btn) return;
    btn.title = geoT('title'); btn.setAttribute('aria-label', geoT('btn'));
    const l = document.getElementById('po-proj-geometry-lbl'); if (l) l.textContent = geoT('btn');
  };
  rotulo();
  document.addEventListener('legno:language-changed', rotulo);
  if (btn) btn.addEventListener('mouseenter', rotulo);
  if (btn) btn.addEventListener('click', () => {
    try { if (window.LegnoTbMenus) window.LegnoTbMenus.menus.forEach((x) => x.fechar()); } catch (e) { /* ok */ }
    abrirJanelaGeometria();
  });
})();

// ---------------------------------------------------------------- mouse
// CLICÁVEL COMO OBJETO (24/10, Matt: "ta bem ruim de mexer nas geometrias
// porque não consigo mexer pelo mouse ... devem ser clicáveis como objetos").
// No 3D do projeto (ViewerProjectEdit):
//   · clique = seleciona (contorno vermelho) e abre o painel já no elemento;
//   · arrastar = anda ao longo da parede (e sobe/desce nos que têm altura do
//     chão: viga, sanca, nicho, corrimão); passando o mouse por cima de OUTRA
//     parede, ele muda de parede;
//   · Delete = remove; Esc = solta a seleção.
// Escuta em window na fase de CAPTURA: roda antes do clique de módulo e do
// OrbitControls, e só "come" o evento quando o que está sob o mouse é
// geometria (módulo na frente ganha, igual hoje).
function geoViewer() { return (typeof ViewerProjectEdit !== 'undefined' && ViewerProjectEdit) || null; }
function geoMostraSelecao() {
  const v = geoViewer();
  const scene = v && v.getScene && v.getScene();
  if (!scene) return;
  scene.traverse((o) => {
    if (o.userData && o.userData.geoRealce && o.parent) o.visible = o.parent.userData.geometriaId === geometriaSelId;
  });
}
function geoSelecionar(id, abrirPainel) {
  geometriaSelId = id;
  geoMostraSelecao();
  const m = document.getElementById('po-geo-modal');
  if (id && abrirPainel) {
    if (!m || !m.classList.contains('open')) abrirJanelaGeometria(); else renderJanelaGeometria();
    const it = document.querySelector('#po-geo-modal .po-geo-item.aberto');
    if (it && it.scrollIntoView) it.scrollIntoView({ block: 'nearest' });
  } else if (m && m.classList.contains('open')) renderJanelaGeometria();
}
function geoGrupoNaCena(id) {
  const v = geoViewer();
  const scene = v && v.getScene && v.getScene();
  let achou = null;
  if (scene) scene.traverse((o) => { if (!achou && o.userData && o.userData.geometriaId === id) achou = o; });
  return achou;
}

(function ligaMouseGeometria() {
  if (window.PO_VIEW3D_READONLY) return;
  let arraste = null;
  const ARRASTE_PX = 4;
  const ehCanvas = (ev) => {
    const v = geoViewer();
    const dom = v && v.getDomElement && v.getDomElement();
    return dom && ev.target === dom ? dom : null;
  };
  // Ponto do mouse no plano da parede → {u (m ao longo, da ponta A), y}
  const pontoNaParede = (v, wall, cx, cy) => {
    const pt = v.intersectPlaneAtClient(cx, cy, { x: Number(wall.originX), y: 0, z: Number(wall.originZ) }, { x: Number(wall.intoDirX), y: 0, z: Number(wall.intoDirZ) });
    if (!pt) return null;
    return { u: (pt.x - Number(wall.originX)) * Number(wall.alongDirX) + (pt.z - Number(wall.originZ)) * Number(wall.alongDirZ), y: pt.y };
  };

  window.addEventListener('pointerdown', (ev) => {
    const dom = ehCanvas(ev);
    if (!dom || ev.button !== 0 || ev.shiftKey) return;
    const v = geoViewer();
    const hit = v.pickArchitectureAt ? v.pickArchitectureAt(ev.clientX, ev.clientY) : null;
    if (!hit) {
      if (geometriaSelId) geoSelecionar(null, false);
      return;
    }
    const el = projectGeometria.find((e) => e.id === hit.id);
    if (!el) return;
    ev.stopPropagation(); ev.preventDefault();
    // Módulo selecionado sai da seleção (senão o Delete apagaria os dois).
    try {
      if (typeof selectedProjectSlotId !== 'undefined' && selectedProjectSlotId != null && typeof deselectProjectSlot === 'function') deselectProjectSlot();
    } catch (e) { /* ok */ }
    geoSelecionar(el.id, false);
    const wall = geoParedes().find((p) => p.wallIndex === Number(el.wall_index));
    const p0 = wall ? pontoNaParede(v, wall, ev.clientX, ev.clientY) : null;
    arraste = { id: el.id, pointerId: ev.pointerId, sx: ev.clientX, sy: ev.clientY, andou: false,
      x0: Number(el.x_mm) || 0, y0: Number(el.y_mm) || 0, p0, wallIndex: Number(el.wall_index) };
    try { dom.setPointerCapture(ev.pointerId); } catch (e) { /* ok */ }
  }, true);

  window.addEventListener('pointermove', (ev) => {
    const v = geoViewer();
    if (!arraste) {
      // cursor de "mover" em cima de geometria
      const dom = ehCanvas(ev);
      if (dom && !ev.buttons && v.pickArchitectureAt) {
        const sobre = !!v.pickArchitectureAt(ev.clientX, ev.clientY);
        if (sobre) { dom.style.cursor = 'move'; dom.dataset.geoCursor = '1'; }
        else if (dom.dataset.geoCursor) { dom.style.cursor = ''; delete dom.dataset.geoCursor; }
      }
      return;
    }
    if (ev.pointerId !== arraste.pointerId) return;
    ev.stopPropagation();
    if (!arraste.andou && Math.hypot(ev.clientX - arraste.sx, ev.clientY - arraste.sy) < ARRASTE_PX) return;
    arraste.andou = true;
    const el = projectGeometria.find((e) => e.id === arraste.id);
    if (!el) return;
    const paredes = geoParedes();
    // trocou de parede? (parede embaixo do mouse, atravessando a própria geometria)
    const sup = v.pickRoomSurfaceAt ? v.pickRoomSurfaceAt(ev.clientX, ev.clientY) : null;
    if (sup && sup.kind === 'wall' && sup.wallIndex != null && Number(sup.wallIndex) !== Number(el.wall_index)
      && paredes.some((p) => p.wallIndex === Number(sup.wallIndex))) {
      el.wall_index = Number(sup.wallIndex);
      const nw = paredes.find((p) => p.wallIndex === el.wall_index);
      const pt = pontoNaParede(v, nw, ev.clientX, ev.clientY);
      if (pt) {
        arraste.p0 = pt;
        arraste.x0 = pt.u * 1000 - (Number(el.w_mm) || 0) / 2;
        arraste.y0 = Number(el.y_mm) || 0;
      }
    }
    const wall = paredes.find((p) => p.wallIndex === Number(el.wall_index));
    if (!wall || !arraste.p0) return;
    const pt = pontoNaParede(v, wall, ev.clientX, ev.clientY);
    if (!pt) return;
    const L = Number(wall.widthM) * 1000, w = Number(el.w_mm) || 0;
    let x = arraste.x0 + (pt.u - arraste.p0.u) * 1000;
    x = Math.max(0, Math.min(Math.max(0, L - w), x));
    if (x < 25) x = 0;
    if (Math.abs(x - (L - w)) < 25) x = Math.max(0, L - w);
    el.x_mm = Math.round(x);
    const temY = GEO_TIPOS[el.tipo].campos.some(([k]) => k === 'y');
    if (temY) {
      const teto = geoTeto(), hEl = Number(el.h_mm) || 0;
      let y = arraste.y0 + (pt.y - arraste.p0.y) * 1000;
      y = Math.max(0, Math.min(Math.max(0, teto - hEl), y));
      if (Math.abs(y - (teto - hEl)) < 25) y = Math.max(0, teto - hEl);
      el.y_mm = Math.round(y);
    }
    const g = geoGrupoNaCena(el.id);
    if (g) geoPosiciona(g, el, wall);
  }, true);

  const fim = (ev) => {
    if (!arraste || ev.pointerId !== arraste.pointerId) return;
    ev.stopPropagation();
    const andou = arraste.andou;
    const dom = ehCanvas(ev);
    try { if (dom) dom.releasePointerCapture(ev.pointerId); } catch (e) { /* ok */ }
    arraste = null;
    if (andou) geometriaMudou();      // refaz a cena (recorte de arco/nicho acompanha)
    geoSelecionar(geometriaSelId, true);
  };
  window.addEventListener('pointerup', fim, true);
  window.addEventListener('pointercancel', fim, true);

  window.addEventListener('keydown', (ev) => {
    if (!geometriaSelId) return;
    const t = ev.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (ev.key === 'Delete' || ev.key === 'Backspace') {
      ev.preventDefault(); ev.stopImmediatePropagation();
      projectGeometria = projectGeometria.filter((e) => e.id !== geometriaSelId);
      geometriaSelId = null;
      geometriaMudou();
      const m = document.getElementById('po-geo-modal');
      if (m && m.classList.contains('open')) renderJanelaGeometria();
    } else if (ev.key === 'Escape') {
      ev.stopImmediatePropagation();
      geoSelecionar(null, false);
    }
  }, true);
})();
