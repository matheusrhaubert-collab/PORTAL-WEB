// ============================================================
// NOVO MÓDULO (assistente) — grupo Ferramentas da barra do Projetos (14/10)
// ============================================================
// Pedido do Matt: "quero um botão novo em tools com o ícone do construtor.
// ao clicar abre as duas categorias with ou no back, somente elas, que são
// a base de módulos. abre uma janela mostrando o módulo de frente no 2D, com
// edição de largura, altura e profundidade (na unidade das configurações)
// numa aba. OK verde embaixo, aí passa pra segunda aba, que é o construtor
// que já conhecemos. OK verde e cria o móvel no ambiente."
// E: "não mexe em nada do que já tem hoje. isso é novo e pode usar o que
// tem; quando modificarmos um, já deve modificar nas duas telas."
//
// POR ISSO ESTE ARQUIVO SÓ CHAMA — não reescreve nem altera nada:
//   inserir     -> insertProjectModuleDefault (mesmo da biblioteca, cai no
//                  piso em área livre)
//   medidas     -> projectSlotClampedDimensionMm + recomputeProjectSlotPricing
//                  (mesmo clamp/travas/furadeira do arraste das setas)
//   vista 2D    -> projectSlotElevationHtml (mesma da vista frontal)
//   construtor  -> openProjectModuleBuilder / applyProjectBuilderToSlot /
//                  fecharProjectBuilderModal (a MESMA janela de sempre)
// O Construtor só ganha, ENQUANTO o assistente está ativo, uma faixa de
// abas no cabeçalho e o botão Salvar vira "OK" verde; tudo é desfeito ao
// sair. Cancelar (× / Esc) descarta o módulo novo.
//
// Desfazer: o módulo nasce sem marcar o projeto (insert com overrides não
// marca); a 1ª marcação real é no OK final — um Voltar remove o módulo.

const NM_CATEGORIAS_RE = /cabinets?\s*(with|no)\s*back/i;
let nmState = null; // { slotId, etapa: 'lista'|'medidas'|'construtor', criando }
let nmFiltroCat = '';
let nmBusca = '';

function tNm(k, vars) { return I18n.t('new_module.' + k, vars); }
function nmEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function nmUnit() { return (document.getElementById('po-unit-select') || {}).value || 'mm'; }
function nmSlot() { return nmState ? projectSlots.find((s) => s.id === nmState.slotId) || null : null; }

function nmCategorias() {
  return (categoriesCacheList || []).filter((c) => NM_CATEGORIAS_RE.test(c.name || ''));
}
// Gaveta solta ("Drawer Soft Closet Externa") está cadastrada em Cabinets
// WITH Back, mas não é base de módulo — fica fora da lista (14/10, Matt).
const NM_ESCONDER_RE = /^drawer\b/i;
function nmModulos() {
  const cats = nmCategorias().map((c) => c.id);
  const q = projLibNorm(nmBusca).trim();
  return (allModules || []).filter((m) => m && m.active !== false && !m.is_invisible && !m.project_copy_of
    && cats.includes(m.category_id) && !NM_ESCONDER_RE.test(String(m.name || '').trim())
    && (!nmFiltroCat || m.category_id === nmFiltroCat)
    && (!q || projLibNorm(m.name).indexOf(q) >= 0));
}

// ---------- Janela ----------
function nmEnsureModal() {
  if (document.getElementById('po-nm-modal')) return;
  const m = document.createElement('div');
  m.id = 'po-nm-modal';
  m.className = 'po-dimview-modal po-nm-modal';
  m.innerHTML = '<div class="po-dimview-modal-backdrop"></div>'
    + '<div class="po-dimview-modal-card po-nm-card">'
    + '<div class="po-dimview-modal-head"><span class="po-dimview-modal-title" id="po-nm-title"></span>'
    + '<button type="button" class="po-dimview-modal-close" id="po-nm-close" aria-label="×">×</button></div>'
    + '<div class="po-nm-tabs" id="po-nm-tabs"></div>'
    + '<div class="po-dimview-modal-body po-nm-body" id="po-nm-body"></div>'
    + '<div class="po-nm-foot" id="po-nm-foot"></div>'
    + '</div>';
  document.body.appendChild(m);
  document.getElementById('po-nm-close').addEventListener('click', nmCancelar);
}

function nmTabsHtml(ativa) {
  const tab = (k, n, label) => '<button type="button" class="po-nm-tab' + (ativa === k ? ' ativa' : '')
    + '" data-nm-tab="' + k + '"><span class="po-nm-tab-n">' + n + '</span>' + nmEsc(label) + '</button>';
  return tab('medidas', 1, tNm('tab_sizes')) + tab('construtor', 2, tNm('tab_builder'));
}

function nmAbrir() {
  if (nmState) return;
  nmEnsureModal();
  // Foto do projeto ANTES do módulo novo + tamanho da pilha do Desfazer:
  // no fim (OK ou cancelar) a pilha é reescrita pra criação inteira valer
  // UM passo (as funções reaproveitadas marcam o projeto no meio do caminho).
  nmState = { slotId: null, etapa: 'lista', criando: false,
    undoPilha: projectUndoStack.slice(), undoFoto: projectUndoSnapshot() };
  // começa em "With back" (14/10, Matt)
  const comFundo = nmCategorias().find((c) => /with/i.test(c.name || ''));
  nmFiltroCat = comFundo ? comFundo.id : '';
  nmBusca = '';
  nmRenderLista();
  document.getElementById('po-nm-modal').classList.add('aberto');
}

function nmFecharJanela() {
  const m = document.getElementById('po-nm-modal');
  if (m) m.classList.remove('aberto');
}

// ---------- Etapa 0: escolher o módulo base ----------
function nmRenderLista() {
  document.getElementById('po-nm-title').textContent = tNm('title_pick');
  document.getElementById('po-nm-tabs').innerHTML = '';
  document.getElementById('po-nm-foot').innerHTML = '';
  const cats = nmCategorias();
  const body = document.getElementById('po-nm-body');
  body.innerHTML = '<div class="po-nm-filtros">'
    + '<input type="text" id="po-nm-busca" class="po-nm-busca" autocomplete="off" placeholder="' + nmEsc(tNm('search')) + '" value="' + nmEsc(nmBusca) + '">'
    + '<div class="po-proj-lib-chips">'
    + [{ id: '', nome: tNm('all') }].concat(cats.map((c) => ({ id: c.id, nome: /with/i.test(c.name) ? tNm('cat_with_back') : tNm('cat_no_back') })))
      .map((c) => '<button type="button" class="po-proj-lib-chip' + (nmFiltroCat === c.id ? ' active' : '') + '" data-cat="' + c.id + '">' + nmEsc(c.nome) + '</button>').join('')
    + '</div></div>'
    + '<div class="po-nm-grid" id="po-nm-grid"></div>';
  nmRenderGrid();
  const busca = document.getElementById('po-nm-busca');
  busca.addEventListener('input', () => { nmBusca = busca.value; nmRenderGrid(); });
  body.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => { nmFiltroCat = b.dataset.cat; nmRenderLista(); }));
}

function nmRenderGrid() {
  const grid = document.getElementById('po-nm-grid');
  if (!grid) return;
  const lista = nmModulos();
  if (!nmCategorias().length) { grid.innerHTML = '<div class="po-proj-library-empty">' + nmEsc(tNm('no_categories')) + '</div>'; return; }
  if (!lista.length) { grid.innerHTML = '<div class="po-proj-library-empty">' + nmEsc(I18n.t('step1.no_modules_found')) + '</div>'; return; }
  const u = nmUnit();
  grid.innerHTML = lista.map((m) => '<button type="button" class="po-proj-library-card po-nm-mod" data-mod="' + m.id + '" title="' + nmEsc(m.name) + '">'
    + moduleCardImage(m)
    + '<div class="po-proj-library-card-name">' + nmEsc(m.name) + '</div>'
    + '<div class="po-proj-library-card-dims">' + nmEsc(formatDimension(m.width_default_mm, u) + ' x ' + formatDimension(m.height_default_mm, u) + ' x ' + formatDimension(m.depth_default_mm, u)) + '</div>'
    + '</button>').join('');
  grid.querySelectorAll('[data-mod]').forEach((b) => b.addEventListener('click', () => nmEscolher(b.dataset.mod)));
}

async function nmEscolher(moduleId) {
  if (!nmState || nmState.criando) return;
  nmState.criando = true;
  const grid = document.getElementById('po-nm-grid');
  if (grid) grid.classList.add('carregando');
  try {
    // Mesmo caminho da biblioteca (piso, área livre). Com overrides ele NÃO
    // renderiza nem marca o projeto — o módulo só "existe" de verdade no OK.
    const slot = await insertProjectModuleDefault(moduleId, { fromLibrary: true });
    if (!slot) throw new Error(tNm('err_insert'));
    nmState.slotId = slot.id;
    nmIrMedidas();
  } catch (e) {
    alert((e && e.message) || String(e));
  } finally {
    if (nmState) nmState.criando = false;
    if (grid) grid.classList.remove('carregando');
  }
}

// ---------- Aba 1: medidas + vista 2D ----------
function nmIrMedidas() {
  const slot = nmSlot();
  if (!slot) { nmCancelar(true); return; }
  nmState.etapa = 'medidas';
  document.getElementById('po-nm-modal').classList.add('aberto');
  document.getElementById('po-nm-title').textContent = slot.module.name || '';
  const tabs = document.getElementById('po-nm-tabs');
  tabs.innerHTML = nmTabsHtml('medidas');
  tabs.querySelector('[data-nm-tab="construtor"]').addEventListener('click', () => { nmAplicarCampos(); nmIrConstrutor(); });
  const u = nmUnit();
  const campo = (axis) => {
    const m = slot.module;
    const min = Number(m[axis + '_min_mm']) || 0, max = Number(m[axis + '_max_mm']) || 0;
    const faixa = (min || max) ? '<small>' + nmEsc(formatDimension(min, u)) + ' – ' + nmEsc(max ? formatDimension(max, u) : '∞') + '</small>' : '';
    const travado = (axis === 'width' && m.width_locked) || (axis === 'height' && m.height_locked);
    return '<label class="po-nm-campo"><span>' + nmEsc(tNm('dim_' + axis)) + ' (' + nmEsc(unitAbbrev(u)) + ')' + (travado ? ' 🔒' : '') + '</span>'
      + '<input type="text" inputmode="decimal" data-axis="' + axis + '" value="' + nmEsc(formatDimensionNumber(slot[axis + '_mm'], u)) + '">' + faixa + '</label>';
  };
  document.getElementById('po-nm-body').innerHTML = '<div class="po-nm-medidas">'
    + '<div class="po-nm-vista"><div class="po-nm-cota-w" id="po-nm-cota-w"></div>'
    + '<div class="po-nm-vista-box" id="po-nm-vista"><div class="po-nm-pecas" id="po-nm-pecas"></div>'
    + '<button type="button" class="po-nm-alca po-nm-alca-w" data-alca="width" title="' + nmEsc(tNm('drag_width')) + '">&#8596;</button>'
    + '<button type="button" class="po-nm-alca po-nm-alca-h" data-alca="height" title="' + nmEsc(tNm('drag_height')) + '">&#8597;</button>'
    + '</div><div class="po-nm-cota-h" id="po-nm-cota-h"></div></div>'
    + '<div class="po-nm-campos">' + campo('width') + campo('height') + campo('depth')
    + '<p class="po-nm-dica">' + nmEsc(tNm('sizes_hint')) + '</p></div>'
    + '</div>';
  document.getElementById('po-nm-foot').innerHTML = '<button type="button" class="po-nm-ok" id="po-nm-ok-medidas">' + nmEsc(tNm('ok_next')) + '</button>';
  document.getElementById('po-nm-ok-medidas').addEventListener('click', () => { nmAplicarCampos(); nmIrConstrutor(); });
  document.querySelectorAll('#po-nm-body input[data-axis]').forEach((inp) => {
    inp.addEventListener('change', () => nmAplicarCampos(inp.dataset.axis));
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); nmAplicarCampos(inp.dataset.axis); } });
  });
  nmDesenharVista();
  document.querySelectorAll('#po-nm-vista .po-nm-alca').forEach(nmLigarAlca);
}

// ARRASTAR pelas setas (14/10, Matt: "coloca opção de setas pra arrastar o
// móvel na primeira parte. digitar como está e arrastar também").
// ↔ na borda direita = largura, ↕ no topo = altura (profundidade não aparece
// de frente — fica só no campo). Mesmo clamp do arraste do canvas
// (projectSlotClampedDimensionMm: min/máx, medida travada pula pro valor
// cadastrado, furadeira). Durante o gesto a escala do desenho fica fixa (o
// móvel cresce/encolhe na tela); o preço é recalculado ao soltar.
function nmLigarAlca(alca) {
  alca.addEventListener('pointerdown', (ev) => {
    const slot = nmSlot();
    if (!slot) return;
    ev.preventDefault();
    const axis = alca.dataset.alca;
    const esc = nmEscalaAtual || 1;
    const x0 = ev.clientX, y0 = ev.clientY, v0 = Number(slot[axis + '_mm']) || 0;
    alca.setPointerCapture(ev.pointerId);
    alca.classList.add('arrastando');
    const mover = (e) => {
      const deltaPx = axis === 'width' ? (e.clientX - x0) : (y0 - e.clientY);
      const novo = projectSlotClampedDimensionMm(slot, axis, v0 + deltaPx / esc);
      if (Math.abs(novo - Number(slot[axis + '_mm'])) < 0.01) return;
      slot[axis + '_mm'] = novo;
      const inp = document.querySelector('#po-nm-body input[data-axis="' + axis + '"]');
      if (inp) inp.value = formatDimensionNumber(novo, nmUnit());
      nmDesenharVista(esc);
    };
    const soltar = () => {
      alca.removeEventListener('pointermove', mover);
      alca.removeEventListener('pointerup', soltar);
      alca.removeEventListener('pointercancel', soltar);
      alca.classList.remove('arrastando');
      if (Math.abs(Number(slot[axis + '_mm']) - v0) > 0.01) {
        recomputeProjectSlotPricing(slot);
        if (typeof isFloorSlot === 'function' && isFloorSlot(slot) && typeof clampFloorSlotIntoRoom === 'function') {
          try { clampFloorSlotIntoRoom(slot); } catch (e) { /* mantém */ }
        }
      }
      nmDesenharVista();
    };
    alca.addEventListener('pointermove', mover);
    alca.addEventListener('pointerup', soltar);
    alca.addEventListener('pointercancel', soltar);
  });
}

function nmAplicarCampos(soAxis) {
  const slot = nmSlot();
  if (!slot) return;
  const u = nmUnit();
  let mudou = false;
  document.querySelectorAll('#po-nm-body input[data-axis]').forEach((inp) => {
    const axis = inp.dataset.axis;
    if (soAxis && axis !== soAxis) return;
    const mm = parseDimensionInput(inp.value, u);
    if (Number.isFinite(mm) && mm > 0) {
      const final = projectSlotClampedDimensionMm(slot, axis, mm);
      if (Math.abs(final - Number(slot[axis + '_mm'])) > 0.01) { slot[axis + '_mm'] = final; mudou = true; }
    }
    inp.value = formatDimensionNumber(slot[axis + '_mm'], u);
  });
  if (mudou) {
    recomputeProjectSlotPricing(slot);
    if (typeof isFloorSlot === 'function' && isFloorSlot(slot) && typeof clampFloorSlotIntoRoom === 'function') {
      try { clampFloorSlotIntoRoom(slot); } catch (e) { /* mantém */ }
    }
  }
  nmDesenharVista();
}

let nmEscalaAtual = 1; // px por mm do desenho (fixa durante o arraste)
function nmDesenharVista(escFixa) {
  const slot = nmSlot();
  const box = document.getElementById('po-nm-vista');
  const pecas = document.getElementById('po-nm-pecas');
  if (!slot || !box || !pecas) return;
  const W = Number(slot.width_mm) || 1, H = Number(slot.height_mm) || 1;
  // cabe em 340×340 mantendo a proporção real (no arraste, escala fixa e
  // teto de 520px pra não estourar a janela)
  const esc = escFixa || Math.min(340 / W, 340 / H);
  nmEscalaAtual = esc;
  const e2 = Math.min(esc, 520 / W, 520 / H); // teto sem distorcer
  box.style.width = Math.max(40, W * e2) + 'px';
  box.style.height = Math.max(40, H * e2) + 'px';
  pecas.innerHTML = projectSlotElevationHtml(slot, W, H) || '';
  const u = nmUnit();
  const cw = document.getElementById('po-nm-cota-w');
  const ch = document.getElementById('po-nm-cota-h');
  if (cw) { cw.textContent = formatDimension(W, u); cw.style.width = box.style.width; }
  if (ch) ch.textContent = formatDimension(H, u);
}

// ---------- Aba 2: o Construtor de sempre ----------
async function nmIrConstrutor() {
  const slot = nmSlot();
  if (!slot) return;
  nmState.etapa = 'construtor';
  nmFecharJanela();
  await openProjectModuleBuilder(slot.id);
  nmDecorarConstrutor(true);
}

function nmDecorarConstrutor(liga) {
  const modal = document.getElementById('po-proj-builder-modal');
  if (!modal) return;
  const header = modal.querySelector('.po-proj-builder-header');
  const save = document.getElementById('po-proj-builder-save');
  let faixa = document.getElementById('po-nm-builder-tabs');
  if (liga) {
    if (!faixa && header) {
      faixa = document.createElement('div');
      faixa.id = 'po-nm-builder-tabs';
      faixa.className = 'po-nm-tabs po-nm-tabs-builder';
      header.insertBefore(faixa, header.querySelector('.po-proj-builder-tools'));
    }
    if (faixa) {
      faixa.innerHTML = nmTabsHtml('construtor');
      faixa.querySelector('[data-nm-tab="medidas"]').addEventListener('click', nmVoltarMedidas);
    }
    if (save) {
      if (save.dataset.nmTexto == null) save.dataset.nmTexto = save.textContent;
      save.textContent = tNm('ok_create');
      save.classList.add('po-nm-ok-verde');
    }
  } else {
    if (faixa) faixa.remove();
    if (save && save.dataset.nmTexto != null) {
      save.textContent = save.dataset.nmTexto;
      delete save.dataset.nmTexto;
      save.classList.remove('po-nm-ok-verde');
    }
  }
}

// Volta pra aba Medidas guardando o que já foi montado no Construtor.
function nmVoltarMedidas() {
  if (!nmState) return;
  applyProjectBuilderToSlot();
  nmDecorarConstrutor(false);
  fecharProjectBuilderModal();
  nmIrMedidas();
}

// OK verde do Construtor: o Salvar de sempre já aplicou e fechou (listener
// original); aqui só termina o assistente.
function nmRefazPilhaDesfazer(st, criou) {
  projectUndoStack = criou ? st.undoPilha.concat([st.undoFoto]) : st.undoPilha.slice();
  if (projectUndoStack.length > PROJECT_UNDO_MAX) projectUndoStack.shift();
  projectRedoStack = [];
  projectUndoBaseline = projectUndoSnapshot();
  projectUndoLastPushAt = Date.now();
  refreshProjectUndoButton();
  refreshProjectRedoButton();
}

function nmConcluir() {
  const slot = nmSlot();
  const st = nmState;
  nmDecorarConstrutor(false);
  nmState = null;
  nmFecharJanela();
  if (!slot) return;
  renderProjectCanvas();
  markProjectDirty();
  nmRefazPilhaDesfazer(st, true);
  try { selectProjectSlot(slot.id); } catch (e) { /* ok */ }
}

// Cancelar em qualquer etapa: o módulo novo some.
function nmCancelar(semPergunta) {
  if (!nmState) { nmFecharJanela(); return; }
  if (nmState.slotId != null && semPergunta !== true && !confirm(tNm('confirm_discard'))) return;
  const id = nmState.slotId;
  const noConstrutor = nmState.etapa === 'construtor';
  const st = nmState;
  nmState = null;
  nmDecorarConstrutor(false);
  if (noConstrutor) fecharProjectBuilderModal();
  nmFecharJanela();
  if (id != null) {
    projectSlots = projectSlots.filter((s) => s.id !== id);
    if (selectedProjectSlotId === id) selectedProjectSlotId = null;
    renderProjectCanvas();
    nmRefazPilhaDesfazer(st, false);
  }
}

(function attachNovoModulo() {
  const btn = document.getElementById('po-proj-new-module-btn');
  if (btn) btn.addEventListener('click', nmAbrir);

  // Ganchos no Construtor SÓ enquanto o assistente está nele. Capture = roda
  // antes dos listeners originais, pra o × / Esc / clique fora CANCELAREM
  // (o comportamento normal do × é salvar) — fora do assistente, nada muda.
  const ativoNoConstrutor = () => nmState && nmState.etapa === 'construtor';
  const close = document.getElementById('po-proj-builder-close');
  if (close) close.addEventListener('click', (e) => {
    if (!ativoNoConstrutor()) return;
    e.stopImmediatePropagation();
    nmCancelar();
  }, true);
  const modal = document.getElementById('po-proj-builder-modal');
  if (modal) modal.addEventListener('click', (e) => {
    if (ativoNoConstrutor() && e.target === modal) e.stopImmediatePropagation();
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !nmState) return;
    if (nmState.etapa === 'construtor') {
      if (!modal || !modal.classList.contains('open')) return;
      e.stopImmediatePropagation();
      nmCancelar();
    } else {
      nmCancelar();
    }
  }, true);
  const save = document.getElementById('po-proj-builder-save');
  // Bolha (depois do Salvar original, que aplica e fecha).
  if (save) save.addEventListener('click', () => { if (ativoNoConstrutor()) nmConcluir(); });
  // fundo escuro da janela do assistente = cancelar
  document.addEventListener('click', (e) => {
    if (nmState && e.target && e.target.classList && e.target.classList.contains('po-dimview-modal-backdrop')
      && e.target.parentElement && e.target.parentElement.id === 'po-nm-modal') nmCancelar();
  });
  if (typeof I18n !== 'undefined' && typeof I18n.onLanguageChange === 'function') {
    I18n.onLanguageChange(() => { const m = document.getElementById('po-nm-modal'); if (m && !nmState) m.remove(); });
  }
})();
