// Переключение между вкладками входа и регистрации
document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', function() {
        // Убираем активный класс у всех вкладок
        document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
        // Добавляем активный класс текущей вкладке
        this.classList.add('active');

        // Скрываем все формы
        document.querySelectorAll('.auth-form').forEach(form => form.classList.remove('active'));
        // Показываем соответствующую форму
        const tabName = this.getAttribute('data-tab');
        const targetForm = document.getElementById(tabName + 'Form');
        if (targetForm) {
            targetForm.classList.add('active');
        }

        const authTabs = document.querySelector('.auth-tabs');
        if (authTabs) {
            authTabs.style.display = 'flex';
        }

        // Очищаем сообщения об ошибках
        clearAuthErrors();
    });
});

let pendingVerification = null;

function clearAuthErrors() {
    const loginError = document.getElementById('loginError');
    const registerError = document.getElementById('registerError');
    const verifyError = document.getElementById('verifyError');

    if (loginError) {
        loginError.textContent = '';
        loginError.style.display = 'none';
    }
    if (registerError) {
        registerError.textContent = '';
        registerError.style.display = 'none';
    }
    if (verifyError) {
        verifyError.textContent = '';
        verifyError.style.display = 'none';
    }
}

function showAuthError(errorElement, message) {
    if (!errorElement) return;
    errorElement.textContent = message;
    errorElement.style.display = 'block';
    errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function validatePassword(password) {
    return password.length >= 6;
}

function validateName(name) {
    return name.trim().length >= 2;
}

function showVerifyStep(email) {
    const authTabs = document.querySelector('.auth-tabs');
    if (authTabs) {
        authTabs.style.display = 'none';
    }

    document.querySelectorAll('.auth-form').forEach(form => form.classList.remove('active'));
    const verifyForm = document.getElementById('verifyEmailForm');
    if (verifyForm) {
        verifyForm.classList.add('active');
    }

    const emailText = document.getElementById('verifyEmailText');
    if (emailText) {
        emailText.textContent = email;
    }

    clearAuthErrors();
}

// Форма входа
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value;
        const loginError = document.getElementById('loginError');
        const deviceId = getDeviceId();

        // Валидация
        if (!email || !password) {
            showAuthError(loginError, 'Пожалуйста, заполните все поля');
            return;
        }

        if (!validateEmail(email)) {
            showAuthError(loginError, 'Введите корректный email адрес');
            return;
        }

        // Показываем loading state
        const submitBtn = loginForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Вход...';
        submitBtn.disabled = true;

        try {
            const data = await apiRequest('/auth/login', {
                method: 'POST',
                body: JSON.stringify({ 
                    email, 
                    password, 
                    deviceId 
                })
            });

            authToken = data.token;
            currentUser = data.user;
            localStorage.setItem('authToken', authToken);

            showNotification('Успешный вход', `Добро пожаловать, ${currentUser.name}!`, 'success');

            if (currentUser.is_admin) {
                showAdminPanel();
            } else {
                showApp();
            }

            loginForm.reset();
            clearAuthErrors();
        } catch (error) {
            console.error('Login error:', error);
            showAuthError(loginError, error.message || 'Ошибка входа. Проверьте email и пароль.');
        } finally {
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    });
}

// Форма регистрации
const registerForm = document.getElementById('registerForm');
if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const name = document.getElementById('registerName').value.trim();
        const email = document.getElementById('registerEmail').value.trim();
        const password = document.getElementById('registerPassword').value;
        const avatar = document.getElementById('registerAvatar').value || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=6A5ACD&color=ffffff`;
        const registerError = document.getElementById('registerError');
        const deviceId = getDeviceId();

        // Валидация
        if (!name || !email || !password) {
            showAuthError(registerError, 'Заполните все обязательные поля');
            return;
        }

        if (!validateName(name)) {
            showAuthError(registerError, 'Имя должно содержать минимум 2 символа');
            return;
        }

        if (!validateEmail(email)) {
            showAuthError(registerError, 'Введите корректный email адрес');
            return;
        }

        if (!validatePassword(password)) {
            showAuthError(registerError, 'Пароль должен содержать минимум 6 символов');
            return;
        }

        // Показываем loading state
        const submitBtn = registerForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Регистрация...';
        submitBtn.disabled = true;

        try {
            const data = await apiRequest('/auth/register', {
                method: 'POST',
                body: JSON.stringify({ 
                    name, 
                    email, 
                    password, 
                    avatar, 
                    deviceId 
                })
            });

            // Сохраняем данные для шага подтверждения и переключаемся на ввод кода
            pendingVerification = {
                userId: data.userId,
                email: data.email
            };

            showNotification('Регистрация почти завершена', 'Мы отправили код подтверждения на вашу почту.', 'info');
            showVerifyStep(data.email);

            registerForm.reset();
            clearAuthErrors();
        } catch (error) {
            console.error('Registration error:', error);
            showAuthError(registerError, error.message || 'Ошибка регистрации. Попробуйте другой email.');
        } finally {
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    });
}

// Форма ввода кода подтверждения email
const verifyEmailForm = document.getElementById('verifyEmailForm');
if (verifyEmailForm) {
    verifyEmailForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const codeInput = document.getElementById('verifyCode');
        const verifyError = document.getElementById('verifyError');
        const code = codeInput ? codeInput.value.trim() : '';
        const deviceId = getDeviceId();

        if (!code) {
            showAuthError(verifyError, 'Введите код из письма');
            return;
        }

        if (!pendingVerification || !pendingVerification.userId) {
            showAuthError(verifyError, 'Сначала завершите регистрацию.');
            return;
        }

        const submitBtn = verifyEmailForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Проверяем...';
        submitBtn.disabled = true;

        try {
            const data = await apiRequest('/auth/verify-email', {
                method: 'POST',
                body: JSON.stringify({
                    userId: pendingVerification.userId,
                    code,
                    deviceId
                })
            });

            authToken = data.token;
            currentUser = data.user;
            localStorage.setItem('authToken', authToken);

            showNotification('Email подтверждён', `Добро пожаловать, ${currentUser.name}!`, 'success');

            // Показываем основное приложение
            if (currentUser.is_admin) {
                showAdminPanel();
            } else if (typeof showApp === 'function') {
                showApp();
            }

            const authContainer = document.getElementById('authContainer');
            const appContainer = document.getElementById('appContainer');
            if (authContainer && appContainer) {
                authContainer.style.display = 'none';
                appContainer.style.display = 'flex';
            }

            pendingVerification = null;
            clearAuthErrors();
        } catch (error) {
            console.error('Verify email error:', error);
            showAuthError(verifyError, error.message || 'Не удалось подтвердить email. Проверьте код и попробуйте снова.');
        } finally {
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    });
}


// Кнопка "Отправить код ещё раз"
const resendCodeBtn = document.getElementById('resendCodeBtn');
if (resendCodeBtn) {
    resendCodeBtn.addEventListener('click', async () => {
        const verifyError = document.getElementById('verifyError');

        if (!pendingVerification || !pendingVerification.email) {
            showAuthError(verifyError, 'Сначала зарегистрируйтесь, чтобы мы знали, куда отправлять код.');
            return;
        }

        const originalText = resendCodeBtn.innerHTML;
        resendCodeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Отправляем...';
        resendCodeBtn.disabled = true;

        try {
            const data = await apiRequest('/auth/resend-code', {
                method: 'POST',
                body: JSON.stringify({
                    email: pendingVerification.email
                })
            });

            showNotification('Код отправлен', data.message || 'Мы снова отправили код на вашу почту.', 'success');
            clearAuthErrors();
        } catch (error) {
            console.error('Resend code error:', error);
            showAuthError(
                verifyError,
                error.message || 'Не удалось отправить код ещё раз. Попробуйте позже.'
            );
        } finally {
            resendCodeBtn.innerHTML = originalText;
            resendCodeBtn.disabled = false;
        }
    });
}

// Выход
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        if (confirm('Вы уверены, что хотите выйти?')) {
            try {
                await apiRequest('/auth/logout', { 
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${authToken}`
                    }
                });
            } catch (error) {
                console.error('Logout error:', error);
            }

            localStorage.removeItem('authToken');
            authToken = null;
            currentUser = null;
            currentChat = null;

            // Останавливаем все медиа потоки
            if (window.mediaRecorder && window.mediaRecorder.state !== 'inactive') {
                window.mediaRecorder.stop();
                if (window.mediaRecorder.stream) {
                    window.mediaRecorder.stream.getTracks().forEach(track => track.stop());
                }
            }

            showAuthScreen();
            showNotification('Выход выполнен', 'Вы успешно вышли из системы', 'info');
        }
    });
}

// Выход из админки
const adminLogoutBtn = document.getElementById('adminLogoutBtn');
if (adminLogoutBtn) {
    adminLogoutBtn.addEventListener('click', async () => {
        if (confirm('Вы уверены, что хотите выйти?')) {
            try {
                await apiRequest('/auth/logout', { 
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${authToken}`
                    }
                });
            } catch (error) {
                console.error('Logout error:', error);
            }

            localStorage.removeItem('authToken');
            authToken = null;
            currentUser = null;

            showAuthScreen();
            showNotification('Выход выполнен', 'Вы успешно вышли из системы', 'info');
        }
    });
}

// Переключение аккаунтов
const switchAccountBtn = document.getElementById('switchAccountBtn');
const accountSwitchModal = document.getElementById('accountSwitchModal');
const closeAccountSwitchModal = document.getElementById('closeAccountSwitchModal');
const accountsList = document.getElementById('accountsList');
const addAccountBtn = document.getElementById('addAccountBtn');

if (switchAccountBtn) {
    switchAccountBtn.addEventListener('click', async () => {
        try {
            await loadAccounts();
            accountSwitchModal.style.display = 'flex';
        } catch (error) {
            console.error('Error opening account switch modal:', error);
            showNotification('Ошибка', 'Не удалось загрузить список аккаунтов', 'error');
        }
    });
}

if (closeAccountSwitchModal) {
    closeAccountSwitchModal.addEventListener('click', () => {
        accountSwitchModal.style.display = 'none';
    });
}

if (addAccountBtn) {
    addAccountBtn.addEventListener('click', () => {
        accountSwitchModal.style.display = 'none';
        
        // Выходим из текущего аккаунта
        localStorage.removeItem('authToken');
        authToken = null;
        currentUser = null;
        
        showAuthScreen();
        showNotification('Добавление аккаунта', 'Войдите или зарегистрируйте новый аккаунт', 'info');
    });
}

// Загрузить аккаунты на устройстве
async function loadAccounts() {
    try {
        const deviceId = getDeviceId();
        const data = await apiRequest(`/auth/accounts/${deviceId}`);
        
        accountsList.innerHTML = '';

        if (data.accounts && data.accounts.length > 0) {
            data.accounts.forEach(account => {
                // Не показываем текущий аккаунт в списке
                if (currentUser && account.email === currentUser.email) {
                    return;
                }

                const accountItem = document.createElement('div');
                accountItem.className = 'account-item';
                accountItem.innerHTML = `
                    <img src="${account.avatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(account.name) + '&background=6A5ACD&color=ffffff'}" 
                         class="account-avatar">
                    <div class="account-info">
                        <div class="account-name">${account.name}</div>
                        <div class="account-email">${account.email}</div>
                    </div>
                    <i class="fas fa-chevron-right account-arrow"></i>
                `;

                accountItem.addEventListener('click', async () => {
                    const password = prompt(`Введите пароль для ${account.email}:`);
                    if (!password) return;

                    try {
                        const loginData = await apiRequest('/auth/login', {
                            method: 'POST',
                            body: JSON.stringify({
                                email: account.email,
                                password: password,
                                deviceId: getDeviceId()
                            })
                        });

                        authToken = loginData.token;
                        currentUser = loginData.user;
                        localStorage.setItem('authToken', authToken);

                        accountSwitchModal.style.display = 'none';

                        if (currentUser.is_admin) {
                            showAdminPanel();
                        } else {
                            showApp();
                        }

                        showNotification('Аккаунт изменён', `Вы вошли как ${currentUser.name}`, 'success');
                    } catch (error) {
                        showNotification('Ошибка', 'Неверный пароль', 'error');
                    }
                });

                accountsList.appendChild(accountItem);
            });

            // Если после фильтрации не осталось аккаунтов
            if (accountsList.children.length === 0) {
                accountsList.innerHTML = `
                    <div class="empty-accounts">
                        <i class="fas fa-users"></i>
                        <p>Нет других аккаунтов</p>
                    </div>
                `;
            }
        } else {
            accountsList.innerHTML = `
                <div class="empty-accounts">
                    <i class="fas fa-users"></i>
                    <p>Нет сохранённых аккаунтов</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error loading accounts:', error);
        accountsList.innerHTML = `
            <div class="error-accounts">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Ошибка загрузки аккаунтов</p>
                <button class="btn-retry" onclick="loadAccounts()">
                    <i class="fas fa-redo"></i> Повторить
                </button>
            </div>
        `;
    }
}

// Админ float button
const adminFloatBtn = document.getElementById('adminFloatBtn');
if (adminFloatBtn) {
    adminFloatBtn.addEventListener('click', () => {
        if (currentUser && currentUser.is_admin) {
            showAdminPanel();
        } else {
            showNotification('Доступ запрещен', 'Требуются права администратора', 'error');
        }
    });
}

// Функция проверки микрофона
async function testMicrophone() {
    try {
        showNotification('Тест микрофона', 'Запрашиваем доступ к микрофону...', 'info');
        
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            } 
        });
        
        // Останавливаем поток после проверки
        stream.getTracks().forEach(track => track.stop());
        
        showNotification('Успех', 'Микрофон работает корректно!', 'success');
        return true;
    } catch (error) {
        console.error('Microphone access denied:', error);
        
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
        throw error;
    }
}

// Быстрый вход для демонстрации
function initQuickLogin() {
    // Добавляем кнопки быстрого входа для демо только на локальном хосте
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        const authContainer = document.getElementById('authContainer');
        if (authContainer) {
            const quickLoginDiv = document.createElement('div');
            quickLoginDiv.className = 'quick-login-container';
            
            const title = document.createElement('div');
            title.className = 'quick-login-title';
            title.textContent = 'Быстрый вход (демо):';
            quickLoginDiv.appendChild(title);
            
            const demoUsers = [
                { email: 'admin@kocmoc.ru', password: 'adminkocmocmesanger123456789hi', label: 'Админ' },
                { email: 'user1@test.ru', password: 'password123', label: 'Тест пользователь 1' },
                { email: 'user2@test.ru', password: 'password123', label: 'Тест пользователь 2' }
            ];
            
            demoUsers.forEach(user => {
                const btn = document.createElement('button');
                btn.className = 'btn quick-login-btn';
                btn.innerHTML = `<i class="fas fa-bolt"></i> ${user.label}`;
                
                btn.addEventListener('click', () => {
                    // Переключаемся на таб входа
                    document.querySelector('[data-tab="login"]').click();
                    
                    // Заполняем поля
                    document.getElementById('loginEmail').value = user.email;
                    document.getElementById('loginPassword').value = user.password;
                    
                    // Показываем подсказку
                    showNotification('Демо вход', `Вход как ${user.label}`, 'info');
                });
                quickLoginDiv.appendChild(btn);
            });
            
            authContainer.appendChild(quickLoginDiv);
        }
    }
}

// Автоматический вход при наличии токена
async function autoLogin() {
    const savedToken = localStorage.getItem('authToken');
    if (savedToken && savedToken !== 'null') {
        try {
            authToken = savedToken;
            
            // Проверяем валидность токена
            const userData = await apiRequest('/auth/verify');
            
            currentUser = userData.user;

            if (currentUser.is_admin) {
                showAdminPanel();
            } else {
                showApp();
            }
            
            showNotification('Автовход', `Добро пожаловать, ${currentUser.name}!`, 'success');
        } catch (error) {
            console.error('Auto login failed:', error);
            localStorage.removeItem('authToken');
            authToken = null;
            currentUser = null;
            showAuthScreen();
        }
    } else {
        showAuthScreen();
    }
}

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', function() {
    // Инициализация быстрого входа для демо
    initQuickLogin();
    
    // Пытаемся выполнить автоматический вход
    autoLogin();
    
    // Закрытие модальных окон при клике вне их
    if (accountSwitchModal) {
        accountSwitchModal.addEventListener('click', function(e) {
            if (e.target === this) {
                this.style.display = 'none';
            }
        });
    }

    // Обработка Enter в формах
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            const activeAuthForm = document.querySelector('.auth-form.active');
            if (activeAuthForm) {
                const submitBtn = activeAuthForm.querySelector('button[type="submit"]');
                if (submitBtn && !submitBtn.disabled) {
                    submitBtn.click();
                }
            }
        }
    });
});

// Глобальные функции для управления аутентификацией
window.authModule = {
    logout: async function() {
        if (logoutBtn) {
            logoutBtn.click();
        }
    },
    
    switchAccount: async function() {
        if (switchAccountBtn) {
            switchAccountBtn.click();
        }
    },
    
    getCurrentUser: function() {
        return currentUser;
    },
    
    isAuthenticated: function() {
        return !!authToken && !!currentUser;
    }
};

// ===== Инициализация ввода кода подтверждения (6 отдельных ячеек) =====
function initVerifyCodeInputs() {
    const container = document.getElementById('verifyCodeInputs');
    const hiddenInput = document.getElementById('verifyCode');

    if (!container || !hiddenInput) return;

    const inputs = Array.from(container.querySelectorAll('.verify-code-digit'));
    if (!inputs.length) return;

    const updateHidden = () => {
        const value = inputs
            .map(input => (input.value || '').trim())
            .join('');
        hiddenInput.value = value;
    };

    inputs.forEach((input, index) => {
        input.addEventListener('input', (e) => {
            let value = e.target.value || '';
            // Оставляем только последнюю цифру
            value = value.replace(/\D/g, '').slice(-1);
            e.target.value = value;

            if (value && index < inputs.length - 1) {
                inputs[index + 1].focus();
                inputs[index + 1].select();
            }

            updateHidden();
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !e.target.value && index > 0) {
                inputs[index - 1].focus();
                inputs[index - 1].select();
            }

            if (e.key === 'ArrowLeft' && index > 0) {
                e.preventDefault();
                inputs[index - 1].focus();
                inputs[index - 1].select();
            }

            if (e.key === 'ArrowRight' && index < inputs.length - 1) {
                e.preventDefault();
                inputs[index + 1].focus();
                inputs[index + 1].select();
            }
        });

        input.addEventListener('paste', (e) => {
            const text = (e.clipboardData || window.clipboardData).getData('text') || '';
            const digits = text.replace(/\D/g, '').slice(0, inputs.length);

            digits.split('').forEach((digit, idx) => {
                if (inputs[idx]) {
                    inputs[idx].value = digit;
                }
            });

            updateHidden();

            if (digits.length > 0) {
                const lastIndex = Math.min(digits.length - 1, inputs.length - 1);
                inputs[lastIndex].focus();
                inputs[lastIndex].select();
            }

            e.preventDefault();
        });
    });

    // Сразу фокус на первую ячейку
    inputs[0].focus();
    inputs[0].select();
}

document.addEventListener('DOMContentLoaded', initVerifyCodeInputs);
