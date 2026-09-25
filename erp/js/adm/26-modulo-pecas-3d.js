/* Painel admin — Visual 3D interativo pra "Componentes deste módulo"
 *
 * Pedido do usuário (2026-08-22, junto com desativar o Construtor de
 * módulos antigo — ver comentário em app.js): "seria maravilha uma
 * ferramenta que me ajuda visualmente a colocar os componentes no
 * modulo". A lista de "Componentes deste módulo" (13-modulo-pecas.js) já
 * existia — cada peça com posição X/Y/Z em campo de FÓRMULA livre
 * (offset_x/y/z_mm), sem nenhum jeito de ver onde ela cai sem salvar e
 * abrir a aba "Imagem 3D" (outra aba, só leitura). Este arquivo NÃO
 * reescreve nada daquilo — só acrescenta, por cima:
 *
 *   1. Um 3D AO VIVO dentro da própria aba "Componentes" (reaproveita o
 *      Viewer3D singleton — js/viewer3d.js — e o resolvedor de peças —
 *      js/module-pieces.js — exatamente como 11-modulo-3d.js já faz na
 *      aba "Imagem 3D").
 *   2. Steppers (◀◀10 ◀1 1▶ 10▶▶) do lado de cada campo de fórmula de
 *      posição — escrevem um NÚMERO LITERAL em mm direto nesse mesmo
 *      <input> de texto (ex: troca "D-d" por "120") e disparam os
 *      eventos input/change que 13-modulo-pecas.js já escuta — ZERO
 *      mudança de schema, zero mudança na função de salvar
 *      (collectPendingLinks já lê esses campos como estão).
 *   3. Prévia instantânea: como o nudge só muda a POSIÇÃO de uma peça já
 *      resolvida (não a fórmula de tamanho dela), dá pra atualizar o 3D
 *      NA HORA sem salvar e sem reavaliar fórmula nenhuma — muda só a
 *      posição da peça correspondente no array já resolvido (currentParts,
 *      abaixo) e chama Viewer3D.update() de novo.
 *   4. Duplo-clique numa peça no 3D -> destaca a linha correspondente na
 *      lista (usa Viewer3D.onPieceDoubleClick, o único hook de clique que
 *      viewer3d.js já expõe — não existe single-click em lugar nenhum do
 *      projeto, então reaproveita o que já tem em vez de inventar
 *      raycasting novo).
 *
 * Peça NOVA (dropdown "+ Adicionar componente/módulo", ainda sem linha
 * salva em module_components) não tem geometria resolvida ainda — só
 * aparece certinha no 3D depois de clicar "Salvar componentes deste
 * módulo" (mesmo comportamento de sempre da aba "Imagem 3D": só atualiza
 * em gatilho explícito, não fica "ao vivo" acompanhando cada tecla).
 *
 * LIMITAÇÃO CONHECIDA (Viewer3D é um singleton de verdade — uma cena/
 * câmera/renderer só pro processo inteiro, ver comentário grande em
 * viewer3d.js init()): igual 11-modulo-3d.js, só chamamos Viewer3D.init()
 * UMA VEZ por sessão (guardado por piecesViewerInitialized, mesmo padrão
 * de moduleImageViewerInitialized) — chamar de novo a cada troca de aba
 * recriaria cena/renderer/loop de animação a cada vez (init() é uma
 * reinicialização completa, não um reparent leve) e vazaria um loop de
 * animação novo por chamada. Isso significa que, se a aba "Imagem 3D" já
 * tiver sido usada (botão "Gerar imagem 3D" clicado) ANTES da primeira
 * vez que esta aba for aberta na mesma sessão, o canvas é "roubado" pra
 * cá (moduleImageViewerInitialized já estaria true e não dispara de novo
 * sozinho) — clicar "Gerar imagem 3D" de novo depois continua salvando a
 * miniatura certa (snapshot() lê o canvas atual, não liga pra onde ele
 * está no DOM), só a prévia 260×260 daquela aba fica congelada até
 * recarregar a página. Ordem mais comum (abrir Componentes primeiro,
 * Imagem 3D depois) não tem esse problema — o próprio clique em "Gerar
 * imagem 3D" reinicializa e reclama o canvas de volta normalmente. Não
 * vale reescrever viewer3d.js pra resolver isso agora.
 */

const ModulePieces3D = (function () {
  const CANVAS_ID = 'module-components-viewer3d-canvas';
  let piecesViewerInitialized = false;

  // Último array resolvido passado a Viewer3D.update() — cada part carrega
  // piece_id (= module_components.id da linha, ver loadRecursivePiecesForModule
  // em js/module-pieces.js) e offset_x/y/z_mm já como NÚMERO calculado, não
  // fórmula. É nele que os steppers mexem pra redesenhar sem salvar.
  let currentParts = null;
  let currentContainerDims = null;

  function findPartsForRowId(rowId) {
    if (!currentParts || !rowId) return [];
    return currentParts.filter((p) => p.piece_id === rowId);
  }

  // Mesma lógica de colorsByRole de captureModuleViewerSnapshot
  // (11-modulo-3d.js) — reaproveita os <select> de cor por papel que
  // aquele arquivo já preenche (moduleImageColorSelectEls/
  // moduleImageColorsCache, carregados por loadModuleImageColorOptions no
  // 10-modulos.js) pra não duplicar cadastro de cor só pra esta aba nova.
  function resolveColorsByRole() {
    const colorsByRole = {};
    Object.keys(moduleImageColorSelectEls || {}).forEach((roleId) => {
      const sel = moduleImageColorSelectEls[roleId];
      const roleColors = (moduleImageColorsCache.find((r) => r.role_id === roleId) || {}).colors || [];
      colorsByRole[roleId] = roleColors.find((c) => c.id === sel.value) || roleColors[0];
    });
    return colorsByRole;
  }

  // Carga "fria": busca as peças SALVAS do módulo atual (igual "Imagem 3D"
  // — não reflete edição ainda não salva na lista, só o nudge dos steppers
  // é que atualiza ao vivo por cima disto, ver redraw()) e desenha do zero.
  async function loadAndRender() {
    if (!selectedModuleId) return;
    const module = modulesCache.find((m) => m.id === selectedModuleId);
    if (!module) return;

    const pieces = await loadRecursivePiecesForModule(module.id);
    const colorsByRole = resolveColorsByRole();
    const containerDims = { W: module.width_default_mm, H: module.height_default_mm, D: module.depth_default_mm };
    const shelfQuantities = {};
    pieces.filter((p) => p.quantity_configurable).forEach((p) => { shelfQuantities[p.id] = p.quantity_default; });

    currentParts = resolvePiecesForViewer(pieces, containerDims, colorsByRole, shelfQuantities);
    currentContainerDims = containerDims;

    if (!piecesViewerInitialized) {
      Viewer3D.init(CANVAS_ID);
      piecesViewerInitialized = true;
    }

    // refit:true só na carga fria — câmera se reenquadra no módulo inteiro.
    // Nudge (redraw(), abaixo) usa refit:false de propósito, pra não ficar
    // pulando o enquadramento a cada clique num stepper.
    Viewer3D.update({
      width_mm: containerDims.W, height_mm: containerDims.H, depth_mm: containerDims.D,
      parts: currentParts, refit: true, tightFrame: true
    });
  }

  // Redesenho rápido depois de mexer só na posição de uma peça já resolvida
  // (currentParts mutado in-place por nudge(), abaixo) — sem buscar nada no
  // banco, sem reavaliar fórmula nenhuma.
  function redraw() {
    if (!piecesViewerInitialized || !currentParts || !currentContainerDims) return;
    Viewer3D.update({
      width_mm: currentContainerDims.W, height_mm: currentContainerDims.H, depth_mm: currentContainerDims.D,
      parts: currentParts, refit: false
    });
  }

  // Destaca a linha desta peça na lista (abre "▸ Configurar" se estiver
  // fechada, rola até ela, pisca uma borda) — usado pelo duplo-clique no 3D.
  function highlightRow(rowId) {
    document.querySelectorAll('.module-piece-row').forEach((el) => { el.style.outline = ''; });
    if (!rowId) return;
    const el = document.querySelector('.module-piece-row[data-row-id="' + String(rowId).replace(/"/g, '') + '"]');
    if (!el) return;
    // Estrutura fixa de renderModuleComponentRow/renderModuleNestedRow:
    // wrap.appendChild(header); wrap.appendChild(swapWrap); wrap.appendChild(detailsDiv);
    const detailsDiv = el.children[2];
    const toggleBtn = Array.prototype.find.call(
      el.querySelectorAll('button'),
      (b) => b.textContent.indexOf('Configurar') !== -1
    );
    // Clica de verdade no botão (em vez de só trocar detailsDiv.style.display
    // na mão) pra também atualizar o texto ▸/▾ dele, do jeito que o próprio
    // listener de 13-modulo-pecas.js já faz.
    if (detailsDiv && detailsDiv.style.display === 'none' && toggleBtn) toggleBtn.click();
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.style.outline = '3px solid #2563eb';
    el.style.transition = 'outline-color 0.3s';
    setTimeout(() => { el.style.outline = ''; }, 2500);
  }

  // Duplo-clique numa peça no 3D (Viewer3D.onPieceDoubleClick) -> acha a
  // linha correspondente. viewer3d.js NÃO carrega piece_id no userData da
  // peça (tagPieceUserData só guarda reference/width/height/depth/color_name
  // — ver comentário lá), então casa por referência + as 3 medidas
  // arredondadas. Duas peças idênticas (mesmo nome, mesma medida) no mesmo
  // módulo podem colidir aqui — casa com a primeira; aceitável pra v1 (não
  // vale editar viewer3d.js, arquivo grande e compartilhado, só pra carregar
  // mais um campo no userData).
  //
  // BUSCA RECURSIVA + SOBE PRA LINHA DE NÍVEL SUPERIOR: peça-módulo aninhada
  // (ex: "Drawer Soft Closet Externa") desenha cada peça FILHA dela com sua
  // própria pieceInfo (tagPieceUserData é chamado peça por peça, não uma vez
  // só pro grupo inteiro) — então duplo-clique em QUALQUER parte visível de
  // um módulo aninhado quase sempre acha uma peça-FILHA (ex: "Lateral
  // esquerda" da gaveta), cujo piece_id é de uma linha de module_components
  // do módulo FILHO, não uma linha da lista deste módulo (o pai, que é tudo
  // que esta aba edita). Por isso a busca desce em child_pieces recursivamente
  // pra achar o match em qualquer profundidade, mas destaca sempre a linha de
  // NÍVEL SUPERIOR (item direto de currentParts) que contém aquele match —
  // é a linha de que faz sentido editar aqui, e é o que o admin esperaria ao
  // clicar em qualquer ponto visível daquela peça-módulo.
  function findMatchAndTopLevelId(parts, info, topLevelPieceId) {
    for (const p of (parts || [])) {
      const id = topLevelPieceId || p.piece_id;
      if ((p.reference || null) === (info.reference || null) &&
        Math.round(p.width_mm) === Math.round(info.width_mm) &&
        Math.round(p.height_mm) === Math.round(info.height_mm) &&
        Math.round(p.depth_mm) === Math.round(info.depth_mm)) {
        return id;
      }
      if (p.child_pieces && p.child_pieces.length) {
        const found = findMatchAndTopLevelId(p.child_pieces, info, id);
        if (found) return found;
      }
    }
    return null;
  }

  function onPieceClickedIn3D(info) {
    if (!currentParts || !info) return;
    const topLevelId = findMatchAndTopLevelId(currentParts, info, null);
    if (topLevelId) highlightRow(topLevelId);
  }

  function makeStepperBtn(label, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'secondary';
    btn.textContent = label;
    btn.style.marginTop = '0';
    btn.style.padding = '2px 6px';
    btn.style.fontSize = '11px';
    btn.addEventListener('click', onClick);
    return btn;
  }

  // Lê a posição ATUAL da peça (resolvida, se currentParts tiver ela; senão
  // o que já estiver no próprio <input> de fórmula), soma o delta, escreve
  // o número literal de volta no <input> (dispara input/change — é assim
  // que 13-modulo-pecas.js grava no upsert) e, se a peça já estava
  // desenhada no 3D, atualiza a posição dela em memória e redesenha.
  function nudge(ref, axisLetter, delta) {
    const field = ref['offset' + axisLetter + 'Field'];
    if (!field) return;
    const propName = 'offset_' + axisLetter.toLowerCase() + '_mm';
    const parts = findPartsForRowId(ref.rowId);
    const base = parts.length ? parts[0][propName] : (parseFloat(field.input.value) || 0);
    const next = Math.round((base + delta) * 100) / 100;
    field.input.value = String(next);
    field.input.dispatchEvent(new Event('input', { bubbles: true }));
    field.input.dispatchEvent(new Event('change', { bubbles: true }));
    if (parts.length) {
      parts.forEach((p) => { p[propName] = next; });
      redraw();
    }
  }

  // Acrescenta a barra de steppers do lado do campo de fórmula (offsetXField/
  // Y/Z.div, ver makeOffsetField em 13-modulo-pecas.js) — idempotente
  // (dataset.mp3dStepped) porque renderModuleComponentsList reconstrói a
  // lista inteira do zero a cada chamada, então isto roda de novo em cima de
  // <div>s recém-criados sempre, nunca dos mesmos.
  function buildStepperControls(ref, axisLetter, fieldObj) {
    if (!fieldObj || fieldObj.div.dataset.mp3dStepped) return;
    fieldObj.div.dataset.mp3dStepped = '1';

    const bar = document.createElement('div');
    bar.style.display = 'flex';
    bar.style.gap = '2px';
    bar.style.marginTop = '4px';
    bar.style.alignItems = 'center';

    bar.appendChild(makeStepperBtn('◀◀ 10', () => nudge(ref, axisLetter, -10)));
    bar.appendChild(makeStepperBtn('◀ 1', () => nudge(ref, axisLetter, -1)));
    bar.appendChild(makeStepperBtn('1 ▶', () => nudge(ref, axisLetter, 1)));
    bar.appendChild(makeStepperBtn('10 ▶▶', () => nudge(ref, axisLetter, 10)));
    fieldObj.div.appendChild(bar);
  }

  // Chamado depois de CADA render da lista de peças (ver o wrap em
  // renderModuleComponentsList, no fim deste arquivo) — injeta os steppers
  // nos campos de offset que acabaram de nascer.
  function attachSteppersToCurrentRefs() {
    (moduleComponentFieldRefs || []).forEach((ref) => {
      if (!ref.offsetXField) return;
      buildStepperControls(ref, 'X', ref.offsetXField);
      buildStepperControls(ref, 'Y', ref.offsetYField);
      buildStepperControls(ref, 'Z', ref.offsetZField);
    });
  }

  // Chamado por showModuleConfigSubtab (10-modulos.js) quando a aba
  // "Componentes" (#pieces-section) vira a aba ativa.
  function onTabShown() {
    if (!selectedModuleId) return;
    loadAndRender().catch((err) => console.error('[26-modulo-pecas-3d] falha ao montar o 3D:', err));
    Viewer3D.onPieceDoubleClick(onPieceClickedIn3D);
  }

  // ---------- "+ Adicionar porta" / "+ Adicionar frente de gaveta" ----------
  // Pedido do usuário (2026-08-23): um botão que insira porta(s)/frente de
  // gaveta na lista de Componentes "exatamente como no construtor do
  // portal" e "seguindo as regras que já temos" — reaproveita:
  //   - o corte 1×2 folhas de porta giro de js/layout-engine.js
  //     (PORTA_GIRO_1_FOLHA_ATE_MM=500 / PORTA_GIRO_2_FOLHAS_DE_MM=600,
  //     decisão já confirmada com o Matt, comentário no próprio arquivo),
  //     simplificado pra um corte único em 600mm — não existe "cliente
  //     escolhe" em module_components (peça fixa de catálogo), só a faixa
  //     500-600 que era ambígua no Construtor antigo;
  //   - o gap de 3mm entre as 2 folhas (`folgaEntreFolhas`, mesmo arquivo,
  //     default quando o cadastro não sobrescreve);
  //   - os módulos `Porta` e `Front Drawer` (1x "Flatbord 4L" cada,
  //     height_formula_override="H") — já existiam cadastrados no catálogo
  //     mas NUNCA tinham sido usados em nenhum módulo (checado direto no
  //     banco em 2026-08-23: 0 linhas com child_module_id preenchido e
  //     position_role='front' na tabela inteira). O botão só liga o que já
  //     estava pronto — procura por NOME (não por id fixo), então continua
  //     funcionando se algum dia esses módulos forem duplicados/recriados;
  //   - a mesma convenção de espessura de peça plana visível (19mm, igual
  //     "Back") e a mesma fórmula-padrão de Posição Z pra encostar na
  //     frente do módulo ("D-d", mesmo hint que já aparece no campo hoje).
  // Cada clique só insere linha(s) de PEÇA-MÓDULO NA TELA, via
  // renderModuleNestedRow — a mesma função que "+ Adicionar módulo (peça
  // aninhada)" já usa pro clique manual — passando um objeto de valores
  // pré-preenchidos no lugar de existingLink (mesmíssimo truque que "+
  // Duplicar"/"📋 Colar aqui" já usam pra clonar configuração de linha).
  // Nada é gravado até "Salvar componentes deste módulo", igual toda a
  // tela já funciona hoje.
  const DOOR_SPLIT_WIDTH_MM = 600; // <=600mm: 1 folha; >600mm: 2 folhas
  const DOOR_LEAF_GAP_MM = 3; // folga entre as 2 folhas de uma porta dupla
  const FRONT_PANEL_DEPTH_FORMULA = '19'; // espessura — mesma convenção de "Back"

  function findCatalogModuleByName(name) {
    return (modulesCache || []).find((m) => m.name === name) || null;
  }

  // Papel de cor "Porta/Frente" (migration 035, colorRolesCache já
  // carregado por 13-modulo-pecas.js) — se o cadastro não tiver um papel
  // com esse nome, deixa em branco e o campo cai no primeiro papel da
  // lista (mesmo default de sempre quando existingLink.color_role_id não
  // vem preenchido); o Matt troca no dropdown "Cor" se precisar.
  function findFrontColorRoleId() {
    const role = (colorRolesCache || []).find((r) => /porta|frente/i.test(r.name || ''));
    return role ? role.id : undefined;
  }

  function afterInsert() {
    setSaveStatus('Alterações não salvas.', 'unsaved');
    computeModulePieces();
  }

  // "+ Adicionar porta" — insere as 3 linhas de uma vez (1 folha / esquerda
  // 2 folhas / direita 2 folhas), cada uma já com a Condição de
  // visibilidade certa pra só a combinação certa aparecer (preço + 3D)
  // conforme a largura REAL do módulo — o Matt não precisa escolher qual
  // das 3 usar, só ajustar offset/altura depois se a geometria do módulo
  // pedir (ex: porta abaixo de uma gaveta, como no Base Cabinet).
  //
  // CORRIGIDO (2026-08-23, Matt: "a porta eu coloquei D-d e ela se encontra
  // bem longe do modulo" + "nao ta aparecendo o 3d... depois que acrescentei
  // as portas ele sumiu"): offset_x_mm/offset_z_mm de uma peça position_role
  // ='front' NÃO são posição absoluta — são só um AJUSTE FINO somado em cima
  // de uma posição já automática (ver placeFrontGroupInBox em js/viewer3d.js,
  // comentário grande logo antes da função): Z já nasce encostado na frente
  // sozinho (D/2 + espessura/2 + 2mm de gap — a peça de 'front' é a ÚNICA
  // que não passa pelo "zero absoluto" das demais posições), e X já nasce
  // empilhado da esquerda pra direita pela LARGURA REAL de cada porta (nada
  // de repartir em fatias iguais). "D-d" tratava isso como se fosse
  // 'free'/'back' (zero absoluto) — somava ~580mm a mais em cima do que já
  // estava certo, jogando a porta pra bem longe do módulo (e o "refit" da
  // câmera, que enquadra TODAS as peças, afundava o módulo real num canto
  // minúsculo do enquadramento — é isso que parecia "o 3D sumiu"). Fix: 0
  // em ambos (sem ajuste — a posição automática já é a certa); a largura
  // real de cada porta (width_formula_override) já é o que decide o
  // empilhamento em X, não precisa mais calcular offset_x manual pra
  // "direita" encostar depois da "esquerda".
  function insertDoorRows(container, insertBeforeEl) {
    const portaModule = findCatalogModuleByName('Porta');
    if (!portaModule) {
      alert('Módulo "Porta" não encontrado no catálogo (Cadastro de produtos) — confirme o nome antes de usar este botão.');
      return;
    }
    const colorRoleId = findFrontColorRoleId();
    const base = {
      position_role: 'front',
      color_role_id: colorRoleId,
      offset_x_mm: '0',
      offset_y_mm: '0',
      offset_z_mm: '0',
      depth_formula_override: FRONT_PANEL_DEPTH_FORMULA,
      visibility_dimension: 'W'
    };
    const halfWidthFormula = `(W-${DOOR_LEAF_GAP_MM})/2`;
    const rows = [
      {
        suggestedName: 'Porta (1 folha)',
        link: {
          ...base, width_formula_override: 'W', height_formula_override: 'H',
          opening_type: 'hinge_right',
          visibility_max_mm: DOOR_SPLIT_WIDTH_MM
        }
      },
      {
        suggestedName: 'Porta esquerda (2 folhas)',
        link: {
          ...base, width_formula_override: halfWidthFormula, height_formula_override: 'H',
          opening_type: 'hinge_left',
          visibility_min_mm: DOOR_SPLIT_WIDTH_MM
        }
      },
      {
        suggestedName: 'Porta direita (2 folhas)',
        link: {
          ...base, width_formula_override: halfWidthFormula, height_formula_override: 'H',
          opening_type: 'hinge_right',
          visibility_min_mm: DOOR_SPLIT_WIDTH_MM
        }
      }
    ];
    rows.forEach((row) => {
      renderModuleNestedRow(portaModule, row.link, container, insertBeforeEl, true, row.suggestedName);
    });
    moduleComponentRenderedModuleIds.add(portaModule.id);
    refreshAddModuleOptions();
    afterInsert();
  }

  // "+ Adicionar frente de gaveta" — insere 1 linha só (frente de gaveta
  // não se divide por largura, só porta — pedido explícito do Matt). Altura
  // inicial (150mm) e offset_y (H-150, ou seja encostada no topo do
  // módulo) são um CHUTE DE PARTIDA, não uma medida calculada da gaveta
  // real — ajuste com os steppers + 3D ao vivo (é pra isso que servem).
  // offset_z_mm=0 (não "D-d"): peça position_role='front' já nasce encostada
  // na frente sozinha — ver comentário grande em insertDoorRows/
  // placeFrontGroupInBox (js/viewer3d.js) sobre esse offset ser um AJUSTE
  // em cima da posição automática, não uma posição absoluta.
  function insertDrawerFrontRow(container, insertBeforeEl) {
    const frontModule = findCatalogModuleByName('Front Drawer');
    if (!frontModule) {
      alert('Módulo "Front Drawer" não encontrado no catálogo (Cadastro de produtos) — confirme o nome antes de usar este botão.');
      return;
    }
    const link = {
      position_role: 'front',
      color_role_id: findFrontColorRoleId(),
      width_formula_override: 'W',
      height_formula_override: '150',
      depth_formula_override: FRONT_PANEL_DEPTH_FORMULA,
      offset_x_mm: '0',
      offset_y_mm: 'H-150',
      offset_z_mm: '0',
      opening_type: 'none'
    };
    renderModuleNestedRow(frontModule, link, container, insertBeforeEl, true, 'Frente de gaveta');
    moduleComponentRenderedModuleIds.add(frontModule.id);
    refreshAddModuleOptions();
    afterInsert();
  }

  // Monta a linha de botões "+ Adicionar porta" / "+ Adicionar frente de
  // gaveta", sempre como os ÚLTIMOS filhos de #module-components-list —
  // chamado a cada renderModuleComponentsList (ver wrap no fim deste
  // arquivo), que já reconstrói o container inteiro do zero a cada vez —
  // por isso não precisa de guarda de idempotência (nunca duplica).
  function ensureAddFrontButtons() {
    const container = document.getElementById('module-components-list');
    if (!container || !selectedModuleId) return;

    const wrap = document.createElement('div');
    wrap.style.marginTop = '10px';
    wrap.style.borderTop = '1px solid #eee';
    wrap.style.paddingTop = '12px';
    wrap.style.display = 'flex';
    wrap.style.gap = '8px';
    wrap.style.flexWrap = 'wrap';

    const doorBtn = document.createElement('button');
    doorBtn.type = 'button';
    doorBtn.className = 'secondary';
    doorBtn.textContent = '+ Adicionar porta';
    doorBtn.title = 'Insere porta(s) usando o módulo "Porta" do catálogo — 1 folha até 600mm de largura, 2 folhas acima disso (mesma regra do construtor antigo). Nada é gravado até clicar em "Salvar componentes deste módulo".';
    doorBtn.addEventListener('click', () => insertDoorRows(container, wrap));

    const drawerBtn = document.createElement('button');
    drawerBtn.type = 'button';
    drawerBtn.className = 'secondary';
    drawerBtn.textContent = '+ Adicionar frente de gaveta';
    drawerBtn.title = 'Insere uma frente usando o módulo "Front Drawer" do catálogo. Altura/posição iniciais são um chute — ajuste com os steppers + 3D ao vivo pra encaixar na gaveta real.';
    drawerBtn.addEventListener('click', () => insertDrawerFrontRow(container, wrap));

    wrap.appendChild(doorBtn);
    wrap.appendChild(drawerBtn);
    container.appendChild(wrap);
  }

  return { onTabShown, attachSteppersToCurrentRefs, ensureAddFrontButtons };
})();

// Depois de CADA renderModuleComponentsList (13-modulo-pecas.js) — que
// reconstrói a lista inteira do zero, inclusive logo depois de "Salvar
// componentes deste módulo" (mesmo arquivo, botão de salvar) — reinjeta os
// steppers (a lista é toda recriada) e, se a aba "Componentes" for a aba
// visível agora, recarrega o 3D a partir do banco (reflete o que acabou de
// ser salvo, ou o módulo recém-selecionado). Sem editar 13-modulo-pecas.js:
// só embrulha a função global existente, mesmo espírito do resto do
// convênio de arquivos numerados deste projeto (lógica nova em arquivo
// novo, não empilhada no maior arquivo do ERP).
const modulePiecesListRenderOriginal = renderModuleComponentsList;
renderModuleComponentsList = async function () {
  await modulePiecesListRenderOriginal.apply(this, arguments);
  ModulePieces3D.attachSteppersToCurrentRefs();
  ModulePieces3D.ensureAddFrontButtons();
  const pieceSection = document.getElementById('pieces-section');
  if (pieceSection && pieceSection.style.display !== 'none') {
    ModulePieces3D.onTabShown();
  }
};
