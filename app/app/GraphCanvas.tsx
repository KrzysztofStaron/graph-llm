import { motion } from "framer-motion";
import { InputFieldNode, ResponseNode, ContextNode } from "./nodes";
import { GraphNode, Edge } from "../types/graph";

interface GraphCanvasProps {
  nodes: GraphNode[];
  edges: Edge[];
  canvasOffset: { x: number; y: number };
  onMouseDown: (e: React.MouseEvent, nodeId?: string) => void;
}

const getNodeCenter = (node: GraphNode) => {
  const width = node.type === "context" ? 96 : 400;
  const height = node.type === "context" ? 96 : node.type === "input" ? 120 : 80;
  return {
    x: node.x + width / 2,
    y: node.y + height / 2,
  };
};

export const GraphCanvas = ({ nodes, edges, canvasOffset, onMouseDown }: GraphCanvasProps) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="w-full h-screen overflow-hidden pointer-events-auto cursor-grab active:cursor-grabbing select-none"
      onMouseDown={e => onMouseDown(e)}
    >
      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
        {edges.map(edge => {
          const fromNode = nodes.find(n => n.id === edge.from);
          const toNode = nodes.find(n => n.id === edge.to);
          if (!fromNode || !toNode) return null;
          const from = getNodeCenter(fromNode);
          const to = getNodeCenter(toNode);
          return (
            <line
              key={`${edge.from}-${edge.to}`}
              x1={from.x + canvasOffset.x}
              y1={from.y + canvasOffset.y}
              x2={to.x + canvasOffset.x}
              y2={to.y + canvasOffset.y}
              stroke="rgba(255, 255, 255, 0.2)"
              strokeWidth={2}
            />
          );
        })}
      </svg>

      <div
        className="relative"
        style={{
          transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px)`,
        }}
      >
        {nodes.map(node => (
          <div
            key={node.id}
            className="absolute cursor-move"
            style={{ left: node.x, top: node.y }}
            onMouseDown={e => {
              e.stopPropagation();
              onMouseDown(e, node.id);
            }}
          >
            {node.type === "input" && <InputFieldNode />}
            {node.type === "response" && <ResponseNode content={node.content} />}
            {node.type === "context" && <ContextNode />}
          </div>
        ))}
      </div>
    </motion.div>
  );
};
