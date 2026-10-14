@echo off
REM Publica a funcao de IA (generate-project-from-photo) - usada pelo
REM "IA - Editar projeto", "Projeto a partir de foto" e "IA - Paredes".
REM E so dar dois cliques.
powershell -ExecutionPolicy Bypass -File "%~dp0deploy-funcao.ps1" -Nome generate-project-from-photo
echo.
pause
