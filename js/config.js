// Configuração de conexão com o Supabase.
// Preencha com os dados do SEU projeto: Supabase > Project Settings > API.
// SUPABASE_ANON_KEY é a chave pública (anon) — pode ficar exposta no
// front-end, pois o acesso de escrita é controlado pelas RLS policies
// (veja database/schema.sql).

const SUPABASE_URL = 'https://bibtcgcabjngisqwywrs.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_SgMJ7OhK6CDCFbZJaRIvTQ_0WJoWQP8';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
