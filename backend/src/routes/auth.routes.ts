import { Router } from 'express';
import { authService } from '../services/AuthService';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { authRateLimiter } from '../middleware/rateLimit';
import {
  registerSchema,
  loginSchema,
  updateProfileSchema,
  changePasswordSchema,
  privacySettingsSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../utils/validators';
import { authenticate } from '../middleware/auth';
import { loyaltyService } from '../services/LoyaltyService';
import { referralService } from '../services/ReferralService';
import { adminInviteService } from '../services/AdminInviteService';

const router = Router();

router.post(
  '/register',
  authRateLimiter,
  asyncHandler(async (req, res) => {
    const data = registerSchema.parse(req.body);
    const result = await authService.register(data);

    // Code de parrainage optionnel - appliqué silencieusement, n'échoue jamais l'inscription
    if (req.body.referralCode) {
      await referralService.applyReferralCode(result.user.id, req.body.referralCode).catch(() => {});
    }

    res.status(201).json(result);
  })
);

router.post(
  '/login',
  authRateLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const result = await authService.login(email, password);
    res.json(result);
  })
);

router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'refreshToken requis' });
    const tokens = await authService.refreshAccessToken(refreshToken);
    res.json(tokens);
  })
);

router.post(
  '/logout',
  authenticate,
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    if (refreshToken) await authService.logout(refreshToken);
    res.status(204).send();
  })
);

router.post(
  '/forgot-password',
  authRateLimiter,
  asyncHandler(async (req, res) => {
    const { email } = forgotPasswordSchema.parse(req.body);
    await authService.forgotPassword(email);
    // Réponse identique que le compte existe ou non - évite l'énumération d'emails
    res.json({ message: 'Si ce compte existe, un email de réinitialisation a été envoyé.' });
  })
);

router.post(
  '/reset-password',
  authRateLimiter,
  asyncHandler(async (req, res) => {
    const { token, newPassword } = resetPasswordSchema.parse(req.body);
    await authService.resetPassword(token, newPassword);
    res.status(204).send();
  })
);

// ---------------- Vérification email ----------------
router.post(
  '/send-email-verification',
  authenticate,
  authRateLimiter,
  asyncHandler(async (req, res) => {
    await authService.sendEmailVerification(req.auth!.userId);
    res.json({ message: 'Email de vérification envoyé' });
  })
);

router.post(
  '/verify-email',
  asyncHandler(async (req, res) => {
    const { token } = req.body;
    if (!token || typeof token !== 'string') throw new AppError('Token requis', 422);
    await authService.verifyEmail(token);
    res.status(204).send();
  })
);

// ---------------- Vérification téléphone (OTP) ----------------
router.post(
  '/send-phone-otp',
  authenticate,
  authRateLimiter,
  asyncHandler(async (req, res) => {
    await authService.sendPhoneOtp(req.auth!.userId);
    res.json({ message: 'Code envoyé par WhatsApp' });
  })
);

router.post(
  '/verify-phone-otp',
  authenticate,
  authRateLimiter,
  asyncHandler(async (req, res) => {
    const { code } = req.body;
    if (!code || typeof code !== 'string') throw new AppError('Code requis', 422);
    await authService.verifyPhoneOtp(req.auth!.userId, code);
    res.status(204).send();
  })
);

// ---------------- Fidélité ----------------
router.get(
  '/loyalty',
  authenticate,
  asyncHandler(async (req, res) => {
    const account = await loyaltyService.getAccountWithHistory(req.auth!.userId);
    res.json(account);
  })
);

// ---------------- Parrainage ----------------
router.get(
  '/referral/my-code',
  authenticate,
  asyncHandler(async (req, res) => {
    const code = await referralService.getOrCreateMyCode(req.auth!.userId);
    res.json({ code });
  })
);

router.get(
  '/referral/mine',
  authenticate,
  asyncHandler(async (req, res) => {
    const referrals = await referralService.getMyReferrals(req.auth!.userId);
    res.json(referrals);
  })
);

// ---------------- Activation d'un code d'invitation admin ----------------
// N'importe quel utilisateur connecté peut tenter d'entrer un code, mais seul
// un code valide généré par le SUPER_ADMIN fonctionne réellement.
router.post(
  '/redeem-admin-code',
  authenticate,
  authRateLimiter,
  asyncHandler(async (req, res) => {
    const { code } = req.body;
    if (!code) throw new AppError('Code requis', 422);
    await adminInviteService.redeemCode(req.auth!.userId, code);
    res.status(204).send();
  })
);

// Retourne le profil de l'utilisateur actuellement connecté (basé sur le JWT)
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const profile = await authService.getProfile(req.auth!.userId);
    res.json(profile);
  })
);

// ---------------- Profil ----------------
router.patch(
  '/profile',
  authenticate,
  asyncHandler(async (req, res) => {
    const data = updateProfileSchema.parse(req.body);
    const user = await authService.updateProfile(req.auth!.userId, data);
    res.json(user);
  })
);

// ---------------- Sécurité ----------------
router.patch(
  '/password',
  authenticate,
  authRateLimiter,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    await authService.changePassword(req.auth!.userId, currentPassword, newPassword);
    res.status(204).send();
  })
);

// ---------------- Confidentialité ----------------
router.get(
  '/privacy',
  authenticate,
  asyncHandler(async (req, res) => {
    const settings = await authService.getPrivacySettings(req.auth!.userId);
    res.json(settings);
  })
);

router.patch(
  '/privacy',
  authenticate,
  asyncHandler(async (req, res) => {
    const data = privacySettingsSchema.parse(req.body);
    const settings = await authService.updatePrivacySettings(req.auth!.userId, data);
    res.json(settings);
  })
);

// ---------------- RGPD ----------------
// Export de toutes les données personnelles (droit d'accès RGPD)
router.get(
  '/export-data',
  authenticate,
  asyncHandler(async (req, res) => {
    const data = await authService.exportUserData(req.auth!.userId);
    res.setHeader('Content-Disposition', 'attachment; filename="ridia-store-mes-donnees.json"');
    res.json(data);
  })
);

// Demande de suppression de compte (droit à l'oubli RGPD)
router.delete(
  '/account',
  authenticate,
  asyncHandler(async (req, res) => {
    await authService.requestAccountDeletion(req.auth!.userId);
    res.status(204).send();
  })
);

export default router;
