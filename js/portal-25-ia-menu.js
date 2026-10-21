/* GRUPOS DA BARRA NUM ÍCONE SÓ (2026-10-20)
 *
 * Matt: "quero juntar as ferramentas da barra IA service para ficarem em um
 * único ícone que ao passar o mouse ou clique desça dropdown das opções
 * abaixo. isso é pra encurtar a barra de ferramentas que tá ficando muito
 * larga" — e na sequência "faz isso com budget e render também", "e layers
 * também", "e walls e viewer". Vale pra todo .po-tb-dd do portal.html:
 * Paredes, Vista, Camadas, Render, Orçamento e IA Services.
 *
 * Os botões são os MESMOS de antes (IDs, listeners, regra "só administrador"
 * de refreshProjectAdminOnlyButtons) — só moram dentro do painel. Este
 * arquivo só abre/fecha e posiciona:
 *   - passar o mouse abre; sair (botão + painel + sublista) fecha em 250 ms;
 *   - clicar no ícone FIXA aberto (se abriu pelo mouse) ou fecha (se já
 *     estava fixo); toque (iPad) = clique;
 *   - clicar numa opção, fora, ou Esc fecha. Abrir um fecha os outros.
 *   - Botão que abre SUBLISTA (Camadas, Visual, Estruturas, Mapa de calor —
 *     todos attachFloatingDropdown, lista flutuando no <body>) não fecha o
 *     painel; a sublista é reposicionada pra abrir AO LADO do painel.
 *   - Botão sem <span> de texto (Ocultar/Mostrar, Linhas/Gerar/Print, $)
 *     ganha .po-tb-dd-rotulo: o CSS escreve o aria-label dele na linha.
 * O painel é position:fixed (a faixa de ferramentas tem overflow-x:auto e
 * cortaria um absolute), mas continua DENTRO de #po-tab-projects no DOM —
 * o helper (portal-24) lista e encontra os botões normalmente, e abre o
 * painel sozinho via window.LegnoTbMenus quando o passo do tour aponta pra
 * um deles.
 */
(function () {
  'use strict';
  const raizes = Array.prototype.slice.call(document.querySelectorAll('.po-tb-dd'));
  if (!raizes.length) return;
  const temHover = !!(window.matchMedia && window.matchMedia('(hover: hover)').matches);
  const SUBMENU = '.po-style-menu, .po-structures-menu';
  const listas = new Set();   // sublistas conhecidas (elas saem do painel pro <body> ao abrir)
  const dentroDeLista = (el) => { for (const l of listas) if (l.contains(el)) return true; return false; };
  const menus = [];

  function fecharSublistas(painel) {
    painel.querySelectorAll(SUBMENU).forEach((m) => {
      m.classList.remove('aberto');
      const l = m._ddLista;
      if (l) l.style.display = 'none';
    });
  }

  function montar(raiz) {
    const btn = raiz.querySelector('.po-tb-dd-btn');
    const painel = raiz.querySelector('.po-tb-dd-panel');
    if (!btn || !painel) return null;
    let porMouse = false, timer = null;
    const aberto = () => raiz.classList.contains('aberto');

    const rotular = () => painel.querySelectorAll('button').forEach((b) => {
      if (b.closest('.po-style-list')) return;
      const temTexto = Array.prototype.some.call(b.querySelectorAll('span'), (sp) => sp.textContent.trim());
      b.classList.toggle('po-tb-dd-rotulo', !temTexto && !!b.getAttribute('aria-label'));
    });
    const guardarListas = () => painel.querySelectorAll(SUBMENU).forEach((m) => {
      const l = m.querySelector('.po-style-list');
      if (l) { m._ddLista = l; listas.add(l); }
    });

    function posicionar() {
      const r = btn.getBoundingClientRect();
      const w = painel.offsetWidth || 240;
      let left = r.left;
      if (left + w > window.innerWidth - 8) left = Math.max(8, window.innerWidth - w - 8);
      painel.style.left = left + 'px';
      painel.style.top = (r.bottom + 4) + 'px';
    }
    function abrir(mouse) {
      clearTimeout(timer);
      menus.forEach((m) => { if (m.raiz !== raiz) m.fechar(); });
      if (!aberto()) {
        rotular(); guardarListas();
        raiz.classList.add('aberto'); porMouse = !!mouse;
      } else if (!mouse) porMouse = false;
      btn.setAttribute('aria-expanded', 'true');
      posicionar();
    }
    function fechar() {
      clearTimeout(timer);
      if (!aberto()) return;
      raiz.classList.remove('aberto');
      porMouse = false;
      btn.setAttribute('aria-expanded', 'false');
      fecharSublistas(painel);
    }
    function agendarFechar() {
      if (!porMouse) return;
      clearTimeout(timer);
      timer = setTimeout(fechar, 250);
    }

    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (aberto() && !porMouse) fechar(); else abrir(false);
    });
    if (temHover) {
      raiz.addEventListener('mouseenter', () => { if (!aberto()) abrir(true); else clearTimeout(timer); });
      raiz.addEventListener('mouseleave', (ev) => {
        if (ev.relatedTarget && dentroDeLista(ev.relatedTarget)) return;
        agendarFechar();
      });
    }
    // CAPTURA: o botão das sublistas (attachFloatingDropdown) para a
    // propagação, então só na captura dá pra ver o clique nele.
    painel.addEventListener('click', (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      const sub = b.closest(SUBMENU);
      if (sub) {
        guardarListas();
        // a sublista abre no handler do próprio botão (logo depois deste):
        // aí ela é levada pro lado do painel
        setTimeout(() => {
          const l = sub._ddLista;
          if (!l || l.style.display === 'none') return;
          const pr = painel.getBoundingClientRect();
          const br = b.getBoundingClientRect();
          const w = l.offsetWidth || 220;
          let left = pr.right + 6;
          if (left + w > window.innerWidth - 8) left = Math.max(8, pr.left - w - 6);
          let top = br.top;
          const h = l.offsetHeight || 0;
          if (top + h > window.innerHeight - 8) top = Math.max(8, window.innerHeight - h - 8);
          l.style.left = left + 'px';
          l.style.top = top + 'px';
        }, 0);
        return;
      }
      setTimeout(fechar, 0);   // escolheu uma opção (o listener dela já rodou)
    }, true);

    return { raiz, painel, abrir, fechar, aberto, agendarFechar, posicionar, cancelar: () => clearTimeout(timer) };
  }

  raizes.forEach((r) => { const m = montar(r); if (m) menus.push(m); });

  // Sublista flutuando no <body>: mouse em cima segura o painel aberto;
  // escolher um item fecha tudo (a própria sublista já se fecha sozinha).
  if (temHover) {
    document.addEventListener('mouseover', (ev) => {
      if (dentroDeLista(ev.target)) menus.forEach((m) => { if (m.aberto()) m.cancelar(); });
    });
    document.addEventListener('mouseout', (ev) => {
      if (!dentroDeLista(ev.target)) return;
      const para = ev.relatedTarget;
      if (para && (dentroDeLista(para) || menus.some((m) => m.raiz.contains(para)))) return;
      menus.forEach((m) => { if (m.aberto()) m.agendarFechar(); });
    });
  }
  document.addEventListener('click', (ev) => {
    menus.forEach((m) => {
      if (!m.aberto() || m.raiz.contains(ev.target)) return;
      if (dentroDeLista(ev.target)) {
        // clique num item da sublista fecha o painel; num cabeçalho/área
        // vazia dela (ex.: checkbox de Camadas), o painel fica
        if (ev.target.closest('.po-style-item, .po-structures-item, .po-heatmap-item, button')) {
          const camadas = ev.target.closest('.po-layers-list') && !ev.target.closest('.po-heatmap-item');
          if (!camadas) setTimeout(m.fechar, 0);
        }
        return;
      }
      m.fechar();
    });
  }, true);
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') menus.forEach((m) => m.fechar()); });
  const reposicionar = () => menus.forEach((m) => { if (m.aberto()) m.posicionar(); });
  window.addEventListener('resize', reposicionar);
  // a faixa de ferramentas rola na horizontal: o painel acompanha o botão
  window.addEventListener('scroll', (ev) => {
    if (ev.target && ev.target.closest && ev.target.closest('.po-tb-dd-panel, .po-style-list')) return;
    reposicionar();
  }, true);

  window.LegnoTbMenus = {
    menus,
    // abre o painel que contém `el` (helper/tour). true se abriu algum.
    abrirPara(el) {
      const m = menus.find((x) => x.painel.contains(el));
      if (!m) return false;
      m.abrir(false);
      return true;
    },
    fecharTodos() { menus.forEach((m) => m.fechar()); }
  };
})();
