import { PGlite } from '@electric-sql/pglite';
// Bancada da migration 332 (aceite dos Termos e Condições do Pedido). PGlite.
// Rodar (terminal, nesta pasta): node teste-aceite-termos.mjs   — precisa de `npm i @electric-sql/pglite` aqui, uma vez.
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const R = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..'); const DB = path.join(R, 'database');
const db = new PGlite(); const ex = (s) => db.exec(s); const q = async (s, p) => (await db.query(s, p)).rows;
await ex(fs.readFileSync(path.join(R, 'scripts/tests/empresas/stubs.sql'), 'utf8'));
await ex(`alter table public.orders add column if not exists factory_number bigint, add column if not exists terms_accepted_at timestamptz, add column if not exists terms_accepted_by uuid, add column if not exists terms_version text;
create policy "admin update orders" on public.orders for update using (is_admin()) with check (is_admin());
create policy "admin delete orders" on public.orders for delete using (is_admin());`);
await ex(fs.readFileSync(path.join(DB, 'migration_306_empresas_arvore_base.sql'), 'utf8'));
const sql = fs.readFileSync(path.join(DB, 'migration_332_aceite_dos_termos_do_pedido.sql'), 'utf8');
await ex(sql); await ex(sql);
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fails++; };
const U = {};
for (const [k, role] of [['admin', 'administrador'], ['dA', 'lojista'], ['dX', 'lojista']]) {
  U[k] = (await q(`insert into auth.users(email) values ($1) returning id`, [k + '@t.com']))[0].id;
  await q(`insert into user_profiles(user_id,email,role) values ($1,$2,$3)`, [U[k], k + '@t.com', role]);
}
await q(`insert into admin_users values ($1)`, [U.admin]);
const as = async (k, fn) => { await ex(`select set_config('test.uid','${U[k] || ''}',false); set role authenticated;`); try { return await fn(); } finally { await ex(`reset role; select set_config('test.uid','',false);`); } };
const falha = async (k, s, p) => { try { await as(k, () => q(s, p)); return ''; } catch (e) { return e.message; } };
const T = 'Order Terms and Conditions — v1\n\n' + 'x'.repeat(400);
const o1 = (await q(`insert into orders(client_user_id,status,po_name) values ($1,'submitted','KITCHEN') returning id`, [U.dA]))[0].id;
const o2 = (await q(`insert into orders(client_user_id,status,po_name) values ($1,'submitted','BATH') returning id`, [U.dA]))[0].id;
ok(/nome completo/.test(await falha('dA', `select order_accept_terms($1::uuid[], 'v1', 'en', $2, 'a')`, [[o1], T])), 'sem nome não aceita');
ok(/inválido/.test(await falha('dA', `select order_accept_terms($1::uuid[], 'v1', 'en', 'curto', 'Joao Silva')`, [[o1]])), 'texto curto/vazio recusado');
ok(/Sem acesso/.test(await falha('dX', `select order_accept_terms($1::uuid[], 'v1', 'en', $2, 'Outro Dealer')`, [[o1], T])), 'outro dealer não aceita por pedido alheio');
await as('dA', () => q(`select order_accept_terms($1::uuid[], 'v1', 'en', $2, '  Joao Silva ')`, [[o1, o2], T]));
let r = await q(`select * from order_terms_acceptances order by po_name`);
ok(r.length === 2 && r[0].signed_name === 'Joao Silva' && r[0].accepted_email === 'dA@t.com' && r[0].on_behalf === false && r[0].terms_text === T && /^[0-9a-f]{64}$/.test(r[0].terms_sha256), '2 registros: nome, e-mail, texto inteiro e SHA-256');
ok((await q(`select terms_version, terms_accepted_by from orders where id=$1`, [o1]))[0].terms_version === 'v1', 'pedido carimbado com a versão');
await as('admin', () => q(`select order_accept_terms($1::uuid[], 'v1', 'pt', $2, 'Fabrica Admin')`, [[o1], T]));
r = await q(`select * from order_terms_acceptances where signed_name = 'Fabrica Admin'`);
ok(r.length === 1 && r[0].on_behalf === true, 'fábrica aceitando por pedido do cliente = marcado como "em nome de"');
ok(/não pode ser alterado/.test(await falha('admin', `update order_terms_acceptances set signed_name = 'X'`)) || (await q(`select count(*) c from order_terms_acceptances where signed_name='X'`))[0].c == 0, 'ninguém altera o registro (nem admin)');
let erro = ''; try { await ex(`update order_terms_acceptances set signed_name = 'X'`); } catch (e) { erro = e.message; }
ok(/não pode ser alterado/.test(erro), 'nem direto no banco altera');
erro = ''; try { await ex(`delete from order_terms_acceptances`); } catch (e) { erro = e.message; }
ok(/não pode ser apagado/.test(erro), 'nem direto no banco apaga');
ok((await as('dX', () => q(`select count(*) c from order_terms_acceptances`)))[0].c == 0, 'outro dealer não lê os registros');
ok((await as('dA', () => q(`select count(*) c from order_terms_acceptances`)))[0].c == 3, 'o dono lê os dele (inclusive o feito pela fábrica)');
await as('admin', () => q(`delete from orders where id = $1`, [o2]));
r = await q(`select * from order_terms_acceptances where po_name = 'BATH'`);
ok(r.length === 1 && r[0].order_id === null && r[0].signed_name === 'Joao Silva', 'pedido excluído: o registro FICA (sem o vínculo, com PO e nome)');
console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO CERTO'); process.exit(fails ? 1 : 0);
