import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const searchTool = tool(async ({ query }) => `Search results for ${query}`, {
  name: "search",
  description: "Useful for when you need to answer questions about current events.",
  schema: z.object({
    query: z.string().describe("Search query"),
  }),
});
