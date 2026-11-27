import { GraphNodes } from "./types/";
import logger from "./utils/logger";

const isDevelopment = process.env.NODE_ENV === "development";
const configuredBackendUrl =
  process.env.NEXT_PUBLIC_GRAPH_LLM_BACKEND_URL?.trim();
const graphLLMBackendUrl = (
  configuredBackendUrl || "https://api.graphai.one"
).replace(/\/+$/, "");

export class globals {
  // Use the hosted API by default in every environment. Developers running a
  // local backend can opt in with NEXT_PUBLIC_GRAPH_LLM_BACKEND_URL.
  static readonly graphLLMBackendUrl = graphLLMBackendUrl;

  static readonly initialNodes: GraphNodes = {
    "input-1": {
      id: "input-1",
      type: "input",
      x: 0,
      y: 0,
      value: "",
      parentIds: [],
      childrenIds: [],
    },
  };
}

// Only log on client side to avoid calling Server Functions during SSR
if (typeof window !== 'undefined') {
  logger.info(
    `Environment: ${isDevelopment ? "development" : "production"}, Backend URL: ${globals.graphLLMBackendUrl}`
  );
}
