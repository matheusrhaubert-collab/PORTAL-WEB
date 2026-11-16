@echo off
cd /d "%~dp0"
echo Adicionando os arquivos novos da Galeria de Favoritos...
git add "js/portal-39-favoritos.js" "subir-favoritos.bat"
if errorlevel 1 (
  echo Falhou o git add.
  pause
  exit /b 1
)
call subir.bat "v1.009: favoritos, grupo objeto unico, tutorial, central de pedidos (teste admin)"
