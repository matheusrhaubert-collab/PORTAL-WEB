// ============================================================
// POLÍTICA DE PRIVACIDADE E COMPARTILHAMENTO DE DADOS — texto + aceite por
// usuário (23/11/2026, migration 337)
// ============================================================
// Matt: "quando a pessoa faz o cadastro, ou adicionando em people ou direto no
// portal, deve colocar um aviso dizendo que os arquivos serão compartilhados e
// os dados imputados nos projetos serão compartilhados com a fábrica... colocar
// um termo pra aceite e guardar esse aceite no cadastro de cada usuário" +
// "política de privacidade".
//
// RASCUNHO redigido pela IA. NÃO é conselho jurídico: passar por advogado antes
// de depender dele. MUDOU O TEXTO? TROQUE `version` — todo mundo aceita de novo.
//
// COMO FUNCIONA
//   - Todo login que NÃO é administrador e ainda não aceitou a versão atual vê
//     a janela (não fecha por fora; as saídas são "Concordo" ou "Sair"). Vale
//     pra quem se cadastrou no site, pra quem foi criado em People e pra quem
//     já tinha conta antes desta data.
//   - Na tela "Criar conta" entra uma caixinha obrigatória com link pro texto;
//     quem marcou ali tem o aceite gravado no primeiro login, sem ver a janela
//     de novo.
//   - O aceite fica em user_terms_acceptances (RPC user_accept_data_terms):
//     usuário, e-mail, nome digitado, versão, idioma, TEXTO INTEIRO, SHA-256,
//     IP, navegador, data/hora do servidor. Não dá pra alterar nem apagar.
//     Aparece na ficha da pessoa em My company › People.
//   - Sem a migration 337 (RPC não existe) NADA é bloqueado: o portal segue
//     como antes.
// Não edita nenhuma função existente.

window.LEGNO_DATA_TERMS = {
  version: '2026-11-23',
  title: {
    pt: 'Política de Privacidade e Compartilhamento de Dados',
    en: 'Privacy Policy and Data Sharing Terms',
    es: 'Política de Privacidad y Uso Compartido de Datos'
  },
  intro: {
    pt: 'Este portal é operado pela Legno Cabinets LLC ("fábrica"). Para usar o portal você precisa ler e aceitar os pontos abaixo.',
    en: 'This portal is operated by Legno Cabinets LLC (the "factory"). To use the portal you must read and accept the points below.',
    es: 'Este portal es operado por Legno Cabinets LLC (la "fábrica"). Para usar el portal debe leer y aceptar los puntos siguientes.'
  },
  clauses: {
    pt: [
      ['O que guardamos. ', 'Seus dados de cadastro (nome, e-mail, telefone, empresa, endereço, documentos fiscais que você enviar), tudo o que você cria ou digita no portal (projetos, medidas, desenhos, nomes de pasta, nomes e endereços de clientes, observações, pedidos, propostas) e todos os arquivos que você envia (fotos, PDFs, plantas, imagens de referência, comprovantes). Também registramos dados de uso: data e hora de acesso, endereço IP e navegador.'],
      ['Compartilhamento com a fábrica. ', 'Tudo o que está no item 1 é COMPARTILHADO COM A FÁBRICA. A equipe da fábrica pode ver, abrir, copiar e usar seus projetos, arquivos e dados para orçar, produzir, entregar, dar suporte, cobrar, conferir pedidos e melhorar o portal e os produtos.'],
      ['Quem mais enxerga. ', 'Se você faz parte de uma loja (dealer), o responsável pela loja e quem está acima dela na estrutura de distribuição também enxergam seus projetos, pedidos e valores de venda. Quem recebe um link de compartilhamento ou de visualização 3D gerado por você enxerga aquele projeto sem precisar de login.'],
      ['Prestadores de serviço. ', 'Os dados ficam em servidores de nuvem de terceiros. Recursos de inteligência artificial (leitura de foto e de PDF, imagens realistas, assistente) enviam as imagens, arquivos e textos daquele projeto a provedores de IA para serem processados. Dados de cobrança podem ser enviados ao sistema de faturamento e pagamento da fábrica. A fábrica não vende seus dados.'],
      ['Dados dos seus clientes. ', 'Ao colocar no portal nome, endereço, fotos ou arquivos de um cliente seu, você declara que tem autorização dele para isso e para o compartilhamento descrito aqui. A responsabilidade perante o seu cliente é sua.'],
      ['Guarda dos dados. ', 'Projetos, pedidos, arquivos e registros de aceite são mantidos enquanto a conta existir e pelo tempo necessário para obrigações fiscais, garantia e defesa em disputas. Pedidos enviados à fábrica e seus documentos não são apagados a pedido.'],
      ['Seus pedidos sobre os dados. ', 'Para corrigir seus dados, pedir uma cópia ou encerrar a conta, escreva para sales@legnocabinets.com. Atenderemos dentro do que a lei e as obrigações do item 6 permitem.'],
      ['Mudanças. ', 'Se este texto mudar, o portal pedirá um novo aceite. Continuar usando o portal depende de aceitar a versão em vigor.'],
      ['Aceite. ', 'Ao marcar "Li e concordo" você declara que leu este texto, que concorda com o compartilhamento dos seus dados, projetos e arquivos com a fábrica e que tem poderes para aceitar em nome da sua empresa, se for o caso. O aceite fica registrado com data, hora, versão do texto, IP e navegador.']
    ],
    en: [
      ['What we keep. ', 'Your registration data (name, e-mail, phone, company, address, tax documents you upload), everything you create or type in the portal (projects, measurements, drawings, folder names, client names and addresses, notes, orders, proposals) and every file you upload (photos, PDFs, floor plans, reference images, payment receipts). We also record usage data: date and time of access, IP address and browser.'],
      ['Sharing with the factory. ', 'Everything in item 1 is SHARED WITH THE FACTORY. Factory staff can view, open, copy and use your projects, files and data to quote, manufacture, deliver, support, bill, check orders and improve the portal and the products.'],
      ['Who else can see it. ', 'If you belong to a store (dealer), the person responsible for that store and those above it in the distribution structure can also see your projects, orders and sale prices. Anyone who receives a share link or 3D view link generated by you can see that project without logging in.'],
      ['Service providers. ', 'Data is stored on third-party cloud servers. Artificial-intelligence features (photo and PDF reading, realistic images, assistant) send the images, files and text of that project to AI providers for processing. Billing data may be sent to the factory\'s invoicing and payment system. The factory does not sell your data.'],
      ['Your clients\' data. ', 'By entering a client\'s name, address, photos or files in the portal, you state that you have their authorization to do so and for the sharing described here. Responsibility toward your client is yours.'],
      ['Retention. ', 'Projects, orders, files and acceptance records are kept while the account exists and for as long as needed for tax obligations, warranty and defense in disputes. Orders sent to the factory and their documents are not deleted on request.'],
      ['Your requests. ', 'To correct your data, request a copy or close your account, write to sales@legnocabinets.com. We will respond within what the law and the obligations in item 6 allow.'],
      ['Changes. ', 'If this text changes, the portal will ask for a new acceptance. Continued use of the portal depends on accepting the version in force.'],
      ['Acceptance. ', 'By checking "I have read and agree" you state that you have read this text, that you agree to the sharing of your data, projects and files with the factory, and that you have authority to accept on behalf of your company, if applicable. The acceptance is recorded with date, time, text version, IP and browser.']
    ],
    es: [
      ['Qué guardamos. ', 'Sus datos de registro (nombre, correo, teléfono, empresa, dirección, documentos fiscales que envíe), todo lo que crea o escribe en el portal (proyectos, medidas, dibujos, nombres de carpeta, nombres y direcciones de clientes, notas, pedidos, propuestas) y todos los archivos que envía (fotos, PDF, planos, imágenes de referencia, comprobantes). También registramos datos de uso: fecha y hora de acceso, dirección IP y navegador.'],
      ['Uso compartido con la fábrica. ', 'Todo lo del punto 1 se COMPARTE CON LA FÁBRICA. El equipo de la fábrica puede ver, abrir, copiar y usar sus proyectos, archivos y datos para cotizar, producir, entregar, dar soporte, cobrar, revisar pedidos y mejorar el portal y los productos.'],
      ['Quién más lo ve. ', 'Si usted pertenece a una tienda (dealer), el responsable de la tienda y quienes están por encima en la estructura de distribución también ven sus proyectos, pedidos y precios de venta. Quien recibe un enlace para compartir o de vista 3D generado por usted ve ese proyecto sin iniciar sesión.'],
      ['Proveedores de servicio. ', 'Los datos se guardan en servidores en la nube de terceros. Las funciones de inteligencia artificial (lectura de foto y de PDF, imágenes realistas, asistente) envían las imágenes, archivos y textos de ese proyecto a proveedores de IA para procesarlos. Los datos de cobro pueden enviarse al sistema de facturación y pago de la fábrica. La fábrica no vende sus datos.'],
      ['Datos de sus clientes. ', 'Al poner en el portal el nombre, la dirección, fotos o archivos de un cliente suyo, usted declara que tiene su autorización para ello y para el uso compartido descrito aquí. La responsabilidad ante su cliente es suya.'],
      ['Conservación. ', 'Proyectos, pedidos, archivos y registros de aceptación se conservan mientras exista la cuenta y el tiempo necesario para obligaciones fiscales, garantía y defensa en disputas. Los pedidos enviados a la fábrica y sus documentos no se eliminan a pedido.'],
      ['Sus solicitudes. ', 'Para corregir sus datos, pedir una copia o cerrar la cuenta, escriba a sales@legnocabinets.com. Responderemos dentro de lo que la ley y las obligaciones del punto 6 permitan.'],
      ['Cambios. ', 'Si este texto cambia, el portal pedirá una nueva aceptación. Seguir usando el portal depende de aceptar la versión vigente.'],
      ['Aceptación. ', 'Al marcar "He leído y acepto" usted declara que leyó este texto, que acepta compartir sus datos, proyectos y archivos con la fábrica y que tiene facultades para aceptar en nombre de su empresa, si corresponde. La aceptación queda registrada con fecha, hora, versión del texto, IP y navegador.']
    ]
  },
  ui: {
    pt: { ver: 'Versão', name: 'Seu nome completo', chk: 'Li e concordo com a Política de Privacidade e com o compartilhamento dos meus dados, projetos e arquivos com a fábrica.', ok: 'Concordo', out: 'Sair', close: 'Fechar', need: 'Digite seu nome completo e marque a caixinha.', err: 'Não foi possível registrar o aceite. Tente de novo.', signup: 'Li e concordo com a ', link: 'Política de Privacidade e Compartilhamento de Dados', signup2: ' — meus dados, projetos e arquivos são compartilhados com a fábrica.', foot: 'Privacidade e dados', st_ok: 'Aceito em {d} · versão {v} · {n}', st_old: 'Aceitou a versão {v} em {d} — falta a versão atual', st_no: 'Ainda não aceitou', st_lbl: 'Política de privacidade', st_need: 'rodar a migration 337' },
    en: { ver: 'Version', name: 'Your full name', chk: 'I have read and agree to the Privacy Policy and to the sharing of my data, projects and files with the factory.', ok: 'I agree', out: 'Sign out', close: 'Close', need: 'Type your full name and check the box.', err: 'Could not record the acceptance. Please try again.', signup: 'I have read and agree to the ', link: 'Privacy Policy and Data Sharing Terms', signup2: ' — my data, projects and files are shared with the factory.', foot: 'Privacy and data', st_ok: 'Accepted on {d} · version {v} · {n}', st_old: 'Accepted version {v} on {d} — current version pending', st_no: 'Not accepted yet', st_lbl: 'Privacy policy', st_need: 'run migration 337' },
    es: { ver: 'Versión', name: 'Su nombre completo', chk: 'He leído y acepto la Política de Privacidad y el uso compartido de mis datos, proyectos y archivos con la fábrica.', ok: 'Acepto', out: 'Salir', close: 'Cerrar', need: 'Escriba su nombre completo y marque la casilla.', err: 'No se pudo registrar la aceptación. Inténtelo de nuevo.', signup: 'He leído y acepto la ', link: 'Política de Privacidad y Uso Compartido de Datos', signup2: ' — mis datos, proyectos y archivos se comparten con la fábrica.', foot: 'Privacidad y datos', st_ok: 'Aceptado el {d} · versión {v} · {n}', st_old: 'Aceptó la versión {v} el {d} — falta la versión actual', st_no: 'Aún no aceptó', st_lbl: 'Política de privacidad', st_need: 'ejecutar la migration 337' }
  }
};

(function () {
  const D = window.LEGNO_DATA_TERMS;
  const PRE = 'legno_dt_pre';
  function lang() { let l = 'en'; try { if (typeof I18n !== 'undefined' && I18n.getLanguage) l = String(I18n.getLanguage()).slice(0, 2); } catch (e) { /* en */ } return D.clauses[l] ? l : 'en'; }
  function U(k) { const l = lang(); return (D.ui[l] && D.ui[l][k] != null) ? D.ui[l][k] : D.ui.en[k]; }
  function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function textoPuro(l) { return D.title[l] + '\n' + U('ver') + ' ' + D.version + '\n\n' + D.intro[l] + '\n\n' + D.clauses[l].map((c, i) => (i + 1) + '. ' + c[0] + c[1]).join('\n\n'); }
  function corpoHtml(l) { return '<p>' + esc(D.intro[l]) + '</p>' + D.clauses[l].map((c, i) => '<p><b>' + (i + 1) + '. ' + esc(c[0]) + '</b>' + esc(c[1]) + '</p>').join(''); }
  function css() {
    if (document.getElementById('dt-css')) return;
    const st = document.createElement('style'); st.id = 'dt-css';
    st.textContent = [
      '#dt-ov{position:fixed;inset:0;z-index:4000;background:rgba(20,17,13,.62);display:flex;align-items:center;justify-content:center;padding:16px}',
      '.dt-box{background:#fff;color:#2a251e;border-radius:14px;max-width:720px;width:100%;max-height:92vh;display:flex;flex-direction:column;padding:20px 22px;box-shadow:0 18px 60px rgba(0,0,0,.3)}',
      '.dt-box h3{margin:0 0 2px;font-size:19px}.dt-sub{margin:0 0 10px;font-size:12px;color:#766f64}',
      '.dt-txt{flex:1;min-height:120px;overflow:auto;border:1px solid #e0ddd6;border-radius:10px;padding:10px 14px;font-size:13.5px;line-height:1.5;background:#faf8f4}.dt-txt p{margin:0 0 10px}',
      '.dt-f{display:block;margin:12px 0 0;font-size:12.5px;color:#5a5348}.dt-f input{display:block;width:100%;margin-top:4px;padding:8px 10px;border:1px solid #cfc7ba;border-radius:8px;font-size:14px;box-sizing:border-box}',
      '.dt-chk{display:flex;gap:9px;align-items:flex-start;margin:12px 0 0;font-size:13.5px;line-height:1.4;cursor:pointer}.dt-chk input{width:auto !important;flex:none;margin:3px 0 0}',
      '.dt-err{color:#9a2b1e;font-size:12.5px;min-height:16px;margin:6px 0 0}',
      '.dt-acts{display:flex;justify-content:flex-end;gap:8px;margin-top:8px}.dt-acts button{border-radius:8px;padding:9px 16px;font-size:14px;font-weight:600;cursor:pointer}',
      '.dt-acts .dt-sec{background:#fff;color:#3a332a;border:1px solid #cfc7ba}.dt-acts .dt-go{background:#2f6f4f;color:#fff;border:1px solid #2f6f4f}.dt-acts .dt-go:disabled{opacity:.45;cursor:default}',
      '.dt-signup{display:flex;gap:8px;align-items:flex-start;margin:12px 0;font-size:12.5px;line-height:1.4;text-align:left}.dt-signup input{width:auto !important;flex:none;margin:3px 0 0}.dt-signup a{text-decoration:underline;cursor:pointer}',
      '.dt-foot{font-size:12px;text-decoration:underline;cursor:pointer;color:inherit;opacity:.8}'
    ].join('\n');
    document.head.appendChild(st);
  }
  // Só leitura (link do cadastro e do rodapé).
  function show() {
    css();
    const l = lang();
    const velho = document.getElementById('dt-ov'); if (velho) velho.remove();
    const ov = document.createElement('div'); ov.id = 'dt-ov';
    ov.innerHTML = '<div class="dt-box" role="dialog" aria-modal="true"><h3>' + esc(D.title[l]) + '</h3><p class="dt-sub">' + esc(U('ver')) + ' ' + esc(D.version) + '</p>'
      + '<div class="dt-txt">' + corpoHtml(l) + '</div><div class="dt-acts"><button type="button" class="dt-sec" id="dt-close">' + esc(U('close')) + '</button></div></div>';
    document.body.appendChild(ov);
    ov.querySelector('#dt-close').addEventListener('click', () => ov.remove());
  }
  async function grava(name, source) {
    const l = lang();
    const r = await supabaseClient.rpc('user_accept_data_terms', { p_version: D.version, p_lang: l, p_text: textoPuro(l), p_name: name, p_source: source });
    if (r.error) throw r.error;
    return r.data;
  }
  // Janela obrigatória (sem fechar por fora): Concordo ou Sair.
  function pede(nomePadrao) {
    css();
    const l = lang();
    const velho = document.getElementById('dt-ov'); if (velho) velho.remove();
    const ov = document.createElement('div'); ov.id = 'dt-ov';
    ov.innerHTML = '<div class="dt-box" role="dialog" aria-modal="true"><h3>' + esc(D.title[l]) + '</h3><p class="dt-sub">' + esc(U('ver')) + ' ' + esc(D.version) + '</p>'
      + '<div class="dt-txt">' + corpoHtml(l) + '</div>'
      + '<label class="dt-f">' + esc(U('name')) + '<input type="text" id="dt-name" autocomplete="name" maxlength="120" value="' + esc(nomePadrao || '') + '"></label>'
      + '<label class="dt-chk"><input type="checkbox" id="dt-chk"><span>' + esc(U('chk')) + '</span></label>'
      + '<p class="dt-err" id="dt-err"></p>'
      + '<div class="dt-acts"><button type="button" class="dt-sec" id="dt-out">' + esc(U('out')) + '</button><button type="button" class="dt-go" id="dt-ok" disabled>' + esc(U('ok')) + '</button></div></div>';
    document.body.appendChild(ov);
    const $ = (q) => ov.querySelector(q);
    const pronto = () => { $('#dt-ok').disabled = !($('#dt-chk').checked && $('#dt-name').value.trim().length >= 3); };
    ['input', 'change'].forEach((ev) => { $('#dt-name').addEventListener(ev, pronto); $('#dt-chk').addEventListener(ev, pronto); });
    $('#dt-out').addEventListener('click', async () => {
      try { await supabaseClient.auth.signOut(); } catch (e) { /* sai de qualquer jeito */ }
      window.location.reload();
    });
    $('#dt-ok').addEventListener('click', async () => {
      const name = $('#dt-name').value.trim();
      if (!$('#dt-chk').checked || name.length < 3) { $('#dt-err').textContent = U('need'); return; }
      $('#dt-ok').disabled = true;
      try { await grava(name, 'login'); ov.remove(); }
      catch (e) { $('#dt-err').textContent = U('err') + ' ' + ((e && e.message) || ''); $('#dt-ok').disabled = false; }
    });
  }
  // Confere o login atual: admin e quem já aceitou a versão passam direto.
  let visto = null, ocupado = false;
  async function confere() {
    if (ocupado || typeof currentUser === 'undefined' || !currentUser || typeof supabaseClient === 'undefined') { if (typeof currentUser === 'undefined' || !currentUser) visto = null; return; }
    if (visto === currentUser.id) return;
    ocupado = true;
    try {
      const r = await supabaseClient.rpc('data_terms_status');
      if (r.error) { visto = currentUser.id; return; }           // sem a migration 337: não bloqueia ninguém
      const s = r.data || {};
      if (s.is_admin || s.version === D.version) { visto = currentUser.id; return; }
      const meta = (currentUser.user_metadata || {});
      let pre = null;
      try { pre = JSON.parse(localStorage.getItem(PRE) || 'null'); } catch (e) { pre = null; }
      if (pre && pre.v === D.version && pre.email && String(pre.email).toLowerCase() === String(currentUser.email || '').toLowerCase()) {
        // marcou a caixinha na tela "Criar conta": grava sem mostrar a janela de novo
        try { await grava(pre.name || meta.name || currentUser.email, 'signup'); localStorage.removeItem(PRE); visto = currentUser.id; return; } catch (e) { /* cai na janela */ }
      }
      visto = currentUser.id;
      pede(meta.name || '');
    } catch (e) { /* tenta de novo no próximo ciclo */ } finally { ocupado = false; }
  }
  // Caixinha obrigatória na tela "Criar conta" + link no rodapé.
  function montaCadastro() {
    css();
    const form = document.getElementById('po-signup-form');
    if (form && !form.querySelector('.dt-signup')) {
      const btn = form.querySelector('button[type="submit"]');
      const lab = document.createElement('label'); lab.className = 'dt-signup';
      lab.innerHTML = '<input type="checkbox" id="dt-signup-chk" required><span>' + esc(U('signup')) + '<a id="dt-signup-link">' + esc(U('link')) + '</a>' + esc(U('signup2')) + '</span>';
      if (btn) form.insertBefore(lab, btn); else form.appendChild(lab);
      lab.querySelector('#dt-signup-link').addEventListener('click', (e) => { e.preventDefault(); show(); });
      // captura: roda antes do envio do cadastro (o `required` já barra sem a caixinha)
      form.addEventListener('submit', () => {
        try {
          const chk = document.getElementById('dt-signup-chk');
          if (chk && chk.checked) localStorage.setItem(PRE, JSON.stringify({ v: D.version, email: (document.getElementById('po-signup-email') || {}).value || '', name: (document.getElementById('po-signup-name') || {}).value || '' }));
        } catch (e) { /* sem localStorage: a janela aparece no primeiro login */ }
      }, true);
    }
    const foot = document.querySelector('footer.po-support-footer');
    if (foot && !foot.querySelector('.dt-foot')) {
      const d = document.createElement('div');
      d.innerHTML = '<a class="dt-foot">' + esc(U('foot')) + '</a>';
      foot.appendChild(d);
      d.querySelector('a').addEventListener('click', (e) => { e.preventDefault(); show(); });
    }
  }
  // Situação de UM usuário, pra ficha em People (admin lê a tabela direto).
  async function statusDe(userId) {
    try {
      const r = await supabaseClient.from('user_terms_acceptances').select('terms_version, signed_name, accepted_at').eq('user_id', userId).order('accepted_at', { ascending: false }).limit(1);
      if (r.error) return { texto: U('st_need'), ok: false, falta337: true };
      const x = (r.data || [])[0];
      if (!x) return { texto: U('st_no'), ok: false };
      const d = new Date(x.accepted_at).toLocaleString();
      const f = (k) => U(k).replace('{d}', d).replace('{v}', x.terms_version).replace('{n}', x.signed_name || '');
      return x.terms_version === D.version ? { texto: f('st_ok'), ok: true } : { texto: f('st_old'), ok: false };
    } catch (e) { return { texto: U('st_need'), ok: false, falta337: true }; }
  }
  window.LegnoDataTerms = { version: D.version, show, check: () => { visto = null; return confere(); }, statusDe, label: () => U('st_lbl') };
  const liga = () => { try { montaCadastro(); } catch (e) { /* tela ainda não montada */ } confere(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', liga); else liga();
  setInterval(() => { try { montaCadastro(); } catch (e) { /* ok */ } confere(); }, 3000);
})();
