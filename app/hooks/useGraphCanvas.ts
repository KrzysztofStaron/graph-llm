import { useReducer, useRef, useEffect, useMemo } from "react";
import type { ContextNode, Edge, GraphNode, GraphNodes, InputNode, NodeType, ResponseNode } from "../types/graph";

type GraphAction =
  | { type: "PATCH_NODE"; id: string; patch: Partial<GraphNode> }
  | { type: "ADD_NODE"; node: GraphNode }
  | { type: "LINK"; fromId: string; toId: string }
  | { type: "MOVE_NODE"; id: string; dx: number; dy: number };

export class TreeManager {
  constructor(private dispatch: (action: GraphAction) => void) {}

  static buildChatML(nodes: GraphNodes, startNode: GraphNode | undefined) {
    if (!startNode) {
      console.warn("buildChatML: startNode is undefined");
      return [];
    }

    const normalizedTree: Record<number, { type: NodeType; value: string; id: string }[]> = {
      0: [],
    };

    const traverse = (currentNode: GraphNode, level: number) => {
      if (!normalizedTree[level]) {
        normalizedTree[level] = [];
      }

      normalizedTree[level].push({ type: currentNode.type, value: currentNode.value, id: currentNode.id });

      currentNode.parentIds.forEach(parentId => {
        const parentNode = nodes[parentId];
        if (parentNode) {
          traverse(parentNode, level + 1);
        } else {
          console.warn(`buildChatML: Parent node ${parentId} not found`);
        }
      });
    };

    traverse(startNode, 0);

    const maxLevel = Math.max(...Object.keys(normalizedTree).map(Number));
    const messages = [];

    for (let level = 0; level <= maxLevel; level++) {
      const mergedNodes = normalizedTree[level].map(node => node.value);
      const roleType = normalizedTree[level][0].type;

      messages.push({
        role: roleType === "context" || roleType === "input" ? "user" : "assistant",
        content: mergedNodes.join("<separatorOfContextualData />"),
      });
    }

    const ret = messages.reverse();

    console.log(ret);

    return ret;
  }

  patchNode(id: string, patch: Partial<GraphNode>): void {
    this.dispatch({ type: "PATCH_NODE", id, patch });
  }

  addNode(node: GraphNode): void {
    this.dispatch({ type: "ADD_NODE", node });
  }

  linkNodes(fromId: string, toId: string): void {
    this.dispatch({ type: "LINK", fromId, toId });
  }

  moveNode(id: string, dx: number, dy: number): void {
    this.dispatch({ type: "MOVE_NODE", id, dx, dy });
  }
}

function graphReducer(nodes: GraphNodes, action: GraphAction): GraphNodes {
  switch (action.type) {
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
          parentIds: toNode.parentIds.includes(action.fromId) ? toNode.parentIds : [...toNode.parentIds, action.fromId],
        },
      };
    }
    case "MOVE_NODE": {
      const node = nodes[action.id];
      if (!node) return nodes;
      return { ...nodes, [action.id]: { ...node, x: node.x + action.dx, y: node.y + action.dy } };
    }
  }
}

export const createEdge = (from: string, to: string) => {
  const edge: Edge = { from, to };
  return edge;
};

export function createNode(type: "input", x: number, y: number): InputNode;
export function createNode(type: "response", x: number, y: number): ResponseNode;
export function createNode(type: "context", x: number, y: number): ContextNode;
export function createNode(type: NodeType, x: number, y: number): GraphNode {
  const id = crypto.randomUUID();

  switch (type) {
    case "input":
      return { id, type: "input", x, y, value: "", parentIds: [], childrenIds: [] };
    case "response":
      return { id, type: "response", x, y, value: "", parentIds: [], childrenIds: [] };
    case "context":
      return { id, type: "context", x, y, value: "", parentIds: [], childrenIds: [] };
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

export const useGraphCanvas = (initialNodes: GraphNodes) => {
  const [transform, setTransform] = useReducer(
    (prev: { x: number; y: number; k: number }, next: { x: number; y: number; k: number }) => next,
    { x: 0, y: 0, k: 1 }
  );
  const [nodes, dispatch] = useReducer(graphReducer, initialNodes);
  const nodesRef = useRef(nodes);

  const draggingRef = useRef<{ type: "node"; nodeId: string } | null>(null);
  const lastMousePos = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent, nodeId?: string) => {
    if (!nodeId) return; // d3-zoom will handle canvas panning

    e.preventDefault();
    lastMousePos.current = { x: e.clientX, y: e.clientY };
    draggingRef.current = { type: "node", nodeId };
  };

  const treeManager = useMemo(() => new TreeManager(dispatch), [dispatch]);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;

      const dx = (e.clientX - lastMousePos.current.x) / transform.k;
      const dy = (e.clientY - lastMousePos.current.y) / transform.k;
      lastMousePos.current = { x: e.clientX, y: e.clientY };

      if (draggingRef.current.type === "node" && draggingRef.current.nodeId) {
        treeManager.moveNode(draggingRef.current.nodeId, dx, dy);
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
  }, [treeManager, transform.k]);

  return {
    transform,
    setTransform,
    nodes,
    nodesRef,
    treeManager,
    handleMouseDown,
  };
};
