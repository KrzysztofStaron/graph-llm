"use client";

import { motion } from "framer-motion";
import {
  GraphNode,
  GraphNodes,
  NodeDimensions,
} from "../../types/GraphCanvas.types";
import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useReducer,
  useImperativeHandle,
  forwardRef,
  createContext,
} from "react";
import { resolveLocalCollisions } from "../../utils/collisionResolver";
import { graphReducer } from "../../interfaces/TreeManager";
import type { TreeManager } from "../../interfaces/TreeManager";
import EdgesRenderer from "./components/EdgesRenderer";
import NodesRenderer from "./components/nodes/NodesRenderer";
import ParticleRenderer from "./components/ParticleRenderer";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import { useNodeParticles } from "./hooks/useNodeParticles";
import { useGraphHistory } from "./hooks/useGraphHistory";
import { useCanvasInteraction } from "./hooks/useCanvasInteraction";

export interface GraphCanvasRef {
  transform: { x: number; y: number; k: number };
  setTransform: (transform: { x: number; y: number; k: number }) => void;
  nodes: GraphNodes;
  nodesRef: React.MutableRefObject<GraphNodes>;
  treeManager: TreeManager;
  handleMouseDown: (e: React.MouseEvent, nodeId?: string) => void;
  nodeDimensions: NodeDimensions;
  nodeDimensionsRef: React.MutableRefObject<NodeDimensions>;
  selectedNodeIds: Set<string>;
  clearSelection: () => void;
}

interface GraphCanvasProps {
  initialNodes: GraphNodes;
  onInputSubmit: (query: string, caller: GraphNode) => void;
  setEditingContextNodeId?: (nodeId: string | null) => void;
  onDropFilesAsContext?: (
    files: FileList,
    canvasPoint: { x: number; y: number }
  ) => void;
  onRequestNodeMove?: (nodeId: string, dx: number, dy: number) => void;
  onRequestContextMenu?: (
    clientX: number,
    clientY: number,
    nodeId?: string
  ) => void;
}

export const CanvasContext = createContext<{
  nodes: GraphNodes;
}>({
  nodes: {},
});

export const GraphCanvas = forwardRef<GraphCanvasRef, GraphCanvasProps>(
  function GraphCanvasInner(props, ref) {
    const {
      initialNodes,
      onInputSubmit,
      setEditingContextNodeId,
      onDropFilesAsContext,
      onRequestNodeMove,
      onRequestContextMenu,
    } = props;

    // Nodes state
    const [nodes, dispatch] = useReducer(graphReducer, initialNodes);
    const nodesRef = useRef(nodes);

    // Node dimensions state
    const [nodeDimensions, setNodeDimensions] = useReducer(
      (prev: NodeDimensions, next: NodeDimensions) => next,
      {}
    );
    const nodeDimensionsRef = useRef<NodeDimensions>({});

    // Selection state
    const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(
      new Set()
    );

    // Selection functions
    const toggleNodeSelection = useCallback((nodeId: string) => {
      setSelectedNodeIds((prev) => {
        const next = new Set(prev);
        if (next.has(nodeId)) {
          next.delete(nodeId);
        } else {
          next.add(nodeId);
        }
        return next;
      });
    }, []);

    const clearSelection = useCallback(() => {
      setSelectedNodeIds(new Set());
    }, []);

    const [localNodeDimensions, setLocalNodeDimensions] =
      useState<NodeDimensions>({});

    // Canvas interaction (zoom, pan, drag/drop, context menu)
    const {
      transform,
      setTransform,
      viewportRef,
      contentRef,
      fitView,
      handleDragOver,
      handleDrop,
      handleContextMenu,
    } = useCanvasInteraction({
      nodes,
      localNodeDimensions,
      onDropFilesAsContext,
      onRequestContextMenu,
    });

    // History management and tree manager
    const { treeManager, undo, isUndoingRef } = useGraphHistory({
      nodes,
      nodesRef,
      dispatch,
    });

    // Dragging state
    const draggingRef = useRef<{
      type: "node";
      nodeId: string;
      hasMoved: boolean;
    } | null>(null);
    const lastMousePos = useRef({ x: 0, y: 0 });

    // Handle mouse down
    const handleMouseDown = useCallback(
      (e: React.MouseEvent, nodeId?: string) => {
        // #region agent log
        console.log("[DEBUG-B] handleMouseDown called", {
          nodeId: nodeId,
          shiftKey: e.shiftKey,
          button: e.button,
          targetTag: (e.target as HTMLElement).tagName,
        });
        // #endregion

        if (!nodeId) {
          // Click on canvas - clear selection if shift not held
          if (!e.shiftKey) {
            clearSelection();
          }
          return; // d3-zoom will handle canvas panning
        }

        // If shift is held, toggle selection instead of starting drag
        if (e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          toggleNodeSelection(nodeId);
          return;
        }

        // Click on node without shift - start dragging
        const isNodeSelected = selectedNodeIds.has(nodeId);
        if (!isNodeSelected) {
          // Node is not selected - clear all selections and drag just this node
          clearSelection();
        }
        // If node is selected, keep the selection and drag all selected nodes

        // IMPORTANT: Prevent event from reaching d3-zoom
        e.preventDefault();
        e.stopPropagation();

        // #region agent log
        console.log("[DEBUG-B] preventDefault called, setting draggingRef", {
          nodeId: nodeId,
          clientX: e.clientX,
          clientY: e.clientY,
        });
        // #endregion

        lastMousePos.current = { x: e.clientX, y: e.clientY };
        draggingRef.current = { type: "node", nodeId, hasMoved: false };
      },
      [clearSelection, toggleNodeSelection, selectedNodeIds]
    );

    // Expose values to parent via ref
    useImperativeHandle(
      ref,
      () => ({
        transform,
        setTransform,
        nodes,
        nodesRef,
        treeManager,
        handleMouseDown,
        nodeDimensions,
        nodeDimensionsRef,
        selectedNodeIds,
        clearSelection,
      }),
      [
        transform,
        setTransform,
        nodes,
        nodesRef,
        treeManager,
        handleMouseDown,
        nodeDimensions,
        nodeDimensionsRef,
        selectedNodeIds,
        clearSelection,
      ]
    );

    // Update refs when state changes
    useEffect(() => {
      nodesRef.current = nodes;
    }, [nodes]);

    useEffect(() => {
      nodeDimensionsRef.current = nodeDimensions;
    }, [nodeDimensions]);

    // Handle mouse move and mouse up for dragging
    useEffect(() => {
      const handleMouseMove = (e: MouseEvent) => {
        if (!draggingRef.current) return;

        // Prevent any default behavior while dragging
        e.preventDefault();

        const dx = (e.clientX - lastMousePos.current.x) / transform.k;
        const dy = (e.clientY - lastMousePos.current.y) / transform.k;
        lastMousePos.current = { x: e.clientX, y: e.clientY };

        if (draggingRef.current.type === "node" && draggingRef.current.nodeId) {
          // On first move, mark as pinned
          const setPinned = !draggingRef.current.hasMoved;
          draggingRef.current.hasMoved = true;

          // If the dragged node is selected, move all selected nodes together
          if (selectedNodeIds.has(draggingRef.current.nodeId)) {
            selectedNodeIds.forEach((nodeId) => {
              treeManager.moveNode(nodeId, dx, dy, setPinned);
            });
          } else {
            // Move only the dragged node
            treeManager.moveNode(draggingRef.current.nodeId, dx, dy, setPinned);
          }
        }
      };

      const handleMouseUp = (e: MouseEvent) => {
        if (draggingRef.current) {
          // Prevent any click events from firing after drag
          e.preventDefault();
        }
        draggingRef.current = null;
      };

      window.addEventListener("mousemove", handleMouseMove, { passive: false });
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }, [treeManager, transform.k, selectedNodeIds]);

    const updateNodeDimension = useCallback(
      (nodeId: string, width: number, height: number) => {
        setLocalNodeDimensions((prev) => {
          const existing = prev[nodeId];
          if (
            existing &&
            existing.width === width &&
            existing.height === height
          ) {
            return prev;
          }
          const updated = { ...prev, [nodeId]: { width, height } };

          // Defer parent state updates and side effects to avoid React warnings
          requestAnimationFrame(() => {
            setNodeDimensions(updated);

            // Skip collision resolution during undo operations to prevent unwanted node movement
            if (isUndoingRef.current) {
              return;
            }

            const node = nodes[nodeId];
            if (node?.type === "response" && existing && onRequestNodeMove) {
              // If width changed, move node left by half of the change
              if (width !== existing.width) {
                const widthChange = width - existing.width;
                const dx = -widthChange / 6;
                onRequestNodeMove(nodeId, dx, 0);
              }

              // If this is a response node that grew, trigger collision resolution
              if (height > existing.height + 5 || width > existing.width + 5) {
                // Run collision resolution multiple times for more aggressive push
                const moves = resolveLocalCollisions(nodeId, nodes, updated);
                for (const move of moves) {
                  onRequestNodeMove(move.nodeId, move.dx, move.dy);
                }
              }
            }
          });

          return updated;
        });
      },
      [onRequestNodeMove, nodes, isUndoingRef]
    );

    // Track node appear/delete particle effects
    const {
      appearingNodes,
      deletingNodes,
      setAppearingNodes,
      setDeletingNodes,
    } = useNodeParticles({
      nodes,
      localNodeDimensions,
      transform,
    });

    // Handle keyboard shortcuts
    useKeyboardShortcuts({
      onFitView: fitView,
      onClearSelection: clearSelection,
      onUndo: undo,
    });

    // Set up ResizeObserver to track all node dimensions
    useEffect(() => {
      const container = contentRef.current;
      if (!container) return;

      const observer = new ResizeObserver((entries) => {
        entries.forEach((entry) => {
          const element = entry.target as HTMLElement;
          const nodeId = element.dataset.nodeId;
          if (nodeId) {
            updateNodeDimension(
              nodeId,
              element.offsetWidth,
              element.offsetHeight
            );
          }
        });
      });

      // Use MutationObserver to detect when nodes are added/removed
      const mutationObserver = new MutationObserver(() => {
        const nodeElements =
          container.querySelectorAll<HTMLElement>("[data-node-id]");
        nodeElements.forEach((element) => {
          observer.observe(element);
        });
      });

      mutationObserver.observe(container, { childList: true, subtree: true });

      // Initial observation of existing nodes
      const nodeElements =
        container.querySelectorAll<HTMLElement>("[data-node-id]");
      nodeElements.forEach((element) => {
        observer.observe(element);
      });

      return () => {
        observer.disconnect();
        mutationObserver.disconnect();
      };
      // contentRef is stable and doesn't need to be in deps
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [updateNodeDimension]);

    return (
      <CanvasContext.Provider value={{ nodes }}>
        <div className="relative w-full h-screen overflow-hidden">
          <motion.div
            ref={viewportRef}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="w-full h-screen overflow-hidden pointer-events-auto cursor-grab active:cursor-grabbing select-none"
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onContextMenu={handleContextMenu}
            onMouseDown={(e) => {
              // Handle canvas clicks for selection clearing
              // Don't handle right-clicks
              if (e.button === 2) return;

              const target = e.target as HTMLElement;
              const closestNode = target.closest("[data-node-id]");

              // Only clear selection if clicking on canvas (not on a node) and shift not held
              if (!closestNode && !e.shiftKey) {
                clearSelection();
              }
            }}
          >
            <div
              ref={contentRef}
              className="relative origin-top-left"
              style={{
                transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})`,
              }}
            >
              {/* SVG inside container so it transforms with nodes - no clipping issues */}
              <EdgesRenderer
                localNodeDimensions={localNodeDimensions}
                appearingNodes={appearingNodes}
              />
              <NodesRenderer
                selectedNodeIds={selectedNodeIds}
                handleMouseDown={handleMouseDown}
                setEditingContextNodeId={setEditingContextNodeId}
                onInputSubmit={onInputSubmit}
                onDeleteNode={(nodeId) => treeManager.deleteNode(nodeId)}
              />
            </div>
          </motion.div>

          <ParticleRenderer
            positions={appearingNodes}
            setPositions={setAppearingNodes}
          />
          <ParticleRenderer
            positions={deletingNodes}
            setPositions={setDeletingNodes}
          />
        </div>
      </CanvasContext.Provider>
    );
  }
);
