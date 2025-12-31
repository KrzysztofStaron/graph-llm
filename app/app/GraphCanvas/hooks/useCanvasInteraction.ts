import { useRef, useReducer, useCallback, useEffect } from "react";
import * as d3 from "d3";
import { GraphNodes, NodeDimensions } from "@/app/types/GraphCanvas.types";
import { getDefaultNodeDimensions } from "@/app/utils/placement";

interface UseCanvasInteractionProps {
  nodes: GraphNodes;
  localNodeDimensions: NodeDimensions;
  onClearSelection: () => void;
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
  onClearSelection,
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

  // Handle canvas clicks to clear selection (before d3-zoom processes them)
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const handleCanvasMouseDown = (e: MouseEvent) => {
      // Don't clear selection on right-click (button 2)
      if (e.button === 2) return;

      const target = e.target as HTMLElement;

      // Only handle if clicking on canvas background (not on a node)
      const closestNode = target.closest("[data-node-id]");
      if (!closestNode && !e.shiftKey) {
        onClearSelection();
      }
    };

    // Use capture phase to fire before d3-zoom
    viewport.addEventListener("mousedown", handleCanvasMouseDown, true);

    return () => {
      viewport.removeEventListener("mousedown", handleCanvasMouseDown, true);
    };
  }, [onClearSelection]);

  // Initialize zoom behavior
  useEffect(() => {
    if (!viewportRef.current) return;

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

        // For other events (mousedown, touchstart), filter out interactive elements and nodes
        return (
          !event.button &&
          target.tagName !== "BUTTON" &&
          target.tagName !== "TEXTAREA" &&
          target.tagName !== "INPUT" &&
          !target.closest(".cursor-pointer") &&
          !target.closest(".cursor-text") &&
          // Prevent panning if we are clicking directly on a node's drag handle
          !target.closest("[data-node-id]")
        );
      });

    const svg = d3.select(viewportRef.current);
    svg.call(zoom);
    zoomBehaviorRef.current = zoom;

    // Set initial transform without transition
    svg.call(
      zoom.transform,
      d3.zoomIdentity.translate(transform.x, transform.y).scale(transform.k)
    );

    return () => {
      svg.on(".zoom", null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

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
