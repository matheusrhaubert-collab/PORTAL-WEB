// ============================================================
// VIRAR DEALER pelo portal + ficha da empresa (20/11/2026, Etapa 1;
// migrations 306 e 307)
// ============================================================
// Matt, 20/11: "Dealer agora não é só troca administrativa, ele deve ser
// solicitado pelo próprio portal do cliente ao clicar se tornar dealer. ele
// deve mandar um formulário... contendo todas as informações da empresa pra
// emissão da invoice... dar aceite de um contrato... responder um
// questionário... enviar o Tax exemption atualizado do ano, quero uma IA leia
// e veja se está valendo, e agende a validade."
//
// O que faz: janela em 4 passos — 1 Empresa (dados da invoice), 2
// Questionário, 3 Contrato (aceite com nome digitado; o PDF assinado vai pros
// documentos da empresa), 4 Tax exemption (upload; a função account-tax-check
// lê e PROPÕE a validade, a fábrica confirma) — e "Enviar pra Legno". Depois
// de enviada vira a FICHA da empresa (situação, tax exempt, documentos,
// renovar certificado).
//
// EM TESTE: só aparece com DAPP_SO_ADMIN = false, pra administrador, ou em
// quem abrir o portal com ?dealerapp=1 no endereço (grava
// localStorage.legno_dealer_app = '1'; ?dealerapp=0 desliga). Pra testar como
// cliente: entrar com uma conta 'cliente' de teste em portal.html?dealerapp=1
// e clicar em "Become a dealer".
//
// NÃO mexe em arquivo existente: EMBRULHA showBecomeDealerModal e
// refreshBecomeDealerUi (portal-05) pra acrescentar o botão "Apply online".
// Textos pt/en/es aqui mesmo (DAPP_TXT). Contrato em js/dealer-agreement.js.
// Sem as migrations a janela avisa e fecha, sem barulho.
//
// Carregado depois do portal-41.

const DAPP_SO_ADMIN = true;
const DAPP_BUCKET = 'account-docs';
const DAPP_MAX_BYTES = 20 * 1024 * 1024;
const dappState = { acc: null, docs: [], role: null, step: 1, busy: false, msg: '', err: '', reading: null };

(function dappUrlFlag() {
  try {
    const p = new URLSearchParams(location.search).get('dealerapp');
    if (p === '1') localStorage.setItem('legno_dealer_app', '1');
    if (p === '0') localStorage.removeItem('legno_dealer_app');
  } catch (e) { /* sem localStorage */ }
})();
function dappOn() {
  if (!DAPP_SO_ADMIN) return true;
  if (window.LEGNO_IS_ADMIN === true) return true;
  try { return localStorage.getItem('legno_dealer_app') === '1'; } catch (e) { return false; }
}

const DAPP_TXT = {
  en: {
    apply: 'Apply online', title: 'Become a Legno dealer', company_title: 'Company file',
    s1: 'Company', s2: 'Questionnaire', s3: 'Agreement', s4: 'Tax exemption',
    back: 'Back', next: 'Save and continue', close: 'Close', submit: 'Send to Legno', done: 'Done', saving: 'Saving…',
    legal_name: 'Legal business name', trade_name: 'Trade name (DBA)', ein: 'EIN (Tax ID)', contact_name: 'Contact person',
    billing_email: 'Billing e-mail (invoices)', phone: 'Phone', website: 'Website',
    billing: 'Billing address', shipping: 'Shipping address', shipping_same: 'Same as billing address',
    line1: 'Street address', line2: 'Suite / unit', city: 'City', state: 'State', zip: 'ZIP',
    s1_hint: 'This is what goes on your invoices. You can change it later.',
    q_business_type: 'Type of business', q_years_in_business: 'Years in business', q_annual_revenue: 'Annual revenue',
    q_states_served: 'States / areas you serve', q_projects_per_month: 'Cabinet projects per month',
    q_european_brands: 'Do you already work with European cabinet brands?', q_european_brands_which: 'Which ones?',
    q_how_heard: 'How did you hear about Legno?', q_notes: 'Anything else we should know?',
    choose: '— choose —', yes: 'Yes', no: 'No',
    bt_showroom: 'Showroom / kitchen & bath store', bt_contractor: 'General contractor / builder', bt_designer: 'Interior designer / architect',
    bt_distributor: 'Distributor / representative', bt_millwork: 'Cabinet shop / millwork', bt_other: 'Other',
    y_lt1: 'Less than 1 year', y_1_2: '1–2 years', y_3_5: '3–5 years', y_6_10: '6–10 years', y_gt10: 'More than 10 years',
    r_lt250k: 'Under $250k', r_250k_500k: '$250k – $500k', r_500k_1m: '$500k – $1M', r_1m_3m: '$1M – $3M', r_3m_10m: '$3M – $10M', r_gt10m: 'Over $10M',
    p_1_2: '1–2', p_3_5: '3–5', p_6_10: '6–10', p_gt10: 'More than 10',
    agr_hint: 'Read the agreement and sign at the bottom.', signer_name: 'Full name of the authorized representative', signer_title: 'Title',
    agr_check: 'I have read and agree to the Legno Dealer Agreement on behalf of the company above.',
    agr_sign: 'Accept and sign', agr_signed: 'Signed by {name} on {date} (version {v}).', agr_new: 'A new version of the agreement is available. Please read and sign again.',
    agr_need: 'Type the full name and check the box to sign.',
    tax_hint: 'Upload your current resale / sales tax exemption certificate (PDF or photo). We read it automatically and Legno confirms it. Without a valid certificate, sales tax is charged on your invoices.',
    tax_upload: 'Upload certificate', tax_uploading: 'Uploading…', tax_reading: 'Reading the certificate…',
    tax_read_ok: 'We read: {type} · {state} · valid until {date}. Waiting for Legno to confirm.',
    tax_read_none: 'Certificate received. Legno will review it.',
    tax_status: 'Tax exemption', ts_none: 'No certificate on file — sales tax is charged', ts_pending: 'Certificate under review',
    ts_valid: 'Valid until {date}', ts_expired: 'Expired on {date} — sales tax is charged. Upload the new certificate.', ts_rejected: 'Certificate not accepted — upload a new one',
    tax_soon: 'Your certificate expires in {n} day(s). Upload the new one to keep your exemption.',
    tax_big: 'File too large (max 20 MB).', tax_type: 'Use a PDF, JPG or PNG file.',
    missing: 'Still missing: {list}', m_agreement: 'sign the agreement', sent: 'Application sent. Legno will review it and get back to you.',
    st_draft: 'Not sent yet', st_pending: 'Under review by Legno', st_active: 'Active dealer', st_suspended: 'Suspended — contact Legno', st_rejected: 'Not approved',
    reject_note: 'Note from Legno: {note}', edit: 'Edit company data', docs: 'Documents', open: 'Open',
    d_agreement: 'Signed agreement', d_tax_exempt: 'Tax exemption certificate', d_w9: 'W-9', d_other: 'Other',
    ds_pending: 'under review', ds_valid: 'valid', ds_rejected: 'not accepted', ds_expired: 'expired', ds_superseded: 'replaced',
    not_ready: 'Online dealer application is not available yet. Please contact sales@legnocabinets.com.',
    only_owner: 'Only the company owner or manager can open the company file.', need_login: 'Sign in first.',
    discount: 'Your factory discount', discount_by: 'set by Legno'
  },
  pt: {
    apply: 'Solicitar online', title: 'Seja um dealer Legno', company_title: 'Ficha da empresa',
    s1: 'Empresa', s2: 'Questionário', s3: 'Contrato', s4: 'Tax exemption',
    back: 'Voltar', next: 'Salvar e continuar', close: 'Fechar', submit: 'Enviar pra Legno', done: 'Concluir', saving: 'Salvando…',
    legal_name: 'Razão social', trade_name: 'Nome fantasia (DBA)', ein: 'EIN (Tax ID)', contact_name: 'Responsável',
    billing_email: 'E-mail de cobrança (invoices)', phone: 'Telefone', website: 'Site',
    billing: 'Endereço de cobrança', shipping: 'Endereço de entrega', shipping_same: 'Igual ao endereço de cobrança',
    line1: 'Endereço', line2: 'Complemento', city: 'Cidade', state: 'Estado', zip: 'ZIP',
    s1_hint: 'É o que sai nas suas invoices. Dá pra alterar depois.',
    q_business_type: 'Tipo de negócio', q_years_in_business: 'Tempo de atuação', q_annual_revenue: 'Faturamento anual',
    q_states_served: 'Estados / regiões atendidos', q_projects_per_month: 'Projetos de marcenaria por mês',
    q_european_brands: 'Já trabalha com marcas europeias?', q_european_brands_which: 'Quais?',
    q_how_heard: 'Como conheceu a Legno?', q_notes: 'Mais alguma coisa que devemos saber?',
    choose: '— escolha —', yes: 'Sim', no: 'Não',
    bt_showroom: 'Showroom / loja de cozinhas e banheiros', bt_contractor: 'Construtora / general contractor', bt_designer: 'Designer de interiores / arquiteto',
    bt_distributor: 'Distribuidor / representante', bt_millwork: 'Marcenaria', bt_other: 'Outro',
    y_lt1: 'Menos de 1 ano', y_1_2: '1–2 anos', y_3_5: '3–5 anos', y_6_10: '6–10 anos', y_gt10: 'Mais de 10 anos',
    r_lt250k: 'Até $250k', r_250k_500k: '$250k – $500k', r_500k_1m: '$500k – $1M', r_1m_3m: '$1M – $3M', r_3m_10m: '$3M – $10M', r_gt10m: 'Acima de $10M',
    p_1_2: '1–2', p_3_5: '3–5', p_6_10: '6–10', p_gt10: 'Mais de 10',
    agr_hint: 'Leia o contrato e assine no final.', signer_name: 'Nome completo do representante autorizado', signer_title: 'Cargo',
    agr_check: 'Li e aceito o Dealer Agreement da Legno em nome da empresa acima.',
    agr_sign: 'Aceitar e assinar', agr_signed: 'Assinado por {name} em {date} (versão {v}).', agr_new: 'Há uma versão nova do contrato. Leia e assine de novo.',
    agr_need: 'Digite o nome completo e marque a caixa pra assinar.',
    tax_hint: 'Envie o certificado de revenda / isenção de sales tax atual (PDF ou foto). A leitura é automática e a Legno confirma. Sem certificado válido, a invoice sai com imposto.',
    tax_upload: 'Enviar certificado', tax_uploading: 'Enviando…', tax_reading: 'Lendo o certificado…',
    tax_read_ok: 'Lemos: {type} · {state} · válido até {date}. Aguardando a Legno confirmar.',
    tax_read_none: 'Certificado recebido. A Legno vai conferir.',
    tax_status: 'Tax exemption', ts_none: 'Sem certificado — a invoice sai com imposto', ts_pending: 'Certificado em conferência',
    ts_valid: 'Válido até {date}', ts_expired: 'Venceu em {date} — a invoice sai com imposto. Envie o certificado novo.', ts_rejected: 'Certificado não aceito — envie outro',
    tax_soon: 'Seu certificado vence em {n} dia(s). Envie o novo pra manter a isenção.',
    tax_big: 'Arquivo grande demais (máx. 20 MB).', tax_type: 'Use um arquivo PDF, JPG ou PNG.',
    missing: 'Ainda falta: {list}', m_agreement: 'assinar o contrato', sent: 'Solicitação enviada. A Legno vai analisar e retornar.',
    st_draft: 'Ainda não enviada', st_pending: 'Em análise pela Legno', st_active: 'Dealer ativo', st_suspended: 'Suspenso — fale com a Legno', st_rejected: 'Não aprovada',
    reject_note: 'Recado da Legno: {note}', edit: 'Editar dados da empresa', docs: 'Documentos', open: 'Abrir',
    d_agreement: 'Contrato assinado', d_tax_exempt: 'Certificado de tax exemption', d_w9: 'W-9', d_other: 'Outro',
    ds_pending: 'em conferência', ds_valid: 'válido', ds_rejected: 'não aceito', ds_expired: 'vencido', ds_superseded: 'substituído',
    not_ready: 'O cadastro online de dealer ainda não está disponível. Fale com sales@legnocabinets.com.',
    only_owner: 'Só o dono ou gerente da empresa abre a ficha.', need_login: 'Entre na sua conta primeiro.',
    discount: 'Seu desconto de fábrica', discount_by: 'definido pela Legno'
  },
  es: {
    apply: 'Solicitar en línea', title: 'Sea dealer de Legno', company_title: 'Ficha de la empresa',
    s1: 'Empresa', s2: 'Cuestionario', s3: 'Contrato', s4: 'Tax exemption',
    back: 'Atrás', next: 'Guardar y continuar', close: 'Cerrar', submit: 'Enviar a Legno', done: 'Listo', saving: 'Guardando…',
    legal_name: 'Razón social', trade_name: 'Nombre comercial (DBA)', ein: 'EIN (Tax ID)', contact_name: 'Persona de contacto',
    billing_email: 'E-mail de facturación', phone: 'Teléfono', website: 'Sitio web',
    billing: 'Dirección de facturación', shipping: 'Dirección de envío', shipping_same: 'Igual a la de facturación',
    line1: 'Dirección', line2: 'Suite / unidad', city: 'Ciudad', state: 'Estado', zip: 'ZIP',
    s1_hint: 'Es lo que aparece en sus facturas. Puede cambiarlo después.',
    q_business_type: 'Tipo de negocio', q_years_in_business: 'Años en el negocio', q_annual_revenue: 'Facturación anual',
    q_states_served: 'Estados / zonas que atiende', q_projects_per_month: 'Proyectos de gabinetes por mes',
    q_european_brands: '¿Ya trabaja con marcas europeas?', q_european_brands_which: '¿Cuáles?',
    q_how_heard: '¿Cómo conoció Legno?', q_notes: '¿Algo más que debamos saber?',
    choose: '— elija —', yes: 'Sí', no: 'No',
    bt_showroom: 'Showroom / tienda de cocinas y baños', bt_contractor: 'Contratista general / constructor', bt_designer: 'Diseñador de interiores / arquitecto',
    bt_distributor: 'Distribuidor / representante', bt_millwork: 'Carpintería', bt_other: 'Otro',
    y_lt1: 'Menos de 1 año', y_1_2: '1–2 años', y_3_5: '3–5 años', y_6_10: '6–10 años', y_gt10: 'Más de 10 años',
    r_lt250k: 'Menos de $250k', r_250k_500k: '$250k – $500k', r_500k_1m: '$500k – $1M', r_1m_3m: '$1M – $3M', r_3m_10m: '$3M – $10M', r_gt10m: 'Más de $10M',
    p_1_2: '1–2', p_3_5: '3–5', p_6_10: '6–10', p_gt10: 'Más de 10',
    agr_hint: 'Lea el contrato y firme al final.', signer_name: 'Nombre completo del representante autorizado', signer_title: 'Cargo',
    agr_check: 'He leído y acepto el Dealer Agreement de Legno en nombre de la empresa.',
    agr_sign: 'Aceptar y firmar', agr_signed: 'Firmado por {name} el {date} (versión {v}).', agr_new: 'Hay una nueva versión del contrato. Léala y firme de nuevo.',
    agr_need: 'Escriba el nombre completo y marque la casilla para firmar.',
    tax_hint: 'Suba su certificado de reventa / exención de sales tax vigente (PDF o foto). Lo leemos automáticamente y Legno lo confirma. Sin certificado válido, la factura lleva impuesto.',
    tax_upload: 'Subir certificado', tax_uploading: 'Subiendo…', tax_reading: 'Leyendo el certificado…',
    tax_read_ok: 'Leímos: {type} · {state} · válido hasta {date}. Esperando la confirmación de Legno.',
    tax_read_none: 'Certificado recibido. Legno lo revisará.',
    tax_status: 'Tax exemption', ts_none: 'Sin certificado — la factura lleva impuesto', ts_pending: 'Certificado en revisión',
    ts_valid: 'Válido hasta {date}', ts_expired: 'Venció el {date} — la factura lleva impuesto. Suba el nuevo certificado.', ts_rejected: 'Certificado no aceptado — suba otro',
    tax_soon: 'Su certificado vence en {n} día(s). Suba el nuevo para mantener la exención.',
    tax_big: 'Archivo demasiado grande (máx. 20 MB).', tax_type: 'Use un archivo PDF, JPG o PNG.',
    missing: 'Aún falta: {list}', m_agreement: 'firmar el contrato', sent: 'Solicitud enviada. Legno la revisará y le responderá.',
    st_draft: 'Aún no enviada', st_pending: 'En revisión por Legno', st_active: 'Dealer activo', st_suspended: 'Suspendido — contacte a Legno', st_rejected: 'No aprobada',
    reject_note: 'Nota de Legno: {note}', edit: 'Editar datos de la empresa', docs: 'Documentos', open: 'Abrir',
    d_agreement: 'Contrato firmado', d_tax_exempt: 'Certificado de tax exemption', d_w9: 'W-9', d_other: 'Otro',
    ds_pending: 'en revisión', ds_valid: 'válido', ds_rejected: 'no aceptado', ds_expired: 'vencido', ds_superseded: 'reemplazado',
    not_ready: 'La solicitud en línea aún no está disponible. Escriba a sales@legnocabinets.com.',
    only_owner: 'Solo el dueño o gerente de la empresa abre la ficha.', need_login: 'Inicie sesión primero.',
    discount: 'Su descuento de fábrica', discount_by: 'definido por Legno'
  }
};
function dappLang() {
  try { const l = (typeof I18n !== 'undefined' && I18n.getLanguage) ? I18n.getLanguage() : 'en'; return DAPP_TXT[l] ? l : 'en'; }
  catch (e) { return 'en'; }
}
function dT(k, vars) {
  let s = (DAPP_TXT[dappLang()][k] != null ? DAPP_TXT[dappLang()][k] : (DAPP_TXT.en[k] != null ? DAPP_TXT.en[k] : k));
  if (vars) Object.keys(vars).forEach((v) => { s = s.split('{' + v + '}').join(vars[v] == null ? '' : vars[v]); });
  return s;
}
function dEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function dDate(d) {
  if (!d) return '—';
  // data pura (YYYY-MM-DD) não pode andar um dia por causa do fuso
  const x = /^\d{4}-\d{2}-\d{2}$/.test(String(d)) ? new Date(d + 'T12:00:00') : new Date(d);
  if (isNaN(x)) return String(d);
  return x.toLocaleDateString(dappLang() === 'pt' ? 'pt-BR' : dappLang() === 'es' ? 'es' : 'en-US', { year: 'numeric', month: 'short', day: '2-digit' });
}
function dDaysLeft(d) {
  if (!d) return null;
  const x = new Date(String(d).slice(0, 10) + 'T23:59:59');
  return Math.ceil((x.getTime() - Date.now()) / 86400000);
}
function dSafeName(s) {
  return String(s || 'file').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'file';
}

const DAPP_Q = {
  business_type: ['showroom', 'contractor', 'designer', 'distributor', 'millwork', 'other'].map((v) => [v, 'bt_' + v]),
  years_in_business: ['lt1', '1_2', '3_5', '6_10', 'gt10'].map((v) => [v, 'y_' + v]),
  annual_revenue: ['lt250k', '250k_500k', '500k_1m', '1m_3m', '3m_10m', 'gt10m'].map((v) => [v, 'r_' + v]),
  projects_per_month: ['1_2', '3_5', '6_10', 'gt10'].map((v) => [v, 'p_' + v])
};

// ---------- dados ----------
async function dappLoad() {
  const { data: accId, error: e1 } = await supabaseClient.rpc('dealer_application_start');
  if (e1) throw e1;
  const { data: card } = await supabaseClient.rpc('my_account_card');
  dappState.role = card && card.role;
  if (!['owner', 'manager'].includes(dappState.role)) { dappState.acc = null; return; }
  const { data: acc, error: e2 } = await supabaseClient.from('accounts').select('*').eq('id', accId).single();
  if (e2) throw e2;
  dappState.acc = acc;
  const { data: docs } = await supabaseClient.from('account_documents')
    .select('id, kind, name, storage_path, status, valid_until, ai_reading, review_note, created_at')
    .eq('account_id', accId).order('created_at', { ascending: false });
  dappState.docs = docs || [];
}
function dappAgreement() { return window.LEGNO_DEALER_AGREEMENT || { version: 'v0', title: 'Dealer Agreement', intro: '', sections: [] }; }
function dappAgreementOk() {
  const a = dappState.acc;
  return !!(a && a.agreement_accepted_at && a.agreement_version === dappAgreement().version);
}
function dappIsApplication() { return !!dappState.acc && ['draft', 'rejected'].includes(dappState.acc.status); }

// ---------- janela ----------
function dappEl() {
  let ov = document.getElementById('po-dapp');
  if (!ov) {
    dappCss();
    ov = document.createElement('div');
    ov.id = 'po-dapp';
    ov.addEventListener('click', dappClick);
    ov.addEventListener('change', dappChange);
    document.body.appendChild(ov);
  }
  return ov;
}
function dappClose() { const ov = document.getElementById('po-dapp'); if (ov) ov.style.display = 'none'; }
async function openDealerApplication(step) {
  const ov = dappEl();
  ov.style.display = 'flex';
  const soFechar = (txt) => dappBox('<p>' + dEsc(txt) + '</p>' + dappFoot('<button type="button" class="secondary" data-a="close">' + dEsc(dT('close')) + '</button>'));
  dappState.acc = null;
  if (typeof currentUser === 'undefined' || !currentUser) { ov.innerHTML = soFechar(dT('need_login')); return; }
  ov.innerHTML = dappBox('<p class="hint">…</p>');
  dappState.msg = ''; dappState.err = ''; dappState.reading = null;
  try {
    await dappLoad();
  } catch (e) {
    console.warn('[dealer] cadastro indisponível:', e);
    ov.innerHTML = soFechar(dT('not_ready'));
    return;
  }
  if (!dappState.acc) { ov.innerHTML = soFechar(dT('only_owner')); return; }
  dappState.step = (typeof step === 'number' && step >= 0 && step <= 4) ? step : (dappIsApplication() ? 1 : 0);
  dappRender();
}
function dappBox(inner) {
  const titulo = dappState.acc && !dappIsApplication() ? dT('company_title') : dT('title');
  return '<div class="dapp-box" role="dialog" aria-modal="true"><div class="dapp-head"><h3>' + dEsc(titulo) + '</h3>'
    + '<button type="button" class="dapp-x" data-a="close" aria-label="' + dEsc(dT('close')) + '">×</button></div>' + inner + '</div>';
}
function dappFoot(html) { return '<div class="dapp-foot">' + html + '</div>'; }
function dappSteps() {
  const s = dappState.step;
  return '<ol class="dapp-steps">' + [1, 2, 3, 4].map((n) =>
    '<li class="' + (n === s ? 'on' : (n < s ? 'ok' : '')) + '" data-a="goto" data-n="' + n + '"><b>' + n + '</b><span>' + dEsc(dT('s' + n)) + '</span></li>').join('') + '</ol>';
}
function dappMsgs() {
  return (dappState.err ? '<p class="error dapp-msg">' + dEsc(dappState.err) + '</p>' : '')
    + (dappState.msg ? '<p class="dapp-msg ok">' + dEsc(dappState.msg) + '</p>' : '');
}
function dappRender() {
  const ov = dappEl();
  const s = dappState.step;
  let body = '';
  if (s === 0) body = dappViewStatus();
  else body = dappSteps() + dappMsgs() + (s === 1 ? dappViewCompany() : s === 2 ? dappViewQuestions() : s === 3 ? dappViewAgreement() : dappViewTax());
  ov.innerHTML = dappBox(body);
}

function dIn(k, label, opts) {
  const a = dappState.acc || {};
  const o = opts || {};
  return '<label class="dapp-f' + (o.wide ? ' wide' : '') + '"><span>' + dEsc(label) + (o.req ? ' *' : '') + '</span>'
    + '<input type="' + (o.type || 'text') + '" data-k="' + k + '" value="' + dEsc(a[k] == null ? '' : a[k]) + '"'
    + (o.ph ? ' placeholder="' + dEsc(o.ph) + '"' : '') + (o.max ? ' maxlength="' + o.max + '"' : '') + ' autocomplete="off"></label>';
}
function dappViewCompany() {
  const a = dappState.acc;
  const addr = (p) => dIn(p + '_line1', dT('line1'), { wide: true, req: p === 'billing' }) + dIn(p + '_line2', dT('line2'))
    + dIn(p + '_city', dT('city'), { req: p === 'billing' }) + dIn(p + '_state', dT('state'), { req: p === 'billing', max: 2, ph: 'FL' })
    + dIn(p + '_zip', dT('zip'), { req: p === 'billing', max: 10 });
  return '<p class="hint">' + dEsc(dT('s1_hint')) + '</p><div class="dapp-grid">'
    + dIn('legal_name', dT('legal_name'), { wide: true, req: true }) + dIn('trade_name', dT('trade_name'))
    + dIn('ein', dT('ein'), { req: true, ph: '12-3456789', max: 12 }) + dIn('contact_name', dT('contact_name'), { req: true })
    + dIn('billing_email', dT('billing_email'), { req: true, type: 'email' }) + dIn('phone', dT('phone'), { req: true, type: 'tel' })
    + dIn('website', dT('website')) + '</div>'
    + '<h4>' + dEsc(dT('billing')) + '</h4><div class="dapp-grid">' + addr('billing') + '</div>'
    + '<h4>' + dEsc(dT('shipping')) + '</h4>'
    + '<label class="dapp-chk"><input type="checkbox" data-k="shipping_same"' + (a.shipping_same !== false ? ' checked' : '') + '> ' + dEsc(dT('shipping_same')) + '</label>'
    + '<div class="dapp-grid" id="dapp-ship"' + (a.shipping_same !== false ? ' style="display:none"' : '') + '>' + addr('shipping') + '</div>'
    + dappFoot('<button type="button" class="secondary" data-a="' + (dappIsApplication() ? 'close' : 'status') + '">' + dEsc(dappIsApplication() ? dT('close') : dT('back')) + '</button><button type="button" data-a="save1">' + dEsc(dT('next')) + '</button>');
}
function dSel(q, label, req) {
  const v = (dappState.acc.questionnaire || {})[q] || '';
  return '<label class="dapp-f"><span>' + dEsc(label) + (req ? ' *' : '') + '</span><select data-q="' + q + '"><option value="">' + dEsc(dT('choose')) + '</option>'
    + DAPP_Q[q].map((o) => '<option value="' + o[0] + '"' + (o[0] === v ? ' selected' : '') + '>' + dEsc(dT(o[1])) + '</option>').join('') + '</select></label>';
}
function dQIn(q, label, wide) {
  const v = (dappState.acc.questionnaire || {})[q] || '';
  return '<label class="dapp-f' + (wide ? ' wide' : '') + '"><span>' + dEsc(label) + '</span><input type="text" data-q="' + q + '" value="' + dEsc(v) + '" autocomplete="off"></label>';
}
function dappViewQuestions() {
  const q = dappState.acc.questionnaire || {};
  const eu = q.european_brands || '';
  return '<div class="dapp-grid">' + dSel('business_type', dT('q_business_type'), true) + dSel('years_in_business', dT('q_years_in_business'), true)
    + dSel('annual_revenue', dT('q_annual_revenue'), true) + dSel('projects_per_month', dT('q_projects_per_month'))
    + dQIn('states_served', dT('q_states_served'), true)
    + '<label class="dapp-f"><span>' + dEsc(dT('q_european_brands')) + ' *</span><select data-q="european_brands"><option value="">' + dEsc(dT('choose')) + '</option>'
    + '<option value="yes"' + (eu === 'yes' ? ' selected' : '') + '>' + dEsc(dT('yes')) + '</option><option value="no"' + (eu === 'no' ? ' selected' : '') + '>' + dEsc(dT('no')) + '</option></select></label>'
    + dQIn('european_brands_which', dT('q_european_brands_which')) + dQIn('how_heard', dT('q_how_heard'), true) + dQIn('notes', dT('q_notes'), true) + '</div>'
    + dappFoot('<button type="button" class="secondary" data-a="goto" data-n="1">' + dEsc(dT('back')) + '</button><button type="button" data-a="save2">' + dEsc(dT('next')) + '</button>');
}
function dappAgreementHtml() {
  const g = dappAgreement();
  return '<h4>' + dEsc(g.title) + '</h4><p>' + dEsc(g.intro) + '</p>'
    + g.sections.map((s) => '<h5>' + dEsc(s.h) + '</h5>' + s.p.map((p) => '<p>' + dEsc(p) + '</p>').join('')).join('');
}
function dappViewAgreement() {
  const a = dappState.acc;
  const ok = dappAgreementOk();
  const antigo = !!a.agreement_accepted_at && !ok;
  let sign;
  if (ok) {
    sign = '<p class="dapp-signed">✓ ' + dEsc(dT('agr_signed', { name: a.agreement_signer_name, date: dDate(a.agreement_accepted_at), v: a.agreement_version })) + '</p>';
  } else {
    sign = (antigo ? '<p class="dapp-warn">' + dEsc(dT('agr_new')) + '</p>' : '')
      + '<div class="dapp-grid"><label class="dapp-f wide"><span>' + dEsc(dT('signer_name')) + ' *</span><input type="text" id="dapp-signer" value="' + dEsc(a.contact_name || '') + '" autocomplete="off"></label>'
      + '<label class="dapp-f"><span>' + dEsc(dT('signer_title')) + '</span><input type="text" id="dapp-signer-title" autocomplete="off"></label></div>'
      + '<label class="dapp-chk"><input type="checkbox" id="dapp-agree"> ' + dEsc(dT('agr_check')) + '</label>';
  }
  return '<p class="hint">' + dEsc(dT('agr_hint')) + '</p><div class="dapp-agr" tabindex="0">' + dappAgreementHtml() + '</div>' + sign
    + dappFoot('<button type="button" class="secondary" data-a="goto" data-n="2">' + dEsc(dT('back')) + '</button>'
      + (ok ? '<button type="button" data-a="goto" data-n="4">' + dEsc(dT('next')) + '</button>'
            : '<button type="button" data-a="sign"' + (dappState.busy ? ' disabled' : '') + '>' + dEsc(dT('agr_sign')) + '</button>'));
}
function dappTaxLine() {
  const a = dappState.acc;
  const st = a.tax_exempt_status || 'none';
  const left = dDaysLeft(a.tax_exempt_valid_until);
  // "valid" com a data vencida já conta como vencido (o banco também olha a data)
  const eff = (st === 'valid' && left != null && left < 0) ? 'expired' : st;
  let html = '<p class="dapp-tax ts-' + eff + '"><b>' + dEsc(dT('tax_status')) + ':</b> ' + dEsc(dT('ts_' + eff, { date: dDate(a.tax_exempt_valid_until) })) + '</p>';
  if (eff === 'valid' && left != null && left <= 30) html += '<p class="dapp-warn">' + dEsc(dT('tax_soon', { n: Math.max(0, left) })) + '</p>';
  return html;
}
function dappTaxUploadHtml() {
  let lido = '';
  if (dappState.reading === 'busy') lido = '<p class="hint">' + dEsc(dT('tax_reading')) + '</p>';
  else if (dappState.reading && dappState.reading.proposed_valid_until) {
    const r = dappState.reading;
    lido = '<p class="dapp-msg ok">' + dEsc(dT('tax_read_ok', { type: r.certificate_type || '—', state: r.state || '—', date: dDate(r.proposed_valid_until) })) + '</p>';
  } else if (dappState.reading) lido = '<p class="dapp-msg ok">' + dEsc(dT('tax_read_none')) + '</p>';
  return '<label class="dapp-up' + (dappState.busy ? ' busy' : '') + '"><input type="file" id="dapp-tax-file" accept="application/pdf,image/jpeg,image/png,image/webp"' + (dappState.busy ? ' disabled' : '') + '>'
    + '<span>' + dEsc(dappState.busy ? dT('tax_uploading') : dT('tax_upload')) + '</span></label>' + lido;
}
function dappViewTax() {
  const app = dappIsApplication();
  return '<p class="hint">' + dEsc(dT('tax_hint')) + '</p>' + dappTaxLine() + dappTaxUploadHtml() + dappDocsHtml(['tax_exempt'])
    + dappFoot('<button type="button" class="secondary" data-a="goto" data-n="3">' + dEsc(dT('back')) + '</button>'
      + '<button type="button" data-a="' + (app ? 'submit' : 'status') + '"' + (dappState.busy ? ' disabled' : '') + '>' + dEsc(app ? dT('submit') : dT('done')) + '</button>');
}
function dappDocsHtml(kinds) {
  const rows = dappState.docs.filter((d) => !kinds || kinds.includes(d.kind));
  if (!rows.length) return '';
  return '<ul class="dapp-docs">' + rows.map((d) =>
    '<li><span class="dd-k">' + dEsc(dT('d_' + d.kind)) + '</span><span class="dd-n">' + dEsc(d.name) + '</span>'
    + '<span class="dd-s s-' + dEsc(d.status) + '">' + dEsc(dT('ds_' + d.status)) + (d.valid_until ? ' · ' + dEsc(dDate(d.valid_until)) : '') + '</span>'
    + '<button type="button" class="secondary" data-a="doc" data-id="' + dEsc(d.id) + '">' + dEsc(dT('open')) + '</button>'
    + (d.review_note ? '<em>' + dEsc(d.review_note) + '</em>' : '') + '</li>').join('') + '</ul>';
}
function dappViewStatus() {
  const a = dappState.acc;
  const nome = a.trade_name || a.legal_name || '';
  return '<div class="dapp-status st-' + dEsc(a.status) + '"><strong>' + dEsc(nome) + '</strong><span>' + dEsc(dT('st_' + a.status)) + '</span></div>'
    + dappMsgs()
    + (a.review_note && ['rejected', 'suspended'].includes(a.status) ? '<p class="dapp-warn">' + dEsc(dT('reject_note', { note: a.review_note })) + '</p>' : '')
    + (a.status === 'active' ? '<p class="dapp-disc"><b>' + dEsc(dT('discount')) + ':</b> ' + dEsc(String(Number(a.factory_discount_pct || 0))) + '% <span class="hint">(' + dEsc(dT('discount_by')) + ')</span></p>' : '')
    + (dappAgreementOk() ? '' : '<p class="dapp-warn">' + dEsc(a.agreement_accepted_at ? dT('agr_new') : dT('missing', { list: dT('m_agreement') }))
        + ' <button type="button" class="secondary" data-a="goto" data-n="3">' + dEsc(dT('s3')) + '</button></p>')
    + dappTaxLine() + dappTaxUploadHtml()
    + '<h4>' + dEsc(dT('docs')) + '</h4>' + (dappDocsHtml() || '<p class="hint">—</p>')
    + dappFoot('<button type="button" class="secondary" data-a="goto" data-n="1">' + dEsc(dT('edit')) + '</button><button type="button" data-a="close">' + dEsc(dT('close')) + '</button>');
}

// ---------- ações ----------
function dappCollect(sel, attr) {
  const out = {};
  document.querySelectorAll('#po-dapp ' + sel).forEach((el) => {
    out[el.getAttribute(attr)] = el.type === 'checkbox' ? el.checked : el.value.trim();
  });
  return out;
}
async function dappSaveAccount(patch) {
  const { data, error } = await supabaseClient.from('accounts').update(patch).eq('id', dappState.acc.id).select('*').single();
  if (error) throw error;
  dappState.acc = data;
}
async function dappRun(fn) {
  if (dappState.busy) return;
  dappState.busy = true; dappState.err = ''; dappState.msg = '';
  try { await fn(); }
  catch (e) { dappState.err = (e && e.message) || String(e); }
  dappState.busy = false;
  dappRender();
}
function dappChange(e) {
  const t = e.target;
  if (t && t.getAttribute('data-k') === 'shipping_same') {
    const box = document.getElementById('dapp-ship');
    if (box) box.style.display = t.checked ? 'none' : '';
  }
  if (t && t.id === 'dapp-tax-file' && t.files && t.files[0]) dappUploadTax(t.files[0]);
}
function dappClick(e) {
  if (e.target.id === 'po-dapp') return; // clicar fora NÃO fecha (formulário longo)
  const b = e.target.closest('[data-a]');
  if (!b) return;
  const a = b.getAttribute('data-a');
  if (a === 'close') return dappClose();
  if (a === 'status') { dappState.step = 0; dappState.msg = ''; dappState.err = ''; return dappRender(); }
  if (a === 'goto') {
    const n = Number(b.getAttribute('data-n'));
    if (b.tagName === 'LI' && n >= dappState.step) return; // pra frente, só pelo botão (que salva)
    dappState.step = n; dappState.msg = ''; dappState.err = '';
    return dappRender();
  }
  if (a === 'save1') return dappRun(async () => {
    const v = dappCollect('[data-k]', 'data-k');
    ['billing_state', 'shipping_state'].forEach((k) => { if (v[k]) v[k] = v[k].toUpperCase().slice(0, 2); });
    Object.keys(v).forEach((k) => { if (v[k] === '') v[k] = null; });
    await dappSaveAccount(v);
    dappState.step = 2;
  });
  if (a === 'save2') return dappRun(async () => {
    const q = Object.assign({}, dappState.acc.questionnaire || {}, dappCollect('[data-q]', 'data-q'));
    await dappSaveAccount({ questionnaire: q });
    dappState.step = 3;
  });
  if (a === 'sign') return dappRun(dappSign);
  if (a === 'submit') return dappRun(dappSubmit);
  if (a === 'doc') return dappOpenDoc(b.getAttribute('data-id'));
}
async function dappSign() {
  const nome = (document.getElementById('dapp-signer') || {}).value || '';
  const cargo = (document.getElementById('dapp-signer-title') || {}).value || '';
  const marcado = (document.getElementById('dapp-agree') || {}).checked;
  if (!nome.trim() || !marcado) throw new Error(dT('agr_need'));
  const g = dappAgreement();
  const { data: quando, error } = await supabaseClient.rpc('dealer_agreement_accept', { p_version: g.version, p_signer_name: nome.trim() });
  if (error) throw error;
  dappState.acc.agreement_version = g.version;
  dappState.acc.agreement_signer_name = nome.trim();
  dappState.acc.agreement_accepted_at = quando || new Date().toISOString();
  // PDF assinado -> documentos da empresa (se falhar, o aceite continua valendo no banco)
  try {
    const blob = dappAgreementPdf(nome.trim(), cargo.trim(), dappState.acc.agreement_accepted_at);
    if (blob) {
      const nomeArq = 'dealer-agreement-' + dSafeName(g.version) + '.pdf';
      const path = dappState.acc.id + '/agreement-' + Date.now() + '-' + nomeArq;
      const up = await supabaseClient.storage.from(DAPP_BUCKET).upload(path, blob, { contentType: 'application/pdf', upsert: false });
      if (!up.error) {
        await supabaseClient.from('account_documents').insert({
          account_id: dappState.acc.id, kind: 'agreement', name: nomeArq, storage_path: path, mime: 'application/pdf', size_bytes: blob.size });
      }
    }
  } catch (e) { console.warn('[dealer] PDF do contrato não foi guardado:', e); }
  await dappLoad();
  dappState.step = 4;
}
function dappAgreementPdf(nome, cargo, quando) {
  const J = window.jspdf && window.jspdf.jsPDF;
  if (!J) return null;
  const g = dappAgreement();
  const a = dappState.acc;
  const doc = new J({ unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 54;
  let y = M;
  const write = (txt, size, bold, gap) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size);
    doc.splitTextToSize(String(txt), W - 2 * M).forEach((ln) => {
      if (y > H - M) { doc.addPage(); y = M; }
      doc.text(ln, M, y); y += size * 1.32;
    });
    y += gap == null ? 6 : gap;
  };
  write(g.title, 16, true, 2);
  write('Version ' + g.version, 9, false, 10);
  write(g.intro, 10, false);
  g.sections.forEach((s) => { write(s.h, 11, true, 2); s.p.forEach((p) => write(p, 10, false)); });
  y += 8;
  write('ELECTRONIC ACCEPTANCE', 11, true, 2);
  [
    'Dealer: ' + (a.legal_name || '') + (a.trade_name && a.trade_name !== a.legal_name ? ' (DBA ' + a.trade_name + ')' : ''),
    'EIN: ' + (a.ein || ''),
    'Address: ' + [a.billing_line1, a.billing_line2, a.billing_city, a.billing_state, a.billing_zip].filter(Boolean).join(', '),
    'Signed by: ' + nome + (cargo ? ', ' + cargo : ''),
    'Account e-mail: ' + ((typeof currentUser !== 'undefined' && currentUser && currentUser.email) || ''),
    'Date and time (UTC): ' + new Date(quando).toISOString(),
    'Agreement version: ' + g.version,
    'The IP address of this acceptance is recorded in the Legno portal.'
  ].forEach((l) => write(l, 10, false, 0));
  return doc.output('blob');
}
async function dappUploadTax(file) {
  if (dappState.busy) return;
  dappState.err = ''; dappState.msg = '';
  if (file.size > DAPP_MAX_BYTES) { dappState.err = dT('tax_big'); return dappRender(); }
  if (!/^(application\/pdf|image\/(jpeg|png|webp))$/.test(file.type || '')) { dappState.err = dT('tax_type'); return dappRender(); }
  dappState.busy = true; dappState.reading = null; dappRender();
  let docId = null;
  try {
    const path = dappState.acc.id + '/tax-' + Date.now() + '-' + dSafeName(file.name);
    const up = await supabaseClient.storage.from(DAPP_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (up.error) throw up.error;
    const { data, error } = await supabaseClient.from('account_documents').insert({
      account_id: dappState.acc.id, kind: 'tax_exempt', name: file.name, storage_path: path, mime: file.type, size_bytes: file.size
    }).select('id').single();
    if (error) throw error;
    docId = data.id;
  } catch (e) {
    dappState.busy = false; dappState.err = (e && e.message) || String(e);
    return dappRender();
  }
  dappState.busy = false; dappState.reading = 'busy';
  try { await dappLoad(); } catch (e) { /* segue com o que tem */ }
  dappRender();
  // leitura da IA: se a função não estiver publicada, o documento fica "em conferência" do mesmo jeito
  let leitura = {};
  try {
    const { data, error } = await supabaseClient.functions.invoke('account-tax-check', { body: { document_id: docId } });
    if (!error && data && data.reading) leitura = data.reading;
  } catch (e) { /* sem IA: a fábrica confere na mão */ }
  dappState.reading = leitura;
  dappRender();
}
async function dappSubmit() {
  const { data, error } = await supabaseClient.rpc('dealer_application_submit');
  if (error) throw error;
  if (!data || !data.ok) {
    const nomes = ((data && data.missing) || []).map((k) => k === 'agreement' ? dT('m_agreement') : dT(k.replace(/^billing_(line1|city|state|zip)$/, '$1')));
    throw new Error(dT('missing', { list: nomes.join(', ') }));
  }
  await dappLoad();
  dappState.step = 0;
  dappState.msg = dT('sent');
}
async function dappOpenDoc(id) {
  const d = dappState.docs.find((x) => x.id === id);
  if (!d) return;
  const w = window.open('', '_blank');
  try {
    const { data, error } = await supabaseClient.storage.from(DAPP_BUCKET).createSignedUrl(d.storage_path, 600);
    if (error) throw error;
    if (w) w.location.href = data.signedUrl; else location.href = data.signedUrl;
  } catch (e) { if (w) w.close(); dappState.err = (e && e.message) || String(e); dappRender(); }
}

// ---------- entrada: botão dentro do "Become a dealer" de hoje ----------
function dappApplyBtnHtml() {
  return '<button type="button" class="dapp-apply" data-dapp-apply="1">' + dEsc(dT('apply')) + ' →</button>';
}
(function dappWrap() {
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-dapp-apply]');
    if (!b) return;
    e.preventDefault();
    const m = document.getElementById('po-become-dealer-modal');
    if (m) m.style.display = 'none';
    openDealerApplication();
  });
  if (typeof window.showBecomeDealerModal === 'function') {
    const orig = window.showBecomeDealerModal;
    window.showBecomeDealerModal = function () {
      orig.apply(this, arguments);
      if (!dappOn()) return;
      const links = document.querySelector('#po-become-dealer-modal .po-become-dealer-links');
      if (links && !document.querySelector('#po-become-dealer-modal [data-dapp-apply]')) links.insertAdjacentHTML('beforebegin', dappApplyBtnHtml());
    };
  }
  if (typeof window.refreshBecomeDealerUi === 'function') {
    const orig2 = window.refreshBecomeDealerUi;
    window.refreshBecomeDealerUi = function () {
      orig2.apply(this, arguments);
      if (!dappOn()) return;
      const el = document.getElementById('po-become-dealer');
      if (el && el.style.display !== 'none' && !el.querySelector('[data-dapp-apply]')) el.insertAdjacentHTML('beforeend', dappApplyBtnHtml());
    };
  }
})();

function dappCss() {
  if (document.getElementById('dapp-css')) return;
  const st = document.createElement('style');
  st.id = 'dapp-css';
  st.textContent = [
    '#po-dapp{position:fixed;inset:0;background:rgba(0,0,0,.5);display:none;align-items:flex-start;justify-content:center;z-index:10001;padding:24px 12px;overflow:auto}',
    '.dapp-box{background:var(--panel,#fff);color:var(--text,#2b2621);border-radius:14px;width:100%;max-width:760px;padding:20px 24px 16px;box-shadow:0 14px 50px rgba(0,0,0,.3)}',
    '.dapp-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}.dapp-head h3{margin:0;font-size:20px}',
    '.dapp-x{background:none;border:0;font-size:26px;line-height:1;cursor:pointer;color:var(--muted,#766f64);margin:0;padding:0 4px}',
    '.dapp-steps{list-style:none;display:flex;gap:6px;padding:0;margin:0 0 14px}.dapp-steps li{flex:1;display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:10px;background:var(--bg,#f7f6f3);font-size:13px;color:var(--muted,#766f64)}',
    '.dapp-steps li b{width:22px;height:22px;border-radius:50%;background:#fff;border:1px solid var(--border,#e0ddd6);display:inline-flex;align-items:center;justify-content:center;font-size:12px;color:var(--text,#2b2621)}',
    '.dapp-steps li.on{background:var(--accent,#8a5a34);color:#fff}.dapp-steps li.on b{color:var(--accent-dark,#6e4527);border-color:#fff}',
    '.dapp-steps li.ok{cursor:pointer;color:var(--text,#2b2621)}.dapp-steps li.ok b{background:#2e7d4f;color:#fff;border-color:#2e7d4f}',
    '.dapp-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 14px}.dapp-f{display:flex;flex-direction:column;gap:4px;font-size:13px}.dapp-f.wide{grid-column:1/-1}',
    '.dapp-f span{color:var(--muted,#766f64)}.dapp-f input,.dapp-f select{padding:9px 10px;border:1px solid var(--border,#e0ddd6);border-radius:8px;font-size:14px;background:#fff;color:inherit;width:100%}',
    '.dapp-box h4{margin:16px 0 8px;font-size:15px}.dapp-box h5{margin:12px 0 4px;font-size:13px}',
    '.dapp-chk{display:flex;gap:8px;align-items:flex-start;font-size:14px;margin:10px 0}.dapp-chk input{margin-top:3px}',
    '.dapp-agr{max-height:320px;overflow:auto;border:1px solid var(--border,#e0ddd6);border-radius:10px;padding:12px 16px;background:var(--bg,#f7f6f3);font-size:13px;line-height:1.5;margin-bottom:12px}.dapp-agr h4{margin-top:0}.dapp-agr p{margin:0 0 8px}',
    '.dapp-foot{display:flex;justify-content:flex-end;gap:10px;margin-top:18px;padding-top:12px;border-top:1px solid var(--border,#e0ddd6)}.dapp-foot button{margin-top:0}',
    '.dapp-msg{margin:6px 0 10px;font-size:14px}.dapp-msg.ok{color:#2e7d4f}.dapp-warn{background:#fdf3d7;border:1px solid #ecd58b;border-radius:8px;padding:8px 12px;font-size:13px;margin:8px 0}.dapp-warn button{margin:0 0 0 8px;padding:3px 10px}',
    '.dapp-signed{color:#2e7d4f;font-weight:600}',
    '.dapp-tax{padding:8px 12px;border-radius:8px;background:var(--bg,#f7f6f3);font-size:14px;margin:8px 0}.dapp-tax.ts-valid{background:#e6f4ea}.dapp-tax.ts-expired,.dapp-tax.ts-rejected{background:#fbe9e6}.dapp-tax.ts-pending{background:#fdf3d7}',
    '.dapp-up{display:inline-flex;align-items:center;cursor:pointer;border:1px dashed var(--accent,#8a5a34);color:var(--accent-dark,#6e4527);border-radius:10px;padding:10px 18px;font-weight:600;font-size:14px;margin:6px 0}.dapp-up input{display:none}.dapp-up.busy{opacity:.6;cursor:progress}',
    '.dapp-docs{list-style:none;padding:0;margin:10px 0 0}.dapp-docs li{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;padding:8px 0;border-top:1px solid var(--border,#e0ddd6);font-size:13px}',
    '.dapp-docs .dd-k{font-weight:600;min-width:150px}.dapp-docs .dd-n{flex:1;min-width:120px;color:var(--muted,#766f64);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dapp-docs button{margin:0;padding:3px 12px}.dapp-docs em{flex-basis:100%;color:var(--danger,#b3432f);font-style:normal}',
    '.dd-s{border-radius:20px;padding:2px 10px;background:var(--bg,#f7f6f3)}.dd-s.s-valid{background:#e6f4ea;color:#1e6b3c}.dd-s.s-rejected,.dd-s.s-expired{background:#fbe9e6;color:#9a2f1f}.dd-s.s-pending{background:#fdf3d7;color:#7a5b00}',
    '.dapp-status{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 16px;border-radius:10px;background:var(--bg,#f7f6f3);margin-bottom:10px}.dapp-status strong{font-size:16px}',
    '.dapp-status span{border-radius:20px;padding:3px 12px;font-size:13px;background:#fdf3d7;color:#7a5b00}.dapp-status.st-active span{background:#e6f4ea;color:#1e6b3c}.dapp-status.st-rejected span,.dapp-status.st-suspended span{background:#fbe9e6;color:#9a2f1f}',
    '.dapp-disc{font-size:14px;margin:8px 0}',
    '.dapp-apply{display:block;width:100%;margin:10px 0;padding:10px 16px;font-weight:600}#po-become-dealer .dapp-apply{display:inline-block;width:auto;margin:0 0 0 10px;padding:3px 12px;font-size:12px}',
    '@media (max-width:640px){.dapp-grid{grid-template-columns:1fr}.dapp-steps li span{display:none}.dapp-box{padding:16px}}'
  ].join('\n');
  document.head.appendChild(st);
}

window.LegnoDealerApp = { abrir: openDealerApplication, ligado: dappOn };
