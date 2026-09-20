import type { GraphNodes } from "../types/GraphCanvas.types";
import type { TreeManager } from "../interfaces/TreeManager";
import {
  getDefaultNodeDimensions,
  hasRenderableContent,
  placeCenteredBelowOrForce,
} from "../utils/placement";
import { createNode } from "../interfaces/TreeManager";
import { readDomNodeSize } from "./spawnPredictedNode";

type NodeDimensionsRef = {
  current: Record<string, { width: number; height: number }>;
};

/** Spawn a follow-up input under a finished reply when one is not already linked. */
export function ensureFollowUpInput(args: {
  responseNodeId: string;
  nodesWithQuery: GraphNodes;
  nodesRef: { current: GraphNodes };
  nodeDimensionsRef: NodeDimensionsRef;
  treeManager: TreeManager;
}): void {
  const finishedNode = args.nodesRef.current[args.responseNodeId];
  if (!finishedNode) return;

  const alreadyHasFollowUp =
    finishedNode.childrenIds.some(
      (childId) => args.nodesRef.current[childId]?.type === "input"
    ) ||
    Object.values(args.nodesWithQuery).some(
      (node) =>
        node.type === "input" && node.parentIds.includes(args.responseNodeId)
    );
  if (!hasRenderableContent(finishedNode) || alreadyHasFollowUp) return;

  const responseDim =
    readDomNodeSize(args.responseNodeId) ??
    args.nodeDimensionsRef.current[args.responseNodeId];
  const inputSize = getDefaultNodeDimensions("input");
  const freePos = placeCenteredBelowOrForce({
    parentX: finishedNode.x,
    parentY: finishedNode.y,
    parentWidth: responseDim?.width ?? 0,
    parentHeight: responseDim?.height ?? 0,
    childWidth: inputSize.width,
    childHeight: inputSize.height,
    nodes: args.nodesWithQuery,
    dimensions: args.nodeDimensionsRef.current,
  });
  const newInputNode = {
    ...createNode("input", freePos.x, freePos.y),
    parentIds: [args.responseNodeId],
  };
  args.treeManager.addNode(newInputNode);
  args.treeManager.linkNodes(args.responseNodeId, newInputNode.id);
  args.nodesWithQuery[newInputNode.id] = newInputNode;
}
