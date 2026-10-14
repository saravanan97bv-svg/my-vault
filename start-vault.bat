@echo off
title My Vault v1.0 — Offline Family Chronicle
cd /d "%~dp0"
echo Starting My Vault v1.0 local test server...
start http://127.0.0.1:3847
node preview.js
pause
