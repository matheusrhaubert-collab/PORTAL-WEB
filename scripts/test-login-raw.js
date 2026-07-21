// Testa o login SEM passar pela biblioteca supabase-js — POST direto no
// endpoint de token, igual o supabase-js faz por baixo dos panos. Isso
// isola se o problema é específico da chamada de LOGIN (rate limit /
// bloqueio anti-abuso do Supabase depois de várias tentativas seguidas) ou
// da biblioteca supabase-js em si — o teste anterior (test-network.js)
// já provou que a internet/Node conseguem alcançar o Supabase normalmente
// (REST e Auth health responderam rápido), então esse 522 só aconteceu na
// tentativa de LOGIN de verdade.
//
// Uso: node scripts/test-login-raw.js
// Pede e-mail/senha (texto puro, só roda local).

const readline = require('readline');

const SUPABASE_URL = 'https://xkgffjxihauzzoccnaoe.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_IXISqOY8SeFIXDebmz2DHg_fNsBUDjC';

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer); }));
}

async function main() {
  const email = await ask('E-mail do admin: ');
  const password = await ask('Senha: ');

  const start = Date.now();
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY
      },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(20000)
    });
    const ms = Date.now() - start;
    const text = await res.text();
    console.log(`Status: ${res.status} (${ms}ms)`);
    console.log('Corpo da resposta:', text);
  } catch (err) {
    console.log(`FALHOU (${Date.now() - start}ms) —`, err.message || err);
  }
}

main();
