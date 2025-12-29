const local = process.env.NODE_ENV === "development";

export class globals {
  static readonly graphLLMBackendUrl = local
    ? "http://localhost:9955"
    : "https://api.graphai.one"; //
}

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
  gapPx: 24,

  /**
   * Grid step size for spiral search (in pixels)
   * Smaller = more precise but slower search, larger = faster but less precise
   */
  gridStepPx: 20,

  /**
   * Maximum number of rings to search outward when finding free position
   * Increase if nodes fail to find spots in dense areas
   */
  maxSearchRings: 50,

  /**
   * How many pixels to push unpinned nodes per frame during collision resolution
   * Increase for faster/snappier movement, decrease for smoother/slower
   */
  pushStepPx: 8,

  /**
   * Maximum pixels to nudge pinned (user-dragged) nodes per frame
   * Keep this small to respect user intent
   */
  pinnedMaxNudgePx: 10,
};
