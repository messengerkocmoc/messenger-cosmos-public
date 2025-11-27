let emojiPanelVisible = false;
// Emoji данные
const EMOJIS = ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🫣', '🤗', '🫡', '🤔', '🫢', '🤭', '🤫', '🤥', '😶', '🫠', '😐', '🫤', '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🫥', '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '😈', '👿', '👹', '👺', '🤡', '💩', '👻', '💀', '☠️', '👽', '👾', '🤖', '🎃', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾'];

// Инициализация чата
function initChat() {
    initEmojiPanel();
    initMobileNavigation();
    initMessageInput();
    initEventListeners();
    initModals();
    initSearch();
    initCallButtons();
}

function initEmojiPanel() {
    const emojiPanel = document.getElementById('emojiPanel');
    if (!emojiPanel) return;

    emojiPanel.innerHTML = EMOJIS.map(emoji => 
        `<div class="emoji-item" data-emoji="${emoji}">${emoji}</div>`
    ).join('');

    emojiPanel.addEventListener('click', (e) => {
        if (e.target.classList.contains('emoji-item')) {
            const emoji = e.target.getAttribute('data-emoji');
            insertEmoji(emoji);
        }
    });
}

function insertEmoji(emoji) {
    const messageInput = document.getElementById('messageInput');
    if (!messageInput) return;

    const start = messageInput.selectionStart;
    const end = messageInput.selectionEnd;
    const text = messageInput.value;
    messageInput.value = text.substring(0, start) + emoji + text.substring(end);
    messageInput.focus();
    messageInput.selectionStart = messageInput.selectionEnd = start + emoji.length;
    autoResizeTextarea(messageInput);
}

function autoResizeTextarea(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
}

function initMobileNavigation() {
    const mobileNavItems = document.querySelectorAll('.mobile-nav-item');
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const mobileSearchBtn = document.getElementById('mobileSearchBtn');

    // Нижняя мобильная навигация (Чаты / Контакты / Группы / Профиль)
    if (mobileNavItems && mobileNavItems.length > 0) {
        mobileNavItems.forEach((item) => {
            item.addEventListener('click', () => {
                mobileNavItems.forEach((navItem) => navItem.classList.remove('active'));
                item.classList.add('active');

                const tab = item.getAttribute('data-tab') || 'chats';
                handleMobileNavigation(tab);
            });
        });

        // Активируем текущий таб при загрузке
        let activeItem = document.querySelector('.mobile-nav-item.active');
        if (!activeItem) {
            activeItem = mobileNavItems[0];
            if (activeItem) {
                activeItem.classList.add('active');
            }
        }

        if (activeItem) {
            const activeTab = activeItem.getAttribute('data-tab') || 'chats';
            handleMobileNavigation(activeTab);
        }
    }

    // Бургер в мобильном хедере
    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', () => {
            if (typeof toggleSidebar === 'function') {
                toggleSidebar();
            } else {
                const sidebar = document.getElementById('sidebar');
                if (sidebar) {
                    sidebar.classList.toggle('active');
                }
            }
        });
    }

    // Поиск в мобильном хедере
    if (mobileSearchBtn) {
        mobileSearchBtn.addEventListener('click', () => {
            const searchInput = document.getElementById('searchInput') || document.getElementById('chatSearchInput');
            if (searchInput) {
                searchInput.focus();
            }
        });
    }
}
function handleMobileNavigation(tab) {
    const sectionTitle = document.getElementById('mobileSectionTitle');
    if (sectionTitle) {
        switch(tab) {
            case 'chats':
                sectionTitle.textContent = 'Чаты';
                break;
            case 'contacts':
                sectionTitle.textContent = 'Контакты';
                break;
            case 'groups':
                sectionTitle.textContent = 'Группы';
                break;
            case 'profile':
                sectionTitle.textContent = 'Профиль';
                break;
        }
    }


    switch(tab) {
        case 'chats':
            showChats();
            break;
        case 'contacts':
            showContacts();
            break;
        case 'groups':
            showGroups();
            break;
        case 'profile':
            showProfile();
            break;
    }
}

function showProfile() {
    const settingsModal = document.getElementById('settingsModal');
    if (settingsModal) {
        settingsModal.style.display = 'flex';
    }
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        sidebar.classList.toggle('active');
        
        // Добавляем анимацию
        if (sidebar.classList.contains('active')) {
            sidebar.style.transform = 'translateX(0)';
        } else {
            sidebar.style.transform = 'translateX(-100%)';
        }
    }
}

function initMessageInput() {
    const messageInput = document.getElementById('messageInput');
    if (!messageInput) return;

    messageInput.addEventListener('input', function() {
        autoResizeTextarea(this);
    });

    messageInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Автофокус на поле ввода при открытии чата
    messageInput.addEventListener('focus', function() {
        this.parentElement.classList.add('focused');
    });

    messageInput.addEventListener('blur', function() {
        this.parentElement.classList.remove('focused');
    });
}

function initEventListeners() {
    const emojiBtn = document.getElementById('emojiBtn');
    if (emojiBtn) {
        emojiBtn.addEventListener('click', toggleEmojiPanel);
    }

    // Закрытие emoji panel при клике вне его
    document.addEventListener('click', (e) => {
        const emojiPanel = document.getElementById('emojiPanel');
        const emojiBtn = document.getElementById('emojiBtn');
        
        if (emojiPanel && emojiBtn && 
            !emojiPanel.contains(e.target) && 
            !emojiBtn.contains(e.target) &&
            emojiPanelVisible) {
            hideEmojiPanel();
        }
    });

    const sendMessageBtn = document.getElementById('sendMessageBtn');
    if (sendMessageBtn) {
        sendMessageBtn.addEventListener('click', sendMessage);
    }

    const refreshChatBtn = document.getElementById('refreshChatBtn');
    if (refreshChatBtn) {
        refreshChatBtn.addEventListener('click', () => {
            refreshChatBtn.classList.add('rotating');
            loadChats().finally(() => {
                setTimeout(() => refreshChatBtn.classList.remove('rotating'), 500);
            });
        });
    }

    const newChatSearchBtn = document.getElementById('newChatSearchBtn');
    if (newChatSearchBtn) {
        newChatSearchBtn.addEventListener('click', () => {
            document.getElementById('newChatModal').style.display = 'flex';
            loadUsersForNewChat();
        });
    }

    
    const menuToggle = document.getElementById('menuToggle');
    if (menuToggle) {
        menuToggle.addEventListener('click', () => {
            toggleSidebar();
        });
    }

const allChatsBtn = document.getElementById('allChatsBtn');
    const contactsBtn = document.getElementById('contactsBtn');
    const groupsBtn = document.getElementById('groupsBtn');
    const settingsBtn = document.getElementById('settingsBtn');

    if (allChatsBtn) {
        allChatsBtn.addEventListener('click', () => {
            updateNavActiveState(allChatsBtn);
            loadChats();
        });
    }

    if (contactsBtn) {
        contactsBtn.addEventListener('click', () => {
            updateNavActiveState(contactsBtn);
            showContacts();
        });
    }

    if (groupsBtn) {
        groupsBtn.addEventListener('click', () => {
            updateNavActiveState(groupsBtn);
            showGroups();
        });
    }

    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            updateNavActiveState(settingsBtn);
            showProfile();
        });
    }

    window.addEventListener('resize', handleResize);

    document.querySelector('.main-content').addEventListener('click', () => {
        if (window.innerWidth <= 768) {
            const sidebar = document.getElementById('sidebar');
            if (sidebar) {
                sidebar.classList.remove('active');
            }
        }
    });

    // Меню переключения аккаунта
    const switchAccountBtn = document.getElementById('switchAccountBtn');
    if (switchAccountBtn) {
        switchAccountBtn.addEventListener('click', () => {
            document.getElementById('accountSwitchModal').style.display = 'flex';
            loadAccounts();
        });
    }

    // Админ кнопка
    const adminFloatBtn = document.getElementById('adminFloatBtn');
    if (adminFloatBtn) {
        adminFloatBtn.addEventListener('click', showAdminPanel);
    }
}

function updateNavActiveState(activeButton) {
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    activeButton.classList.add('active');
}

async function initModals() {
    // Новый чат модальное окно
    const closeNewChatModal = document.getElementById('closeNewChatModal');
    const newChatModal = document.getElementById('newChatModal');
    
    if (closeNewChatModal && newChatModal) {
        closeNewChatModal.addEventListener('click', () => {
            newChatModal.style.display = 'none';
        });
    }

    const createChatBtn = document.getElementById('createChatBtn');
    if (createChatBtn) {
        createChatBtn.addEventListener('click', async () => {
            const userSelect = document.getElementById('userSelect');
            const selectedUserId = userSelect.value;

            if (!selectedUserId) {
                showNotification('Ошибка', 'Выберите пользователя', 'error');
                return;
            }

            try {
                createChatBtn.disabled = true;
                createChatBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Создание...';

                const data = await apiRequest('/chats', {
                    method: 'POST',
                    body: JSON.stringify({
                        participantIds: [selectedUserId],
                        type: 'personal'
                    })
                });

                newChatModal.style.display = 'none';
                showNotification('Чат создан', 'Новый чат успешно создан', 'success');
                loadChats();
                
                if (data.chat && data.chat.id) {
                    openChat(data.chat.id);
                }
            } catch (error) {
                console.error('Error creating chat:', error);
                showNotification('Ошибка', 'Не удалось создать чат', 'error');
            } finally {
                createChatBtn.disabled = false;
                createChatBtn.innerHTML = 'Создать чат';
            }
        });
    }

    // Создание группового чата
    const createGroupBtn = document.getElementById('createGroupBtn');
    if (createGroupBtn) {
        createGroupBtn.addEventListener('click', createGroupChat);
    }
}

function initSearch() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        let searchTimeout;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                performSearch(e.target.value);
            }, 300);
        });

        // Очистка поиска
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                searchInput.value = '';
                performSearch('');
            }
        });
    }
}

function performSearch(query) {
    const chatsList = document.getElementById('chatsList');
    if (!chatsList) return;

    const chatItems = chatsList.querySelectorAll('.chat-item');
    const searchTerm = query.toLowerCase().trim();

    if (!searchTerm) {
        chatItems.forEach(item => item.style.display = 'flex');
        return;
    }

    chatItems.forEach(item => {
        const chatName = item.querySelector('.chat-name span').textContent.toLowerCase();
        const lastMessage = item.querySelector('.chat-last-message').textContent.toLowerCase();
        
        if (chatName.includes(searchTerm) || lastMessage.includes(searchTerm)) {
            item.style.display = 'flex';
            // Подсветка совпадений
            highlightText(item, searchTerm);
        } else {
            item.style.display = 'none';
        }
    });
}

function highlightText(element, searchTerm) {
    const textElements = element.querySelectorAll('.chat-name span, .chat-last-message');
    textElements.forEach(el => {
        const text = el.textContent;
        const regex = new RegExp(`(${searchTerm})`, 'gi');
        const highlighted = text.replace(regex, '<mark>$1</mark>');
        el.innerHTML = highlighted;
    });
}

function initCallButtons() {
    const voiceCallBtn = document.getElementById('voiceCallBtn');
    const videoCallBtn = document.getElementById('videoCallBtn');
    const chatInfoBtn = document.getElementById('chatInfoBtn');

    [voiceCallBtn, videoCallBtn, chatInfoBtn].forEach(btn => {
        if (btn) {
            btn.addEventListener('click', () => {
                showFeatureModal();
            });
        }
    });
}

function showFeatureModal() {
    const featureModal = document.getElementById('featureModal');
    if (featureModal) {
        featureModal.style.display = 'flex';
    }
}

function toggleEmojiPanel() {
    const emojiPanel = document.getElementById('emojiPanel');
    if (!emojiPanel) return;

    if (emojiPanelVisible) {
        hideEmojiPanel();
    } else {
        showEmojiPanel();
    }
}

function showEmojiPanel() {
    const emojiPanel = document.getElementById('emojiPanel');
    if (!emojiPanel) return;
    
    emojiPanel.style.display = 'grid';
    setTimeout(() => {
        emojiPanel.classList.add('active');
        emojiPanelVisible = true;
    }, 10);
}

function hideEmojiPanel() {
    const emojiPanel = document.getElementById('emojiPanel');
    if (!emojiPanel) return;
    
    emojiPanel.classList.remove('active');
    setTimeout(() => {
        emojiPanel.style.display = 'none';
        emojiPanelVisible = false;
    }, 300);
}

function handleResize() {
    hideEmojiPanel();
    adaptInterface();
}

function adaptInterface() {
    const isMobile = window.innerWidth <= 768;
    const sidebar = document.getElementById('sidebar');
    if (sidebar && isMobile) {
        sidebar.classList.remove('active');
    }
}

// Отправка сообщения
async function sendMessage() {
    const messageInput = document.getElementById('messageInput');
    if (!messageInput) return;

    const text = messageInput.value.trim();
    
    if (!text || !currentChat) {
        if (!currentChat) {
            showNotification('Ошибка', 'Выберите чат для отправки сообщения', 'error');
        }
        return;
    }

    try {
        const sendBtn = document.getElementById('sendMessageBtn');
        sendBtn.disabled = true;
        sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        const data = await apiRequest(`/messages/${currentChat}`, {
            method: 'POST',
            body: JSON.stringify({ text })
        });

        addMessageToChat(data.message);
        messageInput.value = '';
        messageInput.style.height = 'auto';
        scrollToBottom();
        loadChats();
        hideEmojiPanel();
        
    } catch (error) {
        console.error('Ошибка отправки сообщения:', error);
        showNotification('Ошибка', 'Не удалось отправить сообщение', 'error');
    } finally {
        const sendBtn = document.getElementById('sendMessageBtn');
        sendBtn.disabled = false;
        sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
    }
}

// Показ контактов
async function showContacts() {
    const chatsList = document.getElementById('chatsList');
    if (!chatsList) return;
    
    try {
        const data = await apiRequest('/users');
        chatsList.innerHTML = '';

        if (data.users && data.users.length > 0) {
            data.users.forEach(user => {
                if (!currentUser || user.id !== currentUser.id) {
                    const contactItem = document.createElement('div');
                    contactItem.className = 'chat-item contact-item';
                    contactItem.innerHTML = `
                        <img src="${user.avatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.name) + '&background=6A5ACD&color=ffffff'}" 
                             class="chat-avatar" alt="${user.name}">
                        <div class="chat-info">
                            <div class="chat-name">
                                ${user.name}
                                ${user.online ? '<span class="online-dot"></span>' : ''}
                            </div>
                            <div class="chat-last-message">${user.bio || 'Нет статуса'}</div>
                        </div>
                        <button class="btn-start-chat" onclick="createOrOpenChat(${user.id})">
                            <i class="fas fa-comment"></i>
                        </button>
                    `;

                    chatsList.appendChild(contactItem);
                }
            });
        } else {
            chatsList.innerHTML = '<div class="empty-state">Нет контактов</div>';
        }
    } catch (error) {
        console.error('Ошибка загрузки контактов:', error);
        showNotification('Ошибка', 'Не удалось загрузить контакты', 'error');
    }
}

// Показ групп
async function showGroups() {
    const chatsList = document.getElementById('chatsList');
    if (!chatsList) return;
    
    try {
        const data = await apiRequest('/chats');
        chatsList.innerHTML = '';

        const groupChats = data.chats ? data.chats.filter(chat => chat.type === 'group') : [];
        
        if (groupChats.length > 0) {
            groupChats.forEach(chat => {
                addChatToSidebar(chat);
            });
        } else {
            chatsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-users"></i>
                    <p>У вас пока нет групповых чатов</p>
                    <button class="btn" id="createFirstGroup">
                        <i class="fas fa-plus"></i> Создать первую группу
                    </button>
                </div>
            `;

            document.getElementById('createFirstGroup').addEventListener('click', () => {
                showCreateGroupModal();
            });
        }
    } catch (error) {
        console.error('Ошибка загрузки групп:', error);
        showNotification('Ошибка', 'Не удалось загрузить группы', 'error');
    }
}

// Создание группового чата
async function createGroupChat() {
    const groupNameInput = document.getElementById('groupNameInput');
    const groupMembersSelect = document.getElementById('groupMembersSelect');
    
    if (!groupNameInput || !groupMembersSelect) return;

    const groupName = groupNameInput.value.trim();
    const selectedOptions = Array.from(groupMembersSelect.selectedOptions).map(option => option.value);

    if (!groupName) {
        showNotification('Ошибка', 'Введите название группы', 'error');
        return;
    }

    if (selectedOptions.length === 0) {
        showNotification('Ошибка', 'Выберите участников группы', 'error');
        return;
    }

    try {
        const createGroupBtn = document.getElementById('createGroupBtn');
        createGroupBtn.disabled = true;
        createGroupBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Создание...';

        const data = await apiRequest('/chats', {
            method: 'POST',
            body: JSON.stringify({
                name: groupName,
                participantIds: selectedOptions,
                type: 'group'
            })
        });

        document.getElementById('createGroupModal').style.display = 'none';
        showNotification('Группа создана', 'Новая группа успешно создана', 'success');
        loadChats();
        
        if (data.chat && data.chat.id) {
            openChat(data.chat.id);
        }

        // Очищаем форму
        groupNameInput.value = '';
        groupMembersSelect.selectedIndex = -1;
        
    } catch (error) {
        console.error('Error creating group:', error);
        
        if (error.message.includes('groups limit')) {
            showNotification('Ошибка', 'Вы можете создать не более 3 групп', 'error');
        } else {
            showNotification('Ошибка', 'Не удалось создать группу', 'error');
        }
    } finally {
        const createGroupBtn = document.getElementById('createGroupBtn');
        createGroupBtn.disabled = false;
        createGroupBtn.innerHTML = 'Создать группу';
    }
}

// Показ модального окна создания группы
function showCreateGroupModal() {
    const modal = document.getElementById('createGroupModal');
    if (!modal) return;

    modal.style.display = 'flex';
    loadUsersForGroup();
}

// Загрузка пользователей для создания группы
async function loadUsersForGroup() {
    try {
        const data = await apiRequest('/users');
        const groupMembersSelect = document.getElementById('groupMembersSelect');
        
        if (!groupMembersSelect) return;

        groupMembersSelect.innerHTML = '';

        if (data.users && data.users.length > 0) {
            data.users.forEach(user => {
                if (!currentUser || user.id !== currentUser.id) {
                    const option = document.createElement('option');
                    option.value = user.id;
                    option.textContent = user.name;
                    groupMembersSelect.appendChild(option);
                }
            });
        }
    } catch (error) {
        console.error('Error loading users for group:', error);
    }
}

// Загрузка пользователей для нового чата
async function loadUsersForNewChat() {
    try {
        const data = await apiRequest('/users');
        const userSelect = document.getElementById('userSelect');
        userSelect.innerHTML = '';

        if (data.users && data.users.length > 0) {
            data.users.forEach(user => {
                if (!currentUser || user.id !== currentUser.id) {
                    const option = document.createElement('option');
                    option.value = user.id;
                    option.textContent = user.name;
                    userSelect.appendChild(option);
                }
            });
        } else {
            userSelect.innerHTML = '<option value="">Нет доступных пользователей</option>';
        }
    } catch (error) {
        console.error('Error loading users:', error);
        userSelect.innerHTML = '<option value="">Ошибка загрузки</option>';
    }
}

// Создание или открытие чата
async function createOrOpenChat(userId) {
    try {
        const data = await apiRequest('/chats', {
            method: 'POST',
            body: JSON.stringify({ 
                participantIds: [userId],
                type: 'personal'
            })
        });

        showNotification('Чат создан', 'Новый чат успешно создан', 'success');
        loadChats();
        
        if (data.chat && data.chat.id) {
            openChat(data.chat.id);
        }
    } catch (error) {
        console.error('Error creating chat:', error);
        showNotification('Ошибка', 'Не удалось создать чат', 'error');
    }
}

// Показ чатов
function showChats() {
    loadChats();
}

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', () => {
    initChat();
});

// Глобальные функции
window.createOrOpenChat = createOrOpenChat;
window.showFeatureModal = showFeatureModal;