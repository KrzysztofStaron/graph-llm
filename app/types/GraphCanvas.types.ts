export type NodeType =
  | "input"
  | "response"
  | "image-response"
  | "context"
  | "image-context"
  | "document"
  | "summary"
  | "youtube";

export interface BaseNode {
  id: string;
  type: NodeType;
  x: number;
  y: number;
  value: string;
  // needed to easly traverse for the context
  parentIds: string[];

  // needed for cascading updates
  childrenIds: string[];

  // true if user has manually dragged this node (prevents auto-layout from moving it)
  pinned?: boolean;

  // error message if the node failed to process
  error?: string;
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
