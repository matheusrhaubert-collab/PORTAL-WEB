/* Tela do painel admin: tab-controladoria
 * Mudou de casa do admin.html para cá quando o ERP virou a única porta
 * de entrada. A PARTIR DAQUI este arquivo é a fonte da verdade do
 * markup desta tela — pode editar à mão à vontade.
 * Os ids são os mesmos de antes, de propósito: o JS do admin continua
 * achando tudo por getElementById. */
ADM_TELAS['tab-controladoria'] = `
      <section class="panel">
        <h2>Controladoria</h2>
        <p class="hint">Visão geral de pedidos, orçamentos e novos cadastros no período selecionado.</p>
        <div id="controladoria-error" class="error" style="display:none;"></div>
        <div class="row" style="align-items:flex-end;">
          <div>
            <label>Período</label>
            <select id="controladoria-period-select">
              <option value="7">Últimos 7 dias</option>
              <option value="30" selected>Últimos 30 dias</option>
              <option value="90">Últimos 90 dias</option>
              <option value="month">Este mês</option>
              <option value="custom">Personalizado</option>
            </select>
          </div>
          <div id="controladoria-custom-from" style="display:none;">
            <label>De</label>
            <input type="date" id="controladoria-date-from" />
          </div>
          <div id="controladoria-custom-to" style="display:none;">
            <label>Até</label>
            <input type="date" id="controladoria-date-to" />
          </div>
          <div style="flex:0;">
            <button type="button" id="controladoria-refresh-btn" style="margin-top:0;">Atualizar</button>
          </div>
          <span id="controladoria-range-label" class="hint" style="margin-left:6px;"></span>
        </div>

        <div id="controladoria-cards" style="display:flex; gap:16px; margin-top:20px; flex-wrap:wrap;"></div>

        <div id="controladoria-charts" style="display:flex; gap:24px; margin-top:28px; flex-wrap:wrap;">
          <div class="bar-chart-block">
            <h3>Pedidos por dia</h3>
            <div class="bar-chart" id="controladoria-chart-orders"></div>
            <div class="bar-chart-labels" id="controladoria-chart-orders-labels"></div>
          </div>
          <div class="bar-chart-block">
            <h3>Orçamentos por dia</h3>
            <div class="bar-chart" id="controladoria-chart-quotes"></div>
            <div class="bar-chart-labels" id="controladoria-chart-quotes-labels"></div>
          </div>
          <div class="bar-chart-block">
            <h3>Novos clientes por dia</h3>
            <div class="bar-chart" id="controladoria-chart-clients"></div>
            <div class="bar-chart-labels" id="controladoria-chart-clients-labels"></div>
          </div>
        </div>
        <p id="controladoria-chart-note" class="hint" style="display:none; margin-top:10px;">
          Período muito longo pra mostrar dia a dia — os cards acima já somam o total do período.
        </p>
      </section>
    `;
