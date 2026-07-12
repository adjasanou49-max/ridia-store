jest.mock('axios');
jest.mock('../../config/logger', () => ({ logger: { error: jest.fn(), info: jest.fn() } }));

describe('DeepLTranslationAdapter - correction endpoint Free/Pro', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('utilise api-free.deepl.com pour une clé se terminant par ":fx" (Free)', async () => {
    jest.doMock('../../config/env', () => ({
      env: { TRANSLATION: { deeplApiKey: 'abc123:fx', mode: 'live', defaultTargetLang: 'fr' } },
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
      env: { TRANSLATION: { deeplApiKey: 'abc123-pro-key', mode: 'live', defaultTargetLang: 'fr' } },
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
