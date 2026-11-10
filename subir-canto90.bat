@echo off
cd /d "%~dp0"
echo Adicionando a migration 284 (canto 90 com 34 1/2)...
git add "database/migration_284_canto90_altura_34_meio.sql" "subir-canto90.bat"
if errorlevel 1 (
  echo Falhou o git add.
  pause
  exit /b 1
)
call subir.bat "canto 90 toe com 34 1/2 (migration 284)"
