@echo off
cd /d "%~dp0"
echo Adicionando os arquivos novos dos puxadores (fotos)...
git add "assets/handles/PUX-KNOB-OVAL-GD.jpg" "assets/handles/PUX-KNOB-OVAL-BK.jpg" "assets/handles/PUX-BARRA-160-GD.jpg" "assets/handles/PUX-BARRA-160-BK.jpg" "assets/handles/PUX-PEARL-KNOB-GD.jpg" "assets/handles/PUX-TURIM-BARRA-128-GD.jpg" "assets/handles/PUX-TURIM-KNOB-GD.jpg" "assets/handles/PUX-ROVERO-KNOB-BR.jpg" "assets/handles/PUX-ROVERO-ALCA-160-RS.jpg" "assets/handles/PUX-ROVERO-ALCA-320-RS.jpg" "assets/handles/PUX-ROVERO-ALCA-160-GD.jpg" "assets/handles/PUX-ROVERO-ALCA-320-GD.jpg" "assets/handles/PUX-ROVERO-ALCA-160-BK.jpg" "assets/handles/PUX-ROVERO-ALCA-320-BK.jpg" "assets/handles/PUX-ROVERO-KNOB-BK.jpg" "assets/handles/PUX-ROVERO-KNOB-GD.jpg" "scripts/tests/teste-canto45-corte.js" "scripts/tests/teste-puxador.js" "subir-puxadores.bat"
if errorlevel 1 (
  echo Falhou o git add.
  pause
  exit /b 1
)
call subir.bat
