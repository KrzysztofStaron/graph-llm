"use client";

import { motion, useReducedMotion } from "framer-motion";
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
import { usePointerGestures } from "./hooks/usePointerGestures";
import { getDefaultNodeDimensions } from "../../utils/placement";

export interface GraphCanvasRef {
  transform: { x: number; y: number; k: number };
  setTransform: (transform: { x: number; y: number; k: number }) => void;
  nodes: GraphNodes;
  nodesRef: React.MutableRefObject<GraphNodes>;
  treeManager: TreeManager;
  handleNodePointerDown: (e: React.PointerEvent, nodeId: string) => void;
  nodeDimensions: NodeDimensions;
  nodeDimensionsRef: React.MutableRefObject<NodeDimensions>;
  selectedNodeIds: Set<string>;
  clearSelection: () => void;
}

interface GraphCanvasProps {
  initialNodes: GraphNodes;
  initialTransform?: { x: number; y: number; k: number };
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
  onNodeDragToStorage?: (nodeId: string, clientX: number, clientY: number) => void;
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
      initialTransform,
      onInputSubmit,
      setEditingContextNodeId,
      onDropFilesAsContext,
      onRequestNodeMove,
      onRequestContextMenu,
      onNodeDragToStorage,
    } = props;
    const shouldReduceMotion = useReducedMotion();

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
      panCanvas,
      handleDragOver,
      handleDrop,
      handleContextMenu,
    } = useCanvasInteraction({
      nodes,
      localNodeDimensions,
      initialTransform,
      onDropFilesAsContext,
      onRequestContextMenu,
      onCanvasClick: clearSelection,
    });

    // History management and tree manager
    const { treeManager, undo, isUndoingRef } = useGraphHistory({
      nodes,
      nodesRef,
      dispatch,
    });

    // Pointer gestures (drag + mobile selection + long-press)
    const { handleNodePointerDown, handleCanvasPointerDown, handleCanvasPointerUp } =
      usePointerGestures({
        transform,
        selectedNodeIds,
        toggleNodeSelection,
        clearSelection,
        moveNode: (nodeId, dx, dy, setPinned) => {
          treeManager.moveNode(nodeId, dx, dy, setPinned);
        },
        onRequestContextMenu,
        onNodeDragToStorage,
      });

    // Expose values to parent via ref
    useImperativeHandle(
      ref,
      () => ({
        transform,
        setTransform,
        nodes,
        nodesRef,
        treeManager,
        handleNodePointerDown,
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
        handleNodePointerDown,
        nodeDimensions,
        nodeDimensionsRef,
        selectedNodeIds,
        clearSelection,
      ]
    );

    // Update refs when state changes
    useEffect(() => {
      nodesRef.current = nodes;
      if (Object.keys(nodes).length > 0) {
        localStorage.setItem("graph-nodes", JSON.stringify(nodes));
      } else {
        localStorage.removeItem("graph-nodes");
      }
    }, [nodes]);

    useEffect(() => {
      nodeDimensionsRef.current = nodeDimensions;
    }, [nodeDimensions]);

    // Center the starting input node on initial load
    const hasCenteredInitialNodeRef = useRef(false);
    useEffect(() => {
      if (hasCenteredInitialNodeRef.current) return;
      
      const initialInputNode = nodes["input-1"];
      if (!initialInputNode || initialInputNode.type !== "input") return;
      
      // Only center if the node is still at the initial position (0, 0)
      if (initialInputNode.x !== 0 || initialInputNode.y !== 0) {
        hasCenteredInitialNodeRef.current = true;
        return;
      }

      const viewport = viewportRef.current;
      if (!viewport) return;

      // Wait for viewport to be ready
      const centerNode = () => {
        const viewportWidth = viewport.clientWidth || window.innerWidth;
        const viewportHeight = viewport.clientHeight || window.innerHeight;
        
        const nodeDim = getDefaultNodeDimensions("input");
        
        const centerX = -nodeDim.width / 2;
        const centerY = -nodeDim.height / 2;
        
        treeManager.moveNode("input-1", centerX - initialInputNode.x, centerY - initialInputNode.y, true);
        
        const tx = viewportWidth / 2;
        const ty = viewportHeight / 2;
        
        setTransform({ x: tx, y: ty, k: 1 });
        
        hasCenteredInitialNodeRef.current = true;
      };

      // Use requestAnimationFrame to ensure viewport is ready
      requestAnimationFrame(() => {
        requestAnimationFrame(centerNode);
      });
    }, [nodes, treeManager, setTransform]);

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
      onPanCanvas: panCanvas,
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
        <div className="relative w-full h-dvh overflow-hidden">
          <motion.div
            ref={viewportRef}
            data-viewport
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
            className="w-full h-dvh overflow-hidden pointer-events-auto cursor-grab active:cursor-grabbing select-none"
            style={{ touchAction: "none" }}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onContextMenu={handleContextMenu}
            onPointerDown={(e) => {
              const target = e.target as HTMLElement;
              const closestNode = target.closest("[data-node-id]");
              
              // Only handle canvas pointer events (not on nodes)
              if (!closestNode) {
                handleCanvasPointerDown(e);
              }
            }}
            onPointerUp={(e) => {
              const target = e.target as HTMLElement;
              const closestNode = target.closest("[data-node-id]");
              
              // Only handle canvas pointer events (not on nodes)
              if (!closestNode) {
                handleCanvasPointerUp(e);
              }
            }}
            onMouseDown={(e) => {
              // Handle canvas clicks for selection clearing (desktop only)
              // Don't handle right-clicks
              if (e.button === 2) return;

              const target = e.target as HTMLElement;
              
              // Check if we clicked on or inside a node
              const closestNode = target.closest("[data-node-id]");

              // Clear selection if not clicking on a node and shift not held
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
                handleNodePointerDown={handleNodePointerDown}
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
