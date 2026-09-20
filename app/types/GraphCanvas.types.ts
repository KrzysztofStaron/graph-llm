export type NodeType =
  | "input"
  | "response"
  | "image-response"
  | "context"
  | "image-context"
  | "document"
  | "summary"
  | "youtube";

export type GenerationStatus = "idle" | "streaming" | "done" | "error";

export interface BaseNode {
  id: string;
  type: NodeType;
  x: number;
  y: number;
  value: string;
  parentIds: string[];
  childrenIds: string[];
  pinned?: boolean;
  error?: string;
  status?: GenerationStatus;
}

export interface ResponseNode extends BaseNode {
  type: "response";
  // Reasoning content from models like o1
  reasoning?: string;
}

export interface ImageResponseNode extends BaseNode {
  type: "image-response";
  // The image generation prompt (for display/debugging)
  prompt?: string;
}

export interface InputNode extends BaseNode {
  type: "input";
}

export interface ContextNode extends BaseNode {
  type: "context";
}

export interface ImageContextNode extends BaseNode {
  type: "image-context";
}

export interface DocumentNode extends BaseNode {
  type: "document";
}

export interface SummaryNode extends BaseNode {
  type: "summary";
}

export interface YouTubeNode extends BaseNode {
  type: "youtube";
  // videoId is stored in the value field
  explanation?: string;
}

export type GraphNode =
  | InputNode
  | ResponseNode
  | ImageResponseNode
  | ContextNode
  | ImageContextNode
  | DocumentNode
  | SummaryNode
  | YouTubeNode;

export type GraphNodes = Record<string, GraphNode>;

export interface Edge {
  from: string;
  to: string;
}

export type NodeDimensions = Record<string, { width: number; height: number }>;
