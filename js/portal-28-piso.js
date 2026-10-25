// ==========================================================================
// PISO DO AMBIENTE — textura no chão do Projetos (2026-10-24)
// ==========================================================================
// Matt: "quero colocar textura no chão, na aba paredes, floor texture — aí
// deixaremos pré-escolha de flooring pra seleção ... uns 20 piso
// vinílico/laminado, o mais comum, tem também carpete (casa americana)" /
// "isso só vale pro piso" / "não quero que mostre na mesma opção dos móveis
// que fica na direita".
//
// - Catálogo FIXO abaixo. As imagens (assets/floors/) são PROCEDURAIS,
//   geradas por scripts/gerar-texturas-piso.py — sem licença de terceiro.
//   Cada imagem cobre tile_mm de piso de verdade (t: [largura, comprimento])
//   e se repete: régua/peça sai no tamanho real em qualquer ambiente.
// - Escolha no menu Paredes (botão "Piso"), janela própria — NÃO no painel
//   da direita (o dos móveis).
// - Fica no projeto: user_projects.floor_texture = { id, rotation_deg }
//   (migration 221). Sem a coluna, o salvar tira o campo e segue.
// - Desenho: ViewerComposition.setFloorTexture (viewer3d_composition.js) nas
//   duas instâncias do Projetos (edição e Visualização 3D).
// ==========================================================================

const PISO_CATALOGO = [
  { id: "lvp-natural-oak", g: "lvp", n: {"pt": "Carvalho natural (vinílico)", "en": "Natural Oak (LVP)", "es": "Roble natural (vinílico)"}, t: [952, 2540], r: 0.55 },
  { id: "lvp-light-oak", g: "lvp", n: {"pt": "Carvalho claro (vinílico)", "en": "Light Oak (LVP)", "es": "Roble claro (vinílico)"}, t: [952, 2540], r: 0.55 },
  { id: "lvp-white-oak", g: "lvp", n: {"pt": "Carvalho branco (vinílico)", "en": "White Oak (LVP)", "es": "Roble blanco (vinílico)"}, t: [1144, 3658], r: 0.55 },
  { id: "lvp-scandinavian-oak", g: "lvp", n: {"pt": "Carvalho escandinavo (vinílico)", "en": "Scandinavian Oak (LVP)", "es": "Roble escandinavo (vinílico)"}, t: [1144, 3658], r: 0.55 },
  { id: "lvp-park-meadow", g: "lvp", n: {"pt": "Carvalho prado (vinílico)", "en": "Meadow Oak (LVP)", "es": "Roble pradera (vinílico)"}, t: [952, 2540], r: 0.55 },
  { id: "lvp-channel-oak", g: "lvp", n: {"pt": "Carvalho areia (vinílico)", "en": "Sand Oak (LVP)", "es": "Roble arena (vinílico)"}, t: [1144, 3658], r: 0.55 },
  { id: "lvp-provincial-oak", g: "lvp", n: {"pt": "Carvalho provençal (vinílico)", "en": "Provincial Oak (LVP)", "es": "Roble provenzal (vinílico)"}, t: [1144, 3658], r: 0.55 },
  { id: "lvp-timberland-oak", g: "lvp", n: {"pt": "Carvalho caramelo (vinílico)", "en": "Caramel Oak (LVP)", "es": "Roble caramelo (vinílico)"}, t: [952, 2540], r: 0.55 },
  { id: "lvp-greige-oak", g: "lvp", n: {"pt": "Carvalho greige (vinílico)", "en": "Greige Oak (LVP)", "es": "Roble greige (vinílico)"}, t: [952, 2540], r: 0.55 },
  { id: "lvp-weathered-gray", g: "lvp", n: {"pt": "Cinza envelhecido (vinílico)", "en": "Weathered Gray (LVP)", "es": "Gris envejecido (vinílico)"}, t: [952, 2540], r: 0.55 },
  { id: "lvp-driftwood", g: "lvp", n: {"pt": "Driftwood (vinílico)", "en": "Driftwood (LVP)", "es": "Driftwood (vinílico)"}, t: [1144, 3658], r: 0.55 },
  { id: "lvp-coastal-white", g: "lvp", n: {"pt": "Branco costeiro (vinílico)", "en": "Coastal Whitewash (LVP)", "es": "Blanco costero (vinílico)"}, t: [952, 2540], r: 0.55 },
  { id: "lvp-honey-oak", g: "lvp", n: {"pt": "Carvalho mel (vinílico)", "en": "Honey Oak (LVP)", "es": "Roble miel (vinílico)"}, t: [636, 2438], r: 0.55 },
  { id: "lvp-hickory", g: "lvp", n: {"pt": "Hickory (vinílico)", "en": "Hickory (LVP)", "es": "Nogal americano (vinílico)"}, t: [888, 2438], r: 0.55 },
  { id: "lvp-rustic-hickory", g: "lvp", n: {"pt": "Hickory rústico (vinílico)", "en": "Rustic Hickory (LVP)", "es": "Hickory rústico (vinílico)"}, t: [952, 3048], r: 0.55 },
  { id: "lvp-natural-maple", g: "lvp", n: {"pt": "Maple natural (vinílico)", "en": "Natural Maple (LVP)", "es": "Arce natural (vinílico)"}, t: [636, 2438], r: 0.55 },
  { id: "lvp-walnut", g: "lvp", n: {"pt": "Nogueira (vinílico)", "en": "Walnut (LVP)", "es": "Nogal (vinílico)"}, t: [952, 3048], r: 0.55 },
  { id: "lvp-smoked-oak", g: "lvp", n: {"pt": "Carvalho defumado (vinílico)", "en": "Smoked Oak (LVP)", "es": "Roble ahumado (vinílico)"}, t: [1144, 3658], r: 0.55 },
  { id: "lvp-espresso", g: "lvp", n: {"pt": "Espresso (vinílico)", "en": "Dark Espresso (LVP)", "es": "Espresso (vinílico)"}, t: [636, 2438], r: 0.55 },
  { id: "lvp-charcoal", g: "lvp", n: {"pt": "Carvão (vinílico)", "en": "Charcoal Oak (LVP)", "es": "Carbón (vinílico)"}, t: [952, 2540], r: 0.55 },
  { id: "wood-herringbone-white-oak", g: "wood", n: {"pt": "Carvalho branco espinha de peixe", "en": "White Oak Herringbone", "es": "Roble blanco espiga"}, t: [900, 900], r: 0.5 },
  { id: "tile-porcelain-light-24", g: "tile", n: {"pt": "Porcelanato claro 24\"×24\"", "en": "Light Porcelain 24\"×24\"", "es": "Porcelanato claro 24\"×24\""}, t: [1220, 1220], r: 0.3 },
  { id: "tile-porcelain-gray-24x48", g: "tile", n: {"pt": "Porcelanato cinza 24\"×48\"", "en": "Gray Porcelain 24\"×48\"", "es": "Porcelanato gris 24\"×48\""}, t: [1220, 2438], r: 0.32 },
  { id: "tile-porcelain-beige-18", g: "tile", n: {"pt": "Porcelanato bege 18\"×18\"", "en": "Beige Porcelain 18\"×18\"", "es": "Porcelanato beige 18\"×18\""}, t: [1372, 1372], r: 0.35 },
  { id: "tile-marble-white-24", g: "tile", n: {"pt": "Porcelanato mármore branco 24\"×24\"", "en": "White Marble-look 24\"×24\"", "es": "Porcelanato mármol blanco 24\"×24\""}, t: [1220, 1220], r: 0.2 },
  { id: "tile-checker-bw-12", g: "tile", n: {"pt": "Xadrez preto e branco 12\"×12\"", "en": "Black & White Checker 12\"×12\"", "es": "Ajedrez blanco y negro 12\"×12\""}, t: [1220, 1220], r: 0.3 },
  { id: "tile-slate-12x24", g: "tile", n: {"pt": "Ardósia 12\"×24\"", "en": "Slate 12\"×24\"", "es": "Pizarra 12\"×24\""}, t: [914, 1828], r: 0.6 },
  { id: "concrete-polished", g: "other", n: {"pt": "Cimento queimado", "en": "Polished Concrete", "es": "Cemento pulido"}, t: [1200, 1200], r: 0.4 },
  { id: "carpet-beige", g: "carpet", n: {"pt": "Carpete bege", "en": "Beige Carpet", "es": "Alfombra beige"}, t: [600, 600], r: 0.95 },
  { id: "carpet-greige", g: "carpet", n: {"pt": "Carpete greige", "en": "Greige Carpet", "es": "Alfombra greige"}, t: [600, 600], r: 0.95 },
  { id: "carpet-light-gray", g: "carpet", n: {"pt": "Carpete cinza claro", "en": "Light Gray Carpet", "es": "Alfombra gris claro"}, t: [600, 600], r: 0.95 },
  { id: "carpet-charcoal", g: "carpet", n: {"pt": "Carpete grafite", "en": "Charcoal Carpet", "es": "Alfombra grafito"}, t: [600, 600], r: 0.95 },
  { id: "carpet-berber-oatmeal", g: "carpet", n: {"pt": "Carpete berber aveia", "en": "Oatmeal Berber Carpet", "es": "Alfombra berber avena"}, t: [600, 600], r: 0.95 },
  { id: "carpet-navy", g: "carpet", n: {"pt": "Carpete azul marinho", "en": "Navy Carpet", "es": "Alfombra azul marino"}, t: [600, 600], r: 0.95 }
];
const PISO_GRUPOS = ['lvp', 'wood', 'tile', 'other', 'carpet'];

let projectFloor = null;   // { id, rotation_deg } ou null (piso liso de sempre)

function pisoDoCatalogo(id) { return PISO_CATALOGO.find((p) => p.id === id) || null; }
function pisoNome(p) {
  const lang = (typeof I18n !== 'undefined' && I18n.getLanguage && I18n.getLanguage()) || 'pt';
  return (p && p.n && (p.n[lang] || p.n.pt)) || '';
}
function pisoCfg(sel) {
  const p = sel && pisoDoCatalogo(sel.id);
  if (!p) return null;
  return { url: 'assets/floors/' + p.id + '.jpg', tile_mm: p.t, roughness: p.r, rotation_deg: Number(sel.rotation_deg) === 90 ? 90 : 0 };
}

// Aplica nos viewers e redesenha. Chamado ao escolher, ao abrir projeto e
// ao começar projeto novo.
function aplicarPisoProjeto(redesenhar) {
  const cfg = pisoCfg(projectFloor);
  [typeof ViewerProjectEdit !== 'undefined' ? ViewerProjectEdit : null,
    typeof ViewerProject !== 'undefined' ? ViewerProject : null].forEach((v) => {
    if (v && v.setFloorTexture) { try { v.setFloorTexture(cfg); } catch (e) { /* ok */ } }
  });
  atualizaBotaoPiso();
  if (redesenhar !== false) {
    try { if (typeof renderProjectCanvas === 'function') renderProjectCanvas(); } catch (e) { /* ok */ }
    try {
      const w = document.getElementById('po-proj-3d-wrap');
      if (w && w.style.display !== 'none' && typeof generateProject3D === 'function') generateProject3D();
    } catch (e) { /* ok */ }
  }
}
function setProjectFloor(sel, opts) {
  projectFloor = (sel && pisoDoCatalogo(sel.id)) ? { id: sel.id, rotation_deg: Number(sel.rotation_deg) === 90 ? 90 : 0 } : null;
  aplicarPisoProjeto(true);
  if (!(opts && opts.semDirty) && typeof markProjectDirty === 'function') markProjectDirty();
}
// Salvar/abrir projeto (portal-09)
function getProjectFloorForSave() { return projectFloor ? { id: projectFloor.id, rotation_deg: projectFloor.rotation_deg || 0 } : null; }
function restoreProjectFloor(v) {
  projectFloor = (v && v.id && pisoDoCatalogo(v.id)) ? { id: v.id, rotation_deg: Number(v.rotation_deg) === 90 ? 90 : 0 } : null;
  aplicarPisoProjeto(false);
}

function atualizaBotaoPiso() {
  const btn = document.getElementById('po-proj-floor-btn');
  if (!btn) return;
  const p = projectFloor && pisoDoCatalogo(projectFloor.id);
  btn.classList.toggle('active', !!p);
  btn.title = I18n.t('floor.btn_title') + (p ? ' — ' + pisoNome(p) : '');
}

function renderJanelaPiso() {
  const m = document.getElementById('po-floor-modal');
  if (!m) return;
  const sel = projectFloor ? projectFloor.id : null;
  let html = '<button type="button" class="po-floor-card' + (sel ? '' : ' selected') + '" data-floor=""><span class="po-floor-sem">—</span><span>' + I18n.t('floor.none') + '</span></button>';
  let corpo = '';
  PISO_GRUPOS.forEach((g) => {
    const itens = PISO_CATALOGO.filter((p) => p.g === g);
    if (!itens.length) return;
    corpo += '<h4 class="po-floor-grupo">' + I18n.t('floor.group_' + g) + '</h4><div class="po-floor-grid">'
      + itens.map((p) => '<button type="button" class="po-floor-card' + (sel === p.id ? ' selected' : '') + '" data-floor="' + p.id + '" title="' + pisoNome(p).replace(/"/g, '&quot;') + '">'
        + '<img src="assets/floors/' + p.id + '_thumb.jpg" alt="" loading="lazy"><span>' + pisoNome(p) + '</span></button>').join('')
      + '</div>';
  });
  const rot = projectFloor && projectFloor.rotation_deg === 90;
  m.querySelector('.po-floor-corpo').innerHTML = '<div class="po-floor-grid">' + html + '</div>' + corpo;
  const giro = m.querySelector('.po-floor-giro');
  if (giro) {
    giro.disabled = !projectFloor;
    giro.textContent = I18n.t(rot ? 'floor.direction_90' : 'floor.direction_0');
  }
}

function abrirJanelaPiso() {
  let m = document.getElementById('po-floor-modal');
  if (!m) {
    m = document.createElement('div');
    m.id = 'po-floor-modal';
    m.innerHTML = '<div class="po-floor-card-wrap" role="dialog" aria-modal="true">'
      + '<button type="button" class="po-auth-modal-close po-floor-fechar" aria-label="×">&times;</button>'
      + '<h2>' + I18n.t('floor.title') + '</h2><p class="hint">' + I18n.t('floor.subtitle') + '</p>'
      + '<div class="po-floor-acoes"><button type="button" class="secondary po-floor-giro"></button></div>'
      + '<div class="po-floor-corpo"></div></div>';
    document.body.appendChild(m);
    const fechar = () => m.classList.remove('open');
    m.addEventListener('click', (ev) => {
      if (ev.target === m || ev.target.closest('.po-floor-fechar')) { fechar(); return; }
      if (ev.target.closest('.po-floor-giro')) {
        if (!projectFloor) return;
        setProjectFloor({ id: projectFloor.id, rotation_deg: projectFloor.rotation_deg === 90 ? 0 : 90 });
        renderJanelaPiso();
        return;
      }
      const card = ev.target.closest('[data-floor]');
      if (card) {
        const id = card.dataset.floor;
        setProjectFloor(id ? { id, rotation_deg: projectFloor ? projectFloor.rotation_deg : 0 } : null);
        renderJanelaPiso();
      }
    });
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && m.classList.contains('open')) fechar(); });
  }
  renderJanelaPiso();
  m.classList.add('open');
}

(function attachPiso() {
  const btn = document.getElementById('po-proj-floor-btn');
  if (btn) btn.addEventListener('click', () => {
    try { if (window.LegnoTbMenus) window.LegnoTbMenus.menus.forEach((x) => x.fechar()); } catch (e) { /* ok */ }
    abrirJanelaPiso();
  });
  atualizaBotaoPiso();
})();
