// ==========================================================================
// SAHRA · FLUXO — botão novo no menu de cima, SÓ ADMIN (2026-11-07)
// Matt: "coloca essa tela fluxo da sahra num botão novo, sem mexer no antigo,
// quero fazer alguns testes no portal. só pra adm".
//
//  - Não altera nada existente: a SAHRA do canto (portal-37) continua igual.
//  - O botão só nasce quando window.LEGNO_IS_ADMIN === true (rpc is_admin(),
//    portal-26). A tela e a Edge Function sahra-fluxo conferem de novo.
//  - Clicar abre uma janela por cima do portal com sahra-fluxo.html (mesma
//    origem, mesma sessão do Supabase): Editor do fluxo + Mesa da SAHRA.
//  - Não é uma aba do portal de propósito (classe própria, sem data-tab), pra
//    não passar pelo listener genérico de .portal-tab-btn.
//  - Desligar: localStorage 'legno_sahra_fluxo_off' = '1'.
// Tabelas: migration 271 (sahra_fluxo_*). IA: supabase/functions/sahra-fluxo.
// ==========================================================================
(function () {
  try { if (localStorage.getItem('legno_sahra_fluxo_off') === '1') return; } catch (e) { /* */ }

  const VERSAO = '202611082200';
  let overlay = null;

  function abrir() {
    if (overlay) {
      overlay.style.display = 'flex';
      // a conversa foi atualizada com a janela escondida: avisa a tela pra rolar pro fim
      try { const fr = overlay.querySelector('iframe'); fr.contentWindow.dispatchEvent(new Event('sahra-mostrar')); } catch (e) { /* */ }
      return;
    }
    overlay = document.createElement('div');
    overlay.id = 'sahra-fluxo-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'Fluxo da SAHRA');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(20,18,16,.55);display:flex;flex-direction:column;padding:12px;box-sizing:border-box;';
    const barra = document.createElement('div');
    barra.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-bottom:8px;';
    const nova = document.createElement('button');
    nova.type = 'button'; nova.textContent = 'Abrir em nova aba';
    nova.style.cssText = 'border:1px solid rgba(255,255,255,.4);background:transparent;color:#fff;border-radius:6px;padding:6px 12px;cursor:pointer;font:inherit;font-size:13px;';
    nova.onclick = () => window.open('sahra-fluxo.html?v=' + VERSAO, '_blank');
    const fechar = document.createElement('button');
    fechar.type = 'button'; fechar.textContent = 'Fechar';
    fechar.style.cssText = 'border:0;background:#fff;color:#1f1d1a;border-radius:6px;padding:6px 14px;cursor:pointer;font:inherit;font-size:13px;font-weight:600;';
    fechar.onclick = () => { overlay.style.display = 'none'; };
    barra.append(nova, fechar);
    const frame = document.createElement('iframe');
    frame.src = 'sahra-fluxo.html?v=' + VERSAO;
    frame.title = 'Fluxo da SAHRA';
    frame.allow = 'autoplay; clipboard-write; microphone';
    frame.style.cssText = 'flex:1;width:100%;border:0;border-radius:12px;background:#f3f2ee;';
    overlay.append(barra, frame);
    document.body.appendChild(overlay);
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && overlay && overlay.style.display !== 'none') overlay.style.display = 'none'; });
  }

  // ========================================================================
  // MONTAR NO PORTAL (2026-11-08). Matt: "ela transforma o virtual no projeto
  // dentro do portal" / "eu preciso criar as regras pra ela transformar".
  // A tela da SAHRA (iframe) chama window.sahraFluxoMontar(handoff) depois do
  // approve. As REGRAS vêm das etapas da coluna "Montar no portal" do fluxo
  // (migration 273), escritas pelo Matt no editor; aqui só fica a mecânica:
  // catálogo real → IA (Edge Function sahra-fluxo, acao 'json') → paredes e
  // módulos no canvas, pelos mesmos caminhos da IA de paredes (portal-16) e
  // da IA de editar (portal-19). Nada é salvo sozinho: o Matt confere e salva.
  // ========================================================================
  const MM = 25.4;
  let montando = false;

  function cardMontagem() {
    let c = document.getElementById('sahra-fluxo-montar-card');
    if (!c) {
      c = document.createElement('div');
      c.id = 'sahra-fluxo-montar-card';
      c.setAttribute('role', 'status');
      c.setAttribute('aria-live', 'polite');
      c.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147482000;width:min(380px,calc(100vw - 32px));max-height:70vh;overflow:auto;background:#fff;color:#1f1d1a;border:1px solid #e3ded5;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.18);padding:14px 16px;font-size:13px;line-height:1.45;';
      document.body.appendChild(c);
    }
    return c;
  }
  function escH(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])); }
  function mostraCard(html, botoes) {
    const c = cardMontagem();
    c.innerHTML = '<div style="display:flex;gap:10px;align-items:flex-start"><img src="assets/sahra/fluxo/sahra-rosto.png" alt="" style="width:36px;height:36px;border-radius:50%;object-fit:cover;flex:none"><div style="flex:1;min-width:0">' + html + '</div></div>';
    if (botoes) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:10px;';
      botoes.forEach((b) => {
        const el = document.createElement('button');
        el.type = 'button'; el.textContent = b.t;
        el.style.cssText = b.primario
          ? 'border:0;background:#7a4a22;color:#fff;border-radius:6px;padding:6px 12px;cursor:pointer;font:inherit;font-weight:600;'
          : 'border:1px solid #d8d2c8;background:#fff;color:#1f1d1a;border-radius:6px;padding:6px 12px;cursor:pointer;font:inherit;';
        el.onclick = b.f;
        row.appendChild(el);
      });
      c.appendChild(row);
    }
  }
  function fechaCard() { const c = document.getElementById('sahra-fluxo-montar-card'); if (c) c.remove(); }

  // proposta do virtual (polegadas) → mm, pra IA não errar conta
  function virtualEmMm(pr) {
    const r = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v) * MM) : null);
    return {
      conceito: pr.conceito || '',
      paredes: (pr.paredes || []).map((w, i) => ({
        indice_virtual: i, nome: w.nome, largura_mm: r(w.largura), altura_mm: r(w.altura),
        itens: (w.itens || []).map((it) => ({
          tipo: it.tipo, sku: it.sku || '', rotulo: it.rotulo || '', acabamento: it.acabamento || '', led: !!it.led,
          x_mm: r(it.x), y_mm: r(it.y), largura_mm: r(it.largura), altura_mm: r(it.altura)
        }))
      })),
      acabamentos: pr.acabamentos || [],
      modulos: (pr.modulos || []).map((m) => ({ sku: m.sku, descricao: m.descricao, qtd: m.qtd, largura_mm: r(m.largura), altura_mm: r(m.altura), profundidade_mm: r(m.profundidade), acabamento: m.acabamento || '' })),
      pendencias: pr.pendencias || []
    };
  }

  // CATÁLOGO ENXUTO (09:10, 08/11: "A IA demorou demais pra responder"):
  // mandar o catálogo inteiro estourava o tempo da função. Agora o código
  // separa, pra cada item do virtual, os módulos candidatos (referência igual
  // ao SKU primeiro, depois tipo e largura) e só eles vão pra IA. Quem decide
  // continua sendo a IA, seguindo as etapas do Matt.
  function refsDo(id) {
    const lst = (typeof moduleSkuPresetsByModuleId !== 'undefined' && moduleSkuPresetsByModuleId[id]) || [];
    return Array.from(new Set(lst.map((x) => x && String(x.reference || '').trim().toUpperCase()).filter(Boolean)));
  }
  const RE_TIPO = {
    base: /base|bottom|sink|drawer|gaveta|lixeira|trash|blind|corner|vanit/i,
    aereo: /wall|a[ée]reo|upper|suspens/i,
    torre: /tall|torre|pantry|oven|forno|despensa|linen/i,
    painel: /panel|painel/i,
    filler: /filler|enchimento/i,
    nicho: /nicho|niche|open|aberto|componente|shelf|prateleira|bottom.*back|back/i,
    prateleira: /shelf|prateleira|painel 3\/4|horizontal/i
  };
  function candidatos(h, cat, porItem) {
    const pr = h.proposta || {};
    const cozinha = /cozinha|kitchen/i.test(JSON.stringify(h.ficha || {}).slice(0, 2000) + ' ' + (h.titulo || ''));
    const escolhidos = new Map();
    const add = (m) => { if (!escolhidos.has(String(m.id))) escolhidos.set(String(m.id), m); };
    const refsCache = new Map(cat.map((m) => [String(m.id), refsDo(m.id)]));
    (pr.paredes || []).forEach((w) => (w.itens || []).forEach((it) => {
      if (it.tipo === 'existente' || it.tipo === 'appliance') return;
      const sku = String(it.sku || '').trim().toUpperCase();
      const larg = (Number(it.largura) || 0) * MM;
      const re = RE_TIPO[it.tipo] || null;
      const nota = cat.map((m) => {
        const txt = [m.name, m.family, m.category, m.subcategory].join(' ');
        let n = 0;
        if (sku && refsCache.get(String(m.id)).includes(sku)) n += 100;
        if (re && re.test(txt)) n += 20;
        if (it.tipo === 'aereo' && m.mount_type === 'wall') n += 10;
        if (larg && m.w && m.w[0] != null && m.w[2] != null && larg >= m.w[0] - 1 && larg <= m.w[2] + 1) n += 8;
        if (cozinha ? /classic kitchens/i.test(m.family || '') : /componente|pain[eé]is|panels?/i.test(m.family || '')) n += 6;
        return { m, n };
      }).filter((x) => x.n >= 20).sort((a, b) => b.n - a.n).slice(0, porItem);
      nota.forEach((x) => add(x.m));
    }));
    // painéis e fillers sempre à mão pra fechar sobras
    cat.filter((m) => /cover|lateral|end ?panel|vertical/i.test([m.name, m.category].join(' ')) && /panel|painel|cover/i.test([m.name, m.family, m.category].join(' '))).slice(0, 20).forEach(add);
    cat.filter((m) => /filler|panel|painel/i.test([m.name, m.category].join(' '))).slice(0, 12).forEach(add);
    return Array.from(escolhidos.values());
  }

  function catalogoTexto(cat, maxRefs) {
    const refsDe = (id) => {
      const lst = (typeof moduleSkuPresetsByModuleId !== 'undefined' && moduleSkuPresetsByModuleId[id]) || [];
      return Array.from(new Set(lst.map((x) => x && x.reference).filter(Boolean))).slice(0, maxRefs);
    };
    const faixa = (a) => (a || []).map((v) => (v == null ? '?' : Math.round(v))).join('-');
    return cat.map((m) => {
      const refs = maxRefs ? refsDe(m.id) : [];
      return [m.id, m.name, [m.family, m.category, m.subcategory].filter(Boolean).join(' › '), m.mount_type || '-',
        'w ' + faixa(m.w), 'h ' + faixa(m.h), 'd ' + faixa(m.d),
        refs.length ? 'refs ' + refs.join(',') : ''].join(' | ');
    }).join('\n');
  }

  function promptMontagem(h, cat, cores, maxRefs) {
    return `Você é a SAHRA, designer da Legno Home (móveis planejados sob medida, EUA). O cliente APROVOU o projeto virtual abaixo. Agora você MONTA esse projeto no portal da Legno, com paredes e módulos REAIS do catálogo, seguindo as etapas do fluxo "Montar no portal" em ordem. As regras escritas pelo Matt nas etapas valem mais que qualquer outra coisa; as "Notas do Matt" são referência.

ETAPAS DO FLUXO "MONTAR NO PORTAL" (regras do Matt):
${h.regras || '(etapas ainda vazias: use o bom senso e as notas)'}

COMO O PORTAL FUNCIONA (mecânica, não é regra de projeto)
- Tudo em milímetros (o virtual já foi convertido: 1" = 25,4 mm).
- Paredes em sequência: walls[i] = {"name", "length_mm", "height_mm", "angle_to_next_deg"} (ângulo pra próxima parede; 90 = canto em L; na última use 90).
- Cada módulo: "wall_index" (índice em walls), "x_mm" (da quina esquerda da parede, olhando de frente pra ela, até a borda esquerda do módulo), "floor_height_mm" (do piso até a base do módulo), "width_mm", "height_mm", "depth_mm". Respeite os limites w/h/d [mín-padrão-máx] do módulo no catálogo.
- "module_id" tem que ser um id que EXISTE no CATÁLOGO abaixo (1ª coluna), copiado exatamente. "refs" = referências (SKU) cadastradas no módulo.
- "color_name" tem que ser um nome EXATO da lista de CORES, ou null. Quando o acabamento do item tiver "cor_legno" (a cor da cartela que a SAHRA já escolheu no virtual), use exatamente ela.
- Se a FICHA tem "planta", as paredes do portal seguem a planta: mesma sequência, comprimento em polegadas × 25,4 e os mesmos ângulos. Lado "aberto" só entra como parede se tiver móvel nele.
- CAIXA PELO CONSTRUTOR: quando a etapa de composição mandar (ou o item não tem módulo pronto equivalente), use uma entrada com "caixa" em vez de "module_id": "aereo" = caixa de Componentes Bottom · Bottom · Back (fora do chão), "suspenso" = Bottom · Stretcher · Back. O portal cria a caixa e monta no Construtor: "prateleiras", "portas" (folhas), "gavetas", "modelo_porta" ("vidro" = Aluminium Glass), "cor_vidro" (ex.: "fumê"), "led" (fita no tampo de cima, iluminando pra baixo), "color_name" (caixa) e "front_color_name" (frentes).
- CONJUNTO EMPILHADO: peças que formam um móvel só (ex.: base + nicho + aéreo + top covers) levam o mesmo "grupo". O portal alinha: a peça de baixo na altura das bases da parede, a de cima com o topo dos aéreos, e a do meio preenche o vão entre elas; os painéis do grupo (top covers) ficam com a altura do conjunto e a profundidade da caixa + 25,4 mm.
- ILHA/PENÍNSULA (módulo solto no piso): use "piso": {"afastamento_mm": distância da parede de referência até a FRENTE do módulo (o corredor de trabalho), "frente": "parede"}; "wall_index" e "x_mm" contam a partir dessa parede. Os módulos da ilha ficam SEMPRE de frente pra parede de trabalho (o portal gira 180°), com o mesmo acesso da parede. Do outro lado da ilha vai, normalmente, um painel (de madeira) cobrindo as costas, com bancada e banquetas.
- BLIND CORNER: o lado cego fica virado pro canto. Canto no FIM da parede (à direita, olhando de frente) → versão Dir/Direita; canto no COMEÇO (à esquerda) → versão Esq/Esquerda. O portal confere e troca se vier invertido.
- CANTO DOS AÉREOS: aéreo raso (até ~15") NUNCA leva blind nem corner no canto. Deixe o canto livre; o portal afasta o aéreo de cada lado e põe os fillers da frente sozinho. Se a sobra não fechar com os aéreos padrão, use aéreo custom e ajuste a largura.
- NUNCA troque por um módulo de outra função (pantry ≠ torre com nicho; gaveteiro ≠ base de porta). "motivo" diz por que escolheu cada peça.
- Item do virtual que não tem módulo correspondente NÃO entra em modules: vai em "nao_virou" com o motivo. Nunca invente id.

PROJETO VIRTUAL APROVADO (mm): ${JSON.stringify(virtualEmMm(h.proposta || {}))}

FICHA DO BRIEFING: ${JSON.stringify(h.ficha || {})}

CATÁLOGO (id | nome | família › categoria › sub | montagem | w | h | d | refs):
${catalogoTexto(cat, maxRefs)}

CORES ATIVAS: ${cores.map((c) => c.name).join(' · ')}

Responda SOMENTE com JSON:
{"walls": [{"name": "Parede da adega", "length_mm": 3000, "height_mm": 2743, "angle_to_next_deg": 90}],
 "main_index": 0,
 "ceiling_mm": 2743,
 "modules": [
   {"item": "rótulo/SKU do item do virtual", "grupo": "nome do conjunto ou null", "motivo": "por que este módulo", "wall_index": 0, "module_id": "id do catálogo", "x_mm": 0, "floor_height_mm": 0, "width_mm": 762, "height_mm": 876, "depth_mm": 610, "color_name": "nome exato ou null"},
   {"item": "NCH3020", "grupo": "Torre café", "motivo": "nicho não tem módulo pronto: caixa pelo Construtor", "caixa": "aereo", "wall_index": 0, "x_mm": 762, "floor_height_mm": 914, "width_mm": 762, "height_mm": 508, "depth_mm": 330, "prateleiras": 0, "portas": 0, "gavetas": 0, "modelo_porta": null, "cor_vidro": null, "led": true, "color_name": "nome exato", "front_color_name": "nome exato ou null"}],
 "nao_virou": [{"item": "...", "motivo": "..."}],
 "etapas": [{"etapa": "nome da etapa", "decisao": "o que decidiu e qual saída tomou"}],
 "mensagem": "1 a 2 frases pro Matt sobre a montagem"}`;
  }

  // ========================================================================
  // MONTAGEM FIEL AO VIRTUAL (11:06, 08/11 — "completamente errado… pirou").
  // A causa: a IA recalculava paredes e coordenadas do zero e errava a
  // geometria (bases soltas no meio, gaveteiro pendurado). Agora:
  //  · as POSIÇÕES vêm do projeto virtual aprovado (x, altura do chão,
  //    largura, altura de cada item de cada vista), convertidas pra mm;
  //  · as PAREDES vêm da planta baixa (ou, sem planta, das vistas em
  //    sequência, com cantos de 90°);
  //  · a IA só escolhe O QUÊ: qual parede do portal é cada vista, qual
  //    módulo/caixa e qual cor cada item usa — sem coordenada nenhuma;
  //  · ilha/península só se a vista for de ilha/península.
  // Depois seguem as regras: conjuntos, canto das bases (blind), canto dos
  // aéreos (módulo de canto) e fechamento com filler/aéreo custom.
  // ========================================================================
  const RE_VISTA_PISO = /\bilha\b|island|pen[ií]nsula|peninsula/i;
  const PROF_PADRAO_POL = { base: 24, torre: 24, aereo: 12, nicho: 12, prateleira: 10, painel: 0.75, filler: 0.75 };
  function itensDoVirtual(pr) {
    const out = [];
    (pr.paredes || []).forEach((w, vi) => (w.itens || []).forEach((it, ii) => {
      if (it.tipo === 'existente' || it.tipo === 'appliance') return;
      if (it.tipo === 'canto' || /^(WCF|BCF)\b/i.test(String(it.sku || ''))) return; // canto: etapa 1, pelo código
      if (!(+it.largura > 0) || !(+it.altura > 0)) return;
      out.push(Object.assign({ id: vi + '.' + ii, vista: vi }, it));
    }));
    return out;
  }
  // paredes da planta → paredes do portal (lado "aberto" só sai se estiver na ponta da sequência)
  function paredesDaPlanta(pl) {
    const ws = ((pl && pl.paredes) || []).map((w, i) => ({ i, nome: String(w.nome || ''), pol: +w.comprimento || 0, angulo: Number.isFinite(+w.angulo) ? +w.angulo : 90, aberto: /aberto|open/i.test(String(w.nome || '')) }))
      .filter((w) => w.pol > 0);
    while (ws.length && ws[0].aberto) ws.shift();
    while (ws.length && ws[ws.length - 1].aberto) ws.pop();
    return ws;
  }
  function promptEscolha(h, itens, cat, cores, maxRefs, plWalls) {
    const pr = h.proposta || {};
    const vistas = (pr.paredes || []).map((w, i) => ({ vista: i, nome: w.nome, largura_pol: w.largura, altura_pol: w.altura, parece_ilha: RE_VISTA_PISO.test(String(w.nome || '')) }));
    const lin = itens.map((it) => [it.id, 'vista ' + it.vista, it.tipo, it.sku || '-', it.rotulo || '-', it.largura + 'x' + it.altura + ' pol', 'y ' + it.y, it.acabamento || '-',
      it.grupo ? 'grupo ' + it.grupo : '', it.portas != null ? 'portas ' + it.portas : '', it.porta ? 'porta ' + it.porta : '', it.cor_vidro ? 'vidro ' + it.cor_vidro : '',
      it.prateleiras != null ? 'prat ' + it.prateleiras : '', it.gavetas ? 'gav ' + it.gavetas : '', it.aberto ? 'aberto' : '', it.led ? 'LED' : ''].filter(Boolean).join(' | ')).join('\n');
    return `Você é a SAHRA, designer da Legno Home. O cliente APROVOU o projeto virtual. Agora você só ESCOLHE os produtos: as posições e medidas de cada item JÁ ESTÃO DEFINIDAS pelo projeto virtual e o portal vai usá-las exatamente. NÃO invente coordenadas.

ETAPAS DO FLUXO "MONTAR NO PORTAL" (regras do Matt — valem mais que tudo):
${h.regras || '(etapas ainda vazias)'}

${plWalls.length ? `PAREDES DA PLANTA BAIXA (índice = número da parede no portal):
${plWalls.map((w, k) => k + ': ' + (w.nome || 'parede') + ' · ' + w.pol + '"').join('\n')}

Para cada VISTA do projeto virtual, diga em qual parede ela está ("parede") e onde começa nela ("inicio_pol", da quina inicial da parede). Vista de ILHA/PENÍNSULA vai com "piso": true, "parede" = a parede de trabalho de frente pra ela, "inicio_pol" ao longo dessa parede e "afastamento_pol" = largura do CORREDOR livre (da frente da bancada da parede até a frente da ilha; a bancada de 24" o portal soma sozinho). Se a planta tem a ilha com parede/corredor/centro, a posição vem da planta.` : `Não há planta: cada vista (que não é ilha) vira uma parede do portal, na ordem, com cantos de 90°. Vista de ILHA/PENÍNSULA vai com "piso": true, "parede" (índice da vista de parede de trabalho), "inicio_pol" e "afastamento_pol".`}

VISTAS: ${JSON.stringify(vistas)}

ITENS DO PROJETO VIRTUAL (id | vista | tipo | sku | rótulo | medida | altura do chão | acabamento | detalhes):
${lin}

O QUE ESCOLHER PRA CADA ITEM
- Módulo do catálogo: "module_id" (id EXATO da 1ª coluna do catálogo; o SKU do item bate com as refs do módulo). Pode informar "profundidade_pol" se for diferente do padrão.
- Ou caixa pelo Construtor (conjunto empilhado, nicho, item sem módulo pronto igual): "caixa": "aereo" (Bottom · Bottom · Back) ou "suspenso", com "portas", "prateleiras", "gavetas", "modelo_porta" ("vidro" = Aluminium Glass), "cor_vidro", "led", "front_color_name".
- Ou "nao_virou": "motivo" (nunca invente; nunca troque por módulo de outra função: pantry ≠ torre com nicho).
- "color_name": nome EXATO das CORES ATIVAS (use a cor_legno do acabamento quando houver), ou null.
- CANTO SEM 3/4: painel/filler de ponta (3/4") só em ponta LIVRE. Num canto com móvel nas duas paredes (ou com bloco de canto), nada de painel/filler fino na ponta: o módulo encosta direto no canto/bloco.
- AÉREO DA GELADEIRA: o aéreo em cima da geladeira SEMPRE tem 24" de fundo. Escolha um módulo que aceite 24" de profundidade (refrigerator wall cabinet) ou "caixa": "aereo" pelo Construtor; nunca um aéreo raso de 12".
- BLIND CORNER: o lado cego fica virado pro canto. AÉREO RASO no canto: nunca blind/corner (o portal resolve o canto).

CATÁLOGO (id | nome | família › categoria › sub | montagem | w | h | d | refs):
${catalogoTexto(cat, maxRefs)}

CORES ATIVAS: ${cores.map((c) => c.name).join(' · ')}
ACABAMENTOS DO VIRTUAL: ${JSON.stringify(pr.acabamentos || [])}

Responda SOMENTE com JSON:
{"vistas": [{"vista": 0, "parede": 0, "inicio_pol": 0, "piso": false, "afastamento_pol": null}],
 "itens": [{"id": "0.1", "module_id": "…", "color_name": "…", "motivo": "por quê"},
           {"id": "0.2", "caixa": "aereo", "portas": 0, "prateleiras": 0, "gavetas": 0, "modelo_porta": null, "cor_vidro": null, "led": true, "color_name": "…", "front_color_name": null, "motivo": "…"},
           {"id": "0.3", "nao_virou": "motivo"}],
 "etapas": [{"etapa": "nome", "decisao": "o que decidiu"}],
 "mensagem": "1 a 2 frases pro Matt"}`;
  }
  // junta a escolha da IA com as posições do virtual → o mesmo formato que aplicaModulos usa
  const BANCADA_POL = 24; // fundo da bancada de parede (mesmo número da planta)
  // AÉREO DA GELADEIRA (21:44, 08/11, Matt: "geladeira sempre deve ter o
  // aéreo em cima com 24 de profundidade"). Aéreo em cima da geladeira (pelo
  // rótulo/SKU ou por estar no vão de uma geladeira da mesma vista) = 24".
  const PROF_AEREO_GELADEIRA_POL = 24;
  const RE_GELADEIRA = /geladeira|fridge|refrig|\bREF\b/i;
  function aereoDaGeladeira(it, vista) {
    const t = String(it.tipo || '');
    const alto = (+it.y || 0) >= 50;
    if (!(t === 'aereo' || (alto && t !== 'torre' && t !== 'canto' && t !== 'appliance' && t !== 'existente'))) return false;
    if (RE_GELADEIRA.test((it.rotulo || '') + ' ' + (it.sku || ''))) return true;
    const x0 = +it.x || 0, x1 = x0 + (+it.largura || 0);
    return ((vista && vista.itens) || []).some((g) => g !== it && (g.tipo === 'appliance' || g.tipo === 'existente') && RE_GELADEIRA.test((g.rotulo || '') + ' ' + (g.sku || '')) &&
      Math.min(x1, (+g.x || 0) + (+g.largura || 0)) - Math.max(x0, +g.x || 0) > Math.min(+it.largura || 0, +g.largura || 0) * 0.5);
  }
  function semPontaNoCanto(itens, vistas, mapaVista, walls, MMp, avisos) {
    const tirar = new Set(), puxar = new Map();
    const n = walls.length;
    const fechado = n > 2; // a última parede encontra a primeira só se o ambiente fecha; na dúvida, só cantos internos da sequência
    const camadas = (it) => { const y0 = +it.y || 0, y1 = y0 + (+it.altura || 0); const c = []; if (y0 < 36) c.push('base'); if (y1 > 50) c.push('aereo'); return c; };
    const ehFino = (it) => /^(painel|filler)$/.test(String(it.tipo || '')) && (+it.largura || 0) <= 1.5;
    const ehCantoIt = (it) => String(it.tipo || '') === 'canto' || /^(BCF|WCF)/i.test(String(it.sku || ''));
    // itens de parede com a posição em polegadas NA PAREDE do portal
    const porParede = new Map();
    itens.forEach((it) => {
      const mv = mapaVista.get(it.vista); if (!mv || mv.piso) return;
      const x0 = mv.inicio / MMp + (+it.x || 0);
      if (!porParede.has(mv.wi)) porParede.set(mv.wi, []);
      porParede.get(mv.wi).push({ it, x0, x1: x0 + (+it.largura || 0), cam: camadas(it) });
    });
    const temMovelPerto = (wi, lado, cam) => {
      const L = walls[wi].length_mm / MMp;
      return (porParede.get(wi) || []).some((o) => !ehFino(o.it) && o.cam.includes(cam) && (lado === 'ini' ? o.x0 < 30 : o.x1 > L - 30));
    };
    const cantoEm = (wi, lado, cam) => {
      const ang = lado === 'fim' ? +walls[wi].angle_to_next_deg : +((walls[(wi - 1 + n) % n] || {}).angle_to_next_deg);
      if (!(Math.abs(Math.abs(ang) - 90) < 15)) return false;
      const viz = lado === 'fim' ? wi + 1 : wi - 1;
      const vizOk = viz >= 0 && viz < n ? viz : (fechado ? (viz + n) % n : -1);
      const L = walls[wi].length_mm / MMp;
      const bloco = (porParede.get(wi) || []).some((o) => ehCantoIt(o.it) && o.cam.includes(cam) && (lado === 'ini' ? o.x0 < 1 : o.x1 > L - 1));
      return bloco || (vizOk >= 0 && temMovelPerto(vizOk, lado === 'fim' ? 'ini' : 'fim', cam) && temMovelPerto(wi, lado, cam));
    };
    porParede.forEach((lista, wi) => {
      const L = walls[wi].length_mm / MMp;
      ['base', 'aereo'].forEach((cam) => {
        ['ini', 'fim'].forEach((lado) => {
          if (!cantoEm(wi, lado, cam)) return;
          // limite do canto: a ponta da parede, ou a borda do bloco de canto
          const blocos = lista.filter((o) => ehCantoIt(o.it) && o.cam.includes(cam));
          const lim = lado === 'ini' ? Math.max(0, ...blocos.filter((o) => o.x0 < 1).map((o) => o.x1)) : Math.min(L, ...blocos.filter((o) => o.x1 > L - 1).map((o) => o.x0));
          const finos = lista.filter((o) => ehFino(o.it) && o.cam.includes(cam) && !tirar.has(o.it) && (lado === 'ini' ? Math.abs(o.x0 - lim) <= 1 : Math.abs(o.x1 - lim) <= 1));
          if (!finos.length) return;
          const f = finos[0]; tirar.add(f.it);
          const larg = (+f.it.largura || 0);
          // o módulo logo depois do filler encosta no canto
          const vizinho = lista.filter((o) => o.it !== f.it && !ehFino(o.it) && !ehCantoIt(o.it) && o.cam.includes(cam) && (lado === 'ini' ? Math.abs(o.x0 - f.x1) <= 1 : Math.abs(o.x1 - f.x0) <= 1));
          vizinho.forEach((o) => { if (!puxar.has(o.it)) puxar.set(o.it, (lado === 'ini' ? -larg : larg) * MMp); });
          avisos.push('Parede ' + (wi + 1) + ' (' + (cam === 'aereo' ? 'aéreos' : 'bases') + '): canto com móvel dos dois lados — tirei o ' + (f.it.sku || f.it.tipo) + ' de ' + larg + '" da ponta e encostei o vizinho no canto.');
        });
      });
    });
    return { tirar, puxar };
  }
  function montaDoVirtual(h, itens, esc, cat, plWalls) {
    const pr = h.proposta || {}; const MMp = MM;
    const porId = new Map(cat.map((m) => [String(m.id), m]));
    const vistas = pr.paredes || [];
    const escV = new Map((esc.vistas || []).map((v) => [Number(v.vista), v]));
    const escI = new Map((esc.itens || []).map((x) => [String(x.id), x]));
    const avisos = [], naoVirou = [];
    // paredes
    let walls, mapaVista = new Map();
    const teto = Math.max(...vistas.map((w) => +w.altura || 0), 0) * MMp || roomSettings.ceiling_mm;
    if (plWalls.length) {
      walls = plWalls.map((w) => ({ length_mm: Math.round(w.pol * MMp), height_mm: Math.round(teto), angle_to_next_deg: w.angulo, nome: w.nome }));
      vistas.forEach((w, vi) => {
        const e = escV.get(vi) || {};
        const piso = e.piso === true || RE_VISTA_PISO.test(String(w.nome || ''));
        let wi = Number(e.parede);
        if (!(wi >= 0 && wi < walls.length)) {
          // sem resposta: casa pelo nome, senão pela largura mais parecida
          const n = String(w.nome || '').toLowerCase();
          wi = plWalls.findIndex((p) => p.nome && n && (p.nome.toLowerCase().includes(n) || n.includes(p.nome.toLowerCase())));
          if (wi < 0) wi = plWalls.map((p, k) => [Math.abs(p.pol - (+w.largura || 0)), k]).sort((a, b) => a[0] - b[0])[0][1];
          if (!piso) avisos.push('Vista "' + w.nome + '": a SAHRA não disse a parede; usei a parede ' + (wi + 1) + ' (' + (plWalls[wi].nome || '') + ').');
        }
        mapaVista.set(vi, { wi, inicio: (+e.inicio_pol || 0) * MMp, piso, afast: (BANCADA_POL + (+e.afastamento_pol || 42)) * MMp, largura: (+w.largura || 0) * MMp });
      });
      // ILHA NA POSIÇÃO DA PLANTA (21:17, 08/11, Matt: "a ilha entrou
      // deslocada mais pra perto da parede… deve ter alguma referência de
      // localização errada"). Era: afastamento = só o corredor, contado da
      // PAREDE — faltava a bancada de 24" (a planta conta parede → bancada →
      // corredor → ilha). Agora, se a planta tem a ilha com parede/corredor/
      // centro, a posição vem DELA (a mesma conta que desenha a planta).
      const ilhasPl = ((h.ficha && h.ficha.planta && h.ficha.planta.ilhas) || []).filter((il) => il && il.parede != null);
      let kIlha = 0;
      vistas.forEach((w, vi) => {
        const mv = mapaVista.get(vi); if (!mv || !mv.piso) return;
        const n = String(w.nome || '').toLowerCase();
        const il = ilhasPl.find((x) => x.nome && n && (n.includes(String(x.nome).toLowerCase()) || String(x.nome).toLowerCase().includes(n))) || ilhasPl[kIlha];
        kIlha++;
        if (!il) return;
        const wi = plWalls.findIndex((p) => p.i === Number(il.parede));
        if (wi < 0) { avisos.push('Ilha "' + (il.nome || w.nome) + '": a parede de referência da planta é um lado aberto; usei a posição que a SAHRA deu.'); return; }
        const Lpl = plWalls[wi].pol;
        const c = Number.isFinite(Number(il.centro)) ? Number(il.centro) : Lpl / 2;
        const corr = Number(il.corredor) > 0 ? Number(il.corredor) : 42;
        const larg = mv.largura || (+il.largura || 0) * MMp;
        Object.assign(mv, { wi, inicio: c * MMp - larg / 2, afast: (BANCADA_POL + corr) * MMp, largura: larg, dePlanta: true });
        avisos.push('Ilha "' + (il.nome || w.nome) + '": posição da planta — parede ' + (wi + 1) + ' (' + (plWalls[wi].nome || '') + '), centro a ' + Math.round(c) + '" da quina, corredor de ' + Math.round(corr) + '" depois da bancada de ' + BANCADA_POL + '".');
      });
    } else {
      walls = []; const idxParede = new Map();
      vistas.forEach((w, vi) => { if (!RE_VISTA_PISO.test(String(w.nome || '')) && !((escV.get(vi) || {}).piso === true)) { idxParede.set(vi, walls.length); walls.push({ length_mm: Math.round((+w.largura || 0) * MMp), height_mm: Math.round((+w.altura || 0) * MMp || teto), angle_to_next_deg: 90, nome: w.nome }); } });
      vistas.forEach((w, vi) => {
        const e = escV.get(vi) || {};
        if (idxParede.has(vi)) mapaVista.set(vi, { wi: idxParede.get(vi), inicio: 0, piso: false, largura: (+w.largura || 0) * MMp });
        else { let wi = Number(e.parede); if (!(wi >= 0 && wi < walls.length)) wi = 0; mapaVista.set(vi, { wi, inicio: (+e.inicio_pol || 0) * MMp, piso: true, afast: (BANCADA_POL + (+e.afastamento_pol || 42)) * MMp, largura: (+w.largura || 0) * MMp }); }
      });
    }
    if (!walls.length) throw new Error('o projeto virtual não tem parede pra montar');
    // CANTO SEM O 3/4 DA PONTA (21:50, 08/11, Matt: "a regra que coloca 3/4
    // afastado nas pontas com filler não pode valer quando tem um móvel de
    // canto; deve eliminar essa regra pros cantos onde tem 2 móveis que vão
    // se encontrar"). Ponta de parede que é CANTO com móvel nas duas paredes
    // (ou com bloco de canto BCF/WCF): o painel/filler fino (≤ 1½") encostado
    // ali sai, e o módulo vizinho encosta no canto (ou no bloco).
    const { tirar: tirarPonta, puxar: puxarPonta } = semPontaNoCanto(itens, vistas, mapaVista, walls, MMp, avisos);
    // itens
    const modules = [];
    itens.forEach((it) => {
      const e = escI.get(String(it.id)) || {};
      const nome = (it.rotulo || it.sku || it.tipo) + ' (' + (vistas[it.vista] && vistas[it.vista].nome || 'vista ' + it.vista) + ')';
      if (e.nao_virou) { naoVirou.push({ item: nome, motivo: String(e.nao_virou) }); return; }
      if (tirarPonta.has(it)) return;
      const mv = mapaVista.get(it.vista); if (!mv) return;
      const mod = e.module_id != null ? porId.get(String(e.module_id)) : null;
      if (!mod && !e.caixa) { naoVirou.push({ item: nome, motivo: 'a SAHRA não escolheu módulo nem caixa' }); return; }
      const W = (+it.largura) * MMp, H = (+it.altura) * MMp;
      let profPol = +e.profundidade_pol || (mod && mod.d && mod.d[1] ? mod.d[1] / MMp : 0) || PROF_PADRAO_POL[it.tipo] || 24;
      const sobreGeladeira = aereoDaGeladeira(it, vistas[it.vista]);
      if (sobreGeladeira) profPol = PROF_AEREO_GELADEIRA_POL;
      const x = mv.piso ? mv.inicio + (mv.largura - (+it.x) * MMp - W) : mv.inicio + (+it.x) * MMp + (puxarPonta.get(it) || 0);
      const m = {
        item: nome, grupo: it.grupo || null, motivo: e.motivo || '', wall_index: mv.wi,
        x_mm: Math.round(x), floor_height_mm: Math.round((+it.y || 0) * MMp), width_mm: Math.round(W), height_mm: Math.round(H), depth_mm: Math.round(profPol * MMp),
        color_name: e.color_name || null
      };
      if (mod) m.module_id = mod.id;
      else {
        Object.assign(m, { caixa: e.caixa === 'suspenso' ? 'suspenso' : e.caixa === 'closet' ? 'closet' : 'aereo',
          portas: e.portas != null ? e.portas : (it.portas || 0), prateleiras: e.prateleiras != null ? e.prateleiras : (it.prateleiras || 0),
          gavetas: e.gavetas != null ? e.gavetas : (it.gavetas || 0),
          modelo_porta: e.modelo_porta || (/vidro|glass/i.test(it.porta || '') ? 'vidro' : null),
          cor_vidro: e.cor_vidro || it.cor_vidro || null, led: e.led != null ? !!e.led : !!it.led, front_color_name: e.front_color_name || null });
      }
      if (sobreGeladeira) m.geladeira = true;
      if (mv.piso) m.piso = { afastamento_mm: Math.round(mv.afast), frente: 'parede' };
      m.camada = mv.piso ? 'piso' : it.grupo ? 'torre' : (m.floor_height_mm >= 900 ? 'aereo' : (m.height_mm > 1500 ? 'torre' : 'base'));
      // item passando da parede: avisa (não inventa posição)
      const Lw = walls[mv.wi].length_mm;
      if (!mv.piso && (m.x_mm < -5 || m.x_mm + m.width_mm > Lw + 5)) avisos.push(nome + ': no virtual passa da parede ' + (mv.wi + 1) + ' (' + Math.round(Lw / MMp) + '"). Confira o virtual.');
      modules.push(m);
    });
    return { walls, main_index: 0, ceiling_mm: Math.round(teto), modules, nao_virou: naoVirou, etapas: esc.etapas || [], mensagem: esc.mensagem || '', _avisos: avisos };
  }

  // ========================================================================
  // MICRO ETAPAS DA MONTAGEM (12:20, 08/11). Matt: "temos que quebrar em
  // várias etapas pequenas (fluxos micro) e ir trabalhando um por um. Todo
  // projeto começa nos cantos, é a maneira mais fácil de começar." E: "criar
  // um canto (novo módulo corner) com um bloco invisível e 2 fillers na
  // frente… um corner superior e um inferior" (migration 282).
  //   1 cantos  · paredes + módulo de canto (inferior/superior) em cada canto
  //   2 bases   · bases do virtual, encostadas nos cantos
  //   3 aereos  · aéreos do virtual, encostados nos cantos
  //   4 torres  · torres e conjuntos empilhados (torre café)
  //   5 ilha    · ilha/península no piso
  //   tudo      · tudo acima
  // Dá pra montar até uma etapa e conferir no canvas antes da próxima.
  // ========================================================================
  // Ordem do Matt (13:12): A paredes · B cantos (bases e aéreos) · C bases ·
  // D torres e conjuntos · E aéreos · F ilha.
  const ETAPAS_MONTAR = ['paredes', 'cantos', 'bases', 'torres', 'aereos', 'ilha', 'tudo'];
  const NOME_ETAPA = { paredes: 'A · Paredes', cantos: 'B · Cantos', bases: 'C · Bases', torres: 'D · Torres e conjuntos', aereos: 'E · Aéreos', ilha: 'F · Ilha', tudo: 'Tudo' };
  const CAMADAS_ATE = { paredes: [], cantos: [], bases: ['base'], torres: ['base', 'torre'], aereos: ['base', 'torre', 'aereo'], ilha: ['base', 'torre', 'aereo', 'piso'], tudo: ['base', 'torre', 'aereo', 'piso'] };
  const FOLGA_CANTO = { base: 3 * MM, aereo: 2 * MM };
  const NOME_CANTO = { base: 'Base Corner Filler', aereo: 'Wall Corner Filler' };
  // ETAPA 1: em cada canto de 90°, se as DUAS paredes têm módulos da camada
  // perto do canto, entra o bloco de canto: largura = prof. da outra parede +
  // folga, profundidade = prof. desta parede + folga. Devolve os trechos que
  // ele ocupa em cada parede (pra etapa 2/3 encostar os módulos).
  async function etapaCantos(r, cat, avisos, diag) {
    const blocos = []; // {wi, camada, ini, fim}
    const mods = (r.modules || []).filter((m) => !m.piso);
    for (const [i, j] of cantosDoAmbiente(r)) {
      const Li = getProjectWallWidthMm(i);
      for (const camada of ['base', 'aereo']) {
        const daCamada = (m) => camada === 'aereo' ? m.camada === 'aereo' : (m.camada === 'base' || (m.camada === 'torre' && (+m.floor_height_mm || 0) < 50));
        const A = mods.filter((m) => m.wall_index === i && daCamada(m) && (m.x_mm + m.width_mm) > Li - 1500);
        const B = mods.filter((m) => m.wall_index === j && daCamada(m) && m.x_mm < 1500);
        const nome = 'Canto paredes ' + (i + 1) + '/' + (j + 1) + ' (' + (camada === 'base' ? 'inferior' : 'superior') + ')';
        if (!A.length || !B.length) { diag.push(nome + ': ' + (!A.length && !B.length ? 'sem módulos perto do canto' : 'módulos só numa das paredes') + ' — sem bloco de canto.'); continue; }
        const mod = cat.find((m) => m.name === NOME_CANTO[camada]);
        const DA = Math.max(...A.map((m) => +m.depth_mm || 0)), DB = Math.max(...B.map((m) => +m.depth_mm || 0));
        const W = Math.round(DB + FOLGA_CANTO[camada]), D = Math.round(DA + FOLGA_CANTO[camada]);
        const ref = camada === 'aereo' ? A.concat(B).filter((m) => m.camada === 'aereo') : A.concat(B);
        const y = camada === 'aereo' ? Math.min(...ref.map((m) => +m.floor_height_mm || 0)) : 0;
        const hh = camada === 'aereo' ? Math.max(...ref.map((m) => (+m.floor_height_mm || 0) + (+m.height_mm || 0))) - y : Math.max(...A.concat(B).filter((m) => m.camada === 'base').map((m) => +m.height_mm || 0), 876);
        blocos.push({ wi: i, camada, ini: Li - W, fim: Li }, { wi: j, camada, ini: 0, fim: D });
        if (!mod) { avisos.push(nome + ': falta o módulo "' + NOME_CANTO[camada] + '" no catálogo (migration 282). O espaço do canto ficou reservado, sem os fillers.'); diag.push(nome + ': espaço reservado ' + (W / MM).toFixed(1) + '" × ' + (D / MM).toFixed(1) + '" (sem módulo).'); continue; }
        const sl = await insertProjectModuleDefault(mod.id, { wall_index: i, x_mm: Math.round(Li - W), width_mm: W, height_mm: Math.round(hh), floor_height_mm: Math.round(y) });
        if (!sl) { avisos.push(nome + ': o portal não criou o bloco de canto.'); continue; }
        sl.x_mm = Math.round(Li - W); sl.floor_height_mm = Math.round(y);
        try { sl.depth_mm = projectSlotClampedDimensionMm(sl, 'depth', D); } catch (e) { /* */ }
        const cor = (A.concat(B).find((m) => m.color_name) || {}).color_name;
        if (cor) iaeOpSetColor({ slot_ids: [String(sl.id)], color_name: cor }, avisos);
        recomputeProjectSlotPricing(sl);
        if (Math.abs((+sl.width_mm) - W) > 2 || Math.abs((+sl.depth_mm) - D) > 2) avisos.push(nome + ': o bloco não aceitou ' + (W / MM).toFixed(1) + '" × ' + (D / MM).toFixed(1) + '" (ficou ' + ((+sl.width_mm) / MM).toFixed(1) + '" × ' + ((+sl.depth_mm) / MM).toFixed(1) + '").');
        diag.push(nome + ': ' + mod.name + ' ' + (W / MM).toFixed(1) + '" × ' + (D / MM).toFixed(1) + '".');
      }
    }
    return blocos;
  }
  // ETAPAS 2 e 3: os módulos da camada encostam nos blocos de canto. Mantém a
  // ordem e os vãos do virtual; quem invade o canto anda pra fora, empurrando
  // os seguintes. O que não couber vira aviso (fechamento é uma etapa futura).
  const SEM_DESLOCAR = true;
  function encostaNosCantos(mods, blocos, avisos, diag) {
    if (SEM_DESLOCAR) {
      // só confere: módulo que invade o bloco de canto vira aviso, ninguém anda
      mods.forEach((m) => {
        if (m.piso) return;
        const camada = m.camada === 'aereo' ? 'aereo' : 'base';
        const b = blocos.find((x) => x.wi === m.wall_index && x.camada === camada && m.x_mm < x.fim - 1 && m.x_mm + m.width_mm > x.ini + 1);
        if (b) avisos.push(m.item + ': invade o bloco de canto da parede ' + (m.wall_index + 1) + ' (' + Math.round(b.ini / MM) + '"–' + Math.round(b.fim / MM) + '"). Ficou onde o virtual pôs.');
      });
      return;
    }
    const grupos = new Map();
    mods.forEach((m) => {
      if (m.piso) return;
      const camada = m.camada === 'aereo' ? 'aereo' : 'base';
      const k = m.wall_index + '|' + camada; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(m);
    });
    grupos.forEach((lista, k) => {
      const [wi, camada] = [Number(k.split('|')[0]), k.split('|')[1]];
      const L = getProjectWallWidthMm(wi);
      const bs = blocos.filter((b) => b.wi === wi && b.camada === camada);
      const ini = bs.find((b) => b.ini === 0), fim = bs.find((b) => b.fim >= L - 1 && b.ini > 0);
      let mexeu = 0;
      if (ini) { let cur = ini.fim; lista.slice().sort((a, b) => a.x_mm - b.x_mm).forEach((m) => { if (m.x_mm < cur - 1) { m.x_mm = Math.round(cur); mexeu++; } cur = Math.max(cur, m.x_mm + m.width_mm); }); }
      if (fim) { let cur = fim.ini; lista.slice().sort((a, b) => (b.x_mm + b.width_mm) - (a.x_mm + a.width_mm)).forEach((m) => { if (m.x_mm + m.width_mm > cur + 1) { m.x_mm = Math.round(cur - m.width_mm); mexeu++; } cur = Math.min(cur, m.x_mm); }); }
      const ord = lista.slice().sort((a, b) => a.x_mm - b.x_mm);
      for (let n = 1; n < ord.length; n++) if (ord[n].x_mm < ord[n - 1].x_mm + ord[n - 1].width_mm - 1) { avisos.push('Parede ' + (wi + 1) + ' (' + (camada === 'aereo' ? 'aéreos' : 'bases') + '): não cabe tudo entre os cantos — ' + ord[n - 1].item + ' e ' + ord[n].item + ' se sobrepõem. Ajustar no virtual ou com módulo custom.'); break; }
      if (ord.length && ord[0].x_mm < (ini ? ini.fim : 0) - 1) avisos.push('Parede ' + (wi + 1) + ': a linha passou do canto inicial.');
      if (mexeu) diag.push('Parede ' + (wi + 1) + ' (' + (camada === 'aereo' ? 'aéreos' : 'bases') + '): ' + mexeu + ' módulo(s) encostado(s) no canto.');
    });
  }

  async function chamaIA(prompt) {
    const resp = await supabaseClient.functions.invoke('sahra-fluxo', { body: { acao: 'json', prompt, modo: 'leve' } });
    if (resp.error || !resp.data || !resp.data.data) {
      let corpo = null; try { corpo = await resp.error.context.json(); } catch (e) { /* */ }
      throw new Error((corpo && corpo.error) || (resp.data && resp.data.error) || (resp.error && resp.error.message) || 'sem resposta da IA');
    }
    return { data: resp.data.data, model: resp.data.model };
  }

  function irParaProjetos() {
    const tab = document.querySelector('.portal-tab-btn[data-tab="po-tab-projects"]');
    if (tab && !tab.classList.contains('active')) tab.click();
  }

  function aplicaParedes(r) {
    const walls = (r.walls || []).map((w) => ({
      length_mm: Math.max(300, Number(w.length_mm) || 0),
      height_mm: Number(w.height_mm) || Number(r.ceiling_mm) || 0,
      angle_to_next_deg: Number.isFinite(Number(w.angle_to_next_deg)) ? Number(w.angle_to_next_deg) : 90
    })).filter((w) => w.length_mm > 0);
    if (!walls.length) throw new Error('a IA não devolveu paredes');
    const teto = Number(r.ceiling_mm) || Math.max(...walls.map((w) => w.height_mm || 0)) || roomSettings.ceiling_mm;
    const main = Math.min(Math.max(0, Number(r.main_index) || 0), walls.length - 1);
    const segs = projectPhotoWallsToSegments(walls, [], teto, main);
    if (!segs || !segs.length) throw new Error('não consegui montar as paredes');
    projectWallSegments = segs;
    const ceilInput = document.getElementById('po-proj-ceiling-input');
    if (teto && Math.abs(teto - roomSettings.ceiling_mm) > 1) {
      if (ceilInput && typeof formatDimension === 'function') {
        const un = (typeof aiwUnit === 'function') ? aiwUnit() : 'mm';
        ceilInput.value = formatDimension(teto, un);
        ceilInput.dispatchEvent(new Event('change'));
      } else {
        roomSettings.ceiling_mm = teto;
        if (typeof refreshRoomSettingsInputs === 'function') refreshRoomSettingsInputs();
      }
    }
    projectActiveWallIndex = Math.min(main, segs.length - 1);
    try { project3DLastFitKey = null; } catch (e) { /* */ }
    if (typeof refreshProjectWallTabs === 'function') refreshProjectWallTabs();
    if (typeof refreshProjectWallWidthInput === 'function') refreshProjectWallWidthInput();
    return segs.length;
  }

  // ---- CONJUNTOS, CAIXA PELO CONSTRUTOR E PISO (09:40, 08/11) ----
  // Matt (torre café: base + nicho + aéreo de vidro): "tem que ser montada via
  // construtor… top cover esquerdo… base de duas portas com rodapé… nicho
  // nos componentes bottom back… LED no construtor… em cima mais um bottom
  // back com cor diferente, prateleiras, duas portas trocadas por aluminium
  // glass, vidro fumê… top cover na direita… sempre o top cover é tamanho da
  // caixa, profundidade da caixa mais uma polegada" / "o base acompanha a
  // altura dos bases, o aéreo a altura dos aéreos, e o nicho cabe nesse
  // intervalo pra dar o alinhamento". A RECEITA fica na etapa do fluxo; aqui
  // só a mecânica que executa e o alinhamento.
  const ehPainel = (m, cat) => {
    const mod = m.module_id != null ? cat.find((c) => String(c.id) === String(m.module_id)) : null;
    return !!mod && /panel|painel|cover|filler/i.test([mod.name, mod.category].join(' '));
  };
  const moda = (lista) => {
    const c = {}; lista.forEach((v) => { const k = Math.round(v); c[k] = (c[k] || 0) + 1; });
    const k = Object.keys(c).sort((a, b) => c[b] - c[a])[0];
    return k != null ? Number(k) : null;
  };
  function alinhaGrupos(mods, cat) {
    const grupos = new Map();
    mods.forEach((m) => { if (m.grupo && !m.piso) { const k = m.wall_index + '|' + m.grupo; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(m); } });
    grupos.forEach((lista, k) => {
      const wi = Number(k.split('|')[0]);
      const fora = mods.filter((m) => !lista.includes(m) && Number(m.wall_index) === wi && !m.piso && !ehPainel(m, cat));
      const corpo = lista.filter((m) => !ehPainel(m, cat)).sort((a, b) => (+a.floor_height_mm || 0) - (+b.floor_height_mm || 0));
      if (!corpo.length) return;
      const baseH = moda(fora.filter((m) => (+m.floor_height_mm || 0) < 50).map((m) => +m.height_mm || 0));
      const topoAereo = moda(fora.filter((m) => (+m.floor_height_mm || 0) >= 1000).map((m) => (+m.floor_height_mm || 0) + (+m.height_mm || 0)));
      const baixo = corpo[0], cima = corpo.length > 1 ? corpo[corpo.length - 1] : null;
      // SEM DESLOCAR (21:14, 08/11, Matt: "não desloque os módulos na
      // construção desse projeto"): posição e altura vêm do virtual; aqui só
      // as profundidades (nicho aberto +1", top cover +1").
      if (!SEM_DESLOCAR) {
      if ((+baixo.floor_height_mm || 0) < 50 && baseH) { baixo.floor_height_mm = 0; baixo.height_mm = baseH; }
      if (cima && topoAereo && topoAereo > (+baixo.height_mm || 0) + 100) cima.floor_height_mm = topoAereo - (+cima.height_mm || 0);
      // o(s) do meio preenchem o vão entre a de baixo e a de cima
      if (corpo.length >= 3) {
        const ini = (+baixo.floor_height_mm || 0) + (+baixo.height_mm || 0), fim = +cima.floor_height_mm || 0;
        const meio = corpo.slice(1, -1); const vao = fim - ini;
        if (vao > 50) { let y = ini; meio.forEach((m, i) => { const hh = i === meio.length - 1 ? fim - y : Math.round(vao / meio.length); m.floor_height_mm = y; m.height_mm = hh; y += hh; }); }
      } else if (cima) {
        const ini = (+baixo.floor_height_mm || 0) + (+baixo.height_mm || 0);
        if (Math.abs((+cima.floor_height_mm || 0) - ini) < 40) cima.floor_height_mm = ini;
      }
      }
      // NICHO ABERTO = TAMPONAMENTO (09:51, 08/11, Matt: "sempre que é um
      // nicho aberto conectado com algum módulo que tenha porta, ele tem que
      // ser como um tamponamento: uma polegada a mais do que o módulo de baixo
      // pra cobrir a porta… só pra nichos abertos"). Profundidade = a maior
      // dos módulos com frente do conjunto + 1".
      const aberto = (m) => m.caixa && !(+m.portas) && !(+m.gavetas);
      const comFrente = corpo.filter((m) => !aberto(m));
      if (comFrente.length) {
        const dFrente = Math.max(...comFrente.map((m) => +m.depth_mm || 0));
        if (dFrente > 0) corpo.filter(aberto).forEach((m) => { m.depth_mm = dFrente + MM; });
      }
      // top covers: altura do conjunto, profundidade da caixa + 1"
      const y0 = Math.min(...corpo.map((m) => +m.floor_height_mm || 0));
      const y1 = Math.max(...corpo.map((m) => (+m.floor_height_mm || 0) + (+m.height_mm || 0)));
      const dMax = Math.max(...corpo.map((m) => +m.depth_mm || 0));
      lista.filter((m) => ehPainel(m, cat)).forEach((pn) => { if (!SEM_DESLOCAR) { pn.floor_height_mm = y0; pn.height_mm = y1 - y0; } if (dMax) pn.depth_mm = dMax + MM; });
    });
  }

  function interiorDaCaixa(m) {
    const W = +m.width_mm || 600, H = +m.height_mm || 600;
    const portas = Math.max(0, Math.round(+m.portas || 0)), prat = Math.max(0, Math.round(+m.prateleiras || 0)), gav = Math.max(0, Math.round(+m.gavetas || 0));
    const zona = gav ? { type: 'drawers', height_mm: H, count: gav } : { type: 'shelves', height_mm: H, count: prat };
    if (portas >= 2 && !gav) {
      // 2 colunas de porta: o portal junta numa porta de 2 folhas, sem divisória (regra de 01/11)
      return { columns: [0, 1].map(() => ({ width_mm: Math.round(W / 2), zones: [Object.assign({}, zona)], doors: 'hinged', doors_cover: 'all' })) };
    }
    return { columns: [{ width_mm: W, zones: [zona], doors: portas ? 'hinged' : 'none', doors_cover: 'all' }] };
  }
  async function modeloDePorta(slot, m, avisos) {
    if (!m.modelo_porta || typeof setProjectSlotDoorModel !== 'function') return;
    await ensureProjectDoorModels();
    const lista = projectDoorModelsCache || [];
    const txt = (x) => (String(x.name || '') + ' ' + String(x.slug || ''));
    const querVidro = /vidro|glass/i.test(m.modelo_porta);
    const dm = (querVidro && lista.find((x) => /alumin/i.test(txt(x)) && /glass|vidro/i.test(txt(x))))
      || lista.find((x) => new RegExp(String(m.modelo_porta).replace(/[^\wÀ-ú ]/g, ''), 'i').test(txt(x)))
      || (querVidro && lista.find((x) => /glass|vidro/i.test(txt(x))));
    if (!dm) { avisos.push((m.item || 'Caixa') + ': modelo de porta "' + m.modelo_porta + '" não encontrado.'); return; }
    const r = await setProjectSlotDoorModel(slot, dm.id, { lote: true });
    if (r === 'bloq') { avisos.push((m.item || 'Caixa') + ': porta grande demais pro ' + dm.name + '.'); return; }
    if (m.cor_vidro) {
      const re = /fum|smoke|grey|gray|cinza|bronze/i.test(m.cor_vidro) ? /fum|smoke|grey|gray|cinza|bronze/i : new RegExp(String(m.cor_vidro).replace(/[^\wÀ-ú ]/g, ''), 'i');
      const roles = (typeof colorRolesCache !== 'undefined' && colorRolesCache) || [];
      let ok = false;
      Object.keys(slot.colorOptionsByRole || {}).forEach((rid) => {
        const nome = (roles.find((x) => String(x.id) === String(rid)) || {}).name || '';
        if (!/vidro|glass/i.test(nome)) return;
        const c = (slot.colorOptionsByRole[rid] || []).find((o) => re.test(String(o.name || '')));
        if (c) { applyColorToProjectSlot(slot, rid, c); ok = true; }
      });
      if (!ok) avisos.push((m.item || 'Caixa') + ': vidro "' + m.cor_vidro + '" não encontrado; ficou o padrão.');
    }
  }
  function ledNoTampo(slot, m, avisos) {
    if (!m.led || typeof projectLedPecasElegiveis !== 'function') return;
    try {
      const pecas = projectLedPecasElegiveis(slot);
      const alvo = (pecas.find(({ p }) => p.position_role === 'top') || pecas.find(({ p }) => p.position_role === 'shelf') || {}).p;
      if (!alvo) { avisos.push((m.item || 'Caixa') + ': sem peça pra LED.'); return; }
      const cfg = ledConfigDaLinha(ledLinhaPadrao(alvo, null));
      slot.ledConfigs = Object.assign({}, slot.ledConfigs || {}, { [alvo.piece_id]: [cfg] });
    } catch (e) { avisos.push((m.item || 'Caixa') + ': não consegui pôr o LED (' + ((e && e.message) || e) + ').'); }
  }
  async function aplicaCaixa(m, cat, wi, avisos) {
    const comp = m.caixa === 'suspenso' ? 'suspenso' : m.caixa === 'closet' ? 'closet' : 'aereo';
    const carc = projectPhotoCarcassModule(comp, cat);
    if (!carc) throw new Error('caixa de Componentes "' + PROJECT_PHOTO_COMPOSITIONS[comp].carcass + '" não está no catálogo');
    const slot = await insertProjectModuleDefault(carc.id, { wall_index: wi, x_mm: Math.max(0, +m.x_mm || 0), width_mm: +m.width_mm || undefined, height_mm: +m.height_mm || undefined, floor_height_mm: Math.max(0, +m.floor_height_mm || 0) });
    if (!slot) throw new Error('o portal não criou a caixa');
    if (+m.depth_mm) slot.depth_mm = projectSlotClampedDimensionMm(slot, 'depth', +m.depth_mm);
    slot.floor_height_mm = Math.max(0, +m.floor_height_mm || 0);
    slot.x_mm = Math.max(0, +m.x_mm || 0);
    const it = { interior: interiorDaCaixa(m), composition: comp, label: m.item || 'Caixa', color_name: m.color_name || null, front_color_name: m.front_color_name || m.color_name || null };
    await projectPhotoApplyInterior(slot, it, avisos);
    if (it.color_name) projectPhotoPaintComposition(slot, it, avisos);
    await modeloDePorta(slot, m, avisos);
    ledNoTampo(slot, m, avisos);
    if (typeof iaeAfterGeometry === 'function') iaeAfterGeometry(slot); else recomputeProjectSlotPricing(slot);
    return slot;
  }
  async function aplicaPiso(m, mod, wi, avisos) {
    const g = new Map((getProjectWallGeometry() || []).map((x) => [x.wallIndex, x])).get(wi);
    if (!g) throw new Error('parede de referência da ilha não existe');
    const W = +m.width_mm || 600, D = +m.depth_mm || 600;
    const along = (+m.x_mm || 0) + W / 2, into = (+m.piso.afastamento_mm || 0) + D / 2;
    const slot = await insertProjectModuleDefault(mod.id, {
      placement: 'floor', floor_x_mm: Math.round(g.originX * 1000 + g.alongDirX * along + g.intoDirX * into),
      floor_z_mm: Math.round(g.originZ * 1000 + g.alongDirZ * along + g.intoDirZ * into),
      width_mm: W, height_mm: +m.height_mm || undefined, floor_height_mm: Math.max(0, +m.floor_height_mm || 0)
    });
    if (!slot) throw new Error('o portal não criou o módulo no piso');
    // ILHA DE FRENTE PRA PAREDE (10:15, 08/11, Matt: "o bloco da ilha veio
    // virado pra fora… tem que estar de frente pra parede, não de costas…
    // dar um giro de 180°… vale pra todas as cozinhas"). Módulo de parede
    // olha pro ambiente (rotationY); o da ilha olha pra parede de referência
    // = +180°. Só o painel de trás/bancada pode pedir o contrário.
    const praFora = /ambiente|room|fora|costas/i.test(m.piso.frente || '') && /panel|painel|cover/i.test(String(mod.name || ''));
    let deg = (g.rotationY * 180 / Math.PI) + (praFora ? 0 : 180);
    slot.floor_rotation_deg = Math.round((((deg % 360) + 540) % 360 - 180) * 10) / 10;
    if (+m.depth_mm) slot.depth_mm = projectSlotClampedDimensionMm(slot, 'depth', D);
    if (m.color_name) iaeOpSetColor({ slot_ids: [String(slot.id)], color_name: m.color_name }, avisos);
    recomputeProjectSlotPricing(slot); // sem clamp: a ilha pode passar do piso (o piso continua)
    return slot;
  }

  // ---- CANTO DOS AÉREOS (09:58, 08/11) ----
  // Matt: "o canto aéreo 99% das vezes vai ter esse espacinho em branco,
  // morto, que não vale a pena fazer um blind ou corner… coloca um filler na
  // parte frontal da caixa, dos dois lados, e se conecta um entrelaçado no
  // outro… se a parede está um pouquinho torta, tem jogo… todo aéreo de
  // profundidade curta (12, 13, até 15) tem que ser feito dessa forma…
  // se não der espaço pros aéreos padrão, troca pra aéreo custom e
  // customiza a largura". Aqui: em cada canto de ~90° entre paredes
  // seguidas, o aéreo raso mais perto do canto de cada lado sai do canto
  // (profundidade do aéreo da outra parede + folga) e ganha um filler na
  // frente; o filler da parede seguinte passa por cima da ponta do outro.
  const CANTO_FOLGA_MM = 2 * MM;     // folga entre a caixa e a frente do aéreo da outra parede
  const AEREO_RASO_MAX_MM = 16 * MM; // "12, 13, até 15"
  const ehAereoRaso = (s) => s && !isFloorSlot(s) && (+s.floor_height_mm || 0) >= 900 && (+s.depth_mm || 0) > 0 && (+s.depth_mm || 0) <= AEREO_RASO_MAX_MM
    && !/filler|panel|painel|cover|shelf|prateleira/i.test(String((s.module && s.module.name) || ''));
  // Cantos do ambiente: pares de paredes seguidas (i → i+1) com ~90°, e o
  // fechamento (última → primeira) quando o contorno fecha.
  function cantosDoAmbiente(r) {
    const n = projectWallSegments.length; const ws = r.walls || []; const out = [];
    const ang = (i) => { const a = Number((ws[i] || {}).angle_to_next_deg); return Number.isFinite(a) ? a : 90; };
    for (let i = 0; i < n - 1; i++) if (Math.abs(ang(i) - 90) <= 15) out.push([i, i + 1]);
    if (n >= 3 && Math.abs(ang(n - 1) - 90) <= 15) {
      let x = 0, z = 0, dx = 1, dz = 0;
      for (let i = 0; i < n; i++) { const L = getProjectWallWidthMm(i); x += dx * L; z += dz * L; const t = (180 - ang(i)) * Math.PI / 180; const c = Math.cos(t), sn = Math.sin(t); [dx, dz] = [dx * c - dz * sn, dx * sn + dz * c]; }
      if (Math.hypot(x, z) < 80) out.push([n - 1, 0]);
    }
    return out;
  }
  const naParede = (wi, filtro) => projectSlots.filter((s) => Number(s.wall_index) === wi && !isFloorSlot(s) && filtro(s));
  const fimDe = (s) => (+s.x_mm || 0) + (+s.width_mm || 0);
  // vizinho imediato (mesma faixa de altura) pro lado de dentro da parede
  const vizinhoAntes = (s, lista) => lista.filter((o) => o !== s && fimDe(o) <= (+s.x_mm) + 1).sort((a, b) => fimDe(b) - fimDe(a))[0];
  const vizinhoDepois = (s, lista) => lista.filter((o) => o !== s && (+o.x_mm) >= fimDe(s) - 1).sort((a, b) => a.x_mm - b.x_mm)[0];

  // CANTO DOS AÉREOS — 3ª versão (10:49, 08/11). Matt: "aéreo uma verdadeira
  // bagunça… os fillers sendo colocados por afastamento da parede, no corner
  // isso deve ser desconsiderado. Coloca os módulos primeiro, depois os
  // fillers de fechamento. Ou melhor: um MÓDULO DE CANTO (oco com filler)
  // pra conectar um lado no outro… ainda não está escolhendo opção
  // customizada quando não cabe com as medidas standard."
  // Agora, em cada canto com aéreo raso nas duas paredes:
  //  1. o MÓDULO DE CANTO (catálogo, nome com "Corner Filler" / "Canto
  //     aéreo") entra no fim da parede A, largura = profundidade do aéreo da
  //     parede B + folga; sem ele no catálogo, o canto fica só com o espaço
  //     (e um aviso pra criar o módulo) — nada de filler solto afastado;
  //  2. os aéreos da linha de cada parede ENCOSTAM no canto (A termina no
  //     módulo; B começa em profundidade do A + folga), na mesma ordem;
  //  3. a ponta de longe da linha fica onde a SAHRA pôs (alinhada com o que
  //     ela planejou): sobra até 3" vira filler de fechamento (normal, na
  //     parede); sobra maior, ou falta, o aéreo da ponta vira AÉREO CUSTOM
  //     com a largura que fecha.
  const FECHA_FILLER_MAX = 3 * MM;
  const moduloCanto = (cat) => cat.find((m) => /corner\s*filler|filler\s*corner|canto\s*a[ée]reo|filler\s*de\s*canto|wall\s*corner\s*(oco|hollow|blank)/i.test(m.name));
  const fillerDe = (cat) => cat.find((m) => /filler/i.test(m.name) && /wall|a[ée]reo|upper/i.test([m.name, m.category, m.subcategory].join(' ')) && !moduloCanto([m]))
    || cat.find((m) => /filler/i.test([m.name, m.category].join(' ')) && !moduloCanto([m]));
  const corDe = (s) => { const c = Object.values(s.colorsByRole || {})[0]; return c && c.name; };
  // linha contínua de aéreos a partir do canto (vão < 40 mm conta como encostado)
  function linhaDoCanto(lista, doFim) {
    const ord = lista.slice().sort((a, b) => doFim ? fimDe(b) - fimDe(a) : a.x_mm - b.x_mm);
    const out = [ord[0]];
    for (let k = 1; k < ord.length; k++) {
      const ant = out[out.length - 1], cur = ord[k];
      const vao = doFim ? (+ant.x_mm) - fimDe(cur) : (+cur.x_mm) - fimDe(ant);
      if (vao > 40 || vao < -40) break;
      out.push(cur);
    }
    return out;
  }
  async function aereoCustom(s, largura, cat, avisos, nome) {
    const H = +s.height_mm || 0;
    const opc = cat.filter((m) => /custom/i.test([m.family, m.name].join(' ')) && /wall|a[ée]reo|upper/i.test([m.name, m.category, m.subcategory].join(' '))
      && !/filler|panel|painel|corner/i.test(m.name) && m.w && m.w[0] != null && m.w[2] != null && m.w[0] < m.w[2]
      && largura >= m.w[0] - 1 && largura <= m.w[2] + 1 && (!m.h || m.h[0] == null || (H >= m.h[0] - 1 && H <= (m.h[2] || H) + 1)));
    // portas parecidas com o padrão: mais de 24" → 2 portas
    const quer2 = largura > 24 * MM;
    const m = opc.find((x) => quer2 ? /2\s*(door|porta)|double|duas/i.test(x.name) : /1\s*(door|porta)|single|uma/i.test(x.name)) || opc[0];
    if (!m) { avisos.push(nome + ': precisa de aéreo de ' + (largura / MM).toFixed(1) + '" e não achei aéreo custom que chegue nessa largura.'); return false; }
    const cores = { colorsByRole: Object.assign({}, s.colorsByRole || {}) };
    const antes = (s.module && s.module.name) || 'aéreo';
    await editProjectAiApply([{ op: 'replace_module', reason: 'Aéreo custom pra fechar a linha', module_id: m.id, slot_ids: [String(s.id)], width_mm: Math.round(largura), height_mm: H, depth_mm: +s.depth_mm }]);
    try { if (typeof iaeCopyColors === 'function') iaeCopyColors(cores, s); } catch (e) { /* */ }
    return antes + ' → ' + m.name + ' ' + (largura / MM).toFixed(1) + '"';
  }
  async function fechaLinha(linha, doFim, ancora, pontaOriginal, wi, cat, avisos, diag, nome) {
    // encosta a linha na âncora (canto), na mesma ordem
    let pos = ancora;
    linha.forEach((s) => { if (doFim) { s.x_mm = Math.round(pos - (+s.width_mm)); pos = s.x_mm; } else { s.x_mm = Math.round(pos); pos = fimDe(s); } });
    const ponta = linha[linha.length - 1];
    const sobra = doFim ? (+ponta.x_mm) - pontaOriginal : pontaOriginal - fimDe(ponta);
    if (Math.abs(sobra) <= 3) return;
    if (sobra > 0 && sobra <= FECHA_FILLER_MAX) {
      const f = fillerDe(cat);
      if (!f) { avisos.push(nome + ': sobra de ' + (sobra / MM).toFixed(1) + '" sem filler no catálogo.'); return; }
      const sl = await insertProjectModuleDefault(f.id, { wall_index: wi, x_mm: Math.round(doFim ? pontaOriginal : fimDe(ponta)), width_mm: Math.round(sobra), height_mm: ponta.height_mm, floor_height_mm: ponta.floor_height_mm });
      if (sl) { sl.x_mm = Math.round(doFim ? pontaOriginal : fimDe(ponta)); sl.floor_height_mm = ponta.floor_height_mm; if (corDe(ponta)) iaeOpSetColor({ slot_ids: [String(sl.id)], color_name: corDe(ponta) }, avisos); recomputeProjectSlotPricing(sl); }
      diag.push(nome + ': filler de fechamento de ' + (sobra / MM).toFixed(1) + '" na ponta da linha.');
      return;
    }
    // sobra grande ou falta: o aéreo da ponta vira custom com a largura que fecha
    const nova = (+ponta.width_mm) + sobra;
    const avisosTeste = [];
    const r = await aereoCustom(ponta, nova, cat, avisosTeste, nome);
    if (r) {
      if (doFim) ponta.x_mm = Math.round(pontaOriginal); // mantém a ponta de longe onde a SAHRA pôs
      diag.push(nome + ': ' + r + ' pra fechar a linha.');
      return;
    }
    // não coube num aéreo só: entra um aéreo custom NOVO do tamanho da sobra
    if (sobra > 0) {
      const novo = await novoAereoCustom(ponta, sobra, doFim ? pontaOriginal : fimDe(ponta), wi, cat);
      if (novo) { diag.push(nome + ': aéreo custom novo de ' + (sobra / MM).toFixed(1) + '" (' + novo + ') pra fechar a linha.'); return; }
    }
    avisos.push(...avisosTeste);
  }
  async function novoAereoCustom(ref, largura, x, wi, cat) {
    const H = +ref.height_mm || 0;
    const opc = cat.filter((m) => /custom/i.test([m.family, m.name].join(' ')) && /wall|a[ée]reo|upper/i.test([m.name, m.category, m.subcategory].join(' '))
      && !/filler|panel|painel|corner/i.test(m.name) && m.w && m.w[0] != null && m.w[2] != null && m.w[0] < m.w[2]
      && largura >= m.w[0] - 1 && largura <= m.w[2] + 1);
    const m = opc.find((y) => largura > 24 * MM ? /2\s*(door|porta)|double|duas/i.test(y.name) : /1\s*(door|porta)|single|uma/i.test(y.name)) || opc[0];
    if (!m) return null;
    const sl = await insertProjectModuleDefault(m.id, { wall_index: wi, x_mm: Math.round(x), width_mm: Math.round(largura), height_mm: H, floor_height_mm: ref.floor_height_mm });
    if (!sl) return null;
    sl.x_mm = Math.round(x); sl.floor_height_mm = ref.floor_height_mm;
    try { sl.depth_mm = projectSlotClampedDimensionMm(sl, 'depth', +ref.depth_mm); } catch (e) { /* */ }
    if (corDe(ref)) iaeOpSetColor({ slot_ids: [String(sl.id)], color_name: corDe(ref) }, []);
    recomputeProjectSlotPricing(sl);
    return m.name;
  }
  async function cantoAereos(r, cat, avisos, diag) {
    const mc = moduloCanto(cat);
    let feitos = 0;
    for (const [i, j] of cantosDoAmbiente(r)) {
      const nome = 'Canto paredes ' + (i + 1) + '/' + (j + 1);
      const L = getProjectWallWidthMm(i);
      const listaA = naParede(i, ehAereoRaso), listaB = naParede(j, ehAereoRaso);
      if (!listaA.length || !listaB.length) { diag.push(nome + ' (aéreos): ' + (!listaA.length && !listaB.length ? 'sem aéreo raso nas duas paredes' : 'aéreo raso só numa das paredes') + ', nada a fazer.'); continue; }
      const linhaA = linhaDoCanto(listaA, true), linhaB = linhaDoCanto(listaB, false);
      const A0 = linhaA[0], B0 = linhaB[0];
      const DA = +A0.depth_mm, DB = +B0.depth_mm;
      const pontaA = +linhaA[linhaA.length - 1].x_mm, pontaB = fimDe(linhaB[linhaB.length - 1]);
      // 1) módulo de canto (oco, com os fillers) no fim da parede A
      const larguraCanto = Math.round(DB + CANTO_FOLGA_MM);
      if (mc) {
        const sl = await insertProjectModuleDefault(mc.id, { wall_index: i, x_mm: Math.round(L - larguraCanto), width_mm: larguraCanto, height_mm: A0.height_mm, floor_height_mm: A0.floor_height_mm });
        if (sl) {
          sl.x_mm = Math.round(L - larguraCanto); sl.floor_height_mm = A0.floor_height_mm;
          try { sl.depth_mm = projectSlotClampedDimensionMm(sl, 'depth', DA); } catch (e) { /* */ }
          if (corDe(A0)) iaeOpSetColor({ slot_ids: [String(sl.id)], color_name: corDe(A0) }, avisos);
          recomputeProjectSlotPricing(sl);
          if (Math.abs((+sl.width_mm) - larguraCanto) > 2) avisos.push(nome + ': o módulo de canto não aceitou ' + (larguraCanto / MM).toFixed(1) + '" de largura (ficou ' + ((+sl.width_mm) / MM).toFixed(1) + '"). Libere a largura no cadastro.');
        }
      } else {
        avisos.push(nome + ': falta o MÓDULO DE CANTO DO AÉREO no catálogo (nome com "Corner Filler"). O canto ficou só com o espaço, sem os fillers.');
      }
      // 2) e 3) linhas encostadas no canto + fechamento na ponta de longe
      await fechaLinha(linhaA, true, L - larguraCanto, pontaA, i, cat, avisos, diag, nome + ' parede ' + (i + 1));
      await fechaLinha(linhaB, false, Math.round(DA + CANTO_FOLGA_MM), pontaB, j, cat, avisos, diag, nome + ' parede ' + (j + 1));
      diag.push(nome + ' (aéreos): ' + (mc ? mc.name + ' de ' + (larguraCanto / MM).toFixed(1) + '"' : 'canto livre') + '; aéreos encostados no canto.');
      feitos++;
    }
    return feitos;
  }

  // CANTO DAS BASES (10:24: "o blind corner de baixo também não seguiu a
  // regra"). A IA levou as bases das duas paredes até o canto, uma entrando
  // na outra, sem blind — e a correção antiga só virava um blind que já
  // existisse. Agora, em cada canto com base nas duas paredes:
  //  · se uma delas é blind corner, ela fica com o lado cego pro canto, a
  //    4 3/4" da parede, e a da outra parede começa na frente dela
  //    (profundidade + o filler de 3/4" do blind);
  //  · se nenhuma é, a última base da parede A vira o blind corner do lado
  //    certo com a largura mais parecida, e a da parede B anda pra frente.
  const ehBaseCorpo = (s) => s && !isFloorSlot(s) && (+s.floor_height_mm || 0) < 50 && (+s.depth_mm || 0) > 450
    && !/filler|panel|painel|cover|toe|rodap/i.test(String((s.module && s.module.name) || ''));
  async function cantoBases(r, cat, avisos, diag) {
    let feitos = 0;
    const blinds = cat.filter((m) => /blind/i.test(m.name) && !/wall|a[ée]reo|upper/i.test([m.name, m.category].join(' ')));
    for (const [i, j] of cantosDoAmbiente(r)) {
      const nome = 'Canto paredes ' + (i + 1) + '/' + (j + 1);
      const L = getProjectWallWidthMm(i);
      const listaA = naParede(i, ehBaseCorpo), listaB = naParede(j, ehBaseCorpo);
      let A = listaA.sort((a, b) => fimDe(b) - fimDe(a))[0];
      let B = listaB.sort((a, b) => a.x_mm - b.x_mm)[0];
      if (!A || !B) { diag.push(nome + ' (bases): ' + (!A && !B ? 'sem base nas duas paredes' : 'base só numa das paredes') + ', nada a fazer.'); continue; }
      const DA = +A.depth_mm, DB = +B.depth_mm;
      const choca = fimDe(A) > L - DB + 1 && (+B.x_mm) < DA - 1;
      const biA = projectSlotBlindInfo(A), biB = projectSlotBlindInfo(B);
      if (!choca && !biA && !biB) { diag.push(nome + ' (bases): não se cruzam no canto, nada a fazer.'); continue; }
      let alvo = biA ? 'A' : biB ? 'B' : 'A';
      if (!biA && !biB) {
        // vira blind: o da parede A, lado direito (canto no fim da parede A)
        const opc = blinds.filter((m) => ladoDoNome(m.name) === 'D');
        const larg = +A.width_mm || 914;
        const m = opc.sort((a, b) => Math.abs((a.w[1] || 0) - larg) - Math.abs((b.w[1] || 0) - larg))[0];
        if (!m) { avisos.push(nome + ': as bases se cruzam no canto e não achei blind corner direito no catálogo.'); diag.push(nome + ' (bases): sem blind no catálogo.'); continue; }
        const nomeAntes = (A.module && A.module.name) || 'base';
        const cores = { colorsByRole: Object.assign({}, A.colorsByRole || {}) };
        await editProjectAiApply([{ op: 'replace_module', reason: 'Canto de base vira blind corner', module_id: m.id, slot_ids: [String(A.id)] }]);
        try { if (typeof iaeCopyColors === 'function') iaeCopyColors(cores, A); } catch (e) { /* */ }
        diag.push(nome + ' (bases): ' + nomeAntes + ' virou ' + m.name + ' (lado cego pro canto).');
      }
      // posiciona o blind e afasta a base da outra parede
      const FILLER_T = 19.5;
      if (alvo === 'A') {
        const bi = projectSlotBlindInfo(A) || { afastar: 120.65, lado: 'D' };
        if (bi.lado !== 'D') { diag.push(nome + ' (bases): blind da parede ' + (i + 1) + ' com lado errado — vai pela troca de lado.'); }
        A.x_mm = Math.round(L - bi.afastar - (+A.width_mm));
        const novoXB = Math.round(DA + FILLER_T);
        if ((+B.x_mm) < novoXB) { const d = novoXB - B.x_mm; listaB.filter((o) => (+o.x_mm) >= (+B.x_mm) - 1).forEach((o) => { o.x_mm = Math.round((+o.x_mm) + d); }); }
      } else {
        const bi = projectSlotBlindInfo(B) || { afastar: 120.65, lado: 'E' };
        B.x_mm = Math.round(bi.afastar);
        const novoFimA = Math.round(L - DB - FILLER_T);
        if (fimDe(A) > novoFimA) { const d = fimDe(A) - novoFimA; listaA.filter((o) => fimDe(o) <= fimDe(A) + 1).forEach((o) => { o.x_mm = Math.round((+o.x_mm) - d); }); }
      }
      [A, B].forEach((s) => { try { recomputeProjectSlotPricing(s); } catch (e) { /* */ } });
      const lista = alvo === 'A' ? listaB : listaA;
      lista.forEach((s) => { if (projectSlotOverlapsNeighbor(s, +s.x_mm)) avisos.push(nome + ': ' + ((s.module && s.module.name) || 'base') + ' encostou no vizinho depois de abrir o canto; confira a parede ' + (Number(s.wall_index) + 1) + '.'); });
      const fimB = Math.max(...listaB.map(fimDe)); const LB = getProjectWallWidthMm(j);
      if (fimB > LB + 1) avisos.push(nome + ': a linha de bases da parede ' + (j + 1) + ' passou do fim da parede em ' + Math.round((fimB - LB) / MM) + '". Tire ou troque uma base.');
      diag.push(nome + ' (bases): blind com o lado cego no canto, a 4 3/4" da parede; a base da outra parede começa na frente dele.');
      feitos++;
    }
    return feitos;
  }

  // ---- BLIND CORNER DO LADO CERTO (10:11, 08/11) ----
  // Matt: "o blind corner de base entra invertido… ele tem o direito e o
  // esquerdo, teria que trocar ele, espelhar ele". O lado cego tem que ficar
  // virado pro canto: perto do FIM da parede → versão Dir; perto do COMEÇO →
  // Esq (mesma regra de nome da migration 241: "dir" no nome = lado D).
  const ladoDoNome = (nome) => (/dir\b|direit|right/i.test(String(nome || '')) ? 'D' : 'E');
  const semLado = (nome) => String(nome || '').toLowerCase().replace(/\b(esq(uerd[ao])?|dir(eit[ao])?|left|right)\b\.?/g, '').replace(/[\s·()-]+/g, ' ').trim();
  async function blindDoLadoCerto(cat, avisos) {
    let trocas = 0;
    for (const s of projectSlots.slice()) {
      if (isFloorSlot(s) || typeof projectSlotBlindInfo !== 'function') continue;
      const bi = projectSlotBlindInfo(s); if (!bi) continue;
      const L = getProjectWallWidthMm(Number(s.wall_index) || 0);
      const quer = (L - (+s.x_mm + +s.width_mm)) < (+s.x_mm) ? 'D' : 'E';
      if (bi.lado === quer) continue;
      const nome = (s.module && s.module.name) || '';
      const gemeo = cat.find((m) => String(m.id) !== String(s.module && s.module.id) && /blind/i.test(m.name)
        && semLado(m.name) === semLado(nome) && ladoDoNome(m.name) === quer);
      if (!gemeo) { avisos.push(nome + ': está com o lado cego virado pro lado errado e não achei a versão ' + (quer === 'D' ? 'direita' : 'esquerda') + ' no catálogo.'); continue; }
      const cores = { colorsByRole: Object.assign({}, s.colorsByRole || {}) };
      await editProjectAiApply([{ op: 'replace_module', reason: 'Blind corner do lado certo', module_id: gemeo.id, slot_ids: [String(s.id)] }]);
      try { if (typeof iaeCopyColors === 'function') iaeCopyColors(cores, s); } catch (e) { /* fica a cor padrão */ }
      // encosta o lado cego no canto, no afastamento padrão (4 3/4")
      const xAntes = +s.x_mm;
      if (!SEM_DESLOCAR) {
        const af = (projectSlotBlindInfo(s) || { afastar: 120.65 }).afastar;
        const x = quer === 'D' ? Math.round(L - af - (+s.width_mm)) : Math.round(af);
        if (!projectSlotOverlapsNeighbor(s, x)) s.x_mm = x;
        try { clampProjectSlotPosition(s); } catch (e) { /* ok */ }
      } else s.x_mm = xAntes;
      try { recomputeProjectSlotPricing(s); } catch (e) { /* ok */ }
      trocas++;
    }
    return trocas;
  }

  async function aplicaModulos(r, cat, nParedes) {
    const porId = new Map(cat.map((m) => [String(m.id), m]));
    const falhas = [], avisos = [], relatorio = [];
    const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : undefined);
    const mods = (r.modules || []).filter((m) => m && typeof m === 'object');
    alinhaGrupos(mods, cat);
    let ok = 0;
    const criados = [];
    for (const m of mods) {
      const antes = new Set(projectSlots.map((x) => x.id));
      const wi = Number(m.wall_index);
      const nome = m.item || m.module_id || 'item';
      if (!(wi >= 0 && wi < nParedes)) { falhas.push({ item: nome, motivo: 'parede inválida' }); continue; }
      try {
        if (m.caixa) {
          await aplicaCaixa(m, cat, wi, avisos);
          { const novo = projectSlots.find((x) => !antes.has(x.id)); if (novo) criados.push([novo, m]); }
          relatorio.push({ item: nome, grupo: m.grupo || '', usado: 'Caixa ' + m.caixa + ' (Construtor)' + (m.portas ? ' · ' + m.portas + ' porta(s)' : '') + (m.modelo_porta ? ' ' + m.modelo_porta : '') + (m.led ? ' · LED' : ''), motivo: m.motivo || '' });
          ok++; continue;
        }
        const mod = porId.get(String(m.module_id));
        if (!mod) { falhas.push({ item: nome, motivo: 'módulo não existe no catálogo' }); continue; }
        if (m.piso) {
          await aplicaPiso(m, mod, wi, avisos);
        } else {
          const res = await editProjectAiApply([{ op: 'add_module', reason: nome, module_id: mod.id, wall_index: wi,
            x_mm: Math.max(0, num(m.x_mm) || 0), floor_height_mm: Math.max(0, num(m.floor_height_mm) || 0),
            width_mm: num(m.width_mm), height_mm: num(m.height_mm), depth_mm: num(m.depth_mm),
            color_name: m.color_name || null, slot_ids: [] }]);
          avisos.push(...(res.warnings || []));
          if (!(res.results && res.results[0] && res.results[0].ok)) { falhas.push({ item: nome, motivo: 'o portal não conseguiu inserir' }); continue; }
        }
        relatorio.push({ item: nome, grupo: m.grupo || '', usado: mod.name + (m.piso ? ' (piso)' : ''), motivo: m.motivo || '' });
        ok++;
        const novo = projectSlots.find((x) => !antes.has(x.id)); if (novo) criados.push([novo, m]);
      } catch (e) {
        console.error('[sahra-fluxo] montar', m, e);
        falhas.push({ item: nome, motivo: (e && e.message) || String(e) });
      }
    }
    // POSIÇÃO DO VIRTUAL, SEM DESLOCAR: o portal clampa/encaixa ao inserir;
    // aqui cada módulo volta exatamente pro x/altura que o virtual mandou.
    criados.forEach(([sl, m]) => {
      if (m.piso || isFloorSlot(sl)) return;
      sl.wall_index = m.wall_index;
      if (Number.isFinite(+m.x_mm)) sl.x_mm = +m.x_mm;
      if (Number.isFinite(+m.floor_height_mm)) sl.floor_height_mm = Math.max(0, +m.floor_height_mm);
      if (m.geladeira) {
        try { sl.depth_mm = projectSlotClampedDimensionMm(sl, 'depth', PROF_AEREO_GELADEIRA_POL * MM); } catch (e) { sl.depth_mm = Math.round(PROF_AEREO_GELADEIRA_POL * MM); }
        if (+sl.depth_mm < PROF_AEREO_GELADEIRA_POL * MM - 2) avisos.push(m.item + ': aéreo da geladeira precisa de 24" de fundo, mas o módulo só aceita ' + (+sl.depth_mm / MM).toFixed(1) + '". Trocar por um aéreo que vá até 24" (ou caixa pelo Construtor).');
      }
      try { recomputeProjectSlotPricing(sl); } catch (e) { /* */ }
    });
    return { ok, falhas, avisos, relatorio };
  }

  window.sahraFluxoMontar = async function (h) {
    if (montando) return { ok: false, erro: 'Já estou montando um projeto.' };
    if (!h || !h.proposta || !Array.isArray(h.proposta.paredes)) return { ok: false, erro: 'Projeto virtual vazio.' };
    if (typeof projectPhotoWallsToSegments !== 'function' || typeof editProjectAiApply !== 'function' || typeof buildProjectPhotoCatalog !== 'function') {
      return { ok: false, erro: 'O portal ainda não carregou a tela de Projetos. Recarregue e tente de novo.' };
    }
    if (projectSlots.length && !confirm('O canvas de Projetos tem um projeto aberto. A SAHRA vai começar um projeto novo no lugar dele (o que não foi salvo se perde). Continuar?')) {
      return { ok: false, erro: 'Cancelado: havia um projeto aberto no canvas.' };
    }
    montando = true;
    let colisaoAntes = null;
    if (overlay) overlay.style.display = 'none';
    irParaProjetos();
    mostraCard('<b>SAHRA · montando no portal</b><br><span>' + escH(h.titulo || 'Projeto') + '</span><br><span style="color:#6e675e">Lendo o catálogo e seguindo as etapas de "Montar no portal". Pode levar até 2 minutos.</span>');
    try {
      let [cat, cores] = await Promise.all([buildProjectPhotoCatalog(), buildProjectPhotoColorList().catch(() => [])]);
      if (!cat.length) throw new Error('catálogo vazio');
      let sub = candidatos(h, cat, 6);
      if (sub.length < 5) sub = cat.slice(0, 250); // virtual sem tipos reconhecíveis: vai um pedaço do catálogo
      console.info('[sahra-fluxo] montar: ' + sub.length + ' módulos candidatos de ' + cat.length);
      const itens = itensDoVirtual(h.proposta);
      if (!itens.length) throw new Error('o projeto virtual não tem itens pra montar');
      const plWalls = paredesDaPlanta(h.ficha && h.ficha.planta);
      let esc, model;
      try {
        ({ data: esc, model } = await chamaIA(promptEscolha(h, itens, sub, cores, 6, plWalls)));
      } catch (e1) {
        if (!/demorou|timeout|504/i.test(String(e1 && e1.message))) throw e1;
        mostraCard('<b>SAHRA · montando no portal</b><br><span style="color:#6e675e">Demorou na primeira tentativa. Tentando de novo com menos opções por item…</span>');
        sub = candidatos(h, cat, 3);
        ({ data: esc, model } = await chamaIA(promptEscolha(h, itens, sub, cores, 3, plWalls)));
      }
      const r = montaDoVirtual(h, itens, esc || {}, cat, plWalls);
      // COLISÃO DESLIGADA durante a montagem (volta como estava no fim)
      try { colisaoAntes = projectCollisionEnabled; projectCollisionEnabled = false; } catch (e) { /* */ }
      // projeto novo, sem pedir confirmação de novo (já confirmamos acima)
      projectSlots = [];
      if (typeof resetProject === 'function') resetProject();
      const nParedes = aplicaParedes(r);
      const etapa = ETAPAS_MONTAR.includes(h.etapa) ? h.etapa : 'tudo';
      const diag = [], avisosEtapa = [...(r._avisos || [])];
      // 1 · cantos (sempre primeiro)
      let blocos = [];
      if (etapa !== 'paredes') try { blocos = await etapaCantos(r, cat, avisosEtapa, diag); } catch (e) { console.error('[sahra-fluxo] cantos', e); avisosEtapa.push('Cantos: ' + ((e && e.message) || e)); }
      if (!cantosDoAmbiente(r).length) diag.push('Nenhum canto de 90° entre paredes seguidas.');
      // 2..5 · camadas até a etapa pedida, encostadas nos cantos
      const camadas = CAMADAS_ATE[etapa];
      const daEtapa = (r.modules || []).filter((m) => camadas.includes(m.camada));
      encostaNosCantos(daEtapa, blocos, avisosEtapa, diag);
      const mods = await aplicaModulos(Object.assign({}, r, { modules: daEtapa }), cat, nParedes);
      mods.avisos.push(...avisosEtapa);
      if (etapa !== 'tudo') diag.push('Montado até a etapa ' + NOME_ETAPA[etapa] + '. As próximas ficaram de fora de propósito.');
      try { const nB = await blindDoLadoCerto(cat, mods.avisos); if (nB) diag.push('Blind corner: ' + nB + ' trocado(s) pela versão do outro lado.'); } catch (e) { /* */ }
      console.info('[sahra-fluxo] cantos:', diag);
      diag.forEach((d) => mods.relatorio.push({ item: 'Regra de canto', grupo: '', usado: d, motivo: '' }));
      renderProjectCanvas();
      if (typeof markProjectDirty === 'function') markProjectDirty();
      const naoVirou = [...(r.nao_virou || []), ...mods.falhas];
      const resultado = {
        ok: true, quando: new Date().toISOString(), model, paredes: nParedes, modulos: mods.ok,
        nao_virou: naoVirou, avisos: mods.avisos, etapas: r.etapas || [], mensagem: r.mensagem || '', relatorio: mods.relatorio || []
      };
      const lista = (arr, f) => arr.length ? '<ul style="margin:6px 0 0 16px;padding:0">' + arr.slice(0, 12).map((x) => '<li>' + f(x) + '</li>').join('') + '</ul>' : '';
      mostraCard('<b>Projeto montado no canvas</b><br>' + nParedes + ' parede(s) · ' + mods.ok + ' módulo(s).'
        + (resultado.mensagem ? '<p style="margin:6px 0 0">' + escH(resultado.mensagem) + '</p>' : '')
        + (naoVirou.length ? '<p style="margin:8px 0 0"><b>O que não virou</b></p>' + lista(naoVirou, (x) => escH(x.item) + ' <span style="color:#6e675e">— ' + escH(x.motivo) + '</span>') : '')
        + (mods.avisos.length ? '<p style="margin:8px 0 0"><b>Avisos do portal</b></p>' + lista(mods.avisos, escH) : '')
        + '<p style="margin:8px 0 0;color:#6e675e">Confira e salve em Meus Projetos. Nada foi salvo sozinho.</p>',
        [{ t: 'Voltar pra SAHRA', f: () => { fechaCard(); abrir(); } }, { t: 'Ok', primario: true, f: fechaCard }]);
      return resultado;
    } catch (e) {
      const msg = (e && e.message) || String(e);
      mostraCard('<b>Não consegui montar</b><br>' + escH(msg), [{ t: 'Voltar pra SAHRA', f: () => { fechaCard(); abrir(); } }, { t: 'Fechar', primario: true, f: fechaCard }]);
      return { ok: false, erro: msg };
    } finally {
      montando = false;
      try { if (colisaoAntes !== null) projectCollisionEnabled = colisaoAntes; } catch (e) { /* */ }
    }
  };

  function criarBotao() {
    if (document.getElementById('po-sahra-fluxo-btn')) return true;
    const nav = document.getElementById('po-sidebar');
    if (!nav) return false;
    const b = document.createElement('button');
    b.type = 'button';
    b.id = 'po-sahra-fluxo-btn';
    b.textContent = 'SAHRA · Fluxo';
    b.title = 'Fluxo da SAHRA (teste, só administrador)';
    b.style.cssText = 'background:transparent;border:0;border-radius:0;padding:10px 4px;margin:0 10px;font:inherit;font-size:14px;font-weight:500;color:#7a4a22;cursor:pointer;white-space:nowrap;';
    b.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); abrir(); });
    nav.appendChild(b);
    return true;
  }
  function removerBotao() {
    const b = document.getElementById('po-sahra-fluxo-btn'); if (b) b.remove();
    if (overlay) { overlay.remove(); overlay = null; }
  }

  // ---- BOTÃO "INVERTER" NO BLIND CORNER (11:00, 08/11) ----
  // Matt: "blind corner coloca opção de inverter módulo, já que não está
  // selecionando o módulo certo". Na barrinha do módulo selecionado (⧉ ✎ ×…),
  // quando ele é blind corner, aparece ⇆: troca pela versão do outro lado
  // (o par Esq/Dir do catálogo), mantém medidas e cor, e encosta o lado cego
  // no canto mais perto. Desfazer (Ctrl+Z) volta.
  function gemeoBlind(slot) {
    const mod = slot && slot.module; if (!mod) return null;
    const lado = ladoDoNome(mod.name);
    return (allModules || []).find((m) => m && m.active !== false && String(m.id) !== String(mod.id) && /blind/i.test(m.name || '')
      && semLado(m.name) === semLado(mod.name) && ladoDoNome(m.name) !== lado
      && (!mod.family_id || !m.family_id || m.family_id === mod.family_id)) || null;
  }
  async function inverterBlind() {
    const slot = projectSlots.find((s) => s.id === selectedProjectSlotId);
    if (!slot || typeof projectSlotBlindInfo !== 'function' || !projectSlotBlindInfo(slot)) return;
    const gem = gemeoBlind(slot);
    if (!gem) { alert('Não achei a versão do outro lado deste blind corner no catálogo.'); return; }
    if (typeof pushProjectUndoState === 'function') pushProjectUndoState();
    const cores = { colorsByRole: Object.assign({}, slot.colorsByRole || {}) };
    const L = getProjectWallWidthMm(Number(slot.wall_index) || 0);
    const pertoDoFim = (L - fimDe(slot)) < (+slot.x_mm || 0);
    await editProjectAiApply([{ op: 'replace_module', reason: 'Inverter blind corner', module_id: gem.id, slot_ids: [String(slot.id)] }]);
    try { if (typeof iaeCopyColors === 'function') iaeCopyColors(cores, slot); } catch (e) { /* */ }
    const bi = projectSlotBlindInfo(slot) || { afastar: 120.65, lado: ladoDoNome(gem.name) };
    // lado cego no canto onde ele está
    if (bi.lado === 'D' && pertoDoFim) slot.x_mm = Math.round(L - bi.afastar - (+slot.width_mm));
    else if (bi.lado === 'E' && !pertoDoFim) slot.x_mm = Math.round(bi.afastar);
    try { clampProjectSlotPosition(slot); recomputeProjectSlotPricing(slot); } catch (e) { /* */ }
    renderProjectCanvas();
    if (typeof renderProjectConfigPanel === 'function') renderProjectConfigPanel();
    if (typeof markProjectDirty === 'function') markProjectDirty();
  }
  function botaoInverter() {
    const bar = document.getElementById('po-proj-slot-actions'); if (!bar) return;
    let b = document.getElementById('po-proj-slot-blind-flip-btn');
    const slot = (typeof selectedProjectSlotId !== 'undefined' && selectedProjectSlotId != null) ? projectSlots.find((s) => s.id === selectedProjectSlotId) : null;
    const eh = !!slot && typeof projectSlotBlindInfo === 'function' && !!projectSlotBlindInfo(slot);
    if (!eh) { if (b) b.style.display = 'none'; return; }
    if (!b) {
      b = document.createElement('button');
      b.type = 'button'; b.id = 'po-proj-slot-blind-flip-btn'; b.className = 'po-proj-slot-action-btn';
      b.textContent = '⇆'; b.title = 'Inverter blind corner (lado cego pro outro lado)'; b.setAttribute('aria-label', b.title);
      b.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); inverterBlind(); });
      const rem = document.getElementById('po-proj-slot-remove-btn');
      if (rem) bar.insertBefore(b, rem); else bar.appendChild(b);
    }
    b.style.display = '';
  }
  setInterval(() => { try { if (typeof projectSlots !== 'undefined') botaoInverter(); } catch (e) { /* tela de projetos ainda não carregou */ } }, 400);

  // LEGNO_IS_ADMIN é preenchido depois do login (portal-26); confere de tempos em tempos.
  setInterval(() => {
    if (window.LEGNO_IS_ADMIN === true) criarBotao(); else removerBotao();
  }, 1500);
})();
