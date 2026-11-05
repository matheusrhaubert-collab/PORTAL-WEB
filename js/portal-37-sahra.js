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
      chat_ph: 'Escreva ou fale com a SAHRA…', send: 'Enviar', mic: 'Falar', mic_on: 'Ouvindo… fale e pare pra enviar',
      voice_on: 'Voz da SAHRA ligada', voice_off: 'Voz da SAHRA desligada', new_chat: 'Nova conversa',
      welcome: 'Oi, Matt! Já estou com o projeto aberto aqui. Me pergunte o que quiser: o que eu achei, o que eu mudaria, cores em tendência, custo, descrição técnica… ou peça pra eu montar o projeto nas paredes que você desenhou.',
      thinking: 'SAHRA está pensando…', err: 'Não consegui responder agora: ',
      apply: 'Aplicar {{n}} mudança(s)', applied: 'Aplicado. Se não gostar, é só Desfazer (um passo só).', applying: 'Aplicando…',
      not_done: 'Não deu pra fazer:', warn: 'Avisos:', open_render: 'Abrir Render decorado', open_audit: 'Abrir auditor',
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
      applying_n: 'Aplicando {{k}} de {{n}}…', apply_stopped: 'Parei e voltei o projeto como estava antes.',
      stop: 'Parar', stopped: 'Parei. Pode mandar de novo do jeito certo.',
      close: 'Fechar', no_speech: 'Este navegador não tem reconhecimento de voz. Use o Chrome ou o Edge.'
    },
    en: {
      hi: "Hi! I'm SAHRA.", sub: 'Legno designer · reviewing the project with you',
      tab_chat: 'Chat', tab_review: 'Review', tab_how: 'How to',
      chat_ph: 'Type or talk to SAHRA…', send: 'Send', mic: 'Speak', mic_on: 'Listening… speak and pause to send',
      voice_on: 'SAHRA voice on', voice_off: 'SAHRA voice off', new_chat: 'New chat',
      welcome: "Hi! I have the project open. Ask me anything: what I think, what I'd change, trending colors, cost, a technical description… or ask me to lay out the project on the walls you drew.",
      thinking: 'SAHRA is thinking…', err: "I couldn't answer right now: ",
      apply: 'Apply {{n}} change(s)', applied: "Applied. If you don't like it, just Undo (one step).", applying: 'Applying…',
      not_done: "Couldn't do:", warn: 'Warnings:', open_render: 'Open Decorated render', open_audit: 'Open auditor',
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
      applying_n: 'Applying {{k}} of {{n}}…', apply_stopped: 'Stopped and put the project back as it was.',
      stop: 'Stop', stopped: 'Stopped. Send it again the right way.',
      close: 'Close', no_speech: 'This browser has no speech recognition. Use Chrome or Edge.'
    },
    es: {
      hi: '¡Hola! Soy SAHRA.', sub: 'Diseñadora de Legno · reviso el proyecto contigo',
      tab_chat: 'Conversación', tab_review: 'Revisión', tab_how: 'Cómo hacer',
      chat_ph: 'Escribe o habla con SAHRA…', send: 'Enviar', mic: 'Hablar', mic_on: 'Escuchando… habla y haz una pausa para enviar',
      voice_on: 'Voz de SAHRA activada', voice_off: 'Voz de SAHRA desactivada', new_chat: 'Nueva conversación',
      welcome: '¡Hola! Ya tengo el proyecto abierto. Pregúntame lo que quieras: qué me parece, qué cambiaría, colores en tendencia, costo, descripción técnica… o pídeme que arme el proyecto en las paredes que dibujaste.',
      thinking: 'SAHRA está pensando…', err: 'No pude responder ahora: ',
      apply: 'Aplicar {{n}} cambio(s)', applied: 'Aplicado. Si no te gusta, solo Deshacer (un paso).', applying: 'Aplicando…',
      not_done: 'No se pudo hacer:', warn: 'Avisos:', open_render: 'Abrir Render decorado', open_audit: 'Abrir auditor',
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
  const POSE_V = '202611051205';
  const POSES = ['neutra', 'oi', 'paleta', 'pensando', 'apresenta', 'joinha'];
  const poseUrl = (n) => 'assets/sahra/sahra-' + n + '.webp?v=' + POSE_V;

  let root = null, badge = null, achados = [], aberto = false, aba = 'chat';
  let conversa = [];            // [{role:'user'|'sahra', text, ops?, notDone?, actions?, applied?}]
  let pensando = false;
  let chatSeq = 0, chatAbort = null;   // STOP (05/11, Matt: "dei um comando errado e não consigo parar")

  function isAdmin() { return window.LEGNO_IS_ADMIN === true; }
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
#po-sahra .sa-av { width: 56px; height: 56px; border-radius: 50%; padding: 0; border: 2px solid #c9a46a; background: #fff center/cover no-repeat;
  box-shadow: 0 4px 14px rgba(0,0,0,.22); cursor: pointer; position: relative; transition: transform .15s ease; }
#po-sahra .sa-av:hover { transform: scale(1.06); background-color: #fff; }
#po-sahra .sa-av .sa-pose { position: absolute; inset: 0; width: 100%; height: 100%; border-radius: 50%; object-fit: cover; opacity: 0; transition: opacity .6s ease; pointer-events: none; }
#po-sahra .sa-av .sa-pose.on { opacity: 1; }
#po-sahra.falando .sa-av { box-shadow: 0 0 0 4px rgba(201,164,106,.45), 0 4px 14px rgba(0,0,0,.22); }
#po-sahra .sa-badge { z-index: 2; position: absolute; top: -4px; right: -4px; min-width: 20px; height: 20px; padding: 0 5px; border-radius: 10px;
  font-size: 11px; font-weight: 700; line-height: 20px; color: #fff; background: #b3412e; display: none; box-shadow: 0 0 0 2px #fff; }
#po-sahra .sa-badge.aviso { background: #c98a1a; }
#po-sahra .sa-panel { position: absolute; left: 0; bottom: 68px; width: 400px; max-width: calc(100vw - 32px); height: min(620px, calc(100vh - 110px));
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
@media (max-width: 600px) { #po-sahra .sa-av { width: 48px; height: 48px; } #po-sahra .sa-panel { bottom: 60px; } }`;
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
      const b = ev.target.closest('button[data-mact]');
      if (!b) return;
      const m = conversa[Number(b.dataset.idx)];
      if (b.dataset.mact === 'apply' && m) { m.stopped = false; aplicar(m); }
      else if (b.dataset.mact === 'stop') parar();
      else if (b.dataset.mact === 'render') { fecha(); if (typeof window.openProjectDecoratedRender === 'function') window.openProjectDecoratedRender(); }
      else if (b.dataset.mact === 'audit') { fecha(); if (typeof window.openAuditModal === 'function') window.openAuditModal(); }
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
    let html = `<div class="sa-m sahra">${md(T('welcome'))}</div>`;
    conversa.forEach((m, i) => {
      if (m.role === 'user') { html += `<div class="sa-m user">${esc(m.text)}</div>`; return; }
      let extra = '';
      const bts = [];
      if (m.ops && m.ops.length && !m.applied && !m.applying) bts.push(`<button type="button" data-mact="apply" data-idx="${i}">${esc(T('apply', { n: m.ops.length }))}</button>`);
      if ((m.actions || []).includes('render')) bts.push(`<button type="button" class="secondary" data-mact="render" data-idx="${i}">${esc(T('open_render'))}</button>`);
      if ((m.actions || []).includes('audit')) bts.push(`<button type="button" class="secondary" data-mact="audit" data-idx="${i}">${esc(T('open_audit'))}</button>`);
      if (bts.length) extra += `<div class="sa-mact">${bts.join('')}</div>`;
      if (m.applying) extra += `<div class="sa-small">${esc(T('applying_n', { k: m.progress || 0, n: m.ops.length }))} <button type="button" class="secondary sa-link" data-mact="stop" data-idx="${i}">■ ${esc(T('stop'))}</button></div>`;
      if (m.stopped) extra += `<div class="sa-small">${esc(T('apply_stopped'))}</div>`;
      if (m.applied) extra += `<div class="sa-small">✓ ${esc(T('applied'))}</div>`;
      if (m.notDone && m.notDone.length) extra += `<div class="sa-small"><strong>${esc(T('not_done'))}</strong> ${m.notDone.map(esc).join(' · ')}</div>`;
      if (m.warnings && m.warnings.length) extra += `<div class="sa-small"><strong>${esc(T('warn'))}</strong> ${m.warnings.map(esc).join(' · ')}</div>`;
      html += `<div class="sa-m sahra${m.err ? ' err' : ''}">${md(m.text)}${extra}</div>`;
    });
    if (pensando) html += `<div class="sa-m sahra"><span class="sa-dots"><span></span><span></span><span></span></span></div>`;
    box.innerHTML = html;
    box.scrollTop = box.scrollHeight;
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
    return ctx;
  }

  async function mensagemDeErro(error, data) {
    if (typeof describeEdgeFunctionError === 'function') {
      try { return await describeEdgeFunctionError(error, data, 'sahra-chat'); } catch (e) { /* */ }
    }
    return (data && data.error) || (error && error.message) || String(error || '?');
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
    pensando = true; renderConversa();
    poseEnquanto('pensando');
    const seq = ++chatSeq;
    chatAbort = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    try {
      const ctx = await montaContexto();
      if (seq !== chatSeq) return;
      const body = {
        lang: lang(),
        unit: ((document.getElementById('po-unit-select') || {}).value || 'mm') === 'in' ? 'in' : 'mm',
        messages: conversa.filter((m) => !m.err).map((m) => ({ role: m.role, text: m.text })),
        project: ctx.project, catalog: ctx.catalog
      };
      const { data, error } = await supabaseClient.functions.invoke('sahra-chat', chatAbort ? { body, signal: chatAbort.signal } : { body });
      if (seq !== chatSeq) return; // parado pelo usuário: ignora a resposta
      if (error || !data || data.error) throw new Error(await mensagemDeErro(error, data));
      const msg = { role: 'sahra', text: data.reply || '…', spoken: data.spoken || '', ops: Array.isArray(data.operations) ? data.operations : [],
        notDone: Array.isArray(data.not_done) ? data.not_done : [], actions: Array.isArray(data.actions) ? data.actions : [] };
      conversa.push(msg);
      poseEnquanto(null);
      pose(msg.ops.length ? 'paleta' : 'apresenta', 5000);
      falar(msg.spoken || msg.text);
    } catch (e) {
      if (seq !== chatSeq) return;
      console.error('[sahra chat]', e);
      conversa.push({ role: 'sahra', err: true, text: T('err') + ((e && e.message) || String(e)) });
    } finally {
      if (seq === chatSeq) { pensando = false; chatAbort = null; if (poseFixa === 'pensando') poseEnquanto(null); renderConversa(); }
    }
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
        const run = editProjectAiApply([op]);
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
  let rec = null, gravando = false, textoFalado = '';
  const langTag = () => ({ pt: 'pt-BR', en: 'en-US', es: 'es-ES' }[lang()] || 'pt-BR');

  function status(txt) { const s = root && root.querySelector('.sa-status'); if (s) s.textContent = txt || ''; }

  function alternaMic() {
    if (gravando) { try { rec.stop(); } catch (e) { /* */ } return; }
    if (!SR) { status(T('no_speech')); return; }
    pararFala();
    rec = new SR();
    rec.lang = langTag();
    rec.interimResults = true;
    rec.continuous = false;
    textoFalado = '';
    const inp = root.querySelector('.sa-in');
    const base = inp.value ? inp.value.trim() + ' ' : '';
    rec.onresult = (ev) => {
      let fin = '', tmp = '';
      for (let i = 0; i < ev.results.length; i++) {
        if (ev.results[i].isFinal) fin += ev.results[i][0].transcript; else tmp += ev.results[i][0].transcript;
      }
      textoFalado = fin;
      inp.value = base + fin + tmp;
    };
    rec.onerror = (ev) => { console.warn('[sahra mic]', ev.error); };
    rec.onend = () => {
      gravando = false;
      root.querySelector('.sa-mic').classList.remove('rec');
      status('');
      if (textoFalado.trim()) enviar(); // falou e parou = envia
    };
    try {
      rec.start();
      gravando = true;
      root.querySelector('.sa-mic').classList.add('rec');
      status(T('mic_on'));
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
  async function falar(texto) {
    if (!vozLigada()) return;
    pararFala();
    const limpo = limpaParaFala(texto);
    if (!limpo) return;
    const seq = ++falaSeq;
    try {
      root.classList.add('falando'); pintaEnviar();
      const { data, error } = await supabaseClient.functions.invoke('sahra-chat', { body: { tts: limpo.slice(0, 2500), lang: lang(), voice: VOZ_GEMINI } });
      if (seq !== falaSeq) return; // outra fala começou / foi parada
      if (error || !data || !data.audio) throw new Error((data && data.error) || (error && error.message) || 'sem áudio');
      const url = URL.createObjectURL(/^audio\/(wav|mpeg|mp3|ogg)/i.test(data.mime || '') ? new Blob([Uint8Array.from(atob(data.audio), (c) => c.charCodeAt(0))], { type: data.mime }) : pcmParaWav(data.audio, data.mime));
      audioAtual = new Audio(url);
      audioAtual.onended = () => { root.classList.remove('falando'); URL.revokeObjectURL(url); pintaEnviar(); };
      await audioAtual.play();
    } catch (e) {
      if (seq !== falaSeq) return;
      console.warn('[sahra voz] Gemini falhou, usando a voz do navegador:', e);
      falarNavegador(limpo);
    }
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
