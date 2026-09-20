import { GraphNodes } from "../types/GraphCanvas.types";
import { TreeManager } from "../interfaces/TreeManager";
import { aiService } from "../interfaces/aiService";
import type { TreeManager as TreeManagerType } from "../interfaces/TreeManager";
import logger from "./logger";
import { isAbortError } from "./requestAbort";
import { estimateSpawnOrText } from "./estimateSpawn";
import { applyPredictedReplyType } from "../hooks/spawnPredictedNode";

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
  const descendantLevels = TreeManager.findDescendantResponseNodes(
    startNodeId,
    currentNodes
  );

  for (const levelNodes of descendantLevels) {
    if (levelNodes.length === 0) continue;

    await Promise.all(
      levelNodes.map(async (responseNode) => {
        if (!isNodeLive(responseNode.id)) return;

        const inputParentId = responseNode.parentIds.find((parentId) => {
          const parent = currentNodes[parentId];
          return parent?.type === "input";
        });

        if (!inputParentId) return;

        const inputParent = currentNodes[inputParentId];
        if (!inputParent) return;

        const existing = currentNodes[responseNode.id];
        if (!existing || !isNodeLive(responseNode.id)) return;

        const nodesRef = { current: currentNodes };

        const controller = new AbortController();
        abortByNodeId.set(responseNode.id, controller);

        // Timed text loader first; Jev may swap the type while the stream runs.
        applyPredictedReplyType({
          nodeId: responseNode.id,
          spawn: "text",
          treeManager,
          nodesWithQuery: currentNodes,
          nodesRef,
        });

        const logData: {
          nodeId?: string;
          inputParentId?: string;
          model?: string;
          predictedSpawn?: string;
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

        let chunkCount = 0;

        const spawnTask = estimateSpawnOrText({
          prompt: inputParent.value,
          signal: controller.signal,
        }).then((spawn) => {
          logData.predictedSpawn = spawn;
          if (!isNodeLive(responseNode.id)) return spawn;
          applyPredictedReplyType({
            nodeId: responseNode.id,
            spawn,
            treeManager,
            nodesWithQuery: currentNodes,
            nodesRef,
          });
          return spawn;
        });

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
            {
              model: selectedModel,
              imageModel: selectedImageModel,
              webSearchEnabled,
              signal: controller.signal,
            },
            (imageUrl, prompt) => {
              if (!isNodeLive(responseNode.id)) return;
              logData.imageGenerated = true;
              logData.imagePrompt = prompt;
              logger.image(
                imageUrl,
                `Cascade node ${responseNode.id.substring(0, 8)}`,
                { prompt }
              );

              const live = currentNodes[responseNode.id];
              treeManager.patchNode(responseNode.id, {
                type: "image-response",
                value: "",
                error: undefined,
                status: "streaming",
                generationStartedAt: live?.generationStartedAt,
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

        await spawnTask;

        abortByNodeId.delete(responseNode.id);
        if (result === "aborted" || !isNodeLive(responseNode.id)) return;
        if (result === null) {
          logger.error("[CASCADE] Stream failed", logData);
          return;
        }

        logData.resultType = result.type;
        logData.totalChunks = chunkCount;
        logData.contentLength = result.content.length;
        logData.contentPreview = result.content.substring(0, 100);
        logger.info("[CASCADE] Stream completed", logData);

        if (result.type === "image") {
          logger.image(
            result.content,
            `Final cascade image ${responseNode.id.substring(0, 8)}`,
            {
              prompt: result.prompt,
              nodeId: responseNode.id,
            }
          );

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
