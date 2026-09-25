/* Legno ERP — helpers de UI do mockup.
   Sem framework de propósito: o mockup precisa abrir com duplo clique no
   arquivo (file://), sem build, sem servidor. */

const UI = {};

UI.esc = function (s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
};

UI.money = function (v) {
  return '$' + Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

UI.pct = function (v) { return Math.round((v || 0) * 100) + '%'; };

UI.date = function (iso) {
  if (!iso) return '—';
  const p = String(iso).slice(0, 10).split('-');
  return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso;
};

/* Dias até a data — usado para destacar pedido/OP atrasando. HOJE é fixo
   no mockup para os dados fictícios continuarem coerentes com o tempo. */
UI.TODAY = new Date('2026-08-06T12:00:00');
UI.daysUntil = function (iso) {
  if (!iso) return null;
  return Math.round((new Date(iso + 'T12:00:00') - UI.TODAY) / 86400000);
};

UI.pill = function (label, cls) {
  return '<span class="erp-pill ' + (cls || 'erp-pill-neutral') + '">' + UI.esc(label) + '</span>';
};

UI.statusPill = function (map, key) {
  const s = map[key];
  return s ? UI.pill(s.label, s.pill) : UI.pill(key || '—', 'erp-pill-neutral');
};

UI.bar = function (v, cls) {
  return '<div class="erp-bar ' + (cls || '') + '"><i style="width:' + Math.round((v || 0) * 100) + '%"></i></div>';
};

UI.swatch = function (hex, name) {
  return '<span class="erp-swatch" style="background:' + UI.esc(hex || '#ccc') + '"></span>' + UI.esc(name || '');
};

UI.kpi = function (label, value, foot) {
  return '<div class="erp-kpi"><div class="erp-kpi-label">' + UI.esc(label) + '</div>' +
    '<div class="erp-kpi-value">' + value + '</div>' +
    (foot ? '<div class="erp-kpi-foot">' + foot + '</div>' : '') + '</div>';
};

UI.head = function (title, sub, actions) {
  return '<div class="erp-page-head"><div><h1>' + UI.esc(title) + '</h1>' +
    (sub ? '<p class="erp-sub">' + sub + '</p>' : '') + '</div>' +
    (actions ? '<div class="erp-page-actions">' + actions + '</div>' : '') + '</div>';
};

UI.crumb = function (parts) {
  return '<div class="erp-crumb">' + parts.map(function (p) {
    return p.href ? '<a href="' + p.href + '">' + UI.esc(p.label) + '</a>' : UI.esc(p.label);
  }).join(' › ') + '</div>';
};

/* Aviso de fonte única — aparece em toda tela que lê dado do portal.
   É o lembrete visual da regra: o ERP não duplica cliente, produto ou projeto. */
UI.sourceNote = function (text) {
  return '<div class="erp-note">' + text + '</div>';
};

/* Marca as telas que ainda não têm dado real, para ninguém confundir
   número de exemplo com número da fábrica. */
UI.demoTag = function () {
  return '<span class="erp-demo-tag">dados de exemplo</span>';
};

UI.demoNote = function (what) {
  return '<div class="erp-note">Esta tela ainda roda com <span class="erp-strong">dados fictícios</span>. ' +
    'Ela depende de tabelas do schema <span class="erp-mono">erp</span> que ainda não existem' +
    (what ? ' (' + what + ')' : '') + '. Serve para validar o fluxo e o layout.</div>';
};

UI.errorBox = function (title, detail) {
  return '<div class="erp-error"><div class="erp-error-title">' + UI.esc(title) + '</div>' +
    (detail ? '<div class="erp-error-detail">' + UI.esc(detail) + '</div>' : '') + '</div>';
};

UI.table = function (cols, rows) {
  let h = '<table class="erp-table"><thead><tr>';
  cols.forEach(function (c) {
    h += '<th' + (c.align === 'right' ? ' class="erp-num"' : '') +
      (c.width ? ' style="width:' + c.width + '"' : '') + '>' + UI.esc(c.label) + '</th>';
  });
  h += '</tr></thead><tbody>';
  if (!rows.length) {
    h += '<tr><td colspan="' + cols.length + '"><div class="erp-empty">Nada por aqui ainda.</div></td></tr>';
  } else {
    rows.forEach(function (r) {
      h += '<tr' + (r._href ? ' class="erp-row-link" onclick="location.hash=\'' + r._href + '\'"' : '') + '>';
      cols.forEach(function (c) {
        h += '<td' + (c.align === 'right' ? ' class="erp-num"' : '') + '>' + (r[c.key] == null ? '—' : r[c.key]) + '</td>';
      });
      h += '</tr>';
    });
  }
  return h + '</tbody></table>';
};

UI.panel = function (title, body, flush) {
  return '<div class="erp-panel' + (flush ? ' erp-panel-flush' : '') + '">' +
    (title ? '<h2>' + UI.esc(title) + '</h2>' : '') + body + '</div>';
};

UI.def = function (pairs) {
  return '<dl class="erp-def">' + pairs.map(function (p) {
    return '<dt>' + UI.esc(p[0]) + '</dt><dd>' + p[1] + '</dd>';
  }).join('') + '</dl>';
};

/* Aviso de ação não implementada — deixa claro que é mockup sem parecer bug */
UI.todo = function (what) {
  alert('Mockup: "' + what + '" ainda não faz nada.\n\nEssa tela existe para validar o fluxo e o layout. A ação real entra quando o schema estiver congelado.');
};

/* ---------- Overlay de leitura de código ---------- */
UI.openScan = function (onRead) {
  const ov = document.getElementById('erp-scan-overlay');
  const input = document.getElementById('erp-scan-input');
  const result = document.getElementById('erp-scan-result');
  result.innerHTML = '';
  input.value = '';
  ov.hidden = false;
  input.focus();
  UI._scanHandler = onRead || UI._defaultScan;
};

UI.closeScan = function () {
  document.getElementById('erp-scan-overlay').hidden = true;
};

UI._defaultScan = function (code) {
  const result = document.getElementById('erp-scan-result');
  const piece = MOCK.pieces.find(function (p) { return p.code.toUpperCase() === code.toUpperCase(); });
  const op = MOCK.ops.find(function (o) { return o.code.toUpperCase() === code.toUpperCase(); });
  if (piece) {
    result.innerHTML = '<div class="erp-panel" style="margin:0">' +
      '<div class="erp-strong">' + UI.esc(piece.name) + '</div>' +
      '<div class="erp-muted erp-small">' + piece.w + ' × ' + piece.h + ' × ' + piece.thick + ' mm · ' + UI.esc(piece.color) + '</div>' +
      '<div style="margin-top:8px">' + UI.pill(piece.op, 'erp-pill-accent') + ' ' + UI.pill('Etapa: ' + MOCK.processById(piece.step).name, 'erp-pill-info') + '</div>' +
      '<div style="margin-top:12px;display:flex;gap:8px"><button onclick="UI.todo(\'Apontar OK\')">Apontar OK</button>' +
      '<button class="erp-btn-secondary" onclick="UI.todo(\'Marcar refugo\')">Refugo</button></div></div>';
  } else if (op) {
    result.innerHTML = '<div class="erp-panel" style="margin:0"><div class="erp-strong">' + UI.esc(op.name) + '</div>' +
      '<div class="erp-muted erp-small">' + UI.esc(op.code) + ' · ' + op.qty + ' un · ' + UI.esc(op.color) + '</div>' +
      '<div style="margin-top:12px"><a class="erp-btn" href="#/producao/' + op.code + '" onclick="UI.closeScan()">Abrir OP</a></div></div>';
  } else {
    result.innerHTML = '<div class="erp-pill erp-pill-danger">Código não encontrado: ' + UI.esc(code) + '</div>' +
      '<div class="erp-muted erp-small" style="margin-top:8px">Tente <span class="erp-mono">PC-014801</span> ou <span class="erp-mono">OP-0148-001</span>.</div>';
  }
};

document.addEventListener('DOMContentLoaded', function () {
  const input = document.getElementById('erp-scan-input');
  const close = document.getElementById('erp-scan-close');
  const ov = document.getElementById('erp-scan-overlay');
  input.addEventListener('keydown', function (e) {
    /* Leitor de mão manda os dígitos e fecha com Enter — mesmo evento do teclado */
    if (e.key === 'Enter' && input.value.trim()) {
      UI._scanHandler(input.value.trim());
      input.select();
    }
  });
  close.addEventListener('click', UI.closeScan);
  ov.addEventListener('click', function (e) { if (e.target === ov) UI.closeScan(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') UI.closeScan(); });
});
