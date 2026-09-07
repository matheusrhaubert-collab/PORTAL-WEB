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
    version: '1.003',
    date: '2026-09-07',
    items: [
      'Barra de ferramentas da tela de Projetos reorganizada em categorias (Paredes, Vista, Ferramentas, Camadas, Render, Orçamento, Projeto), com um textinho identificando cada grupo.',
      'Novo botão "Refazer" ao lado do "Desfazer", pra reverter um desfazer feito a mais.',
      'Corrigido a exportação para o SketchUp: uma caixa invisível usada só pra clicar no móvel na tela não sai mais junto como um bloco sólido atrapalhando o desenho.',
      'Corrigido o ícone do menu "Visual" que aparecia mais baixo que os outros ícones da categoria Vista.',
      'Na categoria Camadas, ocultar um móvel agora destaca o botão em rosa, igual aos outros indicadores da barra.',
      'Botão "Enviar pro pedido" passou a usar o mesmo ícone preto e branco dos outros botões da barra, sem o fundo preto.',
      'Corrigido bug que, depois de gerar uma Proposta, trocava o ícone do botão pela palavra "Proposal" e não voltava mais sem recarregar a página.',
      'Ícones da barra reaproximados do texto de cada categoria, ocupando um pouco menos de altura.'
    ]
  },
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
