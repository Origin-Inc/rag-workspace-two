import bcrypt from "bcrypt";

const SALT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

export interface PasswordValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  console.log('[PASSWORD_VERIFY] Starting password verification');
  console.log('[PASSWORD_VERIFY] Password length:', password?.length);
  console.log('[PASSWORD_VERIFY] Hash length:', hash?.length);
  console.log('[PASSWORD_VERIFY] Hash prefix:', hash?.substring(0, 7));
  
  try {
    const result = await bcrypt.compare(password, hash);
    console.log('[PASSWORD_VERIFY] Comparison result:', result);
    return result;
  } catch (error) {
    console.error('[PASSWORD_VERIFY] Error during comparison:', error);
    throw error;
  }
}

/**
 * Validate password strength
 */
export function validatePasswordStrength(password: string): PasswordValidationResult {
  const errors: string[] = [];

  if (password.length < MIN_PASSWORD_LENGTH) {
    errors.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long`);
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    errors.push(`Password must be no more than ${MAX_PASSWORD_LENGTH} characters long`);
  }

  // Check for at least one uppercase letter
  if (!/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter");
  }

  // Check for at least one lowercase letter
  if (!/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter");
  }

  // Check for at least one number
  if (!/\d/.test(password)) {
    errors.push("Password must contain at least one number");
  }

  // Check for at least one special character
  if (!/[@$!%*?&]/.test(password)) {
    errors.push("Password must contain at least one special character (@$!%*?&)");
  }

  // Check for common passwords (basic check)
  const commonPasswords = [
    "password",
    "12345678",
    "123456789",
    "qwerty123",
    "password123",
    "admin123",
  ];
  
  if (commonPasswords.some(common => password.toLowerCase().includes(common))) {
    errors.push("Password is too common, please choose a more unique password");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Generate a secure random token
 */
export function generateSecureToken(length = 32): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  
  for (let i = 0; i < length; i++) {
    token += chars[randomValues[i]! % chars.length];
  }
  
  return token;
}

/**
 * Generate a numeric OTP code
 */
export function generateOTP(length = 6): string {
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  
  let otp = "";
  for (let i = 0; i < length; i++) {
    otp += randomValues[i]! % 10;
  }
  
  return otp;
}