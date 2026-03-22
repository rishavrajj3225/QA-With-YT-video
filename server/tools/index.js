import { createRetrievalTool } from "./retrievalTool.js";
import { searchTool } from "./searchTool.js";
import { calculatorTool } from "./calculatorTool.js";

export const createAgentTools = (vectorStore) => [
  createRetrievalTool(vectorStore),
  searchTool,
  calculatorTool,
];
