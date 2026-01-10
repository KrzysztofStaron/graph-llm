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
  onCanvasClick?: () => void;
}

interface UseCanvasInteractionReturn {
  transform: { x: number; y: number; k: number };
  setTransform: (transform: { x: number; y: number; k: number }) => void;
  viewportRef: React.RefObject<HTMLDivElement | null>;
  contentRef: React.RefObject<HTMLDivElement | null>;
  fitView: (duration?: number) => void;
  panCanvas: (dx: number, dy: number) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent) => void;
  handleContextMenu: (e: React.MouseEvent) => void;
}

export function useCanvasInteraction({
  nodes,
  localNodeDimensions,
  onDropFilesAsContext,
  onRequestContextMenu,
  onCanvasClick,
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

  // Pan canvas function for keyboard controls (smooth direct DOM update)
  const panCanvas = useCallback(
    (dx: number, dy: number) => {
      if (!contentRef.current) return;
      
      // Get current transform from ref
      const current = transformRef.current;
      const newX = current.x + dx;
      const newY = current.y + dy;
      
      // Update DOM directly for smooth animation (no React re-render)
      contentRef.current.style.transform = `translate(${newX}px, ${newY}px) scale(${current.k})`;
      
      // Update internal state ref immediately
      transformRef.current = { x: newX, y: newY, k: current.k };
      
      // Debounce React state update to avoid constant re-renders
      // This keeps React in sync but doesn't cause snapping
      if (viewportRef.current && zoomBehaviorRef.current) {
        const selection = d3.select(viewportRef.current);
        const newTransform = d3.zoomIdentity.translate(newX, newY).scale(current.k);
        
        // Update d3's internal state without triggering zoom event (no transition)
        selection.property("__zoom", newTransform);
      }
    },
    []
  );

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Check if the drop is coming from a canvas node (which uses pointer events, not drag-and-drop)
    // If there are files but no storage data, it might be a node being dragged that contains a file
    // We should ignore this case as nodes are moved via pointer events
    const storedItemData = e.dataTransfer.getData("application/json");
    const hasFiles = e.dataTransfer.files && e.dataTransfer.files.length > 0;
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/ed17caec-2749-4a3c-95c9-6731b2da51e1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useCanvasInteraction.ts:drop-check',message:'Drop event initial check',data:{hasStorageData:!!storedItemData,hasFiles,filesLength:e.dataTransfer.files?.length,types:Array.from(e.dataTransfer.types)},timestamp:Date.now(),sessionId:'debug-session',runId:'initial',hypothesisId:'H9'})}).catch(()=>{});
    // #endregion
    
    // If there are files but no storage data and no explicit external file drop marker,
    // this is likely a node drag (which shouldn't trigger drop handler)
    if (hasFiles && !storedItemData) {
      // Check if this is an external file drop (from file system) vs internal node drag
      // External drops will have 'Files' type without any internal markers
      const isExternalDrop = e.dataTransfer.types.includes('Files') && 
                             !e.dataTransfer.types.includes('application/x-moz-node');
      
      if (!isExternalDrop) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/ed17caec-2749-4a3c-95c9-6731b2da51e1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useCanvasInteraction.ts:ignore-node-drag',message:'Ignoring node drag as file drop',data:{types:Array.from(e.dataTransfer.types)},timestamp:Date.now(),sessionId:'debug-session',runId:'initial',hypothesisId:'H9'})}).catch(()=>{});
        // #endregion
        return; // Ignore node drags
      }
    }

    // Get viewport position for accurate coordinate conversion
    const viewport = viewportRef.current;
    if (!viewport) return;

    const viewportRect = viewport.getBoundingClientRect();
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/ed17caec-2749-4a3c-95c9-6731b2da51e1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useCanvasInteraction.ts:drop-start',message:'Drop event coordinates',data:{clientX:e.clientX,clientY:e.clientY,viewportRect:{left:viewportRect.left,top:viewportRect.top,width:viewportRect.width,height:viewportRect.height},transform:{x:transform.x,y:transform.y,k:transform.k}},timestamp:Date.now(),sessionId:'debug-session',runId:'initial',hypothesisId:'H1,H2,H4'})}).catch(()=>{});
    // #endregion
    
    // Convert screen coordinates relative to viewport
    const viewportX = e.clientX - viewportRect.left;
    const viewportY = e.clientY - viewportRect.top;

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/ed17caec-2749-4a3c-95c9-6731b2da51e1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useCanvasInteraction.ts:viewport-coords',message:'Viewport-relative coordinates',data:{viewportX,viewportY},timestamp:Date.now(),sessionId:'debug-session',runId:'initial',hypothesisId:'H1'})}).catch(()=>{});
    // #endregion

    // Convert viewport coordinates to canvas coordinates
    // Formula: canvas = (viewport - transform.translate) / transform.scale
    const canvasX = (viewportX - transform.x) / transform.k;
    const canvasY = (viewportY - transform.y) / transform.k;

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/ed17caec-2749-4a3c-95c9-6731b2da51e1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useCanvasInteraction.ts:canvas-coords',message:'Calculated canvas coordinates',data:{canvasX,canvasY},timestamp:Date.now(),sessionId:'debug-session',runId:'initial',hypothesisId:'H3'})}).catch(()=>{});
    // #endregion

    // Check if dropping a stored item from storage panel (already retrieved above)
    
    if (storedItemData) {
      try {
        const item = JSON.parse(storedItemData) as import("../../../hooks/useContextStorage").StoredItem;
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/ed17caec-2749-4a3c-95c9-6731b2da51e1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useCanvasInteraction.ts:dispatch-event',message:'Dispatching storage item drop event',data:{itemType:item.type,canvasPoint:{x:canvasX,y:canvasY}},timestamp:Date.now(),sessionId:'debug-session',runId:'initial',hypothesisId:'H6'})}).catch(()=>{});
        // #endregion
        
        // Dispatch custom event to handle storage item drop
        const event = new CustomEvent("storageItemDrop", {
          detail: { item, canvasPoint: { x: canvasX, y: canvasY } },
        });
        window.dispatchEvent(event);
        return;
      } catch (err) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/ed17caec-2749-4a3c-95c9-6731b2da51e1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useCanvasInteraction.ts:parse-error',message:'Failed to parse storage item',data:{error:String(err)},timestamp:Date.now(),sessionId:'debug-session',runId:'initial',hypothesisId:'H6'})}).catch(()=>{});
        // #endregion
        // Not a stored item, continue with file handling
      }
    }

    if (!onDropFilesAsContext || !e.dataTransfer.files.length) return;

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

  // Store callback refs to avoid recreating zoom behavior
  const onCanvasClickRef = useRef(onCanvasClick);
  useEffect(() => {
    onCanvasClickRef.current = onCanvasClick;
  }, [onCanvasClick]);

  // Initialize zoom behavior
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    // Create zoom behavior
    const zoom = d3
      .zoom<HTMLDivElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("start", (event) => {
        // Clear selection when starting pan on empty canvas (not on a node)
        const target = event.sourceEvent?.target as HTMLElement | undefined;
        if (!target) return;
        
        const isNode = target.closest("[data-node-id]");
        const isRightClick = event.sourceEvent?.button === 2;
        const isShiftHeld = event.sourceEvent?.shiftKey;
        
        // Clear selection if clicking on canvas (not node), not right-click, and not shift
        if (!isNode && !isRightClick && !isShiftHeld && onCanvasClickRef.current) {
          onCanvasClickRef.current();
        }
      })
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

        // Disable double-click zoom
        if (event.type === "dblclick") return false;

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
    
    // Explicitly disable double-click to zoom
    selection.on("dblclick.zoom", null);
    
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

  // Apply transform changes to zoom behavior if it's already initialized
  // This allows programmatic transform updates to work after zoom is set up
  useEffect(() => {
    if (!isZoomInitialized || !zoomBehaviorRef.current || !viewportRef.current) return;

    const viewport = viewportRef.current;
    const zoom = zoomBehaviorRef.current;
    const selection = d3.select(viewport);
    
    // Get current zoom transform
    const currentZoomTransform = selection.property("__zoom") as d3.ZoomTransform | undefined;
    
    // Only update if the transform state differs from the zoom transform
    // This prevents infinite loops (zoom handler updates transform, which triggers this effect)
    if (currentZoomTransform) {
      const transformMatches =
        Math.abs(currentZoomTransform.x - transform.x) < 0.01 &&
        Math.abs(currentZoomTransform.y - transform.y) < 0.01 &&
        Math.abs(currentZoomTransform.k - transform.k) < 0.01;
      
      if (!transformMatches) {
        selection.call(
          zoom.transform,
          d3.zoomIdentity.translate(transform.x, transform.y).scale(transform.k)
        );
      }
    }
  }, [transform, isZoomInitialized]);

  return {
    transform,
    setTransform,
    viewportRef,
    contentRef,
    fitView,
    panCanvas,
    handleDragOver,
    handleDrop,
    handleContextMenu,
  };
}
