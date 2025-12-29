import type { GraphNode, GraphNodes } from "../types/graph";
import type { NodeDimensions } from "../hooks/useGraphCanvas";
import { LAYOUT_CONFIG } from "../globals";

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutConfig {
  gapPx: number;
  gridStepPx: number;
  maxSearchRings: number;
}

export const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  gapPx: LAYOUT_CONFIG.gapPx,
  gridStepPx: LAYOUT_CONFIG.gridStepPx,
  maxSearchRings: LAYOUT_CONFIG.maxSearchRings,
};

/**
 * Get default dimensions for a node type
 */
export function getDefaultNodeDimensions(
  nodeType: GraphNode["type"]
): { width: number; height: number } {
  switch (nodeType) {
    case "context":
      return { width: 176, height: 96 };
    case "image-context":
      return { width: 232, height: 192 };
    case "input":
      return { width: 400, height: 120 };
    case "response":
      return { width: 400, height: 80 };
  }
}

/**
 * Get the rectangle (AABB) for a node
 */
export function getNodeRect(
  node: GraphNode,
  dimensions: NodeDimensions
): Rectangle {
  const dim =
    dimensions[node.id] || getDefaultNodeDimensions(node.type);
  return {
    x: node.x,
    y: node.y,
    width: dim.width,
    height: dim.height,
  };
}

/**
 * Check if two rectangles intersect (with optional gap)
 */
export function rectanglesIntersect(
  a: Rectangle,
  b: Rectangle,
  gap: number = 0
): boolean {
  return !(
    a.x + a.width + gap <= b.x ||
    b.x + b.width + gap <= a.x ||
    a.y + a.height + gap <= b.y ||
    b.y + b.height + gap <= a.y
  );
}

/**
 * Find a free position near a target point using spiral search
 * 
 * @param targetX - Desired X position
 * @param targetY - Desired Y position
 * @param newNodeWidth - Width of the node to place
 * @param newNodeHeight - Height of the node to place
 * @param existingNodes - All existing nodes
 * @param dimensions - Measured dimensions of existing nodes
 * @param preferredDirection - Direction to prefer (e.g., "below" for vertical flow)
 * @param config - Layout configuration
 * @returns Free position {x, y}
 */
export function findFreePosition(
  targetX: number,
  targetY: number,
  newNodeWidth: number,
  newNodeHeight: number,
  existingNodes: GraphNodes,
  dimensions: NodeDimensions,
  preferredDirection: "below" | "right" | "left" | "above" = "below",
  config: LayoutConfig = DEFAULT_LAYOUT_CONFIG
): { x: number; y: number } {
  const { gapPx, gridStepPx, maxSearchRings } = config;

  // Build list of existing rectangles
  const existingRects = Object.values(existingNodes).map((node) =>
    getNodeRect(node, dimensions)
  );

  // Helper to check if a position is free
  const isPositionFree = (x: number, y: number): boolean => {
    const candidateRect: Rectangle = {
      x,
      y,
      width: newNodeWidth,
      height: newNodeHeight,
    };

    for (const existingRect of existingRects) {
      if (rectanglesIntersect(candidateRect, existingRect, gapPx)) {
        return false;
      }
    }
    return true;
  };

  // First, try the exact target position
  if (isPositionFree(targetX, targetY)) {
    return { x: targetX, y: targetY };
  }

  // Define search offsets based on preferred direction
  // We'll search in a spiral pattern but bias towards the preferred direction
  const getSearchOffsets = (ring: number): Array<{ dx: number; dy: number }> => {
    const offsets: Array<{ dx: number; dy: number }> = [];
    const step = gridStepPx * ring;

    // Generate positions in a ring around the target
    // Prioritize the preferred direction
    switch (preferredDirection) {
      case "below":
        // Search below first, then sides, then above
        for (let dx = -ring; dx <= ring; dx++) {
          offsets.push({ dx: dx * gridStepPx, dy: step }); // below
        }
        for (let dy = -ring; dy < ring; dy++) {
          offsets.push({ dx: step, dy: dy * gridStepPx }); // right
          offsets.push({ dx: -step, dy: dy * gridStepPx }); // left
        }
        for (let dx = -ring; dx <= ring; dx++) {
          offsets.push({ dx: dx * gridStepPx, dy: -step }); // above
        }
        break;

      case "right":
        // Search right first
        for (let dy = -ring; dy <= ring; dy++) {
          offsets.push({ dx: step, dy: dy * gridStepPx });
        }
        for (let dx = -ring; dx < ring; dx++) {
          offsets.push({ dx: dx * gridStepPx, dy: step });
          offsets.push({ dx: dx * gridStepPx, dy: -step });
        }
        for (let dy = -ring; dy <= ring; dy++) {
          offsets.push({ dx: -step, dy: dy * gridStepPx });
        }
        break;

      case "left":
        // Search left first
        for (let dy = -ring; dy <= ring; dy++) {
          offsets.push({ dx: -step, dy: dy * gridStepPx });
        }
        for (let dx = -ring + 1; dx <= ring; dx++) {
          offsets.push({ dx: dx * gridStepPx, dy: step });
          offsets.push({ dx: dx * gridStepPx, dy: -step });
        }
        for (let dy = -ring; dy <= ring; dy++) {
          offsets.push({ dx: step, dy: dy * gridStepPx });
        }
        break;

      case "above":
        // Search above first
        for (let dx = -ring; dx <= ring; dx++) {
          offsets.push({ dx: dx * gridStepPx, dy: -step });
        }
        for (let dy = -ring + 1; dy <= ring; dy++) {
          offsets.push({ dx: step, dy: dy * gridStepPx });
          offsets.push({ dx: -step, dy: dy * gridStepPx });
        }
        for (let dx = -ring; dx <= ring; dx++) {
          offsets.push({ dx: dx * gridStepPx, dy: step });
        }
        break;
    }

    return offsets;
  };

  // Spiral search outward from target
  for (let ring = 1; ring <= maxSearchRings; ring++) {
    const offsets = getSearchOffsets(ring);

    for (const { dx, dy } of offsets) {
      const candidateX = targetX + dx;
      const candidateY = targetY + dy;

      if (isPositionFree(candidateX, candidateY)) {
        return { x: candidateX, y: candidateY };
      }
    }
  }

  // Fallback: if we couldn't find a free spot, return the target position
  // (this shouldn't happen with reasonable maxSearchRings, but better than crashing)
  console.warn(
    "findFreePosition: Could not find free spot after max search rings, using target position"
  );
  return { x: targetX, y: targetY };
}
