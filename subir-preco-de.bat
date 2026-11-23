@echo off
cd /d "%~dp0"
echo Adicionando o "Preco de:" (arquivo novo)...
git add "js/portal-47-preco-de.js" "scripts/tests/teste-preco-de.js" "scripts/tests/teste-senha-order-quote-tela.js" "scripts/tests/empresas/teste-senha-order-quote.mjs" "js/portal-48-acervo.js" "scripts/tests/teste-preco-vendedor-login.js" "scripts/tests/teste-construtor-itens.js" "scripts/tests/teste-sininho.js" "scripts/tests/teste-acervo.js" "subir-preco-de.bat"
if errorlevel 1 (
  echo Falhou o git add.
  pause
  exit /b 1
)
call subir.bat "Preco de: admin escolhe o usuario e o preco/proposta do projeto saem com as margens dele + senha no Order quote + acervo de imagens do projeto + lista Neste modulo no Construtor + sininho de projeto novo"
