import express from "express";
import cors from "cors";
import { createAgentTools } from "./tools/index.js";
import { addVideoToVectorStore, vectorStore } from "./embedding.js";
import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import data from "./data.js";

const app = express();
app.use(cors());
app.use(express.json());

const video = data[0];
await addVideoToVectorStore(video);

const tools = createAgentTools(vectorStore);

const llm = new ChatOpenAI({
  model: process.env.OPENROUTER_MODEL || "openai/gpt-oss-20b",
  apiKey: process.env.OPENROUTER_API_KEY,
  configuration: {
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "http://localhost:3000",
      "X-Title": process.env.OPENROUTER_APP_NAME || "qa-with-yt-video",
    },
  },
});

const checkpointer = new MemorySaver();

const agent = createReactAgent({
  llm,
  tools,
  checkpointer,
});

app.post("/query", async (req, res) => {
  const { query, video_id, thread_id } = req.body;
  try {
    const result = await agent.invoke(
      {
        messages: [{ role: "user", content: query }],
      },
      {
        configurable: {
          thread_id: thread_id || "api-thread-1",
          video_id: video_id || video.video_id,
        },
      }
    );

    const answer = result.messages?.at(-1)?.content;
    res.json({ answer });
  } catch (error) {
    console.error("Error processing query:", error);
    res.status(500).json({ error: "An error occurred while processing your query." });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
}); 