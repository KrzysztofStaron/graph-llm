"use client";

import { motion } from "framer-motion";
import {
  GraphNode,
  GraphNodes,
  NodeDimensions,
  Vector2,
  NodeType,
  ContextNode as ContextNodeType,
  DocumentNode as DocumentNodeType,
  ImageContextNode as ImageContextNodeType,
  InputNode,
  ResponseNode as ResponseNodeType,
} from "../types/graph";
import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useReducer,
  useMemo,
  useImperativeHandle,
  forwardRef,
} from "react";
import * as d3 from "d3";
import { ParticleEffect } from "../components/ui/ParticleEffect";
import { resolveLocalCollisions } from "../utils/collisionResolver";
import { TreeManager, type GraphAction } from "../interfaces/TreeManager";
import EdgesRenderer from "../components/GraphCanvas/EdgesRenderer";
import NodesRenderer from "../components/GraphCanvas/NodesRenderer";

// Deep copy function for GraphNodes
const deepCopyNodes = (nodes: GraphNodes): GraphNodes => {
  const copy: GraphNodes = {};
  for (const [id, node] of Object.entries(nodes)) {
    copy[id] = {
      ...node,
      parentIds: [...node.parentIds],
      childrenIds: [...node.childrenIds],
    };
  }
  return copy;
};

function graphReducer(nodes: GraphNodes, action: GraphAction): GraphNodes {
  switch (action.type) {
    case "RESTORE_NODES": {
      return deepCopyNodes(action.nodes);
    }
    case "PATCH_NODE": {
      const node = nodes[action.id];
      if (!node) return nodes;
      return { ...nodes, [action.id]: { ...node, ...action.patch } };
    }
    case "ADD_NODE": {
      return { ...nodes, [action.node.id]: action.node };
    }
    case "LINK": {
      const fromNode = nodes[action.fromId];
      const toNode = nodes[action.toId];
      if (!fromNode || !toNode) return nodes;

      return {
        ...nodes,
        [action.fromId]: {
          ...fromNode,
          childrenIds: fromNode.childrenIds.includes(action.toId)
            ? fromNode.childrenIds
            : [...fromNode.childrenIds, action.toId],
        },
        [action.toId]: {
          ...toNode,
          parentIds: toNode.parentIds.includes(action.fromId)
            ? toNode.parentIds
            : [...toNode.parentIds, action.fromId],
        },
      };
    }
    case "MOVE_NODE": {
      const node = nodes[action.id];
      if (!node) return nodes;
      const updated: GraphNode = {
        ...node,
        x: node.x + action.dx,
        y: node.y + action.dy,
      };
      if (action.setPinned !== undefined) {
        updated.pinned = action.setPinned;
      }
      return {
        ...nodes,
        [action.id]: updated,
      };
    }
    case "DELETE_CASCADE": {
      const startNode = nodes[action.id];
      if (!startNode) return nodes;

      // DFS to collect nodes to delete
      // Rule: stop (and keep) a branch when we hit a node with >1 parent
      const toDelete = new Set<string>();
      const stack: string[] = [action.id];

      while (stack.length > 0) {
        const nodeId = stack.pop()!;

        // Skip if already processed
        if (toDelete.has(nodeId)) continue;

        const node = nodes[nodeId];
        if (!node) continue;

        // For non-start nodes, check if this node has a parent outside the deletion set
        if (nodeId !== action.id) {
          // If node has >1 parent, stop here (keep this node and its descendants)
          if (node.parentIds.length > 1) continue;

          // If node has any parent not in toDelete, it still has a valid parent - keep it
          const hasParentOutsideDeleteSet = node.parentIds.some(
            (parentId) => !toDelete.has(parentId)
          );
          if (hasParentOutsideDeleteSet) continue;
        }

        // Mark for deletion
        toDelete.add(nodeId);

        // Add children to stack for DFS traversal
        for (const childId of node.childrenIds) {
          if (!toDelete.has(childId)) {
            stack.push(childId);
          }
        }
      }

      // Build the updated nodes object
      const updatedNodes: GraphNodes = {};

      for (const [nodeId, node] of Object.entries(nodes)) {
        // Skip nodes that are being deleted
        if (toDelete.has(nodeId)) continue;

        // Filter out deleted nodes from parentIds and childrenIds
        updatedNodes[nodeId] = {
          ...node,
          parentIds: node.parentIds.filter((id) => !toDelete.has(id)),
          childrenIds: node.childrenIds.filter((id) => !toDelete.has(id)),
        };
      }

      return updatedNodes;
    }
    case "DELETE_NODE_DETACH": {
      const nodeToDelete = nodes[action.id];
      if (!nodeToDelete) return nodes;

      // Build updated nodes object
      const updatedNodes: GraphNodes = {};

      for (const [nodeId, node] of Object.entries(nodes)) {
        // Skip the node being deleted
        if (nodeId === action.id) continue;

        // Remove the deleted node from parentIds and childrenIds
        updatedNodes[nodeId] = {
          ...node,
          parentIds: node.parentIds.filter(
            (parentId) => parentId !== action.id
          ),
          childrenIds: node.childrenIds.filter(
            (childId) => childId !== action.id
          ),
        };
      }

      return updatedNodes;
    }
  }
}

export function createNode(type: "input", x: number, y: number): InputNode;
export function createNode(
  type: "response",
  x: number,
  y: number
): ResponseNodeType;
export function createNode(
  type: "context",
  x: number,
  y: number
): ContextNodeType;
export function createNode(
  type: "image-context",
  x: number,
  y: number
): ImageContextNodeType;
export function createNode(
  type: "document",
  x: number,
  y: number
): DocumentNodeType;

export function createNode(type: NodeType, x: number, y: number): GraphNode {
  const id = crypto.randomUUID();

  return {
    id,
    type,
    x,
    y,
    value: "",
    parentIds: [],
    childrenIds: [],
  };
}

export interface GraphCanvasRef {
  transform: { x: number; y: number; k: number };
  setTransform: (transform: { x: number; y: number; k: number }) => void;
  nodes: GraphNodes;
  nodesRef: React.MutableRefObject<GraphNodes>;
  treeManager: TreeManager;
  handleMouseDown: (e: React.MouseEvent, nodeId?: string) => void;
  nodeDimensions: NodeDimensions;
  setNodeDimensions: (dimensions: NodeDimensions) => void;
  nodeDimensionsRef: React.MutableRefObject<NodeDimensions>;
  selectedNodeIds: Set<string>;
  clearSelection: () => void;
}

interface GraphCanvasProps {
  initialNodes: GraphNodes;
  onInputSubmit: (query: string, caller: GraphNode) => void;
  onDeleteNode: (nodeId: string) => void;
  onContextNodeDoubleClick?: (nodeId: string) => void;
  onDropFilesAsContext?: (
    files: FileList,
    canvasPoint: { x: number; y: number }
  ) => void;
  onNodeDimensionsChange?: (dimensions: NodeDimensions) => void;
  onRequestNodeMove?: (nodeId: string, dx: number, dy: number) => void;
  onRequestContextMenu?: (
    clientX: number,
    clientY: number,
    nodeId?: string
  ) => void;
}

export const GraphCanvas = forwardRef<GraphCanvasRef, GraphCanvasProps>(
  function GraphCanvasInner(props, ref) {
    const {
      initialNodes,
      onInputSubmit,
      onDeleteNode,
      onContextNodeDoubleClick,
      onDropFilesAsContext,
      onNodeDimensionsChange,
      onRequestNodeMove,
      onRequestContextMenu,
    } = props;

    // Transform state
    const [transform, setTransform] = useReducer(
      (
        prev: { x: number; y: number; k: number },
        next: { x: number; y: number; k: number }
      ) => next,
      { x: 0, y: 0, k: 1 }
    );

    // Nodes state
    const [nodes, dispatch] = useReducer(graphReducer, initialNodes);
    const nodesRef = useRef(nodes);

    // History state: track last 3 node snapshots
    const [history, setHistory] = useState<GraphNodes[]>([]);
    const historyRef = useRef(history);
    const isUndoingRef = useRef(false);
    const shouldSaveHistoryAfterUpdateRef = useRef(false);
    const skipNextHistorySavesRef = useRef(0);

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

    // Dragging state
    const draggingRef = useRef<{
      type: "node";
      nodeId: string;
      hasMoved: boolean;
    } | null>(null);
    const lastMousePos = useRef({ x: 0, y: 0 });

    // Wrapped dispatch that captures history before applying actions
    const dispatchWithHistory = useCallback(
      (action: GraphAction) => {
        // Skip history capture if we're restoring state (undo operation)
        if (action.type === "RESTORE_NODES" || isUndoingRef.current) {
          dispatch(action);
          return;
        }

        // For input node value patches (submissions), save history AFTER the patch
        // This ensures the submitted value is preserved in history, not the empty state
        if (action.type === "PATCH_NODE" && action.patch.value !== undefined) {
          const node = nodesRef.current[action.id];
          if (
            node &&
            node.type === "input" &&
            node.value === "" &&
            action.patch.value !== ""
          ) {
            // This is an input submission - apply the patch first, then save history after state updates
            // Also skip history for the next few actions (ADD_NODE, LINK) that typically follow submission
            shouldSaveHistoryAfterUpdateRef.current = true;
            skipNextHistorySavesRef.current = 3; // Skip next 3 actions (typically ADD_NODE, LINK, and maybe another)
            dispatch(action);
            return;
          }
        }

        // Skip history for actions that follow input submission
        if (skipNextHistorySavesRef.current > 0) {
          skipNextHistorySavesRef.current--;
          dispatch(action);
          return;
        }

        const currentNodes = nodesRef.current;
        const currentHistory = historyRef.current;
        // Save current state to history before applying action
        const snapshot = deepCopyNodes(currentNodes);
        const newHistory = [...currentHistory, snapshot];

        // Limit history to 3 steps (remove oldest when adding 4th)
        const trimmedHistory = newHistory.slice(-3);

        setHistory(trimmedHistory);
        historyRef.current = trimmedHistory;

        // Apply the action
        dispatch(action);
      },
      [dispatch]
    );

    // TreeManager
    const treeManager = useMemo(
      () => new TreeManager(dispatchWithHistory),
      [dispatchWithHistory]
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

    // Handle mouse down
    const handleMouseDown = useCallback(
      (e: React.MouseEvent, nodeId?: string) => {
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

        // Click on node without shift
        const isNodeSelected = selectedNodeIds.has(nodeId);
        if (!isNodeSelected) {
          // Node is not selected - clear all selections and drag just this node
          clearSelection();
        }
        // If node is selected, keep the selection and drag all selected nodes
        e.preventDefault();
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
        setNodeDimensions,
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
        setNodeDimensions,
        nodeDimensionsRef,
        selectedNodeIds,
        clearSelection,
      ]
    );

    // Update refs when state changes
    useEffect(() => {
      nodesRef.current = nodes;

      // If we need to save history after an update (e.g., input submission),
      // do it now that the state has been updated
      if (shouldSaveHistoryAfterUpdateRef.current) {
        shouldSaveHistoryAfterUpdateRef.current = false;
        const currentNodes = nodesRef.current;
        const currentHistory = historyRef.current;

        // Save current state to history
        const snapshot = deepCopyNodes(currentNodes);
        const newHistory = [...currentHistory, snapshot];

        // Limit history to 3 steps (remove oldest when adding 4th)
        const trimmedHistory = newHistory.slice(-3);

        setHistory(trimmedHistory);
        historyRef.current = trimmedHistory;
      }
    }, [nodes]);

    useEffect(() => {
      nodeDimensionsRef.current = nodeDimensions;
    }, [nodeDimensions]);

    useEffect(() => {
      historyRef.current = history;
    }, [history]);

    // Undo function: restore previous state from history
    const undo = useCallback(() => {
      if (history.length === 0) return;

      const previousState = history[history.length - 1];
      const newHistory = history.slice(0, -1);

      // Set flag to skip history capture
      isUndoingRef.current = true;

      // Restore the previous state
      setHistory(newHistory);
      historyRef.current = newHistory;

      // Restore nodes using RESTORE_NODES action
      dispatchWithHistory({ type: "RESTORE_NODES", nodes: previousState });

      // Reset flag
      isUndoingRef.current = false;
    }, [history, dispatchWithHistory]);

    // Handle mouse move and mouse up for dragging
    useEffect(() => {
      const handleMouseMove = (e: MouseEvent) => {
        if (!draggingRef.current) return;

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

      const handleMouseUp = () => {
        draggingRef.current = null;
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }, [treeManager, transform.k, selectedNodeIds]);

    const nodeArray = Object.values(nodes);

    const viewportRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const [localNodeDimensions, setLocalNodeDimensions] =
      useState<NodeDimensions>({});

    const [appearingNodes, setAppearingNodes] = useState<
      Record<string, Vector2>
    >({});

    const [deletingNodes, setDeletingNodes] = useState<Record<string, Vector2>>(
      {}
    );

    const nodesSnapshotRef = useRef<GraphNodes>(nodes);
    const hasMountedRef = useRef<boolean>(false);
    const zoomBehaviorRef = useRef<d3.ZoomBehavior<
      HTMLDivElement,
      unknown
    > | null>(null);

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
            // Notify parent of dimension changes
            onNodeDimensionsChange?.(updated);
            setNodeDimensions(updated);

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
      [onNodeDimensionsChange, onRequestNodeMove, nodes]
    );

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
          const dim = localNodeDimensions[node.id] || {
            width:
              node.type === "context"
                ? 176
                : node.type === "image-context"
                ? 464
                : 400,
            height:
              node.type === "context"
                ? 96
                : node.type === "image-context"
                ? 384
                : node.type === "input"
                ? 120
                : 80,
          };
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
          clearSelection();
        }
      };

      // Use capture phase to fire before d3-zoom
      viewport.addEventListener("mousedown", handleCanvasMouseDown, true);

      return () => {
        viewport.removeEventListener("mousedown", handleCanvasMouseDown, true);
      };
    }, [clearSelection]);

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

    // Handle keyboard shortcuts
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        // Skip if typing in input/textarea
        if (
          e.target instanceof HTMLTextAreaElement ||
          e.target instanceof HTMLInputElement
        ) {
          return;
        }

        if (e.key === "f") {
          fitView();
        }
        if (e.key === "Escape") {
          clearSelection();
        }
        // Handle Ctrl+Z (or Cmd+Z on Mac) for undo
        if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
          e.preventDefault();
          undo();
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [fitView, clearSelection, undo]);

    // Track node appear/delete to show particle effects
    useEffect(() => {
      const currentNodeIds = new Set(Object.keys(nodes));
      const previousNodes = nodesSnapshotRef.current;

      // Skip particles on the very first render
      if (hasMountedRef.current === false) {
        hasMountedRef.current = true;
        nodesSnapshotRef.current = nodes;
        return;
      }

      // Find newly added nodes
      Object.keys(nodes).forEach((nodeId) => {
        if (previousNodes[nodeId]) return;

        const addedNode = nodes[nodeId];
        const dim = localNodeDimensions[nodeId] || {
          width:
            addedNode.type === "context"
              ? 176
              : addedNode.type === "image-context"
              ? 464
              : addedNode.type === "input"
              ? 400
              : 200,
          height:
            addedNode.type === "context"
              ? 96
              : addedNode.type === "image-context"
              ? 384
              : addedNode.type === "input"
              ? 120
              : 80,
        };

        const center = {
          x: addedNode.x + dim.width / 2,
          y: addedNode.y + dim.height / 2,
        };

        const screenX = center.x * transform.k + transform.x;
        const screenY = center.y * transform.k + transform.y;

        setAppearingNodes((prev) => ({
          ...prev,
          [nodeId]: { x: screenX, y: screenY },
        }));

        setTimeout(() => {
          setAppearingNodes((prev) => {
            const next = { ...prev };
            delete next[nodeId];
            return next;
          });
        }, 200);
      });

      // Find deleted nodes
      Object.keys(previousNodes).forEach((nodeId) => {
        if (!currentNodeIds.has(nodeId)) {
          // Node was deleted, get its center position from the snapshot
          const deletedNode = previousNodes[nodeId];
          if (deletedNode) {
            const dim = localNodeDimensions[nodeId] || {
              width:
                deletedNode.type === "context"
                  ? 176
                  : deletedNode.type === "image-context"
                  ? 464
                  : deletedNode.type === "input"
                  ? 400
                  : 200,
              height:
                deletedNode.type === "context"
                  ? 96
                  : deletedNode.type === "image-context"
                  ? 384
                  : deletedNode.type === "input"
                  ? 120
                  : 80,
            };
            const center = {
              x: deletedNode.x + dim.width / 2,
              y: deletedNode.y + dim.height / 2,
            };

            // Apply transform to get screen coordinates
            const screenX = center.x * transform.k + transform.x;
            const screenY = center.y * transform.k + transform.y;

            setDeletingNodes((prev) => ({
              ...prev,
              [nodeId]: { x: screenX, y: screenY },
            }));

            // Remove after animation completes
            setTimeout(() => {
              setDeletingNodes((prev) => {
                const next = { ...prev };
                delete next[nodeId];
                return next;
              });
            }, 200);
          }
        }
      });

      // Update snapshot
      nodesSnapshotRef.current = nodes;
    }, [nodes, localNodeDimensions, transform]);

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
    }, [updateNodeDimension]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    }, []);

    const handleDrop = useCallback(
      (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (!onDropFilesAsContext || !e.dataTransfer.files.length) return;

        // Convert screen coordinates to canvas coordinates
        const canvasX = (e.clientX - transform.x) / transform.k;
        const canvasY = (e.clientY - transform.y) / transform.k;

        onDropFilesAsContext(e.dataTransfer.files, { x: canvasX, y: canvasY });
      },
      [onDropFilesAsContext, transform]
    );

    const handleContextMenu = useCallback(
      (e: React.MouseEvent) => {
        if (!onRequestContextMenu) return;

        e.preventDefault();
        e.stopPropagation();

        // Check if click was on a node
        const nodeElement = (e.target as HTMLElement).closest(
          "[data-node-id]"
        ) as HTMLElement | null;
        const nodeId = nodeElement?.dataset.nodeId;

        onRequestContextMenu(e.clientX, e.clientY, nodeId);
      },
      [onRequestContextMenu]
    );

    return (
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
            // Don't handle right-clicks
            if (e.button === 2) return;

            // Only handle if clicking directly on the viewport (not on a node)
            const target = e.target as HTMLElement;
            const closestNode = target.closest(
              "[data-node-id]"
            ) as HTMLElement | null;
            if (!closestNode) {
              handleMouseDown(e);
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
              nodes={nodes}
              localNodeDimensions={localNodeDimensions}
              appearingNodes={appearingNodes}
            />
            <NodesRenderer
              nodes={nodes}
              selectedNodeIds={selectedNodeIds}
              handleMouseDown={handleMouseDown}
              onContextNodeDoubleClick={onContextNodeDoubleClick}
              onInputSubmit={onInputSubmit}
              onDeleteNode={onDeleteNode}
            />
          </div>
        </motion.div>

        {/* Particle effects for appearing nodes - outside transform container */}
        {appearingNodes &&
          Object.entries(appearingNodes).map(([nodeId, position]) => (
            <ParticleEffect
              key={nodeId}
              x={position.x}
              y={position.y}
              onComplete={() => {
                setAppearingNodes((prev) => {
                  const next = { ...prev };
                  delete next[nodeId];
                  return next;
                });
              }}
            />
          ))}

        {/* Particle effects for deleted nodes - outside transform container */}
        {deletingNodes &&
          Object.entries(deletingNodes).map(([nodeId, position]) => (
            <ParticleEffect
              key={nodeId}
              x={position.x}
              y={position.y}
              onComplete={() => {
                setDeletingNodes((prev) => {
                  const next = { ...prev };
                  delete next[nodeId];
                  return next;
                });
              }}
            />
          ))}
      </div>
    );
  }
);
