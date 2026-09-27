/* Legno ERP — VOLUMES (pacotes) do lote: dados (Supabase, schema erp).
 *
 * Migration 180 (erp.packages, erp.package_pieces, erp.pallet_plans).
 * O cálculo é do erp/js/pacotes-engine.js (PACOTES) + erp/js/pallet-engine.js
 * (PALLET). Aqui: carregar as peças físicas do lote, rodar o motor, gravar,
 * ler de volta e apontar.
 *
 *   PACOTES_DB.pecasDoLote(batchId, avisar)   peças físicas (plano de corte)
 *   PACOTES_DB.criarVolumes(batchId, opt, avisar)  calcula + grava (substitui)
 *   PACOTES_DB.carregar(batchId)              { batch, pacotes, pecas, pallets }
 *   PACOTES_DB.resumo(batchId)                contagens pra tela do lote
 *   PACOTES_DB.apontar(batchId, pieceCode)    marca peça; fecha pacote se completo
 *   PACOTES_DB.desapontar(batchId, pieceCode)
 *   PACOTES_DB.setNicho(pkgId, nicho)
 *   PACOTES_DB.embalar(pkgId) / desembalar(pkgId)
 */

const PACOTES_DB = {};

PACOTES_DB.OPT_PADRAO = function () {
  const d = PACOTES.DEFAULTS;
  return { pesoMax: d.pesoMax, grandeMm: d.grandeMm, dens: d.dens, parCamadas: d.parCamadas, pallet: Object.assign({}, d.pallet) };
};

/* Peças FÍSICAS do lote: cut_plan_pieces do último plano (tem o PC-xxxx da
   etiqueta, é o que o leitor lê). order_id vem de batch_pieces (via
   batch_piece_id). Sem plano de corte, cai pro batch_pieces com código
   BP-xxxx (aponta por clique). */
PACOTES_DB.pecasDoLote = async function (batchId, avisar) {
  avisar = avisar || function () {};
  const erp = LOTES.erp();
  const b = await LOTES.batch(batchId);
  if (!b) throw new Error('Lote não encontrado.');
  const ordPorId = {};
  (b._orders || []).forEach(function (o) { ordPorId[o.id] = o; });
  const bpPorId = {};
  (b._pieces || []).forEach(function (r) { bpPorId[r.id] = r; });
  const mkKey = function (r) {
    return r.module_name ? [r.po_name || '', r.module_number || '', r.module_name].join('|') : null;
  };
  const clienteDe = function (orderId, r) {
    const o = orderId && ordPorId[orderId];
    return o ? DATA.clientLabel(o) : (r.client_name || '');
  };
  const out = [];
  const plano = (b._plans || []).filter(function (p) { return p.status !== 'cancelado'; })[0];
  if (plano) {
    avisar('Buscando as peças do plano ' + (plano.code || ('v' + plano.version)) + '…');
    let rows = [];
    for (let de = 0; ; de += 1000) {
      const { data, error } = await erp.from('cut_plan_pieces').select('*').eq('plan_id', plano.id)
        .order('piece_code').range(de, de + 999);
      if (error) throw error;
      rows = rows.concat(data || []);
      if (!data || data.length < 1000) break;
    }
    rows.forEach(function (r) {
      const bp = r.batch_piece_id ? bpPorId[r.batch_piece_id] : null;
      const orderId = (bp && bp.order_id) || null;
      const v = [Number(r.w_mm) || 0, Number(r.h_mm) || 0].sort(function (a, c) { return c - a; });
      out.push({ codigo: r.piece_code, ref: r.reference || r.label || '—', c: v[0], l: v[1], e: Number(r.espessura_mm) || 19.5,
        cor: r.color_name || '', modKey: mkKey(r), moduloNumero: r.module_number || '—', moduloNome: r.module_name || '',
        pedido: r.po_name || (bp && bp.po_name) || '', orderId: orderId, cliente: clienteDe(orderId, r) });
    });
    return { pecas: out, fonte: 'Plano ' + (plano.code || ('v' + plano.version)), planId: plano.id, batch: b };
  }
  (b._pieces || []).forEach(function (r, i) {
    const q = Math.max(1, Math.round(Number(r.quantity) || 1));
    const v = [Number(r.comprimento_mm) || 0, Number(r.largura_mm) || 0].sort(function (a, c) { return c - a; });
    for (let k = 0; k < q; k++) {
      out.push({ codigo: 'BP-' + String(i + 1).padStart(4, '0') + (q > 1 ? '-' + (k + 1) : ''), ref: r.reference || '—', c: v[0], l: v[1],
        e: Number(r.espessura_mm) || 19.5, cor: r.color_name || '', modKey: mkKey(r), moduloNumero: r.module_number || '—',
        moduloNome: r.module_name || '', pedido: r.po_name || '', orderId: r.order_id || null, cliente: clienteDe(r.order_id, r) });
    }
  });
  return { pecas: out, fonte: 'Sem plano de corte — peças do lote sem código de etiqueta', planId: null, batch: b };
};

/* Calcula e GRAVA os volumes do lote (apaga os anteriores). Se já tem peça
   apontada, só substitui com opt.forcar. Devolve o resumo. */
PACOTES_DB.criarVolumes = async function (batchId, opt, avisar) {
  avisar = avisar || function () {};
  opt = Object.assign(PACOTES_DB.OPT_PADRAO(), opt || {});
  const erp = LOTES.erp();
  if (typeof PACOTES === 'undefined') throw new Error('pacotes-engine.js não carregou');

  const { count: nApont, error: e0 } = await erp.from('package_pieces').select('id', { count: 'exact', head: true })
    .eq('batch_id', batchId).not('apontado_at', 'is', null);
  if (e0) throw e0;
  if (nApont && !opt.forcar) {
    const err = new Error('Este lote já tem ' + nApont + ' peça(s) apontada(s). Recalcular os volumes apaga o apontamento. Confirme pra continuar.');
    err.precisaConfirmar = true;
    throw err;
  }

  const src = await PACOTES_DB.pecasDoLote(batchId, avisar);
  if (!src.pecas.length) throw new Error('Esse lote não tem peça nenhuma.');
  avisar('Calculando os pacotes (' + src.pecas.length + ' peças)…');
  const r = PACOTES.gerar(src.pecas, opt);

  // pallets por pedido
  const porPedido = {};
  r.pacotes.forEach(function (pc) {
    const k = pc.orderId || ('SEM|' + pc.pedido);
    (porPedido[k] = porPedido[k] || []).push(pc);
  });
  const planos = [];
  Object.keys(porPedido).forEach(function (k) {
    avisar('Montando o pallet do pedido ' + (porPedido[k][0].pedido || '') + '…');
    const pl = PACOTES.pallets(porPedido[k], opt.pallet);
    pl.pallets.forEach(function (pal) {
      pal.itens.forEach(function (it) {
        const pc = r.pacotes.find(function (p) { return p.id === it.id; });
        if (pc) { pc.palletN = pal.n; pc.palletPos = { x: it.x, y: it.y, z: it.z, w: it.w, d: it.d, nivel: it.nivel, seq: it.seq, tipo: pal.tipo }; }
      });
    });
    planos.push({ orderId: porPedido[k][0].orderId, pedido: porPedido[k][0].pedido, plano: pl });
  });

  avisar('Gravando…');
  let e;
  e = (await erp.from('packages').delete().eq('batch_id', batchId)).error; if (e) throw e;
  e = (await erp.from('pallet_plans').delete().eq('batch_id', batchId)).error; if (e) throw e;

  const rowsPk = r.pacotes.map(function (pc) {
    return { batch_id: batchId, order_id: pc.orderId, po_name: pc.pedido || null, client_name: pc.cliente || null,
      module_key: pc.modKey, module_number: pc.moduloNumero, module_name: pc.moduloNome,
      seq: pc.seq, idx: pc.idx, total: pc.total, tipo: pc.tipo, rotulo: pc.rotulo,
      c_mm: pc.C, l_mm: pc.L, h_mm: pc.H, peso_kg: pc.peso, n_camadas: pc.nCamadas, base_piece_code: pc.base,
      camadas: pc.camadas, fitas: pc.fitas, avisos: pc.avisos,
      nicho: null, status: 'aberto', pallet_n: pc.palletN || null, pallet_pos: pc.palletPos || null };
  });
  const { data: salvos, error: e1 } = await erp.from('packages').insert(rowsPk).select('id, seq');
  if (e1) throw e1;
  const idPorSeq = {};
  (salvos || []).forEach(function (s) { idPorSeq[s.seq] = s.id; });

  const porCodigo = {};
  src.pecas.forEach(function (p) { porCodigo[p.codigo] = p; });
  const rowsPp = [];
  r.pacotes.forEach(function (pc) {
    pc.camadas.forEach(function (cam, ci) {
      cam.itens.forEach(function (it) {
        const p = porCodigo[it.codigo] || {};
        rowsPp.push({ package_id: idPorSeq[pc.seq], batch_id: batchId, piece_code: it.codigo, reference: p.ref || null,
          c_mm: p.c, l_mm: p.l, e_mm: p.e, color_name: p.cor || null, camada: ci + 1,
          x_mm: it.x, y_mm: it.y, w_mm: it.w, d_mm: it.d, rotated: !!it.rot });
      });
    });
  });
  for (let i = 0; i < rowsPp.length; i += 500) {
    const { error } = await erp.from('package_pieces').insert(rowsPp.slice(i, i + 500));
    if (error) throw error;
  }
  if (planos.length) {
    // itens do plano passam a apontar pro id/seq do pacote gravado (o id do
    // motor "V|módulo|idx" não existe no banco)
    const seqPorEngId = {};
    r.pacotes.forEach(function (pc) { seqPorEngId[pc.id] = pc.seq; });
    const troca = function (it) {
      const seq = seqPorEngId[it.id];
      return Object.assign({}, it, { id: idPorSeq[seq] || it.id, seq_lote: seq });
    };
    const { error } = await erp.from('pallet_plans').insert(planos.map(function (p) {
      const pallets = p.plano.pallets.map(function (pal) { return Object.assign({}, pal, { itens: pal.itens.map(troca) }); });
      const semLugar = p.plano.semLugar.map(function (id) { return idPorSeq[seqPorEngId[id]] || id; });
      return { batch_id: batchId, order_id: p.orderId, po_name: p.pedido || null, cfg: p.plano.cfg, plano: { pallets: pallets, semLugar: semLugar },
        n_pallets: pallets.length };
    }));
    if (error) throw error;
  }
  await LOTES.updateBatch(batchId, { volumes_created_at: new Date().toISOString(), volumes_opt: opt });

  return { pacotes: r.pacotes.length, pecas: src.pecas.length, grandes: r.pacotes.filter(function (p) { return p.tipo === 'grande'; }).length,
    pallets: planos.reduce(function (s, p) { return s + p.plano.pallets.length; }, 0), pedidos: planos.length,
    semLugar: planos.reduce(function (s, p) { return s + p.plano.semLugar.length; }, 0), avisos: r.avisos, fonte: src.fonte };
};

/* Tudo do lote pra tela de apontamento. */
PACOTES_DB.carregar = async function (batchId) {
  const erp = LOTES.erp();
  const [pk, pp, pl, b] = await Promise.all([
    erp.from('packages').select('*').eq('batch_id', batchId).order('seq'),
    erp.from('package_pieces').select('*').eq('batch_id', batchId).order('camada'),
    erp.from('pallet_plans').select('*').eq('batch_id', batchId),
    erp.from('batches').select('*').eq('id', batchId).maybeSingle()
  ]);
  [pk, pp, pl, b].forEach(function (r) { if (r.error) throw r.error; });
  const pacotes = pk.data || [];
  const porId = {};
  pacotes.forEach(function (p) { p.pecas = []; porId[p.id] = p; });
  (pp.data || []).forEach(function (r) { if (porId[r.package_id]) porId[r.package_id].pecas.push(r); });
  return { batch: b.data, pacotes: pacotes, pecas: pp.data || [], pallets: pl.data || [] };
};

/* Contagens pra tela do lote (barato). */
PACOTES_DB.resumo = async function (batchId) {
  const erp = LOTES.erp();
  const [pk, pp, pa, pl] = await Promise.all([
    erp.from('packages').select('id, status, tipo', { count: 'exact' }).eq('batch_id', batchId),
    erp.from('package_pieces').select('id', { count: 'exact', head: true }).eq('batch_id', batchId),
    erp.from('package_pieces').select('id', { count: 'exact', head: true }).eq('batch_id', batchId).not('apontado_at', 'is', null),
    erp.from('pallet_plans').select('n_pallets, po_name').eq('batch_id', batchId)
  ]);
  if (pk.error) throw pk.error;
  const ps = pk.data || [];
  return { pacotes: ps.length, grandes: ps.filter(function (p) { return p.tipo === 'grande'; }).length,
    completos: ps.filter(function (p) { return p.status !== 'aberto'; }).length,
    embalados: ps.filter(function (p) { return p.status === 'embalado'; }).length,
    pecas: pp.count || 0, apontadas: pa.count || 0,
    pallets: (pl.data || []).reduce(function (s, r) { return s + (r.n_pallets || 0); }, 0), pedidos: (pl.data || []).length };
};

/* Marca a peça como apontada. Devolve { peca, pacote, completou }. */
PACOTES_DB.apontar = async function (batchId, pieceCode) {
  const erp = LOTES.erp();
  const { data: pc, error } = await erp.from('package_pieces').select('*').eq('batch_id', batchId).eq('piece_code', pieceCode).maybeSingle();
  if (error) throw error;
  if (!pc) return null;
  const agora = new Date().toISOString();
  if (!pc.apontado_at) {
    const quem = (DATA.user && (DATA.user.email || DATA.user.id)) || null;
    const { error: e1 } = await erp.from('package_pieces').update({ apontado_at: agora, apontado_por: quem }).eq('id', pc.id);
    if (e1) throw e1;
    pc.apontado_at = agora;
  }
  // pacote completo?
  const { data: irmas, error: e2 } = await erp.from('package_pieces').select('id, apontado_at').eq('package_id', pc.package_id);
  if (e2) throw e2;
  const completou = (irmas || []).every(function (r) { return !!r.apontado_at; });
  if (completou) {
    const { error: e3 } = await erp.from('packages').update({ status: 'completo', completed_at: agora }).eq('id', pc.package_id).eq('status', 'aberto');
    if (e3) throw e3;
  }
  return { peca: pc, completou: completou };
};

PACOTES_DB.desapontar = async function (batchId, pieceCode) {
  const erp = LOTES.erp();
  const { data: pc, error } = await erp.from('package_pieces').update({ apontado_at: null, apontado_por: null })
    .eq('batch_id', batchId).eq('piece_code', pieceCode).select('id, package_id').maybeSingle();
  if (error) throw error;
  if (pc) {
    const { error: e1 } = await erp.from('packages').update({ status: 'aberto', completed_at: null, packed_at: null }).eq('id', pc.package_id);
    if (e1) throw e1;
  }
  return pc;
};

PACOTES_DB.setNicho = async function (pkgId, nicho) {
  const { error } = await LOTES.erp().from('packages').update({ nicho: nicho }).eq('id', pkgId);
  if (error) throw error;
};

PACOTES_DB.embalar = async function (pkgId) {
  const { error } = await LOTES.erp().from('packages').update({ status: 'embalado', packed_at: new Date().toISOString() }).eq('id', pkgId);
  if (error) throw error;
};

PACOTES_DB.desembalar = async function (pkgId) {
  const { error } = await LOTES.erp().from('packages').update({ status: 'completo', packed_at: null }).eq('id', pkgId);
  if (error) throw error;
};

/* Apaga tudo (volumes, peças, pallets) — "zerar". */
PACOTES_DB.apagar = async function (batchId) {
  const erp = LOTES.erp();
  let e;
  e = (await erp.from('packages').delete().eq('batch_id', batchId)).error; if (e) throw e;
  e = (await erp.from('pallet_plans').delete().eq('batch_id', batchId)).error; if (e) throw e;
  await LOTES.updateBatch(batchId, { volumes_created_at: null });
};
