/* Painel admin — Pedidos enviados pelo portal
 *
 * Pedaço 17/21 do antigo js/admin.js, que virou módulo quando o
 * ERP passou a ser a única porta de entrada. O corte seguiu os próprios
 * marcadores de assunto do arquivo, então nada mudou de vizinho.
 * A ordem de carregamento em erp/index.html importa: é a mesma de antes. */

// ---------- PEDIDOS (orders/order_items enviados pelo portal do cliente) ----------
// Só leitura (migration 033 deu ao admin permissão de SELECT nessas duas
// tabelas — antes disso o admin não enxergava pedido nenhum, só o próprio
// cliente dono). Objetivo: a partir de um pedido já enviado, montar a
// listagem de peças (corte) que vai pra produção — comprimento/largura/
// espessura/cor/referência/descrição de cada peça real, já multiplicada
// pela quantidade de cada módulo do pedido.

let ordersCache = [];
let currentCutlistOrder = null; // pedido aberto na tela de lista de peças — usado pelo export de furação
let currentOrderCutlistRows = []; // última lista de peças (fabricação) renderizada — o botão de CSV baixa exatamente isso
let currentPurchaseListRows = []; // última lista de compra (comprados) renderizada — idem, botão de CSV próprio

async function renderOrdersList() {
  clearError('orders-error');
  const tbody = document.getElementById('orders-tbody');
  tbody.innerHTML = '<tr><td colspan="6" class="hint">Carregando...</td></tr>';
  // 'submitted' ("Pendente"), 'approved' ("Aprovada", migration 047), 'paid'
  // ("Paga") e 'delivered' ("Entregue", migration 059 — sequência Pendente →
  // Aprovada → Paga → Entregue) — antes só existia 'submitted', então
  // filtrar só por ele bastava; qualquer estágio novo precisa continuar
  // aparecendo aqui, senão o pedido sumiria da tela do admin ao avançar.
  const { data, error } = await supabaseClient
    .from('orders')
    .select('id, po_name, client_name, client_email, client_phone, delivery_address, status, submitted_at, order_type')
    .in('status', ['submitted', 'approved', 'paid', 'delivered'])
    .order('submitted_at', { ascending: false });
  if (error) { showError('orders-error', error); tbody.innerHTML = ''; return; }
  ordersCache = data || [];
  tbody.innerHTML = '';
  if (ordersCache.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="hint">Nenhum pedido enviado ainda.</td></tr>';
    return;
  }
  // Rótulo do status (mesmo texto do portal do cliente, ver orderStatusLabel
  // em portal.js) — 'submitted' virou "Pendente" (era "Aberta").
  const orderStatusLabels = { submitted: 'Pendente', approved: 'Aprovada', paid: 'Paga', delivered: 'Entregue' };
  ordersCache.forEach((order) => {
    const tr = document.createElement('tr');
    const dateStr = order.submitted_at ? new Date(order.submitted_at).toLocaleString('pt-BR') : '—';
    const statusLabel = orderStatusLabels[order.status] || order.status;
    // order_type (migration 051) — 'cutting_list' é a planilha do Contractor
    // (cutting_list_items), sem order_type (ou 'modules') é o pedido normal
    // de módulo configurado (order_items) — botão abre a tela certa.
    // 'project' (2026-08-02) — pedido criado pela aba Projetos do portal
    // (sendProjectToOrder), vive em order_items igual a 'modules', só muda o
    // rótulo aqui pra deixar claro de onde veio.
    const isCutlist = order.order_type === 'cutting_list';
    const typeLabel = isCutlist ? 'Plano de Corte' : (order.order_type === 'project' ? 'Projeto' : 'Módulos');
    tr.innerHTML = `
      <td>${order.po_name || '—'}</td>
      <td>${typeLabel}</td>
      <td>${order.client_name || '—'}</td>
      <td>${order.client_email || '—'}</td>
      <td>${order.client_phone || '—'}</td>
      <td>${statusLabel}</td>
      <td>${dateStr}</td>
      <td style="white-space:nowrap;">
        <button type="button" class="secondary order-view-cutlist-btn" style="margin-top:0;">Ver peças</button>
        ${order.status === 'approved' ? '<button type="button" class="secondary order-mark-paid-btn" style="margin-top:0;">Marcar pago</button>' : ''}
        ${order.status === 'paid' ? '<button type="button" class="secondary order-mark-delivered-btn" style="margin-top:0;">Marcar entregue</button>' : ''}
      </td>
    `;
    tr.querySelector('.order-view-cutlist-btn').addEventListener('click', () => {
      if (isCutlist) openOrderCuttingList(order);
      else openOrderCutlist(order);
    });
    // Pago/Entregue (migration 059) — mesma sequência/gravação do botão
    // equivalente no portal do cliente (po-order-detail-mark-paid-btn/
    // po-order-detail-mark-delivered-btn em portal.js); confirmado via
    // AskUserQuestion que tanto o admin quanto o cliente podem marcar.
    const markPaidBtn = tr.querySelector('.order-mark-paid-btn');
    if (markPaidBtn) {
      markPaidBtn.addEventListener('click', async () => {
        const { error: payErr } = await supabaseClient.from('orders').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', order.id);
        if (payErr) { showError('orders-error', payErr); return; }
        renderOrdersList();
      });
    }
    const markDeliveredBtn = tr.querySelector('.order-mark-delivered-btn');
    if (markDeliveredBtn) {
      markDeliveredBtn.addEventListener('click', async () => {
        const { error: delErr } = await supabaseClient.from('orders').update({ status: 'delivered', delivered_at: new Date().toISOString() }).eq('id', order.id);
        if (delErr) { showError('orders-error', delErr); return; }
        renderOrdersList();
      });
    }
    tbody.appendChild(tr);
  });
}
ADM.aoAbrir('tab-orders', renderOrdersList);

// Visualização do pedido de PLANO DE CORTE (migration 051) — cutting_list_items,
// diferente de openOrderCutlist (que deriva peças de order_items/módulo).
async function openOrderCuttingList(order) {
  clearError('order-cutting-list-error');
  document.getElementById('orders-list-section').style.display = 'none';
  document.getElementById('order-cutting-list-section').style.display = 'block';
  document.getElementById('order-cutting-list-title').textContent = order.po_name || order.client_name || '(sem nome)';
  const dateStr = order.submitted_at ? new Date(order.submitted_at).toLocaleString('pt-BR') : '—';
  document.getElementById('order-cutting-list-meta').textContent =
    `Cliente: ${order.client_name || '—'} · E-mail: ${order.client_email || '—'} · Enviado em: ${dateStr}`;

  const tbody = document.getElementById('order-cutting-list-tbody');
  tbody.innerHTML = '<tr><td colspan="12" class="hint">Carregando...</td></tr>';

  const { data: items, error } = await supabaseClient
    .from('cutting_list_items')
    .select('*')
    .eq('order_id', order.id)
    .order('sort_order');
  if (error) { showError('order-cutting-list-error', error); tbody.innerHTML = ''; return; }

  tbody.innerHTML = '';
  if (!items || items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="12" class="hint">Nenhuma peça neste pedido.</td></tr>';
    document.getElementById('order-cutting-list-total').textContent = '';
    return;
  }
  let total = 0;
  items.forEach((it) => {
    total += Number(it.total_price || 0);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${it.op || '—'}</td>
      <td>${it.part_name}</td>
      <td>${it.quantity}</td>
      <td>${Number(it.comprimento_mm).toFixed(0)}</td>
      <td>${Number(it.largura_mm).toFixed(0)}</td>
      <td>${it.has_grain ? 'Sim' : 'Não'}</td>
      <td>${Number(it.espessura_mm).toFixed(0)}mm</td>
      <td>${it.color_name || '—'}</td>
      <td>${it.edge_banding}</td>
      <td>${it.obs || ''}</td>
      <td>$${Number(it.unit_price || 0).toFixed(2)}</td>
      <td>$${Number(it.total_price || 0).toFixed(2)}</td>
    `;
    tbody.appendChild(tr);
  });
  document.getElementById('order-cutting-list-total').textContent = `Total: $${total.toFixed(2)}`;
}
document.getElementById('order-cutting-list-back-btn').addEventListener('click', () => {
  document.getElementById('order-cutting-list-section').style.display = 'none';
  document.getElementById('orders-list-section').style.display = 'block';
});

// Duplicado de portal.js de propósito (não há bundle compartilhado entre
// portal.js/admin.js neste projeto — mesmo padrão já usado pra outros
// helpers pequenos). Ver comentário completo em uploadGalleryImageToStorage
// no portal.js / migration 055.
async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return res.blob();
}
async function uploadGalleryImageToStorage(imageDataUrl) {
  if (!imageDataUrl || !imageDataUrl.startsWith('data:')) return imageDataUrl;
  const blob = await dataUrlToBlob(imageDataUrl);
  const ext = (blob.type.split('/')[1] || 'png').split('+')[0];
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabaseClient.storage.from('gallery-images').upload(path, blob, {
    contentType: blob.type || 'image/png',
    upsert: false
  });
  if (error) throw error;
  const { data } = supabaseClient.storage.from('gallery-images').getPublicUrl(path);
  return data.publicUrl;
}

// Botão "Migrar imagens antigas pro Storage" (pedido do usuário 2026-07-20)
// — converte posts publicados ANTES da migration 055, que ainda têm a
// imagem inteira em base64 na coluna ai_image_data_url.
//
// CORREÇÃO (mesmo dia): a 1ª versão buscava `id, ai_image_data_url` de
// TODOS os posts antigos numa única query — exatamente o problema que essa
// migração inteira existe pra resolver (muitos MB de base64 numa consulta
// só, pode travar/estourar statement_timeout igual já tinha acontecido na
// galeria pública, ver GALLERY_PAGE_SIZE em portal.js). Agora busca só os
// IDS primeiro (leve, mesmo com centenas de posts) e depois busca/sobe/
// atualiza a imagem de UM post por vez dentro do loop — nunca mais de uma
// imagem inteira na memória ao mesmo tempo.
async function migrateGalleryImagesToStorage() {
  const btn = document.getElementById('gallery-migrate-storage-btn');
  const statusEl = document.getElementById('gallery-migrate-storage-status');
  btn.disabled = true;
  statusEl.textContent = 'Buscando posts antigos...';
  try {
    const { data: idsData, error: idsError } = await supabaseClient
      .from('gallery_posts')
      .select('id')
      .like('ai_image_data_url', 'data:%');
    if (idsError) throw idsError;
    const ids = (idsData || []).map((p) => p.id);
    if (ids.length === 0) {
      statusEl.textContent = 'Nenhum post antigo pra migrar — tudo já está no Storage.';
      return;
    }
    let done = 0;
    let failed = 0;
    for (const id of ids) {
      statusEl.textContent = `Migrando ${done + failed + 1}/${ids.length}...`;
      try {
        // Busca a imagem DESTE post agora (1 por vez, nunca em lote).
        const { data: row, error: rowError } = await supabaseClient
          .from('gallery_posts')
          .select('ai_image_data_url')
          .eq('id', id)
          .single();
        if (rowError) throw rowError;
        const publicUrl = await uploadGalleryImageToStorage(row.ai_image_data_url);
        const { error: updateError } = await supabaseClient
          .from('gallery_posts')
          .update({ ai_image_data_url: publicUrl })
          .eq('id', id);
        if (updateError) throw updateError;
        done++;
      } catch (postErr) {
        console.error(`Falha ao migrar post ${id}:`, postErr);
        failed++;
      }
    }
    statusEl.textContent = failed
      ? `${done} migrado(s), ${failed} falharam (veja o console). Pode clicar de novo pra tentar os que faltam.`
      : `${done} post(s) migrado(s) com sucesso.`;
    renderGalleryAdminList();
  } catch (err) {
    statusEl.textContent = `Erro: ${err.message || err} — confirme que rodou a migration 055 (bucket "gallery-images") no SQL editor do Supabase.`;
  } finally {
    btn.disabled = false;
  }
}
const galleryMigrateStorageBtn = document.getElementById('gallery-migrate-storage-btn');
if (galleryMigrateStorageBtn) galleryMigrateStorageBtn.addEventListener('click', () => migrateGalleryImagesToStorage());
