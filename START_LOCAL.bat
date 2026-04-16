@echo off
title Growth Stock Scanner — Local Network Mode
color 0B
echo.
echo ================================================================
echo   Growth Stock Scanner — LOCAL NETWORK MODE
echo ================================================================
echo.

python --version >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Python not found. Run START.bat first.
    pause & exit /b 1
)

echo Installing / updating packages...
pip install flask gunicorn yfinance pandas requests --quiet --upgrade
echo [OK] Packages ready
echo.

echo ================================================================
echo   Finding your local IP address...
echo ================================================================
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4"') do (
    set IP=%%a
    goto :found
)
:found
set IP=%IP:~1%

echo.
echo   Server starting...
echo.
echo   Access from THIS computer:
echo     http://localhost:5000
echo.
echo   Access from OTHER devices (same WiFi):
echo     http://%IP%:5000
echo.
echo   Share the second URL with phones/tablets on the same WiFi
echo ================================================================
echo.

start "" /b cmd /c "timeout /t 2 >nul && start http://localhost:5000"

python app.py

IF %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Server crashed.
    pause
)
