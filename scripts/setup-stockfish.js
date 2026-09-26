const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const exePath = path.join(rootDir, 'stockfish.exe');
const zipPath = path.join(rootDir, 'stockfish.zip');

function setupStockfish() {
    console.log('[setup-stockfish] Checking Stockfish chess engine binary...');

    if (fs.existsSync(exePath)) {
        try {
            const stats = fs.statSync(exePath);
            if (stats.size > 10000000) { // > 10MB
                console.log(`[setup-stockfish] stockfish.exe is already present (${(stats.size / 1024 / 1024).toFixed(1)} MB). Ready to run!`);
                return;
            }
        } catch (_) {}
    }

    if (fs.existsSync(zipPath)) {
        console.log('[setup-stockfish] Extracting stockfish.zip into stockfish.exe...');
        try {
            // First try built-in tar (available on modern Windows 10/11, macOS, Linux)
            execSync(`tar -xf "${zipPath}" -C "${rootDir}"`, { stdio: 'inherit' });
        } catch (tarErr) {
            console.log('[setup-stockfish] tar failed, trying PowerShell Expand-Archive...');
            try {
                execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${rootDir}' -Force"`, { stdio: 'inherit' });
            } catch (psErr) {
                console.error('[setup-stockfish] Failed to extract stockfish.zip:', psErr.message);
                process.exit(1);
            }
        }

        if (fs.existsSync(exePath)) {
            const stats = fs.statSync(exePath);
            console.log(`[setup-stockfish] Successfully extracted stockfish.exe (${(stats.size / 1024 / 1024).toFixed(1)} MB)!`);
        } else {
            console.error('[setup-stockfish] Extraction completed but stockfish.exe not found.');
            process.exit(1);
        }
    } else {
        console.error('[setup-stockfish] Error: stockfish.zip was not found in repository root.');
        console.error('[setup-stockfish] Please download Stockfish from https://stockfishchess.org/download/ and place stockfish.exe in the project root.');
        process.exit(1);
    }
}

setupStockfish();
