/* Painel admin — AGREGADOS do construtor de armários (migration 085)
 *
 * Ler docs/criador-de-modulos-spec.md. O motor é js/layout-engine.js e o
 * protótipo navegável é teste-construtor-modulo.html.
 *
 * DUAS TABELAS, DOIS ASSUNTOS:
 *   accessory_types          — o catálogo global: o que existe no mundo.
 *   module_accessory_options — a whitelist por módulo: o que ESTE módulo
 *                              aceita. É aqui que mora o diferencial — o
 *                              módulo padrão é sempre o mesmo, o que muda é
 *                              o que ele pode receber.
 *
 * Carrega depois de 09-componentes.js e 10-modulos.js: os <select> de
 * componente e de módulo são preenchidos a partir de componentsCache /
 * modulesCache, que aqueles arquivos populam. */

let accessoryTypesCache = [];
let moduleAccessoryOptionsCache = [];
// Catálogo de programas de furação (migration 105) — cache PRÓPRIO desta
// tela, nome diferente do drillingPatternsCache de 13-modulo-pecas.js e do
// drillingPatternsList de 24-programas-furacao.js (telas independentes, cada
// uma carrega a sua). Mesma tabela, mesmo formato — ver comentário na 125.
let agregadoDrillingPatternsCache = [];

// ---------- catálogo ----------

async function loadAccessoryTypes() {
  const { data, error } = await supabaseClient
    .from('accessory_types')
    .select('*')
    .order('group_name')
    .order('sort_order')
    .order('name');
  if (error) { showError('agregados-error', error); return; }
  clearError('agregados-error');
  accessoryTypesCache = data || [];
  renderAccessoryTypes();
  fillAgregadoSelects();
}

// Migration 125 — tolerante: banco sem a migration 105 (drilling_patterns)
// rodada ainda funciona, só o select fica vazio (cai sempre na furação do
// componente, como era antes desta entrega).
async function loadAgregadoDrillingPatterns() {
  const { data, error } = await supabaseClient
    .from('drilling_patterns')
    .select('id, name')
    .order('sort_order')
    .order('name');
  agregadoDrillingPatternsCache = error ? [] : (data || []);
  fillAgregadoSelects();
}

// Nome legível da peça que o agregado gera — é o vínculo que dá preço a ele,
// então quando falta aparece em vermelho, não em cinza.
function agregadoGeraLabel(a) {
  if (a.component_id) {
    const c = componentsCache.find((x) => x.id === a.component_id);
    return c ? c.reference : '<span class="badge">componente sumiu</span>';
  }
  if (a.child_module_id) {
    const m = modulesCache.find((x) => x.id === a.child_module_id);
    return (m ? m.name : 'módulo sumiu') + ' <span class="hint">(módulo)</span>';
  }
  return '<span style="color:#c00">sem vínculo</span>';
}

const AGREGADO_ENCAIXE = {
  split: 'Divide o vão',
  content: 'Preenche',
  front: 'Fecha a frente'
};

// veio/fura são do COMPONENTE (migration 086), não do agregado — aqui só
// espelhamos o que está lá, pra quem cadastra ver o efeito sem sair da tela.
function agregadoComponente(a) {
  return a.component_id ? componentsCache.find((x) => x.id === a.component_id) : null;
}
function agregadoVeio(a) {
  const c = agregadoComponente(a);
  if (!c) return '<span class="hint">—</span>';
  return c.veio || 'livre';
}
function agregadoFura(a) {
  // Migration 125 — com programa escolhido, ele MANDA (mesma prioridade de
  // furosDaPeca em drilling.js: drilling_pattern_id vence component_id).
  // Mostra o nome do programa em vez de "sim"/"não" genérico, senão some a
  // informação de QUAL furação está valendo.
  if (a.drilling_pattern_id) {
    const p = agregadoDrillingPatternsCache.find((x) => x.id === a.drilling_pattern_id);
    return '<span class="badge">' + (p ? p.name : 'programa sumiu') + '</span>';
  }
  const c = agregadoComponente(a);
  if (!c) return '<span class="hint">—</span>';
  return c.fura === false ? '<span class="hint">não</span>' : 'sim (do componente)';
}

// Migration 126 — variante por profundidade. Mostra a faixa cadastrada
// (representante ou variante) e, quando é variante, de quem — pra quem
// cadastra ver a família inteira sem abrir cada linha.
function agregadoFaixaProfundidade(a) {
  const min = a.depth_bracket_min_mm, max = a.depth_bracket_max_mm;
  const faixa = (min != null || max != null)
    ? (min != null ? Math.round(min) : '') + '–' + (max != null ? Math.round(max) : '') + 'mm'
    : '';
  if (a.depth_variant_of) {
    const rep = accessoryTypesCache.find((x) => x.id === a.depth_variant_of);
    return '<span class="badge">variante de ' + (rep ? rep.name : 'agregado sumiu') + '</span>'
      + (faixa ? ' ' + faixa : '');
  }
  return faixa ? '<span class="hint">representante</span> ' + faixa : '<span class="hint">—</span>';
}

function renderAccessoryTypes() {
  const tbody = document.getElementById('agregados-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!accessoryTypesCache.length) {
    tbody.innerHTML = '<tr><td colspan="10" class="hint">Nenhum agregado cadastrado ainda. '
      + 'Use "Criar os agregados base…" para começar com os mais comuns.</td></tr>';
    return;
  }
  accessoryTypesCache.forEach((a) => {
    const eixo = a.role === 'split' ? (a.split_axis === 'x' ? ' (vertical)' : ' (horizontal)') : '';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${a.icon ? a.icon + ' ' : ''}${a.name}</td>
      <td>${a.group_name || ''}</td>
      <td>${AGREGADO_ENCAIXE[a.role] || a.role}${eixo}</td>
      <td>${agregadoGeraLabel(a)}</td>
      <td>${Math.round(a.min_void_w_mm)} × ${Math.round(a.min_void_h_mm)} × ${Math.round(a.min_void_d_mm)}</td>
      <td>${agregadoVeio(a)}</td>
      <td>${agregadoFura(a)}</td>
      <td>${agregadoFaixaProfundidade(a)}</td>
      <td>${a.active ? '<span class="badge">ativo</span>' : '<span class="badge">inativo</span>'}</td>
      <td><button class="secondary" onclick="editAccessoryType('${a.id}')">Editar</button>
          <button class="danger" onclick="deleteAccessoryType('${a.id}')">Excluir</button></td>
    `;
    tbody.appendChild(tr);
  });
}

function fillAgregadoSelects() {
  const comp = document.getElementById('agregado-component');
  const mod = document.getElementById('agregado-child-module');
  const role = document.getElementById('agregado-color-role');
  if (comp) {
    const atualComp = comp.value;
    comp.innerHTML = '<option value="">—</option>'
      + componentsCache.filter((c) => c.active !== false)
        .map((c) => `<option value="${c.id}">${c.reference}</option>`).join('');
    comp.value = atualComp;
  }
  if (mod) {
    const atualMod = mod.value;
    mod.innerHTML = '<option value="">—</option>'
      + modulesCache.map((m) => `<option value="${m.id}">${m.name}</option>`).join('');
    mod.value = atualMod;
  }
  if (role) {
    const atualRole = role.value;
    role.innerHTML = '<option value="">herda do tipo do componente</option>'
      + colorRolesCache.map((r) => `<option value="${r.id}">${r.name}</option>`).join('');
    role.value = atualRole;
  }
  const furo = document.getElementById('agregado-drilling-pattern');
  if (furo) {
    furo.innerHTML = '<option value="">— usar a furação do componente —</option>'
      + agregadoDrillingPatternsCache.map((p) => `<option value="${p.id}">${p.name}</option>`).join('');
  }
  // Migration 126 — exclui o próprio (não dá pra ser variante de si mesmo).
  // agregado-id só tem valor durante uma edição; em "novo" fica vazio e
  // ninguém é excluído.
  const depthOf = document.getElementById('agregado-depth-variant-of');
  if (depthOf) {
    const selfId = (document.getElementById('agregado-id') || {}).value || '';
    depthOf.innerHTML = '<option value="">— não é variante (comum, ou é o representante) —</option>'
      + accessoryTypesCache.filter((a) => a.id !== selfId)
        .map((a) => `<option value="${a.id}">${a.icon ? a.icon + ' ' : ''}${a.name}${a.group_name ? ' — ' + a.group_name : ''}</option>`).join('');
  }
  const modSel = document.getElementById('agregado-mod-module');
  if (modSel) {
    const atual = modSel.value;
    modSel.innerHTML = '<option value="">Escolha um módulo…</option>'
      + modulesCache.map((m) => `<option value="${m.id}">${m.name}</option>`).join('');
    modSel.value = atual;
  }
}

// O eixo só faz sentido em 'split' — a constraint
// accessory_types_split_precisa_de_eixo rejeita split sem eixo, então o campo
// aparece/some junto com a escolha em vez de deixar o banco reclamar depois.
function syncAgregadoRoleUI() {
  const role = document.getElementById('agregado-role');
  const wrap = document.getElementById('agregado-axis-wrap');
  if (role && wrap) wrap.style.display = role.value === 'split' ? '' : 'none';
}

window.editAccessoryType = function (id) {
  const a = accessoryTypesCache.find((x) => x.id === id);
  if (!a) return;
  const v = (el, val) => { const e = document.getElementById(el); if (e) e.value = val; };
  const c = (el, val) => { const e = document.getElementById(el); if (e) e.checked = val; };
  v('agregado-id', a.id);
  v('agregado-name', a.name || '');
  v('agregado-group', a.group_name || '');
  v('agregado-icon', a.icon || '');
  v('agregado-sort', a.sort_order || 0);
  v('agregado-role', a.role);
  v('agregado-axis', a.split_axis || 'y');
  // 19.5mm (2026-08-15): era 18 — padrão dos componentes principais mudou
  // de 20 pra 19.5mm (ver migration 101 + CST.ESPESSURA/PROJECT_BUILDER_
  // ESPESSURA). Só é usado quando o agregado não tem valor próprio salvo.
  // 'E' (migration 161, 2026-09-24): segue a espessura da chapa do casco
  // (colors.thickness_mm — plywood 18, o resto 19.5). Número fixo ('15')
  // continua valendo pra agregado que tem espessura própria.
  v('agregado-thickness', a.thickness_formula || 'E');
  v('agregado-component', a.component_id || '');
  v('agregado-child-module', a.child_module_id || '');
  v('agregado-color-role', a.color_role_id || '');
  v('agregado-drilling-pattern', a.drilling_pattern_id || '');
  // Suporte de prateleira (migration 162): '' herda do componente, 'true'/'false' decidem.
  v('agregado-shelf-support', a.drill_shelf_support == null ? '' : String(!!a.drill_shelf_support));
  v('agregado-opening', a.opening_type || 'none');
  v('agregado-slides', a.slides_per_unit || 0);
  v('agregado-shape', a.shape_type || '');
  v('agregado-min-w', a.min_void_w_mm || 0);
  v('agregado-min-h', a.min_void_h_mm || 0);
  v('agregado-min-d', a.min_void_d_mm || 0);
  c('agregado-active', a.active !== false);
  v('agregado-params', JSON.stringify(a.default_params || {}));
  // Migration 126 — refaz o select de "variante de" agora que agregado-id já
  // está preenchido, pra excluir a si mesmo da lista, e só então marca o
  // valor salvo.
  fillAgregadoSelects();
  v('agregado-depth-variant-of', a.depth_variant_of || '');
  v('agregado-depth-min', a.depth_bracket_min_mm != null ? a.depth_bracket_min_mm : '');
  v('agregado-depth-max', a.depth_bracket_max_mm != null ? a.depth_bracket_max_mm : '');
  syncAgregadoRoleUI();
  document.getElementById('agregado-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
};

window.deleteAccessoryType = async function (id) {
  if (!confirm('Excluir este agregado? Módulos que o permitiam perdem a permissão junto.')) return;
  const { error } = await supabaseClient.from('accessory_types').delete().eq('id', id);
  if (error) { showError('agregados-error', error); return; }
  await loadAccessoryTypes();
};

function limparAgregadoForm() {
  const f = document.getElementById('agregado-form');
  if (f) f.reset();
  const id = document.getElementById('agregado-id');
  if (id) id.value = '';
  const p = document.getElementById('agregado-params');
  if (p) p.value = '{}';
  // Migration 126 — id zerado: reconstrói o select sem excluir ninguém.
  fillAgregadoSelects();
  syncAgregadoRoleUI();
}

async function salvarAgregado(ev) {
  ev.preventDefault();
  clearError('agregados-error');
  const g = (el) => { const e = document.getElementById(el); return e ? e.value.trim() : ''; };
  const gn = (el) => { const e = document.getElementById(el); return e ? Number(e.value || 0) : 0; };
  const gc = (el) => { const e = document.getElementById(el); return e ? e.checked : false; };

  const component_id = g('agregado-component') || null;
  const child_module_id = g('agregado-child-module') || null;
  // Mesma regra da constraint accessory_types_component_xor_module — avisar
  // aqui é melhor que deixar o Postgres devolver o nome da constraint.
  if (!!component_id === !!child_module_id) {
    showError('agregados-error', new Error(
      'Escolha UM dos dois: componente do catálogo OU módulo inteiro. Sem vínculo o agregado não tem preço.'));
    return;
  }

  let default_params;
  try {
    default_params = JSON.parse(g('agregado-params') || '{}');
  } catch (err) {
    showError('agregados-error', new Error('Parâmetros: JSON inválido — ' + err.message));
    return;
  }

  // Migration 126 — não dá pra ser variante de si mesmo (o select já exclui
  // a própria linha, mas confere de novo: id pode ter mudado de fonte, ex.
  // form reenviado com JS travado).
  const depth_variant_of = g('agregado-depth-variant-of') || null;
  if (depth_variant_of && depth_variant_of === g('agregado-id')) {
    showError('agregados-error', new Error('Um agregado não pode ser variante de profundidade de si mesmo.'));
    return;
  }
  const depthMinRaw = g('agregado-depth-min');
  const depthMaxRaw = g('agregado-depth-max');
  const depth_bracket_min_mm = depthMinRaw === '' ? null : Number(depthMinRaw);
  const depth_bracket_max_mm = depthMaxRaw === '' ? null : Number(depthMaxRaw);
  if (depth_bracket_min_mm != null && depth_bracket_max_mm != null && depth_bracket_min_mm > depth_bracket_max_mm) {
    showError('agregados-error', new Error('Faixa de profundidade: o mínimo não pode ser maior que o máximo.'));
    return;
  }

  const role = g('agregado-role');
  const payload = {
    name: g('agregado-name'),
    group_name: g('agregado-group') || 'Outros',
    icon: g('agregado-icon') || null,
    sort_order: gn('agregado-sort'),
    role: role,
    split_axis: role === 'split' ? g('agregado-axis') : null,
    thickness_formula: g('agregado-thickness') || 'E',
    component_id: component_id,
    child_module_id: child_module_id,
    color_role_id: g('agregado-color-role') || null,
    // Migration 125 — vazio = null = cai na furação do componente vinculado,
    // igual sempre foi. Escolhido, usa esse programa (drilling_patterns),
    // mesma regra de prioridade de module_components.drilling_pattern_id.
    drilling_pattern_id: g('agregado-drilling-pattern') || null,
    // Migration 162 — furos de suporte de prateleira POR USO. Vazio = null =
    // herda components.drill_shelf_support (a chapa genérica tem false).
    drill_shelf_support: g('agregado-shelf-support') === '' ? null : g('agregado-shelf-support') === 'true',
    // Migration 126 — variante por profundidade. Ver comentário no topo da
    // seção "Variante por profundidade" na tela (telas/agregados.js) e
    // LayoutEngine.resolveDepthVariant (js/layout-engine.js).
    depth_variant_of: depth_variant_of,
    depth_bracket_min_mm: depth_bracket_min_mm,
    depth_bracket_max_mm: depth_bracket_max_mm,
    opening_type: g('agregado-opening') || 'none',
    slides_per_unit: gn('agregado-slides'),
    shape_type: g('agregado-shape') || null,
    min_void_w_mm: gn('agregado-min-w'),
    min_void_h_mm: gn('agregado-min-h'),
    min_void_d_mm: gn('agregado-min-d'),
    // veio NÃO mora aqui: é do COMPONENTE (migration 086). O fundo tem veio
    // livre por ser o fundo, não por estar sendo usado como agregado. Furo
    // (fura/drilling_pattern_id), desde a 125, PODE morar aqui — ver acima.
    active: gc('agregado-active'),
    default_params: default_params
  };

  const id = g('agregado-id');
  const q = id
    ? supabaseClient.from('accessory_types').update(payload).eq('id', id)
    : supabaseClient.from('accessory_types').insert(payload);
  const { error } = await q;
  if (error) { showError('agregados-error', error); return; }
  limparAgregadoForm();
  await loadAccessoryTypes();
}

// ---------- semente ----------
// Não inserimos nada automático na migration de propósito: todo agregado
// precisa apontar pra um componente que existe NESTE banco, e esses ids
// mudam de ambiente. Aqui o admin escolhe o componente e o resto vem pronto.
const AGREGADOS_BASE = [
  { name: 'Prateleira fixa',      group_name: 'Prateleiras', icon: '▤',  role: 'split',   split_axis: 'y', veio: 'livre',    fura: true,  min_void_h_mm: 126, default_params: { quantidade: 1, recuo_mm: 8 } },
  { name: 'Prateleira móvel',     group_name: 'Prateleiras', icon: '▤',  role: 'split',   split_axis: 'y', veio: 'livre',    fura: false, min_void_h_mm: 126, default_params: { quantidade: 1, recuo_mm: 12 } },
  { name: 'Divisória vertical',   group_name: 'Divisórias',  icon: '▯▯', role: 'split',   split_axis: 'x', veio: 'vertical', fura: true,  min_void_w_mm: 156, default_params: { quantidade: 1 } },
  { name: 'Gaveta',               group_name: 'Gavetas',     icon: '▭',  role: 'content', veio: 'vertical', fura: true,  min_void_w_mm: 180, min_void_h_mm: 90, min_void_d_mm: 250, opening_type: 'slide_out', slides_per_unit: 2, default_params: { quantidade: 1, recuo_mm: 0 } },
  { name: 'Porta externa',        group_name: 'Portas',      icon: '▮',  role: 'front',   veio: 'vertical', fura: true,  min_void_w_mm: 120, min_void_h_mm: 180, default_params: { lado: 'left', folgas_mm: 3, sobrepoe: true } },
  { name: 'Cabide tubular',       group_name: 'Acessórios',  icon: '⌒',  role: 'content', veio: 'livre',   fura: false, min_void_w_mm: 300, min_void_h_mm: 420, min_void_d_mm: 400, shape_type: 'oval_rod', default_params: { altura_do_topo_mm: 60 } }
];

async function semearAgregados() {
  clearError('agregados-error');
  const faltando = AGREGADOS_BASE.filter((b) =>
    !accessoryTypesCache.some((a) => a.name === b.name));
  if (!faltando.length) { alert('Os agregados base já estão cadastrados.'); return; }

  const nomes = faltando.map((b) => b.name).join('\n  · ');
  if (!confirm('Vou criar ' + faltando.length + ' agregado(s):\n  · ' + nomes
    + '\n\nEles nascem SEM vínculo e INATIVOS — você precisa abrir cada um e escolher o componente '
    + 'ou módulo que ele gera. Sem isso não têm preço.\n\nCriar?')) return;

  // Nascem inativos e apontando pro primeiro componente ativo só pra
  // satisfazer a constraint xor — o admin troca em seguida. Se não houver
  // nenhum componente cadastrado, não dá pra criar.
  const base = componentsCache.find((c) => c.active !== false);
  if (!base) {
    showError('agregados-error', new Error(
      'Cadastre ao menos um componente antes: todo agregado precisa apontar pra um.'));
    return;
  }
  const linhas = faltando.map((b, i) => Object.assign({
    component_id: base.id, active: false, sort_order: i
  }, b));
  const { error } = await supabaseClient.from('accessory_types').insert(linhas);
  if (error) { showError('agregados-error', error); return; }
  await loadAccessoryTypes();
  alert('Criados. Agora abra cada um em Editar, escolha o componente/módulo certo e marque Ativo.');
}

// ---------- whitelist por módulo ----------

async function loadModuleAccessoryOptions(moduleId) {
  const tbody = document.getElementById('agregados-mod-tbody');
  if (!tbody) return;
  if (!moduleId) {
    tbody.innerHTML = '<tr><td colspan="5" class="hint">Escolha um módulo acima.</td></tr>';
    return;
  }
  const { data, error } = await supabaseClient
    .from('module_accessory_options').select('*').eq('module_id', moduleId);
  if (error) { showError('agregados-mod-error', error); return; }
  clearError('agregados-mod-error');
  moduleAccessoryOptionsCache = data || [];
  renderModuleAccessoryOptions();
}

function renderModuleAccessoryOptions() {
  const tbody = document.getElementById('agregados-mod-tbody');
  if (!tbody) return;
  const ativos = accessoryTypesCache.filter((a) => a.active !== false);
  if (!ativos.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="hint">Nenhum agregado ativo no catálogo.</td></tr>';
    return;
  }
  tbody.innerHTML = ativos.map((a) => {
    const o = moduleAccessoryOptionsCache.find((x) => x.accessory_type_id === a.id) || {};
    const n = (campo, val) => `<input type="number" data-mao="${a.id}" data-k="${campo}" `
      + `value="${val == null ? '' : val}" placeholder="—" style="width:66px">`;
    return `<tr>
      <td>${a.icon ? a.icon + ' ' : ''}${a.name} <span class="hint">${a.group_name || ''}</span></td>
      <td><input type="checkbox" data-mao="${a.id}" data-k="allowed" ${o.allowed !== false && o.id ? 'checked' : (o.id ? '' : '')}></td>
      <td><input type="checkbox" data-mao="${a.id}" data-k="client_visible" ${o.client_visible !== false ? 'checked' : ''}></td>
      <td>${n('max_count', o.max_count)}</td>
      <td>${n('min_void_w_mm', o.min_void_w_mm)} ${n('min_void_h_mm', o.min_void_h_mm)} ${n('min_void_d_mm', o.min_void_d_mm)}</td>
    </tr>`;
  }).join('');
}

async function salvarModuleAccessoryOptions() {
  const moduleId = document.getElementById('agregado-mod-module').value;
  if (!moduleId) { alert('Escolha um módulo primeiro.'); return; }
  clearError('agregados-mod-error');

  const porAgregado = {};
  document.querySelectorAll('[data-mao]').forEach((inp) => {
    const id = inp.dataset.mao;
    porAgregado[id] = porAgregado[id] || { module_id: moduleId, accessory_type_id: id };
    const k = inp.dataset.k;
    if (inp.type === 'checkbox') porAgregado[id][k] = inp.checked;
    else porAgregado[id][k] = inp.value === '' ? null : Number(inp.value);
  });

  // Só grava o que está permitido. Desmarcar = apagar a linha, que é o que
  // "este módulo não aceita isso" significa — módulo sem linha não oferece
  // nada, e é o padrão seguro descrito na migration.
  const manter = Object.values(porAgregado).filter((r) => r.allowed);
  const tirar = Object.values(porAgregado).filter((r) => !r.allowed)
    .map((r) => r.accessory_type_id);

  if (tirar.length) {
    const { error } = await supabaseClient.from('module_accessory_options')
      .delete().eq('module_id', moduleId).in('accessory_type_id', tirar);
    if (error) { showError('agregados-mod-error', error); return; }
  }
  if (manter.length) {
    const { error } = await supabaseClient.from('module_accessory_options')
      .upsert(manter, { onConflict: 'module_id,accessory_type_id' });
    if (error) { showError('agregados-mod-error', error); return; }
  }
  await loadModuleAccessoryOptions(moduleId);
  alert('Permissões salvas.');
}

// ---------- ligações ----------

(function ligarAgregados() {
  const form = document.getElementById('agregado-form');
  if (form) form.addEventListener('submit', salvarAgregado);

  const role = document.getElementById('agregado-role');
  if (role) role.addEventListener('change', syncAgregadoRoleUI);

  const cancel = document.getElementById('agregado-cancel');
  if (cancel) cancel.addEventListener('click', limparAgregadoForm);

  const seed = document.getElementById('agregado-seed');
  if (seed) seed.addEventListener('click', semearAgregados);

  const modSel = document.getElementById('agregado-mod-module');
  if (modSel) modSel.addEventListener('change', () => loadModuleAccessoryOptions(modSel.value));

  const modSave = document.getElementById('agregado-mod-save');
  if (modSave) modSave.addEventListener('click', salvarModuleAccessoryOptions);

  syncAgregadoRoleUI();

  // Carga sob demanda: só consulta quando a tela é aberta de fato. Os
  // <select> dependem de componentsCache/modulesCache, que já estão prontos
  // porque garantirCarga() roda antes deste gancho.
  if (typeof ADM !== 'undefined' && ADM.aoAbrir) {
    ADM.aoAbrir('tab-agregados', function () {
      loadAccessoryTypes();
      loadAgregadoDrillingPatterns();
      loadModuleAccessoryOptions('');
    });
  }
})();
