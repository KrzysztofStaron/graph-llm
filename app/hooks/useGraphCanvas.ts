import { useState, useRef, useEffect } from "react";
import { GraphNode } from "../types/graph";

export const useGraphCanvas = (initialNodes: GraphNode[]) => {
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });
  const [nodes, setNodes] = useState<GraphNode[]>(initialNodes);

  const draggingRef = useRef<{ type: "canvas" | "node"; nodeId?: string } | null>(null);
  const lastMousePos = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent, nodeId?: string) => {
    e.preventDefault();
    lastMousePos.current = { x: e.clientX, y: e.clientY };

    if (nodeId) {
      draggingRef.current = { type: "node", nodeId };
    } else {
      draggingRef.current = { type: "canvas" };
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;

      const dx = e.clientX - lastMousePos.current.x;
      const dy = e.clientY - lastMousePos.current.y;
      lastMousePos.current = { x: e.clientX, y: e.clientY };

      if (draggingRef.current.type === "canvas") {
        setCanvasOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      } else if (draggingRef.current.type === "node" && draggingRef.current.nodeId) {
        const nodeId = draggingRef.current.nodeId;
        setNodes(prev => prev.map(node => (node.id === nodeId ? { ...node, x: node.x + dx, y: node.y + dy } : node)));
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
  }, []);

  return {
    canvasOffset,
    nodes,
    setNodes,
    handleMouseDown,
  };
};
