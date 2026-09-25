/* Legno ERP — código de barras Code 39 em SVG puro.
 *
 * POR QUE CODE 39 E NÃO CODE 128
 * O Code 128 é mais compacto, mas a tabela dele tem 107 padrões — errar UM
 * dígito da tabela gera etiqueta que imprime bonito e escaneia errado, e
 * ninguém descobre até a peça errada chegar na coladeira. O Code 39 tem 44
 * caracteres, padrão simples (9 elementos, 3 largos), e cobre exatamente o que
 * a gente usa: A-Z, 0-9 e hífen (PC-000123, LT-26-0007). Qualquer leitor de
 * mão lê Code 39 sem configurar nada. Fica mais largo — e é o trade certo
 * numa etiqueta de peça de móvel, onde sobra espaço.
 *
 * Sem dependência e sem CDN: o ERP abre em file://.
 */

const BARCODE = {};

/* Cada padrão tem 9 elementos alternando barra/espaço, começando em BARRA.
   'n' = estreito, 'w' = largo. */
BARCODE.CODE39 = {
  '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '2': 'nnwwnnnnw', '3': 'wnwwnnnnn',
  '4': 'nnnwwnnnw', '5': 'wnnwwnnnn', '6': 'nnwwwnnnn', '7': 'nnnwnnwnw',
  '8': 'wnnwnnwnn', '9': 'nnwwnnwnn',
  'A': 'wnnnnwnnw', 'B': 'nnwnnwnnw', 'C': 'wnwnnwnnn', 'D': 'nnnnwwnnw',
  'E': 'wnnnwwnnn', 'F': 'nnwnwwnnn', 'G': 'nnnnnwwnw', 'H': 'wnnnnwwnn',
  'I': 'nnwnnwwnn', 'J': 'nnnnwwwnn', 'K': 'wnnnnnnww', 'L': 'nnwnnnnww',
  'M': 'wnwnnnnwn', 'N': 'nnnnwnnww', 'O': 'wnnnwnnwn', 'P': 'nnwnwnnwn',
  'Q': 'nnnnnnwww', 'R': 'wnnnnnwwn', 'S': 'nnwnnnwwn', 'T': 'nnnnwnwwn',
  'U': 'wwnnnnnnw', 'V': 'nwwnnnnnw', 'W': 'wwwnnnnnn', 'X': 'nwnnwnnnw',
  'Y': 'wwnnwnnnn', 'Z': 'nwwnwnnnn',
  '-': 'nwnnnnwnw', '.': 'wwnnnnwnn', ' ': 'nwwnnnnwn',
  '$': 'nwnwnwnnn', '/': 'nwnwnnnwn', '+': 'nwnnnwnwn', '%': 'nnnwnwnwn',
  '*': 'nwnnwnwnn'   // start/stop
};

/* Desenha o código. Opções:
     height  — altura das barras em px (default 34)
     narrow  — largura da barra estreita em px (default 1.6)
     ratio   — largura/estreita (default 2.6; 2 a 3 é a faixa segura)
     text    — mostrar o texto embaixo (default true) */
/* Mesma barra do Code 39, mas devolve os retângulos das barras pretas
   direto (sem montar SVG) — usado na exportação pra máquina de corte
   (etiqueta em .emf, que não tem elemento <rect> nenhum, é registro binário
   de retângulo mesmo) pra não duplicar a tabela/lógica de padrão em outro
   lugar. Mesmas opções de BARCODE.svg (height, narrow, ratio); devolve
   { rects:[{x,y,w,h}], totalWidth, totalHeight }. */
BARCODE.rects = function (value, opts) {
  opts = opts || {};
  const height = opts.height || 34;
  const narrow = opts.narrow || 1.6;
  const wide = narrow * (opts.ratio || 2.6);

  const raw = String(value == null ? '' : value).toUpperCase();
  const chars = ('*' + raw + '*').split('').map(function (c) {
    return BARCODE.CODE39[c] ? c : (c === '*' ? '*' : '-');
  });

  let x = 0;
  const rects = [];
  chars.forEach(function (c, ci) {
    const pattern = BARCODE.CODE39[c];
    for (let i = 0; i < 9; i++) {
      const w = pattern[i] === 'w' ? wide : narrow;
      if (i % 2 === 0) rects.push({ x: x, y: 0, w: w, h: height });
      x += w;
    }
    if (ci < chars.length - 1) x += narrow;
  });

  return { rects: rects, totalWidth: x, totalHeight: height };
};

BARCODE.svg = function (value, opts) {
  opts = opts || {};
  const height = opts.height || 34;
  const narrow = opts.narrow || 1.6;
  const wide = narrow * (opts.ratio || 2.6);
  const showText = opts.text !== false;

  /* Code 39 é maiúsculo. Caractere fora da tabela vira hífen em vez de
     derrubar a etiqueta inteira — etiqueta com um traço a mais ainda serve;
     etiqueta que não imprime, não. */
  const raw = String(value == null ? '' : value).toUpperCase();
  const chars = ('*' + raw + '*').split('').map(function (c) {
    return BARCODE.CODE39[c] ? c : (c === '*' ? '*' : '-');
  });

  let x = 0;
  const bars = [];
  chars.forEach(function (c, ci) {
    const pattern = BARCODE.CODE39[c];
    for (let i = 0; i < 9; i++) {
      const w = pattern[i] === 'w' ? wide : narrow;
      if (i % 2 === 0) {
        bars.push('<rect x="' + x.toFixed(2) + '" y="0" width="' + w.toFixed(2) + '" height="' + height + '" fill="#000"/>');
      }
      x += w;
    }
    if (ci < chars.length - 1) x += narrow; // espaço entre caracteres
  });

  const totalH = height + (showText ? 13 : 0);
  return '<svg viewBox="0 0 ' + x.toFixed(2) + ' ' + totalH + '" width="' + x.toFixed(2) + '" height="' + totalH +
    '" style="max-width:100%" shape-rendering="crispEdges">' + bars.join('') +
    (showText
      ? '<text x="' + (x / 2).toFixed(2) + '" y="' + (height + 11) +
        '" font-family="monospace" font-size="10" text-anchor="middle" fill="#000">' + UI.esc(raw) + '</text>'
      : '') +
    '</svg>';
};
