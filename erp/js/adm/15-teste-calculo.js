/* Painel admin — Cálculo de teste e conferência interna
 *
 * Pedaço 16/21 do antigo js/admin.js, que virou módulo quando o
 * ERP passou a ser a única porta de entrada. O corte seguiu os próprios
 * marcadores de assunto do arquivo, então nada mudou de vizinho.
 * A ordem de carregamento em erp/index.html importa: é a mesma de antes. */

// ---------- CÁLCULO DE TESTE (conferência interna) ----------

document.getElementById('test-calc-form').addEventListener('submit', (e) => {
  e.preventDefault();
  runTestCalculation();
});

let testCalcColorSelectEls = {}; // role_id -> <select> vivo

// Um <select> de cor por papel cadastrado (migration 035 — antes eram 2
// selects fixos, Cor da caixa/Cor da porta). Usa TODAS as cores do catálogo
// (colorsCache), não só as vinculadas a um módulo — esta é uma ferramenta
// de conferência interna, não a tela do cliente.
function populateTestCalcColorSelects() {
  const container = document.getElementById('test-calc-color-selects');
  const prevValues = {};
  Object.keys(testCalcColorSelectEls).forEach((roleId) => { prevValues[roleId] = testCalcColorSelectEls[roleId].value; });

  container.innerHTML = '';
  testCalcColorSelectEls = {};
  colorRolesCache.forEach((role) => {
    const wrap = document.createElement('div');
    const label = document.createElement('label');
    label.textContent = `Cor — ${role.name}`;
    const sel = document.createElement('select');
    sel.innerHTML = colorsCache.map((c) => `<option value="${c.id}">${c.name}</option>`).join('');
    if (colorsCache.some((c) => c.id === prevValues[role.id])) sel.value = prevValues[role.id];
    sel.addEventListener('change', runTestCalculation);
    wrap.appendChild(label);
    wrap.appendChild(sel);
    container.appendChild(wrap);
    testCalcColorSelectEls[role.id] = sel;
  });
}

function populateTestCalcOptionSelects() {
  populateTestCalcColorSelects();
  fillSelect('test-calc-hinge-model', hingeModelsCache);
  fillSelect('test-calc-slide-model', slideModelsCache);
}

function renderTestCalcShelfInputs() {
  const container = document.getElementById('test-calc-shelf-quantities');
  container.innerHTML = '';
  modulePieces.filter((p) => p.quantity_configurable).forEach((p) => {
    const div = document.createElement('div');
    div.innerHTML = `<label>${p.reference} — quantidade (${p.quantity_min}-${p.quantity_max})</label>
      <input type="number" class="test-calc-shelf-qty" data-piece-id="${p.id}" min="${p.quantity_min}" max="${p.quantity_max}" value="${p.quantity_default}" />`;
    container.appendChild(div);
  });
}

// Peças marcadas "cliente pode adicionar/remover" (opcional) — mesmo
// padrão de caixinha de marcar que o cliente vê na calculadora, pra essa
// prévia interna refletir de verdade o que vai acontecer lá (desmarcado
// por padrão, precisa marcar pra entrar no total).
function renderTestCalcOptionalInputs() {
  const container = document.getElementById('test-calc-optionals');
  container.innerHTML = '';
  modulePieces.filter((p) => p.client_optional).forEach((p) => {
    const label = document.createElement('label');
    label.style.display = 'flex';
    label.style.alignItems = 'center';
    label.style.gap = '6px';
    label.style.marginTop = '4px';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.style.width = 'auto';
    checkbox.className = 'test-calc-optional-checkbox';
    checkbox.dataset.pieceId = p.id;
    checkbox.addEventListener('change', runTestCalculation);
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(`${p.reference} (opcional)`));
    container.appendChild(label);
  });
}

// ==========================================================================
// FURAÇÃO REAL + FERRAGEM DE MONTAGEM NO TESTE DE CÁLCULO (2026-08-19)
// ==========================================================================
// Matt: "nao consigo ver no sistema de calculo os valores separados por
// drilling, nao consigo nem ver os comprados dela" (falando de "Drawer Soft
// Closet Externa" — Flatbord, labor_por_processo já ligado desde a migration
// 090/091, ver [[peca_generica_e_labor_por_processo]]).
//
// O motor (pricing.js/hardware.js) já sabia fazer as duas coisas — só
// ninguém NUNCA publicava os dados aqui:
//   1. Pricing.setHoleCounts — furação REAL da peça (Drilling.countHolesByPiece,
//      o mesmo gerador do .ban), pro custo de furação por processo bater com
//      o furo de verdade em vez do furos_equivalentes digitado no cadastro
//      (que é só um fallback). Sem isto, labor_breakdown.furacao existia no
//      retorno de pricing.js mas usava sempre o número velho do cadastro.
//   2. Pricing.setModuleHardware + Hardware.setCatalog — ferragem de
//      montagem (minifix, tambor, cavilha...), que nasce do FURO, não da
//      peça (ver cabeçalho de js/hardware.js: "todo furo de Ø8 é cavilha"
//      está errado, por isso o vínculo é regra × furo, não peça × item).
//      publicarCatalogoDeFerragem() e aplicarMargemDosComprados() já
//      existiam em 25-itens-comprados.js com o comentário "é o que faz o
//      Teste de cálculo do ERP ver a mesma ferragem que o portal vê" — mas
//      só eram chamadas de DENTRO daquela tela (que o Matt pode nunca ter
//      aberto nesta sessão do ERP), então moduleHardware ficava sempre null
//      aqui e a coluna de comprados saía vazia sem erro nenhum.
//
// Tudo abaixo é tolerante: se drilling.js/hardware.js não carregarem, ou o
// banco não tiver a migration 119/105, o cálculo cai de volta no
// furos_equivalentes do cadastro e sem ferragem de montagem — o mesmo
// comportamento de sempre, só sem o extra.

// Cache do catálogo de furação (component_drillings + drilling_pattern_holes
// + drilling_settings) — carregado 1x por sessão do ERP, igual ao botão
// "Furação — visualização" mais abaixo neste arquivo (mesma consulta,
// reaproveitada em vez de duplicada).
let testCalcDrillingCatalog = null;
let testCalcDrillingCatalogLoading = null;
async function ensureTestCalcDrillingCatalog() {
  if (testCalcDrillingCatalog) return testCalcDrillingCatalog;
  if (testCalcDrillingCatalogLoading) return testCalcDrillingCatalogLoading;
  testCalcDrillingCatalogLoading = (async () => {
    const [drillsRes, patternHolesRes, settingsRes] = await Promise.all([
      supabaseClient.from('component_drillings').select('*').order('sort_order'),
      supabaseClient.from('drilling_pattern_holes').select('*').order('sort_order'),
      supabaseClient.from('drilling_settings').select('*').eq('id', true).single()
    ]);
    if (drillsRes.error) throw drillsRes.error;
    const drillingsByComponent = {};
    (drillsRes.data || []).forEach((row) => {
      if (!drillingsByComponent[row.component_id]) drillingsByComponent[row.component_id] = [];
      drillingsByComponent[row.component_id].push(row);
    });
    // Furos dos PROGRAMAS (migration 105) — erro engolido de propósito,
    // mesma regra do botão de prévia: sem a migration, holesByPattern fica
    // vazio e tudo segue só pela furação do componente.
    const holesByPattern = Drilling.groupPatternHoles(
      (patternHolesRes && !patternHolesRes.error && patternHolesRes.data) || []);
    testCalcDrillingCatalog = {
      drillingsByComponent,
      holesByPattern,
      settings: (settingsRes && !settingsRes.error && settingsRes.data) || {}
    };
    return testCalcDrillingCatalog;
  })();
  try {
    return await testCalcDrillingCatalogLoading;
  } catch (e) {
    testCalcDrillingCatalogLoading = null; // permite tentar de novo na próxima chamada
    throw e;
  }
}

// Ferragem de montagem: reaproveita loadHardwareRules/publicarCatalogoDeFerragem/
// aplicarMargemDosComprados de 25-itens-comprados.js (funções globais — a
// ORDEM dos <script> em erp/index.html não importa aqui porque só são
// CHAMADAS depois que a página inteira já carregou, nunca no topo de um
// arquivo; ver o bug irmão de hoje em [[portal_tdz_pos_split_defaultprojectwallsegments]]
// pra um caso em que isso teria sido um problema de verdade). purchasedItemsCache
// já vem carregado desde o boot (loadComponents → loadPurchasedItems); só
// hardwareRulesCache precisa de um fetch extra, feito 1x.
let testCalcHardwareRulesFetched = false;
async function ensureTestCalcHardwareCatalog() {
  try {
    if (typeof loadHardwareRules === 'function' && !testCalcHardwareRulesFetched) {
      testCalcHardwareRulesFetched = true;
      await loadHardwareRules();
    }
    if (typeof publicarCatalogoDeFerragem === 'function') publicarCatalogoDeFerragem();
    if (typeof aplicarMargemDosComprados === 'function' && typeof pricingSettingsCache !== 'undefined') {
      aplicarMargemDosComprados(pricingSettingsCache);
    }
  } catch (e) {
    testCalcHardwareRulesFetched = false; // deixa tentar de novo na próxima
  }
}

async function runTestCalculation() {
  clearError('test-calc-error');
  const resultEl = document.getElementById('test-calc-result');
  if (!selectedModuleId || modulePieces.length === 0) {
    resultEl.innerHTML = '<p class="hint">Marque ao menos um componente para testar o cálculo.</p>';
    return;
  }
  const module = modulesCache.find((m) => m.id === selectedModuleId);

  const colorsByRole = {};
  Object.keys(testCalcColorSelectEls).forEach((roleId) => {
    colorsByRole[roleId] = colorsCache.find((c) => c.id === testCalcColorSelectEls[roleId].value) || colorsCache[0];
  });
  const hingeModel = hingeModelsCache.find((h) => h.id === document.getElementById('test-calc-hinge-model').value) || null;
  const slideModel = slideModelsCache.find((s) => s.id === document.getElementById('test-calc-slide-model').value) || null;

  if (Object.keys(colorsByRole).length === 0 || colorsCache.length === 0) {
    resultEl.innerHTML = '<p class="hint">Cadastre ao menos uma cor para testar o cálculo.</p>';
    return;
  }

  const shelfQuantities = {};
  document.querySelectorAll('.test-calc-shelf-qty').forEach((input) => {
    shelfQuantities[input.dataset.pieceId] = parseInt(input.value, 10);
  });

  // Peças opcionais só entram se a caixinha estiver marcada — mesma regra
  // que vale na calculadora do cliente.
  const checkedOptionalIds = new Set();
  document.querySelectorAll('.test-calc-optional-checkbox').forEach((input) => {
    if (input.checked) checkedOptionalIds.add(input.dataset.pieceId);
  });
  const effectivePieces = modulePieces.filter((p) => !p.client_optional || checkedOptionalIds.has(p.id));

  const width_mm = parseFloat(document.getElementById('test-calc-width').value) || module.width_default_mm;
  const height_mm = parseFloat(document.getElementById('test-calc-height').value) || module.height_default_mm;
  const depth_mm = parseFloat(document.getElementById('test-calc-depth').value) || module.depth_default_mm;

  // Publica furação real + ferragem de montagem ANTES de pedir o preço —
  // mesma ordem que o portal usa (ver recomputeProjectSlotPricing em
  // portal-06-projetos-canvas.js). Sempre publica algo (mesmo que null/[]),
  // nunca deixa o valor de um módulo anterior vazar pro cálculo deste.
  let hardwareConsumo = [];
  try {
    await ensureTestCalcHardwareCatalog();
    const parts = (typeof resolvePiecesForViewer === 'function')
      ? resolvePiecesForViewer(effectivePieces, { W: width_mm, H: height_mm, D: depth_mm }, colorsByRole, shelfQuantities)
      : null;
    if (parts && typeof Drilling !== 'undefined' && Drilling.countHolesByPiece) {
      const catalog = await ensureTestCalcDrillingCatalog();
      const contagem = Drilling.countHolesByPiece(parts, width_mm, height_mm, depth_mm, catalog);
      if (Pricing.setHoleCounts) Pricing.setHoleCounts(contagem);
      if (typeof Hardware !== 'undefined' && Hardware.consumoDoModulo && Pricing.setModuleHardware) {
        hardwareConsumo = Hardware.consumoDoModulo(parts, width_mm, height_mm, depth_mm, catalog) || [];
        Pricing.setModuleHardware(hardwareConsumo);
      }
    } else {
      if (Pricing.setHoleCounts) Pricing.setHoleCounts(null);
      if (Pricing.setModuleHardware) Pricing.setModuleHardware(null);
    }
  } catch (e) {
    // Furação/ferragem não puderam ser calculadas agora (banco sem a
    // migration, catálogo ainda carregando...) — cai no fallback de sempre
    // (furos_equivalentes do cadastro, sem ferragem de montagem) em vez de
    // travar o Teste de cálculo inteiro.
    if (Pricing.setHoleCounts) Pricing.setHoleCounts(null);
    if (Pricing.setModuleHardware) Pricing.setModuleHardware(null);
    hardwareConsumo = [];
  }

  try {
    const result = Pricing.calculateModulePrice({
      module, pieces: effectivePieces, colorsByRole, hingeModel, slideModel, shelfQuantities,
      width_mm, height_mm, depth_mm
    });
    // Peça-módulo (sub-montagem aninhada) não tem chapa/fita/mão de obra
    // PRÓPRIA — quem tem isso são as peças-folha lá dentro dela (ver
    // pricing.js: calculateModulePiece). Antes esta tabela mostrava só um
    // resumo opaco ("Composição própria — $X/unidade") pra peça-módulo, sem
    // dar pra conferir se a mão de obra das peças-folha LÁ DENTRO estava
    // sendo somada de verdade. Agora renderBreakdownRow é recursiva: além da
    // linha-resumo da sub-montagem, ela desenha (indentada, com "↳") cada
    // peça-folha de child_breakdown — inclusive peça-módulo aninhada dentro
    // de peça-módulo, em qualquer profundidade — pra conferência visual
    // direta de chapa/fita/mão de obra/dobradiça/corrediça de cada peça real.
    const roleNameById = (id) => (colorRolesCache.find((r) => r.id === id) || {}).name || '—';
    // Mão de obra aberta por processo (migration 090/091) — p.labor_breakdown
    // só existe quando a peça tem labor_por_processo ligado (ver pricing.js:
    // calculateLeafPiece); peça antiga (labor fixa por unidade) continua
    // mostrando só o total, sem quebra, porque não tem o que abrir.
    function laborCellHtml(p) {
      const total = `$${p.labor_cost.toFixed(2)}`;
      if (!p.labor_breakdown) return total;
      const b = p.labor_breakdown;
      return `${total}<br><span class="hint">corte $${b.corte.toFixed(2)} · fita $${b.fita.toFixed(2)} ·`
        + ` furação $${b.furacao.toFixed(2)}${b.usinagem ? ' · usinagem $' + b.usinagem.toFixed(2) : ''}</span>`;
    }
    // Comprado (migration 119) — peça com origin='comprado' (pé, puxador...).
    // NÃO é a ferragem de montagem (minifix/tambor/cavilha, essa é por
    // MÓDULO, tabela própria mais abaixo) — aqui é o preço de compra da
    // peça em si.
    function purchasedCellHtml(p) {
      if (!p.purchased_cost) return '—';
      const nome = (p.purchased_item_id && typeof purchasedItemName === 'function')
        ? purchasedItemName(p.purchased_item_id) : null;
      return `$${p.purchased_cost.toFixed(2)}${nome ? '<br><span class="hint">' + nome + '</span>' : ''}`;
    }
    function renderBreakdownRow(p, depth) {
      const indent = depth > 0 ? '<span class="hint">' + '&nbsp;&nbsp;&nbsp;&nbsp;'.repeat(depth) + '↳ </span>' : '';
      if (p.is_module) {
        const childRows = (p.child_breakdown || []).map((cp) => renderBreakdownRow(cp, depth + 1)).join('');
        return `
          <tr>
            <td>${indent}📦 ${p.reference} (x${p.quantity}, sub-montagem${p.color_role_id ? ', ' + roleNameById(p.color_role_id) : ''})</td>
            <td>${p.width_mm.toFixed(0)} x ${p.height_mm.toFixed(0)} x ${p.depth_mm.toFixed(0)} mm</td>
            <td colspan="6" class="hint">Composição própria — $${p.child_total.toFixed(2)} / unidade (peças abaixo)</td>
            <td>$${p.hinge_cost.toFixed(2)}</td>
            <td>$${p.slide_cost.toFixed(2)}</td>
            <td><strong>$${p.piece_total.toFixed(2)}</strong></td>
          </tr>
          ${childRows}
        `;
      }
      return `
        <tr>
          <td>${indent}${p.reference} (x${p.quantity}, ${roleNameById(p.color_role_id)})</td>
          <td>${p.width_mm.toFixed(0)} x ${p.height_mm.toFixed(0)} x ${p.depth_mm.toFixed(0)} mm</td>
          <td>${p.area_m2.toFixed(3)} m²</td>
          <td>${p.edge_band_m.toFixed(2)} m</td>
          <td>$${p.sheet_cost.toFixed(2)}</td>
          <td>$${p.edge_cost.toFixed(2)}</td>
          <td>${laborCellHtml(p)}</td>
          <td>${purchasedCellHtml(p)}</td>
          <td>$${p.hinge_cost.toFixed(2)}</td>
          <td>$${p.slide_cost.toFixed(2)}</td>
          <td><strong>$${p.piece_total.toFixed(2)}</strong></td>
        </tr>
      `;
    }
    let rows = result.breakdown.map((p) => renderBreakdownRow(p, 0)).join('');
    // Preço do cliente = custo x margem — calculado de novo aqui SÓ pra
    // exibir lado a lado com o custo puro (result.total acima é sempre o
    // CUSTO, sem margem, porque esta chamada não passa markupMultiplier — é
    // o "Teste de cálculo" interno). Migration 070: a margem usada agora é a
    // do módulo (categoria > família > Padrão, ver resolveMarkupMultiplierForModule),
    // não mais sempre a Padrão — pra este teste bater com o que o cliente vê
    // de verdade no portal.
    const effectiveMultiplier = resolveMarkupMultiplierForModule(module);
    const clientTotal = result.total * effectiveMultiplier;

    // Ferragem de MONTAGEM (minifix, tambor, cavilha, suporte...) — por
    // MÓDULO, não por peça (nasce do furo, ver cabeçalho de js/hardware.js).
    // result.hardware: null = catálogo ainda não pôde ser carregado/publicado
    // (migration 119/105 ausente, erro de rede...); [] = carregou e não achou
    // nenhuma regra que bata com os furos deste módulo/medida; array = achou.
    // As três situações são bem diferentes pra quem está conferindo o
    // cálculo, então o texto distingue.
    let hardwareHtml;
    if (result.hardware && result.hardware.length) {
      const hRows = result.hardware.map((h) => `
        <tr>
          <td>${h.name}${h.code ? ' <span class="hint">(' + h.code + ')</span>' : ''}</td>
          <td>${Number(h.qty)} ${h.unit || 'un'}</td>
          <td>$${Number(h.unit_cost).toFixed(4)}</td>
          <td>$${Number(h.cost).toFixed(2)}</td>
        </tr>`).join('');
      hardwareHtml = `
        <h4 style="margin-top:18px;">Ferragem de montagem (comprados por furo — minifix, tambor, cavilha...)</h4>
        <table>
          <thead><tr><th>Item</th><th>Quantidade</th><th>Preço unitário</th><th>Custo</th></tr></thead>
          <tbody>${hRows}</tbody>
        </table>
        <p class="hint">Custo total de comprados (peças + ferragem de montagem): $${result.purchased_cost.toFixed(2)}.</p>`;
    } else if (result.hardware === null) {
      hardwareHtml = '<p class="hint">Ferragem de montagem: catálogo de itens comprados/regras de consumo não pôde carregar agora (confira se a migration 119 já rodou) — cálculo seguiu sem ela.</p>';
    } else {
      hardwareHtml = '<p class="hint">Ferragem de montagem: nenhuma regra de consumo (Itens Comprados → Regras de consumo) bateu com os furos desta configuração.</p>';
    }

    resultEl.innerHTML = `
      <table>
        <thead><tr><th>Peça</th><th>Dimensões</th><th>Chapa</th><th>Fita</th><th>Custo chapa</th><th>Custo fita</th><th>Mão de obra</th><th>Comprado</th><th>Dobradiça</th><th>Corrediça</th><th>Total</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="total-price">Custo do módulo pai: $${result.total.toFixed(2)}</p>
      <p class="total-price">Preço pro cliente (com margem de ${markupMultiplierToPercent(effectiveMultiplier).toFixed(2)}%): $${clientTotal.toFixed(2)}</p>
      <p class="hint">Peças-módulo (sub-montagem, 📦) mostram as peças-folha de dentro indentadas ("↳") logo abaixo, com o custo de mão de obra de cada uma — confira aí se a mão de obra está sendo somada. "Mão de obra" abre corte/fita/furação/usinagem quando a peça usa o sistema por processo (migration 090/091); peça antiga (labor fixa) mostra só o total. "Comprado" é o preço de compra da PEÇA em si (pé, puxador...) — a ferragem que nasce do FURO (minifix/tambor/cavilha) está na tabela separada abaixo. Esta é a única visão com breakdown por peça e custo — o cliente vê apenas o total com margem.</p>
      ${hardwareHtml}
    `;
  } catch (err) {
    showError('test-calc-error', err);
    resultEl.innerHTML = '';
  }
}

// Selects de cor (um por papel) já ganham seu próprio listener 'change' na
// hora de serem criados dinamicamente — ver populateTestCalcColorSelects.
['test-calc-hinge-model', 'test-calc-slide-model'].forEach((id) => {
  document.getElementById(id).addEventListener('change', runTestCalculation);
});

// ---------- FURAÇÃO — VISUALIZAÇÃO NO TESTE DE CÁLCULO (migration 038) ----------
// Desenha cada peça do módulo selecionado com TODOS os furos que o export
// .ban geraria (padrão + contra-furo propagado + dobradiça), usando as mesmas
// dimensões/opções de teste do Teste de cálculo e a MESMA geração do export
// de verdade (Drilling.collectOrderPieces) — desenho e arquivo nunca divergem.
document.getElementById('module-drilling-preview-btn').addEventListener('click', async () => {
  const statusEl = document.getElementById('module-drilling-preview-status');
  const listEl = document.getElementById('module-drilling-preview-list');
  listEl.innerHTML = '';
  statusEl.textContent = '';
  if (!selectedModuleId) { statusEl.textContent = 'Selecione um módulo primeiro.'; return; }
  if (typeof Drilling === 'undefined') { statusEl.textContent = 'drilling.js não carregou — recarregue a página.'; return; }
  statusEl.textContent = 'Gerando...';
  try {
    const module = modulesCache.find((m) => m.id === selectedModuleId);
    const [pieces, drillsRes, patternHolesRes, settingsRes] = await Promise.all([
      loadRecursivePiecesForModule(selectedModuleId),
      supabaseClient.from('component_drillings').select('*').order('sort_order'),
      // Furos dos PROGRAMAS (migration 105). Consulta separada e tolerante:
      // quem ainda não rodou a migration recebe erro aqui e segue só com a
      // furação do componente, em vez de a tela inteira morrer.
      supabaseClient.from('drilling_pattern_holes').select('*').order('sort_order'),
      supabaseClient.from('drilling_settings').select('*').eq('id', true).single()
    ]);
    if (drillsRes.error) throw drillsRes.error;
    if (settingsRes.error) throw settingsRes.error;

    const drillingsByComponent = {};

    // Mapa dos furos por PROGRAMA (migration 105). Erro é engolido de
    // propósito: sem a migration, holesByPattern fica vazio e tudo segue
    // pela furação do componente, como antes.
    const holesByPattern = Drilling.groupPatternHoles(
      (patternHolesRes && !patternHolesRes.error && patternHolesRes.data) || []);
    (drillsRes.data || []).forEach((row) => {
      if (!drillingsByComponent[row.component_id]) drillingsByComponent[row.component_id] = [];
      drillingsByComponent[row.component_id].push(row);
    });

    // Mesmos filtros/entradas do runTestCalculation: opcionais marcados,
    // quantidades de prateleira e dimensões de teste.
    const checkedOptionalIds = new Set();
    document.querySelectorAll('.test-calc-optional-checkbox').forEach((input) => {
      if (input.checked) checkedOptionalIds.add(input.dataset.pieceId);
    });
    const effectivePieces = pieces.filter((p) => !p.client_optional || checkedOptionalIds.has(p.id));
    const shelfQuantities = {};
    document.querySelectorAll('.test-calc-shelf-qty').forEach((input) => {
      shelfQuantities[input.dataset.pieceId] = parseInt(input.value, 10);
    });
    const W = parseFloat(document.getElementById('test-calc-width').value) || (module ? module.width_default_mm : 0);
    const H = parseFloat(document.getElementById('test-calc-height').value) || (module ? module.height_default_mm : 0);
    const D = parseFloat(document.getElementById('test-calc-depth').value) || (module ? module.depth_default_mm : 0);

    const parts = resolvePiecesForViewer(effectivePieces, { W, H, D }, {}, shelfQuantities);
    const recs = Drilling.collectOrderPieces(
      [{ moduleName: module ? module.name : '', parts, W, H, D, quantity: 1 }],
      { drillingsByComponent, holesByPattern, settings: settingsRes.data || {} }
    );

    if (recs.length === 0) {
      statusEl.textContent = 'Nenhum furo gerado neste módulo — confira a furação padrão dos componentes (incluindo contra-furos de borda) e as dobradiças (aba Furação).';
      return;
    }

    recs.forEach((rec) => {
      const m = { C: rec.comprimento_mm, L: rec.largura_mm, E: rec.espessura_mm };
      const holes = rec.holes.map((h) => ({ face: h.face, x: h.x, y: h.y, dia: h.diameter, depth: h.depth, outside: false }));
      const card = document.createElement('div');
      card.innerHTML = '<strong>' + rec.reference + '</strong> <span class="hint">x' + rec.quantity + ' — '
        + Math.round(m.C) + ' × ' + Math.round(m.L) + ' × ' + Math.round(m.E) + ' mm, ' + holes.length + ' furo(s)</span>'
        + buildDrillingPlaneSvg(m, holes);
      listEl.appendChild(card);
    });
    statusEl.textContent = recs.length + ' peça(s) com furação.';
  } catch (err) {
    statusEl.textContent = '';
    showError('test-calc-error', err);
  }
});
