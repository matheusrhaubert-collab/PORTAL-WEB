@echo off
cd /d "%~dp0"
echo Adicionando a migration nova dos vendedores...
git add "database/migration_265_vendedores_ativar_e_projetos.sql" "publicar-funcao-vendedores.bat" "subir-vendedores.bat"
if errorlevel 1 (
  echo Falhou o git add.
  pause
  exit /b 1
)
call subir.bat
