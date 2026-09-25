/* Tela do painel admin: tab-crm-clients
 * Mudou de casa do admin.html para cá quando o ERP virou a única porta
 * de entrada. A PARTIR DAQUI este arquivo é a fonte da verdade do
 * markup desta tela — pode editar à mão à vontade.
 * Os ids são os mesmos de antes, de propósito: o JS do admin continua
 * achando tudo por getElementById. */
ADM_TELAS['tab-crm-clients'] = `
      <!-- Ver o comentário da aba "Perfis": o cadastro comercial daqui já foi
           copiado pra erp.contatos pela migration 084 (crm_clients continua
           sendo a fonte do histórico de reuniões, que ainda não migrou). -->
      <section class="panel" style="border-left:3px solid #c9a227;">
        <h2>Esta tela tem uma versão unificada</h2>
        <p class="hint" style="margin-bottom:10px;">
          A <strong>Central de Contatos</strong> do back-office mostra estes clientes junto com os logins do
          portal, os fornecedores e o time interno — sem cadastro duplicado. O histórico de reuniões ainda
          mora aqui.
          <br />Precisa da <code>migration_084_central_contatos.sql</code> rodada.
        </p>
        <a style="display:inline-block; background:var(--accent); color:#fff; padding:9px 16px; border-radius:6px; font-size:14px; text-decoration:none;" href="erp/index.html#/contatos?papel=cliente" target="_blank" rel="noopener">Abrir Central de Contatos</a>
      </section>

      <section class="panel">
        <h2>Novo cliente</h2>
        <p class="hint">Cadastro comercial da fábrica — não cria login no portal. Se a pessoa também tiver conta
          no portal, você pode vincular depois no painel de detalhe.</p>
        <div id="crm-client-error" class="error" style="display:none;"></div>
        <form id="crm-client-form" class="row" style="align-items:flex-end;">
          <div>
            <label>Nome</label>
            <input id="crm-client-nome" type="text" required />
          </div>
          <div>
            <label>Telefone</label>
            <input id="crm-client-telefone" type="text" placeholder="(11) 99999-9999" />
          </div>
          <div>
            <label>Empresa</label>
            <input id="crm-client-empresa" type="text" />
          </div>
          <div style="flex:2;">
            <label>Endereço</label>
            <input id="crm-client-endereco" type="text" />
          </div>
          <div style="flex:0;">
            <button type="submit" style="margin-top:0;">Cadastrar</button>
          </div>
        </form>
      </section>

      <section class="panel">
        <h2>Clientes cadastrados</h2>
        <div id="crm-clients-list-error" class="error" style="display:none;"></div>
        <input id="crm-clients-search" type="text" placeholder="Buscar por nome ou empresa..." style="margin-bottom:10px; max-width:320px;" />
        <table>
          <thead><tr><th>Nome</th><th>Empresa</th><th>Telefone</th><th>Endereço</th><th></th></tr></thead>
          <tbody id="crm-clients-tbody"></tbody>
        </table>
      </section>

      <section class="panel" id="crm-client-detail-panel" style="display:none;">
        <h2>Detalhe do cliente</h2>
        <div id="crm-client-detail-error" class="error" style="display:none;"></div>
        <form id="crm-client-edit-form" class="row" style="align-items:flex-end;">
          <input type="hidden" id="crm-client-edit-id" />
          <div>
            <label>Nome</label>
            <input id="crm-client-edit-nome" type="text" required />
          </div>
          <div>
            <label>Telefone</label>
            <input id="crm-client-edit-telefone" type="text" />
          </div>
          <div>
            <label>Empresa</label>
            <input id="crm-client-edit-empresa" type="text" />
          </div>
          <div style="flex:2;">
            <label>Endereço</label>
            <input id="crm-client-edit-endereco" type="text" />
          </div>
          <div>
            <label>Vínculo com usuário do portal (opcional)</label>
            <select id="crm-client-edit-linked-user"><option value="">— nenhum —</option></select>
          </div>
          <div style="flex:0;">
            <button type="submit" style="margin-top:0;">Salvar</button>
          </div>
          <div style="flex:0;">
            <button type="button" id="crm-client-delete-btn" class="secondary" style="margin-top:0;">Excluir cliente</button>
          </div>
          <span id="crm-client-edit-status" class="hint" style="margin-left:10px;"></span>
        </form>
        <div style="margin-top:8px;">
          <label>Anotações gerais</label>
          <textarea id="crm-client-edit-notes" rows="2" style="width:100%;" placeholder="Observações sobre o cliente..."></textarea>
        </div>

        <h3 style="margin-top:24px;">Histórico de reuniões</h3>
        <div id="crm-meetings-error" class="error" style="display:none;"></div>
        <form id="crm-meeting-form" class="row" style="align-items:flex-end;">
          <div>
            <label>Data</label>
            <input id="crm-meeting-date" type="date" required />
          </div>
          <div style="flex:2;">
            <label>Anotação</label>
            <input id="crm-meeting-notes" type="text" placeholder="O que foi conversado..." required />
          </div>
          <div style="flex:0;">
            <button type="submit" style="margin-top:0;">Adicionar reunião</button>
          </div>
        </form>
        <table style="margin-top:10px;">
          <thead><tr><th style="width:120px;">Data</th><th>Anotação</th><th></th></tr></thead>
          <tbody id="crm-meetings-tbody"></tbody>
        </table>
      </section>
    `;
