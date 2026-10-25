"""Gera as texturas de PEDRA da bancada (countertop) do portal — procedurais,
seamless, escala real. Mesmo princípio de gerar-texturas-piso.py.

Cada imagem cobre TILE_MM x TILE_MM de pedra de verdade e repete sem emenda.
Aparência APROXIMADA da pedra/linha de referência (nome comercial só como
referência de cor/padrão — confirmar a chapa real com a marmoraria).
Saída: out-pedras/<id>.jpg, <id>_thumb.jpg e catalog.json.
"""
import json, math, os
import numpy as np
from PIL import Image

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out-pedras')
os.makedirs(OUT, exist_ok=True)
TILE_MM = 1500
MM_PX = 1.5
S = int(round(TILE_MM / MM_PX))  # 1000 px


def rng(seed):
    return np.random.default_rng(seed)


def pnoise(h, w, sy, sx, seed, octaves=1):
    """Ruído PERIÓDICO (seamless) filtrado na frequência. sy/sx = tamanho das manchas (px)."""
    r = rng(seed)
    out = np.zeros((h, w))
    amp = 1.0
    ky = np.fft.fftfreq(h)[:, None]
    kx = np.fft.fftfreq(w)[None, :]
    for o in range(octaves):
        n = r.standard_normal((h, w))
        f = np.exp(-((ky * sy) ** 2 + (kx * sx) ** 2) * 6)
        v = np.real(np.fft.ifft2(np.fft.fft2(n) * f))
        v = (v - v.mean()) / (v.std() + 1e-9)
        out += v * amp
        amp *= 0.5
        sy, sx = sy / 2, sx / 2
    return (out - out.mean()) / (out.std() + 1e-9)


def blur_periodic(a, s):
    """Desfoque gaussiano periódico (s em px)."""
    ky = np.fft.fftfreq(a.shape[0])[:, None]
    kx = np.fft.fftfreq(a.shape[1])[None, :]
    f = np.exp(-2 * (math.pi * s) ** 2 * (ky ** 2 + kx ** 2))
    return np.real(np.fft.ifft2(np.fft.fft2(a) * f))


def c(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=float)


YY, XX = np.mgrid[0:S, 0:S].astype(float)


def mix(img, col, a):
    a = np.clip(a, 0, 1)[..., None]
    return img * (1 - a) + col[None, None, :] * a


def nuvem(img, seed, amt, escala=260):
    n = pnoise(S, S, escala, escala, seed, octaves=4)
    return img * (1 + amt * n[..., None])


def veios(img, seed, cor, forca, largura, kx, ky, turb=0.7, turb_esc=220, presenca=0.55, ramos=0.0):
    """Veio de pedra: faixa LONGA e diagonal (nº inteiro de ciclos -> seamless)
    com deformação suave em 2 escalas (domain warp), espessura irregular,
    miolo + halo difuso, e trechos que somem (presenca). 2ª versão 25/10: a
    1ª tinha turbulência forte demais e virava "curva de nível" (laços)."""
    r = rng(seed)
    W1 = pnoise(S, S, 520, 520, seed, octaves=3)          # curva larga do veio
    W2 = pnoise(S, S, 140, 140, seed + 1, octaves=4)      # tremido fino
    t = min(turb, 1.0)
    fase = kx * XX / S + ky * YY / S + 0.45 * t * W1 + 0.12 * t * W2
    v = np.abs(np.sin(math.pi * fase))                    # 0 no centro do veio
    esp = largura * np.exp(0.55 * pnoise(S, S, 300, 300, seed + 2, octaves=2))   # espessura varia
    miolo = np.exp(-(v / (esp * 0.9)) ** 1.6)
    halo = np.exp(-v / (esp * 5.0)) * 0.30
    linha = np.clip(miolo + halo, 0, 1)
    if presenca < 1:
        P = pnoise(S, S, 600, 600, seed + 7, octaves=2)
        thr = np.quantile(P, 1 - presenca)
        linha *= np.clip((P - thr) / 0.8 + 0.25, 0, 1)
    if ramos > 0:   # veiozinhos finos que correm junto do principal
        fase2 = fase * 2 + 0.35 * pnoise(S, S, 120, 120, seed + 11, octaves=3)
        v2 = np.abs(np.sin(math.pi * fase2))
        f2 = np.exp(-(v2 / (largura * 0.35)) ** 1.4) * np.exp(-v / 0.30)
        linha = np.maximum(linha, ramos * 0.6 * f2)
    return mix(img, c(cor), forca * linha)


def graos(img, seed, cor, frac, grao, nitidez=0.12, var=0.10):
    """Cristais (granito): manchas periódicas limiarizadas ocupando ~frac da área."""
    n = pnoise(S, S, grao, grao, seed, octaves=2)
    thr = np.quantile(n, 1 - frac)
    m = np.clip((n - thr) / nitidez, 0, 1)
    tom = 1 + var * pnoise(S, S, max(1.0, grao / 3), max(1.0, grao / 3), seed + 3)
    col = c(cor)[None, None, :] * tom[..., None]
    return img * (1 - m[..., None]) + col * m[..., None]


def pintas(img, seed, cor, dens, tam=1.0, forca=1.0):
    """Pintinhas soltas (quartzo/sal e pimenta)."""
    r = rng(seed)
    m = (r.random((S, S)) < dens).astype(float)
    if tam > 0.6:
        m = blur_periodic(m, tam)
        m = m / (m.max() + 1e-9)
    return mix(img, c(cor), forca * np.clip(m * 1.6, 0, 1))


def brilho(img, seed, dens=0.0015, forca=0.35):
    r = rng(seed)
    m = (r.random((S, S)) < dens).astype(float)
    return img * (1 + forca * m[..., None])


def olhos(img, seed, cor_miolo, cor_borda, frac=0.35, grao=26):
    """Ovóides do Baltic Brown: miolo + anel escuro."""
    n = pnoise(S, S, grao, grao, seed, octaves=1)
    thr = np.quantile(n, 1 - frac)
    miolo = np.clip((n - thr) / 0.15, 0, 1)
    anel = np.exp(-((n - thr) / 0.10) ** 2)
    img = mix(img, c(cor_miolo), miolo * 0.9)
    return mix(img, c(cor_borda), anel * 0.85)


def faixas(img, seed, c1, c2, esc_y=10, esc_x=260, forca=1.0):
    """Faixas horizontais (travertino)."""
    b = pnoise(S, S, esc_y, esc_x, seed, octaves=3)
    t = np.clip(0.5 + 0.35 * b, 0, 1)[..., None]
    alvo = c(c1)[None, None, :] * (1 - t) + c(c2)[None, None, :] * t
    return img * (1 - forca) + alvo * forca


def poros(img, seed, cor, frac=0.03, esc_y=2.5, esc_x=9):
    n = pnoise(S, S, esc_y, esc_x, seed, octaves=1)
    thr = np.quantile(n, 1 - frac)
    return mix(img, c(cor), np.clip((n - thr) / 0.25, 0, 1) * 0.8)


def base(cor):
    return np.zeros((S, S, 3)) + c(cor)


def salvar(img, fid):
    a = np.clip(img, 0, 255).astype(np.uint8)
    im = Image.fromarray(a, 'RGB')
    im.save(os.path.join(OUT, fid + '.jpg'), quality=86, optimize=True, progressive=True)
    th = im.resize((240, 240), Image.LANCZOS).crop((0, 0, 240, 240)).resize((96, 96), Image.LANCZOS)
    th.save(os.path.join(OUT, fid + '_thumb.jpg'), quality=84)


# ------------------------------------------------------------------ receitas
def marmore_branco(seed, fundo, v1, v2=None, forte=0.75, larg=0.035, k=(2, 1), turb=0.8, nuv=0.025, finos=0.35, presenca=0.6, ouro=None):
    img = nuvem(base(fundo), seed, nuv)
    img = veios(img, seed + 1, v1, forte, larg, k[0], k[1], turb=turb, presenca=presenca, ramos=0.5)
    if v2:
        img = veios(img, seed + 2, v2, finos, larg * 0.45, k[0] * 2 + 1, k[1] * 2 - 1, turb=turb * 1.3, turb_esc=140, presenca=0.7)
    if ouro:
        img = veios(img, seed + 3, ouro, 0.55, larg * 0.6, k[0] + 1, k[1], turb=turb * 1.1, presenca=0.45)
    return img


def granito(seed, fundo, minerais, nuv=0.04, brilho_d=0.0):
    img = nuvem(base(fundo), seed, nuv, escala=120)
    for i, (cor, frac, grao) in enumerate(minerais):
        img = graos(img, seed + 10 + i * 7, cor, frac, grao)
    if brilho_d:
        img = brilho(img, seed + 99, brilho_d)
    return img


def quartzo_pintas(seed, fundo, pint, nuv=0.012):
    img = nuvem(base(fundo), seed, nuv)
    for i, (cor, dens, tam) in enumerate(pint):
        img = pintas(img, seed + 20 + i, cor, dens, tam)
    return img


def travertino(seed, c1, c2, poro):
    img = faixas(base(c1), seed, c1, c2)
    img = nuvem(img, seed + 1, 0.025, escala=80)
    img = poros(img, seed + 2, poro)
    return img


def concreto(seed, fundo):
    img = nuvem(base(fundo), seed, 0.06, escala=200)
    img = nuvem(img, seed + 1, 0.025, escala=8)
    img = poros(img, seed + 2, '#7d7a75', frac=0.004, esc_y=1.6, esc_x=1.6)
    return img


CAT = []
G = {'quartz': 'quartz', 'granite': 'granite', 'marble': 'marble', 'quartzite': 'quartzite', 'travertine': 'travertine', 'other': 'other'}


def add(fid, grupo, nome_pt, nome_en, nome_es, img, rough):
    salvar(img, fid)
    CAT.append({'id': fid, 'g': grupo, 'n': {'pt': nome_pt, 'en': nome_en, 'es': nome_es}, 't': TILE_MM, 'r': rough})
    print(fid)


def main():
    # ---------------- QUARTZO (linhas de referência das marcas) ----------------
    add('cambria-brittanicca', 'quartz', 'Cambria Brittanicca', 'Cambria Brittanicca', 'Cambria Brittanicca',
        marmore_branco(11, '#f2f1ee', '#5f6064', '#a5a6a8', forte=0.85, larg=0.03, k=(1, 2), turb=0.9), 0.22)
    add('cambria-brittanicca-gold', 'quartz', 'Cambria Brittanicca Gold', 'Cambria Brittanicca Gold', 'Cambria Brittanicca Gold',
        marmore_branco(12, '#f3f0ea', '#6a6a6b', '#b4b1aa', forte=0.75, larg=0.03, k=(1, 2), ouro='#b48b4c'), 0.22)
    add('cambria-torquay', 'quartz', 'Cambria Torquay', 'Cambria Torquay', 'Cambria Torquay',
        quartzo_pintas(13, '#ecebe7', [('#9a968f', 0.006, 1.2), ('#c9c6bf', 0.02, 0.9), ('#6f6b66', 0.0015, 1.0)]), 0.25)
    add('cambria-swanbridge', 'quartz', 'Cambria Swanbridge', 'Cambria Swanbridge', 'Cambria Swanbridge',
        marmore_branco(14, '#f1f0ed', '#9c9d9f', '#c4c4c4', forte=0.45, larg=0.05, k=(2, 1), turb=1.1, presenca=0.75), 0.22)
    add('cambria-ella', 'quartz', 'Cambria Ella', 'Cambria Ella', 'Cambria Ella',
        marmore_branco(15, '#f0eeea', '#80807f', '#b9b2a6', forte=0.6, larg=0.04, k=(2, 3)), 0.22)
    add('cambria-skara-brae', 'quartz', 'Cambria Skara Brae', 'Cambria Skara Brae', 'Cambria Skara Brae',
        marmore_branco(16, '#efece5', '#9b9284', '#c3bcae', forte=0.5, larg=0.04, k=(3, 1), turb=1.0), 0.25)
    add('silestone-calacatta-gold', 'quartz', 'Silestone Calacatta Gold', 'Silestone Calacatta Gold', 'Silestone Calacatta Gold',
        marmore_branco(21, '#f4f2ee', '#77736c', '#b9b3a8', forte=0.7, larg=0.032, k=(1, 2), ouro='#c09a5b'), 0.2)
    add('silestone-eternal-marquina', 'quartz', 'Silestone Eternal Marquina', 'Silestone Eternal Marquina', 'Silestone Eternal Marquina',
        marmore_branco(22, '#1d1d1f', '#e7e6e2', '#9b9a98', forte=0.8, larg=0.018, k=(2, 3), turb=0.9, nuv=0.06, presenca=0.65), 0.2)
    add('silestone-charcoal-soapstone', 'quartz', 'Silestone Charcoal Soapstone', 'Silestone Charcoal Soapstone', 'Silestone Charcoal Soapstone',
        marmore_branco(23, '#3b3c3e', '#7d7e80', '#5a5b5d', forte=0.45, larg=0.03, k=(2, 1), turb=1.2, nuv=0.08, presenca=0.5), 0.45)
    add('silestone-lyra', 'quartz', 'Silestone Lyra', 'Silestone Lyra', 'Silestone Lyra',
        marmore_branco(24, '#f2f1ef', '#6d6e72', '#a8a8aa', forte=0.7, larg=0.03, k=(3, 2), turb=0.8), 0.2)
    add('silestone-white-storm', 'quartz', 'Silestone White Storm', 'Silestone White Storm', 'Silestone White Storm',
        quartzo_pintas(25, '#efeeec', [('#3a3a3c', 0.0025, 1.4), ('#8e8d8b', 0.006, 1.0), ('#c8c7c4', 0.015, 0.8)]), 0.22)
    add('silestone-miami-white', 'quartz', 'Silestone Miami White', 'Silestone Miami White', 'Silestone Miami White',
        quartzo_pintas(26, '#f6f6f4', [('#dcdcda', 0.01, 0.8), ('#b9b9b7', 0.0015, 0.8)], nuv=0.006), 0.2)
    add('silestone-desert-silver', 'quartz', 'Silestone Desert Silver', 'Silestone Desert Silver', 'Silestone Desert Silver',
        quartzo_pintas(27, '#b9b8b4', [('#8d8b87', 0.02, 1.0), ('#d7d6d2', 0.02, 0.9), ('#5f5d5a', 0.003, 1.0)], nuv=0.03), 0.3)
    add('silestone-et-statuario', 'quartz', 'Silestone Et. Statuario', 'Silestone Et. Statuario', 'Silestone Et. Statuario',
        marmore_branco(28, '#f5f4f1', '#55575b', '#9fa0a3', forte=0.8, larg=0.035, k=(1, 1), turb=1.0, presenca=0.55), 0.2)
    add('caesarstone-empira-white', 'quartz', 'Caesarstone Empira White', 'Caesarstone Empira White', 'Caesarstone Empira White',
        marmore_branco(31, '#f1f0ec', '#8b8c8e', '#bdbcba', forte=0.5, larg=0.045, k=(2, 2), turb=1.0), 0.22)
    add('caesarstone-statuario-maximus', 'quartz', 'Caesarstone Statuario Maximus', 'Caesarstone Statuario Maximus', 'Caesarstone Statuario Maximus',
        marmore_branco(32, '#f4f3f0', '#4f5054', '#9a9b9e', forte=0.85, larg=0.04, k=(1, 2), turb=1.1, presenca=0.5), 0.2)
    add('caesarstone-raw-concrete', 'quartz', 'Caesarstone Raw Concrete', 'Caesarstone Raw Concrete', 'Caesarstone Raw Concrete',
        concreto(33, '#a3a19c'), 0.55)
    add('caesarstone-pure-white', 'quartz', 'Caesarstone Pure White', 'Caesarstone Pure White', 'Caesarstone Pure White',
        quartzo_pintas(34, '#f7f6f3', [('#e6e4df', 0.01, 0.9)], nuv=0.005), 0.2)
    add('caesarstone-frosty-carrina', 'quartz', 'Caesarstone Frosty Carrina', 'Caesarstone Frosty Carrina', 'Caesarstone Frosty Carrina',
        marmore_branco(35, '#f1f1ef', '#a9aaac', '#cfcfcf', forte=0.4, larg=0.05, k=(3, 2), turb=1.3, presenca=0.8), 0.22)
    add('msi-calacatta-laza', 'quartz', 'MSI Calacatta Laza', 'MSI Calacatta Laza', 'MSI Calacatta Laza',
        marmore_branco(36, '#f2efe9', '#7e7a74', '#bdb6aa', forte=0.65, larg=0.035, k=(2, 1), ouro='#b88f55'), 0.22)
    add('msi-carrara-morro', 'quartz', 'MSI Carrara Morro', 'MSI Carrara Morro', 'MSI Carrara Morro',
        marmore_branco(37, '#ecebe8', '#9a9b9e', '#bfc0c2', forte=0.45, larg=0.03, k=(4, 3), turb=1.2, presenca=0.8), 0.22)

    # ---------------- GRANITO ----------------
    add('granite-verde-ubatuba', 'granite', 'Verde Ubatuba', 'Verde Ubatuba (Uba Tuba)', 'Verde Ubatuba',
        granito(41, '#141a16', [('#2a3a2a', 0.30, 5), ('#07090a', 0.35, 4), ('#5e5634', 0.035, 2.2), ('#3d5238', 0.10, 3)], brilho_d=0.002), 0.25)
    add('granite-absolute-black', 'granite', 'Preto Absoluto', 'Absolute Black', 'Negro Absoluto',
        granito(42, '#151516', [('#1f1f21', 0.4, 3), ('#0c0c0d', 0.3, 3)], nuv=0.03), 0.2)
    add('granite-black-galaxy', 'granite', 'Black Galaxy', 'Black Galaxy', 'Black Galaxy',
        granito(43, '#141415', [('#202022', 0.35, 4), ('#9c7a42', 0.012, 1.6), ('#c9a05a', 0.006, 1.3)], brilho_d=0.003), 0.2)
    add('granite-santa-cecilia', 'granite', 'Santa Cecília', 'Santa Cecilia', 'Santa Cecilia',
        granito(44, '#c9a978', [('#e0c896', 0.35, 7), ('#6b4a32', 0.10, 3), ('#2c2522', 0.08, 3.5), ('#7b2f2b', 0.04, 2.5), ('#a98e6e', 0.15, 4)]), 0.25)
    add('granite-giallo-ornamental', 'granite', 'Giallo Ornamental', 'Giallo Ornamental', 'Giallo Ornamental',
        granito(45, '#d2bf9c', [('#e6d8bb', 0.35, 8), ('#8b8278', 0.12, 4), ('#5a4a3c', 0.06, 3), ('#b59a75', 0.15, 5)]), 0.25)
    add('granite-new-venetian-gold', 'granite', 'New Venetian Gold', 'New Venetian Gold', 'New Venetian Gold',
        granito(46, '#dcc7a0', [('#efe2c4', 0.35, 8), ('#7e3b31', 0.035, 2.5), ('#3c3632', 0.06, 3), ('#b09a7a', 0.15, 5)]), 0.25)
    img = granito(47, '#5a4536', [('#2b211b', 0.25, 5), ('#6e5544', 0.25, 6)])
    img = olhos(img, 48, '#6e533f', '#1c1714', frac=0.28, grao=13)
    img = graos(img, 59, '#1a1512', 0.12, 3)
    add('granite-baltic-brown', 'granite', 'Baltic Brown', 'Baltic Brown', 'Baltic Brown', img, 0.25)
    add('granite-colonial-white', 'granite', 'Colonial White', 'Colonial White', 'Colonial White',
        granito(49, '#d8d4cc', [('#ebe8e2', 0.35, 8), ('#8b8883', 0.14, 4), ('#3b3a39', 0.05, 3), ('#7a3a36', 0.02, 2)]), 0.25)
    add('granite-steel-grey', 'granite', 'Steel Grey', 'Steel Grey', 'Steel Grey',
        granito(50, '#4d4e50', [('#2a2b2d', 0.35, 3.5), ('#6e6f71', 0.25, 3.5), ('#8e8f91', 0.06, 2.5)], brilho_d=0.0015), 0.25)
    add('granite-blue-pearl', 'granite', 'Blue Pearl', 'Blue Pearl', 'Blue Pearl',
        granito(51, '#3a3f47', [('#5b6a80', 0.25, 6), ('#1f2228', 0.30, 4), ('#8a9bb4', 0.05, 3)], brilho_d=0.004), 0.2)
    add('granite-tan-brown', 'granite', 'Tan Brown', 'Tan Brown', 'Tan Brown',
        granito(52, '#2a1f1b', [('#6b3f2e', 0.30, 9), ('#120e0d', 0.25, 5), ('#8b5a40', 0.08, 5)]), 0.25)
    add('granite-kashmir-white', 'granite', 'Kashmir White', 'Kashmir White', 'Kashmir White',
        granito(53, '#e4e1db', [('#f0eeea', 0.35, 9), ('#9a9792', 0.08, 3), ('#7d3b38', 0.015, 2)], nuv=0.02), 0.25)
    img = granito(54, '#e3e0da', [('#f1efeb', 0.3, 9), ('#8a8783', 0.08, 3), ('#7a3735', 0.02, 2)], nuv=0.02)
    img = veios(img, 55, '#9e9b96', 0.35, 0.08, 4, 1, turb=1.3, presenca=0.8)
    add('granite-river-white', 'granite', 'River White', 'River White', 'River White', img, 0.25)
    add('granite-alaska-white', 'granite', 'Alaska White', 'Alaska White', 'Alaska White',
        granito(56, '#cfcbc5', [('#ecebe8', 0.30, 10), ('#6d6a67', 0.15, 7), ('#1e1d1c', 0.07, 5), ('#a5a29d', 0.15, 6)]), 0.25)
    add('granite-black-pearl', 'granite', 'Black Pearl', 'Black Pearl', 'Black Pearl',
        granito(57, '#232426', [('#38393c', 0.35, 6), ('#121213', 0.25, 5), ('#8b8d92', 0.03, 2.5)], brilho_d=0.003), 0.2)
    add('granite-luna-pearl', 'granite', 'Luna Pearl', 'Luna Pearl', 'Luna Pearl',
        granito(58, '#a8a7a5', [('#d4d3d0', 0.30, 4), ('#3a3938', 0.18, 3.5), ('#6e6d6b', 0.2, 3.5)]), 0.25)

    # ---------------- MÁRMORE ----------------
    add('marble-carrara', 'marble', 'Mármore Carrara', 'Carrara Marble', 'Mármol Carrara',
        marmore_branco(61, '#e9e9e8', '#8f9196', '#b5b7ba', forte=0.45, larg=0.035, k=(4, 3), turb=1.3, nuv=0.04, presenca=0.85), 0.3)
    add('marble-calacatta-gold', 'marble', 'Mármore Calacatta Gold', 'Calacatta Gold Marble', 'Mármol Calacatta Gold',
        marmore_branco(62, '#f2efe8', '#6e6a63', '#a9a296', forte=0.8, larg=0.045, k=(1, 2), turb=1.0, ouro='#b38a4b'), 0.3)
    add('marble-statuario', 'marble', 'Mármore Statuario', 'Statuario Marble', 'Mármol Statuario',
        marmore_branco(63, '#f3f2ef', '#45474b', '#8e9094', forte=0.9, larg=0.05, k=(1, 1), turb=1.2, presenca=0.5), 0.3)
    add('marble-nero-marquina', 'marble', 'Nero Marquina', 'Nero Marquina', 'Nero Marquina',
        marmore_branco(64, '#181819', '#ecebe7', '#8f8e8b', forte=0.85, larg=0.015, k=(3, 2), turb=1.0, nuv=0.08, presenca=0.6), 0.3)
    img = marmore_branco(65, '#5a3f2e', '#a98a6e', '#7a5a43', forte=0.55, larg=0.025, k=(3, 4), turb=1.4, nuv=0.08, presenca=0.85)
    img = veios(img, 66, '#c9ab8c', 0.35, 0.012, 7, 5, turb=1.6, turb_esc=120, presenca=0.8)
    add('marble-emperador-dark', 'marble', 'Emperador Dark', 'Emperador Dark', 'Emperador Dark', img, 0.3)
    add('marble-crema-marfil', 'marble', 'Crema Marfil', 'Crema Marfil', 'Crema Marfil',
        marmore_branco(67, '#e4d4b8', '#c4ad88', '#d6c4a4', forte=0.35, larg=0.04, k=(3, 2), turb=1.4, nuv=0.05, presenca=0.85), 0.3)

    # ---------------- QUARTZITO ----------------
    img = marmore_branco(71, '#e8dcc8', '#a98d68', '#c8b597', forte=0.7, larg=0.07, k=(2, 1), turb=1.0, nuv=0.06, presenca=0.85)
    img = veios(img, 72, '#8d6d4b', 0.5, 0.025, 3, 2, turb=1.0, presenca=0.6)
    add('quartzite-taj-mahal', 'quartzite', 'Taj Mahal', 'Taj Mahal', 'Taj Mahal', img, 0.3)
    img = marmore_branco(73, '#ecebe7', '#6f7680', '#a9aeb5', forte=0.65, larg=0.03, k=(5, 1), turb=0.6, nuv=0.03, presenca=0.85)
    add('quartzite-white-macaubas', 'quartzite', 'White Macaúbas', 'White Macaubas', 'White Macaúbas', img, 0.3)
    img = marmore_branco(74, '#dcd8d0', '#7d6f62', '#a49a8e', forte=0.6, larg=0.08, k=(6, 1), turb=0.9, nuv=0.05, presenca=0.9)
    add('quartzite-fantasy-brown', 'quartzite', 'Fantasy Brown', 'Fantasy Brown', 'Fantasy Brown', img, 0.3)
    add('quartzite-super-white', 'quartzite', 'Super White', 'Super White', 'Super White',
        marmore_branco(75, '#e2e2e0', '#9fa1a3', '#c3c4c5', forte=0.45, larg=0.09, k=(2, 3), turb=1.5, nuv=0.06, presenca=0.85), 0.3)
    add('quartzite-mont-blanc', 'quartzite', 'Mont Blanc', 'Mont Blanc', 'Mont Blanc',
        marmore_branco(76, '#d9d8d5', '#8e9093', '#b4b5b7', forte=0.5, larg=0.05, k=(4, 1), turb=1.0, nuv=0.05, presenca=0.85), 0.3)
    add('quartzite-sea-pearl', 'quartzite', 'Sea Pearl', 'Sea Pearl', 'Sea Pearl',
        marmore_branco(77, '#b9b9b5', '#e2e1dc', '#8a8b88', forte=0.45, larg=0.05, k=(5, 2), turb=1.0, nuv=0.06, presenca=0.85), 0.3)

    # ---------------- TRAVERTINO ----------------
    add('travertine-classic', 'travertine', 'Travertino clássico', 'Classic Travertine', 'Travertino clásico',
        travertino(81, '#dccbad', '#c7b18c', '#9e8a6a'), 0.5)
    add('travertine-silver', 'travertine', 'Travertino silver', 'Silver Travertine', 'Travertino silver',
        travertino(82, '#c9c6bf', '#aaa69e', '#7f7c76'), 0.5)
    add('travertine-noce', 'travertine', 'Travertino noce', 'Noce Travertine', 'Travertino noce',
        travertino(83, '#a8825e', '#8b6747', '#5d4430'), 0.5)
    add('travertine-romano', 'travertine', 'Travertino romano', 'Roman Travertine', 'Travertino romano',
        travertino(84, '#e6d9c2', '#d3c2a4', '#b2a081'), 0.5)

    # ---------------- OUTROS ----------------
    add('soapstone', 'other', 'Pedra-sabão', 'Soapstone', 'Esteatita',
        marmore_branco(91, '#46494b', '#8d9294', '#61666a', forte=0.4, larg=0.025, k=(3, 2), turb=1.3, nuv=0.09, presenca=0.6), 0.55)
    add('concrete-gray', 'other', 'Concreto cinza', 'Gray Concrete', 'Concreto gris', concreto(92, '#8f8d89'), 0.6)
    add('solid-white', 'other', 'Branco liso', 'Solid White', 'Blanco liso',
        quartzo_pintas(93, '#f5f5f3', [('#ebebe9', 0.004, 0.8)], nuv=0.004), 0.25)
    add('solid-black', 'other', 'Preto liso', 'Solid Black', 'Negro liso',
        quartzo_pintas(94, '#1c1c1d', [('#2a2a2b', 0.006, 0.8)], nuv=0.02), 0.25)

    json.dump(CAT, open(os.path.join(OUT, 'catalog.json'), 'w'), ensure_ascii=False, indent=1)
    print(len(CAT), 'pedras')


if __name__ == '__main__':
    main()
