const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const readline = require('readline');
const fs = require('fs');

// Locate Stockfish dynamically across platforms (Windows / Linux / macOS)
function resolveEnginePath() {
    const isWindows = process.platform === 'win32';
    const binaryName = isWindows ? 'stockfish.exe' : 'stockfish';

    if (app.isPackaged) {
        return path.join(process.resourcesPath, binaryName);
    }

    // Check project root
    const localPrimary = path.join(__dirname, binaryName);
    if (fs.existsSync(localPrimary)) return localPrimary;

    // Check alternate extension
    const localAlt = isWindows ? path.join(__dirname, 'stockfish') : path.join(__dirname, 'stockfish.exe');
    if (fs.existsSync(localAlt)) return localAlt;

    // Run setup script if stockfish.zip exists
    const setupScript = path.join(__dirname, 'scripts', 'setup-stockfish.js');
    if (fs.existsSync(setupScript)) {
        try {
            require(setupScript);
            if (fs.existsSync(localPrimary)) return localPrimary;
        } catch (e) {
            console.error('Failed to auto-extract Stockfish:', e);
        }
    }

    // On Linux/macOS, check if 'stockfish' is available in system PATH
    if (!isWindows) {
        try {
            const whichOutput = require('child_process').execSync('which stockfish 2>/dev/null').toString().trim();
            if (whichOutput && fs.existsSync(whichOutput)) {
                return whichOutput;
            }
        } catch (_) {}
    }

    return localPrimary;
}

const enginePath = resolveEnginePath();

let engine;
let engineStdout;
let readyCallbacks = [];
let isEngineSearching = false;
let activeMoveResolver = null;
let activeMoveTimer = null;
let lastScoreStr = "0.0";

function sendToEngine(cmd) {
    if (engine && engine.stdin && !engine.killed) {
        try {
            engine.stdin.write(cmd + "\n");
        } catch (e) {
            console.error('Failed to write to engine stdin:', e);
        }
    }
}

function waitForReadyOk() {
    return new Promise((resolve) => {
        readyCallbacks.push(resolve);
        sendToEngine("isready");
    });
}

async function stopAndSyncEngine() {
    if (isEngineSearching) {
        sendToEngine("stop");
    }
    await waitForReadyOk();
    isEngineSearching = false;
}

try {
    engine = spawn(enginePath);
    engineStdout = readline.createInterface({ input: engine.stdout });

    sendToEngine("uci");
    // Limit threads and hash to prevent thermal throttling and 100% CPU lock on laptops
    sendToEngine("setoption name Threads value 2");
    sendToEngine("setoption name Hash value 32");
    sendToEngine("isready");

    engine.on('error', (err) => {
        console.error('Stockfish engine error:', err);
    });
} catch (err) {
    console.error('Failed to spawn Stockfish engine:', err);
}

let mainWindow;

// Global listener for Stockfish UCI output
if (engineStdout) {
    engineStdout.on('line', (line) => {
        line = line.trim();

        if (line === "readyok") {
            while (readyCallbacks.length > 0) {
                const cb = readyCallbacks.shift();
                cb();
            }
            return;
        }

        // Parse continuous evaluation (centipawns or mate distance)
        if (line.startsWith("info") && line.includes("score")) {
            const parts = line.split(" ");
            const scoreIdx = parts.indexOf("score");
            if (scoreIdx !== -1 && scoreIdx + 2 < parts.length) {
                const type = parts[scoreIdx + 1]; // "cp" or "mate"
                const val = parseInt(parts[scoreIdx + 2], 10);
                
                if (type === "cp") {
                    lastScoreStr = (val / 100).toFixed(2);
                } else if (type === "mate") {
                    lastScoreStr = "M" + Math.abs(val);
                }
                
                // Stream live evaluation to the renderer
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('engine-evaluation', lastScoreStr);
                }
            }
        }

        // Parse best move recommendation
        if (line.startsWith("bestmove")) {
            isEngineSearching = false;
            const parts = line.split(" ");
            const rawMove = parts[1];
            const move = (rawMove && rawMove !== "(none)") ? rawMove : null;

            if (activeMoveResolver) {
                if (activeMoveTimer) {
                    clearTimeout(activeMoveTimer);
                    activeMoveTimer = null;
                }
                const resolve = activeMoveResolver;
                activeMoveResolver = null;
                resolve({ move, score: lastScoreStr });
            }
        }
    });
}

function createWindow () {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 800,
        minWidth: 800,
        minHeight: 650,
        center: true,
        title: 'Chess vs Stockfish',
        backgroundColor: '#302E2B',
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    mainWindow.setMenu(null);
    mainWindow.loadFile(path.join(__dirname, 'index.html'));

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        mainWindow.focus();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (engine && engine.stdin && !engine.killed) {
        try {
            engine.stdin.write("quit\n");
        } catch (_) {}
    }
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// IPC Handlers
ipcMain.on('start-continuous-eval', async (event, fen) => {
    // Never start continuous evaluation if calculating a player move
    if (activeMoveResolver) return;

    await stopAndSyncEngine();
    if (activeMoveResolver) return;

    isEngineSearching = true;
    sendToEngine(`position fen ${fen}`);
    sendToEngine("go depth 15");
});

ipcMain.on('stop-continuous-eval', async () => {
    if (!activeMoveResolver) {
        await stopAndSyncEngine();
    }
});

ipcMain.handle('request-engine-move', async (event, fen) => {
    // Stop continuous eval and synchronize completely with the engine
    await stopAndSyncEngine();

    return new Promise((resolve) => {
        if (activeMoveTimer) clearTimeout(activeMoveTimer);
        if (activeMoveResolver) {
            activeMoveResolver({ move: null, score: lastScoreStr });
        }

        activeMoveResolver = resolve;
        isEngineSearching = true;

        // Safety timeout: Stockfish thinks for 1000ms. If after 3.5s no bestmove arrived, recover!
        activeMoveTimer = setTimeout(async () => {
            console.warn('[Engine] Move search timed out; recovering...');
            await stopAndSyncEngine();
            if (activeMoveResolver) {
                const res = activeMoveResolver;
                activeMoveResolver = null;
                res({ move: null, score: lastScoreStr });
            }
        }, 3500);

        sendToEngine(`position fen ${fen}`);
        sendToEngine("go movetime 1000");
    });
});
