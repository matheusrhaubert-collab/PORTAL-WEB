// Bancada do BANCO das empresas/árvore/dealers (migrations 306–309, 20/11/2026).
//
// Sobe um Postgres de verdade em memória (PGlite), cria um mini-Supabase de
// mentira (stubs.sql: auth.uid(), is_admin(), user_profiles, orders...), roda
// as migrations 306, 307 e 308 DUAS vezes (idempotência), confere as regras
// (tests.mjs) e por último aplica a 309 (trava do desconto) e confere de novo.
//
// O que confere: migração das contas atuais, quem enxerga o quê na árvore
// (dono × vendedor × outra loja × distribuidor × admin), travas de
// desconto/status, sincronia empresa <-> perfil, foto do preço no pedido,
// virar dealer (rascunho → enviar → aprovar), tax exemption (confirmar,
// vencer, sweep), pedido de desconto, permissões de enviar/aprovar.
//
// Rodar (no terminal, dentro desta pasta, uma vez só o npm):
//     npm i @electric-sql/pglite
//     node rodar.mjs
// NÃO toca no banco de verdade.

import path from 'path';
import { fileURLToPath } from 'url';
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const DB = path.join(AQUI, '..', '..', '..', 'database');
process.chdir(AQUI);
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const db = new PGlite();
const files = ['migration_306_empresas_arvore_base.sql', 'migration_307_virar_dealer.sql', 'migration_308_equipe_e_pedido_de_desconto.sql'].map((f) => path.join(DB, f));
const LATE = path.join(DB, 'migration_309_trava_desconto_so_fabrica.sql');
const U = {};
async function ex(sql) { return db.exec(sql); }
async function q(sql, p) { return (await db.query(sql, p)).rows; }
try { await ex(fs.readFileSync('stubs.sql','utf8')); } catch (e) { console.log('STUBS', e.message); process.exit(1); }
// usuários: admin, dealerA (lojista c/ desconto 12), sellerA1, dealerB (lojista), cliente novo
for (const [k, role] of [['admin','administrador'],['dA','lojista'],['sA1','vendedor'],['dB','lojista'],['cli','cliente'],['dist','cliente']]) {
  const r = await q(`insert into auth.users(email) values ($1) returning id`, [k + '@t.com']); U[k] = r[0].id;
  await q(`insert into user_profiles(user_id,email,role) values ($1,$2,$3)`, [U[k], k + '@t.com', role]);
}
await q(`insert into admin_users values ($1)`, [U.admin]);
await q(`update user_profiles set store_name='Loja A', factory_discount_pct=12 where user_id=$1`, [U.dA]);
await q(`update user_profiles set parent_dealer_user_id=$1 where user_id=$2`, [U.dA, U.sA1]);
await q(`insert into orders(client_user_id,status) values ($1,'submitted')`, [U.dA]);
for (const f of files) { try { await ex(fs.readFileSync(f, 'utf8')); console.log('OK   ', f.split('/').pop()); } catch (e) { console.log('FALHA', f, '\n', e.message, e.position ? '@' + e.position : ''); process.exit(1); } }
// roda de novo (idempotência)
for (const f of files) { try { await ex(fs.readFileSync(f, 'utf8')); console.log('OK 2x', f.split('/').pop()); } catch (e) { console.log('FALHA 2x', f, '\n', e.message); process.exit(1); } }
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fails++; };
async function as(k, fn) { await ex(`select set_config('test.uid','${U[k] || ''}',false); set role authenticated;`); try { return await fn(); } finally { await ex(`reset role; select set_config('test.uid','',false);`); } }
async function fails_(k, sql, p) { try { await as(k, () => q(sql, p)); return false; } catch (e) { return e.message; } }
globalThis.T = { db, q, ex, as, ok, U, fails_ };
const tests = (await import('./tests.mjs')).default;
await tests(T); const m = await import('./tests.mjs'); if (LATE) { await ex(fs.readFileSync(LATE,'utf8')); await ex(fs.readFileSync(LATE,'utf8')); console.log('OK 2x (depois)', LATE.split('/').pop()); } if (m.etapa2) await m.etapa2(T);
console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO CERTO');
process.exit(fails ? 1 : 0);
