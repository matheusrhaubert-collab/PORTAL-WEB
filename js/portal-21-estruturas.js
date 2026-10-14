// ============================================================
// Estruturas de parede — botão "Estruturas" no grupo Paredes da barra
// ============================================================
// Pedido do Matt (2026-10-14): "quero um novo icone em wall que sao
// estructures - tomadas, canos, interruptores, alarmes, exaustao,
// ventilacao, campainhas. tudo que vai conectado na parede, funciona como um
// modulo, colocar em desenho, ventilacao editavel ja interruptores padrao.
// nao aparece nos orcamentos, coloca como decoracao pra ocultar nas camadas"
// + logo depois: "as portas e janelas pode colocar nessa nova ferramenta".
//
// Cada estrutura é um MÓDULO de catálogo normal (migration 200), achado pela
// coluna modules.wall_structure (chave estável — não depende do nome):
//   · is_decoration → camada "Decoração" do botão Camadas esconde junto;
//   · visual_only   → fora de pedido/$ Fábrica/$ Orçamento/Proposta
//     (porta/janela decorativas NÃO são visual_only — ficaram como eram);
//   · desenho próprio: shape_type decor_* em viewer3d.js/photoreal.js.
// Depois de inserido é um slot comum de PAREDE: arrasta, redimensiona (os
// editáveis), apaga, salva com o projeto.
//
// Fora da COLISÃO (isProjectWallStructureSlot em portal-06b): tomada não
// empurra armário e armário pode passar por cima de tomada/cano.
//
// Altura padrão = padrão americano (Legno atende os EUA), medida no CENTRO
// da placa pros itens pequenos: tomada 18", interruptor e campainha 48",
// alarme ~55". O resto pela base. Tudo ajustável depois arrastando.

const PROJECT_WALL_STRUCTURES = [
  { key: 'tomada',      centerMm: 457 },
  { key: 'interruptor', centerMm: 1219 },
  { key: 'campainha',   centerMm: 1219 },
  { key: 'alarme',      centerMm: 1400 },
  { key: 'ventilacao',  bottomMm: 2100 },
  { key: 'exaustao',    bottomMm: 2000 },
  { key: 'cano',        bottomMm: 0 },
  { key: 'porta',       bottomMm: 0, sep: true },
  { key: 'janela',      bottomMm: 1000 }
];

// Ícones de traço (24×24), mesmo estilo dos outros da barra.
const PROJECT_WALL_STRUCTURE_ICONS = {
  tomada: '<rect x="6" y="3" width="12" height="18" rx="1.5"/><path d="M10 7.5v2.5M14 7.5v2.5M10 14v2.5M14 14v2.5"/>',
  interruptor: '<rect x="6" y="3" width="12" height="18" rx="1.5"/><rect x="9.5" y="7" width="5" height="10" rx="0.8"/>',
  campainha: '<rect x="8" y="4" width="8" height="16" rx="1.5"/><circle cx="12" cy="12" r="2.2"/>',
  alarme: '<rect x="4" y="5" width="16" height="14" rx="1.5"/><path d="M7 8.5h10"/><path d="M8 12h1.5M11.25 12h1.5M14.5 12h1.5M8 15h1.5M11.25 15h1.5M14.5 15h1.5"/>',
  ventilacao: '<rect x="3.5" y="7" width="17" height="10" rx="1"/><path d="M6 10h12M6 12.5h12M6 15h12"/>',
  exaustao: '<rect x="4.5" y="4.5" width="15" height="15" rx="1"/><circle cx="12" cy="12" r="1.3"/><path d="M12 10.7c0-3 2.5-4 3.5-3M13.3 12c3 0 4 2.5 3 3.5M12 13.3c0 3-2.5 4-3.5 3M10.7 12c-3 0-4-2.5-3-3.5"/>',
  cano: '<path d="M10 3h4v18h-4z"/><path d="M9 5h6M9 19h6"/>',
  porta: '<path d="M6 21V3h12v18"/><path d="M4 21h16"/><circle cx="15" cy="12.5" r="0.9"/>',
  janela: '<rect x="4" y="5" width="16" height="13" rx="0.8"/><path d="M12 5v13M4 11.5h16M3 20h18"/>'
};

function projectWallStructureModule(key) {
  return (typeof allModules !== 'undefined' ? allModules : [])
    .find((m) => m && m.wall_structure === key && m.active !== false) || null;
}

function showProjectStructuresMessage(msg) {
  const el = document.getElementById('po-proj-error');
  if (!el) return;
  el.textContent = msg || '';
  el.style.display = msg ? 'block' : 'none';
}

async function insertProjectWallStructure(key) {
  const def = PROJECT_WALL_STRUCTURES.find((d) => d.key === key);
  const m = projectWallStructureModule(key);
  if (!def) return;
  if (!m) {
    showProjectStructuresMessage(I18n.t('project_structures.missing', { name: I18n.t('project_structures.item_' + key) }));
    return;
  }
  const wi = Number(projectActiveWallIndex || 0);
  const wallW = Number(getProjectWallWidthMm(wi)) || 0;
  const w = Number(m.width_default_mm) || 100;
  const h = Number(m.height_default_mm) || 100;
  const xMm = Math.max(0, Math.round(wallW / 2 - w / 2));
  const floorMm = def.centerMm != null ? Math.max(0, Math.round(def.centerMm - h / 2)) : (def.bottomMm || 0);
  const slot = await insertProjectModuleDefault(m.id, { wall_index: wi, x_mm: xMm, floor_height_mm: floorMm });
  if (!slot) return;
  // insertProjectModuleDefault só aplica floor_height_mm > 0; garante o 0
  // (cano/porta) e passa pelo mesmo clamp de parede/teto de sempre.
  slot.floor_height_mm = floorMm;
  if (typeof clampProjectSlotPosition === 'function') clampProjectSlotPosition(slot);
  selectedProjectSlotId = slot.id;
  showProjectStructuresMessage('');
  renderProjectCanvas();
  markProjectDirty();
}

function renderProjectStructuresList(lista) {
  lista.innerHTML = PROJECT_WALL_STRUCTURES.map((d) => {
    const disponivel = !!projectWallStructureModule(d.key);
    return (d.sep ? '<div class="po-structures-sep"></div>' : '')
      + '<button type="button" class="po-style-item po-structures-item' + (disponivel ? '' : ' indisponivel') + '" data-key="' + d.key + '"'
      + (disponivel ? '' : ' title="' + I18n.t('project_structures.missing_short') + '"') + '>'
      + '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + (PROJECT_WALL_STRUCTURE_ICONS[d.key] || '') + '</svg>'
      + '<span>' + I18n.t('project_structures.item_' + d.key) + '</span></button>';
  }).join('')
    + '<div class="po-structures-hint">' + I18n.t('project_structures.hint') + '</div>';
}

(function attachProjectStructuresMenu() {
  if (typeof document === 'undefined') return;
  const raiz = document.getElementById('po-proj-structures-menu');
  const btn = document.getElementById('po-proj-structures-btn');
  const lista = document.getElementById('po-proj-structures-list');
  if (!raiz || !btn || !lista || typeof attachFloatingDropdown !== 'function') return;
  const dropdown = attachFloatingDropdown(raiz, btn, lista);
  // Lista montada na hora de abrir: o catálogo (allModules) carrega depois
  // deste script, e o idioma pode ter mudado.
  btn.addEventListener('click', () => renderProjectStructuresList(lista), true);
  lista.addEventListener('click', (ev) => {
    const it = ev.target.closest('.po-structures-item');
    if (!it) return;
    dropdown.fechar();
    insertProjectWallStructure(it.dataset.key);
  });
})();
