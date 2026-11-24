@echo off
title Sentry Report Tools (Advin)
:menu
cls
echo ============================================
echo            SENTRY REPORT TOOLS
echo        (engines live on Advin VPS)
echo ============================================
echo.
echo   [1]  Restart   (all three workers)
echo   [2]  Stop      (all three workers)
echo   [3]  Status    (health check)
echo   [4]  Exit
echo.
set /p choice="Choose 1, 2, 3, or 4: "

if "%choice%"=="1" goto restart
if "%choice%"=="2" goto stop
if "%choice%"=="3" goto status
if "%choice%"=="4" exit
echo Invalid choice.
timeout /t 2 /nobreak >nul
goto menu

:restart
echo.
echo Restarting report-intac, report-v3bol, report-kdl ...
ssh -o BatchMode=yes root@100.122.8.49 "/opt/reporttools/scripts/restart-all.sh"
echo.
echo Done. Public URLs NEVER change - nothing else to do.
timeout /t 4 /nobreak >nul
exit

:stop
echo.
echo Stopping all three workers...
ssh -o BatchMode=yes root@100.122.8.49 "systemctl stop report-intac report-v3bol report-kdl && echo stopped"
echo NOTE: sites will show 'Cannot reach worker' until restarted.
timeout /t 4 /nobreak >nul
exit

:status
echo.
ssh -o BatchMode=yes root@100.122.8.49 "/opt/reporttools/scripts/status.sh"
echo.
pause
goto menu
