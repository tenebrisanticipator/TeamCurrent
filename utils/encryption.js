const crypto = require('crypto');
require('dotenv').config();

const algorithm = 'aes-256-cbc';

// Convert hex strings to buffers
// AES-256 requires 32-byte key, AES-CBC requires 16-byte IV
const secretKey = Buffer.from(process.env.AES_SECRET_KEY || crypto.randomBytes(32).toString('hex'), 'hex');
const iv = Buffer.from(process.env.AES_IV || crypto.randomBytes(16).toString('hex'), 'hex');

function encrypt(text) {
  if (!text) return text;
  
  // Validate key and IV sizes
  if (secretKey.length !== 32) {
    throw new Error(`Invalid AES_SECRET_KEY length: ${secretKey.length} bytes. Must be 32 bytes.`);
  }
  if (iv.length !== 16) {
    throw new Error(`Invalid AES_IV length: ${iv.length} bytes. Must be 16 bytes.`);
  }
  
  const cipher = crypto.createCipheriv(algorithm, secretKey, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}

function decrypt(encryptedText) {
  if (!encryptedText) return encryptedText;
  
  // Validate key and IV sizes
  if (secretKey.length !== 32) {
    throw new Error(`Invalid AES_SECRET_KEY length: ${secretKey.length} bytes. Must be 32 bytes.`);
  }
  if (iv.length !== 16) {
    throw new Error(`Invalid AES_IV length: ${iv.length} bytes. Must be 16 bytes.`);
  }
  
  try {
    const decipher = crypto.createDecipheriv(algorithm, secretKey, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('Decryption failed', err);
    return null;
  }
}

module.exports = { encrypt, decrypt };
