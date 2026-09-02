/* Painel admin — Perfis de usuário e criação de conta
 *
 * Pedaço 4/21 do antigo js/admin.js, que virou módulo quando o
 * ERP passou a ser a única porta de entrada. O corte seguiu os próprios
 * marcadores de assunto do arquivo, então nada mudou de vizinho.
 * A ordem de carregamento em erp/index.html importa: é a mesma de antes. */

// ---------- PERFIS DE USUÁRIO (migration 051) ----------
// user_profiles nasce só quando o cliente loga no portal ao menos uma vez
// (ver ensureOwnUserProfile em portal.js) — role='cliente' por padrão, só o
// admin (aqui) promove pra lojista/contractor/administrador.
//
// "Lojista" virou "Dealer" na tela (migration 075, portal exclusivo do
// dealer: logo própria, galeria privada, toggle Legno/Dealer) — só o RÓTULO
// mudou aqui, o valor gravado em user_profiles.role continua sendo a string
// 'lojista' (nenhuma migration de dado, nenhum outro lugar do código
// precisou mudar).
// 'vendedor' (migration 149, 02/09/2026) não entra no formulário "Criar
// novo usuário" abaixo — a conta de vendedor é sempre self-service, criada
// pelo próprio dealer (Minha Equipe, no portal), que já grava o vínculo
// parent_dealer_user_id certo. Criar por aqui deixaria o vendedor "órfão"
// (sem loja). Mas o perfil PRECISA estar neste mapa pra tabela abaixo (que
// lista TODOS os perfis existentes, vendedor incluído) não quebrar o
// <select> da linha dele.
const ADMIN_ROLE_LABELS = { cliente: 'Cliente', lojista: 'Dealer', vendedor: 'Vendedor', contractor: 'Contractor', administrador: 'Administrador' };

// Valor em projetos por usuário (migration 078, pedido do usuário
// 2026-08-03: "quero na tela admin saber quanto cada usuario esta fazendo
// de projetos, em valores") — busca TODOS os user_projects (só possível
// depois da policy "admin read user_projects" da migration 078) e agrupa
// client_user_id -> {count, total, missing} em JS, mesmo padrão de
// agrupamento client-side já usado em outras telas deste app (o volume de
// projetos não justifica RPC/view nova). cached_value_usd é o valor de
// VENDA já calculado (Pricing.calculateModulePrice, sem margem de revenda
// — ver migration 076); projeto NUNCA aberto/salvo depois da 076 fica com
// cached_value_usd null e entra em "missing" em vez de contar como $0 (pra
// não subestimar o total mostrado).
async function loadProjectValueByUser() {
  const byUser = {};
  try {
    const { data, error } = await supabaseClient
      .from('user_projects')
      .select('client_user_id, cached_value_usd');
    if (error) throw error;
    (data || []).forEach((row) => {
      const key = row.client_user_id;
      if (!byUser[key]) byUser[key] = { count: 0, total: 0, missing: 0 };
      byUser[key].count += 1;
      if (row.cached_value_usd === null || row.cached_value_usd === undefined) {
        byUser[key].missing += 1;
      } else {
        byUser[key].total += Number(row.cached_value_usd) || 0;
      }
    });
  } catch (err) {
    console.error('Não deu pra carregar o valor de projetos por usuário (migration 078 rodou?):', err);
  }
  return byUser;
}

async function loadProfiles() {
  clearError('profiles-error');
  const tbody = document.getElementById('profiles-tbody');
  tbody.innerHTML = '<tr><td colspan="8" class="hint">Carregando...</td></tr>';
  const [{ data, error }, projectValueByUser] = await Promise.all([
    supabaseClient.from('user_profiles').select('*').order('created_at', { ascending: false }),
    loadProjectValueByUser()
  ]);
  if (error) { showError('profiles-error', error); tbody.innerHTML = ''; return; }
  tbody.innerHTML = '';
  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="hint">Nenhum usuário cadastrado ainda.</td></tr>';
    return;
  }
  data.forEach((profile) => {
    const tr = document.createElement('tr');
    const dateStr = profile.created_at ? new Date(profile.created_at).toLocaleDateString('pt-BR') : '—';
    const options = Object.keys(ADMIN_ROLE_LABELS).map((role) =>
      `<option value="${role}" ${profile.role === role ? 'selected' : ''}>${ADMIN_ROLE_LABELS[role]}</option>`
    ).join('');
    const projStats = projectValueByUser[profile.user_id];
    const projectsCell = projStats ? String(projStats.count) : '0';
    const valueCell = projStats
      ? `$${projStats.total.toFixed(2)}` + (projStats.missing > 0 ? ` <span class="hint">(+${projStats.missing} sem valor calculado)</span>` : '')
      : '—';
    // "Controle de uso" (migration 149, pedido do Matt 02/09/2026: "quero
    // controlar quem esta usando o sistema... por usuario ativo talvez") —
    // gravado pelo próprio portal a cada login (touchLastActive, js/portal.js).
    const lastActiveCell = profile.last_active_at ? new Date(profile.last_active_at).toLocaleString('pt-BR') : '—';
    tr.innerHTML = `
      <td><input type="text" class="profile-name-input" value="${(profile.full_name || '').replace(/"/g, '&quot;')}" placeholder="—" style="width:140px;" /></td>
      <td>${profile.email || '—'}</td>
      <td><select class="profile-role-select">${options}</select></td>
      <td>${dateStr}</td>
      <td>${projectsCell}</td>
      <td>${valueCell}</td>
      <td>${lastActiveCell}</td>
      <td><button type="button" class="secondary profile-save-btn" style="margin-top:0;">Salvar</button></td>
    `;
    tr.querySelector('.profile-save-btn').addEventListener('click', async () => {
      const role = tr.querySelector('.profile-role-select').value;
      const fullName = tr.querySelector('.profile-name-input').value.trim();
      const { error: updateError } = await supabaseClient
        .from('user_profiles')
        .update({ role, full_name: fullName || null, updated_at: new Date().toISOString() })
        .eq('user_id', profile.user_id);
      if (updateError) { showError('profiles-error', updateError); return; }
      const btn = tr.querySelector('.profile-save-btn');
      const original = btn.textContent;
      btn.textContent = 'Salvo!';
      setTimeout(() => { btn.textContent = original; }, 2000);
    });
    tbody.appendChild(tr);
  });
}
ADM.aoAbrir('tab-profiles', loadProfiles);

// ---------- CRIAR USUÁRIO (migration 053 + Edge Function admin-create-user) ----------
// Conta de verdade (e-mail + senha), pronta pra usar na hora — precisa da
// Edge Function porque criar usuário com senha exige a chave service_role
// do Supabase, que nunca pode ir pro navegador (ver comentário completo no
// topo de supabase/functions/admin-create-user/index.ts).
const createUserForm = document.getElementById('create-user-form');
if (createUserForm) {
  createUserForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError('create-user-error');
    const statusEl = document.getElementById('create-user-status');
    statusEl.textContent = 'Criando...';
    const full_name = document.getElementById('create-user-name').value.trim();
    const email = document.getElementById('create-user-email').value.trim();
    const password = document.getElementById('create-user-password').value;
    const role = document.getElementById('create-user-role').value;
    try {
      const { data, error } = await supabaseClient.functions.invoke('admin-create-user', {
        body: { full_name, email, password, role }
      });
      // supabase-js só popula `error` pra falha de rede/HTTP — uma resposta
      // 4xx/5xx da function com corpo JSON {error: "..."} ainda pode cair
      // aqui como FunctionsHttpError; nesse caso o corpo real vem em
      // error.context (Response) — tenta ler antes de mostrar mensagem genérica.
      if (error) {
        let msg = error.message || 'Erro ao criar usuário.';
        if (error.context && typeof error.context.json === 'function') {
          try { const body = await error.context.json(); if (body && body.error) msg = body.error; } catch (_e) { /* mantém msg genérica */ }
        }
        throw new Error(msg);
      }
      if (data && data.error) throw new Error(data.error);
      statusEl.textContent = `Usuário "${email}" criado.`;
      createUserForm.reset();
      setTimeout(() => { statusEl.textContent = ''; }, 4000);
      loadProfiles();
    } catch (err) {
      statusEl.textContent = '';
      showError('create-user-error', err);
    }
  });
}
