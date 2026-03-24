import express from "express";
import cors from "cors";
import { Pool } from "pg";
import { createAgentTools } from "./tools/index.js";
import { addVideoToVectorStore, isVideoIndexed, vectorStore } from "./embedding.js";
import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import data from "./data.js";
import { triggerYoutube } from "../brightData.js";
import { triggerYTScrapeTool } from "./tools/triggerYTScrapeTool.js";

const app = express();
app.use(cors());
app.use(express.json());

const threadVideoContext = new Map();
const threadVideoUrlContext = new Map();

const ingestionTableName = process.env.INGESTION_TABLE || "qa_video_ingestions";
const dbConnectionString = process.env.WEBHOOK_DB_CONNECTION_STRING || process.env.PGVECTOR_CONNECTION_STRING;

if (!dbConnectionString) {
  throw new Error("Missing DB connection string. Set WEBHOOK_DB_CONNECTION_STRING or PGVECTOR_CONNECTION_STRING.");
}

const dbPool = new Pool({
  connectionString: dbConnectionString,
});

const YOUTUBE_ID_REGEX = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i;

const extractYoutubeVideoId = (value) => {
  if (!value || typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  const match = trimmed.match(YOUTUBE_ID_REGEX);
  return match?.[1] || null;
};

const buildYoutubeUrl = (videoId, sourceUrl) => {
  if (sourceUrl && /^https?:\/\//i.test(sourceUrl)) {
    return sourceUrl;
  }

  return `https://www.youtube.com/watch?v=${videoId}`;
};

const normalizeWebhookVideo = (payload) => {
  const candidate = Array.isArray(payload) ? payload[0] : payload;
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const transcript = candidate.transcript;
  const videoId = candidate.video_id || extractYoutubeVideoId(candidate.url);

  if (!transcript || !videoId) {
    return null;
  }

  return {
    video_id: videoId,
    transcript,
    source_url: candidate.url || buildYoutubeUrl(videoId),
  };
};

const parseToolOutput = (output) => {
  if (!output) {
    return {};
  }

  if (typeof output === "object") {
    return output;
  }

  if (typeof output === "string") {
    try {
      return JSON.parse(output);
    } catch {
      return { rawOutput: output };
    }
  }

  return { rawOutput: String(output) };
};

const getUsedToolNames = (messages = []) => {
  const usedTools = new Set();

  for (const message of messages) {
    const directName = message?.name;
    if (typeof directName === "string" && directName.trim()) {
      usedTools.add(directName.trim());
    }

    const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
    for (const toolCall of toolCalls) {
      const callName = toolCall?.name || toolCall?.function?.name || toolCall?.tool_name;
      if (typeof callName === "string" && callName.trim()) {
        usedTools.add(callName.trim());
      }
    }
  }

  return Array.from(usedTools);
};

const ensureTables = async () => {
  const createIngestionTableQuery = `
    CREATE TABLE IF NOT EXISTS ${ingestionTableName} (
      video_id TEXT PRIMARY KEY,
      video_url TEXT,
      thread_id TEXT,
      trigger_tool_output TEXT,
      trigger_response JSONB,
      last_webhook_payload JSONB,
      status TEXT NOT NULL DEFAULT 'pending',
      snapshot_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  await dbPool.query(createIngestionTableQuery);
};

const getIngestionRecord = async (videoId) => {
  const result = await dbPool.query(
    `SELECT * FROM ${ingestionTableName} WHERE video_id = $1 LIMIT 1`,
    [videoId]
  );

  return result.rows[0] || null;
};

const upsertIngestionRecord = async ({
  videoId,
  videoUrl = null,
  threadId = null,
  triggerToolOutput = null,
  triggerResponse = null,
  webhookPayload = null,
  status = null,
  snapshotId = null,
}) => {
  await dbPool.query(
    `
      INSERT INTO ${ingestionTableName} (
        video_id,
        video_url,
        thread_id,
        trigger_tool_output,
        trigger_response,
        last_webhook_payload,
        status,
        snapshot_id,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, COALESCE($7, 'pending'), $8, NOW())
      ON CONFLICT (video_id)
      DO UPDATE SET
        video_url = COALESCE(EXCLUDED.video_url, ${ingestionTableName}.video_url),
        thread_id = COALESCE(EXCLUDED.thread_id, ${ingestionTableName}.thread_id),
        trigger_tool_output = COALESCE(EXCLUDED.trigger_tool_output, ${ingestionTableName}.trigger_tool_output),
        trigger_response = COALESCE(EXCLUDED.trigger_response, ${ingestionTableName}.trigger_response),
        last_webhook_payload = COALESCE(EXCLUDED.last_webhook_payload, ${ingestionTableName}.last_webhook_payload),
        status = COALESCE(EXCLUDED.status, ${ingestionTableName}.status),
        snapshot_id = COALESCE(EXCLUDED.snapshot_id, ${ingestionTableName}.snapshot_id),
        updated_at = NOW();
    `,
    [
      videoId,
      videoUrl,
      threadId,
      triggerToolOutput,
      triggerResponse ? JSON.stringify(triggerResponse) : null,
      webhookPayload ? JSON.stringify(webhookPayload) : null,
      status,
      snapshotId,
    ]
  );
};

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
  const { query, video_id, video_url, thread_id } = req.body;
  const activeThreadId = thread_id || "api-thread-1";

  const directVideoId = extractYoutubeVideoId(video_id);
  const videoUrlVideoId = extractYoutubeVideoId(video_url);
  const inlineVideoId = extractYoutubeVideoId(query);

  const hasExplicitVideoInput = Boolean(
    (typeof video_id === "string" && video_id.trim()) ||
      (typeof video_url === "string" && video_url.trim()) ||
      inlineVideoId
  );

  const requestedVideoId = directVideoId || videoUrlVideoId || inlineVideoId;
  if (hasExplicitVideoInput && !requestedVideoId) {
    return res.status(400).json({
      error:
        "Could not parse YouTube video ID. Send `video_id`, `video_url`, or include a valid YouTube URL in query.",
    });
  }

  if (requestedVideoId) {
    threadVideoContext.set(activeThreadId, requestedVideoId);
    threadVideoUrlContext.set(
      activeThreadId,
      buildYoutubeUrl(requestedVideoId, typeof video_url === "string" ? video_url.trim() : null)
    );
  }

  const threadPinnedVideoId = threadVideoContext.get(activeThreadId);
  const targetVideoId = threadPinnedVideoId || video.video_id;

  try {
    if (threadPinnedVideoId) {
      const indexed = await isVideoIndexed(threadPinnedVideoId);

      if (!indexed) {
        const existingRecord = await getIngestionRecord(threadPinnedVideoId);

        if (!existingRecord) {
          const pinnedVideoUrl =
            threadVideoUrlContext.get(activeThreadId) || buildYoutubeUrl(threadPinnedVideoId);

          const toolOutputRaw = await triggerYTScrapeTool.invoke({ videoUrl: pinnedVideoUrl });
          const toolOutputParsed = parseToolOutput(toolOutputRaw);
          const status = toolOutputParsed?.status === "failed" ? "failed" : "triggered";

          await upsertIngestionRecord({
            videoId: threadPinnedVideoId,
            videoUrl: pinnedVideoUrl,
            threadId: activeThreadId,
            triggerToolOutput: typeof toolOutputRaw === "string" ? toolOutputRaw : JSON.stringify(toolOutputRaw),
            triggerResponse: toolOutputParsed,
            status,
            snapshotId: toolOutputParsed?.snapshotId || null,
          });

          return res.status(202).json({
            answer:
              status === "failed"
                ? `Failed to trigger scrape for ${threadPinnedVideoId}. Please try again with a valid link.`
                : `Started scrape for ${threadPinnedVideoId}. I will answer once webhook ingestion completes.`,
          });
        }

        return res.status(202).json({
          answer:
            `Video ${threadPinnedVideoId} is already in processing (${existingRecord.status}). ` +
            "Ask again after webhook ingestion. I will reuse this existing record and won't store duplicate video entries.",
        });
      }

      await upsertIngestionRecord({
        videoId: threadPinnedVideoId,
        videoUrl: threadVideoUrlContext.get(activeThreadId) || buildYoutubeUrl(threadPinnedVideoId),
        threadId: activeThreadId,
        status: "indexed",
      });
    }

    const result = await agent.invoke(
      {
        messages: [{ role: "user", content: query }],
      },
      {
        configurable: {
          thread_id: activeThreadId,
          video_id: targetVideoId,
        },
      }
    );

    const usedTools = getUsedToolNames(result.messages);
    console.log(
      `[query] tools_used=${usedTools.length ? usedTools.join(", ") : "none"} | thread_id=${activeThreadId} | video_id=${targetVideoId}`
    );

    const answer = result.messages?.at(-1)?.content;
    return res.json({ answer });
  } catch (error) {
    console.error("Error processing query:", error);
    return res.status(500).json({ error: "An error occurred while processing your query." });
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

    const videoId = extractYoutubeVideoId(video_url);
    if (videoId) {
      await upsertIngestionRecord({
        videoId,
        videoUrl: video_url,
        triggerToolOutput: JSON.stringify(result),
        triggerResponse: result,
        status: "triggered",
        snapshotId: result?.snapshot_id || null,
      });
    }

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

app.post("/webhook", async (req, res) => {
  console.log("Received webhook:", req.body);

  try {
    const payload = Array.isArray(req.body) ? req.body[0] : req.body;
    const video = normalizeWebhookVideo(req.body);

    if (!video) {
      return res.status(202).json({
        message: "Webhook received, but payload had no transcript/video_id to index.",
      });
    }

    const alreadyIndexed = await isVideoIndexed(video.video_id);

    await upsertIngestionRecord({
      videoId: video.video_id,
      videoUrl: video.source_url,
      webhookPayload: payload,
      status: alreadyIndexed ? "indexed" : "processing",
    });

    if (alreadyIndexed) {
      return res.status(200).json({
        message: "Webhook received; video already indexed earlier, reusing existing data.",
        video_id: video.video_id,
      });
    }

    await addVideoToVectorStore(video);

    await upsertIngestionRecord({
      videoId: video.video_id,
      videoUrl: video.source_url,
      webhookPayload: payload,
      status: "indexed",
    });

    return res.status(200).json({
      message: "Webhook received and video indexed successfully",
      video_id: video.video_id,
    });
  } catch (error) {
    console.error("Error handling webhook:", error);
    return res.status(500).json({ error: "Failed to process webhook payload" });
  }
});

const PORT = process.env.PORT || 4000;
await ensureTables();
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
