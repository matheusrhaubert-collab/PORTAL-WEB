// ============================================================
// Minha conta — clicar no chip do usuário (canto superior direito)
// ============================================================
// Pedido do Matt (2026-10-14), com print do chip "My account / Log out":
// "aqui quero clicar e ver as informacoes do usuario, login nome do login
// alguma edicao rapida".
//
// Mostra: nome, e-mail de login, tipo de conta (user_profiles.role),
// membro desde e último acesso (auth). Edita rápido:
//   · nome (user_profiles.full_name, migration 053);
//   · nome/telefone da loja (store_name/store_phone, migration 138) — só pra
//     quem gera proposta (canGenerateProposal, portal-05), os mesmos campos
//     do menu de Configurações;
//   · senha (supabase.auth.updateUser).
// Segurança: tudo pela policy "self update own user_profiles" (migration
// 072) — o trigger prevent_self_profile_tampering continua bloqueando
// role/email/user_id, então ninguém troca o próprio papel por aqui.
//
// O chip passa a mostrar o NOME (ou o e-mail) — antes o data-i18n dele
// reescrevia "Minha conta" por cima do e-mail a cada troca de idioma.
// Modal criado por JS (não precisa de markup no portal.html).

function accountT(k, vars) { return I18n.t('account.' + k, vars); }

function accountEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function accountRoleLabel(role) {
  const known = ['administrador', 'lojista', 'vendedor', 'contractor', 'cliente'];
  return known.includes(role) ? accountT('role_' + role) : (role || accountT('role_cliente'));
}

function accountFmtDate(iso) {
  if (!iso) return '—';
  try {
    const lang = (I18n.getLanguage && I18n.getLanguage()) || 'pt';
    const loc = lang === 'en' ? 'en-US' : (lang === 'es' ? 'es-ES' : 'pt-BR');
    return new Date(iso).toLocaleString(loc, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch (e) { return String(iso); }
}

// ---------- Chip do topo: nome (ou e-mail) + inicial ----------
function refreshAccountChip() {
  const nameEl = document.getElementById('po-user-name');
  const avatarEl = document.getElementById('po-user-avatar');
  const user = (typeof currentUser !== 'undefined') ? currentUser : null;
  if (!nameEl || !user) return;
  const prof = (typeof currentUserProfile !== 'undefined') ? currentUserProfile : null;
  const nome = (prof && prof.full_name && prof.full_name.trim()) || user.email || accountT('my_account');
  nameEl.removeAttribute('data-i18n'); // senão a troca de idioma escreve "Minha conta" por cima
  nameEl.textContent = nome;
  nameEl.title = accountT('open_title');
  if (avatarEl) avatarEl.textContent = (nome || '?').trim().charAt(0).toUpperCase() || '?';
}

// O login (portal-09) chama ensureOwnUserProfile() pelo NOME na hora — trocar
// a função global aqui faz o chip pegar o nome assim que o perfil carrega,
// sem mexer no fluxo de login.
(function hookProfileLoad() {
  if (typeof ensureOwnUserProfile !== 'function') return;
  const original = ensureOwnUserProfile;
  ensureOwnUserProfile = async function () {
    const r = await original.apply(this, arguments);
    try { refreshAccountChip(); } catch (e) { /* ok */ }
    return r;
  };
})();

// ---------- Modal ----------
function ensureAccountModal() {
  let modal = document.getElementById('po-account-modal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'po-account-modal';
  modal.innerHTML = '<div class="po-account-card" role="dialog" aria-modal="true">'
    + '<button type="button" class="po-auth-modal-close" id="po-account-close" aria-label="×">&times;</button>'
    + '<div id="po-account-body"></div></div>';
  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeAccountModal(); });
  modal.querySelector('#po-account-close').addEventListener('click', closeAccountModal);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal.classList.contains('open')) closeAccountModal(); });
  return modal;
}

function closeAccountModal() {
  const modal = document.getElementById('po-account-modal');
  if (modal) modal.classList.remove('open');
}

async function openAccountModal() {
  const user = (typeof currentUser !== 'undefined') ? currentUser : null;
  if (!user) return;
  const modal = ensureAccountModal();
  const body = modal.querySelector('#po-account-body');
  body.innerHTML = '<p class="hint">' + accountEsc(accountT('loading')) + '</p>';
  modal.classList.add('open');

  // Perfil e auth frescos (o nome pode ter sido trocado no admin).
  let prof = (typeof currentUserProfile !== 'undefined') ? currentUserProfile : null;
  let authUser = user;
  try {
    const { data } = await supabaseClient.from('user_profiles').select('*').eq('user_id', user.id).maybeSingle();
    if (data) { prof = data; currentUserProfile = data; }
  } catch (e) { /* usa o que tem */ }
  try {
    const { data } = await supabaseClient.auth.getUser();
    if (data && data.user) authUser = data.user;
  } catch (e) { /* ok */ }

  const loja = (typeof canGenerateProposal === 'function') && canGenerateProposal();
  const nome = (prof && prof.full_name) || '';
  const provider = (authUser.app_metadata && authUser.app_metadata.provider) || 'email';
  const field = (id, label, value, extra) => '<label class="po-account-field"><span>' + accountEsc(label) + '</span>'
    + '<input type="' + ((extra && extra.type) || 'text') + '" id="' + id + '" value="' + accountEsc(value || '') + '"'
    + ((extra && extra.placeholder) ? ' placeholder="' + accountEsc(extra.placeholder) + '"' : '')
    + ((extra && extra.auto) ? ' autocomplete="' + extra.auto + '"' : '') + '></label>';

  body.innerHTML = ''
    + '<div class="po-account-head">'
    + '  <div class="po-account-avatar">' + accountEsc(((nome || authUser.email || '?').trim().charAt(0) || '?').toUpperCase()) + '</div>'
    + '  <div><div class="po-account-name">' + accountEsc(nome || authUser.email || '') + '</div>'
    + '  <span class="po-account-role">' + accountEsc(accountRoleLabel(prof && prof.role)) + '</span></div>'
    + '</div>'
    + '<dl class="po-account-info">'
    + '  <dt>' + accountEsc(accountT('login_email')) + '</dt><dd>' + accountEsc(authUser.email || '—') + '</dd>'
    + '  <dt>' + accountEsc(accountT('login_method')) + '</dt><dd>' + accountEsc(provider === 'google' ? 'Google' : accountT('login_method_email')) + '</dd>'
    + '  <dt>' + accountEsc(accountT('member_since')) + '</dt><dd>' + accountEsc(accountFmtDate(authUser.created_at)) + '</dd>'
    + '  <dt>' + accountEsc(accountT('last_login')) + '</dt><dd>' + accountEsc(accountFmtDate(authUser.last_sign_in_at)) + '</dd>'
    + '</dl>'
    + '<div class="po-account-section">' + accountEsc(accountT('section_edit')) + '</div>'
    + field('po-account-fullname', accountT('full_name'), nome, { auto: 'name' })
    + (loja
      ? field('po-account-store-name', accountT('store_name'), prof && prof.store_name)
        + field('po-account-store-phone', accountT('store_phone'), prof && prof.store_phone, { type: 'tel' })
      : '')
    + '<div class="po-account-section">' + accountEsc(accountT('section_password')) + '</div>'
    + field('po-account-pass1', accountT('new_password'), '', { type: 'password', auto: 'new-password', placeholder: accountT('password_hint') })
    + field('po-account-pass2', accountT('confirm_password'), '', { type: 'password', auto: 'new-password' })
    + '<div id="po-account-msg" class="hint" style="display:none;"></div>'
    + '<div class="po-account-actions">'
    + '  <button type="button" class="secondary" id="po-account-logout">' + accountEsc(I18n.t('nav.logout')) + '</button>'
    + '  <span style="flex:1"></span>'
    + '  <button type="button" class="secondary" id="po-account-cancel">' + accountEsc(I18n.t('step2.cancel_btn')) + '</button>'
    + '  <button type="button" id="po-account-save">' + accountEsc(accountT('save')) + '</button>'
    + '</div>';

  body.querySelector('#po-account-cancel').addEventListener('click', closeAccountModal);
  body.querySelector('#po-account-logout').addEventListener('click', () => {
    closeAccountModal();
    const lo = document.getElementById('po-logout-btn');
    if (lo) lo.click();
  });
  body.querySelector('#po-account-save').addEventListener('click', saveAccountModal);
}

function setAccountMsg(msg, isError) {
  const el = document.getElementById('po-account-msg');
  if (!el) return;
  el.textContent = msg || '';
  el.style.display = msg ? 'block' : 'none';
  el.className = isError ? 'error' : 'hint';
}

async function saveAccountModal() {
  const user = (typeof currentUser !== 'undefined') ? currentUser : null;
  if (!user) return;
  const btn = document.getElementById('po-account-save');
  const val = (id) => { const el = document.getElementById(id); return el ? el.value : null; };
  const p1 = val('po-account-pass1') || '';
  const p2 = val('po-account-pass2') || '';
  if (p1 || p2) {
    if (p1.length < 6) { setAccountMsg(accountT('err_password_short'), true); return; }
    if (p1 !== p2) { setAccountMsg(accountT('err_password_match'), true); return; }
  }
  if (btn) btn.disabled = true;
  setAccountMsg(accountT('saving'), false);
  try {
    const patch = { full_name: (val('po-account-fullname') || '').trim() || null };
    if (document.getElementById('po-account-store-name')) {
      patch.store_name = (val('po-account-store-name') || '').trim() || null;
      patch.store_phone = (val('po-account-store-phone') || '').trim() || null;
    }
    const { data, error } = await supabaseClient.from('user_profiles').update(patch).eq('user_id', user.id).select().single();
    if (error) throw error;
    if (data) currentUserProfile = data;
    if (p1) {
      const { error: pe } = await supabaseClient.auth.updateUser({ password: p1 });
      if (pe) throw pe;
    }
    // Campos da loja no menu de Configurações ficam em dia também.
    if (typeof refreshDealerStoreInfoInputs === 'function') refreshDealerStoreInfoInputs();
    refreshAccountChip();
    setAccountMsg(p1 ? accountT('saved_with_password') : accountT('saved'), false);
    ['po-account-pass1', 'po-account-pass2'].forEach((id) => { const el = document.getElementById(id); if (el) el.value = ''; });
  } catch (err) {
    console.error('[minha conta] falha ao salvar:', err);
    setAccountMsg(accountT('err_save', { msg: (err && err.message) || String(err) }), true);
  } finally {
    if (btn) btn.disabled = false;
  }
}

(function attachAccountChip() {
  if (typeof document === 'undefined') return;
  const chip = document.getElementById('po-user-chip');
  if (!chip) return;
  chip.classList.add('po-user-chip-clickable');
  chip.addEventListener('click', (e) => {
    // "Sair" do próprio chip continua sendo só sair.
    if (e.target && e.target.closest && e.target.closest('#po-logout-btn')) return;
    if (typeof currentUser === 'undefined' || !currentUser) return;
    openAccountModal();
  });
  // Troca de idioma reaplica data-i18n: refaz o chip depois.
  if (I18n.onLanguageChange) I18n.onLanguageChange(() => { setTimeout(() => { try { refreshAccountChip(); } catch (err) { /* ok */ } }, 0); });
  try {
    supabaseClient.auth.onAuthStateChange(() => { setTimeout(() => { try { refreshAccountChip(); } catch (err) { /* ok */ } }, 400); });
  } catch (e) { /* ok */ }
})();
