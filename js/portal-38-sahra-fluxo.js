// ==========================================================================
// SAHRA · FLUXO — botão novo no menu de cima, SÓ ADMIN (2026-11-07)
// Matt: "coloca essa tela fluxo da sahra num botão novo, sem mexer no antigo,
// quero fazer alguns testes no portal. só pra adm".
//
//  - Não altera nada existente: a SAHRA do canto (portal-37) continua igual.
//  - O botão só nasce quando window.LEGNO_IS_ADMIN === true (rpc is_admin(),
//    portal-26). A tela e a Edge Function sahra-fluxo conferem de novo.
//  - Clicar abre uma janela por cima do portal com sahra-fluxo.html (mesma
//    origem, mesma sessão do Supabase): Editor do fluxo + Mesa da SAHRA.
//  - Não é uma aba do portal de propósito (classe própria, sem data-tab), pra
//    não passar pelo listener genérico de .portal-tab-btn.
//  - Desligar: localStorage 'legno_sahra_fluxo_off' = '1'.
// Tabelas: migration 271 (sahra_fluxo_*). IA: supabase/functions/sahra-fluxo.
// ==========================================================================
(function () {
  try { if (localStorage.getItem('legno_sahra_fluxo_off') === '1') return; } catch (e) { /* */ }

  const VERSAO = '202611080810';
  let overlay = null;

  function abrir() {
    if (overlay) { overlay.style.display = 'flex'; return; }
    overlay = document.createElement('div');
    overlay.id = 'sahra-fluxo-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'Fluxo da SAHRA');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(20,18,16,.55);display:flex;flex-direction:column;padding:12px;box-sizing:border-box;';
    const barra = document.createElement('div');
    barra.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-bottom:8px;';
    const nova = document.createElement('button');
    nova.type = 'button'; nova.textContent = 'Abrir em nova aba';
    nova.style.cssText = 'border:1px solid rgba(255,255,255,.4);background:transparent;color:#fff;border-radius:6px;padding:6px 12px;cursor:pointer;font:inherit;font-size:13px;';
    nova.onclick = () => window.open('sahra-fluxo.html?v=' + VERSAO, '_blank');
    const fechar = document.createElement('button');
    fechar.type = 'button'; fechar.textContent = 'Fechar';
    fechar.style.cssText = 'border:0;background:#fff;color:#1f1d1a;border-radius:6px;padding:6px 14px;cursor:pointer;font:inherit;font-size:13px;font-weight:600;';
    fechar.onclick = () => { overlay.style.display = 'none'; };
    barra.append(nova, fechar);
    const frame = document.createElement('iframe');
    frame.src = 'sahra-fluxo.html?v=' + VERSAO;
    frame.title = 'Fluxo da SAHRA';
    frame.allow = 'autoplay; clipboard-write; microphone';
    frame.style.cssText = 'flex:1;width:100%;border:0;border-radius:12px;background:#f3f2ee;';
    overlay.append(barra, frame);
    document.body.appendChild(overlay);
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && overlay && overlay.style.display !== 'none') overlay.style.display = 'none'; });
  }

  function criarBotao() {
    if (document.getElementById('po-sahra-fluxo-btn')) return true;
    const nav = document.getElementById('po-sidebar');
    if (!nav) return false;
    const b = document.createElement('button');
    b.type = 'button';
    b.id = 'po-sahra-fluxo-btn';
    b.textContent = 'SAHRA · Fluxo';
    b.title = 'Fluxo da SAHRA (teste, só administrador)';
    b.style.cssText = 'background:transparent;border:0;border-radius:0;padding:10px 4px;margin:0 10px;font:inherit;font-size:14px;font-weight:500;color:#7a4a22;cursor:pointer;white-space:nowrap;';
    b.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); abrir(); });
    nav.appendChild(b);
    return true;
  }
  function removerBotao() {
    const b = document.getElementById('po-sahra-fluxo-btn'); if (b) b.remove();
    if (overlay) { overlay.remove(); overlay = null; }
  }

  // LEGNO_IS_ADMIN é preenchido depois do login (portal-26); confere de tempos em tempos.
  setInterval(() => {
    if (window.LEGNO_IS_ADMIN === true) criarBotao(); else removerBotao();
  }, 1500);
})();
