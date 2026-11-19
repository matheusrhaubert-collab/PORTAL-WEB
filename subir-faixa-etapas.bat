@echo off
cd /d "%~dp0"
echo Subindo: faixa de etapas (pecas no Packing + liberacao financeira final)...
git add "subir-faixa-etapas.bat"
call subir.bat "faixa de etapas: pecas dentro do Packing e etapa Liberacao financeira final"
