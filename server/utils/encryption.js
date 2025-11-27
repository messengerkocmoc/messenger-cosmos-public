const crypto = require('crypto');

/*
 * Utility functions for encrypting and decrypting message text. This module
 * uses AES‑256‑GCM with a random IV (12 bytes) and prepends the IV and
 * authentication tag to the ciphertext. The key must be provided via
 * the MESSAGE_KEY environment variable as a base64‑encoded 32‑byte
 * secret. If the key is missing or invalid, encryption and decryption
 * will throw errors at runtime.
 */

// Load and decode the symmetric key from environment
const rawKey = process.env.MESSAGE_KEY || '';
let key;
try {
    const buf = Buffer.from(rawKey, 'base64');
    if (buf.length !== 32) {
        throw new Error('MESSAGE_KEY must decode to 32 bytes');
    }
    key = buf;
} catch (err) {
    // Throwing here will surface the error at module load time. If you
    // prefer to disable encryption in development, you can set
    // MESSAGE_KEY to an empty string and catch this error in callers.
    console.error('Failed to initialise encryption key:', err.message);
    key = null;
}

function encryptMessage(plaintext) {
    if (!plaintext) return null;
    if (!key) throw new Error('Encryption key is not configured');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    // Compose: IV (12 bytes) || tag (16 bytes) || ciphertext
    return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decryptMessage(encoded) {
    if (!encoded) return null;
    if (!key) throw new Error('Encryption key is not configured');
    let data;
    try {
        data = Buffer.from(encoded, 'base64');
    } catch (err) {
        // Not a base64 string, return as‑is
        return encoded;
    }
    if (data.length < 28) {
        // Not enough bytes for IV + tag
        return encoded;
    }
    const iv = data.slice(0, 12);
    const tag = data.slice(12, 28);
    const enc = data.slice(28);
    try {
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
        return dec.toString('utf8');
    } catch (err) {
        // If decryption fails (e.g. wrong key), return the original
        return encoded;
    }
}

module.exports = {
    encryptMessage,
    decryptMessage,
};