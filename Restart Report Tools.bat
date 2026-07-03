@echo off
title Sentry Report Tools
:menu
cls
echo ============================================
echo            SENTRY REPORT TOOLS
echo ============================================
echo.
echo   [1]  Restart  (stop then start both tools)
echo   [2]  Stop     (shut everything down)
echo   [3]  Exit
echo.
set /p choice="Choose 1, 2, or 3: "

if "%choice%"=="1" goto restart
if "%choice%"=="2" goto stop
if "%choice%"=="3" exit
echo Invalid choice.
timeout /t 2 /nobreak >nul
goto menu

:restart
echo.
echo Stopping existing workers and tunnels...
taskkill /F /IM cloudflared.exe >nul 2>&1
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 /nobreak >nul

echo Starting Intac launcher...
start "Intac Daily Report" cmd /k "cd /d "%~dp0" && node launch.js"
timeout /t 2 /nobreak >nul

echo Starting V3 BOL launcher...
start "V3 BOL Report" cmd /k "cd /d "%~dp0..\V3 BOL daily report" && node launch.js"

echo.
echo Done. Two launcher windows opened (keep them open).
echo Netlify will redeploy each tool's URL in ~1 min.
echo.
echo This window can be closed.
timeout /t 6 /nobreak >nul
exit

:stop
echo.
echo Stopping all report workers and tunnels...
taskkill /F /IM cloudflared.exe >nul 2>&1
taskkill /F /IM node.exe >nul 2>&1
echo Done. All workers and tunnels stopped.
timeout /t 3 /nobreak >nul
exit
