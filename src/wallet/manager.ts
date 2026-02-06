// Wallet Manager Module
// Securely manage user private keys
// Security: AES-256-GCM encryption, PBKDF2 key derivation, secure file permissions

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { type Address } from 'viem';

// Wallet storage location (in user's home directory for security)
const WALLET_DIR = path.join(os.homedir(), '.thecrownsk');
const WALLET_FILE = path.join(WALLET_DIR, 'wallet.enc');
const SALT_FILE = path.join(WALLET_DIR, '.salt');

// Encryption settings - Industry standard
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const SALT_LENGTH = 32;
const ITERATIONS = 100000; // OWASP recommended minimum

export interface WalletInfo {
  address: Address;
  hasPrivateKey: boolean;
}

// Current wallet state - kept in memory only, never logged
let currentAccount: PrivateKeyAccount | null = null;
let currentPrivateKey: string | null = null;

/**
 * Secure memory clear - overwrites sensitive data
 */
function secureClear(data: string | null): void {
  if (data) {
    // Attempt to overwrite string in memory (limited effectiveness in JS)
    const buffer = Buffer.from(data);
    crypto.randomFillSync(buffer);
  }
}

/**
 * Ensure wallet directory exists with secure permissions
 */
function ensureWalletDir(): void {
  if (!fs.existsSync(WALLET_DIR)) {
    fs.mkdirSync(WALLET_DIR, { mode: 0o700 }); // Owner-only permissions
  }
}

/**
 * Get or create salt for key derivation
 */
function getSalt(): Buffer {
  ensureWalletDir();

  if (fs.existsSync(SALT_FILE)) {
    return fs.readFileSync(SALT_FILE);
  }

  const salt = crypto.randomBytes(SALT_LENGTH);
  fs.writeFileSync(SALT_FILE, salt, { mode: 0o600 });
  return salt;
}

/**
 * Derive encryption key from password using PBKDF2
 */
function deriveKey(password: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, 'sha256');
}

/**
 * Encrypt private key with AES-256-GCM
 */
function encryptPrivateKey(privateKey: string, password: string): string {
  const salt = getSalt();
  const key = deriveKey(password, salt);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(privateKey, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  // Format: iv:tag:encrypted (all base64)
  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

/**
 * Decrypt private key
 */
function decryptPrivateKey(encryptedData: string, password: string): string {
  const salt = getSalt();
  const key = deriveKey(password, salt);

  const parts = encryptedData.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }

  const [ivB64, tagB64, encryptedB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const encrypted = Buffer.from(encryptedB64, 'base64');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

/**
 * Validate private key format
 */
function validatePrivateKey(privateKey: string): boolean {
  // Must start with 0x and be 66 characters (0x + 64 hex chars)
  if (!privateKey.startsWith('0x')) {
    return false;
  }

  if (privateKey.length !== 66) {
    return false;
  }

  // Check if valid hex
  const hexPart = privateKey.slice(2);
  return /^[a-fA-F0-9]{64}$/.test(hexPart);
}

/**
 * Validate password strength
 */
function validatePassword(password: string): { valid: boolean; error?: string } {
  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters.' };
  }
  return { valid: true };
}

/**
 * Save encrypted private key to file
 * SECURITY: Never logs private key, only address
 */
export function saveWallet(privateKey: string, password: string): { success: boolean; address?: Address; error?: string } {
  try {
    // Validate password
    const passwordCheck = validatePassword(password);
    if (!passwordCheck.valid) {
      return { success: false, error: passwordCheck.error };
    }

    // Normalize the private key
    let normalizedKey = privateKey.trim();
    if (!normalizedKey.startsWith('0x')) {
      normalizedKey = '0x' + normalizedKey;
    }

    // Validate
    if (!validatePrivateKey(normalizedKey)) {
      return { success: false, error: 'Invalid private key format. Must be 64 hex characters (with or without 0x prefix).' };
    }

    // Verify key works by creating account
    const account = privateKeyToAccount(normalizedKey as `0x${string}`);

    // Encrypt and save
    ensureWalletDir();
    const encrypted = encryptPrivateKey(normalizedKey, password);
    fs.writeFileSync(WALLET_FILE, encrypted, { mode: 0o600 }); // Owner-only read/write

    // Update current state
    currentAccount = account;
    currentPrivateKey = normalizedKey;

    // SECURITY: Only log address, never private key
    console.log(`Wallet saved: ${account.address}`);

    return { success: true, address: account.address };
  } catch {
    // SECURITY: Don't log error details that might contain key info
    return { success: false, error: 'Failed to save wallet. Check your private key format.' };
  }
}

/**
 * Load wallet from encrypted file
 */
export function loadWallet(password: string): { success: boolean; address?: Address; error?: string } {
  try {
    if (!fs.existsSync(WALLET_FILE)) {
      return { success: false, error: 'No wallet found. Use "wallet set" to add your private key.' };
    }

    const encrypted = fs.readFileSync(WALLET_FILE, 'utf8');
    const privateKey = decryptPrivateKey(encrypted, password);

    // Verify key works
    const account = privateKeyToAccount(privateKey as `0x${string}`);

    // Update current state
    currentAccount = account;
    currentPrivateKey = privateKey;

    return { success: true, address: account.address };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('bad decrypt') || msg.includes('authentication') || msg.includes('Unsupported state')) {
      return { success: false, error: 'Incorrect password.' };
    }
    return { success: false, error: 'Failed to load wallet.' };
  }
}

/**
 * Delete wallet file securely
 * SECURITY: Overwrites file with random data before deletion
 */
export function deleteWallet(): { success: boolean; error?: string } {
  try {
    if (fs.existsSync(WALLET_FILE)) {
      // Overwrite with random data before deleting (secure deletion)
      const fileSize = fs.statSync(WALLET_FILE).size;
      // Multiple overwrites for better security
      for (let i = 0; i < 3; i++) {
        fs.writeFileSync(WALLET_FILE, crypto.randomBytes(fileSize));
      }
      fs.unlinkSync(WALLET_FILE);
    }

    // Clear current state securely
    secureClear(currentPrivateKey);
    currentAccount = null;
    currentPrivateKey = null;

    return { success: true };
  } catch (error) {
    return { success: false, error: 'Failed to delete wallet.' };
  }
}

/**
 * Check if wallet exists
 */
export function walletExists(): boolean {
  return fs.existsSync(WALLET_FILE);
}

/**
 * Get current wallet info (without exposing private key)
 */
export function getWalletInfo(): WalletInfo | null {
  if (!currentAccount) {
    return null;
  }

  return {
    address: currentAccount.address,
    hasPrivateKey: currentPrivateKey !== null,
  };
}

/**
 * Get current account
 */
export function getCurrentAccount(): PrivateKeyAccount | null {
  return currentAccount;
}

/**
 * Get current private key (internal use only)
 * SECURITY: This should only be called by blockchain client
 */
export function getCurrentPrivateKey(): string | null {
  return currentPrivateKey;
}

/**
 * Check if wallet is loaded
 */
export function isWalletLoaded(): boolean {
  return currentAccount !== null;
}

/**
 * Update wallet with new private key
 */
export function updateWallet(newPrivateKey: string, password: string): { success: boolean; address?: Address; error?: string } {
  // First delete old wallet securely
  const deleteResult = deleteWallet();
  if (!deleteResult.success) {
    return { success: false, error: `Failed to remove old wallet: ${deleteResult.error}` };
  }

  // Save new wallet
  return saveWallet(newPrivateKey, password);
}

/**
 * Change wallet password
 */
export function changePassword(oldPassword: string, newPassword: string): { success: boolean; error?: string } {
  try {
    // Validate new password
    const passwordCheck = validatePassword(newPassword);
    if (!passwordCheck.valid) {
      return { success: false, error: passwordCheck.error };
    }

    // Load with old password
    const loadResult = loadWallet(oldPassword);
    if (!loadResult.success) {
      return { success: false, error: loadResult.error };
    }

    // Re-save with new password
    if (!currentPrivateKey) {
      return { success: false, error: 'No private key loaded.' };
    }

    const saveResult = saveWallet(currentPrivateKey, newPassword);
    if (!saveResult.success) {
      return { success: false, error: saveResult.error };
    }

    return { success: true };
  } catch {
    return { success: false, error: 'Failed to change password.' };
  }
}

/**
 * Get wallet storage path (for info purposes)
 */
export function getWalletStoragePath(): string {
  return WALLET_FILE;
}

/**
 * Clear wallet from memory (for logout/security)
 */
export function clearWalletFromMemory(): void {
  secureClear(currentPrivateKey);
  currentAccount = null;
  currentPrivateKey = null;
}
