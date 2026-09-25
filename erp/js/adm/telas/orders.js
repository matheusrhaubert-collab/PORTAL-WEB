/* Tela do painel admin: tab-orders
 * Mudou de casa do admin.html para cá quando o ERP virou a única porta
 * de entrada. A PARTIR DAQUI este arquivo é a fonte da verdade do
 * markup desta tela — pode editar à mão à vontade.
 * Os ids são os mesmos de antes, de propósito: o JS do admin continua
 * achando tudo por getElementById. */
ADM_TELAS['tab-orders'] = `

  <section class="panel" id="orders-list-section">
    <h2>Pedidos enviados</h2>
    <div id="orders-error" class="error" style="display:none;"></div>
    <p class="hint">Só pedidos já enviados pelo cliente (rascunhos em andamento no portal não aparecem aqui).</p>
    <table>
      <thead><tr><th>Nome do pedido</th><th>Tipo</th><th>Cliente</th><th>E-mail</th><th>Telefone</th><th>Status</th><th>Enviado em</th><th></th></tr></thead>
      <tbody id="orders-tbody"></tbody>
    </table>
  </section>

  <section class="panel" id="order-cutlist-section" style="display:none;">
    <div class="section-header-row">
      <h2>Lista de peças — <span id="order-cutlist-title"></span></h2>
      <button type="button" id="order-cutlist-back-btn" class="secondary" style="margin-top:0;">← Voltar para pedidos</button>
    </div>
    <div id="order-cutlist-meta" class="hint" style="margin-bottom:10px;"></div>
    <div id="order-cutlist-error" class="error" style="display:none;"></div>

    <h3 style="margin-bottom:4px;">Lista de peças (fabricação — corte de chapa)</h3>
    <button type="button" id="order-cutlist-csv-btn" class="secondary">Baixar CSV</button>
    <button type="button" id="order-drilling-zip-btn" class="secondary">Furação (ZIP de .ban)</button>
    <span id="order-drilling-status" class="hint" style="margin-left:10px;"></span>
    <table>
      <thead>
        <tr>
          <th>Módulo</th>
          <th>Referência</th>
          <th>Descrição</th>
          <th>Comprimento (mm)</th>
          <th>Largura (mm)</th>
          <th>Espessura (mm)</th>
          <th>Cor</th>
          <th>Quantidade</th>
        </tr>
      </thead>
      <tbody id="order-cutlist-tbody"></tbody>
    </table>

    <h3 style="margin-top:20px;margin-bottom:4px;">Lista de compra (itens comprados prontos)</h3>
    <button type="button" id="order-purchase-csv-btn" class="secondary">Baixar CSV</button>
    <table>
      <thead>
        <tr>
          <th>Módulo</th>
          <th>Referência</th>
          <th>Descrição</th>
          <th>Quantidade</th>
        </tr>
      </thead>
      <tbody id="order-purchase-tbody"></tbody>
    </table>
  </section>

  <!-- Visualização de pedido de PLANO DE CORTE (migration 051) — tabela
       digitada/importada pelo Contractor, diferente do "Lista de peças"
       acima (que é a derivada AUTOMÁTICA de módulo configurado). Aqui é
       leitura direta de cutting_list_items, incluindo preço por peça (o
       admin já vê custo em outros lugares do painel, então não esconde
       aqui — só o cliente não vê o cálculo). -->
  <section class="panel" id="order-cutting-list-section" style="display:none;">
    <div class="section-header-row">
      <h2>Plano de Corte — <span id="order-cutting-list-title"></span></h2>
      <button type="button" id="order-cutting-list-back-btn" class="secondary" style="margin-top:0;">← Voltar para pedidos</button>
    </div>
    <div id="order-cutting-list-meta" class="hint" style="margin-bottom:10px;"></div>
    <div id="order-cutting-list-error" class="error" style="display:none;"></div>
    <table>
      <thead>
        <tr>
          <th>OP</th>
          <th>Peça</th>
          <th>Qtd</th>
          <th>Comprimento (mm)</th>
          <th>Largura (mm)</th>
          <th>Veio</th>
          <th>Espessura</th>
          <th>Cor</th>
          <th>Fita</th>
          <th>Obs</th>
          <th>Preço unit.</th>
          <th>Preço total</th>
        </tr>
      </thead>
      <tbody id="order-cutting-list-tbody"></tbody>
    </table>
    <p class="total-price" id="order-cutting-list-total"></p>
  </section>

    `;
