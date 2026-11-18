/* js/portal-40-montagem.js — PASSO A PASSO DE MONTAGEM (PILOTO, 2026-11-16)
 *
 * Matt: "podemos fazer um passo a passo pra montagem dos módulos... com os
 * pinos e cavilhas no minifix, depois ferragens como corrediça e calço de
 * dobradiça, depois suporte de prateleira se tiver, depois conectar as bases
 * com lateral, depois colocar o tambor e girar com chave de fenda... passo a
 * passo mesmo, uma telinha pra isso, montador ou cliente consultar como faz,
 * puxa junto com o QR code do volume."
 *
 * ONDE ABRE: no 3D público do QR da etiqueta (portal.html?view3d=...&item=...),
 * botão "Como montar" no cabeçalho do visitante. Abre o módulo localizado
 * pelo QR; sem módulo localizado, mostra a lista pra escolher.
 *
 * DE ONDE SAEM OS PASSOS: da FURAÇÃO do módulo (Drilling.holesNoModulo — os
 * mesmos furos do .ban) e das caixas das peças (Drilling._internals.buildBoxes
 * / boxesAninhadas). Nada é digitado por módulo: se o furo está na máquina, a
 * ferragem dele aparece no passo. Passo sem nada pra fazer é pulado.
 *
 * DESENHO: cena própria e esquemática (chapas translúcidas com contorno +
 * ferragem de verdade via Viewer3D.buildHardwareGroup). Não mexe na cena do
 * projeto nem em nenhum arquivo existente além de 1 campo novo (`cx`) nos
 * furos de holesNoModulo.
 *
 * PILOTO: pensado e conferido pra caixa simples (laterais, bases/travessas,
 * fundo, prateleira, porta). Gaveta entra só no último passo, como conjunto.
 * Desligar: localStorage.legno_montagem_off = '1'.
 */
(function () {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    // bancada (node): só a lógica dos passos
    if (typeof module !== 'undefined') module.exports = { montarPassos: montarPassos, classificaFuro: classificaFuro, classificaCaixa: classificaCaixa };
    return;
  }

  // ---- textos (pt/en/es) -------------------------------------------------
  const TXT = {
    pt: {
      btn: '🔧 Como montar', titulo: 'Como montar', passo: 'Passo {{n}} de {{t}}', ant: '◀ Anterior', prox: 'Próximo ▶', fim: 'Concluir',
      fechar: 'Fechar', escolha: 'Escolha o módulo', carregando: 'Preparando o passo a passo…',
      erro: 'Não consegui montar o passo a passo deste módulo agora.', vazio: 'Este módulo não tem furação cadastrada — sem passo a passo.',
      precisa: 'Você vai precisar', ferramenta: 'Ferramenta: chave Phillips. Martelo de borracha ajuda nas cavilhas.',
      gire: 'Arraste para girar · pinça/roda para aproximar',
      n_pino: 'pino minifix', n_cavilha: 'cavilha', n_tambor: 'tambor minifix', n_calco: 'calço de dobradiça', n_corredica: 'corrediça',
      n_suporte: 'suporte de prateleira', n_copo: 'dobradiça',
      s1_t: 'Pinos e cavilhas', s1_d: 'Rosqueie um pino minifix em cada furo pequeno (Ø5) das chapas destacadas, até encostar. Encaixe uma cavilha de madeira em cada furo de Ø8.',
      s2_t: 'Calços de dobradiça e corrediças', s2_d: 'Com as laterais ainda deitadas, parafuse os calços de dobradiça e as corrediças nos furos marcados. É muito mais fácil agora do que com o móvel fechado.',
      s3_t: 'Suportes de prateleira', s3_d: 'Encaixe os suportes de prateleira nos furos das laterais.',
      s4_t: 'Junte as chapas', s4_d: 'Deite uma lateral com os pinos para cima. Encaixe as bases, travessas e o fundo nos pinos e cavilhas. Depois feche com a outra lateral.',
      s5_t: 'Tambores: coloque e gire', s5_d: 'Coloque um tambor em cada furo grande, com a seta apontando para a borda da chapa (para o pino). Gire no sentido horário com a chave Phillips até travar firme.',
      s6_t: 'Prateleiras', s6_d: 'Apoie as prateleiras sobre os suportes.',
      s7_t: 'Portas e frentes', s7_d: 'Encaixe as dobradiças das portas nos calços (clique) e regule pelos parafusos da dobradiça. Coloque as gavetas nas corrediças.',
      s7_d_sem: 'Módulo montado. Confira se todos os tambores estão travados antes de levantar o móvel.',
      pecas_t: "Peças e ferragens",
      pecas_d: "Confira se chegou tudo antes de começar. Os pontos mostram onde vai cada ferragem em cada chapa.",
      ferragens: "Ferragens",
      ferramentas: "Ferramentas",
      chapas: "Chapas",
      play: "▶ Reproduzir",
      pause: "❚❚ Pausar",
      replay: "↺ De novo",
      perto: "🔍 De perto",
      longe: "Ver tudo",
      video: "⬇ Vídeo",
      gravando: "Gravando…",
      t_phillips: "Chave Phillips PH2",
      t_parafusadeira: "Parafusadeira em torque baixo, ponta PH2",
      t_martelo: "Martelo de borracha",
      t_mao: "Só com a mão",
      dica_s1: "Pino: rosqueie até a rosca sumir dentro da chapa. Cavilha: entra justa, dê batidas leves com o martelo de borracha.",
      dica_s2: "Use os parafusos que vêm com a ferragem. Parafusadeira em torque baixo pra não espanar a chapa.",
      dica_s3: "Empurre até a aba do suporte encostar na chapa.",
      dica_s4: "Se precisar, bata de leve com o martelo de borracha pra encostar as chapas. Nunca martelo de aço direto na chapa.",
      dica_s5: "Não use parafusadeira no tambor: ele espana. Cerca de meia volta com a chave já trava.",
      dica_s6: "A prateleira só apoia, não precisa de ferramenta.",
      dica_s7: "A regulagem da dobradiça é feita com a chave Phillips, nos parafusos da própria dobradiça.",
      leg_pino: "pino",
      leg_cavilha: "cavilha",
      leg_tambor: "tambor",
      leg_outro: "outras ferragens"
    },
    en: {
      btn: '🔧 How to assemble', titulo: 'How to assemble', passo: 'Step {{n}} of {{t}}', ant: '◀ Back', prox: 'Next ▶', fim: 'Done',
      fechar: 'Close', escolha: 'Choose the cabinet', carregando: 'Preparing the step-by-step…',
      erro: "Couldn't build the steps for this cabinet right now.", vazio: 'This cabinet has no drilling on file — no step-by-step available.',
      precisa: 'You will need', ferramenta: 'Tool: Phillips screwdriver. A rubber mallet helps with the dowels.',
      gire: 'Drag to rotate · pinch/scroll to zoom',
      n_pino: 'cam bolt', n_cavilha: 'wood dowel', n_tambor: 'cam lock', n_calco: 'hinge plate', n_corredica: 'drawer slide',
      n_suporte: 'shelf support', n_copo: 'hinge',
      s1_t: 'Cam bolts and dowels', s1_d: 'Screw one cam bolt into each small (5 mm) hole of the highlighted panels until it stops. Push one wood dowel into each 8 mm hole.',
      s2_t: 'Hinge plates and drawer slides', s2_d: 'With the side panels still lying flat, screw the hinge plates and the drawer slides into the marked holes. It is much easier now than with the cabinet closed.',
      s3_t: 'Shelf supports', s3_d: 'Push the shelf supports into the holes of the side panels.',
      s4_t: 'Join the panels', s4_d: 'Lay one side panel flat with the bolts facing up. Fit the bottom, stretchers and back onto the bolts and dowels. Then close with the other side panel.',
      s5_t: 'Cam locks: insert and turn', s5_d: 'Drop a cam lock into each large hole, with its arrow pointing to the edge of the panel (toward the bolt). Turn clockwise with the Phillips screwdriver until it locks tight.',
      s6_t: 'Shelves', s6_d: 'Rest the shelves on the supports.',
      s7_t: 'Doors and fronts', s7_d: 'Clip the door hinges onto the hinge plates and adjust with the hinge screws. Slide the drawers onto the slides.',
      s7_d_sem: 'Cabinet assembled. Check that every cam lock is tight before standing it up.',
      pecas_t: "Parts and hardware",
      pecas_d: "Check that everything arrived before you start. The dots show where each piece of hardware goes on each panel.",
      ferragens: "Hardware",
      ferramentas: "Tools",
      chapas: "Panels",
      play: "▶ Play",
      pause: "❚❚ Pause",
      replay: "↺ Replay",
      perto: "🔍 Close-up",
      longe: "Full view",
      video: "⬇ Video",
      gravando: "Recording…",
      t_phillips: "Phillips screwdriver PH2",
      t_parafusadeira: "Drill on low torque, PH2 bit",
      t_martelo: "Rubber mallet",
      t_mao: "By hand",
      dica_s1: "Cam bolt: screw it in until the thread disappears into the panel. Dowel: it fits tight, tap it lightly with the rubber mallet.",
      dica_s2: "Use the screws that come with the hardware. Keep the drill on low torque so the panel does not strip.",
      dica_s3: "Push until the support's flange touches the panel.",
      dica_s4: "If needed, tap lightly with the rubber mallet to close the joints. Never hit the panel with a steel hammer.",
      dica_s5: "Do not use a drill on the cam lock: it strips. About half a turn with the screwdriver locks it.",
      dica_s6: "The shelf just rests in place, no tool needed.",
      dica_s7: "Hinges are adjusted with the Phillips screwdriver, using the hinge's own screws.",
      leg_pino: "cam bolt",
      leg_cavilha: "dowel",
      leg_tambor: "cam lock",
      leg_outro: "other hardware"
    },
    es: {
      btn: '🔧 Cómo armar', titulo: 'Cómo armar', passo: 'Paso {{n}} de {{t}}', ant: '◀ Anterior', prox: 'Siguiente ▶', fim: 'Terminar',
      fechar: 'Cerrar', escolha: 'Elija el módulo', carregando: 'Preparando el paso a paso…',
      erro: 'No pude armar el paso a paso de este módulo ahora.', vazio: 'Este módulo no tiene perforación registrada — sin paso a paso.',
      precisa: 'Va a necesitar', ferramenta: 'Herramienta: destornillador Phillips. Un mazo de goma ayuda con los tarugos.',
      gire: 'Arrastre para girar · pellizque/rueda para acercar',
      n_pino: 'perno minifix', n_cavilha: 'tarugo', n_tambor: 'tambor minifix', n_calco: 'base de bisagra', n_corredica: 'corredera',
      n_suporte: 'soporte de estante', n_copo: 'bisagra',
      s1_t: 'Pernos y tarugos', s1_d: 'Atornille un perno minifix en cada agujero pequeño (Ø5) de las piezas destacadas, hasta el tope. Coloque un tarugo de madera en cada agujero de Ø8.',
      s2_t: 'Bases de bisagra y correderas', s2_d: 'Con los laterales todavía acostados, atornille las bases de bisagra y las correderas en los agujeros marcados. Es mucho más fácil ahora que con el mueble cerrado.',
      s3_t: 'Soportes de estante', s3_d: 'Coloque los soportes de estante en los agujeros de los laterales.',
      s4_t: 'Una las piezas', s4_d: 'Acueste un lateral con los pernos hacia arriba. Encaje las bases, travesaños y el fondo en los pernos y tarugos. Luego cierre con el otro lateral.',
      s5_t: 'Tambores: coloque y gire', s5_d: 'Coloque un tambor en cada agujero grande, con la flecha apuntando al borde de la pieza (hacia el perno). Gire en sentido horario con el destornillador Phillips hasta que trabe firme.',
      s6_t: 'Estantes', s6_d: 'Apoye los estantes sobre los soportes.',
      s7_t: 'Puertas y frentes', s7_d: 'Encaje las bisagras de las puertas en las bases (clic) y regule con los tornillos de la bisagra. Coloque los cajones en las correderas.',
      s7_d_sem: 'Módulo armado. Verifique que todos los tambores estén trabados antes de levantar el mueble.',
      pecas_t: "Piezas y herrajes",
      pecas_d: "Verifique que llegó todo antes de empezar. Los puntos muestran dónde va cada herraje en cada pieza.",
      ferragens: "Herrajes",
      ferramentas: "Herramientas",
      chapas: "Piezas",
      play: "▶ Reproducir",
      pause: "❚❚ Pausar",
      replay: "↺ Otra vez",
      perto: "🔍 De cerca",
      longe: "Ver todo",
      video: "⬇ Video",
      gravando: "Grabando…",
      t_phillips: "Destornillador Phillips PH2",
      t_parafusadeira: "Atornillador en torque bajo, punta PH2",
      t_martelo: "Mazo de goma",
      t_mao: "Solo con la mano",
      dica_s1: "Perno: atorníllelo hasta que la rosca desaparezca en la pieza. Tarugo: entra justo, dé golpes suaves con el mazo de goma.",
      dica_s2: "Use los tornillos que vienen con el herraje. Atornillador en torque bajo para no barrer la pieza.",
      dica_s3: "Empuje hasta que la pestaña del soporte toque la pieza.",
      dica_s4: "Si hace falta, golpee suave con el mazo de goma para cerrar las uniones. Nunca martillo de acero directo en la pieza.",
      dica_s5: "No use atornillador en el tambor: se barre. Cerca de media vuelta con el destornillador ya traba.",
      dica_s6: "El estante solo se apoya, no necesita herramienta.",
      dica_s7: "Las bisagras se regulan con el destornillador Phillips, en los tornillos de la propia bisagra.",
      leg_pino: "perno",
      leg_cavilha: "tarugo",
      leg_tambor: "tambor",
      leg_outro: "otros herrajes"
    }
  };
  function T(k, vars) {
    let lang = 'en';
    try { lang = (typeof I18n !== 'undefined' && I18n.getLanguage) ? I18n.getLanguage() : 'en'; } catch (e) { /* en */ }
    let s = (TXT[lang] || TXT.en)[k] || TXT.en[k] || k;
    Object.keys(vars || {}).forEach((v) => { s = s.replace('{{' + v + '}}', vars[v]); });
    return s;
  }

  // ---- classificação (sem DOM — também usada na bancada) ----------------
  // tipo de ferragem que vai num furo; null = furo que não leva ferragem
  function classificaFuro(h) {
    const d = Number(h.diameter) || 0, t = h.tipo || '';
    const juncao = !!(h.borda && t === 'contrafuro_borda' && h.extra && h.extra.bordaComBorda);
    if (h.borda && !juncao) return null;
    if (t === 'copo_dobradica') return 'copo';
    if (t === 'base_dobradica') return 'calco';
    if (t === 'corredica' || t === 'placa_corredica') return 'corredica';
    if (t === 'suporte_prateleira') return 'suporte';
    if (t === 'linha_prateleira') return h.comPino ? 'suporte' : null;
    if (t === 'marcacao_dobradica' || t === 'marcacao_puxador' || t === 'suporte_cabide' || t === 'marcacao_suporte_canto') return null;
    if (Math.abs(d - 5) < 0.6) return 'pino';
    if (Math.abs(d - 8) < 0.6) return 'cavilha';
    if (Math.abs(d - 16) < 0.6 && h.naPrateleira) return null;   // copo do conector da prateleira
    if (d >= 11.5 && d <= 20.5) return 'tambor';
    return null;
  }
  // papel da chapa na montagem: lado | horiz | prat | fundo | porta | outro
  function classificaCaixa(b, temCopo) {
    const p = b.part || {};
    if ((p.origin || 'fabricacao') === 'comprado') return null;
    if (temCopo) return 'porta';
    if (b.tAxis === 'y') return (p.drill_shelf_support || p.prateleira_regulavel || p.position_role === 'shelf') ? 'prat' : 'horiz';
    if (b.tAxis === 'x') return 'lado';
    if (b.tAxis === 'z') return 'fundo';
    return 'outro';
  }
  const chaveCaixa = (b) => [b.x0, b.y0, b.z0, b.sx, b.sy, b.sz].map((v) => Math.round(v * 10) / 10).join(',');

  // caixas = [{ chave, papel, ... }], furos = holesNoModulo (com cx). Devolve
  // os passos: [{ id, kinds:[ferragens mostradas], mostra:fn(caixa)->'forte'|'fraco'|null, conta:{kind:n} }]
  function montarPassos(caixas, furos) {
    const fs = (furos || []).map((h) => Object.assign({}, h, { kind: null }));
    const papelDe = {};
    caixas.forEach((c) => { papelDe[c.chave] = c.papel; });
    fs.forEach((h) => { h.naPrateleira = papelDe[h.cx] === 'prat'; h.kind = classificaFuro(h); });
    const conta = (kinds) => { const o = {}; fs.forEach((h) => { if (h.kind && kinds.indexOf(h.kind) !== -1) o[h.kind] = (o[h.kind] || 0) + 1; }); return o; };
    const comFuro = (kinds) => { const s = {}; fs.forEach((h) => { if (h.kind && kinds.indexOf(h.kind) !== -1) s[h.cx] = true; }); return s; };
    const corpo = (c) => c.papel === 'lado' || c.papel === 'horiz' || c.papel === 'fundo';
    const passos = [];
    const add = (id, kinds, mostra, extra) => passos.push(Object.assign({ id, kinds, mostra, conta: conta(kinds) }, extra || {}));
    const tem = (kinds) => Object.keys(conta(kinds)).length > 0;

    if (tem(['pino', 'cavilha'])) { const s = comFuro(['pino', 'cavilha']); add('s1', ['pino', 'cavilha'], (c) => (s[c.chave] && c.papel !== 'porta') ? 'forte' : null); }
    if (tem(['calco', 'corredica'])) { const s = comFuro(['calco', 'corredica']); add('s2', ['calco', 'corredica'], (c) => s[c.chave] ? 'forte' : null); }
    if (tem(['suporte'])) { const s = comFuro(['suporte']); add('s3', ['suporte'], (c) => s[c.chave] ? 'forte' : null); }
    if (caixas.some(corpo)) add('s4', ['pino', 'cavilha'], (c) => corpo(c) ? 'forte' : null);
    if (tem(['tambor'])) { const s = comFuro(['tambor']); add('s5', ['tambor'], (c) => corpo(c) ? (s[c.chave] ? 'forte' : 'fraco') : null); }
    if (caixas.some((c) => c.papel === 'prat')) add('s6', ['suporte'], (c) => c.papel === 'prat' ? 'forte' : (corpo(c) ? 'fraco' : null));
    const temFrente = caixas.some((c) => c.papel === 'porta' || c.papel === 'outro');
    add('s7', ['copo', 'calco'], (c) => (c.papel === 'porta' || c.papel === 'outro') ? 'forte' : 'fraco', { semFrente: !temFrente });
    return { passos, furos: fs };
  }
  window.LegnoMontagem = { montarPassos, classificaFuro, classificaCaixa };

  if (localStorage.getItem('legno_montagem_off') === '1') return;

  // ---- dados do módulo ---------------------------------------------------
  async function dadosDoSlot(slot) {
    if (typeof Drilling === 'undefined' || !Drilling.holesNoModulo || !Drilling._internals) throw new Error('sem motor de furação');
    if (typeof projectDrillingsByComponent === 'undefined' || !projectDrillingsByComponent) {
      const p = (typeof ensureProjectDrillingCatalog === 'function') ? ensureProjectDrillingCatalog() : null;
      if (p && p.then) await p;
    }
    const W = Number(slot.width_mm) || 0, H = Number(slot.height_mm) || 0, D = Number(slot.depth_mm) || 0;
    const pecas = (typeof projectSlotEffectivePiecesWithLeds === 'function') ? projectSlotEffectivePiecesWithLeds(slot, {}) : projectSlotEffectivePieces(slot);
    const parts = resolvePiecesForViewer(pecas, { W, H, D }, slot.colorsByRole, slot.shelfQuantities, slot.dimOverrides, slot.pieceColorOverrides) || [];
    const config = { drillingsByComponent: projectDrillingsByComponent, holesByPattern: projectHolesByPattern, settings: projectDrillingSettings };
    const furos = Drilling.holesNoModulo(parts, W, H, D, config) || [];
    const I = Drilling._internals;
    const vistos = {}, brutas = [];
    I.buildBoxes(parts, W, H, D).boxes.concat(I.boxesAninhadas(parts, W, H, D)).forEach((b) => {
      if (!b || !b.part || !b.t) return;
      const k = chaveCaixa(b);
      if (vistos[k]) return;
      vistos[k] = true; brutas.push(b);
    });
    const comCopo = {};
    furos.forEach((h) => { if (h.tipo === 'copo_dobradica') comCopo[h.cx] = true; });
    const caixas = brutas.map((b) => ({ chave: chaveCaixa(b), papel: classificaCaixa(b, comCopo[chaveCaixa(b)]), x0: b.x0, y0: b.y0, z0: b.z0, sx: b.sx, sy: b.sy, sz: b.sz, nome: b.part.reference || '' }))
      .filter((c) => c.papel && c.sx > 0 && c.sy > 0 && c.sz > 0);
    return Object.assign({ W, H, D, caixas }, montarPassos(caixas, furos));
  }

  // ---- ícones e desenhos (SVG feito aqui, sem arquivo) ----------------------
  // MANUAL (17/11, Matt, com o manual da ZBOM de referência: "quero fazer um
  // passo a passo assim, mostrar onde coloca o pino minifix, a cavilha, pode
  // ser até em pequenos vídeos, mostrando qual melhor ferramenta"):
  // página de peças (cada chapa com os pontos das ferragens), cada passo em
  // animação que repete (o "vídeo"), ferramenta por passo, "De perto" e
  // gravar o passo em vídeo (MediaRecorder do próprio canvas).
  const SVG = (inner, vb) => `<svg viewBox="${vb || '0 0 32 32'}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  const ICONE_FERRAGEM = {
    pino: SVG('<rect x="12.5" y="3" width="7" height="6" rx="1.2"/><path d="M14.5 9v19h3V9M14.5 13l3 1.5M14.5 17l3 1.5M14.5 21l3 1.5M14.5 25l3 1.5"/>'),
    cavilha: SVG('<rect x="12" y="4" width="8" height="24" rx="3"/><path d="M12 9h8M12 13h8M12 17h8M12 21h8M12 25h8"/>'),
    tambor: SVG('<circle cx="16" cy="16" r="11"/><path d="M11 16h10M16 11v10"/><path d="M16 4.5l2.2 3h-4.4z" fill="currentColor"/>'),
    suporte: SVG('<path d="M9 9h6v7h9v4H9z"/><path d="M12 20v8"/>'),
    calco: SVG('<rect x="5" y="11" width="22" height="10" rx="2"/><circle cx="10" cy="16" r="1.6"/><circle cx="22" cy="16" r="1.6"/>'),
    corredica: SVG('<rect x="2" y="12" width="28" height="8" rx="1"/><path d="M2 16h28"/><circle cx="7" cy="16" r="1"/><circle cx="25" cy="16" r="1"/>'),
    copo: SVG('<circle cx="11" cy="16" r="6"/><path d="M17 14h11v4H17"/>')
  };
  const ICONE_FERRAMENTA = {
    phillips: SVG('<rect x="3" y="20" width="12" height="7" rx="3.5" transform="rotate(-45 9 23.5)"/><path d="M14 18L27 5"/><path d="M25 3l4 4"/>'),
    parafusadeira: SVG('<path d="M3 8h17l3 3.5-3 3.5H3z"/><path d="M23 11.5h6"/><path d="M7 15l-1.5 13h6.5l1.5-13"/>'),
    martelo: SVG('<rect x="3" y="4" width="18" height="10" rx="2.5"/><path d="M12 14v15"/>'),
    mao: SVG('<path d="M9 17V9a2 2 0 0 1 4 0v6M13 14V6a2 2 0 0 1 4 0v8M17 14V8a2 2 0 0 1 4 0v9c0 6-3 10-8 10-4 0-6-2-8-6l-1.5-3a2 2 0 0 1 3.2-2.2L9 18"/>')
  };
  const FERRAMENTAS_DO_PASSO = { s1: ['phillips', 'martelo'], s2: ['parafusadeira'], s3: ['mao'], s4: ['mao', 'martelo'], s5: ['phillips'], s6: ['mao'], s7: ['phillips'] };
  const COR_FERRAGEM = { pino: '#e8590c', cavilha: '#a8722f', tambor: '#2b6cb0', suporte: '#6b6b6b', calco: '#6b6b6b', corredica: '#6b6b6b', copo: '#6b6b6b' };

  // desenho de detalhe (corte da chapa) dos passos que mais confundem
  function detalhe(id) {
    const chapa = '#f2e7d5', linha = '#3a3a3a', lar = '#e8590c';
    if (id === 's1') {
      return `<svg viewBox="0 0 260 112" class="po-mont-det">
        <rect x="8" y="64" width="244" height="40" fill="${chapa}" stroke="${linha}"/>
        <rect x="61" y="64" width="8" height="22" fill="#fff" stroke="${linha}"/>
        <text x="74" y="98" font-size="11" fill="${linha}">Ø5</text>
        <rect x="56" y="14" width="18" height="9" rx="2" fill="${lar}"/>
        <rect x="61" y="23" width="8" height="30" fill="${lar}"/>
        <path d="M61 30h8M61 36h8M61 42h8M61 48h8" stroke="#fff" stroke-width="1"/>
        <path d="M44 22a21 9 0 0 0 42 0" fill="none" stroke="${linha}" stroke-width="1.5"/>
        <path d="M86 22l-5 -1 3 5z" fill="${linha}"/>
        <path d="M65 55v6" stroke="${linha}" stroke-width="1.5"/>
        <text x="92" y="20" font-size="11" fill="${linha}">${T('leg_pino')}</text>
        <rect x="163" y="64" width="14" height="24" fill="#fff" stroke="${linha}"/>
        <text x="182" y="98" font-size="11" fill="${linha}">Ø8</text>
        <rect x="164" y="20" width="12" height="34" rx="3" fill="#c9a46a" stroke="${linha}"/>
        <path d="M164 27h12M164 34h12M164 41h12M164 48h12" stroke="${linha}" stroke-width=".8"/>
        <path d="M170 55v6" stroke="${linha}" stroke-width="1.5"/>
        <rect x="196" y="4" width="40" height="15" rx="4" fill="#444"/>
        <path d="M216 19l14 30" stroke="#8a6a3a" stroke-width="5" stroke-linecap="round"/>
        <text x="120" y="38" font-size="11" fill="${linha}">${T('leg_cavilha')}</text>
      </svg>`;
    }
    if (id === 's5') {
      return `<svg viewBox="0 0 260 112" class="po-mont-det">
        <rect x="40" y="10" width="212" height="92" fill="${chapa}" stroke="${linha}"/>
        <rect x="40" y="10" width="6" height="92" fill="#d9c7a8"/>
        <path d="M6 56h40" stroke="${lar}" stroke-width="6" stroke-linecap="round" stroke-dasharray="1 0"/>
        <rect x="2" y="50" width="8" height="12" rx="2" fill="${lar}"/>
        <circle cx="96" cy="56" r="17" fill="#d4dbe6" stroke="#2b6cb0" stroke-width="2"/>
        <path d="M88 56h16" stroke="#2b6cb0" stroke-width="2"/>
        <path d="M79 56l-24 0" stroke="${linha}" stroke-width="1.5"/>
        <path d="M55 56l6 -4v8z" fill="${linha}"/>
        <path d="M120 40a26 26 0 0 1 0 32" fill="none" stroke="${linha}" stroke-width="1.5"/>
        <path d="M120 72l-1 -6 5 3z" fill="${linha}"/>
        <text x="130" y="52" font-size="11" fill="${linha}">½</text>
        <text x="130" y="66" font-size="11" fill="${linha}">↻</text>
        <text x="150" y="40" font-size="11" fill="${linha}">${T('leg_tambor')}</text>
        <text x="8" y="44" font-size="11" fill="${linha}">${T('leg_pino')}</text>
      </svg>`;
    }
    return '';
  }

  // chapa vista de frente, com os pontos de cada ferragem
  function desenhoChapa(c, furos) {
    const eixos = ['x', 'y', 'z'], tam = { x: c.sx, y: c.sy, z: c.sz };
    const tAx = eixos.slice().sort((a, b) => tam[a] - tam[b])[0];
    const outros = eixos.filter((a) => a !== tAx);
    let u, v;
    if (outros.indexOf('y') !== -1) { v = 'y'; u = outros.find((a) => a !== 'y'); }
    else { u = tam[outros[0]] >= tam[outros[1]] ? outros[0] : outros[1]; v = outros.find((a) => a !== u); }
    const LW = 132, LH = 96, k = Math.min(LW / tam[u], LH / tam[v]);
    const w = tam[u] * k, h = tam[v] * k, ox = (LW - w) / 2 + 4, oy = (LH - h) / 2 + 4;
    const pontos = furos.filter((f) => f.cx === c.chave && f.kind).map((f) => {
      const px = ox + (f[u] - c[u + '0']) * k, py = oy + h - (f[v] - c[v + '0']) * k;
      const r = f.kind === 'tambor' ? 3.2 : 2.3;
      return `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${r}" fill="${COR_FERRAGEM[f.kind] || '#6b6b6b'}"/>`;
    }).join('');
    return `<svg viewBox="0 0 ${LW + 8} ${LH + 8}" class="po-mont-chapa-svg"><rect x="${ox.toFixed(1)}" y="${oy.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="#f6eedf" stroke="#3a3a3a" stroke-width="1"/>${pontos}</svg>`;
  }

  function htmlPecas(dados) {
    const grupos = [];
    dados.caixas.forEach((c) => {
      const med = [c.sx, c.sy, c.sz].map((n) => Math.round(n)).sort((a, b) => b - a);
      const k = c.nome + '|' + med.join('x');
      const g = grupos.find((x) => x.k === k);
      if (g) g.n++; else grupos.push({ k, c, med, n: 1 });
    });
    const conta = {};
    dados.furos.forEach((h) => { if (h.kind) conta[h.kind] = (conta[h.kind] || 0) + 1; });
    const ferr = Object.keys(conta).map((k) => `<span class="po-mont-chip">${ICONE_FERRAGEM[k] || ''}${conta[k]} × ${T('n_' + k)}</span>`).join('');
    const usadas = [];
    dados.passos.forEach((p) => (FERRAMENTAS_DO_PASSO[p.id] || []).forEach((f) => { if (usadas.indexOf(f) === -1) usadas.push(f); }));
    const ferramentas = usadas.map((f) => `<span class="po-mont-tool-item">${ICONE_FERRAMENTA[f]}${T('t_' + f)}</span>`).join('');
    const cards = grupos.map((g) => `<div class="po-mont-chapa">${desenhoChapa(g.c, dados.furos)}<b>${g.n > 1 ? g.n + ' × ' : ''}${nmEscM(g.c.nome || '—')}</b><small>${g.med.join(' × ')} mm</small></div>`).join('');
    const legenda = ['pino', 'cavilha', 'tambor'].filter((k) => conta[k]).map((k) => `<span><i style="background:${COR_FERRAGEM[k]}"></i>${T('leg_' + k)}</span>`).join('')
      + (Object.keys(conta).some((k) => ['pino', 'cavilha', 'tambor'].indexOf(k) === -1) ? `<span><i style="background:#6b6b6b"></i>${T('leg_outro')}</span>` : '');
    return `<div class="po-mont-pecas">
      <p class="po-mont-d">${T('pecas_d')}</p>
      <h4>${T('chapas')}</h4><div class="po-mont-legenda">${legenda}</div><div class="po-mont-chapas">${cards}</div>
      <h4>${T('ferragens')}</h4><div class="po-mont-chips">${ferr}</div>
      <h4>${T('ferramentas')}</h4><div class="po-mont-tools">${ferramentas}</div>
    </div>`;
  }
  function nmEscM(s) { return String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }

  // ---- cena ----------------------------------------------------------------
  let cena = null;   // { renderer, scene, camera, controls, raf, grupo, anim }
  function iniciaCena(holder) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setClearColor(0xf4f4f4, 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    holder.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const sol = new THREE.DirectionalLight(0xffffff, 0.55); sol.position.set(2, 4, 3); scene.add(sol);
    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 50);
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false; controls.enablePan = false;
    const c = { renderer, scene, camera, controls, grupo: null, holder, anim: null };
    const medir = () => {
      const w = holder.clientWidth || 300, h = holder.clientHeight || 300;
      renderer.setSize(w, h, false); renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
      camera.aspect = w / h; camera.updateProjectionMatrix();
    };
    c.medir = medir; medir();
    window.addEventListener('resize', medir);
    const loop = (agora) => {
      c.raf = requestAnimationFrame(loop);
      if (c.anim) c.anim.tick(agora || performance.now());
      controls.update(); renderer.render(scene, camera);
    };
    loop();
    return c;
  }
  function encerraCena() {
    if (!cena) return;
    cancelAnimationFrame(cena.raf);
    window.removeEventListener('resize', cena.medir);
    if (cena.gravador && cena.gravador.state !== 'inactive') { try { cena.gravador.stop(); } catch (e) { /* já parou */ } }
    try { cena.renderer.dispose(); cena.renderer.domElement.remove(); } catch (e) { /* já saiu */ }
    cena = null;
  }
  const MAT = {
    forte: () => new THREE.MeshStandardMaterial({ color: 0xf2e7d5, transparent: true, opacity: 0.55, roughness: 0.9, depthWrite: false }),
    fraco: () => new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, roughness: 1, depthWrite: false })
  };
  const MAT_FERRAGEM = () => new THREE.MeshStandardMaterial({ color: 0xe8590c, metalness: 0.3, roughness: 0.5 });

  // animação do passo = lista de itens { obj, de (deslocamento inicial, m), t0, t1, eixo, giro, g0, g1 }
  const suave = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
  const limita = (p) => Math.max(0, Math.min(1, p));
  function criaAnim(itens) {
    const fim = itens.reduce((m, i) => Math.max(m, i.t1 || 0, i.g1 || 0), 0);
    const a = { itens, dur: Math.max(fim + 1.4, 1.5), t: 0, tocando: true, ultimo: null };
    itens.forEach((i) => { i.base = i.obj.position.clone(); i.baseQ = i.obj.quaternion.clone(); });
    const q = new THREE.Quaternion();
    a.aplica = (t) => itens.forEach((i) => {
      const p = suave(limita((t - i.t0) / Math.max(i.t1 - i.t0, 0.01)));
      i.obj.position.copy(i.base).addScaledVector(i.de, 1 - p);
      if (i.eixo && i.giro) {
        const pg = suave(limita((t - i.g0) / Math.max(i.g1 - i.g0, 0.01)));
        q.setFromAxisAngle(i.eixo, i.giro * (pg - 1));   // termina na posição de montado
        i.obj.quaternion.copy(i.baseQ).premultiply(q);
      }
    });
    a.tick = (agora) => {
      if (a.ultimo == null) a.ultimo = agora;
      const dt = Math.min((agora - a.ultimo) / 1000, 0.1);
      a.ultimo = agora;
      if (a.tocando) { a.t += dt; if (a.t > a.dur) a.t = 0; }
      a.aplica(a.t);
    };
    a.aplica(0);
    return a;
  }

  function desenhaPasso(dados, passo) {
    if (cena.grupo) cena.scene.remove(cena.grupo);
    const g = new THREE.Group();
    const W = dados.W / 1000, D = dados.D / 1000;
    const pos = (x, y, z) => new THREE.Vector3(x / 1000 - W / 2, y / 1000, z / 1000 - D / 2);
    const centroMod = new THREE.Vector3(0, dados.H / 2000, 0);
    const porCaixa = {}, caixasVis = [];
    dados.caixas.forEach((c) => {
      const modo = passo.mostra(c);
      if (!modo) return;
      const gc = new THREE.Group();
      const geo = new THREE.BoxGeometry(c.sx / 1000, c.sy / 1000, c.sz / 1000);
      const m = new THREE.Mesh(geo, MAT[modo]());
      m.position.copy(pos(c.x0 + c.sx / 2, c.y0 + c.sy / 2, c.z0 + c.sz / 2));
      m.renderOrder = 1;
      gc.add(m);
      const linhas = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: modo === 'forte' ? 0x3a3a3a : 0xb5b5b5 }));
      linhas.position.copy(m.position);
      gc.add(linhas);
      g.add(gc);
      porCaixa[c.chave] = gc;
      caixasVis.push({ c, gc, modo, centro: m.position.clone() });
    });
    // ferragem: cada furo num "pivô" no centro do furo (pra entrar e girar no eixo dele)
    const furos = dados.furos.filter((h) => h.kind && passo.kinds.indexOf(h.kind) !== -1 && porCaixa[h.cx])
      .sort((a, b) => (a.cx < b.cx ? -1 : a.cx > b.cx ? 1 : b.y - a.y));
    const pivos = [];
    const temHW = typeof Viewer3D !== 'undefined' && Viewer3D.buildHardwareGroup;
    if (temHW) {
      const pinta = (o) => o.traverse((x) => { if (x.isMesh) x.material = MAT_FERRAGEM(); });
      const corr = furos.filter((h) => h.kind === 'corredica');
      if (corr.length) {
        try {
          const fg = Viewer3D.buildHardwareGroup(corr, dados.W, dados.H, dados.D);
          if (fg) { pinta(fg); const pv = new THREE.Group(); pv.add(fg); (porCaixa[corr[0].cx] || g).add(pv); pivos.push({ h: corr[0], pv }); }
        } catch (e) { console.warn('[montagem] corrediça:', e); }
      }
      furos.filter((h) => h.kind !== 'corredica').forEach((h) => {
        try {
          const fg = Viewer3D.buildHardwareGroup([h], dados.W, dados.H, dados.D);
          if (!fg) return;
          pinta(fg);
          const P = pos(h.x, h.y, h.z);
          const pv = new THREE.Group();
          pv.position.copy(P); fg.position.copy(P).multiplyScalar(-1);
          pv.add(fg);
          porCaixa[h.cx].add(pv);
          pivos.push({ h, pv });
        } catch (e) { console.warn('[montagem] ferragem:', e); }
      });
    }
    // ---- o "vídeo" de cada passo ----
    const itens = [];
    const normal = (h) => new THREE.Vector3(h.nx, h.ny, h.nz).normalize();
    const escalona = (n, maxTotal, passoMax) => Math.min(passoMax, maxTotal / Math.max(n, 1));
    const vaiPros = (lista, fn) => lista.forEach(fn);
    if (passo.id === 's1' || passo.id === 's2' || passo.id === 's3') {
      const st = escalona(pivos.length, 3.2, 0.18);
      vaiPros(pivos, (p, k) => {
        const n = normal(p.h);
        const t0 = 0.3 + k * st, t1 = t0 + 0.7;
        const gira = p.h.kind === 'pino';
        itens.push({ obj: p.pv, de: n.clone().multiplyScalar(p.h.kind === 'pino' || p.h.kind === 'cavilha' ? 0.07 : 0.05), t0, t1,
          eixo: gira ? n : null, giro: gira ? Math.PI * 6 : 0, g0: t0, g1: t1 });
      });
    } else if (passo.id === 's5') {
      const st = escalona(pivos.length, 3, 0.25);
      vaiPros(pivos, (p, k) => {
        const n = normal(p.h);
        const t0 = 0.3 + k * st, t1 = t0 + 0.45;
        itens.push({ obj: p.pv, de: n.clone().multiplyScalar(0.05), t0, t1, eixo: n, giro: Math.PI, g0: t1 + 0.1, g1: t1 + 0.8 });
      });
    } else if (passo.id === 's4') {
      // a lateral da esquerda fica parada; o resto chega até ela, um por vez
      const corpo = caixasVis.filter((v) => v.modo === 'forte');
      const lados = corpo.filter((v) => v.c.papel === 'lado').sort((a, b) => a.c.x0 - b.c.x0);
      const fixa = lados[0] || corpo[0];
      const ordem = corpo.filter((v) => v !== fixa).sort((a, b) => {
        const pa = a.c.papel === 'lado' ? 3 : (a.c.papel === 'fundo' ? 2 : 1), pb = b.c.papel === 'lado' ? 3 : (b.c.papel === 'fundo' ? 2 : 1);
        return pa - pb || a.c.y0 - b.c.y0;
      });
      ordem.forEach((v, k) => {
        let dir = v.centro.clone().sub(centroMod);
        if (fixa) { const dx = v.centro.x - fixa.centro.x; dir.x = Math.abs(dx) > 0.01 ? dir.x + dx * 0.5 : dir.x; }
        if (dir.length() < 0.01) dir = new THREE.Vector3(0, 1, 0);
        dir.normalize();
        const t0 = 0.4 + k * 0.75;
        itens.push({ obj: v.gc, de: dir.multiplyScalar(0.28), t0, t1: t0 + 0.8 });
      });
    } else if (passo.id === 's6') {
      caixasVis.filter((v) => v.c.papel === 'prat').forEach((v, k) => {
        const t0 = 0.4 + k * 0.6;
        itens.push({ obj: v.gc, de: new THREE.Vector3(0, 0.16, 0.12), t0, t1: t0 + 0.9 });
      });
    } else if (passo.id === 's7') {
      caixasVis.filter((v) => v.c.papel === 'porta' || v.c.papel === 'outro').forEach((v, k) => {
        const t0 = 0.4 + k * 0.5;
        itens.push({ obj: v.gc, de: new THREE.Vector3(0, 0, 0.3), t0, t1: t0 + 0.9 });
      });
    }
    cena.scene.add(g); cena.grupo = g;
    cena.anim = criaAnim(itens);
    // enquadra o passo inteiro: chapas destacadas + de onde as coisas vêm
    const caixaVista = new THREE.Box3();
    caixasVis.forEach((v) => { if (v.modo === 'forte') v.gc.children.forEach((o) => { if (o.isMesh) caixaVista.expandByObject(o); }); });
    if (caixaVista.isEmpty()) caixaVista.setFromObject(g);
    itens.forEach((i) => {
      if (i.obj === undefined) return;
      const b = new THREE.Box3().setFromObject(i.obj);
      if (!b.isEmpty()) { caixaVista.expandByPoint(b.min.clone().add(i.de)); caixaVista.expandByPoint(b.max.clone().add(i.de)); }
    });
    cena.passoVista = caixaVista.clone();
    cena.pivos = pivos;
    enquadra(caixaVista);
  }
  function enquadra(caixa) {
    if (!caixa || caixa.isEmpty()) return;
    const centro = caixa.getCenter(new THREE.Vector3()), tam = caixa.getSize(new THREE.Vector3());
    const raio = Math.max(tam.length() / 2, 0.15);
    const dist = raio / Math.sin((cena.camera.fov * Math.PI / 180) / 2) * 1.0;
    cena.controls.target.copy(centro);
    cena.camera.position.copy(centro).add(new THREE.Vector3(0.75, 0.55, 1).normalize().multiplyScalar(dist));
    cena.camera.near = dist / 100; cena.camera.far = dist * 20; cena.camera.updateProjectionMatrix();
  }
  // "De perto": câmera na 1ª ferragem do passo, olhando de fora da chapa
  function dePerto(on) {
    if (!cena) return;
    if (!on || !cena.pivos || !cena.pivos.length) { enquadra(cena.passoVista); return; }
    const h = cena.pivos[0].h;
    const W = estado.dados.W / 1000, D = estado.dados.D / 1000;
    const P = new THREE.Vector3(h.x / 1000 - W / 2, h.y / 1000, h.z / 1000 - D / 2);
    const n = new THREE.Vector3(h.nx, h.ny, h.nz).normalize();
    const lado = Math.abs(n.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    cena.controls.target.copy(P);
    cena.camera.position.copy(P).addScaledVector(n, 0.2).addScaledVector(lado, 0.08).add(new THREE.Vector3(0.05, 0, 0.05));
    cena.camera.near = 0.002; cena.camera.far = 20; cena.camera.updateProjectionMatrix();
  }
  // grava UMA volta do passo em vídeo (webm/mp4, o que o navegador souber)
  function gravaVideo(botao) {
    if (!cena || !cena.anim || cena.gravador) return;
    const cv = cena.renderer.domElement;
    if (!cv.captureStream || typeof MediaRecorder === 'undefined') { alertaSemVideo(); return; }
    const tipos = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
    const tipo = tipos.find((t) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
    const pedacos = [];
    let rec;
    try { rec = new MediaRecorder(cv.captureStream(30), tipo ? { mimeType: tipo } : undefined); } catch (e) { alertaSemVideo(); return; }
    cena.gravador = rec;
    const txt = botao.textContent;
    botao.textContent = T('gravando'); botao.disabled = true;
    rec.ondataavailable = (ev) => { if (ev.data && ev.data.size) pedacos.push(ev.data); };
    rec.onstop = () => {
      botao.textContent = txt; botao.disabled = false;
      if (cena) cena.gravador = null;
      const blob = new Blob(pedacos, { type: tipo || 'video/webm' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'montagem-passo-' + estado.i + (/mp4/.test(tipo) ? '.mp4' : '.webm');
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    };
    cena.anim.t = 0; cena.anim.tocando = true;
    rec.start();
    setTimeout(() => { if (rec.state !== 'inactive') rec.stop(); }, Math.ceil(cena.anim.dur * 1000));
  }
  function alertaSemVideo() { console.warn('[montagem] este navegador não grava vídeo do canvas'); }

  // ---- tela ------------------------------------------------------------------
  function estilos() {
    if (document.getElementById('po-mont-css')) return;
    const st = document.createElement('style');
    st.id = 'po-mont-css';
    st.textContent = `
#po-mont-modal{position:fixed;inset:0;z-index:2500;background:rgba(20,20,20,.45);display:flex;align-items:center;justify-content:center;font-family:inherit}
#po-mont-modal .po-mont-card{background:#fff;width:min(980px,100vw);height:min(760px,100dvh);border-radius:14px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.25)}
@media (max-width:700px){#po-mont-modal .po-mont-card{border-radius:0;width:100vw;height:100dvh}}
#po-mont-modal .po-mont-head{display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid #e6e6e6}
#po-mont-modal .po-mont-head h3{margin:0;font-size:16px;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#1f1f1f}
#po-mont-modal .po-mont-x{border:0;background:#f1f1f1;color:#1f1f1f;padding:0;line-height:1;border-radius:8px;width:34px;height:34px;font-size:18px;cursor:pointer}
#po-mont-modal .po-mont-3d{flex:1;min-height:180px;position:relative;background:#f4f4f4;touch-action:none}
#po-mont-modal .po-mont-dica{position:absolute;left:10px;bottom:6px;font-size:11px;color:#8a8a8a;pointer-events:none}
#po-mont-modal .po-mont-ctl{position:absolute;right:8px;top:8px;display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
#po-mont-modal .po-mont-ctl button{border:1px solid #d6d6d6;background:rgba(255,255,255,.92);color:#1f1f1f;border-radius:8px;padding:6px 10px;font-size:13px;cursor:pointer}
#po-mont-modal .po-mont-ctl button.on{background:#1f1f1f;color:#fff;border-color:#1f1f1f}
#po-mont-modal .po-mont-ctl button:disabled{opacity:.6;cursor:default}
#po-mont-modal .po-mont-txt{padding:12px 16px 6px;max-height:46%;overflow:auto}
#po-mont-modal .po-mont-n{font-size:12px;color:#8a8a8a;text-transform:uppercase;letter-spacing:.04em}
#po-mont-modal .po-mont-t{font-size:19px;font-weight:700;margin:2px 0 6px;color:#1f1f1f}
#po-mont-modal .po-mont-d{font-size:15px;line-height:1.45;margin:0 0 8px;color:#222}
#po-mont-modal .po-mont-chips{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 8px}
#po-mont-modal .po-mont-chip{display:inline-flex;align-items:center;gap:5px;background:#fff1e8;color:#b8430a;border:1px solid #f6c9ad;border-radius:999px;padding:3px 10px 3px 6px;font-size:13px;font-weight:600}
#po-mont-modal .po-mont-chip svg{width:18px;height:18px}
#po-mont-modal .po-mont-tools{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 8px}
#po-mont-modal .po-mont-tool-item{display:inline-flex;align-items:center;gap:6px;background:#f3f3f3;border-radius:8px;padding:5px 10px 5px 6px;font-size:13px;color:#1f1f1f}
#po-mont-modal .po-mont-tool-item svg{width:24px;height:24px}
#po-mont-modal .po-mont-tip{font-size:13px;color:#555;margin:0 0 6px;padding-left:10px;border-left:3px solid #e8590c}
#po-mont-modal .po-mont-det{width:100%;max-width:340px;height:auto;display:block;margin:4px 0 8px}
#po-mont-modal .po-mont-nav{display:flex;gap:10px;padding:10px 14px calc(10px + env(safe-area-inset-bottom));border-top:1px solid #e6e6e6}
#po-mont-modal .po-mont-nav button{flex:1;padding:12px;font-size:15px;border-radius:10px;border:1px solid #cfcfcf;background:#fff;color:#1f1f1f;cursor:pointer}
#po-mont-modal .po-mont-nav button.pri{background:#1f1f1f;color:#fff;border-color:#1f1f1f}
#po-mont-modal .po-mont-nav button:disabled{opacity:.35;cursor:default}
#po-mont-modal .po-mont-pontos{display:flex;gap:5px;justify-content:center;padding:6px 0 0}
#po-mont-modal .po-mont-pontos i{width:7px;height:7px;border-radius:50%;background:#d6d6d6}
#po-mont-modal .po-mont-pontos i.on{background:#e8590c}
#po-mont-modal .po-mont-pecas{flex:1;overflow:auto;padding:12px 16px}
#po-mont-modal .po-mont-pecas h4{margin:12px 0 6px;font-size:14px;color:#1f1f1f;text-transform:uppercase;letter-spacing:.04em}
#po-mont-modal .po-mont-chapas{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
#po-mont-modal .po-mont-chapa{border:1px solid #e3e3e3;border-radius:10px;padding:6px;display:flex;flex-direction:column;align-items:center;text-align:center;gap:2px}
#po-mont-modal .po-mont-chapa b{font-size:13px;color:#1f1f1f}
#po-mont-modal .po-mont-chapa small{font-size:11px;color:#888}
#po-mont-modal .po-mont-chapa-svg{width:100%;height:auto}
#po-mont-modal .po-mont-legenda{display:flex;gap:12px;flex-wrap:wrap;font-size:12px;color:#555;margin:0 0 6px}
#po-mont-modal .po-mont-legenda i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:4px;vertical-align:-1px}
#po-mont-modal .po-mont-lista{padding:10px 14px;overflow:auto;flex:1}
#po-mont-modal .po-mont-lista button{display:block;width:100%;text-align:left;padding:12px;margin:0 0 8px;border:1px solid #ddd;border-radius:10px;background:#fff;color:#1f1f1f;font-size:15px;cursor:pointer}
#po-mont-modal .po-mont-lista button:hover{background:#f6f3ee}
#po-mont-modal .po-mont-msg{padding:30px 18px;text-align:center;color:#555;flex:1}`;
    document.head.appendChild(st);
  }
  function fecha() {
    encerraCena();
    const m = document.getElementById('po-mont-modal');
    if (m) m.remove();
    document.removeEventListener('keydown', teclas);
  }
  let estado = null;   // { dados, i } — i = 0 é a página de peças, i ≥ 1 é o passo i
  function teclas(ev) {
    if (ev.key === 'Escape') fecha();
    else if (estado && ev.key === 'ArrowRight') vai(estado.i + 1);
    else if (estado && ev.key === 'ArrowLeft') vai(estado.i - 1);
    else if (estado && ev.key === ' ' && cena && cena.anim && estado.i > 0) { ev.preventDefault(); alternaPlay(); }
  }
  function casca(titulo) {
    estilos(); fecha();
    const m = document.createElement('div');
    m.id = 'po-mont-modal';
    m.innerHTML = `<div class="po-mont-card"><div class="po-mont-head"><h3></h3><button type="button" class="po-mont-x" title="${T('fechar')}">✕</button></div><div class="po-mont-corpo" style="display:flex;flex-direction:column;flex:1;min-height:0"></div></div>`;
    m.querySelector('h3').textContent = titulo;
    m.querySelector('.po-mont-x').addEventListener('click', fecha);
    m.addEventListener('click', (ev) => { if (ev.target === m) fecha(); });
    document.body.appendChild(m);
    document.addEventListener('keydown', teclas);
    return m.querySelector('.po-mont-corpo');
  }
  function nomeDoSlot(slot) {
    const n = (slot.module && slot.module.name) || '';
    const u = (v) => Math.round(Number(v) || 0);
    return n + ' — ' + u(slot.width_mm) + ' × ' + u(slot.height_mm) + ' × ' + u(slot.depth_mm) + ' mm';
  }
  function alternaPlay() {
    if (!cena || !cena.anim) return;
    cena.anim.tocando = !cena.anim.tocando;
    const b = document.querySelector('#po-mont-modal .po-mont-play');
    if (b) b.textContent = cena.anim.tocando ? T('pause') : T('play');
  }
  function vai(i) {
    if (!estado) return;
    const { dados } = estado, total = dados.passos.length;
    if (i > total) { fecha(); return; }
    if (i < 0) return;
    estado.i = i; estado.perto = false;
    const m = document.getElementById('po-mont-modal');
    if (!m) return;
    const ehPecas = i === 0;
    m.querySelector('.po-mont-3d').style.display = ehPecas ? 'none' : '';
    const tx = m.querySelector('.po-mont-passo');
    tx.style.display = ehPecas ? 'none' : '';
    const pecas = m.querySelector('.po-mont-pecas-wrap');
    pecas.style.display = ehPecas ? 'flex' : 'none';
    m.querySelector('.po-mont-pontos').innerHTML = [0].concat(dados.passos.map((_, k) => k + 1)).map((k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('');
    const ant = m.querySelector('.po-mont-ant'), prox = m.querySelector('.po-mont-prox');
    ant.disabled = i === 0;
    prox.textContent = i === total ? T('fim') : T('prox');
    if (ehPecas) { if (cena) cena.anim = null; return; }
    const p = dados.passos[i - 1];
    tx.querySelector('.po-mont-n').textContent = T('passo', { n: i, t: total });
    tx.querySelector('.po-mont-t').textContent = T(p.id + '_t');
    tx.querySelector('.po-mont-d').textContent = T(p.id === 's7' && p.semFrente ? 's7_d_sem' : p.id + '_d');
    const chips = Object.keys(p.conta).map((k) => `<span class="po-mont-chip">${ICONE_FERRAGEM[k] || ''}${p.conta[k]} × ${T('n_' + k)}</span>`).join('');
    tx.querySelector('.po-mont-chips').innerHTML = (p.id === 's4' || (p.id === 's7' && p.semFrente)) ? '' : chips;
    tx.querySelector('.po-mont-tools').innerHTML = (FERRAMENTAS_DO_PASSO[p.id] || []).map((f) => `<span class="po-mont-tool-item">${ICONE_FERRAMENTA[f]}${T('t_' + f)}</span>`).join('');
    tx.querySelector('.po-mont-tip').textContent = (p.id === 's7' && p.semFrente) ? '' : T('dica_' + p.id);
    tx.querySelector('.po-mont-tip').style.display = (p.id === 's7' && p.semFrente) ? 'none' : '';
    tx.querySelector('.po-mont-detwrap').innerHTML = detalhe(p.id);
    if (cena) cena.medir();
    desenhaPasso(dados, p);
    const play = m.querySelector('.po-mont-play'), perto = m.querySelector('.po-mont-perto');
    play.textContent = T('pause');
    perto.textContent = T('perto'); perto.classList.remove('on');
    perto.style.display = (['s1', 's2', 's3', 's5'].indexOf(p.id) !== -1 && cena && cena.pivos && cena.pivos.length) ? '' : 'none';
  }
  async function abre(slot) {
    const corpo = casca(T('titulo') + ' · ' + nomeDoSlot(slot));
    corpo.innerHTML = `<div class="po-mont-msg">${T('carregando')}</div>`;
    let dados;
    try { dados = await dadosDoSlot(slot); } catch (e) {
      console.error('[montagem]', e);
      corpo.innerHTML = `<div class="po-mont-msg">${T('erro')}</div>`;
      return;
    }
    if (!document.getElementById('po-mont-modal')) return;   // fechou enquanto carregava
    if (!dados.caixas.length || !dados.furos.some((h) => h.kind)) { corpo.innerHTML = `<div class="po-mont-msg">${T('vazio')}</div>`; return; }
    corpo.innerHTML = `<div class="po-mont-pecas-wrap" style="display:none;flex:1;min-height:0;flex-direction:column"><div class="po-mont-txt" style="padding-bottom:0"><div class="po-mont-t">${T('pecas_t')}</div></div>${htmlPecas(dados)}</div>
      <div class="po-mont-3d"><span class="po-mont-dica">${T('gire')}</span>
        <div class="po-mont-ctl"><button type="button" class="po-mont-play">${T('pause')}</button><button type="button" class="po-mont-replay">${T('replay')}</button><button type="button" class="po-mont-perto">${T('perto')}</button><button type="button" class="po-mont-video">${T('video')}</button></div></div>
      <div class="po-mont-txt po-mont-passo"><div class="po-mont-n"></div><div class="po-mont-t"></div><p class="po-mont-d"></p><div class="po-mont-detwrap"></div><div class="po-mont-chips"></div><div class="po-mont-tools"></div><p class="po-mont-tip"></p></div>
      <div class="po-mont-pontos"></div>
      <div class="po-mont-nav"><button type="button" class="po-mont-ant">${T('ant')}</button><button type="button" class="pri po-mont-prox">${T('prox')}</button></div>`;
    cena = iniciaCena(corpo.querySelector('.po-mont-3d'));
    estado = { dados, i: 0, perto: false };
    corpo.querySelector('.po-mont-ant').addEventListener('click', () => vai(estado.i - 1));
    corpo.querySelector('.po-mont-prox').addEventListener('click', () => vai(estado.i + 1));
    corpo.querySelector('.po-mont-play').addEventListener('click', alternaPlay);
    corpo.querySelector('.po-mont-replay').addEventListener('click', () => {
      if (!cena || !cena.anim) return;
      cena.anim.t = 0; cena.anim.tocando = true;
      corpo.querySelector('.po-mont-play').textContent = T('pause');
    });
    corpo.querySelector('.po-mont-perto').addEventListener('click', (ev) => {
      estado.perto = !estado.perto;
      ev.currentTarget.classList.toggle('on', estado.perto);
      ev.currentTarget.textContent = estado.perto ? T('longe') : T('perto');
      dePerto(estado.perto);
    });
    corpo.querySelector('.po-mont-video').addEventListener('click', (ev) => gravaVideo(ev.currentTarget));
    vai(0);
    setTimeout(() => { if (cena) cena.medir(); }, 60);
  }
  function escolhe() {
    const slots = (typeof projectSlots !== 'undefined' && projectSlots) ? projectSlots.filter((s) => s && s.module) : [];
    if (slots.length === 1) { abre(slots[0]); return; }
    const corpo = casca(T('escolha'));
    const lista = document.createElement('div');
    lista.className = 'po-mont-lista';
    slots.forEach((s) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = nomeDoSlot(s);
      b.addEventListener('click', () => abre(s));
      lista.appendChild(b);
    });
    corpo.appendChild(lista);
  }
  // Abre o passo a passo: do módulo passado, do módulo localizado pelo QR
  // (view3DWallSlot, portal-09) ou, sem nenhum, a lista pra escolher.
  function abrirMontagem(slot) {
    let alvo = slot || null;
    if (!alvo) { try { alvo = (typeof view3DWallSlot !== 'undefined') ? view3DWallSlot : null; } catch (e) { alvo = null; } }
    if (alvo && alvo.module) abre(alvo); else escolhe();
  }
  window.LegnoMontagem.abrir = abrirMontagem;
  window.LegnoMontagem._htmlPecas = htmlPecas;   // bancada

  // ---- botão no cabeçalho do visitante (3D do QR) -------------------------
  function poeBotao() {
    if (!document.body.classList.contains('po-view3d-guest')) return false;
    const header = document.getElementById('po-view3d-guest-header');
    if (!header) return false;
    if (document.getElementById('po-view3d-montagem-btn')) return true;
    const b = document.createElement('button');
    b.type = 'button';
    b.id = 'po-view3d-montagem-btn';
    b.className = 'secondary po-view3d-measurements-toggle-btn';
    b.textContent = T('btn');
    b.addEventListener('click', () => abrirMontagem(null));
    header.appendChild(b);
    return true;
  }
  // ---- botão na barra do editor (grupo HELP), SÓ ADMIN enquanto é piloto ----
  // Matt, 16/11: "como vejo o passo a passo pelo portal? tem como?". Abre o
  // módulo SELECIONADO; sem seleção, a lista pra escolher.
  function poeBotaoEditor() {
    if (window.LEGNO_IS_ADMIN !== true) return false;
    const linha = document.querySelector('#po-proj-tb-help .po-tb-icons-row');
    if (!linha) return false;
    if (document.getElementById('po-proj-montagem-btn')) return true;
    const b = document.createElement('button');
    b.type = 'button';
    b.id = 'po-proj-montagem-btn';
    b.className = 'po-tb-icon-card po-tb-icon-only';
    b.title = T('titulo'); b.setAttribute('aria-label', T('titulo'));
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5.2 5.2L4 17l3 3 5.5-5.5a4 4 0 0 0 5.2-5.2l-2.6 2.6-2.1-.6-.6-2.1z"/></svg><span></span>';
    b.querySelector('span').textContent = T('titulo');
    b.addEventListener('click', () => {
      let sel = null;
      try { if (typeof selectedProjectSlotId !== 'undefined' && selectedProjectSlotId != null) sel = projectSlots.find((x) => x.id === selectedProjectSlotId) || null; } catch (e) { sel = null; }
      if (sel && sel.module) abre(sel); else escolhe();
    });
    linha.appendChild(b);
    return true;
  }
  if (new URLSearchParams(window.location.search).get('view3d')) {
    let tentativas = 0;
    const tm = setInterval(() => { if (poeBotao() || ++tentativas > 120) clearInterval(tm); }, 500);
  } else {
    let tentativas2 = 0;
    const tm2 = setInterval(() => { if (poeBotaoEditor() || ++tentativas2 > 240) clearInterval(tm2); }, 500);
  }
})();
