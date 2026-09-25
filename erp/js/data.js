/* Legno ERP — camada de dados (Supabase real).
 *
 * FONTE ÚNICA: nenhuma consulta aqui cria ou altera cadastro do portal.
 * Pedidos, produtos e projetos são LEITURA. As policies que permitem isso já
 * existem e não precisaram de migration nova:
 *   migration_033 → "admin read orders" / "admin read order_items"
 *   migration_078 → "admin read user_projects"
 *   schema.sql    → tabelas de catálogo têm leitura pública
 *
 * A conexão reaproveita js/config.js do portal — a URL e a anon key moram num
 * lugar só. Se o Supabase mudar, muda lá e os dois apps seguem.
 */

const DATA = {};

/* ATENÇÃO — armadilha que já custou um "não consegui carregar o Supabase":
   js/config.js declara `const supabaseClient = ...` no topo de um script
   clássico. `const`/`let` no escopo global NÃO viram propriedade do window
   (só `var` e function fazem isso) — então `window.supabaseClient` é sempre
   undefined, mesmo com o arquivo carregado. O portal.js nunca esbarrou nisso
   porque usa o identificador direto. Aqui o acesso é pelo nome, com typeof
   para não estourar ReferenceError se o config.js faltar de verdade. */
DATA.sb = function () {
  return typeof supabaseClient !== 'undefined' ? supabaseClient : null;
};

/* Diagnóstico do que faltou — separa "a biblioteca não carregou" de
   "o config.js não carregou", que pedem correções diferentes. */
DATA.connectionProblem = function () {
  if (typeof window.supabase === 'undefined') {
    return 'A biblioteca do Supabase não carregou. Ela é servida local, de ' +
      'erp/js/vendor/supabase.js — confira se o arquivo existe (ele é uma cópia de ' +
      'node_modules/@supabase/supabase-js/dist/umd/supabase.js).';
  }
  if (typeof supabaseClient === 'undefined') {
    return 'O arquivo js/config.js do portal não foi encontrado a partir de erp/. ' +
      'A pasta erp/ precisa estar dentro da raiz do projeto, ao lado de js/.';
  }
  return null;
};

/* ============================================================
   Sessão
   ============================================================ */
DATA.user = null;
DATA.isAdmin = false;

DATA.loadSession = async function () {
  const { data } = await DATA.sb().auth.getSession();
  DATA.user = data && data.session ? data.session.user : null;
  if (DATA.user) DATA.isAdmin = await DATA.checkAdmin();
  return DATA.user;
};

/* Allow-list de admin: a tabela admin_users tem RLS ligado e NENHUMA policy
   (migration 018) — de propósito, ninguém lê a lista pela API. A checagem é
   feita pela função is_admin(), que é security definer.
   Mesma chamada que admin.js usa em ensureAdminOrSignOut(). */
DATA.checkAdmin = async function () {
  try {
    const { data, error } = await DATA.sb().rpc('is_admin');
    if (error) return false;
    return data === true;
  } catch (e) { return false; }
};

DATA.signIn = async function (email, password) {
  const { error } = await DATA.sb().auth.signInWithPassword({ email: email, password: password });
  if (error) throw error;
  await DATA.loadSession();
};

DATA.signOut = async function () {
  await DATA.sb().auth.signOut();
  DATA.user = null;
  DATA.isAdmin = false;
};

/* ============================================================
   Cache simples — o catálogo não muda durante a sessão
   ============================================================ */
DATA._cache = {};
DATA._once = async function (key, fn) {
  if (!DATA._cache[key]) DATA._cache[key] = fn();
  return DATA._cache[key];
};
DATA.clearCache = function () { DATA._cache = {}; };

/* ============================================================
   Taxonomia
   Atenção: families, categories e subcategories são listas PLANAS — não há
   category.family_id nem subcategory.category_id no schema. A hierarquia
   existe só no módulo, que aponta para os três independentemente.
   ============================================================ */
DATA.taxonomy = function () {
  return DATA._once('tax', async function () {
    const sb = DATA.sb();
    const [fam, cat, sub] = await Promise.all([
      sb.from('families').select('id, name'),
      sb.from('categories').select('id, name'),
      sb.from('subcategories').select('id, name')
    ]);
    const map = function (r) {
      const o = {};
      (r.data || []).forEach(function (x) { o[x.id] = x; });
      return o;
    };
    return { families: map(fam), categories: map(cat), subcategories: map(sub) };
  });
};

/* ============================================================
   Módulos (catálogo do portal)
   ============================================================ */
DATA.modules = function () {
  return DATA._once('modules', async function () {
    /* select('*') de propósito: várias migrations acrescentaram colunas ao
       longo do tempo (volume/peso, afastamento de teto, margem...). Pedir
       coluna por coluna quebraria se alguma migration ainda não tiver
       rodado neste banco. */
    const { data, error } = await DATA.sb()
      .from('modules').select('*').order('name');
    if (error) throw error;
    return data || [];
  });
};

DATA.moduleById = async function (id) {
  const all = await DATA.modules();
  return all.find(function (m) { return m.id === id; }) || null;
};

/* ============================================================
   Estrutura dos módulos — usada para separar fabricado x comprado
   ============================================================ */
DATA.componentIndex = function () {
  return DATA._once('components', async function () {
    const sb = DATA.sb();
    const [comp, link, types] = await Promise.all([
      sb.from('components').select('*'),
      sb.from('module_components').select('*'),
      sb.from('component_types').select('id, name')
    ]);
    if (comp.error) throw comp.error;
    if (link.error) throw link.error;

    const byId = {};
    (comp.data || []).forEach(function (c) { byId[c.id] = c; });

    const typeById = {};
    (types.data || []).forEach(function (t) { typeById[t.id] = t; });

    const byModule = {};
    (link.data || []).forEach(function (l) {
      (byModule[l.module_id] = byModule[l.module_id] || []).push(l);
    });
    Object.keys(byModule).forEach(function (k) {
      byModule[k].sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); });
    });

    return { components: byId, types: typeById, byModule: byModule };
  });
};

/* Percorre a árvore do módulo somando os componentes com origin='comprado'.
 *
 * origin veio da migration 034 justamente para isto: puxador, pé, dobradiça
 * e afins não são cortados, são comprados. Sem esse campo a lista de compras
 * seria chute.
 *
 * `seen` corta ciclo — módulo aninhado que (por erro de cadastro) aponte para
 * um ancestral entraria em recursão infinita.
 */
DATA.resolvePurchased = function (idx, moduleId, multiplier, acc, seen) {
  acc = acc || {};
  seen = seen || [];
  if (!moduleId || seen.indexOf(moduleId) >= 0) return acc;
  seen = seen.concat([moduleId]);

  const links = idx.byModule[moduleId] || [];
  links.forEach(function (l) {
    if (l.child_module_id) {
      const q = l.quantity_override != null ? l.quantity_override : 1;
      DATA.resolvePurchased(idx, l.child_module_id, multiplier * q, acc, seen);
      return;
    }
    const c = idx.components[l.component_id];
    if (!c || c.origin !== 'comprado') return;
    const q = l.quantity_override != null ? l.quantity_override : (c.quantity != null ? c.quantity : 1);
    const key = c.reference || c.id;
    if (!acc[key]) {
      acc[key] = {
        ref: c.reference || '(sem referência)',
        name: (idx.types[c.type_id] && idx.types[c.type_id].name) || c.reference || 'Componente',
        qty: 0,
        component_id: c.id
      };
    }
    acc[key].qty += q * multiplier;
  });
  return acc;
};

/* ============================================================
   Pedidos — a Central de Pedidos
   ============================================================ */

/* Status do portal (public.orders.status) mapeado para o que a fábrica lê.
   Um campo só, dois vocabulários: o cliente vê o rótulo, a fábrica vê o
   mesmo rótulo mais o detalhe das etapas quando o schema erp existir. */
DATA.statusMap = {
  draft:     { label: 'Rascunho',        pill: 'erp-pill-neutral', factory: false },
  submitted: { label: 'Enviado',         pill: 'erp-pill-warn',    factory: true },
  saved:     { label: 'Salvo',           pill: 'erp-pill-neutral', factory: false },
  approved:  { label: 'Aprovado',        pill: 'erp-pill-info',    factory: true },
  paid:      { label: 'Pago',            pill: 'erp-pill-accent',  factory: true },
  delivered: { label: 'Entregue',        pill: 'erp-pill-ok',      factory: true }
};

/* ============================================================
   Os três estágios do pedido no vocabulário da fábrica
   ============================================================
   Definido pelo Matt em 2026-08-08. NÃO é um campo no banco: é derivado de
   duas informações independentes, porque são dois atos de duas pessoas.

     ORÇAMENTO   — o cliente ainda não aprovou (draft, saved, submitted).
                   Não existe pra fábrica. Enviar não é aprovar: 'submitted' é
                   o cliente mandando você olhar, não mandando fabricar.
     IMPLANTADO  — o cliente aprovou (status 'approved', migration 047) e o
                   pedido travou. Entrou na fábrica, mas ainda não pode cortar.
     APROVADO    — o financeiro liberou (finance_released_at, migration 082).
                   Só a partir daqui o pedido pode entrar em lote.

   Cuidado com a colisão de nomes: status='approved' no banco é o CLIENTE
   aprovando; "Aprovado" na tela é o FINANCEIRO liberando. O rótulo é o do
   Matt, o campo é o do banco, e é esta função que faz a tradução — em um
   lugar só, de propósito. */
DATA.STAGES = {
  orcamento:  { label: 'Orçamento',  pill: 'erp-pill-neutral', factory: false },
  implantado: { label: 'Implantado', pill: 'erp-pill-warn',    factory: true },
  aprovado:   { label: 'Aprovado',   pill: 'erp-pill-ok',      factory: true }
};

DATA.stage = function (order) {
  if (!order) return 'orcamento';
  if (order.finance_released_at) return 'aprovado';
  if (order.status === 'approved' || order.status === 'paid' || order.status === 'delivered') return 'implantado';
  return 'orcamento';
};

DATA.stageInfo = function (order) {
  return DATA.STAGES[DATA.stage(order)];
};

DATA.typeMap = {
  modules:      { label: 'Módulos',       pill: 'erp-pill-neutral' },
  cutting_list: { label: 'Plano de corte', pill: 'erp-pill-info' },
  project:      { label: 'Projeto',       pill: 'erp-pill-accent' }
};

/* Nomes das cores de um item do pedido, sem repetir.
 *
 * Desde a migration 035 a cor não é mais caixa+porta em duas colunas: é a
 * lista selected_colors, um papel por entrada (caixa, porta, painel, o que o
 * cadastro tiver). Ler isso em um lugar só evita que cada tela invente o
 * próprio jeito — e evita voltar a pedir coluna que não existe. */
DATA.itemColorNames = function (item) {
  const lista = (item && item.selected_colors) || [];
  const nomes = [];
  lista.forEach(function (c) {
    const nome = c && c.color_name;
    if (nome && nomes.indexOf(nome) === -1) nomes.push(nome);
  });
  return nomes;
};

DATA.orders = async function () {
  const { data, error } = await DATA.sb()
    .from('orders')
    /* selected_colors, e NÃO box_color_name/door_color_name: a migration 035
       apagou aquelas duas colunas quando as cores viraram papéis (um módulo
       pode ter caixa, porta, painel, quantos papéis o cadastro tiver — duas
       colunas fixas não davam conta). O formato é
       [{role_id, role_name, color_id, color_name}, ...], com os nomes
       copiados para o histórico continuar legível se a cor for renomeada.

       Pedir uma coluna que não existe derruba a consulta INTEIRA no Postgres,
       então isto aqui não deixava nenhum pedido aparecer no ERP. */
    .select('*, order_items(id, module_id, module_name, quantity, unit_price, total_price, selected_colors, width_mm, height_mm, depth_mm)')
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) throw error;
  return data || [];
};

DATA.order = async function (id) {
  const { data, error } = await DATA.sb()
    .from('orders').select('*, order_items(*)').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;

  (data.order_items || []).sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); });

  /* Lista de compras do pedido: soma a árvore de cada item */
  const idx = await DATA.componentIndex();
  const acc = {};
  (data.order_items || []).forEach(function (it) {
    if (!it.module_id) return;
    DATA.resolvePurchased(idx, it.module_id, it.quantity || 1, acc, []);
  });
  data._purchased = Object.keys(acc).map(function (k) { return acc[k]; })
    .sort(function (a, b) { return b.qty - a.qty; });

  /* Alguns itens podem não resolver (módulo excluído do catálogo depois do
     pedido — module_id é "on delete set null"). Isso é informação, não erro. */
  data._unresolved = (data.order_items || []).filter(function (it) { return !it.module_id; }).length;

  return data;
};

/* ============================================================
   Liberação financeira (migration 082)
   ============================================================ */

/* Pedidos que interessam ao financeiro: os que o cliente já aprovou. Traz o
   valor junto, e o valor vem de dois lugares diferentes conforme o tipo —
   pedido de módulo soma order_items.total_price, pedido de planilha soma
   cutting_list_items.total_price (são tabelas irmãs, migration 051). Somar só
   uma delas faria metade dos pedidos aparecer valendo zero. */
DATA.financeOrders = async function () {
  const sb = DATA.sb();
  /* select('*') no pedido: coluna de migration pendente derruba a consulta
     inteira, e a lista de migrations não está no mesmo pé em todo banco. */
  const { data: orders, error } = await sb
    .from('orders')
    .select('*, order_items(total_price)')
    .in('status', ['approved', 'paid', 'delivered'])
    .order('created_at', { ascending: false }).limit(300);
  if (error) throw error;

  const cutIds = (orders || []).filter(function (o) { return o.order_type === 'cutting_list'; }).map(function (o) { return o.id; });
  const cutTotals = {};
  if (cutIds.length) {
    const { data: items, error: e2 } = await sb
      .from('cutting_list_items').select('order_id, total_price').in('order_id', cutIds);
    if (e2) throw e2;
    (items || []).forEach(function (i) {
      cutTotals[i.order_id] = (cutTotals[i.order_id] || 0) + Number(i.total_price || 0);
    });
  }

  (orders || []).forEach(function (o) {
    o._value = o.order_type === 'cutting_list'
      ? (cutTotals[o.id] || 0)
      : (o.order_items || []).reduce(function (s, i) { return s + Number(i.total_price || 0); }, 0);
  });
  return orders || [];
};

/* Liberar / desfazer. O update devolve as linhas afetadas de propósito: RLS
   negando UPDATE não dá erro, devolve VAZIO — sem esta checagem o botão
   diria "liberado" e nada teria acontecido. Se cair aqui, o que falta é a
   policy "admin update orders" da migration 082. */
DATA.setFinanceRelease = async function (orderId, released, note) {
  const patch = released
    ? {
        finance_released_at: new Date().toISOString(),
        finance_released_by: DATA.user ? DATA.user.id : null,
        finance_release_note: note || null
      }
    : { finance_released_at: null, finance_released_by: null, finance_release_note: null };

  const { data, error } = await DATA.sb().from('orders').update(patch).eq('id', orderId).select('id');
  if (error) throw error;
  if (!data || !data.length) {
    throw new Error('O banco aceitou a chamada mas não alterou nenhuma linha — ' +
      'isso é o RLS bloqueando a escrita. Falta a policy "admin update orders" ' +
      '(database/migration_082_liberacao_financeiro.sql).');
  }
  return data[0];
};

/* ============================================================
   Projetos — user_projects (admin lê via migration 078)
   ============================================================ */
DATA.projects = async function () {
  // profilesRes junta client_user_id -> nome/e-mail (pedido do Matt
  // 2026-09-04: "quero ver todos os projetos salvos" — antes a Central de
  // Projetos listava os projetos sem dizer de QUEM era cada um). Erro em
  // profilesRes não derruba a tela: os projetos continuam aparecendo, só
  // ficam sem o nome do cliente (mesma tolerância de CT.load, que também
  // trata user_profiles como informação auxiliar, não fonte de verdade).
  const [projectsRes, profilesRes] = await Promise.all([
    DATA.sb().from('user_projects').select('*').order('updated_at', { ascending: false }).limit(200),
    DATA.sb().from('user_profiles').select('user_id, email, full_name')
  ]);
  if (projectsRes.error) throw projectsRes.error;

  const profilesByUser = {};
  (profilesRes.data || []).forEach(function (p) { profilesByUser[p.user_id] = p; });

  return (projectsRes.data || []).map(function (p) {
    const perfil = profilesByUser[p.client_user_id];
    p.client_name = perfil ? (perfil.full_name || perfil.email) : null;
    p.client_email = perfil ? perfil.email : null;
    return p;
  });
};

DATA.project = async function (id) {
  const { data, error } = await DATA.sb()
    .from('user_projects').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
};

/* ============================================================
   Utilidades
   ============================================================ */

/* Nome do cliente: orders guarda uma CÓPIA (client_name/client_email) tirada
   no momento do envio. É de propósito — o histórico do pedido não muda se o
   perfil for renomeado depois. Aqui a cópia é a fonte. */
DATA.clientLabel = function (o) {
  return o.client_name || o.client_email || '(sem identificação)';
};

DATA.orderTotal = function (o) {
  return (o.order_items || []).reduce(function (s, i) {
    return s + Number(i.total_price || 0);
  }, 0);
};

DATA.orderQty = function (o) {
  return (o.order_items || []).reduce(function (s, i) { return s + (i.quantity || 1); }, 0);
};

/* Erro do Supabase em linguagem de gente. O caso mais comum aqui não é bug
   de código: é migration que ainda não rodou neste banco. */
DATA.explainError = function (err) {
  const msg = (err && err.message) || String(err);
  if (/relation .* does not exist/i.test(msg)) {
    return 'Uma tabela consultada não existe neste banco — provavelmente falta rodar alguma migration. Detalhe: ' + msg;
  }
  if (/column .* does not exist/i.test(msg)) {
    /* Este texto já mandou pro lado errado uma vez: dizia "migration
       pendente" quando a causa real era o oposto — o front pedindo uma
       coluna que uma migration ANTIGA apagou de propósito
       (order_items.box_color_name, apagada na 035). As duas hipóteses são
       igualmente prováveis, então a mensagem apresenta as duas e aponta o
       comando que decide entre elas. */
    return 'O banco não tem uma coluna que a tela pediu — e o Postgres derruba a consulta inteira por causa de uma só. ' +
      'Pode ser migration que falta rodar, ou coluna que já foi apagada e o código continua pedindo. ' +
      'Para saber qual dos dois: rode "node scripts/conferir-colunas.js". Detalhe: ' + msg;
  }
  if (/JWT|not authenticated|Invalid login/i.test(msg)) {
    return 'Sessão inválida ou expirada. Entre de novo.';
  }
  return msg;
};
