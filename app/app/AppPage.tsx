import { useState, useCallback } from "react";
import { createNode, TreeManager } from "../hooks/useGraphCanvas";
import { GraphCanvas } from "./GraphCanvas";
import { ContextSidebar } from "./ContextSidebar";
import { GraphNode, GraphNodes } from "../types/graph";
import { aiService } from "../interfaces/aiService";
import {
  GraphCanvasProvider,
  useGraphCanvasContext,
} from "../hooks/GraphCanvasContext";

const initialNodes: GraphNodes = {
  "context-1": {
    id: "context-1",
    type: "context",
    x: 550 + 300,
    y: 100,
    value: `Today is ${new Date().toLocaleDateString()}, ${new Date().toLocaleDateString(
      "en-US",
      { weekday: "long" }
    )}`,
    parentIds: [],
    childrenIds: ["input-1"],
  },

  "input-1": {
    id: "input-1",
    type: "input",
    x: 400 + 300,
    y: 300,
    value: "",
    parentIds: ["context-1"],
    childrenIds: [],
  },
};

const AppPageContent = () => {
  const {
    transform,
    setTransform,
    nodes,
    nodesRef,
    treeManager,
    handleMouseDown,
  } = useGraphCanvasContext();

  // Context node editing state
  const [editingContextNodeId, setEditingContextNodeId] = useState<
    string | null
  >(null);

  const handleContextNodeDoubleClick = useCallback(
    (nodeId: string) => {
      const node = nodes[nodeId];
      if (node && node.type === "context") {
        setEditingContextNodeId(nodeId);
      }
    },
    [nodes]
  );

  const handleCloseSidebar = useCallback(
    (finalValue: string) => {
      if (editingContextNodeId) {
        treeManager.patchNode(editingContextNodeId, { value: finalValue });
      }
      setEditingContextNodeId(null);
    },
    [editingContextNodeId, treeManager]
  );

  const onAddNodeFromResponse = (
    responseNode: GraphNode,
    position: "left" | "right"
  ) => {
    const nodeElement = document.querySelector(
      `[data-node-id="${responseNode.id}"]`
    ) as HTMLElement;
    const width = nodeElement?.offsetWidth ?? 400;

    const offsetX = position === "left" ? -width - 100 : width + 100;
    const newInputNode = createNode(
      "input",
      responseNode.x + offsetX,
      responseNode.y
    );

    treeManager.addNode(newInputNode);
    treeManager.linkNodes(responseNode.id, newInputNode.id);
  };

  const onInputSubmit = async (query: string, caller: GraphNode) => {
    // Find the first response child node
    let responseNodeId = caller.childrenIds.find((childId) => {
      const childNode = nodesRef.current[childId];
      return childNode?.type === "response";
    });

    let responseNode: GraphNode;

    // Create updated nodes object with the query value set - this will be mutated as we stream responses
    const updatedCaller = { ...caller, value: query };
    const nodesWithQuery = { ...nodesRef.current, [caller.id]: updatedCaller };

    // Set the value to query of the InputFieldNode
    treeManager.patchNode(caller.id, { value: query });

    // Prepare the response node
    if (responseNodeId) {
      // put existing response node into loading state

      treeManager.patchNode(responseNodeId, { value: "" });
      responseNode = nodesRef.current[responseNodeId];
    } else {
      // create a new response node

      const newNode = createNode("response", caller.x, caller.y + 150);
      responseNodeId = newNode.id;
      treeManager.addNode(newNode);
      treeManager.linkNodes(caller.id, newNode.id);

      responseNode = newNode;
      nodesWithQuery[newNode.id] = newNode;
    }

    // Send the query - use the locally updated nodes object
    await aiService.streamChat(
      TreeManager.buildChatML(nodesWithQuery, updatedCaller),
      (response) => {
        treeManager.patchNode(responseNodeId, { value: response });
        nodesWithQuery[responseNodeId] = {
          ...nodesWithQuery[responseNodeId],
          value: response,
        };
      }
    );

    // If response has no Input Node, create a new one
    if (
      responseNode.childrenIds.some(
        (childId) => nodesRef.current[childId].type === "input"
      ) === false
    ) {
      const nodeElement = document.querySelector(
        `[data-node-id="${responseNode.id}"]`
      ) as HTMLElement;
      const height = nodeElement?.offsetHeight ?? 80;

      const newInputNode = createNode(
        "input",
        responseNode.x,
        responseNode.y + height + 50
      );

      treeManager.addNode(newInputNode);
      treeManager.linkNodes(responseNodeId, newInputNode.id);
      nodesWithQuery[newInputNode.id] = newInputNode;
    }

    // Cascading updates: find all descendant response nodes and update them level by level
    await cascadeUpdateDescendants(responseNodeId, nodesWithQuery);
  };

  /**
   * Recursively updates all descendant response nodes in breadth-first order.
   * Updates all nodes at each depth level in parallel, then moves to the next level.
   */
  const cascadeUpdateDescendants = async (
    startNodeId: string,
    currentNodes: GraphNodes
  ) => {
    // Find all descendant response nodes grouped by depth level
    const descendantLevels = TreeManager.findDescendantResponseNodes(
      startNodeId,
      currentNodes
    );

    // Process each level sequentially
    for (const levelNodes of descendantLevels) {
      if (levelNodes.length === 0) continue;

      // Put all nodes in this level into loading state
      for (const node of levelNodes) {
        treeManager.patchNode(node.id, { value: "" });
        currentNodes[node.id] = { ...currentNodes[node.id], value: "" };
      }

      // Update all nodes at this level in parallel
      await Promise.all(
        levelNodes.map(async (responseNode) => {
          // Find the input node parent of this response node to build ChatML
          const inputParentId = responseNode.parentIds.find((parentId) => {
            const parent = currentNodes[parentId];
            return parent?.type === "input";
          });

          if (!inputParentId) return;

          const inputParent = currentNodes[inputParentId];

          // Stream the AI response
          await aiService.streamChat(
            TreeManager.buildChatML(currentNodes, inputParent),
            (response) => {
              treeManager.patchNode(responseNode.id, { value: response });
              currentNodes[responseNode.id] = {
                ...currentNodes[responseNode.id],
                value: response,
              };
            }
          );
        })
      );
    }
  };

  return (
    <div className="relative w-full h-screen">
      <GraphCanvas
        nodes={nodes}
        transform={transform}
        setTransform={setTransform}
        onMouseDown={handleMouseDown}
        onInputSubmit={onInputSubmit}
        onAddNodeFromResponse={onAddNodeFromResponse}
        onDeleteNode={(nodeId) => treeManager.deleteNode(nodeId)}
        onContextNodeDoubleClick={handleContextNodeDoubleClick}
      />
      {editingContextNodeId && (
        <ContextSidebar
          value={nodes[editingContextNodeId]?.value || ""}
          onChange={(val) => {
            treeManager.patchNode(editingContextNodeId, { value: val });
          }}
          onClose={handleCloseSidebar}
        />
      )}
      <div
        className="dot-grid-background fixed inset-0 -z-20"
        style={{
          backgroundSize: `${40 * transform.k}px ${40 * transform.k}px`,
          backgroundImage:
            "radial-gradient(circle, rgba(255, 255, 255, 0.1) 1px, transparent 1px)",
          backgroundColor: "#0a0a0a",
          opacity: 0.4,
          backgroundPosition: `${transform.x}px ${transform.y}px`,
        }}
      />
    </div>
  );
};

const AppPage = () => {
  return (
    <GraphCanvasProvider initialNodes={initialNodes}>
      <AppPageContent />
    </GraphCanvasProvider>
  );
};

export default AppPage;
