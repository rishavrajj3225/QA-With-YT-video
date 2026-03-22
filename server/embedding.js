import { OpenAIEmbeddings } from "@langchain/openai";
import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";

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

export const vectorStore = new MemoryVectorStore(embeddingModel);

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
  await vectorStore.addDocuments(chunks);
};
