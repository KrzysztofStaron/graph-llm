import { createNode, useGraphCanvas } from "../hooks/useGraphCanvas";
import { GraphCanvas } from "../app/GraphCanvas";
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
    const responseNodeId = caller.childrenIds.find(childId => {
      const childNode = nodes[childId];
      return childNode?.type === "response";
    });

    if (responseNodeId) {
      setNodes(prev => ({
        ...prev,
        [responseNodeId]: { ...prev[responseNodeId], value: "" },
      }));

      aiService.chat(query).then(res => {
        setNodes(prev => ({
          ...prev,
          [responseNodeId]: { ...prev[responseNodeId], value: res },
        }));
      });
    } else {
      const newNode = createNode("response", caller.x, caller.y + 200);

      // Update both sides of the relationship in a single state update
      setNodes(prev => ({
        ...prev,
        [caller.id]: { ...prev[caller.id], childrenIds: [...prev[caller.id].childrenIds, newNode.id] },
        [newNode.id]: { ...newNode, parentIds: [...newNode.parentIds, caller.id] },
      }));

      aiService.chat(query).then(res => {
        setNodes(prev => ({
          ...prev,
          [newNode.id]: { ...prev[newNode.id], value: res },
        }));
      });
    }
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
