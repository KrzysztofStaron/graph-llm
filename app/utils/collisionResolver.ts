import type { GraphNode, GraphNodes } from "../types/graph";
import type { NodeDimensions } from "../hooks/useGraphCanvas";
import { getNodeRect, rectanglesIntersect, type Rectangle } from "./placement";
import { LAYOUT_CONFIG } from "../globals";

export interface CollisionPushConfig {
  pushStepPx: number;
  pinnedMaxNudgePx: number;
  gapPx: number;
}

export const DEFAULT_COLLISION_CONFIG: CollisionPushConfig = {
  pushStepPx: LAYOUT_CONFIG.pushStepPx,
  pinnedMaxNudgePx: LAYOUT_CONFIG.pinnedMaxNudgePx,
  gapPx: LAYOUT_CONFIG.gapPx,
};

export interface NodeMove {
  nodeId: string;
  dx: number;
  dy: number;
}

/**
 * Calculate the minimum separation vector to resolve overlap between two rectangles
 * Returns the direction and magnitude to move rect A away from rect B
 */
function calculateSeparationVector(
  a: Rectangle,
  b: Rectangle,
  gap: number
): { dx: number; dy: number } {
  // Calculate overlap on each axis
  const overlapX = Math.min(a.x + a.width + gap - b.x, b.x + b.width + gap - a.x);
  const overlapY = Math.min(a.y + a.height + gap - b.y, b.y + b.height + gap - a.y);

  // Move along the axis with smaller overlap (minimal separation)
  if (overlapX < overlapY) {
    // Separate horizontally
    const direction = a.x + a.width / 2 < b.x + b.width / 2 ? -1 : 1;
    return { dx: direction * overlapX, dy: 0 };
  } else {
    // Separate vertically
    const direction = a.y + a.height / 2 < b.y + b.height / 2 ? -1 : 1;
    return { dx: 0, dy: direction * overlapY };
  }
}

/**
 * Resolve collisions caused by a resizing source node (e.g., streaming response)
 * Returns a list of suggested moves for overlapping nodes
 * 
 * @param sourceNodeId - The node that is growing (e.g., response node)
 * @param nodes - All current nodes
 * @param dimensions - Measured dimensions
 * @param config - Collision resolution config
 * @returns Array of suggested moves
 */
export function resolveLocalCollisions(
  sourceNodeId: string,
  nodes: GraphNodes,
  dimensions: NodeDimensions,
  config: CollisionPushConfig = DEFAULT_COLLISION_CONFIG
): NodeMove[] {
  const { pushStepPx, pinnedMaxNudgePx, gapPx } = config;
  const moves: NodeMove[] = [];

  const sourceNode = nodes[sourceNodeId];
  if (!sourceNode) return moves;

  const sourceRect = getNodeRect(sourceNode, dimensions);

  // Find all nodes that overlap with the source
  const overlappingNodes: Array<{
    node: GraphNode;
    rect: Rectangle;
    isPinned: boolean;
  }> = [];

  for (const node of Object.values(nodes)) {
    if (node.id === sourceNodeId) continue;

    const nodeRect = getNodeRect(node, dimensions);
    if (rectanglesIntersect(sourceRect, nodeRect, gapPx)) {
      overlappingNodes.push({
        node,
        rect: nodeRect,
        isPinned: node.pinned || false,
      });
    }
  }

  if (overlappingNodes.length === 0) return moves;

  // Separate pinned and unpinned nodes
  const unpinnedOverlaps = overlappingNodes.filter((n) => !n.isPinned);
  const pinnedOverlaps = overlappingNodes.filter((n) => n.isPinned);

  // Strategy: push unpinned nodes away; if only pinned nodes overlap, move the source instead
  if (unpinnedOverlaps.length > 0) {
    // Push unpinned neighbors away
    for (const { node, rect } of unpinnedOverlaps) {
      const separation = calculateSeparationVector(rect, sourceRect, gapPx);
      
      // Cap the movement per frame
      const magnitude = Math.sqrt(separation.dx ** 2 + separation.dy ** 2);
      if (magnitude > 0) {
        const scale = Math.min(pushStepPx / magnitude, 1);
        moves.push({
          nodeId: node.id,
          dx: separation.dx * scale,
          dy: separation.dy * scale,
        });
      }
    }
  }

  // If there are pinned overlaps and no unpinned ones, move the source node instead
  if (pinnedOverlaps.length > 0 && unpinnedOverlaps.length === 0) {
    // Move source away from pinned nodes
    let totalDx = 0;
    let totalDy = 0;

    for (const { rect } of pinnedOverlaps) {
      const separation = calculateSeparationVector(sourceRect, rect, gapPx);
      totalDx += separation.dx;
      totalDy += separation.dy;
    }

    // Average the separation vectors
    const avgDx = totalDx / pinnedOverlaps.length;
    const avgDy = totalDy / pinnedOverlaps.length;

    const magnitude = Math.sqrt(avgDx ** 2 + avgDy ** 2);
    if (magnitude > 0) {
      const scale = Math.min(pushStepPx / magnitude, 1);
      moves.push({
        nodeId: sourceNodeId,
        dx: avgDx * scale,
        dy: avgDy * scale,
      });
    }
  }

  // If there are both pinned and unpinned overlaps, push unpinned but also nudge pinned slightly
  if (pinnedOverlaps.length > 0 && unpinnedOverlaps.length > 0) {
    for (const { node, rect } of pinnedOverlaps) {
      const separation = calculateSeparationVector(rect, sourceRect, gapPx);
      
      // Very small nudge for pinned nodes
      const magnitude = Math.sqrt(separation.dx ** 2 + separation.dy ** 2);
      if (magnitude > 0) {
        const scale = Math.min(pinnedMaxNudgePx / magnitude, 1);
        moves.push({
          nodeId: node.id,
          dx: separation.dx * scale,
          dy: separation.dy * scale,
        });
      }
    }
  }

  return moves;
}
