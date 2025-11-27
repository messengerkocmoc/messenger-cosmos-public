// Управление IndexedDB для оффлайн-режима
class OfflineDB {
    constructor() {
        this.dbName = 'kocmocMessengerDB';
        this.version = 3;
        this.db = null;
        this.init();
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = () => {
                console.error('Ошибка открытия IndexedDB:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('IndexedDB успешно открыта');
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                this.createStores(db);
            };
        });
    }

    createStores(db) {
        // Хранилище для ожидающих сообщений
        if (!db.objectStoreNames.contains('pendingMessages')) {
            const pendingStore = db.createObjectStore('pendingMessages', { 
                keyPath: 'id', 
                autoIncrement: true 
            });
            pendingStore.createIndex('chatId', 'chatId', { unique: false });
            pendingStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // Хранилище для кэша чатов
        if (!db.objectStoreNames.contains('chatsCache')) {
            const chatsStore = db.createObjectStore('chatsCache', { keyPath: 'id' });
            chatsStore.createIndex('lastUpdate', 'lastUpdate', { unique: false });
        }

        // Хранилище для кэша сообщений
        if (!db.objectStoreNames.contains('messagesCache')) {
            const messagesStore = db.createObjectStore('messagesCache', { keyPath: 'id' });
            messagesStore.createIndex('chatId', 'chatId', { unique: false });
            messagesStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // Хранилище для настроек
        if (!db.objectStoreNames.contains('settings')) {
            const settingsStore = db.createObjectStore('settings', { keyPath: 'key' });
        }
    }

    // Сохранение сообщения в оффлайн-хранилище
    async savePendingMessage(messageData) {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['pendingMessages'], 'readwrite');
            const store = transaction.objectStore('pendingMessages');
            
            const message = {
                ...messageData,
                timestamp: Date.now(),
                status: 'pending'
            };

            const request = store.add(message);

            request.onsuccess = () => {
                console.log('Сообщение сохранено для оффлайн-отправки:', request.result);
                resolve(request.result);
            };

            request.onerror = () => {
                console.error('Ошибка сохранения сообщения:', request.error);
                reject(request.error);
            };
        });
    }

    // Получение всех ожидающих сообщений
    async getPendingMessages() {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['pendingMessages'], 'readonly');
            const store = transaction.objectStore('pendingMessages');
            const request = store.getAll();

            request.onsuccess = () => {
                resolve(request.result || []);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    // Удаление отправленного сообщения из ожидающих
    async removePendingMessage(id) {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['pendingMessages'], 'readwrite');
            const store = transaction.objectStore('pendingMessages');
            const request = store.delete(id);

            request.onsuccess = () => {
                resolve(true);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    // Кэширование списка чатов
    async cacheChats(chats) {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['chatsCache'], 'readwrite');
            const store = transaction.objectStore('chatsCache');
            
            // Очищаем старые данные
            store.clear();

            // Сохраняем новые
            chats.forEach(chat => {
                chat.lastUpdate = Date.now();
                store.add(chat);
            });

            transaction.oncomplete = () => {
                resolve(true);
            };

            transaction.onerror = () => {
                reject(transaction.error);
            };
        });
    }

    // Получение кэшированных чатов
    async getCachedChats() {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['chatsCache'], 'readonly');
            const store = transaction.objectStore('chatsCache');
            const request = store.getAll();

            request.onsuccess = () => {
                resolve(request.result || []);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    // Кэширование сообщений чата
    async cacheMessages(chatId, messages) {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['messagesCache'], 'readwrite');
            const store = transaction.objectStore('messagesCache');
            
            // Удаляем старые сообщения этого чата
            const index = store.index('chatId');
            const range = IDBKeyRange.only(chatId);
            const request = index.openCursor(range);

            request.onsuccess = () => {
                const cursor = request.result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                } else {
                    // Сохраняем новые сообщения
                    messages.forEach(message => {
                        message.timestamp = new Date(message.created_at).getTime();
                        store.add(message);
                    });
                }
            };

            transaction.oncomplete = () => {
                resolve(true);
            };

            transaction.onerror = () => {
                reject(transaction.error);
            };
        });
    }

    // Получение кэшированных сообщений чата
    async getCachedMessages(chatId) {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['messagesCache'], 'readonly');
            const store = transaction.objectStore('messagesCache');
            const index = store.index('chatId');
            const request = index.getAll(IDBKeyRange.only(chatId));

            request.onsuccess = () => {
                const messages = (request.result || []).sort((a, b) => a.timestamp - b.timestamp);
                resolve(messages);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    // Сохранение настроек
    async saveSetting(key, value) {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['settings'], 'readwrite');
            const store = transaction.objectStore('settings');
            const request = store.put({ key, value });

            request.onsuccess = () => {
                resolve(true);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    // Получение настроек
    async getSetting(key) {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['settings'], 'readonly');
            const store = transaction.objectStore('settings');
            const request = store.get(key);

            request.onsuccess = () => {
                resolve(request.result ? request.result.value : null);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }
}

// Создаем глобальный экземпляр
const offlineDB = new OfflineDB();