// portal-05-cutlist.js — parte 5/9 de js/portal.js (ver portal-01-core-catalogo.js).
// Aba "Plano de Corte" (cutlist manual do lojista/cliente avançado) +
// configuração de conta Dealer (margem de revenda, logo, modo de visualização).

// Comprimento/Largura da planilha de Plano de Corte seguem a unidade GLOBAL
// do portal (po-unit-select — mm/cm/m/ft/polegada fracionada 1/32", mesma
// preferência já usada em largura/altura/profundidade do módulo) — pedido do
// usuário 2026-08-02: "preciso que o cutting list funciona com polegada
// fracionada tambem, conforme preferencia de cada usuario". O valor em MM
// (row.comprimento_mm/largura_mm) continua sendo a fonte da verdade pra
// preço/nesting/banco — só a caixa de texto exibida muda.
function cutlistFormatFieldValue(mm, unit) {
  const n = Number(mm);
  if (mm === '' || mm == null || !Number.isFinite(n)) return '';
  return formatDimensionNumber(n, unit);
}

// Só CONFIRMA (parseDimensionInput) se o texto digitado for válido na
// unidade atual — string inválida/incompleta não sobrescreve o valor em mm
// já commitado (evita zerar a peça por causa de um clique de blur no meio da
// digitação de uma fração, ex. "15 1/1" ainda incompleto).
function commitCutlistDimensionInput(row, field, rawValue) {
  const unit = (document.getElementById('po-unit-select') || {}).value || 'mm';
  const mm = parseDimensionInput(rawValue, unit);
  if (mm !== null && !isNaN(mm)) row[field] = mm;
}

// Cabeçalho ("Comprimento (in)"/"Largura (in)") e hint de limites
// (cutlist.size_limits_hint) acompanham a unidade escolhida — chamada no
// início de renderCutlistTable() e também quando o cliente troca a unidade
// global (ver refreshAllUnitDependentViews) mesmo sem nenhuma linha ainda.
function updateCutlistUnitLabels(unit) {
  const resolvedUnit = unit || (document.getElementById('po-unit-select') || {}).value || 'mm';
  const abbr = unitAbbrev(resolvedUnit);
  const lenEl = document.getElementById('po-cutlist-length-unit');
  const widEl = document.getElementById('po-cutlist-width-unit');
  if (lenEl) lenEl.textContent = `(${abbr})`;
  if (widEl) widEl.textContent = `(${abbr})`;
  const hintEl = document.getElementById('po-cutlist-size-limits-hint');
  if (hintEl) {
    hintEl.textContent = I18n.t('cutlist.size_limits_hint', {
      lenMin: formatDimension(CUTLIST_COMPRIMENTO_MIN, resolvedUnit),
      lenMax: formatDimension(CUTLIST_COMPRIMENTO_MAX, resolvedUnit),
      widMin: formatDimension(CUTLIST_LARGURA_MIN, resolvedUnit),
      widMax: formatDimension(CUTLIST_LARGURA_MAX, resolvedUnit)
    });
  }
}

// Garante que o cliente logado tem uma linha em user_profiles. Só consegue
// CRIAR a própria linha com role='cliente' (policy "self insert own profile
// as cliente") — quem promove pra lojista/contractor/administrador é
// sempre o admin (admin.html, aba Perfis). Falha silenciosa (perfil
// continua null, aba Plano de Corte fica escondida) se a tabela ainda não
// existir ou der erro de rede — não deve travar o login.
async function ensureOwnUserProfile() {
  try {
    const { data, error } = await supabaseClient.from('user_profiles').select('*').eq('user_id', currentUser.id).maybeSingle();
    if (error) return;
    if (data) { currentUserProfile = data; return; }
    const { data: inserted, error: insertError } = await supabaseClient
      .from('user_profiles')
      .insert({ user_id: currentUser.id, email: currentUser.email })
      .select()
      .single();
    if (!insertError && inserted) currentUserProfile = inserted;
  } catch (err) {
    // silencioso — ver comentário acima
  }
}

// "Controle de uso" (migration 149, pedido do Matt 02/09/2026: "quero
// controlar quem esta usando o sistema... por usuario ativo talvez").
// Painel simples de atividade — sem número de série nem limite de
// assentos, só "última atividade" visível pro admin (ERP,
// erp/js/adm/03-usuarios.js) e pro dealer na lista de vendedores
// (loadDealerTeamList acima). Fire-and-forget, sempre que o portal loga —
// nunca deve travar nem atrasar o login se falhar (rede, RLS, etc.).
function touchLastActive() {
  if (!currentUser) return;
  supabaseClient.from('user_profiles')
    .update({ last_active_at: new Date().toISOString() })
    .eq('user_id', currentUser.id)
    .then(() => {}, () => {});
}

// "Quem está online agora" (pedido do Matt 2026-09-04) — sem isto,
// last_active_at só era gravado UMA VEZ no login (acima), então quem
// estava com o portal aberto há mais de alguns minutos já aparecia como
// "offline" pro admin. Este heartbeat mantém a coluna fresca enquanto a
// aba estiver de fato aberta e em primeiro plano; a checagem de
// visibilityState evita gravar quando o usuário trocou de aba/minimizou
// (senão uma aba esquecida aberta parece "online" pra sempre). O admin
// (Central de Contatos, erp/js/screens-contatos.js) considera "online" um
// last_active_at dentro dos últimos 5 minutos — o intervalo de 2 min aqui
// dá folga de sobra pra essa janela sem gerar tráfego demais.
let activityHeartbeatTimer = null;
const ACTIVITY_HEARTBEAT_MS = 120000;
function startActivityHeartbeat() {
  if (activityHeartbeatTimer) return; // já rodando — não duplica em re-login sem reload de página
  activityHeartbeatTimer = setInterval(function () {
    if (document.visibilityState === 'visible') touchLastActive();
  }, ACTIVITY_HEARTBEAT_MS);
}

function canUseCuttingList() {
  if (!currentUserProfile) return false;
  if (currentUserProfile.role === 'contractor' || currentUserProfile.role === 'administrador') return true;
  // Dealer (lojista) — migration 072 (2026-08-02) só liberava com o toggle
  // do cabeçalho em modo "Legno". Toggle DESABILITADO (2026-09-03, pedido
  // do usuário: "essa troca que pedi de um pra outro nao faz mais sentido,
  // pode desabilitar e coloca o cuting list aberto pro dealer") — Plano de
  // Corte fica sempre visível pro dealer agora, sem depender de
  // portalViewMode (ver loadPortalViewMode/refreshDealerUiVisibility
  // abaixo, que travaram portalViewMode em 'dealer' e escondem o toggle).
  if (currentUserProfile.role === 'lojista') return true;
  return false;
}

// Margem geral de revenda (migration 072, pedido do usuário 2026-08-02) —
// self-service, o próprio cliente define no menu de Configurações. Só usada
// em EXIBIÇÃO (Galeria, Meus Projetos) — nunca entra em cálculo de pedido
// nem aparece em Meus Pedidos.
// Vendedor (migration 149, "vendedores so veem preco de venda loja") não
// tem margem própria — vê a do DEALER dono da loja. is_my_seller/
// get_display_resale_margin_pct (RPC, security definer) resolvem isso no
// banco sem o vendedor precisar ler a linha do dealer diretamente.
function isSellerAccount() {
  return !!currentUserProfile && currentUserProfile.role === 'vendedor';
}

// Cache síncrono do valor resolvido pela RPC abaixo — getResaleMarginPct()
// continua síncrona pros ~30 call sites que já dependiam dela (Galeria,
// Meus Projetos, Proposta, plano de corte). Populado 1x no login
// (resolveDisplayMarginPct, chamada em showLoggedIn logo depois de
// ensureOwnUserProfile) e atualizado na hora quando o próprio cliente
// salva uma margem nova (saveResaleMarginPct abaixo).
let resolvedDisplayMarginPct = 0;

// RPC get_display_resale_margin_pct (migration 149): pra qualquer perfil
// que NÃO é vendedor, devolve a PRÓPRIA margem (resale_margin_pct) — igual
// ao comportamento de sempre (migration 072). Pra vendedor, devolve a
// margem do DEALER dono da loja dele — o vendedor nunca lê a linha inteira
// do dealer (que teria e-mail e outros dados), só este número já calculado.
async function resolveDisplayMarginPct() {
  try {
    const { data, error } = await supabaseClient.rpc('get_display_resale_margin_pct');
    resolvedDisplayMarginPct = (!error && Number.isFinite(Number(data)) && Number(data) > 0) ? Number(data) : 0;
  } catch (err) {
    resolvedDisplayMarginPct = 0;
  }
}

function getResaleMarginPct() {
  return resolvedDisplayMarginPct;
}

// Preço a EXIBIR pro usuário logado a partir de um valor de VENDA (preço de
// fábrica) já calculado — pra vendedor, isto É o "preço de venda loja"
// (nunca vê o valor cru sem a margem do dealer aplicada); pra quem tem
// margem própria configurada, é o mesmo "preço de revenda sugerido" de
// sempre; sem margem nenhuma, cai no próprio valor de fábrica (comportamento
// idêntico a hoje).
function getDisplayPrice(saleValue) {
  // Migration 151 (2026-09-03): antes a margem entrava direto sobre
  // saleValue (preço de fábrica cru); agora entra sobre computeCustoBase()
  // (preço de fábrica já com desconto de fábrica + extras de custo do
  // dealer aplicados — ver comentário de escopo acima de
  // computeCustoBase). Pra quem não é dealer com desconto/extras
  // configurados, computeCustoBase(saleValue) === saleValue, então o
  // resultado fica idêntico a antes desta migration.
  const tableValue = Number(saleValue) || 0;
  const custoBase = computeCustoBase(tableValue);
  const marginPct = getResaleMarginPct();
  const withMargin = marginPct > 0 ? custoBase * (1 + marginPct / 100) : custoBase;
  return applyPricingExtras(withMargin, tableValue, resolveDealerPricingExtras('margem'));
}

// Versão "só proporcional" de getDisplayPrice() — aplica desconto de
// fábrica (%) + margem (%) + extras PERCENTUAIS dos dois lados, mas NUNCA
// um extra em $ FIXO. Only pra quando o MESMO cálculo roda várias vezes
// sobre PARTES de um todo (hoje, só o preço por item da Proposta/PDF antes
// do total, ver portal-10-proposta.js) — um extra fixo (ex. "frete $50")
// tem que entrar UMA VEZ só, no TOTAL; se cada item chamasse
// getDisplayPrice() (que inclui o fixo), "frete $50" viraria "$50 × nº de
// itens". getDisplayPrice() continua sendo a função certa pra qualquer
// valor que já seja um AGREGADO (projeto inteiro, post da Galeria, total
// final da Proposta) — só itens individuais de uma lista precisam desta
// variante.
function getDisplayPriceRatioOnly(saleValue) {
  const tableValue = Number(saleValue) || 0;
  const discountPct = getFactoryDiscountPct();
  const custoExtrasPctOnly = resolveDealerPricingExtras('custo').filter((extra) => extra.kind !== 'fixed');
  const custoBase = applyPricingExtras(tableValue * (1 - discountPct / 100), tableValue, custoExtrasPctOnly);
  const marginPct = getResaleMarginPct();
  const withMargin = marginPct > 0 ? custoBase * (1 + marginPct / 100) : custoBase;
  const margemExtrasPctOnly = resolveDealerPricingExtras('margem').filter((extra) => extra.kind !== 'fixed');
  return applyPricingExtras(withMargin, tableValue, margemExtrasPctOnly);
}

// Linha antiga de "Margem geral de revenda" nas Configurações — ESCONDIDA
// pra TODO perfil (migration 151, 2026-09-03, pedido do usuário: "essa
// margem tem que tirar fora"), substituída pelo campo "Margem bruta (%)"
// dentro do modal Margens (#po-margins-btn, isDealer()-only). Antes só
// escondia pra vendedor (isSellerAccount(), migration 149) — o campo
// #po-resale-margin-input continua existindo e funcionando por baixo
// (mesma coluna resale_margin_pct), só não tem mais UI própria aqui.
function refreshResaleMarginRowVisibility() {
  const row = document.getElementById('po-resale-margin-row');
  if (row) row.style.display = 'none';
}

function refreshResaleMarginInput() {
  refreshResaleMarginRowVisibility();
  const input = document.getElementById('po-resale-margin-input');
  if (input) input.value = getResaleMarginPct() || '';
}

// Persiste a margem digitada pelo cliente (botão "Salvar" do menu de
// Configurações). Update direto em user_profiles — permitido pela policy
// "self update own user_profiles" (migration 072); o trigger
// prevent_self_profile_tampering bloqueia qualquer tentativa de mudar
// role/email/user_id por essa via, então este update só pode afetar mesmo
// a margem. Falha silenciosa (mesmo padrão de ensureOwnUserProfile) — não
// deve travar o resto do botão Salvar (refresh do canvas etc.).
async function saveResaleMarginPct() {
  const input = document.getElementById('po-resale-margin-input');
  if (!input || !currentUser) return;
  let value = Number(input.value);
  if (!Number.isFinite(value) || value < 0) value = 0;
  try {
    const { data, error } = await supabaseClient
      .from('user_profiles')
      .update({ resale_margin_pct: value })
      .eq('user_id', currentUser.id)
      .select()
      .single();
    if (!error && data) { currentUserProfile = data; resolvedDisplayMarginPct = Number(data.resale_margin_pct) || 0; }
  } catch (err) {
    // silencioso — ver comentário acima
  }
}

// ---------- DESCONTO DE FÁBRICA + EXTRAS DO DEALER (migration 151, 2026-09-03) ----------
// Pedido do Matt: "preciso uma configuracao de desconto de fabrica...
// aplicado no valor de fabrica, que vira base de custo para ai sim a
// margem do dealer ser acrecentada em cima... novo botao de margens na
// barra (so habilita pra dealer) nao pra vendedores... custo fabrica:
// tabela - desconto, extra tipo frete/tax que pode diminuir ou aumentar...
// margem do lojista: margem bruta + extras tipo comissao/montagem/tax/
// outros". Confirmado via AskUserQuestion: por dealer, self-service, sem
// senha extra por dealer, extras em % OU valor fixo em $.
//
// Extensão do getDisplayPrice/getResaleMarginPct já existente (migration
// 072) — MESMO escopo/risco: só afeta EXIBIÇÃO (Galeria, Meus Projetos,
// modal $ Orçamento, canvas, Proposta). Nunca entra em
// carrinho/checkout/Meus Pedidos (mesmo precedente documentado da
// migration 072).
//
// Escopo deliberado (pedido explícito "nao pra vendedores"): diferente da
// margem de revenda (que o vendedor HERDA do dealer via RPC
// get_display_resale_margin_pct), o desconto de fábrica e os extras são
// EXCLUSIVOS de quem está logado como o próprio dealer (isDealer()) — o
// vendedor não configura nem herda nada disso. getFactoryDiscountPct() e
// resolveDealerPricingExtras() devolvem 0/[] pra qualquer perfil que não
// seja isDealer(), então o cálculo do vendedor (e do cliente final) fica
// bit-a-bit idêntico a antes desta migration.
//
// Cache síncrono, mesmo padrão de resolvedDisplayMarginPct: populado em
// loadDealerPricingConfig() (chamada de refreshDealerUiVisibility, junto
// de loadDealerTeamList) e atualizado na hora quando o dealer salva no
// modal de Margens (ver po-margins-modal, portal-06b).
let dealerFactoryDiscountPct = 0;
let dealerPricingExtras = []; // linhas de dealer_pricing_extras já carregadas (cache)

function getFactoryDiscountPct() {
  return isDealer() ? (Number(dealerFactoryDiscountPct) || 0) : 0;
}

// Extras de um lado ('custo' = custo de fábrica, 'margem' = margem do
// lojista) já carregados em cache — ver comentário de escopo acima (só
// dealer, nunca vendedor).
function resolveDealerPricingExtras(side) {
  if (!isDealer()) return [];
  return dealerPricingExtras.filter((row) => row.side === side);
}

// Carrega o desconto de fábrica (coluna nova em user_profiles) + os extras
// (tabela nova dealer_pricing_extras, migration 151) — só pra dealer
// (isDealer()); qualquer outro perfil fica com os arrays/números zerados
// (ver escopo acima). Chamada de refreshDealerUiVisibility (mesmo gancho
// de loadDealerTeamList, já roda 1x no login) e de novo depois de qualquer
// salvamento no modal de Margens. Falha silenciosa — mesmo padrão do resto
// deste arquivo (ensureOwnUserProfile etc.), não deve travar o login.
async function loadDealerPricingConfig() {
  if (!isDealer() || !currentUser) { dealerFactoryDiscountPct = 0; dealerPricingExtras = []; return; }
  try {
    dealerFactoryDiscountPct = Number(currentUserProfile && currentUserProfile.factory_discount_pct) || 0;
    const { data, error } = await supabaseClient
      .from('dealer_pricing_extras')
      .select('*')
      .eq('dealer_user_id', currentUser.id)
      .order('sort_order', { ascending: true });
    dealerPricingExtras = (!error && Array.isArray(data)) ? data : [];
  } catch (err) {
    dealerPricingExtras = [];
  }
}

// Aplica uma lista de extras (mesmo lado) sobre um valor de base — cada
// extra soma OU subtrai, em % (sempre sobre o valor de TABELA original,
// nunca composto em cima de outro extra já aplicado — cada linha fica
// independente e fácil de auditar/bater com a tela) ou em $ fixo.
// tableValue é sempre o preço de fábrica CRU (antes de desconto/margem) —
// é a base dos extras percentuais dos dois lados.
function applyPricingExtras(baseValue, tableValue, extras) {
  let result = Number(baseValue) || 0;
  (extras || []).forEach((extra) => {
    const amount = extra.kind === 'fixed'
      ? (Number(extra.value) || 0)
      : (Number(tableValue) || 0) * (Number(extra.value) || 0) / 100;
    result += extra.sign === 'subtract' ? -amount : amount;
  });
  return result;
}

// CUSTO DE FÁBRICA = preço de tabela − desconto de fábrica (%) + extras do
// lado 'custo' (frete/tax/extra). Essa é a NOVA base de custo sobre a qual
// a margem do lojista é acrescentada em getDisplayPrice() abaixo. Pra quem
// não é dealer, ou é dealer sem nada configurado ainda, devolve o próprio
// saleValue sem alteração (getFactoryDiscountPct()===0 e extras===[] fazem
// disso um no-op matemático — comportamento idêntico a antes desta
// migration).
function computeCustoBase(saleValue) {
  const tableValue = Number(saleValue) || 0;
  const discountPct = getFactoryDiscountPct();
  const afterDiscount = tableValue * (1 - discountPct / 100);
  return applyPricingExtras(afterDiscount, tableValue, resolveDealerPricingExtras('custo'));
}

// ---------- PORTAL DEALER (migration 075, 2026-08-02) ----------
// "DEALER" reaproveita o role 'lojista' (user_profiles, migration 051) — só
// ganhou comportamento de verdade agora. Self-service: o próprio dealer
// envia a logo e escolhe, num toggle no cabeçalho, se quer ver o portal com
// a marca Legno ou com a própria marca — pensado pra abrir na frente do
// cliente final numa visita técnica sem precisar sair da tela. Estado do
// toggle vive só no localStorage do navegador (não é coluna do banco) —
// cada dispositivo lembra a última escolha, não precisa ida ao banco.
const PORTAL_VIEW_MODE_STORAGE_KEY = 'legno_portal_view_mode';
let portalViewMode = 'legno';

function isDealer() {
  return !!currentUserProfile && currentUserProfile.role === 'lojista';
}

// Quem pode gerar Proposta (PDF) + configurar a marca (logo/dados da loja)
// que aparece nela — pedido do usuário 2026-08-24: "habilita gerar proposta
// pro administrador e pro lojista/contractor tambem". Nasceu só pra
// isDealer() (role 'lojista'); passa a incluir 'administrador' e
// 'contractor' também. NÃO mexe no toggle "ver como Dealer" (rebranding ao
// vivo do cabeçalho pra apresentar pro cliente final na hora) nem em
// portalViewMode — isso continua exclusivo de isDealer(), não foi pedido.
function canGenerateProposal() {
  if (!currentUserProfile) return false;
  const role = currentUserProfile.role;
  return role === 'lojista' || role === 'contractor' || role === 'administrador';
}

// Toggle Legno/Dealer DESABILITADO (2026-09-03, pedido do usuário: "essa
// troca que pedi de um pra outro nao faz mais sentido, pode desabilitar...
// e tira opcao da legno") — dealer (isDealer()) fica SEMPRE travado em
// modo 'dealer' (própria marca), sem opção de trocar pra 'legno' e sem ler
// mais o localStorage (setPortalViewMode/os botões continuam no código,
// só ficam inalcançáveis — o toggle inteiro está escondido, ver
// refreshDealerUiVisibility). Qualquer outro perfil nunca teve o toggle,
// continua em 'legno' de sempre.
function loadPortalViewMode() {
  portalViewMode = isDealer() ? 'dealer' : 'legno';
}

function setPortalViewMode(mode) {
  const next = (mode === 'dealer' && isDealer()) ? 'dealer' : 'legno';
  const changed = next !== portalViewMode;
  portalViewMode = next;
  localStorage.setItem(PORTAL_VIEW_MODE_STORAGE_KEY, next);
  applyPortalViewMode();
  applyCuttingListTabVisibility();
  // Galeria muda de escopo (pública vs só os próprios posts) conforme o
  // modo — recarrega se a aba já foi aberta ao menos uma vez nesta sessão.
  if (changed && Array.isArray(galleryPostsCache)) loadGalleryList();
}

// Troca a logo do cabeçalho (wordmark LEGNO vs imagem própria do dealer) e
// os botões ativos do toggle. Chamado no login e a cada clique no toggle.
function applyPortalViewMode() {
  const legnoBtn = document.getElementById('po-portal-mode-legno-btn');
  const dealerBtn = document.getElementById('po-portal-mode-dealer-btn');
  if (legnoBtn) legnoBtn.classList.toggle('active', portalViewMode === 'legno');
  if (dealerBtn) dealerBtn.classList.toggle('active', portalViewMode === 'dealer');

  const dealerImg = document.getElementById('po-logo-dealer-img');
  const mainText = document.getElementById('po-logo-main-text');
  const subText = document.getElementById('po-logo-sub-text');
  const logoUrl = currentUserProfile && currentUserProfile.logo_url;
  // Modo Dealer SEM logo enviada ainda cai no fallback do wordmark Legno —
  // o cabeçalho nunca fica vazio.
  const showDealerLogo = portalViewMode === 'dealer' && !!logoUrl;
  if (dealerImg) {
    dealerImg.src = showDealerLogo ? logoUrl : '';
    dealerImg.style.display = showDealerLogo ? 'block' : 'none';
  }
  if (mainText) mainText.style.display = showDealerLogo ? 'none' : '';
  if (subText) subText.style.display = showDealerLogo ? 'none' : '';
}

function setupPortalModeToggle() {
  const legnoBtn = document.getElementById('po-portal-mode-legno-btn');
  const dealerBtn = document.getElementById('po-portal-mode-dealer-btn');
  if (legnoBtn) legnoBtn.addEventListener('click', () => setPortalViewMode('legno'));
  if (dealerBtn) dealerBtn.addEventListener('click', () => setPortalViewMode('dealer'));
}
setupPortalModeToggle();

// Mostra/esconde o toggle do cabeçalho (só role='lojista', rebranding ao
// vivo pra apresentar pro cliente final) + os campos de logo/dados da loja
// nas Configurações (role='lojista'/'contractor'/'administrador' — ver
// canGenerateProposal acima, ampliado 2026-08-24 pra esses 2 usarem os
// mesmos campos na Proposta). Chamado em showLoggedIn (depois de
// ensureOwnUserProfile, precisa do role já carregado) e em showLoggedOut
// (esconde tudo de novo pro visitante).
function refreshDealerUiVisibility() {
  const toggleEl = document.getElementById('po-portal-mode-toggle');
  const logoRowEl = document.getElementById('po-dealer-logo-settings-row');
  const storeInfoRowEl = document.getElementById('po-dealer-store-info-row');
  const teamRowEl = document.getElementById('po-dealer-team-row');
  // Botão "Margens" (migration 151, 2026-09-03) — desconto de fábrica +
  // extras, mesmo critério de visibilidade do toggle Dealer (só
  // isDealer(), NÃO canGenerateProposal(): vendedor/contractor/admin não
  // configuram isso, ver comentário de escopo em getFactoryDiscountPct,
  // portal-05-cutlist.js).
  const margensBtnEl = document.getElementById('po-margins-btn');
  const dealer = isDealer();
  const canBrand = canGenerateProposal();
  // Toggle Legno/Dealer sempre escondido (ver loadPortalViewMode acima) —
  // dealer fica travado em modo 'dealer', não precisa mais de UI pra
  // trocar.
  if (toggleEl) toggleEl.style.display = 'none';
  if (logoRowEl) logoRowEl.style.display = canBrand ? '' : 'none';
  if (storeInfoRowEl) storeInfoRowEl.style.display = canBrand ? '' : 'none';
  if (teamRowEl) teamRowEl.style.display = dealer ? '' : 'none';
  if (margensBtnEl) margensBtnEl.style.display = dealer ? '' : 'none';
  loadPortalViewMode();
  applyPortalViewMode();
  refreshDealerLogoPreview();
  refreshDealerStoreInfoInputs();
  if (dealer) loadDealerTeamList();
  loadDealerPricingConfig().then(() => { if (typeof renderMarginsModal === 'function') renderMarginsModal(); });
}

// ---------- MINHA EQUIPE / VENDEDORES (migration 149, 2026-09-02) ----------
// "preciso tambem de uma estrutura com mais niveis pros dealers (lojas)
// por exmeplo ter o dono e abaixo os vendedores (dono exerga valores de
// fabrica, margens, e enxerga todos os projetos dos vendedores. e talvez
// algum dashbord com os dados por vendedor". Confirmado: o PRÓPRIO dealer
// cria a conta do vendedor (Edge Function dealer-create-seller — checa
// role='lojista' de verdade no servidor antes de criar qualquer coisa).
//
// Lista de vendedores + contagem/valor de projetos: 2 queries em paralelo
// (mesmo padrão de loadProjectValueByUser no ERP, erp/js/adm/03-usuarios.js)
// — user_profiles filtrado por parent_dealer_user_id (RLS "dealer reads own
// sellers profiles" só deixa ver os PRÓPRIOS vendedores) + user_projects
// sem filtro (RLS "dealer reads own sellers user_projects" já devolve só
// os projetos dos vendedores dele, agrupados em JS por client_user_id).
async function loadDealerTeamList() {
  const listEl = document.getElementById('po-dealer-team-list');
  if (!listEl || !currentUser) return;
  listEl.textContent = I18n.t('nav.dealer_team_loading');
  try {
    const [{ data: sellers, error: sellersErr }, { data: projects, error: projErr }] = await Promise.all([
      supabaseClient.from('user_profiles')
        .select('user_id, email, full_name, created_at, last_active_at')
        .eq('parent_dealer_user_id', currentUser.id)
        .order('created_at', { ascending: false }),
      supabaseClient.from('user_projects').select('client_user_id, cached_value_usd')
    ]);
    if (sellersErr) { listEl.textContent = sellersErr.message; return; }
    const statsByUser = {};
    (projects || []).forEach((row) => {
      const key = row.client_user_id;
      if (!statsByUser[key]) statsByUser[key] = { count: 0, total: 0 };
      statsByUser[key].count += 1;
      statsByUser[key].total += Number(row.cached_value_usd) || 0;
    });
    if (!sellers || sellers.length === 0) {
      listEl.innerHTML = `<div class="hint">${I18n.t('nav.dealer_team_empty')}</div>`;
      return;
    }
    listEl.innerHTML = sellers.map((s) => {
      const stats = statsByUser[s.user_id] || { count: 0, total: 0 };
      const lastActive = s.last_active_at ? new Date(s.last_active_at).toLocaleDateString(currentLocale()) : '—';
      const nameOrEmail = (s.full_name || s.email || '').replace(/</g, '&lt;');
      return `<div class="po-dealer-team-item">
        <strong>${nameOrEmail}</strong>
        <span class="hint">${(s.email || '').replace(/</g, '&lt;')}</span>
        <span class="hint">${I18n.t('nav.dealer_team_projects_count', { n: stats.count })} · ${formatGalleryPrice(stats.total)}</span>
        <span class="hint">${I18n.t('nav.dealer_team_last_active', { date: lastActive })}</span>
      </div>`;
    }).join('');
  } catch (err) {
    listEl.textContent = String((err && err.message) || err);
  }
}

// Criação self-service — mesmo padrão de tratamento de erro do
// admin-create-user (erp/js/adm/03-usuarios.js): supabase-js só popula
// `error` pra falha de rede/HTTP, uma resposta 4xx/5xx com corpo JSON
// {error:"..."} pode cair como FunctionsHttpError com o corpo real em
// error.context.
(function attachDealerCreateSellerForm() {
  const btn = document.getElementById('po-dealer-team-create-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const nameInput = document.getElementById('po-dealer-team-name-input');
    const emailInput = document.getElementById('po-dealer-team-email-input');
    const passwordInput = document.getElementById('po-dealer-team-password-input');
    const statusEl = document.getElementById('po-dealer-team-status');
    const full_name = (nameInput && nameInput.value || '').trim();
    const email = (emailInput && emailInput.value || '').trim();
    const password = (passwordInput && passwordInput.value) || '';
    if (statusEl) statusEl.textContent = I18n.t('nav.dealer_team_creating');
    try {
      const { data, error } = await supabaseClient.functions.invoke('dealer-create-seller', {
        body: { full_name, email, password }
      });
      if (error) {
        let msg = error.message || 'Erro ao criar vendedor.';
        if (error.context && typeof error.context.json === 'function') {
          try { const body = await error.context.json(); if (body && body.error) msg = body.error; } catch (_e) { /* mantém msg genérica */ }
        }
        throw new Error(msg);
      }
      if (data && data.error) throw new Error(data.error);
      if (statusEl) statusEl.textContent = I18n.t('nav.dealer_team_created', { email });
      if (nameInput) nameInput.value = '';
      if (emailInput) emailInput.value = '';
      if (passwordInput) passwordInput.value = '';
      loadDealerTeamList();
    } catch (err) {
      if (statusEl) statusEl.textContent = String((err && err.message) || err);
    }
  });
})();

function refreshDealerLogoPreview() {
  const preview = document.getElementById('po-dealer-logo-preview');
  if (!preview) return;
  const url = currentUserProfile && currentUserProfile.logo_url;
  preview.src = url || '';
  preview.style.display = url ? 'inline-block' : 'none';
}

// Nome/telefone da loja do dealer (migration 138) — pro cabeçalho da
// Proposta (PDF). Mesmo padrão de refreshResaleMarginInput/
// saveResaleMarginPct acima: preenche do perfil já carregado, persiste só
// quando o cliente clica "Salvar" no menu de Configurações (mesmo botão que
// já salva a margem de revenda — ver o listener em portal-01-core-catalogo.js).
function refreshDealerStoreInfoInputs() {
  const nameInput = document.getElementById('po-dealer-store-name-input');
  const phoneInput = document.getElementById('po-dealer-store-phone-input');
  if (nameInput) nameInput.value = (currentUserProfile && currentUserProfile.store_name) || '';
  if (phoneInput) phoneInput.value = (currentUserProfile && currentUserProfile.store_phone) || '';
}

async function saveDealerStoreInfo() {
  const nameInput = document.getElementById('po-dealer-store-name-input');
  const phoneInput = document.getElementById('po-dealer-store-phone-input');
  if (!currentUser || !canGenerateProposal()) return;
  try {
    const { data, error } = await supabaseClient
      .from('user_profiles')
      .update({
        store_name: (nameInput && nameInput.value.trim()) || null,
        store_phone: (phoneInput && phoneInput.value.trim()) || null
      })
      .eq('user_id', currentUser.id)
      .select()
      .single();
    if (!error && data) currentUserProfile = data;
  } catch (err) {
    // silencioso — mesmo padrão de saveResaleMarginPct acima
  }
}

// Envia o arquivo escolhido pro bucket 'dealer-logos' (path
// dealer-logos/{uid}/logo.<ext>, upsert — sempre sobrescreve a logo
// anterior do mesmo dealer), grava a URL pública em user_profiles.logo_url
// (mesma policy self-update da margem de revenda, migration 072 — o
// trigger prevent_self_profile_tampering só bloqueia role/email/user_id) e
// atualiza o cabeçalho na hora se já estiver em modo Dealer.
async function uploadDealerLogo(file) {
  const statusEl = document.getElementById('po-dealer-logo-status');
  if (!file || !currentUser) return;
  if (statusEl) statusEl.textContent = I18n.t('nav.dealer_logo_uploading');
  try {
    const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
    const path = `${currentUser.id}/logo.${ext}`;
    const { error: uploadError } = await supabaseClient.storage
      .from('dealer-logos')
      .upload(path, file, { upsert: true, cacheControl: '3600' });
    if (uploadError) throw uploadError;
    const { data: publicUrlData } = supabaseClient.storage.from('dealer-logos').getPublicUrl(path);
    // Cache-busting na URL salva — o path/URL pública em si não muda quando
    // faz upsert, senão o navegador (e o <img> do cabeçalho) continuaria
    // mostrando a logo antiga depois de trocar.
    const publicUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;
    const { data, error } = await supabaseClient
      .from('user_profiles')
      .update({ logo_url: publicUrl })
      .eq('user_id', currentUser.id)
      .select()
      .single();
    if (error) throw error;
    currentUserProfile = data;
    refreshDealerLogoPreview();
    applyPortalViewMode();
    if (statusEl) { statusEl.textContent = I18n.t('nav.dealer_logo_saved'); setTimeout(() => { statusEl.textContent = ''; }, 3000); }
  } catch (err) {
    if (statusEl) statusEl.textContent = (err && err.message) || String(err);
  }
}

const dealerLogoFileInputEl = document.getElementById('po-dealer-logo-file-input');
if (dealerLogoFileInputEl) {
  dealerLogoFileInputEl.addEventListener('change', () => {
    const file = dealerLogoFileInputEl.files && dealerLogoFileInputEl.files[0];
    if (file) uploadDealerLogo(file);
  });
}

function applyCuttingListTabVisibility() {
  const btn = document.getElementById('po-nav-tab-cutting-list');
  if (btn) btn.style.display = canUseCuttingList() ? '' : 'none';
}

// Margem/espessura/mão de obra do plano de corte (migration 051, estende
// pricing_settings da migration 037). Falha silenciosa mantém os defaults
// (multiplicador 1 = sem margem/acréscimo, mão de obra $0) se der erro.
async function loadCuttingListPricingSettings() {
  const { data, error } = await supabaseClient
    .from('pricing_settings')
    .select('cutting_list_markup_multiplier, cutting_list_thickness_38_multiplier, cutting_list_labor_price_per_piece')
    .eq('id', true)
    .single();
  if (error || !data) return;
  cutlistPricingSettings = {
    cutting_list_markup_multiplier: Number(data.cutting_list_markup_multiplier) || 1,
    cutting_list_thickness_38_multiplier: Number(data.cutting_list_thickness_38_multiplier) || 1,
    cutting_list_labor_price_per_piece: Number(data.cutting_list_labor_price_per_piece) || 0
  };
}

async function loadCutlistColors() {
  if (cutlistColorsCache.length) return;
  const { data, error } = await supabaseClient
    .from('colors')
    // texture_url adicionado (pedido do usuário 2026-07-29: quadrado de cor
    // no lugar do <select> de texto puro) — sem ele o quadradinho cairia
    // sempre no swatch_hex genérico, mesmo pra cores com textura cadastrada.
    .select('id, name, sheet_price_per_m2, edge_price_per_linear_m, swatch_hex, texture_url, default_sheet_size_id, stock_in_house, skip_cutting_plan')
    .eq('active', true)
    .order('sort_order');
  if (error) return;
  cutlistColorsCache = data || [];
}

// Tamanhos de chapa (migration 063) — mesmo padrão de cache de
// loadCutlistColors, só lido uma vez por sessão.
async function loadCutlistSheetSizes() {
  if (cutlistSheetSizesCache.length) return;
  const { data, error } = await supabaseClient
    .from('cutting_list_sheet_sizes')
    .select('id, name, width_mm, height_mm, kerf_mm')
    .eq('active', true)
    .order('sort_order');
  if (error) return;
  cutlistSheetSizesCache = data || [];
}

function initCuttingListTabIfNeeded() {
  if (cutlistInitialized) return;
  cutlistInitialized = true;
  loadCutlistSheetSizes();
  loadCutlistColors().then(() => {
    if (cutlistRows.length === 0) addCutlistRow();
    else renderCutlistTable();
  });
}

function newCutlistRow() {
  return {
    _id: cutlistRowSeq++,
    op: '',
    part_name: '',
    quantity: 1,
    comprimento_mm: '',
    largura_mm: '',
    espessura_mm: 19,
    color_id: cutlistColorsCache[0] ? cutlistColorsCache[0].id : null,
    edge_banding: 0,
    // Veio da madeira (migration 073, pedido do usuário 2026-08-02) — 'sim'
    // trava o comprimento no sentido do veio (nesting não gira a peça 90°,
    // ver packSheetsMaxRects/cutlistPieceFitsSheet); 'não' (default) segue o
    // comportamento de sempre, livre pra girar e aproveitar melhor a chapa.
    has_grain: false,
    obs: ''
  };
}

function addCutlistRow(overrides) {
  cutlistRows.push(Object.assign(newCutlistRow(), overrides || {}));
  hideCutlistFinalPrice();
  renderCutlistTable();
}

function removeCutlistRow(rowId) {
  cutlistRows = cutlistRows.filter((r) => r._id !== rowId);
  cutlistCheckedIds.delete(rowId);
  hideCutlistFinalPrice();
  renderCutlistTable();
}

function clearCutlistRows() {
  cutlistRows = [];
  cutlistCheckedIds.clear();
  cutlistValidationAttempted = false;
  hideCutlistFinalPrice();
  renderCutlistTable();
}

function hideCutlistFinalPrice() {
  cutlistFinalPrice = null;
  const priceRow = document.getElementById('po-cutlist-final-price-row');
  const saveBtn = document.getElementById('po-cutlist-save-btn');
  const approveBtn = document.getElementById('po-cutlist-approve-save-btn');
  if (priceRow) priceRow.style.display = 'none';
  if (saveBtn) saveBtn.style.display = 'none';
  if (approveBtn) approveBtn.style.display = 'none';
  // Plano de corte (migration 063) fica desatualizado com qualquer mudança
  // de linha, igual ao preço — some junto (função declarada mais abaixo no
  // arquivo, mas function declaration é hoisted).
  hideCutlistPlanResults();
}

// Regra do usuário: peça com o menor lado (comprimento OU largura) abaixo
// de 100mm não pode laminar os 4 lados — só 0 ou 2 (2 comprimentos).
function isCutlistEdge4Blocked(row) {
  const c = Number(row.comprimento_mm);
  const w = Number(row.largura_mm);
  if (!isFinite(c) || !isFinite(w) || c <= 0 || w <= 0) return false;
  return Math.min(c, w) < 100;
}

// Lista os problemas específicos de UMA linha (pedido do usuário 2026-07-29:
// "a mensagem nao esta clara do que esta faltando pra gerar o preco") — o
// aviso genérico antigo dizia "corrija as linhas destacadas em vermelho",
// mas NENHUM código de verdade destacava nada de vermelho (renderCutlistTable
// nunca aplicava essa classe em lugar nenhum), então a mensagem prometia algo
// que não existia e não dizia qual linha/campo estava errado. Agora cada
// problema vira um item nomeado (usado tanto pra montar a mensagem detalhada
// quanto pra aplicar a borda vermelha de verdade no campo certo).
function getCutlistRowIssues(row) {
  const issues = [];
  const edge = Number(row.edge_banding);
  const comprimento = Number(row.comprimento_mm);
  const largura = Number(row.largura_mm);
  if (!row.part_name || !row.part_name.trim()) issues.push('part_name');
  if (!(Number(row.quantity) > 0)) issues.push('quantity');
  if (!(comprimento >= CUTLIST_COMPRIMENTO_MIN && comprimento <= CUTLIST_COMPRIMENTO_MAX)) issues.push('comprimento');
  if (!(largura >= CUTLIST_LARGURA_MIN && largura <= CUTLIST_LARGURA_MAX)) issues.push('largura');
  if (!(Number(row.espessura_mm) === 19 || Number(row.espessura_mm) === 38)) issues.push('espessura');
  if (!row.color_id) issues.push('color');
  if (![0, 2, 4].includes(edge)) issues.push('edge');
  else if (edge === 4 && isCutlistEdge4Blocked(row)) issues.push('edge4blocked');
  return issues;
}

function validateCutlistRows() {
  return cutlistRows.length > 0 && cutlistRows.every((row) => getCutlistRowIssues(row).length === 0);
}

// Só passa a destacar campos em vermelho DEPOIS da 1ª tentativa de "Gerar
// Preço" que falhou (senão toda linha nova, com comprimento/largura ainda
// vazios por padrão, já nasceria vermelha sem o usuário ter feito nada —
// ruim). Uma vez true, fica true (feedback ao vivo conforme corrige cada
// campo) — resetado só em "Limpar tudo" (começa do zero de verdade).
let cutlistValidationAttempted = false;

// 1 seletor DOM por tipo de problema — 'edge' e 'edge4blocked' apontam pro
// MESMO campo (só existe 1 seletor de fita por linha), daí o Set na função
// abaixo pra não tentar limpar/marcar o mesmo elemento 2x de forma conflitante.
const CUTLIST_FIELD_SELECTOR_BY_ISSUE = {
  part_name: '.cl-part-name',
  quantity: '.cl-quantity',
  comprimento: '.cl-comprimento',
  largura: '.cl-largura',
  espessura: '.cl-espessura',
  color: '.cl-color-btn',
  edge: '.cl-edge',
  edge4blocked: '.cl-edge'
};

// Aplica/remove a borda vermelha nos campos de UMA linha já renderizada, sem
// precisar re-renderizar a linha inteira inteira (evita perder o foco/cursor
// de quem ainda está digitando) — chamada tanto na criação da linha quanto
// em cada listener de campo, quando cutlistValidationAttempted é true.
function refreshCutlistRowHighlight(tr, row) {
  if (!cutlistValidationAttempted) return;
  const issues = getCutlistRowIssues(row);
  const invalidSelectors = new Set(issues.map((k) => CUTLIST_FIELD_SELECTOR_BY_ISSUE[k]).filter(Boolean));
  Array.from(new Set(Object.values(CUTLIST_FIELD_SELECTOR_BY_ISSUE))).forEach((sel) => {
    const el = tr.querySelector(sel);
    if (el) el.classList.toggle('cl-field-invalid', invalidSelectors.has(sel));
  });
}

// Mini ícone ao lado do seletor de Fita de Borda (pedido do usuário
// 2026-07-20: tirou o diagrama grande do lado e pediu pra mostrar a fita
// "conforme a pessoa escolhe do lado do seletor", sem aumentar a altura da
// barra — por isso é pequeno e cabe dentro da altura do <select>). Lados em
// laranja = onde entra a fita, conforme o valor escolhido (0/2/4). "2" segue
// a mesma peça landscape do resto da tela: os 2 lados do comprimento = topo
// e base do retângulo.
function cutlistEdgeIconSvg(edgeValue) {
  const e = Number(edgeValue);
  const top = e === 2 || e === 4;
  const bottom = e === 2 || e === 4;
  const left = e === 4;
  const right = e === 4;
  const active = '#ff7a3d';
  const base = '#c9ab84';
  const sw = (on) => on ? 3 : 1.5;
  return `<svg width="30" height="20" viewBox="0 0 30 20" style="vertical-align:middle; flex:none;">
    <rect x="3" y="3" width="24" height="14" fill="#e6c69c"/>
    <line x1="3" y1="3" x2="27" y2="3" stroke="${top ? active : base}" stroke-width="${sw(top)}"/>
    <line x1="3" y1="17" x2="27" y2="17" stroke="${bottom ? active : base}" stroke-width="${sw(bottom)}"/>
    <line x1="3" y1="3" x2="3" y2="17" stroke="${left ? active : base}" stroke-width="${sw(left)}"/>
    <line x1="27" y1="3" x2="27" y2="17" stroke="${right ? active : base}" stroke-width="${sw(right)}"/>
  </svg>`;
}

// Popup de cor do Plano de Corte — FOLLOW-UP 2026-07-29: a 1ª versão usava
// renderSwatches() (grade de quadradinhos, nome só em tooltip) dentro de um
// <div> filho da própria célula da tabela; usuário reportou 2 problemas: (1)
// "quando clico nao vejo nome" — queria o nome sempre visível, em LISTA
// vertical (como o <select> nativo antigo), não uma grade com nome só no
// hover; (2) "a tela nao expande pra fora, fica oculta" — a célula fica
// dentro de #po-cutlist-table-wrap, que tem overflow-x:auto (isso também
// força overflow-y:auto por regra do CSS), então o popup posicionado como
// filho da célula era CORTADO por esse wrapper. Fix: popup único (singleton),
// anexado direto no <body> com position:fixed (fora da hierarquia do
// wrapper — não sofre clipping de overflow nenhum), reposicionado via
// getBoundingClientRect() do botão clicado a cada abertura, e conteúdo é uma
// lista vertical (não grade) com o quadradinho + NOME em texto normal por
// linha (renderCutlistColorPopupList, não renderSwatches).
let cutlistColorPopupEl = null; // singleton, criado sob demanda
let cutlistColorPopupRowId = null; // row._id do popup aberto agora, null = fechado

function getCutlistColorPopupEl() {
  if (cutlistColorPopupEl) return cutlistColorPopupEl;
  const el = document.createElement('div');
  el.id = 'po-cutlist-color-popup';
  el.className = 'cl-color-popup-fixed';
  el.style.display = 'none';
  // Campo de busca fixo no topo (pedido do usuário 2026-07-31: "quero poder
  // digitar as primeiras letras e puxar as cores conforme escrevo") + wrap
  // separado que rola por baixo dele — diferente de antes (o popup inteiro
  // rolava), pra o campo de busca nunca sumir de vista rolando a lista.
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'cl-color-search-input';
  searchInput.placeholder = I18n.t('cutlist.color_search_placeholder');
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    const all = el._allItems || [];
    const filtered = q ? all.filter((c) => c.name.toLowerCase().includes(q)) : all;
    renderCutlistColorPopupList(el._listWrap, filtered, el._selectedId, el._onSelect);
  });
  // Digitar não pode deixar o Tab/setas vazarem pra trás da linha da
  // tabela nem fechar o popup sem querer.
  searchInput.addEventListener('keydown', (e) => e.stopPropagation());
  const listWrap = document.createElement('div');
  listWrap.className = 'cl-color-list-wrap';
  el.appendChild(searchInput);
  el.appendChild(listWrap);
  el._searchInput = searchInput;
  el._listWrap = listWrap;
  document.body.appendChild(el);
  // Clique fora fecha — mas ignora o próprio clique que ABRIU o popup (o
  // listener do botão já rodou e setou cutlistColorPopupRowId antes deste
  // aqui rodar, na fase de bubble; sem esse "closest" ele fecharia na hora).
  document.addEventListener('click', (e) => {
    if (cutlistColorPopupRowId === null) return;
    if (el.contains(e.target)) return;
    if (e.target.closest && e.target.closest('.cl-color-btn')) return;
    closeCutlistColorPopup();
  });
  // BUG CORRIGIDO 2026-07-31: antes fechava em QUALQUER scroll da página —
  // inclusive rolando a lista de DENTRO do próprio popup, porque 'scroll'
  // não faz bubble mas o listener em fase de captura (true) no window
  // intercepta mesmo assim. Agora só fecha se a rolagem não teve origem
  // dentro do popup.
  window.addEventListener('scroll', (e) => {
    if (el.contains(e.target)) return;
    closeCutlistColorPopup();
  }, true);
  cutlistColorPopupEl = el;
  return el;
}

function closeCutlistColorPopup() {
  if (!cutlistColorPopupEl) return;
  cutlistColorPopupEl.style.display = 'none';
  cutlistColorPopupEl._listWrap.innerHTML = '';
  cutlistColorPopupEl._searchInput.value = '';
  cutlistColorPopupRowId = null;
}

// Lista vertical (ícone + nome em texto, sempre visível) — diferente de
// renderSwatches (grade de ícones, nome só em title/tooltip), a pedido
// explícito do usuário só pra esta tela ("quero em lista como antes").
function renderCutlistColorPopupList(container, items, selectedId, onSelect) {
  container.innerHTML = '';
  items.forEach((c) => {
    const row = document.createElement('div');
    row.className = 'cl-color-list-item' + (c.id === selectedId ? ' selected' : '');
    const dotStyle = c.texture_url
      ? `background-image:url('${c.texture_url}'); background-size:cover; background-position:center;`
      : `background-color:${c.swatch_hex || '#cccccc'};`;
    row.innerHTML = `<span class="cl-color-dot" style="${dotStyle}"></span><span class="cl-color-list-name">${c.name}</span>`;
    row.addEventListener('click', () => onSelect(c.id));
    container.appendChild(row);
  });
}

function toggleCutlistColorPicker(row, btnEl) {
  const popup = getCutlistColorPopupEl();
  if (cutlistColorPopupRowId === row._id) {
    closeCutlistColorPopup();
    return;
  }
  cutlistColorPopupRowId = row._id;
  const rect = btnEl.getBoundingClientRect();
  popup.style.left = `${Math.round(rect.left)}px`;
  popup.style.top = `${Math.round(rect.bottom + 4)}px`;
  popup.style.display = 'block';
  popup._allItems = cutlistColorsCache;
  popup._selectedId = row.color_id;
  popup._onSelect = (colorId) => {
    row.color_id = colorId;
    hideCutlistFinalPrice();
    closeCutlistColorPopup();
    renderCutlistTable();
  };
  renderCutlistColorPopupList(popup._listWrap, cutlistColorsCache, row.color_id, popup._onSelect);
  popup._searchInput.focus();
}

// Mesmo popup de cor, mas o "onSelect" aplica em TODAS as linhas marcadas de
// uma vez (ver renderCutlistBulkToolbar) em vez de uma linha só.
function toggleCutlistBulkColorPicker(btnEl) {
  const popup = getCutlistColorPopupEl();
  if (cutlistColorPopupRowId === CUTLIST_BULK_COLOR_POPUP_ID) {
    closeCutlistColorPopup();
    return;
  }
  cutlistColorPopupRowId = CUTLIST_BULK_COLOR_POPUP_ID;
  const rect = btnEl.getBoundingClientRect();
  popup.style.left = `${Math.round(rect.left)}px`;
  popup.style.top = `${Math.round(rect.bottom + 4)}px`;
  popup.style.display = 'block';
  popup._allItems = cutlistColorsCache;
  popup._selectedId = null;
  popup._onSelect = (colorId) => {
    applyCutlistBulk('color_id', colorId);
    closeCutlistColorPopup();
  };
  renderCutlistColorPopupList(popup._listWrap, cutlistColorsCache, null, popup._onSelect);
  popup._searchInput.focus();
}

// Barra "Aplicar em massa" (pedido do usuário 2026-07-31: "quero um quadrado
// pra selecionar e fazer uma troca de todos selecionados, pode ser tickness,
// pode ser a cor, pode ser a edgband") — montada via JS (não HTML estático)
// pra poder usar I18n.t() nos textos, mesmo padrão do resto da tela. Chamada
// de dentro de renderCutlistTable() a cada render pra manter a contagem de
// selecionadas em dia.
function renderCutlistBulkToolbar() {
  const wrap = document.getElementById('po-cutlist-bulk-toolbar');
  if (!wrap) return;
  const n = cutlistCheckedIds.size;
  // Todo <select>/<button> aqui dentro precisa de margin-top:0 (o `button`
  // global tem margin-top:14px — sem zerar, os botões "Aplicar..." ficavam
  // mais baixos que os <select> ao lado, mesmo com align-items:center no
  // wrap; pedido do usuário 2026-07-31 "alinha melhor"). Regra .cl-bulk-field
  // em css/style.css cobre isso pra todo filho direto, então os inputs
  // abaixo não precisam repetir o style inline.
  wrap.innerHTML = `
    <span class="hint" style="margin:0; font-weight:600;">${I18n.t('cutlist.bulk_selected_count', { n })}</span>
    <input type="text" id="po-cutlist-bulk-op" class="po-project-input cl-bulk-field" style="width:90px;" placeholder="${I18n.t('cutlist.col_op')}" />
    <button type="button" class="secondary cl-bulk-field" id="po-cutlist-bulk-op-btn">${I18n.t('cutlist.bulk_apply_op_btn')}</button>
    <select id="po-cutlist-bulk-espessura" class="po-project-input cl-bulk-field" style="width:100px;">
      <option value="19">19mm</option>
      <option value="38">38mm</option>
    </select>
    <button type="button" class="secondary cl-bulk-field" id="po-cutlist-bulk-espessura-btn">${I18n.t('cutlist.bulk_apply_thickness_btn')}</button>
    <button type="button" class="secondary cl-color-btn cl-bulk-field" id="po-cutlist-bulk-color-btn">
      <span class="cl-color-label">${I18n.t('cutlist.bulk_apply_color_btn')}</span>
    </button>
    <select id="po-cutlist-bulk-edge" class="po-project-input cl-bulk-field" style="width:170px;">
      <option value="0">${I18n.t('cutlist.edge_0')}</option>
      <option value="2">${I18n.t('cutlist.edge_2')}</option>
      <option value="4">${I18n.t('cutlist.edge_4')}</option>
    </select>
    <button type="button" class="secondary cl-bulk-field" id="po-cutlist-bulk-edge-btn">${I18n.t('cutlist.bulk_apply_edge_btn')}</button>
    <select id="po-cutlist-bulk-grain" class="po-project-input cl-bulk-field" style="width:100px;">
      <option value="0">${I18n.t('cutlist.grain_no')}</option>
      <option value="1">${I18n.t('cutlist.grain_yes')}</option>
    </select>
    <button type="button" class="secondary cl-bulk-field" id="po-cutlist-bulk-grain-btn">${I18n.t('cutlist.bulk_apply_grain_btn')}</button>
  `;
  wrap.querySelector('#po-cutlist-bulk-op-btn').addEventListener('click', () => {
    applyCutlistBulk('op', document.getElementById('po-cutlist-bulk-op').value);
  });
  wrap.querySelector('#po-cutlist-bulk-espessura-btn').addEventListener('click', () => {
    applyCutlistBulk('espessura_mm', Number(document.getElementById('po-cutlist-bulk-espessura').value));
  });
  wrap.querySelector('#po-cutlist-bulk-color-btn').addEventListener('click', (e) => toggleCutlistBulkColorPicker(e.currentTarget));
  wrap.querySelector('#po-cutlist-bulk-edge-btn').addEventListener('click', () => {
    applyCutlistBulk('edge_banding', Number(document.getElementById('po-cutlist-bulk-edge').value));
  });
  wrap.querySelector('#po-cutlist-bulk-grain-btn').addEventListener('click', () => {
    applyCutlistBulk('has_grain', document.getElementById('po-cutlist-bulk-grain').value === '1');
  });
}

// field = 'op' | 'espessura_mm' | 'color_id' | 'edge_banding' | 'has_grain'. Aplica só nas
// linhas marcadas (cutlistCheckedIds). Fita "4 lados" respeita a mesma trava
// por linha do dropdown individual (peça com lado < 100mm não pode) — pula
// essas silenciosamente em vez de forçar um estado inválido.
function applyCutlistBulk(field, value) {
  if (cutlistCheckedIds.size === 0) {
    alert(I18n.t('cutlist.bulk_none_selected'));
    return;
  }
  cutlistRows.forEach((row) => {
    if (!cutlistCheckedIds.has(row._id)) return;
    if (field === 'edge_banding' && value === 4 && isCutlistEdge4Blocked(row)) return;
    row[field] = value;
  });
  hideCutlistFinalPrice();
  renderCutlistTable();
}

function renderCutlistTable() {
  const tbody = document.getElementById('po-cutlist-tbody');
  if (!tbody) return;
  renderCutlistBulkToolbar();
  // Comprimento/Largura seguem a unidade GLOBAL (po-unit-select, mesma do
  // resto do portal, inclui polegada fracionada 1/32") — pedido do usuário
  // 2026-08-02: "preciso que o cutting list funciona com polegada
  // fracionada tambem, conforme preferencia de cada usuario". Internamente
  // (row.comprimento_mm/largura_mm, preço, nesting, banco) continua tudo em
  // mm sempre — só a caixa de texto exibida/digitada muda (ver
  // commitCutlistDimensionInput). Cabeçalho/hint de limites acompanham.
  const cutlistUnit = (document.getElementById('po-unit-select') || {}).value || 'mm';
  updateCutlistUnitLabels(cutlistUnit);
  const selectAllEl = document.getElementById('po-cutlist-select-all');
  if (selectAllEl) {
    selectAllEl.checked = cutlistRows.length > 0 && cutlistRows.every((r) => cutlistCheckedIds.has(r._id));
    if (selectAllEl.dataset.cutlistSelectAllAttached !== '1') {
      selectAllEl.dataset.cutlistSelectAllAttached = '1';
      selectAllEl.addEventListener('change', () => {
        if (selectAllEl.checked) cutlistRows.forEach((r) => cutlistCheckedIds.add(r._id));
        else cutlistCheckedIds.clear();
        renderCutlistTable();
      });
    }
  }
  tbody.innerHTML = '';
  cutlistRows.forEach((row) => {
    const tr = document.createElement('tr');
    const edge4Blocked = isCutlistEdge4Blocked(row);
    // Quadrado de cor (pedido do usuário 2026-07-29: "quadrado pequeno do
    // lado mostrando a cor, tanto no dropdown quanto na linha das
    // informacoes") — <select>/<option> nativos não aceitam HTML dentro
    // (limite do próprio navegador), então trocado por botão+popup, mesmo
    // padrão já usado em .po-order-item-color-btn/-picker (order-detail),
    // reaproveitando renderSwatches() pro painel. O quadrado no BOTÃO (fechado)
    // já cobre "na linha das informacoes"; os quadrados dentro do popup
    // cobrem "no dropdown".
    const selectedColor = cutlistColorsCache.find((c) => c.id === row.color_id) || null;
    const colorDotStyle = selectedColor && selectedColor.texture_url
      ? `background-image:url('${selectedColor.texture_url}'); background-size:cover; background-position:center;`
      : `background-color:${(selectedColor && selectedColor.swatch_hex) || '#cccccc'};`;
    tr.innerHTML = `
      <td><input type="checkbox" class="cl-row-check" ${cutlistCheckedIds.has(row._id) ? 'checked' : ''} /></td>
      <td><input type="text" class="po-project-input cl-op" style="width:64px;" value="${row.op || ''}" /></td>
      <td><input type="text" class="po-project-input cl-part-name" style="width:140px;" value="${row.part_name || ''}" /></td>
      <td><input type="number" min="1" step="1" class="po-project-input cl-quantity" style="width:56px;" value="${row.quantity}" /></td>
      <td><input type="text" inputmode="decimal" class="po-project-input cl-comprimento" style="width:90px;" value="${cutlistFormatFieldValue(row.comprimento_mm, cutlistUnit)}" placeholder="${unitAbbrev(cutlistUnit)}" /></td>
      <td><input type="text" inputmode="decimal" class="po-project-input cl-largura" style="width:90px;" value="${cutlistFormatFieldValue(row.largura_mm, cutlistUnit)}" placeholder="${unitAbbrev(cutlistUnit)}" /></td>
      <td>
        <select class="po-project-input cl-grain" style="width:78px;" title="${row.has_grain ? I18n.t('cutlist.grain_yes_hint') : I18n.t('cutlist.grain_no_hint')}">
          <option value="0" ${!row.has_grain ? 'selected' : ''}>${I18n.t('cutlist.grain_no')}</option>
          <option value="1" ${row.has_grain ? 'selected' : ''}>${I18n.t('cutlist.grain_yes')}</option>
        </select>
      </td>
      <td>
        <select class="po-project-input cl-espessura" style="width:78px;">
          <option value="19" ${Number(row.espessura_mm) === 19 ? 'selected' : ''}>19mm</option>
          <option value="38" ${Number(row.espessura_mm) === 38 ? 'selected' : ''}>38mm</option>
        </select>
      </td>
      <td class="cl-color-cell">
        <button type="button" class="cl-color-btn">
          <span class="cl-color-dot" style="${colorDotStyle}"></span>
          <span class="cl-color-label">${selectedColor ? selectedColor.name : ''}</span>
        </button>
      </td>
      <td style="display:flex; align-items:center; gap:6px;">
        <select class="po-project-input cl-edge" style="width:170px; margin-top:0;">
          <option value="0" ${Number(row.edge_banding) === 0 ? 'selected' : ''}>${I18n.t('cutlist.edge_0')}</option>
          <option value="2" ${Number(row.edge_banding) === 2 ? 'selected' : ''}>${I18n.t('cutlist.edge_2')}</option>
          <option value="4" ${Number(row.edge_banding) === 4 ? 'selected' : ''} ${edge4Blocked ? `disabled title="${I18n.t('cutlist.edge_4_blocked_title')}"` : ''}>${I18n.t('cutlist.edge_4')}</option>
        </select>
        <span class="cl-edge-icon">${cutlistEdgeIconSvg(row.edge_banding)}</span>
      </td>
      <td><input type="text" class="po-project-input cl-obs" style="width:120px;" value="${row.obs || ''}" /></td>
      <td><button type="button" class="secondary cl-remove-btn" style="margin-top:0; padding:4px 8px;">✕</button></td>
    `;
    tbody.appendChild(tr);

    // Destaque de vermelho de verdade nos campos com problema — só depois de
    // uma tentativa de "Gerar Preço" já ter falhado (cutlistValidationAttempted).
    // Ver getCutlistRowIssues/mensagem detalhada no handler do botão.
    refreshCutlistRowHighlight(tr, row);

    tr.querySelector('.cl-row-check').addEventListener('change', (e) => {
      if (e.target.checked) cutlistCheckedIds.add(row._id);
      else cutlistCheckedIds.delete(row._id);
      renderCutlistTable();
    });
    tr.querySelector('.cl-op').addEventListener('input', (e) => { row.op = e.target.value; hideCutlistFinalPrice(); });
    tr.querySelector('.cl-part-name').addEventListener('input', (e) => { row.part_name = e.target.value; hideCutlistFinalPrice(); refreshCutlistRowHighlight(tr, row); });
    tr.querySelector('.cl-quantity').addEventListener('input', (e) => { row.quantity = e.target.value; hideCutlistFinalPrice(); refreshCutlistRowHighlight(tr, row); });
    tr.querySelector('.cl-obs').addEventListener('input', (e) => { row.obs = e.target.value; hideCutlistFinalPrice(); });
    tr.querySelector('.cl-color-btn').addEventListener('click', (e) => toggleCutlistColorPicker(row, e.currentTarget));
    tr.querySelector('.cl-grain').addEventListener('change', (e) => {
      row.has_grain = e.target.value === '1';
      hideCutlistFinalPrice();
      e.target.title = row.has_grain ? I18n.t('cutlist.grain_yes_hint') : I18n.t('cutlist.grain_no_hint');
    });
    tr.querySelector('.cl-espessura').addEventListener('change', (e) => { row.espessura_mm = Number(e.target.value); hideCutlistFinalPrice(); refreshCutlistRowHighlight(tr, row); });
    tr.querySelector('.cl-edge').addEventListener('change', (e) => {
      row.edge_banding = Number(e.target.value);
      hideCutlistFinalPrice();
      const iconEl = tr.querySelector('.cl-edge-icon');
      if (iconEl) iconEl.innerHTML = cutlistEdgeIconSvg(row.edge_banding);
      refreshCutlistRowHighlight(tr, row);
    });
    // Comprimento/largura só CONFIRMAM o valor no 'change' (blur) — mesmo
    // padrão de po-ceiling-input/po-width-exact (applyExactDimension):
    // parseDimensionInput não dá pra rodar a cada tecla (fração de polegada
    // tipo "15 1/16" fica ambígua/inválida no meio da digitação, ver
    // comentário em applyFloorHeightInput). 'input' só marca preço
    // desatualizado, sem mexer no valor em mm ainda; 'change' re-renderiza a
    // linha inteira (recalcula se a opção "4 lados" deve ficar bloqueada,
    // regra dos 100mm — só faz sentido com o valor em mm já commitado).
    tr.querySelector('.cl-comprimento').addEventListener('input', hideCutlistFinalPrice);
    tr.querySelector('.cl-comprimento').addEventListener('change', (e) => {
      commitCutlistDimensionInput(row, 'comprimento_mm', e.target.value);
      renderCutlistTable();
    });
    tr.querySelector('.cl-largura').addEventListener('input', hideCutlistFinalPrice);
    tr.querySelector('.cl-largura').addEventListener('change', (e) => {
      commitCutlistDimensionInput(row, 'largura_mm', e.target.value);
      renderCutlistTable();
    });
    tr.querySelector('.cl-remove-btn').addEventListener('click', () => removeCutlistRow(row._id));

    // Pedido do usuário 2026-07-31: "cada tab leve pra proxima caixa" — Tab
    // pra frente pula direto pra próxima caixa de digitação da linha, na
    // ORDEM VISUAL (OP → Peça → Qtd → Comprimento → Largura → Espessura →
    // Cor → Fita → Obs), pulando o checkbox de seleção e o botão ✕ (não são
    // "caixas" de preencher). No fim da linha, vai pro OP da PRÓXIMA linha;
    // no Obs da ÚLTIMA linha, cria uma linha nova e vai pro OP dela (regra
    // que já existia desde 2026-07-20, agora generalizada pra linha inteira
    // em vez de só o último campo). Delegado num único listener no <tr> em
    // vez de um por campo.
    tr.addEventListener('keydown', (e) => handleCutlistFieldTab(e, row));
  });
}

// Sequência de "caixas" de digitação por linha, na mesma ordem visual das
// colunas da tabela — ver handleCutlistFieldTab.
const CUTLIST_TAB_FIELDS = ['cl-op', 'cl-part-name', 'cl-quantity', 'cl-comprimento', 'cl-largura', 'cl-grain', 'cl-espessura', 'cl-color-btn', 'cl-edge', 'cl-obs'];

// Foca uma caixa específica (por linha + classe do campo) DEPOIS de um
// possível re-render — não guarda referência direta ao <input>/<select>
// porque renderCutlistTable() recria o <tbody> inteiro (destruiria a
// referência antiga).
function focusCutlistField(rowId, fieldClass) {
  const tbody = document.getElementById('po-cutlist-tbody');
  if (!tbody) return;
  const idx = cutlistRows.findIndex((r) => r._id === rowId);
  if (idx === -1) return;
  const tr = tbody.children[idx];
  const el = tr && tr.querySelector(`.${fieldClass}`);
  if (el) el.focus();
}

// Tab pra frente numa das caixas de CUTLIST_TAB_FIELDS: sempre
// preventDefault() (não deixa o navegador decidir sozinho pra onde ir) e
// controla o foco na mão. Motivo de não confiar no Tab nativo: comprimento/
// largura disparam renderCutlistTable() completo no 'change' (recalcula a
// trava de "4 lados" abaixo de 100mm) — se o navegador já tivesse decidido
// mover o foco pro próximo elemento do DOM ANTES desse re-render rodar, o
// elemento-alvo seria destruído no meio do processo e o foco se perderia
// (caía no <body>), quebrando a cadeia de Tabs a partir dali. Por isso aqui
// SEMPRE re-renderiza primeiro (se preciso) e só then foca o campo já
// existente no DOM novo.
function handleCutlistFieldTab(e, row) {
  if (e.key !== 'Tab' || e.shiftKey) return;
  const fieldClass = CUTLIST_TAB_FIELDS.find((cls) => e.target.classList && e.target.classList.contains(cls));
  if (!fieldClass) return; // checkbox/botão ✕: deixa o Tab nativo agir
  e.preventDefault();
  // Comprimento/Largura só commitam o valor digitado no 'change' (blur) —
  // mas e.preventDefault() acima impede o navegador de mover o foco
  // sozinho, então o blur nativo pode nunca disparar antes do re-render
  // logo abaixo (o campo com foco é destruído no meio do processo). Sem
  // isto, dar Tab no meio de "15 1/16" perderia o valor digitado — commita
  // aqui, na mão, antes de qualquer render.
  if (fieldClass === 'cl-comprimento') commitCutlistDimensionInput(row, 'comprimento_mm', e.target.value);
  if (fieldClass === 'cl-largura') commitCutlistDimensionInput(row, 'largura_mm', e.target.value);
  const fieldIdx = CUTLIST_TAB_FIELDS.indexOf(fieldClass);
  if (fieldIdx < CUTLIST_TAB_FIELDS.length - 1) {
    renderCutlistTable();
    focusCutlistField(row._id, CUTLIST_TAB_FIELDS[fieldIdx + 1]);
    return;
  }
  // Última caixa da linha (Obs).
  const rowIdx = cutlistRows.findIndex((r) => r._id === row._id);
  const isLastRow = rowIdx === cutlistRows.length - 1;
  if (isLastRow) {
    addCutlistRow(); // já chama renderCutlistTable() internamente
    const newRow = cutlistRows[cutlistRows.length - 1];
    focusCutlistField(newRow._id, 'cl-op');
    return;
  }
  renderCutlistTable();
  const nextRow = cutlistRows[rowIdx + 1];
  focusCutlistField(nextRow._id, 'cl-op');
}

// Mesma matemática de custo já usada em pricing.js (area_m2 x
// sheet_price_per_m2, edge_band_m x edge_price_per_linear_m), só que por
// linha digitada em vez de por peça de módulo. "2 comprimentos" = fita só
// nos 2 lados do comprimento; "4 lados" = perímetro inteiro. Multiplicador
// de espessura e mão de obra por peça são específicos do plano de corte
// (migration 051); margem especial é aplicada UMA VEZ no total geral (mesmo
// espírito do markup_multiplier da migration 037 — nunca componível).
function computeCutlistTotal() {
  let grandTotal = 0;
  cutlistRows.forEach((row) => {
    const color = cutlistColorsCache.find((c) => c.id === row.color_id);
    if (!color) { row._unit_price = 0; row._total_price = 0; return; }
    const qty = Number(row.quantity) || 0;
    const comprimentoM = Number(row.comprimento_mm) / 1000;
    const larguraM = Number(row.largura_mm) / 1000;
    const areaM2 = comprimentoM * larguraM;
    const edge = Number(row.edge_banding);
    const edgeM = edge === 4 ? 2 * (comprimentoM + larguraM) : edge === 2 ? 2 * comprimentoM : 0;
    const thicknessMultiplier = Number(row.espessura_mm) === 38 ? cutlistPricingSettings.cutting_list_thickness_38_multiplier : 1;
    const sheetCost = areaM2 * Number(color.sheet_price_per_m2 || 0) * thicknessMultiplier;
    const edgeCost = edgeM * Number(color.edge_price_per_linear_m || 0);
    const laborCost = cutlistPricingSettings.cutting_list_labor_price_per_piece;
    const unitPrice = sheetCost + edgeCost + laborCost;
    row._unit_price = unitPrice;
    row._total_price = unitPrice * qty;
    grandTotal += row._total_price;
  });
  return grandTotal * cutlistPricingSettings.cutting_list_markup_multiplier;
}

// ---------- Plano de Corte / Nesting (migration 063) ----------
// Pedido do usuário 2026-07-31: botão "Gerar Plano de Corte" que encaixa as
// peças chapa a chapa (like a cutting-diagram estimator) e mostra quantas
// chapas + quantos metros de fita de borda são necessários. Tamanho de
// chapa vem da cor (colors.default_sheet_size_id) quando cadastrado; cor
// sem tamanho vinculado ("especial") faz o Contractor escolher na hora
// entre os tamanhos ativos (cutlistSheetSizesCache).
//
// Igual ao resto da aba Plano de Corte, isso é uma ESTIMATIVA rápida pro
// Contractor planejar compra/produção — não um desenho de corte de
// produção exato (não considera veio da madeira, porque a planilha nunca
// coletou essa informação por peça).

function escapeHtmlCutlist(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// MaxRects Best-Area-Fit com rotação de 90° livre POR PADRÃO. Peça com
// piece.grain=true (migration 073, coluna has_grain, pedido do usuário
// 2026-08-02: "sempre que veio e sim, ele deve considerar o comprimento no
// sentido do veio") trava — só o candidato NÃO rotacionado entra, o
// comprimento (piece.w) fica sempre no mesmo sentido em toda a chapa. Peça
// com grain=false (default) continua livre pra girar e aproveitar melhor a
// chapa, igual sempre foi. kerf é reservado como margem extra à direita/
// abaixo de cada peça colocada (aproximação padrão desse tipo de
// calculadora rápida, mesmo espírito de "estimativa" já usado no resto da
// aba).
function packSheetsMaxRects(pieces, sheetW, sheetH, kerf) {
  function rectContains(outer, inner) {
    return inner.x >= outer.x - 1e-6 && inner.y >= outer.y - 1e-6 &&
      inner.x + inner.w <= outer.x + outer.w + 1e-6 && inner.y + inner.h <= outer.y + outer.h + 1e-6;
  }
  function rectsOverlap(a, b) {
    return a.x < b.x + b.w - 1e-6 && a.x + a.w > b.x + 1e-6 && a.y < b.y + b.h - 1e-6 && a.y + a.h > b.y + 1e-6;
  }
  function pruneFreeRects(freeRects) {
    for (let i = freeRects.length - 1; i >= 0; i--) {
      for (let j = 0; j < freeRects.length; j++) {
        if (i === j) continue;
        if (rectContains(freeRects[j], freeRects[i])) { freeRects.splice(i, 1); break; }
      }
    }
  }
  function splitFreeRect(freeRect, placedRect, outList) {
    if (!rectsOverlap(freeRect, placedRect)) { outList.push(freeRect); return; }
    if (placedRect.x > freeRect.x) outList.push({ x: freeRect.x, y: freeRect.y, w: placedRect.x - freeRect.x, h: freeRect.h });
    if (placedRect.x + placedRect.w < freeRect.x + freeRect.w) outList.push({ x: placedRect.x + placedRect.w, y: freeRect.y, w: (freeRect.x + freeRect.w) - (placedRect.x + placedRect.w), h: freeRect.h });
    if (placedRect.y > freeRect.y) outList.push({ x: freeRect.x, y: freeRect.y, w: freeRect.w, h: placedRect.y - freeRect.y });
    if (placedRect.y + placedRect.h < freeRect.y + freeRect.h) outList.push({ x: freeRect.x, y: placedRect.y + placedRect.h, w: freeRect.w, h: (freeRect.y + freeRect.h) - (placedRect.y + placedRect.h) });
  }
  function newSheet() {
    return { width: sheetW, height: sheetH, placed: [], freeRects: [{ x: 0, y: 0, w: sheetW, h: sheetH }] };
  }
  function placeInSheet(sheet, piece) {
    const candidates = [{ w: piece.w, h: piece.h, rotated: false }];
    if (!piece.grain && piece.w !== piece.h) candidates.push({ w: piece.h, h: piece.w, rotated: true });
    let best = null;
    sheet.freeRects.forEach((freeRect) => {
      candidates.forEach((cand) => {
        const pw = cand.w + kerf;
        const ph = cand.h + kerf;
        if (pw > freeRect.w + 1e-6 || ph > freeRect.h + 1e-6) return;
        const leftoverArea = freeRect.w * freeRect.h - pw * ph;
        const leftoverSide = Math.min(freeRect.w - pw, freeRect.h - ph);
        if (!best || leftoverArea < best.leftoverArea - 1e-6 ||
            (Math.abs(leftoverArea - best.leftoverArea) < 1e-6 && leftoverSide < best.leftoverSide)) {
          best = { freeRect, cand, leftoverArea, leftoverSide };
        }
      });
    });
    if (!best) return false;
    const footprint = { x: best.freeRect.x, y: best.freeRect.y, w: best.cand.w + kerf, h: best.cand.h + kerf };
    sheet.placed.push({ x: best.freeRect.x, y: best.freeRect.y, w: best.cand.w, h: best.cand.h, rotated: best.cand.rotated, label: piece.label, id: piece.id, grain: !!piece.grain });
    const newFreeRects = [];
    sheet.freeRects.forEach((fr) => splitFreeRect(fr, footprint, newFreeRects));
    pruneFreeRects(newFreeRects);
    sheet.freeRects = newFreeRects.filter((r) => r.w > 0.5 && r.h > 0.5);
    return true;
  }

  const remaining = pieces.slice().sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || (b.w * b.h) - (a.w * a.h));
  const sheets = [];
  let current = newSheet();
  sheets.push(current);
  remaining.forEach((piece) => {
    if (!placeInSheet(current, piece)) {
      current = newSheet();
      sheets.push(current);
      if (!placeInSheet(current, piece)) {
        // Não deveria acontecer — cutlistFitsSheetSize já filtra peça maior
        // que a chapa antes de chegar aqui. Marca como overflow em vez de
        // travar a geração inteira do plano.
        current.placed.push({ x: 0, y: 0, w: Math.min(piece.w, sheetW), h: Math.min(piece.h, sheetH), rotated: false, label: piece.label, id: piece.id, overflow: true, grain: !!piece.grain });
      }
    }
  });
  return sheets;
}

// Verifica se a peça cabe na chapa — em QUALQUER orientação pra peça sem
// veio (comportamento de sempre), só na orientação FIXA (comprimento = w,
// sem girar) pra peça com veio, mesma trava aplicada em placeInSheet —
// usado antes de rodar o nesting pra avisar o Contractor em vez de gerar um
// plano com peça cortada errado.
function cutlistPieceFitsSheet(w, h, sheetW, sheetH, grain) {
  if (grain) return w <= sheetW && h <= sheetH;
  return (w <= sheetW && h <= sheetH) || (h <= sheetW && w <= sheetH);
}

// Agrupa as linhas por cor+espessura (uma chapa é sempre de UM material —
// não dá pra misturar cor/espessura na mesma chapa) e já soma os metros de
// fita de borda de cada grupo (mesma fórmula de computeCutlistTotal).
function groupCutlistRowsForPlan() {
  const groups = new Map();
  cutlistRows.forEach((row) => {
    const color = cutlistColorsCache.find((c) => c.id === row.color_id);
    if (!color) return;
    const qty = Math.max(0, Math.round(Number(row.quantity)) || 0);
    const w = Number(row.comprimento_mm);
    const h = Number(row.largura_mm);
    if (qty <= 0 || !(w > 0) || !(h > 0)) return;
    const key = `${row.color_id}|${row.espessura_mm}`;
    if (!groups.has(key)) {
      groups.set(key, { key, color, espessura_mm: Number(row.espessura_mm), pieces: [], edgeM: 0, sheetSize: null });
    }
    const g = groups.get(key);
    for (let i = 0; i < qty; i++) {
      g.pieces.push({ id: `${row._id}-${i}`, w, h, label: row.part_name || row.op || '—', grain: !!row.has_grain });
    }
    const edge = Number(row.edge_banding);
    const comprimentoM = w / 1000;
    const larguraM = h / 1000;
    const edgeM = edge === 4 ? 2 * (comprimentoM + larguraM) : edge === 2 ? 2 * comprimentoM : 0;
    g.edgeM += edgeM * qty;
  });
  return Array.from(groups.values());
}

function hideCutlistPlanResults() {
  const panel = document.getElementById('po-cutlist-plan-picker-panel');
  const results = document.getElementById('po-cutlist-plan-results');
  if (panel) panel.style.display = 'none';
  if (results) results.style.display = 'none';
  cutlistPendingPlanGroups = null;
}

// Ponto de entrada do botão "Gerar Plano de Corte" — já rodou
// validateCutlistRowsWithUI() antes (ver listener do botão). Resolve o
// tamanho de chapa de cada grupo automaticamente (color.default_sheet_size_id);
// se sobrar grupo sem tamanho, mostra o painel de escolha manual em vez de
// gerar direto.
async function startCutlistPlanFlow() {
  hideCutlistPlanResults();
  await loadCutlistSheetSizes();
  const groups = groupCutlistRowsForPlan();
  if (groups.length === 0) return;
  groups.forEach((g) => {
    // STOCK IN HOUSE (migration 064, renomeado de "usa retalhos") — nunca
    // precisa de tamanho de chapa, porque nunca vai rodar nesting nenhum
    // pra esse grupo (só preço, sem chapa nem fita — pedido do usuário
    // 2026-07-31). Cor Especial (migration 074, ex.: EGGER) também nunca
    // precisa — nesting pulado igual, só que a fita continua contando (ver
    // renderCutlistPlanResults).
    if (g.color.stock_in_house || g.color.skip_cutting_plan) return;
    if (g.color.default_sheet_size_id) {
      g.sheetSize = cutlistSheetSizesCache.find((s) => s.id === g.color.default_sheet_size_id) || null;
    }
  });
  const needsManual = groups.filter((g) => !g.color.stock_in_house && !g.color.skip_cutting_plan && !g.sheetSize);
  if (needsManual.length > 0) {
    if (cutlistSheetSizesCache.length === 0) {
      const errorEl = document.getElementById('po-cutlist-error');
      errorEl.textContent = I18n.t('cutlist.plan_no_sheet_sizes_error');
      errorEl.style.display = 'block';
      return;
    }
    renderCutlistSheetPickerPanel(groups, needsManual);
    return;
  }
  renderCutlistPlanResults(groups);
}

// Painel inline (mesmo padrão visual da barra de aplicar-em-massa) pra
// escolher manualmente o tamanho de chapa dos grupos sem
// default_sheet_size_id ("cor especial", pedido do usuário 2026-07-31).
function renderCutlistSheetPickerPanel(allGroups, needsManual) {
  cutlistPendingPlanGroups = allGroups;
  const panel = document.getElementById('po-cutlist-plan-picker-panel');
  if (!panel) return;
  const options = cutlistSheetSizesCache.map((s) => `<option value="${s.id}">${escapeHtmlCutlist(s.name)} (${s.width_mm} x ${s.height_mm}mm)</option>`).join('');
  panel.innerHTML = `
    <p class="hint" style="margin:0 0 8px;">${I18n.t('cutlist.plan_choose_size_hint')}</p>
    ${needsManual.map((g) => `
      <div class="row" style="align-items:center; margin-bottom:8px;" data-plan-group-key="${g.key}">
        <div style="flex:0 0 auto; min-width:180px;"><strong>${escapeHtmlCutlist(g.color.name)}</strong> — ${g.espessura_mm}mm</div>
        <div><select class="po-project-input plan-picker-select" data-key="${g.key}">${options}</select></div>
      </div>
    `).join('')}
    <button type="button" class="po-btn-primary-block plan-picker-confirm-btn" style="margin-top:8px;">${I18n.t('cutlist.plan_generate_confirm_btn')}</button>
  `;
  panel.style.display = 'block';
  panel.querySelector('.plan-picker-confirm-btn').addEventListener('click', () => {
    if (!cutlistPendingPlanGroups) return;
    panel.querySelectorAll('.plan-picker-select').forEach((sel) => {
      const g = cutlistPendingPlanGroups.find((gr) => gr.key === sel.dataset.key);
      if (g) g.sheetSize = cutlistSheetSizesCache.find((s) => s.id === sel.value) || null;
    });
    const resolvedGroups = cutlistPendingPlanGroups;
    panel.style.display = 'none';
    cutlistPendingPlanGroups = null;
    renderCutlistPlanResults(resolvedGroups);
  });
}

// Linhas de veio (pedido do usuário 2026-08-02: "quero mostrar veios no
// desenho da peca quando tiver") — só desenhadas quando p.grain=true (ver
// packSheetsMaxRects, que propaga row.has_grain pra cá através de
// piece.grain). Peça com veio NUNCA gira (mesma trava em placeInSheet), então
// p.w é sempre o comprimento original da peça — as linhas seguem PARALELAS a
// esse lado (horizontais dentro do retângulo, espaçadas ao longo de p.h),
// simulando o sentido do veio da madeira. Cosmético/estimativo, não muda o
// encaixe (ver packSheetsMaxRects pra trava de verdade).
function cutlistGrainLinesSVG(x, y, w, h) {
  if (w < 12 || h < 12) return ''; // peça pequena demais no diagrama — linhas só poluiriam
  const spacing = 7;
  const lines = [];
  for (let ly = y + spacing / 2; ly < y + h; ly += spacing) {
    lines.push(`<line x1="${(x + 2).toFixed(1)}" y1="${ly.toFixed(1)}" x2="${(x + w - 2).toFixed(1)}" y2="${ly.toFixed(1)}" stroke="#8a6d3b" stroke-width="0.6" opacity="0.5"/>`);
  }
  return lines.join('');
}

// Desenha uma chapa como SVG (retângulos + rótulo peça/dimensão), escalado
// pra caber num container de largura fixa — mesmo espírito visual do
// diagrama de referência (chapa com as peças encaixadas e legendadas).
function renderCutlistSheetSVG(sheet) {
  const maxW = 620;
  const scale = maxW / sheet.width;
  const svgW = Math.round(sheet.width * scale);
  const svgH = Math.round(sheet.height * scale);
  const rects = sheet.placed.map((p) => {
    const x = p.x * scale, y = p.y * scale, w = p.w * scale, h = p.h * scale;
    const fill = p.overflow ? '#f5c2c7' : '#bcd9ee';
    const stroke = p.overflow ? '#c0392b' : '#4a6fa5';
    const fontSize = Math.max(8, Math.min(12, Math.min(w, h) / 6));
    const label = escapeHtmlCutlist(p.label);
    const dims = `${Math.round(p.w)} x ${Math.round(p.h)}${p.rotated ? ' ↻' : ''}`;
    const showText = w > 30 && h > 16;
    return `<g>
      <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>
      ${p.grain ? cutlistGrainLinesSVG(x, y, w, h) : ''}
      ${showText ? `<text x="${(x + w / 2).toFixed(1)}" y="${(y + h / 2 - 5).toFixed(1)}" font-size="${fontSize}" text-anchor="middle" fill="#333">${label}</text>
      <text x="${(x + w / 2).toFixed(1)}" y="${(y + h / 2 + 9).toFixed(1)}" font-size="${fontSize}" text-anchor="middle" fill="#333">${dims}</text>` : ''}
    </g>`;
  }).join('');
  return `<svg viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}" style="border:2px solid #333; background:#fff; max-width:100%; display:block; margin:0 auto;">${rects}</svg>`;
}

// Preço de um grupo cor+espessura (mesma matemática de computeCutlistTotal,
// só somada por grupo em vez do pedido inteiro) — usado pelas linhas STOCK
// IN HOUSE do Plano de Corte, que mostram só o preço (sem chapa/fita).
// Depende de computeCutlistTotal() já ter rodado nesta chamada (popula
// row._total_price em cada linha, pré-margem) — ver chamada logo no início
// de renderCutlistPlanResults.
function computeCutlistGroupPrice(colorId, espessuraMm) {
  let subtotal = 0;
  cutlistRows.forEach((row) => {
    if (row.color_id !== colorId || Number(row.espessura_mm) !== espessuraMm) return;
    subtotal += Number(row._total_price) || 0;
  });
  return subtotal * cutlistPricingSettings.cutting_list_markup_multiplier;
}

// Roda o nesting de cada grupo e monta a tela de resultado: resumo (chapas
// por material + total, metros de fita por material + total) e os
// diagramas chapa a chapa. Peça maior que a chapa escolhida entra como
// "overflow" (destacada em vermelho) em vez de travar a geração inteira.
// Grupo de cor STOCK IN HOUSE (migration 064, renomeado de "usa retalhos")
// pula o nesting inteiro E não mostra fita — só o preço do grupo (pedido do
// usuário 2026-07-31), não entra em grandTotalSheets nem grandTotalEdgeM.
function renderCutlistPlanResults(groups) {
  const results = document.getElementById('po-cutlist-plan-results');
  if (!results) return;
  computeCutlistTotal(); // popula row._total_price em cutlistRows — usado por computeCutlistGroupPrice
  const oversizeWarnings = [];
  let grandTotalSheets = 0;
  let grandTotalEdgeM = 0;
  let grandTotalStockPrice = 0;

  const summaryRows = [];
  const sheetsHtml = [];

  groups.forEach((g) => {
    // STOCK IN HOUSE — sem nesting/contagem de chapa e sem metro de fita,
    // só a lista de peças (agrupada por peça+medida, senão viraria uma
    // linha por unidade) e o preço do grupo.
    if (g.color.stock_in_house) {
      const groupPrice = computeCutlistGroupPrice(g.color.id, g.espessura_mm);
      grandTotalStockPrice += groupPrice;
      const pieceCounts = new Map();
      g.pieces.forEach((p) => {
        const key = `${p.label}|${p.w}|${p.h}`;
        if (!pieceCounts.has(key)) pieceCounts.set(key, { label: p.label, w: p.w, h: p.h, qty: 0 });
        pieceCounts.get(key).qty += 1;
      });
      summaryRows.push(`
        <tr>
          <td>${escapeHtmlCutlist(g.color.name)} — ${g.espessura_mm}mm</td>
          <td>${I18n.t('cutlist.plan_stock_label')}</td>
          <td>—</td>
          <td>—</td>
          <td>${formatMoney(groupPrice)}</td>
        </tr>
      `);
      sheetsHtml.push(`<h3 style="margin-top:22px;">${escapeHtmlCutlist(g.color.name)} — ${g.espessura_mm}mm · ${I18n.t('cutlist.plan_stock_label')}</h3>`);
      sheetsHtml.push(`
        <table>
          <thead><tr>
            <th>${I18n.t('cutlist.col_part_name')}</th>
            <th>${I18n.t('cutlist.col_length')}</th>
            <th>${I18n.t('cutlist.col_width')}</th>
            <th>${I18n.t('cutlist.col_quantity')}</th>
          </tr></thead>
          <tbody>${Array.from(pieceCounts.values()).map((p) => `<tr><td>${escapeHtmlCutlist(p.label)}</td><td>${Math.round(p.w)}</td><td>${Math.round(p.h)}</td><td>${p.qty}</td></tr>`).join('')}</tbody>
        </table>
      `);
      return;
    }
    // COR ESPECIAL (migration 074, ex.: EGGER, pedido do usuário 2026-08-02:
    // "cutting list quando usar cores egger nao quero que gere plano de
    // corte") — diferente de STOCK IN HOUSE: a fita de borda CONTINUA
    // contando normalmente (entra em grandTotalEdgeM), só a diagramação/
    // contagem de chapa é pulada (chapa EGGER especial não segue os tamanhos
    // padrão cadastrados, nem faz sentido nestear). Mesma lista de peças
    // agrupadas do STOCK IN HOUSE, sem preço extra aqui (o preço já entra no
    // total normal de "Gerar Preço", igual pros grupos nesteados).
    if (g.color.skip_cutting_plan) {
      grandTotalEdgeM += g.edgeM;
      const pieceCounts = new Map();
      g.pieces.forEach((p) => {
        const key = `${p.label}|${p.w}|${p.h}`;
        if (!pieceCounts.has(key)) pieceCounts.set(key, { label: p.label, w: p.w, h: p.h, qty: 0 });
        pieceCounts.get(key).qty += 1;
      });
      summaryRows.push(`
        <tr>
          <td>${escapeHtmlCutlist(g.color.name)} — ${g.espessura_mm}mm</td>
          <td>${I18n.t('cutlist.plan_special_label')}</td>
          <td>—</td>
          <td>${g.edgeM.toFixed(2)} m</td>
          <td>—</td>
        </tr>
      `);
      sheetsHtml.push(`<h3 style="margin-top:22px;">${escapeHtmlCutlist(g.color.name)} — ${g.espessura_mm}mm · ${I18n.t('cutlist.plan_special_label')}</h3>`);
      sheetsHtml.push(`
        <table>
          <thead><tr>
            <th>${I18n.t('cutlist.col_part_name')}</th>
            <th>${I18n.t('cutlist.col_length')}</th>
            <th>${I18n.t('cutlist.col_width')}</th>
            <th>${I18n.t('cutlist.col_quantity')}</th>
          </tr></thead>
          <tbody>${Array.from(pieceCounts.values()).map((p) => `<tr><td>${escapeHtmlCutlist(p.label)}</td><td>${Math.round(p.w)}</td><td>${Math.round(p.h)}</td><td>${p.qty}</td></tr>`).join('')}</tbody>
        </table>
      `);
      return;
    }
    if (!g.sheetSize) return; // defesa — não deveria sobrar grupo sem tamanho aqui
    const oversizePieces = g.pieces.filter((p) => !cutlistPieceFitsSheet(p.w, p.h, g.sheetSize.width_mm, g.sheetSize.height_mm, p.grain));
    if (oversizePieces.length > 0) {
      oversizeWarnings.push(I18n.t('cutlist.plan_oversize_warning', {
        color: g.color.name, size: `${g.sheetSize.width_mm} x ${g.sheetSize.height_mm}`
      }));
    }
    const sheets = packSheetsMaxRects(g.pieces, g.sheetSize.width_mm, g.sheetSize.height_mm, Number(g.sheetSize.kerf_mm) || 0);
    grandTotalSheets += sheets.length;
    grandTotalEdgeM += g.edgeM;

    summaryRows.push(`
      <tr>
        <td>${escapeHtmlCutlist(g.color.name)} — ${g.espessura_mm}mm</td>
        <td>${escapeHtmlCutlist(g.sheetSize.name)} (${g.sheetSize.width_mm} x ${g.sheetSize.height_mm}mm)</td>
        <td>${sheets.length}</td>
        <td>${g.edgeM.toFixed(2)} m</td>
        <td>—</td>
      </tr>
    `);

    sheetsHtml.push(`<h3 style="margin-top:22px;">${escapeHtmlCutlist(g.color.name)} — ${g.espessura_mm}mm · ${escapeHtmlCutlist(g.sheetSize.name)}</h3>`);
    sheets.forEach((sheet, idx) => {
      sheetsHtml.push(`
        <div style="margin:12px 0;">
          <p class="hint" style="margin-bottom:6px;">${I18n.t('cutlist.plan_sheet_label', { n: idx + 1, total: sheets.length })}</p>
          ${renderCutlistSheetSVG(sheet)}
        </div>
      `);
    });
  });

  results.innerHTML = `
    <h3>${I18n.t('cutlist.plan_summary_title')}</h3>
    ${oversizeWarnings.length ? `<p class="error" style="display:block;">${oversizeWarnings.join('<br/>')}</p>` : ''}
    <table>
      <thead><tr>
        <th>${I18n.t('cutlist.plan_col_material')}</th>
        <th>${I18n.t('cutlist.plan_col_sheet_size')}</th>
        <th>${I18n.t('cutlist.plan_col_sheet_count')}</th>
        <th>${I18n.t('cutlist.plan_col_edge_m')}</th>
        <th>${I18n.t('cutlist.plan_col_price')}</th>
      </tr></thead>
      <tbody>${summaryRows.join('')}</tbody>
    </table>
    <p style="margin-top:10px;">
      <strong>${I18n.t('cutlist.plan_total_sheets', { n: grandTotalSheets })}</strong>
      · <strong>${I18n.t('cutlist.plan_total_edge_m', { m: grandTotalEdgeM.toFixed(2) })}</strong>
      ${grandTotalStockPrice > 0 ? ` · <strong>${I18n.t('cutlist.plan_total_stock_price', { v: formatMoney(grandTotalStockPrice) })}</strong>` : ''}
    </p>
    <button type="button" class="secondary" id="po-cutlist-plan-close-btn" style="margin-top:6px;">${I18n.t('cutlist.plan_close_btn')}</button>
    ${sheetsHtml.join('')}
  `;
  results.style.display = 'block';
  const closeBtn = document.getElementById('po-cutlist-plan-close-btn');
  if (closeBtn) closeBtn.addEventListener('click', hideCutlistPlanResults);
  results.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- Importação de planilha (.xlsx/.csv/.txt via SheetJS) ----------

function parseCutlistDelimitedText(text) {
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const firstLine = lines[0];
  const delimiter = firstLine.includes(';') ? ';' : firstLine.includes('\t') ? '\t' : ',';
  return lines.map((line) => line.split(delimiter).map((cell) => cell.trim()));
}

function mapImportedRowsToCutlist(rowsArray) {
  if (!rowsArray || rowsArray.length === 0) return [];
  const firstRow = (rowsArray[0] || []).map((c) => String(c == null ? '' : c).trim().toLowerCase());
  const looksLikeHeader = firstRow.some((c) => ['op', 'peça', 'peca', 'part', 'pieza', 'nome da peça'].includes(c));
  const dataRows = looksLikeHeader ? rowsArray.slice(1) : rowsArray;
  return dataRows
    .filter((r) => (r || []).some((cell) => String(cell == null ? '' : cell).trim() !== ''))
    .map((r) => {
      const [op, partName, quantity, comprimento, largura, espessura, colorName, edgeRaw, obs, grainRaw] = r;
      const thickness = Number(espessura) === 38 ? 38 : 19; // qualquer valor diferente de 38 cai no padrão seguro (19)
      const edge = [0, 2, 4].includes(Number(edgeRaw)) ? Number(edgeRaw) : 0;
      const matchedColor = cutlistColorsCache.find((c) => c.name.trim().toLowerCase() === String(colorName == null ? '' : colorName).trim().toLowerCase());
      // Veio (migration 073) — coluna nova no FIM da linha (não no meio, pra
      // não quebrar planilhas antigas de quem já importava sem essa coluna).
      // Aceita sim/não, yes/no, sí, true/false, 1/0 — qualquer coisa fora
      // dessa lista cai no padrão seguro (sem veio, livre pra girar).
      const grainStr = String(grainRaw == null ? '' : grainRaw).trim().toLowerCase();
      const hasGrain = ['sim', 'yes', 'sí', 'si', 'true', '1'].includes(grainStr);
      return Object.assign(newCutlistRow(), {
        op: op || '',
        part_name: partName || '',
        quantity: Number(quantity) || 1,
        comprimento_mm: Number(comprimento) || '',
        largura_mm: Number(largura) || '',
        espessura_mm: thickness,
        color_id: matchedColor ? matchedColor.id : (cutlistColorsCache[0] ? cutlistColorsCache[0].id : null),
        edge_banding: edge,
        has_grain: hasGrain,
        obs: obs || ''
      });
    });
}

async function importCutlistFile(file) {
  const errorEl = document.getElementById('po-cutlist-error');
  const statusEl = document.getElementById('po-cutlist-status');
  errorEl.style.display = 'none';
  try {
    await loadCutlistColors(); // garante o catálogo de cores carregado antes de casar pelo nome
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    let rowsArray;
    if (ext === 'csv' || ext === 'txt') {
      const text = await file.text();
      rowsArray = parseCutlistDelimitedText(text);
    } else {
      if (typeof XLSX === 'undefined') throw new Error(I18n.t('cutlist.xlsx_lib_missing_error'));
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      rowsArray = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
    }
    const imported = mapImportedRowsToCutlist(rowsArray);
    imported.forEach((r) => cutlistRows.push(r));
    hideCutlistFinalPrice();
    renderCutlistTable();
    statusEl.textContent = I18n.t('cutlist.import_success', { n: imported.length });
    setTimeout(() => { statusEl.textContent = ''; }, 4000);
  } catch (err) {
    errorEl.textContent = I18n.t('cutlist.import_error', { msg: err.message });
    errorEl.style.display = 'block';
  }
}

// Modelo pra download (pedido do usuário 2026-07-20): mesma ordem de colunas
// do hint acima (cutlist.import_format_hint), cabeçalho traduzido no idioma
// atual + 1 linha de exemplo já preenchida. mapImportedRowsToCutlist
// reconhece o cabeçalho (looksLikeHeader) então funciona no reimport normal.
// Comprimento/Largura da PLANILHA ficam sempre em mm, mesmo depois de
// cutlist.col_length/col_width terem virado genéricos (2026-08-02, coluna na
// tela virou unit-aware) — import/export não segue a unidade global (evitaria
// ambiguidade em planilha reaberta depois de trocar a unidade), então o
// cabeçalho aqui deixa a unidade explícita "(mm)" na mão, sem depender da
// chave i18n genérica.
async function downloadCutlistTemplate() {
  if (typeof XLSX === 'undefined') return;
  await loadCutlistColors(); // garante que a linha de exemplo use uma cor real do catálogo
  const header = [
    I18n.t('cutlist.col_op'),
    I18n.t('cutlist.col_part_name'),
    I18n.t('cutlist.col_quantity'),
    `${I18n.t('cutlist.col_length')} (mm)`,
    `${I18n.t('cutlist.col_width')} (mm)`,
    I18n.t('cutlist.col_thickness'),
    I18n.t('cutlist.col_color'),
    I18n.t('cutlist.col_edge'),
    I18n.t('cutlist.col_obs'),
    I18n.t('cutlist.col_grain')
  ];
  const exampleColorName = cutlistColorsCache[0] ? cutlistColorsCache[0].name : '';
  const exampleRow = ['OP-001', I18n.t('cutlist.template_example_part_name'), 2, 600, 400, 19, exampleColorName, 2, '', I18n.t('cutlist.grain_no')];
  const ws = XLSX.utils.aoa_to_sheet([header, exampleRow]);
  ws['!cols'] = [8, 16, 6, 14, 12, 10, 16, 8, 20, 8].map((w) => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, I18n.t('cutlist.template_sheet_name'));
  XLSX.writeFile(wb, I18n.t('cutlist.template_filename'));
}

// ---------- Botões da aba ----------

const cutlistImportBtn = document.getElementById('po-cutlist-import-btn');
const cutlistImportInput = document.getElementById('po-cutlist-import-input');
if (cutlistImportBtn && cutlistImportInput) {
  cutlistImportBtn.addEventListener('click', () => cutlistImportInput.click());
  cutlistImportInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = ''; // permite reimportar o mesmo arquivo depois
    if (file) await importCutlistFile(file);
  });
}

const cutlistDownloadTemplateBtn = document.getElementById('po-cutlist-download-template-btn');
if (cutlistDownloadTemplateBtn) cutlistDownloadTemplateBtn.addEventListener('click', () => downloadCutlistTemplate());

const cutlistAddRowBtn = document.getElementById('po-cutlist-add-row-btn');
if (cutlistAddRowBtn) cutlistAddRowBtn.addEventListener('click', () => addCutlistRow());

const cutlistClearBtn = document.getElementById('po-cutlist-clear-btn');
if (cutlistClearBtn) cutlistClearBtn.addEventListener('click', () => clearCutlistRows());

// Extraído do handler de "Gerar Preço" (pedido do usuário 2026-07-31: mesma
// validação precisa rodar antes de "Gerar Plano de Corte") — comportamento
// idêntico ao de antes, só isolado numa função reaproveitável.
function validateCutlistRowsWithUI() {
  const errorEl = document.getElementById('po-cutlist-error');
  errorEl.style.display = 'none';
  if (cutlistRows.length === 0) {
    errorEl.textContent = I18n.t('cutlist.no_rows_error');
    errorEl.style.display = 'block';
    return false;
  }
  if (!validateCutlistRows()) {
    // Mensagem detalhada por linha (pedido do usuário 2026-07-29: "a
    // mensagem nao esta clara do que esta faltando pra gerar o preco") —
    // antes era um aviso genérico só. cutlistValidationAttempted=true
    // liga o destaque vermelho de verdade nos campos (ver
    // refreshCutlistRowHighlight) a partir deste re-render.
    cutlistValidationAttempted = true;
    const fieldLabel = {
      part_name: I18n.t('cutlist.col_part_name'),
      quantity: I18n.t('cutlist.col_quantity'),
      comprimento: I18n.t('cutlist.col_length'),
      largura: I18n.t('cutlist.col_width'),
      espessura: I18n.t('cutlist.col_thickness'),
      color: I18n.t('cutlist.col_color'),
      edge: I18n.t('cutlist.col_edge'),
      edge4blocked: I18n.t('cutlist.edge_4_blocked_title')
    };
    const rowLines = [];
    cutlistRows.forEach((row, idx) => {
      const issues = getCutlistRowIssues(row);
      if (issues.length) {
        rowLines.push(I18n.t('cutlist.row_issue_group', { n: idx + 1, fields: issues.map((k) => fieldLabel[k]).join(', ') }));
      }
    });
    errorEl.textContent = rowLines.length
      ? `${I18n.t('cutlist.invalid_rows_error')} ${rowLines.join(' | ')}`
      : I18n.t('cutlist.invalid_rows_error');
    errorEl.style.display = 'block';
    renderCutlistTable();
    return false;
  }
  return true;
}

const cutlistGenerateBtn = document.getElementById('po-cutlist-generate-price-btn');
if (cutlistGenerateBtn) {
  cutlistGenerateBtn.addEventListener('click', () => {
    if (!validateCutlistRowsWithUI()) return;
    cutlistFinalPrice = computeCutlistTotal();
    document.getElementById('po-cutlist-final-price').textContent = formatMoney(cutlistFinalPrice);
    document.getElementById('po-cutlist-final-price-row').style.display = 'flex';
    document.getElementById('po-cutlist-save-btn').style.display = 'inline-block';
    document.getElementById('po-cutlist-approve-save-btn').style.display = 'inline-block';
  });
}

const cutlistGeneratePlanBtn = document.getElementById('po-cutlist-generate-plan-btn');
if (cutlistGeneratePlanBtn) {
  cutlistGeneratePlanBtn.addEventListener('click', () => {
    if (!validateCutlistRowsWithUI()) return;
    startCutlistPlanFlow();
  });
}

// Dois botões, dois destinos (pedido do usuário 2026-07-19):
// "Salvar" -> status='saved' (migration 052) — fica só no "Meus Pedidos" do
// cliente, NÃO aparece na lista de Pedidos do admin (não vai pra fábrica).
// "Aprovar" -> status='approved' — aparece pro cliente E pro admin
// (produção/fábrica), igual ao pedido de módulo aprovado.
async function saveCutlistOrder(finalStatus) {
  const errorEl = document.getElementById('po-cutlist-error');
  const statusEl = document.getElementById('po-cutlist-status');
  errorEl.style.display = 'none';
  if (cutlistFinalPrice === null) return; // defesa extra — botões só aparecem depois de "Gerar Preço"
  statusEl.textContent = '…';
  try {
    const poName = document.getElementById('po-cutlist-order-name').value.trim();
    const isApproved = finalStatus === 'approved';
    const { data: order, error: orderError } = await supabaseClient
      .from('orders')
      .insert({
        client_user_id: currentUser.id,
        client_name: currentUser.email,
        client_email: currentUser.email,
        po_name: poName || null,
        order_type: 'cutting_list',
        status: finalStatus,
        submitted_at: new Date().toISOString(),
        approved_at: isApproved ? new Date().toISOString() : null
      })
      .select()
      .single();
    if (orderError) throw orderError;

    const itemsPayload = cutlistRows.map((row, idx) => {
      const color = cutlistColorsCache.find((c) => c.id === row.color_id);
      return {
        order_id: order.id,
        op: row.op || null,
        part_name: row.part_name,
        quantity: Number(row.quantity),
        comprimento_mm: Number(row.comprimento_mm),
        largura_mm: Number(row.largura_mm),
        espessura_mm: Number(row.espessura_mm),
        color_id: row.color_id,
        color_name: color ? color.name : null,
        edge_banding: Number(row.edge_banding),
        has_grain: !!row.has_grain,
        obs: row.obs || null,
        unit_price: Number((row._unit_price || 0).toFixed(2)),
        total_price: Number((row._total_price || 0).toFixed(2)),
        sort_order: idx
      };
    });
    const { error: itemsError } = await supabaseClient.from('cutting_list_items').insert(itemsPayload);
    if (itemsError) throw itemsError;

    statusEl.textContent = isApproved ? I18n.t('cutlist.approve_success') : I18n.t('cutlist.save_success');
    cutlistRows = [];
    hideCutlistFinalPrice();
    document.getElementById('po-cutlist-order-name').value = '';
    renderCutlistTable();
    myOrdersLoaded = false; // força "Meus Pedidos" recarregar na próxima visita
    setTimeout(() => { statusEl.textContent = ''; }, 6000);
  } catch (err) {
    statusEl.textContent = '';
    errorEl.textContent = I18n.t('cutlist.save_error', { msg: err.message });
    errorEl.style.display = 'block';
  }
}

const cutlistSaveBtn = document.getElementById('po-cutlist-save-btn');
if (cutlistSaveBtn) cutlistSaveBtn.addEventListener('click', () => saveCutlistOrder('saved'));
const cutlistApproveSaveBtn = document.getElementById('po-cutlist-approve-save-btn');
if (cutlistApproveSaveBtn) cutlistApproveSaveBtn.addEventListener('click', () => saveCutlistOrder('approved'));

// ---------- Visualização read-only de um pedido de Plano de Corte já salvo
// (aberto a partir de "Meus Pedidos" — ver loadMyOrders) ----------

function openCutlistOrderDetail(order, items) {
  document.getElementById('po-orders-list-panel').style.display = 'none';
  document.getElementById('po-cutlist-order-detail-section').style.display = 'block';
  document.getElementById('po-cutlist-order-detail-title').textContent = order.po_name || order.client_name || I18n.t('pdf.order_fallback');
  document.getElementById('po-cutlist-order-detail-status-badge').textContent = orderStatusLabel(order.status);
  // Comprimento/Largura na unidade GLOBAL atual (po-unit-select) — mesma
  // preferência já usada pro resto do portal (ex.: dimensão dos order_items
  // de módulo), não faz sentido um pedido de plano de corte salvo ficar
  // preso em mm enquanto o resto da tela já mostra polegada fracionada.
  // formatDimension já inclui o sufixo da unidade (ex. `23 27/32"`), então o
  // cabeçalho não precisa de rótulo de unidade — cada célula já é
  // autodescritiva.
  const detailUnit = (document.getElementById('po-unit-select') || {}).value || 'mm';
  const tbody = document.getElementById('po-cutlist-order-detail-tbody');
  tbody.innerHTML = (items || []).map((it) => `
    <tr>
      <td>${it.op || '—'}</td>
      <td>${it.part_name}</td>
      <td>${it.quantity}</td>
      <td>${formatDimension(Number(it.comprimento_mm), detailUnit)}</td>
      <td>${formatDimension(Number(it.largura_mm), detailUnit)}</td>
      <td>${it.has_grain ? I18n.t('cutlist.grain_yes') : I18n.t('cutlist.grain_no')}</td>
      <td>${Number(it.espessura_mm).toFixed(0)}mm</td>
      <td>${it.color_name || '—'}</td>
      <td>${it.edge_banding}</td>
      <td>${it.obs || ''}</td>
    </tr>
  `).join('');
  const total = (items || []).reduce((sum, it) => sum + Number(it.total_price || 0), 0);
  document.getElementById('po-cutlist-order-detail-total').textContent = formatMoney(total);
}

const cutlistOrderDetailBackBtn = document.getElementById('po-cutlist-order-detail-back-btn');
if (cutlistOrderDetailBackBtn) {
  cutlistOrderDetailBackBtn.addEventListener('click', () => {
    document.getElementById('po-cutlist-order-detail-section').style.display = 'none';
    document.getElementById('po-orders-list-panel').style.display = 'block';
  });
}

// ---------- Projetos (canvas 2D — pedido do usuário, 2026-07-21) ----------
// "quero fazer uma tela de projetos mesmo... busca o modulo na biblioteca ao
// lado esquerdo. joga no ambiente visao frontal 2D paralela (nao
// perspectiva) e ao clicar no modulo abre configuracoes da direita... deve
// dar pra arrastar esse modulo no ambiente, e ele deve ter um tipo iman que
// puxe os cantos dele pra eles se conectarem melhor... ao colocar um modulo
// na frente do outro, ele deve levar o modulo novo pra frente".
//
// FASE 1 (entrega faseada combinada com o usuário — risco menor que tudo de
// uma vez): canvas 2D com arrastar/imã/profundidade, painel de config à
// direita (resumo + botão pra reabrir a configuração completa) e preço
// total. Fases seguintes (NÃO estão aqui ainda): vista 3D com portas/
// gavetas, vista superior, lista de módulos, salvar projeto, gerar IA,
// comprar, ajuda.
//
// Arquitetura: projectSlots tem o MESMO formato de compositionSlots (mesmos
// campos width_mm/height_mm/depth_mm/colorsByRole/pieces/result/etc. — ver
// po-add-item-btn) + x_mm (posição horizontal, novo) — floor_height_mm já
// existia (era só um campo manual de altura na Composição) e vira aqui a
// posição VERTICAL de verdade, arrastável. z_order = profundidade (0 =
// encostado na parede; sobrepor outro módulo no arraste soma 1 acima do
// maior z_order que ele estiver tocando). Reaproveita 100% do configurador
// de módulo único que a Composição já usa (startProjectSlotConfig imita
// startCompositionSlotConfig; restoreSlotStateIntoConfigurator é chamada
// direto, sem duplicar) — só muda o destino do "Adicionar".

let projectSlots = [];
let addTargetProjectSlotId = null; // null = não está configurando módulo de projeto agora
let selectedProjectSlotId = null;  // slot mostrado no painel de config à direita
let projectSlotIdSeq = 0;
