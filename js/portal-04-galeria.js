// portal-04-galeria.js — parte 4/9 de js/portal.js (ver portal-01-core-catalogo.js).
// Aba "Galeria": geração de imagem por IA a partir de uma Composição,
// publicação, listagem/filtro/curtidas, compartilhar, edição admin de post.

// "Ambiente" da Galeria (migration 049) — pedido do usuário: "esses
// ambientes devem ser os mesmo dos modulos, copia a taxonomia das
// categorias". Antes era uma lista fixa inventada (cozinha/quarto/sala/...);
// agora usa a MESMA taxonomia de família já usada em todo o catálogo
// (familiesCacheList, carregada uma vez em showLoggedIn via
// loadTaxonomyFilters() — reaproveitada aqui, sem query nova).
function populateGalleryFamilySelect(selectEl, includeAllOption) {
  if (!selectEl) return;
  const current = selectEl.value;
  selectEl.innerHTML = '';
  if (includeAllOption) {
    const optAll = document.createElement('option');
    optAll.value = '';
    optAll.textContent = I18n.t('gallery.room_type_all');
    selectEl.appendChild(optAll);
  }
  familiesCacheList.forEach((fam) => {
    const opt = document.createElement('option');
    opt.value = fam.id;
    opt.textContent = fam.name;
    selectEl.appendChild(opt);
  });
  if (current) selectEl.value = current;
}

function galleryFamilyName(familyId) {
  const fam = familiesCacheList.find((f) => f.id === familyId);
  return fam ? fam.name : null;
}

// Gemini só aceita um conjunto FIXO de proporções de saída (generationConfig.
// imageConfig.aspectRatio) — sem mandar nada, ele tende a sair em 3:4/1:1 por
// padrão, o que espreme/corta o enquadramento tipicamente bem largo de uma
// composição (pedido do usuário: "ainda ficou com esse formato" — o preview
// veio em pé, com faixa branca dos lados). nearestSupportedAspectRatio mapeia
// uma proporção qualquer pro valor suportado mais próximo (distância em
// escala log — compara proporções, não diferenças absolutas). Quem chama
// hoje é currentGalleryAspectRatio (mais abaixo) — a partir da proporção
// REAL do recorte trimado (getImageAspectRatio), não mais do canvas/
// container (#po-comp-3d-canvas tem altura FIXA de 420px em CSS, não
// reflete o desenho em si).
const GEMINI_SUPPORTED_ASPECT_RATIOS = [
  { label: '21:9', value: 21 / 9 },
  { label: '16:9', value: 16 / 9 },
  { label: '5:4', value: 5 / 4 },
  { label: '4:3', value: 4 / 3 },
  { label: '3:2', value: 3 / 2 },
  { label: '1:1', value: 1 },
  { label: '4:5', value: 4 / 5 },
  { label: '3:4', value: 3 / 4 },
  { label: '2:3', value: 2 / 3 },
  { label: '9:16', value: 9 / 16 }
];
function nearestSupportedAspectRatio(ratio) {
  if (!ratio || !isFinite(ratio) || ratio <= 0) return null;
  let best = null;
  let bestDiff = Infinity;
  GEMINI_SUPPORTED_ASPECT_RATIOS.forEach((opt) => {
    const diff = Math.abs(Math.log(opt.value / ratio));
    if (diff < bestDiff) { bestDiff = diff; best = opt.label; }
  });
  return best;
}
// Valor numérico (largura/altura) de um rótulo tipo '16:9' — usado por
// padImageToAspectRatio pra saber quanto preencher, a partir do MESMO rótulo
// que currentGalleryAspectRatio já escolheu e que vai no aspectRatio da Edge
// Function (garante que a imagem preenchida e o parâmetro mandado ao Gemini
// sejam sempre exatamente a mesma proporção).
function aspectRatioLabelToValue(label) {
  const found = GEMINI_SUPPORTED_ASPECT_RATIOS.find((opt) => opt.label === label);
  return found ? found.value : null;
}
// 2026-07-19 — pedido do usuário: "ela tenta encher de moveis que nao existe
// quando a tela e esticada lateralmente ... deve ser uma imagem quadrada pra
// evitar isso". Antes esta função mapeava a proporção do CANVAS (container
// #po-comp-3d-canvas, altura fixa 420px em CSS — reflete o tamanho do
// painel na TELA, não o desenho em si) pro valor suportado mais próximo —
// numa composição bem larga isso dava um frame muito largo, e o Gemini
// "inventava" móveis extras nas laterais pra preencher o espaço vazio.
// Fixar em 1:1 sempre resolveu esse caso, mas TROCOU o problema de lado:
// um painel/porta ESTREITO E ALTO (ex.: um módulo só, recortado bem justo
// pelo trim — ver trimTransparentPng, margem de só 1,5%) forçado num
// quadrado sobra MUITO espaço vazio dos lados, e a IA passou a preencher
// aquilo com nicho/cômoda/quarto inteiro, descentralizando o móvel
// original (relatado com print pelo usuário no mesmo dia).
//
// Usa a proporção REAL do recorte já trimado (trimmedImageRatio, calculada
// por getImageAspectRatio DEPOIS do trim — só ela reflete o desenho de
// verdade, o canvas não).
//
// 2026-07-31 — REMOVIDO o clamp entre 2:3 e 3:2 que existia aqui (pedido do
// usuário: "a IA sempre altera projeto quando a proporcao da imagem e
// diferente do padrao dela... isso nao pode acontecer"). O clamp forçava um
// móvel bem largo (ex.: um guarda-roupa de 5 módulos) a pedir uma proporção
// bem mais "quadrada" do que a real ao Gemini — só esse descompasso já
// bastava pra IA redimensionar o móvel pra caber no formato pedido. Agora
// que a imagem MANDADA é pré-preenchida (padImageToAspectRatio, chamado por
// quem usa este valor) pra bater EXATAMENTE a proporção escolhida aqui, não
// existe mais descompasso nenhum entre "imagem enviada" e "proporção
// pedida" — o clamp não é mais necessário pra evitar a alucinação de móvel
// extra (ver histórico logo acima) porque aquele problema também era
// causado pelo mesmo descompasso, só que no sentido contrário (tela vazia
// demais, não desenho espremido).
function currentGalleryAspectRatio(trimmedImageRatio) {
  if (!trimmedImageRatio || !isFinite(trimmedImageRatio) || trimmedImageRatio <= 0) return '1:1';
  return nearestSupportedAspectRatio(trimmedImageRatio) || '1:1';
}

// Cores usadas no conjunto inteiro (pra colors_used da galeria, filtro
// "Cor") — junta selectedColors de cada slot + os overrides por peça
// (migration 046), deduplicado por color_id (a mesma cor usada em papéis
// diferentes conta uma vez só).
function aggregateColorsUsedForComposition() {
  const byColorId = new Map();
  compositionSlots.forEach((slot) => {
    (slot.selectedColors || []).forEach((c) => { if (c.color_id) byColorId.set(c.color_id, c); });
    Object.values(slot.pieceColorOverrides || {}).forEach((perRole) => {
      Object.keys(perRole).forEach((roleId) => {
        const color = perRole[roleId];
        if (color && color.id && !byColorId.has(color.id)) {
          byColorId.set(color.id, { role_id: roleId, role_name: null, color_id: color.id, color_name: color.name });
        }
      });
    });
  });
  return [...byColorId.values()];
}

// Igual a aggregateColorsUsedForComposition, mas agrupado POR MÓDULO — só
// pra montar o prompt da IA (buildColorDescriptionForComposition), NÃO usado
// pro colors_used salvo no banco (esse continua achatado, o filtro de cor da
// galeria depende do formato flat com .color_id). Motivo: o cliente relatou
// (2026-07-19) que a IA errou a cor do criado-mudo numa composição
// cabeceira+criado-mudo — a lista antiga era um texto único misturando as
// cores de TODOS os módulos sem dizer qual peça usa qual, então a IA
// "adivinhava". Agora cada módulo vira seu próprio trecho no prompt.
function aggregateColorsUsedPerModuleForComposition() {
  const byModule = new Map(); // moduleName -> Map(colorId -> colorEntry)
  compositionSlots.forEach((slot) => {
    const moduleName = (slot.module && slot.module.name) || '?';
    if (!byModule.has(moduleName)) byModule.set(moduleName, new Map());
    const colorMap = byModule.get(moduleName);
    (slot.selectedColors || []).forEach((c) => { if (c.color_id) colorMap.set(c.color_id, c); });
    Object.values(slot.pieceColorOverrides || {}).forEach((perRole) => {
      Object.keys(perRole).forEach((roleId) => {
        const color = perRole[roleId];
        if (color && color.id && !colorMap.has(color.id)) {
          colorMap.set(color.id, { role_id: roleId, role_name: null, color_id: color.id, color_name: color.name });
        }
      });
    });
  });
  return [...byModule.entries()].map(([moduleName, colorMap]) => ({ moduleName, colors: [...colorMap.values()] }));
}

// Estado da pré-visualização de IA (pedido do usuário: "quero gerar a
// imagem de ia antes de publicar") — preenchido por generateAiPreviewForGallery()
// quando o cliente clica "✨ Gerar imagem realista", ANTES de enviar pra
// Galeria de verdade. Resetado toda vez que o formulário reabre, pra nunca
// publicar sem querer a pré-visualização de uma composição/sessão anterior.
let galleryAiPreviewImage = null;
let galleryAiPreviewStatus = null; // 'ready' (IA de verdade) | 'failed' (caiu pro screenshot 3D) | null (ainda não gerou)

const galleryPublishToggleBtn = document.getElementById('po-gallery-publish-toggle-btn');
if (galleryPublishToggleBtn) {
  galleryPublishToggleBtn.addEventListener('click', () => {
    const form = document.getElementById('po-gallery-publish-form');
    if (!form) return;
    const isHidden = form.style.display === 'none';
    if (isHidden) {
      populateGalleryFamilySelect(document.getElementById('po-gallery-room-type'), false);
      galleryAiPreviewImage = null;
      galleryAiPreviewStatus = null;
      document.getElementById('po-gallery-ai-preview-wrap').style.display = 'none';
      const baseWrap = document.getElementById('po-gallery-base-preview-wrap');
      if (baseWrap) baseWrap.style.display = 'none';
    }
    form.style.display = isHidden ? 'block' : 'none';
  });
}

// Fetch genérico + conversão pra data URL (fetch + blob + FileReader) —
// usado só pra fotos de referência de MÓDULO (fetchReferencePhotosForComposition,
// logo abaixo). A cor NÃO manda mais imagem nenhuma pro Gemini (nem foto de
// referência, nem a textura antiga colors.texture_url) — pedido do usuário
// (2026-07-19): "acho que não precisa referência de cor, ela pode subir no
// próprio prompt pra ia gerar". Cor vira só TEXTO no prompt (nome + hex —
// ver buildColorDescriptionForComposition), mais simples de manter (não
// precisa fotografar/catalogar acabamento nenhum) e, segundo o usuário, já
// suficiente pra IA acertar o tom.
async function fetchUrlAsDataUrl(url) {
  if (!url) return null;
  try {
    const resp = await fetch(url);
    const blob = await resp.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    return null;
  }
}

// Descrição em TEXTO (não imagem) das cores usadas na composição — nome +
// hex aproximado (colors.swatch_hex) POR MÓDULO, ex.:
// "Cabeceira Estofada: Bege Linho (hex aproximado #C9B79C); Criado-mudo
// Suspenso: Verde Musgo (hex aproximado #4B5D45)". Enviada como colorLabel
// pro Gemini (ver supabase/functions/generate-gallery-render), que inclui
// isto direto no prompt de texto.
//
// Agrupado por módulo (aggregateColorsUsedPerModuleForComposition) desde
// 2026-07-19 — antes era uma lista única sem dizer qual peça usa qual cor, e
// o cliente relatou a IA aplicando a cor errada no criado-mudo de uma
// composição cabeceira+criado-mudo.
async function buildColorDescriptionForComposition() {
  const perModule = aggregateColorsUsedPerModuleForComposition();
  if (!perModule.length) return null;
  const allColorIds = [...new Set(perModule.flatMap((m) => m.colors.map((c) => c.color_id)).filter(Boolean))];
  const hexByColorId = new Map();
  if (allColorIds.length) {
    try {
      const { data } = await supabaseClient.from('colors').select('id, swatch_hex').in('id', allColorIds);
      (data || []).forEach((c) => { if (c.swatch_hex) hexByColorId.set(c.id, c.swatch_hex); });
    } catch (err) {
      // segue só com o nome, sem hex — nunca trava a geração por causa disso.
    }
  }
  const moduleLabels = perModule
    .map(({ moduleName, colors }) => {
      const names = [...new Set(colors
        .map((c) => {
          if (!c.color_name) return null;
          const hex = hexByColorId.get(c.color_id);
          return hex ? `${c.color_name} (hex aproximado ${hex})` : c.color_name;
        })
        .filter(Boolean))];
      return names.length ? `${moduleName}: ${names.join(', ')}` : null;
    })
    .filter(Boolean);
  return moduleLabels.length ? moduleLabels.join('; ') : null;
}

// Foto REAL do acabamento (colors.texture_url — já existe, usada hoje só no
// viewer 3D/admin, ver uploadTextureIfSelected em admin.js) enviada como
// IMAGEM pro Gemini, não só o hex em texto — pedido do usuário (2026-07-19):
// "nao ta subindo a cor certa, temos que enviar o arquivo da cor pra ser
// exato". Reverte a decisão anterior de só texto (ver comentário antigo em
// buildColorDescriptionForComposition, que ainda continua sendo enviado
// junto como reforço/fallback pras cores sem foto cadastrada).
// Reencodada em JPEG antes de mandar (ver toJpegDataUrl) — pedido do
// usuário (2026-07-19): "manda as cores em jpg pra uma melhor textura".
// Dedupe por color_id (não por módulo+cor) — se a MESMA cor for usada em
// dois módulos, manda a foto uma vez só, com o rótulo listando os dois.
const MAX_COLOR_REF_PHOTOS = 4;
async function buildColorReferencesForComposition() {
  const perModule = aggregateColorsUsedPerModuleForComposition();
  if (!perModule.length) return [];
  const colorIds = [...new Set(perModule.flatMap((m) => m.colors.map((c) => c.color_id)).filter(Boolean))];
  if (!colorIds.length) return [];
  const modulesByColorId = new Map();
  perModule.forEach(({ moduleName, colors }) => {
    colors.forEach((c) => {
      if (!c.color_id) return;
      if (!modulesByColorId.has(c.color_id)) modulesByColorId.set(c.color_id, new Set());
      modulesByColorId.get(c.color_id).add(moduleName);
    });
  });
  try {
    const { data } = await supabaseClient.from('colors').select('id, name, texture_url').in('id', colorIds);
    const withPhoto = (data || []).filter((c) => c.texture_url).slice(0, MAX_COLOR_REF_PHOTOS);
    const images = (await Promise.all(withPhoto.map(async (c) => {
      const rawDataUrl = await fetchUrlAsDataUrl(c.texture_url);
      if (!rawDataUrl) return null;
      const dataUrl = await toJpegDataUrl(rawDataUrl);
      const moduleNames = [...(modulesByColorId.get(c.id) || [])].join(', ');
      const label = moduleNames ? `${moduleNames}: ${c.name}` : c.name;
      return { label, dataUrl };
    }))).filter(Boolean);
    return images;
  } catch (err) {
    // Nunca trava a geração por causa disso — sem foto de cor cai pro texto
    // (buildColorDescriptionForComposition) mesmo.
    return [];
  }
}

// Ângulos EXTRAS do mesmo 3D (3/4 e lateral), só pra dar mais informação de
// GEOMETRIA pra IA — pedido do usuário (2026-07-19): "existe a possibilidade
// de levar um arquivo 3d pra geracao da imagem ser fiel ao projeto?". A API
// de geração (Gemini/OpenAI) não aceita arquivo 3D nenhum, só imagem 2D +
// texto — a alternativa foi mandar MAIS vistas 2D do mesmo 3D (ver
// ViewerComposition.snapshot({angle}) em viewer3d_composition.js), além da
// vista frontal principal (que continua sendo a ÚNICA que define o
// enquadramento da imagem final, ver buildGalleryPrompt no Edge Function —
// estas aqui são só referência extra, não mudam o ângulo de saída).
// Sequencial (não Promise.all) de propósito: snapshot() mexe na câmera
// COMPARTILHADA da cena, chamadas concorrentes se atropelariam.
async function captureCompositionAngleReferences() {
  if (typeof ViewerComposition === 'undefined' || !ViewerComposition.snapshot) return [];
  const angles = [
    { angle: 'three_quarter', label: 'vista 3/4 (referência de geometria)' },
    { angle: 'side', label: 'vista lateral (referência de geometria)' }
  ];
  const images = [];
  for (const { angle, label } of angles) {
    const raw = ViewerComposition.snapshot({ angle });
    if (!raw) continue;
    const trimmed = await trimTransparentPng(raw);
    if (trimmed) images.push({ label, dataUrl: trimmed });
  }
  return images;
}

// Banco de fotos de referência REAIS de MÓDULO (migration 050) — pedido do
// usuário (2026-07-19): "podemos criar um banco com cada referencia de
// modulo pra gerar a imagem mais fiel?" (a parte de referência de COR foi
// removida a pedido do próprio usuário logo em seguida — ver
// buildColorDescriptionForComposition acima).
//
// Antes escolhia só 1 foto no TOTAL, mesmo quando a composição tinha vários
// módulos diferentes (ex.: cabeceira + criado-mudo) — o segundo módulo
// nunca recebia referência nenhuma e a IA inventava o desenho dele do zero
// só a partir do print 3D (cliente relatou, 2026-07-19: "errou a cor do
// criado mudo e o desenho do criado mudo também"). Agora escolhe até 1 foto
// POR módulo distinto, até um teto de 3 módulos — mandar muitas fotos DO
// MESMO módulo de uma vez é que tende a confundir o Gemini (comentário
// antigo), mandar 1 de cada módulo diferente é justamente o que corrige
// peças sem referência nenhuma.
const MAX_MODULE_REF_PHOTOS = 3;
async function fetchReferencePhotosForComposition() {
  const moduleNameById = new Map();
  compositionSlots.forEach((s) => { if (s.module && s.module.id) moduleNameById.set(s.module.id, s.module.name); });
  const moduleIds = [...moduleNameById.keys()];
  if (!moduleIds.length) return { moduleRefImages: [] };
  try {
    const { data } = await supabaseClient.from('reference_photos').select('id, module_id, photo_url').in('module_id', moduleIds);
    const firstPhotoByModule = new Map();
    (data || []).forEach((p) => { if (!firstPhotoByModule.has(p.module_id)) firstPhotoByModule.set(p.module_id, p.photo_url); });
    const chosen = [...firstPhotoByModule.entries()].slice(0, MAX_MODULE_REF_PHOTOS);
    const moduleRefImages = (await Promise.all(chosen.map(async ([moduleId, photoUrl]) => {
      const dataUrl = await fetchUrlAsDataUrl(photoUrl);
      return dataUrl ? { moduleName: moduleNameById.get(moduleId) || null, dataUrl } : null;
    }))).filter(Boolean);
    return { moduleRefImages };
  } catch (err) {
    // Nunca trava a geração por causa disso — sem referência é o
    // comportamento de sempre (só print 3D + descrição em texto da cor).
    return { moduleRefImages: [] };
  }
}

// "✨ Gerar imagem realista" — pedido do usuário: "quero gerar a imagem de
// ia antes de publicar" (antes a geração só acontecia escondida dentro do
// envio final, o cliente nunca via o resultado antes de publicar de
// verdade). Tira o screenshot 3D + chama a Edge Function do Gemini (ver
// supabase/functions/generate-gallery-render), mostra o resultado na hora
// (preview <img>), e guarda em galleryAiPreviewImage/Status pra
// publishCompositionToGallery reaproveitar sem gerar de novo. Sempre mostra
// ALGUMA imagem no preview (a de IA se deu certo, senão o próprio screenshot
// 3D) — nunca deixa o botão "não fazer nada visível".
async function generateAiPreviewForGallery() {
  const btn = document.getElementById('po-gallery-generate-ai-btn');
  const previewWrap = document.getElementById('po-gallery-ai-preview-wrap');
  const previewImg = document.getElementById('po-gallery-ai-preview-img');
  const previewHint = document.getElementById('po-gallery-ai-preview-hint');
  const basePreviewWrap = document.getElementById('po-gallery-base-preview-wrap');
  const basePreviewImg = document.getElementById('po-gallery-base-preview-img');
  const errorEl = document.getElementById('po-gallery-publish-error');
  errorEl.style.display = 'none';
  if (!compositionSlots.length) {
    errorEl.textContent = I18n.t('fav.need_slots');
    errorEl.style.display = 'block';
    return;
  }
  btn.disabled = true;
  const originalLabel = btn.textContent;
  btn.textContent = I18n.t('gallery.generating_ai_status');
  // Troca pra versão "limpa" da cena (sem cotas, sem decoração, só linha de
  // piso/teto — ver renderCompositionForAiSnapshot) antes de tirar QUALQUER
  // print que vá pra IA. SEMPRE restaurada no finally, mesmo se a geração
  // falhar no meio — o cliente nunca deve ver a cena "limpa" persistir na
  // tela normal.
  const usedCleanScene = renderCompositionForAiSnapshot();
  try {
    // Print quase-frontal, não o ângulo 3/4 padrão de navegação (pedido do
    // usuário: "geralmente quero fotos mais frontais") — ver comentário de
    // ViewerComposition.snapshot(options.frontal) em viewer3d_composition.js.
    const rawSnapshot = (typeof ViewerComposition !== 'undefined' && ViewerComposition.snapshot) ? ViewerComposition.snapshot({ frontal: true }) : null;
    const trimmedSnapshot = rawSnapshot ? await trimTransparentPng(rawSnapshot) : null;
    if (!trimmedSnapshot) {
      errorEl.textContent = I18n.t('gallery.generate_ai_no_3d_error');
      errorEl.style.display = 'block';
      return;
    }
    // Ambiente já deve estar escolhido (select vem ANTES do botão no HTML,
    // ver portal.html) — manda o nome pra Edge Function montar um prompt de
    // decoração/ambientação específico dele (pedido do usuário, 2026-07-19:
    // "conforme o ambiente escolhido ja devemos colocar um prompt para
    // decoracao e ambientacao").
    const roomFamilyId = document.getElementById('po-gallery-room-type').value || null;
    const roomLabel = roomFamilyId ? galleryFamilyName(roomFamilyId) : null;
    const aspectRatio = currentGalleryAspectRatio(await getImageAspectRatio(trimmedSnapshot));
    // Preenche a imagem ANTES de mandar pro Gemini, pra ela já sair
    // exatamente na proporção pedida acima (nunca corta/estica o móvel) —
    // ver padImageToAspectRatio, corrige o "muda o projeto pra caber".
    const sourceImageForAi = (await padImageToAspectRatio(trimmedSnapshot, aspectRatioLabelToValue(aspectRatio))) || trimmedSnapshot;

    // Mostra a imagem BASE (exatamente o que vira imageDataUrl mandado pra
    // Edge Function) — pedido do usuário: "me manda a imagem que esta
    // usando de base pra gerar a ia", pra comparar com o resultado.
    if (basePreviewImg && basePreviewWrap) {
      basePreviewImg.src = sourceImageForAi;
      basePreviewWrap.style.display = 'block';
    }

    let imageDataUrl = sourceImageForAi;
    let renderStatus = 'failed';
    try {
      // Vistas extras (3/4 + lateral) do MESMO 3D, só pra geometria — ver
      // captureCompositionAngleReferences. Sequencial e ANTES do Promise.all
      // abaixo (mexe na câmera compartilhada, melhor não sobrepor com nada).
      const angleRefImages = await captureCompositionAngleReferences();
      // Banco de fotos de referência de MÓDULO (migration 050) + foto REAL do
      // acabamento de cada cor (colors.texture_url) — cliente relatou
      // (2026-07-19) que a cor sem foto ("só texto") não saía exata, pediu
      // pra mandar o arquivo da cor mesmo (ver buildColorReferencesForComposition).
      // colorLabel (texto) continua indo junto como reforço/fallback.
      const [{ moduleRefImages }, colorLabel, colorRefImages] = await Promise.all([
        fetchReferencePhotosForComposition(),
        buildColorDescriptionForComposition(),
        buildColorReferencesForComposition()
      ]);
      const { data: renderData, error: renderError } = await supabaseClient.functions.invoke('generate-gallery-render', {
        body: { imageDataUrl: sourceImageForAi, moduleRefImages, colorLabel, colorRefImages, angleRefImages, roomLabel, aspectRatio }
      });
      if (!renderError && renderData && renderData.imageDataUrl) {
        imageDataUrl = renderData.imageDataUrl;
        renderStatus = 'ready';
      } else {
        // Não mostra o motivo real pro CLIENTE (mensagem genérica de
        // fallback já cobre isso), mas loga no console pra dar pra
        // diagnosticar (ver DevTools) — a function pode devolver o erro
        // exato no corpo (ver generate-gallery-render/index.ts) mesmo
        // quando supabase-js marca a resposta como "error" por causa do
        // status HTTP (400/500/502).
        console.error('generate-gallery-render falhou:', renderError, renderData);
        if (renderError && typeof renderError.context?.json === 'function') {
          renderError.context.json().then((body) => console.error('Corpo do erro:', body)).catch(() => {});
        }
      }
    } catch (aiErr) {
      // Function não publicada ainda, sem crédito, rede fora, etc. — segue
      // com o screenshot 3D mesmo (renderStatus fica 'failed').
      console.error('generate-gallery-render: erro ao chamar a function:', aiErr);
    }

    galleryAiPreviewImage = imageDataUrl;
    galleryAiPreviewStatus = renderStatus;
    previewImg.src = imageDataUrl;
    previewHint.textContent = renderStatus === 'ready'
      ? I18n.t('gallery.generate_ai_ready_hint')
      : I18n.t('gallery.generate_ai_fallback_hint');
    previewWrap.style.display = 'block';
  } finally {
    // Devolve a cena normal (cotas + decoração + linhas completas) — nunca
    // deixa o cliente vendo a versão "limpa" que só existiu pro print da IA.
    if (usedCleanScene) generateComposition3D();
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
}

const galleryGenerateAiBtn = document.getElementById('po-gallery-generate-ai-btn');
if (galleryGenerateAiBtn) galleryGenerateAiBtn.addEventListener('click', generateAiPreviewForGallery);

// Clique na prévia (antes de publicar) também abre em tela cheia, reaproveitando
// o mesmo lightbox dos cards já publicados (openGalleryLightbox, ver abaixo).
const galleryAiPreviewImgEl = document.getElementById('po-gallery-ai-preview-img');
if (galleryAiPreviewImgEl) {
  galleryAiPreviewImgEl.addEventListener('click', () => {
    if (galleryAiPreviewImgEl.src) openGalleryLightbox(galleryAiPreviewImgEl.src);
  });
}
// Mesma coisa pra imagem BASE (o print 3D enviado como imageDataUrl pra
// Edge Function, ver generateAiPreviewForGallery) — pedido do usuário:
// "me manda a imagem que esta usando de base pra gerar a ia".
const galleryBasePreviewImgEl = document.getElementById('po-gallery-base-preview-img');
if (galleryBasePreviewImgEl) {
  galleryBasePreviewImgEl.addEventListener('click', () => {
    if (galleryBasePreviewImgEl.src) openGalleryLightbox(galleryBasePreviewImgEl.src);
  });
}

async function publishCompositionToGallery() {
  const errorEl = document.getElementById('po-gallery-publish-error');
  const statusEl = document.getElementById('po-gallery-publish-status');
  errorEl.style.display = 'none';
  statusEl.textContent = '';
  if (!currentUser) {
    errorEl.textContent = I18n.t('fav.need_login');
    errorEl.style.display = 'block';
    return;
  }
  if (!compositionSlots.length) {
    errorEl.textContent = I18n.t('fav.need_slots');
    errorEl.style.display = 'block';
    return;
  }
  const submitBtn = document.getElementById('po-gallery-publish-submit-btn');
  submitBtn.disabled = true;
  try {
    // Reaproveita a pré-visualização já gerada (botão "✨ Gerar imagem
    // realista", ver generateAiPreviewForGallery) — pedido do usuário:
    // "quero gerar a imagem de ia antes de publicar", não gerar de novo (e
    // pagar de novo) na hora de enviar. Se o cliente pulou essa etapa e
    // clicou direto em "Enviar pra Galeria", cai pro comportamento antigo:
    // gera na hora, com fallback pro screenshot 3D puro se a IA falhar —
    // nunca trava a publicação por causa disso.
    let imageDataUrl;
    let renderStatus;
    if (galleryAiPreviewImage) {
      imageDataUrl = galleryAiPreviewImage;
      renderStatus = galleryAiPreviewStatus;
    } else {
      // Mesma cena "limpa" (sem cotas/decoração, só piso+teto) usada em
      // generateAiPreviewForGallery — ver renderCompositionForAiSnapshot.
      // SEMPRE restaurada logo abaixo, antes de seguir pro resto da função.
      const usedCleanSceneFallback = renderCompositionForAiSnapshot();
      const rawSnapshot = (typeof ViewerComposition !== 'undefined' && ViewerComposition.snapshot) ? ViewerComposition.snapshot({ frontal: true }) : null;
      const trimmedSnapshot = rawSnapshot ? await trimTransparentPng(rawSnapshot) : null;
      imageDataUrl = trimmedSnapshot;
      renderStatus = trimmedSnapshot ? 'pending' : 'failed';
      if (trimmedSnapshot) {
        try {
          const fallbackFamilyId = document.getElementById('po-gallery-room-type').value || null;
          const fallbackRoomLabel = fallbackFamilyId ? galleryFamilyName(fallbackFamilyId) : null;
          const fallbackAspectRatio = currentGalleryAspectRatio(await getImageAspectRatio(trimmedSnapshot));
          // Mesma correção do preview: preenche pra bater exatamente a
          // proporção pedida ao Gemini antes de mandar (ver padImageToAspectRatio).
          const fallbackSourceImage = (await padImageToAspectRatio(trimmedSnapshot, aspectRatioLabelToValue(fallbackAspectRatio))) || trimmedSnapshot;
          imageDataUrl = fallbackSourceImage;
          const fallbackAngleRefImages = await captureCompositionAngleReferences();
          const [{ moduleRefImages }, fallbackColorLabel, fallbackColorRefImages] = await Promise.all([
            fetchReferencePhotosForComposition(),
            buildColorDescriptionForComposition(),
            buildColorReferencesForComposition()
          ]);
          const { data: renderData, error: renderError } = await supabaseClient.functions.invoke('generate-gallery-render', {
            body: { imageDataUrl: fallbackSourceImage, moduleRefImages, colorLabel: fallbackColorLabel, colorRefImages: fallbackColorRefImages, angleRefImages: fallbackAngleRefImages, roomLabel: fallbackRoomLabel, aspectRatio: fallbackAspectRatio }
          });
          if (!renderError && renderData && renderData.imageDataUrl) {
            imageDataUrl = renderData.imageDataUrl;
            renderStatus = 'ready';
          }
        } catch (aiErr) {
          // Function não publicada ainda, sem crédito, rede fora, etc. —
          // segue com o screenshot 3D mesmo (renderStatus continua 'pending').
        } finally {
          if (usedCleanSceneFallback) generateComposition3D();
        }
      } else if (usedCleanSceneFallback) {
        generateComposition3D();
      }
    }

    // Sobe a imagem pro Storage antes de gravar o post (ver
    // uploadGalleryImageToStorage acima) — se falhar por qualquer motivo
    // (bucket/migration 055 ainda não rodou, rede fora), cai pro base64
    // como antes em vez de travar a publicação.
    try {
      imageDataUrl = await uploadGalleryImageToStorage(imageDataUrl);
    } catch (uploadErr) {
      console.error('Falha ao subir imagem da Galeria pro Storage, mantendo base64:', uploadErr);
    }

    const totalsMm = computeCompositionTotalsMm();
    const priceSale = compositionSlots.reduce((sum, slot) => sum + Number((slot.result && slot.result.total) || 0), 0);
    const priceCost = compositionSlots.reduce((sum, slot) => sum + Number((slot.result && slot.result.cost_total) || 0), 0);
    const isAnonymous = !!document.getElementById('po-gallery-anonymous-chk').checked;
    // Ambiente = MESMA taxonomia de família dos módulos (migration 049) —
    // ver populateGalleryFamilySelect. Sem "outro" fixo: se o cliente não
    // escolher (ou não houver família cadastrada), fica null.
    const familyId = document.getElementById('po-gallery-room-type').value || null;

    const payload = {
      author_user_id: currentUser.id,
      // Sem tabela de perfil neste projeto (ver showLoggedIn) — usa o
      // e-mail da sessão como nome de exibição, igual ao chip do topo do
      // portal. is_anonymous decide só se a TELA mostra isso ou não; o
      // valor real fica sempre gravado (pedido do usuário: uso interno em
      // apresentações).
      author_display_name: currentUser.email || null,
      is_anonymous: isAnonymous,
      status: 'pending',
      render_status: renderStatus,
      ai_image_data_url: imageDataUrl,
      composition_name: loadedFavorite ? loadedFavorite.name : null,
      family_id: familyId,
      total_width_mm: totalsMm ? totalsMm.totalWidth : null,
      total_height_mm: totalsMm ? totalsMm.totalHeight : null,
      total_depth_mm: totalsMm ? totalsMm.totalDepth : null,
      price_sale: priceSale,
      price_cost: priceCost,
      colors_used: aggregateColorsUsedForComposition(),
      slots: serializeCompositionSlots()
    };
    const { error } = await supabaseClient.from('gallery_posts').insert(payload);
    if (error) throw error;
    statusEl.textContent = I18n.t('gallery.publish_success');
    document.getElementById('po-gallery-anonymous-chk').checked = false;
    galleryAiPreviewImage = null;
    galleryAiPreviewStatus = null;
    document.getElementById('po-gallery-ai-preview-wrap').style.display = 'none';
    const baseWrapAfterPublish = document.getElementById('po-gallery-base-preview-wrap');
    if (baseWrapAfterPublish) baseWrapAfterPublish.style.display = 'none';
    setTimeout(() => {
      statusEl.textContent = '';
      document.getElementById('po-gallery-publish-form').style.display = 'none';
    }, 4000);
  } catch (err) {
    errorEl.textContent = err.message || String(err);
    errorEl.style.display = 'block';
  } finally {
    submitBtn.disabled = false;
  }
}

const galleryPublishSubmitBtn = document.getElementById('po-gallery-publish-submit-btn');
if (galleryPublishSubmitBtn) galleryPublishSubmitBtn.addEventListener('click', publishCompositionToGallery);

// Converte um data: URL (base64) num Blob pra poder subir pro Storage —
// fetch() aceita data: URL como entrada (funciona em todo browser moderno),
// mais simples que decodificar base64 na mão com atob()/Uint8Array.
async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return res.blob();
}

// "⬇️ Baixar" / "↗️ Compartilhar" a imagem gerada (pedido do usuário,
// 2026-07-21) — direto na prévia, ANTES de publicar na Galeria (que exige
// login + moderação). imageDataUrl aqui é sempre a mesma base64 que já está
// em galleryAiPreviewImage/projectGalleryAiPreviewImage (nunca a URL do
// Storage — o upload só acontece na hora de publicar, ver
// uploadGalleryImageToStorage), então funciona mesmo sem ter publicado nada
// ainda.
function dataUrlFileExtension(dataUrl) {
  const match = /^data:image\/(\w+);/.exec(dataUrl || '');
  return match ? match[1].replace('jpeg', 'jpg') : 'png';
}

function downloadGeneratedImage(dataUrl, filenameBase) {
  if (!dataUrl) return;
  const ext = dataUrlFileExtension(dataUrl);
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `${filenameBase || I18n.t('gallery.download_filename_fallback')}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Web Share API (nível 2, com arquivo) — funciona nativamente em
// celular (abre o menu de compartilhar do sistema: WhatsApp, Instagram,
// etc.) e em boa parte dos desktops modernos. Sem suporte (ou usuário
// cancelou o share nativo, que dispara AbortError), cai pro download —
// nunca deixa o botão "sem fazer nada visível", mesma filosofia de
// generateAiPreviewForGallery (sempre mostra alguma imagem no preview).
async function shareGeneratedImage(dataUrl, filenameBase, statusEl) {
  if (!dataUrl) return;
  if (statusEl) statusEl.textContent = '';
  try {
    const blob = await dataUrlToBlob(dataUrl);
    const ext = dataUrlFileExtension(dataUrl);
    const file = new File([blob], `${filenameBase || I18n.t('gallery.download_filename_fallback')}.${ext}`, { type: blob.type || 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file] });
      return;
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return; // usuário cancelou o share nativo — não faz nada
  }
  downloadGeneratedImage(dataUrl, filenameBase);
  if (statusEl) statusEl.textContent = I18n.t('gallery.share_unsupported_hint');
}

const galleryAiDownloadBtn = document.getElementById('po-gallery-ai-download-btn');
if (galleryAiDownloadBtn) {
  galleryAiDownloadBtn.addEventListener('click', () => downloadGeneratedImage(galleryAiPreviewImage, I18n.t('gallery.ai_image_filename')));
}
const galleryAiShareBtn = document.getElementById('po-gallery-ai-share-btn');
if (galleryAiShareBtn) {
  galleryAiShareBtn.addEventListener('click', () => shareGeneratedImage(galleryAiPreviewImage, I18n.t('gallery.ai_image_filename'), document.getElementById('po-gallery-ai-preview-hint')));
}

// Migration 055 + pedido do usuário 2026-07-20 ("gallery muito lenta pra
// abrir"): a causa era a imagem inteira em base64 dentro da linha de
// gallery_posts — cada select trazia vários MB de texto do Postgres antes
// de mostrar qualquer coisa. Agora sobe o arquivo pro bucket
// "gallery-images" e devolve só a URL pública (poucos bytes) pra gravar em
// ai_image_data_url — MESMA coluna, só troca o conteúdo (data: URL -> URL
// https), então nada mais no app precisa mudar (os <img src="..."> value
// continuam funcionando iguais nos dois formatos).
// Se já vier uma URL http(s) (post já migrado, ou nada mudou nesta edição),
// devolve sem subir de novo. Duplicada em admin.js (não há bundle
// compartilhado entre portal.js/admin.js neste projeto, mesmo padrão já
// usado pra outros helpers pequenos como formatMoney).
async function uploadGalleryImageToStorage(imageDataUrl) {
  if (!imageDataUrl || !imageDataUrl.startsWith('data:')) return imageDataUrl;
  const blob = await dataUrlToBlob(imageDataUrl);
  const ext = (blob.type.split('/')[1] || 'png').split('+')[0]; // "image/svg+xml" -> "svg"
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabaseClient.storage.from('gallery-images').upload(path, blob, {
    contentType: blob.type || 'image/png',
    upsert: false
  });
  if (error) throw error;
  const { data } = supabaseClient.storage.from('gallery-images').getPublicUrl(path);
  return data.publicUrl;
}

// ---------- GALERIA — grade pública, filtros, curtidas, "usar esta composição" ----------

let galleryPostsCache = [];
let galleryLikedPostIds = new Set();
// Paginação (2026-07-19) — a consulta original buscava TODAS as composições
// aprovadas de uma vez, sem LIMIT, incluindo colunas grandes
// (ai_image_data_url em base64, slots jsonb) — passou a devolver "canceling
// statement due to statement timeout" do Postgres conforme a galeria
// cresceu (mais posts = mais bytes de imagem lidos numa consulta só). Agora
// carrega em páginas de GALLERY_PAGE_SIZE, mais rápido por vez e sem
// depender do tamanho total da galeria.
// Reduzido de 24 pra 10 (2026-07-19, pedido do usuário: "ainda nao puxou,
// deixa so 10 talvez") — a página de 24 ainda estourava o statement_timeout,
// então cada consulta precisa ler menos bytes de imagem de uma vez.
const GALLERY_PAGE_SIZE = 10;
let galleryHasMore = false;

// Curtidas do usuário atual pra um conjunto de posts — extraído pra
// reaproveitar tanto na carga inicial (loadGalleryList) quanto ao "Carregar
// mais" (loadMoreGalleryPosts), que só precisa buscar curtidas dos posts
// NOVOS (os já carregados continuam em galleryLikedPostIds).
async function fetchGalleryLikedPostIds(postIds) {
  if (!currentUser || !postIds.length) return new Set();
  const { data } = await supabaseClient
    .from('gallery_post_likes')
    .select('gallery_post_id')
    .eq('user_id', currentUser.id)
    .in('gallery_post_id', postIds);
  return new Set((data || []).map((l) => l.gallery_post_id));
}

function updateGalleryLoadMoreBtn() {
  const btn = document.getElementById('po-gallery-load-more-btn');
  if (btn) btn.style.display = galleryHasMore ? 'inline-block' : 'none';
}

// No modo Dealer (migration 075), a Galeria vira PRIVADA — só os próprios
// posts do dealer, pra ele mostrar exclusivamente o portfólio dele pro
// cliente final (não a galeria pública com composições de outros clientes).
// gallery_posts já tem a policy "author reads own gallery_posts" (migration
// 048, RLS permite mesmo status pending/rejected pro dono) e a coluna
// author_user_id — o filtro é só isso aqui, sem mudança de RLS.
function applyGalleryDealerScopeToQuery(query) {
  if (portalViewMode === 'dealer' && currentUser) {
    return query.eq('author_user_id', currentUser.id);
  }
  return query.eq('status', 'approved');
}

async function loadGalleryList() {
  const errorEl = document.getElementById('po-gallery-error');
  errorEl.style.display = 'none';
  // Só as colunas SEGURAS pro cliente — preço de CUSTO e a identidade real
  // do autor de post anônimo nunca são pedidos aqui de propósito (RLS é por
  // LINHA, não por coluna — ver comentário da migration 048; a proteção de
  // verdade é nunca selecionar essas colunas nesta tela, mesmo raciocínio já
  // aceito no projeto pra margem/custo de order_items).
  const { data, error } = await applyGalleryDealerScopeToQuery(supabaseClient
    .from('gallery_posts')
    .select('id, ai_image_data_url, render_status, composition_name, family_id, source_type, wall_width_mm, total_width_mm, total_height_mm, total_depth_mm, price_sale, colors_used, slots, likes_count, is_anonymous, author_display_name, created_at'))
    .order('created_at', { ascending: false })
    .range(0, GALLERY_PAGE_SIZE - 1);
  if (error) { errorEl.textContent = error.message; errorEl.style.display = 'block'; return; }
  galleryPostsCache = data || [];
  galleryHasMore = galleryPostsCache.length === GALLERY_PAGE_SIZE;
  updateGalleryLoadMoreBtn();

  galleryLikedPostIds = await fetchGalleryLikedPostIds(galleryPostsCache.map((p) => p.id));

  populateGalleryFamilySelect(document.getElementById('po-gallery-filter-room'), true);
  populateGalleryColorFilter();
  applyGalleryFilters();
}

// "Carregar mais" — busca a PRÓXIMA página (range a partir do que já está em
// galleryPostsCache) e concatena, sem re-buscar o que já foi carregado.
async function loadMoreGalleryPosts() {
  const btn = document.getElementById('po-gallery-load-more-btn');
  const errorEl = document.getElementById('po-gallery-error');
  if (!galleryHasMore || (btn && btn.disabled)) return;
  if (btn) btn.disabled = true;
  errorEl.style.display = 'none';
  try {
    const from = galleryPostsCache.length;
    const { data, error } = await applyGalleryDealerScopeToQuery(supabaseClient
      .from('gallery_posts')
      .select('id, ai_image_data_url, render_status, composition_name, family_id, source_type, wall_width_mm, total_width_mm, total_height_mm, total_depth_mm, price_sale, colors_used, slots, likes_count, is_anonymous, author_display_name, created_at'))
      .order('created_at', { ascending: false })
      .range(from, from + GALLERY_PAGE_SIZE - 1);
    if (error) { errorEl.textContent = error.message; errorEl.style.display = 'block'; return; }
    const newPosts = data || [];
    galleryPostsCache = galleryPostsCache.concat(newPosts);
    galleryHasMore = newPosts.length === GALLERY_PAGE_SIZE;
    const newLikes = await fetchGalleryLikedPostIds(newPosts.map((p) => p.id));
    newLikes.forEach((id) => galleryLikedPostIds.add(id));
    populateGalleryColorFilter();
    applyGalleryFilters();
    updateGalleryLoadMoreBtn();
  } finally {
    if (btn) btn.disabled = false;
  }
}
const galleryLoadMoreBtn = document.getElementById('po-gallery-load-more-btn');
if (galleryLoadMoreBtn) galleryLoadMoreBtn.addEventListener('click', loadMoreGalleryPosts);

function populateGalleryColorFilter() {
  const sel = document.getElementById('po-gallery-filter-color');
  if (!sel) return;
  const current = sel.value;
  const byColorId = new Map();
  galleryPostsCache.forEach((post) => {
    (post.colors_used || []).forEach((c) => { if (c.color_id) byColorId.set(c.color_id, c.color_name); });
  });
  sel.innerHTML = '';
  const optAll = document.createElement('option');
  optAll.value = '';
  optAll.textContent = I18n.t('gallery.filter_color_all');
  sel.appendChild(optAll);
  [...byColorId.entries()].sort((a, b) => (a[1] || '').localeCompare(b[1] || '')).forEach(([colorId, colorName]) => {
    const opt = document.createElement('option');
    opt.value = colorId;
    opt.textContent = colorName || colorId;
    sel.appendChild(opt);
  });
  if (current) sel.value = current;
}

function applyGalleryFilters() {
  const room = document.getElementById('po-gallery-filter-room').value;
  const priceMin = parseFloat(document.getElementById('po-gallery-filter-price-min').value);
  const priceMax = parseFloat(document.getElementById('po-gallery-filter-price-max').value);
  const widthMin = parseFloat(document.getElementById('po-gallery-filter-width-min').value);
  const widthMax = parseFloat(document.getElementById('po-gallery-filter-width-max').value);
  const colorId = document.getElementById('po-gallery-filter-color').value;

  const filtered = galleryPostsCache.filter((post) => {
    if (room && post.family_id !== room) return false;
    if (!isNaN(priceMin) && Number(post.price_sale || 0) < priceMin) return false;
    if (!isNaN(priceMax) && Number(post.price_sale || 0) > priceMax) return false;
    if (!isNaN(widthMin) && Number(post.total_width_mm || 0) < widthMin) return false;
    if (!isNaN(widthMax) && Number(post.total_width_mm || 0) > widthMax) return false;
    if (colorId && !(post.colors_used || []).some((c) => c.color_id === colorId)) return false;
    return true;
  });
  renderGalleryGrid(filtered);
}

// Ícone de compartilhar em SVG (em vez de emoji "⤴") — pedido do usuário
// 2026-07-20: o emoji não renderizava de forma confiável (aparecia como
// círculo vazio em algumas fontes/SO). SVG com stroke="currentColor" segue
// a cor definida em .po-gallery-share-btn (preto), sem depender de fonte.
const GALLERY_SHARE_ICON_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="18" cy="5" r="3" stroke="currentColor" stroke-width="2"/>
  <circle cx="6" cy="12" r="3" stroke="currentColor" stroke-width="2"/>
  <circle cx="18" cy="19" r="3" stroke="currentColor" stroke-width="2"/>
  <line x1="8.6" y1="10.6" x2="15.4" y2="6.4" stroke="currentColor" stroke-width="2"/>
  <line x1="8.6" y1="13.4" x2="15.4" y2="17.6" stroke="currentColor" stroke-width="2"/>
</svg>`;

// Ícones de marca (pedido do usuário 2026-07-20: "usa icones de acordo com
// cada app, mais profissional" — trocou os emojis 📌📘💬✉️🔗 por SVG com a
// cor/forma reconhecível de cada rede, igual qualquer app de verdade faz.
const GALLERY_SHARE_ICONS = {
  pinterest: `<svg width="20" height="20" viewBox="0 0 24 24" style="vertical-align:middle;flex:none;"><circle cx="12" cy="12" r="12" fill="#E60023"/><path d="M12.02 5.5c-3.6 0-5.42 2.58-5.42 4.73 0 1.3.5 2.46 1.55 2.89.17.07.33 0 .38-.19l.16-.62c.05-.2.03-.27-.11-.44-.32-.38-.52-.87-.52-1.57 0-2.02 1.51-3.83 3.94-3.83 2.15 0 3.33 1.31 3.33 3.07 0 2.31-1.02 4.26-2.54 4.26-.84 0-1.46-.69-1.26-1.54.24-1.01.7-2.1.7-2.83 0-.65-.35-1.2-1.08-1.2-.86 0-1.54.89-1.54 2.08 0 .76.26 1.27.26 1.27s-.87 3.68-1.02 4.33c-.3 1.27-.05 2.83-.02 2.98.01.09.13.11.18.04.08-.1 1.05-1.3 1.38-2.5.09-.34.53-2.06.53-2.06.26.5 1.03.94 1.85.94 2.44 0 4.09-2.22 4.09-5.19 0-2.24-1.9-4.6-5-4.6z" fill="#fff"/></svg>`,
  facebook: `<svg width="20" height="20" viewBox="0 0 24 24" style="vertical-align:middle;flex:none;"><circle cx="12" cy="12" r="12" fill="#1877F2"/><path d="M13.5 12.5h2l.3-2.3h-2.3V8.7c0-.67.19-1.12 1.14-1.12h1.22V5.53C15.63 5.5 14.9 5.44 14.05 5.44c-1.79 0-3.02 1.09-3.02 3.1v1.66H9v2.3h2.03v6.06h2.47V12.5z" fill="#fff"/></svg>`,
  whatsapp: `<svg width="20" height="20" viewBox="0 0 24 24" style="vertical-align:middle;flex:none;"><circle cx="12" cy="12" r="12" fill="#25D366"/><path d="M12 5.5a6.5 6.5 0 00-5.6 9.79L5.5 18.5l3.32-.87A6.5 6.5 0 1012 5.5zm0 1.3a5.2 5.2 0 11-2.66 9.66l-.19-.11-1.98.52.53-1.93-.12-.2A5.2 5.2 0 0112 6.8zm-2.62 2.1c-.14 0-.36.05-.55.27-.19.21-.72.7-.72 1.72s.74 1.99.84 2.13c.1.14 1.45 2.28 3.6 3.1 1.79.68 2.15.55 2.54.51.39-.04 1.25-.51 1.43-1 .18-.49.18-.91.13-1-.05-.09-.19-.14-.4-.25-.21-.11-1.25-.62-1.44-.69-.19-.07-.34-.11-.48.11-.14.21-.55.69-.68.83-.13.14-.25.16-.46.05-.21-.11-.9-.33-1.71-1.06-.63-.56-1.06-1.26-1.18-1.47-.12-.21-.01-.32.09-.43.1-.1.21-.25.32-.37.11-.13.14-.21.21-.36.07-.14.04-.27-.02-.38-.05-.11-.48-1.19-.67-1.62-.17-.42-.35-.36-.48-.37h-.4z" fill="#fff"/></svg>`,
  email: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" style="vertical-align:middle;flex:none;"><rect x="2" y="5" width="20" height="14" rx="2" stroke="#5f6368" stroke-width="1.6"/><path d="M3 6.5l9 6.5 9-6.5" stroke="#5f6368" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  link: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" style="vertical-align:middle;flex:none;"><path d="M9.5 14.5l5-5M8 14a3 3 0 010-4.24l2-2A3 3 0 0114.24 8m-1.24 8a3 3 0 004.24 0l2-2a3 3 0 00-4.24-4.24" stroke="#5f6368" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`
};

function renderGalleryGrid(posts) {
  const grid = document.getElementById('po-gallery-grid');
  const emptyHint = document.getElementById('po-gallery-empty-hint');
  if (!grid) return;
  grid.innerHTML = '';
  emptyHint.style.display = posts.length ? 'none' : 'block';

  posts.forEach((post) => {
    const card = document.createElement('div');
    card.className = 'po-gallery-card';
    const authorLabel = post.is_anonymous ? I18n.t('gallery.anonymous_author') : (post.author_display_name || I18n.t('gallery.anonymous_author'));
    const dims = (post.total_width_mm && post.total_height_mm && post.total_depth_mm)
      ? `${Math.round(post.total_width_mm)} × ${Math.round(post.total_height_mm)} × ${Math.round(post.total_depth_mm)} mm`
      : '';
    const likeContent = galleryLikeButtonContent(post);
    card.innerHTML = `
      <div class="po-gallery-card-image-wrap">
        <button type="button" class="po-gallery-like-btn${likeContent.hasCount ? ' has-count' : ''}">${likeContent.html}</button>
        ${post.ai_image_data_url
          ? `<img src="${post.ai_image_data_url}" alt="" class="po-gallery-card-image" /><div class="po-gallery-card-image-zoom-hint">🔍</div>`
          : `<div class="po-gallery-card-image-empty"></div>`}
      </div>
      <div class="po-gallery-card-body">
        <div class="po-gallery-card-name"></div>
        <div class="po-gallery-card-meta hint">${galleryFamilyName(post.family_id) || ''}${dims ? ' · ' + dims : ''}</div>
        <div class="po-gallery-card-author hint"></div>
        ${galleryCardPriceHtml(post.price_sale)}
        <div class="po-gallery-card-actions">
          <button type="button" class="po-gallery-use-btn">${I18n.t('gallery.use_composition_btn')} →</button>
          <button type="button" class="po-gallery-share-btn" title="${I18n.t('gallery.share_btn_label')}" aria-label="${I18n.t('gallery.share_btn_label')}">${GALLERY_SHARE_ICON_SVG}</button>
        </div>
      </div>
    `;
    card.querySelector('.po-gallery-card-name').textContent = post.composition_name || I18n.t('gallery.untitled');
    card.querySelector('.po-gallery-card-author').textContent = I18n.t('gallery.posted_by', { name: authorLabel });
    card.querySelector('.po-gallery-like-btn').addEventListener('click', (ev) => toggleGalleryLike(post, ev.currentTarget));
    // Pedido do usuário 2026-07-20: Galeria pública pra visitante, mas
    // "Customizar" pede login na hora — abre o modal (guardando a
    // composição em pendingGalleryPostForAuth) em vez de tentar carregar
    // uma aba que nem existe pra quem não tem conta (Composição fica
    // escondida em modo visitante, ver guest-mode no CSS).
    card.querySelector('.po-gallery-use-btn').addEventListener('click', () => {
      if (!currentUser) { openAuthModal(post); return; }
      restoreGalleryPostBySourceType(post);
    });
    card.querySelector('.po-gallery-share-btn').addEventListener('click', (ev) => { ev.stopPropagation(); openGalleryShareMenu(post, ev.currentTarget); });
    const cardImg = card.querySelector('.po-gallery-card-image');
    if (cardImg) cardImg.addEventListener('click', () => openGalleryLightbox(post.ai_image_data_url));
    grid.appendChild(card);
  });
}

// Lightbox simples pra ver a imagem gerada em tamanho grande (pedido do
// usuário: "nao consigo dar zoom, bem ruim de ver assim"). Overlay único,
// criado uma vez e reaproveitado (lazy), object-fit:contain então nada é
// cortado — o card em si usa 'cover' só pra preencher bonito a miniatura.
function openGalleryLightbox(imageUrl) {
  if (!imageUrl) return;
  let overlay = document.getElementById('po-gallery-lightbox');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'po-gallery-lightbox';
    overlay.className = 'po-gallery-lightbox-overlay';
    overlay.innerHTML = `
      <button type="button" class="po-gallery-lightbox-close" aria-label="${I18n.t('ui.close')}">&times;</button>
      <img class="po-gallery-lightbox-img" alt="" />
    `;
    overlay.addEventListener('click', (ev) => {
      if (ev.target === overlay || ev.target.classList.contains('po-gallery-lightbox-close')) {
        overlay.style.display = 'none';
      }
    });
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') overlay.style.display = 'none';
    });
    document.body.appendChild(overlay);
  }
  overlay.querySelector('.po-gallery-lightbox-img').src = imageUrl;
  overlay.style.display = 'flex';
}

// Pedido do usuário 2026-07-20: coração vermelho "bonito" em vez do texto
// cru — só CONTORNO (♡) quando o post ainda não tem nenhuma curtida, e
// PREENCHIDO (♥) + número quando likes_count > 0 (sem número nenhum no
// estado de zero curtidas). Cor vem do CSS (.po-gallery-like-heart), o
// glifo em si (♡ vazado vs ♥ sólido) já dá a diferença de contorno/cheio.
// Usado tanto no render inicial (renderGalleryGrid) quanto depois de
// curtir/descurtir (toggleGalleryLike), pra nunca duas lógicas divergirem.
function galleryLikeButtonContent(post) {
  const count = Number(post.likes_count || 0);
  if (count > 0) {
    return { html: `<span class="po-gallery-like-heart">♥</span><span class="po-gallery-like-count">${count}</span>`, hasCount: true };
  }
  return { html: `<span class="po-gallery-like-heart">♡</span>`, hasCount: false };
}

async function toggleGalleryLike(post, btnEl) {
  if (!currentUser) {
    openAuthModal(post);
    return;
  }
  const alreadyLiked = galleryLikedPostIds.has(post.id);
  btnEl.disabled = true;
  try {
    if (alreadyLiked) {
      const { error } = await supabaseClient.from('gallery_post_likes').delete()
        .eq('gallery_post_id', post.id).eq('user_id', currentUser.id);
      if (error) throw error;
      galleryLikedPostIds.delete(post.id);
      post.likes_count = Math.max(Number(post.likes_count || 0) - 1, 0);
    } else {
      const { error } = await supabaseClient.from('gallery_post_likes').insert({
        gallery_post_id: post.id, user_id: currentUser.id
      });
      if (error) throw error;
      galleryLikedPostIds.add(post.id);
      post.likes_count = Number(post.likes_count || 0) + 1;
    }
    const content = galleryLikeButtonContent(post);
    btnEl.innerHTML = content.html;
    btnEl.classList.toggle('has-count', content.hasCount);
  } catch (err) {
    alert(err.message || String(err));
  } finally {
    btnEl.disabled = false;
  }
}

// "Usar esta composição" — carrega o snapshot do post na aba Composição, SEM
// amarrar a nenhum favorito existente (bindAsFavorite=false, ver
// restoreFavoriteComposition) — pedido do usuário: "pode abrir o ambiente e
// fazer suas alterações... o cliente nao sai do zero". id null é
// deliberado: não existe (nem poderia, RLS owner-only) nenhuma
// user_compositions correspondente a um post de outra pessoa.
function restoreGalleryPostAsComposition(post) {
  restoreFavoriteComposition({ id: null, name: post.composition_name || I18n.t('gallery.untitled'), slots: post.slots }, false);
}

// Botão "Compartilhar" no card (pedido do usuário 2026-07-20, na sequência
// perguntou sobre Pinterest — puxado pra dentro do mesmo menu). Link aponta
// pra portal.html?galleryPost=<id>, que reabre essa composição específica
// direto na aba Composição pra quem clicar (ver maybeOpenSharedGalleryPost
// mais abaixo). Pinterest/Facebook usam a URL real da imagem
// (post.ai_image_data_url) — só existe uma URL de verdade (em vez de
// base64) depois da migration 055; post antigo ainda não migrado continua
// compartilhando o link, só sem preview de imagem no cartão do Pinterest.
function buildGalleryShareUrl(post) {
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('galleryPost', post.id);
  return url.toString();
}

let galleryShareMenuEl = null;
let galleryShareMenuPost = null;

function closeGalleryShareMenu() {
  if (galleryShareMenuEl) galleryShareMenuEl.style.display = 'none';
}

function openGalleryShareMenu(post, anchorEl) {
  if (galleryShareMenuEl && galleryShareMenuPost === post && galleryShareMenuEl.style.display === 'flex') {
    closeGalleryShareMenu();
    return;
  }
  galleryShareMenuPost = post;
  if (!galleryShareMenuEl) {
    galleryShareMenuEl = document.createElement('div');
    galleryShareMenuEl.className = 'po-gallery-share-menu';
    document.body.appendChild(galleryShareMenuEl);
    document.addEventListener('click', (ev) => {
      if (galleryShareMenuEl.style.display === 'flex' && !galleryShareMenuEl.contains(ev.target) && !ev.target.closest('.po-gallery-share-btn')) {
        closeGalleryShareMenu();
      }
    });
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeGalleryShareMenu(); });
    window.addEventListener('resize', closeGalleryShareMenu);
  }

  const pageUrl = buildGalleryShareUrl(post);
  const imageUrl = (post.ai_image_data_url && post.ai_image_data_url.startsWith('http')) ? post.ai_image_data_url : '';
  const title = post.composition_name || I18n.t('gallery.untitled');
  const shareText = `${title} — ${I18n.t('gallery.price_label')} ${formatGalleryPrice(isSellerAccount() ? getDisplayPrice(post.price_sale) : post.price_sale)}`;
  const pinterestUrl = `https://www.pinterest.com/pin/create/button/?url=${encodeURIComponent(pageUrl)}${imageUrl ? `&media=${encodeURIComponent(imageUrl)}` : ''}&description=${encodeURIComponent(shareText)}`;
  const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}`;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText + ' ' + pageUrl)}`;
  const emailUrl = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(shareText + '\n' + pageUrl)}`;

  galleryShareMenuEl.innerHTML = `
    <a href="${pinterestUrl}" target="_blank" rel="noopener noreferrer" class="po-gallery-share-item">${GALLERY_SHARE_ICONS.pinterest} ${I18n.t('gallery.share_pinterest')}</a>
    <a href="${facebookUrl}" target="_blank" rel="noopener noreferrer" class="po-gallery-share-item">${GALLERY_SHARE_ICONS.facebook} ${I18n.t('gallery.share_facebook')}</a>
    <a href="${whatsappUrl}" target="_blank" rel="noopener noreferrer" class="po-gallery-share-item">${GALLERY_SHARE_ICONS.whatsapp} ${I18n.t('gallery.share_whatsapp')}</a>
    <a href="${emailUrl}" class="po-gallery-share-item">${GALLERY_SHARE_ICONS.email} ${I18n.t('gallery.share_email')}</a>
    <button type="button" class="po-gallery-share-item po-gallery-share-copy-btn">${GALLERY_SHARE_ICONS.link} ${I18n.t('gallery.share_copy_link')}</button>
  `;
  const copyBtn = galleryShareMenuEl.querySelector('.po-gallery-share-copy-btn');
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(pageUrl);
      copyBtn.textContent = I18n.t('gallery.share_copied');
      setTimeout(() => { if (galleryShareMenuPost === post) copyBtn.innerHTML = `${GALLERY_SHARE_ICONS.link} ${I18n.t('gallery.share_copy_link')}`; }, 2000);
    } catch (err) {
      copyBtn.textContent = pageUrl;
    }
  });

  galleryShareMenuEl.style.display = 'flex';
  const rect = anchorEl.getBoundingClientRect();
  const menuRect = galleryShareMenuEl.getBoundingClientRect();
  let left = rect.left + window.scrollX;
  if (left + menuRect.width > window.scrollX + document.documentElement.clientWidth - 8) {
    left = rect.right + window.scrollX - menuRect.width;
  }
  galleryShareMenuEl.style.top = `${rect.bottom + window.scrollY + 6}px`;
  galleryShareMenuEl.style.left = `${left}px`;
}

// Link compartilhado (?galleryPost=<id>) — abre direto na aba Composição já
// carregada com a composição daquele post, pra quem recebeu o link (via
// Pinterest/Facebook/WhatsApp/e-mail) ver e poder customizar na hora, sem
// precisar procurar na Galeria. Chamada depois de showLoggedIn (precisa de
// currentUser) tanto no init() quanto no submit do login — mesmo padrão de
// maybeLoadGalleryPostForAdminEdit. Só posts aprovados (RLS já bloquearia
// os outros de qualquer forma, mas o filtro aqui deixa explícito).
async function maybeOpenSharedGalleryPost() {
  const postId = new URLSearchParams(window.location.search).get('galleryPost');
  if (!postId || !currentUser) return;
  try {
    const { data: post, error } = await supabaseClient
      .from('gallery_posts')
      .select('id, composition_name, slots, source_type, wall_width_mm')
      .eq('id', postId)
      .eq('status', 'approved')
      .single();
    if (error || !post) return;
    // Troca de aba fica a cargo do restore certo (restoreFavoriteComposition
    // vai pra Composição, restoreFavoriteProject vai pra Projetos) — ver
    // restoreGalleryPostBySourceType.
    restoreGalleryPostBySourceType(post);
    // Tira o parâmetro da URL depois de abrir — um F5 acidental não deve
    // reabrir por cima de alterações que o cliente já tenha feito.
    const url = new URL(window.location.href);
    url.searchParams.delete('galleryPost');
    window.history.replaceState({}, '', url);
  } catch (err) {
    console.error('Erro ao abrir composição compartilhada:', err);
  }
}

function updateGalleryAdminEditBanner() {
  const banner = document.getElementById('po-comp-admin-edit-banner');
  if (banner) banner.style.display = editingGalleryPostId ? 'flex' : 'none';
}

// Entrada da edição admin — chamada uma vez no init() (ver fim do arquivo)
// quando a URL vem com ?editGalleryPost=<id> (link "Editar" da lista de
// moderação em admin.html). Confere is_admin() de VERDADE no servidor (RPC,
// ver migration_018_admin_allowlist.sql) antes de carregar qualquer coisa —
// um cliente comum que descobrisse o parâmetro na URL não consegue nada além
// do que a RLS "admin manage gallery_posts" já bloqueia, mas a checagem aqui
// evita mostrar a tela de edição pra quem não é admin.
async function maybeLoadGalleryPostForAdminEdit() {
  const postId = new URLSearchParams(window.location.search).get('editGalleryPost');
  if (!postId || !currentUser) return;
  try {
    const { data: isAdmin, error: adminErr } = await supabaseClient.rpc('is_admin');
    if (adminErr || !isAdmin) {
      alert(I18n.t('gallery.admin_edit_not_allowed'));
      return;
    }
    // select('*') aqui é intencional (diferente de loadGalleryList, que só
    // pega colunas seguras pro cliente comum) — quem chegou até aqui já
    // passou pelo is_admin() acima, e RLS "admin manage gallery_posts" já
    // libera tudo pra admin de qualquer forma.
    const { data: post, error } = await supabaseClient.from('gallery_posts').select('*').eq('id', postId).single();
    if (error || !post) {
      alert(I18n.t('gallery.admin_edit_load_error'));
      return;
    }
    await restoreFavoriteComposition({ id: null, name: post.composition_name || I18n.t('gallery.untitled'), slots: post.slots }, false);
    editingGalleryPostId = post.id;
    editingGalleryPostName = post.composition_name || null;
    updateGalleryAdminEditBanner();
  } catch (err) {
    console.error('Erro ao carregar post da galeria pra edição admin:', err);
  }
}

// "Salvar alterações na Galeria" — atualiza DIRETO o post existente (não
// cria um novo, diferente de publishCompositionToGallery). Só mexe nos
// campos derivados da composição em si (slots/cores/medidas/preço); status
// de moderação, autoria e anonimato do post NÃO são tocados aqui — a
// moderação continua só pela lista do admin.html. Se o admin também gerou
// uma prévia de IA nova nesta sessão (mesmo botão "✨ Gerar imagem com IA" de
// sempre, ver generateAiPreviewForGallery), a imagem publicada é atualizada
// junto — senão a imagem/render_status que já existiam continuam.
async function saveGalleryPostAdminEdit() {
  if (!editingGalleryPostId) return;
  const btn = document.getElementById('po-comp-admin-save-gallery-btn');
  const statusEl = document.getElementById('po-comp-admin-edit-status');
  if (!compositionSlots.length) {
    if (statusEl) {
      statusEl.textContent = I18n.t('fav.need_slots');
      statusEl.style.display = 'block';
    }
    return;
  }
  if (btn) btn.disabled = true;
  if (statusEl) { statusEl.textContent = ''; statusEl.style.display = 'none'; }
  try {
    const totalsMm = computeCompositionTotalsMm();
    const priceSale = compositionSlots.reduce((sum, slot) => sum + Number((slot.result && slot.result.total) || 0), 0);
    const priceCost = compositionSlots.reduce((sum, slot) => sum + Number((slot.result && slot.result.cost_total) || 0), 0);
    const payload = {
      composition_name: editingGalleryPostName,
      slots: serializeCompositionSlots(),
      colors_used: aggregateColorsUsedForComposition(),
      total_width_mm: totalsMm ? totalsMm.totalWidth : null,
      total_height_mm: totalsMm ? totalsMm.totalHeight : null,
      total_depth_mm: totalsMm ? totalsMm.totalDepth : null,
      price_sale: priceSale,
      price_cost: priceCost
    };
    if (galleryAiPreviewImage) {
      try {
        payload.ai_image_data_url = await uploadGalleryImageToStorage(galleryAiPreviewImage);
      } catch (uploadErr) {
        console.error('Falha ao subir imagem da Galeria pro Storage, mantendo base64:', uploadErr);
        payload.ai_image_data_url = galleryAiPreviewImage;
      }
      payload.render_status = galleryAiPreviewStatus;
    }
    const { error } = await supabaseClient.from('gallery_posts').update(payload).eq('id', editingGalleryPostId);
    if (error) throw error;
    if (statusEl) {
      statusEl.textContent = I18n.t('gallery.admin_save_success');
      statusEl.style.display = 'block';
      statusEl.classList.remove('error');
    }
    setTimeout(() => { if (statusEl) statusEl.style.display = 'none'; }, 5000);
  } catch (err) {
    if (statusEl) {
      statusEl.textContent = I18n.t('gallery.admin_save_error', { msg: err.message || String(err) });
      statusEl.style.display = 'block';
      statusEl.classList.add('error');
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}
const galleryAdminSaveBtn = document.getElementById('po-comp-admin-save-gallery-btn');
if (galleryAdminSaveBtn) galleryAdminSaveBtn.addEventListener('click', saveGalleryPostAdminEdit);

['po-gallery-filter-price-min', 'po-gallery-filter-price-max',
  'po-gallery-filter-width-min', 'po-gallery-filter-width-max'
].forEach((id) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', applyGalleryFilters);
});
['po-gallery-filter-room', 'po-gallery-filter-color'].forEach((id) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('change', applyGalleryFilters);
});
const galleryFilterClearBtn = document.getElementById('po-gallery-filter-clear-btn');
if (galleryFilterClearBtn) {
  galleryFilterClearBtn.addEventListener('click', () => {
    document.getElementById('po-gallery-filter-room').value = '';
    document.getElementById('po-gallery-filter-price-min').value = '';
    document.getElementById('po-gallery-filter-price-max').value = '';
    document.getElementById('po-gallery-filter-width-min').value = '';
    document.getElementById('po-gallery-filter-width-max').value = '';
    document.getElementById('po-gallery-filter-color').value = '';
    applyGalleryFilters();
  });
}

// ---------- PLANO DE CORTE (migration 051, 2026-07-19) ----------
// Aba exclusiva do perfil Contractor (user_profiles.role) — planilha
// digitada/importada de peças avulsas (não vem de módulo configurado).
// "Gerar Preço" calcula tudo (m² da cor + fita de borda + mão de obra por
// peça + margem especial do plano de corte) mas só mostra o TOTAL final —
// mesmo padrão de "cálculo interno nunca aparece pro cliente" já usado em
// order_items.breakdown. "Aprovar e Salvar" grava direto como pedido
// aprovado (order_type='cutting_list', status='approved') — não passa pelo
// ciclo rascunho/aberto dos pedidos de módulo, porque aqui aprovar e salvar
// são o mesmo botão/pedido do usuário.

let currentUserProfile = null; // { user_id, email, role } — null até ensureOwnUserProfile() rodar
let cutlistColorsCache = [];
let cutlistPricingSettings = { cutting_list_markup_multiplier: 1, cutting_list_thickness_38_multiplier: 1, cutting_list_labor_price_per_piece: 0 };
let cutlistRows = [];
let cutlistRowSeq = 1;
// Linhas marcadas pra troca em massa (pedido do usuário 2026-07-31: "quero um
// quadrado pra selecionar e fazer uma troca de todos selecionados") — guarda
// row._id, não índice (índice muda ao remover linha do meio).
let cutlistCheckedIds = new Set();
// id sentinela pro popup de cor quando aberto pela barra de aplicar-em-massa
// (nenhuma row._id real jamais bate com isso), reaproveitando o mesmo
// singleton cutlistColorPopupEl/cutlistColorPopupRowId de sempre.
const CUTLIST_BULK_COLOR_POPUP_ID = 'bulk';
let cutlistFinalPrice = null; // Number depois de "Gerar Preço"; null = precisa gerar de novo (linhas mudaram)
let cutlistInitialized = false;

// Tamanhos de chapa cadastrados no admin (migration 063) — usados pelo
// "Gerar Plano de Corte". Cor sem default_sheet_size_id obriga escolha
// manual (ver renderCutlistSheetPickerPanel).
let cutlistSheetSizesCache = [];
let cutlistPendingPlanGroups = null; // grupos aguardando escolha manual de tamanho (painel visível)

// Limites de medida da chapa (pedido do usuário 2026-07-19) — SEMPRE em mm
// (fonte da verdade), usados na validação de verdade antes de "Gerar Preço"
// (validateCutlistRows), no banco (migration 051b, CHECK em
// cutting_list_items) e no hint traduzido/unit-aware (ver
// updateCutlistUnitLabels — desde 2026-08-02 os campos de comprimento/
// largura viraram texto livre na unidade global, não dá mais pra usar
// min/max nativo de <input type="number">).
const CUTLIST_COMPRIMENTO_MIN = 76;
const CUTLIST_COMPRIMENTO_MAX = 2700;
const CUTLIST_LARGURA_MIN = 76;
const CUTLIST_LARGURA_MAX = 1500;
