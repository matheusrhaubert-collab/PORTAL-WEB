// ==========================================================================
// SAHRA — assistente de design no canto do Projetos (2026-11-05)
// Matt: "quero te colocar lá no projeto pra você dar dicas... canto inferior
// esquerdo... pode fazer o que o botão Auditor faz... o que o botão ? faz...
// só pra administrador, sem mexer no que já está funcionando. Não quero que
// ninguém sinta o que estamos fazendo por aqui."
//
// ETAPA 1 = rosto + painel. Nada de IA nova, nada de banco.
//  - SÓ ADMIN: nada é criado no DOM enquanto window.LEGNO_IS_ADMIN !== true
//    (flag do rpc is_admin(), portal-26). Pra dealer/vendedor este arquivo
//    não faz nada visível.
//  - Não altera nenhum arquivo existente: só LÊ o que o Auditor
//    (window.runProjectAudit / openAuditModal, portal-35) e o Tutorial
//    (window.LegnoHelper, portal-24) já expõem.
//  - Avatar aparece só com o editor de projeto aberto (barra HELP visível).
//  - Selinho = erros + avisos do Auditor, recalculado em tempo ocioso a cada
//    10 s (só admin, só com o editor visível, só com a aba ativa).
//  - Desligar: localStorage 'legno_sahra_off' = '1' (ou window.SAHRA_OFF).
// Imagem: assets/sahra/sahra-avatar.webp
// ==========================================================================
(function () {
  if (window.SAHRA_OFF) return;
  try { if (localStorage.getItem('legno_sahra_off') === '1') return; } catch (e) { /* */ }

  const I18N = {
    pt: {
      hi: 'Oi! Eu sou a SAHRA.', sub: 'Designer da Legno · olho o projeto com você',
      review: 'Revisão do projeto', ok: 'Nada pra corrigir. Projeto redondo!', empty: 'Coloque módulos no projeto que eu começo a revisar.',
      erro: 'erro', erros: 'erros', aviso: 'aviso', avisos: 'avisos', dica: 'dica', dicas: 'dicas',
      ver: 'Ver', fix: 'Corrigir', fix_all: 'Corrigir os automáticos', full: 'Abrir auditor completo', more: 'e mais {{n}}…',
      how: 'Como fazer?', how_ph: 'Pergunte, ex.: como girar um módulo', none: 'Não achei. Tente outras palavras ou abra o Tutorial.', tutorial: 'Abrir Tutorial',
      close: 'Fechar', title: 'SAHRA'
    },
    en: {
      hi: "Hi! I'm SAHRA.", sub: 'Legno designer · reviewing the project with you',
      review: 'Project review', ok: 'Nothing to fix. Clean project!', empty: 'Add cabinets to the project and I will start reviewing.',
      erro: 'error', erros: 'errors', aviso: 'warning', avisos: 'warnings', dica: 'tip', dicas: 'tips',
      ver: 'View', fix: 'Fix', fix_all: 'Fix the automatic ones', full: 'Open full auditor', more: 'and {{n}} more…',
      how: 'How do I…?', how_ph: 'Ask, e.g.: how to rotate a cabinet', none: 'Nothing found. Try other words or open the Tutorial.', tutorial: 'Open Tutorial',
      close: 'Close', title: 'SAHRA'
    },
    es: {
      hi: '¡Hola! Soy SAHRA.', sub: 'Diseñadora de Legno · reviso el proyecto contigo',
      review: 'Revisión del proyecto', ok: 'Nada que corregir. ¡Proyecto impecable!', empty: 'Agrega módulos al proyecto y empiezo a revisar.',
      erro: 'error', erros: 'errores', aviso: 'aviso', avisos: 'avisos', dica: 'consejo', dicas: 'consejos',
      ver: 'Ver', fix: 'Corregir', fix_all: 'Corregir los automáticos', full: 'Abrir auditor completo', more: 'y {{n}} más…',
      how: '¿Cómo hago…?', how_ph: 'Pregunta, ej.: cómo girar un módulo', none: 'No encontré. Prueba otras palabras o abre el Tutorial.', tutorial: 'Abrir Tutorial',
      close: 'Cerrar', title: 'SAHRA'
    }
  };
  const lang = () => { try { return (typeof I18n !== 'undefined' && I18n.getLanguage) ? I18n.getLanguage() : 'pt'; } catch (e) { return 'pt'; } };
  const T = (k, v) => { const d = I18N[lang()] || I18N.pt; let s = d[k] != null ? d[k] : (I18N.pt[k] || k); if (v) Object.keys(v).forEach((x) => { s = s.split('{{' + x + '}}').join(v[x]); }); return s; };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MAX_ITENS = 6;
  const IMG = 'assets/sahra/sahra-avatar.webp?v=202611051140';

  let root = null, painel = null, badge = null, achados = [], aberto = false;

  function isAdmin() { return window.LEGNO_IS_ADMIN === true; }
  function editorVisivel() {
    const el = document.getElementById('po-proj-tb-help');
    return !!(el && el.offsetParent !== null);
  }
  function slotsDoProjeto() {
    try { return (typeof projectSlots !== 'undefined' && projectSlots) ? projectSlots.filter((s) => s && s.module) : []; } catch (e) { return []; }
  }
  function rodaAuditor() {
    if (typeof window.runProjectAudit !== 'function') return [];
    try { return window.runProjectAudit() || []; } catch (e) { console.error('[sahra] auditor', e); return []; }
  }

  function injetaCss() {
    if (document.getElementById('po-sahra-css')) return;
    const st = document.createElement('style');
    st.id = 'po-sahra-css';
    st.textContent = `
#po-sahra { position: fixed; left: 16px; bottom: 16px; z-index: 900; font-family: inherit; }
#po-sahra .sa-av { width: 56px; height: 56px; border-radius: 50%; padding: 0; border: 2px solid #c9a46a; background: #fff center/cover no-repeat;
  box-shadow: 0 4px 14px rgba(0,0,0,.22); cursor: pointer; position: relative; transition: transform .15s ease; }
#po-sahra .sa-av:hover { transform: scale(1.06); background-color: #fff; }
#po-sahra .sa-badge { position: absolute; top: -4px; right: -4px; min-width: 20px; height: 20px; padding: 0 5px; border-radius: 10px;
  font-size: 11px; font-weight: 700; line-height: 20px; color: #fff; background: #b3412e; display: none; box-shadow: 0 0 0 2px #fff; }
#po-sahra .sa-badge.aviso { background: #c98a1a; }
#po-sahra .sa-panel { position: absolute; left: 0; bottom: 68px; width: 340px; max-width: calc(100vw - 32px); max-height: min(560px, calc(100vh - 110px));
  display: none; flex-direction: column; background: #fffdf9; border: 1px solid #e6dccd; border-radius: 14px; box-shadow: 0 12px 34px rgba(0,0,0,.22); overflow: hidden; }
#po-sahra.open .sa-panel { display: flex; }
#po-sahra .sa-head { display: flex; align-items: center; gap: 10px; padding: 12px 14px; background: #f6efe4; border-bottom: 1px solid #e6dccd; }
#po-sahra .sa-head img { width: 40px; height: 40px; border-radius: 50%; border: 1.5px solid #c9a46a; }
#po-sahra .sa-head strong { display: block; font-size: 14px; color: #3a2a1c; }
#po-sahra .sa-head span { display: block; font-size: 11.5px; color: #7a6a58; }
#po-sahra .sa-x { margin-left: auto; background: transparent; color: #7a6a58; border: 0; font-size: 20px; line-height: 1; padding: 2px 6px; cursor: pointer; }
#po-sahra .sa-x:hover { background: transparent; color: #3a2a1c; }
#po-sahra .sa-body { overflow-y: auto; padding: 10px 14px 14px; }
#po-sahra h4 { margin: 8px 0 6px; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: #8a5a34; }
#po-sahra .sa-pills { display: flex; gap: 6px; margin-bottom: 8px; flex-wrap: wrap; }
#po-sahra .sa-pill { font-size: 11px; padding: 2px 8px; border-radius: 10px; background: #eee6da; color: #5a4632; }
#po-sahra .sa-pill.erro { background: #f6dcd6; color: #8e2f20; }
#po-sahra .sa-pill.aviso { background: #f8ead0; color: #8a5a0e; }
#po-sahra .sa-it { display: flex; gap: 8px; align-items: flex-start; padding: 7px 0; border-top: 1px solid #f0e8dc; font-size: 12.5px; }
#po-sahra .sa-it:first-child { border-top: 0; }
#po-sahra .sa-dot { flex: 0 0 8px; height: 8px; border-radius: 50%; margin-top: 5px; background: #9c8b77; }
#po-sahra .sa-it.erro .sa-dot { background: #b3412e; } #po-sahra .sa-it.aviso .sa-dot { background: #c98a1a; }
#po-sahra .sa-it .sa-tx { flex: 1; min-width: 0; color: #3a2a1c; } #po-sahra .sa-it .sa-tx em { display: block; font-style: normal; color: #7a6a58; font-size: 11.5px; }
#po-sahra .sa-it .sa-bt { display: flex; gap: 4px; flex-shrink: 0; }
#po-sahra .sa-it button, #po-sahra .sa-link { font-size: 11px; padding: 3px 8px; }
#po-sahra .sa-ok { color: #3f6b3a; font-size: 12.5px; margin: 4px 0; } #po-sahra .sa-hint { color: #7a6a58; font-size: 12px; margin: 4px 0; }
#po-sahra .sa-acts { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
#po-sahra input.sa-q { width: 100%; box-sizing: border-box; font-size: 12.5px; padding: 7px 9px; border: 1px solid #e0d5c4; border-radius: 8px; }
#po-sahra .sa-res button { display: block; width: 100%; text-align: left; background: transparent; color: #3a2a1c; border: 0; border-top: 1px solid #f0e8dc;
  padding: 7px 2px; font-size: 12.5px; border-radius: 0; cursor: pointer; }
#po-sahra .sa-res button:hover { background: #f6efe4; }
@media (max-width: 600px) { #po-sahra .sa-av { width: 48px; height: 48px; } #po-sahra .sa-panel { bottom: 60px; } }`;
    document.head.appendChild(st);
  }

  function cria() {
    if (root) return;
    injetaCss();
    root = document.createElement('div');
    root.id = 'po-sahra';
    root.style.display = 'none';
    root.innerHTML = `
      <div class="sa-panel" role="dialog" aria-label="SAHRA">
        <div class="sa-head"><img alt="" src="${IMG}"><div><strong data-k="hi"></strong><span data-k="sub"></span></div>
          <button type="button" class="sa-x" aria-label="">&times;</button></div>
        <div class="sa-body">
          <h4 data-k="review"></h4>
          <div class="sa-pills"></div>
          <div class="sa-list"></div>
          <div class="sa-acts"><button type="button" class="secondary sa-link sa-fixall"></button><button type="button" class="secondary sa-link sa-full"></button></div>
          <h4 data-k="how"></h4>
          <input type="search" class="sa-q" autocomplete="off">
          <div class="sa-res"></div>
          <div class="sa-acts"><button type="button" class="secondary sa-link sa-tut"></button></div>
        </div>
      </div>
      <button type="button" class="sa-av" aria-label="SAHRA" style="background-image:url('${IMG}')"><span class="sa-badge"></span></button>`;
    document.body.appendChild(root);
    painel = root.querySelector('.sa-panel');
    badge = root.querySelector('.sa-badge');

    root.querySelector('.sa-av').addEventListener('click', () => (aberto ? fecha() : abre()));
    root.querySelector('.sa-x').addEventListener('click', fecha);
    root.querySelector('.sa-full').addEventListener('click', () => { fecha(); if (typeof window.openAuditModal === 'function') window.openAuditModal(); });
    root.querySelector('.sa-tut').addEventListener('click', () => { fecha(); if (window.LegnoHelper && window.LegnoHelper.abrir) window.LegnoHelper.abrir(); });
    root.querySelector('.sa-fixall').addEventListener('click', () => {
      const comFix = achados.filter((a) => a && a.fix);
      if (!comFix.length) return;
      if (typeof pushProjectUndoState === 'function') { try { pushProjectUndoState(); } catch (e) { /* */ } }
      comFix.forEach((a) => { try { a.fix(); } catch (e) { console.error('[sahra fix]', e); } });
      depoisDeCorrigir();
    });
    root.querySelector('.sa-list').addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-act]');
      if (!b) return;
      const a = achados[Number(b.dataset.idx)];
      if (!a) return;
      if (b.dataset.act === 'ver') {
        fecha();
        if (typeof selectProjectSlot === 'function') { try { selectProjectSlot(a.slotId); } catch (e) { /* */ } }
      } else if (b.dataset.act === 'fix' && a.fix) {
        if (typeof pushProjectUndoState === 'function') { try { pushProjectUndoState(); } catch (e) { /* */ } }
        try { a.fix(); } catch (e) { console.error('[sahra fix]', e); }
        depoisDeCorrigir();
      }
    });
    const q = root.querySelector('.sa-q');
    let tq = null;
    q.addEventListener('input', () => { clearTimeout(tq); tq = setTimeout(() => buscaHelper(q.value), 150); });
    q.addEventListener('keydown', (ev) => { ev.stopPropagation(); }); // não dispara atalhos do canvas
    root.querySelector('.sa-res').addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-q]');
      if (!b || !window.LegnoHelper) return;
      fecha();
      try { window.LegnoHelper.rodar(b.dataset.q); } catch (e) { console.error('[sahra helper]', e); }
    });
    document.addEventListener('keydown', (ev) => { if (aberto && ev.key === 'Escape') fecha(); });
  }

  function textos() {
    root.querySelectorAll('[data-k]').forEach((el) => { el.textContent = T(el.dataset.k); });
    root.querySelector('.sa-x').setAttribute('aria-label', T('close'));
    root.querySelector('.sa-full').textContent = T('full');
    root.querySelector('.sa-fixall').textContent = T('fix_all');
    root.querySelector('.sa-tut').textContent = T('tutorial');
    root.querySelector('.sa-q').placeholder = T('how_ph');
  }

  function depoisDeCorrigir() {
    try { if (typeof renderProjectCanvas === 'function') renderProjectCanvas(); } catch (e) { /* */ }
    try { if (typeof renderProjectConfigPanel === 'function') renderProjectConfigPanel(); } catch (e) { /* */ }
    try { if (typeof markProjectDirty === 'function') markProjectDirty(); } catch (e) { /* */ }
    atualiza(true);
  }

  function nomeSlot(slotId) {
    let todos = [];
    try { todos = (typeof projectSlots !== 'undefined' && projectSlots) ? projectSlots : []; } catch (e) { /* */ }
    const i = todos.findIndex((x) => x && x.id === slotId);
    if (i < 0) return '';
    const s = todos[i];
    return '#' + (i + 1) + ' ' + ((s.module && s.module.name) || s.reference || '');
  }

  function atualiza(renderizar) {
    achados = rodaAuditor();
    const n = { erro: 0, aviso: 0, dica: 0 };
    achados.forEach((a) => { n[a.nivel] = (n[a.nivel] || 0) + 1; });
    const total = n.erro + n.aviso;
    badge.textContent = total > 99 ? '99+' : String(total);
    badge.style.display = total ? 'block' : 'none';
    badge.classList.toggle('aviso', !n.erro && n.aviso > 0);
    if (!renderizar) return;

    const pills = root.querySelector('.sa-pills');
    const list = root.querySelector('.sa-list');
    const fixAll = root.querySelector('.sa-fixall');
    if (!slotsDoProjeto().length) {
      pills.innerHTML = ''; list.innerHTML = `<p class="sa-hint">${esc(T('empty'))}</p>`; fixAll.style.display = 'none'; return;
    }
    const lbl = (k, v) => v + ' ' + T(v === 1 ? k : k + 's');
    pills.innerHTML = `<span class="sa-pill erro">${esc(lbl('erro', n.erro))}</span><span class="sa-pill aviso">${esc(lbl('aviso', n.aviso))}</span><span class="sa-pill">${esc(lbl('dica', n.dica))}</span>`;
    if (!achados.length) { list.innerHTML = `<p class="sa-ok">✓ ${esc(T('ok'))}</p>`; fixAll.style.display = 'none'; return; }
    const vis = achados.slice(0, MAX_ITENS);
    list.innerHTML = vis.map((a, i) => {
      const nome = nomeSlot(a.slotId);
      return `<div class="sa-it ${esc(a.nivel)}"><span class="sa-dot"></span>
        <div class="sa-tx">${esc(a.titulo)}${nome ? ' · ' + esc(nome) : ''}<em>${esc(a.detalhe)}</em></div>
        <div class="sa-bt"><button type="button" class="secondary" data-act="ver" data-idx="${i}">${esc(T('ver'))}</button>${a.fix ? `<button type="button" data-act="fix" data-idx="${i}">${esc(T('fix'))}</button>` : ''}</div></div>`;
    }).join('') + (achados.length > MAX_ITENS ? `<p class="sa-hint">${esc(T('more', { n: achados.length - MAX_ITENS }))}</p>` : '');
    fixAll.style.display = achados.some((a) => a.fix) ? '' : 'none';
  }

  function buscaHelper(texto) {
    const res = root.querySelector('.sa-res');
    if (!texto || texto.trim().length < 2 || !window.LegnoHelper || !window.LegnoHelper.buscar) { res.innerHTML = ''; return; }
    let r = [];
    try { r = window.LegnoHelper.buscar(texto) || []; } catch (e) { r = []; }
    const L = lang();
    if (!r.length) { res.innerHTML = `<p class="sa-hint">${esc(T('none'))}</p>`; return; }
    res.innerHTML = r.slice(0, 5).map((x) => `<button type="button" data-q="${esc(x.q.id)}">${esc(x.q[L] || x.q.pt)}</button>`).join('');
  }

  function abre() {
    aberto = true;
    root.classList.add('open');
    textos();
    atualiza(true);
    const q = root.querySelector('.sa-q');
    q.value = ''; root.querySelector('.sa-res').innerHTML = '';
  }
  function fecha() { aberto = false; if (root) root.classList.remove('open'); }

  // Laço leve: aparece/some conforme admin + editor visível; selinho em tempo ocioso.
  let ultimoAudit = 0;
  function tick() {
    if (!isAdmin()) { if (root) { root.style.display = 'none'; fecha(); } return; }
    cria();
    const vis = editorVisivel();
    root.style.display = vis ? '' : 'none';
    if (!vis) { fecha(); return; }
    if (document.hidden || aberto) return;
    const agora = Date.now();
    if (agora - ultimoAudit < 10000) return;
    ultimoAudit = agora;
    const roda = () => { try { atualiza(false); } catch (e) { /* */ } };
    if (window.requestIdleCallback) window.requestIdleCallback(roda, { timeout: 3000 }); else setTimeout(roda, 0);
  }
  setInterval(tick, 1000);

  window.LegnoSahra = { abrir: () => { cria(); abre(); }, fechar: fecha, atualizar: () => root && atualiza(aberto) };
})();
