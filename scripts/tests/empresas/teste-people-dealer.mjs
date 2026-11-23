// Bancada da migration 341 (aba People pro dealer: só dele pra baixo). PGlite.
// Rodar (terminal, nesta pasta): node teste-people-dealer.mjs
import path from 'path';
import { fileURLToPath } from 'url';
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const DB = path.join(AQUI, '..', '..', '..', 'database');
const db = new PGlite();
const ex = (s) => db.exec(s); const q = async (s, p) => (await db.query(s, p)).rows;
await ex(fs.readFileSync(path.join(AQUI, 'stubs.sql'), 'utf8'));
await ex(`alter table public.orders add column source_project_id uuid; alter table public.user_projects add column updated_at timestamptz default now();
          alter table auth.users add column if not exists banned_until timestamptz; alter table auth.users add column if not exists created_at timestamptz default now();
          alter table public.user_profiles add column if not exists last_active_at timestamptz; alter table public.user_profiles add column if not exists seller_active boolean default true;
          alter table public.user_profiles add column if not exists created_at timestamptz default now();`);
const U = {};
for (const [k, role] of [['admin', 'administrador'], ['dA', 'lojista'], ['sA1', 'vendedor'], ['sA2', 'vendedor'], ['dB', 'lojista'], ['sB1', 'vendedor'], ['cli', 'cliente']]) {
  U[k] = (await q(`insert into auth.users(email) values ($1) returning id`, [k + '@t.com']))[0].id;
  await q(`insert into user_profiles(user_id,email,role) values ($1,$2,$3)`, [U[k], k + '@t.com', role]);
}
await q(`insert into admin_users values ($1)`, [U.admin]);
await q(`update user_profiles set store_name='Loja A' where user_id=$1`, [U.dA]);
await q(`update user_profiles set store_name='Loja B' where user_id=$1`, [U.dB]);
await q(`update user_profiles set parent_dealer_user_id=$1 where user_id in ($2,$3)`, [U.dA, U.sA1, U.sA2]);
await q(`update user_profiles set parent_dealer_user_id=$1 where user_id=$2`, [U.dB, U.sB1]);
for (const f of ['migration_306_empresas_arvore_base.sql', 'migration_307_virar_dealer.sql', 'migration_308_equipe_e_pedido_de_desconto.sql', 'migration_310_projeto_com_loja.sql', 'migration_341_people_do_dealer.sql'])
  await ex(fs.readFileSync(path.join(DB, f), 'utf8'));
await ex(fs.readFileSync(path.join(DB, 'migration_341_people_do_dealer.sql'), 'utf8'));
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fails++; };
const as = async (k, fn) => { await ex(`select set_config('test.uid','${U[k] || ''}',false); set role authenticated;`); try { return await fn(); } finally { await ex(`reset role; select set_config('test.uid','',false);`); } };
const nomes = async (k) => (await as(k, () => q(`select email from my_people() order by email`))).map((r) => r.email.split('@')[0]).join(',');
ok(await nomes('dA') === 'dA,sA1,sA2', 'dealer A vê ele e os 2 vendedores dele (' + await nomes('dA') + ')');
ok(await nomes('dB') === 'dB,sB1', 'dealer B vê só a loja dele');
ok(await nomes('sA1') === 'sA1', 'vendedor vê só ele mesmo');
ok(await nomes('cli') === 'cli', 'cliente sem loja vê só ele mesmo');
const rows = await as('dA', () => q(`select * from my_people()`));
ok(rows.every((r) => r.is_admin === false) && !rows.some((r) => /admin/.test(r.email)), 'fábrica/admin nunca aparece pro dealer');
const dono = rows.find((r) => /^dA/.test(r.email));
ok(dono && dono.member_role === 'owner' && dono.account_id, 'o dealer vem como dono da loja (com account_id)');
// vendedor sem linha em account_members ainda aparece pelo parent_dealer_user_id
await q(`delete from account_members where user_id=$1`, [U.sA2]);
ok((await nomes('dA')).split(',').includes('sA2'), 'vendedor antigo sem account_members ainda aparece (parent_dealer_user_id)');
try { await as('', () => q(`select * from my_people()`)); ok(false, 'sem login recusa'); } catch (e) { ok(/login/i.test(e.message), 'sem login recusa'); }
console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO CERTO'); process.exit(fails ? 1 : 0);
