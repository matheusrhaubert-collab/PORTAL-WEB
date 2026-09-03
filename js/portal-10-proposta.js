// portal-10-proposta.js — parte 10/10 de js/portal.js (ver
// portal-01-core-catalogo.js pro contexto da divisão). Gerador de
// "Proposta" (PDF) pro DEALER apresentar pro cliente FINAL dele.
//
// Pedido original do usuário (2026-08-24): "quero colcoar um gerador de
// proposta no portal depois de salvar e gerar render no pedido. a proposta
// deve ter a lista de modulos, render do projeto, vista paralelo de todas
// as paredes e topo com cotas (isso deve gerar sozinho) pode fazer
// separado, e deixar abaixo dos renders. preciso da logo do cliente em
// cima bonito com os dados da loja dele. o preco deve ser a margem dele em
// cima valor da fabrica (ja com margem e claro). o foco e o dealer poder
// aprosentar uma porposta bonita pro seu cliente."
//
// Decisões (AskUserQuestion, mesma sessão):
//  1) Render = foto realista (Photoreal) se já foi gerada nesse projeto
//     antes de enviar pro pedido, senão o snapshot 3D rápido — os dois são
//     CONGELADOS no momento do envio (sendProjectToOrder, portal-08, ver
//     migration 139: orders.project_photoreal_url/project_thumbnail_data_url),
//     NUNCA regenerados aqui.
//  2) Formato = PDF de verdade, via jsPDF (mesma biblioteca que
//     generateOrderPDF, portal-02-pedidos.js, já usa pro "Gerar PDF" da
//     lista de pedidos — esta é a versão bonita pro cliente FINAL, com
//     logo/render/desenhos, não o resumo interno de sempre).
//  3) Dados da loja = nome + telefone (user_profiles.store_name/store_phone,
//     migration 138), mesmo padrão self-service da logo/margem de revenda.
//
// RODADA 2 (mesmo dia, feedback do Matt vendo o 1º PDF gerado — prints do
// resultado + lista de pedidos): "pode colocar o botao la na tela do
// projeto mesmo la em cima inclusive. aqui colocar as pecas uma a uma com
// icone que vem do pedido mesmo. nao esta bonita a apresentacao ta bem
// seco, da uma trabalhada com alguma skill de grafique designer. nao tem
// logo (no meu caso adm e legno). vi paredes vazias, nao e necessario
// colocar se estao vazias. as cotas devem ficar por fora do movel
// alinhadas abaixo e dos lados. mostrando as cotas como linhas e mostrar o
// movel tambem desnehado. nao linhas. mostrar o nome da empresa, o nome
// dos daods do cliente... faz uma proposta bacana! made in amercia
// bandeira dos estados unidos." Nesta rodada:
//  - Botão "Proposta" foi pra 2 lugares agora: tela do Pedido (como antes,
//    #po-order-detail-proposal-btn) E na barra de ferramentas de cima da
//    aba Projetos (#po-proj-proposal-btn, generateProjectProposalPDF) — dá
//    pra gerar uma prévia direto do projeto ainda não enviado, sem precisar
//    congelar um pedido primeiro (buildProposalItemFromSlot monta os itens
//    a partir de projectSlots ao vivo, no mesmo formato que
//    sendProjectToOrder grava no banco).
//  - Ícone por peça na lista de módulos: já existia (thumbnail_data_url,
//    congelado por item desde a 1ª rodada) mas não estava sendo desenhado
//    no PDF — corrigido.
//  - Direção de arte (skill graphic-designer): paleta reaproveitada 1:1 do
//    --accent do próprio portal (css/style.css: #8a5a34/#6e4527, o marrom
//    "madeira" da marca) + tom neutro quente (#2b2621/#766f64/#e0ddd6) —
//    cabeçalhos de seção em versalete com fio, cards com selo numerado
//    (mesmo número da lista de módulos, cross-reference com os desenhos),
//    zebra sutil na lista, faixa de total em destaque.
//  - Sem logo própria cadastrada (perfil sem logo_url — comum pra
//    administrador testando, ou dealer que ainda não subiu a logo): cai
//    pro wordmark "LEGNO" em vez de ficar em branco.
//  - Paredes SEM nenhum módulo não entram mais nos desenhos (proposalWallList
//    agora filtra por proposalItemsOnWall(...).length > 0).
//  - Cotas viraram cotas de verdade (linha de cota + linhas de extensão +
//    marcas de topo, com o texto NA linha) em vez de texto solto dentro do
//    retângulo — largura por baixo (segmentada por módulo, mais uma cota
//    total da parede), altura/profundidade do lado de fora de cada peça. O
//    móvel continua desenhado como retângulo (não virou só linhas).
//  - Rodapé em toda página: nome da loja + "MADE IN USA" com uma bandeira
//    americana simplificada desenhada em vetor (sem imagem externa).
//
// GAP CONHECIDO E DELIBERADO (não mudou nesta rodada): as elevações e a
// planta baixa continuam desenhadas só com os primitivos vetoriais do
// próprio jsPDF a partir de order_items.project_placement — são
// ESQUEMÁTICAS (retângulo por módulo + cota), não desenham porta/gaveta
// peça a peça como o 3D real, e a "planta baixa" desenha cada parede como
// uma tira reta separada (não a trigonometria de canto real que
// getProjectWallGeometry usa pro 3D). Só funciona pra pedidos/projetos com
// project_placement preenchido; sem isso as duas seções mostram o aviso
// proposal.layout_missing e o resto (logo/render/lista/preço) segue normal.

const PROPOSAL_MARGIN_MM = 14;
const PROPOSAL_WALL_ROLES_BY_SHAPE = { single: ['main'], double: ['main', 'right'], u: ['left', 'main', 'right'] };

// Paleta — mesma do css/style.css (--accent/--accent-dark/--text/--muted/
// --border), pra Proposta ficar visualmente igual ao resto do portal.
const PROPOSAL_COLOR_ACCENT = [138, 90, 52];
const PROPOSAL_COLOR_ACCENT_DARK = [110, 69, 39];
const PROPOSAL_COLOR_TEXT = [43, 38, 33];
const PROPOSAL_COLOR_MUTED = [118, 111, 100];
const PROPOSAL_COLOR_BORDER = [224, 221, 214];
const PROPOSAL_COLOR_BORDER_SOFT = [214, 208, 198];
const PROPOSAL_COLOR_ZEBRA = [250, 249, 247];
const PROPOSAL_COLOR_CARD_FILL = [246, 240, 232];

function proposalItemsOnWall(items, wallIndex) {
  return (items || []).filter((it) => it.project_placement && Number(it.project_placement.wall_index || 0) === wallIndex);
}

// Lista de paredes A DESENHAR — só as que têm pelo menos 1 módulo (pedido
// do usuário: "vi paredes vazias, nao e necessario colocar se estao
// vazias"). displayIndex é o número mostrado ("Parede 1", "Parede 2"...),
// sequencial só entre as paredes exibidas — não pula número quando uma
// parede do meio está vazia e é descartada.
//
// "PAREDE DESENHADA VENCE" (2026-09-04, mesma regra de
// getProjectWallCount/getProjectWallWidthMm em
// portal-06a-projetos-canvas-core.js chegando aqui) — bug relatado pelo
// usuário: "nao esta mostrando as cotas de todas as paredes", só "Wall 1"
// aparecia. Esta função só conhecia o sistema ANTIGO de forma fixa
// (wall_shape/wall_widths_mm, até 3 paredes), aposentado em 13/08/2026
// quando as paredes viraram planta desenhada (projectWallSegments) — mas
// nunca foi atualizada pra saber disso, nem quando migration 139 (24/08,
// 11 dias DEPOIS da planta desenhada já existir) congelou geometria no
// pedido. 3 fontes, em ordem de prioridade:
//   1) order.wall_segments — planta desenhada congelada (migration 153).
//      Só existe em pedidos enviados DEPOIS dela.
//   2) order.wall_shape/wall_widths_mm — forma fixa legada (1-3 paredes
//      retas). Cobre pedidos de antes da planta desenhada existir.
//   3) Nem uma nem outra bateu com o que os ITENS realmente usam: o MAIOR
//      wall_index citado em project_placement decide quantas paredes
//      existem (pedidos enviados ENTRE a planta desenhada nascer e a
//      migration 153 — como o pedido que motivou este ajuste — têm
//      wall_index certo no item, mas nenhuma das 2 fontes acima "sabe" que
//      aquela parede existe). Largura, nesse caso, não é a parede "de
//      verdade" (não temos a medida) — é o alcance real dos módulos nela
//      mais uma folga, só pra caber tudo no desenho.
function proposalWallList(order, items) {
  const segs = Array.isArray(order && order.wall_segments) ? order.wall_segments : null;
  const widths = Array.isArray(order && order.wall_widths_mm) && order.wall_widths_mm.length
    ? order.wall_widths_mm
    : null;
  const roles = (order && order.wall_shape && PROPOSAL_WALL_ROLES_BY_SHAPE[order.wall_shape]) || null;

  const maxItemWallIndex = (items || []).reduce((max, it) => {
    const wi = (it && it.project_placement) ? Number(it.project_placement.wall_index || 0) : -1;
    return Math.max(max, wi);
  }, -1);

  const wallCount = Math.max(segs ? segs.length : 0, roles ? roles.length : 0, maxItemWallIndex + 1);
  if (wallCount <= 0) return [];

  // Centro do ambiente (só usado pela fonte 1) — mesma conta de
  // projectWallsCentroM (portal-08-projetos-paredes.js), em mm em vez de
  // metros: decide de que lado de cada segmento fica "dentro".
  let centroX = 0, centroZ = 0;
  if (segs && segs.length) {
    let sx = 0, sz = 0, n = 0;
    segs.forEach((s) => { sx += Number(s.ax || 0) + Number(s.bx || 0); sz += Number(s.az || 0) + Number(s.bz || 0); n += 2; });
    if (n) { centroX = sx / n; centroZ = sz / n; }
  }
  const mainIdx = roles ? roles.indexOf('main') : -1;
  const mainWidthMm = (roles && widths) ? (Number(widths[mainIdx >= 0 ? mainIdx : 0]) || 3000) : 3000;

  // Cursor de encadeamento — só a fonte 3 (parede sem geometria nenhuma,
  // nem desenhada nem legada) usa: continua RETO a partir de onde a última
  // parede COM geometria de verdade terminou (o "menos errado" possível
  // sem nenhuma informação de ângulo). Sem nenhuma parede com geometria
  // antes dela, começa na origem olhando pro eixo +X.
  let cursorX = 0, cursorZ = 0, cursorDirX = 1, cursorDirZ = 0;

  const all = [];
  for (let i = 0; i < wallCount; i++) {
    let widthMm = 0;
    let originXMm, originZMm, alongDirX, alongDirZ, intoDirX, intoDirZ;
    let thicknessMm = 150;
    const seg = segs && segs[i];
    const role = roles && roles[i];

    if (seg) {
      // FONTE 1 — planta desenhada de verdade (migration 153). Mesma
      // fórmula de projectWallSegmentGeometry: "dentro" é o lado da normal
      // que aponta pro centro do ambiente; inverterLado (botão ⇋ do
      // editor) vira por cima disso.
      const dx = Number(seg.bx || 0) - Number(seg.ax || 0);
      const dz = Number(seg.bz || 0) - Number(seg.az || 0);
      widthMm = Math.hypot(dx, dz) || 1;
      alongDirX = dx / widthMm; alongDirZ = dz / widthMm;
      let ix = -alongDirZ, iz = alongDirX;
      const mx = (Number(seg.ax || 0) + Number(seg.bx || 0)) / 2, mz = (Number(seg.az || 0) + Number(seg.bz || 0)) / 2;
      if ((centroX - mx) * ix + (centroZ - mz) * iz < -1e-6) { ix = -ix; iz = -iz; }
      if (seg.inverterLado) { ix = -ix; iz = -iz; }
      intoDirX = ix; intoDirZ = iz;
      originXMm = Number(seg.ax || 0); originZMm = Number(seg.az || 0);
      thicknessMm = Number(seg.thicknessMm) || 150;
      cursorX = Number(seg.bx || 0); cursorZ = Number(seg.bz || 0); cursorDirX = alongDirX; cursorDirZ = alongDirZ;
    } else if (role) {
      // FONTE 2 — forma fixa legada (single/double/U, sempre 90°). Mesma
      // fórmula do ramo sem segmentos de getProjectWallGeometry.
      widthMm = (widths && widths[i]) ? Number(widths[i]) : 3000;
      if (role === 'left') { originXMm = -mainWidthMm / 2; originZMm = 0; alongDirX = 0; alongDirZ = 1; intoDirX = 1; intoDirZ = 0; }
      else if (role === 'right') { originXMm = mainWidthMm / 2; originZMm = 0; alongDirX = 0; alongDirZ = 1; intoDirX = -1; intoDirZ = 0; }
      else { originXMm = -mainWidthMm / 2; originZMm = 0; alongDirX = 1; alongDirZ = 0; intoDirX = 0; intoDirZ = 1; }
      cursorX = originXMm + alongDirX * widthMm; cursorZ = originZMm + alongDirZ * widthMm;
      cursorDirX = alongDirX; cursorDirZ = alongDirZ;
    } else {
      // FONTE 3 — nem planta desenhada nem forma legada pra esta posição
      // (pedido enviado ENTRE a planta desenhada nascer e a migration 153
      // existir — o caso que motivou este ajuste). Largura vem do alcance
      // real dos módulos, com uma folga de 150mm.
      const reach = proposalItemsOnWall(items, i).reduce((max, it) => {
        const p = it.project_placement;
        return Math.max(max, Number(p.x_mm || 0) + Number(it.width_mm || 0));
      }, 0);
      widthMm = reach > 0 ? reach + 150 : 3000;
      originXMm = cursorX; originZMm = cursorZ;
      alongDirX = cursorDirX; alongDirZ = cursorDirZ;
      intoDirX = -alongDirZ; intoDirZ = alongDirX;
      cursorX = originXMm + alongDirX * widthMm; cursorZ = originZMm + alongDirZ * widthMm;
    }

    all.push({ wallIndex: i, widthMm, originXMm, originZMm, alongDirX, alongDirZ, intoDirX, intoDirZ, thicknessMm });
  }
  const withItems = all.filter((w) => proposalItemsOnWall(items, w.wallIndex).length > 0);
  withItems.forEach((w, i) => { w.displayIndex = i + 1; });
  return withItems;
}

function proposalHasLayoutData(order, items) {
  if (!order) return false;
  if (!(items || []).some((it) => it && it.project_placement && typeof it.project_placement === 'object')) return false;
  return proposalWallList(order, items).length > 0;
}

// ---------- Imagem (logo/render/ícone por peça) ----------

// jsPDF 2.5.1 (addImage) precisa de um data: URI — não baixa URL remota
// sozinho. thumbnail_data_url já É um data: URI (base64 inline, migration
// 069); logo_url/ai_preview_url são URLs públicas do Storage e precisam ser
// baixadas primeiro. Falha (rede, imagem removida do Storage, CORS) não
// derruba o PDF inteiro — a seção correspondente só fica sem imagem.
async function proposalUrlToDataUrl(url) {
  if (!url) return null;
  if (url.indexOf('data:') === 0) return url;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (e) { return null; }
}

// Decide formato (PNG/JPEG) e a razão largura/altura real da imagem (pra
// não distorcer ao encaixar num retângulo do PDF) carregando num <img>
// temporário fora do DOM.
function proposalImageMeta(dataUrl) {
  return new Promise((resolve) => {
    if (!dataUrl) { resolve(null); return; }
    const img = new Image();
    img.onload = () => resolve({ dataUrl, w: img.naturalWidth || 1, h: img.naturalHeight || 1, format: dataUrl.indexOf('image/png') !== -1 ? 'PNG' : 'JPEG' });
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

// Encaixa a imagem dentro de maxW x maxH (mm) preservando proporção,
// centralizada horizontalmente a partir de x. Retorna as coordenadas/
// tamanho REAIS usados (pra quem quiser desenhar uma moldura exata em
// volta, por exemplo), não só a altura como antes.
function proposalFitImage(doc, meta, x, y, maxW, maxH) {
  const ratio = Math.min(maxW / meta.w, maxH / meta.h);
  const w = meta.w * ratio;
  const h = meta.h * ratio;
  const drawX = x + (maxW - w) / 2;
  doc.addImage(meta.dataUrl, meta.format, drawX, y, w, h);
  return { x: drawX, y, w, h };
}

// Variante centralizada nos 2 eixos, pro ícone quadrado de cada peça na
// lista de módulos (thumbnail_data_url costuma vir recortado/retangular,
// não exatamente quadrado — ver trimTransparentPng).
function proposalFitImageCentered(doc, meta, x, y, boxW, boxH) {
  const ratio = Math.min(boxW / meta.w, boxH / meta.h);
  const w = meta.w * ratio;
  const h = meta.h * ratio;
  doc.addImage(meta.dataUrl, meta.format, x + (boxW - w) / 2, y + (boxH - h) / 2, w, h);
}

// ---------- Elementos de direção de arte (skill graphic-designer) ----------

// Cabeçalho de seção em versalete + fio (em vez de um <h3> solto) — mesmo
// recurso em toda a Proposta (render, elevações, planta, módulos) pra dar
// consistência/repetição, um dos princípios centrais do design editorial.
function proposalSectionHeader(doc, text, x, y, width) {
  const label = String(text).toUpperCase();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor.apply(doc, PROPOSAL_COLOR_ACCENT_DARK);
  doc.text(label, x, y);
  const textW = doc.getTextWidth(label);
  doc.setDrawColor.apply(doc, PROPOSAL_COLOR_BORDER);
  doc.setLineWidth(0.3);
  if (x + textW + 3 < x + width) doc.line(x + textW + 3, y - 1.2, x + width, y - 1.2);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0);
}

// "LEGNO" desenhado como wordmark — fallback quando o perfil não tem
// logo_url própria (pedido do usuário: "nao tem logo (no meu caso adm e
// legno)" — testando como administrador, sem logo de dealer cadastrada).
function proposalLegnoWordmark(doc, x, y) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor.apply(doc, PROPOSAL_COLOR_ACCENT);
  doc.text('LEGNO', x, y, { charSpace: 1.4 });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0);
}

// Bandeira dos EUA simplificada (7 faixas em vez de 13, cantão com 6
// estrelas em vez de 50) — desenhada em vetor puro (rect/circle do próprio
// jsPDF), sem depender de imagem externa. Uso: rodapé "MADE IN USA".
function proposalUsFlag(doc, x, y, w, h) {
  const stripes = 7;
  const stripeH = h / stripes;
  for (let i = 0; i < stripes; i++) {
    if (i % 2 === 0) doc.setFillColor(178, 34, 52); else doc.setFillColor(255, 255, 255);
    doc.rect(x, y + i * stripeH, w, stripeH, 'F');
  }
  const cantonW = w * 0.42;
  const cantonH = stripeH * 4;
  doc.setFillColor(60, 59, 110);
  doc.rect(x, y, cantonW, cantonH, 'F');
  doc.setFillColor(255, 255, 255);
  const cols = 3, rows = 2;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      doc.circle(x + (cantonW / (cols + 1)) * (c + 1), y + (cantonH / (rows + 1)) * (r + 1), 0.22, 'F');
    }
  }
  doc.setDrawColor.apply(doc, PROPOSAL_COLOR_BORDER_SOFT);
  doc.setLineWidth(0.1);
  doc.rect(x, y, w, h, 'S');
}

// Rodapé — chamado em TODAS as páginas depois do documento inteiro montado
// (loop sobre doc.internal.getNumberOfPages()), não seção por seção.
function proposalFooter(doc, pageWidth, pageHeight, pageNum, totalPages, storeName) {
  const fy = pageHeight - 8;
  doc.setDrawColor.apply(doc, PROPOSAL_COLOR_BORDER);
  doc.setLineWidth(0.2);
  doc.line(PROPOSAL_MARGIN_MM, fy - 4, pageWidth - PROPOSAL_MARGIN_MM, fy - 4);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor.apply(doc, PROPOSAL_COLOR_MUTED);
  doc.text(storeName || 'Legno', PROPOSAL_MARGIN_MM, fy);
  doc.text(String(pageNum) + ' / ' + String(totalPages), pageWidth / 2, fy, { align: 'center' });

  // "Made in USA" + bandeira — pedido do usuário 2026-08-24: "made in
  // amercia bandeira dos estados unidos".
  const flagW = 6.5, flagH = 4.3;
  const tag = I18n.t('proposal.made_in_usa');
  const tagW = doc.getTextWidth(tag);
  const flagX = pageWidth - PROPOSAL_MARGIN_MM - flagW;
  doc.text(tag, flagX - 2 - tagW, fy);
  proposalUsFlag(doc, flagX, fy - flagH + 1.1, flagW, flagH);
  doc.setTextColor(0);
}

// ---------- Cotas técnicas (linha de cota + extensão + marcas) ----------
// Convenção de desenho técnico: linha de extensão fina saindo da peça,
// linha de cota com marcas nas pontas e o texto da medida NA linha (com um
// vão no meio pro texto não ficar em cima do traço). Pedido do usuário:
// "as cotas devem ficar por fora do movel alinhadas abaixo e dos lados.
// mostrando as cotas como linhas e mostrar o movel tambem desnehado. nao
// linhas" — ou seja: linhas de cota de verdade, FORA da peça, e a peça
// continua desenhada como retângulo (não vira só linha).

function proposalExtLineV(doc, x, yFrom, yTo) {
  doc.setDrawColor.apply(doc, PROPOSAL_COLOR_BORDER_SOFT);
  doc.setLineWidth(0.1);
  doc.line(x, yFrom, x, yTo);
}
function proposalExtLineH(doc, y, xFrom, xTo) {
  doc.setDrawColor.apply(doc, PROPOSAL_COLOR_BORDER_SOFT);
  doc.setLineWidth(0.1);
  doc.line(xFrom, y, xTo, y);
}

// Cota horizontal entre xA e xB, na altura y — usada pra largura (embaixo
// da peça/parede).
function proposalDimSegmentH(doc, xA, xB, y, label) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  const textW = doc.getTextWidth(label);
  const mid = (xA + xB) / 2;
  const gap = textW / 2 + 1.2;
  doc.setDrawColor.apply(doc, PROPOSAL_COLOR_MUTED);
  doc.setLineWidth(0.15);
  if (xB - xA > gap * 2 + 3) {
    doc.line(xA, y, mid - gap, y);
    doc.line(mid + gap, y, xB, y);
  } else if (xB > xA) {
    doc.line(xA, y, xB, y);
  }
  const tick = 0.9;
  doc.line(xA, y - tick, xA, y + tick);
  doc.line(xB, y - tick, xB, y + tick);
  doc.setTextColor.apply(doc, PROPOSAL_COLOR_MUTED);
  doc.text(label, mid, y, { align: 'center', baseline: 'middle' });
  doc.setTextColor(0);
}

// Cota vertical entre yA (topo) e yB (base), na posição x — usada pra
// altura/profundidade (do lado da peça). Texto rotacionado 90° pra correr
// junto com a linha.
function proposalDimSegmentV(doc, x, yA, yB, label) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  const textW = doc.getTextWidth(label);
  const mid = (yA + yB) / 2;
  const gap = textW / 2 + 1.2;
  doc.setDrawColor.apply(doc, PROPOSAL_COLOR_MUTED);
  doc.setLineWidth(0.15);
  if (yB - yA > gap * 2 + 3) {
    doc.line(x, yA, x, mid - gap);
    doc.line(x, mid + gap, x, yB);
  } else if (yB > yA) {
    doc.line(x, yA, x, yB);
  }
  const tick = 0.9;
  doc.line(x - tick, yA, x + tick, yA);
  doc.line(x - tick, yB, x + tick, yB);
  doc.setTextColor.apply(doc, PROPOSAL_COLOR_MUTED);
  doc.text(label, x, mid, { align: 'center', baseline: 'middle', angle: 90 });
  doc.setTextColor(0);
}

// Espaçamento vertical entre linhas de cota empilhadas (ver
// proposalDimAssignRows logo abaixo).
const PROPOSAL_DIM_ROW_STEP = 4.2;

// Separa uma "cota corrida" (vários segmentos lado a lado, ex.: largura de
// cada módulo embaixo da parede) em quantas LINHAS forem necessárias pra
// nenhum texto encostar no vizinho — em vez de só centralizar cada rótulo
// no meio do próprio segmento e torcer pra não bater (o que quebrava toda
// vez que um módulo era mais estreito que o próprio texto da medida, tipo
// "13 7/16\"" numa peça de filete). Mesma ideia de desenho técnico de
// verdade: quando não cabe, a cota sobe uma linha, não espreme o texto.
// Só calcula os segmentos e decide as linhas; quem desenha é
// proposalDimDrawRows, chamada depois de já saber quantas linhas vão
// existir (pra poder desenhar as linhas de extensão até o fundo certo).
function proposalDimAssignRows(doc, boundaries, originX, scale, pdfUnit) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  const rows = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const xA = originX + boundaries[i] * scale;
    const xB = originX + boundaries[i + 1] * scale;
    const label = formatDimension(boundaries[i + 1] - boundaries[i], pdfUnit);
    const textW = doc.getTextWidth(label);
    const mid = (xA + xB) / 2;
    const seg = { xA, xB, label, labelL: mid - textW / 2 - 0.8, labelR: mid + textW / 2 + 0.8 };
    const row = rows.find((r) => seg.labelL >= r[r.length - 1].labelR);
    if (row) row.push(seg);
    else rows.push([seg]);
  }
  return rows;
}

// Desenha as linhas já decididas por proposalDimAssignRows, uma abaixo da
// outra a cada PROPOSAL_DIM_ROW_STEP.
function proposalDimDrawRows(doc, rows, y) {
  rows.forEach((row, i) => {
    const rowY = y + i * PROPOSAL_DIM_ROW_STEP;
    row.forEach((seg) => proposalDimSegmentH(doc, seg.xA, seg.xB, rowY, seg.label));
  });
}

// Mesma ideia de proposalDimAssignRows, só que no outro eixo: a cota de
// altura/profundidade de um módulo MUITO estreito (um filete de 3/4", por
// exemplo) nasce a poucos milímetros da cota do vizinho — mesmo a cota
// rodada 90° "engordando" só pela espessura da própria fonte, isso já
// bastava pra uma escrever em cima da outra (visto no PDF de teste: duas
// "34 1/32\"" empilhadas e ilegíveis). Ordena os módulos da esquerda pra
// direita e empurra pra fora quem estiver mais perto do que
// PROPOSAL_DIM_COL_GAP do vizinho anterior — a peça em si não se move, só a
// cota (e a linha de chamada até ela) esticam mais longe quando precisa.
const PROPOSAL_DIM_COL_GAP = 4.5;

function proposalDimAssignColumns(entries, maxX) {
  const sorted = entries.slice().sort((a, b) => a.naturalAnchorX - b.naturalAnchorX);
  let lastAnchorX = -Infinity;
  sorted.forEach((e) => {
    let anchor = Math.max(e.naturalAnchorX, lastAnchorX + PROPOSAL_DIM_COL_GAP);
    // TRAVA DE SEGURANÇA (2026-09-04, "coisa passando pra fora da
    // pagina"): módulos estreitos demais acumulam empurrão sem teto — sem
    // isto a cota do último módulo de uma parede cheia podia nascer bem
    // depois da margem direita da folha, fora da área imprimível.
    if (maxX != null) anchor = Math.min(anchor, maxX);
    e.dimAnchorX = anchor;
    lastAnchorX = anchor;
  });
}

// Selo numerado no canto da peça desenhada — mesmo número da lista de
// módulos (it._num), pra dar pra cruzar "isso aqui no desenho é qual item
// da lista" (pedido do usuário: peças "uma a uma" identificáveis).
function proposalNumberBadge(doc, cx, cy, r, num) {
  doc.setFillColor.apply(doc, PROPOSAL_COLOR_ACCENT_DARK);
  doc.circle(cx, cy, r, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(r * 2.6);
  doc.setTextColor(255, 255, 255);
  doc.text(String(num), cx, cy, { align: 'center', baseline: 'middle' });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0);
}

// ---------- Documento ----------

async function generateOrderProposalPDF(order, items) {
  const statusEl = document.getElementById('po-order-detail-proposal-status');
  const btn = document.getElementById('po-order-detail-proposal-btn');
  if (!order || typeof window.jspdf === 'undefined') {
    alert(I18n.t('pdf.not_available'));
    return;
  }
  if (btn) btn.disabled = true;
  if (statusEl) { statusEl.style.display = 'block'; statusEl.textContent = I18n.t('proposal.generating'); }
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const contentWidth = pageWidth - PROPOSAL_MARGIN_MM * 2;
    const pdfUnit = (document.getElementById('po-unit-select') || {}).value || 'mm';
    // Migration 151 (2026-09-03): marginPct não é mais lido direto aqui —
    // getDisplayPriceRatioOnly()/getDisplayPrice() (portal-05-cutlist.js)
    // já encapsulam desconto de fábrica + margem + extras do dealer. Ver
    // os 2 usos abaixo: preço POR ITEM usa a versão só-proporcional (um
    // extra fixo não pode entrar 1x por item — viraria "frete × nº de
    // itens"); o TOTAL FINAL usa a versão completa, com extras fixos
    // somados 1x só no agregado.
    let y = PROPOSAL_MARGIN_MM;

    // Numeração estável (lista de módulos <-> desenhos), calculada uma vez
    // no topo pra valer em toda a Proposta.
    (items || []).forEach((it, i) => { it._num = i + 1; });

    function ensureSpace(next) {
      if (y + next > pageHeight - PROPOSAL_MARGIN_MM) { doc.addPage(); y = PROPOSAL_MARGIN_MM; }
    }
    function newPage(sectionTitle) {
      doc.addPage();
      y = PROPOSAL_MARGIN_MM;
      proposalSectionHeader(doc, sectionTitle, PROPOSAL_MARGIN_MM, y + 4, contentWidth);
      y += 13;
    }

    // ---------- Cabeçalho: logo + dados da loja ----------
    const logoMeta = await proposalImageMeta(await proposalUrlToDataUrl(currentUserProfile && currentUserProfile.logo_url));
    let headerBottom = PROPOSAL_MARGIN_MM;
    if (logoMeta) {
      const fit = proposalFitImage(doc, logoMeta, PROPOSAL_MARGIN_MM, y, 50, 22);
      headerBottom = Math.max(headerBottom, fit.y + fit.h);
    } else {
      proposalLegnoWordmark(doc, PROPOSAL_MARGIN_MM, y + 8);
      headerBottom = Math.max(headerBottom, y + 10);
    }
    const storeName = (currentUserProfile && currentUserProfile.store_name) || '';
    const storePhone = (currentUserProfile && currentUserProfile.store_phone) || '';
    doc.setFontSize(11);
    let storeInfoY = y + 2;
    const storeInfoX = logoMeta ? PROPOSAL_MARGIN_MM + 55 : PROPOSAL_MARGIN_MM + 42;
    if (storeName) { doc.setFont('helvetica', 'bold'); doc.text(storeName, storeInfoX, storeInfoY); doc.setFont('helvetica', 'normal'); storeInfoY += 6; }
    if (storePhone) { doc.setFontSize(9); doc.setTextColor.apply(doc, PROPOSAL_COLOR_MUTED); doc.text(I18n.t('pdf.phone', { phone: storePhone }), storeInfoX, storeInfoY); doc.setTextColor(0); storeInfoY += 5; }
    headerBottom = Math.max(headerBottom, storeInfoY);
    y = headerBottom + 5;

    doc.setDrawColor.apply(doc, PROPOSAL_COLOR_ACCENT);
    doc.setLineWidth(0.7);
    doc.line(PROPOSAL_MARGIN_MM, y, pageWidth - PROPOSAL_MARGIN_MM, y);
    y += 10;

    // ---------- Título + referência/data + cliente ----------
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor.apply(doc, PROPOSAL_COLOR_TEXT);
    doc.text(I18n.t('proposal.title'), PROPOSAL_MARGIN_MM, y); y += 8;
    doc.setFont('helvetica', 'normal');

    doc.setFontSize(9);
    doc.setTextColor.apply(doc, PROPOSAL_COLOR_MUTED);
    const title = order.po_name || order.client_name || I18n.t('pdf.order_fallback');
    doc.text(I18n.t('pdf.reference', { title }), PROPOSAL_MARGIN_MM, y);
    const date = order.submitted_at ? new Date(order.submitted_at).toLocaleDateString(currentLocale()) : new Date().toLocaleDateString(currentLocale());
    doc.text(I18n.t('pdf.date', { date }), pageWidth - PROPOSAL_MARGIN_MM, y, { align: 'right' });
    doc.setTextColor(0);
    y += 7;

    if (order.client_name) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor.apply(doc, PROPOSAL_COLOR_TEXT);
      const label = I18n.t('proposal.prepared_for');
      doc.text(label, PROPOSAL_MARGIN_MM, y);
      doc.setFont('helvetica', 'normal');
      doc.text(order.client_name, PROPOSAL_MARGIN_MM + doc.getTextWidth(label) + 3, y);
      doc.setTextColor(0);
      y += 8;
    } else {
      y += 3;
    }

    // ---------- Render(es) do projeto ----------
    // GRADE inteira (2026-09-04, pedido do usuário: "quero que a proposta
    // carregue todas as imagens renderizadas do projeto") — antes só a
    // foto realista MAIS RECENTE (ou o snapshot rápido, sem foto nenhuma
    // salva) aparecia aqui, mesmo quando o projeto tinha várias fotos
    // salvas (📸 grade de fotos realistas, project_photoreal_photos,
    // migration 077). project_photoreal_urls (plural, migration 153) é
    // essa grade INTEIRA, congelada no pedido no momento do envio; sem ela
    // (pedido enviado antes da migration, ou projeto sem nenhuma foto na
    // grade) cai pro campo antigo (singular), igual já funcionava.
    proposalSectionHeader(doc, I18n.t('proposal.render_section'), PROPOSAL_MARGIN_MM, y, contentWidth); y += 8;
    const renderUrls = Array.isArray(order.project_photoreal_urls) && order.project_photoreal_urls.length
      ? order.project_photoreal_urls
      : [order.project_photoreal_url || order.project_thumbnail_data_url || null].filter(Boolean);
    let renderedAny = false;
    for (let ri = 0; ri < renderUrls.length; ri++) {
      const renderMeta = await proposalImageMeta(await proposalUrlToDataUrl(renderUrls[ri]));
      if (!renderMeta) continue;
      renderedAny = true;
      ensureSpace(90);
      const availH = Math.min(140, pageHeight - y - PROPOSAL_MARGIN_MM);
      const fit = proposalFitImage(doc, renderMeta, PROPOSAL_MARGIN_MM, y, contentWidth, availH);
      doc.setDrawColor.apply(doc, PROPOSAL_COLOR_BORDER);
      doc.setLineWidth(0.3);
      doc.rect(fit.x, fit.y, fit.w, fit.h, 'S');
      y += fit.h + 8;
    }
    if (!renderedAny) {
      doc.setFontSize(10);
      doc.setTextColor(150);
      doc.text(I18n.t('proposal.render_missing'), PROPOSAL_MARGIN_MM, y);
      doc.setTextColor(0);
      y += 10;
    }

    // ---------- Elevações + planta baixa (esquemáticas, só paredes com peça) ----------
    const walls = proposalWallList(order, items);
    const hasLayout = proposalHasLayoutData(order, items);
    if (hasLayout && walls.length > 0) {
      newPage(I18n.t('proposal.elevations_section'));
      walls.forEach((wall, idx) => {
        // 1 PAREDE = 1 PÁGINA (2026-09-04, bug relatado pelo usuário:
        // "muito amontuado os valores sem visibilidade, coisa passando pra
        // fora da pagina") — a altura de uma parede não é fixa (depende de
        // quantas linhas de cota ela precisa), então um chute de espaço
        // (ensureSpace) podia ficar curto pra parede cheia de módulos.
        // newPage() garante a folha inteira em branco pra cada parede,
        // sempre.
        if (idx > 0) newPage(I18n.t('proposal.elevations_section'));
        y = proposalDrawElevation(doc, wall, proposalItemsOnWall(items, wall.wallIndex), y, contentWidth, pdfUnit);
        y += 10;
      });

      // PLANTA BAIXA — UM AMBIENTE SÓ (2026-09-04, "nao tem a principla que
      // e a planta baixa em paralelo de todo ambiente") — 1 página, 1
      // desenho, paredes conectadas nos cantos de verdade (ver comentário
      // grande em proposalDrawUnifiedFloorPlan).
      newPage(I18n.t('proposal.top_view_section'));
      const floorPlanMaxH = pageHeight - y - PROPOSAL_MARGIN_MM - 4;
      proposalDrawUnifiedFloorPlan(doc, walls, items, PROPOSAL_MARGIN_MM, y + 4, contentWidth, floorPlanMaxH, pdfUnit);
    } else {
      ensureSpace(20);
      proposalSectionHeader(doc, I18n.t('proposal.elevations_section'), PROPOSAL_MARGIN_MM, y, contentWidth); y += 8;
      doc.setFontSize(10);
      doc.setTextColor(150);
      doc.text(I18n.t('proposal.layout_missing'), PROPOSAL_MARGIN_MM, y);
      doc.setTextColor(0);
      y += 10;
    }

    // ---------- Lista de módulos (com ícone por peça) + preço ----------
    newPage(I18n.t('pdf.modules'));
    let factoryTotal = 0;
    for (let idx = 0; idx < items.length; idx++) {
      const it = items[idx];
      const colorLine = formatColorsLine(it);
      const cardH = 20;
      ensureSpace(cardH + 2);
      const cardY = y;

      if (idx % 2 === 1) {
        doc.setFillColor.apply(doc, PROPOSAL_COLOR_ZEBRA);
        doc.rect(PROPOSAL_MARGIN_MM, cardY, contentWidth, cardH, 'F');
      }

      // Ícone da peça — vem do próprio pedido/projeto (thumbnail_data_url
      // já congelado por item desde o envio, pedido do usuário: "aqui
      // colocar as pecas uma a uma com icone que vem do pedido mesmo").
      const iconBox = 16;
      const iconX = PROPOSAL_MARGIN_MM + 1;
      const iconY = cardY + (cardH - iconBox) / 2;
      doc.setDrawColor.apply(doc, PROPOSAL_COLOR_BORDER);
      doc.setLineWidth(0.2);
      doc.roundedRect(iconX, iconY, iconBox, iconBox, 1, 1, 'S');
      if (it.thumbnail_data_url) {
        const iconMeta = await proposalImageMeta(it.thumbnail_data_url);
        if (iconMeta) proposalFitImageCentered(doc, iconMeta, iconX, iconY, iconBox, iconBox);
      }

      const textX = iconX + iconBox + 5;
      const textW = contentWidth - iconBox - 5 - 30;
      let ty = cardY + 5.5;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor.apply(doc, PROPOSAL_COLOR_TEXT);
      doc.text(`${it._num}. ${it.module_name}`, textX, ty, { maxWidth: textW });
      ty += 5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor.apply(doc, PROPOSAL_COLOR_MUTED);
      doc.text(`${formatDimension(it.width_mm, pdfUnit)} x ${formatDimension(it.height_mm, pdfUnit)} x ${formatDimension(it.depth_mm, pdfUnit)}`, textX, ty);
      if (colorLine) { ty += 4.3; doc.text(colorLine, textX, ty, { maxWidth: textW }); }
      doc.setTextColor(0);

      const itemFactoryTotal = Number(it.total_price || 0);
      factoryTotal += itemFactoryTotal;
      const itemResaleTotal = getDisplayPriceRatioOnly(itemFactoryTotal);
      const qty = it.quantity || 1;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor.apply(doc, PROPOSAL_COLOR_ACCENT_DARK);
      doc.text(formatMoney(itemResaleTotal), pageWidth - PROPOSAL_MARGIN_MM - 2, cardY + cardH / 2 - (qty > 1 ? 2.2 : 0), { align: 'right', baseline: 'middle' });
      if (qty > 1) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor.apply(doc, PROPOSAL_COLOR_MUTED);
        doc.text(`x${qty}`, pageWidth - PROPOSAL_MARGIN_MM - 2, cardY + cardH / 2 + 3.4, { align: 'right' });
      }
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0);

      doc.setDrawColor.apply(doc, PROPOSAL_COLOR_BORDER);
      doc.setLineWidth(0.15);
      doc.line(PROPOSAL_MARGIN_MM, cardY + cardH, PROPOSAL_MARGIN_MM + contentWidth, cardY + cardH);

      y += cardH;
    }

    // ---------- Faixa de total (com a margem de revenda) ----------
    ensureSpace(28);
    y += 4;
    const finalTotal = getDisplayPrice(factoryTotal);
    const bandH = 16;
    doc.setFillColor.apply(doc, PROPOSAL_COLOR_TEXT);
    doc.roundedRect(PROPOSAL_MARGIN_MM, y, contentWidth, bandH, 1.2, 1.2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(224, 217, 206);
    doc.text(I18n.t('proposal.total_label'), PROPOSAL_MARGIN_MM + 6, y + bandH / 2, { baseline: 'middle' });
    doc.setFontSize(16);
    doc.setTextColor(255, 255, 255);
    doc.text(formatMoney(finalTotal), pageWidth - PROPOSAL_MARGIN_MM - 6, y + bandH / 2, { align: 'right', baseline: 'middle' });
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0);
    y += bandH + 6;
    // Migration 151: hint só aparece se NADA (margem, desconto ou extra
    // dos 2 lados) mudou o total em relação ao preço de fábrica cru —
    // antes só checava a margem simples.
    if (Math.abs(finalTotal - factoryTotal) < 0.005) {
      doc.setFontSize(9);
      doc.setTextColor(150);
      doc.text(I18n.t('proposal.margin_not_set_hint'), PROPOSAL_MARGIN_MM, y);
      doc.setTextColor(0);
    }

    // ---------- Rodapé (todas as páginas) ----------
    const totalPages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      proposalFooter(doc, pageWidth, pageHeight, p, totalPages, storeName);
    }

    const filenameBase = (order.po_name || order.client_name || I18n.t('proposal.filename_fallback'))
      .toLowerCase().normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || I18n.t('proposal.filename_fallback');
    doc.save(`${I18n.t('proposal.filename_fallback')}-${filenameBase}.pdf`);
    if (statusEl) { statusEl.textContent = ''; statusEl.style.display = 'none'; }
  } catch (err) {
    if (statusEl) { statusEl.textContent = (err && err.message) || String(err); }
    console.error('Falha ao gerar a Proposta:', err);
  } finally {
    if (btn) btn.disabled = false;
  }
}

// Desenha 1 parede em elevação (visão de frente, largura x altura) — cada
// módulo vira um retângulo posicionado por x_mm/floor_height_mm, com selo
// numerado (cross-reference com a lista) e cotas de verdade FORA da peça:
// altura à direita de cada módulo, largura numa cota corrida embaixo de
// toda a parede (segmentada por módulo) mais uma cota total por baixo.
function proposalDrawElevation(doc, wall, wallItems, y, contentWidth, pdfUnit) {
  const wallHeightMm = Math.max(2400, ...wallItems.map((it) => Number(it.project_placement.floor_height_mm || 0) + Number(it.height_mm || 0)), 0);
  // Prioriza ocupar a largura da folha inteira (pedido do Matt, 03/09:
  // "pegam o floor plan todo, preencher toda a folha") — antes a escala
  // sempre cedia pra caber na altura (drawAreaH), sobrando espaço em branco
  // do lado em paredes largas/baixas, que é o caso comum. O teto de altura
  // continua existindo só pra não deixar uma parede muito alta estourar a
  // página.
  const drawAreaH = 90;
  const scale = Math.min(contentWidth / wall.widthMm, drawAreaH / wallHeightMm);
  const drawW = wall.widthMm * scale;
  const drawH = wallHeightMm * scale;
  const originX = PROPOSAL_MARGIN_MM;
  const originY = y + 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor.apply(doc, PROPOSAL_COLOR_TEXT);
  doc.text(I18n.t('proposal.wall_label', { n: wall.displayIndex }), originX, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0);

  // Linha do piso (referência visual, não é cota)
  doc.setDrawColor.apply(doc, PROPOSAL_COLOR_BORDER_SOFT);
  doc.setLineWidth(0.2);
  doc.line(originX, originY + drawH, originX + drawW, originY + drawH);

  const elevEntries = wallItems.map((it) => {
    const p = it.project_placement;
    const xMm = Number(p.x_mm || 0);
    const hMm = Number(p.floor_height_mm || 0);
    const wMm = Number(it.width_mm || 0);
    const iH = Number(it.height_mm || 0);
    const rectX = originX + xMm * scale;
    const rectY = originY + (wallHeightMm - hMm - iH) * scale;
    const rectW = wMm * scale;
    const rectH = iH * scale;
    return { it, rectX, rectY, rectW, rectH, iH, naturalAnchorX: rectX + rectW + 2.5 };
  });
  proposalDimAssignColumns(elevEntries, PROPOSAL_MARGIN_MM + contentWidth - 2);

  elevEntries.forEach((e) => {
    const { it, rectX, rectY, rectW, rectH, iH } = e;
    doc.setFillColor.apply(doc, PROPOSAL_COLOR_CARD_FILL);
    doc.setDrawColor.apply(doc, PROPOSAL_COLOR_ACCENT);
    doc.setLineWidth(0.25);
    doc.roundedRect(rectX, rectY, rectW, rectH, 0.6, 0.6, 'FD');

    // SEM miniatura dentro do bloco (2026-09-04, pedido do usuário: "tira
    // as imagens icones de dentro dos blocos na proposta, ficou muito
    // poluido, mas a numeracao ficou boa") — testado numa rodada anterior
    // e revertido; o selo numerado (linha abaixo) é o que ele confirmou
    // que funciona bem pra identificar a peça, sem poluir o desenho.
    if (it._num) proposalNumberBadge(doc, rectX + 3, rectY + 3, 2, it._num);

    // Cota de altura, do lado de fora (direita) da peça — a linha de
    // chamada estica até onde a cota precisou ir (proposalDimAssignColumns)
    // quando o módulo é estreito demais pra caber do lado do vizinho.
    proposalExtLineH(doc, rectY, rectX + rectW, e.dimAnchorX + 0.7);
    proposalExtLineH(doc, rectY + rectH, rectX + rectW, e.dimAnchorX + 0.7);
    proposalDimSegmentV(doc, e.dimAnchorX, rectY, rectY + rectH, formatDimension(iH, pdfUnit));
  });

  // Cota de largura corrida embaixo de toda a parede, segmentada nos
  // limites de cada módulo (padrão de desenho de marcenaria) — empilha
  // sozinha em mais de uma linha quando um módulo é estreito demais pro
  // próprio texto da medida (proposalDimAssignRows), em vez de deixar os
  // números se atropelarem uns nos outros.
  const dimY = originY + drawH + 6;
  const boundaries = Array.from(new Set(wallItems.flatMap((it) => {
    const p = it.project_placement;
    const x0 = Math.round(Number(p.x_mm || 0));
    return [x0, Math.round(x0 + Number(it.width_mm || 0))];
  }))).sort((a, b) => a - b);
  const dimRows = proposalDimAssignRows(doc, boundaries, originX, scale, pdfUnit);
  const segmentedBottomY = dimY + (dimRows.length - 1) * PROPOSAL_DIM_ROW_STEP;
  boundaries.forEach((xMm) => proposalExtLineV(doc, originX + xMm * scale, originY + drawH, segmentedBottomY + 1.2));
  proposalDimDrawRows(doc, dimRows, dimY);

  // Cota total da parede, uma linha abaixo da última linha da segmentada.
  const totalDimY = segmentedBottomY + 6;
  proposalExtLineV(doc, originX, segmentedBottomY, totalDimY + 1.2);
  proposalExtLineV(doc, originX + drawW, segmentedBottomY, totalDimY + 1.2);
  proposalDimSegmentH(doc, originX, originX + drawW, totalDimY, formatDimension(wall.widthMm, pdfUnit));

  return totalDimY + 4;
}

// PLANTA BAIXA — UM AMBIENTE SÓ (2026-09-04, pedido do usuário: "nao tem a
// principla que e a planta baixa em paralelo de todo ambiente") — antes
// cada parede virava uma TIRA RETA separada, empilhada solta na página,
// sem canto nenhum entre elas; agora é UM desenho só, com as paredes na
// posição/ângulo de VERDADE (mesma geometria de proposalWallList — planta
// desenhada quando existe, forma fixa legada senão) e os módulos
// desenhados no lugar certo do mundo, encostados no canto de verdade —
// exatamente como a Vista de Canto do editor mostra.
//
// Armário de PAREDE (superior — floor_height_mm alto, mora acima da
// bancada) ocupa a MESMA área de piso que o que fica embaixo dele — é
// fisicamente assim (ele projeta pra baixo em cima do móvel de base). Vira
// contorno TRACEJADO por cima do móvel de base cheio, convenção normal de
// planta baixa de verdade pra "isto aqui está por cima, não do lado".
const PROPOSAL_WALL_CABINET_HEIGHT_MM = 600;

// Caixa delimitadora do ambiente inteiro, em mm de mundo — pontas de TODAS
// as paredes + o alcance dos módulos pra dentro do ambiente (senão um
// módulo fundo cortaria fora do desenho). Devolve null sem parede nenhuma
// (hasLayout já filtra isso antes de chamar, mas fica a prova de bala).
const PROPOSAL_ROOM_MARGIN_MM = 220;
function proposalRoomBoundsMm(walls, items) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  const consider = (x, z) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); };
  (walls || []).forEach((w) => {
    consider(w.originXMm, w.originZMm);
    const bx = w.originXMm + w.alongDirX * w.widthMm, bz = w.originZMm + w.alongDirZ * w.widthMm;
    consider(bx, bz);
    const wallItems = proposalItemsOnWall(items, w.wallIndex);
    const reachMm = wallItems.reduce((max, it) => Math.max(max, Number(it.depth_mm || 0)), 300) + w.thicknessMm;
    consider(w.originXMm + w.intoDirX * reachMm, w.originZMm + w.intoDirZ * reachMm);
    consider(bx + w.intoDirX * reachMm, bz + w.intoDirZ * reachMm);
  });
  if (!isFinite(minX)) return null;
  return { minX: minX - PROPOSAL_ROOM_MARGIN_MM, maxX: maxX + PROPOSAL_ROOM_MARGIN_MM, minZ: minZ - PROPOSAL_ROOM_MARGIN_MM, maxZ: maxZ + PROPOSAL_ROOM_MARGIN_MM };
}

// Preenche/traça um polígono (fechado) a partir de uma lista de pontos JÁ
// EM COORDENADA DE PÁGINA — jsPDF não tem "polígono de N pontos" pronto,
// mas doc.lines() aceita uma sequência de deltas a partir de um ponto
// inicial e fecha sozinho (closed=true) voltando pro início.
function proposalFillQuad(doc, pts, style) {
  if (!pts || pts.length < 3) return;
  const segs = [];
  for (let i = 1; i < pts.length; i++) segs.push([pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y]);
  doc.lines(segs, pts[0].x, pts[0].y, [1, 1], style || 'S', true);
}

function proposalDrawUnifiedFloorPlan(doc, walls, items, originPageX, originPageY, maxW, maxH, pdfUnit) {
  const bounds = proposalRoomBoundsMm(walls, items);
  if (!bounds) return originPageY;
  const bboxWMm = Math.max(1, bounds.maxX - bounds.minX);
  const bboxHMm = Math.max(1, bounds.maxZ - bounds.minZ);
  const scale = Math.min(maxW / bboxWMm, maxH / bboxHMm);
  const toPage = (xMm, zMm) => ({ x: originPageX + (xMm - bounds.minX) * scale, y: originPageY + (zMm - bounds.minZ) * scale });

  // Paredes — tira cheia, espessura de verdade, cantos conectados.
  walls.forEach((w) => {
    const ax = w.originXMm, az = w.originZMm;
    const bx = ax + w.alongDirX * w.widthMm, bz = az + w.alongDirZ * w.widthMm;
    const aOutX = ax - w.intoDirX * w.thicknessMm, aOutZ = az - w.intoDirZ * w.thicknessMm;
    const bOutX = bx - w.intoDirX * w.thicknessMm, bOutZ = bz - w.intoDirZ * w.thicknessMm;
    doc.setFillColor(200, 197, 190);
    proposalFillQuad(doc, [toPage(ax, az), toPage(bx, bz), toPage(bOutX, bOutZ), toPage(aOutX, aOutZ)], 'F');
  });

  // Módulos — base (cheio) primeiro, depois armário de parede (tracejado,
  // por cima, mesma faixa de piso — ver comentário grande acima).
  const drawTier = (isUpperTier) => {
    walls.forEach((w) => {
      proposalItemsOnWall(items, w.wallIndex)
        .filter((it) => (Number(it.project_placement.floor_height_mm || 0) > PROPOSAL_WALL_CABINET_HEIGHT_MM) === isUpperTier)
        .forEach((it) => {
          const p = it.project_placement;
          const a0 = Number(p.x_mm || 0), a1 = a0 + Number(it.width_mm || 0);
          const n0 = 0, n1 = Number(it.depth_mm || 0);
          const corner = (a, n) => toPage(w.originXMm + w.alongDirX * a + w.intoDirX * n, w.originZMm + w.alongDirZ * a + w.intoDirZ * n);
          const pts = [corner(a0, n0), corner(a1, n0), corner(a1, n1), corner(a0, n1)];
          doc.setDrawColor.apply(doc, PROPOSAL_COLOR_ACCENT);
          doc.setLineWidth(0.25);
          if (isUpperTier) {
            doc.setLineDashPattern([0.9, 0.7], 0);
            proposalFillQuad(doc, pts, 'S');
            doc.setLineDashPattern([], 0);
          } else {
            doc.setFillColor.apply(doc, PROPOSAL_COLOR_CARD_FILL);
            proposalFillQuad(doc, pts, 'FD');
          }
          if (it._num) proposalNumberBadge(doc, pts[0].x + 2.4, pts[0].y + 2.4, 1.7, it._num);
        });
    });
  };
  drawTier(false);
  drawTier(true);

  // Cotas — marca de limite (tick) em cada fronteira de módulo + 1 texto de
  // comprimento total por parede. Deliberadamente MAIS LEVE que a cota
  // corrida da elevação (proposalDimAssignRows) — foi exatamente o texto
  // segmentado empilhado que amontoou antes (relato do usuário: "muito
  // amontuado os valores sem visibilidade"); aqui, sem texto por segmento,
  // não tem como colidir.
  doc.setFont('helvetica', 'normal');
  walls.forEach((w) => {
    const wallItems = proposalItemsOnWall(items, w.wallIndex);
    const outX = -w.intoDirX, outZ = -w.intoDirZ; // sentido pra FORA do ambiente
    const tickReachMm = w.thicknessMm + 6 / scale;
    const boundariesMm = Array.from(new Set(wallItems.flatMap((it) => {
      const x0 = Math.round(Number(it.project_placement.x_mm || 0));
      return [x0, Math.round(x0 + Number(it.width_mm || 0))];
    }).concat([0, Math.round(w.widthMm)]))).sort((a, b) => a - b);
    doc.setDrawColor.apply(doc, PROPOSAL_COLOR_MUTED);
    doc.setLineWidth(0.12);
    boundariesMm.forEach((a) => {
      const baseX = w.originXMm + w.alongDirX * a, baseZ = w.originZMm + w.alongDirZ * a;
      const tipX = baseX + outX * tickReachMm, tipZ = baseZ + outZ * tickReachMm;
      const pA = toPage(baseX, baseZ), pB = toPage(tipX, tipZ);
      doc.line(pA.x, pA.y, pB.x, pB.y);
    });
    const vertical = Math.abs(w.alongDirZ) > Math.abs(w.alongDirX);
    const labelReachMm = w.thicknessMm + 11 / scale;

    // Nome da parede — perto do INÍCIO dela (a = pouco depois da ponta,
    // pra não empilhar em cima da marca de limite do canto), mesmo texto
    // "Parede N" que a Elevação já usa (proposal.wall_label), pra bater com
    // o resto da Proposta.
    const nameA = Math.min(w.widthMm * 0.22, 55);
    const nameX = w.originXMm + w.alongDirX * nameA + outX * labelReachMm;
    const nameZ = w.originZMm + w.alongDirZ * nameA + outZ * labelReachMm;
    const pName = toPage(nameX, nameZ);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor.apply(doc, PROPOSAL_COLOR_TEXT);
    doc.text(I18n.t('proposal.wall_label', { n: w.displayIndex }), pName.x, pName.y, { align: 'center', baseline: 'middle', angle: vertical ? 90 : 0 });
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0);

    // Comprimento total — no MEIO da parede, texto único, sem vizinho pra
    // colidir (nem com o nome, que fica perto da ponta).
    const midA = w.widthMm / 2;
    const labelX = w.originXMm + w.alongDirX * midA + outX * labelReachMm;
    const labelZ = w.originZMm + w.alongDirZ * midA + outZ * labelReachMm;
    const pLabel = toPage(labelX, labelZ);
    doc.setFontSize(7);
    doc.setTextColor.apply(doc, PROPOSAL_COLOR_MUTED);
    doc.text(formatDimension(w.widthMm, pdfUnit), pLabel.x, pLabel.y, { align: 'center', baseline: 'middle', angle: vertical ? 90 : 0 });
    doc.setTextColor(0);
  });

  return originPageY + bboxHMm * scale + 10;
}

const orderDetailProposalBtnEl = document.getElementById('po-order-detail-proposal-btn');
if (orderDetailProposalBtnEl) {
  orderDetailProposalBtnEl.addEventListener('click', () => {
    if (!currentOrderDetail) return;
    generateOrderProposalPDF(currentOrderDetail.order, currentOrderDetail.items);
  });
}

// ---------- Proposta direto da aba Projetos (sem precisar enviar pro pedido) ----------
// Pedido do usuário, 2ª rodada (2026-08-24): "pode colocar o botao la na
// tela do projeto mesmo la em cima inclusive." Monta um "pedido" (order) e
// uma lista de itens ao vivo, no MESMO formato que sendProjectToOrder
// (portal-08) grava no banco — sem inserir nada, é só uma prévia — e
// reaproveita o mesmo gerador. Sem projeto salvo com Photoreal/miniatura, o
// snapshot é gerado na hora (captureProjectThumbnail, portal-09).

// ASYNC desde 2026-08-26 (Matt: "na proposta nem no pedido ta aparecendo
// os modulos no icones") — antes lia só `slot.thumbnail_data_url || null`,
// que é SEMPRE null pra um módulo da aba Projetos (nunca é calculado nesse
// fluxo, só zerado — ver renderProjectSlotThumbnailFallback, portal-08),
// então a prévia de Proposta gerada direto da aba Projetos saía com TODOS
// os ícones em branco, sem exceção nenhuma. Agora reaproveita o mesmo
// fallback de render que "Enviar pro pedido" já usava.
async function buildProposalItemFromSlot(slot) {
  return {
    module_name: slot.module.name,
    selected_colors: slot.selectedColors,
    width_mm: slot.width_mm,
    height_mm: slot.height_mm,
    depth_mm: slot.depth_mm,
    quantity: 1,
    total_price: (slot.result && slot.result.total) || 0,
    thumbnail_data_url: await renderProjectSlotThumbnailFallback(slot),
    project_placement: {
      wall_index: Number(slot.wall_index || 0),
      x_mm: Number(slot.x_mm || 0),
      floor_height_mm: Number(slot.floor_height_mm || 0),
      z_order: Number(slot.z_order || 0)
    }
  };
}

async function generateProjectProposalPDF() {
  const errorEl = document.getElementById('po-proj-error');
  if (errorEl) errorEl.style.display = 'none';
  if (!projectSlots.length) {
    if (errorEl) { errorEl.textContent = I18n.t('proposal.empty_error'); errorEl.style.display = 'block'; }
    return;
  }
  const btn = document.getElementById('po-proj-proposal-btn');
  const originalLabel = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = I18n.t('proposal.generating'); }
  try {
    const liveOrder = {
      po_name: loadedProjectFavorite ? loadedProjectFavorite.name : null,
      client_name: null,
      submitted_at: null,
      wall_shape: projectWallShape,
      wall_widths_mm: (projectWallWidthsMm || []).slice(),
      wall_segments: projectWallSegments.length ? projectWallSegments : null,
      project_photoreal_url: (loadedProjectFavorite && loadedProjectFavorite.ai_preview_url) || null,
      project_photoreal_urls: (projectPhotorealPhotos || []).map((p) => p.image_url).filter(Boolean),
      project_thumbnail_data_url: null
    };
    if (!liveOrder.project_photoreal_url) {
      try { liveOrder.project_thumbnail_data_url = await captureProjectThumbnail(); } catch (e) { /* segue sem render — a Proposta avisa na seção */ }
    }
    // Sequencial de propósito (não Promise.all) — renderProjectSlotThumbnailFallback
    // reaproveita o MESMO viewer escondido (singleton) pra cada módulo sem
    // thumbnail salvo; rodar em paralelo faria um render pisar no outro.
    const liveItems = [];
    for (const slot of projectSlots) {
      liveItems.push(await buildProposalItemFromSlot(slot));
    }
    await generateOrderProposalPDF(liveOrder, liveItems);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = originalLabel; }
  }
}

const projProposalBtnEl = document.getElementById('po-proj-proposal-btn');
if (projProposalBtnEl) {
  projProposalBtnEl.addEventListener('click', () => generateProjectProposalPDF());
}
