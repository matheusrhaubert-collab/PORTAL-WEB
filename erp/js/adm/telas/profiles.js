/* Tela do painel admin: tab-profiles
 * Mudou de casa do admin.html para cá quando o ERP virou a única porta
 * de entrada. A PARTIR DAQUI este arquivo é a fonte da verdade do
 * markup desta tela — pode editar à mão à vontade.
 * Os ids são os mesmos de antes, de propósito: o JS do admin continua
 * achando tudo por getElementById. */
ADM_TELAS['tab-profiles'] = `
      <!-- CENTRAL DE CONTATOS (migration 084) — esta aba mostra SÓ quem tem
           login no portal. Quem não tem (fornecedor, transportadora, operador
           de fábrica) nunca coube aqui, e quem está no CRM aparecia em outra
           aba. A Central de Contatos do back-office junta os três num cadastro
           só, com papel e perfil de acesso. Esta aba continua funcionando —
           ela sai quando a nova estiver rodada e testada. -->
      <section class="panel" style="border-left:3px solid #c9a227;">
        <h2>Esta tela tem uma versão unificada</h2>
        <p class="hint" style="margin-bottom:10px;">
          A <strong>Central de Contatos</strong> do back-office junta num cadastro só o que hoje está
          espalhado entre esta aba (logins do portal), "Clientes (CRM)" e a allow-list de administradores —
          e é lá que se dá, tira e ajusta acesso, por perfil. Esta aba continua funcionando enquanto isso.
          <br />Precisa da <code>migration_084_central_contatos.sql</code> rodada.
        </p>
        <a style="display:inline-block; background:var(--accent); color:#fff; padding:9px 16px; border-radius:6px; font-size:14px; text-decoration:none;" href="erp/index.html#/contatos" target="_blank" rel="noopener">Abrir Central de Contatos</a>
      </section>

      <!-- Criar usuário (migration 053 + Edge Function admin-create-user) —
           conta de verdade (e-mail + senha), pronta pra usar. O admin
           escolhe uma senha simples; a pessoa troca depois sozinha, no
           portal (Configurações > Trocar senha). -->
      <section class="panel">
        <h2>Criar novo usuário</h2>
        <p class="hint">
          Cria a conta já pronta pra usar (login funciona na hora). Escolha uma senha simples — a pessoa
          pode trocar depois no próprio portal, em Configurações.
        </p>
        <div id="create-user-error" class="error" style="display:none;"></div>
        <form id="create-user-form" class="row" style="align-items:flex-end;">
          <div>
            <label>Nome</label>
            <input id="create-user-name" type="text" required />
          </div>
          <div>
            <label>E-mail</label>
            <input id="create-user-email" type="email" required />
          </div>
          <div>
            <label>Senha inicial</label>
            <input id="create-user-password" type="text" minlength="6" required />
          </div>
          <div>
            <label>Perfil</label>
            <select id="create-user-role">
              <option value="cliente">Cliente</option>
              <option value="lojista">Dealer</option>
              <option value="contractor">Contractor</option>
              <option value="administrador">Administrador</option>
            </select>
          </div>
          <div style="flex:0;">
            <button type="submit" style="margin-top:0;">Criar usuário</button>
          </div>
          <span id="create-user-status" class="hint" style="margin-left:10px;"></span>
        </form>
      </section>

      <section class="panel">
        <h2>Perfis de usuário</h2>
        <p class="hint">
          Todos os usuários que já têm conta no portal (criados aqui ou cadastrados sozinhos). Troque
          nome/perfil e clique em "Salvar" na linha — só Contractor (ou Administrador) enxerga a aba
          "Plano de Corte" no portal.
        </p>
        <!-- Valor em projetos (migration 078, pedido do usuário 2026-08-03:
             "quero na tela admin saber quanto cada usuario esta fazendo de
             projetos, em valores") — soma de user_projects.cached_value_usd
             (valor de venda já calculado, sem margem de revenda) de cada
             usuário. Ver loadProfiles em admin.js. -->
        <div id="profiles-error" class="error" style="display:none;"></div>
        <table>
          <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Cadastro</th><th>Projetos</th><th>Valor em projetos</th><th>Última atividade</th><th></th></tr></thead>
          <tbody id="profiles-tbody"></tbody>
        </table>
      </section>
    `;
