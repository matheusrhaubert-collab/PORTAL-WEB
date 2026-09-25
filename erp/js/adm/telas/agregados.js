/* Tela do painel admin: tab-agregados  (migration 085)
 *
 * Catálogo de AGREGADOS do construtor de armários — o que um vão pode
 * receber: divisória, prateleira, gaveta, porta, cabide, cesto, ripado.
 *
 * Ler docs/criador-de-modulos-spec.md. O motor é js/layout-engine.js.
 *
 * O agregado NÃO é uma peça nova: ele APONTA pra um componente do catálogo
 * (ou pra um módulo inteiro, quando o agregado é uma gaveta/porta completa).
 * Sem esse vínculo não existe preço, fita nem furação — por isso ele é
 * obrigatório. O que o agregado acrescenta por cima é só a REGRA: em que
 * encaixe serve, quanto consome do vão, e os limites.
 *
 * Os ids seguem o padrão das outras telas (getElementById no JS do admin). */
ADM_TELAS['tab-agregados'] = `

  <section class="panel">
    <h2>Agregados do construtor</h2>
    <p class="hint">
      O que um vão pode receber quando o cliente monta o armário. Cada agregado aponta para um
      <strong>componente</strong> do catálogo (ou um <strong>módulo</strong> inteiro, no caso de gaveta/porta
      prontas) — é de lá que saem preço, fita de borda, mão de obra e furação. O agregado só acrescenta a regra:
      onde ele encaixa e quais os limites dele.
    </p>
    <div id="agregados-error" class="error" style="display:none;"></div>

    <table>
      <thead>
        <tr>
          <th>Nome</th><th>Grupo</th><th>Encaixe</th><th>Gera</th>
          <th>Vão mínimo<br><span class="hint">L × A × P</span></th>
          <th>Veio</th><th>Furo</th><th>Variante de profundidade</th><th>Status</th><th></th>
        </tr>
      </thead>
      <tbody id="agregados-tbody"></tbody>
    </table>

    <form id="agregado-form" style="margin-top:14px;">
      <input type="hidden" id="agregado-id" />

      <h3 style="margin:6px 0 4px;font-size:13px">Identificação</h3>
      <div class="row" style="align-items:flex-end;">
        <div><label>Nome</label><input id="agregado-name" required placeholder="Prateleira fixa" /></div>
        <div><label>Grupo (aba na biblioteca)</label><input id="agregado-group" placeholder="Prateleiras" /></div>
        <div><label>Ícone</label><input id="agregado-icon" placeholder="▤" style="width:70px" /></div>
        <div>
          <label>Ordem</label><input type="number" id="agregado-sort" value="0" style="width:70px" />
        </div>
      </div>

      <h3 style="margin:14px 0 4px;font-size:13px">Onde encaixa</h3>
      <p class="hint" style="margin-top:0">
        <strong>Divide</strong> corta o vão em N pedaços e vira a peça de separação — prateleira e divisória são
        a mesma operação, só muda o eixo. <strong>Preenche</strong> ocupa o vão inteiro (gaveta, cabide).
        <strong>Fecha a frente</strong> cobre a cara do vão (porta).
      </p>
      <div class="row" style="align-items:flex-end;">
        <div>
          <label>Encaixe</label>
          <select id="agregado-role" required>
            <option value="split">Divide o vão</option>
            <option value="content">Preenche o vão</option>
            <option value="front">Fecha a frente</option>
          </select>
        </div>
        <div id="agregado-axis-wrap">
          <label>Eixo da divisão</label>
          <select id="agregado-axis">
            <option value="y">Horizontal — prateleira (divide a altura)</option>
            <option value="x">Vertical — divisória (divide a largura)</option>
          </select>
        </div>
        <div>
          <label>Espessura que consome do vão (mm)</label>
          <input id="agregado-thickness" value="E" title="E = espessura da chapa do casco (cor do módulo); ou um número fixo em mm" style="width:110px" />
        </div>
      </div>

      <h3 style="margin:14px 0 4px;font-size:13px">Que peça isso gera</h3>
      <p class="hint" style="margin-top:0">
        Exatamente um dos dois. Sem isso o agregado não tem preço e não pode ser usado.
      </p>
      <div class="row" style="align-items:flex-end;">
        <div>
          <label>Componente do catálogo</label>
          <select id="agregado-component"><option value="">—</option></select>
        </div>
        <div>
          <label>…ou módulo inteiro (gaveta/porta pronta)</label>
          <select id="agregado-child-module"><option value="">—</option></select>
        </div>
        <div>
          <label>Papel de cor</label>
          <select id="agregado-color-role"><option value="">herda do tipo do componente</option></select>
        </div>
        <div>
          <label>Programa de furação</label>
          <select id="agregado-drilling-pattern"><option value="">— usar a furação do componente —</option></select>
        </div>
        <div>
          <label>Furos de suporte de prateleira na lateral</label>
          <!-- migration 162: por USO. A chapa genérica (Flatbord) não pode
               levar a flag no componente, senão base/topo/divisória também
               ganhariam os 4 furos Ø3 — marca aqui, só no agregado Prateleira. -->
          <select id="agregado-shelf-support">
            <option value="">— herdar do componente —</option>
            <option value="true">Sim — 4 furos Ø3 nas laterais (suporte de prateleira)</option>
            <option value="false">Não</option>
          </select>
        </div>
      </div>
      <div class="row" style="align-items:flex-end;">
        <div>
          <label>Abertura (peça-módulo)</label>
          <select id="agregado-opening">
            <option value="none">Não abre</option>
            <option value="hinge_left">Dobradiça à esquerda</option>
            <option value="hinge_right">Dobradiça à direita</option>
            <option value="slide_out">Corrediça (gaveta)</option>
          </select>
        </div>
        <div><label>Corrediças por unidade</label><input type="number" id="agregado-slides" value="0" style="width:90px" /></div>
        <div>
          <label>Formato especial</label>
          <select id="agregado-shape">
            <option value="">Chapa (padrão)</option>
            <option value="oval_rod">Cabide tubular oval</option>
          </select>
        </div>
      </div>

      <h3 style="margin:14px 0 4px;font-size:13px">Variante por profundidade (opcional)</h3>
      <p class="hint" style="margin-top:0">
        Use isto quando <strong>vários agregados são a mesma oferta pro cliente</strong> (ex: um único "Gaveta" no
        menu do construtor), cada um com um corpo/corrediça diferente pra uma faixa de profundidade — a
        corrediça certa já vem embutida no módulo escolhido em "…ou módulo inteiro" acima, como sempre. Marque
        aqui de qual agregado <strong>este</strong> é variante: ele deixa de aparecer sozinho no menu, e quando a
        profundidade do vão cair na faixa abaixo, é ele quem entra no lugar do representante — sem o cliente
        escolher nada. Deixe "Variante de" em branco pra um agregado comum (sem família) ou pro representante da
        família (que também pode ter faixa própria, ex: a mais comum).
      </p>
      <div class="row" style="align-items:flex-end;">
        <div>
          <label>Variante de profundidade de</label>
          <select id="agregado-depth-variant-of"><option value="">— não é variante (comum, ou é o representante) —</option></select>
        </div>
        <div><label>Faixa mín (mm)</label><input type="number" id="agregado-depth-min" style="width:110px" /></div>
        <div><label>Faixa máx (mm)</label><input type="number" id="agregado-depth-max" style="width:110px" /></div>
      </div>

      <h3 style="margin:14px 0 4px;font-size:13px">Vão mínimo para oferecer</h3>
      <p class="hint" style="margin-top:0">
        Regra de <strong>oferta</strong>: o agregado nem aparece na lista se o vão for menor que isso. Não
        confundir com os limites de fabricação da peça, que ficam no cadastro do componente.
      </p>
      <div class="row" style="align-items:flex-end;">
        <div><label>Largura mín (mm)</label><input type="number" id="agregado-min-w" value="0" style="width:110px" /></div>
        <div><label>Altura mín (mm)</label><input type="number" id="agregado-min-h" value="0" style="width:110px" /></div>
        <div><label>Profundidade mín (mm)</label><input type="number" id="agregado-min-d" value="0" style="width:110px" /></div>
      </div>

      <h3 style="margin:14px 0 4px;font-size:13px">Limites de fabricação</h3>
      <p class="hint" style="margin-top:0">
        Mín/máx da peça e sentido do veio <strong>não se cadastram aqui</strong> — são do <strong>componente</strong>
        (Cadastro de componentes). O fundo tem veio livre por ser o fundo, não por estar sendo usado como agregado:
        a mesma peça usada de três jeitos tem sempre os mesmos limites físicos. A coluna "Veio" da tabela acima
        mostra o que vem de lá.
      </p>
      <p class="hint" style="margin-top:0">
        A <strong>furação</strong> é diferente: um componente genérico (a chapa crua — corte e laminação, sem furo
        próprio) pode servir de base pra vários agregados diferentes, cada um furado de um jeito conforme o uso —
        prateleira fixa leva furo de cavilha, divisória leva outro, prateleira móvel não leva furo nenhum. Por
        isso "Programa de furação" (acima) é um campo do <strong>agregado</strong>, não do componente: vazio cai na
        furação que o componente já tem cadastrada (component_drillings, o padrão de sempre); escolhido, usa esse
        programa específico (mesmo catálogo da aba "Programas de furação"). A coluna "Furo" da tabela acima mostra
        qual dos dois está valendo.
      </p>
      <div class="row" style="align-items:flex-end;">
        <div style="flex:0 0 auto">
          <label style="display:flex;gap:6px;align-items:center;white-space:nowrap">
            <input type="checkbox" id="agregado-active" checked /> Ativo
          </label>
        </div>
      </div>

      <h3 style="margin:14px 0 4px;font-size:13px">Parâmetros que o cliente ajusta</h3>
      <p class="hint" style="margin-top:0">
        JSON. As chaves presentes aqui viram os campos que aparecem nas propriedades do vão. Ex:
        <span class="mono">{"quantidade":1,"recuo_mm":8}</span> · porta:
        <span class="mono">{"lado":"left","folgas_mm":3,"sobrepoe":true}</span> ·
        <span class="mono">sobrepoe:false</span> deixa a porta embutida e recua os internos.
      </p>
      <div class="row" style="align-items:flex-end;">
        <div style="flex:1">
          <textarea id="agregado-params" rows="2" style="width:100%;font-family:monospace">{}</textarea>
        </div>
      </div>

      <div class="row" style="margin-top:10px">
        <div style="flex:0;"><button type="submit" style="margin-top:0;">Salvar agregado</button></div>
        <div style="flex:0;"><button type="button" class="secondary" id="agregado-cancel" style="margin-top:0;">Limpar</button></div>
        <div style="flex:0;"><button type="button" class="secondary" id="agregado-seed" style="margin-top:0;">Criar os agregados base…</button></div>
      </div>
    </form>
  </section>

  <section class="panel">
    <h2>Quais módulos aceitam cada agregado</h2>
    <p class="hint">
      Sem isto o construtor do cliente vira bagunça — ele ofereceria cabide dentro de gaveteiro de cozinha.
      Módulo <strong>sem nenhuma linha aqui</strong> não oferece agregado nenhum: o cliente vê o módulo montado
      e só. É o padrão seguro, e é o que separa "o módulo" das "opções do módulo".
    </p>
    <div id="agregados-mod-error" class="error" style="display:none;"></div>
    <div class="row" style="align-items:flex-end;">
      <div>
        <label>Módulo</label>
        <select id="agregado-mod-module"><option value="">Escolha um módulo…</option></select>
      </div>
    </div>
    <table style="margin-top:10px">
      <thead>
        <tr><th>Agregado</th><th>Permitido</th><th>Aparece pro cliente</th><th>Máx. no módulo</th>
            <th>Vão mínimo próprio<br><span class="hint">vazio = usa o do catálogo</span></th></tr>
      </thead>
      <tbody id="agregados-mod-tbody"></tbody>
    </table>
    <div class="row" style="margin-top:8px">
      <div style="flex:0;"><button type="button" id="agregado-mod-save" style="margin-top:0;">Salvar permissões</button></div>
    </div>
  </section>

    `;
