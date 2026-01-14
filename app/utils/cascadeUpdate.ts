import { GraphNodes, ResponseNode, GraphNode } from "../types/GraphCanvas.types";
import { TreeManager } from "../interfaces/TreeManager";
import { aiService } from "../interfaces/aiService";
import type { TreeManager as TreeManagerType } from "../interfaces/TreeManager";
import logger from "./logger";

interface CascadeUpdateParams {
  startNodeId: string;
  currentNodes: GraphNodes;
  treeManager: TreeManagerType;
  selectedModel: string;
  selectedImageModel: string;
  webSearchEnabled: boolean;
}

/**
 * Recursively updates all descendant response nodes in breadth-first order.
 * Updates all nodes at each depth level in parallel, then moves to the next level.
 */
export async function cascadeUpdateDescendants({
  startNodeId,
  currentNodes,
  treeManager,
  selectedModel,
  selectedImageModel,
  webSearchEnabled,
}: CascadeUpdateParams): Promise<void> {
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
      const patch: { value: string; error: undefined; reasoning?: undefined } = { value: "", error: undefined };
      if (node.type === "response") {
        patch.reasoning = undefined;
      }
      treeManager.patchNode(node.id, patch);
      const updatedNode = node.type === "response"
        ? ({
            ...currentNodes[node.id],
            value: "",
            error: undefined,
            reasoning: undefined,
          } as ResponseNode)
        : ({
            ...currentNodes[node.id],
            value: "",
            error: undefined,
          } as GraphNode);
      currentNodes[node.id] = updatedNode;
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

        logger.info('[CASCADE] Starting AI stream for descendant node', {
          nodeId: responseNode.id.substring(0, 8),
          inputParentId: inputParentId.substring(0, 8),
          model: selectedModel,
        });

        // Stream the AI response
        let chunkCount = 0;
        const result = await aiService
          .streamChat(
            TreeManager.buildChatML(currentNodes, inputParent),
            (response) => {
              chunkCount++;
              if (chunkCount === 1 || chunkCount % 10 === 0) {
                logger.debug('[CASCADE] Streaming chunk', {
                  nodeId: responseNode.id.substring(0, 8),
                  chunkNumber: chunkCount,
                  currentLength: response.length,
                  preview: response.substring(response.length - 50),
                });
              }
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
            { model: selectedModel, imageModel: selectedImageModel, webSearchEnabled },
            // onImage callback for cascade regeneration
            (imageUrl, prompt) => {
              logger.info('[CASCADE] Image generation triggered', {
                nodeId: responseNode.id.substring(0, 8),
                prompt,
              });
              logger.image(imageUrl, `Cascade node ${responseNode.id.substring(0, 8)}`, { prompt });
              
              // Immediately swap to image-response type to show image loading animation
              treeManager.patchNode(responseNode.id, {
                type: "image-response",
                value: "",
                error: undefined,
              });
              currentNodes[responseNode.id] = {
                ...currentNodes[responseNode.id],
                type: "image-response",
                value: "",
                error: undefined,
              };
            },
            // onReasoning callback for cascade regeneration
            (reasoning) => {
              if (currentNodes[responseNode.id]?.type === 'response') {
                treeManager.patchNode(responseNode.id, {
                  reasoning,
                });
                currentNodes[responseNode.id] = {
                  ...currentNodes[responseNode.id],
                  reasoning,
                } as GraphNode;
              }
            }
          )
          .catch((error) => {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            logger.error('[CASCADE] Stream error', {
              nodeId: responseNode.id.substring(0, 8),
              error: errorMessage,
            });
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

        logger.info('[CASCADE] Stream completed', {
          nodeId: responseNode.id.substring(0, 8),
          resultType: result.type,
          totalChunks: chunkCount,
          contentLength: result.content.length,
          contentPreview: result.content.substring(0, 100),
        });

        // Handle result type switching (text <-> image) in-place
        if (result.type === "image") {
          logger.image(result.content, `Final cascade image ${responseNode.id.substring(0, 8)}`, {
            prompt: result.prompt,
            nodeId: responseNode.id,
          });
          
          // Patch the existing node to change its type to image-response
          treeManager.patchNode(responseNode.id, {
            type: "image-response",
            value: result.content,
            prompt: result.prompt,
          });
          currentNodes[responseNode.id] = {
            ...currentNodes[responseNode.id],
            type: "image-response",
            value: result.content,
            prompt: result.prompt,
          };
        } else {
          // For text responses, ensure type is "response"
          treeManager.patchNode(responseNode.id, {
            type: "response",
          });
          currentNodes[responseNode.id] = {
            ...currentNodes[responseNode.id],
            type: "response",
          };
        }
      })
    );
  }
}

