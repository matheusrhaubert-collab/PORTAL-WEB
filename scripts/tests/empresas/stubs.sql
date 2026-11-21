-- Mini-Supabase de mentira pra bancada (rodar.mjs). Só o que as migrations 306–309 usam.
create role authenticated nologin; create role anon nologin;
create schema auth; create schema storage;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint);
create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
create table public.admin_users (user_id uuid primary key);
create or replace function public.is_admin() returns boolean language sql security definer stable as $$ select exists (select 1 from public.admin_users where user_id = auth.uid()) $$;
create table public.user_profiles (user_id uuid primary key references auth.users(id) on delete cascade, email text,
  role text not null default 'cliente', store_name text, store_phone text, logo_url text,
  factory_discount_pct numeric(6,2) not null default 0, resale_margin_pct numeric(6,2) not null default 0,
  parent_dealer_user_id uuid, seller_active boolean not null default true, last_active_at timestamptz);
alter table public.user_profiles enable row level security;
create policy "self" on public.user_profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create table public.orders (id uuid primary key default gen_random_uuid(), client_user_id uuid not null references auth.users(id),
  status text not null default 'draft', po_name text, delivery_address text, submitted_at timestamptz);
alter table public.orders enable row level security;
create policy "client manage own orders" on public.orders for all using (client_user_id = auth.uid()) with check (client_user_id = auth.uid());
create policy "admin read orders" on public.orders for select using (is_admin());
create table public.order_items (id uuid primary key default gen_random_uuid(), order_id uuid references public.orders(id) on delete cascade, total_price numeric(10,2) not null);
alter table public.order_items enable row level security;
create policy "own items" on public.order_items for all using (exists (select 1 from orders o where o.id = order_id and o.client_user_id = auth.uid()));
create table public.user_projects (id uuid primary key default gen_random_uuid(), client_user_id uuid not null references auth.users(id), name text, client_folder text, archived_at timestamptz, cached_value_usd numeric);
alter table public.user_projects enable row level security;
create policy "own projects" on public.user_projects for all using (client_user_id = auth.uid()) with check (client_user_id = auth.uid());
grant usage on schema public, auth, storage to authenticated;
grant all on all tables in schema public to authenticated;
alter default privileges in schema public grant all on tables to authenticated;
