/* Painel admin — Fotos de referência do módulo
 *
 * Pedaço 19/21 do antigo js/admin.js, que virou módulo quando o
 * ERP passou a ser a única porta de entrada. O corte seguiu os próprios
 * marcadores de assunto do arquivo, então nada mudou de vizinho.
 * A ordem de carregamento em erp/index.html importa: é a mesma de antes. */

// ---------- REFERÊNCIAS (fotos reais de MÓDULO pra fidelidade da IA) ----------
// migration_050_reference_photos.sql. Pedido do usuário (2026-07-19): "as
// imagens estao ficando diferentes tecnicamente do nosso produto... podemos
// criar um banco com cada referencia de modulo pra gerar a imagem mais
// fiel?" — cor NÃO tem foto de referência (removido a pedido do usuário
// logo em seguida: "acho que não precisa referência de cor, ela pode subir
// no próprio prompt pra ia gerar" — cor vira só texto no prompt, ver
// buildColorDescriptionForComposition em portal.js e generateModuleAiImage
// acima). Reaproveita o bucket 'textures' já existente (mesmo de
// uploadTextureIfSelected, cor — ver schema.sql "STORAGE — texturas das
// cores/chapas"), só um prefixo de caminho diferente — sem bucket/policy de
// Storage novos. generateAiPreviewForGallery (portal.js) e
// generateModuleAiImage (acima) escolhem no máximo 1 referência de módulo
// por chamada (mandar muitas imagens de referência de uma vez tende a
// CONFUNDIR o Gemini, não só custar mais). Uma referência pode ser
// cadastrada manualmente aqui (foto real) OU gerada automaticamente pelo
// botão "✨ Gerar imagem de IA" (caption 'Gerado automaticamente...').

function populateReferenceModuleSelect() {
  const sel = document.getElementById('reference-module-select');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">— selecione —</option>';
  modulesCache.forEach((m) => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.name;
    sel.appendChild(opt);
  });
  if (current) sel.value = current;
}

// Mesmo padrão de uploadTextureIfSelected() (acima, foto de cor) — bucket
// 'textures', só o prefixo de caminho muda (reference-photos/ em vez de
// colors/), pra não misturar os dois tipos de imagem dentro do mesmo bucket.
async function uploadReferencePhotoFile(file) {
  const ext = file.name.split('.').pop();
  const path = `reference-photos/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error: uploadError } = await supabaseClient.storage.from('textures').upload(path, file, {
    cacheControl: '3600',
    upsert: false
  });
  if (uploadError) throw new Error('Falha ao subir foto: ' + uploadError.message);
  const { data } = supabaseClient.storage.from('textures').getPublicUrl(path);
  return data.publicUrl;
}

document.getElementById('reference-photo-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError('reference-photos-error');
  const moduleId = document.getElementById('reference-module-select').value || null;
  const fileInput = document.getElementById('reference-photo-file');
  const file = fileInput.files && fileInput.files[0];
  const statusEl = document.getElementById('reference-photo-upload-status');
  if (!moduleId) {
    showError('reference-photos-error', 'Escolha um módulo.');
    return;
  }
  if (!file) {
    showError('reference-photos-error', 'Escolha um arquivo de foto.');
    return;
  }
  statusEl.textContent = 'Enviando foto...';
  try {
    const photoUrl = await uploadReferencePhotoFile(file);
    const { error } = await supabaseClient.from('reference_photos').insert({
      module_id: moduleId,
      photo_url: photoUrl,
      caption: document.getElementById('reference-photo-caption').value.trim() || null
    });
    if (error) throw error;
    statusEl.textContent = '';
    e.target.reset();
    renderReferencePhotosList();
  } catch (err) {
    statusEl.textContent = '';
    showError('reference-photos-error', err);
  }
});

async function renderReferencePhotosList() {
  const tbody = document.getElementById('reference-photos-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="4" class="hint">Carregando...</td></tr>';
  const { data, error } = await supabaseClient
    .from('reference_photos')
    .select('id, module_id, photo_url, caption, created_at')
    .order('created_at', { ascending: false });
  if (error) { showError('reference-photos-error', error); tbody.innerHTML = ''; return; }
  tbody.innerHTML = '';
  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="hint">Nenhuma foto de referência ainda.</td></tr>';
    return;
  }
  data.forEach((ref) => {
    const tr = document.createElement('tr');
    const moduleName = ref.module_id ? ((modulesCache.find((m) => m.id === ref.module_id) || {}).name || '—') : '—';
    tr.innerHTML = `
      <td><img src="${ref.photo_url}" alt="" class="reference-photo-thumb" style="width:70px;height:70px;object-fit:cover;border:1px solid var(--border);border-radius:6px;cursor:zoom-in;" /></td>
      <td>${moduleName}</td>
      <td>${ref.caption || '—'}</td>
      <td></td>
    `;
    const actionsTd = tr.lastElementChild;
    // Reaproveita o MESMO lightbox já criado pra galeria (openGalleryAdminLightbox).
    tr.querySelector('.reference-photo-thumb').addEventListener('click', () => openGalleryAdminLightbox(ref.photo_url));
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'danger';
    deleteBtn.textContent = 'Excluir';
    deleteBtn.addEventListener('click', () => deleteReferencePhoto(ref.id));
    actionsTd.appendChild(deleteBtn);
    tbody.appendChild(tr);
  });
}

async function deleteReferencePhoto(id) {
  if (!confirm('Excluir esta foto de referência? Não tem como desfazer.')) return;
  const { error } = await supabaseClient.from('reference_photos').delete().eq('id', id);
  if (error) { showError('reference-photos-error', error); return; }
  renderReferencePhotosList();
}

function renderReferencePhotosTab() {
  populateReferenceModuleSelect();
  renderReferencePhotosList();
}

ADM.aoAbrir('tab-references', renderReferencePhotosTab);

// Achata recursivamente o breakdown de UM order_item (mesmo formato que
// Pricing.calculateAssembly devolve — ver pricing.js) em peças FOLHA reais.
// Uma peça-módulo (is_module=true) não é uma peça física de chapa — é uma
// sub-montagem; as peças de verdade dela estão em child_breakdown. O
// "multiplier" carrega a quantidade acumulada de todos os níveis acima
// (quantidade do order_item x quantidade de cada peça-módulo no caminho) até
// chegar na folha, senão o total de peças subestimaria pedidos com módulo
// aninhado ou "quantidade" > 1 no card do módulo.
function flattenOrderItemBreakdown(breakdown, multiplier) {
  const rows = [];
  (breakdown || []).forEach((p) => {
    const qty = (p.quantity || 1) * multiplier;
    if (p.is_module) {
      rows.push(...flattenOrderItemBreakdown(p.child_breakdown, qty));
    } else {
      rows.push({
        reference: p.reference || '—',
        // description/origin só existem em pedidos calculados DEPOIS das
        // mudanças em pricing.js que passaram a copiar piece.notes/origin
        // pro breakdown — pedidos mais antigos não têm esses campos
        // gravados. Sem origin, trata como 'fabricacao' (era o único
        // comportamento possível antes da migration 034 existir).
        description: p.description || '—',
        origin: p.origin || 'fabricacao',
        color_role_id: p.color_role_id,
        width_mm: p.width_mm,
        height_mm: p.height_mm,
        depth_mm: p.depth_mm,
        quantity: qty
      });
    }
  });
  return rows;
}

// Comprimento/Largura/Espessura de uma peça de chapa não vêm de um eixo fixo
// (width_mm/height_mm/depth_mm sozinhos não dizem qual dos 3 é a espessura,
// isso depende de como a peça foi montada no módulo) — mas TODA peça de
// chapa é fina num dos 3 eixos. Convenção de marcenaria (confirmada com o
// usuário): espessura = a menor das 3 dimensões, largura = a do meio,
// comprimento = a maior.
function sortPieceCutDims(width_mm, height_mm, depth_mm) {
  const sorted = [width_mm, height_mm, depth_mm].slice().sort((a, b) => a - b);
  return { thickness_mm: sorted[0], largura_mm: sorted[1], comprimento_mm: sorted[2] };
}

async function openOrderCutlist(order) {
  currentCutlistOrder = order; // usado pelo export de furação (migration 038)
  clearError('order-cutlist-error');
  document.getElementById('orders-list-section').style.display = 'none';
  document.getElementById('order-cutlist-section').style.display = 'block';
  document.getElementById('order-cutlist-title').textContent = order.po_name || order.client_name || '(sem nome)';
  const dateStr = order.submitted_at ? new Date(order.submitted_at).toLocaleString('pt-BR') : '—';
  document.getElementById('order-cutlist-meta').textContent =
    `Cliente: ${order.client_name || '—'} · E-mail: ${order.client_email || '—'} · Telefone: ${order.client_phone || '—'} · Enviado em: ${dateStr}`;

  const tbody = document.getElementById('order-cutlist-tbody');
  const purchaseTbody = document.getElementById('order-purchase-tbody');
  tbody.innerHTML = '<tr><td colspan="8" class="hint">Carregando...</td></tr>';
  purchaseTbody.innerHTML = '';

  const { data: items, error } = await supabaseClient
    .from('order_items')
    .select('module_name, quantity, selected_colors, breakdown, sort_order')
    .eq('order_id', order.id)
    .order('sort_order');
  if (error) { showError('order-cutlist-error', error); tbody.innerHTML = ''; return; }

  // Duas listas separadas (migration 034 — origin por componente): peça de
  // FABRICAÇÃO vira linha de corte (com medidas/cor); peça COMPRADA (ex:
  // puxador, pé, ferragem) vira linha da lista de compra (só referência +
  // quantidade, medida não importa pra comprar pronto). Uma linha por
  // ocorrência de peça-folha, agrupada (soma de quantidade) quando
  // referência/descrição/medidas/cor são IDÊNTICAS — não importa de qual
  // módulo do pedido a peça veio, porque o que importa é o item final, não
  // a origem dele dentro do pedido.
  const groupedCut = new Map();
  const groupedPurchase = new Map();
  (items || []).forEach((item) => {
    const leafRows = flattenOrderItemBreakdown(item.breakdown, item.quantity || 1);
    leafRows.forEach((leaf) => {
      if (leaf.origin === 'comprado') {
        const key = [item.module_name, leaf.reference, leaf.description].join('|');
        if (!groupedPurchase.has(key)) {
          groupedPurchase.set(key, {
            module_name: item.module_name,
            reference: leaf.reference,
            description: leaf.description,
            quantity: 0
          });
        }
        groupedPurchase.get(key).quantity += leaf.quantity;
        return;
      }
      // Cor por papel (migration 035) — item.selected_colors é o jsonb
      // gravado no pedido: [{ role_id, role_name, color_id, color_name }].
      // Casa pelo role_id da peça (leaf.color_role_id).
      const colorEntry = (item.selected_colors || []).find((sc) => sc.role_id === leaf.color_role_id);
      const colorName = colorEntry ? colorEntry.color_name : '—';
      const { thickness_mm, largura_mm, comprimento_mm } = sortPieceCutDims(leaf.width_mm, leaf.height_mm, leaf.depth_mm);
      const key = [item.module_name, leaf.reference, leaf.description, comprimento_mm.toFixed(1), largura_mm.toFixed(1), thickness_mm.toFixed(1), colorName].join('|');
      if (!groupedCut.has(key)) {
        groupedCut.set(key, {
          module_name: item.module_name,
          reference: leaf.reference,
          description: leaf.description,
          comprimento_mm, largura_mm, thickness_mm,
          color: colorName,
          quantity: 0
        });
      }
      groupedCut.get(key).quantity += leaf.quantity;
    });
  });

  const byModuleThenReference = (a, b) => a.module_name.localeCompare(b.module_name) || a.reference.localeCompare(b.reference);
  currentOrderCutlistRows = Array.from(groupedCut.values()).sort(byModuleThenReference);
  currentPurchaseListRows = Array.from(groupedPurchase.values()).sort(byModuleThenReference);

  tbody.innerHTML = '';
  if (currentOrderCutlistRows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="hint">Nenhuma peça de fabricação neste pedido.</td></tr>';
  } else {
    currentOrderCutlistRows.forEach((row) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${row.module_name}</td>
        <td>${row.reference}</td>
        <td>${row.description}</td>
        <td>${row.comprimento_mm.toFixed(0)}</td>
        <td>${row.largura_mm.toFixed(0)}</td>
        <td>${row.thickness_mm.toFixed(0)}</td>
        <td>${row.color}</td>
        <td>${row.quantity}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  purchaseTbody.innerHTML = '';
  if (currentPurchaseListRows.length === 0) {
    purchaseTbody.innerHTML = '<tr><td colspan="4" class="hint">Nenhum item comprado neste pedido.</td></tr>';
  } else {
    currentPurchaseListRows.forEach((row) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${row.module_name}</td>
        <td>${row.reference}</td>
        <td>${row.description}</td>
        <td>${row.quantity}</td>
      `;
      purchaseTbody.appendChild(tr);
    });
  }
}

document.getElementById('order-cutlist-back-btn').addEventListener('click', () => {
  document.getElementById('order-cutlist-section').style.display = 'none';
  document.getElementById('orders-list-section').style.display = 'block';
});

// CSV separado por ";" (padrão do Excel PT-BR) com BOM UTF-8 na frente (pra
// acentuação abrir certo direto no Excel) — usado tanto pela lista de peças
// (fabricação) quanto pela lista de compra (comprados), cada botão passa
// seu próprio header/linhas/prefixo de nome de arquivo.
function downloadCsv(filenamePrefix, header, rows) {
  if (rows.length === 0) return;
  const csvEscape = (val) => {
    const str = String(val === null || val === undefined ? '' : val);
    return /[";\n]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
  };
  const lines = [header.join(';')];
  rows.forEach((row) => { lines.push(row.map(csvEscape).join(';')); });
  const bom = String.fromCharCode(0xFEFF); // BOM UTF-8 na frente, pra acentuação abrir certo no Excel
  const csvContent = bom + lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const titleText = document.getElementById('order-cutlist-title').textContent || 'pedido';
  a.download = `${filenamePrefix}-${titleText.replace(/[^a-z0-9]+/gi, '_')}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

document.getElementById('order-cutlist-csv-btn').addEventListener('click', () => {
  const header = ['Módulo', 'Referência', 'Descrição', 'Comprimento (mm)', 'Largura (mm)', 'Espessura (mm)', 'Cor', 'Quantidade'];
  const rows = currentOrderCutlistRows.map((row) => [
    row.module_name, row.reference, row.description,
    row.comprimento_mm.toFixed(0), row.largura_mm.toFixed(0), row.thickness_mm.toFixed(0),
    row.color, row.quantity
  ]);
  downloadCsv('lista-de-pecas', header, rows);
});

document.getElementById('order-purchase-csv-btn').addEventListener('click', () => {
  const header = ['Módulo', 'Referência', 'Descrição', 'Quantidade'];
  const rows = currentPurchaseListRows.map((row) => [row.module_name, row.reference, row.description, row.quantity]);
  downloadCsv('lista-de-compra', header, rows);
});
