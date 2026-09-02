// ==========================================================================
// CENTRAL DE AJUDA (02/09) — pedido do Matt: "precisamos de um help para os
// clientes, mostrando tutorial de cada ferramenta como funciona. separado
// por abas, e bem completo, nas 3 linguas, com botao de ajuda e procurar.
// algo que seja intuitivo e realmente bom pra tirar duvidas de como
// funciona pros clientes. tipo kb.promob (pesquisa)".
//
// O botão "Ajuda" já existia solto no topo (nav.help, portal.html) mas
// nunca fazia nada (cursor:default) — virou o botão real #po-help-btn.
//
// Por que o conteúdo mora AQUI e não em js/i18n.js: i18n.js é um dicionário
// chave→string curta (milhares de entradas, mas cada uma é uma frase). Os
// artigos daqui são parágrafos/listas — HTML de verdade, por categoria. Cada
// idioma é uma árvore independente (HELP_CONTENT.pt/en/es), sem depender de
// I18n.t() por artigo (só a "moldura" do modal — título, placeholder da
// busca — usa data-i18n, ver help.* em i18n.js).
//
// Estrutura: HELP_CONTENT[lang] = [ { id, title, articles: [ { id, title,
// html } ] }, ... ]. A busca (helpBuildSearchIndex) lê o texto puro (sem
// tags) de cada artigo do idioma ATUAL e filtra por substring no título
// (peso maior) e no corpo.
// ==========================================================================

const HELP_CONTENT = {
  pt: [],
  en: [],
  es: [],
};

HELP_CONTENT.pt.push(
  { id: 'inicio', title: `Como começar`, articles: [
    { id: 'visao-geral', title: `Visão geral do portal`, html: `<p>O LEGNO PORTAL WEB é onde você monta orçamentos de móveis planejados, acompanha seus pedidos e organiza os projetos da sua casa ou revenda. As abas do menu superior organizam cada etapa do trabalho:</p>
<ul>
<li><strong>Novo Orçamento</strong> — escolha módulos no catálogo, configure medidas, cores e opcionais e veja o preço na hora.</li>
<li><strong>Meus Pedidos</strong> — acompanhe pedidos em rascunho ou já enviados, preencha os dados de entrega e aprove o pedido final.</li>
<li><strong>Projetos</strong> — monte um ambiente inteiro (cozinha, quarto etc.) num canvas, posicionando vários módulos juntos.</li>
<li><strong>Meus Projetos</strong> — lista dos projetos salvos, para retomar, renomear ou excluir depois.</li>
<li><strong>Galeria</strong> — veja fotos e inspirações de ambientes já montados.</li>
</ul>
<div class="po-help-tip">Se você é Contractor, existe ainda uma aba <strong>Plano de Corte</strong>, com a lista técnica de corte/produção gerada a partir dos pedidos — ela só aparece pra esse perfil.</div>` },
    { id: 'conta-idioma-unidade', title: `Conta, idioma e unidade de medida`, html: `<p>Para usar o portal você precisa de uma conta. Se ainda não tiver uma, clique em <strong>Entrar</strong> no topo da tela, depois em <strong>Criar conta</strong> e preencha nome, e-mail, telefone e senha. Já tem conta? Preencha e-mail e senha e clique em <strong>Entrar</strong> — ou use o botão <strong>Continuar com Google</strong> pra entrar mais rápido, se essa opção estiver disponível.</p>
<p>Para trocar o idioma ou a unidade de medida, clique no ícone de engrenagem (⚙) no canto superior direito. O painel de <strong>Configurações</strong> que abre tem o seletor de <strong>Idioma</strong> (Português/English/Español) e o de <strong>Unidade de medida</strong> (mm, cm, m, polegada fracionada ou pés) — a unidade escolhida vale pro portal inteiro, incluindo o catálogo e o configurador de módulos.</p>` }
  ] },
  { id: 'novo-orcamento', title: `Novo Orçamento`, articles: [
    { id: 'buscar-modulos', title: `Como buscar e filtrar módulos`, html: `<p>Na aba <strong>Novo Orçamento</strong>, a etapa <strong>1. Escolha os módulos</strong> mostra a vitrine completa do catálogo. Para encontrar o módulo certo mais rápido:</p>
<ul>
<li>Use as abas de <strong>família</strong> no topo da vitrine (a barra maior) e depois as pills de <strong>Categoria</strong> e <strong>Subcategoria</strong> logo abaixo — cada nível só mostra as opções que realmente têm módulos disponíveis.</li>
<li>Digite um termo no campo <strong>Buscar módulo por nome...</strong> para filtrar por nome.</li>
<li>Use os três seletores de faixa (<strong>Largura</strong>, <strong>Altura</strong>, <strong>Profundidade</strong>) para restringir a busca por tamanho.</li>
<li>Alterne entre visualização em <strong>Grade</strong> ou <strong>Lista</strong> nos botões acima da vitrine.</li>
</ul>
<div class="po-help-tip">A pill <strong>Todas</strong>, no fim de cada barra de filtro, limpa aquele filtro específico e volta a mostrar todos os módulos daquele nível.</div>` },
    { id: 'medidas-cores-preco', title: `Medidas, cores e preço do módulo`, html: `<p>Ao clicar no nome, na imagem ou nas medidas de um módulo na vitrine, abre a etapa <strong>2. Configure as medidas e os opcionais</strong>. Ali você ajusta:</p>
<ul>
<li><strong>Largura, Altura e Profundidade</strong> — arraste o controle deslizante, digite um valor exato no campo ao lado, ou clique num dos atalhos de medida pré-definida (chips) logo abaixo de cada campo.</li>
<li><strong>Cores</strong> — escolha o acabamento de cada parte do módulo nos grupos de amostras (swatches) que aparecem logo abaixo do visualizador 3D.</li>
<li><strong>Opcionais</strong> — marque itens extras disponíveis para aquele módulo (pode marcar mais de um).</li>
</ul>
<p>O <strong>Preço deste módulo</strong> é recalculado automaticamente a cada mudança, junto com o volume (m³) e peso estimados. Alguns módulos já têm uma <strong>referência (SKU)</strong> com medida fixa: nesse caso, um menu de referência aparece direto no card da vitrine e insere o módulo pronto no carrinho sem passar por essa tela.</p>
<div class="po-help-tip">Itens marcados como <strong>Decorativo</strong> não têm preço nem entram no total do orçamento — servem só pra compor a visualização 3D.</div>` },
    { id: 'carrinho-pedido', title: `Adicionar ao carrinho e fechar o pedido`, html: `<p>Depois de configurar o módulo, clique em <strong>Adicionar este módulo ao pedido</strong> para colocá-lo no carrinho, que fica na coluna <strong>Seu Pedido</strong> à direita, com a lista de módulos selecionados e o <strong>Total estimado</strong>.</p>
<ul>
<li>Continue escolhendo e configurando outros módulos — cada um vai se somando ao pedido.</li>
<li>Quando terminar, clique em <strong>Revisar pedido</strong> para abrir a tela do pedido.</li>
<li>Preencha nome do cliente, nome do OP/referência, telefone, e-mail e endereço de entrega.</li>
<li>Com todos os campos preenchidos, clique em <strong>Aprovar Pedido</strong> para confirmar.</li>
</ul>
<div class="po-help-tip">Quer recomeçar do zero? Use <strong>Novo Pedido</strong>, na coluna do carrinho — ele avisa antes de esvaziar o pedido atual.</div>` }
  ] },
  { id: 'conta', title: `Minha conta e configurações`, articles: [
    { id: 'configuracoes-gerais', title: `Unidade de medida e outras preferências`, html: `<p>Clique no ícone de engrenagem (⚙) no canto superior direito para abrir o painel de <strong>Configurações</strong>. Nele você encontra:</p>
<ul>
<li><strong>Unidade de medida</strong> — mm, cm, m, polegada fracionada ou pés; afeta todas as medidas mostradas no portal.</li>
<li><strong>Unidade de peso</strong> — quilograma (kg) ou libra (lb), usada junto do preço e do volume de cada módulo/pedido.</li>
<li><strong>Idioma</strong> — troque entre Português, English e Español a qualquer momento.</li>
</ul>
<p>Depois de ajustar, clique em <strong>Salvar</strong> para garantir que a tela de projeto atualize imediatamente.</p>
<div class="po-help-tip">Campos como Pé direito e Rodapé da casa também existem, mas hoje ficam escondidos aqui — quando visíveis, os mesmos valores podem ser preenchidos direto na aba Projetos.</div>` },
    { id: 'margem-logo-dealer', title: `Margem de revenda e logo da sua loja (Dealer)`, html: `<p>Para contas de revenda (perfis Lojista, Contractor e Administrador), o painel de <strong>Configurações</strong> (ícone ⚙) tem campos extras que não aparecem para clientes finais:</p>
<ul>
<li><strong>Margem geral de revenda (%)</strong> — defina sua margem sobre o preço de fábrica; ela é usada para calcular o preço de revenda mostrado na Galeria e em Meus Projetos (não afeta os valores de Meus Pedidos).</li>
<li><strong>Sua logo (na Proposta)</strong> — envie a logo da sua loja para que ela apareça no cabeçalho da Proposta em PDF gerada para o cliente final.</li>
<li><strong>Dados da loja (na Proposta)</strong> — preencha nome e telefone da loja, exibidos junto com a logo na Proposta.</li>
</ul>
<div class="po-help-tip">Se você não vê esses campos no seu painel de Configurações, é porque sua conta não tem permissão de revenda — fale com o administrador se precisar dela.</div>` },
    { id: 'trocar-senha', title: `Como trocar sua senha`, html: `<p>Abra o painel de <strong>Configurações</strong> (ícone ⚙ no canto superior direito) e role até o campo <strong>Trocar senha</strong>. Digite a nova senha (mínimo de 6 caracteres) e clique em <strong>Salvar nova senha</strong>. Não é preciso informar a senha antiga — a troca usa sua sessão já autenticada.</p>
<div class="po-help-tip">Recebeu uma senha simples criada pelo administrador? Esse é o lugar certo pra definir uma senha só sua.</div>` }
  ] }
);

HELP_CONTENT.en.push(
  { id: 'inicio', title: `Getting started`, articles: [
    { id: 'visao-geral', title: `Portal overview`, html: `<p>LEGNO PORTAL WEB is where you build quotes for custom cabinetry, track your orders, and organize the projects for your home or resale business. The tabs in the top menu cover each part of the workflow:</p>
<ul>
<li><strong>New Quote</strong> — pick modules from the catalog, set their size, color and optional extras, and see the price update live.</li>
<li><strong>My Orders</strong> — track draft and submitted orders, fill in delivery details, and approve the final order.</li>
<li><strong>Projects</strong> — lay out a full room (kitchen, bedroom, etc.) on a canvas, placing several modules together.</li>
<li><strong>My Projects</strong> — a list of saved projects you can reopen, rename, or delete later.</li>
<li><strong>Gallery</strong> — browse photos and inspiration from finished layouts.</li>
</ul>
<div class="po-help-tip">If you are a Contractor, there is also a <strong>Cutting List</strong> tab with the technical cutting/production list generated from orders — it only shows up for that role.</div>` },
    { id: 'conta-idioma-unidade', title: `Account, language and unit of measurement`, html: `<p>You need an account to use the portal. If you don't have one yet, click <strong>Log in</strong> at the top of the screen, then <strong>Create account</strong> and fill in your name, email, phone and password. Already have an account? Enter your email and password and click <strong>Log in</strong> — or use <strong>Continue with Google</strong> for a faster sign-in, when that option is available.</p>
<p>To change the language or the unit of measurement, click the gear icon (⚙) in the top-right corner. The <strong>Settings</strong> panel that opens has a <strong>Language</strong> selector (Português/English/Español) and a <strong>Unit of measurement</strong> selector (mm, cm, m, fractional inch, or feet) — the unit you pick applies to the whole portal, including the catalog and the module configurator.</p>` }
  ] },
  { id: 'novo-orcamento', title: `New Quote`, articles: [
    { id: 'buscar-modulos', title: `Searching and filtering modules`, html: `<p>On the <strong>New Quote</strong> tab, step <strong>1. Choose the modules</strong> shows the full catalog. To find the right module faster:</p>
<ul>
<li>Use the <strong>family</strong> tabs at the top of the catalog (the larger bar), then the <strong>Category</strong> and <strong>Subcategory</strong> pills right below — each level only shows options that actually have modules available.</li>
<li>Type into the <strong>Search module by name...</strong> field to filter by name.</li>
<li>Use the three range selects (<strong>Width</strong>, <strong>Height</strong>, <strong>Depth</strong>) to narrow the search by size.</li>
<li>Switch between <strong>Grid</strong> and <strong>List</strong> view with the buttons above the catalog.</li>
</ul>
<div class="po-help-tip">The <strong>All</strong> pill at the end of each filter bar clears that specific filter and shows every module at that level again.</div>` },
    { id: 'medidas-cores-preco', title: `Dimensions, colors and price`, html: `<p>Clicking a module's name, image, or dimensions in the catalog opens step <strong>2. Configure dimensions and options</strong>. There you can adjust:</p>
<ul>
<li><strong>Width, Height and Depth</strong> — drag the slider, type an exact value in the field next to it, or click one of the preset size chips right below each field.</li>
<li><strong>Colors</strong> — pick the finish for each part of the module from the swatch groups shown below the 3D viewer.</li>
<li><strong>Optional extras</strong> — check any extras available for that module (you can select more than one).</li>
</ul>
<p>The <strong>Price of this module</strong> recalculates automatically with every change, along with the estimated volume (m³) and weight. Some modules already have a fixed-size <strong>reference (SKU)</strong>: in that case, a reference dropdown appears right on the catalog card and adds the ready-made module straight to the cart, skipping this screen.</p>
<div class="po-help-tip">Items marked <strong>Decorative</strong> have no price and are not included in the quote total — they are only there to complete the 3D preview.</div>` },
    { id: 'carrinho-pedido', title: `Adding to the cart and placing the order`, html: `<p>After configuring a module, click <strong>Add this module to the order</strong> to place it in the cart, shown in the <strong>Your Order</strong> column on the right, with the list of selected modules and the <strong>Estimated total</strong>.</p>
<ul>
<li>Keep choosing and configuring other modules — each one adds to the order.</li>
<li>When you're done, click <strong>Review order</strong> to open the order screen.</li>
<li>Fill in the client name, PO name/reference, phone, email and delivery address.</li>
<li>With every field filled in, click <strong>Approve Order</strong> to confirm it.</li>
</ul>
<div class="po-help-tip">Want to start over? Use <strong>New Order</strong> in the cart column — it warns you before clearing the current order.</div>` }
  ] },
  { id: 'conta', title: `My account and settings`, articles: [
    { id: 'configuracoes-gerais', title: `Unit of measurement and other preferences`, html: `<p>Click the gear icon (⚙) in the top-right corner to open the <strong>Settings</strong> panel. There you'll find:</p>
<ul>
<li><strong>Unit of measurement</strong> — mm, cm, m, fractional inch, or feet; affects every measurement shown in the portal.</li>
<li><strong>Weight unit</strong> — kilogram (kg) or pound (lb), shown together with the price and volume of each module/order.</li>
<li><strong>Language</strong> — switch between Português, English and Español at any time.</li>
</ul>
<p>After adjusting, click <strong>Save</strong> so the project screen refreshes right away.</p>
<div class="po-help-tip">Fields like Ceiling height and Baseboard also exist, but are hidden here by default — when visible, the same values can be entered directly on the Projects tab.</div>` },
    { id: 'margem-logo-dealer', title: `Resale margin and your store logo (Dealer)`, html: `<p>For resale accounts (Dealer, Contractor and Administrator roles), the <strong>Settings</strong> panel (⚙ icon) has extra fields that don't show up for regular customers:</p>
<ul>
<li><strong>General resale margin (%)</strong> — set your markup over the factory price; it's used to calculate the resale price shown in the Gallery and My Projects (it does not affect the values in My Orders).</li>
<li><strong>Your logo (on the Proposal)</strong> — upload your store's logo so it appears in the header of the PDF Proposal generated for the end customer.</li>
<li><strong>Store info (on the Proposal)</strong> — fill in your store's name and phone number, shown next to the logo on the Proposal.</li>
</ul>
<div class="po-help-tip">Don't see these fields in your Settings panel? Your account doesn't have resale permissions — ask your administrator if you need them.</div>` },
    { id: 'trocar-senha', title: `Changing your password`, html: `<p>Open the <strong>Settings</strong> panel (⚙ icon in the top-right corner) and scroll to the <strong>Change password</strong> field. Type your new password (at least 6 characters) and click <strong>Save new password</strong>. You don't need to enter your old password — the change uses your already-signed-in session.</p>
<div class="po-help-tip">Got a simple password created by the administrator? This is the place to set one that's just yours.</div>` }
  ] }
);

HELP_CONTENT.es.push(
  { id: 'inicio', title: `Cómo empezar`, articles: [
    { id: 'visao-geral', title: `Descripción general del portal`, html: `<p>LEGNO PORTAL WEB es donde armas presupuestos de muebles a medida, haces seguimiento de tus pedidos y organizas los proyectos de tu casa o de tu revendería. Las pestañas del menú superior organizan cada etapa del trabajo:</p>
<ul>
<li><strong>Nuevo Presupuesto</strong> — elige módulos del catálogo, configura medidas, colores y opcionales y mira el precio actualizarse al instante.</li>
<li><strong>Mis Pedidos</strong> — sigue pedidos en borrador o ya enviados, completa los datos de entrega y aprueba el pedido final.</li>
<li><strong>Proyectos</strong> — arma un ambiente completo (cocina, dormitorio, etc.) en un lienzo, colocando varios módulos juntos.</li>
<li><strong>Mis Proyectos</strong> — lista de proyectos guardados para retomar, renombrar o eliminar más tarde.</li>
<li><strong>Galería</strong> — mira fotos e inspiración de ambientes ya armados.</li>
</ul>
<div class="po-help-tip">Si eres Contractor, también existe una pestaña <strong>Plan de Corte</strong>, con la lista técnica de corte/producción generada a partir de los pedidos — solo aparece para ese perfil.</div>` },
    { id: 'conta-idioma-unidade', title: `Cuenta, idioma y unidad de medida`, html: `<p>Para usar el portal necesitas una cuenta. Si todavía no tienes una, haz clic en <strong>Iniciar sesión</strong> en la parte superior de la pantalla, luego en <strong>Crear cuenta</strong> y completa nombre, correo electrónico, teléfono y contraseña. ¿Ya tienes cuenta? Ingresa tu correo y contraseña y haz clic en <strong>Iniciar sesión</strong> — o usa <strong>Continuar con Google</strong> para entrar más rápido, cuando esa opción esté disponible.</p>
<p>Para cambiar el idioma o la unidad de medida, haz clic en el ícono de engranaje (⚙) en la esquina superior derecha. El panel de <strong>Configuración</strong> que se abre tiene el selector de <strong>Idioma</strong> (Português/English/Español) y el de <strong>Unidad de medida</strong> (mm, cm, m, pulgada fraccionada o pies) — la unidad elegida se aplica a todo el portal, incluyendo el catálogo y el configurador de módulos.</p>` }
  ] },
  { id: 'novo-orcamento', title: `Nuevo Presupuesto`, articles: [
    { id: 'buscar-modulos', title: `Cómo buscar y filtrar módulos`, html: `<p>En la pestaña <strong>Nuevo Presupuesto</strong>, el paso <strong>1. Elige los módulos</strong> muestra la vitrina completa del catálogo. Para encontrar el módulo correcto más rápido:</p>
<ul>
<li>Usa las pestañas de <strong>familia</strong> en la parte superior de la vitrina (la barra más grande) y luego las pills de <strong>Categoría</strong> y <strong>Subcategoría</strong> justo abajo — cada nivel solo muestra las opciones que realmente tienen módulos disponibles.</li>
<li>Escribe un término en el campo <strong>Buscar módulo por nombre...</strong> para filtrar por nombre.</li>
<li>Usa los tres selectores de rango (<strong>Ancho</strong>, <strong>Alto</strong>, <strong>Profundidad</strong>) para acotar la búsqueda por tamaño.</li>
<li>Alterna entre la vista en <strong>Cuadrícula</strong> o <strong>Lista</strong> con los botones arriba de la vitrina.</li>
</ul>
<div class="po-help-tip">La pill <strong>Todas</strong>, al final de cada barra de filtro, borra ese filtro específico y vuelve a mostrar todos los módulos de ese nivel.</div>` },
    { id: 'medidas-cores-preco', title: `Medidas, colores y precio`, html: `<p>Al hacer clic en el nombre, la imagen o las medidas de un módulo en la vitrina, se abre el paso <strong>2. Configura las medidas y los opcionales</strong>. Ahí puedes ajustar:</p>
<ul>
<li><strong>Ancho, Alto y Profundidad</strong> — arrastra el control deslizante, escribe un valor exacto en el campo de al lado, o haz clic en uno de los atajos de medida predefinida (chips) justo debajo de cada campo.</li>
<li><strong>Colores</strong> — elige el acabado de cada parte del módulo en los grupos de muestras que aparecen debajo del visor 3D.</li>
<li><strong>Opcionales</strong> — marca los extras disponibles para ese módulo (puedes marcar más de uno).</li>
</ul>
<p>El <strong>Precio de este módulo</strong> se recalcula automáticamente con cada cambio, junto con el volumen (m³) y el peso estimados. Algunos módulos ya tienen una <strong>referencia (SKU)</strong> de medida fija: en ese caso, aparece un menú de referencia directo en la tarjeta de la vitrina que agrega el módulo listo al carrito sin pasar por esta pantalla.</p>
<div class="po-help-tip">Los artículos marcados como <strong>Decorativo</strong> no tienen precio ni entran en el total del presupuesto — solo sirven para completar la vista 3D.</div>` },
    { id: 'carrinho-pedido', title: `Agregar al carrito y cerrar el pedido`, html: `<p>Después de configurar un módulo, haz clic en <strong>Añadir este módulo al pedido</strong> para colocarlo en el carrito, que se muestra en la columna <strong>Tu Pedido</strong> a la derecha, con la lista de módulos seleccionados y el <strong>Total estimado</strong>.</p>
<ul>
<li>Sigue eligiendo y configurando otros módulos — cada uno se suma al pedido.</li>
<li>Cuando termines, haz clic en <strong>Revisar pedido</strong> para abrir la pantalla del pedido.</li>
<li>Completa el nombre del cliente, nombre de la OP/referencia, teléfono, correo electrónico y dirección de entrega.</li>
<li>Con todos los campos completos, haz clic en <strong>Aprobar Pedido</strong> para confirmarlo.</li>
</ul>
<div class="po-help-tip">¿Quieres empezar de nuevo? Usa <strong>Nuevo Pedido</strong>, en la columna del carrito — te avisa antes de vaciar el pedido actual.</div>` }
  ] },
  { id: 'conta', title: `Mi cuenta y configuración`, articles: [
    { id: 'configuracoes-gerais', title: `Unidad de medida y otras preferencias`, html: `<p>Haz clic en el ícono de engranaje (⚙) en la esquina superior derecha para abrir el panel de <strong>Configuración</strong>. Ahí encontrarás:</p>
<ul>
<li><strong>Unidad de medida</strong> — mm, cm, m, pulgada fraccionada o pies; afecta todas las medidas que se muestran en el portal.</li>
<li><strong>Unidad de peso</strong> — kilogramo (kg) o libra (lb), que se muestra junto con el precio y el volumen de cada módulo/pedido.</li>
<li><strong>Idioma</strong> — cambia entre Português, English y Español cuando quieras.</li>
</ul>
<p>Después de ajustar, haz clic en <strong>Guardar</strong> para que la pantalla de proyecto se actualice de inmediato.</p>
<div class="po-help-tip">Campos como Altura de techo y Zócalo también existen, pero hoy están ocultos aquí — cuando están visibles, los mismos valores se pueden completar directamente en la pestaña Proyectos.</div>` },
    { id: 'margem-logo-dealer', title: `Margen de reventa y logo de tu tienda (Dealer)`, html: `<p>Para cuentas de reventa (perfiles Lojista/Dealer, Contractor y Administrador), el panel de <strong>Configuración</strong> (ícono ⚙) tiene campos extra que no aparecen para los clientes finales:</p>
<ul>
<li><strong>Margen general de reventa (%)</strong> — define tu margen sobre el precio de fábrica; se usa para calcular el precio de reventa mostrado en la Galería y en Mis Proyectos (no afecta los valores de Mis Pedidos).</li>
<li><strong>Su logo (en la Propuesta)</strong> — sube el logo de tu tienda para que aparezca en el encabezado de la Propuesta en PDF generada para el cliente final.</li>
<li><strong>Datos de la tienda (en la Propuesta)</strong> — completa el nombre y el teléfono de tu tienda, que se muestran junto al logo en la Propuesta.</li>
</ul>
<div class="po-help-tip">¿No ves estos campos en tu panel de Configuración? Tu cuenta no tiene permisos de reventa — consulta a tu administrador si los necesitas.</div>` },
    { id: 'trocar-senha', title: `Cómo cambiar tu contraseña`, html: `<p>Abre el panel de <strong>Configuración</strong> (ícono ⚙ en la esquina superior derecha) y desplázate hasta el campo <strong>Cambiar contraseña</strong>. Escribe la nueva contraseña (mínimo 6 caracteres) y haz clic en <strong>Guardar nueva contraseña</strong>. No necesitas ingresar la contraseña anterior — el cambio usa tu sesión ya autenticada.</p>
<div class="po-help-tip">¿Recibiste una contraseña simple creada por el administrador? Este es el lugar indicado para definir una que sea solo tuya.</div>` }
  ] }
);

HELP_CONTENT.pt.push(
  { id: 'projetos-ambiente', title: `Projetos: montar o ambiente`, articles: [
    { id: 'criar-projeto-paredes', title: `Criar um projeto e desenhar as paredes`, html: `<p>Todo projeto começa pelas paredes do ambiente. Na aba <strong>Projetos</strong>, clique no botão <strong>Paredes</strong> (ícone de planta baixa, no canto superior esquerdo da barra de ferramentas) para abrir o editor <strong>Ajustar paredes</strong> — um desenho de planta baixa vista de cima.</p>
      <ul>
        <li>Use <strong>+ parede</strong> para acrescentar uma nova parede grudada na ponta da última — assim dá pra desenhar parede única, dupla ou formato em L/U, uma parede de cada vez.</li>
        <li>Use <strong>+ solta</strong> para criar uma parede independente no meio do ambiente (uma divisória que não gruda em nenhuma outra).</li>
        <li>Arraste o <strong>corpo</strong> de uma parede para mover ela inteira; arraste uma das <strong>pontas</strong> para girar e esticar. Um ímã ajuda a alinhar na malha e em ângulos de 45°; segure <strong>Shift</strong> para soltar o ímã.</li>
        <li>Para separar um canto (desconectar duas paredes que se encontram), segure <strong>Shift</strong> e arraste a ponta para fora — a parede vizinha fica parada no lugar.</li>
        <li>Use <strong>⇋ virar</strong> para inverter qual lado da parede fica voltado pro ambiente, <strong>👁 ocultar</strong> para esconder uma parede (e os móveis presos nela) só na visualização, e <strong>🗑 remover</strong> para apagar a parede selecionada.</li>
        <li>Ainda no mesmo editor, defina a <strong>Pé-direito</strong> (altura do teto) e o <strong>Rodapé</strong> do ambiente — esses dois campos valem pro projeto inteiro.</li>
      </ul>
      <div class="po-help-tip">Clique numa parede desenhada pra ver e editar seu comprimento, ângulo e espessura na lateral do editor antes de confirmar com <strong>OK</strong>.</div>` },
    { id: 'inserir-mover-modulos', title: `Inserir e mover módulos`, html: `<p>Com as paredes prontas, insira móveis a partir da lista à esquerda (a biblioteca de módulos) — arraste um card pra dentro da cena ou clique nele para inseri-lo automaticamente na próxima posição livre. Se preferir procurar por nome, use o botão <strong>Buscar</strong> para abrir a busca de módulos.</p>
      <ul>
        <li>Depois de inserido, arraste o módulo na cena 3D para reposicioná-lo; arraste uma das pontas com as setas de redimensionar para movê-lo entre paredes e chão, ou gire com o gesto de rotação.</li>
        <li>Clicar num módulo já colocado revela botões flutuantes ao lado dele:
          <ul>
            <li><strong>Duplicar</strong> — cria uma cópia do módulo, com a mesma cor e medidas, ao lado dele.</li>
            <li><strong>Customizar</strong> — abre este módulo no criador de armário para montar os internos (portas, gavetas, prateleiras). A customização é feita numa cópia própria deste projeto — o módulo original do catálogo nunca é alterado.</li>
            <li><strong>Remover</strong> — tira o módulo do ambiente.</li>
            <li><strong>Peças</strong> — mostra a lista de corte e a vista explodida deste móvel, útil pra conferir antes de fechar o pedido.</li>
          </ul>
        </li>
      </ul>
      <div class="po-help-tip">Também existe o botão <strong>Substituir</strong> (troca este módulo por outro escolhido na busca, mantendo largura, altura, profundidade e posição) entre os botões flutuantes.</div>` },
    { id: 'ilha-modulos-soltos', title: `Ilhas: módulos soltos no chão`, html: `<p>Além dos módulos encostados na parede, é possível criar <strong>ilhas</strong> — módulos soltos, posicionados livremente no chão do ambiente (por exemplo, uma bancada central). Para isso, arraste o módulo da biblioteca e solte-o sobre o piso da cena 3D, em vez de soltar contra uma parede.</p>
      <ul>
        <li>Uma ilha se move nos eixos do chão (frente/fundo e esquerda/direita) e pode girar livremente — ela não depende de nenhuma parede.</li>
        <li>Ligue o botão <strong>Colisão</strong> para que, ao arrastar, os módulos parem encostados uns nos outros em vez de se sobrepor — vale tanto entre ilhas quanto entre módulos de parede.</li>
        <li>Com <strong>Colisão</strong> desligada, sobrepor módulos de propósito continua sendo permitido (por exemplo, para testar camadas).</li>
      </ul>` },
    { id: 'posicao-no-ambiente', title: `Posição exata no ambiente`, html: `<p>Ao selecionar um módulo, o painel de configuração mostra o cartão <strong>Movimentação/Rotação</strong>, com setas para mover e girar o módulo nos 3 eixos, e logo abaixo a seção <strong>Posição no ambiente</strong>, que mostra a distância exata do módulo até cada lado do ambiente.</p>
      <ul>
        <li>Módulo de <strong>parede</strong>: mostra a distância até <strong>Esquerda/Direita</strong> (ao longo da parede) e até <strong>Chão/Teto</strong>; o eixo que vai contra/afasta da parede tem só o campo <strong>Da parede</strong> (ajuste fino, sem checagem de colisão).</li>
        <li>Módulo <strong>ilha</strong>: mostra a distância até <strong>Esquerda/Direita</strong> e até <strong>Frente/Fundo</strong>, além de <strong>Chão/Teto</strong> (elevação livre, ajuste fino).</li>
        <li>Cada distância é editável dos dois lados: digite, por exemplo, o valor de <strong>Chão</strong> para levantar a peça a uma altura exata — o valor de <strong>Teto</strong> se recalcula sozinho.</li>
      </ul>
      <div class="po-help-tip">Diferente das setas de mover/girar (ajuste relativo), esta seção mostra sempre a distância REAL até os limites do ambiente — ideal para conferir alinhamentos antes de fechar o projeto.</div>` },
  ] },
  { id: 'projetos-construtor', title: `Construtor de armário`, articles: [
    { id: 'construtor-basico', title: `Como funciona o Construtor`, html: `<p>O <strong>Construtor</strong> é a tela onde você monta os internos de um módulo dentro do seu projeto. Para abri-lo, selecione um módulo já inserido no ambiente e clique no botão flutuante <strong>Customizar</strong> (ícone de lápis).</p>
      <p>A tela foi pensada para ser rápida: <strong>sem formulários e sem textos para preencher — é tudo clique e arraste</strong>. À esquerda fica o desenho do módulo, dividido em <strong>vãos</strong> (os espaços/aberturas dentro do móvel); à direita fica a lista de peças que podem ser inseridas.</p>
      <ul>
        <li>Clique num <strong>vão</strong> para selecioná-lo (ele fica destacado no desenho).</li>
        <li>Clique numa peça da lista à direita para inserir ela dentro do vão selecionado — uma prateleira, por exemplo, divide o vão em dois vãos menores automaticamente.</li>
        <li>Clique numa peça já inserida no desenho para removê-la; arrastar uma divisória move ela, mantendo a soma dos dois vãos vizinhos.</li>
        <li>Use <strong>Salvar</strong> no topo da tela para gravar as mudanças, ou o ícone de desfazer para voltar um passo.</li>
      </ul>
      <div class="po-help-tip">Como o Construtor abre uma cópia exclusiva do módulo para o seu projeto, você pode montar os internos do jeito que quiser sem afetar o módulo original do catálogo nem outros projetos.</div>` },
    { id: 'portas-gavetas-construtor', title: `Portas, gavetas e seleção em faixa`, html: `<p>Portas e gavetas são inseridas da mesma forma que qualquer outra peça no Construtor: selecione o vão e clique na peça desejada na lista à direita.</p>
      <ul>
        <li>Quando um módulo tem várias prateleiras lado a lado e você quer uma <strong>única porta cobrindo todos os vãos</strong> (em vez de uma porta por vão), use a <strong>seleção em faixa</strong>: clique no primeiro vão e arraste até o último vão que a porta deve cobrir — todos os vãos do caminho ficam destacados juntos.</li>
        <li>Com a faixa pintada, clique na porta desejada na lista de peças — ela é aplicada cobrindo todos os vãos selecionados de uma vez, como uma frente só.</li>
        <li>A seleção em faixa só funciona entre vãos irmãos (que vieram da mesma divisão) — não é possível estender a faixa entre partes muito diferentes do módulo.</li>
      </ul>
      <div class="po-help-tip">Depois de inserir a peça, a seleção de faixa é liberada automaticamente, então o próximo clique já seleciona um vão normal de novo.</div>` },
  ] },
  { id: 'projetos-cores', title: `Cores`, articles: [
    { id: 'trocar-cor-modulo', title: `Trocar a cor de um módulo`, html: `<p>Cada módulo pode ter mais de uma parte colorida separadamente — por exemplo, a caixa (corpo) de uma cor e as portas/frentes de outra. Cada uma dessas partes é chamada de <strong>papel de cor</strong>.</p>
      <ul>
        <li>Selecione o módulo na cena 3D: o painel de configuração mostra a seção <strong>Cor</strong>, com um grupo de amostras (swatches) para cada papel de cor que aquele módulo usa — por exemplo um grupo para "Caixa" e outro para "Porta".</li>
        <li>Clique numa amostra para aplicar aquela cor ao papel correspondente — a amostra selecionada fica destacada.</li>
        <li>Se quiser trocar a cor de <strong>todos os módulos do projeto de uma vez</strong>, deixe nenhum módulo selecionado: o painel lateral mostra o recurso <strong>Troca rápida de cor</strong>, organizado em abas (uma aba por papel de cor encontrado no projeto). Escolher uma amostra ali aplica a cor a todos os módulos compatíveis — um módulo com cores limitadas simplesmente mantém a cor anterior se a escolhida não estiver disponível pra ele.</li>
      </ul>
      <div class="po-help-tip">Nem todo módulo tem os mesmos papéis de cor — a lista de abas/grupos se ajusta automaticamente conforme os módulos presentes no projeto.</div>` },
    { id: 'sku-referencia-rapida', title: `Referência (SKU): medida pronta`, html: `<p>Muitos módulos têm tamanhos de fábrica já catalogados, chamados de <strong>Referência (SKU)</strong> — em vez de digitar largura e altura manualmente, você escolhe um tamanho pronto de uma lista.</p>
      <ul>
        <li>Na <strong>biblioteca</strong> (lista de módulos à esquerda), módulos que têm referências cadastradas mostram um menu <strong>Referência (SKU)</strong> logo abaixo do card — escolher uma opção já insere o módulo direto no ambiente com aquele tamanho.</li>
        <li>No <strong>painel de configuração</strong> de um módulo já inserido, o mesmo menu aparece acima dos campos de Largura/Altura/Profundidade — ele já vem pré-selecionado quando a medida atual bate com alguma referência cadastrada.</li>
        <li>Escolher uma referência diferente ajusta a largura e/ou altura do módulo automaticamente para o valor daquele SKU, recalculando o preço na hora.</li>
      </ul>
      <div class="po-help-tip">O menu de Referência (SKU) só aparece em módulos que têm pelo menos uma referência cadastrada — módulos sem referência continuam com os campos de medida normais, digitados livremente.</div>` },
  ] }
);
HELP_CONTENT.en.push(
  { id: 'projetos-ambiente', title: `Projects: setting up the room`, articles: [
    { id: 'criar-projeto-paredes', title: `Starting a project and drawing the walls`, html: `<p>Every project starts with the room's walls. On the <strong>Projects</strong> tab, click the <strong>Walls</strong> button (floor-plan icon, top-left of the toolbar) to open the <strong>Edit walls</strong> editor — a top-down floor plan.</p>
      <ul>
        <li>Use <strong>+ wall</strong> to add a new wall attached to the end of the last one — this is how you draw a single wall, two walls, or an L/U shape, one wall at a time.</li>
        <li>Use <strong>+ free</strong> to create an independent wall in the middle of the room (a divider that isn't attached to any other wall).</li>
        <li>Drag a wall's <strong>body</strong> to move it as a whole; drag one of its <strong>ends</strong> to rotate and stretch it. Snapping helps align to the grid and to 45° angles — hold <strong>Shift</strong> to release it.</li>
        <li>To disconnect a corner (split two walls that meet), hold <strong>Shift</strong> and drag the end outward — the neighbouring wall stays where it is.</li>
        <li>Use <strong>⇋ flip</strong> to flip which side of the wall faces the room, <strong>👁 hide</strong> to hide a wall (and the cabinets on it) in the display only, and <strong>🗑 remove</strong> to delete the selected wall.</li>
        <li>In the same editor, set the room's <strong>Ceiling height</strong> and <strong>Baseboard</strong> — both apply to the whole project.</li>
      </ul>
      <div class="po-help-tip">Click a drawn wall to see and edit its length, angle, and thickness in the editor's side panel before confirming with <strong>OK</strong>.</div>` },
    { id: 'inserir-mover-modulos', title: `Inserting and moving modules`, html: `<p>Once the walls are ready, add cabinets from the list on the left (the module library) — drag a card into the scene, or click it to insert it automatically at the next free spot. To search by name instead, use the <strong>Search</strong> button to open the module search.</p>
      <ul>
        <li>Once a module is placed, drag it in the 3D view to reposition it; drag one of the resize arrows to move it between walls and the floor, or rotate it with the rotate gesture.</li>
        <li>Clicking a placed module reveals floating buttons next to it:
          <ul>
            <li><strong>Duplicate</strong> — creates a copy of the module, with the same color and dimensions, next to it.</li>
            <li><strong>Customize</strong> — opens this module in the cabinet builder to set up its internals (doors, drawers, shelves). Customizing works on a private copy for this project only — the original catalog module is never changed.</li>
            <li><strong>Remove</strong> — takes the module out of the room.</li>
            <li><strong>Parts</strong> — shows the cut list and exploded view for this cabinet, handy for a final check before ordering.</li>
          </ul>
        </li>
      </ul>
      <div class="po-help-tip">There is also a <strong>Replace</strong> button (swaps this module for another one chosen in search, keeping width, height, depth, and position) among the floating buttons.</div>` },
    { id: 'ilha-modulos-soltos', title: `Islands: freestanding modules`, html: `<p>Besides modules attached to a wall, you can also create <strong>islands</strong> — freestanding modules placed anywhere on the room's floor (a center island, for example). To do this, drag the module from the library and drop it onto the floor of the 3D scene instead of dropping it against a wall.</p>
      <ul>
        <li>An island moves along the floor's axes (front/back and left/right) and can rotate freely — it doesn't depend on any wall.</li>
        <li>Turn on <strong>Collision</strong> so that, while dragging, modules stop against each other instead of overlapping — this applies both between islands and between wall modules.</li>
        <li>With <strong>Collision</strong> off, overlapping modules on purpose is still allowed (for example, to test layers).</li>
      </ul>` },
    { id: 'posicao-no-ambiente', title: `Exact position in the room`, html: `<p>When you select a module, the configuration panel shows the <strong>Movement/Rotation</strong> card, with arrows to move and rotate the module on all 3 axes, and right below it the <strong>Position in the room</strong> section, which shows the exact distance from the module to each side of the room.</p>
      <ul>
        <li>A <strong>wall</strong> module shows the distance to <strong>Left/Right</strong> (along the wall) and to <strong>Floor/Ceiling</strong>; the axis that runs into/away from the wall only has the <strong>From the wall</strong> field (a fine, visual-only adjustment with no collision check).</li>
        <li>An <strong>island</strong> module shows the distance to <strong>Left/Right</strong> and to <strong>Front/Back</strong>, plus <strong>Floor/Ceiling</strong> (free elevation, fine adjustment).</li>
        <li>Every distance is editable from either side: type, for example, the <strong>Floor</strong> value to raise the piece to an exact height — the <strong>Ceiling</strong> value updates on its own.</li>
      </ul>
      <div class="po-help-tip">Unlike the move/rotate arrows (a relative nudge), this section always shows the REAL distance to the room's limits — great for checking alignment before finishing the project.</div>` },
  ] },
  { id: 'projetos-construtor', title: `Cabinet Builder`, articles: [
    { id: 'construtor-basico', title: `How the Builder works`, html: `<p>The <strong>Builder</strong> is where you set up the internals of a module inside your project. To open it, select a module already placed in the room and click the floating <strong>Customize</strong> button (pencil icon).</p>
      <p>The screen is designed to be fast: <strong>no forms and no text to fill in — it's all click and drag</strong>. On the left is a drawing of the module, divided into <strong>openings</strong> (the gaps/spaces inside the cabinet); on the right is the list of parts that can be inserted.</p>
      <ul>
        <li>Click an <strong>opening</strong> to select it (it gets highlighted in the drawing).</li>
        <li>Click a part from the list on the right to insert it into the selected opening — a shelf, for example, automatically splits the opening into two smaller ones.</li>
        <li>Click a part already placed in the drawing to remove it; dragging a divider moves it, keeping the sum of the two neighbouring openings unchanged.</li>
        <li>Use <strong>Save</strong> at the top of the screen to record your changes, or the undo icon to step back.</li>
      </ul>
      <div class="po-help-tip">Since the Builder opens a private copy of the module for your project, you can set up the internals however you like without affecting the original catalog module or other projects.</div>` },
    { id: 'portas-gavetas-construtor', title: `Doors, drawers, and range selection`, html: `<p>Doors and drawers are inserted the same way as any other part in the Builder: select the opening and click the part you want in the list on the right.</p>
      <ul>
        <li>When a module has several shelves side by side and you want a <strong>single door covering all of them</strong> (instead of one door per opening), use <strong>range selection</strong>: click the first opening and drag to the last opening the door should cover — all the openings in between get highlighted together.</li>
        <li>With the range highlighted, click the door you want in the parts list — it's applied covering all the selected openings at once, as a single front.</li>
        <li>Range selection only works between sibling openings (ones that came from the same split) — it can't stretch across very different parts of the module.</li>
      </ul>
      <div class="po-help-tip">Once you insert the part, the range selection is released automatically, so your next click selects a single opening again.</div>` },
  ] },
  { id: 'projetos-cores', title: `Colors`, articles: [
    { id: 'trocar-cor-modulo', title: `Changing a module's color`, html: `<p>Each module can have more than one colored part on its own — for example, the box (carcass) in one color and the doors/fronts in another. Each of these parts is called a <strong>color role</strong>.</p>
      <ul>
        <li>Select the module in the 3D scene: the configuration panel shows the <strong>Color</strong> section, with one group of swatches for every color role that module uses — for example one group for "Box" and another for "Door".</li>
        <li>Click a swatch to apply that color to the matching role — the selected swatch gets highlighted.</li>
        <li>To change the color of <strong>every module in the project at once</strong>, leave no module selected: the side panel shows <strong>Quick color swap</strong>, organized in tabs (one tab per color role found in the project). Picking a swatch there applies the color to every compatible module — a module with limited colors simply keeps its previous color if the chosen one isn't available for it.</li>
      </ul>
      <div class="po-help-tip">Not every module has the same color roles — the list of tabs/groups adjusts automatically based on the modules present in the project.</div>` },
    { id: 'sku-referencia-rapida', title: `Reference (SKU): ready-made sizes`, html: `<p>Many modules have factory sizes already cataloged, called <strong>Reference (SKU)</strong> — instead of typing width and height by hand, you pick a ready-made size from a list.</p>
      <ul>
        <li>In the <strong>library</strong> (the list of modules on the left), modules that have references registered show a <strong>Reference (SKU)</strong> dropdown right under the card — picking an option inserts the module straight into the room at that size.</li>
        <li>In the <strong>configuration panel</strong> of a module already placed, the same dropdown appears above the Width/Height/Depth fields — it comes pre-selected whenever the current size already matches a registered reference.</li>
        <li>Picking a different reference automatically adjusts the module's width and/or height to that SKU's value, recalculating the price right away.</li>
      </ul>
      <div class="po-help-tip">The Reference (SKU) dropdown only shows up on modules that have at least one reference registered — modules without one keep the regular, freely-typed size fields.</div>` },
  ] }
);
HELP_CONTENT.es.push(
  { id: 'projetos-ambiente', title: `Proyectos: armar el ambiente`, articles: [
    { id: 'criar-projeto-paredes', title: `Crear un proyecto y dibujar las paredes`, html: `<p>Todo proyecto empieza por las paredes del ambiente. En la pestaña <strong>Proyectos</strong>, haga clic en el botón <strong>Paredes</strong> (ícono de plano, en la esquina superior izquierda de la barra de herramientas) para abrir el editor <strong>Ajustar paredes</strong> — un plano visto desde arriba.</p>
      <ul>
        <li>Use <strong>+ pared</strong> para agregar una nueva pared unida al extremo de la última — así se dibuja pared única, doble, o en forma de L/U, una pared a la vez.</li>
        <li>Use <strong>+ suelta</strong> para crear una pared independiente en medio del ambiente (una divisoria que no se une a ninguna otra).</li>
        <li>Arrastre el <strong>cuerpo</strong> de una pared para moverla entera; arrastre uno de sus <strong>extremos</strong> para girarla y estirarla. Un imán ayuda a alinear con la retícula y con ángulos de 45° — mantenga <strong>Shift</strong> para soltarlo.</li>
        <li>Para separar una esquina (desconectar dos paredes que se encuentran), mantenga <strong>Shift</strong> y arrastre el extremo hacia afuera — la pared vecina se queda donde está.</li>
        <li>Use <strong>⇋ girar</strong> para invertir qué lado de la pared queda hacia el ambiente, <strong>👁 ocultar</strong> para esconder una pared (y los muebles apoyados en ella) solo en la visualización, y <strong>🗑 quitar</strong> para eliminar la pared seleccionada.</li>
        <li>En el mismo editor, defina la <strong>Altura libre</strong> (altura del techo) y el <strong>Zócalo</strong> del ambiente — los dos valen para todo el proyecto.</li>
      </ul>
      <div class="po-help-tip">Haga clic en una pared dibujada para ver y editar su largo, ángulo y espesor en el panel lateral del editor antes de confirmar con <strong>OK</strong>.</div>` },
    { id: 'inserir-mover-modulos', title: `Insertar y mover módulos`, html: `<p>Con las paredes listas, agregue muebles desde la lista de la izquierda (la biblioteca de módulos) — arrastre una tarjeta hacia la escena o haga clic en ella para insertarla automáticamente en el próximo lugar libre. Si prefiere buscar por nombre, use el botón <strong>Buscar</strong> para abrir la búsqueda de módulos.</p>
      <ul>
        <li>Ya insertado, arrastre el módulo en la vista 3D para reposicionarlo; arrastre una de las flechas de redimensionar para moverlo entre paredes y piso, o gírelo con el gesto de rotación.</li>
        <li>Al hacer clic en un módulo ya colocado aparecen botones flotantes a su lado:
          <ul>
            <li><strong>Duplicar</strong> — crea una copia del módulo, con el mismo color y las mismas medidas, a su lado.</li>
            <li><strong>Customizar</strong> — abre este módulo en el creador de armarios para armar sus internos (puertas, cajones, estantes). La personalización se hace en una copia propia de este proyecto — el módulo original del catálogo nunca se modifica.</li>
            <li><strong>Quitar</strong> — saca el módulo del ambiente.</li>
            <li><strong>Piezas</strong> — muestra la lista de corte y la vista explotada de este mueble, útil para revisar antes de cerrar el pedido.</li>
          </ul>
        </li>
      </ul>
      <div class="po-help-tip">También existe el botón <strong>Sustituir</strong> (cambia este módulo por otro elegido en la búsqueda, manteniendo ancho, alto, profundidad y posición) entre los botones flotantes.</div>` },
    { id: 'ilha-modulos-soltos', title: `Islas: módulos sueltos en el piso`, html: `<p>Además de los módulos apoyados en la pared, se pueden crear <strong>islas</strong> — módulos sueltos, ubicados libremente en el piso del ambiente (por ejemplo, una isla central). Para eso, arrastre el módulo desde la biblioteca y suéltelo sobre el piso de la escena 3D, en vez de soltarlo contra una pared.</p>
      <ul>
        <li>Una isla se mueve en los ejes del piso (frente/fondo e izquierda/derecha) y puede girar libremente — no depende de ninguna pared.</li>
        <li>Active el botón <strong>Colisión</strong> para que, al arrastrar, los módulos se detengan uno contra el otro en vez de superponerse — vale tanto entre islas como entre módulos de pared.</li>
        <li>Con <strong>Colisión</strong> apagada, superponer módulos a propósito sigue estando permitido (por ejemplo, para probar capas).</li>
      </ul>` },
    { id: 'posicao-no-ambiente', title: `Posición exacta en el ambiente`, html: `<p>Al seleccionar un módulo, el panel de configuración muestra la tarjeta <strong>Movimiento/Rotación</strong>, con flechas para mover y girar el módulo en los 3 ejes, y justo debajo la sección <strong>Posición en el ambiente</strong>, que muestra la distancia exacta del módulo a cada lado del ambiente.</p>
      <ul>
        <li>Un módulo de <strong>pared</strong> muestra la distancia a <strong>Izquierda/Derecha</strong> (a lo largo de la pared) y a <strong>Piso/Techo</strong>; el eje que va contra/se aleja de la pared solo tiene el campo <strong>De la pared</strong> (ajuste fino, sin control de colisión).</li>
        <li>Un módulo <strong>isla</strong> muestra la distancia a <strong>Izquierda/Derecha</strong> y a <strong>Frente/Fondo</strong>, además de <strong>Piso/Techo</strong> (elevación libre, ajuste fino).</li>
        <li>Cada distancia es editable desde los dos lados: escriba, por ejemplo, el valor de <strong>Piso</strong> para levantar la pieza a una altura exacta — el valor de <strong>Techo</strong> se recalcula solo.</li>
      </ul>
      <div class="po-help-tip">A diferencia de las flechas de mover/girar (ajuste relativo), esta sección siempre muestra la distancia REAL a los límites del ambiente — ideal para revisar alineaciones antes de cerrar el proyecto.</div>` },
  ] },
  { id: 'projetos-construtor', title: `Creador de armarios`, articles: [
    { id: 'construtor-basico', title: `Cómo funciona el Creador`, html: `<p>El <strong>Creador</strong> es la pantalla donde arma los internos de un módulo dentro de su proyecto. Para abrirlo, seleccione un módulo ya colocado en el ambiente y haga clic en el botón flotante <strong>Customizar</strong> (ícono de lápiz).</p>
      <p>La pantalla está pensada para ser rápida: <strong>sin formularios ni textos para completar — todo es clic y arrastre</strong>. A la izquierda está el dibujo del módulo, dividido en <strong>vanos</strong> (los espacios/aberturas dentro del mueble); a la derecha está la lista de piezas que se pueden insertar.</p>
      <ul>
        <li>Haga clic en un <strong>vano</strong> para seleccionarlo (queda resaltado en el dibujo).</li>
        <li>Haga clic en una pieza de la lista de la derecha para insertarla dentro del vano seleccionado — un estante, por ejemplo, divide el vano en dos vanos más chicos automáticamente.</li>
        <li>Haga clic en una pieza ya insertada en el dibujo para quitarla; arrastrar una divisoria la mueve, manteniendo la suma de los dos vanos vecinos.</li>
        <li>Use <strong>Guardar</strong> arriba de la pantalla para grabar los cambios, o el ícono de deshacer para retroceder un paso.</li>
      </ul>
      <div class="po-help-tip">Como el Creador abre una copia exclusiva del módulo para su proyecto, puede armar los internos como quiera sin afectar el módulo original del catálogo ni otros proyectos.</div>` },
    { id: 'portas-gavetas-construtor', title: `Puertas, cajones y selección en franja`, html: `<p>Las puertas y cajones se insertan igual que cualquier otra pieza en el Creador: seleccione el vano y haga clic en la pieza deseada en la lista de la derecha.</p>
      <ul>
        <li>Cuando un módulo tiene varios estantes uno al lado del otro y quiere <strong>una sola puerta cubriendo todos los vanos</strong> (en vez de una puerta por vano), use la <strong>selección en franja</strong>: haga clic en el primer vano y arrastre hasta el último vano que la puerta debe cubrir — todos los vanos del camino quedan resaltados juntos.</li>
        <li>Con la franja pintada, haga clic en la puerta deseada en la lista de piezas — se aplica cubriendo todos los vanos seleccionados de una vez, como una sola frente.</li>
        <li>La selección en franja solo funciona entre vanos hermanos (que vienen de la misma división) — no se puede extender la franja entre partes muy distintas del módulo.</li>
      </ul>
      <div class="po-help-tip">Después de insertar la pieza, la selección en franja se libera automáticamente, así que el próximo clic ya selecciona un vano normal de nuevo.</div>` },
  ] },
  { id: 'projetos-cores', title: `Colores`, articles: [
    { id: 'trocar-cor-modulo', title: `Cambiar el color de un módulo`, html: `<p>Cada módulo puede tener más de una parte con color propio — por ejemplo, la caja (cuerpo) de un color y las puertas/frentes de otro. Cada una de estas partes se llama <strong>rol de color</strong>.</p>
      <ul>
        <li>Seleccione el módulo en la escena 3D: el panel de configuración muestra la sección <strong>Color</strong>, con un grupo de muestras (swatches) por cada rol de color que ese módulo usa — por ejemplo un grupo para "Caja" y otro para "Puerta".</li>
        <li>Haga clic en una muestra para aplicar ese color al rol correspondiente — la muestra elegida queda resaltada.</li>
        <li>Si quiere cambiar el color de <strong>todos los módulos del proyecto a la vez</strong>, no deje ningún módulo seleccionado: el panel lateral muestra <strong>Cambio rápido de color</strong>, organizado en pestañas (una por cada rol de color encontrado en el proyecto). Elegir una muestra ahí aplica el color a todos los módulos compatibles — un módulo con colores limitados simplemente mantiene el color anterior si el elegido no está disponible para él.</li>
      </ul>
      <div class="po-help-tip">No todos los módulos tienen los mismos roles de color — la lista de pestañas/grupos se ajusta automáticamente según los módulos presentes en el proyecto.</div>` },
    { id: 'sku-referencia-rapida', title: `Referencia (SKU): medida lista`, html: `<p>Muchos módulos tienen tamaños de fábrica ya catalogados, llamados <strong>Referencia (SKU)</strong> — en vez de escribir ancho y alto a mano, elige un tamaño ya definido de una lista.</p>
      <ul>
        <li>En la <strong>biblioteca</strong> (la lista de módulos a la izquierda), los módulos que tienen referencias registradas muestran un menú <strong>Referencia (SKU)</strong> justo debajo de la tarjeta — elegir una opción inserta el módulo directo en el ambiente con ese tamaño.</li>
        <li>En el <strong>panel de configuración</strong> de un módulo ya colocado, el mismo menú aparece arriba de los campos de Ancho/Alto/Profundidad — viene preseleccionado cuando la medida actual ya coincide con alguna referencia registrada.</li>
        <li>Elegir una referencia distinta ajusta el ancho y/o el alto del módulo automáticamente al valor de ese SKU, recalculando el precio al instante.</li>
      </ul>
      <div class="po-help-tip">El menú de Referencia (SKU) solo aparece en módulos que tienen al menos una referencia registrada — los módulos sin referencia siguen con los campos de medida normales, escritos libremente.</div>` },
  ] }
);

HELP_CONTENT.pt.push(
  { id: 'projetos-barra', title: `Barra de ferramentas de Projetos`, articles: [
    { id: 'paredes-btn', title: `Paredes`, html: `<p>O botão <strong>Paredes</strong>, no canto esquerdo da barra de ferramentas, abre o editor da planta baixa do ambiente — onde você desenha e ajusta as paredes antes de montar os módulos.</p><p>É só um atalho: o editor de paredes em si (desenhar, conectar, desconectar paredes) tem seu próprio artigo de ajuda — consulte "Editor de paredes" para o passo a passo completo.</p>` },
    { id: 'vista-frontal-superior', title: `Vista: Frontal e Superior`, html: `<p>O grupo <strong>Vista</strong> alterna como o ambiente é desenhado na tela:</p><ul><li><strong>Frontal</strong> — vista de canto em 3D, interativa: arraste módulos, gire a câmera, dê zoom.</li><li><strong>Superior</strong> — vista de cima, em 2D (planta baixa), só leitura: dá uma noção geral de como os módulos ficam posicionados da parede pra fora, mas não é usada para arrastar ou redimensionar.</li></ul><div class="po-help-tip">Use a Superior para conferir rapidamente a organização geral do ambiente, e volte para a Frontal para editar.</div>` },
    { id: 'estilo-visual', title: `Visual (estilo de desenho)`, html: `<p>O menu <strong>Visual</strong> muda como as peças do projeto são desenhadas na tela — é só aparência, não afeta preço, peças nem produção. Opções disponíveis:</p><ul><li><strong>Texturas com linhas</strong> — madeira realista com contorno fino.</li><li><strong>Texturas com linhas grossas</strong> — madeira realista com contorno grosso.</li><li><strong>Texturas</strong> — madeira realista, sem contorno.</li><li><strong>Preenchimento com linhas</strong> — cor sólida cinza com contorno fino.</li><li><strong>Preenchimento</strong> — cor sólida cinza, sem contorno.</li><li><strong>Translúcido</strong> — peças semitransparentes, úteis para ver o que está por trás.</li><li><strong>Sem preenchimento</strong> — só as arestas, sem preencher as faces.</li><li><strong>Técnico (linha grossa)</strong> — só arestas, com linha mais grossa.</li></ul>` },
    { id: 'projecao-camera', title: `Projeção: Perspectiva e Paralelo`, html: `<p>O grupo <strong>Projeção</strong> troca o tipo de câmera usado para desenhar o ambiente em 3D:</p><ul><li><strong>Perspectiva</strong> — câmera realista, com profundidade (objetos mais distantes parecem menores). É o padrão.</li><li><strong>Paralelo</strong> — câmera ortográfica, sem distorção de profundidade — útil para comparar tamanhos e alinhamentos com precisão.</li></ul><p>A escolha vale tanto para a Vista de Canto quanto para o painel "Visualizar 3D", e também afeta a foto realista gerada do projeto (o Render usa a mesma projeção ativa).</p>` },
    { id: 'desfazer', title: `Desfazer`, html: `<p>O botão <strong>Desfazer</strong> reverte a última alteração feita no projeto: mover, redimensionar, trocar cor, adicionar ou remover um módulo.</p><div class="po-help-tip">O botão fica desabilitado (acinzentado) quando não há nada para desfazer — por exemplo, logo ao abrir um projeto salvo.</div><p>Cada clique desfaz um passo por vez, na ordem inversa em que as alterações foram feitas.</p>` },
    { id: 'encaixe-colisao', title: `Encaixe (Colisão)`, html: `<p>O botão <strong>Encaixe</strong> (ícone de colisão) evita que os módulos se sobreponham: com ele ativo, ao arrastar um módulo perto de outro, ele para encostado no vizinho em vez de atravessá-lo.</p><p>Um ponto verde no ícone indica que a colisão está ativa.</p><div class="po-help-tip">Desative temporariamente se precisar sobrepor módulos de propósito (por exemplo, para testar um encaixe difícil) — lembre de reativar depois.</div>` },
    { id: 'rodape-juncao', title: `Juntar rodapé`, html: `<p>O botão <strong>Juntar rodapé</strong> controla a junção automática do rodapé entre módulos vizinhos na mesma parede.</p><p>Quando dois módulos ficam encostados (sem espaço entre eles), o rodapé dos dois é fundido em uma única peça, até o comprimento máximo permitido pelo componente — evitando emendas desnecessárias.</p><p>Desligado, cada módulo mantém seu próprio rodapé separado. Vem ligado por padrão em todo projeto novo.</p>` },
    { id: 'abrir-portas-gavetas-ocultar', title: `Abrir portas, gavetas, Ocultar e Mostrar tudo`, html: `<p>O grupo <strong>Ver</strong> reúne quatro ações para conferir o projeto:</p><ul><li><strong>Abrir portas</strong> e <strong>Abrir gavetas</strong> — abrem/fecham portas ou gavetas para você olhar o interior dos módulos.</li><li><strong>Ocultar</strong> — esconde o módulo selecionado da cena (exige um módulo selecionado; sem seleção, um aviso pede para você escolher um).</li><li><strong>Mostrar tudo</strong> — traz de volta tudo que estiver oculto. É o único jeito de recuperar um módulo escondido pela interface.</li></ul><div class="po-help-tip">Com um módulo selecionado, "Abrir portas"/"Abrir gavetas" agem só nele. Sem nenhuma seleção, agem em todos os módulos do ambiente de uma vez.</div>` },
    { id: 'camadas', title: `Camadas`, html: `<p>O menu <strong>Camadas</strong> deixa esconder e mostrar grupos de peças por papel de cor — por exemplo, ocultar só as frentes (portas) para ver o interior dos módulos, ou tirar só os eletrodomésticos da cena.</p><ul><li>A lista muda conforme o projeto: só aparecem os papéis de cor realmente usados nos módulos inseridos.</li><li><strong>Decoração</strong> e <strong>Paredes</strong> são duas camadas fixas, sempre disponíveis, mesmo sem itens desse tipo no projeto.</li></ul><p>Marque ou desmarque quantas camadas quiser — a cena atualiza na hora, sem precisar recarregar nada.</p>` },
    { id: 'cotas', title: `Cotas`, html: `<p>O botão <strong>Cotas</strong> liga e desliga linhas de medida entre os módulos do ambiente, mostrando a distância exata entre eles.</p><ul><li>Entre dois módulos vizinhos na mesma parede, aparece uma linha reta do meio de um até o meio do outro, com a medida no centro.</li><li>Quando um módulo não tem vizinho de um lado, a linha mede até o limite mais próximo — a lateral da parede, o teto ou o chão — em vez de não mostrar nada.</li><li>As linhas são sempre retas (nunca inclinadas): na horizontal para largura, na vertical para altura.</li></ul><p>A medida respeita a unidade configurada nas suas preferências (metros, polegadas etc.). Disponível na Vista de Canto/Frontal, para módulos de parede.</p>` },
    { id: 'foto-realista', title: `Render: Foto realista`, html: `<p>O grupo <strong>Render</strong> gera uma imagem fotorrealista do projeto:</p><ul><li><strong>Gerar</strong> — cria a foto realista a partir do ambiente montado. Exige ao menos um módulo inserido; sem isso, um aviso explica o motivo em vez de o botão simplesmente não fazer nada.</li><li><strong>Linhas</strong> — mostra a marcação da área que será enquadrada na foto, antes de gerar — útil para ajustar o ângulo da câmera com antecedência.</li></ul><div class="po-help-tip">A projeção de câmera (Perspectiva/Paralelo) escolhida no grupo Projeção também é usada na foto realista.</div>` },
    { id: 'tela-cheia', title: `Tela cheia`, html: `<p>O botão <strong>Tela cheia</strong> expande a aba Projetos para ocupar a tela inteira, escondendo inclusive a barra do navegador e o topo do portal — ganha mais espaço para trabalhar no ambiente.</p><p>Para sair, clique no mesmo botão novamente ou pressione <strong>Esc</strong>.</p>` },
    { id: 'dollar-orcamento-fabrica', title: `$ Orçamento / Fábrica`, html: `<p>O botão <strong>$</strong> abre o painel de valores do projeto, com duas abas:</p><ul><li><strong>$ Orçamento</strong> — o preço de venda de cada módulo e o total do projeto. É a visão disponível para consulta normal.</li><li><strong>$ Fábrica</strong> — relatório de custo interno, protegido por senha, com detalhamento de material e mão de obra. Uso restrito à equipe de fábrica.</li></ul><p>Os valores são recalculados automaticamente toda vez que o painel é aberto, para garantir que refletem o estado atual do projeto.</p>` },
    { id: 'salvar-proposta-enviar', title: `Salvar, Proposta e Enviar pro pedido`, html: `<p>O grupo <strong>Projeto</strong>, no canto direito da barra, reúne as ações principais:</p><ul><li><strong>Salvar projeto</strong> — grava o projeto atual. Ao lado, o indicador "✓ Salvo" mostra quando não há alterações pendentes; ele some assim que você mexe em algo.</li><li><strong>Proposta</strong> — gera uma prévia em PDF do projeto para enviar ao cliente, sem precisar enviar pro pedido antes.</li><li><strong>Enviar pro pedido</strong> — transforma o projeto montado em um pedido de verdade.</li><li><strong>Novo projeto</strong> — limpa o ambiente para começar um projeto do zero.</li></ul>` },
    { id: 'acoes-do-modulo-selecionado', title: `Ações do módulo selecionado`, html: `<p>Ao clicar em um módulo já inserido no ambiente, botões flutuantes aparecem ao lado dele:</p><ul><li><strong>Duplicar</strong> — cria uma cópia do módulo, com a mesma cor e as mesmas medidas, ao lado dele.</li><li><strong>Customizar</strong> — abre o módulo no criador de armário para ajustar os internos. Isso tira automaticamente uma cópia privada, exclusiva deste projeto: editar aqui nunca altera o módulo original do catálogo.</li><li><strong>Remover</strong> — tira o módulo do ambiente.</li><li><strong>Peças</strong> — mostra a lista de corte e a vista explodida deste móvel, para conferência antes de mandar produzir.</li><li><strong>Substituir</strong> — troca este módulo por outro escolhido na busca, mantendo largura, altura, profundidade e posição.</li></ul>` },
    { id: 'buscar-modulo-projeto', title: `Buscar módulo`, html: `<p>Na coluna de módulos à esquerda, o botão <strong>Buscar</strong> abre um modal de busca com abas de família, categoria e subcategoria, além da grade de módulos filtrada por elas.</p><p>Clicar em um módulo no modal já o insere no ambiente e fecha a busca automaticamente.</p><p>Logo abaixo da coluna, dois menus dropdown de família e categoria funcionam como filtro rápido, sem precisar abrir o modal — úteis quando você já sabe o que procura.</p>` },
    { id: 'girar-camera-zoom', title: `Girar câmera e zoom`, html: `<p>Sobre a vista 3D, controles flutuantes ajudam a navegar na cena:</p><ul><li><strong>Girar câmera</strong> (🔄) — aparece só em telas de toque, na Vista de Canto. Enquanto ativo, o dedo gira e dá zoom na câmera em vez de mexer nos módulos.</li><li><strong>Ajustar à tela</strong> (⛶) — enquadra o ambiente inteiro na tela automaticamente.</li><li><strong>Aproximar</strong> (+) e <strong>Afastar</strong> (−) — controlam o zoom da câmera.</li></ul><p>No computador, arraste com o botão esquerdo do mouse para mover módulos, com o botão do meio para girar a câmera, e use a rolagem do mouse para dar zoom.</p>` }
  ] }
);
HELP_CONTENT.en.push(
  { id: 'projetos-barra', title: `Projects Toolbar`, articles: [
    { id: 'paredes-btn', title: `Walls`, html: `<p>The <strong>Walls</strong> button, at the left of the toolbar, opens the room floor plan editor — where you draw and adjust walls before placing modules.</p><p>This is just a shortcut: the wall editor itself (drawing, connecting, disconnecting walls) has its own help article — see "Wall editor" for the full walkthrough.</p>` },
    { id: 'vista-frontal-superior', title: `View: Front and Top`, html: `<p>The <strong>View</strong> group switches how the room is drawn on screen:</p><ul><li><strong>Front</strong> — interactive 3D corner view: drag modules, orbit the camera, zoom in and out.</li><li><strong>Top</strong> — a read-only 2D floor-plan view from above: gives a quick sense of how modules are laid out from the wall outward, but is not used for dragging or resizing.</li></ul><div class="po-help-tip">Use Top to quickly check the overall layout, then switch back to Front to keep editing.</div>` },
    { id: 'estilo-visual', title: `Style (drawing style)`, html: `<p>The <strong>Style</strong> menu changes how the project's pieces are drawn on screen — it is purely visual and does not affect price, parts, or production. Available options:</p><ul><li><strong>Textures with outlines</strong> — realistic wood with a thin outline.</li><li><strong>Textures with thick outlines</strong> — realistic wood with a thick outline.</li><li><strong>Textures</strong> — realistic wood, no outline.</li><li><strong>Fill with outlines</strong> — solid gray fill with a thin outline.</li><li><strong>Fill</strong> — solid gray fill, no outline.</li><li><strong>Translucent</strong> — semi-transparent pieces, useful to see what's behind them.</li><li><strong>No fill</strong> — only edges, faces left unfilled.</li><li><strong>Technical (thick line)</strong> — edges only, with a thicker line.</li></ul>` },
    { id: 'projecao-camera', title: `Projection: Perspective and Parallel`, html: `<p>The <strong>Projection</strong> group switches the type of camera used to draw the 3D room:</p><ul><li><strong>Perspective</strong> — realistic camera, with depth (farther objects look smaller). This is the default.</li><li><strong>Parallel</strong> — orthographic camera, with no depth distortion — useful for comparing sizes and alignment precisely.</li></ul><p>The choice applies to both the corner view and the "3D View" panel, and it also affects the photorealistic render generated from the project (Render uses whichever projection is active).</p>` },
    { id: 'desfazer', title: `Undo`, html: `<p>The <strong>Undo</strong> button reverts the last change made to the project: moving, resizing, changing color, adding, or removing a module.</p><div class="po-help-tip">The button is disabled (grayed out) when there is nothing to undo — for example, right after opening a saved project.</div><p>Each click undoes one step at a time, in reverse order of how changes were made.</p>` },
    { id: 'encaixe-colisao', title: `Snap (Collision)`, html: `<p>The <strong>Snap</strong> button (collision icon) keeps modules from overlapping: while it is on, dragging a module close to another one stops it flush against its neighbor instead of letting it pass through.</p><p>A green dot on the icon shows that collision is active.</p><div class="po-help-tip">Turn it off temporarily if you need to intentionally overlap modules (for example, to test a tight fit) — remember to turn it back on afterward.</div>` },
    { id: 'rodape-juncao', title: `Join baseboards`, html: `<p>The <strong>Join baseboards</strong> button controls automatic baseboard joining between neighboring modules on the same wall.</p><p>When two modules are touching (zero gap), their baseboards are merged into a single piece, up to the component's maximum length — avoiding unnecessary seams.</p><p>Turned off, each module keeps its own separate baseboard. It comes on by default in every new project.</p>` },
    { id: 'abrir-portas-gavetas-ocultar', title: `Open doors, drawers, Hide and Show all`, html: `<p>The <strong>Show</strong> group gathers four actions for checking the project:</p><ul><li><strong>Open doors</strong> and <strong>Open drawers</strong> — open/close doors or drawers so you can look inside the modules.</li><li><strong>Hide</strong> — hides the selected module from the scene (requires a module to be selected; without one, a message asks you to pick one first).</li><li><strong>Show all</strong> — brings back everything that is hidden. It is the only way to recover a module hidden through the interface.</li></ul><div class="po-help-tip">With a module selected, "Open doors"/"Open drawers" affect only that module. With nothing selected, they affect every module in the room at once.</div>` },
    { id: 'camadas', title: `Layers`, html: `<p>The <strong>Layers</strong> menu lets you hide and show groups of pieces by color role — for example, hiding just the fronts (doors) to see the inside of modules, or removing only the appliances from the scene.</p><ul><li>The list changes with the project: only the color roles actually used by the inserted modules show up.</li><li><strong>Decor</strong> and <strong>Walls</strong> are two fixed layers, always available, even with no items of that kind in the project.</li></ul><p>Check or uncheck as many layers as you like — the scene updates instantly, no reload needed.</p>` },
    { id: 'cotas', title: `Dimensions`, html: `<p>The <strong>Dimensions</strong> button toggles measurement lines between the modules in the room, showing the exact distance between them.</p><ul><li>Between two neighboring modules on the same wall, a straight line runs from the middle of one to the middle of the other, with the measurement centered on it.</li><li>When a module has no neighbor on one side, the line measures to the nearest limit instead — the edge of the wall, the ceiling, or the floor — rather than showing nothing.</li><li>Lines are always straight (never tilted): horizontal for width, vertical for height.</li></ul><p>The measurement follows the unit set in your preferences (meters, inches, etc.). Available in the corner/front 3D view, for wall modules.</p>` },
    { id: 'foto-realista', title: `Render: Photorealistic`, html: `<p>The <strong>Render</strong> group generates a photorealistic image of the project:</p><ul><li><strong>Render</strong> (generate) — creates the photorealistic render from the assembled room. Requires at least one module; without one, a message explains why instead of the button silently doing nothing.</li><li><strong>Guides</strong> — shows the framing area that will be captured in the photo, before generating — useful for adjusting the camera angle ahead of time.</li></ul><div class="po-help-tip">The camera projection (Perspective/Parallel) chosen in the Projection group also applies to the photorealistic render.</div>` },
    { id: 'tela-cheia', title: `Full screen`, html: `<p>The <strong>Full screen</strong> button expands the Projects tab to fill the entire screen, hiding even the browser bar and the portal header — giving you more room to work in.</p><p>To exit, click the same button again or press <strong>Esc</strong>.</p>` },
    { id: 'dollar-orcamento-fabrica', title: `$ Quote / Factory`, html: `<p>The <strong>$</strong> button opens the project's money panel, with two tabs:</p><ul><li><strong>$ Quote</strong> — the sale price of each module and the project total. This is the view available for regular use.</li><li><strong>$ Factory</strong> — an internal cost report, password-protected, with a material and labor breakdown. Restricted to factory staff.</li></ul><p>Values are recalculated automatically every time the panel is opened, so they always reflect the project's current state.</p>` },
    { id: 'salvar-proposta-enviar', title: `Save, Proposal and Send to order`, html: `<p>The <strong>Project</strong> group, at the right end of the toolbar, gathers the main actions:</p><ul><li><strong>Save project</strong> — saves the current project. Next to it, the "✓ Saved" indicator shows when there are no pending changes; it disappears as soon as you change something.</li><li><strong>Proposal</strong> — generates a PDF preview of the project to send to the customer, without first sending it to an order.</li><li><strong>Send to order</strong> — turns the assembled project into an actual order.</li><li><strong>New project</strong> — clears the room to start a project from scratch.</li></ul>` },
    { id: 'acoes-do-modulo-selecionado', title: `Selected module actions`, html: `<p>Clicking a module already placed in the room reveals floating buttons beside it:</p><ul><li><strong>Duplicate</strong> — creates a copy of the module, with the same color and dimensions, next to it.</li><li><strong>Customize</strong> — opens the module in the cabinet builder to set up its internals. This automatically makes a private copy for this project only: editing here never touches the original catalog module.</li><li><strong>Remove</strong> — takes the module out of the room.</li><li><strong>Parts</strong> — shows the cut list and exploded view of this cabinet, for checking before sending it to production.</li><li><strong>Replace</strong> — swaps this module for another one chosen from search, keeping its width, height, depth, and position.</li></ul>` },
    { id: 'buscar-modulo-projeto', title: `Search module`, html: `<p>In the module library on the left, the <strong>Search</strong> button opens a search modal with family, category, and subcategory tabs, plus the module grid filtered by them.</p><p>Clicking a module in the modal inserts it into the room right away and closes the search automatically.</p><p>Just below the library column, two quick family and category dropdown filters work without opening the modal — handy when you already know what you are looking for.</p>` },
    { id: 'girar-camera-zoom', title: `Rotate camera and zoom`, html: `<p>Floating controls over the 3D view help you navigate the scene:</p><ul><li><strong>Rotate camera</strong> (🔄) — appears only on touch screens, in the corner view. While on, your finger orbits and zooms the camera instead of moving modules.</li><li><strong>Fit to screen</strong> (⛶) — automatically frames the whole room on screen.</li><li><strong>Zoom in</strong> (+) and <strong>Zoom out</strong> (−) — control the camera zoom.</li></ul><p>On desktop, drag with the left mouse button to move modules, the middle mouse button to orbit the camera, and use the scroll wheel to zoom.</p>` }
  ] }
);
HELP_CONTENT.es.push(
  { id: 'projetos-barra', title: `Barra de herramientas de Proyectos`, articles: [
    { id: 'paredes-btn', title: `Paredes`, html: `<p>El botón <strong>Paredes</strong>, a la izquierda de la barra de herramientas, abre el editor del plano del ambiente — donde dibujas y ajustas las paredes antes de colocar los módulos.</p><p>Esto es solo un atajo: el editor de paredes en sí (dibujar, conectar, desconectar paredes) tiene su propio artículo de ayuda — consulta "Editor de paredes" para la guía completa.</p>` },
    { id: 'vista-frontal-superior', title: `Vista: Frontal y Superior`, html: `<p>El grupo <strong>Vista</strong> cambia cómo se dibuja el ambiente en la pantalla:</p><ul><li><strong>Frontal</strong> — vista de esquina en 3D, interactiva: arrastra módulos, gira la cámara, haz zoom.</li><li><strong>Superior</strong> — vista de planta en 2D desde arriba, de solo lectura: da una idea general de cómo quedan los módulos desde la pared hacia afuera, pero no se usa para arrastrar ni redimensionar.</li></ul><div class="po-help-tip">Usa la vista Superior para revisar rápido la disposición general y vuelve a la Frontal para seguir editando.</div>` },
    { id: 'estilo-visual', title: `Estilo (estilo de dibujo)`, html: `<p>El menú <strong>Estilo</strong> cambia cómo se dibujan las piezas del proyecto en pantalla — es solo apariencia, no afecta el precio, las piezas ni la producción. Opciones disponibles:</p><ul><li><strong>Texturas con líneas</strong> — madera realista con contorno fino.</li><li><strong>Texturas con líneas gruesas</strong> — madera realista con contorno grueso.</li><li><strong>Texturas</strong> — madera realista, sin contorno.</li><li><strong>Relleno con líneas</strong> — color sólido gris con contorno fino.</li><li><strong>Relleno</strong> — color sólido gris, sin contorno.</li><li><strong>Translúcido</strong> — piezas semitransparentes, útil para ver lo que hay detrás.</li><li><strong>Sin relleno</strong> — solo los bordes, sin rellenar las caras.</li><li><strong>Técnico (línea gruesa)</strong> — solo bordes, con línea más gruesa.</li></ul>` },
    { id: 'projecao-camera', title: `Proyección: Perspectiva y Paralelo`, html: `<p>El grupo <strong>Proyección</strong> cambia el tipo de cámara usado para dibujar el ambiente en 3D:</p><ul><li><strong>Perspectiva</strong> — cámara realista, con profundidad (los objetos más lejanos se ven más pequeños). Es la opción por defecto.</li><li><strong>Paralelo</strong> — cámara ortográfica, sin distorsión de profundidad — útil para comparar tamaños y alineaciones con precisión.</li></ul><p>La elección se aplica tanto a la vista de esquina como al panel "Ver en 3D", y también afecta la foto realista generada del proyecto (el Render usa la proyección activa).</p>` },
    { id: 'desfazer', title: `Deshacer`, html: `<p>El botón <strong>Deshacer</strong> revierte el último cambio hecho en el proyecto: mover, redimensionar, cambiar color, agregar o quitar un módulo.</p><div class="po-help-tip">El botón queda deshabilitado (en gris) cuando no hay nada que deshacer — por ejemplo, justo después de abrir un proyecto guardado.</div><p>Cada clic deshace un paso a la vez, en el orden inverso al que se hicieron los cambios.</p>` },
    { id: 'encaixe-colisao', title: `Encaje (Colisión)`, html: `<p>El botón <strong>Encaje</strong> (ícono de colisión) impide que los módulos se superpongan: con él activo, al arrastrar un módulo cerca de otro, se detiene pegado al vecino en vez de atravesarlo.</p><p>Un punto verde en el ícono indica que la colisión está activa.</p><div class="po-help-tip">Desactívalo temporalmente si necesitas superponer módulos a propósito (por ejemplo, para probar un encaje ajustado) — recuerda volver a activarlo después.</div>` },
    { id: 'rodape-juncao', title: `Unir zócalo`, html: `<p>El botón <strong>Unir zócalo</strong> controla la unión automática del zócalo entre módulos vecinos de la misma pared.</p><p>Cuando dos módulos quedan pegados (sin espacio entre ellos), el zócalo de ambos se une en una sola pieza, hasta el largo máximo permitido por el componente — evitando uniones innecesarias.</p><p>Apagado, cada módulo mantiene su propio zócalo por separado. Viene activado por defecto en todo proyecto nuevo.</p>` },
    { id: 'abrir-portas-gavetas-ocultar', title: `Abrir puertas, cajones, Ocultar y Mostrar todo`, html: `<p>El grupo <strong>Ver</strong> reúne cuatro acciones para revisar el proyecto:</p><ul><li><strong>Abrir puertas</strong> y <strong>Abrir cajones</strong> — abren/cierran puertas o cajones para que veas el interior de los módulos.</li><li><strong>Ocultar</strong> — esconde el módulo seleccionado de la escena (requiere tener un módulo seleccionado; sin selección, un aviso te pide elegir uno).</li><li><strong>Mostrar todo</strong> — vuelve a mostrar todo lo que esté oculto. Es la única forma de recuperar un módulo escondido desde la interfaz.</li></ul><div class="po-help-tip">Con un módulo seleccionado, "Abrir puertas"/"Abrir cajones" actúan solo sobre él. Sin ninguna selección, actúan sobre todos los módulos del ambiente a la vez.</div>` },
    { id: 'camadas', title: `Capas`, html: `<p>El menú <strong>Capas</strong> permite ocultar y mostrar grupos de piezas según su papel de color — por ejemplo, ocultar solo los frentes (puertas) para ver el interior de los módulos, o quitar solo los electrodomésticos de la escena.</p><ul><li>La lista cambia según el proyecto: solo aparecen los papeles de color que realmente usan los módulos insertados.</li><li><strong>Decoración</strong> y <strong>Paredes</strong> son dos capas fijas, siempre disponibles, aunque no haya elementos de ese tipo en el proyecto.</li></ul><p>Marca o desmarca tantas capas como quieras — la escena se actualiza al instante, sin recargar nada.</p>` },
    { id: 'cotas', title: `Cotas`, html: `<p>El botón <strong>Cotas</strong> activa o desactiva las líneas de medida entre los módulos del ambiente, mostrando la distancia exacta entre ellos.</p><ul><li>Entre dos módulos vecinos en la misma pared, aparece una línea recta desde el medio de uno hasta el medio del otro, con la medida en el centro.</li><li>Cuando un módulo no tiene vecino de un lado, la línea mide hasta el límite más cercano — el borde de la pared, el techo o el piso — en vez de no mostrar nada.</li><li>Las líneas siempre son rectas (nunca inclinadas): horizontales para el ancho, verticales para la altura.</li></ul><p>La medida respeta la unidad configurada en tus preferencias (metros, pulgadas, etc.). Disponible en la vista de esquina/frontal en 3D, para módulos de pared.</p>` },
    { id: 'foto-realista', title: `Render: Foto realista`, html: `<p>El grupo <strong>Render</strong> genera una imagen fotorrealista del proyecto:</p><ul><li><strong>Generar</strong> — crea la foto realista a partir del ambiente armado. Requiere al menos un módulo insertado; sin eso, un aviso explica el motivo en vez de que el botón simplemente no haga nada.</li><li><strong>Líneas</strong> — muestra la marca del área que se capturará en la foto, antes de generarla — útil para ajustar el ángulo de cámara con anticipación.</li></ul><div class="po-help-tip">La proyección de cámara (Perspectiva/Paralelo) elegida en el grupo Proyección también se aplica a la foto realista.</div>` },
    { id: 'tela-cheia', title: `Pantalla completa`, html: `<p>El botón <strong>Pantalla completa</strong> expande la pestaña Proyectos para ocupar toda la pantalla, ocultando incluso la barra del navegador y el encabezado del portal — dándote más espacio para trabajar.</p><p>Para salir, haz clic en el mismo botón otra vez o presiona <strong>Esc</strong>.</p>` },
    { id: 'dollar-orcamento-fabrica', title: `$ Presupuesto / Fábrica`, html: `<p>El botón <strong>$</strong> abre el panel de valores del proyecto, con dos pestañas:</p><ul><li><strong>$ Presupuesto</strong> — el precio de venta de cada módulo y el total del proyecto. Es la vista disponible para consulta normal.</li><li><strong>$ Fábrica</strong> — un informe de costo interno, protegido por contraseña, con el detalle de material y mano de obra. Uso restringido al personal de fábrica.</li></ul><p>Los valores se recalculan automáticamente cada vez que se abre el panel, para que siempre reflejen el estado actual del proyecto.</p>` },
    { id: 'salvar-proposta-enviar', title: `Guardar, Propuesta y Enviar al pedido`, html: `<p>El grupo <strong>Proyecto</strong>, en el extremo derecho de la barra, reúne las acciones principales:</p><ul><li><strong>Guardar proyecto</strong> — guarda el proyecto actual. Al lado, el indicador "✓ Salvo" muestra cuando no hay cambios pendientes; desaparece en cuanto modificas algo.</li><li><strong>Propuesta</strong> — genera una vista previa en PDF del proyecto para enviar al cliente, sin necesidad de enviarlo antes al pedido.</li><li><strong>Enviar al pedido</strong> — convierte el proyecto armado en un pedido real.</li><li><strong>Nuevo proyecto</strong> — limpia el ambiente para empezar un proyecto desde cero.</li></ul>` },
    { id: 'acoes-do-modulo-selecionado', title: `Acciones del módulo seleccionado`, html: `<p>Al hacer clic en un módulo ya colocado en el ambiente, aparecen botones flotantes a su lado:</p><ul><li><strong>Duplicar</strong> — crea una copia del módulo, con el mismo color y las mismas medidas, a su lado.</li><li><strong>Customizar</strong> — abre el módulo en el creador de armarios para ajustar sus internos. Esto crea automáticamente una copia privada, exclusiva de este proyecto: editar aquí nunca modifica el módulo original del catálogo.</li><li><strong>Quitar</strong> — retira el módulo del ambiente.</li><li><strong>Piezas</strong> — muestra la lista de corte y la vista explotada de este mueble, para revisar antes de enviarlo a producción.</li><li><strong>Sustituir</strong> — cambia este módulo por otro elegido en la búsqueda, manteniendo ancho, alto, profundidad y posición.</li></ul>` },
    { id: 'buscar-modulo-projeto', title: `Buscar módulo`, html: `<p>En la columna de módulos a la izquierda, el botón <strong>Buscar</strong> abre una ventana de búsqueda con pestañas de familia, categoría y subcategoría, además de la cuadrícula de módulos filtrada por ellas.</p><p>Al hacer clic en un módulo dentro de la ventana, se inserta de inmediato en el ambiente y la búsqueda se cierra sola.</p><p>Justo debajo de la columna, dos filtros rápidos de familia y categoría funcionan sin necesidad de abrir la ventana — útiles cuando ya sabes lo que buscas.</p>` },
    { id: 'girar-camera-zoom', title: `Girar cámara y zoom`, html: `<p>Sobre la vista 3D, controles flotantes ayudan a moverte por la escena:</p><ul><li><strong>Girar cámara</strong> (🔄) — aparece solo en pantallas táctiles, en la vista de esquina. Mientras está activo, el dedo gira y hace zoom en la cámara en vez de mover los módulos.</li><li><strong>Ajustar a la pantalla</strong> (⛶) — encuadra automáticamente todo el ambiente en la pantalla.</li><li><strong>Acercar</strong> (+) y <strong>Alejar</strong> (−) — controlan el zoom de la cámara.</li></ul><p>En computadora, arrastra con el botón izquierdo del mouse para mover módulos, con el botón central para girar la cámara, y usa la rueda del mouse para hacer zoom.</p>` }
  ] }
);

HELP_CONTENT.pt.push(
  { id: 'meus-projetos', title: `Meus Projetos`, articles: [
    { id: 'gerenciar-projetos', title: `Gerenciar projetos: abrir, renomear, duplicar e excluir`, html: `<p>Na aba <strong>Meus Projetos</strong> cada ambiente salvo aparece como um cartão com uma única imagem — a foto renderizada, se você já gerou uma, ou a vista 3D do ambiente enquanto não houver render.</p>
<ul>
<li><strong>Carregar na Composição</strong> — abre o projeto no editor pra continuar de onde parou.</li>
<li><strong>Renomear</strong> — troca o nome do projeto.</li>
<li><strong>Duplicar</strong> — pede o nome do novo projeto na hora (já sugerido como "nome atual (cópia)") e cria uma cópia independente com os mesmos módulos, paredes e medidas, pra reaproveitar num cliente parecido.</li>
<li><strong>Excluir</strong> — remove o projeto (pede confirmação antes).</li>
</ul>
<div class="po-help-tip">A cópia feita por "Duplicar" nasce sem link de compartilhamento e sem link "Ver em 3D" próprios — gere novos se quiser compartilhar a cópia também.</div>` },
    { id: 'compartilhar-projeto', title: `Compartilhar um projeto com outro usuário`, html: `<p>O botão <strong>🔗 Compartilhar</strong> em cada cartão gera um link e um código pra passar aquele projeto pra outra conta — por exemplo, do vendedor pro cliente, ou entre colegas.</p>
<ul>
<li>Ao clicar, o link já é copiado pra área de transferência; você também pode passar só o código.</li>
<li>Quem recebe precisa estar logado. Na aba <strong>Meus Projetos</strong> dele, no quadro <strong>"Recebeu um projeto?"</strong>, é só colar o link ou o código e clicar em <strong>Importar</strong>.</li>
<li>Se a pessoa clicar direto no link recebido, o projeto já abre sozinho.</li>
</ul>
<div class="po-help-tip">Compartilhar sempre cria uma CÓPIA na conta de quem recebe — o projeto original continua intacto na sua conta. Depois de importar, revise e clique em Salvar pra guardar a cópia definitivamente.</div>` },
    { id: 'ver-em-3d', title: `Ver em 3D: link público pra cliente ou montador`, html: `<p>O botão <strong>🎥 Ver em 3D</strong> gera um link público que qualquer pessoa pode abrir SEM precisar de conta ou login — ideal pra mandar pro cliente final ou pro montador conferir o ambiente.</p>
<ul>
<li>Quem abre o link só enxerga a cena 3D do projeto: pode girar e dar zoom, mas não consegue editar nada, nem ver preços.</li>
<li>Um botão <strong>"📐 Mostrar medidas"</strong> dentro da página revela o tamanho e a posição de cada módulo, útil pra quem vai instalar.</li>
<li>O link expira sozinho depois de 30 dias. Clicando em "Ver em 3D" de novo antes disso, o mesmo link é reaproveitado.</li>
</ul>` },
  ] },
  { id: 'pedidos', title: `Meus Pedidos`, articles: [
    { id: 'acompanhar-pedido', title: `Acompanhar o status do seu pedido`, html: `<p>Depois de enviar um projeto pra virar pedido, acompanhe o andamento na aba <strong>Meus Pedidos</strong>: cada pedido mostra um selo de status que avança nesta ordem:</p>
<ul>
<li><strong>Pendente</strong> — pedido enviado, aguardando análise.</li>
<li><strong>Aprovada</strong> — pedido confirmado; os dados de contato e entrega ficam travados.</li>
<li><strong>Paga</strong> — pagamento confirmado.</li>
<li><strong>Entregue</strong> — etapa final.</li>
</ul>
<p>Pedidos vindos do Plano de Corte que ainda não foram enviados pra fábrica aparecem como <strong>Salvo</strong>. Clique em qualquer pedido da lista pra ver todos os detalhes e itens.</p>` },
    { id: 'proposta-pdf', title: `Gerar uma Proposta em PDF`, html: `<p>O botão <strong>Proposta</strong> gera um documento em PDF pronto pra apresentar ao cliente final: capa com sua logo e dados da loja, foto do projeto (realista, se já foi gerada), elevações das paredes e planta baixa com cotas, lista de módulos com ícone de cada peça e o valor total já com sua margem aplicada.</p>
<ul>
<li>Pode ser gerada direto na aba Projetos (uma prévia rápida) ou na tela de um pedido já enviado.</li>
<li>Cadastre sua logo e os dados da loja em Configurações antes, pra aparecerem no cabeçalho.</li>
</ul>
<div class="po-help-tip">Este recurso é destinado a contas de revenda — Dealer/lojista, Contractor e Administrador. Se você é um cliente final comprando diretamente, talvez não veja este botão.</div>` },
  ] },
  { id: 'galeria', title: `Galeria`, articles: [
    { id: 'render-ia', title: `Gerar uma imagem realista (IA) do seu projeto`, html: `<p>Depois de montar seu ambiente em 3D, você pode gerar uma imagem fotorrealista dele usando Inteligência Artificial.</p>
<ul>
<li>Na aba Projetos, com o ambiente montado e salvo, clique em <strong>Foto realista</strong>.</li>
<li>Ao publicar uma composição na Galeria, use o botão <strong>"✨ Gerar imagem realista"</strong> pra criar a imagem de IA que acompanha o post.</li>
<li>A geração leva alguns instantes; quando pronta, a imagem aparece na tela e pode ser salva no projeto ou baixada.</li>
</ul>
<div class="po-help-tip">As imagens geradas por IA podem apresentar pequenas diferenças em relação ao produto real — o desenho 3D é sempre a referência fiel do projeto.</div>` },
    { id: 'galeria-publica', title: `Navegar na Galeria pública`, html: `<p>A aba <strong>Galeria</strong> reúne ambientes montados por outros clientes e pode ser vista mesmo por quem ainda não tem conta — é a única aba visível pra um visitante sem login.</p>
<ul>
<li>Use os filtros de ambiente, preço, largura e cor pra encontrar composições parecidas com o que você quer.</li>
<li>Pra usar uma composição como ponto de partida (botão <strong>Personalizar</strong>) ou curtir um post, é preciso entrar na sua conta — um aviso de login aparece na hora, com opção de continuar com Google.</li>
</ul>` },
  ] },
  { id: 'plano-de-corte', title: `Plano de Corte`, articles: [
    { id: 'plano-de-corte-intro', title: `O que é o Plano de Corte`, html: `<p>A aba <strong>Plano de Corte</strong> é uma ferramenta pra quem corta o próprio material: digite ou importe uma planilha (.xlsx, .csv ou .txt) com a lista de peças — medidas, espessura, cor, fita de borda e sentido do veio — e gere o preço e o diagrama de aproveitamento das chapas.</p>
<div class="po-help-tip">Esta aba é exclusiva de contas <strong>Contractor</strong> — se você é um cliente comum, ela nem aparece no seu menu.</div>` },
  ] }
);
HELP_CONTENT.en.push(
  { id: 'meus-projetos', title: `My Projects`, articles: [
    { id: 'gerenciar-projetos', title: `Managing projects: open, rename, duplicate and delete`, html: `<p>In the <strong>My Projects</strong> tab, each saved layout shows up as a card with a single image — the photorealistic render if you've generated one, or the 3D view while there is no render yet.</p>
<ul>
<li><strong>Load into Composition</strong> — opens the project in the editor to keep working on it.</li>
<li><strong>Rename</strong> — changes the project's name.</li>
<li><strong>Duplicate</strong> — asks for the new project's name right away (pre-filled as "current name (copy)") and creates an independent copy with the same modules, walls and measurements, so you can reuse it for a similar client.</li>
<li><strong>Delete</strong> — removes the project (asks for confirmation first).</li>
</ul>
<div class="po-help-tip">A copy made with "Duplicate" starts without its own share link or "View in 3D" link — generate new ones if you also want to share the copy.</div>` },
    { id: 'compartilhar-projeto', title: `Sharing a project with another user`, html: `<p>The <strong>🔗 Share</strong> button on each card generates a link and a code to pass that project to another account — for example, from a dealer to a client, or between coworkers.</p>
<ul>
<li>Clicking it copies the link to your clipboard right away; you can also just share the code.</li>
<li>The recipient needs to be signed in. In their own <strong>My Projects</strong> tab, under <strong>"Received a project?"</strong>, they paste the link or code and click <strong>Import</strong>.</li>
<li>If they click the link directly, the project opens on its own.</li>
</ul>
<div class="po-help-tip">Sharing always creates a COPY on the recipient's account — your original project stays untouched. After importing, they should review it and click Save to keep their own copy.</div>` },
    { id: 'ver-em-3d', title: `View in 3D: a public link for a client or installer`, html: `<p>The <strong>🎥 View in 3D</strong> button generates a public link anyone can open WITHOUT an account or login — perfect for sending to the end client or to the installer to check the layout.</p>
<ul>
<li>Whoever opens the link only sees the project's 3D scene: they can rotate and zoom, but cannot edit anything or see prices.</li>
<li>A <strong>"📐 Show measurements"</strong> button on the page reveals the size and position of every module, handy for whoever is installing it.</li>
<li>The link expires on its own after 30 days. Clicking "View in 3D" again before then reuses the same link.</li>
</ul>` },
  ] },
  { id: 'pedidos', title: `My Orders`, articles: [
    { id: 'acompanhar-pedido', title: `Tracking your order's status`, html: `<p>After sending a project through as an order, track its progress in the <strong>My Orders</strong> tab: every order shows a status badge that moves through this sequence:</p>
<ul>
<li><strong>Pending</strong> — order submitted, awaiting review.</li>
<li><strong>Approved</strong> — order confirmed; contact and delivery details are locked.</li>
<li><strong>Paid</strong> — payment confirmed.</li>
<li><strong>Delivered</strong> — final stage.</li>
</ul>
<p>Orders coming from the Cutting List that haven't been sent to the factory yet show up as <strong>Saved</strong>. Click any order in the list to see its full details and items.</p>` },
    { id: 'proposta-pdf', title: `Generating a PDF Proposal`, html: `<p>The <strong>Proposal</strong> button generates a PDF ready to present to the end client: a cover with your logo and store details, a photo of the project (photorealistic, if one has been generated), wall elevations and a floor plan with dimensions, a module list with an icon for each piece, and the total price with your margin already applied.</p>
<ul>
<li>It can be generated straight from the Projects tab (a quick preview) or from an order that has already been submitted.</li>
<li>Set up your logo and store details in Settings beforehand so they show up in the header.</li>
</ul>
<div class="po-help-tip">This feature is meant for reseller accounts — Dealer, Contractor and Administrator. If you're an end customer buying directly, you may not see this button.</div>` },
  ] },
  { id: 'galeria', title: `Gallery`, articles: [
    { id: 'render-ia', title: `Generating an AI photorealistic render`, html: `<p>Once you've built your 3D layout, you can generate a photorealistic image of it using Artificial Intelligence.</p>
<ul>
<li>In the Projects tab, with the layout built and saved, click <strong>Photoreal</strong>.</li>
<li>When publishing a composition to the Gallery, use the <strong>"✨ Generate realistic image"</strong> button to create the AI image that goes with the post.</li>
<li>Generation takes a few moments; once ready, the image appears on screen and can be saved to the project or downloaded.</li>
</ul>
<div class="po-help-tip">AI-generated images may differ slightly from the real product — the 3D drawing is always the faithful reference for the design.</div>` },
    { id: 'galeria-publica', title: `Browsing the public Gallery`, html: `<p>The <strong>Gallery</strong> tab collects layouts built by other clients and can be viewed even without an account — it's the only tab visible to a signed-out visitor.</p>
<ul>
<li>Use the room, price, width and color filters to find compositions similar to what you want.</li>
<li>To use a composition as a starting point (<strong>Personalize</strong> button) or to like a post, you need to sign in — a login prompt appears right away, with an option to continue with Google.</li>
</ul>` },
  ] },
  { id: 'plano-de-corte', title: `Cutting List`, articles: [
    { id: 'plano-de-corte-intro', title: `What the Cutting List is for`, html: `<p>The <strong>Cutting List</strong> tab is a tool for contractors who cut their own material: type or import a spreadsheet (.xlsx, .csv or .txt) with the list of pieces — measurements, thickness, color, edge banding and grain direction — and generate a price and a sheet-cutting diagram.</p>
<div class="po-help-tip">This tab is exclusive to <strong>Contractor</strong> accounts — if you're a regular customer, it won't even show up in your menu.</div>` },
  ] }
);
HELP_CONTENT.es.push(
  { id: 'meus-projetos', title: `Mis Proyectos`, articles: [
    { id: 'gerenciar-projetos', title: `Gestionar proyectos: abrir, renombrar, duplicar y eliminar`, html: `<p>En la pestaña <strong>Mis Proyectos</strong>, cada ambiente guardado aparece como una tarjeta con una sola imagen — la foto renderizada, si ya generaste una, o la vista 3D del ambiente mientras no haya render.</p>
<ul>
<li><strong>Cargar en Composición</strong> — abre el proyecto en el editor para seguir trabajando.</li>
<li><strong>Renombrar</strong> — cambia el nombre del proyecto.</li>
<li><strong>Duplicar</strong> — pide el nombre del nuevo proyecto de inmediato (sugerido como "nombre actual (copia)") y crea una copia independiente con los mismos módulos, paredes y medidas, para reutilizarla con un cliente parecido.</li>
<li><strong>Eliminar</strong> — borra el proyecto (pide confirmación antes).</li>
</ul>
<div class="po-help-tip">La copia creada con "Duplicar" nace sin su propio enlace para compartir ni enlace "Ver en 3D" — genera unos nuevos si también quieres compartir la copia.</div>` },
    { id: 'compartilhar-projeto', title: `Compartir un proyecto con otro usuario`, html: `<p>El botón <strong>🔗 Compartir</strong> de cada tarjeta genera un enlace y un código para pasar ese proyecto a otra cuenta — por ejemplo, del distribuidor al cliente, o entre compañeros.</p>
<ul>
<li>Al hacer clic, el enlace se copia de inmediato al portapapeles; también puedes compartir solo el código.</li>
<li>Quien lo recibe debe tener sesión iniciada. En su propia pestaña <strong>Mis Proyectos</strong>, en el recuadro <strong>"¿Recibiste un proyecto?"</strong>, pega el enlace o el código y hace clic en <strong>Importar</strong>.</li>
<li>Si la persona hace clic directamente en el enlace recibido, el proyecto se abre solo.</li>
</ul>
<div class="po-help-tip">Compartir siempre crea una COPIA en la cuenta de quien la recibe — tu proyecto original permanece intacto. Después de importar, hay que revisarla y hacer clic en Guardar para quedarse con la copia.</div>` },
    { id: 'ver-em-3d', title: `Ver en 3D: enlace público para un cliente o instalador`, html: `<p>El botón <strong>🎥 Ver en 3D</strong> genera un enlace público que cualquier persona puede abrir SIN necesidad de cuenta ni inicio de sesión — ideal para enviarlo al cliente final o al instalador para que revise el ambiente.</p>
<ul>
<li>Quien abre el enlace solo ve la escena 3D del proyecto: puede rotar y hacer zoom, pero no puede editar nada ni ver precios.</li>
<li>Un botón <strong>"📐 Mostrar medidas"</strong> dentro de la página revela el tamaño y la posición de cada módulo, útil para quien va a instalar.</li>
<li>El enlace expira solo a los 30 días. Si haces clic en "Ver en 3D" de nuevo antes de eso, se reutiliza el mismo enlace.</li>
</ul>` },
  ] },
  { id: 'pedidos', title: `Mis Pedidos`, articles: [
    { id: 'acompanhar-pedido', title: `Seguir el estado de tu pedido`, html: `<p>Después de enviar un proyecto como pedido, sigue su avance en la pestaña <strong>Mis Pedidos</strong>: cada pedido muestra una etiqueta de estado que avanza en este orden:</p>
<ul>
<li><strong>Pendiente</strong> — pedido enviado, en espera de revisión.</li>
<li><strong>Aprobada</strong> — pedido confirmado; los datos de contacto y entrega quedan bloqueados.</li>
<li><strong>Pagada</strong> — pago confirmado.</li>
<li><strong>Entregada</strong> — etapa final.</li>
</ul>
<p>Los pedidos que vienen del Plan de Corte y aún no se enviaron a fábrica aparecen como <strong>Guardado</strong>. Haz clic en cualquier pedido de la lista para ver todos sus detalles e ítems.</p>` },
    { id: 'proposta-pdf', title: `Generar una Propuesta en PDF`, html: `<p>El botón <strong>Propuesta</strong> genera un documento en PDF listo para presentar al cliente final: portada con tu logo y los datos de la tienda, foto del proyecto (realista, si ya se generó una), elevaciones de las paredes y planta con cotas, lista de módulos con un ícono por pieza y el precio total ya con tu margen aplicado.</p>
<ul>
<li>Se puede generar directamente desde la pestaña Proyectos (una vista previa rápida) o desde un pedido que ya fue enviado.</li>
<li>Configura tu logo y los datos de la tienda en Configuración antes, para que aparezcan en el encabezado.</li>
</ul>
<div class="po-help-tip">Esta función está pensada para cuentas de reventa — Distribuidor, Contractor y Administrador. Si eres un cliente final comprando directamente, es posible que no veas este botón.</div>` },
  ] },
  { id: 'galeria', title: `Galería`, articles: [
    { id: 'render-ia', title: `Generar una imagen realista (IA) de tu proyecto`, html: `<p>Una vez armado tu ambiente en 3D, puedes generar una imagen fotorrealista de él usando Inteligencia Artificial.</p>
<ul>
<li>En la pestaña Proyectos, con el ambiente armado y guardado, haz clic en <strong>Foto realista</strong>.</li>
<li>Al publicar una composición en la Galería, usa el botón <strong>"✨ Generar imagen realista"</strong> para crear la imagen de IA que acompaña la publicación.</li>
<li>La generación toma unos instantes; cuando está lista, la imagen aparece en pantalla y se puede guardar en el proyecto o descargar.</li>
</ul>
<div class="po-help-tip">Las imágenes generadas por IA pueden presentar pequeñas diferencias respecto al producto real — el dibujo 3D es siempre la referencia fiel del proyecto.</div>` },
    { id: 'galeria-publica', title: `Explorar la Galería pública`, html: `<p>La pestaña <strong>Galería</strong> reúne ambientes armados por otros clientes y se puede ver incluso sin tener cuenta — es la única pestaña visible para un visitante sin sesión iniciada.</p>
<ul>
<li>Usa los filtros de ambiente, precio, ancho y color para encontrar composiciones parecidas a lo que buscas.</li>
<li>Para usar una composición como punto de partida (botón <strong>Personalizar</strong>) o para dar like a una publicación, hace falta iniciar sesión — aparece un aviso de inicio de sesión de inmediato, con opción de continuar con Google.</li>
</ul>` },
  ] },
  { id: 'plano-de-corte', title: `Plan de Corte`, articles: [
    { id: 'plano-de-corte-intro', title: `Para qué sirve el Plan de Corte`, html: `<p>La pestaña <strong>Plan de Corte</strong> es una herramienta para quienes cortan su propio material: escribe o importa una planilla (.xlsx, .csv o .txt) con la lista de piezas — medidas, espesor, color, cinta de borde y sentido de la veta — y genera el precio y el diagrama de aprovechamiento de las chapas.</p>
<div class="po-help-tip">Esta pestaña es exclusiva de cuentas <strong>Contractor</strong> — si eres un cliente normal, ni siquiera aparece en tu menú.</div>` },
  ] }
);

// Ordem final de exibição na barra lateral — os 4 blocos acima (escritos/
// pesquisados em paralelo) empurram categorias em ORDENS DIFERENTES; esta
// lista fixa reordena sem precisar tocar no conteúdo de cada categoria.
const HELP_CATEGORY_ORDER = [
  'inicio', 'novo-orcamento', 'projetos-ambiente', 'projetos-construtor',
  'projetos-cores', 'projetos-barra', 'meus-projetos', 'pedidos', 'galeria',
  'plano-de-corte', 'conta',
];
['pt', 'en', 'es'].forEach((lang) => {
  HELP_CONTENT[lang].sort((a, b) => HELP_CATEGORY_ORDER.indexOf(a.id) - HELP_CATEGORY_ORDER.indexOf(b.id));
});

// ---- Estado do modal ----
let helpSelectedCatId = null;
let helpSelectedArtId = null;

function helpLang() {
  const l = (typeof I18n !== 'undefined' && I18n.getLanguage) ? I18n.getLanguage() : 'pt';
  return (HELP_CONTENT[l] && HELP_CONTENT[l].length) ? l : 'pt';
}

function helpCategories() {
  return HELP_CONTENT[helpLang()] || [];
}

function helpFindArticle(catId, artId) {
  const cat = helpCategories().find((c) => c.id === catId);
  if (!cat) return null;
  const art = cat.articles.find((a) => a.id === artId);
  return art ? { cat, art } : null;
}

// Texto puro (sem tags) — só pra indexar a busca, nunca pra exibir (a
// exibição usa o HTML de verdade, com <p>/<ul>/<strong> etc.).
function helpStripHtml(html) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function helpNormalize(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// ---- Renderização ----

function renderHelpSidebar() {
  const nav = document.getElementById('po-help-sidebar');
  if (!nav) return;
  nav.innerHTML = helpCategories().map((cat) => {
    const catAtiva = cat.id === helpSelectedCatId;
    const artigos = cat.articles.map((a) => (
      '<button type="button" class="po-help-article-link' + (a.id === helpSelectedArtId ? ' ativo' : '') + '" '
      + 'data-cat="' + cat.id + '" data-art="' + a.id + '">' + a.title + '</button>'
    )).join('');
    return (
      '<div class="po-help-cat">'
      + '<button type="button" class="po-help-cat-title' + (catAtiva ? ' ativo' : '') + '" data-cat-toggle="' + cat.id + '">' + cat.title + '</button>'
      + '<div class="po-help-cat-articles' + (catAtiva ? '' : ' escondido') + '" data-cat-articles="' + cat.id + '">' + artigos + '</div>'
      + '</div>'
    );
  }).join('');

  nav.querySelectorAll('[data-cat-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const catId = btn.dataset.catToggle;
      const cat = helpCategories().find((c) => c.id === catId);
      if (!cat || !cat.articles.length) return;
      selectHelpArticle(catId, cat.articles[0].id);
    });
  });
  nav.querySelectorAll('.po-help-article-link').forEach((btn) => {
    btn.addEventListener('click', () => selectHelpArticle(btn.dataset.cat, btn.dataset.art));
  });
}

function renderHelpContent() {
  const box = document.getElementById('po-help-content');
  if (!box) return;
  const found = helpFindArticle(helpSelectedCatId, helpSelectedArtId);
  box.innerHTML = found ? ('<h3>' + found.art.title + '</h3>' + found.art.html) : '';
  box.scrollTop = 0;
}

function selectHelpCategory(catId) {
  const cat = helpCategories().find((c) => c.id === catId);
  if (!cat || !cat.articles.length) return;
  selectHelpArticle(catId, cat.articles[0].id);
}

function selectHelpArticle(catId, artId) {
  helpSelectedCatId = catId;
  helpSelectedArtId = artId;
  hideHelpSearchResults();
  const input = document.getElementById('po-help-search-input');
  if (input) input.value = '';
  renderHelpSidebar();
  renderHelpContent();
}

// ---- Busca (kb.promob-style: digita, resultados na hora, clica, abre) ----

function helpBuildSearchIndex() {
  const idx = [];
  helpCategories().forEach((cat) => {
    cat.articles.forEach((art) => {
      idx.push({
        catId: cat.id,
        artId: art.id,
        catTitle: cat.title,
        title: art.title,
        text: helpNormalize(art.title + ' ' + helpStripHtml(art.html)),
        titleNorm: helpNormalize(art.title),
      });
    });
  });
  return idx;
}

function hideHelpSearchResults() {
  const box = document.getElementById('po-help-search-results');
  if (box) { box.style.display = 'none'; box.innerHTML = ''; }
}

function runHelpSearch(query) {
  const box = document.getElementById('po-help-search-results');
  if (!box) return;
  const q = helpNormalize(query || '').trim();
  if (!q) { hideHelpSearchResults(); return; }
  const idx = helpBuildSearchIndex();
  const results = idx
    .map((item) => {
      const inTitle = item.titleNorm.indexOf(q);
      const inText = item.text.indexOf(q);
      if (inTitle < 0 && inText < 0) return null;
      // título bate primeiro (mais relevante), e bate mais cedo no título
      // ainda mais relevante — mesmo espírito de qualquer busca de KB simples.
      const score = (inTitle >= 0 ? 1000 - inTitle : 0) + (inText >= 0 ? 100 - Math.min(inText, 100) : 0);
      return { item, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((r) => r.item);

  if (!results.length) {
    box.innerHTML = '<div class="po-help-search-empty">' + I18n.t('help.no_results') + '</div>';
  } else {
    box.innerHTML = results.map((r) => (
      '<button type="button" class="po-help-search-result" data-cat="' + r.catId + '" data-art="' + r.artId + '">'
      + '<strong>' + r.title + '</strong><span>' + r.catTitle + '</span></button>'
    )).join('');
    box.querySelectorAll('.po-help-search-result').forEach((btn) => {
      btn.addEventListener('click', () => selectHelpArticle(btn.dataset.cat, btn.dataset.art));
    });
  }
  box.style.display = 'block';
}

// ---- Abrir / fechar modal ----

function openHelpModal(catId, artId) {
  const modal = document.getElementById('po-help-modal');
  if (!modal) return;
  const cats = helpCategories();
  if (!cats.length) return;
  const cat = cats.find((c) => c.id === catId) || cats[0];
  const art = (cat.articles.find((a) => a.id === artId)) || cat.articles[0];
  helpSelectedCatId = cat.id;
  helpSelectedArtId = art.id;
  renderHelpSidebar();
  renderHelpContent();
  modal.classList.add('open');
}

function closeHelpModal() {
  const modal = document.getElementById('po-help-modal');
  if (modal) modal.classList.remove('open');
  hideHelpSearchResults();
}

(function attachHelpCenter() {
  const btn = document.getElementById('po-help-btn');
  if (btn) btn.addEventListener('click', () => openHelpModal());

  const closeBtn = document.getElementById('po-help-modal-close');
  if (closeBtn) closeBtn.addEventListener('click', closeHelpModal);

  const modal = document.getElementById('po-help-modal');
  if (modal) {
    // Clicar no fundo escuro fecha; clicar dentro do card não (mesmo padrão
    // dos outros modais do portal).
    modal.addEventListener('click', (ev) => { if (ev.target === modal) closeHelpModal(); });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && modal.classList.contains('open')) closeHelpModal();
  });

  const searchInput = document.getElementById('po-help-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', () => runHelpSearch(searchInput.value));
    searchInput.addEventListener('focus', () => { if (searchInput.value) runHelpSearch(searchInput.value); });
  }

  // Idioma pode trocar com o modal aberto (seletor no menu de Configurações,
  // que fica acessível por cima do modal de Ajuda igual qualquer outra
  // tela) — reconstrói tudo no idioma novo, mantendo a categoria/artigo
  // selecionados quando eles existem nos 3 idiomas com o MESMO id (é assim
  // que HELP_CONTENT é montado de propósito: mesmos ids, texto traduzido).
  if (typeof I18n !== 'undefined' && I18n.onLanguageChange) {
    I18n.onLanguageChange(() => {
      if (!modal || !modal.classList.contains('open')) return;
      const cats = helpCategories();
      const stillCat = cats.find((c) => c.id === helpSelectedCatId);
      if (!stillCat) { openHelpModal(); return; }
      renderHelpSidebar();
      renderHelpContent();
    });
  }
})();
