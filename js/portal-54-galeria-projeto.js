// =============================================================================
// GALERIA DO PROJETO NO CARTÃO (2026-11-27, Matt: "gostaria de ver todas as
// imagens do projeto, clicando na foto ela já expande e pode colocar uma seta
// pro lado quando tiver mais do que uma salva, essa por exemplo tem IA").
//
// - Cartão do projeto (lista antiga .po-myproj-card e cartão da Central
//   .cx-pimg): se o projeto tem mais de 1 imagem salva (project_photoreal_photos:
//   render, Render com IA, print), aparecem setas ‹ › na própria foto + "1/3".
//   As setas trocam a foto ali mesmo.
// - Clique na foto: abre a galeria em tela cheia com TODAS as imagens, setas,
//   teclado (← → Esc), etiqueta do tipo, data e baixar.
// Só leitura — não grava nada.
// =============================================================================
(function () {
  const TXT = {
    pt: { render: 'Render', ai: 'Render com IA', print: 'Print', thumb: 'Imagem do projeto', baixar: 'Baixar', fechar: 'Fechar', ant: 'Anterior', prox: 'Próxima', aviso: 'Imagem gerada por IA — vale o projeto do portal.' },
    en: { render: 'Render', ai: 'AI render', print: 'Print', thumb: 'Project image', baixar: 'Download', fechar: 'Close', ant: 'Previous', prox: 'Next', aviso: 'AI-generated image — the portal project prevails.' },
    es: { render: 'Render', ai: 'Render con IA', print: 'Captura', thumb: 'Imagen del proyecto', baixar: 'Descargar', fechar: 'Cerrar', ant: 'Anterior', prox: 'Siguiente', aviso: 'Imagen generada por IA — vale el proyecto del portal.' }
  };
  function t(k) {
    let l = 'pt';
    try { l = (typeof I18n !== 'undefined' && I18n.getLanguage) ? I18n.getLanguage() : 'pt'; } catch (e) { /* pt */ }
    return (TXT[l] || TXT.pt)[k] || TXT.pt[k] || k;
  }
  function tipoDe(row) {
    const c = row && row.camera_state;
    if (c && typeof c === 'object') { if (c.decorated || c.ai_render) return 'ai'; if (c.print) return 'print'; }
    return 'render';
  }

  // ---------- dados (cache por projeto; busca em lote) ----------
  const cache = {};          // pid -> [{url, tipo, quando}]
  const pend = new Set();
  let timer = null;
  function pedir(pid) {
    if (!pid || cache[pid] || pend.has(pid)) return;
    pend.add(pid);
    clearTimeout(timer);
    timer = setTimeout(buscaLote, 120);
  }
  async function buscaLote() {
    const ids = Array.from(pend); pend.clear();
    if (!ids.length || typeof supabaseClient === 'undefined') return;
    try {
      const r = await supabaseClient.from('project_photoreal_photos').select('*').in('project_id', ids).order('created_at', { ascending: false });
      const rows = (r && r.data) || [];
      ids.forEach((pid) => {
        cache[pid] = rows.filter((x) => x.project_id === pid)
          .sort((a, b) => (b.is_cover === true) - (a.is_cover === true))   // ★ capa primeiro
          .map((x) => ({ url: x.image_url, tipo: tipoDe(x), quando: x.created_at }));
      });
    } catch (e) { ids.forEach((pid) => { cache[pid] = cache[pid] || []; }); }
    decoraTudo();
  }
  async function listaDe(pid) {
    if (cache[pid]) return cache[pid];
    pend.add(pid);
    await buscaLote();
    return cache[pid] || [];
  }

  // ---------- CSS ----------
  function css() {
    if (document.getElementById('po-gp-css')) return;
    const st = document.createElement('style'); st.id = 'po-gp-css';
    st.textContent = `
.po-gp-host{position:relative}
.po-gp-host img{cursor:zoom-in}
.po-gp-arr{position:absolute;top:50%;transform:translateY(-50%);width:30px;height:30px;border-radius:50%;border:0;background:rgba(255,255,255,.92);color:#2b2621;box-shadow:0 2px 8px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;z-index:3;opacity:.9}
.po-gp-arr:hover{opacity:1;background:#fff}
.po-gp-arr svg{width:16px;height:16px}
.po-gp-arr.l{left:8px}.po-gp-arr.r{right:8px}
.po-gp-pill{position:absolute;left:8px;bottom:8px;background:rgba(20,18,16,.72);color:#fff;font-size:11px;font-weight:600;padding:3px 8px;border-radius:10px;z-index:3;pointer-events:none;display:flex;gap:6px;align-items:center}
.po-gp-pill .ia{background:#6e4527;border-radius:6px;padding:0 5px}
#po-gp{position:fixed;inset:0;z-index:10080;background:rgba(14,12,10,.92);display:none;flex-direction:column;align-items:center;justify-content:center}
#po-gp.on{display:flex}
#po-gp .gp-top{position:absolute;top:0;left:0;right:0;display:flex;align-items:center;gap:12px;padding:14px 18px;color:#fff;font-size:14px}
#po-gp .gp-tag{background:#fff;color:#2b2621;font-weight:700;font-size:12px;padding:3px 10px;border-radius:12px}
#po-gp .gp-tag.ai{background:#6e4527;color:#fff}
#po-gp .gp-cnt{opacity:.85}
#po-gp .gp-sp{flex:1}
#po-gp .gp-btn{background:rgba(255,255,255,.14);color:#fff;border:0;border-radius:8px;padding:8px 14px;font:inherit;font-size:13px;cursor:pointer;text-decoration:none}
#po-gp .gp-btn:hover{background:rgba(255,255,255,.26)}
#po-gp .gp-img{max-width:calc(100vw - 160px);max-height:calc(100vh - 170px);border-radius:8px;box-shadow:0 10px 50px rgba(0,0,0,.5);user-select:none}
#po-gp .gp-arr{position:absolute;top:50%;transform:translateY(-50%);width:52px;height:52px;border-radius:50%;border:0;background:rgba(255,255,255,.16);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center}
#po-gp .gp-arr:hover{background:rgba(255,255,255,.3)}
#po-gp .gp-arr svg{width:26px;height:26px}
#po-gp .gp-arr.l{left:22px}#po-gp .gp-arr.r{right:22px}
#po-gp .gp-aviso{color:#f3d9c4;font-size:12.5px;margin-top:10px;min-height:16px}
#po-gp .gp-strip{position:absolute;bottom:14px;left:0;right:0;display:flex;gap:8px;justify-content:center;padding:0 18px;overflow-x:auto}
#po-gp .gp-strip img{width:72px;height:50px;object-fit:cover;border-radius:5px;opacity:.55;cursor:pointer;border:2px solid transparent}
#po-gp .gp-strip img.on{opacity:1;border-color:#fff}`;
    document.head.appendChild(st);
  }
  const SETA = (d) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="' + (d < 0 ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7') + '"/></svg>';

  // ---------- galeria em tela cheia ----------
  let gp = null, lista = [], idx = 0;
  function monta() {
    if (gp) return gp;
    css();
    gp = document.createElement('div'); gp.id = 'po-gp';
    gp.innerHTML = '<div class="gp-top"><span class="gp-tag"></span><span class="gp-cnt"></span><span class="gp-quando" style="opacity:.7"></span><span class="gp-sp"></span>'
      + '<a class="gp-btn gp-dl" download="imagem-projeto.png" target="_blank" rel="noopener"></a><button type="button" class="gp-btn gp-x"></button></div>'
      + '<button type="button" class="gp-arr l">' + SETA(-1) + '</button><img class="gp-img" alt="" /><div class="gp-aviso"></div>'
      + '<button type="button" class="gp-arr r">' + SETA(1) + '</button><div class="gp-strip"></div>';
    document.body.appendChild(gp);
    gp.querySelector('.gp-x').addEventListener('click', fecha);
    gp.querySelector('.gp-arr.l').addEventListener('click', (e) => { e.stopPropagation(); vai(-1); });
    gp.querySelector('.gp-arr.r').addEventListener('click', (e) => { e.stopPropagation(); vai(1); });
    gp.addEventListener('click', (e) => { if (e.target === gp) fecha(); });
    document.addEventListener('keydown', (e) => {
      if (!gp.classList.contains('on')) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); fecha(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopImmediatePropagation(); vai(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); e.stopImmediatePropagation(); vai(1); }
    }, true);
    return gp;
  }
  function mostra() {
    const it = lista[idx]; if (!it) return;
    gp.querySelector('.gp-img').src = it.url;
    const tag = gp.querySelector('.gp-tag');
    tag.textContent = t(it.tipo === 'thumb' ? 'thumb' : it.tipo); tag.className = 'gp-tag' + (it.tipo === 'ai' ? ' ai' : '');
    gp.querySelector('.gp-cnt').textContent = lista.length > 1 ? (idx + 1) + ' / ' + lista.length : '';
    gp.querySelector('.gp-quando').textContent = it.quando ? new Date(it.quando).toLocaleString() : '';
    gp.querySelector('.gp-aviso').textContent = it.tipo === 'ai' ? t('aviso') : '';
    const dl = gp.querySelector('.gp-dl'); dl.href = it.url; dl.textContent = '⬇ ' + t('baixar');
    gp.querySelector('.gp-x').textContent = '✕ ' + t('fechar');
    const mult = lista.length > 1;
    gp.querySelectorAll('.gp-arr').forEach((b) => { b.style.display = mult ? 'flex' : 'none'; });
    gp.querySelector('.gp-arr.l').setAttribute('aria-label', t('ant'));
    gp.querySelector('.gp-arr.r').setAttribute('aria-label', t('prox'));
    const strip = gp.querySelector('.gp-strip');
    strip.innerHTML = mult ? lista.map((x, i) => '<img src="' + String(x.url).replace(/"/g, '&quot;') + '" data-i="' + i + '" class="' + (i === idx ? 'on' : '') + '" alt="">').join('') : '';
    strip.querySelectorAll('img').forEach((im) => im.addEventListener('click', (e) => { e.stopPropagation(); idx = Number(im.dataset.i); mostra(); }));
  }
  function vai(d) { if (lista.length < 2) return; idx = (idx + d + lista.length) % lista.length; mostra(); }
  function fecha() { if (gp) gp.classList.remove('on'); }
  async function abrir(pid, srcAtual) {
    monta();
    let l = pid ? await listaDe(pid) : [];
    l = l.slice();
    if (!l.length && srcAtual) l = [{ url: srcAtual, tipo: 'thumb' }];
    if (!l.length) return;
    lista = l;
    const k = srcAtual ? lista.findIndex((x) => x.url === srcAtual) : -1;
    idx = k >= 0 ? k : 0;
    gp.classList.add('on');
    mostra();
  }

  // ---------- setas no cartão ----------
  function pidDoImg(img) {
    const card = img.closest('.po-myproj-card');
    if (card && card.dataset.projId) return card.dataset.projId;
    return img.dataset.pid || null;
  }
  function decora(img) {
    const pid = pidDoImg(img);
    if (!pid) return;
    const host = img.parentElement;
    if (!host) return;
    css();
    host.classList.add('po-gp-host');
    const l = cache[pid];
    if (!l) { pedir(pid); return; }
    if (host.dataset.gpPid === pid && host.querySelector('.po-gp-pill')) return;
    host.dataset.gpPid = pid;
    host.querySelectorAll('.po-gp-arr,.po-gp-pill').forEach((x) => x.remove());
    if (l.length < 2) return;
    let i = Math.max(0, l.findIndex((x) => x.url === img.getAttribute('src')));
    const pill = document.createElement('div'); pill.className = 'po-gp-pill';
    const pinta = () => {
      pill.innerHTML = (i + 1) + ' / ' + l.length + (l[i].tipo === 'ai' ? ' <span class="ia">IA</span>' : '');
    };
    const troca = (d) => (e) => {
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      i = (i + d + l.length) % l.length; img.src = l[i].url; pinta();
    };
    const mk = (cls, d) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'po-gp-arr ' + cls; b.innerHTML = SETA(d); b.setAttribute('aria-label', t(d < 0 ? 'ant' : 'prox')); b.addEventListener('click', troca(d), true); return b; };
    host.appendChild(mk('l', -1)); host.appendChild(mk('r', 1)); host.appendChild(pill);
    pinta();
  }
  const SEL = '.po-myproj-card-image-wrap img, img.cx-pimg';
  function decoraTudo() { document.querySelectorAll(SEL).forEach(decora); }

  // clique na foto do cartão → galeria (captura: passa na frente do lightbox antigo)
  document.addEventListener('click', (e) => {
    const img = e.target && e.target.closest && e.target.closest(SEL);
    if (!img) return;
    const pid = pidDoImg(img);
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    abrir(pid, img.getAttribute('src'));
  }, true);

  let tObs = null;
  new MutationObserver(() => { clearTimeout(tObs); tObs = setTimeout(decoraTudo, 150); })
    .observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });

  // imagem nova gerada no projeto aberto: esquece o cache dele
  window.addEventListener('focus', () => { Object.keys(cache).forEach((k) => delete cache[k]); decoraTudo(); });
  window.LegnoGaleriaProjeto = { abrir };
})();
