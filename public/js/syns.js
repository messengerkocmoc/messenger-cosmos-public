// Управление синхронизацией оффлайн-данных
class SyncManager {
    constructor() {
        this.isOnline = navigator.onLine;
        this.syncInProgress = false;
        this.pendingMessages = [];
        this.init();
    }

    init() {
        // Слушаем события онлайн/оффлайн
        window.addEventListener('online', this.handleOnline.bind(this));
        window.addEventListener('offline', this.handleOffline.bind(this));

        // Слушаем сообщения от Service Worker
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.addEventListener('message', this.handleServiceWorkerMessage.bind(this));
        }

        this.updateOnlineStatus();
        
        // Периодическая проверка соединения
        setInterval(() => this.checkConnection(), 30000);
    }

    handleOnline() {
        console.log('📱 Приложение онлайн, запускаем синхронизацию...');
        this.isOnline = true;
        this.updateOnlineStatus();
        this.syncPendingMessages();
        this.showOnlineNotification();
    }

    handleOffline() {
        console.log('📱 Приложение оффлайн');
        this.isOnline = false;
        this.updateOnlineStatus();
        this.showOfflineNotification();
    }

    handleServiceWorkerMessage(event) {
        if (event.data && event.data.type === 'SYNC_PENDING_MESSAGES') {
            this.syncPendingMessages();
        }
    }

    updateOnlineStatus() {
        const indicator = document.getElementById('offlineIndicator');
        if (!indicator) {
            this.createStatusIndicator();
            return;
        }
        
        if (this.isOnline) {
            indicator.style.display = 'none';
        } else {
            indicator.style.display = 'flex';
            indicator.innerHTML = `
                <i class="fas fa-wifi-slash"></i>
                <span>Оффлайн режим. Сообщения будут отправлены при восстановлении связи.</span>
            `;
        }
    }

    createStatusIndicator() {
        const indicator = document.createElement('div');
        indicator.id = 'offlineIndicator';
        indicator.className = 'offline-indicator';
        indicator.style.cssText = `
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            background: #ff9800;
            color: white;
            padding: 12px 20px;
            text-align: center;
            z-index: 10000;
            font-size: 14px;
            align-items: center;
            justify-content: center;
            gap: 10px;
        `;
        document.body.appendChild(indicator);
        this.updateOnlineStatus();
    }

    showOnlineNotification() {
        showNotification('Соединение восстановлено', 'Вы снова онлайн!', 'success', 3000);
    }

    showOfflineNotification() {
        showNotification('Нет соединения', 'Работаем в оффлайн режиме', 'warning', 5000);
    }

    showSyncIndicator() {
        let indicator = document.getElementById('syncIndicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'syncIndicator';
            indicator.className = 'sync-indicator';
            indicator.style.cssText = `
                display: none;
                position: fixed;
                top: 50px;
                left: 0;
                right: 0;
                background: #2196f3;
                color: white;
                padding: 12px 20px;
                text-align: center;
                z-index: 10000;
                font-size: 14px;
            `;
            document.body.appendChild(indicator);
        }
        
        indicator.innerHTML = `
            <i class="fas fa-sync-alt fa-spin"></i>
            <span>Синхронизация сообщений...</span>
        `;
        indicator.style.display = 'flex';
    }

    hideSyncIndicator() {
        const indicator = document.getElementById('syncIndicator');
        if (indicator) {
            indicator.style.display = 'none';
        }
    }

    // Синхронизация ожидающих сообщений
    async syncPendingMessages() {
        if (this.syncInProgress || !this.isOnline || !authToken) {
            return;
        }

        this.syncInProgress = true;
        this.showSyncIndicator();

        try {
            const pendingMessages = await this.getPendingMessages();
            console.log(`📱 Найдено ${pendingMessages.length} сообщений для синхронизации`);

            let successCount = 0;
            let errorCount = 0;

            for (const message of pendingMessages) {
                try {
                    await this.sendPendingMessage(message);
                    await this.removePendingMessage(message.id);
                    successCount++;
                    console.log('✅ Сообщение синхронизировано:', message.id);
                } catch (error) {
                    console.error('❌ Ошибка синхронизации сообщения:', message.id, error);
                    errorCount++;
                }
            }

            // После синхронизации обновляем чаты
            if (successCount > 0) {
                if (typeof loadChats === 'function') {
                    await loadChats();
                }
                
                showNotification('Синхронизация', 
                    `Успешно отправлено: ${successCount}${errorCount > 0 ? `, с ошибками: ${errorCount}` : ''}`, 
                    errorCount > 0 ? 'warning' : 'success'
                );
            }

        } catch (error) {
            console.error('❌ Ошибка синхронизации:', error);
            showNotification('Ошибка', 'Не удалось синхронизировать сообщения', 'error');
        } finally {
            this.syncInProgress = false;
            this.hideSyncIndicator();
        }
    }

    // Получение ожидающих сообщений
    async getPendingMessages() {
        try {
            if (offlineDB && typeof offlineDB.getPendingMessages === 'function') {
                return await offlineDB.getPendingMessages();
            }
            return [];
        } catch (error) {
            console.error('Ошибка получения ожидающих сообщений:', error);
            return [];
        }
    }

    // Отправка одного ожидающего сообщения
    async sendPendingMessage(message) {
        const messageData = {
            text: message.text,
            message_type: message.message_type || 'text'
        };

        // Добавляем файловые данные если есть
        if (message.file_url) {
            messageData.file_url = message.file_url;
            messageData.file_name = message.file_name;
            messageData.file_size = message.file_size;
            messageData.file_type = message.file_type;
        }

        // Добавляем голосовые данные если есть
        if (message.voice_url) {
            messageData.voice_url = message.voice_url;
            messageData.voice_duration = message.voice_duration;
        }

        const response = await apiRequest(`/messages/${message.chatId}`, {
            method: 'POST',
            body: JSON.stringify(messageData)
        });

        return response;
    }

    // Удаление отправленного сообщения
    async removePendingMessage(id) {
        try {
            if (offlineDB && typeof offlineDB.removePendingMessage === 'function') {
                return await offlineDB.removePendingMessage(id);
            }
        } catch (error) {
            console.error('Ошибка удаления сообщения:', error);
        }
    }

    // Проверка возможности отправки сообщения
    async sendMessageWithOfflineSupport(chatId, messageData) {
        if (this.isOnline && authToken) {
            try {
                // Пытаемся отправить онлайн
                const result = await apiRequest(`/messages/${chatId}`, {
                    method: 'POST',
                    body: JSON.stringify(messageData)
                });
                return result;
            } catch (error) {
                console.log('🌐 Ошибка отправки, сохраняем для оффлайн:', error);
                // Если ошибка, сохраняем для оффлайн
                return await this.saveMessageForOffline(chatId, messageData);
            }
        } else {
            // Сохраняем для оффлайн отправки
            return await this.saveMessageForOffline(chatId, messageData);
        }
    }

    // Сохранение сообщения для оффлайн-отправки
    async saveMessageForOffline(chatId, messageData) {
        try {
            const pendingMessage = {
                chatId: chatId,
                text: messageData.text,
                message_type: messageData.message_type || 'text',
                file_url: messageData.file_url,
                file_name: messageData.file_name,
                file_size: messageData.file_size,
                file_type: messageData.file_type,
                voice_url: messageData.voice_url,
                voice_duration: messageData.voice_duration,
                timestamp: Date.now(),
                status: 'pending'
            };

            let messageId;
            if (offlineDB && typeof offlineDB.savePendingMessage === 'function') {
                messageId = await offlineDB.savePendingMessage(pendingMessage);
            } else {
                // Fallback: сохраняем в localStorage
                messageId = Date.now();
                const pendingMessages = JSON.parse(localStorage.getItem('pendingMessages') || '[]');
                pendingMessages.push({...pendingMessage, id: messageId});
                localStorage.setItem('pendingMessages', JSON.stringify(pendingMessages));
            }

            // Создаем локальное сообщение для отображения
            const localMessage = {
                id: `offline_${messageId}`,
                text: messageData.text,
                status: 'pending',
                created_at: new Date().toISOString(),
                sender_id: currentUser.id,
                sender_name: currentUser.name,
                sender_avatar: currentUser.avatar,
                message_type: messageData.message_type || 'text',
                file_url: messageData.file_url,
                file_name: messageData.file_name,
                file_size: messageData.file_size,
                file_type: messageData.file_type,
                voice_url: messageData.voice_url,
                voice_duration: messageData.voice_duration
            };

            // Запрашиваем фоновую синхронизацию
            if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                try {
                    await navigator.serviceWorker.ready.then(registration => {
                        return registration.sync.register('background-sync');
                    });
                    console.log('🔄 Фоновая синхронизация зарегистрирована');
                } catch (error) {
                    console.log('⚠️ Фоновая синхронизация не доступна:', error);
                }
            }

            showNotification('Оффлайн', 'Сообщение сохранено и будет отправлено при восстановлении связи', 'info');

            return { message: localMessage, offline: true };

        } catch (error) {
            console.error('❌ Ошибка сохранения оффлайн сообщения:', error);
            throw error;
        }
    }

    // Загрузка чатов с оффлайн-поддержкой
    async loadChatsWithOfflineSupport() {
        try {
            const data = await apiRequest('/chats');
            return data;
        } catch (error) {
            console.log('📱 Ошибка загрузки чатов:', error);
            return { chats: [], fromCache: true };
        }
    }

    // Загрузка сообщений с оффлайн-поддержкой
    async loadMessagesWithOfflineSupport(chatId) {
        try {
            const data = await apiRequest(`/messages/${chatId}`);
            return data;
        } catch (error) {
            console.log('📱 Ошибка загрузки сообщений:', error);
            return { messages: [], fromCache: true };
        }
    }

    // Проверка соединения
    async checkConnection() {
        try {
            if (!authToken) return;
            
            const response = await fetch('/api/auth/verify', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });
            
            if (!response.ok) {
                throw new Error('Connection failed');
            }
            
            if (!this.isOnline) {
                this.isOnline = true;
                this.updateOnlineStatus();
            }
        } catch (error) {
            if (this.isOnline) {
                this.isOnline = false;
                this.updateOnlineStatus();
            }
        }
    }

    // Получение статуса синхронизации
    getSyncStatus() {
        return {
            isOnline: this.isOnline,
            syncInProgress: this.syncInProgress
        };
    }

    // Принудительная синхронизация
    async forceSync() {
        if (this.syncInProgress) {
            showNotification('Синхронизация', 'Синхронизация уже выполняется', 'info');
            return;
        }
        
        showNotification('Синхронизация', 'Запуск принудительной синхронизации...', 'info');
        await this.syncPendingMessages();
    }
}

// Создаем глобальный экземпляр
const syncManager = new SyncManager();

// Глобальные функции для управления синхронизацией
window.syncManager = syncManager;
window.forceSync = () => syncManager.forceSync();