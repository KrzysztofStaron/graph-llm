import { createNode, useGraphCanvas } from "../hooks/useGraphCanvas";
import { GraphCanvas } from "./GraphCanvas";
import { GraphNode, GraphNodes } from "../types/graph";
import { aiService } from "../interfaces/aiService";

const AppPage = () => {
  const initialNodes: GraphNodes = {
    "context-1": {
      id: "context-1",
      type: "context",
      x: 200,
      y: 100,
      value: "",
      parentIds: [],
      childrenIds: ["input-1"],
    },
    "input-1": { id: "input-1", type: "input", x: 400, y: 300, value: "", parentIds: ["context-1"], childrenIds: [] },
  };

  const { canvasOffset, nodes, setNodes, handleMouseDown } = useGraphCanvas(initialNodes);

  const onInputSubmit = (query: string, caller: GraphNode) => {
    // Find the first response child node
    let responseNodeId = caller.childrenIds.find(childId => {
      const childNode = nodes[childId];
      return childNode?.type === "response";
    });

    // Figure out what node to affect

    if (responseNodeId) {
      // put existing response node into loading state
      setNodes(prev => ({
        ...prev,
        [responseNodeId!]: { ...prev[responseNodeId!], value: "" },
      }));
    } else {
      const newNode = createNode("response", caller.x, caller.y + 200);
      responseNodeId = newNode.id;

      // Update both sides of the relationship in a single state update
      setNodes(prev => ({
        ...prev,
        [caller.id]: { ...prev[caller.id], childrenIds: [...prev[caller.id].childrenIds, newNode.id] },
        [newNode.id]: { ...newNode, parentIds: [...newNode.parentIds, caller.id] },
      }));
    }

    // respondeNodeId tells us which node to affect

    aiService.streamChat(query, reponse => {
      setNodes(prev => ({
        ...prev,
        [responseNodeId]: { ...prev[responseNodeId], value: reponse },
      }));
    });
  };

  return (
    <GraphCanvas
      nodes={nodes}
      canvasOffset={canvasOffset}
      onMouseDown={handleMouseDown}
      onInputSubmit={onInputSubmit}
    />
  );
};

export default AppPage;
