@echo off
title Sentry Report Tools - Usage
rem Reads the access logs on Advin (where the workers live now)
ssh -o BatchMode=yes root@100.122.8.49 "node /opt/reporttools/bin/usage-report.js"
echo.
pause
