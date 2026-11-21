// ============================================================
// BLOQUEIO POR 30 DIAS SEM ENTRAR (20/11/2026, migration 312)
// ============================================================
// Matt, 20/11: "quero uma regra, um mês sem logar tem bloqueio de tela, pede
// pra contatar a fábrica pra liberar acesso. mandar aviso pro administrador
// que o dealer está sem logar há mais de 30 dias e está bloqueado, e outro
// aviso se o dealer tentar logar novamente."
//
// A regra mora no BANCO (migration 312): o carimbo de acesso de quem ficou
// mais de 30 dias fora marca o bloqueio e grava o aviso; a RPC access_check()
// devolve {blocked} e grava o aviso "tentou entrar". Vale pra dealer,
// vendedor e contractor. A fábrica vê e libera em ERP › Dealers.
//
// Este arquivo só (1) chama access_check() uma vez por entrada e (2) mostra a
// tela de bloqueio — SE ACESSO_BLOQUEIO_LIGADO for true (LIGADO em 20/11, Matt: "pode deixar ligado sim já"). Com false
// ninguém é barrado: o banco só registra e avisa a fábrica.
//
// Sem a migration 312 a RPC não existe e nada acontece.
// Carregado por último (depois do portal-44).

const ACESSO_BLOQUEIO_LIGADO = true;
const acessoState = { checado: null };

const ACESSO_TXT = {
  en: { t: 'Your access is paused', p: 'This account has not been used for more than 30 days, so access was paused for security. Contact Legno to reactivate it — it only takes a moment.', out: 'Sign out', wa: 'WhatsApp' },
  pt: { t: 'Seu acesso está pausado', p: 'Esta conta ficou mais de 30 dias sem uso e o acesso foi pausado por segurança. Fale com a Legno pra reativar — é rápido.', out: 'Sair', wa: 'WhatsApp' },
  es: { t: 'Su acceso está en pausa', p: 'Esta cuenta estuvo más de 30 días sin uso y el acceso se pausó por seguridad. Contacte a Legno para reactivarla — es rápido.', out: 'Cerrar sesión', wa: 'WhatsApp' }
};
function acessoT(k) {
  let l = 'en';
  try { l = (typeof I18n !== 'undefined' && I18n.getLanguage) ? I18n.getLanguage() : 'en'; } catch (e) { /* en */ }
  return (ACESSO_TXT[l] || ACESSO_TXT.en)[k];
}
function acessoTela() {
  if (document.getElementById('po-acesso-bloq')) return;
  const c = (typeof BECOME_DEALER_CONTACT !== 'undefined') ? BECOME_DEALER_CONTACT
    : { email: 'sales@legnocabinets.com', phone: '+1 (352) 988-8801', tel: '+13529888801', whatsapp: 'https://wa.me/13529888801' };
  const ov = document.createElement('div');
  ov.id = 'po-acesso-bloq';
  ov.setAttribute('role', 'alertdialog');
  ov.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(20,16,12,.92);display:flex;align-items:center;justify-content:center;padding:20px';
  ov.innerHTML = '<div style="background:#fff;color:#2b2621;border-radius:16px;max-width:460px;width:100%;padding:28px 30px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.4)">'
    + '<div style="font-size:34px;line-height:1;margin-bottom:10px">🔒</div><h2 style="margin:0 0 10px;font-size:22px">' + acessoT('t') + '</h2>'
    + '<p style="margin:0 0 18px;font-size:15px;line-height:1.5;color:#5c554b">' + acessoT('p') + '</p>'
    + '<div style="display:flex;flex-direction:column;gap:8px;font-size:15px;margin-bottom:20px">'
    + '<a href="mailto:' + c.email + '" style="color:#6e4527">✉ ' + c.email + '</a>'
    + '<a href="' + c.whatsapp + '" target="_blank" rel="noopener" style="color:#6e4527">🟢 ' + acessoT('wa') + '</a>'
    + '<a href="tel:' + c.tel + '" style="color:#6e4527">📞 ' + c.phone + '</a></div>'
    + '<button type="button" id="po-acesso-sair" class="secondary" style="margin:0">' + acessoT('out') + '</button></div>';
  document.body.appendChild(ov);
  document.body.style.overflow = 'hidden';
  document.getElementById('po-acesso-sair').addEventListener('click', async () => {
    try { await supabaseClient.auth.signOut(); } catch (e) { /* sai de qualquer jeito */ }
    location.reload();
  });
}
async function acessoChecar() {
  const uid = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.id : null;
  if (!uid) { acessoState.checado = null; const ov = document.getElementById('po-acesso-bloq'); if (ov) { ov.remove(); document.body.style.overflow = ''; } return; }
  if (acessoState.checado === uid) return;         // uma vez por entrada
  acessoState.checado = uid;
  try {
    const { data, error } = await supabaseClient.rpc('access_check');
    if (error || !data || data.blocked !== true) return;
    if (ACESSO_BLOQUEIO_LIGADO) acessoTela();
    else console.info('[acesso] esta conta está marcada como bloqueada por inatividade (tela de bloqueio desligada: ACESSO_BLOQUEIO_LIGADO = false).');
  } catch (e) { /* sem a migration 312: nada */ }
}
(function acessoWrap() {
  if (typeof window.refreshBecomeDealerUi === 'function') {
    const orig = window.refreshBecomeDealerUi;
    window.refreshBecomeDealerUi = function () {
      const r = orig.apply(this, arguments);
      try { acessoChecar(); } catch (e) { /* opcional */ }
      return r;
    };
  }
  setTimeout(() => { try { acessoChecar(); } catch (e) { /* ok */ } }, 3000);
})();

window.LegnoAcesso = { checar: () => { acessoState.checado = null; return acessoChecar(); }, ligado: () => ACESSO_BLOQUEIO_LIGADO };
