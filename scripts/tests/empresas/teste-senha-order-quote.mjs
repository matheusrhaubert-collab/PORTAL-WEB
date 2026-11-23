// Bancada da migration 338 (senha do $ Order quote). PGlite. Rodar (terminal, nesta pasta): node teste-senha-order-quote.mjs
import path from 'path';
import { fileURLToPath } from 'url';
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const db = new PGlite();
const ex = (s) => db.exec(s); const q = async (s, p) => (await db.query(s, p)).rows;
await ex(fs.readFileSync(path.join(AQUI, 'stubs.sql'), 'utf8'));
const U = {};
for (const [k, role] of [['admin', 'administrador'], ['dA', 'lojista'], ['dB', 'lojista']]) {
  U[k] = (await q(`insert into auth.users(email) values ($1) returning id`, [k + '@t.com']))[0].id;
  await q(`insert into user_profiles(user_id,email,role) values ($1,$2,$3)`, [U[k], k + '@t.com', role]);
}
await q(`insert into admin_users values ($1)`, [U.admin]);
const sql = fs.readFileSync(path.join(AQUI, '..', '..', '..', 'database', 'migration_338_senha_do_order_quote.sql'), 'utf8');
await ex(sql); await ex(sql);
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fails++; };
const as = async (k, fn) => { await ex(`select set_config('test.uid','${U[k] || ''}',false); set role authenticated;`); try { return await fn(); } finally { await ex(`reset role; select set_config('test.uid','',false);`); } };
const falha = async (k, s, p) => { try { await as(k, () => q(s, p)); return ''; } catch (e) { return e.message; } };
const tem = async (k) => (await as(k, () => q(`select order_quote_pass_status() r`)))[0].r;
const bate = async (k, s) => (await as(k, () => q(`select order_quote_pass_check($1) r`, [s])))[0].r;
ok(await tem('dA') === false, 'começa sem senha');
ok(/pelo menos 4/.test(await falha('dA', `select order_quote_pass_set('abc')`)), 'senha curta recusada');
await as('dA', () => q(`select order_quote_pass_set('segredo1')`));
ok(await tem('dA') === true && await tem('dB') === false && await tem('admin') === false, 'cada usuário tem a sua (admin também precisa criar)');
ok(await bate('dA', 'segredo1') === true && await bate('dA', 'errada') === false, 'confere a certa, recusa a errada');
ok(await bate('dB', 'segredo1') === false, 'a senha de um não abre a do outro');
ok(/atual incorreta/.test(await falha('dA', `select order_quote_pass_set('nova1234')`)), 'trocar sem a senha atual é recusado');
await as('dA', () => q(`select order_quote_pass_set('nova1234', 'segredo1')`));
ok(await bate('dA', 'nova1234') === true && await bate('dA', 'segredo1') === false, 'trocar com a senha atual funciona');
ok(/permission denied/.test(await falha('dA', `select * from order_quote_locks`)), 'ninguém lê a tabela (nem o próprio hash)');
ok(/Só a fábrica/.test(await falha('dB', `select order_quote_pass_reset($1)`, [U.dA])), 'dealer não apaga a senha de outro');
await as('dA', () => q(`select order_quote_pass_reset()`));
ok(await tem('dA') === false, 'apagar a própria (esqueci a senha)');
await as('dA', () => q(`select order_quote_pass_set('outra999')`));
await as('admin', () => q(`select order_quote_pass_reset($1)`, [U.dA]));
ok(await tem('dA') === false, 'a fábrica apaga a de qualquer um');
console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO CERTO'); process.exit(fails ? 1 : 0);
