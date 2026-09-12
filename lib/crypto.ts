import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';

function getSecretKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) {
    throw new Error('ENCRYPTION_KEY is not defined');
  }
  if (secret.length < 12) {
    throw new Error('ENCRYPTION_KEY must be 64 characters long');
  }
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypts clear text into AES-256-GCM format (iv:authTag:encrypted)
 */
export function encrypt(text: string): string {
  if (!text) return text;
  try {
    const iv = crypto.randomBytes(12);
    const key = getSecretKey();
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  } catch (err) {
    console.error('Encryption failed:', err);
    return text;
  }
}

/**
 * Decrypts AES-256-GCM format cipher text. Fallback to plain text if invalid format or legacy data.
 */
export function decrypt(cipherText: string): string {
  if (!cipherText) return cipherText;
  const parts = cipherText.split(':');
  if (parts.length !== 3) {
    // Legacy plain text
    return cipherText;
  }
  try {
    const [ivHex, authTagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const key = getSecretKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    // If decryption fails, assume legacy plain text
    return cipherText;
  }
}
