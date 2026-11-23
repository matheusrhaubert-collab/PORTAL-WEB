// Bancada da corrida do login do vendedor (portal-05 loadSellerPricingConfig, 23/11).
// node scripts/tests/teste-preco-vendedor-login.js
const fs = require('fs'); const path = require('path'); const vm = require('vm');
const p05 = fs.readFileSync(path.join(__dirname, '../../js/portal-05-cutlist.js'), 'utf8');
const corta = (a, b) => p05.slice(p05.indexOf(a), p05.indexOf(b));
const src = corta('function isSellerAccount()', '// Linha antiga de "Margem geral de revenda"')
  + corta('let dealerFactoryDiscountPct = 0;', '// ---------- PORTAL DEALER') + corta('function hasDealerTools()', '// Quem pode gerar Proposta');
let falhas = 0; const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) falhas++; };
const perto = (a, b) => Math.abs(a - b) < 0.005;
(async () => {
  let solta = null; let falha = false; const ctx = { reprice: 0, console };
  ctx.supabaseClient = { rpc: () => new Promise((res) => { solta = () => res(falha ? { data: null, error: { message: 'rede' } } : { data: { factory_discount_pct: 57, extras: [] }, error: null }); }) };
  ctx.currentUser = { id: 'v' }; ctx.currentUserProfile = { role: 'vendedor' };
  ctx.repriceAllProjectSlots = () => { ctx.reprice++; };
  vm.createContext(ctx);
  vm.runInContext(src + '; resolvedDisplayMarginPct = 30; this.preco = () => getDisplayPrice(1000); this.carrega = loadSellerPricingConfig;', ctx);
  let p = ctx.carrega(); solta(); await p;
  ok(perto(ctx.preco(), 559) && ctx.reprice === 1, '1ª carga: 1000 × 0,43 × 1,30 = 559, e refaz os preços da tela');
  p = ctx.carrega();
  ok(perto(ctx.preco(), 559), '2ª chamada do login (ainda sem resposta): continua 559 — antes caía pra 1300');
  solta(); await p;
  ok(perto(ctx.preco(), 559) && ctx.reprice === 1, 'resposta igual não refaz nada');
  falha = true; p = ctx.carrega(); solta(); await p;
  ok(perto(ctx.preco(), 559), 'rede falhou: mantém o desconto que já tinha');
  ctx.currentUserProfile = { role: 'cliente' }; await ctx.carrega();
  ok(perto(ctx.preco(), 1300), 'quem não é vendedor não herda desconto');
  console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nTudo certo.'); process.exit(falhas ? 1 : 0);
})();
