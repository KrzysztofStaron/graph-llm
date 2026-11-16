import type {
  GraphNode,
  GraphNodes,
  NodeDimensions,
} from "../types/GraphCanvas.types";
import { createNode, type TreeManager } from "../interfaces/TreeManager";
import { hang, settle, type Canvas } from "../utils/placement";
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

/** The canvas placement reads, with the DOM size of `freshIds` in place of what was last reported. */
export function liveCanvas(
  nodes: GraphNodes,
  sizes: NodeDimensions,
  freshIds: readonly string[]
): Canvas {
  const fresh = { ...sizes };
  for (const id of freshIds) {
    const dom = readDomNodeSize(id);
    if (dom) fresh[id] = dom;
  }
  return { nodes, sizes: fresh };
}

export function commitAlignedNode(args: {
  nodeId: string;
  nodesRef: { current: GraphNodes };
  nodeDimensionsRef: { current: NodeDimensions };
  treeManager: TreeManager;
}): GraphNode | undefined {
  const current = args.nodesRef.current[args.nodeId];
  if (!current) {
    return undefined;
  }
  const canvas = liveCanvas(
    args.nodesRef.current,
    args.nodeDimensionsRef.current,
    current.seat ? [current.id, current.seat.hostId] : [current.id]
  );
  args.nodeDimensionsRef.current = canvas.sizes;
  for (const move of settle(canvas, current.id)) {
    if (!args.nodesRef.current[move.id]) continue;
    args.treeManager.patchNode(move.id, { x: move.x, y: move.y });
  }
  return args.nodesRef.current[args.nodeId];
}

export function scheduleAlignWhenPainted(args: {
  nodeId: string;
  nodesRef: { current: GraphNodes };
  nodeDimensionsRef: { current: NodeDimensions };
  treeManager: TreeManager;
}) {
  let attempts = 0;
  const tick = () => {
    attempts += 1;
    const current = args.nodesRef.current[args.nodeId];
    const size = readDomNodeSize(args.nodeId);
    if (current && size && size.width > 20) {
      commitAlignedNode(args);
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
      nodesRef: args.nodesRef,
      nodeDimensionsRef: args.nodeDimensionsRef,
      treeManager: args.treeManager,
    });
    return undefined;
  }

  if (args.spawn === "youtube") {
    const reply = args.nodesWithQuery[args.nodeId] ?? live;
    return ensureYoutubeSkeleton({
      responseNode: reply,
      nodesWithQuery: args.nodesWithQuery,
      nodesRef: args.nodesRef,
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
  const spot = hang(
    liveCanvas(args.nodesRef.current, args.nodeDimensionsRef.current, [
      args.parent.id,
    ]),
    { type: replyType, on: [args.parent.id] }
  );

  const newNode =
    replyType === "image-response"
      ? {
          ...createNode("image-response", spot.x, spot.y),
          seat: spot.seat,
          parentIds: [args.parent.id],
        }
      : {
          ...createNode("response", spot.x, spot.y),
          seat: spot.seat,
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
    nodesRef: args.nodesRef,
    nodeDimensionsRef: args.nodeDimensionsRef,
    treeManager: args.treeManager,
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
  nodesRef: { current: GraphNodes };
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

  const spot = hang(
    liveCanvas(args.nodesRef.current, args.nodeDimensionsRef.current, [
      args.responseNode.id,
    ]),
    { type: "youtube", on: [args.responseNode.id] }
  );

  const youtubeNode = {
    ...createNode("youtube", spot.x, spot.y),
    seat: spot.seat,
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
  nodesRef: { current: GraphNodes };
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

    const spot = hang(
      liveCanvas(args.nodesRef.current, args.nodeDimensionsRef.current, [
        args.responseNode.id,
      ]),
      { type: "youtube", on: [args.responseNode.id] }
    );

    const youtubeNode = {
      ...createNode("youtube", spot.x, spot.y),
      seat: spot.seat,
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
