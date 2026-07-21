// Migra as imagens ANTIGAS da galeria (ainda em base64 na coluna
// ai_image_data_url) pro Supabase Storage — mesma coisa que o botão
// "Migrar imagens antigas pro Storage" do admin.html faz, só que rodando
// direto no terminal (Node), não no navegador (evita qualquer bloqueio de
// CORS do navegador — Node não tem same-origin policy).
//
// PRÉ-REQUISITO (uma vez só, dentro da pasta do projeto):
//   npm install @supabase/supabase-js
//
// USO:
//   node scripts/migrate-gallery-images-cli.js
// Pede e-mail e senha da conta ADMIN (mesma do admin.html) — precisa ser
// admin (RLS "admin manage gallery_posts" exige is_admin()).
//
// Idempotente: pode rodar de novo, só pega quem ainda começa com "data:".
//
// NOTA (2026-07-20): 1ª versão escondia a senha digitada com um hack de
// readline (`rl._writeToOutput`) e chamava `process.exit()` logo depois do
// login — em alguns Node no Windows isso disparou um crash nativo
// ("Assertion failed ... UV_HANDLE_CLOSING", bug conhecido de libuv/undici
// derrubando o processo antes da conexão de rede terminar de fechar
// direito) e mascarou a mensagem de erro real do login (`{}` em vez do
// texto). Removido o hack de esconder senha (mostra em texto puro — script
// só roda local, tradeoff aceitável) e trocado `process.exit()` por
// `process.exitCode` (deixa o Node fechar sozinho, sem forçar).

const { createClient } = require('@supabase/supabase-js');
const readline = require('readline');

// Mesmos valores de js/config.js — chave pública (anon), já fica exposta
// no navegador o tempo todo, sem problema estar aqui também.
const SUPABASE_URL = 'https://xkgffjxihauzzoccnaoe.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_IXISqOY8SeFIXDebmz2DHg_fNsBUDjC';

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer); }));
}

// Imprime o erro por INTEIRO (não só .message) — supabase-js às vezes
// devolve um objeto onde .message vem vazio/estranho quando o problema é
// de rede/DNS/versão do Node, não de credencial errada. Ver essas
// propriedades extras é o que vai dizer qual dos dois é.
function dumpError(label, err) {
  console.error(label);
  if (err && typeof err === 'object') {
    console.error('  name:', err.name);
    console.error('  message:', err.message);
    console.error('  status:', err.status);
    console.error('  code:', err.code || err.cause);
    console.error('  raw:', JSON.stringify(err, Object.getOwnPropertyNames(err)));
  } else {
    console.error('  ', err);
  }
}

async function main() {
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  console.log(`Node ${process.versions.node}${nodeMajor < 18 ? ' — ATENÇÃO: versão antiga, pode faltar suporte a fetch() nativo. Recomendado Node 18+.' : ''}`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const email = await ask('E-mail do admin: ');
  const password = await ask('Senha (aparece em texto mesmo, script só roda local): ');

  let authError;
  try {
    const res = await supabase.auth.signInWithPassword({ email, password });
    authError = res.error;
  } catch (thrownErr) {
    dumpError('Login lançou uma exceção (provável erro de rede/Node, não de senha):', thrownErr);
    process.exitCode = 1;
    return;
  }
  if (authError) {
    dumpError('Falha no login:', authError);
    process.exitCode = 1;
    return;
  }
  console.log('Login OK.\n');

  const { data: idsData, error: idsError } = await supabase
    .from('gallery_posts')
    .select('id')
    .like('ai_image_data_url', 'data:%');
  if (idsError) {
    dumpError('Erro ao buscar posts:', idsError);
    process.exitCode = 1;
    return;
  }
  const ids = (idsData || []).map((p) => p.id);
  console.log(`${ids.length} post(s) pra migrar.`);
  if (ids.length === 0) {
    console.log('Nada pra fazer — tudo já está no Storage.');
    return;
  }

  let done = 0;
  let failed = 0;
  for (const id of ids) {
    process.stdout.write(`Migrando ${done + failed + 1}/${ids.length} (${id})... `);
    try {
      const { data: row, error: rowError } = await supabase
        .from('gallery_posts')
        .select('ai_image_data_url')
        .eq('id', id)
        .single();
      if (rowError) throw rowError;
      const dataUrl = row.ai_image_data_url || '';
      const match = /^data:([^;]+);base64,([\s\S]+)$/.exec(dataUrl);
      if (!match) throw new Error('não é um data URL base64 válido, pulando');
      const contentType = match[1];
      const buffer = Buffer.from(match[2], 'base64');
      const ext = (contentType.split('/')[1] || 'png').split('+')[0]; // "image/svg+xml" -> "svg"
      const path = `${id}-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('gallery-images')
        .upload(path, buffer, { contentType, upsert: false });
      if (uploadError) throw uploadError;
      const { data: pub } = supabase.storage.from('gallery-images').getPublicUrl(path);
      const { error: updateError } = await supabase
        .from('gallery_posts')
        .update({ ai_image_data_url: pub.publicUrl })
        .eq('id', id);
      if (updateError) throw updateError;
      done++;
      console.log('OK');
    } catch (err) {
      failed++;
      console.log('FALHOU:', (err && err.message) || err);
    }
  }
  console.log(`\nConcluído: ${done} migrado(s), ${failed} falha(s).`);
  if (failed) console.log('Pode rodar o script de novo pra tentar os que faltaram.');
}

main().catch((err) => { dumpError('Erro inesperado:', err); process.exitCode = 1; });
