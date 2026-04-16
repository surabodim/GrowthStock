@echo off
title Growth Stock Scanner
color 0B
echo.
echo ================================================================
echo   Growth Stock Scanner — Web App
echo ================================================================
echo.

python --version >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Python not found!
    echo.
    echo  1. Go to: https://www.python.org/downloads/
    echo  2. Download Python 3.10 or newer
    echo  3. Check "Add Python to PATH" during install
    echo  4. Run this file again
    echo.
    pause & exit /b 1
)

python --version
echo.
echo Installing packages...
pip install flask gunicorn yfinance pandas requests --quiet --upgrade
echo [OK] Ready
echo.
echo ================================================================
echo   Open browser at:  http://localhost:5000
echo   Press Ctrl+C to stop
echo ================================================================
echo.

start "" /b cmd /c "timeout /t 2 >nul && start http://localhost:5000"
python app.py

IF %ERRORLEVEL% NEQ 0 ( echo [ERROR] See above. & pause )
