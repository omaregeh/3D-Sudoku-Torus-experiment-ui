document.addEventListener('DOMContentLoaded', () => {
  // =========================
  // Scene / camera / renderer
  // =========================
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
  scene.add(new THREE.AmbientLight(0xffffff, 1.0));
  const dir = new THREE.DirectionalLight(0xffffff, 0.1);
  dir.position.set(15, 25, 15);
  scene.add(dir);

  // ===============
  // Groups & loader
  // ===============
  const loader = new THREE.GLTFLoader();
  const cellsGroup = new THREE.Group();
  const bordersGroup = new THREE.Group();
  const numbersGroup = new THREE.Group();
  const notesGroup = new THREE.Group();
  const decorativeGroup = new THREE.Group();

  const scaleFactor = window.innerWidth < 768 ? 6.5 : 5;
  [cellsGroup, bordersGroup, numbersGroup, notesGroup].forEach(g =>
    g.scale.set(scaleFactor, scaleFactor, scaleFactor)
  );
  decorativeGroup.scale.set(scaleFactor * 0.3, scaleFactor * 0.3, scaleFactor * 0.3);

  scene.add(cellsGroup, bordersGroup, numbersGroup, notesGroup, decorativeGroup);

  // ============
  // Color theme
  // ============
  // Pastel base per subgrid with a darker shade for "given" cells
  const SUBGRID_COLORS = {
    1: { base: 0xE0F2FE, given: 0xBAE6FD }, // baby blue
    2: { base: 0xFEF9C3, given: 0xFDE68A }, // baby yellow
    3: { base: 0xFCE7F3, given: 0xFBCFE8 }, // baby pink
    4: { base: 0xDCFCE7, given: 0xBBF7D0 }, // baby green (minty)
    5: { base: 0xE9D5FF, given: 0xD8B4FE }, // baby purple (lavender)
    6: { base: 0xFFE4E6, given: 0xFECDD3 }, // baby coral/peach
    7: { base: 0xE2E8F0, given: 0xCBD5E1 }, // baby gray
    8: { base: 0xF5D0FE, given: 0xF0ABFC }, // baby magenta-lilac
    9: { base: 0xCCFBF1, given: 0x99F6E4 }, // baby aqua/mint
  };

  const COLORS = {
    SELECTED_CELL: 0xFF8C00, // orange
    RELATED_CELL:  0xA0A1A4, // darker gray highlight
    GIVEN_NUMBER:  0x8B0000, // dark red
    PLAYER_NUMBER: 0x000000  // black
  };

  // ===========
  // Controls
  // ===========
  const controls = new THREE.TrackballControls(camera, renderer.domElement);
  controls.rotateSpeed = 5.0;
  controls.dynamicDampingFactor = 0.3;
  controls.noZoom = true;
  controls.noPan = true; // we toggle this ON temporarily while trackpad is panning
  controls.target.set(0, 0, 0);
  controls.update();

  // =================
  // Game state
  // =================
  let selectedCell = null;               // { subGrid, cellName }
  let currentInputMode = "numbers";      // "numbers" | "additionalNumbers"
  let currentDifficulty = 'Beginner';
  let gameTimer = 0;
  let timerInterval = null;
  let gameStartTime = null;
  let gameInProgress = false;

  const editableCells = new Set();
  const displayedNumbers = {};           // cellName -> { number, modelName, isGiven }
  let sudokuGrid = Array(9).fill().map(() => Array(9).fill(null));
  let sudokuSolution = [];

  // ===================
  // UI: Right panel
  // ===================
  const panel = document.createElement('div');
  panel.className = 'control-panel';
  document.body.appendChild(panel);

  // top row (difficulty + timer)
  const topRow = document.createElement('div');
  topRow.className = 'top-row';
  panel.appendChild(topRow);

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

  // number pad
  const numberPad = document.createElement('div');
  numberPad.className = 'number-pad';
  for (let i = 1; i <= 9; i++) {
    const b = document.createElement('button');
    b.textContent = String(i);
    b.addEventListener('click', () => selectedCell && inputNumber(i));
    b.addEventListener('touchstart', (e) => { e.preventDefault(); selectedCell && inputNumber(i); }, { passive: false });
    numberPad.appendChild(b);
  }
  panel.appendChild(numberPad);

  // utility buttons
  const utility = document.createElement('div');
  utility.className = 'utility-buttons';
  panel.appendChild(utility);

  const modeToggle = document.createElement('button');
  modeToggle.textContent = 'Toggle: Numbers';
  modeToggle.addEventListener('click', () => toggleMode());
  modeToggle.addEventListener('touchstart', (e) => { e.preventDefault(); toggleMode(); }, { passive: false });
  utility.appendChild(modeToggle);

  const eraseBtn = document.createElement('button');
  eraseBtn.textContent = 'Erase';
  eraseBtn.addEventListener('click', () => selectedCell && eraseCell(selectedCell.cellName));
  eraseBtn.addEventListener('touchstart', (e) => { e.preventDefault(); selectedCell && eraseCell(selectedCell.cellName); }, { passive: false });
  utility.appendChild(eraseBtn);

  // ==========================
  // Trackpad (CAD-style)
  // ==========================
  installCadTrackpad({ renderer, controls });

  function toggleMode() {
    currentInputMode = currentInputMode === "numbers" ? "additionalNumbers" : "numbers";
    modeToggle.textContent = `Toggle: ${currentInputMode === "numbers" ? "Numbers" : "Additional Numbers"}`;
  }

  // ==============================
  // Helpers: parsing & colors
  // ==============================
  function getBaseCellColorFor(sub)   { return SUBGRID_COLORS[sub]?.base   ?? 0xFFFFFF; }
  function getGivenCellColorFor(sub)  { return SUBGRID_COLORS[sub]?.given  ?? 0xD3D3D3; }

  function getCellParts(cellName) {
    // "Sub_4_Cell_2_3" -> sub=4, r=2, c=3
    const parts = cellName.split('_');
    return {
      subGrid: parseInt(parts[1], 10),
      r: parseInt(parts[3], 10),
      c: parseInt(parts[4], 10)
    };
  }

  function getBaseOrGivenColor(cellName) {
    const { subGrid } = getCellParts(cellName);
    return displayedNumbers[cellName]?.isGiven
      ? getGivenCellColorFor(subGrid)
      : getBaseCellColorFor(subGrid);
  }

  function colorCellByName(cellName, hex) {
    const obj = cellsGroup.getObjectByName(cellName);
    if (!obj) return;
    obj.traverse(ch => { if (ch.isMesh) ch.material.color.setHex(hex); });
  }

  function restoreCellColor(cellName) {
    colorCellByName(cellName, getBaseOrGivenColor(cellName));
  }

  // Highlight peers (includes given cells)
  function getCellCoordinates(cellName) {
    const { subGrid, r, c } = getCellParts(cellName); // r/c are 1..3 inside subgrid
    const row = (Math.floor((subGrid-1) / 3) * 3) + (r-1);
    const col = ((subGrid-1) % 3) * 3 + (c-1);
    return { row, col, subGrid };
  }

  function getRelatedCells(cellName) {
    const coords = getCellCoordinates(cellName);
    const rel = new Set();

    // row peers
    for (let col = 0; col < 9; col++) {
      const sg = Math.floor(coords.row / 3) * 3 + Math.floor(col / 3) + 1;
      const name = `Sub_${sg}_Cell_${(coords.row % 3) + 1}_${(col % 3) + 1}`;
      rel.add(name);
    }
    // col peers
    for (let row = 0; row < 9; row++) {
      const sg = Math.floor(row / 3) * 3 + Math.floor(coords.col / 3) + 1;
      const name = `Sub_${sg}_Cell_${(row % 3) + 1}_${(coords.col % 3) + 1}`;
      rel.add(name);
    }
    // box peers
    const sr = Math.floor(coords.row / 3) * 3;
    const sc = Math.floor(coords.col / 3) * 3;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      const row = sr + r, col = sc + c;
      const sg = Math.floor(row / 3) * 3 + Math.floor(col / 3) + 1;
      const name = `Sub_${sg}_Cell_${(row % 3) + 1}_${(col % 3) + 1}`;
      rel.add(name);
    }
    return Array.from(rel);
  }

  function highlightRelatedCells(cellName, on=true) {
    const list = getRelatedCells(cellName);
    list.forEach(name => {
      if (name === cellName) return;
      colorCellByName(name, on ? COLORS.RELATED_CELL : getBaseOrGivenColor(name));
    });
  }

  // =========================
  // Timer helpers
  // =========================
  function formatTime(s) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  function startTimer() {
    if (gameInProgress) return;
    gameInProgress = true;
    gameStartTime = Date.now();
    timerInterval = setInterval(() => {
      gameTimer = Math.floor((Date.now() - gameStartTime) / 1000);
      timerDisplay.textContent = formatTime(gameTimer);
    }, 1000);
  }
  function stopTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
    gameInProgress = false;
  }

  // ====================================
  // Load geometry & start initial puzzle
  // ====================================
  Promise.all([
    fetch('partsList.json').then(r => r.json())
  ]).then(([parts]) => {
    const { borders, cells } = parts;

    // borders
    borders.forEach(n => {
      loader.load(`assets/Borders/${n}.gltf`, gltf => {
        const part = gltf.scene;
        part.name = n;
        bordersGroup.add(part);
      });
    });

    // cells (assign base pastel per subgrid)
    cells.forEach(n => {
      loader.load(`assets/Cells/${n}.gltf`, gltf => {
        const part = gltf.scene;
        part.name = n;
        const { subGrid } = getCellParts(n);
        const base = getBaseCellColorFor(subGrid);
        part.traverse(ch => {
          if (ch.isMesh) ch.material = new THREE.MeshLambertMaterial({ color: base });
        });
        cellsGroup.add(part);
      });
    });

    setTimeout(() => {
      startNewGame('Beginner');
    }, 600);
  }).catch(e => console.error('load error', e));

  // =================================
  // New game / puzzle generation
  // =================================
  function startNewGame(diff = currentDifficulty) {
    stopTimer();
    gameTimer = 0;
    timerDisplay.textContent = '00:00';
    currentDifficulty = diff;

    document.querySelectorAll('.difficulty-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.difficulty === diff);
    });

    clearGame();

    const data = generatePuzzle(diff);
    sudokuSolution = data.sudokuSolution;
    sudokuGrid = data.sudokuBoard.map(r => [...r]);
    loadGameWithData(data);
  }

  function clearGame() {
    editableCells.clear();
    Object.keys(displayedNumbers).forEach(k => delete displayedNumbers[k]);

    // remove number meshes
    [...numbersGroup.children].forEach(child => {
      numbersGroup.remove(child);
      child.traverse(n => { if (n.isMesh) { n.geometry.dispose(); n.material.dispose(); } });
    });
    // remove note meshes
    [...notesGroup.children].forEach(child => {
      notesGroup.remove(child);
      child.traverse(n => { if (n.isMesh) { n.geometry.dispose(); n.material.dispose(); } });
    });

    // restore cells to base pastel (not white)
    cellsGroup.children.forEach(cell => {
      const name = cell.name;
      const { subGrid } = getCellParts(name);
      const base = getBaseCellColorFor(subGrid);
      cell.traverse(ch => { if (ch.isMesh) ch.material.color.setHex(base); });
    });

    selectedCell = null;
  }

  function loadGameWithData(gameData) {
    const board = gameData.sudokuBoard;
    fetch('partsList.json').then(r => r.json()).then(parts => {
      const { cells } = parts;
      setupSudokuMechanics(cells, board);
    });
  }

  function setupSudokuMechanics(cellNames, board) {
    board.forEach((row, R) => {
      row.forEach((val, C) => {
        const subGrid = Math.floor(R / 3) * 3 + Math.floor(C / 3) + 1;
        const name = `Sub_${subGrid}_Cell_${(R % 3) + 1}_${(C % 3) + 1}`;
        const cellCoords = `${(R % 3) + 1}_${(C % 3) + 1}`;

        if (val !== 0) {
          // number (given)
          const f = `Number_${val}`;
          const path = `assets/Numbers/${subGrid}/Cell_${cellCoords}/${f}.gltf`;
          loader.load(path, gltf => {
            const m = gltf.scene;
            m.name = `${name}_${f}`;
            m.traverse(ch => { if (ch.isMesh) ch.material = new THREE.MeshLambertMaterial({ color: COLORS.GIVEN_NUMBER }); });
            numbersGroup.add(m);
          });
          colorCellByName(name, getGivenCellColorFor(subGrid));
          displayedNumbers[name] = { number: val, modelName: `${name}_Number_${val}`, isGiven: true };
        } else {
          editableCells.add(name);
          colorCellByName(name, getBaseCellColorFor(subGrid));
          displayedNumbers[name] = { number: null, modelName: null, isGiven: false };
        }
      });
    });
  }

  // ==========================
  // Input / editing
  // ==========================
  function removeOldNumber(cellName) {
    const info = displayedNumbers[cellName];
    if (!info || info.isGiven || !info.modelName) return;
    const model = numbersGroup.getObjectByName(info.modelName);
    if (model) {
      numbersGroup.remove(model);
      model.traverse(ch => { if (ch.isMesh) { ch.geometry.dispose(); ch.material.dispose(); } });
    }
    info.number = null;
    info.modelName = null;
  }

  function eraseCell(cellName) {
    const info = displayedNumbers[cellName];
    if (!info || info.isGiven) return;

    // remove number
    removeOldNumber(cellName);
    // remove notes
    const rm = [];
    notesGroup.children.forEach(n => { if (n.name.startsWith(cellName)) rm.push(n); });
    rm.forEach(m => {
      notesGroup.remove(m);
      m.traverse(ch => { if (ch.isMesh) { ch.geometry.dispose(); ch.material.dispose(); } });
    });
    const { row, col } = getCellCoordinates(cellName);
    sudokuGrid[row][col] = null;
    restoreCellColor(cellName);
  }

  function isValidSudokuMove(grid, row, col, num) {
    for (let x = 0; x < 9; x++) if (x !== col && grid[row][x] === num) return false;
    for (let x = 0; x < 9; x++) if (x !== row && grid[x][col] === num) return false;
    const r0 = Math.floor(row/3)*3, c0 = Math.floor(col/3)*3;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      const rr = r0 + r, cc = c0 + c;
      if ((rr !== row || cc !== col) && grid[rr][cc] === num) return false;
    }
    return true;
  }

  function inputNumber(number) {
    if (!selectedCell || !editableCells.has(selectedCell.cellName)) return;

    startTimer();

    const info = displayedNumbers[selectedCell.cellName];
    if (!info || info.isGiven) return;

    const { subGrid, cellName } = selectedCell;
    const cellCoords = `${cellName.split('_')[3]}_${cellName.split('_')[4]}`;

    if (currentInputMode === 'numbers') {
      const { row, col } = getCellCoordinates(cellName);
      if (!isValidSudokuMove(sudokuGrid, row, col, number)) {
        showInvalidToast('Invalid move! Number already exists in row, column, or box.');
        return;
      }

      // clean previous
      removeOldNumber(cellName);
      // remove notes in this cell
      const toRemove = [];
      notesGroup.children.forEach(n => { if (n.name.startsWith(cellName)) toRemove.push(n); });
      toRemove.forEach(m => {
        notesGroup.remove(m);
        m.traverse(ch => { if (ch.isMesh) { ch.geometry.dispose(); ch.material.dispose(); } });
      });

      const f = `Number_${number}`;
      const path = `assets/Numbers/${subGrid}/Cell_${cellCoords}/${f}.gltf`;
      loader.load(path, gltf => {
        const m = gltf.scene;
        m.name = `${cellName}_${f}`;
        m.traverse(ch => { if (ch.isMesh) ch.material = new THREE.MeshLambertMaterial({ color: COLORS.PLAYER_NUMBER }); });
        numbersGroup.add(m);
      });

      displayedNumbers[cellName] = { ...displayedNumbers[cellName], number, modelName: `${cellName}_${f}` };

      sudokuGrid[row][col] = number;
      updateAutomaticNotes(cellName, number);

      if (checkSolution()) {
        stopTimer();
        showCelebration(gameTimer);
        setTimeout(() => startNewGame(currentDifficulty), 3000);
      }
    } else {
      // notes mode
      if (displayedNumbers[cellName].number !== null) {
        removeOldNumber(cellName);
        const { row, col } = getCellCoordinates(cellName);
        sudokuGrid[row][col] = null;
      }
      const note = `New_Number_${number}`;
      const path = `assets/AdditionalNumbers/${subGrid}/Cell_${cellCoords}/${note}.gltf`;
      const full = `${cellName}_${note}`;
      const existing = notesGroup.getObjectByName(full);
      if (existing) {
        notesGroup.remove(existing);
        existing.traverse(ch => { if (ch.isMesh) { ch.geometry.dispose(); ch.material.dispose(); } });
      } else {
        loader.load(path, gltf => {
          const m = gltf.scene;
          m.name = full;
          m.traverse(ch => { if (ch.isMesh) ch.material = new THREE.MeshLambertMaterial({ color: COLORS.PLAYER_NUMBER }); });
          notesGroup.add(m);
        });
      }
    }
  }

  function updateAutomaticNotes(cellName, placedNumber) {
    const related = getRelatedCells(cellName);
    related.forEach(rc => {
      if (editableCells.has(rc)) {
        const noteFile = `New_Number_${placedNumber}`;
        const full = `${rc}_${noteFile}`;
        const m = notesGroup.getObjectByName(full);
        if (m) {
          notesGroup.remove(m);
          m.traverse(ch => { if (ch.isMesh) { ch.geometry.dispose(); ch.material.dispose(); } });
        }
      }
    });
  }

  function checkSolution() {
    // complete?
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (!sudokuGrid[r][c]) return false;
    // match
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (sudokuGrid[r][c] !== sudokuSolution[r][c]) return false;
    return true;
  }

  // tiny toast
  function showInvalidToast(msg) {
    const el = document.createElement('div');
    el.className = 'invalid-move-toast';
    el.textContent = msg;
    Object.assign(el.style, {
      position: 'fixed', top: '20px', right: '20px',
      background: 'linear-gradient(135deg,#ff6b6b,#ee5a52)',
      color: '#fff', padding: '12px 20px', borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(255,107,107,0.3)', fontWeight: '600',
      zIndex: 9999, transform: 'translateX(100%)', transition: 'transform .25s ease'
    });
    document.body.appendChild(el);
    setTimeout(() => el.style.transform = 'translateX(0)', 30);
    setTimeout(() => { el.style.transform = 'translateX(100%)'; setTimeout(() => el.remove(), 250); }, 1800);
  }

  // celebration (minimal)
  function showCelebration(timeSec) {
    const overlay = document.createElement('div');
    overlay.className = 'celebration-overlay';
    overlay.innerHTML = `
      <div class="celebration-content">
        <div class="celebration-icon">🎉</div>
        <h2>Puzzle Solved!</h2>
        <p class="completion-time">Time: ${formatTime(timeSec)}</p>
        <p class="difficulty-label">Difficulty: ${currentDifficulty}</p>
        <p class="next-puzzle-text">Next puzzle loading...</p>
      </div>`;
    document.body.appendChild(overlay);
    setTimeout(() => overlay.remove(), 2800);
  }

  // ======================
  // Pointer selection
  // ======================
  function onPointerEvent(e) {
    e.preventDefault();
    const p = e.touches ? e.touches[0] : e;
    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((p.clientX - rect.left) / rect.width) * 2 - 1,
      -((p.clientY - rect.top) / rect.height) * 2 + 1
    );

    const ray = new THREE.Raycaster();
    ray.setFromCamera(mouse, camera);
    const hits = ray.intersectObjects(cellsGroup.children, true);
    if (!hits.length) return;
    const obj = hits[0].object;
    const cellName = obj.parent.name;

    if (!displayedNumbers[cellName]) return; // not initialized yet

    // restore previous
    if (selectedCell) {
      highlightRelatedCells(selectedCell.cellName, false);
      restoreCellColor(selectedCell.cellName);
    }

    selectedCell = { subGrid: getCellParts(cellName).subGrid, cellName };
    colorCellByName(cellName, COLORS.SELECTED_CELL);
    highlightRelatedCells(cellName, true);
  }

  renderer.domElement.addEventListener('click', onPointerEvent);
  renderer.domElement.addEventListener('touchstart', onPointerEvent, { passive: false });

  // Keyboard numbers
  window.addEventListener('keypress', (e) => {
    if (selectedCell && e.key >= '1' && e.key <= '9') inputNumber(parseInt(e.key, 10));
  });

  // Difficulty events
  difficultySelector.querySelectorAll('.difficulty-btn').forEach(btn => {
    btn.addEventListener('click', () => startNewGame(btn.dataset.difficulty));
  });

  // Resize
  window.addEventListener('resize', () => {
    const sf = window.innerWidth < 768 ? 6.5 : 5;
    [cellsGroup, bordersGroup, numbersGroup, notesGroup].forEach(g => g.scale.set(sf, sf, sf));

    camera.aspect = (window.innerWidth * 0.7) / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth * 0.7, window.innerHeight);
    controls.handleResize();
  });

  // Loop
  (function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  })();

  // ===================================
  // CAD-style trackpad implementation
  // ===================================
  function installCadTrackpad({ renderer, controls }) {
    const panel = document.querySelector('.control-panel');
    if (!panel) return;

    // Build UI block (if not already in HTML)
    let wrap = document.querySelector('.trackpad-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'trackpad-wrap';

      const surface = document.createElement('div');
      surface.className = 'trackpad-surface';

      const label = document.createElement('div');
      label.className = 'trackpad-label';
      label.textContent = 'Trackpad';

      wrap.appendChild(surface);
      wrap.appendChild(label);
      panel.appendChild(wrap);
    }
    const surface = wrap.querySelector('.trackpad-surface');

    const canvas = renderer.domElement;

    // Full-screen shield prevents cell picking while dragging via pad
    const shield = document.createElement('div');
    Object.assign(shield.style, {
      position: 'fixed', left: '0', top: '0', right: '0', bottom: '0',
      pointerEvents: 'none', zIndex: '999', cursor: 'grabbing'
    });
    document.body.appendChild(shield);

    // Helpers
    function canvasCenter() {
      const r = canvas.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    function sendMouse(type, x, y, button, buttons) {
      // IMPORTANT: bubbles=false to avoid recursion into window listeners
      const e = new MouseEvent(type, {
        bubbles: false,
        cancelable: true,
        view: window,
        clientX: x,
        clientY: y,
        button,
        buttons
      });
      canvas.dispatchEvent(e);
    }

    let dragging = false;
    let activeButton = 0; // 0=left/orbit, 2=right/pan
    let lastX = 0, lastY = 0;
    let accX = 0, accY = 0;
    const ROTATE_SENS = 1.0;
    const defaultNoPan = controls.noPan;

    function beginDrag(kind) {
      if (dragging) return;
      dragging = true;
      activeButton = kind;
      accX = 0; accY = 0;

      if (activeButton === 2) controls.noPan = false; // allow panning while pad is dragging

      const { x, y } = canvasCenter();
      lastX = x; lastY = y;

      shield.style.pointerEvents = 'auto';
      sendMouse('mousedown', x, y, activeButton, activeButton === 2 ? 2 : 1);
    }
    function moveDrag(dx, dy) {
      if (!dragging) return;
      accX += dx * ROTATE_SENS;
      accY += dy * ROTATE_SENS;
      const { x, y } = canvasCenter();
      sendMouse('mousemove', x + accX, y + accY, activeButton, activeButton === 2 ? 2 : 1);
    }
    function endDrag() {
      if (!dragging) return;
      const { x, y } = canvasCenter();
      sendMouse('mouseup', x, y, activeButton, 0);
      shield.style.pointerEvents = 'none';
      dragging = false;
      controls.noPan = defaultNoPan;
    }

    // Mouse on pad
    surface.addEventListener('contextmenu', e => e.preventDefault());
    surface.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const button = (e.button === 2 || e.shiftKey) ? 2 : 0;
      beginDrag(button);
      lastX = e.clientX; lastY = e.clientY;
    });

    // Global mousemove/mouseup: ignore synthetic events (isTrusted === false)
    window.addEventListener('mousemove', (e) => {
      if (!dragging || e.isTrusted === false) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      moveDrag(dx, dy);
    });
    window.addEventListener('mouseup', (e) => {
      if (e.isTrusted === false) return;
      endDrag();
    });
    window.addEventListener('blur', endDrag);

    // Touch: 1 finger = orbit, 2+ = pan
    surface.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const kind = (e.touches.length >= 2) ? 2 : 0;
      const t = e.touches[0];
      beginDrag(kind);
      lastX = t.clientX; lastY = t.clientY;
    }, { passive: false });

    surface.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (!dragging) return;
      const t = e.touches[0];
      const dx = t.clientX - lastX;
      const dy = t.clientY - lastY;
      lastX = t.clientX; lastY = t.clientY;
      moveDrag(dx, dy);
    }, { passive: false });

    surface.addEventListener('touchend', (e) => {
      e.preventDefault();
      endDrag();
    }, { passive: false });

    console.log('CAD-style trackpad ready: orbit=left-drag, pan=right-drag/Shift+left, two fingers for pan.');
  }

  // ==========================
  // Puzzle generation (simple)
  // ==========================
  function generatePuzzle(difficulty = 'Beginner') {
    const settings = {
      'Beginner':     { minClues: 45, maxClues: 50 },
      'Intermediate': { minClues: 35, maxClues: 44 },
      'Expert':       { minClues: 25, maxClues: 34 },
      'Master':       { minClues: 17, maxClues: 24 }
    };
    const { minClues, maxClues } = settings[difficulty];

    const solution = generateValidCompleteSolution();

    const puzzle = solution.map(row => [...row]);
    const targetClues = minClues + Math.floor(Math.random() * (maxClues - minClues + 1));
    const toRemove = 81 - targetClues;

    const pos = [];
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) pos.push([r, c]);
    for (let i = pos.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pos[i], pos[j]] = [pos[j], pos[i]];
    }
    for (let i = 0; i < toRemove && i < pos.length; i++) {
      const [r, c] = pos[i];
      puzzle[r][c] = 0;
    }
    return { sudokuBoard: puzzle, sudokuSolution: solution };
  }

  function generateValidCompleteSolution() {
    // A fixed Latin pattern + a little shuffle by swapping rows inside bands
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
    const out = base.map(r => [...r]);
    for (let band = 0; band < 3; band++) {
      if (Math.random() < 0.5) {
        const r1 = band*3 + Math.floor(Math.random()*3);
        const r2 = band*3 + Math.floor(Math.random()*3);
        [out[r1], out[r2]] = [out[r2], out[r1]];
      }
    }
    return out;
  }

});
