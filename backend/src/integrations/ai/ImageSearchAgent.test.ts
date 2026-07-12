jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'robe longue fleurie bleue' }],
      }),
    },
  }));
});
jest.mock('../../config/env', () => ({
  env: { AI_AGENT: { mode: 'live', apiKey: 'test-key' } },
}));
jest.mock('../../config/logger', () => ({
  logger: { error: jest.fn() },
}));

import { ImageSearchAgent } from './ImageSearchAgent';

describe('ImageSearchAgent.describeImageForSearch', () => {
  const agent = new ImageSearchAgent();
  const fakeImage = Buffer.from('fake-image-bytes');

  it("renvoie les mots-clés détectés pour une image valide", async () => {
    const query = await agent.describeImageForSearch(fakeImage, 'image/jpeg');
    expect(query).toBe('robe longue fleurie bleue');
  });

  it('rejette un format de fichier non supporté', async () => {
    await expect(agent.describeImageForSearch(fakeImage, 'application/pdf')).rejects.toThrow(
      'Format image non supporté'
    );
  });
});

describe('ImageSearchAgent - mode non activé', () => {
  it("refuse proprement si l'IA n'est pas configurée en mode live", async () => {
    jest.resetModules();
    jest.doMock('../../config/env', () => ({
      env: { AI_AGENT: { mode: 'mock', apiKey: '' } },
    }));
    const { ImageSearchAgent: FreshAgent } = await import('./ImageSearchAgent');
    const agent = new FreshAgent();

    await expect(agent.describeImageForSearch(Buffer.from('x'), 'image/jpeg')).rejects.toThrow(
      'Recherche par image indisponible'
    );
  });
});
