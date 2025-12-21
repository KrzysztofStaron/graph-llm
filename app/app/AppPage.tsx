import { createNode, TreeManager, useGraphCanvas } from "../hooks/useGraphCanvas";
import { GraphCanvas } from "./GraphCanvas";
import { GraphNode, GraphNodes } from "../types/graph";
import { aiService } from "../interfaces/aiService";

const AppPage = () => {
  const initialNodes: GraphNodes = {
    "context-1": {
      id: "context-1",
      type: "context",
      x: 450,
      y: 100,
      value: "name of user is Krzysztof",
      parentIds: [],
      childrenIds: ["input-1"],
    },
    "context-2": {
      id: "context-2",
      type: "context",
      x: 650,
      y: 100,
      value: "Krzysztof is 18 years old",
      parentIds: [],
      childrenIds: ["input-1"],
    },
    "input-1": {
      id: "input-1",
      type: "input",
      x: 400,
      y: 300,
      value: "",
      parentIds: ["context-1", "context-2"],
      childrenIds: [],
    },
  };

  const { canvasOffset, nodes, treeManager, handleMouseDown } = useGraphCanvas(initialNodes);

  const onInputSubmit = async (query: string, caller: GraphNode) => {
    // Find the first response child node
    let responseNodeId = caller.childrenIds.find(childId => {
      const childNode = nodes[childId];
      return childNode?.type === "response";
    });

    let responseNode: GraphNode;

    // Create updated nodes object with the query value set
    const updatedCaller = { ...caller, value: query };
    const nodesWithQuery = { ...nodes, [caller.id]: updatedCaller };

    // Set the value to query of the InputFieldNode
    treeManager.patchNode(caller.id, { value: query });

    // Prepare the response node
    if (responseNodeId) {
      // put existing response node into loading state

      treeManager.patchNode(responseNodeId, { value: "" });
      responseNode = nodes[responseNodeId];
    } else {
      // create a new response node

      const newNode = createNode("response", caller.x, caller.y + 200);
      responseNodeId = newNode.id;
      treeManager.addNode(newNode);
      treeManager.linkNodes(caller.id, newNode.id);

      responseNode = newNode;
    }

    // Send the query - use the locally updated nodes object
    const response = await aiService.streamChat(TreeManager.buildChatML(nodesWithQuery, updatedCaller), reponse => {
      treeManager.patchNode(responseNodeId, { value: reponse });
    });

    // If response has no Input Node, create a new one
    if (
      nodesWithQuery[responseNodeId].childrenIds.some(childId => nodesWithQuery[childId]?.type === "input") === false
    ) {
      const newInputNode = createNode("input", responseNode.x, responseNode.y + 200);
      treeManager.addNode(newInputNode);
      treeManager.linkNodes(responseNodeId, newInputNode.id);
    }
  };

  return (
    <div className="relative w-full h-screen">
      <button
        className="absolute top-4 left-4 z-50 bg-blue-500 text-white p-2 rounded-md pointer-events-auto"
        onClick={e => {
          e.stopPropagation();

          const messages = TreeManager.buildChatML(nodes, nodes["efce5fa5-ad1b-47f2-b614-1b1d55950d17"]);
          console.log("ChatML result:", messages);
        }}
      >
        Build ChatML
      </button>
      <GraphCanvas
        nodes={nodes}
        canvasOffset={canvasOffset}
        onMouseDown={handleMouseDown}
        onInputSubmit={onInputSubmit}
      />
    </div>
  );
};

export default AppPage;
