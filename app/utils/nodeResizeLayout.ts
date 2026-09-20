import type { GraphNode, GraphNodes, NodeDimensions } from "../types/";
import { layoutMovesForMeasuredNode } from "./placement";

export function layoutMovesAfterResize(args: {
  node: GraphNode;
  width: number;
  height: number;
  nodes: GraphNodes;
  dimensions: NodeDimensions;
}): Array<{ nodeId: string; dx: number; dy: number }> {
  return layoutMovesForMeasuredNode(args);
}
