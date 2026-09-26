const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    requestEngineMove: (fen) => ipcRenderer.invoke('request-engine-move', fen),
    startContinuousEval: (fen) => ipcRenderer.send('start-continuous-eval', fen),
    stopContinuousEval: () => ipcRenderer.send('stop-continuous-eval'),
    onEngineEvaluation: (callback) => ipcRenderer.on('engine-evaluation', (event, score) => callback(score))
});
