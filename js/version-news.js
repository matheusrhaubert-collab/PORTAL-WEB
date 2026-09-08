// Comportamento do selo de versão + botão "Novidades" (2026-09-07). Lê o
// array puro de js/changelog.js e:
//   1. Escreve o número da versão atual (item [0]) em #po-version-badge.
//   2. Monta a lista do modal #po-news-modal a partir do array inteiro.
//   3. Guarda no localStorage qual foi a última versão que o usuário viu —
//      enquanto a versão mais nova for diferente da guardada (ou for a 1ª
//      visita, sem nada guardado ainda), mostra uma bolinha no botão; abrir
//      o modal marca como visto e some a bolinha (mesma ideia de
//      "notificação não lida").
// Mesmo padrão de abrir/fechar modal do resto do portal (× / clique fora /
// Esc) — ver ligaPecasDoMovel em portal-06c-projetos-canvas-3d-acoes.js pra
// comparação; aqui é a versão mais simples porque não tem 3D nem lista
// editável, só texto.
(function () {
  'use strict';

  var STORAGE_KEY = 'legno_portal_last_seen_version';
  var LOCALE_BY_LANG = { pt: 'pt-BR', en: 'en-US', es: 'es-ES' };

  function currentLocale() {
    var lang = (typeof I18n !== 'undefined' && I18n.getLanguage && I18n.getLanguage()) || 'pt';
    return LOCALE_BY_LANG[lang] || 'pt-BR';
  }

  function formatEntryDate(isoDate) {
    // isoDate no formato 'AAAA-MM-DD'. new Date('AAAA-MM-DD') direto é meia-
    // noite UTC — em fuso negativo (ex.: Havana, UTC-4) isso pode voltar um
    // dia na exibição. Monta com ano/mês/dia soltos pra virar meia-noite no
    // fuso LOCAL em vez de UTC.
    var partes = String(isoDate).split('-').map(Number);
    var d = new Date(partes[0], partes[1] - 1, partes[2]);
    if (isNaN(d.getTime())) return isoDate;
    try {
      return d.toLocaleDateString(currentLocale());
    } catch (e) {
      return isoDate;
    }
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function itemsForEntry(entry) {
    // js/changelog.js agora guarda items como {pt, en, es} pra cada
    // versao (2026-09-07) -- pega a lista no idioma da conta, cai pro
    // pt se faltar traducao, e ainda aceita o formato antigo (array
    // puro) por seguranca.
    var lang = (typeof I18n !== 'undefined' && I18n.getLanguage && I18n.getLanguage()) || 'pt';
    if (Array.isArray(entry.items)) return entry.items;
    return (entry.items && (entry.items[lang] || entry.items.pt)) || [];
  }

  function renderNewsList(changelog) {
    var list = document.getElementById('po-news-list');
    if (!list) return;
    list.innerHTML = changelog.map(function (entry) {
      var itens = itemsForEntry(entry).map(function (txt) {
        return '<li>' + escapeHtml(txt) + '</li>';
      }).join('');
      return '<div class="po-news-entry">'
        + '<span class="po-news-version">v' + escapeHtml(entry.version) + '</span>'
        + '<span class="po-news-date">' + escapeHtml(formatEntryDate(entry.date)) + '</span>'
        + '<ul>' + itens + '</ul>'
        + '</div>';
    }).join('');
  }

  function ligaNovidadesDoPortal(latestVersion) {
    var modal = document.getElementById('po-news-modal');
    var btn = document.getElementById('po-version-news-btn');
    var fechar = document.getElementById('po-news-close');
    var dot = document.getElementById('po-version-news-dot');

    function marcaVisto() {
      try { localStorage.setItem(STORAGE_KEY, latestVersion); } catch (e) { /* localStorage indisponível (modo privado etc.) — ignora, só a bolinha fica sem memória */ }
      if (dot) dot.hidden = true;
    }
    function abre() {
      if (modal) modal.classList.add('open');
      marcaVisto();
    }
    function fecha() {
      if (modal) modal.classList.remove('open');
    }

    if (btn) btn.addEventListener('click', abre);
    if (fechar) fechar.addEventListener('click', fecha);
    if (modal) modal.addEventListener('click', function (e) { if (e.target === modal) fecha(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal && modal.classList.contains('open')) fecha();
    });

    // Bolinha de "tem novidade" só acende se a última versão vista (ou
    // nenhuma ainda, 1ª visita) for diferente da versão mais nova.
    var visto = null;
    try { visto = localStorage.getItem(STORAGE_KEY); } catch (e) { /* ignora */ }
    if (dot) dot.hidden = (visto === latestVersion);
  }

  function boot() {
    var changelog = window.LEGNO_CHANGELOG;
    if (!Array.isArray(changelog) || !changelog.length) return;
    var latest = changelog[0].version;

    var badge = document.getElementById('po-version-badge');
    if (badge) badge.textContent = 'v' + latest;

    renderNewsList(changelog);
    ligaNovidadesDoPortal(latest);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
