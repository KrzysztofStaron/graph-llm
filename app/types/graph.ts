export type NodeType = "input" | "response" | "context";

export interface GraphNode {
  id: string;
  type: NodeType;
  x: number;
  y: number;
  content?: string;
}

export interface Edge {
  from: string;
  to: string;
}

