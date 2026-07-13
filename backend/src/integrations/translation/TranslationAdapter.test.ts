jest.mock('axios');
jest.mock('../../config/logger', () => ({ logger: { error: jest.fn(), info: jest.fn() } }));

describe('DeepLTranslationAdapter - correction endpoint Free/Pro', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('utilise api-free.deepl.com pour une clé se terminant par ":fx" (Free)', async () => {
    jest.doMock('../../config/env', () => ({
      env: { TRANSLATION: { provider: 'deepl', deeplApiKey: 'abc123:fx', mode: 'live', defaultTargetLang: 'fr' } },
    }));
    const axios = (await import('axios')).default as jest.Mocked<typeof import('axios').default>;
    axios.post.mockResolvedValue({ data: { translations: [{ text: 'bonjour' }] } });

    const { translationAdapter } = await import('./TranslationAdapter');
    await translationAdapter.translate('你好', 'fr');

    expect(axios.post).toHaveBeenCalledWith(
      'https://api-free.deepl.com/v2/translate',
      expect.anything(),
      expect.anything()
    );
  });

  it("utilise api.deepl.com pour une clé SANS suffixe :fx (Pro) - c'était le bug avant correction", async () => {
    jest.doMock('../../config/env', () => ({
      env: {
        TRANSLATION: { provider: 'deepl', deeplApiKey: 'abc123-pro-key', mode: 'live', defaultTargetLang: 'fr' },
      },
    }));
    const axios = (await import('axios')).default as jest.Mocked<typeof import('axios').default>;
    axios.post.mockResolvedValue({ data: { translations: [{ text: 'bonjour' }] } });

    const { translationAdapter } = await import('./TranslationAdapter');
    await translationAdapter.translate('你好', 'fr');

    expect(axios.post).toHaveBeenCalledWith(
      'https://api.deepl.com/v2/translate',
      expect.anything(),
      expect.anything()
    );
  });
});

describe('MicrosoftTranslatorAdapter - sélection du fournisseur', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('appelle le bon endpoint Microsoft avec la clé et la région configurées quand TRANSLATION_PROVIDER=microsoft', async () => {
    jest.doMock('../../config/env', () => ({
      env: {
        TRANSLATION: {
          provider: 'microsoft',
          microsoftApiKey: 'ms-key-123',
          microsoftRegion: 'westeurope',
          mode: 'live',
          defaultTargetLang: 'fr',
        },
      },
    }));
    const axios = (await import('axios')).default as jest.Mocked<typeof import('axios').default>;
    axios.post.mockResolvedValue({ data: [{ translations: [{ text: 'bonjour' }] }] });

    const { translationAdapter } = await import('./TranslationAdapter');
    const result = await translationAdapter.translate('你好', 'fr');

    expect(result).toBe('bonjour');
    expect(axios.post).toHaveBeenCalledWith(
      'https://api.cognitive.microsofttranslator.com/translate',
      [{ Text: '你好' }],
      expect.objectContaining({
        headers: expect.objectContaining({
          'Ocp-Apim-Subscription-Key': 'ms-key-123',
          'Ocp-Apim-Subscription-Region': 'westeurope',
        }),
      })
    );
  });

  it("reste sur DeepL si TRANSLATION_PROVIDER n'est pas défini sur 'microsoft'", async () => {
    jest.doMock('../../config/env', () => ({
      env: { TRANSLATION: { provider: 'deepl', deeplApiKey: 'abc:fx', mode: 'live', defaultTargetLang: 'fr' } },
    }));
    const axios = (await import('axios')).default as jest.Mocked<typeof import('axios').default>;
    axios.post.mockResolvedValue({ data: { translations: [{ text: 'bonjour' }] } });

    const { translationAdapter } = await import('./TranslationAdapter');
    await translationAdapter.translate('你好', 'fr');

    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('deepl.com'),
      expect.anything(),
      expect.anything()
    );
  });

  it('se replie sur le texte original en cas d\'erreur Microsoft (ne casse jamais un import)', async () => {
    jest.doMock('../../config/env', () => ({
      env: {
        TRANSLATION: {
          provider: 'microsoft',
          microsoftApiKey: 'ms-key-123',
          microsoftRegion: 'westeurope',
          mode: 'live',
          defaultTargetLang: 'fr',
        },
      },
    }));
    const axios = (await import('axios')).default as jest.Mocked<typeof import('axios').default>;
    axios.post.mockRejectedValue(new Error('Network error'));

    const { translationAdapter } = await import('./TranslationAdapter');
    const result = await translationAdapter.translate('你好', 'fr');

    expect(result).toBe('你好');
  });
});
