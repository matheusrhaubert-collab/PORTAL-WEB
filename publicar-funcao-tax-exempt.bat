@echo off
REM Publica a funcao account-tax-check (leitura do certificado de tax exemption pela IA).
REM E so dar dois cliques. Usa o mesmo GEMINI_API_KEY das outras funcoes.
powershell -ExecutionPolicy Bypass -File "%~dp0deploy-funcao.ps1" -Nome account-tax-check
echo.
pause
