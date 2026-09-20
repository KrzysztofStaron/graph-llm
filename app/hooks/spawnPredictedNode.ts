import type {
  GraphNode,
  GraphNodes,
  NodeDimensions,
} from "../types/GraphCanvas.types";
import { createNode, type TreeManager } from "../interfaces/TreeManager";
import {
  getDefaultNodeDimensions,
  placeCenteredBelowOrForce,
} from "../utils/placement";
import {
  spawnNodeType,
  type SpawnType,
} from "../utils/parseSpawnChoice";

export function readDomNodeSize(
  nodeId: string
): { width: number; height: number } | undefined {
  const element = document.querySelector(`[data-node-id="${nodeId}"]`);
  if (!(element instanceof HTMLElement)) {
    return undefined;
  }
  const width = element.offsetWidth;
  const height = element.offsetHeight;
  if (width <= 0 || height <= 0) {
    return undefined;
  }
  return { width, height };
}

export function alignChildUnderParent(args: {
  child: GraphNode;
  parentId: string;
  nodes: GraphNodes;
  dimensions: NodeDimensions;
}): { node: GraphNode; dimensions: NodeDimensions } {
  const parent = args.nodes[args.parentId];
  const childDim = readDomNodeSize(args.child.id) ?? args.dimensions[args.child.id];
  const parentDim = parent
    ? (readDomNodeSize(parent.id) ?? args.dimensions[parent.id])
    : undefined;
  if (!parent || !childDim || !parentDim) {
    return { node: args.child, dimensions: args.dimensions };
  }
  const dimensions = {
    ...args.dimensions,
    [args.child.id]: childDim,
    [parent.id]: parentDim,
  };
  const placed = placeCenteredBelowOrForce({
    parentX: parent.x,
    parentY: parent.y,
    parentWidth: parentDim.width,
    parentHeight: parentDim.height,
    childWidth: childDim.width,
    childHeight: childDim.height,
    nodes: args.nodes,
    dimensions,
    ignoreIds: [args.child.id, ...args.child.childrenIds],
  });
  return {
    node: { ...args.child, x: placed.x, y: placed.y },
    dimensions,
  };
}

export function commitAlignedNode(args: {
  node: GraphNode;
  parent: GraphNode;
  nodesRef: { current: GraphNodes };
  nodeDimensionsRef: { current: NodeDimensions };
  treeManager: TreeManager;
  nodesWithQuery: GraphNodes;
}): GraphNode {
  const current = args.nodesRef.current[args.node.id];
  if (!current) {
    return args.node;
  }
  const parent = args.nodesRef.current[args.parent.id] ?? args.parent;
  const aligned = alignChildUnderParent({
    child: current,
    parentId: parent.id,
    nodes: {
      ...args.nodesRef.current,
      [parent.id]: parent,
      [current.id]: current,
    },
    dimensions: args.nodeDimensionsRef.current,
  });
  if (!args.nodesRef.current[args.node.id]) {
    return args.node;
  }
  args.nodeDimensionsRef.current = aligned.dimensions;
  args.treeManager.patchNode(args.node.id, {
    x: aligned.node.x,
    y: aligned.node.y,
  });
  args.nodesRef.current[args.node.id] = aligned.node;
  args.nodesWithQuery[args.node.id] = aligned.node;
  return aligned.node;
}

export function scheduleAlignWhenPainted(args: {
  nodeId: string;
  parent: GraphNode;
  nodesRef: { current: GraphNodes };
  nodeDimensionsRef: { current: NodeDimensions };
  treeManager: TreeManager;
  nodesWithQuery: GraphNodes;
}) {
  let attempts = 0;
  const tick = () => {
    attempts += 1;
    const current = args.nodesRef.current[args.nodeId];
    const size = readDomNodeSize(args.nodeId);
    if (current && size && size.width > 20) {
      commitAlignedNode({
        node: current,
        parent: args.parent,
        nodesRef: args.nodesRef,
        nodeDimensionsRef: args.nodeDimensionsRef,
        treeManager: args.treeManager,
        nodesWithQuery: args.nodesWithQuery,
      });
    }
    if (attempts < 30) {
      requestAnimationFrame(tick);
    }
  };
  requestAnimationFrame(tick);
}

export function applyPredictedReplyType(args: {
  nodeId: string;
  spawn: SpawnType;
  treeManager: TreeManager;
  nodesWithQuery: GraphNodes;
  nodesRef: { current: GraphNodes };
}): GraphNode | undefined {
  const live = args.nodesRef.current[args.nodeId] ?? args.nodesWithQuery[args.nodeId];
  if (!live) return undefined;

  const generationStartedAt =
    live.status === "streaming" &&
    typeof live.generationStartedAt === "number"
      ? live.generationStartedAt
      : Date.now();

  const nextType = spawnNodeType(args.spawn);
  const patch =
    nextType === "response"
      ? {
          type: "response" as const,
          value: "",
          error: undefined,
          status: "streaming" as const,
          reasoning: undefined,
          generationStartedAt,
        }
      : {
          type: "image-response" as const,
          value: "",
          error: undefined,
          status: "streaming" as const,
          generationStartedAt,
        };

  args.treeManager.patchNode(args.nodeId, patch);
  const updated = { ...live, ...patch };
  args.nodesWithQuery[args.nodeId] = updated;
  args.nodesRef.current[args.nodeId] = updated;
  return updated;
}

/**
 * Swap a still-streaming text reply to the Jev-predicted type.
 * No-op for text, done/error nodes, or when the stream already set image bytes.
 */
export function applySpawnPrediction(args: {
  nodeId: string;
  spawn: SpawnType;
  parent: GraphNode;
  treeManager: TreeManager;
  nodesWithQuery: GraphNodes;
  nodesRef: { current: GraphNodes };
  nodeDimensionsRef: { current: NodeDimensions };
}): string | undefined {
  const live = args.nodesRef.current[args.nodeId] ?? args.nodesWithQuery[args.nodeId];
  if (!live) return undefined;
  if (live.status === "done" || live.status === "error") return undefined;

  if (args.spawn === "image") {
    if (live.type === "image-response" && live.value) return undefined;
    applyPredictedReplyType({
      nodeId: args.nodeId,
      spawn: "image",
      treeManager: args.treeManager,
      nodesWithQuery: args.nodesWithQuery,
      nodesRef: args.nodesRef,
    });
    scheduleAlignWhenPainted({
      nodeId: args.nodeId,
      parent: args.parent,
      nodesRef: args.nodesRef,
      nodeDimensionsRef: args.nodeDimensionsRef,
      treeManager: args.treeManager,
      nodesWithQuery: args.nodesWithQuery,
    });
    return undefined;
  }

  if (args.spawn === "youtube") {
    const reply = args.nodesWithQuery[args.nodeId] ?? live;
    return ensureYoutubeSkeleton({
      responseNode: reply,
      nodesWithQuery: args.nodesWithQuery,
      nodeDimensionsRef: args.nodeDimensionsRef,
      treeManager: args.treeManager,
    });
  }

  return undefined;
}

export function createStreamingReplyNode(args: {
  spawn?: SpawnType;
  parent: GraphNode;
  nodesWithQuery: GraphNodes;
  nodeDimensionsRef: { current: NodeDimensions };
  nodesRef: { current: GraphNodes };
  treeManager: TreeManager;
}): { responseNode: GraphNode; responseNodeId: string } {
  const replyType = spawnNodeType(args.spawn ?? "text");
  const replySize = getDefaultNodeDimensions(replyType);
  const callerDim =
    readDomNodeSize(args.parent.id) ??
    args.nodeDimensionsRef.current[args.parent.id];
  const freePos = placeCenteredBelowOrForce({
    parentX: args.parent.x,
    parentY: args.parent.y,
    parentWidth: callerDim?.width ?? 0,
    parentHeight: callerDim?.height ?? 0,
    childWidth: replySize.width,
    childHeight: replySize.height,
    nodes: args.nodesWithQuery,
    dimensions: args.nodeDimensionsRef.current,
  });

  const newNode =
    replyType === "image-response"
      ? {
          ...createNode("image-response", freePos.x, freePos.y),
          parentIds: [args.parent.id],
        }
      : {
          ...createNode("response", freePos.x, freePos.y),
          parentIds: [args.parent.id],
        };
  const streamingNode = {
    ...newNode,
    status: "streaming" as const,
    generationStartedAt: Date.now(),
  };
  args.treeManager.addNode(streamingNode);
  args.treeManager.linkNodes(args.parent.id, newNode.id);
  args.nodesRef.current[streamingNode.id] = streamingNode;
  args.nodesWithQuery[newNode.id] = streamingNode;
  args.nodesWithQuery[args.parent.id] = {
    ...args.nodesWithQuery[args.parent.id],
    childrenIds: args.nodesWithQuery[args.parent.id].childrenIds.includes(
      newNode.id
    )
      ? args.nodesWithQuery[args.parent.id].childrenIds
      : [...args.nodesWithQuery[args.parent.id].childrenIds, newNode.id],
  };

  scheduleAlignWhenPainted({
    nodeId: newNode.id,
    parent: args.parent,
    nodesRef: args.nodesRef,
    nodeDimensionsRef: args.nodeDimensionsRef,
    treeManager: args.treeManager,
    nodesWithQuery: args.nodesWithQuery,
  });

  return { responseNode: streamingNode, responseNodeId: newNode.id };
}

/**
 * Create one streaming YouTube child under the reply so appear particles and
 * the skeleton card start before SSE video ids arrive.
 */
export function ensureYoutubeSkeleton(args: {
  responseNode: GraphNode;
  nodesWithQuery: GraphNodes;
  nodeDimensionsRef: { current: NodeDimensions };
  treeManager: TreeManager;
}): string | undefined {
  const existing = args.responseNode.childrenIds.find((childId) => {
    const child = args.nodesWithQuery[childId];
    return child?.type === "youtube";
  });
  if (existing) {
    const child = args.nodesWithQuery[existing];
    if (child?.type === "youtube") {
      args.treeManager.patchNode(existing, {
        value: "",
        explanation: undefined,
        error: undefined,
        status: "streaming",
      });
      args.nodesWithQuery[existing] = {
        ...child,
        value: "",
        explanation: undefined,
        error: undefined,
        status: "streaming",
      };
    }
    return existing;
  }

  const responseDim =
    readDomNodeSize(args.responseNode.id) ??
    args.nodeDimensionsRef.current[args.responseNode.id];
  const youtubeSize = getDefaultNodeDimensions("youtube");
  const freePos = placeCenteredBelowOrForce({
    parentX: args.responseNode.x,
    parentY: args.responseNode.y,
    parentWidth: responseDim?.width ?? youtubeSize.width,
    parentHeight: responseDim?.height ?? youtubeSize.height,
    childWidth: youtubeSize.width,
    childHeight: youtubeSize.height,
    nodes: args.nodesWithQuery,
    dimensions: args.nodeDimensionsRef.current,
  });

  const youtubeNode = {
    ...createNode("youtube", freePos.x, freePos.y),
    parentIds: [args.responseNode.id],
    status: "streaming" as const,
    generationStartedAt:
      typeof args.responseNode.generationStartedAt === "number"
        ? args.responseNode.generationStartedAt
        : Date.now(),
  };
  args.treeManager.addNode(youtubeNode);
  args.treeManager.linkNodes(args.responseNode.id, youtubeNode.id);
  args.nodesWithQuery[youtubeNode.id] = youtubeNode;
  args.nodesWithQuery[args.responseNode.id] = {
    ...args.nodesWithQuery[args.responseNode.id],
    childrenIds: args.nodesWithQuery[
      args.responseNode.id
    ].childrenIds.includes(youtubeNode.id)
      ? args.nodesWithQuery[args.responseNode.id].childrenIds
      : [
          ...args.nodesWithQuery[args.responseNode.id].childrenIds,
          youtubeNode.id,
        ],
  };
  return youtubeNode.id;
}

export function fillYoutubeNodes(args: {
  responseNode: GraphNode;
  videos: Array<{ videoId: string; explanation?: string }>;
  skeletonId: string | undefined;
  nodesWithQuery: GraphNodes;
  nodeDimensionsRef: { current: NodeDimensions };
  treeManager: TreeManager;
}) {
  if (args.videos.length === 0) {
    if (args.skeletonId && args.nodesWithQuery[args.skeletonId]) {
      args.treeManager.deleteNode(args.skeletonId);
      delete args.nodesWithQuery[args.skeletonId];
    }
    return;
  }

  const responseDim =
    readDomNodeSize(args.responseNode.id) ??
    args.nodeDimensionsRef.current[args.responseNode.id];
  const youtubeSize = getDefaultNodeDimensions("youtube");

  args.videos.forEach((video, index) => {
    if (index === 0 && args.skeletonId && args.nodesWithQuery[args.skeletonId]) {
      const live = args.nodesWithQuery[args.skeletonId];
      if (live?.type === "youtube") {
        args.treeManager.patchNode(args.skeletonId, {
          value: video.videoId,
          explanation: video.explanation,
          status: "done",
          error: undefined,
        });
        args.nodesWithQuery[args.skeletonId] = {
          ...live,
          value: video.videoId,
          explanation: video.explanation,
          status: "done",
          error: undefined,
        };
      }
      return;
    }

    const freePos = placeCenteredBelowOrForce({
      parentX: args.responseNode.x,
      parentY: args.responseNode.y,
      parentWidth: responseDim?.width ?? 0,
      parentHeight: responseDim?.height ?? 0,
      childWidth: youtubeSize.width,
      childHeight: youtubeSize.height,
      nodes: args.nodesWithQuery,
      dimensions: args.nodeDimensionsRef.current,
    });

    const youtubeNode = {
      ...createNode("youtube", freePos.x, freePos.y),
      parentIds: [args.responseNode.id],
    };
    args.treeManager.addNode(youtubeNode);
    args.treeManager.patchNode(youtubeNode.id, {
      value: video.videoId,
      explanation: video.explanation,
      status: "done",
    });
    args.treeManager.linkNodes(args.responseNode.id, youtubeNode.id);
    args.nodesWithQuery[youtubeNode.id] = {
      ...youtubeNode,
      value: video.videoId,
      explanation: video.explanation,
      status: "done",
    };
  });
}
