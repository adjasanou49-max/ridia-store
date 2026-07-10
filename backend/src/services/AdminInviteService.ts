import { nanoid } from 'nanoid';
import { UserRole } from '@prisma/client';
import { prisma } from '../config/prisma';
import { AppError } from '../middleware/errorHandler';

const INVITABLE_ROLES: UserRole[] = [UserRole.ADMIN, UserRole.PURCHASING_AGENT];

export class AdminInviteService {
  /**
   * Génère un code d'invitation à usage unique. Réservé au SUPER_ADMIN au
   * niveau de la route (voir admin.routes.ts) - ce service ne le revérifie
   * pas, la route est la seule porte d'entrée. Le rôle accordé est choisi
   * ici, jamais SUPER_ADMIN via un simple code (trop sensible pour ça).
   */
  async generateCode(createdByUserId: string, expiresInHours = 72, intendedRole: UserRole = UserRole.ADMIN) {
    if (!INVITABLE_ROLES.includes(intendedRole)) {
      throw new AppError("Rôle invalide pour un code d'invitation", 422);
    }
    const prefix = intendedRole === UserRole.PURCHASING_AGENT ? 'AGENT' : 'ADMIN';
    const code = `${prefix}-${nanoid(10).toUpperCase()}`;
    return prisma.adminInviteCode.create({
      data: {
        code,
        createdBy: createdByUserId,
        intendedRole,
        expiresAt: new Date(Date.now() + expiresInHours * 3600_000),
      },
    });
  }

  async listCodes() {
    return prisma.adminInviteCode.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async revokeCode(id: string) {
    await prisma.adminInviteCode.delete({ where: { id } });
  }

  /**
   * Active le rôle prévu par le code pour l'utilisateur qui l'entre. Le
   * code est marqué comme utilisé et devient inutilisable ensuite - aucun
   * moyen d'en générer un nouveau sans repasser par le SUPER_ADMIN.
   */
  async redeemCode(userId: string, code: string) {
    const invite = await prisma.adminInviteCode.findUnique({ where: { code } });

    if (!invite) throw new AppError('Code invalide', 422);
    if (invite.usedBy) throw new AppError('Ce code a déjà été utilisé', 422);
    if (invite.expiresAt < new Date()) throw new AppError('Ce code a expiré', 422);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('Utilisateur non trouvé', 404);
    if (user.role !== UserRole.CUSTOMER) {
      throw new AppError('Ce compte a déjà un rôle spécial', 422);
    }

    await prisma.$transaction([
      prisma.adminInviteCode.update({
        where: { id: invite.id },
        data: { usedBy: userId, usedAt: new Date() },
      }),
      prisma.user.update({ where: { id: userId }, data: { role: invite.intendedRole } }),
    ]);
  }
}

export const adminInviteService = new AdminInviteService();
