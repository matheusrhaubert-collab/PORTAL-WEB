@echo off
REM Adiciona os arquivos novos do "IA - Editar projeto" ao Git e sobe o portal.
cd /d "%~dp0"
git add "js/portal-19-ia-editar.js" "publicar-funcao-ia.bat" "subir-ia-editar.bat"
if errorlevel 1 (
  echo.
  echo Nao consegui adicionar os arquivos. Mande a mensagem acima pro Claude.
  pause
  exit /b 1
)
call "%~dp0subir.bat"
