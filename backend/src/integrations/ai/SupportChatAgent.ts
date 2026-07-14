import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { logger } from '../../config/logger';

type ChatTurn = { role: 'user' | 'assistant'; content: string };

const FALLBACK_REPLY =
  "Je n'arrive pas à répondre pour le moment. Tu peux réessayer dans un instant, ou ouvrir un litige directement depuis ta commande si c'est urgent.";

export class SupportChatAgent {
  private get isLive() {
    return env.AI_AGENT.mode === 'live';
  }

  /**
   * Répond à un message de support client, avec le contexte des commandes
   * récentes de l'utilisateur pour des réponses précises (statut, montant...).
   * En mode mock (pas de clé API live), renvoie une réponse générique utile
   * plutôt que de simuler une vraie conversation.
   */
  async reply(userId: string, message: string, history: ChatTurn[] = []): Promise<string> {
    const trimmed = message.trim();
    if (!trimmed) return "Écris-moi ta question et je te réponds tout de suite.";

    if (!this.isLive) {
      return "Le support en direct n'est pas encore activé sur cette boutique. Consulte l'onglet « Support Produit » pour les questions fréquentes, ou ouvre un litige depuis ta commande.";
    }

    const recentOrders = await prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: {
        orderNumber: true,
        status: true,
        totalXof: true,
        createdAt: true,
        deliveredAt: true,
      },
    });

    const orderContext = recentOrders.length
      ? recentOrders
          .map(
            (o) =>
              `- Commande ${o.orderNumber} : statut ${o.status}, total ${o.totalXof} FCFA, passée le ${o.createdAt.toISOString().slice(0, 10)}${o.deliveredAt ? `, livrée le ${o.deliveredAt.toISOString().slice(0, 10)}` : ''}`
          )
          .join('\n')
      : "Cet utilisateur n'a pas encore de commande.";

    const systemPrompt = `Tu es l'assistant du service client de Ridia Store, une marketplace en ligne qui livre ses clients partout dans le monde (paiement via Wave, Orange Money, MTN Mobile Money).

Règles strictes :
- Réponds uniquement en français, ton chaleureux et direct, 2-4 phrases maximum.
- Ne révèle jamais le pays ou la région d'origine/fabrication des produits, ni de détails sur le fournisseur, la plateforme d'origine, les marges, ou l'infrastructure technique (Railway, Prisma, etc.). Si le client demande d'où viennent les produits, réponds simplement que Ridia Store sélectionne ses produits auprès de partenaires fiables, sans plus de détail.
- Si tu ne sais pas répondre avec certitude, dis-le et invite à ouvrir un litige plutôt que d'inventer une information.
- N'invente jamais de numéro de commande, de date de livraison ou de montant qui ne figure pas dans le contexte ci-dessous.

Commandes récentes de ce client :
${orderContext}`;

    try {
      const client = new Anthropic({ apiKey: env.AI_AGENT.apiKey });
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system: systemPrompt,
        messages: [...history.slice(-6), { role: 'user', content: trimmed }],
      });

      const textBlock = response.content.find((b) => b.type === 'text');
      return textBlock && textBlock.type === 'text' ? textBlock.text.trim() : FALLBACK_REPLY;
    } catch (err: any) {
      logger.error('SupportChatAgent reply failed', { userId, error: err.message });
      return FALLBACK_REPLY;
    }
  }
}

export const supportChatAgent = new SupportChatAgent();
