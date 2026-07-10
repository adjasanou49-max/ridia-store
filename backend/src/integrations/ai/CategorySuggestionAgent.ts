import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env';
import { logger } from '../../config/logger';

interface CategoryOption {
  id: string;
  name: string;
}

// Mots-clés de secours (mode mock / hors-ligne, sans clé API) - couvre les catégories
// les plus courantes d'un catalogue mode africaine + import Chine.
const KEYWORD_MAP: { pattern: RegExp; categoryName: RegExp }[] = [
  { pattern: /boubou|wax|tissu|pagne/i, categoryName: /wax|boubou|tissu/i },
  { pattern: /robe|jupe|femme/i, categoryName: /femme/i },
  { pattern: /chemise|costume|homme/i, categoryName: /homme/i },
  { pattern: /chaussure|sandale|basket|talon/i, categoryName: /chaussure/i },
  { pattern: /téléphone|phone|écouteur|chargeur|électronique/i, categoryName: /électro|electro/i },
  { pattern: /casserole|cuisine|maison|décoration/i, categoryName: /maison|cuisine/i },
  { pattern: /crème|maquillage|parfum|beauté/i, categoryName: /beauté|beaute|cosm/i },
];

export class CategorySuggestionAgent {
  private get isMock() {
    return env.AI_AGENT.mode !== 'live';
  }

  /**
   * Suggère la catégorie la plus pertinente pour un produit, à partir de son nom et de
   * sa description, parmi la liste des catégories existantes de la boutique.
   * Utile pendant l'import en masse (1688/Taobao/Pinduoduo) quand le fournisseur ne
   * fournit pas de catégorie exploitable directement.
   */
  async suggestCategory(
    productName: string,
    description: string,
    availableCategories: CategoryOption[]
  ): Promise<{ categoryId: string; confidence: 'high' | 'low' }> {
    if (availableCategories.length === 0) {
      throw new Error('Aucune catégorie disponible pour la suggestion');
    }

    if (this.isMock) {
      return this.suggestByKeywords(productName, availableCategories);
    }

    try {
      const client = new Anthropic({ apiKey: env.AI_AGENT.apiKey });
      const categoryList = availableCategories.map((c) => `- ${c.id}: ${c.name}`).join('\n');

      const message = await client.messages.create({
        model: 'claude-haiku-4-5-20251001', // rapide et économique, suffisant pour une classification
        max_tokens: 50,
        messages: [
          {
            role: 'user',
            content: `Voici un produit à catégoriser pour une boutique en ligne de mode africaine et produits importés de Chine.

Nom: ${productName}
Description: ${description.slice(0, 300)}

Catégories disponibles:
${categoryList}

Réponds UNIQUEMENT avec l'ID de la catégorie la plus pertinente, rien d'autre.`,
          },
        ],
      });

      const text = message.content[0].type === 'text' ? message.content[0].text.trim() : '';
      const match = availableCategories.find((c) => text.includes(c.id));

      if (match) return { categoryId: match.id, confidence: 'high' };

      logger.info('AI category suggestion returned unrecognized ID, falling back to keywords', { text });
      return this.suggestByKeywords(productName, availableCategories);
    } catch (err: any) {
      logger.error('AI category suggestion failed, falling back to keywords', { error: err.message });
      return this.suggestByKeywords(productName, availableCategories);
    }
  }

  private suggestByKeywords(
    productName: string,
    availableCategories: CategoryOption[]
  ): { categoryId: string; confidence: 'high' | 'low' } {
    for (const rule of KEYWORD_MAP) {
      if (rule.pattern.test(productName)) {
        const match = availableCategories.find((c) => rule.categoryName.test(c.name));
        if (match) return { categoryId: match.id, confidence: 'low' };
      }
    }
    // Rien trouvé - retombe sur la première catégorie disponible
    return { categoryId: availableCategories[0].id, confidence: 'low' };
  }
}

export const categorySuggestionAgent = new CategorySuggestionAgent();
