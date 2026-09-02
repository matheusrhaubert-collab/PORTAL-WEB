/* Tela do painel admin: tab-profiles
 * Mudou de casa do admin.html para cá quando o ERP virou a única porta
 * de entrada. A PARTIR DAQUI este arquivo é a fonte da verdade do
 * markup desta tela — pode editar à mão à vontade.
 * Os ids são os mesmos de antes, de propósito: o JS do admin continua
 * achando tudo por getElementById.
 *
 * 2026-09-02 (pedido do Matt: "os usuario contatos e perfis estao bem
 * baguncados... nao quero que os perifl do portal se misturem com os do
 * erp"): esta aba foi ESVAZIADA — virou só um link. Tudo que ela fazia
 * (criar usuário, trocar perfil/role, trocar logo do dealer, ver valor em
 * projetos) já existe na Central de Contatos, feito direito (ligado ao
 * cadastro do contato, não solto). O código antigo (loadProfiles,
 * uploadDealerLogoAsAdmin, o formulário de criar usuário) foi removido
 * daqui e de erp/js/adm/03-usuarios.js — não é histórico morto pra
 * manter, é funcionalidade duplicada que a Central de Contatos substitui:
 *   - "Criar novo usuário"      → ficha do contato > "Criar login novo"
 *   - trocar perfil/role/logo   → ficha do contato > painéis "Acesso ao
 *                                  sistema" e "Perfil no portal"
 *   - valor em projetos         → ficha do contato > painel "Números"
 * Ver database/migration_150_vendedor_papel_e_sync_role.sql e
 * erp/js/data-contatos.js/screens-contatos.js para o que entrou no lugar. */
ADM_TELAS['tab-profiles'] = `
      <section class="panel" style="border-left:3px solid #c9a227;">
        <h2>Esta tela virou a Central de Contatos</h2>
        <p class="hint" style="margin-bottom:10px;">
          Usuários, contatos e perfis moraram espalhados por aqui, pelo "Clientes (CRM)" e pela allow-list
          de administradores — e é exatamente essa bagunça que a <strong>Central de Contatos</strong> junta
          num cadastro só: criar login, trocar perfil no portal, perfil de acesso do ERP, logo do dealer,
          tudo na ficha do contato. Esta aba antiga não faz mais nada — só aponta pra lá.
        </p>
        <a style="display:inline-block; background:var(--accent); color:#fff; padding:9px 16px; border-radius:6px; font-size:14px; text-decoration:none;" href="erp/index.html#/contatos" target="_blank" rel="noopener">Abrir Central de Contatos</a>
      </section>
    `;
