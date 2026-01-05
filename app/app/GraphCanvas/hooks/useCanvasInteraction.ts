import { useRef, useReducer, useCallback, useEffect, useState } from "react";
import * as d3 from "d3";
import { GraphNodes, NodeDimensions } from "@/app/types/GraphCanvas.types";
import { getDefaultNodeDimensions } from "@/app/utils/placement";

interface UseCanvasInteractionProps {
  nodes: GraphNodes;
  localNodeDimensions: NodeDimensions;
  onDropFilesAsContext?: (
    files: FileList,
    canvasPoint: { x: number; y: number }
  ) => void;
  onRequestContextMenu?: (
    clientX: number,
    clientY: number,
    nodeId?: string
  ) => void;
}

interface UseCanvasInteractionReturn {
  transform: { x: number; y: number; k: number };
  setTransform: (transform: { x: number; y: number; k: number }) => void;
  viewportRef: React.RefObject<HTMLDivElement | null>;
  contentRef: React.RefObject<HTMLDivElement | null>;
  fitView: (duration?: number) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent) => void;
  handleContextMenu: (e: React.MouseEvent) => void;
}

export function useCanvasInteraction({
  nodes,
  localNodeDimensions,
  onDropFilesAsContext,
  onRequestContextMenu,
}: UseCanvasInteractionProps): UseCanvasInteractionReturn {
  // Transform state
  const [transform, setTransform] = useReducer(
    (
      prev: { x: number; y: number; k: number },
      next: { x: number; y: number; k: number }
    ) => next,
    { x: 0, y: 0, k: 1 }
  );

  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<
    HTMLDivElement,
    unknown
  > | null>(null);
  const [isZoomInitialized, setIsZoomInitialized] = useState(false);

  const nodeArray = Object.values(nodes);

  // Fit view function
  const fitView = useCallback(
    (duration = 750) => {
      if (
        !viewportRef.current ||
        !zoomBehaviorRef.current ||
        nodeArray.length === 0
      )
        return;

      const { clientWidth, clientHeight } = viewportRef.current;

      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;

      nodeArray.forEach((node) => {
        const dim =
          localNodeDimensions[node.id] || getDefaultNodeDimensions(node.type);
        minX = Math.min(minX, node.x);
        minY = Math.min(minY, node.y);
        maxX = Math.max(maxX, node.x + dim.width);
        maxY = Math.max(maxY, node.y + dim.height);
      });

      const contentWidth = maxX - minX;
      const contentHeight = maxY - minY;

      if (contentWidth <= 0 || contentHeight <= 0) return;

      const preScale = Math.min(
        (clientWidth - 300 * 2) / contentWidth,
        (clientHeight - 300 * 2) / contentHeight,
        1.5 // Max scale when fitting
      );

      const padding = 200 * preScale;

      const scale = Math.min(
        (clientWidth - padding * 2) / contentWidth,
        (clientHeight - padding * 2) / contentHeight,
        1.5 // Max scale when fitting
      );

      console.log(scale, "padding", padding);

      const tx = clientWidth / 2 - (minX + contentWidth / 2) * scale;
      const ty = clientHeight / 2 - (minY + contentHeight / 2) * scale;

      const newTransform = d3.zoomIdentity.translate(tx, ty).scale(scale);

      if (zoomBehaviorRef.current) {
        d3.select(viewportRef.current)
          .transition()
          .duration(duration)
          .call(zoomBehaviorRef.current.transform, newTransform);
      }
    },
    [nodeArray, localNodeDimensions]
  );

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!onDropFilesAsContext || !e.dataTransfer.files.length) return;

    // Convert screen coordinates to canvas coordinates
    const canvasX = (e.clientX - transform.x) / transform.k;
    const canvasY = (e.clientY - transform.y) / transform.k;

    onDropFilesAsContext(e.dataTransfer.files, { x: canvasX, y: canvasY });
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    if (!onRequestContextMenu) return;

    e.preventDefault();
    e.stopPropagation();

    // Check if click was on a node
    const nodeElement = (e.target as HTMLElement).closest(
      "[data-node-id]"
    ) as HTMLElement | null;
    const nodeId = nodeElement?.dataset.nodeId;

    onRequestContextMenu(e.clientX, e.clientY, nodeId);
  };

  // Store the current transform state in a ref to avoid recreating zoom behavior on every change
  const transformRef = useRef(transform);
  useEffect(() => {
    transformRef.current = transform;
  }, [transform]);

  // Initialize zoom behavior
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    // Create zoom behavior
    const zoom = d3
      .zoom<HTMLDivElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        const { x, y, k } = event.transform;
        if (contentRef.current) {
          contentRef.current.style.transform = `translate(${x}px, ${y}px) scale(${k})`;
        }
        setTransform({ x, y, k });
      })
      .filter((event) => {
        // Only allow zoom/pan if not clicking on buttons or inputs
        const target = event.target as HTMLElement;

        // Always allow zoom with wheel (unless stopped by stopPropagation)
        if (event.type === "wheel") return true;

        // For other events (mousedown, touchstart), filter out interactive elements
        // Prevent zoom/pan on nodes - the node drag handler will handle it
        return (
          !event.button &&
          target.tagName !== "BUTTON" &&
          target.tagName !== "TEXTAREA" &&
          target.tagName !== "INPUT" &&
          !target.closest(".cursor-pointer") &&
          !target.closest(".cursor-text") &&
          !target.closest(".cursor-move") &&
          !target.closest("[data-node-id]")
        );
      });

    const selection = d3.select(viewport);
    selection.call(zoom);
    zoomBehaviorRef.current = zoom;
    setIsZoomInitialized(true);

    // Set initial transform without transition
    const currentTransform = transformRef.current;
    selection.call(
      zoom.transform,
      d3.zoomIdentity
        .translate(currentTransform.x, currentTransform.y)
        .scale(currentTransform.k)
    );

    return () => {
      // Clean up properly using the captured viewport reference
      selection.on(".zoom", null);
      // Clear the behavior ref on cleanup
      if (zoomBehaviorRef.current === zoom) {
        zoomBehaviorRef.current = null;
      }
      setIsZoomInitialized(false);
    };
    // Run once on mount - viewport should not change during component lifecycle
  }, []); // Empty deps - zoom behavior should persist

  // Watchdog: Ensure zoom behavior stays attached
  // This helps recover if something breaks the event listeners
  useEffect(() => {
    if (!isZoomInitialized) return;

    const checkInterval = setInterval(() => {
      const viewport = viewportRef.current;
      const zoom = zoomBehaviorRef.current;

      if (!viewport || !zoom) return;

      // Check if zoom listeners are still attached by checking for __zoom property
      const selection = d3.select(viewport);
      const hasZoomProperty = selection.property("__zoom");

      if (!hasZoomProperty) {
        console.warn("Canvas zoom behavior lost, reattaching...");
        // Reattach zoom behavior
        selection.call(zoom);
        // Restore current transform
        const currentTransform = transformRef.current;
        selection.call(
          zoom.transform,
          d3.zoomIdentity
            .translate(currentTransform.x, currentTransform.y)
            .scale(currentTransform.k)
        );
      }
    }, 1000); // Check every second

    return () => clearInterval(checkInterval);
  }, [isZoomInitialized]);

  return {
    transform,
    setTransform,
    viewportRef,
    contentRef,
    fitView,
    handleDragOver,
    handleDrop,
    handleContextMenu,
  };
}
