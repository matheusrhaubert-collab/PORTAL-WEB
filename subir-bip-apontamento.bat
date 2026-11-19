@echo off
cd /d "%~dp0"
echo Subindo: sons do apontamento (ok, repetida, outro lote) e desfazer so no mouse...
git add "subir-bip-apontamento.bat"
call subir.bat "apontar pecas: alarme de outro lote, som de repetida, desfazer so com clique"
