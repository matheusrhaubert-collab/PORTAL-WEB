/* Tela do painel admin: tab-drilling-settings
 * Mudou de casa do admin.html para cá quando o ERP virou a única porta
 * de entrada. A PARTIR DAQUI este arquivo é a fonte da verdade do
 * markup desta tela — pode editar à mão à vontade.
 * Os ids são os mesmos de antes, de propósito: o JS do admin continua
 * achando tudo por getElementById. */
ADM_TELAS['tab-drilling-settings'] = `

  <section class="panel">
    <h2>Furação — contato entre peças (contra-furo)</h2>
    <p class="hint">
      O antigo "padrão global de toque" foi APOSENTADO (migration 043). Agora cada peça padrão
      (Base, Fundo, Travessa...) carrega a própria furação no cadastro do COMPONENTE, e cada furo
      de BORDA pode ter um <strong>contra-furo</strong> (Ø + profundidade, colunas novas na tabela
      de furação do componente): quando aquela borda encosta na face de outra peça no módulo, a
      peça tocada — tipicamente a lateral — recebe o furo de face no ponto exato do contato.
      Deixe o contra-furo em branco pra não propagar. A lateral DIREITA sai automaticamente
      ESPELHADA da esquerda (arquivo .ban próprio). A tolerância de contato é configurada abaixo.
    </p>
  </section>

  <section class="panel">
    <h2>Furação — dobradiça automática e tolerância</h2>
    <p class="hint">
      Peça com "Lado da dobradiça" definido ganha automaticamente o copo + 2 marcações de pré-furo por
      dobradiça — quantidade e posições idênticas às do desenho 3D/preço (2 até 1m de altura, 3 até
      1.4m, 4 até 2m, 5 até 2.5m; margem das extremidades abaixo). Tolerância de toque = folga máxima
      (mm) entre a ponta da peça e a lateral pra ainda contar como contato (peça costuma ser cortada
      1–2mm menor que o vão).
    </p>
    <div id="drilling-settings-error" class="error" style="display:none;"></div>
    <form id="drilling-settings-form">
      <div class="row">
        <div><label>Tolerância de toque (mm)</label><input id="drilling-touch-tolerance" type="number" step="0.1" min="0" required /></div>
        <!-- migration 163: o contra-furo (counter_depth_mm, 22 pro pino na
             BORDA) nunca pode entrar 22 numa FACE de 19.5 — na face vale o
             menor entre o cadastro e este valor. -->
        <div><label>Contra-furo na FACE — prof. máx. (mm)</label><input id="drilling-counter-face-depth" type="number" step="0.5" min="1" required title="Furo do pino (Ø8) que cai na face da lateral quando a borda da base encosta nela. 22 é pra borda; na face 12 não atravessa." /></div>
        <div style="align-self:flex-end;"><label><input id="drilling-hinge-enabled" type="checkbox" style="width:auto;" /> Gerar furação de dobradiça</label></div>
      </div>
      <div class="row">
        <div><label>Copo Ø (mm)</label><input id="drilling-hinge-cup-diameter" type="number" step="0.1" min="1" required /></div>
        <div><label>Copo prof. (mm)</label><input id="drilling-hinge-cup-depth" type="number" step="0.1" min="1" required /></div>
        <div><label>Centro do copo à borda (mm)</label><input id="drilling-hinge-cup-from-edge" type="number" step="0.1" min="1" required /></div>
        <div><label>Margem das extremidades (mm)</label><input id="drilling-hinge-margin" type="number" step="1" min="0" required /></div>
      </div>
      <div class="row">
        <div><label>Marcação Ø (mm)</label><input id="drilling-hinge-mark-diameter" type="number" step="0.1" min="0.5" required /></div>
        <div><label>Marcação prof. (mm)</label><input id="drilling-hinge-mark-depth" type="number" step="0.1" min="0.5" required /></div>
        <div><label>Marcação ± do copo (mm)</label><input id="drilling-hinge-mark-offset" type="number" step="0.1" min="1" required /></div>
        <div><label>Centro da marcação à borda (mm)</label><input id="drilling-hinge-mark-from-edge" type="number" step="0.1" min="1" required /></div>
      </div>
      <!-- BASE DA DOBRADIÇA NA LATERAL (migration 043) — 2 furos por
           dobradiça na lateral do lado da dobradiça, na altura do copo. -->
      <div class="row">
        <div style="align-self:flex-end;"><label><input id="drilling-plate-enabled" type="checkbox" style="width:auto;" /> Furar base da dobradiça na lateral</label></div>
        <div><label>Base Ø (mm)</label><input id="drilling-plate-diameter" type="number" step="0.1" min="0.5" required /></div>
        <div><label>Base prof. (mm)</label><input id="drilling-plate-depth" type="number" step="0.1" min="1" required /></div>
        <div><label>Centro da base à borda frontal (mm)</label><input id="drilling-plate-from-front" type="number" step="0.1" min="1" required /></div>
        <div><label>Distância entre os 2 furos (mm)</label><input id="drilling-plate-spacing" type="number" step="0.1" min="1" required /></div>
      </div>
      <!-- CORREDIÇA UNDERMOUNT (migration 044) — marcação na lateral do módulo:
           fileira de pilotos na altura configurada acima do piso do vão da
           gaveta, distâncias da borda frontal por comprimento de trilho.
           Trilho = profundidade exata da gaveta. Direita sai espelhada. -->
      <div class="row">
        <div style="align-self:flex-end;"><label><input id="drilling-slide-enabled" type="checkbox" style="width:auto;" /> Furar corrediça na lateral</label></div>
        <div><label>Corrediça Ø (mm)</label><input id="drilling-slide-diameter" type="number" step="0.1" min="0.5" required /></div>
        <div><label>Corrediça prof. (mm)</label><input id="drilling-slide-depth" type="number" step="0.1" min="1" required /></div>
        <div><label>Altura acima do piso do vão (mm) — a corrediça fica abaixo do corpo da gaveta</label><input id="drilling-slide-height" type="number" step="0.1" min="1" required /></div>
      </div>
      <div class="row">
        <div style="flex:1;">
          <label>Furos por trilho (comprimento: distâncias da frente; separar trilhos com ";")</label>
          <input id="drilling-slide-holes" placeholder="305:37,165,261; 381:37,165,357; 457:37,165,357; 533:37,165,453" />
        </div>
      </div>
      <!-- SUPORTE DE PRATELEIRA NA LATERAL (migration 045) — peça com
           "Suporte de prateleira" marcado no componente fura a(s) lateral(is)
           que suas pontas encostam: 2 furos por lado, recuos medidos NA
           PRATELEIRA (frente/trás dela), altura = centro da espessura +
           deslocamento vertical. -->
      <div class="row">
        <div style="align-self:flex-end;"><label><input id="drilling-shelf-enabled" type="checkbox" style="width:auto;" /> Furar suporte de prateleira na lateral</label></div>
        <div><label>Suporte Ø (mm)</label><input id="drilling-shelf-diameter" type="number" step="0.1" min="0.5" required /></div>
        <div><label>Suporte prof. (mm)</label><input id="drilling-shelf-depth" type="number" step="0.1" min="1" required /></div>
        <div><label>Recuo da frente da prateleira (mm)</label><input id="drilling-shelf-front" type="number" step="0.1" min="1" required /></div>
        <div><label>Recuo de trás da prateleira (mm)</label><input id="drilling-shelf-back" type="number" step="0.1" min="1" required /></div>
        <div><label>Ajuste vertical do centro (mm, + pra cima)</label><input id="drilling-shelf-voffset" type="number" step="0.1" required /></div>
      </div>
      <p class="hint" style="margin-top:4px;">
        Vale pra peças com <strong>"Recebe suporte de prateleira"</strong> marcado no formulário do
        componente. O furo sai na lateral que a ponta da prateleira encosta (tolerância de toque acima),
        na altura do centro da espessura da prateleira — em cada posição/quantidade que ela tiver no módulo.
      </p>
      <button type="submit" style="margin-top:8px;">Salvar configurações</button>
      <span id="drilling-settings-status" class="hint" style="margin-left:10px;"></span>
    </form>
  </section>

    `;
