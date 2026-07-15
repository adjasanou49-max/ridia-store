import { nanoid } from 'nanoid';
import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../config/prisma';
import { AppError } from '../middleware/errorHandler';

type Db = PrismaClient | Prisma.TransactionClient;

/** Statuts de commande qui comptent pour la performance d'un agent (mêmes règles que le GMV du dashboard admin) */
const COUNTED_STATUSES = ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'] as const;

interface MonthlyPerformance {
  month: string; // "2026-07"
  salesXof: number;
  orderCount: number;
  monthlyThresholdXof: number;
  thresholdMet: boolean;
  commissionPercent: number;
  commissionOwedXof: number;
}

export class SalesAgentService {
  /**
   * Génère le code de tracking et crée le profil - appelé à l'activation
   * d'un code d'invitation SALES_AGENT. Accepte un client de transaction
   * (tx) pour rester atomique avec l'attribution du rôle dans
   * AdminInviteService ; sinon utilise le client global.
   */
  async createProfile(
    userId: string,
    terms: { commissionPercent?: number; monthlyThresholdXof?: number },
    db: Db = prisma
  ) {
    const code = `AGENT-${nanoid(8).toUpperCase()}`;
    return db.salesAgent.upsert({
      where: { userId },
      create: {
        userId,
        code,
        commissionPercent: terms.commissionPercent ?? 5.0,
        monthlyThresholdXof: terms.monthlyThresholdXof ?? 0,
      },
      update: {},
    });
  }

  /** Valide un code agent saisi au checkout - renvoie null silencieusement si invalide (n'importe jamais le checkout) */
  async findActiveByCode(code: string) {
    const agent = await prisma.salesAgent.findUnique({ where: { code: code.toUpperCase() } });
    if (!agent || agent.status !== 'ACTIVE') return null;
    return agent;
  }

  private monthBounds(reference = new Date()) {
    const start = new Date(reference.getFullYear(), reference.getMonth(), 1);
    const end = new Date(reference.getFullYear(), reference.getMonth() + 1, 1);
    const label = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
    return { start, end, label };
  }

  async getMonthlyPerformance(agentId: string, reference = new Date()): Promise<MonthlyPerformance> {
    const agent = await prisma.salesAgent.findUnique({ where: { id: agentId } });
    if (!agent) throw new AppError('Agent introuvable', 404);

    const { start, end, label } = this.monthBounds(reference);
    const agg = await prisma.order.aggregate({
      where: { salesAgentId: agentId, createdAt: { gte: start, lt: end }, status: { in: [...COUNTED_STATUSES] } },
      _sum: { totalXof: true },
      _count: true,
    });

    const salesXof = Number(agg._sum.totalXof || 0);
    const thresholdXof = Number(agent.monthlyThresholdXof);
    const thresholdMet = salesXof >= thresholdXof;
    // Le contrat type ("si je génère 1000$/mois, 5% sur chaque vente") s'applique
    // à l'ensemble du volume du mois une fois le seuil atteint, pas seulement au
    // surplus au-dessus du seuil.
    const commissionOwedXof = thresholdMet ? Math.round((salesXof * agent.commissionPercent) / 100) : 0;

    return {
      month: label,
      salesXof,
      orderCount: agg._count,
      monthlyThresholdXof: thresholdXof,
      thresholdMet,
      commissionPercent: agent.commissionPercent,
      commissionOwedXof,
    };
  }

  async getMyStats(userId: string) {
    const agent = await prisma.salesAgent.findUnique({ where: { userId } });
    if (!agent) throw new AppError('Aucun profil agent commercial pour ce compte', 404);

    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const [current, previous] = await Promise.all([
      this.getMonthlyPerformance(agent.id, now),
      this.getMonthlyPerformance(agent.id, lastMonth),
    ]);

    return { code: agent.code, commissionPercent: agent.commissionPercent, current, previous };
  }

  /**
   * Liste des ventes attribuées à l'agent, pour qu'il puisse suivre/vérifier
   * son propre travail. Volontairement limité : prénom du client seulement
   * (pas nom complet/téléphone/adresse - ça reste une donnée client privée,
   * pas nécessaire pour ce que l'agent a besoin de faire), et aucune donnée
   * financière interne (coût, marge, commission vendeur).
   */
  async getMyOrders(userId: string, page = 1, pageSize = 20) {
    const agent = await prisma.salesAgent.findUnique({ where: { userId } });
    if (!agent) throw new AppError('Aucun profil agent commercial pour ce compte', 404);
    return this.getOrdersByAgentId(agent.id, page, pageSize);
  }

  /** Même liste, mais consultable par le SUPER_ADMIN pour vérifier avant de payer une commission. */
  async getOrdersByAgentId(agentId: string, page = 1, pageSize = 20) {
    const [items, total] = await Promise.all([
      prisma.order.findMany({
        where: { salesAgentId: agentId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          totalXof: true,
          createdAt: true,
          user: { select: { firstName: true } },
          items: { select: { productName: true, quantity: true }, take: 3 },
        },
      }),
      prisma.order.count({ where: { salesAgentId: agentId } }),
    ]);

    return {
      items: items.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        totalXof: Number(o.totalXof),
        createdAt: o.createdAt,
        customerFirstName: o.user.firstName,
        productsSummary: o.items.map((i) => `${i.productName} ×${i.quantity}`).join(', '),
      })),
      total,
      page,
      pageSize,
    };
  }

  async listAllWithCurrentMonth() {
    const agents = await prisma.salesAgent.findMany({
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(
      agents.map(async (agent) => ({
        id: agent.id,
        code: agent.code,
        status: agent.status,
        commissionPercent: agent.commissionPercent,
        monthlyThresholdXof: Number(agent.monthlyThresholdXof),
        agentName: `${agent.user.firstName} ${agent.user.lastName}`,
        agentEmail: agent.user.email,
        currentMonth: await this.getMonthlyPerformance(agent.id),
      }))
    );
  }

  async updateTerms(
    id: string,
    data: { commissionPercent?: number; monthlyThresholdXof?: number; status?: 'ACTIVE' | 'SUSPENDED' }
  ) {
    return prisma.salesAgent.update({ where: { id }, data });
  }
}

export const salesAgentService = new SalesAgentService();
