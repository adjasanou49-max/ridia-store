import { prisma } from '../config/prisma';
import { AppError } from '../middleware/errorHandler';
import type { Prisma } from '@prisma/client';

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
    // Les deux écritures sont dans une transaction : sans ça, deux créations
    // "par défaut" simultanées pourraient toutes les deux passer le updateMany
    // avant qu'aucune n'ait encore créé sa ligne, laissant deux adresses
    // par défaut en même temps.
    const existingCount = await prisma.address.count({ where: { userId } });
    const shouldBeDefault = input.isDefault || existingCount === 0;

    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (shouldBeDefault) {
        await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      }
      return tx.address.create({
        data: { ...input, userId, isDefault: shouldBeDefault },
      });
    });
  }

  async update(userId: string, addressId: string, input: Partial<AddressInput>) {
    const existing = await prisma.address.findFirst({ where: { id: addressId, userId } });
    if (!existing) throw new AppError('Adresse non trouvée', 404);

    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (input.isDefault) {
        await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      }
      return tx.address.update({ where: { id: addressId }, data: input });
    });
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
