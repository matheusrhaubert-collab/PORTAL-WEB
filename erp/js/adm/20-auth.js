/* Painel admin — carga inicial dentro do ERP
 *
 * Pedaço 21/21 do antigo js/admin.js. Este é o ÚNICO que foi reescrito em
 * vez de só mudar de casa, porque era justamente a parte que não sobrevive
 * à mudança: o admin tinha login próprio (formulário, allow-list, logout) e
 * agora quem faz isso é o ERP, uma vez só, no APP.boot.
 *
 * O que sobrou aqui é a carga inicial — a ordem em que os cadastros são
 * lidos, que é sensível e foi mantida linha por linha do original: margens
 * antes de famílias, papéis de cor antes de tipos de componente, funções de
 * módulo antes de módulos. Mexer nessa ordem quebra selects pela metade.
 */

/* Carrega o painel inteiro. Roda UMA vez, na primeira vez que o usuário
   abre um cadastro — não no boot do ERP. Quem só vai olhar Lotes não paga
   por ler o catálogo de módulos. */
async function showLoggedIn() {
  document.getElementById('color-active').checked = true;
  document.getElementById('color-swatch-hex').value = '#cccccc';
  document.getElementById('module-active').checked = true;
  document.getElementById('component-quantity').value = 1;
  // ANTES de families/categories (migration 070) — marginProfileLabel() usa
  // marginProfilesCache pra mostrar o nome da margem vinculada na tabela,
  // precisa estar populado no 1º render de families-tbody/categories-tbody.
  await loadMarginProfiles();
  await familiesCRUD.load();
  await categoriesCRUD.load();
  await subcategoriesCRUD.load();
  await hingeModelsCRUD.load();
  await slideModelsCRUD.load();
  await laborTypesCRUD.load();
  await colorRolesCRUD.load(); // antes de loadComponentTypes — o form de tipo de componente já nasce com o <select> de papel populado
  // migration 080 — funções/receitas precisam vir ANTES de loadModules: o
  // <select id="module-function"> do formulário de módulo é populado a partir
  // de moduleFunctionsCache, e a árvore de módulos mostra o nome da função.
  await loadModuleFunctions();
  await loadRoomTypes();
  await loadPricingSettings();
  // ITENS COMPRADOS (migration 119) — DEPOIS de loadMarginProfiles (os
  // selects de margem saem de marginProfilesCache) e DEPOIS de
  // loadPricingSettings (o perfil padrão dos comprados mora lá). Antes de
  // loadComponents, que é quem vai querer apontar pro item comprado.
  //
  // aplicarMargemDosComprados só depois dos DOIS carregados: ele publica no
  // Pricing a margem e o catálogo, e publicar meio catálogo é pior que não
  // publicar — o preço sairia com metade da ferragem, sem erro nenhum.
  await loadPurchasedItems();
  await loadHardwareRules();
  aplicarMargemDosComprados(pricingSettingsCache);
  await loadComponentTypes();
  await loadSheetSizes();
  await loadColors();
  await loadComponents();
  await loadModules();
}

/* showLoggedOut() existia para voltar à tela de login do próprio admin.
   Dentro do ERP não há para onde voltar — sair é o botão Sair do ERP. Fica
   como função vazia porque o resto do código ainda a chama em caminhos de
   erro, e sumir com ela quebraria esses caminhos. */
function showLoggedOut() {}

/* A conferência de admin (RPC is_admin, allow-list admin_users) continua
   existindo, mas mora no ERP agora: DATA.isAdmin, checado no APP.boot antes
   de mostrar qualquer tela. Chegar aqui já significa ter passado por ela.
   Mantida como função para não quebrar quem a chama. */
async function ensureAdminOrSignOut() { return true; }
