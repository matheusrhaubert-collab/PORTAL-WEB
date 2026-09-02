/* Painel admin — antiga aba "Perfis de usuário" e criação de conta
 *
 * Pedaço 4/21 do antigo js/admin.js, que virou módulo quando o
 * ERP passou a ser a única porta de entrada.
 *
 * 2026-09-02 (pedido do Matt: "os usuario contatos e perfis estao bem
 * baguncados... nao quero que os perifl do portal se misturem com os do
 * erp, pode ajudar nisso e deixar organizado"): este arquivo foi
 * ESVAZIADO. Tudo que ele fazia — carregar/editar user_profiles, criar
 * usuário (Edge Function admin-create-user), trocar role/perfil, upload
 * de logo do dealer, valor em projetos por usuário — virou funcionalidade
 * da Central de Contatos, ligada ao cadastro do contato em vez de solta
 * numa tabela à parte:
 *   - CT.trocarRolePortal / CT.uploadLogoDealer (js/data-contatos.js)
 *   - ScreensContatos._painelPortal (js/screens-contatos.js) — painel
 *     "Perfil no portal" na ficha do contato
 *   - CT.criarLogin / ScreensContatos.criarLogin — cria conta nova
 *     (mesma Edge Function admin-create-user) já vinculada ao contato
 *   - ScreensContatos._painelNumeros — valor em projetos
 * erp/js/adm/telas/profiles.js manteve só o banner que aponta pra lá; a
 * aba continua existindo no menu (ver erp/js/adm/_adm.js:
 * 'usuarios-antigo') só até o dia em que o Matt achar que já pode sumir
 * de vez. Este arquivo não precisa de código nenhum pra isso — fica só
 * como registro de onde tudo foi parar. */
