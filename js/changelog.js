// Histórico de versões do portal — alimenta o selo de versão e o modal
// "Novidades" (js/version-news.js). Pedido do Matt, 2026-09-07: "do lado da
// versao quero um botao curiosidade ou news, que mostre o historico de
// melhorias de cada versao. tipo v1.001 data da versao. v1.002 -data e o que
// foi melhoraqdo em topicos. pode salvar isso pra usuario saber o que
// melhorou desde a versao que ele estava usando."
//
// Arquivo puro (sem DOM, sem banco) — só dados, igual layout-engine.js no
// espírito. Ordem: MAIS NOVA PRIMEIRO (índice 0 = versão atual, é o que vira
// o número do selo).
//
// Pra lançar uma versão nova:
//   1. Copia o bloco de baixo, cola no TOPO do array (antes do de 2026-09-07).
//   2. Troca version/date pros novos.
//   3. Lista o que mudou em "items" — frases curtas, em português (é
//      conteúdo pro cliente ler, não rótulo de interface, então não passa
//      pelo dicionário de js/i18n.js — ver o comentário de escopo no topo
//      daquele arquivo).
// Não precisa mexer em mais nada: o número do selo (#po-version-badge) e a
// bolinha de "tem novidade" atualizam sozinhos a partir do item [0] daqui.
window.LEGNO_CHANGELOG = [
  {
    version: '1.002',
    date: '2026-09-07',
    items: [
      'Corrigido bug que fazia o menu "Visual" (estilos de desenho: textura, contorno fino/grosso, técnico) sumir da barra de ferramentas em telas de notebook.',
      'Novo botão "Exportar SketchUp" na tela de Projetos: baixa o móvel/ambiente 3D com as texturas, pronto pra abrir no SketchUp.'
    ]
  },
  {
    version: '1.001',
    date: '2026-09-07',
    items: [
      'Número da versão do portal agora aparece na tela.',
      'Botão de novidades ao lado da versão, com o histórico do que mudou em cada versão.'
    ]
  }
];
