import { GraphNode, NodeDimensions } from "../types/";

export const getNodeCenter = (node: GraphNode, dimensions: NodeDimensions) => {
  const dim = dimensions[node.id];
  if (!dim) {
    return { x: node.x, y: node.y };
  }

  return {
    x: node.x + dim.width / 2,
    y: node.y + dim.height / 2,
  };
};
