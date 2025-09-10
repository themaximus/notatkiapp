(() => {
    const boardContainer = document.getElementById('boardContainer');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    const appTitleButton = document.getElementById('appTitleButton');
    const closeSidebarBtn = document.getElementById('closeSidebarBtn');
    const boardListEl = document.getElementById('boardList');
    const newBoardNameInput = document.getElementById('newBoardNameInput');
    const addBoardBtn = document.getElementById('addBoardBtn');
    const currentBoardTitleEl = document.getElementById('currentBoardTitle');
    
    const mediaModal = document.getElementById('mediaModal');
    const mediaModalContent = document.getElementById('mediaModalContent');
    const closeModalBtn = document.getElementById('closeModalBtn');

    const graphViewContainer = document.getElementById('graphViewContainer');
    const showBoardViewBtn = document.getElementById('showBoardViewBtn');
    const showGraphViewBtn = document.getElementById('showGraphViewBtn');
    const addColumnBtn = document.getElementById('addColumnBtn');

    const customModalOverlay = document.getElementById('customModalOverlay');
    const customModalDialogContent = document.getElementById('customModalContent');
    const customModalButtons = document.getElementById('customModalButtons');

    const LS_ALL_BOARDS_KEY = 'smartKanbanAllBoards'; 
    const LS_ACTIVE_BOARD_ID_KEY = 'smartKanbanActiveBoardId'; 

    let allBoardsData = {};
    let activeBoardId = null;
    let currentView = 'board';
    let saveTimeout;
    let network = null;
    let mediaCache = {};
    let preloadedAudioIcon = null;

    const ICONS = {
        delete: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`,
        add: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>`,
        subtaskToggle: `<svg class="subtasks-toggle-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"/></svg>`,
        edit: `✏️`,
        file: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .28-.22.5-.5.5s-.5-.22-.5-.5V6H15v9.5c0 1.38-1.12 2.5-2.5 2.5s-2.5-1.12-2.5-2.5V5c0-2.21 1.79-4 4-4s4 1.79 4 4v11.5c0 .83-.67 1.5-1.5 1.5s-1.5-.67-1.5-1.5V6h-1.5z"/></svg>`,
        audio: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="white" d="M12 3v9.28c-.47-.17-.97-.28-1.5-.28C8.01 12 6 14.01 6 16.5S8.01 21 10.5 21s4.5-2.01 4.5-4.5V7h4V3h-7z"/></svg>`
    };

    const IndexedDBManager = {
        db: null,
        dbName: 'SmartKanbanDB',
        storeName: 'files',

        init() {
            return new Promise((resolve, reject) => {
                if (this.db) return resolve(this.db);
                
                const request = indexedDB.open(this.dbName, 1);

                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains(this.storeName)) {
                        db.createObjectStore(this.storeName);
                    }
                };

                request.onsuccess = (event) => {
                    this.db = event.target.result;
                    console.log('IndexedDB initialized successfully.');
                    resolve(this.db);
                };

                request.onerror = (event) => {
                    console.error('IndexedDB error:', event.target.errorCode);
                    reject(event.target.error);
                };
            });
        },

        saveFile(file) {
            return new Promise((resolve, reject) => {
                if (!this.db) return reject('DB not initialized');
                const transaction = this.db.transaction([this.storeName], 'readwrite');
                const store = transaction.objectStore(this.storeName);
                const id = generateId('file');
                const request = store.put(file, id);

                request.onsuccess = () => resolve(id);
                request.onerror = (event) => reject(event.target.error);
            });
        },

        getFile(id) {
            return new Promise((resolve, reject) => {
                if (!this.db) return reject('DB not initialized');
                const transaction = this.db.transaction([this.storeName], 'readonly');
                const store = transaction.objectStore(this.storeName);
                const request = store.get(id);

                request.onsuccess = () => resolve(request.result);
                request.onerror = (event) => reject(event.target.error);
            });
        },

        deleteFile(id) {
            return new Promise((resolve, reject) => {
                if (!this.db) return reject('DB not initialized');
                const transaction = this.db.transaction([this.storeName], 'readwrite');
                const store = transaction.objectStore(this.storeName);
                const request = store.delete(id);

                request.onsuccess = () => resolve();
                request.onerror = (event) => reject(event.target.error);
            });
        }
    };

    function showModal(content, buttons) {
        customModalDialogContent.innerHTML = content;
        customModalButtons.innerHTML = '';
        buttons.forEach(btnConfig => {
            const button = document.createElement('button');
            button.textContent = btnConfig.text;
            button.className = `btn ${btnConfig.class}`;
            button.addEventListener('click', () => {
                if (btnConfig.onClick) btnConfig.onClick();
                customModalOverlay.classList.remove('active');
            });
            customModalButtons.appendChild(button);
        });
        customModalOverlay.classList.add('active');
    }

    function showAlert(message) {
        showModal(message, [{ text: 'OK', class: 'btn-primary' }]);
    }

    function showConfirmation(message, onConfirm) {
        showModal(message, [
            { text: 'Отмена', class: 'btn-secondary' },
            { text: 'Подтвердить', class: 'btn-danger', onClick: onConfirm }
        ]);
    }
    
    function debouncedSave() {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            saveCurrentBoardState();
        }, 1500);
    }

    function toggleSidebar() { sidebar.classList.toggle('active'); overlay.classList.toggle('active'); }
    [appTitleButton, closeSidebarBtn, overlay].forEach(el => el.addEventListener('click', toggleSidebar));
    
    boardContainer.addEventListener('click', async (e) => {
        const mediaContainer = e.target.closest('.media-container');
        
        if (e.target.classList.contains('delete-media-btn')) {
            e.preventDefault();
            e.stopPropagation();
            const mediaElement = mediaContainer?.querySelector('[data-file-id]');
            if (mediaElement?.dataset.fileId) {
                try {
                    await IndexedDBManager.deleteFile(mediaElement.dataset.fileId);
                    if (mediaElement.src && mediaElement.src.startsWith('blob:')) {
                        URL.revokeObjectURL(mediaElement.src);
                    }
                } catch (err) {
                    console.error("Failed to delete file from DB", err);
                }
            }
            mediaContainer?.remove();
            saveCurrentBoardState();
            return;
        }

        if (mediaContainer) {
            const mediaElement = mediaContainer.querySelector('img, video');
            if(mediaElement) {
                mediaModal.classList.add('active');
                if (mediaElement.tagName === 'IMG') {
                    mediaModalContent.innerHTML = `<img src="${mediaElement.src}" alt="Enlarged view">`;
                } else if (mediaElement.tagName === 'VIDEO') {
                    mediaModalContent.innerHTML = `<video src="${mediaElement.src}" controls autoplay></video>`;
                }
            }
        }
    });

    function closeModal() { 
        mediaModal.classList.remove('active'); 
        mediaModalContent.innerHTML = "";
    }
    closeModalBtn.addEventListener('click', closeModal);
    mediaModal.addEventListener('click', (e) => { if (e.target.id === 'mediaModal') closeModal(); });

    function generateId(prefix = 'id') { return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`; }
    function loadAllBoards() { const data = localStorage.getItem(LS_ALL_BOARDS_KEY); allBoardsData = data ? JSON.parse(data) : {}; }
    function saveAllBoards() { localStorage.setItem(LS_ALL_BOARDS_KEY, JSON.stringify(allBoardsData)); }
    function loadActiveBoardId() { activeBoardId = localStorage.getItem(LS_ACTIVE_BOARD_ID_KEY); }
    function saveActiveBoardId() { localStorage.setItem(LS_ACTIVE_BOARD_ID_KEY, activeBoardId); }
    function updateCurrentBoardTitle() {
        currentBoardTitleEl.textContent = (activeBoardId && allBoardsData[activeBoardId]) ? allBoardsData[activeBoardId].name : "Моя Умная Доска";
    }

    function renderBoardList() {
        boardListEl.innerHTML = '';
        if (Object.keys(allBoardsData).length === 0) {
            boardListEl.innerHTML = '<li style="padding: 0.75rem 1rem; color: var(--text-secondary);">Нет досок. Создайте новую!</li>';
            return;
        }
        Object.keys(allBoardsData).forEach(boardId => {
            const boardData = allBoardsData[boardId];
            const listItem = document.createElement('li');
            listItem.className = 'board-list-item';
            
            const boardNameSpan = document.createElement('span');
            boardNameSpan.textContent = boardData.name;
            boardNameSpan.style.flexGrow = "1";
            listItem.appendChild(boardNameSpan);

            listItem.dataset.boardId = boardId;
            if (boardId === activeBoardId) listItem.classList.add('active-board');
            listItem.addEventListener('click', (e) => {
                if (e.target.closest('button')) return;
                switchBoard(boardId);
            });
            
            const controlsContainer = document.createElement('div');
            controlsContainer.className = 'board-item-controls';

            const editBoardNameBtn = document.createElement('button');
            editBoardNameBtn.innerHTML = ICONS.edit;
            editBoardNameBtn.className = 'btn-icon btn-edit-board-name';
            editBoardNameBtn.title = 'Редактировать название доски';
            editBoardNameBtn.addEventListener('click', (e) => { 
                e.stopPropagation(); 
                handleEditBoardName(boardId, boardData.name); 
            });
            controlsContainer.appendChild(editBoardNameBtn);

            const deleteBoardItemBtn = document.createElement('button');
            deleteBoardItemBtn.innerHTML = '&times;';
            deleteBoardItemBtn.className = 'btn-icon btn-delete-board-item';
            deleteBoardItemBtn.title = `Удалить доску "${boardData.name}"`;
            deleteBoardItemBtn.addEventListener('click', (e) => { 
                e.stopPropagation(); 
                handleDeleteBoard(boardId, boardData.name); 
            });
            controlsContainer.appendChild(deleteBoardItemBtn);
            
            listItem.appendChild(controlsContainer);
            boardListEl.appendChild(listItem);
        });
    }

    function handleEditBoardName(boardId, currentName) {
        const newName = prompt(`Введите новое название для доски "${currentName}":`, currentName);
        if (newName && newName.trim() !== '' && newName.trim() !== currentName) {
            allBoardsData[boardId].name = newName.trim();
            saveAllBoards();
            renderBoardList();
            if (boardId === activeBoardId) updateCurrentBoardTitle();
        } else if (newName !== null && newName.trim() === '') {
            showAlert("Название доски не может быть пустым.");
        }
    }
    
    function handleDeleteBoard(boardIdToDelete, boardName) {
        showConfirmation(`Вы уверены, что хотите удалить доску "${boardName}"? Это действие необратимо.`, () => {
            delete allBoardsData[boardIdToDelete];
            if (activeBoardId === boardIdToDelete) {
                const remainingBoardIds = Object.keys(allBoardsData);
                activeBoardId = remainingBoardIds.length > 0 ? remainingBoardIds[0] : null;
                saveActiveBoardId();
            }
            saveAllBoards();
            renderBoardList(); 
            loadBoard();
        });
    }

    function saveCurrentBoardState() {
        if (!activeBoardId || !allBoardsData[activeBoardId] || currentView !== 'board') return;
        
        const tempContainer = document.createElement('div');
        tempContainer.innerHTML = boardContainer.innerHTML;
        tempContainer.querySelectorAll('[data-file-id]').forEach(el => {
            if (el.src && el.src.startsWith('blob:')) {
                el.src = "";
            }
        });

        const columns = Array.from(tempContainer.children).map(columnEl => ({
            id: columnEl.dataset.columnId || generateId('col'),
            title: columnEl.querySelector('.column-title-input').value,
            tasks: Array.from(columnEl.querySelectorAll('.tasks-list > .task')).map(taskEl => ({
                id: taskEl.dataset.taskId || generateId('task'),
                content: taskEl.querySelector('.task-content-editor').innerHTML, 
                done: taskEl.classList.contains('task-done'),
                priority: taskEl.dataset.priority || 'medium',
                createdAt: taskEl.dataset.createdAt || new Date().toISOString(),
                subtasks: Array.from(taskEl.querySelectorAll('.subtask-item')).map(subtaskEl => ({
                    id: subtaskEl.dataset.subtaskId || generateId('subtask'),
                    content: subtaskEl.querySelector('input[type="text"]').value,
                    done: subtaskEl.querySelector('input[type="checkbox"]').checked
                }))
            }))
        }));
        allBoardsData[activeBoardId].columns = columns;
        saveAllBoards();
    }

    function createNewBoard() {
        const boardName = newBoardNameInput.value.trim();
        if (!boardName) { showAlert("Пожалуйста, введите название для новой доски."); newBoardNameInput.focus(); return; }
        const newBoardId = generateId('board');
        allBoardsData[newBoardId] = { 
            name: boardName, 
            columns: [
                { id: generateId('col'), title: 'Запланировано 📝', tasks: [] },
                { id: generateId('col'), title: 'В процессе 🚀', tasks: [] },
                { id: generateId('col'), title: 'Готово 🎉', tasks: [] }
            ],
            edges: [],
            positions: {}
        };
        saveAllBoards(); 
        switchBoard(newBoardId); 
        newBoardNameInput.value = '';
        if (sidebar.classList.contains('active')) toggleSidebar();
    }
    addBoardBtn.addEventListener('click', createNewBoard);
    newBoardNameInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') createNewBoard(); });

    function switchBoard(newBoardId) {
        if (activeBoardId === newBoardId && boardContainer.children.length > 0) {
             if (sidebar.classList.contains('active')) toggleSidebar(); return;
        }
        saveCurrentBoardState(); 
        saveNodePositions();
        activeBoardId = newBoardId; 
        saveActiveBoardId(); 
        loadBoard();
        if (sidebar.classList.contains('active')) toggleSidebar();
    }

    async function loadAllMediaForBoard() {
        const mediaElements = boardContainer.querySelectorAll('[data-file-id]');
        for (const el of mediaElements) {
            const fileId = el.dataset.fileId;
            if (fileId) {
                try {
                    const fileBlob = await IndexedDBManager.getFile(fileId);
                    if (fileBlob) {
                        if (el.src && el.src.startsWith('blob:')) {
                           URL.revokeObjectURL(el.src);
                        }
                        if (el.tagName === 'A') {
                            el.href = URL.createObjectURL(fileBlob);
                        } else {
                            el.src = URL.createObjectURL(fileBlob);
                        }
                    } else {
                       el.closest('.media-container, .file-attachment')?.setAttribute('style', 'border: 2px dashed var(--accent-danger); color: var(--accent-danger);');
                       if (el.tagName === 'A') { el.style.pointerEvents = 'none'; }
                    }
                } catch (err) {
                    console.error(`Failed to load file ${fileId} from IndexedDB`, err);
                }
            }
        }
    }

    async function loadBoard() {
        boardContainer.innerHTML = ''; 
        updateCurrentBoardTitle(); 
        renderBoardList();
        if (!activeBoardId || !allBoardsData[activeBoardId]) {
            const boardIds = Object.keys(allBoardsData);
            if (boardIds.length > 0) { 
                activeBoardId = boardIds[0]; 
                saveActiveBoardId(); 
            } else {
                const defaultBoardId = generateId('board');
                allBoardsData[defaultBoardId] = { 
                    name: "Демонстрационная доска", 
                    columns: [
                        { id: generateId('col'), title: 'Основные задачи', tasks: [
                            {id: generateId('task'), content: '<b>Главный проект</b><br>Это основная задача. <div class="media-container" contenteditable="false"><img src="https://placehold.co/600x400/34495e/ecf0f1?text=Image" alt="Пример изображения"><button class="delete-media-btn">×</button></div>', done: false, priority: 'high', createdAt: new Date().toISOString(), subtasks: [] },
                             {id: generateId('task'), content: 'Разработать новый модуль', done: false, priority: 'medium', createdAt: new Date().toISOString(), subtasks: [] }
                        ]},
                        { id: generateId('col'), title: 'Связанные задачи', tasks: []},
                    ],
                    edges: [],
                    positions: {}
                };
                activeBoardId = defaultBoardId; 
                saveAllBoards(); 
                saveActiveBoardId(); 
                renderBoardList(); 
                updateCurrentBoardTitle();
            }
        }
        const currentBoardData = allBoardsData[activeBoardId];
        if (currentBoardData && currentBoardData.columns) {
            currentBoardData.columns.forEach(colData => {
                const columnEl = createColumnElement(colData.id, colData.title, colData.tasks);
                boardContainer.appendChild(columnEl);
            });
        } else if (Object.keys(allBoardsData).length === 0) {
            boardContainer.innerHTML = `<p style="text-align:center; padding: 2rem; color: var(--text-secondary);">Создайте свою первую доску через меню слева!</p>`;
        }
        await loadAllMediaForBoard();
        switchView('board');
    }
    
    addColumnBtn.addEventListener('click', () => {
        if (!activeBoardId || !allBoardsData[activeBoardId]) { showAlert("Сначала выберите или создайте доску!"); return; }
        const newCol = createColumnElement(null, 'Новая колонка', []);
        boardContainer.appendChild(newCol);
        newCol.querySelector('.column-title-input')?.focus();
        saveCurrentBoardState();
    });
    
    function createSubtaskElement(subtaskId, content = '', done = false) {
        const subtaskItem = document.createElement('li');
        subtaskItem.className = 'subtask-item';
        subtaskItem.dataset.subtaskId = subtaskId || generateId('subtask');

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox'; checkbox.checked = done;
        checkbox.addEventListener('change', saveCurrentBoardState);

        const input = document.createElement('input');
        input.type = 'text'; input.value = content; input.placeholder = 'Новая подзадача...';
        if(done) input.classList.add('done');
        checkbox.addEventListener('change', () => { input.classList.toggle('done', checkbox.checked); saveCurrentBoardState(); });
        ['input', 'blur'].forEach(evt => input.addEventListener(evt, debouncedSave));

        const deleteSubtaskBtn = document.createElement('button');
        deleteSubtaskBtn.innerHTML = '&times;'; deleteSubtaskBtn.className = 'btn-delete-subtask';
        deleteSubtaskBtn.title = 'Удалить подзадачу';
        deleteSubtaskBtn.addEventListener('click', () => { subtaskItem.remove(); saveCurrentBoardState(); });

        subtaskItem.append(checkbox, input, deleteSubtaskBtn);
        return subtaskItem;
    }

    async function handlePaste(event) {
        event.preventDefault();
        const items = (event.clipboardData || window.clipboardData).items;
        let foundImage = false;

        for (const item of items) {
            if (item.kind === 'file' && item.type.startsWith('image/')) {
                const blob = item.getAsFile();
                try {
                    const fileId = await IndexedDBManager.saveFile(blob);
                    const mediaHTML = `
                        <div class="media-container" contenteditable="false">
                            <img data-file-id="${fileId}" alt="Вставленное изображение">
                            <button class="delete-media-btn" title="Удалить">&times;</button>
                        </div>&nbsp;`;
                    document.execCommand('insertHTML', false, mediaHTML);
                    await loadAllMediaForBoard();
                    debouncedSave();
                } catch(err) {
                    console.error("Failed to save pasted image:", err);
                    showAlert("Не удалось вставить изображение.");
                }
                foundImage = true;
                break;
            }
        }
        if (!foundImage) {
            const text = event.clipboardData.getData('text/plain');
            document.execCommand('insertText', false, text);
        }
    }

    function createTaskElement(id, content = '', done = false, priority = 'medium', createdAt, subtasksData = []) {
        const task = document.createElement('div');
        task.className = 'task';
        task.dataset.taskId = id || generateId('task');
        task.dataset.priority = priority;
        task.dataset.createdAt = createdAt || new Date().toISOString();
        if (done) task.classList.add('task-done');
        task.classList.add(`priority-${priority}`);
        task.draggable = true;

        task.addEventListener('dragstart', (e) => { task.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
        task.addEventListener('dragend', () => { task.classList.remove('dragging'); saveCurrentBoardState(); });

        const taskMainContent = document.createElement('div'); taskMainContent.className = 'task-main-content';
        
        const contentEditor = document.createElement('div');
        contentEditor.contentEditable = true;
        contentEditor.className = 'task-content-editor';
        contentEditor.innerHTML = content;
        contentEditor.setAttribute('placeholder', 'Введите описание задачи...');
        contentEditor.addEventListener('input', debouncedSave);
        contentEditor.addEventListener('paste', handlePaste);

        const timestampEl = document.createElement('div'); timestampEl.className = 'task-timestamp';
        const date = new Date(task.dataset.createdAt);
        timestampEl.textContent = `Создано: ${date.toLocaleDateString('ru-RU')} ${date.toLocaleTimeString('ru-RU', {hour: '2-digit', minute:'2-digit'})}`;
        taskMainContent.append(contentEditor, timestampEl);
        task.appendChild(taskMainContent);

        const taskFooter = document.createElement('div'); taskFooter.className = 'task-footer';
        const taskControlsLeft = document.createElement('div'); taskControlsLeft.className = 'task-controls-left';
        const taskControlsRight = document.createElement('div'); taskControlsRight.className = 'task-controls-right';
        
        const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = done;
        checkbox.title = 'Отметить как выполненную';
        checkbox.addEventListener('change', () => { task.classList.toggle('task-done', checkbox.checked); saveCurrentBoardState(); });
        
        const priorityContainer = document.createElement('div'); priorityContainer.className = 'priority-selector-container';
        const priorityDot = document.createElement('div'); priorityDot.className = `priority-dot ${priority}`; 
        const prioritySelector = document.createElement('select'); prioritySelector.className = 'priority-selector';
        prioritySelector.title = 'Установить приоритет';
        const priorities = { low: 'Низкий', medium: 'Средний', high: 'Высокий' };
        for (const pValue in priorities) {
            const option = new Option(priorities[pValue], pValue);
            if (pValue === priority) option.selected = true; 
            prioritySelector.add(option);
        }
        prioritySelector.addEventListener('change', (e) => {
            task.classList.remove(`priority-${task.dataset.priority}`); 
            priorityDot.className = `priority-dot ${e.target.value}`;
            task.dataset.priority = e.target.value; 
            task.classList.add(`priority-${e.target.value}`);
            saveCurrentBoardState();
        });

        priorityContainer.append(checkbox, priorityDot, prioritySelector);
        taskControlsLeft.appendChild(priorityContainer);

        const addFileBtn = document.createElement('button');
        addFileBtn.innerHTML = ICONS.file;
        addFileBtn.className = 'btn-delete btn-add-file';
        addFileBtn.title = 'Прикрепить файл';
        addFileBtn.addEventListener('click', () => {
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.style.display = 'none';
            fileInput.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;

                try {
                    const fileId = await IndexedDBManager.saveFile(file);
                    let mediaHTML = '';
                    if (file.type.startsWith('image/')) {
                        mediaHTML = `<div class="media-container" contenteditable="false"><img data-file-id="${fileId}" alt="${file.name}"><button class="delete-media-btn">&times;</button></div>`;
                    } else if (file.type.startsWith('video/')) {
                        mediaHTML = `<div class="media-container" contenteditable="false"><video data-file-id="${fileId}" controls></video><button class="delete-media-btn">&times;</button></div>`;
                    } else if (file.type.startsWith('audio/')) {
                        mediaHTML = `<audio data-file-id="${fileId}" controls contenteditable="false"></audio>`;
                    } else {
                        mediaHTML = `<a download="${file.name}" data-file-id="${fileId}" class="file-attachment" contenteditable="false" title="${file.name}">${ICONS.file}<span>${file.name}</span></a>`;
                    }
                    contentEditor.focus();
                    document.execCommand('insertHTML', false, mediaHTML + '&nbsp;');
                    await loadAllMediaForBoard();
                    debouncedSave();
                } catch (err) {
                    console.error("Error saving file to IndexedDB", err);
                    showAlert("Не удалось сохранить файл.");
                }
            };
            document.body.appendChild(fileInput);
            fileInput.click();
            document.body.removeChild(fileInput);
        });

        const deleteBtn = document.createElement('button'); deleteBtn.innerHTML = ICONS.delete; 
        deleteBtn.className = 'btn-delete btn-delete-task'; deleteBtn.title = 'Удалить задачу';
        deleteBtn.addEventListener('click', () => {
            showConfirmation('Вы уверены, что хотите удалить эту задачу?', () => {
                task.remove();
                saveCurrentBoardState();
            });
        });
        
        taskControlsRight.append(addFileBtn, deleteBtn);
        taskFooter.append(taskControlsLeft, taskControlsRight);
        task.appendChild(taskFooter);

        const subtasksSection = document.createElement('div'); subtasksSection.className = 'subtasks-section';
        const subtasksHeader = document.createElement('div'); subtasksHeader.className = 'subtasks-header';
        subtasksHeader.innerHTML = `<h4>Подзадачи</h4>${ICONS.subtaskToggle}`;
        const subtasksList = document.createElement('ul'); subtasksList.className = 'subtasks-list collapsed';
        subtasksHeader.addEventListener('click', () => subtasksList.classList.toggle('collapsed'));
        (subtasksData || []).forEach(subtask => subtasksList.appendChild(createSubtaskElement(subtask.id, subtask.content, subtask.done)));

        const subtasksControls = document.createElement('div');
        subtasksControls.className = 'subtasks-controls';
        
        const addSubtaskBtn = document.createElement('button'); addSubtaskBtn.className = 'btn-add-subtask';
        addSubtaskBtn.innerHTML = `${ICONS.add} Добавить`;
        addSubtaskBtn.addEventListener('click', () => {
            const newSubtaskEl = createSubtaskElement(null, '', false);
            subtasksList.appendChild(newSubtaskEl);
            subtasksList.classList.remove('collapsed');
            newSubtaskEl.querySelector('input[type="text"]')?.focus();
            saveCurrentBoardState();
        });

        const generateSubtasksBtn = document.createElement('button');
        generateSubtasksBtn.className = 'btn-generate-subtasks';
        generateSubtasksBtn.innerHTML = '✨ Сгенерировать';
        generateSubtasksBtn.title = 'Разбить задачу на подзадачи с помощью ИИ';
        generateSubtasksBtn.addEventListener('click', () => {
            const currentContent = task.querySelector('.task-content-editor').textContent;
            generateSubtasksForTask(task.dataset.taskId, currentContent, generateSubtasksBtn);
        });

        subtasksControls.append(addSubtaskBtn, generateSubtasksBtn);
        subtasksSection.append(subtasksHeader, subtasksList, subtasksControls);
        task.appendChild(subtasksSection);
        return task;
    }

    function createColumnElement(id, title = 'Новая колонка', tasksData = []) {
        const column = document.createElement('div'); column.className = 'column';
        column.dataset.columnId = id || generateId('col');
        const columnHeader = document.createElement('div'); columnHeader.className = 'column-header';
        const titleInput = document.createElement('input'); titleInput.type = 'text'; titleInput.value = title;
        titleInput.className = 'column-title-input'; titleInput.title = 'Изменить название колонки';
        ['input', 'blur'].forEach(evt => titleInput.addEventListener(evt, debouncedSave));

        const deleteColumnBtn = document.createElement('button'); deleteColumnBtn.innerHTML = ICONS.delete; 
        deleteColumnBtn.className = 'btn-delete btn-delete-column'; deleteColumnBtn.title = 'Удалить колонку';
        deleteColumnBtn.addEventListener('click', () => {
            const tasksCount = column.querySelectorAll('.task').length;
            const confirmationMessage = tasksCount > 0 ? `Колонка "${titleInput.value}" содержит задачи. Вы уверены, что хотите её удалить?` : `Удалить колонку "${titleInput.value}"?`;
            showConfirmation(confirmationMessage, () => {
                column.remove();
                saveCurrentBoardState();
            });
        });
        columnHeader.append(titleInput, deleteColumnBtn);

        const tasksListEl = document.createElement('div'); tasksListEl.className = 'tasks-list';
        tasksListEl.addEventListener('dragover', e => {
            e.preventDefault(); 
            const draggingTask = document.querySelector('.task.dragging');
            if (!draggingTask) return;
            const afterElement = getDragAfterElement(tasksListEl, e.clientY);
            tasksListEl.insertBefore(draggingTask, afterElement);
        });
        
        (tasksData || []).forEach(taskData => {
            tasksListEl.appendChild(createTaskElement(taskData.id, taskData.content, taskData.done, taskData.priority, taskData.createdAt, taskData.subtasks));
        });

        const addTaskBtn = document.createElement('button'); addTaskBtn.innerHTML = `${ICONS.add} Добавить задачу`; 
        addTaskBtn.className = 'btn btn-add-task-in-column';
        addTaskBtn.addEventListener('click', () => {
            const newTask = createTaskElement(null, '', false, 'medium', new Date().toISOString(), []); 
            tasksListEl.appendChild(newTask); 
            newTask.querySelector('.task-content-editor')?.focus();
            saveCurrentBoardState();
        });
        column.append(columnHeader, tasksListEl, addTaskBtn);
        return column;
    }

    function getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.task:not(.dragging)')];
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect(); 
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) return { offset, element: child };
            return closest;
        }, { offset: Number.NEGATIVE_INFINITY }).element || null;
    }

    const GeminiAPI = {
        apiKey: "AIzaSyDtWkebFgMYl44lWw77cncDQWAvBWGOk-Q",
        apiUrl: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent",

        async _callApi(payload) {
            const response = await fetch(`${this.apiUrl}?key=${this.apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorBody = await response.json();
                console.error("API Error:", errorBody);
                throw new Error(`API request failed: ${errorBody.error?.message || response.statusText}`);
            }
            return response.json();
        },

        async generateSubtasks(taskContent) {
            const prompt = `Break down the following task into a short list of actionable subtasks. Task: "${taskContent}". Provide the subtasks as a JSON array of simple strings. For example: ["Subtask 1", "Subtask 2", "Subtask 3"]`;
            const payload = {
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: { type: "ARRAY", items: { type: "STRING" } }
                }
            };
            const result = await this._callApi(payload);
            const part = result.candidates?.[0]?.content?.parts?.[0];
            if (part) return JSON.parse(part.text);
            throw new Error("Не удалось получить подзадачи от ИИ. Ответ имел неожиданную структуру.");
        }
    };

    async function generateSubtasksForTask(taskId, taskContent, buttonEl) {
        if (!taskContent || taskContent.trim().length < 5) {
            showAlert("Пожалуйста, введите более подробное описание задачи для генерации подзадач.");
            return;
        }

        const originalButtonContent = buttonEl.innerHTML;
        buttonEl.innerHTML = '<div class="spinner"></div>';
        buttonEl.classList.add('loading');
        buttonEl.disabled = true;

        try {
            const subtasks = await GeminiAPI.generateSubtasks(taskContent);
            const taskEl = document.querySelector(`[data-task-id="${taskId}"]`);
            if (taskEl) {
                const subtasksList = taskEl.querySelector('.subtasks-list');
                subtasks.forEach(text => subtasksList.appendChild(createSubtaskElement(null, text, false)));
                subtasksList.classList.remove('collapsed');
                saveCurrentBoardState();
            }
        } catch (error) {
            console.error("Error generating subtasks:", error);
            showAlert(`Произошла ошибка при генерации подзадач: ${error.message}`);
        } finally {
            buttonEl.innerHTML = originalButtonContent;
            buttonEl.classList.remove('loading');
            buttonEl.disabled = false;
        }
    }

    function saveNodePositions() {
        if (currentView !== 'graph' || !activeBoardId || !allBoardsData[activeBoardId] || !network) {
            return;
        }
        const currentBoard = allBoardsData[activeBoardId];
        currentBoard.positions = network.getPositions();
        saveAllBoards();
    }
    
    const NODE_PADDING_X = 25; 
    const NODE_PADDING_Y = 20; 
    const FONT_STYLE = "18px 'Segoe UI', 'Roboto', Arial, sans-serif";
    const LINE_HEIGHT = 1.4;
    const MAX_IMG_HEIGHT = 100;
    const MIN_NODE_WIDTH = 200;
    const MAX_NODE_WIDTH = 450;
    const tempCanvasCtx = document.createElement('canvas').getContext('2d');
    
    function switchView(view) {
        saveNodePositions();
        currentView = view;
        if (view === 'board') {
            boardContainer.style.display = 'flex';
            graphViewContainer.style.display = 'none';
            showBoardViewBtn.classList.add('active');
            showGraphViewBtn.classList.remove('active');
            addColumnBtn.style.display = 'inline-flex';
        } else {
            saveCurrentBoardState();
            boardContainer.style.display = 'none';
            graphViewContainer.style.display = 'block';
            showBoardViewBtn.classList.remove('active');
            showGraphViewBtn.classList.add('active');
            addColumnBtn.style.display = 'none';
            renderGraphView();
        }
    }

    const tempDivForNormalization = document.createElement('div');
    function getTaskTextContent(htmlContent) {
         tempDivForNormalization.innerHTML = htmlContent;
         tempDivForNormalization.querySelectorAll('.media-container, .file-attachment, audio').forEach(el => el.remove());
         return tempDivForNormalization.textContent.trim() || "";
    }
    
    function formatLabelForGraph(text, maxWidth) {
        tempCanvasCtx.font = FONT_STYLE;
        const words = text.split(' ');
        let currentLine = '';
        const lines = [];
        for (const word of words) {
            const testLine = currentLine ? currentLine + ' ' + word : word;
            const metrics = tempCanvasCtx.measureText(testLine);
            if (metrics.width > maxWidth && currentLine.length > 0) {
                lines.push(currentLine);
                currentLine = word;
            } else {
                currentLine = testLine;
            }
        }
        lines.push(currentLine);
        return lines;
    }

    function calculateNodeSize(lines, image) {
        tempCanvasCtx.font = FONT_STYLE;
        
        let maxTextWidth = 0;
        lines.forEach(line => {
            maxTextWidth = Math.max(maxTextWidth, tempCanvasCtx.measureText(line).width);
        });
        const textBlockWidth = maxTextWidth + 2 * NODE_PADDING_X;

        let imageBlockWidth = 0;
        if (image && image.complete && image.naturalWidth > 0) {
            const availableWidthForImage = MAX_NODE_WIDTH - 2 * NODE_PADDING_X;
            const scale = Math.min(availableWidthForImage / image.naturalWidth, MAX_IMG_HEIGHT / image.naturalHeight);
            const scaledImageWidth = image.naturalWidth * scale;
            imageBlockWidth = scaledImageWidth + 2 * NODE_PADDING_X;
        }
        
        const finalWidth = Math.min(MAX_NODE_WIDTH, Math.max(MIN_NODE_WIDTH, textBlockWidth, imageBlockWidth));

        let imagePartHeight = 0;
        if (image && image.complete && image.naturalWidth > 0) {
            const imagePadding = 10;
            const availableWidth = finalWidth - 2 * NODE_PADDING_X;
            const scale = Math.min(availableWidth / image.naturalWidth, MAX_IMG_HEIGHT / image.naturalHeight);
            imagePartHeight = image.naturalHeight * scale + imagePadding;
        }
        const textHeight = lines.length * parseInt(FONT_STYLE) * LINE_HEIGHT;
        const finalHeight = textHeight + imagePartHeight + 2 * NODE_PADDING_Y;

        return { width: finalWidth, height: finalHeight };
    }
    
    function drawRoundRect(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.arcTo(x + width, y, x + width, y + radius, radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
        ctx.lineTo(x + radius, y + height);
        ctx.arcTo(x, y + height, x, y + height - radius, radius);
        ctx.lineTo(x, y + radius);
        ctx.arcTo(x, y, x + radius, y, radius);
        ctx.closePath();
    }
    
    function generateNodeImage(nodeData, image) {
        const { lines, color } = nodeData;
        const { width, height } = calculateNodeSize(lines, image);

        const canvas = document.createElement('canvas');
        const scale = 3;
        canvas.width = width * scale;
        canvas.height = height * scale;
        const ctx = canvas.getContext('2d');
        ctx.scale(scale, scale);

        const borderRadius = 12;

        ctx.shadowColor = 'rgba(0,0,0,0.4)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetX = 3;
        ctx.shadowOffsetY = 3;
        
        drawRoundRect(ctx, 0, 0, width, height, borderRadius);
        ctx.fillStyle = 'rgba(0,0,0,0)';
        ctx.fill();

        ctx.shadowColor = 'transparent';
        
        const gradient = ctx.createLinearGradient(0, 0, width, height);
        const bgColor = color.background || '#3498db';
        gradient.addColorStop(0, bgColor);
        
        const r = parseInt(bgColor.slice(1, 3), 16), g = parseInt(bgColor.slice(3, 5), 16), b = parseInt(bgColor.slice(5, 7), 16);
        const darkerColor = `rgb(${Math.max(0, r-30)}, ${Math.max(0, g-30)}, ${Math.max(0, b-30)})`;
        gradient.addColorStop(1, darkerColor);
        
        ctx.fillStyle = gradient;
        drawRoundRect(ctx, 0, 0, width, height, borderRadius);
        ctx.fill();

        let imagePartHeight = 0;
        if (image && image.complete && image.naturalWidth > 0) {
            const imgPadding = 10;
            const availableWidth = width - 2 * NODE_PADDING_X;
            const scaleFactor = Math.min(availableWidth / image.naturalWidth, MAX_IMG_HEIGHT / image.naturalHeight);
            imagePartHeight = image.naturalHeight * scaleFactor + imgPadding;
        }

        const textLines = lines || [];
        const lineHeight = parseInt(FONT_STYLE) * LINE_HEIGHT;
        const totalTextHeight = textLines.length * lineHeight;
        const totalContentHeight = imagePartHeight + totalTextHeight;

        let currentY = (height - totalContentHeight) / 2;

        if (imagePartHeight > 0) {
            const imgHeight = imagePartHeight - 10;
            const imgWidth = image.naturalWidth * (imgHeight / image.naturalHeight);
            const imgX = (width - imgWidth) / 2;
            const imgY = currentY;

            ctx.save();
            drawRoundRect(ctx, imgX, imgY, imgWidth, imgHeight, 8);
            ctx.clip();
            ctx.drawImage(image, imgX, imgY, imgWidth, imgHeight);
            ctx.restore();
            
            currentY += imagePartHeight;
        }
        
        ctx.font = FONT_STYLE;
        ctx.fillStyle = '#ecf0f1';
        ctx.textAlign = 'left'; 
        ctx.textBaseline = 'middle';
        
        currentY += totalTextHeight / 2;
        if (imagePartHeight > 0) currentY -= lineHeight / 4;

        const textStartX = NODE_PADDING_X;
        const availableTextWidth = width - (NODE_PADDING_X * 2);

        textLines.forEach((line, index) => {
            const lineY = currentY - (totalTextHeight/2) + (index * lineHeight) + (lineHeight/2);
            const words = line.split(' ');
            if (words.length > 1 && index < textLines.length - 1) {
                ctx.textAlign = 'justify';
                ctx.fillText(line, textStartX, lineY, availableTextWidth);
            } else {
                ctx.textAlign = 'left';
                ctx.fillText(line, textStartX, lineY);
            }
        });

        return canvas.toDataURL();
    }

    function createVideoThumbnail(videoBlob) {
        return new Promise((resolve, reject) => {
            const video = document.createElement('video');
            video.preload = 'metadata';
            const url = URL.createObjectURL(videoBlob);
            video.src = url;
            video.muted = true;
            video.playsInline = true;

            video.onloadeddata = () => {
                video.currentTime = 0;
            };

            video.onseeked = () => {
                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const img = new Image();
                img.src = canvas.toDataURL();
                img.onload = () => {
                    URL.revokeObjectURL(url);
                    resolve(img);
                };
                img.onerror = () => {
                    URL.revokeObjectURL(url);
                    reject(new Error("Could not create image from canvas."));
                };
            };

            video.onerror = (e) => {
                URL.revokeObjectURL(url);
                reject(new Error("Video loading error."));
            };
            
            video.play().catch(e => { /* Autoplay can be blocked, but seeking should still work */ });
        });
    }

    async function renderGraphView() {
        if (typeof vis === 'undefined') {
            graphViewContainer.innerHTML = '<p style="color:var(--accent-danger);">Ошибка: Библиотека визуализации не загрузилась.</p>';
            return;
        }

        graphViewContainer.innerHTML = '<div class="spinner-overlay"><div class="spinner"></div></div>'; 
        const currentBoard = allBoardsData[activeBoardId];
        const columnColors = ['#3498db', '#f39c12', '#2ecc71', '#9b59b6', '#e74c3c', '#1abc9c'];
        
        const rawTasks = [];
        (currentBoard.columns || []).forEach((column, index) => {
            const color = columnColors[index % columnColors.length];
            (column.tasks || []).forEach(task => {
                rawTasks.push({ task, color });
            });
        });
        
        if (!currentBoard || !currentBoard.columns || rawTasks.length === 0) {
            graphViewContainer.innerHTML = '<p style="padding: 2rem; color: var(--text-secondary);">Нет задач для построения графа.</p>';
            return;
        }
        
        const nodesData = [];
        const mediaLoadPromises = [];
        mediaCache = {};
        const savedPositions = currentBoard.positions || {};

        for (const { task, color } of rawTasks) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = task.content;
            
            const mediaEl = tempDiv.querySelector('img[data-file-id], video[data-file-id], audio[data-file-id]');
            let mediaPromise = Promise.resolve(null);

            if (mediaEl) {
                const fileId = mediaEl.dataset.fileId;
                const tagName = mediaEl.tagName;

                mediaPromise = new Promise(async (resolve) => {
                    try {
                        const fileBlob = await IndexedDBManager.getFile(fileId);
                        if (!fileBlob) return resolve(null);

                        if (tagName === 'IMG') {
                            const img = new Image();
                            img.crossOrigin = "Anonymous";
                            const url = URL.createObjectURL(fileBlob);
                            img.src = url;
                            img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
                            img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
                        } else if (tagName === 'VIDEO') {
                            const thumbnail = await createVideoThumbnail(fileBlob);
                            resolve(thumbnail);
                        } else if (tagName === 'AUDIO') {
                            resolve(preloadedAudioIcon);
                        }
                    } catch (e) {
                        console.error(`Failed to process media for task ${task.id}`, e);
                        resolve(null);
                    }
                });
            }
            
            mediaLoadPromises.push(mediaPromise.then(img => { mediaCache[task.id] = img; }));

            const textContent = getTaskTextContent(task.content) || "Без названия";
            const lines = formatLabelForGraph(textContent, MAX_NODE_WIDTH - 2 * NODE_PADDING_X);
            
            const nodeSetup = {
                id: task.id,
                title: textContent, 
                color: { background: color },
                lines: lines 
            };

            if (savedPositions[task.id]) {
                nodeSetup.x = savedPositions[task.id].x;
                nodeSetup.y = savedPositions[task.id].y;
            }
            
            nodesData.push(nodeSetup);
        }
        
        await Promise.all(mediaLoadPromises);
        
        const spinner = graphViewContainer.querySelector('.spinner-overlay');
        if (spinner) spinner.remove();

        nodesData.forEach(node => {
            const image = mediaCache[node.id];
            const { width, height } = calculateNodeSize(node.lines, image);
            
            node.shape = 'image';
            node.image = generateNodeImage(node, image);
            node.label = '';
            
            node.width = width;
            node.height = height;
        });

        const nodes = new vis.DataSet(nodesData);
        const edges = new vis.DataSet(currentBoard.edges || []);
        const data = { nodes, edges };

        const hasSavedPositions = nodesData.some(node => node.x !== undefined && node.y !== undefined);

        const options = {
            nodes: {
                shapeProperties: { useImageSize: true }
            },
            edges: {
                color: { color: 'rgba(236, 240, 241, 0.7)', highlight: 'var(--accent-secondary)', hover: 'var(--accent-primary)' },
                width: 3,
                arrows: 'to',
                smooth: { type: 'cubicBezier', forceDirection: 'horizontal', roundness: 0.6 }
            },
            physics: {
                enabled: !hasSavedPositions, 
                solver: 'forceAtlas2Based',
                forceAtlas2Based: { gravitationalConstant: -150, centralGravity: 0.005, springLength: 400, springConstant: 0.1, damping: 0.8 },
                minVelocity: 0.75,
                stabilization: { iterations: 200 } 
            },
            interaction: { dragNodes: true, dragView: true, zoomView: true, tooltipDelay: 200, hover: true },
            manipulation: { enabled: false },
        };

        if (network) network.destroy();
        network = new vis.Network(graphViewContainer, data, options);
        
        function findTaskById(taskId) {
            for (const column of allBoardsData[activeBoardId].columns) {
                const task = column.tasks.find(t => t.id === taskId);
                if (task) return task;
            }
            return null;
        }

        network.on('click', async (properties) => {
            const { nodes } = properties;
            if (nodes.length > 0) {
                const nodeId = nodes[0];
                const task = findTaskById(nodeId);
                if (!task || !task.content) return;

                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = task.content;

                const mediaEl = tempDiv.querySelector('img[data-file-id], video[data-file-id], audio[data-file-id]');
                if (mediaEl) {
                    properties.event.preventDefault();
                    const fileId = mediaEl.dataset.fileId;
                    try {
                        const fileBlob = await IndexedDBManager.getFile(fileId);
                        if (fileBlob) {
                            const url = URL.createObjectURL(fileBlob);
                            mediaModal.classList.add('active');
                            const tagName = mediaEl.tagName;
                            if (tagName === 'IMG') {
                                mediaModalContent.innerHTML = `<img src="${url}" alt="Enlarged view">`;
                            } else if (tagName === 'VIDEO') {
                                mediaModalContent.innerHTML = `<video src="${url}" controls autoplay></video>`;
                            } else if (tagName === 'AUDIO') {
                                mediaModalContent.innerHTML = `<audio src="${url}" controls autoplay></audio>`;
                            }
                        }
                    } catch (err) {
                        console.error("Failed to load media for modal", err);
                        showAlert("Не удалось загрузить медиафайл.");
                    }
                }
            }
        });

        network.on("dragEnd", saveNodePositions);
        
        network.on("stabilizationIterationsDone", function () {
            network.setOptions( { physics: false } );
            saveNodePositions();
        });
        
        let hoveredAnchor = null;
        let isDrawingEdge = false;
        let sourceNodeId = null;
        const canvas = graphViewContainer.querySelector('canvas');
        
        network.on("beforeDrawing", function (ctx) {
            if (isDrawingEdge && sourceNodeId) {
                const BBox = network.getBoundingBox(sourceNodeId);
                if (!BBox) return;

                const fromX = BBox.right;
                const fromY = (BBox.top + BBox.bottom) / 2;

                const pointerPos = network.DOMtoCanvas({x: lastPointerPos.x, y: lastPointerPos.y});

                ctx.beginPath();
                ctx.moveTo(fromX, fromY);
                
                const c1x = fromX + (pointerPos.x - fromX) * 0.5;
                const c1y = fromY;
                const c2x = fromX + (pointerPos.x - fromX) * 0.5;
                const c2y = pointerPos.y;

                ctx.bezierCurveTo(c1x, c1y, c2x, c2y, pointerPos.x, pointerPos.y);

                ctx.strokeStyle = 'var(--accent-secondary)';
                ctx.lineWidth = 3;
                ctx.setLineDash([5, 5]);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        });
        
        network.on("afterDrawing", function (ctx) {
            const nodeIds = nodes.getIds();
            
            nodeIds.forEach(nodeId => {
                const node = nodes.get(nodeId);
                if(!node || !node.width) return;

                const BBox = network.getBoundingBox(nodeId);
                if (!BBox) return;

                const centerY = (BBox.top + BBox.bottom) / 2;
                const leftX = BBox.left;
                const rightX = BBox.right;
                
                const dynamicRadius = Math.max(12, Math.min(20, (BBox.bottom - BBox.top) * 0.12));

                const isHoveredInput = hoveredAnchor && hoveredAnchor.nodeId === nodeId && hoveredAnchor.anchor === 'input';
                ctx.beginPath();
                ctx.fillStyle = isHoveredInput ? '#5dade2' : '#3498db';
                ctx.arc(leftX, centerY, dynamicRadius, 0, 2 * Math.PI);
                ctx.fill();
                if(isHoveredInput) {
                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                }

                const isHoveredOutput = hoveredAnchor && hoveredAnchor.nodeId === nodeId && hoveredAnchor.anchor === 'output';
                ctx.beginPath();
                ctx.fillStyle = isHoveredOutput ? '#58d68d' : '#2ecc71';
                ctx.arc(rightX, centerY, dynamicRadius, 0, 2 * Math.PI);
                ctx.fill();
                if(isHoveredOutput) {
                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                }
            });
        });
        
        function getAnchorAndNodeFromPosition(domPos) {
            const canvasPos = network.DOMtoCanvas(domPos);
            const nodeIds = nodes.getIds();
            for (const nodeId of nodeIds) {
                const node = nodes.get(nodeId);
                if(!node) continue;
                
                const BBox = network.getBoundingBox(nodeId);
                if (!BBox) continue;

                const centerY = (BBox.top + BBox.bottom) / 2;
                const leftX = BBox.left;
                const rightX = BBox.right;

                const dynamicRadius = Math.max(12, Math.min(20, (BBox.bottom - BBox.top) * 0.12));

                if (Math.hypot(canvasPos.x - leftX, canvasPos.y - centerY) < dynamicRadius * 1.5) {
                    return { nodeId, anchor: 'input' };
                }

                if (Math.hypot(canvasPos.x - rightX, canvasPos.y - centerY) < dynamicRadius * 1.5) {
                    return { nodeId, anchor: 'output' };
                }
            }
            return { nodeId: null, anchor: null };
        }

        let lastPointerPos = {x:0, y:0};

        const handlePointerMove = (e) => {
            const pos = e.touches ? e.touches[0] : e;
            const rect = canvas.getBoundingClientRect();
            const domPos = { x: pos.clientX - rect.left, y: pos.clientY - rect.top };
            lastPointerPos = domPos;
            
            const { nodeId, anchor } = getAnchorAndNodeFromPosition(domPos);
            const newHoveredAnchor = nodeId ? { nodeId, anchor } : null;

            if (JSON.stringify(hoveredAnchor) !== JSON.stringify(newHoveredAnchor)) {
                hoveredAnchor = newHoveredAnchor;
                network.redraw();
            }

            if (isDrawingEdge) {
                e.preventDefault();
                network.redraw();
            }
        };

        const handlePointerDown = (e) => {
            if (e.button && e.button !== 0) return;
            const pos = e.touches ? e.touches[0] : e;
            const rect = canvas.getBoundingClientRect();
            const domPos = { x: pos.clientX - rect.left, y: pos.clientY - rect.top };

            const { nodeId, anchor } = getAnchorAndNodeFromPosition(domPos);

            if (nodeId && anchor) {
                e.preventDefault();
                if (anchor === 'output') {
                    isDrawingEdge = true;
                    sourceNodeId = nodeId;
                    network.setOptions({ interaction: { dragNodes: false, dragView: false } }); 
                }
            }
        };

        const handlePointerUp = (e) => {
            if (isDrawingEdge) {
                const pos = e.changedTouches ? e.changedTouches[0] : e;
                const rect = canvas.getBoundingClientRect();
                const domPos = { x: pos.clientX - rect.left, y: pos.clientY - rect.top };

                const { nodeId: targetNodeId, anchor } = getAnchorAndNodeFromPosition(domPos);

                if (targetNodeId && targetNodeId !== sourceNodeId && anchor === 'input') {
                    const newEdge = { from: sourceNodeId, to: targetNodeId, id: generateId('edge') };
                    try {
                        edges.add(newEdge);
                        if (!currentBoard.edges) currentBoard.edges = [];
                        currentBoard.edges = edges.get();
                        saveAllBoards();
                    } catch (err) { console.error("Could not add edge:", err); }
                }
                isDrawingEdge = false;
                sourceNodeId = null;
                hoveredAnchor = null;
                network.redraw();
                network.setOptions({ interaction: { dragNodes: true, dragView: true } }); 
            }
        };
        
        canvas.removeEventListener('mousemove', handlePointerMove);
        canvas.removeEventListener('mousedown', handlePointerDown);
        window.removeEventListener('mouseup', handlePointerUp);
        canvas.removeEventListener('touchmove', handlePointerMove);
        canvas.removeEventListener('touchstart', handlePointerDown);
        window.removeEventListener('touchend', handlePointerUp);

        canvas.addEventListener('mousemove', handlePointerMove);
        canvas.addEventListener('mousedown', handlePointerDown);
        window.addEventListener('mouseup', handlePointerUp);
        
        canvas.addEventListener('touchmove', handlePointerMove, { passive: false });
        canvas.addEventListener('touchstart', handlePointerDown, { passive: false });
        window.addEventListener('touchend', handlePointerUp);

        const handleDeletion = (e) => {
            if(currentView !== 'graph') return;
            if (e.key === 'Delete' || e.key === 'Backspace') {
                const selection = network.getSelection();
                if (selection.edges.length > 0) {
                    edges.remove(selection.edges);
                    currentBoard.edges = edges.get();
                    saveAllBoards();
                }
            }
        };
        window.removeEventListener('keydown', handleDeletion); 
        window.addEventListener('keydown', handleDeletion);
    }

    async function initializeApp() {
        preloadedAudioIcon = new Image();
        const svg_str = ICONS.audio.replace('<path ', '<path fill="white" ');
        preloadedAudioIcon.src = "data:image/svg+xml;base64," + window.btoa(svg_str);

        await IndexedDBManager.init();
        loadAllBoards(); 
        loadActiveBoardId(); 
        await loadBoard();
        
        showBoardViewBtn.addEventListener('click', () => switchView('board'));
        showGraphViewBtn.addEventListener('click', () => switchView('graph'));

        window.addEventListener('beforeunload', () => {
            document.querySelectorAll('[data-file-id]').forEach(el => {
                if (el.src && el.src.startsWith('blob:')) {
                    URL.revokeObjectURL(el.src);
                }
            });
             saveCurrentBoardState();
             saveNodePositions();
        });
    }
     
    initializeApp();
})();

