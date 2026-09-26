#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

echo "=== ElectronChess Linux Setup ==="

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not installed. Please install Node.js (v18+) first."
    exit 1
fi

echo "[1/3] Node.js version: $(node -v)"

# Check if stockfish is already installed via system package manager
if command -v stockfish &> /dev/null; then
    STOCKFISH_BIN="$(command -v stockfish)"
    echo "[2/3] Found system Stockfish at: $STOCKFISH_BIN"
    if [ ! -f "$DIR/stockfish" ]; then
        ln -sf "$STOCKFISH_BIN" "$DIR/stockfish"
        echo "      Created symlink: ./stockfish -> $STOCKFISH_BIN"
    fi
elif [ -f "$DIR/stockfish" ]; then
    echo "[2/3] Local stockfish binary already present."
    chmod +x "$DIR/stockfish"
else
    echo "[2/3] Stockfish not found. Attempting to install or download..."
    if command -v apt-get &> /dev/null; then
        echo "      Detected Debian/Ubuntu. Installing stockfish package..."
        if [ "$EUID" -ne 0 ]; then
            sudo apt-get update && sudo apt-get install -y stockfish
        else
            apt-get update && apt-get install -y stockfish
        fi
        ln -sf "$(command -v stockfish)" "$DIR/stockfish"
    elif command -v dnf &> /dev/null; then
        echo "      Detected Fedora/RHEL. Installing stockfish package..."
        sudo dnf install -y stockfish
        ln -sf "$(command -v stockfish)" "$DIR/stockfish"
    elif command -v pacman &> /dev/null; then
        echo "      Detected Arch Linux. Installing stockfish package..."
        sudo pacman -S --noconfirm stockfish
        ln -sf "$(command -v stockfish)" "$DIR/stockfish"
    else
        echo "      Downloading official Stockfish Linux binary from GitHub releases..."
        SF_URL="https://github.com/official-stockfish/Stockfish/releases/latest/download/stockfish-ubuntu-x86-64-avx2.tar"
        curl -sL "$SF_URL" -o "$DIR/stockfish.tar"
        tar -xf "$DIR/stockfish.tar" -C "$DIR"
        find "$DIR" -name "stockfish*" -type f -executable ! -name "*.tar" ! -name "*.zip" ! -name "*.sh" -exec mv {} "$DIR/stockfish" \; 2>/dev/null || true
        rm -f "$DIR/stockfish.tar"
        chmod +x "$DIR/stockfish" 2>/dev/null || true
    fi
fi

# Verify Stockfish works
if [ -f "$DIR/stockfish" ] || command -v stockfish &> /dev/null; then
    echo "      Stockfish engine verified."
else
    echo "[NOTE] If stockfish is not linked, install it with: sudo apt install stockfish"
fi

# Install npm dependencies
echo "[3/3] Installing NPM dependencies..."
npm install

echo ""
echo "=== Setup complete! ==="
echo "Run the application with: npm start (or ./run.sh)"
