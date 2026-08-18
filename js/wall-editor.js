// wall-editor.js — EDITOR DE PAREDES (planta baixa) do portal
//
// ==========================================================================
// O QUE É
// ==========================================================================
// Uma janela de planta baixa pra desenhar as paredes do ambiente: adicionar,
// remover, arrastar as pontas e editar comprimento/ângulo/espessura/pé-direito.
// Substitui as 3 formas fixas que existiam (uma parede / duas / C-U).
//
// Pedido do Matt (2026-08-13), depois de me mostrar o Editor de Paredes do
// Promob na tela dele: "quero paredes sólidas, não só com uma linha, e quero
// poder desenhar as paredes num blueprint. adicionar, remover, mexer nelas
// conforme necessário. sendo que elas sempre tenham 150mm de espessura."
//
// ==========================================================================
// O MODELO — e a decisão que evita o bug clássico
// ==========================================================================
// Cada parede é um SEGMENTO com duas pontas em mm no mundo:
//   { id, ax, az, bx, bz, thicknessMm, ceilingMm }
//
// COMPRIMENTO E ÂNGULO SÃO DERIVADOS, NUNCA GUARDADOS. O Promob mostra os dois
// como campos editáveis (Comprimento, Ângulo Absoluto, Ângulo Relativo), e é
// tentador guardar assim — mas aí a mesma parede passa a ter duas fontes de
// verdade: as pontas (que o arraste muda) e os números (que o formulário
// muda). Elas divergem no primeiro gesto. Aqui os campos EDITAM as pontas: o
// número entra, vira ponta B, e sai de novo calculado da ponta.
//
// ==========================================================================
// INDEPENDENTE DE PROPÓSITO
// ==========================================================================
// Este arquivo não conhece projectSlots, Supabase nem o viewer. Recebe uma
// lista de segmentos, devolve outra lista. Quem liga isso no projeto é o
// portal.js (botão "Ajustar paredes"), e é lá que mora a regra de o que fazer
// com os módulos — que, por decisão do Matt, é NADA: "módulos não mexem".
(function (global) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const ESPESSURA_PADRAO = 150;
  const GRID_MM = 1000;        // mesma malha do Promob
  const SNAP_MM = 50;          // passo do arraste
  const SNAP_ANGULO_GRAUS = 5; // ímã dos múltiplos de 45°
  const MIN_COMPRIMENTO = 200;
  // Tolerância pra considerar duas pontas "o mesmo canto" — bem menor que o
  // ímã de aproximação (260mm), porque aqui não é "tá perto, gruda": é "já
  // ESTAVA encostada, então é o mesmo ponto fisicamente".
  const TOQUE_TOL = 15;

  let estado = null;

  function el(tag, attrs, pai) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]);
    if (pai) pai.appendChild(e);
    return e;
  }
  function novoId() {
    return 'wseg_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  }
  function comprimentoDe(s) { return Math.hypot(s.bx - s.ax, s.bz - s.az); }
  // Ângulo em GRAUS no plano da planta, 0 = pra direita (+X), crescendo no
  // sentido anti-horário na tela (z cresce pra baixo, por isso o -).
  function anguloDe(s) {
    const g = Math.atan2(-(s.bz - s.az), s.bx - s.ax) * 180 / Math.PI;
    return Math.round(((g % 360) + 360) % 360 * 10) / 10;
  }
  function pontaBPor(s, compMm, anguloGraus) {
    const r = anguloGraus * Math.PI / 180;
    return { x: s.ax + Math.cos(r) * compMm, z: s.az - Math.sin(r) * compMm };
  }
  // Quando a ponta de UMA parede está encostada na ponta de outra (dentro de
  // TOQUE_TOL), as duas representam o MESMO canto físico — só que guardadas
  // como dois números independentes. Esticar ou girar pela ponta idx sem
  // avisar a outra parede deixa ela pra trás: o canto "descola" e vira uma
  // fresta que some da planta e bugava os módulos ali (relatado pelo Matt em
  // 2026-08-14). Esta função acha quem estava encostado no ponto ANTIGO e
  // arrasta junto pro ponto NOVO — o mesmo gesto de puxar um canto de verdade.
  function arrastaCantoJunto(idx, oldX, oldZ, newX, newZ) {
    if (!estado) return;
    estado.segs.forEach((o, j) => {
      if (j === idx) return;
      if (Math.hypot(o.ax - oldX, o.az - oldZ) <= TOQUE_TOL) { o.ax = Math.round(newX); o.az = Math.round(newZ); }
      if (Math.hypot(o.bx - oldX, o.bz - oldZ) <= TOQUE_TOL) { o.bx = Math.round(newX); o.bz = Math.round(newZ); }
    });
  }

  // ------------------------------------------------------------------------
  // JANELA
  // ------------------------------------------------------------------------
  function garanteModal() {
    let m = document.getElementById('po-wall-editor-modal');
    if (m) return m;
    m = document.createElement('div');
    m.id = 'po-wall-editor-modal';
    m.innerHTML = [
      '<div class="po-wall-card">',
      '  <div class="po-wall-header">',
      '    <strong>Ajustar paredes</strong>',
      '    <div class="po-wall-tools">',
      '      <button type="button" class="po-wall-tool" data-acao="add" title="Adicionar parede na ponta da última (grudada)">+ parede</button>',
      '      <button type="button" class="po-wall-tool" data-acao="add-solta" title="Adicionar uma parede SOLTA no meio do ambiente (divisória, sem grudar em nenhuma outra)">+ solta</button>',
      '      <button type="button" class="po-wall-tool" data-acao="inverter" title="Inverter o lado de dentro desta parede">⇋ virar</button>',
      '      <button type="button" class="po-wall-tool" data-acao="ocultar" title="Esconder esta parede (e os móveis presos nela) — só na visualização">👁 ocultar</button>',
      '      <button type="button" class="po-wall-tool po-wall-tool-danger" data-acao="remover" title="Remover a parede selecionada">🗑 remover</button>',
      '    </div>',
      '  </div>',
      '  <div class="po-wall-body">',
      '    <div class="po-wall-stage" id="po-wall-stage"></div>',
      '    <div class="po-wall-side">',
      '      <div class="po-wall-side-title">Parede</div>',
      '      <label>Comprimento <span class="po-wall-un">mm</span><input type="number" id="po-wall-comp" step="10"></label>',
      '      <label>Ângulo <span class="po-wall-un">°</span><input type="number" id="po-wall-ang" step="1"></label>',
      '      <label>Espessura <span class="po-wall-un">mm</span><input type="number" id="po-wall-esp" step="10"></label>',
      '      <label>Altura desta parede <span class="po-wall-un">mm</span><input type="number" id="po-wall-pd" step="10"></label>',
      '      <p class="po-wall-hint">Arraste o <b>corpo</b> da parede pra levar ela inteira; arraste as <b>pontas</b> pra girar e esticar. O ímã pega a malha e os ângulos de 45° — segure <b>Shift</b> pra soltar.</p>',
      '      <p class="po-wall-hint"><b>Desconectar:</b> segure <b>Shift</b> e arraste a ponta pra fora — a parede vizinha fica onde está. Sem Shift, as duas andam juntas (é o mesmo canto). <b>+ solta</b> cria uma divisória no meio, sem grudar em ninguém.</p>',
      '      <p class="po-wall-hint" id="po-wall-resumo"></p>',
      '      <div class="po-wall-side-title" style="margin-top:6px;">Ambiente</div>',
      '      <label>Pé-direito <span class="po-wall-un">mm</span><input type="number" id="po-wall-teto" step="10"></label>',
      '      <label>Rodapé <span class="po-wall-un">mm</span><input type="number" id="po-wall-rodape" step="5"></label>',
      '    </div>',
      '  </div>',
      '  <div class="po-wall-footer">',
      '    <button type="button" class="secondary" data-acao="cancelar">Cancelar</button>',
      '    <button type="button" class="po-wall-ok" data-acao="ok">OK</button>',
      '  </div>',
      '</div>'
    ].join('');
    document.body.appendChild(m);
    m.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-acao]');
      if (!b) { if (ev.target === m) fechar(false); return; }
      const a = b.dataset.acao;
      if (a === 'cancelar') fechar(false);
      else if (a === 'ok') fechar(true);
      else if (a === 'add') adicionar();
      else if (a === 'add-solta') adicionarSolta();
      else if (a === 'remover') remover();
      else if (a === 'inverter') inverter();
      else if (a === 'ocultar') alternaOculta();
    });
    ['po-wall-comp', 'po-wall-ang', 'po-wall-esp', 'po-wall-pd'].forEach((id) => {
      m.querySelector('#' + id).addEventListener('change', aplicaCampos);
    });
    // Pé-direito e rodapé são do AMBIENTE, não da parede — por isso ficam numa
    // seção própria e não entram em aplicaCampos (que edita o segmento
    // selecionado). Eles voltam pro portal no OK, junto dos segmentos.
    ['po-wall-teto', 'po-wall-rodape'].forEach((id) => {
      m.querySelector('#' + id).addEventListener('change', () => {
        if (!estado) return;
        const v = Number(m.querySelector('#' + id).value);
        if (!(v >= 0)) return;
        if (id === 'po-wall-teto') estado.ceilingMm = v; else estado.baseboardMm = v;
        desenha();
      });
    });
    return m;
  }

  function open(opts) {
    const m = garanteModal();
    const segs = (opts && opts.segments || []).map((s) => Object.assign({}, s));
    estado = {
      segs: segs.length ? segs : [padrao()[0], padrao()[1]],
      sel: 0,
      onSave: opts && opts.onSave,
      ceilingMm: (opts && opts.ceilingMm) || 2600,
      baseboardMm: (opts && opts.baseboardMm) || 0,
      arraste: null
    };
    m.classList.add('open');
    desenha();
  }
  // Espelha defaultProjectWallSegments() do portal.js — 4m, L centrado na
  // origem. Existe aqui pro editor abrir sozinho (sem projeto) e não voltar a
  // divergir; se um dia o padrão mudar, muda nos dois.
  function padrao() {
    const L = 4000, h = L / 2;
    return [
      { id: novoId(), ax: -h, az: -h, bx: h, bz: -h, thicknessMm: ESPESSURA_PADRAO, ceilingMm: null },
      { id: novoId(), ax: h, az: -h, bx: h, bz: h, thicknessMm: ESPESSURA_PADRAO, ceilingMm: null }
    ];
  }
  function fechar(salvar) {
    const m = document.getElementById('po-wall-editor-modal');
    if (m) m.classList.remove('open');
    if (salvar && estado && typeof estado.onSave === 'function') {
      estado.onSave(estado.segs.map((s) => Object.assign({}, s)),
        { ceilingMm: estado.ceilingMm, baseboardMm: estado.baseboardMm });
    }
    estado = null;
  }

  // ------------------------------------------------------------------------
  // AÇÕES
  // ------------------------------------------------------------------------
  // Parede nova nasce NA PONTA da selecionada, girada 90° — é como se desenha
  // um ambiente: uma parede puxa a outra. Nascer solta no meio do nada daria
  // um segmento órfão que o usuário teria que arrastar até encostar.
  function adicionar() {
    if (!estado) return;
    const base = estado.segs[estado.sel] || estado.segs[estado.segs.length - 1];
    let nova;
    if (base) {
      const ang = anguloDe(base) - 90;
      const p = pontaBPor({ ax: base.bx, az: base.bz }, 3000, ang);
      nova = { id: novoId(), ax: base.bx, az: base.bz, bx: p.x, bz: p.z, thicknessMm: base.thicknessMm || ESPESSURA_PADRAO, ceilingMm: null };
    } else {
      nova = padrao()[0];
    }
    estado.segs.push(nova);
    estado.sel = estado.segs.length - 1;
    desenha();
  }
  // PAREDE SOLTA (2026-08-18) — pedido do Matt: "as vezes eu quero colocar uma
  // parede solta no ambiente".
  //
  // adicionar() sempre nasce GRUDADA na ponta da última, virando 90° — é o que
  // faz sentido pra desenhar o contorno de um cômodo, e era o único jeito de
  // criar parede aqui. Uma divisória no meio do ambiente não tem ponta pra
  // herdar: nasce no CENTRO do que já existe, horizontal, longe das outras
  // pontas (então o ímã de canto, RAIO 260, não a captura no primeiro
  // arraste).
  function adicionarSolta() {
    if (!estado) return;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    estado.segs.forEach((s) => {
      [[s.ax, s.az], [s.bx, s.bz]].forEach(([px, pz]) => {
        x0 = Math.min(x0, px); x1 = Math.max(x1, px);
        z0 = Math.min(z0, pz); z1 = Math.max(z1, pz);
      });
    });
    if (!isFinite(x0)) { x0 = -1500; x1 = 1500; z0 = -1500; z1 = 1500; }
    const cx = Math.round((x0 + x1) / 2), cz = Math.round((z0 + z1) / 2);
    const comp = Math.max(1000, Math.min(2000, Math.round((x1 - x0) * 0.6)));
    const base = estado.segs[estado.sel] || estado.segs[0];
    estado.segs.push({
      id: novoId(),
      ax: Math.round(cx - comp / 2), az: cz,
      bx: Math.round(cx + comp / 2), bz: cz,
      thicknessMm: (base && base.thicknessMm) || ESPESSURA_PADRAO,
      ceilingMm: null
    });
    estado.sel = estado.segs.length - 1;
    desenha();
  }
  function remover() {
    if (!estado || estado.segs.length <= 1) return;
    estado.segs.splice(estado.sel, 1);
    estado.sel = Math.max(0, estado.sel - 1);
    desenha();
  }
  // Virar = trocar as pontas. O lado de dentro é sempre à esquerda de quem vai
  // de A pra B (ver projectWallSegmentGeometry no portal.js), então inverter as
  // pontas é o que troca a face útil da parede.
  // OCULTAR é de VISUALIZAÇÃO, não de projeto: a parede continua existindo,
  // com medida, e os móveis presos nela continuam no pedido. Ela só some do
  // desenho — junto com os móveis daquela parede, senão eles ficariam
  // flutuando no ar (pedido do Matt: "quando deixo uma parede invisível,
  // preciso deixar os móveis conectados a ela invisíveis também").
  function alternaOculta() {
    const s = estado && estado.segs[estado.sel];
    if (!s) return;
    s.oculta = !s.oculta;
    desenha();
  }
  // Virar agora é uma MARCA (inverterLado), não uma troca de pontas.
  //
  // O lado de dentro passou a ser deduzido da geometria (a normal que aponta
  // pro centro do ambiente — ver projectWallSegmentGeometry no portal.js), e
  // com isso trocar A por B deixou de mudar coisa alguma: a dedução daria o
  // mesmo resultado. A marca é o que permite discordar dela, no caso em que
  // "dentro" é ambíguo de verdade (parede solta, ilha, U).
  function inverter() {
    const s = estado && estado.segs[estado.sel];
    if (!s) return;
    s.inverterLado = !s.inverterLado;
    desenha();
  }
  function aplicaCampos() {
    const s = estado && estado.segs[estado.sel];
    if (!s) return;
    const q = (id) => document.getElementById(id);
    const comp = Math.max(MIN_COMPRIMENTO, Number(q('po-wall-comp').value) || comprimentoDe(s));
    const ang = Number(q('po-wall-ang').value);
    const p = pontaBPor(s, comp, isFinite(ang) ? ang : anguloDe(s));
    const oldBx = s.bx, oldBz = s.bz;
    s.bx = Math.round(p.x); s.bz = Math.round(p.z);
    arrastaCantoJunto(estado.sel, oldBx, oldBz, s.bx, s.bz);
    s.thicknessMm = Math.max(20, Number(q('po-wall-esp').value) || ESPESSURA_PADRAO);
    // null = "segue o pé-direito do ambiente". Guardar o número igual ao do
    // ambiente congelaria esta parede: mudar o pé-direito depois deixaria ela
    // pra trás sem ninguém entender por quê.
    const pd = Number(q('po-wall-pd').value);
    s.ceilingMm = (pd > 0 && pd !== estado.ceilingMm) ? pd : null;
    desenha();
  }

  // ------------------------------------------------------------------------
  // DESENHO
  // ------------------------------------------------------------------------
  function desenha() {
    const stage = document.getElementById('po-wall-stage');
    if (!stage || !estado) return;
    stage.innerHTML = '';

    // Enquadramento: caixa de todas as pontas + margem de 1 m.
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    estado.segs.forEach((s) => {
      x0 = Math.min(x0, s.ax, s.bx); x1 = Math.max(x1, s.ax, s.bx);
      z0 = Math.min(z0, s.az, s.bz); z1 = Math.max(z1, s.az, s.bz);
    });
    if (!isFinite(x0)) { x0 = -1500; x1 = 1500; z0 = -1500; z1 = 1500; }
    const M = 1200;
    x0 -= M; z0 -= M; x1 += M; z1 += M;
    const svg = el('svg', {
      class: 'po-wall-svg',
      viewBox: x0 + ' ' + z0 + ' ' + (x1 - x0) + ' ' + (z1 - z0),
      preserveAspectRatio: 'xMidYMid meet'
    }, stage);
    const K = Math.max(x1 - x0, z1 - z0);
    const fino = K / 500;

    // Malha de 1 m — a referência de escala. Sem ela o desenho não tem tamanho.
    const g = el('g', { 'pointer-events': 'none' }, svg);
    for (let x = Math.ceil(x0 / GRID_MM) * GRID_MM; x <= x1; x += GRID_MM) {
      el('line', { x1: x, y1: z0, x2: x, y2: z1, stroke: '#e6e2d9', 'stroke-width': fino }, g);
    }
    for (let z = Math.ceil(z0 / GRID_MM) * GRID_MM; z <= z1; z += GRID_MM) {
      el('line', { x1: x0, y1: z, x2: x1, y2: z, stroke: '#e6e2d9', 'stroke-width': fino }, g);
    }

    // Paredes: retângulo com a ESPESSURA de verdade, crescendo pro lado de
    // dentro — o mesmo lado que o 3D usa.
    estado.segs.forEach((s, i) => {
      const dx = s.bx - s.ax, dz = s.bz - s.az;
      const comp = Math.hypot(dx, dz) || 1;
      // A espessura cresce PRA FORA — o oposto do lado de dentro. E "dentro" é
      // a normal que aponta pro centro do ambiente, a MESMA regra do 3D
      // (projectWallSegmentGeometry no portal.js); se a planta usasse outra, o
      // desenho aqui mostraria a parede de um lado e o 3D do outro.
      let ix = -dz / comp, iz = dx / comp;
      const cx = estado.segs.reduce((a, x) => a + x.ax + x.bx, 0) / (estado.segs.length * 2);
      const cz = estado.segs.reduce((a, x) => a + x.az + x.bz, 0) / (estado.segs.length * 2);
      const mx = (s.ax + s.bx) / 2, mz = (s.az + s.bz) / 2;
      if ((cx - mx) * ix + (cz - mz) * iz < 0) { ix = -ix; iz = -iz; }
      if (s.inverterLado) { ix = -ix; iz = -iz; }
      const nx = -ix, nz = -iz;                    // espessura pro lado de fora
      const e = Number(s.thicknessMm) || ESPESSURA_PADRAO;
      const pts = [
        [s.ax, s.az], [s.bx, s.bz],
        [s.bx + nx * e, s.bz + nz * e], [s.ax + nx * e, s.az + nz * e]
      ].map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
      const sel = i === estado.sel;
      // Parede oculta continua no desenho da planta — tracejada e apagada. Ela
      // some só do 3D: aqui é onde se edita, e uma parede invisível também na
      // planta seria impossível de trazer de volta.
      const poly = el('polygon', Object.assign({
        points: pts,
        fill: sel ? '#e0921f' : '#cfc9bd',
        'fill-opacity': s.oculta ? 0.12 : (sel ? 0.5 : 0.9),
        stroke: sel ? '#e0921f' : '#8d8375',
        'stroke-width': fino * (sel ? 2.5 : 1.2),
        class: 'po-wall-seg'
      }, s.oculta ? { 'stroke-dasharray': (fino * 6) + ' ' + (fino * 4) } : {}), svg);
      // Clicar seleciona; ARRASTAR O CORPO leva a parede inteira pra onde
      // quiser — inclusive solta, longe das outras (2026-08-13, pedido do
      // Matt: "quero levar essa parede pra onde eu quiser, tipo deixar uma
      // parede solta no chão"). As pontas continuam servindo pra girar e
      // esticar; o corpo é o que translada, que é a divisão que qualquer CAD
      // usa e dispensa botão de modo.
      poly.addEventListener('pointerdown', (ev) => {
        ev.stopPropagation();
        estado.sel = i;
        desenha();
        iniciaArrasteCorpo(ev, i);
      });

      // Cota do comprimento, no meio da parede.
      const t = el('text', {
        x: (s.ax + s.bx) / 2 + nx * e * 2.2, y: (s.az + s.bz) / 2 + nz * e * 2.2,
        'text-anchor': 'middle', 'font-size': K / 34, fill: sel ? '#b9761a' : '#8d8375',
        'font-family': 'sans-serif', 'pointer-events': 'none'
      }, svg);
      t.textContent = Math.round(comp);

      // Alças das pontas — só na parede selecionada, pra não virar um campo de
      // bolinhas sobre o desenho.
      if (!sel) return;
      [['a', s.ax, s.az], ['b', s.bx, s.bz]].forEach(([qual, px, pz]) => {
        const c = el('circle', {
          cx: px, cy: pz, r: K / 90, fill: '#fff', stroke: '#e0921f',
          'stroke-width': fino * 2, class: 'po-wall-handle'
        }, svg);
        c.addEventListener('pointerdown', (ev) => iniciaArraste(ev, svg, i, qual));
      });
    });

    // Painel lateral
    const s = estado.segs[estado.sel];
    const q = (id) => document.getElementById(id);
    if (s) {
      q('po-wall-comp').value = Math.round(comprimentoDe(s));
      q('po-wall-ang').value = anguloDe(s);
      q('po-wall-esp').value = Number(s.thicknessMm) || ESPESSURA_PADRAO;
      // Altura SEMPRE preenchida (2026-08-13, pedido do Matt: "ao clicar na
      // parede tenho acesso aos tamanhos de cada uma, com altura também").
      // Antes ficava vazia quando a parede seguia o pé-direito do ambiente, e
      // "vazio" não é uma medida — quem abre quer LER o número, não deduzir.
      // Continua saindo como null quando é igual ao do ambiente, pra parede
      // que não foi customizada acompanhar mudanças do pé-direito.
      q('po-wall-pd').value = s.ceilingMm || estado.ceilingMm || '';
    }
    if (q('po-wall-teto')) q('po-wall-teto').value = estado.ceilingMm || '';
    if (q('po-wall-rodape')) q('po-wall-rodape').value = estado.baseboardMm || 0;
    const resumo = q('po-wall-resumo');
    if (resumo) {
      const total = estado.segs.reduce((a, x) => a + comprimentoDe(x), 0);
      resumo.textContent = estado.segs.length + ' parede(s) · perímetro '
        + (Math.round(total) / 1000).toFixed(2) + ' m';
    }
  }

  // ------------------------------------------------------------------------
  // ARRASTE DAS PONTAS
  // ------------------------------------------------------------------------
  // Duas correções de ímã, na ordem: primeiro a MALHA (posição), depois o
  // ÂNGULO (direção a partir da outra ponta). Fazer o contrário deixaria o
  // ângulo certo e a ponta fora da malha, que é o pior dos dois mundos quando
  // se está fechando um canto.
  // Translada a parede INTEIRA (as duas pontas pelo mesmo vetor). O ímã aqui é
  // só de malha — ângulo não muda quando se move, então não há o que travar.
  function iniciaArrasteCorpo(ev, idx) {
    ev.preventDefault();
    const pos = (e) => {
      const svg = document.querySelector('#po-wall-stage svg');
      if (!svg) return null;
      const ctm = svg.getScreenCTM();
      if (!ctm) return null;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      const p = pt.matrixTransform(ctm.inverse());
      return { x: p.x, z: p.y };
    };
    const ini = pos(ev);
    const s = estado.segs[idx];
    if (!ini || !s) return;
    const base = { ax: s.ax, az: s.az, bx: s.bx, bz: s.bz };
    let andou = false;
    const mover = (e) => {
      const p = pos(e);
      if (!p) return;
      let dx = p.x - ini.x, dz = p.z - ini.z;
      if (Math.abs(dx) < 2 && Math.abs(dz) < 2 && !andou) return;  // clique puro
      andou = true;
      if (!e.shiftKey) { dx = Math.round(dx / SNAP_MM) * SNAP_MM; dz = Math.round(dz / SNAP_MM) * SNAP_MM; }
      s.ax = Math.round(base.ax + dx); s.az = Math.round(base.az + dz);
      s.bx = Math.round(base.bx + dx); s.bz = Math.round(base.bz + dz);
      desenha();
    };
    const soltar = () => {
      removeEventListener('pointermove', mover);
      removeEventListener('pointerup', soltar);
    };
    addEventListener('pointermove', mover);
    addEventListener('pointerup', soltar);
  }

  function iniciaArraste(ev, svgIgnorado, idx, qual) {
    ev.preventDefault();
    ev.stopPropagation();
    // O SVG É PROCURADO A CADA MOVIMENTO, de propósito.
    //
    // Este era o bug do "a parede fica num ponto só e não segue o mouse":
    // desenha() reconstrói o SVG inteiro a cada quadro do arraste, então o
    // elemento capturado aqui no pointerdown fica ÓRFÃO já no primeiro
    // movimento. getScreenCTM() de um SVG fora do documento devolve null, a
    // conversão tela->mm morre, e a ponta congela onde estava.
    const paraMm = (e) => {
      const svg = document.querySelector('#po-wall-stage svg');
      if (!svg || !svg.getScreenCTM) return null;
      const ctm = svg.getScreenCTM();
      if (!ctm) return null;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      const p = pt.matrixTransform(ctm.inverse());
      return { x: p.x, z: p.y };
    };
    const mover = (e) => {
      const s = estado.segs[idx];
      const mm = paraMm(e);
      if (!s || !mm) return;
      let x = mm.x, z = mm.z;
      const livre = e.shiftKey;
      if (!livre) { x = Math.round(x / SNAP_MM) * SNAP_MM; z = Math.round(z / SNAP_MM) * SNAP_MM; }
      const ox = qual === 'a' ? s.bx : s.ax;
      const oz = qual === 'a' ? s.bz : s.az;
      if (!livre) {
        const ang = Math.atan2(-(z - oz), x - ox) * 180 / Math.PI;
        const alvo = Math.round(ang / 45) * 45;
        if (Math.abs(ang - alvo) <= SNAP_ANGULO_GRAUS) {
          const comp = Math.max(MIN_COMPRIMENTO, Math.hypot(x - ox, z - oz));
          const r = alvo * Math.PI / 180;
          x = ox + Math.cos(r) * comp;
          z = oz - Math.sin(r) * comp;
        }
      }
      // ÍMÃ DE CANTO — a ponta gruda na ponta de outra parede (2026-08-13).
      // Sem isto, duas paredes que "parecem" encostadas ficam a alguns
      // milímetros uma da outra: na planta some, mas no 3D o canto abre uma
      // fresta ou as duas se atravessam (foi o que o Matt viu). Cair na malha
      // de 50mm não garante encontro nenhum quando a outra ponta está num
      // valor qualquer, vindo de outro arraste.
      // Prioridade máxima: vence a malha e o ângulo, porque encostar é o que
      // define o ambiente.
      if (!livre) {
        const RAIO = 260;
        let melhor = null, dist = RAIO;
        estado.segs.forEach((o, j) => {
          if (j === idx) return;
          [[o.ax, o.az], [o.bx, o.bz]].forEach(([px, pz]) => {
            const d = Math.hypot(px - x, pz - z);
            if (d < dist) { dist = d; melhor = { x: px, z: pz }; }
          });
        });
        if (melhor) { x = melhor.x; z = melhor.z; }
      }
      if (Math.hypot(x - ox, z - oz) < MIN_COMPRIMENTO) return;
      const oldX = qual === 'a' ? s.ax : s.bx;
      const oldZ = qual === 'a' ? s.az : s.bz;
      if (qual === 'a') { s.ax = Math.round(x); s.az = Math.round(z); }
      else { s.bx = Math.round(x); s.bz = Math.round(z); }
      // SHIFT DESCONECTA O CANTO (2026-08-18, Matt: "às vezes eu quero colocar
      // uma parede solta no ambiente, deixa eu desconectar").
      //
      // Sem Shift a vizinha vem junto — é o comportamento certo pro caso
      // comum: as duas pontas são o MESMO canto físico e separá-las sem querer
      // abre fresta (o bug de 2026-08-14 que criou arrastaCantoJunto). Mas com
      // ela SEMPRE colada não havia como desgrudar: puxar a ponta pra longe
      // arrastava a vizinha atrás, pra sempre.
      //
      // Shift já significava "solta" nas outras três amarras deste arraste
      // (malha de 50mm, ângulo de 45° e ímã de canto). Passa a soltar também a
      // vizinha — um gesto só, mesma tecla, nada de modo escondido.
      if (!livre) arrastaCantoJunto(idx, oldX, oldZ, qual === 'a' ? s.ax : s.bx, qual === 'a' ? s.az : s.bz);
      desenha();
    };
    const soltar = () => {
      removeEventListener('pointermove', mover);
      removeEventListener('pointerup', soltar);
    };
    addEventListener('pointermove', mover);
    addEventListener('pointerup', soltar);
  }

  global.WallEditor = { open, padrao };
})(typeof window !== 'undefined' ? window : this);
