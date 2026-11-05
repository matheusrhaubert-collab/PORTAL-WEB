@echo off
REM Publica a funcao generate-gallery-render (Render com IA + Render decorado).
REM E so dar dois cliques.
powershell -ExecutionPolicy Bypass -File "%~dp0deploy-funcao.ps1" -Nome generate-gallery-render
echo.
pause
