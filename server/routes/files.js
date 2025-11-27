const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Настройка multer для загрузки файлов
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let dir = 'uploads/';
    if (file.mimetype.startsWith('audio/')) {
      dir += 'voice/';
    } else {
      dir += 'files/';
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB лимит
  },
  fileFilter: (req, file, cb) => {
    // Разрешаем только определенные типы файлов
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm',
      'video/mp4', 'video/webm',
      'application/pdf', 'text/plain',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Неподдерживаемый тип файла'), false);
    }
  }
});

// Загрузка файла
router.post('/upload', authenticateToken, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Файл не загружен' });
    }

    const fileInfo = {
      id: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      path: req.file.path,
      url: `/api/files/${req.file.filename}`,
      uploadedAt: new Date().toISOString()
    };

    res.json({
      success: true,
      file: fileInfo,
      message: 'Файл успешно загружен'
    });
  } catch (error) {
    console.error('Ошибка загрузки файла:', error);
    res.status(500).json({ error: 'Ошибка загрузки файла' });
  }
});

// Получение файла
router.get('/:fileId', (req, res) => {
  try {
    const fileId = req.params.fileId;
    
    // Ищем файл в обеих папках
    const voicePath = path.join('uploads/voice', fileId);
    const filesPath = path.join('uploads/files', fileId);
    
    let filePath;
    if (fs.existsSync(voicePath)) {
      filePath = voicePath;
    } else if (fs.existsSync(filesPath)) {
      filePath = filesPath;
    } else {
      return res.status(404).json({ error: 'Файл не найден' });
    }

    // Определяем MIME тип
    const mimeType = getMimeType(filePath);
    
    res.setHeader('Content-Type', mimeType);
    res.sendFile(path.resolve(filePath));
  } catch (error) {
    console.error('Ошибка получения файла:', error);
    res.status(500).json({ error: 'Ошибка получения файла' });
  }
});

// Удаление файла
router.delete('/:fileId', authenticateToken, (req, res) => {
  try {
    const fileId = req.params.fileId;
    
    const voicePath = path.join('uploads/voice', fileId);
    const filesPath = path.join('uploads/files', fileId);
    
    let filePath;
    if (fs.existsSync(voicePath)) {
      filePath = voicePath;
    } else if (fs.existsSync(filesPath)) {
      filePath = filesPath;
    } else {
      return res.status(404).json({ error: 'Файл не найден' });
    }

    fs.unlinkSync(filePath);
    res.json({ success: true, message: 'Файл удален' });
  } catch (error) {
    console.error('Ошибка удаления файла:', error);
    res.status(500).json({ error: 'Ошибка удаления файла' });
  }
});

// Вспомогательная функция для определения MIME типа
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.webm': 'audio/webm',
    '.mp4': 'video/mp4',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  };
  
  return mimeTypes[ext] || 'application/octet-stream';
}

module.exports = router;