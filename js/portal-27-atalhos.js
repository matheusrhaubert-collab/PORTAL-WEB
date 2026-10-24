// ==========================================================================
// ATALHOS DO PROJETOS — tela de teclado + mouse (2026-10-24)
// ==========================================================================
// Matt: "quero uma tela nova onde mostre todos os botões de ferramentas,
// mostre os botões do mouse (ou Mac) e quero poder configurar um botão de
// acesso fácil a cada ferramenta. Quero criar um padrão de fábrica, mas quero
// também que cada um possa editar seus botões. Tipo zoom, pan, mover, trocar
// de parede o módulo, chamar abertura de porta ou gaveta, régua" — salvo NA
// CONTA (migration 218).
//
// Três camadas, a de cima vence:
//   ATALHO_ACOES[].def (este arquivo)  <  shortcut_defaults (fábrica — o
//   admin edita na própria tela)  <  user_shortcuts (cada conta).
// A conta só grava o que DIFERE da fábrica: o Matt mudar o padrão depois
// chega em todo mundo que não mexeu naquela ação.
//
// Ação de ferramenta = clique no PRÓPRIO botão da barra (btn) — o atalho faz
// exatamente o que o clique faz, sem lógica duplicada. Ação sem botão
// (mover, trocar de parede) chama a mesma função que o painel usa.
// Atalhos fixos que já existiam (Ctrl+Z/Y/C/V, Esc) ficam listados como
// fixos e não podem ser reaproveitados.
// ==========================================================================

const ATALHO_ACOES = [
  // g = grupo, def = padrão do código, btn = botão da barra (clique) OU run,
  // rot = rótulo i18n (sem rot = o title do próprio botão)
  { g: 'view', id: 'fit', def: 'F', btn: 'po-proj-fit-btn' },
  { g: 'view', id: 'zoom_in', def: '=', btn: 'po-proj-zoom-in-btn' },
  { g: 'view', id: 'zoom_out', def: '-', btn: 'po-proj-zoom-out-btn' },
  { g: 'view', id: 'view_front', def: '1', btn: 'po-proj-view-front-btn' },
  { g: 'view', id: 'view_top', def: '2', btn: 'po-proj-view-top-btn' },
  { g: 'view', id: 'persp', def: '3', btn: 'po-proj-camproj-btn' },
  { g: 'view', id: 'ortho', def: '4', btn: 'po-proj-camproj-orto-btn' },
  { g: 'view', id: 'fullscreen', def: 'Shift+F', btn: 'po-proj-fullscreen-btn', rot: 'sc.fullscreen' },
  { g: 'view', id: 'hide_sel', def: 'H', btn: 'po-proj-tb-ocultar-btn' },
  { g: 'view', id: 'show_all', def: 'Shift+H', btn: 'po-proj-tb-mostrar-btn' },
  { g: 'view', id: 'view3d', def: 'V', btn: 'po-proj-view3d-tb-btn' },

  { g: 'measure', id: 'dims', def: 'D', btn: 'po-proj-dims-btn' },
  { g: 'measure', id: 'ruler', def: 'R', btn: 'po-proj-ruler-btn' },
  { g: 'measure', id: 'ruler_clear', def: 'Shift+R', btn: 'po-proj-ruler-clear-btn' },

  { g: 'open', id: 'doors', def: 'O', btn: 'po-proj-tb-doors-btn' },
  { g: 'open', id: 'drawers', def: 'G', btn: 'po-proj-tb-drawers-btn' },

  { g: 'module', id: 'move_left', def: 'ArrowLeft', run: () => atalhoMover('x', -1), rot: 'sc.move_left' },
  { g: 'module', id: 'move_right', def: 'ArrowRight', run: () => atalhoMover('x', 1), rot: 'sc.move_right' },
  { g: 'module', id: 'move_up', def: 'ArrowUp', run: () => atalhoMover('up', 1), rot: 'sc.move_up' },
  { g: 'module', id: 'move_down', def: 'ArrowDown', run: () => atalhoMover('up', -1), rot: 'sc.move_down' },
  { g: 'module', id: 'move_left_fast', def: 'Shift+ArrowLeft', run: () => atalhoMover('x', -10), rot: 'sc.move_left_fast' },
  { g: 'module', id: 'move_right_fast', def: 'Shift+ArrowRight', run: () => atalhoMover('x', 10), rot: 'sc.move_right_fast' },
  { g: 'module', id: 'move_up_fast', def: 'Shift+ArrowUp', run: () => atalhoMover('up', 10), rot: 'sc.move_up_fast' },
  { g: 'module', id: 'move_down_fast', def: 'Shift+ArrowDown', run: () => atalhoMover('up', -10), rot: 'sc.move_down_fast' },
  { g: 'module', id: 'next_wall', def: 'W', run: () => atalhoTrocarParede(1), rot: 'sc.next_wall' },
  { g: 'module', id: 'prev_wall', def: 'Shift+W', run: () => atalhoTrocarParede(-1), rot: 'sc.prev_wall' },
  { g: 'module', id: 'duplicate', def: 'Mod+D', btn: 'po-proj-slot-duplicate-btn', precisaSel: true },
  { g: 'module', id: 'remove', def: 'Delete', btn: 'po-proj-slot-remove-btn', precisaSel: true },
  { g: 'module', id: 'replace', def: '', btn: 'po-proj-slot-replace-btn', precisaSel: true },
  { g: 'module', id: 'pieces', def: '', btn: 'po-proj-slot-pieces-btn', precisaSel: true },

  { g: 'project', id: 'add_cabinet', def: 'A', btn: 'po-proj-library-search-btn' },
  { g: 'project', id: 'new_module', def: 'N', btn: 'po-proj-new-module-btn' },
  { g: 'project', id: 'walls', def: '', btn: 'po-proj-wall-editor-btn' },
  { g: 'project', id: 'structures', def: '', btn: 'po-proj-structures-btn' },
  { g: 'project', id: 'save', def: 'Mod+S', btn: 'po-proj-toolbar-save-btn' },
  { g: 'project', id: 'budget', def: '', btn: 'po-proj-money-tb-btn' },
  { g: 'project', id: 'proposal', def: '', btn: 'po-proj-proposal-btn' },
  { g: 'project', id: 'print', def: 'P', btn: 'po-proj-print-view-btn' },
  { g: 'project', id: 'render', def: '', btn: 'po-proj-render-btn' },
  { g: 'project', id: 'shortcuts', def: 'Shift+/', run: () => abrirTelaAtalhos(), rot: 'sc.title' }
];
const ATALHO_GRUPOS = ['view', 'measure', 'open', 'module', 'project'];
// Já usados por outras partes do portal — não dá pra reaproveitar.
const ATALHO_FIXOS = [
  { k: 'Mod+Z', rot: 'sc.fixed_undo' }, { k: 'Mod+Y', rot: 'sc.fixed_redo' }, { k: 'Mod+Shift+Z', rot: 'sc.fixed_redo' },
  { k: 'Mod+C', rot: 'sc.fixed_copy' }, { k: 'Mod+V', rot: 'sc.fixed_paste' }, { k: 'Escape', rot: 'sc.fixed_esc' }
];
const ATALHO_EH_MAC = /Mac|iPhone|iPad|iPod/i.test((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || navigator.userAgent || '');

let atalhoFabrica = {};   // shortcut_defaults.bindings
let atalhoConta = {};     // user_shortcuts.bindings
let atalhoEhAdmin = false;
let atalhoCarregado = false;

function atalhoPadraoCodigo() {
  const o = {};
  ATALHO_ACOES.forEach((a) => { o[a.id] = a.def; });
  return o;
}
function atalhoMapaFabrica() { return Object.assign(atalhoPadraoCodigo(), atalhoFabrica || {}); }
function atalhoMapaEfetivo() { return Object.assign(atalhoMapaFabrica(), atalhoConta || {}); }

function atalhoEsc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------- tecla <-> texto ----------
// Letra/número pelo CÓDIGO físico da tecla (não muda com layout ABNT/US nem
// com Shift apertado); o resto pelo nome da tecla. "Mod" = Ctrl ou ⌘.
function atalhoTeclaDoEvento(ev) {
  const c = ev.code || '';
  let k = null;
  if (/^Key[A-Z]$/.test(c)) k = c.slice(3);
  else if (/^Digit[0-9]$/.test(c)) k = c.slice(5);
  else if (/^Numpad[0-9]$/.test(c)) k = c.slice(6);
  else if (c === 'Minus' || c === 'NumpadSubtract') k = '-';
  else if (c === 'Equal' || c === 'NumpadAdd') k = '=';
  else {
    const mapa = { Slash: '/', IntlRo: '/', Period: '.', Comma: ',', BracketLeft: '[', BracketRight: ']', Backquote: '`', Semicolon: ';', Quote: "'", Backslash: '\\', Space: 'Space' };
    if (mapa[c]) k = mapa[c];
    else {
      k = ev.key;
      if (!k || ['Control', 'Shift', 'Alt', 'Meta', 'OS', 'AltGraph', 'CapsLock', 'Dead', 'Unidentified'].includes(k)) return null;
      if (k.length === 1) k = k.toUpperCase();
    }
  }
  const mods = [];
  if (ev.ctrlKey || ev.metaKey) mods.push('Mod');
  if (ev.altKey) mods.push('Alt');
  if (ev.shiftKey) mods.push('Shift');
  return mods.concat(k).join('+');
}
function atalhoTexto(combo) {
  if (!combo) return '';
  if (combo === 'Shift+/') return '?';
  const nomes = {
    Mod: ATALHO_EH_MAC ? '⌘' : 'Ctrl', Alt: ATALHO_EH_MAC ? '⌥' : 'Alt', Shift: ATALHO_EH_MAC ? '⇧' : 'Shift',
    ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Delete: 'Del', Backspace: '⌫',
    Enter: '↵', Space: I18n.t('sc.key_space'), PageUp: 'PgUp', PageDown: 'PgDn', Escape: 'Esc'
  };
  return combo.split('+').map((p) => nomes[p] || p).join(ATALHO_EH_MAC ? '' : ' + ');
}

// ---------- rótulo / ícone da ação ----------
function atalhoBotao(a) { return a.btn ? document.getElementById(a.btn) : null; }
function atalhoRotulo(a) {
  if (a.rot) return I18n.t(a.rot);
  const b = atalhoBotao(a);
  if (!b) return a.id;
  const k = b.getAttribute('data-i18n-title') || b.getAttribute('data-i18n-aria-label');
  const t = k ? I18n.t(k) : '';
  const txt = (t && t !== k) ? t : (b.title || b.getAttribute('aria-label') || a.id);
  return txt.replace(/\s*\[[^\]]*\]$/, '').replace(/\s*\(.*\)\s*$/, '');
}
function atalhoIcone(a) {
  const b = atalhoBotao(a);
  const svg = b && b.querySelector('svg:not(.po-tb-dd-caret)');
  if (svg) return svg.outerHTML;
  const glifos = { move_left: '←', move_right: '→', move_up: '↑', move_down: '↓', move_left_fast: '⇇', move_right_fast: '⇉', move_up_fast: '⇈', move_down_fast: '⇊', next_wall: '⤳', prev_wall: '⤶', shortcuts: '⌨' };
  return '<span class="po-sc-glyph">' + (glifos[a.id] || '•') + '</span>';
}

// ---------- ações sem botão ----------
function atalhoSlotSelecionado() {
  if (typeof selectedProjectSlotId === 'undefined' || selectedProjectSlotId == null) return null;
  return (projectSlots || []).find((s) => s.id === selectedProjectSlotId) || null;
}
// up = altura na parede / profundidade na ilha. Passo = o mesmo da
// "Movimentação" do painel (projectMoveStepMm), x10 nas versões rápidas.
function atalhoMover(eixo, mult) {
  const s = atalhoSlotSelecionado();
  if (!s) return false;
  const passo = (typeof projectMoveStepMm !== 'undefined' ? Number(projectMoveStepMm) || 1 : 1) * mult;
  const chao = (typeof isFloorSlot === 'function') && isFloorSlot(s);
  const axis = eixo === 'x' ? 'x' : (chao ? 'z' : 'y');
  const delta = (eixo === 'up' && chao) ? -passo : passo;   // ilha: ↑ = pra trás
  if (typeof pushProjectUndoState === 'function') pushProjectUndoState();
  if (typeof nudgeProjectGroup === 'function' && nudgeProjectGroup(s, axis, delta)) return true;
  if (chao) nudgeProjectFloorSlot(s, axis, delta); else nudgeProjectWallSlot(s, axis, delta);
  return true;
}
function atalhoTrocarParede(dir) {
  const s = atalhoSlotSelecionado();
  if (!s || ((typeof isFloorSlot === 'function') && isFloorSlot(s))) return false;
  const paredes = (typeof getProjectWallGeometry === 'function') ? getProjectWallGeometry() : [];
  if (paredes.length < 2) return false;
  const n = paredes.length;
  const novo = ((Number(s.wall_index || 0) + dir) % n + n) % n;
  if (typeof pushProjectUndoState === 'function') pushProjectUndoState();
  convertProjectSlotToWall(s, novo, Number(s.x_mm || 0), Number(s.floor_height_mm || 0));
  renderProjectCanvas();
  if (typeof renderProjectConfigPanel === 'function') renderProjectConfigPanel();
  markProjectDirty();
  return true;
}

// ---------- disparo ----------
function atalhoEmCampo(t) {
  return !!(t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || '')));
}
function atalhoModalAberto() {
  return !!document.querySelector('[id$="-modal"].open, .modal.open, .po-modal.open, #po-sc-modal.open');
}
document.addEventListener('keydown', (ev) => {
  if (ev.defaultPrevented) return;
  if (ev.repeat && !/^Arrow/.test(ev.key)) return;   // segurar a seta anda contínuo
  const tab = document.getElementById('po-tab-projects');
  if (!tab || tab.style.display === 'none') return;
  if (atalhoEmCampo(ev.target) || atalhoEmCampo(document.activeElement)) return;
  if (atalhoModalAberto() || document.body.classList.contains('po-proj-3d-overlay')) return;
  const combo = atalhoTeclaDoEvento(ev);
  if (!combo || ATALHO_FIXOS.some((f) => f.k === combo)) return;
  const mapa = atalhoMapaEfetivo();
  const acao = ATALHO_ACOES.find((a) => mapa[a.id] && mapa[a.id] === combo);
  if (!acao) return;
  // Delete com cota da régua selecionada é da régua (portal-06c), não do módulo
  if (acao.id === 'remove' && typeof projectRulerSelectedIndex !== 'undefined' && projectRulerSelectedIndex != null) return;
  if (acao.precisaSel && !atalhoSlotSelecionado()) return;
  let fez = false;
  if (acao.run) fez = acao.run() !== false;
  else {
    const b = atalhoBotao(acao);
    if (b && !b.disabled) { b.click(); fez = true; }
  }
  if (fez) ev.preventDefault();
});

// ---------- dados (Supabase, migration 218) ----------
async function atalhoUid() {
  const sess = await supabaseClient.auth.getSession();
  return (sess && sess.data && sess.data.session && sess.data.session.user && sess.data.session.user.id) || null;
}
async function atalhoCarregar() {
  try {
    const uid = await atalhoUid();
    if (!uid) return;
    const [fab, conta, adm] = await Promise.all([
      supabaseClient.from('shortcut_defaults').select('bindings').eq('id', true).maybeSingle(),
      supabaseClient.from('user_shortcuts').select('bindings').eq('user_id', uid).maybeSingle(),
      supabaseClient.rpc('is_admin')
    ]);
    atalhoFabrica = (fab && !fab.error && fab.data && fab.data.bindings) || {};
    atalhoConta = (conta && !conta.error && conta.data && conta.data.bindings) || {};
    atalhoEhAdmin = !!(adm && !adm.error && adm.data === true);
    atalhoCarregado = !(fab && fab.error);
    atalhoAtualizarTitulos();
  } catch (e) { /* sem tabela (migration 218 não rodou): fica no padrão do código */ }
}
// Só o que difere da base vai pro banco.
function atalhoDiff(mapa, base) {
  const o = {};
  Object.keys(mapa).forEach((id) => { if ((mapa[id] || '') !== (base[id] || '')) o[id] = mapa[id] || ''; });
  return o;
}
async function atalhoSalvar(rascunho, comoFabrica) {
  const uid = await atalhoUid();
  if (!uid) throw new Error(I18n.t('sc.need_login'));
  const agora = new Date().toISOString();
  if (comoFabrica) {
    const bindings = atalhoDiff(rascunho, atalhoPadraoCodigo());
    const { error } = await supabaseClient.from('shortcut_defaults').upsert({ id: true, bindings, updated_at: agora, updated_by: uid });
    if (error) throw error;
    atalhoFabrica = bindings;
  } else {
    const bindings = atalhoDiff(rascunho, atalhoMapaFabrica());
    const { error } = await supabaseClient.from('user_shortcuts').upsert({ user_id: uid, bindings, updated_at: agora });
    if (error) throw error;
    atalhoConta = bindings;
  }
  atalhoAtualizarTitulos();
}

// Mostra o atalho no balãozinho do botão da barra: "Ajustar à tela [F]".
function atalhoAtualizarTitulos() {
  const mapa = atalhoMapaEfetivo();
  ATALHO_ACOES.forEach((a) => {
    const b = atalhoBotao(a);
    if (!b) return;
    const base = (b.title || '').replace(/\s*\[[^\]]*\]$/, '');
    b.title = mapa[a.id] ? base + ' [' + atalhoTexto(mapa[a.id]) + ']' : base;
  });
}

// ---------- tela ----------
let atalhoRascunho = null;
let atalhoModoFabrica = false;
let atalhoGravando = null;   // id da ação esperando a tecla

function atalhoMouseSvg(destaque) {
  // destaque: 'left' | 'middle' | 'right' | 'mid+right' | 'wheel'
  const on = (p) => ((destaque === p || (destaque === 'mid+right' && (p === 'middle' || p === 'right'))) ? ' on' : '');
  return `<svg class="po-sc-mouse" viewBox="0 0 60 90" aria-hidden="true">
    <path class="corpo" d="M30 4C16 4 6 15 6 30v28c0 16 11 28 24 28s24-12 24-28V30C54 15 44 4 30 4z"/>
    <path class="botao${on('left')}" d="M30 4C16 4 6 15 6 30v6h24V4z"/>
    <path class="botao${on('right')}" d="M30 4c14 0 24 11 24 26v6H30V4z"/>
    <rect class="roda${on('middle')}${destaque === 'wheel' ? ' on' : ''}" x="26" y="12" width="8" height="16" rx="4"/>
    ${destaque === 'wheel' ? '<path class="seta" d="M30 8V1M27 4l3-3 3 3M30 32v7M27 36l3 3 3-3"/>' : ''}
  </svg>`;
}
function atalhoTrackpadSvg(dedos) {
  const pts = dedos === 'pinch'
    ? '<circle class="dedo" cx="34" cy="28" r="5"/><circle class="dedo" cx="56" cy="42" r="5"/><path class="seta" d="M40 33l10 4"/>'
    : '<circle class="dedo" cx="38" cy="35" r="5"/><circle class="dedo" cx="52" cy="35" r="5"/>';
  return `<svg class="po-sc-mouse" viewBox="0 0 90 70" aria-hidden="true"><rect class="corpo" x="5" y="8" width="80" height="54" rx="8"/>${pts}</svg>`;
}
function atalhoHtmlMouse(mac) {
  const linhas = mac ? [
    [atalhoTrackpadSvg(), 'sc.mac_two_fingers', 'sc.do_pan'],
    [atalhoTrackpadSvg('pinch'), 'sc.mac_pinch', 'sc.do_zoom'],
    [atalhoTrackpadSvg(), 'sc.mac_option_two', 'sc.do_rotate'],
    [atalhoMouseSvg('left'), 'sc.mac_option_drag', 'sc.do_rotate'],
    [atalhoMouseSvg('left'), 'sc.mac_space_drag', 'sc.do_pan'],
    [atalhoMouseSvg('left'), 'sc.mouse_left', 'sc.do_select'],
    [atalhoMouseSvg('left'), 'sc.mouse_dbl', 'sc.do_edit']
  ] : [
    [atalhoMouseSvg('left'), 'sc.mouse_left', 'sc.do_select'],
    [atalhoMouseSvg('left'), 'sc.mouse_dbl', 'sc.do_edit'],
    [atalhoMouseSvg('wheel'), 'sc.mouse_wheel', 'sc.do_zoom'],
    [atalhoMouseSvg('middle'), 'sc.mouse_middle_drag', 'sc.do_pan'],
    [atalhoMouseSvg('mid+right'), 'sc.mouse_mid_right', 'sc.do_rotate'],
    [atalhoMouseSvg('right'), 'sc.mouse_right_drag', 'sc.do_reposition'],
    [atalhoMouseSvg('right'), 'sc.mouse_right_click', 'sc.do_menu']
  ];
  return `<div class="po-sc-mouse-grid">${linhas.map((l) => `<div class="po-sc-mouse-item">${l[0]}<div><b>${I18n.t(l[2])}</b><span>${I18n.t(l[1])}</span></div></div>`).join('')}</div>
    <p class="hint">${I18n.t('sc.mouse_note')}</p>`;
}
function atalhoHtmlTeclado() {
  const base = atalhoModoFabrica ? atalhoPadraoCodigo() : atalhoMapaFabrica();
  let html = '';
  ATALHO_GRUPOS.forEach((g) => {
    const acoes = ATALHO_ACOES.filter((a) => a.g === g && (a.run || atalhoBotao(a)));
    if (!acoes.length) return;
    html += `<h4 class="po-sc-grupo">${I18n.t('sc.group_' + g)}</h4><div class="po-sc-lista">`;
    acoes.forEach((a) => {
      const v = atalhoRascunho[a.id] || '';
      const mudou = v !== (base[a.id] || '');
      const gravando = atalhoGravando === a.id;
      html += `<div class="po-sc-linha${mudou ? ' mudou' : ''}">
        <span class="po-sc-ico">${atalhoIcone(a)}</span>
        <span class="po-sc-nome">${atalhoEsc(atalhoRotulo(a))}${mudou ? ` <em>${I18n.t(atalhoModoFabrica ? 'sc.changed_factory' : 'sc.changed')}</em>` : ''}</span>
        <button type="button" class="po-sc-tecla${gravando ? ' gravando' : ''}${v ? '' : ' vazia'}" data-acao="${a.id}" title="${I18n.t('sc.click_to_change')}">${gravando ? I18n.t('sc.press_key') : (v ? atalhoEsc(atalhoTexto(v)) : I18n.t('sc.none'))}</button>
        <button type="button" class="po-sc-limpar" data-limpar="${a.id}" title="${I18n.t('sc.clear')}" ${v ? '' : 'disabled'}>×</button>
      </div>`;
    });
    html += '</div>';
  });
  const fixosUnicos = ATALHO_FIXOS.filter((f, i, arr) => arr.findIndex((x) => x.rot === f.rot) === i);
  html += `<h4 class="po-sc-grupo">${I18n.t('sc.group_fixed')}</h4><div class="po-sc-lista">${
    fixosUnicos.map((f) => `<div class="po-sc-linha fixo"><span class="po-sc-ico"><span class="po-sc-glyph">🔒</span></span>
      <span class="po-sc-nome">${I18n.t(f.rot)}</span>
      <span class="po-sc-tecla fixa">${ATALHO_FIXOS.filter((x) => x.rot === f.rot).map((x) => atalhoTexto(x.k)).join(' / ')}</span><span></span></div>`).join('')
  }</div>`;
  return html;
}

function atalhoRenderTela() {
  const m = document.getElementById('po-sc-modal');
  if (!m) return;
  const aba = m.dataset.aba || 'keys';
  const mac = m.dataset.so ? m.dataset.so === 'mac' : ATALHO_EH_MAC;
  const corpo = m.querySelector('.po-sc-corpo');
  const rolagem = corpo.scrollTop;
  corpo.innerHTML = aba === 'mouse'
    ? `<div class="po-sc-so"><button type="button" data-so="win" class="${mac ? '' : 'ativo'}">Windows</button><button type="button" data-so="mac" class="${mac ? 'ativo' : ''}">Mac</button></div>${atalhoHtmlMouse(mac)}`
    : `${atalhoModoFabrica ? `<p class="po-sc-aviso">${I18n.t('sc.factory_editing')}</p>` : ''}${atalhoHtmlTeclado()}`;
  corpo.scrollTop = rolagem;
  m.querySelectorAll('.po-sc-abas button').forEach((b) => b.classList.toggle('ativo', b.dataset.aba === aba));
  m.querySelector('.po-sc-rodape').style.display = aba === 'mouse' ? 'none' : '';
  const fabBox = m.querySelector('.po-sc-fab-wrap');
  if (fabBox) fabBox.style.display = atalhoEhAdmin ? '' : 'none';
}

function atalhoMsg(txt, erro) {
  const el = document.querySelector('#po-sc-modal .po-sc-msg');
  if (!el) return;
  el.textContent = txt || '';
  el.classList.toggle('erro', !!erro);
}

function abrirTelaAtalhos() {
  let m = document.getElementById('po-sc-modal');
  if (!m) {
    m = document.createElement('div');
    m.id = 'po-sc-modal';
    m.innerHTML = `<div class="po-sc-card" role="dialog" aria-modal="true">
      <button type="button" class="po-auth-modal-close po-sc-fechar" aria-label="×">&times;</button>
      <h2>${I18n.t('sc.title')}</h2>
      <p class="hint">${I18n.t('sc.subtitle')}</p>
      <div class="po-sc-abas"><button type="button" data-aba="keys">⌨ ${I18n.t('sc.tab_keys')}</button><button type="button" data-aba="mouse">🖱 ${I18n.t('sc.tab_mouse')}</button></div>
      <div class="po-sc-corpo"></div>
      <div class="po-sc-rodape">
        <label class="po-sc-fab-wrap"><input type="checkbox" class="po-sc-fab"> ${I18n.t('sc.edit_factory')}</label>
        <span class="po-sc-msg"></span>
        <button type="button" class="secondary po-sc-restaurar">${I18n.t('sc.restore')}</button>
        <button type="button" class="po-sc-salvar">${I18n.t('sc.save')}</button>
      </div></div>`;
    document.body.appendChild(m);
    const fechar = () => { atalhoGravando = null; m.classList.remove('open'); };
    m.addEventListener('click', async (ev) => {
      if (ev.target === m || ev.target.closest('.po-sc-fechar')) { fechar(); return; }
      const aba = ev.target.closest('.po-sc-abas button');
      if (aba) { m.dataset.aba = aba.dataset.aba; atalhoGravando = null; atalhoRenderTela(); return; }
      const so = ev.target.closest('.po-sc-so button');
      if (so) { m.dataset.so = so.dataset.so; atalhoRenderTela(); return; }
      const tecla = ev.target.closest('.po-sc-tecla[data-acao]');
      if (tecla) { atalhoGravando = atalhoGravando === tecla.dataset.acao ? null : tecla.dataset.acao; atalhoMsg(''); atalhoRenderTela(); return; }
      const limpar = ev.target.closest('[data-limpar]');
      if (limpar) { atalhoRascunho[limpar.dataset.limpar] = ''; atalhoGravando = null; atalhoRenderTela(); return; }
      if (ev.target.closest('.po-sc-restaurar')) {
        atalhoRascunho = atalhoModoFabrica ? atalhoPadraoCodigo() : atalhoMapaFabrica();
        atalhoGravando = null;
        atalhoMsg(I18n.t('sc.restored_hint'));
        atalhoRenderTela();
        return;
      }
      const salvar = ev.target.closest('.po-sc-salvar');
      if (salvar) {
        salvar.disabled = true;
        try {
          await atalhoSalvar(atalhoRascunho, atalhoModoFabrica);
          atalhoMsg(I18n.t(atalhoModoFabrica ? 'sc.saved_factory' : 'sc.saved'));
          atalhoRenderTela();
        } catch (e) { atalhoMsg(I18n.t('sc.save_error', { msg: (e && e.message) || String(e) }), true); }
        salvar.disabled = false;
      }
    });
    m.addEventListener('change', (ev) => {
      if (!ev.target.classList.contains('po-sc-fab')) return;
      atalhoModoFabrica = ev.target.checked;
      atalhoRascunho = atalhoModoFabrica ? atalhoMapaFabrica() : atalhoMapaEfetivo();
      atalhoGravando = null;
      atalhoMsg('');
      atalhoRenderTela();
    });
    // Gravação da tecla — em CAPTURA na janela, antes de qualquer outro
    // atalho do portal (senão apertar "R" pra gravar ligaria a régua).
    window.addEventListener('keydown', (ev) => {
      if (!m.classList.contains('open')) return;
      if (!atalhoGravando) {
        if (ev.key === 'Escape') { ev.stopImmediatePropagation(); fechar(); }
        return;
      }
      ev.preventDefault();
      ev.stopImmediatePropagation();
      if (ev.key === 'Escape' && !ev.ctrlKey && !ev.metaKey && !ev.shiftKey && !ev.altKey) { atalhoGravando = null; atalhoRenderTela(); return; }
      const combo = atalhoTeclaDoEvento(ev);
      if (!combo) return;   // só o modificador apertado até agora
      if (ATALHO_FIXOS.some((f) => f.k === combo) || (ATALHO_EH_MAC && combo === 'Space')) {
        atalhoMsg(I18n.t('sc.reserved', { key: atalhoTexto(combo) }), true);
        return;
      }
      const dono = ATALHO_ACOES.find((a) => a.id !== atalhoGravando && atalhoRascunho[a.id] === combo);
      if (dono) {
        atalhoRascunho[dono.id] = '';
        atalhoMsg(I18n.t('sc.moved_from', { key: atalhoTexto(combo), action: atalhoRotulo(dono) }));
      } else atalhoMsg('');
      atalhoRascunho[atalhoGravando] = combo;
      atalhoGravando = null;
      atalhoRenderTela();
    }, true);
  }
  atalhoModoFabrica = false;
  const cb = m.querySelector('.po-sc-fab');
  if (cb) cb.checked = false;
  atalhoRascunho = atalhoMapaEfetivo();
  atalhoGravando = null;
  m.dataset.aba = m.dataset.aba || 'keys';
  atalhoMsg(atalhoCarregado ? '' : I18n.t('sc.not_loaded'));
  atalhoRenderTela();
  m.classList.add('open');
}

(function attachAtalhos() {
  const btn = document.getElementById('po-proj-shortcuts-btn');
  if (btn) btn.addEventListener('click', abrirTelaAtalhos);
  if (typeof supabaseClient === 'undefined' || !supabaseClient.auth) return;
  atalhoCarregar();
  try {
    supabaseClient.auth.onAuthStateChange((ev) => {
      if (ev === 'SIGNED_OUT') { atalhoConta = {}; atalhoEhAdmin = false; return; }
      if (ev === 'SIGNED_IN' || ev === 'USER_UPDATED') atalhoCarregar();
    });
  } catch (e) { /* ok */ }
})();
