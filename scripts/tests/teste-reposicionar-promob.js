// Bancada do Reposicionar (modelo Promob, 2026-10-30): node scripts/tests/teste-reposicionar-promob.js
const fs = require('fs'), vm = require('vm'), path = require('path');
const file = process.argv[2] || path.join(__dirname, '..', '..', 'js', 'portal-32-reposicionar.js');
const ctx = {
  console, Math, JSON, Number, String, Object, isNaN, parseFloat,
  projectSlots: [], document: { getElementById: () => null, addEventListener() {}, removeEventListener() {} },
  formatDimensionNumber: (mm) => String(Math.round(mm * 100) / 100), parseDimensionInput: (s) => parseFloat(s),
  unitAbbrev: () => 'mm', I18n: { t: (k) => k },
  isFloorSlot: (s) => s.placement === 'floor',
  convertProjectSlotToFloor(slot, x, z) { slot.placement = 'floor'; slot.floor_x_mm = x; slot.floor_z_mm = z; slot.floor_height_mm = 0; },
  getSlotWorldFrame(s) { return { ox: s.floor_x_mm / 1000, oy: (s.floor_height_mm || 0) / 1000, oz: s.floor_z_mm / 1000, rotY: (s.floor_rotation_deg || 0) * Math.PI / 180, widthM: s.width_mm / 1000, heightM: s.height_mm / 1000, depthM: s.depth_mm / 1000 }; },
  selectProjectSlot() {}, renderProjectCanvas() {}, refreshProject3DResizeArrows() {}, markProjectDirty() {}
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(file, 'utf8') + '\n;this.__t={reposChildCorners,reposChildBBox,reposRotateKeepingPivot,reposPoseFromWorld,reposApplyPoseToSlot,reposSnapToClick,setState:(s)=>{projectReposicionarState=s},getState:()=>projectReposicionarState};', ctx);
const T = ctx.__t;
let falhas = 0;
const ok = (cond, msg) => { console.log((cond ? 'OK   ' : 'FALHA') + ' ' + msg); if (!cond) falhas++; };
const near = (a, b, tol = 0.05) => Math.abs(a - b) <= tol;

// 1) Giro igual ao Promob: filho 762x600 em X=1819.8, Y=0; +10° → X 1715.6, Y -9.12
let p = { x: 1819.8, y: 0, z: 0, rotDeg: 0, w: 762, d: 600, h: 876 };
T.reposRotateKeepingPivot(p, 10);
ok(near(p.x, 1715.61) && near(p.y, -9.12), `giro +10° → X ${p.x.toFixed(2)} Y ${p.y.toFixed(2)} (Promob: 1715,6 / -9,12)`);
const piv0 = T.reposChildCorners({ x: 1819.8, y: 0, rotDeg: 0, w: 762, d: 600 }).FL;
for (const ang of [10, 45, 90, 135, -90, 180]) {
  const q = { x: 1819.8, y: 0, z: 0, rotDeg: 0, w: 762, d: 600, h: 876 };
  T.reposRotateKeepingPivot(q, ang);
  const pv = T.reposChildCorners(q).FL;
  ok(near(pv.x, piv0.x) && near(pv.y, piv0.y), `pivô (frente/esquerda) parado girando ${ang}°`);
}

// 2) Ida e volta mundo ↔ relativo, com referência girada e levantada
const ref = { id: 1, placement: 'floor', floor_x_mm: 1234, floor_z_mm: -567, floor_height_mm: 100, floor_rotation_deg: 37, width_mm: 762, height_mm: 876, depth_mm: 600 };
const child = { id: 2, placement: 'floor', floor_x_mm: 0, floor_z_mm: 0, floor_height_mm: 0, floor_rotation_deg: 0, width_mm: 457, height_mm: 300, depth_mm: 305 };
ctx.projectSlots.push(ref, child);
const rf = ctx.getSlotWorldFrame(ref);
for (const pose of [{ x: 762, y: 0, z: 0, rotDeg: 0 }, { x: -457, y: -600, z: 876, rotDeg: 90 }, { x: 100, y: 250, z: -50, rotDeg: -33.5 }]) {
  const pp = Object.assign({ w: 457, d: 305, h: 300 }, pose);
  T.reposApplyPoseToSlot(child, rf, pp);
  const back = T.reposPoseFromWorld(rf, ctx.getSlotWorldFrame(child));
  ok(near(back.x, pp.x) && near(back.y, pp.y) && near(back.z, pp.z) && near(back.rotDeg, pp.rotDeg), `ida e volta X${pp.x} Y${pp.y} Z${pp.z} giro${pp.rotDeg} → ${back.x.toFixed(2)} ${back.y.toFixed(2)} ${back.z.toFixed(2)} ${back.rotDeg}`);
}
// Encostado à direita, alinhado, giro 0 → filho fica com a MESMA rotação da referência e lado a lado de verdade no mundo
T.reposApplyPoseToSlot(child, rf, { x: 762, y: 0, z: 0, rotDeg: 0, w: 457, d: 305, h: 300 });
ok(near(child.floor_rotation_deg, 37), 'giro 0 relativo = mesma rotação da referência no mundo');
ok(near(child.floor_height_mm, 100), 'Z=0 = mesmo pé da referência (levantada 100)');
{ // distância centro-a-centro ao longo da largura da ref = 762/2 + 457/2, e fundo alinhado
  const r = 37 * Math.PI / 180, U = { x: Math.cos(r), z: -Math.sin(r) }, N = { x: Math.sin(r), z: Math.cos(r) };
  const dx = child.floor_x_mm - ref.floor_x_mm, dz = child.floor_z_mm - ref.floor_z_mm;
  ok(near(dx * U.x + dz * U.z, 762 / 2 + 457 / 2), 'lado a lado: centro afastado meia-largura + meia-largura');
  ok(near(dx * N.x + dz * N.z, -(600 - 305) / 2), 'fundo alinhado com o fundo da referência');
}

// 3) Clique encosta e alinha (planta: X 0..762, Y -600..0)
const runClick = (pose, h, v, axis) => {
  const st = { slotId: 2, targetId: 1, pose: Object.assign({ w: 457, d: 305, h: 300 }, pose), view: null, history: [], future: [] };
  T.setState(st);
  T.reposSnapToClick(h, v, axis);
  return T.getState().pose;
};
let r1 = runClick({ x: 2000, y: 500, z: 0, rotDeg: 0 }, -50, -100, 'y');
ok(near(r1.x, -457) && near(r1.y, 0), `clique à esquerda, perto do fundo → encosta à esquerda, fundo alinhado (X ${r1.x}, Y ${r1.y})`);
r1 = runClick({ x: 2000, y: 500, z: 0, rotDeg: 0 }, 800, -550, 'y');
ok(near(r1.x, 762) && near(r1.y, -600 + 305), `clique à direita, perto da frente → encosta à direita, frente alinhada (X ${r1.x}, Y ${r1.y})`);
r1 = runClick({ x: 2000, y: 500, z: 0, rotDeg: 0 }, 700, -700, 'y');
ok(near(r1.x, 762 - 457) && near(r1.y, -600), `clique na frente, lado direito → na frente, alinhado à direita (X ${r1.x}, Y ${r1.y})`);
r1 = runClick({ x: 2000, y: 0, z: 0, rotDeg: 0 }, 100, 900, 'z');
ok(near(r1.z, 876) && near(r1.x, 0) && near(r1.y, 0), `frontal: clique em cima, à esquerda → em cima, alinhado à esquerda, Y intacto (X ${r1.x}, Z ${r1.z})`);
r1 = runClick({ x: 2000, y: 0, z: 0, rotDeg: 90 }, 900, -300, 'y');
const bb = T.reposChildBBox(r1);
ok(near(bb.x0, 762), `girado 90°: encosta pela caixa real (borda esquerda da caixa em ${bb.x0.toFixed(2)})`);

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO OK');
process.exit(falhas ? 1 : 0);
