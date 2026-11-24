@echo off
echo Starting local report worker (SentryXP - GA / Non-GA report)...
echo Keep this window open while you use the local fallback.
echo Once it says "worker listening on :3001", go back to the report
echo site and paste http://localhost:3001 into the "Worker URL" field.
echo.
node server.js
pause
