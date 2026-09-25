/* Tela do painel admin: tab-catalogs
 * Mudou de casa do admin.html para cá quando o ERP virou a única porta
 * de entrada. A PARTIR DAQUI este arquivo é a fonte da verdade do
 * markup desta tela — pode editar à mão à vontade.
 * Os ids são os mesmos de antes, de propósito: o JS do admin continua
 * achando tudo por getElementById. */
ADM_TELAS['tab-catalogs'] = `

  <!-- CATÁLOGOS DE OPCIONAIS -->
  <section class="panel">
    <h2>Modelos de dobradiça e corrediça</h2>
    <p class="hint">Custo fixo por unidade, multiplicado pela quantidade que cada peça consome.</p>
    <div id="catalogs-error" class="error" style="display:none;"></div>

    <h2 style="font-size:14px;margin-top:20px;">Modelos de dobradiça</h2>
    <table>
      <thead><tr><th>Nome</th><th>$/un</th><th>Status</th><th></th></tr></thead>
      <tbody id="hinge-models-tbody"></tbody>
    </table>
    <form id="hinge-model-form" class="row" style="margin-top:8px;align-items:flex-end;">
      <input type="hidden" id="hinge-model-id" />
      <div><label>Nome</label><input id="hinge-model-name" required /></div>
      <div><label>$ por unidade</label><input id="hinge-model-price" type="number" step="0.01" required /></div>
      <div style="flex:0;"><button type="submit" style="margin-top:0;">Salvar</button></div>
    </form>

    <h2 style="font-size:14px;margin-top:20px;">Modelos de corrediça</h2>
    <p class="hint">
      Comprimento do trilho (mm) é opcional — preenchido, o preço da corrediça passa a variar sozinho
      conforme a profundidade da gaveta: cadastre uma linha POR COMPRIMENTO (ex: 305mm, 381mm, 457mm),
      cada uma com seu preço, e vincule TODAS ao mesmo módulo-gaveta em Cadastro de Módulos &gt; Modelos
      (dobradiça/corrediça) — o motor escolhe sozinho, na hora de calcular o preço, a de maior comprimento
      que ainda caiba na profundidade real da peça. Deixe em branco pra uma corrediça de preço fixo, igual
      sempre foi.
    </p>
    <table>
      <thead><tr><th>Nome</th><th>Trilho</th><th>$/un</th><th>Status</th><th></th></tr></thead>
      <tbody id="slide-models-tbody"></tbody>
    </table>
    <form id="slide-model-form" class="row" style="margin-top:8px;align-items:flex-end;">
      <input type="hidden" id="slide-model-id" />
      <div><label>Nome</label><input id="slide-model-name" required /></div>
      <div><label>Comprimento do trilho (mm)</label><input id="slide-model-rail-length" type="number" step="1" placeholder="— fixo, sem variar —" style="width:170px" /></div>
      <div><label>$ por unidade</label><input id="slide-model-price" type="number" step="0.01" required /></div>
      <div style="flex:0;"><button type="submit" style="margin-top:0;">Salvar</button></div>
    </form>

    <h2 style="font-size:14px;margin-top:20px;">Modelos de mão de obra</h2>
    <p class="hint">Ex: Mão de obra caixa, Mão de obra LED, Mão de obra 1, 2, 3... Cada componente escolhe um desses em vez de digitar um valor manualmente.</p>
    <table>
      <thead><tr><th>Nome</th><th>$/un</th><th>Status</th><th></th></tr></thead>
      <tbody id="labor-types-tbody"></tbody>
    </table>
    <form id="labor-type-form" class="row" style="margin-top:8px;align-items:flex-end;">
      <input type="hidden" id="labor-type-id" />
      <div><label>Nome</label><input id="labor-type-name" required /></div>
      <div><label>$ por unidade</label><input id="labor-type-price" type="number" step="0.01" required /></div>
      <div style="flex:0;"><button type="submit" style="margin-top:0;">Salvar</button></div>
    </form>
  </section>

    `;
