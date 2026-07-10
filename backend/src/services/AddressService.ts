import { prisma } from '../config/prisma';
import { AppError } from '../middleware/errorHandler';

interface AddressInput {
  fullName: string;
  phone: string;
  country?: string;
  city: string;
  district?: string;
  streetLine1: string;
  streetLine2?: string;
  landmark?: string;
  isDefault?: boolean;
}

export class AddressService {
  async listForUser(userId: string) {
    return prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async create(userId: string, input: AddressInput) {
    // Si c'est la toute première adresse, ou explicitement demandée par défaut,
    // on désactive le flag par défaut sur les autres adresses de l'utilisateur.
    const existingCount = await prisma.address.count({ where: { userId } });
    const shouldBeDefault = input.isDefault || existingCount === 0;

    if (shouldBeDefault) {
      await prisma.address.updateMany({ where: { userId }, data: { isDefault: false } });
    }

    return prisma.address.create({
      data: { ...input, userId, isDefault: shouldBeDefault },
    });
  }

  async update(userId: string, addressId: string, input: Partial<AddressInput>) {
    const existing = await prisma.address.findFirst({ where: { id: addressId, userId } });
    if (!existing) throw new AppError('Adresse non trouvée', 404);

    if (input.isDefault) {
      await prisma.address.updateMany({ where: { userId }, data: { isDefault: false } });
    }

    return prisma.address.update({ where: { id: addressId }, data: input });
  }

  async remove(userId: string, addressId: string) {
    const existing = await prisma.address.findFirst({ where: { id: addressId, userId } });
    if (!existing) throw new AppError('Adresse non trouvée', 404);

    await prisma.address.delete({ where: { id: addressId } });

    // Si l'adresse supprimée était la par défaut, on en réassigne une autre automatiquement
    if (existing.isDefault) {
      const next = await prisma.address.findFirst({ where: { userId } });
      if (next) await prisma.address.update({ where: { id: next.id }, data: { isDefault: true } });
    }
  }
}

export const addressService = new AddressService();
