// ============================================================
// Imagens de referência do projeto (2026-10-01, migration 185)
// ============================================================
// Pedido do Matt: "pode subir as imagens técnicas e renders originais do
// pdf pro projeto, como se fosse um print da tela, isso seria interessante
// porque anexa na proposta".
//
// O que é: uma grade "📎 Referências" na aba Projetos (embaixo das fotos
// realistas) com as pranchas/renders do PDF de origem — e qualquer print
// que o usuário anexar à mão ("+ Anexar imagem"). Cada imagem vai pro
// bucket gallery-images (uploadGalleryImageToStorage, portal-04) e vira uma
// linha em project_reference_images. Na Proposta, cada referência ganha uma
// página própria na seção "Projeto de referência" (portal-10), e no pedido
// fica copiada em orders.project_reference_urls (portal-08).
//
// PENDENTES: o "Projetos a partir de PDF" (portal-12) monta o projeto e
// SALVA em seguida — as imagens das páginas do ambiente entram aqui como
// pendentes (dataUrl) e sobem logo depois que o salvar devolve o id do
// projeto (flushProjectReferencePending, chamado pelo portal-09). Mesmo
// caminho pra quem anexar imagem num projeto ainda não salvo.
//
// Carregado depois do portal-12 e antes do portal-09.

let projectReferenceImages = [];   // [{ id, image_url, kind, label, page_number, sort_order }]
let projectReferencePending = [];  // [{ dataUrl, kind, label, page_number }]
let projectReferenceTableMissing = false;

function tRef(key, vars) { return I18n.t('project_ref.' + key, vars); }

async function loadProjectReferenceImages(projectId) {
  if (!projectId || projectReferenceTableMissing) { projectReferenceImages = []; return; }
  try {
    const { data, error } = await supabaseClient
      .from('project_reference_images')
      .select('id, image_url, kind, label, page_number, sort_order')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;
    projectReferenceImages = data || [];
  } catch (err) {
    // tabela ausente = migration 185 não rodou — some a grade, sem barulho
    if (/project_reference_images/.test((err && err.message) || '')) projectReferenceTableMissing = true;
    else console.error('[referencias] falha carregando:', err);
    projectReferenceImages = [];
  }
}

function renderProjectReferenceGallery() {
  const wrap = document.getElementById('po-proj-ref-wrap');
  const grid = document.getElementById('po-proj-ref-grid');
  if (!wrap || !grid) return;
  const temProjeto = !!(loadedProjectFavorite && loadedProjectFavorite.id);
  const itens = projectReferenceImages.map((r) => ({ src: r.image_url, label: r.label || '', id: r.id }))
    .concat(projectReferencePending.map((p, i) => ({ src: p.dataUrl, label: (p.label || '') + ' · ' + tRef('pending'), pendingIdx: i })));
  // A grade aparece com projeto salvo (pra poder anexar) ou com pendentes.
  wrap.style.display = (projectReferenceTableMissing || (!temProjeto && !itens.length)) ? 'none' : 'block';
  grid.innerHTML = itens.map((it) => `
    <figure class="po-proj-ref-item">
      <img src="${it.src}" alt="" data-ref-zoom="1">
      <figcaption>${escapeHtmlRef(it.label)}</figcaption>
      <button type="button" class="po-photoreal-gallery-delete" title="${escapeHtmlRef(tRef('delete_title'))}"
        ${it.id ? `data-ref-del="${it.id}"` : `data-ref-pend="${it.pendingIdx}"`}>🗑️</button>
    </figure>`).join('') || `<p class="hint">${tRef('empty')}</p>`;
  const status = document.getElementById('po-proj-ref-status');
  if (status) status.textContent = '';
}

function escapeHtmlRef(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function refreshProjectReferenceImages() {
  if (loadedProjectFavorite && loadedProjectFavorite.id) {
    loadProjectReferenceImages(loadedProjectFavorite.id).then(renderProjectReferenceGallery);
  } else {
    projectReferenceImages = [];
    renderProjectReferenceGallery();
  }
}

// Sobe as pendentes pro projeto recém-salvo. Nunca derruba o salvar: erro
// aqui só vira aviso no console (o projeto em si já está salvo).
async function flushProjectReferencePending(projectId) {
  if (!projectId || !projectReferencePending.length || projectReferenceTableMissing) return 0;
  const fila = projectReferencePending.slice();
  projectReferencePending = [];
  let base = projectReferenceImages.length;
  let ok = 0;
  for (const p of fila) {
    try {
      const url = await uploadGalleryImageToStorage(p.dataUrl);
      const { error } = await supabaseClient.from('project_reference_images').insert({
        project_id: projectId, image_url: url, kind: p.kind || 'other',
        label: p.label || null, page_number: p.page_number || null, sort_order: base++
      });
      if (error) throw error;
      ok++;
    } catch (err) {
      console.error('[referencias] falha subindo imagem:', err);
      if (/project_reference_images/.test((err && err.message) || '')) { projectReferenceTableMissing = true; break; }
    }
  }
  if (loadedProjectFavorite && loadedProjectFavorite.id === projectId) {
    await loadProjectReferenceImages(projectId);
    renderProjectReferenceGallery();
  }
  return ok;
}

// Anexar à mão (prints, fotos da obra, renders recebidos por WhatsApp…).
async function attachProjectReferenceFiles(files) {
  const lista = [...(files || [])].filter((f) => /^image\//.test(f.type));
  if (!lista.length) return;
  const status = document.getElementById('po-proj-ref-status');
  for (let i = 0; i < lista.length; i++) {
    if (status) status.textContent = tRef('uploading', { i: i + 1, n: lista.length });
    const dataUrl = await projectRefFileToDataUrl(lista[i]);
    projectReferencePending.push({ dataUrl, kind: 'photo', label: lista[i].name.replace(/\.[^.]+$/, '') });
  }
  if (loadedProjectFavorite && loadedProjectFavorite.id) await flushProjectReferencePending(loadedProjectFavorite.id);
  renderProjectReferenceGallery();
  if (status && !(loadedProjectFavorite && loadedProjectFavorite.id)) status.textContent = tRef('pending_hint');
}

// Reduz pra no máx. 2200px JPEG (mesma régua das pranchas do PDF) — print de
// tela 4K em PNG pesaria 5–10 MB na Proposta.
function projectRefFileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, 2200 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * s));
      c.height = Math.max(1, Math.round(img.naturalHeight * s));
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(tRef('err_image'))); };
    img.src = url;
  });
}

async function deleteProjectReferenceImage(id) {
  if (!confirm(tRef('delete_confirm'))) return;
  const { error } = await supabaseClient.from('project_reference_images').delete().eq('id', id);
  if (error) { alert(error.message); return; }
  projectReferenceImages = projectReferenceImages.filter((r) => String(r.id) !== String(id));
  renderProjectReferenceGallery();
}

// Lista no formato da Proposta/pedido: [{ url, label, kind }]
function projectReferenceListForProposal() {
  return projectReferenceImages.map((r) => ({ url: r.image_url, label: r.label || '', kind: r.kind || '' }))
    .concat(projectReferencePending.map((p) => ({ url: p.dataUrl, label: p.label || '', kind: p.kind || '' })));
}

(function attachProjectReferenceListeners() {
  const grid = document.getElementById('po-proj-ref-grid');
  if (grid) grid.addEventListener('click', (ev) => {
    const del = ev.target.closest('[data-ref-del]');
    if (del) { deleteProjectReferenceImage(del.dataset.refDel); return; }
    const pend = ev.target.closest('[data-ref-pend]');
    if (pend) { projectReferencePending.splice(Number(pend.dataset.refPend), 1); renderProjectReferenceGallery(); return; }
    const img = ev.target.closest('[data-ref-zoom]');
    if (img && typeof openGalleryLightbox === 'function') openGalleryLightbox(img.src);
  });
  const btn = document.getElementById('po-proj-ref-add-btn');
  const input = document.getElementById('po-proj-ref-input');
  if (btn && input) {
    btn.addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      try { await attachProjectReferenceFiles(input.files); } catch (e) { alert(e.message || e); }
      input.value = '';
    });
  }
})();

// Globais: supabaseClient, loadedProjectFavorite, uploadGalleryImageToStorage,
// openGalleryLightbox, I18n.
