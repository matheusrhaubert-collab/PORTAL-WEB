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
  function loadTexture(url, rotateMode) {
    if (!url) return null;
    const rotateSuffix = rotateMode === true ? '|rot90' : rotateMode === 'right' ? '|rot90r' : '';
    // 2026-08-27 — mesmo fix do js/viewer3d.js (ver o comentário grande de
    // lá): a chave de cache não inclui mais o repeat físico (repU/repV) —
    // agora é só (url, giro), no máximo 3 texturas por cor/acabamento. O
    // "tamanho físico" que antes ia em tex.repeat passa a ser pré-escalado
    // DIRETO no UV da geometria (ver scaleBoxUV, chamada em emitInto), antes
    // desta função ser chamada.
    const cacheKey = url + rotateSuffix;
    if (textureCache[cacheKey]) return textureCache[cacheKey];
    if (!textureLoader) { textureLoader = new T.TextureLoader(); textureLoader.setCrossOrigin('anonymous'); }
    let resolveLoaded;
    pendingTextures.push(new Promise((resolve) => { resolveLoaded = resolve; }));
    const tex = textureLoader.load(url, () => resolveLoaded(true), undefined, () => resolveLoaded(false));
    if ('colorSpace' in tex) tex.colorSpace = T.SRGBColorSpace;
    if (rotateMode === true) { tex.center.set(0.5, 0.5); tex.rotation = Math.PI / 2; }
    else if (rotateMode === 'right') { tex.center.set(0.5, 0.5); tex.rotation = -Math.PI / 2; }
    // Repeat fica em (1,1) sempre — o repeat físico agora é pré-escalado no
    // UV da geometria (ver comentário grande acima). Ainda precisa de
    // RepeatWrapping: o UV pré-escalado passa de 1 quando a peça é maior
    // que 1 tile.
    tex.wrapS = T.RepeatWrapping;
    tex.wrapT = T.RepeatWrapping;
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
  function makeMaterial(color, rotateTexture) {
    const textureUrl = color && color.texture_url;
    const tex = textureUrl ? loadTexture(textureUrl, rotateTexture) : null;
    if (tex) return new T.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.05 });
    const hex = (color && color.swatch_hex) || '#cccccc';
    return new T.MeshStandardMaterial({ color: hex, roughness: 0.85, metalness: 0.05 });
  }
  // Pré-escala o UV de TODA a geometria (aqui é sempre 1 material só pros 6
  // lados, ver comentário de TEXTURE_TILE_MM acima) pelo tamanho físico da
  // peça — mesmo mecanismo e mesma prova do js/viewer3d.js (scaleFaceUV, ver
  // o comentário grande de lá sobre o pivô mudar com rotateTexture),
  // simplificado aqui porque não existe divisão por face (sempre os 6 lados
  // juntos, o path tracer não monta material por face/receita de fita).
  function scaleBoxUV(geometry, repU, repV, rotateTexture) {
    if (repU === 1 && repV === 1) return;
    const uvAttr = geometry.attributes && geometry.attributes.uv;
    if (!uvAttr) return;
    const girou = rotateTexture === true || rotateTexture === 'right';
    for (let i = 0; i < uvAttr.count; i++) {
      const u = uvAttr.getX(i), v = uvAttr.getY(i);
      if (girou) {
        uvAttr.setXY(i, 0.5 + (u - 0.5) * repU, 0.5 + (v - 0.5) * repV);
      } else {
        uvAttr.setXY(i, u * repU, v * repV);
      }
    }
    uvAttr.needsUpdate = true;
  }
  function emitInto(parentGroup, contentOrGeometry, color, x, y, z, rotateTexture) {
    const ehGeometria = !!(contentOrGeometry && !contentOrGeometry.isGroup);
    const faceMm = ehGeometria ? faceMmDaGeometria(contentOrGeometry) : null;
    if (faceMm && ehGeometria) {
      scaleBoxUV(contentOrGeometry, quantizaRepeat(faceMm.u), quantizaRepeat(faceMm.v), rotateTexture);
    }
    const content = (contentOrGeometry && contentOrGeometry.isGroup)
      ? contentOrGeometry
      : new T.Mesh(contentOrGeometry, makeMaterial(color, rotateTexture));
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

  // =====================================================================
  // ITENS DE DECORAÇÃO COM GEOMETRIA PRÓPRIA (migration 141, 2026-08-26)
  //
  // Substitui as caixas planas da migration 039 (fogão/micro-ondas) e
  // acrescenta 5 itens novos (forno de torre duplo, lava-louças, pia, farm
  // pia, lixeira dupla) — mesmo padrão de dispatch por shape_type que o
  // cabide tubular (oval_rod, migration 062) já usa: cada módulo decorativo
  // tem UMA peça 'free' só, W/H/D=100% do módulo, e o shape_type
  // ('decor_fogao', 'decor_pia'...) escolhe qual função abaixo desenha o
  // conteúdo em vez da caixa padrão. Testado à parte (7 itens, screenshots
  // via Chromium headless, Three.js r128 real) em
  // scratch/teste-eletros-decor-3d.html antes de entrar aqui — ver
  // CLAUDE.md / memória do projeto pra contexto.
  //
  // Cor: só o material "main" respeita a cor escolhida pelo cliente
  // (part.color.swatch_hex, papel "Decor — Principal", as mesmas 5 cores
  // fixas da migration 039). Os outros materiais (inox de detalhe, vidro,
  // cromado, display, plástico do balde...) são FIXOS no código — mesmo
  // princípio de LEG_COLOR/ROD_COLOR logo acima: ferragem/acabamento que não
  // muda com a cor da caixa escolhida pelo cliente.

  const DECOR_SWATCH_MATERIAL_HINTS = {
    '#1c1c1e': { metal: 0.30, rough: 0.42 }, // Decor Preto
    '#f4f4f2': { metal: 0.05, rough: 0.55 }, // Decor Branco
    '#b9bdc1': { metal: 0.75, rough: 0.32 }, // Decor Inox
    '#9a8f83': { metal: 0.02, rough: 0.85 }, // Decor Tecido
    '#6b4f3a': { metal: 0.03, rough: 0.60 }, // Decor Madeira
  };

  function resolveDecorMaterials(color) {
    const hex = (color && color.swatch_hex) || '#c9cdd1';
    const hint = DECOR_SWATCH_MATERIAL_HINTS[String(hex).toLowerCase()] || { metal: 0.5, rough: 0.4 };
    return {
      main: new T.MeshStandardMaterial({ color: hex, metalness: hint.metal, roughness: hint.rough }),
      detail: new T.MeshStandardMaterial({ color: 0x35383c, metalness: 0.55, roughness: 0.28 }),
      glass: new T.MeshStandardMaterial({ color: 0x0c0d0f, metalness: 0.15, roughness: 0.12 }),
      chrome: new T.MeshStandardMaterial({ color: 0xd7dadd, metalness: 0.9, roughness: 0.15 }),
      display: new T.MeshStandardMaterial({ color: 0x0c1a12, emissive: 0x2ecc71, emissiveIntensity: 0.55, roughness: 0.4 }),
      counter: new T.MeshStandardMaterial({ color: 0xe6e1d8, metalness: 0.02, roughness: 0.6 }),
      binPlastic: new T.MeshStandardMaterial({ color: 0x2b2f33, metalness: 0.08, roughness: 0.55 }),
      cabinetFront: new T.MeshStandardMaterial({ color: 0xa9764f, metalness: 0.02, roughness: 0.55 }),
      cabinetCarc: new T.MeshStandardMaterial({ color: 0xcfc9bd, metalness: 0.02, roughness: 0.68 }),
    };
  }

  // ---- helpers de geometria (eixo-alinhados, mesma técnica do teste solto) ----
  function decorBoxMesh(w, h, d, material) {
    return new T.Mesh(new T.BoxGeometry(Math.max(w, 0.001), Math.max(h, 0.001), Math.max(d, 0.001)), material);
  }

  function decorRoundedBox(w, d, h, r, material) {
    const g = new T.Group();
    r = Math.max(0, Math.min(r, w / 2 - 0.002, d / 2 - 0.002));
    if (r <= 0.0015) { const m = decorBoxMesh(w, h, d, material); m.position.y = h / 2; g.add(m); return g; }
    const coreW = w - 2 * r, coreD = d - 2 * r;
    const bx = decorBoxMesh(w, h, coreD, material); bx.position.y = h / 2; g.add(bx);
    const bz = decorBoxMesh(coreW, h, d, material); bz.position.y = h / 2; g.add(bz);
    const cylGeo = new T.CylinderGeometry(r, r, h, 16);
    [[coreW / 2, coreD / 2], [-coreW / 2, coreD / 2], [coreW / 2, -coreD / 2], [-coreW / 2, -coreD / 2]].forEach(([cx, cz]) => {
      const c = new T.Mesh(cylGeo, material); c.position.set(cx, h / 2, cz); g.add(c);
    });
    return g;
  }

  // Caixa afunilada (mais estreita embaixo) — CylinderGeometry de 4 lados
  // vira um prisma retangular ao girar 45° (mesmo truque de baixo risco já
  // usado em decorRoundedBox/decorFlatRing, sem geometria customizada);
  // radiusBottom < radiusTop afunila IGUAL nos eixos X e Z, e a escala não-
  // uniforme (w, 1, d) achata esse prisma de círculo pra retângulo — topo e
  // base saem com a MESMA proporção W:D, só a base menor (taper < 1). Base
  // em y=0 (mesma convenção de decorRoundedBox). taper=1 = caixa reta (sem
  // afunilar). Cópia fiel de js/viewer3d.js (ver comentário lá) — usada na
  // lixeira dupla (26/08, referência: Häfele Wood Double Waste Bin
  // Pull-Out).
  function decorTaperedBox(w, h, d, taper, material) {
    const t = Math.max(0.03, Math.min(1, taper));
    const geo = new T.CylinderGeometry(1, t, Math.max(h, 0.001), 4, 1);
    geo.rotateY(Math.PI / 4);
    geo.translate(0, Math.max(h, 0.001) / 2, 0);
    const mesh = new T.Mesh(geo, material);
    mesh.scale.set(Math.max(w, 0.001), 1, Math.max(d, 0.001));
    return mesh;
  }

  function decorFrontKnob(r, len, material) {
    const m = new T.Mesh(new T.CylinderGeometry(r, r, len, 14), material);
    m.rotation.x = Math.PI / 2;
    return m;
  }

  function decorFlatRing(rOuter, tube, material) {
    const m = new T.Mesh(new T.TorusGeometry(rOuter, tube, 8, 20), material);
    m.rotation.x = Math.PI / 2;
    return m;
  }

  function decorAddControlStrip(parent, w, h, depth, x, y, z, frameMat, displayMat, nButtons) {
    const frame = decorBoxMesh(w, h, depth, frameMat); frame.position.set(x, y, z); parent.add(frame);
    const dispW = w * 0.28, dispH = h * 0.55;
    const disp = decorBoxMesh(dispW, dispH, 0.004, displayMat);
    disp.position.set(x - w / 2 + dispW / 2 + w * 0.05, y, z + depth / 2 + 0.002);
    parent.add(disp);
    const btnSize = Math.min(0.016, h * 0.5), gap = 0.008;
    let bx = x - w / 2 + dispW + w * 0.14;
    for (let i = 0; i < nButtons; i++) {
      const b = decorBoxMesh(btnSize, btnSize, 0.005, frameMat);
      b.position.set(bx, y, z + depth / 2 + 0.0025);
      parent.add(b);
      bx += btnSize + gap;
    }
  }

  function decorAddDoorWithGlass(parent, w, h, depth, x, y, z, frameMat, glassMat, handleMat, handleSide) {
    const door = decorBoxMesh(w, h, depth, frameMat); door.position.set(x, y, z); parent.add(door);
    const glassW = w * 0.8, glassH = h * 0.68;
    const glass = decorBoxMesh(glassW, glassH, 0.006, glassMat);
    glass.position.set(x, y + h * 0.03, z + depth / 2 + 0.0035);
    parent.add(glass);
    if (handleSide === 'top') {
      const handle = decorBoxMesh(w * 0.86, 0.02, 0.03, handleMat);
      handle.position.set(x, y + h / 2 - 0.03, z + depth / 2 + 0.02);
      parent.add(handle);
    } else if (handleSide === 'right') {
      const handle = decorBoxMesh(0.02, h * 0.55, 0.03, handleMat);
      handle.position.set(x + w / 2 - 0.03, y, z + depth / 2 + 0.02);
      parent.add(handle);
    }
  }

  function decorAddFeet(parent, w, d, material, footH) {
    const inset = Math.min(0.05, w * 0.06, d * 0.06), r = 0.014;
    const pts = [[w / 2 - inset, d / 2 - inset], [-(w / 2 - inset), d / 2 - inset], [w / 2 - inset, -(d / 2 - inset)], [-(w / 2 - inset), -(d / 2 - inset)]];
    pts.forEach(([x, z]) => {
      const foot = new T.Mesh(new T.CylinderGeometry(r, r * 0.8, footH, 10), material);
      foot.position.set(x, footH / 2, z);
      parent.add(foot);
    });
  }

  function decorAddControlPanelKnobs(parent, W, y, z, material, n) {
    const spacing = (W * 0.7) / Math.max(1, n - 1);
    let x = -W * 0.35;
    for (let i = 0; i < n; i++) {
      const k = decorFrontKnob(0.013, 0.022, material);
      k.position.set(x, y, z + 0.011);
      parent.add(k);
      x += spacing;
    }
  }

  function decorFaucet(material, riserH, spoutLen) {
    const g = new T.Group();
    const r = 0.011;
    const riser = new T.Mesh(new T.CylinderGeometry(r, r, riserH, 12), material);
    riser.position.y = riserH / 2; g.add(riser);
    const joint = new T.Mesh(new T.SphereGeometry(r * 1.2, 12, 8), material);
    joint.position.y = riserH; g.add(joint);
    const spout = new T.Mesh(new T.CylinderGeometry(r * 0.8, r * 0.8, spoutLen, 12), material);
    spout.rotation.x = Math.PI / 2;
    spout.position.set(0, riserH, spoutLen / 2);
    g.add(spout);
    const lever = new T.Mesh(new T.BoxGeometry(0.09, 0.014, 0.014), material);
    lever.position.set(0.05, riserH * 0.55, 0.02);
    g.add(lever);
    return g;
  }

  function decorCounterWithCutout(W, D, counterT, cutW, cutD, material) {
    const g = new T.Group();
    const sideW = Math.max(0.001, (W - cutW) / 2);
    const frontBackD = Math.max(0.001, (D - cutD) / 2);
    const left = decorBoxMesh(sideW, counterT, D, material); left.position.set(-(cutW / 2 + sideW / 2), -counterT / 2, 0); g.add(left);
    const right = decorBoxMesh(sideW, counterT, D, material); right.position.set((cutW / 2 + sideW / 2), -counterT / 2, 0); g.add(right);
    const front = decorBoxMesh(cutW, counterT, frontBackD, material); front.position.set(0, -counterT / 2, (cutD / 2 + frontBackD / 2)); g.add(front);
    const back = decorBoxMesh(cutW, counterT, frontBackD, material); back.position.set(0, -counterT / 2, -(cutD / 2 + frontBackD / 2)); g.add(back);
    return g;
  }

  // ---- construtores por item (W,H,D em METROS — já resolvidos por placePieceInBox) ----
  function buildDecorFogao(W, H, D, mats) {
    const g = new T.Group();
    const footH = 0.03;
    const cooktopH = Math.max(0.02, H * 0.045);
    const bodyH = Math.max(0.1, H - footH - cooktopH);
    decorAddFeet(g, W, D, mats.detail, footH);
    const body = decorRoundedBox(W, D, bodyH, 0.014, mats.main); body.position.y = footH; g.add(body);
    const cooktop = decorRoundedBox(W, D, cooktopH, 0.012, mats.detail); cooktop.position.y = footH + bodyH; g.add(cooktop);
    const topY = footH + bodyH + cooktopH;
    const burnerPos = [[-W * 0.24, D * 0.18], [W * 0.24, D * 0.18], [-W * 0.24, -D * 0.16], [W * 0.24, -D * 0.16]];
    burnerPos.forEach(([bx, bz], i) => {
      const rOuter = i < 2 ? W * 0.10 : W * 0.085;
      const r1 = decorFlatRing(rOuter, 0.006, mats.chrome); r1.position.set(bx, topY + 0.004, bz); g.add(r1);
      const cap = new T.Mesh(new T.CylinderGeometry(0.012, 0.014, 0.014, 10), mats.chrome);
      cap.position.set(bx, topY + 0.01, bz); g.add(cap);
    });
    decorAddControlPanelKnobs(g, W, footH + bodyH - 0.06, D / 2, mats.detail, 4);
    const doorH = bodyH * 0.8, doorW = W - 0.08, doorD = 0.025;
    decorAddDoorWithGlass(g, doorW, doorH, doorD, 0, footH + doorH / 2 + bodyH * 0.08, D / 2 + doorD / 2, mats.main, mats.glass, mats.chrome, 'top');
    return g;
  }

  function buildDecorMicroondas(W, H, D, mats) {
    const g = new T.Group();
    const body = decorRoundedBox(W, D, H, 0.01, mats.main); g.add(body);
    const doorW = W * 0.62, doorH = H * 0.8, doorD = 0.02;
    decorAddDoorWithGlass(g, doorW, doorH, doorD, -W * 0.5 + doorW / 2 + 0.015, H * 0.52, D / 2 + doorD / 2, mats.detail, mats.glass, mats.chrome, 'right');
    decorAddControlStrip(g, W * 0.28, H * 0.7, 0.015, W * 0.5 - W * 0.14 - 0.01, H * 0.52, D / 2 + 0.0075, mats.detail, mats.display, 4);
    return g;
  }

  function buildDecorFornoTorreDuplo(W, H, D, mats) {
    const g = new T.Group();
    const body = decorRoundedBox(W, D, H, 0.014, mats.main); g.add(body);
    const doorH = H * 0.34, doorW = W - 0.07, doorD = 0.025;
    const y1 = H * 0.28, y2 = H * 0.70;
    decorAddControlStrip(g, W * 0.7, 0.045, 0.018, 0, y1 + doorH / 2 + 0.05, D / 2 + 0.009, mats.detail, mats.display, 3);
    decorAddDoorWithGlass(g, doorW, doorH, doorD, 0, y1, D / 2 + doorD / 2, mats.main, mats.glass, mats.chrome, 'top');
    decorAddControlStrip(g, W * 0.7, 0.045, 0.018, 0, y2 + doorH / 2 + 0.05, D / 2 + 0.009, mats.detail, mats.display, 3);
    decorAddDoorWithGlass(g, doorW, doorH, doorD, 0, y2, D / 2 + doorD / 2, mats.main, mats.glass, mats.chrome, 'top');
    return g;
  }

  function buildDecorLavaLoucas(W, H, D, mats) {
    const g = new T.Group();
    const toeH = 0.09;
    const bodyH = H - toeH;
    const body = decorRoundedBox(W, D, bodyH, 0.012, mats.main); body.position.y = toeH; g.add(body);
    const toe = decorBoxMesh(W * 0.94, toeH * 0.8, 0.02, mats.glass); toe.position.set(0, toeH * 0.4, D / 2 - 0.02); g.add(toe);
    decorAddControlStrip(g, W * 0.9, 0.05, 0.02, 0, toeH + bodyH - 0.03, D / 2 + 0.01, mats.detail, mats.display, 5);
    const doorH = bodyH - 0.12, doorW = W - 0.05, doorD = 0.02, doorY = toeH + doorH / 2 + 0.02;
    const door = decorBoxMesh(doorW, doorH, doorD, mats.main); door.position.set(0, doorY, D / 2 + doorD / 2); g.add(door);
    for (let i = 0; i < 3; i++) {
      const line = decorBoxMesh(doorW * 0.86, 0.006, 0.006, mats.detail);
      line.position.set(0, doorY - doorH * 0.28 + i * doorH * 0.22, D / 2 + doorD + 0.004);
      g.add(line);
    }
    const handle = decorBoxMesh(doorW * 0.5, 0.018, 0.025, mats.chrome);
    handle.position.set(0, doorY + doorH / 2 - 0.025, D / 2 + doorD + 0.014);
    g.add(handle);
    return g;
  }

  function buildDecorPia(W, H, D, mats) {
    const g = new T.Group();
    const counterT = 0.03;
    const basinW = W * 0.78, basinD = D * 0.62, basinH = Math.max(0.1, Math.min(0.2, H * 0.9));
    const counter = decorCounterWithCutout(W, D, counterT, basinW + 0.02, basinD + 0.02, mats.counter); g.add(counter);
    const basin = decorBoxMesh(basinW, basinH, basinD, mats.main); basin.position.set(0, -basinH / 2 - 0.005, 0); g.add(basin);
    const rim = decorRoundedBox(basinW + 0.02, basinD + 0.02, 0.008, 0.01, mats.chrome); rim.position.y = -0.004; g.add(rim);
    const fct = decorFaucet(mats.chrome, Math.min(0.22, H * 1.05 || 0.2), 0.13);
    fct.position.set(0, 0, -D * 0.32);
    g.add(fct);
    return g;
  }

  function buildDecorFarmPia(W, H, D, mats) {
    const g = new T.Group();
    const apronH = H * 0.75;
    const counterT = 0.03;
    const apron = decorBoxMesh(W * 0.92, apronH, 0.05, mats.main); apron.position.set(0, apronH / 2, D / 2 - 0.02); g.add(apron);
    const basinW = W * 0.8, basinD = D * 0.68, basinH = apronH * 0.75;
    const counter = decorCounterWithCutout(W, D, counterT, basinW + 0.02, basinD + 0.02, mats.counter);
    counter.position.y = apronH; g.add(counter);
    const basin = decorBoxMesh(basinW, basinH, basinD, mats.detail);
    basin.position.set(0, apronH - counterT - basinH / 2 + 0.01, -0.01);
    g.add(basin);
    const fct = decorFaucet(mats.chrome, Math.min(0.24, apronH * 1.1), 0.15);
    fct.position.set(0, apronH, -D * 0.28);
    g.add(fct);
    return g;
  }

  function buildDecorLixeiraDupla(W, H, D, mats) {
    const g = new T.Group();
    // SÓ o carrinho puxa-saco (sem gabinete/porta em volta) — cópia fiel
    // de js/viewer3d.js (ver comentário lá pro histórico completo).
    const platformW = W * 0.92;
    const platformD = D * 0.85;
    const platformT = Math.min(0.03, H * 0.08);
    const platform = decorTaperedBox(platformW, platformT, platformD, 1, mats.cabinetFront);
    platform.position.set(0, 0, 0);
    g.add(platform);

    const binWTop = platformW * 0.42;
    const binDTop = platformD * 0.86;
    const binGap = platformW * 0.12;
    const binH = binWTop * 1.15;
    const railT = 0.01;
    const railH = binH + 0.04;
    const railD = platformD * 0.92;
    [-1, 1].forEach((side) => {
      const rail = decorTaperedBox(railT, railH, railD, 1, mats.chrome);
      rail.position.set(side * (platformW / 2 + railT / 2), platformT, 0);
      g.add(rail);
    });

    [-1, 1].forEach((side) => {
      const bx = side * (binWTop / 2 + binGap / 2);
      const bin = decorTaperedBox(binWTop, binH, binDTop, 0.72, mats.binPlastic);
      bin.position.set(bx, platformT, 0);
      g.add(bin);
      const rim = decorTaperedBox(binWTop * 1.08, 0.014, binDTop * 1.08, 1, mats.binPlastic);
      rim.position.set(bx, platformT + binH, 0);
      g.add(rim);
    });

    const bracket = new T.Mesh(new T.CylinderGeometry(0.007, 0.007, platformW + 2 * railT, 10), mats.chrome);
    bracket.rotation.z = Math.PI / 2;
    bracket.position.set(0, platformT + railH - 0.02, -railD / 2);
    g.add(bracket);
    return g;
  }


  function buildDecorCooktop(W, H, D, mats) {
    const g = new T.Group();
    // Placa de vidro/cerâmica com 4 bocas + controles touch no topo — sem
    // gabinete embaixo (encaixa no recorte de bancada que o próprio usuário
    // já modela). H não estica a peça — é só a espessura real do vidro
    // (fixa e pequena); se o módulo for mais "alto" que isso, sobra vão
    // embaixo/acima, e tudo bem (mesma lógica da lixeira dupla).
    const platformW = W * 0.96;
    const plateD = D * 0.90;
    const plateT = Math.min(0.012, Math.max(0.006, H * 0.3));
    const plate = decorRoundedBox(platformW, plateD, plateT, 0.012, mats.glass);
    plate.position.set(0, 0, 0);
    g.add(plate);

    const burnerR = Math.min(platformW, plateD) * 0.13;
    const offX = platformW * 0.24, offZ = plateD * 0.20;
    [-1, 1].forEach((rz) => {
      [-1, 1].forEach((cx) => {
        const ring = decorFlatRing(burnerR, burnerR * 0.09, mats.detail);
        ring.position.set(cx * offX, plateT + 0.0015, rz * offZ);
        g.add(ring);
        const innerRing = decorFlatRing(burnerR * 0.55, burnerR * 0.06, mats.detail);
        innerRing.position.set(cx * offX, plateT + 0.0015, rz * offZ);
        g.add(innerRing);
      });
    });

    const dispW = platformW * 0.22, dispD = plateD * 0.10;
    const disp = decorBoxMesh(dispW, 0.0015, dispD, mats.display);
    disp.position.set(0, plateT + 0.002, plateD / 2 - plateD * 0.13);
    g.add(disp);
    const btnCount = 4, btnSize = Math.min(0.018, plateD * 0.05);
    let bx = -btnSize * (btnCount - 1);
    for (let i = 0; i < btnCount; i++) {
      const b = decorBoxMesh(btnSize, 0.0012, btnSize, mats.detail);
      b.position.set(bx, plateT + 0.0018, plateD / 2 - plateD * 0.045);
      g.add(b);
      bx += btnSize * 2;
    }

    return g;
  }

  function buildDecorCoifa(W, H, D, mats) {
    const g = new T.Group();
    // Coifa de parede: corpo/redoma embaixo (y=0 = base do corpo, altura
    // de instalação típica acima do cooktop) + duto cônico subindo até H
    // (topo, perto do teto). Diferente da lixeira: aqui H IMPORTA de
    // verdade — o duto precisa vencer o vão até o teto que o cliente
    // configurar.
    const bodyW = W * 0.94;
    const bodyD = D * 0.85;
    const bodyH = Math.min(H * 0.22, 0.16);
    const body = decorRoundedBox(bodyW, bodyD, bodyH, 0.015, mats.main);
    body.position.set(0, 0, 0);
    g.add(body);

    decorAddControlStrip(g, bodyW * 0.5, bodyH * 0.28, 0.012, 0, bodyH * 0.5, bodyD / 2, mats.detail, mats.display, 3);

    // duto cônico: largo perto do corpo, estreito perto do teto.
    // decorTaperedBox nativo é base(y=0)=estreita / topo(y=h)=larga — aqui
    // é o oposto, então invertemos com rotation.x=PI e compensamos
    // position.y (o pivô passa a ser a ponta ESTREITA, no topo; a ponta
    // LARGA fica pivô.y - ductH, que colocamos exatamente no topo do
    // corpo).
    const ductH = Math.max(0.05, H - bodyH);
    const ductWBottom = bodyW * 0.55;
    const ductDBottom = bodyD * 0.55;
    const ductTaper = 0.42;
    const duct = decorTaperedBox(ductWBottom, ductH, ductDBottom, ductTaper, mats.main);
    duct.rotation.x = Math.PI;
    duct.position.set(0, bodyH + ductH, 0);
    g.add(duct);

    return g;
  }

  function buildDecorSpiceRack(W, H, D, mats) {
    const g = new T.Group();
    // Carrinho porta-temperos "puxa-fora" de verdade (Matt mandou foto de
    // produto real, 27/08: "spice rack quero um assim" — tipo Rev-A-Shelf
    // 432, troca do desenho v1 de postes+potes): corpo estreito de madeira
    // (2 laterais + 4 prateleiras, a de cima com bandeja/aba baixa em vez
    // de trilho) + trilho de arame cromado em U na frente das 3
    // prateleiras de baixo + corrediça na base + mãozinhas de fixação na
    // frente. Solto, sem armário em volta — encaixa dentro do vão/armário
    // que o usuário já modela (mesmo princípio da lixeira dupla).
    const panelT = Math.min(0.014, Math.max(0.008, W * 0.09));
    const bodyD = D * 0.92;
    const shelfN = 4;
    const shelfT = 0.012;

    [-1, 1].forEach((side) => {
      const panel = decorBoxMesh(panelT, H, bodyD, mats.cabinetFront);
      panel.position.set(side * (W / 2 - panelT / 2), H / 2, 0);
      g.add(panel);
    });

    const innerW = Math.max(0.02, W - 2 * panelT);
    const lipH = 0.03;
    // Reserva lipH no topo pra bandeja da prateleira de cima NÃO furar o
    // teto do módulo (H) — a prateleira de cima fica embaixo da bandeja,
    // não no topo absoluto.
    const shelfSpan = Math.max(0.05, H - shelfT - lipH);
    const shelfGap = shelfSpan / (shelfN - 1);
    for (let i = 0; i < shelfN; i++) {
      const y = i * shelfGap + shelfT / 2;
      const isTop = i === shelfN - 1;
      const shelf = decorBoxMesh(innerW, shelfT, bodyD, mats.cabinetFront);
      shelf.position.set(0, y, 0);
      g.add(shelf);

      if (isTop) {
        const lip = decorBoxMesh(innerW, lipH, 0.01, mats.cabinetFront);
        lip.position.set(0, y + shelfT / 2 + lipH / 2, bodyD / 2 - 0.005);
        g.add(lip);
      } else {
        const railY = y + shelfT / 2 + 0.05;
        const railR = 0.004;
        const front = new T.Mesh(new T.CylinderGeometry(railR, railR, innerW * 0.94, 8), mats.chrome);
        front.rotation.z = Math.PI / 2;
        front.position.set(0, railY, bodyD / 2 - 0.01);
        g.add(front);
        [-1, 1].forEach((side) => {
          const ret = new T.Mesh(new T.CylinderGeometry(railR, railR, 0.10, 8), mats.chrome);
          ret.rotation.x = Math.PI / 2;
          ret.position.set(side * innerW * 0.47, railY, bodyD / 2 - 0.06);
          g.add(ret);
        });
      }
    }

    const slide = decorBoxMesh(W * 0.94, 0.02, bodyD * 0.9, mats.chrome);
    slide.position.set(0, 0.01, 0);
    g.add(slide);

    [0.08, H - 0.08].forEach((y) => {
      const bracket = decorBoxMesh(0.03, 0.05, 0.012, mats.detail);
      bracket.position.set(-W / 2 + 0.02, y, bodyD / 2 + 0.006);
      g.add(bracket);
    });

    return g;
  }


  function buildDecorLavaSeca(W, H, D, mats) {
    const g = new T.Group();
    // Máquina de lavar e secar — aparelho independente com corpo próprio
    // (como fogão/lava-louças, NÃO é peça solta pra dentro de um
    // armário): corpo com cantos arredondados, porta redonda com visor de
    // vidro, painel de controle + knobs no topo, pés.
    const footH = Math.min(0.02, H * 0.03);
    const bodyH = H - footH;
    const body = decorRoundedBox(W, D, bodyH, 0.02, mats.main);
    body.position.set(0, footH, 0);
    g.add(body);

    decorAddFeet(g, W, D, mats.detail, footH);

    const panelY = footH + bodyH * 0.90;
    decorAddControlStrip(g, W * 0.6, bodyH * 0.10, 0.02, 0, panelY, D / 2, mats.detail, mats.display, 5);
    decorAddControlPanelKnobs(g, W * 0.5, panelY, D / 2, mats.chrome, 2);

    const doorR = Math.min(W, bodyH) * 0.30;
    const doorY = footH + bodyH * 0.42;
    const doorZ = D / 2;
    const rim = new T.Mesh(new T.TorusGeometry(doorR, doorR * 0.12, 10, 24), mats.chrome);
    rim.position.set(0, doorY, doorZ + 0.005);
    g.add(rim);
    const glass = new T.Mesh(new T.CylinderGeometry(doorR * 0.85, doorR * 0.85, 0.02, 24), mats.glass);
    glass.rotation.x = Math.PI / 2;
    glass.position.set(0, doorY, doorZ + 0.01);
    g.add(glass);
    const drumRing = new T.Mesh(new T.TorusGeometry(doorR * 0.7, doorR * 0.05, 8, 20), mats.detail);
    drumRing.position.set(0, doorY, doorZ + 0.012);
    g.add(drumRing);
    const handle = new T.Mesh(new T.CylinderGeometry(0.008, 0.008, doorR * 0.5, 10), mats.chrome);
    handle.rotation.z = Math.PI / 2;
    handle.position.set(doorR * 0.95, doorY, doorZ + 0.01);
    g.add(handle);

    return g;
  }

  const DECOR_BUILDERS = {
    decor_fogao: buildDecorFogao,
    decor_microondas: buildDecorMicroondas,
    decor_forno_torre_duplo: buildDecorFornoTorreDuplo,
    decor_lava_loucas: buildDecorLavaLoucas,
    decor_pia: buildDecorPia,
    decor_farm_pia: buildDecorFarmPia,
    decor_lixeira_dupla: buildDecorLixeiraDupla,
    decor_cooktop: buildDecorCooktop,
    decor_coifa: buildDecorCoifa,
    decor_spice_rack: buildDecorSpiceRack,
    decor_lava_seca: buildDecorLavaSeca,
  };

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
    } else if (role === 'free' && DECOR_BUILDERS[part.shape_type]) {
      // Itens de decoração com geometria própria (migration 141) — cópia
      // fiel do dispatch por shape_type em js/viewer3d.js (ver comentário
      // lá), pra não sair diferente na foto realista.
      const decorContent = DECOR_BUILDERS[part.shape_type](w, h, d, resolveDecorMaterials(part.color));
      emitInto(parentGroup, decorContent, null, -W / 2 + w / 2 + offX, offY + legH, -D / 2 + d / 2 + offZ, false);
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
