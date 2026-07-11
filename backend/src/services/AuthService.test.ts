jest.mock('../config/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    refreshToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

jest.mock('bcryptjs', () => ({ hash: jest.fn(), compare: jest.fn() }));
jest.mock('jsonwebtoken', () => ({ sign: jest.fn(() => 'signed-token'), verify: jest.fn() }));
jest.mock('../integrations/notifications/SendGridAdapter', () => ({
  sendGridAdapter: {
    sendWelcomeEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordReset: jest.fn().mockResolvedValue(undefined),
    sendEmail: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('../integrations/notifications/WhatsAppAdapter', () => ({
  whatsAppAdapter: { sendTextMessage: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('../config/env', () => ({
  env: {
    JWT_ACCESS_SECRET: 'test-access',
    JWT_REFRESH_SECRET: 'test-refresh',
    JWT_ACCESS_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '30d',
    FRONTEND_URL: 'https://ridia-store.test',
  },
}));

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/prisma';
import { AuthService } from './AuthService';

const mockedPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
  refreshToken: {
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
};
const mockedBcrypt = bcrypt as unknown as { hash: jest.Mock; compare: jest.Mock };
const mockedJwt = jwt as unknown as { sign: jest.Mock; verify: jest.Mock };

describe('AuthService', () => {
  const service = new AuthService();

  beforeEach(() => {
    jest.clearAllMocks();
    mockedPrisma.refreshToken.create.mockResolvedValue({});
  });

  describe('login', () => {
    const dbUser = {
      id: 'u1',
      email: 'ria@ridiastore.com',
      passwordHash: 'hashed',
      isActive: true,
      role: 'CUSTOMER',
      seller: null,
    };

    it('refuse un mot de passe incorrect sans révéler si le compte existe', async () => {
      mockedPrisma.user.findUnique.mockResolvedValue(dbUser);
      mockedBcrypt.compare.mockResolvedValue(false);

      await expect(service.login('ria@ridiastore.com', 'wrong')).rejects.toThrow(
        'Email ou mot de passe incorrect'
      );
    });

    it("refuse un compte désactivé avec le même message générique qu'un mauvais mot de passe", async () => {
      mockedPrisma.user.findUnique.mockResolvedValue({ ...dbUser, isActive: false });

      await expect(service.login('ria@ridiastore.com', 'whatever')).rejects.toThrow(
        'Email ou mot de passe incorrect'
      );
      // Ne doit même pas tenter de comparer le mot de passe pour un compte désactivé
      expect(mockedBcrypt.compare).not.toHaveBeenCalled();
    });

    it('refuse un email inexistant avec le même message générique (anti-énumération)', async () => {
      mockedPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login('inconnu@test.com', 'whatever')).rejects.toThrow(
        'Email ou mot de passe incorrect'
      );
    });

    it('connecte avec succès et met à jour lastLoginAt', async () => {
      mockedPrisma.user.findUnique.mockResolvedValue(dbUser);
      mockedBcrypt.compare.mockResolvedValue(true);

      const result = await service.login('ria@ridiastore.com', 'correct');

      expect(result.user.email).toBe('ria@ridiastore.com');
      expect((result.user as any).passwordHash).toBeUndefined(); // jamais renvoyé au client
      expect(mockedPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { lastLoginAt: expect.any(Date) },
      });
    });
  });

  describe('register', () => {
    it('refuse si un compte existe déjà avec cet email', async () => {
      mockedPrisma.user.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        service.register({
          email: 'ria@ridiastore.com',
          password: 'pw',
          firstName: 'Ria',
          lastName: 'A',
        })
      ).rejects.toThrow('Un compte existe déjà avec cet email');
      expect(mockedPrisma.user.create).not.toHaveBeenCalled();
    });

    it('hash le mot de passe avant stockage (jamais en clair)', async () => {
      mockedPrisma.user.findUnique.mockResolvedValue(null);
      mockedBcrypt.hash.mockResolvedValue('hashed-pw');
      mockedPrisma.user.create.mockResolvedValue({
        id: 'u2',
        email: 'new@test.com',
        role: 'CUSTOMER',
        passwordHash: 'hashed-pw',
      });

      await service.register({
        email: 'new@test.com',
        password: 'plaintext',
        firstName: 'A',
        lastName: 'B',
      });

      expect(mockedBcrypt.hash).toHaveBeenCalledWith('plaintext', 12);
      expect(mockedPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ passwordHash: 'hashed-pw' }) })
      );
    });
  });

  describe('refreshAccessToken', () => {
    it('rejette un refresh token expiré côté JWT', async () => {
      mockedJwt.verify.mockImplementation(() => {
        throw new Error('expired');
      });

      await expect(service.refreshAccessToken('bad-token')).rejects.toThrow(
        'Refresh token invalide ou expiré'
      );
    });

    it('rejette un refresh token révoqué même si le JWT est valide', async () => {
      mockedJwt.verify.mockReturnValue({ userId: 'u1' });
      mockedPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt1',
        revoked: true,
        expiresAt: new Date(Date.now() + 100000),
      });

      await expect(service.refreshAccessToken('revoked-token')).rejects.toThrow(
        'Refresh token invalide ou expiré'
      );
    });

    it('fait tourner (rotate) le refresh token : l\'ancien est révoqué après usage', async () => {
      mockedJwt.verify.mockReturnValue({ userId: 'u1' });
      mockedPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt1',
        revoked: false,
        expiresAt: new Date(Date.now() + 100000),
      });
      mockedPrisma.user.findUnique.mockResolvedValue({ id: 'u1', role: 'CUSTOMER', seller: null });

      await service.refreshAccessToken('valid-token');

      expect(mockedPrisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt1' },
        data: { revoked: true },
      });
    });
  });

  describe('changePassword', () => {
    it("refuse si l'ancien mot de passe est incorrect", async () => {
      mockedPrisma.user.findUnique.mockResolvedValue({ id: 'u1', passwordHash: 'hashed' });
      mockedBcrypt.compare.mockResolvedValue(false);

      await expect(service.changePassword('u1', 'wrong-old', 'newpw')).rejects.toThrow(
        'Mot de passe actuel incorrect'
      );
      expect(mockedPrisma.user.update).not.toHaveBeenCalled();
    });

    it('révoque toutes les sessions existantes après un changement de mot de passe réussi', async () => {
      mockedPrisma.user.findUnique.mockResolvedValue({ id: 'u1', passwordHash: 'hashed' });
      mockedBcrypt.compare.mockResolvedValue(true);
      mockedBcrypt.hash.mockResolvedValue('new-hashed');

      await service.changePassword('u1', 'old', 'new');

      expect(mockedPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        data: { revoked: true },
      });
    });
  });

  describe('forgotPassword - anti-énumération', () => {
    it("ne lève aucune erreur si l'email n'existe pas (ne révèle rien à l'appelant)", async () => {
      mockedPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.forgotPassword('inconnu@test.com')).resolves.toBeUndefined();
    });
  });

  describe('resetPassword', () => {
    it('rejette un token dont le "purpose" ne correspond pas (ex: un token email_verify réutilisé)', async () => {
      mockedJwt.verify.mockReturnValue({ userId: 'u1', purpose: 'email_verify' });

      await expect(service.resetPassword('token', 'newpw')).rejects.toThrow(
        'Lien de réinitialisation invalide'
      );
      expect(mockedPrisma.user.update).not.toHaveBeenCalled();
    });

    it('révoque toutes les sessions après une réinitialisation réussie', async () => {
      mockedJwt.verify.mockReturnValue({ userId: 'u1', purpose: 'password_reset' });
      mockedBcrypt.hash.mockResolvedValue('new-hash');

      await service.resetPassword('valid-token', 'newpw');

      expect(mockedPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        data: { revoked: true },
      });
    });
  });

  describe('verifyPhoneOtp', () => {
    it('rejette un code expiré', async () => {
      mockedPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        phoneOtpCode: '123456',
        phoneOtpExpiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.verifyPhoneOtp('u1', '123456')).rejects.toThrow(
        'Code expiré - demande un nouveau code'
      );
    });

    it('rejette un code incorrect', async () => {
      mockedPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        phoneOtpCode: '123456',
        phoneOtpExpiresAt: new Date(Date.now() + 100000),
      });

      await expect(service.verifyPhoneOtp('u1', '000000')).rejects.toThrow('Code incorrect');
    });

    it('valide un code correct et non expiré, puis efface le code utilisé', async () => {
      mockedPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        phoneOtpCode: '123456',
        phoneOtpExpiresAt: new Date(Date.now() + 100000),
      });

      await service.verifyPhoneOtp('u1', '123456');

      expect(mockedPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { phoneVerified: true, phoneOtpCode: null, phoneOtpExpiresAt: null },
      });
    });
  });

  describe('requestAccountDeletion (RGPD)', () => {
    it('anonymise les données identifiantes sans supprimer le compte (conservation légale)', async () => {
      mockedPrisma.user.findUnique.mockResolvedValue({ id: 'u1' });

      await service.requestAccountDeletion('u1');

      expect(mockedPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: expect.objectContaining({
          isActive: false,
          email: 'deleted-u1@ridia-store.invalid',
          phone: null,
        }),
      });
      expect(mockedPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        data: { revoked: true },
      });
    });
  });
});
