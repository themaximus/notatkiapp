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
    
    const imageModal = document.getElementById('imageModal');
    const modalImage = document.getElementById('modalImage');
    const closeModalBtn = document.getElementById('closeModalBtn');

    const graphViewContainer = document.getElementById('graphViewContainer');
    const showBoardViewBtn = document.getElementById('showBoardViewBtn');
    const showGraphViewBtn = document.getElementById('showGraphViewBtn');
    const addColumnBtn = document.getElementById('addColumnBtn');

    const customModalOverlay = document.getElementById('customModalOverlay');
    const customModalContent = document.getElementById('customModalContent');
    const customModalButtons = document.getElementById('customModalButtons');

    const LS_ALL_BOARDS_KEY = 'smartKanbanAllBoards_v6.4'; 
    const LS_ACTIVE_BOARD_ID_KEY = 'smartKanbanActiveBoardId_v6.4'; 

    let allBoardsData = {};
    let activeBoardId = null;
    let currentView = 'board';
    let saveTimeout;
    let network = null;
    let imageCache = {};
    
    const ICONS = {
        delete: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`,
        add: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>`,
        subtaskToggle: `<svg class="subtasks-toggle-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"/></svg>`,
        edit: `✏️`
    };

    // --- CUSTOM MODAL LOGIC ---
    function showModal(content, buttons) {
        customModalContent.innerHTML = content;
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
    // --- END CUSTOM MODAL LOGIC ---
    
    // --- DEBOUNCED SAVING ---
    function debouncedSave() {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            saveCurrentBoardState();
        }, 1500); // Save 1.5 seconds after the last input
    }

    function toggleSidebar() { sidebar.classList.toggle('active'); overlay.classList.toggle('active'); }
    [appTitleButton, closeSidebarBtn, overlay].forEach(el => el.addEventListener('click', toggleSidebar));
    
    boardContainer.addEventListener('click', (e) => {
        if (e.target.tagName === 'IMG' && e.target.closest('.image-container')) {
            imageModal.classList.add('active');
            modalImage.src = e.target.src;
        }
        if (e.target.classList.contains('delete-image-btn')) {
            e.preventDefault();
            e.stopPropagation();
            e.target.closest('.image-container')?.remove();
            saveCurrentBoardState();
        }
    });

    function closeModal() { imageModal.classList.remove('active'); modalImage.src = ""; }
    closeModalBtn.addEventListener('click', closeModal);
    imageModal.addEventListener('click', (e) => { if (e.target.id === 'imageModal') closeModal(); });

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
        const columns = Array.from(boardContainer.children).map(columnEl => ({
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
            edges: []
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
        activeBoardId = newBoardId; 
        saveActiveBoardId(); 
        loadBoard();
        if (sidebar.classList.contains('active')) toggleSidebar();
    }

    function loadBoard() {
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
                            {id: generateId('task'), content: '<b>Главный проект</b><br>Это основная задача. <div class="image-container" contenteditable="false"><img src="https://via.placeholder.com/150" alt="Пример изображения"><button class="delete-image-btn">×</button></div>', done: false, priority: 'high', createdAt: new Date().toISOString(), subtasks: [] },
                             {id: generateId('task'), content: 'Разработать новый модуль', done: false, priority: 'medium', createdAt: new Date().toISOString(), subtasks: [] }
                        ]},
                        { id: generateId('col'), title: 'Связанные задачи', tasks: []},
                    ],
                    edges: []
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

    function handlePaste(event) {
        event.preventDefault();
        const items = (event.clipboardData || window.clipboardData).items;
        let foundImage = false;

        for (const item of items) {
            if (item.kind === 'file' && item.type.startsWith('image/')) {
                const blob = item.getAsFile();
                const reader = new FileReader();
                reader.onload = (e) => {
                    const imageHTML = `
                        <div class="image-container" contenteditable="false">
                            <img src="${e.target.result}" alt="Вставленное изображение">
                            <button class="delete-image-btn" title="Удалить изображение">&times;</button>
                        </div>&nbsp;`;
                    document.execCommand('insertHTML', false, imageHTML);
                    debouncedSave();
                };
                reader.readAsDataURL(blob);
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

        contentEditor.querySelectorAll('img:not([alt])').forEach(img => { // Process only new images
            const container = document.createElement('div');
            container.className = 'image-container';
            container.contentEditable = false;
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-image-btn';
            deleteBtn.innerHTML = '&times;';
            deleteBtn.title = 'Удалить изображение';
            img.parentNode.insertBefore(container, img);
            container.append(img, deleteBtn);
        });

        const timestampEl = document.createElement('div'); timestampEl.className = 'task-timestamp';
        const date = new Date(task.dataset.createdAt);
        timestampEl.textContent = `Создано: ${date.toLocaleDateString('ru-RU')} ${date.toLocaleTimeString('ru-RU', {hour: '2-digit', minute:'2-digit'})}`;
        taskMainContent.append(contentEditor, timestampEl);
        task.appendChild(taskMainContent);

        const taskFooter = document.createElement('div'); taskFooter.className = 'task-footer';
        const taskControls = document.createElement('div'); taskControls.className = 'task-controls';
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
        taskControls.appendChild(priorityContainer);

        const deleteBtn = document.createElement('button'); deleteBtn.innerHTML = ICONS.delete; 
        deleteBtn.className = 'btn-delete btn-delete-task'; deleteBtn.title = 'Удалить задачу';
        deleteBtn.addEventListener('click', () => {
            showConfirmation('Вы уверены, что хотите удалить эту задачу?', () => {
                task.remove();
                saveCurrentBoardState();
            });
        });
        
        taskFooter.append(taskControls, deleteBtn);
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

    // --- GEMINI API INTEGRATION ---
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
    
    // --- [REVISED] GRAPH VIEW LOGIC ---

    const ANCHOR_RADIUS = 8;
    const NODE_PADDING_X = 15; 
    const NODE_PADDING_Y = 15; 
    const FONT_STYLE = '16px Segoe UI';
    const LINE_HEIGHT = 1.2;
    const MAX_IMG_HEIGHT = 80;
    const MIN_NODE_WIDTH = 150; 
    const tempCanvasCtx = document.createElement('canvas').getContext('2d');
    
    function switchView(view) {
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
         tempDivForNormalization.querySelectorAll('.image-container').forEach(el => el.remove());
         return tempDivForNormalization.textContent || "";
    }
    
    function formatLabelForGraph(htmlContent, maxLen = 25) {
        const str = getTaskTextContent(htmlContent).split('\n')[0].trim();
        if (!str) return 'Untitled Task';
        const words = str.split(' ');
        let currentLine = '';
        const lines = [];
        for (const word of words) {
            if ((currentLine + ' ' + word).length > maxLen && currentLine.length > 0) {
                lines.push(currentLine);
                currentLine = word;
            } else {
                currentLine = currentLine ? currentLine + ' ' + word : word;
            }
        }
        lines.push(currentLine);
        return lines.join('\n');
    }

    function calculateNodeSize(label, image) {
        tempCanvasCtx.font = FONT_STYLE;
        const lines = label.split('\n');
        const textMetrics = lines.map(line => tempCanvasCtx.measureText(line));
        const textWidth = Math.max(MIN_NODE_WIDTH, ...textMetrics.map(m => m.width));
        const textHeight = lines.length * parseInt(FONT_STYLE) * LINE_HEIGHT;

        let imagePartHeight = 0;
        if (image && image.complete && image.naturalWidth > 0) {
            const imagePadding = 8;
            const scale = Math.min((textWidth + NODE_PADDING_X * 2) / image.naturalWidth, MAX_IMG_HEIGHT / image.naturalHeight);
            imagePartHeight = image.naturalHeight * scale + imagePadding;
        }

        return {
            width: textWidth + 2 * NODE_PADDING_X,
            height: textHeight + imagePartHeight + 2 * NODE_PADDING_Y
        };
    }

    function renderGraphView() {
        if (typeof vis === 'undefined') {
            graphViewContainer.innerHTML = '<p style="color:var(--accent-danger);">Ошибка: Библиотека визуализации не загрузилась.</p>';
            return;
        }

        graphViewContainer.innerHTML = ''; 
        const currentBoard = allBoardsData[activeBoardId];
        if (!currentBoard || !currentBoard.columns) {
            graphViewContainer.innerHTML = '<p style="padding: 2rem; color: var(--text-secondary);">Нет данных для построения графа.</p>';
            return;
        }
        
        const nodesData = [];
        const imageLoadPromises = [];
        imageCache = {};
        const columnColors = ['#3498db', '#f39c12', '#2ecc71', '#9b59b6', '#e74c3c', '#1abc9c'];

        const rawTasks = [];
        (currentBoard.columns || []).forEach((column, index) => {
            const color = columnColors[index % columnColors.length];
            (column.tasks || []).forEach(task => {
                rawTasks.push({ task, color });
            });
        });

        rawTasks.forEach(({ task, color }) => {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = task.content;
            const imgEl = tempDiv.querySelector('img');
            
            let imagePromise = Promise.resolve();
            let img = null;
            if (imgEl && imgEl.src) {
                img = new Image();
                imagePromise = new Promise((resolve) => {
                    img.onload = resolve;
                    img.onerror = resolve; 
                });
                img.src = imgEl.src;
            }
            imageCache[task.id] = img; 
            imageLoadPromises.push(imagePromise);

            imagePromise.then(() => {
                const label = formatLabelForGraph(task.content);
                const { width, height } = calculateNodeSize(label, imageCache[task.id]);
                nodesData.push({
                    id: task.id,
                    label: label,
                    title: getTaskTextContent(task.content), 
                    color: { background: color, border: '#2c3e50', highlight: { background: '#4a627a', border: '#ecf0f1' }, hover: { background: color, border: '#ecf0f1' } },
                    widthConstraint: { minimum: width, maximum: width }, 
                    heightConstraint: { minimum: height, maximum: height }, 
                    width: width, 
                    height: height,
                });
            });
        });
        
        Promise.all(imageLoadPromises).then(() => {
            const nodes = new vis.DataSet(nodesData);
            const edges = new vis.DataSet(currentBoard.edges || []);
            const data = { nodes, edges };

            const options = {
                nodes: {
                    shape: 'box',
                    shapeProperties: {
                        borderRadius: 8 // Скругляем края
                    },
                    font: { color: '#ecf0f1', size: parseInt(FONT_STYLE), face: FONT_STYLE.split(' ')[1], align: 'center' },
                    shadow: {
                        enabled: true,
                        color: 'rgba(0,0,0,0.5)',
                        size: 10,
                        x: 5,
                        y: 5
                    }
                },
                edges: {
                    color: { color: 'rgba(236, 240, 241, 0.7)', highlight: 'var(--accent-secondary)', hover: 'var(--accent-primary)' },
                    width: 3,
                    arrows: 'to',
                    smooth: { type: 'cubicBezier', forceDirection: 'horizontal', roundness: 0.6 }
                },
                 physics: {
                    solver: 'forceAtlas2Based',
                    forceAtlas2Based: { gravitationalConstant: -150, centralGravity: 0.005, springLength: 200, springConstant: 0.05, damping: 0.7 },
                    minVelocity: 0.75,
                    stabilization: { iterations: 150 }
                },
                interaction: { dragNodes: true, dragView: true, zoomView: true, tooltipDelay: 200, hover: true },
                manipulation: { enabled: false },
            };

            if (network) network.destroy();
            network = new vis.Network(graphViewContainer, data, options);
            
            let hoveredAnchor = null;
            let isDrawingEdge = false;
            let sourceNodeId = null;
            const canvas = graphViewContainer.querySelector('canvas');
            const ctx = canvas.getContext('2d');
            
            // --- Drawing Anchors and Dragging Line ---
            network.on("beforeDrawing", function (ctx) {
                if (isDrawingEdge && sourceNodeId) {
                    const fromNode = nodes.get(sourceNodeId);
                    const fromPos = network.getPositions([sourceNodeId])[sourceNodeId];
                    const fromX = fromPos.x + fromNode.width / 2;
                    const fromY = fromPos.y;

                    const mousePos = network.DOMtoCanvas({x: lastMousePos.x, y: lastMousePos.y});

                    ctx.beginPath();
                    ctx.moveTo(fromX, fromY);
                    
                    // Рисуем красивую кривую Безье
                    const c1x = fromX + (mousePos.x - fromX) * 0.5;
                    const c1y = fromY;
                    const c2x = fromX + (mousePos.x - fromX) * 0.5;
                    const c2y = mousePos.y;

                    ctx.bezierCurveTo(c1x, c1y, c2x, c2y, mousePos.x, mousePos.y);

                    ctx.strokeStyle = 'var(--accent-secondary)';
                    ctx.lineWidth = 3;
                    ctx.setLineDash([5, 5]);
                    ctx.stroke();
                    ctx.setLineDash([]); // Reset for other drawings
                }
            });
            
            network.on("afterDrawing", function (ctx) {
                const nodeIds = nodes.getIds();
                const positions = network.getPositions(nodeIds);
                
                nodeIds.forEach(nodeId => {
                    const node = nodes.get(nodeId);
                    const pos = positions[nodeId];
                    const width = node.width;

                    // --- Draw Left Anchor ---
                    const isHoveredInput = hoveredAnchor && hoveredAnchor.nodeId === nodeId && hoveredAnchor.anchor === 'input';
                    let gradInput = ctx.createRadialGradient(pos.x - width / 2, pos.y, 1, pos.x - width / 2, pos.y, ANCHOR_RADIUS);
                    gradInput.addColorStop(0, isHoveredInput ? '#fff' : '#ddd');
                    gradInput.addColorStop(1, isHoveredInput ? '#aaa' : '#888');
                    
                    ctx.beginPath();
                    ctx.fillStyle = gradInput;
                    ctx.arc(pos.x - width / 2, pos.y, ANCHOR_RADIUS, 0, 2 * Math.PI);
                    ctx.fill();
                    if(isHoveredInput) {
                        ctx.strokeStyle = 'var(--accent-primary)';
                        ctx.lineWidth = 2;
                        ctx.stroke();
                    }

                    // --- Draw Right Anchor ---
                    const isHoveredOutput = hoveredAnchor && hoveredAnchor.nodeId === nodeId && hoveredAnchor.anchor === 'output';
                    let gradOutput = ctx.createRadialGradient(pos.x + width / 2, pos.y, 1, pos.x + width / 2, pos.y, ANCHOR_RADIUS);
                    gradOutput.addColorStop(0, isHoveredOutput ? '#fff' : '#ddd');
                    gradOutput.addColorStop(1, isHoveredOutput ? '#aaa' : '#888');

                    ctx.beginPath();
                    ctx.fillStyle = gradOutput;
                    ctx.arc(pos.x + width / 2, pos.y, ANCHOR_RADIUS, 0, 2 * Math.PI);
                    ctx.fill();
                    if(isHoveredOutput) {
                        ctx.strokeStyle = 'var(--accent-secondary)';
                        ctx.lineWidth = 2;
                        ctx.stroke();
                    }
                });
            });

            // --- Interaction Logic ---
            
            function getAnchorAndNodeFromPosition(domPos) {
                const nodeId = network.getNodeAt(domPos);
                if (nodeId) {
                    const node = nodes.get(nodeId);
                    const nodeCanvasPosition = network.getPositions([nodeId])[nodeId];
                    const nodeWidth = node.width;

                    const leftAnchorPos = { x: nodeCanvasPosition.x - nodeWidth / 2, y: nodeCanvasPosition.y };
                    const domLeftAnchorPos = network.canvasToDOM(leftAnchorPos);
                    if (Math.hypot(domPos.x - domLeftAnchorPos.x, domPos.y - domLeftAnchorPos.y) < ANCHOR_RADIUS * 1.5) {
                        return { nodeId, anchor: 'input' };
                    }

                    const rightAnchorPos = { x: nodeCanvasPosition.x + nodeWidth / 2, y: nodeCanvasPosition.y };
                    const domRightAnchorPos = network.canvasToDOM(rightAnchorPos);
                     if (Math.hypot(domPos.x - domRightAnchorPos.x, domPos.y - domRightAnchorPos.y) < ANCHOR_RADIUS * 1.5) {
                        return { nodeId, anchor: 'output' };
                    }
                }
                return { nodeId: null, anchor: null };
            }

            let lastMousePos = {x:0, y:0};
            canvas.addEventListener('mousemove', e => {
                const domPos = { x: e.offsetX, y: e.offsetY };
                lastMousePos = domPos;
                const { nodeId, anchor } = getAnchorAndNodeFromPosition(domPos);
                
                if (nodeId) {
                    hoveredAnchor = { nodeId, anchor };
                    network.redraw();
                } else if (hoveredAnchor) {
                    hoveredAnchor = null;
                    network.redraw();
                }

                if (isDrawingEdge) {
                    network.redraw(); // Redraw to show the dragging line
                }
            });

            canvas.addEventListener('mousedown', e => {
                const domPos = { x: e.offsetX, y: e.offsetY };
                const { nodeId, anchor } = getAnchorAndNodeFromPosition(domPos);

                if (nodeId && anchor === 'output') {
                    isDrawingEdge = true;
                    sourceNodeId = nodeId;
                    network.setOptions({ interaction: { dragNodes: false } }); 
                }
            });

            canvas.addEventListener('mouseup', e => {
                if (isDrawingEdge) {
                    const domPos = { x: e.offsetX, y: e.offsetY };
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
                    network.redraw();
                    network.setOptions({ interaction: { dragNodes: true } }); 
                }
            });


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
        });
    }

    function initializeApp() {
        loadAllBoards(); 
        loadActiveBoardId(); 
        loadBoard();
        
        showBoardViewBtn.addEventListener('click', () => switchView('board'));
        showGraphViewBtn.addEventListener('click', () => switchView('graph'));
    }
     
    initializeApp();
})();

