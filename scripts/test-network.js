// Teste rápido de conectividade — roda ANTES do script de migração, só pra
// descobrir se o problema é o Node no seu Windows não conseguindo sair pra
// internet (firewall/antivírus bloqueando node.exe especificamente,
// enquanto o navegador continua funcionando normal), ou se é o próprio
// projeto Supabase demorando/indisponível.
//
// Uso: node scripts/test-network.js

async function test(label, url) {
  const start = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    console.log(`${label}: OK (status ${res.status}, ${Date.now() - start}ms)`);
  } catch (err) {
    console.log(`${label}: FALHOU (${Date.now() - start}ms) —`, err.message || err);
  }
}

async function main() {
  console.log(`Node ${process.versions.node}\n`);
  await test('Google (teste geral de internet)', 'https://www.google.com');
  await test('Supabase — API REST', 'https://xkgffjxihauzzoccnaoe.supabase.co/rest/v1/');
  await test('Supabase — Auth (health)', 'https://xkgffjxihauzzoccnaoe.supabase.co/auth/v1/health');
}

main();
