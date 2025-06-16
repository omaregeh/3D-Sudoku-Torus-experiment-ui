document.addEventListener('DOMContentLoaded', () => {
    let sudokuSolution = [];

    // Set up the scene, camera, and renderer
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, (window.innerWidth * 0.7) / window.innerHeight, 0.01, 100);
    camera.position.set(0, 3, 1.5);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth * 0.7, window.innerHeight);
    document.body.appendChild(renderer.domElement);
    
    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.1);
    directionalLight.position.set(15, 25, 15);  // Moved light further back
    scene.add(directionalLight);

    // Set up groups
    const loader = new THREE.GLTFLoader();
    const cellsGroup = new THREE.Group();
    const bordersGroup = new THREE.Group();
    const numbersGroup = new THREE.Group();
    const notesGroup = new THREE.Group();
    const decorativeGroup = new THREE.Group();

    // Get the scaling factor based on screen size
    const scaleFactor = window.innerWidth < 768 ? 6.5 : 5;  // Larger scale for mobile

    // Scale all groups
    cellsGroup.scale.set(scaleFactor, scaleFactor, scaleFactor);
    bordersGroup.scale.set(scaleFactor, scaleFactor, scaleFactor);
    numbersGroup.scale.set(scaleFactor, scaleFactor, scaleFactor);
    notesGroup.scale.set(scaleFactor, scaleFactor, scaleFactor);
    decorativeGroup.scale.set(scaleFactor * 0.3, scaleFactor * 0.3, scaleFactor * 0.3); // Smaller scale for golf ball
    
    // Add groups to scene
    scene.add(cellsGroup);
    scene.add(bordersGroup);
    scene.add(numbersGroup);
    scene.add(notesGroup);
    scene.add(decorativeGroup);

    // Constants for colors
    const COLORS = {
        DEFAULT_CELL: 0xFFFFFF,
        SELECTED_CELL: 0xFF8C00,  // Dark orange
        RELATED_CELL: 0xFFFF00,   // Original yellow
        GIVEN_NUMBER: 0x8B0000,   // Dark red
        PLAYER_NUMBER: 0x000000,  // Black
        GIVEN_CELL: 0xD3D3D3
    };

    // Camera controls - make globally accessible for golf ball trackball functionality
    const controls = new THREE.TrackballControls(camera, renderer.domElement);
    controls.rotateSpeed = 5.0;
    controls.dynamicDampingFactor = 0.3;
    controls.noZoom = true;
    controls.noPan = true;
    controls.target.set(0, 0, 0);  // Adjusted to match camera lookAt
    controls.update();
    
    window.camera = camera;
    window.controls = controls;

    // Game state variables
    let selectedCell = null;
    let currentInputMode = "numbers";
    let currentDifficulty = 'Beginner';
    let gameTimer = 0;
    let timerInterval = null;
    let gameStartTime = null;
    let gameInProgress = false;
    const editableCells = new Set();
    const displayedNumbers = {};
    let sudokuGrid = Array(9).fill().map(() => Array(9).fill(null));
    let gameStats = JSON.parse(localStorage.getItem('sudokuStats')) || {
        gamesPlayed: 0,
        bestTimes: {},
        currentStreak: 0,
        achievements: []
    };

    // Create modern game header
    const gameHeader = document.createElement('div');
    gameHeader.className = 'game-header';
    gameHeader.innerHTML = `
        <div class="difficulty-selector">
            <button class="difficulty-btn active" data-difficulty="Beginner">Beginner</button>
            <button class="difficulty-btn" data-difficulty="Intermediate">Intermediate</button>
            <button class="difficulty-btn" data-difficulty="Expert">Expert</button>
            <button class="difficulty-btn" data-difficulty="Master">Master</button>
        </div>
        <div class="timer-display">00:00</div>
    `;
    document.body.appendChild(gameHeader);

    // Create floating action button for new game
    const fab = document.createElement('button');
    fab.className = 'fab';
    fab.innerHTML = '🎲';
    fab.title = 'New Game';
    document.body.appendChild(fab);

    // UI Setup with new layout
    const controlPanel = document.createElement('div');
    controlPanel.className = 'control-panel';
    document.body.appendChild(controlPanel);

    // Create number pad container
    const numberPad = document.createElement('div');
    numberPad.className = 'number-pad';
    controlPanel.appendChild(numberPad);

    // Number buttons
    for (let i = 1; i <= 9; i++) {
        const button = document.createElement('button');
        button.innerText = i;
        button.addEventListener('click', () => {
            if (selectedCell) {
                inputNumber(i);
            }
        });
        // Add touch event listener for mobile
        button.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (selectedCell) {
                inputNumber(i);
            }
        }, { passive: false });
        numberPad.appendChild(button);
    }

    // Create utility buttons container
    const utilityButtons = document.createElement('div');
    utilityButtons.className = 'utility-buttons';
    controlPanel.appendChild(utilityButtons);

    // Mode toggle button
    const modeToggle = document.createElement('button');
    modeToggle.innerText = "Toggle: Numbers";
    modeToggle.addEventListener('click', () => {
        currentInputMode = currentInputMode === "numbers" ? "additionalNumbers" : "numbers";
        modeToggle.innerText = `Toggle: ${currentInputMode === "numbers" ? "Numbers" : "Additional Numbers"}`;
    });
    modeToggle.addEventListener('touchstart', (e) => {
        e.preventDefault();
        currentInputMode = currentInputMode === "numbers" ? "additionalNumbers" : "numbers";
        modeToggle.innerText = `Toggle: ${currentInputMode === "numbers" ? "Numbers" : "Additional Numbers"}`;
    }, { passive: false });
    utilityButtons.appendChild(modeToggle);

    // Erase button
    const eraseButton = document.createElement('button');
    eraseButton.innerText = "Erase";
    eraseButton.addEventListener('click', () => {
        if (selectedCell) {
            eraseCell(selectedCell.cellName);
        }
    });
    eraseButton.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (selectedCell) {
            eraseCell(selectedCell.cellName);
        }
    }, { passive: false });
    utilityButtons.appendChild(eraseButton);
    // Helper Functions
    function checkSolution() {
        // Check if puzzle is complete (no empty cells)
        for (let row = 0; row < 9; row++) {
            for (let col = 0; col < 9; col++) {
                if (!sudokuGrid[row][col]) {
                    return false;
                }
            }
        }

        // Compare with solution
        for (let row = 0; row < 9; row++) {
            for (let col = 0; col < 9; col++) {
                if (sudokuGrid[row][col] !== sudokuSolution[row][col]) {
                    return false;
                }
            }
        }

        return true;
    }

    function isValidSudokuMove(grid, row, col, num) {
        for (let x = 0; x < 9; x++) {
            if (x !== col && grid[row][x] === num) return false;
        }
        
        for (let x = 0; x < 9; x++) {
            if (x !== row && grid[x][col] === num) return false;
        }
        
        const startRow = Math.floor(row / 3) * 3;
        const startCol = Math.floor(col / 3) * 3;
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                const checkRow = startRow + i;
                const checkCol = startCol + j;
                if ((checkRow !== row || checkCol !== col) && grid[checkRow][checkCol] === num) {
                    return false;
                }
            }
        }
        return true;
    }
    
    function generatePuzzle(difficulty = 'Beginner') {
        const difficultySettings = {
            'Beginner': { minClues: 45, maxClues: 50 },
            'Intermediate': { minClues: 35, maxClues: 44 }, 
            'Expert': { minClues: 25, maxClues: 34 },
            'Master': { minClues: 17, maxClues: 24 }
        };
        
        const { minClues, maxClues } = difficultySettings[difficulty];
        
        const solution = generateValidCompleteSolution();
        
        // Create puzzle by removing numbers
        const puzzle = solution.map(row => [...row]);
        const targetClues = minClues + Math.floor(Math.random() * (maxClues - minClues + 1));
        const cellsToRemove = 81 - targetClues;
        
        const positions = [];
        for (let row = 0; row < 9; row++) {
            for (let col = 0; col < 9; col++) {
                positions.push([row, col]);
            }
        }
        
        for (let i = positions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [positions[i], positions[j]] = [positions[j], positions[i]];
        }
        
        // Remove cells
        for (let i = 0; i < cellsToRemove && i < positions.length; i++) {
            const [row, col] = positions[i];
            puzzle[row][col] = 0;
        }
        
        return { 
            sudokuBoard: puzzle, 
            sudokuSolution: solution,
            rating: (maxClues - targetClues) / (maxClues - minClues) * 4
        };
    }
    
    function convertToGrid(flatArray) {
        const grid = [];
        for (let i = 0; i < 9; i++) {
            grid.push(flatArray.slice(i * 9, (i + 1) * 9).map(cell => cell === null ? 0 : cell));
        }
        return grid;
    }

    function generateValidCompleteSolution() {
        const baseSolution = [
            [5, 3, 4, 6, 7, 8, 9, 1, 2],
            [6, 7, 2, 1, 9, 5, 3, 4, 8],
            [1, 9, 8, 3, 4, 2, 5, 6, 7],
            [8, 5, 9, 7, 6, 1, 4, 2, 3],
            [4, 2, 6, 8, 5, 3, 7, 9, 1],
            [7, 1, 3, 9, 2, 4, 8, 5, 6],
            [9, 6, 1, 5, 3, 7, 2, 8, 4],
            [2, 8, 7, 4, 1, 9, 6, 3, 5],
            [3, 4, 5, 2, 8, 6, 1, 7, 9]
        ];
        
        const solution = baseSolution.map(row => [...row]);
        
        for (let block = 0; block < 3; block++) {
            if (Math.random() < 0.5) {
                const row1 = block * 3 + Math.floor(Math.random() * 3);
                const row2 = block * 3 + Math.floor(Math.random() * 3);
                [solution[row1], solution[row2]] = [solution[row2], solution[row1]];
            }
        }
        
        return solution;
    }

    function startTimer() {
        if (!gameInProgress) {
            gameStartTime = Date.now();
            gameInProgress = true;
            timerInterval = setInterval(updateTimer, 1000);
        }
    }

    function stopTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
        gameInProgress = false;
    }

    function updateTimer() {
        if (gameStartTime) {
            gameTimer = Math.floor((Date.now() - gameStartTime) / 1000);
            document.querySelector('.timer-display').textContent = formatTime(gameTimer);
        }
    }

    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    function updateGameStats(difficulty, completionTime) {
        gameStats.gamesPlayed++;
        gameStats.currentStreak++;
        
        if (!gameStats.bestTimes[difficulty] || completionTime < gameStats.bestTimes[difficulty]) {
            gameStats.bestTimes[difficulty] = completionTime;
            showAchievement(`New ${difficulty} record: ${formatTime(completionTime)}!`);
        }
        
        checkAchievements();
        localStorage.setItem('sudokuStats', JSON.stringify(gameStats));
    }
    
    function checkAchievements() {
        const achievements = [
            { id: 'first_win', name: 'First Victory', condition: () => gameStats.gamesPlayed === 1 },
            { id: 'speed_demon', name: 'Speed Demon', condition: () => gameStats.bestTimes.Expert && gameStats.bestTimes.Expert < 300 },
            { id: 'streak_5', name: 'Hot Streak', condition: () => gameStats.currentStreak >= 5 },
            { id: 'master_solver', name: 'Master Solver', condition: () => gameStats.bestTimes.Master }
        ];
        
        achievements.forEach(achievement => {
            if (!gameStats.achievements.includes(achievement.id) && achievement.condition()) {
                gameStats.achievements.push(achievement.id);
                showAchievement(`Achievement Unlocked: ${achievement.name}!`);
            }
        });
    }

    function showAchievement(message) {
        const achievement = document.createElement('div');
        achievement.className = 'achievement-toast';
        achievement.textContent = message;
        document.body.appendChild(achievement);
        
        setTimeout(() => {
            achievement.classList.add('show');
        }, 100);
        
        setTimeout(() => {
            achievement.classList.remove('show');
            setTimeout(() => {
                if (document.body.contains(achievement)) {
                    document.body.removeChild(achievement);
                }
            }, 300);
        }, 3000);
    }

    function showCelebration(completionTime) {
        stopTimer();
        
        const celebration = document.createElement('div');
        celebration.className = 'celebration-overlay';
        celebration.innerHTML = `
            <div class="celebration-content">
                <div class="celebration-icon">🎉</div>
                <h2>Puzzle Solved!</h2>
                <p class="completion-time">Time: ${formatTime(completionTime)}</p>
                <p class="difficulty-label">Difficulty: ${currentDifficulty}</p>
                <div class="celebration-stats">
                    <span>Games Played: ${gameStats.gamesPlayed}</span>
                    <span>Current Streak: ${gameStats.currentStreak}</span>
                </div>
                <p class="next-puzzle-text">Next puzzle loading...</p>
            </div>
        `;
        document.body.appendChild(celebration);
        
        createConfetti();
        
        setTimeout(() => {
            if (document.body.contains(celebration)) {
                document.body.removeChild(celebration);
            }
        }, 3000);
    }
    
    function createConfetti() {
        for (let i = 0; i < 50; i++) {
            const confetti = document.createElement('div');
            confetti.className = 'confetti';
            confetti.style.left = Math.random() * 100 + '%';
            confetti.style.animationDelay = Math.random() * 3 + 's';
            confetti.style.backgroundColor = `hsl(${Math.random() * 360}, 70%, 60%)`;
            document.body.appendChild(confetti);
            
            setTimeout(() => {
                if (document.body.contains(confetti)) {
                    document.body.removeChild(confetti);
                }
            }, 3000);
        }
    }

    function startNewGame(difficulty = currentDifficulty) {
        stopTimer();
        gameTimer = 0;
        document.querySelector('.timer-display').textContent = '00:00';
        
        currentDifficulty = difficulty;
        
        document.querySelectorAll('.difficulty-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.difficulty === difficulty);
        });
        
        clearGame();
        
        const puzzleData = generatePuzzle(difficulty);
        sudokuSolution = puzzleData.sudokuSolution;
        sudokuGrid = puzzleData.sudokuBoard.map(row => [...row]);
        
        loadGameWithData(puzzleData);
    }

    function clearGame() {
        editableCells.clear();
        Object.keys(displayedNumbers).forEach(key => delete displayedNumbers[key]);
        
        numbersGroup.children.slice().forEach(child => {
            numbersGroup.remove(child);
            child.traverse((node) => {
                if (node.isMesh) {
                    node.geometry.dispose();
                    node.material.dispose();
                }
            });
        });
        
        notesGroup.children.slice().forEach(child => {
            notesGroup.remove(child);
            child.traverse((node) => {
                if (node.isMesh) {
                    node.geometry.dispose();
                    node.material.dispose();
                }
            });
        });
        
        cellsGroup.children.forEach(cell => {
            cell.traverse(child => {
                if (child.isMesh) {
                    child.material.color.setHex(COLORS.DEFAULT_CELL);
                }
            });
        });
        
        selectedCell = null;
    }

    function getCellCoordinates(cellName) {
        const subGrid = parseInt(cellName.split('_')[1]) - 1;
        const cellRow = parseInt(cellName.split('_')[3]) - 1;
        const cellCol = parseInt(cellName.split('_')[4]) - 1;
        
        const gridRow = Math.floor(subGrid / 3) * 3;
        const gridCol = (subGrid % 3) * 3;
        
        return {
            row: gridRow + cellRow,
            col: gridCol + cellCol,
            subGrid: subGrid + 1
        };
    }

    function getRelatedCells(cellName) {
        const coords = getCellCoordinates(cellName);
        const related = new Set();
        
        // Get all cells in the same row
        for (let col = 0; col < 9; col++) {
            const subGrid = Math.floor(coords.row / 3) * 3 + Math.floor(col / 3) + 1;
            const cellInRow = `Sub_${subGrid}_Cell_${(coords.row % 3) + 1}_${(col % 3) + 1}`;
            related.add(cellInRow);
        }
        
        // Get all cells in the same column
        for (let row = 0; row < 9; row++) {
            const subGrid = Math.floor(row / 3) * 3 + Math.floor(coords.col / 3) + 1;
            const cellInCol = `Sub_${subGrid}_Cell_${(row % 3) + 1}_${(coords.col % 3) + 1}`;
            related.add(cellInCol);
        }
        
        // Get all cells in the same 3x3 square
        const squareStartRow = Math.floor(coords.row / 3) * 3;
        const squareStartCol = Math.floor(coords.col / 3) * 3;
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                const row = squareStartRow + r;
                const col = squareStartCol + c;
                const subGrid = Math.floor(row / 3) * 3 + Math.floor(col / 3) + 1;
                const cellInSquare = `Sub_${subGrid}_Cell_${(row % 3) + 1}_${(col % 3) + 1}`;
                related.add(cellInSquare);
            }
        }
        
        return Array.from(related);
    }

    function highlightRelatedCells(cellName, highlight = true) {
        const relatedCells = getRelatedCells(cellName);
        relatedCells.forEach(relatedCell => {
            if (relatedCell !== cellName) {  // Don't change the selected cell's color
                const cellData = displayedNumbers[relatedCell];
                if (!cellData?.isGiven) {  // Don't highlight given cells
                    colorCell(relatedCell.split('_')[1], relatedCell, 
                        highlight ? COLORS.RELATED_CELL : COLORS.DEFAULT_CELL);
                }
            }
        });
    }

    function updateAutomaticNotes(cellName, placedNumber) {
        const relatedCells = getRelatedCells(cellName);
        relatedCells.forEach(relatedCell => {
            if (editableCells.has(relatedCell)) {
                // Remove the placed number from notes in related cells
                const noteFile = `New_Number_${placedNumber}`;
                const fullNoteName = `${relatedCell}_${noteFile}`;
                const model = notesGroup.getObjectByName(fullNoteName);
                if (model) {
                    notesGroup.remove(model);
                    model.traverse((child) => {
                        if (child.isMesh) {
                            child.geometry.dispose();
                            child.material.dispose();
                        }
                    });
                }
            }
        });
    }

    window.createUIGolfBall = function() {
        // Remove any existing golf ball first
        const existingGolfBall = document.getElementById('ui-golf-ball');
        if (existingGolfBall) {
            existingGolfBall.remove();
        }
        
        const golfBall = document.createElement('div');
        golfBall.id = 'ui-golf-ball';
        golfBall.style.cssText = `
            position: fixed;
            bottom: 80px;
            right: 30px;
            width: 60px;
            height: 60px;
            background: radial-gradient(circle at 30% 30%, #4a90e2, #2563eb, #1e40af);
            border-radius: 50%;
            z-index: 9999;
            cursor: grab;
            border: 4px solid rgba(255, 255, 255, 0.8);
            box-shadow: 
                0 0 30px rgba(37, 99, 235, 1.0),
                0 8px 16px rgba(37, 99, 235, 0.5),
                inset -3px -3px 6px rgba(0, 0, 0, 0.3),
                inset 3px 3px 6px rgba(255, 255, 255, 0.4);
            opacity: 1;
            visibility: visible;
            display: block;
            pointer-events: auto;
            touch-action: none;
            user-select: none;
        `;
        
        const canvas = document.querySelector('canvas');
        
        // Create trackball rotation function using synthetic mouse events
        window.rotateTorusCamera = function(deltaX, deltaY) {
            if (canvas) {
                const rect = canvas.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;
                
                // Create synthetic mouse events on canvas to trigger existing TrackballControls
                const mouseDown = new MouseEvent('mousedown', {
                    clientX: centerX,
                    clientY: centerY,
                    button: 0,
                    bubbles: true
                });
                
                const mouseMove = new MouseEvent('mousemove', {
                    clientX: centerX + deltaX,
                    clientY: centerY + deltaY,
                    button: 0,
                    bubbles: true
                });
                
                const mouseUp = new MouseEvent('mouseup', {
                    clientX: centerX + deltaX,
                    clientY: centerY + deltaY,
                    button: 0,
                    bubbles: true
                });
                
                canvas.dispatchEvent(mouseDown);
                setTimeout(() => {
                    canvas.dispatchEvent(mouseMove);
                    setTimeout(() => {
                        canvas.dispatchEvent(mouseUp);
                    }, 10);
                }, 10);
                
                return true;
            }
            return false;
        };
        
        // Trackball functionality variables
        let isDragging = false;
        let lastMouseX = 0;
        let lastMouseY = 0;
        
        golfBall.addEventListener('mousedown', function(e) {
            isDragging = true;
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
            this.style.cursor = 'grabbing';
            e.preventDefault();
        });
        
        document.addEventListener('mousemove', function(e) {
            if (!isDragging) return;
            
            const deltaX = e.clientX - lastMouseX;
            const deltaY = e.clientY - lastMouseY;
            
            if (window.rotateTorusCamera) {
                window.rotateTorusCamera(deltaX * 2, deltaY * 2); // Scale for better sensitivity
            }
            
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
        });
        
        document.addEventListener('mouseup', function() {
            if (isDragging) {
                isDragging = false;
                golfBall.style.cursor = 'grab';
            }
        });
        
        golfBall.addEventListener('touchstart', function(e) {
            isDragging = true;
            const touch = e.touches[0];
            lastMouseX = touch.clientX;
            lastMouseY = touch.clientY;
            e.preventDefault();
        });
        
        document.addEventListener('touchmove', function(e) {
            if (!isDragging) return;
            
            const touch = e.touches[0];
            const deltaX = touch.clientX - lastMouseX;
            const deltaY = touch.clientY - lastMouseY;
            
            if (window.rotateTorusCamera) {
                window.rotateTorusCamera(deltaX * 2, deltaY * 2);
            }
            
            lastMouseX = touch.clientX;
            lastMouseY = touch.clientY;
            e.preventDefault();
        });
        
        document.addEventListener('touchend', function() {
            isDragging = false;
        });
        
        document.body.appendChild(golfBall);
        console.log('Blue trackball golf ball successfully added to UI button section with touch controls');
    };

    function eraseCell(cellName) {
        const cellData = displayedNumbers[cellName];
        if (!cellData || cellData.isGiven) return;
        
        // Remove regular number
        removeOldNumber(cellName);
        
        // Remove all additional numbers in the cell
        const notesToRemove = [];
        notesGroup.children.forEach(note => {
            if (note.name.startsWith(cellName)) {
                notesToRemove.push(note);
            }
        });
        
        notesToRemove.forEach(note => {
            notesGroup.remove(note);
            note.traverse((child) => {
                if (child.isMesh) {
                    child.geometry.dispose();
                    child.material.dispose();
                }
            });
        });

        // Update game state
        const coords = getCellCoordinates(cellName);
        sudokuGrid[coords.row][coords.col] = null;
    }
    // Load game data
    Promise.all([
        fetch('partsList.json').then(response => response.json())
    ]).then(([partsListData]) => {
        const { borders, cells } = partsListData;

        // Load borders
        borders.forEach(border => {
            loader.load(`assets/Borders/${border}.gltf`, (gltf) => {
                const part = gltf.scene;
                part.name = border;
                bordersGroup.add(part);
            });
        });

        // Load cells
        cells.forEach(cell => {
            loader.load(`assets/Cells/${cell}.gltf`, (gltf) => {
                const part = gltf.scene;
                part.name = cell;
                part.traverse((child) => {
                    if (child.isMesh) {
                        child.material = new THREE.MeshLambertMaterial({ color: COLORS.DEFAULT_CELL });
                    }
                });
                cellsGroup.add(part);
            });
        });

        setTimeout(() => {
            startNewGame('Beginner');
            // Create decorative golf ball after UI is fully initialized
            setTimeout(() => {
                if (typeof window.createUIGolfBall === 'function') {
                    window.createUIGolfBall();
                }
            }, 500);
        }, 1000);
    }).catch(error => console.error('Error loading game data:', error));

    function loadGameWithData(gameData) {
        const { sudokuBoard } = gameData;
        
        fetch('partsList.json').then(response => response.json()).then(partsListData => {
            const { cells } = partsListData;
            setupSudokuMechanics(cells, sudokuBoard);
        });
    }

    function setupSudokuMechanics(cells, sudokuBoard) {
        sudokuBoard.forEach((row, rowIndex) => {
            row.forEach((cell, colIndex) => {
                const subGrid = Math.floor(rowIndex / 3) * 3 + Math.floor(colIndex / 3) + 1;
                const cellName = `Sub_${subGrid}_Cell_${(rowIndex % 3) + 1}_${(colIndex % 3) + 1}`;
                const cellCoords = `${(rowIndex % 3) + 1}_${(colIndex % 3) + 1}`;
                
                if (cell !== 0) {
                    // Load given numbers
                    const numberFile = `Number_${cell}`;
                    const numberPath = `assets/Numbers/${subGrid}/Cell_${cellCoords}/${numberFile}.gltf`;
                    
                    loader.load(numberPath, (gltf) => {
                        const part = gltf.scene;
                        part.name = `${cellName}_${numberFile}`;
                        part.traverse((child) => {
                            if (child.isMesh) {
                                child.material = new THREE.MeshLambertMaterial({ color: COLORS.GIVEN_NUMBER });
                            }
                        });
                        numbersGroup.add(part);
                    });

                    colorCell(subGrid, cellName, COLORS.GIVEN_CELL);
                    displayedNumbers[cellName] = {
                        number: cell,
                        modelName: `${cellName}_${numberFile}`,
                        isGiven: true
                    };
                } else {
                    editableCells.add(cellName);
                    colorCell(subGrid, cellName, COLORS.DEFAULT_CELL);
                    displayedNumbers[cellName] = {
                        number: null,
                        modelName: null,
                        isGiven: false
                    };
                }
            });
        });
    }

    function colorCell(subGrid, cellName, color) {
        const targetCell = cellsGroup.getObjectByName(cellName);
        if (targetCell) {
            targetCell.traverse(child => {
                if (child.isMesh) {
                    child.material.color.setHex(color);
                }
            });
        }
    }

    function removeOldNumber(cellName) {
        const cellData = displayedNumbers[cellName];
        if (!cellData || cellData.isGiven) return;
        
        if (cellData.modelName) {
            const model = numbersGroup.getObjectByName(cellData.modelName);
            if (model) {
                numbersGroup.remove(model);
                model.traverse((child) => {
                    if (child.isMesh) {
                        child.geometry.dispose();
                        child.material.dispose();
                    }
                });
            }
            cellData.number = null;
            cellData.modelName = null;
        }
    }
    function inputNumber(number) {
        if (!selectedCell || !editableCells.has(selectedCell.cellName)) return;
        
        startTimer();
        
        const cellData = displayedNumbers[selectedCell.cellName];
        if (!cellData || cellData.isGiven) return;

        const { subGrid, cellName } = selectedCell;
        const cellCoords = `${cellName.split('_')[3]}_${cellName.split('_')[4]}`;
        
        if (currentInputMode === "numbers") {
            const validationCoords = getCellCoordinates(cellName);
            if (!isValidSudokuMove(sudokuGrid, validationCoords.row, validationCoords.col, number)) {
                const invalidFeedback = document.createElement('div');
                invalidFeedback.className = 'invalid-move-toast';
                invalidFeedback.textContent = 'Invalid move! Number already exists in row, column, or box.';
                invalidFeedback.style.cssText = `
                    position: fixed; top: 20px; right: 20px;
                    background: linear-gradient(135deg, #ff6b6b, #ee5a52);
                    color: white; padding: 12px 20px; border-radius: 8px;
                    box-shadow: 0 4px 12px rgba(255, 107, 107, 0.3);
                    font-weight: 500; z-index: 1000;
                    transform: translateX(100%); transition: transform 0.3s ease;
                `;
                document.body.appendChild(invalidFeedback);
                
                setTimeout(() => invalidFeedback.style.transform = 'translateX(0)', 100);
                setTimeout(() => {
                    invalidFeedback.style.transform = 'translateX(100%)';
                    setTimeout(() => document.body.removeChild(invalidFeedback), 300);
                }, 2000);
                
                return; // Don't place the number
            }
            
            // Remove old number first
            removeOldNumber(cellName);
            
            // Remove all additional numbers in the cell
            const notesToRemove = [];
            notesGroup.children.forEach(note => {
                if (note.name.startsWith(cellName)) {
                    notesToRemove.push(note);
                }
            });
            
            notesToRemove.forEach(note => {
                notesGroup.remove(note);
                note.traverse((child) => {
                    if (child.isMesh) {
                        child.geometry.dispose();
                        child.material.dispose();
                    }
                });
            });
            
            const numberFile = `Number_${number}`;
            const numberPath = `assets/Numbers/${subGrid}/Cell_${cellCoords}/${numberFile}.gltf`;
            
            loader.load(numberPath, (gltf) => {
                const part = gltf.scene;
                part.name = `${cellName}_${numberFile}`;
                part.traverse((child) => {
                    if (child.isMesh) {
                        child.material = new THREE.MeshLambertMaterial({ color: COLORS.PLAYER_NUMBER });
                    }
                });
                numbersGroup.add(part);
            });

            displayedNumbers[cellName] = {
                ...displayedNumbers[cellName],
                number: number,
                modelName: `${cellName}_${numberFile}`
            };

            // Update sudoku grid
            const coords = getCellCoordinates(cellName);
            sudokuGrid[coords.row][coords.col] = number;

            // Update automatic notes
            updateAutomaticNotes(cellName, number);

            // Check if puzzle is solved
            if (checkSolution()) {
                const completionTime = gameTimer;
                updateGameStats(currentDifficulty, completionTime);
                showCelebration(completionTime);
                
                setTimeout(() => {
                    startNewGame(currentDifficulty);
                }, 3000);
            }
        } else {
            // First remove any regular number if it exists
            if (displayedNumbers[cellName].number !== null) {
                removeOldNumber(cellName);
                const coords = getCellCoordinates(cellName);
                sudokuGrid[coords.row][coords.col] = null;
            }

            // Handle helper numbers
            const noteFile = `New_Number_${number}`;
            const notePath = `assets/AdditionalNumbers/${subGrid}/Cell_${cellCoords}/${noteFile}.gltf`;
            const fullNoteName = `${cellName}_${noteFile}`;

            if (notesGroup.getObjectByName(fullNoteName)) {
                // Remove if exists
                const model = notesGroup.getObjectByName(fullNoteName);
                notesGroup.remove(model);
                model.traverse((child) => {
                    if (child.isMesh) {
                        child.geometry.dispose();
                        child.material.dispose();
                    }
                });
            } else {
                // Add new helper number
                loader.load(notePath, (gltf) => {
                    const part = gltf.scene;
                    part.name = fullNoteName;
                    part.traverse((child) => {
                        if (child.isMesh) {
                            child.material = new THREE.MeshLambertMaterial({ color: COLORS.PLAYER_NUMBER });
                        }
                    });
                    notesGroup.add(part);
                });
            }
        }
    }

    // Updated pointer event handling for both mouse and touch
    function onPointerEvent(event) {
        // Prevent default touch behaviors
        event.preventDefault();

        // Get position from either mouse or touch event
        const pointer = event.touches ? event.touches[0] : event;
        const mouse = new THREE.Vector2();
        
        // Get the correct coordinates
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((pointer.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((pointer.clientY - rect.top) / rect.height) * 2 + 1;

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, camera);

        const intersects = raycaster.intersectObjects(cellsGroup.children, true);
        if (intersects.length > 0) {
            const intersected = intersects[0].object;
            const cellName = intersected.parent.name;

            if (editableCells.has(cellName)) {
                // Reset previous highlighting
                if (selectedCell) {
                    highlightRelatedCells(selectedCell.cellName, false);
                    colorCell(selectedCell.subGrid, selectedCell.cellName, 
                        displayedNumbers[selectedCell.cellName].isGiven ? COLORS.GIVEN_CELL : COLORS.DEFAULT_CELL);
                }
                
                selectedCell = { 
                    subGrid: cellName.split('_')[1], 
                    cellName 
                };
                
                // Highlight new selection and related cells
                colorCell(selectedCell.subGrid, selectedCell.cellName, COLORS.SELECTED_CELL);
                highlightRelatedCells(selectedCell.cellName, true);
            }
        }
    }

    // Event Listeners
    renderer.domElement.addEventListener('click', onPointerEvent);
    renderer.domElement.addEventListener('touchstart', onPointerEvent, { passive: false });

    // Prevent unwanted touch behaviors
    document.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1) e.preventDefault();
    }, { passive: false });

    document.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) e.preventDefault();
    }, { passive: false });

    window.addEventListener('keypress', (event) => {
        const key = event.key;
        if (selectedCell && key >= '1' && key <= '9') {
            inputNumber(parseInt(key));
        }
    });

    document.querySelectorAll('.difficulty-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const difficulty = btn.dataset.difficulty;
            startNewGame(difficulty);
        });
    });

    fab.addEventListener('click', () => {
        startNewGame(currentDifficulty);
    });

    window.addEventListener('resize', () => {
        const newScaleFactor = window.innerWidth < 768 ? 6.5 : 5;
        cellsGroup.scale.set(newScaleFactor, newScaleFactor, newScaleFactor);
        bordersGroup.scale.set(newScaleFactor, newScaleFactor, newScaleFactor);
        numbersGroup.scale.set(newScaleFactor, newScaleFactor, newScaleFactor);
        notesGroup.scale.set(newScaleFactor, newScaleFactor, newScaleFactor);

        
        camera.aspect = (window.innerWidth * 0.7) / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth * 0.7, window.innerHeight);
        controls.handleResize();
    });

    // Animation Loop
    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
    }

    animate();
    
    // Create the golf ball after everything is initialized
    if (typeof window.createUIGolfBall === 'function') {
        window.createUIGolfBall();
    }
});
