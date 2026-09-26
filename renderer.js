let game = new Chess();
let board = null;
const statusBox = document.getElementById('statusBox');
const moveFeedbackBox = document.getElementById('moveFeedback');
const evalBarWhite = document.getElementById('eval-bar');
const evalScoreTxt = document.getElementById('eval-score');
let currentEval = 0.0; // In pawns, positive for white advantage

let appMode = 'FREE_PLAY'; // 'FREE_PLAY' or 'TRAINER'
let openingTree = {};
let openingColor = 'w';

// Map chessboard.js piece codes to local asset filenames
function customPieceTheme (piece) {
    return 'assets/' + piece.toLowerCase() + '.png';
}

function normalizeScore(scoreStr) {
    if (game.turn() === 'b') {
        if (scoreStr.startsWith('M') || scoreStr.startsWith('-M')) {
            return scoreStr.startsWith('-') ? scoreStr.substring(1) : '-' + scoreStr;
        } else {
            return (-parseFloat(scoreStr)).toFixed(2);
        }
    }
    return scoreStr;
}

function updateEvalUI(scoreStr) {
    let winChance = 50;
    
    if (scoreStr.startsWith('M')) {
        winChance = 100;
        evalScoreTxt.innerText = scoreStr;
    } else if (scoreStr.startsWith('-M')) {
        winChance = 0;
        evalScoreTxt.innerText = scoreStr;
    } else {
        const scoreNum = parseFloat(scoreStr);
        currentEval = scoreNum;
        evalScoreTxt.innerText = Math.abs(scoreNum).toFixed(1);
        
        let clampedScore = Math.max(-5, Math.min(5, scoreNum));
        winChance = ((clampedScore + 5) / 10) * 100;
    }
    
    evalBarWhite.style.height = `${winChance}%`;
    
    if (winChance >= 50) {
        evalScoreTxt.className = 'eval-score white-advantage';
    } else {
        evalScoreTxt.className = 'eval-score black-advantage';
    }
}

function calculateFeedback(prevEval, newScoreStr) {
    if (newScoreStr.includes('M')) return; 

    const newEval = parseFloat(newScoreStr);
    const evalDiff = newEval - prevEval;
    
    moveFeedbackBox.className = '';
    
    if (prevEval >= 1.5 && newEval <= 0.5) {
        moveFeedbackBox.innerText = "Your Move: Miss";
        moveFeedbackBox.classList.add('feedback-miss');
    } else if (evalDiff >= 0.0) {
        moveFeedbackBox.innerText = "Your Move: Best";
        moveFeedbackBox.classList.add('feedback-best');
    } else if (evalDiff >= -0.2) {
        moveFeedbackBox.innerText = "Your Move: Excellent";
        moveFeedbackBox.classList.add('feedback-excellent');
    } else if (evalDiff >= -0.5) {
        moveFeedbackBox.innerText = "Your Move: Good";
        moveFeedbackBox.classList.add('feedback-good');
    } else if (evalDiff >= -1.0) {
        moveFeedbackBox.innerText = "Your Move: Inaccuracy";
        moveFeedbackBox.classList.add('feedback-inaccuracy');
    } else if (evalDiff >= -2.0) {
        moveFeedbackBox.innerText = "Your Move: Mistake";
        moveFeedbackBox.classList.add('feedback-mistake');
    } else {
        moveFeedbackBox.innerText = "Your Move: Blunder";
        moveFeedbackBox.classList.add('feedback-blunder');
    }
}

function loadOpening(file) {
    $.getJSON(file, (data) => {
        openingTree = {};
        openingColor = data.color;
        
        data.lines.forEach(line => {
            let shadowGame = new Chess();
            line.sequence.forEach(step => {
                const fen = shadowGame.fen();
                if (!openingTree[fen]) {
                    openingTree[fen] = { expectedMoves: [], opponentResponses: [] };
                }
                
                if (step.response) {
                    if (!openingTree[fen].opponentResponses.find(m => m.move === step.move)) {
                        openingTree[fen].opponentResponses.push({ move: step.move });
                    }
                } else {
                    if (!openingTree[fen].expectedMoves.find(m => m.move === step.move)) {
                        openingTree[fen].expectedMoves.push({ move: step.move, note: step.note });
                    }
                }
                
                shadowGame.move(step.move, { sloppy: true });
            });
        });
        
        appMode = 'TRAINER';
        $('#opening-selection-screen').removeClass('active');
        $('#game-screen').addClass('active');
        $('#trainer-panel').show();
        board.resize();
        game.reset();
        board.start();
        
        if (openingColor === 'b') {
            board.orientation('black');
            playTrainerOpponentMove();
        } else {
            board.orientation('white');
        }
        
        document.getElementById('trainer-notes').innerText = `Training: ${data.name}\n\nMake your first move!`;
        window.electronAPI.startContinuousEval(game.fen());
    });
}

function playTrainerOpponentMove() {
    const fen = game.fen();
    const node = openingTree[fen];
    if (node && node.opponentResponses.length > 0) {
        // Randomly pick a response
        const response = node.opponentResponses[Math.floor(Math.random() * node.opponentResponses.length)];
        
        setTimeout(() => {
            const from = response.move.substring(0, 2);
            const to = response.move.substring(2, 4);
            const promotion = response.move.length === 5 ? response.move[4] : undefined;

            game.move({ from, to, promotion });
            board.position(game.fen());
            updateStatus();
            window.electronAPI.startContinuousEval(game.fen());
        }, 500); 
    } else {
        document.getElementById('trainer-notes').innerText += "\n\nLine completed! Excellent job. You can restart to try another variation.";
        window.electronAPI.startContinuousEval(game.fen());
    }
}

function onDragStart (source, piece, position, orientation) {
    if (game.game_over()) return false;
    if (orientation === 'white' && piece.search(/^b/) !== -1) return false;
    if (orientation === 'black' && piece.search(/^w/) !== -1) return false;
}

function onDrop(source, target) {
    if (appMode === 'TRAINER') {
        const moveStr = source + target;
        const fen = game.fen();
        const node = openingTree[fen];
        
        if (!node || node.expectedMoves.length === 0) {
            // Reached the end of the line but user continues playing
            document.getElementById('trainer-notes').innerText = "Line completed! You are now in Free Play mode against Stockfish.";
            appMode = 'FREE_PLAY'; 
            return runFreePlayDrop(source, target);
        }
        
        // Check if user move is expected
        const expected = node.expectedMoves.find(m => m.move === moveStr || m.move.startsWith(moveStr));
        if (expected) {
            const move = game.move({ from: source, to: target, promotion: 'q' });
            if (move === null) return 'snapback';
            
            document.getElementById('trainer-notes').innerText = expected.note || "Correct move!";
            updateStatus();
            
            window.electronAPI.stopContinuousEval();
            playTrainerOpponentMove();
        } else {
            document.getElementById('trainer-notes').innerText = "Incorrect move for this opening. Try again!";
            return 'snapback';
        }
    } else {
        return runFreePlayDrop(source, target);
    }
}

function runFreePlayDrop (source, target) {
    const prevEval = currentEval; 
    window.electronAPI.stopContinuousEval();

    const move = game.move({
        from: source,
        to: target,
        promotion: 'q'
    });

    if (move === null) {
        window.electronAPI.startContinuousEval(game.fen());
        return 'snapback';
    }

    updateStatus();
    moveFeedbackBox.innerText = "Engine thinking...";
    moveFeedbackBox.className = '';

    window.electronAPI.requestEngineMove(game.fen()).then(engineResult => {
        const engineUciMove = engineResult ? engineResult.move : null;
        const score = engineResult && engineResult.score ? normalizeScore(engineResult.score) : "0.0"; 
        
        calculateFeedback(prevEval, score);
        updateEvalUI(score);

        if (engineUciMove && engineUciMove !== '(none)' && engineUciMove.length >= 4) {
            const from = engineUciMove.substring(0, 2);
            const to = engineUciMove.substring(2, 4);
            const promotion = engineUciMove.length === 5 ? engineUciMove[4] : undefined;

            const res = game.move({ from, to, promotion });
            if (res) {
                board.position(game.fen());
            }
        }
        
        updateStatus();
        if (!game.game_over()) {
            window.electronAPI.startContinuousEval(game.fen());
        }
    }).catch(err => {
        console.error('Engine move error:', err);
        updateStatus();
    });
}

function onSnapEnd () {
    board.position(game.fen());
}

function updateStatus () {
    if (game.in_checkmate()) {
        statusBox.innerText = `Game over, ${game.turn() === 'w' ? 'Black' : 'White'} wins by checkmate!`;
    } else if (game.in_draw()) {
        statusBox.innerText = 'Game over, drawn position';
    } else {
        statusBox.innerText = game.turn() === 'w' ? "Your turn (White)" : "Your turn (Black)";
        if (appMode === 'FREE_PLAY' && game.turn() === 'b') {
            statusBox.innerText = "Engine is thinking...";
        } else if (appMode === 'TRAINER' && game.turn() !== openingColor) {
            statusBox.innerText = "Trainer is thinking...";
        }
    }
}

const config = {
    draggable: true,
    position: 'start',
    pieceTheme: customPieceTheme,
    onDragStart: onDragStart,
    onDrop: onDrop,
    onSnapEnd: onSnapEnd
};

$(document).ready(() => {
    board = Chessboard('board', config);

    window.electronAPI.onEngineEvaluation((scoreStr) => {
        const score = normalizeScore(scoreStr);
        updateEvalUI(score);
    });

    $('#btn-free-play').on('click', () => {
        appMode = 'FREE_PLAY';
        $('#trainer-panel').hide();
        board.orientation('white');
        
        $('#home-screen').removeClass('active');
        $('#game-screen').addClass('active');
        board.resize();
        window.electronAPI.startContinuousEval(game.fen());
    });

    $('#btn-opening-trainer').on('click', () => {
        $('#home-screen').removeClass('active');
        $('#opening-selection-screen').addClass('active');
    });

    $('#btn-back-home').on('click', () => {
        $('#opening-selection-screen').removeClass('active');
        $('#home-screen').addClass('active');
    });

    $('.opening-btn').on('click', function() {
        const file = $(this).data('file');
        loadOpening(file);
    });

    $('#btn-back-menu').on('click', () => {
        window.electronAPI.stopContinuousEval();
        $('#game-screen').removeClass('active');
        $('#home-screen').addClass('active');
    });

    $('#btn-takeback').on('click', () => {
        if (game.turn() === openingColor || appMode === 'FREE_PLAY') {
            window.electronAPI.stopContinuousEval();
            game.undo(); 
            game.undo(); 
            board.position(game.fen());
            
            moveFeedbackBox.innerText = "";
            moveFeedbackBox.className = '';
            if (appMode === 'TRAINER') {
                document.getElementById('trainer-notes').innerText = "Takeback played. Try again!";
            }
            
            updateStatus();
            window.electronAPI.startContinuousEval(game.fen());
        }
    });

    $('#btn-restart').on('click', () => {
        window.electronAPI.stopContinuousEval();
        game.reset();
        board.start();
        currentEval = 0.0;
        updateEvalUI("0.0");
        moveFeedbackBox.innerText = "";
        
        if (appMode === 'TRAINER') {
            document.getElementById('trainer-notes').innerText = "Training restarted. Make your first move!";
            if (openingColor === 'b') {
                playTrainerOpponentMove();
            }
        }
        
        updateStatus();
        window.electronAPI.startContinuousEval(game.fen());
    });
});