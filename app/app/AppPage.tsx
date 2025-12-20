import { useState } from "react";
import { useGraphCanvas } from "../hooks/useGraphCanvas";
import { GraphCanvas } from "./GraphCanvas";
import { GraphNode, Edge } from "../types/graph";

const AppPage = () => {
  const initialNodes: GraphNode[] = [
    { id: "context-1", type: "context", x: 200, y: 100 },
    { id: "input-1", type: "input", x: 400, y: 300 },
  ];

  const [edges] = useState<Edge[]>([{ from: "context-1", to: "input-1" }]);

  const { canvasOffset, nodes, handleMouseDown } = useGraphCanvas(initialNodes);

  return <GraphCanvas nodes={nodes} edges={edges} canvasOffset={canvasOffset} onMouseDown={handleMouseDown} />;
};

export default AppPage;
