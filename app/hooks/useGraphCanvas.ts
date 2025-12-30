import {
  useReducer,
  useRef,
  useEffect,
  useMemo,
  useState,
  useCallback,
} from "react";
import type {
  ContextNode,
  Edge,
  GraphNode,
  GraphNodes,
  ImageContextNode,
  InputNode,
  NodeType,
  ResponseNode,
} from "../types/graph";
import { TreeManager, type GraphAction } from "../interfaces/TreeManager";

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

export const createEdge = (from: string, to: string) => {
  const edge: Edge = { from, to };
  return edge;
};

export function createNode(type: "input", x: number, y: number): InputNode;
export function createNode(
  type: "response",
  x: number,
  y: number
): ResponseNode;
export function createNode(type: "context", x: number, y: number): ContextNode;
export function createNode(
  type: "image-context",
  x: number,
  y: number
): ImageContextNode;

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

export type NodeDimensions = Record<string, { width: number; height: number }>;

export const useGraphCanvas = (initialNodes: GraphNodes) => {
  const [transform, setTransform] = useReducer(
    (
      prev: { x: number; y: number; k: number },
      next: { x: number; y: number; k: number }
    ) => next,
    { x: 0, y: 0, k: 1 }
  );
  const [nodes, dispatch] = useReducer(graphReducer, initialNodes);
  const nodesRef = useRef(nodes);

  // History state: track last 3 node snapshots
  const [history, setHistory] = useState<GraphNodes[]>([]);
  const historyRef = useRef(history);
  const isUndoingRef = useRef(false);
  const shouldSaveHistoryAfterUpdateRef = useRef(false);
  const skipNextHistorySavesRef = useRef(0); // Counter for how many actions to skip history for
  const [nodeDimensions, setNodeDimensions] = useReducer(
    (prev: NodeDimensions, next: NodeDimensions) => next,
    {}
  );
  const nodeDimensionsRef = useRef<NodeDimensions>({});

  const draggingRef = useRef<{
    type: "node";
    nodeId: string;
    hasMoved: boolean;
  } | null>(null);
  const lastMousePos = useRef({ x: 0, y: 0 });

  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(
    new Set()
  );

  const selectNode = (nodeId: string) => {
    setSelectedNodeIds((prev) => new Set(prev).add(nodeId));
  };

  const deselectNode = (nodeId: string) => {
    setSelectedNodeIds((prev) => {
      const next = new Set(prev);
      next.delete(nodeId);
      return next;
    });
  };

  const toggleNodeSelection = (nodeId: string) => {
    setSelectedNodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedNodeIds(new Set());
  };

  const handleMouseDown = (e: React.MouseEvent, nodeId?: string) => {
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
  };

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

  // Note: dispatchWithHistory is a useCallback that accesses refs, but only when called (not during render)
  // This is safe because refs are only read in response to user actions, not during render
  const treeManager = useMemo(
    () => new TreeManager(dispatchWithHistory),
    [dispatchWithHistory]
  );

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

  return {
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
    selectNode,
    deselectNode,
    toggleNodeSelection,
    clearSelection,
    undo,
  };
};
