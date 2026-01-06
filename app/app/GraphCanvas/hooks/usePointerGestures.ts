import { useRef, useEffect, useCallback } from "react";

interface UsePointerGesturesProps {
  transform: { x: number; y: number; k: number };
  selectedNodeIds: Set<string>;
  toggleNodeSelection: (nodeId: string) => void;
  clearSelection: () => void;
  moveNode: (nodeId: string, dx: number, dy: number, setPinned?: boolean) => void;
  onRequestContextMenu?: (clientX: number, clientY: number, nodeId?: string) => void;
}

interface UsePointerGesturesReturn {
  handleNodePointerDown: (e: React.PointerEvent, nodeId: string) => void;
  handleCanvasPointerDown: (e: React.PointerEvent) => void;
  handleCanvasPointerUp: (e: React.PointerEvent) => void;
}

const LONG_PRESS_DURATION = 450; // ms
const MOVE_THRESHOLD = 8; // pixels

export function usePointerGestures({
  transform,
  selectedNodeIds,
  toggleNodeSelection,
  clearSelection,
  moveNode,
  onRequestContextMenu,
}: UsePointerGesturesProps): UsePointerGesturesReturn {
  const draggingRef = useRef<{
    pointerId: number;
    nodeId: string;
    hasMoved: boolean;
    startX: number;
    startY: number;
  } | null>(null);

  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const longPressFiredRef = useRef(false);
  const previousSelectionRef = useRef<Set<string>>(new Set());

  const canvasTapRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    hasMoved: boolean;
  } | null>(null);

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressFiredRef.current = false;
  }, []);

  const handleNodePointerDown = useCallback(
    (e: React.PointerEvent, nodeId: string) => {
      const isMouse = e.pointerType === "mouse";
      const isTouch = e.pointerType === "touch" || e.pointerType === "pen";

      // Two-finger tap toggle (multi-select on mobile) - DON'T clear selection
      if (isTouch && !e.isPrimary) {
        e.preventDefault();
        e.stopPropagation();
        toggleNodeSelection(nodeId);
        return;
      }

      // Desktop: Shift+click toggles selection
      if (isMouse && e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        toggleNodeSelection(nodeId);
        return;
      }

      // Prevent d3-zoom from handling this
      e.preventDefault();
      e.stopPropagation();

      const isNodeSelected = selectedNodeIds.has(nodeId);

      // Store previous selection for potential long-press restoration
      if (isTouch) {
        previousSelectionRef.current = new Set(selectedNodeIds);
      }

      // Desktop: if node not selected, clear others
      if (isMouse && !isNodeSelected) {
        clearSelection();
      }

      // Mobile: ONLY clear selection on single-finger touch if node not already selected
      // (will be restored if long-press fires)
      if (isTouch && !isNodeSelected) {
        clearSelection();
      }

      // Start tracking for drag or tap
      draggingRef.current = {
        pointerId: e.pointerId,
        nodeId,
        hasMoved: false,
        startX: e.clientX,
        startY: e.clientY,
      };

      // For touch: start long-press timer
      if (isTouch && onRequestContextMenu) {
        clearLongPressTimer();
        longPressFiredRef.current = false;
        longPressTimerRef.current = setTimeout(() => {
          longPressFiredRef.current = true;
          // Restore previous selection when long-press fires
          previousSelectionRef.current.forEach((id) => {
            if (!selectedNodeIds.has(id)) {
              toggleNodeSelection(id);
            }
          });
          onRequestContextMenu(e.clientX, e.clientY, nodeId);
          draggingRef.current = null; // Cancel drag
        }, LONG_PRESS_DURATION);
      }

      // Capture pointer
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [
      selectedNodeIds,
      toggleNodeSelection,
      clearSelection,
      onRequestContextMenu,
      clearLongPressTimer,
    ]
  );

  const handleCanvasPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const isTouch = e.pointerType === "touch" || e.pointerType === "pen";
      
      if (!isTouch) return; // Desktop handles via onMouseDown

      // Store previous selection for potential long-press restoration
      previousSelectionRef.current = new Set(selectedNodeIds);

      // Track for tap-to-clear or long-press
      canvasTapRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        hasMoved: false,
      };

      // Start long-press timer for canvas context menu
      if (onRequestContextMenu) {
        clearLongPressTimer();
        longPressFiredRef.current = false;
        longPressTimerRef.current = setTimeout(() => {
          longPressFiredRef.current = true;
          // Restore previous selection when long-press fires on canvas
          previousSelectionRef.current.forEach((id) => {
            if (!selectedNodeIds.has(id)) {
              toggleNodeSelection(id);
            }
          });
          onRequestContextMenu(e.clientX, e.clientY);
        }, LONG_PRESS_DURATION);
      }
    },
    [onRequestContextMenu, clearLongPressTimer, selectedNodeIds, toggleNodeSelection]
  );

  const handleCanvasPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const isTouch = e.pointerType === "touch" || e.pointerType === "pen";

      // Only clear selection if it was truly a tap (not a pan/drag) and not a long-press
      if (isTouch && canvasTapRef.current) {
        const dx = e.clientX - canvasTapRef.current.startX;
        const dy = e.clientY - canvasTapRef.current.startY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Only clear if tap (not moved) and not long-press
        if (distance <= MOVE_THRESHOLD && !canvasTapRef.current.hasMoved && !longPressFiredRef.current) {
          clearSelection();
        }
      }

      canvasTapRef.current = null;
      clearLongPressTimer();
    },
    [clearSelection, clearLongPressTimer]
  );

  // Global pointer move/up handlers
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      const dragging = draggingRef.current;
      if (!dragging || dragging.pointerId !== e.pointerId) {
        // Check canvas tap movement
        if (canvasTapRef.current && canvasTapRef.current.pointerId === e.pointerId) {
          const dx = e.clientX - canvasTapRef.current.startX;
          const dy = e.clientY - canvasTapRef.current.startY;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance > MOVE_THRESHOLD) {
            canvasTapRef.current.hasMoved = true;
            clearLongPressTimer();
          }
        }
        return;
      }

      const dx = e.clientX - dragging.startX;
      const dy = e.clientY - dragging.startY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Check if moved beyond threshold
      if (distance > MOVE_THRESHOLD) {
        if (!dragging.hasMoved) {
          // First move: cancel long-press and mark as moved
          clearLongPressTimer();
          dragging.hasMoved = true;
        }

        // Only perform drag if long-press didn't fire
        if (!longPressFiredRef.current) {
          e.preventDefault();

          const canvasDx = (e.clientX - dragging.startX) / transform.k;
          const canvasDy = (e.clientY - dragging.startY) / transform.k;
          dragging.startX = e.clientX;
          dragging.startY = e.clientY;

          const setPinned = distance > MOVE_THRESHOLD && !dragging.hasMoved;

          // Move all selected nodes if dragged node is selected
          if (selectedNodeIds.has(dragging.nodeId)) {
            selectedNodeIds.forEach((nodeId) => {
              moveNode(nodeId, canvasDx, canvasDy, setPinned);
            });
          } else {
            moveNode(dragging.nodeId, canvasDx, canvasDy, setPinned);
          }
        }
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      const dragging = draggingRef.current;
      if (!dragging || dragging.pointerId !== e.pointerId) return;

      clearLongPressTimer();

      const isTouch = e.pointerType === "touch" || e.pointerType === "pen";

      // If touch tap (no move, no long-press): select node exclusively
      if (isTouch && !dragging.hasMoved && !longPressFiredRef.current) {
        const isNodeSelected = selectedNodeIds.has(dragging.nodeId);
        if (!isNodeSelected) {
          clearSelection();
          toggleNodeSelection(dragging.nodeId);
        }
      }

      if (dragging.hasMoved) {
        e.preventDefault();
      }
      draggingRef.current = null;
    };

    const handlePointerCancel = (e: PointerEvent) => {
      if (draggingRef.current && draggingRef.current.pointerId === e.pointerId) {
        clearLongPressTimer();
        draggingRef.current = null;
      }
      if (canvasTapRef.current && canvasTapRef.current.pointerId === e.pointerId) {
        clearLongPressTimer();
        canvasTapRef.current = null;
      }
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
    };
  }, [
    transform.k,
    selectedNodeIds,
    moveNode,
    clearSelection,
    toggleNodeSelection,
    clearLongPressTimer,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearLongPressTimer();
    };
  }, [clearLongPressTimer]);

  return {
    handleNodePointerDown,
    handleCanvasPointerDown,
    handleCanvasPointerUp,
  };
}

