// BUILD v19 — TrackballControls feel restored for mouse,
// trackpad drives TrackballControls via synthetic pointer events (safe).

console.log("BUILD v19 — trackpad -> synthetic pointer events (TrackballControls)");

// ------------------------------
// GAME SETUP
// ------------------------------
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
  scene.add(new THREE.AmbientLight(0xffffff, 1));
  const dir = new THREE.DirectionalLight(0xffffff, 0.1);
  dir.position.set(15, 25, 15);
  scene.add(dir);

  // Loader & groups
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

  // Colors
  const COLORS = {
    DEFAULT_CELL: 0xffffff,
    SELECTED_CELL: 0xff8c00, // orange
    RELATED_CELL: 0x9ca3af,  // darker gray for peers (incl. givens)
    GIVEN_NUMBER: 0x8b0000,  // red
    PLAYER_NUMBER: 0x000000, // black
    GIVEN_CELL: 0xd3d3d3
  };
  const getNumberColor = (isGiven) => (isGiven ? COLORS.GIVEN_NUMBER : COLORS.PLAYER_NUMBER);

  // Pastel subgrid scheme
  const SUBGRID_STYLES = {
    1: { cell: 0xffd1e8, givenCell: 0xffa7c8 }, // baby pink
    2: { cell: 0xffd8b3, givenCell: 0xffb67f }, // peach
    3: { cell: 0xfff4b3, givenCell: 0xffe066 }, // pastel yellow
    4: { cell: 0xcfffe5, givenCell: 0x9de8c7 }, // mint
    5: { cell: 0xb3e5ff, givenCell: 0x7fcfff }, // baby blue
    6: { cell: 0xe2d6ff, givenCell: 0xc8b5ff }, // lavender
    7: { cell: 0xd7f8b7, givenCell: 0xa8e57f }, // pastel green
    8: { cell: 0xffc8c2, givenCell: 0xffa39a }, // coral
    9: { cell: 0xc6f3f6, givenCell: 0x95e3e8 }, // light teal
  };
  function getBaseCellColorFor(subgrid, isGiven) {
    const s = SUBGRID_STYLES[subgrid];
    return s ? (isGiven ? s.givenCell : s.cell)
             : (isGiven ? COLORS.GIVEN_CELL : COLORS.DEFAULT_CELL);
  }

  // TrackballControls (mouse behavior restored)
  const controls = new THREE.TrackballControls(camera, renderer.domElement);
  controls.rotateSpeed = 5.0;
  controls.dynamicDampingFactor = 0.3;
  controls.noZoom = true;
  controls.noPan  = true;
  controls.target.set(0, 0, 0);
  controls.update();

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

  // ------------------------------
  // UI (right panel)
  // ------------------------------
  const controlPanel = document.createElement('div');
  controlPanel.className = 'control-panel';
  document.body.appendChild(controlPanel);

  const topRow = document.createElement('div');
  topRow.className = 'top-row';
  controlPanel.appendChild(topRow);

  const difficultySelector = document.createElement('div');
  difficultySelector.className = 'difficulty-selector';
  difficultySelector.innerHTML = `
    <button class="difficulty-btn active" data-difficulty="Beginner">Beginner</button>
    <button class="difficulty-btn" data-difficulty="Intermediate">Intermediate</button>
    <button class="difficulty-btn" data-difficulty="Expert">Expert</button>
    <button class="difficulty-btn" data-difficulty="Master">Master</button>
  `;
  topRow.appendChild(difficultySelector);

  const timerDisplay = document.createElement('div');
  timerDisplay.className = 'timer-display';
  timerDisplay.textContent = '00:00';
  topRow.appendChild(timerDisplay);

  // Number pad
  const numberPad = document.createElement('div');
  numberPad.className = 'number-pad';
  controlPanel.appendChild(numberPad);
  for (let i = 1; i <= 9; i++) {
    const b = document.createElement('button');
    b.innerText = i;
    b.addEventListener('click', () => { if (selectedCell) inputNumber(i); });
    b.addEventListener('touchstart', (e)=>{ e.preventDefault(); if (selectedCell) inputNumber(i); }, { passive:false });
    numberPad.appendChild(b);
  }

  // Utilities
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
  modeToggle.addEventListener('touchstart', (e)=>{ e.preventDefault(); toggleMode(); }, { passive:false });
  utilityButtons.appendChild(modeToggle);

  const eraseButton = document.createElement('button');
  eraseButton.innerText = "Erase";
  function doErase() { if (selectedCell) eraseCell(selectedCell.cellName); }
  eraseButton.addEventListener('click', doErase);
  eraseButton.addEventListener('touchstart', (e)=>{ e.preventDefault(); doErase(); }, { passive:false });
  utilityButtons.appendChild(eraseButton);

  // ------------------------------
  // Trackpad (drives TrackballControls with synthetic pointer events)
  // ------------------------------
  const trackpadWrap = document.createElement('div');
  trackpadWrap.className = 'trackpad-wrap';
  controlPanel.appendChild(trackpadWrap);

  const trackpadLabel = document.createElement('div');
  trackpadLabel.className = 'trackpad-label';
  trackpadLabel.textContent = 'Trackpad';
  trackpadWrap.appendChild(trackpadLabel);

  const trackpadSurface = document.createElement('div');
  trackpadSurface.className = 'trackpad-surface';
  trackpadWrap.appendChild(trackpadSurface);

  // Synthetic-pointer dispatcher helper
  const POINTER_ID   = 4242;
  const SENSITIVITY  = 1.15;  // feel free to tweak
  let simActive      = false;
  let simX = 0, simY = 0;     // simulated pointer pos on canvas
  let canvasRect     = null;

  function makePointerEvent(type, x, y, buttons) {
    // Try PointerEvent; fallback to MouseEvent if not supported
    try {
      return new PointerEvent(type, {
        pointerId: POINTER_ID,
        pointerType: 'mouse',
        isPrimary: true,
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        button: type === 'pointerdown' ? 0 : 0,
        buttons: buttons
      });
    } catch {
      // MouseEvent fallback
      return new MouseEvent(type.replace('pointer', 'mouse'), {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        button: type.includes('down') ? 0 : 0,
        buttons: buttons
      });
    }
  }

  function sendToCanvas(ev) {
    renderer.domElement.dispatchEvent(ev);
  }

  function tpStart(e) {
    e.preventDefault();
    trackpadSurface.setPointerCapture(e.pointerId || 1);

    // Start from canvas center
    canvasRect = renderer.domElement.getBoundingClientRect();
    simX = canvasRect.left + canvasRect.width  / 2;
    simY = canvasRect.top  + canvasRect.height / 2;

    // Down on canvas (left button pressed)
    sendToCanvas(makePointerEvent('pointerdown', simX, simY, 1));
    simActive = true;
  }

  function tpMove(e) {
    if (!simActive) return;
    e.preventDefault();

    // Move simulated cursor by the same delta as trackpad pointer
    const dx = (e.movementX !== undefined ? e.movementX : (e.clientX - (tpMove._px||e.clientX)));
    const dy = (e.movementY !== undefined ? e.movementY : (e.clientY - (tpMove._py||e.clientY)));
    tpMove._px = e.clientX; tpMove._py = e.clientY;

    simX += dx * SENSITIVITY;
    simY += dy * SENSITIVITY;

    // Keep inside the canvas bounds (not strictly required, but nicer)
    if (canvasRect) {
      simX = Math.max(canvasRect.left + 1, Math.min(canvasRect.right - 1, simX));
      simY = Math.max(canvasRect.top  + 1, Math.min(canvasRect.bottom - 1, simY));
    }

    sendToCanvas(makePointerEvent('pointermove', simX, simY, 1));
  }

  function tpEnd(e) {
    if (!simActive) return;
    e.preventDefault();
    try { trackpadSurface.releasePointerCapture(e.pointerId || 1); } catch {}
    sendToCanvas(makePointerEvent('pointerup', simX, simY, 0));
    simActive = false;
  }

  // Use pointer events for the trackpad surface itself
  trackpadSurface.addEventListener('pointerdown', tpStart);
  trackpadSurface.addEventListener('pointermove', tpMove);
  trackpadSurface.addEventListener('pointerup', tpEnd);
  trackpadSurface.addEventListener('pointercancel', tpEnd);
  trackpadSurface.addEventListener('lostpointercapture', tpEnd);

  // ------------------------------
  // Sudoku helpers
  // ------------------------------
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

  function generatePuzzle(difficulty = 'Beginner') {
    const difficultySettings = {
      'Beginner':     { minClues: 45, maxClues: 50 },
      'Intermediate': { minClues: 35, maxClues: 44 },
      'Expert':       { minClues: 25, maxClues: 34 },
      'Master':       { minClues: 17, maxClues: 24 }
    };
    const { minClues, maxClues } = difficultySettings[difficulty];
    const solution = generateValidCompleteSolution();
    const puzzle   = solution.map(row => [...row]);
    const targetClues   = minClues + Math.floor(Math.random() * (maxClues - minClues + 1));
    const cellsToRemove = 81 - targetClues;

    const positions = [];
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) positions.push([r, c]);
    for (let i = positions.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [positions[i], positions[j]] = [positions[j], positions[i]]; }
    for (let i = 0; i < cellsToRemove && i < positions.length; i++) { const [r, c] = positions[i]; puzzle[r][c] = 0; }

    return { sudokuBoard: puzzle, sudokuSolution: solution };
  }

  function convertToGrid(flatArray) {
    const grid = [];
    for (let i = 0; i < 9; i++) grid.push(flatArray.slice(i * 9, (i + 1) * 9).map(v => v === null ? 0 : v));
    return grid;
  }

  function generateValidCompleteSolution() {
    const base = [
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
    const s = base.map(r => [...r]);
    for (let block = 0; block < 3; block++) {
      if (Math.random() < 0.5) {
        const r1 = block * 3 + Math.floor(Math.random() * 3);
        const r2 = block * 3 + Math.floor(Math.random() * 3);
        [s[r1], s[r2]] = [s[r2], s[r1]];
      }
    }
    return s;
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
      const td = document.querySelector('.timer-display');
      if (td) td.textContent = formatTime(gameTimer);
    }
  }
  const formatTime = s => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;

  // Achievements / celebration (unchanged from your previous)
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
    const ach = [
      { id: 'first_win',     name: 'First Victory', condition: () => gameStats.gamesPlayed === 1 },
      { id: 'speed_demon',   name: 'Speed Demon',  condition: () => gameStats.bestTimes.Expert && gameStats.bestTimes.Expert < 300 },
      { id: 'streak_5',      name: 'Hot Streak',   condition: () => gameStats.currentStreak >= 5 },
      { id: 'master_solver', name: 'Master Solver',condition: () => gameStats.bestTimes.Master }
    ];
    ach.forEach(a => {
      if (!gameStats.achievements.includes(a.id) && a.condition()) {
        gameStats.achievements.push(a.id);
        showAchievement(`Achievement Unlocked: ${a.name}!`);
      }
    });
  }
  function showAchievement(msg) {
    const d = document.createElement('div');
    d.className = 'achievement-toast';
    d.textContent = msg;
    document.body.appendChild(d);
    setTimeout(() => d.classList.add('show'), 100);
    setTimeout(() => { d.classList.remove('show'); setTimeout(() => d.remove(), 300); }, 3000);
  }
  function showCelebration(t) {
    stopTimer();
    const el = document.createElement('div');
    el.className = 'celebration-overlay';
    el.innerHTML = `
      <div class="celebration-content">
        <div class="celebration-icon">🎉</div>
        <h2>Puzzle Solved!</h2>
        <p class="completion-time">Time: ${formatTime(t)}</p>
        <p class="difficulty-label">Difficulty: ${currentDifficulty}</p>
        <div class="celebration-stats">
          <span>Games Played: ${gameStats.gamesPlayed}</span>
          <span>Current Streak: ${gameStats.currentStreak}</span>
        </div>
        <p class="next-puzzle-text">Next puzzle loading...</p>
      </div>`;
    document.body.appendChild(el);
    createConfetti();
    setTimeout(() => el.remove(), 3000);
  }
  function createConfetti() {
    for (let i = 0; i < 50; i++) {
      const c = document.createElement('div');
      c.className = 'confetti';
      c.style.left = Math.random() * 100 + '%';
      c.style.animationDelay = Math.random() * 3 + 's';
      c.style.backgroundColor = `hsl(${Math.random()*360},70%,60%)`;
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 3000);
    }
  }

  function startNewGame(difficulty = currentDifficulty) {
    stopTimer();
    gameTimer = 0;
    const t = document.querySelector('.timer-display'); if (t) t.textContent = '00:00';
    currentDifficulty = difficulty;
    document.querySelectorAll('.difficulty-btn').forEach(b => b.classList.toggle('active', b.dataset.difficulty === difficulty));
    clearGame();

    const puzzle = generatePuzzle(difficulty);
    sudokuSolution = puzzle.sudokuSolution;
    sudokuGrid = puzzle.sudokuBoard.map(r => [...r]);

    loadGameWithData(puzzle);
  }

  function clearGame() {
    editableCells.clear();
    for (const k of Object.keys(displayedNumbers)) delete displayedNumbers[k];

    // remove models
    numbersGroup.children.slice().forEach(child => {
      numbersGroup.remove(child);
      child.traverse(n => { if (n.isMesh) { n.geometry.dispose(); n.material.dispose(); } });
    });
    notesGroup.children.slice().forEach(child => {
      notesGroup.remove(child);
      child.traverse(n => { if (n.isMesh) { n.geometry.dispose(); n.material.dispose(); } });
    });

    // reset cell colors to base (not "given" darkness)
    cellsGroup.children.forEach(cell => {
      const name = cell.name || '';
      const parts = name.split('_'); // Sub_5_Cell_2_3
      const subgrid = parseInt(parts[1], 10);
      const base = getBaseCellColorFor(subgrid, false);
      cell.traverse(ch => { if (ch.isMesh) ch.material.color.setHex(base); });
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
    for (let c = 0; c < 9; c++) {
      const sg = Math.floor(coords.row / 3) * 3 + Math.floor(c / 3) + 1;
      related.add(`Sub_${sg}_Cell_${(coords.row % 3) + 1}_${(c % 3) + 1}`);
    }
    // col
    for (let r = 0; r < 9; r++) {
      const sg = Math.floor(r / 3) * 3 + Math.floor(coords.col / 3) + 1;
      related.add(`Sub_${sg}_Cell_${(r % 3) + 1}_${(coords.col % 3) + 1}`);
    }
    // 3x3
    const rs = Math.floor(coords.row / 3) * 3;
    const cs = Math.floor(coords.col / 3) * 3;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      const rr = rs + r, cc = cs + c;
      const sg = Math.floor(rr / 3) * 3 + Math.floor(cc / 3) + 1;
      related.add(`Sub_${sg}_Cell_${(rr % 3) + 1}_${(cc % 3) + 1}`);
    }
    return Array.from(related);
  }

  function highlightRelatedCells(cellName, highlight = true) {
    const list = getRelatedCells(cellName);
    list.forEach(rc => {
      if (rc === cellName) return;
      const sg = parseInt(rc.split('_')[1], 10);
      const isGiven = !!displayedNumbers[rc]?.isGiven;
      colorCell(sg, rc, highlight ? COLORS.RELATED_CELL : getBaseCellColorFor(sg, isGiven));
    });
  }

  function updateAutomaticNotes(cellName, placedNumber) {
    getRelatedCells(cellName).forEach(rc => {
      if (!editableCells.has(rc)) return;
      const noteFile = `New_Number_${placedNumber}`;
      const full = `${rc}_${noteFile}`;
      const model = notesGroup.getObjectByName(full);
      if (model) {
        notesGroup.remove(model);
        model.traverse(n => { if (n.isMesh) { n.geometry.dispose(); n.material.dispose(); } });
      }
    });
  }

  function eraseCell(cellName) {
    const cellData = displayedNumbers[cellName];
    if (!cellData || cellData.isGiven) return;

    removeOldNumber(cellName);

    const rm = [];
    notesGroup.children.forEach(note => { if (note.name.startsWith(cellName)) rm.push(note); });
    rm.forEach(note => {
      notesGroup.remove(note);
      note.traverse(n => { if (n.isMesh) { n.geometry.dispose(); n.material.dispose(); } });
    });

    const coords = getCellCoordinates(cellName);
    sudokuGrid[coords.row][coords.col] = null;
  }

  // Load assets and start
  Promise.all([ fetch('partsList.json').then(r => r.json()) ])
    .then(([parts]) => {
      const { borders, cells } = parts;

      borders.forEach(b => {
        loader.load(`assets/Borders/${b}.gltf`, gltf => {
          const part = gltf.scene;
          part.name = b;
          bordersGroup.add(part);
        });
      });

      cells.forEach(cell => {
        loader.load(`assets/Cells/${cell}.gltf`, (gltf) => {
          const part = gltf.scene;
          part.name = cell;
          part.traverse((ch) => {
            if (ch.isMesh) {
              const sg = parseInt(cell.split('_')[1], 10);
              ch.material = new THREE.MeshLambertMaterial({ color: getBaseCellColorFor(sg, false) });
            }
          });
          cellsGroup.add(part);
        });
      });

      setTimeout(() => startNewGame('Beginner'), 800);
    })
    .catch(err => console.error('Error loading game data:', err));

  function loadGameWithData(gameData) {
    const { sudokuBoard } = gameData;
    setupSudokuMechanics(sudokuBoard);
  }

  function setupSudokuMechanics(sudokuBoard) {
    sudokuBoard.forEach((row, r) => {
      row.forEach((val, c) => {
        const sg = Math.floor(r / 3) * 3 + Math.floor(c / 3) + 1;
        const name = `Sub_${sg}_Cell_${(r % 3) + 1}_${(c % 3) + 1}`;
        const coords = `${(r % 3) + 1}_${(c % 3) + 1}`;

        if (val !== 0) {
          const numFile = `Number_${val}`;
          const path = `assets/Numbers/${sg}/Cell_${coords}/${numFile}.gltf`;
          loader.load(path, (gltf) => {
            const part = gltf.scene;
            part.name = `${name}_${numFile}`;
            part.traverse((ch) => {
              if (ch.isMesh) ch.material = new THREE.MeshLambertMaterial({ color: getNumberColor(true) });
            });
            numbersGroup.add(part);
          });

          colorCell(sg, name, getBaseCellColorFor(sg, true));
          displayedNumbers[name] = { number: val, modelName: `${name}_${numFile}`, isGiven: true };
        } else {
          editableCells.add(name);
          colorCell(sg, name, getBaseCellColorFor(sg, false));
          displayedNumbers[name] = { number: null, modelName: null, isGiven: false };
        }
      });
    });
  }

  function colorCell(subGrid, cellName, color) {
    const obj = cellsGroup.getObjectByName(cellName);
    if (!obj) return;
    obj.traverse(ch => { if (ch.isMesh) ch.material.color.setHex(color); });
  }

  function removeOldNumber(cellName) {
    const cd = displayedNumbers[cellName];
    if (!cd || cd.isGiven) return;
    if (cd.modelName) {
      const model = numbersGroup.getObjectByName(cd.modelName);
      if (model) {
        numbersGroup.remove(model);
        model.traverse(ch => { if (ch.isMesh) { ch.geometry.dispose(); ch.material.dispose(); } });
      }
      cd.number = null; cd.modelName = null;
    }
  }

  function inputNumber(number) {
    if (!selectedCell || !editableCells.has(selectedCell.cellName)) return;

    startTimer();

    const cd = displayedNumbers[selectedCell.cellName];
    if (!cd || cd.isGiven) return;

    const { subGrid, cellName } = selectedCell;
    const cellCoords = `${cellName.split('_')[3]}_${cellName.split('_')[4]}`;

    if (currentInputMode === "numbers") {
      const v = getCellCoordinates(cellName);
      if (!isValidSudokuMove(sudokuGrid, v.row, v.col, number)) {
        const x = document.createElement('div');
        x.className = 'invalid-move-toast';
        x.textContent = 'Invalid move! Number already exists in row, column, or box.';
        x.style.cssText = `
          position: fixed; top: 20px; right: 20px;
          background: linear-gradient(135deg,#ff6b6b,#ee5a52);
          color: #fff; padding: 12px 20px; border-radius: 8px;
          box-shadow: 0 4px 12px rgba(255,107,107,.3);
          font-weight: 500; z-index: 1000;
          transform: translateX(100%); transition: transform .3s ease;
        `;
        document.body.appendChild(x);
        setTimeout(()=> x.style.transform = 'translateX(0)', 100);
        setTimeout(()=>{ x.style.transform='translateX(100%)'; setTimeout(()=>x.remove(), 300); }, 2000);
        return;
      }

      removeOldNumber(cellName);

      // remove notes in that cell
      const rm = [];
      notesGroup.children.forEach(n => { if (n.name.startsWith(cellName)) rm.push(n); });
      rm.forEach(n => {
        notesGroup.remove(n);
        n.traverse(ch => { if (ch.isMesh) { ch.geometry.dispose(); ch.material.dispose(); } });
      });

      const numFile = `Number_${number}`;
      const path = `assets/Numbers/${subGrid}/Cell_${cellCoords}/${numFile}.gltf`;
      loader.load(path, (gltf) => {
        const part = gltf.scene;
        part.name = `${cellName}_${numFile}`;
        part.traverse((ch) => {
          if (ch.isMesh) ch.material = new THREE.MeshLambertMaterial({ color: getNumberColor(false) });
        });
        numbersGroup.add(part);
      });

      displayedNumbers[cellName] = { ...displayedNumbers[cellName], number, modelName: `${cellName}_${numFile}` };

      const coords = getCellCoordinates(cellName);
      sudokuGrid[coords.row][coords.col] = number;

      updateAutomaticNotes(cellName, number);

      if (checkSolution()) {
        const t = gameTimer;
        updateGameStats(currentDifficulty, t);
        showCelebration(t);
        setTimeout(()=> startNewGame(currentDifficulty), 3000);
      }
    } else {
      // notes mode
      if (displayedNumbers[cellName].number !== null) {
        removeOldNumber(cellName);
        const coords = getCellCoordinates(cellName);
        sudokuGrid[coords.row][coords.col] = null;
      }

      const noteFile = `New_Number_${number}`;
      const notePath = `assets/AdditionalNumbers/${subGrid}/Cell_${cellCoords}/${noteFile}.gltf`;
      const full = `${cellName}_${noteFile}`;

      if (notesGroup.getObjectByName(full)) {
        const m = notesGroup.getObjectByName(full);
        notesGroup.remove(m);
        m.traverse(ch => { if (ch.isMesh) { ch.geometry.dispose(); ch.material.dispose(); } });
      } else {
        loader.load(notePath, (gltf) => {
          const part = gltf.scene;
          part.name = full;
          part.traverse(ch => {
            if (ch.isMesh) ch.material = new THREE.MeshLambertMaterial({ color: getNumberColor(false) });
          });
          notesGroup.add(part);
        });
      }
    }
  }

  // Picking / selection on canvas
  function onPointerEvent(event) {
    event.preventDefault();
    const p = event.touches ? event.touches[0] : event;
    const mouse = new THREE.Vector2();
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((p.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((p.clientY - rect.top) / rect.height) * 2 + 1;

    const ray = new THREE.Raycaster();
    ray.setFromCamera(mouse, camera);
    const hits = ray.intersectObjects(cellsGroup.children, true);
    if (!hits.length) return;

    const cellName = hits[0].object.parent.name;

    if (editableCells.has(cellName)) {
      if (selectedCell) {
        highlightRelatedCells(selectedCell.cellName, false);
        const ps = parseInt(selectedCell.subGrid, 10);
        const prevGiven = !!displayedNumbers[selectedCell.cellName]?.isGiven;
        colorCell(ps, selectedCell.cellName, getBaseCellColorFor(ps, prevGiven));
      }

      const subGrid = cellName.split('_')[1];
      selectedCell = { subGrid, cellName };

      colorCell(parseInt(subGrid, 10), cellName, COLORS.SELECTED_CELL);
      highlightRelatedCells(cellName, true);
    }
  }

  renderer.domElement.addEventListener('click', onPointerEvent);
  renderer.domElement.addEventListener('touchstart', onPointerEvent, { passive:false });

  // Prevent unwanted touch behaviors
  document.addEventListener('touchmove', e => { if (e.touches.length === 1) e.preventDefault(); }, { passive:false });
  document.addEventListener('touchstart', e => { if (e.touches.length === 1) e.preventDefault(); }, { passive:false });

  window.addEventListener('keypress', (e) => {
    const k = e.key;
    if (selectedCell && k >= '1' && k <= '9') inputNumber(parseInt(k));
  });

  // Difficulty buttons
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.difficulty-btn');
    if (!btn) return;
    startNewGame(btn.dataset.difficulty);
  });

  // Resize
  window.addEventListener('resize', () => {
    const newScale = window.innerWidth < 768 ? 6.5 : 5;
    cellsGroup.scale.set(newScale, newScale, newScale);
    bordersGroup.scale.set(newScale, newScale, newScale);
    numbersGroup.scale.set(newScale, newScale, newScale);
    notesGroup.scale.set(newScale, newScale, newScale);

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
