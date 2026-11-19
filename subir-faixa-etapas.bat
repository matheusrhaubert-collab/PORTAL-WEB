@echo off
cd /d "%~dp0"
echo Subindo: faixa de etapas + alerta 100% das pecas no portal...
git add "subir-faixa-etapas.bat"
call subir.bat "portal: pecas no Packing, liberacao financeira final e alerta 100% das pecas"
