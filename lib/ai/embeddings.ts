import { embed, embedMany } from "ai";
import { google } from "@ai-sdk/google";

const embeddingModel = google.embedding("gemini-embedding-001");

// Truncate to 768 dims to match the database vector(768) column
const embeddingOptions = {
  providerOptions: {
    google: { outputDimensionality: 768 },
  },
};

export async function generateEmbedding(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: embeddingModel,
    value: text,
    ...embeddingOptions,
  });
  return embedding;
}

const EMBEDDING_BATCH_SIZE = 25;

export async function generateEmbeddings(
  texts: string[]
): Promise<number[][]> {
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE);
    const { embeddings } = await embedMany({
      model: embeddingModel,
      values: batch,
      ...embeddingOptions,
    });
    allEmbeddings.push(...embeddings);
  }

  return allEmbeddings;
}
