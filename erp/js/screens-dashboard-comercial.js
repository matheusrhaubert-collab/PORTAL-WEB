/* Painel comercial (BI) — Comercial → Painel (04/11, pedido do Matt)
 *
 * Só admin enxerga os números de todo mundo (RLS: user_profiles,
 * user_projects (078) e orders são lidos pelo is_admin()).
 *
 * "Online agora" = user_profiles.last_active_at nos últimos 5 min. Quem grava
 * é o heartbeat do PORTAL (js/portal-05-cutlist.js, a cada 2 min com a aba
 * aberta) — quem está só no ERP não conta.
 *
 * Consultas LEVES de propósito (lição do timeout de 26/10 e 04/11): só as
 * colunas que o painel usa, paginadas de 1000 em 1000 (teto do PostgREST).
 * "Pedido enviado" = status submitted/approved/paid/delivered (rascunho e
 * plano de corte salvo não contam). Valor = soma de order_items.total_price.
 */
const DASHC = {};
DASHC.ONLINE_MIN = 5;
DASHC.ENVIADOS = ['submitted', 'approved', 'paid', 'delivered'];
DASHC.MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
DASHC._mes = null;     // {y, m} do gráfico
DASHC._data = null;
DASHC._timer = null;
DASHC._rankAll = false;

DASHC.fetchAll = async function (build) {
  const out = [];
  for (let from = 0; from < 50000; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw error;
    out.push.apply(out, data || []);
    if (!data || data.length < 1000) break;
  }
  return out;
};

DASHC.loadProfiles = function () {
  return DASHC.fetchAll(function () {
    return DATA.sb().from('user_profiles').select('user_id, email, full_name, role, last_active_at');
  });
};

DASHC.load = async function () {
  const r = await Promise.all([
    DASHC.loadProfiles(),
    DASHC.fetchAll(function () {
      return DATA.sb().from('user_projects').select('id, client_user_id, created_at, updated_at').order('created_at', { ascending: true });
    }),
    DASHC.fetchAll(function () {
      return DATA.sb().from('orders').select('id, client_user_id, client_name, client_email, status, created_at, submitted_at, order_items(total_price)').order('created_at', { ascending: true });
    })
  ]);
  DASHC._data = { profiles: r[0], projects: r[1], orders: r[2], at: new Date() };
  if (!DASHC._mes) { const n = new Date(); DASHC._mes = { y: n.getFullYear(), m: n.getMonth() }; }
  return DASHC._data;
};

/* ---------- utilidades ---------- */
DASHC.dayKey = function (d) {
  const x = new Date(d);
  return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
};
DASHC.num = function (n) { return Number(n || 0).toLocaleString('pt-BR'); };
DASHC.nome = function (p, fallback) { return (p && (p.full_name || p.email)) || fallback || '(sem perfil)'; };
DASHC.roleLabel = function (r) {
  return ({ admin: 'Admin', dealer: 'Dealer', vendedor: 'Vendedor', client: 'Cliente', cliente: 'Cliente' })[r] || (r || '—');
};
DASHC.agoMin = function (iso) {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 1 ? 'agora' : 'há ' + m + ' min';
};
DASHC.online = function (profiles) {
  const lim = Date.now() - DASHC.ONLINE_MIN * 60000;
  return profiles.filter(function (p) { return p.last_active_at && new Date(p.last_active_at).getTime() >= lim; })
    .sort(function (a, b) { return new Date(b.last_active_at) - new Date(a.last_active_at); });
};
DASHC.orderValue = function (o) {
  return (o.order_items || []).reduce(function (s, it) { return s + (Number(it.total_price) || 0); }, 0);
};
DASHC.sentAt = function (o) { return o.submitted_at || o.created_at; };

/* ---------- CSS (uma vez) ---------- */
DASHC.css = function () {
  if (document.getElementById('dashc-css')) return;
  const st = document.createElement('style');
  st.id = 'dashc-css';
  st.textContent = [
    '.dashc-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin-bottom:14px}',
    '@media(max-width:1100px){.dashc-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}',
    '.dashc-kpi{background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:14px 16px;box-shadow:var(--shadow);position:relative;overflow:hidden}',
    '.dashc-kpi::before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--accent)}',
    '.dashc-kpi.on::before{background:var(--ok)}',
    '.dashc-kpi-l{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}',
    '.dashc-kpi-v{font-size:30px;font-weight:650;line-height:1.1;margin-top:6px;font-variant-numeric:tabular-nums}',
    '.dashc-kpi-f{font-size:12px;color:var(--muted);margin-top:4px}',
    '.dashc-dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--ok);margin-right:6px;vertical-align:middle;box-shadow:0 0 0 0 rgba(63,125,81,.5);animation:dashcPulse 2s infinite}',
    '@keyframes dashcPulse{0%{box-shadow:0 0 0 0 rgba(63,125,81,.5)}70%{box-shadow:0 0 0 7px rgba(63,125,81,0)}100%{box-shadow:0 0 0 0 rgba(63,125,81,0)}}',
    '.dashc-row{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:14px;margin-bottom:14px;align-items:start}',
    '@media(max-width:1100px){.dashc-row{grid-template-columns:1fr}}',
    '.dashc-card{background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:16px;box-shadow:var(--shadow)}',
    '.dashc-card h3{margin:0;font-size:14px;font-weight:600}',
    '.dashc-card-head{display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap}',
    '.dashc-card-head .sp{flex:1}',
    '.dashc-sub{font-size:12px;color:var(--muted)}',
    '.dashc-nav button{border:1px solid var(--border);background:var(--panel);border-radius:6px;width:28px;height:28px;cursor:pointer;color:var(--text)}',
    '.dashc-nav button:disabled{opacity:.35;cursor:default}',
    '.dashc-nav span{display:inline-block;min-width:130px;text-align:center;font-weight:600;text-transform:capitalize}',
    '.dashc-chart{position:relative}',
    '.dashc-chart svg{display:block;width:100%;height:auto}',
    '.dashc-chart .bar{fill:var(--accent);opacity:.85}',
    '.dashc-chart .bar.today{fill:var(--accent-dark);opacity:1}',
    '.dashc-chart .hit{fill:transparent;cursor:default}',
    '.dashc-chart .hit:hover + .bar,.dashc-chart g:hover .bar{opacity:1;fill:var(--accent-dark)}',
    '.dashc-chart .grid{stroke:var(--border);stroke-width:1}',
    '.dashc-chart .ax{fill:var(--muted);font-size:10px}',
    '.dashc-chart .lbl{fill:var(--text);font-size:10px;font-weight:600}',
    '.dashc-chart .avg{stroke:var(--muted);stroke-dasharray:4 4;stroke-width:1}',
    '.dashc-tip{position:absolute;pointer-events:none;background:#2b2621;color:#fff;font-size:12px;padding:6px 9px;border-radius:6px;white-space:nowrap;transform:translate(-50%,-110%);display:none;z-index:5}',
    '.dashc-mini{display:flex;gap:18px;margin-top:10px;flex-wrap:wrap}',
    '.dashc-mini div{font-size:12px;color:var(--muted)}.dashc-mini b{display:block;font-size:18px;color:var(--text);font-variant-numeric:tabular-nums}',
    '.dashc-online{list-style:none;margin:0;padding:0;max-height:360px;overflow:auto}',
    '.dashc-online li{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)}',
    '.dashc-online li:last-child{border-bottom:0}',
    '.dashc-av{width:30px;height:30px;border-radius:50%;background:#efe7df;color:var(--accent-dark);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;flex:none;position:relative}',
    '.dashc-av i{position:absolute;right:-1px;bottom:-1px;width:9px;height:9px;border-radius:50%;background:var(--ok);border:2px solid var(--panel)}',
    '.dashc-online .n{font-size:13px;font-weight:600;line-height:1.2}.dashc-online .s{font-size:11px;color:var(--muted)}',
    '.dashc-rank{width:100%;border-collapse:collapse;font-size:13px}',
    '.dashc-rank th{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);font-weight:600;text-align:left;padding:6px 8px;border-bottom:1px solid var(--border)}',
    '.dashc-rank td{padding:7px 8px;border-bottom:1px solid var(--border);vertical-align:middle}',
    '.dashc-rank td.r,.dashc-rank th.r{text-align:right;font-variant-numeric:tabular-nums}',
    '.dashc-pos{display:inline-flex;width:22px;height:22px;border-radius:50%;background:#efe7df;color:var(--accent-dark);align-items:center;justify-content:center;font-size:11px;font-weight:700}',
    '.dashc-pos.p1{background:#d9a441;color:#fff}.dashc-pos.p2{background:#a8a29a;color:#fff}.dashc-pos.p3{background:#b4794a;color:#fff}',
    '.dashc-hbar{height:8px;border-radius:4px;background:#efe7df;min-width:80px}',
    '.dashc-hbar i{display:block;height:100%;border-radius:4px;background:var(--accent)}',
    '.dashc-empty{color:var(--muted);font-size:13px;padding:18px 0;text-align:center}',
    '.dashc-more{margin-top:10px}'
  ].join('\n');
  document.head.appendChild(st);
};

/* ---------- blocos ---------- */
DASHC.kpi = function (label, value, foot, cls) {
  return '<div class="dashc-kpi ' + (cls || '') + '"><div class="dashc-kpi-l">' + label + '</div>' +
    '<div class="dashc-kpi-v">' + value + '</div>' + (foot ? '<div class="dashc-kpi-f">' + foot + '</div>' : '') + '</div>';
};

DASHC.kpis = function (d) {
  const hoje = DASHC.dayKey(new Date());
  const ont = new Date(); ont.setDate(ont.getDate() - 1); const ontem = DASHC.dayKey(ont);
  const online = DASHC.online(d.profiles);
  const projHoje = d.projects.filter(function (p) { return DASHC.dayKey(p.created_at) === hoje; }).length;
  const projOntem = d.projects.filter(function (p) { return DASHC.dayKey(p.created_at) === ontem; }).length;
  const mexHoje = d.projects.filter(function (p) { return p.updated_at && DASHC.dayKey(p.updated_at) === hoje; }).length;
  const env = d.orders.filter(function (o) { return DASHC.ENVIADOS.indexOf(o.status) >= 0; });
  const envValor = env.reduce(function (s, o) { return s + DASHC.orderValue(o); }, 0);
  const n = new Date();
  const envMes = env.filter(function (o) { const x = new Date(DASHC.sentAt(o)); return x.getFullYear() === n.getFullYear() && x.getMonth() === n.getMonth(); }).length;
  const diff = projHoje - projOntem;
  const diffTxt = (diff > 0 ? '▲ ' + diff : diff < 0 ? '▼ ' + Math.abs(diff) : '= ') + ' vs ontem (' + projOntem + ')';
  return '<div class="dashc-kpis" id="dashc-kpis">' +
    DASHC.kpi('<span class="dashc-dot"></span>Online agora', DASHC.num(online.length), 'ativos nos últimos ' + DASHC.ONLINE_MIN + ' min', 'on') +
    DASHC.kpi('Usuários', DASHC.num(d.profiles.length), 'contas no portal') +
    DASHC.kpi('Projetos', DASHC.num(d.projects.length), 'salvos no total') +
    DASHC.kpi('Projetos hoje', DASHC.num(projHoje), diffTxt + ' · ' + mexHoje + ' mexidos hoje') +
    DASHC.kpi('Pedidos enviados', DASHC.num(env.length), UI.money(envValor) + ' · ' + envMes + ' neste mês') +
    '</div>';
};

DASHC.monthSeries = function (d) {
  const y = DASHC._mes.y, m = DASHC._mes.m;
  const dias = new Date(y, m + 1, 0).getDate();
  const proj = new Array(dias).fill(0), ped = new Array(dias).fill(0);
  d.projects.forEach(function (p) { const x = new Date(p.created_at); if (x.getFullYear() === y && x.getMonth() === m) proj[x.getDate() - 1]++; });
  d.orders.forEach(function (o) {
    if (DASHC.ENVIADOS.indexOf(o.status) < 0) return;
    const x = new Date(DASHC.sentAt(o)); if (x.getFullYear() === y && x.getMonth() === m) ped[x.getDate() - 1]++;
  });
  return { y: y, m: m, dias: dias, proj: proj, ped: ped };
};

DASHC.chart = function (d) {
  const s = DASHC.monthSeries(d);
  const n = new Date();
  const ehMesAtual = s.y === n.getFullYear() && s.m === n.getMonth();
  const W = 760, H = 240, L = 30, R = 8, T = 18, B = 26;
  const pw = W - L - R, ph = H - T - B;
  const max = Math.max(4, Math.max.apply(null, s.proj));
  const step = Math.ceil(max / 4);
  const top = step * 4;
  const bw = pw / s.dias;
  const gap = Math.max(2, bw * 0.22);
  let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Projetos criados por dia">';
  for (let g = 0; g <= 4; g++) {
    const yy = T + ph - (g * step / top) * ph;
    svg += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '"/>' +
      '<text class="ax" x="' + (L - 6) + '" y="' + (yy + 3) + '" text-anchor="end">' + (g * step) + '</text>';
  }
  const ateHoje = ehMesAtual ? n.getDate() : s.dias;
  const totalMes = s.proj.reduce(function (a, b) { return a + b; }, 0);
  const media = ateHoje ? totalMes / ateHoje : 0;
  const maxV = Math.max.apply(null, s.proj);
  s.proj.forEach(function (v, i) {
    const x = L + i * bw + gap / 2, w = bw - gap;
    const h = v ? Math.max(3, (v / top) * ph) : 0;
    const y = T + ph - h;
    const today = ehMesAtual && i + 1 === n.getDate();
    const tip = (i + 1) + ' de ' + DASHC.MESES[s.m] + ': ' + v + ' projeto(s) · ' + s.ped[i] + ' pedido(s) enviado(s)';
    svg += '<g data-tip="' + UI.esc(tip) + '">' +
      (h ? '<path class="bar' + (today ? ' today' : '') + '" d="M' + x + ',' + (T + ph) + 'V' + (y + Math.min(4, h)) +
        'q0,-' + Math.min(4, h) + ' ' + Math.min(4, w / 2) + ',-' + Math.min(4, h) + 'H' + (x + w - Math.min(4, w / 2)) +
        'q' + Math.min(4, w / 2) + ',0 ' + Math.min(4, w / 2) + ',' + Math.min(4, h) + 'V' + (T + ph) + 'Z"/>' : '') +
      '<rect class="hit" x="' + (L + i * bw) + '" y="' + T + '" width="' + bw + '" height="' + ph + '"/>' +
      '</g>';
    if (v && (v === maxV || today)) svg += '<text class="lbl" x="' + (x + w / 2) + '" y="' + (y - 4) + '" text-anchor="middle">' + v + '</text>';
    const perto = ehMesAtual && !today && Math.abs(i + 1 - n.getDate()) <= 1;
    if (today || (!perto && ((i + 1) === 1 || (i + 1) % 5 === 0))) {
      svg += '<text class="ax" x="' + (x + w / 2) + '" y="' + (H - 8) + '" text-anchor="middle"' + (today ? ' style="font-weight:700;fill:var(--text)"' : '') + '>' + (i + 1) + '</text>';
    }
  });
  if (media > 0) {
    const ya = T + ph - (media / top) * ph;
    svg += '<line class="avg" x1="' + L + '" x2="' + (W - R) + '" y1="' + ya + '" y2="' + ya + '"/>' +
      '<text class="ax" x="' + (W - R) + '" y="' + (ya - 4) + '" text-anchor="end">média ' + media.toFixed(1).replace('.', ',') + '/dia</text>';
  }
  svg += '</svg>';

  const melhorDia = maxV ? (s.proj.indexOf(maxV) + 1) : null;
  const pedMes = s.ped.reduce(function (a, b) { return a + b; }, 0);
  const proxDisabled = ehMesAtual ? ' disabled' : '';
  return '<div class="dashc-card" id="dashc-chart-card">' +
    '<div class="dashc-card-head"><h3>Projetos criados por dia</h3><span class="sp"></span>' +
    '<div class="dashc-nav"><button onclick="DASHC.mudaMes(-1)" title="Mês anterior">‹</button>' +
    '<span>' + DASHC.MESES[s.m] + ' ' + s.y + '</span>' +
    '<button onclick="DASHC.mudaMes(1)" title="Próximo mês"' + proxDisabled + '>›</button></div></div>' +
    '<div class="dashc-chart" id="dashc-chart">' + svg + '<div class="dashc-tip" id="dashc-tip"></div></div>' +
    '<div class="dashc-mini">' +
    '<div><b>' + DASHC.num(totalMes) + '</b>projetos no mês</div>' +
    '<div><b>' + media.toFixed(1).replace('.', ',') + '</b>média por dia</div>' +
    '<div><b>' + (melhorDia ? melhorDia + ' (' + maxV + ')' : '—') + '</b>melhor dia</div>' +
    '<div><b>' + DASHC.num(pedMes) + '</b>pedidos enviados no mês</div>' +
    '</div></div>';
};

DASHC.onlineCard = function (d) {
  const on = DASHC.online(d.profiles);
  const body = on.length ? '<ul class="dashc-online">' + on.map(function (p) {
    const nome = DASHC.nome(p);
    const ini = nome.replace(/[^A-Za-zÀ-ú ]/g, '').split(' ').filter(Boolean).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase() || '?';
    return '<li><div class="dashc-av">' + UI.esc(ini) + '<i></i></div><div style="min-width:0"><div class="n">' + UI.esc(nome) + '</div>' +
      '<div class="s">' + UI.esc(DASHC.roleLabel(p.role)) + ' · ' + DASHC.agoMin(p.last_active_at) + '</div></div></li>';
  }).join('') + '</ul>' : '<div class="dashc-empty">Ninguém com o portal aberto agora.</div>';
  return '<div class="dashc-card" id="dashc-online-card"><div class="dashc-card-head"><h3><span class="dashc-dot"></span>Online agora (' + on.length + ')</h3>' +
    '<span class="sp"></span><span class="dashc-sub">atualiza a cada 1 min</span></div>' + body + '</div>';
};

DASHC.rankCard = function (d) {
  const by = {};
  const prof = {};
  d.profiles.forEach(function (p) { prof[p.user_id] = p; });
  function linha(uid, fb) {
    if (!by[uid]) by[uid] = { uid: uid, nome: DASHC.nome(prof[uid], fb), role: prof[uid] && prof[uid].role, ped: 0, valor: 0, proj: 0, ult: null };
    return by[uid];
  }
  d.orders.forEach(function (o) {
    if (DASHC.ENVIADOS.indexOf(o.status) < 0) return;
    const r = linha(o.client_user_id, o.client_name || o.client_email);
    r.ped++; r.valor += DASHC.orderValue(o);
    const t = DASHC.sentAt(o); if (!r.ult || t > r.ult) r.ult = t;
  });
  d.projects.forEach(function (p) { if (by[p.client_user_id]) by[p.client_user_id].proj++; });
  const lista = Object.keys(by).map(function (k) { return by[k]; })
    .sort(function (a, b) { return b.ped - a.ped || b.valor - a.valor; });
  if (!lista.length) return '<div class="dashc-card"><div class="dashc-card-head"><h3>Ranking de pedidos enviados</h3></div><div class="dashc-empty">Nenhum pedido enviado ainda.</div></div>';
  const maxP = lista[0].ped || 1;
  const mostra = DASHC._rankAll ? lista : lista.slice(0, 10);
  const rows = mostra.map(function (r, i) {
    const pos = i + 1;
    return '<tr><td style="width:34px"><span class="dashc-pos' + (pos <= 3 ? ' p' + pos : '') + '">' + pos + '</span></td>' +
      '<td><div style="font-weight:600">' + UI.esc(r.nome) + '</div><div class="dashc-sub">' + UI.esc(DASHC.roleLabel(r.role)) + (r.ult ? ' · último ' + UI.date(r.ult) : '') + '</div></td>' +
      '<td style="width:30%"><div class="dashc-hbar"><i style="width:' + Math.round(r.ped / maxP * 100) + '%"></i></div></td>' +
      '<td class="r" style="font-weight:700">' + DASHC.num(r.ped) + '</td>' +
      '<td class="r">' + UI.money(r.valor) + '</td>' +
      '<td class="r">' + DASHC.num(r.proj) + '</td></tr>';
  }).join('');
  const mais = lista.length > 10 ? '<div class="dashc-more"><button class="erp-btn-secondary erp-btn-sm" onclick="DASHC.toggleRank()">' +
    (DASHC._rankAll ? 'Mostrar só os 10 primeiros' : 'Ver todos (' + lista.length + ')') + '</button></div>' : '';
  return '<div class="dashc-card" id="dashc-rank-card"><div class="dashc-card-head"><h3>Ranking de pedidos enviados</h3><span class="sp"></span>' +
    '<span class="dashc-sub">do maior pro menor · ' + lista.length + ' usuário(s)</span></div>' +
    '<table class="dashc-rank"><thead><tr><th></th><th>Usuário</th><th></th><th class="r">Pedidos</th><th class="r">Valor</th><th class="r">Projetos</th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table>' + mais + '</div>';
};

DASHC.render = function (params, d) {
  DASHC.css();
  return UI.head('Painel comercial',
    'Quem está online, quantos projetos e quem mais envia pedido. Atualizado ' + d.at.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + '.',
    '<a class="erp-btn erp-btn-secondary" href="#/projetos">Ver projetos</a>' +
    '<button class="erp-btn-secondary" onclick="APP.reload()">Atualizar</button>') +
    DASHC.kpis(d) +
    '<div class="dashc-row">' + DASHC.chart(d) + DASHC.onlineCard(d) + '</div>' +
    DASHC.rankCard(d);
};

/* ---------- interação ---------- */
DASHC.bindTip = function () {
  const box = document.getElementById('dashc-chart');
  const tip = document.getElementById('dashc-tip');
  if (!box || !tip) return;
  box.addEventListener('mousemove', function (e) {
    const g = e.target.closest && e.target.closest('g[data-tip]');
    if (!g) { tip.style.display = 'none'; return; }
    const rb = box.getBoundingClientRect();
    tip.textContent = g.getAttribute('data-tip');
    tip.style.left = (e.clientX - rb.left) + 'px';
    tip.style.top = (e.clientY - rb.top) + 'px';
    tip.style.display = 'block';
  });
  box.addEventListener('mouseleave', function () { tip.style.display = 'none'; });
};

DASHC.replace = function (id, html) {
  const el = document.getElementById(id);
  if (!el) return;
  const t = document.createElement('div'); t.innerHTML = html;
  el.replaceWith(t.firstChild);
};

DASHC.mudaMes = function (delta) {
  let m = DASHC._mes.m + delta, y = DASHC._mes.y;
  if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; }
  const n = new Date();
  if (y > n.getFullYear() || (y === n.getFullYear() && m > n.getMonth())) return;
  DASHC._mes = { y: y, m: m };
  DASHC.replace('dashc-chart-card', DASHC.chart(DASHC._data));
  DASHC.bindTip();
};

DASHC.toggleRank = function () {
  DASHC._rankAll = !DASHC._rankAll;
  DASHC.replace('dashc-rank-card', DASHC.rankCard(DASHC._data));
};

/* A cada 1 min relê só os perfis (leve) e redesenha "online" + KPIs. Para
   sozinho quando sai da tela. */
DASHC.after = function () {
  DASHC.bindTip();
  if (DASHC._timer) clearInterval(DASHC._timer);
  DASHC._timer = setInterval(async function () {
    if (!document.getElementById('dashc-online-card')) { clearInterval(DASHC._timer); DASHC._timer = null; return; }
    try {
      DASHC._data.profiles = await DASHC.loadProfiles();
      DASHC.replace('dashc-online-card', DASHC.onlineCard(DASHC._data));
      DASHC.replace('dashc-kpis', DASHC.kpis(DASHC._data));
    } catch (e) { console.warn('[painel comercial] online', e); }
  }, 60000);
};
