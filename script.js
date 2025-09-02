// script.js
document.addEventListener('DOMContentLoaded', () => {
  let sudokuSolution = [];

  // Scene / camera / renderer
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    35,
    (window.innerWidth * 0.7) / window.innerHeight,
    0.01,
    100
  );
  camera.position.set(0, 3, 1.5);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth * 0.7, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  // Lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 1);
  scene.add(ambientLight);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.1);
  directionalLight.position.set(15, 25, 15);
  scene.add(directionalLight);

  // Groups and loader
  const loader = new THREE.GLTFLoader();
  const cellsGroup = new THREE.Group();
  const bordersGroup = new THREE.Group();
  const numbersGroup = new THREE.Group();
  const notesGroup = new THREE.Group();
  const decorativeGroup = new THREE.Group();

  const scaleFactor = window.innerWidth < 768 ? 6.5 : 5;
  cellsGroup.scale.set(scaleFactor, scaleFactor, scaleFactor);
  bordersGroup.scale.set(scaleFactor, scaleFactor, scaleFactor);
  numbersGroup.scale.set(scaleFactor, scaleFactor, scaleFactor);
  notesGroup.scale.set(scaleFactor, scaleFactor, scaleFactor);
  decorativeGroup.scale.set(scaleFactor * 0.3, scaleFactor * 0.3, scaleFactor * 0.3);

  scene.add(cellsGroup, bordersGroup, numbersGroup, notesGroup, decorativeGroup);

  // ========= Pastel subgrid styles (cell background colors only) =========
  // Numbers DO NOT use these; given numbers stay red, player numbers stay black.
  const SUBGRID_STYLES = {
    1: { cell: 0xFFD1E8, givenCell: 0xFFA7C8 }, // baby pink
    2: { cell: 0xFFD8B3, givenCell: 0xFFB67F }, // peach
    3: { cell: 0xFFF4B3, givenCell: 0xFFE066 }, // pastel yellow
    4: { cell: 0xCFFFE5, givenCell: 0x9DE8C7 }, // mint
    5: { cell: 0xB3E5FF, givenCell: 0x7FCFFF }, // baby blue
    6: { cell: 0xE2D6FF, givenCell: 0xC8B5FF }, // lavender
    7: { cell: 0xD7F8B7, givenCell: 0xA8E57F }, // pastel green
    8: { cell: 0xFFC8C2, givenCell: 0xFFA39A }, // coral
    9: { cell: 0xC6F3F6, givenCell: 0x95E3E8 }, // light teal
  };

  function getBaseCellColorFor(subgrid, isGiven) {
    const style = SUBGRID_STYLES[subgrid];
    if (style) return isGiven ? style.givenCell : style.cell;
    return isGiven ? COLORS.GIVEN_CELL : COLORS.DEFAULT_CELL;
  }
  // Numbers: keep original palette (given = red, player = black), regardless of subgrid.
  function getNumberColor(isGiven) {
    return isGiven ? COLORS.GIVEN_NUMBER : COLORS.PLAYER_NUMBER;
  }
  // ======================================================================

  // Core palette (kept as-is; tweak RELATED_CELL if you want gray instead)
  const COLORS = {
    DEFAULT_CELL: 0xFFFFFF,
    SELECTED_CELL: 0xFF8C00,
    RELATED_CELL: 0xFFFF00, // change to 0x9CA3AF for darker gray if desired
    GIVEN_NUMBER: 0x8B0000, // red for givens
    PLAYER_NUMBER: 0x000000, // black for player inputs
    GIVEN_CELL: 0xD3D3D3     // only used if a subgrid style is missing
  };

  // Controls (mouse/touch rotate)
  const controls = new THREE.TrackballControls(camera, renderer.domElement);
  controls.rotateSpeed = 5.0;
  controls.dynamicDampingFactor = 0.3;
  controls.noZoom = true;
  controls.noPan = true;
  controls.target.set(0, 0, 0);
  controls.update();
  window.camera = camera;
  window.controls = controls;

  // Game state
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

  // -------- Right-side control panel UI --------
  const controlPanel = document.createElement('div');
  controlPanel.className = 'control-panel';
  document.body.appendChild(controlPanel);

  // Top row (difficulty + timer)
  const topRow = document.createElement('div');
  topRow.className = 'top-row';
  topRow.innerHTML = `
    <div class="difficulty-selector">
      <button class="difficulty-btn active" data-difficulty="Beginner">Beginner</button>
      <button class="difficulty-btn" data-difficulty="Intermediate">Intermediate</button>
      <button class="difficulty-btn" data-difficulty="Expert">Expert</button>
      <button class="difficulty-btn" data-difficulty="Master">Master</button>
    </div>
    <div class="timer-display">00:00</div>
  `;
  controlPanel.appendChild(topRow);

  // Number pad
  const numberPad = document.createElement('div');
  numberPad.className = 'number-pad';
  controlPanel.appendChild(numberPad);
  for (let i = 1; i <= 9; i++) {
    const button = document.createElement('button');
    button.innerText = i;
    button.addEventListener('click', () => { if (selectedCell) inputNumber(i); });
    button.addEventListener('touchstart', (e) => { e.preventDefault(); if (selectedCell) inputNumber(i); }, { passive: false });
    numberPad.appendChild(button);
  }

  // Utility buttons
  const utilityButtons = document.createElement('div');
  utilityButtons.className = 'utility-buttons';
  controlPanel.appendChild(utilityButtons);

  const modeToggle = document.createElement('button');
  modeToggle.innerText = "Toggle: Numbers";
  function toggleMode() {
    currentInputMode = currentInputMode === "numbers" ? "additionalNumbers" : "numbers";
    modeToggle.innerText = `Toggle: ${currentInputMode === "numbers" ? "Numbers" : "Additional Numbers"}`;
  }
  modeToggle.addEventListener('click', toggleMode);
  modeToggle.addEventListener('touchstart', (e)=>{e.preventDefault(); toggleMode();},{passive:false});
  utilityButtons.appendChild(modeToggle);

  const eraseButton = document.createElement('button');
  eraseButton.innerText = "Erase";
  function doErase() { if (selectedCell) eraseCell(selectedCell.cellName); }
  eraseButton.addEventListener('click', doErase);
  eraseButton.addEventListener('touchstart', (e)=>{e.preventDefault(); doErase();},{passive:false});
  utilityButtons.appendChild(eraseButton);

  // ----- Sudoku helpers -----
  function checkSolution() {
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (!sudokuGrid[r][c]) return false;
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (sudokuGrid[r][c] !== sudokuSolution[r][c]) return false;
    return true;
  }

  function isValidSudokuMove(grid, row, col, num) {
    for (let x = 0; x < 9; x++) if (x !== col && grid[row][x] === num) return false;
    for (let x = 0; x < 9; x++) if (x !== row && grid[x][col] === num) return false;
    const sr = Math.floor(row / 3) * 3, sc = Math.floor(col / 3) * 3;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const rr = sr + i, cc = sc + j;
      if ((rr !== row || cc !== col) && grid[rr][cc] === num) return false;
    }
    return true;
  }

  // Beginner has ~70–75 givens as requested earlier
  function generatePuzzle(difficulty = 'Beginner') {
    const difficultySettings = {
      'Beginner': { minClues: 70, maxClues: 75 },
      'Intermediate': { minClues: 60, maxClues: 64 },
      'Expert': { minClues: 25, maxClues: 34 },
      'Master': { minClues: 17, maxClues: 24 }
    };
    const { minClues, maxClues } = difficultySettings[difficulty];
    const solution = generateValidCompleteSolution();
    const puzzle = solution.map(row => [...row]);
    const targetClues = minClues + Math.floor(Math.random() * (maxClues - minClues + 1));
    const cellsToRemove = 81 - targetClues;

    const positions = [];
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) positions.push([r, c]);
    for (let i = positions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [positions[i], positions[j]] = [positions[j], positions[i]];
    }
    for (let i = 0; i < cellsToRemove && i < positions.length; i++) {
      const [r, c] = positions[i];
      puzzle[r][c] = 0;
    }

    return { sudokuBoard: puzzle, sudokuSolution: solution, rating: (maxClues - targetClues) / (maxClues - minClues) * 4 };
  }

  function convertToGrid(flatArray) {
    const grid = [];
    for (let i = 0; i < 9; i++) grid.push(flatArray.slice(i * 9, (i + 1) * 9).map(v => v === null ? 0 : v));
    return grid;
  }

  function generateValidCompleteSolution() {
    const baseSolution = [
      [5,3,4,6,7,8,9,1,2],
      [6,7,2,1,9,5,3,4,8],
      [1,9,8,3,4,2,5,6,7],
      [8,5,9,7,6,1,4,2,3],
      [4,2,6,8,5,3,7,9,1],
      [7,1,3,9,2,4,8,5,6],
      [9,6,1,5,3,7,2,8,4],
      [2,8,7,4,1,9,6,3,5],
      [3,4,5,2,8,6,1,7,9]
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
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    gameInProgress = false;
  }
  function updateTimer() {
    if (gameStartTime) {
      gameTimer = Math.floor((Date.now() - gameStartTime) / 1000);
      const timerEl = document.querySelector('.timer-display');
      if (timerEl) timerEl.textContent = formatTime(gameTimer);
    }
  }
  function formatTime(s) {
    const m = Math.floor(s / 60), sec = s % 60;
    return `${m.toString().padStart(2,'0')}:${sec.toString().padStart(2,'0')}`;
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
    achievements.forEach(a => {
      if (!gameStats.achievements.includes(a.id) && a.condition()) {
        gameStats.achievements.push(a.id);
        showAchievement(`Achievement Unlocked: ${a.name}!`);
      }
    });
  }
  function showAchievement(message) {
    const el = document.createElement('div');
    el.className = 'achievement-toast';
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.classList.add('show'), 100);
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => { if (document.body.contains(el)) document.body.removeChild(el); }, 300);
    }, 3000);
  }

  function showCelebration(completionTime) {
    stopTimer();
    const overlay = document.createElement('div');
    overlay.className = 'celebration-overlay';
    overlay.innerHTML = `
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
    document.body.appendChild(overlay);
    createConfetti();
    setTimeout(() => { if (document.body.contains(overlay)) document.body.removeChild(overlay); }, 3000);
  }
  function createConfetti() {
    for (let i = 0; i < 50; i++) {
      const confetti = document.createElement('div');
      confetti.className = 'confetti';
      confetti.style.left = Math.random() * 100 + '%';
      confetti.style.animationDelay = Math.random() * 3 + 's';
      confetti.style.backgroundColor = `hsl(${Math.random() * 360}, 70%, 60%)`;
      document.body.appendChild(confetti);
      setTimeout(() => { if (document.body.contains(confetti)) document.body.removeChild(confetti); }, 3000);
    }
  }

  function startNewGame(difficulty = currentDifficulty) {
    stopTimer();
    gameTimer = 0;
    const timerEl = document.querySelector('.timer-display');
    if (timerEl) timerEl.textContent = '00:00';
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
      child.traverse((node) => { if (node.isMesh) { node.geometry.dispose(); node.material.dispose(); } });
    });
    notesGroup.children.slice().forEach(child => {
      notesGroup.remove(child);
      child.traverse((node) => { if (node.isMesh) { node.geometry.dispose(); node.material.dispose(); } });
    });

    // Reset each cell to its base (non-given) color for its subgrid.
    cellsGroup.children.forEach(cell => {
      const name = cell.name || '';
      const parts = name.split('_'); // "Sub_5_Cell_2_3"
      const subgrid = parseInt(parts[1], 10);
      const baseColor = getBaseCellColorFor(subgrid, false);
      cell.traverse(child => { if (child.isMesh) child.material.color.setHex(baseColor); });
    });

    selectedCell = null;
  }

  function getCellCoordinates(cellName) {
    const subGrid = parseInt(cellName.split('_')[1]) - 1;
    const cellRow = parseInt(cellName.split('_')[3]) - 1;
    const cellCol = parseInt(cellName.split('_')[4]) - 1;
    const gridRow = Math.floor(subGrid / 3) * 3;
    const gridCol = (subGrid % 3) * 3;
    return { row: gridRow + cellRow, col: gridCol + cellCol, subGrid: subGrid + 1 };
  }

  function getRelatedCells(cellName) {
    const coords = getCellCoordinates(cellName);
    const related = new Set();
    // row
    for (let col = 0; col < 9; col++) {
      const subGrid = Math.floor(coords.row / 3) * 3 + Math.floor(col / 3) + 1;
      related.add(`Sub_${subGrid}_Cell_${(coords.row % 3) + 1}_${(col % 3) + 1}`);
    }
    // col
    for (let row = 0; row < 9; row++) {
      const subGrid = Math.floor(row / 3) * 3 + Math.floor(coords.col / 3) + 1;
      related.add(`Sub_${subGrid}_Cell_${(row % 3) + 1}_${(coords.col % 3) + 1}`);
    }
    // 3x3
    const sr = Math.floor(coords.row / 3) * 3;
    const sc = Math.floor(coords.col / 3) * 3;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      const row = sr + r, col = sc + c;
      const subGrid = Math.floor(row / 3) * 3 + Math.floor(col / 3) + 1;
      related.add(`Sub_${subGrid}_Cell_${(row % 3) + 1}_${(col % 3) + 1}`);
    }
    return Array.from(related);
  }

  function highlightRelatedCells(cellName, highlight = true) {
    const relatedCells = getRelatedCells(cellName);
    relatedCells.forEach(relatedCell => {
      if (relatedCell !== cellName) {
        const cellData = displayedNumbers[relatedCell];
        if (!cellData?.isGiven) {
          const subgrid = parseInt(relatedCell.split('_')[1], 10);
          colorCell(
            subgrid,
            relatedCell,
            highlight ? COLORS.RELATED_CELL : getBaseCellColorFor(subgrid, false)
          );
        }
      }
    });
  }

  function updateAutomaticNotes(cellName, placedNumber) {
    const relatedCells = getRelatedCells(cellName);
    relatedCells.forEach(relatedCell => {
      if (editableCells.has(relatedCell)) {
        const noteFile = `New_Number_${placedNumber}`;
        const fullNoteName = `${relatedCell}_${noteFile}`;
        const model = notesGroup.getObjectByName(fullNoteName);
        if (model) {
          notesGroup.remove(model);
          model.traverse((child) => { if (child.isMesh) { child.geometry.dispose(); child.material.dispose(); } });
        }
      }
    });
  }

  function eraseCell(cellName) {
    const cellData = displayedNumbers[cellName];
    if (!cellData || cellData.isGiven) return;
    removeOldNumber(cellName);
    const notesToRemove = [];
    notesGroup.children.forEach(note => { if (note.name.startsWith(cellName)) notesToRemove.push(note); });
    notesToRemove.forEach(note => {
      notesGroup.remove(note);
      note.traverse((child) => { if (child.isMesh) { child.geometry.dispose(); child.material.dispose(); } });
    });
    const coords = getCellCoordinates(cellName);
    sudokuGrid[coords.row][coords.col] = null;
  }

  // Load parts and start
  Promise.all([ fetch('partsList.json').then(r => r.json()) ])
    .then(([partsListData]) => {
      const { borders, cells } = partsListData;

      borders.forEach(border => {
        loader.load(`assets/Borders/${border}.gltf`, (gltf) => {
          const part = gltf.scene; part.name = border; bordersGroup.add(part);
        });
      });

      // Cells get base NON-GIVEN color per subgrid
      cells.forEach(cell => {
        loader.load(`assets/Cells/${cell}.gltf`, (gltf) => {
          const part = gltf.scene; part.name = cell;
          part.traverse((child) => {
            if (child.isMesh) {
              const subgrid = parseInt(cell.split('_')[1], 10);
              const baseColor = getBaseCellColorFor(subgrid, false);
              child.material = new THREE.MeshLambertMaterial({ color: baseColor });
            }
          });
          cellsGroup.add(part);
        });
      });

      // Start after a short load delay
      setTimeout(() => {
        startNewGame('Beginner');
      }, 1000);
    })
    .catch(error => console.error('Error loading game data:', error));

  function loadGameWithData(gameData) {
    const { sudokuBoard } = gameData;
    fetch('partsList.json').then(r => r.json()).then(partsListData => {
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
          // GIVEN number: keep numbers red, cell darker shade for that subgrid
          const numberFile = `Number_${cell}`;
          const numberPath = `assets/Numbers/${subGrid}/Cell_${cellCoords}/${numberFile}.gltf`;
          loader.load(numberPath, (gltf) => {
            const part = gltf.scene;
            part.name = `${cellName}_${numberFile}`;
            part.traverse((child) => {
              if (child.isMesh) {
                child.material = new THREE.MeshLambertMaterial({ color: getNumberColor(true) }); // red
              }
            });
            numbersGroup.add(part);
          });

          colorCell(subGrid, cellName, getBaseCellColorFor(subGrid, true));
          displayedNumbers[cellName] = { number: cell, modelName: `${cellName}_${numberFile}`, isGiven: true };
        } else {
          // EDITABLE cell: base (lighter) shade for that subgrid
          editableCells.add(cellName);
          colorCell(subGrid, cellName, getBaseCellColorFor(subGrid, false));
          displayedNumbers[cellName] = { number: null, modelName: null, isGiven: false };
        }
      });
    });
  }

  function colorCell(subGrid, cellName, color) {
    const targetCell = cellsGroup.getObjectByName(cellName);
    if (targetCell) targetCell.traverse(child => { if (child.isMesh) child.material.color.setHex(color); });
  }

  function removeOldNumber(cellName) {
    const cellData = displayedNumbers[cellName];
    if (!cellData || cellData.isGiven) return;
    if (cellData.modelName) {
      const model = numbersGroup.getObjectByName(cellData.modelName);
      if (model) {
        numbersGroup.remove(model);
        model.traverse((child) => { if (child.isMesh) { child.geometry.dispose(); child.material.dispose(); } });
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
      const v = getCellCoordinates(cellName);
      if (!isValidSudokuMove(sudokuGrid, v.row, v.col, number)) {
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
        return;
      }

      // Clear old number & notes
      removeOldNumber(cellName);
      const notesToRemove = [];
      notesGroup.children.forEach(note => { if (note.name.startsWith(cellName)) notesToRemove.push(note); });
      notesToRemove.forEach(note => {
        notesGroup.remove(note);
        note.traverse((child) => { if (child.isMesh) { child.geometry.dispose(); child.material.dispose(); } });
      });

      // Add new number (player): keep black
      const numberFile = `Number_${number}`;
      const numberPath = `assets/Numbers/${subGrid}/Cell_${cellCoords}/${numberFile}.gltf`;
      loader.load(numberPath, (gltf) => {
        const part = gltf.scene;
        part.name = `${cellName}_${numberFile}`;
        part.traverse((child) => {
          if (child.isMesh) child.material = new THREE.MeshLambertMaterial({ color: getNumberColor(false) }); // black
        });
        numbersGroup.add(part);
      });
      displayedNumbers[cellName] = { ...displayedNumbers[cellName], number, modelName: `${cellName}_${numberFile}` };

      // Update grid and notes
      const coords = getCellCoordinates(cellName);
      sudokuGrid[coords.row][coords.col] = number;
      updateAutomaticNotes(cellName, number);

      if (checkSolution()) {
        const completionTime = gameTimer;
        updateGameStats(currentDifficulty, completionTime);
        showCelebration(completionTime);
        setTimeout(() => startNewGame(currentDifficulty), 3000);
      }
    } else {
      // Notes mode: still keep notes in player color (black)
      if (displayedNumbers[cellName].number !== null) {
        removeOldNumber(cellName);
        const coords = getCellCoordinates(cellName);
        sudokuGrid[coords.row][coords.col] = null;
      }
      const noteFile = `New_Number_${number}`;
      const notePath = `assets/AdditionalNumbers/${subGrid}/Cell_${cellCoords}/${noteFile}.gltf`;
      const fullNoteName = `${cellName}_${noteFile}`;

      if (notesGroup.getObjectByName(fullNoteName)) {
        const model = notesGroup.getObjectByName(fullNoteName);
        notesGroup.remove(model);
        model.traverse((child) => { if (child.isMesh) { child.geometry.dispose(); child.material.dispose(); } });
      } else {
        loader.load(notePath, (gltf) => {
          const part = gltf.scene;
          part.name = fullNoteName;
          part.traverse((child) => {
            if (child.isMesh) child.material = new THREE.MeshLambertMaterial({ color: getNumberColor(false) }); // black
          });
          notesGroup.add(part);
        });
      }
    }
  }

  // Pointer picking (click/tap to select cell)
  function onPointerEvent(event) {
    event.preventDefault();
    const pointer = event.touches ? event.touches[0] : event;
    const mouse = new THREE.Vector2();
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
        // Unselect previous
        if (selectedCell) {
          highlightRelatedCells(selectedCell.cellName, false);
          const prevSubgrid = parseInt(selectedCell.subGrid, 10);
          const prevIsGiven = !!displayedNumbers[selectedCell.cellName]?.isGiven;
          colorCell(prevSubgrid, selectedCell.cellName, getBaseCellColorFor(prevSubgrid, prevIsGiven));
        }
        // Select new
        const subGrid = cellName.split('_')[1];
        selectedCell = { subGrid, cellName };
        colorCell(parseInt(subGrid,10), cellName, COLORS.SELECTED_CELL);
        highlightRelatedCells(cellName, true);
      }
    }
  }

  renderer.domElement.addEventListener('click', onPointerEvent);
  renderer.domElement.addEventListener('touchstart', onPointerEvent, { passive: false });

  // Prevent page scroll on single-finger touch over canvas
  document.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1) e.preventDefault();
  }, { passive: false });
  document.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) e.preventDefault();
  }, { passive: false });

  // Keyboard input
  window.addEventListener('keypress', (event) => {
    const key = event.key;
    if (selectedCell && key >= '1' && key <= '9') inputNumber(parseInt(key));
  });

  // Difficulty buttons
  document.querySelectorAll('.difficulty-btn').forEach(btn => {
    btn.addEventListener('click', () => startNewGame(btn.dataset.difficulty));
  });

  // Resize
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

  // Loop
  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();
});
