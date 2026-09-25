/* Painel admin — Tipos de componente
 *
 * Pedaço 8/21 do antigo js/admin.js, que virou módulo quando o
 * ERP passou a ser a única porta de entrada. O corte seguiu os próprios
 * marcadores de assunto do arquivo, então nada mudou de vizinho.
 * A ordem de carregamento em erp/index.html importa: é a mesma de antes. */

// ---------- TIPOS DE COMPONENTE ----------
// Tipo do componente (Lateral, Base, Prateleira, Porta, Gaveta...).
// color_role_id (migration 035) decide qual papel de cor peças desse tipo
// usam — substitui o antigo boolean is_front (só 2 opções fixas) e o campo
// manual "papel da cor" por componente, ainda mais antigo.

async function loadComponentTypes() {
  const { data, error } = await supabaseClient.from('component_types').select('*, color_roles(*)').order('name');
  if (error) { showError('component-types-error', error); return; }
  componentTypesCache = data;
  renderComponentTypes();
  fillSelect('component-type', componentTypesCache);
}

// Rótulos amigáveis pro valor cru salvo em component_types.positioning —
// usado só pra exibir na tabela (o <select> do formulário já mostra o texto
// completo nas próprias <option>).
const POSITIONING_LABELS = {
  horizontal: 'Horizontal',
  vertical: 'Vertical',
  vertical_no_plano: 'Vertical no plano',
  horizontal_no_plano: 'Horizontal no plano'
};
function positioningLabel(value) {
  return POSITIONING_LABELS[value] || '<span class="hint">automático</span>';
}

function renderComponentTypes() {
  const tbody = document.getElementById('component-types-tbody');
  tbody.innerHTML = '';
  componentTypesCache.forEach((t) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${t.name}</td>
      <td>${t.color_roles ? t.color_roles.name : '<span class="hint">sem papel</span>'}</td>
      <td>${positioningLabel(t.positioning)}</td>
      <td>${t.active ? '<span class="badge">ativo</span>' : '<span class="badge">inativo</span>'}</td>
      <td><button class="secondary" onclick="editComponentType('${t.id}')">Editar</button>
          <button class="danger" onclick="deleteComponentType('${t.id}')">Excluir</button></td>
    `;
    tbody.appendChild(tr);
  });
}

window.editComponentType = function (id) {
  const t = componentTypesCache.find((x) => x.id === id);
  if (!t) return;
  document.getElementById('component-type-id').value = t.id;
  document.getElementById('component-type-name').value = t.name;
  // Papel de cor (migration 155) — o <select> só lista papéis VISÍVEIS
  // (colorRolesCache filtrada, sem hidden_from_admin — ver
  // erp/js/adm/01-ambientes.js). Se este tipo de componente JÁ usa um
  // papel oculto (é exatamente o caso de "Decoração — Principal", cujo
  // papel está com o name renomeado pra "Rod" e agora oculto — ver
  // [[decor_porta_janela_154]]), o valor não existiria entre as <option>
  // e o navegador ignorava o .value, deixando o select em branco — se o
  // Matt salvasse sem notar, o form gravaria color_role_id vazio e
  // quebraria a cor dos 9 itens de decoração de uma vez. Por isso: injeta
  // a <option> oculta de volta (marcada, só nesta sessão de edição, nunca
  // persistida na lista de opções) ANTES de setar o valor.
  const colorRoleSel = document.getElementById('component-type-color-role');
  // Remove qualquer opção oculta injetada numa edição ANTERIOR nesta mesma
  // sessão de página (data-injected-hidden), pra não acumular <option>
  // "(oculto)" de outros registros à toa — reinjeta de novo abaixo só se
  // ESTE registro precisar.
  [...colorRoleSel.querySelectorAll('option[data-injected-hidden]')].forEach((o) => o.remove());
  const roleId = t.color_role_id || '';
  if (roleId && ![...colorRoleSel.options].some((o) => o.value === roleId)) {
    const hiddenRole = (colorRolesCacheAll || []).find((r) => r.id === roleId);
    if (hiddenRole) {
      const opt = document.createElement('option');
      opt.value = hiddenRole.id;
      opt.textContent = hiddenRole.name + ' (oculto — não escolha pra outro tipo)';
      opt.setAttribute('data-injected-hidden', '1');
      colorRoleSel.appendChild(opt);
    }
  }
  colorRoleSel.value = roleId;
  document.getElementById('component-type-positioning').value = t.positioning || '';
};

window.deleteComponentType = async function (id) {
  if (!confirm('Excluir este tipo de componente?')) return;
  const { error } = await supabaseClient.from('component_types').delete().eq('id', id);
  if (error) { showError('component-types-error', error); return; }
  loadComponentTypes();
};

document.getElementById('component-type-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError('component-types-error');
  const id = document.getElementById('component-type-id').value || undefined;
  const payload = {
    name: document.getElementById('component-type-name').value.trim(),
    color_role_id: document.getElementById('component-type-color-role').value || null,
    positioning: document.getElementById('component-type-positioning').value || null,
    active: true
  };
  if (id) payload.id = id;
  const { error } = await supabaseClient.from('component_types').upsert(payload);
  if (error) { showError('component-types-error', error); return; }
  e.target.reset();
  document.getElementById('component-type-id').value = '';
  loadComponentTypes();
});

// ---------- (REMOVIDO) MODELOS DE PORTA / MODELOS DE GAVETA ----------
// Migration 023 (módulo-como-componente): o sistema especial de "modelo de
// porta" e "modelo de gaveta" (door_styles/drawer_types + suas composições e
// profundidades fixas) foi REMOVIDO por inteiro. Um estilo de porta ou uma
// construção de gaveta agora é só um módulo comum — normalmente marcado
// "Invisível" (ver checkbox no formulário de módulo) pra não aparecer na
// galeria do cliente — usado como PEÇA ANINHADA dentro de outro módulo (ver
// "Componentes deste módulo" mais abaixo: seção "Adicionar módulo (peça
// aninhada)"). Profundidade fixa também generalizou: qualquer módulo pode
// ter isso agora (ver "Profundidades fixas" na tela de configurar módulo),
// não só um "modelo de gaveta" especial.

let __removedDoorDrawerStyleSystem = true; // marcador — nada mais usa isso
