/* Tela do painel admin: tab-colors
 * Mudou de casa do admin.html para cá quando o ERP virou a única porta
 * de entrada. A PARTIR DAQUI este arquivo é a fonte da verdade do
 * markup desta tela — pode editar à mão à vontade.
 * Os ids são os mesmos de antes, de propósito: o JS do admin continua
 * achando tudo por getElementById. */
ADM_TELAS['tab-colors'] = `

  <!-- CORES -->
  <section class="panel">
    <h2>Cores / Materiais</h2>
    <div id="colors-error" class="error" style="display:none;"></div>
    <table>
      <thead><tr><th>Textura</th><th>Nome</th><th>Chapa (m²)</th><th>Fita (m)</th><th>Tamanho de chapa</th><th>Status</th><th></th></tr></thead>
      <tbody id="colors-tbody"></tbody>
    </table>

    <form id="color-form">
      <input type="hidden" id="color-id" />
      <input type="hidden" id="color-texture-url" />
      <div class="row">
        <div><label>Nome da cor/material</label><input id="color-name" required /></div>
        <div><label>Preço chapa ($/m²)</label><input id="color-sheet-price" type="number" step="0.01" required /></div>
        <div><label>Preço fita ($/m linear)</label><input id="color-edge-price" type="number" step="0.01" required /></div>
      </div>
      <label>Textura (imagem da chapa — usada no site e no visualizador 3D)</label>
      <input id="color-texture-file" type="file" accept="image/*" />
      <div id="color-texture-preview" style="margin-top:8px;"></div>
      <p class="hint" id="color-texture-upload-status"></p>
      <label>Cor sólida de referência</label>
      <p class="hint">Usada no visualizador 3D e no swatch quando esta cor não tem textura cadastrada.</p>
      <input id="color-swatch-hex" type="color" style="width:60px;padding:2px;" />
      <!-- Substrato (migration 088) — é o miolo da chapa, o que aparece na
           borda SEM fita no 3D. Fica na COR porque cor, aqui, sempre foi o
           material: preço de chapa, preço de fita, tamanho de chapa (063) e
           veio (083) já moram nela. Não afeta preço. -->
      <label>Substrato (miolo da chapa)</label>
      <p class="hint">
        O que aparece nas bordas <strong>sem fita</strong> no 3D. Não muda preço nenhum — é só desenho.
        A borda com fita continua saindo na cor/textura acima.
      </p>
      <select id="color-substrato">
        <option value="mdp">MDP — partícula, granulado bem visível</option>
        <option value="mdf">MDF — denso e liso</option>
        <option value="plywood">Plywood — lâminas empilhadas</option>
      </select>
      <!-- Densidade (migration 152, 2026-09-03) — pedido do usuário: "o
           plywood... tem densidades diferentes, talvez tenhamos que tirar a
           densidade das margens e colocar nas cores". Vazio = usa a
           densidade GLOBAL de sempre (Configurações > Preço) — só preenche
           aqui a cor que realmente precisa de um valor diferente (ex.:
           plywood, mais leve que MDP/MDF). Não afeta preço, só o peso
           estimado mostrado no portal. -->
      <label>Densidade (kg/m³)</label>
      <p class="hint">
        Deixe em branco pra usar a densidade global (Configurações &gt; Preço). Preencha só quando
        esta cor/material for mais leve ou mais pesada que o padrão (ex.: plywood).
      </p>
      <input id="color-density" type="number" step="1" min="0" placeholder="usar densidade global" />
      <!-- Espessura da chapa (migration 160) — o E das fórmulas de peça
           ('E', 'W-2*E', 'W-E'). Só o plywood (18mm) precisa; em branco é
           19.5, o padrão de todo o resto. Muda medida de base/lateral,
           desenho, plano de corte e furação (.ban) das peças nessa cor. -->
      <label>Espessura da chapa (mm)</label>
      <p class="hint">
        Deixe em branco pra usar 19.5 mm (padrão). Preencha só quando a chapa desta cor tem
        outra espessura (ex.: plywood = 18). Vale pra medida das peças, plano de corte e furação.
      </p>
      <input id="color-thickness" type="number" step="0.5" min="1" placeholder="19.5 (padrão)" />
      <!-- Tamanho de chapa padrão (migration 063) — usado pelo "Gerar Plano de
           Corte" do Contractor pra saber automaticamente em qual chapa
           encaixar as peças desta cor/material. Cor sem tamanho vinculado
           ("— nenhum —") obriga o Contractor a escolher na hora. -->
      <!-- STOCK IN HOUSE (migration 064, renomeado de "usa retalhos") — cor
           que não vem de chapa nova comprada, já fica em estoque/sobra.
           "Quantas chapas comprar" e "quantos metros de fita" não fazem
           sentido pra ela — só o preço importa (ver renderCutlistPlanResults
           em js/portal.js). Marcado, esconde o select de tamanho de chapa
           (não tem por quê escolher um tamanho que nunca vai ser usado). -->
      <label><input type="checkbox" id="color-stock-in-house" style="width:auto;display:inline-block;" /> STOCK IN HOUSE</label>
      <p class="hint">Material que já fica em estoque (sobra/retalho) — o Plano de Corte não mostra chapas nem fita pra ela, só o preço.</p>
      <!-- CORTE ESPECIAL (migration 074, pedido do usuário 2026-08-02: "cores
           egger... nao quero que gere plano de corte... cor especial") —
           diferente de STOCK IN HOUSE: a fita de borda CONTINUA calculada
           normalmente (é aplicada por nós, independe de onde a chapa veio),
           só a diagramação/contagem de chapa (nesting) é pulada — chapa
           EGGER especial não segue os tamanhos padrão cadastrados, então nem
           faz sentido pedir pro Contractor escolher um tamanho manualmente. -->
      <!-- VEIO (migration 083). MUDOU DE LUGAR em 2026-08-16, a pedido do
           Matt: "melhor colocar isso ali em engenharia cadastro de cores,
           faz mais sentido". Vivia na tela de Materiais (estoque), junto com
           quantidade e local — mas veio não é estoque, é característica do
           material, e é aqui que o material é cadastrado. A tela de Materiais
           continua MOSTRANDO (coluna "Veio"), só não edita mais: uma
           informação, um lugar de editar. -->
      <label><input type="checkbox" id="color-has-grain" style="width:auto;display:inline-block;" /> Este material tem veio</label>
      <p class="hint">Trava a orientação de toda peça deste material no nesting — comprimento sempre no sentido do veio. É a fonte da verdade do veio: a peça herda daqui.</p>
      <label><input type="checkbox" id="color-skip-cutting-plan" style="width:auto;display:inline-block;" /> Cor Especial (ex.: EGGER)</label>
      <p class="hint">Não gera diagramação de chapa (nesting) no Plano de Corte — a fita de borda continua sendo calculada normalmente.</p>
      <div id="color-sheet-size-field">
        <label>Tamanho de chapa padrão (Plano de Corte)</label>
        <p class="hint">Cadastre os tamanhos disponíveis logo abaixo. Sem um tamanho vinculado, o Contractor escolhe manualmente ao gerar o plano de corte.</p>
        <select id="color-default-sheet-size"><option value="">— nenhum (cliente escolhe) —</option></select>
      </div>
      <label><input type="checkbox" id="color-active" style="width:auto;display:inline-block;" /> Ativa</label>
      <button type="submit">Salvar cor</button>
    </form>
  </section>

  <!-- TAMANHOS DE CHAPA (migration 063) — padrões reutilizáveis (ex: "EGGER
       5X9", "GUARARAPES 6X9", "STANDARD 8X4") vinculados por cor acima e
       usados pelo nesting do "Gerar Plano de Corte" no portal. -->
  <section class="panel">
    <h2>Tamanhos de Chapa</h2>
    <p class="hint">Padrões de chapa (largura x altura + kerf da serra) usados pra encaixar as peças do Plano de Corte. Vincule cada cor/material a um tamanho acima.</p>
    <div id="sheet-sizes-error" class="error" style="display:none;"></div>
    <table>
      <thead><tr><th>Nome</th><th>Largura (mm)</th><th>Altura (mm)</th><th>Kerf (mm)</th><th>Status</th><th></th></tr></thead>
      <tbody id="sheet-sizes-tbody"></tbody>
    </table>
    <form id="sheet-size-form">
      <input type="hidden" id="sheet-size-id" />
      <div class="row">
        <div><label>Nome (ex: EGGER 5X9)</label><input id="sheet-size-name" required /></div>
        <div><label>Largura (mm)</label><input id="sheet-size-width" type="number" step="1" min="1" required /></div>
        <div><label>Altura (mm)</label><input id="sheet-size-height" type="number" step="1" min="1" required /></div>
        <div><label>Kerf (mm)</label><input id="sheet-size-kerf" type="number" step="0.5" min="0" value="4" required /></div>
      </div>
      <label><input type="checkbox" id="sheet-size-active" checked style="width:auto;display:inline-block;" /> Ativo</label>
      <button type="submit">Salvar tamanho</button>
    </form>
  </section>

  <!-- PAPÉIS DE COR (migration 035) -->
  <section class="panel">
    <h2>Papéis de cor</h2>
    <p class="hint">
      Cada peça (via "Tipo de componente") usa UM papel de cor — antes só existia "Caixa" e
      "Porta/Frente" fixos; agora você pode criar quantos quiser (ex: "Puxador", "Interno").
      O cliente escolhe uma cor por papel que o módulo realmente usa.
    </p>
    <div id="color-roles-error" class="error" style="display:none;"></div>
    <table><tbody id="color-roles-tbody"></tbody></table>
    <form id="color-role-form" class="row" style="margin-top:8px;">
      <input type="hidden" id="color-role-id" />
      <div><input id="color-role-name" placeholder="Nome do papel (ex: Puxador)" required /></div>
      <div style="flex:0;"><button type="submit" style="margin-top:0;">+</button></div>
    </form>
  </section>

    `;
