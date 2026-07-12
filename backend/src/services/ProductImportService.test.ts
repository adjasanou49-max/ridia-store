jest.mock('../config/prisma', () => ({
  prisma: {
    importJob: { findFirst: jest.fn() },
  },
}));
jest.mock('../queues/productImportQueue', () => ({
  productImportQueue: { add: jest.fn() },
}));

import { prisma } from '../config/prisma';
import { ProductImportService } from './ProductImportService';

const mockedPrisma = prisma as unknown as {
  importJob: { findFirst: jest.Mock };
};

describe('ProductImportService.getImportJobStatus - correction faille IDOR', () => {
  const service = new ProductImportService();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renvoie le job quand il appartient bien au vendeur authentifié', async () => {
    mockedPrisma.importJob.findFirst.mockResolvedValue({ id: 'job-1', status: 'RUNNING' });

    const job = await service.getImportJobStatus('job-1', 'seller-1');

    expect(job).toEqual({ id: 'job-1', status: 'RUNNING' });
    expect(mockedPrisma.importJob.findFirst).toHaveBeenCalledWith({
      where: { id: 'job-1', connector: { sellerId: 'seller-1' } },
    });
  });

  it("rejette si le job appartient à un AUTRE vendeur (faille IDOR corrigée)", async () => {
    // Le job existe réellement, mais pas pour ce vendeur - la requête filtrée
    // ne le retrouve pas, exactement comme s'il n'existait pas.
    mockedPrisma.importJob.findFirst.mockResolvedValue(null);

    await expect(service.getImportJobStatus('job-appartenant-a-un-autre', 'seller-1')).rejects.toThrow(
      "Job d'import non trouvé"
    );
  });

  it("rejette si le job n'existe pas du tout", async () => {
    mockedPrisma.importJob.findFirst.mockResolvedValue(null);

    await expect(service.getImportJobStatus('job-inexistant', 'seller-1')).rejects.toThrow(
      "Job d'import non trouvé"
    );
  });
});
