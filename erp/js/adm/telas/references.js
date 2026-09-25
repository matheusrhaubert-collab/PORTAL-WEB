/* Tela do painel admin: tab-references
 * Mudou de casa do admin.html para cá quando o ERP virou a única porta
 * de entrada. A PARTIR DAQUI este arquivo é a fonte da verdade do
 * markup desta tela — pode editar à mão à vontade.
 * Os ids são os mesmos de antes, de propósito: o JS do admin continua
 * achando tudo por getElementById. */
ADM_TELAS['tab-references'] = `
      <section class="panel">
        <h2>Referências (fotos reais de módulo)</h2>
        <div id="reference-photos-error" class="error" style="display:none;"></div>
        <p class="hint">Fotos reais de módulos, usadas como referência extra na hora de gerar a imagem de IA da Galeria
          (junto com o 3D da composição) — deixa a imagem gerada tecnicamente mais fiel ao produto real (proporção,
          ferragem, acabamento). Cor não precisa de foto — já é descrita em texto direto no prompt.</p>
        <form id="reference-photo-form">
          <label>Módulo</label>
          <select id="reference-module-select"></select>
          <label>Legenda (opcional)</label>
          <input type="text" id="reference-photo-caption" placeholder="ex.: detalhe do puxador" />
          <label>Foto</label>
          <input type="file" id="reference-photo-file" accept="image/*" />
          <div id="reference-photo-upload-status" class="hint"></div>
          <button type="submit">Enviar referência</button>
        </form>
        <table style="margin-top:16px;">
          <thead>
            <tr>
              <th>Foto</th>
              <th>Módulo</th>
              <th>Legenda</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="reference-photos-tbody"></tbody>
        </table>
      </section>
    `;
