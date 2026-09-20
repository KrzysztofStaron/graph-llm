import { GraphNodes } from "../types/GraphCanvas.types";
import { TreeManager } from "../interfaces/TreeManager";
import { aiService } from "../interfaces/aiService";
import type { TreeManager as TreeManagerType } from "../interfaces/TreeManager";
import logger from "./logger";
import { isAbortError } from "./requestAbort";

interface CascadeUpdateParams {
  startNodeId: string;
  currentNodes: GraphNodes;
  treeManager: TreeManagerType;
  selectedModel: string;
  selectedImageModel: string;
  webSearchEnabled: boolean;
  abortByNodeId: Map<string, AbortController>;
  isNodeLive: (nodeId: string) => boolean;
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
  abortByNodeId,
  isNodeLive,
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
      const existing = currentNodes[node.id];
      if (!existing || !isNodeLive(node.id)) continue;
      const patch: {
        value: string;
        error: undefined;
        status: "streaming";
        reasoning?: undefined;
      } = { value: "", error: undefined, status: "streaming" };
      if (node.type === "response") {
        patch.reasoning = undefined;
      }
      treeManager.patchNode(node.id, patch);
      currentNodes[node.id] =
        node.type === "response"
          ? {
              ...existing,
              ...patch,
              type: "response" as const,
            }
          : {
              ...existing,
              ...patch,
            };
    }

    // Update all nodes at this level in parallel
    await Promise.all(
      levelNodes.map(async (responseNode) => {
        if (!isNodeLive(responseNode.id)) return;

        // Find the input node parent of this response node to build ChatML
        const inputParentId = responseNode.parentIds.find((parentId) => {
          const parent = currentNodes[parentId];
          return parent?.type === "input";
        });

        if (!inputParentId) return;

        const inputParent = currentNodes[inputParentId];
        if (!inputParent) return;

        const logData: {
          nodeId?: string;
          inputParentId?: string;
          model?: string;
          resultType?: string;
          totalChunks?: number;
          contentLength?: number;
          contentPreview?: string;
          imageGenerated?: boolean;
          imagePrompt?: string;
          error?: string;
        } = {
          nodeId: responseNode.id.substring(0, 8),
          inputParentId: inputParentId.substring(0, 8),
          model: selectedModel,
        };

        // Stream the AI response
        let chunkCount = 0;
        const controller = new AbortController();
        abortByNodeId.set(responseNode.id, controller);
        const result = await aiService
          .streamChat(
            TreeManager.buildChatML(currentNodes, inputParent),
            (response) => {
              chunkCount++;
              if (!isNodeLive(responseNode.id)) return;
              const live = currentNodes[responseNode.id];
              if (!live) return;
              treeManager.patchNode(responseNode.id, {
                value: response,
                error: undefined,
                status: "streaming",
              });
              currentNodes[responseNode.id] = {
                ...live,
                value: response,
                error: undefined,
                status: "streaming",
              };
            },
            { model: selectedModel, imageModel: selectedImageModel, webSearchEnabled, signal: controller.signal },
            // onImage callback for cascade regeneration
            (imageUrl, prompt) => {
              if (!isNodeLive(responseNode.id)) return;
              logData.imageGenerated = true;
              logData.imagePrompt = prompt;
              logger.image(imageUrl, `Cascade node ${responseNode.id.substring(0, 8)}`, { prompt });
              
              // Immediately swap to image-response type to show image loading animation
              const live = currentNodes[responseNode.id];
              treeManager.patchNode(responseNode.id, {
                type: "image-response",
                value: "",
                error: undefined,
                status: "streaming",
              });
              if (live) {
                currentNodes[responseNode.id] = {
                  ...live,
                  type: "image-response",
                  value: "",
                  error: undefined,
                  status: "streaming",
                };
              }
            },
            // onReasoning callback for cascade regeneration
            (reasoning) => {
              if (!isNodeLive(responseNode.id)) return;
              const live = currentNodes[responseNode.id];
              if (live?.type !== "response") return;
              treeManager.patchNode(responseNode.id, {
                reasoning,
              });
              currentNodes[responseNode.id] = {
                ...live,
                reasoning,
              };
            }
          )
          .catch((error) => {
            abortByNodeId.delete(responseNode.id);
            if (isAbortError(error) || !isNodeLive(responseNode.id)) {
              return "aborted";
            }
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            logData.error = errorMessage;
            const live = currentNodes[responseNode.id];
            treeManager.patchNode(responseNode.id, {
              error: errorMessage,
              status: "error",
            });
            if (live) {
              currentNodes[responseNode.id] = {
                ...live,
                error: errorMessage,
                status: "error",
              };
            }
            return null;
          });

        abortByNodeId.delete(responseNode.id);
        if (result === "aborted" || !isNodeLive(responseNode.id)) return;
        if (result === null) {
          logger.error('[CASCADE] Stream failed', logData);
          return;
        }

        logData.resultType = result.type;
        logData.totalChunks = chunkCount;
        logData.contentLength = result.content.length;
        logData.contentPreview = result.content.substring(0, 100);
        logger.info('[CASCADE] Stream completed', logData);

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
            status: "done",
          });
          const live = currentNodes[responseNode.id];
          if (live) {
            currentNodes[responseNode.id] = {
              ...live,
              type: "image-response",
              value: result.content,
              prompt: result.prompt,
              status: "done",
            };
          }
        } else {
          // For text responses, ensure type is "response"
          treeManager.patchNode(responseNode.id, {
            type: "response",
            status: "done",
          });
          const live = currentNodes[responseNode.id];
          if (live) {
            currentNodes[responseNode.id] = {
              ...live,
              type: "response",
              status: "done",
            };
          }
        }
      })
    );
  }
}

