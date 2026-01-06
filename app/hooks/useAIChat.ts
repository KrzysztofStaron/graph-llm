import { useCallback } from "react";
import { GraphCanvasRef } from "../app/GraphCanvas/GraphCanvas";
import { GraphNode, GraphNodes, ImageResponseNode } from "../types/";
import { createNode, TreeManager } from "../interfaces/TreeManager";
import { findFreePosition, getDefaultNodeDimensions } from "../utils/placement";
import { aiService, StreamResponse } from "../interfaces/aiService";
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
      const existingResponseNodeId = currentCaller.childrenIds.find((childId: string) => {
        const childNode = nodesRef.current[childId];
        return childNode?.type === "response";
      });

      let responseNodeId: string;
      let responseNode: GraphNode;

      // Create updated nodes object with the query value set - this will be mutated as we stream responses
      const updatedCaller = { ...currentCaller, value: query };
      const nodesWithQuery = {
        ...nodesRef.current,
        [caller.id]: updatedCaller,
      };

      // Set the value to query of the InputFieldNode
      treeManager.patchNode(caller.id, { value: query });

      // Prepare the response node (will be replaced with image-response if AI generates an image)
      if (existingResponseNodeId) {
        // put existing response node into loading state
        responseNodeId = existingResponseNodeId;
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

      // Track if we receive an image response
      let imageResult: { url: string; prompt?: string } | null = null;

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
          { model: selectedModel },
          // onImage callback - called when image is generated
          (imageUrl, prompt) => {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/ed17caec-2749-4a3c-95c9-6731b2da51e1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useAIChat.ts:182',message:'onImage callback triggered',data:{imageUrl:imageUrl.substring(0,50),prompt},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
            // #endregion
            imageResult = { url: imageUrl, prompt };
          }
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

      // Handle image response - convert the response node to an image-response node
      if (result.type === "image") {
        // Delete the text response node and create an image-response node in its place
        const imageNode = createNode("image-response", responseNode.x, responseNode.y) as ImageResponseNode;
        imageNode.value = result.content;
        imageNode.prompt = result.prompt;
        
        // Remove the old response node and replace with image node
        treeManager.deleteNodeDetach(responseNodeId);
        treeManager.addNode(imageNode);
        treeManager.linkNodes(caller.id, imageNode.id);
        
        // Update tracking
        responseNodeId = imageNode.id;
        responseNode = imageNode;
        nodesWithQuery[imageNode.id] = imageNode;
      }

      // If response has no Input Node, create a new one
      // Use nodesRef to get fresh data after potential node replacement
      const currentResponseNode = nodesRef.current[responseNodeId] || responseNode;
      if (
        !currentResponseNode.childrenIds.some(
          (childId) => nodesRef.current[childId]?.type === "input"
        )
      ) {
        const responseNodeDim =
          nodeDimensionsRef.current[responseNodeId] ||
          getDefaultNodeDimensions(currentResponseNode.type);

        // Place directly below the response node
        const targetX = currentResponseNode.x;
        const targetY = currentResponseNode.y + responseNodeDim.height + 90;

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
      // Skip cascade for image responses as they don't have text continuations
      if (result.type === "text") {
        await cascadeUpdateDescendants(responseNodeId, nodesWithQuery);
      }
    },
    [graphCanvasRef, cascadeUpdateDescendants, selectedModel]
  );

  return {
    onInputSubmit,
  };
}
