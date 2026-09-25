/* Legno ERP — escritor mínimo de EMF (Enhanced Metafile) binário.
 *
 * POR QUE ISSO EXISTE
 * A pasta que a máquina de corte (Samach SawBean) espera tem etiqueta de
 * peça em .emf de verdade (formato vetorial do Windows) — não achamos
 * biblioteca JS nenhuma que ESCREVE esse formato (as que existem só leem,
 * pra converter EMF->PNG). Escrito na mão, mas testado batendo: gerado aqui,
 * revertido pra PNG num leitor de EMF de verdade e conferido visualmente
 * antes de ir pra máquina — não é só "não deu erro ao rodar".
 *
 * O QUE SUPORTA (só o que a etiqueta usa, de propósito — cada tipo de
 * registro EMF a mais é mais chance de errar o parser da máquina)
 *   { type:'rect', x, y, w, h }              — retângulo preto sólido
 *                                                (barra do código de barras)
 *   { type:'text', x, y, text, sizeMm, bold, align, face, color:[r,g,b] } — texto, fundo
 *       transparente. align: 'left' (padrão), 'right' ou 'center' — como
 *       EMF não dá acesso à métrica real da fonte instalada, a largura do
 *       texto é ESTIMADA por uma tabela de largura por caractere (Arial) e
 *       o x é deslocado antes de desenhar. Não é pixel-perfect, mas chega
 *       bem perto — o suficiente pra "material alinhado à direita" e
 *       "cliente centralizado" ficarem no lugar certo.
 * Coordenadas e tamanhos em mm, origem no canto superior esquerdo da
 * etiqueta — mesmo sistema que o resto do ERP já usa.
 */

const EMF = {};

/* Largura aproximada de cada caractere em Arial, em milésimos do tamanho
   da fonte (métrica pública padrão da família Helvetica/Arial) — usada só
   pra estimar onde parar um texto alinhado à direita/centralizado, já que
   EMF não expõe a métrica real da fonte instalada no leitor. Caractere fora
   da tabela (acento, símbolo raro) cai no padrão 550 — próximo da média das
   minúsculas, erro pequeno pro tamanho de uma etiqueta. */
const CHAR_WIDTH_1000 = {
  ' ': 278, '!': 278, '"': 355, '#': 556, '$': 556, '%': 889, '&': 667, "'": 191,
  '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278,
  '0': 556, '1': 556, '2': 556, '3': 556, '4': 556, '5': 556, '6': 556, '7': 556, '8': 556, '9': 556,
  ':': 278, ';': 278, '<': 584, '=': 584, '>': 584, '?': 556, '@': 1015,
  'A': 667, 'B': 667, 'C': 722, 'D': 722, 'E': 667, 'F': 611, 'G': 778, 'H': 722, 'I': 278,
  'J': 500, 'K': 667, 'L': 556, 'M': 833, 'N': 722, 'O': 778, 'P': 667, 'Q': 778, 'R': 722,
  'S': 667, 'T': 611, 'U': 722, 'V': 667, 'W': 944, 'X': 667, 'Y': 667, 'Z': 611,
  '[': 278, '\\': 278, ']': 278, '^': 469, '_': 556, '`': 333,
  'a': 556, 'b': 556, 'c': 500, 'd': 556, 'e': 556, 'f': 278, 'g': 556, 'h': 556, 'i': 222,
  'j': 222, 'k': 500, 'l': 222, 'm': 833, 'n': 556, 'o': 556, 'p': 556, 'q': 556, 'r': 333,
  's': 500, 't': 278, 'u': 556, 'v': 500, 'w': 722, 'x': 500, 'y': 500, 'z': 500,
  '{': 334, '|': 260, '}': 334, '~': 584
};
const CHAR_WIDTH_DEFAULT = 550;

EMF.estimateTextWidthMm = function (text, sizeMm, bold, face) {
  const str = String(text || '');
  if (/courier|mono/i.test(face || '')) return str.length * 0.6 * sizeMm; // monoespaçada: 0,6em por caractere
  let units = 0;
  for (let i = 0; i < str.length; i++) {
    units += CHAR_WIDTH_1000[str[i]] || CHAR_WIDTH_DEFAULT;
  }
  const widthMm = (units / 1000) * sizeMm;
  return bold ? widthMm * 1.06 : widthMm; // negrito Arial é ~6% mais largo, em média
};

const STOCK = { BLACK_BRUSH: 4, NULL_PEN: 8 };
function stockObj(idx) { return (0x80000000 | idx) >>> 0; }

/* ---- escritor de bytes portátil (sem Buffer — roda em qualquer browser) ---- */
function ByteWriter() { this.chunks = []; this.length = 0; }
ByteWriter.prototype._push = function (arr) { this.chunks.push(arr); this.length += arr.length; };
ByteWriter.prototype.u32 = function (v) {
  const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v >>> 0, true); this._push(b); return this;
};
ByteWriter.prototype.i32 = function (v) {
  const b = new Uint8Array(4); new DataView(b.buffer).setInt32(0, v | 0, true); this._push(b); return this;
};
ByteWriter.prototype.u16 = function (v) {
  const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, v & 0xffff, true); this._push(b); return this;
};
ByteWriter.prototype.f32 = function (v) {
  const b = new Uint8Array(4); new DataView(b.buffer).setFloat32(0, v, true); this._push(b); return this;
};
ByteWriter.prototype.bytes = function (arr) { this._push(arr instanceof Uint8Array ? arr : new Uint8Array(arr)); return this; };
ByteWriter.prototype.rcl = function (l, t, r, b) { return this.i32(l).i32(t).i32(r).i32(b); };
ByteWriter.prototype.toBytes = function () {
  const out = new Uint8Array(this.length);
  let off = 0;
  this.chunks.forEach(function (c) { out.set(c, off); off += c.length; });
  return out;
};

function concatBytes(list) {
  let len = 0; list.forEach(function (a) { len += a.length; });
  const out = new Uint8Array(len); let off = 0;
  list.forEach(function (a) { out.set(a, off); off += a.length; });
  return out;
}
function pad4(bytes) {
  const rem = bytes.length % 4;
  return rem === 0 ? bytes : concatBytes([bytes, new Uint8Array(4 - rem)]);
}
function utf16le(str) {
  const out = new Uint8Array(str.length * 2);
  const dv = new DataView(out.buffer);
  for (let i = 0; i < str.length; i++) dv.setUint16(i * 2, str.charCodeAt(i), true);
  return out;
}

/* ---- registros EMF ---- */
/* Cabeçalho no MESMO molde dos .emf do software da máquina (lidos do
   exemplo Lote_508, 21/09-14): nSize=108 (com as extensões de pixel format
   e micrômetros), dispositivo de referência = monitor 1920x1080 px de
   698x393 mm (2,75 px/mm), rclBounds em pixel desse monitor e rclFrame em
   0,01mm — o deles declara 103,6 x 69,1 mm mesmo pra etiqueta de 3"x2", e
   o software da impressora escala pra etiqueta. A primeira versão daqui
   declarava 76,2 x 50,8 com 100 px/mm de "dispositivo"; na impressão
   durante o corte a impressora não avançava a etiqueta inteira (foto do
   Matt) — a única diferença entre os arquivos era esse cabeçalho, então
   agora é igual ao que já funciona lá. */
const REF_DEVICE = { pxW: 1920, pxH: 1080, mmW: 698, mmH: 393 }; // 2.7507 px/mm
const REF_FRAME_HMM = { w: 10361, h: 6914 };                    // 103,61 x 69,14 mm

function recHeader(boundsPx, frameHmm) {
  const w = new ByteWriter();
  w.rcl(boundsPx.l, boundsPx.t, boundsPx.r, boundsPx.b);
  w.rcl(frameHmm.l, frameHmm.t, frameHmm.r, frameHmm.b);
  w.u32(0x464d4520).u32(0x00010000);
  w.u32(0).u32(0); // nBytes, nRecords — preenchidos depois
  w.u16(4).u16(0);
  w.u32(0).u32(0);
  w.u32(0);
  w.u32(REF_DEVICE.pxW).u32(REF_DEVICE.pxH);
  w.u32(REF_DEVICE.mmW).u32(REF_DEVICE.mmH);
  // Extensão 1: cbPixelFormat, offPixelFormat, bOpenGL
  w.u32(0).u32(0).u32(0);
  // Extensão 2: szlMicrometers
  w.u32(REF_DEVICE.mmW * 1000).u32(REF_DEVICE.mmH * 1000);
  const body = w.toBytes();
  return concatBytes([new ByteWriter().u32(1).u32(8 + body.length).toBytes(), body]);
}
function recSetMapMode(mode) { return new ByteWriter().u32(17).u32(12).u32(mode).toBytes(); }
function recSetWindowExtEx(cx, cy) { return new ByteWriter().u32(9).u32(16).i32(cx).i32(cy).toBytes(); }
function recSetViewportExtEx(cx, cy) { return new ByteWriter().u32(11).u32(16).i32(cx).i32(cy).toBytes(); }
function recEof() { return new ByteWriter().u32(14).u32(20).u32(0).u32(16).u32(20).toBytes(); }
function recSelectObject(ih) { return new ByteWriter().u32(37).u32(12).u32(ih).toBytes(); }
function recDeleteObject(ih) { return new ByteWriter().u32(40).u32(12).u32(ih).toBytes(); }
function recSetBkMode(mode) { return new ByteWriter().u32(18).u32(12).u32(mode).toBytes(); }
function recSetTextColor(r, g, b) { return new ByteWriter().u32(24).u32(12).bytes([r, g, b, 0]).toBytes(); }
function recRectangle(x, y, w, h) { return new ByteWriter().u32(43).u32(24).rcl(x, y, x + w, y + h).toBytes(); }

function recCreateFont(ihFont, heightHmm, faceName, bold) {
  const face16 = new Uint8Array(64);
  const faceBytes = utf16le(faceName);
  face16.set(faceBytes.subarray(0, Math.min(62, faceBytes.length)), 0);
  const logfont = concatBytes([
    new ByteWriter().i32(-Math.abs(heightHmm)).i32(0).i32(0).i32(0).i32(bold ? 700 : 400).toBytes(),
    new Uint8Array([0, 0, 0, 1, 0, 0, 0, 0]),
    face16
  ]); // 20 + 8 + 64 = 92 bytes
  const body = concatBytes([new ByteWriter().u32(ihFont).toBytes(), logfont]);
  return concatBytes([new ByteWriter().u32(82).u32(8 + body.length).toBytes(), body]);
}

function recExtTextOutW(x, y, text) {
  /* nChars = quantidade de caracteres do texto, SEM terminador: a string
     não precisa (nem deve) terminar em nulo — só o registro é alinhado em
     4 bytes. Antes contava +1 e incluía o U+0000; o LibreOffice ignorava,
     mas a impressora de etiqueta desenhava o nulo como um quadradinho
     depois de toda palavra (foto do Matt, 21/09-10). */
  const strBuf = pad4(utf16le(text));
  const nChars = text.length;
  const headerLen = 36;      // iType,nSize,rclBounds,iGraphicsMode,exScale,eyScale
  const emrtextFixedLen = 40; // ptlReference,nChars,offString,fOptions,rcl,offDx
  const offString = headerLen + emrtextFixedLen;
  const emrtext = new ByteWriter()
    .i32(x).i32(y)
    .u32(nChars).u32(offString).u32(0)
    .rcl(0, 0, -1, -1)
    .u32(0)
    .toBytes();
  const bodyW = new ByteWriter();
  bodyW.rcl(0, 0, -1, -1);
  bodyW.i32(1).f32(1.0).f32(1.0);
  const body = concatBytes([bodyW.toBytes(), emrtext, strBuf]);
  return concatBytes([new ByteWriter().u32(84).u32(8 + body.length).toBytes(), body]);
}

EMF.build = function (opts) {
  const widthHmm = Math.round(opts.widthMm * 100);
  const heightHmm = Math.round(opts.heightMm * 100);
  /* Desenho continua em 0,01mm (unidade lógica); o mapa anisotrópico abaixo
     leva a etiqueta inteira (widthHmm x heightHmm) pro quadro de referência
     (REF_FRAME_HMM em px do monitor de referência), igual ao do exemplo. */
  const pxPerMm = REF_DEVICE.pxW / REF_DEVICE.mmW;
  const frame = { l: 0, t: 0, r: REF_FRAME_HMM.w, b: REF_FRAME_HMM.h };
  const bounds = { l: 0, t: 0, r: Math.round(REF_FRAME_HMM.w / 100 * pxPerMm), b: Math.round(REF_FRAME_HMM.h / 100 * pxPerMm) };

  const records = [];
  records.push(recSetMapMode(8)); // MM_ANISOTROPIC
  records.push(recSetWindowExtEx(widthHmm, heightHmm));
  records.push(recSetViewportExtEx(bounds.r, bounds.b));
  records.push(recSetBkMode(1));
  records.push(recSelectObject(stockObj(STOCK.NULL_PEN)));
  records.push(recSetTextColor(0, 0, 0));
  records.push(recSelectObject(stockObj(STOCK.BLACK_BRUSH)));

  /* Fontes: uma por combinação tamanho/negrito/família, criada na primeira
     vez e REAPROVEITADA depois (mesmo handle) — antes criava uma nova a cada
     troca, e o cabeçalho dizia nHandles=4 fixo: leitor tolerante (LibreOffice)
     ignorava, leitor estrito (o visualizador do Matt, 21/09-8) recusava
     criar o 4º handle em diante e o texto saía sem negrito. nHandles agora é
     gravado no fim com o total real. */
  let nextHandle = 1;
  const fontByKey = {};
  let currentFontHandle = null;
  let currentColor = '0,0,0';

  (opts.ops || []).forEach(function (op) {
    if (op.type === 'rect') {
      records.push(recRectangle(Math.round(op.x * 100), Math.round(op.y * 100), Math.round(op.w * 100), Math.round(op.h * 100)));
    } else if (op.type === 'text' && op.text) {
      const sizeHmm = Math.round((op.sizeMm || 3) * 100);
      const face = op.face || 'Arial';
      const key = sizeHmm + '|' + (op.bold ? 1 : 0) + '|' + face;
      if (!fontByKey[key]) {
        const h = nextHandle++;
        records.push(recCreateFont(h, sizeHmm, face, !!op.bold));
        fontByKey[key] = h;
      }
      if (currentFontHandle !== fontByKey[key]) {
        records.push(recSelectObject(fontByKey[key]));
        currentFontHandle = fontByKey[key];
      }
      const col = (op.color || [0, 0, 0]).join(',');
      if (col !== currentColor) {
        const rgb = op.color || [0, 0, 0];
        records.push(recSetTextColor(rgb[0], rgb[1], rgb[2]));
        currentColor = col;
      }
      let drawX = op.x;
      if (op.align === 'right' || op.align === 'center') {
        const w = EMF.estimateTextWidthMm(op.text, op.sizeMm || 3, !!op.bold, face);
        drawX = op.align === 'right' ? (op.x - w) : (op.x - w / 2);
      }
      records.push(recExtTextOutW(Math.round(drawX * 100), Math.round(op.y * 100), String(op.text)));
    }
  });

  Object.keys(fontByKey).forEach(function (k) { records.push(recDeleteObject(fontByKey[k])); });
  records.push(recEof());

  const body = concatBytes(records);
  const header = recHeader(bounds, frame);
  const nRecords = records.length + 1;
  const nBytes = header.length + body.length;

  const full = concatBytes([header, body]);
  const dv = new DataView(full.buffer);
  dv.setUint32(48, nBytes, true);
  dv.setUint32(52, nRecords, true);
  dv.setUint16(56, nextHandle, true); // nHandles = índice 0 reservado + fontes criadas
  return full;
};

if (typeof module !== 'undefined') module.exports = EMF;
