#!/usr/bin/env bash
cd "$(dirname "$0")"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "[ElectronChess] Installing dependencies..."
    npm install
fi

# Check for Stockfish
if [ ! -f "stockfish" ] && ! command -v stockfish &> /dev/null; then
    echo "[ElectronChess] Stockfish not found. Running Linux setup..."
    bash scripts/setup-linux.sh
fi

echo "[ElectronChess] Starting app..."
npm start
