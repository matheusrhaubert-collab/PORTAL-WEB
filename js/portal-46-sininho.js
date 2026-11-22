// ============================================================
// SININHO DA FÁBRICA (22/11/2026) — SÓ ADMIN
// ============================================================
// Matt, 22/11: "quero um sininho na minha tela quando um novo usuário se
// cadastra. quero sininho quando um novo pedido entra pra orders."
//
// Sino na barra de cima (antes do "My company"/Margens), só com
// window.LEGNO_IS_ADMIN === true. Pra não-admin nada é criado no DOM.
//
// De onde vem (sem migration nova, só leitura):
//   - cadastro novo  = admin_people().registered_at (migration 325 — pega
//     também login sem perfil). Sem a 325 essa parte fica vazia.
//   - pedido novo    = linha nova em orders (created_at) de QUALQUER login
//     que não seja o meu — vale tanto pro "Enviar pedido" do editor
//     (Waiting approval) quanto pro ENVIAR FÁBRICA (já entra aprovado).
// Confere a cada SINO_INTERVALO_MS e quando a janela volta a ter foco.
//
// "Já vi" = carimbo em localStorage (legno_sino_visto_<uid>): é POR
// NAVEGADOR — abrir em outro computador mostra de novo o que é novo lá.
// Na 1ª vez o carimbo nasce "agora" (não despeja o histórico). A lista
// mostra os últimos SINO_DIAS dias; o que é mais novo que o carimbo conta
// no número vermelho. Abrir o sino marca tudo como visto.
//
// Desligar: localStorage.legno_sino_off = '1'.
// Carregado por último (depois do portal-45).

const SINO_INTERVALO_MS = 60000;
const SINO_DIAS = 14;
const SINO_MAX = 40;
const sinoState = { itens: [], carregando: false, aberto: false, timer: null, uid: null, erro: '' };

const SINO_TXT = {
  pt: { tip: 'Avisos da fábrica', titulo: 'Avisos', vazio: 'Nada novo nos últimos {n} dias.', user: 'Novo cadastro', order: 'Novo pedido', sem_perfil: 'sem perfil', sem_loja: 'sem loja', agora: 'agora', min: 'há {n} min', h: 'há {n} h', d: 'há {n} d', novo: 'novo', ver_pessoas: 'Abrir Pessoas', ver_central: 'Abrir Central', s_submitted: 'aguardando aprovação', s_approved: 'aprovado', s_other: 'em andamento' },
  en: { tip: 'Factory alerts', titulo: 'Alerts', vazio: 'Nothing new in the last {n} days.', user: 'New sign-up', order: 'New order', sem_perfil: 'no profile', sem_loja: 'no store', agora: 'now', min: '{n} min ago', h: '{n} h ago', d: '{n} d ago', novo: 'new', ver_pessoas: 'Open People', ver_central: 'Open Order Center', s_submitted: 'waiting approval', s_approved: 'approved', s_other: 'in progress' },
  es: { tip: 'Avisos de la fábrica', titulo: 'Avisos', vazio: 'Nada nuevo en los últimos {n} días.', user: 'Nuevo registro', order: 'Nuevo pedido', sem_perfil: 'sin perfil', sem_loja: 'sin tienda', agora: 'ahora', min: 'hace {n} min', h: 'hace {n} h', d: 'hace {n} d', novo: 'nuevo', ver_pessoas: 'Abrir Personas', ver_central: 'Abrir Central', s_submitted: 'esperando aprobación', s_approved: 'aprobado', s_other: 'en curso' }
};
function sinoT(k, n) {
  let l = 'en';
  try { l = (typeof I18n !== 'undefined' && I18n.getLanguage) ? I18n.getLanguage() : 'en'; } catch (e) { /* en */ }
  const v = (SINO_TXT[l] || SINO_TXT.en)[k]; const s = v != null ? v : (SINO_TXT.en[k] || k);
  return n != null ? s.replace('{n}', n) : s;
}
function sinoEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function sinoOn() {
  try { if (localStorage.getItem('legno_sino_off') === '1') return false; } catch (e) { /* segue */ }
  return window.LEGNO_IS_ADMIN === true && typeof currentUser !== 'undefined' && !!currentUser && typeof supabaseClient !== 'undefined';
}
function sinoChave() { return 'legno_sino_visto_' + sinoState.uid; }
function sinoVisto() {
  let v = null;
  try { v = localStorage.getItem(sinoChave()); } catch (e) { /* sem storage */ }
  if (!v) { v = new Date().toISOString(); try { localStorage.setItem(sinoChave(), v); } catch (e) { /* ok */ } }
  return v;
}
function sinoMarcaVisto() { try { localStorage.setItem(sinoChave(), new Date().toISOString()); } catch (e) { /* ok */ } }
function sinoHa(iso) {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return sinoT('agora');
  if (min < 60) return sinoT('min', min);
  if (min < 60 * 24) return sinoT('h', Math.round(min / 60));
  return sinoT('d', Math.round(min / 1440));
}
function sinoNovos() { const v = sinoVisto(); return sinoState.itens.filter((i) => i.t > v).length; }

function sinoCss() {
  if (document.getElementById('po-sino-css')) return;
  const st = document.createElement('style'); st.id = 'po-sino-css';
  st.textContent = '#po-sino-btn{position:relative;background:none;border:0;box-shadow:none;cursor:pointer;padding:4px 6px;margin:0;width:auto;color:var(--muted,#766f64);line-height:1;display:inline-flex;align-items:center}'
    + '#po-sino-btn:hover{color:var(--text,#2b2621)}#po-sino-btn svg{width:20px;height:20px;display:block}'
    + '#po-sino-btn.tem{color:var(--accent-dark,#6e4527)}#po-sino-btn.tem svg{animation:po-sino-bal 1.2s ease-in-out 2;transform-origin:50% 0}'
    + '@keyframes po-sino-bal{0%,100%{transform:rotate(0)}20%{transform:rotate(14deg)}40%{transform:rotate(-12deg)}60%{transform:rotate(8deg)}80%{transform:rotate(-5deg)}}'
    + '#po-sino-n{position:absolute;top:-3px;right:-4px;min-width:16px;height:16px;padding:0 4px;border-radius:8px;background:#c0392b;color:#fff;font-size:10px;font-weight:700;line-height:16px;text-align:center;box-sizing:border-box}'
    + '#po-sino-painel{position:fixed;z-index:1500;width:360px;max-width:calc(100vw - 16px);max-height:70vh;overflow:auto;background:#fff;color:#2b2621;border:1px solid #e3ddd3;border-radius:12px;box-shadow:0 14px 40px rgba(0,0,0,.18);font-size:13px}'
    + '#po-sino-painel h4{margin:0;padding:12px 14px 8px;font-size:14px}'
    + '#po-sino-painel .sn-it{display:flex;gap:10px;align-items:flex-start;padding:9px 14px;border-top:1px solid #f0ebe3;cursor:pointer}#po-sino-painel .sn-it:hover{background:#faf7f2}'
    + '#po-sino-painel .sn-it.novo{background:#fff7ec}#po-sino-painel .sn-ic{font-size:16px;line-height:1.2}'
    + '#po-sino-painel .sn-tx{flex:1;min-width:0}#po-sino-painel .sn-tx b{display:block;font-size:12px;color:#6e4527}#po-sino-painel .sn-tx span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    + '#po-sino-painel .sn-tx small{color:#8a8378}#po-sino-painel .sn-q{color:#8a8378;font-size:11px;white-space:nowrap}'
    + '#po-sino-painel .sn-tag{display:inline-block;background:#c0392b;color:#fff;border-radius:6px;font-size:9px;font-weight:700;padding:1px 5px;margin-left:6px;vertical-align:middle;text-transform:uppercase}'
    + '#po-sino-painel .sn-vazio{padding:6px 14px 16px;color:#8a8378}';
  document.head.appendChild(st);
}

async function sinoCarregar() {
  if (!sinoOn() || sinoState.carregando) return;
  sinoState.carregando = true;
  const me = currentUser.id; sinoState.uid = me;
  const desde = new Date(Date.now() - SINO_DIAS * 86400000).toISOString();
  const itens = []; const emails = {};
  try {
    const { data, error } = await supabaseClient.rpc('admin_people');
    if (!error && Array.isArray(data)) {
      data.forEach((p) => {
        emails[p.user_id] = p.email || '';
        if (p.is_admin || p.user_id === me || !p.registered_at || p.registered_at < desde) return;
        itens.push({ tipo: 'user', id: p.user_id, t: new Date(p.registered_at).toISOString(), titulo: p.email || '—', sub: [p.profile_role || sinoT('sem_perfil'), p.account_id ? '' : sinoT('sem_loja')].filter(Boolean).join(' · ') });
      });
    }
  } catch (e) { /* sem a 325: só pedidos */ }
  try {
    const { data, error } = await supabaseClient.from('orders')
      .select('id, client_user_id, status, po_name, client_name, factory_number, created_at')
      .gte('created_at', desde).neq('client_user_id', me).order('created_at', { ascending: false }).limit(SINO_MAX);
    if (error) throw error;
    (data || []).forEach((o) => {
      const st = o.status === 'submitted' ? sinoT('s_submitted') : o.status === 'approved' ? sinoT('s_approved') : sinoT('s_other');
      const quem = String(emails[o.client_user_id] || '').split('@')[0];
      itens.push({ tipo: 'order', id: o.id, t: new Date(o.created_at).toISOString(), titulo: [o.factory_number ? '#' + o.factory_number : '', o.po_name || o.client_name || '—'].filter(Boolean).join(' '), sub: [quem, st].filter(Boolean).join(' · ') });
    });
    sinoState.erro = '';
  } catch (e) { sinoState.erro = (e && e.message) || String(e); }
  itens.sort((a, b) => (a.t < b.t ? 1 : a.t > b.t ? -1 : 0));
  sinoState.itens = itens.slice(0, SINO_MAX);
  sinoState.carregando = false;
  sinoPinta();
}

function sinoBotao() {
  let btn = document.getElementById('po-sino-btn');
  if (!sinoOn()) { if (btn) btn.style.display = 'none'; sinoFecha(); return null; }
  if (!btn) {
    const ref = document.getElementById('po-company-btn') || document.getElementById('po-margins-btn');
    if (!ref || !ref.parentNode) return null;
    sinoCss();
    btn = document.createElement('button');
    btn.type = 'button'; btn.id = 'po-sino-btn';
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 8.5-3 8.5h18S18 15 18 8"/><path d="M13.7 20a2 2 0 0 1-3.4 0"/></svg><span id="po-sino-n" style="display:none"></span>';
    btn.addEventListener('click', (e) => { e.stopPropagation(); if (sinoState.aberto) sinoFecha(); else sinoAbre(); });
    ref.parentNode.insertBefore(btn, ref);
  }
  btn.style.display = '';
  btn.title = sinoT('tip'); btn.setAttribute('aria-label', sinoT('tip'));
  return btn;
}
function sinoPinta() {
  const btn = sinoBotao(); if (!btn) return;
  const n = sinoNovos(); const el = document.getElementById('po-sino-n');
  if (el) { el.textContent = n > 99 ? '99+' : String(n); el.style.display = n ? '' : 'none'; }
  btn.classList.toggle('tem', n > 0);
  if (sinoState.aberto) sinoPainel();
}
function sinoPainel() {
  let p = document.getElementById('po-sino-painel');
  if (!p) {
    p = document.createElement('div'); p.id = 'po-sino-painel';
    p.addEventListener('click', (e) => {
      const it = e.target.closest ? e.target.closest('.sn-it') : null; if (!it) return;
      const tipo = it.getAttribute('data-tipo');
      sinoFecha();
      if (tipo === 'user') { if (window.LegnoMinhaEmpresa && window.LegnoMinhaEmpresa.abrir) window.LegnoMinhaEmpresa.abrir('pessoas'); return; }
      const tab = document.querySelector('.portal-tab-btn[data-tab="po-tab-my-orders"]'); if (tab) tab.click();
    });
    document.body.appendChild(p);
  }
  const visto = sinoState.vistoAoAbrir || sinoVisto();
  p.innerHTML = '<h4>' + sinoEsc(sinoT('titulo')) + '</h4>'
    + (sinoState.itens.length ? sinoState.itens.map((i) => {
      const novo = i.t > visto;
      return '<div class="sn-it' + (novo ? ' novo' : '') + '" data-tipo="' + i.tipo + '" title="' + sinoEsc(sinoT(i.tipo === 'user' ? 'ver_pessoas' : 'ver_central')) + '">'
        + '<div class="sn-ic">' + (i.tipo === 'user' ? '👤' : '📦') + '</div>'
        + '<div class="sn-tx"><b>' + sinoEsc(sinoT(i.tipo)) + (novo ? '<i class="sn-tag">' + sinoEsc(sinoT('novo')) + '</i>' : '') + '</b><span>' + sinoEsc(i.titulo) + '</span>' + (i.sub ? '<small>' + sinoEsc(i.sub) + '</small>' : '') + '</div>'
        + '<div class="sn-q">' + sinoEsc(sinoHa(i.t)) + '</div></div>';
    }).join('') : '<div class="sn-vazio">' + sinoEsc(sinoState.erro || sinoT('vazio', SINO_DIAS)) + '</div>');
  const btn = document.getElementById('po-sino-btn'); if (!btn) return;
  const r = btn.getBoundingClientRect();
  p.style.top = Math.round(r.bottom + 8) + 'px';
  p.style.left = Math.max(8, Math.min(window.innerWidth - 368, Math.round(r.right - 360))) + 'px';
}
function sinoAbre() {
  sinoState.aberto = true;
  sinoState.vistoAoAbrir = sinoVisto();   // a lista continua marcando o que era novo enquanto está aberta
  sinoPainel();
  sinoMarcaVisto();
  const el = document.getElementById('po-sino-n'); if (el) el.style.display = 'none';
  const btn = document.getElementById('po-sino-btn'); if (btn) btn.classList.remove('tem');
  sinoCarregar();
}
function sinoFecha() {
  sinoState.aberto = false; sinoState.vistoAoAbrir = null;
  const p = document.getElementById('po-sino-painel'); if (p) p.remove();
}

(function sinoBoot() {
  document.addEventListener('click', (e) => {
    if (!sinoState.aberto) return;
    if (e.target.closest && (e.target.closest('#po-sino-painel') || e.target.closest('#po-sino-btn'))) return;
    sinoFecha();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sinoState.aberto) sinoFecha(); });
  window.addEventListener('focus', () => { if (sinoOn()) sinoCarregar(); });
  // LEGNO_IS_ADMIN chega um pouco depois do login: tenta cedo e segue no intervalo
  const tick = () => { if (sinoOn()) { if (!document.hidden) sinoCarregar(); } else sinoBotao(); };
  [1500, 4000, 9000].forEach((ms) => setTimeout(tick, ms));
  sinoState.timer = setInterval(tick, SINO_INTERVALO_MS);
})();

window.LegnoSino = { atualizar: sinoCarregar, novos: sinoNovos };
