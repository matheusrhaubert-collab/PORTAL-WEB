@echo off
REM Publica a funcao da SAHRA (sahra-chat) - conversa da SAHRA no Projetos, so admin.
REM E so dar dois cliques.
powershell -ExecutionPolicy Bypass -File "%~dp0deploy-funcao.ps1" -Nome sahra-chat
echo.
pause
