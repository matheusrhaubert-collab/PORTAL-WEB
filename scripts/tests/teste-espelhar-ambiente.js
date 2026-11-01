/* Bancada do Espelhar (01/11). Rodar no terminal: node scripts/tests/teste-espelhar-ambiente.js */
const fs = require('fs'), vm = require('vm'), path = require('path');
const R = path.join(__dirname, '..', '..');
const src = fs.readFileSync(path.join(R, 'js/portal-11-foto-projeto.js'), 'utf8');
const m = src.match(/function projectPhotoMirrorState\([\s\S]*?\n}\n/);
const g = { console }; vm.createContext(g);
vm.runInContext(m[0] + ';this.f = projectPhotoMirrorState;', g);
let falhas = 0;
const ok = (n, c, d) => { console.log((c ? '  OK   ' : '  FALHA') + '  ' + n + (d !== undefined ? '  [' + JSON.stringify(d) + ']' : '')); if (!c) falhas++; };
const st = { room: {
  walls: [{ label: 'A', length_mm: 4600, angle_to_next_deg: 90 }, { label: 'B', length_mm: 3600, angle_to_next_deg: 270 }, { label: 'C', length_mm: 2000, angle_to_next_deg: 0 }],
  openings: [{ wall_index: 1, type: 'window', x_mm: 910, width_mm: 880 }],
  volumes: [{ id: 'v1', wall_index: 0, x_mm: 0, width_mm: 510 }] },
  items: [{ volume_id: 'v1', wall_index: 0, x_mm: 0, width_mm: 510 }, { volume_id: 'v2', wall_index: 2, x_mm: 1500, width_mm: 500 }], unmatched: [], warnings: [] };
const e = g.f(st);
ok('ordem invertida C,B,A', e.room.walls.map((w) => w.label).join('') === 'CBA');
ok('ângulos reposicionados (270, 90, 0)', e.room.walls.map((w) => w.angle_to_next_deg).join(',') === '270,90,0', e.room.walls.map((w) => w.angle_to_next_deg));
ok('janela na parede B (índice 1) com x espelhado 3600-910-880=1810', e.room.openings[0].wall_index === 1 && e.room.openings[0].x_mm === 1810, e.room.openings[0]);
ok('torre vai pro fim da parede A (agora índice 2), x = 4600-510', e.items[0].wall_index === 2 && e.items[0].x_mm === 4090, e.items[0]);
ok('item da C vira índice 0, x = 2000-1500-500 = 0', e.items[1].wall_index === 0 && e.items[1].x_mm === 0, e.items[1]);
ok('original intacto', st.room.walls[0].label === 'A' && st.items[0].x_mm === 0);
ok('espelhar 2x volta', JSON.stringify(g.f(e).room) === JSON.stringify(st.room));
console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nTUDO OK');
process.exitCode = falhas ? 1 : 0;
