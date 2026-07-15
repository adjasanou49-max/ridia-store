import { nanoid } from 'nanoid';
import { Prisma, UserRole, SellerStatus } from '@prisma/client';
import { prisma } from '../config/prisma';
import { AppError } from '../middleware/errorHandler';

const INVITABLE_ROLES: UserRole[] = [UserRole.ADMIN, UserRole.PURCHASING_AGENT, UserRole.SELLER];

/** Slug unique dérivé du nom - garde ridia-store cohérent avec le reste (categories, etc.) */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

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
    const prefix =
      intendedRole === UserRole.PURCHASING_AGENT ? 'AGENT' : intendedRole === UserRole.SELLER ? 'SELLER' : 'ADMIN';
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
   *
   * Correction race condition : deux requêtes simultanées avec le même code
   * pouvaient auparavant toutes les deux passer le contrôle "usedBy === null"
   * (lu avant qu'aucune des deux n'ait écrit), puis toutes les deux exécuter
   * la transaction — accordant le rôle à deux utilisateurs différents avec un
   * code censé être à usage unique. On réclame maintenant le code de façon
   * atomique via updateMany conditionné sur usedBy: null ; seule la requête
   * dont le updateMany affecte réellement une ligne peut continuer.
   */
  async redeemCode(userId: string, code: string): Promise<UserRole> {
    const invite = await prisma.adminInviteCode.findUnique({ where: { code } });

    if (!invite) throw new AppError('Code invalide', 422);
    if (invite.usedBy) throw new AppError('Ce code a déjà été utilisé', 422);
    if (invite.expiresAt < new Date()) throw new AppError('Ce code a expiré', 422);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('Utilisateur non trouvé', 404);
    if (user.role !== UserRole.CUSTOMER) {
      throw new AppError('Ce compte a déjà un rôle spécial', 422);
    }

    // Réclamation atomique : ne réussit que si le code est encore libre au
    // moment précis de l'écriture (pas juste au moment de la lecture ci-dessus).
    // Les deux écritures sont dans la même transaction : si l'attribution du
    // rôle échouait, la réclamation du code serait annulée aussi (pas de code
    // "brûlé" sans rôle accordé).
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const claim = await tx.adminInviteCode.updateMany({
        where: { id: invite.id, usedBy: null },
        data: { usedBy: userId, usedAt: new Date() },
      });

      if (claim.count === 0) {
        throw new AppError('Ce code a déjà été utilisé', 422);
      }

      await tx.user.update({ where: { id: userId }, data: { role: invite.intendedRole } });

      // Un rôle SELLER seul ne suffit pas : les routes produits exigent un
      // req.auth.sellerId réel (voir product.routes.ts), donc sans ce profil
      // la personne invitée se retrouverait avec un rôle "vendeur" mais
      // aucun moyen d'ajouter un produit - le même piège que rencontré avec
      // le compte admin avant qu'on lui crée sa propre boutique.
      if (invite.intendedRole === UserRole.SELLER) {
        const baseSlug = slugify(`${user.firstName}-${user.lastName}`) || 'boutique';
        let slug = baseSlug;
        let attempt = 1;
        while (await tx.seller.findUnique({ where: { storeSlug: slug } })) {
          slug = `${baseSlug}-${++attempt}`;
        }
        await tx.seller.upsert({
          where: { userId },
          create: {
            userId,
            storeName: `${user.firstName} ${user.lastName}`,
            storeSlug: slug,
            status: SellerStatus.APPROVED,
            approvedAt: new Date(),
          },
          update: {},
        });
      }
    });

    return invite.intendedRole;
  }
}

export const adminInviteService = new AdminInviteService();
