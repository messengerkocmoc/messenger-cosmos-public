// Глобальные переменные
let authToken = null;
let currentUser = null;
let currentChat = null;
let emojiPanelVisible = false;
let mediaRecorder = null;
let audioChunks = [];
let recordingTimer = null;
let recordingStartTime = null;
let isRecording = false;
let activeCall = null;

// API запросы
async function apiRequest(url, options = {}) {
    try {
        // Скрываем emoji-панель и убираем фокус с поля ввода, чтобы ничего лишнего не перекрывалось
        try {
            if (typeof hideEmojiPanel === 'function') {
                hideEmojiPanel();
            }
        } catch (e) {}
        const msgInput = document.getElementById('messageInput');
        if (msgInput) msgInput.blur();

        const apiUrl = url.startsWith('/') ? `/api${url}` : `/api/${url}`;
        
        const response = await fetch(apiUrl, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': authToken ? `Bearer ${authToken}` : ''
            },
            ...options
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || errorData.message || `HTTP error! status: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('API Request failed:', error);
        showNotification('Ошибка сети', 'Проверьте подключение к интернету', 'error');
        throw error;
    }
}

// Улучшенные уведомления
function showNotification(title, message, type = 'info', duration = 5000) {
    const notificationContainer = document.getElementById('notificationContainer');
    const notificationId = 'notification-' + Date.now();
    
    const notification = document.createElement('div');
    notification.id = notificationId;
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <div class="notification-icon">
            <i class="fas fa-${getNotificationIcon(type)}"></i>
        </div>
        <div class="notification-content">
            <div class="notification-title">${title}</div>
            <div class="notification-message">${message}</div>
        </div>
        <button class="notification-close" onclick="closeNotification('${notificationId}')">&times;</button>
    `;

    notificationContainer.appendChild(notification);

    // Анимация появления
    setTimeout(() => notification.classList.add('show'), 10);

    // Автоматическое закрытие
    if (duration > 0) {
        setTimeout(() => closeNotification(notificationId), duration);
    }

    return notificationId;
}

function getNotificationIcon(type) {
    const icons = {
        'success': 'check-circle',
        'error': 'exclamation-circle',
        'warning': 'exclamation-triangle',
        'info': 'info-circle'
    };
    return icons[type] || 'info-circle';
}

function closeNotification(notificationId) {
    const notification = document.getElementById(notificationId);
    if (notification) {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }
}

// Получить deviceId
function getDeviceId() {
    let deviceId = localStorage.getItem('deviceId');
    if (!deviceId) {
        deviceId = 'device_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
        localStorage.setItem('deviceId', deviceId);
    }
    return deviceId;
}

// Управление экранами
function showAuthScreen() {
    document.getElementById('authContainer').style.display = 'flex';
    document.getElementById('appContainer').style.display = 'none';
    document.getElementById('adminContainer').style.display = 'none';
    document.getElementById('adminFloatBtn').style.display = 'none';
}

function showApp() {
    document.getElementById('authContainer').style.display = 'none';
    document.getElementById('appContainer').style.display = 'flex';
    document.getElementById('adminContainer').style.display = 'none';
    document.getElementById('adminFloatBtn').style.display = currentUser && currentUser.is_admin ? 'flex' : 'none';
    
    updateUserInterface();
    loadChats();
}

function updateUserInterface() {
    const userAvatar = document.getElementById('userAvatar');
    const userName = document.getElementById('userName');
    const adminUserAvatar = document.getElementById('adminUserAvatar');
    const adminUserName = document.getElementById('adminUserName');
    
    if (userAvatar && userName && currentUser) {
        userAvatar.src = currentUser.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.name)}&background=6A5ACD&color=ffffff`;
        userName.textContent = currentUser.name;
    }
    
    if (adminUserAvatar && adminUserName && currentUser) {
        adminUserAvatar.src = currentUser.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.name)}&background=6A5ACD&color=ffffff`;
        adminUserName.textContent = currentUser.name;
    }
}

function showAdminPanel() {
    document.getElementById('authContainer').style.display = 'none';
    document.getElementById('appContainer').style.display = 'none';
    document.getElementById('adminContainer').style.display = 'flex';
    updateUserInterface();
    
    if (typeof loadAdminData === 'function') {
        loadAdminData();
    }
}

// Проверка токена
async function verifyToken() {
    const savedToken = localStorage.getItem('authToken');
    if (!savedToken) {
        showAuthScreen();
        return;
    }

    authToken = savedToken;
    
    try {
        // Скрываем emoji-панель и убираем фокус с поля ввода, чтобы ничего лишнего не перекрывалось
        try {
            if (typeof hideEmojiPanel === 'function') {
                hideEmojiPanel();
            }
        } catch (e) {}
        const msgInput = document.getElementById('messageInput');
        if (msgInput) msgInput.blur();

        const data = await apiRequest('/auth/verify');
        currentUser = data.user;
        
        if (currentUser.is_admin) {
            showAdminPanel();
        } else {
            showApp();
        }
    } catch (error) {
        console.error('Token verification failed:', error);
        localStorage.removeItem('authToken');
        authToken = null;
        showAuthScreen();
    }
}

// Вспомогательные функции
function formatTime(date) {
    if (!date) return '';
    const now = new Date();
    const messageDate = new Date(date);
    const diff = now - messageDate;
    
    if (diff < 60 * 1000) {
        return 'только что';
    } else if (diff < 60 * 60 * 1000) {
        const minutes = Math.floor(diff / (60 * 1000));
        return `${minutes} мин назад`;
    } else if (diff < 24 * 60 * 60 * 1000) {
        return messageDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    } else {
        return messageDate.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
    }
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Работа с файлами
function initFileUpload() {
    const attachmentBtn = document.getElementById('attachmentBtn');
    const fileInput = document.getElementById('fileInput');
    
    if (attachmentBtn && fileInput) {
        attachmentBtn.addEventListener('click', () => {
            fileInput.click();
        });
        
        fileInput.addEventListener('change', handleFileSelect);
    }
}

async function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Показываем индикатор загрузки
    const notificationId = showNotification('Загрузка', 'Загружаем файл...', 'info', 0);
    
    if (file.size > 50 * 1024 * 1024) {
        closeNotification(notificationId);
        showNotification('Ошибка', 'Файл слишком большой (максимум 50MB)', 'error');
        return;
    }
    
    try {
        // Скрываем emoji-панель и убираем фокус с поля ввода, чтобы ничего лишнего не перекрывалось
        try {
            if (typeof hideEmojiPanel === 'function') {
                hideEmojiPanel();
            }
        } catch (e) {}
        const msgInput = document.getElementById('messageInput');
        if (msgInput) msgInput.blur();

        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch('/api/files/upload', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            },
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            closeNotification(notificationId);
            await sendMessageWithFile(data.file);
            showNotification('Успех', 'Файл загружен', 'success');
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        closeNotification(notificationId);
        console.error('Ошибка загрузки файла:', error);
        showNotification('Ошибка', 'Не удалось загрузить файл', 'error');
    } finally {
        event.target.value = '';
    }
}

async function sendMessageWithFile(fileInfo) {
    if (!currentChat) {
        showNotification('Ошибка', 'Выберите чат для отправки файла', 'error');
        return;
    }
    
    try {
        // Скрываем emoji-панель и убираем фокус с поля ввода, чтобы ничего лишнего не перекрывалось
        try {
            if (typeof hideEmojiPanel === 'function') {
                hideEmojiPanel();
            }
        } catch (e) {}
        const msgInput = document.getElementById('messageInput');
        if (msgInput) msgInput.blur();

        const messageData = {
            file_url: fileInfo.url,
            file_name: fileInfo.originalName,
            file_size: fileInfo.size,
            file_type: fileInfo.mimetype,
            message_type: 'file'
        };
        
        const data = await apiRequest(`/messages/${currentChat}`, {
            method: 'POST',
            body: JSON.stringify(messageData)
        });
        
        addMessageToChat(data.message);
        scrollToBottom();
        loadChats();
    } catch (error) {
        console.error('Ошибка отправки файла:', error);
        showNotification('Ошибка', 'Не удалось отправить файл', 'error');
    }
}

// Функция тестирования микрофона
async function testMicrophone() {
    try {
        // Скрываем emoji-панель и убираем фокус с поля ввода, чтобы ничего лишнего не перекрывалось
        try {
            if (typeof hideEmojiPanel === 'function') {
                hideEmojiPanel();
            }
        } catch (e) {}
        const msgInput = document.getElementById('messageInput');
        if (msgInput) msgInput.blur();

        showNotification('Тест микрофона', 'Проверяем доступ к микрофону...', 'info');
        
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Ваш браузер не поддерживает запись аудио');
        }
        
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                sampleRate: 44100
            }
        });
        
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length === 0) {
            throw new Error('Микрофон не найден');
        }
        
        // Проверяем работу микрофона
        const audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        source.connect(analyser);
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        stream.getTracks().forEach(track => track.stop());
        audioContext.close();
        
        showNotification('Успех', 'Микрофон работает корректно!', 'success');
        
    } catch (error) {
        console.error('Ошибка тестирования микрофона:', error);
        
        let errorMessage = 'Не удалось проверить микрофон';
        
        if (error.name === 'NotAllowedError') {
            errorMessage = 'Доступ к микрофону запрещен. Разрешите использование микрофона в настройках браузера.';
        } else if (error.name === 'NotFoundError') {
            errorMessage = 'Микрофон не найден. Убедитесь, что микрофон подключен.';
        } else if (error.name === 'NotSupportedError') {
            errorMessage = 'Ваш браузер не поддерживает запись аудио.';
        } else if (error.name === 'NotReadableError') {
            errorMessage = 'Микрофон используется другим приложением.';
        }
        
        showNotification('Ошибка микрофона', errorMessage, 'error');
    }
}

// Голосовые сообщения
function initVoiceRecording() {
    const voiceMessageBtn = document.getElementById('voiceMessageBtn');
    const voiceRecorder = document.getElementById('voiceRecorder');
    const voiceRecorderCancel = document.getElementById('voiceRecorderCancel');
    const voiceRecorderSend = document.getElementById('voiceRecorderSend');
    const testMicrophoneBtn = document.getElementById('testMicrophoneBtn');
    
    if (voiceMessageBtn) {
        voiceMessageBtn.addEventListener('click', toggleVoiceRecording);
    }
    
    if (voiceRecorderCancel) {
        voiceRecorderCancel.addEventListener('click', cancelVoiceRecording);
    }
    
    if (voiceRecorderSend) {
        voiceRecorderSend.addEventListener('click', sendVoiceMessage);
    }
    
    if (testMicrophoneBtn) {
        testMicrophoneBtn.addEventListener('click', testMicrophone);
    }
}

function toggleVoiceRecording() {
    if (isRecording) {
        stopVoiceRecording();
    } else {
        startVoiceRecording();
    }
}

async function startVoiceRecording() {
    if (!currentChat) {
        showNotification('Ошибка', 'Выберите чат для отправки голосового сообщения', 'error');
        return;
    }
    
    try {
        // Скрываем emoji-панель и убираем фокус с поля ввода, чтобы ничего лишнего не перекрывалось
        try {
            if (typeof hideEmojiPanel === 'function') {
                hideEmojiPanel();
            }
        } catch (e) {}
        const msgInput = document.getElementById('messageInput');
        if (msgInput) msgInput.blur();

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Ваш браузер не поддерживает запись аудио');
        }

        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            } 
        });
        
        const options = { 
            mimeType: 'audio/webm;codecs=opus',
            audioBitsPerSecond: 128000
        };
        
        try {
        // Скрываем emoji-панель и убираем фокус с поля ввода, чтобы ничего лишнего не перекрывалось
        try {
            if (typeof hideEmojiPanel === 'function') {
                hideEmojiPanel();
            }
        } catch (e) {}
        const msgInput = document.getElementById('messageInput');
        if (msgInput) msgInput.blur();

            mediaRecorder = new MediaRecorder(stream, options);
        } catch (e) {
            mediaRecorder = new MediaRecorder(stream);
        }
        
        audioChunks = [];
        
        mediaRecorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };
        
        mediaRecorder.onstop = async () => {
            stream.getTracks().forEach(track => track.stop());
            
            if (audioChunks.length > 0) {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                await uploadVoiceMessage(audioBlob);
            }
        };
        
        mediaRecorder.onerror = (event) => {
            console.error('Ошибка записи:', event.error);
            showNotification('Ошибка', 'Ошибка при записи аудио', 'error');
            cancelVoiceRecording();
        };
        
        mediaRecorder.start(1000);
        startRecordingTimer();
        document.getElementById('voiceRecorder').classList.add('active');
        
        const voiceMessageBtn = document.getElementById('voiceMessageBtn');
        voiceMessageBtn.innerHTML = '<i class="fas fa-square"></i>';
        voiceMessageBtn.style.color = '#ff4444';
        voiceMessageBtn.classList.add('recording');
        
        isRecording = true;
        
    } catch (error) {
        console.error('Ошибка доступа к микрофону:', error);
        
        let errorMessage = 'Не удалось получить доступ к микрофону';
        
        if (error.name === 'NotAllowedError') {
            errorMessage = 'Доступ к микрофону запрещен. Разрешите использование микрофона в настройках браузера.';
        } else if (error.name === 'NotFoundError') {
            errorMessage = 'Микрофон не найден. Убедитесь, что микрофон подключен.';
        } else if (error.name === 'NotSupportedError') {
            errorMessage = 'Ваш браузер не поддерживает запись аудио.';
        } else if (error.name === 'NotReadableError') {
            errorMessage = 'Микрофон используется другим приложением.';
        }
        
        showNotification('Ошибка микрофона', errorMessage, 'error');
        resetVoiceButton();
    }
}

function stopVoiceRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
    
    stopRecordingTimer();
    document.getElementById('voiceRecorder').classList.remove('active');
    resetVoiceButton();
    isRecording = false;
}

function cancelVoiceRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        if (mediaRecorder.stream) {
            mediaRecorder.stream.getTracks().forEach(track => track.stop());
        }
    }
    
    stopRecordingTimer();
    document.getElementById('voiceRecorder').classList.remove('active');
    audioChunks = [];
    resetVoiceButton();
    isRecording = false;
}

function resetVoiceButton() {
    // Возвращаем доступ ко всем кнопкам ввода
    const emojiBtn = document.getElementById('emojiBtn');
    const attachmentBtn = document.getElementById('attachmentBtn');
    const sendBtn = document.getElementById('sendMessageBtn');
    [emojiBtn, attachmentBtn, sendBtn].forEach(btn => {
        if (!btn) return;
        const wasDisabled = btn.getAttribute('data-prev-disabled') === '1';
        btn.disabled = wasDisabled;
        btn.removeAttribute('data-prev-disabled');
    });


    const voiceMessageBtn = document.getElementById('voiceMessageBtn');
    voiceMessageBtn.innerHTML = '<i class="fas fa-microphone"></i>';
    voiceMessageBtn.style.color = '';
    voiceMessageBtn.classList.remove('recording');
}

async function sendVoiceMessage() {
    stopVoiceRecording();
}

async function uploadVoiceMessage(audioBlob) {
    try {
        // Скрываем emoji-панель и убираем фокус с поля ввода, чтобы ничего лишнего не перекрывалось
        try {
            if (typeof hideEmojiPanel === 'function') {
                hideEmojiPanel();
            }
        } catch (e) {}
        const msgInput = document.getElementById('messageInput');
        if (msgInput) msgInput.blur();

        if (audioBlob.size > 10 * 1024 * 1024) {
            showNotification('Ошибка', 'Голосовое сообщение слишком большое', 'error');
            return;
        }
        
        const formData = new FormData();
        formData.append('file', audioBlob, `voice-${Date.now()}.webm`);
        
        const response = await fetch('/api/files/upload', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            },
            body: formData
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            const duration = Math.round((Date.now() - recordingStartTime) / 1000);
            await sendVoiceMessageToChat(data.file, duration);
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        console.error('Ошибка загрузки голосового сообщения:', error);
        showNotification('Ошибка', 'Не удалось отправить голосовое сообщение', 'error');
    }
}

async function sendVoiceMessageToChat(fileInfo, duration) {
    try {
        // Скрываем emoji-панель и убираем фокус с поля ввода, чтобы ничего лишнего не перекрывалось
        try {
            if (typeof hideEmojiPanel === 'function') {
                hideEmojiPanel();
            }
        } catch (e) {}
        const msgInput = document.getElementById('messageInput');
        if (msgInput) msgInput.blur();

        const messageData = {
            voice_url: fileInfo.url,
            voice_duration: duration,
            message_type: 'voice'
        };
        
        const data = await apiRequest(`/messages/${currentChat}`, {
            method: 'POST',
            body: JSON.stringify(messageData)
        });
        
        addMessageToChat(data.message);
        scrollToBottom();
        loadChats();
    } catch (error) {
        console.error('Ошибка отправки голосового сообщения:', error);
        showNotification('Ошибка', 'Не удалось отправить голосовое сообщение', 'error');
    }
}

function startRecordingTimer() {
    recordingStartTime = Date.now();
    const timerElement = document.querySelector('.voice-recorder-timer');
    
    recordingTimer = setInterval(() => {
        const seconds = Math.floor((Date.now() - recordingStartTime) / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        if (timerElement) {
            timerElement.textContent = `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
        }
    }, 1000);
}

function stopRecordingTimer() {
    if (recordingTimer) {
        clearInterval(recordingTimer);
        recordingTimer = null;
    }
}

// Открытие файлов
function openFileModal(fileUrl, fileName, fileType) {
    const modal = document.getElementById('fileModal');
    const modalBody = document.getElementById('fileModalBody');
    const modalTitle = document.getElementById('fileModalTitle');
    
    modalTitle.textContent = fileName;
    modalBody.innerHTML = '';
    
    if (fileType.startsWith('image/')) {
        const img = document.createElement('img');
        img.src = fileUrl;
        img.alt = fileName;
        img.style.maxWidth = '100%';
        img.style.maxHeight = '70vh';
        modalBody.appendChild(img);
    } else if (fileType.startsWith('video/')) {
        const video = document.createElement('video');
        video.src = fileUrl;
        video.controls = true;
        video.autoplay = true;
        video.style.maxWidth = '100%';
        video.style.maxHeight = '70vh';
        modalBody.appendChild(video);
    } else if (fileType.startsWith('audio/')) {
        const audio = document.createElement('audio');
        audio.src = fileUrl;
        audio.controls = true;
        audio.autoplay = true;
        audio.style.width = '100%';
        modalBody.appendChild(audio);
    } else {
        modalBody.innerHTML = `
            <div class="file-download">
                <div class="file-download-icon">
                    <i class="fas fa-file-download"></i>
                </div>
                <div class="file-download-info">
                    <div class="file-download-name">${fileName}</div>
                </div>
                <a href="${fileUrl}" download="${fileName}" class="file-download-btn">
                    <i class="fas fa-download"></i> Скачать файл
                </a>
            </div>
        `;
    }
    
    modal.style.display = 'flex';
}

// Инициализация модальных окон
function initModals() {
    // Закрытие модальных окон при клике вне их
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.style.display = 'none';
        }
    });

    // Закрытие модальных окон по кнопке
    const modals = [
        { closeId: 'closeSettingsModal', modalId: 'settingsModal' },
        { closeId: 'closeFeatureModal', modalId: 'featureModal' },
        { closeId: 'closeFileModal', modalId: 'fileModal' },
        { closeId: 'closeCreateGroupModal', modalId: 'createGroupModal' },
        { closeId: 'closeNewChatModal', modalId: 'newChatModal' },
        { closeId: 'closeAccountSwitchModal', modalId: 'accountSwitchModal' }
    ];

    modals.forEach(({ closeId, modalId }) => {
        const closeBtn = document.getElementById(closeId);
        const modal = document.getElementById(modalId);
        if (closeBtn && modal) {
            closeBtn.addEventListener('click', () => {
                modal.style.display = 'none';
            });
        }
    });

    // Настройки темы
    const themeSelect = document.getElementById('themeSelect');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    
    if (themeSelect && saveSettingsBtn) {
        const savedTheme = localStorage.getItem('theme') || 'default';
        themeSelect.value = savedTheme;
        applyTheme(savedTheme);

        saveSettingsBtn.addEventListener('click', () => {
            const theme = themeSelect.value;
            applyTheme(theme);
            document.getElementById('settingsModal').style.display = 'none';
            showNotification('Настройки сохранены', 'Тема успешно изменена', 'success');
        });
    }

    // Кнопка выхода
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (confirm('Вы уверены, что хотите выйти?')) {
                localStorage.removeItem('authToken');
                authToken = null;
                currentUser = null;
                showAuthScreen();
                showNotification('Выход', 'Вы успешно вышли из системы', 'info');
            }
        });
    }

    // Админ кнопка выхода
    const adminLogoutBtn = document.getElementById('adminLogoutBtn');
    if (adminLogoutBtn) {
        adminLogoutBtn.addEventListener('click', () => {
            if (confirm('Вы уверены, что хотите выйти?')) {
                localStorage.removeItem('authToken');
                authToken = null;
                currentUser = null;
                showAuthScreen();
                showNotification('Выход', 'Вы успешно вышли из системы', 'info');
            }
        });
    }
}

function applyTheme(theme) {
    document.body.classList.remove('theme-default', 'theme-dark', 'theme-light');
    document.body.classList.add('theme-' + theme);
    localStorage.setItem('theme', theme);
}

// Загрузка чатов
async function loadChats() {
    try {
        // Скрываем emoji-панель и убираем фокус с поля ввода, чтобы ничего лишнего не перекрывалось
        try {
            if (typeof hideEmojiPanel === 'function') {
                hideEmojiPanel();
            }
        } catch (e) {}
        const msgInput = document.getElementById('messageInput');
        if (msgInput) msgInput.blur();

        const data = await apiRequest('/chats');
        const chatsList = document.getElementById('chatsList');
        
        if (!chatsList) return;

        chatsList.innerHTML = '';

        if (data.chats && data.chats.length > 0) {
            data.chats.forEach(chat => {
                addChatToSidebar(chat);
            });
            
            if (currentChat) {
                const activeChatItem = document.querySelector(`.chat-item[data-chat-id="${currentChat}"]`);
                if (activeChatItem) {
                    activeChatItem.classList.add('active');
                }
            }
        } else {
            chatsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-comments"></i>
                    <p>У вас пока нет чатов</p>
                    <button class="btn" id="createFirstChat">
                        <i class="fas fa-plus"></i> Создать первый чат
                    </button>
                </div>
            `;

            document.getElementById('createFirstChat').addEventListener('click', () => {
                document.getElementById('newChatModal').style.display = 'flex';
                loadUsersForNewChat();
            });
        }
    } catch (error) {
        console.error('Ошибка загрузки чатов:', error);
        showNotification('Ошибка', 'Не удалось загрузить чаты', 'error');
    }
}

function addChatToSidebar(chat) {
    const chatsList = document.getElementById('chatsList');
    if (!chatsList) return;

    const chatItem = document.createElement('div');
    chatItem.className = 'chat-item';
    chatItem.dataset.chatId = chat.id;

    const lastMessage = chat.last_message || 'Нет сообщений';
    const lastMessageTime = chat.last_message_time ? formatTime(new Date(chat.last_message_time)) : '';

    chatItem.innerHTML = `
        <img src="${chat.avatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(chat.name) + '&background=6A5ACD&color=ffffff'}" 
             class="chat-avatar" alt="${chat.name}">
        <div class="chat-info">
            <div class="chat-name">
                <span>${chat.name}</span>
                <span class="chat-meta">${lastMessageTime}</span>
            </div>
            <div class="chat-last-message">${lastMessage}</div>
        </div>
        ${chat.unread_count > 0 ? `<div class="unread-count">${chat.unread_count}</div>` : ''}
    `;

    chatItem.addEventListener('click', () => {
        document.querySelectorAll('.chat-item').forEach(item => item.classList.remove('active'));
        chatItem.classList.add('active');
        
        if (window.innerWidth <= 768) {
            const sidebar = document.getElementById('sidebar');
            if (sidebar) {
                sidebar.classList.remove('active');
            }
        }
        
        openChat(chat.id);
    });

    chatsList.appendChild(chatItem);
}

// Открытие чата
async function openChat(chatId) {
    try {
        // Скрываем emoji-панель и убираем фокус с поля ввода, чтобы ничего лишнего не перекрывалось
        try {
            if (typeof hideEmojiPanel === 'function') {
                hideEmojiPanel();
            }
        } catch (e) {}
        const msgInput = document.getElementById('messageInput');
        if (msgInput) msgInput.blur();

        const data = await apiRequest(`/chats/${chatId}`);
        currentChat = chatId;

        const chat = data.chat;
        
        if (!chat) {
            throw new Error('Чат не найден');
        }
        
        document.getElementById('currentChatName').textContent = chat.name;
        document.getElementById('currentChatAvatar').src = chat.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(chat.name)}&background=6A5ACD&color=ffffff`;
        
        if (chat.type === 'personal') {
            const otherUser = chat.participants?.find(p => p.id !== currentUser.id);
            document.getElementById('currentChatStatus').textContent = otherUser?.online ? 'онлайн' : 'не в сети';
        } else {
            document.getElementById('currentChatStatus').textContent = `группа, ${chat.participants?.length || 0} участников`;
        }

        const welcomeMessage = document.querySelector('.welcome-message');
        if (welcomeMessage) {
            welcomeMessage.style.display = 'none';
        }

        await loadMessages(chatId);
        await markMessagesAsRead(chatId);

    } catch (error) {
        console.error('Ошибка открытия чата:', error);
        showNotification('Ошибка', 'Не удалось открыть чат', 'error');
    }
}

// Загрузка сообщений
async function loadMessages(chatId) {
    try {
        // Скрываем emoji-панель и убираем фокус с поля ввода, чтобы ничего лишнего не перекрывалось
        try {
            if (typeof hideEmojiPanel === 'function') {
                hideEmojiPanel();
            }
        } catch (e) {}
        const msgInput = document.getElementById('messageInput');
        if (msgInput) msgInput.blur();

        const data = await apiRequest(`/messages/${chatId}`);
        const messagesContainer = document.getElementById('messagesContainer');
        
        if (!messagesContainer) return;

        messagesContainer.innerHTML = '';

        if (data.messages && data.messages.length > 0) {
            data.messages.forEach(message => {
                addMessageToChat(message);
            });
        } else {
            messagesContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-comment"></i>
                    <p>Начните общение - отправьте первое сообщение!</p>
                </div>
            `;
        }

        scrollToBottom();
        
    } catch (error) {
        console.error('Ошибка загрузки сообщений:', error);
    }
}

// Добавление сообщения в чат

async function addMessageToChat(message) {
    const messagesContainer = document.getElementById('messagesContainer');
    if (!messagesContainer) return;

    const messageElement = document.createElement('div');

    const isMyMessage = message.sender_id === (currentUser && currentUser.id);
    messageElement.className = `message ${isMyMessage ? 'my-message' : ''}`;
    messageElement.dataset.messageId = message.id;

    let messageContent = '';

    if (message.text) {
        messageContent += `<div class="message-text">${escapeHtml(message.text)}</div>`;
    }

    if (message.file_url) {
        messageContent += `
            <div class="message-file">
                <div class="message-file-preview" onclick="openFilePreview('${message.file_url}', '${escapeHtml(message.file_name)}', '${message.file_type}')">
                    ${getFilePreviewIcon(message.file_type)}
                </div>
                <div class="message-file-info">
                    <div class="message-file-name">${escapeHtml(message.file_name)}</div>
                    <div class="message-file-size">${formatFileSize(message.file_size)}</div>
                    <a href="${message.file_url}" download="${escapeHtml(message.file_name)}" class="message-file-download">
                        <i class="fas fa-download"></i> Скачать
                    </a>
                </div>
            </div>
        `;
    }

    if (message.voice_url) {
        messageContent += `
            <div class="message-voice">
                <div class="message-voice-play" onclick="playVoiceMessage(this, '${message.voice_url}')">
                    <i class="fas fa-play"></i>
                </div>
                <div class="message-voice-waveform">
                    <div class="message-voice-progress" style="width: 0%"></div>
                </div>
                <div class="message-voice-duration">${formatVoiceDuration(message.voice_duration)}</div>
            </div>
        `;
    }

    messageElement.innerHTML = `
        <img src="${message.sender_avatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(message.sender_name) + '&background=6A5ACD&color=ffffff'}" 
             class="message-avatar" alt="${message.sender_name}">
        <div class="message-content">
            ${!isMyMessage ? `<div class="message-sender">${escapeHtml(message.sender_name)}</div>` : ''}
            ${messageContent}
            <div class="message-meta-row">
                <div class="message-time">${formatTime(new Date(message.created_at))}</div>
                ${isMyMessage ? `<div class="message-status">${message.status === 'read' ? '✓✓' : '✓'}</div>` : ''}
            </div>
        </div>
    `;

    // Добавляем панель реакций
    const content = messageElement.querySelector('.message-content');
    if (content) {
        const reactionsBar = document.createElement('div');
        reactionsBar.className = 'message-reactions-bar';
        const emojis = ['👍','❤️','😂','😮','😢','😡'];

        emojis.forEach(emoji => {
            const btn = document.createElement('button');
            btn.className = 'message-reaction-btn';
            btn.type = 'button';
            btn.textContent = emoji;
            btn.addEventListener('click', async (ev) => {
                ev.stopPropagation();
                const messageId = messageElement.dataset.messageId;
                if (!messageId) return;

                const alreadyActive = btn.classList.contains('active');
                try {
                    if (alreadyActive) {
                        await apiRequest(`/messages/${messageId}/react`, { method: 'DELETE' });
                        btn.classList.remove('active');
                    } else {
                        await apiRequest(`/messages/${messageId}/react`, {
                            method: 'POST',
                            body: JSON.stringify({ reaction: emoji })
                        });
                        // снимаем активность с других
                        reactionsBar.querySelectorAll('.message-reaction-btn.active').forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                    }
                } catch (err) {
                    console.error('reaction error:', err);
                    showNotification('Ошибка', 'Не удалось отправить реакцию', 'error', 2000);
                }
            });
            reactionsBar.appendChild(btn);
        });

        content.appendChild(reactionsBar);
    }

    // Подключаем обработчики свайпов и контекстного меню
    if (typeof attachMessageEventHandlers === 'function') {
        attachMessageEventHandlers(messageElement, isMyMessage);
    }

    messagesContainer.appendChild(messageElement);
}

// --- Контекстное меню и свайпы сообщений ---

let messageContextMenuElement = null;

function ensureMessageContextMenu() {
    if (messageContextMenuElement) return messageContextMenuElement;

    const el = document.createElement('div');
    el.id = 'messageContextMenu';
    el.className = 'message-context-menu';
    el.innerHTML = '';
    document.body.appendChild(el);

    document.addEventListener('click', (e) => {
        if (!el.contains(e.target)) {
            el.classList.remove('visible');
        }
    });

    messageContextMenuElement = el;
    return el;
}

async function openMessageContextMenu(event, messageElement, isMyMessage) {
    const menu = ensureMessageContextMenu();
    event.preventDefault();

    const messageId = messageElement.dataset.messageId;
    const textEl = messageElement.querySelector('.message-text');
    const messageText = textEl ? textEl.textContent.trim() : '';

    let items = [
        { action: 'reply', label: 'Ответить' },
        { action: 'copy', label: 'Скопировать текст' }
    ];

    if (isMyMessage) {
        items.push({ action: 'delete', label: 'Удалить' });
    }

    menu.innerHTML = items.map(item => `
        <button class="message-context-item" data-action="\${item.action}" data-message-id="\${messageId}">
            \${item.label}
        </button>
    `).join('');

    const point = event.touches && event.touches[0] ? event.touches[0] : event;
    const clickX = point.clientX || 0;
    const clickY = point.clientY || 0;

    const menuWidth = 220;
    const menuHeight = 140;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = clickX;
    let top = clickY;

    if (left + menuWidth > viewportWidth) {
        left = viewportWidth - menuWidth - 8;
    }
    if (top + menuHeight > viewportHeight) {
        top = viewportHeight - menuHeight - 8;
    }

    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
    menu.classList.add('visible');

    menu.onclick = async (e) => {
        const btn = e.target.closest('.message-context-item');
        if (!btn) return;
        const action = btn.dataset.action;

        if (action === 'copy' && messageText) {
            try {
                await navigator.clipboard.writeText(messageText);
                showNotification('Скопировано', 'Текст скопирован в буфер', 'success', 1800);
            } catch (err) {
                console.error('clipboard error:', err);
            }
        }

        if (action === 'delete') {
            try {
                await apiRequest(`/messages/${messageId}`, { method: 'DELETE' });
                if (messageElement && messageElement.parentElement) {
                    messageElement.parentElement.removeChild(messageElement);
                }
            } catch (err) {
                console.error('delete message error:', err);
                showNotification('Ошибка', 'Не удалось удалить сообщение', 'error', 2000);
            }
        }

        if (action === 'reply') {
            const input = document.getElementById('messageInput');
            if (input && messageText) {
                input.focus();
                const quote = messageText.length > 120 ? messageText.slice(0, 117) + '…' : messageText;
                if (!input.value.startsWith('>')) {
                    input.value = `> \${quote}\n` + input.value;
                    if (typeof autoResizeTextarea === 'function') {
                        autoResizeTextarea(input);
                    }
                }
            }
        }

        menu.classList.remove('visible');
    };
}

function attachMessageEventHandlers(messageElement, isMyMessage) {
    if (!messageElement) return;

    // ПК: контекстное меню
    messageElement.addEventListener('contextmenu', (e) => {
        openMessageContextMenu(e, messageElement, isMyMessage);
    });

    // Мобильный: свайпы и long-press
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;
    let longPressTimeout = null;

    messageElement.addEventListener('touchstart', (e) => {
        const t = e.touches[0];
        touchStartX = t.clientX;
        touchStartY = t.clientY;
        touchStartTime = Date.now();

        longPressTimeout = setTimeout(() => {
            openMessageContextMenu(e, messageElement, isMyMessage);
        }, 550);
    }, { passive: true });

    messageElement.addEventListener('touchmove', (e) => {
        const t = e.touches[0];
        const dx = Math.abs(t.clientX - touchStartX);
        const dy = Math.abs(t.clientY - touchStartY);
        if (dx > 12 || dy > 12) {
            if (longPressTimeout) {
                clearTimeout(longPressTimeout);
                longPressTimeout = null;
            }
        }
    }, { passive: true });

    messageElement.addEventListener('touchend', (e) => {
        const t = e.changedTouches[0];
        const dx = t.clientX - touchStartX;
        const dy = t.clientY - touchStartY;
        const dt = Date.now() - touchStartTime;

        if (longPressTimeout) {
            clearTimeout(longPressTimeout);
            longPressTimeout = null;
        }

        // Быстрый свайп вправо для ответа
        if (dt < 350 && dx > 40 && Math.abs(dy) < 30) {
            openMessageContextMenu(e, messageElement, isMyMessage);
        }
    });
}
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getFilePreviewIcon(fileType) {
    if (fileType.startsWith('image/')) {
        return '<i class="fas fa-image"></i>';
    } else if (fileType.startsWith('video/')) {
        return '<i class="fas fa-video"></i>';
    } else if (fileType.startsWith('audio/')) {
        return '<i class="fas fa-music"></i>';
    } else if (fileType === 'application/pdf') {
        return '<i class="fas fa-file-pdf"></i>';
    } else {
        return '<i class="fas fa-file"></i>';
    }
}

function formatVoiceDuration(seconds) {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Воспроизведение голосовых сообщений
function playVoiceMessage(buttonElement, voiceUrl) {
    const audio = new Audio(voiceUrl);
    const progressElement = buttonElement.parentElement.querySelector('.message-voice-progress');
    const playIcon = buttonElement.querySelector('i');
    
    audio.addEventListener('timeupdate', () => {
        if (progressElement && audio.duration) {
            const progress = (audio.currentTime / audio.duration) * 100;
            progressElement.style.width = `${progress}%`;
        }
    });
    
    audio.addEventListener('ended', () => {
        playIcon.className = 'fas fa-play';
        progressElement.style.width = '0%';
    });
    
    audio.addEventListener('pause', () => {
        playIcon.className = 'fas fa-play';
    });
    
    if (audio.paused) {
        audio.play();
        playIcon.className = 'fas fa-pause';
    } else {
        audio.pause();
        playIcon.className = 'fas fa-play';
    }
}

function scrollToBottom() {
    const messagesContainer = document.getElementById('messagesContainer');
    if (!messagesContainer) return;

    try {
        messagesContainer.scrollTo({
            top: messagesContainer.scrollHeight,
            behavior: 'smooth'
        });
    } catch (e) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

async function markMessagesAsRead(chatId) {
    try {
        // Скрываем emoji-панель и убираем фокус с поля ввода, чтобы ничего лишнего не перекрывалось
        try {
            if (typeof hideEmojiPanel === 'function') {
                hideEmojiPanel();
            }
        } catch (e) {}
        const msgInput = document.getElementById('messageInput');
        if (msgInput) msgInput.blur();

        await apiRequest(`/messages/${chatId}/read`, {
            method: 'PUT'
        });
        
        const unreadCount = document.querySelector(`.chat-item[data-chat-id="${chatId}"] .unread-count`);
        if (unreadCount) {
            unreadCount.remove();
        }
    } catch (error) {
        console.error('Ошибка пометки сообщений:', error);
    }
}

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', () => {
    const savedToken = localStorage.getItem('authToken');
    if (savedToken) {
        authToken = savedToken;
        verifyToken();
    } else {
        showAuthScreen();
    }

    initModals();
    initFileUpload();
    initVoiceRecording();
    
    // Применяем сохраненную тему
    const savedTheme = localStorage.getItem('theme') || 'default';
    applyTheme(savedTheme);
});

// Глобальные функции
window.openFileModal = openFileModal;
window.playVoiceMessage = playVoiceMessage;
window.closeNotification = closeNotification;


// --- Robust event delegation fallback for buttons and modal controls ---
// This block ensures important UI buttons work even if elements are recreated dynamically
document.addEventListener('click', function(e) {
    // Helper to find closest match
    const target = e.target;
    // Logout (button or icon)
    if (target.closest && target.closest('#logoutBtn, .logout-btn, [data-action="logout"]')) {
        e.preventDefault();
        if (confirm('Вы уверены, что хотите выйти?')) {
            localStorage.removeItem('authToken');
            authToken = null;
            currentUser = null;
            if (typeof showAuthScreen === 'function') showAuthScreen();
            if (typeof showNotification === 'function') showNotification('Выход', 'Вы успешно вышли из системы', 'info');
        }
        return;
    }
    // Close feature modal (OK)
    if (target.closest && target.closest('#closeFeatureModal, .feature-modal-close, [data-dismiss="feature"]')) {
        const fm = document.getElementById('featureModal');
        if (fm) fm.style.display = 'none';
        return;
    }
    // Generic modal close via close icon or elements with data-dismiss="modal"
    if (target.closest && target.closest('.modal-close, [data-dismiss="modal"], .close-modal')) {
        const btn = target.closest('.modal-close, [data-dismiss="modal"], .close-modal');
        // try to find parent modal
        let modal = btn && btn.closest && btn.closest('.modal, .feature-modal, .settings-modal');
        if (!modal) {
            // fallback: find by data-target
            const tgt = btn && (btn.getAttribute('data-target') || btn.getAttribute('data-modal'));
            if (tgt) modal = document.getElementById(tgt.replace('#',''));
        }
        if (modal) modal.style.display = 'none';
        return;
    }
    // Save settings fallback (if primary handler not attached)
    if (target.closest && target.closest('#saveSettingsBtn, .save-settings-btn, [data-action="save-settings"]')) {
        const themeSelect = document.getElementById('themeSelect');
        if (themeSelect) {
            const theme = themeSelect.value;
            if (typeof applyTheme === 'function') applyTheme(theme);
            localStorage.setItem('theme', theme);
            const settingsModal = document.getElementById('settingsModal');
            if (settingsModal) settingsModal.style.display = 'none';
            if (typeof showNotification === 'function') showNotification('Настройки сохранены', 'Тема успешно изменена', 'success');
        }
        return;
    }
    // Feature modal open: elements with data-action="feature" will show feature modal
    if (target.closest && target.closest('[data-action="show-feature"], .open-feature-modal')) {
        const fm = document.getElementById('featureModal');
        if (fm) fm.style.display = 'flex';
        return;
    }
}, false);
// --- End of delegation block ---
