export type NodeType = "input" | "response" | "context" | "image-context";

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

export type GraphNode = InputNode | ResponseNode | ContextNode | ImageContextNode;

export type GraphNodes = Record<string, GraphNode>;

export interface Edge {
  from: string;
  to: string;
}
