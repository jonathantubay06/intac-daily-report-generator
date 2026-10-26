@echo off
title Intac reports (local fallback)
echo ============================================
echo   INTAC REPORTS - LOCAL FALLBACK (no VPS)
echo   Monday: GA + Non-GA. Tue-Fri: Non-GA daily.
echo ============================================
echo.
cd /d "%~dp0worker"
node local-report.mjs %1
echo.
if exist "%~dp0reports" start "" explorer "%~dp0reports"
echo Double-click each .eml to open it as a draft in Outlook, add recipients, check, send.
echo.
pause
