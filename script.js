document.addEventListener('DOMContentLoaded', () => {
    let sudokuSolution = [];

    // Set up the scene, camera, and renderer
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.01, 100);
    camera.position.set(0, 5, 3);
    camera.lookAt(0, 0, 0);  // Adjusted to move torus up
    camera.updateProjectionMatrix();

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);
    
    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(15, 25, 15);  // Moved light further back
    scene.add(directionalLight);

    // Set up groups
    const loader = new THREE.GLTFLoader();
    const cellsGroup = new THREE.Group();
    const bordersGroup = new THREE.Group();
    const numbersGroup = new THREE.Group();
    const notesGroup = new THREE.Group();

    // Scale all groups
    cellsGroup.scale.set(5, 5, 5);
    bordersGroup.scale.set(5, 5, 5);
    numbersGroup.scale.set(5, 5, 5);
    notesGroup.scale.set(5, 5, 5);

    // Add groups to scene
    scene.add(cellsGroup);
    scene.add(bordersGroup);
    scene.add(numbersGroup);
    scene.add(notesGroup);

    // Constants for colors
    const COLORS = {
        DEFAULT_CELL: 0xFFFFFF,
        SELECTED_CELL: 0xFF8C00,  // Dark orange
        RELATED_CELL: 0xFFFF00,   // Original yellow
        GIVEN_NUMBER: 0x8B0000,   // Dark red
        PLAYER_NUMBER: 0x000000,  // Black
        GIVEN_CELL: 0xD3D3D3
    };

    // Camera controls
    const controls = new THREE.TrackballControls(camera, renderer.domElement);
    controls.rotateSpeed = 3.0;
    controls.dynamicDampingFactor = 0.3;
    controls.noZoom = false;
    controls.noPan = true;
    controls.target.set(0, 0.5, 0);  // Adjusted to match camera lookAt
    controls.minDistance = 2;
    controls.maxDistance = 10;
    controls.update();

    // Game state variables
    let selectedCell = null;
    let currentInputMode = "numbers";
    const editableCells = new Set();
    const displayedNumbers = {};
    let sudokuGrid = Array(9).fill().map(() => Array(9).fill(null));

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
        fetch('partsList.json').then(response => response.json()),
        fetch('sudokuGame.json').then(response => response.json())
    ]).then(([partsListData, sudokuGameData]) => {
        const { borders, cells, numbers } = partsListData;
        const { sudokuBoard, sudokuSolution: solution } = sudokuGameData;

        sudokuSolution = solution;
        sudokuGrid = sudokuBoard.map(row => [...row]);

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

        setupSudokuMechanics(cells, sudokuBoard);
    }).catch(error => console.error('Error loading game data:', error));

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
        
        const cellData = displayedNumbers[selectedCell.cellName];
        if (!cellData || cellData.isGiven) return;

        const { subGrid, cellName } = selectedCell;
        const cellCoords = `${cellName.split('_')[3]}_${cellName.split('_')[4]}`;
        
        if (currentInputMode === "numbers") {
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
                const message = document.createElement('div');
                message.style.position = 'absolute';
                message.style.top = '50%';
                message.style.left = '50%';
                message.style.transform = 'translate(-50%, -50%)';
                message.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
                message.style.padding = '20px';
                message.style.borderRadius = '10px';
                message.style.boxShadow = '0 0 10px rgba(0, 0, 0, 0.5)';
                message.style.fontSize = '24px';
                message.style.color = '#000';
                message.style.textAlign = 'center';
                message.innerHTML = 'Congratulations!<br>You solved the puzzle!';

                const closeButton = document.createElement('button');
                closeButton.innerHTML = 'Close';
                closeButton.style.marginTop = '10px';
                closeButton.style.padding = '5px 15px';
                closeButton.style.fontSize = '16px';
                closeButton.addEventListener('click', () => {
                    document.body.removeChild(message);
                });
                message.appendChild(closeButton);

                document.body.appendChild(message);
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

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        controls.handleResize();
    });

    // Animation Loop
    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
    }

    animate();
});