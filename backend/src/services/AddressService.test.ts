jest.mock('../config/prisma', () => {
  const mockPrisma: any = {
    address: {
      count: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  mockPrisma.$transaction = jest.fn(async (callback: (tx: any) => any) => callback(mockPrisma));
  return { prisma: mockPrisma };
});

import { prisma } from '../config/prisma';
import { AddressService } from './AddressService';

const mockedPrisma = prisma as unknown as {
  address: {
    count: jest.Mock;
    findFirst: jest.Mock;
    updateMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  $transaction: jest.Mock;
};

const baseInput = {
  fullName: 'Ria',
  phone: '+22670000000',
  city: 'Ouagadougou',
  streetLine1: 'Rue 1',
};

describe('AddressService.create', () => {
  const service = new AddressService();

  beforeEach(() => {
    jest.clearAllMocks();
    mockedPrisma.address.create.mockResolvedValue({ id: 'addr-1' });
  });

  it('la toute première adresse devient automatiquement la par défaut', async () => {
    mockedPrisma.address.count.mockResolvedValue(0);

    await service.create('u1', baseInput);

    expect(mockedPrisma.address.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      data: { isDefault: false },
    });
    expect(mockedPrisma.address.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isDefault: true }) })
    );
  });

  it("une adresse additionnelle non explicitement 'par défaut' ne touche pas les autres", async () => {
    mockedPrisma.address.count.mockResolvedValue(2);

    await service.create('u1', baseInput);

    expect(mockedPrisma.address.updateMany).not.toHaveBeenCalled();
    expect(mockedPrisma.address.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isDefault: false }) })
    );
  });

  it("le retrait des autres adresses par défaut et la création sont dans la même transaction", async () => {
    mockedPrisma.address.count.mockResolvedValue(1);

    await service.create('u1', { ...baseInput, isDefault: true });

    expect(mockedPrisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe('AddressService.update', () => {
  const service = new AddressService();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejette si l\'adresse n\'appartient pas à cet utilisateur', async () => {
    mockedPrisma.address.findFirst.mockResolvedValue(null);

    await expect(service.update('u1', 'addr-x', { city: 'Bobo' })).rejects.toThrow(
      'Adresse non trouvée'
    );
    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('retire le statut par défaut des autres adresses avant de mettre à jour celle-ci', async () => {
    mockedPrisma.address.findFirst.mockResolvedValue({ id: 'addr-1', userId: 'u1' });
    mockedPrisma.address.update.mockResolvedValue({ id: 'addr-1', isDefault: true });

    await service.update('u1', 'addr-1', { isDefault: true });

    expect(mockedPrisma.address.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      data: { isDefault: false },
    });
    expect(mockedPrisma.address.update).toHaveBeenCalledWith({
      where: { id: 'addr-1' },
      data: { isDefault: true },
    });
  });
});
