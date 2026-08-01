-- LEGNO PORTAL WEB — schema completo (configuração de módulos, custos e opcionais)
-- Rode este script inteiro no SQL Editor do Supabase (projeto novo, vazio).
-- Se você já rodou uma versão anterior deste schema, rode em vez disso, em
-- ordem: database/migration_002_opcionais.sql, depois
-- database/migration_003_componentes_reutilizaveis.sql, depois
-- database/migration_004_composicao_modelo_porta.sql, depois
-- database/migration_005_mao_de_obra_catalogo.sql, depois
-- database/migration_006_tipos_componente_e_gavetas.sql, depois
-- database/migration_007_formula_override_por_modulo.sql, depois
-- database/migration_008_cor_solida_swatch.sql, depois
-- database/migration_009_posicao_componente.sql, depois
-- database/migration_010_deslocamento_posicao.sql, depois
-- database/migration_011_stretcher_position_role.sql, depois
-- database/migration_012_deslocamento_formula.sql, depois
-- database/migration_013_dobradica_porta.sql, depois
-- database/migration_014_leg_position_role.sql, depois
-- database/migration_015_quantidade_configuravel_por_modulo.sql, depois
-- database/migration_016_opcionais_cliente.sql, depois
-- database/migration_017_portal_cliente_pedidos.sql, depois
-- database/migration_018_admin_allowlist.sql, depois
-- database/migration_019_opcional_marcado_padrao.sql, depois
-- database/migration_020_ordem_cores.sql, depois
-- database/migration_021_nome_po_orcamento.sql, depois
-- database/migration_022_profundidades_fixas_gaveta.sql, depois
-- database/migration_023_modulo_como_componente.sql — só as mudanças novas.
-- IMPORTANTE: a migration 018 exige um passo manual depois de rodar (inserir
-- o(s) e-mail(s) de login do admin na tabela admin_users) — leia o comentário
-- no topo desse arquivo antes de rodar em produção.

create extension if not exists "uuid-ossp";

-- ==========================================================================
-- TAXONOMIA — organização dos módulos por família/categoria/subcategoria
-- Ex: Família = Kitchens, Categoria = Base, Subcategoria = Drawers
-- ==========================================================================

create table if not exists families (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  active boolean not null default true,
  -- Ordem de exibição escolhida pelo admin (setas ▲▼ na tela de Taxonomia,
  -- ver migration_057) — menor valor aparece primeiro nas abas do portal.
  -- A aba "Todas" fica sempre fixa no fim, independente disso.
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists subcategories (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- ==========================================================================
-- CORES / MATERIAIS (chapas) — usado tanto para cor da caixa quanto cor da
-- porta (mesmo catálogo, o que muda é qual peça aplica qual cor escolhida).
-- ==========================================================================

create table if not exists colors (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  sheet_price_per_m2 numeric(10,2) not null default 0,
  edge_price_per_linear_m numeric(10,2) not null default 0,
  texture_url text,
  -- Cor sólida de referência (ex: #E4DCC8) — usada como fallback no swatch
  -- e no desenho 3D do módulo quando a cor não tem textura cadastrada.
  swatch_hex text not null default '#cccccc',
  active boolean not null default true,
  -- Ordem de exibição escolhida pelo admin (setas ▲▼ na tela de Cores) —
  -- menor valor aparece primeiro, tanto no admin quanto pro cliente/portal.
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- ==========================================================================
-- CATÁLOGOS DE OPCIONAIS (globais, reutilizáveis entre módulos)
-- ==========================================================================

-- Modelo de dobradiça (slow motion, touch...). Custo fixo por unidade,
-- multiplicado pela quantidade de dobradiças que cada peça-porta precisa.
create table if not exists hinge_models (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  price_per_unit numeric(10,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Modelo de corrediça/slide (Hafele slow motion, Salice touch...). Custo
-- fixo por unidade, multiplicado pela quantidade que cada peça-gaveta
-- precisa.
create table if not exists slide_models (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  price_per_unit numeric(10,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Modelo/tipo de mão de obra (Mão de obra caixa, Mão de obra LED, Mão de
-- obra 1, 2, 3...). Custo fixo por unidade — o componente só ESCOLHE qual
-- tipo de mão de obra usa, em vez de digitar um valor manualmente. Se o
-- preço da mão de obra mudar, troca aqui uma vez só e todos os componentes
-- que usam esse tipo refletem a mudança.
create table if not exists labor_types (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  price_per_unit numeric(10,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Catálogo de PAPÉIS DE COR (migration 035) — substitui o binário fixo
-- "caixa"/"porta": o admin cria/renomeia/remove quantos papéis quiser (ex:
-- "Caixa", "Porta/Frente", "Puxador"...), cada component_type assume UM
-- papel (color_role_id abaixo), e o cliente escolhe uma cor por papel que o
-- módulo realmente usa. Seed inicial: "Caixa" (sort_order 0) e "Porta/
-- Frente" (sort_order 1) — os 2 papéis que já existiam implicitamente.
create table if not exists color_roles (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- Tipo do componente (Lateral, Base, Prateleira, Fundo, Porta, Gaveta...).
-- color_role_id decide qual papel de cor esse tipo de peça usa (migration
-- 035 — antes era o boolean is_front, só 2 opções fixas: cor de porta/frente
-- ou cor da caixa). Definido uma vez no tipo, não por componente.
-- positioning (migration 024) declara EXPLICITAMENTE como esse tipo é
-- inserido no ambiente 3D — substitui a auto-detecção por menor dimensão
-- quando presente: 'horizontal' (fino em Y, ex: base/topo/prateleira),
-- 'vertical' (fino em X, ex: lateral), 'vertical_no_plano'/
-- 'horizontal_no_plano' (ambos finos em Z — ex: porta/fundo — só diferem no
-- giro da textura, ver viewer3d.js resolveRotateTexture). NULL = automático
-- (comportamento antigo, por menor dimensão + regra hardcoded por
-- position_role).
create table if not exists component_types (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  color_role_id uuid not null references color_roles(id),
  positioning text check (positioning is null or positioning in ('horizontal', 'vertical', 'vertical_no_plano', 'horizontal_no_plano')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ==========================================================================
-- MÓDULO (PAI)
-- ==========================================================================

create table if not exists modules (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text unique,
  description text,
  family_id uuid references families(id),
  category_id uuid references categories(id),
  subcategory_id uuid references subcategories(id),
  width_min_mm numeric not null,
  width_max_mm numeric not null,
  width_default_mm numeric not null,
  height_min_mm numeric not null,
  height_max_mm numeric not null,
  height_default_mm numeric not null,
  depth_min_mm numeric not null,
  depth_max_mm numeric not null,
  depth_default_mm numeric not null,
  -- Trava por dimensão (migration 028) — quando true, o cliente NÃO vê mais
  -- a régua livre entre mín/máx pra essa dimensão: escolhe só entre os
  -- valores cadastrados em module_dimension_presets (dropdown). Quando
  -- false (padrão), a régua continua livre e os presets aparecem só como
  -- sugestão (chips clicáveis) — não restringem nada.
  width_locked boolean not null default false,
  height_locked boolean not null default false,
  depth_locked boolean not null default false,
  active boolean not null default true,
  -- Módulo continua existindo e pode ser usado como PEÇA aninhada dentro de
  -- outro módulo (module_components.child_module_id) mesmo estando
  -- invisível — a flag só decide se aparece na galeria/listagem do
  -- cliente. Substitui o antigo sistema especial de "modelo de porta"/
  -- "modelo de gaveta": um estilo de porta agora é só um módulo comum
  -- marcado invisível, usado como peça de outros módulos.
  is_invisible boolean not null default false,
  -- Imagem 3D (miniatura) gerada no admin, aba "Configurar módulo" (migration
  -- 030) — PNG como data URL (base64), mesma convenção de
  -- order_items.thumbnail_data_url. Câmera FIXA/padrão (Viewer3D refit),
  -- pra todo módulo sair com o mesmo ângulo relativo. null = ainda sem
  -- imagem gerada -> vitrine do portal cai pro ícone SVG genérico (ver
  -- drawModuleSvg em portal.js).
  thumbnail_data_url text,
  created_at timestamptz not null default now()
);

-- Profundidades fixas disponíveis pra este módulo (ex: corrediças de
-- 300/350/400/450mm quando ele é usado como peça-gaveta aninhada) — o
-- módulo não "estica" pra qualquer profundidade nesse caso: o motor de
-- cálculo (Pricing.pickDrawerDepth, agora genérico) escolhe a MAIOR
-- profundidade fixa que caiba no espaço disponível, descontando a folga
-- (ver DRAWER_DEPTH_CLEARANCE_MM em pricing.js). Generaliza o antigo
-- drawer_type_depths (que só existia pra modelo de gaveta) pra QUALQUER
-- módulo que precise dessa regra.
create table if not exists module_fixed_depths (
  id uuid primary key default uuid_generate_v4(),
  module_id uuid not null references modules(id) on delete cascade,
  depth_mm numeric not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_module_fixed_depths_module_id
  on module_fixed_depths(module_id);

-- Valores sugeridos/travados de medida por módulo (migration 028) — Largura/
-- Altura/Profundidade do módulo de PRIMEIRO NÍVEL (o que o próprio cliente
-- escolhe e configura direto no portal — diferente de module_fixed_depths
-- acima, que só entra em jogo quando o módulo é usado como PEÇA ANINHADA
-- dentro de outro). label/description aparecem pro cliente (ex: "Padrão");
-- reference é só uso interno do admin (SKU/código), nunca aparece pro
-- cliente. Ver modules.width_locked/height_locked/depth_locked pra decidir
-- se isso é só sugestão (chips + régua livre) ou uma trava (dropdown, sem
-- régua livre).
create table if not exists module_dimension_presets (
  id uuid primary key default uuid_generate_v4(),
  module_id uuid not null references modules(id) on delete cascade,
  dimension text not null check (dimension in ('width', 'height', 'depth')),
  value_mm numeric not null,
  label text,
  description text,
  reference text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_module_dimension_presets_module_id
  on module_dimension_presets(module_id, dimension, sort_order);

-- ==========================================================================
-- COMPONENTES — biblioteca reutilizável de peças.
--
-- Cada componente é cadastrado UMA VEZ (com fórmulas de material-prima e
-- mão de obra) e pode ser usado por VÁRIOS módulos através de
-- module_components — evita recadastrar "Lateral Esquerda", "Fundo" etc.
-- pra cada módulo novo. Se o preço de mão de obra ou material mudar, você
-- troca num lugar só e todos os módulos que usam esse componente refletem
-- a mudança.
--
-- type_id: tipo do componente (Lateral, Base, Porta, Gaveta...), escolhido
-- de component_types. O tipo decide se a peça usa cor de caixa ou de
-- porta/frente (component_types.is_front) — não é mais um campo manual por
-- componente.
--
-- color_role, hinges_per_unit, slides_per_unit, quantity_configurable e o
-- intervalo min/default/max ficam na tabela por compatibilidade com dados
-- antigos, mas não são mais usados no formulário nem no cálculo.
-- ==========================================================================

create table if not exists components (
  id uuid primary key default uuid_generate_v4(),
  reference text not null,
  quantity integer not null default 1, -- quantidade padrão quando um módulo usa este componente
  type_id uuid references component_types(id),

  color_role text not null default 'box' check (color_role in ('box', 'door')), -- legado, ver type_id
  hinges_per_unit integer not null default 0, -- legado
  slides_per_unit integer not null default 0, -- legado

  quantity_configurable boolean not null default false, -- legado
  quantity_min integer,
  quantity_max integer,
  quantity_default integer,

  width_formula text not null default 'W',
  height_formula text not null default 'H',
  depth_formula text not null default 'D',
  area_m2_formula text not null default 'w*h/1000000',
  edge_band_linear_m_formula text not null default '0',
  labor_type_id uuid references labor_types(id), -- escolhido de um catálogo (caixa, LED, 1, 2, 3...), não digitado
  -- Onde essa peça fica dentro do volume do módulo — usado só pelo
  -- visualizador 3D pra montar as peças na posição certa (não afeta o
  -- cálculo de preço). 'other' = não desenha (ex: ferragem interna).
  position_role text not null default 'other'
    check (position_role in (
      'left', 'right', 'top', 'bottom', 'back', 'front', 'shelf', 'drawer',
      'leg', 'handle', 'baseboard', 'countertop', 'free', 'other'
    )),
  -- Lado da dobradiça — só relevante pra position_role = 'front'. O
  -- desenho 3D usa isso pra girar a porta em torno da borda certa quando o
  -- cliente clica em "Abrir portas". 'none' = frente fixa, não abre.
  hinge_side text not null default 'none' check (hinge_side in ('none', 'left', 'right')),
  notes text, -- usado como "Descrição" no formulário simplificado
  -- Origem do componente (migration 034) — 'fabricacao' (padrão) entra na
  -- lista de peças/corte do admin (aba Pedidos); 'comprado' (ex: puxador,
  -- pé, ferragem) não é cortado, entra numa lista de compra separada. É por
  -- COMPONENTE, não por tipo, porque o mesmo tipo pode ter itens de origem
  -- diferente.
  origin text not null default 'fabricacao' check (origin in ('fabricacao', 'comprado')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Vínculo módulo x peça. quantity_override permite usar o MESMO componente
-- com uma quantidade diferente do padrão em módulos diferentes (ex:
-- "Prateleira" 2x no módulo A, 3x no módulo B) sem duplicar o cadastro —
-- deixe em branco pra usar components.quantity.
--
-- MÓDULO-COMO-COMPONENTE: uma peça pode ser OU um componente do catálogo
-- (component_id) OU outro módulo inteiro usado como sub-montagem
-- (child_module_id) — exatamente um dos dois, nunca os dois, nunca nenhum
-- (ver constraint module_components_component_xor_module). Isso substitui o
-- antigo sistema especial de "modelo de porta"/"modelo de gaveta": uma
-- porta Shaker agora é só um módulo comum (marcado is_invisible=true) usado
-- como peça de outro módulo, resolvido recursivamente por pricing.js e
-- viewer3d.js. Quando child_module_id está preenchido, position_role/
-- color_role/opening_type/slides_per_unit (mais abaixo) e as fórmulas de
-- L/A/P (que viram OBRIGATÓRIAS, não mais "override" de nada) descrevem
-- essa peça-módulo — ela não tem um "components" próprio pra herdar isso.
--
-- "id" (uuid) é a chave primária — a antiga chave composta (module_id,
-- component_id) não funciona mais porque component_id precisa aceitar nulo
-- (peça-módulo não tem componente), e Postgres não aceita coluna nula em
-- chave primária.
--
-- REPETIÇÃO PERMITIDA (migration 025): o mesmo componente de catálogo (ou o
-- mesmo módulo aninhado) PODE aparecer em mais de uma linha do mesmo
-- módulo — cada linha é uma instância independente da peça, com sua própria
-- quantidade/fórmula/deslocamento, útil pra colocar a mesma peça em
-- posições diferentes dentro do módulo. Não existe mais unique(module_id,
-- component_id)/unique(module_id, child_module_id) impedindo isso — "id"
-- (a PK) é a única identidade de cada linha.
create table if not exists module_components (
  id uuid primary key default uuid_generate_v4(),
  module_id uuid not null references modules(id) on delete cascade,
  component_id uuid references components(id) on delete cascade,
  child_module_id uuid references modules(id) on delete cascade,
  quantity_override integer,
  sort_order integer not null default 0,
  -- Fórmula de L/A/P — pra peça-componente, sobrescreve components.width_formula
  -- etc se preenchida (senão usa a fórmula padrão do componente); pra
  -- peça-módulo, é a ÚNICA fonte (obrigatória, não tem fórmula própria pra
  -- sobrescrever). Existe porque a mesma peça/módulo pode precisar de
  -- fórmula diferente dependendo do módulo pai (ex: espessura de lateral
  -- diferente).
  width_formula_override text,
  height_formula_override text,
  depth_formula_override text,
  -- Só usados quando child_module_id está preenchido (peça-módulo) — peça-
  -- componente usa components.position_role / cor definida por
  -- component_types.color_role_id / components.slides_per_unit.
  position_role text
    check (position_role is null or position_role in (
      'left', 'right', 'top', 'bottom', 'back', 'front', 'shelf', 'drawer',
      'leg', 'handle', 'baseboard', 'countertop', 'free', 'other'
    )),
  -- Papel de cor desta peça-módulo (migration 035 — antes era o texto fixo
  -- 'box'/'door', agora referencia o catálogo color_roles).
  color_role_id uuid references color_roles(id),
  -- Abertura genérica de peça-módulo: hinge_left/hinge_right giram em torno
  -- de uma borda (mesmo pivô 3D usado em componentes 'front' com
  -- hinge_side) — usado pra um módulo aninhado que É uma porta. slide_out
  -- desliza pra frente no eixo Z — usado pra um módulo aninhado que É uma
  -- gaveta. 'none' = não abre (padrão).
  opening_type text not null default 'none'
    check (opening_type in ('none', 'hinge_left', 'hinge_right', 'slide_out')),
  -- Quantas corrediças essa peça-módulo precisa (só relevante quando
  -- opening_type='slide_out') — mesmo papel que components.slides_per_unit
  -- tem pra peça-componente.
  slides_per_unit integer not null default 0,
  -- Deslocamento — FÓRMULA (aceita W, H, D do módulo, igual as fórmulas de
  -- L/A/P) somada à posição calculada automaticamente no desenho 3D pra
  -- esta peça neste módulo. Ex: "H-19" desloca a peça pra 19mm abaixo do
  -- topo do módulo, em vez de um número fixo que não se adapta se o módulo
  -- mudar de altura. Só visual — não afeta preço nem fórmula de L/A/P.
  offset_x_mm text not null default '0',
  offset_y_mm text not null default '0',
  offset_z_mm text not null default '0',
  -- "Cliente escolhe a quantidade" (ex: prateleiras) é uma característica
  -- deste MÓDULO usando este componente, não do componente em si — o mesmo
  -- componente de catálogo pode ter um intervalo em um módulo pequeno e
  -- outro num módulo grande. Quando quantity_configurable=true, o cliente
  -- vê um campo pra escolher a quantidade (dentro de min/default/max) em
  -- vez da quantidade fixa (quantity/quantity_override) — só se aplica a
  -- peças com position_role='shelf'.
  quantity_configurable boolean not null default false,
  quantity_min integer,
  quantity_max integer,
  quantity_default integer,
  -- Opcional pro CLIENTE (ex: puxador, rodapé, tampo, pé): se true, este
  -- componente não entra automaticamente — o cliente vê uma caixinha de
  -- marcar (pode marcar vários ao mesmo tempo, cada um somando seu próprio
  -- preço) e decide incluir ou não, desmarcado por padrão. Se false
  -- (padrão), comportamento de sempre: entra automaticamente porque o
  -- módulo usa esse componente.
  client_optional boolean not null default false,
  -- Só tem efeito quando client_optional=true: se true, a caixinha do
  -- opcional já nasce MARCADA (o componente já entra), mas o cliente ainda
  -- pode desmarcar e tirar. Se false (padrão), a caixinha nasce desmarcada
  -- (comportamento de sempre — cliente precisa marcar pra incluir). Cobre o
  -- caso de um opcional que "quase sempre" é usado (ex: pé) mas ainda
  -- precisa poder ser removido pelo cliente.
  client_optional_default_on boolean not null default false,
  -- Visibilidade condicional (migration 031): esconde esta peça dependendo
  -- do tamanho do módulo pai. dimension = qual eixo do CONTAINER (W/H/D,
  -- mesma convenção de width_formula_override/offset_x_mm) decide; min/max
  -- em mm, qualquer um pode ficar em branco (sem limite naquele lado). Sem
  -- visibility_dimension, a peça é sempre visível (comportamento padrão).
  visibility_dimension text check (visibility_dimension is null or visibility_dimension in ('W', 'H', 'D')),
  visibility_min_mm numeric,
  visibility_max_mm numeric,
  -- Nome customizado só desta instância/linha (migration 032) — sobrescreve
  -- o nome do catálogo (components.reference) ou do módulo aninhado só na
  -- exibição (admin, teste de cálculo, balão do 3D). Útil quando o mesmo
  -- componente/módulo se repete no mesmo módulo (migration 025), ex: "Ripa 1"
  -- / "Ripa 2" / "Ripa 3" em vez de todas mostrarem o mesmo nome de catálogo.
  reference_override text,
  constraint module_components_component_xor_module check (
    (component_id is not null and child_module_id is null)
    or
    (component_id is null and child_module_id is not null)
  )
);

-- ==========================================================================
-- VÍNCULOS módulo x opcionais disponíveis (mesmo padrão de module_colors)
-- ==========================================================================

-- Cores disponíveis para este módulo, POR PAPEL DE COR (migration 035 —
-- antes era (module_id, color_id) só, a mesma lista valendo pra caixa e
-- porta ao mesmo tempo; agora cada papel tem sua própria lista de cores
-- permitidas).
create table if not exists module_colors (
  module_id uuid not null references modules(id) on delete cascade,
  color_role_id uuid not null references color_roles(id) on delete cascade,
  color_id uuid not null references colors(id) on delete cascade,
  primary key (module_id, color_role_id, color_id)
);

create table if not exists module_hinge_models (
  module_id uuid not null references modules(id) on delete cascade,
  hinge_model_id uuid not null references hinge_models(id) on delete cascade,
  primary key (module_id, hinge_model_id)
);

create table if not exists module_slide_models (
  module_id uuid not null references modules(id) on delete cascade,
  slide_model_id uuid not null references slide_models(id) on delete cascade,
  primary key (module_id, slide_model_id)
);

-- ==========================================================================
-- ORÇAMENTOS enviados pelos clientes
-- ==========================================================================

create table if not exists quotes (
  id uuid primary key default uuid_generate_v4(),
  module_id uuid not null references modules(id),
  -- Cor escolhida por papel (migration 035 — antes eram 2 colunas fixas
  -- box_color_id/door_color_id). Formato: [{ role_id, role_name, color_id,
  -- color_name }, ...] — role_name/color_name são cópia, mesmo espírito de
  -- module_name/box_color_name em order_items (histórico legível mesmo se o
  -- papel/cor for renomeado ou excluído depois).
  selected_colors jsonb not null default '[]'::jsonb,
  hinge_model_id uuid references hinge_models(id),
  slide_model_id uuid references slide_models(id),
  width_mm numeric not null,
  height_mm numeric not null,
  depth_mm numeric not null,
  shelf_quantities jsonb not null default '{}'::jsonb, -- { component_id: quantidade escolhida }
  total_price numeric(10,2) not null,
  breakdown jsonb not null, -- uso interno/admin, cliente nunca vê
  client_name text,
  client_email text,
  client_phone text,
  status text not null default 'draft',
  created_at timestamptz not null default now()
);

-- ==========================================================================
-- PORTAL DO CLIENTE — pedidos com múltiplos módulos (carrinho).
-- "orders" é o pedido (agrupa vários módulos); "order_items" é cada módulo
-- configurado dentro dele. Independente da tabela "quotes" acima (que
-- continua servindo a calculadora avulsa de 1 módulo, sem login).
-- ==========================================================================

create table if not exists orders (
  id uuid primary key default uuid_generate_v4(),
  client_user_id uuid not null references auth.users(id) on delete cascade,
  client_name text,
  -- Nome/referência do próprio orçamento (ex: "Cozinha - Casa Silva"),
  -- preenchido pelo cliente logo no início do fluxo "Novo orçamento" —
  -- ajuda a organizar/identificar pedidos em andamento ou já enviados.
  po_name text,
  client_email text,
  client_phone text,
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  created_at timestamptz not null default now(),
  submitted_at timestamptz
);

create table if not exists order_items (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid not null references orders(id) on delete cascade,

  module_id uuid references modules(id) on delete set null,
  module_name text not null,
  module_description text,

  -- Cor escolhida por papel (migration 035 — antes eram 4 colunas fixas
  -- box_color_id/box_color_name/door_color_id/door_color_name). Mesmo
  -- formato de quotes.selected_colors acima.
  selected_colors jsonb not null default '[]'::jsonb,

  hinge_model_id uuid references hinge_models(id) on delete set null,
  slide_model_id uuid references slide_models(id) on delete set null,

  width_mm numeric not null,
  height_mm numeric not null,
  depth_mm numeric not null,
  shelf_quantities jsonb not null default '{}'::jsonb,
  selected_optional_component_ids jsonb not null default '[]'::jsonb,

  -- quantity (migration 029): quantas unidades IDÊNTICAS desta configuração
  -- essa linha representa — usado pelo "Adicionar módulo" rápido da vitrine
  -- (configuração padrão do módulo + quantidade escolhida no card), sem
  -- precisar abrir a tela de configuração completa uma vez por unidade.
  -- unit_price = preço de 1 unidade; total_price continua sendo o TOTAL da
  -- linha (unit_price x quantity) — todo código que soma total_price pra
  -- fechar o total do pedido continua funcionando sem mudança nenhuma.
  quantity integer not null default 1,
  unit_price numeric(10,2) not null,
  total_price numeric(10,2) not null,
  breakdown jsonb not null,

  thumbnail_data_url text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists order_items_order_id_idx on order_items(order_id);
create index if not exists orders_client_user_id_idx on orders(client_user_id);

-- ==========================================================================
-- ADMIN — allow-list de quem pode escrever nas tabelas de configuração.
-- "Estar autenticado" NÃO é suficiente pra ser admin (o portal do cliente
-- também usa Supabase Auth) — precisa estar nesta tabela. Sem policy
-- nenhuma em admin_users: ninguém lê/escreve nela pela API, só a função
-- is_admin() (security definer) por baixo dos panos.
-- ==========================================================================

create table if not exists admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table admin_users enable row level security;

create or replace function is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from admin_users where user_id = auth.uid());
$$;

-- ==========================================================================
-- MARGEM DE PREÇO (migration 037) — multiplicador de markup aplicado UMA VEZ
-- em cima do total (custo) calculado por pricing.js. Tabela "singleton" (1
-- linha só, id fixo) — ver comentário completo em migration_037.
-- ==========================================================================

create table if not exists pricing_settings (
  id boolean primary key default true,
  constraint pricing_settings_singleton check (id),
  markup_multiplier numeric(6,4) not null default 1.0000 check (markup_multiplier > 0),
  updated_at timestamptz not null default now()
);

insert into pricing_settings (id, markup_multiplier)
values (true, 1.0000)
on conflict (id) do nothing;

alter table pricing_settings enable row level security;

-- ==========================================================================
-- RLS
-- ==========================================================================

alter table color_roles enable row level security;
alter table families enable row level security;
alter table categories enable row level security;
alter table subcategories enable row level security;
alter table colors enable row level security;
alter table component_types enable row level security;
alter table hinge_models enable row level security;
alter table slide_models enable row level security;
alter table labor_types enable row level security;
alter table modules enable row level security;
alter table module_fixed_depths enable row level security;
alter table components enable row level security;
alter table module_components enable row level security;
alter table module_colors enable row level security;
alter table module_hinge_models enable row level security;
alter table module_slide_models enable row level security;
alter table quotes enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;

-- Leitura pública do necessário para a calculadora do cliente funcionar.
create policy "public read active color_roles" on color_roles for select using (active = true);
create policy "public read active families" on families for select using (active = true);
create policy "public read active categories" on categories for select using (active = true);
create policy "public read active subcategories" on subcategories for select using (active = true);
create policy "public read active colors" on colors for select using (active = true);
create policy "public read active component_types" on component_types for select using (active = true);
create policy "public read active hinge_models" on hinge_models for select using (active = true);
create policy "public read active slide_models" on slide_models for select using (active = true);
create policy "public read active labor_types" on labor_types for select using (active = true);
create policy "public read active modules" on modules for select using (active = true);
create policy "public read module_fixed_depths" on module_fixed_depths for select using (true);
create policy "public read active components" on components for select using (active = true);
create policy "public read module_components" on module_components for select using (true);
create policy "public read module_colors" on module_colors for select using (true);
create policy "public read module_hinge_models" on module_hinge_models for select using (true);
create policy "public read module_slide_models" on module_slide_models for select using (true);

-- Leitura pública do multiplicador de margem — o portal/calculadora do
-- cliente precisa dele pra aplicar a margem no preço exibido.
create policy "public read pricing_settings" on pricing_settings for select using (true);

-- Qualquer visitante pode criar um orçamento (envio da estimativa).
create policy "public insert quotes" on quotes for insert with check (true);

-- Escrita e leitura de orçamentos: só admin (allow-list, ver admin_users).
create policy "admin read quotes" on quotes for select using (is_admin());

-- Portal do cliente: cada um só enxerga/mexe nos PRÓPRIOS pedidos.
create policy "client manage own orders" on orders for all
  using (auth.uid() = client_user_id)
  with check (auth.uid() = client_user_id);
create policy "client manage own order_items" on order_items for all
  using (exists (select 1 from orders o where o.id = order_items.order_id and o.client_user_id = auth.uid()))
  with check (exists (select 1 from orders o where o.id = order_items.order_id and o.client_user_id = auth.uid()));

-- Admin (allow-list) só LÊ pedidos/itens — migration 033. Sem isso, o painel
-- admin não enxergava NENHUM pedido enviado pelo portal (só o cliente dono).
create policy "admin read orders" on orders for select using (is_admin());
create policy "admin read order_items" on order_items for select using (is_admin());

-- Escrita nas tabelas de configuração: só quem está na allow-list admin_users
-- (ver is_admin() acima) — não basta estar autenticado, senão um cliente do
-- portal também passaria.
create policy "admin write color_roles" on color_roles for all
  using (is_admin()) with check (is_admin());
create policy "admin write families" on families for all
  using (is_admin()) with check (is_admin());
create policy "admin write categories" on categories for all
  using (is_admin()) with check (is_admin());
create policy "admin write subcategories" on subcategories for all
  using (is_admin()) with check (is_admin());
create policy "admin write colors" on colors for all
  using (is_admin()) with check (is_admin());
create policy "admin write component_types" on component_types for all
  using (is_admin()) with check (is_admin());
create policy "admin write hinge_models" on hinge_models for all
  using (is_admin()) with check (is_admin());
create policy "admin write slide_models" on slide_models for all
  using (is_admin()) with check (is_admin());
create policy "admin write labor_types" on labor_types for all
  using (is_admin()) with check (is_admin());
create policy "admin write modules" on modules for all
  using (is_admin()) with check (is_admin());
create policy "admin write module_fixed_depths" on module_fixed_depths for all
  using (is_admin()) with check (is_admin());
create policy "admin write components" on components for all
  using (is_admin()) with check (is_admin());
create policy "admin write module_components" on module_components for all
  using (is_admin()) with check (is_admin());
create policy "admin write module_colors" on module_colors for all
  using (is_admin()) with check (is_admin());
create policy "admin write module_hinge_models" on module_hinge_models for all
  using (is_admin()) with check (is_admin());
create policy "admin write module_slide_models" on module_slide_models for all
  using (is_admin()) with check (is_admin());
create policy "admin write pricing_settings" on pricing_settings for all
  using (is_admin()) with check (is_admin());

-- ==========================================================================
-- STORAGE — texturas das cores/chapas
-- ==========================================================================

insert into storage.buckets (id, name, public)
values ('textures', 'textures', true)
on conflict (id) do nothing;

create policy "public read textures" on storage.objects for select
  using (bucket_id = 'textures');
create policy "admin upload textures" on storage.objects for insert
  with check (bucket_id = 'textures' and is_admin());
create policy "admin update textures" on storage.objects for update
  using (bucket_id = 'textures' and is_admin());
create policy "admin delete textures" on storage.objects for delete
  using (bucket_id = 'textures' and is_admin());
