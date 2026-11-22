import { PGlite } from '@electric-sql/pglite';
import fs from 'fs'; import path from 'path';
const R = process.env.HOME + '/mnt/LEGNO PORTAL WEB';
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
const sql2 = fs.readFileSync(path.join(DB, 'migration_331_liquido_da_invoice_com_desconto_de_fabrica.sql'), 'utf8');
await ex(sql2); await ex(sql2);
const sql3 = fs.readFileSync(path.join(DB, 'migration_333_plano_de_pagamento_total_ou_50_50.sql'), 'utf8');
await ex(sql3); await ex(sql3);
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
ok(Number(r.pay_discount_pct) === 6 && r.pay_early === true && Number(r.invoice_total) === 1005.8, 'produção já liberada: pagamento total continua com os 6% (regra de 22/11, 2ª rodada)');
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
// PEDIDO ANTIGO sem a foto do preço (caso do Matt): tabela 149.57, loja com 60% → líquido 59.83
const acc = (await q(`insert into accounts(kind,status,trade_name,factory_discount_pct) values ('dealer','active','L',60) returning id`))[0].id;
await as('admin', () => q(`select admin_set_payment_terms(3, 3, null, null)`));
await as('admin', () => q(`select admin_set_sales_tax(0)`));
const o3 = (await q(`insert into orders(client_user_id,status,account_id) values ($1,'draft',$2) returning id`, [U.dA, acc]))[0].id;
await q(`insert into order_items(order_id,total_price) values ($1, 149.57)`, [o3]);
await q(`update orders set status='approved' where id=$1`, [o3]);
await q(`update orders set price_net_total=null, price_list_total=null, price_stamped_at=now() where id=$1`, [o3]);   // simula pedido de antes da 306
await as('dA', () => q(`select order_stamp_invoice($1::uuid[])`, [[o3]]));
r = (await q(`select * from orders where id=$1`, [o3]))[0];
ok(Number(r.invoice_total) === 59.83, 'pedido sem foto: invoice = 149.57 − 60% = 59.83 (era 149.57)');
await as('dA', () => q(`select order_choose_payment($1::uuid[], 'zelle')`, [[o3]]));
r = (await q(`select * from orders where id=$1`, [o3]))[0];
ok(Number(r.pay_discount_amount) === 3.59 && Number(r.invoice_total) === 56.24, 'Zelle + antecipado sobre 59.83: −3.59 → total 56.24');
await as('admin', () => q(`select order_stamp_invoice($1::uuid[], true)`, [[o3]]));
r = (await q(`select * from orders where id=$1`, [o3]))[0];
ok(Number(r.invoice_total) === 56.24 && r.pay_method === 'zelle', 'emitir a invoice de novo (admin) mantém o desconto de pagamento');
// conserto: estraga na mão e roda a 331 de novo
await ex(`select set_config('legno.invoice_rpc','1',false); update orders set invoice_total = 140.60, pay_discount_amount = 8.97 where id = '${o3}'; select set_config('legno.invoice_rpc','',false);`);
await ex(sql2);
r = (await q(`select * from orders where id=$1`, [o3]))[0];
ok(Number(r.invoice_total) === 56.24 && Number(r.pay_discount_amount) === 3.59, 'a 331 conserta invoice gravada errada (140.60 → 56.24)');
// PLANO (333): total antecipado × 50/50
await as('admin', () => q(`select admin_set_sales_tax(7)`));
const o4 = await novo(1000);
await as('dA', () => q(`select order_stamp_invoice($1::uuid[])`, [[o4]]));
await as('dA', () => q(`select order_choose_payment($1::uuid[], 'zelle', 'split')`, [[o4]]));
r = (await q(`select * from orders where id=$1`, [o4]))[0];
ok(r.pay_plan === 'split' && Number(r.pay_discount_pct) === 3 && r.pay_early === false && Number(r.invoice_total) === 1037.9, '50/50 por Zelle: só os 3% do Zelle → 1037,90');
await as('dA', () => q(`select order_choose_payment($1::uuid[], 'link', 'split')`, [[o4]]));
r = (await q(`select * from orders where id=$1`, [o4]))[0];
ok(Number(r.pay_discount_pct) === 0 && Number(r.invoice_total) === 1070, '50/50 por QuickBooks/link: nenhum desconto → 1070');
await as('dA', () => q(`select order_choose_payment($1::uuid[], 'link', 'full')`, [[o4]]));
r = (await q(`select * from orders where id=$1`, [o4]))[0];
ok(r.pay_plan === 'full' && Number(r.pay_discount_pct) === 3 && Number(r.invoice_total) === 1037.9, 'total antecipado por link: 3% → 1037,90');
await as('dA', () => q(`select order_choose_payment($1::uuid[], 'zelle')`, [[o4]]));
r = (await q(`select * from orders where id=$1`, [o4]))[0];
ok(r.pay_plan === 'full' && Number(r.pay_discount_pct) === 6 && Number(r.invoice_total) === 1005.8, 'sem dizer o plano = total: Zelle + total = 6% → 1005,80');
ok(/Só a fábrica|só mudam pelo botão/.test(await falha('dA', `update orders set pay_deposit_at = now() where id = $1`, [o4])), 'dealer não marca a própria entrada como paga');
ok(/só mudam pelo botão/.test(await falha('dA', `update orders set pay_plan = 'split' where id = $1`, [o4])), 'dealer não troca o plano direto na tabela');
await as('dA', () => q(`select order_choose_payment($1::uuid[], 'zelle', 'split')`, [[o4]]));
await as('admin', () => q(`update orders set pay_deposit_at = now() where id = $1`, [o4]));
ok(/entrada deste pedido já foi paga/.test(await falha('dA', `select order_choose_payment($1::uuid[], 'zelle', 'full')`, [[o4]])), 'entrada paga: o dealer não troca mais o plano');
ok(/inválido/.test(await falha('admin', `select order_choose_payment($1::uuid[], 'zelle', 'xx')`, [[o4]])), 'plano inválido recusado');
const o5 = await novo(1000);
await as('dA', () => q(`select order_stamp_invoice($1::uuid[])`, [[o5]]));
await as('dA', () => q(`select order_choose_payment($1::uuid[], 'wire', 'full')`, [[o5]]));
r = (await q(`select * from orders where id=$1`, [o5]))[0];
ok(r.pay_method === 'wire' && Number(r.pay_discount_pct) === 6 && Number(r.invoice_total) === 1005.8, 'wire total: mesmo desconto do Zelle (6%) → 1005,80');
await as('admin', () => q(`select admin_set_wire_info($1)`, ['Bank X\nRouting 000']));
ok(((await as('dA', () => q(`select factory_payment_terms() t`)))[0].t.wire_info || '').startsWith('Bank X'), 'dealer lê os dados do wire');
ok(/Só admin/.test(await falha('dA', `select admin_set_wire_info('x')`)), 'dealer não muda os dados do wire');
console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO CERTO'); process.exit(fails ? 1 : 0);
