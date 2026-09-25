/* Painel admin — Profundidades fixas e valores travados de medida
 *
 * Pedaço 13/21 do antigo js/admin.js, que virou módulo quando o
 * ERP passou a ser a única porta de entrada. O corte seguiu os próprios
 * marcadores de assunto do arquivo, então nada mudou de vizinho.
 * A ordem de carregamento em erp/index.html importa: é a mesma de antes. */

// ---------- PROFUNDIDADES FIXAS DO MÓDULO ----------
// Generaliza o antigo drawer_type_depths: QUALQUER módulo pode ter medidas
// fixas de profundidade, usadas quando ELE MESMO é usado como peça aninhada
// dentro de outro módulo (ver module_components.child_module_id). Não afeta
// o módulo quando usado como módulo-pai comum.

async function renderModuleFixedDepthsList() {
  const container = document.getElementById('module-fixed-depths-list');
  if (!selectedModuleId) { container.innerHTML = ''; return; }
  const { data, error } = await supabaseClient
    .from('module_fixed_depths')
    .select('*')
    .eq('module_id', selectedModuleId)
    .order('depth_mm');
  if (error) { showError('module-fixed-depths-error', error); return; }
  container.innerHTML = '';
  if (!data || data.length === 0) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = 'Nenhuma profundidade fixa cadastrada — este módulo estica livremente (comportamento padrão).';
    container.appendChild(p);
    return;
  }
  data.forEach((row) => {
    const rowDiv = document.createElement('div');
    rowDiv.className = 'row';
    rowDiv.style.alignItems = 'center';
    rowDiv.style.marginTop = '4px';
    const label = document.createElement('span');
    label.textContent = `${Number(row.depth_mm).toFixed(0)} mm`;
    label.style.flex = '1';
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'danger';
    removeBtn.style.marginTop = '0';
    removeBtn.textContent = 'Remover';
    removeBtn.addEventListener('click', async () => {
      await supabaseClient.from('module_fixed_depths').delete().eq('id', row.id);
      renderModuleFixedDepthsList();
    });
    rowDiv.appendChild(label);
    rowDiv.appendChild(removeBtn);
    container.appendChild(rowDiv);
  });
}

document.getElementById('module-add-fixed-depth-btn').addEventListener('click', async () => {
  if (!selectedModuleId) return;
  const input = document.getElementById('module-new-fixed-depth');
  const value = parseFloat(input.value);
  if (!value || value <= 0) return;
  const { error } = await supabaseClient.from('module_fixed_depths').insert({ module_id: selectedModuleId, depth_mm: value });
  if (error) { showError('module-fixed-depths-error', error); return; }
  input.value = '';
  renderModuleFixedDepthsList();
});

// Busca as profundidades fixas de um módulo qualquer (usado ao resolver uma
// peça-módulo aninhada — não necessariamente o módulo selecionado na tela).
// fetchModuleFixedDepths mudou de casa (2026-08-15): agora vive em js/module-pieces.js,
// que e a UNICA copia. Estava duplicada em 3 arquivos — campo novo
// esquecido numa delas some em silencio (peca sem furo).

// ---------- VALORES SUGERIDOS/TRAVADOS DE MEDIDA (migration 028) ----------
// Largura/Altura/Profundidade do módulo de PRIMEIRO NÍVEL (o que o próprio
// cliente escolhe e configura direto no portal) — diferente das
// "Profundidades fixas" acima, que só entram em jogo quando ESTE módulo é
// usado como peça aninhada dentro de outro. Sem trava (padrão): a régua
// livre continua igual, esses valores só aparecem como chips de atalho.
// Com trava: a régua livre some, vira um dropdown só com esses valores.

const DIMENSION_PRESET_DIMENSIONS = [
  { key: 'width', label: 'Largura' },
  { key: 'height', label: 'Altura' },
  { key: 'depth', label: 'Profundidade' }
];

// Catálogo de valores padrão "com referência" (código interno conhecido) —
// usado pra preencher a caixa de seleção rápida abaixo da tabela, em vez de
// digitar Valor/Nome/Referência na mão toda vez. Largura já vem populada com
// a série B09-B48 (padrão de largura de armário base, 3" em 3", igual aos
// valores B09-B24 já cadastrados). Altura/Profundidade ficam vazias por
// enquanto — nenhuma convenção de código foi confirmada pra elas ainda; para
// popular, adicione objetos no mesmo formato { value_mm, label, reference }.
const DIMENSION_PRESET_CATALOG = {
  width: [
    { value_mm: 229, label: 'B09', reference: '' },
    { value_mm: 305, label: 'B12', reference: '' },
    { value_mm: 381, label: 'B15', reference: '' },
    { value_mm: 457, label: 'B18', reference: '' },
    { value_mm: 533, label: 'B21', reference: '' },
    { value_mm: 609, label: 'B24', reference: '' },
    { value_mm: 686, label: 'B27', reference: '' },
    { value_mm: 762, label: 'B30', reference: '' },
    { value_mm: 838, label: 'B33', reference: '' },
    { value_mm: 914, label: 'B36', reference: '' },
    { value_mm: 991, label: 'B39', reference: '' },
    { value_mm: 1067, label: 'B42', reference: '' },
    { value_mm: 1143, label: 'B45', reference: '' },
    { value_mm: 1219, label: 'B48', reference: '' }
  ],
  height: [],
  depth: []
};

// Troca o sort_order de duas linhas VIZINHAS da mesma dimensão (mesmo padrão
// de setupLookupCRUD/moveColor: troca os dois valores e regrava os dois) —
// `rows` já vem ordenado por sort_order (query em renderModuleDimensionPresets),
// então o índice na lista É a posição visual de verdade.
async function moveDimensionPreset(rows, index, dir) {
  const otherIndex = index + dir;
  if (otherIndex < 0 || otherIndex >= rows.length) return;
  const a = rows[index];
  const b = rows[otherIndex];
  const { error } = await supabaseClient.from('module_dimension_presets').upsert([
    { ...a, sort_order: b.sort_order },
    { ...b, sort_order: a.sort_order }
  ]);
  if (error) { showError('module-dimension-presets-error', error); return; }
  renderModuleDimensionPresets();
}

async function renderModuleDimensionPresets() {
  const container = document.getElementById('module-dimension-presets-groups');
  if (!selectedModuleId) { container.innerHTML = ''; return; }

  const module = modulesCache.find((m) => m.id === selectedModuleId);

  const { data, error } = await supabaseClient
    .from('module_dimension_presets')
    .select('*')
    .eq('module_id', selectedModuleId)
    .order('sort_order');
  if (error) { showError('module-dimension-presets-error', error); return; }

  const byDimension = { width: [], height: [], depth: [] };
  (data || []).forEach((row) => { if (byDimension[row.dimension]) byDimension[row.dimension].push(row); });

  container.innerHTML = '';
  DIMENSION_PRESET_DIMENSIONS.forEach(({ key, label }) => {
    const group = document.createElement('div');
    group.className = 'dim-preset-group';
    group.style.marginTop = '16px';
    group.style.paddingTop = '12px';
    group.style.borderTop = '1px solid #e3ddd0';

    const heading = document.createElement('h3');
    heading.textContent = label;
    heading.style.margin = '0 0 6px 0';
    group.appendChild(heading);

    const lockLabel = document.createElement('label');
    lockLabel.style.display = 'block';
    lockLabel.style.marginBottom = '8px';
    const lockCheckbox = document.createElement('input');
    lockCheckbox.type = 'checkbox';
    lockCheckbox.style.width = 'auto';
    lockCheckbox.style.display = 'inline-block';
    lockCheckbox.checked = !!(module && module[`${key}_locked`]);
    lockCheckbox.addEventListener('change', async () => {
      const { error: lockErr } = await supabaseClient
        .from('modules')
        .update({ [`${key}_locked`]: lockCheckbox.checked })
        .eq('id', selectedModuleId);
      if (lockErr) { showError('module-dimension-presets-error', lockErr); lockCheckbox.checked = !lockCheckbox.checked; return; }
      if (module) module[`${key}_locked`] = lockCheckbox.checked;
    });
    lockLabel.appendChild(lockCheckbox);
    lockLabel.appendChild(document.createTextNode(' Travar (cliente só escolhe entre as opções abaixo, sem régua livre)'));
    group.appendChild(lockLabel);

    const table = document.createElement('table');
    table.innerHTML = '<thead><tr><th>Valor (mm)</th><th>Nome</th><th>Descrição</th><th>Referência (interna)</th><th></th></tr></thead>';
    const tbody = document.createElement('tbody');
    const rows = byDimension[key];
    if (rows.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 5;
      td.className = 'hint';
      td.textContent = 'Nenhum valor cadastrado.';
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
    rows.forEach((row, index) => {
      const tr = document.createElement('tr');
      const valTd = document.createElement('td'); valTd.textContent = `${Number(row.value_mm).toFixed(0)} mm`;
      const labelTd = document.createElement('td'); labelTd.textContent = row.label || '—';
      const descTd = document.createElement('td'); descTd.textContent = row.description || '—';
      const refTd = document.createElement('td'); refTd.textContent = row.reference || '—';
      const actionTd = document.createElement('td');
      actionTd.style.whiteSpace = 'nowrap';

      // ▲▼ (pedido do usuário 2026-07-29: "quero poder reordenar as posições
      // travadas, pra cima ou pra baixo") — mesma ideia das setas de
      // família/categoria/cor (troca o sort_order dos dois vizinhos e regrava
      // os dois); `rows` já vem ordenado por sort_order (query acima), então
      // o índice na lista é a posição visual de verdade. Essa ordem é a
      // mesma que o cliente vê no dropdown "Travado" (sem régua livre) do
      // portal.
      const upBtn = document.createElement('button');
      upBtn.type = 'button';
      upBtn.className = 'secondary';
      upBtn.style.marginTop = '0';
      upBtn.style.marginRight = '4px';
      upBtn.textContent = '▲';
      upBtn.title = 'Mover pra cima';
      upBtn.disabled = index === 0;
      upBtn.addEventListener('click', () => moveDimensionPreset(rows, index, -1));

      const downBtn = document.createElement('button');
      downBtn.type = 'button';
      downBtn.className = 'secondary';
      downBtn.style.marginTop = '0';
      downBtn.style.marginRight = '6px';
      downBtn.textContent = '▼';
      downBtn.title = 'Mover pra baixo';
      downBtn.disabled = index === rows.length - 1;
      downBtn.addEventListener('click', () => moveDimensionPreset(rows, index, 1));

      // "Editar" (pedido do usuário 2026-07-29: "quero mudar alguma
      // informacao... para largura, altura e profundidade") — antes só dava
      // pra Remover e recadastrar do zero pra corrigir um valor/nome/
      // descrição/referência. Edição IN-PLACE: troca as 4 células de texto
      // por inputs preenchidos com o valor atual, e os botões da linha por
      // Salvar/Cancelar — mesmos campos do formulário "+ Adicionar" abaixo,
      // só que fazendo update em vez de insert. Cancelar/Salvar chamam
      // renderModuleDimensionPresets() de novo, que já busca do banco e
      // desfaz a edição in-place sozinho (sem precisar de estado próprio).
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'secondary';
      editBtn.style.marginTop = '0';
      editBtn.style.marginRight = '6px';
      editBtn.textContent = 'Editar';
      editBtn.addEventListener('click', () => {
        valTd.innerHTML = '';
        const valueEditInput = document.createElement('input');
        valueEditInput.type = 'number'; valueEditInput.min = '0'; valueEditInput.style.width = '90px';
        valueEditInput.value = row.value_mm;
        valTd.appendChild(valueEditInput);

        labelTd.innerHTML = '';
        const labelEditInput = document.createElement('input');
        labelEditInput.type = 'text'; labelEditInput.value = row.label || '';
        labelTd.appendChild(labelEditInput);

        descTd.innerHTML = '';
        const descEditInput = document.createElement('input');
        descEditInput.type = 'text'; descEditInput.value = row.description || '';
        descTd.appendChild(descEditInput);

        refTd.innerHTML = '';
        const refEditInput = document.createElement('input');
        refEditInput.type = 'text'; refEditInput.value = row.reference || '';
        refTd.appendChild(refEditInput);

        actionTd.innerHTML = '';
        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'secondary';
        saveBtn.style.marginTop = '0';
        saveBtn.style.marginRight = '6px';
        saveBtn.textContent = 'Salvar';
        saveBtn.addEventListener('click', async () => {
          const value = parseFloat(valueEditInput.value);
          if (!value || value <= 0) return;
          const { error: updErr } = await supabaseClient.from('module_dimension_presets').update({
            value_mm: value,
            label: labelEditInput.value.trim() || null,
            description: descEditInput.value.trim() || null,
            reference: refEditInput.value.trim() || null
          }).eq('id', row.id);
          if (updErr) { showError('module-dimension-presets-error', updErr); return; }
          renderModuleDimensionPresets();
        });
        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'secondary';
        cancelBtn.style.marginTop = '0';
        cancelBtn.textContent = 'Cancelar';
        cancelBtn.addEventListener('click', () => renderModuleDimensionPresets());
        actionTd.appendChild(saveBtn);
        actionTd.appendChild(cancelBtn);
      });

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'danger';
      removeBtn.style.marginTop = '0';
      removeBtn.textContent = 'Remover';
      removeBtn.addEventListener('click', async () => {
        await supabaseClient.from('module_dimension_presets').delete().eq('id', row.id);
        renderModuleDimensionPresets();
      });
      actionTd.appendChild(upBtn);
      actionTd.appendChild(downBtn);
      actionTd.appendChild(editBtn);
      actionTd.appendChild(removeBtn);
      tr.appendChild(valTd); tr.appendChild(labelTd); tr.appendChild(descTd); tr.appendChild(refTd); tr.appendChild(actionTd);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    group.appendChild(table);

    // Caixa de seleção rápida: escolher um valor já conhecido/padrão (com
    // referência) preenche os campos abaixo sozinho — só falta clicar em
    // "+ Adicionar" como de costume. Some se não houver catálogo pra essa
    // dimensão, ou já usar todos os valores cadastrados.
    const catalog = DIMENSION_PRESET_CATALOG[key] || [];
    const usedValues = new Set(rows.map((r) => Number(r.value_mm)));
    const availablePresets = catalog.filter((p) => !usedValues.has(p.value_mm));
    let quickSelect = null;
    if (availablePresets.length > 0) {
      const quickRow = document.createElement('div');
      quickRow.className = 'row';
      quickRow.style.marginTop = '8px';
      quickRow.style.alignItems = 'center';
      quickRow.innerHTML = `<div><select class="dim-preset-quick-select"><option value="">Valor padrão (com referência)…</option></select></div>`;
      quickSelect = quickRow.querySelector('.dim-preset-quick-select');
      availablePresets.forEach((preset, idx) => {
        const opt = document.createElement('option');
        opt.value = String(idx);
        opt.textContent = `${preset.value_mm} mm — ${preset.label}`;
        quickSelect.appendChild(opt);
      });
      group.appendChild(quickRow);
    }

    const addRow = document.createElement('div');
    addRow.className = 'row';
    addRow.style.marginTop = '8px';
    addRow.style.alignItems = 'center';
    addRow.innerHTML = `
      <div><input type="number" min="0" class="dim-preset-value" placeholder="Valor (mm)" /></div>
      <div><input type="text" class="dim-preset-label" placeholder="Nome (opcional)" /></div>
      <div><input type="text" class="dim-preset-description" placeholder="Descrição (opcional)" /></div>
      <div><input type="text" class="dim-preset-reference" placeholder="Referência interna (opcional)" /></div>
      <div style="flex:0;"><button type="button" class="secondary dim-preset-add-btn" style="margin-top:0;white-space:nowrap;">+ Adicionar</button></div>
    `;
    const valueInput = addRow.querySelector('.dim-preset-value');
    const labelInput = addRow.querySelector('.dim-preset-label');
    const descInput = addRow.querySelector('.dim-preset-description');
    const refInput = addRow.querySelector('.dim-preset-reference');
    if (quickSelect) {
      quickSelect.addEventListener('change', () => {
        if (quickSelect.value === '') return;
        const preset = availablePresets[Number(quickSelect.value)];
        if (!preset) return;
        valueInput.value = preset.value_mm;
        labelInput.value = preset.label || '';
        descInput.value = preset.description || '';
        refInput.value = preset.reference || '';
        quickSelect.value = '';
      });
    }
    addRow.querySelector('.dim-preset-add-btn').addEventListener('click', async () => {
      const value = parseFloat(valueInput.value);
      if (!value || value <= 0) return;
      const { error: addErr } = await supabaseClient.from('module_dimension_presets').insert({
        module_id: selectedModuleId,
        dimension: key,
        value_mm: value,
        label: labelInput.value.trim() || null,
        description: descInput.value.trim() || null,
        reference: refInput.value.trim() || null,
        sort_order: rows.length
      });
      if (addErr) { showError('module-dimension-presets-error', addErr); return; }
      valueInput.value = ''; labelInput.value = ''; descInput.value = ''; refInput.value = '';
      renderModuleDimensionPresets();
    });
    group.appendChild(addRow);

    container.appendChild(group);
  });
}
