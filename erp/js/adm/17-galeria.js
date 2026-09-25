/* Painel admin — Moderação da galeria pública
 *
 * Pedaço 18/21 do antigo js/admin.js, que virou módulo quando o
 * ERP passou a ser a única porta de entrada. O corte seguiu os próprios
 * marcadores de assunto do arquivo, então nada mudou de vizinho.
 * A ordem de carregamento em erp/index.html importa: é a mesma de antes. */

// ---------- GALERIA — moderação (migration 048) ----------
// Post público criado pelo cliente na aba Composição do portal (imagem +
// preço + medidas + cores), fica 'pending' até o admin aprovar aqui — só
// depois disso aparece na galeria pública do portal (RLS: "public read
// approved gallery_posts" só libera status='approved'). Esta tela do admin
// já enxerga TUDO (RLS "admin manage gallery_posts", is_admin()), inclusive
// price_cost e author_display_name/author_user_id mesmo quando o post é
// anônimo — pedido explícito do usuário: essas colunas nunca aparecem pro
// cliente, mas ficam disponíveis aqui pra uso em apresentações depois.
// Paginação (pedido do usuário 2026-07-20: a tela ficava travada em
// "Carregando..." — esta consulta buscava TODOS os posts de uma vez,
// incluindo o base64 de quem ainda não tinha sido migrado pro Storage —
// mesmo bug que já tinha estourado statement_timeout na galeria pública,
// ver GALLERY_PAGE_SIZE em portal.js). Some sozinha a virar necessária
// assim que todos os posts estiverem migrados (linha vira só uma URL
// curta, uma consulta sem LIMIT nenhum volta a ser rápida) — mas mantida
// por segurança, a galeria só tende a crescer.
const GALLERY_ADMIN_PAGE_SIZE = 10;
let galleryAdminPostsCache = [];
let galleryAdminHasMore = false;
// Cache de nome de família entre páginas — evita rebuscar family que já
// apareceu numa página anterior.
let galleryAdminFamilyNameById = new Map();

// "Cliente de referência" (pedido do usuário 2026-08-02) — margem de
// revenda (migration 072) do cliente escolhido no dropdown, usada só pra
// PREVIEW numa coluna extra da tabela (ver renderGalleryAdminRows). 0 =
// nenhum cliente escolhido, coluna mostra "—".
let galleryAdminReferenceMarginPct = 0;

// Lista de clientes com margem configurada, pro dropdown de referência.
// user_profiles.select('*') já inclui resale_margin_pct (migration 072) —
// mesma policy de leitura que loadProfiles() já usa (admin enxerga todas as
// linhas via is_admin()).
async function loadGalleryReferenceClients() {
  const sel = document.getElementById('gallery-reference-client-select');
  if (!sel) return;
  const { data, error } = await supabaseClient
    .from('user_profiles')
    .select('user_id, email, full_name, resale_margin_pct')
    .order('email');
  if (error) return;
  const prev = sel.value;
  sel.innerHTML = '<option value="">— nenhum —</option>';
  (data || []).forEach((profile) => {
    const opt = document.createElement('option');
    opt.value = profile.user_id;
    const label = profile.full_name || profile.email || profile.user_id;
    opt.textContent = `${label} (margem ${Number(profile.resale_margin_pct || 0)}%)`;
    opt.dataset.marginPct = Number(profile.resale_margin_pct || 0);
    sel.appendChild(opt);
  });
  if (prev) sel.value = prev;
}

document.getElementById('gallery-reference-client-select').addEventListener('change', (ev) => {
  const opt = ev.target.selectedOptions[0];
  galleryAdminReferenceMarginPct = opt ? Number(opt.dataset.marginPct || 0) : 0;
  renderGalleryAdminRows();
});

// Recalcula preço de UM post a partir do snapshot salvo em `slots` (mesmo
// formato de user_compositions.slots/user_projects.slots) — mirror de
// computeProjectSlotsTotal (portal.js), adaptado pros caches do admin
// (modulesCache/loadRecursivePiecesForModule/resolveMarkupMultiplierForModule
// já existem aqui, não precisa duplicar catálogo). Sem fallback de cor
// padrão por papel (diferente do portal.js, que usa moduleColorsByRole pra
// preencher cor não escolhida) — aqui só usa a cor que já estava salva no
// slot; se faltar alguma, aquele slot é pulado (mesmo comportamento de
// "catálogo mudou e a config não fecha mais" do portal.js).
async function computeGalleryPostPrice(slotConfigs) {
  if (!Array.isArray(slotConfigs) || slotConfigs.length === 0) return { total: 0, costTotal: 0, skipped: 0 };
  if (!modulesCache.length) await loadModules();
  const pieceColorOverrideColorIds = slotConfigs.flatMap((s) =>
    Object.values(s.piece_color_overrides || {}).flatMap((perRole) => Object.values(perRole).map((e) => e.color_id))
  );
  const colorIds = [...new Set(
    slotConfigs.flatMap((s) => (s.selected_colors || []).map((c) => c.color_id))
      .concat(pieceColorOverrideColorIds)
      .filter(Boolean)
  )];
  const hingeIds = [...new Set(slotConfigs.map((s) => s.hinge_model_id).filter(Boolean))];
  const slideIds = [...new Set(slotConfigs.map((s) => s.slide_model_id).filter(Boolean))];
  const [colorsRes, hingeRes, slideRes] = await Promise.all([
    colorIds.length ? supabaseClient.from('colors').select('*').in('id', colorIds) : { data: [] },
    hingeIds.length ? supabaseClient.from('hinge_models').select('*').in('id', hingeIds) : { data: [] },
    slideIds.length ? supabaseClient.from('slide_models').select('*').in('id', slideIds) : { data: [] }
  ]);
  const colorById = new Map((colorsRes.data || []).map((c) => [c.id, c]));
  const hingeById = new Map((hingeRes.data || []).map((h) => [h.id, h]));
  const slideById = new Map((slideRes.data || []).map((s) => [s.id, s]));

  let total = 0;
  let costTotal = 0;
  let skipped = 0;
  for (const cfg of slotConfigs) {
    const module = modulesCache.find((m) => m.id === cfg.module_id);
    if (!module) { skipped += 1; continue; }
    try {
      const piecesList = await loadRecursivePiecesForModule(module.id);
      if (!piecesList || piecesList.length === 0) { skipped += 1; continue; }
      const optionalIds = cfg.selected_optional_ids || [];
      const effectivePieces = piecesList.filter((p) => !p.client_optional || optionalIds.includes(p.id));
      const colorsByRole = {};
      (cfg.selected_colors || []).forEach((sc) => {
        const color = colorById.get(sc.color_id);
        if (color) colorsByRole[sc.role_id] = color;
      });
      const hingeModel = cfg.hinge_model_id ? (hingeById.get(cfg.hinge_model_id) || null) : null;
      const slideModel = cfg.slide_model_id ? (slideById.get(cfg.slide_model_id) || null) : null;
      const pieceColorOverrides = {};
      Object.keys(cfg.piece_color_overrides || {}).forEach((pieceId) => {
        const perRole = cfg.piece_color_overrides[pieceId];
        const resolved = {};
        Object.keys(perRole).forEach((roleId) => {
          const color = colorById.get(perRole[roleId].color_id);
          if (color) resolved[roleId] = color;
        });
        if (Object.keys(resolved).length) pieceColorOverrides[pieceId] = resolved;
      });
      const result = module.is_decoration
        ? { total: 0, cost_total: 0 }
        : Pricing.calculateModulePrice({
          module, pieces: effectivePieces, colorsByRole, hingeModel, slideModel,
          shelfQuantities: cfg.shelf_quantities || {}, dimOverrides: cfg.dim_overrides || {},
          pieceColorOverrides,
          width_mm: cfg.width_mm, height_mm: cfg.height_mm, depth_mm: cfg.depth_mm,
          markupMultiplier: resolveMarkupMultiplierForModule(module)
        });
      total += Number(result.total) || 0;
      costTotal += Number(result.cost_total) || 0;
    } catch (calcErr) { skipped += 1; } // catálogo mudou e a config não fecha mais — não entra na soma
  }
  return { total, costTotal, skipped };
}

// Botão "Recalcular Galeria" (pedido do usuário 2026-08-02) — corrige
// price_sale/price_cost desatualizados: esses valores são um SNAPSHOT
// gravado no momento em que o cliente publicou (ver
// publishCompositionToGallery/portal.js), então se o preço de um módulo ou
// a margem do admin mudar depois, a Galeria fica com valor velho. Roda
// sobre TODOS os posts pending/approved (rejeitado não aparece pra
// ninguém, não vale a pena gastar tempo recalculando) — busca em páginas
// pra não estourar limite de linha nenhuma consulta.
const GALLERY_RECALC_PAGE_SIZE = 50;
async function recalculateGalleryPrices() {
  const btn = document.getElementById('gallery-recalc-btn');
  const statusEl = document.getElementById('gallery-recalc-status');
  if (btn.disabled) return;
  btn.disabled = true;
  let processed = 0;
  let updated = 0;
  let totalSkippedSlots = 0;
  try {
    let from = 0;
    for (;;) {
      const { data, error } = await supabaseClient
        .from('gallery_posts')
        .select('id, slots')
        .in('status', ['pending', 'approved'])
        .order('created_at', { ascending: false })
        .range(from, from + GALLERY_RECALC_PAGE_SIZE - 1);
      if (error) { statusEl.textContent = 'Erro: ' + error.message; return; }
      const page = data || [];
      if (page.length === 0) break;
      for (const post of page) {
        processed += 1;
        statusEl.textContent = `Recalculando… (${processed})`;
        const slots = Array.isArray(post.slots) ? post.slots : [];
        const { total, costTotal, skipped } = await computeGalleryPostPrice(slots);
        totalSkippedSlots += skipped;
        const { error: updErr } = await supabaseClient
          .from('gallery_posts')
          .update({ price_sale: total, price_cost: costTotal })
          .eq('id', post.id);
        if (!updErr) updated += 1;
      }
      if (page.length < GALLERY_RECALC_PAGE_SIZE) break;
      from += GALLERY_RECALC_PAGE_SIZE;
    }
    statusEl.textContent = `Recalculado: ${updated}/${processed} post(s)`
      + (totalSkippedSlots > 0 ? ` — ${totalSkippedSlots} módulo(s) ignorado(s) (não existem mais no catálogo).` : '.');
  } finally {
    btn.disabled = false;
    renderGalleryAdminList();
  }
}
document.getElementById('gallery-recalc-btn').addEventListener('click', recalculateGalleryPrices);

function updateGalleryAdminLoadMoreBtn() {
  const btn = document.getElementById('gallery-admin-load-more-btn');
  if (btn) btn.style.display = galleryAdminHasMore ? 'inline-block' : 'none';
}

async function renderGalleryAdminList() {
  clearError('gallery-admin-error');
  const tbody = document.getElementById('gallery-admin-tbody');
  tbody.innerHTML = '<tr><td colspan="12" class="hint">Carregando...</td></tr>';
  galleryAdminPostsCache = [];
  galleryAdminFamilyNameById = new Map();
  const statusFilter = document.getElementById('gallery-admin-status-filter').value;
  let query = supabaseClient
    .from('gallery_posts')
    // family_id trocou room_type (migration 049) — mesma taxonomia de
    // família usada em todo o catálogo (ver "Taxonomia" no admin). Busca
    // SEM embed families(name) de propósito: logo depois de rodar uma
    // migration que cria uma FK nova, o cache de schema do PostgREST às
    // vezes ainda não reconhece a relação ("Could not find a relationship
    // between 'gallery_posts' and 'families' in the schema cache") — em
    // vez de depender de recarregar o cache, busca os nomes numa 2ª query
    // separada (mesmo padrão já usado no resto do app pra resolver ids
    // salvos, ver restoreFavoriteComposition em portal.js) e junta no client.
    .select('id, ai_image_data_url, composition_name, family_id, price_sale, price_cost, author_display_name, is_anonymous, likes_count, status, created_at')
    .order('created_at', { ascending: false })
    .range(0, GALLERY_ADMIN_PAGE_SIZE - 1);
  if (statusFilter) query = query.eq('status', statusFilter);
  const { data, error } = await query;
  if (error) { showError('gallery-admin-error', error); tbody.innerHTML = ''; return; }
  galleryAdminPostsCache = data || [];
  galleryAdminHasMore = galleryAdminPostsCache.length === GALLERY_ADMIN_PAGE_SIZE;
  updateGalleryAdminLoadMoreBtn();
  await renderGalleryAdminRows();
}

// "Carregar mais" — busca a PRÓXIMA página (a partir do que já está em
// galleryAdminPostsCache) e concatena, mesmo padrão de loadMoreGalleryPosts
// em portal.js.
async function loadMoreGalleryAdminPosts() {
  const btn = document.getElementById('gallery-admin-load-more-btn');
  if (!galleryAdminHasMore || (btn && btn.disabled)) return;
  if (btn) btn.disabled = true;
  clearError('gallery-admin-error');
  try {
    const statusFilter = document.getElementById('gallery-admin-status-filter').value;
    const from = galleryAdminPostsCache.length;
    let query = supabaseClient
      .from('gallery_posts')
      .select('id, ai_image_data_url, composition_name, family_id, price_sale, price_cost, author_display_name, is_anonymous, likes_count, status, created_at')
      .order('created_at', { ascending: false })
      .range(from, from + GALLERY_ADMIN_PAGE_SIZE - 1);
    if (statusFilter) query = query.eq('status', statusFilter);
    const { data, error } = await query;
    if (error) { showError('gallery-admin-error', error); return; }
    const newPosts = data || [];
    galleryAdminPostsCache = galleryAdminPostsCache.concat(newPosts);
    galleryAdminHasMore = newPosts.length === GALLERY_ADMIN_PAGE_SIZE;
    updateGalleryAdminLoadMoreBtn();
    await renderGalleryAdminRows();
  } finally {
    if (btn) btn.disabled = false;
  }
}
document.getElementById('gallery-admin-load-more-btn').addEventListener('click', loadMoreGalleryAdminPosts);

// Monta as linhas da tabela a partir de galleryAdminPostsCache (extraído de
// renderGalleryAdminList pra poder ser reaproveitado por "Carregar mais"
// sem refazer a consulta inteira).
async function renderGalleryAdminRows() {
  const tbody = document.getElementById('gallery-admin-tbody');
  const data = galleryAdminPostsCache;
  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="12" class="hint">Nenhum post encontrado.</td></tr>';
    return;
  }
  const missingFamilyIds = [...new Set(data.map((p) => p.family_id).filter((id) => id && !galleryAdminFamilyNameById.has(id)))];
  if (missingFamilyIds.length) {
    const { data: familiesData } = await supabaseClient.from('families').select('id, name').in('id', missingFamilyIds);
    (familiesData || []).forEach((f) => galleryAdminFamilyNameById.set(f.id, f.name));
  }
  const familyNameById = galleryAdminFamilyNameById;
  tbody.innerHTML = '';
  data.forEach((post) => {
    const tr = document.createElement('tr');
    const dateStr = post.created_at ? new Date(post.created_at).toLocaleString('pt-BR') : '—';
    const statusLabel = { pending: 'Pendente', approved: 'Aprovado', rejected: 'Rejeitado' }[post.status] || post.status;
    const imgHtml = post.ai_image_data_url
      ? `<img src="${post.ai_image_data_url}" alt="" class="gallery-admin-thumb" style="width:70px;height:70px;object-fit:contain;border:1px solid var(--border);border-radius:6px;cursor:zoom-in;" />`
      : '—';
    // Preview de revenda (pedido do usuário 2026-08-02) — preço de venda ×
    // (1 + margem do cliente escolhido no dropdown "Cliente de
    // referência"). Só cosmético, não grava nada — ver
    // galleryAdminReferenceMarginPct/loadGalleryReferenceClients.
    const resaleHtml = galleryAdminReferenceMarginPct > 0
      ? `$${(Number(post.price_sale || 0) * (1 + galleryAdminReferenceMarginPct / 100)).toFixed(2)}`
      : '—';
    tr.innerHTML = `
      <td>${imgHtml}</td>
      <td>${post.composition_name || '—'}</td>
      <td>${familyNameById.get(post.family_id) || '—'}</td>
      <td>$${Number(post.price_sale || 0).toFixed(2)}</td>
      <td>$${Number(post.price_cost || 0).toFixed(2)}</td>
      <td>${post.author_display_name || '—'}</td>
      <td>${post.is_anonymous ? 'Sim' : 'Não'}</td>
      <td>${Number(post.likes_count || 0)}</td>
      <td>${statusLabel}</td>
      <td>${dateStr}</td>
      <td>${resaleHtml}</td>
      <td></td>
    `;
    const actionsTd = tr.lastElementChild;
    if (post.status !== 'approved') {
      const approveBtn = document.createElement('button');
      approveBtn.type = 'button';
      approveBtn.textContent = 'Aprovar';
      approveBtn.style.marginTop = '0';
      approveBtn.addEventListener('click', () => updateGalleryPostStatus(post.id, 'approved'));
      actionsTd.appendChild(approveBtn);
    }
    if (post.status !== 'rejected') {
      const rejectBtn = document.createElement('button');
      rejectBtn.type = 'button';
      rejectBtn.className = 'secondary';
      rejectBtn.textContent = 'Rejeitar';
      rejectBtn.style.marginTop = '0';
      rejectBtn.style.marginLeft = '6px';
      rejectBtn.addEventListener('click', () => updateGalleryPostStatus(post.id, 'rejected'));
      actionsTd.appendChild(rejectBtn);
    }
    // "Editar" — abre a composição deste post no Portal (aba Composição,
    // já carregada) pra admin ajustar módulos/cores/medidas e salvar DE
    // VOLTA no mesmo post (não cria um novo) — pedido do usuário: "eu como
    // administrador, quero fazer alteracao na composicao dos projetos da
    // galeria ... pra ela ficar mais fiel as imagens geradas". Nova aba:
    // não perde a lista de moderação aberta aqui. Ver
    // maybeLoadGalleryPostForAdminEdit/saveGalleryPostAdminEdit em portal.js.
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'secondary';
    editBtn.textContent = 'Editar';
    editBtn.style.marginTop = '0';
    editBtn.style.marginLeft = '6px';
    editBtn.addEventListener('click', () => window.open(`portal.html?editGalleryPost=${post.id}`, '_blank'));
    actionsTd.appendChild(editBtn);
    // Excluir de VERDADE (apaga a linha) — diferente de "Rejeitar", que só
    // esconde da galeria pública (status='rejected', ver RLS "public read
    // approved gallery_posts") mas mantém o registro pro admin ver depois.
    // Pedido do usuário: "como removo da galeria uma imagem que eu quero
    // tirar" — mesmo padrão de confirm() + delete já usado no resto do
    // admin.js (ex.: deleteColor/deleteComponent).
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'danger';
    deleteBtn.textContent = 'Excluir';
    deleteBtn.style.marginTop = '0';
    deleteBtn.style.marginLeft = '6px';
    deleteBtn.addEventListener('click', () => deleteGalleryPost(post.id));
    actionsTd.appendChild(deleteBtn);
    // Miniatura 70x70 é pequena demais pra avaliar antes de aprovar (pedido
    // do usuário: "eu preciso poder clicar e abrir foto grande pra
    // aprovar") — reaproveita o MESMO lightbox/CSS já criado pra galeria
    // pública do portal (.po-gallery-lightbox-*, ver css/style.css;
    // admin.html carrega o mesmo style.css).
    const thumbImg = tr.querySelector('.gallery-admin-thumb');
    if (thumbImg) thumbImg.addEventListener('click', () => openGalleryAdminLightbox(post.ai_image_data_url));
    tbody.appendChild(tr);
  });
}

function openGalleryAdminLightbox(imageUrl) {
  if (!imageUrl) return;
  let overlay = document.getElementById('po-gallery-lightbox');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'po-gallery-lightbox';
    overlay.className = 'po-gallery-lightbox-overlay';
    overlay.innerHTML = `
      <button type="button" class="po-gallery-lightbox-close" aria-label="Fechar">&times;</button>
      <img class="po-gallery-lightbox-img" alt="" />
    `;
    overlay.addEventListener('click', (ev) => {
      if (ev.target === overlay || ev.target.classList.contains('po-gallery-lightbox-close')) {
        overlay.style.display = 'none';
      }
    });
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') overlay.style.display = 'none';
    });
    /* Dentro do #adm-root, não no body: o CSS do lightbox
       (.po-gallery-lightbox-*) veio do style.css do portal, que aqui só vale
       debaixo de .adm-scope. Pendurado no body ele apareceria sem estilo
       nenhum — um retângulo branco no meio da tela. */
    (document.getElementById('adm-root') || document.body).appendChild(overlay);
  }
  overlay.querySelector('.po-gallery-lightbox-img').src = imageUrl;
  overlay.style.display = 'flex';
}

async function updateGalleryPostStatus(postId, newStatus) {
  const payload = { status: newStatus };
  if (newStatus === 'approved') payload.approved_at = new Date().toISOString();
  const { error } = await supabaseClient.from('gallery_posts').update(payload).eq('id', postId);
  if (error) { showError('gallery-admin-error', error); return; }
  renderGalleryAdminList();
}

async function deleteGalleryPost(postId) {
  if (!confirm('Excluir esta imagem da galeria? Não tem como desfazer.')) return;
  const { error } = await supabaseClient.from('gallery_posts').delete().eq('id', postId);
  if (error) { showError('gallery-admin-error', error); return; }
  renderGalleryAdminList();
}

ADM.aoAbrir('tab-gallery', () => {
  renderGalleryAdminList();
  loadGalleryReferenceClients();
});
document.getElementById('gallery-admin-status-filter').addEventListener('change', renderGalleryAdminList);
