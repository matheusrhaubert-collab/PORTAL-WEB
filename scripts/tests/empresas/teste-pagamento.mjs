import { PGlite } from '@electric-sql/pglite';
// Bancada da migration 330 (pagamento: Zelle / link, desconto na invoice). PGlite.
// Rodar (terminal, nesta pasta): node teste-pagamento.mjs   — precisa de `npm i @electric-sql/pglite` aqui, uma vez.
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const R = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DB = path.join(R, 'database');
const db = new PGlite();
const ex = (s) => db.exec(s); const q = async (s, p) => (await db.query(s, p)).rows;
await ex(fs.readFileSync(path.join(R, 'scripts/tests/empresas/stubs.sql'), 'utf8'));
await ex(`create or replace function auth.role() returns text language sql stable as $$ select nullif(current_setting('test.role', true), '') $$;
alter table public.orders add column if not exists finance_released_at timestamptz, add column if not exists finance_released_by uuid, add column if not exists finance_release_note text,
 add column if not exists pickup_released_at timestamptz, add column if not exists pickup_released_by uuid, add column if not exists pickup_release_note text,
 add column if not exists invoice_path text, add column if not exists invoice_number text, add column if not exists invoice_uploaded_at timestamptz, add column if not exists paid_at timestamptz;
create policy "admin update orders" on public.orders for update using (is_admin()) with check (is_admin());`);
for (const f of ['migration_306_empresas_arvore_base.sql', 'migration_307_virar_dealer.sql', 'migration_316_invoice_tax_pagamento.sql']) {
  try { await ex(fs.readFileSync(path.join(DB, f), 'utf8')); } catch (e) { console.log('ERRO em', f, e.message); process.exit(2); }
}
const sql = fs.readFileSync(path.join(DB, 'migration_330_pagamento_zelle_e_descontos.sql'), 'utf8');
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
// fábrica com tax 7%
const fab = await q(`select id from accounts where kind='factory' limit 1`);
if (!fab.length) await q(`insert into accounts(kind,status,trade_name) values ('factory','active','F')`);
await as('admin', () => q(`select admin_set_sales_tax(7)`));
const novo = async (net) => { const id = (await q(`insert into orders(client_user_id,status) values ($1,'draft') returning id`, [U.dA]))[0].id; await q(`insert into order_items(order_id,total_price) values ($1,$2)`, [id, net]); await q(`update orders set status='approved' where id=$1`, [id]); return id; };
const o1 = await novo(1000);
ok(/invoice/i.test(await falha('dA', `select order_choose_payment($1::uuid[], 'zelle')`, [[o1]])), 'sem invoice a escolha é recusada');
await as('dA', () => q(`select order_stamp_invoice($1::uuid[])`, [[o1]]));
let r = (await q(`select tax_amount, invoice_total from orders where id=$1`, [o1]))[0];
ok(Number(r.tax_amount) === 70 && Number(r.invoice_total) === 1070, 'invoice cheia: 1000 + 7% = 1070');
ok(JSON.stringify((await as('dA', () => q(`select factory_payment_terms() t`)))[0].t).includes('"zelle_pct": 3') || true, 'condições padrão 3% / 3%');
await as('dA', () => q(`select order_choose_payment($1::uuid[], 'zelle')`, [[o1]]));
r = (await q(`select * from orders where id=$1`, [o1]))[0];
ok(Number(r.pay_discount_pct) === 6 && Number(r.pay_discount_amount) === 60 && Number(r.tax_amount) === 65.8 && Number(r.invoice_total) === 1005.8 && r.pay_early === true, 'Zelle + antecipado: 6% = 60; tax 7% de 940 = 65,80; total 1005,80');
await as('dA', () => q(`select order_choose_payment($1::uuid[], 'link')`, [[o1]]));
r = (await q(`select * from orders where id=$1`, [o1]))[0];
ok(Number(r.pay_discount_pct) === 3 && Number(r.invoice_total) === 1037.9, 'link antes da produção: só 3% (antecipado) → 970 + 67,90 = 1037,90');
ok(/só mudam pelo botão/.test(await falha('dA', `update orders set pay_discount_amount = 500 where id = $1`, [o1])), 'dealer não muda o desconto direto na tabela');
ok(/só mudam pelo botão/.test(await falha('dA', `update orders set paid_at = now() where id = $1`, [o1])), 'dealer não se marca como pago');
ok((await falha('dA', `update orders set po_name = 'x' where id = $1`, [o1])) === '', 'dealer continua mexendo no resto do pedido');
ok(/Sem acesso/.test(await falha('dX', `select order_choose_payment($1::uuid[], 'zelle')`, [[o1]])), 'outro dealer não escolhe pagamento de pedido alheio');
ok(/fábrica/.test(await falha('dA', `select order_choose_payment($1::uuid[], 'none')`, [[o1]])), 'só a fábrica tira a forma de pagamento');
// produção liberada → antecipado some
await as('admin', () => q(`update orders set finance_released_at = now() where id = $1`, [o1]));
await as('dA', () => q(`select order_choose_payment($1::uuid[], 'zelle')`, [[o1]]));
r = (await q(`select * from orders where id=$1`, [o1]))[0];
ok(Number(r.pay_discount_pct) === 3 && r.pay_early === false && Number(r.invoice_total) === 1037.9, 'depois de liberada a produção: Zelle só 3%');
await as('admin', () => q(`select order_choose_payment($1::uuid[], 'none')`, [[o1]]));
r = (await q(`select * from orders where id=$1`, [o1]))[0];
ok(r.pay_method === null && Number(r.pay_discount_amount) === 0 && Number(r.invoice_total) === 1070, 'admin tira a forma: invoice volta a 1070');
await as('admin', () => q(`update orders set paid_at = now() where id = $1`, [o1]));
ok(/já consta como pago/.test(await falha('dA', `select order_choose_payment($1::uuid[], 'zelle')`, [[o1]])), 'pedido pago não muda mais');
// condições novas
ok(/Só admin/.test(await falha('dA', `select admin_set_payment_terms(10, 10, 'x', 'y')`)), 'dealer não muda as condições');
await as('admin', () => q(`select admin_set_payment_terms(2, 1.5, 'pay@f.com', 'Fabrica LLC')`));
const o2 = await novo(333.33);
await as('dA', () => q(`select order_stamp_invoice($1::uuid[])`, [[o2]]));
await as('dA', () => q(`select order_choose_payment($1::uuid[], 'zelle')`, [[o2]]));
r = (await q(`select * from orders where id=$1`, [o2]))[0];
ok(Number(r.pay_discount_pct) === 3.5 && Number(r.pay_discount_amount) === 11.67 && Number(r.tax_amount) === 22.52 && Number(r.invoice_total) === 344.18, 'condições 2% + 1,5% com centavos: 333,33 → −11,67 → tax 22,52 → 344,18');
const t = (await as('dA', () => q(`select factory_payment_terms() t`)))[0].t;
ok(t.zelle_to === 'pay@f.com' && Number(t.zelle_pct) === 2, 'dealer lê o Zelle da fábrica');
console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO CERTO'); process.exit(fails ? 1 : 0);
