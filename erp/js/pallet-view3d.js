/* Legno — visor 3D do pallet empilhado (PALLET3D)
 *
 * Desenha o resultado de PALLET.empacotar/empacotarAuto (erp/js/pallet-engine.js)
 * com three.js (r128, a cópia local de erp/js/vendor — mesma versão presa do
 * viewer3d.js). Usado pela tela Produção → Embalagem do ERP e pela página de
 * teste scratch/teste-pallet-3d.html.
 *
 * USO
 *   const v = PALLET3D.create(containerEl, { fundo: 0x0b0d10, grid: [cor1, cor2] });
 *   const m = v.desenhar(res, opt, idxPallet, { camVis, explode, arestas, mostrarPallet });
 *   v.enquadrar(m);   v.spin = true/false;   v.dispose();
 *
 * `desenhar` devolve as medidas (PALLET.medidasPallet) do pallet desenhado.
 * Cada create() abre um contexto WebGL; quem troca de tela chama dispose()
 * (o roteador do ERP troca #erp-main.innerHTML inteiro, então o canvas some
 * junto — dispose() só fecha o loop de animação e libera a GPU).
 */

const PALLET3D = {};

// Tons de painel (MDF/melamínico), não confete: o monte tem que parecer um
// monte de chapa. Alterna claro/escuro só pra dar pra contar as camadas.
PALLET3D.PALETA = [0xe6e0d4, 0xc2bba9, 0xd8d1c2, 0xaea695, 0xefe9de, 0xcac2b0];
PALLET3D.COR_PARCIAL = 0xd8615c; // peça sem apoio pleno

PALLET3D.create = function (wrap, opts) {
  opts = opts || {};
  const S = 0.001; // mm -> metros da cena
  const fundo = opts.fundo != null ? opts.fundo : 0x0b0d10;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(fundo);
  scene.fog = new THREE.Fog(fundo, 6, 26);

  const camera = new THREE.PerspectiveCamera(42, Math.max(1, wrap.clientWidth) / Math.max(1, wrap.clientHeight), 0.05, 120);
  camera.position.set(3.2, 2.4, 3.6);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(Math.max(1, wrap.clientWidth), Math.max(1, wrap.clientHeight));
  wrap.appendChild(renderer.domElement);

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08;

  scene.add(new THREE.HemisphereLight(0xdfe7ff, 0x20242c, 0.85));
  const sol = new THREE.DirectionalLight(0xffffff, 0.75); sol.position.set(4, 7, 3); scene.add(sol);
  const sol2 = new THREE.DirectionalLight(0xffffff, 0.25); sol2.position.set(-4, 3, -3); scene.add(sol2);
  const gc = opts.grid || [0x2a2f38, 0x1a1e25];
  const grid = new THREE.GridHelper(24, 48, gc[0], gc[1]);
  grid.position.y = -0.001; scene.add(grid);

  const raiz = new THREE.Group(); scene.add(raiz);

  const api = { spin: false, scene, camera, renderer, controls, raiz };
  let vivo = true;

  function onResize(){
    if (!vivo || !wrap.clientWidth || !wrap.clientHeight) return;
    camera.aspect = wrap.clientWidth / wrap.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(wrap.clientWidth, wrap.clientHeight);
  }
  window.addEventListener('resize', onResize);
  (function loop(){
    if (!vivo) return;
    requestAnimationFrame(loop);
    if (api.spin) raiz.rotation.y += 0.0035;
    controls.update(); renderer.render(scene, camera);
  })();

  function limpar(g){
    while (g.children.length){
      const o = g.children.pop();
      o.traverse((c) => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) (Array.isArray(c.material) ? c.material : [c.material]).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
      });
    }
  }
  function caixa(w, h, d, cor, arestas){
    const grupo = new THREE.Group();
    const geo = new THREE.BoxGeometry(w, h, d);
    grupo.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: cor })));
    if (arestas){
      grupo.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo),
        new THREE.LineBasicMaterial({ color: 0x3a3a38, transparent: true, opacity: 0.7 })));
    }
    return grupo;
  }
  function rotulo(txt){
    const cv = document.createElement('canvas');
    const ctx = cv.getContext('2d');
    ctx.font = 'bold 44px -apple-system,Segoe UI,Arial';
    const w = Math.ceil(ctx.measureText(txt).width) + 28;
    cv.width = w; cv.height = 64;
    const c2 = cv.getContext('2d');
    c2.fillStyle = 'rgba(15,17,20,.82)'; c2.fillRect(0, 0, w, 64);
    c2.strokeStyle = '#3a4150'; c2.strokeRect(0.5, 0.5, w - 1, 63);
    c2.font = 'bold 34px -apple-system,Segoe UI,Arial'; c2.fillStyle = '#e7e9ee';
    c2.textBaseline = 'middle'; c2.fillText(txt, 14, 34);
    const tex = new THREE.CanvasTexture(cv);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sp.scale.set(w / 64 * 0.16, 0.16, 1);
    return sp;
  }

  api.enquadrar = function (m){
    const r = Math.max(m.deckW, m.deckD, m.alturaTotal) * S;
    const dist = r * 1.55 + 0.5;
    camera.position.set(dist * 0.72, dist * 0.62, dist * 0.82);
    controls.target.set(0, (m.alturaTotal * S) / 2, 0);
    controls.update();
  };

  // vista = { camVis (nº de camadas visíveis, default todas), explode (mm
  // entre camadas), arestas (bool), mostrarPallet (bool), cotas (bool) }
  api.desenhar = function (res, opt, idxPallet, vista){
    vista = vista || {};
    const pal = res.pallets[idxPallet || 0];
    if (!pal) return null;
    const m = PALLET.medidasPallet(pal, res, opt);
    const arestas = vista.arestas !== false;
    const mostrarPallet = vista.mostrarPallet !== false;
    const camVis = vista.camVis > 0 ? Math.min(vista.camVis, pal.camadas.length) : pal.camadas.length;
    const explode = Number(vista.explode) || 0;

    limpar(raiz);
    raiz.rotation.y = 0;
    const off = new THREE.Group();
    off.position.set(-(m.deckW * S) / 2, 0, -(m.deckD * S) / 2);
    raiz.add(off);

    if (mostrarPallet){
      // pés (longarinas), correm na largura (Z)
      const passo = (m.deckW - opt.peW) / Math.max(1, opt.peN - 1);
      for (let i = 0; i < opt.peN; i++){
        const g = caixa(opt.peW * S, opt.peH * S, m.deckD * S, 0x7a6244, arestas);
        g.position.set((i * passo + opt.peW / 2) * S, (opt.peH / 2) * S, (m.deckD / 2) * S);
        off.add(g);
      }
      // estrado: tábuas correndo na largura, com vão entre elas
      const nT = m.nTabuas;
      const passoT = (m.deckW - opt.deckW) / Math.max(1, nT - 1);
      for (let i = 0; i < nT; i++){
        const g = caixa(opt.deckW * S, opt.deckE * S, m.deckD * S, 0x9c8158, arestas);
        g.position.set((i * passoT + opt.deckW / 2) * S, (opt.peH + opt.deckE / 2) * S, (m.deckD / 2) * S);
        off.add(g);
      }
    }

    const baseY = opt.peH + opt.deckE;
    pal.camadas.forEach((cam, i) => {
      if (i >= camVis) return;
      const cor = PALLET3D.PALETA[i % PALLET3D.PALETA.length];
      const dy = explode * i;
      cam.itens.forEach((it) => {
        const g = caixa(it.w * S, it.peca.e * S, it.d * S, it.parcial ? PALLET3D.COR_PARCIAL : cor, arestas);
        g.position.set(
          (opt.margem + it.x + it.w / 2) * S,
          (baseY + cam.z + it.peca.e / 2 + dy) * S,
          (opt.margem + it.y + it.d / 2) * S
        );
        g.userData.item = it;
        off.add(g);
      });
    });

    if (vista.cotas !== false){
      const rX = rotulo(Math.round(m.deckW) + ' mm  (' + PALLET.mmToFtIn(m.deckW) + ')');
      rX.position.set((m.deckW / 2) * S, 0.02, (m.deckD / 2 + 160) * S); off.add(rX);
      const rZ = rotulo(Math.round(m.deckD) + ' mm  (' + PALLET.mmToFtIn(m.deckD) + ')');
      rZ.position.set((m.deckW + 260) * S, 0.02, (m.deckD / 2) * S); off.add(rZ);
      const rY = rotulo('H ' + Math.round(m.alturaTotal) + ' mm  (' + PALLET.mmToFtIn(m.alturaTotal) + ')');
      rY.position.set(-260 * S, (m.alturaTotal / 2) * S, (m.deckD / 2) * S); off.add(rY);
    }
    return m;
  };

  api.dispose = function (){
    vivo = false;
    window.removeEventListener('resize', onResize);
    limpar(raiz);
    controls.dispose();
    renderer.dispose();
    if (renderer.domElement && renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
  };

  return api;
};
