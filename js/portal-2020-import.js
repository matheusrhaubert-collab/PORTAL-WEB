// ============================================================
// Importar do 2020 — Item List → projeto Legno (aba Projetos)
// ============================================================
// Pedido do Matt (2026-09-14/17, ver claude/importador-2020-crosswalk-
// catalogo.md no projeto Claude): ler o relatório "Item List" que o 2020
// Design exporta (código + quantidade — SEM posição 3D real ainda), casar
// cada código com um módulo do catálogo Legno via
// module_dimension_presets.reference (mesma coluna já usada pra Base/
// gaveteiro/painel), e criar os módulos no projeto ATUAL da aba Projetos.
//
// Reaproveita de propósito o mesmo motor que o Gerador por IA
// (portal-06b-projetos-canvas-ia-custo.js) já usa — layoutProjectAiItems()
// pro posicionamento (fileira chão + fileira suspensa, esquerda pra
// direita) e insertProjectModuleDefault() pra criar cada slot com preço de
// verdade (pricing.js). Não existe atalho "código → preço": cada peça é
// precificada pelo motor normal, do jeito que precifica qualquer módulo
// inserido na mão.
//
// Meta declarada pelo Matt: isto vira a BASE do projeto, e depois (fase
// separada, ainda não feita — decodificar .dae/.kit) a posição real de cada
// peça é carregada em cima. Por isso os módulos entram numa parede
// sequencial só — nada aqui tenta adivinhar posição 3D real.
//
// Regra confirmada com o Matt desde a 1ª rodada: código sem módulo Legno
// equivalente NUNCA vira placeholder nem some silenciosamente — fica numa
// lista à parte. O mesmo vale pra referência AMBÍGUA (cadastrada em mais de
// um módulo ao mesmo tempo — bug real já encontrado com BD09-42).

let projectImport2020Result = null; // { matched, unmatched, ambiguous } da última análise

// ---------- Passo 1: parse do texto colado ----------
//
// Espera o texto extraído com layout preservado (ex: `pdftotext -layout` do
// PDF "Items"/"Item List"/"Parts List" do 2020, ou copiar/colar direto do
// relatório). Cada linha de item vem como:
//   "<#>   <Qty>   <Usercode>   <Manuf Code>   [Type]   <Catalog>   [Finished Side]"
// "Type" costuma vir em branco — por isso o parser não conta colunas fixas,
// só ancora no número inicial (# ou #.# de sub-item) e na quantidade, e
// pega Usercode/Manuf Code/Catalog/Finished Side como tokens sem espaço.
function parseProjectImport2020Text(text) {
  const rows = [];
  const lines = String(text || '').split(/\r?\n/);
  const lineRe = /^\s*(\d+(?:\.\d+)?)\s+(\d+)\s+(\S+)\s+(\S+)\s+(\S+)(?:\s+(\S+))?\s*$/;
  lines.forEach((line) => {
    const m = line.match(lineRe);
    if (!m) return;
    const [, seq, qtyStr, usercode, manufCode, catalog, finishedSide] = m;
    if (usercode.toLowerCase() === 'usercode') return; // linha de cabeçalho
    const qty = parseInt(qtyStr, 10);
    if (!qty || qty <= 0) return;
    rows.push({
      seq,
      qty,
      code: usercode.trim(),
      manufCode: manufCode.trim(),
      catalog: catalog.trim(),
      finishedSide: finishedSide || null
    });
  });
  return rows;
}

// ---------- Passo 2: casamento código → módulo Legno ----------
//
// Fonte da verdade: module_dimension_presets.reference. Busca todas as
// presets com referência cadastrada de uma vez (catálogo não é grande) e
// casa em memória, sem depender de maiúscula/minúscula.
async function matchProjectImport2020Codes(rows) {
  const { data: presetRows, error } = await supabaseClient
    .from('module_dimension_presets')
    .select('module_id, dimension, value_mm, reference')
    .not('reference', 'is', null);
  if (error) throw new Error(error.message || String(error));

  // referenceUpper -> Map(module_id -> {width, height, depth})
  const byRef = new Map();
  (presetRows || []).forEach((p) => {
    const ref = String(p.reference || '').trim().toUpperCase();
    if (!ref) return;
    if (!byRef.has(ref)) byRef.set(ref, new Map());
    const byModule = byRef.get(ref);
    if (!byModule.has(p.module_id)) byModule.set(p.module_id, {});
    byModule.get(p.module_id)[p.dimension] = Number(p.value_mm) || null;
  });

  const matched = [];
  const unmatched = [];
  const ambiguous = [];

  rows.forEach((row) => {
    const ref = row.code.toUpperCase();
    const byModule = byRef.get(ref);
    if (!byModule || byModule.size === 0) {
      unmatched.push(row);
      return;
    }
    if (byModule.size > 1) {
      // Achado real da investigação (ex: BD09-42 cadastrado em 3 módulos
      // diferentes ao mesmo tempo) — nunca escolher um sozinho.
      ambiguous.push({ ...row, moduleIds: Array.from(byModule.keys()) });
      return;
    }
    const [moduleId, dims] = Array.from(byModule.entries())[0];
    const m = allModules.find((mm) => mm.id === moduleId);
    if (!m || m.active === false) {
      unmatched.push(row);
      return;
    }
    matched.push({
      ...row,
      module_id: moduleId,
      module_name: m.name,
      mount_type: m.mount_type || 'floor',
      is_decoration: !!m.is_decoration,
      width_mm: dims.width || Number(m.width_default_mm) || 0,
      height_mm: dims.height || null // null = insertProjectModuleDefault usa o default do módulo
    });
  });

  return { matched, unmatched, ambiguous };
}

// ---------- Modal: abrir/fechar/status ----------

function openProjectImport2020Modal() {
  const modal = document.getElementById('po-proj-import2020-modal');
  if (!modal) return;
  projectImport2020Result = null;
  const textEl = document.getElementById('po-proj-import2020-text');
  if (textEl) { textEl.value = ''; textEl.style.display = 'none'; }
  const reviewEl = document.getElementById('po-proj-import2020-review');
  if (reviewEl) { reviewEl.innerHTML = ''; reviewEl.style.display = 'none'; }
  const createBtn = document.getElementById('po-proj-import2020-create-btn');
  if (createBtn) createBtn.style.display = 'none';
  // "Processar lista" só aparece no fluxo manual (colar texto) — no fluxo
  // normal (anexar PDF) o processamento roda sozinho assim que o arquivo é
  // lido, sem precisar de clique extra ("quote sozinho num clique").
  const processBtn = document.getElementById('po-proj-import2020-process-btn');
  if (processBtn) { processBtn.style.display = 'none'; processBtn.disabled = false; }
  const pdfInput = document.getElementById('po-proj-import2020-pdf-input');
  if (pdfInput) pdfInput.value = '';
  const pdfBtn = document.getElementById('po-proj-import2020-pdf-btn');
  if (pdfBtn) pdfBtn.disabled = false;
  const filenameEl = document.getElementById('po-proj-import2020-pdf-filename');
  if (filenameEl) filenameEl.textContent = '';
  const manualLink = document.getElementById('po-proj-import2020-manual-link');
  if (manualLink) manualLink.parentElement.style.display = '';
  setProjectImport2020Error('');
  setProjectImport2020Status('');
  modal.classList.add('open');
}

function closeProjectImport2020Modal() {
  const modal = document.getElementById('po-proj-import2020-modal');
  if (modal) modal.classList.remove('open');
}

function setProjectImport2020Error(msg) {
  const el = document.getElementById('po-proj-import2020-error');
  if (!el) return;
  el.textContent = msg || '';
  el.style.display = msg ? 'block' : 'none';
}

function setProjectImport2020Status(msg) {
  const el = document.getElementById('po-proj-import2020-status');
  if (!el) return;
  el.textContent = msg || '';
  el.style.display = msg ? 'block' : 'none';
}

// ---------- Passo 0: ler o PDF anexado (sem copiar/colar) ----------
//
// Pedido do Matt (2026-09-17, depois de ver a caixa de colar texto):
// "quero importar o pdf ou o arquivo completo .kit". O .kit fica pra fase
// futura (formato binário ainda não decodificado o suficiente pra contar
// quantidade por peça com segurança — ver claude/importador-2020-crosswalk-
// catalogo.md). O PDF dá pra ler direto no navegador com pdf.js (mesma
// família de CDN que supabase-js/three.js já usados aqui), sem precisar de
// nenhum passo manual de copiar/colar.
//
// pdf.js devolve os itens de texto da página com posição (x,y) solta, sem
// juntar em linha — juntamos por Y (mesma linha) e ordenamos por X (ordem
// de leitura esquerda→direita), igual um "pdftotext -layout" simplificado.
function groupPdfTextItemsIntoLinesImport2020(items) {
  const rows = [];
  items.forEach((it) => {
    const y = Math.round(it.transform[5]);
    const x = it.transform[4];
    let row = rows.find((r) => Math.abs(r.y - y) <= 2);
    if (!row) { row = { y, parts: [] }; rows.push(row); }
    row.parts.push({ x, str: it.str });
  });
  // Y do PDF cresce pra CIMA — maior Y primeiro é topo da página primeiro.
  rows.sort((a, b) => b.y - a.y);
  return rows
    .map((r) => r.parts.sort((a, b) => a.x - b.x).map((p) => p.str).join(' ').replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0);
}

async function extractProjectImport2020PdfText(file) {
  if (typeof pdfjsLib === 'undefined') {
    throw new Error(I18n.t('project_import2020.err_pdfjs_missing'));
  }
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  }
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const pageTexts = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    pageTexts.push(groupPdfTextItemsIntoLinesImport2020(content.items).join('\n'));
  }
  return pageTexts.join('\n');
}

async function runProjectImport2020PdfAttach(file) {
  setProjectImport2020Error('');
  const filenameEl = document.getElementById('po-proj-import2020-pdf-filename');
  if (filenameEl) filenameEl.textContent = file.name;
  const pdfBtn = document.getElementById('po-proj-import2020-pdf-btn');
  if (pdfBtn) pdfBtn.disabled = true;
  setProjectImport2020Status(I18n.t('project_import2020.status_extracting'));
  try {
    const text = await extractProjectImport2020PdfText(file);
    const textEl = document.getElementById('po-proj-import2020-text');
    if (textEl) textEl.value = text;
    setProjectImport2020Status('');
    // Fluxo "num clique": lido o PDF, já processa sozinho — não espera outro
    // clique em "Processar lista" (esse botão só existe pro fluxo manual).
    await runProjectImport2020Parse();
  } catch (err) {
    setProjectImport2020Status('');
    console.error('[import2020] falha lendo PDF:', err); // detalhe técnico só no console — mensagem na tela vem do dicionário
    setProjectImport2020Error(I18n.t('project_import2020.err_pdf_read'));
  } finally {
    if (pdfBtn) pdfBtn.disabled = false;
  }
}

// ---------- Passo 1→2: processar o texto colado e mostrar a revisão ----------

async function runProjectImport2020Parse() {
  setProjectImport2020Error('');
  const textEl = document.getElementById('po-proj-import2020-text');
  const text = textEl ? textEl.value : '';
  const rows = parseProjectImport2020Text(text);
  if (rows.length === 0) {
    setProjectImport2020Error(I18n.t('project_import2020.err_no_rows'));
    return;
  }

  const processBtn = document.getElementById('po-proj-import2020-process-btn');
  if (processBtn) processBtn.disabled = true;
  setProjectImport2020Status(I18n.t('project_import2020.status_matching'));

  try {
    const result = await matchProjectImport2020Codes(rows);
    projectImport2020Result = result;
    renderProjectImport2020Review(result);
    setProjectImport2020Status('');
    if (result.matched.length === 0) {
      setProjectImport2020Error(I18n.t('project_import2020.err_nothing_matched'));
      const createBtn = document.getElementById('po-proj-import2020-create-btn');
      if (createBtn) createBtn.style.display = 'none';
    } else {
      const createBtn = document.getElementById('po-proj-import2020-create-btn');
      if (createBtn) createBtn.style.display = '';
    }
    // Já processou — esconde a caixa de texto, o botão "Processar" e o
    // anexar/colar manual pra não confundir (evita reprocessar em cima da
    // revisão sem querer).
    if (textEl) textEl.style.display = 'none';
    if (processBtn) processBtn.style.display = 'none';
    const pdfRow = document.querySelector('.po-import2020-pdf-row');
    if (pdfRow) pdfRow.style.display = 'none';
    const manualLink = document.getElementById('po-proj-import2020-manual-link');
    if (manualLink) manualLink.parentElement.style.display = 'none';
  } catch (err) {
    setProjectImport2020Error(err.message || String(err));
  } finally {
    if (processBtn) processBtn.disabled = false;
  }
}

// ---------- Tela de revisão (casados / ambíguos / sem match) ----------

function escapeHtmlImport2020(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function renderProjectImport2020Review(result) {
  const el = document.getElementById('po-proj-import2020-review');
  if (!el) return;

  const matchedCount = result.matched.reduce((n, r) => n + r.qty, 0);
  const unmatchedCount = result.unmatched.reduce((n, r) => n + r.qty, 0);
  const ambiguousCount = result.ambiguous.reduce((n, r) => n + r.qty, 0);

  const rowsHtml = (list, statusClass, statusLabel) => list.map((r) => `
    <tr>
      <td class="mono">${escapeHtmlImport2020(r.code)}</td>
      <td>${r.qty}</td>
      <td>${escapeHtmlImport2020(r.module_name || '—')}</td>
      <td><span class="po-import2020-status ${statusClass}">${statusLabel}</span></td>
    </tr>
  `).join('');

  el.innerHTML = `
    <p class="hint">${I18n.t('project_import2020.summary_line', { matched: matchedCount, unmatched: unmatchedCount + ambiguousCount })}</p>
    <div class="po-import2020-tablewrap">
      <table class="po-import2020-table">
        <thead>
          <tr>
            <th>${I18n.t('project_import2020.col_code')}</th>
            <th>${I18n.t('project_import2020.col_qty')}</th>
            <th>${I18n.t('project_import2020.col_module')}</th>
            <th>${I18n.t('project_import2020.col_status')}</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml(result.matched, 'ok', I18n.t('project_import2020.status_ok'))}
          ${rowsHtml(result.ambiguous, 'warn', I18n.t('project_import2020.status_ambiguous'))}
          ${rowsHtml(result.unmatched, 'warn', I18n.t('project_import2020.status_gap'))}
        </tbody>
      </table>
    </div>
  `;
  el.style.display = '';
}

// ---------- Passo 3: criar os módulos no projeto atual ----------
//
// Mesmo caminho do Gerador por IA (runProjectAiGeneration): monta items no
// formato que layoutProjectAiItems() espera (module_id, wall_index, order,
// width_mm, mount_type, is_decoration), reaproveita o posicionamento
// determinístico existente, e insere sequencialmente via
// insertProjectModuleDefault — sequencial de propósito, a mesma função
// resolve profundidade contra os slots que já estão na parede.
async function runProjectImport2020Build() {
  if (!projectImport2020Result || projectImport2020Result.matched.length === 0) return;

  if (projectSlots.length > 0) {
    const ok = confirm(I18n.t('project_import2020.confirm_replace'));
    if (!ok) return;
  }

  const createBtn = document.getElementById('po-proj-import2020-create-btn');
  if (createBtn) createBtn.disabled = true;
  setProjectImport2020Error('');
  setProjectImport2020Status(I18n.t('project_import2020.status_building'));

  try {
    // Expande quantidade em itens individuais, mantendo a ordem do relatório.
    const expanded = [];
    projectImport2020Result.matched.forEach((r) => {
      for (let i = 0; i < r.qty; i++) {
        expanded.push({
          module_id: r.module_id,
          wall_index: 0,
          order: expanded.length,
          width_mm: r.width_mm,
          height_mm: r.height_mm,
          mount_type: r.mount_type,
          is_decoration: r.is_decoration
        });
      }
    });

    const { placed, warnings } = layoutProjectAiItems(expanded);
    if (placed.length === 0) throw new Error(I18n.t('project_import2020.err_nothing_fits'));

    projectSlots = [];
    selectedProjectSlotId = null;
    for (const it of placed) {
      await insertProjectModuleDefault(it.module_id, {
        wall_index: it.wall_index,
        x_mm: it.x_mm,
        width_mm: it.width_mm,
        height_mm: it.height_mm > 0 ? it.height_mm : undefined,
        floor_height_mm: it.floor_height_mm
      });
    }

    renderProjectCanvas();
    markProjectDirty();
    closeProjectImport2020Modal();

    const el = document.getElementById('po-proj-error');
    if (el) {
      const lines = [I18n.t('project_import2020.done_summary', { n: placed.length })];
      if (warnings.length) lines.push(warnings.join(' '));
      el.textContent = lines.join(' — ');
      el.style.display = 'block';
    }
  } catch (err) {
    setProjectImport2020Error(err.message || String(err));
  } finally {
    setProjectImport2020Status('');
    if (createBtn) createBtn.disabled = false;
  }
}

// ---------- Listeners do modal (mesmo padrão do Gerador por IA) ----------

(function attachProjectImport2020Listeners() {
  const openBtn = document.getElementById('po-proj-import2020-open-btn');
  if (openBtn) openBtn.addEventListener('click', openProjectImport2020Modal);

  const closeBtn = document.getElementById('po-proj-import2020-modal-close');
  if (closeBtn) closeBtn.addEventListener('click', closeProjectImport2020Modal);

  const cancelBtn = document.getElementById('po-proj-import2020-cancel-btn');
  if (cancelBtn) cancelBtn.addEventListener('click', closeProjectImport2020Modal);

  const processBtn = document.getElementById('po-proj-import2020-process-btn');
  if (processBtn) processBtn.addEventListener('click', runProjectImport2020Parse);

  const createBtn = document.getElementById('po-proj-import2020-create-btn');
  if (createBtn) createBtn.addEventListener('click', runProjectImport2020Build);

  // Anexar PDF (fluxo principal) — clicar no botão visível abre o <input
  // type="file"> escondido; escolher o arquivo já dispara a leitura +
  // processamento automático (runProjectImport2020PdfAttach).
  const pdfBtn = document.getElementById('po-proj-import2020-pdf-btn');
  const pdfInput = document.getElementById('po-proj-import2020-pdf-input');
  if (pdfBtn && pdfInput) {
    pdfBtn.addEventListener('click', () => pdfInput.click());
    pdfInput.addEventListener('change', () => {
      const file = pdfInput.files && pdfInput.files[0];
      if (file) runProjectImport2020PdfAttach(file);
    });
  }

  // "ou colar o texto manualmente" — fallback pra quando o Matt já tem o
  // texto em mãos (ou o pdf.js não deu conta de um PDF fora do padrão).
  const manualLink = document.getElementById('po-proj-import2020-manual-link');
  if (manualLink) {
    manualLink.addEventListener('click', (e) => {
      e.preventDefault();
      const textEl = document.getElementById('po-proj-import2020-text');
      const processBtnEl = document.getElementById('po-proj-import2020-process-btn');
      if (textEl) { textEl.style.display = ''; textEl.focus(); }
      if (processBtnEl) processBtnEl.style.display = '';
      manualLink.parentElement.style.display = 'none';
    });
  }

  const modal = document.getElementById('po-proj-import2020-modal');
  if (modal) {
    modal.addEventListener('click', (e) => { if (e.target === modal) closeProjectImport2020Modal(); });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && modal.classList.contains('open')) closeProjectImport2020Modal();
  });
})();
