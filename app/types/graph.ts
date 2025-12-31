export type NodeType =
  | "input"
  | "response"
  | "context"
  | "image-context"
  | "document";

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

export type GraphNode =
  | InputNode
  | ResponseNode
  | ContextNode
  | ImageContextNode
  | DocumentNode;

export type GraphNodes = Record<string, GraphNode>;

export interface Edge {
  from: string;
  to: string;
}

export type NodeDimensions = Record<string, { width: number; height: number }>;

export type Vector2 = { x: number; y: number };
