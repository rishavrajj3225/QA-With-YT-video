import { OpenAIEmbeddings } from "@langchain/openai";
import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { PGVectorStore } from "@langchain/community/vectorstores/pgvector";

const embeddingModel = new OpenAIEmbeddings({
  apiKey: process.env.OPENROUTER_API_KEY,
  model: "openai/text-embedding-3-small",
  configuration: {
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "http://localhost:3000",
      "X-Title": process.env.OPENROUTER_APP_NAME || "qa-with-yt-video",
    },
  },
});

const pgConfig = {
  postgresConnectionOptions: {
    connectionString: process.env.PGVECTOR_CONNECTION_STRING,
  },
  tableName: process.env.PGVECTOR_TABLE || "qa_video_embeddings",
  collectionTableName:
    process.env.PGVECTOR_COLLECTION_TABLE || "qa_video_collections",
  collectionName: process.env.PGVECTOR_COLLECTION || "default_video_collection",
  columns: {
    idColumnName: "id",
    vectorColumnName: "embedding",
    contentColumnName: "content",
    metadataColumnName: "metadata",
  },
  distanceStrategy: "cosine",
};

if (!pgConfig.postgresConnectionOptions.connectionString) {
  throw new Error("Missing PGVECTOR_CONNECTION_STRING in environment.");
}

export const vectorStore = await PGVectorStore.initialize(embeddingModel, {
  ...pgConfig,
  dimensions: 1536,
});

export const addVideoToVectorStore = async (video) => {
  const docs = [
    new Document({
      pageContent: video.transcript,
      metadata: { id: video.video_id },
    }),
  ];

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });

  const chunks = await splitter.splitDocuments(docs);

  // Prevent duplicate chunks for the same video on repeated runs.
  await vectorStore.delete({ filter: { id: video.video_id } });
  await vectorStore.addDocuments(chunks);
};
