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

  const onAddNodeFromResponse = (responseNode: GraphNode, position: "left" | "right") => {
    const nodeElement = document.querySelector(`[data-node-id="${responseNode.id}"]`) as HTMLElement;
    const width = nodeElement?.offsetWidth ?? 400;

    const offsetX = position === "left" ? -width - 100 : width + 100;
    const newInputNode = createNode("input", responseNode.x + offsetX, responseNode.y);

    treeManager.addNode(newInputNode);
    treeManager.linkNodes(responseNode.id, newInputNode.id);
  };

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

      const newNode = createNode("response", caller.x, caller.y + 150);
      responseNodeId = newNode.id;
      treeManager.addNode(newNode);
      treeManager.linkNodes(caller.id, newNode.id);

      responseNode = newNode;
    }

    // Send the query - use the locally updated nodes object
    const response = await aiService.streamChat(TreeManager.buildChatML(nodesWithQuery, updatedCaller), reponse => {
      treeManager.patchNode(responseNodeId, { value: reponse });
      nodesWithQuery[responseNodeId].value = reponse;
    });

    // If response has no Input Node, create a new one
    if (responseNode.childrenIds.some(childId => nodes[childId].type === "input") === false) {
      const nodeElement = document.querySelector(`[data-node-id="${responseNode.id}"]`) as HTMLElement;
      const width = nodeElement?.offsetWidth ?? 400;
      const height = nodeElement?.offsetHeight ?? 80;

      const newInputNode = createNode("input", responseNode.x, responseNode.y + height + 50);

      treeManager.addNode(newInputNode);
      treeManager.linkNodes(responseNodeId, newInputNode.id);
    }
  };

  return (
    <div className="relative w-full h-screen">
      <GraphCanvas
        nodes={nodes}
        canvasOffset={canvasOffset}
        onMouseDown={handleMouseDown}
        onInputSubmit={onInputSubmit}
        onAddNodeFromResponse={onAddNodeFromResponse}
      />
      <div
        className="dot-grid-background fixed inset-0 -z-20"
        style={{
          backgroundSize: "40px 40px",
          backgroundImage: "radial-gradient(circle, rgba(255, 255, 255, 0.1) 1px, transparent 1px)",
          backgroundColor: "#0a0a0a",
          opacity: 0.4,
          backgroundPosition: `${canvasOffset.x % 40}px ${canvasOffset.y % 40}px`,
        }}
      />
    </div>
  );
};

export default AppPage;
