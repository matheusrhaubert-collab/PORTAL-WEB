/* Tela do painel admin: tab-drilling-editor — Configurador de furação
 *
 * Tela NOVA (não veio do admin.html). Ela quase não tem conteúdo próprio de
 * propósito: o editor de furação — tabela de furos, botão de adicionar,
 * copiar de outro componente e o visualizador 2D — já existe pronto dentro
 * do formulário de Cadastro de componentes, e duplicar aquele markup criaria
 * ids repetidos no documento, que é justamente o que faz o admin.js parar de
 * achar as coisas.
 *
 * Então aqui existe só a moldura: o seletor da peça e dois encaixes vazios.
 * Ao abrir a tela, os blocos originais são MOVIDOS pra dentro dos encaixes;
 * ao sair, voltam pro lugar. Um DOM só, dois lugares onde ele aparece.
 * A lógica disso está em js/adm/21-furacao-peca.js. */
ADM_TELAS['tab-drilling-editor'] = `
      <section class="panel">
        <h2>Configurador de furação</h2>
        <p class="hint">
          Escolha a peça, posicione os furos e veja o resultado no desenho ao lado.
          É a mesma furação padrão que aparece no cadastro do componente — mexer aqui é mexer lá.
          O desenho usa a convenção da máquina: peça deitada, X da esquerda, Y da borda de cima.
          Furo fora da chapa aparece em vermelho e seria descartado na hora de gerar o .ban.
        </p>

        <div id="furacao-peca-erro" class="error" style="display:none;"></div>

        <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:flex-end; margin-bottom:4px;">
          <div style="flex:1; min-width:260px;">
            <label>Peça</label>
            <input id="furacao-peca-busca" type="text" placeholder="Filtrar por referência..." autocomplete="off" />
          </div>
          <div style="flex:2; min-width:280px;">
            <label>&nbsp;</label>
            <select id="furacao-peca-select"></select>
          </div>
          <div>
            <button type="button" id="furacao-peca-salvar" disabled>Salvar furação</button>
          </div>
        </div>
        <p class="hint" id="furacao-peca-status" style="margin-top:0;"></p>
      </section>

      <!-- Encaixes: preenchidos em tempo de execução com os blocos originais
           da tela de componentes. Ficam vazios enquanto nenhuma peça está
           escolhida. -->
      <div id="furacao-peca-encaixe-medidas"></div>
      <div id="furacao-peca-encaixe-furos"></div>
`;
