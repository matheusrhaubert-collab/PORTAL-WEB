/* Legno ERP — furação (.ban) de um LOTE inteiro.
 *
 * POR QUE POR LOTE E NÃO POR PEDIDO
 * A fábrica não fura por pedido, fura por lote — é o lote que vai pra
 * máquina, do mesmo jeito que já é o lote que vai pro nesting. Gerar por
 * pedido obrigava a baixar três ZIPs e juntar na mão pra produzir um lote de
 * três pedidos, com risco de esquecer um.
 *
 * De onde sai a furação: da CONFIGURAÇÃO gravada em cada order_item
 * (module_id + medidas + prateleiras + overrides + opcionais) resolvida
 * contra o cadastro ATUAL de módulos e furação. É de propósito que não se usa
 * o snapshot do pedido: furação é conhecimento de produção e pode ser
 * corrigida depois do pedido fechado. Preço congela; furação não.
 * (Mesma decisão do exportador por pedido, que continua existindo.)
 *
 * Isto só é possível porque o painel admin agora roda na mesma página do
 * ERP: Drilling, loadRecursivePiecesForModule e resolvePiecesForViewer são
 * globais aqui. Antes viviam noutro documento.
 */

const FURACAO_LOTE = {};

/* Catálogo de agregados do construtor de vãos (migration 085) — carregado
 * UMA vez pro LOTE inteiro (ver coletar), não por pedido/peça, igual ao mapa
 * de cores. Existe pra dar furação real à peça montada pelo cliente no
 * construtor (migration 121, order_items.layout): a geometria vem congelada
 * no pedido, mas QUEM ela é (componente, programa de furação, corrediça) sai
 * de LayoutEngine.toPieceRows contra o catálogo ATUAL — a mesma regra de
 * sempre ("furação é conhecimento de produção, não congela").
 *
 * Reaproveita CONSTR.catalogoDoBanco/carregarExtrasDeModuloFilho
 * (erp/js/data-construtor.js), que já é exatamente isto — a mesma função que
 * monta o catálogo da tela #/construtor. Tolerante: sem migration 085 (ou
 * sem CONSTR/LayoutEngine carregados por algum motivo) devolve null, e
 * _itensDoPedido segue sem peça de construtor nenhuma — comportamento de
 * antes desta migration.
 */
FURACAO_LOTE._catalogoDeAgregados = async function () {
  try {
    if (typeof CONSTR === 'undefined' || typeof LayoutEngine === 'undefined') return null;
    const { data, error } = await supabaseClient.from('accessory_types')
      .select('*, components(*, labor_types(*), component_types(*))');
    if (error || !data) return null;
    await CONSTR.carregarExtrasDeModuloFilho(data);
    return CONSTR.catalogoDoBanco(data);
  } catch (e) {
    console.error('[furacao-lote] não consegui carregar o catálogo do construtor de vãos; ' +
      'peça montada pelo cliente no construtor fica sem furação neste lote:', e);
    return null;
  }
};

/* Peças de um pedido, já resolvidas no formato que o Drilling espera.
 * catAgregados vem de FURACAO_LOTE._catalogoDeAgregados, carregado uma vez
 * pro lote inteiro — ver ali o porquê. */
/* MODO "LOTE JÁ CORTADO" (2026-09-24, lote LT-26-0014 — Matt: "nesse lote não
   posso mudar o tamanho das bases, só acertar as furações"). Migration 160
   pôs a espessura na cor (plywood 18) e trocou 19.5/39 por E/2*E nas
   fórmulas — daí pra frente base em plywood sai W-36 e a furação acompanha.
   Mas um lote cortado ANTES tem base de W-39 (19.5) em chapa de 18: se o
   .ban usar as fórmulas novas, o furo de borda cai no lugar de uma peça 3mm
   maior do que a que existe. Este modo resolve a peça com E=19.5 (medida
   como cortada) e depois troca SÓ o eixo da espessura pela espessura real
   da cor: Thickness=18, furo de borda em Z=-9, contra-furo da lateral na
   altura da base de 18 — e o comprimento fica o que foi cortado.

   Walk recursivo (child_pieces). Só mexe em peça-folha cuja cor tem
   _thickness_real_mm (marcada em _itensDoPedido) e cujo eixo da espessura
   está em 19.5 (o padrão); qualquer outro valor (38 dobrado, peça comprada)
   fica como está. O eixo vem de Drilling.splitThicknessAxes (positioning,
   senão o menor dos três) — a mesma regra que o .ban usa pra achar E. */
FURACAO_LOTE._aplicarEspessuraSoNoEixo = function (parts, cont) {
  const eixoDaEspessura = function (p) {
    const w = Number(p.width_mm) || 0, h = Number(p.height_mm) || 0, d = Number(p.depth_mm) || 0;
    if (p.positioning === 'horizontal') return 'height_mm';
    if (p.positioning === 'vertical') return 'width_mm';
    if (p.positioning === 'vertical_no_plano' || p.positioning === 'horizontal_no_plano') return 'depth_mm';
    const arr = [w, h, d];
    return ['width_mm', 'height_mm', 'depth_mm'][arr.indexOf(Math.min(w, h, d))];
  };
  const OFFSET = { width_mm: 'offset_x_mm', height_mm: 'offset_y_mm', depth_mm: 'offset_z_mm' };
  const CONT = { width_mm: 'W', height_mm: 'H', depth_mm: 'D' };
  const PADRAO = (typeof Pricing !== 'undefined' && Pricing.DEFAULT_THICKNESS_MM) || 19.5;
  const walk = function (lista, c) {
    (lista || []).forEach(function (p) {
      if (p.is_module) {
        walk(p.child_pieces, { W: Number(p.width_mm) || 0, H: Number(p.height_mm) || 0, D: Number(p.depth_mm) || 0 });
        return;
      }
      const real = p.color && Number(p.color._thickness_real_mm);
      if (!(real > 0)) return;
      const eixo = eixoDaEspessura(p);
      if (Math.abs(Number(p[eixo]) - PADRAO) > 0.01) return;
      p[eixo] = real;
      p._espessura_ajustada = true;
      /* PEÇA ENCOSTADA NA PONTA OPOSTA acompanha (Matt, 24/09, lateral
         PC-002297: fileira da base em x=9, a do topo em 472.1 = 482.6−10.5
         em vez de 473.6). O deslocamento 'H−E' / 'W−E' foi avaliado com
         E=19.5 (de propósito, pra manter a medida cortada), mas a peça
         física de 18 fica ENCOSTADA na ponta — o furo de face na lateral
         tem que sair no centro dela lá. Regra: se offset + 19.5 bate no
         tamanho do vão nesse eixo (±0.6), a peça estava encostada; move
         pra ficar encostada com a espessura real. Peça no 0 (base) e peça
         no meio (prateleira) não mudam. */
      const off = OFFSET[eixo], tam = c && Number(c[CONT[eixo]]);
      if (tam > 0 && Math.abs((Number(p[off]) || 0) + PADRAO - tam) <= 0.6) {
        p[off] = (Number(p[off]) || 0) + (PADRAO - real);
        p._offset_ajustado = true;
      }
    });
  };
  walk(parts, cont);
  return parts;
};

/* DIAGNÓSTICO DE PRATELEIRA (2026-09-24, Matt: "rodei migration, atualizei e
   refiz o ban, mesmo assim não puxou a furação da marcação das prateleiras
   na lateral, módulo número 47"). Sem ver o banco daqui, o jeito é o
   próprio gerador contar o que viu: pra cada peça que PARECE prateleira
   (papel 'shelf', ou nome com shelf/pratel), diz se tem drill_shelf_support,
   qual o papel/eixo da espessura, e se a ponta dela encosta (tolerância) na
   face de alguma lateral — que são exatamente as 3 condições de
   Drilling.collectShelfSupportHoles. Sai no console (F12) como tabela e o
   resumo entra no aviso do botão. Zero efeito no .ban. Peça de módulo
   aninhado entra no frame do pai (Drilling.boxesAninhadas), igual ao que
   a furação faz desde 24/09. */
FURACAO_LOTE._diagnosticoPrateleiras = function (itens, settings) {
  const tol = (settings && Number(settings.touch_tolerance_mm)) || 5;
  const linhas = [];
  const pareceShelf = function (p) {
    return p.position_role === 'shelf' || /shelf|pratel/i.test(String(p.reference || ''));
  };
  itens.forEach(function (it) {
    let built = null, boxes = [];
    try {
      built = Drilling._internals.buildBoxes(it.parts, it.W, it.H, it.D);
      boxes = built.boxes.concat(Drilling._internals.boxesAninhadas(it.parts, it.W, it.H, it.D));
    } catch (e) { built = null; boxes = []; }
    const boxDe = function (p) { return boxes.find(function (b) { return b.part === p; }) || null; };
    const laterais = boxes.filter(function (b) { return b.tAxis === 'x'; });
    const walk = function (parts, nivel) {
      (parts || []).forEach(function (p) {
        if (p.is_module) { walk(p.child_pieces, nivel + 1); return; }
        if (!pareceShelf(p)) return;
        const sb = boxDe(p);
        let encosta = null, eixo = null;
        if (sb) {
          eixo = sb.tAxis;
          encosta = laterais.some(function (lb) {
            if (lb === sb || (sb._owner && sb._owner === lb._owner)) return false;
            const dL = Math.abs(sb.x0 - (lb.x0 + lb.sx)), dR = Math.abs((sb.x0 + sb.sx) - lb.x0);
            return Math.min(dL, dR) <= tol;
          });
        }
        const motivo = !p.drill_shelf_support ? 'SEM drill_shelf_support (marcar no vínculo/agregado, migration 162)'
          : (!sb ? 'papel "' + (p.position_role || '?') + '" não tem caixa 3D na furação (drawer/handle/front/other)'
          : (eixo !== 'y' ? 'espessura não está no eixo Y (eixo=' + eixo + ', positioning=' + (p.positioning || 'nulo') + ') — não é "chapa deitada"'
          : (!laterais.length ? 'módulo sem lateral (peça com espessura no X)'
          : (!encosta ? 'ponta não encosta em lateral (folga > ' + tol + 'mm): x ' + Math.round(sb.x0) + '..' + Math.round(sb.x0 + sb.sx) + ' vs laterais ' + laterais.map(function (l) { return Math.round(l.x0) + '..' + Math.round(l.x0 + l.sx); }).join(' | ')
          : 'OK — deve ter suporte'))));
        linhas.push({
          modulo: it.moduleName, aninhado: nivel, peca: p.reference, papel: p.position_role,
          suporte: !!p.drill_shelf_support, medidas: Math.round(p.width_mm) + '×' + Math.round(p.height_mm) + '×' + Math.round(p.depth_mm),
          motivo: motivo
        });
      });
    };
    walk(it.parts, 0);
  });
  if (linhas.length) {
    console.warn('[furacao-lote] diagnóstico de prateleiras (suporte na lateral):');
    console.table(linhas);
  } else {
    console.warn('[furacao-lote] diagnóstico: nenhuma peça parece prateleira (papel shelf ou nome shelf/pratel) neste lote.');
  }
  if (settings && settings.shelf_enabled === false) {
    console.warn('[furacao-lote] drilling_settings.shelf_enabled = false — suporte de prateleira DESLIGADO nos Ajustes de furação!');
  }
  return linhas;
};

FURACAO_LOTE._itensDoPedido = async function (orderId, coresPorId, catAgregados, medidasComoCortadas) {
  const { data, error } = await supabaseClient.from('order_items')
    /* selected_colors entrou em 2026-08-16: o visualizador de furação pinta a
       chapa com a cor escolhida (bem clara) pra mostrar o SENTIDO DO VEIO. O
       .ban não usa cor nenhuma — é peso zero pra ele e o dado já está aqui.
       layout entrou em 2026-08-18 (migration 121): geometria congelada das
       peças que o cliente montou no construtor de vãos dentro deste item —
       ver o comentário grande no topo do arquivo e em
       FURACAO_LOTE._catalogoDeAgregados. */
    .select('id, module_id, module_name, quantity, width_mm, height_mm, depth_mm, ' +
            'shelf_quantities, dim_overrides, selected_optional_component_ids, removed_piece_ids, sort_order, ' +
            'selected_colors, layout, modules(is_decoration)')
    .eq('order_id', orderId)
    .order('sort_order');
  if (error) throw error;

  const itens = [];
  let semCadastro = 0;

  for (const item of (data || [])) {
    /* Módulo decorativo (migration 039) não vai pra produção — nem furação. */
    if (item.modules && item.modules.is_decoration) continue;

    const pieces = await loadRecursivePiecesForModule(item.module_id);
    if (!pieces || pieces.length === 0) { semCadastro += 1; continue; }

    /* PEÇAS DO CONSTRUTOR DE VÃOS (migration 121). item.layout é a geometria
       congelada no checkout (LayoutEngine.build(...).pieces, já recortada
       contra o casco) — NÃO é furação nem preço. toPieceRows aqui devolve
       linha no MESMO formato de module_components (component_id,
       drilling_pattern_id, offset_*_formula literal), resolvida contra o
       catálogo ATUAL, exatamente como o portal faz ao vivo em
       projectLayoutRowsForSlot. Sem catAgregados (migration 085 não rodou,
       ou o lote não tem nenhum pedido com construtor) fica lista vazia — o
       módulo segue furando normal, só sem a peça extra. */
    let pecasDoConstrutor = [];
    if (Array.isArray(item.layout) && item.layout.length && catAgregados) {
      try {
        pecasDoConstrutor = LayoutEngine.toPieceRows(item.layout, catAgregados) || [];
      } catch (e) {
        console.error('[furacao-lote] geometria do construtor deste item não resolveu:', e);
      }
    }
    const todasPecas = pecasDoConstrutor.length ? pieces.concat(pecasDoConstrutor) : pieces;

    const escolhidos = item.selected_optional_component_ids || [];
    /* removed_piece_ids (migration 134): peça removida manualmente pelo
       cliente no modal "Peças do móvel" não pode ser cortada/furada aqui. */
    const removidos = item.removed_piece_ids || [];
    const efetivas = todasPecas.filter(function (p) {
      return (!p.client_optional || escolhidos.includes(p.id)) && !removidos.includes(p.id);
    });

    /* colorsByRole a partir do que o cliente escolheu no pedido.
       ATENÇÃO AO FORMATO (errei isto na 1ª versão, 2026-08-16): o
       selected_colors do order_item guarda só
           { role_id, role_name, color_id, color_name }
       — NÃO traz o registro da cor. O `swatch_hex`, que é o que pinta a
       chapa, só existe na tabela `colors`. Passar o selected_colors direto
       como se fosse a cor dá um objeto sem swatch_hex e a peça sai bege,
       sem erro nenhum no console. Por isso o mapa `coresPorId` vem pronto
       de FURACAO_LOTE.coletar, carregado UMA vez pro lote inteiro em vez de
       uma consulta por item. */
    const colorsByRole = {};
    (item.selected_colors || []).forEach(function (sc) {
      if (!sc || !sc.role_id) return;
      let cor = (coresPorId && coresPorId[sc.color_id])
        || (sc.color_name ? { name: sc.color_name } : null);
      /* MODO "LOTE JÁ CORTADO" (ver FURACAO_LOTE.gerar): a cor entra SEM a
         espessura própria, pra E=19.5 nas fórmulas e a peça sair com a
         MEDIDA que já foi cortada; a espessura real volta depois, só no
         eixo da espessura (FURACAO_LOTE._aplicarEspessuraSoNoEixo). */
      if (cor && medidasComoCortadas && cor.thickness_mm != null) {
        cor = Object.assign({}, cor, { thickness_mm: null, _thickness_real_mm: cor.thickness_mm });
      }
      if (cor) colorsByRole[sc.role_id] = cor;
    });

    let parts = resolvePiecesForViewer(
      efetivas,
      { W: item.width_mm, H: item.height_mm, D: item.depth_mm },
      colorsByRole,
      item.shelf_quantities || {},
      item.dim_overrides || {}
    );
    if (medidasComoCortadas) {
      // vão de referência dos offsets = corpo (H já sem o pé), igual a
      // resolvePiecesForViewer (Pricing.resolveBodyDims)
      let corpo = { W: item.width_mm, H: item.height_mm, D: item.depth_mm };
      try { corpo = Pricing.resolveBodyDims(efetivas, corpo).bodyDims || corpo; } catch (e) { /* sem pé */ }
      parts = FURACAO_LOTE._aplicarEspessuraSoNoEixo(parts, corpo);
    }

    itens.push({
      moduleName: item.module_name,
      /* order_item de origem — é o que liga a peça furada à peça do plano
         de corte (cut_plan_pieces.order_item_ids, migration 158) pra o .ban
         sair com o MESMO código da etiqueta. Ver FURACAO_LOTE._arquivosPorPeca. */
      orderItemId: item.id,
      parts: parts,
      W: item.width_mm, H: item.height_mm, D: item.depth_mm,
      quantity: item.quantity || 1
    });
  }

  return { itens: itens, semCadastro: semCadastro };
};

/* COLETA — tudo que o Drilling precisa pra um lote, sem gerar arquivo nenhum.
 *
 * Existe separado porque agora são DOIS consumidores do mesmo dado: o ZIP de
 * .ban (gerar) e o visualizador de furação da tela (#/lotes/:id/furacao). Se
 * cada um montasse a própria consulta, um dia um deles esqueceria o mapa de
 * programas ou os ajustes e a tela mostraria uma furação que o arquivo não
 * tem — exatamente o modo de falha que o `holesByPattern` já causou uma vez.
 *
 * Devolve { lote, itens, config, semCadastro }; quem chama decide se pede
 * Drilling.generateOrderFiles (arquivo) ou Drilling.collectOrderPieces
 * (desenho). As duas saídas vêm do mesmo collectOrderPieces lá dentro.
 */
FURACAO_LOTE.coletar = async function (batchId, avisar, opts) {
  const dizer = avisar || function () {};
  const medidasComoCortadas = !!(opts && opts.medidasComoCortadas);
  const erp = LOTES.erp();

  const [loteRes, vinculoRes, furosRes, patternHolesRes, ajustesRes, coresRes] = await Promise.all([
    erp.from('batches').select('code, name').eq('id', batchId).maybeSingle(),
    erp.from('batch_orders').select('order_id').eq('batch_id', batchId),
    supabaseClient.from('component_drillings').select('*').order('sort_order'),
    // Furos dos PROGRAMAS (migration 105). Consulta separada e tolerante:
    // quem ainda não rodou a migration recebe erro aqui e segue só com a
    // furação do componente, em vez de a tela inteira morrer.
    supabaseClient.from('drilling_pattern_holes').select('*').order('sort_order'),
    supabaseClient.from('drilling_settings').select('*').eq('id', true).single(),
    /* Cores só pro DESENHO (a chapa pintada no visualizador). Tolerante de
       propósito: falhar aqui não pode derrubar a geração do .ban, que não usa
       cor nenhuma. */
    /* select('*') de propósito: a lista de colunas era um ponto de falha
       silencioso — nome errado em UMA delas faz o PostgREST rejeitar a
       consulta inteira, o catch abaixo engolia, o mapa saía vazio e a peça
       aparecia com o NOME da cor (que vem do order_item) e sem cor nenhuma.
       São poucas dezenas de linhas; trazer tudo custa nada e não tem como
       quebrar por causa de coluna. */
    supabaseClient.from('colors').select('*')
  ]);
  if (loteRes.error) throw loteRes.error;
  if (vinculoRes.error) throw vinculoRes.error;
  if (furosRes.error) throw furosRes.error;
  if (ajustesRes.error) throw ajustesRes.error;

  const coresPorId = {};
  if (coresRes && coresRes.error) {
    /* NÃO É MAIS SILENCIOSO. A cor é só desenho — não pode derrubar o .ban —
       mas falhar calado fez eu perseguir o bug errado duas vezes. */
    console.error('[furacao] não consegui ler as cores; a chapa vai sair sem cor:', coresRes.error);
  } else if (coresRes) {
    (coresRes.data || []).forEach(function (c) { coresPorId[c.id] = c; });
  }

  const orderIds = (vinculoRes.data || []).map(function (r) { return r.order_id; });
  if (!orderIds.length) return { lote: loteRes.data || {}, itens: [], config: null, semCadastro: 0, vazio: 'sem-pedido' };

  const holesByPattern = Drilling.groupPatternHoles(
    (patternHolesRes && !patternHolesRes.error && patternHolesRes.data) || []);

  const furosPorComponente = {};
  (furosRes.data || []).forEach(function (row) {
    if (!furosPorComponente[row.component_id]) furosPorComponente[row.component_id] = [];
    furosPorComponente[row.component_id].push(row);
  });

  /* Catálogo do construtor de vãos (migration 121) — UMA vez pro lote
     inteiro, igual ao mapa de cores acima. Ver FURACAO_LOTE._catalogoDeAgregados. */
  const catAgregados = await FURACAO_LOTE._catalogoDeAgregados();

  /* Um pedido de cada vez, e não Promise.all: cada um dispara uma consulta
     por módulo dentro de loadRecursivePiecesForModule. Em paralelo isso vira
     uma rajada capaz de estourar o limite de conexões. */
  let itens = [];
  let semCadastro = 0;
  for (let i = 0; i < orderIds.length; i++) {
    dizer('resolvendo peças — pedido ' + (i + 1) + ' de ' + orderIds.length + '…');
    const r = await FURACAO_LOTE._itensDoPedido(orderIds[i], coresPorId, catAgregados, medidasComoCortadas);
    itens = itens.concat(r.itens);
    semCadastro += r.semCadastro;
  }

  return {
    lote: loteRes.data || {},
    itens: itens,
    config: {
      drillingsByComponent: furosPorComponente,
      holesByPattern: holesByPattern,
      settings: ajustesRes.data || {}
    },
    semCadastro: semCadastro,
    pedidos: orderIds.length,
    vazio: itens.length ? null : 'sem-peca'
  };
};

/* ============================================================
   UM .ban POR PEÇA FÍSICA, com o código da etiqueta (pedido do Matt, 23/09)
   ============================================================
   "quero um programa por peça, independente se for igual. deixa duplicado
   e com mesmo código da peça pra furadeira localizar pelo código de barras."

   O nome do arquivo passa a ser o piece_code do plano de corte salvo
   (PC-000930.ban) — o mesmo texto do Code 39 da etiqueta. Bipou, a
   furadeira acha o programa. Peças idênticas viram arquivos idênticos com
   nomes diferentes, de propósito.

   Casamento peça furada → peça do plano, dentro do MESMO order_item:
     1º referência igual + medidas iguais (±1 mm, ordenadas)
     2º só medidas iguais (referência renomeada no cadastro)
   A medida do plano vem do snapshot do pedido (breakdown) e a da furação
   do cadastro ATUAL; se o cadastro mudou a medida depois, não casa — e a
   peça sai com o nome antigo (agrupado) e AVISO, em vez de ganhar o código
   de outra peça. Peça pareada (Ripa 2×, migration 145) cai aqui também:
   no plano ela é a chapa larga de 76, na furação é a metade.
*/
FURACAO_LOTE._pecasDoPlano = async function (batchId) {
  const erp = LOTES.erp();
  const { data: planos, error: ep } = await erp.from('cut_plans')
    .select('id, version, code').eq('batch_id', batchId)
    .order('version', { ascending: false }).limit(1);
  if (ep) throw ep;
  const plano = planos && planos[0];
  if (!plano) return null;

  // paginado: o PostgREST corta em 1000 linhas por consulta
  let pecas = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await erp.from('cut_plan_pieces')
      .select('id, piece_code, reference, w_mm, h_mm, espessura_mm, order_item_ids, module_name')
      .eq('plan_id', plano.id).order('piece_code').range(de, de + 999);
    if (error) throw error;
    pecas = pecas.concat(data || []);
    if (!data || data.length < 1000) break;
  }
  return { plano: plano, pecas: pecas };
};

/* MODO "LOTE JÁ CORTADO" — a peça assume a MEDIDA QUE FOI CORTADA (2026-09-24).
 *
 * Matt, PC-002247 (Fundo do módulo 6): o lote foi cortado com o fundo de
 * 762 (cadastro antigo, fundo no chão do corpo); depois a migration 171
 * subiu o fundo pra cima da base e ele passou a 742,5. Gerando o .ban do
 * lote já cortado, a furação calculava 743 × 723, não achava a peça no
 * plano (762 × 723) e saía SEM-CODIGO. Ele quer furar a peça como está
 * (762) e cortar os 19,5 depois — "consegue manter a medida antiga só pra
 * esse lote".
 *
 * Regra, só neste modo: peça que NÃO casa com nenhuma peça do plano pelas
 * medidas, mas tem no plano uma peça do MESMO item e MESMO nome que difere
 * em UM eixo só (até 30 mm), assume a medida do plano nesse eixo. Se cresce,
 * cresce PRA TRÁS (o offset recua na mesma conta, sem ficar negativo) — é
 * exatamente desfazer o "subiu E e encolheu E" da 171: o fundo volta a
 * y=0 com 762, e os furos de borda/tambor saem onde as laterais e a base
 * (já furadas com a geometria antiga) esperam. Peça que já casa, ou que
 * difere em 2 eixos, não é tocada. Sem plano, nada muda. */
FURACAO_LOTE._assumirMedidaCortada = function (itens, pecasPlano) {
  const ord = function (a, b, c) { return [Number(a) || 0, Number(b) || 0, Number(c) || 0].sort(function (x, y) { return y - x; }); };
  const igual = function (d1, d2) { return Math.abs(d1[0] - d2[0]) <= 1 && Math.abs(d1[1] - d2[1]) <= 1 && Math.abs(d1[2] - d2[2]) <= 2; };
  const norm = function (t) { return String(t || '').trim().toLowerCase(); };
  const EIXOS = [['width_mm', 'offset_x_mm'], ['height_mm', 'offset_y_mm'], ['depth_mm', 'offset_z_mm']];
  let ajustadas = 0;
  (itens || []).forEach(function (item) {
    const doItem = (pecasPlano || []).filter(function (pc) { return (pc.order_item_ids || []).indexOf(item.orderItemId) >= 0; });
    if (!doItem.length) return;
    const anda = function (parts) {
      (parts || []).forEach(function (part) {
        if (part.is_module) { anda(part.child_pieces); return; }
        if (part.origin === 'comprado') return;
        const d = ord(part.width_mm, part.height_mm, part.depth_mm);
        if (doItem.some(function (pc) { return igual(ord(pc.w_mm, pc.h_mm, pc.espessura_mm), d); })) return; // já casa
        const cand = doItem.filter(function (pc) { return norm(pc.reference) === norm(part.reference); });
        // candidata: difere em UM eixo só (até 30 mm), os outros dois batem
        let alvo = null;
        for (let i = 0; i < cand.length && !alvo; i++) {
          const pd = ord(cand[i].w_mm, cand[i].h_mm, cand[i].espessura_mm);
          // casa as 3 medidas por proximidade: tenta cada eixo da peça como o "diferente"
          EIXOS.forEach(function (e) {
            if (alvo) return;
            const val = Number(part[e[0]]) || 0;
            const outras = EIXOS.filter(function (x) { return x !== e; }).map(function (x) { return Number(part[x[0]]) || 0; }).sort(function (a, b) { return b - a; });
            // as duas medidas restantes da peça precisam existir nas 3 do plano; sobra a nova medida do eixo
            const restoPlano = pd.slice();
            let ok = true;
            outras.forEach(function (o) {
              const k = restoPlano.findIndex(function (v) { return Math.abs(v - o) <= 2; });
              if (k < 0) ok = false; else restoPlano.splice(k, 1);
            });
            if (!ok || restoPlano.length !== 1) return;
            const novo = restoPlano[0];
            if (Math.abs(novo - val) < 0.5 || Math.abs(novo - val) > 30) return;
            alvo = { eixo: e, de: val, para: novo };
          });
        }
        if (!alvo) return;
        const dif = alvo.para - alvo.de;
        part[alvo.eixo[0]] = alvo.para;
        if (dif > 0) part[alvo.eixo[1]] = Math.max(0, (Number(part[alvo.eixo[1]]) || 0) - dif);
        part._medida_como_cortada = alvo;
        ajustadas += 1;
        console.info('[furacao-lote] lote já cortado: "' + (part.reference || '?') + '" ' + alvo.eixo[0] + ' ' +
          alvo.de + ' -> ' + alvo.para + ' (medida do plano; offset recuado ' + (dif > 0 ? dif : 0) + ')');
      });
    };
    anda(item.parts);
  });
  return ajustadas;
};

FURACAO_LOTE._arquivosPorPeca = function (itens, config, pecasPlano) {
  const dims = function (a, b, c) {
    return [Number(a) || 0, Number(b) || 0, Number(c) || 0].sort(function (x, y) { return y - x; });
  };
  // Comprimento e largura ±1mm; a ESPESSURA (menor das três) ±2mm, porque o
  // plano de um lote cortado antes da migration 160 guarda 19.5 pra uma peça
  // que a furação agora resolve como 18 (plywood) — é a mesma peça física.
  // 2mm não confunde 19.5 com 38 (chapa dobrada).
  const mesmaMedida = function (d1, d2) {
    return Math.abs(d1[0] - d2[0]) <= 1 && Math.abs(d1[1] - d2[1]) <= 1 && Math.abs(d1[2] - d2[2]) <= 2;
  };
  const norm = function (t) { return String(t || '').trim().toLowerCase(); };
  const sanitize = function (t) {
    return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'peca';
  };

  const livres = pecasPlano.map(function (pc) {
    return { pc: pc, d: dims(pc.w_mm, pc.h_mm, pc.espessura_mm), usada: false };
  });
  const pegar = function (orderItemId, ref, d, exigeRef) {
    const achou = livres.find(function (l) {
      return !l.usada && (l.pc.order_item_ids || []).indexOf(orderItemId) >= 0 &&
        mesmaMedida(l.d, d) && (!exigeRef || norm(l.pc.reference) === norm(ref));
    });
    if (achou) achou.usada = true;
    return achou ? achou.pc : null;
  };

  const files = [];
  const semCodigo = [];
  let seqSemCodigo = 0;
  itens.forEach(function (item) {
    // um item por vez: collectOrderPieces agrupa por assinatura, e juntar
    // itens diferentes perderia de qual order_item veio cada peça.
    Drilling.collectOrderPieces([item], config).forEach(function (rec) {
      const d = dims(rec.comprimento_mm, rec.largura_mm, rec.espessura_mm);
      for (let q = 0; q < rec.quantity; q++) {
        const pc = pegar(item.orderItemId, rec.reference, d, true) ||
                   pegar(item.orderItemId, rec.reference, d, false);
        let nome;
        if (pc) {
          nome = pc.piece_code;
        } else {
          seqSemCodigo += 1;
          nome = 'SEM-CODIGO_' + String(seqSemCodigo).padStart(3, '0') + '_' + sanitize(rec.reference) + '_' +
            Math.round(rec.comprimento_mm) + 'x' + Math.round(rec.largura_mm) + 'x' + Math.round(rec.espessura_mm);
          semCodigo.push((rec.module_name || '') + ' · ' + (rec.reference || 'peça') + ' ' +
            Math.round(d[0]) + '×' + Math.round(d[1]) + '×' + Math.round(d[2]));
        }
        const recortes = rec.recortes || [];
        const base = {
          piece_code: pc ? pc.piece_code : '',
          quantity: 1,
          reference: rec.reference,
          module_name: rec.module_name,
          comprimento_mm: rec.comprimento_mm,
          largura_mm: rec.largura_mm,
          espessura_mm: rec.espessura_mm
        };
        /* .ban = furos + CONTORNO. O recorte em L (toe/gola) vai no
           <Outline> do próprio .ban — Matt testou na máquina (24/09,
           PC-002259) e cortou perfeito. Nada de SlotL (não cortava) nem de
           arquivo separado. Peça só com recorte e sem furo gera .ban só com
           o contorno. Ver Drilling.outlineBan. */
        files.push(Object.assign({}, base, {
          filename: nome + '.ban',
          content: Drilling.buildBanXml(nome, rec.comprimento_mm, rec.largura_mm, rec.espessura_mm, rec.holes, [], recortes),
          holes_count: rec.holes.length,
          slots_count: recortes.length
        }));
      }
    });
  });
  files.sort(function (a, b) { return a.filename.localeCompare(b.filename); });
  return { files: files, semCodigo: semCodigo };
};

/* Marca p._furado = true nas peças do plano que vão pra furadeira (pedido do
   Matt, 23/09: bolinha preta na etiqueta). Usa EXATAMENTE o mesmo casamento
   do .ban (_arquivosPorPeca), então bolinha na etiqueta = existe PC-xxx.ban
   com esse código, sem chance de divergir. Devolve quantas marcou. */
FURACAO_LOTE.marcarPecasFuradas = async function (batchId, pecasPlano) {
  const col = await FURACAO_LOTE.coletar(batchId);
  if (!col.itens.length) return 0;
  const r = FURACAO_LOTE._arquivosPorPeca(col.itens, col.config, pecasPlano);
  const codigos = {};
  r.files.forEach(function (f) { if (f.piece_code) codigos[f.piece_code] = true; });
  let n = 0;
  pecasPlano.forEach(function (p) { p._furado = !!codigos[p.piece_code]; if (p._furado) n += 1; });
  return n;
};

/* opts.medidasComoCortadas = true -> modo "lote já cortado" (ver
   _aplicarEspessuraSoNoEixo). Só pra lote cortado ANTES da migration 160
   com chapa de espessura diferente de 19.5; lote novo NÃO precisa. */
FURACAO_LOTE.gerar = async function (batchId, btn, opts) {
  const medidasComoCortadas = !!(opts && opts.medidasComoCortadas);
  const texto = btn ? btn.textContent : '';
  const avisar = function (msg, erro) {
    if (!btn) { if (erro) console.error(msg); return; }
    let el = btn.parentNode.querySelector('.erp-furacao-status');
    if (!el) {
      el = document.createElement('span');
      el.className = 'erp-furacao-status erp-xs';
      btn.parentNode.appendChild(el);
    }
    el.style.color = erro ? 'var(--danger)' : 'var(--muted)';
    el.textContent = msg;
  };

  if (typeof JSZip === 'undefined') {
    avisar('A biblioteca de ZIP não carregou — recarregue a página.', true);
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = 'Gerando…'; }
  avisar('lendo os pedidos do lote…');

  try {
    const col = await FURACAO_LOTE.coletar(batchId, avisar, { medidasComoCortadas: medidasComoCortadas });
    const lote = col.lote;
    if (col.vazio === 'sem-pedido') { avisar('Este lote não tem pedido nenhum dentro.', true); return; }
    if (col.vazio === 'sem-peca') { avisar('Nenhum módulo do lote tem peças cadastradas.', true); return; }
    const todos = col.itens;
    const semCadastro = col.semCadastro;

    avisar('lendo as peças do plano de corte…');
    const doPlano = await FURACAO_LOTE._pecasDoPlano(batchId);
    if (!doPlano || !doPlano.pecas.length) {
      avisar('Salve o plano de corte antes: o .ban leva o código da etiqueta (PC-…) e esse código nasce no plano.', true);
      return;
    }

    avisar('montando os arquivos…');
    let comoCortadas = 0;
    if (medidasComoCortadas) comoCortadas = FURACAO_LOTE._assumirMedidaCortada(todos, doPlano.pecas);
    const diag = FURACAO_LOTE._diagnosticoPrateleiras(todos, col.config.settings);
    const semSuporte = diag.filter(function (d) { return d.motivo.indexOf('OK') !== 0; }).length;
    const porPeca = FURACAO_LOTE._arquivosPorPeca(todos, col.config, doPlano.pecas);
    const files = porPeca.files;
    if (porPeca.semCodigo.length) {
      console.warn('[furacao-lote] peças furadas sem par no plano ' + doPlano.plano.code +
        ' (saíram como SEM-CODIGO_*.ban):', porPeca.semCodigo);
    }

    if (!files.length) {
      avisar('Nenhum furo gerado — falta cadastrar furação padrão nos componentes (inclusive contra-furo de borda) ou dobradiça.', true);
      return;
    }

    const zip = new JSZip();
    const indice = ['arquivo;codigo_peca;modulo;peca;comprimento_mm;largura_mm;espessura_mm;quantidade;furos;usinagem'];
    files.forEach(function (f) {
      zip.file(f.filename, f.content);
      indice.push([
        f.filename, f.piece_code, f.module_name, f.reference,
        Math.round(f.comprimento_mm), Math.round(f.largura_mm), Math.round(f.espessura_mm),
        f.quantity, f.holes_count, f.slots_count || 0
      ].join(';'));
    });
    zip.file('00_indice.txt', indice.join('\r\n') + '\r\n');

    const blob = await zip.generateAsync({ type: 'blob' });
    const nome = 'furacao_' + String(lote.code || batchId).replace(/[^a-zA-Z0-9_-]+/g, '_') +
      (medidasComoCortadas ? '_ja-cortado' : '') + '.zip';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);

    const comCodigo = files.length - porPeca.semCodigo.length;
    let ajustadas = 0;
    if (medidasComoCortadas) {
      const conta = function (lista) {
        (lista || []).forEach(function (p) { if (p.is_module) conta(p.child_pieces); else if (p._espessura_ajustada) ajustadas += 1; });
      };
      col.itens.forEach(function (it) { conta(it.parts); });
    }
    avisar(comCodigo + ' .ban com código da etiqueta (plano ' + doPlano.plano.code + '), ' + col.pedidos + ' pedido(s)' +
      (medidasComoCortadas ? ' — modo LOTE JÁ CORTADO: medidas como no plano (E=19.5), espessura real da chapa em ' + ajustadas + ' peça(s)' +
        (comoCortadas ? ', ' + comoCortadas + ' peça(s) furada(s) na medida em que foram cortadas (cadastro mudou depois do corte, ver F12)' : '') : '') +
      (col.config.settings && col.config.settings.shelf_enabled === false ? ' — ATENÇÃO: suporte de prateleira DESLIGADO nos Ajustes de furação' : '') +
      (semSuporte ? ' — ' + semSuporte + ' prateleira(s) sem furo de suporte na lateral (motivo no F12, tabela "diagnóstico de prateleiras")' : '') +
      (porPeca.semCodigo.length ? ' — ATENÇÃO: ' + porPeca.semCodigo.length +
        ' peça(s) sem par no plano saíram como SEM-CODIGO_*.ban (medida mudou no cadastro depois do pedido? ver F12)' : '') +
      (semCadastro ? ' — ' + semCadastro + ' módulo(s) sem cadastro ficaram de fora.' : '.'),
      porPeca.semCodigo.length > 0);
  } catch (err) {
    console.error('[furacao-lote]', err);
    avisar(DATA.explainError(err), true);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = texto; }
  }
};
