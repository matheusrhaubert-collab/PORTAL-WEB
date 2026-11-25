// ============================================================================
// portal-49-guia-componentes.js — "Qual a diferença?" na janela Add cabinet
// (2026-11-24, Matt: "um botão de comparação mostrando as diferenças, algo que
// os usuários possam tirar suas dúvidas" — cliente achava "Bottom · Bottom ·
// No back" e "Topcover · Bottom · No back" iguais).
//
// Botão #po-guia-btn ao lado do título da janela (#po-proj-search-modal) abre
// a janela #po-guia com 2 abas:
//   1) Como ler o nome — cada parte do nome (em cima · embaixo · fundo) com o
//      desenho REAL de um módulo de exemplo (vista de frente + de lado) e a
//      parte destacada. Os desenhos saem das peças do cadastro
//      (loadRecursivePiecesForModule + resolvePiecesForViewer), então módulo
//      mudado no ERP já aparece certo aqui.
//   2) Comparar — 2 módulos lado a lado, mesmas medidas, peças que só existem
//      num deles em laranja + resumo em palavras ("Em cima: Bottom → Topcover").
// Não mexe em nenhum arquivo existente (só lê allModules, familiesCacheList,
// projSearchModal*Id, projectLibraryModules). Textos pt/en/es locais.
// Desligar: localStorage.legno_guia_off = '1'.
// ============================================================================
(function () {
  'use strict';
  try { if (localStorage.getItem('legno_guia_off') === '1') return; } catch (e) { /* segue */ }

  // ---------------- textos ----------------
  const TXT = {
    pt: {
      btn: 'Qual a diferença?', title: 'Entenda os módulos', tab_guide: 'Como ler o nome', tab_cmp: 'Comparar 2 módulos',
      intro: 'O nome de cada caixa tem 3 partes, separadas por “·”:',
      p_top: 'EM CIMA', p_base: 'EMBAIXO', p_back: 'FUNDO',
      ex: 'Exemplo: <b>Topcover · Toe 3 · No back</b> = tampo por cima das laterais · rodapé de 3" · sem fundo.',
      sec_top: '1ª parte — o que vai EM CIMA', sec_base: '2ª parte — o que vai EMBAIXO', sec_back: '3ª parte — o FUNDO (atrás)',
      front: 'De frente', side: 'De lado', frente: 'frente', tras: 'trás',
      top_Bottom: 'Tampo inteiro ENTRE as laterais. As laterais sobem até em cima, então de cima aparecem as bordas delas.',
      top_Topcover: 'Tampo inteiro POR CIMA das laterais, cobrindo as bordas. Em cima fica uma tampa lisa — bom quando o topo fica à vista.',
      top_Niche: 'Tampo REBAIXADO 60 mm, deixando um nicho aberto em cima.',
      top_Stretcher: 'SEM tampo inteiro: só travessas (réguas) em cima. Para receber bancada / pedra por cima.',
      top_Gola: 'SEM tampo: perfil em L na frente que vira o puxador (cava). Para portas e gavetas sem puxador.',
      base_Bottom: 'Base reta, a caixa apoia direto no chão. Sem pé e sem rodapé.',
      'base_Toe 3': 'Caixa levantada 3" (76 mm) com rodapé na frente e atrás. As laterais descem até o chão.',
      'base_Toe 4½': 'Caixa levantada 4½" (114 mm) com rodapé RECUADO da frente — espaço para o pé de quem usa (cozinha).',
      'base_Plastic feets 4 1/2': 'Caixa em cima de PÉS DE PLÁSTICO de 4½" (114 mm). As laterais não chegam no chão.',
      base_Topcover: 'Base POR BAIXO das laterais, cobrindo as bordas (o Topcover de cabeça para baixo). Sem pé.',
      back_Back: 'COM fundo: painel atrás, fechando a caixa.',
      'back_No back': 'SEM fundo: aberto atrás (fica contra a parede ou recebe outro painel).',
      cmp_a: 'Módulo A', cmp_b: 'Módulo B', cmp_hint: 'Mesmas medidas nos dois desenhos. Em laranja: peças que mudam (medida, posição ou que só um tem).',
      only_a: 'Diferente no A', only_b: 'Diferente no B', same: 'As peças são as mesmas — muda só a posição ou a medida.',
      diff_title: 'O que muda', no_diff: 'Os dois módulos têm exatamente as mesmas peças.',
      loading: 'Carregando desenho…', fail: 'Não deu para desenhar este módulo.',
      legend: 'Em verde: o que cada opção tem de diferente das outras da mesma parte.',
      zoom_top: 'canto de cima (de frente)', zoom_bottom: 'canto de baixo (de frente)',
      compare_this: 'Comparar', close: 'Fechar', sizes: 'Desenho com {w} × {h} × {d} mm',
      r_left: 'Lateral', r_right: 'Lateral', r_top: 'Tampo', r_bottom: 'Base', r_back: 'Fundo', r_baseboard: 'Rodapé', r_leg: 'Pé'
    },
    en: {
      btn: "What's the difference?", title: 'Understand the cabinets', tab_guide: 'How to read the name', tab_cmp: 'Compare 2 cabinets',
      intro: 'Each box name has 3 parts, separated by “·”:',
      p_top: 'TOP', p_base: 'BOTTOM', p_back: 'BACK',
      ex: 'Example: <b>Topcover · Toe 3 · No back</b> = top panel over the sides · 3" toe kick · no back panel.',
      sec_top: '1st part — what goes on TOP', sec_base: '2nd part — what goes at the BOTTOM', sec_back: '3rd part — the BACK',
      front: 'Front view', side: 'Side view', frente: 'front', tras: 'back',
      top_Bottom: 'Full top panel set BETWEEN the sides. The sides run to the top, so their edges show on top.',
      top_Topcover: 'Full top panel OVER the sides, covering their edges. Clean top — good when the top is visible.',
      top_Niche: 'Top panel set DOWN 60 mm, leaving an open niche on top.',
      top_Stretcher: 'NO full top: only rails (stretchers) on top. Made to receive a countertop / stone.',
      top_Gola: 'NO top: an L profile at the front works as the handle (channel). For handleless doors and drawers.',
      base_Bottom: 'Flat bottom, the box sits right on the floor. No feet, no toe kick.',
      'base_Toe 3': 'Box raised 3" (76 mm) with a toe kick at the front and back. The sides go down to the floor.',
      'base_Toe 4½': 'Box raised 4½" (114 mm) with the toe kick SET BACK from the front — room for your feet (kitchens).',
      'base_Plastic feets 4 1/2': 'Box on 4½" (114 mm) PLASTIC FEET. The sides do not reach the floor.',
      base_Topcover: 'Bottom panel UNDER the sides, covering their edges (a Topcover upside down). No feet.',
      back_Back: 'WITH back: a panel closes the box at the back.',
      'back_No back': 'NO back: open at the back (goes against the wall or gets another panel).',
      cmp_a: 'Cabinet A', cmp_b: 'Cabinet B', cmp_hint: 'Same size in both drawings. In orange: parts that change (size, position, or only one has it).',
      only_a: 'Different in A', only_b: 'Different in B', same: 'Same parts — only their position or size changes.',
      diff_title: 'What changes', no_diff: 'Both cabinets have exactly the same parts.',
      loading: 'Loading drawing…', fail: 'Could not draw this cabinet.',
      legend: 'In green: what each option has that the others of the same part do not.',
      zoom_top: 'top corner (front)', zoom_bottom: 'bottom corner (front)',
      compare_this: 'Compare', close: 'Close', sizes: 'Drawn at {w} × {h} × {d} mm',
      r_left: 'Side', r_right: 'Side', r_top: 'Top', r_bottom: 'Bottom', r_back: 'Back panel', r_baseboard: 'Toe kick', r_leg: 'Foot'
    },
    es: {
      btn: '¿Cuál es la diferencia?', title: 'Entienda los módulos', tab_guide: 'Cómo leer el nombre', tab_cmp: 'Comparar 2 módulos',
      intro: 'El nombre de cada caja tiene 3 partes, separadas por “·”:',
      p_top: 'ARRIBA', p_base: 'ABAJO', p_back: 'FONDO',
      ex: 'Ejemplo: <b>Topcover · Toe 3 · No back</b> = tapa sobre los laterales · zócalo de 3" · sin fondo.',
      sec_top: '1ª parte — lo que va ARRIBA', sec_base: '2ª parte — lo que va ABAJO', sec_back: '3ª parte — el FONDO (atrás)',
      front: 'De frente', side: 'De lado', frente: 'frente', tras: 'atrás',
      top_Bottom: 'Tapa entera ENTRE los laterales. Los laterales suben hasta arriba y se ven sus cantos.',
      top_Topcover: 'Tapa entera SOBRE los laterales, cubriendo los cantos. Arriba queda liso — bueno si se ve la parte de arriba.',
      top_Niche: 'Tapa REBAJADA 60 mm, dejando un nicho abierto arriba.',
      top_Stretcher: 'SIN tapa entera: solo travesaños arriba. Para recibir encimera / piedra.',
      top_Gola: 'SIN tapa: perfil en L al frente que hace de tirador (gola). Para puertas y cajones sin tirador.',
      base_Bottom: 'Base recta, la caja apoya directo en el piso. Sin patas ni zócalo.',
      'base_Toe 3': 'Caja elevada 3" (76 mm) con zócalo adelante y atrás. Los laterales bajan hasta el piso.',
      'base_Toe 4½': 'Caja elevada 4½" (114 mm) con zócalo RETRAÍDO del frente — espacio para los pies (cocinas).',
      'base_Plastic feets 4 1/2': 'Caja sobre PATAS DE PLÁSTICO de 4½" (114 mm). Los laterales no llegan al piso.',
      base_Topcover: 'Base DEBAJO de los laterales, cubriendo los cantos (el Topcover al revés). Sin patas.',
      back_Back: 'CON fondo: panel atrás que cierra la caja.',
      'back_No back': 'SIN fondo: abierto atrás (va contra la pared o recibe otro panel).',
      cmp_a: 'Módulo A', cmp_b: 'Módulo B', cmp_hint: 'Mismas medidas en los dos dibujos. En naranja: piezas que cambian (medida, posición o que solo tiene uno).',
      only_a: 'Distinto en A', only_b: 'Distinto en B', same: 'Las piezas son las mismas — solo cambia la posición o la medida.',
      diff_title: 'Qué cambia', no_diff: 'Los dos módulos tienen exactamente las mismas piezas.',
      loading: 'Cargando dibujo…', fail: 'No se pudo dibujar este módulo.',
      legend: 'En verde: lo que cada opción tiene de distinto de las otras de la misma parte.',
      zoom_top: 'esquina de arriba (de frente)', zoom_bottom: 'esquina de abajo (de frente)',
      compare_this: 'Comparar', close: 'Cerrar', sizes: 'Dibujo con {w} × {h} × {d} mm',
      r_left: 'Lateral', r_right: 'Lateral', r_top: 'Tapa', r_bottom: 'Base', r_back: 'Fondo', r_baseboard: 'Zócalo', r_leg: 'Pata'
    }
  };
  const lang = () => { try { return (window.I18n && I18n.getLanguage && I18n.getLanguage()) || 'en'; } catch (e) { return 'en'; } };
  const t = (k, vars) => {
    const d = TXT[lang()] || TXT.en;
    let s = d[k] != null ? d[k] : (TXT.en[k] != null ? TXT.en[k] : k);
    Object.keys(vars || {}).forEach((v) => { s = s.split('{' + v + '}').join(vars[v]); });
    return s;
  };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const TOPS = ['Bottom', 'Topcover', 'Niche', 'Stretcher', 'Gola'];
  const BASES = ['Bottom', 'Toe 3', 'Toe 4½', 'Plastic feets 4 1/2', 'Topcover'];
  const BACKS = ['Back', 'No back'];
  const partes = (name) => String(name || '').split('·').map((s) => s.trim());

  // ---------------- peças → caixas (mm, referencial do módulo) ----------------
  const cache = {};
  async function caixasDoModulo(mod, W, H, D) {
    const k = mod.id + '|' + W + '|' + H + '|' + D;
    if (cache[k]) return cache[k];
    const rows = await loadRecursivePiecesForModule(mod.id);
    const parts = resolvePiecesForViewer(rows || [], { W, H, D }, {}, {}, {}, {});
    const out = [];
    let legH = 0;
    const achaPe = (lista) => (lista || []).forEach((p) => {
      if (!p) return;
      if (p.position_role === 'leg') legH = Math.max(legH, Number(p.height_mm) || 0);
      if (p.is_module && p.child_pieces) achaPe(p.child_pieces);
    });
    achaPe(parts);
    const anda = (lista, dx, dy, dz, ehPe) => (lista || []).forEach((p) => {
      if (!p) return;
      const pe = ehPe || p.position_role === 'leg';
      const x = dx + (Number(p.offset_x_mm) || 0), y = dy + (Number(p.offset_y_mm) || 0), z = dz + (Number(p.offset_z_mm) || 0);
      if (p.is_module && Array.isArray(p.child_pieces) && p.child_pieces.length) { anda(p.child_pieces, x, y, z, pe); return; }
      const w = Number(p.width_mm) || 0, h = Number(p.height_mm) || 0, d = Number(p.depth_mm) || 0;
      if (!(w > 0 && h > 0 && d > 0)) return;
      out.push({ role: pe ? 'leg' : (p.position_role || 'free'), ref: p.reference || p.component_reference || '',
        x, y: y + (pe ? 0 : legH), z, w, h, d });
    });
    anda(parts, 0, 0, 0, false);
    // pés: o 3D põe nos cantos sozinho (as linhas vêm todas em 0,0,0) — aqui
    // também, 30 mm pra dentro de cada canto
    const pes = out.filter((c) => c.role === 'leg');
    pes.forEach((c, i) => {
      const dir = i % 2 === 1, tras = Math.floor(i / 2) % 2 === 0;
      c.x = dir ? W - 30 - c.w : 30;
      c.z = tras ? 30 : D - 30 - c.d;
    });
    cache[k] = out;
    return out;
  }
  const assinatura = (c) => [c.role, Math.round(c.x), Math.round(c.y), Math.round(c.z), Math.round(c.w), Math.round(c.h), Math.round(c.d)].join('|');
  const nomePeca = (c) => {
    const r = 'r_' + c.role;
    return (TXT.en[r] ? t(r) : '') || c.ref || c.role;
  };

  // ---------------- desenho ----------------
  const COR = { left: '#d9cdb8', right: '#d9cdb8', top: '#c9b48f', bottom: '#c9b48f', back: '#e8e1d4', baseboard: '#8f7b5a', leg: '#3a3a3a', free: '#b9a27a' };
  // vista: 'front' (x,y) ou 'side' (z,y — frente à direita). destaque(c) -> 'hi' | 'diff' | null
  function svg(caixas, W, H, D, vista, destaque, px) {
    const lado = vista === 'side';
    const L = lado ? D : W;
    const pad = 14, esc2 = px / Math.max(L, H);
    const vw = L * esc2 + pad * 2, vh = H * esc2 + pad * 2 + 12;
    // de frente: de trás pra frente. De lado = CORTE no meio: as laterais
    // entram só como contorno claro, por baixo de tudo.
    const lat = (c) => c.role === 'left' || c.role === 'right';
    const ord = caixas.slice().sort((a, b) => lado ? ((lat(b) ? 1 : 0) - (lat(a) ? 1 : 0)) : (a.z + a.d / 2) - (b.z + b.d / 2));
    let s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + vw.toFixed(1) + ' ' + vh.toFixed(1) + '" width="' + vw.toFixed(0) + '" height="' + vh.toFixed(0) + '">';
    s += '<line x1="4" y1="' + (pad + H * esc2).toFixed(1) + '" x2="' + (vw - 4).toFixed(1) + '" y2="' + (pad + H * esc2).toFixed(1) + '" stroke="#9aa0a6" stroke-dasharray="3 3"/>';
    ord.forEach((c) => {
      const u0 = lado ? c.z : c.x, du = lado ? c.d : c.w;
      const x = pad + u0 * esc2, y = pad + (H - c.y - c.h) * esc2;
      const d = destaque ? destaque(c) : null;
      const lonjeF = !lado && (c.z + c.d) < D * 0.4 && c.role !== 'back';
      const fill = lonjeF ? (COR[c.role] || COR.free) : d === 'diff' ? '#f28c28' : d === 'hi' ? '#2f7d4f' : (COR[c.role] || COR.free);
      const contorno = lado && lat(c);
      // de frente, peça lá do fundo (travessa de trás, fundo) aparece clarinha
      // e sem destaque — senão parece que está na frente
      const lonje = !lado && (c.z + c.d) < D * 0.4 && c.role !== 'back';
      const op = contorno ? 0.12 : lonje ? 0.3 : (c.role === 'back' && !lado) ? (d ? 0.75 : 0.3) : d ? 1 : 0.95;
      s += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + Math.max(1, du * esc2).toFixed(1) + '" height="' + Math.max(1, c.h * esc2).toFixed(1)
        + '" fill="' + (contorno ? '#9aa0a6' : fill) + '" fill-opacity="' + op + '" stroke="' + (contorno ? '#9aa0a6' : '#5b4a32') + '" stroke-width="0.7"'
        + (contorno ? ' stroke-dasharray="3 2"' : '') + '><title>' + esc(nomePeca(c)) + '</title></rect>';
    });
    if (lado) {
      s += '<text x="' + (vw - pad).toFixed(1) + '" y="' + (vh - 2).toFixed(1) + '" text-anchor="end" font-size="10" fill="#6b7280">' + esc(t('frente')) + ' →</text>';
      s += '<text x="' + pad + '" y="' + (vh - 2).toFixed(1) + '" font-size="10" fill="#6b7280">' + esc(t('tras')) + '</text>';
    }
    return s + '</svg>';
  }

  // LUPA: canto esquerdo (de cima ou de baixo) da vista de frente, 150 mm em
  // quadrado — é onde se vê "tampo entre" × "tampo por cima" das laterais.
  function svgLupa(caixas, H, D, canto, destaque, px) {
    const tam = 150, y0 = canto === 'top' ? H - tam + 10 : -10;
    const sc = px / tam;
    const ord = caixas.slice().sort((a, b) => (a.z + a.d / 2) - (b.z + b.d / 2));
    let s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + px + ' ' + px + '" width="' + px + '" height="' + px + '" style="border:1px solid #d1d5db;border-radius:8px;background:#fff">';
    ord.forEach((c) => {
      if (c.x > tam || c.y > y0 + tam || c.y + c.h < y0) return;
      const lonje = (c.z + c.d) < D * 0.4 && c.role !== 'back';
      const d = destaque ? destaque(c) : null;
      const fill = lonje ? (COR[c.role] || COR.free) : d === 'diff' ? '#f28c28' : d === 'hi' ? '#2f7d4f' : (COR[c.role] || COR.free);
      const op = lonje ? 0.3 : c.role === 'back' ? 0.3 : 0.95;
      const x = (c.x + 10) * sc, y = (y0 + tam - (c.y + c.h)) * sc;
      s += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + (c.w * sc).toFixed(1) + '" height="' + (c.h * sc).toFixed(1)
        + '" fill="' + fill + '" fill-opacity="' + op + '" stroke="#5b4a32" stroke-width="1"><title>' + esc(nomePeca(c)) + '</title></rect>';
    });
    if (canto !== 'top') s += '<line x1="0" y1="' + ((y0 + tam) * sc).toFixed(1) + '" x2="' + px + '" y2="' + ((y0 + tam) * sc).toFixed(1) + '" stroke="#9aa0a6" stroke-dasharray="4 3"/>';
    return s + '</svg>';
  }

  // ---------------- módulos ----------------
  // allModules / familiesCacheList são `let` globais de outro <script>: só
  // dá pra ler pelo nome (não ficam em window).
  const todos = () => { try { return allModules || []; } catch (e) { return []; } };
  const familias = () => { try { return familiesCacheList || []; } catch (e) { return []; } };
  function familiaComponentes() {
    return familias().find((f) => /^componentes$/i.test(f.name)) || null;
  }
  function modsDaFamilia() {
    const f = familiaComponentes();
    return todos().filter((m) => f && m.family_id === f.id);
  }
  function achaModulo(nome) {
    const lista = modsDaFamilia();
    return lista.find((m) => m.name === nome) || null;
  }
  // módulos da aba que está aberta na janela Add cabinet (pro comparador)
  function modsDaAba() {
    let lista = (typeof projectLibraryModules === 'function') ? projectLibraryModules() : todos();
    // veio do botão "Comparar" do guia: lista da família/categoria daquele módulo
    if (st.ctx) {
      lista = lista.filter((m) => m.family_id === st.ctx.fam && (!st.ctx.cat || m.category_id === st.ctx.cat));
      return lista.slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
    }
    try {
      if (projSearchModalFamilyId) lista = lista.filter((m) => m.family_id === projSearchModalFamilyId);
      if (projSearchModalCategoryId) lista = lista.filter((m) => m.category_id === projSearchModalCategoryId);
      if (projSearchModalSubcategoryId) lista = lista.filter((m) => m.subcategory_id === projSearchModalSubcategoryId);
    } catch (e) { /* sem filtro */ }
    if (lista.length < 2) lista = modsDaFamilia();
    return lista.slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }
  const medidas = (m) => ({
    W: Number(m && m.width_default_mm) || 600,
    H: Number(m && m.height_default_mm) || 760,
    D: Number(m && m.depth_default_mm) || 560
  });

  // ---------------- janela ----------------
  const st = { aba: 'guide', a: null, b: null, ctx: null };
  function css() {
    if (document.getElementById('po-guia-css')) return;
    const el = document.createElement('style');
    el.id = 'po-guia-css';
    el.textContent = `
    #po-guia-btn { position: absolute; top: 22px; right: 64px; font-size: 13px; padding: 6px 12px; border-radius: 16px; border: 1px solid #2f7d4f; background: #eef7f1; color: #1f5c39; font-weight: 600; cursor: pointer; vertical-align: middle; }
    #po-guia-btn:hover { background: #2f7d4f; color: #fff; }
    #po-guia { display: none; position: fixed; inset: 0; z-index: 3100; background: rgba(0,0,0,.55); align-items: center; justify-content: center; padding: 20px; }
    #po-guia.open { display: flex; }
    #po-guia .pg-card { background: #fff; border-radius: 12px; width: 1180px; max-width: 100%; height: 88vh; display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,.35); }
    #po-guia .pg-head { display: flex; align-items: center; gap: 12px; padding: 18px 22px 0; }
    #po-guia .pg-head h2 { margin: 0; font-size: 20px; flex: 1; }
    #po-guia .pg-x { border: none; background: none; width: auto; font-size: 26px; cursor: pointer; color: #444; }
    #po-guia .pg-tabs { display: flex; gap: 4px; padding: 12px 22px 0; border-bottom: 1px solid #e5e7eb; }
    #po-guia .pg-tab { border: 1px solid #e5e7eb; border-bottom: none; background: #f6f4ef; padding: 8px 16px; border-radius: 8px 8px 0 0; cursor: pointer; font-weight: 600; color: #555; width: auto; }
    #po-guia .pg-tab.on { background: #fff; color: #111; position: relative; top: 1px; }
    #po-guia .pg-body { flex: 1; overflow: auto; padding: 18px 22px 26px; }
    #po-guia .pg-nome { display: flex; gap: 8px; align-items: stretch; margin: 8px 0 6px; flex-wrap: wrap; }
    #po-guia .pg-nome span { padding: 8px 14px; border-radius: 8px; font-weight: 700; font-size: 14px; }
    #po-guia .pg-nome .c1 { background: #fdebd3; } #po-guia .pg-nome .c2 { background: #dcecf9; } #po-guia .pg-nome .c3 { background: #e6f3e9; }
    #po-guia .pg-nome i { align-self: center; font-style: normal; font-size: 20px; color: #888; }
    #po-guia h3 { margin: 22px 0 10px; font-size: 16px; }
    #po-guia .pg-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 12px; }
    #po-guia .pg-item { border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; background: #fcfbf8; }
    #po-guia .pg-item h4 { margin: 0 0 4px; font-size: 15px; }
    #po-guia .pg-item p { margin: 0 0 8px; font-size: 13px; line-height: 1.4; color: #374151; }
    #po-guia .pg-views { display: flex; gap: 10px; align-items: flex-end; }
    #po-guia .pg-views figure { margin: 0; text-align: center; font-size: 11px; color: #6b7280; }
    #po-guia .pg-mod { font-size: 11px; color: #6b7280; margin-top: 6px; }
    #po-guia .pg-sel { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    #po-guia .pg-sel label { font-size: 12px; font-weight: 700; color: #555; display: block; margin-bottom: 4px; }
    #po-guia .pg-sel select { width: 100%; padding: 8px; border-radius: 8px; border: 1px solid #d1d5db; font-size: 14px; }
    #po-guia .pg-cmp { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 14px; }
    #po-guia .pg-cmp > div { border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; }
    #po-guia .pg-diff { margin-top: 14px; border-radius: 10px; background: #fff7ed; border: 1px solid #fed7aa; padding: 12px 14px; font-size: 14px; }
    #po-guia .pg-diff ul { margin: 6px 0 0 18px; padding: 0; }
    #po-guia .pg-diff b.o { color: #c2410c; }
    #po-guia .pg-hint { font-size: 12px; color: #6b7280; margin-top: 8px; }
    #po-guia .pg-mini { font-size: 12px; padding: 4px 10px; border-radius: 12px; border: 1px solid #d1d5db; background: #fff; color: #1f2937; cursor: pointer; margin-top: 6px; }
    `;
    document.head.appendChild(el);
  }
  function montaJanela() {
    let g = document.getElementById('po-guia');
    if (g) return g;
    g = document.createElement('div');
    g.id = 'po-guia';
    g.innerHTML = '<div class="pg-card"><div class="pg-head"><h2></h2><button type="button" class="pg-x" aria-label="close">&times;</button></div>'
      + '<div class="pg-tabs"><button type="button" class="pg-tab" data-aba="guide"></button><button type="button" class="pg-tab" data-aba="cmp"></button></div>'
      + '<div class="pg-body"></div></div>';
    document.body.appendChild(g);
    g.addEventListener('click', (ev) => {
      if (ev.target === g || ev.target.closest('.pg-x')) { g.classList.remove('open'); return; }
      const tab = ev.target.closest('.pg-tab');
      if (tab) { st.aba = tab.dataset.aba; render(); return; }
      const cmp = ev.target.closest('[data-pg-cmp]');
      if (cmp) {
        const m = todos().find((x) => x.id === cmp.dataset.pgCmp);
        st.ctx = m ? { fam: m.family_id, cat: m.category_id } : null;
        st.a = cmp.dataset.pgCmp; st.b = cmp.dataset.pgCmp2 || null; st.aba = 'cmp';
        const lista = modsDaAba();
        if (!st.b || st.b === st.a) st.b = (lista.find((x) => x.id !== st.a) || {}).id || null;
        render();
      }
    });
    g.addEventListener('change', (ev) => {
      if (ev.target.id === 'pg-a') { st.a = ev.target.value; renderCmp(); }
      if (ev.target.id === 'pg-b') { st.b = ev.target.value; renderCmp(); }
    });
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && g.classList.contains('open')) { ev.stopPropagation(); g.classList.remove('open'); } }, true);
    return g;
  }
  function abrir() {
    css();
    const g = montaJanela();
    st.ctx = null;
    const lista = modsDaAba();
    if (!st.a || !lista.some((m) => m.id === st.a)) st.a = lista[0] ? lista[0].id : null;
    if (!st.b || st.b === st.a || !lista.some((m) => m.id === st.b)) st.b = (lista.find((m) => m.id !== st.a) || {}).id || null;
    g.classList.add('open');
    render();
  }
  function render() {
    const g = document.getElementById('po-guia');
    if (!g) return;
    g.querySelector('.pg-head h2').textContent = t('title');
    g.querySelectorAll('.pg-tab').forEach((b) => {
      b.textContent = t(b.dataset.aba === 'guide' ? 'tab_guide' : 'tab_cmp');
      b.classList.toggle('on', b.dataset.aba === st.aba);
    });
    if (st.aba === 'guide') renderGuia(); else renderCmp();
  }

  // ---- aba 1: como ler o nome ----
  function renderGuia() {
    const body = document.querySelector('#po-guia .pg-body');
    let h = '<p style="margin:0">' + esc(t('intro')) + '</p>'
      + '<div class="pg-nome"><span class="c1">' + esc(t('p_top')) + '</span><i>·</i><span class="c2">' + esc(t('p_base')) + '</span><i>·</i><span class="c3">' + esc(t('p_back')) + '</span></div>'
      + '<p style="margin:4px 0 0;font-size:14px">' + t('ex') + '</p>'
      + '<p style="margin:6px 0 0;font-size:13px;color:#2f7d4f;font-weight:600">■ ' + esc(t('legend')) + '</p>';
    const secoes = [
      ['top', t('sec_top'), TOPS.map((x) => [x, x + ' · Bottom · No back'])],
      ['base', t('sec_base'), BASES.map((x) => [x, x === 'Topcover' ? 'Topcover · Topcover · No back' : 'Bottom · ' + x + ' · No back'])],
      ['back', t('sec_back'), BACKS.map((x) => [x, null])]
    ];
    const itens = [];
    secoes.forEach(([parte, titulo, opcoes]) => {
      h += '<h3>' + esc(titulo) + '</h3><div class="pg-grid">';
      opcoes.forEach(([op, nomeMod]) => {
        let mod = nomeMod ? achaModulo(nomeMod) : null;
        if (parte === 'back') {
          mod = modsDaFamilia().find((m) => partes(m.name)[2] === op && partes(m.name)[0] === 'Bottom') || modsDaFamilia().find((m) => partes(m.name)[2] === op) || null;
        }
        const id = 'pg-v-' + parte + '-' + itens.length;
        itens.push({ id, mod, parte, op });
        // par pro "Comparar": a opção vizinha da mesma seção (Bottom ↔ Topcover...)
        const io = opcoes.findIndex((o) => o[0] === op);
        const viz = opcoes[io + 1] || opcoes[io - 1];
        const parMod = viz ? (parte === 'back'
          ? modsDaFamilia().find((m) => partes(m.name)[2] === viz[0] && partes(m.name)[0] === 'Bottom')
          : achaModulo(viz[1])) : null;
        h += '<div class="pg-item"><h4>' + esc(op) + '</h4><p>' + esc(t(parte + '_' + op)) + '</p>'
          + '<div class="pg-views" id="' + id + '">' + (mod ? esc(t('loading')) : '') + '</div>'
          + (mod ? '<div class="pg-mod">' + esc(mod.name) + '</div><button type="button" class="pg-mini" data-pg-cmp="' + esc(mod.id) + '"' + (parMod ? ' data-pg-cmp2="' + esc(parMod.id) + '"' : '') + '>⇆ ' + esc(t('compare_this')) + '</button>' : '')
          + '</div>';
      });
      h += '</div>';
    });
    body.innerHTML = h;
    // Destaque = o que o módulo tem de DIFERENTE dos outros da mesma seção
    // (peça que todos têm, ex. o stretcher do fundo, fica na cor normal).
    const W = 600, H = 760, D = 560;
    ['top', 'base', 'back'].forEach(async (parte) => {
      const grupo = itens.filter((it) => it.parte === parte && it.mod);
      let cxs;
      try { cxs = await Promise.all(grupo.map((it) => caixasDoModulo(it.mod, W, H, D))); }
      catch (e) { grupo.forEach((it) => { const el = document.getElementById(it.id); if (el) el.textContent = t('fail'); }); console.warn('[guia]', e); return; }
      const conta = {};
      cxs.forEach((cx) => new Set(cx.map(assinatura)).forEach((k) => { conta[k] = (conta[k] || 0) + 1; }));
      grupo.forEach((it, n) => {
        const el = document.getElementById(it.id);
        if (!el || !document.body.contains(el)) return;
        // laterais nunca: a diferença mostrada é a peça da PARTE (tampo/base/
        // rodapé/pé/travessa) — perto de cima ou de baixo, conforme a seção
        const daParte = (c) => {
          if (parte === 'back') return c.role === 'back';
          if (c.role === 'left' || c.role === 'right' || c.role === 'back') return false;
          if (parte === 'top') return c.y + c.h > H - 110;
          return c.y < 140 || c.role === 'leg' || c.role === 'baseboard';
        };
        const hi = (c) => daParte(c) && (parte === 'back' || conta[assinatura(c)] < grupo.length) ? 'hi' : null;
        el.innerHTML = '<figure>' + svg(cxs[n], W, H, D, 'front', hi, 160) + '<figcaption>' + esc(t('front')) + '</figcaption></figure>'
          + '<figure>' + svg(cxs[n], W, H, D, 'side', hi, 160) + '<figcaption>' + esc(t('side')) + '</figcaption></figure>';
      });
    });
  }

  // ---- aba 2: comparar ----
  async function renderCmp() {
    const body = document.querySelector('#po-guia .pg-body');
    const lista = modsDaAba();
    const ops = (sel) => lista.map((m) => '<option value="' + esc(m.id) + '"' + (m.id === sel ? ' selected' : '') + '>' + esc(m.name) + '</option>').join('');
    const mA = todos().find((m) => m.id === st.a);
    const mB = todos().find((m) => m.id === st.b);
    const opsA = mA && !lista.includes(mA) ? '<option value="' + esc(mA.id) + '" selected>' + esc(mA.name) + '</option>' + ops(st.a) : ops(st.a);
    const opsB = mB && !lista.includes(mB) ? '<option value="' + esc(mB.id) + '" selected>' + esc(mB.name) + '</option>' + ops(st.b) : ops(st.b);
    body.innerHTML = '<div class="pg-sel"><div><label>' + esc(t('cmp_a')) + '</label><select id="pg-a">' + opsA + '</select></div>'
      + '<div><label>' + esc(t('cmp_b')) + '</label><select id="pg-b">' + opsB + '</select></div></div>'
      + '<div class="pg-diff" id="pg-diff">' + esc(t('loading')) + '</div>'
      + '<div class="pg-cmp"><div id="pg-da">' + esc(t('loading')) + '</div><div id="pg-db">' + esc(t('loading')) + '</div></div>'
      + '<div class="pg-hint" id="pg-hint"></div>';
    if (!mA || !mB) return;
    const { W, H, D } = medidas(mA);
    try {
      const [ca, cb] = await Promise.all([caixasDoModulo(mA, W, H, D), caixasDoModulo(mB, W, H, D)]);
      if (!document.getElementById('pg-da') || st.a !== mA.id || st.b !== mB.id) return;
      const sa = new Set(ca.map(assinatura)), sb = new Set(cb.map(assinatura));
      const soA = ca.filter((c) => !sb.has(assinatura(c))), soB = cb.filter((c) => !sa.has(assinatura(c)));
      const dA = (c) => sb.has(assinatura(c)) ? null : 'diff', dB = (c) => sa.has(assinatura(c)) ? null : 'diff';
      const bloco = (m, cx, d) => '<h4 style="margin:0 0 8px">' + esc(m.name) + '</h4><div class="pg-views">'
        + '<figure>' + svg(cx, W, H, D, 'front', d, 260) + '<figcaption>' + esc(t('front')) + '</figcaption></figure>'
        + '<figure>' + svg(cx, W, H, D, 'side', d, 260) + '<figcaption>' + esc(t('side')) + '</figcaption></figure></div>'
        + '<div class="pg-views" style="margin-top:8px">'
        + '<figure>' + svgLupa(cx, H, D, 'top', d, 130) + '<figcaption>🔍 ' + esc(t('zoom_top')) + '</figcaption></figure>'
        + '<figure>' + svgLupa(cx, H, D, 'bottom', d, 130) + '<figcaption>🔍 ' + esc(t('zoom_bottom')) + '</figcaption></figure></div>';
      document.getElementById('pg-da').innerHTML = bloco(mA, ca, dA);
      document.getElementById('pg-db').innerHTML = bloco(mB, cb, dB);
      // resumo em palavras pelas partes do nome
      const pa = partes(mA.name), pb = partes(mB.name);
      const rot = [['p_top', 'top'], ['p_base', 'base'], ['p_back', 'back']];
      let li = '';
      if (pa.length === 3 && pb.length === 3) {
        rot.forEach(([lab, k], i) => {
          if (pa[i] === pb[i]) return;
          const ea = TXT.en[k + '_' + pa[i]] ? ' — ' + esc(t(k + '_' + pa[i])) : '';
          const eb = TXT.en[k + '_' + pb[i]] ? ' — ' + esc(t(k + '_' + pb[i])) : '';
          li += '<li><b>' + esc(t(lab)) + ':</b> A = <b>' + esc(pa[i]) + '</b>' + ea + '<br>B = <b>' + esc(pb[i]) + '</b>' + eb + '</li>';
        });
      }
      const nomes = (l) => Array.from(new Set(l.map(nomePeca))).join(', ');
      let h = '<b>' + esc(t('diff_title')) + '</b>';
      if (li) h += '<ul>' + li + '</ul>';
      if (soA.length || soB.length) {
        h += '<ul>' + (soA.length ? '<li><b class="o">' + esc(t('only_a')) + ':</b> ' + esc(nomes(soA)) + '</li>' : '')
          + (soB.length ? '<li><b class="o">' + esc(t('only_b')) + ':</b> ' + esc(nomes(soB)) + '</li>' : '') + '</ul>';
      } else h += '<div>' + esc(t('no_diff')) + '</div>';
      document.getElementById('pg-diff').innerHTML = h;
      document.getElementById('pg-hint').textContent = t('cmp_hint') + ' ' + t('sizes', { w: W, h: H, d: D });
    } catch (e) {
      console.warn('[guia] comparar', e);
      const d = document.getElementById('pg-diff'); if (d) d.textContent = t('fail');
    }
  }

  // ---------------- botão na janela Add cabinet ----------------
  function poeBotao() {
    const h2 = document.querySelector('#po-proj-search-modal .po-proj-search-modal-card > h2');
    if (!h2) return;
    css();
    let b = document.getElementById('po-guia-btn');
    if (!b) {
      b = document.createElement('button');
      b.type = 'button';
      b.id = 'po-guia-btn';
      b.addEventListener('click', (ev) => { ev.stopPropagation(); abrir(); });
      // fora do <h2>: o i18n reescreve o texto do título e levaria o botão junto
      h2.insertAdjacentElement('afterend', b);
    }
    b.textContent = '? ' + t('btn');
  }
  poeBotao();
  document.addEventListener('po:lang-changed', () => { poeBotao(); if (document.querySelector('#po-guia.open')) render(); });
  window.LegnoGuiaComponentes = { abrir, comparar: (a, b) => { st.a = a; st.b = b; st.aba = 'cmp'; abrir(); } };
})();
