@echo off
REM Publica a funcao dealer-create-seller (criar + ativar/desativar vendedor).
REM E so dar dois cliques.
powershell -ExecutionPolicy Bypass -File "%~dp0deploy-funcao.ps1" -Nome dealer-create-seller
echo.
pause
