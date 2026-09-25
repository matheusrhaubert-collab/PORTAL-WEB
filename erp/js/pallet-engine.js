/* Legno — motor de empilhamento de pallet (PALLET)
 *
 * Nasceu em scratch/teste-pallet-3d.html (22/09) e foi extraído pra cá pra
 * servir a tela Produção → Embalagem do ERP (erp/js/screens-embalagem.js)
 * E a página de teste, com UMA fonte só. Sem dependência obrigatória: roda
 * em file:// como o resto do ERP. Se NESTING (erp/js/nesting.js, o motor do
 * Plano de Corte) estiver carregado, o empacotador ganha o motor "nesting";
 * senão segue só com o motor de canto.
 *
 * O QUE FAZ
 *   PALLET.parsePecas(texto)      texto colado (tabela do portal / JSON) → peças
 *   PALLET.expandir(pecas)        explode quantidade e normaliza c >= l >= e
 *   PALLET.empacotar(pecas, opt)  UM empacotamento numa planta dada
 *   PALLET.empacotarAuto(pecas, opt)  busca a planta/motor/ordem de MENOR
 *                                 CUBAGEM (objetivo do Matt: maior peso no
 *                                 menor volume) — devolve { res, escolhida, tentativas }
 *   PALLET.medidasPallet(pal, res, opt)  medidas/peso/cubagem de um pallet pronto
 *   PALLET.DEFAULTS               opções padrão (as mesmas da página de teste)
 *
 * REGRAS (todas do Matt, 22/09 — ver comentários em empacotar):
 *   - apoio: cada peça tem 6 pontos (4 cantos + 2 no meio das bordas
 *     compridas); entra se >= 4 apoiados, tanto faz quais; tolerância de
 *     altura ZERO (ponta a 1 mm do nível de baixo está no ar);
 *   - largura máx. do pallet 1100 mm por padrão (lado curto); o comprimento
 *     segue a peça mais comprida;
 *   - peça que não acha lugar com apoio pleno é adiada uma vez e, se falhar
 *     de novo, fica marcada (`parcial`) — vermelha no 3D, contada no
 *     relatório, nunca escondida.
 *
 * FORMATO DE PEÇA (entrada de empacotar): { id, nome, cor, c, l, e }
 *   c = comprimento, l = largura, e = espessura (mm), c >= l >= e.
 * FORMATO DE SAÍDA: res = { pallets:[{ pecas:[{peca,x,y,w,d,z,parcial}],
 *   camadas:[{z,esp,itens,ocupacao}], alturaCarga }], sobras, planW, planD }
 */

const PALLET = (function () {

/* ==========================================================================
   1) Parser da lista de peças
   ========================================================================== */

// Converte um texto de dimensão pro valor em mm. Cobre o que
// formatDimension() do portal escreve: "1800 mm", "180.0 cm", "1.800 m",
// "5.906 ft" e polegada fracionária "70 7/8"".
function parseDim(txt){
  if (txt == null) return null;
  let s = String(txt).trim();
  if (!s) return null;
  if (/["”]|\bin\b|\binch/i.test(s)){
    s = s.replace(/["”]/g, ' ').replace(/\binch(es)?\b|\bin\b/ig, ' ').trim();
    let total = 0, achou = false, resto = s;
    const frac = s.match(/(\d+)\s*\/\s*(\d+)/);
    if (frac){ total += Number(frac[1]) / Number(frac[2]); achou = true; resto = s.replace(frac[0], ' '); }
    const inteiro = resto.match(/\d+(?:[.,]\d+)?/);
    if (inteiro){ total += Number(inteiro[0].replace(',', '.')); achou = true; }
    return achou ? total * 25.4 : null;
  }
  const num = s.match(/-?\d+(?:[.,]\d+)?/);
  if (!num) return null;
  const v = Number(num[0].replace(',', '.'));
  if (!isFinite(v) || v <= 0) return null;
  if (/\bmm\b/i.test(s)) return v;
  if (/\bcm\b/i.test(s)) return v * 10;
  if (/\bft\b/i.test(s) || /'/.test(s)) return v * 304.8;
  if (/\bm\b/i.test(s)) return v * 1000;
  return v; // sem unidade = mm
}

// Uma linha vira 0 ou 1 peça. Estratégia: entre as células que parseiam como
// medida, procura a primeira TRINCA consecutiva que se comporta como
// comprimento >= largura >= espessura (e espessura no máximo metade da
// largura). É isso que separa a medida de verdade do "#" da tabela e do "6x"
// da quantidade, que também parecem número.
function parseLinha(linha){
  let celulas = linha.split('\t');
  if (celulas.length < 4) celulas = linha.trim().split(/\s{2,}|\s*[;|]\s*/);
  if (celulas.length < 4) celulas = linha.trim().split(/\s+/);
  celulas = celulas.map((c) => c.trim());

  const dims = celulas.map(parseDim);
  const temLetra = (t) => /[a-zA-ZÀ-ÿ]/.test(t || '');

  let base = -1, ultimaTrinca = -1;
  for (let i = 0; i + 2 < dims.length; i++){
    const a = dims[i], b = dims[i + 1], c = dims[i + 2];
    if (a == null || b == null || c == null) continue;
    ultimaTrinca = i;
    if (a >= b - 1e-6 && b >= c - 1e-6 && c <= b * 0.5 + 1e-6){ base = i; break; }
  }
  // Nenhuma trinca na ordem esperada: usa a última que existir e ordena na mão
  // (cobre quem cola largura × comprimento × espessura).
  if (base < 0){
    if (ultimaTrinca < 0) return null;
    base = ultimaTrinca;
  }
  const v = [dims[base], dims[base + 1], dims[base + 2]].sort((a, b) => b - a);
  const c = v[0], l = v[1], e = v[2];
  if (!(c > 0 && l > 0 && e > 0)) return null;
  if (e > Math.min(c, l)) return null;

  let nome = '';
  for (let i = base - 1; i >= 0; i--){ if (temLetra(celulas[i])){ nome = celulas[i]; break; } }
  let cor = '';
  for (let i = base + 3; i < celulas.length; i++){
    if (temLetra(celulas[i]) && !/^[×x↺]$/i.test(celulas[i])){ cor = celulas[i]; break; }
  }

  // Quantidade: "3x Lateral", "Lateral (x3)" ou uma célula só com o número
  // antes do nome (coluna Qtd).
  let qtd = 1;
  const mq = (nome || '').match(/^\s*(\d+)\s*[x×]\s*/i) || (nome || '').match(/[（(]\s*[x×]\s*(\d+)\s*[)）]/i);
  if (mq){ qtd = Math.max(1, parseInt(mq[1], 10)); nome = nome.replace(mq[0], '').trim(); }

  return { nome: nome || 'Peça', cor: cor || '', c: Math.round(c), l: Math.round(l),
           e: Math.round(e * 10) / 10, qtd };
}

function parsePecas(texto){
  const t = (texto || '').trim();
  if (!t) return { pecas: [], ignoradas: 0 };
  // JSON?
  if (/^[\[{]/.test(t)){
    try {
      let dados = JSON.parse(t);
      if (!Array.isArray(dados)) dados = dados.pecas || dados.pieces || dados.rows || [];
      const pecas = [];
      dados.forEach((o) => {
        const nums = [o.c, o.l, o.e, o.comprimento, o.largura, o.espessura,
                      o.length_mm, o.width_mm, o.height_mm, o.depth_mm]
          .map((v) => (v == null ? null : Number(v))).filter((v) => v && isFinite(v));
        const v = nums.slice(0, 3).sort((a, b) => b - a);
        if (v.length < 3) return;
        pecas.push({ nome: o.nome || o.reference || o.name || 'Peça', cor: o.cor || (o.color && o.color.name) || '',
                     c: Math.round(v[0]), l: Math.round(v[1]), e: Math.round(v[2] * 10) / 10,
                     qtd: Math.max(1, parseInt(o.qtd || o.qty || o.quantidade || 1, 10)) });
      });
      return { pecas, ignoradas: 0 };
    } catch (e) { /* não era JSON, segue como texto */ }
  }
  const pecas = [];
  let ignoradas = 0;
  t.split(/\r?\n/).forEach((linha) => {
    if (!linha.trim()) return;
    const p = parseLinha(linha);
    if (p) pecas.push(p); else ignoradas++;
  });
  return { pecas, ignoradas };
}

// Expande qtd e normaliza: comprimento >= largura >= espessura (é como a
// peça chega na serra e como o modal do portal já mostra).
function expandir(pecas){
  const out = [];
  pecas.forEach((p, idx) => {
    for (let i = 0; i < p.qtd; i++){
      const v = [p.c, p.l, p.e].sort((a, b) => b - a);
      out.push({ id: out.length, grupo: idx, nome: p.nome, cor: p.cor, c: v[0], l: v[1], e: v[2] });
    }
  });
  return out;
}

/* ==========================================================================
   2) Empacotador — camadas com apoio garantido
   ========================================================================== */

// MOTOR: mapa de alturas (height map), não "camadas rígidas".
//
// Por que não camada rígida: se a camada é fechada antes da próxima começar, a
// 2ª camada só pode pousar em cima do que a 1ª cobriu — e como a 1ª quase
// nunca cobre o pallet inteiro, o monte vira uma pirâmide de 1 peça por
// camada (foi exatamente o que aconteceu no 1º teste).
//
// Aqui o pallet é uma grade de alturas em mm. Cada peça procura a posição
// mais BAIXA possível: pousa no topo do que já existe debaixo dela e só é
// aceita se esse topo for plano o bastante (apoio total >= apoioMin e as 4
// faixas de ponta >= apoioPonta). É isso que deixa uma peça grande deitar em
// cima de VÁRIAS menores que chegaram na mesma altura — e que impede peça em
// balanço, porque a ponta sem nada embaixo reprova na hora.
function empacotar(pecas, opt){
  if (!pecas.length) return { pallets: [], sobras: [], planW: 0, planD: 0 };

  // Planta da carga: a maior peça manda. Com giro permitido, o que vale é
  // maior-lado × menor-lado; sem giro, comprimento × largura como vieram.
  let planW = 0, planD = 0;
  pecas.forEach((p) => {
    const a = opt.rotacionar ? Math.max(p.c, p.l) : p.c;
    const b = opt.rotacionar ? Math.min(p.c, p.l) : p.l;
    planW = Math.max(planW, a); planD = Math.max(planD, b);
  });
  if (opt.planW) planW = Math.max(planW, opt.planW);
  if (opt.planD) planD = Math.max(planD, opt.planD);

  const step = 10;                                    // resolução da grade (mm)
  const cols = Math.max(1, Math.round(planW / step));
  const rows = Math.max(1, Math.round(planD / step));
  const TOL = 0.6;                                    // "mesma altura" (mm)
  const alturaBase = opt.peH + opt.deckE;
  const tetoCarga = opt.hMax > 0 ? opt.hMax - alturaBase : Infinity;

  const cel = (v) => Math.round(v / step);
  const orientacoes = (p) => (opt.rotacionar && p.c !== p.l ? [[p.c, p.l], [p.l, p.c]] : [[p.c, p.l]]);

  // Avalia um encaixe: devolve {z, cov} ou null se reprova no apoio.
  function avaliar(h, x, y, w, d, esp){
    if (x < -1e-6 || y < -1e-6 || x + w > planW + 1e-6 || y + d > planD + 1e-6) return null;
    const x0 = Math.max(0, cel(x)), x1 = Math.min(cols, Math.max(cel(x) + 1, cel(x + w)));
    const y0 = Math.max(0, cel(y)), y1 = Math.min(rows, Math.max(cel(y) + 1, cel(y + d)));
    let z = 0;
    for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++){ const v = h[j * cols + i]; if (v > z) z = v; }
    if (z + (esp || 0) > tetoCarga + 1e-6) return null;

    // Conta como apoio o que está no nível z OU até `degrau` abaixo dele: uma
    // chapa atravessando um degrau de uma espessura não está em balanço, é o
    // que se faz na fábrica. Sem essa tolerância o monte vira escada e trava.
    const piso = z - Math.max(TOL, opt.degrau);
    let tot = 0, cob = 0;
    for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++){ tot++; if (h[j * cols + i] >= piso) cob++; }
    const cov = tot ? cob / tot : 0;
    if (z <= TOL) return { z, cov, ok: true }; // no estrado o apoio é pleno por definição

    const faixa = (ax, ay, aw, ad) => {
      const i0 = Math.max(0, cel(ax)), i1 = Math.min(cols, Math.max(cel(ax) + 1, cel(ax + aw)));
      const j0 = Math.max(0, cel(ay)), j1 = Math.min(rows, Math.max(cel(ay) + 1, cel(ay + ad)));
      let t = 0, c = 0;
      for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++){ t++; if (h[j * cols + i] >= piso) c++; }
      return t ? c / t : 0;
    };
    const p = opt.apoioPonta;

    if (opt.regra === 'area'){
      // Regra antiga (comparação): >= apoioMin da área + as 4 faixas de ponta.
      if (cov < opt.apoioMin) return { z, cov, ok: false };
      const fx = Math.max(25, w * 0.05), fy = Math.max(25, d * 0.05);
      if (faixa(x, y, fx, d) < p) return { z, cov, ok: false };
      if (faixa(x + w - fx, y, fx, d) < p) return { z, cov, ok: false };
      if (faixa(x, y, w, fy) < p) return { z, cov, ok: false };
      if (faixa(x, y + d - fy, w, fy) < p) return { z, cov, ok: false };
      return { z, cov, ok: true };
    }

    // Regra do Matt (22/09): toda peça tem 6 pontos — 4 cantos + 2 no meio
    // das bordas compridas (grade 3×2). Apoiada em 4 ou mais deles, tanto faz
    // quais, ela fica estável; com menos pode tombar. Tolerância de altura
    // zero: ponto só conta se o que está embaixo encosta na peça.
    const zc = opt.zonaCanto > 0 ? opt.zonaCanto : Math.max(40, Math.min(w, d) * 0.1);
    const zw = Math.min(zc, w), zd = Math.min(zc, d);
    const ponto = (cx, cy) => faixa(cx, cy, zw, zd) >= p;
    // eixo comprido = onde ficam os 2 pontos do meio
    const pontos = w >= d
      ? [[x, y], [x + (w - zw) / 2, y], [x + w - zw, y], [x, y + d - zd], [x + (w - zw) / 2, y + d - zd], [x + w - zw, y + d - zd]]
      : [[x, y], [x, y + (d - zd) / 2], [x, y + d - zd], [x + w - zw, y], [x + w - zw, y + (d - zd) / 2], [x + w - zw, y + d - zd]];
    let apoiados = 0;
    const semApoio = [];
    pontos.forEach(([px, py], k) => { if (ponto(px, py)) apoiados++; else semApoio.push([px, py, k]); });
    const pmin = opt.pontosMin || 4;
    const ok = apoiados >= pmin;
    if (ok || !opt.calco || !(opt.calco.h > 0)) return { z, cov, ok, apoiados };

    // CALÇO (Apontamento+Embalagem, 24/09 — Matt: "podemos deixar disponível
    // calços de apoio tipo 10x10x19 ... não devem passar de 2 de altura").
    // Ponto sem apoio vira apoiado se o vão entre a peça e o que está embaixo
    // for 1 ou 2 calços (± tol). O calço pousa no ponto mais alto da zona.
    // Só liga com opt.calco; sem ele o motor é o de sempre.
    const cH = opt.calco.h, cMax = opt.calco.max || 2, cTol = opt.calco.tol == null ? 2 : opt.calco.tol;
    const lado = opt.calco.lado || 100;
    const topoZona = (ax, ay) => {
      const i0 = Math.max(0, cel(ax)), i1 = Math.min(cols, Math.max(cel(ax) + 1, cel(ax + zw)));
      const j0 = Math.max(0, cel(ay)), j1 = Math.min(rows, Math.max(cel(ay) + 1, cel(ay + zd)));
      let m = 0;
      for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++){ const v = h[j * cols + i]; if (v > m) m = v; }
      return m;
    };
    const calcaveis = [];
    semApoio.forEach(([px, py, k]) => {
      const base = topoZona(px, py);
      const vao = z - base;
      const n = Math.round(vao / cH);
      if (n < 1 || n > cMax || Math.abs(vao - n * cH) > cTol) return;
      // centro do calço dentro da peça
      const cx = Math.min(Math.max(px + zw / 2, x + Math.min(lado, w) / 2), x + w - Math.min(lado, w) / 2);
      const cy = Math.min(Math.max(py + zd / 2, y + Math.min(lado, d) / 2), y + d - Math.min(lado, d) / 2);
      calcaveis.push({ x: cx, y: cy, z: base, n, canto: k !== 1 && k !== 4 });
    });
    const falta = pmin - apoiados;
    if (calcaveis.length < falta) return { z, cov, ok: false, apoiados };
    // cantos primeiro (base mais larga), depois menos calço empilhado
    calcaveis.sort((a, b) => (b.canto - a.canto) || (a.n - b.n));
    return { z, cov, ok: false, okCalco: true, apoiados, calcos: calcaveis.slice(0, falta).map(({ x, y, z, n }) => ({ x, y, z, n })) };
  }

  function carimbar(h, x, y, w, d, topo){
    const x0 = Math.max(0, cel(x)), x1 = Math.min(cols, Math.max(cel(x) + 1, cel(x + w)));
    const y0 = Math.max(0, cel(y)), y1 = Math.min(rows, Math.max(cel(y) + 1, cel(y + d)));
    for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) h[j * cols + i] = topo;
  }

  // Ordem de entrada das peças. Muda MUITO a altura final, e qual ordem ganha
  // depende do conjunto — por isso o modo "menor cubagem" testa todas e fica
  // com a melhor (ver empacotarAuto).
  //   grupoMax: grupos de espessura, o grupo da MAIOR peça primeiro (chapa
  //             grande embaixo formando base plana), maior área primeiro dentro.
  //   area:     maior área primeiro, sem olhar espessura.
  //   comp:     peça mais comprida primeiro.
  //   espDesc:  mais grossa embaixo.
  const pool = pecas.slice();
  pool.forEach((p) => { p._adiada = false; });
  const areaGrupo = {};
  pool.forEach((p) => { const a = p.c * p.l; if (!(areaGrupo[p.e] >= a)) areaGrupo[p.e] = a; });
  const ordem = opt.ordem || (opt.agrupar ? 'grupoMax' : 'area');
  if (ordem === 'area') pool.sort((a, b) => (b.c * b.l - a.c * a.l) || (b.c - a.c));
  else if (ordem === 'comp') pool.sort((a, b) => (b.c - a.c) || (b.c * b.l - a.c * a.l));
  else if (ordem === 'espDesc') pool.sort((a, b) => (b.e - a.e) || (b.c * b.l - a.c * a.l));
  else pool.sort((a, b) => (areaGrupo[b.e] - areaGrupo[a.e]) || (b.c * b.l - a.c * a.l) || (b.c - a.c));

  const pallets = [];
  const sobras = [];
  let h = new Float32Array(cols * rows);
  let cands = [{ x: 0, y: 0 }];
  let vistos = new Set(['0:0']);
  let postas = [];

  const fecharPallet = () => {
    if (!postas.length) return;
    // Níveis = peças agrupadas pela altura em que pousaram (só pra ler/desenhar).
    const mapa = new Map();
    postas.forEach((it) => {
      const k = Math.round(it.z * 2) / 2;
      if (!mapa.has(k)) mapa.set(k, []);
      mapa.get(k).push(it);
    });
    const camadas = [...mapa.entries()].sort((a, b) => a[0] - b[0]).map(([z, itens]) => ({
      z, itens,
      esp: itens.reduce((m, it) => Math.max(m, it.peca.e), 0),
      ocupacao: itens.reduce((s, it) => s + it.w * it.d, 0) / (planW * planD)
    }));
    let alturaCarga = 0;
    postas.forEach((it) => { alturaCarga = Math.max(alturaCarga, it.z + it.peca.e); });
    pallets.push({ camadas, alturaCarga, pecas: postas });
  };
  const novoPallet = () => {
    fecharPallet();
    h = new Float32Array(cols * rows);
    cands = [{ x: 0, y: 0 }];
    vistos = new Set(['0:0']);
    postas = [];
  };

  const g = opt.gap;

  // Registra uma peça posta: mapa de alturas + pontos candidatos pro encaixe
  // de canto (os cantos da peça nova viram lugares onde a próxima pode colar).
  function registrar(p, x, y, w, d, z, parcial, calcos, cov){
    const it = { peca: p, x, y, w, d, z, parcial };
    if (calcos && calcos.length) it.calcos = calcos;
    if (cov != null) it.cov = cov;
    postas.push(it);
    carimbar(h, x, y, w, d, z + p.e);
    [[x + w + g, y], [x, y + d + g], [x, y], [x + w + g, y + d + g]].forEach(([cx, cy]) => {
      if (cx > planW || cy > planD) return;
      const key = Math.round(cx) + ':' + Math.round(cy);
      if (vistos.has(key)) return;
      vistos.add(key); cands.push({ x: cx, y: cy });
    });
  }

  // Encaixe de UMA peça pelo método de canto: candidatos do mais baixo pro
  // mais alto, depois varredura em grade, depois "plano B" (apoio parcial,
  // marcado). Devolve o encaixe (sem registrar) ou null se não cabe aqui.
  function planejarUma(p){
    let melhor = null;   // encaixe que OBEDECE a regra de apoio
    let plano_b = null;  // melhor encaixe possível se nenhum obedecer
    let melhorC = null;  // encaixe que obedece COM calço (só com opt.calco)
    const pesaC = (r, x, y, w, d) => {
      const topo = r.z + p.e;
      const nC = r.calcos.reduce((s, c) => s + c.n, 0);
      if (!melhorC || topo < melhorC.topo - 1e-6 || (Math.abs(topo - melhorC.topo) < 1e-6 && nC < melhorC.nC))
        melhorC = { x, y, w, d, z: r.z, topo, cov: r.cov, calcos: r.calcos, nC };
    };
    const ordenados = cands.map((c) => {
      const i = Math.min(cols - 1, Math.max(0, cel(c.x))), j = Math.min(rows - 1, Math.max(0, cel(c.y)));
      return { c, hz: h[j * cols + i] };
    }).sort((a, b) => (a.hz - b.hz) || (a.c.y - b.c.y) || (a.c.x - b.c.x));

    for (const o of ordenados){
      if (melhor && o.hz + p.e >= melhor.topo - 1e-6) break; // não dá pra melhorar
      for (const [w, d] of orientacoes(p)){
        const r = avaliar(h, o.c.x, o.c.y, w, d, p.e);
        if (!r) continue;
        const topo = r.z + p.e;
        if (!plano_b || r.cov > plano_b.cov + 1e-6 || (Math.abs(r.cov - plano_b.cov) < 1e-6 && topo < plano_b.topo)){
          plano_b = { x: o.c.x, y: o.c.y, w, d, z: r.z, topo, cov: r.cov };
        }
        if (r.okCalco) pesaC(r, o.c.x, o.c.y, w, d);
        if (!r.ok) continue;
        // Critério: topo mais baixo; empatou, o apoio mais cheio (deixa o
        // monte mais plano pra próxima peça); empatou de novo, canto de baixo.
        const melhorQueAtual = !melhor || topo < melhor.topo - 1e-6
          || (Math.abs(topo - melhor.topo) < 1e-6 && (r.cov > melhor.cov + 1e-6
            || (Math.abs(r.cov - melhor.cov) < 1e-6 && (o.c.y < melhor.y || (o.c.y === melhor.y && o.c.x < melhor.x)))));
        if (melhorQueAtual) melhor = { x: o.c.x, y: o.c.y, w, d, z: r.z, topo, cov: r.cov };
      }
    }

    // Nenhum canto serviu: varre a planta numa grade grossa antes de desistir.
    if (!melhor){
      const passoX = Math.max(80, (planW - Math.min(p.c, p.l)) / 24);
      const passoY = Math.max(80, (planD - Math.min(p.c, p.l)) / 12);
      for (const [w, d] of orientacoes(p)){
        for (let y = 0; y <= planD - d + 1e-6; y += passoY){
          for (let x = 0; x <= planW - w + 1e-6; x += passoX){
            const r = avaliar(h, x, y, w, d, p.e);
            if (!r) continue;
            const topo = r.z + p.e;
            if (!plano_b || r.cov > plano_b.cov + 1e-6 || (Math.abs(r.cov - plano_b.cov) < 1e-6 && topo < plano_b.topo)){
              plano_b = { x, y, w, d, z: r.z, topo, cov: r.cov };
            }
            if (r.okCalco) pesaC(r, x, y, w, d);
            if (!r.ok) continue;
            if (!melhor || topo < melhor.topo - 1e-6 ||
                (Math.abs(topo - melhor.topo) < 1e-6 && r.cov > melhor.cov + 1e-6)){
              melhor = { x, y, w, d, z: r.z, topo, cov: r.cov };
            }
          }
        }
      }
    }

    // Último recurso: nenhum lugar obedece a regra de apoio. Em vez de abrir
    // um pallet novo por peça, põe no melhor lugar possível e MARCA a peça —
    // sai vermelha no 3D e contada no relatório.
    // Calço entra quando é a ÚNICA forma de apoiar a peça, ou quando deixa o
    // monte mais baixo (compacto) por pelo menos calco.ganhoMin mm.
    if (melhorC && (!melhor || melhorC.topo < melhor.topo - (opt.calco.ganhoMin || 0))){
      return { x: melhorC.x, y: melhorC.y, w: melhorC.w, d: melhorC.d, z: melhorC.z, parcial: false, calcos: melhorC.calcos, cov: melhorC.cov };
    }
    let parcial = false;
    if (!melhor && plano_b){ melhor = plano_b; parcial = true; }
    if (!melhor) return null;
    return { x: melhor.x, y: melhor.y, w: melhor.w, d: melhor.d, z: melhor.z, parcial, cov: melhor.cov };
  }

  // Encaixe em LOTE com o motor do Plano de Corte (erp/js/nesting.js): cada
  // nível do pallet é tratado como uma chapa de planW × planD e as peças
  // restantes são "nestadas" nela (MaxRects e guilhotina/faixas, fica o que
  // encaixou mais). Depois cada peça encaixada passa pela regra de apoio em
  // cima do que já existe; as que reprovam ficam pro próximo lote. Devolve
  // { zMin, baixas } (sem registrar) ou null.
  const usaNesting = opt.motor === 'nesting' && typeof NESTING !== 'undefined' && NESTING._packBin;
  function planejarLote(){
    const grupo = opt.agrupar ? pool.filter((p) => p.e === pool[0].e) : pool.slice();
    const itens = grupo.map((p, i) => ({ key: i, w: p.c, h: p.l, grain: false, label: p.nome, ref: p }));
    const params = { kerf_mm: g, trim_left_mm: 0, trim_right_mm: 0, trim_top_mm: 0, trim_bottom_mm: 0,
                     first_cut: 'auto', allow_rotation: !!opt.rotacionar, respect_grain: false,
                     min_offcut_width_mm: 0, min_offcut_height_mm: 0, __allowFullLength: false };
    const layouts = [];
    ['maxrects', 'auto'].forEach((strategy) => {
      itens.forEach((q) => { q._done = false; });
      let r;
      try { r = NESTING._packBin(itens, planW, planD, { ...params, strategy }); } catch (e) { return; }
      if (r && r.placed && r.placed.length) layouts.push(r.placed);
    });
    if (!layouts.length) return 0;

    // O nesting não enxerga o relevo: encaixa como se o nível fosse plano e
    // sempre começa do canto (0,0) — que costuma ser justamente onde o monte
    // já está mais alto. Dois remédios:
    //  1. o mesmo desenho é testado espelhado (4 jeitos): o que cair mais no
    //     vale ganha;
    //  2. só aceita as peças que caem BAIXO (até um degrau acima da mais
    //     baixa) — as outras voltam pro próximo lote, quando o vale já estará
    //     preenchido. É o que mantém o monte nivelado em vez de virar torre.
    let melhor = null;
    layouts.forEach((placed) => {
      [[false, false], [true, false], [false, true], [true, true]].forEach(([fx, fy]) => {
        const avaliadas = [];
        placed.forEach((pl) => {
          const x = fx ? planW - pl.x - pl.w : pl.x;
          const y = fy ? planD - pl.y - pl.h : pl.y;
          const p = pl.piece.ref;
          const r = avaliar(h, x, y, pl.w, pl.h, p.e);
          if (r && r.ok) avaliadas.push({ x, y, w: pl.w, d: pl.h, p, z: r.z });
        });
        if (!avaliadas.length) return;
        const zMin = Math.min(...avaliadas.map((a) => a.z));
        const baixas = avaliadas.filter((a) => a.z <= zMin + Math.max(TOL, opt.degrau));
        const area = baixas.reduce((s, a) => s + a.w * a.d, 0);
        // mais baixo primeiro; empatou, mais área aceita no nível
        if (!melhor || zMin < melhor.zMin - 1e-6 || (Math.abs(zMin - melhor.zMin) < 1e-6 && area > melhor.area)){
          melhor = { zMin, area, baixas };
        }
      });
    });
    if (!melhor) return null;
    melhor.baixas.sort((a, b) => (a.z - b.z) || (b.w * b.d - a.w * a.d));
    return melhor;
  }

  // MODO INCREMENTAL (Apontamento+Embalagem, 25/09 — Matt: "conforme as
  // peças são apontadas você deve montar um pallet bem acomodado pra elas,
  // de forma dinâmica"). opt.fixas = itens JÁ no pallet, com posição: entram
  // no mapa de alturas como estão, e só as `pecas` novas são encaixadas em
  // cima. Com opt.semNovoPallet, peça que não cabe vira sobra em vez de
  // abrir outro pallet (quem decide o pallet seguinte é a tela).
  (opt.fixas || []).forEach((it) => registrar(it.peca, it.x, it.y, it.w, it.d, it.z, !!it.parcial, it.calcos));
  const nFixas = postas.length;

  let guarda = 0;
  while (pool.length){
    if (++guarda > pecas.length * 4 + 50){ sobras.push(...pool); break; } // nunca travar
    const p = pool[0];
    const uma = planejarUma(p);
    // Nesting e canto competem a cada rodada: o lote do nesting só entra se
    // pousa tão baixo quanto o encaixe de canto da próxima peça — senão o
    // nesting (que não enxerga o relevo) sobe torre num canto enquanto o
    // canto ainda acharia vale pra encher.
    if (usaNesting){
      const lote = planejarLote();
      if (lote && (!uma || uma.parcial || lote.zMin <= uma.z + Math.max(TOL, opt.degrau))){
        lote.baixas.forEach(({ x, y, w, d, p: q, z }) => { registrar(q, x, y, w, d, z, false); pool.splice(pool.indexOf(q), 1); });
        continue;
      }
    }
    // Só achou lugar com apoio parcial? Adia a peça pro fim da fila UMA vez:
    // depois que o resto do monte subir, costuma aparecer um nível cheio onde
    // ela cabe com apoio pleno. Só fica vermelha se falhar de novo no fim.
    if (uma && uma.parcial && !p._adiada){ p._adiada = true; pool.push(pool.shift()); continue; }
    if (uma){ registrar(p, uma.x, uma.y, uma.w, uma.d, uma.z, uma.parcial, uma.calcos, uma.cov); pool.shift(); continue; }
    if (opt.semNovoPallet){ sobras.push(pool.shift()); continue; }
    if (postas.length){ novoPallet(); continue; }      // só cabe num pallet novo
    sobras.push(pool.shift());                         // não cabe nem no pallet vazio
  }
  fecharPallet();
  if (opt.fixas && pallets[0]) pallets[0].novas = pallets[0].pecas.slice(nFixas);

  return { pallets, sobras, planW, planD };
}

// --------------------------------------------------------------------------
// OBJETIVO "MENOR CUBAGEM": maior peso no menor volume.
//
// O volume do pallet é (largura × profundidade × altura). A largura e a
// profundidade são ESCOLHA nossa — o único piso é a maior peça. Planta
// estreita = monte alto (e muito espaço vazio entre peça e peça); planta
// larga = monte baixo mas pallet grande. O ótimo fica no meio e depende do
// conjunto de peças, então aqui ele é PROCURADO em vez de chutado.
//
// Busca em 3 passos (barata: cada tentativa é um empacotamento inteiro):
//   1. varre profundidades candidatas com a largura mínima;
//   2. com a melhor profundidade, varre larguras candidatas;
//   3. com a melhor planta, testa as 4 ordens de empilhamento.
// As candidatas não são uma régua qualquer: são SOMAS de lados de peça (1, 2
// ou 3 peças lado a lado). Só esses valores mudam alguma coisa no encaixe —
// uma planta 5mm maior que a soma de duas peças é 5mm de ar puro.
// --------------------------------------------------------------------------
function cubagemDe(res, opt){
  const base = opt.peH + opt.deckE;
  const W = (res.planW + 2 * opt.margem) / 1000, D = (res.planD + 2 * opt.margem) / 1000;
  let m3 = 0;
  res.pallets.forEach((p) => { m3 += W * D * ((p.alturaCarga + base) / 1000); });
  return m3;
}
function pesoCargaDe(res, opt){
  let kg = 0;
  res.pallets.forEach((p) => p.pecas.forEach((it) => {
    kg += (it.peca.c / 1000) * (it.peca.l / 1000) * (it.peca.e / 1000) * opt.dens;
  }));
  return kg;
}

function ladosCandidatos(pecas, limite){
  const lados = new Set();
  pecas.forEach((p) => { lados.add(Math.round(Math.min(p.c, p.l))); lados.add(Math.round(Math.max(p.c, p.l))); });
  const arr = [...lados].sort((a, b) => a - b);
  const somas = new Set(arr);
  const curtos = arr.slice(0, 40);
  curtos.forEach((a) => curtos.forEach((b) => {
    if (a + b <= limite) somas.add(a + b);
    if (arr.length <= 24) curtos.forEach((c) => { if (a + b + c <= limite) somas.add(a + b + c); });
  }));
  return [...somas].filter((v) => v <= limite).sort((a, b) => a - b);
}

function empacotarAuto(pecas, opt, onTentativa){
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const orcamento = opt.orcamentoMs || 8000;             // teto de tempo da busca
  // estourou(f): já gastou a fração f do orçamento? (cada etapa tem sua fatia,
  // senão a varredura de planta come tudo e o motor alternativo nem roda)
  const estourou = (f) => ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0) > orcamento * (f == null ? 1 : f);
  const temNesting = typeof NESTING !== 'undefined' && !!NESTING._packBin;
  const tentativas = [];
  const avaliar = (planW, planD, extra) => {
    const o = { ...opt, planW, planD, ...extra };
    const res = empacotar(pecas, o);
    const m3 = cubagemDe(res, opt);
    const parciais = res.pallets.reduce((s, p) => s + p.pecas.filter((i) => i.parcial).length, 0);
    const t = { planW: res.planW, planD: res.planD, ordem: o.ordem || (o.agrupar ? 'grupoMax' : 'area'),
                motor: o.motor || 'cantos', agrupar: !!o.agrupar, m3, res,
                pallets: res.pallets.length, sobras: res.sobras.length, parciais,
                alt: Math.max(...res.pallets.map((p) => p.alturaCarga + opt.peH + opt.deckE), 0) };
    tentativas.push(t);
    if (onTentativa) onTentativa(t);
    return t;
  };
  // menos cubagem ganha; empate resolve por menos peça sem apoio pleno e menos pallets
  // Peça vermelha (sem apoio pleno) pesa como 3% de cubagem cada: um plano
  // um pouco maior mas todo apoiado ganha de um mais compacto com 2-3 peças
  // no ar.
  const nota = (t) => t.m3 * (1 + 0.03 * t.parciais);
  const melhorEntre = (lista) => lista.filter((t) => !t.sobras)
    .sort((a, b) => (nota(a) - nota(b)) || (a.pallets - b.pallets))[0];

  const agora = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  // 0) planta mínima = maior peça, nos dois motores — quem for melhor aqui
  //    conduz a varredura de planta (o outro entra de novo no fim, nas
  //    melhores plantas). Cronometra pra dimensionar a busca pelo custo real.
  let tc = agora();
  let melhor = avaliar(0, 0, { motor: 'cantos' });
  tc = agora() - tc;
  const minW = melhor.planW, minD = melhor.planD;
  let motorScan = 'cantos', dt = tc;
  if (temNesting){
    let tn = agora();
    const n0 = avaliar(minW, minD, { motor: 'nesting' });
    tn = agora() - tn;
    if (!n0.sobras && n0.m3 < melhor.m3 - 1e-9) melhor = n0;
    // conduz a varredura só se for melhor E não for muito mais caro por rodada
    if (melhor === n0 && tn <= tc * 3){ motorScan = 'nesting'; dt = tn; }
  }

  const maxD = opt.maxD > 0 ? opt.maxD : Math.min(Math.max(minW, minD * 2.6), minD * 4);
  const maxW = opt.maxW > 0 ? opt.maxW : minW * 1.6;
  // quantas plantas testar cabe no orçamento: ~metade dele pra varredura
  const nDim = Math.max(4, Math.min(pecas.length > 150 ? 10 : 20, Math.floor((orcamento * 0.4) / Math.max(1, dt))));
  const amostrar = (arr, n) => {
    if (arr.length <= n) return arr;
    const passo = (arr.length - 1) / (n - 1), out = [];
    for (let i = 0; i < n; i++) out.push(arr[Math.round(i * passo)]);
    return [...new Set(out)];
  };

  // 1) profundidade (motor de canto, que é o barato)
  const candD = amostrar(ladosCandidatos(pecas, maxD).filter((v) => v > minD), nDim);
  for (const D of candD){ if (estourou(0.4)) break; avaliar(minW, D, { motor: motorScan }); }
  melhor = melhorEntre(tentativas) || melhor;

  // 2) largura (só ajuda quando duas peças cabem lado a lado no comprimento)
  const candW = amostrar(ladosCandidatos(pecas, maxW).filter((v) => v > minW), Math.max(4, Math.round(nDim / 2)));
  for (const W of candW){ if (estourou(0.55)) break; avaliar(W, melhor.planD, { motor: motorScan }); }
  melhor = melhorEntre(tentativas) || melhor;

  // 3) o OUTRO motor nas melhores plantas (nesting encaixa mais denso quando
  //    há muita peça pequena; canto ganha quando são poucas peças grandes —
  //    depende do conjunto, então os dois passam pelas plantas finalistas)
  {
    const outro = motorScan === 'cantos' ? 'nesting' : 'cantos';
    const vistas = new Set();
    const top = tentativas.filter((t) => !t.sobras).sort((a, b) => a.m3 - b.m3)
      .filter((t) => { const k = t.planW + 'x' + t.planD; if (vistas.has(k)) return false; vistas.add(k); return true; })
      .slice(0, pecas.length > 150 ? 2 : 3);
    for (const t of top){
      if (estourou()) break;
      if (outro === 'nesting' && !temNesting) break;
      avaliar(t.planW, t.planD, { motor: outro, agrupar: true });
      if (estourou()) break;
      avaliar(t.planW, t.planD, { motor: outro, agrupar: false });
    }
    melhor = melhorEntre(tentativas) || melhor;
  }

  // 4) ordem de empilhamento (e agrupar ou não), na melhor planta e motor
  for (const o of ['grupoMax', 'area', 'comp', 'espDesc']){
    if (estourou()) break;
    if (o !== melhor.ordem) avaliar(melhor.planW, melhor.planD, { motor: melhor.motor, agrupar: melhor.agrupar, ordem: o });
  }
  if (!estourou() && melhor.motor === 'cantos') avaliar(melhor.planW, melhor.planD, { motor: 'cantos', agrupar: !melhor.agrupar });
  melhor = melhorEntre(tentativas) || melhor;

  return { res: melhor.res, escolhida: melhor, tentativas };
}

function medidasPallet(pal, res, opt){
  const deckW = res.planW + 2 * opt.margem;   // X
  const deckD = res.planD + 2 * opt.margem;   // Z
  const alturaTotal = opt.peH + opt.deckE + pal.alturaCarga;

  // Peso da carga
  let pesoCarga = 0, nPecas = 0, nParciais = 0, areaTotal = 0;
  pal.camadas.forEach((c) => c.itens.forEach((it) => {
    pesoCarga += (it.peca.c / 1000) * (it.peca.l / 1000) * (it.peca.e / 1000) * opt.dens;
    areaTotal += it.w * it.d;
    nPecas++;
    if (it.parcial) nParciais++;
  }));
  // Peso do pallet vazio: longarinas (pés) + tábuas do estrado
  const volPes = opt.peN * (deckD / 1000) * (opt.peW / 1000) * (opt.peH / 1000);
  const nTabuas = Math.max(2, Math.round(deckW / (opt.deckW * 1.55)));
  const volDeck = nTabuas * (deckD / 1000) * (opt.deckW / 1000) * (opt.deckE / 1000);
  const pesoPallet = (volPes + volDeck) * opt.densPallet;

  const m3 = (deckW / 1000) * (deckD / 1000) * (alturaTotal / 1000);
  return { deckW, deckD, alturaTotal, pesoCarga, pesoPallet, nPecas, nTabuas, nParciais, m3,
           // "densidade de empilhamento": quanto do volume do monte é madeira
           ocupVolume: areaTotal ? (pal.camadas.reduce((s, c) => s + c.itens.reduce((a, it) => a + it.w * it.d * it.peca.e, 0), 0))
             / Math.max(1, (res.planW * res.planD * Math.max(1, pal.alturaCarga))) : 0,
           pesoTotal: pesoCarga + pesoPallet };
}

function mmToFtIn(mm){
  const tot = mm / 25.4;
  const ft = Math.floor(tot / 12);
  const pol = tot - ft * 12;
  return (ft ? ft + "' " : '') + (Math.round(pol * 8) / 8) + '"';
}

  const DEFAULTS = {
    dens: 500, densPallet: 500, gap: 0, margem: 30, hMax: 0,
    modo: 'compacto', maxW: 0, maxD: 1100, orcamentoMs: 8000,
    rotacionar: true, agrupar: true,
    peH: 90, peW: 100, peN: 3, deckE: 19, deckW: 120,
    apoioMin: 0.8, apoioPonta: 0.5, degrau: 0,
    regra: 'cantos', zonaCanto: 0, pontosMin: 4
  };

  return {
    DEFAULTS,
    parseDim, parseLinha, parsePecas, expandir,
    empacotar, cubagemDe, pesoCargaDe, ladosCandidatos, empacotarAuto,
    medidasPallet, mmToFtIn
  };
})();
