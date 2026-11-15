// ==========================================================================
// GALERIA DE FAVORITOS (2026-11-15, migration 298)
// ==========================================================================
// Matt: "quero criar uma galeria de favoritos, quando o usuario cria uma
// composicao do construtor ou grupo que ele goste ele pode clicar e
// favoritar, ele coloca nome, ele pode criar uma pasta com nome e colocar
// suas criacoes ali, pra usar em outros projetos. fica registrado na conta de
// cada usuario."
//
// · Favoritar: ★ na barrinha do módulo selecionado (#po-proj-slot-actions)
//   ou "★ Favoritar" no menu do grupo/seleção (botão direito, portal-06c).
//   Guarda o módulo COMO ESTÁ (árvore do Construtor, cores, puxador, LED,
//   ajustes…) no mesmo formato de serializeProjectSlots (portal-08), com as
//   posições relativas ao 1º módulo.
// · Galeria: botão "Favoritos" na barra do Projetos (#po-proj-favs-btn).
//   Pastas (criar/renomear/apagar, arrastar card pra pasta), busca, inserir
//   no projeto aberto, renomear, mover, excluir.
// · Inserir: buildProjectSlotsFromConfigs (portal-09) = o MESMO motor que
//   abre um projeto salvo. Parede ativa, logo depois do último módulo dela
//   (senão no começo); ilha no centro do ambiente. 2+ módulos voltam como
//   grupo com o nome do favorito. 1 passo no Desfazer.
// Tabelas: user_favorite_folders / user_favorites (RLS = só o dono).
// ==========================================================================
(function () {
  const I18N = {
    pt: {
      tb_group: 'Favoritos', btn: 'Favoritos', btn_title: 'Galeria de favoritos (seus módulos e grupos salvos)',
      fav_btn: 'Favoritar', fav_title: 'Salvar nos favoritos',
      save_title: 'Salvar nos favoritos', name: 'Nome', name_ph: 'Ex.: Gaveteiro 4 gavetas 60',
      folder: 'Pasta', no_folder: 'Sem pasta', new_folder_opt: '+ Nova pasta…', new_folder_prompt: 'Nome da pasta:',
      save: 'Salvar', cancel: 'Cancelar', saving: 'Salvando…', saved: 'Salvo nos favoritos: {{n}}',
      need_login: 'Entre na sua conta pra usar os favoritos.', need_sel: 'Selecione um módulo ou grupo primeiro.',
      need_migration: 'A tabela de favoritos ainda não existe no banco (rodar a migration 298).',
      gallery_title: 'Meus favoritos', all: 'Todos', search_ph: 'Buscar…', new_folder: '+ Nova pasta',
      rename: 'Renomear', del: 'Excluir', insert: 'Inserir no projeto', move_to: 'Mover para…',
      empty: 'Nenhum favorito aqui ainda. Selecione um módulo (ou um grupo) no projeto e clique em ★ Favoritar.',
      modules: '{{n}} módulos', module: '1 módulo', group_kind: 'Grupo',
      del_fav_confirm: 'Excluir o favorito "{{n}}"?', del_folder_confirm: 'Apagar a pasta "{{n}}"? Os favoritos dela vão pra "Sem pasta".',
      rename_prompt: 'Novo nome:', inserted: '"{{n}}" inserido no projeto.', inserted_partial: '"{{n}}" inserido — {{k}} módulo(s) não existem mais no catálogo e ficaram de fora.',
      insert_fail: 'Não deu pra inserir: nenhum módulo deste favorito existe mais no catálogo.',
      open_project_first: 'Abra a tela de Projetos pra inserir.', loading: 'Carregando…', error: 'Erro: {{m}}',
      icon_title: 'Refazer o ícone', icon_fail: 'Não deu pra gerar o ícone.',
      drag_hint: 'Dica: arraste um card até uma pasta pra mover.'
    },
    en: {
      tb_group: 'Favorites', btn: 'Favorites', btn_title: 'Favorites gallery (your saved modules and groups)',
      fav_btn: 'Favorite', fav_title: 'Save to favorites',
      save_title: 'Save to favorites', name: 'Name', name_ph: 'E.g.: 4-drawer base 24"',
      folder: 'Folder', no_folder: 'No folder', new_folder_opt: '+ New folder…', new_folder_prompt: 'Folder name:',
      save: 'Save', cancel: 'Cancel', saving: 'Saving…', saved: 'Saved to favorites: {{n}}',
      need_login: 'Sign in to use favorites.', need_sel: 'Select a module or group first.',
      need_migration: 'The favorites table does not exist in the database yet (run migration 298).',
      gallery_title: 'My favorites', all: 'All', search_ph: 'Search…', new_folder: '+ New folder',
      rename: 'Rename', del: 'Delete', insert: 'Insert into project', move_to: 'Move to…',
      empty: 'No favorites here yet. Select a module (or a group) in the project and click ★ Favorite.',
      modules: '{{n}} modules', module: '1 module', group_kind: 'Group',
      del_fav_confirm: 'Delete favorite "{{n}}"?', del_folder_confirm: 'Delete folder "{{n}}"? Its favorites go to "No folder".',
      rename_prompt: 'New name:', inserted: '"{{n}}" inserted into the project.', inserted_partial: '"{{n}}" inserted — {{k}} module(s) no longer exist in the catalog and were left out.',
      insert_fail: 'Could not insert: none of this favorite\'s modules exist in the catalog anymore.',
      open_project_first: 'Open the Projects screen to insert.', loading: 'Loading…', error: 'Error: {{m}}',
      icon_title: 'Redo the icon', icon_fail: 'Could not generate the icon.',
      drag_hint: 'Tip: drag a card onto a folder to move it.'
    },
    es: {
      tb_group: 'Favoritos', btn: 'Favoritos', btn_title: 'Galería de favoritos (sus módulos y grupos guardados)',
      fav_btn: 'Favorito', fav_title: 'Guardar en favoritos',
      save_title: 'Guardar en favoritos', name: 'Nombre', name_ph: 'Ej.: Cajonera 4 cajones 60',
      folder: 'Carpeta', no_folder: 'Sin carpeta', new_folder_opt: '+ Nueva carpeta…', new_folder_prompt: 'Nombre de la carpeta:',
      save: 'Guardar', cancel: 'Cancelar', saving: 'Guardando…', saved: 'Guardado en favoritos: {{n}}',
      need_login: 'Inicie sesión para usar favoritos.', need_sel: 'Seleccione un módulo o grupo primero.',
      need_migration: 'La tabla de favoritos aún no existe en la base de datos (ejecutar migration 298).',
      gallery_title: 'Mis favoritos', all: 'Todos', search_ph: 'Buscar…', new_folder: '+ Nueva carpeta',
      rename: 'Renombrar', del: 'Eliminar', insert: 'Insertar en el proyecto', move_to: 'Mover a…',
      empty: 'Aún no hay favoritos aquí. Seleccione un módulo (o un grupo) en el proyecto y haga clic en ★ Favorito.',
      modules: '{{n}} módulos', module: '1 módulo', group_kind: 'Grupo',
      del_fav_confirm: '¿Eliminar el favorito "{{n}}"?', del_folder_confirm: '¿Eliminar la carpeta "{{n}}"? Sus favoritos van a "Sin carpeta".',
      rename_prompt: 'Nuevo nombre:', inserted: '"{{n}}" insertado en el proyecto.', inserted_partial: '"{{n}}" insertado — {{k}} módulo(s) ya no existen en el catálogo y quedaron fuera.',
      insert_fail: 'No se pudo insertar: ningún módulo de este favorito existe ya en el catálogo.',
      open_project_first: 'Abra la pantalla de Proyectos para insertar.', loading: 'Cargando…', error: 'Error: {{m}}',
      icon_title: 'Rehacer el ícono', icon_fail: 'No se pudo generar el ícono.',
      drag_hint: 'Consejo: arrastre una tarjeta a una carpeta para moverla.'
    }
  };
  const lang = () => { try { return (window.I18n && I18n.getLanguage && I18n.getLanguage()) || 'pt'; } catch (e) { return 'pt'; } };
  const t = (k, vars) => {
    const d = I18N[lang()] || I18N.pt;
    let s = d[k] != null ? d[k] : (I18N.pt[k] != null ? I18N.pt[k] : k);
    Object.keys(vars || {}).forEach((v) => { s = s.split('{{' + v + '}}').join(String(vars[v])); });
    return s;
  };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const STAR = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z"/></svg>';

  // ---------------- estilo (auto-contido) ----------------
  const css = `
  .po-fav-ov { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: none; align-items: center; justify-content: center; z-index: 1500; padding: 16px; }
  .po-fav-ov.open { display: flex; }
  .po-fav-card { background: #fff; border-radius: 12px; box-shadow: 0 12px 40px rgba(0,0,0,.25); width: min(980px, 96vw); max-height: 92vh; display: flex; flex-direction: column; overflow: hidden; color: #1b1f27; }
  .po-fav-card.small { width: min(460px, 96vw); }
  .po-fav-head { display: flex; align-items: center; gap: 10px; padding: 14px 18px; border-bottom: 1px solid #eceef2; }
  .po-fav-head h3 { margin: 0; font-size: 17px; flex: 1; }
  .po-fav-x { border: 0; background: none; font-size: 22px; cursor: pointer; color: #5b616e; line-height: 1; }
  .po-fav-body { display: grid; grid-template-columns: 220px 1fr; min-height: 0; flex: 1; }
  .po-fav-side { border-right: 1px solid #eceef2; padding: 10px; overflow: auto; display: flex; flex-direction: column; gap: 4px; background: #fafbfc; }
  .po-fav-folder { display: flex; align-items: center; gap: 6px; padding: 7px 9px; border-radius: 8px; cursor: pointer; font-size: 13px; border: 1px solid transparent; }
  .po-fav-folder:hover { background: #eef1f6; }
  .po-fav-folder.active { background: #1b1f27; color: #fff; }
  .po-fav-folder.drop { border-color: #2e90fa; background: #e8f3ff; color: #1b1f27; }
  .po-fav-folder .nm { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .po-fav-folder .ct { font-size: 11px; opacity: .7; }
  .po-fav-folder .ac { display: none; gap: 2px; }
  .po-fav-folder:hover .ac { display: inline-flex; }
  .po-fav-folder .ac button { border: 0; background: none; cursor: pointer; font-size: 12px; padding: 0 3px; color: inherit; opacity: .8; }
  .po-fav-newfolder { margin-top: 6px; padding: 7px 9px; border: 1px dashed #b9bfca; border-radius: 8px; background: #fff; cursor: pointer; font-size: 13px; text-align: left; }
  .po-fav-main { padding: 12px 14px; overflow: auto; display: flex; flex-direction: column; gap: 10px; }
  .po-fav-tools { display: flex; gap: 8px; align-items: center; }
  .po-fav-tools input { flex: 1; padding: 7px 10px; border: 1px solid #d5d9e0; border-radius: 8px; font-size: 13px; }
  .po-fav-hint { font-size: 12px; color: #5b616e; }
  .po-fav-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px; }
  .po-fav-item { border: 1px solid #e3e6ec; border-radius: 10px; overflow: hidden; display: flex; flex-direction: column; background: #fff; }
  .po-fav-item[draggable="true"] { cursor: grab; }
  .po-fav-thumb { height: 130px; background: #f3f5f8 center/contain no-repeat; display: flex; align-items: center; justify-content: center; color: #b9bfca; }
  .po-fav-info { padding: 8px 10px 4px; }
  .po-fav-info strong { display: block; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .po-fav-info span { font-size: 11px; color: #5b616e; }
  .po-fav-btns { display: flex; flex-wrap: wrap; gap: 4px; padding: 6px 10px 10px; align-items: center; }
  .po-fav-btns button, .po-fav-btns select { font-size: 11px; padding: 4px 7px; border-radius: 6px; border: 1px solid #d5d9e0; background: #fff; cursor: pointer; }
  .po-fav-btns .pri { background: #1b1f27; color: #fff; border-color: #1b1f27; flex-basis: 100%; padding: 6px 7px; font-size: 12px; }
  .po-fav-btns .dg { color: #b42318; }
  .po-fav-btns select { max-width: 110px; }
  .po-fav-empty { color: #5b616e; font-size: 13px; padding: 28px 8px; text-align: center; }
  .po-fav-form { padding: 14px 18px; display: grid; gap: 10px; }
  .po-fav-form label { font-size: 12px; font-weight: 600; color: #5b616e; display: grid; gap: 4px; }
  .po-fav-form input, .po-fav-form select { padding: 8px 10px; border: 1px solid #d5d9e0; border-radius: 8px; font-size: 14px; }
  .po-fav-form .prev { height: 150px; border-radius: 8px; background: #f3f5f8 center/contain no-repeat; }
  .po-fav-actions { display: flex; gap: 8px; justify-content: flex-end; padding: 0 18px 16px; }
  .po-fav-actions button { padding: 8px 14px; border-radius: 8px; border: 1px solid #d5d9e0; background: #fff; cursor: pointer; font-size: 13px; }
  .po-fav-actions .pri { background: #1b1f27; color: #fff; border-color: #1b1f27; }
  .po-fav-msg { font-size: 12px; color: #b42318; min-height: 16px; }
  .po-fav-toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); background: #1b1f27; color: #fff; padding: 9px 16px; border-radius: 20px; font-size: 13px; z-index: 1600; box-shadow: 0 6px 20px rgba(0,0,0,.25); }
  @media (max-width: 680px) { .po-fav-body { grid-template-columns: 1fr; } .po-fav-side { border-right: 0; border-bottom: 1px solid #eceef2; flex-direction: row; flex-wrap: wrap; } }
  `;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  function toast(msg) {
    const el = document.createElement('div'); el.className = 'po-fav-toast'; el.textContent = msg;
    document.body.appendChild(el); setTimeout(() => el.remove(), 3500);
  }
  const user = () => (typeof currentUser !== 'undefined' && currentUser) ? currentUser : null;
  const sb = () => (typeof supabaseClient !== 'undefined') ? supabaseClient : null;
  const errMsg = (e) => {
    const m = (e && (e.message || e.details)) || String(e);
    return /user_favorite|schema cache|does not exist/i.test(m) ? t('need_migration') : t('error', { m });
  };

  // ---------------- dados ----------------
  let folders = [];
  let favs = [];
  async function loadAll() {
    const c = sb(); if (!c || !user()) throw new Error(t('need_login'));
    const [fr, vr] = await Promise.all([
      c.from('user_favorite_folders').select('id,name,created_at').order('name'),
      c.from('user_favorites').select('id,folder_id,name,kind,module_count,thumbnail_data_url,created_at').order('created_at', { ascending: false })
    ]);
    if (fr.error) throw fr.error;
    if (vr.error) throw vr.error;
    folders = fr.data || [];
    favs = vr.data || [];
  }
  async function createFolder(name) {
    const { data, error } = await sb().from('user_favorite_folders').insert({ user_id: user().id, name }).select('id,name,created_at').single();
    if (error) throw error;
    folders.push(data); folders.sort((a, b) => a.name.localeCompare(b.name));
    return data;
  }

  // ---------------- capturar seleção ----------------
  function selectionMembers(idsIn) {
    let ids = idsIn ? Array.from(idsIn) : [];
    if (!ids.length) {
      if (projectMultiSelectIds && projectMultiSelectIds.size >= 2) ids = Array.from(projectMultiSelectIds);
      else if (selectedProjectSlotId != null) {
        const s = projectSlots.find((x) => x.id === selectedProjectSlotId);
        ids = (s && s.group_id) ? projectSlots.filter((x) => x.group_id === s.group_id).map((x) => x.id) : [selectedProjectSlotId];
      }
    }
    const set = new Set(ids);
    return projectSlots.filter((s) => set.has(s.id));
  }

  // Posições relativas: parede = a partir da 1ª parede do grupo; x = a partir
  // do menor x daquela parede; ilha = a partir do centro das ilhas do grupo.
  function serializeMembers(members) {
    const ids = new Set(members.map((s) => s.id));
    const all = serializeProjectSlots().filter((c) => ids.has(c.id));
    const wall = all.filter((c) => c.placement !== 'floor');
    const floor = all.filter((c) => c.placement === 'floor');
    const minWall = wall.length ? Math.min(...wall.map((c) => c.wall_index)) : 0;
    const minXByWall = {};
    wall.forEach((c) => { minXByWall[c.wall_index] = Math.min(minXByWall[c.wall_index] != null ? minXByWall[c.wall_index] : Infinity, c.x_mm); });
    const fcx = floor.length ? floor.reduce((a, c) => a + c.floor_x_mm, 0) / floor.length : 0;
    const fcz = floor.length ? floor.reduce((a, c) => a + c.floor_z_mm, 0) / floor.length : 0;
    return all.map((c) => {
      const o = JSON.parse(JSON.stringify(c));
      delete o.id; o.group_id = null; o.group_name = null; o.thumbnail_data_url = null;
      if (o.placement === 'floor') { o.floor_x_mm -= fcx; o.floor_z_mm -= fcz; }
      else { o.x_mm -= minXByWall[o.wall_index]; o.wall_index -= minWall; }
      return o;
    });
  }

  // Ícone do produto (15/11, Matt: "colocar o icone do produto criado
  // independente se for unico ou agrupado"): SÓ os módulos escolhidos, sem
  // parede/chão/teto, enquadrado neles. Usa um viewer ESCONDIDO próprio
  // (ViewerComposition.createInstance, mesmo truque da miniatura por SKU em
  // portal-01) — a cena do projeto não é tocada.
  let favViewer = null;
  function getFavViewer() {
    if (favViewer) return favViewer;
    if (typeof ViewerComposition === 'undefined' || !ViewerComposition.createInstance) return null;
    let host = document.getElementById('po-fav-hidden-viewer');
    if (!host) {
      host = document.createElement('div');
      host.id = 'po-fav-hidden-viewer';
      host.style.cssText = 'position:absolute; left:-9999px; top:0; width:480px; height:400px;';
      document.body.appendChild(host);
    }
    favViewer = ViewerComposition.createInstance();
    favViewer.init('po-fav-hidden-viewer');
    return favViewer;
  }
  async function captureMembersThumb(members) {
    try {
      const viewer = getFavViewer();
      if (!viewer || typeof buildProjectAssemblies !== 'function') return null;
      const visiveis = members.filter((s) => !s.oculto);
      if (!visiveis.length) return null;
      const wallMembers = visiveis.filter((s) => !isFloorSlot(s));
      const floorMembers = visiveis.filter((s) => isFloorSlot(s));
      const walls = [...new Set(wallMembers.map((s) => Number(s.wall_index || 0)))];
      let angle = null;
      if (walls.length <= 1 && !floorMembers.length) {
        // Uma parede só: parede "neutra" (de frente, x a partir do 1º módulo)
        // e foto 3/4 de catálogo.
        const minX = Math.min(...wallMembers.map((s) => Number(s.x_mm || 0)));
        const maxX = Math.max(...wallMembers.map((s) => Number(s.x_mm || 0) + Number(s.width_mm || 0)));
        const asm = buildProjectAssemblies(wallMembers);
        asm.forEach((a) => { a.x_m = Number(a.x_m || 0) - minX / 1000; });
        viewer.renderFreeformWalls([{
          wallIndex: 0, role: 'main', widthM: Math.max((maxX - minX) / 1000, 0.05),
          originX: 0, originZ: 0, alongDirX: 1, alongDirZ: 0, intoDirX: 0, intoDirZ: 1, rotationY: 0,
          assemblies: asm
        }], null, null, { floorAssemblies: [] });
        angle = 'three_quarter';
      } else {
        // Canto / ilha: geometria real, mas cada parede encolhida pro trecho
        // que tem módulo (senão a parede inteira entra no enquadramento).
        const geo = getProjectWallGeometry();
        const wallsData = walls.map((wi) => {
          const g = geo.find((w) => w.wallIndex === wi); if (!g) return null;
          const list = wallMembers.filter((s) => Number(s.wall_index || 0) === wi);
          const minX = Math.min(...list.map((s) => Number(s.x_mm || 0)));
          const maxX = Math.max(...list.map((s) => Number(s.x_mm || 0) + Number(s.width_mm || 0)));
          const asm = buildProjectAssemblies(list);
          asm.forEach((a) => { a.x_m = Number(a.x_m || 0) - minX / 1000; });
          return Object.assign({}, g, {
            widthM: Math.max((maxX - minX) / 1000, 0.05),
            originX: g.originX + g.alongDirX * minX / 1000,
            originZ: g.originZ + g.alongDirZ * minX / 1000,
            assemblies: asm
          });
        }).filter(Boolean);
        viewer.renderFreeformWalls(wallsData, null, null, { floorAssemblies: buildProjectAssemblies(floorMembers) });
        angle = 'corner';
      }
      if (typeof Viewer3D !== 'undefined' && Viewer3D.waitForPendingTextures) {
        try { await Viewer3D.waitForPendingTextures(); } catch (e) { /* ok */ }
      }
      const raw = viewer.snapshot({ angle });
      if (!raw) return null;
      const trimmed = (typeof trimTransparentPng === 'function') ? await trimTransparentPng(raw) : raw;
      return await shrink(trimmed || raw, 360);
    } catch (e) {
      console.warn('[favoritos] ícone não gerou', e);
      return null;
    }
  }
  // Mesma ideia de hydrateProjectLayoutPieces (portal-07), mas pra uma lista
  // solta (slots que ainda NÃO estão no projeto): carrega catálogo de
  // agregados/modelos e refaz as peças do Construtor antes da foto.
  async function hydrateLayoutOf(list) {
    if (!list.some((s) => s.layout || s.doorModelId || s.drawerModelId)) return;
    try { if (typeof ensureAccessoryCatalog === 'function') await ensureAccessoryCatalog(); } catch (e) { /* ok */ }
    try {
      if (list.some((s) => s.drawerModelId) && typeof ensureProjectDrawerModels === 'function') {
        await ensureProjectDrawerModels();
        await Promise.all(list.map((s) => { const m = projectSlotDrawerModel(s); return m ? loadDoorModelExtras(m.child_module_id).catch(() => null) : null; }));
      }
      if (list.some((s) => s.doorModelId) && typeof ensureProjectDoorModels === 'function') {
        await ensureProjectDoorModels();
        await Promise.all(list.map((s) => { const m = projectSlotDoorModel(s); return m ? loadDoorModelExtras(m.child_module_id).catch(() => null) : null; }));
      }
    } catch (e) { /* segue com o padrão */ }
    list.forEach((slot) => {
      try {
        if (slot.layout && typeof rebuildProjectSlotLayoutPieces === 'function') rebuildProjectSlotLayoutPieces(slot);
        else if (slot.doorModelId && typeof applySlotDoorModelColors === 'function') applySlotDoorModelColors(slot);
      } catch (e) { /* ok */ }
    });
  }
  function shrink(dataUrl, max) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(img.width * k)); cv.height = Math.max(1, Math.round(img.height * k));
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        resolve(cv.toDataURL('image/png'));
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  }

  // ---------------- janela "Salvar nos favoritos" ----------------
  function ensureSaveModal() {
    let ov = document.getElementById('po-fav-save-modal');
    if (ov) return ov;
    ov = document.createElement('div'); ov.id = 'po-fav-save-modal'; ov.className = 'po-fav-ov';
    ov.innerHTML = '<div class="po-fav-card small" role="dialog" aria-modal="true">'
      + '<div class="po-fav-head"><h3 data-k="save_title"></h3><button type="button" class="po-fav-x" data-act="close">×</button></div>'
      + '<div class="po-fav-form"><div class="prev" id="po-fav-save-prev"></div>'
      + '<label><span data-k="name"></span><input type="text" id="po-fav-save-name" maxlength="120"></label>'
      + '<label><span data-k="folder"></span><select id="po-fav-save-folder"></select></label>'
      + '<div class="po-fav-msg" id="po-fav-save-msg"></div></div>'
      + '<div class="po-fav-actions"><button type="button" data-act="close" data-k="cancel"></button><button type="button" class="pri" data-act="save" data-k="save"></button></div></div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', (e) => {
      if (e.target === ov) return closeSave();
      const a = e.target.closest('[data-act]'); if (!a) return;
      if (a.dataset.act === 'close') closeSave();
      if (a.dataset.act === 'save') doSave();
    });
    ov.querySelector('#po-fav-save-folder').addEventListener('change', async (e) => {
      if (e.target.value !== '__new') return;
      const nm = (prompt(t('new_folder_prompt')) || '').trim();
      if (!nm) { e.target.value = ''; return; }
      try { const f = await createFolder(nm); fillFolderSelect(e.target, f.id); } catch (err) { setSaveMsg(errMsg(err)); e.target.value = ''; }
    });
    ov.querySelector('#po-fav-save-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') doSave(); if (e.key === 'Escape') closeSave(); });
    return ov;
  }
  function fillFolderSelect(sel, selectedId) {
    sel.innerHTML = '<option value="">' + esc(t('no_folder')) + '</option>'
      + folders.map((f) => '<option value="' + esc(f.id) + '">' + esc(f.name) + '</option>').join('')
      + '<option value="__new">' + esc(t('new_folder_opt')) + '</option>';
    sel.value = selectedId || '';
  }
  const setSaveMsg = (m) => { const el = document.getElementById('po-fav-save-msg'); if (el) el.textContent = m || ''; };
  let pending = null; // { members, slots, thumb }
  let lastFolderId = '';
  function closeSave() { const ov = document.getElementById('po-fav-save-modal'); if (ov) ov.classList.remove('open'); pending = null; }

  async function openSaveFavoriteDialog(ids) {
    if (!user()) return toast(t('need_login'));
    const members = selectionMembers(ids);
    if (!members.length) return toast(t('need_sel'));
    const ov = ensureSaveModal();
    ov.querySelectorAll('[data-k]').forEach((el) => { el.textContent = t(el.dataset.k); });
    const nameEl = ov.querySelector('#po-fav-save-name');
    nameEl.placeholder = t('name_ph');
    const first = members[0];
    nameEl.value = (members.length > 1 && first.group_name) ? first.group_name : ((first.module && first.module.name) || '');
    setSaveMsg('');
    const prev = ov.querySelector('#po-fav-save-prev'); prev.style.backgroundImage = '';
    ov.classList.add('open');
    setTimeout(() => { nameEl.focus(); nameEl.select(); }, 30);
    pending = { members, slots: serializeMembers(members), thumb: null };
    const myPending = pending;
    const sel = ov.querySelector('#po-fav-save-folder');
    try { await loadAll(); fillFolderSelect(sel, folders.some((f) => f.id === lastFolderId) ? lastFolderId : ''); }
    catch (e) { fillFolderSelect(sel, ''); setSaveMsg(errMsg(e)); }
    const thumb = await captureMembersThumb(members);
    if (pending !== myPending) return;
    pending.thumb = thumb;
    if (thumb) prev.style.backgroundImage = 'url("' + thumb + '")';
  }

  async function doSave() {
    if (!pending) return;
    const ov = document.getElementById('po-fav-save-modal');
    const name = (ov.querySelector('#po-fav-save-name').value || '').trim();
    if (!name) { ov.querySelector('#po-fav-save-name').focus(); return; }
    let folderId = ov.querySelector('#po-fav-save-folder').value;
    if (folderId === '__new') folderId = '';
    const btn = ov.querySelector('[data-act="save"]');
    btn.disabled = true; btn.textContent = t('saving');
    try {
      const row = {
        user_id: user().id, name, folder_id: folderId || null,
        kind: pending.slots.length > 1 ? 'group' : 'module',
        module_count: pending.slots.length, slots: pending.slots,
        thumbnail_data_url: pending.thumb || null
      };
      const { error } = await sb().from('user_favorites').insert(row);
      if (error) throw error;
      lastFolderId = folderId || '';
      closeSave();
      toast(t('saved', { n: name }));
      if (galleryOpen()) { await loadAll(); renderGallery(); }
    } catch (e) { setSaveMsg(errMsg(e)); }
    finally { btn.disabled = false; btn.textContent = t('save'); }
  }

  // ---------------- galeria ----------------
  let curFolder = 'all'; // 'all' | 'none' | id
  let query = '';
  const galleryOpen = () => { const ov = document.getElementById('po-fav-gallery'); return !!(ov && ov.classList.contains('open')); };
  function ensureGallery() {
    let ov = document.getElementById('po-fav-gallery');
    if (ov) return ov;
    ov = document.createElement('div'); ov.id = 'po-fav-gallery'; ov.className = 'po-fav-ov';
    ov.innerHTML = '<div class="po-fav-card" role="dialog" aria-modal="true">'
      + '<div class="po-fav-head">' + STAR + '<h3 id="po-fav-g-title"></h3><button type="button" class="po-fav-x" data-act="close">×</button></div>'
      + '<div class="po-fav-body"><div class="po-fav-side" id="po-fav-g-side"></div>'
      + '<div class="po-fav-main"><div class="po-fav-tools"><input type="search" id="po-fav-g-search"></div>'
      + '<div class="po-fav-hint" id="po-fav-g-hint"></div><div class="po-fav-grid" id="po-fav-g-grid"></div></div></div></div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', onGalleryClick);
    ov.addEventListener('change', onGalleryChange);
    ov.querySelector('#po-fav-g-search').addEventListener('input', (e) => { query = e.target.value.trim().toLowerCase(); renderGrid(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && galleryOpen()) ov.classList.remove('open'); });
    // arrastar card -> pasta
    ov.addEventListener('dragstart', (e) => {
      const it = e.target.closest && e.target.closest('.po-fav-item'); if (!it) return;
      e.dataTransfer.setData('text/plain', it.dataset.id); e.dataTransfer.effectAllowed = 'move';
    });
    ov.addEventListener('dragover', (e) => {
      const f = e.target.closest && e.target.closest('.po-fav-folder[data-folder]'); if (!f || f.dataset.folder === 'all') return;
      e.preventDefault(); f.classList.add('drop');
    });
    ov.addEventListener('dragleave', (e) => { const f = e.target.closest && e.target.closest('.po-fav-folder'); if (f) f.classList.remove('drop'); });
    ov.addEventListener('drop', (e) => {
      const f = e.target.closest && e.target.closest('.po-fav-folder[data-folder]'); if (!f || f.dataset.folder === 'all') return;
      e.preventDefault(); f.classList.remove('drop');
      const id = e.dataTransfer.getData('text/plain');
      if (id) moveFav(id, f.dataset.folder === 'none' ? null : f.dataset.folder);
    });
    return ov;
  }
  async function openFavoritesGallery() {
    if (!user()) return toast(t('need_login'));
    const ov = ensureGallery();
    ov.querySelector('#po-fav-g-title').textContent = t('gallery_title');
    ov.querySelector('#po-fav-g-search').placeholder = t('search_ph');
    ov.querySelector('#po-fav-g-hint').textContent = t('drag_hint');
    ov.querySelector('#po-fav-g-grid').innerHTML = '<div class="po-fav-empty">' + esc(t('loading')) + '</div>';
    ov.classList.add('open');
    try { await loadAll(); renderGallery(); }
    catch (e) { ov.querySelector('#po-fav-g-grid').innerHTML = '<div class="po-fav-empty">' + esc(errMsg(e)) + '</div>'; }
  }
  function renderGallery() { renderSide(); renderGrid(); }
  function renderSide() {
    const side = document.getElementById('po-fav-g-side'); if (!side) return;
    if (curFolder !== 'all' && curFolder !== 'none' && !folders.some((f) => f.id === curFolder)) curFolder = 'all';
    const cnt = (fid) => favs.filter((v) => fid === 'all' ? true : fid === 'none' ? !v.folder_id : v.folder_id === fid).length;
    const row = (fid, name, editable) => '<div class="po-fav-folder' + (curFolder === fid ? ' active' : '') + '" data-folder="' + esc(fid) + '">'
      + '<span>' + (fid === 'all' ? '★' : '📁') + '</span><span class="nm">' + esc(name) + '</span>'
      + (editable ? '<span class="ac"><button type="button" data-act="ren-folder" title="' + esc(t('rename')) + '">✎</button><button type="button" data-act="del-folder" title="' + esc(t('del')) + '">✕</button></span>' : '')
      + '<span class="ct">' + cnt(fid) + '</span></div>';
    side.innerHTML = row('all', t('all'), false) + row('none', t('no_folder'), false)
      + folders.map((f) => row(f.id, f.name, true)).join('')
      + '<button type="button" class="po-fav-newfolder" data-act="new-folder">' + esc(t('new_folder')) + '</button>';
  }
  function renderGrid() {
    const grid = document.getElementById('po-fav-g-grid'); if (!grid) return;
    const list = favs.filter((v) => (curFolder === 'all' ? true : curFolder === 'none' ? !v.folder_id : v.folder_id === curFolder)
      && (!query || (v.name || '').toLowerCase().includes(query)));
    if (!list.length) { grid.innerHTML = '<div class="po-fav-empty">' + esc(t('empty')) + '</div>'; return; }
    const moveOpts = (v) => '<option value="">' + esc(t('move_to')) + '</option>'
      + '<option value="__none"' + (!v.folder_id ? ' disabled' : '') + '>' + esc(t('no_folder')) + '</option>'
      + folders.map((f) => '<option value="' + esc(f.id) + '"' + (v.folder_id === f.id ? ' disabled' : '') + '>' + esc(f.name) + '</option>').join('');
    grid.innerHTML = list.map((v) => {
      const n = Number(v.module_count || 1);
      const sub = (n > 1 ? t('group_kind') + ' · ' + t('modules', { n }) : t('module'));
      const th = v.thumbnail_data_url ? ' style="background-image:url(&quot;' + esc(v.thumbnail_data_url) + '&quot;)"' : '';
      return '<div class="po-fav-item" draggable="true" data-id="' + esc(v.id) + '">'
        + '<div class="po-fav-thumb"' + th + '>' + (v.thumbnail_data_url ? '' : STAR) + '</div>'
        + '<div class="po-fav-info"><strong title="' + esc(v.name) + '">' + esc(v.name) + '</strong><span>' + esc(sub) + '</span></div>'
        + '<div class="po-fav-btns"><button type="button" class="pri" data-act="insert">' + esc(t('insert')) + '</button>'
        + '<select data-act="move">' + moveOpts(v) + '</select>'
        + '<button type="button" data-act="icon-fav" title="' + esc(t('icon_title')) + '">↻</button>'
        + '<button type="button" data-act="ren-fav">' + esc(t('rename')) + '</button>'
        + '<button type="button" class="dg" data-act="del-fav">' + esc(t('del')) + '</button></div></div>';
    }).join('');
  }
  async function onGalleryClick(e) {
    const ov = document.getElementById('po-fav-gallery');
    if (e.target === ov) { ov.classList.remove('open'); return; }
    const a = e.target.closest('[data-act]');
    const folderEl = e.target.closest('.po-fav-folder');
    const itemEl = e.target.closest('.po-fav-item');
    try {
      if (a && a.dataset.act === 'close') { ov.classList.remove('open'); return; }
      if (a && a.dataset.act === 'new-folder') {
        const nm = (prompt(t('new_folder_prompt')) || '').trim(); if (!nm) return;
        const f = await createFolder(nm); curFolder = f.id; renderGallery(); return;
      }
      if (a && a.dataset.act === 'ren-folder' && folderEl) {
        const f = folders.find((x) => x.id === folderEl.dataset.folder); if (!f) return;
        const nm = (prompt(t('rename_prompt'), f.name) || '').trim(); if (!nm || nm === f.name) return;
        const { error } = await sb().from('user_favorite_folders').update({ name: nm }).eq('id', f.id);
        if (error) throw error; f.name = nm; renderGallery(); return;
      }
      if (a && a.dataset.act === 'del-folder' && folderEl) {
        const f = folders.find((x) => x.id === folderEl.dataset.folder); if (!f) return;
        if (!confirm(t('del_folder_confirm', { n: f.name }))) return;
        const { error } = await sb().from('user_favorite_folders').delete().eq('id', f.id);
        if (error) throw error;
        folders = folders.filter((x) => x.id !== f.id);
        favs.forEach((v) => { if (v.folder_id === f.id) v.folder_id = null; });
        if (curFolder === f.id) curFolder = 'all';
        renderGallery(); return;
      }
      if (!a && folderEl) { curFolder = folderEl.dataset.folder; renderGallery(); return; }
      if (!a || !itemEl || a.tagName === 'SELECT') return;
      const v = favs.find((x) => x.id === itemEl.dataset.id); if (!v) return;
      if (a.dataset.act === 'insert') {
        a.disabled = true; a.textContent = t('loading');
        try { const ok = await insertFavorite(v); if (ok) ov.classList.remove('open'); }
        finally { a.disabled = false; a.textContent = t('insert'); }
      } else if (a.dataset.act === 'icon-fav') {
        a.disabled = true;
        try {
          const { data, error } = await sb().from('user_favorites').select('slots').eq('id', v.id).single();
          if (error) throw error;
          const { restored } = await buildProjectSlotsFromConfigs((data && data.slots) || []);
          await hydrateLayoutOf(restored);
          const thumb = restored.length ? await captureMembersThumb(restored) : null;
          if (!thumb) throw new Error(t('icon_fail'));
          const up = await sb().from('user_favorites').update({ thumbnail_data_url: thumb, updated_at: new Date().toISOString() }).eq('id', v.id);
          if (up.error) throw up.error;
          v.thumbnail_data_url = thumb; renderGrid();
        } finally { a.disabled = false; }
      } else if (a.dataset.act === 'ren-fav') {
        const nm = (prompt(t('rename_prompt'), v.name) || '').trim(); if (!nm || nm === v.name) return;
        const { error } = await sb().from('user_favorites').update({ name: nm, updated_at: new Date().toISOString() }).eq('id', v.id);
        if (error) throw error; v.name = nm; renderGrid();
      } else if (a.dataset.act === 'del-fav') {
        if (!confirm(t('del_fav_confirm', { n: v.name }))) return;
        const { error } = await sb().from('user_favorites').delete().eq('id', v.id);
        if (error) throw error; favs = favs.filter((x) => x.id !== v.id); renderGallery();
      }
    } catch (err) { toast(errMsg(err)); }
  }
  function onGalleryChange(e) {
    const sel = e.target.closest('select[data-act="move"]'); if (!sel || !sel.value) return;
    const itemEl = sel.closest('.po-fav-item');
    moveFav(itemEl.dataset.id, sel.value === '__none' ? null : sel.value);
  }
  async function moveFav(id, folderId) {
    const v = favs.find((x) => x.id === id); if (!v || (v.folder_id || null) === (folderId || null)) { renderGrid(); return; }
    try {
      const { error } = await sb().from('user_favorites').update({ folder_id: folderId, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
      v.folder_id = folderId; renderGallery();
    } catch (err) { toast(errMsg(err)); renderGrid(); }
  }

  // ---------------- inserir no projeto ----------------
  async function insertFavorite(v) {
    if (typeof buildProjectSlotsFromConfigs !== 'function' || typeof projectSlots === 'undefined') { toast(t('open_project_first')); return false; }
    const { data, error } = await sb().from('user_favorites').select('slots').eq('id', v.id).single();
    if (error) throw error;
    const cfgs = (data && Array.isArray(data.slots)) ? data.slots : [];
    const { restored, skipped } = await buildProjectSlotsFromConfigs(cfgs);
    if (!restored.length) { toast(t('insert_fail')); return false; }

    // Garante que a aba Projetos está visível (o canvas mede a largura).
    const tab = document.getElementById('po-tab-projects');
    const projTabBtn = document.querySelector('#po-sidebar .portal-tab-btn[data-tab="po-tab-projects"]');
    if (projTabBtn && tab && tab.offsetParent === null) projTabBtn.click();

    const wallCount = Math.max(1, (typeof getProjectWallCount === 'function') ? getProjectWallCount() : 1);
    const baseWall = Math.min(Math.max(0, Number(projectActiveWallIndex || 0)), wallCount - 1);
    const wallMembers = restored.filter((s) => !isFloorSlot(s));

    // Parede: logo depois do último módulo da parede ativa, se couber.
    const groupW = wallMembers.filter((s) => Number(s.wall_index || 0) === 0)
      .reduce((m, s) => Math.max(m, Number(s.x_mm || 0) + Number(s.width_mm || 0)), 0);
    const onBase = projectSlots.filter((s) => !isFloorSlot(s) && Number(s.wall_index || 0) === baseWall);
    const endX = onBase.reduce((m, s) => Math.max(m, Number(s.x_mm || 0) + Number(s.width_mm || 0)), 0);
    const wallW = (typeof getProjectWallWidthMm === 'function') ? (Number(getProjectWallWidthMm(baseWall)) || 0) : 0;
    const startX = (wallW && endX + groupW <= wallW) ? endX : 0;

    // Ilha: centro do ambiente (média dos meios das paredes).
    let cx = 0, cz = 0;
    try {
      const geo = getProjectWallGeometry();
      if (geo.length) {
        geo.forEach((w) => { cx += w.originX + w.alongDirX * w.widthM / 2; cz += w.originZ + w.alongDirZ * w.widthM / 2; });
        cx = cx / geo.length * 1000; cz = cz / geo.length * 1000;
      }
    } catch (e) { /* sem geometria: 0,0 */ }

    const groupId = restored.length > 1 ? newProjectSlotId() : null;
    restored.forEach((s) => {
      s.id = newProjectSlotId();
      s.group_id = groupId; s.group_name = groupId ? v.name : null;
      if (isFloorSlot(s)) {
        s.floor_x_mm = Number(s.floor_x_mm || 0) + cx;
        s.floor_z_mm = Number(s.floor_z_mm || 0) + cz;
      } else {
        const rel = Number(s.wall_index || 0);
        s.wall_index = Math.min(baseWall + rel, wallCount - 1);
        s.x_mm = Number(s.x_mm || 0) + (rel === 0 ? startX : 0);
      }
    });
    restored.forEach((s) => projectSlots.push(s));
    restored.forEach((s) => {
      try { if (isFloorSlot(s)) clampFloorSlotIntoRoom(s); else clampProjectSlotPosition(s); } catch (e) { /* ok */ }
    });
    if (typeof hydrateProjectLayoutPieces === 'function') hydrateProjectLayoutPieces();
    if (restored.length > 1) {
      projectMultiSelectIds = new Set(restored.map((s) => s.id));
      selectedProjectSlotId = null;
    } else {
      projectMultiSelectIds = new Set();
      selectedProjectSlotId = restored[0].id;
    }
    if (typeof renderProjectCanvas === 'function') renderProjectCanvas();
    if (typeof renderProjectConfigPanel === 'function') renderProjectConfigPanel();
    if (typeof refreshProject3DMultiHighlight === 'function') refreshProject3DMultiHighlight();
    if (typeof refreshProject3DResizeArrows === 'function') refreshProject3DResizeArrows();
    if (typeof refreshProjectSlotActions === 'function') refreshProjectSlotActions();
    markProjectDirty();
    toast(skipped ? t('inserted_partial', { n: v.name, k: skipped }) : t('inserted', { n: v.name }));
    return true;
  }

  // ---------------- botões ----------------
  function bind() {
    const btn = document.getElementById('po-proj-favs-btn');
    if (btn && !btn._favBound) {
      btn._favBound = true;
      btn.addEventListener('click', openFavoritesGallery);
    }
    // ★ na barrinha do módulo selecionado
    const bar = document.getElementById('po-proj-slot-actions');
    if (bar && !document.getElementById('po-proj-slot-fav-btn')) {
      const b = document.createElement('button');
      b.type = 'button'; b.id = 'po-proj-slot-fav-btn'; b.className = 'po-proj-slot-action-btn';
      b.innerHTML = STAR;
      b.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); openSaveFavoriteDialog(); });
      const dup = document.getElementById('po-proj-slot-duplicate-btn');
      if (dup && dup.nextSibling) bar.insertBefore(b, dup.nextSibling); else bar.appendChild(b);
    }
    applyTexts();
  }
  function applyTexts() {
    const btn = document.getElementById('po-proj-favs-btn');
    if (btn) { btn.title = t('btn_title'); btn.setAttribute('aria-label', t('btn')); const sp = btn.querySelector('span'); if (sp) sp.textContent = t('btn'); }
    const lab = document.querySelector('#po-proj-tb-favs .po-tb-label'); if (lab) lab.textContent = t('tb_group');
    const b = document.getElementById('po-proj-slot-fav-btn'); if (b) { b.title = t('fav_title'); b.setAttribute('aria-label', t('fav_title')); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind); else bind();
  document.addEventListener('po:lang-changed', applyTexts);

  window.LegnoFavoritos = { t, open: openFavoritesGallery, save: openSaveFavoriteDialog, insert: insertFavorite };
  window.openSaveFavoriteDialog = openSaveFavoriteDialog;
  window.openFavoritesGallery = openFavoritesGallery;
})();
