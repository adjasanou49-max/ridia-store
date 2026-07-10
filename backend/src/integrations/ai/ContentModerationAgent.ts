import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { logger } from '../../config/logger';

export class ContentModerationAgent {
  private get isLive() {
    return env.AI_AGENT.mode === 'live';
  }

  async getBlacklist(): Promise<string[]> {
    const rows = await prisma.blacklistedWord.findMany({ orderBy: { word: 'asc' } });
    return rows.map((r) => r.word);
  }

  async addWord(word: string) {
    const normalized = word.trim().toLowerCase();
    if (!normalized) return;
    await prisma.blacklistedWord.upsert({
      where: { word: normalized },
      create: { word: normalized },
      update: {},
    });
  }

  async removeWord(id: string) {
    await prisma.blacklistedWord.delete({ where: { id } });
  }

  /**
   * Nettoie une description produit :
   * 1) Retire systématiquement tout mot de la liste noire (mot entier, insensible à la
   *    casse) - rapide, gratuit, fonctionne même sans clé API.
   * 2) Si l'agent IA est en mode "live", passe en plus le texte à Claude pour repérer
   *    et corriger tout ce que la liste de mots n'aurait pas capté (mentions paraphrasées
   *    du fournisseur, fautes issues de la traduction automatique, etc.)
   */
  async sanitizeDescription(text: string): Promise<string> {
    if (!text.trim()) return text;

    const blacklist = await this.getBlacklist();
    let cleaned = text;
    for (const word of blacklist) {
      const pattern = new RegExp(`\\b${escapeRegExp(word)}\\b`, 'gi');
      cleaned = cleaned.replace(pattern, '');
    }
    // Nettoie les espaces/ponctuation laissés par les suppressions
    cleaned = cleaned.replace(/\s{2,}/g, ' ').replace(/\s+([,.;!?])/g, '$1').trim();

    if (!this.isLive) return cleaned;

    try {
      const client = new Anthropic({ apiKey: env.AI_AGENT.apiKey });
      const message = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: `Tu es un correcteur de fiches produit pour une boutique en ligne. Corrige le texte suivant :
- Retire toute mention, même indirecte ou paraphrasée, du fournisseur, de la plateforme d'origine, ou de pratiques comme le dropshipping/gros/import direct.
- Corrige les fautes de grammaire ou tournures bizarres issues d'une traduction automatique.
- Garde le même sens général et la même longueur approximative.
- Réponds UNIQUEMENT avec le texte corrigé, rien d'autre.

Texte: "${cleaned}"`,
          },
        ],
      });

      const result = message.content[0].type === 'text' ? message.content[0].text.trim() : cleaned;
      return result || cleaned;
    } catch (err: any) {
      logger.error('AI description sanitization failed, using keyword-only result', { error: err.message });
      return cleaned;
    }
  }
}

function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const contentModerationAgent = new ContentModerationAgent();
