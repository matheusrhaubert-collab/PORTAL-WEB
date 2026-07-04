-- LEGNO PORTAL WEB — schema de configuração de módulos e custos
-- Rode este script inteiro no SQL Editor do Supabase (projeto novo ou existente).

create extension if not exists "uuid-ossp";

-- Cores/materiais disponíveis. Cada cor tem seu próprio preço de chapa (m2)
-- e preço de fita de borda (metro linear), porque cores diferentes podem
-- usar chapas diferentes (ex: MDF branco vs MDF texturizado).
create table if not exists colors (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  sheet_price_per_m2 numeric(10,2) not null default 0,
  edge_price_per_linear_m numeric(10,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Módulo "pai": a unidade que o cliente escolhe e configura.
-- width/height/depth min-max definem o range que o cliente pode digitar;
-- default é o valor que aparece pré-preenchido na calculadora.
create table if not exists modules (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text unique,
  description text,
  width_min_mm numeric not null,
  width_max_mm numeric not null,
  width_default_mm numeric not null,
  height_min_mm numeric not null,
  height_max_mm numeric not null,
  height_default_mm numeric not null,
  depth_min_mm numeric not null,
  depth_max_mm numeric not null,
  depth_default_mm numeric not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Componentes (peças) do módulo pai. O preço do módulo pai é a SOMA do
-- cálculo de todos os seus componentes, conforme as medidas (W,H,D) e a
-- cor escolhida pelo cliente.
--
-- As fórmulas usam as variáveis W, H, D (largura/altura/profundidade do
-- módulo pai escolhidas pelo cliente). Depois de calcular width/height/depth
-- da própria peça, a fórmula de área também pode usar w, h, d (minúsculo,
-- dimensões já calculadas da peça). Exemplos de fórmula:
--   width_formula:  W - 36
--   height_formula: H - 72
--   depth_formula:  D
--   area_m2_formula: w*h/1000000
--   edge_band_linear_m_formula: 2*(w/1000)
create table if not exists module_pieces (
  id uuid primary key default uuid_generate_v4(),
  module_id uuid not null references modules(id) on delete cascade,
  reference text not null,
  quantity integer not null default 1,
  width_formula text not null default 'W',
  height_formula text not null default 'H',
  depth_formula text not null default 'D',
  area_m2_formula text not null default 'w*h/1000000',
  edge_band_linear_m_formula text not null default '0',
  labor_cost_per_unit numeric(10,2) not null default 0,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- Quais cores estão disponíveis para cada módulo.
create table if not exists module_colors (
  module_id uuid not null references modules(id) on delete cascade,
  color_id uuid not null references colors(id) on delete cascade,
  primary key (module_id, color_id)
);

-- Orçamentos gerados pelos clientes. breakdown fica salvo em jsonb para
-- histórico/auditoria interna, mesmo que o cliente só veja o total.
create table if not exists quotes (
  id uuid primary key default uuid_generate_v4(),
  module_id uuid not null references modules(id),
  color_id uuid not null references colors(id),
  width_mm numeric not null,
  height_mm numeric not null,
  depth_mm numeric not null,
  total_price numeric(10,2) not null,
  breakdown jsonb not null,
  client_name text,
  client_email text,
  client_phone text,
  status text not null default 'draft',
  created_at timestamptz not null default now()
);

alter table modules enable row level security;
alter table module_pieces enable row level security;
alter table colors enable row level security;
alter table module_colors enable row level security;
alter table quotes enable row level security;

-- Leitura pública do necessário para a calculadora do cliente funcionar.
create policy "public read active modules" on modules for select using (active = true);
create policy "public read module_pieces" on module_pieces for select using (true);
create policy "public read active colors" on colors for select using (active = true);
create policy "public read module_colors" on module_colors for select using (true);

-- Qualquer visitante pode criar um orçamento (envio da estimativa).
create policy "public insert quotes" on quotes for insert with check (true);

-- IMPORTANTE — SEGURANÇA:
-- Este script não cria policies de escrita (insert/update/delete) para
-- modules, module_pieces, colors e module_colors. Isso é proposital: por
-- padrão, com RLS ligado e sem policy de escrita, ninguém consegue alterar
-- preços/configurações pelo anon key do site público.
--
-- O painel admin (admin.html) precisa rodar autenticado. Depois de criar
-- um usuário admin no Supabase Auth, adicione policies como:
--
-- create policy "admin write modules" on modules for all
--   using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
-- create policy "admin write module_pieces" on module_pieces for all
--   using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
-- create policy "admin write colors" on colors for all
--   using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
-- create policy "admin write module_colors" on module_colors for all
--   using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
--
-- Até fazer isso, admin.html não conseguirá salvar (por segurança).
