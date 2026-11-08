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

  const VERSAO = '202611081115';
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
- ILHA/PENÍNSULA (módulo solto no piso): use "piso": {"afastamento_mm": distância da parede de referência até a costa do módulo, "frente": "ambiente" ou "parede"}; "wall_index" e "x_mm" contam a partir dessa parede.
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
      lista.filter((m) => ehPainel(m, cat)).forEach((pn) => { pn.floor_height_mm = y0; pn.height_mm = y1 - y0; if (dMax) pn.depth_mm = dMax + MM; });
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
    let deg = (g.rotationY * 180 / Math.PI) + (/parede|wall/i.test(m.piso.frente || '') ? 180 : 0);
    slot.floor_rotation_deg = Math.round((((deg % 360) + 540) % 360 - 180) * 10) / 10;
    if (+m.depth_mm) slot.depth_mm = projectSlotClampedDimensionMm(slot, 'depth', D);
    if (m.color_name) iaeOpSetColor({ slot_ids: [String(slot.id)], color_name: m.color_name }, avisos);
    if (typeof iaeAfterGeometry === 'function') iaeAfterGeometry(slot);
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
  async function cantoAereos(r, cat, avisos) {
    const n = projectWallSegments.length;
    const filler = cat.find((m) => /filler/i.test(m.name) && /wall|a[ée]reo|upper/i.test([m.name, m.category, m.subcategory].join(' ')))
      || cat.find((m) => /filler/i.test([m.name, m.category].join(' ')));
    let feitos = 0;
    for (let i = 0; i < n - 1; i++) {
      const ang = Number(((r.walls || [])[i] || {}).angle_to_next_deg);
      if (Number.isFinite(ang) && Math.abs(ang - 90) > 15) continue;
      const L = getProjectWallWidthMm(i);
      const A = projectSlots.filter((s) => Number(s.wall_index) === i && ehAereoRaso(s)).sort((a, b) => (b.x_mm + b.width_mm) - (a.x_mm + a.width_mm))[0];
      const B = projectSlots.filter((s) => Number(s.wall_index) === i + 1 && ehAereoRaso(s)).sort((a, b) => a.x_mm - b.x_mm)[0];
      if (!A || !B) continue;
      const DA = +A.depth_mm, DB = +B.depth_mm;
      // só mexe se os dois estão de fato no canto (dentro da zona do outro + 1 módulo)
      if ((A.x_mm + A.width_mm) < L - DB - 600 || B.x_mm > DA + 600) continue;
      const fimA = L - DB - CANTO_FOLGA_MM, iniB = DA + CANTO_FOLGA_MM;
      const xA = Math.round(fimA - A.width_mm), xB = Math.round(iniB);
      [[A, xA], [B, xB]].forEach(([s, x]) => {
        s.x_mm = x;
        if (projectSlotOverlapsNeighbor(s, x)) avisos.push('Canto dos aéreos (paredes ' + (i + 1) + '/' + (i + 2) + '): ' + ((s.module && s.module.name) || 'aéreo') + ' encostou no vizinho. Troque por aéreo custom e ajuste a largura.');
      });
      if (!filler) { avisos.push('Canto dos aéreos: não achei módulo de filler no catálogo; ficou sem os fillers da frente.'); feitos++; continue; }
      // filler da parede A: da lateral do aéreo até a face do filler da parede B
      // filler da parede B: da frente do aéreo A até a lateral do aéreo B (passa por cima da ponta do A)
      const ponha = async (wi, x, w, s, recuo) => {
        if (!(w > 5)) return;
        const f = await insertProjectModuleDefault(filler.id, { wall_index: wi, x_mm: Math.round(x), width_mm: Math.round(w), height_mm: s.height_mm, floor_height_mm: s.floor_height_mm });
        if (!f) { avisos.push('Canto dos aéreos: o portal não criou o filler.'); return null; }
        f.x_mm = Math.round(x); f.floor_height_mm = s.floor_height_mm;
        f.fineOffsetZMm = Math.round(recuo);
        try { f.depth_mm = projectSlotClampedDimensionMm(f, 'depth', 19); } catch (e) { /* fica a do cadastro */ }
        const cor = Object.values(s.colorsByRole || {})[0];
        if (cor && cor.name) iaeOpSetColor({ slot_ids: [String(f.id)], color_name: cor.name }, avisos);
        recomputeProjectSlotPricing(f);
        return f;
      };
      const fB = await ponha(i + 1, DA, xB - DA, B, DB);
      const tB = fB ? (+fB.depth_mm || 19) : 19;
      await ponha(i, L - DB - tB - ((L - DB - tB) - (xA + A.width_mm)), (L - DB - tB) - (xA + A.width_mm), A, DA);
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
      const af = (projectSlotBlindInfo(s) || { afastar: 120.65 }).afastar;
      const x = quer === 'D' ? Math.round(L - af - (+s.width_mm)) : Math.round(af);
      if (!projectSlotOverlapsNeighbor(s, x)) s.x_mm = x;
      try { clampProjectSlotPosition(s); recomputeProjectSlotPricing(s); } catch (e) { /* ok */ }
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
    for (const m of mods) {
      const wi = Number(m.wall_index);
      const nome = m.item || m.module_id || 'item';
      if (!(wi >= 0 && wi < nParedes)) { falhas.push({ item: nome, motivo: 'parede inválida' }); continue; }
      try {
        if (m.caixa) {
          await aplicaCaixa(m, cat, wi, avisos);
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
      } catch (e) {
        console.error('[sahra-fluxo] montar', m, e);
        falhas.push({ item: nome, motivo: (e && e.message) || String(e) });
      }
    }
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
    if (overlay) overlay.style.display = 'none';
    irParaProjetos();
    mostraCard('<b>SAHRA · montando no portal</b><br><span>' + escH(h.titulo || 'Projeto') + '</span><br><span style="color:#6e675e">Lendo o catálogo e seguindo as etapas de "Montar no portal". Pode levar até 2 minutos.</span>');
    try {
      let [cat, cores] = await Promise.all([buildProjectPhotoCatalog(), buildProjectPhotoColorList().catch(() => [])]);
      if (!cat.length) throw new Error('catálogo vazio');
      let sub = candidatos(h, cat, 6);
      if (sub.length < 5) sub = cat.slice(0, 250); // virtual sem tipos reconhecíveis: vai um pedaço do catálogo
      console.info('[sahra-fluxo] montar: ' + sub.length + ' módulos candidatos de ' + cat.length);
      let r, model;
      try {
        ({ data: r, model } = await chamaIA(promptMontagem(h, sub, cores, 6)));
      } catch (e1) {
        if (!/demorou|timeout|504/i.test(String(e1 && e1.message))) throw e1;
        mostraCard('<b>SAHRA · montando no portal</b><br><span style="color:#6e675e">Demorou na primeira tentativa. Tentando de novo com menos opções por item…</span>');
        sub = candidatos(h, cat, 3);
        ({ data: r, model } = await chamaIA(promptMontagem(h, sub, cores, 3)));
      }
      // projeto novo, sem pedir confirmação de novo (já confirmamos acima)
      projectSlots = [];
      if (typeof resetProject === 'function') resetProject();
      const nParedes = aplicaParedes(r);
      const mods = await aplicaModulos(r, cat, nParedes);
      try {
        const nBlind = await blindDoLadoCerto(cat, mods.avisos);
        if (nBlind) mods.relatorio.push({ item: 'Blind corner', grupo: '', usado: nBlind + ' trocado(s) pela versão do outro lado', motivo: 'O lado cego fica virado pro canto' });
      } catch (e) { console.error('[sahra-fluxo] blind', e); mods.avisos.push('Blind corner: ' + ((e && e.message) || e)); }
      try {
        const nCantos = await cantoAereos(r, cat, mods.avisos);
        if (nCantos) mods.relatorio.push({ item: 'Canto dos aéreos', grupo: '', usado: nCantos + ' canto(s) com espaço morto + fillers na frente', motivo: 'Regra do canto: aéreo raso não leva blind/corner' });
      } catch (e) { console.error('[sahra-fluxo] canto dos aéreos', e); mods.avisos.push('Canto dos aéreos: ' + ((e && e.message) || e)); }
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

  // LEGNO_IS_ADMIN é preenchido depois do login (portal-26); confere de tempos em tempos.
  setInterval(() => {
    if (window.LEGNO_IS_ADMIN === true) criarBotao(); else removerBotao();
  }, 1500);
})();
