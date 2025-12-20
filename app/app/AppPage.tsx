import { createNode, useGraphCanvas } from "../hooks/useGraphCanvas";
import { GraphCanvas } from "./GraphCanvas";
import { GraphNode, GraphNodes } from "../types/graph";
import { aiService } from "../interfaces/aiService";

const AppPage = () => {
  const initialNodes: GraphNodes = {
    "context-1": {
      id: "context-1",
      type: "context",
      x: 550,
      y: 100,
      value: "name of user is Krzysztof",
      parentIds: [],
      childrenIds: ["input-1"],
    },
    "input-1": { id: "input-1", type: "input", x: 400, y: 300, value: "", parentIds: ["context-1"], childrenIds: [] },
  };

  const { canvasOffset, nodes, treeManager, handleMouseDown } = useGraphCanvas(initialNodes);

  const onInputSubmit = (query: string, caller: GraphNode) => {
    // Find the first response child node
    let responseNodeId = caller.childrenIds.find(childId => {
      const childNode = nodes[childId];
      return childNode?.type === "response";
    });

    // Set the value to query of the InputFieldNode
    treeManager.patchNode(caller.id, { value: query });

    // Figure out what node to affect

    if (responseNodeId) {
      // put existing response node into loading state
      treeManager.patchNode(responseNodeId, { value: "" });
    } else {
      const newNode = createNode("response", caller.x, caller.y + 200);
      responseNodeId = newNode.id;

      // Add the new node and link it to the caller
      treeManager.addNode(newNode);
      treeManager.linkNodes(caller.id, newNode.id);
    }

    // respondeNodeId tells us which node to affect

    aiService.streamChat(query, reponse => {
      treeManager.patchNode(responseNodeId, { value: reponse });
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
