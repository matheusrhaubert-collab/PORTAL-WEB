// ==========================================================================
// Servidor local mínimo — só pra tirar os testes do file://
// ==========================================================================
//
// POR QUE ISSO EXISTE
// O teste-ia-projeto-com-imagem.html chama a API do Gemini direto do
// navegador. Como o corpo vai em application/json, o navegador manda um
// preflight OPTIONS antes; abrindo por file:// a origem é "null" e o
// preflight é recusado — o erro que aparece na tela é um "Failed to fetch"
// genérico, que não parece CORS mas é.
//
// Servido por http://localhost a origem passa a ser real e a chamada
// funciona. Não tem outro segredo: isto é um servidor de arquivos estáticos
// de 60 linhas, sem dependência nenhuma (só o Node que já está instalado
// pros scripts de scripts/).
//
// Não confundir com deploy: isso é 100% local, não sobe nada, não toca no
// Supabase. Feche a janela quando terminar.
//
// USO
//   node servir-teste.js                       (porta 8000, abre a pagina de teste de IA)
//   node servir-teste.js 8080                  (outra porta, se a 8000 estiver ocupada)
//   node servir-teste.js 8080 portal.html      (3o argumento opcional: pagina inicial)
// ou dê duplo clique em servir-teste.bat (mantém a pagina de teste de IA) ou
// em servir-8080.bat (abre direto o portal.html, pra debug ao vivo).

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.argv[2]) || 8000;
const ROOT = __dirname;
// 3o argumento opcional troca a pagina inicial (usado pelo servir-8080.bat
// pra abrir direto o portal.html); sem ele, mantém o comportamento de sempre.
const PAGINA_INICIAL = '/' + (process.argv[3] || 'scratch/teste-ia-projeto-com-imagem.html').replace(/^\/+/, '');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.hdr': 'application/octet-stream',
  '.webmanifest': 'application/manifest+json'
};

const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel === '/') rel = PAGINA_INICIAL;

  // Trava de path traversal. É servidor de teste, mas ele fica escutando na
  // máquina do usuário — não custa nada não servir C:\ inteiro por causa de
  // um "../../".
  const alvo = path.resolve(ROOT, '.' + rel);
  if (!alvo.startsWith(ROOT)) {
    res.writeHead(403).end('403');
    return;
  }

  fs.readFile(alvo, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 — não achei ' + rel);
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(alvo).toLowerCase()] || 'application/octet-stream',
      // Sem cache: editar o HTML e dar F5 tem que mostrar a versão nova.
      // (O mesmo motivo do ?v= no portal.html, resolvido aqui no servidor.)
      'Cache-Control': 'no-store'
    });
    res.end(buf);
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('\nA porta ' + PORT + ' já está ocupada. Tente outra:\n  node servir-teste.js 8080\n');
  } else {
    console.error(err);
  }
  process.exit(1);
});

server.listen(PORT, '127.0.0.1', () => {
  const url = 'http://localhost:' + PORT + PAGINA_INICIAL;
  console.log('\n  Servindo ' + ROOT);
  console.log('  Abra:  ' + url);
  console.log('\n  (Ctrl+C para parar)\n');

  // Abre no CHROME especificamente (não no navegador padrão do Windows) —
  // o "start chrome" resolve via App Paths do registro, funciona mesmo se o
  // Chrome não for o navegador padrão. Se o Chrome não estiver instalado,
  // essa chamada só não abre nada (o link acima no console sempre resolve).
  if (process.platform === 'win32') {
    try {
      require('child_process').spawn('cmd', ['/c', 'start', '""', 'chrome', url], { detached: true, stdio: 'ignore' }).unref();
    } catch (e) { /* segue com o link no console */ }
  }
});
