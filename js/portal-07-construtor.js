// portal-07-construtor.js — parte 7/9 de js/portal.js (ver
// portal-01-core-catalogo.js). O CRIADOR DE INTERNOS — construtor de vãos
// embutido na aba Projetos (motor: js/layout-engine.js). Catálogo de
// agregados, ícones, desenho SVG do vão, regra "nada do construtor encosta
// no casco", entalhe por peça de casco, medida digitada, e a conversão
// árvore -> peça de verdade (LayoutEngine.toPieceRows) que vira 3D/preço/
// plano de corte. Ver [[gaveta_folga_fundo_20mm]] e
// [[construtor_pe_plastico_dobrava_114mm]] pro histórico recente de bugs aqui.

// ==========================================================================
// CUSTOMIZAR — abre o CRIADOR DE ARMÁRIO com este módulo (2026-08-12)
// ==========================================================================
// "quero um botao a mais de customizar que leve pra tela de criador de
// armario. ja com modulo aberto pra ser inserido dos internos."
//
// A tela é a do ERP (erp/index.html#/construtor?m=<uuid>, rota que já aceita o
// módulo na query — ver app.js do ERP), carregada num iframe DENTRO do portal,
// como o Matt pediu ("dentro do portal, na mesma tela"). Não é uma segunda
// implementação do construtor: manter duas cópias da regra de vãos/casco/3D é
// exatamente o tipo de divergência que já custou caro aqui.
//
// DOIS AVISOS que valem pra quem for mexer nisso:
//  1. O construtor edita o MÓDULO DO CATÁLOGO, não esta instância do projeto.
//     Salvar lá muda o módulo pra todo projeto/pedido que o use.
//  2. O ERP tem login próprio; sem sessão lá, o iframe mostra a tela de login
//     dele (é o mesmo Supabase, então normalmente já está logado).
// ==========================================================================
// CRIADOR DE INTERNOS — TELA DO PORTAL (2026-08-13)
// ==========================================================================
// Nasceu embutindo a tela do ERP num iframe e foi cortado na hora:
//   "NAOOOO... nao e pra abrir um portao e mandar pro ERP. e pra ter uma tela
//    como essa mas com a parte de insercao do construtor. escolhe o vao
//    escolhe os itens e insere como achar melhor. mas nao tem absolutamente
//    nada haver com o ERP... deve ser bem mais facil e intuitivo de trabalhar,
//    sem texto, pouco preenchimento e bastante clique e arraste."
//
// Então: tela PRÓPRIA, nenhuma linha do ERP carregada, nenhum campo de texto,
// nenhuma árvore. Dois painéis — o vão desenhado e as peças que cabem nele —
// e a interação é clicar ou arrastar.
//
// ==========================================================================
// 2ª PASSADA (2026-08-13) — O MESMO MOTOR DO ERP
// ==========================================================================
// A 1ª versão tinha VÃO ÚNICO e um formato de dados próprio (slot.internals):
// inserir uma prateleira não criava espaço novo, só empilhava um retângulo
// decorativo. O pedido foi direto:
//
//   "quero a mesma coisa que o construtor de armário do ERP. clicar no vão,
//    escolher o que quero inserir"
//
// Então esta tela passou a rodar o MESMO MOTOR — js/layout-engine.js — e a
// ler as MESMAS tabelas da migration 085 (accessory_types /
// module_accessory_options / module_layout_nodes) que a tela do ERP.
//
// ISSO NÃO É "abrir o ERP no portal" (aquilo foi recusado, ver acima):
// nenhum arquivo de erp/ é carregado aqui. O que é compartilhado é o
// LayoutEngine, que é PURO (aritmética, sem DOM e sem banco) — a mesma peça
// nasce no mesmo milímetro nas duas telas porque a conta é literalmente a
// mesma função, e não duas cópias que vão divergir no terceiro ajuste.
//
// A árvore montada pelo cliente fica em slot.layout (spec §4.5:
// user_projects.slots já é jsonb — nenhuma migration).
//
// O QUE FALTA (próxima etapa): a árvore virar peça de verdade no 3D, no preço
// e na furação. A ponte já existe e é uma linha — LayoutEngine.toPieceRows(
// projectBuilderBuilt.pieces, projectBuilderCat) devolve linhas no formato de
// module_components. Ver docs/internos-como-modulos-no-projeto.md.
let projectBuilderSlotId = null;
let projectBuilderZone = null;      // { x, y, z, w, h, d } em mm, no módulo
let projectBuilderCasco = [];       // caixas do casco — só pra DEDUZIR a zona interna
let projectBuilderDesenho = [];     // TODAS as peças — o desenho fiel do módulo no fundo
let projectBuilderRoot = null;      // árvore de vãos (nó do LayoutEngine)
let projectBuilderCat = {};         // catálogo de agregados, keyed por accessory_type_id
let projectBuilderWhite = {};       // module_accessory_options, keyed pelo mesmo id
let projectBuilderBuilt = null;     // { pieces, voids, zona } — saída do motor
let projectBuilderSelId = null;     // nó (vão) selecionado
let projectBuilderUndo = [];        // pilha de árvores serializadas
let projectBuilderLoadError = null; // erro do banco, mostrado no lugar da lista
// De onde saiu a zona interna: 'cadastro' (fórmula do módulo), 'casco'
// (deduzida das peças via Drilling), 'cena' (medida no 3D) ou 'palpite'
// (chapa de 18mm, quando nada foi reconhecido). Aparece NO RODAPÉ DA JANELA
// do construtor — diagnóstico no lugar onde a pessoa já está olhando, em vez
// de só no console.
let projectBuilderZoneDiag = null;
// Estado da caixa de quantidade (2026-08-15, Matt: "conforme eu escolha a
// quantidade ele vai aparecendo no vão, não precisa clicar no ícone").
// Mora FORA do DOM de propósito: mexer na seta insere na hora, o que
// redesenha a biblioteca inteira — se o número morasse no <span>, ele
// voltaria pra 1 a cada clique.
//   projectBuilderQtd[accId]  -> número mostrado na caixa
//   projectBuilderQtdAlvo[accId] -> em QUAL vão esta caixa está mexendo. Fica
//     cravado porque inserir move a seleção pro primeiro filho; sem isso, o
//     2º clique dividiria o filho em vez de refazer a divisão do mesmo vão.
let projectBuilderQtd = {};
// Busca e filtro do painel de componentes (2026-08-16). Vivem FORA do render
// porque o painel se redesenha a cada clique em vão (a lista muda: só entra o
// que cabe), e perder o que a pessoa digitou a cada clique seria insuportável.
let projectBuilderLibQuery = '';
let projectBuilderLibGroup = '';   // '' = Todos
let projectBuilderQtdAlvo = {};
// SELEÇÃO DE VÁRIOS VÃOS (2026-08-15, Matt: "se eu colocar uma divisória e
// várias prateleiras e quiser colocar uma porta única no vão, preciso clicar
// no vão, arrastar pros outros vãos, incluindo os vãos que quero, e aplicar
// uma porta por cima").
//
// Guarda os ids dos vãos pintados. Eles são SEMPRE irmãos (mesmo pai): uma
// porta cobre um intervalo contíguo de filhos de uma divisão — que é
// exatamente o que LayoutEngine.applyFront(node, acc, from, to) já sabe
// fazer, com from/to sendo índices dos filhos. Sem isso não haveria como
// exprimir "uma folha na frente destes 3 vãos".
let projectBuilderSelIds = [];
let projectBuilderRangeDrag = null;   // { ancoraId, startX, startY } enquanto arrasta

// Irmãos do nó (os filhos do pai dele) + o índice dele ali dentro.
function projectBuilderIrmaos(nodeId) {
  const pai = projectBuilderFindParent(projectBuilderRoot, nodeId);
  if (!pai || !(pai.children || []).length) return null;
  const i = pai.children.findIndex((k) => k.id === nodeId);
  return i < 0 ? null : { pai, kids: pai.children, i };
}

// Caminho da raiz até o nó: [raiz, ..., nó].
function projectBuilderCaminho(nodeId) {
  const out = [];
  let n = LayoutEngine.findNode(projectBuilderRoot, nodeId);
  let guarda = 0;
  while (n && guarda++ < 64) {
    out.unshift(n);
    n = projectBuilderFindParent(projectBuilderRoot, n.id);
  }
  return out;
}

// Pinta do vão-âncora até o vão sob o ponteiro, inclusive. Uma porta só cobre
// vãos IRMÃOS (filhos contíguos do mesmo pai — applyFront).
// 03/11 (Matt: "quando coloco uma divisoria no construtor ele nao deixa eu
// selecionar todos os vaos"): antes, vãos de pais diferentes (um dentro da
// divisória, outro fora) não selecionavam nada. Agora sobe até o ANCESTRAL
// COMUM e seleciona os filhos dele entre os dois ramos — a parte dividida
// entra inteira, como um vão só.
function projectBuilderSelecionaFaixa(ancoraId, ateId) {
  const pa = projectBuilderCaminho(ancoraId);
  const pb = projectBuilderCaminho(ateId);
  if (!pa.length || !pb.length || pa[0] !== pb[0]) return;
  let k = 0;
  while (k < pa.length && k < pb.length && pa[k] === pb[k]) k++;
  if (k === 0 || k >= pa.length || k >= pb.length) return; // um contém o outro
  const pai = pa[k - 1];
  const kids = pai.children || [];
  const ia = kids.indexOf(pa[k]);
  const ib = kids.indexOf(pb[k]);
  if (ia < 0 || ib < 0) return;
  const ini = Math.min(ia, ib), fim = Math.max(ia, ib);
  projectBuilderSelIds = kids.slice(ini, fim + 1).map((n) => n.id);
  // principal continua sendo o vão (folha) onde o arraste começou — é onde
  // prateleira/divisória cairiam; a porta usa a faixa (projectBuilderFaixaAtual)
  projectBuilderSelId = ancoraId;
  projectBuilderPintaSelecao();
}

// Atualiza só as classes dos retângulos já desenhados — de propósito NÃO
// redesenha o palco: no meio do arraste isso destruiria os elementos sob o
// ponteiro e mataria o gesto (foi o que quebrou o arrasto da divisória, ver
// startProjectBuilderDivDrag).
function projectBuilderPintaSelecao() {
  const stage = document.getElementById('po-proj-builder-stage');
  if (!stage) return;
  stage.querySelectorAll('rect[data-node-id]').forEach((r) => {
    // vão de dentro de um nó selecionado (divisória inteira na faixa) também pinta
    const dentro = (projectBuilderSelIds.length
      ? projectBuilderCaminho(r.dataset.nodeId).some((n) => projectBuilderSelIds.indexOf(n.id) >= 0)
      : r.dataset.nodeId === projectBuilderSelId);
    r.classList.toggle('selected', dentro);
  });
}
// 19.5mm (2026-08-15, pedido do Matt): era 18 — combinado antes como 20mm,
// agora fixado em 19.5mm pros componentes principais (ver migration 101,
// que corrige o catálogo pra bater com este número). Só entra quando o
// agregado não tem thickness_formula próprio (ver projectBuilderAccessoryEntry
// mais abaixo — isFinite(esp) && esp > 0 ? esp : PROJECT_BUILDER_ESPESSURA).
const PROJECT_BUILDER_ESPESSURA = 19.5;
const PROJECT_BUILDER_FOLGA_DOB = 2;
const PROJECT_BUILDER_MIN_VAO = 40;
const PROJECT_BUILDER_PASSO = 5;    // passo do arrasto de divisória, em mm
const PROJECT_BUILDER_UNDO_MAX = 30;
// Piso de distância (px de tela) pra um pointerenter em outro vão contar
// como arraste de faixa de propósito — ver listener de pointerenter em
// renderProjectBuilderStage (bug do iPad travando seleção, 2026-08-23).
const PROJECT_BUILDER_DRAG_MIN_PX = 10;

async function openProjectModuleBuilder(slotId) {
  const slot = projectSlots.find((s) => s.id === slotId);
  if (!slot || !slot.module) return;
  const modal = document.getElementById('po-proj-builder-modal');
  if (!modal) return;
  if (typeof LayoutEngine === 'undefined') {
    alert(I18n.t('project.builder_engine_missing'));
    return;
  }

  projectBuilderSlotId = slotId;
  // Busca/filtro do painel são de UMA sessão de edição — abrir outro módulo
  // com "porta" ainda digitado esconderia metade do catálogo sem explicação.
  projectBuilderLibQuery = '';
  projectBuilderLibGroup = '';
  projectBuilderZone = computeProjectSlotInnerZone(slot);
  projectBuilderCasco = computeProjectSlotCascoBoxes(slot);
  // Desenho FIEL do módulo, separado do casco (2026-08-15). São dois usos
  // diferentes das mesmas peças e por isso duas listas:
  //   projectBuilderCasco   -> DEDUZIR a zona interna. Só interessa lateral/
  //                            topo/base/fundo, e Drilling basta.
  //   projectBuilderDesenho -> DESENHAR o módulo atrás do vão. Aqui interessa
  //                            TUDO: toe kick, pé, frente, travessa. Matt:
  //                            "no construtor ainda nao aparece o modulo
  //                            certo, com rodape se tem rodape".
  // Medir na cena devolve TODA malha desenhada (não só os position_role que
  // o Drilling conhece), que é o que "fiel" quer dizer. Cai pro Drilling se
  // o 3D não estiver disponível. Roda uma vez por abertura, não a cada
  // clique — renderProjectBuilderStage só lê a lista pronta.
  projectBuilderDesenho = computeProjectSlotCascoBoxes(slot, true, true);
  if (!projectBuilderDesenho || !projectBuilderDesenho.length) {
    projectBuilderDesenho = projectBuilderCasco;
  }
  projectBuilderCat = {};
  projectBuilderWhite = {};
  projectBuilderUndo = [];
  projectBuilderLoadError = null;
  projectBuilderRoot = LayoutEngine.newVoid();
  projectBuilderSelId = projectBuilderRoot.id;
  projectBuilderBuilt = null;

  const titulo = document.getElementById('po-proj-builder-title');
  if (titulo) titulo.textContent = slot.module.name || '';
  modal.classList.add('open');
  // Desenha o casco vazio ANTES da rede: a janela abre cheia, não em branco.
  rebuildProjectBuilder();

  let erro = null;
  let carregado = null;
  try {
    carregado = await loadProjectBuilderCatalog(slot.module.id);
  } catch (e) {
    erro = e;
  }
  // A janela pode ter sido fechada (ou trocada de módulo) durante o await.
  if (projectBuilderSlotId !== slotId) return;
  if (carregado) {
    projectBuilderCat = carregado.cat;
    projectBuilderWhite = carregado.white;
    // Layout que o CLIENTE já montou neste slot; senão, VÃO VAZIO.
    // O layout de FÁBRICA (module_layout_nodes, carregado.root) NÃO entra
    // mais (14/10, Matt: "cliquei no construtor e ele já colocou vários
    // agregados sem eu pedir" — eram restos de teste salvos no catálogo pelo
    // Construtor do ERP em agosto). Decisão dele: "nunca carregar interior
    // de fábrica". Os dados continuam no banco; pra religar, troque
    // LayoutEngine.newVoid() abaixo por (carregado.root || LayoutEngine.newVoid()).
    projectBuilderRoot = slot.layout
      ? LayoutEngine.deserialize(slot.layout)
      : LayoutEngine.newVoid();
  }
  projectBuilderLoadError = erro;
  rebuildProjectBuilder(true);
}

// Roda o motor e redesenha. É o único caminho: toda alteração da árvore
// termina aqui, e nada desenha a partir da árvore direto (o motor é quem sabe
// onde cada vão ficou depois do rateio).
// Espessura da chapa do CASCO deste slot (2026-09-24, plywood 18mm) — o E
// que resolvePiecesForViewer usa nas laterais/base (Pricing.cascoThicknessMm,
// pela cor escolhida), passado pro motor como opts.espessuraCasco pra
// divisória/prateleira do construtor sair na mesma chapa do casco. Sem slot
// ou sem cor: 19.5, o comportamento de sempre.
function projectBuilderEspessuraCasco(slot) {
  try {
    if (!slot || !slot.pieces || typeof Pricing === 'undefined' || !Pricing.cascoThicknessMm) return PROJECT_BUILDER_ESPESSURA;
    return Pricing.cascoThicknessMm(slot.pieces, slot.colorsByRole || {}, slot.pieceColorOverrides) || PROJECT_BUILDER_ESPESSURA;
  } catch (e) { return PROJECT_BUILDER_ESPESSURA; }
}

function rebuildProjectBuilder(reselecionar) {
  if (!projectBuilderRoot || !projectBuilderZone) return;
  try {
    // Sobreposição manual do vão raiz (arrastar as 4 bordas, 2026-08-21 2ª
    // rodada) entra AQUI — por cima da zona deduzida do casco, só em x/y/w/h.
    // Ver projectBuilderRootZoneEfetiva.
    const zonaEfetiva = projectBuilderRootZoneEfetiva(
      projectBuilderZone, projectBuilderRoot,
      projectSlots.find((s) => s.id === projectBuilderSlotId)
    );
    projectBuilderBuilt = LayoutEngine.build(projectBuilderRoot, zonaEfetiva, {
      catalogo: projectBuilderCat,
      espessura: PROJECT_BUILDER_ESPESSURA,
      espessuraCasco: projectBuilderEspessuraCasco(projectSlots.find((s) => s.id === projectBuilderSlotId)),
      folgaDobradica: PROJECT_BUILDER_FOLGA_DOB,
      temFundo: !!projectBuilderZone.temFundo
    });
    // Nada do construtor pode atravessar peça do módulo (travessa de fundo,
    // por exemplo) — ver clipProjectInternalsAgainstCasco. projectBuilderDesenho
    // é a lista de TODAS as peças do módulo sem as frentes, medida na abertura
    // da janela, que é exatamente o conjunto de obstáculos que interessa.
    clipProjectInternalsAgainstCasco(projectBuilderBuilt.pieces, projectBuilderDesenho);
    recortarInternosContraCasco(projectBuilderBuilt.pieces, projectBuilderDesenho);
  } catch (e) {
    projectBuilderBuilt = { pieces: [], voids: [], zona: projectBuilderZone };
  }
  const vaos = projectBuilderBuilt.voids || [];
  // Seleção sempre num vão que EXISTE: inserir uma prateleira apaga o vão
  // selecionado e cria dois no lugar dele.
  if (reselecionar || !vaos.some((v) => v.nodeId === projectBuilderSelId)) {
    projectBuilderSelId = vaos.length ? vaos[0].nodeId : projectBuilderRoot.id;
  }
  renderProjectBuilderStage();
  renderProjectBuilderLibrary();
}

// VÃO RAIZ — sobreposição manual (2026-08-21, 2ª rodada). Matt, depois do
// 1º fix (digitar a medida do vão raiz mudava o MÓDULO inteiro): "nao me
// ajudou . preciso mexer com setas e alinhas com as pecas do movel se
// quiser. hoje ele deixa eu reduzir mas nao deixa eu deslocar. ou seja, nao
// tenho controle do vao que quero utilizar". Confirmou querer arrastar as 4
// bordas livremente (sem soma preservada com vizinho, porque o vão raiz não
// tem vizinho — é o próprio interior do módulo).
//
// `projectBuilderRoot.params.zoneOverride` = {x,y,w,h} em mm, no sistema de
// coordenadas do módulo (mesmo de projectBuilderZone) — quando presente,
// substitui x/y/w/h da zona DEDUZIDA do casco (computeProjectSlotInnerZone)
// só nesses 4 campos; z/d/temFundo (profundidade) sempre continuam vindo da
// dedução, porque a tela 2D do Construtor é só frente (W×H), não edita
// profundidade. Guardado em `params` de propósito: é o único campo genérico
// que LayoutEngine.serialize/deserialize já carregam de um lado pro outro
// sem precisar mexer em layout-engine.js (serialize whitelista id/splitAxis/
// splitAcc/sizeMode/sizeValue/content/fronts/params/locked/children — ver lá
// — e `params` sempre foi passthrough).
//
// Reclampa a CADA rebuild (não só no momento do arrasto) contra o W/H ATUAL
// do módulo — rede de segurança pro caso de o módulo ter mudado de tamanho
// por fora (canvas principal) enquanto essa sobreposição antiga ainda
// existia; sem isso reabrir o Construtor podia mostrar um vão maior que o
// próprio módulo.
// O VÃO AJUSTADO ACOMPANHA O MÓDULO (2026-10-12, Matt: "quando altero
// depois de ter colocado agregados os agregados não estão seguindo a
// alteração de tamanhos"). O override era x/y/w/h ABSOLUTO: aumentar o
// módulo deixava o vão (e tudo dentro dele) do tamanho antigo. Agora ele
// guarda refW/refH (medida do módulo quando foi ajustado) e, se o módulo
// mudou, mantém as DISTÂNCIAS até as 4 bordas do módulo — o vão estica ou
// encolhe junto. Override antigo sem refW/refH continua absoluto.
function projectBuilderOverrideRef(slot) {
  return { refW: Number((slot && slot.width_mm) || 0) || null, refH: Number((slot && slot.height_mm) || 0) || null };
}
function projectBuilderRootZoneEfetiva(zonaAuto, root, slot) {
  const ov = root && root.params && root.params.zoneOverride;
  if (!ov || !zonaAuto) return zonaAuto;
  const W = Number((slot && slot.width_mm) || 0) || (zonaAuto.x + zonaAuto.w);
  const H = Number((slot && slot.height_mm) || 0) || (zonaAuto.y + zonaAuto.h);
  let x0 = Math.max(0, Number(ov.x) || 0);
  let y0 = Math.max(0, Number(ov.y) || 0);
  let w = Math.max(PROJECT_BUILDER_MIN_VAO, Number(ov.w) || 0);
  let h = Math.max(PROJECT_BUILDER_MIN_VAO, Number(ov.h) || 0);
  const refW = Number(ov.refW) || 0, refH = Number(ov.refH) || 0;
  if (refW > 0 && Math.abs(refW - W) > 0.5) {
    const dir = Math.max(0, refW - (x0 + w));          // folga até a borda direita
    w = Math.max(PROJECT_BUILDER_MIN_VAO, W - x0 - dir);
  }
  if (refH > 0 && Math.abs(refH - H) > 0.5) {
    const topo = Math.max(0, refH - (y0 + h));         // folga até o topo
    h = Math.max(PROJECT_BUILDER_MIN_VAO, H - y0 - topo);
  }
  if (x0 + w > W) { if (x0 > W - PROJECT_BUILDER_MIN_VAO) x0 = Math.max(0, W - PROJECT_BUILDER_MIN_VAO); w = Math.max(PROJECT_BUILDER_MIN_VAO, W - x0); }
  if (y0 + h > H) { if (y0 > H - PROJECT_BUILDER_MIN_VAO) y0 = Math.max(0, H - PROJECT_BUILDER_MIN_VAO); h = Math.max(PROJECT_BUILDER_MIN_VAO, H - y0); }
  // BORDA ÍMÃ (2026-10-15, Matt: "parece estar menor do que o vão" — lateral
  // divisória parando 4 mm abaixo do stretcher). Override salvo com a zona
  // deduzida de uma versão anterior (909.5 de altura contra 913.7 de hoje)
  // ficava alguns mm fora das peças do casco, e ninguém enxerga 4 mm no 2D
  // do Construtor. Borda a até IMA_MM da borda deduzida do casco = é a
  // mesma borda: gruda nela. Ajuste de verdade (maior que isso) continua
  // valendo como sempre.
  const IMA_MM = 6;
  const ax0 = zonaAuto.x, ax1 = zonaAuto.x + zonaAuto.w, ay0 = zonaAuto.y, ay1 = zonaAuto.y + zonaAuto.h;
  let x1 = x0 + w, y1 = y0 + h;
  if (Math.abs(x0 - ax0) <= IMA_MM) x0 = ax0;
  if (Math.abs(x1 - ax1) <= IMA_MM) x1 = ax1;
  if (Math.abs(y0 - ay0) <= IMA_MM) y0 = ay0;
  if (Math.abs(y1 - ay1) <= IMA_MM) y1 = ay1;
  w = Math.max(PROJECT_BUILDER_MIN_VAO, x1 - x0);
  h = Math.max(PROJECT_BUILDER_MIN_VAO, y1 - y0);
  return Object.assign({}, zonaAuto, { x: x0, y: y0, w: w, h: h });
}

// Apaga a sobreposição manual — volta a usar a zona deduzida do casco. Sem
// isso não teria como "desfazer" um arrasto ruim a não ser pelo ↶ do
// cabeçalho (que também funciona, mas exige acertar o número de passos).
function clearProjectBuilderRootZoneOverride() {
  if (!projectBuilderRoot || !projectBuilderRoot.params || !projectBuilderRoot.params.zoneOverride) return;
  pushProjectBuilderUndo();
  delete projectBuilderRoot.params.zoneOverride;
  markProjectDirty();
  rebuildProjectBuilder();
}

function pushProjectBuilderUndo() {
  if (!projectBuilderRoot) return;
  projectBuilderUndo.push(JSON.stringify(LayoutEngine.serialize(projectBuilderRoot)));
  if (projectBuilderUndo.length > PROJECT_BUILDER_UNDO_MAX) projectBuilderUndo.shift();
}
function undoProjectBuilder() {
  const anterior = projectBuilderUndo.pop();
  if (!anterior) return;
  projectBuilderRoot = LayoutEngine.deserialize(JSON.parse(anterior));
  markProjectDirty();
  rebuildProjectBuilder(true);
}
function resetProjectBuilder() {
  if (!projectBuilderRoot) return;
  pushProjectBuilderUndo();
  projectBuilderRoot = LayoutEngine.newVoid();
  markProjectDirty();
  rebuildProjectBuilder(true);
}

// Zona interna do módulo, em mm, no referencial do próprio módulo (canto
// chão-fundo-esquerda). Fórmula cadastrada (modules.inner_*) ganha; sem ela,
// deduz do casco — a MESMA regra do construtor do ERP, reescrita aqui em 20
// linhas em vez de importar o arquivo dele (a tela é independente de
// propósito). Sem casco reconhecível, cai no módulo inteiro.
// FRENTE DO VÃO E RECUO DE 1mm (2026-08-16)
// ==========================================================================
// Matt: "as divisórias estão passando pra frente da lateral, e vejo pela
// listagem que elas estão na mesma profundidade. o vão é menor, e quero 1mm
// menor ainda do que o vão livre."
//
// Eram DOIS problemas somados:
//
//   1. A zona interna nunca teve FRENTE. A dedução achava x0/x1/y0/y1/z0 e a
//      profundidade saía de `D - z0` — a medida EXTERNA do módulo. Numa
//      lateral recuada pra porta (profundidade D-19.5, encostada em z=0) a
//      divisória nascia com a MESMA profundidade da lateral, só que começando
//      depois do fundo (z=19.5): mesmo número na listagem, 19.5mm pra fora na
//      frente. Era exatamente o que ele estava vendo.
//      Agora a frente do vão é a FRENTE DA LATERAL (o menor `z0+sz` entre as
//      peças classificadas como left/right), e a profundidade é `z1 - z0`.
//
//   2. Mesmo com a frente certa, ele quer folga: a peça do construtor sai 1mm
//      mais curta que o vão livre, sempre, sem depender de `recuo_mm`
//      cadastrado em cada agregado. O desconto sai NA FRENTE (o fundo fica
//      alinhado), a mesma escolha do emitDivider em 2026-08-15.
//
// Só as LATERAIS definem a frente — não topo/base. Uma travessa de base rasa
// classificada como 'bottom' encolheria o vão inteiro sem motivo. Sem lateral
// reconhecida, a frente continua sendo D (o comportamento de antes).
const RECUO_FRENTE_INTERNO_MM = 1;
// Piso de sanidade: peça estranha classificada como lateral não pode
// engolir o vão. Abaixo disso, a frente volta pra D.
const FRENTE_MIN_FRACAO_D = 0.4;

function computeProjectSlotInnerZone(slot) {
  const W = Number(slot.width_mm || 0), H = Number(slot.height_mm || 0), D = Number(slot.depth_mm || 0);
  const m = slot.module || {};
  const vars = { W, H, D };
  const ev = (f, padrao) => {
    if (!f) return padrao;
    try {
      const n = Pricing.evalFormula(String(f), vars);
      return isFinite(n) ? n : padrao;
    } catch (e) { return padrao; }
  };

  // Dedução pelo casco: a maior borda interna de cada lado.
  //
  // POR GEOMETRIA, NÃO POR position_role (2026-08-13). A versão anterior lia
  // b.role ('left'/'right'/'top'/'bottom'/'back') e não achava nada nos
  // módulos cujo casco está cadastrado como PEÇA LIVRE — que é a maioria aqui
  // (a posição "Frente/porta" tem bugs de posicionamento no 3D e o admin
  // passou a usar 'free' com offset pra quase tudo; ver o comentário em
  // pricing.js/calculateLeafPiece). Sem achar lateral nenhuma, a zona interna
  // virava o módulo inteiro — o "hoje está pegando todo" que o Matt viu.
  //
  // A regra agora é o que a peça É, não como foi cadastrada: peça FINA que
  // ENCOSTA numa face do módulo e COBRE boa parte dela é casco daquele lado.
  // Prateleira no meio não encosta em y=0 nem em y=H, então não conta; porta
  // fica na frente (z alto) e é ignorada de propósito — porta não muda o vão
  // (quem recua os internos é o consumo de profundidade do próprio motor).
  // DUAS FONTES, NESTA ORDEM — e o critério pra trocar de uma pra outra NÃO é
  // "veio caixa?", é "deu pra achar o casco?". Essa distinção era o bug que
  // sobrou: Drilling.pieceBox só conhece alguns position_role e devolve null
  // pro resto, então um módulo com as LATERAIS num papel desconhecido, mas com
  // porta em 'free' e prateleira em 'shelf', DEVOLVIA CAIXAS — nenhuma delas
  // casco. Como havia caixa, o caminho que mede a cena nunca era tentado e o
  // vão continuava do tamanho do módulo.
  const deduzirCasco = (boxes) => {
    let a = 0, b0 = 0, c = 0, d1 = W, e1 = H, f1 = 0;
    // 1º passe: só as laterais, pra saber a faixa vertical do CORPO (ver
    // `faixa` em classifyProjectCascoBox — pé/toe por baixo).
    let faixa = null;
    (boxes || []).forEach((b) => {
      const l = classifyProjectCascoBox(b, W, H, D);
      if (l !== 'left' && l !== 'right') return;
      const y0 = b.y0, y1 = b.y0 + b.sy;
      faixa = faixa ? { y0: Math.min(faixa.y0, y0), y1: Math.max(faixa.y1, y1) } : { y0, y1 };
    });
    (boxes || []).forEach((b) => {
      const lado = classifyProjectCascoBox(b, W, H, D, faixa);
      const ex = b.x0 + b.sx, ey = b.y0 + b.sy, ez = b.z0 + b.sz;
      if (lado === 'left' && ex > a) a = ex;
      else if (lado === 'right' && b.x0 < d1) d1 = b.x0;
      else if (lado === 'bottom' && ey > b0) b0 = ey;
      else if (lado === 'top' && b.y0 < e1) e1 = b.y0;
      else if (lado === 'back' && ez > c) c = ez;
      // A FRENTE do vão é a frente da lateral MAIS CURTA — assim a peça do
      // construtor não passa da frente de nenhuma das duas.
      if (lado === 'left' || lado === 'right') f1 = (f1 === 0) ? ez : Math.min(f1, ez);
    });
    // BASE ELEVADA (14/10): armário de cozinha com a lateral indo até o
    // chão (recorte de rodapé) e a base 114mm acima — ela não encosta em
    // face nenhuma, então nunca virava 'bottom' e o vão descia até o piso.
    // Sem base achada: o painel horizontal MAIS BAIXO que cobre largura e
    // profundidade, dentro do quarto inferior do corpo. O mais baixo vence,
    // então fundo de gaveta/prateleira (sempre acima da base) não engana.
    if (b0 === 0) {
      const fy0 = faixa ? faixa.y0 : 0, fy1 = faixa ? faixa.y1 : H;
      let menor = null;
      (boxes || []).forEach((b) => {
        if (b.role === 'front' || b.role === 'leg') return;
        if (!(b.sy < H * 0.35 && b.sx > W * 0.45 && b.sz > D * 0.45)) return;
        if (b.y0 <= fy0 + 8 || b.y0 > fy0 + (fy1 - fy0) * 0.25) return;
        if (!menor || b.y0 < menor.y0) menor = b;
      });
      if (menor) b0 = menor.y0 + menor.sy;
    }
    return {
      x0: a, y0: b0, z0: c, x1: d1, y1: e1, z1: f1,
      achou: !(a === 0 && b0 === 0 && c === 0 && d1 === W && e1 === H)
    };
  };
  let x0 = 0, y0 = 0, z0 = 0, x1 = W, y1 = H, z1 = 0;
  projectBuilderZoneDiag = null;
  try {
    let r = deduzirCasco(computeProjectSlotCascoBoxes(slot));
    let fonte = 'casco';
    if (!r.achou) { r = deduzirCasco(computeProjectSlotCascoBoxes(slot, true)); fonte = 'cena'; }
    if (!r.achou) {
      // PASSE FROUXO — "quem encosta na face, e é fino, é casco".
      // Sem exigir que cubra a face (a exigência que barra lateral recortada,
      // módulo com pé alto, casco cheio de divisória). O limite de 25% é o que
      // impede uma porta ou um fundo inteiro de comer a caixa toda.
      // A medida sai da PEÇA DE VERDADE, então acompanha 18mm, 3/4" ou o que
      // for — diferente do palpite abaixo.
      const bs = computeProjectSlotCascoBoxes(slot, true);
      let a = 0, b0 = 0, c = 0, d1 = W, e1 = H, f1 = 0;
      const T = 8;
      bs.forEach((b) => {
        const ex = b.x0 + b.sx, ey = b.y0 + b.sy, ez = b.z0 + b.sz;
        const ehLateral = b.sx < W * 0.25 && (b.x0 <= T || ex >= W - T);
        if (b.x0 <= T && b.sx < W * 0.25 && ex > a) a = ex;
        if (ex >= W - T && b.sx < W * 0.25 && b.x0 < d1) d1 = b.x0;
        if (b.y0 <= T && b.sy < H * 0.25 && ey > b0) b0 = ey;
        if (ey >= H - T && b.sy < H * 0.25 && b.y0 < e1) e1 = b.y0;
        if (b.z0 <= T && b.sz < D * 0.25 && ez > c) c = ez;
        if (ehLateral) f1 = (f1 === 0) ? ez : Math.min(f1, ez);
      });
      if (!(a === 0 && b0 === 0 && c === 0 && d1 === W && e1 === H)) {
        r = { x0: a, y0: b0, z0: c, x1: d1, y1: e1, z1: f1, achou: true };
        fonte = 'contato';
      }
    }
    if (!r.achou) {
      // NUNCA DEIXAR O VÃO SER O MÓDULO INTEIRO. Se nem o cadastro nem a cena
      // deixaram reconhecer o casco, um palpite de chapa de 18mm (6mm no
      // fundo) erra por milímetros; devolver a medida externa erra por uma
      // lateral inteira e faz o cliente inserir peça que não cabe. A tela
      // avisa que é palpite (ver projectBuilderZoneDiag).
      const E = 18, EF = 6;
      if (W > E * 3 && H > E * 3) {
        r = { x0: E, y0: E, z0: EF, x1: W - E, y1: H - E, achou: false };
        fonte = 'palpite';
      }
    }
    x0 = r.x0; y0 = r.y0; z0 = r.z0; x1 = r.x1; y1 = r.y1; z1 = r.z1 || 0;
    projectBuilderZoneDiag = { fonte, modulo: [Math.round(W), Math.round(H), Math.round(D)] };
    // REDE DE SEGURANÇA: nenhuma caixa reconhecida como casco. Acontece se
    // drilling.js não carregar (foi o bug de 2026-08-13: o portal não incluía
    // o arquivo) ou num módulo cadastrado de um jeito que a classificação não
    // pega. Antes disso o vão silenciosamente virava o módulo INTEIRO, que é o
    // pior resultado possível — o cliente insere prateleira do tamanho errado
    // e nada na tela avisa. LayoutEngine.innerZoneFromParts faz a mesma
    // dedução pelos PAPÉIS + offsets, sem depender do drilling.
    if (x0 === 0 && y0 === 0 && z0 === 0 && x1 === W && y1 === H
      && typeof LayoutEngine !== 'undefined' && LayoutEngine.innerZoneFromParts) {
      try {
        // { W, H, D } — mesma armadilha de computeProjectSlotCascoBoxes (ver
        // comentário longo lá): a forma { width_mm, ... } fazia esta rede de
        // segurança lançar e cair no catch, sem nunca ter chance de agir.
        const parts = resolvePiecesForViewer(
          slot.pieces, { W: W, H: H, D: D },
          slot.colorsByRole, slot.shelfQuantities, slot.dimOverrides, slot.pieceColorOverrides
        );
        const z = LayoutEngine.innerZoneFromParts(parts || [], W, H, D);
        if (z && z.w < W) { x0 = z.x; x1 = z.x + z.w; }
        if (z && z.h < H) { y0 = z.y; y1 = z.y + z.h; }
        if (z && z.z > 0) { z0 = z.z; }
      } catch (e) { /* segue com o módulo inteiro */ }
    }
  } catch (e) { /* sem casco: usa o módulo inteiro */ }
  // z0 > 0 só acontece quando alguma das buscas acima achou (ou, no
  // "palpite", assumiu) um fundo de verdade e descontou a espessura dele —
  // computado só AGORA (depois da rede de segurança acima, que também pode
  // reatribuir z0) pra não capturar um valor que ainda ia mudar. É o mesmo
  // sinal que LayoutEngine.build usa (opts.temFundo) pra saber se o caixote
  // (gaveta/gaveteiro/cesto) precisa de folga extra do fundo (2026-08-19,
  // ver FOLGA_FUNDO_CAIXOTE_MM em layout-engine.js).
  const temFundo = z0 > 0;
  const MIN_VAO = 40;
  if (x1 - x0 < MIN_VAO) { x0 = 0; x1 = W; }
  if (y1 - y0 < MIN_VAO) { y0 = 0; y1 = H; }

  // AVISO QUE SE DENUNCIA. Zona interna igual ao módulo inteiro quase sempre
  // é falha de dedução, não um módulo sem casco — e antes isso passava calado,
  // com o construtor oferecendo um vão do tamanho do móvel. Agora deixa rastro
  // no console com o material pra diagnosticar (quantas caixas vieram e como
  // cada uma foi classificada), sem precisar ligar flag nenhuma.
  if (x0 === 0 && y0 === 0 && z0 === 0 && x1 === W && y1 === H) {
    try {
      // As caixas MEDIDAS NA CENA (o último recurso, que também falhou) — são
      // elas que interessam pra entender por que nada foi classificado.
      const bs = computeProjectSlotCascoBoxes(slot, true);
      console.warn('[legno vao-interno] não achei o casco de "'
        + ((slot.module && slot.module.name) || '?') + '" — o vão saiu do tamanho do módulo. '
        + JSON.stringify({
          modulo_mm: [Math.round(W), Math.round(H), Math.round(D)],
          caixas: bs.length,
          temDrilling: typeof Drilling !== 'undefined',
          amostra: bs.slice(0, 8).map((b) => ({
            role: b.role || null,
            pos: [Math.round(b.x0), Math.round(b.y0), Math.round(b.z0)],
            tam: [Math.round(b.sx), Math.round(b.sy), Math.round(b.sz)],
            lado: classifyProjectCascoBox(b, W, H, D)
          }))
        }));
    } catch (e) { /* diagnóstico nunca pode quebrar a tela */ }
  }

  // Frente do vão: a da lateral, quando deu pra medir. O piso evita que uma
  // peça mal classificada (ou um casco medido na cena com sobra) transforme o
  // vão num filete — nesse caso vale D, como era antes desta regra existir.
  if (!(z1 > z0 + MIN_VAO) || z1 < D * FRENTE_MIN_FRACAO_D) z1 = D;

  // `dedu.d` é o VÃO LIVRE (frente da lateral menos o fundo). O recuo de 1mm
  // é aplicado só na volta — assim a fórmula cadastrada abaixo também o
  // recebe, e ninguém desconta duas vezes.
  const dedu = { x: x0, y: y0, z: z0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0), d: Math.max(1, z1 - z0), temFundo };
  const recuada = (d) => Math.max(1, d - RECUO_FRENTE_INTERNO_MM);
  if (!(m.inner_w_formula || m.inner_h_formula || m.inner_d_formula)) {
    return Object.assign({}, dedu, { d: recuada(dedu.d) });
  }

  // FÓRMULA CADASTRADA QUE NÃO DESCONTA NADA É IGNORADA (2026-08-13).
  //
  // modules.inner_*_formula existe pra a engenharia cravar a zona interna, e
  // por isso ela ganha da dedução. Só que uma fórmula igual a 'W'/'H'/'D' (ou
  // que resolva pro tamanho cheio) não é uma zona interna — é o módulo. E
  // basta UMA dessas pro construtor oferecer um vão do tamanho do móvel,
  // mesmo com o casco perfeitamente deduzido logo acima. Foi o "VÃO EXTERNO
  // ainda" que sobreviveu a todas as correções da dedução: o problema não
  // estava lá, estava aqui, um passo depois.
  //
  // Regra: eixo por eixo, a fórmula só vale se ela REDUZ de verdade (< 99% da
  // medida do módulo). Não reduzindo, vale o que foi deduzido do casco.
  // Cadastro certo continua mandando; cadastro vazio ou "cheio" deixa de
  // atrapalhar.
  const usa = (formula, deduzido, cheio) => {
    const v = ev(formula, deduzido);
    if (!isFinite(v) || v <= 0) return deduzido;
    if (v >= cheio * 0.99 && deduzido < cheio * 0.99) return deduzido;
    if (projectBuilderZoneDiag) projectBuilderZoneDiag.fonte = 'cadastro';
    return v;
  };
  return {
    x: ev(m.inner_x_formula, dedu.x), y: ev(m.inner_y_formula, dedu.y), z: ev(m.inner_z_formula, dedu.z),
    w: Math.max(1, usa(m.inner_w_formula, dedu.w, W)),
    h: Math.max(1, usa(m.inner_h_formula, dedu.h, H)),
    d: recuada(usa(m.inner_d_formula, dedu.d, D)),
    temFundo: dedu.temFundo
  };
}

// Que LADO do casco esta peça é — 'left' | 'right' | 'top' | 'bottom' |
// 'back', ou null quando ela não é casco (prateleira solta, porta, gaveta,
// pé, peça decorativa).
//
// O papel cadastrado ganha quando existe: é informação explícita da
// engenharia e vale mais que qualquer palpite. Mas a maioria dos módulos daqui
// tem o casco em PEÇA LIVRE ('free') com offset — a posição "Frente/porta"
// tem bugs de posicionamento no 3D e o admin passou a evitar os papéis. Por
// isso existe o segundo caminho, pela geometria: peça FINA que ENCOSTA numa
// face e COBRE boa parte dela é o casco daquele lado.
//
// Os três números são folgados de propósito. Fino em 30% deixa passar lateral
// grossa de 25mm num módulo de 300mm (8%) e barra uma divisória central
// (nunca encosta na face). Cobrir 55% aceita lateral recortada (toe kick,
// gola — ver a coluna `recortes`) sem aceitar um rodapé baixinho como "base".
// `faixa` (14/10, opcional): {y0, y1} = onde o CORPO do móvel começa e
// termina na vertical (as laterais). Sem ela, 0..H como sempre. Motivo:
// armário montado com CASCO ANINHADO (Base Cabinet Doors, Drawer, Gola,
// Stove…) só é medido pela cena, e lá a base fica EM CIMA do pé (y=114), não
// encostada em y=0 — nunca virava 'bottom' e o vão descia até o chão
// ("os internos não estão marcando direito quando entra", Matt). Com a
// faixa das laterais, "encostar embaixo" passa a ser encostar no pé do corpo.
// TRAVESSA de cima (rasa, só na frente/fundo) também vira 'top': prateleira
// e gaveta não passam dela, então ela é o teto real do vão.
function classifyProjectCascoBox(b, W, H, D, faixa) {
  const r = b.role;
  if (r === 'left' || r === 'right' || r === 'top' || r === 'bottom' || r === 'back') return r;
  // Papéis que NUNCA são casco, mesmo encostando: pé fica embaixo cobrindo a
  // largura toda (viraria "base" e comeria o vão inteiro do módulo baixo), e
  // frente/porta encosta em tudo.
  if (r === 'leg' || r === 'front') return null;

  // Folgas afrouxadas em 2026-08-13 (2ª rodada): 2mm de tolerância barrava
  // lateral que nasce 3–5mm pra dentro (fundo em rebaixo, casco com folga de
  // montagem), e 55% de cobertura barrava lateral de módulo com pé alto ou
  // recorte de toe kick. O risco de afrouxar é confundir prateleira com base —
  // e não confunde: prateleira não encosta em y=0 nem em y=H, que é a primeira
  // condição de cada teste.
  const TOL = 8;        // "encosta" = até 8mm da face
  const FINA = 0.35;    // "fina" = < 35% da medida do módulo naquele eixo
  const COBRE = 0.45;   // "cobre a face" = > 45% nos outros dois eixos
  const ex = b.x0 + b.sx, ey = b.y0 + b.sy, ez = b.z0 + b.sz;

  if (b.sx < W * FINA && b.sy > H * COBRE && b.sz > D * COBRE) {
    if (b.x0 <= TOL) return 'left';
    if (ex >= W - TOL) return 'right';
  }
  const fy0 = faixa ? faixa.y0 : 0, fy1 = faixa ? faixa.y1 : H;
  if (b.sy < H * FINA && b.sx > W * COBRE && b.sz > D * COBRE) {
    if (b.y0 <= fy0 + TOL) return 'bottom';
    if (ey >= fy1 - TOL) return 'top';
  }
  // travessa superior: fina, larga, encostada no topo do corpo, rasa
  if (faixa && b.sy < H * FINA && b.sx > W * COBRE && b.sz >= D * 0.06 && ey >= fy1 - TOL && b.y0 > fy0 + TOL) return 'top';
  if (b.sz < D * FINA && b.sx > W * COBRE && b.sy > H * COBRE && b.z0 <= TOL) return 'back';
  return null;
}

// Caixas do casco em mm (as peças que já existem no módulo: laterais, topo,
// base, fundo). Servem pra duas coisas: deduzir a zona interna e desenhar o
// contorno cinza atrás dos vãos — o cliente precisa ver o armário, não um
// retângulo solto.
//
// AS PEÇAS PRECISAM ESTAR RESOLVIDAS. slot.pieces são as linhas do catálogo,
// com FÓRMULA em texto ('W-36'); Drilling lê width_mm/offset_x_mm, que só
// existem depois de resolvePiecesForViewer. Passar slot.pieces cru (como esta
// tela fazia na 1ª versão) devolve caixas de tamanho zero, a dedução não acha
// lateral nenhuma e a zona interna vira o módulo inteiro — que era exatamente
// o retângulo vazio que aparecia na tela.
function computeProjectSlotCascoBoxes(slot, medirNaCena, semFrentes) {
  const W = Number(slot.width_mm || 0), H = Number(slot.height_mm || 0), D = Number(slot.depth_mm || 0);
  if (!W || !H || !D) return [];
  let parts = null;
  try {
    // { W, H, D } — NÃO { width_mm, ... }. Pricing.calculatePiece começa com
    // `const { W, H, D } = dims`, então a forma errada faz W/H/D chegarem
    // undefined, toda fórmula que use H ou D virar NaN e a função INTEIRA
    // lançar "Fórmula resultou em valor inválido (divisão por zero?)". O
    // catch abaixo engolia isso e devolvia [] — em silêncio.
    //
    // Consequência (achada só em 2026-08-15, depurando no site publicado):
    // NENHUMA caixa de casco era devolvida em módulo NENHUM. Era essa a causa
    // real do "(palpite)" no rodapé do construtor e do módulo nunca aparecer
    // desenhado atrás do vão — inclusive o toe kick. As duas tentativas
    // anteriores (silhueta retangular, filtrar por classifyProjectCascoBox)
    // mexeram no DESENHO, mas a lista já chegava vazia; não tinha o que
    // desenhar. Os chamadores que sempre funcionaram (buildProjectAssemblies,
    // photoreal) já passavam { W, H, D } — só os dois do construtor estavam
    // fora do padrão.
    parts = resolvePiecesForViewer(
      slot.pieces, { W: W, H: H, D: D },
      slot.colorsByRole, slot.shelfQuantities, slot.dimOverrides, slot.pieceColorOverrides
    );
  } catch (e) { return []; }

  // DECORATIVO NÃO É CASCO (2026-10-25, Matt: "está considerando o módulo
  // menos a altura da pia. as portas e frente devem entrar considerando o
  // total do móvel"). A pia/cooktop decorativa dentro do módulo (shape_type
  // decor_*, migrations 231/235) sobra pra fora do topo e a cuba desce pra
  // dentro do corpo — entrava na dedução do vão interno e baixava a frente
  // e as portas. Fica fora da medida do casco.
  parts = (parts || []).filter((p) => !(p && /^decor_/.test(String(p.shape_type || ''))));

  // semFrentes: tira porta/frente ANTES de medir (2026-08-15). Só o DESENHO
  // do módulo no construtor pede isso, e o motivo é de desenho mesmo: a porta
  // cobre a face inteira do módulo e o desenho pinta as caixas em ordem de
  // profundidade, então ela sairia por ÚLTIMO, preenchida, tapando laterais,
  // base e toe kick — virando de novo o "retângulo cheio que parece outro
  // módulo". Quem edita internos está olhando pra DENTRO do móvel; a porta
  // aqui só atrapalha. Não afeta a dedução da zona interna: quem chama sem
  // esta flag continua recebendo tudo, e classifyProjectCascoBox já ignorava
  // 'front' de propósito.
  if (semFrentes) {
    parts = (parts || []).filter((p) => (p && p.position_role) !== 'front');
  }

  // Caminho barato: Drilling espelha viewer3d.placePieceInBox e devolve a
  // caixa de cada peça sem criar objeto 3D nenhum. Quem chama pede o caminho
  // caro explicitamente (medirNaCena) quando o barato não achou casco.
  //
  // PÉ (position_role='leg', migration 014/120) — 2026-08-18. H já inclui a
  // altura do pé, mas resolvePiecesForViewer (acima) resolveu as peças do
  // CORPO com offset_y_mm relativo ao CORPO (0 = piso do corpo, em cima do
  // pé) — mesma convenção de viewer3d.js/screens-construtor.js. Passar H
  // (o total) direto pro buildBoxes deixava as caixas do casco no
  // referencial errado: a base "nascia" em y=0 (o piso REAL do módulo) em
  // vez de y=legH_mm, e a zona interna deduzida por computeProjectSlotInnerZone
  // saía ~altura do pé mais baixa do que devia. Bate com o "medir na cena"
  // (measureProjectSlotBoxesFrom3D), que já está certo por medir a malha do
  // 3D — foi comparando os dois que o bug apareceu (Matt: "o interno ta
  // deslocado pra baixo", com o contorno laranja fora do lugar do desenho
  // de fundo, que vem da cena e sempre esteve certo).
  if (!medirNaCena) {
    let boxes = [];
    if (typeof Drilling !== 'undefined' && Drilling._internals && Drilling._internals.buildBoxes) {
      try {
        // resolveBodyDims precisa da lista CRUA (com as fórmulas, tipo
        // height_formula) — `parts` já é a SAÍDA resolvida de
        // resolvePiecesForViewer (height_mm numérico, sem fórmula nenhuma).
        // Passar `parts` aqui faz calculatePiece tentar avaliar uma fórmula
        // que não existe mais, lançar por dentro, cair no catch e devolver
        // legH_mm=0 EM SILÊNCIO — o fix parecia certo no código e não fazia
        // nada na prática. `slot.pieces` é a mesma lista crua que
        // resolvePiecesForViewer usa (ver duas linhas acima).
        //
        // PÉ CONTADO DUAS VEZES (14/10, Matt: "os internos não estão marcando
        // direito quando entra"). drilling.js buildBoxes passou a tratar o pé
        // SOZINHO (legHeightMm: desconta do H e sobe o corpo — ver
        // drilling.js) e este trecho continuava fazendo o mesmo por fora: H
        // menos o pé DUAS vezes e +pé DUAS vezes. Num base de pé plástico
        // 4 1/2" (114mm) as laterais "nasciam" em y=228 e o vão laranja saía
        // 114mm mais baixo e mais em cima do que o desenho. Regra agora: se o
        // pé está em `parts` (nível de cima), buildBoxes recebe o H TOTAL e
        // resolve; só quando ele não enxerga o pé (pé aninhado, só no
        // resolveBodyDims) o ajuste manual de antes entra.
        const peNoTopo = (parts || []).some((p) => p && !p.is_module && p.position_role === 'leg');
        let legH_mm = 0;
        if (!peNoTopo) {
          try { legH_mm = Pricing.resolveBodyDims(slot.pieces || [], { W, H, D }).legH_mm || 0; } catch (e) { /* sem pé, 0 */ }
        }
        const built = Drilling._internals.buildBoxes(parts || [], W, H - legH_mm, D);
        boxes = (built.boxes || []).map((b) => (legH_mm ? Object.assign({}, b, { y0: b.y0 + legH_mm }) : b));
      } catch (e) { boxes = []; }
    }
    return boxes;
  }

  // Caminho de ÚLTIMO RECURSO: medir a CENA.
  //
  // Drilling.pieceBox só conhece um punhado de position_role (left, right,
  // top, bottom, countertop, back, baseboard, shelf, free) e devolve null pro
  // resto — módulo cadastrado com um papel fora dessa lista não gera caixa
  // nenhuma, e a zona interna virava o módulo inteiro em silêncio.
  //
  // O 3D, por outro lado, desenha TODAS as peças. Então quando não sobrou
  // nada, monta o mesmo assembly do viewer e mede a caixa de cada malha —
  // é literalmente "onde a peça está desenhada", sem depender de cadastro.
  //
  // Só aqui porque é caro (cria geometria) e isto roda também durante o
  // arraste de medida. O assembly é descartado no fim.
  return measureProjectSlotBoxesFrom3D(parts, W, H, D);
}

// Converte a cena do módulo em caixas no MESMO formato que Drilling devolve
// (x0/y0/z0 + sx/sy/sz em mm, canto chão-fundo-esquerda). A convenção do group
// é a de renderFreeformWalls: X e Z centrados (-metade..+metade), Y do chão
// pro topo.
function measureProjectSlotBoxesFrom3D(parts, W, H, D) {
  if (typeof THREE === 'undefined' || typeof Viewer3D === 'undefined'
    || !Viewer3D.buildStandaloneAssembly) return [];
  let asm = null;
  try {
    asm = Viewer3D.buildStandaloneAssembly(parts || [], W, H, D, { doors: false, drawers: false });
    if (!asm || !asm.group) return [];
    asm.group.updateMatrixWorld(true);
    const caixas = [];
    const b = new THREE.Box3();
    asm.group.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      b.setFromObject(o);
      if (b.isEmpty()) return;
      caixas.push({
        // role fica NULO de propósito: quem classifica é a geometria
        // (classifyProjectCascoBox), que é justamente o que sobra quando o
        // cadastro não ajudou.
        role: null,
        x0: (b.min.x + W / 2000) * 1000, sx: (b.max.x - b.min.x) * 1000,
        y0: b.min.y * 1000, sy: (b.max.y - b.min.y) * 1000,
        z0: (b.min.z + D / 2000) * 1000, sz: (b.max.z - b.min.z) * 1000
      });
    });
    return caixas;
  } catch (e) {
    return [];
  } finally {
    // Sem dispose a cada abertura do construtor a memória de GPU vaza.
    try {
      if (asm && asm.group && typeof Viewer3D.disposeAssembly === 'function') Viewer3D.disposeAssembly(asm);
      else if (asm && asm.group) asm.group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m && m.dispose && m.dispose());
      });
    } catch (e) { /* ok */ }
  }
}

// ==========================================================================
// CATÁLOGO — as mesmas 3 tabelas da migration 085 que o ERP lê
// ==========================================================================
// Devolve { cat, white, root }:
//   cat   agregados no formato que o LayoutEngine entende (keyed pelo uuid do
//         accessory_type, que é o que fica gravado no nó da árvore — assim
//         serializar/desserializar não precisa de tradução nenhuma no meio);
//   white module_accessory_options deste módulo (o vão mínimo por módulo);
//   root  a árvore de FÁBRICA (module_layout_nodes), ou null.
//
// A WHITELIST É OPCIONAL AQUI, e essa é a única diferença de comportamento
// pro ERP. Regra: módulo COM whitelist mostra só o que está permitido e
// visível pro cliente (é pra isso que ela existe); módulo SEM NENHUMA linha
// de whitelist mostra o catálogo inteiro, filtrado pelo vão mínimo. Sem essa
// saída, a tela nasce vazia em todo módulo que ainda não passou pela
// engenharia — que é o estado de hoje, e foi o que apareceu na tela: "nenhuma
// peça liberada para este módulo". Cadastrar a whitelist volta a apertar o
// filtro, sem mexer aqui.
async function loadProjectBuilderCatalog(moduleId) {
  const [tipos, opcoes, nos] = await Promise.all([
    // select('*') de propósito (mesmo motivo do ERP): accessory_types ganhou
    // coluna em migration posterior, e pedir coluna que não existe derruba a
    // consulta inteira.
    supabaseClient.from('accessory_types')
      .select('*, components(*, labor_types(*), component_types(*))')
      .order('group_name').order('sort_order').order('name'),
    supabaseClient.from('module_accessory_options').select('*').eq('module_id', moduleId),
    supabaseClient.from('module_layout_nodes').select('*').eq('module_id', moduleId).order('sort_order')
  ]);
  if (tipos.error) throw tipos.error;

  const white = {};
  (opcoes.data || []).forEach((o) => { white[o.accessory_type_id] = o; });

  // A WHITELIST SÓ BLOQUEIA — ela não é mais uma lista de "os únicos
  // permitidos" (2026-08-13). Antes, um módulo com QUALQUER linha em
  // module_accessory_options passava a mostrar só o que estava marcado ali, e
  // agregado novo (gaveta, cabide, prateleira inclinada cadastrados depois)
  // simplesmente não aparecia em módulo nenhum já configurado — sem nada na
  // tela explicando por quê.
  //
  // Regra nova: some quem tem linha DIZENDO que não pode (allowed=false ou
  // client_visible=false). Sem linha = aparece, filtrado pelo vão mínimo do
  // catálogo. Bloquear passa a ser um ato explícito da engenharia, que é o que
  // o desmarcar na tela do ERP já significa.
  const ativos = (tipos.data || []).filter((a) => {
    if (a.active === false) return false;
    const o = white[a.id];
    if (o && (o.allowed === false || o.client_visible === false)) return false;
    return true;
  });

  // MÓDULO INTEIRO como agregado (accessory_types.child_module_id, migration
  // 103) — 2026-08-18, Matt: "coloquei ela lá mas ela não entra com as
  // peças" (a "Drawer Soft Closet Externa"). A causa: este catálogo só
  // guardava o PONTEIRO (child_module_id) e nunca buscava as peças REAIS do
  // módulo filho — LayoutEngine.toPieceRows monta a linha is_module:true com
  // child_pieces=[] (nada dentro), então o vão aparece "ocupado" sem
  // NENHUMA peça no 3D/preço/furação. Mesmo shape que
  // loadRecursivePiecesForModule (module-pieces.js) monta pro branch
  // child_module_id de module_components — dedupe por módulo porque mais de
  // um agregado pode apontar pro mesmo.
  const moduleExtras = await loadAccessoryModuleExtras(ativos);

  const cat = {};
  ativos.forEach((a) => {
    cat[a.id] = projectBuilderAccessoryEntry(a, a.child_module_id ? moduleExtras[a.child_module_id] : null);
  });
  return { cat, white, root: projectBuilderTreeFromRows(nos.data || []) };
}

// Extras dos agregados que são MÓDULO INTEIRO (child_module_id): peças
// reais, profundidades fixas, presets travados e corrediça/dobradiça
// própria. Dedupe por módulo (mais de um agregado aponta pro mesmo, ex.
// Drawer / Gaveta Interna com e sem porta). Compartilhado entre a janela do
// Construtor e ensureAccessoryCatalog (ver lá o porquê, 2026-10-12).
async function loadAccessoryModuleExtras(accessoryRows) {
  const moduleExtras = {};
  const moduleIds = Array.from(new Set(
    (accessoryRows || []).filter((a) => a && a.child_module_id).map((a) => a.child_module_id)
  ));
  await Promise.all(moduleIds.map(async (mid) => {
    try {
      const [fixedDepths, childPieces, lockedPresets, ownHingeSlide] = await Promise.all([
        fetchModuleFixedDepths(mid),
        loadRecursivePiecesForModule(mid),
        fetchModuleLockedDimensionPresets(mid),
        fetchModuleOwnHingeAndSlideModels(mid)
      ]);
      moduleExtras[mid] = {
        // module_meta = "a linha de modules" (comentário do layout-engine.js);
        // só o name importa lá (fallback de reference) — lockedPresets já fez
        // a consulta em modules, reaproveita em vez de buscar de novo.
        module_meta: { name: lockedPresets.name },
        fixed_depths: fixedDepths,
        locked_presets: lockedPresets,
        own_hinge_slide: ownHingeSlide,
        child_pieces: childPieces
      };
    } catch (e) {
      console.error('[construtor] extras do módulo ' + mid, e);
    }
  }));
  return moduleExtras;
}

// Linha de accessory_types -> entrada do catálogo do motor. Espelha
// CONSTR.catalogoDoBanco (erp/js/data-construtor.js) — se um dia um campo
// novo entrar lá, entra aqui também.
//
// moduleExtra (só quando a.child_module_id existe) = { module_meta,
// fixed_depths, locked_presets, own_hinge_slide, child_pieces } — buscado em
// loadProjectBuilderCatalog (precisa de await, por isso não é buscado aqui
// dentro, que é síncrona). Ver LayoutEngine.toPieceRows (js/layout-engine.js)
// pro formato exato que cada campo precisa ter.
// GRUPO DE TELA (14/10, Matt: "base divisória e lateral divisória pode
// deixar lado a lado lá em cima. pode colocar o gola nessa divisão. como
// dividers. restante mantém"). Só muda ONDE o card aparece na biblioteca —
// `group_name` cru continua indo pro motor (layout-engine decide coisas por
// ele). O grupo "Divisórias" é sempre o 1º da lista (ver
// fillProjectBuilderLibGrid); o texto sai do i18n (builder_grp.divisorias).
const PROJECT_BUILDER_GRUPO_DIVISORIAS = 'Divisórias';
// Painel Fixo (24/10, Matt: "deve ficar em front, não door") — no cadastro
// ele é cópia da frente de gaveta, grupo 'Portas'. Só a TELA muda.
const PROJECT_BUILDER_GRUPO_FRENTES = 'Frentes';
function projectBuilderGrupoTela(a) {
  const slug = String(a.slug || '').toLowerCase();
  const n = projLibNorm(a.name);
  if (slug === 'painel_fixo' || /^painel fixo/.test(n)) return PROJECT_BUILDER_GRUPO_FRENTES;
  if (slug === 'div_vert' || /^base divis|^lateral divis|^gola/.test(n)) return PROJECT_BUILDER_GRUPO_DIVISORIAS;
  return a.group_name || I18n.t('builder.group_other');
}

function projectBuilderAccessoryEntry(a, moduleExtra) {
  const p = a.default_params || {};
  // 'forma' escolhe o desenho do conteúdo no resolvedor e NÃO é campo do
  // banco: cabide se identifica pelo shape_type (migration 062), painel
  // ripado pelo passo das ripas nos parâmetros.
  let forma = null;
  if (a.shape_type === 'oval_rod') forma = 'barra';
  else if (p.passo_mm != null) forma = 'ripas';
  const esp = parseFloat(a.thickness_formula);
  // 'E' (migration 161) = "segue a espessura da chapa do casco": entra como
  // null e LayoutEngine.build usa opts.espessuraCasco (a cor do módulo —
  // plywood 18, MDF 19.5). Número ('15') continua fixo. Ver
  // projectBuilderEspessuraCasco.
  const segueCasco = /^\s*E\s*$/i.test(String(a.thickness_formula || ''));
  return {
    id: a.id,
    name: a.name,
    // slug: é por ele que o ícone é escolhido (os 13 da migration 087).
    slug: a.slug || null,
    group: projectBuilderGrupoTela(a),
    // group_name CRU (2026-08-20, bug do Matt: "a gaveta entra sem a
    // frente"): layout-engine.js/emitContent decide se sintetiza a frente
    // automática de gaveta olhando `acc.group_name === 'Gavetas'` (ver
    // frente_de_gaveta_agregada na memória) — mas esta função só expunha
    // `group` (já traduzido/com fallback pro chip de UI, nunca 'Gavetas'
    // sozinho quando I18n troca o texto). O motor recebia group_name
    // undefined pra QUALQUER acessório vindo deste catálogo — a condição
    // nunca batia, a gaveta entrava sem frente nenhuma. `group` continua
    // aqui do jeito que estava (é o que os chips/filtro da biblioteca leem,
    // linhas ~1215/1236/1238/1259) — isto só ACRESCENTA o valor cru pro
    // motor, sem mexer no que a UI já usa.
    group_name: a.group_name || null,
    icon: a.icon || null,
    role: a.role,
    axis: a.split_axis || null,
    espessura: segueCasco ? null : (isFinite(esp) && esp > 0 ? esp : PROJECT_BUILDER_ESPESSURA),
    params: p,
    forma: forma,
    folhas: Number(p.folhas) === 2 ? 2 : 1,
    shape_type: a.shape_type || null,
    color_role_id: a.color_role_id || null,
    // MODELO de abertura de porta (migration 132, 2026-08-20) — é isto que
    // LayoutEngine.emitFrontsResolvidos lê pra decidir a matemática externa/
    // interna e a dobra automática de folhas. Faltou aqui na 1ª entrega:
    // a linha vinha certa do banco (select('*')) mas o catálogo em memória
    // nunca copiava os 2 campos pra fora — toda porta caía no ramo "sem
    // door_position" (comportamento antigo, sem folga nenhuma), porque
    // era exatamente o que faltava.
    door_mechanism: a.door_mechanism || null,
    door_position: a.door_position || null,
    // Programa de furação POR USO (migration 125) — espelha
    // CONSTR.catalogoDoBanco (erp/js/data-construtor.js), mesmo campo.
    drilling_pattern_id: a.drilling_pattern_id || null,
    // Suporte de prateleira por uso (migration 162) — null herda do componente.
    drill_shelf_support: a.drill_shelf_support != null ? !!a.drill_shelf_support : null,
    // Prateleira regulável (migration 204) — sem furo próprio, linha de
    // furos no vão e kit de pinos (support_purchased_item_*). Ver layout-engine toPieceRows.
    prateleira_regulavel: !!a.prateleira_regulavel,
    support_purchased_item_id: a.support_purchased_item_id || null,
    support_purchased_item_qty: a.support_purchased_item_qty != null ? Number(a.support_purchased_item_qty) : null,
    // Variante POR PROFUNDIDADE (migration 126) — espelha
    // CONSTR.catalogoDoBanco, mesmos dois campos. Consumido por
    // LayoutEngine.resolveDepthVariant (js/layout-engine.js): troca sozinho
    // pra outro agregado da mesma família (mesmo child_module_id na
    // prática — módulo-corpo com a corrediça certa já embutida) batendo a
    // profundidade real do vão contra a faixa cadastrada. NULL nos dois =
    // comportamento de sempre, nada muda.
    depth_bracket_min_mm: a.depth_bracket_min_mm != null ? Number(a.depth_bracket_min_mm) : null,
    depth_bracket_max_mm: a.depth_bracket_max_mm != null ? Number(a.depth_bracket_max_mm) : null,
    depth_variant_of: a.depth_variant_of || null,
    componente: a.components || null,
    child_module_id: a.child_module_id || null,
    module_meta: (moduleExtra && moduleExtra.module_meta) || null,
    fixed_depths: (moduleExtra && moduleExtra.fixed_depths) || [],
    locked_presets: (moduleExtra && moduleExtra.locked_presets) || {},
    own_hinge_slide: (moduleExtra && moduleExtra.own_hinge_slide) || {},
    child_pieces: (moduleExtra && moduleExtra.child_pieces) || [],
    minW: Number(a.min_void_w_mm) || 0,
    minH: Number(a.min_void_h_mm) || 0,
    minD: Number(a.min_void_d_mm) || 0
  };
}

// ==========================================================================
// INTERIOR DE FÁBRICA DA LINHA NEW CLASSIC (2026-10-18)
// ==========================================================================
// Matt: os módulos padrão (família NEW Classic Kitchens) entram JÁ MONTADOS
// com portas, gavetas e prateleiras REGULÁVEIS — feitos com as MESMAS peças
// do Construtor ("pra facilitar a manutenção"), sem o cliente precisar abrir
// o Construtor. O interior é a árvore de fábrica do módulo
// (module_layout_nodes), a mesma que o Construtor de Módulos do ERP grava.
//
// Por que não religa o carregamento geral desligado em 14/10 ("nunca
// carregar interior de fábrica" — vinham restos de teste de agosto): só
// entra árvore cuja RAIZ tem params.fabrica === true. Essa marca só existe
// nas árvores novas da NEW Classic; as antigas continuam ignoradas.
const projectFactoryLayoutCache = {};
async function loadProjectFactoryLayout(moduleId) {
  if (!moduleId) return null;
  if (!(moduleId in projectFactoryLayoutCache)) {
    let val = null;
    try {
      const { data, error } = await supabaseClient.from('module_layout_nodes')
        .select('*').eq('module_id', moduleId).order('sort_order');
      if (!error && data && data.length) {
        const raiz = projectBuilderTreeFromRows(data);
        if (raiz && raiz.params && raiz.params.fabrica === true) val = LayoutEngine.serialize(raiz);
      }
    } catch (e) { val = null; }
    projectFactoryLayoutCache[moduleId] = val;
  }
  const v = projectFactoryLayoutCache[moduleId];
  return v ? JSON.parse(JSON.stringify(v)) : null;
}
// Pendura o interior de fábrica no slot (se o módulo tiver) e reprecifica —
// daqui pra frente é um slot com layout igual a qualquer um montado no
// Construtor: 3D, preço, plano de corte, .ban e pedido seguem o caminho de
// sempre. Devolve true se aplicou.
async function applyProjectFactoryLayout(slot) {
  if (!slot || !slot.module) return false;
  const lay = await loadProjectFactoryLayout(slot.module.id);
  if (!lay) return false;
  await ensureAccessoryCatalog();
  slot.layout = lay;
  // TRAVESSA DA FRENTE EM PÉ de fábrica (sinks — migration 237: raiz da
  // árvore com params.stretcher_frente_em_pe). Vira o mesmo ajuste do botão
  // "Em pé" do painel (setSlotFrontStretcherEmPe, portal-06c).
  if (lay.params && lay.params.stretcher_frente_em_pe && typeof setSlotFrontStretcherEmPe === 'function') {
    try { setSlotFrontStretcherEmPe(slot, true); } catch (e) { /* segue deitada */ }
  }
  if (typeof projectEnforceStretcherRule === 'function') { try { projectEnforceStretcherRule(slot); } catch (e) { /* segue */ } }
  // SEM TRAVESSA DA FRENTE de fábrica (Farm Sink — migration 239, Matt 25/10:
  // "nesse módulo não tem travessa na frente, porque a pia fica bem em cima
  // dela"). Mesmo caminho do "remover peça" do cliente (removedPieceIds):
  // some do 3D, do preço, do pedido e do ERP.
  if (lay.params && lay.params.sem_travessa_frente && typeof projectFrontStretcherPiece === 'function') {
    try {
      const p = projectFrontStretcherPiece(slot);
      if (p) {
        const ids = (slot.removedPieceIds || []).slice();
        if (!ids.includes(p.id)) ids.push(p.id);
        slot.removedPieceIds = ids;
      }
    } catch (e) { /* segue com a travessa */ }
  }
  try { recomputeProjectSlotPricing(slot); } catch (e) { /* preço anterior fica */ }
  // MODELO DE PORTA DE FÁBRICA (2026-10-18, Matt: os Glass Door "já entram
  // com porta de vidro selecionada"). root.params.modelo_porta_slug na
  // árvore = o mesmo clique no cartão do modelo (setProjectSlotDoorModel);
  // o cliente ainda pode trocar depois. Sem o param: Flat, como sempre.
  const slugModelo = lay.params && lay.params.modelo_porta_slug;
  if (slugModelo && typeof setProjectSlotDoorModel === 'function') {
    try {
      await ensureProjectDoorModels();
      const dm = (projectDoorModelsCache || []).find((x) => x.slug === slugModelo);
      if (dm) await setProjectSlotDoorModel(slot, dm.id, { lote: true });
    } catch (e) { console.warn('[interior de fábrica] modelo de porta', e); }
  }
  return true;
}

// Linhas de module_layout_nodes -> raiz montada. Espelha CONSTR.loadArvore +
// CONSTR.nodeFromRow, inclusive o detalhe das FRENTES: a coluna é singular
// (front_accessory_id) mas o motor aceita várias por vão, e a lista completa
// mora em params.fronts.
function projectBuilderTreeFromRows(rows) {
  if (!rows.length) return null;
  const porId = {};
  rows.forEach((r) => {
    const params = Object.assign({}, r.params || {});
    const fronts = params.fronts;
    const contentParams = params.content;
    delete params.fronts;
    delete params.content;
    porId[r.id] = {
      id: r.id,
      children: [],
      splitAxis: r.split_axis || null,
      splitAcc: r.split_accessory_id || null,
      sizeMode: r.size_mode === 'fixed' ? 'fixed' : 'fill',
      sizeValue: r.size_value == null ? null : Number(r.size_value),
      content: r.content_accessory_id ? { acc: r.content_accessory_id, params: contentParams || {} } : null,
      fronts: Array.isArray(fronts) && fronts.length
        ? fronts
        : (r.front_accessory_id ? [{ acc: r.front_accessory_id, params: {}, from: null, to: null }] : []),
      params: params,
      // 'locked' é da engenharia: no portal ele não some da tela, mas o vão
      // travado não aceita alteração (ver insertProjectBuilderItem).
      locked: !!r.locked
    };
  });
  let raiz = null;
  rows.forEach((r) => {
    if (!r.parent_id) { raiz = porId[r.id]; return; }
    const pai = porId[r.parent_id];
    if (pai) pai.children.push(porId[r.id]);
  });
  return raiz;
}

// ==========================================================================
// ÍCONES — desenho, não caractere
// ==========================================================================
// Antes eram caracteres soltos (▤ ▥ ▦ ▯ ⌒): dependem da fonte do sistema,
// desalinham entre si e não dizem o que a peça é ("preciso um ícone bonitinho
// de cada peça" — Matt, 2026-08-13). São SVGs de 22×22 em currentColor, então
// herdam a cor do card (inclusive no hover) sem CSS extra.
//
// A escolha é por SLUG (os 13 da migration 087), com dois fallbacks pra
// aguentar agregado cadastrado à mão no ERP, que tem slug qualquer: palavra no
// NOME e, por último, o encaixe (split em x/y, content, front). Nunca fica sem
// ícone.
// REDESENHO (14/10, Matt: "os desenhos estão meio confusos, uns bem em
// baixo outros acima... melhorar a posição e organização, imagem mais
// clara"). Antes: traço único, sem distinguir o armário da peça, e peças
// diferentes com o MESMO desenho (Base Divisória = Gola = Prateleira: uma
// linha no meio). Agora todo ícone é o MESMO armário (contorno claro, 48×48)
// com a peça destacada (traço cheio + preenchimento leve) NA POSIÇÃO REAL
// dela: base embaixo, cabide no alto, frente sobreposta passa do contorno,
// frente embutida fica dentro, basculante mostra pra onde abre.
const PROJECT_BUILDER_SVG = (() => {
  const abre = '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">';
  const fecha = '</svg>';
  const armario = '<rect x="8" y="5" width="32" height="38" rx="1.5" stroke-width="1.5" opacity=".38"/>';
  const peca = (x, y, w, h, extra) => '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="0.8" fill="currentColor" fill-opacity=".16"' + (extra || '') + '/>';
  const tracejada = (x, y, w, h) => '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="0.8" stroke-dasharray="3 2.2" fill="currentColor" fill-opacity=".08"/>';
  const puxH = (x, y) => '<path d="M' + x + ' ' + y + 'h8" stroke-width="2.4"/>';
  const puxV = (x, y) => '<path d="M' + x + ' ' + y + 'v8" stroke-width="2.4"/>';
  const mk = (miolo, semArmario) => abre + (semArmario ? '' : armario) + miolo + fecha;
  // porta sobreposta (passa 2 do contorno)
  const portaExt = peca(6, 3, 36, 42, ' fill-opacity=".1"');
  return {
    prateleira: mk(peca(9.5, 22.5, 29, 3.2)),
    prat_movel: mk(peca(9.5, 22.5, 29, 3.2) + '<circle cx="12" cy="27.6" r="1.1" fill="currentColor" stroke="none"/><circle cx="36" cy="27.6" r="1.1" fill="currentColor" stroke="none"/>'),
    prateleiras2: mk(peca(9.5, 16, 29, 3) + peca(9.5, 29, 29, 3)),
    inclinada: mk('<path d="M9.5 32L38.5 22.5v3.2L9.5 35.2z" fill="currentColor" fill-opacity=".16"/><path d="M9.5 32v-3.4" stroke-width="2.2"/>'),
    // Base divisória: painel GROSSO dividindo o armário em cima/embaixo —
    // o espaço de baixo levemente sombreado diz "isto vira outro vão".
    base: mk('<rect x="9.5" y="30.5" width="29" height="11.5" fill="currentColor" fill-opacity=".06" stroke="none"/>' + peca(9.5, 26.5, 29, 4.4)),
    divisoria: mk(peca(22.4, 6.5, 3.2, 35)),
    // Divisória Stretcher (24/10, Matt: "esse ícone tem que ser horizontal"):
    // travessa DEITADA de lateral a lateral, separando a gaveta de cima do
    // vão de baixo (a vertical do blind corner continua com o desenho em pé).
    stretcher: mk(peca(9.5, 17, 29, 3) + '<rect x="9.5" y="20" width="29" height="22" fill="currentColor" fill-opacity=".05" stroke="none"/>'),
    // Gola: canal de pegada horizontal (perfil J) no meio da frente.
    gola: mk(peca(9.5, 20.5, 29, 7, ' fill-opacity=".3"') + '<path d="M11 24h26" stroke-width="1.2" opacity=".7"/>'),
    gaveta: mk(peca(11, 25.5, 26, 15) + puxH(20, 33)),
    gaveteiro: mk(peca(10, 7, 28, 10.5) + peca(10, 19, 28, 10.5) + peca(10, 31, 28, 10.5)
      + puxH(20, 12.2) + puxH(20, 24.2) + puxH(20, 36.2)),
    gav_int: mk(tracejada(11, 26, 26, 14.5) + '<path d="M20 30h8" stroke-width="2" opacity=".8"/>'),
    gav_int_porta: mk(tracejada(11, 26, 26, 14.5) + portaExt + puxV(36, 10)),
    frente_ext: mk(peca(6, 27, 36, 17) + puxH(20, 35.5)),
    frente_int: mk(peca(10, 28, 28, 13.5) + puxH(20, 34.7)),
    porta: mk(portaExt + puxV(36, 20) + '<path d="M7.5 10h3M7.5 38h3" stroke-width="2.2"/>'),
    // Painel Fixo (24/10): frente que não abre — sem puxador, sem dobradiça.
    painel: mk(portaExt),
    porta_int: mk(peca(10, 7, 28, 34) + puxV(34, 20)),
    porta_dupla: mk(peca(6, 3, 17.6, 42, ' fill-opacity=".1"') + peca(24.4, 3, 17.6, 42, ' fill-opacity=".1"') + puxV(20.5, 20) + puxV(27.5, 20)),
    // Basculante: dobradiça EM CIMA, seta mostrando que abre pra cima.
    basculante: mk(peca(6, 8, 36, 30, ' fill-opacity=".1"') + '<path d="M10 8h4M34 8h4" stroke-width="2.6"/>' + puxH(20, 33)
      + '<path d="M44 34c2-9 0-17-6-24" stroke-width="1.6"/><path d="M37.5 13.5L38 10l3.4 1" stroke-width="1.6"/>'),
    // Basculante inverso: dobradiça EMBAIXO, abre pra baixo.
    basc_inv: mk(peca(6, 10, 36, 30, ' fill-opacity=".1"') + '<path d="M10 40h4M34 40h4" stroke-width="2.6"/>' + puxH(20, 15)
      + '<path d="M44 14c2 9 0 17-6 24" stroke-width="1.6"/><path d="M37.5 34.5L38 38l3.4-1" stroke-width="1.6"/>'),
    filler: mk(peca(9.5, 6.5, 6, 35, ' fill-opacity=".35"') + '<path d="M18 9v30" stroke-width="1.2" stroke-dasharray="2.5 2" opacity=".6"/>'),
    cabide: mk('<path d="M10 12.5h28" stroke-width="2.8"/><path d="M10 10v5M38 10v5" stroke-width="1.6"/>'
      + '<path d="M24 12.5v2.2"/><path d="M15.5 23L24 15.5L32.5 23z" fill="currentColor" fill-opacity=".16"/>'),
    cesto: mk('<path d="M11 27h26l-2 13H13z" fill="currentColor" fill-opacity=".16"/><path d="M17 27.5l.6 12M24 27.5v12M31 27.5l-.6 12M12 33.5h24" stroke-width="1.2"/>'),
    ripado: mk(peca(11, 6.5, 3, 35) + peca(17.5, 6.5, 3, 35) + peca(24, 6.5, 3, 35) + peca(30.5, 6.5, 3, 35)),
    generico: mk('<path d="M24 18v12M18 24h12" stroke-width="2"/>')
  };
})();

function projectBuilderIcon(acc) {
  const S = PROJECT_BUILDER_SVG;
  const slug = String(acc.slug || '').toLowerCase();
  const porSlug = {
    div_vert: S.divisoria, prat_fixa: S.prateleira, prat_movel: S.prat_movel, prat_regulavel: S.prat_movel,
    prat_inclinada: S.inclinada, gaveta: S.gaveta, gaveta_afast: S.gaveta,
    gaveteiro: S.gaveteiro, porta_ext: S.porta, porta_int: S.porta_int,
    porta_dupla: S.porta_dupla, cabide: S.cabide, cesto: S.cesto, ripado: S.ripado,
    frente_gaveta_externa: S.frente_ext, frente_gaveta_interna: S.frente_int,
    porta_giro_externa: S.porta, porta_giro_interna: S.porta_int,
    basculante: S.basculante, basculante_inverso: S.basc_inv,
    gaveta_interna_sem_porta: S.gav_int, gaveta_interna_com_porta: S.gav_int_porta,
    _filler_lateral_porta: S.filler,
    divisoria_stretcher: S.stretcher, divisoria_stretcher_vertical: S.divisoria,
    painel_fixo: S.painel
  };
  if (porSlug[slug]) return porSlug[slug];

  // Agregado sem slug (cadastrado à mão no ERP): pelo NOME — ordem importa
  // (o mais específico primeiro).
  const n = projLibNorm(acc.name);
  if (/basculante.*invers/.test(n)) return S.basc_inv;
  if (/basculante/.test(n)) return S.basculante;
  if (/frente.*gaveta.*extern/.test(n)) return S.frente_ext;
  if (/frente.*gaveta/.test(n)) return S.frente_int;
  if (/gaveta interna.*com porta/.test(n)) return S.gav_int_porta;
  if (/gaveta interna/.test(n)) return S.gav_int;
  if (/filler/.test(n)) return S.filler;
  if (/gola/.test(n)) return S.gola;
  if (/inclinad|sapateir/.test(n)) return S.inclinada;
  if (/gaveteiro/.test(n)) return S.gaveteiro;
  if (/gaveta|drawer/.test(n)) return S.gaveta;
  if (/cabide|tubo|vara|rod/.test(n)) return S.cabide;
  if (/cesto|aramad/.test(n)) return S.cesto;
  if (/ripad|ripa/.test(n)) return S.ripado;
  if (/dupla|2 folhas|duas folhas/.test(n)) return S.porta_dupla;
  if (/porta intern|embutid/.test(n)) return S.porta_int;
  if (/painel fixo/.test(n)) return S.painel;
  if (/stretcher.*vertic/.test(n)) return S.divisoria;
  if (/stretcher/.test(n)) return S.stretcher;
  if (/porta|door/.test(n)) return S.porta;
  if (/^base|base divis/.test(n)) return S.base;
  if (/divis|lateral/.test(n)) return S.divisoria;
  if (/pratele|shelf/.test(n)) return S.prateleira;

  if (acc.role === 'front') return S.porta;
  if (acc.role === 'split') return acc.axis === 'x' ? S.divisoria : S.prateleira;
  if (acc.role === 'content') return S.gaveta;
  return S.generico;
}

// TRADUÇÃO DOS COMPONENTES (14/10, Matt: "os componentes estão sem tradução
// nas 3 línguas"). Nome e grupo vêm do cadastro (accessory_types), em
// português/misturado. A tela mostra a tradução do dicionário (i18n.js,
// builder_acc.* / builder_grp.*), chaveada pelo SLUG — ou, sem slug, pelo
// nome normalizado ("Gola (meio)" → gola_meio). Sem tradução cadastrada,
// mostra o nome do banco (nunca a chave). SÓ EXIBIÇÃO: o motor continua
// recebendo acc.name/group_name crus (o layout-engine decide coisas por eles,
// ver o comentário de group_name em projectBuilderAccessoryEntry).
function projectBuilderI18nKey(txt) {
  return projLibNorm(txt).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}
function projectBuilderAccLabel(acc) {
  if (!acc) return '';
  const tenta = [];
  if (acc.slug) tenta.push('builder_acc.' + String(acc.slug).toLowerCase());
  tenta.push('builder_acc.' + projectBuilderI18nKey(acc.name));
  for (const k of tenta) { const t = I18n.t(k); if (t !== k) return t; }
  return acc.name || '';
}
function projectBuilderGroupLabel(g) {
  if (!g) return g;
  const k = 'builder_grp.' + projectBuilderI18nKey(g);
  const t = I18n.t(k);
  return t === k ? g : t;
}

// Quantidade só faz sentido onde ela vira VÃOS IGUAIS (divisão) ou peças
// empilhadas (caixote: gaveta, gaveteiro, cesto — inclui agregado com
// child_module_id, tipo "Drawer Soft Closet Externa"). Porta não tem
// quantidade — quem faz porta de duas folhas é o agregado "Porta dupla"
// (default_params.folhas), não um número aqui.
// Até 10 (2026-08-15, Matt: "no construtor agregar opção de prateleiras (até
// 10)"). Eram 5 — pouco pra uma torre de prateleiras, que é o caso normal
// num módulo alto.
const PROJECT_BUILDER_QTDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
// 2026-08-18, Matt: "quero colocar mais de uma gaveta no construtor,
// acrescentar o botao quantidade assim como os outros componentes". A régua
// − N + já funcionava genérico pra QUALQUER acessório 'content' empilhável —
// emitContent (layout-engine.js) trata gaveta/gaveteiro/cesto/Drawer-agregado
// no MESMO branch "caixote" (só barra=cabide e ripas=ripado saem fora, cada
// um com sua própria repetição). O que faltava não era o motor, era esta
// função só liberar o stepper quando o cadastro JÁ tinha `quantidade` escrito
// no default_params — e "Drawer Soft Closet Externa" nunca teve, porque
// ninguém pensou em empilhar duas quando ele foi cadastrado. Trocado pra
// checar a FORMA (o mesmo campo que emitContent usa pra decidir o branch, não
// mais a presença do campo quantidade), então todo caixote ganha o stepper
// de saída, sem precisar editar cadastro nenhum.
function projectBuilderAceitaQtd(acc) {
  if (!acc) return false;
  if (acc.role === 'split') return true;
  return acc.role === 'content' && acc.forma !== 'barra' && acc.forma !== 'ripas';
}

function projectBuilderSelNode() {
  if (!projectBuilderRoot) return null;
  return LayoutEngine.findNode(projectBuilderRoot, projectBuilderSelId) || projectBuilderRoot;
}

// Faixa pintada (2+ vãos arrastados, ver projectBuilderSelIds) traduzida pra
// {pai, kids, de, ate} — de/ate são índices em kids, o mesmo par que
// LayoutEngine.applyFront(pai, acc, de, ate, cat) espera. Extraído aqui
// (2026-08-20) porque ANTES só existia dentro de insertProjectBuilderItem
// (o momento de aplicar a peça) — projectBuilderSelBox (o momento de decidir
// o que MOSTRAR na biblioteca) não sabia nada da faixa e usava só o
// vão-âncora. Ver o comentário em projectBuilderSelBox.
function projectBuilderFaixaAtual() {
  if (projectBuilderSelIds.length <= 1) return null;
  const faixa = projectBuilderIrmaos(projectBuilderSelIds[0]);
  if (!faixa) return null;
  const idx = projectBuilderSelIds
    .map((id) => faixa.kids.findIndex((k) => k.id === id))
    .filter((i) => i >= 0);
  if (!idx.length) return null;
  return { pai: faixa.pai, kids: faixa.kids, de: Math.min(...idx), ate: Math.max(...idx) };
}

function projectBuilderSelBox() {
  // Faixa pintada (2026-08-20, Matt: "quando tenho que colocar varias
  // prateleiras e uma porta cobrindo todas elas, gostaria de clicar e
  // arrastar o mouse nos vaos que quero aplicar a porta... essa funcao nao
  // existe hoje"). A função JÁ EXISTIA (arraste, seleção, applyFront com
  // from/to) — o que faltava era isto aqui: o filtro "o que cabe" (biblioteca
  // de componentes) olhava só o vão-ÂNCORA (onde o arraste começou), não a
  // faixa inteira. Numa pilha de prateleiras pequenas (ex.: vão de 35mm),
  // isso fazia TODA porta sumir da lista por "não caber" — mesmo a faixa
  // inteira, coberta pelos 3+ vãos juntos, sendo bem maior. Union box dos
  // _boxFull dos vãos cobertos: é a MESMA conta que
  // LayoutEngine.emitFrontsResolvidos faz pra achar a caixa de um front com
  // from/to (bounding box dos filhos, ver layout-engine.js) — sem isso o
  // filtro e o resultado real podiam discordar sobre o que cabe.
  const faixa = projectBuilderFaixaAtual();
  if (faixa) {
    const boxes = faixa.kids.slice(faixa.de, faixa.ate + 1)
      .map((k) => k._boxFull).filter(Boolean);
    if (boxes.length === (faixa.ate - faixa.de + 1)) {
      const x0 = Math.min(...boxes.map((b) => b.x));
      const y0 = Math.min(...boxes.map((b) => b.y));
      const x1 = Math.max(...boxes.map((b) => b.x + b.w));
      const y1 = Math.max(...boxes.map((b) => b.y + b.h));
      return { x: x0, y: y0, z: boxes[0].z, w: x1 - x0, h: y1 - y0, d: Math.max(...boxes.map((b) => b.d)) };
    }
  }
  const n = projectBuilderSelNode();
  return (n && (n._box || n._boxFull)) || projectBuilderZone || null;
}

// Biblioteca: só o que CABE no vão selecionado. É esse filtro que faz a tela
// parecer inteligente (spec §4.2) — cabide não aparece em nicho de 200mm, e o
// mínimo efetivo é o MAIOR entre o do catálogo e o do módulo. Quem decide é
// LayoutEngine.cabeNoVao, a mesma função que o ERP usa.
const PROJ_LIB_ICON_SEARCH =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"'
  + ' stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/></svg>';
const PROJ_LIB_ICON_TRASH =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"'
  + ' stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/>'
  + '<path d="M9 7V5h6v2"/><path d="M6 7l1 13h10l1-13"/></svg>';

// Esqueleto do painel: cabeçalho (título, busca, chips) + grid + rodapé.
// Montado UMA VEZ por janela e reaproveitado — se ele fosse refeito junto com
// a lista, o campo de busca perderia o foco a cada letra digitada (o render da
// lista roda a cada tecla) e o filtro seria inutilizável no teclado.
function ensureProjectBuilderLibShell(el) {
  // O esqueleto guarda o IDIOMA em que foi escrito: os textos dele são
  // traduzidos na montagem (não têm data-i18n), então trocar de idioma com a
  // janela fechada deixaria "Componentes" em português numa tela em inglês.
  const lang = (typeof I18n !== 'undefined' && I18n.getLanguage && I18n.getLanguage()) || '';
  if (el.dataset.shell === '1' && el.dataset.shellLang === lang) return;
  el.dataset.shell = '1';
  el.dataset.shellLang = lang;
  el.innerHTML =
    '<div class="po-proj-lib-head">'
    + '<div class="po-proj-lib-title">' + escapeHtmlCutlist(I18n.t('project.builder_lib_title')) + '</div>'
    + '<div class="po-proj-lib-sub">' + escapeHtmlCutlist(I18n.t('project.builder_lib_sub')) + '</div>'
    + '<div class="po-proj-lib-search">'
    + '<input type="text" id="po-proj-lib-search" autocomplete="off" placeholder="'
    + escapeHtmlCutlist(I18n.t('project.builder_search')) + '">'
    + PROJ_LIB_ICON_SEARCH
    + '</div>'
    + '<div class="po-proj-lib-chips" id="po-proj-lib-chips"></div>'
    + '</div>'
    + '<div class="po-proj-lib-grid" id="po-proj-lib-grid"></div>'
    + '<div class="po-proj-lib-foot">'
    + '<span class="po-proj-lib-count" id="po-proj-lib-count"></span>'
    + '<button type="button" class="po-proj-lib-clear" id="po-proj-lib-clear">'
    + PROJ_LIB_ICON_TRASH + '<span>' + escapeHtmlCutlist(I18n.t('project.builder_clear')) + '</span>'
    + '</button>'
    + '</div>';

  const busca = el.querySelector('#po-proj-lib-search');
  if (busca) {
    busca.addEventListener('input', () => {
      projectBuilderLibQuery = busca.value || '';
      fillProjectBuilderLibGrid();   // só o grid: o input continua com o foco
    });
    // A janela fecha no Esc (attachProjectBuilderModal). Dentro da busca o Esc
    // é "limpar o que digitei", não "jogar fora a edição inteira".
    busca.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Escape') return;
      ev.stopPropagation();
      if (!busca.value) return;
      busca.value = '';
      projectBuilderLibQuery = '';
      fillProjectBuilderLibGrid();
    });
  }
  // Chips por delegação: eles são reescritos a cada troca de vão (os grupos
  // disponíveis mudam), então listener no chip viraria listener órfão.
  const chips = el.querySelector('#po-proj-lib-chips');
  if (chips) chips.addEventListener('click', (ev) => {
    const b = ev.target.closest('.po-proj-lib-chip');
    if (!b) return;
    projectBuilderLibGroup = b.dataset.group || '';
    fillProjectBuilderLibGrid();
  });
  const limpar = el.querySelector('#po-proj-lib-clear');
  // MESMA ação do ↺ do cabeçalho — o rodapé é só onde a mão já está.
  if (limpar) limpar.addEventListener('click', resetProjectBuilder);
}

// Biblioteca: só o que CABE no vão selecionado. É esse filtro que faz a tela
// parecer inteligente (spec §4.2) — cabide não aparece em nicho de 200mm, e o
// mínimo efetivo é o MAIOR entre o do catálogo e o do módulo. Quem decide é
// LayoutEngine.cabeNoVao, a mesma função que o ERP usa.
//
// Esta função só cuida do CASO DE ERRO (banco fora, catálogo vazio) e garante
// o esqueleto; a lista em si é a fillProjectBuilderLibGrid.
function renderProjectBuilderLibrary() {
  const el = document.getElementById('po-proj-builder-lib');
  if (!el) return;
  const aviso = (txt) => {
    el.dataset.shell = '';
    el.innerHTML = '<div class="po-proj-lib-head"><div class="po-proj-lib-sub">'
      + escapeHtmlCutlist(txt) + '</div></div>';
  };

  if (projectBuilderLoadError) {
    aviso(I18n.t('project.builder_load_error', {
      msg: (projectBuilderLoadError.message || String(projectBuilderLoadError))
    }));
    return;
  }
  if (!Object.keys(projectBuilderCat).length) { aviso(I18n.t('project.builder_empty_lib')); return; }

  ensureProjectBuilderLibShell(el);
  // Abrir outro módulo zera a busca (ver openProjectModuleBuilder), e o
  // esqueleto é reaproveitado — sem isto a caixa continuaria com o texto
  // antigo escondendo metade do catálogo. Guardado pra não mexer no cursor
  // enquanto a pessoa digita.
  const busca = el.querySelector('#po-proj-lib-search');
  if (busca && busca.value !== projectBuilderLibQuery) busca.value = projectBuilderLibQuery;
  fillProjectBuilderLibGrid();
}

// Normaliza pra busca: sem acento e em minúscula, pra "porta dupla" achar
// "Porta Dupla" e "divisoria" achar "Divisória".
function projLibNorm(txt) {
  return String(txt || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function fillProjectBuilderLibGrid() {
  const grid = document.getElementById('po-proj-lib-grid');
  const barra = document.getElementById('po-proj-lib-chips');
  const contador = document.getElementById('po-proj-lib-count');
  if (!grid) return;

  const box = projectBuilderSelBox();
  const cabem = Object.keys(projectBuilderCat)
    // Variante de profundidade (migration 126) nunca aparece como opção
    // própria — só o representante da família aparece pro cliente; a
    // variante certa é escolhida sozinha depois, em LayoutEngine.toPieceRows
    // (resolveDepthVariant), batendo a profundidade real do vão. Sem isto o
    // cliente veria "Gaveta" duplicada uma vez por faixa cadastrada.
    .filter((k) => !projectBuilderCat[k].depth_variant_of)
    // Filler de lateral compartilhada (migration 132) é sintetizado sozinho
    // pela engine (LayoutEngine emitFrontsResolvidos) — nunca é algo que o
    // cliente escolhe e arrasta pro vão, então nunca aparece na biblioteca.
    .filter((k) => projectBuilderCat[k].slug !== '_filler_lateral_porta')
    // Frente de gaveta (2026-08-20, Matt: "ela nao e um item separado do
    // construtor, ela pode ate ficar oculta no construtor. ela vai agregada
    // com a propria gaveta") — mesmo espírito do filler acima:
    // LayoutEngine.emitContent sintetiza sozinho uma frente_gaveta_externa
    // grudada em CADA gaveta/gaveta_afast/gaveteiro inserido (ver
    // FRENTE_GAVETA_ACCKEY em layout-engine.js); o cliente nunca escolhe
    // "Frente de Gaveta" solta na biblioteca pra arrastar num vão vazio.
    .filter((k) => projectBuilderCat[k].slug !== 'frente_gaveta_externa'
      && projectBuilderCat[k].slug !== 'frente_gaveta_interna')
    .filter((k) => LayoutEngine.cabeNoVao(projectBuilderCat[k], box, projectBuilderWhite[k]))
    // Trash / Spice: largura fixa — só no vão com a largura do gabinete padrão (21/11)
    .filter((k) => !(LayoutEngine.bloqueiaLarguraFixa && LayoutEngine.bloqueiaLarguraFixa(projectBuilderCat[k], box,
      projectBuilderEspessuraCasco(projectSlots.find((sl) => sl.id === projectBuilderSlotId)))))
    // vão ao lado de Divisória Stretcher Vertical: só frentes e travessas (21/11)
    .filter((k) => {
      const nSel = projectBuilderSelNode();
      return !(nSel && LayoutEngine.bloqueiaStretcherVertical
        && LayoutEngine.bloqueiaStretcherVertical(projectBuilderRoot, nSel, k, projectBuilderCat));
    });
  // Divisórias (base, lateral, gola) sempre primeiro, lado a lado; o resto
  // mantém a ordem do cadastro (sort estável).
  // Dentro dele: Base divisória e Lateral divisória lado a lado na 1ª linha,
  // Gola depois.
  const rankDiv = (k) => {
    const acc = projectBuilderCat[k];
    if (acc.group !== PROJECT_BUILDER_GRUPO_DIVISORIAS) return 9;
    const n = projLibNorm(acc.name);
    return /^base/.test(n) ? 0 : /^lateral|div_vert/.test(n + ' ' + (acc.slug || '')) ? 1 : 2;
  };
  cabem.sort((a, b) => rankDiv(a) - rankDiv(b));

  // ---- chips: "Todos" + um por grupo do que cabe AQUI ----
  const grupos = [];
  cabem.forEach((k) => {
    const g = projectBuilderCat[k].group || I18n.t('builder.group_other');
    if (grupos.indexOf(g) < 0) grupos.push(g);
  });
  // Trocar de vão pode tirar do ar o grupo que estava filtrado (um nicho baixo
  // não tem "Portas"). Sem isso o painel ficaria vazio sem explicar por quê.
  if (projectBuilderLibGroup && grupos.indexOf(projectBuilderLibGroup) < 0) projectBuilderLibGroup = '';
  if (barra) {
    barra.innerHTML = (grupos.length > 1
      ? [{ id: '', nome: I18n.t('project.builder_filter_all') }]
        .concat(grupos.map((g) => ({ id: g, nome: projectBuilderGroupLabel(g) })))
      : []
    ).map((c) => '<button type="button" class="po-proj-lib-chip'
      + (projectBuilderLibGroup === c.id ? ' active' : '')
      + '" data-group="' + escapeHtmlCutlist(c.id) + '">'
      + escapeHtmlCutlist(c.nome) + '</button>').join('');
  }

  // ---- lista final: cabe no vão + grupo escolhido + busca ----
  const q = projLibNorm(projectBuilderLibQuery).trim();
  const visiveis = cabem.filter((k) => {
    const acc = projectBuilderCat[k];
    if (projectBuilderLibGroup && (acc.group || I18n.t('builder.group_other')) !== projectBuilderLibGroup) return false;
    if (!q) return true;
    return projLibNorm(acc.name).indexOf(q) >= 0 || projLibNorm(acc.group).indexOf(q) >= 0
      || projLibNorm(projectBuilderAccLabel(acc)).indexOf(q) >= 0 || projLibNorm(projectBuilderGroupLabel(acc.group)).indexOf(q) >= 0;
  });

  if (contador) {
    contador.textContent = visiveis.length === 1
      ? I18n.t('project.builder_count_one')
      : I18n.t('project.builder_count', { n: visiveis.length });
  }

  if (!visiveis.length) {
    grid.innerHTML = '<div class="po-proj-lib-empty">' + escapeHtmlCutlist(
      cabem.length ? I18n.t('project.builder_no_search') : I18n.t('project.builder_no_fit')
    ) + '</div>';
    return;
  }

  // Título de grupo só quando a lista está MISTURADA (filtro em "Todos" e mais
  // de um grupo à vista): com um grupo escolhido o título repetiria o chip.
  const porGrupo = {};
  const ordem = [];
  visiveis.forEach((k) => {
    const g = projectBuilderCat[k].group || I18n.t('builder.group_other');
    if (!porGrupo[g]) { porGrupo[g] = []; ordem.push(g); }
    porGrupo[g].push(k);
  });
  const mostraTitulo = ordem.length > 1;

  grid.innerHTML = ordem.map((g) => (
    (mostraTitulo ? '<div class="po-proj-builder-group">' + escapeHtmlCutlist(projectBuilderGroupLabel(g)) + '</div>' : '')
    + porGrupo[g].map((k) => {
      const acc = projectBuilderCat[k];
      // Um controle por card: quem aceita quantidade mostra a CAIXA COM SETAS
      // (2026-08-15, Matt: "colocar um box com setas de 1 a 10"), quem não
      // aceita mostra o ⊕. Divisão em N sai sempre em vãos IGUAIS (todos os
      // filhos nascem elásticos; ver LayoutEngine.applySplit + splitSizes, que
      // rateia e joga o resto do arredondamento no último).
      const acao = projectBuilderAceitaQtd(acc)
        ? '<span class="po-proj-builder-qty" data-acc-id="' + k + '">'
          + '<button type="button" class="po-proj-qty-step" data-step="-1" tabindex="-1">&minus;</button>'
          + '<span class="po-proj-qty-val">' + (projectBuilderQtd[k] || 1) + '</span>'
          + '<button type="button" class="po-proj-qty-step" data-step="1" tabindex="-1">+</button>'
          + '</span>'
        : '<button type="button" class="po-proj-lib-add" tabindex="-1" aria-hidden="true">+</button>';
      return '<div class="po-proj-builder-item" draggable="true" data-acc-id="' + k + '"'
        + ' title="' + escapeHtmlCutlist(projectBuilderAccLabel(acc)) + '">'
        + '<span class="po-proj-builder-item-icon">' + projectBuilderIcon(acc) + '</span>'
        + '<span class="po-proj-builder-item-name">' + escapeHtmlCutlist(projectBuilderAccLabel(acc)) + '</span>'
        + acao
        + '</div>';
    }).join('')
  )).join('');

  grid.querySelectorAll('.po-proj-builder-item').forEach((card) => {
    // CLICAR insere no vão selecionado — o caminho rápido, e o único que
    // funciona no dedo sem arrastar. O card INTEIRO é o alvo (o ⊕ é só
    // afordância: o clique nele sobe pra cá). Usa a quantidade da caixa de
    // setas (1 quando a peça não aceita quantidade).
    card.addEventListener('click', () => {
      const val = card.querySelector('.po-proj-qty-val');
      insertProjectBuilderItem(card.dataset.accId, projectBuilderSelId,
        val ? (Number(val.textContent) || 1) : 1);
    });
    // ARRASTAR e soltar em cima de um vão — o caminho "como achar melhor".
    card.addEventListener('dragstart', (ev) => {
      card.classList.add('dragging');
      ev.dataTransfer.setData('text/plain', card.dataset.accId);
      ev.dataTransfer.effectAllowed = 'copy';
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
  });
  // Setas: só MEXEM no número, não inserem nada. stopPropagation porque elas
  // ficam dentro do card, e sem isso cada clique na seta também dispararia a
  // inserção.
  grid.querySelectorAll('.po-proj-qty-step').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const wrap = btn.parentElement;
      const accId = wrap && wrap.dataset.accId;
      if (!accId) return;
      const min = PROJECT_BUILDER_QTDS[0];
      const max = PROJECT_BUILDER_QTDS[PROJECT_BUILDER_QTDS.length - 1];
      const novo = clamp((projectBuilderQtd[accId] || 1) + Number(btn.dataset.step), min, max);
      if (novo === (projectBuilderQtd[accId] || 1)) return;
      projectBuilderQtd[accId] = novo;
      // O vão-alvo é cravado no PRIMEIRO passo e não muda mais: inserir move a
      // seleção pro primeiro filho, e sem isso o passo seguinte dividiria esse
      // filho em vez de refazer a divisão do mesmo vão.
      if (!projectBuilderQtdAlvo[accId]) projectBuilderQtdAlvo[accId] = projectBuilderSelId;
      // Insere JÁ — é isto que faz a peça aparecer no vão conforme o número
      // muda. applySplit substitui a divisão do nó (reaproveitando os filhos
      // que já existem), então repetir com N maior/menor é prévia ao vivo.
      insertProjectBuilderItem(accId, projectBuilderQtdAlvo[accId], novo);
    });
    btn.addEventListener('pointerdown', (ev) => ev.stopPropagation());
  });
}

// ==========================================================================
// DESENHO — vista frontal, SVG com viewBox em MILÍMETROS
// ==========================================================================
// viewBox em mm significa que toda coordenada do motor entra direto no
// desenho, sem escala intermediária pra errar. O único ajuste é o eixo Y (no
// motor cresce pra cima; no SVG, pra baixo) -> sy(). Mesma técnica da tela do
// ERP, pelo mesmo motivo.
//
// ORDEM IMPORTA: em SVG quem é criado depois fica por cima, inclusive pro
// clique. Casco (não clicável) -> vãos (alvo do clique) -> peças -> pegadores
// de arrasto.
const PROJECT_BUILDER_SVGNS = 'http://www.w3.org/2000/svg';
function projBuilderSvgEl(tag, attrs, parent) {
  const e = document.createElementNS(PROJECT_BUILDER_SVGNS, tag);
  for (const k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}

function renderProjectBuilderStage() {
  const stage = document.getElementById('po-proj-builder-stage');
  const slot = projectSlots.find((s) => s.id === projectBuilderSlotId);
  if (!stage || !slot) return;
  const W = Number(slot.width_mm || 0) || 1;
  const H = Number(slot.height_mm || 0) || 1;
  const D = Number(slot.depth_mm || 0) || 1;
  stage.innerHTML = '';

  // Margem PROPORCIONAL ao módulo, não fixa em mm: 60mm sobra num roupeiro de
  // 2100 e some num gaveteiro de 400.
  const K = Math.max(W, H);
  const m = K * 0.05, sw = K / 520, fs = K / 40;
  const svg = projBuilderSvgEl('svg', {
    class: 'po-proj-builder-svg',
    viewBox: (-m) + ' ' + (-m) + ' ' + (W + m * 2) + ' ' + (H + m * 2),
    preserveAspectRatio: 'xMidYMid meet'
  }, stage);
  const sy = (y, h) => H - y - (h || 0);

  // ---- DESENHO FIEL DO MÓDULO, em baixa opacidade, atrás de tudo.
  //
  // Pedido do Matt (2026-08-15), em três rodadas até chegar aqui:
  //   1. "um desenho 2d paralelo frontal do modulo com baixa opacidade... pra
  //      saber exatamente o que o usuario esta editando"
  //   2. "peguei com toekick e ta mostrando como se fosse outro modulo atras.
  //      quero o mesmo modulo / o modulo fiel"
  //   3. "no construtor ainda nao aparece o modulo certo, com rodape se tem
  //      rodape"
  //
  // As duas primeiras tentativas erraram por motivos OPOSTOS, e é por isso que
  // o desenho agora é o que é:
  //   * um RETÂNGULO liso 0,0→W,H: um armário base com toe kick tem recorte
  //     embaixo, então um retângulo cheio parece mesmo "outro módulo";
  //   * filtrar por classifyProjectCascoBox: essa função existe pra DEDUZIR a
  //     zona interna e por isso rejeita de propósito pé, toe kick e frente —
  //     exatamente as peças que dão a cara do módulo. Filtrar por ela apagava
  //     o rodapé do desenho.
  // Agora: TODAS as peças (projectBuilderDesenho, medido na cena — ver
  // openProjectModuleBuilder), cada uma no seu lugar real. Fundo primeiro
  // (ordenado por z0) pra peça da frente ficar por cima, igual ao módulo de
  // verdade visto de frente.
  const gC = projBuilderSvgEl('g', { 'pointer-events': 'none', opacity: 0.38 }, svg);
  const desenho = (projectBuilderDesenho && projectBuilderDesenho.length)
    ? projectBuilderDesenho : projectBuilderCasco;
  desenho.slice().sort((a, b) => a.z0 - b.z0).forEach((bx) => {
    const fundo = classifyProjectCascoBox(bx, W, H, D) === 'back';
    projBuilderSvgEl('rect', {
      x: bx.x0, y: sy(bx.y0, bx.sy),
      width: Math.max(bx.sx, 1), height: Math.max(bx.sy, 1),
      fill: fundo ? '#efe9de' : '#ded5c6',
      stroke: fundo ? '#c9c0b0' : '#8d8375', 'stroke-width': fundo ? sw : sw * 1.4
    }, gC);
  });

  // Contorno externo SÓ como último recurso: quando nenhuma peça foi
  // reconhecida (módulo sem cadastro utilizável, "vão ... (palpite)" no
  // rodapé), sem ele não sobraria referência nenhuma de onde o vão editado
  // fica dentro do móvel. Com peças desenhadas ele só faria uma moldura
  // sobrando, por isso é um OU, não um sempre.
  if (!desenho.length) {
    projBuilderSvgEl('rect', {
      x: 0, y: sy(0, H), width: W, height: H,
      fill: 'none', stroke: '#8a6a3f', 'stroke-width': sw * 1.2, 'stroke-opacity': 0.3,
      'pointer-events': 'none'
    }, svg);
  }

  const built = projectBuilderBuilt || { pieces: [], voids: [] };
  const gV = projBuilderSvgEl('g', {}, svg);
  const gP = projBuilderSvgEl('g', {}, svg);
  const gH = projBuilderSvgEl('g', {}, svg);

  // ---- vãos: o alvo do clique e do solte
  (built.voids || []).forEach((v) => {
    const sel = projectBuilderSelIds.length
      ? projectBuilderCaminho(v.nodeId).some((n) => projectBuilderSelIds.indexOf(n.id) >= 0)
      : v.nodeId === projectBuilderSelId;
    const r = projBuilderSvgEl('rect', {
      x: v.box.x, y: sy(v.box.y, v.box.h), width: v.box.w, height: v.box.h,
      class: 'po-proj-void' + (sel ? ' selected' : '')
    }, gV);
    r.dataset.nodeId = v.nodeId;
  });

  // ---- peças geradas pela árvore
  // GAVETA INTERNA COM PORTA (29/10, Matt: "precisa permitir colocar uma
  // porta na frente, justamente essa gaveta fica atrás da porta"). O caixote
  // e a frente embutida cobrem o vão inteiro no desenho e engoliam o clique
  // (clicar = apagar a gaveta) e o soltar da biblioteca — o vão de baixo,
  // que é quem recebe a porta, ficava inalcançável. Essas peças passam a
  // deixar o clique/arraste atravessar pro vão; apagar a gaveta = selecionar
  // o vão e usar o ⊗ (deleteProjectBuilderVao), como qualquer vão ocupado.
  const vaoGavetaComPorta = (p) => {
    const nd = p && p.nodeId ? LayoutEngine.findNode(projectBuilderRoot, p.nodeId) : null;
    if (!nd || !nd.content || !LayoutEngine.modeloGavetaInterna) return false;
    return LayoutEngine.modeloGavetaInterna(projectBuilderCat[nd.content.acc], nd.content.params) === 'com_porta'
      && (p.kind === 'content' || (p.kind === 'front' && p.frontIndex == null));
  };
  (built.pieces || []).slice().sort((a, b) => a.z - b.z).forEach((p) => {
    if (vaoGavetaComPorta(p)) {
      const fr = p.kind === 'front';
      projBuilderSvgEl('rect', {
        x: p.x, y: sy(p.y, p.h), width: p.w, height: p.h,
        fill: fr ? '#2f6fb8' : '#c49a63', 'fill-opacity': fr ? 0.10 : 0.92,
        stroke: fr ? '#2f6fb8' : '#8a6a3f', 'stroke-width': fr ? sw * 1.6 : sw,
        'stroke-dasharray': fr ? (sw * 7) + ' ' + (sw * 5) : 'none',
        'pointer-events': 'none'
      }, gP);
      return;
    }
    if (p.shape_type === 'oval_rod') {
      const l = projBuilderSvgEl('line', {
        x1: p.x, y1: sy(p.y + p.h / 2), x2: p.x + p.w, y2: sy(p.y + p.h / 2),
        stroke: '#59636d', 'stroke-width': sw * 3.2, 'stroke-linecap': 'round',
        class: 'po-proj-void-item'
      }, gP);
      l.addEventListener('click', (ev) => { ev.stopPropagation(); projectBuilderSelectPieceVao(p); });
      return;
    }
    const porta = p.kind === 'front';
    const r = projBuilderSvgEl('rect', {
      x: p.x, y: sy(p.y, p.h), width: p.w, height: p.h,
      fill: porta ? '#2f6fb8' : '#c49a63',
      'fill-opacity': porta ? 0.10 : 0.92,
      stroke: porta ? '#2f6fb8' : '#8a6a3f',
      'stroke-width': porta ? sw * 1.6 : sw,
      'stroke-dasharray': porta ? (sw * 7) + ' ' + (sw * 5) : 'none',
      class: 'po-proj-void-item',
      // A PORTA É CLICÁVEL SÓ NO CONTORNO. Ela cobre o vão inteiro: se o
      // miolo dela pegasse o clique, não daria mais pra selecionar o vão que
      // está atrás (e é lá dentro que vão a prateleira e a gaveta).
      'pointer-events': porta ? 'stroke' : 'auto'
    }, gP);
    r.addEventListener('click', (ev) => { ev.stopPropagation(); projectBuilderSelectPieceVao(p); });
    if (porta) {
      // Alvo gordo pro dedo, invisível, só no contorno.
      const hit = projBuilderSvgEl('rect', {
        x: p.x, y: sy(p.y, p.h), width: p.w, height: p.h,
        fill: 'none', stroke: 'transparent', 'stroke-width': sw * 10,
        'pointer-events': 'stroke', class: 'po-proj-void-item'
      }, gP);
      hit.addEventListener('click', (ev) => { ev.stopPropagation(); projectBuilderSelectPieceVao(p); });
    }
  });

  // ---- cotas do vão selecionado (o único texto da tela)
  //
  // A COTA É CLICÁVEL (2026-08-15, Matt: "preciso poder colocar os vãos
  // manualmente também. ao clicar no vão que eu quero, pode ser no desenho
  // mesmo, usar a medida que eu quero, e continuar usando arrastar também").
  // Clicar no número abre uma caixinha pra digitar — o arrasto da divisória
  // continua exatamente como estava, os dois caminhos terminam na MESMA regra
  // (cravar este vão e o vizinho preservando a soma, ver
  // applyProjectBuilderVaoSize).
  const nSel = projectBuilderSelNode();
  // Caixa de um vão: _box gravado pelo motor; senão a lista de vãos do build
  // (01/11, 2ª rodada — Matt: "não vejo o quadro de baixo quando seleciono
  // esses 2 vãos"): o vão sem _box (ou fora de built.voids) ficava sem
  // contorno.
  const caixaDoVao = (id) => {
    const n = id != null ? LayoutEngine.findNode(projectBuilderRoot, id) : null;
    if (n && n._box) return n._box;
    const v = (built.voids || []).find((x) => x.nodeId === id);
    return v ? v.box : null;
  };
  const bSel = nSel && (nSel._box || caixaDoVao(nSel.id));
  // SELEÇÃO MÚLTIPLA VISÍVEL (01/11, Matt: "quando seleciono 2 vãos, não dá
  // pra ver se estão selecionados. preciso mostrar os dois com contorno
  // laranja"): todo vão da seleção ganha o contorno, não só o principal.
  if (projectBuilderSelIds.length > 1) {
    projectBuilderSelIds.forEach((id) => {
      if (nSel && id === nSel.id) return;
      const b = caixaDoVao(id);
      if (!b) return;
      projBuilderSvgEl('rect', {
        x: b.x, y: sy(b.y, b.h), width: b.w, height: b.h,
        fill: 'none', stroke: '#e0921f', 'stroke-width': sw * 3, 'pointer-events': 'none'
      }, svg);
    });
  }
  if (bSel) {
    projBuilderSvgEl('rect', {
      x: bSel.x, y: sy(bSel.y, bSel.h), width: bSel.w, height: bSel.h,
      fill: 'none', stroke: '#e0921f', 'stroke-width': sw * 3, 'pointer-events': 'none'
    }, svg);
    // Só dá pra digitar a medida do eixo em que o vão foi DIVIDIDO: é esse o
    // número que tem um vizinho pra ceder espaço. Vão raiz (sem pai) não tem
    // de quem tirar — mas dá pra editar do mesmo jeito, só que mudando o
    // MÓDULO em vez de repartir espaço interno (ver bloco isRoot abaixo e
    // applyProjectBuilderRootSize).
    // !nSel.locked de propósito: um vão raiz travado (engenharia) cai no
    // ramo "else" abaixo, que já é read-only pra locked (mesma checagem que
    // projectBuilderVaoAxis faz pros vãos internos).
    const isRoot = nSel === projectBuilderRoot && !nSel.locked;
    const eixoEdit = isRoot ? null : projectBuilderVaoAxis(nSel);
    if (isRoot) {
      // Vão RAIZ (2026-08-21, Matt: "preciso mexer aqui, antes de qualquer
      // item inserido"): largura e altura vêm as DUAS direto do módulo — não
      // existe aqui um "eixo único da divisão" como nos vãos internos, então
      // cada número é um alvo de clique separado (largura edita width_mm,
      // altura edita height_mm). Desenha primeiro em x=0 e reposiciona pelas
      // larguras reais (getBBox) pra centralizar o bloco igual ao texto único
      // dos vãos internos, sem chutar largura de fonte por caractere.
      // 01/11 (Matt: "não dá pra ver os números, ficam apagados nesse
      // laranja; e ainda aparece em milímetros mesmo a configuração ser
      // polegadas"): texto PRETO, maior, e na unidade do seletor.
      const unidadeLbl = (document.getElementById('po-unit-select') || {}).value || 'mm';
      const fmtLbl = (mm) => (typeof formatDimensionNumber === 'function') ? formatDimensionNumber(mm, unidadeLbl) : String(Math.round(mm));
      const wStr = fmtLbl(bSel.w);
      const hStr = fmtLbl(bSel.h);
      const sep = ' × ';
      const yTxt = sy(bSel.y + bSel.h) - fs * 0.35;
      const mkTxt = (str) => {
        const el = projBuilderSvgEl('text', {
          x: 0, y: yTxt, 'text-anchor': 'start', 'font-size': fs * 0.95, 'font-weight': '700',
          fill: '#1b1f27', 'font-family': 'sans-serif', 'pointer-events': 'none'
        }, svg);
        el.textContent = str;
        return el;
      };
      const tW = mkTxt(wStr), tSep = mkTxt(sep), tH = mkTxt(hStr);
      let larguraW = 0, larguraSep = 0, larguraH = 0;
      try {
        larguraW = tW.getBBox().width;
        larguraSep = tSep.getBBox().width;
        larguraH = tH.getBBox().width;
      } catch (e) { /* SVG desanexado (raro) — segue com 0, fica só desalinhado */ }
      let cx = bSel.x + bSel.w / 2 - (larguraW + larguraSep + larguraH) / 2;
      tW.setAttribute('x', cx); cx += larguraW;
      tSep.setAttribute('x', cx); cx += larguraSep;
      tH.setAttribute('x', cx);
      const habilitar = (t, largura, eixo) => {
        t.setAttribute('pointer-events', 'auto');
        t.setAttribute('style', 'cursor:text');
        const x0 = Number(t.getAttribute('x')) || 0;
        projBuilderSvgEl('line', {
          x1: x0, x2: x0 + largura,
          y1: yTxt + fs * 0.1, y2: yTxt + fs * 0.1,
          stroke: '#e0921f', 'stroke-width': sw * 0.9,
          'stroke-dasharray': (sw * 3) + ' ' + (sw * 3), 'pointer-events': 'none'
        }, svg);
        t.addEventListener('click', (ev) => {
          ev.stopPropagation();
          openProjectBuilderSizeInput(t, nSel, eixo, applyProjectBuilderRootSize);
        });
      };
      habilitar(tW, larguraW, 'x');
      habilitar(tH, larguraH, 'y');

      // Alças de arrastar as 4 bordas (2026-08-21, 2ª rodada — Matt: "hoje
      // ele deixa eu reduzir mas nao deixa eu deslocar... nao tenho
      // controle do vao que quero utilizar"). Uma tira grossa e invisível
      // em cada borda do retângulo selecionado; arrastar move SÓ aquela
      // borda (ver startProjectBuilderRootEdgeDrag) — diferente da
      // divisória interna, aqui não tem vizinho pra preservar soma, então
      // dá pra deslocar o vão inteiro (arrastar as duas bordas de um eixo,
      // uma de cada vez) e não só encolher/esticar de um lado fixo.
      const ALCA_ESP = Math.max(fs * 0.5, 7);
      const yTopPx = sy(bSel.y + bSel.h), yBotPx = sy(bSel.y);
      const mkAlca = (x1p, y1p, x2p, y2p, cursor, borda) => {
        const hit = projBuilderSvgEl('line', {
          x1: x1p, y1: y1p, x2: x2p, y2: y2p,
          stroke: 'transparent', 'stroke-width': ALCA_ESP,
          'pointer-events': 'stroke', style: 'cursor:' + cursor
        }, svg);
        hit.addEventListener('pointerdown', (ev) => startProjectBuilderRootEdgeDrag(ev, borda));
      };
      mkAlca(bSel.x, yTopPx, bSel.x + bSel.w, yTopPx, 'ns-resize', 'top');
      mkAlca(bSel.x, yBotPx, bSel.x + bSel.w, yBotPx, 'ns-resize', 'bottom');
      mkAlca(bSel.x, yTopPx, bSel.x, yBotPx, 'ew-resize', 'left');
      mkAlca(bSel.x + bSel.w, yTopPx, bSel.x + bSel.w, yBotPx, 'ew-resize', 'right');

      // ↺ volta a usar a zona deduzida do casco — só aparece depois de
      // arrastar/digitar alguma coisa (sem sobreposição não tem o que
      // desfazer aqui; o ↶ do cabeçalho continua valendo sempre).
      if (projectBuilderRoot.params && projectBuilderRoot.params.zoneOverride) {
        const rR = Math.max(fs * 0.62, 9);
        const rCx = bSel.x + rR * 1.5, rCy = sy(bSel.y + bSel.h) + rR * 1.5;
        const gReset = projBuilderSvgEl('g', { style: 'cursor:pointer' }, svg);
        projBuilderSvgEl('circle', {
          cx: rCx, cy: rCy, r: rR, fill: '#fff', stroke: '#2f6fb8', 'stroke-width': sw * 1.2
        }, gReset);
        const tReset = projBuilderSvgEl('text', {
          x: rCx, y: rCy + rR * 0.36, 'text-anchor': 'middle', 'font-size': rR * 1.3,
          fill: '#2f6fb8', 'font-family': 'sans-serif', 'pointer-events': 'none'
        }, gReset);
        tReset.textContent = '↺'; // ↺ — "voltar ao automático"
        gReset.addEventListener('click', (ev) => {
          ev.stopPropagation();
          clearProjectBuilderRootZoneOverride();
        });
      }
    } else {
      const unidadeLbl2 = (document.getElementById('po-unit-select') || {}).value || 'mm';
      const fmtLbl2 = (mm) => (typeof formatDimensionNumber === 'function') ? formatDimensionNumber(mm, unidadeLbl2) : String(Math.round(mm));
      const t = projBuilderSvgEl('text', {
        x: bSel.x + bSel.w / 2, y: sy(bSel.y + bSel.h) - fs * 0.35,
        'text-anchor': 'middle', 'font-size': fs * 0.95, 'font-weight': '700', fill: '#1b1f27',
        'font-family': 'sans-serif',
        'pointer-events': eixoEdit ? 'auto' : 'none',
        style: eixoEdit ? 'cursor:text' : ''
      }, svg);
      t.textContent = fmtLbl2(bSel.w) + ' × ' + fmtLbl2(bSel.h);
      if (eixoEdit) {
        // Sublinhado tracejado = "isto se edita". Sem texto explicativo, no
        // espírito da tela (o rodapé já carrega a dica).
        projBuilderSvgEl('line', {
          x1: bSel.x + bSel.w / 2 - fs * 1.6, x2: bSel.x + bSel.w / 2 + fs * 1.6,
          y1: sy(bSel.y + bSel.h) - fs * 0.1, y2: sy(bSel.y + bSel.h) - fs * 0.1,
          stroke: '#e0921f', 'stroke-width': sw * 0.9,
          'stroke-dasharray': (sw * 3) + ' ' + (sw * 3), 'pointer-events': 'none'
        }, svg);
        t.addEventListener('click', (ev) => {
          ev.stopPropagation();
          openProjectBuilderSizeInput(t, nSel, eixoEdit);
        });
      }
    }

    // ---- ✕ APAGAR ESTE VÃO (2026-08-15, Matt: "uma vez que eu errei um vão,
    // não consigo deletar depois de salvo. se puder incluir um delete de
    // interno já salvo"). Clicar na peça pra remover já existia, mas depende
    // de acertar uma prateleira de 19,5mm — e não resolve "tirei a divisão
    // errada". Este botão apaga o que está DENTRO do vão selecionado e, se
    // ele mesmo nasceu de uma divisão, desfaz essa divisão. Funciona igual em
    // layout recém-montado e em layout já salvo (os dois viram a mesma árvore
    // em memória — ver openProjectModuleBuilder/LayoutEngine.deserialize).
    if (!nSel.locked) {
      const r = Math.max(fs * 0.62, 9);
      const cx = bSel.x + bSel.w - r * 1.5;
      const cy = sy(bSel.y + bSel.h) + r * 1.5;
      const gDel = projBuilderSvgEl('g', { style: 'cursor:pointer' }, svg);
      projBuilderSvgEl('circle', {
        cx: cx, cy: cy, r: r, fill: '#fff', stroke: '#b0503c', 'stroke-width': sw * 1.2
      }, gDel);
      const d = r * 0.42;
      projBuilderSvgEl('path', {
        d: 'M' + (cx - d) + ' ' + (cy - d) + 'L' + (cx + d) + ' ' + (cy + d)
          + 'M' + (cx + d) + ' ' + (cy - d) + 'L' + (cx - d) + ' ' + (cy + d),
        stroke: '#b0503c', 'stroke-width': sw * 1.6, 'stroke-linecap': 'round'
      }, gDel);
      gDel.addEventListener('click', (ev) => {
        ev.stopPropagation();
        deleteProjectBuilderVao(nSel);
      });
    }

    // ---- Porta Giro: dobra 1×2 folhas (500–600mm) + troca de lado
    // (migration 132, 2026-08-20 — Matt: "uma porta deve ter opcao de troca
    // de posicao de direita pra esquerda" / "de 500 a 600 podera ter opcao
    // de 2 OU 1 porta para o cliente escolher"). Só aparece quando o vão
    // selecionado tem um front cujo agregado resolve door_mechanism=
    // 'porta_giro' — LayoutEngine.folhasEfetivas é a MESMA função que o
    // resolvedor usa (js/layout-engine.js), pra nunca dessincronizar da
    // regra real de largura.
    const fSel = (nSel.fronts || []).find((fr) => fr.from == null) || null;
    const accSel = fSel && projectBuilderCat[fSel.acc];
    if (fSel && accSel && accSel.door_mechanism === 'porta_giro') {
      const pSel = Object.assign({}, accSel.params, fSel.params || {});
      const folhasAtuais = LayoutEngine.folhasEfetivas(accSel, bSel.w, pSel);
      const btnR = Math.max(fs * 0.62, 9);
      const by = sy(bSel.y + bSel.h) + btnR * 1.5;
      let bx = bSel.x + btnR * 1.5;

      // 1×2 folhas — só na faixa de indecisão (o cliente escolhe); fora
      // dela a dobra já é automática e não tem o que trocar aqui.
      if (bSel.w > LayoutEngine.PORTA_GIRO_1_FOLHA_ATE_MM && bSel.w <= LayoutEngine.PORTA_GIRO_2_FOLHAS_DE_MM) {
        const gFolhas = projBuilderSvgEl('g', { style: 'cursor:pointer' }, svg);
        projBuilderSvgEl('circle', {
          cx: bx, cy: by, r: btnR, fill: folhasAtuais === 2 ? '#2f6fb8' : '#fff',
          stroke: '#2f6fb8', 'stroke-width': sw * 1.2
        }, gFolhas);
        const tFolhas = projBuilderSvgEl('text', {
          x: bx, y: by + btnR * 0.35, 'text-anchor': 'middle',
          'font-size': btnR * 1.05, 'font-family': 'sans-serif',
          fill: folhasAtuais === 2 ? '#fff' : '#2f6fb8', 'pointer-events': 'none'
        }, gFolhas);
        tFolhas.textContent = folhasAtuais === 2 ? '2' : '1';
        gFolhas.setAttribute('title', I18n.t('project.builder_door_leaves_toggle') || '');
        gFolhas.addEventListener('click', (ev) => {
          ev.stopPropagation();
          fSel.params = Object.assign({}, fSel.params, { folhas_escolha: folhasAtuais === 2 ? '1' : '2' });
          rebuildProjectBuilder();
        });
        bx += btnR * 2.6;
      }

      // Troca de lado — só faz sentido com 1 folha só (2 folhas já abrem uma
      // pra cada lado, ver LayoutEngine emitFrontsResolvidos).
      if (folhasAtuais === 1) {
        const ladoAtual = pSel.lado === 'right' ? 'right' : 'left';
        const gLado = projBuilderSvgEl('g', { style: 'cursor:pointer' }, svg);
        projBuilderSvgEl('circle', {
          cx: bx, cy: by, r: btnR, fill: '#fff', stroke: '#2f6fb8', 'stroke-width': sw * 1.2
        }, gLado);
        const tLado = projBuilderSvgEl('text', {
          x: bx, y: by + btnR * 0.35, 'text-anchor': 'middle',
          'font-size': btnR * 1.05, 'font-family': 'sans-serif',
          fill: '#2f6fb8', 'pointer-events': 'none'
        }, gLado);
        tLado.textContent = ladoAtual === 'left' ? 'E' : 'D';
        gLado.setAttribute('title', I18n.t('project.builder_door_side_toggle') || '');
        gLado.addEventListener('click', (ev) => {
          ev.stopPropagation();
          fSel.params = Object.assign({}, fSel.params, { lado: ladoAtual === 'left' ? 'right' : 'left' });
          rebuildProjectBuilder();
        });
      }
    }
  }

  // ---- pegadores das divisórias: arrastar pra mover, clicar só seleciona (03/11)
  // Por último, pra ficarem por cima. A área de pega é bem maior que a peça:
  // uma prateleira de 18mm é impossível de acertar no dedo.
  (built.pieces || []).filter((p) => p.divIndex !== undefined).forEach((p) => {
    const pai = LayoutEngine.findNode(projectBuilderRoot, p.nodeId);
    if (!pai) return;
    const vert = pai.splitAxis === 'x';
    const folga = Math.max(K / 130, 16);
    const g = projBuilderSvgEl('rect', {
      x: vert ? p.x - folga / 2 : p.x,
      y: vert ? sy(p.y, p.h) : sy(p.y, p.h) - folga / 2,
      width: vert ? p.w + folga : p.w,
      height: vert ? p.h : p.h + folga,
      fill: 'transparent', class: vert ? 'po-proj-div-h' : 'po-proj-div-v'
    }, gH);
    g.addEventListener('pointerdown', (ev) => startProjectBuilderDivDrag(ev, pai, p, vert ? 'x' : 'y'));
  });

  // ---- seleção do vão + soltar a peça arrastada da biblioteca
  gV.querySelectorAll('rect[data-node-id]').forEach((r) => {
    // ARRASTAR PELOS VÃOS = escolher a faixa que a porta vai cobrir. Clicar e
    // soltar no mesmo vão continua sendo seleção simples (a faixa fica com um
    // item só e o comportamento é o de sempre).
    r.addEventListener('pointerdown', (ev) => {
      ev.stopPropagation();
      // startX/startY (2026-08-23, ver PROJECT_BUILDER_DRAG_MIN_PX abaixo):
      // guarda onde o dedo/mouse pousou, pra `pointerenter` só valer como
      // "arrastou de propósito pra outro vão" depois de andar um pouco —
      // sem isso, no toque, um tap "parado" que treme 1-2px já cruzava pro
      // vão vizinho e pintava uma faixa de 2 que ninguém pediu.
      projectBuilderRangeDrag = { ancoraId: r.dataset.nodeId, startX: ev.clientX, startY: ev.clientY };
      projectBuilderSelIds = [r.dataset.nodeId];
      projectBuilderSelId = r.dataset.nodeId;
      projectBuilderPintaSelecao();
    });
    r.addEventListener('pointerenter', (ev) => {
      if (!projectBuilderRangeDrag) return;
      // PROJECT_BUILDER_DRAG_MIN_PX: distância mínima (em pixels de tela)
      // desde o pointerdown pra um `pointerenter` em OUTRO vão contar como
      // arraste de faixa de verdade. Toque tem bem mais tremor que mouse —
      // sem esse piso, tocar uma vez já podia "vazar" pro vão ao lado
      // (ainda mais depois que o vão fica menor, cada peça inserida deixa a
      // grade mais apertada) e pintar uma faixa de 2 sem o usuário arrastar
      // nada de propósito.
      const dx = (ev.clientX || 0) - projectBuilderRangeDrag.startX;
      const dy = (ev.clientY || 0) - projectBuilderRangeDrag.startY;
      if ((dx * dx + dy * dy) < PROJECT_BUILDER_DRAG_MIN_PX * PROJECT_BUILDER_DRAG_MIN_PX) return;
      projectBuilderSelecionaFaixa(projectBuilderRangeDrag.ancoraId, r.dataset.nodeId);
    });
    r.addEventListener('click', (ev) => {
      ev.stopPropagation();
      // Escolher outro vão recomeça as caixas de quantidade: o número volta a
      // 1 e o próximo passo passa a mexer NESTE vão, não no anterior.
      projectBuilderQtd = {};
      projectBuilderQtdAlvo = {};
      // Um vão só = seleção simples; faixa de vários só sobrevive se o arraste
      // realmente passou por mais de um.
      if (projectBuilderSelIds.length <= 1) {
        projectBuilderSelId = r.dataset.nodeId;
        projectBuilderSelIds = [];
      }
      renderProjectBuilderStage();
      renderProjectBuilderLibrary();
    });
    r.addEventListener('dragover', (ev) => { ev.preventDefault(); r.classList.add('drop-target'); });
    r.addEventListener('dragleave', () => r.classList.remove('drop-target'));
    r.addEventListener('drop', (ev) => {
      ev.preventDefault();
      r.classList.remove('drop-target');
      insertProjectBuilderItem(ev.dataTransfer.getData('text/plain'), r.dataset.nodeId);
    });
  });

  // Fim do arraste de faixa. No window (e não no rect) porque soltar fora do
  // desenho tem que encerrar o gesto do mesmo jeito — senão a próxima
  // passagem do mouse continuaria pintando vãos sem botão apertado.
  if (!renderProjectBuilderStage._fimFaixa) {
    renderProjectBuilderStage._fimFaixa = true;
    const fim = () => {
      if (!projectBuilderRangeDrag) return;
      projectBuilderRangeDrag = null;
      // Faixa de 1 vão não é faixa — volta pro modo simples pra não confundir
      // o resto da tela (cota, ✕, quantidade).
      if (projectBuilderSelIds.length <= 1) projectBuilderSelIds = [];
      // redesenha o palco: os contornos laranja de TODOS os vãos da faixa
      // (e a cota) só existem depois do render — sem isso só o vão onde o
      // gesto começou aparecia marcado (01/11, Matt). Só na faixa: no clique
      // simples o rect precisa continuar vivo pro 'click' dele disparar.
      if (projectBuilderSelIds.length > 1) renderProjectBuilderStage();
      renderProjectBuilderLibrary();
    };
    window.addEventListener('pointerup', fim);
    window.addEventListener('pointercancel', fim);
  }

  const dica = document.createElement('div');
  dica.className = 'po-proj-builder-empty';
  const z = projectBuilderZone || {};
  const dg = projectBuilderZoneDiag;
  // O NÚMERO DO VÃO NA TELA. Enquanto a dedução do casco não estiver
  // confiável em todo cadastro, mostrar a medida do vão AO LADO da medida do
  // módulo é o que permite ver de relance se ele saiu interno ou externo — sem
  // console, sem flag, no lugar onde a pessoa já está olhando.
  dica.textContent = I18n.t('project.builder_hint')
    + (dg ? '   ·   vão ' + Math.round(z.w) + '×' + Math.round(z.h) + '×' + Math.round(z.d)
      + ' de ' + dg.modulo.join('×') + ' (' + dg.fonte + ')' : '');
  if (dg && (dg.fonte === 'palpite' || Math.round(z.w) >= dg.modulo[0])) dica.style.color = '#b0503c';
  stage.appendChild(dica);
}

// ==========================================================================
// NADA DO CONSTRUTOR ENCOSTA EM PEÇA DO CASCO (2026-08-15)
// ==========================================================================
// Pedido do Matt: "criar uma regra de nunca deixar as peças do construtor se
// sobreporem umas nas outras, tipo essa travessa de trás do móvel: a lateral
// divisória está em cima dela, isso não funciona na hora de montar, dá
// problema. Deveria afastar a divisória pra frente."
//
// Por que acontecia: a zona interna tem UMA profundidade só, deduzida das
// peças que o classificador reconhece como casco (lateral/topo/base/fundo).
// Uma TRAVESSA de trás não é nenhuma delas — é uma tira estreita (76mm de
// altura) colada no fundo, no alto do móvel. classifyProjectCascoBox devolve
// null pra ela de propósito (não cobre a face, então não define o vão), e o
// resultado é que a zona ignorava a travessa: a divisória nascia com a
// profundidade cheia e ATRAVESSAVA a peça.
//
// A regra aqui é geométrica e não depende de classificação nenhuma: para cada
// peça gerada pelo construtor, qualquer peça do módulo que cruze com ela em
// X e Y e ocupe a faixa de TRÁS empurra a frente dela — a peça fica mais
// rasa, começando na face frontal do obstáculo. É exatamente "afastar pra
// frente", e é o que o montador faz na bancada.
//
// Só o fundo é tratado, de propósito: obstáculo na FRENTE (porta) já é
// resolvido pelo próprio motor via consumo de profundidade
// (LayoutEngine/emitFronts + folgaDobradica), e clipar de novo aqui
// encolheria a peça duas vezes.
const PROJECT_INTERNO_MIN_PROF_MM = 60;   // mesmo piso do LayoutEngine (emitDivider)
const PROJECT_INTERNO_MIN_ALT_MM = 60;    // idem, no eixo da altura
// Quanto da PROFUNDIDADE da peça o obstáculo precisa cobrir pra encurtar a
// ALTURA dela. É o que separa PAINEL de TIRA (2026-08-16):
//   - base/topo inteiro cobre a profundidade toda -> encurta a divisória, que
//     é a única saída correta (não dá pra entalhar uma peça que fecha tudo);
//   - travessa/gola cobre 76mm de 600 -> NÃO encurta. Encurtar deixaria a
//     divisória baixa no vão inteiro só por causa da tira; esse caso é do
//     recortarInternosContraCasco, que entalha só o cantinho.
const PROJECT_INTERNO_COBERTURA_ALT = 0.7;
function clipProjectInternalsAgainstCasco(pieces, obstaculos) {
  const TOL = 0.5;   // mm — encostar não é sobrepor
  if (!Array.isArray(pieces) || !Array.isArray(obstaculos) || !obstaculos.length) return pieces;
  pieces.forEach((p) => {
    if (!p || !isFinite(p.z) || !isFinite(p.d) || p.d <= 0) return;
    // Gola em L do meio (2026-10-08): passa DE PROPÓSITO por dentro das
    // laterais (recorte em C) — não é peça pra ser recolhida pro vão.
    if (p.auto_join) return;
    const zFrente = p.z + p.d;
    let zNovo = p.z;
    obstaculos.forEach((b) => {
      const bx1 = b.x0 + b.sx, by1 = b.y0 + b.sy, bz1 = b.z0 + b.sz;
      const cruzaX = p.x < bx1 - TOL && p.x + p.w > b.x0 + TOL;
      const cruzaY = p.y < by1 - TOL && p.y + p.h > b.y0 + TOL;
      if (!cruzaX || !cruzaY) return;
      // Obstáculo que começa ATRÁS (ou junto) da peça e avança pra dentro
      // dela: a peça passa a começar onde ele termina.
      if (b.z0 <= p.z + TOL && bz1 > p.z + TOL) zNovo = Math.max(zNovo, bz1);
    });
    if (zNovo > p.z + TOL) {
      const nova = zFrente - zNovo;
      // Nunca some com a peça: se o obstáculo comeria quase tudo, é sinal de
      // cadastro estranho — melhor manter a peça no mínimo e deixar visível
      // do que devolver profundidade negativa pro 3D e pro plano de corte.
      if (nova >= PROJECT_INTERNO_MIN_PROF_MM) { p.z = zNovo; p.d = nova; }
    }

    // ---- MESMA REGRA NA ALTURA (2026-08-16) ----------------------------
    // Matt, vendo a divisória entrar na peça de cima: "lateral divisória tá
    // passando do vão interno na altura" e, quando perguntado qual peça era,
    // "não importa, não pode passar nenhum. mas neste caso é um bottom".
    //
    // Ou seja: a regra nunca foi "não atravessar a travessa do fundo", é
    // "não atravessar peça nenhuma". O eixo Z foi só onde ela nasceu. Uma
    // base cadastrada de um jeito que a dedução do vão não enxerga (papel
    // desconhecido, base intermediária, base que não encosta em y=0) deixa a
    // divisória nascer com a altura cheia e entrar nela.
    //
    // Roda DEPOIS do clip de profundidade de propósito: a cobertura é medida
    // sobre a profundidade JÁ corrigida, senão uma peça que o obstáculo de
    // trás vai encurtar seria avaliada com a profundidade velha.
    if (!isFinite(p.y) || !isFinite(p.h) || p.h <= 0) return;
    const yTopo = p.y + p.h;
    let yBaixo = p.y, yAlto = yTopo;
    obstaculos.forEach((b) => {
      const bx1 = b.x0 + b.sx, by1 = b.y0 + b.sy, bz1 = b.z0 + b.sz;
      const cruzaX = p.x < bx1 - TOL && p.x + p.w > b.x0 + TOL;
      const cruzaZ = p.z < bz1 - TOL && p.z + p.d > b.z0 + TOL;
      if (!cruzaX || !cruzaZ) return;
      // PAINEL, não tira: ver PROJECT_INTERNO_COBERTURA_ALT.
      const sobrepoeZ = Math.min(p.z + p.d, bz1) - Math.max(p.z, b.z0);
      if (sobrepoeZ < p.d * PROJECT_INTERNO_COBERTURA_ALT) return;
      // Obstáculo que vem de BAIXO e invade a peça: ela passa a começar em
      // cima dele. Obstáculo que vem de CIMA: ela passa a terminar embaixo
      // dele. Peça inteiramente DENTRO da altura (uma prateleira do próprio
      // módulo no meio do vão) não satisfaz nenhum dos dois e é ignorada —
      // ali quem resolve é o vão, não o clip.
      if (b.y0 <= p.y + TOL && by1 > p.y + TOL) yBaixo = Math.max(yBaixo, by1);
      if (by1 >= yTopo - TOL && b.y0 < yTopo - TOL) yAlto = Math.min(yAlto, b.y0);
    });
    if (yBaixo > p.y + TOL || yAlto < yTopo - TOL) {
      const nova = yAlto - yBaixo;
      // Mesmo piso do eixo Z: prateleira/base (que são ~19.5 de "altura")
      // nunca chegam aqui, e cadastro estranho não vira peça negativa.
      if (nova >= PROJECT_INTERNO_MIN_ALT_MM) { p.y = yBaixo; p.h = nova; }
    }
  });
  return pieces;
}

// ==========================================================================
// PEÇA DE CASCO QUE ENTALHA O INTERNO (2026-08-16)
// ==========================================================================
// Matt, depois de pôr uma divisória numa carcaça com gola: "ele precisa
// recortar a lateral onde pega no gola".
//
// POR QUE A DIVISÓRIA ENTRAVA NA GOLA. A zona interna é deduzida das peças de
// papel left/right/bottom/top/back. A gola é 'free' (não fecha o topo, é o
// canto da frente), então não entra na conta — a divisória nasce com a
// profundidade cheia. E clipProjectInternalsAgainstCasco, logo acima, só trata
// obstáculo ATRÁS: obstáculo na frente ficou de fora de propósito, porque
// porta o motor já desconta sozinho.
//
// POR QUE ENTALHAR E NÃO ENCURTAR. Encurtar deixaria a divisória parando
// 40mm antes da frente em todo o vão, só porque os 76mm de cima esbarram na
// gola — o móvel perderia a divisão justamente na boca. O montador entalha, e
// é o que as LATERAIS já fazem (a 094 cadastra o recorte nelas à mão).
//
// A DIVISÓRIA NÃO PODE SER CADASTRADA À MÃO: ela nasce do LayoutEngine, não é
// linha de module_components. Por isso aqui o recorte é DERIVADO da geometria
// — e cai no mesmo campo `recortes` que o 3D (viewer3d.buildPanelGeometry) e
// o .ban (drilling.js/slotsDaPeca) já sabem ler. Nenhum código novo nesses
// dois: o entalhe aparece no desenho e vira SlotL no arquivo da máquina de
// graça.
//
// GEOMÉTRICA, sem classificar peça (Matt escolheu "todas que cruzarem"):
// divisória, prateleira, base — o que cruzar é entalhado. O `recortes` só sabe
// representar CANTO, então a interseção precisa pegar a peça num canto em
// altura E em profundidade; interseção no meio da peça (que seria um furo
// passante, não um canto) é ignorada de propósito em vez de virar um recorte
// errado.
//
// Só cortam as peças marcadas `abre_recorte` (migration 111): a gola e o toe
// 4½. Sem a migration a lista sai vazia e nada muda.
function recortarInternosContraCasco(pieces, obstaculos) {
  const TOL = 0.5;   // mm — encostar não é cruzar
  if (!Array.isArray(pieces) || !Array.isArray(obstaculos)) return pieces;
  // buildBoxes devolve a caixa com `.part` junto; o caminho de último recurso
  // (medir a cena) não tem part e simplesmente não corta ninguém.
  const cortadores = obstaculos.filter((b) => b && b.part && b.part.abre_recorte);
  if (!cortadores.length) return pieces;

  pieces.forEach((p) => {
    if (!p || !(p.w > 0) || !(p.h > 0) || !(p.d > 0)) return;
    cortadores.forEach((b) => {
      const ix0 = Math.max(p.x, b.x0), ix1 = Math.min(p.x + p.w, b.x0 + b.sx);
      const iy0 = Math.max(p.y, b.y0), iy1 = Math.min(p.y + p.h, b.y0 + b.sy);
      const iz0 = Math.max(p.z, b.z0), iz1 = Math.min(p.z + p.d, b.z0 + b.sz);
      if (ix1 - ix0 <= TOL || iy1 - iy0 <= TOL || iz1 - iz0 <= TOL) return;

      const emCima = iy1 >= p.y + p.h - TOL, emBaixo = iy0 <= p.y + TOL;
      const naFrente = iz1 >= p.z + p.d - TOL, noFundo = iz0 <= p.z + TOL;
      // Precisa ser canto: um extremo em altura e um em profundidade. Os dois
      // extremos ao mesmo tempo (a peça inteira) também não é canto.
      if (emCima === emBaixo || naFrente === noFundo) return;

      const h = iy1 - iy0, d = iz1 - iz0;
      // Recorte que comeria a peça toda é sinal de geometria estranha — a
      // mesma guarda do viewer3d, que nesse caso desenha a peça inteira.
      if (h >= p.h - TOL || d >= p.d - TOL) return;

      const canto = (naFrente ? 'frente' : 'fundo') + '-' + (emCima ? 'cima' : 'baixo');
      if (!Array.isArray(p.recortes)) p.recortes = [];
      // Um recorte por canto (o viewer3d também só resolve um por canto). Se
      // duas peças cortarem o mesmo canto, fica o MAIOR — quem corta mais
      // fundo manda, senão a peça ainda esbarraria na outra.
      const ja = p.recortes.find((r) => r && r.canto === canto);
      if (ja) { ja.h = Math.max(ja.h || 0, h); ja.d = Math.max(ja.d || 0, d); return; }
      p.recortes.push({ canto: canto, h: h, d: d });
    });
  });
  return pieces;
}

// ==========================================================================
// MEDIDA DIGITADA + APAGAR VÃO (2026-08-15)
// ==========================================================================
// O pai de um nó, que o LayoutEngine não guarda (a árvore só aponta pra
// baixo). Varredura simples — a árvore de um módulo tem dezenas de nós, não
// milhares.
function projectBuilderFindParent(raiz, id) {
  if (!raiz || !id) return null;
  let achado = null;
  (function anda(n) {
    if (achado || !n || !n.children) return;
    n.children.forEach((k) => {
      if (achado) return;
      if (k.id === id) { achado = n; return; }
      anda(k);
    });
  })(raiz);
  return achado;
}

// Em que eixo este vão pode ter a medida digitada: o eixo em que o PAI o
// dividiu ('x' = largura, 'y' = altura). Null quando não dá — vão raiz (não
// tem vizinho de quem tirar espaço), pai sem eixo, ou nó travado pela
// engenharia.
function projectBuilderVaoAxis(node) {
  if (!node || node.locked) return null;
  const pai = projectBuilderFindParent(projectBuilderRoot, node.id);
  if (!pai || !pai.splitAxis || (pai.children || []).length < 2) return null;
  return pai.splitAxis === 'x' ? 'x' : 'y';
}

// A REGRA ÚNICA de mudar o tamanho de um vão — vale pro arrasto da divisória
// e pra medida digitada. Crava ESTE vão e o VIZINHO preservando a soma dos
// dois: nenhum outro irmão se mexe e quem estava elástico continua rateando o
// mesmo espaço. Mesma regra do ERP (CST, input data-kid).
//
// O vizinho é o de baixo/direita quando existe; no último filho, o de cima/
// esquerda. Sem isso, digitar no último vão não teria de quem tirar.
function applyProjectBuilderVaoSize(node, novoMm) {
  const eixo = projectBuilderVaoAxis(node);
  if (!eixo) return false;
  const pai = projectBuilderFindParent(projectBuilderRoot, node.id);
  const kids = pai.children || [];
  const i = kids.indexOf(node);
  const viz = i < kids.length - 1 ? i + 1 : i - 1;
  if (i < 0 || viz < 0 || !kids[viz]) return false;
  const tam = (k) => {
    const b = k._box;
    if (!b) return 0;
    return eixo === 'x' ? b.w : b.h;
  };
  const soma = tam(kids[i]) + tam(kids[viz]);
  const v = Math.max(PROJECT_BUILDER_MIN_VAO,
    Math.min(soma - PROJECT_BUILDER_MIN_VAO, Math.round(Number(novoMm) || 0)));
  if (!isFinite(v) || soma <= 0) return false;
  pushProjectBuilderUndo();
  kids[i].sizeMode = 'fixed'; kids[i].sizeValue = v;
  kids[viz].sizeMode = 'fixed'; kids[viz].sizeValue = soma - v;
  markProjectDirty();
  rebuildProjectBuilder();
  return true;
}

// VÃO RAIZ — digitar a medida (2026-08-21, 2ª rodada).
//
// 1ª versão (abandonada) redimensionava o MÓDULO inteiro via
// updateProjectSlotDimension. Matt: "nao me ajudou . preciso mexer com
// setas e alinhas com as pecas do movel se quiser. hoje ele deixa eu
// reduzir mas nao deixa eu deslocar. ou seja, nao tenho controle do vao
// que quero utilizar" — ele quer controlar o VÃO em si (arrastar as 4
// bordas livremente, ver startProjectBuilderRootEdgeDrag), não o módulo.
// Esta função agora é só o complemento de PRECISÃO do arrasto: digitar
// ancora no canto inferior-esquerdo ATUAL da sobreposição (x0/y0
// inalterados) e ajusta só a largura ou a altura — exatamente o que o
// arrasto faz quando só a borda direita/de cima se move. Grava em
// projectBuilderRoot.params.zoneOverride, mesmo lugar que o arrasto usa
// (ver projectBuilderRootZoneEfetiva) — os dois caminhos terminam na MESMA
// regra, igual applyProjectBuilderVaoSize/startProjectBuilderDivDrag pros
// vãos internos.
function applyProjectBuilderRootSize(node, novoMm, eixo) {
  if (!node || node !== projectBuilderRoot || (eixo !== 'x' && eixo !== 'y')) return false;
  const slot = projectSlots.find((s) => s.id === projectBuilderSlotId);
  const b = node._box || projectBuilderZone;
  if (!slot || !b) return false;
  const v = Math.round(Number(novoMm) || 0);
  if (!isFinite(v) || v < PROJECT_BUILDER_MIN_VAO) return false;
  const W = Number(slot.width_mm || 0) || 0;
  const H = Number(slot.height_mm || 0) || 0;
  // b (node._box) já É o retângulo EFETIVO atual — override anterior +
  // reclamp do rebuild mais recente (ver projectBuilderRootZoneEfetiva).
  // Não mistura com o zoneOverride "cru" salvo em params: se aquele arrasto/
  // digitação anterior tiver sido clampada (módulo mudou de tamanho por
  // fora, ou o valor extrapolou o casco), o params.zoneOverride guarda o
  // valor ANTIGO pré-clamp — usá-lo aqui faria o eixo que a pessoa NÃO está
  // editando agora voltar sozinho pro valor de antes do clamp a cada nova
  // digitação, como se a alteração anterior tivesse sido ignorada (2026-09-02,
  // relato do Matt: "quando eu modifico a area interna ele ignora a
  // modificacao e faz a insercao da medida como se nao tivesse alterado
  // vao").
  const atual = { x: b.x, y: b.y, w: b.w, h: b.h };
  pushProjectBuilderUndo();
  if (eixo === 'x') atual.w = Math.max(PROJECT_BUILDER_MIN_VAO, Math.min(v, W - atual.x));
  else atual.h = Math.max(PROJECT_BUILDER_MIN_VAO, Math.min(v, H - atual.y));
  node.params = node.params || {};
  node.params.zoneOverride = Object.assign(atual, projectBuilderOverrideRef(slot));
  markProjectDirty();
  rebuildProjectBuilder();
  return true;
}

// Arrastar qualquer BORDA do vão raiz livremente (2026-08-21, 2ª rodada).
// Diferente da divisória interna (startProjectBuilderDivDrag), não existe
// vizinho pra preservar soma — cada borda se move sozinha, então dá pra
// tanto redimensionar (mover 1 borda) quanto DESLOCAR o vão inteiro (mover
// as duas bordas do mesmo eixo, um arrasto de cada vez). Mesma técnica de
// arrasto RELATIVO do startProjectBuilderDivDrag (delta do ponteiro desde o
// pointerdown, não posição absoluta) — é o fix de 15/08 pro sintoma "a de
// baixo é incontrolável, joga lá pra cima": sem isso, um módulo alto de
// novo teria posições fora da área visível da janela.
function startProjectBuilderRootEdgeDrag(ev, borda) {
  ev.preventDefault();
  ev.stopPropagation();
  if (!projectBuilderRoot || projectBuilderRoot.locked) return;
  const slot = projectSlots.find((s) => s.id === projectBuilderSlotId);
  const b = projectBuilderRoot._box;
  if (!slot || !b) return;
  const W = Number(slot.width_mm || 0) || 0;
  const H = Number(slot.height_mm || 0) || 0;
  projectBuilderSelId = projectBuilderRoot.id;

  // Ponto de partida é sempre o retângulo EFETIVO atual (com sobreposição já
  // aplicada, se houver) — arrastar nunca "esquece" um ajuste anterior.
  const x0 = b.x, y0 = b.y, x1 = b.x + b.w, y1 = b.y + b.h;

  const svgAtual = () => {
    const st = document.getElementById('po-proj-builder-stage');
    return (st && st.querySelector('svg')) || null;
  };
  const paraMm = (e) => {
    const el = svgAtual();
    const m = el && el.getScreenCTM();
    if (!m) return null;
    const pt = el.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(m.inverse());
    return { x: p.x, y: H - p.y };
  };

  const cx0 = ev.clientX, cy0 = ev.clientY;
  const mm0 = paraMm(ev);
  let andou = false, fotoTirada = false;

  const mover = (e) => {
    if (!andou && Math.abs(e.clientX - cx0) < 4 && Math.abs(e.clientY - cy0) < 4) return;
    if (!fotoTirada) { pushProjectBuilderUndo(); fotoTirada = true; }
    andou = true;
    const mm = paraMm(e);
    if (!mm || !mm0) return;
    const dx = mm.x - mm0.x, dy = mm.y - mm0.y;
    const passo = (v) => Math.round(v / PROJECT_BUILDER_PASSO) * PROJECT_BUILDER_PASSO;
    // Cada borda só mexe na SUA coordenada, clampada contra a borda OPOSTA
    // (fixa, capturada no início do arrasto) e contra o módulo físico
    // (0..W / 0..H) — não contra a sobreposição anterior, que é justamente
    // o que este arrasto está substituindo.
    let nx0 = x0, ny0 = y0, nx1 = x1, ny1 = y1;
    if (borda === 'left') nx0 = Math.max(0, Math.min(passo(x0 + dx), x1 - PROJECT_BUILDER_MIN_VAO));
    else if (borda === 'right') nx1 = Math.min(W, Math.max(passo(x1 + dx), x0 + PROJECT_BUILDER_MIN_VAO));
    else if (borda === 'bottom') ny0 = Math.max(0, Math.min(passo(y0 + dy), y1 - PROJECT_BUILDER_MIN_VAO));
    else if (borda === 'top') ny1 = Math.min(H, Math.max(passo(y1 + dy), y0 + PROJECT_BUILDER_MIN_VAO));
    projectBuilderRoot.params = projectBuilderRoot.params || {};
    projectBuilderRoot.params.zoneOverride = Object.assign({ x: nx0, y: ny0, w: nx1 - nx0, h: ny1 - ny0 },
      projectBuilderOverrideRef(projectSlots.find((s) => s.id === projectBuilderSlotId)));
    rebuildProjectBuilder();
  };
  const soltar = () => {
    removeEventListener('pointermove', mover);
    removeEventListener('pointerup', soltar);
    if (andou) markProjectDirty();
  };
  addEventListener('pointermove', mover);
  addEventListener('pointerup', soltar);
}

// Caixinha de digitar a medida, ancorada em cima da própria cota do desenho.
// position:fixed a partir do retângulo de tela do <text> — assim não depende
// do zoom do SVG nem de o stage ser position:relative.
//
// aplicarFn (opcional, default applyProjectBuilderVaoSize): qual regra usar
// pra gravar o valor digitado — o vão raiz usa applyProjectBuilderRootSize
// (redimensiona o MÓDULO, ver comentário lá) em vez da regra de "cravar
// este vão e o vizinho" (que não existe pra quem não tem vizinho).
function openProjectBuilderSizeInput(textEl, node, eixo, aplicarFn) {
  const aplicar = aplicarFn || applyProjectBuilderVaoSize;
  const antigo = document.getElementById('po-proj-vao-input');
  if (antigo) antigo.remove();
  const r = textEl.getBoundingClientRect();
  const b = node._box || {};
  // NA UNIDADE DO USUÁRIO (2026-10-25, Matt: "preciso de inches se o
  // usuário é inches"): antes era type=number em mm fixo. Agora mostra e lê
  // na unidade escolhida (po-unit-select) — em polegadas aceita fração
  // ("7 1/16", "7-1/16", 7.0625). Por dentro continua tudo em mm.
  const unidade = (document.getElementById('po-unit-select') || {}).value || 'mm';
  const mmAtual = eixo === 'x' ? (b.w || 0) : (b.h || 0);
  const inp = document.createElement('input');
  inp.id = 'po-proj-vao-input';
  inp.type = 'text';
  inp.inputMode = 'decimal';
  inp.value = (typeof formatDimensionNumber === 'function') ? formatDimensionNumber(mmAtual, unidade) : String(Math.round(mmAtual));
  inp.title = (typeof unitAbbrev === 'function') ? unitAbbrev(unidade) : unidade;
  inp.style.cssText = 'position:fixed;z-index:10000;width:88px;padding:4px 6px;'
    + 'font-size:13px;text-align:center;border:2px solid #e0921f;border-radius:6px;'
    + 'background:#fff;color:#7a4d0d;outline:none;'
    + 'left:' + Math.round(r.left + r.width / 2 - 44) + 'px;'
    + 'top:' + Math.round(r.top - 6) + 'px;';
  document.body.appendChild(inp);
  inp.focus();
  inp.select();
  let fechado = false;
  const fechar = (aplicarAgora) => {
    if (fechado) return;
    fechado = true;
    const txt = String(inp.value || '').trim().replace(/(\d)\s*-\s*(\d+\/\d+)/, '$1 $2');   // 7-1/16 -> 7 1/16
    const v = (typeof parseDimensionInput === 'function') ? parseDimensionInput(txt, unidade) : Number(txt);
    inp.remove();
    if (aplicarAgora && v != null && isFinite(v) && v > 0) aplicar(node, v, eixo);
  };
  inp.addEventListener('keydown', (ev) => {
    ev.stopPropagation();
    if (ev.key === 'Enter') { ev.preventDefault(); fechar(true); }
    else if (ev.key === 'Escape') { ev.preventDefault(); fechar(false); }
  });
  // Enter/Escape resolvem; sair do campo aplica também (é o que a pessoa
  // espera depois de digitar e clicar fora).
  inp.addEventListener('blur', () => fechar(true));
}

// APAGAR O VÃO SELECIONADO — o "delete de interno já salvo" que faltava.
//
// Duas camadas, nesta ordem, porque são dois erros diferentes:
//   1. o vão TEM conteúdo/frente dentro dele -> esvazia só o conteúdo e
//      mantém o vão (o cliente errou a peça, não a divisão);
//   2. o vão está vazio -> aí o erro foi a DIVISÃO que o criou, então ele é
//      fundido de volta (mesma regra de removeProjectBuilderPiece: com mais
//      de 2 irmãos some só este e o anterior volta a ser elástico; com 2, a
//      divisão inteira acaba).
// Assim um clique só nunca destrói mais do que o necessário, e repetir o
// clique vai desfazendo camada por camada — tudo reversível pelo ↶.
function deleteProjectBuilderVao(node) {
  if (!node || node.locked) return;
  const temConteudo = !!node.content || ((node.fronts || []).length > 0);
  if (temConteudo) {
    pushProjectBuilderUndo();
    if (node.content) LayoutEngine.clearNode(node, 'content');
    if ((node.fronts || []).length) LayoutEngine.clearNode(node, 'front');
    markProjectDirty();
    rebuildProjectBuilder();
    return;
  }
  // Vão vazio que ainda divide outros: desfaz a divisão DELE primeiro.
  if ((node.children || []).length) {
    pushProjectBuilderUndo();
    LayoutEngine.clearNode(node, 'split');
    projectBuilderSelId = node.id;
    markProjectDirty();
    rebuildProjectBuilder();
    return;
  }
  const pai = projectBuilderFindParent(projectBuilderRoot, node.id);
  if (!pai || pai.locked) return;
  const kids = pai.children || [];
  const i = kids.indexOf(node);
  if (i < 0) return;
  pushProjectBuilderUndo();
  if (kids.length > 2) {
    const sobra = kids[i === 0 ? 1 : i - 1];
    kids.splice(i, 1);
    if (sobra) { sobra.sizeMode = 'fill'; sobra.sizeValue = null; }
    projectBuilderSelId = (sobra || pai).id;
  } else {
    LayoutEngine.clearNode(pai, 'split');
    projectBuilderSelId = pai.id;
  }
  markProjectDirty();
  rebuildProjectBuilder();
}

// Arrastar divisória = cravar o tamanho dos DOIS vãos vizinhos preservando a
// SOMA deles. Preservar a soma é o que mantém o arrasto LOCAL: nenhum outro
// irmão se mexe, e os que estavam elásticos continuam rateando o mesmo espaço.
// Mesma regra do ERP (CST.startDragDiv).
//
// Arrastar e CLICAR moram no mesmo alvo: se o dedo não andou (< 4px), o gesto
// era clique — só seleciona (03/11: não apaga mais; apagar é só no ⊗).
function startProjectBuilderDivDrag(ev, node, peca, eixo) {
  ev.preventDefault();
  ev.stopPropagation();
  const stage = document.getElementById('po-proj-builder-stage');
  const svg = stage && stage.querySelector('svg');
  const kids = node.children || [];
  const idx = peca.divIndex;
  if (!svg || !kids[idx] || !kids[idx]._box || !kids[idx + 1] || !kids[idx + 1]._box) return;

  projectBuilderSelId = node.id;
  // (ini era a origem do arrasto ABSOLUTO; o arrasto virou relativo — ver
  // mm0/tam0 abaixo. Mantido só como referência da borda do par.)
  const ini = eixo === 'x' ? kids[idx]._box.x : kids[idx]._box.y;
  const soma = (eixo === 'x' ? kids[idx]._box.w : kids[idx]._box.h)
    + (eixo === 'x' ? kids[idx + 1]._box.w : kids[idx + 1]._box.h);
  const H = Number((projectSlots.find((s) => s.id === projectBuilderSlotId) || {}).height_mm || 0);
  const x0 = ev.clientX, y0 = ev.clientY;
  let andou = false;
  let fotoTirada = false;

  // O SVG É REBUSCADO A CADA LEITURA (2026-08-15) — não dá pra guardar o
  // elemento capturado no pointerdown. Cada pointermove chama
  // rebuildProjectBuilder(), que faz stage.innerHTML = '' e DESTRÓI o svg;
  // do segundo movimento em diante o elemento antigo está solto da página e
  // getScreenCTM() devolve null, quebrando a conta. O sintoma era a
  // divisória travar onde o primeiro movimento a deixou — o "não consigo
  // arrastar, ela fica grudada na de cima" do Matt.
  const svgAtual = () => {
    const st = document.getElementById('po-proj-builder-stage');
    return (st && st.querySelector('svg')) || null;
  };
  const paraMm = (e) => {
    const el = svgAtual();
    const m = el && el.getScreenCTM();
    if (!m) return null;
    const pt = el.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(m.inverse());
    return { x: p.x, y: H - p.y };
  };

  // ARRASTO RELATIVO — segue o DESLOCAMENTO do mouse, não a posição absoluta
  // (2026-08-15). Antes era absoluto: `novo = ponteiro − ini`, ou seja, a
  // divisória ia pra onde o ponteiro estivesse em mm. A conta estava certa,
  // mas exigia que o ponteiro alcançasse a posição exata — e num módulo ALTO
  // o desenho é maior que a área visível da janela, então as posições de
  // baixo ficam literalmente fora da tela.
  //
  // Sintoma relatado pelo Matt: "a de cima eu consigo controlar, a do meio
  // mais ou menos, e a de baixo é incontrolável: clico pra arrastar e ela
  // joga lá pra cima e não tem edição". Medido no console dele: viewBox de
  // 2970 unidades × escala 0.2077 = 617px de desenho, terminando em y≈889 na
  // tela — abaixo do fim da janela. Qualquer ponto que ele CONSEGUIA clicar
  // ficava acima do ponto correto, então a divisória subia; e pra descer
  // precisaria apontar fora da tela ("como se não tivesse espaço no mouse").
  //
  // Com o delta, pegar a divisória em qualquer lugar não a move (delta 0 =
  // fica onde está — acaba o salto ao clicar) e o curso do mouse é o mesmo
  // pra qualquer divisória, alta ou baixa.
  const mm0 = paraMm(ev);
  const tam0 = eixo === 'x' ? kids[idx]._box.w : kids[idx]._box.h;
  const mover = (e) => {
    if (!andou && Math.abs(e.clientX - x0) < 4 && Math.abs(e.clientY - y0) < 4) return;
    if (!fotoTirada) { pushProjectBuilderUndo(); fotoTirada = true; }
    andou = true;
    const mm = paraMm(e);
    if (!mm || !mm0) return;
    const delta = (eixo === 'x' ? mm.x - mm0.x : mm.y - mm0.y);
    let novo = tam0 + delta;
    novo = Math.round(novo / PROJECT_BUILDER_PASSO) * PROJECT_BUILDER_PASSO;
    novo = Math.max(PROJECT_BUILDER_MIN_VAO, Math.min(soma - PROJECT_BUILDER_MIN_VAO, novo));
    kids[idx].sizeMode = 'fixed'; kids[idx].sizeValue = novo;
    kids[idx + 1].sizeMode = 'fixed'; kids[idx + 1].sizeValue = soma - novo;
    rebuildProjectBuilder();
  };
  const soltar = () => {
    removeEventListener('pointermove', mover);
    removeEventListener('pointerup', soltar);
    if (andou) markProjectDirty();
    // Não andou = clique. ANTES apagava a divisória (03/11, Matt: "quando
    // clico bem na divisoria ele deleta a peca... o deleta so deve
    // funcionar no x"). Agora clique só seleciona; apagar é só pelo ⊗.
    else { renderProjectBuilderStage(); renderProjectBuilderLibrary(); }
  };
  addEventListener('pointermove', mover);
  addEventListener('pointerup', soltar);
}

// Clicar numa peça TIRA ela — sem menu e sem confirmação: é reversível (o ↶ do
// cabeçalho, e basta clicar de novo na biblioteca) e é o gesto mais rápido.
//
// Tirar UMA divisória de um vão que tem várias não pode apagar a divisão
// inteira (o cliente pediu 3 prateleiras e clicou na do meio: ele quer ficar
// com 2). Então: sobrando mais de 2 filhos, some só o filho seguinte e o
// anterior volta a ser elástico — os dois vãos viram um. Com 2 filhos, aí sim
// a divisão acaba.
// CLICAR NUMA PEÇA = SELECIONAR O VÃO DELA (03/11, Matt: "quando clico bem
// na divisoria ele deleta a peca. nao era pra acontecer isso o deleta so deve
// funcionar no x"). Antes o clique em prateleira/porta/cabideiro chamava
// removeProjectBuilderPiece direto. Agora só seleciona o vão onde a peça
// mora; apagar é pelo ⊗ desse vão (deleteProjectBuilderVao).
function projectBuilderSelectPieceVao(p) {
  const node = p && p.nodeId ? LayoutEngine.findNode(projectBuilderRoot, p.nodeId) : null;
  if (!node) return;
  projectBuilderQtd = {};
  projectBuilderQtdAlvo = {};
  projectBuilderSelId = node.id;
  projectBuilderSelIds = [];
  renderProjectBuilderStage();
  renderProjectBuilderLibrary();
}

function removeProjectBuilderPiece(p) {
  const node = LayoutEngine.findNode(projectBuilderRoot, p.nodeId);
  if (!node || node.locked) return;
  pushProjectBuilderUndo();
  if (p.kind === 'split') {
    const kids = node.children || [];
    if (kids.length > 2 && p.divIndex != null && kids[p.divIndex]) {
      kids.splice(p.divIndex + 1, 1);
      kids[p.divIndex].sizeMode = 'fill';
      kids[p.divIndex].sizeValue = null;
    } else {
      LayoutEngine.clearNode(node, 'split');
    }
  } else if (p.kind === 'content') {
    LayoutEngine.clearNode(node, 'content');
  } else if (p.kind === 'front') {
    // Frente SINTETIZADA (gaveta/gaveta interna) não tem frontIndex — antes
    // splice(undefined) tirava a fronts[0] do vão (a porta do cliente).
    if (p.frontIndex == null) LayoutEngine.clearNode(node, 'content');
    else LayoutEngine.removeFront(node, p.frontIndex);
  }
  projectBuilderSelId = node.id;
  markProjectDirty();
  rebuildProjectBuilder();
}

// ==========================================================================
// DA ÁRVORE PRA PEÇA DE VERDADE — 3D, preço, elevação 2D, plano de corte
// ==========================================================================
// accessory_types é catálogo GLOBAL (só a whitelist é por módulo), então o
// cache é um só pra sessão inteira. Ele é o que permite refazer as peças de um
// slot sem reabrir a janela do construtor — precisa disso porque a geometria é
// absoluta em mm e tem que nascer de novo quando o módulo muda de medida.
let accessoryCatalogCache = null;
let accessoryCatalogLoading = null;
async function ensureAccessoryCatalog() {
  if (accessoryCatalogCache) return accessoryCatalogCache;
  if (accessoryCatalogLoading) return accessoryCatalogLoading;
  accessoryCatalogLoading = (async () => {
    try {
      const { data, error } = await supabaseClient
        .from('accessory_types')
        .select('*, components(*, labor_types(*), component_types(*))');
      if (error) throw error;
      // COM AS PEÇAS DO MÓDULO FILHO (2026-10-12, Matt: "nem agrupando tudo
      // não está mostrando as gavetas" no $ Fábrica). Este caminho — o do
      // projeto RESTAURADO (hydrateProjectLayoutPieces), sem abrir o
      // Construtor — montava o catálogo SÓ com o ponteiro child_module_id:
      // a gaveta do Construtor nascia com child_pieces=[] e sem corrediça
      // própria, o preço do módulo LANÇAVA ("Nenhum modelo de corrediça")
      // e o slot ficava com o preço antigo, SEM as gavetas — silencioso,
      // até alguém abrir o Construtor naquele módulo. A janela do
      // Construtor sempre carregou os extras (ver loadAccessoryModuleExtras);
      // agora os dois caminhos carregam igual.
      const extras = await loadAccessoryModuleExtras(data || []);
      const cat = {};
      (data || []).forEach((a) => { cat[a.id] = projectBuilderAccessoryEntry(a, a.child_module_id ? extras[a.child_module_id] : null); });
      accessoryCatalogCache = cat;
    } catch (e) {
      accessoryCatalogCache = {};   // migration 085 não rodou: segue sem agregado
    }
    accessoryCatalogLoading = null;
    return accessoryCatalogCache;
  })();
  return accessoryCatalogLoading;
}

// SÍNCRONA de propósito: é chamada dentro de recomputeProjectSlotPricing, que
// roda a cada pointermove do arraste de medida. Sem catálogo em memória ela
// não faz nada (e, principalmente, NÃO apaga o que já estava lá — quem carrega
// é hydrateProjectLayoutPieces / o próprio construtor).
function rebuildProjectSlotLayoutPieces(slot) {
  if (!slot) return;
  // GEOMETRIA CONGELADA DE UM PEDIDO (2026-10-26): slot remontado a partir de
  // um order_item (troca de cor no pedido, portal-26 buildSlotFromOrderItem)
  // não tem a árvore — só order_items.layout (= built.pieces do envio). Usa
  // ela como está: mesma porta/prateleira/frente que o pedido já tem.
  if (Array.isArray(slot._frozenLayoutGeometry) && slot._frozenLayoutGeometry.length) {
    slot.layoutPieces = projectLayoutRowsForSlot(slot, slot._frozenLayoutGeometry);
    slot._layoutGeometry = slot._frozenLayoutGeometry;
    return;
  }
  if (!slot.layout) { slot.layoutPieces = []; slot._layoutGeometry = null; return; }
  if (typeof LayoutEngine === 'undefined' || !accessoryCatalogCache) return;
  try {
    const root = LayoutEngine.deserialize(slot.layout);
    // FIX 2026-09-14 (Matt: "a porta sai pra cima do modulo, exatamente
    // como se pegasse o vao inicial sem minha alteracao"): esta função
    // ignorava a sobreposição manual do vão raiz (root.params.zoneOverride
    // — arrastar/digitar a medida no Construtor, ver
    // projectBuilderRootZoneEfetiva). rebuildProjectBuilder (o preview
    // DENTRO do Construtor) já mesclava certo; mas recomputeProjectSlotPricing
    // chama ESTA função logo depois de applyProjectBuilderToSlot já ter
    // gravado slot.layoutPieces certo — e SOBRESCREVIA com a zona
    // auto-deduzida (sem o ajuste), mesmo sem fechar/reabrir o Construtor.
    // Resultado: a porta ia pro ambiente/preço/corte na posição do vão
    // ORIGINAL, como se o ajuste nunca tivesse existido.
    const zona = projectBuilderRootZoneEfetiva(computeProjectSlotInnerZone(slot), root, slot);
    const built = LayoutEngine.build(root, zona, {
      catalogo: accessoryCatalogCache,
      espessura: PROJECT_BUILDER_ESPESSURA,
      espessuraCasco: projectBuilderEspessuraCasco(slot),
      folgaDobradica: PROJECT_BUILDER_FOLGA_DOB,
      temFundo: !!zona.temFundo
    });
    // MESMA regra da janela do construtor (ver clipProjectInternalsAgainstCasco).
    // Precisa estar nos DOIS lugares: a janela desenha, mas é aqui que nascem
    // as peças que vão pro 3D, pro preço e pro plano de corte — se só a janela
    // clipasse, o desenho mostraria a divisória afastada e a fábrica receberia
    // a medida antiga, atravessando a travessa.
    //
    // Caminho BARATO de propósito (sem medirNaCena): esta função roda a cada
    // pointermove do arraste de medida. O 3º argumento tira as frentes, que não
    // são obstáculo aqui (o motor já desconta a porta sozinho).
    // Os dois na sequência, e nesta ordem: o clip acerta a PROFUNDIDADE da
    // peça (obstáculo atrás), e só depois o recorte mede a interseção com quem
    // entalha. Invertido, o recorte sairia calculado sobre uma profundidade
    // que o clip ainda ia mudar.
    const cascoBoxes = computeProjectSlotCascoBoxes(slot, false, true);
    clipProjectInternalsAgainstCasco(built.pieces, cascoBoxes);
    recortarInternosContraCasco(built.pieces, cascoBoxes);
    // MODELO DE PORTA (migration 188): troca o accKey das portas de abrir
    // giro pelo do modelo escolhido ANTES de virar linha e ANTES de congelar
    // (_layoutGeometry vai pro pedido — o ERP refaz a furação dela). Flat
    // (padrão) = o mesmo array, intocado.
    built.pieces = applySlotDoorModelToPieces(slot, built.pieces);
    slot.layoutPieces = projectLayoutRowsForSlot(slot, built.pieces);
    // GEOMETRIA CONGELÁVEL (migration 121, Caminho B da furação do
    // construtor — ver [[construtor_como_motor_principal]]). `built.pieces`
    // já passou pelo recorte contra o casco acima; é exatamente o array que
    // projectLayoutRowsForSlot/toPieceRows consome. Guardamos ele (não o
    // resultado de toPieceRows) porque o que deve congelar no pedido é a
    // GEOMETRIA — a decisão do cliente sobre onde cada peça fica —, não a
    // furação/preço dela, que continuam podendo ser corrigidos depois no
    // cadastro. sendProjectToOrder lê slot._layoutGeometry no checkout.
    slot._layoutGeometry = slot.layout ? built.pieces : null;
  } catch (e) {
    slot.layoutPieces = [];
    slot._layoutGeometry = null;
  }
}

// A ponte, com as travas que o preço exige. Pricing.calculateLeafPiece
// LANÇA (e derruba o preço do slot inteiro) quando falta cor ou corrediça —
// e a peça que nasce aqui não passou por nenhuma das telas que normalmente
// garantem isso. Então:
//   1. papel de cor sem cor escolhida cai numa cor que o slot JÁ usa;
//   2. gaveta sem modelo de corrediça escolhido não cobra corrediça.
// Nenhuma das duas é silenciosa por preguiça: é sempre melhor a peça
// aparecer no desenho com um custo levemente incompleto do que o módulo
// inteiro perder o preço por causa de um cadastro que falta.
//
// A dobradiça NÃO tem mais trava aqui (2026-08-20, Matt: "a abertura deve
// vir única e exclusivamente da porta ou modelo. não pode ser diferente" /
// "não pode vir do módulo, e sim da porta sempre"). Existia um `if
// (r.hinge_side... && !slot.hingeModel) r.hinge_side = 'none';` bem aqui —
// zerava hinge_side (a porta "esquecia" que tem dobradiça: não abria no
// 3D, não furava copo) só porque o MÓDULO não tinha nenhum modelo de
// dobradiça vinculado (module_hinge_models). Era o inverso do que as
// outras duas travas fazem: cor e corrediça degradam o CUSTO, preservando
// o fato físico da peça; esta apagava o fato físico. Removida —
// `js/pricing.js:calculateLeafPiece` agora não lança mais erro por falta
// de hingeModel, só deixa `hinge_cost=0` (mesma filosofia das outras
// duas): a porta sempre abre/fura conforme o mecanismo dela, o que pode
// faltar é só o preço da dobradiça física até alguém escolher o modelo.
// ==========================================================================
// MODELO DE PORTA no projeto (migration 188, 2026-10-02). Matt: "preciso que
// eu possa substituir portas de abrir giro por portas de alumínio... de
// padrão entra sempre a flat. não mude nada do que já está funcionando."
//   slot.doorModelId = null  -> Flat (padrão): NADA muda, nenhuma troca.
//   slot.doorModelId = <id>  -> toda porta de abrir giro (agregado do
//     Construtor com door_mechanism='porta_giro', externa ou interna) vira a
//     engenharia do modelo (door_models.child_module_id), mesma medida,
//     posição e lado de dobradiça. Ver js/module-pieces.js (accKey 'dm:...').
// ==========================================================================
let projectDoorModelsCache = null;
let projectDoorModelsLoading = null;
async function ensureProjectDoorModels() {
  if (projectDoorModelsCache) return projectDoorModelsCache;
  if (projectDoorModelsLoading) return projectDoorModelsLoading;
  projectDoorModelsLoading = (async () => {
    try {
      const { data, error } = await supabaseClient.from('door_models').select('*')
        .eq('active', true).order('sort_order').order('name');
      projectDoorModelsCache = error ? [] : (data || []);
      // nome do modelo por engenharia (module-pieces.js doorModelNameByChild)
      if (typeof doorModelNameByChild !== 'undefined') {
        projectDoorModelsCache.forEach((m) => { if (m.child_module_id) doorModelNameByChild[m.child_module_id] = m.name; });
      }
    } catch (e) { projectDoorModelsCache = []; }
    projectDoorModelsLoading = null;
    return projectDoorModelsCache;
  })();
  return projectDoorModelsLoading;
}

// Modelo efetivo do slot que TROCA alguma coisa (null = Flat/padrão).
function projectSlotDoorModel(slot) {
  if (!slot || !slot.doorModelId || !projectDoorModelsCache) return null;
  const m = projectDoorModelsCache.find((x) => x.id === slot.doorModelId);
  if (!m || !m.child_module_id || m.slug === 'flat') return null;
  return m;
}

// Frente de GAVETA nunca recebe modelo de porta (Matt, 02/10: "frente de
// gaveta não pode receber porta de vidro"). Ela já fica de fora por ser
// door_mechanism='frente_gaveta' (não 'porta_giro'); a trava abaixo é a 2ª
// garantia: só peça 'front' que NÃO desliza (slide_out = frente de gaveta).
function isPortaGiroPiece(p) {
  return !!p && p.kind === 'front' && p.opening_type !== 'slide_out' && isPortaGiroAccKey(p.accKey);
}

function isPortaGiroAccKey(key) {
  const k = (typeof parseDoorModelKey === 'function') ? parseDoorModelKey(key) : null;
  const acc = accessoryCatalogCache && accessoryCatalogCache[k ? k.accKey : key];
  return !!(acc && acc.door_mechanism === 'porta_giro');
}

// Slot tem porta de abrir giro? (decide se o seletor aparece no painel)
function projectSlotHasPortaGiro(slot) {
  return ((slot && slot._layoutGeometry) || []).some((p) => isPortaGiroPiece(p))
    || projectCatalogHingedFronts(slot && slot.pieces).length > 0;
}

// ==========================================================================
// MODELO DE PORTA EM MÓDULO PRONTO (catálogo) — 14/10, Matt, com print do
// "Base Floating Cabinet Doors" (BFH30): "esses modulos prontos nao estou
// conseguindo trocar a porta, modelo de porta".
// A troca acima só enxergava porta do CONSTRUTOR (agregado porta_giro). No
// módulo pronto a porta é uma LINHA do cadastro (module_components) com
// position_role 'front' e abertura de giro (hinge_left/hinge_right). Com um
// modelo escolhido, essa linha vira uma PEÇA-MÓDULO com a engenharia do
// modelo (door_models.child_module_id) — mesma fórmula de medida, mesma
// posição, mesmo papel de cor, mesmo lado de dobradiça, mesmo id de linha
// (peça removida/ajuste manual continuam valendo).
// slot.pieces NÃO muda (é o cadastro cru): a troca entra no ponto único de
// junção projectSlotAllPiecesBeforeRemoval (portal-06b) — preço, 3D, plano
// de corte, furação e pedido saem dali. Flat (padrão) = nada muda.
// Frente de gaveta (slide_out) e basculante nunca entram.
// ==========================================================================
function isCatalogHingedFrontRow(p) {
  return !!p && p.position_role === 'front' && !p._doorModelSwap
    && (p.opening_type === 'hinge_left' || p.opening_type === 'hinge_right');
}
// Portas de giro do cadastro: nível de cima + dentro de peça-módulo que não
// é ela mesma uma frente (ex.: corpo aninhado com a porta dentro).
function projectCatalogHingedFronts(list, out) {
  out = out || [];
  (list || []).forEach((p) => {
    if (!p) return;
    if (isCatalogHingedFrontRow(p)) out.push(p);
    else if (p.is_module && p.position_role !== 'front' && Array.isArray(p.child_pieces)) projectCatalogHingedFronts(p.child_pieces, out);
  });
  return out;
}

function reidDoorModelChildPieces(list, prefix) {
  return (list || []).map((cp) => {
    const baseId = cp.id != null ? cp.id : cp.piece_id;
    const basePieceId = cp.piece_id != null ? cp.piece_id : cp.id;
    const clone = Object.assign({}, cp, {
      id: baseId != null ? prefix + ':' + baseId : cp.id,
      piece_id: basePieceId != null ? prefix + ':' + basePieceId : cp.piece_id
    });
    if (clone.is_module && clone.child_pieces && clone.child_pieces.length) clone.child_pieces = reidDoorModelChildPieces(clone.child_pieces, prefix);
    return clone;
  });
}

// Mesmo shape da peça-módulo de LayoutEngine.toPieceRows (modelo do
// Construtor), só que com as FÓRMULAS da linha original no lugar de mm fixos.
function catalogDoorModelRow(orig, m, ex) {
  const lp = ex.locked_presets || {};
  const hs = ex.own_hinge_slide || {};
  const meta = ex.module_meta || {};
  return {
    id: orig.id,
    seq: orig.seq,
    is_module: true,
    _doorModelSwap: m.id,
    door_model_name: m.name || null,
    reference: orig.reference || meta.name || null,
    component_reference: orig.component_reference || orig.module_name || null,
    position_role: orig.position_role,
    color_role_id: orig.color_role_id || null,
    opening_type: orig.opening_type,
    hinge_side: orig.hinge_side,
    slides_per_unit: 0,
    tilt_angle_deg: 0,
    rotation_y_deg: 0,
    width_formula: orig.width_formula,
    height_formula: orig.height_formula,
    depth_formula: orig.depth_formula,
    offset_x_formula: orig.offset_x_formula || '0',
    offset_y_formula: orig.offset_y_formula || '0',
    offset_z_formula: orig.offset_z_formula || '0',
    quantity: (orig.quantity != null && orig.quantity !== '') ? orig.quantity : 1,
    quantity_configurable: !!orig.quantity_configurable,
    quantity_min: orig.quantity_min,
    quantity_max: orig.quantity_max,
    quantity_default: orig.quantity_default,
    client_optional: !!orig.client_optional,
    client_optional_default_on: !!orig.client_optional_default_on,
    visibility_dimension: orig.visibility_dimension || null,
    visibility_min_mm: orig.visibility_min_mm,
    visibility_max_mm: orig.visibility_max_mm,
    client_dimension_configurable: false,
    client_color_configurable: !!orig.client_color_configurable,
    auto_join_adjacent: false,
    auto_join_explicit: false,
    fixed_depths: ex.fixed_depths || [],
    locked_width_presets: lp.width || [],
    locked_height_presets: lp.height || [],
    locked_depth_presets: lp.depth || [],
    locked_width_preset_options: lp.widthLabeled || [],
    locked_height_preset_options: lp.heightLabeled || [],
    locked_depth_preset_options: lp.depthLabeled || [],
    is_decoration: !!lp.is_decoration,
    // porta do CANTO 90 com dobradiça de 165 (25/10, Matt: "a dobradiça deve
    // ser de 165 e não de 90, e outro modelo deve trocar na estrutura"):
    // trocar o MODELO da porta não pode trazer a dobradiça de 90 do modelo —
    // fica a do módulo (Dobradiça 165, whitelist do canto).
    own_hinge_model: /165/.test(String(orig.reference || '') + ' ' + String(orig.component_reference || '') + ' ' + String(orig.module_name || ''))
      ? (orig.own_hinge_model || hs.hinge || null) : (hs.hinge || null),
    own_slide_model: hs.slide || null,
    own_slide_models: hs.slides || [],
    own_width_min_mm: lp.ownWidthMinMm != null ? lp.ownWidthMinMm : null,
    own_width_max_mm: lp.ownWidthMaxMm != null ? lp.ownWidthMaxMm : null,
    own_height_min_mm: lp.ownHeightMinMm != null ? lp.ownHeightMinMm : null,
    own_height_max_mm: lp.ownHeightMaxMm != null ? lp.ownHeightMaxMm : null,
    own_depth_min_mm: lp.ownDepthMinMm != null ? lp.ownDepthMinMm : null,
    own_depth_max_mm: lp.ownDepthMaxMm != null ? lp.ownDepthMaxMm : null,
    module_name: meta.name || null,
    // id por instância (2 portas iguais não colidem na furação/preço)
    child_pieces: reidDoorModelChildPieces(ex.child_pieces || [], 'dm:' + orig.id)
  };
}

function swapCatalogDoorRows(list, m, ex) {
  let mudou = false;
  const out = (list || []).map((p) => {
    if (!p) return p;
    if (isCatalogHingedFrontRow(p)) { mudou = true; return catalogDoorModelRow(p, m, ex); }
    if (p.is_module && p.position_role !== 'front' && Array.isArray(p.child_pieces)) {
      const filhos = swapCatalogDoorRows(p.child_pieces, m, ex);
      if (filhos !== p.child_pieces) { mudou = true; return Object.assign({}, p, { child_pieces: filhos }); }
    }
    return p;
  });
  return mudou ? out : list;
}

// Cache por array de cadastro (slot.pieces só é trocado inteiro: SKU/repoint)
// — esta função roda em todo desenho/preço.
const catalogDoorSwapCache = new WeakMap();
function applySlotDoorModelToCatalogPieces(slot, pieces) {
  if (!Array.isArray(pieces)) return pieces;
  const m = projectSlotDoorModel(slot);
  const ex = m && doorModelExtrasCache[m.child_module_id];
  if (!m || !ex) return pieces;                       // Flat / engenharia carregando
  const hit = catalogDoorSwapCache.get(pieces);
  if (hit && hit.modelId === m.id && hit.ex === ex) return hit.out;
  const out = swapCatalogDoorRows(pieces, m, ex);
  catalogDoorSwapCache.set(pieces, { modelId: m.id, ex, out });
  return out;
}

// Medida (w/h) das portas de giro do cadastro no tamanho atual do slot — pro
// limite do modelo (vidro: 2600 de altura / 700 de largura). Só o nível de
// cima (porta dentro de corpo aninhado fica sem trava, caso raro).
function slotCatalogHingedFrontDims(slot) {
  let h = 0, w = 0;
  const raw = (slot && slot.pieces) || [];
  const W = Number(slot.width_mm) || 0, H = Number(slot.height_mm) || 0, D = Number(slot.depth_mm) || 0;
  // Só a porta que EXISTE nesta medida (15/10, Matt com o BFH42: "por que
  // essa limitação da porta de vidro?"). "Porta (1 folha)" só aparece até
  // 600 mm (visibilidade condicional) — mas entrava na conta mesmo no módulo
  // de 42", calculada com a largura inteira (~1060 mm > 700 do vidro), e
  // bloqueava o modelo com 2 folhas de ~530 mm.
  const visivel = (p) => typeof Pricing === 'undefined' || !Pricing.isPieceVisible || Pricing.isPieceVisible(p, { W, H, D });
  const fronts = raw.filter((p) => isCatalogHingedFrontRow(p) && visivel(p));
  if (!fronts.length || typeof Pricing === 'undefined') return { h, w };
  let body = { W, H, D };
  let E = 19.5;
  try { body = Pricing.resolveBodyDims(raw, { W, H, D }).bodyDims || body; } catch (e) { /* usa o slot */ }
  try { E = Number(Pricing.cascoThicknessMm(raw, slot.colorsByRole || {}, slot.pieceColorOverrides)) || E; } catch (e) { /* padrão */ }
  fronts.forEach((p) => {
    try {
      const d = Pricing.calculatePiece(p, body, undefined, undefined, { E });
      h = Math.max(h, Number(d.height_mm) || 0);
      w = Math.max(w, Number(d.width_mm) || 0);
    } catch (e) { /* fórmula com variável de vizinho: ignora */ }
  });
  return { h, w };
}

// Troca (ou destroca) o accKey das portas de abrir giro conforme o modelo do
// slot. Engenharia ainda não carregada = fica Flat por enquanto (o seletor
// carrega e recalcula). Sem porta de giro / sem módulo-pieces novo: devolve
// o MESMO array.
function applySlotDoorModelToPieces(slot, pieces) {
  if (typeof parseDoorModelKey !== 'function' || !Array.isArray(pieces)) return pieces;
  const m = projectSlotDoorModel(slot);
  const alvo = (m && doorModelExtrasCache[m.child_module_id]) ? m.child_module_id : null;
  let mudou = false;
  const out = pieces.map((p) => {
    if (!p || !p.accKey) return p;
    const k = parseDoorModelKey(p.accKey);
    const orig = k ? k.accKey : p.accKey;
    if (!k && !alvo) return p;                 // Flat e peça nunca trocada: intocada
    if (!isPortaGiroPiece(Object.assign({}, p, { accKey: orig }))) return p;
    const novo = alvo ? doorModelKey(alvo, orig) : orig;
    if (novo === p.accKey) return p;
    mudou = true;
    return Object.assign({}, p, { accKey: novo });
  });
  return mudou ? out : pieces;
}

// Cores dos papéis PRÓPRIOS do modelo (ex.: "Perfil alumínio", "Vidro") —
// as opções vêm do module_colors do módulo de engenharia; a 1ª entra como
// escolhida se o slot ainda não tem cor nesse papel.
function applySlotDoorModelColors(slot) {
  const m = projectSlotDoorModel(slot);
  const ex = m && doorModelExtrasCache[m.child_module_id];
  if (!ex || !ex.color_options_by_role) return;
  slot.colorOptionsByRole = slot.colorOptionsByRole || {};
  Object.keys(ex.color_options_by_role).forEach((roleId) => {
    const opts = ex.color_options_by_role[roleId] || [];
    if (!opts.length) return;
    slot.colorOptionsByRole[roleId] = opts;
    const atual = (slot.colorsByRole || {})[roleId];
    if (!atual || !opts.some((c) => c.id === atual.id)) applyColorToProjectSlot(slot, roleId, opts[0]);
  });
}

// LIMITE DE MEDIDA DO MODELO (Matt, 02/10: "se passar de 2600mm de altura a
// opção de trocar para porta de vidro deve ser bloqueada, se já tiver sido
// escolhida deve travar na altura da porta"). O limite é o do PRÓPRIO módulo
// de engenharia (modules.height_max_mm / width_max_mm — Glass: 2600 / 700),
// comparado com cada folha de porta de giro do slot.
function doorModelLimits(m) {
  const ex = m && m.child_module_id && doorModelExtrasCache[m.child_module_id];
  if (!ex) return null;
  const lp = ex.locked_presets || {};
  const maxH = Number(lp.ownHeightMaxMm), maxW = Number(lp.ownWidthMaxMm);
  return { maxH: maxH > 0 ? maxH : Infinity, maxW: maxW > 0 ? maxW : Infinity };
}
function slotPortaGiroMaxDims(slot) {
  let h = 0, w = 0;
  ((slot && slot._layoutGeometry) || []).forEach((p) => {
    if (!isPortaGiroPiece(p)) return;
    h = Math.max(h, Number(p.h) || 0);
    w = Math.max(w, Number(p.w) || 0);
  });
  // + portas do cadastro (módulo pronto, 14/10)
  const c = slotCatalogHingedFrontDims(slot);
  return { h: Math.max(h, c.h), w: Math.max(w, c.w) };
}
// Motivo pra NÃO deixar escolher o modelo neste slot (null = pode).
function slotDoorModelBlock(slot, m) {
  const lim = doorModelLimits(m);
  if (!lim) return null;
  const d = slotPortaGiroMaxDims(slot);
  if (d.h > lim.maxH + 0.5) return { eixo: 'h', mm: lim.maxH };
  if (d.w > lim.maxW + 0.5) return { eixo: 'w', mm: lim.maxW };
  return null;
}
// Com o modelo JÁ escolhido: a altura do módulo trava onde a porta chega no
// limite. Roda dentro do recálculo (funil de toda mudança de medida — campo,
// seta de esticar, SKU), logo depois do rebuild das peças.
function enforceSlotDoorModelHeight(slot) {
  slot._doorModelHeightLocked = false;
  slot._doorModelWidthLocked = false;
  const m = projectSlotDoorModel(slot);
  const lim = doorModelLimits(m);
  if (!lim) return;
  // LARGURA TAMBÉM TRAVA (15/10, Matt: "se eu reduzir o móvel, colocar porta
  // de vidro e aumentar o móvel, ele aceita — força usar a porta mesmo não
  // podendo"). Antes só a altura travava. A folha cresce junto com o módulo
  // (1 folha) ou com metade dele (2 folhas): encolhe o módulo até a folha
  // caber, proporcional (o mesmo excesso por folha × nº de folhas na largura,
  // estimado pela razão módulo/folha).
  if (isFinite(lim.maxW)) {
    for (let i = 0; i < 4; i++) {
      const d = slotPortaGiroMaxDims(slot);
      if (!(d.w > lim.maxW + 0.5) || !(d.w > 0)) break;
      const W0 = Number(slot.width_mm) || 0;
      const folhas = Math.max(1, Math.round(W0 / d.w));
      const minW = Number(slot.module && slot.module.width_min_mm) || 0;
      const novo = Math.max(W0 - (d.w - lim.maxW) * folhas, minW);
      if (!(novo < W0)) break;
      slot.width_mm = Math.floor(novo * 10) / 10;
      slot._doorModelWidthLocked = true;
      rebuildProjectSlotLayoutPieces(slot);
    }
  }
  if (!isFinite(lim.maxH)) return;
  for (let i = 0; i < 3; i++) {
    const d = slotPortaGiroMaxDims(slot);
    if (!(d.h > lim.maxH + 0.5)) break;
    const minH = Number(slot.module && slot.module.height_min_mm) || 0;
    const novo = Math.max(Number(slot.height_mm) - (d.h - lim.maxH), minH);
    if (!(novo < Number(slot.height_mm))) break;
    slot.height_mm = Math.floor(novo * 10) / 10;
    slot._doorModelHeightLocked = true;
    rebuildProjectSlotLayoutPieces(slot);
  }
  if (!slot._doorModelHeightLocked) {
    const d = slotPortaGiroMaxDims(slot);
    slot._doorModelHeightLocked = d.h >= lim.maxH - 0.5;
  }
}

// Clique no cartão do modelo (painel do módulo). modelId null/Flat = volta
// pra porta original do módulo e limpa os papéis de cor que eram só do modelo.
// opts.lote (troca em massa, setAllProjectDoorModels): sem undo/redesenho
// por slot — quem chama faz uma vez só. Devolve 'bloq' se a porta é grande
// demais pro modelo.
async function setProjectSlotDoorModel(slot, modelId, opts) {
  if (!slot) return;
  const lote = !!(opts && opts.lote);
  await ensureProjectDoorModels();
  const m = (projectDoorModelsCache || []).find((x) => x.id === modelId) || null;
  const anterior = projectSlotDoorModel(slot);
  if (!lote && typeof pushProjectUndoState === 'function') pushProjectUndoState();
  if (m && m.child_module_id && m.slug !== 'flat') {
    try { await loadDoorModelExtras(m.child_module_id); } catch (e) { console.error('[modelo de porta]', e); return; }
    if (slotDoorModelBlock(slot, m)) { if (!lote) renderProjectConfigPanel(); return 'bloq'; }   // porta grande demais pro modelo
    slot.doorModelId = m.id;
  } else {
    slot.doorModelId = null;
  }
  // papéis que eram só do modelo anterior (e não do módulo) saem do slot
  const exAnt = anterior && doorModelExtrasCache[anterior.child_module_id];
  const novo = projectSlotDoorModel(slot);
  const exNovo = novo && doorModelExtrasCache[novo.child_module_id];
  if (exAnt && exAnt.color_options_by_role) {
    const doModulo = collectUsedColorRoleIds(slot.pieces || []);
    Object.keys(exAnt.color_options_by_role).forEach((roleId) => {
      if (doModulo.has(roleId)) return;
      if (exNovo && exNovo.color_options_by_role && exNovo.color_options_by_role[roleId]) return;
      if (slot.colorsByRole) delete slot.colorsByRole[roleId];
      if (slot.colorOptionsByRole) delete slot.colorOptionsByRole[roleId];
      slot.selectedColors = (slot.selectedColors || []).filter((sc) => sc.role_id !== roleId);
    });
  }
  // Módulo pronto não passa por projectLayoutRowsForSlot (sem Construtor):
  // as cores próprias do modelo (perfil/vidro) entram aqui.
  try { applySlotDoorModelColors(slot); } catch (e) { /* ok */ }
  try { recomputeProjectSlotPricing(slot); } catch (e) { console.error('[modelo de porta] preço:', e); }
  if (lote) return 'ok';
  renderProjectCanvas();
  renderProjectConfigPanel();
  markProjectDirty();
}

/* TROCA RÁPIDA DE MODELO (2026-10-15, Matt: "quando não tem nada clicado,
   quero poder trocar o modelo de porta e de gaveta, assim como aparece pra
   mudar cores"). Aplica em TODO módulo do ambiente que tem porta de giro /
   gaveta trocável. Um undo só. Devolve quantos ficaram de fora (bloqueio). */
async function setAllProjectDoorModels(modelId) {
  await ensureProjectDoorModels();
  const alvos = (projectSlots || []).filter((s) => projectSlotHasPortaGiro(s));
  if (!alvos.length) return 0;
  if (typeof pushProjectUndoState === 'function') pushProjectUndoState();
  let bloq = 0;
  for (const s of alvos) {
    try { if ((await setProjectSlotDoorModel(s, modelId, { lote: true })) === 'bloq') bloq += 1; }
    catch (e) { console.error('[troca de modelo de porta]', e); }
  }
  renderProjectCanvas();
  renderProjectConfigPanel();
  markProjectDirty();
  return bloq;
}
async function setAllProjectDrawerModels(modelId) {
  await ensureProjectDrawerModels();
  const alvos = (projectSlots || []).filter((s) => projectSlotHasDrawerBody(s));
  if (!alvos.length) return;
  if (typeof pushProjectUndoState === 'function') pushProjectUndoState();
  for (const s of alvos) {
    try { await setProjectSlotDrawerModel(s, modelId, { lote: true }); }
    catch (e) { console.error('[troca de modelo de gaveta]', e); }
  }
  renderProjectCanvas();
  renderProjectConfigPanel();
  markProjectDirty();
}

// ==========================================================================
// MODELO DE GAVETA no projeto (migration 203, 2026-10-15). Matt: "preciso um
// novo corpo de gaveta como modelo. assim como funcionam as portas
// glass/shaker... hardwood dovetail... usar mesma corrediça. só muda corpo."
//   slot.drawerModelId = null  -> Standard (padrão): NADA muda.
//   slot.drawerModelId = <id>  -> toda gaveta do slot (Construtor E módulo
//     pronto) troca o caixote fabricado pela engenharia do modelo
//     (drawer_models.child_module_id). A troca mora em js/module-pieces.js
//     (applyDrawerModelToPieces — o ERP usa a mesma) e entra no ponto único
//     de junção projectSlotAllPiecesBeforeRemoval (portal-06b): preço, 3D,
//     plano de corte, furação e pedido saem dali.
// ==========================================================================
let projectDrawerModelsCache = null;
let projectDrawerModelsLoading = null;
async function ensureProjectDrawerModels() {
  if (projectDrawerModelsCache) return projectDrawerModelsCache;
  if (projectDrawerModelsLoading) return projectDrawerModelsLoading;
  projectDrawerModelsLoading = (async () => {
    try {
      const { data, error } = await supabaseClient.from('drawer_models').select('*')
        .eq('active', true).order('sort_order').order('name');
      projectDrawerModelsCache = error ? [] : (data || []);   // sem a migration 203 = sem seletor
    } catch (e) { projectDrawerModelsCache = []; }
    projectDrawerModelsLoading = null;
    return projectDrawerModelsCache;
  })();
  return projectDrawerModelsLoading;
}

// Modelo efetivo do slot que TROCA alguma coisa (null = Standard/padrão).
function projectSlotDrawerModel(slot) {
  if (!slot || !slot.drawerModelId || !projectDrawerModelsCache) return null;
  const m = projectDrawerModelsCache.find((x) => x.id === slot.drawerModelId);
  if (!m || !m.child_module_id) return null;
  return m;
}

// Aplica no array (cadastro OU linhas do Construtor). Engenharia ainda não
// carregada = fica Standard por enquanto (o seletor/hydrate carrega e
// recalcula). Standard = o MESMO array.
function applySlotDrawerModel(slot, pieces) {
  if (typeof applyDrawerModelToPieces !== 'function') return pieces;
  const m = projectSlotDrawerModel(slot);
  const ex = m && doorModelExtrasCache[m.child_module_id];
  return (m && ex) ? applyDrawerModelToPieces(pieces, m, ex) : pieces;
}

// Slot tem gaveta trocável? (decide se o seletor aparece no painel)
function projectSlotHasDrawerBody(slot) {
  if (!slot || typeof piecesHaveDrawerBody !== 'function') return false;
  return piecesHaveDrawerBody(slot.pieces) || piecesHaveDrawerBody(slot.layoutPieces);
}

// Clique no cartão do modelo de gaveta. modelId null = volta pro Standard.
async function setProjectSlotDrawerModel(slot, modelId, opts) {
  if (!slot) return;
  const lote = !!(opts && opts.lote);
  await ensureProjectDrawerModels();
  const m = (projectDrawerModelsCache || []).find((x) => x.id === modelId) || null;
  if (!lote && typeof pushProjectUndoState === 'function') pushProjectUndoState();
  if (m && m.child_module_id) {
    try { await loadDoorModelExtras(m.child_module_id); } catch (e) { console.error('[modelo de gaveta]', e); return; }
    slot.drawerModelId = m.id;
  } else {
    slot.drawerModelId = null;
  }
  try { recomputeProjectSlotPricing(slot); } catch (e) { console.error('[modelo de gaveta] preço:', e); }
  if (lote) return;
  renderProjectCanvas();
  renderProjectConfigPanel();
  markProjectDirty();
}

// ==========================================================================
// PUXADORES (2026-11-13) — slot.handle = { itemId, doorPos, drawerPos }.
// Catálogo = itens comprados kind 'puxador' (window.__legnoHandleModels,
// portal-01). Entra no MESMO ponto de junção do LED (portal-06b
// projectSlotEffectivePiecesWithLeds) via applySlotHandle; a conta e o
// desenho moram em js/module-pieces.js (applyHandleConfigDeep).
//   doorPos: 'auto' | 'top' | 'bottom' | 'middle'   (auto = pela altura do
//     módulo no ambiente: aéreo embaixo, torre no meio, base em cima)
//   drawerPos: 'center' | 'top'
// ==========================================================================
function projectHandleModels() { return (typeof window !== 'undefined' && window.__legnoHandleModels) || []; }
// PUXADORES SEPARADOS POR TIPO E TAMANHO (2026-11-15, Matt: "separar os
// puxadores por knob, e tamanhos... pra visualizar melhor"). Grupos na ordem:
// Knobs (tudo que não é barra), depois as alças por entre-furos crescente
// (128, 160, 320...). Dentro do grupo fica a ordem do cadastro.
function projectHandleGroups() {
  const todos = projectHandleModels();
  const knobs = todos.filter((m) => m.tipo !== 'barra');
  // PUXADOR DE BORDA (fixado por trás): grupo próprio, depois das alças
  const deBorda = todos.filter((m) => m.formato === 'borda');
  const porMm = {};
  todos.filter((m) => m.tipo === 'barra' && m.formato !== 'borda').forEach((m) => {
    const mm = Math.round(Number(m.entre_furos_mm) || 0);
    (porMm[mm] = porMm[mm] || []).push(m);
  });
  const grupos = [];
  if (knobs.length) grupos.push({ titulo: I18n.t('project.handle_group_knobs'), modelos: knobs });
  Object.keys(porMm).map(Number).sort((a, b) => a - b).forEach((mm) => {
    grupos.push({ titulo: I18n.t('project.handle_group_pull', { mm }), modelos: porMm[mm] });
  });
  if (deBorda.length) grupos.push({ titulo: I18n.t('project.handle_group_edge'), modelos: deBorda });
  return grupos;
}
// HTML dos grupos: um título por grupo e os cartões embaixo. `cartao(m)` = HTML
// de um modelo; `antes` = HTML que entra na frente do 1º grupo (ex.: "Sem puxador").
function projectHandleGroupsHtml(cartao, antes) {
  const grupos = projectHandleGroups();
  return (antes ? '<div class="po-proj-door-model-cards">' + antes + '</div>' : '')
    + grupos.map((gr) => '<div class="po-proj-handle-grupo"><span class="po-proj-handle-grupo-titulo">' + escapeHtmlCutlist(gr.titulo) + ' · ' + gr.modelos.length + '</span>'
      + '<div class="po-proj-door-model-cards">' + gr.modelos.map(cartao).join('') + '</div></div>').join('');
}
function projectSlotHandleCfg(slot) {
  const h = slot && slot.handle;
  if (!h) return null;
  const limpo = (m) => { const c = Object.assign({}, m); delete c.foto_url; return c; }; // foto é só da interface
  const m = h.itemId ? projectHandleModels().find((x) => x.item_id === h.itemId) : null;
  // puxador só de UMA frente (duplo clique na porta): h.porPeca = { pieceId: itemId | '' }
  let porPeca = null;
  Object.keys(h.porPeca || {}).forEach((pid) => {
    const v = h.porPeca[pid];
    const mm = v ? projectHandleModels().find((x) => x.item_id === v) : null;
    if (v && !mm) return;            // item sumiu do catálogo: vale o do módulo
    porPeca = porPeca || {};
    porPeca[pid] = mm ? limpo(mm) : null;
  });
  if (!m && !porPeca) return null;
  let door = h.doorPos || 'auto';
  if (door === 'auto') {
    const chao = Number(slot.floor_height_mm) || 0, H = Number(slot.height_mm) || 0;
    door = chao >= 900 ? 'bottom' : (H >= 1500 ? 'middle' : 'top');
  }
  const cfg = Object.assign({}, m ? limpo(m) : { item_id: null }, { door_pos: door, drawer_pos: h.drawerPos || 'center',
    door_orient: h.doorOrient || 'auto', drawer_orient: h.drawerOrient || 'auto',
    // 2 knobs por gaveta: a conta de "é knob" é feita por frente (handleQtyOnFront)
    drawer_qty: String(h.drawerQty) === '2' ? 2 : 1 });
  if (porPeca) cfg.por_peca = porPeca;
  return cfg;
}
// Modelo de porta do módulo é de vidro? (não leva puxador pela frente)
function projectSlotDoorModelIsGlass(slot) {
  try {
    const m = (typeof projectSlotDoorModel === 'function') ? projectSlotDoorModel(slot) : null;
    return !!(m && /(vidro|glass|cristal)/i.test([m.name, m.slug, m.preview].filter(Boolean).join(' ')));
  } catch (e) { return false; }
}
function applySlotHandle(slot, pieces) {
  if (typeof applyHandleConfigDeep !== 'function') return pieces;
  const cfg = projectSlotHandleCfg(slot);
  return cfg ? applyHandleConfigDeep(pieces, cfg) : pieces;
}
function projectSlotHasHandleFront(slot) {
  if (!slot || typeof piecesHaveHandleFront !== 'function') return false;
  // já com o modelo de porta aplicado (porta de vidro não conta — some o seletor)
  try { if (typeof projectSlotAllPiecesBeforeRemoval === 'function') return piecesHaveHandleFront(projectSlotAllPiecesBeforeRemoval(slot)); } catch (e) { /* cai no cru */ }
  return piecesHaveHandleFront(slot.pieces) || piecesHaveHandleFront(slot.layoutPieces);
}
// patch = { itemId?, doorPos?, drawerPos? }. itemId '' = sem puxador.
function setProjectSlotHandle(slot, patch, opts) {
  if (!slot) return;
  const lote = !!(opts && opts.lote);
  if (!lote && typeof pushProjectUndoState === 'function') pushProjectUndoState();
  const atual = Object.assign({ itemId: null, doorPos: 'auto', drawerPos: 'center' }, slot.handle || {}, patch || {});
  slot.handle = (atual.itemId || (atual.porPeca && Object.keys(atual.porPeca).length)) ? atual : null;
  try { recomputeProjectSlotPricing(slot); } catch (e) { console.error('[puxador] preço:', e); }
  if (lote) return;
  renderProjectCanvas();
  renderProjectConfigPanel();
  markProjectDirty();
}
// Puxador só de UMA frente (duplo clique na porta/frente). itemId: id do item,
// '' = esta frente sem puxador, undefined = volta a seguir o módulo.
function setProjectSlotPieceHandle(slot, pieceId, itemId) {
  if (!slot || pieceId == null) return;
  const mapa = Object.assign({}, (slot.handle && slot.handle.porPeca) || {});
  if (itemId === undefined) delete mapa[pieceId]; else mapa[pieceId] = itemId || '';
  setProjectSlotHandle(slot, { porPeca: mapa });
}
// Painel sem módulo selecionado: o mesmo puxador em TODOS os módulos que têm
// porta ou gaveta (posição/sentido/quantidade de cada módulo ficam; os
// puxadores trocados porta a porta são zerados — "todos" é todos).
function setAllProjectHandles(itemId) {
  if (typeof pushProjectUndoState === 'function') pushProjectUndoState();
  projectSlots.forEach((s) => {
    if (!projectSlotHasHandleFront(s)) return;
    setProjectSlotHandle(s, { itemId: itemId || null, porPeca: {} }, { lote: true });
  });
  renderProjectCanvas();
  renderProjectConfigPanel();
  markProjectDirty();
  try { renderProjectSummary(); } catch (e) { /* ok */ }
}
// "Aplicar em todos": copia o puxador deste módulo pra todo módulo do projeto
// que tem porta ou gaveta (posição da porta volta pro automático de cada um).
function applyProjectSlotHandleToAll(slot) {
  if (!slot) return;
  if (typeof pushProjectUndoState === 'function') pushProjectUndoState();
  const base = slot.handle || null;
  projectSlots.forEach((s) => {
    if (s === slot || !projectSlotHasHandleFront(s)) return;
    setProjectSlotHandle(s, base ? { itemId: base.itemId, doorPos: 'auto', drawerPos: base.drawerPos || 'center', doorOrient: base.doorOrient || 'auto', drawerOrient: base.drawerOrient || 'auto', drawerQty: base.drawerQty || '1' } : { itemId: null }, { lote: true });
  });
  renderProjectCanvas();
  renderProjectConfigPanel();
  markProjectDirty();
  try { renderProjectSummary(); } catch (e) { /* ok */ }
}
// Miniatura do cartão: o puxador na cor dele (ou o "sem puxador").
// FOTOS REAIS dos puxadores (14/11) — embutidas aqui de propósito: arquivo
// novo em assets/ não sobe com o subir.bat (git add -u) e as fotos ficavam
// de fora. Chave = código do item comprado. Puxador novo: attrs.foto_url no
// cadastro, ou acrescentar aqui.
const HANDLE_FOTOS = {
 "PUX-ASTI-BARRA-128-BK": "data:image/jpeg;base64,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",
 "PUX-KNOB-OVAL-GD": "data:image/jpeg;base64,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",
 "PUX-KNOB-OVAL-BK": "data:image/jpeg;base64,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",
 "PUX-BARRA-160-GD": "data:image/jpeg;base64,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",
 "PUX-BARRA-160-BK": "data:image/jpeg;base64,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",
 "PUX-PEARL-KNOB-GD": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/6xaJSlACEQAAAAEAABZ/anVtYgAAAB5qdW1kYzJwYQARABCAAACqADibcQNjMnBhAAAAFllqdW1iAAAAR2p1bWRjMm1hABEAEIAAAKoAOJtxA3VybjpjMnBhOjZjN2U5ZjlhLWU5NWItNDFkMi1iMDVjLTUyMTZlNzZlOGVjNQAAAAOUanVtYgAAAClqdW1kYzJhcwARABCAAACqADibcQNjMnBhLmFzc2VydGlvbnMAAAAAuWp1bWIAAABEanVtZGNib3IAEQAQgAAAqgA4m3ETYzJwYS5pbmdyZWRpZW50LnYzAAAAABhjMnNoEICJlENwUk+EaofdDWs3hQAAAG1jYm9yo2lkYzpmb3JtYXRqaW1hZ2UvanBlZ2ppbnN0YW5jZUlEeCx4bXA6aWlkOmM3ZjJhY2UwLTgzOWYtNGU3Yy1hZTY2LTVkMzJiNmNiNGVlMGxyZWxhdGlvbnNoaXBocGFyZW50T2YAAAHianVtYgAAAEFqdW1kY2JvcgARABCAAACqADibcRNjMnBhLmFjdGlvbnMudjIAAAAAGGMyc2h3d5J0Vj/rbVMDYhBMtFNEAAABmWNib3KiZ2FjdGlvbnOComZhY3Rpb25rYzJwYS5vcGVuZWRqcGFyYW1ldGVyc6FraW5ncmVkaWVudHOBomN1cmx4LXNlbGYjanVtYmY9YzJwYS5hc3NlcnRpb25zL2MycGEuaW5ncmVkaWVudC52M2RoYXNoWCD0rIEE1ukpHPyWc9znVxBCbqCGHqnEzOZ8ij7HzyTw56RmYWN0aW9ueB1jb20uYW50aHJvcGljLmNsYXVkZS5wcm92aWRlZGpwYXJhbWV0ZXJzoXgfY29tLmFudGhyb3BpYy5vcmlnaW4tY29uZmlkZW5jZWd1bmtub3dua2Rlc2NyaXB0aW9ueGZDbGF1ZGUgcHJvdmlkZWQgdGhpcyBmaWxlIGF0IHRoZSByZXF1ZXN0IG9mIGEgdXNlciBhbmQgbWF5IGhhdmUgY3JlYXRlZCBvciBtb2RpZmllZCB0aGUgZmlsZSBjb250ZW50cy5tc29mdHdhcmVBZ2VudKFkbmFtZWZDbGF1ZGVyYWxsQWN0aW9uc0luY2x1ZGVk9QAAAMhqdW1iAAAAQGp1bWRjYm9yABEAEIAAAKoAOJtxE2MycGEuaGFzaC5kYXRhAAAAABhjMnNosJ9rFgf021wChCKyEnJDIAAAAIBjYm9ypWNhbGdmc2hhMjU2Y3BhZE4AAAAAAAAAAAAAAAAAAGRoYXNoWCAwuouQHsV8a45qSCvPAqwNVlVkC245bc3U2JGscd2jUmRuYW1lbmp1bWJmIG1hbmlmZXN0amV4Y2x1c2lvbnOBomVzdGFydBRmbGVuZ3RoGRaLAAACPmp1bWIAAAAnanVtZGMyY2wAEQAQgAAAqgA4m3EDYzJwYS5jbGFpbS52MgAAAAIPY2JvcqVjYWxnZnNoYTI1NmlzaWduYXR1cmV4TXNlbGYjanVtYmY9L2MycGEvdXJuOmMycGE6NmM3ZTlmOWEtZTk1Yi00MWQyLWIwNWMtNTIxNmU3NmU4ZWM1L2MycGEuc2lnbmF0dXJlamluc3RhbmNlSUR4LHhtcDppaWQ6OTIyZTI0YzYtMDNkYi00OGYxLWFhNDItYjhiMjY0YjYzZWY0cmNyZWF0ZWRfYXNzZXJ0aW9uc4OiY3VybHgtc2VsZiNqdW1iZj1jMnBhLmFzc2VydGlvbnMvYzJwYS5pbmdyZWRpZW50LnYzZGhhc2hYIPSsgQTW6Skc/JZz3OdXEEJuoIYeqcTM5nyKPsfPJPDnomN1cmx4KnNlbGYjanVtYmY9YzJwYS5hc3NlcnRpb25zL2MycGEuYWN0aW9ucy52MmRoYXNoWCB8FS95JWw2tumEYx7e12r1aVkPj7N4OyaKcDT2JeO3hqJjdXJseClzZWxmI2p1bWJmPWMycGEuYXNzZXJ0aW9ucy9jMnBhLmhhc2guZGF0YWRoYXNoWCCMSW0P5a0ekuKuiSEiTJe2Y6yzsR9oRaLdNFqEuULS1XRjbGFpbV9nZW5lcmF0b3JfaW5mb6NkbmFtZW9BbnRocm9waWMgRmlsZXNndmVyc2lvbmUxLjAuMGtzcGVjVmVyc2lvbmUyLjQuMAAAEDhqdW1iAAAAKGp1bWRjMmNzABEAEIAAAKoAOJtxA2MycGEuc2lnbmF0dXJlAAAAEAhjYm9y0oRZAhKiASYYIVkCCjCCAgYwggGNoAMCAQICFEDloAruwjnQvriD+gZCBT1nVRMAMAoGCCqGSM49BAMDMEkxFzAVBgNVBAoTDkFudGhyb3BpYywgUEJDMS4wLAYDVQQDEyVBbnRocm9waWMgQ29udGVudCBDcmVkZW50aWFscyBSb290IENBMB4XDTI2MDgwNzE4NDM1NloXDTI4MDgwNjE5NDM1NlowRDEXMBUGA1UEChMOQW50aHJvcGljLCBQQkMxKTAnBgNVBAMTIEFudGhyb3BpYyBDbGF1ZGUgQ29udGVudCBTaWduaW5nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEmHoKa8tQGAUU1TS9QqU5W0Tp2N3XsvlK7BfQt6YWKwEzd2R3/dzKPEUDdCjlLjp9fT+KFjRVnuZ9v0oXvTe3k6NYMFYwDgYDVR0PAQH/BAQDAgeAMBUGA1UdJQQOMAwGCisGAQQBg+heAgEwDAYDVR0TAQH/BAIwADAfBgNVHSMEGDAWgBTOUeIEgU5kWyP448TPmj6cwddcwjAKBggqhkjOPQQDAwNnADBkAjAxcx0UngF60stVjs5G4T2eiptsBk5mf9oCtfJPAUBl8qs/PEXa8+gk1/X5QJ2DVcYCMHBfXN31YapiSqYvlIWrDVDJKOvXMl+kkz37Wt0PBI8sw486Mq6JeOhT+lRR4b1HCaFjcGFkWQ2eAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA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",
 "PUX-TURIM-BARRA-128-GD": "data:image/jpeg;base64,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2auWEZRsUwPSV+6PpS0ifcH0paYgooooAKKKKACkK5paKAImhzTTb1PRQBWNrntTDZZ7CrlFKwFFrA/3RTDpp/uj860aKLAZbaW390fnTP7Jf+6PzrXoosO5ito8h/hX86adFkP8A/OtzFGKLBcwG0OU/wDLMfmKYdAm7Rj8xXRYFGBRYLnNnw9Oeka/99CmN4duD/yzX/voV0+BRgelFgucsfDdz2jX/voU0+G7r/nmv/fQrq8Ck2iiwXOSPhq8/wCea/8AfYpp8MXh/wCWSn/gYrr8UuKLAccPC95/zyX/AL7FWIfDt0hyY1H/AAKupxRimIRRhR9KWiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAP/9k=",
 "PUX-TURIM-KNOB-GD": "data:image/jpeg;base64,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",
 "PUX-ROVERO-KNOB-BR": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/6xaJSlACEQAAAAEAABZ/anVtYgAAAB5qdW1kYzJwYQARABCAAACqADibcQNjMnBhAAAAFllqdW1iAAAAR2p1bWRjMm1hABEAEIAAAKoAOJtxA3VybjpjMnBhOmRlNGQwM2M3LWIxMDgtNDA0Yi1hMzlmLTRjOWI2MzI1MTIxNwAAAAOUanVtYgAAAClqdW1kYzJhcwARABCAAACqADibcQNjMnBhLmFzc2VydGlvbnMAAAAAuWp1bWIAAABEanVtZGNib3IAEQAQgAAAqgA4m3ETYzJwYS5pbmdyZWRpZW50LnYzAAAAABhjMnNoUzFLgWjtVAewk2RNud4aTQAAAG1jYm9yo2lkYzpmb3JtYXRqaW1hZ2UvanBlZ2ppbnN0YW5jZUlEeCx4bXA6aWlkOmE5NDgwMzU0LWRkNzAtNGUyYS04YTA1LTQ3Mjg4NGFmZjcyNmxyZWxhdGlvbnNoaXBocGFyZW50T2YAAAHianVtYgAAAEFqdW1kY2JvcgARABCAAACqADibcRNjMnBhLmFjdGlvbnMudjIAAAAAGGMyc2hXI5O5rkAjdi1mfAHPxn+VAAABmWNib3KiZ2FjdGlvbnOComZhY3Rpb25rYzJwYS5vcGVuZWRqcGFyYW1ldGVyc6FraW5ncmVkaWVudHOBomN1cmx4LXNlbGYjanVtYmY9YzJwYS5hc3NlcnRpb25zL2MycGEuaW5ncmVkaWVudC52M2RoYXNoWCAKV4BjKEStxbWSSgEmP0Sua8HQp2ONjmzg9jtugy9ikaRmYWN0aW9ueB1jb20uYW50aHJvcGljLmNsYXVkZS5wcm92aWRlZGpwYXJhbWV0ZXJzoXgfY29tLmFudGhyb3BpYy5vcmlnaW4tY29uZmlkZW5jZWd1bmtub3dua2Rlc2NyaXB0aW9ueGZDbGF1ZGUgcHJvdmlkZWQgdGhpcyBmaWxlIGF0IHRoZSByZXF1ZXN0IG9mIGEgdXNlciBhbmQgbWF5IGhhdmUgY3JlYXRlZCBvciBtb2RpZmllZCB0aGUgZmlsZSBjb250ZW50cy5tc29mdHdhcmVBZ2VudKFkbmFtZWZDbGF1ZGVyYWxsQWN0aW9uc0luY2x1ZGVk9QAAAMhqdW1iAAAAQGp1bWRjYm9yABEAEIAAAKoAOJtxE2MycGEuaGFzaC5kYXRhAAAAABhjMnNoB59ksr3dVWGMhFS0VzttTwAAAIBjYm9ypWNhbGdmc2hhMjU2Y3BhZE4AAAAAAAAAAAAAAAAAAGRoYXNoWCCNgaRENzKLYrUo2+lWCaapgaxstiEf813orRGE1K2zZGRuYW1lbmp1bWJmIG1hbmlmZXN0amV4Y2x1c2lvbnOBomVzdGFydBRmbGVuZ3RoGRaLAAACPmp1bWIAAAAnanVtZGMyY2wAEQAQgAAAqgA4m3EDYzJwYS5jbGFpbS52MgAAAAIPY2JvcqVjYWxnZnNoYTI1NmlzaWduYXR1cmV4TXNlbGYjanVtYmY9L2MycGEvdXJuOmMycGE6ZGU0ZDAzYzctYjEwOC00MDRiLWEzOWYtNGM5YjYzMjUxMjE3L2MycGEuc2lnbmF0dXJlamluc3RhbmNlSUR4LHhtcDppaWQ6ZDBiYTE2YTMtOWZhZC00YzIxLWJlOTctMmJjZTZlM2IzMDlicmNyZWF0ZWRfYXNzZXJ0aW9uc4OiY3VybHgtc2VsZiNqdW1iZj1jMnBhLmFzc2VydGlvbnMvYzJwYS5pbmdyZWRpZW50LnYzZGhhc2hYIApXgGMoRK3FtZJKASY/RK5rwdCnY42ObOD2O26DL2KRomN1cmx4KnNlbGYjanVtYmY9YzJwYS5hc3NlcnRpb25zL2MycGEuYWN0aW9ucy52MmRoYXNoWCDkVu1+PvM9Yix9XQBZVgmyMj+7c4MIQBHeb2YRjvz/1aJjdXJseClzZWxmI2p1bWJmPWMycGEuYXNzZXJ0aW9ucy9jMnBhLmhhc2guZGF0YWRoYXNoWCBJVzuwt2R3UAB7G8JGx2sqxbcbl8QtZkz8akVn7ErZQnRjbGFpbV9nZW5lcmF0b3JfaW5mb6NkbmFtZW9BbnRocm9waWMgRmlsZXNndmVyc2lvbmUxLjAuMGtzcGVjVmVyc2lvbmUyLjQuMAAAEDhqdW1iAAAAKGp1bWRjMmNzABEAEIAAAKoAOJtxA2MycGEuc2lnbmF0dXJlAAAAEAhjYm9y0oRZAhKiASYYIVkCCjCCAgYwggGNoAMCAQICFEDloAruwjnQvriD+gZCBT1nVRMAMAoGCCqGSM49BAMDMEkxFzAVBgNVBAoTDkFudGhyb3BpYywgUEJDMS4wLAYDVQQDEyVBbnRocm9waWMgQ29udGVudCBDcmVkZW50aWFscyBSb290IENBMB4XDTI2MDgwNzE4NDM1NloXDTI4MDgwNjE5NDM1NlowRDEXMBUGA1UEChMOQW50aHJvcGljLCBQQkMxKTAnBgNVBAMTIEFudGhyb3BpYyBDbGF1ZGUgQ29udGVudCBTaWduaW5nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEmHoKa8tQGAUU1TS9QqU5W0Tp2N3XsvlK7BfQt6YWKwEzd2R3/dzKPEUDdCjlLjp9fT+KFjRVnuZ9v0oXvTe3k6NYMFYwDgYDVR0PAQH/BAQDAgeAMBUGA1UdJQQOMAwGCisGAQQBg+heAgEwDAYDVR0TAQH/BAIwADAfBgNVHSMEGDAWgBTOUeIEgU5kWyP448TPmj6cwddcwjAKBggqhkjOPQQDAwNnADBkAjAxcx0UngF60stVjs5G4T2eiptsBk5mf9oCtfJPAUBl8qs/PEXa8+gk1/X5QJ2DVcYCMHBfXN31YapiSqYvlIWrDVDJKOvXMl+kkz37Wt0PBI8sw486Mq6JeOhT+lRR4b1HCaFjcGFkWQ2eAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA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",
 "PUX-ROVERO-ALCA-160-RS": "data:image/jpeg;base64,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vbwAFQay2YyNSyOXbnmrNpamRgcUwFs7QuwJrYjjEa4FEUQiUADmn0AFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRXn3xE+IEumP8A2BoLLLq8wxJIORaqe5/2vQdutKUlFXY0m3ZEPxG+IE1pK3hzw++/U5RiedeRaqf/AGf+VclpelxaDbiNA097MeT1Z2NVLHSpPDqefGwurqZsyCTl2YnnB7mt2PWLTw5YDUHxca3cApFbkZ+zfUetcE587u9jthDkVluPvrmPwjBlis+v3S4VRyLZT/WsPStLvNRv1trcG41C5O53PRB3YnsBVdFmMzXV0xnv7hs88kZruPhXdJBqGoWEoXz5FWVXxywHBGfTkHFRBKcknsVNuEW1udr4b8N2vhuwFvB88rndNMw+aVvU+3oK1s4FJnv2qrd3YjUgHmvSSSVkcDd9WNvbsRgqDzWRJIZGyaJZTIxJNSW9u0rgAZpiFtbYysOK2oIFhXHekt7dYFwOvepqACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAK8QexOi6teh4VNwZW81nySzE/ez79a9vrnPFfhNNdUXNuVivUGMnpIPQ/wBDWVWHMtDSnPlep5dofiqy06O7u9Rib/hIYX8uCyIym0jiVD/Ep/MHishopn1FtUvB5t7cbiwz+OBXR3Xh+9juRFLp8/nqcIPLJOfYjiu08N+AktNMuH1II9/dxGM9xAp6KPfOCT7Vy+ylJ+R0+0UVfqee6batDIZpyGnfg46IPQVcs746J4isNSBIRJAsv+4eD+h/SkkieCVo5Bh0Yow9wcGo76ET2zA+n61k/dehoveR7Lc3QjTgg+lY08xlYmsvw7qj6noVpJI2ZI08mT/eXj+WD+NacELSsABnNenF3Vzz2rOw6CAyuABkmtu2tlgTsW7mktbVbdfVj1NWKYgooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooATrS9qKDnHFAHmfjjTvsWtvMoxHdL5owP4hw39D+NYKtuUqfrXofivRLrWLdVhjJlibchPQ8YIzXHw+EddeXZ/Z7pz95mAX+dcVak29EddKoktR3gSWT7fd6cASjATL7HOD/n2r0yzs1tkycFz1PpWV4X8LxaBE8sjLLeTffcDhR/dHt/Ot6umlFxikznqSUpNoKKKK0ICiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD//2Q==",
 "PUX-ROVERO-ALCA-320-RS": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBAUEBAYFBQUGBgYHCQ4JCQgICRINDQoOFRIWFhUSFBQXGiEcFxgfGRQUHScdHyIjJSUlFhwpLCgkKyEkJST/2wBDAQYGBgkICREJCREkGBQYJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCT/wAARCADcANwDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD6oooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiqWsa1YaDYvfajcpbwJwWbqSegA6k+wqno3i/RteISyuwZDyI5FKM30B60rodmbNFFFMQUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABVDXNcsfDumy6jqMwigiH1LHsoHcn0pda1qx8PabNqOozrBbxDJJ6k9gB3J7CvCtf1+/8c6n/AGhfBoLCEn7LaZ4Uf3j6se5/Cs6lRQRpTpubDXtev/GmpjU78CGzhJ+y2jcqg9T6se5rPTUHSZJrj93sbdbLGSDIR0b1AH61JIyvGJGH7gcIn/PU/wDxP86m03SrvXdRjt4YvOvJSNvHEY7sfQAVwOTk/M7FFRXke1eCNcl1/wAPwXNyMXKExTY7sO/4gg1v1leGtCh8O6VHYxOZDkvJIeN7nqfpWrXpRvbU4JWvoFFFFMQUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAVW1HUbbSrOS8u5RHFGMknv6AepPpTr6+t9NtnubqVYokHLMf0+teSeJvE9zrF0t1OPLtYnBhgPYfIcn1Y8/SonNRRcIOTMDxPr19411gTaijWthAc2toWzwR95scFiMfTpVRykiB2GLVTgKDjzSOw/wBkdz+FP2fb2BusY7RlsAgDHrnsOQajnLW5HnEyEYSJQuMjtx+n4V585Nu7O6MVHRDdsk8ynG6Z+EQDoP6AV6x8KbS0j0aedYl+1mdo5pDyWAwVHsOeleeaLaeTOzyczOuCf7o9BXc/DO58q91SyY9dkyj81P8ASrw+kjOvrHQ9BNFMikEm7HY4p9egcQUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAVBfX1vp1pLdXUixwxKWZj2FLd3cFjbvcXEixRIMszHgV5R4o8Vya5N5jlorCMbooe5zt+ZvfDdO1ROaii4QcmN8U+J5Nem3yborWJmEMJ7n58Mw9flH0rlJXM0xkkBx2AIO0c+30p0szXrG4kO1c7lUt7g9zjPJqNUkupRGsZkOQowN2SeABwRn8a4ZScmdsYqCJY7d7y6SG0yXkOAkZyWY/wgA9fwr0dfAUVj4VvpLmKN9Sa2YggAiHbhtqnHXjk960vAvgpdAg+1Xahr1xgLkkQr/dHv6n8K6yRFdCjD5WGCPY1006VldnNUq3eh4dbv88cg6MAa2/Dd19i8UQtnAuI3hP1xkfqKxntzaSSWx+9bytEf+AkipJpzaz2l4vWKVX/XmuWL5ZHS1zRPYNKbfDIc5+f+lXao6QP9HYjoWyPpgVer0jzwooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACorq6hsreS4uJFiijUs7scAAUs88VtC800ixxoMszHAAry7xT4s/t2Ux5MOnxnKq/HmH5fmb/vrgVE5qK1LhByYzxX4sOsStvcw2ERJjjJx5hG7DN+K8D3rjrhmuJNxz5YOEXrkDI+vYUXMz30u8bhGMZA6E8dcD3btVUSmWYqVI9R1/QE/wAq4ZScmdkYqKJC0kkgAypJwMZBJPT+6c9u9eteBPBC6WianqMKG+YZRCAfIH1/vfyqLwH4HWxWPVNQhC3BG6GHGPKz/ERgDd+HFd1XVSpW1Zz1at9EHT2qrd3QjUgHmlurkRKeaxppjKxrcwOX1rwxPdX1xd2ksZ89/MZJCRhu+D71LpPgua4kjOoGPy0Iby0Od2OxPpXS28DSt0rZtrdYl6c1l7KN72NFVla1x8EQiTaKkoorUzCiiigAooooAKKKKACiiigAooooAKKKKACiiigApk00dvE8srqkaAszMcAD1NEsqQRtLIwREBZmJwAB1NeZeLfF51W48iEummxMNx5HnEMOT6KMNwaic1FFQg5MTxV4uOsyPFEWTT4iSoOcysN2GPfGQMD8a4u7uDeFmGEtx0Hr15P6Us8zXrBsbYUIOCOpGMk+n3T+dVWPmAeUcBcc446euPx+9Xnzm5M7oQUUR+YWYj7yAk9QwA/JsV6h4D8DBRFquqQnIw0FvID8vo7DOM+gx71X8A+CDciLVtXi3IpDW8Mgzu9HbJPHoPxr0rFdVGlbVnPVq30QdOKguLgRKeeaWecRLWNc3JlY810HONuLhpWPNJBCZGwKSGIyMBWxa2ojUcc0wHWtsI1z3qzRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFNd1jQu7BVAySTgAUrOEBLEADkk9q8w8X+LzrbvZ2jMunICTIDjz2APP+6CVx65qJzUVdlRi5OyHeLPFY15ja20hTTF+8/K+d0GT/sjd+NcRd3LageSBbj1I5zn/AOLp19dC+dlQBbdWbay4+bqRj/x3vVeWRlIji3Bc4BwQD6YyVzx79hXBOo5M74QUUEzkcQ/KOvTb3Pf5ffo1dx4B8DrqLRavqMR+zg7oY3wTMc/ePX5fx5qDwD4FGrOupXqFbJTlV6G4P5Z2jHqc16yqhQFUAKBgADgCuijR+0znrVb6IUAAYqOeYRrRNKI1JJrHu7oyMQDXUcw26uWkY88VBHGZGoRTI2K1bOzCgMwoAdZ2gRckc1dxQBjpS0AFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABSMwUZJwKGYKCSQAK838Y+MDqTvp9g+LFCRPMD/rsEkqp/u/Iw9/5zOairsqMXJ2RH4x8Z/2k0lnZuVsIzl5QceeRuOAf7vy4981xN1cfa3Ea/JAhxu4JbH/AO7Hf8qc90L1khj+WKPClgRzjaDz6fK3cdelVJn8tVjXoQPmOcdPUlc857+tefObkzvhTUEE7mNRGvyoAQCcjPAHXK+g7n9K6nwH4IOtz/bJwU09G5K8GY+gOM49Tk+lReB/BkmvXZuG/d2MbYklUbWk/wBhSAPXk5OOa9kgt47WBIYUWOONQqqvQCtqNG/vMxrVuiHxRpDGscahEUYVVGAB6UkriNSSaHkCLk8Vk3t4XO1TxXYcg28uzIxAPFVFBc4pAC5rRsrPJywoAfZWmMMwrRAwMUiIEGBTqACiiigAooooAKKKKACiiigAooooAKKKKACiiigApGIUZJwKWvNfFnj1dR1ZvD+kl5bdflvLmI98jKKfpkE1M5qKuyoxcnZEvjPxc9676Zp0mLVTi4nH/LTB5VT6YVskZzXn9xP9pUW6HESkBmGOegPPP95vT6Cpr25aSVrFf3ZjVfM4B+8CPXoSW5xiqU85K7bbOepwCfU9unU9x0rz6lRyZ6FOmoofKWRP3IAAwNxzgdTyeB/e/i9a2/BfhOfxHdncBHZx8TzLwT0+QEDknH944/GovB3hO68Qag2SUjjIM84IO32B5yxx/e9zXtWnafbaZaR2lpGI4YxhVzn8Se5961oUb+8zKtWtoh9lZ2+n2sVraxLFBEu1EXoBUrsFGaVmCjNZl7edVU12nENvbzOVWs7lz70EmRutXbO0LkEigB9nZ7sEitRECDApI4wigAU+gAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKK80+Inj6fz38M+HJc3z/Lc3Kci3U9VB/vfy+tTKSirscYuTsiH4iePbi8uJPDHhuU+cfkvLtDxEO6Kf73qe1c9Y2MWi20VjZRGW6l+UKv3nam6dpkWhWyW1ujTXcpxxyzsav390PC6GCJln1y5XbJIvItlP8K+/vXBObm7vY7oQUVZFHxFBbWltHp6FbnV/MEks6sdsXrGMdsdffnrUPhnwreazqS2sIVUiG6SdsMIxnrzuO446cdKdomhXer3y2Vn89w/zTTN92Je7H/Dua9n0TRLbQtPjs7YEheWdvvSN3JqqNPnd3sTWqcq5VuSaVpdtpFlHZ2qFYox3OSx9Se5q4zBRzRwo5qhe3YUEA813JHEMvbwAFQay2YyNSyOXbnmrNpamRgcUwFs7QuwJrYjjEa4FEUQiUADmn0AFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRXn3xE+IEumP8A2BoLLLq8wxJIORaqe5/2vQdutKUlFXY0m3ZEPxG+IE1pK3hzw++/U5RiedeRaqf/AGf+VclpelxaDbiNA097MeT1Z2NVLHSpPDqefGwurqZsyCTl2YnnB7mt2PWLTw5YDUHxca3cApFbkZ+zfUetcE587u9jthDkVluPvrmPwjBlis+v3S4VRyLZT/WsPStLvNRv1trcG41C5O53PRB3YnsBVdFmMzXV0xnv7hs88kZruPhXdJBqGoWEoXz5FWVXxywHBGfTkHFRBKcknsVNuEW1udr4b8N2vhuwFvB88rndNMw+aVvU+3oK1s4FJnv2qrd3YjUgHmvSSSVkcDd9WNvbsRgqDzWRJIZGyaJZTIxJNSW9u0rgAZpiFtbYysOK2oIFhXHekt7dYFwOvepqACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAK8QexOi6teh4VNwZW81nySzE/ez79a9vrnPFfhNNdUXNuVivUGMnpIPQ/wBDWVWHMtDSnPlep5dofiqy06O7u9Rib/hIYX8uCyIym0jiVD/Ep/MHishopn1FtUvB5t7cbiwz+OBXR3Xh+9juRFLp8/nqcIPLJOfYjiu08N+AktNMuH1II9/dxGM9xAp6KPfOCT7Vy+ylJ+R0+0UVfqee6batDIZpyGnfg46IPQVcs746J4isNSBIRJAsv+4eD+h/SkkieCVo5Bh0Yow9wcGo76ET2zA+n61k/dehoveR7Lc3QjTgg+lY08xlYmsvw7qj6noVpJI2ZI08mT/eXj+WD+NacELSsABnNenF3Vzz2rOw6CAyuABkmtu2tlgTsW7mktbVbdfVj1NWKYgooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooATrS9qKDnHFAHmfjjTvsWtvMoxHdL5owP4hw39D+NYKtuUqfrXofivRLrWLdVhjJlibchPQ8YIzXHw+EddeXZ/Z7pz95mAX+dcVak29EddKoktR3gSWT7fd6cASjATL7HOD/n2r0yzs1tkycFz1PpWV4X8LxaBE8sjLLeTffcDhR/dHt/Ot6umlFxikznqSUpNoKKKK0ICiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD//2Q==",
 "PUX-ROVERO-ALCA-160-GD": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/6xaJSlACEQAAAAEAABZ/anVtYgAAAB5qdW1kYzJwYQARABCAAACqADibcQNjMnBhAAAAFllqdW1iAAAAR2p1bWRjMm1hABEAEIAAAKoAOJtxA3VybjpjMnBhOmEzMmI0YWY0LThlZTItNDlmNy04ZWFiLTQxNDljMzQxNzliMQAAAAOUanVtYgAAAClqdW1kYzJhcwARABCAAACqADibcQNjMnBhLmFzc2VydGlvbnMAAAAAuWp1bWIAAABEanVtZGNib3IAEQAQgAAAqgA4m3ETYzJwYS5pbmdyZWRpZW50LnYzAAAAABhjMnNodkSSrtsA5Z2IiFHsXC57agAAAG1jYm9yo2lkYzpmb3JtYXRqaW1hZ2UvanBlZ2ppbnN0YW5jZUlEeCx4bXA6aWlkOjUxZjNjYjY1LTlhMjgtNDIzMi1iZjJmLTIxODZlZTg4MWVlMmxyZWxhdGlvbnNoaXBocGFyZW50T2YAAAHianVtYgAAAEFqdW1kY2JvcgARABCAAACqADibcRNjMnBhLmFjdGlvbnMudjIAAAAAGGMyc2iboky2HOm+TcoThW27tWrjAAABmWNib3KiZ2FjdGlvbnOComZhY3Rpb25rYzJwYS5vcGVuZWRqcGFyYW1ldGVyc6FraW5ncmVkaWVudHOBomN1cmx4LXNlbGYjanVtYmY9YzJwYS5hc3NlcnRpb25zL2MycGEuaW5ncmVkaWVudC52M2RoYXNoWCA+hbvFoU14V0hsFr0A/DclPm4cJMV9fZ8re9UZIO8OtaRmYWN0aW9ueB1jb20uYW50aHJvcGljLmNsYXVkZS5wcm92aWRlZGpwYXJhbWV0ZXJzoXgfY29tLmFudGhyb3BpYy5vcmlnaW4tY29uZmlkZW5jZWd1bmtub3dua2Rlc2NyaXB0aW9ueGZDbGF1ZGUgcHJvdmlkZWQgdGhpcyBmaWxlIGF0IHRoZSByZXF1ZXN0IG9mIGEgdXNlciBhbmQgbWF5IGhhdmUgY3JlYXRlZCBvciBtb2RpZmllZCB0aGUgZmlsZSBjb250ZW50cy5tc29mdHdhcmVBZ2VudKFkbmFtZWZDbGF1ZGVyYWxsQWN0aW9uc0luY2x1ZGVk9QAAAMhqdW1iAAAAQGp1bWRjYm9yABEAEIAAAKoAOJtxE2MycGEuaGFzaC5kYXRhAAAAABhjMnNo1ijrwSsDEhgq60k00WXuawAAAIBjYm9ypWNhbGdmc2hhMjU2Y3BhZE4AAAAAAAAAAAAAAAAAAGRoYXNoWCBi7Xp0KZ2cVIAM3PjC/vJI9eXUxy9/T0W5+PO6LMBWp2RuYW1lbmp1bWJmIG1hbmlmZXN0amV4Y2x1c2lvbnOBomVzdGFydBRmbGVuZ3RoGRaLAAACPmp1bWIAAAAnanVtZGMyY2wAEQAQgAAAqgA4m3EDYzJwYS5jbGFpbS52MgAAAAIPY2JvcqVjYWxnZnNoYTI1NmlzaWduYXR1cmV4TXNlbGYjanVtYmY9L2MycGEvdXJuOmMycGE6YTMyYjRhZjQtOGVlMi00OWY3LThlYWItNDE0OWMzNDE3OWIxL2MycGEuc2lnbmF0dXJlamluc3RhbmNlSUR4LHhtcDppaWQ6MWE4YWNmMWYtYzg0NS00Y2RhLTkwMTMtZGJlNTI5MzZjYTFjcmNyZWF0ZWRfYXNzZXJ0aW9uc4OiY3VybHgtc2VsZiNqdW1iZj1jMnBhLmFzc2VydGlvbnMvYzJwYS5pbmdyZWRpZW50LnYzZGhhc2hYID6Fu8WhTXhXSGwWvQD8NyU+bhwkxX19nyt71Rkg7w61omN1cmx4KnNlbGYjanVtYmY9YzJwYS5hc3NlcnRpb25zL2MycGEuYWN0aW9ucy52MmRoYXNoWCDEFpSNog3G71FIIe/4uiRuXIqeQ07MPk/drxNzty/DPKJjdXJseClzZWxmI2p1bWJmPWMycGEuYXNzZXJ0aW9ucy9jMnBhLmhhc2guZGF0YWRoYXNoWCDEu5UqvZWtA3z6P+3NeWVFzaIwvC/29hCQXiY3rokwUHRjbGFpbV9nZW5lcmF0b3JfaW5mb6NkbmFtZW9BbnRocm9waWMgRmlsZXNndmVyc2lvbmUxLjAuMGtzcGVjVmVyc2lvbmUyLjQuMAAAEDhqdW1iAAAAKGp1bWRjMmNzABEAEIAAAKoAOJtxA2MycGEuc2lnbmF0dXJlAAAAEAhjYm9y0oRZAhKiASYYIVkCCjCCAgYwggGNoAMCAQICFEDloAruwjnQvriD+gZCBT1nVRMAMAoGCCqGSM49BAMDMEkxFzAVBgNVBAoTDkFudGhyb3BpYywgUEJDMS4wLAYDVQQDEyVBbnRocm9waWMgQ29udGVudCBDcmVkZW50aWFscyBSb290IENBMB4XDTI2MDgwNzE4NDM1NloXDTI4MDgwNjE5NDM1NlowRDEXMBUGA1UEChMOQW50aHJvcGljLCBQQkMxKTAnBgNVBAMTIEFudGhyb3BpYyBDbGF1ZGUgQ29udGVudCBTaWduaW5nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEmHoKa8tQGAUU1TS9QqU5W0Tp2N3XsvlK7BfQt6YWKwEzd2R3/dzKPEUDdCjlLjp9fT+KFjRVnuZ9v0oXvTe3k6NYMFYwDgYDVR0PAQH/BAQDAgeAMBUGA1UdJQQOMAwGCisGAQQBg+heAgEwDAYDVR0TAQH/BAIwADAfBgNVHSMEGDAWgBTOUeIEgU5kWyP448TPmj6cwddcwjAKBggqhkjOPQQDAwNnADBkAjAxcx0UngF60stVjs5G4T2eiptsBk5mf9oCtfJPAUBl8qs/PEXa8+gk1/X5QJ2DVcYCMHBfXN31YapiSqYvlIWrDVDJKOvXMl+kkz37Wt0PBI8sw486Mq6JeOhT+lRR4b1HCaFjcGFkWQ2eAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA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MXRY2vdQCzahMpBHVYEP8C+57n8OledTwspys9Edcq0Yq6PHrh5FuS8pG7HAzwo9q1LW8eKK2vYs+baSLIPwOaZ4u006bqdxBjBhkZR7r1B/Iiq2kTbt0LHhx+tcsrwn6Gy96J7udQjmtY7iJspKgdT7EZFZM87St1rB8Iak11oUduzHfasYT9Oo/Q/pW3DEZGFfQQlzRUjy5R5XYfBCZGHFbNpbCNelMs7UIoJHNXVGBVkh04pRRRQAUUUZoAMUUUUAFFFAFABRRRigApKWigBDRQaKACiiigAooooAKWkpaACjpRSHpQB5j8VNOAvIrxek8ZRv99en6H9K80trryboHOMHNe5+LvD82vWLWyBlbIdHAzhhXls3wl8Tz3YASGOPPL5J4+leTi8LOVTmgtzuoVoqNpM3PBM7jWZ7ZQTFcRCTjsR/+uvTbO0CAEisLwd4OHh+AeczTXBUK0jDHHoBXVqoArvw1OUKajLc5aslKTaFVcUuaDQK3MwpKWigANAoozQAUUUZoAKKKSgBaM0UlAC0lLRQAlFBooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA//9k=",
 "PUX-ROVERO-ALCA-320-GD": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/6xaJSlACEQAAAAEAABZ/anVtYgAAAB5qdW1kYzJwYQARABCAAACqADibcQNjMnBhAAAAFllqdW1iAAAAR2p1bWRjMm1hABEAEIAAAKoAOJtxA3VybjpjMnBhOmEzMmI0YWY0LThlZTItNDlmNy04ZWFiLTQxNDljMzQxNzliMQAAAAOUanVtYgAAAClqdW1kYzJhcwARABCAAACqADibcQNjMnBhLmFzc2VydGlvbnMAAAAAuWp1bWIAAABEanVtZGNib3IAEQAQgAAAqgA4m3ETYzJwYS5pbmdyZWRpZW50LnYzAAAAABhjMnNodkSSrtsA5Z2IiFHsXC57agAAAG1jYm9yo2lkYzpmb3JtYXRqaW1hZ2UvanBlZ2ppbnN0YW5jZUlEeCx4bXA6aWlkOjUxZjNjYjY1LTlhMjgtNDIzMi1iZjJmLTIxODZlZTg4MWVlMmxyZWxhdGlvbnNoaXBocGFyZW50T2YAAAHianVtYgAAAEFqdW1kY2JvcgARABCAAACqADibcRNjMnBhLmFjdGlvbnMudjIAAAAAGGMyc2iboky2HOm+TcoThW27tWrjAAABmWNib3KiZ2FjdGlvbnOComZhY3Rpb25rYzJwYS5vcGVuZWRqcGFyYW1ldGVyc6FraW5ncmVkaWVudHOBomN1cmx4LXNlbGYjanVtYmY9YzJwYS5hc3NlcnRpb25zL2MycGEuaW5ncmVkaWVudC52M2RoYXNoWCA+hbvFoU14V0hsFr0A/DclPm4cJMV9fZ8re9UZIO8OtaRmYWN0aW9ueB1jb20uYW50aHJvcGljLmNsYXVkZS5wcm92aWRlZGpwYXJhbWV0ZXJzoXgfY29tLmFudGhyb3BpYy5vcmlnaW4tY29uZmlkZW5jZWd1bmtub3dua2Rlc2NyaXB0aW9ueGZDbGF1ZGUgcHJvdmlkZWQgdGhpcyBmaWxlIGF0IHRoZSByZXF1ZXN0IG9mIGEgdXNlciBhbmQgbWF5IGhhdmUgY3JlYXRlZCBvciBtb2RpZmllZCB0aGUgZmlsZSBjb250ZW50cy5tc29mdHdhcmVBZ2VudKFkbmFtZWZDbGF1ZGVyYWxsQWN0aW9uc0luY2x1ZGVk9QAAAMhqdW1iAAAAQGp1bWRjYm9yABEAEIAAAKoAOJtxE2MycGEuaGFzaC5kYXRhAAAAABhjMnNo1ijrwSsDEhgq60k00WXuawAAAIBjYm9ypWNhbGdmc2hhMjU2Y3BhZE4AAAAAAAAAAAAAAAAAAGRoYXNoWCBi7Xp0KZ2cVIAM3PjC/vJI9eXUxy9/T0W5+PO6LMBWp2RuYW1lbmp1bWJmIG1hbmlmZXN0amV4Y2x1c2lvbnOBomVzdGFydBRmbGVuZ3RoGRaLAAACPmp1bWIAAAAnanVtZGMyY2wAEQAQgAAAqgA4m3EDYzJwYS5jbGFpbS52MgAAAAIPY2JvcqVjYWxnZnNoYTI1NmlzaWduYXR1cmV4TXNlbGYjanVtYmY9L2MycGEvdXJuOmMycGE6YTMyYjRhZjQtOGVlMi00OWY3LThlYWItNDE0OWMzNDE3OWIxL2MycGEuc2lnbmF0dXJlamluc3RhbmNlSUR4LHhtcDppaWQ6MWE4YWNmMWYtYzg0NS00Y2RhLTkwMTMtZGJlNTI5MzZjYTFjcmNyZWF0ZWRfYXNzZXJ0aW9uc4OiY3VybHgtc2VsZiNqdW1iZj1jMnBhLmFzc2VydGlvbnMvYzJwYS5pbmdyZWRpZW50LnYzZGhhc2hYID6Fu8WhTXhXSGwWvQD8NyU+bhwkxX19nyt71Rkg7w61omN1cmx4KnNlbGYjanVtYmY9YzJwYS5hc3NlcnRpb25zL2MycGEuYWN0aW9ucy52MmRoYXNoWCDEFpSNog3G71FIIe/4uiRuXIqeQ07MPk/drxNzty/DPKJjdXJseClzZWxmI2p1bWJmPWMycGEuYXNzZXJ0aW9ucy9jMnBhLmhhc2guZGF0YWRoYXNoWCDEu5UqvZWtA3z6P+3NeWVFzaIwvC/29hCQXiY3rokwUHRjbGFpbV9nZW5lcmF0b3JfaW5mb6NkbmFtZW9BbnRocm9waWMgRmlsZXNndmVyc2lvbmUxLjAuMGtzcGVjVmVyc2lvbmUyLjQuMAAAEDhqdW1iAAAAKGp1bWRjMmNzABEAEIAAAKoAOJtxA2MycGEuc2lnbmF0dXJlAAAAEAhjYm9y0oRZAhKiASYYIVkCCjCCAgYwggGNoAMCAQICFEDloAruwjnQvriD+gZCBT1nVRMAMAoGCCqGSM49BAMDMEkxFzAVBgNVBAoTDkFudGhyb3BpYywgUEJDMS4wLAYDVQQDEyVBbnRocm9waWMgQ29udGVudCBDcmVkZW50aWFscyBSb290IENBMB4XDTI2MDgwNzE4NDM1NloXDTI4MDgwNjE5NDM1NlowRDEXMBUGA1UEChMOQW50aHJvcGljLCBQQkMxKTAnBgNVBAMTIEFudGhyb3BpYyBDbGF1ZGUgQ29udGVudCBTaWduaW5nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEmHoKa8tQGAUU1TS9QqU5W0Tp2N3XsvlK7BfQt6YWKwEzd2R3/dzKPEUDdCjlLjp9fT+KFjRVnuZ9v0oXvTe3k6NYMFYwDgYDVR0PAQH/BAQDAgeAMBUGA1UdJQQOMAwGCisGAQQBg+heAgEwDAYDVR0TAQH/BAIwADAfBgNVHSMEGDAWgBTOUeIEgU5kWyP448TPmj6cwddcwjAKBggqhkjOPQQDAwNnADBkAjAxcx0UngF60stVjs5G4T2eiptsBk5mf9oCtfJPAUBl8qs/PEXa8+gk1/X5QJ2DVcYCMHBfXN31YapiSqYvlIWrDVDJKOvXMl+kkz37Wt0PBI8sw486Mq6JeOhT+lRR4b1HCaFjcGFkWQ2eAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA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MXRY2vdQCzahMpBHVYEP8C+57n8OledTwspys9Edcq0Yq6PHrh5FuS8pG7HAzwo9q1LW8eKK2vYs+baSLIPwOaZ4u006bqdxBjBhkZR7r1B/Iiq2kTbt0LHhx+tcsrwn6Gy96J7udQjmtY7iJspKgdT7EZFZM87St1rB8Iak11oUduzHfasYT9Oo/Q/pW3DEZGFfQQlzRUjy5R5XYfBCZGHFbNpbCNelMs7UIoJHNXVGBVkh04pRRRQAUUUZoAMUUUUAFFFAFABRRRigApKWigBDRQaKACiiigAooooAKWkpaACjpRSHpQB5j8VNOAvIrxek8ZRv99en6H9K80trryboHOMHNe5+LvD82vWLWyBlbIdHAzhhXls3wl8Tz3YASGOPPL5J4+leTi8LOVTmgtzuoVoqNpM3PBM7jWZ7ZQTFcRCTjsR/+uvTbO0CAEisLwd4OHh+AeczTXBUK0jDHHoBXVqoArvw1OUKajLc5aslKTaFVcUuaDQK3MwpKWigANAoozQAUUUZoAKKKSgBaM0UlAC0lLRQAlFBooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA//9k=",
 "PUX-ROVERO-ALCA-160-BK": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/6xaJSlACEQAAAAEAABZ/anVtYgAAAB5qdW1kYzJwYQARABCAAACqADibcQNjMnBhAAAAFllqdW1iAAAAR2p1bWRjMm1hABEAEIAAAKoAOJtxA3VybjpjMnBhOjY5ZDEwMDQxLTM4M2MtNDRiYS05ODMwLTVlOTQxNTBlZDBiNQAAAAOUanVtYgAAAClqdW1kYzJhcwARABCAAACqADibcQNjMnBhLmFzc2VydGlvbnMAAAAAuWp1bWIAAABEanVtZGNib3IAEQAQgAAAqgA4m3ETYzJwYS5pbmdyZWRpZW50LnYzAAAAABhjMnNoEYOwDrEe5HP5Cxj6k+IpTwAAAG1jYm9yo2lkYzpmb3JtYXRqaW1hZ2UvanBlZ2ppbnN0YW5jZUlEeCx4bXA6aWlkOmQwMDA1ODA5LWM1M2ItNDNmMi05ZDEyLTJhNDZhNjQ1NDYzOWxyZWxhdGlvbnNoaXBocGFyZW50T2YAAAHianVtYgAAAEFqdW1kY2JvcgARABCAAACqADibcRNjMnBhLmFjdGlvbnMudjIAAAAAGGMyc2jAot7GrtInSWfw7a4pSSfsAAABmWNib3KiZ2FjdGlvbnOComZhY3Rpb25rYzJwYS5vcGVuZWRqcGFyYW1ldGVyc6FraW5ncmVkaWVudHOBomN1cmx4LXNlbGYjanVtYmY9YzJwYS5hc3NlcnRpb25zL2MycGEuaW5ncmVkaWVudC52M2RoYXNoWCDD5R4ri/wRIrvqBehx5WEFNWcIAYZlRIEts8arArTxHKRmYWN0aW9ueB1jb20uYW50aHJvcGljLmNsYXVkZS5wcm92aWRlZGpwYXJhbWV0ZXJzoXgfY29tLmFudGhyb3BpYy5vcmlnaW4tY29uZmlkZW5jZWd1bmtub3dua2Rlc2NyaXB0aW9ueGZDbGF1ZGUgcHJvdmlkZWQgdGhpcyBmaWxlIGF0IHRoZSByZXF1ZXN0IG9mIGEgdXNlciBhbmQgbWF5IGhhdmUgY3JlYXRlZCBvciBtb2RpZmllZCB0aGUgZmlsZSBjb250ZW50cy5tc29mdHdhcmVBZ2VudKFkbmFtZWZDbGF1ZGVyYWxsQWN0aW9uc0luY2x1ZGVk9QAAAMhqdW1iAAAAQGp1bWRjYm9yABEAEIAAAKoAOJtxE2MycGEuaGFzaC5kYXRhAAAAABhjMnNo3AVtR/bB7g9yW8sPn8+g0AAAAIBjYm9ypWNhbGdmc2hhMjU2Y3BhZE4AAAAAAAAAAAAAAAAAAGRoYXNoWCC99yeW3sz7YFfPWuReOBNrQljSCImwNYZ0GozjrTx3DGRuYW1lbmp1bWJmIG1hbmlmZXN0amV4Y2x1c2lvbnOBomVzdGFydBRmbGVuZ3RoGRaLAAACPmp1bWIAAAAnanVtZGMyY2wAEQAQgAAAqgA4m3EDYzJwYS5jbGFpbS52MgAAAAIPY2JvcqVjYWxnZnNoYTI1NmlzaWduYXR1cmV4TXNlbGYjanVtYmY9L2MycGEvdXJuOmMycGE6NjlkMTAwNDEtMzgzYy00NGJhLTk4MzAtNWU5NDE1MGVkMGI1L2MycGEuc2lnbmF0dXJlamluc3RhbmNlSUR4LHhtcDppaWQ6NzM5ZWRmOGYtYjc5OS00YTljLWFlZDMtZmUxNGY0YjM1MmQycmNyZWF0ZWRfYXNzZXJ0aW9uc4OiY3VybHgtc2VsZiNqdW1iZj1jMnBhLmFzc2VydGlvbnMvYzJwYS5pbmdyZWRpZW50LnYzZGhhc2hYIMPlHiuL/BEiu+oF6HHlYQU1ZwgBhmVEgS2zxqsCtPEcomN1cmx4KnNlbGYjanVtYmY9YzJwYS5hc3NlcnRpb25zL2MycGEuYWN0aW9ucy52MmRoYXNoWCBPY3mCaJ614iZhVDPy4mU2J62T/RLmEmqsbOgmAxE/f6JjdXJseClzZWxmI2p1bWJmPWMycGEuYXNzZXJ0aW9ucy9jMnBhLmhhc2guZGF0YWRoYXNoWCBHfUmVvaDMvJTD5OrNC6mNUlWBXNENQiVytGToEnHqc3RjbGFpbV9nZW5lcmF0b3JfaW5mb6NkbmFtZW9BbnRocm9waWMgRmlsZXNndmVyc2lvbmUxLjAuMGtzcGVjVmVyc2lvbmUyLjQuMAAAEDhqdW1iAAAAKGp1bWRjMmNzABEAEIAAAKoAOJtxA2MycGEuc2lnbmF0dXJlAAAAEAhjYm9y0oRZAhKiASYYIVkCCjCCAgYwggGNoAMCAQICFEDloAruwjnQvriD+gZCBT1nVRMAMAoGCCqGSM49BAMDMEkxFzAVBgNVBAoTDkFudGhyb3BpYywgUEJDMS4wLAYDVQQDEyVBbnRocm9waWMgQ29udGVudCBDcmVkZW50aWFscyBSb290IENBMB4XDTI2MDgwNzE4NDM1NloXDTI4MDgwNjE5NDM1NlowRDEXMBUGA1UEChMOQW50aHJvcGljLCBQQkMxKTAnBgNVBAMTIEFudGhyb3BpYyBDbGF1ZGUgQ29udGVudCBTaWduaW5nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEmHoKa8tQGAUU1TS9QqU5W0Tp2N3XsvlK7BfQt6YWKwEzd2R3/dzKPEUDdCjlLjp9fT+KFjRVnuZ9v0oXvTe3k6NYMFYwDgYDVR0PAQH/BAQDAgeAMBUGA1UdJQQOMAwGCisGAQQBg+heAgEwDAYDVR0TAQH/BAIwADAfBgNVHSMEGDAWgBTOUeIEgU5kWyP448TPmj6cwddcwjAKBggqhkjOPQQDAwNnADBkAjAxcx0UngF60stVjs5G4T2eiptsBk5mf9oCtfJPAUBl8qs/PEXa8+gk1/X5QJ2DVcYCMHBfXN31YapiSqYvlIWrDVDJKOvXMl+kkz37Wt0PBI8sw486Mq6JeOhT+lRR4b1HCaFjcGFkWQ2eAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA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",
 "PUX-ROVERO-ALCA-320-BK": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/6xaJSlACEQAAAAEAABZ/anVtYgAAAB5qdW1kYzJwYQARABCAAACqADibcQNjMnBhAAAAFllqdW1iAAAAR2p1bWRjMm1hABEAEIAAAKoAOJtxA3VybjpjMnBhOjY5ZDEwMDQxLTM4M2MtNDRiYS05ODMwLTVlOTQxNTBlZDBiNQAAAAOUanVtYgAAAClqdW1kYzJhcwARABCAAACqADibcQNjMnBhLmFzc2VydGlvbnMAAAAAuWp1bWIAAABEanVtZGNib3IAEQAQgAAAqgA4m3ETYzJwYS5pbmdyZWRpZW50LnYzAAAAABhjMnNoEYOwDrEe5HP5Cxj6k+IpTwAAAG1jYm9yo2lkYzpmb3JtYXRqaW1hZ2UvanBlZ2ppbnN0YW5jZUlEeCx4bXA6aWlkOmQwMDA1ODA5LWM1M2ItNDNmMi05ZDEyLTJhNDZhNjQ1NDYzOWxyZWxhdGlvbnNoaXBocGFyZW50T2YAAAHianVtYgAAAEFqdW1kY2JvcgARABCAAACqADibcRNjMnBhLmFjdGlvbnMudjIAAAAAGGMyc2jAot7GrtInSWfw7a4pSSfsAAABmWNib3KiZ2FjdGlvbnOComZhY3Rpb25rYzJwYS5vcGVuZWRqcGFyYW1ldGVyc6FraW5ncmVkaWVudHOBomN1cmx4LXNlbGYjanVtYmY9YzJwYS5hc3NlcnRpb25zL2MycGEuaW5ncmVkaWVudC52M2RoYXNoWCDD5R4ri/wRIrvqBehx5WEFNWcIAYZlRIEts8arArTxHKRmYWN0aW9ueB1jb20uYW50aHJvcGljLmNsYXVkZS5wcm92aWRlZGpwYXJhbWV0ZXJzoXgfY29tLmFudGhyb3BpYy5vcmlnaW4tY29uZmlkZW5jZWd1bmtub3dua2Rlc2NyaXB0aW9ueGZDbGF1ZGUgcHJvdmlkZWQgdGhpcyBmaWxlIGF0IHRoZSByZXF1ZXN0IG9mIGEgdXNlciBhbmQgbWF5IGhhdmUgY3JlYXRlZCBvciBtb2RpZmllZCB0aGUgZmlsZSBjb250ZW50cy5tc29mdHdhcmVBZ2VudKFkbmFtZWZDbGF1ZGVyYWxsQWN0aW9uc0luY2x1ZGVk9QAAAMhqdW1iAAAAQGp1bWRjYm9yABEAEIAAAKoAOJtxE2MycGEuaGFzaC5kYXRhAAAAABhjMnNo3AVtR/bB7g9yW8sPn8+g0AAAAIBjYm9ypWNhbGdmc2hhMjU2Y3BhZE4AAAAAAAAAAAAAAAAAAGRoYXNoWCC99yeW3sz7YFfPWuReOBNrQljSCImwNYZ0GozjrTx3DGRuYW1lbmp1bWJmIG1hbmlmZXN0amV4Y2x1c2lvbnOBomVzdGFydBRmbGVuZ3RoGRaLAAACPmp1bWIAAAAnanVtZGMyY2wAEQAQgAAAqgA4m3EDYzJwYS5jbGFpbS52MgAAAAIPY2JvcqVjYWxnZnNoYTI1NmlzaWduYXR1cmV4TXNlbGYjanVtYmY9L2MycGEvdXJuOmMycGE6NjlkMTAwNDEtMzgzYy00NGJhLTk4MzAtNWU5NDE1MGVkMGI1L2MycGEuc2lnbmF0dXJlamluc3RhbmNlSUR4LHhtcDppaWQ6NzM5ZWRmOGYtYjc5OS00YTljLWFlZDMtZmUxNGY0YjM1MmQycmNyZWF0ZWRfYXNzZXJ0aW9uc4OiY3VybHgtc2VsZiNqdW1iZj1jMnBhLmFzc2VydGlvbnMvYzJwYS5pbmdyZWRpZW50LnYzZGhhc2hYIMPlHiuL/BEiu+oF6HHlYQU1ZwgBhmVEgS2zxqsCtPEcomN1cmx4KnNlbGYjanVtYmY9YzJwYS5hc3NlcnRpb25zL2MycGEuYWN0aW9ucy52MmRoYXNoWCBPY3mCaJ614iZhVDPy4mU2J62T/RLmEmqsbOgmAxE/f6JjdXJseClzZWxmI2p1bWJmPWMycGEuYXNzZXJ0aW9ucy9jMnBhLmhhc2guZGF0YWRoYXNoWCBHfUmVvaDMvJTD5OrNC6mNUlWBXNENQiVytGToEnHqc3RjbGFpbV9nZW5lcmF0b3JfaW5mb6NkbmFtZW9BbnRocm9waWMgRmlsZXNndmVyc2lvbmUxLjAuMGtzcGVjVmVyc2lvbmUyLjQuMAAAEDhqdW1iAAAAKGp1bWRjMmNzABEAEIAAAKoAOJtxA2MycGEuc2lnbmF0dXJlAAAAEAhjYm9y0oRZAhKiASYYIVkCCjCCAgYwggGNoAMCAQICFEDloAruwjnQvriD+gZCBT1nVRMAMAoGCCqGSM49BAMDMEkxFzAVBgNVBAoTDkFudGhyb3BpYywgUEJDMS4wLAYDVQQDEyVBbnRocm9waWMgQ29udGVudCBDcmVkZW50aWFscyBSb290IENBMB4XDTI2MDgwNzE4NDM1NloXDTI4MDgwNjE5NDM1NlowRDEXMBUGA1UEChMOQW50aHJvcGljLCBQQkMxKTAnBgNVBAMTIEFudGhyb3BpYyBDbGF1ZGUgQ29udGVudCBTaWduaW5nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEmHoKa8tQGAUU1TS9QqU5W0Tp2N3XsvlK7BfQt6YWKwEzd2R3/dzKPEUDdCjlLjp9fT+KFjRVnuZ9v0oXvTe3k6NYMFYwDgYDVR0PAQH/BAQDAgeAMBUGA1UdJQQOMAwGCisGAQQBg+heAgEwDAYDVR0TAQH/BAIwADAfBgNVHSMEGDAWgBTOUeIEgU5kWyP448TPmj6cwddcwjAKBggqhkjOPQQDAwNnADBkAjAxcx0UngF60stVjs5G4T2eiptsBk5mf9oCtfJPAUBl8qs/PEXa8+gk1/X5QJ2DVcYCMHBfXN31YapiSqYvlIWrDVDJKOvXMl+kkz37Wt0PBI8sw486Mq6JeOhT+lRR4b1HCaFjcGFkWQ2eAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA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",
 "PUX-ROVERO-KNOB-BK": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/6xaJSlACEQAAAAEAABZ/anVtYgAAAB5qdW1kYzJwYQARABCAAACqADibcQNjMnBhAAAAFllqdW1iAAAAR2p1bWRjMm1hABEAEIAAAKoAOJtxA3VybjpjMnBhOmYyMWM4ZjAzLTYzZmItNGQyZC1hMzlhLWIwMGE2YmZiODg2MQAAAAOUanVtYgAAAClqdW1kYzJhcwARABCAAACqADibcQNjMnBhLmFzc2VydGlvbnMAAAAAuWp1bWIAAABEanVtZGNib3IAEQAQgAAAqgA4m3ETYzJwYS5pbmdyZWRpZW50LnYzAAAAABhjMnNoXP4rAS8PmkRWrRDygYyy2QAAAG1jYm9yo2lkYzpmb3JtYXRqaW1hZ2UvanBlZ2ppbnN0YW5jZUlEeCx4bXA6aWlkOmNhYTUyYzZkLTUzZWMtNDc1MC1hYzFmLTAyZDE0YmZmYjg4MGxyZWxhdGlvbnNoaXBocGFyZW50T2YAAAHianVtYgAAAEFqdW1kY2JvcgARABCAAACqADibcRNjMnBhLmFjdGlvbnMudjIAAAAAGGMyc2ibsRd90AhaqIZKMVxOI9DPAAABmWNib3KiZ2FjdGlvbnOComZhY3Rpb25rYzJwYS5vcGVuZWRqcGFyYW1ldGVyc6FraW5ncmVkaWVudHOBomN1cmx4LXNlbGYjanVtYmY9YzJwYS5hc3NlcnRpb25zL2MycGEuaW5ncmVkaWVudC52M2RoYXNoWCABrB5cu1Yt2Tqx68iJe99DRYAwhOKUMdakmRrfAXdz9aRmYWN0aW9ueB1jb20uYW50aHJvcGljLmNsYXVkZS5wcm92aWRlZGpwYXJhbWV0ZXJzoXgfY29tLmFudGhyb3BpYy5vcmlnaW4tY29uZmlkZW5jZWd1bmtub3dua2Rlc2NyaXB0aW9ueGZDbGF1ZGUgcHJvdmlkZWQgdGhpcyBmaWxlIGF0IHRoZSByZXF1ZXN0IG9mIGEgdXNlciBhbmQgbWF5IGhhdmUgY3JlYXRlZCBvciBtb2RpZmllZCB0aGUgZmlsZSBjb250ZW50cy5tc29mdHdhcmVBZ2VudKFkbmFtZWZDbGF1ZGVyYWxsQWN0aW9uc0luY2x1ZGVk9QAAAMhqdW1iAAAAQGp1bWRjYm9yABEAEIAAAKoAOJtxE2MycGEuaGFzaC5kYXRhAAAAABhjMnNoIq3nAwsUbw1+AFsWegTobwAAAIBjYm9ypWNhbGdmc2hhMjU2Y3BhZE4AAAAAAAAAAAAAAAAAAGRoYXNoWCCwJuzk9VywIHBWk8zsIfThINoyydazde9IBgptX7sSRGRuYW1lbmp1bWJmIG1hbmlmZXN0amV4Y2x1c2lvbnOBomVzdGFydBRmbGVuZ3RoGRaLAAACPmp1bWIAAAAnanVtZGMyY2wAEQAQgAAAqgA4m3EDYzJwYS5jbGFpbS52MgAAAAIPY2JvcqVjYWxnZnNoYTI1NmlzaWduYXR1cmV4TXNlbGYjanVtYmY9L2MycGEvdXJuOmMycGE6ZjIxYzhmMDMtNjNmYi00ZDJkLWEzOWEtYjAwYTZiZmI4ODYxL2MycGEuc2lnbmF0dXJlamluc3RhbmNlSUR4LHhtcDppaWQ6N2UwMWY2YTYtZWU2NS00ZTZjLTgwZmItZTgzMGIxNWM4NjFkcmNyZWF0ZWRfYXNzZXJ0aW9uc4OiY3VybHgtc2VsZiNqdW1iZj1jMnBhLmFzc2VydGlvbnMvYzJwYS5pbmdyZWRpZW50LnYzZGhhc2hYIAGsHly7Vi3ZOrHryIl730NFgDCE4pQx1qSZGt8Bd3P1omN1cmx4KnNlbGYjanVtYmY9YzJwYS5hc3NlcnRpb25zL2MycGEuYWN0aW9ucy52MmRoYXNoWCDplMdUvRNg2bk4tHBgZA9Glmt3qcyVVzJgmXAEJM3AqqJjdXJseClzZWxmI2p1bWJmPWMycGEuYXNzZXJ0aW9ucy9jMnBhLmhhc2guZGF0YWRoYXNoWCBwsX3049E/nfpMOlZNk8N714S3wVOlZOUvbk0CVheok3RjbGFpbV9nZW5lcmF0b3JfaW5mb6NkbmFtZW9BbnRocm9waWMgRmlsZXNndmVyc2lvbmUxLjAuMGtzcGVjVmVyc2lvbmUyLjQuMAAAEDhqdW1iAAAAKGp1bWRjMmNzABEAEIAAAKoAOJtxA2MycGEuc2lnbmF0dXJlAAAAEAhjYm9y0oRZAhKiASYYIVkCCjCCAgYwggGNoAMCAQICFEDloAruwjnQvriD+gZCBT1nVRMAMAoGCCqGSM49BAMDMEkxFzAVBgNVBAoTDkFudGhyb3BpYywgUEJDMS4wLAYDVQQDEyVBbnRocm9waWMgQ29udGVudCBDcmVkZW50aWFscyBSb290IENBMB4XDTI2MDgwNzE4NDM1NloXDTI4MDgwNjE5NDM1NlowRDEXMBUGA1UEChMOQW50aHJvcGljLCBQQkMxKTAnBgNVBAMTIEFudGhyb3BpYyBDbGF1ZGUgQ29udGVudCBTaWduaW5nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEmHoKa8tQGAUU1TS9QqU5W0Tp2N3XsvlK7BfQt6YWKwEzd2R3/dzKPEUDdCjlLjp9fT+KFjRVnuZ9v0oXvTe3k6NYMFYwDgYDVR0PAQH/BAQDAgeAMBUGA1UdJQQOMAwGCisGAQQBg+heAgEwDAYDVR0TAQH/BAIwADAfBgNVHSMEGDAWgBTOUeIEgU5kWyP448TPmj6cwddcwjAKBggqhkjOPQQDAwNnADBkAjAxcx0UngF60stVjs5G4T2eiptsBk5mf9oCtfJPAUBl8qs/PEXa8+gk1/X5QJ2DVcYCMHBfXN31YapiSqYvlIWrDVDJKOvXMl+kkz37Wt0PBI8sw486Mq6JeOhT+lRR4b1HCaFjcGFkWQ2eAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA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",
 "PUX-ROVERO-KNOB-GD": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/6xaJSlACEQAAAAEAABZ/anVtYgAAAB5qdW1kYzJwYQARABCAAACqADibcQNjMnBhAAAAFllqdW1iAAAAR2p1bWRjMm1hABEAEIAAAKoAOJtxA3VybjpjMnBhOmM4ZTY5MDY4LTRhNTctNDUyMi04N2VkLTJkNDYyZWNiZGRjZgAAAAOUanVtYgAAAClqdW1kYzJhcwARABCAAACqADibcQNjMnBhLmFzc2VydGlvbnMAAAAAuWp1bWIAAABEanVtZGNib3IAEQAQgAAAqgA4m3ETYzJwYS5pbmdyZWRpZW50LnYzAAAAABhjMnNoj70B1m55Xu15TRX5d5hTLwAAAG1jYm9yo2lkYzpmb3JtYXRqaW1hZ2UvanBlZ2ppbnN0YW5jZUlEeCx4bXA6aWlkOmU2MTEzMTY5LWFmOWQtNDU0MC04MTE1LTI3MzdiMGJmNDkxOGxyZWxhdGlvbnNoaXBocGFyZW50T2YAAAHianVtYgAAAEFqdW1kY2JvcgARABCAAACqADibcRNjMnBhLmFjdGlvbnMudjIAAAAAGGMyc2iGWVLxOCJ3LE2ZSE8heKYkAAABmWNib3KiZ2FjdGlvbnOComZhY3Rpb25rYzJwYS5vcGVuZWRqcGFyYW1ldGVyc6FraW5ncmVkaWVudHOBomN1cmx4LXNlbGYjanVtYmY9YzJwYS5hc3NlcnRpb25zL2MycGEuaW5ncmVkaWVudC52M2RoYXNoWCCgsUuCgz8nryWV/poDQVlRL/zDilx8IowSyFMCJpPjj6RmYWN0aW9ueB1jb20uYW50aHJvcGljLmNsYXVkZS5wcm92aWRlZGpwYXJhbWV0ZXJzoXgfY29tLmFudGhyb3BpYy5vcmlnaW4tY29uZmlkZW5jZWd1bmtub3dua2Rlc2NyaXB0aW9ueGZDbGF1ZGUgcHJvdmlkZWQgdGhpcyBmaWxlIGF0IHRoZSByZXF1ZXN0IG9mIGEgdXNlciBhbmQgbWF5IGhhdmUgY3JlYXRlZCBvciBtb2RpZmllZCB0aGUgZmlsZSBjb250ZW50cy5tc29mdHdhcmVBZ2VudKFkbmFtZWZDbGF1ZGVyYWxsQWN0aW9uc0luY2x1ZGVk9QAAAMhqdW1iAAAAQGp1bWRjYm9yABEAEIAAAKoAOJtxE2MycGEuaGFzaC5kYXRhAAAAABhjMnNomezy1VzZdAe8eme50crKEwAAAIBjYm9ypWNhbGdmc2hhMjU2Y3BhZE4AAAAAAAAAAAAAAAAAAGRoYXNoWCApWJAvuhQIoC0WNwk7n8CDnj+2iQnXssvBesP0d6vc5mRuYW1lbmp1bWJmIG1hbmlmZXN0amV4Y2x1c2lvbnOBomVzdGFydBRmbGVuZ3RoGRaLAAACPmp1bWIAAAAnanVtZGMyY2wAEQAQgAAAqgA4m3EDYzJwYS5jbGFpbS52MgAAAAIPY2JvcqVjYWxnZnNoYTI1NmlzaWduYXR1cmV4TXNlbGYjanVtYmY9L2MycGEvdXJuOmMycGE6YzhlNjkwNjgtNGE1Ny00NTIyLTg3ZWQtMmQ0NjJlY2JkZGNmL2MycGEuc2lnbmF0dXJlamluc3RhbmNlSUR4LHhtcDppaWQ6NWYxNzg0ZGItNTBlYy00YzQ4LWIwYTQtOTVjMmQ0ZjkwN2Y1cmNyZWF0ZWRfYXNzZXJ0aW9uc4OiY3VybHgtc2VsZiNqdW1iZj1jMnBhLmFzc2VydGlvbnMvYzJwYS5pbmdyZWRpZW50LnYzZGhhc2hYIKCxS4KDPyevJZX+mgNBWVEv/MOKXHwijBLIUwImk+OPomN1cmx4KnNlbGYjanVtYmY9YzJwYS5hc3NlcnRpb25zL2MycGEuYWN0aW9ucy52MmRoYXNoWCD76k1oKNBvaLZxx5RkCzmatTEb5yxuCwixT4lGZ8ZHxKJjdXJseClzZWxmI2p1bWJmPWMycGEuYXNzZXJ0aW9ucy9jMnBhLmhhc2guZGF0YWRoYXNoWCBRZWRo5AIolXgRf2ZgMH6eNZ1YhBCTmOTgkvS5Lpn333RjbGFpbV9nZW5lcmF0b3JfaW5mb6NkbmFtZW9BbnRocm9waWMgRmlsZXNndmVyc2lvbmUxLjAuMGtzcGVjVmVyc2lvbmUyLjQuMAAAEDhqdW1iAAAAKGp1bWRjMmNzABEAEIAAAKoAOJtxA2MycGEuc2lnbmF0dXJlAAAAEAhjYm9y0oRZAhKiASYYIVkCCjCCAgYwggGNoAMCAQICFEDloAruwjnQvriD+gZCBT1nVRMAMAoGCCqGSM49BAMDMEkxFzAVBgNVBAoTDkFudGhyb3BpYywgUEJDMS4wLAYDVQQDEyVBbnRocm9waWMgQ29udGVudCBDcmVkZW50aWFscyBSb290IENBMB4XDTI2MDgwNzE4NDM1NloXDTI4MDgwNjE5NDM1NlowRDEXMBUGA1UEChMOQW50aHJvcGljLCBQQkMxKTAnBgNVBAMTIEFudGhyb3BpYyBDbGF1ZGUgQ29udGVudCBTaWduaW5nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEmHoKa8tQGAUU1TS9QqU5W0Tp2N3XsvlK7BfQt6YWKwEzd2R3/dzKPEUDdCjlLjp9fT+KFjRVnuZ9v0oXvTe3k6NYMFYwDgYDVR0PAQH/BAQDAgeAMBUGA1UdJQQOMAwGCisGAQQBg+heAgEwDAYDVR0TAQH/BAIwADAfBgNVHSMEGDAWgBTOUeIEgU5kWyP448TPmj6cwddcwjAKBggqhkjOPQQDAwNnADBkAjAxcx0UngF60stVjs5G4T2eiptsBk5mf9oCtfJPAUBl8qs/PEXa8+gk1/X5QJ2DVcYCMHBfXN31YapiSqYvlIWrDVDJKOvXMl+kkz37Wt0PBI8sw486Mq6JeOhT+lRR4b1HCaFjcGFkWQ2eAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA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",
 "PUX-ROVERO-T-BK": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/6xaJSlACEQAAAAEAABZ/anVtYgAAAB5qdW1kYzJwYQARABCAAACqADibcQNjMnBhAAAAFllqdW1iAAAAR2p1bWRjMm1hABEAEIAAAKoAOJtxA3VybjpjMnBhOmNiZmQ3ODBlLTUyMDQtNDViYi05YmE0LTQ1Y2YwMGZhOWIyYwAAAAOUanVtYgAAAClqdW1kYzJhcwARABCAAACqADibcQNjMnBhLmFzc2VydGlvbnMAAAAAuWp1bWIAAABEanVtZGNib3IAEQAQgAAAqgA4m3ETYzJwYS5pbmdyZWRpZW50LnYzAAAAABhjMnNoecky2ZMN74Naf2W4dFSJTgAAAG1jYm9yo2lkYzpmb3JtYXRqaW1hZ2UvanBlZ2ppbnN0YW5jZUlEeCx4bXA6aWlkOmZjM2VmYWRiLTNiNWYtNDg2ZS05YzlkLTczMjRhZjQzNzMxZGxyZWxhdGlvbnNoaXBocGFyZW50T2YAAAHianVtYgAAAEFqdW1kY2JvcgARABCAAACqADibcRNjMnBhLmFjdGlvbnMudjIAAAAAGGMyc2j+4wk9RvAjoW1yYsU63RzXAAABmWNib3KiZ2FjdGlvbnOComZhY3Rpb25rYzJwYS5vcGVuZWRqcGFyYW1ldGVyc6FraW5ncmVkaWVudHOBomN1cmx4LXNlbGYjanVtYmY9YzJwYS5hc3NlcnRpb25zL2MycGEuaW5ncmVkaWVudC52M2RoYXNoWCC71RzsHC3jBQ27i7yPFuELgA0rztt3rHPHRUwJ1DB78aRmYWN0aW9ueB1jb20uYW50aHJvcGljLmNsYXVkZS5wcm92aWRlZGpwYXJhbWV0ZXJzoXgfY29tLmFudGhyb3BpYy5vcmlnaW4tY29uZmlkZW5jZWd1bmtub3dua2Rlc2NyaXB0aW9ueGZDbGF1ZGUgcHJvdmlkZWQgdGhpcyBmaWxlIGF0IHRoZSByZXF1ZXN0IG9mIGEgdXNlciBhbmQgbWF5IGhhdmUgY3JlYXRlZCBvciBtb2RpZmllZCB0aGUgZmlsZSBjb250ZW50cy5tc29mdHdhcmVBZ2VudKFkbmFtZWZDbGF1ZGVyYWxsQWN0aW9uc0luY2x1ZGVk9QAAAMhqdW1iAAAAQGp1bWRjYm9yABEAEIAAAKoAOJtxE2MycGEuaGFzaC5kYXRhAAAAABhjMnNobUhWnlXvVLe9d4lMj7iFXwAAAIBjYm9ypWNhbGdmc2hhMjU2Y3BhZE4AAAAAAAAAAAAAAAAAAGRoYXNoWCCIW6BM5PiB79xumrmmfPJXU0UJdHlFoEQG19UuYtxEd2RuYW1lbmp1bWJmIG1hbmlmZXN0amV4Y2x1c2lvbnOBomVzdGFydBRmbGVuZ3RoGRaLAAACPmp1bWIAAAAnanVtZGMyY2wAEQAQgAAAqgA4m3EDYzJwYS5jbGFpbS52MgAAAAIPY2JvcqVjYWxnZnNoYTI1NmlzaWduYXR1cmV4TXNlbGYjanVtYmY9L2MycGEvdXJuOmMycGE6Y2JmZDc4MGUtNTIwNC00NWJiLTliYTQtNDVjZjAwZmE5YjJjL2MycGEuc2lnbmF0dXJlamluc3RhbmNlSUR4LHhtcDppaWQ6MWYyMzdjNmMtNzg2My00MzNlLWEzMjMtYmEwNTJiMDE4NjM5cmNyZWF0ZWRfYXNzZXJ0aW9uc4OiY3VybHgtc2VsZiNqdW1iZj1jMnBhLmFzc2VydGlvbnMvYzJwYS5pbmdyZWRpZW50LnYzZGhhc2hYILvVHOwcLeMFDbuLvI8W4QuADSvO23esc8dFTAnUMHvxomN1cmx4KnNlbGYjanVtYmY9YzJwYS5hc3NlcnRpb25zL2MycGEuYWN0aW9ucy52MmRoYXNoWCChWyOKUuY3IFD+M7WtLno0pck0LTa5lANxax6HWMtecaJjdXJseClzZWxmI2p1bWJmPWMycGEuYXNzZXJ0aW9ucy9jMnBhLmhhc2guZGF0YWRoYXNoWCA9bcg/8Y3lYMoz1kUX7m7nrq57HJZQQI70ZXbCNkiQpnRjbGFpbV9nZW5lcmF0b3JfaW5mb6NkbmFtZW9BbnRocm9waWMgRmlsZXNndmVyc2lvbmUxLjAuMGtzcGVjVmVyc2lvbmUyLjQuMAAAEDhqdW1iAAAAKGp1bWRjMmNzABEAEIAAAKoAOJtxA2MycGEuc2lnbmF0dXJlAAAAEAhjYm9y0oRZAhKiASYYIVkCCjCCAgYwggGNoAMCAQICFEDloAruwjnQvriD+gZCBT1nVRMAMAoGCCqGSM49BAMDMEkxFzAVBgNVBAoTDkFudGhyb3BpYywgUEJDMS4wLAYDVQQDEyVBbnRocm9waWMgQ29udGVudCBDcmVkZW50aWFscyBSb290IENBMB4XDTI2MDgwNzE4NDM1NloXDTI4MDgwNjE5NDM1NlowRDEXMBUGA1UEChMOQW50aHJvcGljLCBQQkMxKTAnBgNVBAMTIEFudGhyb3BpYyBDbGF1ZGUgQ29udGVudCBTaWduaW5nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEmHoKa8tQGAUU1TS9QqU5W0Tp2N3XsvlK7BfQt6YWKwEzd2R3/dzKPEUDdCjlLjp9fT+KFjRVnuZ9v0oXvTe3k6NYMFYwDgYDVR0PAQH/BAQDAgeAMBUGA1UdJQQOMAwGCisGAQQBg+heAgEwDAYDVR0TAQH/BAIwADAfBgNVHSMEGDAWgBTOUeIEgU5kWyP448TPmj6cwddcwjAKBggqhkjOPQQDAwNnADBkAjAxcx0UngF60stVjs5G4T2eiptsBk5mf9oCtfJPAUBl8qs/PEXa8+gk1/X5QJ2DVcYCMHBfXN31YapiSqYvlIWrDVDJKOvXMl+kkz37Wt0PBI8sw486Mq6JeOhT+lRR4b1HCaFjcGFkWQ2eAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA9lhAH+xNrqMSN/V2DeeTr4dimfCum4TrXnBs08tVJMZAvFtdK8dxP6lsiPEc8NCPWJP0JXFZr/wv4DDZyiX8QP4Xnv/bAEMABgQEBQQEBgUFBQYGBgcJDgkJCAgJEg0NCg4VEhYWFRIUFBcaIRwXGB8ZFBQdJx0fIiMlJSUWHCksKCQrISQlJP/bAEMBBgYGCQgJEQkJESQYFBgkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJP/AABEIANwA3AMBIgACEQEDEQH/xAAfAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgv/xAC1EAACAQMDAgQDBQUEBAAAAX0BAgMABBEFEiExQQYTUWEHInEUMoGRoQgjQrHBFVLR8CQzYnKCCQoWFxgZGiUmJygpKjQ1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4eLj5OXm5+jp6vHy8/T19vf4+fr/xAAfAQADAQEBAQEBAQEBAAAAAAAAAQIDBAUGBwgJCgv/xAC1EQACAQIEBAMEBwUEBAABAncAAQIDEQQFITEGEkFRB2FxEyIygQgUQpGhscEJIzNS8BVictEKFiQ04SXxFxgZGiYnKCkqNTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2dri4+Tl5ufo6ery8/T19vf4+fr/2gAMAwEAAhEDEQA/APqiiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooqnqms6bolsbnU7+1soBn95cShB+vWgC5RXj/ij9p7wXooePShda3MpwPIXy4if99uv4A57V5L4i/ag8banPu0w2ejwAkKkUSyuxHUMz9x34AHfHSgD66pGZUUsxAUckk8Cvk6L9qrxb/ZItprTTxdAE/bY4zuYdiUJ2g++OeyiuC134neLfFUhN5qd5Mp/haQ7f8AvkcD8qAPu1HSRQ6MrKehU5Bp1fFXw3+IPirwPq6XcFzJPZOw+0WErnypV74H8LejD8civsXw/rtl4l0e21bT5PMtrlNy56qe6kdiDkH6UAaFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRVTUtW0/RrZrrUr22srdestxIEX8zQBboryPxR+014K0PdFphudcuBwBartiJ9N7d/oDXkHif9p/xlrYeLSvsei256NAu+XHvI+QD7hee2aAPrDU9X07RbY3Op31rZQD/lpcSrGv5k15Z4o/ad8E6GXi01rnWp16fZ18uHPoZHx+gNfJ+r63qeu3jXOqX95fTE7TJcOztn05PX/Zz9SOlUjIrtgZz1+Vv5H0Hc9ui4oA9g8U/tOeNNZMkOlpb6HbsSgECeZN9C79D9AMdyK8q1TW9S1y6N3qd9cajcOciSeUu2McnLdB78Adg1V1jlT5GQsCAoAjJHP3VwAfl9F9eTSSRBFZiwj3c7ZCQzt0I+ZOSPXoBQAwk7tz8gcZOfmz699vv94+wqT7NNJ83lSZJ2KDESNyj7pABHToOg9zTlMUjmMtC6qzKfLniclcDONy9yfvH6CkMYB2xxrLnCbY4YmDkdApRgcDu3egCMxrwS0YBbcGdsFv8Aa+ZOx4JNbWmanaJZjzFRXXO351Ys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",
 "PUX-ROVERO-T-GD": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/6xaJSlACEQAAAAEAABZ/anVtYgAAAB5qdW1kYzJwYQARABCAAACqADibcQNjMnBhAAAAFllqdW1iAAAAR2p1bWRjMm1hABEAEIAAAKoAOJtxA3VybjpjMnBhOmI1NzgwZGI2LTg3YjMtNDQ4MS04NzkyLWI0OTJkZWY3YTM3NgAAAAOUanVtYgAAAClqdW1kYzJhcwARABCAAACqADibcQNjMnBhLmFzc2VydGlvbnMAAAAAuWp1bWIAAABEanVtZGNib3IAEQAQgAAAqgA4m3ETYzJwYS5pbmdyZWRpZW50LnYzAAAAABhjMnNokvUaBS7sJ7XuUjqZ65gNbwAAAG1jYm9yo2lkYzpmb3JtYXRqaW1hZ2UvanBlZ2ppbnN0YW5jZUlEeCx4bXA6aWlkOjQ3ODQ1NmM2LTIzOGUtNDllMS1hOTQ4LWQ3NTE3NWViMzc1YWxyZWxhdGlvbnNoaXBocGFyZW50T2YAAAHianVtYgAAAEFqdW1kY2JvcgARABCAAACqADibcRNjMnBhLmFjdGlvbnMudjIAAAAAGGMyc2iptp5rJxPSp4VSXY0s5vBqAAABmWNib3KiZ2FjdGlvbnOComZhY3Rpb25rYzJwYS5vcGVuZWRqcGFyYW1ldGVyc6FraW5ncmVkaWVudHOBomN1cmx4LXNlbGYjanVtYmY9YzJwYS5hc3NlcnRpb25zL2MycGEuaW5ncmVkaWVudC52M2RoYXNoWCAwvfg50g7yrQO7ysbA9jMcZg/fbTLyoMKjR3Vr6tOSLaRmYWN0aW9ueB1jb20uYW50aHJvcGljLmNsYXVkZS5wcm92aWRlZGpwYXJhbWV0ZXJzoXgfY29tLmFudGhyb3BpYy5vcmlnaW4tY29uZmlkZW5jZWd1bmtub3dua2Rlc2NyaXB0aW9ueGZDbGF1ZGUgcHJvdmlkZWQgdGhpcyBmaWxlIGF0IHRoZSByZXF1ZXN0IG9mIGEgdXNlciBhbmQgbWF5IGhhdmUgY3JlYXRlZCBvciBtb2RpZmllZCB0aGUgZmlsZSBjb250ZW50cy5tc29mdHdhcmVBZ2VudKFkbmFtZWZDbGF1ZGVyYWxsQWN0aW9uc0luY2x1ZGVk9QAAAMhqdW1iAAAAQGp1bWRjYm9yABEAEIAAAKoAOJtxE2MycGEuaGFzaC5kYXRhAAAAABhjMnNoDyljTaI+jfXICRiiaUkxCQAAAIBjYm9ypWNhbGdmc2hhMjU2Y3BhZE4AAAAAAAAAAAAAAAAAAGRoYXNoWCBLJoCfENF9rkfIJ5pGK5M5A9p1kYVLolS/sDxjdAYApGRuYW1lbmp1bWJmIG1hbmlmZXN0amV4Y2x1c2lvbnOBomVzdGFydBRmbGVuZ3RoGRaLAAACPmp1bWIAAAAnanVtZGMyY2wAEQAQgAAAqgA4m3EDYzJwYS5jbGFpbS52MgAAAAIPY2JvcqVjYWxnZnNoYTI1NmlzaWduYXR1cmV4TXNlbGYjanVtYmY9L2MycGEvdXJuOmMycGE6YjU3ODBkYjYtODdiMy00NDgxLTg3OTItYjQ5MmRlZjdhMzc2L2MycGEuc2lnbmF0dXJlamluc3RhbmNlSUR4LHhtcDppaWQ6YzJjNzhlYmItZTViNy00MWU0LWIxYzgtM2Q5Nzc0ZDE5MDk4cmNyZWF0ZWRfYXNzZXJ0aW9uc4OiY3VybHgtc2VsZiNqdW1iZj1jMnBhLmFzc2VydGlvbnMvYzJwYS5pbmdyZWRpZW50LnYzZGhhc2hYIDC9+DnSDvKtA7vKxsD2MxxmD99tMvKgwqNHdWvq05ItomN1cmx4KnNlbGYjanVtYmY9YzJwYS5hc3NlcnRpb25zL2MycGEuYWN0aW9ucy52MmRoYXNoWCBnQ1TIZjdjofl1N0J0IGnDRSIs9uoVfsoHNDdM4a6QlKJjdXJseClzZWxmI2p1bWJmPWMycGEuYXNzZXJ0aW9ucy9jMnBhLmhhc2guZGF0YWRoYXNoWCCxH2zj6DhGKRU7iQaFWVsMDVBq0xrW+LSiabl1NH4ZHXRjbGFpbV9nZW5lcmF0b3JfaW5mb6NkbmFtZW9BbnRocm9waWMgRmlsZXNndmVyc2lvbmUxLjAuMGtzcGVjVmVyc2lvbmUyLjQuMAAAEDhqdW1iAAAAKGp1bWRjMmNzABEAEIAAAKoAOJtxA2MycGEuc2lnbmF0dXJlAAAAEAhjYm9y0oRZAhKiASYYIVkCCjCCAgYwggGNoAMCAQICFEDloAruwjnQvriD+gZCBT1nVRMAMAoGCCqGSM49BAMDMEkxFzAVBgNVBAoTDkFudGhyb3BpYywgUEJDMS4wLAYDVQQDEyVBbnRocm9waWMgQ29udGVudCBDcmVkZW50aWFscyBSb290IENBMB4XDTI2MDgwNzE4NDM1NloXDTI4MDgwNjE5NDM1NlowRDEXMBUGA1UEChMOQW50aHJvcGljLCBQQkMxKTAnBgNVBAMTIEFudGhyb3BpYyBDbGF1ZGUgQ29udGVudCBTaWduaW5nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEmHoKa8tQGAUU1TS9QqU5W0Tp2N3XsvlK7BfQt6YWKwEzd2R3/dzKPEUDdCjlLjp9fT+KFjRVnuZ9v0oXvTe3k6NYMFYwDgYDVR0PAQH/BAQDAgeAMBUGA1UdJQQOMAwGCisGAQQBg+heAgEwDAYDVR0TAQH/BAIwADAfBgNVHSMEGDAWgBTOUeIEgU5kWyP448TPmj6cwddcwjAKBggqhkjOPQQDAwNnADBkAjAxcx0UngF60stVjs5G4T2eiptsBk5mf9oCtfJPAUBl8qs/PEXa8+gk1/X5QJ2DVcYCMHBfXN31YapiSqYvlIWrDVDJKOvXMl+kkz37Wt0PBI8sw486Mq6JeOhT+lRR4b1HCaFjcGFkWQ2eAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA9lhAO3wbu8ExlpYVz5BKKgXOiSYNZC7YjuoZ4Ccbk1myfry/igom/FxqS+qcVXgRIZ0GQF/Ad1lwmkTH45fAyBxsL//bAEMABgQEBQQEBgUFBQYGBgcJDgkJCAgJEg0NCg4VEhYWFRIUFBcaIRwXGB8ZFBQdJx0fIiMlJSUWHCksKCQrISQlJP/bAEMBBgYGCQgJEQkJESQYFBgkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJP/AABEIANwA3AMBIgACEQEDEQH/xAAfAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgv/xAC1EAACAQMDAgQDBQUEBAAAAX0BAgMABBEFEiExQQYTUWEHInEUMoGRoQgjQrHBFVLR8CQzYnKCCQoWFxgZGiUmJygpKjQ1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4eLj5OXm5+jp6vHy8/T19vf4+fr/xAAfAQADAQEBAQEBAQEBAAAAAAAAAQIDBAUGBwgJCgv/xAC1EQACAQIEBAMEBwUEBAABAncAAQIDEQQFITEGEkFRB2FxEyIygQgUQpGhscEJIzNS8BVictEKFiQ04SXxFxgZGiYnKCkqNTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2dri4+Tl5ufo6ery8/T19vf4+fr/2gAMAwEAAhEDEQA/APqiiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAoopCQoJJAA6k9qAForD1HxpoemZWS+SaQDPlwfvG9+n+RXN3fxRkkk/4l+nr5WMrJOx+cHpgL69hnJ7A1hUxNOHxM0jSnLZHoFFefXHxVNvaA/2U0lxkqSr/u8gc++R3AyB0JzxXN3nxD8UaqStuRaIf4YUwfzOTWbx1FK6dy1h5voey0V5t4P17xPBcAaiZL20c8iQfvE9we/0NejxusqK6HKsMg1pQxMKy90ipSlT3HUUUVuZhRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRTJp4rdDJNIkaDqzsAPzNAD6K5nUPiHoVkCIp3vHB24t1yMnoNxwMn06ntmuavPiPq1+zJYW0NkmTh3IdiB15OFXHfPH+1niuapi6UN2axozl0PSndY1LOwVR1JOAKwNR8daFp5KC7+1yjI8u2HmEn0z0z+NeZXl3falIG1G9nucANh920c8fJjgnsmNzdtg5ojs1ZtscbYHy8KGPrtAxhj/s8rH1O5ua4Kmar7COmGD/mZ01/8Tb+5OzS7GOJGwFllO9iT0AA4yew6n+ENXOXWoarq679Qv55VLBcFyIy3dVVcZb/AGV5B+8y9Kl8lc7ZlClspyxAdiMld5GcEdZM7n6DikRwob94ko2AlVZAWXkEYDDaFPBUdepzXm1cdVqbs6oYeMSrHYhsIigfOUYDHLjHyjjbvH94AIuejHmpsRoOHTBLMcy7DKQPnAJOQ396T7z+wq1IGGY/JnKf6lyLfcAm0ME+R8fLnjtxVeaa4gQs5kSRcFyWnQRuo4blWGWHB/rXM+Z7misthwRXUII5J4mwrGM4DqeUACtwvbaO4BNdBo13plvY7rmNIp42KtlCu8Z4YAjuOuOhyK5i4xOp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",
 "PUX-EDGE-152-BK": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/6xaJSlACEQAAAAEAABZ/anVtYgAAAB5qdW1kYzJwYQARABCAAACqADibcQNjMnBhAAAAFllqdW1iAAAAR2p1bWRjMm1hABEAEIAAAKoAOJtxA3VybjpjMnBhOjJjM2QyMzE3LTI3MWQtNDhiNy1hMWMxLWFmMTZmZDA0NDFmOAAAAAOUanVtYgAAAClqdW1kYzJhcwARABCAAACqADibcQNjMnBhLmFzc2VydGlvbnMAAAAAuWp1bWIAAABEanVtZGNib3IAEQAQgAAAqgA4m3ETYzJwYS5pbmdyZWRpZW50LnYzAAAAABhjMnNoSIYt5AxBi+4/YpZl60AtzQAAAG1jYm9yo2lkYzpmb3JtYXRqaW1hZ2UvanBlZ2ppbnN0YW5jZUlEeCx4bXA6aWlkOjExODU3NzJkLTA4MTMtNDlhYy04OGRkLTY3MTZmNzkyY2VkNWxyZWxhdGlvbnNoaXBocGFyZW50T2YAAAHianVtYgAAAEFqdW1kY2JvcgARABCAAACqADibcRNjMnBhLmFjdGlvbnMudjIAAAAAGGMyc2gjOoAuTxqu7Rz5wi3zflyeAAABmWNib3KiZ2FjdGlvbnOComZhY3Rpb25rYzJwYS5vcGVuZWRqcGFyYW1ldGVyc6FraW5ncmVkaWVudHOBomN1cmx4LXNlbGYjanVtYmY9YzJwYS5hc3NlcnRpb25zL2MycGEuaW5ncmVkaWVudC52M2RoYXNoWCCVsA8PCYZ3ZjGpQN3AvowRV7OK/P9HEVPD2V67HSsqE6RmYWN0aW9ueB1jb20uYW50aHJvcGljLmNsYXVkZS5wcm92aWRlZGpwYXJhbWV0ZXJzoXgfY29tLmFudGhyb3BpYy5vcmlnaW4tY29uZmlkZW5jZWd1bmtub3dua2Rlc2NyaXB0aW9ueGZDbGF1ZGUgcHJvdmlkZWQgdGhpcyBmaWxlIGF0IHRoZSByZXF1ZXN0IG9mIGEgdXNlciBhbmQgbWF5IGhhdmUgY3JlYXRlZCBvciBtb2RpZmllZCB0aGUgZmlsZSBjb250ZW50cy5tc29mdHdhcmVBZ2VudKFkbmFtZWZDbGF1ZGVyYWxsQWN0aW9uc0luY2x1ZGVk9QAAAMhqdW1iAAAAQGp1bWRjYm9yABEAEIAAAKoAOJtxE2MycGEuaGFzaC5kYXRhAAAAABhjMnNoYgtgBkzNDSBtJbiNLWyVdQAAAIBjYm9ypWNhbGdmc2hhMjU2Y3BhZE4AAAAAAAAAAAAAAAAAAGRoYXNoWCCHtXXCLmG6kxVvw13SeafVTp6enzI84sZPCz1Oyx6EvmRuYW1lbmp1bWJmIG1hbmlmZXN0amV4Y2x1c2lvbnOBomVzdGFydBRmbGVuZ3RoGRaLAAACPmp1bWIAAAAnanVtZGMyY2wAEQAQgAAAqgA4m3EDYzJwYS5jbGFpbS52MgAAAAIPY2JvcqVjYWxnZnNoYTI1NmlzaWduYXR1cmV4TXNlbGYjanVtYmY9L2MycGEvdXJuOmMycGE6MmMzZDIzMTctMjcxZC00OGI3LWExYzEtYWYxNmZkMDQ0MWY4L2MycGEuc2lnbmF0dXJlamluc3RhbmNlSUR4LHhtcDppaWQ6NDFhODg4YWEtODlmZC00YWVjLTlhZDctNDI5Yzk3NzE2MWQ2cmNyZWF0ZWRfYXNzZXJ0aW9uc4OiY3VybHgtc2VsZiNqdW1iZj1jMnBhLmFzc2VydGlvbnMvYzJwYS5pbmdyZWRpZW50LnYzZGhhc2hYIJWwDw8JhndmMalA3cC+jBFXs4r8/0cRU8PZXrsdKyoTomN1cmx4KnNlbGYjanVtYmY9YzJwYS5hc3NlcnRpb25zL2MycGEuYWN0aW9ucy52MmRoYXNoWCBb5RPUqBtd//DyaUhQFuiJmxK/xb9oBgAtrnPoOyri4KJjdXJseClzZWxmI2p1bWJmPWMycGEuYXNzZXJ0aW9ucy9jMnBhLmhhc2guZGF0YWRoYXNoWCBfCYpRnUE/BoyERkUY6c+V0Hat9z/C95hIXgS7A4l5xHRjbGFpbV9nZW5lcmF0b3JfaW5mb6NkbmFtZW9BbnRocm9waWMgRmlsZXNndmVyc2lvbmUxLjAuMGtzcGVjVmVyc2lvbmUyLjQuMAAAEDhqdW1iAAAAKGp1bWRjMmNzABEAEIAAAKoAOJtxA2MycGEuc2lnbmF0dXJlAAAAEAhjYm9y0oRZAhKiASYYIVkCCjCCAgYwggGNoAMCAQICFEDloAruwjnQvriD+gZCBT1nVRMAMAoGCCqGSM49BAMDMEkxFzAVBgNVBAoTDkFudGhyb3BpYywgUEJDMS4wLAYDVQQDEyVBbnRocm9waWMgQ29udGVudCBDcmVkZW50aWFscyBSb290IENBMB4XDTI2MDgwNzE4NDM1NloXDTI4MDgwNjE5NDM1NlowRDEXMBUGA1UEChMOQW50aHJvcGljLCBQQkMxKTAnBgNVBAMTIEFudGhyb3BpYyBDbGF1ZGUgQ29udGVudCBTaWduaW5nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEmHoKa8tQGAUU1TS9QqU5W0Tp2N3XsvlK7BfQt6YWKwEzd2R3/dzKPEUDdCjlLjp9fT+KFjRVnuZ9v0oXvTe3k6NYMFYwDgYDVR0PAQH/BAQDAgeAMBUGA1UdJQQOMAwGCisGAQQBg+heAgEwDAYDVR0TAQH/BAIwADAfBgNVHSMEGDAWgBTOUeIEgU5kWyP448TPmj6cwddcwjAKBggqhkjOPQQDAwNnADBkAjAxcx0UngF60stVjs5G4T2eiptsBk5mf9oCtfJPAUBl8qs/PEXa8+gk1/X5QJ2DVcYCMHBfXN31YapiSqYvlIWrDVDJKOvXMl+kkz37Wt0PBI8sw486Mq6JeOhT+lRR4b1HCaFjcGFkWQ2eAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA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okeV1hbcse48KG79M59672kAAGBS0AFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABVW7sorlCrqDmrVFAHn2v+FeWktxg14b49+FdtfvLcaYqWF/ySuMQyn3A+6fcceor6xdAwwRWLq+hQXiH5Bn1oA/PbWdJvdHvXtNStpLededrDqPUHoR7is1kr7N8a+BLbU7RrbUbVbiDqp6NGfVW6g14B4p+E2safI8mjj+0bQchRhZl9ivRvqPyoA8s21LbQyXFwkMSlnc4AUZP5V0EPg7xDcXAgj0bUPMJxg27D+le6/Bv4SNo13Fq+vqjX64aC3BDCFv7zHoW9AOB15PQA6r4P+BF8L6En2mMf2ndANcH+4O0Y+nf1OfavV7CwwBkVJptjgAkVtRxhBgCgCOGEIOlT0UUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAEFxbRzKQ6g1z9/4bikYsi4rp6KAONj8POrck4rZsNLEOMitjApaAGRoEGBT6KKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD/2Q==",
 "PUX-EDGE-300-BK": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/6xaJSlACEQAAAAEAABZ/anVtYgAAAB5qdW1kYzJwYQARABCAAACqADibcQNjMnBhAAAAFllqdW1iAAAAR2p1bWRjMm1hABEAEIAAAKoAOJtxA3VybjpjMnBhOjJjM2QyMzE3LTI3MWQtNDhiNy1hMWMxLWFmMTZmZDA0NDFmOAAAAAOUanVtYgAAAClqdW1kYzJhcwARABCAAACqADibcQNjMnBhLmFzc2VydGlvbnMAAAAAuWp1bWIAAABEanVtZGNib3IAEQAQgAAAqgA4m3ETYzJwYS5pbmdyZWRpZW50LnYzAAAAABhjMnNoSIYt5AxBi+4/YpZl60AtzQAAAG1jYm9yo2lkYzpmb3JtYXRqaW1hZ2UvanBlZ2ppbnN0YW5jZUlEeCx4bXA6aWlkOjExODU3NzJkLTA4MTMtNDlhYy04OGRkLTY3MTZmNzkyY2VkNWxyZWxhdGlvbnNoaXBocGFyZW50T2YAAAHianVtYgAAAEFqdW1kY2JvcgARABCAAACqADibcRNjMnBhLmFjdGlvbnMudjIAAAAAGGMyc2gjOoAuTxqu7Rz5wi3zflyeAAABmWNib3KiZ2FjdGlvbnOComZhY3Rpb25rYzJwYS5vcGVuZWRqcGFyYW1ldGVyc6FraW5ncmVkaWVudHOBomN1cmx4LXNlbGYjanVtYmY9YzJwYS5hc3NlcnRpb25zL2MycGEuaW5ncmVkaWVudC52M2RoYXNoWCCVsA8PCYZ3ZjGpQN3AvowRV7OK/P9HEVPD2V67HSsqE6RmYWN0aW9ueB1jb20uYW50aHJvcGljLmNsYXVkZS5wcm92aWRlZGpwYXJhbWV0ZXJzoXgfY29tLmFudGhyb3BpYy5vcmlnaW4tY29uZmlkZW5jZWd1bmtub3dua2Rlc2NyaXB0aW9ueGZDbGF1ZGUgcHJvdmlkZWQgdGhpcyBmaWxlIGF0IHRoZSByZXF1ZXN0IG9mIGEgdXNlciBhbmQgbWF5IGhhdmUgY3JlYXRlZCBvciBtb2RpZmllZCB0aGUgZmlsZSBjb250ZW50cy5tc29mdHdhcmVBZ2VudKFkbmFtZWZDbGF1ZGVyYWxsQWN0aW9uc0luY2x1ZGVk9QAAAMhqdW1iAAAAQGp1bWRjYm9yABEAEIAAAKoAOJtxE2MycGEuaGFzaC5kYXRhAAAAABhjMnNoYgtgBkzNDSBtJbiNLWyVdQAAAIBjYm9ypWNhbGdmc2hhMjU2Y3BhZE4AAAAAAAAAAAAAAAAAAGRoYXNoWCCHtXXCLmG6kxVvw13SeafVTp6enzI84sZPCz1Oyx6EvmRuYW1lbmp1bWJmIG1hbmlmZXN0amV4Y2x1c2lvbnOBomVzdGFydBRmbGVuZ3RoGRaLAAACPmp1bWIAAAAnanVtZGMyY2wAEQAQgAAAqgA4m3EDYzJwYS5jbGFpbS52MgAAAAIPY2JvcqVjYWxnZnNoYTI1NmlzaWduYXR1cmV4TXNlbGYjanVtYmY9L2MycGEvdXJuOmMycGE6MmMzZDIzMTctMjcxZC00OGI3LWExYzEtYWYxNmZkMDQ0MWY4L2MycGEuc2lnbmF0dXJlamluc3RhbmNlSUR4LHhtcDppaWQ6NDFhODg4YWEtODlmZC00YWVjLTlhZDctNDI5Yzk3NzE2MWQ2cmNyZWF0ZWRfYXNzZXJ0aW9uc4OiY3VybHgtc2VsZiNqdW1iZj1jMnBhLmFzc2VydGlvbnMvYzJwYS5pbmdyZWRpZW50LnYzZGhhc2hYIJWwDw8JhndmMalA3cC+jBFXs4r8/0cRU8PZXrsdKyoTomN1cmx4KnNlbGYjanVtYmY9YzJwYS5hc3NlcnRpb25zL2MycGEuYWN0aW9ucy52MmRoYXNoWCBb5RPUqBtd//DyaUhQFuiJmxK/xb9oBgAtrnPoOyri4KJjdXJseClzZWxmI2p1bWJmPWMycGEuYXNzZXJ0aW9ucy9jMnBhLmhhc2guZGF0YWRoYXNoWCBfCYpRnUE/BoyERkUY6c+V0Hat9z/C95hIXgS7A4l5xHRjbGFpbV9nZW5lcmF0b3JfaW5mb6NkbmFtZW9BbnRocm9waWMgRmlsZXNndmVyc2lvbmUxLjAuMGtzcGVjVmVyc2lvbmUyLjQuMAAAEDhqdW1iAAAAKGp1bWRjMmNzABEAEIAAAKoAOJtxA2MycGEuc2lnbmF0dXJlAAAAEAhjYm9y0oRZAhKiASYYIVkCCjCCAgYwggGNoAMCAQICFEDloAruwjnQvriD+gZCBT1nVRMAMAoGCCqGSM49BAMDMEkxFzAVBgNVBAoTDkFudGhyb3BpYywgUEJDMS4wLAYDVQQDEyVBbnRocm9waWMgQ29udGVudCBDcmVkZW50aWFscyBSb290IENBMB4XDTI2MDgwNzE4NDM1NloXDTI4MDgwNjE5NDM1NlowRDEXMBUGA1UEChMOQW50aHJvcGljLCBQQkMxKTAnBgNVBAMTIEFudGhyb3BpYyBDbGF1ZGUgQ29udGVudCBTaWduaW5nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEmHoKa8tQGAUU1TS9QqU5W0Tp2N3XsvlK7BfQt6YWKwEzd2R3/dzKPEUDdCjlLjp9fT+KFjRVnuZ9v0oXvTe3k6NYMFYwDgYDVR0PAQH/BAQDAgeAMBUGA1UdJQQOMAwGCisGAQQBg+heAgEwDAYDVR0TAQH/BAIwADAfBgNVHSMEGDAWgBTOUeIEgU5kWyP448TPmj6cwddcwjAKBggqhkjOPQQDAwNnADBkAjAxcx0UngF60stVjs5G4T2eiptsBk5mf9oCtfJPAUBl8qs/PEXa8+gk1/X5QJ2DVcYCMHBfXN31YapiSqYvlIWrDVDJKOvXMl+kkz37Wt0PBI8sw486Mq6JeOhT+lRR4b1HCaFjcGFkWQ2eAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA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okeV1hbcse48KG79M59672kAAGBS0AFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABVW7sorlCrqDmrVFAHn2v+FeWktxg14b49+FdtfvLcaYqWF/ySuMQyn3A+6fcceor6xdAwwRWLq+hQXiH5Bn1oA/PbWdJvdHvXtNStpLededrDqPUHoR7is1kr7N8a+BLbU7RrbUbVbiDqp6NGfVW6g14B4p+E2safI8mjj+0bQchRhZl9ivRvqPyoA8s21LbQyXFwkMSlnc4AUZP5V0EPg7xDcXAgj0bUPMJxg27D+le6/Bv4SNo13Fq+vqjX64aC3BDCFv7zHoW9AOB15PQA6r4P+BF8L6En2mMf2ndANcH+4O0Y+nf1OfavV7CwwBkVJptjgAkVtRxhBgCgCOGEIOlT0UUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAEFxbRzKQ6g1z9/4bikYsi4rp6KAONj8POrck4rZsNLEOMitjApaAGRoEGBT6KKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD/2Q==",
 "PUX-EDGE-152-GD": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/6xaJSlACEQAAAAEAABZ/anVtYgAAAB5qdW1kYzJwYQARABCAAACqADibcQNjMnBhAAAAFllqdW1iAAAAR2p1bWRjMm1hABEAEIAAAKoAOJtxA3VybjpjMnBhOjU0OTVkZGUwLWE0MDQtNDk1Ny04MDJlLTQ3YTlhNjUwMTAwYgAAAAOUanVtYgAAAClqdW1kYzJhcwARABCAAACqADibcQNjMnBhLmFzc2VydGlvbnMAAAAAuWp1bWIAAABEanVtZGNib3IAEQAQgAAAqgA4m3ETYzJwYS5pbmdyZWRpZW50LnYzAAAAABhjMnNoOn/5va1rnlSNgiwofAvFxAAAAG1jYm9yo2lkYzpmb3JtYXRqaW1hZ2UvanBlZ2ppbnN0YW5jZUlEeCx4bXA6aWlkOmM1ZTY3MWJkLTI4NWQtNGUwMi04M2Y0LWIyOWQ1MzkzYjI5OWxyZWxhdGlvbnNoaXBocGFyZW50T2YAAAHianVtYgAAAEFqdW1kY2JvcgARABCAAACqADibcRNjMnBhLmFjdGlvbnMudjIAAAAAGGMyc2j57lnDaGh/IwPPWSlSqjugAAABmWNib3KiZ2FjdGlvbnOComZhY3Rpb25rYzJwYS5vcGVuZWRqcGFyYW1ldGVyc6FraW5ncmVkaWVudHOBomN1cmx4LXNlbGYjanVtYmY9YzJwYS5hc3NlcnRpb25zL2MycGEuaW5ncmVkaWVudC52M2RoYXNoWCDk5spw5UdeI9gWl3l1NFbdf3yvibzyDKUl+34haxsSVaRmYWN0aW9ueB1jb20uYW50aHJvcGljLmNsYXVkZS5wcm92aWRlZGpwYXJhbWV0ZXJzoXgfY29tLmFudGhyb3BpYy5vcmlnaW4tY29uZmlkZW5jZWd1bmtub3dua2Rlc2NyaXB0aW9ueGZDbGF1ZGUgcHJvdmlkZWQgdGhpcyBmaWxlIGF0IHRoZSByZXF1ZXN0IG9mIGEgdXNlciBhbmQgbWF5IGhhdmUgY3JlYXRlZCBvciBtb2RpZmllZCB0aGUgZmlsZSBjb250ZW50cy5tc29mdHdhcmVBZ2VudKFkbmFtZWZDbGF1ZGVyYWxsQWN0aW9uc0luY2x1ZGVk9QAAAMhqdW1iAAAAQGp1bWRjYm9yABEAEIAAAKoAOJtxE2MycGEuaGFzaC5kYXRhAAAAABhjMnNoMn41NdrmwAp7fP3j9khVYAAAAIBjYm9ypWNhbGdmc2hhMjU2Y3BhZE4AAAAAAAAAAAAAAAAAAGRoYXNoWCAFxmivSRJ+x2tFKvAiBtquZooxHu+EpjkrJopJNurv+mRuYW1lbmp1bWJmIG1hbmlmZXN0amV4Y2x1c2lvbnOBomVzdGFydBRmbGVuZ3RoGRaLAAACPmp1bWIAAAAnanVtZGMyY2wAEQAQgAAAqgA4m3EDYzJwYS5jbGFpbS52MgAAAAIPY2JvcqVjYWxnZnNoYTI1NmlzaWduYXR1cmV4TXNlbGYjanVtYmY9L2MycGEvdXJuOmMycGE6NTQ5NWRkZTAtYTQwNC00OTU3LTgwMmUtNDdhOWE2NTAxMDBiL2MycGEuc2lnbmF0dXJlamluc3RhbmNlSUR4LHhtcDppaWQ6NGYyNGI1MzctMWYxYy00YWRiLWJjMGEtMzZhMjljMTViYzFmcmNyZWF0ZWRfYXNzZXJ0aW9uc4OiY3VybHgtc2VsZiNqdW1iZj1jMnBhLmFzc2VydGlvbnMvYzJwYS5pbmdyZWRpZW50LnYzZGhhc2hYIOTmynDlR14j2BaXeXU0Vt1/fK+JvPIMpSX7fiFrGxJVomN1cmx4KnNlbGYjanVtYmY9YzJwYS5hc3NlcnRpb25zL2MycGEuYWN0aW9ucy52MmRoYXNoWCD8NyGbvssCyPhT1lkOElRHo5s4pPHXiZd2uDzmaabv2aJjdXJseClzZWxmI2p1bWJmPWMycGEuYXNzZXJ0aW9ucy9jMnBhLmhhc2guZGF0YWRoYXNoWCAqwKwQp3b9/o1/G8jxVEvKdZPNbrBtdLwXntSJPYyoxHRjbGFpbV9nZW5lcmF0b3JfaW5mb6NkbmFtZW9BbnRocm9waWMgRmlsZXNndmVyc2lvbmUxLjAuMGtzcGVjVmVyc2lvbmUyLjQuMAAAEDhqdW1iAAAAKGp1bWRjMmNzABEAEIAAAKoAOJtxA2MycGEuc2lnbmF0dXJlAAAAEAhjYm9y0oRZAhKiASYYIVkCCjCCAgYwggGNoAMCAQICFEDloAruwjnQvriD+gZCBT1nVRMAMAoGCCqGSM49BAMDMEkxFzAVBgNVBAoTDkFudGhyb3BpYywgUEJDMS4wLAYDVQQDEyVBbnRocm9waWMgQ29udGVudCBDcmVkZW50aWFscyBSb290IENBMB4XDTI2MDgwNzE4NDM1NloXDTI4MDgwNjE5NDM1NlowRDEXMBUGA1UEChMOQW50aHJvcGljLCBQQkMxKTAnBgNVBAMTIEFudGhyb3BpYyBDbGF1ZGUgQ29udGVudCBTaWduaW5nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEmHoKa8tQGAUU1TS9QqU5W0Tp2N3XsvlK7BfQt6YWKwEzd2R3/dzKPEUDdCjlLjp9fT+KFjRVnuZ9v0oXvTe3k6NYMFYwDgYDVR0PAQH/BAQDAgeAMBUGA1UdJQQOMAwGCisGAQQBg+heAgEwDAYDVR0TAQH/BAIwADAfBgNVHSMEGDAWgBTOUeIEgU5kWyP448TPmj6cwddcwjAKBggqhkjOPQQDAwNnADBkAjAxcx0UngF60stVjs5G4T2eiptsBk5mf9oCtfJPAUBl8qs/PEXa8+gk1/X5QJ2DVcYCMHBfXN31YapiSqYvlIWrDVDJKOvXMl+kkz37Wt0PBI8sw486Mq6JeOhT+lRR4b1HCaFjcGFkWQ2eAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA9lhAUD1nqFMAxLgZBII63Xn0+vaeSwzeFm51ODpgiZagXH/PkYdLpTAq0etiTccPUKpchF/XQIgroVww7hXR4fZl6v/bAEMABgQFBgUEBgYFBgcHBggKEAoKCQkKFA4PDBAXFBgYFxQWFhodJR8aGyMcFhYgLCAjJicpKikZHy0wLSgwJSgpKP/bAEMBBwcHCggKEwoKEygaFhooKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKP/AABEIANwA3AMBIgACEQEDEQH/xAAfAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgv/xAC1EAACAQMDAgQDBQUEBAAAAX0BAgMABBEFEiExQQYTUWEHInEUMoGRoQgjQrHBFVLR8CQzYnKCCQoWFxgZGiUmJygpKjQ1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4eLj5OXm5+jp6vHy8/T19vf4+fr/xAAfAQADAQEBAQEBAQEBAAAAAAAAAQIDBAUGBwgJCgv/xAC1EQACAQIEBAMEBwUEBAABAncAAQIDEQQFITEGEkFRB2FxEyIygQgUQpGhscEJIzNS8BVictEKFiQ04SXxFxgZGiYnKCkqNTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2dri4+Tl5ufo6ery8/T19vf4+fr/2gAMAwEAAhEDEQA/APqiiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiioYrqCWRo4po3deqqwJFJtLcdiaiiimIKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAoorA8Qai+xra1JBPDuP5CsMRXhQhzyLp03UdkZ3irxAQHs7B+ekkqn9B/U1x8U0sEgeJ2Rh0IOK0JbYjtVWSLHavl6+JnXnzyPVp04042R0mj+LnQrHqKl1/56L1H19a6+0u4LyISW0qyJ6g9PrXkjxkU+zvbmwlEltKyMPQ9a7MNmdSnpU1X4mNXCxlrHRnr9Fclo3jCGbbFqK+U/TzF+6fqO1dVFIksavE6uh5DKcg17lHEU66vBnBOnKDtJD6KKK3ICiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKoa5qKaVpNzeyciJcgf3mPAH54pSkopyeyGld2Q3Ub9I3MCMN+Pmx29qypIlcZrh7XW5HmLyvudiWYnuTXR2OqrIBkivlcRinXm3LboepCj7NaE09p1wKz57bk8V0EcqSr2pktuGBIFc7h1Ral3OVmg68VTlgrpbi0IycVnTW+O3NRsWmYTxFelXdK1e80x828p2nqh5U/hUksNVXhqoTcHzRdmDSaszvtG8U2d9tjuCLec/3j8p+hrogQRkdK8WeMg8cVr6N4jvdNITd5sP8Azzfkfh6V6+HzVr3ay+Zx1MJ1gepUVkaRr9lqYCo/lzH/AJZuefwPetevap1I1FzQd0cUouLswoooqyQooooAKKKKACiiigAooooAKKKKACiiigAriPi1I6+HrdU+69yob8FYj9a7esXxhpo1bQ57XgS8PGT0Djp+fI/GsMTB1KUox3saUpKM02eGxTsh61p2d+ykc1n3Fu8ErJKhR1OCpHINMB2nNfItdGewdtp2rkYBaulstQWUDLCvLIbgg9a1bPUmjxhqE2hOKZ6adki9smqk1oD2rC07WAQAzV0NtdxyqORV3UtzOzjsZVxaH0qhLbEA8V1TRq/IqpcWmc4FS4NFKaZyksPPSqskPU10c1njPFUJrfjpUl3MTDo2VJBHeuk0XxbdWe2K8/0iEcc/eH41lPD14qpLEc8VrSrTpPmg7EzhGatJHrGmapaalHutZQzd0PDD8KvV4vFJLbyh4XZGU5BU4NdbovjN0CxampdenmqOfxHevaw+aRl7tXR9+hw1MI1rDU7uioLO7gvIRLayrIh7g9Pr6VPXrJqSujkaa0YUUUUxBRRRQAUUUUAFFFFABRRRQAVFcR+ZGRUtFAHnvijRkndndNsn98Dr9a4S90+S3faR16e/0/zmvdrm2jnQhwDXJa34eyGMShlPY1w4rAU6/vbS7/5m9LESp6bo8p24pQxXpW7qWlvExyjH37j/AB/zzWPJCV68r0yP88V8/Xw1TDu018+h6NOrGovdJYLspjmtux1RkI5rmmXbT45CtYGh6Tp2rBwAzVtRTpKOCK8qtr1kI5rf0/WGXGW4qlJoiUEztpIQ4NUJ7PrxTbHVEkUZNaayJIO1VaMiPeic7cWpB6VQmt+enFdZNbhu1Z9xaYJ4qHFotSucxLBx0qpJFjtXQz2/tVOW39qku5nWN7c6fMJLaVo2Hoev1rttF8ZQz7YtRURP08xfun6jtXHSwcdKqvCVPFdNDFVKD9x/IzqUo1Nz2eORJUDxsro3IZTkGnV5JpWs3mlyfuJDs7o3Kn8K7vRfFFnqAVJiLec8YY/Kfoa93D5jTraS0Z59XDShqtUdBRRRXoHOFFFFABRRRQAUUUUAFFFFABSMoYYIzS0UAY+qaNDdIcKAa4TWdAkgYlVI9wO3v616nUNxbRzqQ6g5qZRU1yyV0NNp3R4VdWxQkFdp9/un/D8fzqnJGUJBBBHY16rrnhtXDNCv4VwuoabJbMVaPKjop4x9D2/lXjYrK/tUfu/yO6li+kzCGR1qWOYqRzUjwjBKcgdQRgj6j+vSoGSvGknF2krM7U01dGraag0bA5NdDp+skYya4jeVqWK4ZcYNILHqdpqKyAZIq7lZOmDXmVlqTIwG6uk0/WOm5uKpTezIcOx0c9upHSs6e1x2q9bXqTKMkZqwUVhTcVLYlNrc5mW3x1FUpYcZGK6ie2B6Cs+a15ORUNWNE7nPSQ+1QMhTkVtS2/J4qpLDQMtaN4lvNOwjt50H9xz0+h7V3Wka3Z6moEL7Je8b8H8PWvMXhxTEDxOGQkEc5FduHx9ShpuuxhUw8Z67M9lorgdG8WT2+2O+Bmj6bv4h/jXa2N9bX0XmWsquO47j6ivew+Mp1/hevY8+pRlT3LNFFFdRkFFFFABRRRQAUUUUAFFFFACEAjBFZWqaPDeIflG6taigDyzW/Dslu5ZAeOQR1FczcQlXIlG0/wB4Dj8R2+o/KvdJ4I5lIdQa5PXfDKyhnhHNc2IwtPEL31r3NadWVN6HlssRU8jqMg+tQMhFbuoadNZSMCvyk5Knof8AD6is/wAtXJCZDf3D1/D1r5/E4Gph9d13PRpYiNTTZlFWKHrViK6KEYNMkjHpzUDKQTXGbnS2OqlCPmrpNP1hWADNXm6SEcZq5bXrIRzQJq56vDcxzAEEc1I8QYVwWm6uykZauosdVWTAZhVKV9zNwtsWLi068VnzWxB6VuxyJKODTJYA3Sm49UCl3OZlgHpVd7fPSuhltTnpVV7fGeKixdzBa2NZ2p+JYPDN5awG4YX9xIEVU5MeTjn8ev5cno74g+Kbfwho8lwUaa9Pyxov8DHoSe317fUivnePWLrUtVe/vJTJcu4cnsMdAB2ArenSklzkSmnofdmnz/arG3n4zJGrHHqRViue8BXgvfC1lKpzgFf1yP0Iroa+qoz56cZd0eTNcsmgooorQkKKKKACiiigAooooAKKKKACkIBGDS0UAZOq6PDeRnKjdXn2u+GpYGLIuV68V6vUU8EcykOoOaAPCplZCVuFJP8AfA5H1Hf+f1qCWIbQQQynow6GvUNd8LpMrNCMGuDv9LnspGwpHY8ZB+o715OKyyM/epaPt0/4B10sU46T1RgPGRnFR8ir7qHOANj/AN0ng/Q/0P61WkjwSCMEdq8OpTlSlyzVmehGSmrxGRzlD1rTstRaMjmsl0PaowSv1qCjvtN1rBALV09jqKSqORmvIYblo261uadqzIw+Y002iXFM9SAVxkVheI9RTTo/LgAe8YZA/uD1P9BVOHXmhst6gNI3yxA9z6n2FZUNvLczNLMxeRzlmPUmvSweG+sO72RyVanstDm7rSpdQld5yXZ+uec1zGofCWW4cz6Ntgm6+UTiNv8A4n+XtXtenaVnGVrp7DTkjAJWvelRhKPI1ocKnJO6ZjfCzStQ0bwnBaasqJcg5KIwYKMAdRwema6+mqoUYFOp04KnFQjsglJyd2FFFFWSFFFFABRRRQAUUUUAFFFFABRRRQAUUUUABGRzWdqOlQXaEMoya0aKAPM9e8KtHuaJcr9K5O4tpITsmRmUcA/xD8e/0P6V7rJGsikMAa5/WPDsN0pKKA1ZVqEK0eWauXCpKDvE8dkiIQsvzJ0yOx9CO1VmSuw1Xw/NayFlB+orCnsmGSUKsP7qkg/h1H614OJy2pS1hqvxPQpYqM9JaMyNhzUtrEzzAZ2qOWb+6P8AP61ZS3Zn2hXY+iRsT/Kui0XRpHdXmj2KDkR5yc/3mPr6AcCuehhKlaVktO5pUrRgr3J9Osnk2mRccAKv9xew/wAfeur0zTemRVnS9MwAWFdBBAsYGBX09KnGlFQjsjypScndkVraLGo4q2BilorQkKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAK9zaxzqQ6g1gX3hyN2LRjFdPRQBxyeH3Vvatmw0pYgMjmtfApaAGRoqDAp9FFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQB//2Q==",
 "PUX-EDGE-300-GD": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/6xaJSlACEQAAAAEAABZ/anVtYgAAAB5qdW1kYzJwYQARABCAAACqADibcQNjMnBhAAAAFllqdW1iAAAAR2p1bWRjMm1hABEAEIAAAKoAOJtxA3VybjpjMnBhOjU0OTVkZGUwLWE0MDQtNDk1Ny04MDJlLTQ3YTlhNjUwMTAwYgAAAAOUanVtYgAAAClqdW1kYzJhcwARABCAAACqADibcQNjMnBhLmFzc2VydGlvbnMAAAAAuWp1bWIAAABEanVtZGNib3IAEQAQgAAAqgA4m3ETYzJwYS5pbmdyZWRpZW50LnYzAAAAABhjMnNoOn/5va1rnlSNgiwofAvFxAAAAG1jYm9yo2lkYzpmb3JtYXRqaW1hZ2UvanBlZ2ppbnN0YW5jZUlEeCx4bXA6aWlkOmM1ZTY3MWJkLTI4NWQtNGUwMi04M2Y0LWIyOWQ1MzkzYjI5OWxyZWxhdGlvbnNoaXBocGFyZW50T2YAAAHianVtYgAAAEFqdW1kY2JvcgARABCAAACqADibcRNjMnBhLmFjdGlvbnMudjIAAAAAGGMyc2j57lnDaGh/IwPPWSlSqjugAAABmWNib3KiZ2FjdGlvbnOComZhY3Rpb25rYzJwYS5vcGVuZWRqcGFyYW1ldGVyc6FraW5ncmVkaWVudHOBomN1cmx4LXNlbGYjanVtYmY9YzJwYS5hc3NlcnRpb25zL2MycGEuaW5ncmVkaWVudC52M2RoYXNoWCDk5spw5UdeI9gWl3l1NFbdf3yvibzyDKUl+34haxsSVaRmYWN0aW9ueB1jb20uYW50aHJvcGljLmNsYXVkZS5wcm92aWRlZGpwYXJhbWV0ZXJzoXgfY29tLmFudGhyb3BpYy5vcmlnaW4tY29uZmlkZW5jZWd1bmtub3dua2Rlc2NyaXB0aW9ueGZDbGF1ZGUgcHJvdmlkZWQgdGhpcyBmaWxlIGF0IHRoZSByZXF1ZXN0IG9mIGEgdXNlciBhbmQgbWF5IGhhdmUgY3JlYXRlZCBvciBtb2RpZmllZCB0aGUgZmlsZSBjb250ZW50cy5tc29mdHdhcmVBZ2VudKFkbmFtZWZDbGF1ZGVyYWxsQWN0aW9uc0luY2x1ZGVk9QAAAMhqdW1iAAAAQGp1bWRjYm9yABEAEIAAAKoAOJtxE2MycGEuaGFzaC5kYXRhAAAAABhjMnNoMn41NdrmwAp7fP3j9khVYAAAAIBjYm9ypWNhbGdmc2hhMjU2Y3BhZE4AAAAAAAAAAAAAAAAAAGRoYXNoWCAFxmivSRJ+x2tFKvAiBtquZooxHu+EpjkrJopJNurv+mRuYW1lbmp1bWJmIG1hbmlmZXN0amV4Y2x1c2lvbnOBomVzdGFydBRmbGVuZ3RoGRaLAAACPmp1bWIAAAAnanVtZGMyY2wAEQAQgAAAqgA4m3EDYzJwYS5jbGFpbS52MgAAAAIPY2JvcqVjYWxnZnNoYTI1NmlzaWduYXR1cmV4TXNlbGYjanVtYmY9L2MycGEvdXJuOmMycGE6NTQ5NWRkZTAtYTQwNC00OTU3LTgwMmUtNDdhOWE2NTAxMDBiL2MycGEuc2lnbmF0dXJlamluc3RhbmNlSUR4LHhtcDppaWQ6NGYyNGI1MzctMWYxYy00YWRiLWJjMGEtMzZhMjljMTViYzFmcmNyZWF0ZWRfYXNzZXJ0aW9uc4OiY3VybHgtc2VsZiNqdW1iZj1jMnBhLmFzc2VydGlvbnMvYzJwYS5pbmdyZWRpZW50LnYzZGhhc2hYIOTmynDlR14j2BaXeXU0Vt1/fK+JvPIMpSX7fiFrGxJVomN1cmx4KnNlbGYjanVtYmY9YzJwYS5hc3NlcnRpb25zL2MycGEuYWN0aW9ucy52MmRoYXNoWCD8NyGbvssCyPhT1lkOElRHo5s4pPHXiZd2uDzmaabv2aJjdXJseClzZWxmI2p1bWJmPWMycGEuYXNzZXJ0aW9ucy9jMnBhLmhhc2guZGF0YWRoYXNoWCAqwKwQp3b9/o1/G8jxVEvKdZPNbrBtdLwXntSJPYyoxHRjbGFpbV9nZW5lcmF0b3JfaW5mb6NkbmFtZW9BbnRocm9waWMgRmlsZXNndmVyc2lvbmUxLjAuMGtzcGVjVmVyc2lvbmUyLjQuMAAAEDhqdW1iAAAAKGp1bWRjMmNzABEAEIAAAKoAOJtxA2MycGEuc2lnbmF0dXJlAAAAEAhjYm9y0oRZAhKiASYYIVkCCjCCAgYwggGNoAMCAQICFEDloAruwjnQvriD+gZCBT1nVRMAMAoGCCqGSM49BAMDMEkxFzAVBgNVBAoTDkFudGhyb3BpYywgUEJDMS4wLAYDVQQDEyVBbnRocm9waWMgQ29udGVudCBDcmVkZW50aWFscyBSb290IENBMB4XDTI2MDgwNzE4NDM1NloXDTI4MDgwNjE5NDM1NlowRDEXMBUGA1UEChMOQW50aHJvcGljLCBQQkMxKTAnBgNVBAMTIEFudGhyb3BpYyBDbGF1ZGUgQ29udGVudCBTaWduaW5nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEmHoKa8tQGAUU1TS9QqU5W0Tp2N3XsvlK7BfQt6YWKwEzd2R3/dzKPEUDdCjlLjp9fT+KFjRVnuZ9v0oXvTe3k6NYMFYwDgYDVR0PAQH/BAQDAgeAMBUGA1UdJQQOMAwGCisGAQQBg+heAgEwDAYDVR0TAQH/BAIwADAfBgNVHSMEGDAWgBTOUeIEgU5kWyP448TPmj6cwddcwjAKBggqhkjOPQQDAwNnADBkAjAxcx0UngF60stVjs5G4T2eiptsBk5mf9oCtfJPAUBl8qs/PEXa8+gk1/X5QJ2DVcYCMHBfXN31YapiSqYvlIWrDVDJKOvXMl+kkz37Wt0PBI8sw486Mq6JeOhT+lRR4b1HCaFjcGFkWQ2eAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA9lhAUD1nqFMAxLgZBII63Xn0+vaeSwzeFm51ODpgiZagXH/PkYdLpTAq0etiTccPUKpchF/XQIgroVww7hXR4fZl6v/bAEMABgQFBgUEBgYFBgcHBggKEAoKCQkKFA4PDBAXFBgYFxQWFhodJR8aGyMcFhYgLCAjJicpKikZHy0wLSgwJSgpKP/bAEMBBwcHCggKEwoKEygaFhooKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKP/AABEIANwA3AMBIgACEQEDEQH/xAAfAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgv/xAC1EAACAQMDAgQDBQUEBAAAAX0BAgMABBEFEiExQQYTUWEHInEUMoGRoQgjQrHBFVLR8CQzYnKCCQoWFxgZGiUmJygpKjQ1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4eLj5OXm5+jp6vHy8/T19vf4+fr/xAAfAQADAQEBAQEBAQEBAAAAAAAAAQIDBAUGBwgJCgv/xAC1EQACAQIEBAMEBwUEBAABAncAAQIDEQQFITEGEkFRB2FxEyIygQgUQpGhscEJIzNS8BVictEKFiQ04SXxFxgZGiYnKCkqNTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2dri4+Tl5ufo6ery8/T19vf4+fr/2gAMAwEAAhEDEQA/APqiiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiioYrqCWRo4po3deqqwJFJtLcdiaiiimIKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAoorA8Qai+xra1JBPDuP5CsMRXhQhzyLp03UdkZ3irxAQHs7B+ekkqn9B/U1x8U0sEgeJ2Rh0IOK0JbYjtVWSLHavl6+JnXnzyPVp04042R0mj+LnQrHqKl1/56L1H19a6+0u4LyISW0qyJ6g9PrXkjxkU+zvbmwlEltKyMPQ9a7MNmdSnpU1X4mNXCxlrHRnr9Fclo3jCGbbFqK+U/TzF+6fqO1dVFIksavE6uh5DKcg17lHEU66vBnBOnKDtJD6KKK3ICiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKoa5qKaVpNzeyciJcgf3mPAH54pSkopyeyGld2Q3Ub9I3MCMN+Pmx29qypIlcZrh7XW5HmLyvudiWYnuTXR2OqrIBkivlcRinXm3LboepCj7NaE09p1wKz57bk8V0EcqSr2pktuGBIFc7h1Ral3OVmg68VTlgrpbi0IycVnTW+O3NRsWmYTxFelXdK1e80x828p2nqh5U/hUksNVXhqoTcHzRdmDSaszvtG8U2d9tjuCLec/3j8p+hrogQRkdK8WeMg8cVr6N4jvdNITd5sP8Azzfkfh6V6+HzVr3ay+Zx1MJ1gepUVkaRr9lqYCo/lzH/AJZuefwPetevap1I1FzQd0cUouLswoooqyQooooAKKKKACiiigAooooAKKKKACiiigAriPi1I6+HrdU+69yob8FYj9a7esXxhpo1bQ57XgS8PGT0Djp+fI/GsMTB1KUox3saUpKM02eGxTsh61p2d+ykc1n3Fu8ErJKhR1OCpHINMB2nNfItdGewdtp2rkYB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"
};
function projectHandleFotoUrl(m) {
  if (!m) return null;
  return (m.foto_url && !/^assets\/handles\//.test(m.foto_url) ? m.foto_url : null) || HANDLE_FOTOS[m.code] || m.foto_url || null;
}
// Foto real do puxador (px de lado); sem foto (ou se não carregar) cai no desenho.
function projectHandleCardVisual(m, px) {
  const svg = projectHandlePreviewSvg(m);
  const url = projectHandleFotoUrl(m);
  const t = px || 92;
  if (!url) return svg;
  return '<span class="po-proj-handle-foto" style="display:block">'
    + '<img src="' + escapeHtmlCutlist(url) + '" alt="" style="width:' + t + 'px;height:' + t + 'px;object-fit:cover;display:block;border-radius:4px" '
    + 'onerror="this.style.display=&quot;none&quot;;this.nextElementSibling.style.display=&quot;block&quot;">'
    + '<span style="display:none">' + svg + '</span></span>';
}
// FOTO GRANDE (2026-11-15, Matt: "duplo clique na foto do puxador abre ele em
// tela grande pro cliente ver bem"). Vale em todo lugar onde o puxador aparece
// como cartão: painel do módulo, painel sem seleção e menu da porta.
// O 1º clique continua escolhendo o puxador (e o painel é redesenhado), então
// o duplo clique é contado aqui, no documento: dois toques em menos de 450 ms
// no mesmo lugar, o 1º em cima de um cartão de puxador.
function openProjectHandleZoom(m) {
  if (!m) return;
  let ov = document.getElementById('po-handle-zoom');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'po-handle-zoom';
    ov.style.cssText = 'position:fixed;inset:0;z-index:3000;background:rgba(20,20,20,.72);display:flex;align-items:center;justify-content:center;cursor:zoom-out;padding:16px;';
    // o clique que ABRIU não pode fechar (o 2º toque termina em cima do véu)
    ov.addEventListener('click', () => { if (Date.now() - (ov._abertoEm || 0) > 400) ov.style.display = 'none'; });
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && ov.style.display !== 'none') ov.style.display = 'none'; });
    document.body.appendChild(ov);
  }
  const pequena = projectHandleFotoUrl(m) || '';
  const grande = m.code ? 'assets/handles/' + m.code + '.jpg' : pequena;
  ov.innerHTML = '<div style="background:#fff;border-radius:12px;padding:16px;max-width:min(92vw,640px);text-align:center;box-shadow:0 10px 40px rgba(0,0,0,.4)">'
    + '<img alt="" style="display:block;width:min(80vw,70vh,560px);height:min(80vw,70vh,560px);object-fit:contain;border-radius:8px;background:#fff">'
    + '<div style="margin-top:10px;font-size:18px;font-weight:600;color:#222">' + escapeHtmlCutlist(m.name || '') + '</div>'
    + '<div class="hint" style="margin-top:4px">' + I18n.t('project.handle_zoom_close') + '</div></div>';
  const img = ov.querySelector('img');
  // foto de 400 px da pasta; se não existir (ainda não publicada), a embutida
  // sem foto nenhuma (puxador cadastrado só com o desenho): não abre vazio
  img.onerror = function () {
    img.onerror = function () { ov.style.display = 'none'; };
    if (pequena && pequena !== img.getAttribute('src')) img.src = pequena; else ov.style.display = 'none';
  };
  img.src = grande || pequena;
  ov._abertoEm = Date.now();
  ov.style.display = 'flex';
}
(function () {
  let ultimo = null;
  const modeloDoAlvo = (alvo) => {
    if (!alvo || !alvo.closest || typeof projectHandleModels !== 'function') return null;
    const el = alvo.closest('.po-proj-handle-card, .po-proj-piece-handle-opt, .po-proj-handle-summary');
    if (!el) return null;
    let id = el.dataset.handleId || el.dataset.id || el.dataset.v || '';
    if (!id && el.classList.contains('po-proj-handle-summary')) {
      const sl = (typeof selectedProjectSlotId !== 'undefined' && selectedProjectSlotId != null) ? projectSlots.find((x) => x.id === selectedProjectSlotId) : null;
      id = (sl && sl.handle && sl.handle.itemId) || '';
    }
    return id ? (projectHandleModels().find((m) => m.item_id === id) || null) : null;
  };
  document.addEventListener('pointerdown', (ev) => {
    const agora = Date.now();
    if (ultimo && agora - ultimo.t < 450 && Math.hypot(ev.clientX - ultimo.x, ev.clientY - ultimo.y) < 14) {
      const m = ultimo.m; ultimo = null;
      openProjectHandleZoom(m);
      return;
    }
    const m = modeloDoAlvo(ev.target);
    ultimo = m ? { t: agora, x: ev.clientX, y: ev.clientY, m } : null;
  }, true);
})();

function projectHandlePreviewSvg(m) {
  const fundo = '<rect x="1" y="1" width="42" height="60" rx="3" fill="#f4f1ea" stroke="#cfc8ba"/>';
  if (!m) return '<svg viewBox="0 0 44 62" width="44" height="62" aria-hidden="true">' + fundo + '<line x1="12" y1="20" x2="32" y2="42" stroke="#b5ada0" stroke-width="2"/><line x1="32" y1="20" x2="12" y2="42" stroke="#b5ada0" stroke-width="2"/></svg>';
  const cor = m.cor_hex || '#c9a45c';
  const corpo = m.formato === 'borda'
    // puxador de borda: tira fina na borda da porta
    ? '<rect x="38" y="' + (Number(m.comprimento_mm) > 200 ? 9 : 19) + '" width="5" height="' + (Number(m.comprimento_mm) > 200 ? 44 : 24) + '" rx="1" fill="' + cor + '" stroke="rgba(0,0,0,.35)" stroke-width=".6"/>'
    : m.formato === 'aro'
    ? (m.tipo === 'barra'
      ? '<rect x="16" y="9" width="12" height="44" rx="2" fill="none" stroke="' + cor + '" stroke-width="3"/>'
      : '<rect x="14" y="21" width="16" height="20" rx="3" fill="none" stroke="' + cor + '" stroke-width="3"/>')
    : m.formato === 'quadrado'
    // Asti: barra quadrada, cantos retos
    ? '<rect x="19" y="10" width="6" height="42" fill="' + cor + '" stroke="rgba(0,0,0,.35)" stroke-width=".6"/>'
    : m.tipo === 'barra'
    ? '<rect x="19" y="9" width="6" height="44" rx="3" fill="' + cor + '" stroke="rgba(0,0,0,.35)" stroke-width=".6"/>'
    : m.formato === 'cilindro'
    ? '<circle cx="22" cy="31" r="10" fill="' + (m.base_hex || cor) + '"/><circle cx="22" cy="31" r="8" fill="' + cor + '" stroke="rgba(0,0,0,.3)" stroke-width=".6"/>'
    : m.formato === 'redondo'
    ? '<circle cx="22" cy="31" r="11" fill="' + cor + '" stroke="rgba(0,0,0,.35)" stroke-width=".6"/><circle cx="22" cy="31" r="8.5" fill="' + (m.tampo_hex || '#f3ead8') + '"/>'
    : '<rect x="15" y="20" width="14" height="22" rx="7" fill="' + cor + '" stroke="rgba(0,0,0,.35)" stroke-width=".6"/><rect x="18.5" y="23.5" width="7" height="15" rx="3.5" fill="none" stroke="rgba(255,255,255,.45)" stroke-width=".8"/>';
  return '<svg viewBox="0 0 44 62" width="44" height="62" aria-hidden="true">' + fundo + corpo + '</svg>';
}

function projectLayoutRowsForSlot(slot, pieces) {
  // PÉ PLÁSTICO (2026-08-19, Matt: "os agregados do construtor pra todos
  // modulos com pes de plastico estao ficando 114mm pra cima do ponto
  // certo"). As peças da árvore (`pieces`, vindas de LayoutEngine.build)
  // nascem com Y ABSOLUTO — `computeProjectSlotInnerZone` já soma legH_mm
  // no y0 do vão desde 2026-08-18 (fix de "o interno tá 114mm baixo demais"
  // no EDITOR). Mas offset_y_mm de peça normal (module_components, via
  // resolvePiecesForViewer) é sempre RELATIVO AO CORPO (0 = piso do corpo,
  // em cima do pé) — e todo o resto do pipeline (viewer3d.js
  // placePieceInBox, elevação 2D) soma legH_mm de novo em cima disso, pra
  // TODA peça não-perna, sem saber se ela já veio absoluta. Resultado: o
  // agregado do construtor ganhava o pé DUAS VEZES e nascia 114mm ACIMA do
  // lugar certo — regressão direta do fix de 18/08, que corrigiu o editor e
  // quebrou o produto final. Reconverte pra RELATIVO AO CORPO aqui — este é
  // o ÚNICO ponto de conversão pra linha de verdade (save do editor via
  // applyProjectBuilderToSlot E o rebuild automático via
  // rebuildProjectSlotLayoutPieces passam os dois por aqui) — numa CÓPIA,
  // sem mexer no array original (`projectBuilderBuilt.pieces` continua
  // absoluto, é o que o preview do editor/modal usa pra desenhar contra o
  // casco absoluto).
  const W = Number(slot.width_mm || 0), H = Number(slot.height_mm || 0), D = Number(slot.depth_mm || 0);
  let legH_mm = 0;
  try { legH_mm = Pricing.resolveBodyDims(slot.pieces || [], { W, H, D }).legH_mm || 0; } catch (e) { /* sem pé, 0 */ }
  const pecas = legH_mm
    ? (pieces || []).map((p) => {
      const q = Object.assign({}, p, { y: (Number(p.y) || 0) - legH_mm });
      // grade de furos da prateleira regulável (absoluta) desce junto
      if (p.linha_furos && p.linha_furos.abs) q.linha_furos = Object.assign({}, p.linha_furos, { ys: p.linha_furos.ys.map((y) => y - legH_mm) });
      return q;
    })
    : (pieces || []);
  // MODELO DE PORTA (migration 188) — idempotente (rebuild já trocou; o
  // save do Construtor chega aqui com as peças cruas da janela).
  const pecasModelo = applySlotDoorModelToPieces(slot, pecas);
  const rows = LayoutEngine.toPieceRows(pecasModelo,
    (typeof doorModelCatalogFor === 'function') ? doorModelCatalogFor(accessoryCatalogCache, pecasModelo) : accessoryCatalogCache);
  applySlotDoorModelColors(slot);
  const escolhidas = slot.colorsByRole || {};
  const papeisComCor = Object.keys(escolhidas).filter((k) => escolhidas[k]);
  rows.forEach((r) => {
    if (!r.color_role_id) return;
    // BUG DE VERDADE (Matt, 2026-08-21, com print: "cade a opcao PORTAS e
    // as cores, so vem caixa"). Peça inserida pelo Construtor (ex.: porta
    // num módulo tipo "Bottom · Bottom · Back" que nunca teve porta no
    // catálogo) tem um papel de cor (accessory_types.color_role_id, ex.
    // "Porta/Frente") que NUNCA foi curado em `module_colors` pra este
    // módulo específico — normal, o módulo nasceu só com Caixa. Sem opção
    // nenhuma em `slot.colorOptionsByRole[papel]`, o painel de configuração
    // (renderProjectConfigPanel, portal-06c) só desenha o grupo de swatches
    // de um papel se `colorOptionsByRole[papel].length` — então a seção
    // "Portas" simplesmente NUNCA aparecia, pra sempre (não só na 1ª vez:
    // isto roda de novo em todo rebuild, então também AUTOCURA projeto já
    // salvo com esse defeito). O `else` de baixo já existia e emprestava a
    // COR ESCOLHIDA de outro papel resolvido (normalmente Caixa) só pro
    // preço não travar — mas nunca dava as OPÇÕES pro cliente escolher
    // outra coisa, por isso "só vem branco": era a única cor que a peça
    // jamais teria, e não tinha como trocar. Fix: se o papel não tem
    // opções próprias, empresta a LISTA de opções de outro papel do mesmo
    // slot que já tenha (mesma paleta de laminados do módulo, só que sob
    // outro papel) — assim o grupo "Portas" passa a existir de verdade, com
    // swatches clicáveis, e o cliente escolhe a cor que quiser.
    slot.colorOptionsByRole = slot.colorOptionsByRole || {};
    if (!(slot.colorOptionsByRole[r.color_role_id] || []).length) {
      const doadora = Object.values(slot.colorOptionsByRole).find((lista) => (lista || []).length);
      if (doadora) slot.colorOptionsByRole[r.color_role_id] = doadora;
    }
    if (!escolhidas[r.color_role_id]) {
      const opcoes = (slot.colorOptionsByRole || {})[r.color_role_id] || [];
      if (opcoes.length) {
        // Papel existe no módulo (ou ganhou opção emprestada acima) e tem
        // opção: adota a primeira, como faz qualquer inserção nova.
        slot.colorsByRole = slot.colorsByRole || {};
        slot.colorsByRole[r.color_role_id] = opcoes[0];
      } else if (papeisComCor.length) {
        // Último recurso (não deveria acontecer mais, com o backfill acima
        // — só sobra se o slot inteiro não tem NENHUM papel com opção
        // cadastrada, nem Caixa): não deixa Pricing.calculateLeafPiece
        // lançar. Guarda a cor emprestada no PAPEL VERDADEIRO da peça, sem
        // reescrever `r.color_role_id` (esse era o bug antigo, já corrigido
        // — ver git blame).
        slot.colorsByRole = slot.colorsByRole || {};
        slot.colorsByRole[r.color_role_id] = escolhidas[papeisComCor[0]];
      }
    }
    // BUG (Matt, 2026-08-19: "e deixei tudo ligado e no construtor nao
    // apareceu a corredica no preco"). Esta trava nasceu ANTES do hardware
    // PRÓPRIO da peça-módulo existir (own_slide_model/own_slide_models,
    // migration 103/127/128) — na época, a ÚNICA fonte de modelo de
    // corrediça era o dropdown do slot (slot.slideModel, escolhido lá em
    // cima pelo cliente/admin), então "sem escolha lá em cima = sem
    // corrediça" fazia sentido. Só que r.slides_per_unit é o MESMO campo
    // usado tanto pela peça-folha comum (calculateLeafPiece, que SÓ conhece
    // slot.slideModel mesmo) quanto pela peça-módulo tipo gaveta
    // (calculateModulePiece, que prioriza own_slide_model/own_slide_models —
    // o hardware FIXO vinculado ao módulo filho, module_slide_models +
    // module_purchased_slides — e só cai pro slot.slideModel se o módulo
    // filho não tiver NADA vinculado, ver js/module-pieces.js
    // fetchModuleOwnHingeAndSlideModels). Este `if` zerava slides_per_unit
    // ANTES de calculateModulePiece nem chegar a olhar pro hardware próprio
    // — uma gaveta com corrediça vinculada certinha (Itens Comprados,
    // migration 128) nunca cobrava nada se o slot não tivesse (e normalmente
    // não tem, de propósito — é hardware fixo, o cliente não escolhe) um
    // slideModel escolhido lá em cima. Silencioso: nenhum erro, só o custo
    // sumia. Fix: só zera quando a peça TAMBÉM não tem hardware próprio.
    if (r.slides_per_unit > 0 && !slot.slideModel && !r.own_slide_model && !(r.own_slide_models && r.own_slide_models.length)) r.slides_per_unit = 0;
  });
  return rows;
}

// Projeto restaurado do banco tem slot.layout mas não tem catálogo em memória.
// Fire-and-forget: carrega, refaz as peças e redesenha. Nada trava esperando.
function hydrateProjectLayoutPieces() {
  // A furação entra aqui mesmo sem layout nenhum: ela vale pra QUALQUER
  // módulo, não só pros que têm internos montados. Fire-and-forget, e o
  // recompute que vier depois já acha o catálogo pronto — enquanto não
  // estiver, o preço usa furos_equivalentes, que é o comportamento antigo.
  // O reprice agora mora DENTRO de ensureProjectDrillingCatalog (ver lá): era
  // aqui e no hydrate, e nenhum dos dois cobria o caminho real.
  ensureProjectDrillingCatalog();
  // + módulo pronto com modelo de porta (14/10): sem layout, mas precisa da
  // engenharia do modelo carregada pra reabrir com a porta certa.
  if (!projectSlots.some((s) => s.layout || s.doorModelId || s.drawerModelId)) return;
  (async () => {
    await ensureAccessoryCatalog();
    // MODELO DE GAVETA (migration 203): mesma ideia do modelo de porta abaixo.
    if (projectSlots.some((s) => s.drawerModelId)) {
      try {
        await ensureProjectDrawerModels();
        await Promise.all(projectSlots.map((s) => {
          const m = projectSlotDrawerModel(s);
          return m ? loadDoorModelExtras(m.child_module_id).catch(() => null) : null;
        }));
      } catch (e) { /* segue Standard */ }
    }
    // MODELO DE PORTA (migration 188): engenharia carregada antes do rebuild,
    // senão o projeto reabre com a porta Flat até o próximo recálculo.
    if (projectSlots.some((s) => s.doorModelId)) {
      try {
        await ensureProjectDoorModels();
        await Promise.all(projectSlots.map((s) => {
          const m = projectSlotDoorModel(s);
          return m ? loadDoorModelExtras(m.child_module_id).catch(() => null) : null;
        }));
      } catch (e) { /* segue Flat */ }
    }
    projectSlots.forEach((slot) => {
      if (!slot.layout && !slot.doorModelId && !slot.drawerModelId) return;
      if (slot.layout) rebuildProjectSlotLayoutPieces(slot);
      if (!slot.layout && slot.doorModelId) { try { applySlotDoorModelColors(slot); } catch (e) { /* ok */ } }
      try { recomputeProjectSlotPricing(slot); } catch (e) { /* catálogo mudou; o slot fica com o preço de antes */ }
    });
    renderProjectCanvas();
  })();
}

// Aplica a árvore no slot (sem mexer na janela). É o miolo: quem fecha e quem
// avisa é saveAndCloseProjectModuleBuilder / closeProjectModuleBuilder.
function applyProjectBuilderToSlot() {
  const slot = projectSlots.find((s) => s.id === projectBuilderSlotId);
  if (!slot || !projectBuilderRoot) return null;
  const r = projectBuilderRoot;
  // Override antigo (sem refW/refH) ganha a referência no Save: dali pra
  // frente o vão acompanha o módulo (ver projectBuilderRootZoneEfetiva).
  // Grava o retângulo EFETIVO de agora (o que a pessoa está vendo).
  if (r.params && r.params.zoneOverride && !(r.params.zoneOverride.refW > 0)) {
    const ef = projectBuilderRootZoneEfetiva(projectBuilderZone, r, slot) || {};
    r.params.zoneOverride = Object.assign({ x: ef.x, y: ef.y, w: ef.w, h: ef.h }, projectBuilderOverrideRef(slot));
  }
  // CAUSA RAIZ do "modifico o vao raiz e ele ignora, insere com a medida
  // antiga" (2026-09-02, relato do Matt). Um vao raiz só com zoneOverride
  // (a pessoa ajustou a abertura mas ainda não colocou peça nenhuma dentro)
  // não tem splitAxis/content/fronts/children — antes disso caía direto no
  // "vazia" e o Save JOGAVA FORA o override (slot.layout virava null).
  // Reabrir o Construtor depois (mesmo sem fechar o modal — só apertando
  // Salvar de novo) voltava pra zona deduzida do casco, como se o ajuste
  // nunca tivesse existido, e a próxima peça inserida nascia com a medida
  // ANTIGA. zoneOverride sozinho já é conteúdo suficiente pra não ser vazio.
  const vazia = !r.splitAxis && !r.content && !(r.fronts || []).length
    && !(r.children || []).length && !(r.params && r.params.zoneOverride);
  slot.layout = vazia ? null : LayoutEngine.serialize(r);
  // gaveta em cima ⇒ travessa deitada (01/11, ver projectEnforceStretcherRule)
  if (typeof projectEnforceStretcherRule === 'function') { try { projectEnforceStretcherRule(slot); } catch (e) { /* segue */ } }

  // O catálogo da janela é o filtrado pela whitelist; o cache global é o
  // inteiro. Completa o cache com o que a janela carregou pra que o rebuild
  // fora daqui (mudança de medida) ache os mesmos agregados.
  accessoryCatalogCache = Object.assign({}, accessoryCatalogCache || {}, projectBuilderCat);
  slot.layoutPieces = vazia ? [] : projectLayoutRowsForSlot(slot, (projectBuilderBuilt || {}).pieces || []);
  // Preço pode LANÇAR (cadastro incompleto em alguma peça do módulo). Se
  // lançar, o slot fica com o preço de antes — mas as peças já entraram no
  // desenho, que é o que o cliente está olhando.
  try { recomputeProjectSlotPricing(slot); } catch (e) { /* preço antigo continua valendo */ }
  renderProjectCanvas();
  markProjectDirty();

  // Agregado sem componente cadastrado não vira peça (não tem de onde tirar
  // preço, cor nem espessura) — quem chama decide como contar isso.
  const geradas = ((projectBuilderBuilt || {}).pieces || []).filter((p) => p.kind !== undefined).length;
  return { slot, faltando: Math.max(0, geradas - (slot.layoutPieces || []).length) };
}

// SALVAR = aplicar, FECHAR e voltar pro projeto com o módulo selecionado.
//
// "quando dou save ele nao volta pro projeto, fica ali parado na tela, sem
// saber se deu certo ou nao" (Matt, 2026-08-13). A janela ficar aberta depois
// de salvar não é neutro: é a mesma tela de antes, então parece que nada
// aconteceu. Fechar É a confirmação — e o módulo atrás já aparece mudado.
function saveAndCloseProjectModuleBuilder() {
  const r = applyProjectBuilderToSlot();
  const slotId = projectBuilderSlotId;
  fecharProjectBuilderModal();
  if (r && r.slot) {
    // Volta PRO MÓDULO: seleciona o que acabou de ser editado, pra ele já
    // estar com as setas/painel na tela quando a janela sai da frente.
    selectProjectSlot(slotId);
    const status = document.getElementById('po-proj-fav-status');
    if (status) {
      status.textContent = r.faltando > 0
        ? I18n.t('project.builder_saved_partial', { n: r.faltando })
        : I18n.t('project.builder_saved');
      setTimeout(() => { if (status) status.textContent = ''; }, 5000);
    }
  }
}

function fecharProjectBuilderModal() {
  const modal = document.getElementById('po-proj-builder-modal');
  if (modal) modal.classList.remove('open');
  projectBuilderSlotId = null;
  projectBuilderBuilt = null;
  projectBuilderRoot = null;
  projectBuilderUndo = [];
  renderProjectCanvas();
}

// Inserir: o agregado diz SOZINHO o que ele faz com o vão (role, migration
// 085) — divide, preenche ou fecha a frente. Não existe modo, nem menu, nem
// pergunta: é o clique.
function insertProjectBuilderItem(accessoryId, nodeId, qtd) {
  const acc = projectBuilderCat[accessoryId];
  const node = LayoutEngine.findNode(projectBuilderRoot, nodeId || projectBuilderSelId);
  if (!acc || !node) return;
  // Vão travado pela engenharia (locked): estrutura do produto, não opção.
  if (node.locked) return;
  // Gaveta interna SEM PORTA (2026-10-04) não convive com porta na frente —
  // nem porta em cima dela, nem ela atrás de porta. Regra em
  // LayoutEngine.bloqueiaGavetaSemPorta (a mesma do ERP).
  if (LayoutEngine.bloqueiaGavetaSemPorta) {
    const faixaChk = acc.role === 'front' ? projectBuilderFaixaAtual() : null;
    const bloqueia = faixaChk
      ? LayoutEngine.bloqueiaGavetaSemPorta(projectBuilderRoot, faixaChk.pai, accessoryId, projectBuilderCat, faixaChk.de, faixaChk.ate)
      : LayoutEngine.bloqueiaGavetaSemPorta(projectBuilderRoot, node, accessoryId, projectBuilderCat, null, null);
    if (bloqueia) {
      alert(I18n.t(acc.role === 'front' ? 'builder.gaveta_sem_porta_bloqueia_porta' : 'builder.gaveta_sem_porta_atras_de_porta'));
      return;
    }
  }
  // Trash / Spice Pull-out: peça comprada de largura fixa — só no vão com a
  // largura interna de um gabinete padrão (LayoutEngine.bloqueiaLarguraFixa).
  if (LayoutEngine.bloqueiaLarguraFixa) {
    const eCasco = projectBuilderEspessuraCasco(projectSlots.find((sl) => sl.id === projectBuilderSlotId));
    const boxVao = node._box || node._boxFull || null;
    if (boxVao && LayoutEngine.bloqueiaLarguraFixa(acc, boxVao, eCasco)) {
      const uni = (document.getElementById('po-unit-select') || {}).value || 'mm';
      const lista = (LayoutEngine.largurasFixasDoVao(acc, eCasco) || []).map((w) => formatDimension(w, uni)).join(' / ');
      alert(I18n.t('builder.largura_fixa_bloqueia', { nome: acc.name || '', larguras: lista }));
      return;
    }
  }
  // Ao lado de Divisória Stretcher Vertical não entra nada que precise ir até
  // o fundo (gaveta, prateleira, cabide...) — LayoutEngine.bloqueiaStretcherVertical.
  if (LayoutEngine.bloqueiaStretcherVertical
    && LayoutEngine.bloqueiaStretcherVertical(projectBuilderRoot, node, accessoryId, projectBuilderCat)) {
    alert(I18n.t('builder.stretcher_v_bloqueia'));
    return;
  }
  const n = Math.max(1, Math.round(Number(qtd) || 1));
  pushProjectBuilderUndo();
  if (acc.role === 'split') {
    // n DIVISÓRIAS => n+1 vãos IGUAIS (todos elásticos, o motor rateia).
    LayoutEngine.applySplit(node, accessoryId, n, projectBuilderCat);
    // O vão selecionado ACABOU de virar dois. Seleciona o primeiro filho, não
    // o pai: senão a próxima peça cairia num vão qualquer da árvore (o
    // reselecionar do rebuild cai no primeiro vão que existir).
    projectBuilderSelId = (node.children[0] || node).id;
  } else {
    if (acc.role === 'front') {
      // PORTA SOBRE VÁRIOS VÃOS. Com faixa pintada (arrastou por mais de um
      // vão), a frente é aplicada no PAI cobrindo os filhos de `from` até
      // `to` — uma folha só na frente de todos eles. É pra isso que
      // applyFront tem from/to; sem faixa, cai no caminho de sempre (a frente
      // do próprio vão, from/to nulos = cobre ele inteiro). A tradução
      // faixa->{pai,de,ate} agora mora em projectBuilderFaixaAtual (2026-08-20)
      // — é a MESMA usada por projectBuilderSelBox pra filtrar a biblioteca,
      // pra nunca discordarem sobre o que a faixa cobre.
      const faixa = projectBuilderFaixaAtual();
      if (faixa) {
        LayoutEngine.applyFront(faixa.pai, accessoryId,
          faixa.de, faixa.ate, projectBuilderCat);
        // A porta passa a ser do PAI: seguir com a faixa pintada faria a
        // próxima peça cair num vão que agora está atrás da folha.
        projectBuilderSelIds = [];
        projectBuilderSelId = faixa.pai.id;
        markProjectDirty();
        rebuildProjectBuilder();
        return;
      }
      LayoutEngine.applyFront(node, accessoryId, null, null, projectBuilderCat);
    } else {
      LayoutEngine.applyContent(node, accessoryId, projectBuilderCat);
      // Conteúdo empilhável (gaveteiro, cesto): a quantidade é parâmetro do
      // próprio agregado — emitContent divide a altura do vão em n iguais.
      if (n > 1 && node.content) node.content.params = Object.assign({}, node.content.params, { quantidade: n });
    }
    projectBuilderSelId = node.id;
  }
  // BUG CORRIGIDO (2026-08-23, relato do Matt no iPad: "quando seleciono um
  // vao... ele nao deixa eu selecionar outro. tipo ele trava no vao que eu
  // cliquei depois de colocar qualquer coisa") — só o ramo 'front' COM faixa
  // pintada (acima) zerava `projectBuilderSelIds` depois de inserir. Os
  // outros 3 caminhos (split, content, front SEM faixa) deixavam uma faixa
  // de 2+ vãos sobrevivendo à inserção sempre que o toque no vão tocasse de
  // leve um vizinho antes de soltar o dedo (`pointerenter` em
  // projectBuilderSelecionaFaixa, ver bloco de listeners em
  // renderProjectBuilderStage — no touch, um "toque" raramente é 100%
  // parado, e o vão fica MENOR a cada peça inserida, piorando a cada rodada,
  // que é exatamente o "trava depois de colocar qualquer coisa" relatado).
  // Com a faixa antiga viva, o `click` do próximo vão nunca atualiza
  // `projectBuilderSelId` (ver `if (projectBuilderSelIds.length <= 1)` no
  // listener de click) — trava visualmente no vão/faixa anterior até reabrir
  // o Construtor (que reinicia o estado do zero). Zerar aqui, sempre, fecha
  // os 3 caminhos que faltavam — mesmo que o usuário não tenha arrastado de
  // propósito.
  projectBuilderSelIds = [];
  projectBuilderRangeDrag = null;
  markProjectDirty();
  rebuildProjectBuilder();
}

// Aponta este lugar do projeto pra CÓPIA privada do módulo (migration 098).
//
// O que sobrevive e o que não:
//   * medidas escolhidas (largura/altura/profundidade) — sobrevivem, são
//     números do slot;
//   * cores — sobrevivem: são por PAPEL DE COR (color_role_id), e papel é
//     catálogo, não muda na cópia;
//   * opcionais marcados, quantidade de prateleira e cor por peça — voltam ao
//     PADRÃO. Eles são guardados por id de module_components, e a cópia tem
//     ids novos (é outra linha na mesma tabela; não dá pra repetir a chave).
//     Recarregar do padrão é o único estado coerente com a cópia.
// Isso é dito ao cliente antes de trocar (ver openProjectModuleBuilder).
// SEM USO no fluxo atual (2026-08-13): ela pertence ao modelo de "cópia
// privada do módulo" (migration 098/099), que foi substituído pelo de internos
// como itens do projeto. Mantida porque a cópia continua fazendo sentido se um
// dia o cliente puder mexer no CASCO — aí é por aqui que o slot passa a
// apontar pra cópia. Ver docs/internos-como-modulos-no-projeto.md.
async function repointProjectSlotToModule(slot, newModuleId) {
  const [{ data: mod, error }, pieces, colorOptionsByRole, hinges, slides, presets] = await Promise.all([
    supabaseClient.from('modules').select('*').eq('id', newModuleId).single(),
    loadRecursivePiecesForModule(newModuleId),
    fetchModuleColorsByRoleRaw(newModuleId),
    fetchModuleHingeModelsRaw(newModuleId),
    fetchModuleSlideModelsRaw(newModuleId),
    fetchModuleLockedDimensionPresets(newModuleId)
  ]);
  if (error) throw error;

  // Cores: mantém a escolha atual por papel; papel que não existia antes cai
  // na primeira opção, igual a uma inserção nova.
  const usados = collectUsedColorRoleIds(pieces);
  const colorsByRole = {};
  usados.forEach((roleId) => {
    const atual = slot.colorsByRole && slot.colorsByRole[roleId];
    const opts = colorOptionsByRole[roleId] || [];
    colorsByRole[roleId] = (atual && opts.some((c) => c.id === atual.id)) ? atual : (opts[0] || null);
  });

  slot.module = mod;
  slot.pieces = pieces;
  slot.colorOptionsByRole = colorOptionsByRole;
  slot.colorsByRole = colorsByRole;
  slot.selectedColors = Object.keys(colorsByRole).map((roleId) => ({
    role_id: roleId,
    role_name: (colorRolesCache.find((r) => r.id === roleId) || {}).name || null,
    color_id: colorsByRole[roleId] ? colorsByRole[roleId].id : null,
    color_name: colorsByRole[roleId] ? colorsByRole[roleId].name : null
  }));
  slot.pieceColorOverrides = {};
  slot.selectedOptionalIds = pieces.filter((p) => p.client_optional && p.client_optional_default_on).map((p) => p.id);
  slot.shelfQuantities = collectDefaultShelfQuantities(pieces);
  slot.dimOverrides = {};
  slot.hingeModel = hinges[0] || slot.hingeModel || null;
  slot.slideModel = slides[0] || slot.slideModel || null;
  slot.widthPresetsMm = presets.width;
  slot.heightPresetsMm = presets.height;
  slot.thumbnail_data_url = null;
  recomputeProjectSlotPricing(slot);
  renderProjectCanvas();
  markProjectDirty();
}
// Fechar = guardar a árvore no próprio projeto. Nada vai pro banco do
// catálogo: o módulo NÃO é alterado (decisão de 2026-08-13, ver
// docs/internos-como-modulos-no-projeto.md) — o que o cliente montou é dele,
// e mora em slot.layout, que sai junto no serializeProjectSlots.
//
// Árvore "pelada" (nenhuma divisão, nenhum conteúdo, nenhuma frente) grava
// null em vez de um objeto vazio: assim o projeto do cliente que só abriu e
// fechou a janela continua idêntico ao que era.
function closeProjectModuleBuilder() {
  // Fechar TAMBÉM salva (o × não é "cancelar"): o cliente montou, viu na tela
  // e fechou — perder isso seria uma armadilha. Desfazer é o ↶, e o projeto
  // inteiro ainda tem o aviso de alterações não salvas.
  if (projectBuilderSlotId != null) applyProjectBuilderToSlot();
  fecharProjectBuilderModal();
}
const projSlotCustomizeBtn = document.getElementById('po-proj-slot-customize-btn');
if (projSlotCustomizeBtn) {
  projSlotCustomizeBtn.addEventListener('pointerdown', (ev) => ev.stopPropagation());
  projSlotCustomizeBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (selectedProjectSlotId != null) openProjectModuleBuilder(selectedProjectSlotId);
  });
}
(function attachProjectBuilderModal() {
  const modal = document.getElementById('po-proj-builder-modal');
  if (!modal) return;
  const closeBtn = document.getElementById('po-proj-builder-close');
  if (closeBtn) closeBtn.addEventListener('click', closeProjectModuleBuilder);
  const undoBtn = document.getElementById('po-proj-builder-undo');
  if (undoBtn) undoBtn.addEventListener('click', undoProjectBuilder);
  const resetBtn = document.getElementById('po-proj-builder-reset');
  if (resetBtn) resetBtn.addEventListener('click', resetProjectBuilder);
  const saveBtn = document.getElementById('po-proj-builder-save');
  if (saveBtn) saveBtn.addEventListener('click', saveAndCloseProjectModuleBuilder);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeProjectModuleBuilder(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('open')) closeProjectModuleBuilder();
  });
})();

// Ponto onde o raio do ponteiro cruza o PISO (plano y=0), em mm de mundo —
// base do arraste de módulo ILHA e do "soltar no chão" (biblioteca / toque
// longo). Devolve null se o ponteiro estiver apontando pro céu.
function projectFloorPointMm(clientX, clientY) {
  if (!ViewerProjectEdit || !ViewerProjectEdit.intersectPlaneAtClient) return null;
  const p = ViewerProjectEdit.intersectPlaneAtClient(clientX, clientY, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
  if (!p) return null;
  return { xMm: p.x * 1000, zMm: p.z * 1000 };
}
