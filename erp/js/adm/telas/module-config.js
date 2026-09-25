/* Tela do painel admin: tab-module-config
 * Mudou de casa do admin.html para cá quando o ERP virou a única porta
 * de entrada. A PARTIR DAQUI este arquivo é a fonte da verdade do
 * markup desta tela — pode editar à mão à vontade.
 * Os ids são os mesmos de antes, de propósito: o JS do admin continua
 * achando tudo por getElementById. */
ADM_TELAS['tab-module-config'] = `

  <!-- <select> original mantido no DOM (só escondido) — todo o resto do
       admin.js já lê/escreve nele (renderModuleSelect, goToModuleConfig, o
       listener de 'change' que decide o que aparece etc.), então a árvore
       nova só seta sel.value + dispara 'change' nele em vez de duplicar
       essa lógica toda. -->
  <section class="panel" style="display:none;">
    <label>Selecionar módulo</label>
    <select id="module-select"></select>
  </section>

  <!-- Reorganização da "Configurar módulo": antes era o select acima +
       5 seções empilhadas numa rolagem só, comprida e fácil de se perder.
       Agora: árvore de módulos (agrupada por família/categoria/subcategoria,
       os mesmos 3 campos que cada módulo já tem) à esquerda, e sub-abas por
       tipo de configuração à direita — mesma ideia do editor de módulos do
       Promob. Nenhuma função nova de dados, só reorganiza apresentação. -->
  <div class="module-config-shell">

    <div class="module-config-tree-col">
      <h2>Configurar módulo</h2>
      <p class="hint">Clique num módulo pra configurar as cores, os modelos disponíveis e os componentes (peças) que ele usa. Use "+ Novo módulo" (na coluna da direita) ou os botões em cada item pra criar/duplicar/editar/excluir.</p>

      <input type="text" id="module-config-search" class="module-config-search" placeholder="Buscar módulo..." />
      <div id="module-config-tree" class="module-config-tree"></div>
    </div>

    <div class="module-config-main-col">

      <!-- Fora da área com gate de selectedModuleId de propósito: "+ Novo
           módulo" precisa funcionar mesmo com NADA selecionado na árvore
           ainda (ver listener em admin.js, que força mostrar a aba "Dados
           do módulo" mesmo sem selectedModuleId). "Excluir" na árvore
           também pode disparar erro aqui sem nunca abrir o formulário. -->
      <button type="button" id="module-new-btn" class="secondary" style="margin-bottom:14px;">+ Novo módulo</button>
      <div id="modules-error" class="error" style="display:none;"></div>

      <div id="module-config-empty-hint" class="panel">
        <p class="hint">Selecione um módulo na lista à esquerda pra ver e editar a configuração dele aqui.</p>
      </div>

      <div id="module-config-header" class="module-config-header" style="display:none;">
        <h2 id="module-config-current-name">—</h2>
      </div>

      <!-- "Dados do módulo" (migrado da antiga aba "Módulos") virou só mais
           uma aba nessa MESMA tira, lado a lado com Cores/Modelos/etc — a
           pedido do usuário, que achou o bloco separado acima do cabeçalho
           "atrapalhando" (ficava sempre visível, fora da tira de abas). -->
      <div class="module-subtabs" id="module-subtabs" style="display:none;">
        <button type="button" class="module-subtab-btn" data-subtab="module-form-section">Dados do módulo</button>
        <button type="button" class="module-subtab-btn active" data-subtab="module-colors-section">Cores</button>
        <button type="button" class="module-subtab-btn" data-subtab="module-options-section">Modelos (dobradiça/corrediça)</button>
        <button type="button" class="module-subtab-btn" data-subtab="module-image-section">Imagem 3D</button>
        <button type="button" class="module-subtab-btn" data-subtab="module-dimension-presets-section">Medidas sugeridas</button>
        <button type="button" class="module-subtab-btn" data-subtab="pieces-section">Componentes</button>
        <button type="button" class="module-subtab-btn" data-subtab="module-test-calc-section">Teste de cálculo</button>
      </div>

  <!-- DADOS DO MÓDULO (migrado da antiga aba "Módulos": criar/editar/
       duplicar) — mesma aba que "+ Novo módulo" (acima, fora da tira) força
       mostrar mesmo sem nenhum módulo selecionado ainda. -->
  <section class="panel" id="module-form-section" style="display:none;">
    <h2>Dados do módulo</h2>
    <div id="module-form-banner" style="display:none;margin-bottom:10px;padding:10px 12px;background:#f0f0f0;border:1px solid #000;">
      <span id="module-form-banner-text"></span>
      <button type="button" id="module-cancel-edit-btn" class="secondary" style="margin-left:10px;">Cancelar edição / novo módulo</button>
    </div>

    <form id="module-form">
      <input type="hidden" id="module-id" />
      <div class="row">
        <div><label>Nome do módulo</label><input id="module-name" required /></div>
        <div><label>Slug (opcional)</label><input id="module-slug" /></div>
      </div>
      <div class="row">
        <div><label>Família</label><select id="module-family"><option value="">—</option></select></div>
        <div><label>Categoria</label><select id="module-category"><option value="">—</option></select></div>
        <div><label>Subcategoria</label><select id="module-subcategory"><option value="">—</option></select></div>
      </div>
      <!-- Função + montagem (migration 080) — é o que o gerador de projeto
           por IA lê pra saber PRA QUE SERVE este módulo. Módulo sem função
           continua funcionando 100% no fluxo manual; ele só não é oferecido
           pra IA (o portal filtra function_id not null ao montar o catálogo
           que vai no prompt). Gerencie a lista de funções na aba Taxonomia. -->
      <div class="row">
        <div>
          <label>Função (IA)</label>
          <select id="module-function"><option value="">— sem função —</option></select>
        </div>
        <div>
          <label>Montagem</label>
          <select id="module-mount-type">
            <option value="">— não definido —</option>
            <option value="floor">Chão (base, gaveteiro)</option>
            <option value="wall">Suspenso (aéreo)</option>
            <option value="tall">Coluna alta (torre, despenseiro)</option>
          </select>
        </div>
      </div>
      <label>Descrição</label>
      <textarea id="module-description" style="min-height:40px;font-family:inherit;"></textarea>

      <!-- Escape hatch pra regra específica deste módulo, em texto livre —
           vai direto no prompt. Ex: "só usar em cozinha americana",
           "nunca colar na geladeira". Evita criar coluna nova a cada regra. -->
      <label>Instrução extra para a IA (opcional)</label>
      <textarea id="module-ai-hint" style="min-height:34px;font-family:inherit;" placeholder="Ex: sempre ao lado do cooktop; não usar em parede menor que 2000mm"></textarea>

      <div class="row">
        <div><label>Largura mín. (mm)</label><input id="module-width-min" type="number" required /></div>
        <div><label>Largura padrão (mm)</label><input id="module-width-default" type="number" required /></div>
        <div><label>Largura máx. (mm)</label><input id="module-width-max" type="number" required /></div>
      </div>
      <div class="row">
        <div><label>Altura mín. (mm)</label><input id="module-height-min" type="number" required /></div>
        <div><label>Altura padrão (mm)</label><input id="module-height-default" type="number" required /></div>
        <div><label>Altura máx. (mm)</label><input id="module-height-max" type="number" required /></div>
      </div>
      <div class="row">
        <div><label>Profundidade mín. (mm)</label><input id="module-depth-min" type="number" required /></div>
        <div><label>Profundidade padrão (mm)</label><input id="module-depth-default" type="number" required /></div>
        <div><label>Profundidade máx. (mm)</label><input id="module-depth-max" type="number" required /></div>
      </div>

      <label><input type="checkbox" id="module-active" style="width:auto;display:inline-block;" /> Ativo</label>
      <label>
        <input type="checkbox" id="module-invisible" style="width:auto;display:inline-block;" />
        Invisível (não aparece na galeria/listagem do cliente — use pra um módulo que só existe pra ser
        usado como peça aninhada dentro de outro módulo, ex: um modelo de porta ou de gaveta)
      </label>
      <label>
        <input type="checkbox" id="module-decoration" style="width:auto;display:inline-block;" />
        Decorativo (migration 039 — só ambientação 3D: não gera preço, não entra no orçamento do
        cliente e não vai pra produção — fora da lista de corte, de compra e da furação. O cliente vê
        o aviso "item decorativo" no portal. Ex: cama box, TV, eletrodomésticos)
      </label>
      <!-- Afastamento do teto (migration 060, pedido do usuário 2026-07-29) —
           antes era uma regra FIXA de 5" aplicada a TODO módulo no portal do
           cliente (aba Projetos/configurador); agora é opt-in POR módulo:
           sem marcar, o módulo pode ir até o teto (só o rodapé continua
           descontado, sempre); marcando, trava a altura máxima do módulo a
           esta distância mínima do teto. -->
      <label>
        <input type="checkbox" id="module-ceiling-clearance-enabled" style="width:auto;display:inline-block;" />
        Exigir afastamento do teto (trava a altura máxima deste módulo pra não bater no teto — sem
        marcar, o módulo pode ir até o teto, descontando só o rodapé como sempre)
      </label>
      <div class="row">
        <div><label>Afastamento mínimo até o teto (mm)</label><input id="module-ceiling-clearance-mm" type="number" min="0" value="0" /></div>
      </div>
      <button type="submit" id="module-submit-btn">Salvar novo módulo</button>
    </form>
  </section>

  <!-- CORES DO MÓDULO -->
  <section class="panel" id="module-colors-section" style="display:none;">
    <h2>Cores disponíveis para este módulo</h2>
    <p class="hint">Cada papel de cor (Caixa, Porta/Frente, e outros que você criar) tem sua própria lista de cores permitidas — o cliente escolhe uma cor por papel que este módulo realmente usa. Use "Marcar todas"/"Desmarcar todas" pra não precisar clicar cor por cor.</p>
    <div id="module-colors-error" class="error" style="display:none;"></div>
    <div id="module-colors-list"></div>
  </section>

  <!-- OPCIONAIS DO MÓDULO -->
  <section class="panel" id="module-options-section" style="display:none;">
    <h2>Modelos disponíveis para este módulo</h2>
    <div class="row">
      <div>
        <label>Modelos de dobradiça</label>
        <div id="module-hinge-models-list"></div>
      </div>
      <div>
        <label>Modelos de corrediça</label>
        <div id="module-slide-models-list"></div>
      </div>
      <div>
        <label>Corrediças (Itens Comprados)</label>
        <p class="hint" style="margin:0 0 4px 0;">
          Migration 128 — o catálogo de verdade. Cadastre a corrediça em Itens Comprados
          (grupo "Corrediça") com o comprimento do trilho preenchido e marque aqui todas
          as que este módulo pode usar — o motor escolhe sozinho a certa pela profundidade
          real da gaveta.
        </p>
        <div id="module-purchased-slides-list"></div>
      </div>
    </div>
  </section>

  <!-- IMAGEM 3D DO MÓDULO -->
  <section class="panel" id="module-image-section" style="display:none;">
    <h2>Imagem 3D do módulo</h2>
    <p class="hint">
      Gera uma miniatura de verdade (peças/medida padrão deste módulo, na cor que você escolher abaixo) pra
      usar na vitrine do portal, no lugar do ícone genérico. Câmera sempre no MESMO ângulo relativo
      pra todo módulo — padronizado automaticamente, não dá pra girar antes de gerar.
    </p>
    <div class="row" style="align-items:flex-start;">
      <div id="module-image-viewer3d-canvas" style="width:260px;height:260px;flex:0 0 260px;background:#fff;"></div>
      <div style="flex:1;">
        <div id="module-image-error" class="error" style="display:none;"></div>
        <div class="row" id="module-image-color-selects"></div>
        <p class="hint" id="module-image-no-colors-hint" style="display:none;">Este módulo ainda não tem nenhuma cor cadastrada — cadastre uma cor pra poder gerar a imagem.</p>
        <div style="margin-top:10px;">
          <label style="margin-top:0;">Tipo de câmera</label>
          <div class="row" style="gap:16px;margin-top:2px;">
            <label style="display:flex;align-items:center;gap:6px;margin-top:0;width:auto;">
              <input type="radio" name="module-image-projection" id="module-image-projection-perspective" value="perspective" checked style="width:auto;" />
              Perspectiva
            </label>
            <label style="display:flex;align-items:center;gap:6px;margin-top:0;width:auto;">
              <input type="radio" name="module-image-projection" id="module-image-projection-orthographic" value="orthographic" style="width:auto;" />
              Visão paralela (ortográfica)
            </label>
          </div>
          <p class="hint" style="margin-top:2px;">Visão paralela costuma ficar melhor em peças chapadas/ripadas (sem a perspectiva "convergindo" as linhas).</p>
        </div>
        <button type="button" id="generate-module-image-btn" class="secondary" style="margin-top:8px;">Gerar imagem 3D</button>
        <!-- "Gerar imagem de IA" (pedido do usuário, 2026-07-19: "e se
             colocar um 'gerar imagem de ia' e deixar tudo mais bonito no
             site... essa imagem ja leva como referencia quando for usada em
             uma composicao. pra ver os detalhes melhor de cada modulo") —
             pega o print 3D acima (Gerar imagem 3D precisa ter rodado
             primeiro nesta sessão) e manda pro Gemini em modo 'catalog'
             (fundo branco, sem sombra, ver generate-gallery-render/index.ts)
             — vira a nova imagem de vitrine E é salva automaticamente em
             reference_photos (migration 050) como a foto de referência
             deste módulo, pra próxima geração de imagem da Galeria já usar. -->
        <button type="button" id="generate-module-ai-image-btn" class="secondary" style="margin-top:8px;">✨ Gerar imagem de IA</button>
        <p class="hint" id="module-image-status"></p>
        <div>
          <label>Imagem atual (o que aparece na vitrine do portal)</label>
          <img id="module-image-preview" alt="Miniatura do módulo" style="max-width:180px;display:none;border:1px solid #ddd;border-radius:4px;" />
          <p class="hint" id="module-image-empty-hint">Nenhuma imagem gerada ainda — a vitrine mostra o ícone genérico.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- PROFUNDIDADES FIXAS DO MÓDULO — OBSOLETA, ocultada a pedido do usuário
       (permanece sempre display:none, admin.js não alterna mais isso pra
       'block'). Generalizada por "Valores sugeridos de medida"
       (module_dimension_presets, seção logo abaixo), que cobre largura/
       altura/profundidade e, quando o espaço disponível não cabe nem no
       menor valor cadastrado, faz a peça sumir em vez de aparecer "espremida"
       (ver Pricing.isBelowMinLockedPreset). Módulos antigos que já têm
       module_fixed_depths cadastrado continuam funcionando no cálculo/3D —
       pricing.js dá prioridade a isso sobre locked_depth_presets — só não dá
       mais pra editar por aqui. Deixado no HTML (não removido) só pra não
       quebrar nada caso precise reverter. -->
  <section class="panel" id="module-fixed-depths-section" style="display:none;">
    <h2>Profundidades fixas (quando usado como peça aninhada)</h2>
    <p class="hint">
      Se este módulo for usado como peça dentro de outro módulo (ex: um "modelo de gaveta" aninhado),
      ele pode não esticar pra qualquer profundidade — só existir nessas medidas fixas cadastradas aqui
      (ex: corrediças de 300/350/400/450mm). O motor de cálculo escolhe sozinho a MAIOR profundidade
      daqui que caiba no espaço disponível (descontando 40mm de folga do fundo/trilho). Deixe vazio se
      este módulo deve esticar livremente, como qualquer módulo comum.
    </p>
    <div id="module-fixed-depths-error" class="error" style="display:none;"></div>
    <div id="module-fixed-depths-list"></div>
    <div class="row" style="margin-top:8px;align-items:center;">
      <div><input id="module-new-fixed-depth" type="number" min="0" placeholder="Nova profundidade (mm)" /></div>
      <div style="flex:0;"><button type="button" id="module-add-fixed-depth-btn" class="secondary" style="margin-top:0;">+ Adicionar profundidade</button></div>
    </div>
  </section>

  <!-- VALORES SUGERIDOS/TRAVADOS DE MEDIDA (Largura/Altura/Profundidade) —
       módulo de PRIMEIRO NÍVEL, o que o próprio cliente escolhe no portal.
       Diferente da seção acima (profundidades fixas só entram quando ESTE
       módulo é usado como peça aninhada dentro de outro). -->
  <section class="panel" id="module-dimension-presets-section" style="display:none;">
    <h2>Valores sugeridos de medida (Largura / Altura / Profundidade)</h2>
    <p class="hint">
      Cadastre medidas pré-definidas pra facilitar a escolha do cliente no portal — cada uma pode ter um
      Nome e uma Descrição (aparecem pro cliente) e uma Referência (só uso interno, nunca aparece pro
      cliente). Sem marcar "Travar": a régua continua livre entre mín/máx, e essas medidas aparecem como
      botões de atalho abaixo dela. Marcando "Travar": a régua livre some — o cliente escolhe só entre os
      valores cadastrados aqui, numa lista.
    </p>
    <div id="module-dimension-presets-error" class="error" style="display:none;"></div>
    <div id="module-dimension-presets-groups"></div>
  </section>

  <!-- COMPONENTES DO MÓDULO (vínculo) -->
  <section class="panel" id="pieces-section" style="display:none;">
    <h2>Componentes deste módulo</h2>
    <p class="hint">
      Marque quais componentes esse módulo usa. Deixe "quantidade" em branco para usar a quantidade padrão
      do componente, ou preencha um número pra sobrescrever só neste módulo (ex: mesma "Prateleira" com
      quantidade diferente em módulos diferentes). Marque "Cliente escolhe a quantidade" pra deixar o
      cliente escolher quantas peças desse componente ESTE módulo vai ter (ex: 1 a 3 prateleiras aqui,
      2 a 5 num módulo maior) — nesse caso a quantidade fixa acima é ignorada. Marque "Cliente pode
      adicionar/remover (opcional)" pra itens como puxador, rodapé, tampo ou pé — o cliente vê uma
      caixinha de marcar na calculadora e escolhe incluir ou não (pode marcar vários ao mesmo tempo),
      desmarcado por padrão. Se além de opcional você marcar "Vem marcado por padrão", a caixinha já
      nasce marcada (o item já entra), mas o cliente ainda pode desmarcar e tirar. Nada é gravado até
      você clicar em "Salvar" — ajuste tudo à vontade, confira no teste de cálculo logo abaixo, e só
      depois salve.
    </p>
    <p class="hint">
      <strong>Módulo-como-componente:</strong> além de componentes do catálogo, uma peça pode ser OUTRO
      MÓDULO inteiro (ex: um "modelo de porta Shaker" cadastrado como módulo comum, marcado "Invisível"
      pra não aparecer na galeria do cliente). Use "+ Adicionar módulo (peça aninhada)" mais abaixo. Nesse
      caso as fórmulas de largura/altura/profundidade são OBRIGATÓRIAS (o módulo aninhado não tem fórmula
      própria pra herdar) e você escolhe a posição, a cor e o tipo de abertura (gira feito porta, desliza
      feito gaveta, ou nenhuma).
    </p>
    <div id="pieces-error" class="error" style="display:none;"></div>

    <!-- 3D AO VIVO desta aba (26-modulo-pecas-3d.js) — mesmo Viewer3D
         singleton que "Imagem 3D" usa (module-image-viewer3d-canvas, mais
         acima), só que aqui reage aos steppers de posição de cada peça sem
         precisar salvar. Maior que o de "Imagem 3D" (esta é a tela onde o
         admin passa mais tempo ajustando posição peça por peça). -->
    <div id="module-components-viewer3d-canvas" style="width:100%;max-width:520px;height:420px;background:#fff;border:1px solid #e8e4de;border-radius:6px;margin-bottom:14px;"></div>

    <div id="module-components-list"></div>
    <div style="margin-top:14px;display:flex;align-items:center;gap:12px;">
      <button type="button" id="module-components-save-btn" style="margin-top:0;">Salvar componentes deste módulo</button>
      <span id="module-components-save-status" class="hint"></span>
    </div>
  </section>

  <!-- TESTE DE CÁLCULO (conferência interna) — separado da seção de
       Componentes de propósito: são coisas diferentes (o que o módulo usa
       vs. conferir preço/3D com esses componentes), ficava tudo empilhado
       na mesma sub-aba. -->
  <section class="panel" id="module-test-calc-section" style="display:none;">
    <h2>Teste de cálculo (conferência interna)</h2>
    <form id="test-calc-form">
      <div class="row" id="test-calc-color-selects"></div>
      <div class="row">
        <div><label>Modelo de dobradiça</label><select id="test-calc-hinge-model"></select></div>
        <div><label>Modelo de corrediça</label><select id="test-calc-slide-model"></select></div>
      </div>
      <div class="row">
        <div><label>Largura (mm)</label><input id="test-calc-width" type="number" /></div>
        <div><label>Altura (mm)</label><input id="test-calc-height" type="number" /></div>
        <div><label>Profundidade (mm)</label><input id="test-calc-depth" type="number" /></div>
      </div>
      <div id="test-calc-shelf-quantities"></div>
      <div id="test-calc-optionals"></div>
      <button type="submit">Calcular</button>
    </form>
    <div id="test-calc-error" class="error" style="display:none;"></div>
    <div id="test-calc-result"></div>

    <!-- VISUALIZAÇÃO DE FURAÇÃO (migration 038) — desenha cada peça do
         módulo com TODOS os furos que o export .ban geraria com estas
         dimensões de teste: furação padrão do componente + furação por
         toque na lateral + dobradiça automática. -->
    <h3 style="margin-top:20px;">Furação (visualização)</h3>
    <p class="hint">
      Mostra cada peça deitada no plano da máquina com os furos que o arquivo .ban do pedido teria com
      as dimensões/opções de teste acima — incluindo os furos AUTOMÁTICOS: contra-furos propagados
      (furo de borda de uma peça gerando o furo de face na peça que ela encosta) e dobradiça (copo na
      porta + base na lateral). A lateral DIREITA sai espelhada da esquerda. Passe o mouse num furo
      pra ver Ø/profundidade/posição. Peça sem nenhum furo não aparece.
    </p>
    <button type="button" id="module-drilling-preview-btn" class="secondary">Gerar visualização de furação</button>
    <span id="module-drilling-preview-status" class="hint" style="margin-left:10px;"></span>
    <div id="module-drilling-preview-list" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;margin-top:12px;"></div>
  </section>

    </div><!-- /module-config-main-col -->
  </div><!-- /module-config-shell -->

    `;
