-- Migration 056 — pedido do usuário (2026-07-21): "salvar projeto" (aba
-- Projetos) e "gerar IA" igual a Composição (prévia + publicar na Galeria
-- pública).
--
-- 1) user_projects — mesma ideia de user_compositions (migration 042), mas
--    pro formato de projectSlots (posição livre x_mm/floor_height_mm/z_order,
--    sem stack_on_id) + a largura do ambiente (wall_width_mm), que a
--    Composição não tem. RLS owner-only, mesmo padrão de user_compositions.
create table if not exists public.user_projects (
  id uuid primary key default gen_random_uuid(),
  client_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slots jsonb not null default '[]'::jsonb,
  wall_width_mm numeric not null default 3000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_projects enable row level security;

drop policy if exists "select own projects" on public.user_projects;
create policy "select own projects" on public.user_projects
  for select using (auth.uid() = client_user_id);

drop policy if exists "insert own projects" on public.user_projects;
create policy "insert own projects" on public.user_projects
  for insert with check (auth.uid() = client_user_id);

drop policy if exists "update own projects" on public.user_projects;
create policy "update own projects" on public.user_projects
  for update using (auth.uid() = client_user_id);

drop policy if exists "delete own projects" on public.user_projects;
create policy "delete own projects" on public.user_projects
  for delete using (auth.uid() = client_user_id);

-- 2) gallery_posts ganha 2 colunas novas — a Galeria pública passa a
--    receber posts de PROJETO (ambiente com módulos soltos), não só de
--    Composição (coluna empilhada). source_type discrimina qual restore
--    usar ao clicar "Personalizar" (restoreGalleryPostAsComposition vs
--    restoreGalleryPostAsProject, ver portal.js); wall_width_mm só é
--    preenchido pra posts de projeto (composição não tem largura de
--    ambiente, sempre null nesse caso).
alter table public.gallery_posts add column if not exists source_type text not null default 'composition';
alter table public.gallery_posts add column if not exists wall_width_mm numeric;
