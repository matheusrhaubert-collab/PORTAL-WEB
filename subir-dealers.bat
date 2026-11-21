@echo off
cd /d "%~dp0"
echo Adicionando Dealers, Minha empresa e Central+ (EM TESTE, so admin)...
git add "js/dealer-agreement.js" "js/portal-42-dealer-cadastro.js" "js/portal-43-minha-empresa.js" "js/portal-44-central-plus.js" "erp/js/screens-dealers.js" "supabase/functions/account-tax-check/index.ts" "scripts/tests/empresas" "scripts/tests/teste-dealers-telas.js" "js/portal-09-projetos-final.js" "subir-dealers.bat" "publicar-funcao-tax-exempt.bat"
if errorlevel 1 (
  echo Falhou o git add.
  pause
  exit /b 1
)
call subir.bat "dealers: virar dealer pelo portal, empresas e arvore, minha empresa, central com etiqueta/obra/mapa/lojas (em teste, so admin)"
