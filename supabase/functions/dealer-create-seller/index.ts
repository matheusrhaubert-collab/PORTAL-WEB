// Edge Function: dealer-create-seller
//
// Cria uma conta de portal de verdade (auth.users, e-mail + senha) pra um
// VENDEDOR dentro da loja do DEALER logado — pedido do Matt (02/09/2026):
// "preciso tambem de uma estrutura com mais niveis pros dealers (lojas) por
// exmeplo ter o dono e abaixo os vendedores". Confirmado via AskUserQuestion:
// quem cria a conta do vendedor é o PRÓPRIO dealer, self-service, pelo
// portal — não passa pelo admin/ERP.
//
// É irmã de admin-create-user (mesmo arquivo original, mesmo motivo de
// existir como Edge Function): criar um usuário com senha definida por
// OUTRA pessoa só é possível via API de admin do GoTrue
// (auth.admin.createUser), que exige a chave service_role — nunca pode ir
// pro navegador. Diferença de admin-create-user: ali quem chama precisa
// estar na allow-list admin_users (is_admin()); aqui quem chama precisa
// ter role='lojista' de verdade em user_profiles — e o role do usuário
// criado é SEMPRE 'vendedor', com parent_dealer_user_id = id de quem
// chamou (nunca aceito do corpo da requisição — sem isso, um vendedor mal-
// intencionado poderia se autopromover como "dono de si mesmo" ou vincular-
// se à loja de outro dealer).
//
// Deploy (rodar localmente, precisa do Supabase CLI + login/link do
// projeto — não pode ser feito por aqui):
//   supabase functions deploy dealer-create-seller
// (ou powershell -ExecutionPolicy Bypass -File deploy-funcao.ps1 -Nome dealer-create-seller)

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

    // ---------- 2) É dealer (role='lojista') de verdade? ----------
    // Lê user_profiles com service_role (bypassa RLS) — não dá pra confiar
    // em nada que o próprio navegador diga sobre o próprio role.
    const profileCheckRes = await fetch(
      `${SUPABASE_URL}/rest/v1/user_profiles?user_id=eq.${callerId}&select=role`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
    );
    const profileCheckRows = profileCheckRes.ok ? await profileCheckRes.json() : [];
    const callerRole = Array.isArray(profileCheckRows) && profileCheckRows[0] ? profileCheckRows[0].role : null;
    if (callerRole !== 'lojista') {
      return jsonResponse({ error: 'Só uma conta Dealer pode criar vendedores.' }, 403);
    }

    // ---------- 3) Validação do corpo da requisição ----------
    // Sem campo "role" nem "parent_dealer_user_id" aceito do corpo — os
    // dois são sempre fixos aqui embaixo (vendedor / id de quem chamou).
    const body = await req.json().catch(() => null);
    const email = body && typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = body && typeof body.password === 'string' ? body.password : '';
    const fullName = body && typeof body.full_name === 'string' ? body.full_name.trim().slice(0, 200) : '';
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
      const msg = (createJson && (createJson.msg || createJson.message || createJson.error_description)) || `Erro ao criar usuário (${createRes.status}).`;
      return jsonResponse({ error: msg }, 400);
    }
    const newUserId = createJson && createJson.id;
    if (!newUserId) {
      return jsonResponse({ error: 'Usuário criado, mas sem id na resposta — verifique no painel do Supabase.' }, 500);
    }

    // ---------- 5) Grava o perfil (user_profiles) — sempre role='vendedor' ----------
    // vinculado à loja de quem chamou (parent_dealer_user_id = callerId).
    // service_role bypassa a policy "self insert own profile as cliente"
    // (que travaria role != 'cliente') — só esta function (já verificada
    // como dealer de verdade acima) consegue criar já com o vínculo certo.
    const profileRes = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify({
        user_id: newUserId,
        email,
        full_name: fullName || null,
        role: 'vendedor',
        parent_dealer_user_id: callerId
      })
    });
    if (!profileRes.ok) {
      const errText = await profileRes.text();
      console.error('Erro ao gravar user_profiles do novo vendedor:', errText);
      return jsonResponse({ error: `Usuário criado, mas o perfil não foi salvo: ${errText}` }, 500);
    }

    return jsonResponse({ user_id: newUserId, email, full_name: fullName || null, role: 'vendedor' }, 200);
  } catch (err) {
    console.error('Erro inesperado em dealer-create-seller:', err);
    return jsonResponse({ error: String(err && (err as Error).message ? (err as Error).message : err) }, 500);
  }
});
