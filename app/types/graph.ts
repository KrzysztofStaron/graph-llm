export type NodeType = "input" | "response" | "context";

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

export type GraphNode = InputNode | ResponseNode | ContextNode;

export type GraphNodes = Record<string, GraphNode>;

export interface Edge {
  from: string;
  to: string;
}
