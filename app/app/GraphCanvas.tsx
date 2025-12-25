import { motion } from "framer-motion";
import { InputFieldNode, ResponseNode, ContextNode } from "./nodes";
import { GraphNode, GraphNodes } from "../types/graph";
import { useEffect, useRef, useState, useCallback } from "react";

interface GraphCanvasProps {
  nodes: GraphNodes;
  canvasOffset: { x: number; y: number };
  onMouseDown: (e: React.MouseEvent, nodeId?: string) => void;
  onInputSubmit: (query: string, caller: GraphNode) => void;
  onAddNodeFromResponse: (responseNode: GraphNode, position: "left" | "right") => void;
}

type NodeDimensions = Record<string, { width: number; height: number }>;

const getNodeCenter = (node: GraphNode, dimensions: NodeDimensions) => {
  const dim = dimensions[node.id];
  const width = dim?.width ?? (node.type === "context" ? 96 : 400);
  const height = dim?.height ?? (node.type === "context" ? 96 : node.type === "input" ? 120 : 80);

  return {
    x: node.x + width / 2,
    y: node.y + height / 2,
  };
};

export const GraphCanvas = ({
  nodes,
  canvasOffset,
  onMouseDown,
  onInputSubmit,
  onAddNodeFromResponse,
}: GraphCanvasProps) => {
  const nodeArray = Object.values(nodes);
  const edges = nodeArray.flatMap(node => node.childrenIds.map(to => ({ from: node.id, to })));

  const containerRef = useRef<HTMLDivElement>(null);
  const [nodeDimensions, setNodeDimensions] = useState<NodeDimensions>({});

  const updateNodeDimension = useCallback((nodeId: string, width: number, height: number) => {
    setNodeDimensions(prev => {
      const existing = prev[nodeId];
      if (existing && existing.width === width && existing.height === height) {
        return prev;
      }
      return { ...prev, [nodeId]: { width, height } };
    });
  }, []);

  // Set up ResizeObserver to track all node dimensions
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(entries => {
      entries.forEach(entry => {
        const element = entry.target as HTMLElement;
        const nodeId = element.dataset.nodeId;
        if (nodeId) {
          updateNodeDimension(nodeId, element.offsetWidth, element.offsetHeight);
        }
      });
    });

    // Use MutationObserver to detect when nodes are added/removed
    const mutationObserver = new MutationObserver(() => {
      const nodeElements = container.querySelectorAll<HTMLElement>("[data-node-id]");
      nodeElements.forEach(element => {
        observer.observe(element);
      });
    });

    mutationObserver.observe(container, { childList: true, subtree: true });

    // Initial observation of existing nodes
    const nodeElements = container.querySelectorAll<HTMLElement>("[data-node-id]");
    nodeElements.forEach(element => {
      observer.observe(element);
    });

    return () => {
      observer.disconnect();
      mutationObserver.disconnect();
    };
  }, [updateNodeDimension]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="w-full h-screen overflow-hidden pointer-events-auto cursor-grab active:cursor-grabbing select-none"
      onMouseDown={e => onMouseDown(e)}
    >
      <div
        ref={containerRef}
        className="relative"
        style={{
          transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px)`,
        }}
      >
        {/* SVG inside container so it transforms with nodes - no clipping issues */}
        <svg
          className="absolute pointer-events-none"
          style={{
            overflow: "visible",
            left: 0,
            top: 0,
            width: 1,
            height: 1,
          }}
        >
          {edges.map(edge => {
            const fromNode = nodes[edge.from];
            const toNode = nodes[edge.to];
            if (!fromNode || !toNode) return null;
            const from = getNodeCenter(fromNode, nodeDimensions);
            const to = getNodeCenter(toNode, nodeDimensions);
            return (
              <line
                key={`${edge.from}-${edge.to}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke="rgba(255, 255, 255, 0.2)"
                strokeWidth={2}
              />
            );
          })}
        </svg>

        {nodeArray.map(node => (
          <div
            key={node.id}
            className="absolute cursor-move"
            data-node-id={node.id}
            style={{ left: node.x, top: node.y }}
            onMouseDown={e => {
              e.stopPropagation();
              onMouseDown(e, node.id);
            }}
          >
            {node.type === "input" && (
              <InputFieldNode node={node} onInputSubmit={query => onInputSubmit(query, node)} />
            )}
            {node.type === "response" && (
              <ResponseNode node={node} onAddNode={position => onAddNodeFromResponse(node, position)} />
            )}
            {node.type === "context" && <ContextNode node={node} />}
          </div>
        ))}
      </div>
    </motion.div>
  );
};
