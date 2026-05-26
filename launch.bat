@echo off
REM Double-click this to start worker + tunnel + auto-push tunnel URL.
REM Keep the window open while you use the report tool.

cd /d "%~dp0"
node launch.js
pause
