@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0.."

echo.
echo   ============================================
echo     DEPLOY - Buscar clientes
echo   ============================================
echo.

if not exist "tools\salida" mkdir "tools\salida"

if exist "tools\salida\.key" goto :buscar

echo   Primera vez: necesito tu API key de Google Places.
echo   Se saca en console.cloud.google.com, habilitando "Places API (New)".
echo.
set "APIKEY="
set /p APIKEY="  Pegala aca y apreta Enter: "
if not defined APIKEY goto :sinkey
>"tools\salida\.key" echo %APIKEY%
echo.
echo   Guardada. No te la vuelvo a pedir.
echo.

:buscar
echo   [1/3] Buscando negocios sin pagina web...
python "tools\prospectar.py" %*
if errorlevel 1 goto :error

echo.
echo   [2/3] Sumandolos al pipeline...
python "tools\pipeline.py" importar
if errorlevel 1 goto :error

echo.
echo   [3/3] Armando el tablero...
python "tools\pipeline.py" tablero
if errorlevel 1 goto :error

echo.
echo   ============================================
echo     Listo. Se abrio el tablero en el navegador.
echo     Cada boton abre WhatsApp con el mensaje escrito.
echo     Lo leas, lo ajustas, y enviás vos.
echo   ============================================
echo.
goto :fin

:sinkey
echo.
echo   Sin la key no puedo buscar. Volve a correr esto cuando la tengas.
goto :fin

:error
echo.
echo   Algo fallo. Mira el mensaje de arriba.

:fin
pause
