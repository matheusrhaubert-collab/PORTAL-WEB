// ============================================================
// Dealer Agreement da Legno — texto do contrato do "Become a dealer"
// (20/11/2026, Etapa 1). Inglês, lei da Flórida.
// ============================================================
// RASCUNHO redigido pela IA a pedido do Matt ("ele deve dar aceite de um
// contrato (redigir)"). NÃO é conselho jurídico: passar por advogado antes de
// liberar pros clientes. Pontos pra conferir com o advogado estão marcados
// com "REVISAR" nos comentários.
//
// Mudou o texto? TROQUE a `version` — o aceite grava a versão (accounts.
// agreement_version) e o PDF assinado guarda o texto daquela versão.
//
// Carregado antes do portal-42. Só dados, nenhum código.

window.LEGNO_DEALER_AGREEMENT = {
  version: 'v1-draft-2026-11',
  title: 'Legno Dealer Agreement',
  // REVISAR: razão social exata da Legno (LLC/Inc.) e endereço.
  company: 'Legno Home',
  intro: 'This Dealer Agreement (the "Agreement") is entered into between Legno Home ("Legno") and the business identified in the dealer application submitted through the Legno portal (the "Dealer"). By typing the name of its authorized representative and clicking "Accept and sign", the Dealer agrees to the terms below as of the date and time of acceptance recorded by the portal.',
  sections: [
    { h: '1. Appointment', p: [
      'Legno appoints the Dealer as a non-exclusive, independent reseller of Legno\'s made-to-order cabinetry and related components (the "Products") in the United States. No territory is exclusive unless Legno agrees in writing.',
      'The Dealer is an independent business. Nothing in this Agreement creates an employment, agency, franchise, joint venture or partnership relationship. The Dealer may not bind Legno to any obligation.',
      'Products are supplied unbranded (white label). The Dealer sells to its own customers under its own name and is solely responsible for its contracts, prices, representations and service to those customers.'
    ] },
    { h: '2. Dealer account and portal', p: [
      'Orders are placed only through the Legno online portal (the "Portal"). The Dealer is responsible for all activity under its account, including orders placed by employees and users it creates or authorizes.',
      'The Dealer will keep its company, billing and contact information accurate and will promptly update it in the Portal.',
      'The Portal, its catalog, drawings, 3D models, software and content are the property of Legno and are licensed to the Dealer only for quoting, designing and ordering Products. The Dealer will not copy, resell or reverse engineer them.'
    ] },
    { h: '3. Orders', p: [
      'An order is a binding purchase commitment when the Dealer approves it in the Portal. Legno may accept or decline any order. Production starts only after Legno releases the order.',
      'Products are manufactured to the dimensions, configuration, materials and finishes approved by the Dealer. The Dealer is solely responsible for site measurements, design, appliance and countertop clearances, code compliance and the accuracy of everything it approves. Technical drawings and renderings produced by the Portal are aids and do not replace the Dealer\'s verification.',
      'Because Products are made to order, an order cannot be changed or cancelled after Legno has released it to production. Before release, Legno may charge for materials already purchased or work already performed.',
      'Legno\'s quotes and orders cover factory cabinetry only. Appliances, countertops, stone, installation, site work and any other item are excluded unless listed on the invoice.'
    ] },
    { h: '4. Prices and discount', p: [
      'Prices are Legno\'s factory list prices shown in the Portal at the time the order is approved, less the dealer discount assigned to the Dealer by Legno. The dealer discount is set and may be changed only by Legno. The Dealer may request a change through the Portal; a request has no effect until Legno approves it.',
      'Legno may change list prices at any time. A change does not affect orders already approved.',
      'The Dealer sets its own resale prices. Dealer pricing, discounts and factory cost information are confidential.'
    ] },
    { h: '5. Payment', p: [
      // REVISAR: condições de pagamento (percentual do sinal, prazo, juros).
      'Legno issues an invoice when the Dealer approves an order. Payment terms are those stated on the invoice and in the Portal. Legno is not required to release an order to production, or to release finished goods for pickup, until the amounts due for that stage have been received.',
      'An order must be paid in full before the Products leave the factory. Payments made outside the Portal\'s payment link (for example by bank transfer or Zelle) are credited when Legno confirms receipt; the Dealer will upload proof of payment in the Portal.',
      'Amounts not paid when due may bear interest at the lesser of 1.5% per month or the highest rate allowed by law, and the Dealer will reimburse Legno\'s reasonable costs of collection, including attorneys\' fees.'
    ] },
    { h: '6. Sales tax and resale certificate', p: [
      'Sales to the Dealer are subject to applicable sales and use tax unless the Dealer has provided a valid, current resale or exemption certificate that Legno has accepted. The Dealer will upload its certificate in the Portal and renew it before it expires.',
      'If a certificate expires, is rejected or is not on file, Legno will charge sales tax on new invoices until a valid certificate is accepted. The Dealer is responsible for any tax, penalty or interest resulting from a certificate that is invalid or improperly used, and for collecting and remitting tax on its own sales.'
    ] },
    { h: '7. Lead times, pickup and delivery', p: [
      'Production and readiness dates are estimates and are not guaranteed. Legno is not liable for delay.',
      // REVISAR: confirmar FOB fábrica / endereço e o prazo de armazenagem.
      'Unless Legno agrees otherwise in writing, Products are made available for pickup at Legno\'s facility in Florida. Title and risk of loss pass to the Dealer when the Products are loaded onto the Dealer\'s or its carrier\'s vehicle. The Dealer arranges and pays for transport and insurance.',
      'The Dealer will pick up Products within 10 business days after Legno gives notice that the order is ready. After that, Legno may charge reasonable storage fees.',
      'The Dealer will inspect the Products at pickup or delivery and report shortages or visible damage in writing, with photos, within 5 business days. Packages are labeled with the order reference chosen by the Dealer.'
    ] },
    { h: '8. Limited warranty', p: [
      // REVISAR: Matt ainda vai mandar o texto final da garantia.
      'Legno warrants to the Dealer that the Products will conform to the approved order and will be free from defects in material and workmanship under normal residential use, on the terms of Legno\'s then-current Limited Warranty published in the Portal.',
      'Legno\'s sole obligation, and the Dealer\'s exclusive remedy, is the repair or replacement of the non-conforming part, at Legno\'s option. The warranty does not cover installation, site conditions, moisture or heat exposure, misuse, modifications, normal wear, or natural variation in color and grain of wood-based materials.',
      'EXCEPT AS STATED IN THIS SECTION, LEGNO DISCLAIMS ALL OTHER WARRANTIES, EXPRESS OR IMPLIED, INCLUDING THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE.'
    ] },
    { h: '9. Limitation of liability', p: [
      'TO THE FULLEST EXTENT PERMITTED BY LAW, LEGNO IS NOT LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL OR PUNITIVE DAMAGES, OR FOR LOST PROFITS, LABOR, INSTALLATION OR PROJECT DELAY COSTS. LEGNO\'S TOTAL LIABILITY ARISING FROM AN ORDER WILL NOT EXCEED THE AMOUNT PAID TO LEGNO FOR THE PRODUCTS GIVING RISE TO THE CLAIM.'
    ] },
    { h: '10. Indemnity', p: [
      'The Dealer will defend and indemnify Legno against claims by the Dealer\'s customers or third parties arising from the Dealer\'s design, measurements, installation, representations, resale practices or breach of this Agreement.'
    ] },
    { h: '11. Confidentiality', p: [
      'Each party will keep confidential the other\'s non-public business information, including pricing, discounts, drawings and Portal content, and will use it only to perform this Agreement.'
    ] },
    { h: '12. Term and termination', p: [
      'This Agreement starts when Legno approves the Dealer\'s application and continues until terminated. Either party may terminate at any time by written notice, including by e-mail or through the Portal.',
      'Legno may suspend the Dealer\'s account immediately for non-payment, misuse of the Portal, or breach of this Agreement. Termination does not affect orders already released to production or amounts owed.'
    ] },
    { h: '13. General', p: [
      // REVISAR: foro (condado) e se quer arbitragem.
      'This Agreement is governed by the laws of the State of Florida, without regard to its conflict of laws rules. The state and federal courts located in Florida have exclusive jurisdiction over any dispute, and each party consents to that jurisdiction. EACH PARTY WAIVES TRIAL BY JURY TO THE EXTENT PERMITTED BY LAW.',
      'This Agreement, together with the invoices and the terms shown in the Portal for each order, is the entire agreement between the parties on its subject and prevails over any terms on the Dealer\'s purchase orders. Legno may update this Agreement by publishing a new version in the Portal; the new version applies to orders approved after the Dealer accepts it.',
      'The Dealer may not assign this Agreement without Legno\'s written consent. If a provision is unenforceable, the rest remains in effect. Legno is not liable for failure to perform caused by events beyond its reasonable control.',
      'The parties agree that this Agreement may be accepted electronically and that the electronic record of acceptance (name typed, date, time and IP address) has the same effect as a handwritten signature.'
    ] }
  ]
};
