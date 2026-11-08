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

  const VERSAO = '202611080900';
  let overlay = null;

  function abrir() {
    if (overlay) { overlay.style.display = 'flex'; return; }
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
- "color_name" tem que ser um nome EXATO da lista de CORES, ou null.
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
 "modules": [{"item": "rótulo/SKU do item do virtual", "wall_index": 0, "module_id": "id do catálogo", "x_mm": 0, "floor_height_mm": 0, "width_mm": 762, "height_mm": 876, "depth_mm": 610, "color_name": "nome exato ou null"}],
 "nao_virou": [{"item": "...", "motivo": "..."}],
 "etapas": [{"etapa": "nome da etapa", "decisao": "o que decidiu e qual saída tomou"}],
 "mensagem": "1 a 2 frases pro Matt sobre a montagem"}`;
  }

  async function chamaIA(prompt) {
    const resp = await supabaseClient.functions.invoke('sahra-fluxo', { body: { acao: 'json', prompt, modo: 'profundo' } });
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

  async function aplicaModulos(r, cat, nParedes) {
    const porId = new Map(cat.map((m) => [String(m.id), m]));
    const falhas = [];
    const ops = [];
    (r.modules || []).forEach((m) => {
      const mod = porId.get(String(m.module_id));
      if (!mod) { falhas.push({ item: m.item || m.module_id, motivo: 'módulo não existe no catálogo' }); return; }
      const wi = Number(m.wall_index);
      if (!(wi >= 0 && wi < nParedes)) { falhas.push({ item: m.item || mod.name, motivo: 'parede inválida' }); return; }
      const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : undefined);
      ops.push({
        op: 'add_module', reason: m.item || mod.name, module_id: mod.id, wall_index: wi,
        x_mm: Math.max(0, num(m.x_mm) || 0), floor_height_mm: Math.max(0, num(m.floor_height_mm) || 0),
        width_mm: num(m.width_mm), height_mm: num(m.height_mm), depth_mm: num(m.depth_mm),
        color_name: m.color_name || null, slot_ids: []
      });
    });
    const res = ops.length ? await editProjectAiApply(ops) : { results: [], warnings: [] };
    (res.results || []).forEach((x) => { if (!x.ok) falhas.push({ item: x.op.reason, motivo: 'o portal não conseguiu inserir' }); });
    const ok = (res.results || []).filter((x) => x.ok).length;
    return { ok, falhas, avisos: res.warnings || [] };
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
      const [cat, cores] = await Promise.all([buildProjectPhotoCatalog(), buildProjectPhotoColorList().catch(() => [])]);
      if (!cat.length) throw new Error('catálogo vazio');
      let prompt = promptMontagem(h, cat, cores, 8);
      if (prompt.length > 190000) prompt = promptMontagem(h, cat, cores, 2);
      if (prompt.length > 199000) prompt = promptMontagem(h, cat, cores, 0);
      const { data: r, model } = await chamaIA(prompt);
      // projeto novo, sem pedir confirmação de novo (já confirmamos acima)
      projectSlots = [];
      if (typeof resetProject === 'function') resetProject();
      const nParedes = aplicaParedes(r);
      const mods = await aplicaModulos(r, cat, nParedes);
      renderProjectCanvas();
      if (typeof markProjectDirty === 'function') markProjectDirty();
      const naoVirou = [...(r.nao_virou || []), ...mods.falhas];
      const resultado = {
        ok: true, quando: new Date().toISOString(), model, paredes: nParedes, modulos: mods.ok,
        nao_virou: naoVirou, avisos: mods.avisos, etapas: r.etapas || [], mensagem: r.mensagem || ''
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
