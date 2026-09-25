/* Painel admin — ÁRVORE DE PASTAS do cadastro de componentes (migration 089)
 *
 * Pedido do Matt (2026-08-10): "preciso uma aba lateral em árvore que eu
 * organize meus componentes".
 *
 * PASTA É SÓ ARRUMAÇÃO. Não decide papel de cor, não decide posicionamento,
 * não entra em preço, furação nem 3D. Foi por isso que ela pôde ser livre:
 * agrupar por component_types ou position_role (que não exigiria migration)
 * transformaria "organizar" em "mudar o comportamento da peça", e mover algo
 * de lugar quebraria o desenho. Ver o cabeçalho da migration 089.
 *
 * Carrega DEPOIS de 09-componentes.js: renderComponents() chama
 * renderComponentTree() daqui, e o inverso também acontece (a árvore chama
 * editComponent). As duas direções só rodam em tempo de execução, então a
 * ordem entre elas não importa — o que importa é que este arquivo entre
 * depois de ADM.montar(), como todos os outros.
 */

let componentFoldersCache = [];
// Pasta selecionada na árvore. Decide onde "+ Pasta" cria a subpasta e em
// que pasta um componente novo nasce — é o que faz "clicar na pasta e criar"
// funcionar como as pessoas esperam, sem um seletor extra.
let selectedComponentFolderId = null;
// Pastas recolhidas (por id). Guardado só em memória: é preferência de
// navegação, não dado — persistir isso no banco seria cadastro de enfeite.
const componentFolderFechadas = {};

async function loadComponentFolders() {
  const { data, error } = await supabaseClient
    .from('component_folders').select('*').order('sort_order').order('name');
  if (error) {
    // Sem a 089 a tela inteira ainda funciona — só não tem pastas. Um erro
    // vermelho aqui assustaria à toa; o aviso na própria árvore basta.
    componentFoldersCache = null;
    console.warn('[pastas de componentes]', error.message);
    return;
  }
  componentFoldersCache = data || [];
}

function componentFolderById(id) {
  return (componentFoldersCache || []).find(function (f) { return f.id === id; });
}

// ---------- montagem da árvore ----------

function renderComponentTree() {
  const alvo = document.getElementById('component-tree');
  if (!alvo) return;

  const busca = (document.getElementById('component-tree-search') || {}).value || '';
  const termo = busca.trim().toLowerCase();
  const casa = function (c) {
    if (!termo) return true;
    return (c.reference || '').toLowerCase().indexOf(termo) >= 0
      || (c.notes || '').toLowerCase().indexOf(termo) >= 0;
  };
  const visiveis = (componentsCache || []).filter(casa);

  if (componentFoldersCache === null) {
    alvo.innerHTML = '<div class="cad-empty">A migration 089 (pastas de componentes) ainda não '
      + 'rodou neste banco — por isso a árvore está sem pastas. Os componentes continuam '
      + 'todos aqui embaixo e tudo o mais funciona normalmente.</div>'
      + '<div class="cad-children">' + visiveis.map(itemComponente).join('') + '</div>';
    ligarArvore();
    return;
  }

  const porPai = {};
  (componentFoldersCache || []).forEach(function (f) {
    const k = f.parent_id || 'raiz';
    (porPai[k] = porPai[k] || []).push(f);
  });

  // Conta o que existe DENTRO da pasta e de tudo abaixo dela: a contagem só
  // de filhos diretos faria uma pasta cheia de subpastas parecer vazia.
  function contar(folderId) {
    let n = visiveis.filter(function (c) { return c.folder_id === folderId; }).length;
    (porPai[folderId] || []).forEach(function (f) { n += contar(f.id); });
    return n;
  }

  function pasta(f, nivel) {
    const filhosPasta = porPai[f.id] || [];
    const filhosComp = visiveis.filter(function (c) { return c.folder_id === f.id; });
    const n = contar(f.id);
    // Buscando, pasta sem nenhum resultado sai da frente.
    if (termo && n === 0) return '';
    const fechada = componentFolderFechadas[f.id] && !termo;
    return '<div class="cad-node cad-folder' + (fechada ? ' fechado' : '') + '" data-folder="' + f.id + '">'
      + '<div class="cad-row' + (selectedComponentFolderId === f.id ? ' sel' : '') + '"'
      + ' data-folder-row="' + f.id + '" draggable="false">'
      + '<span class="cad-caret" data-toggle="' + f.id + '">' + (fechada ? '▸' : '▾') + '</span>'
      + '<span class="nm" title="' + admEsc(f.name) + '">' + admEsc(f.name) + '</span>'
      + '<span class="qt">' + n + '</span>'
      + '<button type="button" class="act" data-folder-rename="' + f.id + '" title="Renomear">✎</button>'
      + '<button type="button" class="act" data-folder-del="' + f.id + '" title="Excluir pasta">✕</button>'
      + '</div>'
      + '<div class="cad-children">'
      + filhosPasta.map(function (sub) { return pasta(sub, nivel + 1); }).join('')
      + filhosComp.map(itemComponente).join('')
      + '</div></div>';
  }

  const semPasta = visiveis.filter(function (c) { return !c.folder_id; });
  let html = (porPai.raiz || []).map(function (f) { return pasta(f, 0); }).join('');

  html += '<div class="cad-node" data-folder="">'
    + '<div class="cad-row' + (selectedComponentFolderId === null ? ' sel' : '') + '" data-folder-row="">'
    + '<span class="cad-caret">▾</span>'
    + '<span class="nm" style="color:#8a8378">Sem pasta</span>'
    + '<span class="qt">' + semPasta.length + '</span></div>'
    + '<div class="cad-children">' + semPasta.map(itemComponente).join('') + '</div></div>';

  if (!visiveis.length) {
    html += '<div class="cad-empty">' + (termo
      ? 'Nenhum componente casa com “' + admEsc(busca) + '”.'
      : 'Nenhum componente cadastrado ainda.') + '</div>';
  }

  alvo.innerHTML = html;
  ligarArvore();
}

function itemComponente(c) {
  const sel = document.getElementById('component-id');
  const atual = sel && sel.value === c.id;
  const tipo = c.component_types ? c.component_types.name : 'sem tipo';
  return '<div class="cad-row' + (atual ? ' sel' : '') + '" data-comp="' + c.id + '" draggable="true"'
    + ' title="' + admEsc(c.reference + ' · ' + tipo) + '">'
    + '<span class="cad-caret">·</span>'
    + '<span class="nm">' + admEsc(c.reference) + '</span>'
    + '</div>';
}

// Escape local: o admin não tem um helper próprio e concatenar nome de pasta
// digitado pelo usuário direto no innerHTML é convite pra quebrar o layout
// (ou pior) com uma aspa.
function admEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------- interação ----------

function ligarArvore() {
  const alvo = document.getElementById('component-tree');
  if (!alvo) return;

  alvo.querySelectorAll('[data-toggle]').forEach(function (e) {
    e.onclick = function (ev) {
      ev.stopPropagation();
      const id = e.dataset.toggle;
      componentFolderFechadas[id] = !componentFolderFechadas[id];
      renderComponentTree();
    };
  });

  alvo.querySelectorAll('[data-folder-row]').forEach(function (e) {
    e.onclick = function () {
      selectedComponentFolderId = e.dataset.folderRow || null;
      renderComponentTree();
    };
    // Soltar um componente aqui move ele pra esta pasta.
    e.addEventListener('dragover', function (ev) { ev.preventDefault(); e.classList.add('drop'); });
    e.addEventListener('dragleave', function () { e.classList.remove('drop'); });
    e.addEventListener('drop', function (ev) {
      ev.preventDefault();
      e.classList.remove('drop');
      const compId = ev.dataTransfer.getData('text/plain');
      if (compId) moverComponentePraPasta(compId, e.dataset.folderRow || null);
    });
  });

  alvo.querySelectorAll('[data-comp]').forEach(function (e) {
    e.onclick = function () { editComponent(e.dataset.comp); };
    e.addEventListener('dragstart', function (ev) {
      ev.dataTransfer.setData('text/plain', e.dataset.comp);
      ev.dataTransfer.effectAllowed = 'move';
    });
  });

  alvo.querySelectorAll('[data-folder-rename]').forEach(function (e) {
    e.onclick = function (ev) { ev.stopPropagation(); renomearPasta(e.dataset.folderRename); };
  });
  alvo.querySelectorAll('[data-folder-del]').forEach(function (e) {
    e.onclick = function (ev) { ev.stopPropagation(); excluirPasta(e.dataset.folderDel); };
  });
}

async function moverComponentePraPasta(componentId, folderId) {
  const { error } = await supabaseClient
    .from('components').update({ folder_id: folderId }).eq('id', componentId);
  if (error) { showError('components-error', error); return; }
  clearError('components-error');
  const c = (componentsCache || []).find(function (x) { return x.id === componentId; });
  if (c) c.folder_id = folderId;
  // Se a peça movida é a que está aberta no formulário, o seletor de pasta
  // dele tem que acompanhar — senão salvar em seguida devolveria ela pro
  // lugar antigo sem ninguém entender por quê.
  const idEl = document.getElementById('component-id');
  const selEl = document.getElementById('component-folder');
  if (idEl && selEl && idEl.value === componentId) selEl.value = folderId || '';
  renderComponentTree();
}

async function criarPastaComponentes() {
  if (componentFoldersCache === null) {
    alert('Rode a migration 089 (database/migration_089_pastas_de_componentes.sql) antes de criar pastas.');
    return;
  }
  const pai = selectedComponentFolderId ? componentFolderById(selectedComponentFolderId) : null;
  const nome = prompt(pai
    ? 'Nome da nova pasta dentro de "' + pai.name + '":'
    : 'Nome da nova pasta:');
  if (!nome || !nome.trim()) return;
  const { data, error } = await supabaseClient
    .from('component_folders')
    .insert({ name: nome.trim(), parent_id: pai ? pai.id : null, sort_order: (componentFoldersCache || []).length })
    .select('*').single();
  if (error) { showError('components-error', error); return; }
  clearError('components-error');
  componentFoldersCache.push(data);
  selectedComponentFolderId = data.id;
  renderComponentTree();
  fillComponentFolderSelect();
}

async function renomearPasta(id) {
  const f = componentFolderById(id);
  if (!f) return;
  const nome = prompt('Novo nome da pasta:', f.name);
  if (!nome || !nome.trim() || nome.trim() === f.name) return;
  const { error } = await supabaseClient
    .from('component_folders').update({ name: nome.trim() }).eq('id', id);
  if (error) { showError('components-error', error); return; }
  f.name = nome.trim();
  renderComponentTree();
  fillComponentFolderSelect();
}

async function excluirPasta(id) {
  const f = componentFolderById(id);
  if (!f) return;
  // O texto é explícito porque as duas metades têm comportamentos opostos e
  // "excluir" sozinho soa como se levasse as peças junto: subpasta CAI
  // (cascade), componente NÃO (set null, volta pra "Sem pasta").
  if (!confirm('Excluir a pasta "' + f.name + '"?\n\n'
    + 'As subpastas dela também são excluídas.\n'
    + 'Os COMPONENTES não são apagados — voltam para "Sem pasta".')) return;
  const { error } = await supabaseClient.from('component_folders').delete().eq('id', id);
  if (error) { showError('components-error', error); return; }
  if (selectedComponentFolderId === id) selectedComponentFolderId = null;
  await loadComponentFolders();
  await loadComponents();          // folder_id de quem estava dentro virou null
  fillComponentFolderSelect();
}

// Seletor de pasta dentro do formulário — caminho completo, senão duas
// subpastas "Superiores" em famílias diferentes ficam indistinguíveis.
function fillComponentFolderSelect() {
  const sel = document.getElementById('component-folder');
  if (!sel) return;
  const antes = sel.value;
  const linhas = [];
  (function walk(paiId, prefixo) {
    (componentFoldersCache || [])
      .filter(function (f) { return (f.parent_id || null) === paiId; })
      .forEach(function (f) {
        linhas.push({ id: f.id, label: prefixo + f.name });
        walk(f.id, prefixo + f.name + ' / ');
      });
  })(null, '');
  sel.innerHTML = '<option value="">— Sem pasta —</option>'
    + linhas.map(function (l) { return '<option value="' + l.id + '">' + admEsc(l.label) + '</option>'; }).join('');
  sel.value = antes;
}

// ---------- ajuda atrás do "?" ----------
// Um listener só, delegado no documento: os "?" nascem e morrem junto com o
// HTML da tela, e registrar um por botão significaria relembrar disso toda
// vez que um campo novo aparecer.
document.addEventListener('click', function (ev) {
  const btn = ev.target.closest && ev.target.closest('.cad-q-btn');
  const aberto = document.querySelector('.cad-q.aberto');
  if (aberto && (!btn || btn.parentElement !== aberto)) aberto.classList.remove('aberto');
  if (btn) { ev.preventDefault(); btn.parentElement.classList.toggle('aberto'); }
});

// ---------- ligações da coluna da árvore ----------
(function () {
  const novo = document.getElementById('component-folder-new-btn');
  if (novo) novo.addEventListener('click', criarPastaComponentes);
  const busca = document.getElementById('component-tree-search');
  if (busca) busca.addEventListener('input', renderComponentTree);
})();
