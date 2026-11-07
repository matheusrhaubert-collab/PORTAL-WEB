@echo off
REM Publica a funcao da tela Fluxo da SAHRA (sahra-fluxo) - so admin.
REM E so dar dois cliques.
powershell -ExecutionPolicy Bypass -File "%~dp0deploy-funcao.ps1" -Nome sahra-fluxo
echo.
pause
