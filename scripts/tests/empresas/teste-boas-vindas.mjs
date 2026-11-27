// Bancada da migration 349 (boas-vindas: cadastro obrigatório + exemplo só pra usuário novo). PGlite.
// Rodar (terminal, nesta pasta): node teste-boas-vindas.mjs
import path from 'path';
import { fileURLToPath } from 'url';
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const AQUI = process.env.LEGNO_TESTE_DIR || path.dirname(fileURLToPath(import.meta.url));
const DB = process.env.LEGNO_DB_DIR || path.join(AQUI, '..', '..', '..', 'database');
const db = new PGlite();
const ex = (s) => db.exec(s); const q = async (s, p) => (await db.query(s, p)).rows;
await ex(fs.readFileSync(path.join(AQUI, 'stubs.sql'), 'utf8'));
await ex(`alter table auth.users add column if not exists created_at timestamptz not null default now();
  alter table auth.users add column if not exists raw_user_meta_data jsonb not null default '{}'::jsonb;
  alter table public.user_profiles add column if not exists full_name text;
  alter table public.user_projects add column if not exists slots jsonb;
  alter table public.user_projects add column if not exists created_at timestamptz not null default now();
  alter table public.user_projects add column if not exists updated_at timestamptz not null default now();
  alter table public.user_projects add column if not exists frozen_order_id uuid;
  alter table public.user_projects add column if not exists client_info jsonb;
  create table public.project_photoreal_photos (id uuid primary key default gen_random_uuid(), project_id uuid, image_url text, camera_state jsonb, is_cover boolean default false, created_at timestamptz default now());`);
const rd = (f) => fs.readFileSync(path.join(DB, f), 'utf8');
const achar = (pref) => fs.readdirSync(DB).find((f) => f.startsWith(pref));
for (const p of ['migration_306_', 'migration_321_', 'migration_324_']) await ex(rd(achar(p)));

const U = {};
const novo = async (k, role, quando) => {
  U[k] = (await q(`insert into auth.users(email, created_at, raw_user_meta_data) values ($1, $2, $3) returning id`,
    [k + '@t.com', quando, JSON.stringify({ name: 'Nome ' + k, phone: '3525550000' })]))[0].id;
  if (role) await q(`insert into user_profiles(user_id,email,role) values ($1,$2,$3)`, [U[k], k + '@t.com', role]);
};
// ANTES da 349: logins antigos
await novo('admin', 'administrador', '2026-01-01');
await novo('velho', 'cliente', '2026-01-01');
await novo('velhoSemPerfil', null, '2026-01-01');
await novo('dealer', 'lojista', '2026-01-01');
await q(`insert into admin_users values ($1)`, [U.admin]);
await q(`insert into user_projects(client_user_id, name, slots) values ($1,'Modelo cozinha','[{"a":1}]')`, [U.admin]);
const modelo = (await q(`select id from user_projects where client_user_id=$1`, [U.admin]))[0].id;
await q(`insert into project_photoreal_photos(project_id, image_url, camera_state) values ($1,'x.jpg','{"print":true}')`, [modelo]);

const sql = rd('migration_349_boas_vindas_cadastro_e_exemplo.sql');
await ex(sql); await ex(sql);
await new Promise((r) => setTimeout(r, 20));
// DEPOIS da 349
await novo('nov', 'cliente', new Date(Date.now() + 1000).toISOString());
await novo('vend', 'vendedor', new Date(Date.now() + 1000).toISOString());
await q(`update user_profiles set parent_dealer_user_id=$1 where user_id=$2`, [U.dealer, U.vend]);

let fails = 0; const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fails++; };
const as = async (k, fn) => { await ex(`select set_config('test.uid','${U[k] || ''}',false); set role authenticated;`); try { return await fn(); } finally { await ex(`reset role; select set_config('test.uid','',false);`); } };
const falha = async (k, s, p) => { try { await as(k, () => q(s, p)); return ''; } catch (e) { return e.message; } };
const ob = async (k) => (await as(k, () => q(`select my_onboarding() j`)))[0].j;

ok(!(await falha('admin', `select admin_set_onboarding_example($1, 'Example kitchen')`, [modelo])), 'admin escolhe o projeto modelo');
ok(/fábrica/.test(await falha('velho', `select admin_set_onboarding_example($1)`, [modelo])), 'outro login não escolhe o modelo');

let j = await ob('admin');
ok(!j.needed && !j.example_needed && !j.video_needed, 'admin não vê tela, nem exemplo, nem vídeo');
j = await ob('vend');
ok(!j.needed, 'vendedor criado pelo dealer não vê a tela');

j = await ob('velho');
ok(j.needed, 'login antigo sem dados vê a tela de cadastro');
ok(!j.example_needed && !j.video_needed && !j.new_user, 'login antigo NÃO ganha exemplo nem vídeo');
ok(j.known.name === 'Nome velho' && j.known.phone === '3525550000', 'pré-preenche nome e telefone do cadastro do site');
j = await ob('velhoSemPerfil');
ok(j.needed && !j.example_needed, 'login antigo sem perfil: ganha perfil, vê a tela, sem exemplo');

j = await ob('nov');
ok(j.needed && j.example_needed && j.video_needed && j.new_user, 'usuário NOVO: tela + exemplo + vídeo');

ok(/phone_required/.test(await falha('nov', `select my_onboarding_submit('Ana','12','ACME','1 Main','','Orlando','FL','32801')`)), 'telefone curto recusado');
ok(/company_required/.test(await falha('nov', `select my_onboarding_submit('Ana','3525551234','','1 Main','','Orlando','FL','32801')`)), 'empresa vazia recusada');
ok(/address_required/.test(await falha('nov', `select my_onboarding_submit('Ana','3525551234','ACME','','','Orlando','FL','32801')`)), 'endereço vazio recusado');
await as('nov', () => q(`select my_onboarding_submit('Ana Souza','(352) 555-1234','ACME Builders','1 Main St','Suite 2','Orlando','fl','32801')`));
const pr = (await q(`select * from person_records where user_id=$1`, [U.nov]))[0];
ok(pr && pr.company_name === 'ACME Builders' && pr.state === 'FL' && pr.line2 === 'Suite 2', 'gravou empresa/endereço no cadastro da pessoa');
ok((await q(`select full_name from user_profiles where user_id=$1`, [U.nov]))[0].full_name === 'Ana Souza', 'gravou o nome no perfil');
j = await ob('nov');
ok(!j.needed && j.example_needed, 'depois de salvar a tela some; exemplo ainda pendente');

let r = (await as('nov', () => q(`select my_onboarding_copy_example() j`)))[0].j;
ok(r.ok && r.project_id, 'exemplo copiado pra conta do novo');
const cp = (await q(`select * from user_projects where id=$1`, [r.project_id]))[0];
ok(cp.client_user_id === U.nov && cp.name === 'Example kitchen' && cp.client_folder === 'Example' && JSON.stringify(cp.slots) === '[{"a":1}]', 'cópia com dono/nome/pasta certos e mesmos módulos');
ok((await q(`select count(*)::int n from project_photoreal_photos where project_id=$1`, [r.project_id]))[0].n === 1, 'imagens do modelo foram junto');
r = (await as('nov', () => q(`select my_onboarding_copy_example() j`)))[0].j;
ok(r.already, 'não copia 2 vezes');
ok((await q(`select count(*)::int n from user_projects where client_user_id=$1`, [U.nov]))[0].n === 1, 'só 1 projeto de exemplo');
r = (await as('velho', () => q(`select my_onboarding_copy_example() j`)))[0].j;
ok(!r.ok && r.reason === 'not_new', 'login antigo chamando a cópia na mão: recusado');

await as('nov', () => q(`update user_profiles set onboarding_done_at=null, onboarding_example_at=null where user_id=$1`, [U.nov]));
ok((await q(`select onboarding_done_at is not null d from user_profiles where user_id=$1`, [U.nov]))[0].d, 'a pessoa não apaga as marcas na mão');
await as('nov', () => q(`select my_onboarding_video_seen()`));
ok(!(await ob('nov')).video_needed, 'vídeo marcado como visto');

await as('velho', () => q(`select my_onboarding_submit('Joe','3525559999','','9 Oak','','Tampa','FL','33601', true)`));
ok((await q(`select company_name from person_records where user_id=$1`, [U.velho]))[0].company_name === 'Homeowner', 'homeowner sem empresa vira "Homeowner"');
ok((await q(`select member_kind from user_profiles where user_id=$1`, [U.velho]))[0].member_kind === 'homeowner', 'e o tipo vira homeowner');
console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO CERTO'); process.exit(fails ? 1 : 0);
