// ============================================================
// DADOS DO CLIENTE no projeto — aba Projetos (2026-10-13)
// ============================================================
// Pedido do Matt: "e dados do cliente. aliás, vamos colocar lá na aba
// projeto dados do cliente. deve estar sintonizado com o salvar."
//
// - Botão "Dados do cliente" no grupo PROJETO da barra → janela com nome,
//   telefone, e-mail, endereço e observações do cliente FINAL.
// - Guardado em user_projects.client_info (jsonb, migration 199) pelo MESMO
//   "Salvar" do projeto (saveProjectFavoriteInner, portal-09): mexer num
//   campo marca o projeto como não salvo, e abrir um projeto salvo traz os
//   dados de volta (restoreFavoriteProject). Sem a migration rodada, o
//   salvar descarta a coluna em silêncio (OPTIONAL_COLUMNS) — o resto salva.
// - Usado por: Plano técnico (cabeçalho), Proposta (nome do cliente) e
//   "Enviar pro pedido" (pré-preenche nome/telefone/endereço do pedido).
// Carregado antes do portal-09 (boot).

let projectClientInfo = null; // { name, phone, email, address, notes } ou null
const PROJECT_CLIENT_FIELDS = ['name', 'phone', 'email', 'address', 'notes'];

function tClient(k, vars) { return I18n.t('project_client.' + k, vars); }

function getProjectClientInfo() {
  return projectClientInfo ? Object.assign({}, projectClientInfo) : null;
}
// Normaliza: só strings aparadas; tudo vazio = null (não grava objeto vazio).
function normalizeProjectClientInfo(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  PROJECT_CLIENT_FIELDS.forEach((k) => {
    const v = raw[k] == null ? '' : String(raw[k]).trim().slice(0, k === 'notes' ? 1000 : 300);
    if (v) out[k] = v;
  });
  return Object.keys(out).length ? out : null;
}
// Chamado ao abrir/limpar projeto (NÃO marca como alterado).
function setProjectClientInfo(raw) {
  projectClientInfo = normalizeProjectClientInfo(raw);
  refreshProjectClientUi();
}
// Linha curta pra cabeçalho de PDF: "Nome · telefone · e-mail · endereço".
function projectClientInfoLine() {
  const c = projectClientInfo;
  if (!c) return '';
  return [c.name, c.phone, c.email, c.address].filter(Boolean).join('  ·  ');
}

function refreshProjectClientUi() {
  const btn = document.getElementById('po-proj-client-btn');
  if (btn) {
    btn.classList.toggle('po-has-client', !!projectClientInfo);
    const nome = projectClientInfo && projectClientInfo.name;
    btn.title = nome ? tClient('btn_title_with', { name: nome }) : tClient('btn_title');
  }
  const modal = document.getElementById('po-proj-client-modal');
  if (modal && modal.classList.contains('aberto')) fillProjectClientForm();
}

function fillProjectClientForm() {
  PROJECT_CLIENT_FIELDS.forEach((k) => {
    const el = document.getElementById('po-proj-client-' + k);
    if (el) el.value = (projectClientInfo && projectClientInfo[k]) || '';
  });
}

function readProjectClientForm() {
  const raw = {};
  PROJECT_CLIENT_FIELDS.forEach((k) => {
    const el = document.getElementById('po-proj-client-' + k);
    raw[k] = el ? el.value : '';
  });
  return normalizeProjectClientInfo(raw);
}

// Campo editado → projeto fica "não salvo". Não passa por markProjectDirty
// de propósito: aquele também tira foto pro Desfazer, e dado de cliente não
// é geometria pra desfazer com o botão Voltar.
function onProjectClientFieldChange() {
  const novo = readProjectClientForm();
  if (JSON.stringify(novo) === JSON.stringify(projectClientInfo)) return;
  projectClientInfo = novo;
  projectDirty = true;
  if (typeof refreshProjectSaveIndicator === 'function') refreshProjectSaveIndicator();
  refreshProjectClientUi();
}

function ensureProjectClientModal() {
  if (document.getElementById('po-proj-client-modal')) return;
  const campo = (k, tipo) => {
    const id = 'po-proj-client-' + k;
    const input = tipo === 'textarea'
      ? '<textarea id="' + id + '" rows="3"></textarea>'
      : '<input type="' + tipo + '" id="' + id + '" autocomplete="off" />';
    return '<label class="po-client-field" for="' + id + '"><span>' + tClient('field_' + k) + '</span>' + input + '</label>';
  };
  const modal = document.createElement('div');
  modal.id = 'po-proj-client-modal';
  modal.className = 'po-dimview-modal po-client-modal';
  modal.innerHTML = '<div class="po-dimview-modal-backdrop" id="po-proj-client-backdrop"></div>'
    + '<div class="po-dimview-modal-card po-client-card">'
    + '<div class="po-dimview-modal-head"><span class="po-dimview-modal-title">' + tClient('title') + '</span>'
    + '<button type="button" class="po-dimview-modal-close" id="po-proj-client-close" aria-label="' + tClient('close') + '">×</button></div>'
    + '<div class="po-dimview-modal-body po-client-body">'
    + campo('name', 'text') + campo('phone', 'tel') + campo('email', 'email') + campo('address', 'text') + campo('notes', 'textarea')
    + '<p class="po-client-hint">' + tClient('hint') + '</p>'
    + '<div class="po-client-actions"><button type="button" class="secondary" id="po-proj-client-ok">' + tClient('ok') + '</button></div>'
    + '</div></div>';
  document.body.appendChild(modal);
  const fechar = () => { onProjectClientFieldChange(); modal.classList.remove('aberto'); };
  document.getElementById('po-proj-client-backdrop').addEventListener('click', fechar);
  document.getElementById('po-proj-client-close').addEventListener('click', fechar);
  document.getElementById('po-proj-client-ok').addEventListener('click', fechar);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal.classList.contains('aberto')) fechar(); });
  PROJECT_CLIENT_FIELDS.forEach((k) => {
    const el = document.getElementById('po-proj-client-' + k);
    if (el) el.addEventListener('change', onProjectClientFieldChange);
  });
}

function openProjectClientModal() {
  ensureProjectClientModal();
  fillProjectClientForm();
  const modal = document.getElementById('po-proj-client-modal');
  modal.classList.add('aberto');
  const first = document.getElementById('po-proj-client-name');
  if (first) setTimeout(() => first.focus(), 30);
}

(function attachProjectClientBtn() {
  const btn = document.getElementById('po-proj-client-btn');
  if (btn) btn.addEventListener('click', openProjectClientModal);
  refreshProjectClientUi();
  // textos da janela seguem o idioma: recria na troca
  if (typeof I18n !== 'undefined' && typeof I18n.onLanguageChange === 'function') {
    I18n.onLanguageChange(() => {
      const m = document.getElementById('po-proj-client-modal');
      if (m) m.remove();
      refreshProjectClientUi();
    });
  }
})();
