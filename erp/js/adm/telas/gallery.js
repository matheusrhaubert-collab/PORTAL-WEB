/* Tela do painel admin: tab-gallery
 * Mudou de casa do admin.html para cá quando o ERP virou a única porta
 * de entrada. A PARTIR DAQUI este arquivo é a fonte da verdade do
 * markup desta tela — pode editar à mão à vontade.
 * Os ids são os mesmos de antes, de propósito: o JS do admin continua
 * achando tudo por getElementById. */
ADM_TELAS['tab-gallery'] = `
      <section class="panel">
        <h2>Galeria — moderação</h2>
        <div id="gallery-admin-error" class="error" style="display:none;"></div>
        <p class="hint">Aprovar libera o post pra galeria pública do portal (aba "Galeria"). Preço de custo e autor real
          nunca aparecem pro cliente — só aqui, pra referência/apresentações.</p>

        <!-- Migration 055 (pedido do usuário: "gallery muito lenta pra abrir")
             — posts publicados a partir de agora já sobem a imagem pro
             Storage sozinhos (ver uploadGalleryImageToStorage em portal.js).
             Este botão só converte os posts ANTIGOS que ainda têm a imagem
             inteira em base64 na coluna ai_image_data_url — roda na própria
             sessão logada do admin, não precisa de service_role key. Seguro
             clicar de novo (idempotente: só pega quem ainda começa com
             "data:"). -->
        <div style="margin-bottom:14px; display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          <button type="button" id="gallery-migrate-storage-btn" class="secondary" style="margin-top:0;">Migrar imagens antigas pro Storage</button>
          <span id="gallery-migrate-storage-status" class="hint"></span>
        </div>

        <!-- Recalcular Galeria (pedido do usuário 2026-08-02: "preciso um
             botao recalcular galeria... buscando a margem de cada
             cliente"). Recalcula price_sale/price_cost de TODOS os posts a
             partir do snapshot salvo em slots (mesma reprecificação usada
             em computeProjectSlotsTotal, portal.js) — corrige valores que
             ficaram desatualizados depois que o post foi publicado (preço
             de módulo/margem do admin mudou desde então). O "cliente de
             referência" é só um PREVIEW: soma a margem de revenda DAQUELE
             cliente em cima do preço já recalculado numa coluna extra da
             tabela, pra admin mostrar/ajudar aquele cliente específico —
             não grava nada no banco (cada cliente logado já vê a própria
             margem sozinho na Galeria pública, isso não muda). -->
        <div style="margin-bottom:14px; display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          <button type="button" id="gallery-recalc-btn" class="secondary" style="margin-top:0;">Recalcular Galeria</button>
          <span id="gallery-recalc-status" class="hint"></span>
          <label style="display:flex; align-items:center; gap:6px; margin-left:12px;">
            <span class="hint">Cliente de referência (preview de revenda):</span>
            <select id="gallery-reference-client-select" style="max-width:280px;">
              <option value="">— nenhum —</option>
            </select>
          </label>
        </div>

        <div style="margin-bottom:10px;">
          <label>Filtrar por status: </label>
          <select id="gallery-admin-status-filter">
            <option value="pending">Pendentes</option>
            <option value="approved">Aprovados</option>
            <option value="rejected">Rejeitados</option>
            <option value="">Todos</option>
          </select>
        </div>
        <table>
          <thead>
            <tr>
              <th>Imagem</th>
              <th>Nome</th>
              <th>Ambiente</th>
              <th>Preço venda</th>
              <th>Preço custo</th>
              <th>Autor (real)</th>
              <th>Anônimo?</th>
              <th>Curtidas</th>
              <th>Status</th>
              <th>Enviado em</th>
              <th>Revenda (cliente)</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="gallery-admin-tbody"></tbody>
        </table>
        <!-- Paginação (pedido do usuário 2026-07-20: tela travava em
             "Carregando..." — esta consulta buscava TODOS os posts de uma
             vez, incluindo a imagem base64 dos que ainda não foram
             migrados pro Storage — mesmo bug que já tinha estourado
             statement_timeout na galeria pública, ver GALLERY_PAGE_SIZE em
             portal.js). Some sozinha a ficar desnecessária assim que todos
             os posts estiverem migrados (linhas ficam leves de novo). -->
        <button type="button" id="gallery-admin-load-more-btn" class="secondary" style="display:none;">Carregar mais</button>
      </section>
    `;
