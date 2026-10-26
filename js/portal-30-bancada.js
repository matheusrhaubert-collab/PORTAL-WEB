// ==========================================================================
// BANCADA DE PEDRA (countertop) do Projetos — 2026-10-25
// ==========================================================================
// Matt: "quero um botão novo ... para colocar o countertop. ao clicar quero
// que abra uma janela, mostre onde será o countertop. escolha a textura da
// pedra (umas 50 opções) cambria, silestone, quartzos, taj mahal, verde
// ubatuba, granito, travertino ..." + "waterfall dos lados como opcional,
// backsplash alto entre os aéreos e bases, ou só um espelho atrás da pedra,
// ou sem nada só tampo" + "padrão 1 polegada pra frente da porta, 2 polegadas
// pra frente do módulo caixa" + "opção de esticar a ilha e fazer bancada
// também ... a parte de trás da ilha nunca vai pedra" + "pia e cooktop
// reposicionados sobre a pedra" + "o botão e as cores ficam lá no Walls".
//
// SEPARADO dos módulos (igual Piso/Geometria): não é projectSlots, não entra
// em preço/pedido/plano de corte. Mora em projectBancada (config) e é salvo
// em user_projects.bancada (migration 223). Sem a coluna, salva sem ela.
//
// COMO A PEDRA É ACHADA (sem IA — regra fixa, sempre igual):
//  - "base" = módulo apoiado no chão (até 30 cm) com 45..105 cm de altura,
//    + lava-louças/lava-e-seca decorativas (a pedra passa por cima).
//  - módulos base encostados (folga até 6 mm) na MESMA parede, ou ilhas com
//    o mesmo giro e mesma linha de fundo, viram UMA linha de pedra (run).
//  - fogão de piso, geladeira, torre, etc. cortam a linha.
//  - frente: porta + 1" (bal_porta) ou caixa + 2" (bal_caixa) se não tem porta.
//  - ponta livre (nada encostado, não é fim de parede): + 1" (bal_ponta).
//  - canto em L: a linha da parede que vem depois é aparada onde encontra a
//    pedra da parede anterior (sem pedra sobreposta).
//  - pia e cooktop que estão em cima da base sobem a espessura da pedra; o
//    tampo "falso" da cuba some e a pedra ganha o recorte (bancadaAjusta
//    Assembly, chamado em buildProjectAssemblies — portal-08).
//  - ilha: nunca tem backsplash nem pedra nas costas; dá pra esticar o tampo
//    pra trás (banquetas) e nas pontas.
// Desenho: ViewerComposition.setArchitectureBuilder(bancadaMontar, 'bancada').
// Texturas: assets/stones/ (procedurais, scripts/gerar-texturas-pedra.py).
// ==========================================================================

const BANCADA_CATALOGO = [
  { id: "cambria-brittanicca", g: "quartz", n: {"pt": "Cambria Brittanicca", "en": "Cambria Brittanicca", "es": "Cambria Brittanicca"}, t: 1500, r: 0.22 },
  { id: "cambria-brittanicca-gold", g: "quartz", n: {"pt": "Cambria Brittanicca Gold", "en": "Cambria Brittanicca Gold", "es": "Cambria Brittanicca Gold"}, t: 1500, r: 0.22 },
  { id: "cambria-torquay", g: "quartz", n: {"pt": "Cambria Torquay", "en": "Cambria Torquay", "es": "Cambria Torquay"}, t: 1500, r: 0.25 },
  { id: "cambria-swanbridge", g: "quartz", n: {"pt": "Cambria Swanbridge", "en": "Cambria Swanbridge", "es": "Cambria Swanbridge"}, t: 1500, r: 0.22 },
  { id: "cambria-ella", g: "quartz", n: {"pt": "Cambria Ella", "en": "Cambria Ella", "es": "Cambria Ella"}, t: 1500, r: 0.22 },
  { id: "cambria-skara-brae", g: "quartz", n: {"pt": "Cambria Skara Brae", "en": "Cambria Skara Brae", "es": "Cambria Skara Brae"}, t: 1500, r: 0.25 },
  { id: "silestone-calacatta-gold", g: "quartz", n: {"pt": "Silestone Calacatta Gold", "en": "Silestone Calacatta Gold", "es": "Silestone Calacatta Gold"}, t: 1500, r: 0.2 },
  { id: "silestone-eternal-marquina", g: "quartz", n: {"pt": "Silestone Eternal Marquina", "en": "Silestone Eternal Marquina", "es": "Silestone Eternal Marquina"}, t: 1500, r: 0.2 },
  { id: "silestone-charcoal-soapstone", g: "quartz", n: {"pt": "Silestone Charcoal Soapstone", "en": "Silestone Charcoal Soapstone", "es": "Silestone Charcoal Soapstone"}, t: 1500, r: 0.45 },
  { id: "silestone-lyra", g: "quartz", n: {"pt": "Silestone Lyra", "en": "Silestone Lyra", "es": "Silestone Lyra"}, t: 1500, r: 0.2 },
  { id: "silestone-white-storm", g: "quartz", n: {"pt": "Silestone White Storm", "en": "Silestone White Storm", "es": "Silestone White Storm"}, t: 1500, r: 0.22 },
  { id: "silestone-miami-white", g: "quartz", n: {"pt": "Silestone Miami White", "en": "Silestone Miami White", "es": "Silestone Miami White"}, t: 1500, r: 0.2 },
  { id: "silestone-desert-silver", g: "quartz", n: {"pt": "Silestone Desert Silver", "en": "Silestone Desert Silver", "es": "Silestone Desert Silver"}, t: 1500, r: 0.3 },
  { id: "silestone-et-statuario", g: "quartz", n: {"pt": "Silestone Et. Statuario", "en": "Silestone Et. Statuario", "es": "Silestone Et. Statuario"}, t: 1500, r: 0.2 },
  { id: "caesarstone-empira-white", g: "quartz", n: {"pt": "Caesarstone Empira White", "en": "Caesarstone Empira White", "es": "Caesarstone Empira White"}, t: 1500, r: 0.22 },
  { id: "caesarstone-statuario-maximus", g: "quartz", n: {"pt": "Caesarstone Statuario Maximus", "en": "Caesarstone Statuario Maximus", "es": "Caesarstone Statuario Maximus"}, t: 1500, r: 0.2 },
  { id: "caesarstone-raw-concrete", g: "quartz", n: {"pt": "Caesarstone Raw Concrete", "en": "Caesarstone Raw Concrete", "es": "Caesarstone Raw Concrete"}, t: 1500, r: 0.55 },
  { id: "caesarstone-pure-white", g: "quartz", n: {"pt": "Caesarstone Pure White", "en": "Caesarstone Pure White", "es": "Caesarstone Pure White"}, t: 1500, r: 0.2 },
  { id: "caesarstone-frosty-carrina", g: "quartz", n: {"pt": "Caesarstone Frosty Carrina", "en": "Caesarstone Frosty Carrina", "es": "Caesarstone Frosty Carrina"}, t: 1500, r: 0.22 },
  { id: "msi-calacatta-laza", g: "quartz", n: {"pt": "MSI Calacatta Laza", "en": "MSI Calacatta Laza", "es": "MSI Calacatta Laza"}, t: 1500, r: 0.22 },
  { id: "msi-carrara-morro", g: "quartz", n: {"pt": "MSI Carrara Morro", "en": "MSI Carrara Morro", "es": "MSI Carrara Morro"}, t: 1500, r: 0.22 },
  { id: "granite-verde-ubatuba", g: "granite", n: {"pt": "Verde Ubatuba", "en": "Verde Ubatuba (Uba Tuba)", "es": "Verde Ubatuba"}, t: 1500, r: 0.25 },
  { id: "granite-absolute-black", g: "granite", n: {"pt": "Preto Absoluto", "en": "Absolute Black", "es": "Negro Absoluto"}, t: 1500, r: 0.2 },
  { id: "granite-black-galaxy", g: "granite", n: {"pt": "Black Galaxy", "en": "Black Galaxy", "es": "Black Galaxy"}, t: 1500, r: 0.2 },
  { id: "granite-santa-cecilia", g: "granite", n: {"pt": "Santa Cecília", "en": "Santa Cecilia", "es": "Santa Cecilia"}, t: 1500, r: 0.25 },
  { id: "granite-giallo-ornamental", g: "granite", n: {"pt": "Giallo Ornamental", "en": "Giallo Ornamental", "es": "Giallo Ornamental"}, t: 1500, r: 0.25 },
  { id: "granite-new-venetian-gold", g: "granite", n: {"pt": "New Venetian Gold", "en": "New Venetian Gold", "es": "New Venetian Gold"}, t: 1500, r: 0.25 },
  { id: "granite-baltic-brown", g: "granite", n: {"pt": "Baltic Brown", "en": "Baltic Brown", "es": "Baltic Brown"}, t: 1500, r: 0.25 },
  { id: "granite-colonial-white", g: "granite", n: {"pt": "Colonial White", "en": "Colonial White", "es": "Colonial White"}, t: 1500, r: 0.25 },
  { id: "granite-steel-grey", g: "granite", n: {"pt": "Steel Grey", "en": "Steel Grey", "es": "Steel Grey"}, t: 1500, r: 0.25 },
  { id: "granite-blue-pearl", g: "granite", n: {"pt": "Blue Pearl", "en": "Blue Pearl", "es": "Blue Pearl"}, t: 1500, r: 0.2 },
  { id: "granite-tan-brown", g: "granite", n: {"pt": "Tan Brown", "en": "Tan Brown", "es": "Tan Brown"}, t: 1500, r: 0.25 },
  { id: "granite-kashmir-white", g: "granite", n: {"pt": "Kashmir White", "en": "Kashmir White", "es": "Kashmir White"}, t: 1500, r: 0.25 },
  { id: "granite-river-white", g: "granite", n: {"pt": "River White", "en": "River White", "es": "River White"}, t: 1500, r: 0.25 },
  { id: "granite-alaska-white", g: "granite", n: {"pt": "Alaska White", "en": "Alaska White", "es": "Alaska White"}, t: 1500, r: 0.25 },
  { id: "granite-black-pearl", g: "granite", n: {"pt": "Black Pearl", "en": "Black Pearl", "es": "Black Pearl"}, t: 1500, r: 0.2 },
  { id: "granite-luna-pearl", g: "granite", n: {"pt": "Luna Pearl", "en": "Luna Pearl", "es": "Luna Pearl"}, t: 1500, r: 0.25 },
  { id: "marble-carrara", g: "marble", n: {"pt": "Mármore Carrara", "en": "Carrara Marble", "es": "Mármol Carrara"}, t: 1500, r: 0.3 },
  { id: "marble-calacatta-gold", g: "marble", n: {"pt": "Mármore Calacatta Gold", "en": "Calacatta Gold Marble", "es": "Mármol Calacatta Gold"}, t: 1500, r: 0.3 },
  { id: "marble-statuario", g: "marble", n: {"pt": "Mármore Statuario", "en": "Statuario Marble", "es": "Mármol Statuario"}, t: 1500, r: 0.3 },
  { id: "marble-nero-marquina", g: "marble", n: {"pt": "Nero Marquina", "en": "Nero Marquina", "es": "Nero Marquina"}, t: 1500, r: 0.3 },
  { id: "marble-emperador-dark", g: "marble", n: {"pt": "Emperador Dark", "en": "Emperador Dark", "es": "Emperador Dark"}, t: 1500, r: 0.3 },
  { id: "marble-crema-marfil", g: "marble", n: {"pt": "Crema Marfil", "en": "Crema Marfil", "es": "Crema Marfil"}, t: 1500, r: 0.3 },
  { id: "quartzite-taj-mahal", g: "quartzite", n: {"pt": "Taj Mahal", "en": "Taj Mahal", "es": "Taj Mahal"}, t: 1500, r: 0.3 },
  { id: "quartzite-white-macaubas", g: "quartzite", n: {"pt": "White Macaúbas", "en": "White Macaubas", "es": "White Macaúbas"}, t: 1500, r: 0.3 },
  { id: "quartzite-fantasy-brown", g: "quartzite", n: {"pt": "Fantasy Brown", "en": "Fantasy Brown", "es": "Fantasy Brown"}, t: 1500, r: 0.3 },
  { id: "quartzite-super-white", g: "quartzite", n: {"pt": "Super White", "en": "Super White", "es": "Super White"}, t: 1500, r: 0.3 },
  { id: "quartzite-mont-blanc", g: "quartzite", n: {"pt": "Mont Blanc", "en": "Mont Blanc", "es": "Mont Blanc"}, t: 1500, r: 0.3 },
  { id: "quartzite-sea-pearl", g: "quartzite", n: {"pt": "Sea Pearl", "en": "Sea Pearl", "es": "Sea Pearl"}, t: 1500, r: 0.3 },
  { id: "travertine-classic", g: "travertine", n: {"pt": "Travertino clássico", "en": "Classic Travertine", "es": "Travertino clásico"}, t: 1500, r: 0.5 },
  { id: "travertine-silver", g: "travertine", n: {"pt": "Travertino silver", "en": "Silver Travertine", "es": "Travertino silver"}, t: 1500, r: 0.5 },
  { id: "travertine-noce", g: "travertine", n: {"pt": "Travertino noce", "en": "Noce Travertine", "es": "Travertino noce"}, t: 1500, r: 0.5 },
  { id: "travertine-romano", g: "travertine", n: {"pt": "Travertino romano", "en": "Roman Travertine", "es": "Travertino romano"}, t: 1500, r: 0.5 },
  { id: "soapstone", g: "other", n: {"pt": "Pedra-sabão", "en": "Soapstone", "es": "Esteatita"}, t: 1500, r: 0.55 },
  { id: "concrete-gray", g: "other", n: {"pt": "Concreto cinza", "en": "Gray Concrete", "es": "Concreto gris"}, t: 1500, r: 0.6 },
  { id: "solid-white", g: "other", n: {"pt": "Branco liso", "en": "Solid White", "es": "Blanco liso"}, t: 1500, r: 0.25 },
  { id: "solid-black", g: "other", n: {"pt": "Preto liso", "en": "Solid Black", "es": "Negro liso"}, t: 1500, r: 0.25 }
];
const BANCADA_GRUPOS = ['quartz', 'granite', 'marble', 'quartzite', 'travertine', 'other'];
const IN_MM = 25.4;
const BANCADA_PADRAO = {
  ativo: true,
  pedra: 'cambria-brittanicca',
  esp_mm: 30,                 // 3 cm
  bal_porta_mm: IN_MM,        // 1" à frente da porta
  bal_caixa_mm: 2 * IN_MM,    // 2" à frente da caixa (sem porta)
  bal_ponta_mm: IN_MM,        // 1" na ponta livre
  splash: 'espelho',          // 'nenhum' | 'espelho' | 'alto'
  splash_mm: 4 * IN_MM,       // espelho de 4"
  excluidos: [],              // ids de slot que NÃO levam pedra
  pontas: {},                 // '<slotId>|E' / '|D' -> { wf: bool, ext_mm: n }
  ilha_tras: {},              // '<slotId>' -> mm de balanço atrás (banqueta)
  wf_ilhas: false,            // waterfall nas pontas livres das ilhas
  frente_ext: {}              // '<1º slot do trecho>' -> mm a mais na frente (seta)
};
const BANCADA_PORTA_M = 0.020; // porta 18 mm + 2 mm de folga (viewer3d.placeFrontGroupInBox)
const BANCADA_SPLASH_ESP_M = 0.02;

let projectBancada = null;

const BAN_TXT = {
  pt: {
    tip_3d: 'No 3D: clique na pedra para esticar pelas setas vermelhas, ou apagar com Delete.', st_on: 'Pedra colocada em {n} módulo(s).', st_off: 'Bancada desligada.', turn_on: 'Colocar de novo', sp_none_s: 'Sem', sp_mirror_s: 'Baixo 4"', sp_high_s: 'Até os aéreos', wf_islands: 'Waterfall na ilha', adjust: 'Ajustes', plan_hint: 'Clique num módulo para tirar ou pôr a pedra nele.', 
    btn: 'Bancada', title: 'Bancada de pedra', sub: 'A pedra já entra sozinha em todos os balcões. É só escolher a pedra. (Aparência aproximada — confirme a chapa com a marmoraria.)',
    show: 'Mostrar bancada no 3D', plan: 'Onde vai a pedra', runs: 'Trechos', none_found: 'Nenhum módulo base encontrado no projeto.',
    wall_n: 'Parede {n}', island: 'Ilha', modules: '{n} módulo(s)', excluded: 'sem pedra',
    wf_left: 'Waterfall esquerda', wf_right: 'Waterfall direita', ext_left: 'Esticar ponta esq.', ext_right: 'Esticar ponta dir.', back: 'Esticar atrás (banquetas)',
    stone: 'Pedra', thick: 'Espessura', splash: 'Backsplash', sp_none: 'Sem (só tampo)', sp_mirror: 'Espelho atrás da pedra', sp_high: 'Alto (até os aéreos)', sp_h: 'Altura do espelho',
    ov_door: 'Balanço à frente da porta', ov_box: 'Balanço à frente da caixa (sem porta)', ov_end: 'Balanço na ponta livre', area: 'Área de pedra (aprox.)',
    g_quartz: 'Quartzo', g_granite: 'Granito', g_marble: 'Mármore', g_quartzite: 'Quartzito', g_travertine: 'Travertino', g_other: 'Outros',
    remove: 'Tirar a bancada', legend_stone: 'pedra', legend_off: 'sem pedra'
  },
  en: {
    tip_3d: 'In 3D: click the stone to stretch it with the red arrows, or press Delete to remove it.', st_on: 'Stone placed on {n} cabinet(s).', st_off: 'Countertop is off.', turn_on: 'Put it back', sp_none_s: 'None', sp_mirror_s: 'Short 4"', sp_high_s: 'Up to uppers', wf_islands: 'Island waterfall', adjust: 'Adjustments', plan_hint: 'Click a cabinet to add or remove stone on it.', 
    btn: 'Countertop', title: 'Stone countertop', sub: 'The stone is placed on every counter automatically — just pick the stone. (Looks are approximate — confirm the slab with the fabricator.)',
    show: 'Show countertop in 3D', plan: 'Where the stone goes', runs: 'Runs', none_found: 'No base cabinets found in this project.',
    wall_n: 'Wall {n}', island: 'Island', modules: '{n} cabinet(s)', excluded: 'no stone',
    wf_left: 'Waterfall left', wf_right: 'Waterfall right', ext_left: 'Extend left end', ext_right: 'Extend right end', back: 'Extend back (seating)',
    stone: 'Stone', thick: 'Thickness', splash: 'Backsplash', sp_none: 'None (top only)', sp_mirror: 'Short splash behind the top', sp_high: 'Full height (up to the uppers)', sp_h: 'Splash height',
    ov_door: 'Overhang past the door', ov_box: 'Overhang past the box (no door)', ov_end: 'Overhang at free ends', area: 'Stone area (approx.)',
    g_quartz: 'Quartz', g_granite: 'Granite', g_marble: 'Marble', g_quartzite: 'Quartzite', g_travertine: 'Travertine', g_other: 'Other',
    remove: 'Remove countertop', legend_stone: 'stone', legend_off: 'no stone'
  },
  es: {
    tip_3d: 'En el 3D: haz clic en la piedra para estirarla con las flechas rojas, o bórrala con Supr.', st_on: 'Piedra puesta en {n} módulo(s).', st_off: 'Encimera apagada.', turn_on: 'Ponerla de nuevo', sp_none_s: 'Sin', sp_mirror_s: 'Bajo 4"', sp_high_s: 'Hasta los altos', wf_islands: 'Waterfall en la isla', adjust: 'Ajustes', plan_hint: 'Haz clic en un módulo para quitar o poner la piedra.', 
    btn: 'Encimera', title: 'Encimera de piedra', sub: 'La piedra se pone sola en todas las encimeras — solo elige la piedra. (Apariencia aproximada — confirma la placa con el marmolista.)',
    show: 'Mostrar encimera en el 3D', plan: 'Dónde va la piedra', runs: 'Tramos', none_found: 'Ningún módulo base en el proyecto.',
    wall_n: 'Pared {n}', island: 'Isla', modules: '{n} módulo(s)', excluded: 'sin piedra',
    wf_left: 'Waterfall izquierda', wf_right: 'Waterfall derecha', ext_left: 'Extender punta izq.', ext_right: 'Extender punta der.', back: 'Extender atrás (taburetes)',
    stone: 'Piedra', thick: 'Espesor', splash: 'Salpicadero', sp_none: 'Sin (solo encimera)', sp_mirror: 'Zócalo detrás de la piedra', sp_high: 'Alto (hasta los altos)', sp_h: 'Altura del zócalo',
    ov_door: 'Vuelo delante de la puerta', ov_box: 'Vuelo delante de la caja (sin puerta)', ov_end: 'Vuelo en punta libre', area: 'Área de piedra (aprox.)',
    g_quartz: 'Cuarzo', g_granite: 'Granito', g_marble: 'Mármol', g_quartzite: 'Cuarcita', g_travertine: 'Travertino', g_other: 'Otros',
    remove: 'Quitar la encimera', legend_stone: 'piedra', legend_off: 'sin piedra'
  }
};
const BAN_ICONES = {
  // vista de frente: tampo (faixa), gabinete embaixo, backsplash atrás, aéreo em cima
  sp_nenhum: '<rect x="3" y="15" width="26" height="3" rx="0.5"/><path d="M5 18v10h22V18M16 18v10"/>',
  sp_espelho: '<rect x="3" y="11" width="26" height="4" fill="currentColor" fill-opacity=".28"/><rect x="3" y="15" width="26" height="3" rx="0.5"/><path d="M5 18v10h22V18M16 18v10"/>',
  sp_alto: '<rect x="4" y="2" width="24" height="5"/><rect x="3" y="7" width="26" height="8" fill="currentColor" fill-opacity=".28"/><rect x="3" y="15" width="26" height="3" rx="0.5"/><path d="M5 18v10h22V18M16 18v10"/>',
  // ilha com a pedra descendo nas duas pontas
  waterfall: '<path d="M3 10h26v3H3z"/><path d="M3 13v15h3V13M26 13v15h3V13" fill="currentColor" fill-opacity=".28"/><path d="M8 13v13h16V13M16 13v13"/>'
};
function banT(k, vars) {
  const lang = (typeof I18n !== 'undefined' && I18n.getLanguage && I18n.getLanguage()) || 'pt';
  let t = (BAN_TXT[lang] && BAN_TXT[lang][k]) || BAN_TXT.pt[k] || k;
  if (vars) Object.keys(vars).forEach((v) => { t = t.replace('{' + v + '}', vars[v]); });
  return t;
}
function bancadaPedra(id) { return BANCADA_CATALOGO.find((p) => p.id === id) || BANCADA_CATALOGO[0]; }
function bancadaNome(p) {
  const lang = (typeof I18n !== 'undefined' && I18n.getLanguage && I18n.getLanguage()) || 'pt';
  return (p && p.n && (p.n[lang] || p.n.pt)) || '';
}
function bancadaCfg() { return projectBancada && projectBancada.ativo ? projectBancada : null; }
function bancadaNormaliza(v) {
  if (!v || typeof v !== 'object') return null;
  const c = Object.assign({}, BANCADA_PADRAO, v);
  c.excluidos = Array.isArray(v.excluidos) ? v.excluidos.slice() : [];
  c.pontas = (v.pontas && typeof v.pontas === 'object') ? JSON.parse(JSON.stringify(v.pontas)) : {};
  c.ilha_tras = (v.ilha_tras && typeof v.ilha_tras === 'object') ? Object.assign({}, v.ilha_tras) : {};
  c.frente_ext = (v.frente_ext && typeof v.frente_ext === 'object') ? Object.assign({}, v.frente_ext) : {};
  if (['nenhum', 'espelho', 'alto'].indexOf(c.splash) < 0) c.splash = 'espelho';
  if (!BANCADA_CATALOGO.some((p) => p.id === c.pedra)) c.pedra = BANCADA_PADRAO.pedra;
  return c;
}

// ---------------------------------------------------------------- dados
function banShapes(pieces, set) {
  (pieces || []).forEach((p) => {
    if (!p) return;
    if (p.shape_type) set.add(String(p.shape_type));
    if (Array.isArray(p.child_pieces)) banShapes(p.child_pieces, set);
  });
  return set;
}
function banPecas(slot) {
  try { return (typeof projectSlotEffectivePieces === 'function') ? projectSlotEffectivePieces(slot) : (slot.pieces || []); } catch (e) { return slot.pieces || []; }
}
// 'base' | 'sobre' (pia/cooktop em cima) | 'aereo' | 'alto' (corta a linha) | null
function bancadaClassifica(slot) {
  if (!slot || slot.oculto) return null;
  const mod = slot.module || {};
  if (mod.wall_structure) return null;
  const ilha = (typeof isFloorSlot === 'function') && isFloorSlot(slot);
  const baixo = Number(slot.floor_height_mm || 0) + (ilha ? Number(slot.fineOffsetYMm || 0) : 0);
  const H = Number(slot.height_mm || 0);
  if (mod.is_decoration || mod.visual_only) {
    const sh = banShapes(banPecas(slot), new Set());
    if (sh.has('decor_lava_loucas') || sh.has('decor_lava_seca')) return 'base';
    if (sh.has('decor_pia') || sh.has('decor_farm_pia') || sh.has('decor_cooktop')) return 'sobre';
    if (sh.has('decor_coifa') || baixo >= 1100) return 'aereo';
    if (sh.has('decor_porta') || sh.has('decor_janela') || sh.size === 0) return null;
    return 'alto';
  }
  // BALCÃO = topo na altura de bancada (70..100 cm), apoiado no chão OU
  // suspenso (gabinete de banheiro floating — Matt 25/10: "não aparecem os
  // módulos de banheiro floating"). Painel/filler (estreito ou raso) não é.
  const topo = baixo + H;
  const W = Number(slot.width_mm || 0), D = Number(slot.depth_mm || 0);
  if (baixo >= 1000) return 'aereo';
  if (topo >= 700 && topo <= 1000 && H <= 1050 && baixo <= 600 && W >= 150 && D >= 280) return 'base';
  // PAINEL LATERAL / FILLER na altura da bancada (25/10, Matt: "quando tem
  // painel lateral o countertop tem que cobrir por cima"): entra no trecho
  // e a pedra passa por cima dele. Sozinho (sem gabinete) não ganha pedra.
  if (W < 150 && D >= 280 && topo >= 700 && topo <= 1000 && H <= 1050 && baixo <= 600) return 'painel';
  if (W < 150 || D < 280) return 'outro';   // painel raso/solto: corta a pedra se encostar, mas não ganha pedra
  return 'alto';
}

// Pose do módulo no mundo (mesma do 3D): centro do pé (ox,oz), base (oy),
// eixos U (largura, local +X) e N (frente, local +Z).
function banFrame(slot, paredes) {
  const f = (typeof getSlotWorldFrame === 'function') ? getSlotWorldFrame(slot) : null;
  if (!f) return null;
  let ox = f.ox, oz = f.oz, oy = f.oy, rot = f.rotY;
  const ilha = isFloorSlot(slot);
  if (!ilha) {
    const w = paredes.find((p) => p.wallIndex === Number(slot.wall_index || 0));
    const fz = Number(slot.fineOffsetZMm || 0) / 1000;
    if (w && fz) { ox += w.intoDirX * fz; oz += w.intoDirZ * fz; }
  }
  return {
    ox, oz, oy, rot, w: f.widthM, h: f.heightM, d: f.depthM,
    U: { x: Math.cos(rot), z: -Math.sin(rot) }, N: { x: Math.sin(rot), z: Math.cos(rot) }
  };
}
const banDot = (p, a) => p.x * a.x + p.z * a.z;

let banCache = { chave: null, res: null };
// Monta os trechos (runs) de pedra. Só DADOS (sem cena) — usado pelo 3D,
// pela janela (planta) e pelo ajuste de pia/cooktop.
function bancadaRuns() {
  const cfg = bancadaCfg();
  if (!cfg || typeof projectSlots === 'undefined') return [];
  const paredes = (typeof getProjectWallGeometry === 'function' ? getProjectWallGeometry() : []) || [];
  let chave;
  try {
    chave = JSON.stringify([cfg, paredes.map((p) => [p.wallIndex, p.originX, p.originZ, p.alongDirX, p.alongDirZ, p.intoDirX, p.intoDirZ, p.widthM, p.oculta]),
      projectSlots.map((s) => [s.id, s.placement, s.wall_index, s.x_mm, s.width_mm, s.height_mm, s.depth_mm, s.floor_height_mm, s.floor_x_mm, s.floor_z_mm, s.floor_rotation_deg, s.fineOffsetYMm, s.fineOffsetZMm, s.oculto, s.module && s.module.id, s._temFrente])]);
  } catch (e) { chave = null; }
  if (chave && banCache.chave === chave) return banCache.res;
  const res = bancadaRunsCalc(cfg, paredes);
  banCache = { chave, res };
  return res;
}

function bancadaRunsCalc(cfg, paredes) {
  const excl = new Set(cfg.excluidos || []);
  const itens = [];
  projectSlots.forEach((slot) => {
    const tipo = bancadaClassifica(slot);
    if (!tipo) return;
    const f = banFrame(slot, paredes);
    if (!f) return;
    const ilha = isFloorSlot(slot);
    if (!ilha && !paredes.some((p) => p.wallIndex === Number(slot.wall_index || 0) && !p.oculta)) return;
    itens.push({ slot, tipo, f, ilha, cu: f.ox * f.U.x + f.oz * f.U.z, cn: f.ox * f.N.x + f.oz * f.N.z, topo: f.oy + f.h });
  });
  const bases = itens.filter((it) => (it.tipo === 'base' || it.tipo === 'painel') && !excl.has(it.slot.id));
  // agrupa por parede (ou por giro + linha de fundo, na ilha)
  const grupos = {};
  bases.forEach((it) => {
    const fundo = it.cn - it.f.d / 2;
    const k = it.ilha
      ? 'f' + Math.round(((it.f.rot * 180 / Math.PI) % 360 + 360) % 360) + '|' + Math.round(fundo * 50)
      : 'w' + Number(it.slot.wall_index || 0);
    (grupos[k] = grupos[k] || []).push(Object.assign(it, { fundo }));
  });
  const runs = [];
  Object.keys(grupos).forEach((k) => {
    const lista = grupos[k].sort((a, b) => a.cu - b.cu);
    let atual = null;
    lista.forEach((it) => {
      const esq = it.cu - it.f.w / 2;
      if (atual) {
        const ult = atual.membros[atual.membros.length - 1];
        const gap = esq - (ult.cu + ult.f.w / 2);
        // eletro embaixo do tampo (lava-louças) costuma ser mais baixo que o
        // gabinete: aceita até 8 cm de diferença e a pedra passa reta por cima
        // (Matt, 25/10: "tampo em cima dela acompanhando os cabinets").
        const eletro = !!(it.slot.module && it.slot.module.is_decoration) || atual.membros.every((mm) => mm.slot.module && mm.slot.module.is_decoration);
        const tolTopo = eletro ? 0.08 : 0.016;
        if (gap <= 0.006 && gap > -0.05 && Math.abs(it.topo - atual.topoMax) < tolTopo && Math.abs(it.fundo - atual.fundo) < 0.03) {
          atual.membros.push(it); atual.topoMax = Math.max(atual.topoMax, it.topo); return;
        }
      }
      atual = { grupo: k, ilha: it.ilha, wallIndex: it.ilha ? null : Number(it.slot.wall_index || 0), U: it.f.U, N: it.f.N, fundo: it.fundo, membros: [it], topoMax: it.topo };
      runs.push(atual);
    });
  });
  // trecho só de painel/filler (sem gabinete) não vira pedra
  for (let i = runs.length - 1; i >= 0; i--) {
    if (runs[i].membros.every((m) => m.tipo === 'painel')) runs.splice(i, 1);
  }
  const esp = Math.max(0.01, (Number(cfg.esp_mm) || 30) / 1000);
  const balPorta = (Number(cfg.bal_porta_mm) || 0) / 1000, balCaixa = (Number(cfg.bal_caixa_mm) || 0) / 1000, balPonta = (Number(cfg.bal_ponta_mm) || 0) / 1000;
  // ordem: paredes primeiro (por índice), ilhas depois — a ordem decide quem
  // é aparado no canto em L.
  runs.sort((a, b) => (a.ilha - b.ilha) || ((a.wallIndex || 0) - (b.wallIndex || 0)));
  runs.forEach((r, i) => {
    r.id = r.membros[0].slot.id;
    r.u0 = r.membros[0].cu - r.membros[0].f.w / 2;
    r.u1 = r.membros[r.membros.length - 1].cu + r.membros[r.membros.length - 1].f.w / 2;
    // topo da pedra = topo dos GABINETES (o eletro só fica embaixo)
    const gabs = r.membros.filter((m) => m.tipo !== 'painel' && !(m.slot.module && m.slot.module.is_decoration));
    r.topo = gabs.length ? Math.max(...gabs.map((m) => m.topo)) : r.topoMax;
    r.esp = esp;
    r.membros.forEach((m) => {
      const temFrente = (m.slot._temFrente != null) ? !!m.slot._temFrente : !(m.slot.module && m.slot.module.is_decoration);
      m.frente = m.f.d + (temFrente ? BANCADA_PORTA_M + balPorta : balCaixa);
      m.v0 = m.fundo - r.fundo; // 0 no fundo
    });
    // lava-louças: a frente da pedra segue a dos gabinetes vizinhos (a porta
    // do eletro fica alinhada com as portas — não é "caixa sem porta")
    const frenteGab = gabs.length ? Math.max(...gabs.map((m) => m.frente)) : null;
    // painel lateral/filler: idem — a frente da pedra é a mesma dos gabinetes
    if (frenteGab != null) r.membros.forEach((m) => { if (m.tipo === 'painel' || (m.slot.module && m.slot.module.is_decoration)) m.frente = frenteGab; });
    const fx = Number((cfg.frente_ext || {})[r.membros[0].slot.id]) || 0;   // seta da frente
    if (fx) r.membros.forEach((m) => { m.frente = Math.max(0.1, m.frente + fx / 1000); });
    r.tras = r.ilha ? Math.max(0, ...r.membros.map((m) => Number((cfg.ilha_tras || {})[m.slot.id]) || 0)) / 1000 : 0;
    const pE = (cfg.pontas || {})[r.membros[0].slot.id + '|E'] || {};
    const pD = (cfg.pontas || {})[r.membros[r.membros.length - 1].slot.id + '|D'] || {};
    r.wfE = pE.wf != null ? !!pE.wf : null; r.wfD = pD.wf != null ? !!pD.wf : null;
    // esticar/encurtar a ponta (seta vermelha no 3D ou Ajustes) — null = automático
    r.extE = (pE.ext_mm != null && pE.ext_mm !== '') ? Number(pE.ext_mm) / 1000 : null;
    r.extD = (pD.ext_mm != null && pD.ext_mm !== '') ? Number(pD.ext_mm) / 1000 : null;
    // ponta encostada em algo (parede no fim, torre, fogão, outra base sem pedra...)?
    const bloq = (lado, ignorar) => {
      const uP = lado === 'E' ? r.u0 : r.u1;
      if (!r.ilha) {
        const w = paredes.find((p) => p.wallIndex === r.wallIndex);
        if (w) {
          const a = banDot({ x: w.originX, z: w.originZ }, r.U);
          const b = banDot({ x: w.originX + w.alongDirX * w.widthM, z: w.originZ + w.alongDirZ * w.widthM }, r.U);
          if (Math.abs(uP - a) < 0.012 || Math.abs(uP - b) < 0.012) return 'parede';
        }
      }
      return itens.some((o) => {
        if (o.tipo === 'aereo' || o.tipo === 'sobre' || r.membros.some((m) => m.slot === o.slot)) return false;
        if (ignorar && (ignorar.has(o.slot) || o.tipo === 'outro' || o.tipo === 'painel')) return false;   // canto: o par e filler não contam
        if (o.f.oy > r.topo - 0.05) return false;
        // caixa do outro no referencial do trecho
        const cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => {
          const x = o.f.ox + o.f.U.x * sx * o.f.w / 2 + o.f.N.x * sz * o.f.d / 2;
          const z = o.f.oz + o.f.U.z * sx * o.f.w / 2 + o.f.N.z * sz * o.f.d / 2;
          return { u: banDot({ x, z }, r.U), v: banDot({ x, z }, r.N) - r.fundo };
        });
        const umin = Math.min(...cs.map((p) => p.u)), umax = Math.max(...cs.map((p) => p.u));
        const vmin = Math.min(...cs.map((p) => p.v)), vmax = Math.max(...cs.map((p) => p.v));
        if (vmax < 0.05 || vmin > 0.5) return false;
        return lado === 'E' ? (umax > uP - 0.012 && umax < uP + 0.05) : (umin < uP + 0.012 && umin > uP - 0.05);
      }) ? 'item' : false;
    };
    r.bloqFn = bloq;
    r.bloqE = !!bloq('E'); r.bloqD = !!bloq('D');
    // "Waterfall nas ilhas" (um botão só, 25/10): pontas LIVRES das ilhas, a
    // menos que a ponta tenha escolha própria (Ajustes).
    if (r.wfE == null) r.wfE = !!(r.ilha && cfg.wf_ilhas && !r.bloqE);
    if (r.wfD == null) r.wfD = !!(r.ilha && cfg.wf_ilhas && !r.bloqD);
    const compr = r.u1 - r.u0;
    const pontaE = r.extE != null ? Math.max(-(compr - 0.1), r.extE) : (r.wfE ? esp : (r.bloqE ? 0 : balPonta));
    r.uE = r.u0 - (r.wfE ? Math.max(esp, pontaE) : pontaE);
    const pontaD = r.extD != null ? Math.max(-(r.u1 - r.uE - 0.1), r.extD) : (r.wfD ? esp : (r.bloqD ? 0 : balPonta));
    r.uD = r.u1 + (r.wfD ? Math.max(esp, pontaD) : pontaD);
    r.aparadoE = false; r.aparadoD = false;
    r.poli = bancadaPoligono(r);
  });
  // ---- CANTO (25/10, Matt: "nos cantos o countertop deve cobrir mesmo sem
  // móvel, se possível sem emendas"): duas linhas em paredes vizinhas que
  // chegam perto do mesmo canto (até 1 m), sem torre/geladeira no caminho,
  // vão as duas até o canto; o tampo das duas vira UMA peça (bancadaMontar).
  runs.forEach((r) => { r.canto = { E: null, D: null }; });
  const deParede = runs.filter((r) => !r.ilha);
  const cruza = (p1, d1, p2, d2) => {
    const den = d1.x * d2.z - d1.z * d2.x;
    if (Math.abs(den) < 1e-6) return null;
    const t = ((p2.x - p1.x) * d2.z - (p2.z - p1.z) * d2.x) / den;
    return { x: p1.x + d1.x * t, z: p1.z + d1.z * t };
  };
  for (let i = 0; i < deParede.length; i++) {
    for (let j = i + 1; j < deParede.length; j++) {
      const A = deParede[i], B = deParede[j];
      if (A.wallIndex === B.wallIndex) continue;
      if (Math.abs(A.U.x * B.U.z - A.U.z * B.U.x) < 0.3) continue;   // quase paralelas
      const C = cruza(banMundo(A, 0, 0), A.U, banMundo(B, 0, 0), B.U);
      if (!C) continue;
      const lado = (r) => {
        const u = banDot(C, r.U);
        // até 1,5 m do fim do trecho (era 1 m — 25/10, canto vazio de blind
        // corner com fillers ficava de fora e a pedra saía com degrau)
        if (u <= r.u0 + 0.02 && r.u0 - u <= 1.5) return 'E';
        if (u >= r.u1 - 0.02 && u - r.u1 <= 1.5) return 'D';
        return null;
      };
      const la = lado(A), lb = lado(B);
      if (!la || !lb || A.canto[la] || B.canto[lb]) continue;
      const ignA = new Set(B.membros.map((m) => m.slot)), ignB = new Set(A.membros.map((m) => m.slot));
      if (A.bloqFn(la, ignA) === 'item' || B.bloqFn(lb, ignB) === 'item') continue;   // torre/geladeira no canto
      A.canto[la] = { par: B, lado: lb, C, prim: true };
      B.canto[lb] = { par: A, lado: la, C, prim: false };
    }
  }
  runs.forEach((r) => {
    ['E', 'D'].forEach((l) => {
      const c = r.canto[l];
      if (!c) return;
      const uC = banDot(c.C, r.U);
      if (l === 'E') { r.uE = uC; r.aparadoE = true; r.wfE = false; } else { r.uD = uC; r.aparadoD = true; r.wfD = false; }
    });
    r.poli = bancadaPoligono(r);
  });
  // sobreposição que sobrou (canto que não fechou): apara a que vem depois
  runs.forEach((r, i) => {
    if (r.ilha) return;
    for (let j = 0; j < i; j++) {
      const s2 = runs[j];
      if (s2.ilha || s2.wallIndex === r.wallIndex) continue;
      const sp = s2.poli.map(([u, v]) => banMundo(s2, u, v));
      const vm = Math.min(...r.membros.map((m) => m.frente)) / 2;
      const dentro = (u) => banDentro(banMundo(r, u, vm), sp);
      if (!r.canto.E && dentro(r.uE + 0.002) && !dentro(r.uD)) {
        let a = r.uE, b = r.uD;
        for (let k2 = 0; k2 < 40; k2++) { const m = (a + b) / 2; if (dentro(m)) a = m; else b = m; }
        r.uE = b; r.aparadoE = true; r.wfE = false;
      }
      if (!r.canto.D && dentro(r.uD - 0.002) && !dentro(r.uE)) {
        let a = r.uD, b = r.uE;
        for (let k2 = 0; k2 < 40; k2++) { const m = (a + b) / 2; if (dentro(m)) a = m; else b = m; }
        r.uD = b; r.aparadoD = true; r.wfD = false;
      }
      r.poli = bancadaPoligono(r);
    }
  });
  // pia/cooktop soltos (decoração) que estão em cima de algum trecho
  const sobre = {};
  itens.filter((it) => it.tipo === 'sobre').forEach((it) => {
    const r = runs.find((rr) => {
      const u = banDot({ x: it.f.ox, z: it.f.oz }, rr.U), v = banDot({ x: it.f.ox, z: it.f.oz }, rr.N) - rr.fundo;
      return u > rr.uE - 0.01 && u < rr.uD + 0.01 && v > -0.02 && v < Math.max(...rr.membros.map((m) => m.frente)) + 0.02
        && Math.abs(it.f.oy - rr.topo) < 0.15;
    });
    if (r) sobre[it.slot.id] = r;
  });
  runs.sobre = sobre;
  runs.itens = itens;
  return runs;
}

// Contorno do tampo no referencial do trecho (u ao longo, v do fundo pra frente)
function bancadaPoligono(r) {
  const vb = -(r.tras || 0);
  const M = r.membros;
  const pts = [[r.uE, vb], [r.uD, vb]];
  // FRENTE RETA no trecho que fecha canto (25/10, Matt: "o canto precisa ter
  // o recorte em L"): com canto, a frente do trecho inteiro é a maior dos
  // membros — sem degrau de filler/painel/caixa sem porta perto do canto, e
  // as duas frentes se encontram num L limpo (bancadaPoligonoCadeia).
  const temCanto = !!(r.canto && (r.canto.E || r.canto.D));
  const frenteMax = Math.max(...M.map((m) => m.frente));
  for (let i = M.length - 1; i >= 0; i--) {
    const m = M[i];
    const uR = i === M.length - 1 ? r.uD : m.cu + m.f.w / 2;
    const uL = i === 0 ? r.uE : m.cu - m.f.w / 2;
    const fv = temCanto ? frenteMax : m.frente;
    pts.push([uR, fv], [uL, fv]);
  }
  const out = [];
  pts.forEach((p) => {
    const q = out[out.length - 1];
    if (!q || Math.abs(q[0] - p[0]) > 1e-6 || Math.abs(q[1] - p[1]) > 1e-6) out.push(p);
  });
  return out;
}
// Cadeias de trechos ligados pelo canto: [{ r, ent, sai }] — ent = ponta que
// vem do trecho anterior (ou ponta livre no 1º), sai = ponta pro próximo.
function bancadaCadeias(runs) {
  const vistos = new Set(), out = [];
  const outro = (l) => (l === 'E' ? 'D' : 'E');
  const anda = (ini, ent) => {
    const cad = [];
    let cur = ini, e = ent;
    while (cur && !vistos.has(cur)) {
      vistos.add(cur);
      const sai = outro(e);
      cad.push({ r: cur, ent: e, sai });
      const c = cur.canto && cur.canto[sai];
      if (!c) break;
      e = c.lado; cur = c.par;
    }
    return cad;
  };
  runs.forEach((r) => {
    if (vistos.has(r)) return;
    const livre = !(r.canto && r.canto.E) ? 'E' : (!(r.canto && r.canto.D) ? 'D' : null);
    if (livre) out.push(anda(r, livre));
  });
  runs.forEach((r) => { if (!vistos.has(r)) out.push(anda(r, 'E')); });   // volta fechada (raro)
  return out.filter((c) => c.length);
}
// Contorno da cadeia no mundo: fundo de ponta a ponta passando pelos cantos,
// e a frente voltando, com o encontro das frentes no canto.
function bancadaPoligonoCadeia(cad) {
  const uL = (r, l) => (l === 'E' ? r.uE : r.uD);
  // frente usada no encontro do canto = a reta do trecho (ver bancadaPoligono)
  const frenteL = (r) => Math.max(...r.membros.map((m) => m.frente));
  const frentes = (r, de) => { const f = r.poli.slice(2); return de === 'D' ? f : f.slice().reverse(); };   // poli: [fundoE, fundoD, frente D→E...]
  const cruza = (p1, d1, p2, d2) => {
    const den = d1.x * d2.z - d1.z * d2.x;
    if (Math.abs(den) < 1e-9) return null;
    const t = ((p2.x - p1.x) * d2.z - (p2.z - p1.z) * d2.x) / den;
    return { x: p1.x + d1.x * t, z: p1.z + d1.z * t };
  };
  const n = cad.length, pts = [];
  pts.push(banMundo(cad[0].r, uL(cad[0].r, cad[0].ent), -(cad[0].r.tras || 0)));
  for (let k = 0; k < n - 1; k++) pts.push(cad[k].r.canto[cad[k].sai].C);
  pts.push(banMundo(cad[n - 1].r, uL(cad[n - 1].r, cad[n - 1].sai), -(cad[n - 1].r.tras || 0)));
  for (let k = n - 1; k >= 0; k--) {
    const { r, ent, sai } = cad[k];
    let lista = frentes(r, sai).map(([u, v]) => banMundo(r, u, v));
    if (k < n - 1) lista = lista.slice(1);       // vértice do canto (sai)
    if (k > 0) lista = lista.slice(0, -1);       // vértice do canto (ent)
    pts.push(...lista);
    if (k > 0) {
      const a = cad[k - 1];
      const F = cruza(banMundo(r, 0, frenteL(r, ent)), r.U, banMundo(a.r, 0, frenteL(a.r, a.sai)), a.r.U);
      if (F) pts.push(F);
    }
  }
  const lim = [];
  pts.forEach((p) => { const q = lim[lim.length - 1]; if (!q || Math.hypot(q.x - p.x, q.z - p.z) > 1e-5) lim.push(p); });
  return lim;
}
// Entalhe aberto na frente (pia farm): acha o trecho da cadeia em que a cuba
// está, a aresta da FRENTE do contorno que passa por cima dela e troca esse
// pedaço da aresta por um "U" que vai até o fundo da cuba. Sem aresta que
// sirva (cuba fora da pedra), devolve o contorno como veio.
function banEntalheFrente(poli, cad, ptsMundo) {
  for (const c of cad) {
    const r = c.r;
    const loc = ptsMundo.map((p) => banLocal(r, p));
    const u0 = Math.min(...loc.map((q) => q[0])), u1 = Math.max(...loc.map((q) => q[0]));
    const vFundo = Math.min(...loc.map((q) => q[1]));
    const uMin = Math.min(r.uE, r.uD), uMax = Math.max(r.uE, r.uD);
    if (u0 < uMin - 0.001 || u1 > uMax + 0.001) continue;
    let melhor = -1, melhorV = Infinity;
    for (let i = 0; i < poli.length; i++) {
      const a = banLocal(r, poli[i]), b = banLocal(r, poli[(i + 1) % poli.length]);
      if (Math.abs(a[1] - b[1]) > 0.002) continue;               // só aresta paralela à frente
      const v = (a[1] + b[1]) / 2;
      if (v <= vFundo + 0.005) continue;                           // tem que estar NA FRENTE da cuba
      if (Math.min(a[0], b[0]) > u0 + 0.001 || Math.max(a[0], b[0]) < u1 - 0.001) continue;
      if (v < melhorV) { melhorV = v; melhor = i; }
    }
    if (melhor < 0) continue;
    const a = banLocal(r, poli[melhor]), b = banLocal(r, poli[(melhor + 1) % poli.length]);
    const ida = a[0] < b[0];                                         // sentido da aresta em u
    const ua = ida ? u0 : u1, ub = ida ? u1 : u0;
    const novos = [[ua, melhorV], [ua, vFundo], [ub, vFundo], [ub, melhorV]].map(([u, v]) => banMundo(r, u, v));
    return poli.slice(0, melhor + 1).concat(novos, poli.slice(melhor + 1));
  }
  return poli;
}
function banMundo(r, u, v) {
  return { x: r.U.x * u + r.N.x * (v + r.fundo), z: r.U.z * u + r.N.z * (v + r.fundo) };
}
function banLocal(r, p) { return [banDot(p, r.U), banDot(p, r.N) - r.fundo]; }
function banDentro(p, poli) {
  let d = false;
  for (let i = 0, j = poli.length - 1; i < poli.length; j = i++) {
    const a = poli[i], b = poli[j];
    if (((a.z > p.z) !== (b.z > p.z)) && (p.x < (b.x - a.x) * (p.z - a.z) / ((b.z - a.z) || 1e-12) + a.x)) d = !d;
  }
  return d;
}

// ---------------------------------------------------- pia/cooktop sobre a pedra
// Recortes da cuba (mundo) anotados no último build — usados pelo bancadaMontar.
let bancadaRecortes = {};
function bancadaAjustaAssembly(slot, assembly) {
  if (!assembly || !assembly.group) return;
  // tem porta/frente? (decide 1" à frente da porta x 2" à frente da caixa)
  let temFrente = false;
  assembly.group.traverse((o) => { if (o.userData && o.userData.isFrontPiece) temFrente = true; });
  if (slot._temFrente !== temFrente) { slot._temFrente = temFrente; }
  delete bancadaRecortes[slot.id];
  const cfg = bancadaCfg();
  if (!cfg) return;
  const runs = bancadaRuns();
  if (!runs.length) return;
  const membro = runs.find((r) => r.membros.some((m) => m.slot.id === slot.id));
  const sobre = runs.sobre && runs.sobre[slot.id];
  const run = membro || sobre;
  if (!run) return;
  const topoPedra = run.topo + run.esp;
  const paredes = getProjectWallGeometry() || [];
  const f = banFrame(slot, paredes);
  if (!f) return;
  const base = Number(assembly.floor_height_m || 0) + (isFloorSlot(slot) ? Number(assembly.fineOffsetY_m || 0) : 0);
  assembly.group.updateMatrixWorld(true);
  const decs = [];
  assembly.group.traverse((o) => {
    const sh = o.userData && o.userData.decorShape;
    if (sh === 'decor_pia' || sh === 'decor_farm_pia' || sh === 'decor_cooktop' || sh === 'decor_farm_avental') decs.push(o);
  });
  if (!decs.length) return;
  const recortes = [];
  let deltaSlot = null;
  decs.forEach((o) => {
    const sh = o.userData.decorShape;
    // PIA FARM COM AVENTAL (25/10): não sobe — fica embaixo da pedra, presa
    // na frente falsa — e a pedra abre NA FRENTE em volta da cuba (como a
    // foto de referência do Matt): recorte "aberto" do aro até a borda.
    if (sh === 'decor_farm_avental') {
      let rim = null;
      o.traverse((q) => { if (!rim && q.userData && q.userData.decorRim) rim = q; });
      const vis = rim ? rim.visible : true;
      if (rim) rim.visible = true;
      const b = new THREE.Box3().setFromObject(rim || o);
      if (rim) rim.visible = vis;
      if (!b.isEmpty()) {
        const cs = [[b.min.x, b.min.z], [b.max.x, b.min.z], [b.max.x, b.max.z], [b.min.x, b.max.z]];
        recortes.push({ aberto: true, pts: cs.map(([lx, lz]) => ({ x: f.ox + lx * f.U.x + lz * f.N.x, z: f.oz + lx * f.U.z + lz * f.N.z })) });
      }
      return;
    }
    let ref = null;
    if (sh === 'decor_cooktop') {
      const b = new THREE.Box3().setFromObject(o);
      if (b.isEmpty()) return;
      ref = b.min.y;
    } else {
      let cb = null;
      o.traverse((q) => { if (q.userData && q.userData.decorCounter) cb = q; });
      if (cb) { const b = new THREE.Box3().setFromObject(cb); ref = b.max.y; }
      else { const b = new THREE.Box3().setFromObject(o); ref = b.max.y; }
    }
    if (ref == null) return;
    // só mexe no que está na altura do tampo (não no forno da torre etc.)
    if (Math.abs(base + ref - run.topo) > 0.12) return;
    const delta = topoPedra - (base + ref);
    if (membro) o.position.y += delta; else deltaSlot = delta;
    if (sh !== 'decor_cooktop') {
      o.traverse((q) => { if (q.userData && q.userData.decorCounter) q.visible = false; });
      let rim = null;
      o.traverse((q) => { if (!rim && q.userData && q.userData.decorRim) rim = q; });
      const b = new THREE.Box3().setFromObject(rim || o);
      if (!b.isEmpty()) {
        const cs = [[b.min.x, b.min.z], [b.max.x, b.min.z], [b.max.x, b.max.z], [b.min.x, b.max.z]];
        recortes.push(cs.map(([lx, lz]) => ({ x: f.ox + lx * f.U.x + lz * f.N.x, z: f.oz + lx * f.U.z + lz * f.N.z })));
      }
    }
  });
  if (deltaSlot != null) assembly.floor_height_m = Number(assembly.floor_height_m || 0) + deltaSlot;
  if (recortes.length) bancadaRecortes[slot.id] = recortes;
}

// ---------------------------------------------------------------- 3D
const BAN_TEX = (typeof window !== 'undefined') ? (window.__legnoStoneTex || (window.__legnoStoneTex = {})) : {};
let banRedesenhoPend = false;
function bancadaTextura(THREE, pedra, renderer) {
  const url = 'assets/stones/' + pedra.id + '.jpg?v=1';
  let t = BAN_TEX[url];
  if (!t) {
    t = BAN_TEX[url] = new THREE.TextureLoader().load(url, () => {
      if (banRedesenhoPend) return;
      banRedesenhoPend = true;
      setTimeout(() => { banRedesenhoPend = false; bancadaRedesenha(); }, 30);
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding;
    const tile = (Number(pedra.t) || 1500) / 1000;
    t.repeat.set(1 / tile, 1 / tile);
  }
  try { if (renderer && renderer.capabilities) t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); } catch (e) { /* ok */ }
  return t;
}

// Trecho selecionado no 3D (clique na pedra) — mostra contorno vermelho e
// setas de esticar; Delete tira a pedra dele. Só visual: fora do orçamento.
let banSelId = null;
function banSetasDo(r) {
  const fr = Math.max(...r.membros.map((m) => m.frente));
  const fmin = Math.min(...r.membros.map((m) => m.frente));
  const vb = -(r.tras || 0), um = (r.uE + r.uD) / 2, vm = (vb + fmin) / 2;
  const l = [['frente', um, fr, 0, 1]];
  if (!r.aparadoE) l.push(['esq', r.uE, vm, -1, 0]);
  if (!r.aparadoD) l.push(['dir', r.uD, vm, 1, 0]);
  if (r.ilha) l.push(['tras', um, vb, 0, -1]);
  return l;
}

function bancadaMontar(THREE, ctx) {
  const cfg = bancadaCfg();
  if (!cfg) return null;
  const runs = bancadaRuns();
  if (!runs.length) return null;
  const pedra = bancadaPedra(cfg.pedra);
  // brilho contido: polido de verdade (0.2) estourava o tampo em branco
  // na luz da cena e o veio sumia (teste 25/10) — mínimo 0.5.
  const mat = new THREE.MeshStandardMaterial({ map: bancadaTextura(THREE, pedra, ctx && ctx.renderer), roughness: Math.max(0.5, Number(pedra.r) || 0.5), metalness: 0 });
  mat.color.setScalar(0.84); // compensação de luz (mesma ideia do piso, portal-28)
  const matLinha = new THREE.LineBasicMaterial({ color: 0x6b655c });
  const matSel = new THREE.LineBasicMaterial({ color: 0xe53935, depthTest: false, transparent: true });
  const matSeta = new THREE.MeshBasicMaterial({ color: 0xe53935, depthTest: false, transparent: true });
  const raiz = new THREE.Group();
  raiz.userData.isBancada = true;
  const semClique = (o) => { o.raycast = function () {}; return o; };
  const Y = new THREE.Vector3(0, 1, 0);
  let runAtual = null;
  const contorno = (mesh, sel) => {
    try {
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 25), sel ? matSel : matLinha);
      if (sel) e.renderOrder = 20;
      mesh.add(semClique(e));
    } catch (e) { /* ok */ }
    return mesh;
  };
  const poe = (mesh) => {
    mesh.userData.bancadaRun = runAtual.id;   // clique na pedra (pickBancadaAt)
    raiz.add(semClique(contorno(mesh, runAtual.id === banSelId)));
    return mesh;
  };
  // caixa no referencial do trecho, com UV em METROS (a pedra sai em escala)
  const caixa = (r, u0, u1, v0, v1, y0, y1) => {
    const w = u1 - u0, h = y1 - y0, d = v1 - v0;
    if (!(w > 0.001 && h > 0.001 && d > 0.001)) return null;
    const g = new THREE.BoxGeometry(w, h, d);
    const uv = g.attributes.uv;
    const esc = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * esc[f][0], uv.getY(i) * esc[f][1]); }
    const m = new THREE.Mesh(g, mat);
    const U = new THREE.Vector3(r.U.x, 0, r.U.z), N = new THREE.Vector3(r.N.x, 0, r.N.z);
    m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(U, Y, N));
    const c = banMundo(r, (u0 + u1) / 2, (v0 + v1) / 2);
    m.position.set(c.x, (y0 + y1) / 2, c.z);
    return poe(m);
  };
  // placa em pé encostada na parede, contorno livre (u, altura) — o
  // backsplash sai numa peça SÓ, com o veio contínuo (Matt, 25/10: "essas
  // emendas ficam muito artificiais, na verdade ele não fica assim").
  const placa = (r, pts, y0, esp) => {
    const sh = new THREE.Shape(pts.map(([u, y]) => new THREE.Vector2(u, y)));
    const geo = new THREE.ExtrudeGeometry(sh, { depth: esp, bevelEnabled: false });
    const m = new THREE.Mesh(geo, mat);
    const m4 = new THREE.Matrix4().makeBasis(new THREE.Vector3(r.U.x, 0, r.U.z), Y, new THREE.Vector3(r.N.x, 0, r.N.z));
    m4.setPosition(r.N.x * r.fundo, y0, r.N.z * r.fundo);
    m.matrixAutoUpdate = false;
    m.matrix.copy(m4);
    return poe(m);
  };
  const paredes = getProjectWallGeometry() || [];
  // ---- TAMPO: uma peça por "cadeia" (trechos ligados pelo canto — L, U),
  // contorno no chão do mundo (x, z) e UV em metros do mundo: o veio corre
  // contínuo de uma parede pra outra, sem emenda (Matt, 25/10).
  bancadaCadeias(runs).forEach((cad) => {
    const poli = bancadaPoligonoCadeia(cad);
    if (poli.length < 3) return;
    runAtual = cad[0].r;
    const topo = Math.max(...cad.map((c) => c.r.topo)), esp = cad[0].r.esp;
    // recortes ABERTOS NA FRENTE (pia farm): entram no próprio contorno,
    // antes de virar Shape — um furo que encosta na borda não triangula.
    let contornoP = poli;
    Object.keys(bancadaRecortes).forEach((sid) => {
      if (!projectSlots.some((sl) => sl.id === sid || String(sl.id) === sid)) return;
      (bancadaRecortes[sid] || []).forEach((rc) => {
        if (rc && rc.aberto) contornoP = banEntalheFrente(contornoP, cad, rc.pts);
      });
    });
    const sh = new THREE.Shape(contornoP.map((p) => new THREE.Vector2(p.x, p.z)));
    const dentroTodo = (pts) => pts.every((p) => banDentro(p, poli));
    Object.keys(bancadaRecortes).forEach((sid) => {
      if (!projectSlots.some((sl) => sl.id === sid || String(sl.id) === sid)) return;
      (bancadaRecortes[sid] || []).forEach((pts) => {
        if (!Array.isArray(pts) || !dentroTodo(pts)) return;
        sh.holes.push(new THREE.Path(pts.map((p) => new THREE.Vector2(p.x, p.z))));
      });
    });
    const geo = new THREE.ExtrudeGeometry(sh, { depth: esp, bevelEnabled: false, curveSegments: 4 });
    const tampo = new THREE.Mesh(geo, mat);
    const m4 = new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, -1, 0));
    m4.setPosition(0, topo + esp, 0);
    tampo.matrixAutoUpdate = false;
    tampo.matrix.copy(m4);
    // selecionado: qualquer trecho da cadeia acende o contorno da peça toda
    const selDaCadeia = cad.some((c) => c.r.id === banSelId);
    tampo.userData.bancadaRun = cad.find((c) => c.r.id === banSelId) ? banSelId : cad[0].r.id;
    raiz.add(semClique(contorno(tampo, selDaCadeia)));
  });
  runs.forEach((r) => {
    runAtual = r;
    // ---- waterfall nas pontas
    const vb = -(r.tras || 0);
    if (r.wfE) caixa(r, r.uE, r.uE + r.esp, vb, r.membros[0].frente, 0, r.topo);
    if (r.wfD) caixa(r, r.uD - r.esp, r.uD, vb, r.membros[r.membros.length - 1].frente, 0, r.topo);
    // ---- backsplash (só parede; ilha NUNCA tem pedra atrás)
    if (!r.ilha && cfg.splash !== 'nenhum') bancadaSplash(r, cfg, paredes, runs, placa);
    // ---- setas de esticar (só no selecionado)
    if (r.id === banSelId) {
      const yS = r.topo + r.esp + 0.012;
      banSetasDo(r).forEach(([nome, u, v, du, dv]) => {
        const cone = new THREE.ConeGeometry(0.035, 0.1, 18);
        cone.translate(0, 0.05, 0);
        const seta = new THREE.Mesh(cone, matSeta);
        const dir = new THREE.Vector3(r.U.x * du + r.N.x * dv, 0, r.U.z * du + r.N.z * dv).normalize();
        seta.quaternion.setFromUnitVectors(Y, dir);
        const p = banMundo(r, u, v);
        seta.position.set(p.x + dir.x * 0.03, yS, p.z + dir.z * 0.03);
        seta.renderOrder = 21;
        raiz.add(semClique(seta));
      });
    }
  });
  return raiz;
}

function bancadaSplash(r, cfg, paredes, runs, placa) {
  const topoPedra = r.topo + r.esp;
  const w = paredes.find((p) => p.wallIndex === r.wallIndex);
  let uS = Math.max(r.u0, r.uE), uF = Math.min(r.u1, r.uD); // só sobre os módulos (não sobre o balanço da ponta)
  // canto em L: o espelho corre até o canto, encostando no espelho da outra parede
  const outros = runs.filter((s) => s !== r && !s.ilha);
  const noOutro = (u) => outros.some((s) => banDentro(banMundo(r, u, 0.005), s.poli.map(([a, b]) => banMundo(s, a, b))));
  // canto ligado: vai até o canto; o 2º trecho para na espessura do espelho do 1º
  if (r.canto && r.canto.E) uS = banDot(r.canto.E.C, r.U) + (r.canto.E.prim ? 0 : BANCADA_SPLASH_ESP_M);
  if (r.canto && r.canto.D) uF = banDot(r.canto.D.C, r.U) - (r.canto.D.prim ? 0 : BANCADA_SPLASH_ESP_M);
  if (w && !(r.canto && (r.canto.E || r.canto.D))) {
    const a = banDot({ x: w.originX, z: w.originZ }, r.U);
    const b = banDot({ x: w.originX + w.alongDirX * w.widthM, z: w.originZ + w.alongDirZ * w.widthM }, r.U);
    const lo = Math.min(a, b), hi = Math.max(a, b);
    if (noOutro(uS - 0.01)) uS = lo + BANCADA_SPLASH_ESP_M;
    if (noOutro(uF + 0.01)) uF = hi - BANCADA_SPLASH_ESP_M;
  }
  if (uF - uS < 0.02) return;
  // altura em cada ponto: espelho fixo, ou "alto" até o aéreo de cima
  const aereos = [];
  (runs.itens || []).forEach((it) => {
    if (it.tipo !== 'aereo' || it.ilha || Number(it.slot.wall_index || 0) !== r.wallIndex) return;
    aereos.push({ a: it.cu - it.f.w / 2, b: it.cu + it.f.w / 2, y: it.f.oy });
  });
  const padraoAlto = aereos.length ? Math.min(...aereos.map((x) => x.y)) - topoPedra : 0.457;
  // aberturas da parede (janela limita a altura, porta/passagem corta)
  const abert = [];
  if (w && Array.isArray(w.openings)) {
    w.openings.forEach((o) => {
      const x0 = (Number(o.x_mm) || 0) / 1000, x1 = x0 + (Number(o.width_mm) || 0) / 1000;
      const ua = banDot({ x: w.originX + w.alongDirX * x0, z: w.originZ + w.alongDirZ * x0 }, r.U);
      const ub = banDot({ x: w.originX + w.alongDirX * x1, z: w.originZ + w.alongDirZ * x1 }, r.U);
      const sill = (Number(o.sill_mm) || 0) / 1000;
      abert.push({ a: Math.min(ua, ub), b: Math.max(ua, ub), sill: (o.type === 'window' || o.type === 'nicho') ? sill : 0 });
    });
  }
  const cortes = new Set([uS, uF]);
  aereos.concat(abert).forEach((x) => { if (x.a > uS && x.a < uF) cortes.add(x.a); if (x.b > uS && x.b < uF) cortes.add(x.b); });
  const us = Array.from(cortes).sort((a, b) => a - b);
  const segs = [];
  for (let i = 0; i < us.length - 1; i++) {
    const a = us[i], b = us[i + 1];
    if (b - a < 0.005) continue;
    const meio = (a + b) / 2;
    let h;
    if (cfg.splash === 'alto') {
      const em = aereos.filter((x) => x.a <= meio && x.b >= meio);
      h = em.length ? Math.min(...em.map((x) => x.y)) - topoPedra : padraoAlto;
    } else {
      h = (Number(cfg.splash_mm) || 102) / 1000;
    }
    abert.filter((x) => x.a <= meio && x.b >= meio).forEach((x) => { h = Math.min(h, x.sill - topoPedra); });
    segs.push({ a, b, h: h < 0.03 ? 0 : h });
  }
  // junta os pedaços vizinhos numa placa só (o contorno sobe e desce)
  let corrente = [];
  const fecha = () => {
    if (!corrente.length) return;
    const pts = [[corrente[0].a, 0], [corrente[corrente.length - 1].b, 0]];
    for (let i = corrente.length - 1; i >= 0; i--) pts.push([corrente[i].b, corrente[i].h], [corrente[i].a, corrente[i].h]);
    const lim = [];
    pts.forEach((p) => { const q = lim[lim.length - 1]; if (!q || Math.abs(q[0] - p[0]) > 1e-5 || Math.abs(q[1] - p[1]) > 1e-5) lim.push(p); });
    placa(r, lim, topoPedra, BANCADA_SPLASH_ESP_M);
    corrente = [];
  };
  segs.forEach((s) => { if (s.h > 0) corrente.push(s); else fecha(); });
  fecha();
}

// área aproximada (m²): tampo + waterfall + backsplash simplificado
function bancadaAreaM2() {
  const runs = bancadaRuns();
  const cfg = bancadaCfg();
  if (!cfg) return 0;
  let a = 0;
  runs.forEach((r) => {
    const p = r.poli;
    let s = 0;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) s += (p[j][0] + p[i][0]) * (p[j][1] - p[i][1]);
    a += Math.abs(s) / 2;
    if (r.wfE) a += r.topo * (r.membros[0].frente + (r.tras || 0));
    if (r.wfD) a += r.topo * (r.membros[r.membros.length - 1].frente + (r.tras || 0));
    if (!r.ilha && cfg.splash === 'espelho') a += (r.u1 - r.u0) * (Number(cfg.splash_mm) || 102) / 1000;
    if (!r.ilha && cfg.splash === 'alto') a += (r.u1 - r.u0) * 0.457;
  });
  return a;
}

function bancadaRedesenha() {
  try { if (typeof renderProjectCanvas === 'function') renderProjectCanvas(); } catch (e) { /* ok */ }
  try {
    const w = document.getElementById('po-proj-3d-wrap');
    if (w && w.style.display !== 'none' && typeof generateProject3D === 'function') generateProject3D();
  } catch (e) { /* ok */ }
}
function bancadaMudou() {
  try { if (typeof markProjectDirty === 'function') markProjectDirty(); } catch (e) { /* ok */ }
  banCache.chave = null;
  bancadaRedesenha();
  renderJanelaBancada();
}

// Salvar / abrir (portal-09) e projeto novo (portal-08)
function getProjectBancadaForSave() { return projectBancada ? JSON.parse(JSON.stringify(projectBancada)) : null; }
function restoreProjectBancada(v) {
  projectBancada = bancadaNormaliza(v);
  banCache.chave = null;
  bancadaRecortes = {};
  atualizaBotaoBancada();
  const m = document.getElementById('po-ban-modal');
  if (m && m.classList.contains('open')) renderJanelaBancada();
}

(function ligaViewersBancada() {
  [typeof ViewerProjectEdit !== 'undefined' ? ViewerProjectEdit : null,
    typeof ViewerProject !== 'undefined' ? ViewerProject : null].forEach((v) => {
    if (v && v.setArchitectureBuilder) v.setArchitectureBuilder(bancadaMontar, 'bancada');
  });
})();

// ---------------------------------------------------------------- janela
function banUnidade() { return (document.getElementById('po-unit-select') || {}).value || 'mm'; }
function banFmt(mm) {
  try { return (typeof formatDimensionNumber === 'function') ? formatDimensionNumber(mm, banUnidade()) : String(Math.round(mm)); } catch (e) { return String(Math.round(mm)); }
}
function banParse(txt) {
  try {
    const v = (typeof parseDimensionInput === 'function') ? parseDimensionInput(txt, banUnidade()) : parseFloat(txt);
    return (v === null || isNaN(v)) ? null : v;
  } catch (e) { return null; }
}
const banEsc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function atualizaBotaoBancada() {
  const btn = document.getElementById('po-proj-countertop-btn');
  if (btn) btn.classList.toggle('active', !!bancadaCfg());
}

// Planta (vista de cima) com paredes, módulos base (clicáveis) e a pedra.
function bancadaPlantaSvg() {
  const paredes = (getProjectWallGeometry() || []).filter((p) => !p.oculta);
  const cfg = projectBancada || BANCADA_PADRAO;
  const excl = new Set(cfg.excluidos || []);
  const runs = bancadaCfg() ? bancadaRuns() : [];
  const itens = [];
  projectSlots.forEach((slot) => {
    const t = bancadaClassifica(slot);
    if (t !== 'base') return;
    const f = banFrame(slot, getProjectWallGeometry() || []);
    if (!f) return;
    const cs = [[-1, 0], [1, 0], [1, 1], [-1, 1]].map(([sx, sz]) => ({
      x: f.ox + f.U.x * sx * f.w / 2 + f.N.x * (sz - 0.5) * f.d, z: f.oz + f.U.z * sx * f.w / 2 + f.N.z * (sz - 0.5) * f.d
    }));
    itens.push({ id: slot.id, cs, off: excl.has(slot.id) });
  });
  const pts = [];
  paredes.forEach((w) => { pts.push({ x: w.originX, z: w.originZ }, { x: w.originX + w.alongDirX * w.widthM, z: w.originZ + w.alongDirZ * w.widthM }); });
  itens.forEach((it) => pts.push(...it.cs));
  const polis = runs.map((r) => r.poli.map(([u, v]) => banMundo(r, u, v)));
  polis.forEach((p) => pts.push(...p));
  if (!pts.length) return '';
  const minX = Math.min(...pts.map((p) => p.x)) - 0.2, maxX = Math.max(...pts.map((p) => p.x)) + 0.2;
  const minZ = Math.min(...pts.map((p) => p.z)) - 0.2, maxZ = Math.max(...pts.map((p) => p.z)) + 0.2;
  const W = 360, esc = W / Math.max(maxX - minX, 0.5), H = Math.max(120, Math.min(320, (maxZ - minZ) * esc));
  const e2 = Math.min(esc, H / Math.max(maxZ - minZ, 0.5));
  const P = (p) => ((p.x - minX) * e2).toFixed(1) + ',' + ((p.z - minZ) * e2).toFixed(1);
  let s = '<svg class="po-ban-planta" viewBox="0 0 ' + ((maxX - minX) * e2).toFixed(0) + ' ' + ((maxZ - minZ) * e2).toFixed(0) + '" xmlns="http://www.w3.org/2000/svg">';
  paredes.forEach((w) => {
    s += '<line x1="' + P({ x: w.originX, z: w.originZ }).split(',')[0] + '" y1="' + P({ x: w.originX, z: w.originZ }).split(',')[1]
      + '" x2="' + P({ x: w.originX + w.alongDirX * w.widthM, z: w.originZ + w.alongDirZ * w.widthM }).split(',')[0]
      + '" y2="' + P({ x: w.originX + w.alongDirX * w.widthM, z: w.originZ + w.alongDirZ * w.widthM }).split(',')[1] + '" class="po-ban-parede"/>';
  });
  polis.forEach((p) => { s += '<polygon points="' + p.map(P).join(' ') + '" class="po-ban-pedra"/>'; });
  itens.forEach((it) => { s += '<polygon points="' + it.cs.map(P).join(' ') + '" class="po-ban-mod' + (it.off ? ' off' : '') + '" data-mod="' + banEsc(it.id) + '"><title>' + banEsc(it.off ? banT('excluded') : banT('legend_stone')) + '</title></polygon>'; });
  s += '</svg>';
  return s;
}

let banAba = null;          // aba de pedras aberta
let banAjustesAberto = false;
function renderJanelaBancada() {
  const m = document.getElementById('po-ban-modal');
  if (!m || !m.classList.contains('open')) return;
  const cfg = projectBancada || bancadaNormaliza(BANCADA_PADRAO);
  const uni = banUnidade();
  const runs = bancadaCfg() ? bancadaRuns() : [];
  const pedraAtual = bancadaPedra(cfg.pedra);
  if (!banAba) banAba = pedraAtual.g;
  const inp = (campo, mm) => '<span class="po-geo-inp"><input type="text" data-ban="' + campo + '" value="' + banEsc(banFmt(mm)) + '"><em>' + banEsc(uni) + '</em></span>';
  let h = '';
  // situação em 1 linha
  if (!bancadaCfg()) h += '<p class="po-ban-status off">' + banEsc(banT('st_off')) + ' <button type="button" class="po-ban-link" data-ban-ligar>' + banEsc(banT('turn_on')) + '</button></p>';
  else if (!runs.length) h += '<p class="po-ban-status off">' + banEsc(banT('none_found')) + '</p>';
  else {
    const a = bancadaAreaM2();
    h += '<p class="po-ban-status">✓ ' + banEsc(banT('st_on', { n: runs.reduce((t, r) => t + r.membros.length, 0) })) + ' · ' + (a * 10.7639).toFixed(0) + ' ft²</p>';
  }
  // 2) backsplash e waterfall — cartões com desenho (Matt: "faz uns ícones
  // pra facilitar o entendimento do que é cada botão")
  const ico = (k) => '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round">' + BAN_ICONES[k] + '</svg>';
  const op = (attr, ativo, k, rot) => '<button type="button" class="po-ban-op' + (ativo ? ' ativo' : '') + '" ' + attr + '>' + ico(k) + '<span>' + banEsc(banT(rot)) + '</span></button>';
  h += '<div class="po-ban-tit">' + banEsc(banT('splash')) + '</div><div class="po-ban-ops">'
    + op('data-splash="nenhum"', cfg.splash === 'nenhum', 'sp_nenhum', 'sp_none_s')
    + op('data-splash="espelho"', cfg.splash === 'espelho', 'sp_espelho', 'sp_mirror_s')
    + op('data-splash="alto"', cfg.splash === 'alto', 'sp_alto', 'sp_high_s')
    + (runs.some((r) => r.ilha) ? op('data-wf-ilhas-btn', !!cfg.wf_ilhas, 'waterfall', 'wf_islands') : '')
    + '</div>';
  if (runs.length) h += '<p class="hint po-ban-dica">' + banEsc(banT('tip_3d')) + '</p>';
  // 1) pedra (abas por tipo)
  h += '<div class="po-ban-tit">' + banEsc(banT('stone')) + '</div><div class="po-ban-abas">' + BANCADA_GRUPOS.map((g) => '<button type="button" data-aba="' + g + '"' + (banAba === g ? ' class="ativo"' : '') + '>' + banEsc(banT('g_' + g)) + '</button>').join('') + '</div>';
  h += '<div class="po-ban-grid">' + BANCADA_CATALOGO.filter((p) => p.g === banAba).map((p) => '<button type="button" class="po-ban-pedra-card' + (cfg.pedra === p.id ? ' selected' : '') + '" data-pedra="' + p.id + '" title="' + banEsc(bancadaNome(p)) + '"><img src="assets/stones/' + p.id + '_thumb.jpg?v=1" alt="" loading="lazy"><span>' + banEsc(bancadaNome(p)) + '</span></button>').join('') + '</div>';
  // 3) ajustes (fechado)
  let aj = '';
  const svg = bancadaPlantaSvg();
  if (svg) aj += '<p class="hint">' + banEsc(banT('plan_hint')) + '</p><div class="po-ban-planta-wrap">' + svg + '<div class="po-ban-legenda"><i class="pedra"></i>' + banEsc(banT('legend_stone')) + '<i class="off"></i>' + banEsc(banT('legend_off')) + '</div></div>';
  runs.forEach((r) => {
    const ini = r.membros[0].slot.id, fim = r.membros[r.membros.length - 1].slot.id;
    const pE = (cfg.pontas || {})[ini + '|E'] || {}, pD = (cfg.pontas || {})[fim + '|D'] || {};
    const titulo = (r.ilha ? banT('island') : banT('wall_n', { n: r.wallIndex + 1 })) + ' · ' + banT('modules', { n: r.membros.length }) + ' · ' + banFmt((r.uD - r.uE) * 1000) + ' ' + uni;
    aj += '<div class="po-ban-trecho"><b>' + banEsc(titulo) + '</b><div class="po-ban-trecho-op">';
    if (!r.aparadoE) aj += '<label class="po-ban-check"><input type="checkbox" data-wf="' + banEsc(ini) + '|E"' + (r.wfE ? ' checked' : '') + '> ' + banEsc(banT('wf_left')) + '</label>';
    if (!r.aparadoD) aj += '<label class="po-ban-check"><input type="checkbox" data-wf="' + banEsc(fim) + '|D"' + (r.wfD ? ' checked' : '') + '> ' + banEsc(banT('wf_right')) + '</label>';
    if (r.ilha) {
      const tras = Math.max(0, ...r.membros.map((mm) => Number((cfg.ilha_tras || {})[mm.slot.id]) || 0));
      aj += '<label>' + banEsc(banT('back')) + '<span class="po-geo-inp"><input type="text" data-tras="' + banEsc(r.membros.map((mm) => mm.slot.id).join(',')) + '" value="' + banEsc(banFmt(tras)) + '"><em>' + banEsc(uni) + '</em></span></label>';
      aj += '<label>' + banEsc(banT('ext_left')) + '<span class="po-geo-inp"><input type="text" data-ext="' + banEsc(ini) + '|E" value="' + banEsc(banFmt(Number(pE.ext_mm) || 0)) + '"><em>' + banEsc(uni) + '</em></span></label>';
      aj += '<label>' + banEsc(banT('ext_right')) + '<span class="po-geo-inp"><input type="text" data-ext="' + banEsc(fim) + '|D" value="' + banEsc(banFmt(Number(pD.ext_mm) || 0)) + '"><em>' + banEsc(uni) + '</em></span></label>';
    }
    aj += '</div></div>';
  });
  aj += '<div class="po-geo-campos po-ban-opcoes">';
  aj += '<label>' + banEsc(banT('thick')) + '<select data-ban-sel="esp_mm"><option value="20"' + (Number(cfg.esp_mm) === 20 ? ' selected' : '') + '>2 cm (3/4")</option><option value="30"' + (Number(cfg.esp_mm) !== 20 ? ' selected' : '') + '>3 cm (1 1/4")</option></select></label>';
  if (cfg.splash === 'espelho') aj += '<label>' + banEsc(banT('sp_h')) + inp('splash_mm', cfg.splash_mm) + '</label>';
  aj += '<label>' + banEsc(banT('ov_door')) + inp('bal_porta_mm', cfg.bal_porta_mm) + '</label>';
  aj += '<label>' + banEsc(banT('ov_box')) + inp('bal_caixa_mm', cfg.bal_caixa_mm) + '</label>';
  aj += '<label>' + banEsc(banT('ov_end')) + inp('bal_ponta_mm', cfg.bal_ponta_mm) + '</label>';
  aj += '</div>';
  h += '<details class="po-ban-ajustes"' + (banAjustesAberto ? ' open' : '') + '><summary>' + banEsc(banT('adjust')) + '</summary>' + aj + '</details>';
  if (projectBancada) h += '<div class="po-ban-rodape"><button type="button" class="po-ban-link po-geo-del" data-ban-remover>' + banEsc(banT('remove')) + '</button></div>';
  const corpo = m.querySelector('.po-geo-corpo');
  const rolagem = corpo.scrollTop;
  corpo.innerHTML = h;
  corpo.scrollTop = rolagem;
  const det = corpo.querySelector('.po-ban-ajustes');
  if (det) det.addEventListener('toggle', () => { banAjustesAberto = det.open; });
}

function bancadaGaranteCfg() {
  if (!projectBancada) projectBancada = bancadaNormaliza(BANCADA_PADRAO);
  return projectBancada;
}

function abrirJanelaBancada() {
  let m = document.getElementById('po-ban-modal');
  if (!m) {
    m = document.createElement('div');
    m.id = 'po-ban-modal';
    m.innerHTML = '<div class="po-geo-card" role="dialog" aria-modal="false">'
      + '<button type="button" class="po-auth-modal-close po-ban-fechar" aria-label="×">&times;</button>'
      + '<h2></h2><p class="hint po-ban-sub"></p><div class="po-geo-corpo"></div></div>';
    document.body.appendChild(m);
    m.addEventListener('click', (ev) => {
      const t = ev.target;
      if (t.closest('.po-ban-fechar')) { m.classList.remove('open'); return; }
      const mod = t.closest('[data-mod]');
      if (mod) {
        const c = bancadaGaranteCfg();
        c.ativo = true;
        const id = mod.getAttribute('data-mod');
        const real = (projectSlots.find((s) => String(s.id) === id) || {}).id;
        const ix = c.excluidos.findIndex((x) => String(x) === id);
        if (ix >= 0) c.excluidos.splice(ix, 1); else c.excluidos.push(real != null ? real : id);
        bancadaMudou();
        return;
      }
      const ab = t.closest('[data-aba]');
      if (ab) { banAba = ab.dataset.aba; renderJanelaBancada(); return; }
      if (t.closest('[data-wf-ilhas-btn]')) {
        const c = bancadaGaranteCfg(); c.wf_ilhas = !c.wf_ilhas; c.ativo = true;
        Object.keys(c.pontas).forEach((k) => { if (c.pontas[k]) delete c.pontas[k].wf; });
        bancadaMudou(); return;
      }
      const sp = t.closest('[data-splash]');
      if (sp) { const c = bancadaGaranteCfg(); c.splash = sp.dataset.splash; c.ativo = true; bancadaMudou(); return; }
      if (t.closest('[data-ban-ligar]')) { const c = bancadaGaranteCfg(); c.ativo = true; atualizaBotaoBancada(); bancadaMudou(); return; }
      const pd = t.closest('[data-pedra]');
      if (pd) { const c = bancadaGaranteCfg(); c.pedra = pd.dataset.pedra; c.ativo = true; bancadaMudou(); return; }
      if (t.closest('[data-ban-remover]')) { const c = bancadaGaranteCfg(); c.ativo = false; bancadaRecortes = {}; atualizaBotaoBancada(); bancadaMudou(); }
    });
    m.addEventListener('change', (ev) => {
      const t = ev.target;
      const c = bancadaGaranteCfg();
      if (t.matches('[data-ban-ativo]')) { c.ativo = !!t.checked; }
      else if (t.matches('[data-wf-ilhas]')) {
        c.wf_ilhas = !!t.checked;
        // o botão geral manda: limpa escolhas de waterfall feitas ponta a ponta
        Object.keys(c.pontas).forEach((k) => { if (c.pontas[k]) delete c.pontas[k].wf; });
      }
      else if (t.matches('[data-ban-sel]')) { const k = t.dataset.banSel; c[k] = k === 'esp_mm' ? Number(t.value) : t.value; }
      else if (t.matches('[data-ban]')) { const v = banParse(t.value); if (v != null && v >= 0) c[t.dataset.ban] = v; }
      else if (t.matches('[data-wf]')) { const k = t.dataset.wf; c.pontas[k] = Object.assign({}, c.pontas[k] || {}, { wf: !!t.checked }); }
      else if (t.matches('[data-ext]')) { const v = banParse(t.value); const k = t.dataset.ext; if (v != null && v >= 0) c.pontas[k] = Object.assign({}, c.pontas[k] || {}, { ext_mm: v }); }
      else if (t.matches('[data-tras]')) {
        const v = banParse(t.value);
        if (v != null && v >= 0) t.dataset.tras.split(',').forEach((id) => { c.ilha_tras[id] = v; });
      } else return;
      atualizaBotaoBancada();
      bancadaMudou();
    });
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && m.classList.contains('open')) m.classList.remove('open'); });
  }
  m.querySelector('h2').textContent = banT('title');
  m.querySelector('.po-ban-sub').textContent = banT('sub');
  // primeira vez: já liga com o padrão — a pedra aparece no 3D na hora
  // Clicou em Bancada = coloca a pedra (Matt: "quero um botão que coloque pra mim")
  if (!projectBancada || !projectBancada.ativo) { bancadaGaranteCfg().ativo = true; atualizaBotaoBancada(); bancadaMudou(); }
  try { const g = document.getElementById('po-geo-modal'); if (g) g.classList.remove('open'); } catch (e) { /* ok */ }
  m.classList.add('open');
  renderJanelaBancada();
}

(function attachBancada() {
  const btn = document.getElementById('po-proj-countertop-btn');
  if (btn) btn.addEventListener('click', () => {
    try { if (window.LegnoTbMenus) window.LegnoTbMenus.menus.forEach((x) => x.fechar()); } catch (e) { /* ok */ }
    abrirJanelaBancada();
  });
  const lbl = document.getElementById('po-proj-countertop-lbl');
  if (lbl) lbl.textContent = banT('btn');
  if (btn) { btn.title = banT('title'); btn.setAttribute('aria-label', banT('title')); }
  atualizaBotaoBancada();
})();

// ==========================================================================
// PEDRA COMO PEÇA NO 3D (25/10, Matt: "preciso poder clicar na pedra e
// esticar, remover... trabalhar como uma peça. porém não sai no orçamento,
// é só decorativo"). Clique na pedra seleciona o TRECHO (contorno vermelho +
// setas); seta esquerda/direita estica ou encurta a ponta, seta da frente
// muda o balanço, seta de trás (ilha) estica pra banqueta; Delete tira a
// pedra daquele trecho; Esc solta. Nada disso entra em preço/pedido.
// ==========================================================================
function banViewer() { return (typeof ViewerProjectEdit !== 'undefined' && ViewerProjectEdit) || null; }
// Redesenha SÓ a pedra na cena de edição (rápido, pro arraste). O grupo raiz
// continua o mesmo (é ele que está na lista da cena); trocam os filhos.
function bancadaRedesenhaSoPedra() {
  const v = banViewer();
  const sc = v && v.getScene && v.getScene();
  banCache.chave = null;
  if (!sc || typeof THREE === 'undefined') return;
  let raiz = null;
  sc.traverse((o) => { if (!raiz && o.userData && o.userData.isBancada) raiz = o; });
  if (!raiz) { bancadaRedesenha(); return; }
  while (raiz.children.length) {
    const c = raiz.children[0];
    raiz.remove(c);
    c.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
  const novo = bancadaMontar(THREE, {});
  if (novo) novo.children.slice().forEach((c) => raiz.add(c));
}
function banSelecionar(id) {
  if (banSelId === id) return;
  banSelId = id;
  bancadaRedesenhaSoPedra();
}

(function ligaMouseBancada() {
  if (window.PO_VIEW3D_READONLY) return;
  let arr = null;
  const CURSOR = { esq: 'ew-resize', dir: 'ew-resize', frente: 'ns-resize', tras: 'ns-resize' };
  const ehCanvas = (ev) => {
    const v = banViewer();
    const dom = v && v.getDomElement && v.getDomElement();
    return dom && ev.target === dom ? dom : null;
  };
  const runDoId = (id) => bancadaRuns().find((r) => r.id === id) || null;
  const setaSob = (v, cx, cy) => {
    if (banSelId == null || !v.worldToClient) return null;
    const r = runDoId(banSelId);
    if (!r) return null;
    const y = r.topo + r.esp + 0.012;
    let melhor = null, dMin = 18;
    banSetasDo(r).forEach(([nome, u, vv]) => {
      const p = banMundo(r, u, vv);
      const sc = v.worldToClient(new THREE.Vector3(p.x, y, p.z));
      if (!sc) return;
      const d = Math.hypot(sc.x - cx, sc.y - cy);
      if (d < dMin) { dMin = d; melhor = nome; }
    });
    return melhor;
  };
  window.addEventListener('pointerdown', (ev) => {
    const dom = ehCanvas(ev);
    if (!dom || ev.button !== 0 || ev.shiftKey || !bancadaCfg()) return;
    const v = banViewer();
    const seta = setaSob(v, ev.clientX, ev.clientY);
    if (seta) {
      ev.stopPropagation(); ev.preventDefault();
      arr = { id: banSelId, seta, pointerId: ev.pointerId, andou: false };
      try { dom.setPointerCapture(ev.pointerId); } catch (e) { /* ok */ }
      return;
    }
    const hit = v.pickBancadaAt ? v.pickBancadaAt(ev.clientX, ev.clientY) : null;
    if (!hit) { if (banSelId != null) banSelecionar(null); return; }
    ev.stopPropagation(); ev.preventDefault();
    try { if (typeof selectedProjectSlotId !== 'undefined' && selectedProjectSlotId != null && typeof deselectProjectSlot === 'function') deselectProjectSlot(); } catch (e) { /* ok */ }
    try { if (typeof geoSelecionar === 'function' && typeof geometriaSelId !== 'undefined' && geometriaSelId) geoSelecionar(null, false); } catch (e) { /* ok */ }
    banSelecionar(hit.id);
  }, true);

  window.addEventListener('pointermove', (ev) => {
    const v = banViewer();
    if (!arr) {
      const dom = ehCanvas(ev);
      if (dom && !ev.buttons && bancadaCfg()) {
        const st = setaSob(v, ev.clientX, ev.clientY);
        if (st) { dom.style.cursor = CURSOR[st]; dom.dataset.banCursor = '1'; }
        else if (dom.dataset.banCursor) { dom.style.cursor = ''; delete dom.dataset.banCursor; }
      }
      return;
    }
    if (ev.pointerId !== arr.pointerId) return;
    ev.stopPropagation();
    arr.andou = true;
    const r = runDoId(arr.id);
    const cfg = bancadaCfg();
    if (!r || !cfg) return;
    const pt = v.intersectPlaneAtClient(ev.clientX, ev.clientY, { x: 0, y: r.topo + r.esp, z: 0 }, { x: 0, y: 1, z: 0 });
    if (!pt) return;
    const [u, vv] = banLocal(r, pt);
    const mm = (m) => { const x = Math.round(m * 1000); return Math.abs(x) < 6 ? 0 : x; };
    const ini = r.membros[0].slot.id, fim = r.membros[r.membros.length - 1].slot.id;
    if (arr.seta === 'esq') cfg.pontas[ini + '|E'] = Object.assign({}, cfg.pontas[ini + '|E'] || {}, { ext_mm: mm(r.u0 - u) });
    else if (arr.seta === 'dir') cfg.pontas[fim + '|D'] = Object.assign({}, cfg.pontas[fim + '|D'] || {}, { ext_mm: mm(u - r.u1) });
    else if (arr.seta === 'frente') {
      const atual = (Number((cfg.frente_ext || {})[ini]) || 0) / 1000;
      const semExtra = Math.max(...r.membros.map((m) => m.frente)) - atual;
      cfg.frente_ext = cfg.frente_ext || {};
      cfg.frente_ext[ini] = Math.max(-(semExtra - 0.15) * 1000, mm(vv - semExtra));
    } else if (arr.seta === 'tras') {
      const t = Math.max(0, mm(-vv));
      r.membros.forEach((m) => { cfg.ilha_tras[m.slot.id] = t; });
    }
    bancadaRedesenhaSoPedra();
  }, true);

  const fim = (ev) => {
    if (!arr || ev.pointerId !== arr.pointerId) return;
    ev.stopPropagation();
    const andou = arr.andou;
    try { const dom = ehCanvas(ev); if (dom) dom.releasePointerCapture(ev.pointerId); } catch (e) { /* ok */ }
    arr = null;
    if (andou) bancadaMudou();
  };
  window.addEventListener('pointerup', fim, true);
  window.addEventListener('pointercancel', fim, true);

  window.addEventListener('keydown', (ev) => {
    if (banSelId == null) return;
    const t = ev.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (ev.key === 'Delete' || ev.key === 'Backspace') {
      ev.preventDefault(); ev.stopImmediatePropagation();
      const r = runDoId(banSelId);
      const cfg = bancadaCfg();
      if (r && cfg) r.membros.forEach((m) => { if (!cfg.excluidos.some((x) => String(x) === String(m.slot.id))) cfg.excluidos.push(m.slot.id); });
      banSelId = null;
      bancadaMudou();
    } else if (ev.key === 'Escape') {
      ev.stopImmediatePropagation();
      banSelecionar(null);
    }
  }, true);
})();
