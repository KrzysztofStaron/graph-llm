import { CanvasContext } from "@/app/app/GraphCanvas";
import { NodeDimensions, Vector2 } from "@/app/types/graph";
import { getNodeCenter } from "@/app/utils/getNodeCenter";
import { AnimatePresence, motion } from "framer-motion";
import { useContext } from "react";

const EdgesRenderer = ({
  localNodeDimensions,
  appearingNodes,
}: {
  localNodeDimensions: NodeDimensions;
  appearingNodes: Record<string, Vector2>;
}) => {
  const { nodes } = useContext(CanvasContext);

  const nodeArray = Object.values(nodes);

  const edges = nodeArray.flatMap((node) =>
    node.childrenIds.map((to) => ({ from: node.id, to }))
  );

  return (
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
      <AnimatePresence>
        {edges.map((edge) => {
          const fromNode = nodes[edge.from];
          const toNode = nodes[edge.to];
          if (!fromNode || !toNode) return null;
          const from = getNodeCenter(fromNode, localNodeDimensions);
          const to = getNodeCenter(toNode, localNodeDimensions);
          const isAppearing = appearingNodes && edge.to in appearingNodes;
          return (
            <motion.line
              key={`${edge.from}-${edge.to}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke="white"
              strokeWidth={2}
              initial={isAppearing ? { opacity: 0 } : { opacity: 0.2 }}
              animate={{ opacity: 0.2 }}
              transition={{
                duration: 0.2,
                ease: "easeOut",
              }}
            />
          );
        })}
      </AnimatePresence>
    </svg>
  );
};

export default EdgesRenderer;
