/* Legno ERP — exportação do plano de corte para a máquina.
 *
 * ==========================================================================
 * O FORMATO DA SAMACH AINDA NÃO ESTÁ CONFIRMADO
 * ==========================================================================
 * Seccionadora não tem formato universal: cada fabricante lê o seu (Ardis
 * .PTX, Optiplanning, CSV proprietário, XML...). Enquanto o formato exato da
 * SAMACH não estiver na mão (arquivo de exemplo ou o manual do software de
 * importação dela), este arquivo entrega o que funciona em QUALQUER caso:
 *
 *   1. Lista de peças (CSV)     — praticamente todo software de otimização de
 *                                 seccionadora importa uma lista assim. Se a
 *                                 SAMACH otimiza internamente, é só isso que
 *                                 ela precisa.
 *   2. Padrões de corte (CSV)   — o plano JÁ otimizado, chapa a chapa, com a
 *                                 posição de cada peça em mm. Serve pra
 *                                 conferência, pra importador que aceita
 *                                 coordenada, e pra provar o aproveitamento.
 *   3. Etiquetas (CSV)          — uma linha por peça física com o código de
 *                                 barras, pro software de etiqueta da máquina.
 *
 * ACRESCENTAR O FORMATO NATIVO É UMA FUNÇÃO SÓ: escreva build(plan) devolvendo
 * texto e registre em EXPORTC.formats. Nada mais no ERP precisa mudar — a tela
 * lista os formatos a partir desse array.
 */

const EXPORTC = {};

EXPORTC._csvCell = function (v) {
  const s = String(v == null ? '' : v);
  return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

/* Ponto e vírgula, não vírgula: é o separador que Excel em português abre
   direto, e software de máquina no Brasil espera. */
EXPORTC._csv = function (rows) {
  return rows.map(function (r) { return r.map(EXPORTC._csvCell).join(';'); }).join('\r\n');
};

EXPORTC.formats = [
  {
    id: 'pecas',
    label: 'Lista de peças (CSV)',
    hint: 'Para o software da seccionadora otimizar por conta própria.',
    ext: 'csv',
    build: function (plan) {
      // Pedido/Modulo_num (migration 157) — mesmo pedido do Matt (21/09)
      // que motivou a etiqueta: "numero do modulo conforme listagem" e
      // "numero do pedido".
      const rows = [['Codigo', 'Pedido', 'Cliente', 'Modulo', 'Modulo_num', 'Referencia', 'Comprimento_mm',
        'Largura_mm', 'Espessura_mm', 'Cor', 'Veio', 'Fita_lados', 'Fita_m', 'Quantidade']];
      /* Uma linha por peça física. Quantidade fica sempre 1 de propósito: o
         plano já posicionou cada unidade, e cada unidade tem código próprio
         (é o que a etiqueta e o apontamento usam pra rastrear). */
      plan._pieces.forEach(function (p) {
        rows.push([p.piece_code, p.po_name || '', p.client_name || '', p.module_name || '', p.module_number || '',
          p.reference || '', Math.round(p.w_mm), Math.round(p.h_mm), p.espessura_mm || '', p.color_name || '',
          p.has_grain ? 'SIM' : 'NAO', p.edge_banding || 0,
          (Number(p.edge_band_m) || 0).toFixed(3), 1]);
      });
      return EXPORTC._csv(rows);
    }
  },
  {
    id: 'padroes',
    label: 'Padrões de corte (CSV)',
    hint: 'O plano já otimizado: chapa a chapa, posição de cada peça em mm.',
    ext: 'csv',
    build: function (plan) {
      const rows = [['Chapa', 'Origem', 'Chapa_nome', 'Chapa_L_mm', 'Chapa_A_mm', 'Cor', 'Espessura_mm',
        'Aproveitamento_pct', 'Peca_codigo', 'X_mm', 'Y_mm', 'L_mm', 'A_mm', 'Girada', 'Referencia', 'Modulo', 'Cliente']];
      plan._sheets.forEach(function (s) {
        (s._pieces || []).forEach(function (p) {
          rows.push([s.index_no, s.source === 'retalho' ? 'RETALHO' : 'CHAPA', s.sheet_size_name || '',
            Math.round(s.width_mm), Math.round(s.height_mm), s.color_name || '', s.espessura_mm,
            Number(s.used_pct).toFixed(1), p.piece_code, Math.round(p.x_mm), Math.round(p.y_mm),
            Math.round(p.w_mm), Math.round(p.h_mm), p.rotated ? 'SIM' : 'NAO',
            p.reference || '', p.module_name || '', p.client_name || '']);
        });
        /* Sobras entram como linha marcada — o operador vê na planilha o que
           deve sair da chapa e ir pra prateleira em vez de pro lixo. */
        (s.offcuts_json || []).forEach(function (r) {
          rows.push([s.index_no, s.source === 'retalho' ? 'RETALHO' : 'CHAPA', s.sheet_size_name || '',
            Math.round(s.width_mm), Math.round(s.height_mm), s.color_name || '', s.espessura_mm,
            Number(s.used_pct).toFixed(1), 'SOBRA', Math.round(r.x), Math.round(r.y),
            Math.round(r.w), Math.round(r.h), 'NAO', 'RETALHO APROVEITAVEL', '', '']);
        });
      });
      return EXPORTC._csv(rows);
    }
  },
  {
    id: 'etiquetas',
    label: 'Etiquetas (CSV)',
    hint: 'Uma linha por peça, pro software de etiqueta da máquina.',
    ext: 'csv',
    build: function (plan) {
      // Texto2/Texto3 ganham o pedido (po_name) e o número do módulo
      // (migration 157) — mesma informação que a folha impressa
      // (LOTES_UI.labels) agora mostra.
      const rows = [['Codigo_barras', 'Texto1', 'Texto2', 'Texto3', 'Texto4', 'Chapa']];
      const sheetByPiece = {};
      plan._sheets.forEach(function (s) { (s._pieces || []).forEach(function (p) { sheetByPiece[p.id] = s; }); });
      plan._pieces.forEach(function (p) {
        const s = sheetByPiece[p.id];
        rows.push([
          p.piece_code,
          (p.po_name ? p.po_name + ' · ' : '') + (p.client_name || ''),
          (p.module_name || '') + (p.module_number ? ' (Mód. ' + p.module_number + ')' : '') +
            (p.reference ? ' · ' + p.reference : ''),
          Math.round(p.w_mm) + ' x ' + Math.round(p.h_mm) + ' x ' + (p.espessura_mm || '?') + ' mm',
          (p.color_name || '') + (p.edge_banding ? ' · fita ' + p.edge_banding + ' lados' : ''),
          s ? s.index_no : ''
        ]);
      });
      return EXPORTC._csv(rows);
    }
  }
];

EXPORTC.download = function (plan, formatId) {
  const fmt = EXPORTC.formats.find(function (f) { return f.id === formatId; });
  if (!fmt) return;
  const text = fmt.build(plan);
  /* BOM na frente: sem ele o Excel abre "Móvel" como "MÃ³vel". */
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (plan.code || 'plano') + '-' + fmt.id + '.' + fmt.ext;
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
};
