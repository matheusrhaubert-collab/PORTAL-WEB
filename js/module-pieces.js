/* RESOLVEDOR DE PEÇAS DE UM MÓDULO — a ÚNICA cópia.
 *
 * Por que este arquivo existe (2026-08-15)
 * ----------------------------------------
 * `loadRecursivePiecesForModule` estava DUPLICADO em quatro arquivos:
 * js/admin.js, js/client.js, js/portal.js e erp/js/adm/11-modulo-3d.js. Cada
 * um com o próprio `.select(...)` das colunas de module_components e a
 * própria montagem do objeto `part`.
 *
 * Isso queimou de verdade: na migration 105 (programas de furação) o campo
 * `drilling_pattern_id` foi adicionado só numa das cópias. A tela do ERP usa
 * outra — e passou a mostrar "Nenhum furo gerado", SEM erro no console,
 * enquanto o resto parecia funcionar. Peça sem furo não é erro de tela: é
 * peça perdida na fábrica. O Matt: "isso é perigoso, por isso que não achei
 * furação nova."
 *
 * Agora é uma só. Coluna nova entra AQUI e vale para o portal, o ERP e a
 * calculadora legada de uma vez.
 *
 * Quem carrega: portal.html, erp/index.html e calculadora-legado.html — antes
 * do respectivo portal.js / 11-modulo-3d.js / client.js.
 *
 * A ÚNICA diferença de comportamento que existia entre as cópias era como
 * reportar erro de carregamento (o ERP usa showError('module-image-error'),
 * o portal usa I18n). Virou o gancho abaixo: cada página define o seu se
 * quiser; sem isso, cai no console.
 */
function modulePiecesReportarErro(error) {
  if (typeof MODULE_PIECES_ON_ERROR === 'function') { MODULE_PIECES_ON_ERROR(error); return; }
  console.error('[module-pieces] falha ao carregar as peças do módulo:', error);
}

async function loadRecursivePiecesForModule(moduleId) {
  const { data, error } = await supabaseClient
    .from('module_components')
    .select('id, component_id, child_module_id, quantity_override, sort_order, width_formula_override, height_formula_override, depth_formula_override, offset_x_mm, offset_y_mm, offset_z_mm, quantity_configurable, quantity_min, quantity_max, quantity_default, client_optional, client_optional_default_on, position_role, color_role_id, opening_type, slides_per_unit, visibility_dimension, visibility_min_mm, visibility_max_mm, reference_override, client_dimension_configurable, width_min_mm, width_default_mm, width_max_mm, height_min_mm, height_default_mm, height_max_mm, depth_min_mm, depth_default_mm, depth_max_mm, client_color_configurable, tilt_angle_deg, rotation_y_deg, usinagem_m, recortes, abre_recorte, drilling_pattern_id, grain_dir, drilling_patterns(furos_equivalentes, fura), components(*, labor_types(*), component_types(*))')
    .eq('module_id', moduleId)
    .order('sort_order');
  if (error) { modulePiecesReportarErro(error); return []; }

  const result = [];
  for (const row of (data || [])) {
    if (row.component_id) {
      if (!row.components || !row.components.active) continue;
      const quantity = (row.quantity_override !== null && row.quantity_override !== undefined)
        ? row.quantity_override
        : row.components.quantity;
      const labor_cost_per_unit = row.components.labor_types ? row.components.labor_types.price_per_unit : 0;
      // Papel de cor (migration 035) vem do tipo do componente, não mais de
      // um boolean is_front fixo.
      const color_role_id = row.components.component_types ? row.components.component_types.color_role_id : null;
      // Posicionamento (migration 024) — eixo de espessura explícito no 3D,
      // ver client.js/viewer3d.js. null = automático (comportamento antigo).
      const positioning = row.components.component_types ? row.components.component_types.positioning : null;
      const width_formula = row.width_formula_override || row.components.width_formula;
      const height_formula = row.height_formula_override || row.components.height_formula;
      const depth_formula = row.depth_formula_override || row.components.depth_formula;
      result.push({
        ...row.components,
        // Programa de furação + veio POR USO (migration 105). Este arquivo é
        // UMA DAS QUATRO cópias do resolvedor (admin.js, client.js, portal.js,
        // erp/js/adm/11-modulo-3d.js) — todas precisam carregar os mesmos
        // campos. Uma ficar pra trás significa peça saindo SEM FURO, e em
        // silêncio: foi assim que a tela do ERP passou a mostrar "nenhum furo
        // gerado" enquanto o admin antigo funcionava.
        drilling_pattern_id: row.drilling_pattern_id || null,
        grain_dir: row.grain_dir || null,
        // O NÚMERO DE FUROS VEM DO PROGRAMA quando existe um (2026-08-15).
        //
        // `furos_equivalentes` é o que o custo de mão de obra usa pra cobrar a
        // parte VARIÁVEL da furação (Pricing.processLaborFor: furacao_peca +
        // furos × furacao_furo). Ele sempre morou em `components` — e na linha
        // "flatbord" isso dá ZERO, porque a chapa crua não tem furo nenhum: o
        // furo é do USO. Resultado: a furação cobrava só a parcela fixa por
        // peça, e o Matt viu "não está somando valor por furo na conta".
        //
        // Mesma lógica de `fura`: peça cujo programa diz que não leva furo não
        // paga furação, mesmo que o componente diga o contrário.
        //
        // Sem programa, cai no componente — módulos antigos não mudam nada.
        furos_equivalentes: row.drilling_patterns
          ? (Number(row.drilling_patterns.furos_equivalentes) || 0)
          : (row.components ? row.components.furos_equivalentes : 0),
        fura: row.drilling_patterns
          ? row.drilling_patterns.fura !== false
          : (row.components ? row.components.fura !== false : true),
        // id vira o da LINHA (row.id), não o do catálogo — migration 025
        // permite repetir o mesmo componente em 2+ linhas do mesmo módulo;
        // sem isso, as instâncias colidiriam em selectedOptionalComponentIds/
        // shelfQuantities (keyed por piece.id em client.js/portal.js/pricing.js).
        id: row.id,
        // Id do CATÁLOGO (components.id) — o spread acima o perde (id vira o
        // da linha, migration 025). A furação padrão do COMPONENTE precisa
        // dele. O portal não carregava este campo; ao unificar, passa a
        // carregar (inofensivo lá, indispensável no ERP).
        component_id: row.component_id,
        // Nome customizado desta instância (migration 032) — sobrescreve o
        // nome do catálogo só na exibição (balão do 3D). Fica DEPOIS do
        // ...row.components pra não ser apagado pelo spread.
        reference: row.reference_override || row.components.reference,
        quantity, labor_cost_per_unit, positioning,
        /* Migration 090 — POSIÇÃO E COR PASSAM A SER DO USO, não da peça.
           A peça genérica ("Flatbord 2C") é a mesma chapa em qualquer lugar
           do módulo; o que ela vira — base, divisória, topo — é decidido
           aqui, na linha que diz "este módulo usa esta peça".

           As duas colunas já existiam em module_components e já eram lidas
           na peça-MÓDULO; a peça-folha simplesmente nunca as leu. O schema
           inclusive documenta a intenção: "componente usa
           components.position_role" quando nulo.

           Seguro por construção: o admin grava null em toda linha de
           peça-folha (13-modulo-pecas.js), então nulo continua herdando e
           nenhum módulo existente se mexe. */
        position_role: row.position_role || row.components.position_role,
        color_role_id: row.color_role_id || color_role_id,
        // Metros de usinagem DESTE uso (migration 092) — a mesma lateral é
        // entalhada numa carcaça e lisa em outra, por isso vem da linha do
        // módulo e não do componente.
        usinagem_m: row.usinagem_m || 0,
        // Recortes em L DESTE uso (migration 094) — lista de {canto, h, d}.
        // Mesmo motivo de estar na linha do módulo: a mesma lateral é
        // entalhada numa carcaça e lisa em outra. Lista e não um recorte só
        // porque a carcaça gola + toe 4½ leva os dois na mesma peça. Só
        // desenho: a chapa continua sendo cortada retangular.
        recortes: Array.isArray(row.recortes) ? row.recortes : [],
        // migration 111 — esta peça ENTALHA quem ela cruzar (gola, toe 4½).
        // Quem lê é recortarInternosContraCasco, em portal.js.
        abre_recorte: !!row.abre_recorte,
        // Veio e "leva furo" (migration 086) — o Construtor valida o CASCO
        // contra a chapa com estes dois, exatamente como valida as peças da
        // árvore. Sem eles, uma peça grande demais pra chapa passava batido.
        veio: row.components.veio || 'livre',
        fura: row.components.fura !== false,
        // Limite do lado no plano da máquina (migration 090)
        lado_min_mm: row.components.lado_min_mm || null,
        lado_max_mm: row.components.lado_max_mm || null,
        width_formula, height_formula, depth_formula,
        offset_x_formula: row.offset_x_mm || '0',
        offset_y_formula: row.offset_y_mm || '0',
        offset_z_formula: row.offset_z_mm || '0',
        quantity_configurable: !!row.quantity_configurable,
        quantity_min: row.quantity_min,
        quantity_max: row.quantity_max,
        quantity_default: row.quantity_default,
        client_optional: !!row.client_optional,
        client_optional_default_on: !!row.client_optional_default_on,
        visibility_dimension: row.visibility_dimension || null,
        visibility_min_mm: row.visibility_min_mm,
        visibility_max_mm: row.visibility_max_mm,
        // Cor configurável separadamente (migration 046, generalizado pra
        // peça-folha 2026-07-19) — "cliente pode escolher a cor desta peça
        // separadamente", ver collectColorConfigurablePieces/
        // renderColorRoleSwatchGroups. Antes só existia em peça-módulo.
        client_color_configurable: !!row.client_color_configurable,
        is_module: false
      });
    } else if (row.child_module_id) {
      const [fixedDepths, childPieces, lockedPresets, ownHingeSlide] = await Promise.all([
        fetchModuleFixedDepths(row.child_module_id),
        loadRecursivePiecesForModule(row.child_module_id),
        fetchModuleLockedDimensionPresets(row.child_module_id),
        fetchModuleOwnHingeAndSlideModels(row.child_module_id)
      ]);
      result.push({
        // id vira o da LINHA (row.id) em vez do child_module_id — mesmo
        // motivo do branch de componente acima (migration 025).
        id: row.id,
        is_module: true,
        // reference_override (migration 032) tem prioridade; sem ele, cai no
        // fallback module_name já existente em resolvePiecesForViewer
        // (piece.reference || piece.module_name).
        reference: row.reference_override || null,
        position_role: row.position_role || 'other',
        color_role_id: row.color_role_id || null,
        opening_type: row.opening_type || 'none',
        slides_per_unit: row.slides_per_unit || 0,
        tilt_angle_deg: row.tilt_angle_deg || 0, // migration 066 — inclinação do conjunto (só 'shelf')
        rotation_y_deg: row.rotation_y_deg || 0, // migration 067 — giro de canto do conjunto (só 'free')
        width_formula: row.width_formula_override,
        height_formula: row.height_formula_override,
        depth_formula: row.depth_formula_override,
        offset_x_formula: row.offset_x_mm || '0',
        offset_y_formula: row.offset_y_mm || '0',
        offset_z_formula: row.offset_z_mm || '0',
        quantity: (row.quantity_override !== null && row.quantity_override !== undefined) ? row.quantity_override : 1,
        quantity_configurable: !!row.quantity_configurable,
        quantity_min: row.quantity_min,
        quantity_max: row.quantity_max,
        quantity_default: row.quantity_default,
        client_optional: !!row.client_optional,
        client_optional_default_on: !!row.client_optional_default_on,
        visibility_dimension: row.visibility_dimension || null,
        visibility_min_mm: row.visibility_min_mm,
        visibility_max_mm: row.visibility_max_mm,
        // Sub-configuração de medidas (migration 036) — "cliente pode
        // configurar as medidas desta peça", ver renderModuleNestedRow no
        // admin. Só existe em peça-módulo (mesmo raciocínio de position_role/
        // cor/abertura acima).
        client_dimension_configurable: !!row.client_dimension_configurable,
        // Cor configurável por instância (migration 046) — "cliente pode
        // escolher a cor desta peça separadamente", ver
        // collectColorConfigurablePieces/renderColorRoleSwatchGroups. Só
        // existe (e só é gravado) numa peça-módulo, mesmo raciocínio de
        // client_dimension_configurable acima.
        client_color_configurable: !!row.client_color_configurable,
        width_min_mm: row.width_min_mm,
        width_default_mm: row.width_default_mm,
        width_max_mm: row.width_max_mm,
        height_min_mm: row.height_min_mm,
        height_default_mm: row.height_default_mm,
        height_max_mm: row.height_max_mm,
        depth_min_mm: row.depth_min_mm,
        depth_default_mm: row.depth_default_mm,
        depth_max_mm: row.depth_max_mm,
        fixed_depths: fixedDepths,
        locked_width_presets: lockedPresets.width,
        locked_height_presets: lockedPresets.height,
        locked_depth_presets: lockedPresets.depth,
        // Presets COM rótulo (ex: '55"') — pros dropdowns de tamanho
        // (renderOptionalComponents e renderPieceDimensionSubconfigs); o
        // cálculo usa os arrays sem rótulo acima.
        locked_width_preset_options: lockedPresets.widthLabeled,
        locked_height_preset_options: lockedPresets.heightLabeled,
        locked_depth_preset_options: lockedPresets.depthLabeled,
        // Módulo filho decorativo (migration 039) — o "Configurar peça" só
        // mostra dropdowns de eixo travado (ex: polegada da TV), nunca
        // sliders livres (ver renderPieceDimensionSubconfigs).
        is_decoration: lockedPresets.is_decoration,
        own_hinge_model: ownHingeSlide.hinge,
        own_slide_model: ownHingeSlide.slide,
        // Limite de tamanho PRÓPRIO do módulo filho (sempre ativo, ver
        // fetchModuleLockedDimensionPresets) — clampado em
        // resolvePiecesForViewer/Pricing.calculateModulePiece.
        own_width_min_mm: lockedPresets.ownWidthMinMm,
        own_width_max_mm: lockedPresets.ownWidthMaxMm,
        own_height_min_mm: lockedPresets.ownHeightMinMm,
        own_height_max_mm: lockedPresets.ownHeightMaxMm,
        own_depth_min_mm: lockedPresets.ownDepthMinMm,
        own_depth_max_mm: lockedPresets.ownDepthMaxMm,
        // Nome do módulo filho — só pra dar nome à peça no painel de
        // duplo-clique do 3D (viewer3d.js); nada de cálculo depende disso.
        module_name: lockedPresets.name,
        child_pieces: childPieces
      });
    }
  }
  return result;
}


/* ==========================================================================
   O RESTO DA FAMÍLIA — unificado em 2026-08-15 ("unifica tudo que puder")
   ==========================================================================
   Estas funções andam juntas com o resolvedor acima e estavam duplicadas nos
   mesmos arquivos (portal.js, client.js, erp/js/adm/11-modulo-3d.js e
   12-modulo-medidas.js). Auditoria do dia:

     resolvePiecesForViewer             3 cópias
     fetchModuleFixedDepths             3 cópias  (idênticas)
     fetchModuleLockedDimensionPresets  3 cópias
     fetchModuleOwnHingeAndSlideModels  3 cópias  (idênticas)
     collectUsedColorRoleIds            2 cópias  (idênticas)

   A versão do PORTAL virou a canônica por ser sempre a mais completa. Onde
   as cópias divergiam, o resultado é a UNIÃO — as diferenças eram
   complementares, não conflitantes:

     · resolvePiecesForViewer: o portal tinha cor por peça
       (pieceColorOverrides); o ERP tinha os campos da furação (component_id,
       fura, veio, lado_min/max). Agora tem os dois.
     · fetchModuleLockedDimensionPresets: a do portal já era superconjunto
       (is_decoration + presets com rótulo). Campo a mais não atrapalha quem
       não usa.
   ========================================================================== */
function resolvePiecesForViewer(piecesList, containerDims, colorsByRole, shelfQuantities, dimOverrides, pieceColorOverrides) {
  const { bodyDims } = Pricing.resolveBodyDims(piecesList, containerDims);
  const parts = [];
  (piecesList || []).forEach((piece) => {
    const pieceContainerDims = piece.position_role === 'leg' ? containerDims : bodyDims;
    const quantityOverride = piece.quantity_configurable ? shelfQuantities[piece.id] : undefined;
    // Sub-configuração de medidas (migration 036) — mesma peça, mesmo id
    // (module_components.id) usado em Pricing.calculateAssembly, pra 3D e
    // preço nunca divergirem (ver comentário em calculatePiece/pricing.js).
    const dimOverride = piece.client_dimension_configurable && dimOverrides ? dimOverrides[piece.id] : undefined;
    const dims = Pricing.calculatePiece(piece, pieceContainerDims, quantityOverride, dimOverride);

    // Visibilidade condicional (migration 031) — mesma checagem do preço
    // (Pricing.calculateAssembly), pra 3D e preço nunca divergirem: sem isso
    // aqui, uma peça escondida do preço continuaria aparecendo no desenho.
    if (!Pricing.isPieceVisible(piece, pieceContainerDims)) return;

    // Peça-módulo com dimensão TRAVADA (locked_*_presets) que não cabe nem
    // no MENOR valor cadastrado nessa dimensão: essa peça NÃO EXISTE nessa
    // configuração (mesma regra de Pricing.calculateModulePiece, pra preço e
    // 3D nunca divergirem) — some do desenho em vez de aparecer menor do que
    // qualquer configuração real dela permite.
    if (Pricing.isBelowMinLockedPreset(piece.locked_width_presets, dims.width_mm)
      || Pricing.isBelowMinLockedPreset(piece.locked_height_presets, dims.height_mm)
      || Pricing.isBelowMinLockedPreset(piece.locked_depth_presets, dims.depth_mm)) {
      return;
    }

    // Cor própria desta instância (migration 046) — se pieceColorOverrides tiver uma entrada
    // pra este piece.id, ela substitui só os papéis que tem, mantendo os demais herdados do
    // pai; o resultado (não o colorsByRole original) desce pra child_pieces mais abaixo, pra um
    // módulo aninhado ainda mais fundo com override PRÓPRIO continuar vencendo sobre este.
    const pieceOverride = pieceColorOverrides && pieceColorOverrides[piece.id];
    const effectiveColorsByRole = pieceOverride ? Object.assign({}, colorsByRole, pieceOverride) : colorsByRole;
    const color = effectiveColorsByRole && effectiveColorsByRole[piece.color_role_id];
    const roundedQty = Math.round(dims.quantity);
    const qty = Math.max(isNaN(roundedQty) ? 1 : roundedQty, 0);

    // Profundidade FIXA (module_fixed_depths, generaliza o antigo
    // drawer_type_depths) tem prioridade sobre locked_depth_presets (sistema
    // mais antigo, específico de gaveta/corrediça — não muda nada em
    // módulos que já usam module_fixed_depths).
    let resolvedDepthMm = dims.depth_mm;
    if (piece.fixed_depths && piece.fixed_depths.length > 0) {
      resolvedDepthMm = Pricing.pickDrawerDepth(piece.fixed_depths, dims.depth_mm);
    } else if (piece.locked_depth_presets && piece.locked_depth_presets.length > 0) {
      resolvedDepthMm = Pricing.pickNearestPreset(piece.locked_depth_presets, dims.depth_mm);
    }
    // Largura/altura TRAVADAS no módulo FILHO (migration 028) — mesma ideia
    // acima, generalizada: o módulo usado como peça só existe nesses valores.
    let resolvedWidthMm = dims.width_mm;
    if (piece.locked_width_presets && piece.locked_width_presets.length > 0) {
      resolvedWidthMm = Pricing.pickNearestPreset(piece.locked_width_presets, dims.width_mm);
    }
    let resolvedHeightMm = dims.height_mm;
    if (piece.locked_height_presets && piece.locked_height_presets.length > 0) {
      resolvedHeightMm = Pricing.pickNearestPreset(piece.locked_height_presets, dims.height_mm);
    }

    // LIMITE PRÓPRIO do módulo filho (sempre ativo, mesma trava de
    // Pricing.calculateModulePiece — ver comentário lá) — pedido do
    // usuário: "quando um modulo e inserido em outro, ele respeite os
    // limites de tamanho do modulo filho". Peça-folha nunca tem
    // own_*_min/max_mm setado (undefined), então isto não afeta ela.
    resolvedWidthMm = Pricing.clampToOwnRange(resolvedWidthMm, piece.own_width_min_mm, piece.own_width_max_mm);
    resolvedHeightMm = Pricing.clampToOwnRange(resolvedHeightMm, piece.own_height_min_mm, piece.own_height_max_mm);
    resolvedDepthMm = Pricing.clampToOwnRange(resolvedDepthMm, piece.own_depth_min_mm, piece.own_depth_max_mm);

    // TRAVA DE SEGURANÇA: uma peça (folha ou módulo aninhado) nunca pode
    // ficar maior que o espaço disponível no container que a recebe
    // (locked_*_presets pode arredondar pro valor mais PRÓXIMO, não
    // necessariamente o que CABE). Clampa sempre, nos 3 eixos — EXCETO pra
    // position_role='free' (ver client.js pro histórico completo).
    //
    // REVERTIDO (2026-07-07): tentei liberar isso só pra peça-folha (is_module)
    // — quebrou o desenho 3D em cascata, porque is_module não diz nada sobre
    // COMO a peça se posiciona.
    // CORRIGIDO (2026-07-09): condição certa é position_role==='free', que já
    // ignora vão-interno/empilhamento automático em placePieceInBox — só
    // faltava a MEDIDA também não ser clampada aqui.
    if (piece.position_role !== 'free') {
      resolvedWidthMm = Math.min(resolvedWidthMm, pieceContainerDims.W);
      resolvedHeightMm = Math.min(resolvedHeightMm, pieceContainerDims.H);
      resolvedDepthMm = Math.min(resolvedDepthMm, pieceContainerDims.D);
    }

    // Deslocamento é uma fórmula — avaliada contra o MESMO container que a
    // peça usa pras próprias dimensões, MAIS as próprias dimensões
    // RESOLVIDAS (já travadas/clampadas acima) desta peça, disponíveis em
    // minúsculo (w/h/d) — mesma convenção já usada em area_m2_formula/
    // edge_band_linear_m_formula (Pricing.calculatePiece). Isso permite
    // fórmulas como "D-d" (Posição Z), que encostam a peça na FRENTE do vão
    // (D = profundidade do container, d = profundidade da PRÓPRIA peça) —
    // funciona pra QUALQUER container, ao contrário de um valor fixo tipo
    // "20" (calibrado só pra um módulo pai específico).
    let childParts = null;
    if (piece.is_module && piece.child_pieces && piece.child_pieces.length) {
      const childContainerDims = { W: resolvedWidthMm, H: resolvedHeightMm, D: resolvedDepthMm };
      childParts = resolvePiecesForViewer(piece.child_pieces, childContainerDims, effectiveColorsByRole, shelfQuantities, dimOverrides, pieceColorOverrides);
    }

    // N/COUNT (pedido do usuário 2026-07-15, ESPELHA admin.js/client.js):
    // quando esta peça se repete (qty>1 — ex: várias prateleiras 'free' com
    // "cliente escolhe a quantidade"), o deslocamento agora é avaliado
    // DENTRO do loop, uma vez por cópia — cada cópia ganha N (seu número,
    // 1..qty) e COUNT (qty total) na fórmula, além de W/H/D/w/h/d de sempre.
    // Antes offset_x/y/z_mm era calculado uma vez só e repetido em toda
    // cópia — por isso N cópias de 'free' nasciam empilhadas na mesma
    // posição. Com qty=1 (caso mais comum), N=1/COUNT=1 sempre — fórmulas
    // antigas sem N/COUNT continuam se comportando exatamente como antes.
    for (let i = 0; i < qty; i++) {
      const offsetVars = {
        W: pieceContainerDims.W, H: pieceContainerDims.H, D: pieceContainerDims.D,
        w: resolvedWidthMm, h: resolvedHeightMm, d: resolvedDepthMm,
        N: i + 1, COUNT: qty
      };
      let offset_x_mm = 0, offset_y_mm = 0, offset_z_mm = 0;
      try { offset_x_mm = Pricing.evalFormula(piece.offset_x_formula, offsetVars); } catch (e) { /* ignora, usa 0 */ }
      try { offset_y_mm = Pricing.evalFormula(piece.offset_y_formula, offsetVars); } catch (e) { /* ignora, usa 0 */ }
      try { offset_z_mm = Pricing.evalFormula(piece.offset_z_formula, offsetVars); } catch (e) { /* ignora, usa 0 */ }
      parts.push({
        // Nome pra exibir no balão de duplo-clique (viewer3d.js/portal.js):
        // peça-folha usa a referência do catálogo (piece.reference,
        // espalhado via loadRecursivePiecesForModule); peça-módulo aninhada
        // usa o nome do módulo filho (module_name). Nunca inclui preço.
        // Campos que só a cópia do ERP carregava — vieram junto na unificação
        // (2026-08-15). São os que a FURAÇÃO e o custo por processo usam:
        // component_id acha a furação do componente, `fura` diz se a peça leva
        // furo, `veio` e lado_min/max valem pra chapa genérica (migration 090).
        // No portal eram simplesmente ausentes — inofensivo lá, indispensável
        // no ERP; juntar evita que a próxima coluna suma numa das pontas.
        component_id: piece.component_id || null,
        // PROGRAMA DE FURAÇÃO (migration 105) — precisa estar AQUI, no `part`,
        // e não só na `piece`: o drilling.js recebe o part, e é ele que
        // decide de onde vêm os furos (furosDaPeca). Carregar do banco e
        // esquecer de propagar aqui foi por que o módulo continuou "sem furo
        // gerado" mesmo com programa escolhido e 94 furos no catálogo — o
        // dado existia e morria nesta fronteira.
        drilling_pattern_id: piece.drilling_pattern_id || null,
        grain_dir: piece.grain_dir || null,
        piece_id: piece.id || null,
        origin: piece.origin || 'fabricacao',
        drill_shelf_support: !!piece.drill_shelf_support,
        veio: piece.veio || 'livre',
        fura: piece.fura !== false,
        lado_min_mm: piece.lado_min_mm || null,
        lado_max_mm: piece.lado_max_mm || null,
        reference: piece.reference || piece.module_name || null,
        position_role: piece.position_role,
        shape_type: piece.shape_type, // migration 062 — desenho 3D (caixa/cabide tubular oval)
        tilt_angle_deg: piece.tilt_angle_deg || 0, // migration 065 — inclinação (só 'shelf')
        rotation_y_deg: piece.rotation_y_deg || 0, // migration 067 — giro de canto (só 'free')
        // Recortes em L (migration 094) — entalhes do toe/gola na lateral,
        // ver viewer3d.js buildPanelGeometry. [] = peça inteira.
        recortes: piece.recortes || [],
        abre_recorte: !!piece.abre_recorte,
        width_mm: resolvedWidthMm,
        height_mm: resolvedHeightMm,
        depth_mm: resolvedDepthMm,
        color,
        offset_x_mm, offset_y_mm, offset_z_mm,
        hinge_side: piece.hinge_side,
        is_module: !!piece.is_module,
        opening_type: piece.opening_type,
        slides_per_unit: piece.slides_per_unit,
        positioning: piece.positioning,
        // Fita de borda (migration 088) — o 3D usa junto com positioning
        // pra decidir qual face leva fita e qual mostra o miolo da chapa
        // (js/viewer3d.js makeBoxMaterials). null = componente ainda na
        // fórmula antiga: desenha como sempre, material único.
        edge_banding: piece.edge_banding == null ? null : Number(piece.edge_banding),
        child_pieces: childParts
      });
    }
  });
  return parts;
}

async function fetchModuleFixedDepths(moduleId) {
  const { data, error } = await supabaseClient.from('module_fixed_depths').select('depth_mm').eq('module_id', moduleId);
  if (error) { console.error(error); return []; }
  return (data || []).map((r) => Number(r.depth_mm));
}

async function fetchModuleLockedDimensionPresets(moduleId) {
  const [moduleRes, presetsRes] = await Promise.all([
    supabaseClient.from('modules').select('name, width_locked, height_locked, depth_locked, is_decoration, width_min_mm, width_max_mm, height_min_mm, height_max_mm, depth_min_mm, depth_max_mm').eq('id', moduleId).single(),
    supabaseClient.from('module_dimension_presets').select('dimension, value_mm, label, sort_order').eq('module_id', moduleId).order('sort_order')
  ]);
  const mod = moduleRes.data || {};
  const byDim = { width: [], height: [], depth: [] };
  // Versão com rótulo (label do admin, ex: '55"', 'Queen') — usada pelo
  // dropdown de tamanho ao lado do opcional (ver renderOptionalComponents).
  const byDimLabeled = { width: [], height: [], depth: [] };
  (presetsRes.data || []).forEach((row) => {
    if (!byDim[row.dimension]) return;
    byDim[row.dimension].push(Number(row.value_mm));
    byDimLabeled[row.dimension].push({ value_mm: Number(row.value_mm), label: row.label || null });
  });
  return {
    // Nome do módulo — reaproveitado aqui (já busca a linha de `modules`)
    // pra dar nome à peça aninhada nos parts do 3D (ver
    // loadRecursivePiecesForModule abaixo e o duplo-clique em viewer3d.js).
    name: mod.name || null,
    is_decoration: !!mod.is_decoration,
    width: mod.width_locked ? byDim.width : [],
    height: mod.height_locked ? byDim.height : [],
    depth: mod.depth_locked ? byDim.depth : [],
    widthLabeled: mod.width_locked ? byDimLabeled.width : [],
    heightLabeled: mod.height_locked ? byDimLabeled.height : [],
    depthLabeled: mod.depth_locked ? byDimLabeled.depth : [],
    // Limite PRÓPRIO do módulo (sempre existe, migration original de
    // modules.width_min_mm/max_mm etc) — até agora só era buscado/respeitado
    // quando o admin ligava "cliente pode configurar as medidas desta peça"
    // (client_dimension_configurable, migration 036). Pedido do usuário:
    // "quando um modulo e inserido em outro, ele respeite os limites de
    // tamanho do modulo filho" — regra fundamental, sempre ativa, não
    // opt-in. Ver clamp em resolvePiecesForViewer/pricing.js.
    ownWidthMinMm: mod.width_min_mm,
    ownWidthMaxMm: mod.width_max_mm,
    ownHeightMinMm: mod.height_min_mm,
    ownHeightMaxMm: mod.height_max_mm,
    ownDepthMinMm: mod.depth_min_mm,
    ownDepthMaxMm: mod.depth_max_mm
  };
}

async function fetchModuleOwnHingeAndSlideModels(moduleId) {
  const [hingeRes, slideRes] = await Promise.all([
    supabaseClient.from('module_hinge_models').select('hinge_model_id, hinge_models(*)').eq('module_id', moduleId),
    supabaseClient.from('module_slide_models').select('slide_model_id, slide_models(*)').eq('module_id', moduleId)
  ]);
  const hinge = (hingeRes.data || []).map((r) => r.hinge_models).find((h) => h && h.active) || null;
  const slide = (slideRes.data || []).map((r) => r.slide_models).find((s) => s && s.active) || null;
  return { hinge, slide };
}

function collectUsedColorRoleIds(piecesList) {
  const ids = new Set();
  (piecesList || []).forEach((p) => {
    if (p.color_role_id) ids.add(p.color_role_id);
    if (p.is_module && p.child_pieces) {
      collectUsedColorRoleIds(p.child_pieces).forEach((id) => ids.add(id));
    }
  });
  return ids;
}
