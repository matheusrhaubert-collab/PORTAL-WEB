/* Tela do painel admin: tab-taxonomy
 * Mudou de casa do admin.html para cá quando o ERP virou a única porta
 * de entrada. A PARTIR DAQUI este arquivo é a fonte da verdade do
 * markup desta tela — pode editar à mão à vontade.
 * Os ids são os mesmos de antes, de propósito: o JS do admin continua
 * achando tudo por getElementById. */
ADM_TELAS['tab-taxonomy'] = `

  <!-- TAXONOMIA -->
  <section class="panel">
    <h2>Taxonomia dos módulos</h2>
    <p class="hint">Família (Kitchens, Vanities, Closets...), Categoria (Base, Wall...), Subcategoria (Doors, Open, Drawers...).</p>
    <div id="taxonomy-error" class="error" style="display:none;"></div>
    <div class="row">
      <div>
        <h2 style="font-size:14px;">Famílias</h2>
        <table>
          <thead><tr><th>Nome</th><th>Margem</th><th></th></tr></thead>
          <tbody id="families-tbody"></tbody>
        </table>
        <form id="family-form" class="row" style="margin-top:8px;align-items:flex-end;">
          <input type="hidden" id="family-id" />
          <div><input id="family-name" placeholder="Nome da família" required /></div>
          <!-- Margem por família (migration 070) — "Padrão" (value vazio =
               null) usa pricing_settings.markup_multiplier, igual sempre;
               os outros vêm do catálogo "Margens" na aba Margem de preço.
               Ver marginProfileLabel/populateMarginProfileSelects em admin.js. -->
          <div><label style="font-size:11px;">Margem</label><select id="family-margin-profile"><option value="">Padrão</option></select></div>
          <div style="flex:0;"><button type="submit" style="margin-top:0;">+</button></div>
        </form>
      </div>
      <div>
        <h2 style="font-size:14px;">Categorias</h2>
        <table>
          <thead><tr><th>Nome</th><th>Margem</th><th></th></tr></thead>
          <tbody id="categories-tbody"></tbody>
        </table>
        <form id="category-form" class="row" style="margin-top:8px;align-items:flex-end;">
          <input type="hidden" id="category-id" />
          <div><input id="category-name" placeholder="Nome da categoria" required /></div>
          <!-- CATEGORIA tem prioridade sobre família quando as duas têm
               margem vinculada (módulo mais específico vence) — ver
               resolveMarkupMultiplierForModule em portal.js/admin.js. -->
          <div><label style="font-size:11px;">Margem</label><select id="category-margin-profile"><option value="">Padrão</option></select></div>
          <div style="flex:0;"><button type="submit" style="margin-top:0;">+</button></div>
        </form>
      </div>
      <div>
        <h2 style="font-size:14px;">Subcategorias</h2>
        <table><tbody id="subcategories-tbody"></tbody></table>
        <form id="subcategory-form" class="row" style="margin-top:8px;">
          <input type="hidden" id="subcategory-id" />
          <div><input id="subcategory-name" placeholder="Nome da subcategoria" required /></div>
          <div style="flex:0;"><button type="submit" style="margin-top:0;">+</button></div>
        </form>
      </div>
    </div>
  </section>

  <!-- FUNÇÕES DO MÓDULO + RECEITA DO AMBIENTE (migration 080) -->
  <section class="panel">
    <h2>Funções e receitas de ambiente (IA)</h2>
    <p class="hint">
      Isto é o cérebro do "Gerar projeto com IA" na aba Projetos do portal. <strong>Função</strong> é o que o módulo
      faz (base de pia, cooktop, gaveteiro, aéreo...) — você marca uma em cada módulo, na aba Módulos.
      <strong>Receita</strong> é a checklist do ambiente: quantos de cada função uma cozinha precisa ter pra estar
      completa. A IA escolhe qual módulo concreto cumpre cada função; quem confere se o ambiente ficou completo é o
      portal, lendo esta receita — se faltar uma função obrigatória, ele completa sozinho. Ou seja: mudar a regra
      aqui muda o comportamento da IA, sem mexer em código.
    </p>
    <div id="room-ai-error" class="error" style="display:none;"></div>

    <div class="row">
      <div style="flex:1.2;">
        <h2 style="font-size:14px;">Funções</h2>
        <table>
          <thead><tr><th>Chave</th><th>Nome</th><th>Montagem</th><th></th></tr></thead>
          <tbody id="module-functions-tbody"></tbody>
        </table>
        <form id="module-function-form" style="margin-top:8px;">
          <input type="hidden" id="module-function-id" />
          <div class="row" style="align-items:flex-end;">
            <div>
              <label style="font-size:11px;">Chave (sem espaço, não editável depois)</label>
              <input id="module-function-key" placeholder="ex: wine_cooler" required />
            </div>
            <div><label style="font-size:11px;">Nome</label><input id="module-function-name" placeholder="ex: Adega" required /></div>
            <div>
              <label style="font-size:11px;">Montagem sugerida</label>
              <select id="module-function-mount">
                <option value="">—</option>
                <option value="floor">Chão</option>
                <option value="wall">Suspenso</option>
                <option value="tall">Coluna alta</option>
              </select>
            </div>
          </div>
          <label style="font-size:11px;">Descrição (é o que a IA lê — escreva pensando nela)</label>
          <textarea id="module-function-description" style="min-height:34px;font-family:inherit;" placeholder="ex: Nicho climatizado para garrafas. Nunca ao lado do fogão."></textarea>
          <button type="submit" style="margin-top:0;">Salvar função</button>
        </form>
      </div>

      <div style="flex:1.4;">
        <h2 style="font-size:14px;">Receita do ambiente</h2>
        <div class="row" style="align-items:flex-end;">
          <div>
            <label style="font-size:11px;">Ambiente</label>
            <select id="room-type-select"></select>
          </div>
        </div>
        <table style="margin-top:8px;">
          <thead>
            <tr><th>Função</th><th title="Quantidade mínima — 1 ou mais torna a função obrigatória">Mín</th><th title="Vazio = sem limite">Máx</th><th title="Maior entra primeiro quando a parede não comporta tudo">Prior.</th><th></th></tr>
          </thead>
          <tbody id="room-recipes-tbody"></tbody>
        </table>
        <form id="room-recipe-form" style="margin-top:8px;">
          <input type="hidden" id="room-recipe-id" />
          <div class="row" style="align-items:flex-end;">
            <div><label style="font-size:11px;">Função</label><select id="room-recipe-function" required></select></div>
            <div style="flex:0.4;"><label style="font-size:11px;">Mín</label><input id="room-recipe-min" type="number" min="0" value="0" /></div>
            <div style="flex:0.4;"><label style="font-size:11px;">Máx</label><input id="room-recipe-max" type="number" min="0" placeholder="∞" /></div>
            <div style="flex:0.4;"><label style="font-size:11px;">Prior.</label><input id="room-recipe-priority" type="number" value="0" /></div>
          </div>
          <label style="font-size:11px;">Dica de posição (vai no prompt como está)</label>
          <input id="room-recipe-note" placeholder="ex: afastado da pia e da geladeira" />
          <button type="submit" style="margin-top:0;">Salvar linha da receita</button>
        </form>
      </div>
    </div>
  </section>

    `;
