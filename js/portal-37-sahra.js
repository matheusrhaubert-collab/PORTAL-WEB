// ==========================================================================
// SAHRA — assistente de design no canto do Projetos (2026-11-05)
// Matt: "quero te colocar lá no projeto pra você dar dicas... canto inferior
// esquerdo... pode fazer o que o botão Auditor faz... o que o botão ? faz...
// só pra administrador, sem mexer no que já está funcionando. Não quero que
// ninguém sinta o que estamos fazendo por aqui."
// 2ª rodada (mesmo dia): "quero uma caixa de texto em que eu possa escrever
// o que eu quiser e ela interagir comigo... o que achou do projeto? o que
// você mudaria? qual cor mais tendência... faz um projeto pra mim" + "tem
// como ativar fala por voz" + "gera uns renders bem legais pra uma
// apresentação, sugira como diminuir o custo, faz uma descrição técnica".
//
//  - SÓ ADMIN: nada é criado no DOM enquanto window.LEGNO_IS_ADMIN !== true
//    (rpc is_admin(), portal-26). A função sahra-chat confere de novo no
//    servidor (403 pra quem não é admin).
//  - Não altera nenhum arquivo existente. LÊ: runProjectAudit/openAuditModal
//    (portal-35), LegnoHelper (portal-24), editProjectAiContext/
//    editProjectAiApply (portal-19, mesmas operações do IA · Editar),
//    openProjectDecoratedRender (portal-36), slot.result (preço/custo).
//  - Abas: Conversa (Edge Function sahra-chat, Gemini + Codex) · Revisão
//    (Auditor) · Como fazer (Tutorial).
//  - Operações sugeridas NUNCA se aplicam sozinhas: botão "Aplicar", 1 passo
//    no Desfazer (mesma técnica do portal-19).
//  - Voz: microfone = SpeechRecognition do navegador (Chrome/Edge); voz da
//    SAHRA = speechSynthesis. Sem custo, sem servidor.
//  - Avatar só com o editor de projeto aberto (barra HELP visível).
//  - Desligar: localStorage 'legno_sahra_off' = '1' (ou window.SAHRA_OFF).
// Imagem: assets/sahra/sahra-avatar.webp
// ==========================================================================
(function () {
  if (window.SAHRA_OFF) return;
  try { if (localStorage.getItem('legno_sahra_off') === '1') return; } catch (e) { /* */ }

  const I18N = {
    pt: {
      hi: 'Oi! Eu sou a SAHRA.', sub: 'Designer da Legno · olho o projeto com você',
      tab_chat: 'Conversa', tab_review: 'Revisão', tab_how: 'Como fazer',
      chat_ph: 'Escreva ou fale com a SAHRA…', send: 'Enviar', mic: 'Falar', mic_on: 'Ouvindo… fique 2 s em silêncio pra enviar (ou toque no mic)',
      voice_on: 'Voz da SAHRA ligada', voice_off: 'Voz da SAHRA desligada', new_chat: 'Nova conversa',
      ask_name: 'Oi! Eu sou a SAHRA, designer da Legno. Ainda não sei o seu nome. Como posso te chamar?', name_ph: 'Seu nome', name_save: 'Salvar', name_err: 'Não consegui salvar o nome: ',
      welcome: 'Oi, {{nome}}! Já estou com o projeto aberto aqui. Me pergunte o que quiser: o que eu achei, o que eu mudaria, cores em tendência, custo, descrição técnica… ou peça pra eu montar o projeto nas paredes que você desenhou.',
      thinking: 'SAHRA está pensando…', err: 'Não consegui responder agora: ',
      apply: 'Aplicar {{n}} mudança(s)', applied: 'Aplicado. Se não gostar, é só Desfazer (um passo só).', applying: 'Aplicando…',
      not_done: 'Não deu pra fazer:', warn: 'Avisos:', open_render: 'Abrir Render decorado', open_audit: 'Abrir auditor', open_photoreal: 'Gerar foto realista',
      need_save: 'Pra gerar a foto realista o projeto precisa estar salvo. Salve em Meus Projetos e me peça de novo.',
      need_module: 'Pra gerar a foto realista o projeto precisa de pelo menos um módulo.',
      need_photoreal: 'O Render decorado parte de uma foto realista do projeto, e este ainda não tem nenhuma. Primeiro eu gero a foto realista (ajuste a câmera na altura dos olhos, de dentro do ambiente) e depois decoramos.',
      photoreal_started: 'Gerando a foto realista com a câmera como está na tela. Quando terminar ela entra na grade de fotos do projeto; aí é só me pedir o render decorado.',
      chip_1: 'O que achou do projeto?', chip_2: 'Faz um projeto pra mim', chip_3: 'Como diminuir o custo?', chip_4: 'Descrição técnica do projeto', chip_5: 'Renders pra apresentação', chip_6: 'Que cor está em tendência?',
      chip_1q: 'O que você achou do projeto? Dá a nota e o que você mudaria.',
      chip_2q: 'Faz um projeto pra mim nas paredes que eu já construí. Primeiro me conta a ideia e já monta.',
      chip_3q: 'Como podemos diminuir o custo deste projeto sem perder o desenho?',
      chip_4q: 'Faz uma descrição técnica de como está o projeto.',
      chip_5q: 'Quero renders bem legais deste projeto pra uma apresentação. Como fazemos?',
      chip_6q: 'Qual cor mais em tendência podemos usar aqui?',
      review: 'Revisão do projeto', ok: 'Nada pra corrigir. Projeto redondo!', empty: 'Coloque módulos no projeto que eu começo a revisar.',
      erro: 'erro', erros: 'erros', aviso: 'aviso', avisos: 'avisos', dica: 'dica', dicas: 'dicas',
      ver: 'Ver', fix: 'Corrigir', fix_all: 'Corrigir os automáticos', full: 'Abrir auditor completo', more: 'e mais {{n}}…',
      how: 'Como fazer?', how_ph: 'Pergunte, ex.: como girar um módulo', none: 'Não achei. Tente outras palavras ou abra o Tutorial.', tutorial: 'Abrir Tutorial',
      img_wait: 'Desenhando a ideia…', img_err: 'Não consegui gerar esta imagem.',
      tab_codex: 'Codex', learned: 'Aprendi:', forget: 'Esquecer', forgotten: 'Esquecido.', learn_err: 'Não consegui guardar: ',
      codex_intro: 'O que eu aprendi com você, organizado por central. Vale em todas as conversas, pra sempre, acima do Codex. Regra nova que bater de frente com outra passa por você. Só administrador vê e mexe aqui.',
      codex_ph: 'Ensine uma regra, ex.: Nunca colocar aéreo acima da geladeira.', codex_add: 'Ensinar', codex_empty: 'Ainda não aprendi nenhuma regra. Me ensine aqui ou na conversa ("aprende isso…").',
      codex_load_err: 'Não consegui carregar (a migration 268 já foi rodada?): ', codex_del: 'Apagar',
      dup: 'Já sabia:', clash: 'Isso choca com o que eu já sei:', keep_new: 'A nova vale', keep_old: 'A antiga vale', keep_both: 'As duas valem (casos diferentes)',
      kept_new: 'Troquei: a nova substituiu a antiga.', kept_old: 'Mantive a antiga.', kept_both: 'Guardei as duas.', checking: 'Conferindo com o que eu já sei…',
      w_ouro: 'ouro', w_normal: 'normal', w_preferencia: 'preferência', w_hint: 'Clique pra mudar o peso: ouro (nunca quebrar) → normal → preferência',
      ed_btn: 'Editar', ed_label: 'Editada:', ed_save: 'Salvar', ed_cancel: 'Cancelar', ed_checking: 'Revisão geral: comparando com todo o Codex…',
      ed_ok: '✓ Revisado: sem choque com nenhuma regra.', ed_dup: 'Depois da edição ela ficou igual a:', ed_clash: 'Depois da edição ela choca com:',
      ed_keep_edit: 'A editada vale', ed_keep_both: 'Manter as duas', ed_undo: 'Desfazer a edição', ed_del_this: 'Apagar esta (já existe)', ed_save_anyway: 'Salvar mesmo assim',
      no_hub: 'Sem central', hub_auto: 'Central: automática', weight_auto: 'Peso: automático', central: 'Central',
      applying_n: 'Aplicando {{k}} de {{n}}…', apply_stopped: 'Parei e voltei o projeto como estava antes.',
      stop: 'Parar', stopped: 'Parei. Pode mandar de novo do jeito certo.',
      close: 'Fechar', no_speech: 'Este navegador não tem reconhecimento de voz. Use o Chrome ou o Edge.'
    },
    en: {
      hi: "Hi! I'm SAHRA.", sub: 'Legno designer · reviewing the project with you',
      tab_chat: 'Chat', tab_review: 'Review', tab_how: 'How to',
      chat_ph: 'Type or talk to SAHRA…', send: 'Send', mic: 'Speak', mic_on: 'Listening… stay silent for 2 s to send (or tap the mic)',
      voice_on: 'SAHRA voice on', voice_off: 'SAHRA voice off', new_chat: 'New chat',
      ask_name: "Hi! I'm SAHRA, Legno's designer. I don't know your name yet. What should I call you?", name_ph: 'Your name', name_save: 'Save', name_err: "Couldn't save the name: ",
      welcome: "Hi, {{nome}}! I have the project open. Ask me anything: what I think, what I'd change, trending colors, cost, a technical description… or ask me to lay out the project on the walls you drew.",
      thinking: 'SAHRA is thinking…', err: "I couldn't answer right now: ",
      apply: 'Apply {{n}} change(s)', applied: "Applied. If you don't like it, just Undo (one step).", applying: 'Applying…',
      not_done: "Couldn't do:", warn: 'Warnings:', open_render: 'Open Decorated render', open_audit: 'Open auditor', open_photoreal: 'Generate realistic photo',
      need_save: 'To generate the realistic photo the project must be saved. Save it in My Projects and ask me again.',
      need_module: 'The project needs at least one cabinet to generate the realistic photo.',
      need_photoreal: 'The Decorated render starts from a realistic photo of the project, and this one has none yet. I will generate the realistic photo first (set the camera at eye level, inside the room) and then we decorate.',
      photoreal_started: 'Generating the realistic photo with the camera as it is on screen. When it finishes it goes to the project photo grid; then just ask me for the decorated render.',
      chip_1: 'What do you think?', chip_2: 'Design it for me', chip_3: 'How to cut cost?', chip_4: 'Technical description', chip_5: 'Renders for a presentation', chip_6: 'Trending color?',
      chip_1q: 'What do you think of the project? Give it a score and tell me what you would change.',
      chip_2q: 'Design the project for me on the walls I already built. Tell me the idea first and then lay it out.',
      chip_3q: 'How can we lower the cost of this project without losing the design?',
      chip_4q: 'Write a technical description of the project as it stands.',
      chip_5q: 'I want great renders of this project for a presentation. How do we do it?',
      chip_6q: 'Which trending color could we use here?',
      review: 'Project review', ok: 'Nothing to fix. Clean project!', empty: 'Add cabinets to the project and I will start reviewing.',
      erro: 'error', erros: 'errors', aviso: 'warning', avisos: 'warnings', dica: 'tip', dicas: 'tips',
      ver: 'View', fix: 'Fix', fix_all: 'Fix the automatic ones', full: 'Open full auditor', more: 'and {{n}} more…',
      how: 'How do I…?', how_ph: 'Ask, e.g.: how to rotate a cabinet', none: 'Nothing found. Try other words or open the Tutorial.', tutorial: 'Open Tutorial',
      img_wait: 'Sketching the idea…', img_err: "Couldn't generate this image.",
      tab_codex: 'Codex', learned: 'Learned:', forget: 'Forget', forgotten: 'Forgotten.', learn_err: "Couldn't save: ",
      codex_intro: 'What I learned from you. It applies to every conversation, forever, above the Codex. Only admins see and edit this.',
      codex_ph: 'Teach a rule, e.g.: Never put a wall cabinet above the fridge.', codex_add: 'Teach', codex_empty: 'No rules learned yet. Teach me here or in the chat ("learn this…").',
      codex_load_err: "Couldn't load (was migration 268 run?): ", codex_del: 'Delete',
      dup: 'Already knew:', clash: 'This clashes with what I know:', keep_new: 'New one wins', keep_old: 'Old one wins', keep_both: 'Keep both (different cases)',
      kept_new: 'Replaced: the new rule took over.', kept_old: 'Kept the old one.', kept_both: 'Kept both.', checking: 'Checking against what I know…',
      w_ouro: 'gold', w_normal: 'normal', w_preferencia: 'preference', w_hint: 'Click to change weight: gold (never break) → normal → preference',
      ed_btn: 'Edit', ed_label: 'Edited:', ed_save: 'Save', ed_cancel: 'Cancel', ed_checking: 'Full review: comparing with the whole Codex…',
      ed_ok: '✓ Reviewed: no clash with any rule.', ed_dup: 'After editing it became the same as:', ed_clash: 'After editing it clashes with:',
      ed_keep_edit: 'Edited one wins', ed_keep_both: 'Keep both', ed_undo: 'Undo the edit', ed_del_this: 'Delete this one (already exists)', ed_save_anyway: 'Save anyway',
      no_hub: 'No hub', hub_auto: 'Hub: automatic', weight_auto: 'Weight: automatic', central: 'Hub',
      applying_n: 'Applying {{k}} of {{n}}…', apply_stopped: 'Stopped and put the project back as it was.',
      stop: 'Stop', stopped: 'Stopped. Send it again the right way.',
      close: 'Close', no_speech: 'This browser has no speech recognition. Use Chrome or Edge.'
    },
    es: {
      hi: '¡Hola! Soy SAHRA.', sub: 'Diseñadora de Legno · reviso el proyecto contigo',
      tab_chat: 'Conversación', tab_review: 'Revisión', tab_how: 'Cómo hacer',
      chat_ph: 'Escribe o habla con SAHRA…', send: 'Enviar', mic: 'Hablar', mic_on: 'Escuchando… quédate 2 s en silencio para enviar (o toca el mic)',
      voice_on: 'Voz de SAHRA activada', voice_off: 'Voz de SAHRA desactivada', new_chat: 'Nueva conversación',
      ask_name: '¡Hola! Soy SAHRA, diseñadora de Legno. Todavía no sé tu nombre. ¿Cómo te llamo?', name_ph: 'Tu nombre', name_save: 'Guardar', name_err: 'No pude guardar el nombre: ',
      welcome: '¡Hola, {{nome}}! Ya tengo el proyecto abierto. Pregúntame lo que quieras: qué me parece, qué cambiaría, colores en tendencia, costo, descripción técnica… o pídeme que arme el proyecto en las paredes que dibujaste.',
      thinking: 'SAHRA está pensando…', err: 'No pude responder ahora: ',
      apply: 'Aplicar {{n}} cambio(s)', applied: 'Aplicado. Si no te gusta, solo Deshacer (un paso).', applying: 'Aplicando…',
      not_done: 'No se pudo hacer:', warn: 'Avisos:', open_render: 'Abrir Render decorado', open_audit: 'Abrir auditor', open_photoreal: 'Generar foto realista',
      need_save: 'Para generar la foto realista el proyecto debe estar guardado. Guárdalo en Mis Proyectos y pídemelo de nuevo.',
      need_module: 'El proyecto necesita al menos un módulo para generar la foto realista.',
      need_photoreal: 'El Render decorado parte de una foto realista del proyecto, y este aún no tiene ninguna. Primero genero la foto realista (cámara a la altura de los ojos, dentro del ambiente) y después decoramos.',
      photoreal_started: 'Generando la foto realista con la cámara como está en pantalla. Cuando termine entra en la grilla de fotos del proyecto; luego pídeme el render decorado.',
      chip_1: '¿Qué te parece?', chip_2: 'Diséñalo por mí', chip_3: '¿Cómo bajar el costo?', chip_4: 'Descripción técnica', chip_5: 'Renders para presentación', chip_6: '¿Color en tendencia?',
      chip_1q: '¿Qué te parece el proyecto? Dale una nota y dime qué cambiarías.',
      chip_2q: 'Diseña el proyecto en las paredes que ya construí. Primero cuéntame la idea y luego ármalo.',
      chip_3q: '¿Cómo podemos bajar el costo de este proyecto sin perder el diseño?',
      chip_4q: 'Haz una descripción técnica de cómo está el proyecto.',
      chip_5q: 'Quiero renders muy buenos de este proyecto para una presentación. ¿Cómo lo hacemos?',
      chip_6q: '¿Qué color en tendencia podemos usar aquí?',
      review: 'Revisión del proyecto', ok: 'Nada que corregir. ¡Proyecto impecable!', empty: 'Agrega módulos al proyecto y empiezo a revisar.',
      erro: 'error', erros: 'errores', aviso: 'aviso', avisos: 'avisos', dica: 'consejo', dicas: 'consejos',
      ver: 'Ver', fix: 'Corregir', fix_all: 'Corregir los automáticos', full: 'Abrir auditor completo', more: 'y {{n}} más…',
      how: '¿Cómo hago…?', how_ph: 'Pregunta, ej.: cómo girar un módulo', none: 'No encontré. Prueba otras palabras o abre el Tutorial.', tutorial: 'Abrir Tutorial',
      img_wait: 'Dibujando la idea…', img_err: 'No pude generar esta imagen.',
      tab_codex: 'Codex', learned: 'Aprendí:', forget: 'Olvidar', forgotten: 'Olvidado.', learn_err: 'No pude guardar: ',
      codex_intro: 'Lo que aprendí contigo. Vale en todas las conversaciones, para siempre, por encima del Codex. Solo administradores ven y editan esto.',
      codex_ph: 'Enseña una regla, ej.: Nunca poner alacena sobre el refrigerador.', codex_add: 'Enseñar', codex_empty: 'Aún no aprendí ninguna regla. Enséñame aquí o en la conversación ("aprende esto…").',
      codex_load_err: 'No pude cargar (¿se corrió la migration 268?): ', codex_del: 'Borrar',
      dup: 'Ya lo sabía:', clash: 'Esto choca con lo que ya sé:', keep_new: 'Vale la nueva', keep_old: 'Vale la anterior', keep_both: 'Valen las dos (casos distintos)',
      kept_new: 'Cambié: la nueva reemplazó a la anterior.', kept_old: 'Mantuve la anterior.', kept_both: 'Guardé las dos.', checking: 'Comparando con lo que ya sé…',
      w_ouro: 'oro', w_normal: 'normal', w_preferencia: 'preferencia', w_hint: 'Clic para cambiar el peso: oro (nunca romper) → normal → preferencia',
      ed_btn: 'Editar', ed_label: 'Editada:', ed_save: 'Guardar', ed_cancel: 'Cancelar', ed_checking: 'Revisión general: comparando con todo el Codex…',
      ed_ok: '✓ Revisado: sin choque con ninguna regla.', ed_dup: 'Después de editar quedó igual a:', ed_clash: 'Después de editar choca con:',
      ed_keep_edit: 'Vale la editada', ed_keep_both: 'Mantener las dos', ed_undo: 'Deshacer la edición', ed_del_this: 'Borrar esta (ya existe)', ed_save_anyway: 'Guardar igual',
      no_hub: 'Sin central', hub_auto: 'Central: automática', weight_auto: 'Peso: automático', central: 'Central',
      applying_n: 'Aplicando {{k}} de {{n}}…', apply_stopped: 'Paré y dejé el proyecto como estaba.',
      stop: 'Detener', stopped: 'Paré. Puedes enviarlo de nuevo como quieras.',
      close: 'Cerrar', no_speech: 'Este navegador no tiene reconocimiento de voz. Usa Chrome o Edge.'
    }
  };
  const lang = () => { try { return (typeof I18n !== 'undefined' && I18n.getLanguage) ? I18n.getLanguage() : 'pt'; } catch (e) { return 'pt'; } };
  const T = (k, v) => { const d = I18N[lang()] || I18N.pt; let s = d[k] != null ? d[k] : (I18N.pt[k] || k); if (v) Object.keys(v).forEach((x) => { s = s.split('{{' + x + '}}').join(v[x]); }); return s; };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MAX_ITENS = 6;
  const IMG = 'assets/sahra/sahra-avatar.webp?v=202611051140';
  const VOZ_KEY = 'legno_sahra_voz';
  // POSES (05/11, Matt: "deixa o ícone dela aqui, o gif, mas deixa ele
  // trocando bem de vez em quando"): os 6 quadros do gif viraram webp
  // redondos. Fica na neutra; a cada 25–50 s mostra uma pose por ~4 s. E as
  // poses acompanham o que ela faz: abre = oi, pensando = pensando,
  // respondeu = apresenta, aplicou = joinha.
  const POSE_V = '202611051215';
  const POSES = ['neutra', 'oi', 'paleta', 'pensando', 'apresenta', 'joinha'];
  const poseUrl = (n) => 'assets/sahra/sahra-' + n + '.webp?v=' + POSE_V;

  let root = null, badge = null, achados = [], aberto = false, aba = 'chat';
  let conversa = [];            // [{role:'user'|'sahra', text, ops?, notDone?, actions?, applied?}]
  let pensando = false;
  let chatSeq = 0, chatAbort = null;   // STOP (05/11, Matt: "dei um comando errado e não consigo parar")

  function isAdmin() { return window.LEGNO_IS_ADMIN === true; }
  // NOME DO LOGIN (06/11, Matt: "a sahra deve saudar conforme o nome do
  // login" + "se não tem ela deve perguntar"). Vem do user_profiles.full_name
  // (o mesmo campo "Nome" da Minha conta). Sem nome, ela pergunta e grava lá.
  function nomeCompleto() {
    const p = (typeof currentUserProfile !== 'undefined') ? currentUserProfile : null;
    return (p && p.full_name && String(p.full_name).trim()) || '';
  }
  function primeiroNome() { return nomeCompleto().split(/\s+/)[0] || ''; }
  async function salvaNome(nome) {
    const user = (typeof currentUser !== 'undefined') ? currentUser : null;
    if (!user || typeof supabaseClient === 'undefined') throw new Error('sem login');
    const { data, error } = await supabaseClient.from('user_profiles').update({ full_name: nome }).eq('user_id', user.id).select().single();
    if (error) throw error;
    if (data) { try { currentUserProfile = data; } catch (e) { /* */ } }
    if (typeof refreshAccountChip === 'function') { try { refreshAccountChip(); } catch (e) { /* */ } }
  }
  function editorVisivel() {
    const el = document.getElementById('po-proj-tb-help');
    return !!(el && el.offsetParent !== null);
  }
  function slotsDoProjeto() {
    try { return (typeof projectSlots !== 'undefined' && projectSlots) ? projectSlots.filter((s) => s && s.module) : []; } catch (e) { return []; }
  }
  function rodaAuditor() {
    if (typeof window.runProjectAudit !== 'function') return [];
    try { return window.runProjectAudit() || []; } catch (e) { console.error('[sahra] auditor', e); return []; }
  }

  // ---------------------------------------------------------------- CSS
  function injetaCss() {
    if (document.getElementById('po-sahra-css')) return;
    const st = document.createElement('style');
    st.id = 'po-sahra-css';
    st.textContent = `
#po-sahra { position: fixed; left: 16px; bottom: 16px; z-index: 900; font-family: inherit; }
/* 05/11 (Matt: "não quero ela num círculo... um pouco maior com fundo transparente... dobro do tamanho"):
   corpo inteiro, PNG/webp sem fundo, 120 px de altura. */
#po-sahra .sa-av { width: 96px; height: 180px; padding: 0; border: 0; background: transparent; box-shadow: none; cursor: pointer; position: relative;
  transition: transform .15s ease; transform-origin: 50% 100%; }
#po-sahra .sa-av:hover { transform: scale(1.05); background: transparent; }
#po-sahra .sa-av .sa-pose { position: absolute; left: 0; bottom: 0; width: 100%; height: 100%; object-fit: contain; object-position: 50% 100%;
  opacity: 0; transition: opacity .6s ease; pointer-events: none; filter: drop-shadow(0 3px 6px rgba(0,0,0,.18)); }
#po-sahra .sa-av .sa-pose.on { opacity: 1; }
#po-sahra.falando .sa-av .sa-pose.on { filter: drop-shadow(0 0 8px rgba(201,164,106,.9)) drop-shadow(0 3px 6px rgba(0,0,0,.18)); }
#po-sahra .sa-badge { z-index: 2; position: absolute; top: 6px; right: -10px; min-width: 20px; height: 20px; padding: 0 5px; border-radius: 10px;
  font-size: 11px; font-weight: 700; line-height: 20px; color: #fff; background: #b3412e; display: none; box-shadow: 0 0 0 2px #fff; }
#po-sahra .sa-badge.aviso { background: #c98a1a; }
#po-sahra .sa-panel { position: absolute; left: 0; bottom: 190px; width: 400px; max-width: calc(100vw - 32px); height: min(620px, calc(100vh - 230px));
  display: none; flex-direction: column; background: #fffdf9; border: 1px solid #e6dccd; border-radius: 14px; box-shadow: 0 12px 34px rgba(0,0,0,.22); overflow: hidden; }
#po-sahra.open .sa-panel { display: flex; }
#po-sahra .sa-head { display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: #f6efe4; border-bottom: 1px solid #e6dccd; flex-shrink: 0; }
#po-sahra .sa-head img { width: 38px; height: 38px; border-radius: 50%; border: 1.5px solid #c9a46a; }
#po-sahra .sa-head strong { display: block; font-size: 14px; color: #3a2a1c; }
#po-sahra .sa-head span { display: block; font-size: 11.5px; color: #7a6a58; }
#po-sahra .sa-hbtns { margin-left: auto; display: flex; gap: 2px; align-items: center; }
#po-sahra .sa-ib { background: transparent; color: #7a6a58; border: 0; padding: 4px 6px; cursor: pointer; border-radius: 6px; line-height: 0; }
#po-sahra .sa-ib:hover { background: #ece2d3; color: #3a2a1c; }
#po-sahra .sa-ib svg { width: 18px; height: 18px; }
#po-sahra .sa-ib.on { color: #8a5a34; }
#po-sahra .sa-tabs { display: flex; border-bottom: 1px solid #e6dccd; flex-shrink: 0; background: #fbf7f1; }
#po-sahra .sa-tab { flex: 1; background: transparent; color: #7a6a58; border: 0; border-bottom: 2px solid transparent; border-radius: 0; padding: 8px 4px; font-size: 12.5px; cursor: pointer; }
#po-sahra .sa-tab:hover { background: #f3ebdf; color: #3a2a1c; }
#po-sahra .sa-tab.on { color: #8a5a34; border-bottom-color: #8a5a34; font-weight: 600; }
#po-sahra .sa-view { flex: 1; min-height: 0; display: none; flex-direction: column; }
#po-sahra .sa-view.on { display: flex; }
#po-sahra .sa-body { overflow-y: auto; padding: 10px 14px 14px; flex: 1; min-height: 0; }
#po-sahra .sa-msgs { flex: 1; min-height: 0; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
#po-sahra .sa-m { max-width: 88%; padding: 8px 11px; border-radius: 12px; font-size: 13px; line-height: 1.45; color: #3a2a1c; word-wrap: break-word; }
#po-sahra .sa-m.sahra { background: #f4ece0; border-bottom-left-radius: 4px; align-self: flex-start; }
#po-sahra .sa-m.user { background: #8a5a34; color: #fff; border-bottom-right-radius: 4px; align-self: flex-end; white-space: pre-wrap; }
#po-sahra .sa-m p { margin: 0 0 6px; } #po-sahra .sa-m p:last-child { margin-bottom: 0; }
#po-sahra .sa-m ul { margin: 4px 0 6px; padding-left: 18px; } #po-sahra .sa-m li { margin: 2px 0; }
#po-sahra .sa-m .sa-mact { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
#po-sahra .sa-m .sa-mact button { font-size: 12px; padding: 5px 10px; }
#po-sahra .sa-m .sa-small { font-size: 11.5px; color: #7a6a58; margin-top: 6px; }
#po-sahra .sa-concepts { display: grid; gap: 6px; margin-top: 8px; }
#po-sahra .sa-concepts img { width: 100%; border-radius: 8px; cursor: zoom-in; display: block; }
#po-sahra .sa-cph { aspect-ratio: 16 / 9; border-radius: 8px; background: #ebe1d2; color: #7a6a58; font-size: 11.5px; display: flex; align-items: center; justify-content: center; gap: 6px; }
#po-sahra .sa-learn { margin-top: 8px; padding: 6px 8px; border-radius: 8px; background: #fff7e6; border: 1px solid #f0dcb4; font-size: 12px; }
#po-sahra .sa-learn .sa-lr { display: flex; gap: 6px; align-items: flex-start; margin-top: 3px; }
#po-sahra .sa-learn .sa-lr span { flex: 1; } #po-sahra .sa-learn .sa-lr.gone span { text-decoration: line-through; color: #9c8b77; }
#po-sahra .sa-learn button { font-size: 11px; padding: 2px 7px; }
#po-sahra .sa-wt { font-size: 10px; padding: 1px 6px; border-radius: 8px; border: 0; cursor: pointer; background: #eee6da; color: #5a4632; text-transform: uppercase; letter-spacing: .03em; }
#po-sahra .sa-wt.ouro { background: #e9c46a; color: #4a3200; } #po-sahra .sa-wt.preferencia { background: #e3ecf0; color: #3b5260; }
#po-sahra .sa-hubh { margin: 12px 0 2px; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #8a5a34; font-weight: 700; }
#po-sahra .sa-hubh small { font-weight: 400; text-transform: none; letter-spacing: 0; color: #9c8b77; }
#po-sahra .sa-clash { margin-top: 6px; padding: 6px 8px; border-radius: 8px; background: #fdecea; border: 1px solid #f2c4bd; }
#po-sahra .sa-clash .sa-old { margin: 4px 0; color: #6b3a32; } #po-sahra .sa-clash .sa-mact { margin-top: 6px; }
#po-sahra .sa-cx-opts { display: flex; gap: 6px; margin: -4px 0 8px; } #po-sahra .sa-cx-opts select { font-size: 11.5px; padding: 3px 6px; border: 1px solid #e0d5c4; border-radius: 6px; background: #fff; }
#po-sahra .sa-cx-ed textarea { width: 100%; box-sizing: border-box; font: inherit; font-size: 12.5px; padding: 6px 8px; border: 1px solid #c9a46a; border-radius: 8px; resize: vertical; min-height: 54px; }
#po-sahra .sa-cx-ed .sa-mact { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; } #po-sahra .sa-cx-ed .sa-mact button { font-size: 11.5px; padding: 4px 10px; }
#po-sahra .sa-cx-it .sa-cx-btns { display: flex; flex-direction: column; gap: 4px; flex: 0 0 auto; }
#po-sahra .sa-cx-pend:empty { display: none; } #po-sahra .sa-cx-pend { margin-bottom: 8px; }
#po-sahra .sa-cx-add { display: flex; gap: 6px; align-items: flex-end; margin: 8px 0 10px; }
#po-sahra .sa-cx-add textarea { flex: 1; resize: vertical; font: inherit; font-size: 12.5px; padding: 7px 9px; border: 1px solid #e0d5c4; border-radius: 8px; }
#po-sahra .sa-cx-add button { font-size: 12px; padding: 7px 12px; }
#po-sahra .sa-cx-it { display: flex; gap: 8px; align-items: flex-start; padding: 7px 0; border-top: 1px solid #f0e8dc; font-size: 12.5px; color: #3a2a1c; }
#po-sahra .sa-cx-it em { font-style: normal; font-size: 10.5px; text-transform: uppercase; letter-spacing: .04em; color: #8a5a34; display: block; }
#po-sahra .sa-cx-it div { flex: 1; } #po-sahra .sa-cx-it button { font-size: 11px; padding: 3px 8px; flex-shrink: 0; }
#po-sahra .sa-m.err { background: #f8e3de; color: #8e2f20; }
#po-sahra .sa-dots span { display: inline-block; width: 6px; height: 6px; margin-right: 3px; border-radius: 50%; background: #b39b7d; animation: saDot 1s infinite ease-in-out; }
#po-sahra .sa-dots span:nth-child(2) { animation-delay: .15s; } #po-sahra .sa-dots span:nth-child(3) { animation-delay: .3s; }
@keyframes saDot { 0%, 80%, 100% { opacity: .3; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-3px); } }
#po-sahra .sa-chips { display: flex; gap: 6px; overflow-x: auto; padding: 6px 12px; flex-shrink: 0; scrollbar-width: thin; }
#po-sahra .sa-chip { flex-shrink: 0; font-size: 11.5px; padding: 4px 10px; border-radius: 14px; background: #fff; color: #6e4527; border: 1px solid #e0d5c4; cursor: pointer; }
#po-sahra .sa-chip:hover { background: #f6efe4; }
#po-sahra .sa-comp { display: flex; gap: 6px; align-items: flex-end; padding: 8px 10px 10px; border-top: 1px solid #efe6d8; flex-shrink: 0; }
#po-sahra .sa-comp textarea { flex: 1; resize: none; min-height: 36px; max-height: 120px; font: inherit; font-size: 13px; padding: 8px 10px; border: 1px solid #e0d5c4; border-radius: 10px; box-sizing: border-box; }
#po-sahra .sa-comp .sa-round { width: 36px; height: 36px; border-radius: 50%; padding: 0; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
#po-sahra .sa-comp .sa-round svg { width: 18px; height: 18px; }
#po-sahra .sa-comp .sa-mic { background: #fff; color: #6e4527; border: 1px solid #e0d5c4; }
#po-sahra .sa-comp .sa-mic.rec { background: #b3412e; color: #fff; border-color: #b3412e; animation: saPulse 1.2s infinite; }
@keyframes saPulse { 0% { box-shadow: 0 0 0 0 rgba(179,65,46,.5); } 70% { box-shadow: 0 0 0 8px rgba(179,65,46,0); } 100% { box-shadow: 0 0 0 0 rgba(179,65,46,0); } }
#po-sahra .sa-status { font-size: 11px; color: #8a5a34; padding: 0 12px; min-height: 0; flex-shrink: 0; }
#po-sahra h4 { margin: 8px 0 6px; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: #8a5a34; }
#po-sahra .sa-pills { display: flex; gap: 6px; margin-bottom: 8px; flex-wrap: wrap; }
#po-sahra .sa-pill { font-size: 11px; padding: 2px 8px; border-radius: 10px; background: #eee6da; color: #5a4632; }
#po-sahra .sa-pill.erro { background: #f6dcd6; color: #8e2f20; }
#po-sahra .sa-pill.aviso { background: #f8ead0; color: #8a5a0e; }
#po-sahra .sa-it { display: flex; gap: 8px; align-items: flex-start; padding: 7px 0; border-top: 1px solid #f0e8dc; font-size: 12.5px; }
#po-sahra .sa-it:first-child { border-top: 0; }
#po-sahra .sa-dot { flex: 0 0 8px; height: 8px; border-radius: 50%; margin-top: 5px; background: #9c8b77; }
#po-sahra .sa-it.erro .sa-dot { background: #b3412e; } #po-sahra .sa-it.aviso .sa-dot { background: #c98a1a; }
#po-sahra .sa-it .sa-tx { flex: 1; min-width: 0; color: #3a2a1c; } #po-sahra .sa-it .sa-tx em { display: block; font-style: normal; color: #7a6a58; font-size: 11.5px; }
#po-sahra .sa-it .sa-bt { display: flex; gap: 4px; flex-shrink: 0; }
#po-sahra .sa-it button, #po-sahra .sa-link { font-size: 11px; padding: 3px 8px; }
#po-sahra .sa-ok { color: #3f6b3a; font-size: 12.5px; margin: 4px 0; } #po-sahra .sa-hint { color: #7a6a58; font-size: 12px; margin: 4px 0; }
#po-sahra .sa-acts { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
#po-sahra input.sa-q { width: 100%; box-sizing: border-box; font-size: 12.5px; padding: 7px 9px; border: 1px solid #e0d5c4; border-radius: 8px; }
#po-sahra .sa-res button { display: block; width: 100%; text-align: left; background: transparent; color: #3a2a1c; border: 0; border-top: 1px solid #f0e8dc;
  padding: 7px 2px; font-size: 12.5px; border-radius: 0; cursor: pointer; }
#po-sahra .sa-res button:hover { background: #f6efe4; }
@media (max-width: 600px) { #po-sahra .sa-av { width: 64px; height: 120px; } #po-sahra .sa-panel { bottom: 130px; } }`;
    document.head.appendChild(st);
  }

  const ICO = {
    mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l16-8-6 16-2-7-8-1z"/></svg>',
    spk: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>',
    mute: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>',
    stop: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
    novo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>'
  };

  // ---------------------------------------------------------------- DOM
  function cria() {
    if (root) return;
    injetaCss();
    root = document.createElement('div');
    root.id = 'po-sahra';
    root.style.display = 'none';
    root.innerHTML = `
      <div class="sa-panel" role="dialog" aria-label="SAHRA">
        <div class="sa-head"><img alt="" src="${IMG}"><div><strong data-k="hi"></strong><span data-k="sub"></span></div>
          <div class="sa-hbtns">
            <button type="button" class="sa-ib sa-new">${ICO.novo}</button>
            <button type="button" class="sa-ib sa-voz"></button>
            <button type="button" class="sa-ib sa-x" style="font-size:20px;line-height:1">&times;</button>
          </div></div>
        <div class="sa-tabs">
          <button type="button" class="sa-tab" data-aba="chat" data-k="tab_chat"></button>
          <button type="button" class="sa-tab" data-aba="review" data-k="tab_review"></button>
          <button type="button" class="sa-tab" data-aba="how" data-k="tab_how"></button>
          <button type="button" class="sa-tab" data-aba="codex" data-k="tab_codex"></button>
        </div>
        <div class="sa-view" data-view="chat">
          <div class="sa-msgs"></div>
          <div class="sa-chips"></div>
          <div class="sa-status"></div>
          <div class="sa-comp">
            <button type="button" class="sa-round sa-mic">${ICO.mic}</button>
            <textarea rows="1" class="sa-in"></textarea>
            <button type="button" class="sa-round sa-send">${ICO.send}</button>
          </div>
        </div>
        <div class="sa-view" data-view="review"><div class="sa-body">
          <h4 data-k="review"></h4>
          <div class="sa-pills"></div>
          <div class="sa-list"></div>
          <div class="sa-acts"><button type="button" class="secondary sa-link sa-fixall"></button><button type="button" class="secondary sa-link sa-full"></button></div>
        </div></div>
        <div class="sa-view" data-view="codex"><div class="sa-body">
          <p class="sa-hint" data-k="codex_intro"></p>
          <div class="sa-cx-add"><textarea rows="2" class="sa-cx-in"></textarea><button type="button" class="sa-cx-btn"></button></div>
          <div class="sa-cx-opts"><select class="sa-cx-hub"></select><select class="sa-cx-w"></select></div>
          <div class="sa-cx-pend"></div>
          <div class="sa-cx-list"></div>
        </div></div>
        <div class="sa-view" data-view="how"><div class="sa-body">
          <h4 data-k="how"></h4>
          <input type="search" class="sa-q" autocomplete="off">
          <div class="sa-res"></div>
          <div class="sa-acts"><button type="button" class="secondary sa-link sa-tut"></button></div>
        </div></div>
      </div>
      <button type="button" class="sa-av" aria-label="SAHRA"><img class="sa-pose on" alt="" src="${poseUrl('neutra')}"><img class="sa-pose" alt=""><span class="sa-badge"></span></button>`;
    document.body.appendChild(root);
    badge = root.querySelector('.sa-badge');

    // teclas digitadas no painel não podem virar atalho do canvas (Delete, setas…)
    ['keydown', 'keyup', 'keypress'].forEach((t) => root.addEventListener(t, (ev) => {
      if (ev.key === 'Escape' && t === 'keydown') { if (ocupada()) parar(); else fecha(); return; }
      ev.stopPropagation();
    }));

    root.querySelector('.sa-av').addEventListener('click', () => (aberto ? fecha() : abre()));
    root.querySelector('.sa-x').addEventListener('click', fecha);
    root.querySelector('.sa-new').addEventListener('click', () => { if (pensando) parar(); pararFala(); conversa = []; renderConversa(); });
    root.querySelector('.sa-voz').addEventListener('click', () => { setVoz(!vozLigada()); if (!vozLigada()) pararFala(); });
    root.querySelectorAll('.sa-tab').forEach((b) => b.addEventListener('click', () => mostraAba(b.dataset.aba)));

    // conversa
    const inp = root.querySelector('.sa-in');
    inp.addEventListener('input', () => { inp.style.height = 'auto'; inp.style.height = Math.min(120, inp.scrollHeight) + 'px'; });
    inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); enviar(); } });
    root.querySelector('.sa-send').addEventListener('click', () => (ocupada() ? parar() : enviar()));
    root.querySelector('.sa-mic').addEventListener('click', alternaMic);
    root.querySelector('.sa-chips').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-chip]');
      if (b) enviar(T(b.dataset.chip + 'q'));
    });
    root.querySelector('.sa-msgs').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-mact]');
      if (!b) return;
      const m = conversa[Number(b.dataset.idx)];
      if (b.dataset.mact === 'forget') {
        const l = m && m.learned && m.learned[Number(b.dataset.k)];
        if (l && l.id && !l.gone) { b.disabled = true; esqueceRegra(l.id).then((ok) => { if (ok) l.gone = true; renderConversa(); }); }
        return;
      }
      if (b.dataset.mact === 'decide') {
        const l = m && m.learned && m.learned[Number(b.dataset.k)];
        if (l) { b.disabled = true; decide(l, b.dataset.dec, m.origem || '').then(renderConversa); }
        return;
      }
      if (b.dataset.mact === 'img') { const c = m && m.concepts && m.concepts[Number(b.dataset.k)]; if (c && c.url) abreImagem(c.url); return; }
      if (b.dataset.mact === 'apply' && m) { m.stopped = false; aplicar(m); }
      else if (b.dataset.mact === 'stop') parar();
      else if (b.dataset.mact === 'render') abreDecorado();
      else if (b.dataset.mact === 'photoreal') geraFotoRealista();
      else if (b.dataset.mact === 'audit') { fecha(); if (typeof window.openAuditModal === 'function') window.openAuditModal(); }
    });

    // codex (aprendizado) — ensinar à mão passa pelo detector de choque
    let cxPend = [];
    const pintaPend = () => { root.querySelector('.sa-cx-pend').innerHTML = cxPend.map((L, k) => itemAprendido(L, `data-cx="${k}"`)).join(''); };
    root.querySelector('.sa-cx-btn').addEventListener('click', async () => {
      const ta = root.querySelector('.sa-cx-in');
      const rule = ta.value.trim();
      if (!rule) return;
      const btn = root.querySelector('.sa-cx-btn'); btn.disabled = true;
      root.querySelector('.sa-cx-pend').innerHTML = `<p class="sa-hint">${esc(T('checking'))}</p>`;
      const hub = root.querySelector('.sa-cx-hub').value || null, weight = root.querySelector('.sa-cx-w').value || null;
      let itens;
      try {
        const { data, error } = await supabaseClient.functions.invoke('sahra-chat', { body: { check_learn: [{ rule, hub, weight }], lang: lang() } });
        if (error || !data || !Array.isArray(data.learn)) throw new Error((data && data.error) || (error && error.message) || '?');
        itens = data.learn;
        if (hub) itens.forEach((L) => { L.hub = hub; });
        if (weight) itens.forEach((L) => { L.weight = weight; });
      } catch (e) {
        console.warn('[sahra codex] checagem falhou, gravando direto', e);
        itens = [{ rule, hub, weight: weight || 'normal', status: 'nova', existing: [] }];
      }
      cxPend = itens;
      await processaAprendizado(cxPend, 'manual');
      btn.disabled = false; ta.value = '';
      pintaPend(); carregaCodex();
    });
    root.querySelector('.sa-cx-pend').addEventListener('click', async (ev) => {
      const b = ev.target.closest('button[data-dec]');
      if (!b) return;
      const L = cxPend[Number(b.dataset.cx)];
      if (!L) return;
      b.disabled = true;
      await decide(L, b.dataset.dec, 'manual');
      pintaPend(); carregaCodex();
    });
    root.querySelector('.sa-cx-list').addEventListener('click', async (ev) => {
      const ed = ev.target.closest('button[data-edit]');
      if (ed) {
        const reg = codexData.find((x) => String(x.id) === String(ed.dataset.edit));
        if (!reg) return;
        cxEdit = { id: reg.id, texto: reg.rule, fase: 'edit' };
        pintaCodex();
        const ta = root.querySelector('.sa-cx-edin'); if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
        return;
      }
      const ec = ev.target.closest('button[data-ed]');
      if (ec) { ec.disabled = true; await salvaEdicao(ec.dataset.ed); return; }
      const w = ev.target.closest('button[data-wt]');
      if (w) {
        const prox = { ouro: 'normal', normal: 'preferencia', preferencia: 'ouro' }[w.dataset.w] || 'normal';
        w.disabled = true;
        try { const { error } = await supabaseClient.from('sahra_lessons').update({ weight: prox }).eq('id', w.dataset.wt); if (error) throw error; }
        catch (e) { status(String((e && e.message) || e)); }
        carregaCodex();
        return;
      }
      const b = ev.target.closest('button[data-del]');
      if (!b) return;
      b.disabled = true;
      await esqueceRegra(b.dataset.del);
      carregaCodex();
    });

    // revisão
    root.querySelector('.sa-full').addEventListener('click', () => { fecha(); if (typeof window.openAuditModal === 'function') window.openAuditModal(); });
    root.querySelector('.sa-fixall').addEventListener('click', () => {
      const comFix = achados.filter((a) => a && a.fix);
      if (!comFix.length) return;
      if (typeof pushProjectUndoState === 'function') { try { pushProjectUndoState(); } catch (e) { /* */ } }
      comFix.forEach((a) => { try { a.fix(); } catch (e) { console.error('[sahra fix]', e); } });
      depoisDeCorrigir();
    });
    root.querySelector('.sa-list').addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-act]');
      if (!b) return;
      const a = achados[Number(b.dataset.idx)];
      if (!a) return;
      if (b.dataset.act === 'ver') {
        fecha();
        if (typeof selectProjectSlot === 'function') { try { selectProjectSlot(a.slotId); } catch (e) { /* */ } }
      } else if (b.dataset.act === 'fix' && a.fix) {
        if (typeof pushProjectUndoState === 'function') { try { pushProjectUndoState(); } catch (e) { /* */ } }
        try { a.fix(); } catch (e) { console.error('[sahra fix]', e); }
        depoisDeCorrigir();
      }
    });

    // como fazer
    const q = root.querySelector('.sa-q');
    let tq = null;
    q.addEventListener('input', () => { clearTimeout(tq); tq = setTimeout(() => buscaHelper(q.value), 150); });
    root.querySelector('.sa-res').addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-q]');
      if (!b || !window.LegnoHelper) return;
      fecha();
      try { window.LegnoHelper.rodar(b.dataset.q); } catch (e) { console.error('[sahra helper]', e); }
    });
    root.querySelector('.sa-tut').addEventListener('click', () => { fecha(); if (window.LegnoHelper && window.LegnoHelper.abrir) window.LegnoHelper.abrir(); });
  }

  function textos() {
    root.querySelectorAll('[data-k]').forEach((el) => { el.textContent = T(el.dataset.k); });
    root.querySelector('.sa-x').setAttribute('aria-label', T('close'));
    root.querySelector('.sa-x').title = T('close');
    root.querySelector('.sa-new').title = T('new_chat');
    root.querySelector('.sa-full').textContent = T('full');
    root.querySelector('.sa-fixall').textContent = T('fix_all');
    root.querySelector('.sa-tut').textContent = T('tutorial');
    root.querySelector('.sa-q').placeholder = T('how_ph');
    root.querySelector('.sa-cx-in').placeholder = T('codex_ph');
    root.querySelector('.sa-cx-btn').textContent = T('codex_add');
    root.querySelector('.sa-cx-hub').innerHTML = `<option value="">${esc(T('hub_auto'))}</option>` + centrais().map((h) => `<option value="${esc(h.slug)}">${esc(nomeCentral(h.slug))}</option>`).join('');
    root.querySelector('.sa-cx-w').innerHTML = `<option value="">${esc(T('weight_auto'))}</option>` + ['ouro', 'normal', 'preferencia'].map((w) => `<option value="${w}">${esc(T('w_' + w))}</option>`).join('');
    root.querySelector('.sa-in').placeholder = T('chat_ph');
    root.querySelector('.sa-send').title = T('send');
    root.querySelector('.sa-mic').title = T('mic');
    root.querySelector('.sa-chips').innerHTML = ['chip_1', 'chip_2', 'chip_3', 'chip_4', 'chip_5', 'chip_6']
      .map((k) => `<button type="button" class="sa-chip" data-chip="${k}">${esc(T(k))}</button>`).join('');
    pintaVoz();
  }

  function mostraAba(a) {
    aba = a;
    root.querySelectorAll('.sa-tab').forEach((b) => b.classList.toggle('on', b.dataset.aba === a));
    root.querySelectorAll('.sa-view').forEach((v) => v.classList.toggle('on', v.dataset.view === a));
    if (a === 'review') atualiza(true);
    if (a === 'codex') carregaCodex();
    if (a === 'chat') { renderConversa(); setTimeout(() => { const i = root.querySelector('.sa-in'); if (i) i.focus(); }, 30); }
    if (a === 'how') { const q = root.querySelector('.sa-q'); q.value = ''; root.querySelector('.sa-res').innerHTML = ''; setTimeout(() => q.focus(), 30); }
  }

  // ---------------------------------------------------------------- CONVERSA
  // markdown mínimo: **negrito**, listas "- ", parágrafos
  function md(txt) {
    const linhas = String(txt || '').split(/\r?\n/);
    let html = '', lista = false, par = [];
    const inl = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    const fechaPar = () => { if (par.length) { html += '<p>' + par.map(inl).join('<br>') + '</p>'; par = []; } };
    linhas.forEach((l) => {
      const m = l.match(/^\s*(?:[-•*]|\d+[.)])\s+(.*)$/);
      if (m) { fechaPar(); if (!lista) { html += '<ul>'; lista = true; } html += '<li>' + inl(m[1]) + '</li>'; return; }
      if (lista) { html += '</ul>'; lista = false; }
      if (!l.trim()) { fechaPar(); return; }
      par.push(l.replace(/^#+\s*/, ''));
    });
    fechaPar(); if (lista) html += '</ul>';
    return html;
  }

  function renderConversa() {
    const box = root.querySelector('.sa-msgs');
    const nome1 = primeiroNome();
    let html = nome1
      ? `<div class="sa-m sahra">${md(T('welcome', { nome: esc(nome1) }))}</div>`
      : `<div class="sa-m sahra">${md(T('ask_name'))}<div class="sa-name-form" style="display:flex;gap:6px;margin-top:8px"><input class="sa-name-in" type="text" maxlength="60" autocomplete="name" placeholder="${esc(T('name_ph'))}" style="flex:1;min-width:0;padding:6px 8px;border:1px solid rgba(0,0,0,.2);border-radius:6px;font:inherit"><button type="button" class="sa-name-ok" style="padding:6px 10px;border-radius:6px;border:0;background:#222;color:#fff;cursor:pointer;font:inherit">${esc(T('name_save'))}</button></div><div class="sa-name-msg" style="font-size:12px;color:#b00020;margin-top:4px"></div></div>`;
    conversa.forEach((m, i) => {
      if (m.role === 'user') { html += `<div class="sa-m user">${esc(m.text)}</div>`; return; }
      let extra = '';
      if (m.concepts && m.concepts.length) {
        extra += '<div class="sa-concepts">' + m.concepts.map((c, k) => c.url
          ? `<img src="${c.url}" alt="" data-mact="img" data-idx="${i}" data-k="${k}">`
          : `<div class="sa-cph">${c.err ? esc(T('img_err')) : '<span class="sa-dots"><span></span><span></span><span></span></span> ' + esc(T('img_wait'))}</div>`).join('') + '</div>';
      }
      if (m.learned && m.learned.length) {
        extra += m.learned.map((L, k) => itemAprendido(L, `data-mact="decide" data-idx="${i}" data-k="${k}"`, `data-mact="forget" data-idx="${i}" data-k="${k}"`)).join('');
      }
      if (m.learnErr) extra += `<div class="sa-small">${esc(T('learn_err') + m.learnErr)}</div>`;
      const bts = [];
      if (m.ops && m.ops.length && !m.applied && !m.applying) bts.push(`<button type="button" data-mact="apply" data-idx="${i}">${esc(T('apply', { n: m.ops.length }))}</button>`);
      if ((m.actions || []).includes('photoreal')) bts.push(`<button type="button" data-mact="photoreal" data-idx="${i}">📷 ${esc(T('open_photoreal'))}</button>`);
      if ((m.actions || []).includes('render')) bts.push(`<button type="button" class="secondary" data-mact="render" data-idx="${i}">${esc(T('open_render'))}</button>`);
      if ((m.actions || []).includes('audit')) bts.push(`<button type="button" class="secondary" data-mact="audit" data-idx="${i}">${esc(T('open_audit'))}</button>`);
      if (bts.length) extra += `<div class="sa-mact">${bts.join('')}</div>`;
      if (m.applying) extra += `<div class="sa-small">${esc(T('applying_n', { k: m.progress || 0, n: m.ops.length }))} <button type="button" class="secondary sa-link" data-mact="stop" data-idx="${i}">■ ${esc(T('stop'))}</button></div>`;
      if (m.stopped) extra += `<div class="sa-small">${esc(T('apply_stopped'))}</div>`;
      if (m.applied) extra += `<div class="sa-small">✓ ${esc(T('applied'))}</div>`;
      if (m.notDone && m.notDone.length) extra += `<div class="sa-small"><strong>${esc(T('not_done'))}</strong> ${m.notDone.map(esc).join(' · ')}</div>`;
      if (m.warnings && m.warnings.length) extra += `<div class="sa-small"><strong>${esc(T('warn'))}</strong> ${m.warnings.map(esc).join(' · ')}</div>`;
      if (m.tempoTxt) extra += `<div class="sa-tempo" style="font-size:10.5px;opacity:.5;margin-top:6px">${esc(m.tempoTxt)}</div>`;
      html += `<div class="sa-m sahra${m.err ? ' err' : ''}">${md(m.text)}${extra}</div>`;
    });
    if (pensando) html += `<div class="sa-m sahra"><span class="sa-dots"><span></span><span></span><span></span></span></div>`;
    box.innerHTML = html;
    box.scrollTop = box.scrollHeight;
    const nf = box.querySelector('.sa-name-form');
    if (nf) {
      const inp = nf.querySelector('.sa-name-in'), ok = nf.querySelector('.sa-name-ok'), msg = box.querySelector('.sa-name-msg');
      const vai = async () => {
        const v = (inp.value || '').trim().replace(/\s+/g, ' ');
        if (!v) { inp.focus(); return; }
        ok.disabled = true; inp.disabled = true;
        try { await salvaNome(v); renderConversa(); }
        catch (e) { ok.disabled = false; inp.disabled = false; if (msg) msg.textContent = T('name_err') + ((e && e.message) || e); }
      };
      ok.addEventListener('click', vai);
      inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); vai(); } });
    }
    pintaEnviar();
  }

  function ocupada() { return pensando || !!aplicando || (root && root.classList.contains('falando')); }
  function pintaEnviar() {
    const b = root && root.querySelector('.sa-send');
    if (!b) return;
    const oc = ocupada();
    b.innerHTML = oc ? ICO.stop : ICO.send;
    b.title = oc ? T('stop') : T('send');
    b.style.background = oc ? '#b3412e' : '';
  }
  // Para TUDO: pensamento em andamento (resposta que chegar depois é
  // ignorada) e a fala. Operações nunca se aplicam sozinhas, então não há
  // nada pela metade no projeto.
  function parar() {
    const estavaPensando = pensando;
    if (aplicando) aplicando.cancel = true;
    chatSeq++;
    try { if (chatAbort) chatAbort.abort(); } catch (e) { /* */ }
    chatAbort = null;
    pararFala();
    if (poseFixa) poseEnquanto(null);
    if (estavaPensando) {
      pensando = false;
      conversa.push({ role: 'sahra', text: T('stopped'), err: true });
    }
    renderConversa();
  }

  function precoDoProjeto() {
    const r = (v) => Math.round((Number(v) || 0) * 100) / 100;
    let total = 0;
    const slots = slotsDoProjeto().map((s, i) => {
      const res = s.result || {};
      const c = { chapa: 0, fita: 0, mao_obra: 0, ferragem: 0, comprados: 0 };
      let area = 0, pecas = 0;
      (res.breakdown || []).forEach((b) => {
        c.chapa += Number(b.sheet_cost) || 0; c.fita += Number(b.edge_cost) || 0; c.mao_obra += Number(b.labor_cost) || 0;
        c.ferragem += (Number(b.hinge_cost) || 0) + (Number(b.slide_cost) || 0); c.comprados += Number(b.purchased_cost) || 0;
        area += Number(b.area_m2) || 0; if (!b.is_module) pecas += Number(b.quantity) || 1;
      });
      Object.keys(c).forEach((k) => { c[k] = r(c[k]); });
      total += Number(res.total) || 0;
      return { n: i + 1, id: String(s.id), modulo: (s.module && s.module.name) || '', venda: r(res.total), custo_total: r(res.cost_total), custo: c, area_m2: r(area), pecas };
    });
    return { total_venda: r(total), moeda: 'USD', por_slot: slots };
  }

  async function montaContexto() {
    let ctx = { project: { slots: [], walls: [] }, catalog: [] };
    if (typeof editProjectAiContext === 'function') ctx = await editProjectAiContext();
    try { ctx.project.pricing = precoDoProjeto(); } catch (e) { /* sem preço */ }
    try {
      ctx.project.audit = rodaAuditor().slice(0, 40).map((a) => ({ nivel: a.nivel, slot_id: String(a.slotId), titulo: a.titulo, detalhe: a.detalhe }));
    } catch (e) { /* sem auditor */ }
    try { ctx.project.salvo = !!projetoSalvoId(); ctx.project.fotos_realistas = await contaFotosRealistas(); } catch (e) { /* */ }
    // CONSTRUTOR (05/11, Matt: "a SAHRA não está conseguindo acessar o
    // construtor. isso é fundamental pra ela"): cada módulo leva o interior
    // atual em texto + se é caixa crua de Componentes.
    try {
      if (typeof ensureAccessoryCatalog === 'function') await ensureAccessoryCatalog();
      (ctx.project.slots || []).forEach((cs) => {
        const sl = projectSlots.find((x) => String(x.id) === String(cs.id));
        if (!sl) return;
        cs.interior_atual = resumoInterior(sl);
        const lp = pecasLed(sl);
        if (lp.length) cs.led_pecas = lp;
        cs.casco = CASCO_RE.test(String((sl.module && sl.module.name) || ''));
        if (PAINEL_RE.test(String((sl.module && sl.module.name) || ''))) cs.painel = true;
      });
    } catch (e) { console.warn('[sahra] interior no contexto', e); }
    // MONTAGEM COMPLETA (05/11): com o projeto vazio ela não tinha nenhuma
    // cor pra escolher (color_options só vem de módulo já inserido) e tudo
    // nascia na cor padrão. Agora vai a lista de cores e os papéis.
    try {
      if (!coresCache && typeof buildProjectPhotoColorList === 'function') coresCache = await buildProjectPhotoColorList();
      ctx.colors_available = coresCache || [];
      ctx.color_roles = ((typeof colorRolesCache !== 'undefined' && colorRolesCache) || []).map((r) => r.name).filter(Boolean);
    } catch (e) { console.warn('[sahra] cores no contexto', e); }
    return ctx;
  }
  let coresCache = null;

  // ---------------------------------------------------------------- IMAGENS DO PORTAL
  // 05/11 (Matt: "pedi uma foto realista mas abriu essa tela [Render
  // decorado]... tem que instruir pra que ela gere um render simples do site
  // pra poder liberar"): duas ferramentas, em ordem — 1) foto realista
  // (Render > Gerar, path tracer, precisa projeto salvo + módulo; salva
  // sozinho na grade) e 2) Render decorado (parte de uma foto realista).
  function projetoSalvoId() {
    try { return (typeof loadedProjectFavorite !== 'undefined' && loadedProjectFavorite && loadedProjectFavorite.id) || null; } catch (e) { return null; }
  }
  async function contaFotosRealistas() {
    const id = projetoSalvoId();
    if (!id) return 0;
    try {
      const { count, error } = await supabaseClient.from('project_photoreal_photos').select('id', { count: 'exact', head: true }).eq('project_id', id);
      if (error) return 0;
      return Number(count) || 0;
    } catch (e) { return 0; }
  }
  function falaNaConversa(texto, actions) {
    conversa.push({ role: 'sahra', text: texto, actions: actions || [], ops: [], notDone: [], concepts: [] });
    if (!aberto) abre(); else renderConversa();
  }
  function geraFotoRealista() {
    if (!projetoSalvoId()) { falaNaConversa(T('need_save')); return; }
    const b = document.getElementById('po-proj-photoreal-btn');
    if (!b || b.disabled) { falaNaConversa(projetoSalvoId() ? T('need_module') : T('need_save')); return; }
    falaNaConversa(T('photoreal_started'));
    fecha();
    b.click(); // mesmo caminho do "Render > Gerar" (portal-08): câmera atual, salva sozinho
  }
  async function abreDecorado() {
    if (!projetoSalvoId()) { falaNaConversa(T('need_save')); return; }
    if ((await contaFotosRealistas()) === 0) { falaNaConversa(T('need_photoreal'), ['photoreal']); return; }
    fecha();
    if (typeof window.openProjectDecoratedRender === 'function') window.openProjectDecoratedRender();
  }

  // ---------------------------------------------------------------- LED
  // 05/11 (Matt: "a SAHRA não tem acesso ao LED. preciso colocar LED nos
  // projetos"). Mesmas funções da tela de LED (portal-06c): quem pode
  // receber (projectLedPecasElegiveis), linha padrão (ledLinhaPadrao: 50 da
  // frente, margens 0), Top/Under (ledFaceDoBotao), distância da frente
  // (ledPosGravar) e a validação de verdade (ledAvaliar — a mesma do .ban).
  // Grava só slot.ledConfigs[piece_id] = [linhas]; preço por metro, 3D, foto
  // e rasgo no .ban saem sozinhos do ponto de junção.
  function ledOk() {
    return typeof projectLedPecasElegiveis === 'function' && typeof ledLinhaPadrao === 'function'
      && typeof ledConfigDaLinha === 'function' && typeof ledAvaliar === 'function' && typeof Pricing !== 'undefined';
  }
  function pecasLed(slot) {
    if (!ledOk()) return [];
    let lista = [];
    try { lista = projectLedPecasElegiveis(slot) || []; } catch (e) { return []; }
    return lista.slice(0, 16).map(({ p }) => {
      let n = 0;
      try { n = Pricing.ledLista(slot.ledConfigs && slot.ledConfigs[p.piece_id]).length; } catch (e) { /* */ }
      return {
        piece_id: String(p.piece_id), papel: p.position_role,
        nome: String(p.reference || p.name || p.component_name || p.position_role || '').slice(0, 40),
        LxAxP: [p.width_mm, p.height_mm, p.depth_mm].map((v) => Math.round(Number(v) || 0)).join('x'),
        leds: n
      };
    });
  }
  async function aplicaLed(op) {
    const warnings = [], results = [];
    const L = op.led || {};
    if (!ledOk()) { warnings.push('LED indisponível nesta tela'); return { results: [{ op, ok: false }], warnings }; }
    for (const id of (op.slot_ids || [])) {
      const slot = projectSlots.find((x) => String(x.id) === String(id));
      const nomeMod = (slot && slot.module && slot.module.name) || '?';
      if (!slot) { results.push({ op, ok: false }); continue; }
      let pecas = [];
      try { pecas = (projectLedPecasElegiveis(slot) || []).map((x) => x.p); } catch (e) { pecas = []; }
      const ids = new Set((L.piece_ids || []).map(String));
      const papeis = new Set(L.roles || []);
      const alvo = pecas.filter((p) => ids.has(String(p.piece_id)) || papeis.has(p.position_role));
      if (!alvo.length) { warnings.push(nomeMod + ': nenhuma peça desse tipo pode receber LED'); results.push({ op, ok: false }); continue; }
      const novo = Object.assign({}, slot.ledConfigs || {});
      let feitas = 0;
      alvo.forEach((part) => {
        const pid = part.piece_id;
        if (L.action === 'remove') { if (novo[pid]) { delete novo[pid]; feitas++; } return; }
        const linhas = [];
        let ant = null;
        const n = Math.max(1, Math.min(6, Number(L.lines) || 1));
        for (let k = 0; k < n; k++) {
          const l = ledLinhaPadrao(part, ant);
          if (!ant) {
            if (L.side && typeof ledFaceDoBotao === 'function') l.face = ledFaceDoBotao(part, L.side);
            if (L.from_front_mm != null && typeof ledPosGravar === 'function') l.pos_mm = ledPosGravar(part, l, Number(L.from_front_mm));
            if (L.margin_mm != null) { l.margem_ini_mm = Number(L.margin_mm); l.margem_fim_mm = Number(L.margin_mm); }
          }
          linhas.push(l); ant = l;
        }
        const cfgs = [];
        linhas.forEach((l) => {
          const c = ledConfigDaLinha(l);
          const av = ledAvaliar(c, part);
          if (av.erro) warnings.push(`${nomeMod} · ${part.reference || part.position_role}: ${av.erro}`);
          else cfgs.push(c);
        });
        if (!cfgs.length) return;
        const antes = L.action === 'add' ? Pricing.ledLista(novo[pid]) : [];
        novo[pid] = antes.concat(cfgs);
        feitas++;
      });
      slot.ledConfigs = novo;
      try { recomputeProjectSlotPricing(slot); } catch (e) { console.error('[sahra led] preço', e); }
      results.push({ op, ok: feitas > 0 });
    }
    return { results, warnings };
  }

  // ---------------------------------------------------------------- CONSTRUTOR
  const CASCO_RE = /^(bottom|stretcher|topcover|gola|niche)\s*·/i;      // = PROJECT_PHOTO_CARCASS_RE (portal-11)
  const PAINEL_RE = /painel|panel|tampo|countertop|prateleira|shelf|filler|crown|moldura|ripad|slat/i;
  // Árvore do Construtor (slot.layout) → texto curto. Filhos em Y vão de
  // baixo pra cima (o último é o topo — ver projectSlotTopLeafIsDrawer).
  function resumoInterior(slot) {
    const cat = (typeof accessoryCatalogCache !== 'undefined' && accessoryCatalogCache) || {};
    const nome = (id) => (cat[id] && cat[id].name) || 'agregado';
    if (!slot.layout) {
      let proprio = false;
      try { proprio = typeof projectPhotoSlotHasOwnInterior === 'function' && projectPhotoSlotHasOwnInterior(slot); } catch (e) { /* */ }
      return proprio ? 'sem Construtor — interior vem do cadastro do módulo' : 'vazio (sem nada no Construtor)';
    }
    const tam = (n) => n.sizeMode === 'fixed' && n.sizeValue ? Math.round(n.sizeValue) + 'mm' : 'resto';
    const no = (n, d) => {
      if (d > 6) return '…';
      const partes = [];
      if (n.splitAxis) {
        const lado = n.splitAxis === 'x' ? 'colunas (esq→dir)' : 'faixas (baixo→cima)';
        partes.push(`${lado} separadas por ${nome(n.splitAcc)}: [` + (n.children || []).map((c) => `(${tam(c)}) ${no(c, d + 1)}`).join(' | ') + ']');
      } else if (n.content) {
        const q = n.content.params && Number(n.content.params.quantidade) > 1 ? ' ×' + n.content.params.quantidade : '';
        partes.push(nome(n.content.acc) + q);
      } else partes.push('vão livre');
      (n.fronts || []).forEach((f) => partes.push(`frente ${nome(f.acc)}${f.from != null ? ` (vãos ${f.from}–${f.to})` : ''}`));
      return partes.join(' + ');
    };
    try { return no(slot.layout, 0).slice(0, 900) + (slot.layout.params && slot.layout.params.fabrica ? ' [interior de fábrica]' : ''); }
    catch (e) { return 'com Construtor'; }
  }
  // op set_interior: mesmo motor da leitura por foto (portal-11:
  // projectPhotoSanitizeInterior + projectPhotoInteriorTree com os agregados
  // genéricos) e o mesmo fim do botão Salvar do Construtor (slot.layout +
  // catálogo no cache + regra da travessa + preço/peças recalculados).
  async function aplicaInterior(op) {
    const warnings = [], results = [];
    const okFn = typeof projectPhotoInteriorTree === 'function' && typeof loadProjectBuilderCatalog === 'function'
      && typeof computeProjectSlotInnerZone === 'function' && typeof LayoutEngine !== 'undefined';
    for (const id of (op.slot_ids || [])) {
      const slot = projectSlots.find((x) => String(x.id) === String(id));
      const nomeMod = (slot && slot.module && slot.module.name) || '?';
      if (!okFn || !slot || !op.interior) { results.push({ op, ok: false }); continue; }
      if (PAINEL_RE.test(nomeMod)) { warnings.push(nomeMod + ': painel não tem interior'); results.push({ op, ok: false }); continue; }
      const carregado = await loadProjectBuilderCatalog(slot.module.id);
      const cat = (carregado && carregado.cat) || {};
      const espec = JSON.parse(JSON.stringify(op.interior));
      const interior = typeof projectPhotoSanitizeInterior === 'function' ? projectPhotoSanitizeInterior(espec, slot.height_mm) : espec;
      const raiz = projectPhotoInteriorTree(interior, cat, computeProjectSlotInnerZone(slot), PROJECT_PHOTO_INTERIOR_GENERIC, warnings, nomeMod);
      const vazia = !raiz.splitAxis && !raiz.content && !(raiz.fronts || []).length;
      slot.layout = vazia ? null : LayoutEngine.serialize(raiz);
      accessoryCatalogCache = Object.assign({}, (typeof accessoryCatalogCache !== 'undefined' && accessoryCatalogCache) || {}, cat);
      if (typeof projectEnforceStretcherRule === 'function') { try { projectEnforceStretcherRule(slot); } catch (e) { /* */ } }
      try { recomputeProjectSlotPricing(slot); } catch (e) { console.error('[sahra interior] preço', e); }
      if (interior && interior._gavetaVirouPorta) warnings.push(nomeMod + ': gaveta larga/alta demais virou porta (regra do Construtor)');
      results.push({ op, ok: true });
    }
    return { results, warnings };
  }

  async function mensagemDeErro(error, data) {
    if (typeof describeEdgeFunctionError === 'function') {
      try { return await describeEdgeFunctionError(error, data, 'sahra-chat'); } catch (e) { /* */ }
    }
    return (data && data.error) || (error && error.message) || String(error || '?');
  }

  let enviadoPorUltimo = '';
  // Garantia: se a caixa ainda tiver exatamente o que já foi enviado, limpa.
  function limpaSeRepetido() {
    const i = root && root.querySelector('.sa-in');
    if (i && enviadoPorUltimo && i.value.trim() === enviadoPorUltimo) { i.value = ''; i.style.height = 'auto'; }
  }
  async function enviar(textoForcado) {
    if (pensando) return;
    const inp = root.querySelector('.sa-in');
    const texto = String(textoForcado != null ? textoForcado : inp.value).trim();
    if (!texto) return;
    if (aba !== 'chat') mostraAba('chat');
    inp.value = ''; inp.style.height = 'auto';
    pararFala();
    conversa.push({ role: 'user', text: texto });
    enviadoPorUltimo = texto;
    pensando = true; renderConversa();
    poseEnquanto('pensando');
    const seq = ++chatSeq;
    chatAbort = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    try {
      const tC0 = performance.now();
      const ctx = await montaContexto();
      if (seq !== chatSeq) return;
      const tC1 = performance.now();
      const body = {
        lang: lang(),
        unit: ((document.getElementById('po-unit-select') || {}).value || 'mm') === 'in' ? 'in' : 'mm',
        messages: conversa.filter((m) => !m.err).map((m) => ({ role: m.role, text: m.text })),
        project: ctx.project, catalog: ctx.catalog,
        user_name: nomeCompleto(),
        colors_available: ctx.colors_available || [], color_roles: ctx.color_roles || []
      };
      const { data, error } = await supabaseClient.functions.invoke('sahra-chat', chatAbort ? { body, signal: chatAbort.signal } : { body });
      if (seq !== chatSeq) return; // parado pelo usuário: ignora a resposta
      const tC2 = performance.now();
      if (error || !data || data.error) throw new Error(await mensagemDeErro(error, data));
      const msg = { role: 'sahra', text: data.reply || '…', spoken: data.spoken || '', ops: Array.isArray(data.operations) ? data.operations : [],
        notDone: Array.isArray(data.not_done) ? data.not_done : [], actions: Array.isArray(data.actions) ? data.actions : [],
        concepts: (Array.isArray(data.concepts) ? data.concepts : []).slice(0, 2).map((d) => ({ desc: d, url: null, err: null })) };
      // VOZ JUNTO COM O TEXTO (05/11, Matt: "ela pode segurar a resposta pro
      // áudio sair junto, quando o áudio estiver ligado"): com a voz ligada,
      // continua "pensando" até o áudio chegar; texto e voz saem juntos.
      // Áudio falhou = mostra o texto e usa a voz do navegador.
      // VELOCIDADE (05/11): só espera a 1ª frase da voz; o resto é gerado
      // em paralelo e entra na sequência enquanto ela já está falando.
      let audio = null;
      if (vozLigada()) {
        audio = await preparaFala(msg.spoken || msg.text);
        if (seq !== chatSeq) { descartaFala(audio); return; }
      }
      // CRONÔMETRO (06/11): onde foi o tempo. Aparece no console (F12) e
      // num rodapé discreto embaixo da resposta.
      {
        const tC3 = performance.now(), tm = data.timing || {}, s1 = (ms) => (ms / 1000).toFixed(1).replace('.', ',') + ' s';
        msg.timing = { total: tC3 - tC0, contexto: tC1 - tC0, funcao: tC2 - tC1, voz: tC3 - tC2, srv: tm };
        console.info('[sahra tempo]', { total: s1(tC3 - tC0), contexto: s1(tC1 - tC0), funcao: s1(tC2 - tC1), ia: tm.ia_ms != null ? s1(tm.ia_ms) : '?', banco: tm.db_ms != null ? s1(tm.db_ms) : '?', regras: tm.regras_ms != null ? s1(tm.regras_ms) : '?', voz: s1(tC3 - tC2), raciocinio: tm.raciocinio, modelo: data.model, prompt_chars: tm.prompt_chars, regras_codex: tm.regras_codex });
        msg.tempoTxt = '⏱ ' + s1(tC3 - tC0) + (tm.ia_ms != null ? ' · IA ' + s1(tm.ia_ms) + ' (' + (tm.raciocinio || '') + ')' : '') + (vozLigada() ? ' · voz ' + s1(tC3 - tC2) : '') + (data.model ? ' · ' + data.model : '');
      }
      conversa.push(msg);
      poseEnquanto(null);
      pose(msg.ops.length || msg.concepts.length ? 'paleta' : 'apresenta', 5000);
      pensando = false; chatAbort = null; renderConversa();
      if (vozLigada()) { if (audio) tocaFala(audio); else falarNavegador(limpaParaFala(msg.spoken || msg.text)); }
      if (msg.concepts.length) geraConceitos(msg);
      // APRENDER (05/11, Matt: "um canal que ela aprenda nos codex dela e não
      // esqueça em nenhuma sessão futura; só administrador"): regras que ela
      // devolveu em `learn` vão pra tabela sahra_lessons (RLS só admin).
      if (Array.isArray(data.learn) && data.learn.length) {
        msg.learned = data.learn.map((L) => Object.assign({ status: 'nova', existing: [] }, L));
        msg.origem = texto;
        processaAprendizado(msg.learned, texto).then(renderConversa);
      }
    } catch (e) {
      if (seq !== chatSeq) return;
      console.error('[sahra chat]', e);
      conversa.push({ role: 'sahra', err: true, text: T('err') + ((e && e.message) || String(e)) });
    } finally {
      if (seq === chatSeq) { pensando = false; chatAbort = null; if (poseFixa === 'pensando') poseEnquanto(null); renderConversa(); limpaSeRepetido(); }
    }
  }

  // ---------------------------------------------------------------- CODEX (aprendizado + centrais)
  // CENTRAIS (05/11, migration 269, Matt: "um cérebro que tem centrais de
  // assuntos e elas se conectam"): cada regra mora numa central, tem peso
  // (ouro/normal/preferência) e, ao chegar, é conferida contra a mesma
  // central + ligadas (função sahra-chat): nova = grava; duplicada = não
  // grava; contradiz = o Matt escolhe (nova vale / antiga vale / as duas).
  const CENTRAIS_PADRAO = [
    ['composicao', 'Composição', 'Composition', 'Composición'], ['eletros', 'Eletros', 'Appliances', 'Electrodomésticos'],
    ['paineis', 'Painéis e componentes', 'Panels & components', 'Paneles y componentes'], ['materiais', 'Materiais', 'Materials', 'Materiales'],
    ['cores', 'Cores e tendências', 'Colors & trends', 'Colores y tendencias'], ['iluminacao', 'Iluminação', 'Lighting', 'Iluminación'],
    ['funcao', 'Função e ergonomia', 'Function & ergonomics', 'Función y ergonomía'], ['cliente', 'Cliente e estilo', 'Client & style', 'Cliente y estilo'],
    ['custo', 'Custo', 'Cost', 'Costo'], ['producao', 'Produção', 'Production', 'Producción'],
    ['conversa', 'Jeito de conversar', 'How to talk', 'Forma de hablar'], ['negocio', 'Negócio Legno', 'Legno business', 'Negocio Legno']
  ].map(([slug, pt, en, es]) => ({ slug, name_pt: pt, name_en: en, name_es: es, related: [] }));
  let centraisDb = null;
  function centrais() { return (centraisDb && centraisDb.length) ? centraisDb : CENTRAIS_PADRAO; }
  function nomeCentral(slug) {
    const h = centrais().find((x) => x.slug === slug);
    if (!h) return T('no_hub');
    return h['name_' + lang()] || h.name_pt || slug;
  }
  let temCentraisNoBanco = true; // false = migration 269 ainda não rodada (grava no formato da 268)

  function itemAprendido(L, attrDecide, attrForget) {
    const wt = L.weight ? `<span class="sa-wt ${esc(L.weight)}">${esc(T('w_' + L.weight))}</span> ` : '';
    const hub = L.hub ? `<em style="font-style:normal;color:#8a5a34">${esc(nomeCentral(L.hub))}</em> · ` : '';
    const linha = `${hub}${wt}${esc(L.rule)}`;
    if (L.status === 'duplicada' && !L.decided) {
      return `<div class="sa-learn"><strong>✓ ${esc(T('dup'))}</strong><div class="sa-lr"><span>${esc((L.existing[0] || {}).rule || L.rule)}</span></div></div>`;
    }
    if (L.status === 'contradiz' && !L.decided) {
      return `<div class="sa-learn sa-clash"><strong>⚠ ${esc(T('clash'))}</strong>
        ${(L.existing || []).map((e) => `<div class="sa-old">— ${esc(e.rule)}</div>`).join('')}
        <div><strong>${esc(T('learned'))}</strong> ${linha}</div>${L.note ? `<div class="sa-small">${esc(L.note)}</div>` : ''}
        <div class="sa-mact">
          <button type="button" ${attrDecide} data-dec="nova">${esc(T('keep_new'))}</button>
          <button type="button" class="secondary" ${attrDecide} data-dec="antiga">${esc(T('keep_old'))}</button>
          <button type="button" class="secondary" ${attrDecide} data-dec="ambas">${esc(T('keep_both'))}</button>
        </div></div>`;
    }
    const fim = { nova: T('kept_new'), antiga: T('kept_old'), ambas: T('kept_both') }[L.decided] || '';
    if (L.decided === 'antiga') return `<div class="sa-learn"><div class="sa-lr gone"><span>${esc(L.rule)}</span></div><div class="sa-small">${esc(fim)}</div></div>`;
    return `<div class="sa-learn"><strong>📌 ${esc(T('learned'))}</strong><div class="sa-lr${L.gone ? ' gone' : ''}"><span>${linha}</span>${L.id && !L.gone && attrForget ? `<button type="button" class="secondary" ${attrForget}>${esc(T('forget'))}</button>` : ''}</div>${fim ? `<div class="sa-small">${esc(fim)}</div>` : ''}${L.erro ? `<div class="sa-small">${esc(T('learn_err') + L.erro)}</div>` : ''}</div>`;
  }

  // grava as "nova" na hora; duplicada e contradiz esperam (ou não gravam)
  async function processaAprendizado(itens, origem) {
    for (const L of itens) {
      if (L.status === 'nova' || !L.status) {
        const r = await guardaRegra(L, origem);
        if (r.ok) L.id = r.id; else L.erro = r.erro;
      }
    }
  }
  async function decide(L, escolha, origem) {
    if (L.decided) return;
    if (escolha === 'antiga') { L.decided = 'antiga'; return; }
    const r = await guardaRegra(L, origem);
    if (!r.ok) { L.erro = r.erro; return; }
    L.id = r.id;
    if (escolha === 'nova') {
      for (const e of (L.existing || [])) {
        try {
          const patch = temCentraisNoBanco ? { active: false, replaced_by: r.id, replaced_at: new Date().toISOString() } : { active: false };
          const { error } = await supabaseClient.from('sahra_lessons').update(patch).eq('id', e.id);
          if (error) throw error;
        } catch (er) { console.error('[sahra substituir]', er); L.erro = (er && er.message) || String(er); }
      }
    }
    L.decided = escolha;
  }
  async function guardaRegra(L, origem) {
    const base = { rule: String(L.rule || '').slice(0, 600), source: String(origem || '').slice(0, 500), topic: L.hub ? nomeCentral(L.hub) : null };
    const tenta = async (row) => {
      const { data, error } = await supabaseClient.from('sahra_lessons').insert([row]).select('id');
      if (error) throw error;
      return (data && data[0] && data[0].id) || null;
    };
    try {
      if (temCentraisNoBanco) {
        try { return { ok: true, id: await tenta(Object.assign({}, base, { hub: L.hub || null, weight: L.weight || 'normal' })) }; }
        catch (e) {
          if (!/hub|weight|column|schema cache/i.test(String(e && e.message))) throw e;
          temCentraisNoBanco = false; // 269 não rodada
        }
      }
      return { ok: true, id: await tenta(base) };
    } catch (e) {
      console.error('[sahra aprender]', e);
      return { ok: false, erro: (e && e.message) || String(e) };
    }
  }
  async function esqueceRegra(id) {
    try {
      const { error } = await supabaseClient.from('sahra_lessons').delete().eq('id', id);
      if (error) throw error;
      return true;
    } catch (e) { console.error('[sahra esquecer]', e); status(String((e && e.message) || e)); return false; }
  }
  async function carregaCodex() {
    const box = root.querySelector('.sa-cx-list');
    box.innerHTML = '<span class="sa-dots"><span></span><span></span><span></span></span>';
    try {
      if (!centraisDb) {
        try {
          const { data: hs, error: he } = await supabaseClient.from('sahra_hubs').select('slug,name_pt,name_en,name_es,related').order('sort_order');
          if (!he && hs && hs.length) centraisDb = hs; else centraisDb = [];
        } catch (e) { centraisDb = []; }
        textos();
      }
      let res = await supabaseClient.from('sahra_lessons').select('id,hub,weight,topic,rule,created_at').eq('active', true).order('created_at', { ascending: false });
      if (res.error && /hub|weight|column/i.test(res.error.message || '')) {
        temCentraisNoBanco = false;
        res = await supabaseClient.from('sahra_lessons').select('id,topic,rule,created_at').eq('active', true).order('created_at', { ascending: false });
      }
      if (res.error) throw res.error;
      codexData = res.data || [];
      pintaCodex();
    } catch (e) {
      box.innerHTML = `<p class="sa-hint">${esc(T('codex_load_err') + ((e && e.message) || e))}</p>`;
    }
  }
  // EDITAR + REVISÃO GERAL (05/11, Matt: "coloca um botão editar, e depois
  // de editado uma revisão geral"): a regra editada é comparada com o Codex
  // INTEIRO (check_learn scope:'all', sem ela mesma). Sem choque = grava.
  // Duplicada/contradiz = o Matt decide antes de gravar.
  let codexData = [], cxEdit = null; // { id, texto, fase: 'edit'|'checando'|'resultado', L, msg }
  function blocoEdicao(l) {
    const e = cxEdit;
    if (e.fase === 'checando') return `<div class="sa-cx-ed"><p class="sa-hint">${esc(T('ed_checking'))}</p></div>`;
    if (e.fase === 'resultado' && e.L && e.L.status !== 'nova') {
      const lista = (e.L.existing || []).map((x) => `<div class="sa-old">— ${esc(x.rule)}</div>`).join('');
      const btns = e.L.status === 'contradiz'
        ? `<button type="button" data-ed="vale">${esc(T('ed_keep_edit'))}</button><button type="button" class="secondary" data-ed="ambas">${esc(T('ed_keep_both'))}</button><button type="button" class="secondary" data-ed="cancel">${esc(T('ed_undo'))}</button>`
        : `<button type="button" data-ed="apagar">${esc(T('ed_del_this'))}</button><button type="button" class="secondary" data-ed="ambas">${esc(T('ed_save_anyway'))}</button><button type="button" class="secondary" data-ed="cancel">${esc(T('ed_undo'))}</button>`;
      return `<div class="sa-cx-ed sa-learn sa-clash"><strong>⚠ ${esc(T(e.L.status === 'contradiz' ? 'ed_clash' : 'ed_dup'))}</strong>${lista}
        <div><strong>${esc(T('ed_label'))}</strong> ${esc(e.texto)}</div>${e.L.note ? `<div class="sa-small">${esc(e.L.note)}</div>` : ''}<div class="sa-mact">${btns}</div></div>`;
    }
    return `<div class="sa-cx-ed"><textarea class="sa-cx-edin">${esc(e.texto)}</textarea>
      <div class="sa-mact"><button type="button" data-ed="save">${esc(T('ed_save'))}</button><button type="button" class="secondary" data-ed="cancel">${esc(T('ed_cancel'))}</button></div></div>`;
  }
  function pintaCodex() {
    const box = root.querySelector('.sa-cx-list');
    const data = codexData;
    {
      if (!data.length) { box.innerHTML = `<p class="sa-hint">${esc(T('codex_empty'))}</p>`; return; }
      const ordem = { ouro: 0, normal: 1, preferencia: 2 };
      const grupos = centrais().map((h) => h.slug).concat(['']);
      box.innerHTML = grupos.map((slug) => {
        const ls = data.filter((l) => (l.hub || '') === slug).sort((a, b) => (ordem[a.weight] || 1) - (ordem[b.weight] || 1));
        if (!ls.length) return '';
        const h = centrais().find((x) => x.slug === slug);
        const lig = h && h.related && h.related.length ? ` <small>↔ ${h.related.map(nomeCentral).map(esc).join(', ')}</small>` : '';
        return `<div class="sa-hubh">${esc(slug ? nomeCentral(slug) : T('no_hub'))} (${ls.length})${lig}</div>` + ls.map((l) => {
          if (cxEdit && String(cxEdit.id) === String(l.id)) return blocoEdicao(l);
          const ok = cxEdit && cxEdit.okId && String(cxEdit.okId) === String(l.id) ? `<div class="sa-small" style="color:#3f6b3a">${esc(T('ed_ok'))}</div>` : '';
          return `<div class="sa-cx-it"><div>${temCentraisNoBanco
          ? `<button type="button" class="sa-wt ${esc(l.weight || 'normal')}" data-wt="${esc(l.id)}" data-w="${esc(l.weight || 'normal')}" title="${esc(T('w_hint'))}">${esc(T('w_' + (l.weight || 'normal')))}</button> ` : ''}${esc(l.rule)}${ok}</div><div class="sa-cx-btns"><button type="button" class="secondary" data-edit="${esc(l.id)}">${esc(T('ed_btn'))}</button><button type="button" class="secondary" data-del="${esc(l.id)}">${esc(T('codex_del'))}</button></div></div>`;
        }).join('');
      }).join('');
    }
  }
  async function salvaEdicao(escolha) {
    const e = cxEdit; if (!e) return;
    const reg = codexData.find((x) => String(x.id) === String(e.id));
    if (escolha === 'cancel') { cxEdit = null; pintaCodex(); return; }
    if (escolha === 'apagar') { await esqueceRegra(e.id); cxEdit = null; carregaCodex(); return; }
    if (escolha === 'save') {
      const ta = root.querySelector('.sa-cx-edin');
      e.texto = (ta && ta.value || '').trim();
      if (!e.texto) return;
      if (reg && e.texto === reg.rule) { cxEdit = null; pintaCodex(); return; }
      e.fase = 'checando'; pintaCodex();
      try {
        const { data, error } = await supabaseClient.functions.invoke('sahra-chat', { body: {
          check_learn: [{ rule: e.texto, hub: reg && reg.hub, weight: reg && reg.weight }], exclude_id: e.id, scope: 'all', lang: lang() } });
        if (error || !data || !Array.isArray(data.learn)) throw new Error((data && data.error) || (error && error.message) || '?');
        e.L = data.learn[0];
      } catch (er) {
        console.warn('[sahra editar] revisão falhou, gravando direto', er);
        e.L = { status: 'nova', existing: [] };
      }
      e.fase = 'resultado';
      if (e.L.status !== 'nova') { pintaCodex(); return; }
      escolha = 'ambas'; // sem choque: grava direto
    }
    // grava a edição (nova / ambas / vale)
    try {
      const { error } = await supabaseClient.from('sahra_lessons').update({ rule: e.texto.slice(0, 600) }).eq('id', e.id);
      if (error) throw error;
      if (escolha === 'vale') {
        for (const x of (e.L.existing || [])) {
          const patch = temCentraisNoBanco ? { active: false, replaced_by: e.id, replaced_at: new Date().toISOString() } : { active: false };
          await supabaseClient.from('sahra_lessons').update(patch).eq('id', x.id);
        }
      }
      cxEdit = (e.L && e.L.status === 'nova') ? { okId: e.id } : null;
    } catch (er) { status(T('learn_err') + ((er && er.message) || er)); cxEdit = null; }
    carregaCodex();
  }

  // IMAGENS DE CONCEITO (05/11, Matt: "mostrar algumas imagens antes de
  // fazer o projeto, pra ter uma ideia melhor. algo simples"): a SAHRA manda
  // 1–2 descrições em `concepts`; cada uma vira uma imagem (Gemini imagem,
  // sahra-chat {image}) que aparece na mensagem. Clique abre grande.
  async function geraConceitos(msg) {
    await Promise.all(msg.concepts.map(async (c) => {
      try {
        const { data, error } = await supabaseClient.functions.invoke('sahra-chat', { body: { image: c.desc } });
        if (error || !data || !data.image) throw new Error((data && data.error) || (error && error.message) || 'sem imagem');
        c.url = 'data:' + (data.mime || 'image/png') + ';base64,' + data.image;
      } catch (e) {
        console.warn('[sahra conceito]', e);
        c.err = (e && e.message) || String(e);
      }
      renderConversa();
    }));
  }
  function abreImagem(url) {
    let v = document.getElementById('po-sahra-img');
    if (!v) {
      v = document.createElement('div');
      v.id = 'po-sahra-img';
      v.style.cssText = 'position:fixed;inset:0;z-index:1200;background:rgba(0,0,0,.8);display:flex;align-items:center;justify-content:center;padding:24px;cursor:zoom-out';
      v.innerHTML = '<img style="max-width:100%;max-height:100%;border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,.5)">';
      v.addEventListener('click', () => { v.style.display = 'none'; });
      document.body.appendChild(v);
    }
    v.querySelector('img').src = url;
    v.style.display = 'flex';
  }

  // Mesma técnica do portal-19 (editProjectAiRun): UM passo no Desfazer.
  // 2ª versão (05/11, Matt travou em "Aplicando…" com 11 mudanças): aplica
  // UMA operação por vez (editProjectAiApply([op])), mostra o progresso e dá
  // pra PARAR entre uma e outra — parar volta o projeto pra foto de antes
  // (undoProjectChange). Operação que demora mais que OP_TIMEOUT_MS é
  // abandonada (aviso) e segue a próxima; se ela terminar depois de um
  // Parar, o módulo que ela inseriu é tirado.
  const OP_TIMEOUT_MS = 25000;
  let aplicando = null;   // { m, cancel }
  async function aplicar(m) {
    if (!m || m.applied || m.applying || aplicando || typeof editProjectAiApply !== 'function') return;
    const job = { m, cancel: false };
    aplicando = job;
    m.applying = true; m.progress = 0; m.warnings = []; renderConversa();
    const stackAntes = projectUndoStack.slice();
    const fotoAntes = projectUndoSnapshot();
    const idsAntes = new Set(projectSlots.map((x) => String(x.id)));
    const falhas = [];
    try {
      for (let k = 0; k < m.ops.length; k++) {
        if (job.cancel) break;
        m.progress = k + 1; renderConversa();
        const op = m.ops[k];
        const run = op.op === 'set_interior' ? aplicaInterior(op) : op.op === 'set_led' ? aplicaLed(op)
          : op.op === 'add_module' ? aplicaModuloCompleto(op) : editProjectAiApply([op]);
        let timer = null;
        const out = await Promise.race([run, new Promise((res) => { timer = setTimeout(() => res('__timeout'), OP_TIMEOUT_MS); })]);
        clearTimeout(timer);
        if (out === '__timeout') {
          falhas.push((op.reason || op.op) + ' (demorou demais)');
          // se terminar depois de um Parar, tira o que ela inseriu
          run.then(() => { if (job.cancel) limpaIntrusos(job.idsFinais); }).catch(() => {});
          continue;
        }
        (out && out.warnings || []).forEach((w) => m.warnings.push(w));
        ((out && out.results) || []).filter((r) => !r.ok).forEach((r) => falhas.push(r.op && r.op.reason));
        try { renderProjectCanvas(); } catch (e) { /* */ }
      }
      // um passo só no Desfazer
      projectUndoStack = stackAntes.concat([fotoAntes]);
      if (projectUndoStack.length > PROJECT_UNDO_MAX) projectUndoStack.shift();
      projectRedoStack = [];
      projectUndoBaseline = projectUndoSnapshot();
      projectUndoLastPushAt = Date.now();
      if (job.cancel) {
        // volta pra foto de antes
        undoProjectChange();
        projectRedoStack = []; // refazer o "meio aplicado" não faz sentido
        job.idsFinais = idsAntes;
        limpaIntrusos(idsAntes);
        m.stopped = true;
      } else {
        try { markProjectDirty(); } catch (e) { /* */ }
        m.applied = true;
        pose('joinha', 4500);
      }
      try { refreshProjectUndoButton(); refreshProjectRedoButton(); } catch (e) { /* */ }
      try { renderProjectCanvas(); } catch (e) { /* */ }
      try { if (typeof renderProjectSummary === 'function') renderProjectSummary(); } catch (e) { /* */ }
      try { if (typeof renderProjectConfigPanel === 'function') renderProjectConfigPanel(); } catch (e) { /* */ }
      if (falhas.filter(Boolean).length && !m.stopped) m.notDone = (m.notDone || []).concat(falhas.filter(Boolean));
      atualiza(false);
    } catch (e) {
      console.error('[sahra aplicar]', e);
      m.warnings.push((e && e.message) || String(e));
    } finally {
      m.applying = false;
      if (aplicando === job) aplicando = null;
      renderConversa();
    }
  }
  // MONTAGEM COMPLETA (05/11, Matt: "faz tudo branco e sem usar o
  // construtor"): add_module chega com cores por papel, interior e LED.
  // Insere pelo caminho de sempre e, no módulo que acabou de nascer, aplica
  // as cores (mesma função do set_color), o Construtor (aplicaInterior) e o
  // LED (aplicaLed).
  async function aplicaModuloCompleto(op) {
    const antes = new Set(projectSlots.map((x) => String(x.id)));
    const out = (await editProjectAiApply([op])) || {};
    const warnings = (out.warnings || []).slice();
    const results = (out.results || []).slice();
    const novo = projectSlots.find((x) => !antes.has(String(x.id)));
    if (!novo) return { results, warnings };
    const id = String(novo.id);
    if (Array.isArray(op.colors) && op.colors.length && typeof iaeOpSetColor === 'function') {
      op.colors.forEach((c) => {
        try { iaeOpSetColor({ slot_ids: [id], role: c.role, color_name: c.color_name }, warnings); } catch (e) { warnings.push(String(e.message || e)); }
      });
    }
    if (op.interior) {
      const r = await aplicaInterior({ slot_ids: [id], interior: op.interior, reason: op.reason });
      (r.warnings || []).forEach((w) => warnings.push(w));
    }
    if (op.led) {
      try {
        const r = await aplicaLed({ slot_ids: [id], led: op.led, reason: op.reason });
        (r.warnings || []).forEach((w) => warnings.push(w));
      } catch (e) { warnings.push('LED: ' + (e.message || e)); }
    }
    try { recomputeProjectSlotPricing(novo); } catch (e) { /* */ }
    return { results, warnings };
  }
  function limpaIntrusos(idsOk) {
    if (!idsOk) return;
    const antes = projectSlots.length;
    projectSlots = projectSlots.filter((x) => idsOk.has(String(x.id)));
    if (projectSlots.length !== antes) { try { renderProjectCanvas(); renderProjectConfigPanel(); } catch (e) { /* */ } }
  }

  // ---------------------------------------------------------------- POSES
  let poseAtual = 'neutra', poseVolta = null, poseFixa = null, proximaPose = 0;
  POSES.forEach((n) => { const im = new Image(); im.src = poseUrl(n); }); // pré-carrega
  function mostraPose(nome) {
    if (!root || nome === poseAtual) return;
    const imgs = root.querySelectorAll('.sa-av .sa-pose');
    if (imgs.length < 2) return;
    const atual = imgs[0].classList.contains('on') ? imgs[0] : imgs[1];
    const outra = atual === imgs[0] ? imgs[1] : imgs[0];
    outra.src = poseUrl(nome);
    outra.classList.add('on'); atual.classList.remove('on');
    poseAtual = nome;
  }
  // pose por um tempo e volta pra neutra (ou pra pose fixa, se houver)
  function pose(nome, ms) {
    clearTimeout(poseVolta);
    mostraPose(nome);
    poseVolta = setTimeout(() => mostraPose(poseFixa || 'neutra'), ms || 4000);
  }
  // pose que fica enquanto durar um estado (ex.: pensando); null solta
  function poseEnquanto(nome) {
    poseFixa = nome;
    clearTimeout(poseVolta);
    mostraPose(nome || 'neutra');
  }
  function sorteiaPose(agora) {
    if (!proximaPose) { proximaPose = agora + 15000 + Math.random() * 15000; return; }
    if (agora < proximaPose || poseFixa) return;
    proximaPose = agora + 25000 + Math.random() * 25000;
    const op = ['oi', 'paleta', 'pensando', 'apresenta', 'joinha'].filter((n) => n !== poseAtual);
    pose(op[Math.floor(Math.random() * op.length)], 3500 + Math.random() * 1500);
  }

  // ---------------------------------------------------------------- VOZ
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  // Espera SILENCIO_MS de silêncio antes de enviar (pedido do Matt: 4 s; 06/11 baixou pra 2 s).
  // continuous=true + timer próprio, porque o modo padrão do navegador fecha
  // na primeira pausa. Tocar no mic de novo envia na hora.
  const SILENCIO_MS = 2000;
  let rec = null, gravando = false, textoFalado = '', timerSilencio = null, pararPedido = false;
  const langTag = () => ({ pt: 'pt-BR', en: 'en-US', es: 'es-ES' }[lang()] || 'pt-BR');

  function status(txt) { const s = root && root.querySelector('.sa-status'); if (s) s.textContent = txt || ''; }

  function alternaMic() {
    if (gravando) { pararPedido = true; clearTimeout(timerSilencio); try { rec.stop(); } catch (e) { /* */ } return; }
    if (!SR) { status(T('no_speech')); return; }
    pararFala();
    textoFalado = '';
    pararPedido = false;
    const inp = root.querySelector('.sa-in');
    const base = inp.value ? inp.value.trim() + ' ' : '';
    let acumulado = ''; // texto final das sessões anteriores (o Chrome reinicia sozinho)
    // 06/11 (Matt: "depois dela responder minha última conversa fica gravada no
    // texto"): resultado atrasado do reconhecimento chegava DEPOIS do envio e
    // escrevia a fala de volta na caixa. Encerrou = ignora tudo que chegar.
    let encerrado = false;
    const armaSilencio = (ms) => {
      clearTimeout(timerSilencio);
      timerSilencio = setTimeout(() => { pararPedido = true; try { rec.stop(); } catch (e) { /* */ } }, ms || SILENCIO_MS);
    };
    const inicia = () => {
      let finSessao = '';
      const r = rec = new SR();
      rec.lang = langTag();
      rec.interimResults = true;
      rec.continuous = true;
      rec.onresult = (ev) => {
        if (encerrado || r !== rec) return;
        let fin = '', tmp = '';
        for (let i = 0; i < ev.results.length; i++) {
          if (ev.results[i].isFinal) fin += ev.results[i][0].transcript; else tmp += ev.results[i][0].transcript;
        }
        finSessao = fin;
        textoFalado = acumulado + fin;
        inp.value = base + acumulado + fin + tmp;
        armaSilencio(); // ainda falando: zera a contagem
      };
      rec.onerror = (ev) => {
        console.warn('[sahra mic]', ev.error);
        if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed' || ev.error === 'audio-capture') pararPedido = true;
      };
      rec.onend = () => {
        if (encerrado || r !== rec) return;
        if (finSessao.trim()) acumulado = (acumulado + finSessao).trim() + ' ';
        if (!pararPedido) { try { inicia(); return; } catch (e) { /* cai pro encerramento */ } }
        clearTimeout(timerSilencio);
        encerrado = true;
        gravando = false;
        root.querySelector('.sa-mic').classList.remove('rec');
        status('');
        if (textoFalado.trim()) { inp.value = (base + textoFalado).trim(); enviar(); } // calou 2 s = envia
      };
      rec.start();
    };
    try {
      inicia();
      gravando = true;
      root.querySelector('.sa-mic').classList.add('rec');
      status(T('mic_on'));
      armaSilencio(SILENCIO_MS * 2); // tempo maior pra começar a falar
    } catch (e) { status(String(e.message || e)); }
  }

  function vozLigada() { try { return localStorage.getItem(VOZ_KEY) === '1'; } catch (e) { return false; } }
  function setVoz(on) { try { localStorage.setItem(VOZ_KEY, on ? '1' : '0'); } catch (e) { /* */ } pintaVoz(); }
  function pintaVoz() {
    const b = root && root.querySelector('.sa-voz');
    if (!b) return;
    const on = vozLigada();
    b.innerHTML = on ? ICO.spk : ICO.mute;
    b.classList.toggle('on', on);
    b.title = on ? T('voice_on') : T('voice_off');
  }
  function escolheVoz() {
    if (!window.speechSynthesis) return null;
    const tag = langTag().toLowerCase(), base = tag.slice(0, 2);
    const vs = window.speechSynthesis.getVoices() || [];
    const doIdioma = vs.filter((v) => (v.lang || '').toLowerCase().replace('_', '-') === tag);
    const pool = doIdioma.length ? doIdioma : vs.filter((v) => (v.lang || '').toLowerCase().startsWith(base));
    const fem = /female|mulher|francisca|maria|luciana|vit[oó]ria|thalita|raquel|helena|sabina|samantha|zira|aria|jenny|google/i;
    return pool.find((v) => /natural|online|neural/i.test(v.name) && fem.test(v.name))
      || pool.find((v) => fem.test(v.name)) || pool[0] || null;
  }
  // VOZ NATURAL (05/11, Matt: "a voz está muito robô"): Gemini TTS pela
  // função sahra-chat ({tts}); PCM → WAV → <audio>. Falhou = voz do navegador.
  const VOZ_GEMINI = 'Aoede';
  let audioAtual = null, falaSeq = 0;
  function pcmParaWav(b64, mime) {
    const bin = atob(b64);
    const pcm = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) pcm[i] = bin.charCodeAt(i);
    const m = /rate=(\d+)/i.exec(mime || '');
    const rate = m ? Number(m[1]) : 24000;
    const buf = new ArrayBuffer(44 + pcm.length);
    const v = new DataView(buf);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + pcm.length, true); str(8, 'WAVE'); str(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, 'data'); v.setUint32(40, pcm.length, true);
    new Uint8Array(buf, 44).set(pcm);
    return new Blob([buf], { type: 'audio/wav' });
  }
  function limpaParaFala(texto) {
    return String(texto || '').replace(/\*\*/g, '').replace(/^\s*[-•*]\s+/gm, '').replace(/#/g, '')
      .replace(/(\d+)\s*["”]/g, '$1 ' + ({ en: 'inches', es: 'pulgadas' }[lang()] || 'polegadas')).replace(/\s+/g, ' ').trim();
  }
  // Um pedaço de fala → url de áudio (Gemini TTS), ou null se falhou.
  async function pedeAudio(trecho) {
    try {
      const { data, error } = await supabaseClient.functions.invoke('sahra-chat', { body: { tts: trecho.slice(0, 2500), lang: lang(), voice: VOZ_GEMINI } });
      if (error || !data || !data.audio) throw new Error((data && data.error) || (error && error.message) || 'sem áudio');
      const blob = /^audio\/(wav|mpeg|mp3|ogg)/i.test(data.mime || '')
        ? new Blob([Uint8Array.from(atob(data.audio), (c) => c.charCodeAt(0))], { type: data.mime })
        : pcmParaWav(data.audio, data.mime);
      return URL.createObjectURL(blob);
    } catch (e) {
      console.warn('[sahra voz] trecho falhou:', e);
      return null;
    }
  }
  // VELOCIDADE (05/11, Matt: "tem como diminuir o delay da voz?"): a fala é
  // quebrada em pedaços (1ª frase sozinha, o resto de 2 em 2 frases) e todos
  // são pedidos AO MESMO TEMPO. Só esperamos o 1º — frase curta = áudio
  // rápido —; os outros chegam enquanto ela já está falando.
  // Devolve { primeiro: url, resto: [Promise<url|null>] } ou null (falhou).
  async function preparaFala(texto) {
    const limpo = limpaParaFala(texto);
    if (!limpo) return null;
    const frases = (limpo.match(/[^.!?…]+[.!?…]+["')\]]*\s*|[^.!?…]+$/g) || [limpo]).map((f) => f.trim()).filter(Boolean);
    const pedacos = [];
    let i = 0;
    let primeiro = frases[i++] || limpo;
    while (primeiro.length < 40 && i < frases.length) primeiro += ' ' + frases[i++]; // 1ª frase muito curta junta com a próxima
    pedacos.push(primeiro);
    while (i < frases.length) { pedacos.push(frases.slice(i, i + 2).join(' ')); i += 2; }
    const promessas = pedacos.map(pedeAudio);
    const url1 = await promessas[0];
    if (!url1) { promessas.slice(1).forEach((p) => p.then((u) => u && URL.revokeObjectURL(u))); return null; }
    return { primeiro: url1, resto: promessas.slice(1) };
  }
  function descartaFala(f) {
    if (!f) return;
    try { URL.revokeObjectURL(f.primeiro); } catch (e) { /* */ }
    (f.resto || []).forEach((p) => p.then((u) => u && URL.revokeObjectURL(u)));
  }
  function tocaFala(f) {
    pararFala();
    const seq = ++falaSeq;
    const fila = [Promise.resolve(f.primeiro)].concat(f.resto || []);
    let k = 0;
    root.classList.add('falando'); pintaEnviar();
    const fim = () => { if (seq === falaSeq) { root.classList.remove('falando'); audioAtual = null; pintaEnviar(); } };
    const proximo = async () => {
      if (seq !== falaSeq) { fila.slice(k).forEach((p) => p.then((u) => u && URL.revokeObjectURL(u))); return; }
      if (k >= fila.length) { fim(); return; }
      const url = await fila[k++];
      if (seq !== falaSeq) { if (url) URL.revokeObjectURL(url); fila.slice(k).forEach((p) => p.then((u) => u && URL.revokeObjectURL(u))); return; }
      if (!url) { proximo(); return; } // pedaço falhou: pula
      audioAtual = new Audio(url);
      audioAtual.onended = () => { URL.revokeObjectURL(url); proximo(); };
      audioAtual.onerror = audioAtual.onended;
      audioAtual.play().catch((e) => { console.warn('[sahra voz] play', e); fim(); });
    };
    proximo();
  }
  async function falar(texto) {
    if (!vozLigada()) return;
    pararFala();
    const seq = ++falaSeq;
    root.classList.add('falando'); pintaEnviar();
    const f = await preparaFala(texto);
    if (seq !== falaSeq) { descartaFala(f); return; }
    if (f) tocaFala(f); else falarNavegador(limpaParaFala(texto));
  }
  function falarNavegador(limpo) {
    if (!window.speechSynthesis) { root.classList.remove('falando'); return; }
    // frases curtas: o Chrome corta falas longas no meio
    const partes = limpo.match(/[^.!?…]+[.!?…]*/g) || [limpo];
    const voz = escolheVoz();
    partes.forEach((p, i) => {
      const u = new SpeechSynthesisUtterance(p.trim());
      u.lang = langTag(); if (voz) u.voice = voz; u.rate = 1.05;
      if (i === 0) u.onstart = () => { root.classList.add('falando'); pintaEnviar(); };
      if (i === partes.length - 1) { u.onend = () => { root.classList.remove('falando'); pintaEnviar(); }; u.onerror = u.onend; }
      window.speechSynthesis.speak(u);
    });
  }
  function pararFala() {
    falaSeq++;
    try { if (audioAtual) { audioAtual.pause(); audioAtual = null; } } catch (e) { /* */ }
    try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) { /* */ }
    if (root) root.classList.remove('falando');
    pintaEnviar();
  }
  try { if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = () => {}; } catch (e) { /* carrega as vozes */ }

  // ---------------------------------------------------------------- REVISÃO
  function depoisDeCorrigir() {
    try { if (typeof renderProjectCanvas === 'function') renderProjectCanvas(); } catch (e) { /* */ }
    try { if (typeof renderProjectConfigPanel === 'function') renderProjectConfigPanel(); } catch (e) { /* */ }
    try { if (typeof markProjectDirty === 'function') markProjectDirty(); } catch (e) { /* */ }
    atualiza(true);
  }

  function nomeSlot(slotId) {
    let todos = [];
    try { todos = (typeof projectSlots !== 'undefined' && projectSlots) ? projectSlots : []; } catch (e) { /* */ }
    const i = todos.findIndex((x) => x && x.id === slotId);
    if (i < 0) return '';
    const s = todos[i];
    return '#' + (i + 1) + ' ' + ((s.module && s.module.name) || s.reference || '');
  }

  function atualiza(renderizar) {
    achados = rodaAuditor();
    const n = { erro: 0, aviso: 0, dica: 0 };
    achados.forEach((a) => { n[a.nivel] = (n[a.nivel] || 0) + 1; });
    const total = n.erro + n.aviso;
    badge.textContent = total > 99 ? '99+' : String(total);
    badge.style.display = total ? 'block' : 'none';
    badge.classList.toggle('aviso', !n.erro && n.aviso > 0);
    if (!renderizar) return;

    const pills = root.querySelector('.sa-pills');
    const list = root.querySelector('.sa-list');
    const fixAll = root.querySelector('.sa-fixall');
    if (!slotsDoProjeto().length) {
      pills.innerHTML = ''; list.innerHTML = `<p class="sa-hint">${esc(T('empty'))}</p>`; fixAll.style.display = 'none'; return;
    }
    const lbl = (k, v) => v + ' ' + T(v === 1 ? k : k + 's');
    pills.innerHTML = `<span class="sa-pill erro">${esc(lbl('erro', n.erro))}</span><span class="sa-pill aviso">${esc(lbl('aviso', n.aviso))}</span><span class="sa-pill">${esc(lbl('dica', n.dica))}</span>`;
    if (!achados.length) { list.innerHTML = `<p class="sa-ok">✓ ${esc(T('ok'))}</p>`; fixAll.style.display = 'none'; return; }
    const vis = achados.slice(0, MAX_ITENS * 3);
    list.innerHTML = vis.map((a, i) => {
      const nome = nomeSlot(a.slotId);
      return `<div class="sa-it ${esc(a.nivel)}"><span class="sa-dot"></span>
        <div class="sa-tx">${esc(a.titulo)}${nome ? ' · ' + esc(nome) : ''}<em>${esc(a.detalhe)}</em></div>
        <div class="sa-bt"><button type="button" class="secondary" data-act="ver" data-idx="${i}">${esc(T('ver'))}</button>${a.fix ? `<button type="button" data-act="fix" data-idx="${i}">${esc(T('fix'))}</button>` : ''}</div></div>`;
    }).join('') + (achados.length > vis.length ? `<p class="sa-hint">${esc(T('more', { n: achados.length - vis.length }))}</p>` : '');
    fixAll.style.display = achados.some((a) => a.fix) ? '' : 'none';
  }

  function buscaHelper(texto) {
    const res = root.querySelector('.sa-res');
    if (!texto || texto.trim().length < 2 || !window.LegnoHelper || !window.LegnoHelper.buscar) { res.innerHTML = ''; return; }
    let r = [];
    try { r = window.LegnoHelper.buscar(texto) || []; } catch (e) { r = []; }
    const L = lang();
    if (!r.length) { res.innerHTML = `<p class="sa-hint">${esc(T('none'))}</p>`; return; }
    res.innerHTML = r.slice(0, 5).map((x) => `<button type="button" data-q="${esc(x.q.id)}">${esc(x.q[L] || x.q.pt)}</button>`).join('');
  }

  // ---------------------------------------------------------------- abrir/fechar
  function abre() {
    aberto = true;
    pose('oi', 3000);
    root.classList.add('open');
    textos();
    atualiza(false);
    mostraAba(aba);
  }
  function fecha() {
    aberto = false;
    if (root) root.classList.remove('open');
    if (gravando && rec) { try { rec.abort(); } catch (e) { /* */ } }
  }

  // Laço leve: aparece/some conforme admin + editor visível; selinho em tempo ocioso.
  let ultimoAudit = 0;
  function tick() {
    if (!isAdmin()) { if (root) { root.style.display = 'none'; fecha(); } return; }
    cria();
    const vis = editorVisivel();
    root.style.display = vis ? '' : 'none';
    if (!vis) { if (aberto) fecha(); pararFala(); return; }
    if (!document.hidden) sorteiaPose(Date.now());
    if (document.hidden || aberto) return;
    const agora = Date.now();
    if (agora - ultimoAudit < 10000) return;
    ultimoAudit = agora;
    const roda = () => { try { atualiza(false); } catch (e) { /* */ } };
    if (window.requestIdleCallback) window.requestIdleCallback(roda, { timeout: 3000 }); else setTimeout(roda, 0);
  }
  setInterval(tick, 1000);

  window.LegnoSahra = {
    abrir: () => { cria(); abre(); },
    fechar: fecha,
    perguntar: (txt) => { cria(); abre(); mostraAba('chat'); enviar(txt); },
    atualizar: () => root && atualiza(aberto)
  };
})();
