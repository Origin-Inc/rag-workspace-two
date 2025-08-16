import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const algorithm = 'aes-256-gcm';
const saltLength = 32;
const tagLength = 16;
const ivLength = 16;
const iterations = 100000;
const keyLength = 32;

// Get encryption key from environment or generate one
const getEncryptionKey = (): Buffer => {
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error('ENCRYPTION_SECRET environment variable is not set');
  }
  
  // Derive a key from the secret using a fixed salt
  const salt = Buffer.from('fixed-salt-for-key-derivation-2024', 'utf-8');
  return scryptSync(secret, salt, keyLength, { N: 1024 });
};

/**
 * Encrypt a string value using AES-256-GCM
 */
export async function encrypt(text: string): Promise<string> {
  try {
    const key = getEncryptionKey();
    const iv = randomBytes(ivLength);
    const salt = randomBytes(saltLength);
    
    // Derive a key from the main key and salt
    const derivedKey = scryptSync(key, salt, keyLength, { N: iterations });
    
    const cipher = createCipheriv(algorithm, derivedKey, iv);
    
    const encrypted = Buffer.concat([
      cipher.update(text, 'utf8'),
      cipher.final(),
    ]);
    
    const tag = cipher.getAuthTag();
    
    // Combine salt, iv, tag, and encrypted data
    const combined = Buffer.concat([salt, iv, tag, encrypted]);
    
    return combined.toString('base64');
  } catch (error) {
    console.error('Encryption failed:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypt a string value encrypted with encrypt()
 */
export async function decrypt(encryptedText: string): Promise<string> {
  try {
    const key = getEncryptionKey();
    const combined = Buffer.from(encryptedText, 'base64');
    
    // Extract components
    const salt = combined.slice(0, saltLength);
    const iv = combined.slice(saltLength, saltLength + ivLength);
    const tag = combined.slice(saltLength + ivLength, saltLength + ivLength + tagLength);
    const encrypted = combined.slice(saltLength + ivLength + tagLength);
    
    // Derive the same key
    const derivedKey = scryptSync(key, salt, keyLength, { N: iterations });
    
    const decipher = createDecipheriv(algorithm, derivedKey, iv);
    decipher.setAuthTag(tag);
    
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
    
    return decrypted.toString('utf8');
  } catch (error) {
    console.error('Decryption failed:', error);
    throw new Error('Failed to decrypt data');
  }
}

/**
 * Hash a value for secure comparison (e.g., API keys)
 */
export async function hashValue(value: string): Promise<string> {
  const crypto = await import('crypto');
  return crypto
    .createHash('sha256')
    .update(value)
    .digest('hex');
}

/**
 * Generate a secure random token
 */
export function generateSecureToken(length: number = 32): string {
  return randomBytes(length).toString('hex');
}

/**
 * Encrypt sensitive fields in an object
 */
export async function encryptObject<T extends Record<string, any>>(
  obj: T,
  fieldsToEncrypt: (keyof T)[]
): Promise<T> {
  const encrypted = { ...obj };
  
  for (const field of fieldsToEncrypt) {
    if (encrypted[field] && typeof encrypted[field] === 'string') {
      encrypted[field] = await encrypt(encrypted[field] as string) as any;
    }
  }
  
  return encrypted;
}

/**
 * Decrypt sensitive fields in an object
 */
export async function decryptObject<T extends Record<string, any>>(
  obj: T,
  fieldsToDecrypt: (keyof T)[]
): Promise<T> {
  const decrypted = { ...obj };
  
  for (const field of fieldsToDecrypt) {
    if (decrypted[field] && typeof decrypted[field] === 'string') {
      try {
        decrypted[field] = await decrypt(decrypted[field] as string) as any;
      } catch (error) {
        // If decryption fails, leave the field as is
        console.error(`Failed to decrypt field ${String(field)}:`, error);
      }
    }
  }
  
  return decrypted;
}

/**
 * Mask sensitive data for display (e.g., API keys)
 */
export function maskSensitiveData(
  value: string,
  visibleChars: number = 4,
  maskChar: string = '•'
): string {
  if (value.length <= visibleChars * 2) {
    return maskChar.repeat(value.length);
  }
  
  const start = value.slice(0, visibleChars);
  const end = value.slice(-visibleChars);
  const masked = maskChar.repeat(Math.max(value.length - visibleChars * 2, 3));
  
  return `${start}${masked}${end}`;
}

/**
 * Validate that required encryption environment variables are set
 */
export function validateEncryptionConfig(): boolean {
  const required = ['ENCRYPTION_SECRET'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error(`Missing required encryption environment variables: ${missing.join(', ')}`);
    return false;
  }
  
  // Check that ENCRYPTION_SECRET is strong enough
  const secret = process.env.ENCRYPTION_SECRET;
  if (secret && secret.length < 32) {
    console.error('ENCRYPTION_SECRET should be at least 32 characters long');
    return false;
  }
  
  return true;
}