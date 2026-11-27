// portal-50-boas-vindas.js — Boas-vindas do 1º acesso (2026-11-25, migration 349)
//
// Matt: "antes da pessoa clicar em qualquer coisa abrir uma tela pedindo o
// telefone, nome, empresa, endereço... salva no banco" + "subir um projeto de
// uma cozinha como exemplo, com um rápido tutorial em vídeo" + "a cozinha
// montada na abertura é só pra usuários novos, primeira vez entrando".
//
// Ordem no login (cada etapa espera a anterior sumir):
//   1. Termos de privacidade (data-terms.js, #dt-ov, z 4000) — já existia.
//   2. Cadastro obrigatório (#bv-ov, z 3900): nome, telefone, empresa
//      (ou "sou homeowner"), endereço. Sem fechar por fora; só "Sair".
//      Quem vê: novos E antigos sem esses dados. Fora: admin e vendedor
//      criado pelo dealer (decidido no banco, my_onboarding()).
//   3. SÓ USUÁRIO NOVO (criado depois da 349): copia a cozinha de exemplo
//      (my_onboarding_copy_example) e abre no Projetos.
//   4. SÓ USUÁRIO NOVO: vídeo tutorial (#bv-vid), na língua do portal:
//      assets/tutorial/tutorial-<en|pt|es>.mp4. Sem o arquivo, pula.
// Botão "Vídeo tutorial" no grupo HELP da barra do projeto, pra todo mundo.
//
// Sem a 349 rodada: my_onboarding dá erro → nada aparece, ninguém trava.
// Desligar: localStorage.legno_boasvindas_off = '1'.
// Admin escolhe a cozinha modelo: LegnoBoasVindas.definirExemplo() com o
// projeto aberto (ou o botão "Usar como exemplo" que aparece pro admin).
(function () {
  'use strict';
  if (window.LegnoBoasVindas) return;
  try { if (localStorage.getItem('legno_boasvindas_off') === '1') return; } catch (e) { /* ok */ }

  const TXT = {
    en: {
      t: 'Welcome to Legno! Tell us about you',
      sub: 'We need this once so we can serve you and prepare your quotes.',
      name: 'Full name', phone: 'Phone', company: 'Company',
      homeowner: "I'm a homeowner (no company)",
      line1: 'Address', line2: 'Suite / unit (optional)', city: 'City', state: 'State', zip: 'ZIP code',
      go: 'Continue', out: 'Sign out', saving: 'Saving…',
      e_name: 'Please type your full name.', e_phone: 'Please type a valid phone number.',
      e_company: 'Please type your company (or check "homeowner").', e_address: 'Please fill in the address, city, state and ZIP code.',
      e_gen: 'Could not save. Try again.',
      loading_ex: 'Opening your example kitchen…',
      vid_t: 'Quick tour — 2 minutes', vid_skip: 'Skip', vid_close: 'Start designing',
      vid_btn: 'Tutorial video', vid_btn_t: 'Watch the tutorial video',
      ex_btn: 'Use as example', ex_q: 'Make THIS saved project the example kitchen that every NEW user gets?', ex_ok: 'Done: new users will get this project.', ex_need: 'Save the project first.'
    },
    pt: {
      t: 'Bem-vindo à Legno! Conte quem é você',
      sub: 'Pedimos só uma vez, pra te atender e preparar seus orçamentos.',
      name: 'Nome completo', phone: 'Telefone', company: 'Empresa',
      homeowner: 'Sou dono(a) do imóvel (sem empresa)',
      line1: 'Endereço', line2: 'Complemento (opcional)', city: 'Cidade', state: 'Estado', zip: 'CEP / ZIP',
      go: 'Continuar', out: 'Sair', saving: 'Salvando…',
      e_name: 'Digite seu nome completo.', e_phone: 'Digite um telefone válido.',
      e_company: 'Digite sua empresa (ou marque "dono do imóvel").', e_address: 'Preencha endereço, cidade, estado e CEP.',
      e_gen: 'Não deu pra salvar. Tente de novo.',
      loading_ex: 'Abrindo sua cozinha de exemplo…',
      vid_t: 'Tour rápido — 2 minutos', vid_skip: 'Pular', vid_close: 'Começar a projetar',
      vid_btn: 'Vídeo tutorial', vid_btn_t: 'Ver o vídeo tutorial',
      ex_btn: 'Usar como exemplo', ex_q: 'Usar ESTE projeto salvo como a cozinha de exemplo que todo usuário NOVO recebe?', ex_ok: 'Pronto: usuários novos vão receber este projeto.', ex_need: 'Salve o projeto primeiro.'
    },
    es: {
      t: '¡Bienvenido a Legno! Cuéntanos quién eres',
      sub: 'Lo pedimos una sola vez, para atenderte y preparar tus cotizaciones.',
      name: 'Nombre completo', phone: 'Teléfono', company: 'Empresa',
      homeowner: 'Soy propietario(a) de la casa (sin empresa)',
      line1: 'Dirección', line2: 'Apto / suite (opcional)', city: 'Ciudad', state: 'Estado', zip: 'Código postal',
      go: 'Continuar', out: 'Salir', saving: 'Guardando…',
      e_name: 'Escribe tu nombre completo.', e_phone: 'Escribe un teléfono válido.',
      e_company: 'Escribe tu empresa (o marca "propietario").', e_address: 'Completa dirección, ciudad, estado y código postal.',
      e_gen: 'No se pudo guardar. Intenta de nuevo.',
      loading_ex: 'Abriendo tu cocina de ejemplo…',
      vid_t: 'Recorrido rápido — 2 minutos', vid_skip: 'Saltar', vid_close: 'Empezar a diseñar',
      vid_btn: 'Video tutorial', vid_btn_t: 'Ver el video tutorial',
      ex_btn: 'Usar como ejemplo', ex_q: '¿Usar ESTE proyecto guardado como la cocina de ejemplo que recibe todo usuario NUEVO?', ex_ok: 'Listo: los usuarios nuevos recibirán este proyecto.', ex_need: 'Guarda el proyecto primero.'
    }
  };
  function lang() { let l = 'en'; try { if (typeof I18n !== 'undefined' && I18n.getLanguage) l = String(I18n.getLanguage()).slice(0, 2); } catch (e) { /* en */ } return TXT[l] ? l : 'en'; }
  function T(k) { return TXT[lang()][k] || TXT.en[k] || k; }
  function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const temTermos = () => !!document.getElementById('dt-ov');
  const ehAdmin = () => window.LEGNO_IS_ADMIN === true;

  function css() {
    if (document.getElementById('bv-css')) return;
    const s = document.createElement('style'); s.id = 'bv-css';
    s.textContent = [
      '#bv-ov{position:fixed;inset:0;z-index:3900;background:rgba(20,17,13,.66);display:flex;align-items:center;justify-content:center;padding:16px}',
      '#bv-ov .bv-box{background:#fff;color:#2a241d;border-radius:14px;width:min(560px,100%);max-height:94vh;overflow:auto;padding:26px 28px;box-shadow:0 24px 60px rgba(0,0,0,.35);font-family:inherit}',
      '#bv-ov h3{margin:0 0 4px;font-size:22px;color:#5b3b22}',
      '#bv-ov .bv-sub{margin:0 0 18px;color:#6b6157;font-size:14px}',
      '#bv-ov .bv-g{display:grid;grid-template-columns:1fr 1fr;gap:10px 12px}',
      '#bv-ov .bv-g .bv-w{grid-column:1/-1}',
      '#bv-ov label.bv-f{display:flex;flex-direction:column;gap:4px;font-size:12.5px;font-weight:600;color:#4a4038}',
      '#bv-ov label.bv-f input{width:100%;box-sizing:border-box;padding:9px 11px;border:1px solid #d6cbbd;border-radius:8px;font-size:14.5px;font-weight:400;color:#2a241d;background:#fff}',
      '#bv-ov label.bv-f input:focus{outline:2px solid #8a5a33;border-color:#8a5a33}',
      '#bv-ov label.bv-f select{width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #d6cbbd;border-radius:8px;font-size:14px;font-weight:400;color:#2a241d;background:#fff}',
      '#bv-ov .bv-pref{margin-top:16px;padding-top:12px;border-top:1px solid #eee4d8}',
      '#bv-ov .bv-pref>b{display:block;font-size:13px;color:#5b3b22;margin-bottom:8px}',
      '#bv-ov .bv-g3{grid-template-columns:1fr 1fr 1fr}',
      '#bv-ov label.bv-f input:disabled{background:#f3efe9;color:#8a8076}',
      '#bv-ov label.bv-chk{grid-column:1/-1;display:flex;align-items:center;gap:8px;font-size:13px;color:#4a4038;cursor:pointer}',
      '#bv-ov label.bv-chk input{width:auto;margin:0}',
      '#bv-ov .bv-err{color:#b3261e;font-size:13px;min-height:18px;margin:12px 0 0}',
      '#bv-ov .bv-acts{display:flex;justify-content:space-between;align-items:center;margin-top:14px}',
      '#bv-ov .bv-out{background:none;border:0;color:#6b6157;text-decoration:underline;cursor:pointer;font-size:13px;padding:6px}',
      '#bv-ov .bv-go{background:#8a5a33;color:#fff;border:0;border-radius:9px;padding:11px 26px;font-size:15px;font-weight:700;cursor:pointer}',
      '#bv-ov .bv-go:disabled{opacity:.55;cursor:default}',
      '@media (max-width:520px){#bv-ov .bv-g{grid-template-columns:1fr}}',
      '#bv-msg{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:3850;background:#2a241d;color:#fff;padding:11px 20px;border-radius:24px;font-size:14px;box-shadow:0 8px 24px rgba(0,0,0,.3)}',
      '#bv-vid{position:fixed;inset:0;z-index:3800;background:rgba(15,12,9,.82);display:flex;align-items:center;justify-content:center;padding:16px}',
      '#bv-vid .bv-vbox{background:#1d1915;border-radius:14px;width:min(1100px,100%);padding:14px 16px 16px;box-shadow:0 24px 60px rgba(0,0,0,.5)}',
      '#bv-vid .bv-vhead{display:flex;justify-content:space-between;align-items:center;color:#f3ece3;margin:0 2px 10px;font-size:16px;font-weight:700}',
      '#bv-vid video{width:100%;max-height:76vh;border-radius:8px;background:#000;display:block}',
      '#bv-vid .bv-vacts{display:flex;justify-content:flex-end;gap:10px;margin-top:12px}',
      '#bv-vid button{border:0;border-radius:9px;padding:9px 18px;font-size:14px;font-weight:700;cursor:pointer}',
      '#bv-vid .bv-skip{background:transparent;color:#cfc4b6;text-decoration:underline}',
      '#bv-vid .bv-start{background:#8a5a33;color:#fff}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function mensagem(txt) {
    let m = document.getElementById('bv-msg');
    if (!txt) { if (m) m.remove(); return; }
    css();
    if (!m) { m = document.createElement('div'); m.id = 'bv-msg'; document.body.appendChild(m); }
    m.textContent = txt;
  }

  // ---------- 2. Cadastro obrigatório ----------
  // Preferências (Matt, 25/11: "aproveitar e colocar língua, unidade de medida
  // e peso"). São os MESMOS seletores do menu ⚙ da barra: mudar aqui = mudar lá.
  const UNIT_KEY = 'legno_dim_unit';
  const UNITS = [['in', 'in (1/32")'], ['ft', 'ft'], ['mm', 'mm'], ['cm', 'cm'], ['m', 'm']];
  const PREF_TXT = {
    en: { pref: 'Preferences', lang: 'Language', unit: 'Measurements', weight: 'Weight' },
    pt: { pref: 'Preferências', lang: 'Idioma', unit: 'Medidas', weight: 'Peso' },
    es: { pref: 'Preferencias', lang: 'Idioma', unit: 'Medidas', weight: 'Peso' }
  };
  const P = (k) => (PREF_TXT[lang()] || PREF_TXT.en)[k];
  const unitAtual = () => (document.getElementById('po-unit-select') || {}).value || 'in';
  const pesoAtual = () => (document.getElementById('po-weight-unit-select') || {}).value || 'lb';
  function aplicaSelect(id, v) {
    const s = document.getElementById(id);
    if (!s || !v || s.value === v) return;
    s.value = v;
    s.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function aplicaPrefs(l, u, w) {
    if (l && l !== lang() && typeof I18n !== 'undefined' && I18n.setLanguage) {
      I18n.setLanguage(l);
      const ls = document.getElementById('po-lang-select'); if (ls) ls.value = l;
    }
    aplicaSelect('po-unit-select', u);
    aplicaSelect('po-weight-unit-select', w);
  }
  // A unidade de medida não ficava salva (voltava pra polegada a cada
  // recarga). Agora fica, igual ao peso.
  function lembraUnidade() {
    const s = document.getElementById('po-unit-select');
    if (!s || s.dataset.bvUnit) return;
    s.dataset.bvUnit = '1';
    let salva = null; try { salva = localStorage.getItem(UNIT_KEY); } catch (e) { /* ok */ }
    if (salva && UNITS.some((x) => x[0] === salva) && salva !== s.value) aplicaSelect('po-unit-select', salva);
    s.addEventListener('change', () => { try { localStorage.setItem(UNIT_KEY, s.value); } catch (e) { /* ok */ } });
  }

  function pedeCadastro(known) {
    return new Promise((resolve) => {
      css();
      const k = Object.assign({}, known || {});
      if (!k._lang) k._lang = lang();
      if (!k._unit) k._unit = unitAtual();
      if (!k._weight) {
        let w = null; try { w = localStorage.getItem('legno_weight_unit'); } catch (e) { /* ok */ }
        k._weight = w || 'lb';   // EUA: libra por padrão no 1º acesso
      }
      const velho = document.getElementById('bv-ov'); if (velho) velho.remove();
      const ov = document.createElement('div'); ov.id = 'bv-ov';
      const f = (id, lab, val, cls, extra) => '<label class="bv-f ' + (cls || '') + '">' + esc(lab) + '<input id="' + id + '" value="' + esc(val || '') + '" ' + (extra || '') + '></label>';
      const sel = (id, lab, ops, val) => '<label class="bv-f">' + esc(lab) + '<select id="' + id + '">'
        + ops.map((o) => '<option value="' + esc(o[0]) + '"' + (o[0] === val ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select></label>';
      ov.innerHTML = '<form class="bv-box" role="dialog" aria-modal="true" novalidate><h3>' + esc(T('t')) + '</h3><p class="bv-sub">' + esc(T('sub')) + '</p>'
        + '<div class="bv-g">'
        + f('bv-name', T('name'), k.name, 'bv-w', 'autocomplete="name" maxlength="120"')
        + f('bv-phone', T('phone'), k.phone, '', 'type="tel" autocomplete="tel" maxlength="40"')
        + f('bv-company', T('company'), k.company === 'Homeowner' ? '' : k.company, '', 'autocomplete="organization" maxlength="120"')
        + '<label class="bv-chk"><input type="checkbox" id="bv-home"' + (k.company === 'Homeowner' ? ' checked' : '') + '><span>' + esc(T('homeowner')) + '</span></label>'
        + f('bv-line1', T('line1'), k.line1, 'bv-w', 'autocomplete="address-line1" maxlength="160"')
        + f('bv-line2', T('line2'), k.line2, 'bv-w', 'autocomplete="address-line2" maxlength="80"')
        + f('bv-city', T('city'), k.city, '', 'autocomplete="address-level2" maxlength="80"')
        + f('bv-state', T('state'), k.state, '', 'autocomplete="address-level1" maxlength="40"')
        + f('bv-zip', T('zip'), k.zip, '', 'autocomplete="postal-code" maxlength="12"')
        + '</div>'
        + '<div class="bv-pref"><b>' + esc(P('pref')) + '</b><div class="bv-g bv-g3">'
        + sel('bv-lang', P('lang'), [['en', 'English'], ['pt', 'Português'], ['es', 'Español']], k._lang)
        + sel('bv-unit', P('unit'), UNITS, k._unit)
        + sel('bv-weight', P('weight'), [['lb', 'lb'], ['kg', 'kg']], k._weight)
        + '</div></div>'
        + '<p class="bv-err" id="bv-err"></p>'
        + '<div class="bv-acts"><button type="button" class="bv-out" id="bv-out">' + esc(T('out')) + '</button>'
        + '<button type="submit" class="bv-go" id="bv-go">' + esc(T('go')) + '</button></div></form>';
      document.body.appendChild(ov);
      const $ = (q) => ov.querySelector(q);
      const home = $('#bv-home'), comp = $('#bv-company');
      const syncHome = () => { comp.disabled = home.checked; if (home.checked) comp.value = ''; };
      home.addEventListener('change', syncHome); syncHome();
      const valores = () => {
        const g = (id) => ($(id) ? $(id).value : '');
        return { name: g('#bv-name'), phone: g('#bv-phone'), company: home.checked ? 'Homeowner' : g('#bv-company'),
          line1: g('#bv-line1'), line2: g('#bv-line2'), city: g('#bv-city'), state: g('#bv-state'), zip: g('#bv-zip'),
          _lang: g('#bv-lang'), _unit: g('#bv-unit'), _weight: g('#bv-weight') };
      };
      // trocar a língua já muda o portal e redesenha a janela nela (mantém o digitado)
      $('#bv-lang').addEventListener('change', () => {
        const v = valores();
        aplicaPrefs(v._lang, null, null);
        ov.remove();
        pedeCadastro(v).then(resolve);
      });
      // nada atrás recebe teclado enquanto a janela está aberta
      ov.addEventListener('keydown', (e) => e.stopPropagation());
      $('#bv-out').addEventListener('click', async () => {
        try { await supabaseClient.auth.signOut(); } catch (e) { /* sai de qualquer jeito */ }
        window.location.reload();
      });
      ov.querySelector('form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const v = (id) => ($(id).value || '').trim();
        const err = $('#bv-err'); err.textContent = '';
        if (v('#bv-name').length < 2) { err.textContent = T('e_name'); $('#bv-name').focus(); return; }
        if (v('#bv-phone').replace(/\D/g, '').length < 7) { err.textContent = T('e_phone'); $('#bv-phone').focus(); return; }
        if (!home.checked && !v('#bv-company')) { err.textContent = T('e_company'); comp.focus(); return; }
        if (!v('#bv-line1') || !v('#bv-city') || !v('#bv-state') || !v('#bv-zip')) { err.textContent = T('e_address'); return; }
        const go = $('#bv-go'); go.disabled = true; go.textContent = T('saving');
        const r = await supabaseClient.rpc('my_onboarding_submit', {
          p_name: v('#bv-name'), p_phone: v('#bv-phone'), p_company: home.checked ? '' : v('#bv-company'),
          p_line1: v('#bv-line1'), p_line2: v('#bv-line2'), p_city: v('#bv-city'), p_state: v('#bv-state'), p_zip: v('#bv-zip'),
          p_homeowner: home.checked
        });
        if (r.error) {
          const m = String(r.error.message || '');
          err.textContent = /name_required/.test(m) ? T('e_name') : /phone_required/.test(m) ? T('e_phone')
            : /company_required/.test(m) ? T('e_company') : /address_required/.test(m) ? T('e_address') : T('e_gen') + ' ' + m;
          go.disabled = false; go.textContent = T('go');
          return;
        }
        aplicaPrefs($('#bv-lang').value, $('#bv-unit').value, $('#bv-weight').value);
        ov.remove();
        resolve(true);
      });
      setTimeout(() => { const n = $('#bv-name'); (n.value ? $('#bv-phone') : n).focus(); }, 60);
    });
  }

  // ---------- 3. Cozinha de exemplo (só usuário novo) ----------
  async function abreExemplo() {
    // catálogo de módulos precisa estar carregado (ver restoreFavoriteProject)
    for (let i = 0; i < 120; i++) {
      if (typeof modulesCatalogLoaded !== 'undefined' && modulesCatalogLoaded) break;
      await espera(250);
    }
    mensagem(T('loading_ex'));
    try {
      const r = await supabaseClient.rpc('my_onboarding_copy_example');
      const d = (r && r.data) || {};
      if (r.error || !d.ok || !d.project_id) return false;
      const row = await supabaseClient.from('user_projects').select('*').eq('id', d.project_id).maybeSingle();
      if (row.error || !row.data) return false;
      const btn = document.querySelector('#po-sidebar .portal-tab-btn[data-tab="po-tab-projects"]');
      if (btn && document.getElementById('po-tab-projects') && document.getElementById('po-tab-projects').style.display === 'none') btn.click();
      if (typeof restoreFavoriteProject === 'function') await restoreFavoriteProject(row.data);
      return true;
    } catch (e) {
      console.warn('[boas-vindas] exemplo', e);
      return false;
    } finally { mensagem(''); }
  }

  // ---------- 4. Vídeo ----------
  function videoUrl(l) { return 'assets/tutorial/tutorial-' + l + '.mp4'; }
  async function videoExiste(url) {
    try { const r = await fetch(url, { method: 'HEAD', cache: 'no-store' }); return r.ok; } catch (e) { return false; }
  }
  async function abreVideo(marcar) {
    css();
    let url = videoUrl(lang());
    if (!(await videoExiste(url))) { url = videoUrl('en'); if (!(await videoExiste(url))) return false; }
    const velho = document.getElementById('bv-vid'); if (velho) velho.remove();
    const ov = document.createElement('div'); ov.id = 'bv-vid';
    ov.innerHTML = '<div class="bv-vbox" role="dialog" aria-modal="true"><div class="bv-vhead"><span>' + esc(T('vid_t')) + '</span></div>'
      + '<video src="' + esc(url) + '" controls playsinline preload="auto"></video>'
      + '<div class="bv-vacts"><button type="button" class="bv-skip">' + esc(T('vid_skip')) + '</button><button type="button" class="bv-start">' + esc(T('vid_close')) + '</button></div></div>';
    document.body.appendChild(ov);
    const vid = ov.querySelector('video');
    const fecha = () => {
      try { vid.pause(); } catch (e) { /* ok */ }
      ov.remove();
      if (marcar) supabaseClient.rpc('my_onboarding_video_seen').then(() => {}, () => {});
    };
    ov.querySelector('.bv-skip').addEventListener('click', fecha);
    ov.querySelector('.bv-start').addEventListener('click', fecha);
    ov.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') fecha(); });
    // clicar fora NÃO fecha (regra do portal pra janela importante)
    vid.play().catch(() => { /* navegador pediu clique: fica o play */ });
    return true;
  }

  // Botão no grupo HELP da barra do projeto (todo mundo)
  function montaBotao() {
    const row = document.querySelector('#po-proj-tb-help .po-tb-icons-row');
    if (!row) return;
    if (!row.querySelector('#po-bv-video-btn')) montaVideoBtn(row);
    if (ehAdmin() && !row.querySelector('#po-bv-ex-btn')) montaExBtn(row);
  }
  function montaVideoBtn(row) {
    const b = document.createElement('button');
    b.type = 'button'; b.id = 'po-bv-video-btn'; b.className = 'po-tb-icon-card po-tb-icon-only';
    b.title = T('vid_btn_t'); b.setAttribute('aria-label', T('vid_btn'));
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M10.2 9.2v5.6l4.6-2.8z" fill="currentColor"/></svg>';
    b.addEventListener('click', () => abreVideo(false));
    row.appendChild(b);
  }
  function montaExBtn(row) {
    {
      const a = document.createElement('button');
      a.type = 'button'; a.id = 'po-bv-ex-btn'; a.className = 'po-tb-icon-card po-tb-icon-only';
      a.title = T('ex_btn'); a.setAttribute('aria-label', T('ex_btn'));
      a.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.8z"/></svg>';
      a.addEventListener('click', () => definirExemplo());
      row.appendChild(a);
    }
  }

  async function definirExemplo() {
    const p = (typeof loadedProjectFavorite !== 'undefined') ? loadedProjectFavorite : null;
    if (!p || !p.id) { alert(T('ex_need')); return; }
    if (!confirm(T('ex_q') + '\n\n"' + (p.name || '') + '"')) return;
    const r = await supabaseClient.rpc('admin_set_onboarding_example', { p_project: p.id, p_name: null });
    alert(r.error ? (T('e_gen') + ' ' + r.error.message) : T('ex_ok'));
  }

  // ---------- Fluxo ----------
  let feitoPara = null, rodando = false;
  async function fluxo() {
    if (rodando || typeof currentUser === 'undefined' || !currentUser || typeof supabaseClient === 'undefined') {
      if (typeof currentUser === 'undefined' || !currentUser) feitoPara = null;
      return;
    }
    if (feitoPara === currentUser.id) return;
    rodando = true;
    try {
      const r = await supabaseClient.rpc('my_onboarding');
      if (r.error) { feitoPara = currentUser.id; return; }          // sem a migration 349: não trava ninguém
      feitoPara = currentUser.id;
      let s = r.data || {};
      if (s.needed) {
        while (temTermos()) await espera(400);                       // Termos primeiro
        await pedeCadastro(s.known);
      }
      if (s.example_needed) await abreExemplo();
      if (s.video_needed) {
        while (temTermos() || document.getElementById('bv-ov')) await espera(400);
        await espera(600);
        await abreVideo(true);
      }
    } catch (e) {
      console.warn('[boas-vindas]', e);
    } finally { rodando = false; }
  }

  window.LegnoBoasVindas = { fluxo, abreVideo: () => abreVideo(false), definirExemplo, cadastro: (k) => pedeCadastro(k) };
  setInterval(() => { try { montaBotao(); lembraUnidade(); } catch (e) { /* ok */ } fluxo(); }, 800);
})();
