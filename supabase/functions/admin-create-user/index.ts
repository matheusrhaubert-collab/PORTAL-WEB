// Edge Function: admin-create-user
//
// Cria uma conta de portal de verdade (auth.users, e-mail + senha) direto
// pelo admin.html, aba "Perfis" (migration 051) — pedido do usuário
// 2026-07-19: "quero criar novos usuarios, dou uma senha simples mas que
// eles possam trocar no seu perfil. quero alem do email nome do usuario."
//
// Por que uma Edge Function (e não uma chamada direta do navegador)? Criar
// um usuário com senha definida por OUTRA pessoa (o admin) só é possível
// via API de admin do GoTrue (auth.admin.createUser), que exige a chave
// service_role — essa chave NUNCA pode ir pro navegador (dá acesso total,
// ignora toda RLS). Só o servidor (esta function) guarda ela, e só via as
// variáveis SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY/SUPABASE_ANON_KEY que o
// Supabase já injeta automaticamente em toda Edge Function — diferente de
// GEMINI_API_KEY/OPENAI_API_KEY (generate-gallery-render), não precisa
// rodar `supabase secrets set` pra nenhuma delas.
//
// Segurança: verifica se quem está chamando é ADMIN de verdade (allow-list
// admin_users, mesma tabela que já trava o admin.html — is_admin() no
// banco) ANTES de criar qualquer coisa. Sem isso, qualquer cliente logado
// (inclusive um Contractor) poderia invocar esta function e criar contas —
// ela roda com service_role, então TEM que checar isso na mão aqui dentro
// (RLS não se aplica a chamadas feitas com service_role).
//
// O admin escolhe uma senha simples pro usuário novo (ex: "legno123") — a
// pessoa consegue trocar depois, ela mesma, na aba de configurações do
// portal (ver "Trocar senha" em portal.js, chama supabase.auth.updateUser
// diretamente com a PRÓPRIA sessão, sem precisar de admin nem desta
// function).
//
// Deploy (rodar localmente, precisa do Supabase CLI + login/link do
// projeto — não pode ser feito por aqui):
//   supabase functions deploy admin-create-user
// (sem `secrets set` nenhum — as 3 env vars usadas aqui já vêm prontas)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

const ALLOWED_ROLES = ['cliente', 'lojista', 'contractor', 'administrador'];

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
      return jsonResponse({ error: 'Configuração do projeto incompleta (env vars do Supabase ausentes).' }, 500);
    }

    // ---------- 1) Quem está chamando? (JWT do cabeçalho Authorization) ----------
    const authHeader = req.headers.get('authorization') || '';
    const callerJwt = authHeader.replace(/^Bearer\s+/i, '');
    if (!callerJwt) {
      return jsonResponse({ error: 'Não autenticado.' }, 401);
    }
    const callerRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${callerJwt}`, apikey: ANON_KEY }
    });
    if (!callerRes.ok) {
      return jsonResponse({ error: 'Sessão inválida ou expirada.' }, 401);
    }
    const callerUser = await callerRes.json();
    const callerId = callerUser && callerUser.id;
    if (!callerId) {
      return jsonResponse({ error: 'Sessão inválida.' }, 401);
    }

    // ---------- 2) É admin de verdade? (allow-list admin_users) ----------
    const adminCheckRes = await fetch(
      `${SUPABASE_URL}/rest/v1/admin_users?user_id=eq.${callerId}&select=user_id`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
    );
    const adminCheckRows = adminCheckRes.ok ? await adminCheckRes.json() : [];
    if (!Array.isArray(adminCheckRows) || adminCheckRows.length === 0) {
      return jsonResponse({ error: 'Só administradores podem criar usuários.' }, 403);
    }

    // ---------- 3) Validação do corpo da requisição ----------
    const body = await req.json().catch(() => null);
    const email = body && typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = body && typeof body.password === 'string' ? body.password : '';
    const fullName = body && typeof body.full_name === 'string' ? body.full_name.trim().slice(0, 200) : '';
    const role = body && ALLOWED_ROLES.includes(body.role) ? body.role : 'cliente';
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse({ error: 'E-mail inválido.' }, 400);
    }
    if (!password || password.length < 6) {
      return jsonResponse({ error: 'Senha precisa ter ao menos 6 caracteres.' }, 400);
    }

    // ---------- 4) Cria o usuário de verdade (auth.users) ----------
    const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true, // já nasce confirmado — não precisa clicar link de e-mail
        user_metadata: fullName ? { full_name: fullName } : {}
      })
    });
    const createJson = await createRes.json().catch(() => ({}));
    if (!createRes.ok) {
      // GoTrue devolve msg tipo "User already registered" — repassa direto,
      // é mais claro pro Matt do que um erro genérico.
      const msg = (createJson && (createJson.msg || createJson.message || createJson.error_description)) || `Erro ao criar usuário (${createRes.status}).`;
      return jsonResponse({ error: msg }, 400);
    }
    const newUserId = createJson && createJson.id;
    if (!newUserId) {
      return jsonResponse({ error: 'Usuário criado, mas sem id na resposta — verifique no painel do Supabase.' }, 500);
    }

    // ---------- 5) Grava o perfil (user_profiles) — nome + perfil escolhido ----------
    // service_role bypassa a policy "self insert own profile as cliente"
    // (que travaria qualquer role != 'cliente') — só esta function
    // (verificada como admin acima) pode criar já com o perfil certo.
    const profileRes = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify({ user_id: newUserId, email, full_name: fullName || null, role })
    });
    if (!profileRes.ok) {
      const errText = await profileRes.text();
      console.error('Erro ao gravar user_profiles do novo usuário:', errText);
      return jsonResponse({ error: `Usuário criado, mas o perfil não foi salvo: ${errText}` }, 500);
    }

    return jsonResponse({ user_id: newUserId, email, full_name: fullName || null, role }, 200);
  } catch (err) {
    console.error('Erro inesperado em admin-create-user:', err);
    return jsonResponse({ error: String(err && (err as Error).message ? (err as Error).message : err) }, 500);
  }
});
