/* Tela do painel admin: tab-drilling-patterns  (migration 105/106)
 *
 * PROGRAMAS DE FURAÇÃO — o catálogo separado, pedido do Matt (2026-08-15):
 * "cria uma pasta com programas que eu possa abrir separadamente pelo ERP em
 * um lugar separado com visualizador. Não puxa os furos direto no componente
 * porque fica estranho. Puxa o programa todo. Melhor."
 *
 * POR QUE ESTA TELA EXISTE, se já há o "Configurador de furação"
 * ---------------------------------------------------------------------
 * Aquela edita a furação DE UM COMPONENTE (component_drillings) — é o modelo
 * antigo, em que cada peça especializada carrega os próprios furos. A linha
 * nova ("flatbord") tem só DOIS componentes crus, então a furação não pode
 * morar neles: ela vira um PROGRAMA reutilizável, escolhido na linha do
 * módulo pai. Esta tela é o catálogo desses programas.
 *
 * O desenho é o mesmo da prévia do componente: peça DEITADA no plano da
 * máquina (X = 0..C da esquerda, Y = 0..L da borda de cima), furo de face =
 * círculo cheio, verso = tracejado, borda = retângulo entrando pela lateral.
 * Furo fora da chapa sai vermelho — mesmo critério do gerador do .ban, que
 * descartaria o furo. */
ADM_TELAS['tab-drilling-patterns'] = `

  <section class="panel">
    <h2>Programas de furação</h2>
    <p class="hint">
      Cada programa é um conjunto de furos com nome — "Lateral 32mm", "Base", "Topo". Na tela do produto,
      cada peça escolhe <strong>um programa</strong>, e é isso que transforma a chapa crua em lateral ou base.
      Um programa é independente do componente: editar aqui não mexe em nenhum cadastro antigo.
    </p>
    <div id="dp-error" class="error" style="display:none;"></div>

    <div class="row" style="align-items:flex-start; gap:16px;">

      <!-- ---------- coluna esquerda: a lista ---------- -->
      <div style="flex:0 0 280px;">
        <label style="font-size:12px;margin-top:0;">Programas</label>
        <div id="dp-list" class="dp-list"></div>
        <button type="button" class="secondary" id="dp-new-btn" style="margin-top:8px;width:100%;">
          + Novo programa
        </button>
      </div>

      <!-- ---------- coluna direita: o editor + desenho ---------- -->
      <div style="flex:1;min-width:0;">
        <div id="dp-empty" class="hint" style="padding:24px 0;">
          Escolha um programa na lista, ou crie um novo.
        </div>

        <div id="dp-editor" style="display:none;">
          <input type="hidden" id="dp-id" />

          <div class="row">
            <div style="flex:2;">
              <label style="font-size:12px;margin-top:0;">Nome do programa</label>
              <input type="text" id="dp-name" placeholder="ex: Lateral 32mm" />
            </div>
            <div style="flex:1;">
              <label style="font-size:12px;margin-top:0;">Furos equivalentes</label>
              <input type="number" id="dp-furos-eq" min="0" step="1" value="0" />
            </div>
            <div style="flex:1;">
              <label style="font-size:12px;margin-top:0;">Leva furo?</label>
              <select id="dp-fura">
                <option value="1">Sim</option>
                <option value="0">Não</option>
              </select>
            </div>
          </div>
          <p class="hint" style="margin-top:2px;">
            <strong>Furos equivalentes</strong> conta os furos próprios <em>mais</em> os que esta peça causa na
            vizinha (contra-furo, copo). É o número que o custo de mão de obra por processo usa — quem define a
            junta paga pelos dois lados, e aí o total do módulo fecha exato.
          </p>

          <div style="margin-top:6px;">
            <label style="font-size:12px;margin-top:0;">Observação (opcional)</label>
            <input type="text" id="dp-notes" placeholder="para que serve, em que módulo é usado..." />
          </div>

          <!-- ---------- os furos ---------- -->
          <h3 style="margin-top:16px;">Furos</h3>
          <p class="hint">
            Fórmulas aceitam <strong>C</strong> (comprimento), <strong>L</strong> (largura) e
            <strong>E</strong> (espessura) da peça no plano da máquina, além de <strong>W</strong> e
            <strong>H</strong> do módulo. Use <code>E</code> na profundidade para furo passante.
            <br>
            <strong>Contra Ø / Contra prof.</strong> é o furo que esta linha gera na peça
            <em>vizinha</em> — a cavilha que entra pela borda desta peça e fura a face da outra.
            É por aqui que a <strong>lateral</strong> recebe furo sem ter furação própria; em branco,
            não propaga nada.
          </p>
          <table>
            <thead>
              <tr>
                <th>Face</th><th>X</th><th>Y</th><th>Ø</th><th>Prof.</th>
                <th>Repetir</th><th>dx</th><th>dy</th>
                <th title="Furo gerado na peça VIZINHA que esta borda encosta">Contra Ø</th>
                <th title="Profundidade do furo na peça vizinha">Contra prof.</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="dp-holes-tbody"></tbody>
          </table>
          <button type="button" class="secondary" id="dp-add-hole-btn" style="margin-top:6px;">+ Adicionar furo</button>

          <!-- ---------- visualizador ---------- -->
          <h3 style="margin-top:16px;">Visualizador</h3>
          <div class="row" style="align-items:flex-end;">
            <div style="flex:1;">
              <label style="font-size:12px;margin-top:0;">Comprimento de teste (mm)</label>
              <input type="number" id="dp-prev-c" value="800" />
            </div>
            <div style="flex:1;">
              <label style="font-size:12px;margin-top:0;">Largura de teste (mm)</label>
              <input type="number" id="dp-prev-l" value="560" />
            </div>
            <div style="flex:1;">
              <label style="font-size:12px;margin-top:0;">Espessura (mm)</label>
              <input type="number" id="dp-prev-e" value="19.5" step="0.5" />
            </div>
          </div>
          <p class="hint" id="dp-prev-meta" style="margin-top:6px;"></p>
          <div id="dp-preview" class="dp-preview"></div>

          <div style="margin-top:14px;display:flex;gap:8px;">
            <button type="button" id="dp-save-btn">Salvar programa</button>
            <button type="button" class="secondary" id="dp-duplicate-btn">Duplicar</button>
            <button type="button" class="danger" id="dp-delete-btn" style="margin-left:auto;">Excluir</button>
          </div>
        </div>
      </div>
    </div>
  </section>
`;
