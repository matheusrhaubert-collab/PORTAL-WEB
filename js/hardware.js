/* js/hardware.js — ITEM COMPRADO x MÓDULO: o vínculo pelo FURO
 * (2026-08-18, migration 119)
 *
 * ==========================================================================
 * O QUE ESTE ARQUIVO RESOLVE
 * ==========================================================================
 * Matt: "temos uma questão importante pra resolver, como linkar os
 * componentes comprados com os módulos. exemplo minifix, em cada furo de
 * tambor 12mm vai uma 'tambor' e um pino, cada furo de 8mm vai uma cavilha,
 * em toda prateleira vai 4 suportes VB".
 *
 * A resposta está na própria frase: o vínculo é o FURO, não uma lista
 * digitada por módulo. Um módulo não "leva 12 minifix" — ele leva o minifix
 * que a furação dele descreve. Lista digitada envelhece em silêncio: muda o
 * programa de furação, a lista continua igual e ninguém percebe até faltar
 * ferragem na montagem.
 *
 * Aqui a contagem sai de Drilling.holesBySignature, que roda o MESMO
 * collectAssembly que escreve o .ban da furadeira. Não há como divergir: se o
 * furo está no arquivo da máquina, a ferragem dele está na caixa.
 *
 * ==========================================================================
 * ARQUIVO ÚNICO, DE PROPÓSITO
 * ==========================================================================
 * Isto aqui NÃO pode virar a quinta cópia de nada. O resolvedor de peças já
 * viveu duplicado em quatro arquivos, e uma coluna esquecida numa das cópias
 * deixou módulo inteiro sem furo, sem erro no console (ver
 * quatro_copias_do_resolvedor_de_pecas). O portal, o ERP e a calculadora
 * carregam ESTE arquivo — regra nova entra num lugar só.
 *
 * Sem DOM e sem Supabase: recebe o catálogo pronto e devolve número. Quem
 * busca no banco é o chamador (portal.js / erp), porque cada um já tem o
 * próprio jeito de cachear e de reportar erro.
 *
 * ==========================================================================
 * A REGRA FINAL (Matt, 2026-08-18) — SÓ FACE, SÓ DIÂMETRO
 * ==========================================================================
 * Cheguei a desenhar uma regra fina por `tipo` de furo (furo próprio vs
 * propagado vs tambor) achando que "todo Ø8 de face é cavilha" ia contar
 * pino de minifix como cavilha por engano. O Matt cortou isso pela raiz:
 *
 *   "sempre que encontrar um furo 5mm na face (nao nas bordas) sera aum pino
 *   minifix, semrpe que encontrar 12mm na face (nao nas bordas) sera tambor,
 *   sempre que encontrar furo de 8mm na facde (nao nas bordas) sera cavilha.
 *   IGNORA AS BORDAS pra saber que ferragem vai. esquece elas, so olha pras
 *   faces ja geradas"
 *
 * Ou seja: SÓ diâmetro da FACE decide, sem olhar se o furo é próprio ou
 * propagado, sem parear tambor com pino por junta. Cada furo de face conta
 * 1 unidade, sozinho. Furo de borda NUNCA entra nessa conta — nem como
 * gatilho, nem como confirmação.
 *
 *   Ø5  na face -> 1 pino minifix
 *   Ø8  na face -> 1 cavilha
 *   Ø12 na face -> 1 tambor minifix
 *
 * ESCOPO: isto vale pros furos que vêm do CADASTRO comum de furação
 * (component_drillings/drilling_pattern_holes — os `tipo` proprio_face,
 * proprio_face_tambor, contrafuro_face, copo_tambor no drilling.js), e SÓ
 * eles. Os furos AUTOMÁTICOS de dobradiça/corrediça (copo_dobradica,
 * marcacao_dobradica, base_dobradica, corredica) também podem usar Ø5 por
 * padrão (ver drilling_settings.hinge_plate_diameter_mm/slide_diameter_mm) —
 * se a regra de diâmetro não distinguisse a origem, todo parafuso de
 * dobradiça e de corrediça viraria "pino minifix" por engano, contando
 * ferragem errada em todo módulo com porta ou gaveta. Por isso
 * `hardware_rules.hole_kinds` (plural, array) ainda existe: não pra
 * distinguir cavilha de pino — isso agora é só o diâmetro — mas pra dizer
 * "esta regra vale pros furos do cadastro comum", deixando de fora os que
 * pertencem à dobradiça/corrediça/suporte, que têm seus PRÓPRIOS tipos e
 * (na fase 2) suas próprias regras.
 */
(function (global) {
  'use strict';

  function num(x) { const n = parseFloat(x); return isFinite(n) ? n : 0; }

  // --- CATÁLOGO (publicado pelo chamador, uma vez por sessão) --------------
  // itens : [{ id, code, name, unit, purchase_price, margin_profile_id,
  //            kind, active }]
  // regras: [{ trigger_type, hole_kinds (array ou null=qualquer),
  //            diameter_mm, face_kind, position_role, purchased_item_id,
  //            qty, active }]
  //
  // Fica em módulo (e não em parâmetro) pelo mesmo motivo de
  // Pricing.setProcessLabor/setHoleCounts: são vários pontos que pedem o
  // consumo, e acrescentar argumento em todos convida a esquecer um — e
  // esquecer aqui é ferragem sumindo do orçamento em silêncio.
  let itensById = {};
  let regras = [];
  let carregado = false;

  function setCatalog(itens, rules) {
    itensById = {};
    (itens || []).forEach(function (i) { if (i && i.id) itensById[i.id] = i; });
    regras = (rules || []).filter(function (r) {
      return r && r.active !== false && r.purchased_item_id && itensById[r.purchased_item_id];
    });
    carregado = true;
  }

  // Catálogo ainda não chegou pela rede != catálogo vazio. Quem consome
  // precisa distinguir os dois pra não gravar um "zero ferragens" com cara de
  // verdade — foi exatamente esse o erro que o cache de furos do portal levou
  // quatro rodadas pra consertar.
  function isLoaded() { return carregado; }

  // --- CASAMENTO regra x furo ---------------------------------------------
  // Campo vazio/null na regra = "qualquer". Campo preenchido tem que bater.
  // Estrito de propósito: regra que casa demais some no meio do total, regra
  // que casa de menos aparece como ferragem faltando — e a segunda alguém vê.
  //
  // hole_kinds é ARRAY: "esta regra vale pra estes tipos de furo" — não pra
  // escolher cavilha vs pino (isso é só o diâmetro, ver o cabeçalho), mas
  // pra manter os furos automáticos de dobradiça/corrediça/suporte FORA da
  // regra de diâmetro do cadastro comum (os dois sistemas podem usar o
  // mesmo Ø5 por coincidência de configuração).
  function casaFuro(regra, sig) {
    if (regra.hole_kinds && regra.hole_kinds.length && regra.hole_kinds.indexOf(sig.tipo) === -1) return false;
    if (regra.face_kind && regra.face_kind !== sig.face_kind) return false;
    if (regra.diameter_mm !== null && regra.diameter_mm !== undefined && regra.diameter_mm !== '') {
      // tolerância de 0,01mm: o banco é numeric(6,2) e o cadastro do furo é
      // numeric também, mas o caminho passa por float
      if (Math.abs(num(regra.diameter_mm) - num(sig.diameter_mm)) > 0.011) return false;
    }
    return true;
  }

  /* ------------------------------------------------------------------------
   * consumoDoModulo(parts, W, H, D, drillConfig)
   *
   * parts       = saída de resolvePiecesForViewer (a mesma que o .ban usa —
   *               a quantidade das peças JÁ vem expandida ali, uma entrada
   *               por cópia, então 3 prateleiras já são 3 peças)
   * drillConfig = { drillingsByComponent, holesByPattern, settings }
   *
   * Devolve [{ item_id, code, name, unit, qty, unit_cost, cost,
   *            margin_profile_id }], uma linha por ITEM (não por regra) —
   * duas regras que apontam pro mesmo item somam na mesma linha, senão o
   * relatório mostraria "Tambor" duas vezes com metade da conta cada.
   * ---------------------------------------------------------------------- */
  function consumoDoModulo(parts, W, H, D, drillConfig) {
    if (!carregado || !regras.length) return [];
    if (typeof Drilling === 'undefined' || !Drilling.holesBySignature) return [];

    const acc = {};
    const somar = function (itemId, qtd) {
      if (!(qtd > 0)) return;
      const item = itensById[itemId];
      if (!item || item.active === false) return;
      if (!acc[itemId]) {
        acc[itemId] = {
          item_id: itemId,
          code: item.code || null,
          name: item.name || '',
          unit: item.unit || 'un',
          kind: item.kind || null,
          qty: 0,
          unit_cost: num(item.purchase_price),
          cost: 0,
          margin_profile_id: item.margin_profile_id || null
        };
      }
      acc[itemId].qty += qtd;
    };

    // --- gatilho FURO ---
    let assinaturas = [];
    try {
      assinaturas = Drilling.holesBySignature(parts, W, H, D, drillConfig || {}) || [];
    } catch (e) { assinaturas = []; }

    assinaturas.forEach(function (sig) {
      regras.forEach(function (r) {
        if ((r.trigger_type || 'furo') !== 'furo') return;
        if (!casaFuro(r, sig)) return;
        somar(r.purchased_item_id, num(r.qty) * sig.count);
      });
    });

    // --- gatilho PAPEL ---
    // Pra ferragem que NÃO deixa furo: puxador, pé, sapata. Percorre as peças
    // recursivamente (peça-módulo aninhada tem as dela em child_pieces), uma
    // vez por peça — a quantidade já está expandida em `parts`.
    const regrasPapel = regras.filter(function (r) { return r.trigger_type === 'papel' && r.position_role; });
    if (regrasPapel.length) {
      const anda = function (lista) {
        (lista || []).forEach(function (p) {
          if (!p) return;
          if (p.is_module) { anda(p.child_pieces); return; }
          const papel = p.position_role || 'other';
          regrasPapel.forEach(function (r) {
            if (r.position_role !== papel) return;
            somar(r.purchased_item_id, num(r.qty));
          });
        });
      };
      anda(parts);
    }

    return Object.keys(acc).map(function (k) {
      const l = acc[k];
      l.cost = l.qty * l.unit_cost;
      return l;
    }).sort(function (a, b) { return b.cost - a.cost || a.name.localeCompare(b.name); });
  }

  // Soma duas listas de consumo (usado pra fechar o total do PROJETO a partir
  // dos módulos). Não é `concat`: item repetido em dois módulos tem que virar
  // uma linha só com a quantidade somada, senão a lista de compra manda o
  // comprador ler dez linhas de cavilha.
  function merge(listas) {
    const acc = {};
    (listas || []).forEach(function (lista) {
      (lista || []).forEach(function (l) {
        if (!l || !l.item_id) return;
        if (!acc[l.item_id]) acc[l.item_id] = Object.assign({}, l, { qty: 0, cost: 0 });
        acc[l.item_id].qty += num(l.qty);
        acc[l.item_id].cost += num(l.cost);
      });
    });
    return Object.keys(acc).map(function (k) { return acc[k]; })
      .sort(function (a, b) { return b.cost - a.cost || a.name.localeCompare(b.name); });
  }

  function totalCost(lista) {
    return (lista || []).reduce(function (s, l) { return s + num(l.cost); }, 0);
  }

  global.Hardware = {
    setCatalog: setCatalog,
    isLoaded: isLoaded,
    consumoDoModulo: consumoDoModulo,
    merge: merge,
    totalCost: totalCost,
    // exposto pra teste/diagnóstico — é a função que decide se uma regra
    // pega ou não, e é onde qualquer "por que essa cavilha não aparece?"
    // termina
    _casaFuro: casaFuro
  };
})(typeof window !== 'undefined' ? window : globalThis);
