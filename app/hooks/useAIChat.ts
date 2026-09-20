import { useCallback, useEffect, useRef } from "react";
import { GraphCanvasRef } from "../app/GraphCanvas/GraphCanvas";
import { GraphNode, GraphNodes } from "../types/GraphCanvas.types";
import { TreeManager } from "../interfaces/TreeManager";
import { imageHasLayoutSize } from "../utils/imageLayoutReady";
import { aiService } from "../interfaces/aiService";
import { useAppSelector } from "../store/hooks";
import logger from "../utils/logger";
import { cascadeUpdateDescendants } from "../utils/cascadeUpdate";
import {
  abortRequestsForNodes,
  isAbortError,
} from "../utils/requestAbort";
import { estimateSpawnOrText } from "../utils/estimateSpawn";
import { ensureFollowUpInput } from "./ensureFollowUpInput";
import {
  applyPredictedReplyType,
  applySpawnPrediction,
  commitAlignedNode,
  createStreamingReplyNode,
  fillYoutubeNodes,
  scheduleAlignWhenPainted,
} from "./spawnPredictedNode";

function waitForPaintedImage(
  nodeId: string,
  nodesRef: { current: GraphNodes }
): Promise<void> {
  return new Promise((resolve) => {
    const started = performance.now();
    const poll = () => {
      if (
        !nodesRef.current[nodeId] ||
        imageHasLayoutSize(nodeId) ||
        performance.now() - started > 15000
      ) {
        resolve();
        return;
      }
      requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
  });
}

interface UseAIChatProps {
  graphCanvasRef: React.RefObject<GraphCanvasRef | null>;
}

interface UseAIChatReturn {
  onInputSubmit: (query: string, caller: GraphNode) => Promise<void>;
  cancelRequestsForNodes: (nodeIds: string[]) => void;
}

export function useAIChat({ graphCanvasRef }: UseAIChatProps): UseAIChatReturn {
  const selectedModel = useAppSelector((state) => state.settings.selectedModel);
  const selectedImageModel = useAppSelector(
    (state) => state.settings.selectedImageModel
  );
  const webSearchEnabled = useAppSelector(
    (state) => state.settings.webSearchEnabled
  );
  const abortByResponseIdRef = useRef(new Map<string, AbortController>());

  const abortStream = useCallback((responseId: string) => {
    abortRequestsForNodes(abortByResponseIdRef.current, [responseId]);
  }, []);

  const cancelRequestsForNodes = useCallback((nodeIds: string[]) => {
    abortRequestsForNodes(abortByResponseIdRef.current, nodeIds);
  }, []);

  useEffect(() => {
    const abortMap = abortByResponseIdRef.current;
    return () => {
      for (const controller of abortMap.values()) controller.abort();
      abortMap.clear();
    };
  }, []);

  const handleCascadeUpdate = useCallback(
    async (startNodeId: string, currentNodes: GraphNodes) => {
      const treeManager = graphCanvasRef.current?.treeManager;
      const nodesRef = graphCanvasRef.current?.nodesRef;
      if (!treeManager || !nodesRef) return;
      await cascadeUpdateDescendants({
        startNodeId,
        currentNodes,
        treeManager,
        selectedModel,
        selectedImageModel,
        webSearchEnabled,
        abortByNodeId: abortByResponseIdRef.current,
        isNodeLive: (nodeId) => Boolean(nodesRef.current[nodeId]),
      });
    },
    [graphCanvasRef, selectedModel, selectedImageModel, webSearchEnabled]
  );

  const onInputSubmit = useCallback(
    async (query: string, caller: GraphNode) => {
      const logData: Record<string, unknown> = {};
      const nodesRef = graphCanvasRef.current?.nodesRef;
      const nodeDimensionsRef = graphCanvasRef.current?.nodeDimensionsRef;
      const treeManager = graphCanvasRef.current?.treeManager;
      if (!nodesRef || !nodeDimensionsRef || !treeManager) return;

      const currentCaller = nodesRef.current[caller.id] || caller;
      const existingResponseNodeId = currentCaller.childrenIds.find(
        (childId: string) => {
          const childNode = nodesRef.current[childId];
          return (
            childNode?.type === "response" ||
            childNode?.type === "image-response"
          );
        }
      );

      const updatedCaller = { ...currentCaller, value: query };
      const nodesWithQuery = {
        ...nodesRef.current,
        [caller.id]: updatedCaller,
      };
      treeManager.patchNode(caller.id, { value: query });

      let responseNodeId: string;
      let responseNode: GraphNode;
      let youtubeSkeletonId: string | undefined;

      // Timed text loader first; Jev may swap the node type while streaming.
      if (existingResponseNodeId) {
        responseNodeId = existingResponseNodeId;
        abortStream(responseNodeId);
        if (!nodesRef.current[responseNodeId]) return;
        const patched = applyPredictedReplyType({
          nodeId: responseNodeId,
          spawn: "text",
          treeManager,
          nodesWithQuery,
          nodesRef,
        });
        if (!patched) return;
        responseNode = patched;
        scheduleAlignWhenPainted({
          nodeId: responseNodeId,
          parent: currentCaller,
          nodesRef,
          nodeDimensionsRef,
          treeManager,
          nodesWithQuery,
        });
      } else {
        const created = createStreamingReplyNode({
          spawn: "text",
          parent: currentCaller,
          nodesWithQuery,
          nodeDimensionsRef,
          nodesRef,
          treeManager,
        });
        responseNodeId = created.responseNodeId;
        responseNode = created.responseNode;
      }

      const streamController = new AbortController();
      abortByResponseIdRef.current.set(responseNodeId, streamController);
      const youtubeVideos: Array<{ videoId: string; explanation?: string }> =
        [];

      logData.query = query.substring(0, 100);
      logData.callerId = caller.id.substring(0, 8);
      logData.callerType = caller.type;
      logData.responseNodeId = responseNodeId.substring(0, 8);
      logData.isNewNode = !existingResponseNodeId;
      logData.model = selectedModel;

      const spawnTask = estimateSpawnOrText({
        prompt: query,
        signal: streamController.signal,
      }).then((spawn) => {
        logData.predictedSpawn = spawn;
        youtubeSkeletonId = applySpawnPrediction({
          nodeId: responseNodeId,
          spawn,
          parent: currentCaller,
          treeManager,
          nodesWithQuery,
          nodesRef,
          nodeDimensionsRef,
        });
        return spawn;
      });

      let mainChunkCount = 0;
      const result = await aiService
        .streamChat(
          TreeManager.buildChatML(nodesWithQuery, updatedCaller),
          (response) => {
            mainChunkCount++;
            if (!nodesRef.current[responseNodeId]) return;
            const live = nodesWithQuery[responseNodeId];
            treeManager.patchNode(responseNodeId, {
              value: response,
              error: undefined,
              status: "streaming",
              generationStartedAt: live?.generationStartedAt,
            });
            if (live) {
              nodesWithQuery[responseNodeId] = {
                ...live,
                value: response,
                error: undefined,
                status: "streaming",
              };
            }
          },
          {
            model: selectedModel,
            imageModel: selectedImageModel,
            webSearchEnabled,
            signal: streamController.signal,
          },
          (imageUrl, prompt) => {
            if (!nodesRef.current[responseNodeId]) return;
            logData.imageGenerated = true;
            logData.imagePrompt = prompt;
            logger.image(
              imageUrl,
              `Input response ${responseNodeId.substring(0, 8)}`,
              { prompt }
            );
            const live = nodesWithQuery[responseNodeId];
            treeManager.patchNode(responseNodeId, {
              type: "image-response",
              value: "",
              error: undefined,
              status: "streaming",
              generationStartedAt: live?.generationStartedAt,
            });
            if (live) {
              nodesWithQuery[responseNodeId] = {
                ...live,
                type: "image-response",
                value: "",
                error: undefined,
                status: "streaming",
              };
            }
            scheduleAlignWhenPainted({
              nodeId: responseNodeId,
              parent: currentCaller,
              nodesRef,
              nodeDimensionsRef,
              treeManager,
              nodesWithQuery,
            });
          },
          (reasoning) => {
            if (!nodesRef.current[responseNodeId]) return;
            const live = nodesWithQuery[responseNodeId];
            if (live?.type !== "response") return;
            treeManager.patchNode(responseNodeId, { reasoning });
            nodesWithQuery[responseNodeId] = { ...live, reasoning };
          },
          (videoId, explanation) => {
            youtubeVideos.push({ videoId, explanation });
            if (youtubeVideos.length !== 1 || !youtubeSkeletonId) return;
            const live = nodesWithQuery[youtubeSkeletonId];
            if (live?.type !== "youtube") return;
            treeManager.patchNode(youtubeSkeletonId, {
              value: videoId,
              explanation,
              status: "streaming",
              error: undefined,
              generationStartedAt: live.generationStartedAt,
            });
            nodesWithQuery[youtubeSkeletonId] = {
              ...live,
              value: videoId,
              explanation,
              status: "streaming",
              error: undefined,
            };
          }
        )
        .catch((error) => {
          abortByResponseIdRef.current.delete(responseNodeId);
          if (isAbortError(error)) return "aborted";
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          logData.error = errorMessage;
          logData.errorName = error instanceof Error ? error.name : "Unknown";
          logData.errorStack = error instanceof Error ? error.stack : undefined;
          treeManager.patchNode(responseNodeId, {
            error: errorMessage,
            status: "error",
          });
          const live = nodesWithQuery[responseNodeId];
          if (live) {
            nodesWithQuery[responseNodeId] = {
              ...live,
              error: errorMessage,
              status: "error",
            };
          }
          return null;
        });

      await spawnTask;

      abortByResponseIdRef.current.delete(responseNodeId);
      if (result === "aborted" || !nodesRef.current[responseNodeId]) return;
      if (result === null) {
        logger.error(
          `[INPUT_STREAM] [FAIL] Input Stream Failed: ${String(logData.error || "Unknown error")}`,
          logData
        );
        return;
      }

      logData.totalChunks = mainChunkCount;
      logData.resultType = result.type;
      logData.contentLength = result.content?.length || 0;
      logData.contentPreview = result.content?.substring(0, 100) || "";
      logData.youtubeVideosCount = youtubeVideos.length;
      logData.youtubeVideoIds = youtubeVideos.map((v) => v.videoId);

      if (result.type === "image") {
        logger.image(
          result.content,
          `Final input image ${responseNodeId.substring(0, 8)}`,
          { prompt: result.prompt, responseNodeId }
        );
        treeManager.patchNode(responseNodeId, {
          type: "image-response",
          value: result.content,
          prompt: result.prompt,
          status: "done",
        });
        nodesWithQuery[responseNodeId] = {
          ...nodesWithQuery[responseNodeId],
          type: "image-response",
          value: result.content,
          prompt: result.prompt,
          status: "done",
        };
        await waitForPaintedImage(responseNodeId, nodesRef);
        const liveImage = nodesRef.current[responseNodeId];
        if (!liveImage) return;
        responseNode = commitAlignedNode({
          node: liveImage,
          parent: currentCaller,
          nodesRef,
          nodeDimensionsRef,
          treeManager,
          nodesWithQuery,
        });
      } else {
        const cleanedContent = result.content
          .replace(/\[YOUTUBE:[^\]]+\]/g, "")
          .trim();
        const finalValue =
          cleanedContent.length > 0
            ? result.content
            : youtubeVideos.length > 0
              ? `Here ${youtubeVideos.length === 1 ? "is" : "are"} ${youtubeVideos.length} video${youtubeVideos.length === 1 ? "" : "s"} that should help:`
              : result.content;
        treeManager.patchNode(responseNodeId, {
          type: "response",
          value: finalValue,
          status: "done",
        });
        nodesWithQuery[responseNodeId] = {
          ...nodesWithQuery[responseNodeId],
          type: "response",
          value: finalValue,
          status: "done",
        };
        const liveText = nodesRef.current[responseNodeId];
        if (!liveText) return;
        responseNode = commitAlignedNode({
          node: liveText,
          parent: currentCaller,
          nodesRef,
          nodeDimensionsRef,
          treeManager,
          nodesWithQuery,
        });
      }

      if (!nodesRef.current[responseNodeId]) return;

      fillYoutubeNodes({
        responseNode,
        videos: youtubeVideos,
        skeletonId: youtubeSkeletonId,
        nodesWithQuery,
        nodeDimensionsRef,
        treeManager,
      });

      if (!nodesRef.current[responseNodeId]) return;
      ensureFollowUpInput({
        responseNodeId,
        nodesWithQuery,
        nodesRef,
        nodeDimensionsRef,
        treeManager,
      });

      await handleCascadeUpdate(responseNodeId, nodesWithQuery);
      logger.info(
        `[INPUT_STREAM] [OK] Input Flow Complete: ${result.type === "image" ? "Image" : "Text"} response (${logData.totalChunks} chunks, ${youtubeVideos.length} videos, ${Object.keys(nodesWithQuery).length} total nodes)`,
        { ...logData, nodeCount: Object.keys(nodesWithQuery).length }
      );
    },
    [
      abortStream,
      graphCanvasRef,
      handleCascadeUpdate,
      selectedModel,
      selectedImageModel,
      webSearchEnabled,
    ]
  );

  return { onInputSubmit, cancelRequestsForNodes };
}
