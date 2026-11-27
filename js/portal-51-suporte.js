// ============================================================
// ENVIAR PROBLEMA / ABRIR SOLICITAÇÃO (27/11/2026, migration 351)
// ============================================================
// Matt: "quero um novo botão que é enviar problema ou abrir solicitação.
// tem um lugar pra fotos ou vídeos, quero que só dê print e cole na tela,
// bem simples, com Ctrl+V eu consigo enviar a foto. pode colocar várias
// fotos ou vídeos." + "quando ele clica enviar gera um ticket, um número da
// solicitação, ele pode acompanhar o andamento" + "aba acompanhamento de
// solicitações: o número, a descrição do problema, status: enviado,
// em análise, respondido, e depois a resposta do portal sobre a solução".
//
// Botão "Reportar problema" (#po-sup-btn) na barra de cima, antes do Ajuda,
// pra todo login. Janela #po-sup, 2 abas:
//   1) Nova solicitação — Problema | Solicitação, título (opcional),
//      descrição; Ctrl+V em QUALQUER lugar da janela cola o print (ou vídeo
//      copiado); também arrastar e soltar e "escolher arquivos". Vários
//      arquivos, miniatura com ✕, até SUP_MAX_MB cada. Leva junto: aba
//      aberta, projeto aberto (id + nome), navegador.
//      Enviou = tela "Solicitação #00012 enviada" + botão Acompanhar.
//   2) Acompanhamento de solicitações — nº, tipo, descrição, data, status
//      (Enviado → Em análise → Respondido) e a resposta da fábrica.
//      Admin vê TODAS, muda o status e escreve a resposta.
// Banco: support_tickets (ticket_no = nº) + bucket privado support-files
// (<uid>/<ticket>/…). Sem a 351 rodada: aviso na janela, nada é enviado.
// Clicar fora NÃO fecha (regra das telas com formulário). Esc pergunta se
// tem algo digitado/colado.
// Desligar: localStorage.legno_sup_off = '1'.

const SUP_MAX_MB = 200;
const supState = { aba: 'novo', kind: 'problem', files: [], enviando: false, lista: null, erro: '', abertos: {}, enviado: null, filtro: 'all' };

const SUP_TXT = {
  pt: { btn: 'Reportar problema', tip: 'Enviar problema ou abrir solicitação', titulo: 'Problemas e solicitações', novo: 'Nova solicitação', meus: 'Acompanhamento de solicitações', problem: 'Problema', request: 'Solicitação', t_ph: 'Título curto (opcional)', d_ph_problem: 'O que aconteceu? O que você estava fazendo?', d_ph_request: 'O que você gostaria que a gente fizesse?', cole: 'Cole aqui o print com Ctrl+V', cole2: 'pode colar vários · ou arraste fotos e vídeos · ', escolher: 'escolher arquivos', enviar: 'Enviar', enviando: 'Enviando… {n}', fechar: 'Fechar', vazio_d: 'Escreva o que aconteceu ou cole um print.', grande: '{f} passa de {n} MB e ficou de fora.', ok_t: 'Solicitação {n} enviada', ok_d: 'A fábrica recebeu. Guarde o número: você acompanha o andamento e a resposta na aba "Acompanhamento de solicitações".', acompanhar: 'Acompanhar', outra: 'Enviar outra', need351: 'O sistema ainda não está pronto pra receber solicitações. Escreva pra sales@legnocabinets.com', erro: 'Não deu pra enviar: {e}', sair_q: 'Fechar e perder o que foi escrito/colado?', nada: 'Nenhuma solicitação ainda.', s_open: 'Enviado', s_doing: 'Em análise', s_done: 'Respondido', resposta: 'Resposta da fábrica', sem_resp: 'Ainda sem resposta — você vê aqui quando a fábrica responder.', responder: 'Resposta pro cliente (ele vê aqui)', salvar: 'Salvar', projeto: 'Projeto', tela: 'Tela', carregando: 'Carregando…', remover: 'Remover', c_num: 'Nº', c_tipo: 'Tipo', c_desc: 'Descrição', c_data: 'Data', c_status: 'Status', f_all: 'Todas', f_open: 'Abertas', f_done: 'Respondidas', atualizar: '↻ Atualizar', anexos: 'Anexos' },
  en: { btn: 'Report a problem', tip: 'Report a problem or open a request', titulo: 'Problems and requests', novo: 'New request', meus: 'Request tracking', problem: 'Problem', request: 'Request', t_ph: 'Short title (optional)', d_ph_problem: 'What happened? What were you doing?', d_ph_request: 'What would you like us to do?', cole: 'Paste your screenshot here with Ctrl+V', cole2: 'you can paste several · or drop photos and videos · ', escolher: 'choose files', enviar: 'Send', enviando: 'Sending… {n}', fechar: 'Close', vazio_d: 'Describe what happened or paste a screenshot.', grande: '{f} is over {n} MB and was left out.', ok_t: 'Request {n} sent', ok_d: 'The factory received it. Keep this number: you can follow the progress and the reply in "Request tracking".', acompanhar: 'Track it', outra: 'Send another', need351: 'The system is not ready to receive requests yet. Please email sales@legnocabinets.com', erro: 'Could not send: {e}', sair_q: 'Close and lose what you typed/pasted?', nada: 'No requests yet.', s_open: 'Sent', s_doing: 'Under review', s_done: 'Answered', resposta: 'Factory reply', sem_resp: 'No reply yet — it will show up here when the factory answers.', responder: 'Reply to the client (they see it here)', salvar: 'Save', projeto: 'Project', tela: 'Screen', carregando: 'Loading…', remover: 'Remove', c_num: 'No.', c_tipo: 'Type', c_desc: 'Description', c_data: 'Date', c_status: 'Status', f_all: 'All', f_open: 'Open', f_done: 'Answered', atualizar: '↻ Refresh', anexos: 'Attachments' },
  es: { btn: 'Reportar problema', tip: 'Reportar un problema o abrir una solicitud', titulo: 'Problemas y solicitudes', novo: 'Nueva solicitud', meus: 'Seguimiento de solicitudes', problem: 'Problema', request: 'Solicitud', t_ph: 'Título corto (opcional)', d_ph_problem: '¿Qué pasó? ¿Qué estabas haciendo?', d_ph_request: '¿Qué te gustaría que hiciéramos?', cole: 'Pega aquí la captura con Ctrl+V', cole2: 'puedes pegar varias · o arrastra fotos y videos · ', escolher: 'elegir archivos', enviar: 'Enviar', enviando: 'Enviando… {n}', fechar: 'Cerrar', vazio_d: 'Escribe lo que pasó o pega una captura.', grande: '{f} pasa de {n} MB y quedó fuera.', ok_t: 'Solicitud {n} enviada', ok_d: 'La fábrica la recibió. Guarda el número: puedes seguir el avance y la respuesta en "Seguimiento de solicitudes".', acompanhar: 'Seguir', outra: 'Enviar otra', need351: 'El sistema todavía no está listo para recibir solicitudes. Escribe a sales@legnocabinets.com', erro: 'No se pudo enviar: {e}', sair_q: '¿Cerrar y perder lo escrito/pegado?', nada: 'Aún no hay solicitudes.', s_open: 'Enviado', s_doing: 'En análisis', s_done: 'Respondido', resposta: 'Respuesta de la fábrica', sem_resp: 'Aún sin respuesta — la verás aquí cuando la fábrica responda.', responder: 'Respuesta al cliente (la ve aquí)', salvar: 'Guardar', projeto: 'Proyecto', tela: 'Pantalla', carregando: 'Cargando…', remover: 'Quitar', c_num: 'Nº', c_tipo: 'Tipo', c_desc: 'Descripción', c_data: 'Fecha', c_status: 'Estado', f_all: 'Todas', f_open: 'Abiertas', f_done: 'Respondidas', atualizar: '↻ Actualizar', anexos: 'Adjuntos' }
};
function supT(k, vars) {
  let l = 'en';
  try { l = (typeof I18n !== 'undefined' && I18n.getLanguage) ? I18n.getLanguage() : 'en'; } catch (e) { /* en */ }
  let s = (SUP_TXT[l] || SUP_TXT.en)[k]; if (s == null) s = SUP_TXT.en[k] || k;
  if (vars) Object.keys(vars).forEach((v) => { s = s.split('{' + v + '}').join(vars[v]); });
  return s;
}
function supEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function supNum(n) { return n == null ? '—' : '#' + String(n).padStart(5, '0'); }
function supAdmin() { return window.LEGNO_IS_ADMIN === true; }
function supOn() {
  try { if (localStorage.getItem('legno_sup_off') === '1') return false; } catch (e) { /* segue */ }
  return typeof currentUser !== 'undefined' && !!currentUser && typeof supabaseClient !== 'undefined';
}
function supMb(b) { return b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
function supSujo() {
  const d = document.getElementById('sup-d'), t = document.getElementById('sup-t');
  return supState.files.length > 0 || (d && d.value.trim()) || (t && t.value.trim());
}
function supFaltou351(m) { return /support_tickets|support-files|does not exist|schema cache|Bucket not found|ticket_no/i.test(m || ''); }

function supCss() {
  if (document.getElementById('po-sup-css')) return;
  const st = document.createElement('style'); st.id = 'po-sup-css';
  st.textContent = ''
    + '#po-sup-btn{display:inline-flex;align-items:center;gap:5px}#po-sup-btn svg{width:16px;height:16px;flex:none}'
    + '#po-sup{position:fixed;inset:0;z-index:3500;background:rgba(30,26,22,.45);display:flex;align-items:center;justify-content:center}'
    + '#po-sup .sp-box{background:#fff;border-radius:12px;width:min(880px,96vw);height:min(760px,92vh);display:flex;flex-direction:column;box-shadow:0 18px 50px rgba(0,0,0,.25);color:#2b2621}'
    + '#po-sup .sp-hd{display:flex;align-items:center;gap:12px;padding:14px 18px 0}'
    + '#po-sup .sp-hd h3{margin:0;font-size:17px;flex:1}'
    + '#po-sup .sp-x{background:none;border:0;font-size:24px;cursor:pointer;color:#766f64;width:auto;padding:0 4px;margin:0;line-height:1}'
    + '#po-sup .sp-tabs{display:flex;gap:4px;padding:10px 18px 0;border-bottom:1px solid #e9e3da}'
    + '#po-sup .sp-tab{background:#f3efe9;color:#5b5348;border:0;border-radius:8px 8px 0 0;padding:8px 16px;cursor:pointer;width:auto;margin:0;font-size:13px}'
    + '#po-sup .sp-tab.on{background:#6e4527;color:#fff}'
    + '#po-sup .sp-bd{padding:14px 18px;overflow:auto;flex:1}'
    + '#po-sup .sp-kind{display:flex;gap:8px;margin-bottom:10px}'
    + '#po-sup .sp-k{flex:1;border:2px solid #e3ddd3;background:#fff;color:#2b2621;border-radius:10px;padding:10px;cursor:pointer;font-weight:600;width:auto;margin:0}'
    + '#po-sup .sp-k.on{border-color:#6e4527;background:#f8f1ea;color:#6e4527}'
    + '#po-sup input.sp-in,#po-sup textarea.sp-in{width:100%;box-sizing:border-box;border:1px solid #ddd6cb;border-radius:8px;padding:8px 10px;font:inherit;margin:0 0 8px;color:#2b2621;background:#fff}'
    + '#po-sup textarea.sp-in{min-height:96px;resize:vertical}'
    + '#po-sup .sp-drop{border:2px dashed #c9bfb1;border-radius:10px;padding:18px;text-align:center;color:#766f64;background:#fbf9f6;outline:none}'
    + '#po-sup .sp-drop.over{border-color:#6e4527;background:#f8f1ea}'
    + '#po-sup .sp-drop b{display:block;font-size:15px;color:#2b2621;margin-bottom:3px}'
    + '#po-sup .sp-drop a{color:#6e4527;text-decoration:underline;cursor:pointer}'
    + '#po-sup .sp-files{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}'
    + '#po-sup .sp-f{position:relative;width:118px;border:1px solid #e3ddd3;border-radius:8px;overflow:hidden;background:#f6f3ef;font-size:11px}'
    + '#po-sup .sp-f img,#po-sup .sp-f video{width:118px;height:80px;object-fit:cover;display:block;background:#222}'
    + '#po-sup .sp-f .sp-fn{padding:3px 5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#5b5348}'
    + '#po-sup .sp-f .sp-del{position:absolute;top:3px;right:3px;width:22px;height:22px;border-radius:50%;border:0;background:rgba(0,0,0,.6);color:#fff;cursor:pointer;padding:0;margin:0;line-height:22px;font-size:13px}'
    + '#po-sup .sp-ft{display:flex;align-items:center;gap:10px;padding:12px 18px;border-top:1px solid #eee}'
    + '#po-sup .sp-msg{flex:1;font-size:13px;color:#766f64}#po-sup .sp-msg.err{color:#b3261e}'
    + '#po-sup .sp-go{background:#6e4527;color:#fff;border:0;border-radius:8px;padding:9px 22px;cursor:pointer;font-weight:600;width:auto;margin:0}'
    + '#po-sup .sp-go:disabled{opacity:.5;cursor:default}'
    + '#po-sup .sp-sec{background:#f3efe9;color:#2b2621;border:0;border-radius:8px;padding:9px 16px;cursor:pointer;width:auto;margin:0}'
    + '#po-sup .sp-ok{text-align:center;padding:40px 20px}#po-sup .sp-ok .sp-big{font-size:46px;color:#2f6f4f}'
    + '#po-sup .sp-ok h4{font-size:22px;margin:8px 0}#po-sup .sp-ok p{color:#5b5348;max-width:460px;margin:0 auto 18px}'
    + '#po-sup .sp-ok .sp-nn{display:inline-block;font-size:28px;font-weight:700;letter-spacing:1px;background:#f8f1ea;color:#6e4527;border-radius:10px;padding:6px 18px;margin-bottom:10px}'
    + '#po-sup .sp-bar{display:flex;gap:6px;align-items:center;margin-bottom:10px}'
    + '#po-sup .sp-fil{background:#f3efe9;color:#5b5348;border:0;border-radius:14px;padding:5px 12px;cursor:pointer;width:auto;margin:0;font-size:12px}'
    + '#po-sup .sp-fil.on{background:#2b2621;color:#fff}'
    + '#po-sup table.sp-tb{width:100%;border-collapse:collapse;font-size:13px}'
    + '#po-sup .sp-tb th{text-align:left;color:#8b8377;font-weight:600;font-size:12px;padding:6px 8px;border-bottom:1px solid #e9e3da;white-space:nowrap}'
    + '#po-sup .sp-tb td{padding:9px 8px;border-bottom:1px solid #f0ebe4;vertical-align:top}'
    + '#po-sup .sp-tb tr.sp-r{cursor:pointer}#po-sup .sp-tb tr.sp-r:hover td{background:#faf7f3}'
    + '#po-sup .sp-tb .sp-n{font-weight:700;color:#6e4527;white-space:nowrap}'
    + '#po-sup .sp-tb .sp-ds{max-width:380px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    + '#po-sup .sp-tb .sp-ds small{display:block;color:#8b8377}'
    + '#po-sup .sp-st{font-size:12px;padding:3px 10px;border-radius:12px;white-space:nowrap;display:inline-block;min-width:86px;text-align:center}'
    + '#po-sup .sp-st.open{background:#fdecd8;color:#8a4b10}#po-sup .sp-st.doing{background:#e3edf8;color:#1d4f86}#po-sup .sp-st.done{background:#e1f1e7;color:#2f6f4f}'
    + '#po-sup .sp-kt{font-size:11px;padding:2px 7px;border-radius:10px;background:#eee;color:#555;white-space:nowrap}#po-sup .sp-kt.problem{background:#fbe4e2;color:#a2281f}'
    + '#po-sup .sp-steps{display:flex;gap:0;margin:4px 0 10px;font-size:12px}'
    + '#po-sup .sp-steps span{flex:1;text-align:center;padding:5px 4px;background:#f3efe9;color:#8b8377;border-right:2px solid #fff}'
    + '#po-sup .sp-steps span.on{background:#6e4527;color:#fff}#po-sup .sp-steps span.fim{background:#2f6f4f;color:#fff}'
    + '#po-sup td.sp-rb{background:#fcfaf7;font-size:13px;padding:10px 14px}'
    + '#po-sup .sp-rb p{white-space:pre-wrap;margin:6px 0}#po-sup .sp-meta{color:#8b8377;font-size:12px}'
    + '#po-sup .sp-rep{background:#eef6f1;border-left:3px solid #2f6f4f;border-radius:6px;padding:8px 10px;margin-top:10px}'
    + '#po-sup .sp-rep.vazio{background:#f6f3ef;border-left-color:#c9bfb1;color:#8b8377}'
    + '#po-sup .sp-adm{display:flex;gap:8px;align-items:flex-start;margin-top:10px}#po-sup .sp-adm select{width:auto;margin:0}#po-sup .sp-adm textarea{flex:1;min-height:56px;margin:0}';
  document.head.appendChild(st);
}

function supBotao() {
  let btn = document.getElementById('po-sup-btn');
  if (!supOn()) { if (btn) btn.style.display = 'none'; return; }
  if (!btn) {
    const ref = document.getElementById('po-help-btn');
    if (!ref || !ref.parentNode) return;
    supCss();
    btn = document.createElement('button');
    btn.type = 'button'; btn.id = 'po-sup-btn'; btn.className = 'po-help-link';
    btn.addEventListener('click', () => supAbrir());
    ref.parentNode.insertBefore(btn, ref);
  }
  btn.style.display = '';
  const txt = supT('btn');
  if (btn.getAttribute('data-txt') !== txt) {
    btn.setAttribute('data-txt', txt);
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M12 7v4"/><path d="M12 14h.01"/></svg><span>' + supEsc(txt) + '</span>';
    btn.title = supT('tip');
  }
}

// ---------- arquivos ----------
function supAddFiles(list) {
  let aviso = '';
  Array.from(list || []).forEach((f) => {
    if (!f || !(/^(image|video)\//.test(f.type) || /\.(png|jpe?g|gif|webp|heic|mp4|mov|webm|mkv|avi)$/i.test(f.name || ''))) return;
    if (f.size > SUP_MAX_MB * 1048576) { aviso = supT('grande', { f: f.name || 'file', n: SUP_MAX_MB }); return; }
    let nome = f.name;
    if (!nome || /^image\.(png|jpe?g)$/i.test(nome)) {          // print colado chega como "image.png"
      const d = new Date(); const p = (n) => String(n).padStart(2, '0');
      nome = 'print-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + '-' + (supState.files.length + 1) + '.' + ((f.type.split('/')[1] || 'png').replace('jpeg', 'jpg'));
    }
    supState.files.push({ file: f, name: nome, url: URL.createObjectURL(f) });
  });
  supPintaFiles(); supMsg(aviso, aviso ? 'err' : '');
}
function supPintaFiles() {
  const box = document.getElementById('sup-files'); if (!box) return;
  box.innerHTML = supState.files.map((f, i) => {
    const v = /^video\//.test(f.file.type);
    const prev = v ? '<video src="' + f.url + '" muted preload="metadata"></video>' : '<img src="' + f.url + '" alt="">';
    return '<div class="sp-f">' + prev + '<div class="sp-fn" title="' + supEsc(f.name) + '">' + (v ? '🎬 ' : '') + supEsc(f.name) + ' · ' + supMb(f.file.size) + '</div>'
      + '<button type="button" class="sp-del" data-sup-del="' + i + '" title="' + supEsc(supT('remover')) + '">✕</button></div>';
  }).join('');
}
function supMsg(t, cls) {
  const m = document.getElementById('sup-msg'); if (!m) return;
  m.textContent = t || ''; m.className = 'sp-msg' + (cls ? ' ' + cls : '');
}

// ---------- janela ----------
function supAbrir(aba) {
  if (!supOn()) return;
  supCss();
  if (aba) supState.aba = aba;
  let ov = document.getElementById('po-sup');
  if (!ov) {
    ov = document.createElement('div'); ov.id = 'po-sup';
    document.body.appendChild(ov);
    ov.addEventListener('click', supClick);
    ov.addEventListener('change', supChange);
    ov.addEventListener('dragover', (e) => { if (supState.aba !== 'novo') return; e.preventDefault(); const d = document.getElementById('sup-drop'); if (d) d.classList.add('over'); });
    ov.addEventListener('dragleave', (e) => { const d = document.getElementById('sup-drop'); if (d && !ov.contains(e.relatedTarget)) d.classList.remove('over'); });
    ov.addEventListener('drop', (e) => { if (supState.aba !== 'novo') return; e.preventDefault(); const d = document.getElementById('sup-drop'); if (d) d.classList.remove('over'); supAddFiles(e.dataTransfer && e.dataTransfer.files); });
  }
  if (supState.aba === 'lista') supState.lista = null;
  supRender();
  if (supState.aba === 'novo') setTimeout(() => { const d = document.getElementById('sup-d'); if (d) d.focus(); }, 30);
}
function supFechar() {
  if (supState.aba === 'novo' && !supState.enviado && supSujo() && !confirm(supT('sair_q'))) return;
  const ov = document.getElementById('po-sup'); if (ov) ov.remove();
  supLimpa(); supState.enviado = null;
}
function supLimpa() {
  supState.files.forEach((f) => { try { URL.revokeObjectURL(f.url); } catch (e) { /* ok */ } });
  supState.files = []; supState.enviando = false; supState._t = ''; supState._d = '';
}
function supRender() {
  const ov = document.getElementById('po-sup'); if (!ov) return;
  const t = document.getElementById('sup-t'), d = document.getElementById('sup-d');
  if (t) supState._t = t.value; if (d) supState._d = d.value;
  const novo = supState.aba === 'novo';
  const form = novo && !supState.enviado;
  ov.innerHTML = '<div class="sp-box" role="dialog" aria-modal="true">'
    + '<div class="sp-hd"><h3>' + supEsc(supT('titulo')) + '</h3><button type="button" class="sp-x" data-sup="close" title="' + supEsc(supT('fechar')) + '">×</button></div>'
    + '<div class="sp-tabs"><button type="button" class="sp-tab' + (novo ? ' on' : '') + '" data-sup-aba="novo">✚ ' + supEsc(supT('novo')) + '</button>'
    + '<button type="button" class="sp-tab' + (!novo ? ' on' : '') + '" data-sup-aba="lista">☰ ' + supEsc(supT('meus')) + '</button></div>'
    + '<div class="sp-bd">' + (novo ? (supState.enviado ? supHtmlOk() : supHtmlNovo()) : supHtmlLista()) + '</div>'
    + (form ? '<div class="sp-ft"><span class="sp-msg" id="sup-msg"></span><button type="button" class="sp-sec" data-sup="close">' + supEsc(supT('fechar')) + '</button><button type="button" class="sp-go" data-sup="send">' + supEsc(supT('enviar')) + '</button></div>' : '')
    + '</div>';
  if (form) {
    supPintaFiles();
    const tt = document.getElementById('sup-t'), dd = document.getElementById('sup-d');
    if (tt) tt.value = supState._t || ''; if (dd) dd.value = supState._d || '';
  } else if (!novo && !supState.lista && !supState.erro) supCarregaLista();
}
function supHtmlNovo() {
  const k = supState.kind;
  return '<div class="sp-kind"><button type="button" class="sp-k' + (k === 'problem' ? ' on' : '') + '" data-sup-kind="problem">⚠ ' + supEsc(supT('problem')) + '</button>'
    + '<button type="button" class="sp-k' + (k === 'request' ? ' on' : '') + '" data-sup-kind="request">✚ ' + supEsc(supT('request')) + '</button></div>'
    + '<input class="sp-in" id="sup-t" maxlength="140" placeholder="' + supEsc(supT('t_ph')) + '">'
    + '<textarea class="sp-in" id="sup-d" placeholder="' + supEsc(supT(k === 'problem' ? 'd_ph_problem' : 'd_ph_request')) + '"></textarea>'
    + '<div class="sp-drop" id="sup-drop"><b>📋 ' + supEsc(supT('cole')) + '</b>' + supEsc(supT('cole2')) + '<a data-sup="pick">' + supEsc(supT('escolher')) + '</a>'
    + '<input type="file" id="sup-pick" multiple accept="image/*,video/*" style="display:none"></div>'
    + '<div class="sp-files" id="sup-files"></div>';
}
function supHtmlOk() {
  const n = supNum(supState.enviado.ticket_no);
  return '<div class="sp-ok"><div class="sp-big">✓</div><h4>' + supEsc(supT('ok_t', { n: '' })) + '</h4>'
    + '<div class="sp-nn">' + supEsc(n) + '</div><p>' + supEsc(supT('ok_d')) + '</p>'
    + '<button type="button" class="sp-go" data-sup="track">' + supEsc(supT('acompanhar')) + '</button> '
    + '<button type="button" class="sp-sec" data-sup="again">' + supEsc(supT('outra')) + '</button></div>';
}
function supPasso(st) {
  const ordem = ['open', 'doing', 'done']; const i = Math.max(0, ordem.indexOf(st));
  return '<div class="sp-steps">' + ordem.map((s, j) => '<span class="' + (j <= i ? (st === 'done' ? 'fim' : 'on') : '') + '">' + supEsc(supT('s_' + s)) + '</span>').join('') + '</div>';
}
function supHtmlLista() {
  if (supState.erro && !supState.lista) return '<div class="sp-msg err">' + supEsc(supState.erro) + '</div>';
  if (!supState.lista) return '<div class="sp-msg">' + supEsc(supT('carregando')) + '</div>';
  const f = supState.filtro;
  const linhas = supState.lista.filter((r) => f === 'all' || (f === 'done' ? r.status === 'done' : r.status !== 'done'));
  const bar = '<div class="sp-bar">' + ['all', 'open', 'done'].map((k) => '<button type="button" class="sp-fil' + (f === k ? ' on' : '') + '" data-sup-fil="' + k + '">' + supEsc(supT('f_' + k)) + '</button>').join('')
    + '<span style="flex:1"></span><button type="button" class="sp-fil" data-sup="reload">' + supEsc(supT('atualizar')) + '</button></div>';
  if (!linhas.length) return bar + '<div class="sp-msg">' + supEsc(supT('nada')) + '</div>';
  return bar + '<table class="sp-tb"><thead><tr><th>' + supEsc(supT('c_num')) + '</th><th>' + supEsc(supT('c_tipo')) + '</th><th>' + supEsc(supT('c_desc')) + '</th><th>' + supEsc(supT('c_data')) + '</th><th>' + supEsc(supT('c_status')) + '</th></tr></thead><tbody>'
    + linhas.map((r) => {
      const ab = !!supState.abertos[r.id];
      const tt = r.title || (r.description || '').split('\n')[0] || '—';
      const sub = r.title ? (r.description || '').split('\n')[0] : '';
      let linha = '<tr class="sp-r" data-sup-row="' + r.id + '"><td class="sp-n">' + supEsc(supNum(r.ticket_no)) + '</td>'
        + '<td><span class="sp-kt ' + r.kind + '">' + supEsc(supT(r.kind)) + '</span></td>'
        + '<td class="sp-ds">' + supEsc(tt) + (supAdmin() ? ' <small>' + supEsc(r.email || '') + '</small>' : (sub ? '<small>' + supEsc(sub) + '</small>' : ''))
        + ((r.files || []).length ? '<small>📎 ' + r.files.length + '</small>' : '') + '</td>'
        + '<td style="white-space:nowrap">' + supEsc(new Date(r.created_at).toLocaleDateString()) + '</td>'
        + '<td><span class="sp-st ' + r.status + '">' + supEsc(supT('s_' + r.status)) + '</span>' + (r.admin_reply && r.status !== 'done' ? ' 💬' : '') + '</td></tr>';
      if (ab) {
        const fs = r.files || [];
        linha += '<tr><td colspan="5" class="sp-rb">' + supPasso(r.status)
          + '<div class="sp-meta">' + [new Date(r.created_at).toLocaleString(), r.page ? supT('tela') + ': ' + r.page : '', r.project_name ? supT('projeto') + ': ' + r.project_name : ''].filter(Boolean).map(supEsc).join(' · ') + '</div>'
          + (r.title ? '<p><b>' + supEsc(r.title) + '</b></p>' : '')
          + (r.description ? '<p>' + supEsc(r.description) + '</p>' : '')
          + (fs.length ? '<div class="sp-files" data-sup-arqs="' + r.id + '">' + fs.map((x, i) => '<div class="sp-f" data-sup-f="' + i + '"><div style="height:80px;display:flex;align-items:center;justify-content:center;color:#999">…</div><div class="sp-fn" title="' + supEsc(x.name) + '">' + supEsc(x.name) + '</div></div>').join('') + '</div>' : '')
          + (supAdmin()
            ? '<div class="sp-adm"><select data-sup-status="' + r.id + '">' + ['open', 'doing', 'done'].map((s) => '<option value="' + s + '"' + (r.status === s ? ' selected' : '') + '>' + supEsc(supT('s_' + s)) + '</option>').join('') + '</select>'
              + '<textarea class="sp-in" id="sup-rep-' + r.id + '" placeholder="' + supEsc(supT('responder')) + '">' + supEsc(r.admin_reply || '') + '</textarea>'
              + '<button type="button" class="sp-go" data-sup-rep="' + r.id + '">' + supEsc(supT('salvar')) + '</button></div>'
            : (r.admin_reply
              ? '<div class="sp-rep"><b>' + supEsc(supT('resposta')) + ':</b><br>' + supEsc(r.admin_reply).replace(/\n/g, '<br>') + '</div>'
              : ''))
          + '</td></tr>';
      }
      return linha;
    }).join('') + '</tbody></table>';
}

async function supCarregaLista() {
  supState.erro = '';
  try {
    let q = supabaseClient.from('support_tickets').select('*').order('created_at', { ascending: false }).limit(300);
    if (!supAdmin()) q = q.eq('user_id', currentUser.id);
    const { data, error } = await q;
    if (error) throw error;
    supState.lista = data || [];
  } catch (e) {
    supState.lista = null;
    const m = (e && e.message) || String(e);
    supState.erro = supFaltou351(m) ? supT('need351') : supT('erro', { e: m });
  }
  if (supState.aba === 'lista') {
    supRender();
    Object.keys(supState.abertos).forEach((id) => { if (supState.abertos[id]) supMostraArquivos(id); });
  }
}
async function supMostraArquivos(id) {
  const r = (supState.lista || []).find((x) => x.id === id); if (!r) return;
  const box = document.querySelector('#po-sup [data-sup-arqs="' + id + '"]'); if (!box) return;
  for (let i = 0; i < (r.files || []).length; i++) {
    const f = r.files[i];
    try {
      const { data } = await supabaseClient.storage.from('support-files').createSignedUrl(f.path, 3600);
      const url = data && data.signedUrl; if (!url) continue;
      const el = box.querySelector('[data-sup-f="' + i + '"]'); if (!el) continue;
      const v = /^video\//.test(f.type || '');
      const prev = v ? '<video src="' + url + '" controls preload="metadata"></video>' : '<img src="' + url + '" alt="">';
      el.innerHTML = (v ? prev : '<a href="' + url + '" target="_blank" rel="noopener">' + prev + '</a>') + '<div class="sp-fn" title="' + supEsc(f.name) + '"><a href="' + url + '" target="_blank" rel="noopener">' + supEsc(f.name) + '</a></div>';
    } catch (e) { /* segue */ }
  }
}

function supContexto() {
  let page = '';
  try { const a = document.querySelector('#po-sidebar .portal-tab-btn.active'); page = a ? (a.textContent || '').trim() || a.getAttribute('data-tab') || '' : ''; } catch (e) { /* ok */ }
  let pid = null, pnome = null;
  try { if (typeof loadedProjectFavorite !== 'undefined' && loadedProjectFavorite && loadedProjectFavorite.id) { pid = loadedProjectFavorite.id; pnome = loadedProjectFavorite.name || null; } } catch (e) { /* ok */ }
  return { page: page ? page.slice(0, 80) : null, project_id: pid, project_name: pnome, user_agent: (navigator.userAgent || '').slice(0, 400) };
}

async function supEnviar() {
  if (supState.enviando) return;
  const t = (document.getElementById('sup-t') || {}).value || '';
  const d = (document.getElementById('sup-d') || {}).value || '';
  if (!d.trim() && !t.trim() && !supState.files.length) { supMsg(supT('vazio_d'), 'err'); return; }
  supState.enviando = true;
  const go = document.querySelector('#po-sup [data-sup="send"]'); if (go) go.disabled = true;
  supMsg(supT('enviando', { n: '' }));
  try {
    const { data: tk, error } = await supabaseClient.from('support_tickets').insert({
      user_id: currentUser.id, email: currentUser.email || null, kind: supState.kind,
      title: t.trim().slice(0, 140), description: d.trim(), ...supContexto()
    }).select('id, ticket_no').single();
    if (error) throw error;
    const arqs = [];
    for (let i = 0; i < supState.files.length; i++) {
      const f = supState.files[i];
      supMsg(supT('enviando', { n: (i + 1) + '/' + supState.files.length }));
      const limpo = f.name.replace(/[^\w.\-]+/g, '_').slice(-80);
      const path = currentUser.id + '/' + tk.id + '/' + String(i + 1).padStart(2, '0') + '-' + limpo;
      const up = await supabaseClient.storage.from('support-files').upload(path, f.file, { contentType: f.file.type || 'application/octet-stream', upsert: false });
      if (up.error) throw up.error;
      arqs.push({ path, name: f.name, type: f.file.type || '', size: f.file.size });
    }
    if (arqs.length) {
      const { error: e2 } = await supabaseClient.from('support_tickets').update({ files: arqs }).eq('id', tk.id);
      if (e2) throw e2;
    }
    supLimpa();
    supState.enviado = tk; supState.lista = null;
    supRender();
    try { if (window.LegnoSino && window.LegnoSino.atualizar) window.LegnoSino.atualizar(); } catch (e) { /* ok */ }
  } catch (e) {
    const m = (e && e.message) || String(e);
    supMsg(supFaltou351(m) ? supT('need351') : supT('erro', { e: m }), 'err');
    supState.enviando = false; if (go) go.disabled = false;
  }
}

function supClick(e) {
  const el = e.target.closest ? e.target.closest('[data-sup],[data-sup-aba],[data-sup-kind],[data-sup-del],[data-sup-row],[data-sup-rep],[data-sup-fil]') : null;
  if (!el) return;
  if (el.hasAttribute('data-sup-aba')) {
    supState.aba = el.getAttribute('data-sup-aba');
    if (supState.aba === 'lista') { supState.lista = null; supState.erro = ''; } else supState.enviado = null;
    supRender(); return;
  }
  if (el.hasAttribute('data-sup-fil')) { supState.filtro = el.getAttribute('data-sup-fil'); supRender(); return; }
  if (el.hasAttribute('data-sup-kind')) {
    supState.kind = el.getAttribute('data-sup-kind');
    document.querySelectorAll('#po-sup .sp-k').forEach((b) => b.classList.toggle('on', b === el));
    const d = document.getElementById('sup-d'); if (d) d.placeholder = supT(supState.kind === 'problem' ? 'd_ph_problem' : 'd_ph_request');
    return;
  }
  if (el.hasAttribute('data-sup-del')) {
    const i = +el.getAttribute('data-sup-del'); const f = supState.files[i];
    if (f) { try { URL.revokeObjectURL(f.url); } catch (x) { /* ok */ } supState.files.splice(i, 1); supPintaFiles(); }
    return;
  }
  if (el.hasAttribute('data-sup-row')) {
    const id = el.getAttribute('data-sup-row');
    supState.abertos[id] = !supState.abertos[id]; supRender();
    Object.keys(supState.abertos).forEach((k) => { if (supState.abertos[k]) supMostraArquivos(k); });
    return;
  }
  if (el.hasAttribute('data-sup-rep')) { supSalvaAdmin(el.getAttribute('data-sup-rep')); return; }
  const a = el.getAttribute('data-sup');
  if (a === 'close') supFechar();
  else if (a === 'send') supEnviar();
  else if (a === 'pick') { const p = document.getElementById('sup-pick'); if (p) p.click(); }
  else if (a === 'track') { const id = supState.enviado && supState.enviado.id; supState.enviado = null; supState.aba = 'lista'; supState.lista = null; supState.filtro = 'all'; if (id) supState.abertos[id] = true; supRender(); }
  else if (a === 'again') { supState.enviado = null; supRender(); }
  else if (a === 'reload') { supState.lista = null; supRender(); }
}
function supChange(e) {
  if (e.target && e.target.id === 'sup-pick') { supAddFiles(e.target.files); e.target.value = ''; return; }
  const sid = e.target && e.target.getAttribute && e.target.getAttribute('data-sup-status');
  if (sid) supSalvaAdmin(sid);
}
async function supSalvaAdmin(id) {
  if (!supAdmin()) return;
  const sel = document.querySelector('#po-sup [data-sup-status="' + id + '"]');
  const rep = document.getElementById('sup-rep-' + id);
  const patch = {};
  if (sel) patch.status = sel.value;
  if (rep) patch.admin_reply = rep.value.trim() || null;
  const { error } = await supabaseClient.from('support_tickets').update(patch).eq('id', id);
  if (error) { alert(supT('erro', { e: error.message })); return; }
  const r = (supState.lista || []).find((x) => x.id === id); if (r) Object.assign(r, patch);
  supRender(); supMostraArquivos(id);
}

(function supBoot() {
  // Ctrl+V com a janela aberta (aba Nova): cola print/vídeo de qualquer lugar dela
  document.addEventListener('paste', (e) => {
    if (!document.getElementById('po-sup') || supState.aba !== 'novo' || supState.enviado) return;
    const cd = e.clipboardData; if (!cd) return;
    const fs = [];
    if (cd.files && cd.files.length) Array.from(cd.files).forEach((f) => fs.push(f));
    else Array.from(cd.items || []).forEach((it) => { if (it.kind === 'file') { const f = it.getAsFile(); if (f) fs.push(f); } });
    if (!fs.length) return;            // texto colado segue normal no campo
    e.preventDefault(); e.stopPropagation();
    supAddFiles(fs);
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('po-sup')) { e.stopPropagation(); supFechar(); }
  }, true);
  const tick = () => supBotao();
  [800, 2500, 6000].forEach((ms) => setTimeout(tick, ms));
  setInterval(tick, 5000);
})();

window.LegnoSuporte = { abrir: supAbrir };
