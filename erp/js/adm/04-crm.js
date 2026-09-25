/* Painel admin — CRM de clientes da fábrica
 *
 * Pedaço 5/21 do antigo js/admin.js, que virou módulo quando o
 * ERP passou a ser a única porta de entrada. O corte seguiu os próprios
 * marcadores de assunto do arquivo, então nada mudou de vizinho.
 * A ordem de carregamento em erp/index.html importa: é a mesma de antes. */

// ---------- CRM DE CLIENTES DA FÁBRICA (migration 079) ----------
// Cadastro comercial da fábrica (nome, telefone, empresa, endereço +
// histórico de reuniões) — DIFERENTE de user_profiles/"Perfis" (contas de
// login do portal). Vínculo com um usuário do portal é opcional (campo
// linked_user_id), pensado como primeiro passo do ERP integrado.
let crmClientsCache = [];
let selectedCrmClientId = null;

async function loadCrmClients() {
  clearError('crm-clients-list-error');
  const tbody = document.getElementById('crm-clients-tbody');
  tbody.innerHTML = '<tr><td colspan="5" class="hint">Carregando...</td></tr>';
  const { data, error } = await supabaseClient
    .from('crm_clients')
    .select('*')
    .order('nome', { ascending: true });
  if (error) { showError('crm-clients-list-error', error); tbody.innerHTML = ''; return; }
  crmClientsCache = data || [];
  renderCrmClientsTable(crmClientsCache);
}

function renderCrmClientsTable(list) {
  const tbody = document.getElementById('crm-clients-tbody');
  tbody.innerHTML = '';
  if (!list || list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="hint">Nenhum cliente cadastrado ainda.</td></tr>';
    return;
  }
  list.forEach((client) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${(client.nome || '—').replace(/</g, '&lt;')}</td>
      <td>${(client.empresa || '—').replace(/</g, '&lt;')}</td>
      <td>${(client.telefone || '—').replace(/</g, '&lt;')}</td>
      <td>${(client.endereco || '—').replace(/</g, '&lt;')}</td>
      <td><button type="button" class="secondary crm-client-view-btn" style="margin-top:0;">Ver</button></td>
    `;
    tr.querySelector('.crm-client-view-btn').addEventListener('click', () => openCrmClientDetail(client.id));
    tbody.appendChild(tr);
  });
}

document.getElementById('crm-clients-search').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  if (!q) { renderCrmClientsTable(crmClientsCache); return; }
  renderCrmClientsTable(crmClientsCache.filter((c) =>
    (c.nome || '').toLowerCase().includes(q) || (c.empresa || '').toLowerCase().includes(q)
  ));
});

document.getElementById('crm-client-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError('crm-client-error');
  const nome = document.getElementById('crm-client-nome').value.trim();
  const telefone = document.getElementById('crm-client-telefone').value.trim();
  const empresa = document.getElementById('crm-client-empresa').value.trim();
  const endereco = document.getElementById('crm-client-endereco').value.trim();
  const { error } = await supabaseClient.from('crm_clients').insert({
    nome, telefone: telefone || null, empresa: empresa || null, endereco: endereco || null
  });
  if (error) { showError('crm-client-error', error); return; }
  document.getElementById('crm-client-form').reset();
  loadCrmClients();
});

// Popula o select de vínculo com usuário do portal (user_profiles) — só
// carregado quando o painel de detalhe abre pela 1ª vez nesta sessão.
let crmLinkedUserOptionsLoaded = false;
async function populateCrmLinkedUserSelect() {
  if (crmLinkedUserOptionsLoaded) return;
  const { data, error } = await supabaseClient
    .from('user_profiles')
    .select('user_id, full_name, email')
    .order('email', { ascending: true });
  if (error) return; // não bloqueia o resto do painel por causa disso
  const select = document.getElementById('crm-client-edit-linked-user');
  data.forEach((profile) => {
    const opt = document.createElement('option');
    opt.value = profile.user_id;
    opt.textContent = profile.full_name ? `${profile.full_name} (${profile.email})` : profile.email;
    select.appendChild(opt);
  });
  crmLinkedUserOptionsLoaded = true;
}

async function openCrmClientDetail(clientId) {
  selectedCrmClientId = clientId;
  clearError('crm-client-detail-error');
  await populateCrmLinkedUserSelect();
  const client = crmClientsCache.find((c) => c.id === clientId);
  if (!client) return;
  document.getElementById('crm-client-edit-id').value = client.id;
  document.getElementById('crm-client-edit-nome').value = client.nome || '';
  document.getElementById('crm-client-edit-telefone').value = client.telefone || '';
  document.getElementById('crm-client-edit-empresa').value = client.empresa || '';
  document.getElementById('crm-client-edit-endereco').value = client.endereco || '';
  document.getElementById('crm-client-edit-notes').value = client.notes || '';
  document.getElementById('crm-client-edit-linked-user').value = client.linked_user_id || '';
  document.getElementById('crm-client-detail-panel').style.display = '';
  document.getElementById('crm-meeting-date').value = new Date().toISOString().slice(0, 10);
  await loadCrmMeetings(clientId);
  document.getElementById('crm-client-detail-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

document.getElementById('crm-client-edit-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError('crm-client-detail-error');
  const id = document.getElementById('crm-client-edit-id').value;
  const statusEl = document.getElementById('crm-client-edit-status');
  const linkedUserVal = document.getElementById('crm-client-edit-linked-user').value;
  const { error } = await supabaseClient.from('crm_clients').update({
    nome: document.getElementById('crm-client-edit-nome').value.trim(),
    telefone: document.getElementById('crm-client-edit-telefone').value.trim() || null,
    empresa: document.getElementById('crm-client-edit-empresa').value.trim() || null,
    endereco: document.getElementById('crm-client-edit-endereco').value.trim() || null,
    notes: document.getElementById('crm-client-edit-notes').value.trim() || null,
    linked_user_id: linkedUserVal || null,
    updated_at: new Date().toISOString()
  }).eq('id', id);
  if (error) { showError('crm-client-detail-error', error); return; }
  statusEl.textContent = 'Salvo!';
  setTimeout(() => { statusEl.textContent = ''; }, 2000);
  loadCrmClients();
});

document.getElementById('crm-client-delete-btn').addEventListener('click', async () => {
  const id = document.getElementById('crm-client-edit-id').value;
  if (!id) return;
  if (!confirm('Excluir este cliente e todo o histórico de reuniões dele? Essa ação não pode ser desfeita.')) return;
  const { error } = await supabaseClient.from('crm_clients').delete().eq('id', id);
  if (error) { showError('crm-client-detail-error', error); return; }
  document.getElementById('crm-client-detail-panel').style.display = 'none';
  selectedCrmClientId = null;
  loadCrmClients();
});

async function loadCrmMeetings(clientId) {
  clearError('crm-meetings-error');
  const tbody = document.getElementById('crm-meetings-tbody');
  tbody.innerHTML = '<tr><td colspan="3" class="hint">Carregando...</td></tr>';
  const { data, error } = await supabaseClient
    .from('crm_client_meetings')
    .select('*')
    .eq('client_id', clientId)
    .order('meeting_date', { ascending: false });
  if (error) { showError('crm-meetings-error', error); tbody.innerHTML = ''; return; }
  tbody.innerHTML = '';
  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="hint">Nenhuma reunião registrada ainda.</td></tr>';
    return;
  }
  data.forEach((meeting) => {
    const tr = document.createElement('tr');
    const dateStr = meeting.meeting_date ? new Date(meeting.meeting_date + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
    tr.innerHTML = `
      <td>${dateStr}</td>
      <td>${(meeting.notes || '').replace(/</g, '&lt;')}</td>
      <td><button type="button" class="secondary crm-meeting-delete-btn" style="margin-top:0;">Excluir</button></td>
    `;
    tr.querySelector('.crm-meeting-delete-btn').addEventListener('click', async () => {
      if (!confirm('Excluir esta reunião do histórico?')) return;
      const { error: delError } = await supabaseClient.from('crm_client_meetings').delete().eq('id', meeting.id);
      if (delError) { showError('crm-meetings-error', delError); return; }
      loadCrmMeetings(clientId);
    });
    tbody.appendChild(tr);
  });
}

document.getElementById('crm-meeting-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError('crm-meetings-error');
  if (!selectedCrmClientId) return;
  const meeting_date = document.getElementById('crm-meeting-date').value;
  const notes = document.getElementById('crm-meeting-notes').value.trim();
  const { error } = await supabaseClient.from('crm_client_meetings').insert({
    client_id: selectedCrmClientId, meeting_date, notes
  });
  if (error) { showError('crm-meetings-error', error); return; }
  document.getElementById('crm-meeting-notes').value = '';
  loadCrmMeetings(selectedCrmClientId);
});

ADM.aoAbrir('tab-crm-clients', loadCrmClients);
