@echo off
title YTM-Connect Server
cd /d "%~dp0"
echo ===================================================
echo   Starting YTM-Connect Server for Mobile & PC...
echo ===================================================
npm run dev
pause
