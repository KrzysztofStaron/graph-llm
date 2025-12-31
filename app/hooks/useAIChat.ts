import { useCallback } from "react";
import { GraphCanvasRef } from "../app/GraphCanvas/GraphCanvas";
import { GraphNode, GraphNodes } from "../types/";
import { createNode, TreeManager } from "../interfaces/TreeManager";
import { findFreePosition, getDefaultNodeDimensions } from "../utils/placement";
import { aiService } from "../interfaces/aiService";
import { useAppSelector } from "../store/hooks";

interface UseAIChatProps {
  graphCanvasRef: React.RefObject<GraphCanvasRef | null>;
}

interface UseAIChatReturn {
  onInputSubmit: (query: string, caller: GraphNode) => Promise<void>;
}

export function useAIChat({ graphCanvasRef }: UseAIChatProps): UseAIChatReturn {
  const selectedModel = useAppSelector((state) => state.settings.selectedModel);
  /**
   * Recursively updates all descendant response nodes in breadth-first order.
   * Updates all nodes at each depth level in parallel, then moves to the next level.
   */
  const cascadeUpdateDescendants = useCallback(
    async (startNodeId: string, currentNodes: GraphNodes) => {
      const treeManager = graphCanvasRef.current?.treeManager;
      if (!treeManager) return;

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
          treeManager.patchNode(node.id, { value: "", error: undefined });
          currentNodes[node.id] = {
            ...currentNodes[node.id],
            value: "",
            error: undefined,
          };
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
            const result = await aiService
              .streamChat(
                TreeManager.buildChatML(currentNodes, inputParent),
                (response) => {
                  treeManager.patchNode(responseNode.id, {
                    value: response,
                    error: undefined,
                  });
                  currentNodes[responseNode.id] = {
                    ...currentNodes[responseNode.id],
                    value: response,
                    error: undefined,
                  };
                },
                { model: selectedModel }
              )
              .catch((error) => {
                const errorMessage =
                  error instanceof Error ? error.message : String(error);
                treeManager.patchNode(responseNode.id, { error: errorMessage });
                currentNodes[responseNode.id] = {
                  ...currentNodes[responseNode.id],
                  error: errorMessage,
                };
                return null;
              });

            if (result === null) {
              return;
            }
          })
        );
      }
    },
    [graphCanvasRef]
  );

  const onInputSubmit = useCallback(
    async (query: string, caller: GraphNode) => {
      const nodesRef = graphCanvasRef.current?.nodesRef;
      const nodeDimensionsRef = graphCanvasRef.current?.nodeDimensionsRef;
      const treeManager = graphCanvasRef.current?.treeManager;
      if (!nodesRef || !nodeDimensionsRef || !treeManager) return;

      // Get the current node from nodesRef to use up-to-date position (may have been moved by collision resolution)
      const currentCaller = nodesRef.current[caller.id] || caller;

      // Find the first response child node
      let responseNodeId = currentCaller.childrenIds.find((childId: string) => {
        const childNode = nodesRef.current[childId];
        return childNode?.type === "response";
      });

      let responseNode: GraphNode;

      // Create updated nodes object with the query value set - this will be mutated as we stream responses
      const updatedCaller = { ...currentCaller, value: query };
      const nodesWithQuery = {
        ...nodesRef.current,
        [caller.id]: updatedCaller,
      };

      // Set the value to query of the InputFieldNode
      treeManager.patchNode(caller.id, { value: query });

      // Prepare the response node
      if (responseNodeId) {
        // put existing response node into loading state
        treeManager.patchNode(responseNodeId, { value: "", error: undefined });
        responseNode = nodesRef.current[responseNodeId];
      } else {
        // create a new response node with smart placement - close to parent
        const callerDim =
          nodeDimensionsRef.current[caller.id] ||
          getDefaultNodeDimensions(caller.type);

        const targetX = currentCaller.x + callerDim.width / 4;
        const targetY = currentCaller.y + 90;

        const newNodeDim = getDefaultNodeDimensions("response");
        const freePos = findFreePosition(
          targetX,
          targetY,
          newNodeDim.width,
          newNodeDim.height,
          nodesWithQuery,
          nodeDimensionsRef.current,
          "below"
        );

        const newNode = createNode("response", freePos.x, freePos.y);
        responseNodeId = newNode.id;
        treeManager.addNode(newNode);
        treeManager.linkNodes(caller.id, newNode.id);

        responseNode = newNode;
        nodesWithQuery[newNode.id] = newNode;
      }

      // Send the query - use the locally updated nodes object
      const result = await aiService
        .streamChat(
          TreeManager.buildChatML(nodesWithQuery, updatedCaller),
          (response) => {
            treeManager.patchNode(responseNodeId, {
              value: response,
              error: undefined,
            });
            nodesWithQuery[responseNodeId] = {
              ...nodesWithQuery[responseNodeId],
              value: response,
              error: undefined,
            };
          },
          { model: selectedModel }
        )
        .catch((error) => {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          treeManager.patchNode(responseNodeId, { error: errorMessage });
          nodesWithQuery[responseNodeId] = {
            ...nodesWithQuery[responseNodeId],
            error: errorMessage,
          };
          return null;
        });

      // If the request failed, don't create follow-up nodes or cascade updates
      if (result === null) {
        return;
      }

      // If response has no Input Node, create a new one
      if (
        responseNode.childrenIds.some(
          (childId) => nodesRef.current[childId].type === "input"
        ) === false
      ) {
        const responseNodeDim =
          nodeDimensionsRef.current[responseNode.id] ||
          getDefaultNodeDimensions("response");

        // Place directly below the response node
        const targetX = responseNode.x;
        const targetY = responseNode.y + responseNodeDim.height + 90;

        const newNodeDim = getDefaultNodeDimensions("input");
        const freePos = findFreePosition(
          targetX,
          targetY,
          newNodeDim.width,
          newNodeDim.height,
          nodesWithQuery,
          nodeDimensionsRef.current,
          "below"
        );

        const newInputNode = createNode("input", freePos.x, freePos.y);

        treeManager.addNode(newInputNode);
        treeManager.linkNodes(responseNodeId, newInputNode.id);
        nodesWithQuery[newInputNode.id] = newInputNode;
      }

      // Cascading updates: find all descendant response nodes and update them level by level
      await cascadeUpdateDescendants(responseNodeId, nodesWithQuery);
    },
    [graphCanvasRef, cascadeUpdateDescendants, selectedModel]
  );

  return {
    onInputSubmit,
  };
}
