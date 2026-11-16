import type { GraphNodes } from "../types/GraphCanvas.types";
import type { TreeManager } from "../interfaces/TreeManager";
import { hang, hasRenderableContent } from "../utils/placement";
import { createNode } from "../interfaces/TreeManager";
import { liveCanvas } from "./spawnPredictedNode";

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

  const spot = hang(
    liveCanvas(args.nodesRef.current, args.nodeDimensionsRef.current, [
      args.responseNodeId,
    ]),
    { type: "input", on: [args.responseNodeId] }
  );
  const newInputNode = {
    ...createNode("input", spot.x, spot.y),
    seat: spot.seat,
    parentIds: [args.responseNodeId],
  };
  args.treeManager.addNode(newInputNode);
  args.treeManager.linkNodes(args.responseNodeId, newInputNode.id);
  args.nodesWithQuery[newInputNode.id] = newInputNode;
}
