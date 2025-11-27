// Загрузка данных для админ-панели
async function loadAdminData() {
    try {
        await loadStatistics();
        await loadUsers();
        await loadAdminMessages();
        await loadDevices();
    } catch (error) {
        console.error('Ошибка загрузки данных админ-панели:', error);
        showNotification('Ошибка', 'Не удалось загрузить данные админ-панели', 'error');
    }
}

// Загрузка статистики
async function loadStatistics() {
    try {
        const data = await apiRequest('/admin/statistics');
        
        if (data) {
            document.getElementById('totalUsers').textContent = data.totalUsers || 0;
            document.getElementById('totalChats').textContent = data.totalChats || 0;
            document.getElementById('totalMessages').textContent = data.totalMessages || 0;
            document.getElementById('totalDevices').textContent = data.totalDevices || 0;
        }
    } catch (error) {
        console.error('Ошибка загрузки статистики:', error);
        // Устанавливаем значения по умолчанию
        document.getElementById('totalUsers').textContent = '0';
        document.getElementById('totalChats').textContent = '0';
        document.getElementById('totalMessages').textContent = '0';
        document.getElementById('totalDevices').textContent = '0';
    }
}

// Загрузка пользователей
async function loadUsers() {
    try {
        const data = await apiRequest('/admin/users');
        const usersTableBody = document.getElementById('usersTableBody');
        
        if (!usersTableBody) return;

        usersTableBody.innerHTML = '';

        if (data.users && data.users.length > 0) {
            data.users.forEach(user => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${user.id}</td>
                    <td>
                        <img src="${user.avatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.name) + '&background=6A5ACD&color=ffffff'}" 
                             class="admin-user-avatar" alt="${user.name}">
                    </td>
                    <td>${user.name}</td>
                    <td>${user.email}</td>
                    <td>
                        <span class="status-badge ${user.online ? 'online' : 'offline'}">
                            ${user.online ? 'онлайн' : 'оффлайн'}
                        </span>
                    </td>
                    <td>
                        <div class="admin-actions">
                            <button class="btn btn-small btn-danger" onclick="deleteUser(${user.id})">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                `;
                usersTableBody.appendChild(row);
            });
        } else {
            usersTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Нет пользователей</td></tr>';
        }
    } catch (error) {
        console.error('Ошибка загрузки пользователей:', error);
        const usersTableBody = document.getElementById('usersTableBody');
        if (usersTableBody) {
            usersTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #ff4444;">Ошибка загрузки</td></tr>';
        }
    }
}

// Загрузка сообщений для админ-панели
async function loadAdminMessages() {
    try {
        const data = await apiRequest('/admin/messages');
        const adminMessagesView = document.getElementById('adminMessagesView');
        
        if (!adminMessagesView) return;

        adminMessagesView.innerHTML = '';

        if (data.messages && data.messages.length > 0) {
            data.messages.forEach(message => {
                const messageElement = document.createElement('div');
                messageElement.className = 'admin-message';
                messageElement.innerHTML = `
                    <div class="admin-message-header">
                        <strong>${message.sender_name}</strong>
                        <span class="admin-message-time">${new Date(message.created_at).toLocaleString('ru-RU')}</span>
                    </div>
                    <div class="admin-message-content">
                        ${message.text || 'Сообщение без текста'}
                        ${message.file_url ? `<div><small>Файл: ${message.file_name}</small></div>` : ''}
                    </div>
                    <div class="admin-message-actions">
                        <button class="btn btn-small btn-danger" onclick="deleteMessage(${message.id})">
                            <i class="fas fa-trash"></i> Удалить
                        </button>
                    </div>
                `;
                adminMessagesView.appendChild(messageElement);
            });
        } else {
            adminMessagesView.innerHTML = '<div style="text-align: center; padding: 40px; color: #666;">Нет сообщений</div>';
        }
    } catch (error) {
        console.error('Ошибка загрузки сообщений:', error);
        const adminMessagesView = document.getElementById('adminMessagesView');
        if (adminMessagesView) {
            adminMessagesView.innerHTML = '<div style="text-align: center; padding: 40px; color: #ff4444;">Ошибка загрузки сообщений</div>';
        }
    }
}

// Загрузка устройств
async function loadDevices() {
    try {
        const data = await apiRequest('/admin/devices');
        const devicesTableBody = document.getElementById('devicesTableBody');
        
        if (!devicesTableBody) return;

        devicesTableBody.innerHTML = '';

        if (data.devices && data.devices.length > 0) {
            data.devices.forEach(device => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${device.deviceId}</td>
                    <td>${device.accountsCount || 0}</td>
                    <td>${new Date(device.createdAt).toLocaleDateString('ru-RU')}</td>
                    <td>
                        <div class="admin-actions">
                            <button class="btn btn-small btn-danger" onclick="deleteDevice('${device.deviceId}')">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                `;
                devicesTableBody.appendChild(row);
            });
        } else {
            devicesTableBody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Нет устройств</td></tr>';
        }
    } catch (error) {
        console.error('Ошибка загрузки устройств:', error);
        const devicesTableBody = document.getElementById('devicesTableBody');
        if (devicesTableBody) {
            devicesTableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #ff4444;">Ошибка загрузки</td></tr>';
        }
    }
}

// Удаление пользователя
async function deleteUser(userId) {
    if (!confirm('Вы уверены, что хотите удалить этого пользователя?')) {
        return;
    }

    try {
        await apiRequest(`/admin/users/${userId}`, {
            method: 'DELETE'
        });
        
        showNotification('Успех', 'Пользователь удален', 'success');
        loadUsers();
        loadStatistics();
    } catch (error) {
        console.error('Ошибка удаления пользователя:', error);
        showNotification('Ошибка', 'Не удалось удалить пользователя', 'error');
    }
}

// Удаление сообщения
async function deleteMessage(messageId) {
    if (!confirm('Вы уверены, что хотите удалить это сообщение?')) {
        return;
    }

    try {
        await apiRequest(`/admin/messages/${messageId}`, {
            method: 'DELETE'
        });
        
        showNotification('Успех', 'Сообщение удалено', 'success');
        loadAdminMessages();
        loadStatistics();
    } catch (error) {
        console.error('Ошибка удаления сообщения:', error);
        showNotification('Ошибка', 'Не удалось удалить сообщение', 'error');
    }
}

// Удаление устройства
async function deleteDevice(deviceId) {
    if (!confirm('Вы уверены, что хотите удалить это устройство?')) {
        return;
    }

    try {
        await apiRequest(`/admin/devices/${deviceId}`, {
            method: 'DELETE'
        });
        
        showNotification('Успех', 'Устройство удалено', 'success');
        loadDevices();
        loadStatistics();
    } catch (error) {
        console.error('Ошибка удаления устройства:', error);
        showNotification('Ошибка', 'Не удалось удалить устройство', 'error');
    }
}

// Инициализация админ-панели
function initAdminPanel() {
    // Переключение вкладок
    const adminTabs = document.querySelectorAll('.admin-tab');
    adminTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.getAttribute('data-tab');
            switchAdminTab(tabName);
        });
    });

    // Обновление данных каждые 30 секунд
    setInterval(() => {
        loadAdminData();
    }, 30000);
}

// Переключение вкладок админ-панели
function switchAdminTab(tabName) {
    // Деактивируем все вкладки
    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Скрываем все содержимое вкладок
    document.querySelectorAll('.admin-tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    // Активируем выбранную вкладку
    const activeTab = document.querySelector(`.admin-tab[data-tab="${tabName}"]`);
    const activeContent = document.getElementById(`${tabName}Tab`);
    
    if (activeTab && activeContent) {
        activeTab.classList.add('active');
        activeContent.classList.add('active');
    }
}

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('adminContainer').style.display === 'flex') {
        initAdminPanel();
        loadAdminData();
    }
});