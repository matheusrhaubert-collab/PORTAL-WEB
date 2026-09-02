/* Legno ERP — camada de dados da Central de Contatos (migration 084).
 *
 * Substitui o mock-contatos.js: aqui nada é inventado, tudo vem do schema
 * `erp` do mesmo Supabase (acesso por supabaseClient.schema('erp'), igual ao
 * data-lotes.js).
 *
 * O QUE ESTE ARQUIVO GUARDA E O QUE ELE SÓ LÊ
 * -------------------------------------------
 * Escreve: erp.contatos, erp.contato_papeis, erp.contas, erp.perfis_acesso.
 * Lê e não toca: public.orders, public.user_projects, public.user_profiles
 * (a lista de logins existentes, pra vincular um login a um contato).
 *
 * A regra do modelo, que a tela precisa deixar óbvia o tempo todo:
 * CONTATO (quem é) e CONTA DE ACESSO (como entra) são coisas separadas,
 * ligadas por um vínculo opcional.
 */

const CT = {};

CT.erp = function () {
  const sb = DATA.sb();
  return sb ? sb.schema('erp') : null;
};

/* Erro com nome e sobrenome. O caso mais provável aqui é "não rodei a 084" —
   e ele tem uma cara específica (relation erp.contatos does not exist) que
   não pode ser confundida com o "schema erp não exposto" da 081, porque as
   correções são diferentes (SQL Editor x Settings da API). */
CT.explainError = function (err) {
  const msg = (err && err.message) || String(err);
  if (/erp\.(contatos|contato_papeis|contas|perfis_acesso)/i.test(msg) && /does not exist|não existe/i.test(msg)) {
    return 'As tabelas da Central de Contatos ainda não existem neste banco — ' +
      'falta rodar database/migration_084_central_contatos.sql no SQL Editor do Supabase. ' +
      'Ela já traz junto o cadastro que existe hoje no portal, no CRM e na allow-list de admin. Detalhe: ' + msg;
  }
  if (typeof LOTES !== 'undefined' && LOTES.explainError) return LOTES.explainError(err);
  return DATA.explainError(err);
};

/* ============================================================
   Catálogo — papéis e permissões
   ============================================================
   Estrutura, não cadastro: papel novo e permissão nova mudam o que alguma
   tela mostra, então moram no código (e no check da migration), não numa
   tabela de domínio editável. */
CT.PAPEIS = {
  cliente:    { label: 'Cliente',    pill: 'erp-pill-info',    desc: 'Compra da fábrica. Pode ter acesso ao portal.' },
  dealer:     { label: 'Dealer',     pill: 'erp-pill-accent',  desc: 'Revende. Enxerga preço de revenda e galeria própria.' },
  // 'vendedor' (migration 149 + 150, 2026-09-02): funcionário de uma loja
  // Dealer, não cliente da fábrica — por isso NÃO ganha o papel 'cliente'
  // extra que o dealer ganha (ver erp.papel_from_portal_role no banco).
  // Conta sempre nasce self-service (a própria loja cria em "Minha
  // Equipe"), então este papel aqui é só pra LER a linha certo — não existe
  // formulário nesta tela que crie ou promova alguém a vendedor.
  vendedor:   { label: 'Vendedor',   pill: 'erp-pill-accent',  desc: 'Funcionário de uma loja Dealer. Vê só os próprios projetos, com o preço de venda da loja — nunca o preço de fábrica.' },
  fornecedor: { label: 'Fornecedor', pill: 'erp-pill-warn',    desc: 'Vende pra fábrica. Aparece nas ordens de compra.' },
  interno:    { label: 'Interno',    pill: 'erp-pill-ok',      desc: 'Trabalha na empresa. Tem conta de acesso.' },
  transporte: { label: 'Transporte', pill: 'erp-pill-neutral', desc: 'Leva a mercadoria. Aparece na expedição.' }
};

CT.PAPEL_ORDEM = ['cliente', 'dealer', 'vendedor', 'fornecedor', 'interno', 'transporte'];

/* ============================================================
   Perfil NO PORTAL (user_profiles.role) — pergunta DIFERENTE do papel
   acima (ver comentário de CT.criarLogin). Vive aqui, não em
   erp/js/adm/03-usuarios.js (2026-09-02: aquela aba virou só um link pra
   esta tela — "não quero que os perfis do portal se misturem com os do
   ERP", pedido do Matt, resolvido deixando os DOIS conceitos nesta mesma
   tela só que em painéis/controles separados, nunca no mesmo campo).
   'vendedor' fica de fora de ATRIBUIVEIS de propósito: só é lido aqui,
   nunca atribuído por um humano (self-service, ver CT.PAPEIS.vendedor). */
CT.PORTAL_ROLE_LABELS = { cliente: 'Cliente', lojista: 'Dealer', vendedor: 'Vendedor', contractor: 'Contractor', administrador: 'Administrador' };
CT.PORTAL_ROLES_ATRIBUIVEIS = ['cliente', 'lojista', 'contractor', 'administrador'];

/* Cada chave vira uma permissão 'tela.acao' — a MESMA string que a policy do
   banco vai checar na etapa 2 (erp.tem_permissao). Se mudar aqui, muda lá. */
CT.PERMISSOES = [
  { tela: 'Contatos',   chave: 'contatos',   acoes: [
      { id: 'ver',      label: 'Ver' },
      { id: 'editar',   label: 'Criar e editar' },
      { id: 'acesso',   label: 'Conceder acesso' } ] },
  { tela: 'Pedidos',    chave: 'pedidos',    acoes: [
      { id: 'ver',      label: 'Ver' },
      { id: 'editar',   label: 'Editar' },
      { id: 'aprovar',  label: 'Aprovar' } ] },
  { tela: 'Financeiro', chave: 'financeiro', acoes: [
      { id: 'ver',      label: 'Ver' },
      { id: 'liberar',  label: 'Liberar produção' } ] },
  { tela: 'Produção',   chave: 'producao',   acoes: [
      { id: 'ver',      label: 'Ver' },
      { id: 'apontar',  label: 'Apontar' },
      { id: 'gerar_op', label: 'Gerar OP' } ] },
  { tela: 'Lotes / Plano de corte', chave: 'lotes', acoes: [
      { id: 'ver',      label: 'Ver' },
      { id: 'editar',   label: 'Montar lote e salvar plano' } ] },
  { tela: 'Materiais',  chave: 'materiais',  acoes: [
      { id: 'ver',      label: 'Ver' },
      { id: 'editar',   label: 'Mexer no estoque' } ] },
  { tela: 'Produtos',   chave: 'produtos',   acoes: [
      { id: 'ver',      label: 'Ver' },
      { id: 'editar',   label: 'Editar engenharia' },
      { id: 'custo',    label: 'Ver custo' } ] },
  { tela: 'Compras',    chave: 'compras',    acoes: [
      { id: 'ver',      label: 'Ver' },
      { id: 'emitir',   label: 'Emitir OC' } ] },
  { tela: 'Expedição',  chave: 'expedicao',  acoes: [
      { id: 'ver',      label: 'Ver' },
      { id: 'fechar',   label: 'Fechar expedição' } ] }
];

CT.todasPermissoes = function () {
  const out = [];
  CT.PERMISSOES.forEach(function (g) {
    g.acoes.forEach(function (a) { out.push(g.chave + '.' + a.id); });
  });
  return out;
};

CT.labelPermissao = function (chave) {
  const p = String(chave || '').split('.');
  const g = CT.PERMISSOES.find(function (x) { return x.chave === p[0]; });
  if (!g) return chave;
  const a = g.acoes.find(function (x) { return x.id === p[1]; });
  return g.tela + ' · ' + (a ? a.label : p[1]);
};

/* ============================================================
   Regra de permissão — perfil é molde, override é exceção
   ============================================================
   Esta função é gêmea da erp.tem_permissao() do banco. As duas precisam
   concordar; se um dia divergirem, a do banco é que vale. */
CT.perfilTem = function (perfil, chave) {
  if (!perfil) return false;
  if (perfil.permissoes === null || perfil.permissoes === undefined) return true; /* null = tudo */
  return (perfil.permissoes || []).indexOf(chave) >= 0;
};

CT.efetiva = function (conta, chave, perfis) {
  const perfil = CT.perfilById(conta && conta.perfil_id, perfis);
  const base = CT.perfilTem(perfil, chave);
  const ov = (conta && conta.overrides) || {};
  if (Object.prototype.hasOwnProperty.call(ov, chave)) {
    return { valor: !!ov[chave], herdado: false, base: base };
  }
  return { valor: base, herdado: true, base: base };
};

CT.perfilById = function (id, perfis) {
  if (!id) return null;
  return (perfis || CT._perfis || []).find(function (p) { return p.id === id; }) || null;
};

CT.perfilBySlug = function (slug, perfis) {
  return (perfis || CT._perfis || []).find(function (p) { return p.slug === slug; }) || null;
};

/* ============================================================
   Leitura
   ============================================================ */

/* Carrega tudo de uma vez e monta o objeto que a tela usa:
   contato.papeis = ['cliente', ...]   contato.conta = {...} | null

   Quatro consultas separadas em vez de um select aninhado do PostgREST de
   propósito: o aninhamento depende da detecção de FK e quebra com mensagem
   ruim quando alguma migration não rodou. Aqui, se falhar, dá pra dizer QUAL
   tabela faltou. */
CT.load = async function () {
  const erp = CT.erp();
  if (!erp) throw new Error(DATA.connectionProblem() || 'Sem conexão com o Supabase.');

  /* Espelha o último login antes de listar. Se falhar (função ausente porque
     a migration é antiga, ou usuário sem permissão), a tela continua — a
     coluna só fica desatualizada, o que não justifica derrubar tudo. */
  /* A função mora no schema erp, então o rpc sai do client do schema erp —
     DATA.sb().rpc() procuraria em public e responderia 404. */
  try { await erp.rpc('sync_ultimo_acesso'); } catch (e) { /* silencioso de propósito */ }

  // public.user_profiles entra no MESMO Promise.all — é outro client
  // (DATA.sb(), schema public, não erp.schema('erp')) mas a Promise é a
  // Promise, mistura sem problema. Sem isto não dava pra mostrar/trocar o
  // "Perfil no portal" desta tela (ver _painelAcesso em screens-contatos.js)
  // — o role e a logo do dealer ficavam invisíveis aqui, obrigando a
  // reabrir a aba antiga pra ver o que a pessoa é NO PORTAL.
  const [contatosRes, papeisRes, contasRes, perfisRes, profilesRes] = await Promise.all([
    erp.from('contatos').select('*').order('nome'),
    erp.from('contato_papeis').select('*'),
    erp.from('contas').select('*'),
    erp.from('perfis_acesso').select('*').order('nome'),
    DATA.sb().from('user_profiles').select('user_id, role, logo_url')
  ]);
  [contatosRes, papeisRes, contasRes, perfisRes, profilesRes].forEach(function (r) { if (r.error) throw r.error; });

  const perfis = perfisRes.data || [];
  CT._perfis = perfis;

  const contas = {};
  (contasRes.data || []).forEach(function (a) { contas[a.contato_id] = a; });

  const profilesByUser = {};
  (profilesRes.data || []).forEach(function (p) { profilesByUser[p.user_id] = p; });

  const papeis = {};
  (papeisRes.data || []).forEach(function (p) {
    (papeis[p.contato_id] = papeis[p.contato_id] || []).push(p.papel);
  });

  const contatos = (contatosRes.data || []).map(function (c) {
    const lista = papeis[c.id] || [];
    c.papeis = CT.PAPEL_ORDEM.filter(function (p) { return lista.indexOf(p) >= 0; });
    c.conta = contas[c.id] || null;
    // portal_role/portal_logo_url são de user_profiles, não de erp.contas —
    // penduram aqui só por conveniência de tela (c.conta é o objeto que
    // screens-contatos.js já passa pra tudo quanto é painel de acesso).
    if (c.conta && c.conta.user_id && profilesByUser[c.conta.user_id]) {
      c.conta.portal_role = profilesByUser[c.conta.user_id].role;
      c.conta.portal_logo_url = profilesByUser[c.conta.user_id].logo_url;
    }
    return c;
  });

  const stats = await CT.statsPorUsuario();
  contatos.forEach(function (c) {
    c.stats = (c.conta && c.conta.user_id && stats[c.conta.user_id]) || null;
  });

  return { contatos: contatos, perfis: perfis };
};

/* Números do portal por usuário — pedidos e projetos. É leitura de public,
   fonte única: o ERP não guarda cópia disso. Falha aqui não derruba a tela
   (a Central de Contatos serve sem os números). */
CT.statsPorUsuario = async function () {
  const by = {};
  const sb = DATA.sb();
  try {
    const [orders, projects] = await Promise.all([
      sb.from('orders').select('client_user_id, status'),
      sb.from('user_projects').select('client_user_id, cached_value_usd')
    ]);
    (orders.data || []).forEach(function (o) {
      const k = o.client_user_id;
      if (!k) return;
      by[k] = by[k] || { pedidos: 0, projetos: 0, valor: 0 };
      by[k].pedidos += 1;
    });
    (projects.data || []).forEach(function (p) {
      const k = p.client_user_id;
      if (!k) return;
      by[k] = by[k] || { pedidos: 0, projetos: 0, valor: 0 };
      by[k].projetos += 1;
      by[k].valor += Number(p.cached_value_usd) || 0;
    });
  } catch (e) {
    console.error('Central de Contatos: não deu pra ler os números do portal.', e);
  }
  return by;
};

/* Logins que existem no portal e ainda não estão amarrados a nenhum contato —
   alimenta o "vincular um login existente" da ficha. */
CT.loginsDisponiveis = async function () {
  const [profiles, contas] = await Promise.all([
    DATA.sb().from('user_profiles').select('user_id, email, full_name, role'),
    CT.erp().from('contas').select('user_id')
  ]);
  if (profiles.error) throw profiles.error;
  if (contas.error) throw contas.error;
  const usados = {};
  (contas.data || []).forEach(function (c) { if (c.user_id) usados[c.user_id] = true; });
  return (profiles.data || []).filter(function (p) { return !usados[p.user_id]; });
};

/* ============================================================
   Escrita — contato
   ============================================================ */
CT.criarContato = async function (patch) {
  const { data, error } = await CT.erp().from('contatos')
    .insert(Object.assign({ origem: 'erp' }, CT._limpaContato(patch)))
    .select().single();
  if (error) throw error;
  return data;
};

CT.salvarContato = async function (id, patch) {
  const body = CT._limpaContato(patch);
  body.updated_at = new Date().toISOString();
  const { error } = await CT.erp().from('contatos').update(body).eq('id', id);
  if (error) throw error;
};

CT.excluirContato = async function (id) {
  const { error } = await CT.erp().from('contatos').delete().eq('id', id);
  if (error) throw error;
};

/* E-mail vazio precisa virar NULL, não string vazia: o índice único é
   parcial (where email is not null), então dois contatos com '' colidiriam
   e o segundo cadastro sem e-mail falharia sem explicação. */
CT._limpaContato = function (p) {
  const out = {};
  ['tipo', 'nome', 'pessoa_contato', 'email', 'telefone', 'cidade', 'endereco', 'doc', 'notes'].forEach(function (k) {
    if (!Object.prototype.hasOwnProperty.call(p, k)) return;
    const v = typeof p[k] === 'string' ? p[k].trim() : p[k];
    out[k] = (v === '' || v === undefined) ? null : v;
  });
  if (out.email) out.email = String(out.email).toLowerCase();
  if (Object.prototype.hasOwnProperty.call(p, 'ativo')) out.ativo = !!p.ativo;
  return out;
};

/* ============================================================
   Escrita — papéis
   ============================================================ */
CT.setPapel = async function (contatoId, papel, ligado) {
  const erp = CT.erp();
  if (ligado) {
    const { error } = await erp.from('contato_papeis').insert({ contato_id: contatoId, papel: papel });
    /* 23505 = já existe. Marcar duas vezes o mesmo papel não é erro pro usuário. */
    if (error && error.code !== '23505') throw error;
  } else {
    const { error } = await erp.from('contato_papeis').delete()
      .eq('contato_id', contatoId).eq('papel', papel);
    if (error) throw error;
  }
};

/* ============================================================
   Escrita — conta de acesso
   ============================================================ */

/* Vincula um login QUE JÁ EXISTE (usuário do portal) a este contato.
   upsert em vez de insert desde a migration 140: todo INSERT em
   public.user_profiles (inclusive o que a Edge Function admin-create-user
   faz em "Criar login novo", CT.criarLogin abaixo) já dispara um trigger que
   cria a linha em erp.contas sozinho — um insert simples aqui bateria de
   frente com o que o trigger acabou de gravar e falharia com "duplicate
   key". O fallback por user_id cobre o caso raro de alguém digitar, no
   formulário de "Criar login novo", um e-mail diferente do e-mail já
   cadastrado do contato: aí o trigger casa por ESSE e-mail (que pode ser
   outro contato) e a colisão acontece no user_id, não no contato_id. */
CT.vincularLogin = async function (contatoId, userId, login, perfilId) {
  const patch = {
    contato_id: contatoId, user_id: userId, login: (login || '').toLowerCase(),
    perfil_id: perfilId || null
  };
  let { data, error } = await CT.erp().from('contas').upsert(patch, { onConflict: 'contato_id' }).select().single();
  if (error && error.code === '23505') {
    ({ data, error } = await CT.erp().from('contas').update(patch).eq('user_id', userId).select().single());
  }
  if (error) throw error;
  return data;
};

/* Cria um login NOVO de verdade (e-mail + senha) e já amarra ao contato.
   Passa pela Edge Function admin-create-user porque criar usuário com senha
   exige a chave service_role, que nunca pode ir pro navegador — a mesma
   função que o admin.html usa desde a migration 053.

   `role` aqui é o rótulo do PORTAL (user_profiles.role), não a permissão do
   back-office. Quem manda no back-office é o perfil_id da conta. São dois
   campos porque são duas perguntas diferentes: o que a pessoa vê no portal,
   e o que ela pode fazer na fábrica. */
CT.criarLogin = async function (contatoId, opts) {
  const { data, error } = await DATA.sb().functions.invoke('admin-create-user', {
    body: {
      full_name: opts.full_name || '',
      email: opts.email,
      password: opts.password,
      role: opts.role || 'cliente'
    }
  });
  if (error) {
    let msg = error.message || 'Erro ao criar usuário.';
    /* Resposta 4xx da function chega como FunctionsHttpError com o corpo
       real em error.context — sem isso o usuário vê "non-2xx status code"
       e nunca fica sabendo que o e-mail já existia. */
    if (error.context && typeof error.context.json === 'function') {
      try { const body = await error.context.json(); if (body && body.error) msg = body.error; } catch (e) { /* mantém genérica */ }
    }
    throw new Error(msg);
  }
  if (data && data.error) throw new Error(data.error);
  return CT.vincularLogin(contatoId, data.user_id, opts.email, opts.perfil_id);
};

/* Muda o PERFIL NO PORTAL (user_profiles.role) de um login que já existe —
   antes só dava pra fazer isto na aba antiga "Perfis"
   (erp/js/adm/03-usuarios.js), que agora é só um link pra cá. 'vendedor'
   não é uma opção nos <select> que chamam esta função (CT.PORTAL_ROLES_
   ATRIBUIVEIS não o lista) — continua só-leitura/self-service. O trigger da
   migration 150 (sync_contato_papel_from_role_update) reflete a troca em
   erp.contato_papeis sozinho; esta função só grava o role em si. */
CT.trocarRolePortal = async function (userId, role) {
  const { error } = await DATA.sb().from('user_profiles')
    .update({ role: role, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (error) throw error;
};

/* Logo do dealer, pelo admin (migration 075 é self-service — só o próprio
   dealer, logado no portal, enviava a dele; js/portal-05-cutlist.js:
   uploadDealerLogo). Não existia NENHUM caminho pelo admin até 2026-09-02
   (pedido do Matt: "criei usuario dealer novo e nao consigo colocar a logo
   dela"). Mesmo bucket/path/upsert/cache-busting da versão self-service, só
   trocando currentUser.id pelo userId recebido — usa a policy de storage
   "admin manage dealer-logos", que já existia desde a migration 075 mas
   nunca tinha tela nenhuma por trás. */
CT.uploadLogoDealer = async function (userId, file) {
  const sb = DATA.sb();
  const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
  const path = userId + '/logo.' + ext;
  const { error: uploadError } = await sb.storage.from('dealer-logos')
    .upload(path, file, { upsert: true, cacheControl: '3600' });
  if (uploadError) throw uploadError;
  const { data: publicUrlData } = sb.storage.from('dealer-logos').getPublicUrl(path);
  const publicUrl = publicUrlData.publicUrl + '?v=' + Date.now();
  const { error: updateError } = await sb.from('user_profiles')
    .update({ logo_url: publicUrl, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (updateError) throw updateError;
  return publicUrl;
};

CT.salvarConta = async function (contaId, patch) {
  const body = Object.assign({}, patch);
  body.updated_at = new Date().toISOString();
  const { error } = await CT.erp().from('contas').update(body).eq('id', contaId);
  if (error) throw error;
};

/* Tira o acesso sem apagar o contato — a pessoa continua existindo no
   cadastro, com o histórico dela. Não apaga o usuário do Auth: desfazer um
   engano de clique tem que ser possível. */
CT.removerConta = async function (contaId) {
  const { error } = await CT.erp().from('contas').delete().eq('id', contaId);
  if (error) throw error;
};

/* valor === null limpa a exceção (volta a herdar do perfil). */
CT.setOverride = async function (conta, chave, valor) {
  const ov = Object.assign({}, conta.overrides || {});
  if (valor === null) delete ov[chave]; else ov[chave] = !!valor;
  await CT.salvarConta(conta.id, { overrides: ov });
  conta.overrides = ov;
};

CT.limparOverrides = async function (conta) {
  await CT.salvarConta(conta.id, { overrides: {} });
  conta.overrides = {};
};

/* ============================================================
   Escrita — perfis de acesso
   ============================================================ */
CT.criarPerfil = async function (patch) {
  const { data, error } = await CT.erp().from('perfis_acesso').insert({
    slug: patch.slug, nome: patch.nome, descricao: patch.descricao || null,
    sistema: false, permissoes: patch.permissoes || []
  }).select().single();
  if (error) throw error;
  return data;
};

CT.salvarPerfil = async function (id, patch) {
  const body = Object.assign({}, patch);
  body.updated_at = new Date().toISOString();
  const { error } = await CT.erp().from('perfis_acesso').update(body).eq('id', id);
  if (error) throw error;
};

CT.excluirPerfil = async function (id) {
  const { error } = await CT.erp().from('perfis_acesso').delete().eq('id', id);
  if (error) throw error;
};

/* Slug único a partir do nome — é a chave estável que a policy do banco
   usaria; nome é só apresentação e pode ser renomeado sem quebrar nada. */
CT.slugify = function (nome, existentes) {
  let base = String(nome || 'perfil').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24) || 'perfil';
  let s = base, i = 2;
  const usados = (existentes || CT._perfis || []).map(function (p) { return p.slug; });
  while (usados.indexOf(s) >= 0) { s = base + '_' + i; i++; }
  return s;
};

/* ============================================================
   Contagens da tela
   ============================================================ */
CT.totalOverrides = function (contatos) {
  return (contatos || []).reduce(function (s, c) {
    return s + (c.conta && c.conta.overrides ? Object.keys(c.conta.overrides).length : 0);
  }, 0);
};

CT.usandoPerfil = function (contatos, perfilId) {
  return (contatos || []).filter(function (c) { return c.conta && c.conta.perfil_id === perfilId; });
};
