// ============================================================
// "PREÇO DE:" — admin escolhe pra quem é o projeto (23/11/2026) — SÓ ADMIN
// ============================================================
// Matt, 23/11: "quando estiver logando com administrador e fazendo projeto
// pra algum dealer, quero poder ter uma seleção ali na direita da barra de
// ferramentas, e escolher todos os usuários do sistema, conforme eu escolho
// o usuário o meu preço/estimate já fica configurado pra ele. preço e
// proposta devem estar com as margens dele." + "só na aba projetos isso".
//
// O QUE FAZ
// - Grupo novo no fim da barra do projeto (#po-proj-tb-precode), só com
//   window.LEGNO_IS_ADMIN === true. Pra não-admin nada é criado no DOM.
// - Escolhido um usuário, os 3 getters de preço do portal-05 passam a
//   devolver a config DELE enquanto a ABA PROJETOS está aberta:
//     getFactoryDiscountPct / getResaleMarginPct / resolveDealerPricingExtras
//   (getDisplayPrice, getDisplayPriceRatioOnly e computeCustoBase saem certos
//   sozinhos, porque só chamam esses 3). Mesma regra que o próprio usuário
//   veria logado (ver pdCfgDe): dealer = desconto + extras + margem dele;
//   vendedor = desconto/extras do dealer pai + margem do vendedor (migration
//   320) ou a geral da loja; os outros = só a margem própria.
// - A Proposta (portal-10) sai com a logo/loja do escolhido (do dealer pai,
//   se for vendedor) — LegnoPrecoDe.marca().
// - Fora da aba Projetos (Central, Galeria, My company) NADA muda. O modal
//   Margens também mostra sempre a MINHA config (senão salvar gravaria os
//   números do dealer no meu perfil) — pdState.proprio.
// - Vai junto com o projeto: grava `price_user_id` dentro de
//   user_projects.client_info (jsonb da migration 199) embrulhando
//   getProjectClientInfo/setProjectClientInfo do portal-15 — sem migration.
//   Abrir o projeto traz a escolha de volta; projeto novo volta pra "Eu".
// - Só leitura no banco (user_profiles + dealer_pricing_extras; o admin lê
//   os extras de todos desde a migration 314).
//
// Desligar: localStorage.legno_precode_off = '1'.
// Carregado por último (depois do portal-46). Bancada:
//   node scripts/tests/teste-preco-de.js

const PD_TXT = {
  pt: { grupo: 'Preço de', eu: 'Eu (meu preço)', buscar: 'Buscar usuário ou loja…', vazio: 'Ninguém encontrado.', carregando: 'Carregando usuários…', erro: 'Não consegui ler os usuários.', tip: 'Preço e proposta com as margens de quem?', tip_de: 'Preço e proposta com as margens de {n}', sem_loja: 'Sem loja', admins: 'Fábrica', r_lojista: 'dealer', r_vendedor: 'vendedor', r_administrador: 'admin', r_contractor: 'contractor', r_cliente: 'cliente', desc: 'desc.', mg: 'margem', extras: 'extras' },
  en: { grupo: 'Pricing for', eu: 'Me (my pricing)', buscar: 'Search user or store…', vazio: 'Nobody found.', carregando: 'Loading users…', erro: 'Could not read the users.', tip: 'Price and proposal with whose margins?', tip_de: 'Price and proposal with the margins of {n}', sem_loja: 'No store', admins: 'Factory', r_lojista: 'dealer', r_vendedor: 'salesperson', r_administrador: 'admin', r_contractor: 'contractor', r_cliente: 'client', desc: 'disc.', mg: 'margin', extras: 'extras' },
  es: { grupo: 'Precio de', eu: 'Yo (mi precio)', buscar: 'Buscar usuario o tienda…', vazio: 'Nadie encontrado.', carregando: 'Cargando usuarios…', erro: 'No pude leer los usuarios.', tip: '¿Precio y propuesta con los márgenes de quién?', tip_de: 'Precio y propuesta con los márgenes de {n}', sem_loja: 'Sin tienda', admins: 'Fábrica', r_lojista: 'dealer', r_vendedor: 'vendedor', r_administrador: 'admin', r_contractor: 'contractor', r_cliente: 'cliente', desc: 'desc.', mg: 'margen', extras: 'extras' }
};
function pdT(k, n) {
  let l = 'en';
  try { l = (typeof I18n !== 'undefined' && I18n.getLanguage) ? I18n.getLanguage() : 'en'; } catch (e) { /* en */ }
  const v = (PD_TXT[l] || PD_TXT.en)[k]; const s = v != null ? v : (PD_TXT.en[k] || k);
  return n != null ? s.replace('{n}', n) : s;
}
function pdEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// sel = user_id escolhido (null = eu) · cfg = config de preço já resolvida
// (null = usa a minha) · proprio > 0 = força a MINHA config (modal Margens)
const pdState = { sel: null, cfg: null, perfis: null, extras: {}, carregando: null, erro: false, proprio: 0, aberto: false, filtro: '', seq: 0 };

function pdOn() {
  try { if (localStorage.getItem('legno_precode_off') === '1') return false; } catch (e) { /* segue */ }
  return window.LEGNO_IS_ADMIN === true && typeof currentUser !== 'undefined' && !!currentUser && typeof supabaseClient !== 'undefined';
}
function pdNaAbaProjetos() {
  const aba = document.getElementById('po-tab-projects');
  return !!aba && aba.style.display !== 'none';
}
function pdAtivo() { return !!pdState.cfg && pdState.proprio === 0 && pdOn() && pdNaAbaProjetos(); }

// ---------- os 3 getters do portal-05, embrulhados ----------
const pdOrig = {
  desc: (typeof getFactoryDiscountPct === 'function') ? getFactoryDiscountPct : () => 0,
  mg: (typeof getResaleMarginPct === 'function') ? getResaleMarginPct : () => 0,
  ex: (typeof resolveDealerPricingExtras === 'function') ? resolveDealerPricingExtras : () => []
};
window.getFactoryDiscountPct = function () { return pdAtivo() ? pdState.cfg.desc : pdOrig.desc(); };
window.getResaleMarginPct = function () { return pdAtivo() ? pdState.cfg.mg : pdOrig.mg(); };
window.resolveDealerPricingExtras = function (side) { return pdAtivo() ? pdState.cfg.extras.filter((x) => x.side === side) : pdOrig.ex(side); };

// Modal Margens (e a aba Margens do My company, que usa o mesmo corpo):
// sempre a MINHA config, mesmo com alguém escolhido.
if (typeof renderMarginsModal === 'function') {
  const orig = renderMarginsModal;
  window.renderMarginsModal = function () {
    pdState.proprio++;
    try { return orig.apply(this, arguments); } finally { pdState.proprio--; }
  };
}

// ---------- dados ----------
async function pdCarregaPerfis() {
  if (pdState.perfis) return pdState.perfis;
  if (pdState.carregando) return pdState.carregando;
  pdState.carregando = (async () => {
    const BASE = 'user_id, email, role, parent_dealer_user_id, store_name, store_phone, logo_url, resale_margin_pct, factory_discount_pct';
    const mapa = {}; let campos = BASE + ', seller_margin_pct'; pdState.erro = false;
    for (let de = 0; de < 20000; de += 1000) {
      let r = await supabaseClient.from('user_profiles').select(campos).order('user_id').range(de, de + 999);
      if (r.error && campos !== BASE) { campos = BASE; r = await supabaseClient.from('user_profiles').select(campos).order('user_id').range(de, de + 999); } // sem a migration 320
      if (r.error) { pdState.erro = true; break; }
      (r.data || []).forEach((p) => { mapa[p.user_id] = p; });
      if (!r.data || r.data.length < 1000) break;
    }
    pdState.carregando = null;
    if (pdState.erro && !Object.keys(mapa).length) return null;
    pdState.perfis = mapa;
    return mapa;
  })();
  return pdState.carregando;
}
function pdDono(uid) {
  const p = pdState.perfis && pdState.perfis[uid];
  return p && p.role === 'vendedor' && p.parent_dealer_user_id ? p.parent_dealer_user_id : uid;
}
async function pdCarregaExtras(dono) {
  if (pdState.extras[dono]) return pdState.extras[dono];
  let lista = [];
  try {
    const r = await supabaseClient.from('dealer_pricing_extras').select('*').eq('dealer_user_id', dono).order('sort_order', { ascending: true });
    if (!r.error && Array.isArray(r.data)) lista = r.data;
  } catch (e) { /* fica sem extras */ }
  pdState.extras[dono] = lista;
  return lista;
}
// Mesma regra dos getters do portal-05, só que pro perfil escolhido.
function pdCfgDe(uid) {
  const p = pdState.perfis && pdState.perfis[uid];
  if (!p) return null;
  // vendedor: igual às RPCs get_seller_pricing_config (265) e
  // get_display_resale_margin_pct (320) — SEM dealer pai (parent vazio ou
  // apontando pra perfil que não existe) ele fica sem desconto de fábrica.
  const vend = p.role === 'vendedor';
  const pai = vend ? (pdState.perfis[p.parent_dealer_user_id] || null) : null;
  const d = vend ? (pai || {}) : p;
  const temLoja = vend ? !!pai : (p.role === 'lojista' || p.role === 'administrador');
  let mg = Number(p.resale_margin_pct) || 0;
  if (vend) mg = p.seller_margin_pct != null ? (Number(p.seller_margin_pct) || 0) : (pai && pai.resale_margin_pct != null ? (Number(pai.resale_margin_pct) || 0) : mg);
  return {
    uid,
    desc: temLoja ? (Number(d.factory_discount_pct) || 0) : 0,
    mg: mg > 0 ? mg : 0,
    extras: temLoja ? (pdState.extras[pdDono(uid)] || []) : [],
    semPai: vend && !pai,
    marca: d && d.user_id ? d : p
  };
}
function pdNome(p) {
  if (!p) return '';
  const mail = String(p.email || '').split('@')[0];
  if (p.role === 'lojista' && p.store_name) return p.store_name;
  return mail || p.store_name || String(p.user_id).slice(0, 8);
}

// ---------- escolher ----------
function pdRefazPrecos() {
  try { if (typeof repriceAllProjectSlots === 'function') repriceAllProjectSlots(); } catch (e) { /* segue */ }
  try { if (typeof renderProjectSummary === 'function') renderProjectSummary(); } catch (e) { /* segue */ }
  try { if (typeof renderProjectConfigPanel === 'function') renderProjectConfigPanel(); } catch (e) { /* segue */ }
  try {
    const m = document.getElementById('po-money-modal');
    if (m && m.classList.contains('open') && typeof renderMoneyModal === 'function') renderMoneyModal();
  } catch (e) { /* segue */ }
}
// opts.doProjeto = veio de abrir/limpar um projeto (não marca como alterado)
async function pdEscolhe(uid, opts) {
  opts = opts || {};
  const meu = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.id : null;
  if (!uid || uid === meu) uid = null;
  const mudou = pdState.sel !== uid;
  const vez = ++pdState.seq;
  pdState.sel = uid; pdState.cfg = null;
  if (uid && pdOn()) {
    const perfis = await pdCarregaPerfis();
    if (vez !== pdState.seq) return;
    if (perfis && perfis[uid]) {
      await pdCarregaExtras(pdDono(uid));
      if (vez !== pdState.seq) return;
      pdState.cfg = pdCfgDe(uid);
    }
  }
  pdDesenhaBotao();
  pdRefazPrecos();
  if (mudou && !opts.doProjeto && typeof markProjectDirty === 'function') { try { markProjectDirty(); } catch (e) { /* ok */ } }
}

// ---------- vai junto com o projeto (client_info.price_user_id) ----------
if (typeof getProjectClientInfo === 'function') {
  const orig = getProjectClientInfo;
  window.getProjectClientInfo = function () {
    const c = orig.apply(this, arguments);
    if (!pdState.sel || !pdOn()) return c;
    return Object.assign({}, c || {}, { price_user_id: pdState.sel });
  };
}
if (typeof setProjectClientInfo === 'function') {
  const orig = setProjectClientInfo;
  window.setProjectClientInfo = function (raw) {
    const r = orig.apply(this, arguments);
    const id = raw && typeof raw === 'object' && raw.price_user_id ? String(raw.price_user_id) : null;
    if (id !== pdState.sel || (id && !pdState.cfg)) pdEscolhe(id, { doProjeto: true });
    return r;
  };
}

// ---------- tela ----------
function pdCss() {
  if (document.getElementById('po-pd-css')) return;
  const st = document.createElement('style'); st.id = 'po-pd-css';
  st.textContent = '#po-pd-btn{display:inline-flex;align-items:center;gap:6px;height:32px;max-width:210px;width:auto;margin:0;padding:0 10px;border:1px solid var(--border,#ddd6cb);border-radius:9px;background:var(--panel,#fff);color:var(--text,#2b2621);font-size:12px;font-weight:600;box-shadow:none;cursor:pointer;white-space:nowrap}'
    + '#po-pd-btn:hover{border-color:var(--accent,#8a5a36)}#po-pd-btn .pd-n{overflow:hidden;text-overflow:ellipsis}#po-pd-btn svg{width:15px;height:15px;flex:none}'
    + '#po-pd-btn.pd-outro{background:#2f6f4f;border-color:#2f6f4f;color:#fff}'
    + '#po-pd-pop{position:fixed;z-index:1900;width:340px;max-width:calc(100vw - 16px);background:var(--panel,#fff);border:1px solid var(--border,#ddd6cb);border-radius:12px;box-shadow:0 12px 34px rgba(0,0,0,.18);padding:8px;color:var(--text,#2b2621)}'
    + '#po-pd-pop input{width:100%;box-sizing:border-box;margin:0 0 6px;padding:7px 9px;border:1px solid var(--border,#ddd6cb);border-radius:8px;font-size:13px}'
    + '#po-pd-pop .pd-lista{max-height:min(60vh,460px);overflow:auto}'
    + '#po-pd-pop .pd-g{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--muted,#766f64);padding:8px 6px 3px}'
    + '#po-pd-pop .pd-i{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;cursor:pointer;font-size:13px}'
    + '#po-pd-pop .pd-i:hover{background:var(--accent-light,#f3ece4)}#po-pd-pop .pd-i.pd-sel{background:#e3efe8;font-weight:700}'
    + '#po-pd-pop .pd-i.pd-filho{padding-left:22px}'
    + '#po-pd-pop .pd-i b{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    + '#po-pd-pop .pd-i small{color:var(--muted,#766f64);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    + '#po-pd-pop .pd-i .pd-meio{flex:1;min-width:0;display:flex;flex-direction:column}'
    + '#po-pd-pop .pd-i .pd-pct{flex:none;font-size:11px;color:var(--muted,#766f64);font-variant-numeric:tabular-nums}'
    + '#po-pd-pop .pd-tag{flex:none;font-size:9px;font-weight:700;text-transform:uppercase;border:1px solid var(--border,#ddd6cb);border-radius:5px;padding:1px 4px;color:var(--muted,#766f64)}'
    + '#po-pd-pop .pd-msg{padding:14px 8px;color:var(--muted,#766f64);font-size:13px}';
  document.head.appendChild(st);
}
function pdDesenhaBotao() {
  const btn = document.getElementById('po-pd-btn');
  if (!btn) return;
  const p = pdState.sel && pdState.perfis ? pdState.perfis[pdState.sel] : null;
  const nome = p ? pdNome(p) : pdT('eu');
  btn.classList.toggle('pd-outro', !!pdState.cfg);
  btn.title = pdState.cfg ? pdT('tip_de', nome) : pdT('tip');
  btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.4"/><path d="M5 20c.9-3.6 3.6-5.4 7-5.4s6.1 1.8 7 5.4"/></svg>'
    + '<span class="pd-n">' + pdEsc(nome) + '</span><span>▾</span>';
  const rot = document.querySelector('#po-proj-tb-precode .po-tb-label');
  if (rot) rot.textContent = pdT('grupo');
}
function pdPct(uid) {
  const c = pdCfgDe(uid);
  if (!c) return '';
  const partes = [];
  if (c.desc) partes.push('−' + c.desc + '%');
  if (c.mg) partes.push('+' + c.mg + '%');
  if (c.semPai) partes.push('⚠ sem dealer');
  return partes.join(' · ');
}
function pdLinha(p, filho) {
  const nome = pdNome(p);
  const tag = pdT('r_' + (p.role || 'cliente'));
  return '<div class="pd-i' + (filho ? ' pd-filho' : '') + (pdState.sel === p.user_id ? ' pd-sel' : '') + '" data-pd="' + pdEsc(p.user_id) + '">'
    + '<span class="pd-meio"><b>' + pdEsc(nome) + '</b><small>' + pdEsc(p.email || '') + '</small></span>'
    + '<span class="pd-pct">' + pdEsc(pdPct(p.user_id)) + '</span>'
    + '<span class="pd-tag">' + pdEsc(tag.indexOf('r_') === 0 ? (p.role || '') : tag) + '</span></div>';
}
function pdListaHtml() {
  if (!pdState.perfis) return '<div class="pd-msg">' + pdT(pdState.erro ? 'erro' : 'carregando') + '</div>';
  const meu = currentUser.id;
  const todos = Object.values(pdState.perfis).filter((p) => p.user_id !== meu);
  const f = pdState.filtro.trim().toLowerCase();
  const bate = (p) => {
    if (!f) return true;
    const pai = p.role === 'vendedor' && p.parent_dealer_user_id ? pdState.perfis[p.parent_dealer_user_id] : null;
    return [p.email, p.store_name, pai && pai.store_name, pai && pai.email].some((t) => String(t || '').toLowerCase().indexOf(f) >= 0);
  };
  const ord = (a, b) => pdNome(a).toLowerCase().localeCompare(pdNome(b).toLowerCase());
  const dealers = todos.filter((p) => p.role === 'lojista').sort(ord);
  const idsDealer = {}; dealers.forEach((d) => { idsDealer[d.user_id] = true; });
  const equipe = {};
  todos.forEach((p) => { if (p.role === 'vendedor' && idsDealer[p.parent_dealer_user_id]) (equipe[p.parent_dealer_user_id] = equipe[p.parent_dealer_user_id] || []).push(p); });
  let html = '<div class="pd-i' + (!pdState.sel ? ' pd-sel' : '') + '" data-pd=""><span class="pd-meio"><b>' + pdEsc(pdT('eu')) + '</b></span></div>';
  let n = 0;
  dealers.forEach((d) => {
    const time = (equipe[d.user_id] || []).sort(ord);
    const dOk = bate(d); const tOk = time.filter(bate);
    if (!dOk && !tOk.length) return;
    html += pdLinha(d, false); n++;
    (dOk && !f ? time : tOk).forEach((v) => { html += pdLinha(v, true); n++; });
  });
  const fab = todos.filter((p) => p.role === 'administrador' && bate(p)).sort(ord);
  if (fab.length) { html += '<div class="pd-g">' + pdT('admins') + '</div>'; fab.forEach((p) => { html += pdLinha(p, false); n++; }); }
  const soltos = todos.filter((p) => p.role !== 'lojista' && p.role !== 'administrador' && !(p.role === 'vendedor' && idsDealer[p.parent_dealer_user_id]) && bate(p)).sort(ord);
  if (soltos.length) { html += '<div class="pd-g">' + pdT('sem_loja') + '</div>'; soltos.forEach((p) => { html += pdLinha(p, false); n++; }); }
  if (!n && f) html += '<div class="pd-msg">' + pdT('vazio') + '</div>';
  return html;
}
function pdFecha() {
  pdState.aberto = false;
  const pop = document.getElementById('po-pd-pop');
  if (pop) pop.remove();
}
function pdRedesenhaLista() {
  const l = document.querySelector('#po-pd-pop .pd-lista');
  if (l) l.innerHTML = pdListaHtml();
}
async function pdAbre() {
  if (pdState.aberto) { pdFecha(); return; }
  const btn = document.getElementById('po-pd-btn');
  if (!btn) return;
  pdState.aberto = true; pdState.filtro = '';
  const pop = document.createElement('div'); pop.id = 'po-pd-pop';
  pop.innerHTML = '<input type="text" placeholder="' + pdEsc(pdT('buscar')) + '" autocomplete="off" /><div class="pd-lista">' + pdListaHtml() + '</div>';
  document.body.appendChild(pop);
  const r = btn.getBoundingClientRect();
  pop.style.top = Math.round(r.bottom + 6) + 'px';
  pop.style.left = Math.round(Math.max(8, Math.min(r.right - 340, window.innerWidth - 348))) + 'px';
  const inp = pop.querySelector('input');
  inp.addEventListener('input', () => { pdState.filtro = inp.value; pdRedesenhaLista(); });
  inp.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') pdFecha(); });
  pop.addEventListener('click', (ev) => {
    const it = ev.target.closest ? ev.target.closest('[data-pd]') : null;
    if (!it) return;
    const id = it.getAttribute('data-pd') || null;
    pdFecha();
    pdEscolhe(id);
  });
  try { inp.focus(); } catch (e) { /* ok */ }
  if (!pdState.perfis) { await pdCarregaPerfis(); if (pdState.aberto) pdRedesenhaLista(); }
}
document.addEventListener('pointerdown', (ev) => {
  if (!pdState.aberto) return;
  const t = ev.target;
  if (t && t.closest && (t.closest('#po-pd-pop') || t.closest('#po-pd-btn'))) return;
  pdFecha();
}, true);

function pdMonta() {
  const jaTem = document.getElementById('po-proj-tb-precode');
  if (!pdOn()) { if (jaTem) { jaTem.remove(); pdFecha(); } return; }
  if (jaTem) return;
  const direita = document.querySelector('#po-proj-canvas-tools .po-tb-direita');
  if (!direita || !direita.parentNode) return;
  pdCss();
  const g = document.createElement('div');
  g.className = 'po-tb-group po-tb-group-solo'; g.id = 'po-proj-tb-precode';
  g.innerHTML = '<span class="po-tb-label"></span><div class="po-tb-icons-row"><button type="button" id="po-pd-btn"></button></div>';
  direita.parentNode.insertBefore(g, direita.nextSibling);
  g.querySelector('#po-pd-btn').addEventListener('click', pdAbre);
  pdDesenhaBotao();
  // projeto aberto antes de eu saber que é admin: resolve a escolha agora
  if (pdState.sel && !pdState.cfg) pdEscolhe(pdState.sel, { doProjeto: true });
}
setInterval(pdMonta, 1500);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pdMonta); else pdMonta();

window.LegnoPrecoDe = {
  escolher: (uid) => pdEscolhe(uid),
  atual: () => pdState.sel,
  // perfil cuja logo/loja vai na Proposta (null = o meu, como sempre)
  marca: () => (pdAtivo() ? pdState.cfg.marca : null),
  _state: pdState, _monta: pdMonta
};
