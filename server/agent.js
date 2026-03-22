import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { addVideoToVectorStore, vectorStore } from "./embedding.js";
import { createAgentTools } from "./tools/index.js";

import data from "./data.js";
const video = data[0];
await addVideoToVectorStore(video);

// console.log(chunks) // these chunks can be added to a vector database for retrieval

const llm = new ChatOpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  model: process.env.OPENROUTER_MODEL || "openrouter/auto",
  configuration: {
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer":
        process.env.OPENROUTER_SITE_URL || "http://localhost:3000",
      "X-Title": process.env.OPENROUTER_APP_NAME || "qa-with-yt-video",
    },
  },
});

const tools = createAgentTools(vectorStore);

const checkpointer = new MemorySaver();

const agent = createReactAgent({
  llm,
  tools,
  checkpointer,
});

const result = await agent.invoke(
  {
    messages: [{ role: "user", content: "What is primary instance mentioned in the video?" }],
  },
  { configurable: { thread_id: "video-chat-1", video_id: video.video_id } },
);

console.log(result.messages.at(-1)?.content);
export default agent;
