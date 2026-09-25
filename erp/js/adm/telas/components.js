/* Tela do painel admin: tab-components
 *
 * REORGANIZADA em 2026-08-10 a pedido do Matt ("bem confuso, desorganizado,
 * muito texto miúdo... não rode tanto pra baixo, bem visual, informações
 * separadas por tipo"). O que mudou de FORMA — nada de comportamento:
 *
 *   1. Três colunas: árvore de pastas | formulário | desenho grudado.
 *      O desenho ficava lá no fim; era ele que obrigava a rolar pra ver o
 *      efeito de um campo e rolar de volta pra corrigir.
 *   2. Seções <details>/<summary> em vez de uma coluna infinita. Nativo:
 *      sem JS de estado, sem "abriu duas", funciona no teclado.
 *   3. Os parágrafos cinzentos viraram "?" ao lado do campo. O texto continua
 *      inteiro — várias daquelas explicações registram decisão que custou
 *      caro (o cabide não usar 0/2/4, o pé com altura fixa, o contra-furo
 *      reverso) e apagar seria jogar fora conhecimento, não sujeira.
 *
 * REGRA AO MEXER AQUI: **todos os ids são intocáveis**. O JS do admin
 * (erp/js/adm/09-componentes.js) registra listener por getElementById no
 * topo do arquivo — id renomeado não dá erro, só para de funcionar em
 * silêncio. Pode mover, agrupar e reestilizar à vontade; renomear, não.
 *
 * A árvore (migration 089) é montada por erp/js/adm/23-pastas-componentes.js.
 */
ADM_TELAS['tab-components'] = `

  <section class="panel">
    <div id="components-error" class="error" style="display:none;"></div>

    <div class="cad-grid">

      <!-- ============ coluna 1: árvore de pastas (migration 089) ============ -->
      <aside class="cad-tree">
        <div class="cad-tree-head">
          <input type="search" id="component-tree-search" placeholder="Buscar componente…" autocomplete="off">
          <div class="cad-tree-actions">
            <button type="button" class="secondary" id="component-folder-new-btn" title="Cria uma pasta dentro da selecionada">+ Pasta</button>
            <button type="button" class="secondary" id="component-new-btn">+ Componente</button>
          </div>
        </div>
        <div class="cad-tree-body" id="component-tree"></div>
      </aside>

      <!-- ============ coluna 2: formulário ============ -->
      <div class="cad-main">
        <form id="component-form">
          <input type="hidden" id="component-id" />

          <div class="cad-bar">
            <div class="titulo" id="component-form-title">Novo componente
              <small id="component-form-sub">Preencha e salve — ele fica disponível pra todos os módulos.</small>
            </div>
            <button type="button" id="component-cancel-edit-btn" class="secondary">Cancelar</button>
            <button type="submit" id="component-submit-btn">Salvar novo componente</button>
          </div>

          <!-- Banner antigo: continua no DOM porque setComponentFormMode
               escreve nele, mas escondido — quem avisa agora é a barra acima. -->
          <div id="component-form-banner" style="display:none;">
            <strong id="component-form-banner-ref"></strong>
          </div>

          <!-- ---------------- Identificação ---------------- -->
          <details class="cad-sec" open>
            <summary>Identificação</summary>
            <div class="cad-sec-body">
              <div class="cad-campos">
                <div class="cad-campo">
                  <label>Tipo
                    <span class="cad-q"><button type="button" class="cad-q-btn">?</button><span class="cad-q-txt">
                      O tipo decide o <strong>papel de cor</strong> (caixa, porta, painel) e o
                      <strong>posicionamento</strong> (qual eixo da peça é a espessura). Não é só etiqueta:
                      mudar o tipo muda como a peça é desenhada e qual cor ela puxa.
                    </span></span>
                  </label>
                  <select id="component-type" required></select>
                </div>
                <div class="cad-campo">
                  <label>Referência</label>
                  <input id="component-reference" required />
                </div>
                <div class="cad-campo">
                  <label>Quantidade padrão
                    <span class="cad-q"><button type="button" class="cad-q-btn">?</button><span class="cad-q-txt">
                      Quantas unidades desta peça um módulo usa por padrão. Cada módulo pode
                      sobrescrever. "Cliente escolhe a quantidade" (ex: quantas prateleiras) NÃO é
                      configurado aqui — o mesmo componente serve em módulos de tamanhos bem
                      diferentes, então esse intervalo é por módulo, em "Componentes deste módulo".
                    </span></span>
                  </label>
                  <input id="component-quantity" type="number" min="1" required />
                </div>
              </div>
              <div class="cad-campos duas" style="margin-top:10px">
                <div class="cad-campo">
                  <label>Descrição</label>
                  <input id="component-notes" />
                </div>
                <div class="cad-campo">
                  <label>Origem
                    <span class="cad-q"><button type="button" class="cad-q-btn">?</button><span class="cad-q-txt">
                      Decide se a peça entra na <strong>Lista de peças</strong> (corte) ou na
                      <strong>Lista de compra</strong>. Use "Comprado" pra puxador, pé, ferragem e
                      qualquer item que não seja cortado de chapa.
                    </span></span>
                  </label>
                  <select id="component-origin">
                    <option value="fabricacao">Fabricação (cortado de chapa)</option>
                    <option value="comprado">Comprado (pronto)</option>
                  </select>
                </div>
                <!-- Item comprado (migration 119) — só aparece com Origem="Comprado". Sem
                     isso escolhido, o preço continua saindo da mão de obra antiga (comportamento
                     de antes da 119); com um item escolhido, o preço vira o preço de COMPRA dele.
                     Matt, 2026-08-18: "nao estou conseguindo colocar as corredicas la dos itens
                     comprados nos componentes da gaveta" — o campo nunca tinha sido criado; só o
                     vínculo no banco (components.purchased_item_id) e a leitura em pricing.js
                     existiam. O "pé de plástico 4½" (migration 120) foi ligado por SQL direto,
                     não por aqui — é exatamente o buraco que este campo fecha. -->
                <div class="cad-campo" id="component-purchased-item-wrap" style="display:none;">
                  <label>Item comprado
                    <span class="cad-q"><button type="button" class="cad-q-btn">?</button><span class="cad-q-txt">
                      Qual item do cadastro "Itens comprados" (Engenharia) dá o PREÇO desta peça.
                      Vazio = o preço continua saindo da mão de obra escolhida acima (jeito antigo).
                      Precisa existir lá primeiro — se não aparecer na lista, cadastre o item
                      comprado antes (ex: a corrediça de cada profundidade).
                    </span></span>
                  </label>
                  <select id="component-purchased-item"><option value="">— nenhum (preço vem da mão de obra) —</option></select>
                </div>
                <!-- Kit de suporte (migration 129) — item comprado SECUNDÁRIO que "vai
                     junto" com o item comprado principal (ex: kit suporte de um cabide).
                     Só faz sentido com "Item comprado" acima preenchido também; opcional
                     em qualquer outro caso (pé, puxador, corrediça... continuam sem isso). -->
                <div class="cad-campo" id="component-support-purchased-item-wrap" style="display:none;">
                  <label>Kit de suporte (opcional)
                    <span class="cad-q"><button type="button" class="cad-q-btn">?</button><span class="cad-q-txt">
                      Item comprado SECUNDÁRIO que entra junto com o item comprado acima, sempre na
                      mesma peça (ex: cabide tubular + kit suporte de fixação). Vazio = nenhum kit
                      extra, comportamento de qualquer peça comprada comum.
                    </span></span>
                  </label>
                  <select id="component-support-purchased-item"><option value="">— nenhum (sem kit de suporte) —</option></select>
                </div>
                <div class="cad-campo" id="component-support-purchased-item-qty-wrap" style="display:none;">
                  <label>Quantidade de kits
                    <span class="cad-q"><button type="button" class="cad-q-btn">?</button><span class="cad-q-txt">
                      Quantos kits de suporte por peça — fixo, não escala com o comprimento (ex:
                      cabide: sempre 1 kit, qualquer que seja o tamanho da vara).
                    </span></span>
                  </label>
                  <input type="number" id="component-support-purchased-item-qty" value="1" min="0" step="1">
                </div>
                <div class="cad-campo">
                  <label>Pasta
                    <span class="cad-q"><button type="button" class="cad-q-btn">?</button><span class="cad-q-txt">
                      Só arrumação na árvore da esquerda (migration 089). Não entra em preço, furação
                      nem no 3D — por isso pode ser livre. Também dá pra arrastar o componente pra
                      dentro de uma pasta direto na árvore.
                    </span></span>
                  </label>
                  <select id="component-folder"><option value="">— Sem pasta —</option></select>
                </div>
              </div>
            </div>
          </details>

          <!-- ---------------- Medidas e custo ---------------- -->
          <details class="cad-sec" open>
            <summary>Medidas e custo <span class="sub">fórmulas em W, H, D do módulo</span></summary>
            <div class="cad-sec-body">
              <p class="cad-campo" style="margin:0 0 10px;font-size:11.5px;color:#8a8378;line-height:1.5">
                <strong>W, H, D</strong> = largura/altura/profundidade do módulo escolhidas pelo cliente.
                <strong>w, h, d</strong> (minúsculo) = medidas já calculadas <em>desta</em> peça, e só valem
                na fórmula de área. Ex: largura <code>W-36</code>, área <code>w*h/1000000</code>.
              </p>
              <div class="cad-campos">
                <div class="cad-campo"><label>Fórmula largura</label><input id="component-width-formula" required /></div>
                <div class="cad-campo"><label>Fórmula altura</label><input id="component-height-formula" required /></div>
                <div class="cad-campo"><label>Fórmula profundidade</label><input id="component-depth-formula" required /></div>
              </div>
              <div class="cad-campos duas" style="margin-top:10px">
                <div class="cad-campo"><label>Fórmula área m²</label><input id="component-area-formula" required /></div>
                <div class="cad-campo">
                  <label>Mão de obra
                    <span class="cad-q"><button type="button" class="cad-q-btn">?</button><span class="cad-q-txt">
                      Catálogo de preço por unidade — apesar do nome, é onde também moram pé,
                      dobradiça, corrediça, LED e as ponteiras do cabide.
                    </span></span>
                  </label>
                  <!-- SEM required (2026-08-23): existem componentes de verdade já
                       salvos com labor_type_id NULL (ex: "Flatbord 4L" — mão de obra
                       dele vem de outro lugar, não deste catálogo por-unidade). Com
                       required aqui, o form barrava em silêncio (checkValidity()
                       falha, sem NENHUM erro visível pro usuário — o campo mora
                       dentro de um <details> recolhido) qualquer tentativa de salvar
                       um componente assim, mesmo reabrindo e salvando ele MESMO sem
                       mudar nada. Descoberto tentando duplicar o Flatbord 4L pra
                       corrigir o veio da porta/frente (ver components-veio no mesmo
                       commit) — o Salvar não fazia nada, sem pista nenhuma do porquê. -->
                  <select id="component-labor-type"></select>
                </div>
              </div>
            </div>
          </details>

          <!-- ---------------- Fita de borda (migration 088) ---------------- -->
          <details class="cad-sec" open>
            <summary>Fita de borda <span class="sub" id="component-edge-sub"></span></summary>
            <div class="cad-sec-body">
              <div class="cad-campos duas">
                <div class="cad-campo">
                  <label>Onde leva fita
                    <span class="cad-q"><button type="button" class="cad-q-btn">?</button><span class="cad-q-txt">
                      Pra fábrica a peça é sempre <strong>espessura × comprimento × largura</strong> —
                      é assim que ela é cortada, furada e fitada. Nesse plano só existem 4 receitas, e
                      a metragem sai calculada do tamanho real da peça: ninguém digita fórmula.
                      Quando a peça entra no móvel ela é rotacionada, mas a receita não muda — só muda
                      qual face do 3D recebe a fita.<br><br>
                      <strong>1 comprimento</strong> (migration 145) é pra peça que nasce PARTIDA ao
                      meio de uma chapa mais larga já fitada nos dois lados antes de partir — ela sai
                      com fita só de UM lado (o outro é o corte novo, sem fita). Ex: Flatbord 1C/Ripa.<br><br>
                      <strong>Cabide tubular</strong> é a exceção: deixe em "Pela fórmula antiga". Um
                      tubo não tem borda de chapa, e a fórmula ali não é fita, é o comprimento cobrado
                      por metro — escolher 0/1/2/4 zeraria o preço dele.
                    </span></span>
                  </label>
                  <select id="component-edge-banding">
                    <option value="">Pela fórmula antiga (não recomendado)</option>
                    <option value="0">Sem fita</option>
                    <option value="1">1 lado — um comprimento</option>
                    <option value="2">2 lados — os dois comprimentos</option>
                    <option value="4">4 lados</option>
                  </select>
                  <span class="calc" id="component-edge-hint"></span>
                </div>
                <div class="cad-campo" id="component-edge-formula-wrap">
                  <label>Fórmula fita (metro linear)</label>
                  <input id="component-edge-formula" required />
                </div>
              </div>
            </div>
          </details>

          <!-- ---------------- Posição e desenho 3D ---------------- -->
          <details class="cad-sec">
            <summary>Posição e desenho 3D <span class="sub">não afeta preço</span></summary>
            <div class="cad-sec-body">
              <div class="cad-campos duas">
                <div class="cad-campo">
                  <label>Posição no módulo
                    <span class="cad-q"><button type="button" class="cad-q-btn">?</button><span class="cad-q-txt">
                      Onde a peça fica dentro do volume do módulo — só o desenho 3D usa, não muda
                      preço. "Outro/interno" não desenha.<br><br>
                      <strong>Pé</strong>: cadastre a altura como número fixo (ex: <code>114</code>) — é
                      quanto o pé levanta o móvel; o corpo sobe sozinho no 3D. Quantidade normalmente
                      <code>4</code>.<br>
                      <strong>Puxador</strong>: quantidade igual ao nº de portas/gavetas; fica
                      distribuído na frente.<br>
                      <strong>Rodapé</strong>: altura igual à do pé, largura <code>W</code>.<br>
                      <strong>Tampo</strong>: pode ter folga (<code>W+40</code>, <code>D+40</code>) pra
                      simular o beiral.<br><br>
                      Pé, Puxador, Rodapé e Tampo costumam ser marcados como "Cliente pode
                      adicionar/remover" em "Componentes deste módulo" — são extras, não peças
                      obrigatórias.
                    </span></span>
                  </label>
                  <select id="component-position-role" required>
                    <option value="left">Lateral esquerda</option>
                    <option value="right">Lateral direita</option>
                    <option value="top">Topo</option>
                    <option value="bottom">Base</option>
                    <option value="back">Fundo</option>
                    <option value="front">Frente / porta</option>
                    <option value="shelf">Prateleira interna</option>
                    <option value="drawer">Gaveta</option>
                    <option value="drawer_side">Lateral de gaveta</option>
                    <option value="leg">Pé</option>
                    <option value="handle">Puxador</option>
                    <option value="baseboard">Rodapé</option>
                    <option value="countertop">Tampo</option>
                    <option value="free" selected>Peça livre (posição só por X/Y/Z)</option>
                    <option value="other">Outro / interno (não desenha)</option>
                  </select>
                </div>
                <div class="cad-campo">
                  <label>Formato
                    <span class="cad-q"><button type="button" class="cad-q-btn">?</button><span class="cad-q-txt">
                      Só muda a geometria do 3D. "Cabide tubular oval" só funciona de verdade com
                      Posição = "Peça livre" (tubo com suportes nas pontas; comprimento = fórmula
                      largura). Preço do cabide (migration 129): Origem = "Comprado" + Item
                      comprado = um item com unidade "m" (ex: "Cabide (metro)") — cobra pelo
                      comprimento real da peça, não por fita de borda. Kit de suporte (campo logo
                      acima) soma o preço da mão-francesa, sempre 1 por peça. Área e fórmula fita
                      ficam em <code>0</code> (não é chapa, e evita cobrar fita E item comprado ao
                      mesmo tempo).
                    </span></span>
                  </label>
                  <select id="component-shape-type">
                    <option value="box" selected>Caixa (padrão)</option>
                    <option value="oval_rod">Cabide tubular oval</option>
                  </select>
                </div>
                <div class="cad-campo">
                  <label>Inclinação (graus)
                    <span class="cad-q"><button type="button" class="cad-q-btn">?</button><span class="cad-q-txt">
                      Só o desenho 3D — não muda preço nem furação. A peça gira em torno do próprio
                      centro, sem afetar como é posicionada. Positivo = frente mais baixa que o fundo
                      (sapateira). 0 = reta.
                    </span></span>
                  </label>
                  <input type="number" id="component-tilt-angle" value="0" step="1" min="-60" max="60">
                </div>
                <div class="cad-campo">
                  <label>Giro de canto (graus)
                    <span class="cad-q"><button type="button" class="cad-q-btn">?</button><span class="cad-q-txt">
                      Troca largura por profundidade na hora de posicionar (módulo em L, ex: closet
                      virando a esquina). Só funciona de verdade com Posição = "Peça livre"; nas
                      outras fica gravado sem efeito. Não muda preço nem furação.
                    </span></span>
                  </label>
                  <select id="component-rotation-y">
                    <option value="0" selected>0° (reto)</option>
                    <option value="90">90°</option>
                    <option value="180">180°</option>
                    <option value="270">270°</option>
                  </select>
                </div>
                <div class="cad-campo">
                  <label>Lado da dobradiça
                    <span class="cad-q"><button type="button" class="cad-q-btn">?</button><span class="cad-q-txt">
                      Só relevante com Posição = "Frente / porta": de que lado a porta gira no botão
                      "Abrir portas" do 3D. Não afeta preço.
                    </span></span>
                  </label>
                  <select id="component-hinge-side">
                    <option value="none">Não abre (frente fixa)</option>
                    <option value="left">Esquerda</option>
                    <option value="right">Direita</option>
                  </select>
                </div>
                <div class="cad-campo">
                  <label>Veio (sentido da textura)
                    <span class="cad-q"><button type="button" class="cad-q-btn">?</button><span class="cad-q-txt">
                      Sentido da veia de madeira no desenho 3D. Manda ACIMA de qualquer regra de
                      formato ou posição — "exigência estética", mesma regra do Construtor. "Livre"
                      deixa o FORMATO da peça decidir sozinho (regra do lado longo, usada em fundo,
                      travessa, divisória). "Horizontal" / "Vertical" TRAVA o sentido, não importa a
                      largura da peça.<br><br>
                      Use em componente de porta/frente de gaveta: a veia de porta/frente é sempre
                      <strong>vertical</strong>, mesmo numa peça larga e baixa (regra que hoje só a
                      Posição "Frente / porta" aplicava sozinha — este campo deixa travar o mesmo
                      resultado em qualquer peça, inclusive uma peça genérica reaproveitada dentro de
                      um módulo aninhado de porta/frente).
                    </span></span>
                  </label>
                  <select id="component-veio">
                    <option value="livre" selected>Livre (decide pelo formato)</option>
                    <option value="horizontal">Horizontal (travado)</option>
                    <option value="vertical">Vertical (travado)</option>
                  </select>
                </div>
              </div>

              <label class="cad-check" style="margin-top:12px">
                <input id="component-shelf-support" type="checkbox" /> Recebe suporte de prateleira
                <span class="cad-q"><button type="button" class="cad-q-btn">?</button><span class="cad-q-txt">
                  Marcado: as laterais em que as pontas desta peça encostam recebem automaticamente os
                  furos-piloto do suporte (Ø/prof./recuos na aba <strong>Furação</strong>), na altura
                  exata em que a peça fica em cada módulo. Use em prateleiras. Não afeta preço.
                </span></span>
              </label>
            </div>
          </details>

          <!-- ---------------- Furação padrão (migration 038) ---------------- -->
          <details class="cad-sec" id="component-drilling-section">
            <summary>Furação padrão <span class="sub" id="component-drilling-sub"></span></summary>
            <div class="cad-sec-body">
              <p style="margin:0 0 8px;font-size:11.5px;color:#8a8378;line-height:1.5">
                Furos executados em toda peça deste componente (arquivo .ban). Coordenadas no plano da
                peça <strong>como ela é cadastrada</strong>: X ao longo da primeira face, Y da segunda.
                Fórmulas aceitam <code>C</code>, <code>L</code> e <code>E</code> (espessura).
                <span class="cad-q"><button type="button" class="cad-q-btn">?</button><span class="cad-q-txt">
                  Se a peça precisar girar 90° pra deitar com o lado maior na horizontal no corte, o
                  padrão de furos <strong>gira junto</strong> (as distâncias dos cantos são
                  preservadas). Pra fileiras (system 32) use Repetições + Passo (ex: 8 repetições,
                  passo Y <code>32</code>).<br><br>
                  <strong>Contra-furo em furo de BORDA</strong>: a peça que essa borda encosta (ex: a
                  lateral) recebe automaticamente o furo de face no ponto exato do contato. Em branco
                  = não propaga.<br><br>
                  <strong>Em furo de FACE é o contrário</strong>: a peça EM PÉ apoiada nessa face
                  recebe um furo entrando pela borda dela (cavilha Ø8 / canal do bolt minifix) — e, se
                  preencher <strong>Copo</strong> Ø/prof./dist., ganha o tambor minifix na face dela
                  (ex: Ø12 × 13, a 34mm da borda), entrando pela face voltada pro interior.<br><br>
                  A furação de <strong>dobradiça</strong> continua automática (aba Furação), incluindo
                  a base na lateral.
                </span></span>
              </p>
              <div id="component-drilling-error" class="error" style="display:none;"></div>
              <!-- Conferência automática (2026-08-11). O Matt: "a princípio não
                   existe minifix sem contra-furo". Achamos 3 defeitos olhando o
                   banco à mão — profundidade 10 no lugar de 13 repetida em 5
                   peças, e furo de borda sem contra em outras 2. Defeito de
                   furação não aparece na tela, aparece na máquina; esta caixa
                   traz a conferência pra onde o furo é criado. -->
              <div id="component-drilling-avisos"></div>
              <div style="overflow:auto">
                <table>
                  <thead>
                    <tr><th>Sentido</th><th>X</th><th>Y</th><th>Ø</th><th>Prof.</th><th>Rep.</th><th>Passo X</th><th>Passo Y</th><th>Contra Ø</th><th>Contra prof.</th><th>Copo Ø</th><th>Copo prof.</th><th>Copo dist.</th><th>Obs.</th><th></th></tr>
                  </thead>
                  <tbody id="component-drilling-tbody"></tbody>
                </table>
              </div>
              <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:8px">
                <button type="button" id="component-drilling-add-btn" class="secondary" style="margin:0">+ Adicionar furo</button>
                <label style="display:inline;font-size:11.5px;color:#8a8378">Copiar de:</label>
                <select id="component-drilling-copy-select" style="width:auto;display:inline-block;margin:0"><option value="">— componente —</option></select>
                <button type="button" id="component-drilling-copy-btn" class="secondary" style="margin:0">Copiar</button>
                <span style="font-size:11px;color:#8a8378">Os furos salvam junto com o componente. "Copiar" ADICIONA aos que já estão na lista.</span>
              </div>
            </div>
          </details>

          <!-- ---------------- Prévia de custo ---------------- -->
          <details class="cad-sec">
            <summary>Prévia de custo <span class="sub">usa as medidas de teste ao lado</span></summary>
            <div class="cad-sec-body">
              <div id="component-preview-result" class="hint"></div>
            </div>
          </details>
        </form>
      </div>

      <!-- ============ coluna 3: desenho, sempre visível ============ -->
      <aside class="cad-view" id="component-preview">
        <div class="cad-view-box">
          <h3>Medidas de teste</h3>
          <p class="meta">Não são gravadas — servem só pra resolver as fórmulas e desenhar.</p>
          <div class="cad-campos">
            <div class="cad-campo"><label>Largura</label><input id="component-preview-width" type="number" value="800" /></div>
            <div class="cad-campo"><label>Altura</label><input id="component-preview-height" type="number" value="2000" /></div>
            <div class="cad-campo"><label>Profundidade</label><input id="component-preview-depth" type="number" value="560" /></div>
            <div class="cad-campo"><label>Cor</label><select id="component-preview-color"></select></div>
          </div>
        </div>

        <!-- Duas vistas porque são duas perguntas: ONDE FURA (peça deitada no
             plano da máquina) e COMO FICA (peça em pé, no móvel). -->
        <div class="cad-view-box">
          <h3>Onde fura — peça deitada</h3>
          <p class="meta" id="component-drilling-preview-meta"></p>
          <div id="component-drilling-preview"></div>
        </div>

        <div class="cad-view-box">
          <h3>Como fica — peça em pé</h3>
          <p class="meta" id="component-3d-meta"></p>
          <div id="component-3d-preview"
               style="height:280px;border:1px solid #eee;border-radius:6px;background:#fff;position:relative;overflow:hidden;"></div>
          <p class="legenda" id="component-3d-legend"></p>
        </div>
      </aside>

    </div>
  </section>

    `;
