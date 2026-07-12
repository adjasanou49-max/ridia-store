import axios from 'axios';
import { env } from '../../config/env';
import { logger } from '../../config/logger';

// Dictionnaire de secours (mode mock / hors-ligne) pour les termes e-commerce les plus
// fréquents en import 1688/Taobao/Pinduoduo. Couvre surtout les couleurs et tailles,
// qui reviennent dans quasiment chaque titre produit chinois.
const CN_FR_DICTIONARY: Record<string, string> = {
  '红色': 'rouge',
  '蓝色': 'bleu',
  '绿色': 'vert',
  '黄色': 'jaune',
  '黑色': 'noir',
  '白色': 'blanc',
  '粉色': 'rose',
  '紫色': 'violet',
  '橙色': 'orange',
  '灰色': 'gris',
  '棕色': 'marron',
  '男装': 'homme',
  '女装': 'femme',
  '连衣裙': 'robe',
  '衬衫': 'chemise',
  '鞋子': 'chaussures',
  '包包': 'sac',
  '手机': 'téléphone',
  '批发': 'gros (vente en)',
  '免运费': 'livraison gratuite',
};

export interface TranslationAdapter {
  /** Traduit un texte de sourceLang vers targetLang. sourceLang='auto' laisse le provider détecter. */
  translate(text: string, targetLang: string, sourceLang?: string): Promise<string>;
}

class DeepLTranslationAdapter implements TranslationAdapter {
  /**
   * Correction bug : le code appelait toujours l'endpoint Free
   * (api-free.deepl.com), qui rejette les clés Pro (et vice-versa) - DeepL
   * documente officiellement que les clés Free se terminent TOUJOURS par
   * ":fx", contrairement aux clés Pro. Sans cette détection, un compte Pro
   * verrait toutes ses traductions échouer silencieusement (repli sur le
   * texte original, juste journalisé en erreur - facile à ne jamais remarquer).
   */
  private get baseUrl(): string {
    return env.TRANSLATION.deeplApiKey.endsWith(':fx')
      ? 'https://api-free.deepl.com'
      : 'https://api.deepl.com';
  }

  async translate(text: string, targetLang: string, sourceLang?: string): Promise<string> {
    if (!text.trim()) return text;

    try {
      const { data } = await axios.post(
        `${this.baseUrl}/v2/translate`,
        {
          text: [text],
          target_lang: targetLang.toUpperCase(),
          source_lang: sourceLang && sourceLang !== 'auto' ? sourceLang.toUpperCase() : undefined,
        },
        { headers: { Authorization: `DeepL-Auth-Key ${env.TRANSLATION.deeplApiKey}` } }
      );
      return data.translations?.[0]?.text ?? text;
    } catch (err: any) {
      logger.error('Translation failed, falling back to original text', { error: err.message });
      return text;
    }
  }
}

class MockTranslationAdapter implements TranslationAdapter {
  async translate(text: string, targetLang: string): Promise<string> {
    if (!text.trim()) return text;

    // Applique le dictionnaire mot-clé par mot-clé (mode dev/hors-ligne, sans clé API).
    let translated = text;
    for (const [cn, fr] of Object.entries(CN_FR_DICTIONARY)) {
      translated = translated.split(cn).join(targetLang === 'fr' ? fr : cn);
    }

    if (translated === text) {
      logger.info('[Translation MOCK] Aucune clé API configurée - texte non traduit', {
        preview: text.slice(0, 40),
      });
    }
    return translated;
  }
}

export const translationAdapter: TranslationAdapter =
  env.TRANSLATION.mode === 'live' ? new DeepLTranslationAdapter() : new MockTranslationAdapter();
