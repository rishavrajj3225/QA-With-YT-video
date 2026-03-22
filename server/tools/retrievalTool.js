import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const createRetrievalTool = (vectorStore) =>
  tool(
    async ({ query, k = 3 }, { configurable: { video_id } }) => {
      try {
        console.log("Query:", query, "K:", k);
        const results = await vectorStore.similaritySearch(
          query,
          k,
          (doc) => doc.metadata.id === video_id
        );
        console.log(video_id);
        return results.map((res) => res.pageContent).join("\n---\n");
      } catch (error) {
        console.error("Error in retrieval tool:", error);
        return "Sorry, I couldn't retrieve the information at this time.";
      }
    },
    {
      name: "retrieval",
      description:
        "Useful for when you need to answer questions about the video content.",
      schema: z.object({
        query: z.string().describe("The question about the video"),
        k: z
          .number()
          .describe("Number of relevant chunks to retrieve")
          .default(3),
      }),
    }
  );
