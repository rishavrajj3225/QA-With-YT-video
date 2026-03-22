import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const calculatorTool = tool(
  async ({ expression }) => `Result of ${expression}`,
  {
    name: "calculator",
    description: "Useful for when you need to perform calculations.",
    schema: z.object({
      expression: z.string().describe("Mathematical expression"),
    }),
  }
);
