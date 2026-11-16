// ============================================================
// Documentos do projeto/cliente no Order Center (16/11/2026, migration 301)
// ============================================================
// Pedido do Matt: "aqui no order center eu gostaria de colocar os arquivos já
// gerados, tipo plano técnico, proposta comercial, contrato, referências dos
// documentos enviados, fazer uma gestão de documentos de cada projeto/cliente
// (vale pra pasta)".
//
// Decisões dele (perguntas de 16/11):
//   · ENTRADA: automático + upload. Todo plano técnico / proposta gerado é
//     guardado sozinho (docGuardarPdf, chamado no doc.save do portal-14 e do
//     portal-10) e dá pra anexar arquivo de fora (contrato, imagem, PDF).
//   · VERSÕES: trocar pelo novo. O gerado tem uma chave (auto_key) por
//     projeto/pasta/pedido — gerar de novo sobrescreve o arquivo e a linha.
//   · "REFERÊNCIAS" = arquivos mandados pra servir de referência do projeto
//     (imagens, PDF). Tipo 'reference'. As imagens de referência que o projeto
//     já tem (project_reference_images, portal-13) aparecem juntas, só leitura.
//
// Onde aparece: bloco "Documentos" dentro da linha aberta (pasta, projeto
// solto ou grupo de pedidos) do painel novo — mpRender (portal-09) chama
// docFolderHtml(f). Os dados vêm de docLoad(), chamado no fim do mpLoad.
// Arquivo no bucket PRIVADO project-documents (<uid>/...), aberto por link
// assinado. Sem a migration 301 o bloco some, sem barulho.
//
// Carregado por último (depois do portal-40).

const DOC_BUCKET = 'project-documents';
const DOC_MAX_BYTES = 50 * 1024 * 1024;
const DOC_KINDS = ['tech_plan', 'proposal', 'contract', 'reference', 'other'];
const DOC_UPLOAD_KINDS = ['reference', 'contract', 'other'];
const docState = { rows: [], loaded: false, missing: false, refs: new Map(), refsBusy: new Set(), msg: {}, kindSel: {} };

function docT(k, vars) { return I18n.t('docs.' + k, vars); }
function docEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function docSize(n) {
  const v = Number(n) || 0;
  if (!v) return '';
  return v >= 1048576 ? (v / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(v / 1024)) + ' KB';
}
function docDate(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleString((typeof currentLocale === 'function') ? currentLocale() : undefined, { dateStyle: 'medium', timeStyle: 'short' }); }
  catch (e) { return String(iso).slice(0, 16); }
}
function docSafeName(s) {
  return String(s || 'arquivo').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 90) || 'arquivo';
}
function docHash(s) {
  let h = 5381; const t = String(s);
  for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
function docUid() { return (typeof currentUser !== 'undefined' && currentUser && currentUser.id) || null; }
function docRerender() { try { if (typeof mpRender === 'function') mpRender(); } catch (e) { /* painel fechado */ } }

async function docLoad() {
  const uid = docUid();
  if (!uid || docState.missing) return;
  try {
    const { data, error } = await supabaseClient.from('project_documents')
      .select('id, project_id, order_id, client_folder, kind, name, storage_path, mime, size_bytes, auto_key, created_at, updated_at')
      .eq('owner_user_id', uid).order('updated_at', { ascending: false });
    if (error) throw error;
    docState.rows = data || [];
    docState.loaded = true;
  } catch (err) {
    if (/project_documents/.test((err && err.message) || '')) docState.missing = true; // migration 301 não rodou
    else console.warn('[documentos] falha carregando:', err);
  }
}

// ---------- o que pertence a uma linha do painel ----------
function docAlvoDe(f) {
  const projs = (f.todos && f.todos.length ? f.todos : (f.lista || [])).filter(Boolean);
  const orders = (f.orders || []).filter(Boolean);
  return { nome: f.nome || '', projIds: projs.map((p) => p.id), orderIds: orders.map((o) => o.id), projs, orders };
}
function docsDe(f) {
  const a = docAlvoDe(f);
  return docState.rows.filter((d) => (d.project_id && a.projIds.includes(d.project_id))
    || (d.order_id && a.orderIds.includes(d.order_id))
    || (!d.project_id && !d.order_id && a.nome && d.client_folder === a.nome));
}

async function docEnsureRefs(projIds) {
  const falta = projIds.filter((id) => !docState.refs.has(id) && !docState.refsBusy.has(id));
  if (!falta.length) return;
  falta.forEach((id) => docState.refsBusy.add(id));
  try {
    const { data, error } = await supabaseClient.from('project_reference_images')
      .select('id, project_id, image_url, label').in('project_id', falta).order('sort_order', { ascending: true });
    falta.forEach((id) => docState.refs.set(id, []));
    if (!error) (data || []).forEach((r) => docState.refs.get(r.project_id).push(r));
  } catch (e) { falta.forEach((id) => docState.refs.set(id, [])); }
  falta.forEach((id) => docState.refsBusy.delete(id));
  docRerender();
}

const DOC_ICO = {
  tech_plan: '📐', proposal: '💲', contract: '✍️', reference: '📎', other: '📄'
};

function docFolderHtml(f) {
  if (docState.missing || !docState.loaded || !f || f.key === '__none__' || f.key === '__loose__') return '';
  const a = docAlvoDe(f);
  if (!a.projIds.length && !a.orderIds.length && !a.nome) return '';
  const docs = docsDe(f);
  const nomeProj = {};
  a.projs.forEach((p) => { nomeProj[p.id] = p.name || ''; });
  const variosProj = a.projs.length > 1;
  if (a.projIds.length) docEnsureRefs(a.projIds);
  const refImgs = a.projIds.reduce((acc, id) => acc.concat(docState.refs.get(id) || []), []);

  const linha = (d) => '<li class="doc-item" data-doc-id="' + docEsc(d.id) + '">'
    + '<button type="button" class="doc-name" data-doc="open" title="' + docEsc(docT('open')) + '">' + docEsc(d.name) + '</button>'
    + '<span class="doc-meta">'
    + (variosProj && d.project_id && nomeProj[d.project_id] ? docEsc(nomeProj[d.project_id]) + ' · ' : '')
    + docEsc(docDate(d.updated_at)) + (d.size_bytes ? ' · ' + docEsc(docSize(d.size_bytes)) : '')
    + (d.auto_key ? ' · ' + docEsc(docT('auto')) : '') + '</span>'
    + '<button type="button" class="doc-del" data-doc="del" title="' + docEsc(docT('delete')) + '" aria-label="' + docEsc(docT('delete')) + '">✕</button>'
    + '</li>';

  const grupos = DOC_KINDS.map((k) => {
    const lista = docs.filter((d) => d.kind === k);
    const imgs = (k === 'reference') ? refImgs : [];
    if (!lista.length && !imgs.length) return '';
    return '<div class="doc-grp"><h4>' + DOC_ICO[k] + ' ' + docEsc(docT('k_' + k)) + ' <span>' + (lista.length + imgs.length) + '</span></h4>'
      + (lista.length ? '<ul class="doc-list">' + lista.map(linha).join('') + '</ul>' : '')
      + (imgs.length ? '<div class="doc-thumbs" title="' + docEsc(docT('ref_images')) + '">' + imgs.map((r) => '<a href="' + docEsc(r.image_url) + '" target="_blank" rel="noopener" title="' + docEsc(r.label || '') + '"><img src="' + docEsc(r.image_url) + '" alt="" loading="lazy"></a>').join('') + '</div>' : '')
      + '</div>';
  }).join('');

  const sel = docState.kindSel[f.key] || 'reference';
  const msg = docState.msg[f.key] || '';
  return '<div class="doc-box" data-doc-key="' + docEsc(f.key) + '">'
    + '<div class="doc-head"><strong>' + docEsc(docT('title')) + '</strong>'
    + '<span class="doc-add"><select class="doc-kind" aria-label="' + docEsc(docT('kind')) + '">'
    + DOC_UPLOAD_KINDS.map((k) => '<option value="' + k + '"' + (k === sel ? ' selected' : '') + '>' + docEsc(docT('k_' + k)) + '</option>').join('')
    + '</select><button type="button" class="doc-btn" data-doc="attach">+ ' + docEsc(docT('attach')) + '</button></span></div>'
    + (msg ? '<p class="doc-msg hint">' + docEsc(msg) + '</p>' : '')
    + (grupos || '<p class="hint doc-empty">' + docEsc(docT('empty')) + '</p>')
    + '</div>';
}

// ---------- ações ----------
function docSay(key, texto) { if (texto) docState.msg[key] = texto; else delete docState.msg[key]; docRerender(); }

async function docOpen(id) {
  const d = docState.rows.find((x) => x.id === id);
  if (!d) return;
  // abre a aba ANTES do await (senão o navegador bloqueia como pop-up)
  const w = window.open('', '_blank');
  try {
    const { data, error } = await supabaseClient.storage.from(DOC_BUCKET).createSignedUrl(d.storage_path, 3600);
    if (error || !data || !data.signedUrl) throw error || new Error('sem link');
    if (w) w.location.href = data.signedUrl; else window.location.href = data.signedUrl;
  } catch (err) {
    if (w) w.close();
    alert(docT('err_open') + ' ' + ((err && err.message) || ''));
  }
}

async function docDelete(id, key) {
  const d = docState.rows.find((x) => x.id === id);
  if (!d || !confirm(docT('confirm_delete', { name: d.name }))) return;
  try {
    const { error } = await supabaseClient.from('project_documents').delete().eq('id', id);
    if (error) throw error;
    try { await supabaseClient.storage.from(DOC_BUCKET).remove([d.storage_path]); } catch (e) { /* arquivo órfão não atrapalha */ }
    docState.rows = docState.rows.filter((x) => x.id !== id);
    docSay(key, '');
  } catch (err) { docSay(key, docT('err') + ' ' + ((err && err.message) || String(err))); }
}

function docAttach(key) {
  const f = (typeof mpFolderByKey === 'function') ? mpFolderByKey(key) : null;
  if (!f) return;
  const kind = docState.kindSel[key] || 'reference';
  const inp = document.createElement('input');
  inp.type = 'file'; inp.multiple = true;
  inp.addEventListener('change', () => { if (inp.files && inp.files.length) docUploadFiles(f, kind, Array.from(inp.files)); });
  inp.click();
}

async function docUploadFiles(f, kind, files) {
  const uid = docUid();
  if (!uid) return;
  const a = docAlvoDe(f);
  // pasta com nome: o anexo é da PASTA (do cliente). Sem pasta: do projeto
  // (ou do pedido, quando a linha é um pedido solto sem projeto).
  const alvo = a.nome ? { client_folder: a.nome, project_id: null, order_id: null }
    : a.projIds.length ? { client_folder: null, project_id: a.projIds[0], order_id: null }
      : { client_folder: null, project_id: null, order_id: a.orderIds[0] || null };
  let falhas = 0;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    docSay(f.key, docT('uploading', { i: i + 1, n: files.length, name: file.name }));
    if (file.size > DOC_MAX_BYTES) { falhas++; alert(docT('too_big', { name: file.name })); continue; }
    const rid = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : (Date.now() + '-' + Math.random().toString(36).slice(2));
    const path = uid + '/up/' + rid + '-' + docSafeName(file.name);
    try {
      const up = await supabaseClient.storage.from(DOC_BUCKET).upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
      if (up.error) throw up.error;
      const { data, error } = await supabaseClient.from('project_documents').insert(Object.assign({
        owner_user_id: uid, kind, name: String(file.name).slice(0, 200), storage_path: path, mime: file.type || null, size_bytes: file.size
      }, alvo)).select().single();
      if (error) { try { await supabaseClient.storage.from(DOC_BUCKET).remove([path]); } catch (e) { /* ok */ } throw error; }
      docState.rows.unshift(data);
    } catch (err) {
      falhas++;
      console.warn('[documentos] upload', err);
      if (/project_documents|Bucket not found/i.test((err && err.message) || '')) { alert(docT('err_setup')); break; }
      alert(docT('err') + ' ' + file.name + ': ' + ((err && err.message) || String(err)));
    }
  }
  docSay(f.key, falhas ? docT('upload_partial', { ok: files.length - falhas, n: files.length }) : '');
}

// ---------- gerado pelo portal: guarda sozinho, o novo troca o anterior ----------
// info = { kind: 'tech_plan'|'proposal', name, project_id?, order_id?, folder? }
// Nunca atrapalha o download: roda solto, erro só vai pro console.
async function docGuardarPdf(doc, info) {
  try {
    const uid = docUid();
    if (!uid || docState.missing || !doc || !info) return false;
    const alvo = info.project_id ? ['p', info.project_id] : info.order_id ? ['o', info.order_id] : info.folder ? ['f', info.folder] : null;
    if (!alvo) return false; // projeto ainda não salvo: não tem onde pendurar
    const autoKey = info.kind + ':' + alvo[0] + ':' + alvo[1];
    const path = uid + '/auto/' + info.kind + '-' + alvo[0] + '-' + docSafeName(alvo[1]).slice(0, 40) + '-' + docHash(alvo[1]) + '.pdf';
    const blob = doc.output('blob');
    const up = await supabaseClient.storage.from(DOC_BUCKET).upload(path, blob, { contentType: 'application/pdf', upsert: true });
    if (up.error) throw up.error;
    const campos = {
      kind: info.kind, name: String(info.name || (info.kind + '.pdf')).slice(0, 200), storage_path: path, mime: 'application/pdf',
      size_bytes: blob.size, client_folder: info.folder || null, project_id: info.project_id || null,
      order_id: info.order_id || null, updated_at: new Date().toISOString()
    };
    const { data: ja, error: e1 } = await supabaseClient.from('project_documents').select('id').eq('owner_user_id', uid).eq('auto_key', autoKey).maybeSingle();
    if (e1) throw e1;
    const r = ja
      ? await supabaseClient.from('project_documents').update(campos).eq('id', ja.id)
      : await supabaseClient.from('project_documents').insert(Object.assign({ owner_user_id: uid, auto_key: autoKey }, campos));
    if (r.error) throw r.error;
    await docLoad();
    docRerender();
    return true;
  } catch (err) {
    if (/project_documents|Bucket not found/i.test((err && err.message) || '')) docState.missing = true;
    console.warn('[documentos] não guardou o PDF gerado:', err);
    return false;
  }
}

// pasta renomeada: os documentos presos só ao NOME da pasta vão junto
async function docRenameFolder(oldName, novo) {
  const uid = docUid();
  if (!uid || docState.missing || !oldName || !novo) return;
  try {
    await supabaseClient.from('project_documents').update({ client_folder: novo, auto_key: 'proposal:f:' + novo })
      .eq('owner_user_id', uid).eq('auto_key', 'proposal:f:' + oldName);
    await supabaseClient.from('project_documents').update({ client_folder: novo })
      .eq('owner_user_id', uid).eq('client_folder', oldName);
    await docLoad();
  } catch (e) { console.warn('[documentos] renomear pasta', e); }
}

// ---------- eventos (delegados: o painel é redesenhado a toda hora) ----------
document.addEventListener('click', (ev) => {
  const el = ev.target.closest && ev.target.closest('[data-doc]');
  if (!el) return;
  const box = el.closest('.doc-box');
  if (!box) return;
  ev.preventDefault(); ev.stopPropagation();
  const key = box.dataset.docKey;
  const item = el.closest('.doc-item');
  if (el.dataset.doc === 'attach') docAttach(key);
  else if (el.dataset.doc === 'open' && item) docOpen(item.dataset.docId);
  else if (el.dataset.doc === 'del' && item) docDelete(item.dataset.docId, key);
});
document.addEventListener('change', (ev) => {
  const t = ev.target;
  if (!t.classList || !t.classList.contains('doc-kind')) return;
  const box = t.closest('.doc-box');
  if (box) docState.kindSel[box.dataset.docKey] = t.value;
});

(function docCss() {
  if (document.getElementById('doc-css')) return;
  const st = document.createElement('style');
  st.id = 'doc-css';
  st.textContent = ''
    + '.doc-box{margin-top:14px;padding:14px 16px;background:#fff;border:1px solid #e6e0d6;border-radius:10px;color:#1f1f1f}'
    + '.doc-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:6px}'
    + '.doc-head strong{font-size:15px}'
    + '.doc-add{display:flex;gap:8px;align-items:center}'
    + '.doc-kind{padding:6px 8px;border:1px solid #d8d1c5;border-radius:6px;background:#fff;color:#1f1f1f;font-size:13px}'
    + '.doc-btn{padding:6px 12px;border:1px solid #8a4b1c;border-radius:6px;background:#8a4b1c;color:#fff;font-size:13px;cursor:pointer}'
    + '.doc-grp{margin-top:10px}'
    + '.doc-grp h4{margin:0 0 4px;font-size:13px;font-weight:600;color:#4a433a}'
    + '.doc-grp h4 span{font-weight:400;color:#8b8377;margin-left:4px}'
    + '.doc-list{list-style:none;margin:0;padding:0}'
    + '.doc-item{display:flex;align-items:center;gap:10px;padding:5px 0;border-top:1px solid #f1ece4}'
    + '.doc-item:first-child{border-top:0}'
    + '.doc-name{background:none;border:0;padding:0;color:#1b3fae;font-size:13px;text-align:left;cursor:pointer;text-decoration:underline;max-width:46%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    + '.doc-meta{flex:1;font-size:12px;color:#7a7368}'
    + '.doc-del{background:none;border:0;color:#a33;font-size:13px;cursor:pointer;padding:2px 6px}'
    + '.doc-thumbs{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}'
    + '.doc-thumbs img{width:64px;height:48px;object-fit:cover;border:1px solid #e0d9cd;border-radius:4px;display:block}'
    + '.doc-empty,.doc-msg{margin:6px 0 0}';
  document.head.appendChild(st);
})();
