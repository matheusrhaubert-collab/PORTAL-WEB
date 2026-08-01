// Edge Function: generate-gallery-render
//
// Devolve uma imagem fotorrealista a partir de um screenshot 3D — mas usa
// DOIS provedores de IA diferentes dependendo do parâmetro `mode`:
//   - mode:'gallery' (padrão) — Gemini 2.5 Flash Image ("Nano Banana"),
//     chave em GEMINI_API_KEY. Cena de ambiente decorada, chamada pelo
//     portal via supabaseClient.functions.invoke(...) em
//     generateAiPreviewForGallery/publishCompositionToGallery (js/portal.js).
//     Gemini é ótimo aqui porque é um modelo de EDIÇÃO conservador — precisa
//     preservar a geometria exata (é uma cotação real de medidas).
//   - mode:'catalog' — OpenAI gpt-image-1, chave em OPENAI_API_KEY. Foto de
//     vitrine isolada (fundo branco, sem sombra), chamada pelo admin em
//     generateModuleAiImage (js/admin.js). Trocado de Gemini pra OpenAI em
//     2026-07-19 (pedido do usuário) depois de 4 tentativas de prompt/
//     parâmetro no Gemini que continuaram devolvendo quase o mesmo look de
//     render 3D cru — o próprio usuário comparou lado a lado com um
//     resultado do ChatGPT (visivelmente mais realista) e pediu pra usar
//     OpenAI só nesse modo. O resultado vira a imagem de vitrine do módulo
//     (modules.thumbnail_data_url) E é salvo em reference_photos
//     automaticamente (bootstrap do banco de referências sem precisar
//     fotografar o produto de verdade).
//
// Nenhuma chave é exposta no navegador — ambas ficam só no servidor
// (`supabase secrets set`).
//
// Cor vai como TEXTO (colorLabel — nome + hex aproximado) E também como
// IMAGEM real (colorRefImages — foto de colors.texture_url, reencodada em
// JPEG no cliente antes de mandar, ver toJpegDataUrl em portal.js — pedido
// do usuário: "manda as cores em jpg pra uma melhor textura"). Referência de
// MÓDULO (moduleRefImages/moduleRefDataUrl) também é imagem (foto real do
// produto, quando cadastrada em reference_photos — migration 050) — pode
// informar proporção, ferragem E material (ver parágrafo "IF an image
// labeled 'module reference'..." em buildGalleryPrompt, restaurado
// 2026-07-19 a pedido do usuário: essa foi a versão de prompt que deu o
// melhor resultado dentre todas testadas).
//
// modo 'catalog' TAMBÉM aceita moduleRefImages (plural) desde 2026-07-19 —
// pedido do usuário: "e se levar como referencia pra geracao da ia esses
// icones de cada modulo selecionado?" — quando o módulo sendo fotografado
// tem PEÇAS que são outros módulos (module_components.child_module_id,
// "módulo aninhado"), o admin.js manda o ÍCONE de vitrine já existente
// (modules.thumbnail_data_url) de cada um desses módulos filhos como
// referência extra, pra IA manter o design/ferragem daquelas peças
// consistente com o que já foi fotografado/gerado pra elas. Continua
// aceitando o campo legado singular moduleRefDataUrl (foto manual da
// reference_photos bank) — os dois são combinados numa lista só (ver
// Deno.serve mais abaixo), a OpenAI aceita até 16 imagens em image[].
//
// Deploy (rodar localmente, precisa do Supabase CLI + login/link do
// projeto — não pode ser feito por aqui):
//   supabase functions deploy generate-gallery-render
//   supabase secrets set GEMINI_API_KEY=sua_chave_aqui
//   supabase secrets set OPENAI_API_KEY=sua_chave_aqui   (só precisa se for usar o modo 'catalog')
//
// Se a chave do modo pedido não estiver configurada, esta function devolve
// um erro claro (500) — o front já trata isso e cai de volta pro screenshot
// 3D puro como imagem provisória, sem travar nada.

const GEMINI_MODEL = 'gemini-2.5-flash-image';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const OPENAI_IMAGE_MODEL = 'gpt-image-1';
const OPENAI_EDITS_ENDPOINT = 'https://api.openai.com/v1/images/edits';

// Valores aceitos por generationConfig.imageConfig.aspectRatio (API do
// Gemini 2.5 Flash Image) — allow-list pra nunca mandar pro Gemini um valor
// arbitrário vindo do cliente. portal.js já manda só um destes (ver
// nearestSupportedAspectRatio em portal.js), isto aqui é só a validação do
// lado do servidor. Só usado no modo 'gallery' (Gemini).
const SUPPORTED_ASPECT_RATIOS = new Set(['1:1', '3:2', '2:3', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9']);

// roomLabel vem do "Ambiente" escolhido no portal (mesma taxonomia de
// família dos módulos, ver populateGalleryFamilySelect/galleryFamilyName em
// portal.js — migration 049) — cada família cadastrada no admin (Cozinha,
// Quarto, Sala de Jantar etc.) vira um pedaço de prompt pedindo pra IA
// decorar a cena de forma condizente com aquele ambiente, mas sem NUNCA
// mexer no móvel em si (regra de geometria exata continua valendo, é só o
// CENÁRIO ao redor que pode ganhar contexto/decoração). Texto livre (não
// uma lista fixa de valores) — funciona pra qualquer nome de família que o
// admin cadastrar, sem precisar tocar neste arquivo de novo.
function buildRoomStagingFragment(roomLabel: string | null): string {
  if (!roomLabel) return '';
  // Pedido do usuário (2026-07-19): "o prompt deve diminuir o foco na
  // decoracao e focar mais no movel. 95% no movel e 5% na decoracao. serve
  // so pra referenciar o espaco." — seguido de "foco na fidelidade do
  // movel. ambiente nao importa tanto": o ambiente é só um indício MÍNIMO
  // de contexto, a prioridade #1 sobre tudo (inclusive sobre parecer um
  // "ambiente decorado convincente") é a FIDELIDADE do móvel — geometria,
  // material, cor, proporção exatamente como no render fonte. Se em algum
  // momento decor/ambiente e fidelidade do móvel entrarem em conflito
  // (espaço na composição, iluminação, o que for), a fidelidade do móvel
  // sempre vence.
  //
  // 2026-07-19 — reescrito pra "colocação limitada por zona" (item 9 da
  // fórmula de 5 partes que o usuário validou testando manualmente fora do
  // Claude: "decoração minimalista... apenas dentro dos nichos existentes.
  // Não adicione móveis extras... no primeiro plano"). Antes só dizia
  // "nas bordas/fundo, não centralizado" — agora nomeia explicitamente as
  // zonas permitidas (dentro dos nichos abertos OU bordas/fundo) e proíbe
  // objeto grande de cenário (cama, mesa de jantar, sofá) por nome, não só
  // por "não encher o ambiente".
  return `\nDecoration (zone-limited): you may add minimal decoration that hints "this is a ${roomLabel}" ONLY inside existing open niches/shelves of the furniture, or at the far edges/background of the frame — never in the foreground, never touching or overlapping the furniture, never centered, never large enough to look co-equal with the furniture in visual weight. Add at most 1-2 small, subtle, tasteful items appropriate for a ${roomLabel} (for example: a small rug or a single lamp if this is a living room, one nightstand-adjacent detail if this is a bedroom — adapt sensibly and minimally to whatever "${roomLabel}" implies). Do NOT add any large furniture piece to the scene (no bed, no full dining table + chairs, no sofa, no full kitchen countertop run) — this stays a product photo with a faint sense of place, not a room/lifestyle photo. Keep the visual weight of the photo roughly 95% on the furniture piece and only about 5% on the room/decor. Above all, prioritize FIDELITY of the furniture piece itself (its exact geometry, material, color and proportions from the source image) over making the room/decor look convincing or complete — if you have to choose, always sacrifice environment realism before sacrificing furniture accuracy. The furniture piece from the source image must remain the overwhelming, unmistakable visual focus of the photo and stay exactly where and how it is in the source image — added decor must be small enough and placed so it never overlaps, blocks, resizes, or crops it.`;
}

// A câmera do print PRINCIPAL (imageDataUrl) vem QUASE FRONTAL de propósito
// (ver ViewerComposition.snapshot({angle:'frontal'}) em
// viewer3d_composition.js, pedido do usuário: "geralmente quero fotos mais
// frontais") — é esse ângulo que a imagem final deve manter (ver
// angleRefCount no prompt abaixo: as vistas extras de 3/4 e lateral são só
// referência de geometria, nunca definem o enquadramento de saída).
//
// HISTÓRICO (não apagar — cada reescrita anterior foi decidida com o
// usuário comparando resultados lado a lado, não só opinião do Claude):
// 1) versão longa original em inglês; 2) reescrita curta em português;
// 3) versão "cheia de CRITICAL" — o usuário testou as três e voltou pra (1)
// dizendo que foi a melhor: "pode voltar exatamente pra primeira versao?".
// Daí a regra "NÃO empilhar blocos CRITICAL sem testar antes" ficou valendo
// pra qualquer ideia MINHA (Claude) de reforçar o prompt.
//
// 2026-07-19 — REESCRITO DE NOVO, mas por um motivo diferente das vezes
// anteriores: NÃO foi um palpite do Claude, foi uma fórmula de 5 partes que
// o PRÓPRIO USUÁRIO testou manualmente fora daqui (provavelmente direto no
// AI Studio) e confirmou "encontrei um prompt que está funcionando muito
// bem" (ver memória ai-render-and-gallery-plan, item 9, pra fórmula
// completa). A ordem virou a espinha dorsal: (1) comando de fidelidade
// geométrica "zero desvio" logo na primeira frase, (2) restrições em "não"
// repetidas por elemento específico do móvel (não por frase genérica),
// (3) tratamento explícito de linha de cota/dimensão (esconder no render
// mas manter a escala), (4) "substitua a textura" em vez de "melhore"/
// "enhance" pra cor/material, (5) decoração com colocação limitada por
// ZONA (dentro de nicho existente OU borda/fundo, nunca primeiro plano) —
// ver buildRoomStagingFragment acima, que já foi reescrita nesse padrão.
// Se uma comparação futura mostrar que essa versão saiu pior que a anterior
// (a "campeã" de 3 rodadas atrás), a regra de não empilhar CRITICAL sem
// testar continua valendo — comparar lado a lado antes de decidir.
//
// 2026-07-21 — BUG real reportado pelo usuário: uma cor "Cashemere" (acabamento
// LISO, sem veio de madeira) saiu com textura de madeira no render. Causa:
// os parágrafos de material/cor abaixo mandavam incondicionalmente
// "substitua o material CG plano por um veio de madeira fotorrealista" e
// "renderize como uma superfície de madeira/MDF fotografada, não um
// preenchimento de cor plana" — ou seja, assumiam madeira SEMPRE, mesmo
// quando o acabamento real é liso/sólido (laca, pintura, laminado sem veio).
// Reescrito pra condicionar ao acabamento REAL (texto colorLabel + foto de
// referência colorRefImages, quando existe): madeira ganha veio, liso
// continua liso, nunca inventa veio numa cor que devia ser plana. Não é um
// palpite especulativo de estilo (a regra de não empilhar CRITICAL sem
// testar continua valendo pra isso) — é a correção de uma instrução que
// estava OBJETIVAMENTE errada pra qualquer cor sólida do catálogo.
// 2026-07-31 — dois bugs novos relatados pelo usuário DEPOIS do fix de
// proporção/padding (ver padImageToAspectRatio em portal.js): (1) a IA
// "jogou fundo" (painel sólido) num compartimento que no 3D original é
// aberto atrás — adicionado o parágrafo "do not add a back panel", com uma
// heurística visual concreta (cor do fundo do compartimento == cor de fora
// do móvel = aberto) porque a primeira tentativa (só dizer "não feche o que
// tá aberto") não bastou, a IA continuou fechando; (2) a IA trocou módulos
// de lugar (ordem esquerda-pra-direita diferente do 3D de origem) — a
// instrução genérica "não mude a posição de nenhum elemento" já existia na
// primeira frase do prompt mas não foi suficiente pra composições com
// vários módulos lado a lado, então ganhou um parágrafo CRITICAL dedicado,
// pedindo explicitamente pra contar as seções da esquerda pra direita e
// reproduzir a mesma sequência. Ambos ainda não testados de novo depois
// desta reescrita — se continuar falhando, o próximo passo provavelmente
// não é mais prompt (pode ser um limite real do modelo pra composições
// complexas/muitos módulos), avisar o usuário disso se acontecer de novo.
function buildGalleryPrompt(roomLabel: string | null, colorLabel: string | null, moduleRefCount: number, colorRefCount: number, angleRefCount: number): string {
  return `Generate a photorealistic render that is geometrically IDENTICAL to the structure of the attached source image — treat the source image as a wireframe/blueprint that must be followed with zero deviation. Do not change the camera angle. Do not change the position of any element.

CRITICAL — never reorder, swap, or mirror the sections/modules: if the source image shows several distinct vertical sections side by side (each with its own combination of doors, open shelves, drawers, or a hanging rod), the output must show that EXACT SAME sequence of sections in the EXACT SAME left-to-right order. Count the sections in the source image left to right and reproduce each one, in that same position, with its own original internal layout unchanged — never swap which section has doors vs open shelves vs drawers, never move a section to a different spot in the row, never mirror the whole piece left-to-right.

Do not add any extra furniture piece that isn't already in the source image.
Do not change the shape of any panel, box, or compartment.
Do not extend, shrink, stretch, or reposition the carcass (the main body of the furniture).
Do not change the number of shelves, doors, drawers, or compartments.
Do not add legs, feet, or external supports that are not already visible in the source image.
Do not change the visible gap between the furniture and the ceiling/side walls — keep it exactly as shown in the source image.
The baseboard (rodapé) must stay ON TOP of / visible in front of the furniture, never hidden behind it, never resized.

CRITICAL — do not add a back panel that is not in the source image: some shelves, hanging/wardrobe compartments, or cubbies in the source image have NO back panel — they are open all the way through to whatever is behind the furniture. Use this rule to tell which compartments are open: in the source image, an OPEN compartment shows the SAME plain, flat background color/tone at the back of its interior as the background visible outside the furniture's own silhouette (the empty area around the piece) — NOT the furniture's own wood/color material. A CLOSED compartment (real back panel) instead shows the furniture's own material/color at the back of its interior, same as its sides. Look at each compartment individually and match this exactly: if its back area in the source is the plain outside-background tone, render it fully open in the final photo (a real view through to the room behind — the wall, floor, or blurred depth of the room — never a flat colored panel); if its back area in the source is the furniture's own material, keep it as a solid back panel with that same real-world finish. Do not default to giving every compartment a solid back "because it looks more finished" — some are deliberately open by design, and closing them off is exactly as wrong as resizing the piece.

CRITICAL — do not resize or rescale the furniture to fill the frame: the source image may already include plain solid-white margin/padding on some sides so its canvas matches the required output aspect ratio — this white margin is empty background, NOT part of the scene, and must NOT be treated as "empty space that needs to be filled by the furniture". Keep the furniture at its exact same size, scale and position within the frame as shown in the source image; only replace the white margin areas with a continuation of the room's floor/wall/ceiling (per the lighting/material instructions below), never by enlarging, stretching, zooming into, or repositioning the furniture itself to occupy more of the frame.

If the source image shows any dimension lines, measurement labels, axes, or a wireframe/grid overlay, hide all of that in the final photo — but keep the exact scale and proportions those lines represent.

Keep the camera framing and angle the SAME as the source image — it was deliberately set to a frontal, straight-on, eye-level product-photo angle. Do not reinterpret it as a 3/4 or angled perspective shot, even if that would look more "dynamic".

Render this as if photographed in a real home interior with natural room lighting coming from windows/lamps in the room — NOT from the furniture itself. Replace the flat, uniform CG-looking material of the furniture with a photorealistic version of its ACTUAL real-world finish — do not just "enhance" or add realism on top of it, actually substitute the flat CG material for a real, photographed-looking one. Follow what the real finish actually is: if it is a wood/wood-look material, give it authentic natural grain variation and a real matte or satin sheen; if it is a smooth solid color (lacquer, paint, or a solid-color laminate with no visible wood grain), keep it perfectly smooth and uniform — do NOT invent wood grain, streaks, knots, or any wood-like pattern on a surface that is actually a flat, uniform color. Never assume wood grain by default; only add it if the real finish described/shown below actually has it.
${colorLabel ? `\nCRITICAL — color accuracy (this is equally important): reproduce the furniture's real "${colorLabel}" finish exactly as it actually looks — same hue and tone family as described, AND the same real surface pattern (smooth/solid stays smooth and solid with NO invented wood grain; a genuine wood-grain finish gets authentic photographed grain). Do NOT invent a different-looking material or tone than described, and do NOT let the room's ambient lighting shift the perceived color into a warmer or cooler family than described. If in doubt, prioritize matching this described color and its real surface pattern over making the lighting look natural.` : ''}
${colorRefCount > 0 ? `\nBelow there ${colorRefCount === 1 ? 'is 1 real swatch/finish photo' : `are ${colorRefCount} real swatch/finish photos`} of the actual finish(es) used — treat each as the definitive color AND surface-pattern reference (more reliable than the text description above): if a swatch photo shows a smooth solid color with no grain, the corresponding part of the furniture must come out smooth and solid too, never wood-grained.` : ''}
${angleRefCount > 0 ? `\nBelow there ${angleRefCount === 1 ? 'is also 1 extra image' : `are also ${angleRefCount} extra images`} showing this exact same furniture from other angles (3D) — these are only to help you understand the geometry/proportions better, they do NOT change the camera angle of the final output, which must stay exactly like the main source image described above.` : ''}
${buildRoomStagingFragment(roomLabel)}

CRITICAL — NO built-in/LED lighting (this is a strict rule, not a style suggestion): this furniture piece has NO integrated LED strips, no backlighting, no glowing shelves, no under-cabinet lighting, and no light fixtures built into it — none of that was specified for this piece, so none of it may appear. Do NOT add any warm glow, light strip, or illuminated edge inside, under, above, or behind any shelf, panel, or compartment of the furniture — the interior of open shelves/compartments must be lit only by the same ambient room light as everything else, with ordinary shadow falloff, not an artificial glow. If the source image shows no light source on the furniture, the output must show none either, even if it would look more "premium" or "modern" with it.

IF an image labeled 'module reference' is provided below, it is a real photograph of the actual physical module (or one very close to it) — use it to correct any technical inaccuracy in the 3D render: match the real proportions, panel/edge-banding details, and hardware (handles, legs, hinges, feet) shown in that photo as closely as possible. The exact DIMENSIONS and layout still come from the main source render (never resize/reposition based on the reference photo), but visual/material details (grain direction, sheen, hardware shape/finish) should follow the real reference photo over any generic assumption.

The final result should look like a real, professionally photographed piece of furniture in a tasteful, softly lit room.`;
}

// Modo 'catalog' — agora na OpenAI (ver comentário do topo do arquivo pro
// histórico completo de por que trocou de provedor). Prompt único de texto
// (a API de edição da OpenAI não usa o formato "texto + partes rotuladas"
// do Gemini — as imagens vão num array separado, referenciadas aqui por
// ordem: "the first/second attached image").
function buildCatalogPrompt(colorLabel: string | null, moduleRefLabels: (string | null)[]): string {
  const refCount = moduleRefLabels.length;
  // Cada referência é citada por ORDEM ("image 2", "image 3"...), não por
  // rótulo/parte marcada — a API de edição da OpenAI não tem um formato de
  // "partes" como o Gemini, só um prompt de texto + um array de imagens.
  const refParagraph = refCount > 0
    ? `\n${refCount === 1 ? 'The second attached image is' : `The additional attached images (2 through ${refCount + 1}) are`} real reference photo(s) of ${refCount === 1 ? 'the actual physical module (or one very close to it)' : 'the actual physical pieces used inside this module (nested modules)'}${moduleRefLabels.some((l) => l) ? `: ${moduleRefLabels.map((label, i) => `image ${i + 2}${label ? ` = "${label}"` : ''}`).join(', ')}` : ''} — match ${refCount === 1 ? 'its' : 'each one\'s'} real proportions, panel/edge-banding details, and hardware (handles, legs, hinges, feet) as closely as possible for the corresponding part of the furniture. The exact overall shape, proportions, and camera angle still come only from the FIRST attached image.`
    : '';
  return `Using the first attached image only as a reference for this furniture piece's overall shape, proportions, and camera angle, create a brand new, fully photorealistic studio product photograph of it — as if a real physical unit of this exact design was manufactured and professionally photographed in a photo studio.

Do not simply re-render the flat 3D/CG look of the reference image. Generate realistic materials: authentic wood grain with natural variation, a real matte or satin laminate sheen, soft studio softbox lighting with gentle highlights and gradients across the surfaces, and sharp photographic detail. It should be indistinguishable from an actual photograph of a real piece of furniture, not a rendering.

Background: pure solid white (#FFFFFF), seamless studio backdrop, like an Amazon/IKEA product listing photo — no room, no floor, no wall, no reflection, and no shadow on the backdrop itself.

Keep the same overall shape, proportions, and camera angle as the reference image — this represents a real product design that must stay recognizable, just rendered as a real photograph instead of a 3D preview.

No LED lighting, no light strips, no glowing shelves, no backlighting — this piece has none of that built in.
${colorLabel ? `\nThe real color/finish of the MDF is: "${colorLabel}" — match this description as closely as possible (same hue/tone family, do not invent a different shade).` : ''}
${refParagraph}

Final output: a sharp, believable, photorealistic furniture product photograph — real material texture, real studio lighting on the object, isolated on a solid white shadow-free background — ready for an e-commerce catalog listing.`;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

function parseDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/.exec(dataUrl);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ---------- modo 'gallery' (Gemini) ----------
async function generateGalleryImage(params: {
  mainImage: { mimeType: string; data: string };
  moduleRefImages: { mimeType: string; data: string; label: string | null }[];
  colorRefImages: { mimeType: string; data: string; label: string | null }[];
  angleRefImages: { mimeType: string; data: string; label: string | null }[];
  roomLabel: string | null;
  colorLabel: string | null;
  aspectRatio: string | null;
}): Promise<{ imageDataUrl?: string; error?: string; status?: number }> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    return { error: 'GEMINI_API_KEY não configurada neste projeto (rode: supabase secrets set GEMINI_API_KEY=...).', status: 500 };
  }

  const { mainImage, moduleRefImages, colorRefImages, angleRefImages, roomLabel, colorLabel, aspectRatio } = params;
  const promptText = buildGalleryPrompt(roomLabel, colorLabel, moduleRefImages.length, colorRefImages.length, angleRefImages.length);
  const parts: Record<string, unknown>[] = [
    { text: promptText },
    { inline_data: { mime_type: mainImage.mimeType, data: mainImage.data } }
  ];
  // Ângulos EXTRAS do MESMO 3D (3/4 + lateral) — pedido do usuário
  // (2026-07-19): "existe a possibilidade de levar um arquivo 3d pra geracao
  // da imagem ser fiel ao projeto?". A API não aceita arquivo 3D nenhum, só
  // imagem 2D + texto — isto aqui é a alternativa: mais vistas do mesmo
  // móvel, só pra referência de GEOMETRIA (ver
  // captureCompositionAngleReferences em portal.js e comentário em
  // buildGalleryPrompt). Vai logo depois da imagem principal, antes das
  // fotos de cor/módulo (essas são sobre MATERIAL, não geometria).
  angleRefImages.forEach((img) => {
    const label = img.label || 'outro ângulo';
    parts.push({ text: `Imagem extra (mesmo 3D, outro ângulo) — "${label}":` });
    parts.push({ inline_data: { mime_type: img.mimeType, data: img.data } });
  });
  // Foto REAL do acabamento (colors.texture_url) — pedido do usuário
  // (2026-07-19): "nao ta subindo a cor certa, temos que enviar o arquivo da
  // cor pra ser exato". Vai ANTES das fotos de módulo, e o prompt já deixa
  // claro que estas são só sobre COR/textura, não sobre forma/hardware (ver
  // buildGalleryPrompt).
  colorRefImages.forEach((img) => {
    const label = img.label || 'finish';
    parts.push({ text: `Real swatch/finish photo — color reference for "${label}":` });
    parts.push({ inline_data: { mime_type: img.mimeType, data: img.data } });
  });
  // Uma imagem de referência POR MÓDULO distinto (até MAX_MODULE_REF_IMAGES,
  // ver portal.js fetchReferencePhotosForComposition) — cada uma rotulada
  // com o nome da peça, pra IA nunca aplicar a referência de uma peça na
  // outra. Antes só mandava 1 no total, então um segundo módulo na mesma
  // composição (ex.: criado-mudo ao lado da cabeceira) nunca tinha
  // referência nenhuma. Rótulo alinhado com o parágrafo "IF an image
  // labeled 'module reference'..." do buildGalleryPrompt acima — a versão
  // restaurada (2026-07-19, pedido do usuário) volta a permitir usar a foto
  // pra proporção/ferragem também, não só material.
  moduleRefImages.forEach((img) => {
    const label = img.label || 'furniture piece';
    parts.push({ text: `Reference photo for the piece named "${label}" — labeled 'module reference':` });
    parts.push({ inline_data: { mime_type: img.mimeType, data: img.data } });
  });

  const requestBody: Record<string, unknown> = { contents: [{ parts }] };
  if (aspectRatio) {
    // Sem isto, o Gemini tende a decidir uma proporção própria (3:4/1:1),
    // que não bate com o enquadramento tipicamente largo de uma composição
    // e sai com faixa branca/corte estranho no preview (ver
    // nearestSupportedAspectRatio em portal.js, que calcula este valor a
    // partir do canvas real do 3D).
    // 2026-07-31: mainImage (parts[1] acima) já vem PRÉ-PREENCHIDA em
    // branco pelo cliente (padImageToAspectRatio em portal.js) pra bater
    // EXATAMENTE esta mesma proporção — sem esse pré-preenchimento, a
    // imagem mandada e a proporção pedida aqui divergiam, e o Gemini
    // resolvia o descompasso redimensionando o móvel pra caber (bug
    // relatado pelo usuário: "muda o projeto pra caber"). Ver também o
    // parágrafo "CRITICAL — do not resize or rescale" em buildGalleryPrompt.
    requestBody.generationConfig = { imageConfig: { aspectRatio } };
  }

  const geminiRes = await fetch(GEMINI_ENDPOINT, {
    method: 'POST',
    headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  });

  if (!geminiRes.ok) {
    const errText = await geminiRes.text();
    // console.error (não só devolver no body) — o body some se o cliente
    // não ler a resposta com atenção; isto aqui é o que aparece na aba
    // "Logs" do painel do Supabase (Edge Functions > generate-gallery-render
    // > Logs), pra dar pra diagnosticar sem precisar inspecionar a
    // resposta HTTP no navegador.
    console.error(`Gemini API error (${geminiRes.status}):`, errText);
    return { error: `Gemini API error (${geminiRes.status}): ${errText}`, status: 502 };
  }

  const geminiJson = await geminiRes.json();
  const responseParts = geminiJson?.candidates?.[0]?.content?.parts || [];
  const imagePart = responseParts.find((p: any) => p.inlineData || p.inline_data);
  const inline = imagePart && (imagePart.inlineData || imagePart.inline_data);
  if (!inline) {
    console.error('Gemini não devolveu imagem. Resposta completa:', JSON.stringify(geminiJson));
    return { error: 'Gemini não devolveu nenhuma imagem (pode ter sido bloqueada por segurança/conteúdo).', status: 502 };
  }

  const outMime = inline.mimeType || inline.mime_type || 'image/png';
  return { imageDataUrl: `data:${outMime};base64,${inline.data}` };
}

// ---------- modo 'catalog' (OpenAI gpt-image-1) ----------
// /v1/images/edits — multipart/form-data, campo `image[]` (array, até 16
// imagens), `model`, `prompt`. gpt-image-1 SEMPRE devolve base64 em
// data[0].b64_json (não existe response_format=url pra este modelo,
// confirmado na documentação da OpenAI — diferente do dall-e-2/3).
async function generateCatalogImage(params: {
  mainImage: { mimeType: string; data: string };
  moduleRefImages: { mimeType: string; data: string; label: string | null }[];
  colorLabel: string | null;
}): Promise<{ imageDataUrl?: string; error?: string; status?: number }> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    return { error: 'OPENAI_API_KEY não configurada neste projeto (rode: supabase secrets set OPENAI_API_KEY=...).', status: 500 };
  }

  const { mainImage, moduleRefImages, colorLabel } = params;
  const form = new FormData();
  form.append('model', OPENAI_IMAGE_MODEL);
  form.append('prompt', buildCatalogPrompt(colorLabel, moduleRefImages.map((img) => img.label)));
  form.append('size', 'auto');
  form.append('quality', 'auto');
  form.append('image[]', new Blob([base64ToBytes(mainImage.data)], { type: mainImage.mimeType }), 'source.png');
  moduleRefImages.forEach((img, i) => {
    form.append('image[]', new Blob([base64ToBytes(img.data)], { type: img.mimeType }), `module-reference-${i + 1}.png`);
  });

  const openaiRes = await fetch(OPENAI_EDITS_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form
  });

  if (!openaiRes.ok) {
    const errText = await openaiRes.text();
    console.error(`OpenAI API error (${openaiRes.status}):`, errText);
    // 403 aqui é quase sempre "organização não verificada" — mensagem mais
    // clara pro Matt não precisar abrir o console pra entender.
    const hint = openaiRes.status === 403
      ? ' (provavelmente a organização da OpenAI ainda não está verificada — Settings > Organization > General no dashboard da OpenAI, pode levar até 30min pra propagar)'
      : '';
    return { error: `OpenAI API error (${openaiRes.status})${hint}: ${errText}`, status: 502 };
  }

  const openaiJson = await openaiRes.json();
  const b64 = openaiJson?.data?.[0]?.b64_json;
  if (!b64) {
    console.error('OpenAI não devolveu imagem. Resposta completa:', JSON.stringify(openaiJson));
    return { error: 'OpenAI não devolveu nenhuma imagem.', status: 502 };
  }
  return { imageDataUrl: `data:image/png;base64,${b64}` };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => null);
    const imageDataUrl = body && body.imageDataUrl;
    // 'gallery' (padrão, Gemini, cena de ambiente decorada) ou 'catalog'
    // (OpenAI, foto de vitrine isolada em fundo branco — ver comentário do
    // topo do arquivo).
    const rawMode = body && body.mode;
    const mode = rawMode === 'catalog' ? 'catalog' : 'gallery';
    // Foto(s) REAL(is) de referência (migration 050, banco de referências do
    // admin) — pedido do usuário: "podemos criar um banco com cada
    // referencia de modulo pra gerar a imagem mais fiel?". Complementa (não
    // substitui) o print 3D: dá pra IA uma referência de
    // PROPORÇÃO/FERRAGEM/ACABAMENTO reais, não só a geometria genérica do
    // render.
    //   - modo 'catalog' (admin, 1 módulo só) aceita OS DOIS: o campo
    //     singular legado moduleRefDataUrl (foto manual da reference_photos
    //     bank) E moduleRefImages (desde 2026-07-19: ícones de vitrine já
    //     gerados dos módulos aninhados usados como peça deste módulo — ver
    //     comentário do topo do arquivo) — combinados logo abaixo, perto do
    //     generateCatalogImage.
    //   - modo 'gallery' (portal, composição com N módulos) manda
    //     moduleRefImages — array de {moduleName, dataUrl}, 1 foto POR
    //     módulo distinto (ver fetchReferencePhotosForComposition em
    //     portal.js, teto de 3) — antes só existia 1 no total, então um
    //     segundo módulo na composição nunca tinha referência (cliente
    //     relatou "errou o desenho do criado mudo").
    const moduleRefDataUrl = body && body.moduleRefDataUrl;
    const rawModuleRefImages = (body && Array.isArray(body.moduleRefImages)) ? body.moduleRefImages : [];
    // colorLabel = texto (nome + hex aproximado, construído em
    // buildColorDescriptionForComposition no portal.js ou a partir das cores
    // escolhidas no admin em generateModuleAiImage) — cap maior que
    // roomLabel porque pode juntar vários nomes de cor.
    //
    // colorRefImages = foto REAL do acabamento (colors.texture_url), desde
    // 2026-07-19 — pedido do usuário: "nao ta subindo a cor certa, temos que
    // enviar o arquivo da cor pra ser exato" (reverte a decisão anterior de
    // só texto). Array de {label, dataUrl}, ver buildColorReferencesForComposition
    // em portal.js.
    const rawColorRefImages = (body && Array.isArray(body.colorRefImages)) ? body.colorRefImages : [];
    // angleRefImages = MESMO 3D visto de outros ângulos (3/4 + lateral),
    // desde 2026-07-19 — pedido do usuário: "existe a possibilidade de levar
    // um arquivo 3d pra geracao da imagem ser fiel ao projeto?". API não
    // aceita arquivo 3D, então isto é a alternativa: mais vistas 2D pra
    // referência de GEOMETRIA (ver captureCompositionAngleReferences em
    // portal.js). Array de {label, dataUrl}.
    const rawAngleRefImages = (body && Array.isArray(body.angleRefImages)) ? body.angleRefImages : [];
    const rawColorLabel = body && body.colorLabel;
    const colorLabel = typeof rawColorLabel === 'string' ? rawColorLabel.replace(/[\r\n]+/g, ' ').trim().slice(0, 300) || null : null;
    // string livre, cap curto e sem quebras de linha — só higiene básica
    // contra prompt injection via um nome de família mal-intencionado, não
    // uma validação de valores permitidos (a lista de famílias é livre,
    // cadastrada pelo admin).
    const rawRoomLabel = body && body.roomLabel;
    const roomLabel = typeof rawRoomLabel === 'string' ? rawRoomLabel.replace(/[\r\n]+/g, ' ').trim().slice(0, 60) || null : null;
    const rawAspectRatio = body && body.aspectRatio;
    const aspectRatio = typeof rawAspectRatio === 'string' && SUPPORTED_ASPECT_RATIOS.has(rawAspectRatio) ? rawAspectRatio : null;
    if (!imageDataUrl) {
      return jsonResponse({ error: 'imageDataUrl é obrigatório.' }, 400);
    }

    const mainImage = parseDataUrl(imageDataUrl);
    if (!mainImage) {
      return jsonResponse({ error: 'imageDataUrl inválida (esperado data:image/...;base64,...).' }, 400);
    }
    const moduleRefImage = moduleRefDataUrl ? parseDataUrl(moduleRefDataUrl) : null;
    // Teto de 3 do lado do servidor também — nunca confiar só na validação
    // do cliente (ver MAX_MODULE_REF_PHOTOS em portal.js).
    const moduleRefImages = rawModuleRefImages
      .slice(0, 3)
      .map((item: any) => {
        const parsed = item && typeof item.dataUrl === 'string' ? parseDataUrl(item.dataUrl) : null;
        if (!parsed) return null;
        const label = item && typeof item.moduleName === 'string' ? item.moduleName.replace(/[\r\n]+/g, ' ').trim().slice(0, 80) || null : null;
        return { ...parsed, label };
      })
      .filter((x: unknown): x is { mimeType: string; data: string; label: string | null } => !!x);
    // Mesmo teto de 4 do lado do servidor (ver MAX_COLOR_REF_PHOTOS em
    // portal.js) — nunca confiar só na validação do cliente.
    const colorRefImages = rawColorRefImages
      .slice(0, 4)
      .map((item: any) => {
        const parsed = item && typeof item.dataUrl === 'string' ? parseDataUrl(item.dataUrl) : null;
        if (!parsed) return null;
        const label = item && typeof item.label === 'string' ? item.label.replace(/[\r\n]+/g, ' ').trim().slice(0, 120) || null : null;
        return { ...parsed, label };
      })
      .filter((x: unknown): x is { mimeType: string; data: string; label: string | null } => !!x);
    // Teto de 2 do lado do servidor (ver captureCompositionAngleReferences
    // em portal.js — 2 ângulos extras: 3/4 e lateral).
    const angleRefImages = rawAngleRefImages
      .slice(0, 2)
      .map((item: any) => {
        const parsed = item && typeof item.dataUrl === 'string' ? parseDataUrl(item.dataUrl) : null;
        if (!parsed) return null;
        const label = item && typeof item.label === 'string' ? item.label.replace(/[\r\n]+/g, ' ').trim().slice(0, 120) || null : null;
        return { ...parsed, label };
      })
      .filter((x: unknown): x is { mimeType: string; data: string; label: string | null } => !!x);

    // Modo 'catalog': combina a foto legada singular (moduleRefImage, banco
    // de reference_photos) com os ícones de módulo aninhado (moduleRefImages,
    // pedido do usuário: "levar como referencia os icones de cada modulo
    // selecionado") numa lista só, cap de 4 (nunca confiar só no cap de 3 já
    // aplicado a moduleRefImages acima — a legada pode empurrar pra 4).
    const catalogRefImages = (moduleRefImage ? [{ ...moduleRefImage, label: null as string | null }] : [])
      .concat(moduleRefImages)
      .slice(0, 4);

    const result = mode === 'catalog'
      ? await generateCatalogImage({ mainImage, moduleRefImages: catalogRefImages, colorLabel })
      : await generateGalleryImage({ mainImage, moduleRefImages, colorRefImages, angleRefImages, roomLabel, colorLabel, aspectRatio });

    if (result.error) {
      return jsonResponse({ error: result.error }, result.status || 500);
    }
    return jsonResponse({ imageDataUrl: result.imageDataUrl }, 200);
  } catch (err) {
    console.error('Erro inesperado em generate-gallery-render:', err);
    return jsonResponse({ error: String(err && (err as Error).message ? (err as Error).message : err) }, 500);
  }
});
