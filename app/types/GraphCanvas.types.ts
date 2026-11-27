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

/** The direction a node hangs off its host. */
export type Flow = "below" | "right" | "left";

/**
 * Where a node sits relative to its host, decided once when the node is created.
 * A node with a seat has derived x/y that only `settle` writes. A node without one is hand-placed:
 * its x/y belong to the user. A seat counts only while `hostId` exists and is still in `parentIds`.
 */
export interface Seat {
  hostId: string;
  flow: Flow;
  /**
   * Offset across the flow, fixed at creation. "below": child center x minus host center x.
   * "right" | "left": child top minus host top.
   */
  shift: number;
}

export interface BaseNode {
  id: string;
  type: NodeType;
  x: number;
  y: number;
  value: string;
  parentIds: string[];
  childrenIds: string[];
  seat?: Seat;
  error?: string;
  status?: GenerationStatus;
  /** Epoch ms when the current generation request started. */
  generationStartedAt?: number;
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
