#!/usr/bin/env node
/**
 * Script para criar um usuário de teste no Supabase via Admin API
 *
 * Antes de rodar, você precisa:
 * 1. Instalar dependência: npm install @supabase/supabase-js
 * 2. Pegar sua SERVICE_ROLE_KEY no Supabase Dashboard:
 *    Supabase > seu projeto > Settings > API > Service Role Key
 * 3. Adicionar SERVICE_ROLE_KEY como variável de ambiente ou editar aqui
 *
 * Como rodar:
 *   node scripts/criar_usuario_teste.js
 *
 * Ou com env var:
 *   SERVICE_ROLE_KEY=sua_chave node scripts/criar_usuario_teste.js
 */

const { createClient } = require('@supabase/supabase-js');

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================

const SUPABASE_URL = 'https://xkgffjxihauzzoccnaoe.supabase.co';

// IMPORTANTE: Substitua pela sua SERVICE_ROLE_KEY (não a anon key!)
// Você encontra em: Supabase Dashboard > Settings > API > Service Role Key
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY || 'COLOQUE_SUA_SERVICE_ROLE_KEY_AQUI';

// Dados do usuário de teste
const TEST_USER_EMAIL = 'teste@legno.local';
const TEST_USER_PASSWORD = 'Teste123!@#';
const TEST_USER_IS_ADMIN = false; // Mude para true se quiser criar como admin

// ============================================================================
// CRIAR USUÁRIO
// ============================================================================

async function criarUsuarioTeste() {
  if (SERVICE_ROLE_KEY === 'COLOQUE_SUA_SERVICE_ROLE_KEY_AQUI') {
    console.error('❌ ERRO: SERVICE_ROLE_KEY não configurada!');
    console.error('');
    console.error('Siga os passos:');
    console.error('1. Abra: https://app.supabase.com');
    console.error('2. Selecione seu projeto');
    console.error('3. Vá em Settings > API');
    console.error('4. Copie a "Service Role Secret"');
    console.error('5. Edite este arquivo e coloque a chave acima, ou rode:');
    console.error('   SERVICE_ROLE_KEY=sua_chave node scripts/criar_usuario_teste.js');
    process.exit(1);
  }

  // Criar cliente admin (com SERVICE_ROLE_KEY)
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  try {
    console.log('🔄 Criando usuário de teste...');
    console.log(`   Email: ${TEST_USER_EMAIL}`);
    console.log(`   Senha: ${TEST_USER_PASSWORD}`);
    console.log(`   Admin: ${TEST_USER_IS_ADMIN}`);
    console.log('');

    // Criar usuário
    const { data, error } = await adminClient.auth.admin.createUser({
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
      email_confirm: true, // Marcar como verificado
    });

    if (error) {
      if (error.message.includes('already exists')) {
        console.log('⚠️  Usuário já existe. Recriando...');
        // Deletar usuário antigo
        await adminClient.auth.admin.deleteUser(
          (await adminClient.auth.admin.listUsers()).data.users.find(u => u.email === TEST_USER_EMAIL)?.id
        );
        // Tentar criar novamente
        const retry = await adminClient.auth.admin.createUser({
          email: TEST_USER_EMAIL,
          password: TEST_USER_PASSWORD,
          email_confirm: true,
        });
        if (retry.error) throw retry.error;
      } else {
        throw error;
      }
    }

    const userId = data?.user?.id;
    console.log(`✅ Usuário criado com sucesso!`);
    console.log(`   User ID: ${userId}`);
    console.log('');

    // Se for admin, adicionar à tabela admin_users
    if (TEST_USER_IS_ADMIN) {
      console.log('🔄 Adicionando permissões de admin...');
      const { error: adminError } = await adminClient
        .from('admin_users')
        .insert({ user_id: userId });

      if (adminError) {
        console.error(`❌ Erro ao adicionar admin: ${adminError.message}`);
      } else {
        console.log('✅ Admin criado com sucesso!');
      }
    }

    console.log('');
    console.log('🎉 Pronto! Você pode fazer login em:');
    console.log(`   https://xkgffjxihauzzoccnaoe.supabase.co`);
    console.log(`   Email: ${TEST_USER_EMAIL}`);
    console.log(`   Senha: ${TEST_USER_PASSWORD}`);

  } catch (err) {
    console.error('❌ Erro ao criar usuário:');
    console.error(err.message);
    process.exit(1);
  }
}

criarUsuarioTeste();
