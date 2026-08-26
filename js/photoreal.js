// =====================================================================
// PHOTOREAL — "Foto realista" do projeto (aba Projetos), 2026-08-03.
//
// Path tracer (three-gpu-pathtracer) rodando numa cena PRÓPRIA em
// three@0.181 (bundle local js/vendor/render-fiel-bundle.js, IIFE global
// RenderFielLibs) — NÃO reaproveita nenhum objeto do viewer atual
// (viewer3d.js roda em r128, versões incompatíveis pra misturar cena).
// A geometria é reconstruída aqui a partir das MESMAS peças resolvidas
// (resolvePiecesForViewer em portal.js) — porta "Lite" de placePieceInBox/
// buildModuleAssembly, idêntica à validada no teste solto
// teste-render-fiel-geometria-real.html (aprovado pelo usuário 2026-08-03).
//
// Decisões de performance (conversa 2026-08-03, "sem travar internet nem
// demorar muito"):
// - O bundle de ~925KB só é baixado no PRIMEIRO clique no botão (lazy,
//   injeção de <script>), nunca no carregamento normal do portal.
// - Renderer/pathTracer são singletons — a compilação de shader (que
//   congela a página por alguns segundos, inevitável e avisada na tela)
//   acontece 1x por sessão; renders seguintes só reconstroem o BVH.
// - Render progressivo com alvo de amostras + botão de parar — a imagem
//   aparece na hora e vai limpando ruído; dá pra baixar a qualquer momento.
//
// API: Photoreal.open(sceneData)
//   sceneData = {
//     walls: [{ role, wallIndex, widthM, originX, originZ, alongDirX,
//               alongDirZ, intoDirX, intoDirZ, rotationY,
//               modules: [{ id, width_mm, height_mm, depth_mm, x_mm,
//                           z_order, floor_height_mm, parts }] }],
//     room: { ceiling_m, baseboard_h_m }
//   }
//   `parts` = saída crua de resolvePiecesForViewer (portal.js).
// =====================================================================
const Photoreal = (() => {
  const BUNDLE_URL = 'js/vendor/render-fiel-bundle.js?v=20260803a';
  const TARGET_SAMPLES = 250;      // suficiente pra fundo claro/móvel — segundos numa GPU comum
  const BASEBOARD_DEPTH_M = 0.019; // mesmos valores do viewer3d_composition.js
  const FREEFORM_DEPTH_STEP_M = 0.06;
  const WALL_THICK_M = 0.05;
  const PHOTO_ASPECT = 4 / 3; // formato travado da foto (ver comentário em open()); reaproveitado no reset automático

  let T = null; // RenderFielLibs.THREE (preenchido no 1º open)
  let renderer = null, pathTracer = null, envTexture = null;
  let scene = null, camera = null;
  let loopActive = false, samplesDone = 0;
  let modalEl = null, canvasWrapEl = null, statusEl = null, saveStatusEl = null, dlBtn = null, stopBtn = null, saveBtn = null;
  // onSaveCallback (2026-08-03, ATUALIZADO 2026-08-03 pra salvamento
  // AUTOMÁTICO — pedido do usuário: "quando gero uma foto realista quero
  // que ela fique carregada no projeto salvo. automaticamente ela salva...
  // pode salvar mais de uma versao, porque podem ter mais angulos"):
  // função async(dataUrl) fornecida pelo portal.js em sceneData.onSave —
  // grava a foto como uma NOVA versão no projeto (project_photoreal_photos,
  // migration 077) + atualiza user_projects.ai_preview_url pra apontar pra
  // ela (continua sendo a base fixa da IA; ver comentário grande em
  // portal.js/savePhotorealRenderToProject). photoreal.js não sabe nada de
  // Supabase/projeto, só chama o callback quando o render termina/é
  // parado e mostra o resultado. savedForThisRender trava em UM salvamento
  // por render (não duplica se o loop chamar de novo); lastRenderDataUrl
  // guarda o PNG pro botão de retry reaparecer só se o salvamento falhar.
  let onSaveCallback = null;
  let savedForThisRender = false;
  let lastRenderDataUrl = null;
  // hardResetTried (2026-08-03, pedido do usuário: "antes de gerar as
  // camadas, ele esta trancando ai saio e entro denovo ai ele gera") — ver
  // disposeRenderer/createFreshRenderer/runPathTracerAttempt mais abaixo:
  // trava a 1 tentativa de reset automático por open(), pra nunca entrar
  // num loop reiniciando pra sempre se a GPU realmente não conseguir
  // compilar de jeito nenhum.
  let hardResetTried = false;

  // ---------- carregamento lazy do bundle (1x por sessão) ----------
  function ensureBundle() {
    return new Promise((resolve, reject) => {
      if (typeof RenderFielLibs !== 'undefined') { resolve(); return; }
      const s = document.createElement('script');
      s.src = BUNDLE_URL;
      s.onload = () => (typeof RenderFielLibs !== 'undefined')
        ? resolve()
        : reject(new Error('bundle carregou mas RenderFielLibs não existe'));
      s.onerror = () => reject(new Error('falha baixando ' + BUNDLE_URL));
      document.head.appendChild(s);
    });
  }

  // ---------- geometria "Lite" (porta fiel do teste aprovado) ----------
  // Diferença única pro teste: NUNCA cria LineSegments de aresta (path
  // tracer não processa linha; e aqui não existe painel raster).
  function splitThickness(w, h, d, positioning) {
    if (positioning === 'horizontal') return { thickness: h, faceA: w, faceB: d };
    if (positioning === 'vertical') return { thickness: w, faceA: h, faceB: d };
    if (positioning === 'vertical_no_plano' || positioning === 'horizontal_no_plano') return { thickness: d, faceA: w, faceB: h };
    const dims = [w, h, d];
    const minIdx = dims.indexOf(Math.min(w, h, d));
    const thickness = dims[minIdx];
    const rest = dims.filter((_, i) => i !== minIdx);
    return { thickness, faceA: rest[0], faceB: rest[1] };
  }
  function resolveThickness(part) {
    if (!part) return 0;
    const w = Math.max((part.width_mm || 0) / 1000, 0.002), h = Math.max((part.height_mm || 0) / 1000, 0.002), d = Math.max((part.depth_mm || 0) / 1000, 0.002);
    return splitThickness(w, h, d, part.positioning).thickness;
  }
  // ---------- texturas (2026-08-03, "as texturas nao estao puxando") ----------
  // Mesmo esquema do viewer3d.js (loadTexture/makeMaterial/resolveRotateTexture):
  // color.texture_url vira map sRGB, com giro de 90° pra face horizontal
  // (topo/base/prateleira — senão o veio sai deitado). Diferença necessária:
  // o path tracer "empacota" as texturas no setScene — imagem ainda não
  // decodificada = peça cinza — então open() ESPERA os loads (pendingTextures,
  // com timeout) antes do setScene. Cache persiste entre fotos da sessão.
  let textureCache = {};
  let pendingTextures = [];
  let textureLoader = null;
  // ESCALA FÍSICA (2026-08-12) — mesma regra do viewer3d.js: a imagem vale um
  // pedaço FIXO de chapa (TEXTURE_TILE_MM) e o repeat sai do tamanho real da
  // face, senão a textura estica/encolhe conforme o tamanho da peça. Aqui o
  // material é UM só pros 6 lados (o path tracer não monta material por face),
  // então o repeat sai da face grande — as bordas herdam essa escala.
  // Duplicado de propósito (photoreal.js não depende do viewer3d.js): se mudar
  // o padrão aqui, mude no js/viewer3d.js também. O override de console
  // (window.LEGNO_TEXTURE_TILE_MM) já vale pros dois.
  const TEXTURE_TILE_MM = 1000;
  function textureTileMm() {
    const v = Number(typeof window !== 'undefined' ? window.LEGNO_TEXTURE_TILE_MM : 0);
    return v > 0 ? v : TEXTURE_TILE_MM;
  }
  function quantizaRepeat(mm) {
    if (!(mm > 0)) return 1;
    const r = mm / textureTileMm();
    const passo = r < 0.5 ? 200 : 20;   // passo fino embaixo de 0.5 (fita de 18mm)
    return Math.max(0.005, Math.min(64, Math.round(r * passo) / passo));
  }
  // Face grande (mm) de uma caixa criada por makeBox. Mesma dedução do
  // viewer3d.js (dimensoesDaFaceMm): U/V vêm do EIXO da espessura, não do
  // tamanho — ordenar por tamanho erra em porta 600×2000, onde U é o menor.
  function faceMmDaGeometria(geometry) {
    const d = geometry && geometry.userData && geometry.userData.dimsMm;
    if (!d) return null;
    if (d.d <= d.w && d.d <= d.h) return { u: d.w, v: d.h };   // espessura em Z
    if (d.w <= d.h && d.w <= d.d) return { u: d.d, v: d.h };   // espessura em X
    return { u: d.w, v: d.d };                                  // espessura em Y
  }
  function loadTexture(url, rotateMode, uMm, vMm) {
    if (!url) return null;
    const rotateSuffix = rotateMode === true ? '|rot90' : rotateMode === 'right' ? '|rot90r' : '';
    const repU = uMm ? quantizaRepeat(uMm) : 1;
    const repV = vMm ? quantizaRepeat(vMm) : 1;
    const cacheKey = url + rotateSuffix + '|' + repU + 'x' + repV;
    if (textureCache[cacheKey]) return textureCache[cacheKey];
    if (!textureLoader) { textureLoader = new T.TextureLoader(); textureLoader.setCrossOrigin('anonymous'); }
    let resolveLoaded;
    pendingTextures.push(new Promise((resolve) => { resolveLoaded = resolve; }));
    const tex = textureLoader.load(url, () => resolveLoaded(true), undefined, () => resolveLoaded(false));
    if ('colorSpace' in tex) tex.colorSpace = T.SRGBColorSpace;
    if (rotateMode === true) { tex.center.set(0.5, 0.5); tex.rotation = Math.PI / 2; }
    else if (rotateMode === 'right') { tex.center.set(0.5, 0.5); tex.rotation = -Math.PI / 2; }
    // Com giro, o repeat vai TROCADO — o Three aplica o repeat nos eixos
    // finais da textura, depois do giro (ver o comentário longo em
    // loadTexture no viewer3d.js; foi o que esticou a base no comprimento).
    const girou = rotateMode === true || rotateMode === 'right';
    tex.wrapS = T.RepeatWrapping;
    tex.wrapT = T.RepeatWrapping;
    tex.repeat.set(girou ? repV : repU, girou ? repU : repV);
    textureCache[cacheKey] = tex;
    return tex;
  }
  function resolveRotateTexture(positioning, fallback) {
    if (positioning === 'horizontal_no_plano') return 'right';
    if (positioning === 'horizontal') return true;
    if (positioning === 'vertical' || positioning === 'vertical_no_plano') return false;
    return fallback;
  }
  // Sentido do veio — cópia fiel de resolveGrainRotate (js/viewer3d.js), pra
  // foto realista e visualizador nunca discordarem. QUALQUER mudança aqui tem
  // que sair igual nos dois arquivos.
  // 2026-08-16 — SÓ O FUNDO deita pelo lado longo.
  // Matt, olhando um módulo baixo: "as laterais estão invertindo no desenho
  // quando ficam muito baixas [...] isso deve acontecer na máquina, mas não no
  // projeto, a laminação e principalmente o veio da peça não pode mudar na
  // lateral (só muda no fundo por uma questão de chapa)".
  //
  // Uma lateral de 300 de altura por 600 de profundidade caía em `uM >= vM` e
  // saía com o veio deitado — o desenho contradizia a peça. A troca
  // comprimento/largura é assunto da MÁQUINA (LayoutEngine.validar continua
  // gravando p.veio pelo lado longo, e o plano de corte/.ban seguem iguais);
  // o projeto tem que mostrar a peça como ela é.
  //
  // O fundo é a única exceção, e por um motivo físico: ele deita pra caber na
  // chapa ("quando o lado maior for largura o fundo deve ter a textura
  // deitada"), e é essa regra que limita o móvel.
  //
  // CUIDADO: isto REVERTE, de propósito, a parte de rodapé/travessa do pedido
  // de 2026-08-12 ("todo rodapé e travessa deve ser deitado") PRA PEÇA 'free'
  // sem veio cadastrado. Se um rodapé voltar a aparecer com o veio em pé
  // DEPOIS de conferir que ele está em PAPEIS_VEIO_PELO_FORMATO, o conserto é
  // no CADASTRO da peça (positioning 'horizontal'), não em reabrir a regra de
  // formato aqui.
  // PAPÉIS EM QUE O FORMATO DECIDE O VEIO LIVRE.
  // 'back'         — o fundo deita pra caber na CHAPA. Limitação física.
  // 'free'/'other' — a peça que não declara orientação nenhuma: travessa (o
  //                  papel 'Travamento' saiu na migration 026) e, desde o
  //                  construtor, a base divisória e a divisória, que nascem
  //                  do LayoutEngine com position_role 'free'.
  //                  Aqui o formato é a ÚNICA informação que existe.
  // 'baseboard'    — rodapé tem PAPEL PRÓPRIO (não é 'free' — ver
  //                  POSITION_ROLE_LABELS em admin.js), e por isso tinha
  //                  ficado de fora desta lista até 2026-08-19: sem
  //                  'baseboard' aqui, resolveGrainRotate caía direto no
  //                  fallback=false que o placePart('baseboard') passa,
  //                  então o veio saía sempre EM PÉ quando a peça não tinha
  //                  `positioning` cadastrado — exatamente a regra de
  //                  2026-08-12 que o comentário acima descreve, só que
  //                  nunca tinha sido aplicada de fato pro papel 'baseboard'.
  //                  Ver memória do projeto "veio no desenho" / rodapé.
  // Todo o resto (left/right/top/bottom/shelf/front/drawer) tem orientação
  // própria e NÃO opina por formato — foi isso que fazia a lateral de um
  // módulo baixo virar sozinha.
  const PAPEIS_VEIO_PELO_FORMATO = { back: 1, free: 1, other: 1, baseboard: 1 };
  function resolveGrainRotate(part, uM, vM, fallback) {
    const veio = part && part.veio;
    if (veio === 'horizontal') return true;
    if (veio === 'vertical') return false;
    const papel = (part && part.position_role) || 'other';
    if (PAPEIS_VEIO_PELO_FORMATO[papel] && (!veio || veio === 'livre')) return uM >= vM;
    return resolveRotateTexture(part && part.positioning, fallback);
  }
  function makeMaterial(color, rotateTexture, uMm, vMm) {
    const textureUrl = color && color.texture_url;
    const tex = textureUrl ? loadTexture(textureUrl, rotateTexture, uMm, vMm) : null;
    if (tex) return new T.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.05 });
    const hex = (color && color.swatch_hex) || '#cccccc';
    return new T.MeshStandardMaterial({ color: hex, roughness: 0.85, metalness: 0.05 });
  }
  function emitInto(parentGroup, contentOrGeometry, color, x, y, z, rotateTexture) {
    const faceMm = (contentOrGeometry && !contentOrGeometry.isGroup)
      ? faceMmDaGeometria(contentOrGeometry) : null;
    const content = (contentOrGeometry && contentOrGeometry.isGroup)
      ? contentOrGeometry
      : new T.Mesh(contentOrGeometry, makeMaterial(color, rotateTexture, faceMm && faceMm.u, faceMm && faceMm.v));
    content.position.set(x, y, z);
    parentGroup.add(content);
    return content;
  }

  // Caixa com aresta ARREDONDADA (~1mm) pra TODA peça de módulo (pedido do
  // usuário 2026-08-03: "cantos arredondados beeem pouco tipo 1mm... assim
  // nao estao aparecendo as emendas") — duas chapas encostadas da mesma cor
  // viravam um bloco visualmente contínuo; o chanfro cria uma linha de luz
  // na junta, igual móvel real. Raio limitado a 30% da menor dimensão
  // (RoundedBoxGeometry quebra se raio >= metade da espessura — fundo de
  // 3mm etc.). Paredes/piso do ambiente continuam BoxGeometry normal de
  // propósito (não são móvel, não têm emenda).
  function makeBox(w, h, d) {
    // 3mm (1mm→2mm→3mm, 2026-08-03 — usuário subindo até a emenda aparecer).
    const radius = Math.min(0.003, Math.min(w, h, d) * 0.3);
    const g = new RenderFielLibs.RoundedBoxGeometry(w, h, d, 2, radius);
    // RoundedBoxGeometry não expõe .parameters como a BoxGeometry — guarda as
    // medidas aqui pro repeat físico da textura (ver faceMmDaGeometria).
    g.userData = g.userData || {};
    g.userData.dimsMm = { w: w * 1000, h: h * 1000, d: d * 1000 };
    return g;
  }

  const LEG_COLOR = { swatch_hex: '#000000' };
  // Cópia fiel do LEG_INSET_MM de js/viewer3d.js (2026-08-19, Matt: "pes
  // plasticos... 100mm de distancia das pontas pra dentro") — mesmo valor,
  // pra render fotorrealista não desalinhar do 3D normal.
  const LEG_INSET_MM = 100;
  function placeLegsGroup(group, parentGroup, W, D) {
    if (!group || !group.length) return;
    const first = group[0];
    const legW = Math.max((first.width_mm || 40) / 1000, 0.01);
    const legHeight = Math.max((first.height_mm || 114) / 1000, 0.01);
    const legRadius = legW / 2;
    const inset = Math.max(LEG_INSET_MM / 1000, legRadius + 0.01);
    const corners = [[-W / 2 + inset, -D / 2 + inset], [W / 2 - inset, -D / 2 + inset], [-W / 2 + inset, D / 2 - inset], [W / 2 - inset, D / 2 - inset]];
    group.slice(0, 4).forEach((part, i) => {
      const [x, z] = corners[i] || corners[corners.length - 1];
      const geometry = new T.CylinderGeometry(legRadius, legRadius, legHeight, 16);
      const offX = (part.offset_x_mm || 0) / 1000, offY = (part.offset_y_mm || 0) / 1000, offZ = (part.offset_z_mm || 0) / 1000;
      emitInto(parentGroup, geometry, LEG_COLOR, x + offX, legHeight / 2 + offY, z + offZ, false);
    });
  }

  function placeFrontGroup(group, parentGroup, W, H, D, bounds) {
    const gap = 0.002;
    let cursorX = -W / 2 + gap;
    const legH = (bounds && bounds.legH) || 0;
    group.forEach((part) => {
      const w = Math.max((part.width_mm || 0) / 1000, 0.002), h = Math.max((part.height_mm || 0) / 1000, 0.002), d = Math.max((part.depth_mm || 0) / 1000, 0.002);
      const { thickness, faceA, faceB } = splitThickness(w, h, d, part.positioning);
      const doorW = faceA;
      const offX = (part.offset_x_mm || 0) / 1000, offY = (part.offset_y_mm || 0) / 1000, offZ = (part.offset_z_mm || 0) / 1000;
      // resolveContentPh centraliza módulo-aninhado (porta que é uma
      // composição) — mesma correção de meia-altura dos outros papéis.
      const content = resolveContentPh(part, doorW, faceB, thickness);
      const x = cursorX + doorW / 2;
      emitInto(parentGroup, content, part.color, x + offX, faceB / 2 + offY + legH, D / 2 + thickness / 2 + gap + offZ, resolveGrainRotate(part, doorW, faceB, false));
      cursorX = x + doorW / 2 + gap;
    });
  }

  // Porta do resolveContent do viewer3d.js (2026-08-03, bug relatado pelo
  // usuário: "informacao errada na altura de alguns modulos, e a prateleira
  // inclinada aparece reta"). DOIS papéis desta função, iguais ao original:
  // 1) MÓDULO-ANINHADO CENTRADO: buildAssembly devolve grupo com origem no
  //    CHÃO (Y 0..h), mas todo posicionamento de peça assume conteúdo
  //    CENTRADO igual BoxGeometry (-h/2..+h/2) — sem envolver num grupo
  //    deslocado -bh/2, o módulo aninhado flutuava meia altura pra cima (era
  //    exatamente o módulo "voando" no render). As dimensões (bw/bh/bd) são
  //    as DA CAIXA ORIENTADA POR PAPEL (thickness/faceA/faceB conforme o
  //    papel), não as w/h/d cruas — igual o viewer usa geometry.parameters.
  // 2) INCLINAÇÃO/GIRO: tilt_angle_deg (sapateira) gira em X — no grupo via
  //    rotation.x, na caixa comum bakeado nos vértices (rotateX); idem
  //    rotation_y_deg (giro de canto do 'free', migration 067).
  function resolveContentPh(part, bw, bh, bd) {
    const tiltRad = ((part && part.tilt_angle_deg) || 0) * Math.PI / 180;
    const rotYRad = ((part && part.rotation_y_deg) || 0) * Math.PI / 180;
    if (part && part.is_module && part.child_pieces && part.child_pieces.length) {
      const assembly = buildAssembly(part.child_pieces, Math.max(bw, 0.01), Math.max(bh, 0.01), Math.max(bd, 0.01), false);
      const centered = new T.Group();
      assembly.position.y = -bh / 2;
      centered.add(assembly);
      if (tiltRad) centered.rotation.x = tiltRad;
      if (rotYRad) centered.rotation.y = rotYRad;
      return centered;
    }
    const geom = makeBox(bw, bh, bd);
    if (tiltRad) geom.rotateX(tiltRad);
    if (rotYRad) geom.rotateY(rotYRad);
    return geom;
  }

  function placePieceInBox(part, parentGroup, W, H, D, index, count, bounds) {
    const w = Math.max((part.width_mm || 0) / 1000, 0.002), h = Math.max((part.height_mm || 0) / 1000, 0.002), d = Math.max((part.depth_mm || 0) / 1000, 0.002);
    const role = part.position_role || 'other';
    const gap = 0.002;
    const offX = (part.offset_x_mm || 0) / 1000, offY = (part.offset_y_mm || 0) / 1000, offZ = (part.offset_z_mm || 0) / 1000;
    const legH = (bounds && bounds.legH) || 0;

    // ATENÇÃO: 'left'/'right' e 'top'/'bottom' usam a MESMA âncora (canto
    // esquerdo/base) DE PROPÓSITO — regra documentada no topo do viewer3d.js:
    // a peça 'right' é posicionada pelo admin via fórmula offset_x_mm="W-19"
    // (idem 'top' com offset_y_mm="H-19"). Diferenciar a âncora aqui DOBRARIA
    // o offset e jogaria a peça pra fora do módulo.
    if (role === 'left' || role === 'right') {
      const { thickness, faceA, faceB } = splitThickness(w, h, d, part.positioning);
      const content = resolveContentPh(part, thickness, faceA, faceB);
      emitInto(parentGroup, content, part.color, -W / 2 + thickness / 2 + offX, faceA / 2 + offY + legH, -D / 2 + faceB / 2 + offZ, resolveGrainRotate(part, faceB, faceA, false));
    } else if (role === 'drawer_side') {
      // Cópia fiel do ramo 'drawer_side' de viewer3d.js (migration 118) — ver
      // o comentário grande lá. Este arquivo tem que desenhar a MESMA peça no
      // MESMO lugar, senão a foto realista sai diferente do projeto.
      const { thickness, faceA, faceB } = splitThickness(w, h, d, part.positioning);
      // O LADO LONGO SEMPRE CORRE NA PROFUNDIDADE — é isso que "deitada pra
      // trás" quer dizer, e é o que põe as duas bordas laminadas do 2C em
      // cima e embaixo em vez de na frente.
      //
      // Trocar altura por profundidade CEGAMENTE (1ª versão, 18/08) estava
      // errado: depende de qual medida o cadastro escreveu onde. A lateral
      // direita deste mesmo módulo (cadastro antigo, que já estava certa) usa
      // 19.5 / H / D — ali não há nada a trocar, e a troca cega deixava a peça
      // D de altura por H de profundidade, de pé de novo.
      //
      // A regra que vale nas duas convenções: das duas medidas que sobram
      // depois da espessura, a MENOR é a altura da lateral e a MAIOR é a
      // profundidade. Uma lateral de gaveta é sempre mais funda que alta.
      const faceY = Math.min(faceA, faceB); // menor -> altura da gaveta
      const faceZ = Math.max(faceA, faceB); // maior -> profundidade (lado longo)
      const content = resolveContentPh(part, thickness, faceY, faceZ);
      emitInto(parentGroup, content, part.color, -W / 2 + thickness / 2 + offX, faceY / 2 + offY + legH, -D / 2 + faceZ / 2 + offZ, resolveGrainRotate(part, faceZ, faceY, true));
    } else if (role === 'top' || role === 'bottom') {
      const { thickness, faceA, faceB } = splitThickness(w, h, d, part.positioning);
      const content = resolveContentPh(part, faceA, thickness, faceB);
      emitInto(parentGroup, content, part.color, -W / 2 + faceA / 2 + offX, thickness / 2 + offY + legH, -D / 2 + faceB / 2 + offZ, resolveGrainRotate(part, faceA, faceB, true));
    } else if (role === 'back') {
      const { thickness, faceA, faceB } = splitThickness(w, h, d, part.positioning);
      const content = resolveContentPh(part, faceA, faceB, thickness);
      emitInto(parentGroup, content, part.color, -W / 2 + faceA / 2 + offX, faceB / 2 + offY + legH, -D / 2 + thickness / 2 + offZ, resolveGrainRotate(part, faceA, faceB, false));
    } else if (role === 'shelf') {
      const { thickness, faceA, faceB } = splitThickness(w, h, d, part.positioning);
      const content = resolveContentPh(part, faceA, thickness, faceB);
      const innerLow = (bounds && bounds.innerBottomY) || 0;
      const innerHigh = (bounds && bounds.innerTopY) || H;
      const span = Math.max(innerHigh - innerLow, 0.01);
      const y = innerLow + span * ((index + 1) / (count + 1));
      emitInto(parentGroup, content, part.color, 0 + offX, y + offY + legH, 0 + offZ, resolveGrainRotate(part, faceA, faceB, true));
    } else if (role === 'drawer') {
      const slotH = H / count;
      const drawerH = Math.min(h, slotH * 0.9), drawerW = Math.min(w, W * 0.97), drawerD = Math.min(d, D * 0.9);
      const y = slotH * (count - index - 0.5) + offY, x = 0 + offX, z = D / 2 - drawerD / 2 - gap + offZ;
      if (part.is_module && part.child_pieces && part.child_pieces.length) {
        const assembly = buildAssembly(part.child_pieces, Math.max(drawerW, 0.01), Math.max(drawerH, 0.01), Math.max(drawerD, 0.01), false);
        assembly.position.set(x, y - drawerH / 2 + legH, z);
        parentGroup.add(assembly);
      } else {
        emitInto(parentGroup, makeBox(drawerW, drawerH, drawerD), part.color, x, y + legH, z, resolveRotateTexture(part.positioning, false));
      }
    } else if (role === 'handle') {
      const geometry = resolveContentPh(part, w, h, d);
      const x = count > 1 ? (-W / 2 + W * ((index + 1) / (count + 1))) : 0;
      emitInto(parentGroup, geometry, part.color, x + offX, H / 2 + offY + legH, D / 2 + 0.02 + d / 2 + offZ, false);
    } else if (role === 'baseboard') {
      const { thickness, faceA, faceB } = splitThickness(w, h, d, part.positioning);
      emitInto(parentGroup, resolveContentPh(part, faceA, faceB, thickness), part.color, -W / 2 + faceA / 2 + offX, faceB / 2 + offY, -D / 2 + thickness / 2 + offZ, resolveGrainRotate(part, faceA, faceB, false));
    } else if (role === 'countertop') {
      const { thickness, faceA, faceB } = splitThickness(w, h, d, part.positioning);
      emitInto(parentGroup, resolveContentPh(part, faceA, thickness, faceB), part.color, -W / 2 + faceA / 2 + offX, thickness / 2 + offY + legH, -D / 2 + faceB / 2 + offZ, resolveGrainRotate(part, faceA, faceB, true));
    } else if (role === 'free') {
      const content = resolveContentPh(part, w, h, d);
      emitInto(parentGroup, content, part.color, -W / 2 + w / 2 + offX, h / 2 + offY + legH, -D / 2 + d / 2 + offZ, resolveGrainRotate(part, w, h, false));
    }
    // 'other' -> não desenha (igual viewer3d.js).
  }

  function buildAssembly(parts, W, H, D, isRoot) {
    const group = new T.Group();
    const groups = {};
    (parts || []).forEach((p) => {
      const role = p.position_role || 'other';
      if (!groups[role]) groups[role] = [];
      groups[role].push(p);
    });

    // Pés (position_role='leg') SEMPRE erguem o corpo do chão, seja no
    // módulo raiz OU dentro de uma sub-montagem aninhada (ex: módulo "Gola",
    // pé + rodapé, usado como peça aninhada em outro módulo). CORRIGIDO
    // (2026-08-25, Matt: "não aparece os pés de plástico quando insiro como
    // módulo aninhado") — antes só isRoot desenhava/descontava o pé; uma
    // sub-montagem aninhada descartava a peça-pé em silêncio (mesmo bug
    // irmão do já corrigido em js/viewer3d.js:buildModuleAssembly).
    const legPart = (groups['leg'] || [])[0];
    const legH = legPart ? Math.max((legPart.height_mm || 0) / 1000, 0.01) : 0;
    const boxH = Math.max(H - legH, 0.05);

    const bounds = {
      innerBottomY: resolveThickness((groups['bottom'] || [])[0]),
      innerTopY: boxH - resolveThickness((groups['top'] || [])[0]),
      legH
    };

    Object.keys(groups).forEach((role) => {
      const roleParts = groups[role];
      if (role === 'front') placeFrontGroup(roleParts, group, W, boxH, D, bounds);
      else if (role === 'leg') placeLegsGroup(roleParts, group, W, D);
      else roleParts.forEach((part, index) => placePieceInBox(part, group, W, boxH, D, index, roleParts.length, bounds));
    });

    return group;
  }

  // ---------- cena do projeto: paredes SÓLIDAS + piso + módulos ----------
  // Posicionamento dos módulos = porta fiel de renderFreeformWalls
  // (viewer3d_composition.js): alongOffset/depthOffset/rotY idênticos,
  // inclusive degrau de z_order e recuo de baseboard. Diferença: as paredes
  // aqui são SÓLIDAS (caixas claras) em vez de linhas — path tracer precisa
  // de superfície de verdade pra luz rebater (e a foto fica "ambiente real").
  function buildProjectScene(sceneData) {
    const room = sceneData.room || {};
    const ceilingM = Math.max(Number(room.ceiling_m) || 2.6, 1.2);
    const baseH = Math.max(Number(room.baseboard_h_m) || 0, 0);
    const walls = (sceneData.walls || []).filter((w) => w);

    const sc = new T.Scene();
    // Fundo/luz: GradientEquirectTexture branca — MESMA solução validada no
    // teste (PMREM cube-UV não funciona no path tracer; HemisphereLight é
    // ignorada). Env branda + paredes claras = luz de estúdio.
    if (!envTexture) {
      envTexture = new RenderFielLibs.GradientEquirectTexture();
      envTexture.topColor.set(0xffffff);
      envTexture.bottomColor.set(0xe8e8e8);
      envTexture.update();
    }
    sc.environment = envTexture;
    sc.background = envTexture;
    // 0.9 (era 1.35, que era 1.0 antes disso — pedido de "mais luz" em
    // 2026-08-03) — BAIXADO de novo no mesmo dia: módulo com cor BRANCA
    // "estourava" junto com a parede/piso (também claros), ficando tudo
    // achatado numa mancha branca só, sem sombra nenhuma pra separar as
    // peças (relatado com print: só as pernas pretas apareciam). Ambiente
    // alto demais = luz vindo de TODO lado por igual = sem sombra = sem
    // profundidade num objeto monocromático claro (o problema clássico de
    // fotografar algo branco num fundo branco). O ajuste certo pra separar
    // "branco do móvel" de "branco da parede" é menos luz difusa de ambiente
    // + mais luz DIRECIONAL (sombra visível nos cantos/frestas das peças),
    // não mexer na cor da parede.
    if ('environmentIntensity' in sc) sc.environmentIntensity = 0.9;

    const wallMat = new T.MeshStandardMaterial({ color: '#f5f3f0', roughness: 0.95, metalness: 0 });
    const floorMat = new T.MeshStandardMaterial({ color: '#e9e6e2', roughness: 0.9, metalness: 0 });
    const baseboardMat = new T.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, metalness: 0 });

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    let maxHeight = 0;
    let intoSumX = 0, intoSumZ = 0;

    walls.forEach((wall) => {
      const ax = Number(wall.alongDirX) || 0, az = Number(wall.alongDirZ) || 0;
      const ix = Number(wall.intoDirX) || 0, iz = Number(wall.intoDirZ) || 0;
      const ox = Number(wall.originX) || 0, oz = Number(wall.originZ) || 0;
      const rotY = Number(wall.rotationY) || 0;
      const cosR = Math.cos(rotY), sinR = Math.sin(rotY);
      const widthM = Number(wall.widthM) || 0;
      intoSumX += ix; intoSumZ += iz;

      // Parede sólida: centrada no meio do segmento, empurrada meia
      // espessura pra FORA do ambiente (-intoDir) — a face interna coincide
      // com a linha da parede, onde os módulos encostam.
      const midX = ox + ax * (widthM / 2), midZ = oz + az * (widthM / 2);
      const wallGeom = new T.BoxGeometry(widthM, ceilingM, WALL_THICK_M);
      const wallMesh = new T.Mesh(wallGeom, wallMat);
      wallMesh.rotation.y = rotY;
      wallMesh.position.set(midX - ix * (WALL_THICK_M / 2), ceilingM / 2, midZ - iz * (WALL_THICK_M / 2));
      sc.add(wallMesh);

      if (baseH > 0) {
        const bbGeom = new T.BoxGeometry(widthM, baseH, BASEBOARD_DEPTH_M);
        const bb = new T.Mesh(bbGeom, baseboardMat);
        bb.rotation.y = rotY;
        bb.position.set(midX + ix * (BASEBOARD_DEPTH_M / 2), baseH / 2, midZ + iz * (BASEBOARD_DEPTH_M / 2));
        sc.add(bb);
      }

      [0, widthM].forEach((along) => {
        const wx = ox + ax * along, wz = oz + az * along;
        minX = Math.min(minX, wx); maxX = Math.max(maxX, wx);
        minZ = Math.min(minZ, wz); maxZ = Math.max(maxZ, wz);
      });

      (wall.modules || []).forEach((m) => {
        const widthMod = m.width_mm / 1000, heightMod = m.height_mm / 1000, depthMod = m.depth_mm / 1000;
        const group = buildAssembly(m.parts, widthMod, heightMod, depthMod, true);
        const floorHeightM = (m.floor_height_mm || 0) / 1000;
        const alongOffset = (m.x_mm || 0) / 1000 + widthMod / 2;
        // Sem recuo de rodapé (2026-08-15) — a regra que empurrava o módulo de
        // CHÃO pra frente pela espessura do baseboard foi eliminada do sistema
        // inteiro a pedido do Matt ("nao pode afastar de lugar nenhum"). Este
        // arquivo é porta fiel de renderFreeformWalls (viewer3d_composition.js),
        // então acompanha: qualquer divergência aqui faria a foto realista sair
        // com o móvel em posição diferente da vista 3D.
        const depthOffset = depthMod / 2 + (Number(m.z_order) || 0) * FREEFORM_DEPTH_STEP_M;

        group.rotation.y = rotY;
        group.position.set(
          ox + ax * alongOffset + ix * depthOffset,
          floorHeightM,
          oz + az * alongOffset + iz * depthOffset
        );
        sc.add(group);

        maxHeight = Math.max(maxHeight, floorHeightM + heightMod);
        const halfW = widthMod / 2, halfD = depthMod / 2;
        [[-halfW, -halfD], [halfW, -halfD], [-halfW, halfD], [halfW, halfD]].forEach(([lx, lz]) => {
          const wx = group.position.x + lx * cosR + lz * sinR;
          const wz = group.position.z - lx * sinR + lz * cosR;
          minX = Math.min(minX, wx); maxX = Math.max(maxX, wx);
          minZ = Math.min(minZ, wz); maxZ = Math.max(maxZ, wz);
        });
      });
    });

    if (!isFinite(minX)) { minX = -1; maxX = 1; minZ = -1; maxZ = 1; }

    // Piso: cobre a caixa toda + folga generosa (a câmera olha de dentro do
    // ambiente; o que passar da parede fica escondido atrás dela).
    const floorPad = 1.5;
    const floorW = (maxX - minX) + floorPad * 2, floorD = (maxZ - minZ) + floorPad * 2;
    const floorGeom = new T.BoxGeometry(Math.max(floorW, 1), 0.02, Math.max(floorD, 1));
    const floorMesh = new T.Mesh(floorGeom, floorMat);
    floorMesh.position.set((minX + maxX) / 2, -0.01, (minZ + maxZ) / 2);
    sc.add(floorMesh);

    // Luzes de apoio (mesmas do teste aprovado, sem a HemisphereLight que o
    // path tracer ignora) — dão direção/sombra por cima da luz de ambiente.
    // Intensidades SUBIDAS (0.55→1.05 / 0.25→0.35, 2026-08-03, junto com o
    // ambiente baixado acima) — pedido é o mesmo problema do módulo branco:
    // pra um objeto monocromático se separar da parede também clara,
    // precisa de SOMBRA (luz direcional forte o bastante pra marcar canto de
    // prateleira/gaveta), não só claridade geral. fillLight continua bem
    // mais fraca que dirLight de propósito — sombra apagada demais volta a
    // achatar tudo.
    const dirLight = new T.DirectionalLight(0xffffff, 1.05);
    dirLight.position.set(2, 3, 2);
    sc.add(dirLight);
    const fillLight = new T.DirectionalLight(0xffffff, 0.35);
    fillLight.position.set(-2, 1, -2);
    sc.add(fillLight);

    // ---------- câmera ----------
    // PRIORIDADE (pedido do usuário 2026-08-03: "a foto deve pegar a camera
    // do posicionamento do 3d"): se veio cameraState (ViewerProjectEdit.
    // getCameraState() — posição/alvo/fov/aspect em números crus, inclui
    // orbit/zoom manual), usa ela IGUAL. Mundo é o mesmo (mesmas paredes em
    // metros), então os números batem 1:1. Fallback: enquadramento
    // automático (bissetriz + projeção dos 8 cantos, porta de
    // renderFreeformWalls) pra quando a vista 3D nunca foi aberta.
    const camState = sceneData.camera;
    if (camState && camState.position && camState.target) {
      const fov = camState.fov || 35;
      const targetVec = new T.Vector3(camState.target.x, camState.target.y, camState.target.z);
      let posVec = new T.Vector3(camState.position.x, camState.position.y, camState.position.z);
      // CÂMERA PARALELA/ortográfica (2026-08-26, Matt: "a foto realista...
      // nao esta respeitando a posicao escolhida da camera... sempre traz so
      // uma posicao fixa") — ver o comentário grande em getCameraState()
      // (viewer3d_composition.js). Em modo Paralelo o zoom do usuário troca o
      // FRUSTUM (camera.zoom), não a posição — então usar position/target crus
      // igual ao modo Perspectiva jogava fora o zoom de verdade e a foto saía
      // sempre perto do enquadramento automático inicial. O bundle do path
      // tracer só sabe desenhar com PerspectiveCamera (não portamos suporte a
      // OrthographicCamera pra não arriscar quebrar o render em cima de uma
      // lib de terceiro sem poder testar ao vivo), então aqui a gente TRADUZ:
      // mesma direção de visada (posição→alvo) que o usuário escolheu, só que
      // reposicionada na distância que reproduz a MESMA altura visível
      // (orthoHeight) via perspectiva — preserva o enquadramento/zoom em vez
      // de descartar.
      if (camState.isOrthographic && camState.orthoHeight > 0) {
        const dir = posVec.clone().sub(targetVec);
        const dist = dir.length();
        if (dist > 0.001) {
          dir.normalize();
          const wantedDist = (camState.orthoHeight / 2) / Math.tan((fov * Math.PI / 180) / 2);
          posVec = targetVec.clone().addScaledVector(dir, wantedDist);
        }
      }
      const cam = new T.PerspectiveCamera(fov, camState.aspect || (4 / 3), 0.01, 100);
      cam.position.copy(posVec);
      cam.lookAt(targetVec.x, targetVec.y, targetVec.z);
      cam.updateProjectionMatrix();
      return { scene: sc, camera: cam };
    }
    const totalWidth = Math.max(maxX - minX, 0.3);
    const totalDepth = Math.max(maxZ - minZ, 0.3);
    const centerX = (minX + maxX) / 2, centerZ = (minZ + maxZ) / 2;
    const frameH = Math.max(maxHeight, ceilingM);
    const target = new T.Vector3(centerX, frameH / 2, centerZ);
    if (Math.hypot(intoSumX, intoSumZ) < 0.001) { intoSumX = 0; intoSumZ = 1; }
    const dir = new T.Vector3(intoSumX, 0.55, intoSumZ).normalize();

    const cam = new T.PerspectiveCamera(35, 4 / 3, 0.01, 100);
    const fovYRad = cam.fov * Math.PI / 180;
    const fovXRad = 2 * Math.atan(Math.tan(fovYRad / 2) * cam.aspect);
    const forward = dir.clone().negate();
    const rightAxis = new T.Vector3().crossVectors(forward, new T.Vector3(0, 1, 0)).normalize();
    const upAxis = new T.Vector3().crossVectors(rightAxis, forward).normalize();
    const hw = totalWidth / 2, hh = frameH / 2, hd = totalDepth / 2;
    let maxU = 0.15, maxV = 0.15;
    [-1, 1].forEach((sx) => [-1, 1].forEach((sy) => [-1, 1].forEach((sz) => {
      const corner = new T.Vector3(sx * hw, sy * hh, sz * hd);
      maxU = Math.max(maxU, Math.abs(corner.dot(rightAxis)));
      maxV = Math.max(maxV, Math.abs(corner.dot(upAxis)));
    })));
    const dist = Math.max(maxU / Math.tan(fovXRad / 2), maxV / Math.tan(fovYRad / 2)) * 1.05;
    cam.position.copy(target).addScaledVector(dir, dist);
    cam.near = Math.max(dist / 200, 0.01);
    cam.far = dist * 20;
    cam.lookAt(target.x, target.y, target.z);
    cam.updateProjectionMatrix();

    return { scene: sc, camera: cam };
  }

  // ---------- modal ----------
  // TRADUÇÃO COM REDE DE SEGURANÇA (2026-08-18) — se por algum motivo este
  // arquivo for carregado numa página sem js/i18n.js, cai no texto em
  // português em vez de derrubar o render inteiro.
  function tr(chave, vars, padrao) {
    if (typeof I18n !== 'undefined' && I18n && I18n.t) {
      const v = I18n.t(chave, vars);
      if (v !== chave) return v;
    }
    return padrao;
  }

  function ensureModal() {
    if (modalEl) return;
    modalEl = document.createElement('div');
    modalEl.id = 'po-photoreal-modal';
    modalEl.style.cssText = 'position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,0.55);padding:16px;';
    modalEl.innerHTML =
      '<div style="background:#fff;border-radius:10px;max-width:min(1600px,96vw);width:100%;padding:14px 16px 16px;box-shadow:0 10px 40px rgba(0,0,0,0.35);">' +
      '  <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px;">' +
      '    <strong style="font-size:15px;">' + tr('photoreal.modal_title', null, 'Foto realista do projeto (beta)') + '</strong>' +
      '    <span id="po-photoreal-status" style="font-size:12px;color:#666;flex:1;"></span>' +
      '    <button type="button" id="po-photoreal-stop" class="secondary" style="font-size:12px;">' + tr('photoreal.btn_stop', null, 'Parar') + '</button>' +
      '    <button type="button" id="po-photoreal-save" class="secondary" style="font-size:12px;display:none;">' + tr('photoreal.btn_retry_save', null, '🔄 Tentar salvar de novo') + '</button>' +
      '    <button type="button" id="po-photoreal-dl" class="secondary" style="font-size:12px;" disabled>' + tr('photoreal.btn_download_png', null, 'Baixar PNG') + '</button>' +
      '    <button type="button" id="po-photoreal-close" class="secondary" style="font-size:12px;">' + tr('photoreal.btn_close', null, 'Fechar') + '</button>' +
      '  </div>' +
      '  <div id="po-photoreal-save-status" style="font-size:12px;color:#2a7a2a;margin:-4px 0 8px;"></div>' +
      '  <div id="po-photoreal-canvas-wrap" style="width:100%;aspect-ratio:4/3;background:#f2f2f2;border-radius:6px;overflow:hidden;"></div>' +
      '</div>';
    document.body.appendChild(modalEl);
    canvasWrapEl = modalEl.querySelector('#po-photoreal-canvas-wrap');
    statusEl = modalEl.querySelector('#po-photoreal-status');
    saveStatusEl = modalEl.querySelector('#po-photoreal-save-status');
    dlBtn = modalEl.querySelector('#po-photoreal-dl');
    stopBtn = modalEl.querySelector('#po-photoreal-stop');
    saveBtn = modalEl.querySelector('#po-photoreal-save');
    modalEl.querySelector('#po-photoreal-close').addEventListener('click', close);
    // Parar ANTES do alvo de amostras (2026-08-03): conta como "render
    // pronto" pro autosave — o usuário escolheu explicitamente parar ali,
    // então o que já tem na tela é o que ele quer guardar (mesmo gate de
    // qualidade mínima do botão Baixar, samplesDone >= 3).
    stopBtn.addEventListener('click', () => {
      loopActive = false;
      setStatus(tr('photoreal.status_stopped', { n: samplesDone }, 'Parado em ' + samplesDone + ' amostras — dá pra baixar assim mesmo.'));
      maybeAutoSave();
    });
    dlBtn.addEventListener('click', () => {
      if (!renderer) return;
      const a = document.createElement('a');
      a.download = 'projeto-foto-realista.png';
      a.href = renderer.domElement.toDataURL('image/png');
      a.click();
    });
    // Botão de RETRY (2026-08-03): só aparece se o autosave falhar (rede,
    // migration 077 não rodada, etc.) — clique manda o MESMO PNG de novo
    // (lastRenderDataUrl), sem precisar re-renderizar.
    saveBtn.addEventListener('click', () => {
      if (lastRenderDataUrl) performAutoSave(lastRenderDataUrl);
    });
  }
  function setStatus(msg) { if (statusEl) statusEl.textContent = msg; }
  function setSaveStatus(msg, isError) {
    if (!saveStatusEl) return;
    saveStatusEl.textContent = msg;
    saveStatusEl.style.color = isError ? '#b3261e' : '#2a7a2a';
  }
  // Salvamento automático (2026-08-03) — chamado quando o render termina
  // (alvo de amostras atingido) ou é parado manualmente com amostras
  // suficientes. UMA vez por render (savedForThisRender), pra não duplicar
  // versão se o usuário clicar "Parar" depois do alvo já ter disparado o
  // autosave sozinho.
  function maybeAutoSave() {
    if (savedForThisRender || !onSaveCallback || !renderer || samplesDone < 3) return;
    performAutoSave(renderer.domElement.toDataURL('image/png'));
  }
  async function performAutoSave(dataUrl) {
    if (!onSaveCallback) return;
    lastRenderDataUrl = dataUrl;
    saveBtn.style.display = 'none';
    setSaveStatus(tr('photoreal.save_saving', null, '💾 Salvando no projeto…'), false);
    try {
      await onSaveCallback(dataUrl);
      savedForThisRender = true;
      setSaveStatus(tr('photoreal.save_ok', null, '✅ Salvo no projeto (nova versão) — dá pra gerar outro ângulo e salvar de novo, ou fechar.'), false);
    } catch (err) {
      console.error(err);
      setSaveStatus(tr('photoreal.save_error', { msg: (err && err.message ? err.message : err) }, '⚠️ Falha ao salvar no projeto: ' + (err && err.message ? err.message : err)), true);
      saveBtn.style.display = 'inline-block';
    }
  }
  function close() {
    loopActive = false;
    if (modalEl) modalEl.style.display = 'none';
    // renderer/pathTracer ficam vivos de propósito (compilação de shader é
    // paga 1x por sessão); só a cena é solta.
    scene = null; camera = null;
  }

  // ---------- criação/descarte do renderer+pathTracer (WebGL context) ----------
  // Extraído do open() (2026-08-03, pedido do usuário: "antes de gerar as
  // camadas, ele esta trancando ai saio e entro denovo ai ele gera") — o
  // watchdog logo abaixo (runPathTracerAttempt) usa estas duas funções pra
  // se recuperar sozinho de um shader que trava compilando, sem precisar o
  // usuário sair da página.
  function createFreshRenderer() {
    const testCanvas = document.createElement('canvas');
    if (!testCanvas.getContext('webgl2')) {
      setStatus(tr('photoreal.no_webgl2', null, 'Este navegador/aparelho não tem WebGL2 — a foto realista não funciona aqui.'));
      return false;
    }
    renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    if ('outputColorSpace' in renderer) renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    pathTracer = new RenderFielLibs.WebGLPathTracer(renderer);
    pathTracer.filterGlossyFactor = 0.5;
    pathTracer.minSamples = 1;
    pathTracer.bounces = 6;
    return true;
  }
  // Descarte de VERDADE do contexto WebGL — antes disto, o único jeito de
  // "destravar" um shader que nunca termina de compilar era o usuário
  // fechar a ABA/PÁGINA inteira (fechar só o modal não bastava: renderer/
  // pathTracer são singletons vivos de propósito pra não pagar a
  // compilação de novo a cada foto — ver comentário em close() — então
  // reabrir o modal reusava o MESMO contexto GL travado). Agora isso é
  // feito programaticamente, uma vez, quando o watchdog detecta a
  // compilação travada (ver runPathTracerAttempt).
  function disposeRenderer() {
    try { if (pathTracer) pathTracer.dispose(); } catch (e) { /* ignora */ }
    try { if (renderer) renderer.dispose(); } catch (e) { /* ignora */ }
    try { if (renderer && renderer.domElement && renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement); } catch (e) { /* ignora */ }
    renderer = null;
    pathTracer = null;
  }
  function attachAndSizeCanvas() {
    canvasWrapEl.innerHTML = '';
    canvasWrapEl.appendChild(renderer.domElement);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    const displayW = Math.max(canvasWrapEl.clientWidth, 320);
    const renderW = Math.min(displayW, 1280);
    renderer.setSize(renderW, Math.max(Math.round(renderW / PHOTO_ASPECT), 120), false);
  }

  // ---------- fluxo principal ----------
  async function open(sceneData) {
    ensureModal();
    modalEl.style.display = 'flex';
    dlBtn.disabled = true;
    saveBtn.style.display = 'none';
    setSaveStatus('', false);
    onSaveCallback = (sceneData && typeof sceneData.onSave === 'function') ? sceneData.onSave : null;
    samplesDone = 0;
    loopActive = false;
    savedForThisRender = false;
    lastRenderDataUrl = null;
    hardResetTried = false;

    // ---------- 1 tentativa de render (setScene + loop de amostras) ----------
    // Extraído do corpo de open() (2026-08-03, pedido do usuário: "antes de
    // gerar as camadas, ele esta trancando ai saio e entro denovo ai ele
    // gera") — o watchdog abaixo (samplesDone preso em 0) agora se recupera
    // SOZINHO na 1ª vez que isso acontece: descarta o contexto WebGL
    // travado (disposeRenderer), cria um novo (createFreshRenderer) e
    // chama esta função de novo, reaproveitando a MESMA scene/camera já
    // montada (não precisa rebaixar texturas nem reconstruir geometria).
    // É exatamente o que "fechar e reabrir" fazia manualmente (só que
    // fechar só o MODAL não bastava antes — o contexto GL travado
    // continuava vivo; só um reload de página inteira destruía de
    // verdade). Se travar de novo mesmo depois do reset automático, aí sim
    // orienta a recarregar a página (pode ser um limite real do
    // driver/GPU, não só um soluço passageiro).
    function runPathTracerAttempt() {
      setStatus(tr('photoreal.status_preparing', null, 'Preparando cena/materiais — a tela pode congelar alguns segundos (normal na 1ª vez)…'));
      return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))).then(() => {
        const t0 = performance.now();
        pathTracer.setScene(scene, camera);
        pathTracer.reset();
        const secs = ((performance.now() - t0) / 1000).toFixed(1);
        setStatus(tr('photoreal.status_render_started', { s: secs }, 'Renderizando… (cena preparada em ' + secs + 's)'));

        samplesDone = 0;
        loopActive = true;
        // Watchdog do "0/250 travado": samples preso em 0 com o loop
        // rodando sem erro = compilação ASSÍNCRONA do shader ainda em
        // andamento (renderSample vira no-op e desenha só a prévia lisa
        // enquanto isso). Em GPU/driver lento isso leva 1-2 min de verdade
        // — então primeiro AVISA o que está acontecendo; se passar de 25s,
        // tenta UM chute de recuperação leve (reset); se passar de 120s,
        // tenta o reset PESADO (novo contexto WebGL) uma única vez.
        const loopStart = performance.now();
        let recoveryTried = false;
        const loop = () => {
          if (!loopActive) return;
          try {
            pathTracer.renderSample();
            samplesDone = Math.round(pathTracer.samples);
            if (samplesDone >= 3) { dlBtn.disabled = false; }
            if (samplesDone >= TARGET_SAMPLES) {
              loopActive = false;
              setStatus(tr('photoreal.status_done', { n: samplesDone }, 'Pronto — ' + samplesDone + ' amostras. Baixa o PNG ou fecha.'));
              maybeAutoSave();
              return;
            }
            if (samplesDone < 1) {
              const waited = Math.round((performance.now() - loopStart) / 1000);
              if (waited > 120) {
                loopActive = false;
                if (!hardResetTried) {
                  hardResetTried = true;
                  setStatus(tr('photoreal.status_gpu_reset', null, 'A GPU travou compilando o render — reiniciando automaticamente (só desta vez, não precisa sair da tela)…'));
                  disposeRenderer();
                  if (createFreshRenderer()) {
                    attachAndSizeCanvas();
                    dlBtn.disabled = true;
                    runPathTracerAttempt();
                  }
                } else {
                  setStatus(tr('photoreal.status_gpu_failed', null, 'A GPU não terminou de compilar o render mesmo depois de reiniciar — recarrega a página inteira (F5) e tenta de novo, ou testa em outro navegador/aparelho.'));
                }
                return;
              }
              if (waited > 25 && !recoveryTried) {
                recoveryTried = true;
                try { pathTracer.reset(); } catch (e) { /* segue esperando */ }
              }
              setStatus(tr('photoreal.status_compiling', { s: waited }, 'Compilando o render na GPU… ' + waited + 's (normal levar 1-2 min na 1ª vez; a imagem lisa é só a prévia)'));
            } else {
              setStatus(tr('photoreal.status_rendering', { n: samplesDone, total: TARGET_SAMPLES }, 'Renderizando… ' + samplesDone + ' / ' + TARGET_SAMPLES + ' amostras'));
            }
            requestAnimationFrame(loop);
          } catch (err) {
            loopActive = false;
            console.error(err);
            setStatus(tr('photoreal.status_render_error', { msg: (err && err.message ? err.message : err) }, 'Erro no render: ' + (err && err.message ? err.message : err)));
          }
        };
        requestAnimationFrame(loop);
      });
    }

    try {
      if (typeof RenderFielLibs === 'undefined') {
        setStatus(tr('photoreal.status_downloading_engine', null, 'Baixando motor de render (~250 KB, só na 1ª vez)…'));
        await ensureBundle();
      }
      T = RenderFielLibs.THREE;

      if (!renderer) {
        if (!createFreshRenderer()) return;
      }
      if (renderer.domElement.parentNode !== canvasWrapEl) {
        canvasWrapEl.innerHTML = '';
        canvasWrapEl.appendChild(renderer.domElement);
        renderer.domElement.style.width = '100%';
        renderer.domElement.style.height = '100%';
        renderer.domElement.style.display = 'block';
      }

      pendingTextures = []; // só espera pelas texturas NOVAS desta foto (cache não re-baixa)
      const built = buildProjectScene(sceneData);
      scene = built.scene;
      camera = built.camera;
      // Formato da FOTO travado em 4:3 (pedido do usuário 2026-08-03: "imagem
      // maior e mais quadrada" — antes seguia o aspect esticado/panorâmico do
      // canvas do viewer). A POSIÇÃO/ângulo continuam vindo da câmera da
      // vista 3D; só o recorte vertical abre mais (mostra mais teto/chão).
      // maxWidth via 76vh garante que a imagem 4:3 GRANDE caiba na altura da
      // tela sem rolagem, centrada no modal largo.
      camera.aspect = PHOTO_ASPECT;
      camera.updateProjectionMatrix();
      canvasWrapEl.style.aspectRatio = String(PHOTO_ASPECT);
      canvasWrapEl.style.maxWidth = 'min(100%, calc(76vh * ' + PHOTO_ASPECT + '))';
      canvasWrapEl.style.margin = '0 auto';
      // Resolução INTERNA limitada a 1280px (2026-08-03, travou em "0/250":
      // com a janela grande o canvas foi a ~1500px e o par compilação de
      // shader + amostra ficou pesado demais — em GPU fraca a compilação
      // assíncrona nunca "termina" e o contador fica em 0 pra sempre,
      // mostrando só a prévia lisa). O CSS estica o canvas pro tamanho da
      // janela (width:100%), então a IMAGEM continua grande na tela — só o
      // buffer de render que é menor. 1280×960 é mais que suficiente pro
      // PNG baixado.
      const displayW = Math.max(canvasWrapEl.clientWidth, 320);
      const renderW = Math.min(displayW, 1280);
      renderer.setSize(renderW, Math.max(Math.round(renderW / PHOTO_ASPECT), 120), false);

      if (pendingTextures.length) {
        setStatus(tr('photoreal.status_loading_textures', { n: pendingTextures.length }, 'Carregando texturas das cores (' + pendingTextures.length + ')…'));
        // Cada promise resolve TAMBÉM em erro (nunca trava pra sempre);
        // teto de 15s por segurança — o que não chegou vai sem textura.
        await Promise.race([
          Promise.all(pendingTextures),
          new Promise((r) => setTimeout(r, 15000))
        ]);
      }

      await runPathTracerAttempt();
    } catch (err) {
      console.error(err);
      setStatus(tr('photoreal.status_error', { msg: (err && err.message ? err.message : err) }, 'Erro: ' + (err && err.message ? err.message : err)));
    }
  }

  return { open };
})();
