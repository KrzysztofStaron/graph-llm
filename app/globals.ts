import { GraphNodes } from "./types/";

const local = process.env.NODE_ENV === "development";

export class globals {
  static readonly graphLLMBackendUrl = local
    ? "http://localhost:9955"
    : "https://api.graphai.one"; //

  static readonly initialNodes: GraphNodes = {
    "input-1": {
      id: "input-1",
      type: "input",
      x: 800,
      y: 473 - 136 / 2,
      value: "",
      parentIds: [],
      childrenIds: [],
    },
  };
}

console.log("local", globals.graphLLMBackendUrl);
// http://localhost:995

/**
 * Auto-layout tuning constants
 * Adjust these to change the behavior of smart placement and collision resolution
 */
export const LAYOUT_CONFIG = {
  /**
   * Minimum gap between nodes (in pixels)
   * Increase for more spacing, decrease for tighter packing
   */
  gapPx: 16,

  /**
   * Grid step size for spiral search (in pixels)
   * Smaller = more precise but slower search, larger = faster but less precise
   */
  gridStepPx: 10,

  /**
   * Maximum number of rings to search outward when finding free position
   * Increase if nodes fail to find spots in dense areas
   * Lower values keep nodes closer to their parents
   */
  maxSearchRings: 20,

  /**
   * How many pixels to push unpinned nodes per frame during collision resolution
   * Increase for faster/snappier movement, decrease for smoother/slower
   */
  pushStepPx: 12,

  /**
   * Maximum pixels to nudge pinned (user-dragged) nodes per frame
   * Keep this small to respect user intent
   */
  pinnedMaxNudgePx: 3,
};
