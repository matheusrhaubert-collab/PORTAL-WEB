/* Tela do painel admin: tab-purchased-items  (migration 119)
 *
 * ITENS COMPRADOS — o cadastro que faltava.
 *
 * Matt, 2026-08-18: "hoje temos junto com labor, mas isso vai mudar, itens
 * comprados devem ter sua propria tela, assim como as cores e fitas tem a
 * dela."
 *
 * Ele está certo por um motivo que vai além de arrumação: o preço de compra
 * da ferragem estava gravado como MÃO DE OBRA (components.labor_type_id), e
 * isso contaminava o relatório de custo — ferro comprado somando na coluna de
 * capacidade de máquina. Ver o cabeçalho da migration 119.
 *
 * Duas seções:
 *   1. Itens comprados — o catálogo (preço de COMPRA, sem margem)
 *   2. Regras de consumo — o vínculo furo -> ferragem, que é o que responde
 *      "como o sistema sabe que este módulo leva 12 minifix"
 *
 * Padrão de sempre: aqui só o markup; a lógica mora em 25-itens-comprados.js.
 */
ADM_TELAS['tab-purchased-items'] = `

  <!-- ================= 1. O CATÁLOGO ================= -->
  <section class="panel">
    <h2>Itens comprados</h2>
    <p class="hint">
      O que a fábrica <strong>compra pronto</strong> em vez de cortar: tambor, pino, cavilha,
      suporte de prateleira, puxador, pé. O preço aqui é o <strong>custo de compra</strong>, sem margem —
      a margem sai do perfil escolhido lá embaixo.
    </p>
    <div id="purchased-items-error" class="error" style="display:none;"></div>
    <table>
      <thead><tr>
        <th>Código</th><th>Nome</th><th>Grupo</th><th>Un.</th><th>Trilho</th>
        <th>Custo de compra</th><th>Margem</th><th>Status</th><th></th>
      </tr></thead>
      <tbody id="purchased-items-tbody"></tbody>
    </table>

    <form id="purchased-item-form">
      <input type="hidden" id="purchased-item-id" />
      <div class="row">
        <div><label>Nome</label><input id="purchased-item-name" required /></div>
        <div><label>Código / SKU</label><input id="purchased-item-code" placeholder="MFX-TAM" /></div>
        <div><label>Fornecedor</label><input id="purchased-item-supplier" /></div>
      </div>
      <div class="row">
        <div>
          <label>Grupo</label>
          <select id="purchased-item-kind">
            <option value="ferragem_montagem">Ferragem de montagem (tambor, pino, cavilha)</option>
            <option value="suporte">Suporte / pino de prateleira</option>
            <option value="dobradica">Dobradiça</option>
            <option value="corredica">Corrediça</option>
            <option value="puxador">Puxador</option>
            <option value="pe">Pé / sapata</option>
            <option value="acessorio">Acessório</option>
            <option value="outro">Outro</option>
          </select>
        </div>
        <div>
          <label>Unidade</label>
          <select id="purchased-item-unit">
            <option value="un">un — unidade</option>
            <option value="par">par</option>
            <option value="jogo">jogo</option>
            <option value="m">m — metro linear</option>
            <option value="m2">m² — metro quadrado</option>
            <option value="kg">kg</option>
          </select>
        </div>
        <div><label>Custo de compra ($ / unidade)</label><input id="purchased-item-price" type="number" step="0.0001" required /></div>
      </div>

      <!-- Migration 128: comprimento do trilho, só relevante pra corrediça
           (kind='corredica'). Mesmo campo/mesmo uso que slide_models.rail_length_mm
           ganhou na 127, agora direto no catálogo de verdade. Cadastre uma
           linha POR COMPRIMENTO (305/381/457/533mm = 12"/15"/18"/21") e
           vincule todas ao mesmo módulo-gaveta em Cadastro de Módulos >
           Modelos (dobradiça/corrediça) > "Corrediças (Itens Comprados)" —
           o motor escolhe sozinho a certa pela profundidade real da gaveta. -->
      <div class="row">
        <div>
          <label>Comprimento do trilho (mm) — só corrediça</label>
          <input id="purchased-item-rail-length" type="number" step="1" placeholder="— fixo, sem variar —" />
        </div>
      </div>
      <p class="hint">Só preencha pra item do grupo Corrediça. Vazio = corrediça de preço fixo, igual sempre foi.</p>

      <!-- Margem POR ITEM. Dobradiça raramente tem o mesmo markup de uma
           cavilha, e deixar o override aqui evita que o dia em que ele for
           preciso vire migration. Vazio = usa o padrão dos comprados lá
           embaixo. -->
      <label>Margem deste item</label>
      <p class="hint">Vazio = usa a margem padrão dos itens comprados (seção abaixo). Só preencha quando este item tiver markup diferente dos outros.</p>
      <select id="purchased-item-margin-profile"><option value="">— padrão dos comprados —</option></select>

      <!-- Fase 2: dobradiça e corrediça. As colunas já existem em attrs
           (jsonb) desde a 119, mas hinge_models/slide_models continuam
           mandando no preço — mexer nelas toca order_items, quotes e a regra
           de altura da porta de uma vez. Este bloco fica escondido até lá. -->
      <div id="purchased-item-attrs-wrap" style="display:none;">
        <label>Atributos</label>
        <p class="hint">Preenchido na fase 2 (dobradiça: ângulo, copo, tipo · corrediça: comprimento, tipo).</p>
        <textarea id="purchased-item-attrs" rows="3" placeholder='{"angulo":110,"copo_mm":35}'></textarea>
      </div>

      <label>Observações</label>
      <textarea id="purchased-item-notes" rows="2"></textarea>
      <label><input type="checkbox" id="purchased-item-active" checked style="width:auto;display:inline-block;" /> Ativo</label>
      <button type="submit">Salvar item</button>
      <button type="button" class="secondary" id="purchased-item-clear">Limpar</button>
    </form>
  </section>

  <!-- ================= 2. A MARGEM ================= -->
  <section class="panel">
    <h2>Margem dos itens comprados</h2>
    <p class="hint">
      Reaproveita os <strong>perfis de margem</strong> do Cadastro de preços (os mesmos que família e categoria usam).
      Deixar em "— margem do módulo —" mantém o comportamento antigo: o comprado recebe o mesmo markup do móvel.
    </p>
    <div id="purchased-margin-error" class="error" style="display:none;"></div>
    <form id="purchased-margin-form">
      <label>Perfil de margem padrão dos comprados</label>
      <select id="purchased-margin-profile"><option value="">— margem do módulo (comportamento atual) —</option></select>
      <button type="submit">Salvar margem</button>
      <span class="hint" id="purchased-margin-status"></span>
    </form>
  </section>

  <!-- ================= 3. AS REGRAS ================= -->
  <section class="panel">
    <h2>Regras de consumo — o que entra em cada furo</h2>
    <p class="hint">
      É aqui que o item comprado se liga ao módulo. O sistema <strong>não</strong> guarda "este módulo leva 12 minifix" —
      ele conta os furos que a furação de fato gera (os mesmos que saem no arquivo <code>.ban</code> da furadeira) e
      aplica estas regras. Mudou a furação, a lista de ferragem muda junto, sozinha.
    </p>
    <div class="hint" style="border-left:3px solid #c99;padding-left:10px;margin:10px 0;">
      <strong>Regra da casa (Matt, 2026-08-18):</strong> só a FACE decide, e só o diâmetro. Furo de <strong>borda nunca conta</strong> —
      nem como gatilho, nem como confirmação. Cada furo de face conta 1 unidade, sozinho, sem parear com outro furo da mesma junta.
      <br>Ø5 na face → 1 pino minifix &nbsp;·&nbsp; Ø8 na face → 1 cavilha &nbsp;·&nbsp; Ø12 na face → 1 tambor minifix.
      <br>O campo <strong>"Tipos de furo"</strong> abaixo não escolhe cavilha-vs-pino (isso é só o diâmetro) — ele só mantém os furos
      automáticos de dobradiça/corrediça/suporte de fora da regra de diâmetro do cadastro comum, já que eles também podem usar Ø5.
      Pra minifix/cavilha, marque os 4 tipos do "cadastro comum" (botão abaixo).
    </div>
    <div id="hardware-rules-error" class="error" style="display:none;"></div>
    <table>
      <thead><tr>
        <th>Regra</th><th>Gatilho</th><th>Consome</th><th>Qtd</th><th>Status</th><th></th>
      </tr></thead>
      <tbody id="hardware-rules-tbody"></tbody>
    </table>

    <form id="hardware-rule-form">
      <input type="hidden" id="hardware-rule-id" />
      <div class="row">
        <div><label>Nome da regra</label><input id="hardware-rule-name" required placeholder="Minifix — tambor" /></div>
        <div>
          <label>Gatilho</label>
          <select id="hardware-rule-trigger">
            <option value="furo">Furo gerado</option>
            <option value="papel">Papel da peça (ferragem que não deixa furo)</option>
          </select>
        </div>
      </div>

      <div id="hardware-rule-furo-wrap">
        <div class="row">
          <div style="flex:2;">
            <label>Tipos de furo (múltipla escolha — Ctrl/Cmd+clique)</label>
            <select id="hardware-rule-hole-kinds" multiple size="6">
              <option value="proprio_face">Face — furo do cadastro da própria peça</option>
              <option value="proprio_face_tambor">Face própria que tem tambor na linha</option>
              <option value="contrafuro_face">Face — RECEBIDO de uma borda vizinha</option>
              <option value="copo_tambor">Tambor do minifix (o Ø12)</option>
              <option value="proprio_borda">Borda — furo do cadastro da própria peça</option>
              <option value="contrafuro_borda">Borda — RECEBIDO de uma face vizinha</option>
              <option value="copo_dobradica">Copo da dobradiça (Ø35)</option>
              <option value="marcacao_dobradica">Marcação da dobradiça</option>
              <option value="base_dobradica">Base da dobradiça na lateral</option>
              <option value="corredica">Corrediça</option>
              <option value="suporte_prateleira">Suporte de prateleira</option>
            </select>
            <button type="button" class="secondary" id="hardware-rule-kinds-comum" style="margin-top:6px;">Marcar os 4 do cadastro comum</button>
          </div>
          <div><label>Diâmetro (mm)</label><input id="hardware-rule-diameter" type="number" step="0.01" placeholder="qualquer" /></div>
          <div>
            <label>Face</label>
            <select id="hardware-rule-face-kind">
              <option value="">— qualquer —</option>
              <option value="face">Face / verso</option>
              <option value="borda">Borda / topo</option>
            </select>
          </div>
        </div>
        <p class="hint">Nenhum tipo marcado = vale pra qualquer furo (raramente é o que você quer). Diâmetro e Face vazios = "qualquer";
          os preenchidos precisam <strong>todos</strong> bater pra a regra pegar. Pra minifix/cavilha use Face = "Face / verso" +
          diâmetro (5/8/12) + os 4 tipos do cadastro comum.</p>
      </div>

      <div id="hardware-rule-papel-wrap" style="display:none;">
        <label>Papel da peça</label>
        <input id="hardware-rule-position-role" placeholder="handle, leg, shelf…" />
        <p class="hint">Uma vez por peça com esse papel. Pra puxador, pé, sapata — coisa que não deixa furo.</p>
      </div>

      <div class="row">
        <div><label>Consome o item</label><select id="hardware-rule-item" required></select></div>
        <div><label>Quantidade por gatilho</label><input id="hardware-rule-qty" type="number" step="0.001" value="1" required /></div>
      </div>
      <label>Observações</label>
      <textarea id="hardware-rule-notes" rows="2"></textarea>
      <label><input type="checkbox" id="hardware-rule-active" checked style="width:auto;display:inline-block;" /> Ativa</label>
      <button type="submit">Salvar regra</button>
      <button type="button" class="secondary" id="hardware-rule-clear">Limpar</button>
    </form>
  </section>
`;
