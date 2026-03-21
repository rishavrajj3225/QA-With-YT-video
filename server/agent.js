import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { tool } from "@langchain/core/tools";
import { Document } from "@langchain/core/documents";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { z } from "zod";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";

import data from "./data.js";
const video= data[0]
const docs= [new Document({ pageContent: video.transcript, metadata: { id: video.video_id } })]
//  split the video description into chunks
const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
});
const chunks = await splitter.splitDocuments(docs);

// console.log(chunks) // these chunks can be added to a vector database for retrieval

const llm = new ChatOpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    model: process.env.OPENROUTER_MODEL || "openrouter/auto",
    configuration: {
        baseURL: "https://openrouter.ai/api/v1",
        defaultHeaders: {
            "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "http://localhost:3000",
            "X-Title": process.env.OPENROUTER_APP_NAME || "qa-with-yt-video"
        }
    }
});

const embeddingModel = new OpenAIEmbeddings({
    apiKey: process.env.OPENROUTER_API_KEY,
    model: "openai/text-embedding-3-small",
    configuration: {
        baseURL: "https://openrouter.ai/api/v1",
        defaultHeaders: {
            "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "http://localhost:3000",
            "X-Title": process.env.OPENROUTER_APP_NAME || "qa-with-yt-video"
        }
    }
});

const vectorStore = new MemoryVectorStore(embeddingModel);
await vectorStore.addDocuments(chunks);



//  retrive the most relevent chunk given a query
// const retrievedChunks = await vectorStore.similaritySearch("What is primary instance?", 4);
// console.log(retrievedChunks) // the retrieved chunks can be used as context for the llm to answer questions about the video

const retrivalTool = tool(async ({ query, k=3 }) => {
  console.log("Query:", query, "K:", k);
  const results = await vectorStore.similaritySearch(query, k);
  // console.log("Retrieved Chunks:", results);
  return results.map((res) => res.pageContent).join("\n---\n");
},{
    name: "retrieval",
    description: "Useful for when you need to answer questions about the video content.",
    schema: z.object({
        query: z.string().describe("The question about the video"),
        k: z.number().describe("Number of relevant chunks to retrieve").default(3),
    }),
})

const searchTool = tool(
    async ({ query }) => `Search results for ${query}`,
    {
        name: "search",
        description: "Useful for when you need to answer questions about current events.",
        schema: z.object({
            query: z.string().describe("Search query"),
        }),
    }
);
const calculatorTool = tool(
    async ({ expression }) => `Result of ${expression}`,
    {
        name: "calculator",
        description: "Useful for when you need to perform calculations.",
        schema: z.object({
            expression: z.string().describe("Mathematical expression"),
        }),
    }
);





const agent = createReactAgent({
    llm,
    tools: [retrivalTool],
});

const result = await agent.invoke({
  messages:[{role:"user", content:"What is primary instance"}]
})

console.log(result.messages.at(-1)?.content);
export default agent  
