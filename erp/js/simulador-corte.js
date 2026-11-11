/* ============================================================
   SIMULADOR DE CORTE — passo a passo, como a seccionadora faz
   ============================================================
   Pedido do Matt (10/11): "faz um simulador igual da máquina mostrando como
   fica o corte etapa por etapa, pra eu clicar no plano e visualizar".

   NÃO tem regra própria: monta a MESMA árvore que vai no XML da Samach
   (MAQUINA_EXPORT._itensDaChapa → _orientar → _montarNo) e anda nela na
   ordem em que a máquina trabalha (abre as faixas de um nó, depois pega a
   ÚLTIMA faixa cortada primeiro — ver _serializarPainel). O que aparece
   aqui é o que o arquivo manda cortar; se o simulador mostrar um corte
   bobo, o arquivo tem esse corte.

   A chapa fica parada no desenho (mesma posição do plano). Quando a
   máquina vira o material, o simulador destaca a faixa e a linha de corte
   muda de sentido.

   SIMCORTE.registrar(sheet, params, titulo) → índice (sheet no formato do
   NESTING.sheetSVG + source); SIMCORTE.abrir(índice); SIMCORTE.passos()
   é a parte pura (sem tela), usada pela bancada
   scripts/tests/teste-simulador-corte.js. */
window.SIMCORTE = (function () {
  const S = { lista: [] };
  function mm(v) { return String(Math.round(Number(v) || 0)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  S.registrar = function (sheet, params, titulo) {
    S.lista.push({ sheet: sheet, params: params || {}, titulo: titulo || '' });
    return S.lista.length - 1;
  };

  /* Passos de uma chapa. Devolve { W, H, atravessada, passos:[{ tipo, texto,
     no:{x,y,w,h}|null, linha:{x1,y1,x2,y2}|null, solta:[{k,r,label}],
     cortes, viradas }], pecas } — tudo já no referencial da chapa. */
  S.passos = function (sheet, params) {
    params = params || {};
    const kerf = Number(params.kerf_mm) || 4;
    const ctx = {
      kerf: kerf,
      trimLeft: Number(params.trim_left_mm) || 0, trimTop: Number(params.trim_top_mm) || 0,
      trimRight: Number(params.trim_right_mm) || 0, trimBottom: Number(params.trim_bottom_mm) || 0,
      trimRetalho: NESTING.retalhoTrim(params),
      eps: 0.15, tightEps: 0.2, offcutCounterRef: { n: 0 }, offcutRows: [],
      codeOf: function () { return 0; }
    };
    const sh = {
      id: 'sim', source: sheet.source, width_mm: Number(sheet.width), height_mm: Number(sheet.height),
      offcuts_json: (sheet.offcuts || []).map(function (o) { return { x: o.x, y: o.y, w: o.w, h: o.h }; }),
      _pieces: (sheet.placed || []).map(function (p) {
        return { x_mm: p.x, y_mm: p.y, w_mm: p.w, h_mm: p.h, _label: (p.piece && p.piece.label) || '' };
      })
    };
    const items = MAQUINA_EXPORT._itensDaChapa(sh, ctx);
    if (!items.length) return null;
    const ori = MAQUINA_EXPORT._orientar(sh, items, ctx);
    const root = MAQUINA_EXPORT._montarNo(ori.items, 'y', 1, ori.rootL, ori.rootW, ctx, false, 0, 0);
    const T = function (r) { return ori.atravessada ? { x: r.y, y: r.x, w: r.h, h: r.w } : r; };
    const TL = function (l) { return ori.atravessada ? { x1: l.y1, y1: l.x1, x2: l.y2, y2: l.x2 } : l; };
    const passos = [];
    let nCorte = 0, nVira = 0;
    function push(p) { p.solta = []; p.cortes = nCorte; p.viradas = nVira; passos.push(p); return p; }
    function desc(s) {
      const d = ' (' + mm(Math.max(s.r.w, s.r.h)) + ' × ' + mm(Math.min(s.r.w, s.r.h)) + ')';
      if (s.k === 'peca') return 'a peça ' + (s.label ? s.label : '') + d;
      if (s.k === 'retalho') return 'o retalho ' + s.label + d;
      return 'uma faixa' + d + ', que vai ser virada';
    }
    function walk(node, raiz) {
      const y = node.axis === 'y';
      const ini = y ? node.y : node.x, limit = ini + node.l;
      const R = T(y ? { x: node.x, y: node.y, w: node.w, h: node.l } : { x: node.x, y: node.y, w: node.l, h: node.w });
      const sub = function (a, b) { return T(y ? { x: node.x, y: a, w: node.w, h: b - a } : { x: a, y: node.y, w: b - a, h: node.w }); };
      const linha = function (v) { return TL(y ? { x1: node.x, y1: v, x2: node.x + node.w, y2: v } : { x1: v, y1: node.y, x2: v, y2: node.y + node.w }); };
      let ultimo;
      if (raiz) {
        ultimo = push({ tipo: 'inicio', no: R, linha: null,
          texto: 'Chapa ' + mm(sh.width_mm) + ' × ' + mm(sh.height_mm) + ' entra ' + (ori.atravessada ? 'ATRAVESSADA (cortes no sentido da largura)' : 'DEITADA (cortes no sentido do comprimento)') });
      } else {
        nVira++;
        ultimo = push({ tipo: 'vira', no: R, linha: null, texto: 'Vira e pega a faixa de ' + mm(node.l) + ' × ' + mm(node.w) });
      }
      let pos = ini + node.trim;
      if (node.trim > 0.05) {
        nCorte++;
        ultimo = push({ tipo: 'refile', no: R, linha: linha(pos - kerf / 2), texto: 'Refile: tira ' + mm(node.trim) + ' mm da borda' });
        ultimo.solta.push({ k: 'sobra', r: sub(ini, Math.max(ini, pos - kerf)) });
      }
      node.parts.forEach(function (p) {
        const fim = pos + p.cut;
        let solto;
        if (p.leaf) {
          const it = p.leaf.item;
          solto = it.kind === 'piece'
            ? { k: 'peca', r: sub(pos, fim), label: (it.ref && it.ref._label) || '' }
            : { k: 'retalho', r: sub(pos, fim), label: 'OC' + it.ocNumber };
        } else solto = { k: 'faixa', r: sub(pos, fim) };
        if (fim < limit - 0.05) {
          nCorte++;
          ultimo = push({ tipo: 'corte', no: R, linha: linha(fim + kerf / 2), texto: 'Corta a ' + mm(p.cut) + ' mm — solta ' + desc(solto) });
          ultimo.solta.push(solto);
        } else {
          // fatia vai até o fim da faixa: não tem corte, é o que resta
          ultimo.solta.push(solto);
          ultimo.texto += ' · o que resta é ' + desc(solto) + ', sem corte';
        }
        pos = fim + kerf;
      });
      if (limit - pos > 0.5) ultimo.solta.push({ k: 'sobra', r: sub(pos, limit) });
      for (let i = node.parts.length - 1; i >= 0; i--) if (node.parts[i].child) walk(node.parts[i].child, false);
    }
    walk(root, true);
    push({ tipo: 'fim', no: null, linha: null, texto: 'Chapa pronta — ' + nCorte + ' cortes e ' + nVira + ' virada(s)' });
    return { W: sh.width_mm, H: sh.height_mm, atravessada: ori.atravessada, passos: passos, pecas: sh._pieces.length, cortes: nCorte, viradas: nVira };
  };

  /* Desenho do passo k (SVG em texto). */
  S.svg = function (sim, k, maxW) {
    const sc = (maxW || 900) / sim.W;
    const w = Math.round(sim.W * sc), h = Math.round(sim.H * sc);
    const f = function (v) { return (v * sc).toFixed(1); };
    const rect = function (r, attrs) { return '<rect x="' + f(r.x) + '" y="' + f(r.y) + '" width="' + f(Math.max(0, r.w)) + '" height="' + f(Math.max(0, r.h)) + '" ' + attrs + '/>'; };
    const atual = sim.passos[k];
    let s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" style="background:#efe9dc;border:2px solid #2b2b2b;max-width:100%;height:auto;display:block">' +
      '<defs><pattern id="sim-sobra" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">' +
      '<rect width="8" height="8" fill="#dcd8cf"/><line x1="0" y1="0" x2="0" y2="8" stroke="#9c968a" stroke-width="2"/></pattern></defs>' +
      '<rect x="0" y="0" width="' + w + '" height="' + h + '" fill="#efe9dc"/>';
    // tudo que a chapa vai virar, bem claro (o "desenho do plano" ao fundo)
    sim.passos.forEach(function (p) {
      p.solta.forEach(function (o) {
        if (o.k === 'peca') s += rect(o.r, 'fill="none" stroke="#b7ad98" stroke-width="0.8" stroke-dasharray="3 3"');
      });
    });
    // fora da faixa que está na máquina: esmaecido
    if (atual.no) {
      const n = atual.no;
      s += '<path fill-rule="evenodd" fill="#ffffff" opacity="0.55" d="M0 0H' + w + 'V' + h + 'H0Z M' + f(n.x) + ' ' + f(n.y) + 'h' + f(n.w) + 'v' + f(n.h) + 'h-' + f(n.w) + 'Z"/>';
    }
    // o que já saiu
    for (let i = 0; i <= k; i++) {
      const novo = i === k;
      sim.passos[i].solta.forEach(function (o) {
        if (o.k === 'faixa') return;
        if (o.k === 'sobra') { s += rect(o.r, 'fill="url(#sim-sobra)" stroke="#9c968a" stroke-width="0.6"'); return; }
        const peca = o.k === 'peca';
        s += rect(o.r, 'fill="' + (peca ? '#bfe3c5' : '#f6e7a1') + '" stroke="' + (peca ? '#2f7d43' : '#a8891a') + '" stroke-width="' + (novo ? 2.5 : 1) + '"' + (peca ? '' : ' stroke-dasharray="6 3"'));
        const pw = o.r.w * sc, ph = o.r.h * sc;
        const med = mm(o.r.w) + ' × ' + mm(o.r.h);
        const cx = ((o.r.x + o.r.w / 2) * sc).toFixed(1), cy = (o.r.y + o.r.h / 2) * sc;
        const fs = Math.max(8, Math.min(12, Math.min(pw, ph) / 4));
        if (pw > 70 && ph > 30) {
          s += '<text x="' + cx + '" y="' + (cy - 2).toFixed(1) + '" font-size="' + fs.toFixed(1) + '" text-anchor="middle" fill="#1d2b20">' + esc(peca ? (o.label || 'peça') : 'retalho ' + o.label) + '</text>' +
            '<text x="' + cx + '" y="' + (cy + fs).toFixed(1) + '" font-size="' + fs.toFixed(1) + '" text-anchor="middle" fill="#3f5142">' + med + '</text>';
        } else if (pw > 44 && ph > 13) {
          s += '<text x="' + cx + '" y="' + (cy + 3.5).toFixed(1) + '" font-size="9" text-anchor="middle" fill="#1d2b20">' + mm(o.r.w) + '×' + mm(o.r.h) + '</text>';
        }
      });
    }
    // cortes já feitos (finos) e o corte de agora (vermelho)
    for (let i = 0; i < k; i++) {
      const l = sim.passos[i].linha;
      if (l) s += '<line x1="' + f(l.x1) + '" y1="' + f(l.y1) + '" x2="' + f(l.x2) + '" y2="' + f(l.y2) + '" stroke="#3a3a3a" stroke-width="1.2"/>';
    }
    if (atual.no) s += rect(atual.no, 'fill="none" stroke="#e08a00" stroke-width="3"');
    if (atual.linha) {
      const l = atual.linha;
      s += '<line x1="' + f(l.x1) + '" y1="' + f(l.y1) + '" x2="' + f(l.x2) + '" y2="' + f(l.y2) + '" stroke="#d11f1f" stroke-width="4" stroke-linecap="round"/>';
    }
    return s + '</svg>';
  };

  /* ---------------- tela ---------------- */
  let st = null;
  S.fechar = function () {
    if (!st) return;
    clearInterval(st.timer);
    document.removeEventListener('keydown', st.onKey, true);
    st.el.remove();
    st = null;
  };
  S.clique = function (ev, idx) {
    if (ev && ev.target && ev.target.closest && ev.target.closest('.erp-nest-piece')) return; // peça abre o 3D dela
    S.abrir(idx);
  };
  S.abrir = function (idx) {
    const reg = S.lista[idx];
    if (!reg) return;
    S.fechar();
    let sim = null;
    try { sim = S.passos(reg.sheet, reg.params); } catch (e) { console.error('[simulador de corte]', e); }
    const el = document.createElement('div');
    el.id = 'erp-simcorte';
    el.style.cssText = 'position:fixed;inset:0;z-index:5000;background:rgba(20,20,20,.6);display:flex;align-items:center;justify-content:center;padding:14px';
    if (!sim) {
      el.innerHTML = '<div style="background:#fff;border-radius:10px;padding:22px;max-width:420px">Não consegui montar a sequência de corte desta chapa.' +
        '<div style="margin-top:14px;text-align:right"><button class="erp-btn-secondary erp-btn-sm" onclick="SIMCORTE.fechar()">Fechar</button></div></div>';
      document.body.appendChild(el);
      st = { el: el, timer: null, onKey: function (e) { if (e.key === 'Escape') S.fechar(); } };
      document.addEventListener('keydown', st.onKey, true);
      return;
    }
    // cor, largura e fonte explícitas: o CSS do ERP pinta <button> de texto branco e estica <select> em 100%
    const btn = 'type="button" style="padding:7px 13px;border:1px solid #c9c3b6;border-radius:7px;background:#fff;color:#222;cursor:pointer;font-size:14px;line-height:1.2;width:auto;min-width:0;margin:0;white-space:nowrap"';
    el.innerHTML =
      '<div style="background:#fff;border-radius:10px;width:min(1280px,100%);max-height:100%;display:flex;flex-direction:column;overflow:hidden">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid #e5e0d6">' +
          '<div><b>Simulador de corte</b> — ' + esc(reg.titulo) + ' <span style="color:#7c766c">· ' + sim.pecas + ' peças · ' + sim.cortes + ' cortes · ' + sim.viradas + ' virada(s)</span></div>' +
          '<button ' + btn + ' onclick="SIMCORTE.fechar()" title="Fechar (Esc)">✕</button>' +
        '</div>' +
        '<div style="display:flex;gap:14px;padding:14px 16px;min-height:0;flex:1;flex-wrap:wrap;overflow:auto">' +
          '<div style="flex:1 1 620px;min-width:0">' +
            '<div id="sim-desenho"></div>' +
            '<div id="sim-texto" style="margin-top:10px;font-size:15px;font-weight:600;min-height:42px"></div>' +
            '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:6px">' +
              '<button ' + btn + ' data-a="ini" title="Começo">⏮</button>' +
              '<button ' + btn + ' data-a="ant" title="Passo anterior (←)">◀</button>' +
              '<button ' + btn + ' data-a="play" id="sim-play" title="Tocar / pausar (espaço)">▶ Tocar</button>' +
              '<button ' + btn + ' data-a="prox" title="Próximo passo (→)">▶</button>' +
              '<button ' + btn + ' data-a="fim" title="Fim">⏭</button>' +
              '<input id="sim-range" type="range" min="0" max="' + (sim.passos.length - 1) + '" value="0" style="flex:1 1 140px;min-width:140px;width:auto;margin:0">' +
              '<select id="sim-vel" title="Velocidade" style="padding:6px;border:1px solid #c9c3b6;border-radius:7px;width:auto;flex:0 0 auto;margin:0;color:#222;background:#fff">' +
                '<option value="1800">lento</option><option value="1000" selected>normal</option><option value="450">rápido</option></select>' +
            '</div>' +
            '<div style="margin-top:10px;font-size:12px;color:#6f6a60;display:flex;gap:14px;flex-wrap:wrap">' +
              '<span><span style="display:inline-block;width:18px;border-top:4px solid #d11f1f;vertical-align:middle"></span> corte de agora</span>' +
              '<span><span style="display:inline-block;width:12px;height:12px;border:3px solid #e08a00;vertical-align:middle"></span> faixa na máquina</span>' +
              '<span><span style="display:inline-block;width:12px;height:12px;background:#bfe3c5;border:1px solid #2f7d43;vertical-align:middle"></span> peça pronta</span>' +
              '<span><span style="display:inline-block;width:12px;height:12px;background:#f6e7a1;border:1px dashed #a8891a;vertical-align:middle"></span> retalho guardado</span>' +
              '<span><span style="display:inline-block;width:12px;height:12px;background:#dcd8cf;border:1px solid #9c968a;vertical-align:middle"></span> sobra (lixo)</span>' +
            '</div>' +
          '</div>' +
          '<ol id="sim-lista" style="flex:0 1 330px;margin:0;padding:0;list-style:none;overflow:auto;max-height:70vh;border:1px solid #e5e0d6;border-radius:8px;font-size:13px"></ol>' +
        '</div>' +
      '</div>';
    document.body.appendChild(el);
    const lista = el.querySelector('#sim-lista');
    lista.innerHTML = sim.passos.map(function (p, i) {
      const ic = p.tipo === 'vira' ? '↻' : (p.tipo === 'refile' || p.tipo === 'corte') ? '✂' : p.tipo === 'fim' ? '✓' : '▣';
      return '<li data-i="' + i + '" style="padding:6px 10px;border-bottom:1px solid #f0ece3;cursor:pointer' + (p.tipo === 'vira' ? ';background:#fff7e8' : '') + '">' +
        '<span style="color:#8a8478;display:inline-block;width:26px">' + (i + 1) + '</span>' + ic + ' ' + esc(p.texto) + '</li>';
    }).join('');
    st = { el: el, sim: sim, k: 0, timer: null };
    function ir(k) {
      st.k = Math.max(0, Math.min(sim.passos.length - 1, k));
      const largura = Math.max(320, Math.min(900, el.querySelector('#sim-desenho').clientWidth || 900));
      el.querySelector('#sim-desenho').innerHTML = S.svg(sim, st.k, largura);
      const p = sim.passos[st.k];
      el.querySelector('#sim-texto').innerHTML = '<span style="color:#8a8478;font-weight:400">Passo ' + (st.k + 1) + ' de ' + sim.passos.length +
        ' · ' + p.cortes + ' corte(s), ' + p.viradas + ' virada(s) até aqui</span><br>' + esc(p.texto);
      el.querySelector('#sim-range').value = st.k;
      lista.querySelectorAll('li').forEach(function (li) {
        const on = Number(li.dataset.i) === st.k;
        li.style.outline = on ? '2px solid #e08a00' : 'none';
        li.style.fontWeight = on ? '700' : '400';
        if (on && li.scrollIntoView) li.scrollIntoView({ block: 'nearest' });
      });
      if (st.k === sim.passos.length - 1) pausar();
    }
    function pausar() { clearInterval(st.timer); st.timer = null; el.querySelector('#sim-play').textContent = '▶ Tocar'; }
    function tocar() {
      if (st.timer) { pausar(); return; }
      if (st.k === sim.passos.length - 1) ir(0);
      el.querySelector('#sim-play').textContent = '⏸ Pausar';
      st.timer = setInterval(function () { ir(st.k + 1); }, Number(el.querySelector('#sim-vel').value) || 1000);
    }
    el.addEventListener('click', function (ev) {
      if (ev.target === el) { S.fechar(); return; }
      const b = ev.target.closest('[data-a]');
      if (b) {
        const a = b.dataset.a;
        if (a === 'play') { tocar(); return; }
        pausar();
        ir(a === 'ini' ? 0 : a === 'fim' ? sim.passos.length - 1 : st.k + (a === 'prox' ? 1 : -1));
        return;
      }
      const li = ev.target.closest('li[data-i]');
      if (li) { pausar(); ir(Number(li.dataset.i)); }
    });
    el.querySelector('#sim-range').addEventListener('input', function (ev) { pausar(); ir(Number(ev.target.value)); });
    el.querySelector('#sim-vel').addEventListener('change', function () { if (st.timer) { pausar(); tocar(); } });
    st.onKey = function (e) {
      if (e.key === 'Escape') { S.fechar(); }
      else if (e.key === 'ArrowRight') { pausar(); ir(st.k + 1); }
      else if (e.key === 'ArrowLeft') { pausar(); ir(st.k - 1); }
      else if (e.key === ' ') { tocar(); }
      else return;
      e.preventDefault(); e.stopPropagation();
    };
    document.addEventListener('keydown', st.onKey, true);
    ir(0);
  };
  return S;
})();
