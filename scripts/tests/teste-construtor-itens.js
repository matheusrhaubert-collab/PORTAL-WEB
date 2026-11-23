// Bancada da lista "Neste módulo" do Construtor (portal-07, 23/11) — com o layout-engine de verdade.
// node scripts/tests/teste-construtor-itens.js
const fs = require('fs'); const path = require('path'); const vm = require('vm');
const raiz = path.join(__dirname, '../..');
const p07 = fs.readFileSync(path.join(raiz, 'js/portal-07-construtor.js'), 'utf8');
const bloco = p07.slice(p07.indexOf('function projectBuilderItens() {'), p07.indexOf('function fillProjectBuilderItens() {'));
let falhas = 0; const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) falhas++; };
const ctx = { console, window: {}, sujo: 0, refez: 0 };
ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(raiz, 'js/layout-engine.js'), 'utf8'), ctx);
vm.runInContext('var LayoutEngine = (typeof LayoutEngine !== "undefined" && LayoutEngine) || window.LayoutEngine || this.LayoutEngine;'
  + 'var projectBuilderRoot = null, projectBuilderBuilt = { pieces: [] }, projectBuilderCat = { porta: { name: "Porta" }, gav: { name: "Gaveta" }, prat: { name: "Prateleira" } };'
  + 'var projectBuilderUndo = [], PROJECT_BUILDER_UNDO_MAX = 30, projectBuilderSelId = null;'
  + 'function pushProjectBuilderUndo() { projectBuilderUndo.push(JSON.stringify(LayoutEngine.serialize(projectBuilderRoot))); }'
  + 'function markProjectDirty() { sujo++; } function rebuildProjectBuilder() { refez++; }' + bloco, ctx);
const no = (id, extra) => Object.assign({ id, splitAxis: null, splitAcc: null, sizeMode: 'fill', sizeValue: null, content: null, fronts: [], params: {}, locked: false, children: [] }, extra || {});
// o caso da tela do Matt: porta na RAIZ, raiz dividida em 3 (2 vazios em cima, gaveta embaixo)
const monta = () => {
  ctx.raizJson = JSON.stringify(no('r', { splitAxis: 'y', splitAcc: 'prat', fronts: [{ acc: 'porta', from: null, to: null, params: {} }],
    children: [no('baixo', { content: { acc: 'gav', params: { count: 1 } } }), no('meio'), no('cima')] }));
  vm.runInContext('projectBuilderRoot = LayoutEngine.deserialize(JSON.parse(raizJson)); projectBuilderSelId = projectBuilderRoot.id; projectBuilderUndo = [];', ctx);
};
const itens = () => vm.runInContext('projectBuilderItens()', ctx);
const tira = (i) => { ctx.__i = i; vm.runInContext('removeProjectBuilderItem(projectBuilderItens()[__i])', ctx); };
const arv = () => JSON.parse(vm.runInContext('JSON.stringify(LayoutEngine.serialize(projectBuilderRoot))', ctx));

monta();
let l = itens();
ok(l.map((i) => i.kind).join() === 'front,split,split,content', 'lista: porta da raiz, 2 prateleiras, gaveta (' + l.map((i) => i.kind).join() + ')');
ok(l[1].pode === true && l[2].pode === true, 'as 2 prateleiras têm um vão vazio ao lado: podem sair');
tira(0);
let a = arv();
ok(a.fronts.length === 0 && a.children.length === 3 && a.children[0].content && a.children[0].content.acc === 'gav', 'tirar a PORTA: só ela sai; prateleiras e gaveta ficam');
ok(vm.runInContext('projectBuilderUndo.length', ctx) === 1 && ctx.sujo === 1, 'entra no desfazer e marca como alterado');

monta();
tira(1); // divisória entre a gaveta (baixo) e o vão do meio (vazio)
a = arv();
ok(a.children.length === 2 && a.children[0].content && a.children[0].content.acc === 'gav' && a.fronts.length === 1, 'tirar a prateleira de cima da gaveta: some o vão VAZIO, a gaveta e a porta ficam');
tira(itens().findIndex((i) => i.kind === 'split'));
a = arv();
ok(a.children.length === 0 && a.content && a.content.acc === 'gav' && a.fronts.length === 1, 'última prateleira: a divisão acaba e o módulo fica com a gaveta e a porta');

// divisória com os dois lados ocupados
ctx.raizJson = JSON.stringify(no('r', { splitAxis: 'y', splitAcc: 'prat', children: [no('a', { content: { acc: 'gav', params: {} } }), no('b', { content: { acc: 'gav', params: {} } })] }));
vm.runInContext('projectBuilderRoot = LayoutEngine.deserialize(JSON.parse(raizJson)); projectBuilderUndo = [];', ctx);
l = itens(); const d = l.findIndex((i) => i.kind === 'split');
ok(l[d].pode === false, 'divisória entre dois vãos ocupados: lixeira apagada');
tira(d);
ok(arv().children.length === 2 && vm.runInContext('projectBuilderUndo.length', ctx) === 0, 'e mesmo chamada à força não mexe em nada');

// porta que cobre uma FAIXA de vãos (from/to) acompanha a remoção
ctx.raizJson = JSON.stringify(no('r', { splitAxis: 'y', splitAcc: 'prat', fronts: [{ acc: 'porta', from: 1, to: 2, params: {} }], children: [no('a'), no('b', { content: { acc: 'gav', params: {} } }), no('c', { content: { acc: 'gav', params: {} } })] }));
vm.runInContext('projectBuilderRoot = LayoutEngine.deserialize(JSON.parse(raizJson));', ctx);
tira(itens().findIndex((i) => i.kind === 'split' && i.divIndex === 0));
a = arv();
ok(a.children.length === 2 && a.fronts[0].from === 0 && a.fronts[0].to === 1, 'porta de faixa: os índices andam junto (continua cobrindo as 2 gavetas)');

// item travado pela engenharia
ctx.raizJson = JSON.stringify(no('r', { locked: true, fronts: [{ acc: 'porta', from: null, to: null, params: {} }] }));
vm.runInContext('projectBuilderRoot = LayoutEngine.deserialize(JSON.parse(raizJson));', ctx);
tira(0);
ok(itens()[0].travado === true && arv().fronts.length === 1, 'vão travado pela engenharia: aparece na lista mas não sai');
console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nTudo certo.'); process.exit(falhas ? 1 : 0);
