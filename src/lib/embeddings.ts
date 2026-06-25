import "server-only";
import { OpenAI } from 'openai';

let openaiInstance: OpenAI | null = null;

function getOpenAI(): OpenAI | null {
  if (!openaiInstance) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      openaiInstance = new OpenAI({ apiKey });
    }
  }
  return openaiInstance;
}

/**
 * Generates a 512-dimensional embedding for a given text description using OpenAI's text-embedding-3-small model.
 * 
 * @param text The user-submitted description text
 * @returns Promise containing an array of 512 numbers representing the embedding vector
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  // 【開発・テスト用途のみ】ローカル環境でのオフライン検証やOpenAIクォータ制限時の回避用。
  // 本番環境（Vercel）ではこの環境変数は設定せず、必ず実API経由で生成してください。
  if (process.env.MOCK_EMBEDDINGS === 'true') {
    const mockVector = Array.from({ length: 512 }, () => Math.random() - 0.5);
    const magnitude = Math.sqrt(mockVector.reduce((sum, val) => sum + val * val, 0));
    return mockVector.map((val) => (magnitude > 1e-9 ? val / magnitude : 0));
  }

  const openai = getOpenAI();
  if (!openai) {
    throw new Error('OPENAI_API_KEY environment variable is not configured on the server.');
  }

  try {
    const cleanText = text.trim().replace(/\s+/g, ' ');
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: cleanText,
      dimensions: 512, // Restrict output dimensions to 512
    });

    if (!response.data?.[0]?.embedding) {
      throw new Error('Invalid response structure from OpenAI Embeddings API.');
    }

    return response.data[0].embedding;
  } catch (error: unknown) {
    console.error('OpenAI Embedding generation failed:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to generate text embedding: ${message}`);
  }
}
