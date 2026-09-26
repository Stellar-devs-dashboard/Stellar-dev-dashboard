/**
 * Biometric authentication utilities for protecting cached data
 * Uses Web Authentication API (WebAuthn) for platform biometrics
 */

interface BiometricAuthOptions {
  timeout?: number;
  userVerification?: 'required' | 'preferred' | 'discouraged';
}

interface BiometricCredential {
  id: string;
  authenticatorData: string;
  clientDataJSON: string;
  signature: string;
  userHandle?: string;
}

class BiometricAuthError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'BiometricAuthError';
  }
}

/**
 * Check if biometric authentication is available
 */
export async function isBiometricAvailable(): Promise<boolean> {
  if (!window.PublicKeyCredential) {
    return false;
  }

  try {
    const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    return available;
  } catch (error) {
    console.error('Error checking biometric availability:', error);
    return false;
  }
}

/**
 * Register a biometric credential for data protection
 */
export async function registerBiometricCredential(
  userId: string,
  userName: string,
  options: BiometricAuthOptions = {}
): Promise<boolean> {
  const { timeout = 60000, userVerification = 'preferred' } = options;

  if (!await isBiometricAvailable()) {
    throw new BiometricAuthError('Biometric authentication not available', 'NOT_AVAILABLE');
  }

  try {
    // Convert user ID to ArrayBuffer
    const userIdBuffer = new TextEncoder().encode(userId);

    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: {
          name: 'Stellar Dev Dashboard',
          id: window.location.hostname,
        },
        user: {
          id: userIdBuffer,
          name: userName,
          displayName: userName,
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 }, // ES256
          { type: 'public-key', alg: -257 }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification,
        },
        timeout,
        attestation: 'none',
      },
    }) as PublicKeyCredential;

    if (!credential) {
      throw new BiometricAuthError('Failed to create credential', 'CREATE_FAILED');
    }

    // Store the credential ID for later authentication
    const credentialId = arrayBufferToBase64(credential.rawId);
    localStorage.setItem(`biometric_credential_${userId}`, credentialId);

    return true;
  } catch (error) {
    if (error instanceof DOMException) {
      if (error.name === 'NotAllowedError') {
        throw new BiometricAuthError('User cancelled biometric registration', 'CANCELLED');
      }
      if (error.name === 'NotSupportedError') {
        throw new BiometricAuthError('Biometric authentication not supported', 'NOT_SUPPORTED');
      }
    }
    throw new BiometricAuthError(
      error instanceof Error ? error.message : 'Unknown error during registration',
      'UNKNOWN'
    );
  }
}

/**
 * Authenticate using biometrics
 */
export async function authenticateWithBiometric(
  userId: string,
  options: BiometricAuthOptions = {}
): Promise<boolean> {
  const { timeout = 60000, userVerification = 'required' } = options;

  if (!await isBiometricAvailable()) {
    throw new BiometricAuthError('Biometric authentication not available', 'NOT_AVAILABLE');
  }

  const credentialId = localStorage.getItem(`biometric_credential_${userId}`);
  if (!credentialId) {
    throw new BiometricAuthError('No biometric credential registered', 'NO_CREDENTIAL');
  }

  try {
    const credential = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [
          {
            id: base64ToArrayBuffer(credentialId),
            type: 'public-key',
          },
        ],
        userVerification,
        timeout,
      },
    }) as PublicKeyCredential;

    if (!credential) {
      throw new BiometricAuthError('Authentication failed', 'AUTH_FAILED');
    }

    return true;
  } catch (error) {
    if (error instanceof DOMException) {
      if (error.name === 'NotAllowedError') {
        throw new BiometricAuthError('User cancelled biometric authentication', 'CANCELLED');
      }
      if (error.name === 'NotSupportedError') {
        throw new BiometricAuthError('Biometric authentication not supported', 'NOT_SUPPORTED');
      }
    }
    throw new BiometricAuthError(
      error instanceof Error ? error.message : 'Unknown error during authentication',
      'UNKNOWN'
    );
  }
}

/**
 * Remove biometric credential
 */
export async function removeBiometricCredential(userId: string): Promise<void> {
  localStorage.removeItem(`biometric_credential_${userId}`);
}

/**
 * Check if biometric credential exists for user
 */
export function hasBiometricCredential(userId: string): boolean {
  return !!localStorage.getItem(`biometric_credential_${userId}`);
}

/**
 * Encrypt data using biometric-protected key
 * This is a simplified version - in production, use Web Crypto API with proper key derivation
 */
export async function encryptDataWithBiometric(
  data: string,
  userId: string
): Promise<string> {
  // Verify biometric authentication first
  await authenticateWithBiometric(userId);

  // Simple XOR encryption for demonstration
  // In production, use Web Crypto API with proper encryption
  const key = await deriveKeyFromBiometric(userId);
  const encrypted = xorEncrypt(data, key);
  return encrypted;
}

/**
 * Decrypt data using biometric-protected key
 */
export async function decryptDataWithBiometric(
  encryptedData: string,
  userId: string
): Promise<string> {
  // Verify biometric authentication first
  await authenticateWithBiometric(userId);

  // Simple XOR decryption for demonstration
  // In production, use Web Crypto API with proper decryption
  const key = await deriveKeyFromBiometric(userId);
  const decrypted = xorDecrypt(encryptedData, key);
  return decrypted;
}

/**
 * Derive a key from biometric credential
 * This is a simplified version - in production, use proper key derivation
 */
async function deriveKeyFromBiometric(userId: string): Promise<string> {
  const credentialId = localStorage.getItem(`biometric_credential_${userId}`);
  if (!credentialId) {
    throw new BiometricAuthError('No biometric credential found', 'NO_CREDENTIAL');
  }

  // Use the credential ID as a seed for key derivation
  // In production, use Web Crypto API with proper key derivation
  const hash = await crypto.subtle.digest('SHA-256', base64ToArrayBuffer(credentialId));
  return arrayBufferToBase64(hash);
}

/**
 * Simple XOR encryption (for demonstration only)
 * In production, use proper encryption algorithms
 */
function xorEncrypt(data: string, key: string): string {
  const dataBytes = new TextEncoder().encode(data);
  const keyBytes = new TextEncoder().encode(key);
  const encrypted = new Uint8Array(dataBytes.length);

  for (let i = 0; i < dataBytes.length; i++) {
    encrypted[i] = dataBytes[i] ^ keyBytes[i % keyBytes.length];
  }

  return arrayBufferToBase64(encrypted);
}

/**
 * Simple XOR decryption (for demonstration only)
 * In production, use proper decryption algorithms
 */
function xorDecrypt(encryptedData: string, key: string): string {
  const encrypted = base64ToArrayBuffer(encryptedData);
  const keyBytes = new TextEncoder().encode(key);
  const decrypted = new Uint8Array(encrypted.length);

  for (let i = 0; i < encrypted.length; i++) {
    decrypted[i] = encrypted[i] ^ keyBytes[i % keyBytes.length];
  }

  return new TextDecoder().decode(decrypted);
}

/**
 * Convert ArrayBuffer to Base64
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert Base64 to ArrayBuffer
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export { BiometricAuthError };
