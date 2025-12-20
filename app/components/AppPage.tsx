import { useState } from "react";
import { createEdge, createNode, useGraphCanvas } from "../hooks/useGraphCanvas";
import { GraphCanvas } from "../app/GraphCanvas";
import { GraphNode, Edge } from "../types/graph";
import { aiService } from "../interfaces/aiService";

const AppPage = () => {
  const initialNodes: GraphNode[] = [
    { id: "context-1", type: "context", x: 200, y: 100 },
    { id: "input-1", type: "input", x: 400, y: 300 },
  ];

  const [edges, setEdges] = useState<Edge[]>([{ from: "context-1", to: "input-1" }]);

  const { canvasOffset, nodes, setNodes, handleMouseDown } = useGraphCanvas(initialNodes);

  const onInputSubmit = (query: string, caller: GraphNode) => {
    const responseNodeId: string | undefined = edges.find(edge => edge.from === caller.id)?.to;

    if (responseNodeId) {
      setNodes(
        nodes.map(node => {
          if (node.id === responseNodeId) {
            return { ...node, content: "" };
          }
          return node;
        })
      );

      aiService.chat(query).then(res => {
        setNodes(prev => prev.map(node => (node.id === responseNodeId ? { ...node, content: res } : node)));
      });
    } else {
      const newNode = createNode("response", caller.x, caller.y + 200);
      setNodes(prev => [...prev, newNode]);
      setEdges(prev => [...prev, createEdge(caller.id, newNode.id)]);

      aiService.chat(query).then(res => {
        setNodes(prev => prev.map(node => (node.id === newNode.id ? { ...node, content: res } : node)));
      });
    }
  };

  return (
    <GraphCanvas
      nodes={nodes}
      edges={edges}
      canvasOffset={canvasOffset}
      onMouseDown={handleMouseDown}
      onInputSubmit={onInputSubmit}
    />
  );
};

export default AppPage;
