import { createRetrievalTool } from "./retrievalTool.js";
import { searchTool } from "./searchTool.js";
import { calculatorTool } from "./calculatorTool.js";
import { triggerYTScrapeTool } from "./triggerYTScrapeTool.js";

export const createAgentTools = (vectorStore) => [
  createRetrievalTool(vectorStore),
  searchTool,
  calculatorTool,
  triggerYTScrapeTool,
];
