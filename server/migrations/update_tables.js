const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../../database/kocmoc.db');
const db = new sqlite3.Database(dbPath);

function updateDatabase() {
    console.log('🔄 Обновление структуры базы данных...');

    const migrations = [
        // Добавляем недостающие колонки в messages
        `ALTER TABLE messages ADD COLUMN message_type TEXT DEFAULT 'text'`,
        `ALTER TABLE messages ADD COLUMN file_url TEXT`,
        `ALTER TABLE messages ADD COLUMN file_name TEXT`,
        `ALTER TABLE messages ADD COLUMN file_size INTEGER`,
        `ALTER TABLE messages ADD COLUMN file_type TEXT`,
        `ALTER TABLE messages ADD COLUMN voice_url TEXT`,
        `ALTER TABLE messages ADD COLUMN voice_duration INTEGER`,

        // Создаем таблицу для реакций если не существует
        `CREATE TABLE IF NOT EXISTS message_reactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id INTEGER,
            user_id INTEGER,
            reaction TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (message_id) REFERENCES messages (id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
            UNIQUE(message_id, user_id)
        )`
    ];

    migrations.forEach((sql, index) => {
        db.run(sql, function(err) {
            if (err) {
                if (err.message.includes('duplicate column name')) {
                    console.log(`✅ Колонка уже существует: ${sql.substring(13, 50)}...`);
                } else {
                    console.log(`❌ Ошибка в миграции ${index + 1}:`, err.message);
                }
            } else {
                console.log(`✅ Миграция ${index + 1} выполнена успешно`);
            }
        });
    });

    // Закрываем соединение
    setTimeout(() => {
        db.close();
        console.log('✅ Обновление базы данных завершено');
        process.exit(0);
    }, 2000);
}

updateDatabase();