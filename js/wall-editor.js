// wall-editor.js — EDITOR DE PAREDES (planta baixa) do portal
//
// ==========================================================================
// O QUE É
// ==========================================================================
// Uma janela de planta baixa pra desenhar as paredes do ambiente: adicionar,
// remover, arrastar os cantos e editar comprimento/giro/espessura/pé-direito.
//
// Pedido do Matt (2026-08-13): "quero paredes sólidas, não só com uma linha,
// e quero poder desenhar as paredes num blueprint... sempre com 150mm de
// espessura."
//
// ==========================================================================
// O MODELO (reescrito em 2026-09-22) — CONTORNO, não segmentos soltos
// ==========================================================================
// Matt (22/09): "essa parte de fazer as paredes está confusa, ela liga os
// pontos e mexe no que já está certo, fica fora do controle, e quando eu
// coloco um valor ele desconta a largura da parede dos lados... penso em
// fazer uma linha única e depois criar a parede pra fora, pra sempre manter
// as medidas fiéis às que o desenhista tirou no local."
//
// Antes cada parede era um segmento independente (A→B) e o canto era um
// "ímã": a cada arraste o editor procurava quem estava encostado e levava
// junto. Funcionava até o momento em que digitar 216 15/32 numa parede
// empurrava a vizinha, que mudava de comprimento sem ninguém pedir. E como
// as pontas eram a verdade (arredondadas na malha), a medida tirada na obra
// virava outra depois de dois gestos.
//
// Agora o ambiente é um CONTORNO: uma sequência de cantos internos
// (vértices) e, entre cada dois, uma parede. O canto é UM ponto, por
// construção — não existe "encostar", nem fresta, nem ímã. A linha do
// contorno é a FACE INTERNA (o que o desenhista mede na obra, canto de
// dentro a canto de dentro) e a espessura cresce pra fora; o 3D já usava
// exatamente essa convenção (projectWallSegmentGeometry no portal), então
// nada muda lá.
//
//   cadeia = { fechada, v: [{x,z}...], paredes: [{id, thicknessMm,
//              ceilingMm, oculta, inverterLado}...] }
//   parede i vai de v[i] a v[i+1]; se fechada, a última vai de v[n-1] a v[0]
//   (e aí v.length === paredes.length).
//
// DIGITAR UMA MEDIDA MUDA SÓ AQUELA PAREDE: o resto da cadeia, dali pra
// frente, translada/gira inteiro, rígido, sem nenhum outro número mudar.
// Num contorno fechado alguém tem que absorver a diferença — é a parede de
// fechamento (a última), e o painel avisa. Arrastar canto continua
// existindo, como ajuste grosseiro: mexe só nas duas paredes daquele canto.
//
// Entrada igual ao levantamento: comprimento + GIRO em relação à parede
// anterior (a primeira tem ângulo absoluto). 193 9/16 → giro 90° →
// 144 15/32 → giro 45° → ... e no fim "Fechar ambiente" mostra com quantos
// mm o contorno fecha — o jeito de pegar medida errada antes de fabricar.
//
// O QUE SAI continua sendo a lista de segmentos {id, ax, az, bx, bz,
// thicknessMm, ceilingMm, oculta, inverterLado} — o contrato com portal-08/09
// (projeto salvo, 3D, módulos) não mudou. Na entrada, segmentos com pontas
// coincidentes (TOQUE_TOL) viram vértice compartilhado; o que não coincide
// vira outra cadeia (parede solta, ilha).
//
// ==========================================================================
// INDEPENDENTE DE PROPÓSITO
// ==========================================================================
// Este arquivo não conhece projectSlots, Supabase nem o viewer. Recebe uma
// lista de segmentos, devolve outra lista. Quem liga isso no projeto é o
// portal-08 (botão "Paredes"), e é lá que mora a regra de o que fazer com os
// módulos — que, por decisão do Matt, é NADA: "módulos não mexem".
(function (global) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const ESPESSURA_PADRAO = 150;
  const GRID_MM = 1000;        // mesma malha do Promob
  const SNAP_MM = 50;          // passo do arraste
  const SNAP_ANGULO_GRAUS = 5; // ímã dos múltiplos de 45°
  const MIN_COMPRIMENTO = 200;
  // Tolerância pra considerar duas pontas "o mesmo canto" ao IMPORTAR
  // segmentos antigos: bem menor que qualquer gesto — é "já ESTAVA
  // encostada, então é o mesmo ponto fisicamente".
  const TOQUE_TOL = 15;
  // Fechar ambiente: até isto de folga a última parede é ajustada pra fechar
  // (e o painel diz quanto); acima disso o fechamento vira uma parede nova.
  const FECHA_TOL = 60;
  // Ímã de junção: soltar a ponta de um contorno em cima da ponta de outro
  // (dentro deste raio) emenda os dois — o único jeito de "ligar pontos", e
  // só acontece quando é pedido.
  const RAIO_JUNCAO = 260;

  let estado = null;

  // ------------------------------------------------------------------------
  // IDIOMA
  // ------------------------------------------------------------------------
  // Este arquivo é independente de propósito (ver cabeçalho), então ele não
  // pode DEPENDER do I18n existir — se o portal carregar sem ele, o modal tem
  // que continuar abrindo, em português, em vez de morrer. Daí o fallback.
  const PT_FALLBACK = {
    'wall_editor.turn': 'Giro',
    'wall_editor.angle': 'Ângulo',
    'wall_editor.gap_open': 'Fecha com {{d}} {{u}} de diferença',
    'wall_editor.gap_closed': 'Ambiente fechado — a parede {{n}} é a de fechamento',
    'wall_editor.gap_far': 'Contorno aberto ({{n}} paredes)',
    'wall_editor.summary': '{{n}} parede(s) · perímetro {{m}} {{u}}',
    'wall_editor.chains': '{{c}} contorno(s)'
  };
  function tr(chave, vars) {
    if (typeof I18n !== 'undefined' && I18n && I18n.t) {
      const s = I18n.t(chave, vars);
      if (s !== chave) return s;
    }
    let t = PT_FALLBACK[chave] || chave;
    if (vars) t = t.replace(/\{\{(\w+)\}\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
    return t;
  }
  // O modal é montado UMA vez e reaproveitado (garanteModal cacheia pelo id).
  // Se o cliente trocar de idioma com ele já montado, os data-i18n de dentro
  // ficam na língua antiga — por isso re-aplica a cada abertura, e também no
  // evento de troca de idioma (pro caso do modal estar aberto na hora).
  function traduzModal(m) {
    if (typeof I18n !== 'undefined' && I18n && I18n.applyStaticTranslations) I18n.applyStaticTranslations();
    return m;
  }

  // ------------------------------------------------------------------------
  // UNIDADE DE MEDIDA (2026-09-03, bug relatado pelo usuário: "as paredes
  // estao so em metros, nao estao respeitando a escolha do cliente").
  // Duplicado aqui (não chama formatDimension/parseDimensionInput de
  // portal-01-core-catalogo.js) pelo mesmo motivo do fallback de tr() acima
  // — este arquivo é "independente de propósito" e não pode depender de
  // outro script já ter carregado. Mesmos fatores de conversão.
  //
  // 2026-09-11 (Matt: "as paredes nao estao deixando eu colocar valor por
  // polegada fracionada"): os campos são type="text" e a conversão de/pra
  // polegada aceita e devolve fração ("8 1/2"), não só decimal.
  const MM_PER_INCH_WE = 25.4;

  function unidadeAtual() {
    const sel = document.getElementById('po-unit-select');
    return sel ? sel.value : 'mm';
  }
  function fatorMmWE(unidade) {
    switch (unidade) {
      case 'cm': return 10;
      case 'm': return 1000;
      case 'ft': return 304.8;
      case 'in': return MM_PER_INCH_WE;
      case 'mm':
      default: return 1;
    }
  }
  function unidadeAbrevWE(unidade) {
    return unidade || 'mm';
  }
  function formatMmSemPerderWE(mm) {
    const n = Number(mm) || 0;
    return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
  }
  function gcdWE(a, b) { return b === 0 ? a : gcdWE(b, a % b); }
  // mm -> fração de polegada mais próxima em 1/32" ("8 1/2", "3/4", "6").
  function mmParaFracaoPolegadaWE(mm) {
    const totalPol = Math.max(Number(mm) || 0, 0) / MM_PER_INCH_WE;
    let inteiro = Math.floor(totalPol);
    let numerador = Math.round((totalPol - inteiro) * 32);
    if (numerador === 32) { numerador = 0; inteiro += 1; }
    if (numerador === 0) return String(inteiro);
    const div = gcdWE(numerador, 32);
    const num = numerador / div;
    const den = 32 / div;
    return inteiro > 0 ? (inteiro + ' ' + num + '/' + den) : (num + '/' + den);
  }
  function mmParaNumeroWE(mm, unidade) {
    if (unidade === 'in') return mmParaFracaoPolegadaWE(mm);
    const fator = fatorMmWE(unidade);
    if (fator === 1) return formatMmSemPerderWE(mm);
    const casas = unidade === 'cm' ? 1 : 3;
    return (Number(mm) / fator).toFixed(casas);
  }
  function numeroParaMmWE(valorStr, unidade) {
    const str = String(valorStr == null ? '' : valorStr).trim();
    if (!str) return null;
    if (unidade === 'in') {
      const limpo = str.replace(/["']/g, '').replace(',', '.');
      const fracao = limpo.match(/^(\d+(?:\.\d+)?)?\s*(\d+)\/(\d+)$/);
      if (fracao) {
        const inteiro = fracao[1] ? parseFloat(fracao[1]) : 0;
        const num = parseFloat(fracao[2]);
        const den = parseFloat(fracao[3]);
        if (!den) return null;
        return (inteiro + num / den) * MM_PER_INCH_WE;
      }
      const dec = parseFloat(limpo);
      return isNaN(dec) ? null : dec * MM_PER_INCH_WE;
    }
    const val = parseFloat(str.replace(',', '.'));
    if (isNaN(val)) return null;
    return val * fatorMmWE(unidade);
  }

  function el(tag, attrs, pai) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]);
    if (pai) pai.appendChild(e);
    return e;
  }
  function novoId() {
    return 'wseg_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  }
  function propsPadrao(base) {
    return {
      id: novoId(),
      thicknessMm: (base && base.thicknessMm) || ESPESSURA_PADRAO,
      ceilingMm: null,
      oculta: false,
      inverterLado: false
    };
  }

  // ------------------------------------------------------------------------
  // GEOMETRIA DO CONTORNO
  // ------------------------------------------------------------------------
  // Ângulo em GRAUS no plano da planta, 0 = pra direita (+X), crescendo no
  // sentido anti-horário na tela (z cresce pra baixo, por isso o -).
  function anguloEntre(p, q) {
    return Math.atan2(-(q.z - p.z), q.x - p.x) * 180 / Math.PI;
  }
  function norm180(g) { let a = ((g % 360) + 360) % 360; if (a > 180) a -= 360; return a; }
  function norm360(g) { return ((g % 360) + 360) % 360; }
  function arred(v, casas) { const f = Math.pow(10, casas || 0); return Math.round(v * f) / f; }

  function nParedes(c) { return c.paredes.length; }
  function vIni(c, i) { return c.v[i]; }
  function vFim(c, i) { return c.v[(i + 1) % c.v.length]; }
  function compDe(c, i) { const a = vIni(c, i), b = vFim(c, i); return Math.hypot(b.x - a.x, b.z - a.z); }
  function angAbsDe(c, i) { return norm360(anguloEntre(vIni(c, i), vFim(c, i))); }
  // Giro = quanto esta parede vira em relação à anterior. + = anti-horário na
  // tela. Na primeira parede de um contorno aberto não há anterior: o campo
  // mostra o ângulo absoluto.
  function giroDe(c, i) {
    if (i === 0 && !c.fechada) return angAbsDe(c, 0);
    const prev = (i - 1 + nParedes(c)) % nParedes(c);
    return norm180(angAbsDe(c, i) - angAbsDe(c, prev));
  }
  function rotaciona(p, pivo, graus) {
    const r = graus * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r);
    const u = p.x - pivo.x, w = p.z - pivo.z;
    // convenção de anguloEntre (z pra baixo): (u,w) = r(cos a, -sin a) tem
    // que virar r(cos(a+δ), -sin(a+δ)) — daí os sinais abaixo.
    return { x: pivo.x + u * cs + w * sn, z: pivo.z + w * cs - u * sn };
  }
  // Índices dos vértices "a jusante" da parede i: os que andam junto quando
  // esta parede muda de comprimento ou giro. Aberto: todos depois de v[i].
  // Fechado: todos depois de v[i], menos v[0] — a parede de fechamento
  // absorve a diferença (alguém tem que absorver).
  function jusante(c, i) {
    const out = [];
    for (let k = i + 1; k < c.v.length; k++) out.push(k); // fechado: v[0] fica de fora sozinho
    return out;
  }
  function setComp(c, i, comp) {
    const a = vIni(c, i), b = vFim(c, i);
    const atual = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const dx = (b.x - a.x) / atual, dz = (b.z - a.z) / atual;
    const delta = comp - atual;
    if (c.fechada && i === nParedes(c) - 1) {
      // A parede de fechamento não tem jusante: mexe só a ponta de partida
      // dela (o canto anterior), que puxa a penúltima. Honesto e visível.
      const p = c.v[i]; p.x -= dx * delta; p.z -= dz * delta;
      return;
    }
    jusante(c, i).forEach((k) => { c.v[k].x += dx * delta; c.v[k].z += dz * delta; });
  }
  function setGiro(c, i, giro) {
    if (i === 0 && !c.fechada) {
      const delta = giro - angAbsDe(c, 0);
      const pivo = { x: c.v[0].x, z: c.v[0].z };
      for (let k = 1; k < c.v.length; k++) c.v[k] = rotaciona(c.v[k], pivo, delta);
      return;
    }
    const delta = giro - giroDe(c, i);
    const pivo = { x: vIni(c, i).x, z: vIni(c, i).z };
    if (c.fechada && i === nParedes(c) - 1) {
      // Parede de fechamento (v[n-1] → v[0]): v[0] é o início do contorno e
      // fica parado; gira o canto de partida dela em torno de v[0] — o vetor
      // v[n-1]→v[0] gira junto, pelo mesmo δ. A penúltima parede muda (é ela
      // que absorve), e o painel deixa isso claro.
      const p0 = { x: c.v[0].x, z: c.v[0].z };
      c.v[i] = rotaciona(c.v[i], p0, delta);
      return;
    }
    jusante(c, i).forEach((k) => { c.v[k] = rotaciona(c.v[k], pivo, delta); });
  }
  function folga(c) {
    if (c.fechada || c.v.length < 2) return 0;
    const a = c.v[0], b = c.v[c.v.length - 1];
    return Math.hypot(b.x - a.x, b.z - a.z);
  }

  // Lado de dentro: a normal que aponta pro centro do ambiente — a MESMA
  // regra do 3D (projectWallSegmentGeometry no portal). Se a planta usasse
  // outra, o desenho aqui mostraria a parede de um lado e o 3D do outro.
  function centroGeral() {
    let sx = 0, sz = 0, n = 0;
    estado.cadeias.forEach((c) => {
      for (let i = 0; i < nParedes(c); i++) {
        const a = vIni(c, i), b = vFim(c, i);
        sx += a.x + b.x; sz += a.z + b.z; n += 2;
      }
    });
    return n ? { x: sx / n, z: sz / n } : { x: 0, z: 0 };
  }
  function normalFora(c, i, centro) {
    const a = vIni(c, i), b = vFim(c, i);
    const dx = b.x - a.x, dz = b.z - a.z;
    const comp = Math.hypot(dx, dz) || 1;
    let ix = -dz / comp, iz = dx / comp;                 // uma das normais
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
    if ((centro.x - mx) * ix + (centro.z - mz) * iz < 0) { ix = -ix; iz = -iz; } // ix,iz = pra dentro
    if (c.paredes[i].inverterLado) { ix = -ix; iz = -iz; }
    return { x: -ix, z: -iz };                            // pra fora
  }

  // ------------------------------------------------------------------------
  // SEGMENTOS <-> CADEIAS
  // ------------------------------------------------------------------------
  function importar(segs) {
    const restantes = segs.map((s, ordem) => ({
      ordem, ax: Number(s.ax), az: Number(s.az), bx: Number(s.bx), bz: Number(s.bz),
      props: { id: s.id || novoId(), thicknessMm: Number(s.thicknessMm) || ESPESSURA_PADRAO,
               ceilingMm: s.ceilingMm || null, oculta: !!s.oculta, inverterLado: !!s.inverterLado }
    })).filter((s) => isFinite(s.ax) && isFinite(s.az) && isFinite(s.bx) && isFinite(s.bz));
    const toca = (x, z, px, pz) => Math.hypot(px - x, pz - z) <= TOQUE_TOL;
    const cadeias = [];
    while (restantes.length) {
      // Começa por uma ponta LIVRE (que não toca ninguém), pra não nascer no
      // meio de uma cadeia. Se não houver (tudo em laço), começa em qualquer.
      let ini = -1, inverte = false;
      for (let i = 0; i < restantes.length && ini < 0; i++) {
        const s = restantes[i];
        const aLivre = !restantes.some((o, j) => j !== i && (toca(s.ax, s.az, o.ax, o.az) || toca(s.ax, s.az, o.bx, o.bz)));
        const bLivre = !restantes.some((o, j) => j !== i && (toca(s.bx, s.bz, o.ax, o.az) || toca(s.bx, s.bz, o.bx, o.bz)));
        if (aLivre) { ini = i; inverte = false; }
        else if (bLivre) { ini = i; inverte = true; }
      }
      if (ini < 0) ini = 0;
      const s0 = restantes.splice(ini, 1)[0];
      const c = { fechada: false, v: [], paredes: [], _ordem: s0.ordem };
      if (inverte) { c.v.push({ x: s0.bx, z: s0.bz }, { x: s0.ax, z: s0.az }); }
      else { c.v.push({ x: s0.ax, z: s0.az }, { x: s0.bx, z: s0.bz }); }
      c.paredes.push(s0.props);
      let cresceu = true;
      while (cresceu) {
        cresceu = false;
        const fim = c.v[c.v.length - 1];
        for (let i = 0; i < restantes.length; i++) {
          const s = restantes[i];
          if (toca(fim.x, fim.z, s.ax, s.az)) { c.v.push({ x: s.bx, z: s.bz }); c.paredes.push(s.props); c._ordem = Math.min(c._ordem, s.ordem); restantes.splice(i, 1); cresceu = true; break; }
          if (toca(fim.x, fim.z, s.bx, s.bz)) { c.v.push({ x: s.ax, z: s.az }); c.paredes.push(s.props); c._ordem = Math.min(c._ordem, s.ordem); restantes.splice(i, 1); cresceu = true; break; }
        }
        // fechou o laço?
        const ult = c.v[c.v.length - 1], pri = c.v[0];
        if (c.paredes.length >= 3 && toca(ult.x, ult.z, pri.x, pri.z)) { c.v.pop(); c.fechada = true; cresceu = false; }
      }
      cadeias.push(c);
    }
    // Ordem de quem veio primeiro no projeto (o ambiente antes da divisória
    // solta): é o contorno que abre selecionado.
    cadeias.sort((p, q) => p._ordem - q._ordem);
    cadeias.forEach((c) => { delete c._ordem; });
    return cadeias;
  }
  function exportar() {
    const segs = [];
    estado.cadeias.forEach((c) => {
      for (let i = 0; i < nParedes(c); i++) {
        const a = vIni(c, i), b = vFim(c, i), p = c.paredes[i];
        segs.push({
          id: p.id, ax: arred(a.x, 2), az: arred(a.z, 2), bx: arred(b.x, 2), bz: arred(b.z, 2),
          thicknessMm: p.thicknessMm, ceilingMm: p.ceilingMm, oculta: !!p.oculta, inverterLado: !!p.inverterLado
        });
      }
    });
    return segs;
  }
  function selecionada() {
    if (!estado) return null;
    const c = estado.cadeias[estado.sel.c];
    if (!c || !c.paredes[estado.sel.i]) return null;
    return { c, i: estado.sel.i, p: c.paredes[estado.sel.i] };
  }

  // ------------------------------------------------------------------------
  // JANELA
  // ------------------------------------------------------------------------
  function garanteModal() {
    let m = document.getElementById('po-wall-editor-modal');
    if (m) return m;
    m = document.createElement('div');
    m.id = 'po-wall-editor-modal';
    // TODO TEXTO PASSA PELO I18N. Os rótulos ficam em <span> próprio dentro do
    // <label> porque data-i18n escreve textContent — no <label> inteiro ele
    // apagaria o <input> junto. As dicas usam data-i18n-html pra manter o <b>.
    m.innerHTML = [
      '<div class="po-wall-card">',
      '  <div class="po-wall-header">',
      '    <strong data-i18n="wall_editor.title">Ajustar paredes</strong>',
      '    <div class="po-wall-tools">',
      '      <button type="button" class="po-wall-tool" data-acao="add" data-i18n="wall_editor.add" data-i18n-title="wall_editor.add_title">+ parede</button>',
      '      <button type="button" class="po-wall-tool" data-acao="add-solta" data-i18n="wall_editor.add_free" data-i18n-title="wall_editor.add_free_title">+ solta</button>',
      '      <button type="button" class="po-wall-tool" data-acao="fechar-amb" id="po-wall-fechar" data-i18n="wall_editor.close" data-i18n-title="wall_editor.close_title">&#9633; fechar</button>',
      '      <button type="button" class="po-wall-tool" data-acao="inverter" data-i18n="wall_editor.flip" data-i18n-title="wall_editor.flip_title">&#8651; virar</button>',
      '      <button type="button" class="po-wall-tool" data-acao="ocultar" data-i18n="wall_editor.hide" data-i18n-title="wall_editor.hide_title">&#128065; ocultar</button>',
      '      <button type="button" class="po-wall-tool po-wall-tool-danger" data-acao="remover" data-i18n="wall_editor.remove" data-i18n-title="wall_editor.remove_title">&#128465; remover</button>',
      '    </div>',
      '  </div>',
      '  <div class="po-wall-body">',
      '    <div class="po-wall-stage" id="po-wall-stage"></div>',
      '    <div class="po-wall-side">',
      '      <div class="po-wall-side-title" id="po-wall-side-title" data-i18n="wall_editor.section_wall">Parede</div>',
      '      <label><span data-i18n="wall_editor.length">Comprimento</span> <span class="po-wall-un" id="po-wall-comp-un">mm</span><input type="text" inputmode="decimal" autocomplete="off" id="po-wall-comp"></label>',
      '      <label><span id="po-wall-ang-rotulo">Giro</span> <span class="po-wall-un">&deg;</span><input type="number" id="po-wall-ang" step="any"></label>',
      '      <label><span data-i18n="wall_editor.thickness">Espessura</span> <span class="po-wall-un" id="po-wall-esp-un">mm</span><input type="text" inputmode="decimal" autocomplete="off" id="po-wall-esp"></label>',
      '      <label><span data-i18n="wall_editor.wall_height">Altura desta parede</span> <span class="po-wall-un" id="po-wall-pd-un">mm</span><input type="text" inputmode="decimal" autocomplete="off" id="po-wall-pd"></label>',
      '      <p class="po-wall-hint po-wall-gap" id="po-wall-gap"></p>',
      '      <p class="po-wall-hint" data-i18n-html="wall_editor.hint_drag"></p>',
      '      <p class="po-wall-hint" data-i18n-html="wall_editor.hint_disconnect"></p>',
      '      <p class="po-wall-hint" id="po-wall-resumo"></p>',
      '      <div class="po-wall-side-title" style="margin-top:6px;" data-i18n="wall_editor.section_room">Ambiente</div>',
      '      <label><span data-i18n="wall_editor.ceiling">P&eacute;-direito</span> <span class="po-wall-un" id="po-wall-teto-un">mm</span><input type="text" inputmode="decimal" autocomplete="off" id="po-wall-teto"></label>',
      '      <label><span data-i18n="wall_editor.baseboard">Rodap&eacute;</span> <span class="po-wall-un" id="po-wall-rodape-un">mm</span><input type="text" inputmode="decimal" autocomplete="off" id="po-wall-rodape"></label>',
      '    </div>',
      '  </div>',
      '  <div class="po-wall-footer">',
      '    <button type="button" class="secondary" data-acao="cancelar" data-i18n="wall_editor.cancel">Cancelar</button>',
      '    <button type="button" class="po-wall-ok" data-acao="ok" data-i18n="wall_editor.ok">OK</button>',
      '  </div>',
      '</div>'
    ].join('');
    document.body.appendChild(m);
    traduzModal(m);
    m.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-acao]');
      if (!b) { if (ev.target === m) fechar(false); return; }
      const a = b.dataset.acao;
      if (a === 'cancelar') fechar(false);
      else if (a === 'ok') fechar(true);
      else if (a === 'add') adicionar();
      else if (a === 'add-solta') adicionarSolta();
      else if (a === 'fechar-amb') fecharAmbiente();
      else if (a === 'remover') remover();
      else if (a === 'inverter') inverter();
      else if (a === 'ocultar') alternaOculta();
    });
    ['po-wall-comp', 'po-wall-ang', 'po-wall-esp', 'po-wall-pd'].forEach((id) => {
      m.querySelector('#' + id).addEventListener('change', aplicaCampos);
    });
    // Pé-direito e rodapé são do AMBIENTE, não da parede.
    ['po-wall-teto', 'po-wall-rodape'].forEach((id) => {
      m.querySelector('#' + id).addEventListener('change', () => {
        if (!estado) return;
        const v = numeroParaMmWE(m.querySelector('#' + id).value, unidadeAtual());
        if (!(v >= 0)) return;
        if (id === 'po-wall-teto') estado.ceilingMm = v; else estado.baseboardMm = v;
        desenha();
      });
    });
    const unitSelectEl = document.getElementById('po-unit-select');
    if (unitSelectEl) unitSelectEl.addEventListener('change', () => { if (estado) desenha(); });
    return m;
  }

  function open(opts) {
    const m = garanteModal();
    const segs = (opts && opts.segments || []).map((s) => Object.assign({}, s));
    let cadeias = importar(segs.length ? segs : padrao());
    if (!cadeias.length) cadeias = importar(padrao());
    estado = {
      cadeias,
      sel: { c: 0, i: 0 },
      onSave: opts && opts.onSave,
      ceilingMm: (opts && opts.ceilingMm) || 2600,
      baseboardMm: (opts && opts.baseboardMm) || 0
    };
    m.classList.add('open');
    traduzModal(m);
    desenha();
  }
  // Espelha defaultProjectWallSegments() do portal — 4m, L centrado na
  // origem. Existe aqui pro editor abrir sozinho (sem projeto).
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
      estado.onSave(exportar(), { ceilingMm: estado.ceilingMm, baseboardMm: estado.baseboardMm });
    }
    estado = null;
  }

  // ------------------------------------------------------------------------
  // AÇÕES
  // ------------------------------------------------------------------------
  // Parede nova nasce NA PONTA do contorno selecionado, girando pro mesmo
  // lado do giro anterior (ou 90° pra dentro) — é como se desenha um
  // ambiente: uma parede puxa a outra. Contorno fechado não tem ponta: aí
  // nasce solta.
  function adicionar() {
    const s = selecionada();
    if (!s) return adicionarSolta();
    const c = s.c;
    if (c.fechada) return adicionarSolta();
    const n = nParedes(c);
    const ult = c.v[n], pen = c.v[n - 1];
    const angUlt = anguloEntre(pen, ult);
    let giro = -90;
    if (n >= 2) giro = Math.sign(giroDe(c, n - 1) || -1) * 90;
    const comp = Math.max(1000, Math.min(3000, compDe(c, n - 1)));
    const r = (angUlt + giro) * Math.PI / 180;
    c.v.push({ x: ult.x + Math.cos(r) * comp, z: ult.z - Math.sin(r) * comp });
    c.paredes.push(propsPadrao(s.p));
    estado.sel = { c: estado.sel.c, i: n };
    desenha();
  }
  // PAREDE SOLTA — divisória no meio do ambiente, contorno próprio de 1 parede.
  function adicionarSolta() {
    if (!estado) return;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    estado.cadeias.forEach((c) => c.v.forEach((p) => {
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z);
    }));
    if (!isFinite(x0)) { x0 = -1500; x1 = 1500; z0 = -1500; z1 = 1500; }
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const comp = Math.max(1000, Math.min(2000, Math.round((x1 - x0) * 0.6)));
    const s = selecionada();
    estado.cadeias.push({ fechada: false, v: [{ x: cx - comp / 2, z: cz }, { x: cx + comp / 2, z: cz }], paredes: [propsPadrao(s && s.p)] });
    estado.sel = { c: estado.cadeias.length - 1, i: 0 };
    desenha();
  }
  // Remover: ponta do contorno some; meio de contorno aberto parte em dois;
  // de contorno fechado só abre o contorno naquele lugar (vira o vão).
  function remover() {
    const s = selecionada();
    if (!s) return;
    const c = s.c, i = s.i, n = nParedes(c);
    const total = estado.cadeias.reduce((a, x) => a + nParedes(x), 0);
    if (total <= 1) return;
    if (c.fechada) {
      // reordena pra parede removida ser a última e abre
      const v = c.v.slice(i + 1).concat(c.v.slice(0, i + 1));
      const p = c.paredes.slice(i + 1).concat(c.paredes.slice(0, i));
      c.v = v; c.paredes = p; c.fechada = false;
      estado.sel = { c: estado.sel.c, i: Math.max(0, p.length - 1) };
    } else if (n === 1) {
      estado.cadeias.splice(estado.sel.c, 1);
      estado.sel = { c: Math.max(0, estado.sel.c - 1), i: 0 };
    } else if (i === 0) {
      c.v.shift(); c.paredes.shift();
      estado.sel = { c: estado.sel.c, i: 0 };
    } else if (i === n - 1) {
      c.v.pop(); c.paredes.pop();
      estado.sel = { c: estado.sel.c, i: n - 2 };
    } else {
      const c2 = { fechada: false, v: c.v.slice(i + 1), paredes: c.paredes.slice(i + 1) };
      c.v = c.v.slice(0, i + 1); c.paredes = c.paredes.slice(0, i);
      estado.cadeias.splice(estado.sel.c + 1, 0, c2);
      estado.sel = { c: estado.sel.c, i: i - 1 };
    }
    desenha();
  }
  // FECHAR AMBIENTE: com folga pequena (FECHA_TOL) a última parede é ajustada
  // pra terminar no primeiro canto — e o painel já mostrava quanto era a
  // diferença. Com folga maior, nasce uma parede de fechamento com o
  // comprimento que falta.
  function fecharAmbiente() {
    const s = selecionada();
    if (!s || s.c.fechada || nParedes(s.c) < 2) return;
    const c = s.c;
    const gap = folga(c);
    if (gap <= FECHA_TOL && nParedes(c) >= 3) {
      c.v.pop();                      // a última parede passa a terminar em v[0]
      c.fechada = true;
    } else {
      c.paredes.push(propsPadrao(s.p)); // parede nova de v[último] a v[0]
      c.fechada = true;
    }
    estado.sel = { c: estado.sel.c, i: nParedes(c) - 1 };
    desenha();
  }
  // OCULTAR é de VISUALIZAÇÃO, não de projeto: a parede continua existindo,
  // com medida, e os móveis presos nela continuam no pedido.
  function alternaOculta() {
    const s = selecionada();
    if (!s) return;
    s.p.oculta = !s.p.oculta;
    desenha();
  }
  // Virar é uma MARCA (inverterLado): o lado de dentro é deduzido da geometria
  // e a marca é o que permite discordar dela (parede solta, ilha, U).
  function inverter() {
    const s = selecionada();
    if (!s) return;
    s.p.inverterLado = !s.p.inverterLado;
    desenha();
  }
  function aplicaCampos() {
    const s = selecionada();
    if (!s) return;
    const q = (id) => document.getElementById(id);
    const unidade = unidadeAtual();
    const comp = numeroParaMmWE(q('po-wall-comp').value, unidade);
    if (comp != null && Math.abs(comp - compDe(s.c, s.i)) > 1e-6) setComp(s.c, s.i, Math.max(MIN_COMPRIMENTO, comp));
    const giro = Number(q('po-wall-ang').value);
    if (isFinite(giro) && q('po-wall-ang').value !== '' && Math.abs(norm180(giro - giroDe(s.c, s.i))) > 1e-6) setGiro(s.c, s.i, giro);
    s.p.thicknessMm = Math.max(20, numeroParaMmWE(q('po-wall-esp').value, unidade) || ESPESSURA_PADRAO);
    // null = "segue o pé-direito do ambiente".
    const pd = numeroParaMmWE(q('po-wall-pd').value, unidade);
    s.p.ceilingMm = (pd > 0 && pd !== estado.ceilingMm) ? pd : null;
    desenha();
  }

  // ------------------------------------------------------------------------
  // DESENHO
  // ------------------------------------------------------------------------
  // Interseção de duas retas (p + t·d) e (q + u·e). null se paralelas.
  function intersecao(p, d, q, e) {
    const den = d.x * e.z - d.z * e.x;
    if (Math.abs(den) < 1e-9) return null;
    const t = ((q.x - p.x) * e.z - (q.z - p.z) * e.x) / den;
    return { x: p.x + d.x * t, z: p.z + d.z * t };
  }
  // Face externa de cada parede com ESQUADRIA nos cantos do contorno: a face
  // de fora de uma parede encontra a da vizinha na bissetriz, como no 3D
  // (meia-esquadria). Ângulo muito fechado (esquadria maior que 3 espessuras)
  // vira chanfro pra não disparar.
  function poligonoParede(c, i, centro) {
    const a = vIni(c, i), b = vFim(c, i), e = Number(c.paredes[i].thicknessMm) || ESPESSURA_PADRAO;
    const n = normalFora(c, i, centro);
    let fa = { x: a.x + n.x * e, z: a.z + n.z * e };
    let fb = { x: b.x + n.x * e, z: b.z + n.z * e };
    const d = { x: b.x - a.x, z: b.z - a.z };
    const np = nParedes(c);
    const temPrev = c.fechada || i > 0, temNext = c.fechada || i < np - 1;
    if (temPrev) {
      const j = (i - 1 + np) % np, ea = Number(c.paredes[j].thicknessMm) || ESPESSURA_PADRAO;
      const nj = normalFora(c, j, centro), aj = vIni(c, j), bj = vFim(c, j);
      const pj = { x: aj.x + nj.x * ea, z: aj.z + nj.z * ea }, dj = { x: bj.x - aj.x, z: bj.z - aj.z };
      const x = intersecao(fa, d, pj, dj);
      if (x && Math.hypot(x.x - a.x, x.z - a.z) <= 3 * Math.max(e, ea)) fa = x;
    }
    if (temNext) {
      const j = (i + 1) % np, eb = Number(c.paredes[j].thicknessMm) || ESPESSURA_PADRAO;
      const nj = normalFora(c, j, centro), aj = vIni(c, j), bj = vFim(c, j);
      const pj = { x: aj.x + nj.x * eb, z: aj.z + nj.z * eb }, dj = { x: bj.x - aj.x, z: bj.z - aj.z };
      const x = intersecao(fb, d, pj, dj);
      if (x && Math.hypot(x.x - b.x, x.z - b.z) <= 3 * Math.max(e, eb)) fb = x;
    }
    return { pts: [a, b, fb, fa], n };
  }

  function desenha() {
    const stage = document.getElementById('po-wall-stage');
    if (!stage || !estado) return;
    stage.innerHTML = '';

    // Enquadramento: caixa de todos os cantos + margem de 1,2 m.
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    estado.cadeias.forEach((c) => c.v.forEach((p) => {
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z);
    }));
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
    const unidade = unidadeAtual();

    // Malha de 1 m — a referência de escala.
    const g = el('g', { 'pointer-events': 'none' }, svg);
    for (let x = Math.ceil(x0 / GRID_MM) * GRID_MM; x <= x1; x += GRID_MM) {
      el('line', { x1: x, y1: z0, x2: x, y2: z1, stroke: '#e6e2d9', 'stroke-width': fino }, g);
    }
    for (let z = Math.ceil(z0 / GRID_MM) * GRID_MM; z <= z1; z += GRID_MM) {
      el('line', { x1: x0, y1: z, x2: x1, y2: z, stroke: '#e6e2d9', 'stroke-width': fino }, g);
    }

    const centro = centroGeral();
    estado.cadeias.forEach((c, ci) => {
      const selC = ci === estado.sel.c;
      // Folga de fechamento: linha tracejada entre a última ponta e a primeira.
      if (!c.fechada && nParedes(c) >= 2) {
        const a = c.v[0], b = c.v[c.v.length - 1];
        const gap = folga(c);
        if (gap > 0 && gap < K * 0.6) {
          el('line', { x1: a.x, y1: a.z, x2: b.x, y2: b.z, stroke: gap <= FECHA_TOL ? '#3f7d51' : '#b9761a',
            'stroke-width': fino * 1.2, 'stroke-dasharray': (fino * 5) + ' ' + (fino * 5), 'pointer-events': 'none' }, svg);
        }
      }
      for (let i = 0; i < nParedes(c); i++) {
        const p = c.paredes[i];
        const sel = selC && i === estado.sel.i;
        const pol = poligonoParede(c, i, centro);
        const pts = pol.pts.map((q) => q.x.toFixed(1) + ',' + q.z.toFixed(1)).join(' ');
        const poly = el('polygon', Object.assign({
          points: pts,
          fill: sel ? '#e0921f' : '#cfc9bd',
          'fill-opacity': p.oculta ? 0.12 : (sel ? 0.5 : 0.9),
          stroke: sel ? '#e0921f' : '#8d8375',
          'stroke-width': fino * (sel ? 2.5 : 1.2),
          class: 'po-wall-seg'
        }, p.oculta ? { 'stroke-dasharray': (fino * 6) + ' ' + (fino * 4) } : {}), svg);
        // Clicar seleciona; ARRASTAR O CORPO leva o CONTORNO inteiro (o
        // ambiente anda junto). Shift + arrastar destaca esta parede do
        // contorno e leva só ela (vira parede solta).
        poly.addEventListener('pointerdown', (ev) => {
          ev.stopPropagation();
          estado.sel = { c: ci, i };
          desenha();
          iniciaArrasteCorpo(ev, ci, i);
        });
        // Face interna em traço mais forte: é a linha medida.
        const a = vIni(c, i), b = vFim(c, i);
        el('line', { x1: a.x, y1: a.z, x2: b.x, y2: b.z, stroke: sel ? '#b9761a' : '#6f665a', 'stroke-width': fino * 1.6, 'pointer-events': 'none' }, svg);
        // Cota do comprimento, do lado de fora.
        const e = Number(p.thicknessMm) || ESPESSURA_PADRAO;
        const t = el('text', {
          x: (a.x + b.x) / 2 + pol.n.x * (e + K / 40), y: (a.z + b.z) / 2 + pol.n.z * (e + K / 40),
          'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': K / 34,
          fill: sel ? '#b9761a' : '#8d8375', 'font-family': 'sans-serif', 'pointer-events': 'none'
        }, svg);
        t.textContent = mmParaNumeroWE(compDe(c, i), unidade);
      }
      // Alças dos cantos — só no contorno selecionado.
      if (!selC) return;
      c.v.forEach((p, k) => {
        const circ = el('circle', {
          cx: p.x, cy: p.z, r: K / 90, fill: '#fff', stroke: '#e0921f',
          'stroke-width': fino * 2, class: 'po-wall-handle'
        }, svg);
        circ.addEventListener('pointerdown', (ev) => iniciaArrasteCanto(ev, ci, k));
      });
      // Número do canto/parede selecionada (giro é "em relação à anterior")
    });

    // Painel lateral — valores na unidade escolhida pelo cliente.
    const s = selecionada();
    const q = (id) => document.getElementById(id);
    if (s) {
      q('po-wall-comp').value = mmParaNumeroWE(compDe(s.c, s.i), unidade);
      q('po-wall-ang').value = arred(giroDe(s.c, s.i), 2);
      q('po-wall-ang-rotulo').textContent = (s.i === 0 && !s.c.fechada) ? tr('wall_editor.angle') : tr('wall_editor.turn');
      q('po-wall-esp').value = mmParaNumeroWE(Number(s.p.thicknessMm) || ESPESSURA_PADRAO, unidade);
      const alturaMm = s.p.ceilingMm || estado.ceilingMm || '';
      q('po-wall-pd').value = alturaMm === '' ? '' : mmParaNumeroWE(alturaMm, unidade);
      const titulo = q('po-wall-side-title');
      if (titulo) titulo.textContent = tr('wall_editor.section_wall') + ' ' + (s.i + 1) + '/' + nParedes(s.c);
      const gapEl = q('po-wall-gap');
      const btnFechar = q('po-wall-fechar');
      if (gapEl) {
        if (s.c.fechada) {
          gapEl.textContent = tr('wall_editor.gap_closed', { n: nParedes(s.c) });
          gapEl.className = 'po-wall-hint po-wall-gap ok';
        } else if (nParedes(s.c) >= 2) {
          const gap = folga(s.c);
          gapEl.textContent = tr('wall_editor.gap_open', { d: mmParaNumeroWE(gap, unidade), u: unidadeAbrevWE(unidade) });
          gapEl.className = 'po-wall-hint po-wall-gap ' + (gap <= FECHA_TOL ? 'ok' : 'warn');
        } else {
          gapEl.textContent = '';
          gapEl.className = 'po-wall-hint po-wall-gap';
        }
      }
      if (btnFechar) btnFechar.disabled = s.c.fechada || nParedes(s.c) < 2;
    }
    if (q('po-wall-teto')) q('po-wall-teto').value = estado.ceilingMm ? mmParaNumeroWE(estado.ceilingMm, unidade) : '';
    if (q('po-wall-rodape')) q('po-wall-rodape').value = mmParaNumeroWE(estado.baseboardMm || 0, unidade);
    ['po-wall-comp-un', 'po-wall-esp-un', 'po-wall-pd-un', 'po-wall-teto-un', 'po-wall-rodape-un'].forEach((id) => {
      const rotulo = q(id);
      if (rotulo) rotulo.textContent = unidadeAbrevWE(unidade);
    });
    const resumo = q('po-wall-resumo');
    if (resumo) {
      let n = 0, total = 0;
      estado.cadeias.forEach((c) => { for (let i = 0; i < nParedes(c); i++) { n++; total += compDe(c, i); } });
      resumo.textContent = tr('wall_editor.summary', { n, m: mmParaNumeroWE(total, unidade), u: unidadeAbrevWE(unidade) }) +
        (estado.cadeias.length > 1 ? ' · ' + tr('wall_editor.chains', { c: estado.cadeias.length }) : '');
    }
  }

  // ------------------------------------------------------------------------
  // ARRASTE
  // ------------------------------------------------------------------------
  // O SVG É PROCURADO A CADA MOVIMENTO, de propósito: desenha() reconstrói o
  // SVG inteiro a cada quadro, então o elemento capturado no pointerdown fica
  // órfão já no primeiro movimento (getScreenCTM() de SVG fora do documento
  // devolve null e a ponta congela).
  function paraMm(e) {
    const svg = document.querySelector('#po-wall-stage svg');
    if (!svg || !svg.getScreenCTM) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, z: p.y };
  }

  // Corpo: translada o CONTORNO inteiro. Shift: destaca a parede do contorno
  // (vira solta) e leva só ela.
  function iniciaArrasteCorpo(ev, ci, i) {
    ev.preventDefault();
    const ini = paraMm(ev);
    if (!ini) return;
    let c = estado.cadeias[ci];
    if (!c) return;
    if (ev.shiftKey && nParedes(c) > 1) {
      const a = vIni(c, i), b = vFim(c, i), p = c.paredes[i];
      remover();                                   // tira do contorno (mantém seleção coerente)
      const solta = { fechada: false, v: [{ x: a.x, z: a.z }, { x: b.x, z: b.z }], paredes: [p] };
      estado.cadeias.push(solta);
      estado.sel = { c: estado.cadeias.length - 1, i: 0 };
      ci = estado.sel.c; c = solta;
      desenha();
    }
    const base = c.v.map((p) => ({ x: p.x, z: p.z }));
    let andou = false;
    const mover = (e) => {
      const p = paraMm(e);
      if (!p) return;
      let dx = p.x - ini.x, dz = p.z - ini.z;
      if (Math.abs(dx) < 2 && Math.abs(dz) < 2 && !andou) return;  // clique puro
      andou = true;
      if (!e.shiftKey) { dx = Math.round(dx / SNAP_MM) * SNAP_MM; dz = Math.round(dz / SNAP_MM) * SNAP_MM; }
      c.v.forEach((q, k) => { q.x = base[k].x + dx; q.z = base[k].z + dz; });
      desenha();
    };
    const soltar = () => {
      removeEventListener('pointermove', mover);
      removeEventListener('pointerup', soltar);
    };
    addEventListener('pointermove', mover);
    addEventListener('pointerup', soltar);
  }

  // Canto: move SÓ aquele vértice — mexe nas duas paredes dele e em mais
  // nenhuma. Ímãs: malha de 50 mm, 45° em relação ao canto anterior, e
  // JUNÇÃO — soltar a ponta de um contorno aberto em cima da ponta de outro
  // emenda os dois (o único "ligar pontos" que existe, e só quando é pedido).
  // Shift solta todos os ímãs.
  function iniciaArrasteCanto(ev, ci, k) {
    ev.preventDefault();
    ev.stopPropagation();
    const c = estado.cadeias[ci];
    if (!c) return;
    const n = c.v.length;
    const ehPonta = !c.fechada && (k === 0 || k === n - 1);
    let alvoJuncao = null;
    const mover = (e) => {
      const mm = paraMm(e);
      if (!mm) return;
      let x = mm.x, z = mm.z;
      const livre = e.shiftKey;
      if (!livre) { x = Math.round(x / SNAP_MM) * SNAP_MM; z = Math.round(z / SNAP_MM) * SNAP_MM; }
      // ímã de 45° em relação ao vizinho (o anterior, ou o seguinte se for o 1º)
      const viz = k > 0 ? c.v[k - 1] : (c.fechada ? c.v[n - 1] : c.v[1]);
      if (!livre && viz) {
        const ang = anguloEntre(viz, { x, z });
        const alvo = Math.round(ang / 45) * 45;
        if (Math.abs(norm180(ang - alvo)) <= SNAP_ANGULO_GRAUS) {
          const comp = Math.max(MIN_COMPRIMENTO, Math.hypot(x - viz.x, z - viz.z));
          const r = alvo * Math.PI / 180;
          x = viz.x + Math.cos(r) * comp;
          z = viz.z - Math.sin(r) * comp;
        }
      }
      alvoJuncao = null;
      if (!livre && ehPonta) {
        let dist = RAIO_JUNCAO;
        estado.cadeias.forEach((o, oj) => {
          if (oj === ci || o.fechada) return;
          [[0, o.v[0]], [o.v.length - 1, o.v[o.v.length - 1]]].forEach(([ok, p]) => {
            const d = Math.hypot(p.x - x, p.z - z);
            if (d < dist) { dist = d; alvoJuncao = { cadeia: oj, k: ok, x: p.x, z: p.z }; }
          });
        });
        if (alvoJuncao) { x = alvoJuncao.x; z = alvoJuncao.z; }
      }
      // não deixa a parede virar ponto
      const vizs = [];
      if (k > 0) vizs.push(c.v[k - 1]); else if (c.fechada) vizs.push(c.v[n - 1]);
      if (k < n - 1) vizs.push(c.v[k + 1]); else if (c.fechada) vizs.push(c.v[0]);
      if (vizs.some((p) => Math.hypot(x - p.x, z - p.z) < MIN_COMPRIMENTO)) return;
      c.v[k].x = x; c.v[k].z = z;
      desenha();
    };
    const soltar = () => {
      removeEventListener('pointermove', mover);
      removeEventListener('pointerup', soltar);
      if (alvoJuncao) juntar(ci, k, alvoJuncao.cadeia, alvoJuncao.k);
    };
    addEventListener('pointermove', mover);
    addEventListener('pointerup', soltar);
  }
  // Emenda dois contornos abertos pela ponta: A (ponta k) + B (ponta ok).
  // Resultado: um contorno só, A depois B, orientado pra ponta de A ser o fim.
  function juntar(ca, ka, cb, kb) {
    const A = estado.cadeias[ca], B = estado.cadeias[cb];
    if (!A || !B || A === B) return;
    let va = A.v.map((p) => ({ x: p.x, z: p.z })), pa = A.paredes.slice();
    let vb = B.v.map((p) => ({ x: p.x, z: p.z })), pb = B.paredes.slice();
    if (ka === 0) { va.reverse(); pa.reverse(); }            // ponta de A vira o fim
    if (kb !== 0) { vb.reverse(); pb.reverse(); }            // ponta de B vira o início
    vb.shift();                                              // o canto é um só
    const novo = { fechada: false, v: va.concat(vb), paredes: pa.concat(pb) };
    const selI = pa.length - 1;
    estado.cadeias = estado.cadeias.filter((c) => c !== A && c !== B);
    estado.cadeias.push(novo);
    estado.sel = { c: estado.cadeias.length - 1, i: selI };
    desenha();
  }

  // Troca de idioma com o modal ABERTO: re-traduz na hora e redesenha.
  if (typeof I18n !== 'undefined' && I18n && I18n.onLanguageChange) {
    I18n.onLanguageChange(() => {
      const m = document.getElementById('po-wall-editor-modal');
      if (!m || !m.classList.contains('open')) return;
      traduzModal(m);
      if (estado) desenha();
    });
  }

  global.WallEditor = { open, padrao, _importar: importar };
})(typeof window !== 'undefined' ? window : this);
