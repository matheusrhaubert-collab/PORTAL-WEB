@echo off
REM ============================================================================
REM subir.bat — dois cliques e publica.
REM ============================================================================
REM
REM POR QUE ESTE ARQUIVO EXISTE
REM No Windows, dar dois cliques num .ps1 NAO executa: o padrao do sistema e
REM abrir no editor. Foi o que aconteceu com o subir.ps1 — abriu o Bloco de
REM Notas e ninguem publicou nada. .bat, ao contrario, executa no duplo clique.
REM
REM Ele nao duplica logica nenhuma: so chama o subir.ps1, que continua sendo o
REM unico lugar onde o deploy mora.
REM
REM O -ExecutionPolicy Bypass e o que evita o "execucao de scripts desabilitada
REM neste sistema" — vale so pra esta chamada, nao muda a politica da maquina.
REM
REM COM MENSAGEM PROPRIA: arraste nada, so rode pelo terminal:
REM     subir.bat "recorte da gola no ban"

setlocal
cd /d "%~dp0"

if "%~1"=="" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0subir.ps1"
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0subir.ps1" -Mensagem "%~1"
)

echo.
echo ============================================================
if errorlevel 1 (
  echo  DEU ERRO. A mensagem esta acima — leia antes de fechar.
) else (
  echo  Publicado. Pode fechar esta janela.
)
echo ============================================================
REM Segura a janela aberta: sem isto o console fecha sozinho no duplo clique e
REM leva junto a mensagem de erro, que e justamente quando voce precisa dela.
pause
