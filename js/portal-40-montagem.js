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
      s7_d_sem: 'Módulo montado. Confira se todos os tambores estão travados antes de levantar o móvel.'
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
      s7_d_sem: 'Cabinet assembled. Check that every cam lock is tight before standing it up.'
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
      s7_d_sem: 'Módulo armado. Verifique que todos los tambores estén trabados antes de levantar el mueble.'
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

  // ---- cena ----------------------------------------------------------------
  let cena = null;   // { renderer, scene, camera, controls, raf, grupo }
  function iniciaCena(holder) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    holder.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const sol = new THREE.DirectionalLight(0xffffff, 0.55); sol.position.set(2, 4, 3); scene.add(sol);
    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 50);
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false; controls.enablePan = false;
    const c = { renderer, scene, camera, controls, grupo: null, holder };
    const medir = () => {
      const w = holder.clientWidth || 300, h = holder.clientHeight || 300;
      renderer.setSize(w, h, false); renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
      camera.aspect = w / h; camera.updateProjectionMatrix();
    };
    c.medir = medir; medir();
    window.addEventListener('resize', medir);
    const loop = () => { c.raf = requestAnimationFrame(loop); controls.update(); renderer.render(scene, camera); };
    loop();
    return c;
  }
  function encerraCena() {
    if (!cena) return;
    cancelAnimationFrame(cena.raf);
    window.removeEventListener('resize', cena.medir);
    try { cena.renderer.dispose(); cena.renderer.domElement.remove(); } catch (e) { /* já saiu */ }
    cena = null;
  }
  const MAT = {
    forte: () => new THREE.MeshStandardMaterial({ color: 0xf2e7d5, transparent: true, opacity: 0.55, roughness: 0.9, depthWrite: false }),
    fraco: () => new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, roughness: 1, depthWrite: false })
  };
  function desenhaPasso(dados, passo, enquadra) {
    if (cena.grupo) cena.scene.remove(cena.grupo);
    const g = new THREE.Group();
    const W = dados.W / 1000, D = dados.D / 1000;
    const caixaVista = new THREE.Box3();
    dados.caixas.forEach((c) => {
      const modo = passo.mostra(c);
      if (!modo) return;
      const geo = new THREE.BoxGeometry(c.sx / 1000, c.sy / 1000, c.sz / 1000);
      const m = new THREE.Mesh(geo, MAT[modo]());
      m.position.set((c.x0 + c.sx / 2) / 1000 - W / 2, (c.y0 + c.sy / 2) / 1000, (c.z0 + c.sz / 2) / 1000 - D / 2);
      m.renderOrder = 1;
      g.add(m);
      const linhas = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: modo === 'forte' ? 0x3a3a3a : 0xb5b5b5 }));
      linhas.position.copy(m.position);
      g.add(linhas);
      if (modo === 'forte') caixaVista.expandByObject(m);
    });
    const visiveis = {};
    dados.caixas.forEach((c) => { if (passo.mostra(c)) visiveis[c.chave] = true; });
    const furos = dados.furos.filter((h) => h.kind && passo.kinds.indexOf(h.kind) !== -1 && visiveis[h.cx]);
    if (furos.length && typeof Viewer3D !== 'undefined' && Viewer3D.buildHardwareGroup) {
      try {
        const fg = Viewer3D.buildHardwareGroup(furos, dados.W, dados.H, dados.D);
        if (fg) {
          // ferragem do passo em laranja, pra saltar aos olhos
          fg.traverse((o) => { if (o.isMesh) o.material = new THREE.MeshStandardMaterial({ color: 0xe8590c, metalness: 0.3, roughness: 0.5 }); });
          g.add(fg);
        }
      } catch (e) { console.warn('[montagem] ferragem do passo:', e); }
    }
    cena.scene.add(g); cena.grupo = g;
    if (caixaVista.isEmpty()) caixaVista.setFromObject(g);
    if (enquadra && !caixaVista.isEmpty()) {
      const centro = caixaVista.getCenter(new THREE.Vector3()), tam = caixaVista.getSize(new THREE.Vector3());
      const raio = Math.max(tam.length() / 2, 0.15);
      const dist = raio / Math.sin((cena.camera.fov * Math.PI / 180) / 2) * 1.05;
      cena.controls.target.copy(centro);
      cena.camera.position.copy(centro).add(new THREE.Vector3(0.75, 0.55, 1).normalize().multiplyScalar(dist));
      cena.camera.near = dist / 100; cena.camera.far = dist * 20; cena.camera.updateProjectionMatrix();
    }
  }

  // ---- tela ------------------------------------------------------------------
  function estilos() {
    if (document.getElementById('po-mont-css')) return;
    const st = document.createElement('style');
    st.id = 'po-mont-css';
    st.textContent = `
#po-mont-modal{position:fixed;inset:0;z-index:2500;background:rgba(20,20,20,.45);display:flex;align-items:center;justify-content:center;font-family:inherit}
#po-mont-modal .po-mont-card{background:#fff;width:min(960px,100vw);height:min(720px,100dvh);border-radius:14px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.25)}
@media (max-width:700px){#po-mont-modal .po-mont-card{border-radius:0;width:100vw;height:100dvh}}
#po-mont-modal .po-mont-head{display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid #e6e6e6}
#po-mont-modal .po-mont-head h3{margin:0;font-size:16px;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#po-mont-modal .po-mont-x{border:0;background:#f1f1f1;color:#1f1f1f;padding:0;line-height:1;border-radius:8px;width:34px;height:34px;font-size:18px;cursor:pointer}
#po-mont-modal .po-mont-3d{flex:1;min-height:180px;position:relative;background:linear-gradient(#fafafa,#efefef);touch-action:none}
#po-mont-modal .po-mont-dica{position:absolute;left:10px;bottom:6px;font-size:11px;color:#8a8a8a;pointer-events:none}
#po-mont-modal .po-mont-txt{padding:12px 16px 6px;max-height:42%;overflow:auto}
#po-mont-modal .po-mont-n{font-size:12px;color:#8a8a8a;text-transform:uppercase;letter-spacing:.04em}
#po-mont-modal .po-mont-t{font-size:19px;font-weight:700;margin:2px 0 6px}
#po-mont-modal .po-mont-d{font-size:15px;line-height:1.45;margin:0 0 8px;color:#222}
#po-mont-modal .po-mont-chips{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 6px}
#po-mont-modal .po-mont-chip{background:#fff1e8;color:#b8430a;border:1px solid #f6c9ad;border-radius:999px;padding:3px 10px;font-size:13px;font-weight:600}
#po-mont-modal .po-mont-tool{font-size:12px;color:#777;margin:0 0 4px}
#po-mont-modal .po-mont-nav{display:flex;gap:10px;padding:10px 14px calc(10px + env(safe-area-inset-bottom));border-top:1px solid #e6e6e6}
#po-mont-modal .po-mont-nav button{flex:1;padding:12px;font-size:15px;border-radius:10px;border:1px solid #cfcfcf;background:#fff;color:#1f1f1f;cursor:pointer}
#po-mont-modal .po-mont-nav button.pri{background:#1f1f1f;color:#fff;border-color:#1f1f1f}
#po-mont-modal .po-mont-nav button:disabled{opacity:.35;cursor:default}
#po-mont-modal .po-mont-pontos{display:flex;gap:5px;justify-content:center;padding:6px 0 0}
#po-mont-modal .po-mont-pontos i{width:7px;height:7px;border-radius:50%;background:#d6d6d6}
#po-mont-modal .po-mont-pontos i.on{background:#e8590c}
#po-mont-modal .po-mont-lista{padding:10px 14px;overflow:auto;flex:1}
#po-mont-modal .po-mont-lista button{display:block;width:100%;text-align:left;padding:12px;margin:0 0 8px;border:1px solid #ddd;border-radius:10px;background:#fff;color:#1f1f1f;font-size:15px;cursor:pointer}
#po-mont-modal .po-mont-lista button:hover{background:#f6f3ee}
#po-mont-modal .po-mont-head h3{color:#1f1f1f}
#po-mont-modal .po-mont-t{color:#1f1f1f}
#po-mont-modal .po-mont-msg{padding:30px 18px;text-align:center;color:#555;flex:1}`;
    document.head.appendChild(st);
  }
  function fecha() {
    encerraCena();
    const m = document.getElementById('po-mont-modal');
    if (m) m.remove();
    document.removeEventListener('keydown', teclas);
  }
  let estado = null;   // { dados, i }
  function teclas(ev) {
    if (ev.key === 'Escape') fecha();
    else if (estado && ev.key === 'ArrowRight') vai(estado.i + 1);
    else if (estado && ev.key === 'ArrowLeft') vai(estado.i - 1);
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
  function vai(i) {
    if (!estado) return;
    const { dados } = estado, total = dados.passos.length;
    if (i >= total) { fecha(); return; }
    if (i < 0) return;
    estado.i = i;
    const p = dados.passos[i];
    const m = document.getElementById('po-mont-modal');
    if (!m) return;
    m.querySelector('.po-mont-n').textContent = T('passo', { n: i + 1, t: total });
    m.querySelector('.po-mont-t').textContent = T(p.id + '_t');
    m.querySelector('.po-mont-d').textContent = T(p.id === 's7' && p.semFrente ? 's7_d_sem' : p.id + '_d');
    const chips = Object.keys(p.conta).map((k) => `<span class="po-mont-chip">${p.conta[k]} × ${T('n_' + k)}</span>`).join('');
    m.querySelector('.po-mont-chips').innerHTML = (p.id === 's4' || (p.id === 's7' && p.semFrente)) ? '' : chips;
    m.querySelector('.po-mont-tool').textContent = (p.id === 's1' || p.id === 's5') ? T('ferramenta') : '';
    m.querySelector('.po-mont-pontos').innerHTML = dados.passos.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('');
    const ant = m.querySelector('.po-mont-ant'), prox = m.querySelector('.po-mont-prox');
    ant.disabled = i === 0;
    prox.textContent = i === total - 1 ? T('fim') : T('prox');
    desenhaPasso(dados, p, true);
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
    corpo.innerHTML = `<div class="po-mont-3d"><span class="po-mont-dica">${T('gire')}</span></div>
      <div class="po-mont-txt"><div class="po-mont-n"></div><div class="po-mont-t"></div><p class="po-mont-d"></p><div class="po-mont-chips"></div><p class="po-mont-tool"></p></div>
      <div class="po-mont-pontos"></div>
      <div class="po-mont-nav"><button type="button" class="po-mont-ant">${T('ant')}</button><button type="button" class="pri po-mont-prox">${T('prox')}</button></div>`;
    cena = iniciaCena(corpo.querySelector('.po-mont-3d'));
    estado = { dados, i: 0 };
    corpo.querySelector('.po-mont-ant').addEventListener('click', () => vai(estado.i - 1));
    corpo.querySelector('.po-mont-prox').addEventListener('click', () => vai(estado.i + 1));
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
