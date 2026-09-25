/* Painel admin — Vínculo do módulo com cores e modelos
 *
 * Pedaço 15/21 do antigo js/admin.js, que virou módulo quando o
 * ERP passou a ser a única porta de entrada. O corte seguiu os próprios
 * marcadores de assunto do arquivo, então nada mudou de vizinho.
 * A ordem de carregamento em erp/index.html importa: é a mesma de antes. */

// ---------- VÍNCULO MÓDULO x CORES ----------

// Papéis de cor que as peças de um módulo REALMENTE usam, recursivo (inclui
// peças dentro de peças-módulo aninhadas) — mesma ideia de
// collectUsedColorRoleIds em portal.js/client.js, só que consultando o
// banco direto (o admin não tem a árvore de peças já resolvida na tela de
// Cores) em vez de reaproveitar um array de peças já carregado.
async function collectUsedColorRoleIdsForModule(moduleId) {
  const { data, error } = await supabaseClient
    .from('module_components')
    .select('child_module_id, color_role_id, components(component_types(color_role_id))')
    .eq('module_id', moduleId);
  if (error) { showError('module-colors-error', error); return new Set(); }
  const ids = new Set();
  for (const row of (data || [])) {
    // O papel de cor é DO USO (migration 090), não da peça — a mesma regra
    // que loadRecursivePiecesForModule já aplica certo em module-pieces.js
    // (`color_role_id: row.color_role_id || <papel do Tipo de Componente>`):
    // a linha de module_components pode SOBRESCREVER o papel padrão do Tipo
    // de Componente pra este uso específico. Esta função (só existe aqui —
    // o admin não tem a árvore de peças já resolvida) checava isso só pra
    // peça-MÓDULO aninhada (child_module_id); peça-FOLHA (componente comum)
    // ignorava a sobrescrita da linha e só olhava o papel padrão do Tipo.
    //
    // Resultado (Matt, 21/08): módulo com uma peça-folha deliberadamente
    // pintada de um papel diferente do seu Tipo (ex.: "Toe 4 1/2" cadastrado
    // pra seguir a cor de "Porta/Frente" em vez de "Caixa") nunca mostrava
    // esse papel aqui pra vincular cor — sem cor vinculada, a peça trava sem
    // cor na hora de inserir o módulo no projeto ("No color selected for
    // the part..."), e não tinha como corrigir porque o papel certo nem
    // aparecia na lista pra marcar checkbox nenhum.
    const overrideRoleId = row.color_role_id
      || (row.components && row.components.component_types && row.components.component_types.color_role_id);
    if (overrideRoleId) ids.add(overrideRoleId);
    if (row.child_module_id) {
      const childIds = await collectUsedColorRoleIdsForModule(row.child_module_id);
      childIds.forEach((id) => ids.add(id));
    }
  }
  return ids;
}

async function renderModuleColorLinks() {
  const container = document.getElementById('module-colors-list');
  if (!selectedModuleId) { container.innerHTML = ''; return; }

  // Migration 035: module_colors agora tem color_role_id — cada papel de
  // cor tem sua PRÓPRIA lista de cores permitidas pra este módulo (antes
  // era uma lista só, valendo pra caixa E porta ao mesmo tempo).
  const [{ data: links, error }, usedRoleIds] = await Promise.all([
    supabaseClient.from('module_colors').select('color_id, color_role_id').eq('module_id', selectedModuleId),
    collectUsedColorRoleIdsForModule(selectedModuleId)
  ]);
  if (error) { showError('pieces-error', error); return; }
  const linkedByRole = new Map();
  (links || []).forEach((l) => {
    if (!linkedByRole.has(l.color_role_id)) linkedByRole.set(l.color_role_id, new Set());
    linkedByRole.get(l.color_role_id).add(l.color_id);
  });

  container.innerHTML = '';
  clearError('module-colors-error');
  // Só mostra papéis que alguma peça deste módulo REALMENTE usa — antes
  // mostrava todo o catálogo (Caixa, Porta/Frente, Painel...) mesmo pra
  // módulos sem nenhuma peça daquele papel, o que parecia bug (seção
  // "Painel" aparecia cheia de checkbox marcado num módulo sem nenhum
  // painel). Pra um papel aparecer aqui, atribua-o a um Tipo de Componente
  // (aba "Tipos de componente") ou numa peça-módulo aninhada (aba
  // "Componentes") primeiro.
  const rolesToShow = colorRolesCache.filter((role) => usedRoleIds.has(role.id));
  if (rolesToShow.length === 0) {
    container.innerHTML = '<p class="hint">Nenhuma peça deste módulo usa papel de cor ainda. Atribua um papel de cor a um Tipo de Componente (aba "Tipos de componente") ou a uma peça-módulo aninhada (aba "Componentes") pra ele aparecer aqui.</p>';
    return;
  }
  rolesToShow.forEach((role) => {
    const roleWrap = document.createElement('div');
    roleWrap.style.marginTop = '10px';
    roleWrap.style.paddingTop = '8px';
    roleWrap.style.borderTop = '1px solid #e3ddd0';
    const heading = document.createElement('p');
    heading.className = 'hint';
    heading.style.margin = '0 0 4px 0';
    heading.style.display = 'flex';
    heading.style.alignItems = 'center';
    heading.style.justifyContent = 'space-between';
    heading.style.gap = '8px';
    heading.innerHTML = `<strong>${role.name}</strong>`;
    roleWrap.appendChild(heading);

    // "Marcar/Desmarcar todas" — vincula (ou remove) TODAS as cores do
    // catálogo pra este papel neste módulo de uma vez, em vez de precisar
    // clicar cor por cor (pedido do usuário, listas de cor costumam ter
    // bastante item). Upsert/delete em lote + re-renderiza a seção inteira
    // pra refletir o estado novo (mesmo padrão do checkbox individual
    // abaixo, só que pra todas de uma vez).
    if (colorsCache.length > 0) {
      const bulkWrap = document.createElement('span');
      bulkWrap.style.display = 'flex';
      bulkWrap.style.gap = '4px';
      bulkWrap.style.flexShrink = '0';
      const selectAllBtn = document.createElement('button');
      selectAllBtn.type = 'button';
      selectAllBtn.className = 'secondary mc-row-btn';
      selectAllBtn.textContent = 'Marcar todas';
      const clearAllBtn = document.createElement('button');
      clearAllBtn.type = 'button';
      clearAllBtn.className = 'secondary mc-row-btn';
      clearAllBtn.textContent = 'Desmarcar todas';
      selectAllBtn.addEventListener('click', async () => {
        clearError('module-colors-error');
        const rows = colorsCache.map((c) => ({ module_id: selectedModuleId, color_role_id: role.id, color_id: c.id }));
        const { error } = await supabaseClient.from('module_colors').upsert(rows);
        if (error) { showError('module-colors-error', error); return; }
        loadModuleImageColorOptions();
        renderModuleColorLinks();
      });
      clearAllBtn.addEventListener('click', async () => {
        clearError('module-colors-error');
        const { error } = await supabaseClient.from('module_colors').delete()
          .eq('module_id', selectedModuleId).eq('color_role_id', role.id);
        if (error) { showError('module-colors-error', error); return; }
        loadModuleImageColorOptions();
        renderModuleColorLinks();
      });
      bulkWrap.appendChild(selectAllBtn);
      bulkWrap.appendChild(clearAllBtn);
      heading.appendChild(bulkWrap);
    }

    const linkedIds = linkedByRole.get(role.id) || new Set();
    colorsCache.forEach((c) => {
      const label = document.createElement('label');
      label.style.display = 'flex';
      label.style.alignItems = 'center';
      label.style.gap = '6px';
      label.style.marginTop = '4px';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.style.width = 'auto';
      checkbox.checked = linkedIds.has(c.id);
      checkbox.addEventListener('change', async () => {
        // 2026-09-03 (Matt: "quando seleciono as cores no adm ele nao
        // salva"): este handler nunca checava o `error` do upsert/delete —
        // diferente dos botões "Marcar/Desmarcar todas" logo acima, que
        // sempre checaram. Se o Supabase recusasse a escrita (RLS, rede,
        // conflito), o checkbox ficava marcado na tela (é só o clique do
        // próprio usuário, o DOM não sabe que a escrita falhou) e SÓ na
        // próxima troca de módulo/reload é que a marcação sumia sozinha,
        // sem nenhum erro visível — parecia "não salva" do nada. Agora
        // mostra o erro de verdade e desfaz o clique visualmente quando a
        // escrita falha, pra tela sempre bater com o que está no banco.
        clearError('module-colors-error');
        checkbox.disabled = true;
        const querendoMarcar = checkbox.checked;
        const { error } = querendoMarcar
          ? await supabaseClient.from('module_colors').upsert({ module_id: selectedModuleId, color_role_id: role.id, color_id: c.id })
          : await supabaseClient.from('module_colors').delete()
              .eq('module_id', selectedModuleId).eq('color_role_id', role.id).eq('color_id', c.id);
        checkbox.disabled = false;
        if (error) {
          showError('module-colors-error', error);
          checkbox.checked = !querendoMarcar;
          return;
        }
        // Mantém os selects de cor da "Imagem 3D do módulo" em dia sem
        // precisar trocar de módulo e voltar.
        loadModuleImageColorOptions();
      });
      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(c.name));
      roleWrap.appendChild(label);
    });
    container.appendChild(roleWrap);
  });
}

// ---------- VÍNCULO MÓDULO x MODELOS (porta/dobradiça/corrediça) ----------

async function renderModuleOptionLinks() {
  if (!selectedModuleId) return;
  await renderOneOptionLink('module_hinge_models', 'hinge_model_id', hingeModelsCache, 'module-hinge-models-list');
  await renderOneOptionLink('module_slide_models', 'slide_model_id', slideModelsCache, 'module-slide-models-list');
  // Migration 128 — corrediça de verdade mora em Itens Comprados
  // (purchased_items, kind='corredica'), não em slide_models (ver
  // cabeçalho da migration). Mesma tela de checkbox, só que a lista vem do
  // catálogo de comprados filtrado pro grupo certo. purchasedItemsCache é
  // populado por loadPurchasedItems (25-itens-comprados.js) — script
  // classic, mesmo escopo global, funciona não importa a ordem de carga.
  const corredicasComprados = (typeof purchasedItemsCache !== 'undefined' ? purchasedItemsCache : [])
    .filter((it) => it.kind === 'corredica');
  await renderOneOptionLink('module_purchased_slides', 'purchased_item_id', corredicasComprados, 'module-purchased-slides-list');
}

async function renderOneOptionLink(joinTable, fkColumn, catalogItems, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const { data: links, error } = await supabaseClient
    .from(joinTable)
    .select(fkColumn)
    .eq('module_id', selectedModuleId);
  if (error) { showError('pieces-error', error); return; }
  const linkedIds = new Set((links || []).map((l) => l[fkColumn]));

  container.innerHTML = '';
  catalogItems.forEach((item) => {
    const label = document.createElement('label');
    label.style.display = 'flex';
    label.style.alignItems = 'center';
    label.style.gap = '6px';
    label.style.marginTop = '4px';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.style.width = 'auto';
    checkbox.checked = linkedIds.has(item.id);
    checkbox.addEventListener('change', async () => {
      if (checkbox.checked) {
        await supabaseClient.from(joinTable).upsert({ module_id: selectedModuleId, [fkColumn]: item.id });
      } else {
        await supabaseClient.from(joinTable).delete().eq('module_id', selectedModuleId).eq(fkColumn, item.id);
      }
    });
    label.appendChild(checkbox);
    // Migration 127 — corrediça com comprimento de trilho cadastrado mostra
    // o mm junto do nome: com várias corrediças (uma por profundidade)
    // vinculadas ao MESMO módulo, sem isso ficaria impossível saber qual é
    // qual na hora de marcar.
    const textoItem = item.rail_length_mm != null
      ? item.name + ' — ' + Math.round(item.rail_length_mm) + 'mm'
      : item.name;
    label.appendChild(document.createTextNode(textoItem));
    container.appendChild(label);
  });
}
