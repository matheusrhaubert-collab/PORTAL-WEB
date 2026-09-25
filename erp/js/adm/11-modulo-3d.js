/* Painel admin — Imagem 3D do módulo
 *
 * Pedaço 12/21 do antigo js/admin.js, que virou módulo quando o
 * ERP passou a ser a única porta de entrada. O corte seguiu os próprios
 * marcadores de assunto do arquivo, então nada mudou de vizinho.
 * A ordem de carregamento em erp/index.html importa: é a mesma de antes. */

// ---------- IMAGEM 3D DO MÓDULO ----------
//
// Gera uma miniatura de VERDADE (peças/cores reais deste módulo, na
// configuração PADRÃO — mesmo critério de quickAddModule em portal.js: 1ª
// cor cadastrada como caixa E porta, medida padrão, só os opcionais "vem
// marcado por padrão") pra substituir o ícone SVG genérico da vitrine do
// portal (ver drawModuleSvg em portal.js). Câmera SEMPRE no mesmo ângulo
// relativo — Viewer3D.update(..., refit:true) calcula a posição da câmera só
// a partir de L/A/P (ver update() em viewer3d.js), então qualquer orbit que
// o admin tenha feito antes de clicar é ignorado: essa é a "câmera
// fixa/padrão" pedida, sem precisar de nenhum código novo de câmera.
//
// loadRecursivePiecesForModule/fetchModuleFixedDepths/
// fetchModuleLockedDimensionPresets/fetchModuleOwnHingeAndSlideModels/
// resolvePiecesForViewer abaixo são cópias fiéis das mesmas funções de
// client.js/portal.js (mesma lógica de resolução recursiva de peças/medidas/
// deslocamento pro 3D) — só adaptadas pro padrão de erro do admin
// (showError(elId, err) em vez de um banner global).

// loadRecursivePiecesForModule MUDOU DE CASA (2026-08-15): a cópia que ficava
// aqui foi para js/module-pieces.js, que agora é a ÚNICA. Estava duplicada em
// quatro arquivos e um campo novo esquecido numa delas fazia a peça sair SEM
// FURO, em silêncio. Coluna nova de module_components entra lá, uma vez só.

// fetchModuleFixedDepths já existe mais abaixo neste arquivo (usada pela
// seção obsoleta "Profundidades fixas" — ver renderModuleFixedDepthsList) —
// mesma assinatura/comportamento (module_fixed_depths.depth_mm -> array de
// Number), reaproveitada aqui sem duplicar (function declaration é hoisted,
// funciona independente da ordem no arquivo).

// fetchModuleLockedDimensionPresets mudou de casa (2026-08-15): agora vive em js/module-pieces.js,
// que e a UNICA copia. Estava duplicada em 3 arquivos — campo novo
// esquecido numa delas some em silencio (peca sem furo).

// fetchModuleOwnHingeAndSlideModels mudou de casa (2026-08-15): agora vive em js/module-pieces.js,
// que e a UNICA copia. Estava duplicada em 3 arquivos — campo novo
// esquecido numa delas some em silencio (peca sem furo).

// Lista de cores cadastradas pro módulo, AGRUPADA POR PAPEL (migration 035
// — module_colors agora tem color_role_id, mesma tabela usada em "Cores
// disponíveis para este módulo", ver renderModuleColorLinks) — pra deixar o
// admin ESCOLHER qual cor usar por papel na imagem 3D, em vez de travar
// sempre na 1ª cor cadastrada (pedido do usuário). Devolve só os papéis que
// realmente têm alguma cor cadastrada pra este módulo.
async function fetchModuleColorsForImageList(moduleId) {
  const [{ data, error }, usedRoleIds] = await Promise.all([
    supabaseClient.from('module_colors').select('color_id, color_role_id, colors(*)').eq('module_id', moduleId),
    collectUsedColorRoleIdsForModule(moduleId)
  ]);
  if (error) { console.error(error); return []; }
  const byRole = new Map();
  (data || []).forEach((row) => {
    if (!row.colors || !row.colors.active) return;
    // Mesmo filtro da aba Cores (renderModuleColorLinks): só papel que
    // alguma peça deste módulo REALMENTE usa — sem isso, um vínculo
    // avulso em module_colors (ex: sobra de uma duplicação/"Marcar todas"
    // antiga) fazia "Cor — Painel" aparecer aqui pra um módulo sem
    // nenhuma peça de painel.
    if (!usedRoleIds.has(row.color_role_id)) return;
    if (!byRole.has(row.color_role_id)) byRole.set(row.color_role_id, []);
    byRole.get(row.color_role_id).push(row.colors);
  });
  const roleOrder = new Map(colorRolesCache.map((r, idx) => [r.id, idx]));
  return Array.from(byRole.entries())
    .map(([role_id, colors]) => ({
      role_id,
      role_name: (colorRolesCache.find((r) => r.id === role_id) || {}).name || 'Papel removido',
      colors: colors.slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    }))
    .sort((a, b) => (roleOrder.get(a.role_id) || 0) - (roleOrder.get(b.role_id) || 0));
}

let moduleImageColorsCache = []; // [{ role_id, role_name, colors: [...] }]
let moduleImageColorSelectEls = {}; // role_id -> <select> vivo (pra ler o valor escolhido na hora de gerar)

// Preenche um <select> por papel de cor que este módulo realmente tem cor
// cadastrada — preserva a seleção atual se ainda for válida, senão cai pra
// 1ª cor cadastrada daquele papel (mesmo default de antes, agora por papel).
function populateModuleImageColorSelects(rolesWithColors) {
  const container = document.getElementById('module-image-color-selects');
  const noColorsHint = document.getElementById('module-image-no-colors-hint');
  const btn = document.getElementById('generate-module-image-btn');

  const prevValues = {};
  Object.keys(moduleImageColorSelectEls).forEach((roleId) => { prevValues[roleId] = moduleImageColorSelectEls[roleId].value; });

  container.innerHTML = '';
  moduleImageColorSelectEls = {};
  rolesWithColors.forEach(({ role_id, role_name, colors }) => {
    const wrap = document.createElement('div');
    const label = document.createElement('label');
    label.textContent = `Cor — ${role_name}`;
    const sel = document.createElement('select');
    sel.innerHTML = colors.map((c) => `<option value="${c.id}">${c.name}</option>`).join('');
    if (colors.some((c) => c.id === prevValues[role_id])) sel.value = prevValues[role_id];
    wrap.appendChild(label);
    wrap.appendChild(sel);
    container.appendChild(wrap);
    moduleImageColorSelectEls[role_id] = sel;
  });

  const hasColors = rolesWithColors.length > 0;
  noColorsHint.style.display = hasColors ? 'none' : 'block';
  btn.disabled = !hasColors;
}

async function loadModuleImageColorOptions() {
  if (!selectedModuleId) return;
  moduleImageColorsCache = await fetchModuleColorsForImageList(selectedModuleId);
  populateModuleImageColorSelects(moduleImageColorsCache);
}

// resolvePiecesForViewer mudou de casa (2026-08-15): agora vive em js/module-pieces.js,
// que e a UNICA copia. Estava duplicada em 3 arquivos — campo novo
// esquecido numa delas some em silencio (peca sem furo).

let moduleImageViewerInitialized = false;

function renderModuleImageSection() {
  const module = modulesCache.find((m) => m.id === selectedModuleId);
  const preview = document.getElementById('module-image-preview');
  const emptyHint = document.getElementById('module-image-empty-hint');
  document.getElementById('module-image-status').textContent = '';
  if (module && module.thumbnail_data_url) {
    preview.src = module.thumbnail_data_url;
    preview.style.display = 'block';
    emptyHint.style.display = 'none';
  } else {
    preview.removeAttribute('src');
    preview.style.display = 'none';
    emptyHint.style.display = 'block';
  }
}

// Extraído de generateModuleImage (fazia tudo isto inline) pra reaproveitar
// também em generateModuleAiImage — ambos os botões partem do MESMO print
// 3D fresco (mesma cor escolhida, mesma projeção), só o que fazem com esse
// print depois é diferente (salvar direto vs. mandar pro Gemini primeiro).
//
// opts.contorno (2026-08-18, pedido do usuário: "deixa a linha da aresta
// mais grossa, pra melhor visualizacao dos detalhes") — troca o estilo de
// aresta SÓ PRA ESTE PRINT e devolve ao estilo anterior antes de sair
// (try/finally: mesmo se algo no meio quebrar, ex. textura que não carrega).
// Necessário porque estiloDesenho em viewer3d.js é global ao módulo (um
// Viewer3D só, comentário de setDrawStyle: "vale na PRÓXIMA montagem") — sem
// restaurar, gerar UMA imagem de vitrine deixaria o traço grosso vazando pro
// resto do painel até alguém trocar de novo.
//
// NÃO passar isto em generateModuleAiImage: o traço preto cheio ('grosso')
// foi exatamente o que confundia o Gemini em 2026-07-21 ("a IA entende que
// sao negativos, ou confunde ela") — ver o EDGE_COLOR/EDGE_OPACITY reduzidos
// em viewer3d.js. O botão de IA continua no estilo padrão ('fino'); só o
// "Gerar imagem 3D" puro (sem IA) ganha o traço grosso.
async function captureModuleViewerSnapshot(opts) {
  const module = modulesCache.find((m) => m.id === selectedModuleId);
  if (!module) throw new Error('Nenhum módulo selecionado.');

  // Cor escolhida pelo admin nos selects (um por papel, ver
  // populateModuleImageColorSelects) em vez de travar sempre na 1ª cor
  // cadastrada — pedido do usuário.
  const colorsByRole = {};
  Object.keys(moduleImageColorSelectEls).forEach((roleId) => {
    const sel = moduleImageColorSelectEls[roleId];
    const roleColors = (moduleImageColorsCache.find((r) => r.role_id === roleId) || {}).colors || [];
    colorsByRole[roleId] = roleColors.find((c) => c.id === sel.value) || roleColors[0];
  });
  if (Object.keys(colorsByRole).length === 0) throw new Error('Este módulo não tem nenhuma cor cadastrada — cadastre uma cor antes de gerar a imagem.');

  const pieces = await loadRecursivePiecesForModule(module.id);

  // Configuração PADRÃO (mesmo critério de quickAddModule em portal.js):
  // medida padrão, só opcionais marcados "vem marcado por padrão".
  const effectivePieces = pieces.filter((p) => !p.client_optional || p.client_optional_default_on);
  const shelfQuantities = {};
  pieces.filter((p) => p.quantity_configurable).forEach((p) => { shelfQuantities[p.id] = p.quantity_default; });

  const containerDims = { W: module.width_default_mm, H: module.height_default_mm, D: module.depth_default_mm };
  const parts = resolvePiecesForViewer(effectivePieces, containerDims, colorsByRole, shelfQuantities);

  // Perspectiva ou visão paralela (ortográfica) — escolha do admin (radio
  // buttons ao lado do botão "Gerar imagem 3D"). setProjectionMode troca a
  // câmera ANTES do init() se ainda não inicializado (só guarda o modo,
  // ver viewer3d.js) — por isso vem antes do Viewer3D.init() abaixo.
  const projectionEl = document.querySelector('input[name="module-image-projection"]:checked');
  Viewer3D.setProjectionMode(projectionEl ? projectionEl.value : 'perspective');

  if (!moduleImageViewerInitialized) {
    Viewer3D.init('module-image-viewer3d-canvas');
    moduleImageViewerInitialized = true;
  }

  const estiloAnterior = opts && opts.contorno ? Viewer3D.getDrawStyle() : null;
  try {
    if (opts && opts.contorno) Viewer3D.setDrawStyle({ contorno: opts.contorno });

    // refit:true -- câmera SEMPRE no mesmo ângulo relativo (calculado só a
    // partir de L/A/P em update(), viewer3d.js), ignorando qualquer orbit
    // anterior -- é isso que garante a "câmera fixa/padrão" pedida, igual
    // pra todo módulo. tightFrame:true -- pedido do usuário: margem mínima
    // garantida (sem cortar o módulo), bem mais justa que a margem padrão do
    // configurador do cliente (que não muda em nada com isso).
    Viewer3D.update({
      width_mm: module.width_default_mm,
      height_mm: module.height_default_mm,
      depth_mm: module.depth_default_mm,
      parts,
      refit: true,
      tightFrame: true
    });
    // Espera texturas (se houver) terminarem de carregar antes de capturar —
    // sem isso a miniatura podia sair com o fallback cinza (ver
    // makeMaterial) só porque o PNG ainda não tinha decodificado no instante
    // do render síncrono do snapshot().
    await Viewer3D.waitForPendingTextures();
    const dataUrl = Viewer3D.snapshot();
    if (!dataUrl) throw new Error('Não foi possível gerar a imagem (3D indisponível neste navegador).');

    return { dataUrl, colorsByRole, module };
  } finally {
    if (estiloAnterior) Viewer3D.setDrawStyle(estiloAnterior);
  }
}

async function generateModuleImage() {
  clearError('module-image-error');
  if (!selectedModuleId) return;

  const statusEl = document.getElementById('module-image-status');
  const btn = document.getElementById('generate-module-image-btn');
  btn.disabled = true;
  statusEl.textContent = 'Gerando...';

  try {
    // 'grosso' só aqui — ver o comentário grande em captureModuleViewerSnapshot
    // sobre por que o botão de IA (generateModuleAiImage) NÃO usa isto.
    const { dataUrl, module } = await captureModuleViewerSnapshot({ contorno: 'grosso' });

    const { error } = await supabaseClient.from('modules').update({ thumbnail_data_url: dataUrl }).eq('id', module.id);
    if (error) throw error;

    module.thumbnail_data_url = dataUrl;
    renderModuleImageSection();
    statusEl.textContent = 'Imagem gerada e salva — já aparece na vitrine do portal.';
  } catch (err) {
    showError('module-image-error', err);
    statusEl.textContent = '';
  } finally {
    // Só reabilita se ainda houver cor cadastrada — populateModuleImageColorSelects
    // já desabilita o botão quando a lista está vazia, não força reabilitar aqui.
    btn.disabled = moduleImageColorsCache.length === 0;
  }
}

document.getElementById('generate-module-image-btn').addEventListener('click', generateModuleImage);

// Faz upload de uma data URL (base64) pro bucket 'textures' — mesmo bucket
// já usado por uploadTextureIfSelected (foto de cor) e uploadReferencePhotoFile
// (fotos de referência manuais), só que a partir de uma imagem já gerada em
// memória (vinda do Gemini) em vez de um <input type="file">.
async function uploadDataUrlToTextures(dataUrl, pathPrefix) {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/.exec(dataUrl);
  if (!match) throw new Error('Imagem inválida pra upload.');
  const mimeType = match[1];
  const base64 = match[2];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const ext = mimeType.split('/')[1] || 'png';
  const path = `${pathPrefix}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error: uploadError } = await supabaseClient.storage.from('textures').upload(path, new Blob([bytes], { type: mimeType }), {
    cacheControl: '3600',
    upsert: false
  });
  if (uploadError) throw new Error('Falha ao subir imagem: ' + uploadError.message);
  const { data } = supabaseClient.storage.from('textures').getPublicUrl(path);
  return data.publicUrl;
}

// Ícones de vitrine dos módulos ANINHADOS usados como peça deste módulo
// (module_components.child_module_id, 1 nível — não desce pra netos) —
// pedido do usuário (2026-07-19): "e se levar como referencia pra geracao
// da ia esses icones de cada modulo selecionado?". Cada módulo filho já
// tem seu próprio modules.thumbnail_data_url (foto de vitrine, gerada por
// IA ou upload manual) — mandar isso como referência ajuda a IA a manter o
// design/ferragem daquela peça consistente com o que já foi gerado pra ela,
// em vez de reinventar. Cap de MAX_NESTED_MODULE_REF_ICONS: nunca manda
// mais que isso (custo/tamanho do payload) — se o módulo tiver mais peças-
// módulo distintas que o cap, os excedentes ficam de fora (sort_order já
// vem da query, então prioriza os primeiros na lista de peças).
const MAX_NESTED_MODULE_REF_ICONS = 3;
async function fetchNestedModuleRefIconsForModule(moduleId) {
  const { data, error } = await supabaseClient
    .from('module_components')
    .select('child_module_id')
    .eq('module_id', moduleId)
    .not('child_module_id', 'is', null)
    .order('sort_order');
  if (error || !data) return [];
  const seen = new Set();
  const result = [];
  for (const row of data) {
    if (!row.child_module_id || seen.has(row.child_module_id)) continue;
    seen.add(row.child_module_id);
    const childModule = modulesCache.find((m) => m.id === row.child_module_id);
    if (childModule && childModule.thumbnail_data_url) {
      result.push({ moduleName: childModule.name, dataUrl: childModule.thumbnail_data_url });
      if (result.length >= MAX_NESTED_MODULE_REF_ICONS) break;
    }
  }
  return result;
}

// "✨ Gerar imagem de IA" — pedido do usuário (2026-07-19): "e se colocar um
// 'gerar imagem de ia' e deixar tudo mais bonito no site. e essa imagem ja
// leva como referencia quando for usada em uma composicao. pra ver os
// detalhes melhor de cada modulo." Fluxo: mesmo print 3D fresco de
// captureModuleViewerSnapshot() acima → OpenAI gpt-image-1 em mode:'catalog'
// (fundo branco, sem sombra, ver generate-gallery-render/index.ts) → vira a
// nova imagem de vitrine (modules.thumbnail_data_url) E é salva em
// reference_photos (migration 050) como foto de referência DESTE módulo —
// bootstrap automático do banco de referências, sem precisar fotografar o
// produto de verdade. Se a IA falhar por qualquer motivo, a imagem de
// vitrine atual NÃO é tocada (só o "Gerar imagem 3D" puro é 100% confiável,
// sem depender de IA).
async function generateModuleAiImage() {
  clearError('module-image-error');
  if (!selectedModuleId) return;

  const statusEl = document.getElementById('module-image-status');
  const btn = document.getElementById('generate-module-ai-image-btn');
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Gerando com IA...';
  statusEl.textContent = 'Gerando imagem de IA...';

  try {
    const { dataUrl: rawSnapshot, colorsByRole, module } = await captureModuleViewerSnapshot();

    // colorLabel: TEXTO, não imagem (mesmo mecanismo de
    // buildColorDescriptionForComposition em portal.js) — nome + hex
    // aproximado de cada cor escolhida, deduplicado.
    const colorLabel = [...new Set(Object.values(colorsByRole)
      .filter(Boolean)
      .map((c) => (c.swatch_hex ? `${c.name} (hex aproximado ${c.swatch_hex})` : c.name))
      .filter(Boolean))].join(', ') || null;

    const moduleRefImages = await fetchNestedModuleRefIconsForModule(module.id);

    const { data: renderData, error: renderError } = await supabaseClient.functions.invoke('generate-gallery-render', {
      body: { imageDataUrl: rawSnapshot, mode: 'catalog', colorLabel, moduleRefImages }
    });
    if (renderError || !renderData || !renderData.imageDataUrl) {
      console.error('generate-gallery-render (catalog) falhou:', renderError, renderData);
      if (renderError && typeof renderError.context?.json === 'function') {
        renderError.context.json().then((body) => console.error('Corpo do erro:', body)).catch(() => {});
      }
      throw new Error('Não foi possível gerar a imagem de IA agora (a imagem de vitrine não foi alterada). Veja o console/logs da function pra detalhes.');
    }
    const aiDataUrl = renderData.imageDataUrl;

    const { error: updateError } = await supabaseClient.from('modules').update({ thumbnail_data_url: aiDataUrl }).eq('id', module.id);
    if (updateError) throw updateError;
    module.thumbnail_data_url = aiDataUrl;
    renderModuleImageSection();

    // Bootstrap automático do banco de referências — best-effort: se isto
    // falhar, a imagem de vitrine já foi salva com sucesso acima, não trava
    // nem mostra erro pro admin por causa disso (é um bônus, não o objetivo
    // principal do botão).
    try {
      const AUTO_CAPTION = 'Gerado automaticamente (imagem de vitrine)';
      const photoUrl = await uploadDataUrlToTextures(aiDataUrl, 'reference-photos');
      // Substitui a referência AUTO-gerada anterior deste módulo (se houver)
      // em vez de acumular uma nova toda vez que o admin clica de novo —
      // referência cadastrada manualmente (caption diferente) nunca é tocada.
      await supabaseClient.from('reference_photos').delete().eq('module_id', module.id).eq('caption', AUTO_CAPTION);
      await supabaseClient.from('reference_photos').insert({ module_id: module.id, photo_url: photoUrl, caption: AUTO_CAPTION });
    } catch (refErr) {
      console.error('Falha ao salvar referência automática (não crítico):', refErr);
    }

    statusEl.textContent = 'Imagem de IA gerada e salva — já aparece na vitrine do portal e como referência do módulo.';
  } catch (err) {
    showError('module-image-error', err);
    statusEl.textContent = '';
  } finally {
    btn.disabled = moduleImageColorsCache.length === 0;
    btn.textContent = originalLabel;
  }
}

document.getElementById('generate-module-ai-image-btn').addEventListener('click', generateModuleAiImage);

// Muda pra aba "Configurar módulo" e já seleciona um módulo específico —
// atalho usado pelo botão "Ver módulo" numa peça-módulo aninhada (ver
// renderModuleNestedRow) pra navegar direto pra configuração do módulo
// filho, igual "Ver componente" já faz pra componentes de catálogo.
function goToModuleConfig(moduleId) {
  ADM.irPara('tab-module-config');
  const sel = document.getElementById('module-select');
  sel.value = moduleId;
  sel.dispatchEvent(new Event('change'));
}
