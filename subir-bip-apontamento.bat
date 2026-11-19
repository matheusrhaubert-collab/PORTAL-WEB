@echo off
cd /d "%~dp0"
echo Subindo: bip alto no apontamento de pecas...
git add "subir-bip-apontamento.bat"
call subir.bat "apontar pecas: bip alto ao apontar"
