/* Painel admin — Biblioteca de componentes, furação padrão e prévia
 *
 * Pedaço 10/21 do antigo js/admin.js, que virou módulo quando o
 * ERP passou a ser a única porta de entrada. O corte seguiu os próprios
 * marcadores de assunto do arquivo, então nada mudou de vizinho.
 * A ordem de carregamento em erp/index.html importa: é a mesma de antes. */

// ---------- COMPONENTES (biblioteca global reutilizável) ----------

async function loadComponents() {
  const { data, error } = await supabaseClient.from('components').select('*, labor_types(*), component_types(*)').order('reference');
  if (error) { showError('components-error', error); return; }
  componentsCache = data;
  // Pastas (migration 089) antes de desenhar: a árvore precisa das duas
  // listas. loadComponentFolders engole o erro de propósito — banco sem a
  // 089 mostra a lista sem pastas em vez de não mostrar nada.
  if (typeof loadComponentFolders === 'function') {
    await loadComponentFolders();
    if (typeof fillComponentFolderSelect === 'function') fillComponentFolderSelect();
  }
  // Itens comprados (migration 119) — o select "Item comprado" do formulário
  // precisa disto carregado ANTES de alguém abrir "Novo componente"/Editar,
  // e a aba Itens Comprados pode nunca ter sido visitada nesta sessão do
  // admin. loadPurchasedItems mora em 25-itens-comprados.js e já popula
  // purchasedItemsCache + os selects (populatePurchasedItemSelects) — só
  // reaproveita, não duplica a consulta.
  if (typeof loadPurchasedItems === 'function') await loadPurchasedItems();
  renderComponents();
  renderModuleComponentsList();
  // "Copiar furação de" (migration 038) — o select depende do componentsCache
  // recém-carregado; preenche aqui pra já funcionar sem precisar clicar em
  // Editar/Novo antes.
  populateDrillingCopySelect();
}

// Mostra/esconde "Item comprado" — só faz sentido com Origem="Comprado".
// Mesmo padrão de updateEdgeBandingUI (mostrar só o que se aplica).
// Migration 129: "Kit de suporte" e "Quantidade de kits" moram no mesmo
// wrap condicional — item secundário só faz sentido junto com o principal.
function updateOriginUI() {
  const origem = document.getElementById('component-origin').value;
  const wrap = document.getElementById('component-purchased-item-wrap');
  if (wrap) wrap.style.display = origem === 'comprado' ? '' : 'none';
  const supportWrap = document.getElementById('component-support-purchased-item-wrap');
  if (supportWrap) supportWrap.style.display = origem === 'comprado' ? '' : 'none';
  const supportQtyWrap = document.getElementById('component-support-purchased-item-qty-wrap');
  if (supportQtyWrap) supportQtyWrap.style.display = origem === 'comprado' ? '' : 'none';
}

const POSITION_ROLE_LABELS = {
  left: 'Lateral esq.', right: 'Lateral dir.', top: 'Topo', bottom: 'Base',
  back: 'Fundo', front: 'Frente/porta', shelf: 'Prateleira', drawer: 'Gaveta',
  // 'drawer_side' (migration 118) = a lateral do CASCO deitada pra trás: o
  // lado longo corre na profundidade, as bordas laminadas ficam em cima e
  // embaixo. Só o DESENHO muda — o componente (Flatbord 2C) é o mesmo.
  drawer_side: 'Lateral de gaveta',
  leg: 'Pé', handle: 'Puxador', baseboard: 'Rodapé',
  countertop: 'Tampo', free: 'Peça livre', other: 'Outro/interno'
};

// Origem do componente (migration 034) — decide se a peça vira linha na
// "Lista de peças" (corte) ou na "Lista de compra" na aba Pedidos do admin.
const ORIGIN_LABELS = { fabricacao: 'Fabricação', comprado: 'Comprado' };

// Fita de borda (migration 088). A coluna mostra a RECEITA, não a fórmula:
// "2 comprimentos" diz o que a fábrica faz; "2*(w+h)/1000" só diz uma conta.
// Componente ainda na fórmula aparece marcado, porque é o que falta migrar.
const EDGE_BANDING_LABELS = { 0: 'Sem fita', 1: '1 comprimento', 2: '2 comprimentos', 4: '4 lados' };

function edgeBandingLabel(c) {
  if (c.edge_banding == null) {
    return '<span class="hint" title="Ainda calcula por fórmula — abra e escolha 0, 2 ou 4">'
      + `fórmula: <code>${c.edge_band_linear_m_formula}</code></span>`;
  }
  return EDGE_BANDING_LABELS[c.edge_banding] || String(c.edge_banding);
}

// Metragem que a receita produz para as medidas da prévia — é o "sem eu
// precisar ficar colocando manualmente". A conta é a MESMA do preço
// (Pricing.edgeBandMeters); mostrar um número calculado aqui por fora seria
// convidar os dois a divergirem.
function updateEdgeBandingUI() {
  const sel = document.getElementById('component-edge-banding');
  if (!sel) return;
  const wrap = document.getElementById('component-edge-formula-wrap');
  const campo = document.getElementById('component-edge-formula');
  const hint = document.getElementById('component-edge-hint');
  const receita = sel.value === '' ? null : Number(sel.value);

  // Escolhida a receita, a fórmula sai da frente e deixa de ser obrigatória:
  // ela continua gravada (pra voltar atrás), só não manda mais em nada.
  if (wrap) wrap.style.display = receita == null ? '' : 'none';
  if (campo) campo.required = receita == null;
  // Resumo no cabeçalho da seção: com tudo recolhido, é o que diz o que está
  // escolhido sem precisar abrir.
  const sub = document.getElementById('component-edge-sub');
  if (sub) sub.textContent = receita == null ? 'pela fórmula antiga' : (EDGE_BANDING_LABELS[receita] || '');
  if (!hint) return;

  if (receita == null) {
    hint.innerHTML = 'A metragem vem da fórmula ao lado. Escolha 0, 2 ou 4 para o sistema calcular sozinho.';
    return;
  }
  const num = (id) => parseFloat(document.getElementById(id).value) || 0;
  const piece = {
    quantity: 1,
    width_formula: document.getElementById('component-width-formula').value.trim() || 'W',
    height_formula: document.getElementById('component-height-formula').value.trim() || 'H',
    depth_formula: document.getElementById('component-depth-formula').value.trim() || 'D',
    area_m2_formula: '0',
    edge_banding: receita,
    positioning: (componentTypesCache.find(
      (t) => t.id === document.getElementById('component-type').value) || {}).positioning || null
  };
  try {
    const dims = Pricing.calculatePiece(piece, { W: num('component-preview-width'), H: num('component-preview-height'), D: num('component-preview-depth') });
    const m = Pricing.pecaNaMaquina(dims.width_mm, dims.height_mm, dims.depth_mm, piece.positioning);
    hint.innerHTML = `Nas medidas da prévia: comprimento <strong>${Math.round(m.comprimento)}</strong> × `
      + `largura <strong>${Math.round(m.largura)}</strong> mm (espessura ${Math.round(m.espessura)}) → `
      + `<strong>${dims.edge_band_m.toFixed(2)} m</strong> de fita.`
      + (receita === 4 ? '' : receita === 2
        ? ' Os dois lados que medem o comprimento.'
        : receita === 1
          ? ' Só um dos lados que mede o comprimento (migration 145, ex: Flatbord 1C).'
          : ' A borda sem fita mostra o miolo da chapa no 3D.');
  } catch (e) {
    hint.textContent = 'Ajuste as fórmulas de L/A/P acima para ver a metragem.';
  }
}

// A lista de componentes agora é a ÁRVORE da coluna da esquerda (migration
// 089), não mais a tabela larga que abria a tela. A tabela mostrava 11
// colunas de fórmula que ninguém lê de relance e empurrava o formulário pra
// baixo da dobra; quem precisa do detalhe abre o componente.
// O desenho em si mora em erp/js/adm/23-pastas-componentes.js.
function renderComponents() {
  if (typeof renderComponentTree === 'function') renderComponentTree();
}

// Mostra bem claro se o formulário está criando um componente novo ou
// editando um já existente — antes disso não tinha NENHUM aviso visual, só
// um campo escondido (component-id) guardando o id do último "Editar"
// clicado, então dava pra sair preenchendo um componente "novo" sem perceber
// que ainda estava em modo edição, e o Salvar sobrescrevia o antigo em vez
// de criar um novo.
function setComponentFormMode(component) {
  const submitBtn = document.getElementById('component-submit-btn');
  const titulo = document.getElementById('component-form-title');
  const sub = document.getElementById('component-form-sub');
  const cancelar = document.getElementById('component-cancel-edit-btn');
  if (component) {
    if (titulo) titulo.firstChild.nodeValue = component.reference + ' ';
    if (sub) {
      sub.textContent = 'Editando — "Salvar" ATUALIZA este componente em todos os módulos que o usam.';
    }
    submitBtn.textContent = 'Salvar alterações';
  } else {
    if (titulo) titulo.firstChild.nodeValue = 'Novo componente ';
    if (sub) sub.textContent = 'Preencha e salve — ele fica disponível pra todos os módulos.';
    submitBtn.textContent = 'Salvar novo componente';
  }
  if (cancelar) cancelar.textContent = component ? 'Cancelar edição' : 'Limpar';
  // A árvore marca em destaque o componente aberto — sem isso, com o
  // formulário fora da tabela, não dá pra saber qual peça está na tela.
  if (typeof renderComponentTree === 'function') renderComponentTree();
}

// Limpa o formulário por completo e volta pro modo "novo componente" — usado
// tanto pelo botão "+ Novo componente" / "Cancelar edição" quanto depois de
// salvar com sucesso.
function resetComponentForm() {
  document.getElementById('component-form').reset();
  document.getElementById('component-id').value = '';
  document.getElementById('component-quantity').value = 1;
  document.getElementById('component-preview-width').value = 800;
  document.getElementById('component-preview-height').value = 2000;
  document.getElementById('component-preview-depth').value = 560;
  document.getElementById('component-origin').value = 'fabricacao';
  const selPurchasedItem = document.getElementById('component-purchased-item');
  if (selPurchasedItem) selPurchasedItem.value = '';
  const selSupportPurchasedItem = document.getElementById('component-support-purchased-item');
  if (selSupportPurchasedItem) selSupportPurchasedItem.value = '';
  const supportQty = document.getElementById('component-support-purchased-item-qty');
  if (supportQty) supportQty.value = 1;
  updateOriginUI();
  // Padrão pedido pelo usuário: um componente novo nasce como "Peça livre"
  // (não "Lateral esquerda", que era só a 1ª opção da lista e acabava
  // "escolhida" por padrão sem ninguém ter escolhido de verdade).
  document.getElementById('component-position-role').value = 'free';
  document.getElementById('component-veio').value = 'livre'; // mesmo default da coluna no banco
  document.getElementById('component-shape-type').value = 'box'; // migration 062
  document.getElementById('component-tilt-angle').value = 0; // migration 065
  // Fita (migration 088): componente NOVO já nasce na receita, não na
  // fórmula — a fórmula existe pra não quebrar o que já estava cadastrado,
  // não pra continuar sendo o caminho padrão. "Sem fita" é o único default
  // que não inventa custo que ninguém pediu; 2 ou 4 é escolha consciente.
  document.getElementById('component-edge-banding').value = '0';
  document.getElementById('component-edge-formula').value = '0';
  // Nasce na pasta que está selecionada na árvore (migration 089): é o que
  // se espera de "clicar na pasta e criar dentro dela".
  const selPasta = document.getElementById('component-folder');
  if (selPasta) {
    selPasta.value = (typeof selectedComponentFolderId !== 'undefined' && selectedComponentFolderId) || '';
  }
  updateEdgeBandingUI();
  updateComponent3DPreview();
  // Furação padrão (migration 038) — formulário novo nasce sem furos.
  componentDrillingsDraft = [];
  renderComponentDrillingRows();
  populateDrillingCopySelect();
  setComponentFormMode(null);
}

document.getElementById('component-new-btn').addEventListener('click', () => {
  resetComponentForm();
  document.getElementById('component-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

document.getElementById('component-cancel-edit-btn').addEventListener('click', () => {
  resetComponentForm();
});

window.editComponent = function (id) {
  const c = componentsCache.find((x) => x.id === id);
  if (!c) return;
  document.getElementById('component-id').value = c.id;
  document.getElementById('component-type').value = c.type_id || '';
  document.getElementById('component-reference').value = c.reference;
  document.getElementById('component-quantity').value = c.quantity;
  document.getElementById('component-width-formula').value = c.width_formula;
  document.getElementById('component-height-formula').value = c.height_formula;
  document.getElementById('component-depth-formula').value = c.depth_formula;
  document.getElementById('component-area-formula').value = c.area_m2_formula;
  document.getElementById('component-edge-formula').value = c.edge_band_linear_m_formula;
  document.getElementById('component-edge-banding').value = c.edge_banding == null ? '' : String(c.edge_banding);
  document.getElementById('component-labor-type').value = c.labor_type_id || '';
  document.getElementById('component-position-role').value = c.position_role || 'other';
  document.getElementById('component-veio').value = c.veio || 'livre';
  document.getElementById('component-shape-type').value = c.shape_type || 'box'; // migration 062
  document.getElementById('component-tilt-angle').value = c.tilt_angle_deg || 0; // migration 065
  document.getElementById('component-rotation-y').value = c.rotation_y_deg || 0; // migration 067
  document.getElementById('component-hinge-side').value = c.hinge_side || 'none';
  document.getElementById('component-shelf-support').checked = !!c.drill_shelf_support;
  document.getElementById('component-notes').value = c.notes || '';
  document.getElementById('component-origin').value = c.origin || 'fabricacao';
  const selPurchasedItem = document.getElementById('component-purchased-item');
  if (selPurchasedItem) selPurchasedItem.value = c.purchased_item_id || '';
  const selSupportPurchasedItem = document.getElementById('component-support-purchased-item');
  if (selSupportPurchasedItem) selSupportPurchasedItem.value = c.support_purchased_item_id || '';
  const supportQty = document.getElementById('component-support-purchased-item-qty');
  if (supportQty) supportQty.value = c.support_purchased_item_qty != null ? c.support_purchased_item_qty : 1;
  updateOriginUI();
  document.getElementById('component-folder').value = c.folder_id || ''; // migration 089
  // Furação padrão (migration 038) — carrega os furos já salvos deste
  // componente pro rascunho editável (async, preenche quando chegar).
  loadComponentDrillingsIntoForm(c.id);
  setComponentFormMode(c);
  // Fita (088) antes das prévias: é ela que decide o que o 3D desenha na
  // borda e se o campo de fórmula fica visível.
  updateEdgeBandingUI();
  updateComponentPreview();
  updateComponent3DPreview();
  document.getElementById('component-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
};

window.deleteComponent = async function (id) {
  if (!confirm('Excluir este componente? Ele será removido de todos os módulos que o usam.')) return;
  const { error } = await supabaseClient.from('components').delete().eq('id', id);
  if (error) { showError('components-error', error); return; }
  // Se o componente excluído era o que estava sendo editado no formulário,
  // volta pro modo "novo" — senão o form ficaria com o id de um componente
  // que não existe mais, e o próximo "Salvar" tentaria um upsert órfão.
  if (document.getElementById('component-id').value === id) resetComponentForm();
  loadComponents();
};

document.getElementById('component-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError('components-error');

  const payload = {
    type_id: document.getElementById('component-type').value || null,
    reference: document.getElementById('component-reference').value.trim(),
    quantity: parseInt(document.getElementById('component-quantity').value, 10),
    width_formula: document.getElementById('component-width-formula').value.trim(),
    height_formula: document.getElementById('component-height-formula').value.trim(),
    depth_formula: document.getElementById('component-depth-formula').value.trim(),
    area_m2_formula: document.getElementById('component-area-formula').value.trim(),
    edge_band_linear_m_formula: document.getElementById('component-edge-formula').value.trim(),
    // Migration 088 — '' grava NULL, que é "continua na fórmula". Não é o
    // mesmo que 0 (sem fita): ver o cabeçalho da migration.
    edge_banding: document.getElementById('component-edge-banding').value === ''
      ? null : Number(document.getElementById('component-edge-banding').value),
    labor_type_id: document.getElementById('component-labor-type').value || null,
    position_role: document.getElementById('component-position-role').value || 'other',
    // Veio CADASTRADO (migration 086) — resolveGrainRotate no viewer3d.js dá
    // pra ele prioridade sobre QUALQUER outra regra (formato/posição). Até
    // 2026-08-23 não existia campo nenhum aqui pra editar isso: a coluna só
    // era gravada em migração/import, então toda peça nascia 'livre' pra
    // sempre. Motivo do campo: porta/frente têm veio 'vertical' cadastrado
    // "e não giram nunca" (regra já documentada em viewer3d.js) — mas isso só
    // funciona se existir uma FORMA de cadastrar. Ver comentário grande no
    // Matt, 2026-08-23 (frente de gaveta com veio horizontal, deveria ser
    // vertical) em erp/js/adm/telas/components.js.
    veio: document.getElementById('component-veio').value || 'livre',
    shape_type: document.getElementById('component-shape-type').value || 'box', // migration 062
    tilt_angle_deg: parseFloat(document.getElementById('component-tilt-angle').value) || 0, // migration 065
    rotation_y_deg: parseInt(document.getElementById('component-rotation-y').value, 10) || 0, // migration 067
    hinge_side: document.getElementById('component-hinge-side').value || 'none',
    drill_shelf_support: document.getElementById('component-shelf-support').checked,
    notes: document.getElementById('component-notes').value.trim() || null,
    origin: document.getElementById('component-origin').value || 'fabricacao',
    // Item comprado (migration 119) — de onde sai o PREÇO quando origin é
    // 'comprado' (ver js/pricing.js calculateLeafPiece: purchase_price do
    // item ganha do labor_type_id quando existe). '' grava NULL — sem
    // vínculo, o preço continua saindo da mão de obra antiga.
    purchased_item_id: (document.getElementById('component-purchased-item') || {}).value || null,
    // Kit de suporte (migration 129) — item comprado SECUNDÁRIO que "vai
    // junto" com o principal (ex: kit suporte de um cabide). '' grava NULL —
    // sem vínculo, comportamento de qualquer peça comprada comum.
    support_purchased_item_id: (document.getElementById('component-support-purchased-item') || {}).value || null,
    support_purchased_item_qty: parseFloat(
      (document.getElementById('component-support-purchased-item-qty') || {}).value
    ) || 1,
    // Pasta (migration 089) — só arrumação, não afeta preço/furação/3D.
    folder_id: document.getElementById('component-folder').value || null
  };

  // Valida as fórmulas antes de salvar, usando dimensões de teste.
  try {
    Pricing.calculatePiece(payload, { W: 800, H: 2000, D: 560 });
  } catch (err) {
    showError('components-error', err);
    return;
  }

  const id = document.getElementById('component-id').value || undefined;
  if (id) payload.id = id;
  // .select().single() pra receber o id de volta — um componente NOVO precisa
  // do id gerado pra salvar a furação padrão (component_drillings) junto.
  const { data: savedComponent, error } = await supabaseClient.from('components').upsert(payload).select('id').single();
  if (error) { showError('components-error', error); return; }

  // FURAÇÃO PADRÃO (migration 038) — salva o rascunho da tabelinha do
  // formulário: apaga tudo do componente e re-insere (mesma estratégia
  // simples de outras listas filhas do admin; a tabela é pequena).
  const drillErr = await saveComponentDrillings(savedComponent.id);
  if (drillErr) { showError('component-drilling-error', drillErr); return; }

  resetComponentForm();
  loadComponents();
});

// ---------- FURAÇÃO PADRÃO DO COMPONENTE (migration 038) ----------
// Rascunho em memória, renderizado como linhas de inputs na tabelinha do
// formulário — só persiste quando o próprio componente é salvo.
let componentDrillingsDraft = [];

const DRILLING_FACE_OPTIONS = [
  ['face', 'Face (por cima)'],
  ['verso', 'Verso (por baixo)'],
  ['borda_esq', 'Borda esquerda (x=0)'],
  ['borda_dir', 'Borda direita (x=C)'],
  ['borda_sup', 'Borda de cima (y=0)'],
  ['borda_inf', 'Borda de baixo (y=L)']
];

function renderComponentDrillingRows() {
  const tbody = document.getElementById('component-drilling-tbody');
  tbody.innerHTML = '';
  if (componentDrillingsDraft.length === 0) {
    tbody.innerHTML = '<tr><td colspan="15" class="hint">Nenhum furo padrão cadastrado nesta peça.</td></tr>';
    updateComponentDrillingPreview();
    renderFuracaoAvisos();
    return;
  }
  componentDrillingsDraft.forEach((row, idx) => {
    const tr = document.createElement('tr');
    const faceOptions = DRILLING_FACE_OPTIONS
      .map(([v, label]) => `<option value="${v}" ${row.face === v ? 'selected' : ''}>${label}</option>`).join('');
    // Contra-furo (migrations 043 + 054): vale em QUALQUER sentido, mas o
    // significado muda — em furo de BORDA propaga um furo de FACE na peça
    // que a borda encosta (043); em furo de FACE/VERSO propaga um furo de
    // BORDA na peça em pé apoiada naquela face (054, ex: lateral sobre o
    // topcover). Os campos "Copo" (counter_face_*) só existem no caso de
    // FACE: tambor minifix na face da peça apoiada, a "dist." da borda.
    const isEdgeRow = /^borda_/.test(row.face || '');
    const counterTitle = isEdgeRow
      ? 'Furo de FACE gerado na peça que esta borda encosta (ex: lateral)'
      : 'Furo de BORDA gerado na peça em pé apoiada nesta face (ex: cavilha Ø8 / canal do bolt minifix)';
    const camHint = isEdgeRow
      ? ' style="width:55px;background:#fdf3e6;" title="Copo só tem efeito em furo de FACE — é o tambor minifix gerado na peça em pé apoiada"'
      : ' style="width:55px;" title="Tambor minifix gerado na FACE da peça apoiada, a Dist. mm da borda que encostou (ex: Ø12 × 13, dist. 34) — deixe em branco pra propagar só o furo de borda (cavilha)"';
    tr.innerHTML = `
      <td><select data-field="face">${faceOptions}</select></td>
      <td><input data-field="x_formula" value="${row.x_formula || ''}" style="width:70px;" /></td>
      <td><input data-field="y_formula" value="${row.y_formula || ''}" style="width:70px;" /></td>
      <td><input data-field="diameter_mm" type="number" step="0.1" min="0.5" value="${row.diameter_mm ?? ''}" style="width:60px;" /></td>
      <td><input data-field="depth_formula" value="${row.depth_formula || ''}" style="width:60px;" /></td>
      <td><input data-field="repeat_count_formula" value="${row.repeat_count_formula || '1'}" style="width:50px;" /></td>
      <td><input data-field="repeat_dx_mm" type="number" step="0.1" value="${row.repeat_dx_mm ?? 0}" style="width:60px;" /></td>
      <td><input data-field="repeat_dy_mm" type="number" step="0.1" value="${row.repeat_dy_mm ?? 0}" style="width:60px;" /></td>
      <td><input data-field="counter_diameter_mm" type="number" step="0.1" min="0.5" value="${row.counter_diameter_mm ?? ''}" style="width:55px;" title="${counterTitle}" /></td>
      <td><input data-field="counter_depth_mm" type="number" step="0.1" min="0.5" value="${row.counter_depth_mm ?? ''}" style="width:55px;" title="${counterTitle}" /></td>
      <td><input data-field="counter_face_diameter_mm" type="number" step="0.1" min="0.5" value="${row.counter_face_diameter_mm ?? ''}"${camHint} /></td>
      <td><input data-field="counter_face_depth_mm" type="number" step="0.1" min="0.5" value="${row.counter_face_depth_mm ?? ''}"${camHint} /></td>
      <td><input data-field="counter_face_offset_mm" type="number" step="0.1" min="0.5" value="${row.counter_face_offset_mm ?? ''}"${camHint} /></td>
      <td><input data-field="notes" value="${(row.notes || '').replace(/"/g, '&quot;')}" style="width:110px;" /></td>
      <td><button type="button" class="secondary drilling-row-remove" style="margin-top:0;">✕</button></td>
    `;
    tr.querySelectorAll('[data-field]').forEach((el) => {
      el.addEventListener('input', () => { componentDrillingsDraft[idx][el.dataset.field] = el.value; updateComponentDrillingPreview(); renderFuracaoAvisos(); });
      el.addEventListener('change', () => {
        componentDrillingsDraft[idx][el.dataset.field] = el.value;
        // trocar o Sentido re-renderiza pra habilitar/desabilitar o contra-furo
        if (el.dataset.field === 'face') { renderComponentDrillingRows(); return; }
        updateComponentDrillingPreview();
        renderFuracaoAvisos();
      });
    });
    tr.querySelector('.drilling-row-remove').addEventListener('click', () => {
      componentDrillingsDraft.splice(idx, 1);
      renderComponentDrillingRows();
    });
    tbody.appendChild(tr);
  });
  updateComponentDrillingPreview();
  renderFuracaoAvisos();
  const sub = document.getElementById('component-drilling-sub');
  if (sub) {
    sub.textContent = componentDrillingsDraft.length
      ? componentDrillingsDraft.length + ' furo(s)' : 'nenhum furo';
  }
}

// ---------- CONFERÊNCIA DA FURAÇÃO ----------
// Regra do Matt (2026-08-11): "a princípio não existe minifix sem contra-furo".
//
// Ela existe porque os furos vêm em PAR: o Ø8 que entra na borda desta peça só
// serve se a peça que encosta tiver o furo correspondente, e é o contra-furo
// que faz o gerador criar esse par (migrations 043/054). Furo de borda sem
// contra não dá erro em lugar nenhum — a peça sai cortada, furada e errada, e
// só a montagem descobre.
//
// As duas checagens abaixo são exatamente as que pegaram, no banco dele, os
// três defeitos que ninguém tinha visto:
//   (a) borda sem contra   -> 'Bottom front color' (4 de 4) e 'stretcher em pe' (2 de 4)
//   (b) profundidade solta -> o 4º furo Ø12 com 10 em vez de 13, em CINCO peças
//
// São AVISOS, não travas: existe caso legítimo (gaveta cavilhada e colada, furo
// de acabamento). Travar o salvamento em cima de uma regra que tem exceção só
// ensina a ignorar o aviso.
function verificarFuracaoDraft() {
  const avisos = [];
  const linhas = componentDrillingsDraft || [];

  linhas.forEach((r, i) => {
    const ehBorda = String(r.face || '').startsWith('borda');
    const temContra = r.counter_diameter_mm !== null && r.counter_diameter_mm !== undefined
      && r.counter_diameter_mm !== '' && Number(r.counter_diameter_mm) > 0;
    if (ehBorda && !temContra) {
      avisos.push({
        idx: i,
        msg: `Furo ${i + 1} (${r.face}, Ø${r.diameter_mm || '?'}): furo de borda <strong>sem contra-furo</strong> — `
          + 'a peça que encosta nesta borda não vai receber furo nenhum. Se for minifix ou cavilha, falta preencher Contra Ø/prof.'
      });
    }
  });

  // (b) Mesmo Ø, mesma face, profundidades diferentes. Um furo Ø12 de 13 e
  // outro Ø12 de 10 na mesma peça é quase sempre digitação — a ferragem é a
  // mesma nos dois.
  const grupos = {};
  linhas.forEach((r, i) => {
    const k = r.face + '|' + r.diameter_mm;
    (grupos[k] = grupos[k] || []).push({ i, prof: String(r.depth_formula || '').trim() });
  });
  Object.keys(grupos).forEach((k) => {
    const g = grupos[k];
    const profs = [...new Set(g.map((x) => x.prof))];
    if (g.length > 1 && profs.length > 1) {
      const partes = k.split('|');
      // Aponta a MINORIA: com três furos em 13 e um em 10, o suspeito é o 10.
      const contagem = {};
      g.forEach((x) => { contagem[x.prof] = (contagem[x.prof] || 0) + 1; });
      const raro = profs.slice().sort((a, b) => contagem[a] - contagem[b])[0];
      const quais = g.filter((x) => x.prof === raro).map((x) => x.i + 1).join(', ');
      avisos.push({
        idx: g.find((x) => x.prof === raro).i,
        msg: `Em ${partes[0]} Ø${partes[1]}: profundidades diferentes (${profs.join(' e ')}) para a mesma ferragem. `
          + `O furo ${quais} está com <strong>${raro}</strong> e os outros com ${profs.filter((p) => p !== raro).join('/')}.`
      });
    }
  });

  return avisos;
}

function renderFuracaoAvisos() {
  const el = document.getElementById('component-drilling-avisos');
  if (!el) return;
  const avisos = verificarFuracaoDraft();

  // Marca a linha culpada na tabela — o aviso escrito não adianta se você não
  // sabe qual das 12 linhas ele está falando.
  const trs = document.querySelectorAll('#component-drilling-tbody tr');
  trs.forEach((tr) => { tr.style.background = ''; });
  avisos.forEach((a) => { if (trs[a.idx]) trs[a.idx].style.background = '#fdecea'; });

  if (!avisos.length) { el.innerHTML = ''; return; }
  el.innerHTML = '<div style="margin:8px 0;padding:8px 10px;border:1px solid #d8433c;'
    + 'border-radius:6px;background:#fdecea;font-size:11.5px;line-height:1.5">'
    + '<strong style="color:#98221c">Conferir antes de mandar pra máquina</strong>'
    + avisos.map((a) => '<div style="margin-top:4px;color:#7d2b26">• ' + a.msg + '</div>').join('')
    + '</div>';
}

// ---------- VISUALIZADOR 2D DA FURAÇÃO PADRÃO ----------
// Desenha a peça DEITADA no plano da máquina (mesma convenção do .ban:
// X = 0..C da esquerda, Y = 0..L da borda de cima), com as dimensões de
// teste da Prévia, e plota cada furo do rascunho: furo de face = círculo
// cheio, verso = círculo tracejado, furo de borda = retângulo entrando pela
// borda (comprimento = profundidade). Furo fora da chapa fica VERMELHO —
// mesmo critério do gerador (drilling.js/addHole), que descartaria o furo.
function updateComponentDrillingPreview() {
  const container = document.getElementById('component-drilling-preview');
  const metaEl = document.getElementById('component-drilling-preview-meta');
  if (!container || !metaEl) return;
  container.innerHTML = '';
  metaEl.textContent = '';
  if (typeof Drilling === 'undefined' || !Drilling._internals) return;

  const W = parseFloat(document.getElementById('component-preview-width').value) || 0;
  const H = parseFloat(document.getElementById('component-preview-height').value) || 0;
  const D = parseFloat(document.getElementById('component-preview-depth').value) || 0;
  const piece = {
    quantity: 1,
    width_formula: document.getElementById('component-width-formula').value.trim() || 'W',
    height_formula: document.getElementById('component-height-formula').value.trim() || 'H',
    depth_formula: document.getElementById('component-depth-formula').value.trim() || 'D',
    area_m2_formula: 'w*h/1000000',
    edge_band_linear_m_formula: '0'
  };
  let dims;
  try {
    dims = Pricing.calculatePiece(piece, { W, H, D });
  } catch (e) {
    metaEl.textContent = 'Fórmulas de L/A/P da peça inválidas — corrija acima pra ver o desenho.';
    return;
  }
  const type = componentTypesCache.find((t) => t.id === document.getElementById('component-type').value);
  const positioning = type ? type.positioning : null;
  const t = Drilling._internals.splitThickness(dims.width_mm, dims.height_mm, dims.depth_mm, positioning);
  const m = Drilling._internals.machineDims(t);
  if (!(m.C > 0) || !(m.L > 0)) return;
  metaEl.textContent = 'Plano da máquina: C ' + Math.round(m.C) + ' × L ' + Math.round(m.L)
    + ' mm, espessura E ' + Math.round(m.E) + ' mm — X da esquerda, Y da borda de cima.';

  // avalia os furos (mesma lógica de collectStandardHoles em drilling.js —
  // usa resolveDrillingHoleXY pra aplicar a MESMA rotação/correção de
  // sentido que o gerador real aplica quando a peça gira pro corte).
  // C/L/E = plano de CADASTRO (C = faceA, L = faceB), estáveis mesmo quando
  // a peça gira; W/H = dimensões reais da peça (correção 2026-07-14, junto
  // com a rotação rígida do padrão em drilling.js/localToMachine).
  const vars = { C: t.faceA, L: t.faceB, E: t.thickness, W: dims.width_mm || 0, H: dims.height_mm || 0 };
  const holes = [];
  const badRows = [];
  componentDrillingsDraft.forEach((row, i) => {
    let x, y, depth, count;
    try {
      x = Pricing.evalFormula(row.x_formula || '0', vars);
      y = Pricing.evalFormula(row.y_formula || '0', vars);
      depth = Pricing.evalFormula(row.depth_formula || '0', vars);
      count = Math.max(Math.floor(Pricing.evalFormula(row.repeat_count_formula || '1', vars)), 0);
    } catch (e) { badRows.push(i + 1); return; }
    const dia = parseFloat(row.diameter_mm) || 0;
    for (let k = 0; k < count; k++) {
      const rawX = x + k * (parseFloat(row.repeat_dx_mm) || 0);
      const rawY = y + k * (parseFloat(row.repeat_dy_mm) || 0);
      const resolved = Drilling._internals.resolveDrillingHoleXY(t, row, rawX, rawY) || { face: row.face || 'face', x: rawX, y: rawY };
      const outside = resolved.x < -0.01 || resolved.x > m.C + 0.01 || resolved.y < -0.01 || resolved.y > m.L + 0.01 || !(dia > 0) || !(depth > 0);
      holes.push({ face: resolved.face, x: resolved.x, y: resolved.y, dia, depth, outside });
    }
  });
  if (badRows.length) {
    metaEl.textContent += ' ATENÇÃO: fórmula inválida na(s) linha(s) ' + badRows.join(', ') + ' — furo(s) não desenhado(s).';
  }

  container.innerHTML = buildDrillingPlaneSvg(m, holes);
}

// ---------- VISUALIZADOR 3D DO COMPONENTE SOZINHO (migration 088) ----------
// Complemento do 2D acima, não substituto: aquele é a peça DEITADA na
// furadeira (plano da máquina), este é a peça EM PÉ, como ela fica dentro do
// móvel. É aqui que dá pra conferir, sem montar módulo nenhum, se a fita caiu
// nas bordas certas e como o miolo da chapa aparece nas outras.
//
// Cena PRÓPRIA e não o Viewer3D singleton: aquele está amarrado a um
// container só (a aba "Imagem 3D do módulo" usa ele) e inicializar de novo
// aqui roubaria a cena dela. O que NÃO se duplica é a regra de material —
// vem de Viewer3D.materialsForPart, a mesma do 3D principal.
let component3D = null;

function ensureComponent3D() {
  const st = document.getElementById('component-3d-preview');
  if (!st || typeof THREE === 'undefined' || !THREE.OrbitControls) return null;
  if (component3D && component3D.st === st) return component3D;

  const t = { st: st };
  t.renderer = new THREE.WebGLRenderer({ antialias: true });
  t.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  t.renderer.setSize(st.clientWidth || 640, st.clientHeight || 320);
  st.appendChild(t.renderer.domElement);

  t.scene = new THREE.Scene();
  t.scene.background = new THREE.Color(0xffffff); // fundo branco, pedido do usuário
  t.camera = new THREE.PerspectiveCamera(38, (st.clientWidth || 640) / (st.clientHeight || 320), 0.01, 60);
  t.controls = new THREE.OrbitControls(t.camera, t.renderer.domElement);
  t.controls.enableDamping = true;
  t.controls.dampingFactor = 0.09;

  t.scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d2c8, 1.0));
  const k = new THREE.DirectionalLight(0xffffff, 0.75); k.position.set(3, 5, 4); t.scene.add(k);
  const f = new THREE.DirectionalLight(0xffffff, 0.30); f.position.set(-4, 2, -3); t.scene.add(f);

  t.grupo = new THREE.Group();
  t.scene.add(t.grupo);
  component3D = t;

  (function animate() {
    if (!document.body.contains(st)) { t.renderer.dispose(); component3D = null; return; }
    requestAnimationFrame(animate);
    const w = st.clientWidth, h = st.clientHeight;
    if (w && h && (t._w !== w || t._h !== h)) {
      t._w = w; t._h = h;
      t.camera.aspect = w / h; t.camera.updateProjectionMatrix();
      t.renderer.setSize(w, h);
    }
    t.controls.update();
    t.renderer.render(t.scene, t.camera);
  })();
  return t;
}

function updateComponent3DPreview() {
  const metaEl = document.getElementById('component-3d-meta');
  const legEl = document.getElementById('component-3d-legend');
  if (!metaEl) return;
  const t = ensureComponent3D();
  if (!t) { metaEl.textContent = '3D indisponível neste navegador.'; return; }

  while (t.grupo.children.length) {
    const o = t.grupo.children.pop();
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
  }

  const num = (id) => parseFloat(document.getElementById(id).value) || 0;
  const tipo = componentTypesCache.find((x) => x.id === document.getElementById('component-type').value);
  const bandingRaw = document.getElementById('component-edge-banding').value;
  const piece = {
    quantity: 1,
    width_formula: document.getElementById('component-width-formula').value.trim() || 'W',
    height_formula: document.getElementById('component-height-formula').value.trim() || 'H',
    depth_formula: document.getElementById('component-depth-formula').value.trim() || 'D',
    area_m2_formula: '0',
    edge_band_linear_m_formula: '0',
    edge_banding: bandingRaw === '' ? null : Number(bandingRaw),
    positioning: (tipo || {}).positioning || null
  };

  let dims;
  try {
    dims = Pricing.calculatePiece(piece, { W: num('component-preview-width'), H: num('component-preview-height'), D: num('component-preview-depth') });
  } catch (e) {
    metaEl.textContent = 'Fórmulas de L/A/P inválidas — corrija acima pra ver a peça.';
    return;
  }
  const W = dims.width_mm, H = dims.height_mm, D = dims.depth_mm;
  if (!(W > 0 && H > 0 && D > 0)) { metaEl.textContent = 'A peça resolveu para medida zero.'; return; }

  const cor = (colorsCache || []).find((c) => c.id === document.getElementById('component-preview-color').value) || null;
  const part = {
    width_mm: W, height_mm: H, depth_mm: D,
    positioning: piece.positioning, edge_banding: piece.edge_banding, color: cor
  };

  const geo = new THREE.BoxGeometry(W / 1000, H / 1000, D / 1000);
  let mat = null;
  try {
    mat = Viewer3D.materialsForPart ? Viewer3D.materialsForPart(geo, part, cor, false) : null;
  } catch (e) { mat = null; }
  // Fallback (peça sem receita de fita): passa a face grande em mm pro
  // material, senão a textura estica no tamanho da peça em vez de respeitar a
  // escala da chapa (ver loadTexture no viewer3d.js).
  const faceMm = [W, H, D].sort((a, b) => b - a);
  const mesh = new THREE.Mesh(geo, mat || (Viewer3D.materialForColor
    ? Viewer3D.materialForColor(cor, false, faceMm[0], faceMm[1])
    : new THREE.MeshStandardMaterial({ color: 0xcccccc })));
  t.grupo.add(mesh);
  // Contorno leve: sem ele uma peça branca sobre fundo branco some.
  t.grupo.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color: 0x3a3a3a, transparent: true, opacity: 0.35 })));

  // Enquadramento pela esfera que contém a peça — mesma conta do viewer3d.
  const w = W / 1000, h = H / 1000, d = D / 1000;
  const r = Math.sqrt(w * w + h * h + d * d) / 2;
  const dist = r / Math.sin((t.camera.fov * Math.PI / 180) / 2) * 1.25;
  t.camera.position.set(dist * 0.55, dist * 0.42, dist * 0.78);
  t.controls.target.set(0, 0, 0);
  t.controls.update();

  const m = Pricing.pecaNaMaquina(W, H, D, piece.positioning);
  metaEl.textContent = 'Peça em pé: ' + Math.round(W) + ' × ' + Math.round(H) + ' × ' + Math.round(D)
    + ' mm — na máquina é C ' + Math.round(m.comprimento) + ' × L ' + Math.round(m.largura)
    + ', espessura ' + Math.round(m.espessura) + '.';

  if (piece.edge_banding == null) {
    legEl.innerHTML = 'Este componente ainda calcula fita por fórmula, então o 3D desenha a peça '
      + 'inteira na cor. Escolha 0, 1, 2 ou 4 em "Onde leva fita" para ver as bordas.';
  } else {
    const sub = (cor && cor.substrato) || 'mdp';
    const nomeSub = { mdp: 'MDP', mdf: 'MDF', plywood: 'Plywood' }[sub] || sub;
    // 2026-08-28: faltava o ramo edge_banding===1 (Flatbord 1C, migration
    // 145) — caía no "else" de "Sem fita" (a peça na verdade tem 1 lado
    // fitado, só o texto/3D é que não sabiam disso; ver makeBoxMaterials
    // em viewer3d.js pro fix do desenho em si).
    if (piece.edge_banding === 4) {
      legEl.innerHTML = 'Fita nos 4 lados — nenhuma borda mostra o miolo.';
    } else if (piece.edge_banding === 2) {
      legEl.innerHTML = 'Fita nos dois lados que medem o comprimento (' + Math.round(m.comprimento) + ' mm). '
        + 'Os dois lados de ' + Math.round(m.largura) + ' mm mostram o miolo (' + nomeSub + ').';
    } else if (piece.edge_banding === 1) {
      legEl.innerHTML = 'Fita em 1 dos lados que medem o comprimento (' + Math.round(m.comprimento) + ' mm) — '
        + 'a peça nasce partida de uma chapa já fitada nos dois lados (Flatbord 1C, migration 145). '
        + 'Os outros três lados mostram o miolo (' + nomeSub + ').';
    } else {
      legEl.innerHTML = 'Sem fita — as quatro bordas mostram o miolo (' + nomeSub + ').';
    }
  }
}

// Desenha o plano da máquina (C × L) com os furos — compartilhado entre o
// visualizador do componente (furação padrão) e o do módulo (Teste de
// cálculo, furação completa: padrão + toque + dobradiça).
// holes: [{ face, x, y, dia, depth, outside }] em coordenadas da máquina.
// `slots` (2026-08-16) é opcional: os rasgos de usinagem que o drilling.js
// manda pro .ban como <SlotL> (recorte em L do toe 4½ e da gola). Quem chama
// sem eles continua funcionando igual — é o caso da prévia do componente, que
// não tem recorte nenhum. Desenhados como a fresa ANDA: linha de centro com a
// largura real da ferramenta, ponta redonda, que é o que explica pro operador
// por que o canto interno não sai vivo.
function buildDrillingPlaneSvg(m, holes, slots, chapa) {
  const pad = Math.max(m.C, m.L) * 0.06 + 20; // respiro pras cotas
  const vbW = m.C + 2 * pad;
  const vbH = m.L + 2 * pad;
  const sw = Math.max(m.C, m.L) / 400; // "1px" proporcional ao tamanho da peça
  const fontSize = 11 * (vbW / 640);

  const svgParts = [];
  svgParts.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + vbW.toFixed(1) + ' ' + vbH.toFixed(1) + '" style="width:100%;height:auto;border:1px solid #ddd;background:#fff;">');
  // chapa. `chapa` (opcional, 2026-08-16) traz { cor, veio_eixo } pra mostrar
  // o SENTIDO DO VEIO — Matt: "pode ficar bem opaca, esbranquiçada, pra não
  // apagar a própria furação". Daí o fill-opacity baixo e as listras finas:
  // elas informam a direção sem competir com furo nenhum. Sem `chapa`, cai no
  // bege de sempre e nada muda (é o caso da prévia do componente).
  const corChapa = (chapa && chapa.cor) || '#f7f3ec';
  const eixoVeio = chapa && chapa.veio_eixo;
  // Textura da chapa como fundo. É a cor REAL de um material de madeira —
  // cor de textura tem swatch_hex no cinza padrão, e pintar com ele é o mesmo
  // que não pintar. Ladrilhada em 600mm pra dar escala física reconhecível,
  // e bem apagada: o que tem que se ler aqui é a furação, não a madeira.
  let fundoChapa = corChapa;
  let opacidadeFundo = (chapa && chapa.cor) ? '0.30' : '1';
  if (chapa && chapa.textura) {
    const tid = 'tex' + Math.random().toString(36).slice(2, 9);
    const lado = 600;
    // escape local: `esc` NÃO existe no escopo do ERP (só em js/admin.js, que
    // é fóssil, e em nesting.js como local). Usar ele aqui derrubava a tela
    // inteira com "esc is not defined" — pego pelo harness antes de subir.
    const escAttr = function (v) {
      return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    };
    svgParts.push('<defs><pattern id="' + tid + '" patternUnits="userSpaceOnUse" width="' + lado
      + '" height="' + lado + '"><image href="' + escAttr(chapa.textura) + '" x="0" y="0" width="'
      + lado + '" height="' + lado + '" preserveAspectRatio="xMidYMid slice"/></pattern></defs>');
    fundoChapa = 'url(#' + tid + ')';
    opacidadeFundo = '0.35';
  }
  if (eixoVeio) {
    // Listras ao longo do veio, com id único por peça pra dois cartões na
    // mesma tela não compartilharem o pattern (SVG resolve id por documento).
    const pid = 'veio' + Math.random().toString(36).slice(2, 9);
    const passo = Math.max(Math.min(m.C, m.L) / 22, 6);
    svgParts.push('<defs><pattern id="' + pid + '" width="'
      + (eixoVeio === 'x' ? passo * 4 : passo) + '" height="'
      + (eixoVeio === 'x' ? passo : passo * 4) + '" patternUnits="userSpaceOnUse">'
      + '<line x1="0" y1="0" x2="' + (eixoVeio === 'x' ? passo * 4 : 0) + '" y2="'
      + (eixoVeio === 'x' ? 0 : passo * 4) + '" stroke="#000" stroke-opacity="0.13" stroke-width="'
      + (sw * 1.2) + '"/></pattern></defs>');
    svgParts.push('<rect x="' + pad + '" y="' + pad + '" width="' + m.C + '" height="' + m.L
      + '" fill="' + fundoChapa + '" fill-opacity="' + opacidadeFundo + '"/>');
    svgParts.push('<rect x="' + pad + '" y="' + pad + '" width="' + m.C + '" height="' + m.L
      + '" fill="url(#' + pid + ')"/>');
    svgParts.push('<rect x="' + pad + '" y="' + pad + '" width="' + m.C + '" height="' + m.L
      + '" fill="none" stroke="#333" stroke-width="' + (sw * 1.5) + '"/>');
  } else {
    // Veio LIVRE: sem listras, porque não há sentido a respeitar — e desenhar
    // listra aqui faria o operador girar peça que não precisa girar.
    svgParts.push('<rect x="' + pad + '" y="' + pad + '" width="' + m.C + '" height="' + m.L
      + '" fill="' + fundoChapa + '" fill-opacity="' + opacidadeFundo + '" stroke="#333" stroke-width="' + (sw * 1.5) + '"/>');
  }
  // cotas
  svgParts.push('<text x="' + (pad + m.C / 2) + '" y="' + (pad - 6 * sw) + '" text-anchor="middle" font-size="' + fontSize + '" fill="#555">C = ' + Math.round(m.C) + '</text>');
  svgParts.push('<text x="' + (pad - 6 * sw) + '" y="' + (pad + m.L / 2) + '" text-anchor="middle" font-size="' + fontSize + '" fill="#555" transform="rotate(-90 ' + (pad - 6 * sw) + ' ' + (pad + m.L / 2) + ')">L = ' + Math.round(m.L) + '</text>');
  // origem
  svgParts.push('<text x="' + (pad + 3 * sw) + '" y="' + (pad + fontSize + 2 * sw) + '" font-size="' + (fontSize * 0.9) + '" fill="#999">0,0</text>');

  holes.forEach((h) => {
    const stroke = h.outside ? '#c0392b' : '#1a5276';
    const fill = h.outside ? 'rgba(192,57,43,0.25)' : 'rgba(26,82,118,0.25)';
    const title = '<title>' + h.face + ' — Ø' + h.dia + ' × ' + (Math.round(h.depth * 10) / 10) + 'mm @ X ' + (Math.round(h.x * 10) / 10) + ', Y ' + (Math.round(h.y * 10) / 10) + (h.outside ? ' (FORA DA CHAPA — será ignorado)' : '') + '</title>';
    // círculo no TAMANHO REAL do furo (mínimo ~1px só pra não sumir) — a
    // visibilidade de furo pequeno vem da cruzinha, que tem tamanho mínimo
    // próprio. Antes o raio mínimo era sw*2 e um furo de 3mm era desenhado
    // igual a um de 8mm em peça grande.
    const r = Math.max(h.dia / 2, sw);
    const cr = Math.max(r, sw * 2.5); // meia-largura da cruzinha
    if (h.face === 'face' || h.face === 'verso') {
      const dash = h.face === 'verso' ? ' stroke-dasharray="' + (4 * sw) + ' ' + (3 * sw) + '"' : '';
      svgParts.push('<circle cx="' + (pad + h.x) + '" cy="' + (pad + h.y) + '" r="' + r + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + sw + '"' + dash + '>' + title + '</circle>');
      // cruzinha no centro (também serve de alvo do mouse pro tooltip)
      svgParts.push('<path d="M ' + (pad + h.x - cr) + ' ' + (pad + h.y) + ' h ' + (cr * 2) + ' M ' + (pad + h.x) + ' ' + (pad + h.y - cr) + ' v ' + (cr * 2) + '" stroke="' + stroke + '" stroke-width="' + (sw * 0.8) + '"/>');
      // círculo transparente maior por cima, só pra facilitar o hover/tooltip
      svgParts.push('<circle cx="' + (pad + h.x) + '" cy="' + (pad + h.y) + '" r="' + cr + '" fill="transparent">' + title + '</circle>');
    } else {
      // furo de borda: retângulo entrando pela borda, comprimento = profundidade
      let rx, ry, rw, rh;
      if (h.face === 'borda_esq') { rx = pad; ry = pad + h.y - h.dia / 2; rw = h.depth; rh = h.dia; }
      else if (h.face === 'borda_dir') { rx = pad + m.C - h.depth; ry = pad + h.y - h.dia / 2; rw = h.depth; rh = h.dia; }
      else if (h.face === 'borda_sup') { rx = pad + h.x - h.dia / 2; ry = pad; rw = h.dia; rh = h.depth; }
      else { rx = pad + h.x - h.dia / 2; ry = pad + m.L - h.depth; rw = h.dia; rh = h.depth; }
      svgParts.push('<rect x="' + rx + '" y="' + ry + '" width="' + Math.max(rw, sw) + '" height="' + Math.max(rh, sw) + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + sw + '">' + title + '</rect>');
    }
  });
  (slots || []).forEach((sl) => {
    const cor = '#7d3c98';
    const t = '<title>usinagem — rasgo Ø' + sl.width + 'mm, profundidade '
      + (Math.round(sl.depth * 10) / 10) + 'mm' + (sl.passante ? ' (passante)' : '')
      + ' — de X ' + (Math.round(sl.x0 * 10) / 10) + ',Y ' + (Math.round(sl.y0 * 10) / 10)
      + ' a X ' + (Math.round(sl.x1 * 10) / 10) + ',Y ' + (Math.round(sl.y1 * 10) / 10) + '</title>';
    svgParts.push('<line x1="' + (pad + sl.x0) + '" y1="' + (pad + sl.y0) + '" x2="' + (pad + sl.x1)
      + '" y2="' + (pad + sl.y1) + '" stroke="' + cor + '" stroke-opacity="0.35" stroke-width="'
      + Math.max(sl.width, sw) + '" stroke-linecap="round">' + t + '</line>');
    // a linha de centro por cima, fina: é ela que mostra o percurso exato
    svgParts.push('<line x1="' + (pad + sl.x0) + '" y1="' + (pad + sl.y0) + '" x2="' + (pad + sl.x1)
      + '" y2="' + (pad + sl.y1) + '" stroke="' + cor + '" stroke-width="' + sw + '" stroke-dasharray="'
      + (5 * sw) + ' ' + (4 * sw) + '">' + t + '</line>');
  });
  svgParts.push('</svg>');
  return svgParts.join('');
}

// Redesenha o visualizador quando as dimensões de teste ou as fórmulas de
// L/A/P (que mudam o tamanho do plano) ou o tipo (positioning) mudam.
['component-preview-width', 'component-preview-height', 'component-preview-depth',
  'component-width-formula', 'component-height-formula', 'component-depth-formula'].forEach((id) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', updateComponentDrillingPreview);
});
document.getElementById('component-type').addEventListener('change', updateComponentDrillingPreview);

document.getElementById('component-drilling-add-btn').addEventListener('click', () => {
  componentDrillingsDraft.push({
    face: 'face', x_formula: '', y_formula: '', diameter_mm: 5,
    depth_formula: '10', repeat_count_formula: '1', repeat_dx_mm: 0, repeat_dy_mm: 0,
    counter_diameter_mm: null, counter_depth_mm: null,
    counter_face_diameter_mm: null, counter_face_depth_mm: null, counter_face_offset_mm: null,
    notes: ''
  });
  renderComponentDrillingRows();
});

// ---- Copiar furação de outro componente ----
// O select é preenchido quando o formulário do componente carrega (editar/
// novo) — preencher no focus não funcionava: o navegador abre a listinha
// ANTES da busca async no banco terminar, e ela aparecia vazia. Só lista
// componentes que TÊM furação cadastrada, com a contagem de furos no rótulo.
async function populateDrillingCopySelect() {
  const sel = document.getElementById('component-drilling-copy-select');
  if (!sel) return;
  const prev = sel.value;
  const { data, error } = await supabaseClient.from('component_drillings').select('component_id');
  if (error) { showError('component-drilling-error', error); return; }
  const countByComponent = {};
  (data || []).forEach((r) => { countByComponent[r.component_id] = (countByComponent[r.component_id] || 0) + 1; });
  const editingId = document.getElementById('component-id').value;
  const options = (componentsCache || [])
    .filter((c) => countByComponent[c.id] && c.id !== editingId)
    .sort((a, b) => a.reference.localeCompare(b.reference))
    .map((c) => `<option value="${c.id}">${c.reference} (${countByComponent[c.id]} furo${countByComponent[c.id] > 1 ? 's' : ''})</option>`);
  sel.innerHTML = '<option value="">— escolher componente —</option>' + options.join('');
  if (options.length === 0) {
    sel.innerHTML = '<option value="">(nenhum componente com furação cadastrada)</option>';
  }
  if (prev) sel.value = prev;
}

document.getElementById('component-drilling-copy-btn').addEventListener('click', async () => {
  clearError('component-drilling-error');
  const sourceId = document.getElementById('component-drilling-copy-select').value;
  if (!sourceId) return;
  const { data, error } = await supabaseClient
    .from('component_drillings')
    .select('*')
    .eq('component_id', sourceId)
    .order('sort_order');
  if (error) { showError('component-drilling-error', error); return; }
  (data || []).forEach((r) => {
    componentDrillingsDraft.push({
      face: r.face, x_formula: r.x_formula, y_formula: r.y_formula,
      diameter_mm: r.diameter_mm, depth_formula: r.depth_formula,
      repeat_count_formula: r.repeat_count_formula,
      repeat_dx_mm: r.repeat_dx_mm, repeat_dy_mm: r.repeat_dy_mm,
      counter_diameter_mm: r.counter_diameter_mm, counter_depth_mm: r.counter_depth_mm,
      counter_face_diameter_mm: r.counter_face_diameter_mm, counter_face_depth_mm: r.counter_face_depth_mm,
      counter_face_offset_mm: r.counter_face_offset_mm,
      notes: r.notes || ''
    });
  });
  renderComponentDrillingRows();
});

async function loadComponentDrillingsIntoForm(componentId) {
  clearError('component-drilling-error');
  componentDrillingsDraft = [];
  if (componentId) {
    const { data, error } = await supabaseClient
      .from('component_drillings')
      .select('*')
      .eq('component_id', componentId)
      .order('sort_order');
    if (error) { showError('component-drilling-error', error); }
    componentDrillingsDraft = (data || []).map((r) => ({
      face: r.face, x_formula: r.x_formula, y_formula: r.y_formula,
      diameter_mm: r.diameter_mm, depth_formula: r.depth_formula,
      repeat_count_formula: r.repeat_count_formula,
      repeat_dx_mm: r.repeat_dx_mm, repeat_dy_mm: r.repeat_dy_mm,
      counter_diameter_mm: r.counter_diameter_mm, counter_depth_mm: r.counter_depth_mm,
      counter_face_diameter_mm: r.counter_face_diameter_mm, counter_face_depth_mm: r.counter_face_depth_mm,
      counter_face_offset_mm: r.counter_face_offset_mm,
      notes: r.notes || ''
    }));
  }
  renderComponentDrillingRows();
  populateDrillingCopySelect();
}

// Valida e persiste o rascunho — devolve o erro (ou null) em vez de mostrar,
// pra quem chama decidir onde exibir.
/* Quantos furos esta peça CUSTA (migration 091) — os próprios MAIS os que ela
 * gera na peça vizinha por propagação (contra-furo 043, copo 054).
 *
 * A lateral tem zero furo próprio e recebe um monte; contar só o cadastrado
 * nela deixaria ela quase de graça na mão de obra por furo. Como todo
 * contra-furo nasce de um furo cadastrado, quem DEFINE a junta paga pelos dois
 * lados — o total do módulo fecha exato sem precisar rodar a propagação
 * (que exigiria a geometria 3D montada, cara e fora de lugar no preço).
 *
 * Gravado no componente, e não calculado na hora, porque o preço roda em
 * portal/admin/lote e nenhum deles carrega component_drillings. Este é o
 * único lugar que escreve furação, então é o único que precisa manter a conta.
 * A migration 091 faz o mesmo cálculo em SQL pro backfill — se um dia
 * divergirem, é a 091 que tem a palavra final (dá pra re-rodar). */
async function gravarFurosEquivalentes(componentId) {
  const conta = (componentDrillingsDraft || []).reduce((soma, r) => {
    // repeat_count_formula é fórmula, mas na prática é número. O que não for
    // numérico conta como 1 — mesma regra do backfill da 091, pra não
    // divergirem.
    const n = /^[0-9]+$/.test(String(r.repeat_count_formula || '1').trim())
      ? parseInt(r.repeat_count_formula, 10) : 1;
    const temContra = parseFloat(r.counter_diameter_mm) > 0;
    const temCopo = parseFloat(r.counter_face_diameter_mm) > 0;
    return soma + n + (temContra ? n : 0) + (temCopo ? n : 0);
  }, 0);
  const { error } = await supabaseClient
    .from('components').update({ furos_equivalentes: conta }).eq('id', componentId);
  // Banco sem a 091 não tem a coluna: não é motivo pra falhar o salvamento da
  // furação, que é o que o usuário pediu. Fica no console.
  if (error) console.warn('[furos_equivalentes]', error.message);
  const c = (componentsCache || []).find((x) => x.id === componentId);
  if (c && !error) c.furos_equivalentes = conta;
}

async function saveComponentDrillings(componentId) {
  // valida as fórmulas com dimensões de teste antes de gravar
  const testVars = { C: 800, L: 500, E: 18 };
  for (const row of componentDrillingsDraft) {
    try {
      Pricing.evalFormula(row.x_formula || '0', testVars);
      Pricing.evalFormula(row.y_formula || '0', testVars);
      Pricing.evalFormula(row.depth_formula || '0', testVars);
      Pricing.evalFormula(row.repeat_count_formula || '1', testVars);
    } catch (err) {
      return new Error('Fórmula inválida na furação padrão: ' + err.message);
    }
    if (!(parseFloat(row.diameter_mm) > 0)) return new Error('Furação padrão: diâmetro precisa ser maior que zero.');
    // Contra-furo agora vale em qualquer sentido (migrations 043 + 054), mas
    // meio preenchido seria descartado em silêncio no insert — recusar e explicar.
    const rowIsEdge = /^borda_/.test(row.face || '');
    const hasCDia = parseFloat(row.counter_diameter_mm) > 0;
    const hasCDep = parseFloat(row.counter_depth_mm) > 0;
    if (hasCDia !== hasCDep) {
      return new Error('Furação padrão: preencha Contra Ø E Contra prof. juntos (ou apague os dois).');
    }
    const camVals = [row.counter_face_diameter_mm, row.counter_face_depth_mm, row.counter_face_offset_mm];
    const camFilled = camVals.filter((v) => parseFloat(v) > 0).length;
    if (camFilled > 0 && rowIsEdge) {
      return new Error('Furação padrão: Copo Ø/prof./dist. só tem efeito em furo de FACE (tambor minifix na peça em pé apoiada) — em furo de borda, apague esses campos.');
    }
    if (camFilled > 0 && camFilled < 3) {
      return new Error('Furação padrão: preencha Copo Ø, prof. E dist. da borda juntos (ou apague os três).');
    }
    if (camFilled === 3 && !(hasCDia && hasCDep)) {
      return new Error('Furação padrão: o Copo acompanha o furo de borda propagado — preencha também Contra Ø/prof. (ex: Ø8 do canal do bolt).');
    }
  }
  const { error: delError } = await supabaseClient.from('component_drillings').delete().eq('component_id', componentId);
  if (delError) return delError;
  if (componentDrillingsDraft.length === 0) {
    await gravarFurosEquivalentes(componentId);   // zerou os furos, zera a conta
    return null;
  }
  const rows = componentDrillingsDraft.map((r, i) => {
    // contra-furo (043 borda→face + 054 face→borda): persiste com os DOIS
    // campos válidos; copo (counter_face_*) só em linha de face, com os TRÊS
    const isEdge = /^borda_/.test(r.face || '');
    const cDia = parseFloat(r.counter_diameter_mm);
    const cDep = parseFloat(r.counter_depth_mm);
    const hasCounter = cDia > 0 && cDep > 0;
    const camDia = parseFloat(r.counter_face_diameter_mm);
    const camDep = parseFloat(r.counter_face_depth_mm);
    const camOff = parseFloat(r.counter_face_offset_mm);
    const hasCam = !isEdge && hasCounter && camDia > 0 && camDep > 0 && camOff > 0;
    return {
      component_id: componentId,
      face: r.face || 'face',
      x_formula: String(r.x_formula || '0').trim() || '0',
      y_formula: String(r.y_formula || '0').trim() || '0',
      diameter_mm: parseFloat(r.diameter_mm),
      depth_formula: String(r.depth_formula || '10').trim() || '10',
      repeat_count_formula: String(r.repeat_count_formula || '1').trim() || '1',
      repeat_dx_mm: parseFloat(r.repeat_dx_mm) || 0,
      repeat_dy_mm: parseFloat(r.repeat_dy_mm) || 0,
      counter_diameter_mm: hasCounter ? cDia : null,
      counter_depth_mm: hasCounter ? cDep : null,
      counter_face_diameter_mm: hasCam ? camDia : null,
      counter_face_depth_mm: hasCam ? camDep : null,
      counter_face_offset_mm: hasCam ? camOff : null,
      notes: (r.notes || '').trim() || null,
      sort_order: i
    };
  });
  const { error: insError } = await supabaseClient.from('component_drillings').insert(rows);
  if (insError) return insError;
  await gravarFurosEquivalentes(componentId);
  return null;
}

// ---------- PRÉVIA DO COMPONENTE (dimensões e cor de teste) ----------
// Recalcula ao vivo, dentro do próprio formulário, o mesmo tipo de
// resultado que a linha "TOTAL ESTIMATED" mostraria — chapa, fita, mão de
// obra e total — usando as fórmulas e a cor/dimensões de teste escolhidas.
function updateComponentPreview() {
  const resultEl = document.getElementById('component-preview-result');
  if (!resultEl) return;

  const color = colorsCache.find((c) => c.id === document.getElementById('component-preview-color').value) || colorsCache[0];
  const laborType = laborTypesCache.find((l) => l.id === document.getElementById('component-labor-type').value) || null;
  // Origem comprado (migration 119 + o campo novo desta tela): a peça não
  // usa mão de obra, usa o preço do item comprado vinculado. Mesma regra de
  // js/pricing.js calculateLeafPiece — ver o comentário grande logo abaixo,
  // onde ela entra no cálculo.
  const origemComprado = document.getElementById('component-origin').value === 'comprado';
  const itemCompradoSel = document.getElementById('component-purchased-item');
  const itemComprado = (itemCompradoSel && itemCompradoSel.value)
    ? (purchasedItemsCache || []).find((i) => i.id === itemCompradoSel.value)
    : null;
  // Kit de suporte (migration 129) — mesma regra de js/pricing.js
  // calculateLeafPiece: item comprado SECUNDÁRIO, quantidade fixa por peça
  // (não escala com o comprimento).
  const itemSuporteSel = document.getElementById('component-support-purchased-item');
  const itemSuporte = (itemSuporteSel && itemSuporteSel.value)
    ? (purchasedItemsCache || []).find((i) => i.id === itemSuporteSel.value)
    : null;
  const suporteQty = parseFloat(
    (document.getElementById('component-support-purchased-item-qty') || {}).value
  ) || 1;
  const W = parseFloat(document.getElementById('component-preview-width').value) || 0;
  const H = parseFloat(document.getElementById('component-preview-height').value) || 0;
  const D = parseFloat(document.getElementById('component-preview-depth').value) || 0;

  const piece = {
    quantity: parseInt(document.getElementById('component-quantity').value, 10) || 1,
    width_formula: document.getElementById('component-width-formula').value.trim(),
    height_formula: document.getElementById('component-height-formula').value.trim(),
    depth_formula: document.getElementById('component-depth-formula').value.trim(),
    area_m2_formula: document.getElementById('component-area-formula').value.trim(),
    edge_band_linear_m_formula: document.getElementById('component-edge-formula').value.trim(),
    // Migration 088 — a prévia de preço tem que usar a MESMA regra de fita
    // do cálculo real, senão o número aqui e o do pedido divergem. positioning
    // vem do tipo: é ele que diz qual eixo é a espessura, e sem isso "o
    // comprimento" de uma peça deitada sai errado.
    edge_banding: document.getElementById('component-edge-banding').value === ''
      ? null : Number(document.getElementById('component-edge-banding').value),
    positioning: (componentTypesCache.find(
      (t) => t.id === document.getElementById('component-type').value) || {}).positioning || null
  };

  if (!color) {
    resultEl.innerHTML = '<p>Cadastre ao menos uma cor para ver a prévia.</p>';
    return;
  }

  try {
    const dims = Pricing.calculatePiece(piece, { W, H, D });
    const sheet_cost = dims.area_m2 * color.sheet_price_per_m2 * dims.quantity;
    const edge_cost = dims.edge_band_m * color.edge_price_per_linear_m * dims.quantity;
    const custoUnitario = (laborType ? laborType.price_per_unit : 0) * dims.quantity;
    // Espelha js/pricing.js calculateLeafPiece: comprado não soma mão de
    // obra, soma o preço do item comprado (sem item vinculado, cai pro custo
    // de mão de obra mesmo assim — pra prévia não sumir com zero calado).
    // Migration 129: item por METRO (unit==='m', ex: cabide) multiplica pelo
    // comprimento real (width_mm/1000) em vez de pela quantidade de
    // instâncias — qualquer outro item continua igual.
    const metrosComprado = dims.width_mm / 1000;
    const precoComprado = (itemComprado && itemComprado.purchase_price != null)
      ? Number(itemComprado.purchase_price) * (itemComprado.unit === 'm' ? metrosComprado : dims.quantity)
      : custoUnitario;
    // Migration 129: kit de suporte, quantidade fixa por peça (não escala
    // com o comprimento).
    const support_cost = (origemComprado && itemSuporte && itemSuporte.purchase_price != null)
      ? Number(itemSuporte.purchase_price) * suporteQty * dims.quantity
      : 0;
    const purchased_cost = origemComprado ? (precoComprado + support_cost) : 0;
    const labor_cost = origemComprado ? 0 : custoUnitario;
    const total = sheet_cost + edge_cost + labor_cost + purchased_cost;
    const linhaSuporte = (origemComprado && itemSuporte)
      ? `<tr><td>Kit de suporte</td><td>${itemSuporte.name} × ${suporteQty} — $${support_cost.toFixed(2)}</td></tr>`
      : '';
    const linhaMaoDeObraOuComprado = origemComprado
      ? `<tr><td>Item comprado</td><td>${itemComprado ? itemComprado.name + (itemComprado.unit === 'm' ? ` — ${metrosComprado.toFixed(2)} m` : '') : '<span class="hint">nenhum vinculado — usando mão de obra como custo provisório</span>'} — $${precoComprado.toFixed(2)}</td></tr>${linhaSuporte}`
      : `<tr><td>Mão de obra</td><td>${laborType ? laborType.name : '—'} — $${labor_cost.toFixed(2)}</td></tr>`;
    resultEl.innerHTML = `
      <table>
        <tbody>
          <tr><td>Largura (W)</td><td>${dims.width_mm.toFixed(0)} mm</td></tr>
          <tr><td>Altura (H)</td><td>${dims.height_mm.toFixed(0)} mm</td></tr>
          <tr><td>Profundidade (D)</td><td>${dims.depth_mm.toFixed(0)} mm</td></tr>
          <tr><td>M²</td><td>${dims.area_m2.toFixed(3)} — $${sheet_cost.toFixed(2)}</td></tr>
          <tr><td>Fita</td><td>${dims.edge_band_m.toFixed(2)} m — $${edge_cost.toFixed(2)}</td></tr>
          ${linhaMaoDeObraOuComprado}
          <tr><td><strong>Total estimado</strong></td><td><strong>$${total.toFixed(2)}</strong></td></tr>
        </tbody>
      </table>
    `;
  } catch (err) {
    resultEl.innerHTML = `<p>${err.message}</p>`;
  }
}

[
  'component-width-formula', 'component-height-formula', 'component-depth-formula',
  'component-area-formula', 'component-edge-formula', 'component-quantity',
  'component-preview-width', 'component-preview-height', 'component-preview-depth'
].forEach((id) => {
  document.getElementById(id).addEventListener('input', updateComponentPreview);
});
['component-labor-type', 'component-preview-color', 'component-purchased-item',
  'component-support-purchased-item'].forEach((id) => {
  document.getElementById(id).addEventListener('change', updateComponentPreview);
});
document.getElementById('component-support-purchased-item-qty').addEventListener('input', updateComponentPreview);
// Origem alterna a UI (mostra/esconde o select de item comprado) E recalcula
// a prévia — trocar fabricação<->comprado muda de onde sai o custo.
document.getElementById('component-origin').addEventListener('change', () => {
  updateOriginUI();
  updateComponentPreview();
});

// Fita de borda (migration 088) — a metragem responde tanto à receita quanto
// às medidas da prévia e às fórmulas de L/A/P, porque é o tamanho REAL da
// peça que decide qual lado é o comprimento. O tipo entra junto: é dele que
// vem o positioning, que decide qual eixo é a espessura.
['component-edge-banding', 'component-type', 'component-preview-color'].forEach((id) => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener('change', () => {
      updateEdgeBandingUI(); updateComponentPreview(); updateComponent3DPreview();
    });
  }
});
[
  'component-preview-width', 'component-preview-height', 'component-preview-depth',
  'component-width-formula', 'component-height-formula', 'component-depth-formula'
].forEach((id) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', () => { updateEdgeBandingUI(); updateComponent3DPreview(); });
});
updateEdgeBandingUI();
