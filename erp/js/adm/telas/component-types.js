/* Tela do painel admin: tab-component-types
 * Mudou de casa do admin.html para cá quando o ERP virou a única porta
 * de entrada. A PARTIR DAQUI este arquivo é a fonte da verdade do
 * markup desta tela — pode editar à mão à vontade.
 * Os ids são os mesmos de antes, de propósito: o JS do admin continua
 * achando tudo por getElementById. */
ADM_TELAS['tab-component-types'] = `

  <!-- TIPOS DE COMPONENTE -->
  <section class="panel">
    <h2>Tipos de componente</h2>
    <p class="hint">
      Ex: Lateral, Base, Prateleira, Fundo, Porta, Gaveta. "Papel de cor" decide qual cor (das escolhidas pelo
      cliente) peças desse tipo usam — gerencie a lista de papéis na aba Cores/Materiais. "Posicionamento" decide
      o eixo de espessura da peça no desenho 3D (deixe em Automático se não tiver certeza — mantém o
      comportamento de sempre, pela menor dimensão resolvida).
    </p>
    <div id="component-types-error" class="error" style="display:none;"></div>
    <table>
      <thead><tr><th>Nome</th><th>Papel de cor</th><th>Posicionamento</th><th>Status</th><th></th></tr></thead>
      <tbody id="component-types-tbody"></tbody>
    </table>
    <form id="component-type-form" class="row" style="margin-top:8px;align-items:flex-end;">
      <input type="hidden" id="component-type-id" />
      <div><label>Nome</label><input id="component-type-name" required /></div>
      <div><label>Papel de cor</label><select id="component-type-color-role" required></select></div>
      <div>
        <label>Posicionamento</label>
        <select id="component-type-positioning">
          <option value="">Automático (menor dimensão)</option>
          <option value="horizontal">Horizontal (fino na altura — base/topo/prateleira)</option>
          <option value="vertical">Vertical (fino na largura — lateral)</option>
          <option value="vertical_no_plano">Vertical no plano (fino na profundidade — porta/fundo, alto e estreito)</option>
          <option value="horizontal_no_plano">Horizontal no plano (fino na profundidade — travessa larga e baixa)</option>
        </select>
      </div>
      <div style="flex:0;"><button type="submit" style="margin-top:0;">Salvar</button></div>
    </form>
  </section>

    `;
