/* Legno ERP — Central de Contatos e Perfis de Acesso (telas).
 *
 * DADO REAL desde a migration 084. Antes disso esta tela era um mockup com
 * dado fictício (erp/js/mock-contatos.js, apagado) — se algo aqui parecer
 * herdado do mockup, é porque o desenho foi validado lá antes de virar banco.
 *
 * A regra que a tela precisa deixar óbvia o tempo todo:
 * CONTATO (quem é) e CONTA DE ACESSO (como entra) são coisas separadas,
 * ligadas por um vínculo opcional. Fornecedor tem contato sem conta;
 * operador tem conta sem nunca ter feito pedido.
 *
 * Padrão de tela do ERP: função `load` busca, função de render devolve HTML,
 * ação escreve e chama APP.render(). Sem estado escondido entre um e outro —
 * o que está na tela é sempre o que acabou de sair do banco.
 */

const ScreensContatos = {};

/* Guarda o último payload para as ações (que rodam fora do render) poderem
   achar o contato/perfil sem ir no banco de novo. */
ScreensContatos._d = null;

ScreensContatos.load = async function () {
  const d = await CT.load();
  ScreensContatos._d = d;
  return d;
};

ScreensContatos.byId = function (id) {
  const d = ScreensContatos._d || { contatos: [] };
  return d.contatos.find(function (c) { return c.id === id; }) || null;
};

/* ============================================================
   Helpers de tela
   ============================================================ */
ScreensContatos.toast = function (msg, isError) {
  const el = document.getElementById('ct-toast');
  if (!el) { if (isError) alert(msg); return; }
  el.className = isError ? 'erp-error' : 'erp-note';
  el.innerHTML = isError
    ? '<div class="erp-error-title">Não deu certo</div><div class="erp-error-detail">' + UI.esc(msg) + '</div>'
    : UI.esc(msg);
  el.style.display = 'block';
  if (!isError) setTimeout(function () { el.style.display = 'none'; }, 4000);
};

/* Toda escrita passa por aqui: mostra o erro explicado em vez de sumir com o
   clique. CT.explainError sabe dizer "falta rodar a 084" e "falta expor o
   schema erp", que são os dois enganos prováveis. */
ScreensContatos._do = async function (fn, msgOk) {
  try {
    await fn();
    /* O aviso vem DEPOIS do render: APP.render troca o innerHTML inteiro e
       levaria junto qualquer toast mostrado antes. */
    await APP.render();
    if (msgOk) ScreensContatos.toast(msgOk);
  } catch (err) {
    console.error(err);
    ScreensContatos.toast(CT.explainError(err), true);
  }
};

ScreensContatos.fecharForm = function () {
  const el = document.getElementById('ct-form');
  if (el) el.innerHTML = '';
};

ScreensContatos.filtrar = function (q) {
  const t = (q || '').toLowerCase();
  const tb = document.querySelector('#ct-tabela tbody');
  if (!tb) return;
  tb.querySelectorAll('tr').forEach(function (tr) {
    tr.style.display = !t || tr.textContent.toLowerCase().indexOf(t) >= 0 ? '' : 'none';
  });
};

ScreensContatos.val = function (id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
};

ScreensContatos.checked = function (id) {
  const el = document.getElementById(id);
  return !!(el && el.checked);
};

ScreensContatos.pillPapel = function (p) {
  const info = CT.PAPEIS[p];
  if (!info) return UI.pill(p, 'erp-pill-neutral');
  return '<span class="erp-pill ' + info.pill + '" style="margin-right:3px">' + UI.esc(info.label) + '</span>';
};

ScreensContatos.quando = function (ts) {
  if (!ts) return 'nunca entrou';
  const d = new Date(ts);
  if (isNaN(d)) return String(ts);
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

/* ============================================================
   Lista de contatos
   ============================================================ */
ScreensContatos.lista = function (params, d) {
  const filtro = (params && params.papel) || 'todos';
  const todos = d.contatos;

  const lista = filtro === 'todos' ? todos
    : filtro === 'sem_papel' ? todos.filter(function (c) { return !c.papeis.length; })
    : todos.filter(function (c) { return c.papeis.indexOf(filtro) >= 0; });

  const comConta = todos.filter(function (c) { return c.conta; }).length;
  const semConta = todos.length - comConta;
  const semPapel = todos.filter(function (c) { return !c.papeis.length; }).length;
  const nOver = CT.totalOverrides(todos);

  const chaves = ['todos'].concat(CT.PAPEL_ORDEM).concat(semPapel ? ['sem_papel'] : []);
  const abas = chaves.map(function (k) {
    const n = k === 'todos' ? todos.length
      : k === 'sem_papel' ? semPapel
      : todos.filter(function (c) { return c.papeis.indexOf(k) >= 0; }).length;
    const label = k === 'todos' ? 'Todos' : k === 'sem_papel' ? 'Sem papel' : CT.PAPEIS[k].label;
    return '<a href="#/contatos?papel=' + k + '" class="' + (k === filtro ? 'active' : '') + '">' +
      UI.esc(label) + ' <span class="erp-xs erp-muted">' + n + '</span></a>';
  }).join('');

  const rows = lista.map(function (c) {
    const perfil = c.conta ? CT.perfilById(c.conta.perfil_id, d.perfis) : null;
    const nOv = c.conta && c.conta.overrides ? Object.keys(c.conta.overrides).length : 0;
    return {
      _href: '#/contatos/' + c.id,
      nome: '<span class="erp-strong">' + UI.esc(c.nome) + '</span>' +
        (c.pessoa_contato ? '<div class="erp-xs erp-muted">' + UI.esc(c.pessoa_contato) + '</div>' : '') +
        '<div class="erp-xs erp-muted">' + (c.tipo === 'empresa' ? 'Empresa' : 'Pessoa') +
        (c.ativo === false ? ' · <span class="erp-pill erp-pill-neutral">inativo</span>' : '') + '</div>',
      papeis: c.papeis.length
        ? c.papeis.map(ScreensContatos.pillPapel).join('')
        : '<span class="erp-muted erp-xs">— sem papel —</span>',
      contato: UI.esc(c.email || '—') +
        (c.telefone ? '<div class="erp-xs erp-muted">' + UI.esc(c.telefone) + '</div>' : ''),
      cidade: UI.esc(c.cidade || '—'),
      acesso: c.conta
        ? (c.conta.ativa === false ? UI.pill('acesso suspenso', 'erp-pill-danger') + ' ' : '') +
          UI.pill(perfil ? perfil.nome : 'sem perfil', perfil ? 'erp-pill-accent' : 'erp-pill-warn') +
          (nOv ? ' <span class="erp-pill erp-pill-warn erp-xs">' + nOv + ' exceção' + (nOv > 1 ? 'ões' : '') + '</span>' : '') +
          '<div class="erp-xs erp-muted">' + UI.esc(ScreensContatos.quando(c.conta.ultimo_acesso)) + '</div>'
        : '<span class="erp-muted erp-small">sem login</span>',
      desde: UI.date(c.created_at)
    };
  });

  return UI.head('Central de Contatos',
    'Um cadastro só para cliente, dealer, fornecedor, transportadora e time interno. ' +
    'O que muda entre eles é o <span class="erp-strong">papel</span>, não a tabela.',
    '<a class="erp-btn erp-btn-secondary" href="#/perfis">Perfis de acesso</a>' +
    '<button onclick="ScreensContatos.novoContato()">+ Novo contato</button>') +
    '<div id="ct-toast" style="display:none"></div>' +
    UI.sourceNote('<span class="erp-strong">Contato não é login.</span> São duas coisas ligadas por um vínculo opcional — ' +
      'por isso um fornecedor aparece aqui sem acesso, e um operador aparece com acesso sem nunca ter feito pedido. ' +
      'Esta lista já junta o que estava separado em <span class="erp-mono">user_profiles</span> (portal), ' +
      '<span class="erp-mono">crm_clients</span> (CRM) e <span class="erp-mono">admin_users</span> (allow-list de admin).') +
    '<div class="erp-grid erp-grid-4" style="margin-bottom:18px">' +
    UI.kpi('Contatos', todos.length, CT.PAPEL_ORDEM.length + ' papéis possíveis') +
    UI.kpi('Com acesso', comConta, semConta + ' sem login') +
    UI.kpi('Papel duplo', todos.filter(function (c) { return c.papeis.length > 1; }).length,
      'cliente e fornecedor ao mesmo tempo') +
    UI.kpi('Exceções de permissão', nOver,
      nOver > 5 ? '<span class="erp-pill erp-pill-warn">talvez falte um perfil</span>' : 'ajustes a dedo') +
    '</div>' +
    '<div id="ct-form"></div>' +
    '<div class="erp-tabs">' + abas + '</div>' +
    UI.panel(null, '<div class="erp-toolbar">' +
      '<input type="search" placeholder="Nome, e-mail ou cidade…" oninput="ScreensContatos.filtrar(this.value)">' +
      '<span class="erp-spacer"></span>' +
      '<span class="erp-muted erp-small">' + lista.length + ' contato(s)</span></div>' +
      '<div id="ct-tabela">' + UI.table([
        { key: 'nome', label: 'Contato' },
        { key: 'papeis', label: 'Papéis' },
        { key: 'contato', label: 'E-mail / telefone' },
        { key: 'cidade', label: 'Cidade' },
        { key: 'acesso', label: 'Acesso ao sistema' },
        { key: 'desde', label: 'Desde' }
      ], rows) + '</div>', true) +
    (semPapel ? UI.panel('Contatos sem papel',
      '<div class="erp-muted erp-small">Tem ' + semPapel + ' contato(s) sem nenhum papel marcado. ' +
      'Costuma ser cadastro que veio do portal e nunca comprou nada — não é erro, mas ele não vai aparecer ' +
      'em nenhuma aba filtrada. <a href="#/contatos?papel=sem_papel">Ver quem são</a>.</div>') : '') +
    UI.panel('Por que papel é lista e não coluna',
      '<div class="erp-grid erp-grid-2">' +
      '<div><div class="erp-strong erp-small">O caso que quebra o modelo simples</div>' +
      '<div class="erp-muted erp-small">Uma marcenaria pode comprar módulo pronto da gente <span class="erp-strong">e</span> prestar ' +
      'serviço de usinagem quando a fábrica lota. Com tabela separada de cliente e de fornecedor, ' +
      'ela vira dois cadastros — e aí o telefone muda em um e fica velho no outro.</div></div>' +
      '<div><div class="erp-strong erp-small">O que isso custa</div>' +
      '<div class="erp-muted erp-small">Toda consulta que faria <span class="erp-mono">where tipo = \'fornecedor\'</span> ' +
      'passa a precisar de um join na tabela de papéis. É mais uma tabela e mais um join — ' +
      'o preço de não ter cadastro duplicado.</div></div>' +
      '</div>');
};

/* ============================================================
   Formulário de contato (novo / editar)
   ============================================================ */
ScreensContatos.novoContato = function () { ScreensContatos._formContato(null); };
ScreensContatos.editarContato = function (id) { ScreensContatos._formContato(ScreensContatos.byId(id)); };

ScreensContatos._formContato = function (c) {
  const alvo = document.getElementById('ct-form');
  if (!alvo) return;
  const v = function (k) { return c && c[k] ? UI.esc(c[k]) : ''; };
  const tipo = c ? c.tipo : 'pessoa';

  alvo.innerHTML = UI.panel(c ? 'Editar contato' : 'Novo contato',
    '<div class="erp-grid erp-grid-3">' +
    '<label class="erp-field"><span>Tipo</span><select id="ct-tipo">' +
      '<option value="pessoa"' + (tipo === 'pessoa' ? ' selected' : '') + '>Pessoa</option>' +
      '<option value="empresa"' + (tipo === 'empresa' ? ' selected' : '') + '>Empresa</option>' +
    '</select></label>' +
    '<label class="erp-field"><span>Nome</span><input type="text" id="ct-nome" value="' + v('nome') + '"></label>' +
    '<label class="erp-field"><span>Pessoa de contato</span><input type="text" id="ct-pessoa" value="' + v('pessoa_contato') +
      '" placeholder="quando o cadastro é uma empresa"></label>' +
    '<label class="erp-field"><span>E-mail</span><input type="email" id="ct-email" value="' + v('email') + '"></label>' +
    '<label class="erp-field"><span>Telefone</span><input type="text" id="ct-telefone" value="' + v('telefone') + '"></label>' +
    '<label class="erp-field"><span>Cidade</span><input type="text" id="ct-cidade" value="' + v('cidade') + '"></label>' +
    '<label class="erp-field"><span>Endereço</span><input type="text" id="ct-endereco" value="' + v('endereco') + '"></label>' +
    '<label class="erp-field"><span>Documento</span><input type="text" id="ct-doc" value="' + v('doc') + '" placeholder="CNPJ / EIN"></label>' +
    '</div>' +
    (c ? '' : '<div style="margin-top:12px"><div class="erp-strong erp-small" style="margin-bottom:6px">Papéis</div>' +
      '<div style="display:flex;gap:14px;flex-wrap:wrap">' + CT.PAPEL_ORDEM.map(function (p) {
        return '<label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="ct-papel-' + p + '"> ' +
          '<span class="erp-small">' + UI.esc(CT.PAPEIS[p].label) + '</span></label>';
      }).join('') + '</div></div>') +
    '<label class="erp-field" style="margin-top:12px"><span>Observações</span>' +
      '<textarea id="ct-notes" rows="2">' + (c && c.notes ? UI.esc(c.notes) : '') + '</textarea></label>' +
    (c ? '<label style="display:flex;gap:8px;align-items:center;margin-top:10px">' +
      '<input type="checkbox" id="ct-ativo"' + (c.ativo !== false ? ' checked' : '') + '> ' +
      '<span class="erp-small">Contato ativo</span></label>' : '') +
    '<div class="erp-note" style="margin-top:12px">O e-mail é a chave da unificação — é por ele que o banco ' +
      'impede o mesmo contato de existir duas vezes. Contato sem e-mail é permitido (fornecedor de galpão, ' +
      'transportadora), só não dá pra dar acesso a ele depois sem preencher.</div>' +
    '<div style="display:flex;gap:8px;margin-top:12px">' +
    '<button onclick="ScreensContatos.salvarContato(' + (c ? "'" + c.id + "'" : 'null') + ')">Salvar</button>' +
    '<button class="erp-btn-secondary" onclick="ScreensContatos.fecharForm()">Cancelar</button>' +
    (c ? '<span class="erp-spacer"></span><button class="erp-btn-ghost" onclick="ScreensContatos.excluirContato(\'' + c.id + '\')">Excluir contato</button>' : '') +
    '</div>');
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

ScreensContatos.salvarContato = function (id) {
  const patch = {
    tipo: ScreensContatos.val('ct-tipo') || 'pessoa',
    nome: ScreensContatos.val('ct-nome'),
    pessoa_contato: ScreensContatos.val('ct-pessoa'),
    email: ScreensContatos.val('ct-email'),
    telefone: ScreensContatos.val('ct-telefone'),
    cidade: ScreensContatos.val('ct-cidade'),
    endereco: ScreensContatos.val('ct-endereco'),
    doc: ScreensContatos.val('ct-doc'),
    notes: ScreensContatos.val('ct-notes')
  };
  if (document.getElementById('ct-ativo')) patch.ativo = ScreensContatos.checked('ct-ativo');
  if (!patch.nome) { ScreensContatos.toast('O contato precisa de um nome.', true); return; }

  const papeis = id ? [] : CT.PAPEL_ORDEM.filter(function (p) { return ScreensContatos.checked('ct-papel-' + p); });

  ScreensContatos._do(async function () {
    if (id) {
      await CT.salvarContato(id, patch);
    } else {
      const novo = await CT.criarContato(patch);
      for (let i = 0; i < papeis.length; i++) await CT.setPapel(novo.id, papeis[i], true);
    }
  }, 'Contato salvo.');
};

ScreensContatos.excluirContato = function (id) {
  const c = ScreensContatos.byId(id);
  if (!c) return;
  const aviso = c.conta
    ? 'Isto apaga o CONTATO e o vínculo de acesso dele. O login no Auth continua existindo ' +
      '(ninguém perde a senha), mas ele some do back-office.\n\n'
    : '';
  if (!confirm(aviso + 'Excluir "' + c.nome + '" de vez?')) return;
  ScreensContatos._do(async function () {
    await CT.excluirContato(id);
    location.hash = '#/contatos';
  }, 'Contato excluído.');
};

/* ============================================================
   Ficha do contato
   ============================================================ */
ScreensContatos.ficha = function (params, d) {
  const c = ScreensContatos.byId(params.id);
  if (!c) {
    return UI.crumb([{ label: 'Contatos', href: '#/contatos' }, { label: '?' }]) +
      '<div class="erp-empty">Contato não encontrado. Ele pode ter sido excluído em outra aba.</div>';
  }

  return UI.crumb([{ label: 'Contatos', href: '#/contatos' }, { label: c.nome }]) +
    UI.head(c.nome,
      (c.papeis.length ? c.papeis.map(function (p) { return CT.PAPEIS[p].label; }).join(' · ') : 'sem papel') +
      (c.email ? ' · ' + UI.esc(c.email) : ''),
      '<button class="erp-btn-secondary" onclick="ScreensContatos.editarContato(\'' + c.id + '\')">Editar</button>') +
    '<div id="ct-toast" style="display:none"></div>' +
    '<div id="ct-form"></div>' +
    '<div class="erp-grid erp-grid-side"><div>' +
    ScreensContatos._painelAcesso(c, d) +
    ScreensContatos._painelPortal(c) +
    (c.notes ? UI.panel('Observações', '<div class="erp-small">' + UI.esc(c.notes) + '</div>') : '') +
    '</div><div>' +
    ScreensContatos._painelDados(c) +
    ScreensContatos._painelPapeis(c) +
    ScreensContatos._painelNumeros(c) +
    ScreensContatos._painelOrigem(c) +
    '</div></div>';
};

ScreensContatos._painelDados = function (c) {
  return UI.panel('Dados', UI.def([
    ['Tipo', c.tipo === 'empresa' ? 'Empresa' : 'Pessoa'],
    ['Nome', UI.esc(c.nome)],
    ['Responsável', c.pessoa_contato ? UI.esc(c.pessoa_contato) : '—'],
    ['E-mail', c.email ? UI.esc(c.email) : '—'],
    ['Telefone', c.telefone ? UI.esc(c.telefone) : '—'],
    ['Cidade', UI.esc(c.cidade || '—')],
    ['Endereço', UI.esc(c.endereco || '—')],
    ['Documento', c.doc ? '<span class="erp-mono erp-small">' + UI.esc(c.doc) + '</span>' : '—'],
    ['Desde', UI.date(c.created_at)],
    ['Situação', c.ativo === false ? UI.pill('Inativo', 'erp-pill-neutral') : UI.pill('Ativo', 'erp-pill-ok')]
  ]));
};

/* Papel liga e desliga na hora — é uma marcação, não um formulário. Salvar em
   dois passos aqui só criaria a chance de esquecer o segundo. */
ScreensContatos._painelPapeis = function (c) {
  return UI.panel('Papéis',
    CT.PAPEL_ORDEM.map(function (p) {
      const tem = c.papeis.indexOf(p) >= 0;
      return '<label style="display:flex;gap:8px;align-items:flex-start;padding:7px 0;border-bottom:1px solid #f4f1eb;cursor:pointer">' +
        '<input type="checkbox"' + (tem ? ' checked' : '') +
        ' onchange="ScreensContatos.togglePapel(\'' + c.id + '\',\'' + p + '\',this.checked)">' +
        '<span style="flex:1"><span class="erp-pill ' + CT.PAPEIS[p].pill + '">' + UI.esc(CT.PAPEIS[p].label) + '</span>' +
        '<div class="erp-muted erp-xs" style="margin-top:3px">' + UI.esc(CT.PAPEIS[p].desc) + '</div></span></label>';
    }).join(''));
};

ScreensContatos.togglePapel = function (contatoId, papel, ligado) {
  ScreensContatos._do(function () { return CT.setPapel(contatoId, papel, ligado); });
};

ScreensContatos._painelNumeros = function (c) {
  if (!c.stats) {
    return UI.panel('Números',
      '<div class="erp-muted erp-small">Nada ainda. Os números vêm dos pedidos e projetos do portal ' +
      '(<span class="erp-mono">public.orders</span> e <span class="erp-mono">public.user_projects</span>), ' +
      'e só existem para contato com login vinculado.</div>');
  }
  return UI.panel('Números', UI.def([
    ['Pedidos', c.stats.pedidos],
    ['Projetos', c.stats.projetos],
    ['Valor em projetos', UI.money(c.stats.valor)]
  ]) + '<div class="erp-muted erp-xs" style="margin-top:8px">Leitura direta do portal — o ERP não guarda cópia disso.</div>');
};

ScreensContatos._painelOrigem = function (c) {
  const de = {
    user_profiles: 'user_profiles (conta do portal)',
    crm_clients: 'crm_clients (cadastro do CRM)',
    admin_users: 'admin_users (allow-list de admin)',
    erp: 'cadastrado aqui no back-office'
  };
  return UI.panel('De onde veio',
    '<div class="erp-mono erp-small">' + UI.esc(de[c.origem] || c.origem || '—') + '</div>' +
    (c.crm_client_id ? '<div class="erp-muted erp-xs" style="margin-top:6px">Ligado ao registro do CRM — ' +
      'o histórico de reuniões dele continua na aba "Clientes (CRM)" do admin até ela ser trazida pra cá.</div>' : '') +
    '<div class="erp-muted erp-xs" style="margin-top:8px">Enquanto o admin.html ainda editar as tabelas antigas, ' +
    'uma mudança lá não aparece aqui sozinha — rodar de novo o backfill da migration 084 reconcilia.</div>');
};

/* ============================================================
   Perfil NO PORTAL — pergunta DIFERENTE do "Acesso ao sistema" logo
   abaixo (aquele é ERP: perfil_id/permissões do back-office; isto é
   user_profiles.role, o que a PESSOA vê logada no site). Painel
   SEPARADO de propósito — "não quero que os perfis do portal se
   misturem com os do ERP", pedido do Matt (2026-09-02) que motivou esta
   unificação (Central de Contatos, migration 084/150). Antes, a Única
   tela que trocava isto era a aba antiga "Perfis"
   (erp/js/adm/03-usuarios.js) — agora ela é só um link pra cá.
   ============================================================ */
ScreensContatos._painelPortal = function (c) {
  const conta = c.conta;
  if (!conta || !conta.user_id || typeof conta.portal_role === 'undefined') {
    return UI.panel('Perfil no portal',
      '<div class="erp-muted erp-small">Este contato não tem perfil no portal — só acesso ao ERP (ou nenhum login ainda).</div>');
  }

  const role = conta.portal_role;
  const souVendedor = role === 'vendedor';
  const opts = CT.PORTAL_ROLES_ATRIBUIVEIS.map(function (r) {
    return '<option value="' + r + '"' + (r === role ? ' selected' : '') + '>' + UI.esc(CT.PORTAL_ROLE_LABELS[r]) + '</option>';
  }).join('');

  // Vendedor é sempre criado pela própria loja Dealer (self-service, "Minha
  // Equipe") — não entra nas opções do <select> (CT.PORTAL_ROLES_ATRIBUIVEIS
  // não o lista), então quando já é vendedor mostra só-leitura em vez de um
  // select que não teria a própria opção atual dentro dele.
  const campoRole = souVendedor
    ? '<input type="text" value="Vendedor" readonly>' +
      '<div class="erp-muted erp-xs" style="margin-top:4px">Vendedor é sempre criado pela própria loja Dealer, em "Minha Equipe" — não dá pra promover ninguém a vendedor por aqui.</div>'
    : '<select onchange="ScreensContatos.trocarRolePortal(\'' + c.id + '\', this.value)">' + opts + '</select>';

  // Logo só faz sentido pra quem é Dealer no portal (é o que
  // js/portal-05-cutlist.js:uploadDealerLogo grava, e é o que a Proposta do
  // dealer usa) — condicionado no portal_role, não no papel do ERP, porque
  // é exatamente essa coluna (user_profiles.logo_url) que está em jogo.
  const logoBox = role === 'lojista'
    ? '<div style="margin-top:14px;padding-top:14px;border-top:1px solid #f4f1eb">' +
      '<div class="erp-strong erp-small" style="margin-bottom:8px">Logo da loja (Dealer)</div>' +
      '<div style="display:flex;align-items:center;gap:12px">' +
      (conta.portal_logo_url
        ? '<img src="' + UI.esc(conta.portal_logo_url) + '" alt="" style="height:44px;max-width:120px;object-fit:contain;border:1px solid #ddd;border-radius:4px;background:#fff">'
        : '<span class="erp-muted erp-xs">sem logo ainda</span>') +
      '<input type="file" accept="image/*" onchange="ScreensContatos.uploadLogoDealer(\'' + c.id + '\', this)">' +
      '</div>' +
      '<div class="erp-muted erp-xs" style="margin-top:6px">Aparece na Proposta do dealer, no portal. Normalmente é a própria loja quem envia a dela (Configurações, logada no portal), mas dá pra enviar por aqui também.</div>' +
      '</div>'
    : '';

  return UI.panel('Perfil no portal',
    '<label class="erp-field"><span>O que esta pessoa vê logada no site</span>' + campoRole + '</label>' +
    logoBox);
};

ScreensContatos.trocarRolePortal = function (contatoId, role) {
  const c = ScreensContatos.byId(contatoId);
  if (!c || !c.conta || !c.conta.user_id) return;
  ScreensContatos._do(function () { return CT.trocarRolePortal(c.conta.user_id, role); }, 'Perfil no portal trocado.');
};

ScreensContatos.uploadLogoDealer = function (contatoId, inputEl) {
  const c = ScreensContatos.byId(contatoId);
  const file = inputEl && inputEl.files && inputEl.files[0];
  if (!c || !c.conta || !c.conta.user_id || !file) return;
  ScreensContatos._do(function () { return CT.uploadLogoDealer(c.conta.user_id, file); }, 'Logo enviada.');
};

/* ============================================================
   Painel de acesso — o coração da tela
   ============================================================ */
ScreensContatos._painelAcesso = function (c, d) {
  if (!c.conta) {
    return UI.panel('Acesso ao sistema',
      '<div class="erp-empty" style="padding:24px">' +
      '<div class="erp-strong">Este contato não tem login.</div>' +
      '<div class="erp-small" style="margin-top:6px;max-width:460px;margin-left:auto;margin-right:auto">' +
      'É o caso normal de fornecedor e transportadora: a gente precisa dos dados dele, mas ele não entra no ' +
      'sistema. Conceder acesso é uma ação separada, não um efeito colateral do cadastro.</div>' +
      '<div style="margin-top:14px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap">' +
      '<button onclick="ScreensContatos.formVincular(\'' + c.id + '\')">Vincular um login que já existe</button>' +
      '<button class="erp-btn-secondary" onclick="ScreensContatos.formCriarLogin(\'' + c.id + '\')">Criar login novo</button>' +
      '</div></div>');
  }

  const conta = c.conta;
  const perfil = CT.perfilById(conta.perfil_id, d.perfis);
  const overrides = conta.overrides || {};
  const nOver = Object.keys(overrides).length;

  const opts = '<option value=""' + (conta.perfil_id ? '' : ' selected') + '>— sem perfil —</option>' +
    d.perfis.map(function (p) {
      return '<option value="' + p.id + '"' + (p.id === conta.perfil_id ? ' selected' : '') + '>' + UI.esc(p.nome) + '</option>';
    }).join('');

  const linhas = CT.PERMISSOES.map(function (g) {
    const cels = g.acoes.map(function (a) {
      const chave = g.chave + '.' + a.id;
      const e = CT.efetiva(conta, chave, d.perfis);
      const cls = e.valor ? 'erp-pill-ok' : 'erp-pill-neutral';
      const marca = e.herdado ? '' : ' <span class="erp-pill erp-pill-warn erp-xs">a dedo</span>';
      return '<div style="display:flex;justify-content:space-between;gap:8px;padding:5px 0;border-bottom:1px solid #f4f1eb;cursor:pointer" ' +
        'title="Clique para alternar: herdado → sim → não → herdado" ' +
        'onclick="ScreensContatos.ciclaPermissao(\'' + c.id + '\',\'' + chave + '\')">' +
        '<span class="erp-small">' + UI.esc(a.label) + '</span>' +
        '<span>' + UI.pill(e.valor ? 'sim' : 'não', cls) + marca + '</span></div>';
    }).join('');
    return '<div><div class="erp-strong erp-small" style="margin-bottom:4px">' + UI.esc(g.tela) + '</div>' + cels + '</div>';
  }).join('');

  return UI.panel('Acesso ao sistema',
    '<div class="erp-inline-fields" style="margin-bottom:14px">' +
    '<label class="erp-field"><span>Login</span><input type="text" value="' + UI.esc(conta.login || '—') + '" readonly></label>' +
    '<label class="erp-field"><span>Perfil de acesso</span>' +
      '<select onchange="ScreensContatos.trocarPerfil(\'' + conta.id + '\', this.value)">' + opts + '</select></label>' +
    '<label class="erp-field"><span>Matrícula</span><input type="text" id="ct-matricula" value="' +
      UI.esc(conta.matricula || '') + '" onchange="ScreensContatos.salvarMatricula(\'' + conta.id + '\', this.value)"></label>' +
    '</div>' +
    '<div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-bottom:12px">' +
    '<label style="display:flex;gap:8px;align-items:center">' +
    '<input type="checkbox"' + (conta.ativa !== false ? ' checked' : '') +
    ' onchange="ScreensContatos.toggleConta(\'' + conta.id + '\', this.checked)"> ' +
    '<span class="erp-small"><b>Acesso ativo</b> — desmarcar suspende sem apagar nada</span></label>' +
    '<span class="erp-muted erp-xs">Último acesso: ' + UI.esc(ScreensContatos.quando(conta.ultimo_acesso)) + '</span>' +
    '</div>' +
    '<div class="erp-note">' +
    (!perfil
      ? 'Esta conta está <span class="erp-strong">sem perfil</span> — na prática, sem permissão nenhuma. Escolha um acima.'
      : nOver
        ? 'Esta pessoa tem <span class="erp-strong">' + nOver + ' exceção(ões)</span> por cima do perfil ' +
          '<span class="erp-strong">' + UI.esc(perfil.nome) + '</span>. ' +
          'Exceção é útil, mas se virar rotina é sinal de que falta um perfil novo.'
        : 'Tudo herdado do perfil <span class="erp-strong">' + UI.esc(perfil.nome) + '</span>. ' +
          'Nenhum ajuste individual — é assim que deveria ser na maioria dos casos.') +
    '</div>' +
    '<div class="erp-grid erp-grid-3">' + linhas + '</div>' +
    '<div class="erp-note" style="margin-top:12px"><span class="erp-strong">Isto ainda não é segurança.</span> ' +
    'As permissões já ficam gravadas e a tela obedece, mas nenhuma policy do banco lê essas chaves ainda — ' +
    'quem chamar a API direto continua passando. A função <span class="erp-mono">erp.tem_permissao()</span> ' +
    'já existe (migration 084); falta plugar nas policies.</div>' +
    '<div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">' +
    (nOver ? '<button class="erp-btn-secondary" onclick="ScreensContatos.limparOverrides(\'' + c.id + '\')">Voltar ao perfil</button>' : '') +
    (perfil ? '<a class="erp-btn erp-btn-ghost" href="#/perfis/' + perfil.id + '">Ver perfil ' + UI.esc(perfil.nome) + '</a>' : '') +
    '<span class="erp-spacer"></span>' +
    '<button class="erp-btn-ghost" onclick="ScreensContatos.removerAcesso(\'' + c.id + '\')">Remover acesso</button>' +
    '</div>');
};

/* Ciclo de 3 estados no clique: herdado → sim a dedo → não a dedo → herdado.
   Sem isso não haveria como VOLTAR a herdar depois de ajustar uma vez — o
   estado "sem opinião" precisa ser alcançável, não só inicial. */
ScreensContatos.ciclaPermissao = function (contatoId, chave) {
  const c = ScreensContatos.byId(contatoId);
  if (!c || !c.conta) return;
  const ov = c.conta.overrides || {};
  let proximo;
  if (!Object.prototype.hasOwnProperty.call(ov, chave)) proximo = true;
  else if (ov[chave] === true) proximo = false;
  else proximo = null;
  ScreensContatos._do(function () { return CT.setOverride(c.conta, chave, proximo); });
};

ScreensContatos.limparOverrides = function (contatoId) {
  const c = ScreensContatos.byId(contatoId);
  if (!c || !c.conta) return;
  ScreensContatos._do(function () { return CT.limparOverrides(c.conta); }, 'Exceções apagadas — voltou a herdar o perfil.');
};

ScreensContatos.trocarPerfil = function (contaId, perfilId) {
  ScreensContatos._do(function () { return CT.salvarConta(contaId, { perfil_id: perfilId || null }); }, 'Perfil trocado.');
};

ScreensContatos.salvarMatricula = function (contaId, valor) {
  ScreensContatos._do(function () { return CT.salvarConta(contaId, { matricula: (valor || '').trim() || null }); });
};

ScreensContatos.toggleConta = function (contaId, ativa) {
  ScreensContatos._do(function () { return CT.salvarConta(contaId, { ativa: !!ativa }); },
    ativa ? 'Acesso reativado.' : 'Acesso suspenso.');
};

ScreensContatos.removerAcesso = function (contatoId) {
  const c = ScreensContatos.byId(contatoId);
  if (!c || !c.conta) return;
  if (!confirm('Tirar o acesso de "' + c.nome + '"?\n\nO contato continua no cadastro e o login no Auth não é apagado — ' +
    'dá pra vincular de novo depois. Se a ideia é só bloquear por um tempo, desmarque "Acesso ativo".')) return;
  ScreensContatos._do(function () { return CT.removerConta(c.conta.id); }, 'Acesso removido.');
};

/* ---------- Conceder acesso: vincular login existente ---------- */
ScreensContatos.formVincular = async function (contatoId) {
  const alvo = document.getElementById('ct-form');
  if (!alvo) return;
  alvo.innerHTML = '<div class="erp-loading">Buscando logins do portal…</div>';
  let livres;
  try {
    livres = await CT.loginsDisponiveis();
  } catch (err) {
    alvo.innerHTML = UI.errorBox('Não consegui listar os logins', CT.explainError(err));
    return;
  }
  const d = ScreensContatos._d;
  const perfilOpts = d.perfis.map(function (p) {
    return '<option value="' + p.id + '"' + (p.slug === 'portal' ? ' selected' : '') + '>' + UI.esc(p.nome) + '</option>';
  }).join('');

  alvo.innerHTML = UI.panel('Vincular um login que já existe',
    (livres.length
      ? '<div class="erp-grid erp-grid-2">' +
        '<label class="erp-field"><span>Login do portal</span><select id="ct-login-sel">' +
        livres.map(function (u) {
          return '<option value="' + u.user_id + '|' + UI.esc(u.email || '') + '">' +
            UI.esc(u.email || u.user_id) + (u.full_name ? ' — ' + UI.esc(u.full_name) : '') + '</option>';
        }).join('') + '</select></label>' +
        '<label class="erp-field"><span>Perfil de acesso</span><select id="ct-login-perfil">' + perfilOpts + '</select></label>' +
        '</div>' +
        '<div class="erp-note">A lista só mostra login que ainda não está amarrado a nenhum contato — ' +
        'um login pertence a uma pessoa só.</div>' +
        '<div style="display:flex;gap:8px;margin-top:12px">' +
        '<button onclick="ScreensContatos.vincular(\'' + contatoId + '\')">Vincular</button>' +
        '<button class="erp-btn-secondary" onclick="ScreensContatos.fecharForm()">Cancelar</button></div>'
      : '<div class="erp-empty">Todo login do portal já está vinculado a algum contato. ' +
        'Se é uma pessoa nova, use "Criar login novo".</div>' +
        '<div style="margin-top:10px"><button class="erp-btn-secondary" onclick="ScreensContatos.fecharForm()">Fechar</button></div>'));
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

ScreensContatos.vincular = function (contatoId) {
  const sel = ScreensContatos.val('ct-login-sel');
  if (!sel) return;
  const parte = sel.split('|');
  const perfilId = ScreensContatos.val('ct-login-perfil') || null;
  ScreensContatos._do(function () {
    return CT.vincularLogin(contatoId, parte[0], parte[1], perfilId);
  }, 'Login vinculado.');
};

/* ---------- Conceder acesso: criar login novo ---------- */
ScreensContatos.formCriarLogin = function (contatoId) {
  const c = ScreensContatos.byId(contatoId);
  const alvo = document.getElementById('ct-form');
  if (!c || !alvo) return;
  const d = ScreensContatos._d;

  alvo.innerHTML = UI.panel('Criar login novo para ' + UI.esc(c.nome),
    '<div class="erp-grid erp-grid-2">' +
    '<label class="erp-field"><span>E-mail</span><input type="email" id="ct-new-email" value="' + UI.esc(c.email || '') + '"></label>' +
    '<label class="erp-field"><span>Senha inicial</span><input type="text" id="ct-new-pass" minlength="6" placeholder="mínimo 6 caracteres"></label>' +
    '<label class="erp-field"><span>Perfil de acesso (back-office)</span><select id="ct-new-perfil">' +
      d.perfis.map(function (p) {
        return '<option value="' + p.id + '"' + (p.slug === 'portal' ? ' selected' : '') + '>' + UI.esc(p.nome) + '</option>';
      }).join('') + '</select></label>' +
    '<label class="erp-field"><span>Perfil no portal</span><select id="ct-new-role">' +
      '<option value="cliente">Cliente</option>' +
      '<option value="lojista">Dealer</option>' +
      '<option value="contractor">Contractor</option>' +
      '<option value="administrador">Administrador</option>' +
    '</select></label>' +
    '</div>' +
    '<div class="erp-note">São <span class="erp-strong">duas perguntas diferentes</span>: o perfil do back-office diz o que a ' +
    'pessoa pode fazer aqui na fábrica; o perfil do portal diz o que ela vê do lado do cliente (é ele que libera ' +
    'a aba Plano de Corte e o modo Dealer). Escolha uma senha simples — a pessoa troca depois em Configurações.</div>' +
    '<div style="display:flex;gap:8px;margin-top:12px">' +
    '<button onclick="ScreensContatos.criarLogin(\'' + contatoId + '\')">Criar e vincular</button>' +
    '<button class="erp-btn-secondary" onclick="ScreensContatos.fecharForm()">Cancelar</button></div>');
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

ScreensContatos.criarLogin = function (contatoId) {
  const c = ScreensContatos.byId(contatoId);
  const email = ScreensContatos.val('ct-new-email');
  const pass = ScreensContatos.val('ct-new-pass');
  if (!email || pass.length < 6) {
    ScreensContatos.toast('Precisa de um e-mail e uma senha de pelo menos 6 caracteres.', true);
    return;
  }
  ScreensContatos._do(function () {
    return CT.criarLogin(contatoId, {
      full_name: c ? (c.pessoa_contato || c.nome) : '',
      email: email, password: pass,
      role: ScreensContatos.val('ct-new-role') || 'cliente',
      perfil_id: ScreensContatos.val('ct-new-perfil') || null
    });
  }, 'Login criado e vinculado.');
};

/* ============================================================
   Perfis de acesso — a matriz
   ============================================================ */
ScreensContatos.perfis = function (params, d) {
  const total = CT.todasPermissoes().length;

  const rows = d.perfis.map(function (p) {
    const usuarios = CT.usandoPerfil(d.contatos, p.id);
    const n = p.permissoes === null || p.permissoes === undefined ? total : p.permissoes.length;
    const excecoes = usuarios.reduce(function (s, u) {
      return s + Object.keys((u.conta && u.conta.overrides) || {}).length;
    }, 0);
    return {
      _href: '#/perfis/' + p.id,
      nome: '<span class="erp-strong">' + UI.esc(p.nome) + '</span>' +
        (p.sistema ? ' ' + UI.pill('sistema', 'erp-pill-neutral') : '') +
        '<div class="erp-xs erp-muted">' + UI.esc(p.descricao || '') + '</div>' +
        '<div class="erp-xs erp-muted erp-mono">' + UI.esc(p.slug) + '</div>',
      perms: n + ' de ' + total + '<div style="margin-top:4px">' + UI.bar(n / total) + '</div>',
      users: usuarios.length + ' pessoa(s)' +
        (usuarios.length ? '<div class="erp-xs erp-muted">' + usuarios.map(function (u) { return UI.esc(u.nome); }).join(', ') + '</div>' : ''),
      exc: excecoes ? UI.pill(excecoes + ' exceção' + (excecoes > 1 ? 'ões' : ''), 'erp-pill-warn') : '<span class="erp-muted erp-small">nenhuma</span>'
    };
  });

  return UI.head('Perfis de Acesso',
    'O perfil é um <span class="erp-strong">molde</span>: define o que o cargo pode fazer. ' +
    'Cada pessoa herda o molde e pode ter exceções por cima.',
    '<a class="erp-btn erp-btn-secondary" href="#/contatos">Central de Contatos</a>' +
    '<button onclick="ScreensContatos.novoPerfil()">+ Novo perfil</button>') +
    '<div id="ct-toast" style="display:none"></div>' +
    '<div id="ct-form"></div>' +
    UI.panel(null, UI.errorBox('Isto sozinho ainda não é segurança',
      'Esconder botão no front não impede ninguém de chamar a API direto. Estas permissões precisam ser lidas ' +
      'pelo RLS do Postgres — a função erp.tem_permissao(\'pedidos.aprovar\') já existe desde a migration 084, ' +
      'mas nenhuma policy chama ela ainda. Enquanto isso, a tela usa a lista só para decidir o que mostrar.')) +
    UI.panel(null, UI.table([
      { key: 'nome', label: 'Perfil' },
      { key: 'perms', label: 'Permissões', width: '160px' },
      { key: 'users', label: 'Quem usa' },
      { key: 'exc', label: 'Ajustes a dedo' }
    ], rows), true) +
    ScreensContatos._matrizGeral(d);
};

/* Matriz completa: perfis nas colunas, permissões nas linhas */
ScreensContatos._matrizGeral = function (d) {
  const perfis = d.perfis.filter(function (p) { return p.slug !== 'portal'; });

  let h = '<table class="erp-table"><thead><tr><th>Permissão</th>';
  perfis.forEach(function (p) { h += '<th style="text-align:center">' + UI.esc(p.nome) + '</th>'; });
  h += '</tr></thead><tbody>';

  CT.PERMISSOES.forEach(function (g) {
    h += '<tr><td colspan="' + (perfis.length + 1) + '" style="background:#fbfaf8">' +
      '<span class="erp-strong erp-small">' + UI.esc(g.tela) + '</span></td></tr>';
    g.acoes.forEach(function (a) {
      const chave = g.chave + '.' + a.id;
      h += '<tr><td><span class="erp-small">' + UI.esc(a.label) + '</span>' +
        '<div class="erp-xs erp-muted erp-mono">' + UI.esc(chave) + '</div></td>';
      perfis.forEach(function (p) {
        const tem = CT.perfilTem(p, chave);
        h += '<td style="text-align:center">' +
          '<input type="checkbox" ' + (tem ? 'checked' : '') + ' ' + (p.sistema ? 'disabled' : '') +
          ' onchange="ScreensContatos.togglePermissao(\'' + p.id + '\',\'' + chave + '\',this.checked)"' +
          ' style="width:16px;height:16px;accent-color:var(--accent)">' +
          '</td>';
      });
      h += '</tr>';
    });
  });
  h += '</tbody></table>';

  return UI.panel('Matriz completa',
    '<div class="erp-note">Cada linha é uma permissão do tipo <span class="erp-mono">tela.ação</span> — ' +
    'o mesmo identificador que a policy do banco vai checar. ' +
    'O perfil Administrador vem travado porque desmarcar algo nele tranca você mesmo pra fora.</div>' +
    '<div style="overflow-x:auto">' + h + '</div>');
};

ScreensContatos.togglePermissao = function (perfilId, chave, ligado) {
  const d = ScreensContatos._d;
  const p = CT.perfilById(perfilId, d.perfis);
  if (!p || p.sistema) return;
  const atual = (p.permissoes || []).slice();
  const i = atual.indexOf(chave);
  if (ligado && i < 0) atual.push(chave);
  if (!ligado && i >= 0) atual.splice(i, 1);
  ScreensContatos._do(function () { return CT.salvarPerfil(perfilId, { permissoes: atual }); });
};

ScreensContatos.novoPerfil = function () {
  const alvo = document.getElementById('ct-form');
  if (!alvo) return;
  alvo.innerHTML = UI.panel('Novo perfil',
    '<div class="erp-grid erp-grid-2">' +
    '<label class="erp-field"><span>Nome</span><input type="text" id="ct-perfil-nome" placeholder="Ex: Montagem"></label>' +
    '<label class="erp-field"><span>Descrição</span><input type="text" id="ct-perfil-desc" placeholder="O que esse cargo faz"></label>' +
    '</div>' +
    '<div class="erp-note">O perfil nasce sem nenhuma permissão. Marque o que ele pode na matriz ' +
    'logo abaixo, depois de criar — assim dá pra comparar com os outros perfis enquanto marca.</div>' +
    '<div style="display:flex;gap:8px;margin-top:12px">' +
    '<button onclick="ScreensContatos.salvarNovoPerfil()">Criar perfil</button>' +
    '<button class="erp-btn-secondary" onclick="ScreensContatos.fecharForm()">Cancelar</button></div>');
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

ScreensContatos.salvarNovoPerfil = function () {
  const nome = ScreensContatos.val('ct-perfil-nome');
  if (!nome) { ScreensContatos.toast('O perfil precisa de um nome.', true); return; }
  ScreensContatos._do(function () {
    return CT.criarPerfil({
      nome: nome,
      slug: CT.slugify(nome, (ScreensContatos._d || {}).perfis),
      descricao: ScreensContatos.val('ct-perfil-desc'),
      permissoes: []
    });
  }, 'Perfil criado.');
};

/* ============================================================
   Detalhe do perfil
   ============================================================ */
ScreensContatos.perfilDetalhe = function (params, d) {
  const p = CT.perfilById(params.id, d.perfis);
  if (!p) return '<div class="erp-empty">Perfil não encontrado.</div>';

  const usuarios = CT.usandoPerfil(d.contatos, p.id);
  const total = CT.todasPermissoes().length;
  const n = p.permissoes === null || p.permissoes === undefined ? total : p.permissoes.length;

  const grupos = CT.PERMISSOES.map(function (g) {
    const itens = g.acoes.map(function (a) {
      const chave = g.chave + '.' + a.id;
      const tem = CT.perfilTem(p, chave);
      return '<li class="' + (tem ? 'checked' : '') + '">' +
        '<input type="checkbox" ' + (tem ? 'checked' : '') + ' ' + (p.sistema ? 'disabled' : '') +
        ' onchange="ScreensContatos.togglePermissao(\'' + p.id + '\',\'' + chave + '\',this.checked)">' +
        '<div class="erp-check-body"><div class="erp-check-title">' + UI.esc(a.label) + '</div>' +
        '<div class="erp-check-meta erp-mono">' + UI.esc(chave) + '</div></div></li>';
    }).join('');
    return '<div><div class="erp-strong erp-small" style="margin-bottom:2px">' + UI.esc(g.tela) + '</div>' +
      '<ul class="erp-check-list">' + itens + '</ul></div>';
  }).join('');

  const userRows = usuarios.map(function (u) {
    const ov = (u.conta && u.conta.overrides) || {};
    const keys = Object.keys(ov);
    return {
      _href: '#/contatos/' + u.id,
      nome: '<span class="erp-strong">' + UI.esc(u.nome) + '</span>' +
        '<div class="erp-xs erp-muted">' + UI.esc(u.conta.login || '') + '</div>',
      exc: keys.length
        ? keys.map(function (k) {
            return '<div class="erp-xs"><span class="erp-mono">' + UI.esc(k) + '</span> ' +
              UI.pill(ov[k] ? 'liberado a dedo' : 'bloqueado a dedo', ov[k] ? 'erp-pill-ok' : 'erp-pill-danger') + '</div>';
          }).join('')
        : '<span class="erp-muted erp-small">nenhuma — herda tudo</span>',
      acesso: '<span class="erp-small erp-muted">' + UI.esc(ScreensContatos.quando(u.conta.ultimo_acesso)) + '</span>'
    };
  });

  return UI.crumb([{ label: 'Perfis', href: '#/perfis' }, { label: p.nome }]) +
    UI.head(p.nome, UI.esc(p.descricao || ''),
      (p.sistema ? '' : '<button class="erp-btn-secondary" onclick="ScreensContatos.duplicarPerfil(\'' + p.id + '\')">Duplicar</button>') +
      (p.sistema || usuarios.length ? '' : '<button class="erp-btn-ghost" onclick="ScreensContatos.excluirPerfil(\'' + p.id + '\')">Excluir</button>')) +
    '<div id="ct-toast" style="display:none"></div>' +
    '<div id="ct-form"></div>' +
    '<div class="erp-grid erp-grid-side"><div>' +
    UI.panel('Permissões do molde',
      (p.sistema
        ? '<div class="erp-note">Perfil de sistema — não dá para editar. ' +
          (p.slug === 'adm'
            ? 'O Administrador tem tudo por definição; mexer aqui trancaria você mesmo pra fora.'
            : 'O cliente do portal não entra no back-office, então não tem o que marcar.') + '</div>'
        : '<div class="erp-note">Marcar aqui muda o padrão de <span class="erp-strong">' + usuarios.length +
          ' pessoa(s)</span> de uma vez — menos quem tiver exceção naquela permissão específica. ' +
          'Cada clique já grava.</div>') +
      '<div class="erp-grid erp-grid-3">' + grupos + '</div>') +
    UI.panel('Quem usa este perfil', userRows.length
      ? UI.table([
          { key: 'nome', label: 'Pessoa' },
          { key: 'exc', label: 'Exceções individuais' },
          { key: 'acesso', label: 'Último acesso' }
        ], userRows)
      : '<div class="erp-empty">Ninguém usa este perfil ainda.</div>') +
    '</div><div>' +
    UI.panel('Resumo', UI.def([
      ['Identificador', '<span class="erp-mono erp-small">' + UI.esc(p.slug) + '</span>'],
      ['Permissões', n + ' de ' + total + '<div style="margin-top:4px">' + UI.bar(n / total) + '</div>'],
      ['Pessoas', usuarios.length],
      ['Exceções', usuarios.reduce(function (s, u) { return s + Object.keys((u.conta && u.conta.overrides) || {}).length; }, 0)],
      ['Editável', p.sistema ? UI.pill('Não', 'erp-pill-neutral') : UI.pill('Sim', 'erp-pill-ok')]
    ])) +
    UI.panel('Perfil x exceção',
      '<div class="erp-muted erp-small">Quando usar cada um:</div>' +
      '<ul class="erp-small" style="margin:8px 0 0;padding-left:18px">' +
      '<li><span class="erp-strong">Perfil</span> — quando a regra vale pro cargo. Quem entrar amanhã já nasce certo.</li>' +
      '<li style="margin-top:6px"><span class="erp-strong">Exceção</span> — quando é característica da pessoa. ' +
      'Alguém do PCP que cobre o comercial às sextas precisa aprovar pedido; isso não vale pro PCP inteiro.</li>' +
      '</ul>' +
      '<div class="erp-muted erp-xs" style="margin-top:10px">Se a mesma exceção aparecer em três pessoas do mesmo perfil, ' +
      'era perfil novo — não exceção.</div>') +
    '</div></div>';
};

ScreensContatos.duplicarPerfil = function (id) {
  const d = ScreensContatos._d;
  const p = CT.perfilById(id, d.perfis);
  if (!p) return;
  const nome = prompt('Nome do novo perfil:', p.nome + ' (cópia)');
  if (!nome) return;
  ScreensContatos._do(async function () {
    const novo = await CT.criarPerfil({
      nome: nome, slug: CT.slugify(nome, d.perfis),
      descricao: p.descricao, permissoes: (p.permissoes || []).slice()
    });
    location.hash = '#/perfis/' + novo.id;
  }, 'Perfil duplicado.');
};

ScreensContatos.excluirPerfil = function (id) {
  const d = ScreensContatos._d;
  const p = CT.perfilById(id, d.perfis);
  if (!p) return;
  if (CT.usandoPerfil(d.contatos, id).length) {
    ScreensContatos.toast('Tem gente usando este perfil. Mova essas pessoas para outro perfil antes de excluir.', true);
    return;
  }
  if (!confirm('Excluir o perfil "' + p.nome + '"?')) return;
  ScreensContatos._do(async function () {
    await CT.excluirPerfil(id);
    location.hash = '#/perfis';
  }, 'Perfil excluído.');
};
