// ==========================================================================
// AUDITOR DO PROJETO (2026-11-01, Matt: "tô pensando em criar um auditor,
// pra depois encontrar essas falhas e sugerir melhorias... peças muito
// pequenas ou grandes, módulos que não estão alinhados, prateleiras que
// podem empenar, gavetas sem espaço interno, toekicks duplos... pra produção
// sair mais redonda").
//
// Roda uma lista de CHECAGENS sobre projectSlots (e as peças resolvidas de
// cada slot) e abre um modal com os achados: nível (erro/aviso/dica), módulo,
// texto, botão Ver (seleciona o módulo) e Corrigir (quando a regra sabe
// corrigir sozinha). Cada checagem é uma função em AUDIT_CHECKS — pra criar
// uma nova, é só acrescentar ali: {id, run(ctx) → [achado]}.
//
// Achado: { id, nivel: 'erro'|'aviso'|'dica', slotId, titulo, detalhe,
//           fix?: () => void (já faz recalcular/redesenhar quem chama) }
//
// Botão: #po-proj-audit-btn (grupo HELP da barra). i18n local (tAud) nos 3
// idiomas, igual ao portal-33.
// ==========================================================================
(function () {
  const AUDIT_I18N = {
    pt: {
      btn: 'Auditor', btn_title: 'Auditor — procura erros de produção no projeto',
      title: 'Auditor do projeto', intro: 'Checagens de produção: peças fora de medida, interiores que colidem, módulos desalinhados. Clique em Ver pra ir ao módulo; Corrigir aplica a correção quando ela é automática.',
      empty: 'Nenhum problema encontrado. Projeto redondo!', run: 'Rodar de novo', fix_all: 'Corrigir todos os automáticos', ver: 'Ver', fix: 'Corrigir',
      n_erro: 'erros', n_aviso: 'avisos', n_dica: 'dicas', fixed: 'Corrigido.', no_slots: 'O projeto não tem módulos ainda.',
      erro: 'Erro', aviso: 'Aviso', dica: 'Dica', modulo: 'Módulo', parede: 'Parede', chao: 'Chão',
      // checagens
      c_stretcher_t: 'Travessa em pé com gaveta em cima', c_stretcher_d: 'A travessa da frente está em pé e o vão de cima tem gaveta: vai colidir. Deitar a travessa.',
      c_small_t: 'Peça muito pequena', c_small_d: '{{peca}} com {{w}} × {{h}}: menor que {{min}} — difícil de cortar e colar fita. Confira o vão.',
      c_big_t: 'Peça não cabe na chapa', c_big_d: '{{peca}} com {{w}} × {{h}} passa da chapa ({{sheet}}). Divida o módulo ou a peça.', c_big_ply_d: '{{peca}} em plywood com {{w}} × {{h}}: plywood vai até {{sheet}}. Acima de 2438 só EGGER — troque a cor ou reduza a medida.',
      c_shelf_t: 'Prateleira pode empenar', c_shelf_d: 'Prateleira de {{w}} de vão livre (acima de {{max}}). Adicione uma divisória vertical ou use prateleira fixa com travessa.',
      c_drawer_t: 'Frente de gaveta muito baixa', c_drawer_d: 'Frente de gaveta com {{h}} de altura (mínimo {{min}}). Junte gavetas ou troque por porta.',
      c_toe_t: 'Rodapé duplicado', c_toe_d: 'O módulo tem {{n}} peças de rodapé na mesma posição. Remova uma em Peças.',
      c_gap_t: 'Folga entre módulos', c_gap_d: 'Folga de {{gap}} até o módulo {{outro}}. Encostar ou preencher com painel.',
      c_overlap_t: 'Módulos sobrepostos', c_overlap_d: 'Invade o módulo {{outro}} em {{dx}}. Ajuste a posição ou a largura.',
      c_top_t: 'Topo desalinhado', c_top_d: 'Topo {{diff}} diferente do módulo {{outro}} ao lado. Iguale as alturas ou a elevação.',
      c_float_t: 'Módulo com rodapé flutuando', c_float_d: 'Está {{y}} acima do chão mas tem rodapé. Desça pro chão ou troque por módulo suspenso.',
      c_ceil_t: 'Passa do teto', c_ceil_d: 'O topo fica {{over}} acima da altura da parede ({{ceil}}). Abaixe ou reduza a altura.',
      c_wall_t: 'Fora da parede', c_wall_d: 'O módulo sai {{over}} além do fim da parede. Reduza a largura ou mova.',
      c_depth_t: 'Mais fundo que o vizinho', c_depth_d: 'Profundidade {{d}} contra {{od}} do módulo {{outro}} na mesma fileira. A bancada/porta não alinha.',
      c_drawerbox_t: 'Gaveta sem espaço interno', c_drawerbox_d: 'O caixote da gaveta ({{box}} de fundo) precisa de {{need}} e o módulo tem {{d}} de profundidade útil.',
      c_pieceov_t: 'Peças uma dentro da outra', c_pieceov_d: '{{a}} e {{b}} ocupam o mesmo espaço ({{dx}} × {{dy}} × {{dz}}). Na fábrica as duas não cabem: ajuste a medida ou a posição de uma delas.',
      c_pieceov2_t: 'Peça entrando em outro módulo', c_pieceov2_d: '{{a}} deste módulo entra em {{b}} do módulo {{outro}} ({{dx}} × {{dy}} × {{dz}}). Ajuste a posição, a medida ou a profundidade.',
      c_doorov_t: 'Portas sobrepostas', c_doorov_d: 'Duas portas ocupam o mesmo lugar ({{dx}} × {{dy}}): uma fica por cima da outra e não fecha. No Construtor, use uma porta de 2 folhas no vão inteiro, sem divisória no meio.',
      c_doorhinge_t: 'Duas portas na mesma divisória', c_doorhinge_d: 'A dobradiça de uma porta está na divisória onde a outra porta também apoia: a divisória não tem largura pras duas e a porta pega na vizinha. No Construtor, tire a divisória e use uma porta de 2 folhas (dobradiça nas laterais de fora).',
      c_floatpanel_t: 'Painel horizontal solto na parede', c_floatpanel_d: 'O painel {{nome}} está preso só na parede, sem módulo embaixo nem nas pontas. É muito difícil de fixar e pode dar problema na montagem: precisa de uma fixação reforçada (mão-francesa, suporte oculto etc.) definida pelo projetista. A fixação é responsabilidade do projetista; a fábrica não se responsabiliza.',
      c_tampdepth_t: 'Tamponamento fora da profundidade', c_tampdepth_d: 'O painel {{nome}} tem {{d}} de profundidade; a regra é a caixa ({{box}}) + 1" = {{ok}}. Diferença de {{diff}}.'
    },
    en: {
      btn: 'Auditor', btn_title: 'Auditor — finds production issues in the project',
      title: 'Project auditor', intro: 'Production checks: pieces out of size, colliding interiors, misaligned cabinets. Click View to go to the cabinet; Fix applies the correction when it is automatic.',
      empty: 'No issues found. Clean project!', run: 'Run again', fix_all: 'Fix all automatic ones', ver: 'View', fix: 'Fix',
      n_erro: 'errors', n_aviso: 'warnings', n_dica: 'tips', fixed: 'Fixed.', no_slots: 'The project has no cabinets yet.',
      erro: 'Error', aviso: 'Warning', dica: 'Tip', modulo: 'Cabinet', parede: 'Wall', chao: 'Floor',
      c_stretcher_t: 'Upright rail with drawer on top', c_stretcher_d: 'The front rail is upright and the top opening has a drawer: they collide. Lay the rail flat.',
      c_small_t: 'Piece too small', c_small_d: '{{peca}} at {{w}} × {{h}}: under {{min}} — hard to cut and band. Check the opening.',
      c_big_t: 'Piece does not fit the sheet', c_big_d: '{{peca}} at {{w}} × {{h}} exceeds the sheet ({{sheet}}). Split the cabinet or the piece.', c_big_ply_d: '{{peca}} in plywood at {{w}} × {{h}}: plywood goes up to {{sheet}}. Above 2438 only EGGER — change the color or reduce the size.',
      c_shelf_t: 'Shelf may sag', c_shelf_d: 'Shelf with {{w}} free span (over {{max}}). Add a vertical divider or use a fixed shelf with a rail.',
      c_drawer_t: 'Drawer front too short', c_drawer_d: 'Drawer front {{h}} tall (minimum {{min}}). Merge drawers or switch to a door.',
      c_toe_t: 'Duplicate toe kick', c_toe_d: 'The cabinet has {{n}} toe-kick pieces in the same position. Remove one under Pieces.',
      c_gap_t: 'Gap between cabinets', c_gap_d: '{{gap}} gap to cabinet {{outro}}. Close it or fill with a panel.',
      c_overlap_t: 'Overlapping cabinets', c_overlap_d: 'Overlaps cabinet {{outro}} by {{dx}}. Adjust position or width.',
      c_top_t: 'Tops misaligned', c_top_d: 'Top {{diff}} off from cabinet {{outro}} next to it. Match heights or elevation.',
      c_float_t: 'Toe-kick cabinet floating', c_float_d: 'It is {{y}} above the floor but has a toe kick. Lower it or use a wall-hung cabinet.',
      c_ceil_t: 'Above the ceiling', c_ceil_d: 'The top is {{over}} above the wall height ({{ceil}}). Lower it or reduce the height.',
      c_wall_t: 'Past the wall', c_wall_d: 'The cabinet runs {{over}} past the end of the wall. Reduce width or move it.',
      c_depth_t: 'Deeper than neighbor', c_depth_d: 'Depth {{d}} vs {{od}} on cabinet {{outro}} in the same run. Countertop/doors won\'t line up.',
      c_drawerbox_t: 'Drawer without inner room', c_drawerbox_d: 'The drawer box ({{box}} deep) needs {{need}} and the cabinet has {{d}} usable depth.',
      c_pieceov_t: 'Parts inside each other', c_pieceov_d: '{{a}} and {{b}} take the same space ({{dx}} × {{dy}} × {{dz}}). Both won\'t fit in production: adjust the size or position of one of them.',
      c_pieceov2_t: 'Part going into another cabinet', c_pieceov2_d: '{{a}} of this cabinet runs into {{b}} of cabinet {{outro}} ({{dx}} × {{dy}} × {{dz}}). Adjust position, size or depth.',
      c_doorov_t: 'Overlapping doors', c_doorov_d: 'Two doors take the same spot ({{dx}} × {{dy}}): one sits over the other and won\'t close. In the Builder, use one 2-leaf door over the whole opening, with no divider in the middle.',
      c_doorhinge_t: 'Two doors on the same divider', c_doorhinge_d: 'One door hinges on the divider where the other door also rests: the divider is not wide enough for both and the doors hit each other. In the Builder, remove the divider and use one 2-leaf door (hinges on the outer sides).',
      c_floatpanel_t: 'Horizontal panel loose on the wall', c_floatpanel_d: 'Panel {{nome}} hangs only on the wall, with no cabinet below or at its ends. It is very hard to fix and may cause installation problems: it needs reinforced support (bracket, hidden support, etc.) defined by the designer. Fixing it is the designer\'s responsibility; the factory is not liable.',
      c_tampdepth_t: 'End panel at the wrong depth', c_tampdepth_d: 'Panel {{nome}} is {{d}} deep; the rule is the box ({{box}}) + 1" = {{ok}}. Off by {{diff}}.'
    },
    es: {
      btn: 'Auditor', btn_title: 'Auditor — busca errores de producción en el proyecto',
      title: 'Auditor del proyecto', intro: 'Chequeos de producción: piezas fuera de medida, interiores que chocan, módulos desalineados. Pulsa Ver para ir al módulo; Corregir aplica la corrección cuando es automática.',
      empty: 'No se encontraron problemas. ¡Proyecto redondo!', run: 'Correr de nuevo', fix_all: 'Corregir todos los automáticos', ver: 'Ver', fix: 'Corregir',
      n_erro: 'errores', n_aviso: 'avisos', n_dica: 'consejos', fixed: 'Corregido.', no_slots: 'El proyecto aún no tiene módulos.',
      erro: 'Error', aviso: 'Aviso', dica: 'Consejo', modulo: 'Módulo', parede: 'Pared', chao: 'Piso',
      c_stretcher_t: 'Travesaño de pie con cajón arriba', c_stretcher_d: 'El travesaño frontal está de pie y el vano superior tiene cajón: chocan. Acostar el travesaño.',
      c_small_t: 'Pieza muy pequeña', c_small_d: '{{peca}} con {{w}} × {{h}}: menor que {{min}} — difícil de cortar y pegar canto. Revisa el vano.',
      c_big_t: 'La pieza no cabe en el tablero', c_big_d: '{{peca}} con {{w}} × {{h}} supera el tablero ({{sheet}}). Divide el módulo o la pieza.', c_big_ply_d: '{{peca}} en plywood con {{w}} × {{h}}: el plywood llega hasta {{sheet}}. Arriba de 2438 solo EGGER — cambia el color o reduce la medida.',
      c_shelf_t: 'El estante puede pandearse', c_shelf_d: 'Estante con {{w}} de luz libre (más de {{max}}). Agrega una división vertical o usa estante fijo con travesaño.',
      c_drawer_t: 'Frente de cajón muy bajo', c_drawer_d: 'Frente de cajón de {{h}} de alto (mínimo {{min}}). Une cajones o cambia por puerta.',
      c_toe_t: 'Zócalo duplicado', c_toe_d: 'El módulo tiene {{n}} piezas de zócalo en la misma posición. Quita una en Piezas.',
      c_gap_t: 'Holgura entre módulos', c_gap_d: 'Holgura de {{gap}} hasta el módulo {{outro}}. Juntar o rellenar con panel.',
      c_overlap_t: 'Módulos superpuestos', c_overlap_d: 'Invade el módulo {{outro}} en {{dx}}. Ajusta la posición o el ancho.',
      c_top_t: 'Tope desalineado', c_top_d: 'Tope {{diff}} distinto del módulo {{outro}} al lado. Iguala alturas o elevación.',
      c_float_t: 'Módulo con zócalo flotando', c_float_d: 'Está {{y}} sobre el piso pero tiene zócalo. Bájalo o usa módulo suspendido.',
      c_ceil_t: 'Pasa el techo', c_ceil_d: 'El tope queda {{over}} por encima de la altura de la pared ({{ceil}}). Bájalo o reduce el alto.',
      c_wall_t: 'Fuera de la pared', c_wall_d: 'El módulo sale {{over}} más allá del fin de la pared. Reduce el ancho o muévelo.',
      c_depth_t: 'Más profundo que el vecino', c_depth_d: 'Profundidad {{d}} contra {{od}} del módulo {{outro}} en la misma fila. La encimera/puerta no alinea.',
      c_drawerbox_t: 'Cajón sin espacio interno', c_drawerbox_d: 'El cajón ({{box}} de fondo) necesita {{need}} y el módulo tiene {{d}} de profundidad útil.',
      c_pieceov_t: 'Piezas una dentro de otra', c_pieceov_d: '{{a}} y {{b}} ocupan el mismo espacio ({{dx}} × {{dy}} × {{dz}}). En fábrica no caben las dos: ajusta la medida o la posición de una de ellas.',
      c_pieceov2_t: 'Pieza entrando en otro módulo', c_pieceov2_d: '{{a}} de este módulo entra en {{b}} del módulo {{outro}} ({{dx}} × {{dy}} × {{dz}}). Ajusta la posición, la medida o la profundidad.',
      c_doorov_t: 'Puertas superpuestas', c_doorov_d: 'Dos puertas ocupan el mismo lugar ({{dx}} × {{dy}}): una queda sobre la otra y no cierra. En el Constructor, usa una puerta de 2 hojas en todo el hueco, sin división en el medio.',
      c_doorhinge_t: 'Dos puertas en la misma división', c_doorhinge_d: 'La bisagra de una puerta está en la división donde también apoya la otra puerta: la división no tiene ancho para las dos y las puertas chocan. En el Constructor, quita la división y usa una puerta de 2 hojas (bisagras en los laterales de afuera).',
      c_floatpanel_t: 'Panel horizontal suelto en la pared', c_floatpanel_d: 'El panel {{nome}} está fijado solo a la pared, sin módulo debajo ni en las puntas. Es muy difícil de fijar y puede dar problemas en el armado: necesita una fijación reforzada (ménsula, soporte oculto, etc.) definida por el proyectista. La fijación es responsabilidad del proyectista; la fábrica no se responsabiliza.',
      c_tampdepth_t: 'Tamponamiento fuera de profundidad', c_tampdepth_d: 'El panel {{nome}} tiene {{d}} de profundidad; la regla es la caja ({{box}}) + 1" = {{ok}}. Diferencia de {{diff}}.'
    }
  };
  const lang = () => ((typeof I18n !== 'undefined' && I18n.getLanguage) ? I18n.getLanguage() : 'pt');
  const tAud = (k, vars) => {
    const d = AUDIT_I18N[lang()] || AUDIT_I18N.pt;
    let s = d[k] != null ? d[k] : (AUDIT_I18N.pt[k] != null ? AUDIT_I18N.pt[k] : k);
    Object.keys(vars || {}).forEach((v) => { s = s.split('{{' + v + '}}').join(String(vars[v])); });
    return s;
  };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const unit = () => ((document.getElementById('po-unit-select') || {}).value || 'mm');
  const fmt = (mm) => (typeof formatDimension === 'function') ? formatDimension(Math.round(Number(mm) || 0), unit()) : (Math.round(mm) + ' mm');

  // ---- limites (mm) — ajuste aqui quando a fábrica mudar a regra ----
  const LIM = {
    PECA_MIN_MM: 50,           // menor lado de uma peça de chapa
    // chapa por material (01/11, Matt): EGGER 2750 × 1830 (padrão do ERP);
    // plywood 1220 × 2440, mas peça de plywood nunca passa de 2438 = 96" (02/11)
    CHAPA_W_MM: 1830, CHAPA_L_MM: 2750,
    PLY_W_MM: 1220, PLY_L_MM: 2438,
    PRATELEIRA_VAO_MAX_MM: 900, // prateleira 18 mm sem apoio no meio
    GAVETA_FRENTE_MIN_MM: 100,
    FOLGA_AVISO_MM: 30,         // folga entre vizinhos que vale avisar
    TOPO_DIFF_MAX_MM: 25,       // topos "quase" iguais
    FLUTUA_MAX_MM: 150,
    TAMP_EXTRA_MM: 25,          // tamponamento = caixa + 1" (portal-23 usa 25)
    TAMP_TOL_MM: 3,
    DOOR_EDGE_MM: 40,           // borda de porta "na mesma divisória"
    INTERF_MM: 1.5              // peça entrando em outra: penetração mínima nos 3 eixos
  };

  // ---- contexto por slot: peças resolvidas (w/h/d reais) ----
  function slotResolved(slot) {
    const eff = (typeof projectSlotEffectivePieces === 'function') ? projectSlotEffectivePieces(slot) : (slot.pieces || []);
    return resolvePiecesForViewer(eff, { W: Number(slot.width_mm), H: Number(slot.height_mm), D: Number(slot.depth_mm) },
      slot.colorsByRole || {}, slot.shelfQuantities || {}, slot.dimOverrides || {}, slot.pieceColorOverrides || {});
  }
  // Caixas reais das peças de chapa (mesma conta da furação/3D: Drilling
  // buildBoxes + boxesAninhadas). Referencial do módulo, mm, canto mínimo.
  function slotBoxes(slot) {
    try {
      const I = (typeof Drilling !== 'undefined' && Drilling._internals) || null;
      if (!I || !I.buildBoxes) return [];
      const parts = slotResolved(slot);
      const W = Number(slot.width_mm), H = Number(slot.height_mm), D = Number(slot.depth_mm);
      return I.buildBoxes(parts, W, H, D).boxes.concat(I.boxesAninhadas ? I.boxesAninhadas(parts, W, H, D) : [])
        .filter((b) => b && b.part && ehChapa(b.part) && b.sx > 0 && b.sy > 0 && b.sz > 0);
    } catch (e) { return []; }
  }
  function slotParts(slot) {
    try {
      const parts = slotResolved(slot);
      const flat = [];
      (function walk(list, dx, dy, dz) {
        (list || []).forEach((p) => {
          const x = dx + Number(p.offset_x_mm || 0), y = dy + Number(p.offset_y_mm || 0), z = dz + Number(p.offset_z_mm || 0);
          if (p.child_pieces && p.child_pieces.length) { walk(p.child_pieces, x, y, z); return; }
          flat.push(Object.assign({}, p, { _x: x, _y: y, _z: z }));
        });
      })(parts, 0, 0, 0);
      return flat;
    } catch (e) { return []; }
  }
  const nomePeca = (p) => p.reference || p.component_reference || p.name || '?';
  const ehChapa = (p) => (p.shape_type || 'caixa') === 'caixa' && !/tubular|cabide|rod|puxador|handle|dobradi|corredi|slide|hinge|led|perfil/i.test(nomePeca(p));
  // Lados "de chapa": as duas maiores medidas; a menor é a espessura.
  const lados = (p) => {
    const a = [Number(p.width_mm) || 0, Number(p.height_mm) || 0, Number(p.depth_mm) || 0].sort((x, y) => y - x);
    return { L: a[0], C: a[1], E: a[2] };
  };
  const slotNome = (slot) => {
    const n = (typeof projectSlots !== 'undefined') ? projectSlots.indexOf(slot) + 1 : 0;
    const nome = (slot.module && slot.module.name) || slot.reference || '';
    return (n ? '#' + n + ' ' : '') + nome;
  };
  const temRodape = (parts) => parts.some((p) => /rodap|toe/i.test(nomePeca(p)) || p.position_role === 'toe_kick');
  const alcance = (slot) => {
    const x0 = Number(slot.x_mm) || 0, y0 = Number(slot.floor_height_mm) || 0;
    return { x0, x1: x0 + (Number(slot.width_mm) || 0), y0, y1: y0 + (Number(slot.height_mm) || 0) };
  };
  const vizinhosParede = (slot, slots) => slots.filter((o) => o !== slot && !isFloorSlot(o) && !isFloorSlot(slot)
    && Number(o.wall_index || 0) === Number(slot.wall_index || 0));

  // ---- checagens ----
  const AUDIT_CHECKS = [
    { id: 'stretcher', run(ctx) {
      const out = [];
      ctx.slots.forEach((slot) => {
        if (typeof projectFrontStretcherPiece !== 'function' || typeof projectSlotTopLeafIsDrawer !== 'function') return;
        const p = projectFrontStretcherPiece(slot);
        if (!p) return;
        const emPe = !!(((slot.pieceAdjustments || {})[p.id] || {}).em_pe);
        if (emPe && projectSlotTopLeafIsDrawer(slot)) {
          out.push({ id: 'stretcher', nivel: 'erro', slotId: slot.id, titulo: tAud('c_stretcher_t'), detalhe: tAud('c_stretcher_d'),
            fix: () => { setSlotFrontStretcherEmPe(slot, false); recomputeProjectSlotPricing(slot); } });
        }
      });
      return out;
    } },
    { id: 'pecas', run(ctx) {
      const out = [];
      ctx.slots.forEach((slot) => {
        const parts = ctx.parts(slot);
        parts.forEach((p) => {
          if (!ehChapa(p)) return;
          const { L, C } = lados(p);
          if (C > 0 && C < LIM.PECA_MIN_MM) {
            out.push({ id: 'small', nivel: 'aviso', slotId: slot.id, titulo: tAud('c_small_t'), detalhe: tAud('c_small_d', { peca: nomePeca(p), w: fmt(L), h: fmt(C), min: fmt(LIM.PECA_MIN_MM) }) });
          }
          const ply = !!p.color && (/plywood/i.test(String(p.color.name || '')) || Number(p.color.thickness_mm) === 18);
          const chL = ply ? LIM.PLY_L_MM : LIM.CHAPA_L_MM, chW = ply ? LIM.PLY_W_MM : LIM.CHAPA_W_MM;
          if (L > chL + 0.5 || C > chW + 0.5) {
            out.push({ id: 'big', nivel: 'erro', slotId: slot.id, titulo: tAud('c_big_t'), detalhe: tAud(ply ? 'c_big_ply_d' : 'c_big_d', { peca: nomePeca(p), w: fmt(L), h: fmt(C), sheet: fmt(chW) + ' × ' + fmt(chL) }) });
          }
          // prateleira: deitada (altura = espessura) e larga
          const ehPrat = p.position_role === 'shelf' || p.prateleira_regulavel || /pratel|shelf/i.test(nomePeca(p));
          if (ehPrat && Number(p.width_mm) > LIM.PRATELEIRA_VAO_MAX_MM) {
            out.push({ id: 'shelf', nivel: 'aviso', slotId: slot.id, titulo: tAud('c_shelf_t'), detalhe: tAud('c_shelf_d', { w: fmt(p.width_mm), max: fmt(LIM.PRATELEIRA_VAO_MAX_MM) }) });
          }
          // frente de gaveta baixa
          if (/frente.*gaveta|drawer.*front|front.*drawer/i.test(nomePeca(p)) && Number(p.height_mm) > 0 && Number(p.height_mm) < LIM.GAVETA_FRENTE_MIN_MM - 0.5) {
            out.push({ id: 'drawer', nivel: 'erro', slotId: slot.id, titulo: tAud('c_drawer_t'), detalhe: tAud('c_drawer_d', { h: fmt(p.height_mm), min: fmt(LIM.GAVETA_FRENTE_MIN_MM) }) });
          }
        });
        // rodapé duplicado: 2+ peças de rodapé na mesma altura/posição
        const toes = parts.filter((p) => /rodap|toe/i.test(nomePeca(p)) || p.position_role === 'toe_kick');
        const grupos = {};
        toes.forEach((p) => { const k = Math.round(p._y / 5) + '|' + Math.round(p._z / 5) + '|' + Math.round(p._x / 5); (grupos[k] = grupos[k] || []).push(p); });
        Object.keys(grupos).forEach((k) => {
          if (grupos[k].length > 1) out.push({ id: 'toe', nivel: 'erro', slotId: slot.id, titulo: tAud('c_toe_t'), detalhe: tAud('c_toe_d', { n: grupos[k].length }) });
        });
        // gaveta sem espaço: caixote mais fundo que a profundidade útil
        const caixotes = parts.filter((p) => p.is_module && /gaveta|drawer/i.test(nomePeca(p)) || (/caixote|drawer box/i.test(nomePeca(p))));
        caixotes.forEach((p) => {
          const util = Number(slot.depth_mm) - 25;   // fundo + folga de corrediça
          const need = Number(p.depth_mm) + 20;
          if (Number(p.depth_mm) > 0 && need > util + 0.5) {
            out.push({ id: 'drawerbox', nivel: 'erro', slotId: slot.id, titulo: tAud('c_drawerbox_t'), detalhe: tAud('c_drawerbox_d', { box: fmt(p.depth_mm), need: fmt(need), d: fmt(util) }) });
          }
        });
      });
      return out;
    } },
    { id: 'posicao', run(ctx) {
      const out = [];
      const feitos = new Set();
      ctx.slots.forEach((slot) => {
        if (isFloorSlot(slot)) return;
        const a = alcance(slot);
        // teto da parede
        const teto = (typeof projectSlotCeilingMm === 'function') ? projectSlotCeilingMm(slot) : (roomSettings.ceiling_mm || 2600);
        if (a.y1 > teto + 0.5) out.push({ id: 'ceil', nivel: 'erro', slotId: slot.id, titulo: tAud('c_ceil_t'), detalhe: tAud('c_ceil_d', { over: fmt(a.y1 - teto), ceil: fmt(teto) }) });
        // fora da parede
        try {
          const b = projectWallSlotXBoundsMm(slot);
          if (a.x0 > b.max + 0.5) out.push({ id: 'wall', nivel: 'aviso', slotId: slot.id, titulo: tAud('c_wall_t'), detalhe: tAud('c_wall_d', { over: fmt(a.x0 - b.max) }) });
        } catch (e) { /* sem parede */ }
        // rodapé flutuando
        const parts = ctx.parts(slot);
        if (a.y0 > 0.5 && a.y0 < LIM.FLUTUA_MAX_MM && temRodape(parts)) {
          out.push({ id: 'float', nivel: 'aviso', slotId: slot.id, titulo: tAud('c_float_t'), detalhe: tAud('c_float_d', { y: fmt(a.y0) }),
            fix: () => { slot.floor_height_mm = 0; if (typeof clampProjectSlotPosition === 'function') clampProjectSlotPosition(slot); } });
        }
        // vizinhos na mesma parede
        vizinhosParede(slot, ctx.slots).forEach((o) => {
          const k = [slot.id, o.id].sort().join('|');
          if (feitos.has(k)) return;
          const b = alcance(o);
          const overlapY = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
          const overlapX = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
          if (overlapY <= 2) return;   // um em cima do outro: não é vizinho lateral
          feitos.add(k);
          if (overlapX > 2) {
            out.push({ id: 'overlap', nivel: 'erro', slotId: slot.id, titulo: tAud('c_overlap_t'), detalhe: tAud('c_overlap_d', { outro: slotNome(o), dx: fmt(overlapX) }) });
            return;
          }
          const gap = -overlapX;
          const esq = a.x0 <= b.x0 ? slot : o, dir = esq === slot ? o : slot;
          if (gap > 0.5 && gap <= LIM.FOLGA_AVISO_MM) {
            out.push({ id: 'gap', nivel: 'aviso', slotId: slot.id, titulo: tAud('c_gap_t'), detalhe: tAud('c_gap_d', { gap: fmt(gap), outro: slotNome(o) }),
              fix: () => { dir.x_mm = Number(esq.x_mm) + Number(esq.width_mm); } });
          }
          if (gap <= LIM.FOLGA_AVISO_MM) {
            const diff = Math.abs(a.y1 - b.y1);
            if (diff > 0.5 && diff <= LIM.TOPO_DIFF_MAX_MM && Math.abs(a.y0 - b.y0) < 0.5) {
              out.push({ id: 'top', nivel: 'dica', slotId: slot.id, titulo: tAud('c_top_t'), detalhe: tAud('c_top_d', { outro: slotNome(o), diff: fmt(diff) }) });
            }
            const dd = Math.abs(Number(slot.depth_mm) - Number(o.depth_mm));
            if (dd > 0.5 && dd <= 60 && Math.abs(a.y0 - b.y0) < 0.5 && Math.abs(Number(slot.fineOffsetZMm || 0) - Number(o.fineOffsetZMm || 0)) < 0.5) {
              out.push({ id: 'depth', nivel: 'dica', slotId: slot.id, titulo: tAud('c_depth_t'), detalhe: tAud('c_depth_d', { d: fmt(slot.depth_mm), od: fmt(o.depth_mm), outro: slotNome(o) }) });
            }
          }
        });
      });
      return out;
    } },
    // PEÇA EM CIMA DA OUTRA (01/11, Matt, print de painel atravessando o
    // fundo de uma caixa: "uma peça em cima da outra deve mostrar no
    // auditor"). Caixas reais das peças (as mesmas da furação). Dentro do
    // módulo e entre módulos da mesma parede (referencial: x ao longo da
    // parede, y do chão, z da parede pra frente). Encostar (0 mm) não conta.
    { id: 'interferencia', run(ctx) {
      const out = [];
      const M = LIM.INTERF_MM;
      const ov = (a0, as, b0, bs) => Math.min(a0 + as, b0 + bs) - Math.max(a0, b0);
      const cruza = (a, b) => {
        const dx = ov(a.x0, a.sx, b.x0, b.sx), dy = ov(a.y0, a.sy, b.y0, b.sy), dz = ov(a.z0, a.sz, b.z0, b.sz);
        return (dx > M && dy > M && dz > M) ? { dx, dy, dz } : null;
      };
      const nomeB = (b) => nomePeca(b.part);
      // ---- dentro do módulo ----
      ctx.slots.forEach((slot) => {
        const bx = ctx.boxes(slot);
        for (let i = 0; i < bx.length; i++) {
          let achou = false;
          for (let j = i + 1; j < bx.length && !achou; j++) {
            if (bx[i].part === bx[j].part) continue;
            const c = cruza(bx[i], bx[j]);
            if (!c) continue;
            achou = true;
            out.push({ id: 'pieceov', nivel: 'erro', slotId: slot.id, titulo: tAud('c_pieceov_t'),
              detalhe: tAud('c_pieceov_d', { a: nomeB(bx[i]), b: nomeB(bx[j]), dx: fmt(c.dx), dy: fmt(c.dy), dz: fmt(c.dz) }) });
          }
          if (achou) break; // 1 achado por módulo basta
        }
      });
      // ---- entre módulos da mesma parede ----
      const semGiro = (s) => !(Number(s.fineRotXDeg) || Number(s.fineRotYDeg) || Number(s.fineRotZDeg));
      const paredeY = (s) => (typeof projectWallSlotYMm === 'function') ? projectWallSlotYMm(s) : (Number(s.floor_height_mm) || 0);
      const mundo = (s) => {
        const ox = Number(s.x_mm) || 0, oy = paredeY(s), oz = Number(s.fineOffsetZMm) || 0;
        return ctx.boxes(s).map((b) => Object.assign({}, b, { x0: b.x0 + ox, y0: b.y0 + oy, z0: b.z0 + oz }));
      };
      const naParede = ctx.slots.filter((s) => !isFloorSlot(s) && semGiro(s));
      const feitos = new Set();
      naParede.forEach((a) => {
        naParede.forEach((b) => {
          if (a === b || Number(a.wall_index || 0) !== Number(b.wall_index || 0)) return;
          const k = [a.id, b.id].sort().join('|');
          if (feitos.has(k)) return;
          feitos.add(k);
          const ra = alcance(a), rb = alcance(b);
          if (Math.min(ra.x1, rb.x1) - Math.max(ra.x0, rb.x0) <= M || Math.min(ra.y1, rb.y1) - Math.max(ra.y0, rb.y0) <= M) return;
          const ba = mundo(a), bb = mundo(b);
          for (let i = 0; i < ba.length; i++) {
            for (let j = 0; j < bb.length; j++) {
              const c = cruza(ba[i], bb[j]);
              if (!c) continue;
              out.push({ id: 'pieceov2', nivel: 'erro', slotId: a.id, titulo: tAud('c_pieceov2_t'),
                detalhe: tAud('c_pieceov2_d', { a: nomeB(ba[i]), b: nomeB(bb[j]), outro: slotNome(b), dx: fmt(c.dx), dy: fmt(c.dy), dz: fmt(c.dz) }) });
              return; // 1 achado por par de módulos
            }
          }
        });
      });
      return out;
    } },
    // PORTAS (01/11, Matt: "quando uma porta fica por cima da outra ou usa
    // uma lateral divisória como base de dobradiça, vai dar problema").
    // Portas = peças de giro (hinge_side left/right) finas; coordenadas no
    // referencial do módulo (_x/_y/_z = canto mínimo, peças 'free' do Construtor).
    { id: 'portas', run(ctx) {
      const out = [];
      ctx.slots.forEach((slot) => {
        const W = Number(slot.width_mm) || 0;
        const portas = ctx.parts(slot).filter((p) => (p.hinge_side === 'left' || p.hinge_side === 'right')
          && Math.min(Number(p.width_mm) || 0, Number(p.height_mm) || 0, Number(p.depth_mm) || 0) <= 30)
          .map((p) => {
            const L = { x0: p._x, x1: p._x + (Number(p.width_mm) || 0), y0: p._y, y1: p._y + (Number(p.height_mm) || 0), z0: p._z, z1: p._z + (Number(p.depth_mm) || 0), lado: p.hinge_side };
            // se a menor medida não é a profundidade, não é porta de frente
            return (Number(p.depth_mm) || 0) <= 30 ? L : null;
          }).filter(Boolean);
        let sobre = false, divis = false;
        for (let i = 0; i < portas.length; i++) {
          for (let j = i + 1; j < portas.length; j++) {
            const a = portas[i], b = portas[j];
            const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
            const oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
            const oz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
            if (!sobre && ox > 1 && oy > 1 && oz > -1) {
              sobre = true;
              out.push({ id: 'doorov', nivel: 'erro', slotId: slot.id, titulo: tAud('c_doorov_t'), detalhe: tAud('c_doorov_d', { dx: fmt(ox), dy: fmt(oy) }) });
            }
            if (divis || oy <= 1) continue;
            // dobradiça de uma na borda de DENTRO do módulo, e a outra porta
            // encostando nessa mesma borda (mesma divisória)
            const conflito = (h, o) => {
              const xh = h.lado === 'left' ? h.x0 : h.x1;
              if (xh < LIM.DOOR_EDGE_MM || xh > W - LIM.DOOR_EDGE_MM) return false; // dobradiça na lateral de fora
              const borda = h.lado === 'left' ? o.x1 : o.x0;
              return Math.abs(borda - xh) <= LIM.DOOR_EDGE_MM;
            };
            if (conflito(a, b) || conflito(b, a)) {
              divis = true;
              out.push({ id: 'doorhinge', nivel: 'erro', slotId: slot.id, titulo: tAud('c_doorhinge_t'), detalhe: tAud('c_doorhinge_d') });
            }
          }
        }
      });
      return out;
    } },
    // PAINÉIS (01/11): horizontal solto na parede (responsabilidade do
    // projetista) e tamponamento fora de caixa + 1".
    { id: 'paineis', run(ctx) {
      const out = [];
      const ehPainel = (s) => /painel|panel/i.test(String((s.module && s.module.name) || '')) && !/slat|ripad/i.test(String((s.module && s.module.name) || ''));
      const horiz = (s) => ehPainel(s) && (Number(s.height_mm) || 0) <= 40;
      const vert = (s) => ehPainel(s) && (Number(s.width_mm) || 0) <= 40;
      const naParede = ctx.slots.filter((s) => !isFloorSlot(s));
      const mesmaParede = (a, b) => Number(a.wall_index || 0) === Number(b.wall_index || 0);
      const cruzaX = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 10;
      const cruzaY = (a, b) => Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 10;
      const T = LIM.TAMP_TOL_MM;
      naParede.forEach((p) => {
        if (!horiz(p) && !vert(p)) return;
        const a = alcance(p);
        const outros = naParede.filter((o) => o !== p && mesmaParede(o, p));
        // ---- painel horizontal solto ----
        if (horiz(p) && a.y0 > 0.5) {
          const embaixo = outros.some((o) => { const b = alcance(o); return Math.abs(b.y1 - a.y0) <= T && cruzaX(a, b); });
          const ponta = (ladoEsq) => outros.some((o) => {
            const b = alcance(o);
            const encosta = ladoEsq ? Math.abs(b.x1 - a.x0) <= T : Math.abs(b.x0 - a.x1) <= T;
            return encosta && b.y0 <= a.y0 + T && b.y1 >= a.y1 - T;
          });
          if (!embaixo && !(ponta(true) && ponta(false))) {
            out.push({ id: 'floatpanel', nivel: 'aviso', slotId: p.id, titulo: tAud('c_floatpanel_t'), detalhe: tAud('c_floatpanel_d', { nome: slotNome(p) }) });
          }
        }
        // ---- tamponamento: profundidade = caixa + 1" ----
        const corpos = outros.filter((o) => !ehPainel(o)).filter((o) => {
          const b = alcance(o);
          if (horiz(p)) return (Math.abs(b.y1 - a.y0) <= T || Math.abs(b.y0 - a.y1) <= T) && cruzaX(a, b);
          return (Math.abs(b.x1 - a.x0) <= T || Math.abs(b.x0 - a.x1) <= T) && cruzaY(a, b);
        });
        if (!corpos.length) return;
        const box = Math.max(...corpos.map((o) => Number(o.depth_mm) || 0));
        const ok = box + LIM.TAMP_EXTRA_MM;
        const d = Number(p.depth_mm) || 0;
        if (Math.abs(d - ok) > T) {
          out.push({ id: 'tampdepth', nivel: 'aviso', slotId: p.id, titulo: tAud('c_tampdepth_t'),
            detalhe: tAud('c_tampdepth_d', { nome: slotNome(p), d: fmt(d), box: fmt(box), ok: fmt(ok), diff: fmt(Math.abs(d - ok)) }),
            fix: () => {
              p.depth_mm = (typeof projectSlotClampedDimensionMm === 'function') ? projectSlotClampedDimensionMm(p, 'depth', ok) : ok;
              recomputeProjectSlotPricing(p);
            } });
        }
      });
      return out;
    } }
  ];

  function runProjectAudit() {
    const slots = (typeof projectSlots !== 'undefined' && projectSlots) ? projectSlots.filter((s) => s && s.module) : [];
    const cache = new Map();
    const cacheB = new Map();
    const ctx = { slots, parts: (s) => { if (!cache.has(s)) cache.set(s, slotParts(s)); return cache.get(s); },
      boxes: (s) => { if (!cacheB.has(s)) cacheB.set(s, slotBoxes(s)); return cacheB.get(s); } };
    let achados = [];
    AUDIT_CHECKS.forEach((c) => { try { achados = achados.concat(c.run(ctx) || []); } catch (e) { console.error('[auditor]', c.id, e); } });
    const ordem = { erro: 0, aviso: 1, dica: 2 };
    achados.sort((a, b) => (ordem[a.nivel] - ordem[b.nivel]) || String(a.slotId).localeCompare(String(b.slotId)));
    return achados;
  }

  let auditAchados = [];
  function ensureAuditModal() {
    if (document.getElementById('po-audit-modal')) return;
    const el = document.createElement('div');
    el.id = 'po-audit-modal';
    el.innerHTML = `
    <div class="po-proj-ai-modal-card po-audit-card">
      <button type="button" class="po-auth-modal-close" id="po-audit-close" aria-label="Fechar">&times;</button>
      <h3>${esc(tAud('title'))}</h3>
      <p class="hint">${esc(tAud('intro'))}</p>
      <div class="po-audit-summary" id="po-audit-summary"></div>
      <div class="po-audit-list" id="po-audit-list"></div>
      <div class="po-audit-actions">
        <button type="button" class="secondary" id="po-audit-run">${esc(tAud('run'))}</button>
        <button type="button" id="po-audit-fix-all">${esc(tAud('fix_all'))}</button>
      </div>
    </div>`;
    document.body.appendChild(el);
    el.addEventListener('click', (ev) => { if (ev.target === el) closeAuditModal(); });
    document.getElementById('po-audit-close').addEventListener('click', closeAuditModal);
    document.getElementById('po-audit-run').addEventListener('click', auditRefresh);
    document.getElementById('po-audit-fix-all').addEventListener('click', () => {
      const comFix = auditAchados.filter((a) => a.fix);
      if (!comFix.length) return;
      if (typeof pushProjectUndoState === 'function') pushProjectUndoState();
      comFix.forEach((a) => { try { a.fix(); } catch (e) { console.error('[auditor fix]', e); } });
      auditAfterFix();
    });
    document.getElementById('po-audit-list').addEventListener('click', (ev) => {
      const btn = ev.target.closest('button[data-act]');
      if (!btn) return;
      const a = auditAchados[Number(btn.dataset.idx)];
      if (!a) return;
      if (btn.dataset.act === 'ver') {
        closeAuditModal();
        if (typeof selectProjectSlot === 'function') selectProjectSlot(a.slotId);
      } else if (btn.dataset.act === 'fix' && a.fix) {
        if (typeof pushProjectUndoState === 'function') pushProjectUndoState();
        try { a.fix(); } catch (e) { console.error('[auditor fix]', e); }
        auditAfterFix();
      }
    });
  }
  function auditAfterFix() {
    try { if (typeof renderProjectCanvas === 'function') renderProjectCanvas(); } catch (e) { /* */ }
    try { if (typeof renderProjectConfigPanel === 'function') renderProjectConfigPanel(); } catch (e) { /* */ }
    try { if (typeof markProjectDirty === 'function') markProjectDirty(); } catch (e) { /* */ }
    auditRefresh();
  }
  function auditRefresh() {
    auditAchados = runProjectAudit();
    const list = document.getElementById('po-audit-list');
    const sum = document.getElementById('po-audit-summary');
    const n = { erro: 0, aviso: 0, dica: 0 };
    auditAchados.forEach((a) => { n[a.nivel] = (n[a.nivel] || 0) + 1; });
    const slots = (typeof projectSlots !== 'undefined' && projectSlots) ? projectSlots : [];
    if (!slots.length) { sum.innerHTML = ''; list.innerHTML = `<p class="hint">${esc(tAud('no_slots'))}</p>`; return; }
    sum.innerHTML = `<span class="po-audit-pill erro">${n.erro} ${esc(tAud('n_erro'))}</span><span class="po-audit-pill aviso">${n.aviso} ${esc(tAud('n_aviso'))}</span><span class="po-audit-pill dica">${n.dica} ${esc(tAud('n_dica'))}</span>`;
    if (!auditAchados.length) { list.innerHTML = `<p class="po-audit-ok">✓ ${esc(tAud('empty'))}</p>`; return; }
    list.innerHTML = auditAchados.map((a, i) => {
      const slot = slots.find((s) => s.id === a.slotId);
      const onde = slot ? (isFloorSlot(slot) ? tAud('chao') : tAud('parede') + ' ' + (Number(slot.wall_index || 0) + 1)) : '';
      return `<div class="po-audit-item ${a.nivel}">
        <span class="po-audit-badge">${esc(tAud(a.nivel))}</span>
        <div class="po-audit-txt"><strong>${esc(a.titulo)}</strong><span>${esc(slot ? slotNome(slot) : '')}${onde ? ' · ' + esc(onde) : ''}</span><em>${esc(a.detalhe)}</em></div>
        <div class="po-audit-btns"><button type="button" class="secondary" data-act="ver" data-idx="${i}">${esc(tAud('ver'))}</button>${a.fix ? `<button type="button" data-act="fix" data-idx="${i}">${esc(tAud('fix'))}</button>` : ''}</div>
      </div>`;
    }).join('');
    document.getElementById('po-audit-fix-all').style.display = auditAchados.some((a) => a.fix) ? '' : 'none';
  }
  function openAuditModal() {
    ensureAuditModal();
    // textos no idioma atual (modal pode ter sido criado em outro)
    const card = document.querySelector('#po-audit-modal h3'); if (card) card.textContent = tAud('title');
    document.getElementById('po-audit-modal').classList.add('open');
    auditRefresh();
  }
  function closeAuditModal() { const el = document.getElementById('po-audit-modal'); if (el) el.classList.remove('open'); }

  function auditBindButton() {
    const btn = document.getElementById('po-proj-audit-btn');
    if (!btn || btn._auditBound) return;
    btn._auditBound = true;
    btn.addEventListener('click', openAuditModal);
    const aplicaTexto = () => {
      btn.title = tAud('btn_title'); btn.setAttribute('aria-label', tAud('btn'));
      const sp = btn.querySelector('span'); if (sp) sp.textContent = tAud('btn');
    };
    aplicaTexto();
    document.addEventListener('po:lang-changed', aplicaTexto);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auditBindButton); else auditBindButton();

  window.runProjectAudit = runProjectAudit;
  window.openAuditModal = openAuditModal;
  window.AUDIT_CHECKS = AUDIT_CHECKS;
  window.AUDIT_LIMITS = LIM;
})();
