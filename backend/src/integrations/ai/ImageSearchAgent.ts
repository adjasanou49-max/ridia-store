import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { AppError } from '../../middleware/errorHandler';

const ALLOWED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
type AllowedMediaType = (typeof ALLOWED_MEDIA_TYPES)[number];

/**
 * Transforme une photo envoyée par un client en une courte requête de
 * recherche textuelle (ex: "robe longue fleurie bleue"), réutilisée ensuite
 * par ProductService.searchProducts - pas de vraie recherche par similarité
 * visuelle (nécessiterait des embeddings + une base vectorielle non testable
 * ici sans vraie base de données), mais couvre bien le besoin : le client
 * envoie une photo, l'app retrouve des produits pertinents dans le catalogue.
 */
export class ImageSearchAgent {
  private get isLive() {
    return env.AI_AGENT.mode === 'live';
  }

  async describeImageForSearch(imageBuffer: Buffer, mimeType: string): Promise<string> {
    if (!this.isLive) {
      throw new AppError(
        "Recherche par image indisponible pour l'instant (configuration IA non activée)",
        503
      );
    }
    if (!ALLOWED_MEDIA_TYPES.includes(mimeType as AllowedMediaType)) {
      throw new AppError('Format image non supporté', 422);
    }

    try {
      const client = new Anthropic({ apiKey: env.AI_AGENT.apiKey });
      const message = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 60,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mimeType as AllowedMediaType,
                  data: imageBuffer.toString('base64'),
                },
              },
              {
                type: 'text',
                text: `Décris en 3 à 6 mots-clés simples (en français) le produit principal visible sur cette photo, pour rechercher un article similaire dans une marketplace en ligne mondiale de mode et produits du quotidien. Réponds UNIQUEMENT avec les mots-clés séparés par des espaces, rien d'autre (pas de phrase, pas de ponctuation).`,
              },
            ],
          },
        ],
      });

      const text = message.content[0].type === 'text' ? message.content[0].text.trim() : '';
      if (!text) throw new AppError("Impossible d'analyser cette image", 422);
      return text;
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      logger.error('Image search description failed', { error: err.message });
      throw new AppError("Erreur lors de l'analyse de l'image, réessaie", 502);
    }
  }
}

export const imageSearchAgent = new ImageSearchAgent();
