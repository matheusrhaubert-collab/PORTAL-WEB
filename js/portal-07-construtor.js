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
let projectBuilderRangeDrag = null;   // { ancoraId } enquanto arrasta

// Irmãos do nó (os filhos do pai dele) + o índice dele ali dentro.
function projectBuilderIrmaos(nodeId) {
  const pai = projectBuilderFindParent(projectBuilderRoot, nodeId);
  if (!pai || !(pai.children || []).length) return null;
  const i = pai.children.findIndex((k) => k.id === nodeId);
  return i < 0 ? null : { pai, kids: pai.children, i };
}

// Pinta do vão-âncora até o vão sob o ponteiro, inclusive. Só entra na
// seleção quem é IRMÃO da âncora — arrastar pra dentro de outra divisão não
// seleciona nada, porque uma porta não cobre vãos de pais diferentes.
function projectBuilderSelecionaFaixa(ancoraId, ateId) {
  const a = projectBuilderIrmaos(ancoraId);
  const b = projectBuilderIrmaos(ateId);
  if (!a || !b || a.pai !== b.pai) return;
  const ini = Math.min(a.i, b.i), fim = Math.max(a.i, b.i);
  projectBuilderSelIds = a.kids.slice(ini, fim + 1).map((k) => k.id);
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
    const dentro = projectBuilderSelIds.indexOf(r.dataset.nodeId) >= 0
      || (!projectBuilderSelIds.length && r.dataset.nodeId === projectBuilderSelId);
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
    // Layout que o CLIENTE já montou ganha do layout de fábrica; sem nenhum
    // dos dois, começa num vão só (a zona interna inteira).
    projectBuilderRoot = slot.layout
      ? LayoutEngine.deserialize(slot.layout)
      : (carregado.root || LayoutEngine.newVoid());
  }
  projectBuilderLoadError = erro;
  rebuildProjectBuilder(true);
}

// Roda o motor e redesenha. É o único caminho: toda alteração da árvore
// termina aqui, e nada desenha a partir da árvore direto (o motor é quem sabe
// onde cada vão ficou depois do rateio).
function rebuildProjectBuilder(reselecionar) {
  if (!projectBuilderRoot || !projectBuilderZone) return;
  try {
    projectBuilderBuilt = LayoutEngine.build(projectBuilderRoot, projectBuilderZone, {
      catalogo: projectBuilderCat,
      espessura: PROJECT_BUILDER_ESPESSURA,
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
    (boxes || []).forEach((b) => {
      const lado = classifyProjectCascoBox(b, W, H, D);
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
function classifyProjectCascoBox(b, W, H, D) {
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
  if (b.sy < H * FINA && b.sx > W * COBRE && b.sz > D * COBRE) {
    if (b.y0 <= TOL) return 'bottom';
    if (ey >= H - TOL) return 'top';
  }
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
        let legH_mm = 0;
        try { legH_mm = Pricing.resolveBodyDims(slot.pieces || [], { W, H, D }).legH_mm || 0; } catch (e) { /* sem pé, 0 */ }
        const bodyH = H - legH_mm;
        const built = Drilling._internals.buildBoxes(parts || [], W, bodyH, D);
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
  const moduleExtras = {};
  const moduleIds = Array.from(new Set(
    ativos.filter((a) => a.child_module_id).map((a) => a.child_module_id)
  ));
  await Promise.all(moduleIds.map(async (mid) => {
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
  }));

  const cat = {};
  ativos.forEach((a) => {
    cat[a.id] = projectBuilderAccessoryEntry(a, a.child_module_id ? moduleExtras[a.child_module_id] : null);
  });
  return { cat, white, root: projectBuilderTreeFromRows(nos.data || []) };
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
function projectBuilderAccessoryEntry(a, moduleExtra) {
  const p = a.default_params || {};
  // 'forma' escolhe o desenho do conteúdo no resolvedor e NÃO é campo do
  // banco: cabide se identifica pelo shape_type (migration 062), painel
  // ripado pelo passo das ripas nos parâmetros.
  let forma = null;
  if (a.shape_type === 'oval_rod') forma = 'barra';
  else if (p.passo_mm != null) forma = 'ripas';
  const esp = parseFloat(a.thickness_formula);
  return {
    id: a.id,
    name: a.name,
    // slug: é por ele que o ícone é escolhido (os 13 da migration 087).
    slug: a.slug || null,
    group: a.group_name || I18n.t('builder.group_other'),
    icon: a.icon || null,
    role: a.role,
    axis: a.split_axis || null,
    espessura: isFinite(esp) && esp > 0 ? esp : PROJECT_BUILDER_ESPESSURA,
    params: p,
    forma: forma,
    folhas: Number(p.folhas) === 2 ? 2 : 1,
    shape_type: a.shape_type || null,
    color_role_id: a.color_role_id || null,
    // Programa de furação POR USO (migration 125) — espelha
    // CONSTR.catalogoDoBanco (erp/js/data-construtor.js), mesmo campo.
    drilling_pattern_id: a.drilling_pattern_id || null,
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
const PROJECT_BUILDER_SVG = (() => {
  const abre = '<svg viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">';
  const caixa = '<rect x="2.5" y="2.5" width="17" height="17" rx="1.5"/>';
  const fecha = '</svg>';
  const mk = (miolo, semCaixa) => abre + (semCaixa ? '' : caixa) + miolo + fecha;
  return {
    prateleira: mk('<line x1="2.5" y1="11" x2="19.5" y2="11"/>'),
    prateleiras2: mk('<line x1="2.5" y1="8" x2="19.5" y2="8"/><line x1="2.5" y1="14" x2="19.5" y2="14"/>'),
    inclinada: mk('<line x1="3.5" y1="14.5" x2="18.5" y2="8.5"/>'),
    divisoria: mk('<line x1="11" y1="2.5" x2="11" y2="19.5"/>'),
    // Base/base divisória = UMA horizontal no meio (2026-08-15, Matt: "esse
    // ícone tem uma divisória vertical e deveria ser só uma horizontal no
    // meio"). O desenho antigo tinha uma vertical saindo da base, o que fazia
    // parecer duas peças em L — e é justamente o ícone da Base Divisoria.
    base: mk('<line x1="2.5" y1="11" x2="19.5" y2="11"/>'),
    gaveta: mk('<rect x="5" y="8" width="12" height="6.5" rx="1"/><line x1="9" y1="11.2" x2="13" y2="11.2"/>'),
    gaveteiro: mk('<line x1="2.5" y1="8" x2="19.5" y2="8"/><line x1="2.5" y1="13" x2="19.5" y2="13"/>'
      + '<line x1="9.5" y1="5.2" x2="12.5" y2="5.2"/><line x1="9.5" y1="10.4" x2="12.5" y2="10.4"/><line x1="9.5" y1="16" x2="12.5" y2="16"/>'),
    porta: mk('<line x1="15.5" y1="2.5" x2="15.5" y2="19.5"/><circle cx="13.4" cy="11" r="0.9" fill="currentColor" stroke="none"/>'),
    porta_int: abre + '<rect x="2.5" y="2.5" width="17" height="17" rx="1.5" stroke-dasharray="3 2.4"/>'
      + '<line x1="15.5" y1="4.5" x2="15.5" y2="17.5"/><circle cx="13.4" cy="11" r="0.9" fill="currentColor" stroke="none"/>' + fecha,
    porta_dupla: mk('<line x1="11" y1="2.5" x2="11" y2="19.5"/>'
      + '<circle cx="9" cy="11" r="0.9" fill="currentColor" stroke="none"/><circle cx="13" cy="11" r="0.9" fill="currentColor" stroke="none"/>'),
    cabide: mk('<line x1="4.5" y1="8" x2="17.5" y2="8"/><path d="M11 8v3.2a2.2 2.2 0 0 0 2.2 2.2"/>'),
    cesto: mk('<path d="M5.5 8h11l-1.6 8h-7.8z"/><line x1="8.4" y1="8" x2="9.4" y2="16"/><line x1="13.6" y1="8" x2="12.6" y2="16"/>'),
    ripado: mk('<line x1="7" y1="3.5" x2="7" y2="18.5"/><line x1="11" y1="3.5" x2="11" y2="18.5"/><line x1="15" y1="3.5" x2="15" y2="18.5"/>'),
    generico: mk('')
  };
})();

function projectBuilderIcon(acc) {
  const S = PROJECT_BUILDER_SVG;
  const slug = String(acc.slug || '').toLowerCase();
  const porSlug = {
    div_vert: S.divisoria, prat_fixa: S.prateleira, prat_movel: S.prateleira,
    prat_inclinada: S.inclinada, gaveta: S.gaveta, gaveta_afast: S.gaveta,
    gaveteiro: S.gaveteiro, porta_ext: S.porta, porta_int: S.porta_int,
    porta_dupla: S.porta_dupla, cabide: S.cabide, cesto: S.cesto, ripado: S.ripado
  };
  if (porSlug[slug]) return porSlug[slug];

  const n = String(acc.name || '').toLowerCase();
  if (/inclinad|sapateir/.test(n)) return S.inclinada;
  if (/gaveteiro/.test(n)) return S.gaveteiro;
  if (/gaveta/.test(n)) return S.gaveta;
  if (/cabide|tubo|vara/.test(n)) return S.cabide;
  if (/cesto|aramad/.test(n)) return S.cesto;
  if (/ripad|ripa/.test(n)) return S.ripado;
  if (/dupla|2 folhas|duas folhas/.test(n)) return S.porta_dupla;
  if (/porta intern|embutid/.test(n)) return S.porta_int;
  if (/porta/.test(n)) return S.porta;
  if (/base/.test(n)) return S.base;
  if (/divis|lateral/.test(n)) return S.divisoria;
  if (/pratele/.test(n)) return S.prateleira;

  if (acc.role === 'front') return S.porta;
  if (acc.role === 'split') return acc.axis === 'x' ? S.divisoria : S.prateleira;
  if (acc.role === 'content') return S.gaveta;
  return S.generico;
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
function projectBuilderSelBox() {
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
    .filter((k) => LayoutEngine.cabeNoVao(projectBuilderCat[k], box, projectBuilderWhite[k]));

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
        .concat(grupos.map((g) => ({ id: g, nome: g })))
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
    return projLibNorm(acc.name).indexOf(q) >= 0 || projLibNorm(acc.group).indexOf(q) >= 0;
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
    (mostraTitulo ? '<div class="po-proj-builder-group">' + escapeHtmlCutlist(g) + '</div>' : '')
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
        + ' title="' + escapeHtmlCutlist(acc.name || '') + '">'
        + '<span class="po-proj-builder-item-icon">' + projectBuilderIcon(acc) + '</span>'
        + '<span class="po-proj-builder-item-name">' + escapeHtmlCutlist(acc.name || '') + '</span>'
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
      ? projectBuilderSelIds.indexOf(v.nodeId) >= 0
      : v.nodeId === projectBuilderSelId;
    const r = projBuilderSvgEl('rect', {
      x: v.box.x, y: sy(v.box.y, v.box.h), width: v.box.w, height: v.box.h,
      class: 'po-proj-void' + (sel ? ' selected' : '')
    }, gV);
    r.dataset.nodeId = v.nodeId;
  });

  // ---- peças geradas pela árvore
  (built.pieces || []).slice().sort((a, b) => a.z - b.z).forEach((p) => {
    if (p.shape_type === 'oval_rod') {
      const l = projBuilderSvgEl('line', {
        x1: p.x, y1: sy(p.y + p.h / 2), x2: p.x + p.w, y2: sy(p.y + p.h / 2),
        stroke: '#59636d', 'stroke-width': sw * 3.2, 'stroke-linecap': 'round',
        class: 'po-proj-void-item'
      }, gP);
      l.addEventListener('click', (ev) => { ev.stopPropagation(); removeProjectBuilderPiece(p); });
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
    r.addEventListener('click', (ev) => { ev.stopPropagation(); removeProjectBuilderPiece(p); });
    if (porta) {
      // Alvo gordo pro dedo, invisível, só no contorno.
      const hit = projBuilderSvgEl('rect', {
        x: p.x, y: sy(p.y, p.h), width: p.w, height: p.h,
        fill: 'none', stroke: 'transparent', 'stroke-width': sw * 10,
        'pointer-events': 'stroke', class: 'po-proj-void-item'
      }, gP);
      hit.addEventListener('click', (ev) => { ev.stopPropagation(); removeProjectBuilderPiece(p); });
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
  const bSel = nSel && nSel._box;
  if (bSel) {
    projBuilderSvgEl('rect', {
      x: bSel.x, y: sy(bSel.y, bSel.h), width: bSel.w, height: bSel.h,
      fill: 'none', stroke: '#e0921f', 'stroke-width': sw * 3, 'pointer-events': 'none'
    }, svg);
    // Só dá pra digitar a medida do eixo em que o vão foi DIVIDIDO: é esse o
    // número que tem um vizinho pra ceder espaço. Vão raiz (sem pai) não tem
    // de quem tirar, então continua só de leitura.
    const eixoEdit = projectBuilderVaoAxis(nSel);
    const t = projBuilderSvgEl('text', {
      x: bSel.x + bSel.w / 2, y: sy(bSel.y + bSel.h) - fs * 0.35,
      'text-anchor': 'middle', 'font-size': fs * 0.75, fill: '#e0921f',
      'font-family': 'sans-serif',
      'pointer-events': eixoEdit ? 'auto' : 'none',
      style: eixoEdit ? 'cursor:text' : ''
    }, svg);
    t.textContent = Math.round(bSel.w) + ' × ' + Math.round(bSel.h);
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
  }

  // ---- pegadores das divisórias: arrastar pra mover, clicar pra tirar
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
      projectBuilderRangeDrag = { ancoraId: r.dataset.nodeId };
      projectBuilderSelIds = [r.dataset.nodeId];
      projectBuilderSelId = r.dataset.nodeId;
      projectBuilderPintaSelecao();
    });
    r.addEventListener('pointerenter', () => {
      if (!projectBuilderRangeDrag) return;
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

// Caixinha de digitar a medida, ancorada em cima da própria cota do desenho.
// position:fixed a partir do retângulo de tela do <text> — assim não depende
// do zoom do SVG nem de o stage ser position:relative.
function openProjectBuilderSizeInput(textEl, node, eixo) {
  const antigo = document.getElementById('po-proj-vao-input');
  if (antigo) antigo.remove();
  const r = textEl.getBoundingClientRect();
  const b = node._box || {};
  const inp = document.createElement('input');
  inp.id = 'po-proj-vao-input';
  inp.type = 'number';
  inp.value = Math.round(eixo === 'x' ? (b.w || 0) : (b.h || 0));
  inp.style.cssText = 'position:fixed;z-index:10000;width:88px;padding:4px 6px;'
    + 'font-size:13px;text-align:center;border:2px solid #e0921f;border-radius:6px;'
    + 'background:#fff;color:#7a4d0d;outline:none;'
    + 'left:' + Math.round(r.left + r.width / 2 - 44) + 'px;'
    + 'top:' + Math.round(r.top - 6) + 'px;';
  document.body.appendChild(inp);
  inp.focus();
  inp.select();
  let fechado = false;
  const fechar = (aplicar) => {
    if (fechado) return;
    fechado = true;
    const v = Number(inp.value);
    inp.remove();
    if (aplicar && isFinite(v) && v > 0) applyProjectBuilderVaoSize(node, v);
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
// era clique e a divisória sai.
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
    else removeProjectBuilderPiece(peca);   // não andou: era clique
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
    LayoutEngine.removeFront(node, p.frontIndex);
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
      const cat = {};
      (data || []).forEach((a) => { cat[a.id] = projectBuilderAccessoryEntry(a); });
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
  if (!slot.layout) { slot.layoutPieces = []; slot._layoutGeometry = null; return; }
  if (typeof LayoutEngine === 'undefined' || !accessoryCatalogCache) return;
  try {
    const zona = computeProjectSlotInnerZone(slot);
    const built = LayoutEngine.build(LayoutEngine.deserialize(slot.layout), zona, {
      catalogo: accessoryCatalogCache,
      espessura: PROJECT_BUILDER_ESPESSURA,
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

// A ponte, com as três travas que o preço exige. Pricing.calculateLeafPiece
// LANÇA (e derruba o preço do slot inteiro) quando falta cor, dobradiça ou
// corrediça — e a peça que nasce aqui não passou por nenhuma das telas que
// normalmente garantem isso. Então:
//   1. papel de cor sem cor escolhida cai numa cor que o slot JÁ usa;
//   2. porta sem modelo de dobradiça escolhido vira frente fixa;
//   3. gaveta sem modelo de corrediça escolhido não cobra corrediça.
// Nenhuma das três é silenciosa por preguiça: é sempre melhor a peça aparecer
// no desenho com um custo levemente incompleto do que o módulo inteiro perder
// o preço por causa de um cadastro que falta.
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
    ? (pieces || []).map((p) => Object.assign({}, p, { y: (Number(p.y) || 0) - legH_mm }))
    : (pieces || []);
  const rows = LayoutEngine.toPieceRows(pecas, accessoryCatalogCache);
  const escolhidas = slot.colorsByRole || {};
  const papeisComCor = Object.keys(escolhidas).filter((k) => escolhidas[k]);
  rows.forEach((r) => {
    if (!r.color_role_id || !escolhidas[r.color_role_id]) {
      const opcoes = (slot.colorOptionsByRole || {})[r.color_role_id] || [];
      if (r.color_role_id && opcoes.length) {
        // Papel existe no módulo e tem opção: adota a primeira, como faz
        // qualquer inserção nova.
        slot.colorsByRole = slot.colorsByRole || {};
        slot.colorsByRole[r.color_role_id] = opcoes[0];
      } else if (papeisComCor.length) {
        r.color_role_id = papeisComCor[0];
      }
    }
    if (r.hinge_side && r.hinge_side !== 'none' && !slot.hingeModel) r.hinge_side = 'none';
    if (r.slides_per_unit > 0 && !slot.slideModel) r.slides_per_unit = 0;
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
  if (!projectSlots.some((s) => s.layout)) return;
  (async () => {
    await ensureAccessoryCatalog();
    projectSlots.forEach((slot) => {
      if (!slot.layout) return;
      rebuildProjectSlotLayoutPieces(slot);
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
  const vazia = !r.splitAxis && !r.content && !(r.fronts || []).length && !(r.children || []).length;
  slot.layout = vazia ? null : LayoutEngine.serialize(r);

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
      // do próprio vão, from/to nulos = cobre ele inteiro).
      const faixa = projectBuilderSelIds.length > 1
        ? projectBuilderIrmaos(projectBuilderSelIds[0]) : null;
      if (faixa) {
        const idx = projectBuilderSelIds
          .map((id) => faixa.kids.findIndex((k) => k.id === id))
          .filter((i) => i >= 0);
        LayoutEngine.applyFront(faixa.pai, accessoryId,
          Math.min(...idx), Math.max(...idx), projectBuilderCat);
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
