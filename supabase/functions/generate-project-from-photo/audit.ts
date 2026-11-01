// =============================================================================
// auditoria da leitura (fase 1 da fidelidade ao PDF, 2026-11-01)
// =============================================================================
// Matt: "A IA que faz projeto por pdf ainda tem muita inconsistência do pdf
// original" → antes de mostrar a revisão, o 'read' passa por uma conferência
// SEM IA (este arquivo) e, se achar problema, faz UMA chamada de correção
// (index.ts, buildFixPrompt). O que sobrar vira aviso na tela de revisão.
//
// Sem dependência do Deno de propósito: roda no Node com
//   node --experimental-strip-types scripts/tests/teste-auditoria-leitura.ts
// (bancada em scripts/tests/).
//
// Duas famílias de checagem:
//   1. GEOMETRIA (foto e PDF): abertura/volume passa da parede, passa do
//      teto, volume sobre porta/passagem, dois volumes da mesma camada se
//      sobrepondo na mesma parede.
//   2. COTAS (só PDF, quando o portal mandou os textos da prancha): parede
//      ou volume cuja medida não bate com NENHUMA cota escrita, mas tem uma
//      cota parecida (até 12% de diferença) — é o sinal clássico de "leu no
//      olho": 3120 na leitura, 3100 na prancha.
// Cada problema sai como texto curto (pt) com id da peça, pra IA corrigir e
// pro usuário ler. Tudo em mm.

export type PageText = { label?: string; items: { s: string; x: number; y: number }[] };

export const AUDIT_MAX = 30;           // problemas listados no máximo
const TOL_MM = 10;                     // folga pra "passa da parede"
const COTA_IGUAL = 0.015;              // 1,5% = bate com a cota
const COTA_PERTO = 0.12;               // até 12% = "parece essa cota"

function n(v: any, d = 0): number { const x = Number(v); return Number.isFinite(x) ? x : d; }

// "2.830", "2,83 m", "85", "30\"", "2'-6\"", "34 1/2" → lista de candidatos em mm.
// Cada texto pode virar mais de um valor (não sabemos a unidade da prancha):
// 283 → 283 mm, 2830 mm (cm); 2,83 → 2830 mm (m). Frações/pés-polegadas
// viram mm direto.
export function cotaCandidatesMm(s: string): number[] {
  const t = String(s || "").trim();
  if (!t || t.length > 24) return [];
  const out: number[] = [];
  const push = (v: number) => { if (v >= 40 && v <= 20000) out.push(Math.round(v)); };
  // pés-polegadas: 2'-6" / 2' 6" / 2'6
  let m = t.match(/^(\d+)\s*'\s*-?\s*(\d+(?:\s+\d+\/\d+)?)?\s*"?$/);
  if (m) {
    const ft = n(m[1]); let inch = 0;
    if (m[2]) { const p = m[2].split(/\s+/); inch = n(p[0]); if (p[1]) { const f = p[1].split("/"); inch += n(f[0]) / Math.max(1, n(f[1], 1)); } }
    push((ft * 12 + inch) * 25.4); return out;
  }
  // polegadas: 30" / 34 1/2" / 34-1/2"
  m = t.match(/^(\d+)(?:[\s-]+(\d+)\/(\d+))?\s*(?:"|''|in)$/i);
  if (m) { push((n(m[1]) + (m[2] ? n(m[2]) / Math.max(1, n(m[3], 1)) : 0)) * 25.4); return out; }
  // número com unidade opcional
  m = t.match(/^(\d{1,3}(?:[.,]\d{3})+|\d+)(?:([.,])(\d+))?\s*(mm|cm|m)?$/i);
  if (!m) return [];
  const intPart = m[1], sep = m[2], dec = m[3], unit = (m[4] || "").toLowerCase();
  // "2.830" / "1,200" = milhar (3 dígitos depois do separador, sem unidade decimal)
  const milhar = /^\d{1,3}([.,]\d{3})+$/.test(intPart);
  const base = milhar ? n(intPart.replace(/[.,]/g, "")) : n(intPart + (dec ? "." + dec : ""));
  if (!(base > 0)) return [];
  if (unit === "mm") push(base);
  else if (unit === "cm") push(base * 10);
  else if (unit === "m") push(base * 1000);
  else if (sep && !milhar) { push(base * 1000); push(base * 10); push(base); } // 2,83 → m; 85,5 → cm
  else { push(base); push(base * 10); if (base < 20) push(base * 1000); } // 2830; 283 (cm); 3 (m)
  return out;
}

export function allCotasMm(pages: PageText[] | undefined): number[] {
  const set = new Set<number>();
  (pages || []).forEach((p) => (p.items || []).forEach((it) => cotaCandidatesMm(it.s).forEach((v) => set.add(v))));
  return Array.from(set).sort((a, b) => a - b);
}

function cotaCheck(valor: number, cotas: number[]): number | null {
  // null = bate com alguma cota (ou não há cota parecida); número = a cota
  // parecida que NÃO bate (sugestão de correção)
  if (!cotas.length || !(valor > 0)) return null;
  let best = 0, bestDiff = Infinity;
  for (const c of cotas) { const d = Math.abs(c - valor) / valor; if (d < bestDiff) { bestDiff = d; best = c; } }
  if (bestDiff <= COTA_IGUAL) return null;
  if (bestDiff <= COTA_PERTO) return best;
  return null;
}

export function auditRead(raw: any, pages?: PageText[]): string[] {
  const out: string[] = [];
  const add = (s: string) => { if (out.length < AUDIT_MAX) out.push(s); };
  const walls: any[] = Array.isArray(raw?.walls) ? raw.walls : [];
  const openings: any[] = Array.isArray(raw?.openings) ? raw.openings : [];
  const volumes: any[] = Array.isArray(raw?.volumes) ? raw.volumes : [];
  const cotas = allCotasMm(pages);
  const wl = (i: number) => n(walls[i]?.length_mm);
  const wh = (i: number) => n(walls[i]?.height_mm);
  const nome = (w: any, i: number) => `parede ${i + 1}${w?.label ? ` (${w.label})` : ""}`;

  // 1. paredes × cotas
  walls.forEach((w, i) => {
    const c = cotaCheck(n(w?.length_mm), cotas);
    if (c != null) add(`${nome(w, i)}: comprimento ${Math.round(n(w.length_mm))} não bate com nenhuma cota da prancha; a mais parecida é ${c}.`);
  });

  // 2. aberturas
  openings.forEach((o, k) => {
    const wi = Math.round(n(o?.wall_index, -1));
    if (wi < 0 || wi >= walls.length) { add(`abertura ${k + 1}: wall_index ${wi} não existe.`); return; }
    const x = n(o?.x_mm), w = n(o?.width_mm), sill = n(o?.sill_mm), h = n(o?.height_mm);
    if (x + w > wl(wi) + TOL_MM) add(`abertura ${k + 1} (${o?.type}) na ${nome(walls[wi], wi)}: x ${Math.round(x)} + largura ${Math.round(w)} passa do comprimento ${Math.round(wl(wi))}.`);
    if (sill + h > wh(wi) + TOL_MM) add(`abertura ${k + 1} (${o?.type}) na ${nome(walls[wi], wi)}: peitoril ${Math.round(sill)} + altura ${Math.round(h)} passa da altura da parede ${Math.round(wh(wi))}.`);
    const cw = cotaCheck(w, cotas);
    if (cw != null) add(`abertura ${k + 1} (${o?.type}): largura ${Math.round(w)} não bate com nenhuma cota; a mais parecida é ${cw}.`);
  });

  // 3. volumes
  const porParede = new Map<number, any[]>();
  volumes.forEach((v, k) => {
    const id = String(v?.id || `v${k + 1}`);
    const wi = Math.round(n(v?.wall_index, -1));
    if (wi < 0 || wi >= walls.length) { add(`${id}: wall_index ${wi} não existe.`); return; }
    const x = n(v?.x_mm), w = n(v?.width_mm), h = n(v?.height_mm), fh = n(v?.floor_height_mm);
    const layer = String(v?.layer || "wall");
    if (layer !== "floor" && x + w > wl(wi) + TOL_MM) add(`${id} "${v?.label || ""}" na ${nome(walls[wi], wi)}: x ${Math.round(x)} + largura ${Math.round(w)} passa do comprimento ${Math.round(wl(wi))}.`);
    if (fh + h > wh(wi) + TOL_MM) add(`${id} "${v?.label || ""}": altura do chão ${Math.round(fh)} + altura ${Math.round(h)} passa do teto ${Math.round(wh(wi))}.`);
    if (layer !== "floor") {
      openings.forEach((o, k2) => {
        if (Math.round(n(o?.wall_index, -1)) !== wi) return;
        const ox = n(o?.x_mm), ow = n(o?.width_mm), os = n(o?.sill_mm), oh = n(o?.height_mm);
        const cruzaX = Math.min(x + w, ox + ow) - Math.max(x, ox) > TOL_MM;
        const cruzaY = Math.min(fh + h, os + oh) - Math.max(fh, os) > TOL_MM;
        if (!cruzaX || !cruzaY) return;
        if (o?.type === "door" || o?.type === "passage") add(`${id} "${v?.label || ""}" está em cima da abertura ${k2 + 1} (${o.type}) da ${nome(walls[wi], wi)} (x ${Math.round(ox)}–${Math.round(ox + ow)}).`);
        else if (o?.type === "window" && fh + h > os + TOL_MM) add(`${id} "${v?.label || ""}" invade a janela (abertura ${k2 + 1}, peitoril ${Math.round(os)}) — embaixo de janela só até o peitoril.`);
      });
    }
    if (layer !== "floor") {
      const cw = cotaCheck(w, cotas);
      if (cw != null) add(`${id} "${v?.label || ""}": largura ${Math.round(w)} não bate com nenhuma cota; a mais parecida é ${cw}.`);
      const ch = cotaCheck(h, cotas);
      if (ch != null && h > 300) add(`${id} "${v?.label || ""}": altura ${Math.round(h)} não bate com nenhuma cota; a mais parecida é ${ch}.`);
    }
    const key = wi * 10 + (layer === "wall" ? 0 : layer === "front" ? 1 : 2);
    if (!porParede.has(key)) porParede.set(key, []);
    porParede.get(key)!.push({ id, label: v?.label, x, w, fh, h, layer, kind: v?.kind });
  });
  // sobreposição entre volumes da MESMA parede e MESMA camada (chão não conta)
  porParede.forEach((lista) => {
    lista.sort((a, b) => a.x - b.x);
    for (let i = 0; i < lista.length; i++) for (let j = i + 1; j < lista.length; j++) {
      const a = lista[i], b = lista[j];
      if (a.layer === "floor") continue;
      // tampo deita por cima da base de propósito
      if (a.kind === "countertop" || b.kind === "countertop") continue;
      const dx = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const dy = Math.min(a.fh + a.h, b.fh + b.h) - Math.max(a.fh, b.fh);
      if (dx > TOL_MM && dy > TOL_MM) add(`${a.id} "${a.label || ""}" e ${b.id} "${b.label || ""}" se sobrepõem (${Math.round(dx)} mm na largura, ${Math.round(dy)} mm na altura).`);
    }
  });

  // 4. soma das larguras encostadas na parede × comprimento (só avisa se passou)
  walls.forEach((w, i) => {
    const soma = volumes.filter((v) => Math.round(n(v?.wall_index, -1)) === i && String(v?.layer || "wall") === "wall" && n(v?.floor_height_mm) < 500 && v?.kind !== "countertop")
      .reduce((s, v) => s + n(v?.width_mm), 0);
    if (soma > wl(i) + TOL_MM) add(`${nome(w, i)}: as larguras dos móveis de piso somam ${Math.round(soma)}, mais que o comprimento ${Math.round(wl(i))}.`);
  });
  return out;
}

// Texto das cotas pro prompt do 'read' (e da correção). Números e textos
// curtos primeiro; posição em % da página (origem no canto superior
// esquerdo) pra IA saber de QUAL vista/peça é cada cota.
export function pageTextsPrompt(pages: PageText[] | undefined, maxPerPage = 500): string {
  const ps = (pages || []).filter((p) => p && Array.isArray(p.items) && p.items.length);
  if (!ps.length) return "";
  const linhas = ps.map((p, i) => {
    const items = p.items
      .map((it) => ({ s: String(it.s || "").trim().slice(0, 40), x: n(it.x), y: n(it.y) }))
      .filter((it) => it.s)
      // cotas (texto que vira número) antes de rótulos; depois de cima pra baixo
      .sort((a, b) => (cotaCandidatesMm(b.s).length ? 1 : 0) - (cotaCandidatesMm(a.s).length ? 1 : 0) || a.y - b.y || a.x - b.x)
      .slice(0, maxPerPage)
      .map((it) => `${it.s}@(${it.x.toFixed(1)},${it.y.toFixed(1)})`);
    return `${p.label || `Página ${i + 1}`}: ${items.join(" | ")}`;
  });
  return `TEXTOS DA PRANCHA (extraídos do PDF — são EXATOS; cada item é texto@(x,y) com x,y em % da largura/altura da página, origem no canto superior esquerdo). As COTAS estão aqui: use estes números, não leia cotas pela imagem. Use a posição pra saber a qual vista e a qual peça cada cota pertence (a cota fica ao lado da linha de cota, na mesma vista). Texto que não é cota (título, legenda, acabamento, código de módulo) também está aqui.
${linhas.join("\n")}`;
}
