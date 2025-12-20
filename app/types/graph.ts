export type NodeType = "input" | "response" | "context";

export interface BaseNode {
  id: string;
  type: NodeType;
  x: number;
  y: number;
}

export interface ResponseNode extends BaseNode {
  type: "response";
  content: string;
}

export interface InputNode extends BaseNode {
  type: "input";
}

export interface ContextNode extends BaseNode {
  type: "context";
}

export type GraphNode = InputNode | ResponseNode | ContextNode;

export interface Edge {
  from: string;
  to: string;
}
