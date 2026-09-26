import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isBiometricAvailable,
  registerBiometricCredential,
  authenticateWithBiometric,
  removeBiometricCredential,
  hasBiometricCredential,
  BiometricAuthError,
} from '../biometric';

describe('Biometric Authentication', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('isBiometricAvailable', () => {
    it('should return false when PublicKeyCredential is not available', async () => {
      const originalPKC = (global as any).PublicKeyCredential;
      (global as any).PublicKeyCredential = undefined;
      const available = await isBiometricAvailable();
      expect(available).toBe(false);
      (global as any).PublicKeyCredential = originalPKC;
    });

    it('should return true when platform authenticator is available', async () => {
      const originalPKC = (global as any).PublicKeyCredential;
      (global as any).PublicKeyCredential = {
        isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(true),
      };
      const available = await isBiometricAvailable();
      expect(available).toBe(true);
      (global as any).PublicKeyCredential = originalPKC;
    });

    it('should return false when platform authenticator is not available', async () => {
      const originalPKC = (global as any).PublicKeyCredential;
      (global as any).PublicKeyCredential = {
        isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(false),
      };
      const available = await isBiometricAvailable();
      expect(available).toBe(false);
      (global as any).PublicKeyCredential = originalPKC;
    });
  });

  describe('registerBiometricCredential', () => {
    it('should throw error when biometric is not available', async () => {
      const originalPKC = (global as any).PublicKeyCredential;
      (global as any).PublicKeyCredential = undefined;
      await expect(registerBiometricCredential('user1', 'Test User')).rejects.toThrow(
        'Biometric authentication not available'
      );
      (global as any).PublicKeyCredential = originalPKC;
    });

    it('should throw error when user cancels registration', async () => {
      const originalPKC = (global as any).PublicKeyCredential;
      const originalNav = (global as any).navigator.credentials;
      (global as any).PublicKeyCredential = {
        isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(true),
      };
      (global as any).navigator.credentials = {
        create: vi.fn().mockRejectedValue(new DOMException('User cancelled', 'NotAllowedError')),
      };

      await expect(registerBiometricCredential('user1', 'Test User')).rejects.toThrow(
        'User cancelled biometric registration'
      );

      (global as any).PublicKeyCredential = originalPKC;
      (global as any).navigator.credentials = originalNav;
    });

    it('should successfully register credential', async () => {
      const originalPKC = (global as any).PublicKeyCredential;
      const originalNav = (global as any).navigator.credentials;
      (global as any).PublicKeyCredential = {
        isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(true),
      };
      const mockCredential = {
        rawId: new Uint8Array([1, 2, 3]),
      };
      (global as any).navigator.credentials = {
        create: vi.fn().mockResolvedValue(mockCredential),
      };

      const result = await registerBiometricCredential('user1', 'Test User');
      expect(result).toBe(true);
      expect(hasBiometricCredential('user1')).toBe(true);

      (global as any).PublicKeyCredential = originalPKC;
      (global as any).navigator.credentials = originalNav;
    });
  });

  describe('authenticateWithBiometric', () => {
    it('should throw error when biometric is not available', async () => {
      const originalPKC = (global as any).PublicKeyCredential;
      (global as any).PublicKeyCredential = undefined;
      await expect(authenticateWithBiometric('user1')).rejects.toThrow(
        'Biometric authentication not available'
      );
      (global as any).PublicKeyCredential = originalPKC;
    });

    it('should throw error when no credential is registered', async () => {
      const originalPKC = (global as any).PublicKeyCredential;
      (global as any).PublicKeyCredential = {
        isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(true),
      };

      await expect(authenticateWithBiometric('user1')).rejects.toThrow(
        'No biometric credential registered'
      );

      (global as any).PublicKeyCredential = originalPKC;
    });

    it('should throw error when user cancels authentication', async () => {
      const originalPKC = (global as any).PublicKeyCredential;
      const originalNav = (global as any).navigator.credentials;
      (global as any).PublicKeyCredential = {
        isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(true),
      };
      localStorage.setItem('biometric_credential_user1', 'AQID');
      (global as any).navigator.credentials = {
        get: vi.fn().mockRejectedValue(new DOMException('User cancelled', 'NotAllowedError')),
      };

      await expect(authenticateWithBiometric('user1')).rejects.toThrow(
        'User cancelled biometric authentication'
      );

      (global as any).PublicKeyCredential = originalPKC;
      (global as any).navigator.credentials = originalNav;
    });

    it('should successfully authenticate', async () => {
      const originalPKC = (global as any).PublicKeyCredential;
      const originalNav = (global as any).navigator.credentials;
      (global as any).PublicKeyCredential = {
        isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(true),
      };
      localStorage.setItem('biometric_credential_user1', 'AQID');
      (global as any).navigator.credentials = {
        get: vi.fn().mockResolvedValue({}),
      };

      const result = await authenticateWithBiometric('user1');
      expect(result).toBe(true);

      (global as any).PublicKeyCredential = originalPKC;
      (global as any).navigator.credentials = originalNav;
    });
  });

  describe('removeBiometricCredential', () => {
    it('should remove credential from localStorage', () => {
      localStorage.setItem('biometric_credential_user1', 'AQID');
      expect(hasBiometricCredential('user1')).toBe(true);

      removeBiometricCredential('user1');
      expect(hasBiometricCredential('user1')).toBe(false);
    });
  });

  describe('hasBiometricCredential', () => {
    it('should return true when credential exists', () => {
      localStorage.setItem('biometric_credential_user1', 'AQID');
      expect(hasBiometricCredential('user1')).toBe(true);
    });

    it('should return false when credential does not exist', () => {
      expect(hasBiometricCredential('user1')).toBe(false);
    });
  });
});
