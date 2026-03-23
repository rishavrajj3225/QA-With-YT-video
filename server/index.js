import express from "express";
import cors from "cors";
import { createAgentTools } from "./tools/index.js";
import { addVideoToVectorStore, vectorStore } from "./embedding.js";
import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import data from "./data.js";
import { triggerYoutube } from "../brightData.js";

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

app.post("/brightdata/trigger", async (req, res) => {
  const { video_url, notify_url, include_errors = true } = req.body;

  if (!video_url) {
    return res.status(400).json({ error: "video_url is required" });
  }

  const fallbackNotifyUrl = `${process.env.SERVER_PUBLIC_URL || "http://localhost:4000"}/webhook`;
  const notifyUrl = notify_url || process.env.BRIGHTDATA_NOTIFY_URL || fallbackNotifyUrl;

  try {
    const result = await triggerYoutube(video_url, {
      notifyUrl,
      includeErrors: include_errors,
    });

    return res.json({
      message: "Bright Data trigger submitted",
      notify_url: notifyUrl,
      include_errors,
      result,
    });
  } catch (error) {
    console.error("Error triggering Bright Data:", error?.response?.data || error.message);
    return res.status(500).json({
      error: "Failed to trigger Bright Data job",
      details: error?.response?.data || error.message,
    });
  }
});

app.post("/webhook", (req, res) => {
  console.log("Received webhook:", req.body);
  res.status(200).json({ message: "Webhook received successfully" });
});
app.post("/test", (req, res) => {
  console.log("Received test request:");
  res.status(200).json({ message: "Test endpoint received successfully" });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
}); 