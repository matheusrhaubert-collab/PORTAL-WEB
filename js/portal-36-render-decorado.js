// =============================================================================
// RENDER DECORADO (IA Services) — 2026-11-04, Matt com a SAHRA:
// "podemos fazer uma skill pra renderizar e gerar uma imagem realista com
// decoracao. e fazer um botao novo de IA service pra isso".
//
// Fluxo: base = ÚLTIMO render realista salvo no projeto (project_photoreal_
// photos, o path tracer — fiel à marcenaria) + texto livre de quem mora ali
// → Edge Function generate-gallery-render, mode:'decorate' (Gemini, prompt
// que proíbe mexer em qualquer móvel e só ACRESCENTA decoração/luz) →
// resultado entra na MESMA grade de fotos realistas do projeto.
// De propósito NÃO atualiza user_projects.ai_preview_url (que é a base do
// "Render com IA" da galeria): uma foto decorada não pode virar base de outra
// geração. Só administrador por enquanto (PROJECT_ADMIN_ONLY_BUTTON_IDS,
// portal-11). Decisões do Matt: base = render realista; briefing = só texto
// livre; acesso = só admin primeiro.
// =============================================================================
(function () {
  const TXT = {
    pt: {
      pick: 'Escolha o render realista que vai ser a base (o ângulo vem dele):',
      warnHigh: 'Atenção: este render foi feito de cima. A IA tende a reinventar o móvel nesse ângulo — refaça o render realista na altura dos olhos, de dentro do ambiente.',
      warnUnknown: 'Não sei de que ângulo este render foi feito (render antigo). Funciona melhor com câmera na altura dos olhos, de frente.',
      okAngle: 'Ângulo bom: altura dos olhos.',
      title: 'Render decorado (IA)',
      base: 'Base selecionada',
      noBase: 'Gere primeiro um render realista (Render > Gerar) com o projeto salvo — ele é a base fiel da marcenaria.',
      brief: 'Quem vai morar aqui? Idades, gostos, hobbies, cores, estilo, dia ou noite…',
      placeholder: 'Ex.: quarto do Lucas, 4 anos, ama caminhões e dinossauros; pais adoram viajar; foto da família na prateleira; noite com o LED aceso.',
      gen: 'Gerar imagem decorada', close: 'Fechar', working: 'Gerando com IA… pode levar até 1 minuto.',
      done: 'Pronto — salva na grade de fotos realistas do projeto. Imagem ilustrativa: decoração não inclusa.',
      fail: 'Não deu pra gerar: '
    },
    en: {
      pick: 'Choose the realistic render to use as the base (the angle comes from it):',
      warnHigh: 'Warning: this render was taken from above. The AI tends to reinvent the cabinetry at this angle — redo the realistic render at eye level, from inside the room.',
      warnUnknown: 'Unknown angle for this render (older render). Works best with an eye-level, frontal camera.',
      okAngle: 'Good angle: eye level.',
      title: 'Decorated render (AI)',
      base: 'Selected base',
      noBase: 'First generate a realistic render (Render > Generate) with the project saved — it is the faithful base of the cabinetry.',
      brief: 'Who will live here? Ages, tastes, hobbies, colors, style, day or night…',
      placeholder: 'E.g.: Lucas\'s room, 4 years old, loves trucks and dinosaurs; parents love travelling; family photo on the shelf; night with LEDs on.',
      gen: 'Generate decorated image', close: 'Close', working: 'Generating with AI… may take up to 1 minute.',
      done: 'Done — saved to the project\'s realistic photo grid. Illustrative image: decoration not included.',
      fail: 'Could not generate: '
    },
    es: {
      pick: 'Elija el render realista que será la base (el ángulo viene de él):',
      warnHigh: 'Atención: este render fue hecho desde arriba. La IA tiende a reinventar el mueble en ese ángulo — rehaga el render realista a la altura de los ojos, desde dentro del ambiente.',
      warnUnknown: 'Ángulo desconocido para este render (render antiguo). Funciona mejor con cámara a la altura de los ojos, de frente.',
      okAngle: 'Buen ángulo: altura de los ojos.',
      title: 'Render decorado (IA)',
      base: 'Base seleccionada',
      noBase: 'Primero genere un render realista (Render > Generar) con el proyecto guardado — es la base fiel de la carpintería.',
      brief: '¿Quién vivirá aquí? Edades, gustos, hobbies, colores, estilo, día o noche…',
      placeholder: 'Ej.: cuarto de Lucas, 4 años, ama los camiones y dinosaurios; padres viajeros; foto familiar en el estante; noche con LED encendido.',
      gen: 'Generar imagen decorada', close: 'Cerrar', working: 'Generando con IA… puede tardar hasta 1 minuto.',
      done: 'Listo — guardada en la grilla de fotos realistas del proyecto. Imagen ilustrativa: decoración no incluida.',
      fail: 'No se pudo generar: '
    }
  };
  function t(k) {
    let lang = 'pt';
    try { lang = (typeof I18n !== 'undefined' && I18n.getLanguage) ? I18n.getLanguage() : 'pt'; } catch (e) { /* padrão pt */ }
    const d = TXT[lang] || TXT.pt;
    return d[k] || TXT.pt[k] || k;
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  // Fotos realistas do projeto que podem ser BASE (exclui as já decoradas).
  // camera_state vem da migration 266; sem a coluna, cai pro select antigo.
  let decorPhotos = [];
  let decorSelected = null;
  async function loadBasePhotos() {
    decorPhotos = [];
    if (typeof loadedProjectFavorite === 'undefined' || !loadedProjectFavorite || !loadedProjectFavorite.id) return;
    let res = await supabaseClient.from('project_photoreal_photos')
      .select('id, image_url, created_at, camera_state')
      .eq('project_id', loadedProjectFavorite.id).order('created_at', { ascending: false });
    if (res.error) {
      res = await supabaseClient.from('project_photoreal_photos')
        .select('id, image_url, created_at')
        .eq('project_id', loadedProjectFavorite.id).order('created_at', { ascending: false });
    }
    decorPhotos = (res.data || []).filter((p) => !(p.camera_state && p.camera_state.decorated));
  }

  // Vista de cima = câmera acima de ~2 m OU olhando pra baixo mais que ~25°.
  function angleVerdict(cam) {
    if (!cam || !cam.position || !cam.target) return 'unknown';
    const p = cam.position, tg = cam.target;
    const dx = tg.x - p.x, dy = tg.y - p.y, dz = tg.z - p.z;
    const dist = Math.hypot(dx, dy, dz) || 1;
    const pitchDown = Math.asin(Math.max(-1, Math.min(1, -dy / dist))) * 180 / Math.PI;
    const ceiling = Number(cam.ceiling_m) || 2.6;
    if (p.y > Math.min(2.0, ceiling - 0.2) || pitchDown > 25) return 'high';
    return 'ok';
  }

  function ensureModal() {
    let modal = document.getElementById('po-decor-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'po-decor-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(20,18,16,.55);display:none;align-items:center;justify-content:center;z-index:10050;padding:16px;';
    modal.innerHTML = `
      <div style="background:#fff;border-radius:12px;max-width:1100px;width:100%;max-height:92vh;overflow:auto;padding:20px;box-shadow:0 20px 60px rgba(0,0,0,.3);font-family:inherit;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;">
          <strong id="po-decor-title" style="font-size:16px;"></strong>
          <button type="button" id="po-decor-close" class="po-btn-secondary" style="padding:6px 12px;"></button>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:16px;">
          <div style="flex:1 1 380px;min-width:0;">
            <div id="po-decor-base-label" style="font-size:12px;color:#6b6259;margin-bottom:6px;"></div>
            <img id="po-decor-base" alt="" style="width:100%;border-radius:8px;background:#f2efe9;display:none;" />
            <div id="po-decor-nobase" style="font-size:13px;color:#8a3b2e;display:none;"></div>
            <div id="po-decor-pick-label" style="font-size:12px;color:#6b6259;margin:10px 0 6px;"></div>
            <div id="po-decor-thumbs" style="display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;"></div>
            <div id="po-decor-angle" style="font-size:13px;margin-top:8px;"></div>
            <label for="po-decor-brief" id="po-decor-brief-label" style="display:block;font-size:13px;margin:12px 0 6px;"></label>
            <textarea id="po-decor-brief" rows="5" style="width:100%;box-sizing:border-box;font:inherit;font-size:13px;padding:10px;border:1px solid #d8d2c8;border-radius:8px;resize:vertical;"></textarea>
            <button type="button" id="po-decor-generate" class="po-btn-primary" style="margin-top:10px;padding:10px 16px;"></button>
            <div id="po-decor-status" style="font-size:13px;margin-top:10px;"></div>
          </div>
          <div style="flex:1 1 380px;min-width:0;">
            <img id="po-decor-result" alt="" style="width:100%;border-radius:8px;display:none;cursor:zoom-in;" />
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (ev) => { if (ev.target === modal) closeModal(); });
    modal.querySelector('#po-decor-close').addEventListener('click', closeModal);
    modal.querySelector('#po-decor-generate').addEventListener('click', generate);
    modal.querySelector('#po-decor-result').addEventListener('click', (ev) => {
      if (typeof openGalleryLightbox === 'function') openGalleryLightbox(ev.target.getAttribute('src'));
    });
    return modal;
  }

  function closeModal() {
    const m = document.getElementById('po-decor-modal');
    if (m) m.style.display = 'none';
  }

  function openModal() {
    const m = ensureModal();
    m.querySelector('#po-decor-title').textContent = t('title');
    m.querySelector('#po-decor-close').textContent = t('close');
    m.querySelector('#po-decor-base-label').textContent = t('base');
    m.querySelector('#po-decor-brief-label').textContent = t('brief');
    m.querySelector('#po-decor-brief').placeholder = t('placeholder');
    m.querySelector('#po-decor-generate').textContent = t('gen');
    m.querySelector('#po-decor-status').textContent = '';
    m.querySelector('#po-decor-pick-label').textContent = t('pick');
    m.style.display = 'flex';
    loadBasePhotos().then(() => {
      decorSelected = decorPhotos[0] || null;
      renderBase();
    });
  }

  function renderBase() {
    const m = ensureModal();
    const baseImg = m.querySelector('#po-decor-base');
    const noBase = m.querySelector('#po-decor-nobase');
    const thumbs = m.querySelector('#po-decor-thumbs');
    const angle = m.querySelector('#po-decor-angle');
    const genBtn = m.querySelector('#po-decor-generate');
    if (!decorSelected) {
      baseImg.style.display = 'none'; thumbs.innerHTML = ''; angle.textContent = '';
      noBase.textContent = t('noBase'); noBase.style.display = 'block';
      genBtn.disabled = true;
      return;
    }
    noBase.style.display = 'none';
    baseImg.src = decorSelected.image_url; baseImg.style.display = 'block';
    genBtn.disabled = false;
    thumbs.innerHTML = '';
    decorPhotos.forEach((p) => {
      const b = document.createElement('button');
      b.type = 'button';
      const sel = p === decorSelected;
      b.style.cssText = 'flex:0 0 auto;padding:0;border:2px solid ' + (sel ? '#2b2621' : 'transparent') + ';border-radius:6px;background:none;cursor:pointer;';
      b.setAttribute('aria-label', new Date(p.created_at).toLocaleString());
      const img = document.createElement('img');
      img.src = p.image_url; img.alt = '';
      img.style.cssText = 'display:block;width:96px;height:72px;object-fit:cover;border-radius:4px;';
      b.appendChild(img);
      b.addEventListener('click', () => { decorSelected = p; renderBase(); });
      thumbs.appendChild(b);
    });
    const v = angleVerdict(decorSelected.camera_state);
    angle.style.color = v === 'high' ? '#8a3b2e' : (v === 'ok' ? '#2f6b3a' : '#6b6259');
    angle.textContent = v === 'high' ? t('warnHigh') : (v === 'ok' ? t('okAngle') : t('warnUnknown'));
  }

  async function saveDecorated(dataUrl) {
    // Mesma grade de fotos do path tracer, mas SEM tocar em ai_preview_url
    // (ver comentário do topo).
    if (!loadedProjectFavorite || !loadedProjectFavorite.id) return;
    const publicUrl = await uploadGalleryImageToStorage(dataUrl);
    let { data: row, error } = await supabaseClient
      .from('project_photoreal_photos')
      .insert({ project_id: loadedProjectFavorite.id, image_url: publicUrl, camera_state: { decorated: true } })
      .select('id, image_url, created_at')
      .single();
    let row2 = row;
    if (error) {
      // sem a migration 266: grava sem a marca (aparece como base, mas não trava)
      const r2 = await supabaseClient.from('project_photoreal_photos')
        .insert({ project_id: loadedProjectFavorite.id, image_url: publicUrl })
        .select('id, image_url, created_at').single();
      if (r2.error) throw r2.error;
      row2 = r2.data;
    }
    projectPhotorealPhotos = [row2, ...projectPhotorealPhotos];
    if (typeof renderProjectPhotorealGallery === 'function') renderProjectPhotorealGallery();
  }

  async function generate() {
    const m = ensureModal();
    const btn = m.querySelector('#po-decor-generate');
    const status = m.querySelector('#po-decor-status');
    const resultImg = m.querySelector('#po-decor-result');
    if (!decorSelected) return;
    const url = decorSelected.image_url;
    btn.disabled = true;
    status.style.color = '#6b6259';
    status.textContent = t('working');
    try {
      const blob = await (await fetch(url, { cache: 'no-store' })).blob();
      const baseDataUrl = await blobToDataUrl(blob);
      let aspectRatio = null;
      try {
        const ratio = await getImageAspectRatio(baseDataUrl);
        aspectRatio = (typeof nearestSupportedAspectRatio === 'function') ? nearestSupportedAspectRatio(ratio) : null;
      } catch (e) { aspectRatio = null; }
      const familyBrief = (m.querySelector('#po-decor-brief').value || '').trim();
      // Cores e referências: o MESMO pacote que o Render com IA da galeria já
      // manda (Matt, 04/11: "usar a ia de imagem que ja temos, ela ja manda as
      // cores certinho") — ver generateAiPreviewForProjectGallery, portal-09.
      let moduleRefImages = [], colorLabel = null, colorRefImages = [];
      try {
        const [refs, label, colorRefs] = await Promise.all([
          (typeof fetchReferencePhotosForProject === 'function') ? fetchReferencePhotosForProject() : { moduleRefImages: [] },
          (typeof buildColorDescriptionForProject === 'function') ? buildColorDescriptionForProject() : null,
          (typeof buildColorReferencesForProject === 'function') ? buildColorReferencesForProject() : []
        ]);
        moduleRefImages = (refs && refs.moduleRefImages) || [];
        colorLabel = label || null;
        colorRefImages = colorRefs || [];
      } catch (e) { console.warn('Render decorado: referências de cor/módulo indisponíveis', e); }
      const { data, error } = await supabaseClient.functions.invoke('generate-gallery-render', {
        body: { mode: 'decorate', imageDataUrl: baseDataUrl, familyBrief, aspectRatio, colorLabel, colorRefImages, moduleRefImages }
      });
      if (error || !data || !data.imageDataUrl) {
        let msg = (data && data.error) || (error && error.message) || 'erro';
        try { if (error && error.context && typeof error.context.json === 'function') { const b = await error.context.json(); if (b && b.error) msg = b.error; } } catch (e) { /* mantém msg */ }
        throw new Error(msg);
      }
      resultImg.src = data.imageDataUrl;
      resultImg.style.display = 'block';
      await saveDecorated(data.imageDataUrl);
      status.style.color = '#2f6b3a';
      status.textContent = t('done');
    } catch (err) {
      console.error('Render decorado falhou:', err);
      status.style.color = '#8a3b2e';
      status.textContent = t('fail') + (err && err.message ? err.message : err);
    } finally {
      btn.disabled = false;
    }
  }

  function attach() {
    const btn = document.getElementById('po-proj-decor-render-btn');
    if (btn && !btn.dataset.bound) {
      btn.dataset.bound = '1';
      btn.addEventListener('click', openModal);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach);
  else attach();
  window.openProjectDecoratedRender = openModal;
})();
