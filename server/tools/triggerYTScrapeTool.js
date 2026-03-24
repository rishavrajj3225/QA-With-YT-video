import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { triggerYoutube } from "../../brightData.js";

export const triggerYTScrapeTool = tool(
  async ({ videoUrl }) => {
    const fallbackNotifyUrl = `${process.env.SERVER_PUBLIC_URL || "http://localhost:4000"}/webhook`;
    const notifyUrl = process.env.BRIGHTDATA_NOTIFY_URL || fallbackNotifyUrl;

    try {
      const response = await triggerYoutube(videoUrl, { notifyUrl });
      const output = {
        status: "triggered",
        videoUrl,
        notifyUrl,
        snapshotId: response?.snapshot_id || null,
        response,
      };

      return JSON.stringify(output);
    } catch (error) {
      console.error("Error triggering Bright Data scrape:", error);
      return JSON.stringify({
        status: "failed",
        videoUrl,
        notifyUrl,
        error: error.message,
      });
    }
  },
  {
    name: "trigger_youtube_scrape",
    description:
      "Triggers a YouTube scrape job via Bright Data using a video URL and sends results to the configured webhook.",
    schema: z.object({
      videoUrl: z.string().describe("The URL of the YouTube video to scrape"),
    }),
  }
);
