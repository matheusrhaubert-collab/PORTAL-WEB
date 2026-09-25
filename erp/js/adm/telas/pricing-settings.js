/* Tela do painel admin: tab-pricing-settings
 * Mudou de casa do admin.html para cá quando o ERP virou a única porta
 * de entrada. A PARTIR DAQUI este arquivo é a fonte da verdade do
 * markup desta tela — pode editar à mão à vontade.
 * Os ids são os mesmos de antes, de propósito: o JS do admin continua
 * achando tudo por getElementById. */
ADM_TELAS['tab-pricing-settings'] = `

  <section class="panel">
    <h2>Margem de preço</h2>
    <p class="hint">
      Todo preço é calculado em cima do CUSTO (chapa + fita + mão de obra + dobradiça/corrediça).
      A margem abaixo é aplicada UMA VEZ em cima do custo total de cada módulo, antes de mostrar o
      preço pro cliente no portal — o cliente nunca vê o custo, só o total já com a margem.
    </p>
    <p class="hint">
      <strong>Importante:</strong> o cálculo continua rodando no navegador do cliente (busca o custo
      das tabelas de cor/dobradiça/corrediça/mão de obra pra calcular). Esta margem esconde o custo da
      TELA, mas não impede alguém tecnicamente capaz de inspecionar as respostas da API de ver os
      valores de custo brutos — só uma mudança maior (mover o cálculo pro backend) resolveria isso por
      completo.
    </p>
    <div id="pricing-settings-error" class="error" style="display:none;"></div>
    <form id="pricing-settings-form" class="row" style="align-items:flex-end;">
      <div>
        <label>Margem (%)</label>
        <input id="pricing-margin-percent" type="number" step="0.01" min="0" required />
      </div>
      <!-- Densidade (migration 061, pedido do usuário) — usada só pra
           calcular o PESO estimado exibido pro cliente (volume x
           densidade), junto do preço, no portal. Padrão 700 kg/m³
           (aproximação de MDP/MDF cru). Mesmo formulário/linha da margem
           (mesma tabela singleton pricing_settings), salvos juntos. -->
      <div>
        <label>Densidade do material (kg/m³)</label>
        <input id="pricing-density-kg-m3" type="number" step="1" min="0" required />
      </div>
      <div style="flex:0;">
        <button type="submit" style="margin-top:0;">Salvar margem</button>
      </div>
      <span id="pricing-settings-status" class="hint" style="margin-left:10px;"></span>
    </form>
    <p class="hint">
      Densidade: usada pra estimar o PESO (kg/lb) mostrado ao cliente junto com o preço e a metragem
      cúbica (m³) de cada módulo/projeto/pedido — não afeta o preço.
    </p>
    <p class="hint">
      Ex: 35 = o cliente paga custo + 35% (multiplicador 1.35). 0 = cliente paga o custo puro, sem margem.
    </p>
  </section>

  <!-- MARGENS POR FAMÍLIA/CATEGORIA (migration 070) — pedido do usuário
       2026-08-02: "quero margens diferentes que eu possa aplicar pra
       modulos diferentes... na opcao da categoria ou familia, eu tenha
       opcao de ligar com a margem que eu quero". Cadastre aqui as margens
       NOMEADAS extras; depois vá em Taxonomia e escolha, no formulário de
       cada Família ou Categoria, qual delas usar (ou deixe "Padrão" pra
       continuar usando a margem acima). Categoria tem prioridade sobre
       família quando um módulo tem as duas com margem vinculada. -->
  <section class="panel">
    <h2>Margens por família/categoria</h2>
    <p class="hint">
      Além da margem Padrão acima, cadastre quantas margens nomeadas quiser aqui e vincule cada uma a
      uma Família ou Categoria específica (aba Taxonomia). Módulo sem família/categoria vinculada a
      nenhuma margem continua usando a Padrão, normalmente.
    </p>
    <div id="margin-profiles-error" class="error" style="display:none;"></div>
    <table>
      <thead><tr><th>Nome</th><th>Margem</th><th></th></tr></thead>
      <tbody id="margin-profiles-tbody"></tbody>
    </table>
    <form id="margin-profile-form" class="row" style="margin-top:8px;align-items:flex-end;">
      <input type="hidden" id="margin-profile-id" />
      <div><label>Nome</label><input id="margin-profile-name" placeholder="Ex: Closets premium" required /></div>
      <div><label>Margem (%)</label><input id="margin-profile-percent" type="number" step="0.01" required /></div>
      <div style="flex:0;"><button type="submit" style="margin-top:0;">Salvar</button></div>
    </form>
  </section>

  <!-- PLANO DE CORTE (migration 051) — margem/espessura/mão de obra
       específicos da aba "Plano de Corte" do portal (exclusiva do perfil
       Contractor). Campo separado do markup_multiplier acima — confirmado
       via AskUserQuestion: multiplicador global único (não por perfil). -->
  <section class="panel">
    <h2>Plano de Corte — configuração especial</h2>
    <p class="hint">
      Só vale pra pedidos feitos na aba "Plano de Corte" do portal (perfil Contractor). O cálculo usa
      o preço/m² e preço/metro de fita já cadastrados em Cores/Materiais, mais os 3 valores abaixo —
      tudo somado e só o TOTAL final aparece pro cliente (igual à margem de preço normal).
    </p>
    <div id="pricing-cutlist-settings-error" class="error" style="display:none;"></div>
    <form id="pricing-cutlist-settings-form" class="row" style="align-items:flex-end;">
      <div>
        <label>Margem especial (%)</label>
        <input id="pricing-cutlist-margin-percent" type="number" step="0.01" min="0" required />
      </div>
      <div>
        <label>Acréscimo espessura 38mm (%)</label>
        <input id="pricing-cutlist-thickness-percent" type="number" step="0.01" min="0" required />
      </div>
      <div>
        <label>Mão de obra por peça ($)</label>
        <input id="pricing-cutlist-labor-price" type="number" step="0.01" min="0" required />
      </div>
      <div style="flex:0;">
        <button type="submit" style="margin-top:0;">Salvar</button>
      </div>
      <span id="pricing-cutlist-settings-status" class="hint" style="margin-left:10px;"></span>
    </form>
    <p class="hint">
      Ex: acréscimo 50 = peça de 38mm custa +50% sobre o preço/m² da cor (peça de 19mm não tem acréscimo).
    </p>
  </section>

    `;
