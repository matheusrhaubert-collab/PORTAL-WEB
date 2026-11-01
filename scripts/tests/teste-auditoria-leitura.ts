/* Bancada da auditoria da leitura por foto/PDF (fase 1 fidelidade, 2026-11-01).
 * Rodar no terminal: node --experimental-strip-types scripts/tests/teste-auditoria-leitura.ts
 * Confere: conversão de cotas (m / cm / mm / polegadas / milhar), medida que
 * não bate com cota, volume fora da parede, sobre porta, acima do teto,
 * sobreposição, e o texto das cotas pro prompt.
 */
import { cotaCandidatesMm, allCotasMm, auditRead, pageTextsPrompt } from "../../supabase/functions/generate-project-from-photo/audit.ts";
let falhas = 0;
const ok = (n: string, c: boolean, d?: any) => { console.log((c ? "  OK   " : "  FALHA") + "  " + n + (d !== undefined ? "  [" + JSON.stringify(d) + "]" : "")); if (!c) falhas++; };
const has = (a: number[], v: number) => a.includes(v);

ok("0,51 m -> 510", has(cotaCandidatesMm("0,51 m"), 510), cotaCandidatesMm("0,51 m"));
ok("2,74 m -> 2740", has(cotaCandidatesMm("2,74 m"), 2740));
ok("2.830 (milhar) -> 2830", has(cotaCandidatesMm("2.830"), 2830) && !has(cotaCandidatesMm("2.830"), 283));
ok("85 (cm) -> 850 e 85 não (<40)... 85 mm sim", has(cotaCandidatesMm("85"), 850) && has(cotaCandidatesMm("85"), 85));
ok("30\" -> 762", has(cotaCandidatesMm('30"'), 762));
ok("34 1/2\" -> 876", has(cotaCandidatesMm('34 1/2"'), 876));
ok("2'-6\" -> 762", has(cotaCandidatesMm("2'-6\""), 762));
ok("600 mm -> 600 só", JSON.stringify(cotaCandidatesMm("600 mm")) === "[600]");
ok("texto comum -> nada", cotaCandidatesMm("VENTANA").length === 0 && cotaCandidatesMm("ILUMINACIÓN").length === 0);

// prancha do "Cuarto niño" (Canva, cotas em m)
const pages = [{ label: "Página 3", items: ["4,60 m", "0,51 m", "0,63 m", "1,00 m", "2,45 m", "2,74 m", "4,10 m", "0,36 m", "0,55 m", "0,40 m", "0,41 m", "1,02 m", "0,60 m", "0,47 m", "0,52 m", "ILUMINACIÓN"].map((s, i) => ({ s, x: 10 + i, y: 5 + i })) }];
const cotas = allCotasMm(pages);
ok("cotas da prancha incluem 4600 e 2740", has(cotas, 4600) && has(cotas, 2740), cotas.length);

const leitura = {
  walls: [{ label: "fundo", length_mm: 4700, height_mm: 2740, angle_to_next_deg: 90 }, { label: "janela", length_mm: 3600, height_mm: 2740, angle_to_next_deg: 0 }],
  openings: [{ wall_index: 1, type: "window", x_mm: 900, width_mm: 880, sill_mm: 1020, height_mm: 1420 }, { wall_index: 0, type: "door", x_mm: 4000, width_mm: 800, sill_mm: 0, height_mm: 2100 }],
  volumes: [
    { id: "v1", label: "torre", kind: "closet_tower", wall_index: 0, layer: "wall", x_mm: 0, width_mm: 510, height_mm: 2740, floor_height_mm: 0 },
    { id: "v2", label: "painel", kind: "panel", wall_index: 0, layer: "wall", x_mm: 510, width_mm: 4100, height_mm: 1020, floor_height_mm: 0 },
    { id: "v3", label: "mesa", kind: "desk", wall_index: 0, layer: "wall", x_mm: 3900, width_mm: 1000, height_mm: 740, floor_height_mm: 0 },
    { id: "v4", label: "aéreo", kind: "wall_cabinet", wall_index: 0, layer: "wall", x_mm: 600, width_mm: 630, height_mm: 1000, floor_height_mm: 1900 },
    { id: "v5", label: "banco janela", kind: "base", wall_index: 1, layer: "wall", x_mm: 900, width_mm: 1500, height_mm: 1200, floor_height_mm: 0 },
    { id: "v6", label: "cama", kind: "bed", wall_index: 0, layer: "floor", x_mm: 1500, width_mm: 1600, height_mm: 500, floor_height_mm: 0 }
  ]
};
const probs = auditRead(leitura, pages);
console.log(probs.map((p) => "    - " + p).join("\n"));
const tem = (re: RegExp) => probs.some((p) => re.test(p));
ok("parede 4700 não bate (cota 4600)", tem(/parede 1.*4700.*4600/));
ok("v2 4100 bate com a cota (sem aviso)", !tem(/v2 .*não bate/));
ok("v3 passa da parede", tem(/v3 .*passa do comprimento/));
ok("v3 sobre a porta", tem(/v3 .*em cima da abertura 2/));
ok("v4 passa do teto", tem(/v4 .*passa do teto/));
ok("v2 e v3 se sobrepõem", tem(/v2 .* e v3 .*sobrepõem/));
ok("v5 invade a janela", tem(/v5 .*invade a janela/));
ok("cama (piso) não é cobrada contra a parede", !tem(/v6 /));
ok("tudo certo -> sem problemas", auditRead({ walls: [{ length_mm: 4600, height_mm: 2740 }], openings: [], volumes: [{ id: "a", wall_index: 0, layer: "wall", x_mm: 0, width_mm: 510, height_mm: 2740, floor_height_mm: 0 }] }, pages).length === 0);

const txt = pageTextsPrompt(pages);
ok("prompt das cotas tem o cabeçalho e os itens", /TEXTOS DA PRANCHA/.test(txt) && /4,60 m@\(10\.0,5\.0\)/.test(txt) && /ILUMINACIÓN@/.test(txt));
ok("cotas vêm antes do texto comum", txt.indexOf("4,60 m@") < txt.indexOf("ILUMINACIÓN@"));
ok("sem páginas -> vazio", pageTextsPrompt([]) === "" && pageTextsPrompt(undefined) === "");
console.log(falhas ? "\n" + falhas + " FALHA(S)" : "\nTUDO OK");
process.exitCode = falhas ? 1 : 0;
