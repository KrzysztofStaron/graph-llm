import { createNode, useGraphCanvas } from "../hooks/useGraphCanvas";
import { GraphCanvas } from "../app/GraphCanvas";
import { GraphNode, GraphNodes } from "../types/graph";
import { aiService } from "../interfaces/aiService";
import { useCallback } from "react";

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
    "input-1": {
      id: "input-1",
      type: "input",
      x: 400,
      y: 300,
      value: "",
      parentIds: ["context-1"],
      childrenIds: [],
    },
  };

  const { transform, setTransform, nodes, treeManager, handleMouseDown } =
    useGraphCanvas(initialNodes);

  const onInputSubmit = (query: string, caller: GraphNode) => {
    // Find the first response child node
    const responseNodeId = caller.childrenIds.find((childId) => {
      const childNode = nodes[childId];
      return childNode?.type === "response";
    });

    if (responseNodeId) {
      treeManager.patchNode(responseNodeId, { value: "" });

      aiService.chat(query).then((res) => {
        treeManager.patchNode(responseNodeId, { value: res });
      });
    } else {
      const newNode = createNode("response", caller.x, caller.y + 200);

      // Add the new node and link it to the caller
      treeManager.addNode(newNode);
      treeManager.linkNodes(caller.id, newNode.id);

      aiService.chat(query).then((res) => {
        treeManager.patchNode(newNode.id, { value: res });
      });
    }
  };

  const onDeleteNode = useCallback(
    (nodeId: string) => {
      treeManager.deleteNode(nodeId);
    },
    [treeManager]
  );

  return (
    <GraphCanvas
      onDeleteNode={onDeleteNode}
      nodes={nodes}
      transform={transform}
      setTransform={setTransform}
      onMouseDown={handleMouseDown}
      onInputSubmit={onInputSubmit}
      onAddNodeFromResponse={() => {}} // Dummy prop for now
    />
  );
};

export default AppPage;
