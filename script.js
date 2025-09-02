// script.js — full drop-in

document.addEventListener('DOMContentLoaded', () => {
  /* ============================================================
   * Globals
   * ============================================================ */
  let sudokuSolution = [];
  let selectedCell = null;
  let currentInputMode = 'numbers';
  let currentDifficulty = 'Beginner';
  let gameTimer = 0;
  let timerInterval = null;
  let gameStartTime = null;
  let gameInProgress = false;

  const editableCells = new Set();               // which cells a player can edit
  const displayedNumbers = {};                   // cellName -> { number, modelName, isGiven }
  let sudokuGrid = Array(9).fill().map(() => Array(9).fill(null));

  /* ============================================================
   * Scene / Camera / Renderer
   * ============================================================ */
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    35,
    1,         // we’ll set real aspect in applyLayout()
    0.01,
    100
  );
  camera.position.set(0, 3, 1.5);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();

  const renderer = new THREE.WebGLRenderer({ antialias: true });

  // Lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.1);
  directionalLight.position.set(15, 25, 15);
  scene.add(ambientLight);
  scene.add(directionalLight);

  // Loader + groups
  const loader = new THREE.GLTFLoader();
  const cellsGroup = new THREE.Group();
  const bordersGroup = new THREE.Group();
  const numbersGroup = new THREE.Group();
  const notesGroup = new THREE.Group();

  scene.add(cellsGroup);
  scene.add(bordersGroup);
  scene.add(numbersGroup);
  scene.add(notesGroup);

  // TrackballControls (mouse behavior stays native)
  const controls = new THREE.TrackballControls(camera, renderer.domElement);
  controls.rotateSpeed = 5.0;
  controls.dynamicDampingFactor = 0.3;
  controls.noZoom = true;
  controls.noPan = true;
  controls.target.set(0, 0, 0);
  controls.update();

  // expose for debugging
  window.camera = camera;
  window.controls = controls;

  /* ============================================================
   * Colors & styling
   * ============================================================ */

  // Pastel 3×3 colors (light) by subgrid 1..9
  const SUBGRID_LIGHT = {
    1: 0xE6F6FF, // baby blue
    2: 0xFFF3C4, // baby yellow
    3: 0xFFD6E7, // baby pink
    4: 0xD7F7D9, // baby green
    5: 0xE7E3FF, // baby purple
    6: 0xCFF1F7, // baby teal
    7: 0xFFE1CC, // baby orange/peach
    8: 0xDDE3EA, // baby grey-blue
    9: 0xF1F5F9  // very light slate
  };

  // Darker versions for "given" cells in that subgrid
  const SUBGRID_DARK = {
    1: 0xCFEFFF,
    2: 0xFFE59E,
    3: 0xFFBFD3,
    4: 0xB8ECC0,
    5: 0xD3CCFF,
    6: 0xAEE3ED,
    7: 0xFFD0B2,
    8: 0xC8D2DC,
    9: 0xE2E8F0
  };

  const COLORS = {
    PLAYER_NUMBER: 0x000000, // black
    GIVEN_NUMBER:  0x8B0000, // dark red
    RELATED_CELL:  0xA0A4A8, // darker grey for peer highlight
    SELECTED_CELL: 0xFF8C00  // orange (clicked)
  };

  function getBaseCellColorFor(subGrid, isGiven) {
    const s = Number(subGrid);
    return isGiven ? SUBGRID_DARK[s] : SUBGRID_LIGHT[s];
  }

  function getNumberColor(isGiven) {
    return isGiven ? COLORS.GIVEN_NUMBER : COLORS.PLAYER_NUMBER;
  }

  /* ============================================================
   * UI: Build control panel (difficulty, timer, number pad, buttons, trackpad)
   * ============================================================ */
  const panel = document.querySelector('.control-panel');

  // Top row: difficulty + timer
  const topRow = document.createElement('div');
  topRow.className = 'top-row';

  const diffSel = document.createElement('div');
  diffSel.className = 'difficulty-selector';
  const difficulties = ['Beginner', 'Intermediate', 'Expert', 'Master'];

  difficulties.forEach((d, idx) => {
    const b = document.createElement('button');
    b.className = 'difficulty-btn' + (idx === 0 ? ' active' : '');
    b.dataset.difficulty = d;
    b.textContent = d;
    b.addEventListener('click', () => startNewGame(d));
    diffSel.appendChild(b);
  });

  const timerEl = document.createElement('div');
  timerEl.className = 'timer-display';
  timerEl.textContent = '00:00';

  topRow.appendChild(diffSel);
  topRow.appendChild(timerEl);
  panel.appendChild(topRow);

  // Number pad
  const numberPad = document.createElement('div');
  numberPad.className = 'number-pad';
  for (let i = 1; i <= 9; i++) {
    const btn = document.createElement('button');
    btn.textContent = i;
    btn.addEventListener('click', () => {
      if (selectedCell) inputNumber(i);
    });
    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (selectedCell) inputNumber(i);
    }, { passive: false });
    numberPad.appendChild(btn);
  }
  panel.appendChild(numberPad);

  // Utility buttons
  const util = document.createElement('div');
  util.className = 'utility-buttons';

  const modeToggle = document.createElement('button');
  modeToggle.textContent = 'Toggle: Numbers';
  modeToggle.addEventListener('click', toggleMode);
  modeToggle.addEventListener('touchstart', (e) => { e.preventDefault(); toggleMode(); }, { passive: false });
  util.appendChild(modeToggle);

  const eraseButton = document.createElement('button');
  eraseButton.textContent = 'Erase';
  eraseButton.addEventListener('click', () => { if (selectedCell) eraseCell(selectedCell.cellName); });
  eraseButton.addEventListener('touchstart', (e) => { e.preventDefault(); if (selectedCell) eraseCell(selectedCell.cellName); }, { passive: false });
  util.appendChild(eraseButton);

  panel.appendChild(util);

  // Trackpad
  const trackpadWrap = document.createElement('div');
  trackpadWrap.className = 'trackpad-wrap';

  const trackpadSurface = document.createElement('div');
  trackpadSurface.className = 'trackpad-surface';

  const trackpadLabel = document.createElement('div');
  trackpadLabel.className = 'trackpad-label';
  trackpadLabel.textContent = 'Trackpad';

  trackpadWrap.appendChild(trackpadSurface);
  trackpadWrap.appendChild(trackpadLabel);
  panel.appendChild(trackpadWrap);

  function toggleMode() {
    currentInputMode = currentInputMode === 'numbers' ? 'additionalNumbers' : 'numbers';
    modeToggle.textContent = `Toggle: ${currentInputMode === 'numbers' ? 'Numbers' : 'Additional Numbers'}`;
  }

  /* ============================================================
   * Timer & stats (light)
   * ============================================================ */
  function startTimer() {
    if (!gameInProgress) {
      gameStartTime = Date.now();
      gameInProgress = true;
      timerInterval = setInterval(updateTimer, 1000);
    }
  }
  function stopTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
    gameInProgress = false;
  }
  function updateTimer() {
    if (!gameStartTime) return;
    gameTimer = Math.floor((Date.now() - gameStartTime) / 1000);
    timerEl.textContent = formatTime(gameTimer);
  }
  function formatTime(s) {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  }

  /* ============================================================
   * Layout: make canvas size fit remaining space (iOS Safari safe)
   * ============================================================ */
  function applyLayout() {
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    const panelRect = panel.getBoundingClientRect();
    const canvasW = isMobile ? window.innerWidth : Math.floor(window.innerWidth * 0.7);
    const canvasH = isMobile ? Math.max(200, window.innerHeight - panelRect.height) : window.innerHeight;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(canvasW, canvasH);

    camera.aspect = canvasW / canvasH;
    camera.updateProjectionMatrix();

    // base scale — slightly smaller on mobile for comfortable fit
    const baseScale = isMobile ? 4.8 : 5.0;
    cellsGroup.scale.set(baseScale, baseScale, baseScale);
    bordersGroup.scale.set(baseScale, baseScale, baseScale);
    numbersGroup.scale.set(baseScale, baseScale, baseScale);
    notesGroup.scale.set(baseScale, baseScale, baseScale);

    if (typeof controls.handleResize === 'function') controls.handleResize();
  }

  applyLayout();
  document.body.appendChild(renderer.domElement);

  window.addEventListener('resize', applyLayout);

  /* ============================================================
   * Data loading (parts, borders, numbers)
   * ============================================================ */
  Promise.all([
    fetch('partsList.json').then(r => r.json())
  ]).then(([parts]) => {
    const { borders, cells } = parts;

    // Load borders
    borders.forEach(border => {
      loader.load(`assets/Borders/${border}.gltf`, (gltf) => {
        const part = gltf.scene;
        part.name = border;
        bordersGroup.add(part);
      });
    });

    // Load cells with base pastel material (we recolor on selection / given)
    cells.forEach(cell => {
      loader.load(`assets/Cells/${cell}.gltf`, (gltf) => {
        const part = gltf.scene;
        part.name = cell;
        part.traverse((child) => {
          if (child.isMesh) {
            // default color depends on subgrid, not known yet here; set a neutral,
            // we’ll recolor in setupSudokuMechanics and colorCell().
            child.material = new THREE.MeshLambertMaterial({ color: 0xffffff });
          }
        });
        cellsGroup.add(part);
      });
    });

    // small delay then start game
    setTimeout(() => startNewGame('Beginner'), 800);
  }).catch(err => console.error('Error loading game data:', err));

  /* ============================================================
   * Sudoku mechanics
   * ============================================================ */

  function getCellCoordinates(cellName) {
    // cellName = Sub_{s}_Cell_{r}_{c}
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

    // same row
    for (let c = 0; c < 9; c++) {
      const s = Math.floor(coords.row / 3) * 3 + Math.floor(c / 3) + 1;
      const n = `Sub_${s}_Cell_${(coords.row % 3) + 1}_${(c % 3) + 1}`;
      related.add(n);
    }
    // same column
    for (let r = 0; r < 9; r++) {
      const s = Math.floor(r / 3) * 3 + Math.floor(coords.col / 3) + 1;
      const n = `Sub_${s}_Cell_${(r % 3) + 1}_${(coords.col % 3) + 1}`;
      related.add(n);
    }
    // same 3×3 box
    const sr = Math.floor(coords.row / 3) * 3;
    const sc = Math.floor(coords.col / 3) * 3;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const rr = sr + i, cc = sc + j;
      const s = Math.floor(rr / 3) * 3 + Math.floor(cc / 3) + 1;
      const n = `Sub_${s}_Cell_${(rr % 3) + 1}_${(cc % 3) + 1}`;
      related.add(n);
    }
    return Array.from(related);
  }

  function colorCell(subGrid, cellName, colorHex) {
    const cell = cellsGroup.getObjectByName(cellName);
    if (!cell) return;
    cell.traverse((child) => {
      if (child.isMesh) child.material.color.setHex(colorHex);
    });
  }

  function highlightRelatedCells(cellName, on) {
    const peers = getRelatedCells(cellName);
    peers.forEach(n => {
      if (n === cellName) return;
      const info = displayedNumbers[n];
      // Include given cells too (requested behavior)
      const baseColor = getBaseCellColorFor(getCellCoordinates(n).subGrid, info?.isGiven);
      colorCell(getCellCoordinates(n).subGrid, n, on ? COLORS.RELATED_CELL : baseColor);
    });
  }

  function removeOldNumber(cellName) {
    const info = displayedNumbers[cellName];
    if (!info || info.isGiven) return;
    if (info.modelName) {
      const m = numbersGroup.getObjectByName(info.modelName);
      if (m) {
        numbersGroup.remove(m);
        m.traverse((c) => { if (c.isMesh) { c.geometry.dispose(); c.material.dispose(); } });
      }
      info.number = null;
      info.modelName = null;
    }
  }

  function isValidSudokuMove(grid, row, col, num) {
    for (let x = 0; x < 9; x++) if (x !== col && grid[row][x] === num) return false;
    for (let x = 0; x < 9; x++) if (x !== row && grid[x][col] === num) return false;
    const sr = Math.floor(row / 3) * 3;
    const sc = Math.floor(col / 3) * 3;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const rr = sr + i, cc = sc + j;
      if ((rr !== row || cc !== col) && grid[rr][cc] === num) return false;
    }
    return true;
  }

  function checkSolution() {
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (!sudokuGrid[r][c]) return false;
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (sudokuGrid[r][c] !== sudokuSolution[r][c]) return false;
    return true;
  }

  function generateValidCompleteSolution() {
    // base solved grid, then randomize within bands a bit
    const base = [
      [5,3,4,6,7,8,9,1,2],[6,7,2,1,9,5,3,4,8],[1,9,8,3,4,2,5,6,7],
      [8,5,9,7,6,1,4,2,3],[4,2,6,8,5,3,7,9,1],[7,1,3,9,2,4,8,5,6],
      [9,6,1,5,3,7,2,8,4],[2,8,7,4,1,9,6,3,5],[3,4,5,2,8,6,1,7,9]
    ].map(r => [...r]);

    for (let b = 0; b < 3; b++) {
      if (Math.random() < 0.5) {
        const r1 = b * 3 + Math.floor(Math.random() * 3);
        const r2 = b * 3 + Math.floor(Math.random() * 3);
        [base[r1], base[r2]] = [base[r2], base[r1]];
      }
    }
    return base;
  }

  function generatePuzzle(difficulty = 'Beginner') {
    const settings = {
      Beginner:     { minClues: 70, maxClues: 75 },
      Intermediate: { minClues: 60, maxClues: 65 },
      Expert:       { minClues: 25, maxClues: 34 },
      Master:       { minClues: 17, maxClues: 24 }
    }[difficulty];

    const solution = generateValidCompleteSolution();
    const puzzle = solution.map(r => [...r]);

    const targetClues = settings.minClues + Math.floor(Math.random() * (settings.maxClues - settings.minClues + 1));
    const cellsToRemove = 81 - targetClues;

    const pos = [];
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) pos.push([r, c]);
    for (let i = pos.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pos[i], pos[j]] = [pos[j], pos[i]];
    }
    for (let i = 0; i < cellsToRemove; i++) {
      const [r, c] = pos[i];
      puzzle[r][c] = 0;
    }
    return { sudokuBoard: puzzle, sudokuSolution: solution };
  }

  function clearGame() {
    editableCells.clear();
    Object.keys(displayedNumbers).forEach(k => delete displayedNumbers[k]);

    // clear number meshes
    numbersGroup.children.slice().forEach(ch => {
      numbersGroup.remove(ch);
      ch.traverse(n => { if (n.isMesh) { n.geometry.dispose(); n.material.dispose(); } });
    });
    // clear notes meshes
    notesGroup.children.slice().forEach(ch => {
      notesGroup.remove(ch);
      ch.traverse(n => { if (n.isMesh) { n.geometry.dispose(); n.material.dispose(); } });
    });

    // reset cell colors back to their base pastel
    cellsGroup.children.forEach(cell => {
      const nm = cell.name;
      if (!nm?.startsWith('Sub_')) return;
      const sg = nm.split('_')[1];
      colorCell(sg, nm, getBaseCellColorFor(sg, false));
    });

    selectedCell = null;
  }

  function startNewGame(diff = currentDifficulty) {
    stopTimer();
    gameTimer = 0;
    timerEl.textContent = '00:00';
    currentDifficulty = diff;

    // active button
    document.querySelectorAll('.difficulty-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.difficulty === diff);
    });

    clearGame();

    const data = generatePuzzle(diff);
    sudokuSolution = data.sudokuSolution;
    sudokuGrid = data.sudokuBoard.map(row => [...row]);

    loadGameWithData(data);
  }

  function loadGameWithData(data) {
    const { sudokuBoard } = data;
    fetch('partsList.json').then(r => r.json()).then(partsList => {
      const { cells } = partsList;
      setupSudokuMechanics(cells, sudokuBoard);
    });
  }

  function setupSudokuMechanics(cells, board) {
    board.forEach((row, r) => {
      row.forEach((val, c) => {
        const subGrid = Math.floor(r / 3) * 3 + Math.floor(c / 3) + 1;
        const cellName = `Sub_${subGrid}_Cell_${(r % 3) + 1}_${(c % 3) + 1}`;
        const cellCoords = `${(r % 3) + 1}_${(c % 3) + 1}`;
        const isGiven = val !== 0;

        // base cell color by subgrid + state
        colorCell(subGrid, cellName, getBaseCellColorFor(subGrid, isGiven));

        if (isGiven) {
          const file = `Number_${val}`;
          const p = `assets/Numbers/${subGrid}/Cell_${cellCoords}/${file}.gltf`;
          loader.load(p, (gltf) => {
            const part = gltf.scene;
            part.name = `${cellName}_${file}`;
            part.traverse((ch) => { if (ch.isMesh) ch.material = new THREE.MeshLambertMaterial({ color: getNumberColor(true) }); });
            numbersGroup.add(part);
          });
          displayedNumbers[cellName] = { number: val, modelName: `${cellName}_Number_${val}`, isGiven: true };
        } else {
          editableCells.add(cellName);
          displayedNumbers[cellName] = { number: null, modelName: null, isGiven: false };
        }
      });
    });
  }

  /* ============================================================
   * Input: numbers / notes / erase
   * ============================================================ */

  function eraseCell(cellName) {
    const info = displayedNumbers[cellName];
    if (!info || info.isGiven) return;

    removeOldNumber(cellName);

    // remove all notes for that cell
    const rm = [];
    notesGroup.children.forEach(n => { if (n.name.startsWith(cellName + '_New_Number_')) rm.push(n); });
    rm.forEach(n => {
      notesGroup.remove(n);
      n.traverse(ch => { if (ch.isMesh) { ch.geometry.dispose(); ch.material.dispose(); } });
    });

    const { row, col } = getCellCoordinates(cellName);
    sudokuGrid[row][col] = null;

    // reset base color
    const sg = getCellCoordinates(cellName).subGrid;
    colorCell(sg, cellName, getBaseCellColorFor(sg, false));
  }

  function updateAutomaticNotes(cellName, placedNumber) {
    const peers = getRelatedCells(cellName);
    peers.forEach(n => {
      if (!editableCells.has(n)) return;
      const noteFile = `New_Number_${placedNumber}`;
      const full = `${n}_${noteFile}`;
      const model = notesGroup.getObjectByName(full);
      if (model) {
        notesGroup.remove(model);
        model.traverse((ch) => { if (ch.isMesh) { ch.geometry.dispose(); ch.material.dispose(); } });
      }
    });
  }

  function inputNumber(num) {
    if (!selectedCell || !editableCells.has(selectedCell.cellName)) return;
    startTimer();

    const { cellName, subGrid } = selectedCell;
    const cellCoords = `${cellName.split('_')[3]}_${cellName.split('_')[4]}`;
    const info = displayedNumbers[cellName];
    if (!info || info.isGiven) return;

    if (currentInputMode === 'numbers') {
      // validate
      const { row, col } = getCellCoordinates(cellName);
      if (!isValidSudokuMove(sudokuGrid, row, col, num)) {
        toast('Invalid move! Number already exists in row, column, or box.');
        return;
      }

      // remove prior number and notes
      removeOldNumber(cellName);
      const rm = [];
      notesGroup.children.forEach(n => { if (n.name.startsWith(cellName + '_New_Number_')) rm.push(n); });
      rm.forEach(n => {
        notesGroup.remove(n);
        n.traverse((ch) => { if (ch.isMesh) { ch.geometry.dispose(); ch.material.dispose(); } });
      });

      const file = `Number_${num}`;
      const p = `assets/Numbers/${subGrid}/Cell_${cellCoords}/${file}.gltf`;
      loader.load(p, (gltf) => {
        const part = gltf.scene;
        part.name = `${cellName}_${file}`;
        part.traverse((ch) => { if (ch.isMesh) ch.material = new THREE.MeshLambertMaterial({ color: getNumberColor(false) }); });
        numbersGroup.add(part);
      });

      displayedNumbers[cellName] = { ...displayedNumbers[cellName], number: num, modelName: `${cellName}_Number_${num}` };
      sudokuGrid[row][col] = num;

      updateAutomaticNotes(cellName, num);

      if (checkSolution()) {
        stopTimer();
        toast(`Solved in ${formatTime(gameTimer)}!`);
        setTimeout(() => startNewGame(currentDifficulty), 1500);
      }
    } else {
      // notes mode
      if (displayedNumbers[cellName].number !== null) {
        removeOldNumber(cellName);
        const { row, col } = getCellCoordinates(cellName);
        sudokuGrid[row][col] = null;
      }

      const noteFile = `New_Number_${num}`;
      const path = `assets/AdditionalNumbers/${subGrid}/Cell_${cellCoords}/${noteFile}.gltf`;
      const full = `${cellName}_${noteFile}`;

      const exists = notesGroup.getObjectByName(full);
      if (exists) {
        notesGroup.remove(exists);
        exists.traverse((c) => { if (c.isMesh) { c.geometry.dispose(); c.material.dispose(); } });
      } else {
        loader.load(path, (gltf) => {
          const part = gltf.scene;
          part.name = full;
          part.traverse((ch) => { if (ch.isMesh) ch.material = new THREE.MeshLambertMaterial({ color: COLORS.PLAYER_NUMBER }); });
          notesGroup.add(part);
        });
      }
    }
  }

  function toast(msg) {
    const t = document.createElement('div');
    t.style.cssText = `
      position: fixed; top: 20px; right: 20px; z-index: 2500;
      background: linear-gradient(135deg,#ff6b6b,#ee5a52); color: #fff;
      padding: 10px 14px; border-radius: 10px; box-shadow: 0 6px 20px rgba(0,0,0,.15);
      transform: translateY(-12px); opacity: 0; transition: all .2s ease;
      font-weight: 600; letter-spacing: .2px;`;
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => { t.style.transform = 'translateY(0)'; t.style.opacity = '1'; });
    setTimeout(() => {
      t.style.transform = 'translateY(-12px)'; t.style.opacity = '0';
      setTimeout(() => t.remove(), 200);
    }, 1500);
  }

  /* ============================================================
   * Selection via raycasting (click/touch on canvas)
   * ============================================================ */
  function onPointerEvent(event) {
    event.preventDefault();
    const p = event.touches ? event.touches[0] : event;

    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((p.clientX - rect.left) / rect.width) * 2 - 1,
      -((p.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(cellsGroup.children, true);
    if (hits.length === 0) return;

    const obj = hits[0].object;
    const cellName = obj?.parent?.name;
    if (!cellName || !cellName.startsWith('Sub_')) return;

    // un-highlight previous
    if (selectedCell) {
      highlightRelatedCells(selectedCell.cellName, false);
      const base = getBaseCellColorFor(getCellCoordinates(selectedCell.cellName).subGrid, displayedNumbers[selectedCell.cellName]?.isGiven);
      colorCell(selectedCell.subGrid, selectedCell.cellName, base);
    }

    selectedCell = { subGrid: cellName.split('_')[1], cellName };

    // highlight new
    colorCell(selectedCell.subGrid, selectedCell.cellName, COLORS.SELECTED_CELL);
    highlightRelatedCells(selectedCell.cellName, true);
  }

  renderer.domElement.addEventListener('click', onPointerEvent);
  renderer.domElement.addEventListener('touchstart', onPointerEvent, { passive: false });

  window.addEventListener('keypress', (e) => {
    const k = e.key;
    if (selectedCell && k >= '1' && k <= '9') inputNumber(parseInt(k, 10));
  });

  /* ============================================================
   * Trackpad → synthetic mouse drag to canvas center
   * ============================================================ */
  (function initTrackpad() {
    let dragging = false;
    let lastX = 0, lastY = 0;

    function canvasCenter() {
      const rect = renderer.domElement.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }
    function send(type, x, y) {
      const ev = new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true });
      renderer.domElement.dispatchEvent(ev);
    }

    function start(clientX, clientY) {
      dragging = true;
      lastX = clientX; lastY = clientY;
      const c = canvasCenter();
      send('mousedown', c.x, c.y);
    }
    function move(clientX, clientY) {
      if (!dragging) return;
      const dx = clientX - lastX;
      const dy = clientY - lastY;
      lastX = clientX; lastY = clientY;

      const c = canvasCenter();
      // amplify a bit so small finger/mouse moves feel good
      send('mousemove', c.x + dx * 2, c.y + dy * 2);
    }
    function end() {
      if (!dragging) return;
      dragging = false;
      const c = canvasCenter();
      send('mouseup', c.x, c.y);
    }

    // Mouse
    trackpadSurface.addEventListener('mousedown', (e) => { e.preventDefault(); start(e.clientX, e.clientY); });
    window.addEventListener('mousemove', (e) => { if (dragging) { e.preventDefault(); move(e.clientX, e.clientY); } });
    window.addEventListener('mouseup',   () => end());

    // Touch
    trackpadSurface.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0]; e.preventDefault(); start(t.clientX, t.clientY);
    }, { passive: false });

    trackpadSurface.addEventListener('touchmove', (e) => {
      if (!dragging || e.touches.length !== 1) return;
      const t = e.touches[0]; e.preventDefault(); move(t.clientX, t.clientY);
    }, { passive: false });

    trackpadSurface.addEventListener('touchend', (e) => { e.preventDefault(); end(); }, { passive: false });
    trackpadSurface.addEventListener('touchcancel', () => end());
  })();

  /* ============================================================
   * Animate
   * ============================================================ */
  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();
});
