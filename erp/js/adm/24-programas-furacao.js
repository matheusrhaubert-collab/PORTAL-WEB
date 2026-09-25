/* Painel admin — PROGRAMAS DE FURAÇÃO (migrations 105 e 106)
 *
 * O catálogo separado que o Matt pediu: "cria uma pasta com programas que eu
 * possa abrir separadamente pelo ERP em um lugar separado com visualizador.
 * Não puxa os furos direto no componente porque fica estranho. Puxa o
 * programa todo."
 *
 * A tela (HTML) mora em adm/telas/programas-furacao.js.
 *
 * RELAÇÃO COM O RESTO
 * -------------------
 *   drilling_patterns       o programa (nome, furos_equivalentes, fura)
 *   drilling_pattern_holes  os furos dele — MESMAS colunas de
 *                           component_drillings, de propósito: o avaliador de
 *                           fórmulas e o gerador do .ban já leem esse formato
 *   module_components.drilling_pattern_id   a escolha, POR USO
 *
 * O desenho reaproveita Drilling._internals (splitThickness/machineDims/
 * resolveDrillingHoleXY) — o mesmo caminho da prévia do componente, pra o que
 * aparece aqui ser exatamente o que a máquina recebe. */

let drillingPatternsList = [];      // catálogo carregado
let dpHolesDraft = [];              // furos em edição (só vão pro banco no Salvar)
let dpSelectedId = null;

const DP_FACES = {
  face: 'Face', verso: 'Verso',
  borda_esq: 'Borda esq.', borda_dir: 'Borda dir.',
  borda_sup: 'Borda sup.', borda_inf: 'Borda inf.'
};

async function loadDrillingPatternsAdmin() {
  const { data, error } = await supabaseClient
    .from('drilling_patterns')
    .select('*')
    .order('sort_order').order('name');
  if (error) { showError('dp-error', error); return; }
  drillingPatternsList = data || [];
  renderDrillingPatternList();
}

function renderDrillingPatternList() {
  const el = document.getElementById('dp-list');
  if (!el) return;
  if (!drillingPatternsList.length) {
    el.innerHTML = '<div class="hint" style="padding:10px;">Nenhum programa ainda. '
      + 'Rode a migration 106 para semear a partir das furações já cadastradas, '
      + 'ou crie um do zero.</div>';
    return;
  }
  el.innerHTML = drillingPatternsList.map((p) => (
    '<button type="button" class="dp-item' + (p.id === dpSelectedId ? ' sel' : '') + '" '
      + 'data-id="' + p.id + '">'
      + '<span class="dp-item-name">' + escapeHtmlDP(p.name) + '</span>'
      + '<span class="dp-item-meta">' + (p.fura === false ? 'sem furo' : (p.furos_equivalentes || 0) + ' eq.') + '</span>'
    + '</button>'
  )).join('');
  el.querySelectorAll('.dp-item').forEach((b) => {
    b.onclick = () => openDrillingPattern(b.dataset.id);
  });
}

function escapeHtmlDP(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

async function openDrillingPattern(id) {
  const p = drillingPatternsList.find((x) => x.id === id);
  if (!p) return;
  dpSelectedId = id;
  const { data, error } = await supabaseClient
    .from('drilling_pattern_holes')
    .select('*')
    .eq('pattern_id', id)
    .order('sort_order');
  if (error) { showError('dp-error', error); return; }
  dpHolesDraft = (data || []).map((h) => ({ ...h }));

  document.getElementById('dp-id').value = p.id;
  document.getElementById('dp-name').value = p.name || '';
  document.getElementById('dp-furos-eq').value = p.furos_equivalentes || 0;
  document.getElementById('dp-fura').value = p.fura === false ? '0' : '1';
  document.getElementById('dp-notes').value = p.notes || '';
  document.getElementById('dp-editor').style.display = '';
  document.getElementById('dp-empty').style.display = 'none';
  renderDrillingPatternList();
  renderDpHoles();
}

function novoDrillingPattern() {
  dpSelectedId = null;
  dpHolesDraft = [];
  document.getElementById('dp-id').value = '';
  document.getElementById('dp-name').value = '';
  document.getElementById('dp-furos-eq').value = 0;
  document.getElementById('dp-fura').value = '1';
  document.getElementById('dp-notes').value = '';
  document.getElementById('dp-editor').style.display = '';
  document.getElementById('dp-empty').style.display = 'none';
  renderDrillingPatternList();
  renderDpHoles();
}

/* ---------- os furos ---------- */
function renderDpHoles() {
  const tb = document.getElementById('dp-holes-tbody');
  if (!tb) return;
  tb.innerHTML = dpHolesDraft.map((h, i) => (
    '<tr>'
    + '<td><select data-f="face" data-i="' + i + '">'
      + Object.keys(DP_FACES).map((k) => (
        '<option value="' + k + '"' + (h.face === k ? ' selected' : '') + '>' + DP_FACES[k] + '</option>'
      )).join('')
    + '</select></td>'
    + '<td><input data-f="x_formula" data-i="' + i + '" value="' + escapeHtmlDP(h.x_formula) + '" style="width:70px"></td>'
    + '<td><input data-f="y_formula" data-i="' + i + '" value="' + escapeHtmlDP(h.y_formula) + '" style="width:70px"></td>'
    + '<td><input data-f="diameter_mm" data-i="' + i + '" value="' + (h.diameter_mm || 0) + '" style="width:52px"></td>'
    + '<td><input data-f="depth_formula" data-i="' + i + '" value="' + escapeHtmlDP(h.depth_formula) + '" style="width:60px"></td>'
    + '<td><input data-f="repeat_count_formula" data-i="' + i + '" value="' + escapeHtmlDP(h.repeat_count_formula) + '" style="width:60px"></td>'
    + '<td><input data-f="repeat_dx_mm" data-i="' + i + '" value="' + (h.repeat_dx_mm || 0) + '" style="width:52px"></td>'
    + '<td><input data-f="repeat_dy_mm" data-i="' + i + '" value="' + (h.repeat_dy_mm || 0) + '" style="width:52px"></td>'
    // CONTRA-FURO (migrations 043/054, e no programa só a partir da 107): é o
    // furo que ESTA linha gera na peça VIZINHA — a lateral que "não tem
    // furação própria" recebe tudo por aqui. Vazio = não propaga.
    + '<td><input data-f="counter_diameter_mm" data-i="' + i + '" value="'
      + (h.counter_diameter_mm == null ? '' : h.counter_diameter_mm) + '" style="width:52px" placeholder="—"></td>'
    + '<td><input data-f="counter_depth_mm" data-i="' + i + '" value="'
      + (h.counter_depth_mm == null ? '' : h.counter_depth_mm) + '" style="width:52px" placeholder="—"></td>'
    + '<td><button type="button" class="danger" data-del="' + i + '">✕</button></td>'
    + '</tr>'
  )).join('');

  tb.querySelectorAll('[data-f]').forEach((el) => {
    el.oninput = el.onchange = () => {
      const i = Number(el.dataset.i);
      if (!dpHolesDraft[i]) return;
      dpHolesDraft[i][el.dataset.f] = el.value;
      renderDpPreview();
    };
  });
  tb.querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = () => {
      dpHolesDraft.splice(Number(b.dataset.del), 1);
      renderDpHoles();
    };
  });
  renderDpPreview();
}

/* ---------- o visualizador ----------
   Mesma convenção do .ban e da prévia do componente: peça DEITADA no plano da
   máquina, X da esquerda, Y da borda de cima. Furo fora da chapa sai vermelho
   porque o gerador o descartaria — é melhor ver aqui do que descobrir na
   máquina. */
function renderDpPreview() {
  const box = document.getElementById('dp-preview');
  const meta = document.getElementById('dp-prev-meta');
  if (!box) return;
  box.innerHTML = '';
  if (typeof Drilling === 'undefined' || !Drilling._internals) {
    box.innerHTML = '<p class="hint">drilling.js não carregou — sem desenho.</p>';
    return;
  }
  const C = parseFloat(document.getElementById('dp-prev-c').value) || 0;
  const L = parseFloat(document.getElementById('dp-prev-l').value) || 0;
  const E = parseFloat(document.getElementById('dp-prev-e').value) || 0;
  if (!(C > 0) || !(L > 0)) return;
  if (meta) meta.textContent = 'Plano da máquina: C ' + Math.round(C) + ' × L ' + Math.round(L)
    + ' mm, espessura E ' + E + ' mm — X da esquerda, Y da borda de cima.';

  const vars = { C: C, L: L, E: E, W: C, H: L };
  const furos = [];
  let ruins = 0;
  dpHolesDraft.forEach((row) => {
    let x, y, prof, n;
    try {
      x = Pricing.evalFormula(row.x_formula || '0', vars);
      y = Pricing.evalFormula(row.y_formula || '0', vars);
      prof = Pricing.evalFormula(row.depth_formula || '0', vars);
      n = Math.max(Math.floor(Pricing.evalFormula(row.repeat_count_formula || '1', vars)), 0);
    } catch (e) { ruins++; return; }
    const dia = parseFloat(row.diameter_mm) || 0;
    for (let k = 0; k < n; k++) {
      const rx = x + k * (parseFloat(row.repeat_dx_mm) || 0);
      const ry = y + k * (parseFloat(row.repeat_dy_mm) || 0);
      const r = Drilling._internals.resolveDrillingHoleXY
        ? (Drilling._internals.resolveDrillingHoleXY({ faceA: C, faceB: L, thickness: E }, row, rx, ry)
           || { face: row.face || 'face', x: rx, y: ry })
        : { face: row.face || 'face', x: rx, y: ry };
      const fora = r.x < -0.01 || r.x > C + 0.01 || r.y < -0.01 || r.y > L + 0.01 || !(dia > 0) || !(prof > 0);
      furos.push({ face: r.face, x: r.x, y: r.y, dia: dia, prof: prof, fora: fora });
    }
  });

  const NS = 'http://www.w3.org/2000/svg';
  const m = Math.max(C, L) * 0.06;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', (-m) + ' ' + (-m) + ' ' + (C + m * 2) + ' ' + (L + m * 2));
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.style.width = '100%';
  svg.style.maxHeight = '360px';
  const sw = Math.max(C, L) / 400;

  const mk = (tag, attrs) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    svg.appendChild(e);
    return e;
  };
  mk('rect', { x: 0, y: 0, width: C, height: L, fill: '#f4f1ea', stroke: '#8d8375', 'stroke-width': sw * 1.5 });

  furos.forEach((f) => {
    const cor = f.fora ? '#d8433c' : '#2f6fb8';
    if (f.face === 'face' || f.face === 'verso') {
      mk('circle', {
        cx: f.x, cy: f.y, r: Math.max(f.dia / 2, sw * 1.5),
        fill: f.face === 'face' ? cor : 'none', stroke: cor, 'stroke-width': sw * 1.2,
        'stroke-dasharray': f.face === 'verso' ? (sw * 3) + ' ' + (sw * 2) : 'none',
        'fill-opacity': 0.55
      });
    } else {
      // furo de borda: retângulo entrando pela lateral, comprimento = profundidade
      const p = Math.max(f.prof, sw * 4);
      const d = Math.max(f.dia, sw * 3);
      const cfg = {
        borda_esq: { x: 0, y: f.y - d / 2, width: p, height: d },
        borda_dir: { x: C - p, y: f.y - d / 2, width: p, height: d },
        borda_sup: { x: f.x - d / 2, y: 0, width: d, height: p },
        borda_inf: { x: f.x - d / 2, y: L - p, width: d, height: p }
      }[f.face];
      if (cfg) mk('rect', Object.assign({ fill: cor, 'fill-opacity': 0.5, stroke: cor, 'stroke-width': sw }, cfg));
    }
  });

  box.appendChild(svg);
  const resumo = document.createElement('p');
  resumo.className = 'hint';
  const nFora = furos.filter((f) => f.fora).length;
  resumo.textContent = furos.length + ' furo(s) no desenho'
    + (nFora ? ' · ' + nFora + ' FORA da chapa (seriam descartados pelo gerador)' : '')
    + (ruins ? ' · ' + ruins + ' linha(s) com fórmula inválida' : '');
  if (nFora || ruins) resumo.style.color = '#98221c';
  box.appendChild(resumo);
}

/* ---------- salvar / duplicar / excluir ---------- */
async function salvarDrillingPattern() {
  clearError('dp-error');
  const nome = document.getElementById('dp-name').value.trim();
  if (!nome) { showError('dp-error', new Error('O programa precisa de um nome.')); return; }

  const payload = {
    name: nome,
    notes: document.getElementById('dp-notes').value.trim() || null,
    furos_equivalentes: parseInt(document.getElementById('dp-furos-eq').value, 10) || 0,
    fura: document.getElementById('dp-fura').value === '1',
    active: true
  };
  const id = document.getElementById('dp-id').value || null;
  if (id) payload.id = id;

  const { data, error } = await supabaseClient
    .from('drilling_patterns').upsert(payload).select('id').single();
  if (error) { showError('dp-error', error); return; }
  const pid = data.id;

  // Furos: apaga e reescreve. É o mesmo padrão da furação do componente —
  // com poucas linhas por programa, reescrever é mais simples (e mais seguro)
  // que diferenciar linha a linha.
  const { error: delErr } = await supabaseClient
    .from('drilling_pattern_holes').delete().eq('pattern_id', pid);
  if (delErr) { showError('dp-error', delErr); return; }

  if (dpHolesDraft.length) {
    const rows = dpHolesDraft.map((h, i) => ({
      pattern_id: pid,
      face: h.face || 'face',
      x_formula: String(h.x_formula || '0'),
      y_formula: String(h.y_formula || '0'),
      diameter_mm: parseFloat(h.diameter_mm) || 5,
      depth_formula: String(h.depth_formula || '10'),
      repeat_count_formula: String(h.repeat_count_formula || '1'),
      repeat_dx_mm: parseFloat(h.repeat_dx_mm) || 0,
      repeat_dy_mm: parseFloat(h.repeat_dy_mm) || 0,
      // Contra-furo: vazio grava NULL (= não propaga), não 0. O gerador testa
      // `> 0`, então 0 e null se comportam igual hoje — mas null é o que
      // significa "não configurado", e é o que component_drillings usa.
      counter_diameter_mm: h.counter_diameter_mm === '' || h.counter_diameter_mm == null
        ? null : (parseFloat(h.counter_diameter_mm) || null),
      counter_depth_mm: h.counter_depth_mm === '' || h.counter_depth_mm == null
        ? null : (parseFloat(h.counter_depth_mm) || null),
      // Contra-furo de FACE (migration 054) preservado tal como veio: a tela
      // ainda não o edita, e reescrever sem mostrar apagaria o que a 107
      // recopiou dos componentes.
      counter_face_diameter_mm: h.counter_face_diameter_mm == null ? null : parseFloat(h.counter_face_diameter_mm),
      counter_face_depth_mm: h.counter_face_depth_mm == null ? null : parseFloat(h.counter_face_depth_mm),
      counter_face_offset_mm: h.counter_face_offset_mm == null ? null : parseFloat(h.counter_face_offset_mm),
      notes: h.notes || null,
      sort_order: i
    }));
    const { error: insErr } = await supabaseClient.from('drilling_pattern_holes').insert(rows);
    if (insErr) { showError('dp-error', insErr); return; }
  }

  await loadDrillingPatternsAdmin();
  await openDrillingPattern(pid);
  alert('Programa salvo.');
}

async function excluirDrillingPattern() {
  const id = document.getElementById('dp-id').value;
  if (!id) return;
  // O vínculo em module_components é ON DELETE sem cascade (referência
  // simples): se alguma peça usa este programa, o banco recusa — e é o certo,
  // apagar em silêncio deixaria a peça sem furação nenhuma.
  if (!confirm('Excluir este programa? Peças que o utilizam perdem a furação.')) return;
  const { error } = await supabaseClient.from('drilling_patterns').delete().eq('id', id);
  if (error) {
    showError('dp-error', new Error(
      'Não deu pra excluir — provavelmente alguma peça de módulo ainda usa este programa. ' + error.message));
    return;
  }
  dpSelectedId = null;
  document.getElementById('dp-editor').style.display = 'none';
  document.getElementById('dp-empty').style.display = '';
  await loadDrillingPatternsAdmin();
}

function duplicarDrillingPattern() {
  document.getElementById('dp-id').value = '';
  const n = document.getElementById('dp-name');
  n.value = (n.value || 'Programa') + ' (cópia)';
  dpSelectedId = null;
  renderDrillingPatternList();
  alert('Cópia preparada — ajuste o nome e clique em Salvar.');
}

/* ---------- ligação dos botões ---------- */
(function ligaProgramasFuracao() {
  const liga = () => {
    const novo = document.getElementById('dp-new-btn');
    if (!novo) return false;   // tela ainda não montada
    novo.onclick = novoDrillingPattern;
    document.getElementById('dp-save-btn').onclick = salvarDrillingPattern;
    document.getElementById('dp-delete-btn').onclick = excluirDrillingPattern;
    document.getElementById('dp-duplicate-btn').onclick = duplicarDrillingPattern;
    document.getElementById('dp-add-hole-btn').onclick = () => {
      dpHolesDraft.push({
        face: 'face', x_formula: '0', y_formula: '0', diameter_mm: 5,
        depth_formula: '10', repeat_count_formula: '1', repeat_dx_mm: 0, repeat_dy_mm: 0
      });
      renderDpHoles();
    };
    ['dp-prev-c', 'dp-prev-l', 'dp-prev-e'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.oninput = renderDpPreview;
    });
    loadDrillingPatternsAdmin();
    return true;
  };
  // A tela é montada pelo ADM depois deste script rodar, então tenta agora e,
  // se ainda não existir, espera o DOM.
  if (!liga()) document.addEventListener('DOMContentLoaded', liga);
})();
