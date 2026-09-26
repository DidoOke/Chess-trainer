@echo off
cd /d "%~dp0"

echo [ElectronChess] Checking environment...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH!
    echo Please install Node.js from https://nodejs.org/ to run this app.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo [ElectronChess] Installing dependencies and setting up Stockfish engine...
    call npm.cmd install
    if %errorlevel% neq 0 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
)

if not exist "stockfish.exe" (
    echo [ElectronChess] Unpacking Stockfish binary...
    node scripts\setup-stockfish.js
)

echo [ElectronChess] Starting app...
call npm.cmd start
