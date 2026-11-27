// ============================================================
// TERMOS E CONDIÇÕES DO PEDIDO — texto + aceite registrado (22/11/2026, migration 332)
// ============================================================
// Matt: "preciso de termos e condições que a pessoa está aceitando ao comprar
// uma ordem da fábrica, isso vale pra qualquer um que compra" + "esse concordo
// deve ficar super bem registrado para não termos problemas no futuro".
//
// RASCUNHO redigido pela IA em cima dos pontos ditados pelo Matt. NÃO é conselho
// jurídico: passar por advogado antes de depender dele numa disputa.
//
// MUDOU O TEXTO? TROQUE `version`. O aceite grava a versão E O TEXTO INTEIRO que
// a pessoa viu (tabela order_terms_acceptances), então pedido antigo continua
// preso ao texto que valia no dia.
//
// O QUE FICA REGISTRADO em cada aceite (RPC order_accept_terms, migration 332):
// pedido, quem aceitou (login + e-mail), nome digitado como assinatura, data e
// hora DO SERVIDOR, versão, idioma, texto completo, impressão digital do texto
// (SHA-256), IP e navegador, e se foi aceite em nome de outra conta (fábrica
// enviando o projeto de um cliente). O registro não pode ser alterado nem
// apagado pelo portal, e sobrevive se o pedido for excluído.
//
// ONDE É PEDIDO (todo caminho que APROVA um pedido = compra):
//   portal-02: "Aprovar pedido" da tela do pedido e "Liberar todos" da pasta;
//   portal-44: "Liberar pra fábrica" (faixa do pedido) e SEND TO FACTORY.
// Uso: const ac = await LegnoOrderTerms.ask({ ref }); if (!ac) return;
//      await LegnoOrderTerms.record([orderId], ac);
// Carregado antes do portal-44. Não edita nenhuma função existente.

window.LEGNO_ORDER_TERMS = {
  version: '2026-11-22b',
  title: { pt: 'Termos e Condições do Pedido', en: 'Order Terms and Conditions', es: 'Términos y Condiciones del Pedido' },
  intro: {
    pt: 'Ao aprovar e enviar este pedido para a fábrica, o comprador declara que leu, entendeu e aceita as condições abaixo. Elas valem para este pedido e para qualquer pessoa ou empresa que compre da fábrica.',
    en: 'By approving and sending this order to the factory, the buyer declares that they have read, understood and accept the conditions below. They apply to this order and to any person or company buying from the factory.',
    es: 'Al aprobar y enviar este pedido a la fábrica, el comprador declara que leyó, entendió y acepta las condiciones siguientes. Aplican a este pedido y a cualquier persona o empresa que compre a la fábrica.'
  },
  clauses: {
    pt: [
      ['O que o pedido inclui', 'O pedido cobre SOMENTE os móveis (gabinetes, painéis e componentes) listados nele. NÃO inclui: serviço de instalação ou montagem, serviço de projeto, assistência ou revisão de projeto, LEDs e iluminação, pedras e bancadas, eletrodomésticos, decoração, obra ou qualquer outro item ou serviço que não esteja listado no pedido.'],
      ['A fábrica vende ao comprador, não ao cliente final', 'A fábrica vende exclusivamente ao comprador identificado neste pedido. A fábrica NÃO tem nenhuma relação comercial, contratual ou de atendimento com o cliente final do comprador, nem com qualquer terceiro a quem o comprador revenda, repasse ou instale os móveis. O comprador atua como empresa independente, por conta e risco próprios: não é representante, agente, funcionário, sócio nem franqueado da fábrica, e não pode fazer promessas, dar garantias ou assumir compromissos em nome da fábrica. Este pedido é uma compra e venda SOMENTE entre as duas partes identificadas acima (a fábrica, vendedora, e o comprador). Ele NÃO cria solidariedade nem qualquer responsabilidade conjunta da fábrica na venda do comprador ao cliente final. A fábrica não recebe, não analisa e não aprova o projeto do cliente final: ela recebe apenas uma lista de componentes e gabinetes avulsos para fabricar, e não responde pelo conjunto, pelo ambiente nem pelo resultado do projeto.'],
      ['Responsabilidade do comprador perante o cliente final', 'Toda a operação com o cliente final é de responsabilidade exclusiva do comprador que faz a compra e a venda por meio deste portal: a venda e o preço, o contrato e as condições prometidas, as medições e o projeto, a entrega, a instalação e a montagem, o atendimento, as reclamações, as trocas, os reembolsos e qualquer garantia que o comprador ofereça, além de impostos, licenças e autorizações da sua atividade. Se o cliente final tiver qualquer problema, ele deve ser resolvido pelo comprador, com recursos do comprador. A fábrica não atende, não negocia e não indeniza clientes finais.'],
      ['Custos e reclamações de terceiros', 'Todos os custos decorrentes da operação do comprador com clientes finais e terceiros são do comprador, incluindo retrabalho, deslocamento, mão de obra, peças adicionais, fretes, descontos concedidos, reembolsos, multas, despesas judiciais e honorários de advogado. O comprador se obriga a manter a fábrica livre de qualquer reclamação, cobrança, processo ou prejuízo apresentado por cliente final ou por terceiro em razão da venda, do projeto, da instalação ou do uso dos móveis, e a ressarcir a fábrica de qualquer valor que ela venha a gastar por causa disso.'],
      ['Produção conforme o projeto', 'O pedido será produzido exatamente como o projeto foi construído e enviado pelo comprador (módulos, medidas, cores, peças e posições). Conferir medidas no local, o desenho e a compatibilidade com o ambiente (eletrodomésticos, bancada, hidráulica, elétrica) é responsabilidade do comprador. Qualquer inconsistência na montagem que decorra de erro de projeto NÃO dá direito a peças extras nem a devolução de valores.'],
      ['Cores e aparência', 'As cores e o acabamento reais podem variar em relação ao que aparece na tela, em renders e em amostras. A fábrica não se responsabiliza se uma cor, ou o resultado final do projeto, não ficar como o comprador ou o cliente dele desejava, uma vez que os componentes e gabinetes tenham sido produzidos conforme o pedido.'],
      ['Instalação e montagem', 'A fábrica não se responsabiliza pela instalação nem pela montagem. Problemas de instalação ou de montagem NÃO dão direito a peças novas nem a devolução de valores.'],
      ['Prazo', 'O prazo é ESTIMADO em aproximadamente 15 dias de produção, contados da liberação financeira do pedido. Pode haver atraso por fornecimento de materiais, transporte ou fabricação. Atraso NÃO dá direito a cancelamento do pedido nem a devolução de valores.'],
      ['Alterações', 'Depois de enviado, o pedido fica congelado. Um pedido que já foi para a produção não pode ser alterado nem atualizado. Qualquer mudança ou complemento exige um NOVO pedido, cobrado à parte.'],
      ['Defeito de fabricação', 'Se uma peça apresentar defeito de fabricação, ou for produzida diferente do que consta no pedido, a fábrica se responsabiliza por PRODUZIR novamente a peça afetada. Essa é a única obrigação da fábrica nesse caso. O frete e o transporte da peça de reposição NÃO estão incluídos e são por conta do comprador, assim como desmontagem, reinstalação, mão de obra e qualquer outro custo.'],
      ['Limite de responsabilidade', 'Em qualquer hipótese, o valor total que possa ser exigido da fábrica em relação a este pedido, por qualquer motivo, NÃO poderá exceder o valor efetivamente pago pelo comprador por este pedido. A fábrica não responde por lucros cessantes, perda de negócio, atraso de obra nem por qualquer dano indireto.'],
      ['Lei aplicável, foro e renúncia a júri', 'Este pedido e estes termos são regidos pelas leis do Estado da Flórida, EUA. Qualquer disputa relacionada a este pedido será resolvida exclusivamente nos tribunais localizados em Lake County, Flórida, e as partes aceitam essa jurisdição. AS PARTES RENUNCIAM, DE FORMA CONSCIENTE E VOLUNTÁRIA, AO DIREITO A JULGAMENTO POR JÚRI: qualquer disputa será decidida por um juiz, sem júri. Em caso de diferença entre as versões em idiomas diferentes, vale a versão em inglês.'],
      ['Aceite', 'O comprador confirma que conferiu o projeto e o pedido, que tem autoridade para comprar em nome da empresa indicada, e que este aceite eletrônico (nome digitado, data, hora e conta de acesso) tem o mesmo valor de uma assinatura.']
    ],
    en: [
      ['What the order includes', 'The order covers ONLY the furniture (cabinets, panels and components) listed in it. It does NOT include: installation or assembly service, design service, design assistance or review, LEDs and lighting, stone and countertops, appliances, decoration, construction work or any other item or service not listed in the order.'],
      ['The factory sells to the buyer, not to the end customer', 'The factory sells exclusively to the buyer identified in this order. The factory has NO commercial, contractual or service relationship with the buyer\'s end customer, or with any third party to whom the buyer resells, transfers or installs the furniture. The buyer acts as an independent business, at its own risk and expense: it is not a representative, agent, employee, partner or franchisee of the factory, and may not make promises, give warranties or assume commitments on behalf of the factory. This order is a purchase and sale ONLY between the two parties identified above (the factory, as seller, and the buyer). It does NOT create joint or several liability, or any shared responsibility of the factory, in the buyer\'s sale to the end customer. The factory does not receive, review or approve the end customer\'s project: it receives only a list of loose components and cabinets to manufacture, and is not responsible for the whole, for the room or for the result of the project.'],
      ['Buyer\'s responsibility to the end customer', 'The entire operation with the end customer is the sole responsibility of the buyer who purchases and resells through this portal: the sale and the price, the contract and the conditions promised, measurements and design, delivery, installation and assembly, customer service, complaints, exchanges, refunds and any warranty the buyer offers, as well as the taxes, licenses and permits of its business. If the end customer has any problem, it must be resolved by the buyer, at the buyer\'s expense. The factory does not serve, negotiate with or compensate end customers.'],
      ['Third-party costs and claims', 'All costs arising from the buyer\'s operation with end customers and third parties are borne by the buyer, including rework, travel, labor, additional parts, freight, discounts granted, refunds, fines, court costs and attorney\'s fees. The buyer agrees to hold the factory harmless from any claim, charge, lawsuit or loss brought by an end customer or third party in connection with the sale, design, installation or use of the furniture, and to reimburse the factory for any amount it may spend because of it.'],
      ['Produced as designed', 'The order will be produced exactly as the project was built and submitted by the buyer (modules, dimensions, colors, parts and positions). Checking field measurements, the drawing and compatibility with the room (appliances, countertop, plumbing, electrical) is the buyer\'s responsibility. Any inconsistency during assembly that results from a design error does NOT entitle the buyer to extra parts or to a refund.'],
      ['Colors and appearance', 'Actual colors and finishes may vary from what is shown on screen, in renders and in samples. The factory is not responsible if a color, or the final result of the project, is not what the buyer or the buyer\'s customer wanted, once the components and cabinets have been produced according to the order.'],
      ['Installation and assembly', 'The factory is not responsible for installation or assembly. Installation or assembly problems do NOT entitle the buyer to new parts or to a refund.'],
      ['Lead time', 'Lead time is ESTIMATED at approximately 15 days of production, counted from the financial release of the order. Delays may occur due to material supply, transportation or manufacturing. A delay does NOT entitle the buyer to cancel the order or to a refund.'],
      ['Changes', 'Once submitted, the order is frozen. An order that has gone to production cannot be changed or updated. Any change or addition requires a NEW order, charged separately.'],
      ['Manufacturing defects', 'If a part has a manufacturing defect, or is produced differently from what is stated in the order, the factory is responsible for PRODUCING the affected part again. That is the factory\'s only obligation in that case. Freight and transportation of the replacement part are NOT included and are paid by the buyer, as are removal, reinstallation, labor and any other cost.'],
      ['Limitation of liability', 'In all cases, the total amount that may be claimed against the factory in connection with this order, for any reason, may NOT exceed the amount actually paid by the buyer for this order. The factory is not liable for lost profits, loss of business, job site delays or any indirect damages.'],
      ['Governing law, venue and jury trial waiver', 'This order and these terms are governed by the laws of the State of Florida, USA. Any dispute relating to this order shall be resolved exclusively in the courts located in Lake County, Florida, and the parties consent to that jurisdiction and venue. THE PARTIES KNOWINGLY AND VOLUNTARILY WAIVE ANY RIGHT TO A TRIAL BY JURY: any dispute shall be decided by a judge, without a jury. If there is any difference between language versions, the English version prevails.'],
      ['Acceptance', 'The buyer confirms that they have checked the project and the order, that they have authority to buy on behalf of the company indicated, and that this electronic acceptance (typed name, date, time and login account) has the same effect as a signature.']
    ],
    es: [
      ['Qué incluye el pedido', 'El pedido cubre SOLAMENTE los muebles (gabinetes, paneles y componentes) listados en él. NO incluye: servicio de instalación o montaje, servicio de diseño, asistencia o revisión de diseño, LEDs e iluminación, piedras y encimeras, electrodomésticos, decoración, obra ni ningún otro artículo o servicio que no esté listado en el pedido.'],
      ['La fábrica vende al comprador, no al cliente final', 'La fábrica vende exclusivamente al comprador identificado en este pedido. La fábrica NO tiene ninguna relación comercial, contractual ni de atención con el cliente final del comprador, ni con ningún tercero a quien el comprador revenda, traspase o instale los muebles. El comprador actúa como empresa independiente, por su cuenta y riesgo: no es representante, agente, empleado, socio ni franquiciado de la fábrica, y no puede hacer promesas, dar garantías ni asumir compromisos en nombre de la fábrica. Este pedido es una compraventa SOLAMENTE entre las dos partes identificadas arriba (la fábrica, vendedora, y el comprador). NO crea solidaridad ni ninguna responsabilidad conjunta de la fábrica en la venta del comprador al cliente final. La fábrica no recibe, no analiza ni aprueba el proyecto del cliente final: recibe solo una lista de componentes y gabinetes sueltos para fabricar, y no responde por el conjunto, por el ambiente ni por el resultado del proyecto.'],
      ['Responsabilidad del comprador ante el cliente final', 'Toda la operación con el cliente final es responsabilidad exclusiva del comprador que compra y revende por medio de este portal: la venta y el precio, el contrato y las condiciones prometidas, las mediciones y el diseño, la entrega, la instalación y el montaje, la atención, los reclamos, los cambios, los reembolsos y cualquier garantía que el comprador ofrezca, además de los impuestos, licencias y permisos de su actividad. Si el cliente final tiene cualquier problema, debe ser resuelto por el comprador, con recursos del comprador. La fábrica no atiende, no negocia ni indemniza a clientes finales.'],
      ['Costos y reclamos de terceros', 'Todos los costos derivados de la operación del comprador con clientes finales y terceros son del comprador, incluyendo retrabajo, traslados, mano de obra, piezas adicionales, fletes, descuentos otorgados, reembolsos, multas, gastos judiciales y honorarios de abogado. El comprador se obliga a mantener a la fábrica libre de cualquier reclamo, cobro, demanda o perjuicio presentado por un cliente final o un tercero a causa de la venta, el diseño, la instalación o el uso de los muebles, y a reembolsar a la fábrica cualquier monto que esta llegue a gastar por ese motivo.'],
      ['Producción conforme al proyecto', 'El pedido se producirá exactamente como el proyecto fue construido y enviado por el comprador (módulos, medidas, colores, piezas y posiciones). Verificar las medidas en sitio, el diseño y la compatibilidad con el ambiente (electrodomésticos, encimera, plomería, electricidad) es responsabilidad del comprador. Cualquier inconsistencia en el montaje que resulte de un error de proyecto NO da derecho a piezas extra ni a devolución de dinero.'],
      ['Colores y apariencia', 'Los colores y acabados reales pueden variar respecto de lo que aparece en pantalla, en renders y en muestras. La fábrica no se responsabiliza si un color, o el resultado final del proyecto, no queda como el comprador o su cliente deseaba, una vez que los componentes y gabinetes hayan sido producidos conforme al pedido.'],
      ['Instalación y montaje', 'La fábrica no se responsabiliza por la instalación ni por el montaje. Los problemas de instalación o de montaje NO dan derecho a piezas nuevas ni a devolución de dinero.'],
      ['Plazo', 'El plazo es ESTIMADO en aproximadamente 15 días de producción, contados desde la liberación financiera del pedido. Puede haber atrasos por suministro de materiales, transporte o fabricación. Un atraso NO da derecho a cancelar el pedido ni a devolución de dinero.'],
      ['Cambios', 'Una vez enviado, el pedido queda congelado. Un pedido que ya pasó a producción no puede ser modificado ni actualizado. Cualquier cambio o complemento exige un NUEVO pedido, cobrado aparte.'],
      ['Defecto de fabricación', 'Si una pieza presenta un defecto de fabricación, o es producida de forma distinta a lo que consta en el pedido, la fábrica se responsabiliza por PRODUCIR nuevamente la pieza afectada. Esa es la única obligación de la fábrica en ese caso. El flete y el transporte de la pieza de reposición NO están incluidos y corren por cuenta del comprador, así como el desmontaje, la reinstalación, la mano de obra y cualquier otro costo.'],
      ['Límite de responsabilidad', 'En cualquier caso, el monto total que pueda reclamarse a la fábrica en relación con este pedido, por cualquier motivo, NO podrá exceder el valor efectivamente pagado por el comprador por este pedido. La fábrica no responde por lucro cesante, pérdida de negocio, atrasos de obra ni por ningún daño indirecto.'],
      ['Ley aplicable, jurisdicción y renuncia a jurado', 'Este pedido y estos términos se rigen por las leyes del Estado de Florida, EE. UU. Cualquier disputa relacionada con este pedido se resolverá exclusivamente en los tribunales ubicados en Lake County, Florida, y las partes aceptan esa jurisdicción. LAS PARTES RENUNCIAN, DE FORMA CONSCIENTE Y VOLUNTARIA, AL DERECHO A JUICIO POR JURADO: cualquier disputa será decidida por un juez, sin jurado. En caso de diferencia entre las versiones en distintos idiomas, prevalece la versión en inglés.'],
      ['Aceptación', 'El comprador confirma que revisó el proyecto y el pedido, que tiene autoridad para comprar en nombre de la empresa indicada, y que esta aceptación electrónica (nombre escrito, fecha, hora y cuenta de acceso) tiene el mismo valor que una firma.']
    ]
  },
  ui: {
    pt: { so_dealer: 'Só o dealer (responsável da loja) envia o pedido pra produção.', seller: 'VENDEDOR (fábrica)', buyer: 'COMPRADOR', nobuyer: 'Cadastro da loja incompleto: falta a razão social. Complete em My company antes de comprar.', name: 'Digite seu nome completo (vale como assinatura)', chk: 'Li, entendi e aceito os Termos e Condições do Pedido.', ok: 'Aceitar e continuar', cancel: 'Cancelar', need: 'Leia os termos, digite seu nome completo e marque o aceite.', ver: 'Versão', ref: 'Pedido', none: 'Este pedido não tem registro de aceite dos termos.', need332: 'Falta rodar a migration 332 no Supabase: o aceite ficou anotado só no pedido, sem o registro completo.', rec: 'Registro de aceite dos termos', by: 'Aceito por', signed: 'Nome digitado', when: 'Data e hora (servidor)', behalf: 'Aceite feito pela fábrica em nome da conta do cliente', hash: 'Impressão digital do texto (SHA-256)', ip: 'IP', ua: 'Navegador', print: 'Imprimir', view: 'Aceite dos termos' },
    en: { so_dealer: 'Only the dealer (store owner) can send the order to production.', seller: 'SELLER (factory)', buyer: 'BUYER', nobuyer: 'Store registration incomplete: the legal name is missing. Complete it in My company before buying.', name: 'Type your full name (it counts as a signature)', chk: 'I have read, understood and accept the Order Terms and Conditions.', ok: 'Accept and continue', cancel: 'Cancel', need: 'Read the terms, type your full name and check the acceptance box.', ver: 'Version', ref: 'Order', none: 'This order has no terms acceptance record.', need332: 'Migration 332 must be run in Supabase: the acceptance was noted on the order only, without the full record.', rec: 'Terms acceptance record', by: 'Accepted by', signed: 'Typed name', when: 'Date and time (server)', behalf: 'Acceptance made by the factory on behalf of the customer account', hash: 'Text fingerprint (SHA-256)', ip: 'IP', ua: 'Browser', print: 'Print', view: 'Terms acceptance' },
    es: { so_dealer: 'Solo el dealer (responsable de la tienda) envía el pedido a producción.', seller: 'VENDEDOR (fábrica)', buyer: 'COMPRADOR', nobuyer: 'Registro de la tienda incompleto: falta la razón social. Complételo en My company antes de comprar.', name: 'Escriba su nombre completo (vale como firma)', chk: 'Leí, entendí y acepto los Términos y Condiciones del Pedido.', ok: 'Aceptar y continuar', cancel: 'Cancelar', need: 'Lea los términos, escriba su nombre completo y marque la aceptación.', ver: 'Versión', ref: 'Pedido', none: 'Este pedido no tiene registro de aceptación de los términos.', need332: 'Falta ejecutar la migration 332 en Supabase: la aceptación quedó anotada solo en el pedido, sin el registro completo.', rec: 'Registro de aceptación de los términos', by: 'Aceptado por', signed: 'Nombre escrito', when: 'Fecha y hora (servidor)', behalf: 'Aceptación hecha por la fábrica en nombre de la cuenta del cliente', hash: 'Huella del texto (SHA-256)', ip: 'IP', ua: 'Navegador', print: 'Imprimir', view: 'Aceptación de términos' }
  }
};

(function () {
  const D = window.LEGNO_ORDER_TERMS;
  const lang = () => { let l = 'en'; try { l = (typeof I18n !== 'undefined' && I18n.getLanguage) ? String(I18n.getLanguage()).slice(0, 2) : 'en'; } catch (e) { /* en */ } return D.clauses[l] ? l : 'en'; };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const U = (k) => (D.ui[lang()] || D.ui.en)[k];
  // texto corrido EXATAMENTE como a pessoa viu — é o que vai pro registro
  // PARTES (22/11, migration 335): vendedor = a fábrica, comprador = a loja, com os dados oficiais do cadastro.
  // Sem a 335 (ou sem cadastro) cai no nome da fábrica e no nome que a tela conhece.
  async function partes(owner) {
    let d = null;
    try { const r = await supabaseClient.rpc('order_terms_parties', { p_user: owner || null }); if (!r.error) d = r.data; } catch (e) { /* sem a 335 */ }
    d = d || {};
    return { seller: d.seller || { legal_name: 'Legno Cabinets LLC' }, buyer: d.buyer || null };
  }
  function linhasParte(x) {
    if (!x) return [];
    const nome = x.legal_name || x.trade_name || '';
    const cid = [x.city, [x.state, x.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    return [nome + (x.legal_name && x.trade_name && x.trade_name !== x.legal_name ? ' (' + x.trade_name + ')' : ''), x.ein ? 'EIN ' + x.ein : '', x.line1, x.line2, cid, x.phone, x.email].filter(Boolean);
  }
  function partesTexto(l, P) {
    const u = D.ui[l] || D.ui.en;
    return u.seller + ':\n' + linhasParte(P.seller).join('\n') + '\n\n' + u.buyer + ':\n' + (linhasParte(P.buyer).join('\n') || '—');
  }
  function textoPuro(l, P) {
    return D.title[l] + ' — ' + D.version + '\n\n' + (P ? partesTexto(l, P) + '\n\n' : '') + D.intro[l] + '\n\n'
      + D.clauses[l].map((c, i) => (i + 1) + '. ' + c[0] + '\n' + c[1]).join('\n\n');
  }
  function css() {
    if (document.getElementById('ot-css')) return;
    const st = document.createElement('style'); st.id = 'ot-css';
    st.textContent = '#ot-ov{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:10050;display:flex;align-items:flex-start;justify-content:center;padding:24px 12px;overflow:auto}'
      + '.ot-box{background:#fff;color:#2b2621;border-radius:14px;width:100%;max-width:680px;padding:20px 24px 18px;box-shadow:0 16px 50px rgba(0,0,0,.4);font-size:14px}'
      + '.ot-box h3{margin:0 0 2px;font-size:19px}.ot-box .ot-sub{color:#766f64;font-size:12px;margin:0 0 10px}'
      + '.ot-txt{border:1px solid #e0ddd6;border-radius:10px;background:#faf8f4;padding:12px 16px;max-height:38vh;overflow:auto;line-height:1.5;font-size:13.5px}'
      + '.ot-partes{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0 0 10px;font-size:12.5px;line-height:1.45}.ot-partes>div{border:1px solid #e0ddd6;border-radius:10px;padding:9px 12px}.ot-partes b{display:block;font-size:11px;letter-spacing:.06em;color:#8a8073;margin-bottom:3px}'
      + '.ot-txt p{margin:0 0 10px}.ot-txt b{display:block;margin-bottom:2px}'
      + '.ot-f{display:flex;flex-direction:column;gap:4px;margin:14px 0 8px;font-size:12.5px;color:#5c554b;font-weight:600}.ot-f input{padding:9px 10px;border:1px solid #cfc7ba;border-radius:8px;font-size:15px;margin:0;width:100%;box-sizing:border-box}'
      + '.ot-chk{display:flex;gap:10px;align-items:flex-start;margin:8px 0 4px;font-size:14px;font-weight:600;color:#2b2621;cursor:pointer;text-align:left}.ot-chk input{width:18px;height:18px;min-width:18px;margin:1px 0 0;padding:0;flex:none}'
      + '.ot-err{color:#a3352b;font-size:12.5px;min-height:16px;margin:6px 0 0}.ot-acts{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}.ot-acts button{margin:0;width:auto}'
      + '.ot-go{background:#2f6f4f;color:#fff;border:0;border-radius:8px;padding:10px 18px;font-weight:700;cursor:pointer}.ot-go:disabled{opacity:.45;cursor:default}';
    document.head.appendChild(st);
  }
  // Abre a janela dos termos. Devolve { name, lang, version, text } ou null (cancelou).
  // Clicar fora NÃO fecha. O botão só libera com nome (3+ letras) e a caixinha marcada.
  async function ask(ctx) {
    ctx = ctx || {};
    const P = await partes(ctx.owner);
    return new Promise((resolve) => {
      css();
      const l = lang();
      const velho = document.getElementById('ot-ov'); if (velho) velho.remove();
      const ov = document.createElement('div'); ov.id = 'ot-ov';
      ov.innerHTML = '<div class="ot-box" role="dialog" aria-modal="true"><h3>' + esc(D.title[l]) + '</h3>'
        + '<p class="ot-sub">' + esc(U('ver')) + ' ' + esc(D.version) + (ctx.ref ? ' · ' + esc(U('ref')) + ': ' + esc(ctx.ref) : '') + '</p>'
        + '<div class="ot-partes">' + [['seller', P.seller], ['buyer', P.buyer]].map((q) => '<div><b>' + esc(U(q[0])) + '</b>' + (linhasParte(q[1]).map(esc).join('<br>') || '—') + '</div>').join('') + '</div>'
        + (!P.buyer || !P.buyer.legal_name ? '<p class="ot-err" style="margin:0 0 8px">' + esc(U('nobuyer')) + '</p>' : '')
        + '<div class="ot-txt"><p>' + esc(D.intro[l]) + '</p>' + D.clauses[l].map((c, i) => '<p><b>' + (i + 1) + '. ' + esc(c[0]) + '</b>' + esc(c[1]) + '</p>').join('') + '</div>'
        + '<label class="ot-f">' + esc(U('name')) + '<input type="text" id="ot-name" autocomplete="name" maxlength="120"></label>'
        + '<label class="ot-chk"><input type="checkbox" id="ot-chk"><span>' + esc(U('chk')) + '</span></label>'
        + '<p class="ot-err" id="ot-err"></p>'
        + '<div class="ot-acts"><button type="button" class="secondary" id="ot-cancel">' + esc(U('cancel')) + '</button><button type="button" class="ot-go" id="ot-ok" disabled>' + esc(U('ok')) + '</button></div></div>';
      document.body.appendChild(ov);
      const $ = (q) => ov.querySelector(q);
      const pronto = () => { $('#ot-ok').disabled = !($('#ot-chk').checked && $('#ot-name').value.trim().length >= 3); };
      ['input', 'change'].forEach((ev) => { $('#ot-name').addEventListener(ev, pronto); $('#ot-chk').addEventListener(ev, pronto); });
      const fim = (v) => { ov.remove(); resolve(v); };
      $('#ot-cancel').addEventListener('click', () => fim(null));
      $('#ot-ok').addEventListener('click', () => {
        const name = $('#ot-name').value.trim();
        if (!$('#ot-chk').checked || name.length < 3) { $('#ot-err').textContent = U('need'); return; }
        fim({ name, lang: l, version: D.version, text: textoPuro(l, P) });
      });
      setTimeout(() => { try { $('#ot-name').focus(); } catch (e) { /* ok */ } }, 40);
    });
  }
  // Grava o aceite no banco (um registro por pedido). Sem a migration 332 cai no
  // carimbo simples do pedido (colunas da 315) e avisa o admin. Outro erro = PARA
  // (devolve o erro pra quem chamou não aprovar sem registro).
  async function record(orderIds, ac) {
    if (!ac || !orderIds || !orderIds.length) throw new Error('terms');
    const r = await supabaseClient.rpc('order_accept_terms', { p_orders: orderIds, p_version: ac.version, p_lang: ac.lang, p_text: ac.text, p_name: ac.name });
    if (!r.error) return r.data;
    const semFuncao = /order_accept_terms|schema cache|Could not find|PGRST202|42883/i.test((r.error.message || '') + ' ' + (r.error.code || ''));
    if (!semFuncao) throw r.error;
    const uid = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.id : null;
    try { await supabaseClient.from('orders').update({ terms_accepted_at: new Date().toISOString(), terms_accepted_by: uid, terms_version: ac.version }).in('id', orderIds); } catch (e) { /* sem a 315 também: segue */ }
    if (window.LEGNO_IS_ADMIN === true) alert(U('need332'));
    return null;
  }
  // Abre o registro de aceite do pedido numa página pra imprimir.
  async function view(orderId) {
    const r = await supabaseClient.from('order_terms_acceptances').select('*').eq('order_id', orderId).order('accepted_at', { ascending: true });
    if (r.error) return alert(/order_terms_acceptances|schema cache|relation/i.test(r.error.message || '') ? U('need332') : r.error.message);
    // Termo do Render com IA (27/11, migration 353) — fica junto do aceite do pedido,
    // pelo projeto de origem (orders.source_project_id). Ver portal-53-render-ia.js.
    let iaHtml = '';
    try {
      const so = await supabaseClient.from('orders').select('source_project_id').eq('id', orderId).maybeSingle();
      if (so.data && so.data.source_project_id && window.LegnoRenderIA) iaHtml = await LegnoRenderIA.recordsHtml(so.data.source_project_id);
    } catch (e) { iaHtml = ''; }
    if ((!r.data || !r.data.length) && !iaHtml) return alert(U('none'));
    r.data = r.data || [];
    const dh = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString() + ' (' + d.toISOString() + ')'; };
    // o número de fábrica nasce na aprovação, DEPOIS do aceite: mostra o atual do pedido
    let numAtual = '';
    try { const o = await supabaseClient.from('orders').select('factory_number').eq('id', orderId).maybeSingle(); if (o.data && Number(o.data.factory_number) > 0) numAtual = String(Number(o.data.factory_number)).padStart(5, '0'); } catch (e) { /* fica a referência gravada */ }
    const w = window.open('', '_blank'); if (!w) return;
    const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + esc(U('rec')) + '</title><style>body{font-family:Arial,sans-serif;color:#222;max-width:800px;margin:28px auto;padding:0 22px;font-size:13px;line-height:1.5}h1{font-size:20px;margin:0 0 4px}h2{font-size:14px;margin:22px 0 6px;border-top:2px solid #222;padding-top:10px}'
      + 'table{border-collapse:collapse;width:100%}td{padding:4px 8px;border-bottom:1px solid #e5e5e5;vertical-align:top}td:first-child{color:#666;width:230px}pre{white-space:pre-wrap;font-family:inherit;background:#f6f4f0;border:1px solid #e0ddd6;border-radius:6px;padding:12px 14px}.mono{font-family:monospace;font-size:11.5px;word-break:break-all}@media print{.np{display:none}}</style></head><body>'
      + '<div class="np" style="text-align:right"><button onclick="print()">' + esc(U('print')) + '</button></div><h1>' + esc(U('rec')) + '</h1>'
      + r.data.map((a) => '<h2>' + esc(U('ref')) + ' ' + esc(numAtual || a.order_ref || '') + ' · ' + esc(a.po_name || '') + '</h2><table>'
        + '<tr><td>' + esc(U('by')) + '</td><td>' + esc(a.accepted_email || '') + '</td></tr>'
        + '<tr><td>' + esc(U('signed')) + '</td><td><b>' + esc(a.signed_name || '') + '</b></td></tr>'
        + '<tr><td>' + esc(U('when')) + '</td><td>' + esc(dh(a.accepted_at)) + '</td></tr>'
        + (a.on_behalf ? '<tr><td colspan="2"><b>' + esc(U('behalf')) + '</b></td></tr>' : '')
        + '<tr><td>' + esc(U('ver')) + '</td><td>' + esc(a.terms_version || '') + ' · ' + esc(a.terms_lang || '') + '</td></tr>'
        + '<tr><td>' + esc(U('hash')) + '</td><td class="mono">' + esc(a.terms_sha256 || '') + '</td></tr>'
        + '<tr><td>' + esc(U('ip')) + '</td><td class="mono">' + esc(a.ip || '—') + '</td></tr>'
        + '<tr><td>' + esc(U('ua')) + '</td><td class="mono">' + esc(a.user_agent || '—') + '</td></tr>'
        + '</table><pre>' + esc(a.terms_text || '') + '</pre>').join('')
      + iaHtml
      + '</body></html>';
    w.document.open(); w.document.write(html); w.document.close();
  }
  window.LegnoOrderTerms = { version: D.version, ask, record, view, label: () => U('view'), onlyDealerMsg: () => U('so_dealer') };
})();
