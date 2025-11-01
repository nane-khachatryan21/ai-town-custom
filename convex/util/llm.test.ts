import { chatCompletion, fetchEmbedding } from './llm';

describe('llm', () => {
  it('should get a response from the LLM', async () => {
    // This test will fail if the LLM is not running
    // or if the API key is not valid.
    const { content } = await chatCompletion({
      messages: [
        {
          role: 'user',
          content: 'Say "this is a test"',
        },
      ],
    });
    console.log('LLM response:', content);
    expect(typeof content).toBe('string');
    expect(content.length).toBeGreaterThan(0);
    // Let's check if it actually says "this is a test", but it might have extra text.
    expect(content.toLowerCase()).toContain('this is a test');
  }, 30000); // 30 second timeout for this test

  it('should get an embedding from the LLM', async () => {
    // This test will fail if the LLM is not running
    // or if the API key is not valid.
    const { embedding } = await fetchEmbedding('this is a test');
    expect(Array.isArray(embedding)).toBe(true);
    expect(embedding.length).toBe(4096);
  }, 30000); // 30 second timeout for this test
});
