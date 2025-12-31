import { GraphNode, NodeDimensions } from "../types/graph";

export const getNodeCenter = (node: GraphNode, dimensions: NodeDimensions) => {
  const dim = dimensions[node.id];
  const width =
    dim?.width ??
    (node.type === "context"
      ? 176
      : node.type === "image-context"
      ? 464
      : node.type === "document"
      ? 176
      : 400);
  const height =
    dim?.height ??
    (node.type === "context"
      ? 96
      : node.type === "image-context"
      ? 384
      : node.type === "document"
      ? 96
      : node.type === "input"
      ? 120
      : 80);

  return {
    x: node.x + width / 2,
    y: node.y + height / 2,
  };
};
