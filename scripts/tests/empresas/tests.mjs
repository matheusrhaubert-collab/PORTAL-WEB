export default async function ({ q, ex, as, ok, U, fails_ }) {
  // ---- migração
  let r = await q(`select kind, status, trade_name, factory_discount_pct from accounts order by kind, trade_name`);
  ok(r.length === 3 && r.filter(x => x.kind === 'factory').length === 1, 'fábrica + 2 lojas criadas: ' + r.length);
  const accA = (await q(`select account_id from account_members where user_id=$1`, [U.dA]))[0].account_id;
  const accB = (await q(`select account_id from account_members where user_id=$1`, [U.dB]))[0].account_id;
  ok(Number((await q(`select factory_discount_pct d from accounts where id=$1`, [accA]))[0].d) === 12, 'desconto atual copiado (12)');
  r = await q(`select role, account_id from account_members where user_id=$1`, [U.sA1]);
  ok(r[0] && r[0].role === 'seller' && r[0].account_id === accA, 'vendedor virou membro da loja A');
  ok((await q(`select account_id from orders where client_user_id=$1`, [U.dA]))[0].account_id === accA, 'pedido antigo ganhou a empresa');
  // ---- visibilidade
  const oS = (await as('sA1', () => q(`insert into orders(client_user_id,status) values ($1,'draft') returning id, account_id`, [U.sA1])))[0];
  ok(oS.account_id === accA, 'pedido novo do vendedor nasce com a empresa');
  await as('sA1', () => q(`insert into order_items(order_id,total_price) values ($1, 1000),($1, 500)`, [oS.id]));
  ok((await as('dA', () => q(`select id from orders where id=$1`, [oS.id]))).length === 1, 'dono A vê pedido do vendedor A');
  ok((await as('dA', () => q(`select id from order_items where order_id=$1`, [oS.id]))).length === 2, 'dono A vê itens do vendedor A');
  ok((await as('dB', () => q(`select id from orders where id=$1`, [oS.id]))).length === 0, 'dono B NÃO vê pedido da loja A');
  ok((await as('sA1', () => q(`select id from orders where client_user_id=$1`, [U.dA]))).length === 0, 'vendedor NÃO vê pedido do dono');
  ok((await as('admin', () => q(`select id from orders`))).length >= 2, 'admin vê tudo');
  ok((await as('sA1', () => q(`select id from accounts`))).length === 0, 'vendedor não lê a linha da empresa (desconto)');
  ok((await as('sA1', () => q(`select my_account_card() c`)))[0].c.trade_name === 'Loja A', 'vendedor lê o cartão da empresa');
  ok((await as('dA', () => q(`select id from accounts`))).length === 1, 'dono A lê só a própria empresa');
  ok((await as('dA', () => q(`select * from account_tree()`))).length === 1, 'árvore do dono A = 1');
  ok((await as('admin', () => q(`select * from account_tree()`))).length === 3, 'árvore do admin = 3');
  // ---- travas
  ok(/fábrica/.test(await fails_('dA', `update accounts set factory_discount_pct=50 where id=$1`, [accA])), 'dono não muda o desconto na empresa');
  ok(/fábrica/.test(await fails_('dA', `update accounts set status='suspended' where id=$1`, [accA])), 'dono não muda status');
  await as('dA', () => q(`update accounts set legal_name='Loja A LLC', phone='111' where id=$1`, [accA]));
  ok((await q(`select store_phone from user_profiles where user_id=$1`, [U.dA]))[0].store_phone === '111', 'empresa -> perfil (telefone)');
  // tela antiga: dealer mexe no próprio desconto (ainda permitido até a 308) -> empresa acompanha
  await as('dA', () => q(`update user_profiles set factory_discount_pct=15, store_name='Loja A2' where user_id=$1`, [U.dA]));
  r = (await q(`select factory_discount_pct d, trade_name from accounts where id=$1`, [accA]))[0];
  ok(Number(r.d) === 15 && r.trade_name === 'Loja A2', 'perfil -> empresa (desconto 15, nome)');
  await as('admin', () => q(`update accounts set factory_discount_pct=20 where id=$1`, [accA]));
  ok(Number((await q(`select factory_discount_pct d from user_profiles where user_id=$1`, [U.dA]))[0].d) === 20, 'admin muda desconto -> perfil 20');
  ok((await q(`select count(*)::int n from account_events where account_id=$1 and kind='discount'`, [accA]))[0].n === 2, 'histórico do desconto: 2');
  ok(/próprio acesso/.test(await fails_('dA', `update account_members set role='seller' where user_id=$1`, [U.dA])), 'dono não mexe na própria linha');
  await as('dA', () => q(`update account_members set permissions='{"see_team_orders":true}' where user_id=$1`, [U.sA1]));
  ok((await as('sA1', () => q(`select id from orders where client_user_id=$1`, [U.dA]))).length === 1, 'vendedor com caixinha vê pedidos da equipe');
  ok(!!(await fails_('sA1', `update account_members set role='manager' where user_id=$1`, [U.sA1])) || (await q(`select role from account_members where user_id=$1`,[U.sA1]))[0].role === 'seller', 'vendedor não se promove');
  // ---- foto do preço
  await as('sA1', () => q(`update orders set status='approved', price_discount_pct=99 where id=$1`, [oS.id]));
  r = (await q(`select price_list_total l, price_discount_pct d, price_net_total n from orders where id=$1`, [oS.id]))[0];
  ok(Number(r.l) === 1500 && Number(r.d) === 20 && Number(r.n) === 1200, `foto do preço 1500 / 20% / 1200 (veio ${r.l}/${r.d}/${r.n})`);
  // ---- virar dealer
  if ((await q(`select 1 from pg_proc where proname='dealer_application_start'`)).length) {
    const accC = (await as('cli', () => q(`select dealer_application_start() id`)))[0].id;
    ok(!!accC, 'rascunho criado');
    ok((await as('cli', () => q(`select dealer_application_start() id`)))[0].id === accC, 'start 2x = mesma empresa');
    r = (await as('cli', () => q(`select dealer_application_submit() r`)))[0].r;
    ok(r.ok === false && r.missing.includes('agreement') && r.missing.includes('ein'), 'submit incompleto lista o que falta');
    await as('cli', () => q(`update accounts set legal_name='Cli LLC', ein='12-3456789', contact_name='C', phone='1', billing_line1='1 St', billing_city='Ocala', billing_state='FL', billing_zip='34470',
      questionnaire='{"business_type":"showroom","years_in_business":"3-5","annual_revenue":"500k-1m","european_brands":"no"}' where id=$1`, [accC]));
    await as('cli', () => q(`select dealer_agreement_accept('v1-2026-11','Cli Owner')`));
    r = (await as('cli', () => q(`select dealer_application_submit() r`)))[0].r;
    ok(r.ok === true && r.status === 'pending', 'enviado -> pending');
    ok((await q(`select role from user_profiles where user_id=$1`, [U.cli]))[0].role === 'cliente', 'continua cliente até aprovar');
    ok(/Só a fábrica/.test(await fails_('cli', `select admin_review_dealer($1,'approve')`, [accC])), 'cliente não se aprova');
    // documento
    const doc = (await as('cli', () => q(`insert into account_documents(account_id,kind,name,storage_path,status,valid_until) values ($1,'tax_exempt','cert.pdf',$2,'valid','2099-01-01') returning id,status,valid_until`, [accC, accC + '/cert.pdf'])))[0];
    ok(doc.status === 'pending' && doc.valid_until === null, 'upload do cliente entra pending, sem validade');
    ok((await q(`select tax_exempt_status s from accounts where id=$1`, [accC]))[0].s === 'pending', 'empresa fica tax pending');
    ok((await as('dA', () => q(`select id from account_documents`))).length === 0, 'outra loja não lê documentos');
    ok(!!(await fails_('dA', `insert into account_documents(account_id,kind,name,storage_path) values ($1,'other','x','x')`, [accC])), 'outra loja não sobe documento alheio');
    await as('admin', () => q(`select admin_review_dealer($1,'approve',18,null,'dealer','ok')`, [accC]));
    r = (await q(`select role, factory_discount_pct d, store_name from user_profiles where user_id=$1`, [U.cli]))[0];
    ok(r.role === 'lojista' && Number(r.d) === 18 && r.store_name === 'Cli LLC', 'aprovado: lojista, desconto 18, nome da loja');
    await as('admin', () => q(`select admin_set_tax_exempt($1,true,(current_date+30),'FL','85-1','ok')`, [doc.id]));
    ok((await q(`select account_tax_exempt_ok($1) v`, [accC]))[0].v === true, 'tax exempt válido');
    await q(`update accounts set tax_exempt_valid_until = current_date - 1 where id=$1`, [accC]);
    ok((await q(`select account_tax_exempt_ok($1) v`, [accC]))[0].v === false, 'venceu -> não isento na hora');
    await q(`update account_documents set valid_until = current_date - 1 where id=$1`, [doc.id]);
    await as('admin', () => q(`select accounts_tax_exempt_sweep()`));
    ok((await q(`select tax_exempt_status s from accounts where id=$1`, [accC]))[0].s === 'expired', 'sweep marca expired');
    // distribuidor acima da loja C
    const accD = (await as('dist', () => q(`select dealer_application_start() id`)))[0].id;
    await as('admin', () => q(`select admin_review_dealer($1,'approve',25,null,'distributor',null)`, [accD]));
    await as('admin', () => q(`update accounts set parent_account_id=$1 where id=$2`, [accD, accC]));
    const oC = (await as('cli', () => q(`insert into orders(client_user_id,status) values ($1,'submitted') returning id`, [U.cli])))[0];
    ok((await as('dist', () => q(`select id from orders where id=$1`, [oC.id]))).length === 1, 'distribuidor vê pedido do lojista dele');
    ok((await as('dist', () => q(`select id from orders where client_user_id=$1`, [U.dA]))).length === 0, 'distribuidor NÃO vê loja de fora');
    r = await as('dist', () => q(`select kind, factory_discount_pct d from account_tree() order by kind`));
    ok(r.length === 2 && r.find(x => x.kind === 'dealer').d === null, 'árvore do distribuidor = ele + loja, sem o desconto da loja');
    ok(/abaixo dela mesma/.test(await fails_('admin', `update accounts set parent_account_id=$1 where id=$2`, [accC, accD])), 'ciclo na árvore é barrado');
    ok((await as('dist', () => q(`select id from account_documents`))).length === 0, 'distribuidor não lê documentos da loja');
  }
}
export async function etapa2({ q, ex, as, ok, U, fails_ }) {
  if (!(await q(`select 1 from pg_proc where proname='request_discount'`)).length) return;
  const accA = (await q(`select account_id from account_members where user_id=$1`, [U.dA]))[0].account_id;
  ok(/dono ou gerente/.test(await fails_('sA1', `select request_discount(30,'x')`)), 'vendedor não pede desconto');
  const r1 = (await as('dA', () => q(`select request_discount(30,'volume') id`)))[0].id;
  const r2 = (await as('dA', () => q(`select request_discount(28,'volume maior') id`)))[0].id;
  ok((await q(`select status from account_discount_requests where id=$1`, [r1]))[0].status === 'cancelled', 'pedido novo cancela o anterior');
  ok((await as('dB', () => q(`select id from account_discount_requests`))).length === 0, 'loja B não lê pedido da A');
  ok(/Só a fábrica/.test(await fails_('dA', `select admin_decide_discount_request($1,true,28,null)`, [r2])), 'dealer não aprova o próprio pedido');
  await as('admin', () => q(`select admin_decide_discount_request($1,true,25,'ok 25')`, [r2]));
  ok(Number((await q(`select factory_discount_pct d from accounts where id=$1`, [accA]))[0].d) === 25, 'aprovado com 25 -> empresa 25');
  ok(Number((await q(`select factory_discount_pct d from user_profiles where user_id=$1`, [U.dA]))[0].d) === 25, 'perfil do dono acompanha (25)');
  let t = await as('dA', () => q(`select email, role from account_team()`));
  ok(t.length === 2 && t.some(x => x.email === 'sA1@t.com' && x.role === 'seller'), 'equipe do dono A: 2 (com e-mail)');
  t = await as('sA1', () => q(`select email from account_team()`));
  ok(t.length === 1, 'vendedor só vê a própria linha na equipe');
  // permissões
  const o = (await as('sA1', () => q(`insert into orders(client_user_id,status) values ($1,'draft') returning id`, [U.sA1])))[0].id;
  await as('dA', () => q(`update account_members set permissions='{"approve_orders":false}' where user_id=$1`, [U.sA1]));
  await as('sA1', () => q(`update orders set status='submitted' where id=$1`, [o]));
  ok(/aprovar pedidos/.test(await fails_('sA1', `update orders set status='approved' where id=$1`, [o])), 'vendedor sem "aprovar" não aprova');
  await as('dA', () => q(`update orders set status='approved' where id=$1`, [o])).catch(() => {});
  await as('dA', () => q(`update account_members set permissions='{"send_orders":false}' where user_id=$1`, [U.sA1]));
  ok(/enviar pedidos/.test(await fails_('sA1', `insert into orders(client_user_id,status) values ($1,'submitted')`, [U.sA1])), 'vendedor sem "enviar" não envia');
  ok((await as('sA1', () => q(`insert into orders(client_user_id,status) values ($1,'draft') returning id`, [U.sA1]))).length === 1, 'rascunho continua livre');
  ok((await as('dA', () => q(`insert into orders(client_user_id,status) values ($1,'submitted') returning id`, [U.dA]))).length === 1, 'dono envia normal');
  // trava (309)
  if ((await q(`select 1 from pg_trigger where tgname='trg_trava_desconto_fabrica'`)).length) {
    ok(/definido pela Legno/.test(await fails_('dA', `update user_profiles set factory_discount_pct=60 where user_id=$1`, [U.dA])), '309: dealer não muda mais o próprio desconto');
    await as('dA', () => q(`update user_profiles set store_name='Loja A3', resale_margin_pct=40 where user_id=$1`, [U.dA]));
    ok((await q(`select trade_name from accounts where id=$1`, [accA]))[0].trade_name === 'Loja A3', '309: o resto do perfil continua editável');
    await as('admin', () => q(`update accounts set factory_discount_pct=22 where id=$1`, [accA]));
    ok(Number((await q(`select factory_discount_pct d from user_profiles where user_id=$1`, [U.dA]))[0].d) === 22, '309: fábrica muda -> perfil 22');
    const rr = (await as('dA', () => q(`select request_discount(27,'x') id`)))[0].id;
    await as('admin', () => q(`select admin_decide_discount_request($1,true,null,null)`, [rr]));
    ok(Number((await q(`select factory_discount_pct d from user_profiles where user_id=$1`, [U.dA]))[0].d) === 27, '309: pedido aprovado -> perfil 27');
  }
}
