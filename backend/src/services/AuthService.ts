import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { AppError } from '../middleware/errorHandler';
import { sendGridAdapter } from '../integrations/notifications/SendGridAdapter';
import { whatsAppAdapter } from '../integrations/notifications/WhatsAppAdapter';
import { UserRole } from '@prisma/client';

interface RegisterInput {
  email: string;
  phone?: string;
  password: string;
  firstName: string;
  lastName: string;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export class AuthService {
  async register(input: RegisterInput) {
    // Une chaîne vide n'est pas "pas de téléphone" pour la contrainte @unique de la
    // base — deux inscriptions avec phone="" entreraient en conflit. On normalise ici.
    const phone = input.phone?.trim() || undefined;

    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw new AppError('Un compte existe déjà avec cet email', 409);
    }

    if (phone) {
      const existingPhone = await prisma.user.findUnique({ where: { phone } });
      if (existingPhone) {
        throw new AppError('Un compte existe déjà avec ce numéro de téléphone', 409);
      }
    }

    const passwordHash = await bcrypt.hash(input.password, 12);

    const user = await prisma.user.create({
      data: {
        email: input.email,
        phone,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        role: UserRole.CUSTOMER,
        loyaltyAccount: { create: { pointsBalance: 0 } },
      },
    });

    const tokens = await this.generateTokenPair(user.id, user.role);
    sendGridAdapter.sendWelcomeEmail(user.email, user.firstName).catch(() => {});
    return { user: this.sanitizeUser(user), ...tokens };
  }

  async login(email: string, password: string) {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { seller: true },
    });

    if (!user || !user.isActive) {
      throw new AppError('Email ou mot de passe incorrect', 401);
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      throw new AppError('Email ou mot de passe incorrect', 401);
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const tokens = await this.generateTokenPair(user.id, user.role, user.seller?.id);
    return { user: this.sanitizeUser(user), ...tokens };
  }

  async refreshAccessToken(refreshToken: string): Promise<TokenPair> {
    let payload: { userId: string };
    try {
      payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET, { algorithms: ['HS256'] }) as { userId: string };
    } catch {
      throw new AppError('Refresh token invalide ou expiré', 401);
    }

    const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
    if (!stored || stored.revoked || stored.expiresAt < new Date()) {
      throw new AppError('Refresh token invalide ou expiré', 401);
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { seller: true },
    });
    if (!user) throw new AppError('Utilisateur non trouvé', 404);

    // Rotate refresh token
    await prisma.refreshToken.update({ where: { id: stored.id }, data: { revoked: true } });

    return this.generateTokenPair(user.id, user.role, user.seller?.id);
  }

  async logout(refreshToken: string) {
    await prisma.refreshToken.updateMany({
      where: { token: refreshToken },
      data: { revoked: true },
    });
  }

  private async generateTokenPair(
    userId: string,
    role: UserRole,
    sellerId?: string
  ): Promise<TokenPair> {
    const accessToken = jwt.sign({ userId, role, sellerId }, env.JWT_ACCESS_SECRET, {
      expiresIn: env.JWT_ACCESS_EXPIRES_IN,
    } as jwt.SignOptions);

    const refreshToken = jwt.sign({ userId }, env.JWT_REFRESH_SECRET, {
      expiresIn: env.JWT_REFRESH_EXPIRES_IN,
    } as jwt.SignOptions);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await prisma.refreshToken.create({
      data: { token: refreshToken, userId, expiresAt },
    });

    return { accessToken, refreshToken };
  }

  private sanitizeUser(user: any) {
    const { passwordHash, ...safe } = user;
    return safe;
  }

  async getProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { seller: true },
    });
    if (!user) throw new AppError('Utilisateur non trouvé', 404);
    return this.sanitizeUser(user);
  }

  /** Mise à jour des informations de profil (nom, téléphone, avatar) */
  async updateProfile(
    userId: string,
    input: { firstName?: string; lastName?: string; phone?: string; avatarUrl?: string }
  ) {
    if (input.phone) {
      const existing = await prisma.user.findFirst({
        where: { phone: input.phone, NOT: { id: userId } },
      });
      if (existing) throw new AppError('Ce numéro est déjà utilisé par un autre compte', 409);
    }

    const user = await prisma.user.update({ where: { id: userId }, data: input });
    return this.sanitizeUser(user);
  }

  /** Changement de mot de passe - exige l'ancien mot de passe */
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('Utilisateur non trouvé', 404);

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw new AppError('Mot de passe actuel incorrect', 401);

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash } });

    // Révoque tous les refresh tokens existants - force une reconnexion partout
    await prisma.refreshToken.updateMany({ where: { userId }, data: { revoked: true } });
  }

  /**
   * Demande de réinitialisation - génère un token de courte durée et envoie le lien par
   * email. Ne révèle jamais si l'email existe ou non (protection contre l'énumération).
   */
  async forgotPassword(email: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return; // silencieux - on ne confirme pas l'existence du compte

    const resetToken = jwt.sign({ userId: user.id, purpose: 'password_reset' }, env.JWT_ACCESS_SECRET, {
      expiresIn: '1h',
    });

    const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    await sendGridAdapter.sendPasswordReset(user.email, resetUrl);
  }

  async resetPassword(token: string, newPassword: string) {
    let payload: { userId: string; purpose: string };
    try {
      payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] }) as typeof payload;
    } catch {
      throw new AppError('Lien de réinitialisation invalide ou expiré', 401);
    }

    if (payload.purpose !== 'password_reset') {
      throw new AppError('Lien de réinitialisation invalide', 401);
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: payload.userId }, data: { passwordHash } });
    await prisma.refreshToken.updateMany({ where: { userId: payload.userId }, data: { revoked: true } });
  }

  // ---------------- Vérification email ----------------
  async sendEmailVerification(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('Utilisateur non trouvé', 404);
    if (user.emailVerified) return;

    const token = jwt.sign({ userId: user.id, purpose: 'email_verify' }, env.JWT_ACCESS_SECRET, {
      expiresIn: '24h',
    });
    const verifyUrl = `${env.FRONTEND_URL}/verify-email?token=${token}`;
    await sendGridAdapter.sendEmail(
      user.email,
      'Vérifie ton adresse email - Ridia Store',
      `<h2>Confirme ton email</h2><p><a href="${verifyUrl}">Clique ici pour vérifier ton adresse email</a></p><p>Ce lien expire dans 24h.</p>`
    );
  }

  async verifyEmail(token: string) {
    let payload: { userId: string; purpose: string };
    try {
      payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] }) as typeof payload;
    } catch {
      throw new AppError('Lien de vérification invalide ou expiré', 401);
    }
    if (payload.purpose !== 'email_verify') throw new AppError('Lien de vérification invalide', 401);

    await prisma.user.update({ where: { id: payload.userId }, data: { emailVerified: true } });
  }

  // ---------------- Vérification téléphone (OTP par WhatsApp) ----------------
  async sendPhoneOtp(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('Utilisateur non trouvé', 404);
    if (!user.phone) throw new AppError('Aucun numéro de téléphone enregistré', 422);

    const code = String(Math.floor(100000 + Math.random() * 900000)); // 6 chiffres
    await prisma.user.update({
      where: { id: userId },
      data: { phoneOtpCode: code, phoneOtpExpiresAt: new Date(Date.now() + 10 * 60_000) },
    });

    await whatsAppAdapter.sendTextMessage(
      user.phone,
      `Ton code de vérification Ridia Store est : ${code} (valable 10 minutes)`
    );
  }

  async verifyPhoneOtp(userId: string, code: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('Utilisateur non trouvé', 404);

    if (!user.phoneOtpCode || !user.phoneOtpExpiresAt || user.phoneOtpExpiresAt < new Date()) {
      throw new AppError('Code expiré - demande un nouveau code', 422);
    }
    if (user.phoneOtpCode !== code) {
      throw new AppError('Code incorrect', 422);
    }

    await prisma.user.update({
      where: { id: userId },
      data: { phoneVerified: true, phoneOtpCode: null, phoneOtpExpiresAt: null },
    });
  }

  /** Préférences de confidentialité (notifications, marketing) */
  async getPrivacySettings(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { notifyByEmail: true, notifyByWhatsapp: true, marketingOptIn: true },
    });
    if (!user) throw new AppError('Utilisateur non trouvé', 404);
    return user;
  }

  async updatePrivacySettings(
    userId: string,
    input: { notifyByEmail?: boolean; notifyByWhatsapp?: boolean; marketingOptIn?: boolean }
  ) {
    return prisma.user.update({
      where: { id: userId },
      data: input,
      select: { notifyByEmail: true, notifyByWhatsapp: true, marketingOptIn: true },
    });
  }

  /** Export RGPD - toutes les données personnelles de l'utilisateur au format JSON */
  async exportUserData(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        addresses: true,
        orders: { include: { items: true, payments: true } },
        seller: true,
        loyaltyAccount: true,
        notifications: true,
      },
    });
    if (!user) throw new AppError('Utilisateur non trouvé', 404);
    const { passwordHash, ...safeData } = user;
    return safeData;
  }

  /**
   * Demande de suppression de compte (droit à l'oubli RGPD).
   * On désactive immédiatement le compte et on anonymise les données identifiantes,
   * mais on conserve les commandes (obligations comptables/légales) sous forme anonymisée.
   */
  async requestAccountDeletion(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('Utilisateur non trouvé', 404);

    await prisma.user.update({
      where: { id: userId },
      data: {
        isActive: false,
        deletionRequestedAt: new Date(),
        email: `deleted-${userId}@ridia-store.invalid`,
        phone: null,
        firstName: 'Compte',
        lastName: 'Supprimé',
        avatarUrl: null,
      },
    });

    await prisma.refreshToken.updateMany({ where: { userId }, data: { revoked: true } });
  }
}

export const authService = new AuthService();
