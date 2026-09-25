/* Legno ERP — VISUALIZADOR DE FURAÇÃO DO LOTE  (#/lotes/:id/furacao)
 *
 * Matt, 2026-08-16: "como eu vejo as furações de um lote antes de mandar pra
 * máquina? quero igual ao plano de corte, visualizar peça por peça em um
 * único lugar."
 *
 * O problema real: até aqui a única saída de furação era o ZIP de .ban. Pra
 * conferir, alguém teria que baixar, descompactar e abrir arquivo por arquivo
 * no software da máquina — ou seja, ninguém conferia. Erro de furação só
 * aparecia na chapa furada.
 *
 * MESMA FONTE DO ARQUIVO, SEMPRE. O desenho sai de
 * Drilling.collectOrderPieces, exatamente a função que o .ban usa (o
 * generateOrderFiles chama ela e só formata o XML por cima). Não existe
 * caminho onde a tela mostre um furo que o arquivo não tem — e é por isso que
 * a coleta do lote virou FURACAO_LOTE.coletar, compartilhada pelos dois.
 *
 * A DEDUPLICAÇÃO É A MESMA: peça idêntica (mesma medida, mesmos furos, mesmos
 * rasgos) aparece UMA vez com a quantidade somada, igual no ZIP. Lateral
 * esquerda e direita nunca agrupam — o programa é espelhado.
 */
const FURACAO_VISUAL = {};

FURACAO_VISUAL.load = async function (p) {
  if (typeof Drilling === 'undefined') return { erro: 'drilling.js não carregou — recarregue a página.' };
  const col = await FURACAO_LOTE.coletar(p.id);
  if (col.vazio === 'sem-pedido') return { lote: col.lote, vazio: 'Este lote não tem pedido nenhum dentro.' };
  if (col.vazio === 'sem-peca') return { lote: col.lote, vazio: 'Nenhum módulo do lote tem peças cadastradas.' };
  return {
    batchId: p.id,
    lote: col.lote,
    semCadastro: col.semCadastro,
    recs: Drilling.collectOrderPieces(col.itens, col.config)
  };
};

/* Filtro na mão, sem re-render: a tela pode ter centenas de cartões e refazer
   o HTML inteiro a cada tecla piscaria o desenho todo. Só liga/desliga a
   linha, e o contador acompanha. */
FURACAO_VISUAL.filtrar = function () {
  const busca = (document.getElementById('fv-busca') || {}).value || '';
  const soUsinagem = (document.getElementById('fv-so-usinagem') || {}).checked;
  const termo = busca.trim().toLowerCase();
  let visiveis = 0;
  document.querySelectorAll('.fv-card').forEach(function (card) {
    const casaTexto = !termo || (card.dataset.busca || '').indexOf(termo) >= 0;
    const casaUsinagem = !soUsinagem || card.dataset.usinagem === '1';
    const mostrar = casaTexto && casaUsinagem;
    card.style.display = mostrar ? '' : 'none';
    if (mostrar) visiveis += 1;
  });
  const contador = document.getElementById('fv-contador');
  if (contador) contador.textContent = visiveis + ' peça(s) na tela';
};

FURACAO_VISUAL.render = function (params, d) {
  if (!d) return UI.errorBox('Furação', 'Não foi possível carregar.');
  if (d.erro) return UI.errorBox('Furação', UI.esc(d.erro));

  const lote = d.lote || {};
  const titulo = 'Furação — ' + UI.esc(lote.code || lote.name || 'lote');

  if (d.vazio) {
    return UI.head(titulo, UI.esc(d.vazio),
      '<a class="erp-btn erp-btn-secondary" href="#/lotes/' + UI.esc(params.id) + '">Voltar ao lote</a>');
  }

  const recs = d.recs || [];
  if (!recs.length) {
    return UI.head(titulo,
      'Nenhum furo gerado neste lote. Falta cadastrar furação nos componentes ou escolher o programa ' +
      'de furação nas peças do módulo — sem isso a máquina não recebe nada.',
      '<a class="erp-btn erp-btn-secondary" href="#/lotes/' + UI.esc(params.id) + '">Voltar ao lote</a>');
  }

  let totalPecas = 0, totalFuros = 0, totalRasgos = 0, comUsinagem = 0;
  recs.forEach(function (r) {
    const q = r.quantity || 1;
    totalPecas += q;
    totalFuros += (r.holes || []).length * q;
    totalRasgos += (r.slots || []).length * q;
    if ((r.slots || []).length) comUsinagem += 1;
  });

  const cards = recs.map(function (rec) {
    const m = { C: rec.comprimento_mm, L: rec.largura_mm, E: rec.espessura_mm };
    const holes = (rec.holes || []).map(function (h) {
      return { face: h.face, x: h.x, y: h.y, dia: h.diameter, depth: h.depth, outside: false };
    });
    const slots = rec.slots || [];
    const busca = ((rec.reference || '') + ' ' + (rec.module_name || '')).toLowerCase();
    return '<div class="fv-card erp-card" data-busca="' + UI.esc(busca) + '" data-usinagem="' + (slots.length ? '1' : '0') + '"'
      + ' style="padding:10px;display:flex;flex-direction:column;gap:6px">'
      + '<div><strong>' + UI.esc(rec.reference || 'peça') + '</strong> '
      + UI.pill('x' + (rec.quantity || 1), 'erp-pill-accent')
      + (slots.length ? ' ' + UI.pill('usinagem', 'erp-pill-warn') : '') + '</div>'
      + '<div class="erp-xs erp-muted">' + UI.esc(rec.module_name || '') + '</div>'
      + '<div class="erp-xs erp-mono">' + Math.round(m.C) + ' × ' + Math.round(m.L) + ' × ' + Math.round(m.E) + ' mm'
      + ' · ' + holes.length + ' furo(s)'
      + (slots.length ? ' · ' + slots.length + ' rasgo(s)' : '') + '</div>'
      + '<div class="erp-xs erp-muted">'
      + (rec.cor_nome ? UI.esc(rec.cor_nome) : 'cor não definida')
      + (rec.cor_mista ? ' (cores diferentes agrupadas)' : '')
      + (rec.cor_sem_swatch ? ' (sem cor de amostra cadastrada — desenhada em bege)' : '')
      + ' · veio ' + (rec.veio_eixo
          ? (rec.veio_eixo === 'x' ? 'no comprimento' : 'na largura')
            + (rec.cor_tem_veio && rec.veio === 'livre' ? ' (da chapa)' : '')
          : 'livre') + '</div>'
      + buildDrillingPlaneSvg(m, holes, slots, { cor: rec.cor, textura: rec.textura, veio_eixo: rec.veio_eixo })
      + '</div>';
  }).join('');

  return UI.head(titulo,
    'Cada cartão é UM arquivo .ban — peça idêntica aparece uma vez, com a quantidade somada. ' +
    'É o mesmo cálculo que gera o arquivo da máquina, então o que está aqui é o que vai ser furado.',
    '<button type="button" class="erp-btn" onclick="FURACAO_LOTE.gerar(\'' + UI.esc(d.batchId) + '\', this)">Baixar .ban (ZIP)</button>' +
    '<a class="erp-btn erp-btn-secondary" href="#/lotes/' + UI.esc(d.batchId) + '">Voltar ao lote</a>') +

    '<div class="erp-kpis">' +
      UI.kpi('Arquivos', String(recs.length), 'peças distintas') +
      UI.kpi('Peças', String(totalPecas), 'contando as repetidas') +
      UI.kpi('Furos', String(totalFuros), 'no lote inteiro') +
      UI.kpi('Usinagem', String(totalRasgos), comUsinagem + ' peça(s) com recorte') +
    '</div>' +

    (d.semCadastro
      ? UI.errorBox('Atenção',
          d.semCadastro + ' módulo(s) do lote não têm peças cadastradas e ficaram de fora. ' +
          'Eles não vão ser furados.')
      : '') +

    /* LEGENDA — sem ela o desenho é bonito e ilegível. Cada símbolo aqui é
       uma decisão do gerador que o operador precisa saber ler. */
    '<div class="erp-card" style="padding:10px;margin:10px 0;display:flex;gap:18px;flex-wrap:wrap;align-items:center">' +
      '<span class="erp-xs"><svg width="16" height="16" style="vertical-align:middle"><circle cx="8" cy="8" r="5" fill="rgba(26,82,118,0.25)" stroke="#1a5276"/></svg> furo pela face</span>' +
      '<span class="erp-xs"><svg width="16" height="16" style="vertical-align:middle"><circle cx="8" cy="8" r="5" fill="rgba(26,82,118,0.25)" stroke="#1a5276" stroke-dasharray="3 2"/></svg> furo pelo verso (tracejado)</span>' +
      '<span class="erp-xs"><svg width="20" height="16" style="vertical-align:middle"><rect x="0" y="5" width="8" height="6" fill="rgba(26,82,118,0.25)" stroke="#1a5276"/></svg> furo de borda (entra pela lateral)</span>' +
      '<span class="erp-xs"><svg width="24" height="16" style="vertical-align:middle"><line x1="2" y1="8" x2="22" y2="8" stroke="#7d3c98" stroke-opacity="0.35" stroke-width="9" stroke-linecap="round"/><line x1="2" y1="8" x2="22" y2="8" stroke="#7d3c98" stroke-width="1" stroke-dasharray="4 3"/></svg> rasgo de usinagem — a faixa é a fresa, o tracejado é o percurso</span>' +
      '<span class="erp-xs"><svg width="24" height="16" style="vertical-align:middle"><rect width="24" height="16" fill="#c9a227" fill-opacity="0.3"/><line x1="0" y1="4" x2="24" y2="4" stroke="#000" stroke-opacity="0.13"/><line x1="0" y1="10" x2="24" y2="10" stroke="#000" stroke-opacity="0.13"/></svg> listras = sentido do veio (sem listra = veio livre)</span>' +
      '<span class="erp-xs erp-muted">A origem 0,0 é o canto de cima à esquerda do plano da máquina.</span>' +
    '</div>' +

    '<div class="erp-card" style="padding:10px;margin:10px 0;display:flex;gap:12px;flex-wrap:wrap;align-items:center">' +
      '<input id="fv-busca" class="erp-input" type="search" placeholder="filtrar por peça ou módulo…" ' +
        'oninput="FURACAO_VISUAL.filtrar()" style="min-width:220px">' +
      '<label class="erp-xs" style="display:flex;gap:6px;align-items:center">' +
        '<input id="fv-so-usinagem" type="checkbox" onchange="FURACAO_VISUAL.filtrar()"> só peças com usinagem</label>' +
      '<span id="fv-contador" class="erp-xs erp-muted">' + recs.length + ' peça(s) na tela</span>' +
    '</div>' +

    '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px">' +
      cards +
    '</div>' +

    UI.sourceNote('Desenho e arquivo saem da MESMA função (' +
      '<span class="erp-mono">Drilling.collectOrderPieces</span>) — o que muda é só o formato de saída. ' +
      'A furação é re-resolvida contra o cadastro ATUAL do módulo, não contra o snapshot do pedido: ' +
      'furação é conhecimento de produção e pode ser corrigida depois do pedido fechado.');
};
