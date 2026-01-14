import { useCallback } from "react";
import { GraphCanvasRef } from "../app/GraphCanvas/GraphCanvas";
import { GraphNode, GraphNodes, ImageResponseNode, ResponseNode } from "../types/GraphCanvas.types";
import { createNode, TreeManager } from "../interfaces/TreeManager";
import { findFreePosition, getDefaultNodeDimensions } from "../utils/placement";
import { aiService, StreamResponse } from "../interfaces/aiService";
import { useAppSelector } from "../store/hooks";
import logger from "../utils/logger";
import { cascadeUpdateDescendants } from "../utils/cascadeUpdate";

interface UseAIChatProps {
  graphCanvasRef: React.RefObject<GraphCanvasRef | null>;
}

interface UseAIChatReturn {
  onInputSubmit: (query: string, caller: GraphNode) => Promise<void>;
}

export function useAIChat({ graphCanvasRef }: UseAIChatProps): UseAIChatReturn {
  const selectedModel = useAppSelector((state) => state.settings.selectedModel);
  const selectedImageModel = useAppSelector((state) => state.settings.selectedImageModel);
  const webSearchEnabled = useAppSelector((state) => state.settings.webSearchEnabled);

  const handleCascadeUpdate = useCallback(
    async (startNodeId: string, currentNodes: GraphNodes) => {
      const treeManager = graphCanvasRef.current?.treeManager;
      if (!treeManager) return;

      await cascadeUpdateDescendants({
        startNodeId,
        currentNodes,
        treeManager,
        selectedModel,
        selectedImageModel,
        webSearchEnabled,
      });
    },
    [graphCanvasRef, selectedModel, selectedImageModel, webSearchEnabled]
  );

  const onInputSubmit = useCallback(
    async (query: string, caller: GraphNode) => {
      const logData: {
        query?: string;
        callerId?: string;
        callerType?: string;
        responseNodeId?: string;
        isNewNode?: boolean;
        model?: string;
        totalChunks?: number;
        resultType?: string;
        contentLength?: number;
        contentPreview?: string;
        youtubeVideosCount?: number;
        youtubeVideoIds?: string[];
        imageGenerated?: boolean;
        imagePrompt?: string;
        error?: string;
      } = {};

      const nodesRef = graphCanvasRef.current?.nodesRef;
      const nodeDimensionsRef = graphCanvasRef.current?.nodeDimensionsRef;
      const treeManager = graphCanvasRef.current?.treeManager;
      if (!nodesRef || !nodeDimensionsRef || !treeManager) return;

      // Get the current node from nodesRef to use up-to-date position (may have been moved by collision resolution)
      const currentCaller = nodesRef.current[caller.id] || caller;

      // Find the first response child node (text or image)
      const existingResponseNodeId = currentCaller.childrenIds.find((childId: string) => {
        const childNode = nodesRef.current[childId];
        return childNode?.type === "response" || childNode?.type === "image-response";
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
        const existingNode = nodesRef.current[responseNodeId];
        const patch: { value: string; error: undefined; reasoning?: undefined } = { value: "", error: undefined };
        if (existingNode?.type === "response") {
          patch.reasoning = undefined;
        }
        treeManager.patchNode(responseNodeId, patch);
        responseNode = nodesRef.current[responseNodeId];
      } else {
        // create a new response node with smart placement - close to parent
        const callerDim =
          nodeDimensionsRef.current[caller.id] ||
          getDefaultNodeDimensions(caller.type);

        const targetX = currentCaller.x + callerDim.width / 4;
        const targetY = currentCaller.y + callerDim.height + 30;

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

      // Track if we receive an image response, and collect youtube videos
      let imageResult: { url: string; prompt?: string } | null = null;
      const youtubeVideos: Array<{ videoId: string; explanation?: string }> = [];

      logData.query = query.substring(0, 100);
      logData.callerId = caller.id.substring(0, 8);
      logData.callerType = caller.type;
      logData.responseNodeId = responseNodeId.substring(0, 8);
      logData.isNewNode = !existingResponseNodeId;
      logData.model = selectedModel;

      // Send the query - use the locally updated nodes object
      let mainChunkCount = 0;
      const result = await aiService
        .streamChat(
          TreeManager.buildChatML(nodesWithQuery, updatedCaller),
          (response) => {
            mainChunkCount++;
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
          { model: selectedModel, imageModel: selectedImageModel, webSearchEnabled },
          // onImage callback - called when image tool is detected (before generation)
          (imageUrl, prompt) => {
            logData.imageGenerated = true;
            logData.imagePrompt = prompt;
            logger.image(imageUrl, `Input response ${responseNodeId.substring(0, 8)}`, { prompt });
            
            // Immediately swap to image-response type to show image loading animation
            treeManager.patchNode(responseNodeId, {
              type: "image-response",
              value: "",
              error: undefined,
            });
            nodesWithQuery[responseNodeId] = {
              ...nodesWithQuery[responseNodeId],
              type: "image-response",
              value: "",
              error: undefined,
            };
            
            imageResult = { url: imageUrl, prompt };
          },
          // onReasoning callback - called when reasoning tokens are streamed
          (reasoning) => {
            if (nodesWithQuery[responseNodeId]?.type === 'response') {
              treeManager.patchNode(responseNodeId, {
                reasoning,
              });
              nodesWithQuery[responseNodeId] = {
                ...nodesWithQuery[responseNodeId],
                reasoning,
              } as GraphNode;
            }
          },
          // onYoutube callback - called when YouTube video tool is detected
          (videoId, explanation) => {
            // Collect all YouTube videos - can be multiple
            youtubeVideos.push({ videoId, explanation });
          }
        )
        .catch((error) => {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          logData.error = errorMessage;
          treeManager.patchNode(responseNodeId, { error: errorMessage });
          nodesWithQuery[responseNodeId] = {
            ...nodesWithQuery[responseNodeId],
            error: errorMessage,
          };
          return null;
        });

      // If the request failed, don't create follow-up nodes or cascade updates
      if (result === null) {
        logger.error('[INPUT] Stream failed', logData);
        return;
      }

      logData.totalChunks = mainChunkCount;
      logData.resultType = result.type;
      logData.contentLength = result.content?.length || 0;
      logData.contentPreview = result.content?.substring(0, 100) || '';
      logData.youtubeVideosCount = youtubeVideos.length;
      logData.youtubeVideoIds = youtubeVideos.map(v => v.videoId);

      // Handle image response - convert the response node to an image-response node in-place
      if (result.type === "image") {
        logger.image(result.content, `Final input image ${responseNodeId.substring(0, 8)}`, {
          prompt: result.prompt,
          responseNodeId,
        });
        
        // Patch the existing node to change its type to image-response
        treeManager.patchNode(responseNodeId, {
          type: "image-response",
          value: result.content,
          prompt: result.prompt,
        });
        nodesWithQuery[responseNodeId] = {
          ...nodesWithQuery[responseNodeId],
          type: "image-response",
          value: result.content,
          prompt: result.prompt,
        };
        responseNode = nodesWithQuery[responseNodeId];
      } else {
        // For text responses, ensure type is "response"
        // If we only got YouTube videos and no meaningful text, show a default message
        const cleanedContent = result.content.replace(/\[YOUTUBE:[^\]]+\]/g, '').trim();
        const finalValue = cleanedContent.length > 0 
          ? result.content 
          : (youtubeVideos.length > 0 ? `Here ${youtubeVideos.length === 1 ? 'is' : 'are'} ${youtubeVideos.length} video${youtubeVideos.length === 1 ? '' : 's'} that should help:` : result.content);
        
        treeManager.patchNode(responseNodeId, {
          type: "response",
          value: finalValue,
        });
        nodesWithQuery[responseNodeId] = {
          ...nodesWithQuery[responseNodeId],
          type: "response",
          value: finalValue,
        };
        responseNode = nodesWithQuery[responseNodeId];
      }

      // Create YouTube nodes if any were collected during streaming
      if (youtubeVideos.length > 0) {
        // Get the response node dimensions for placement calculation
        const responseNodeDim =
          nodeDimensionsRef.current[responseNodeId] ||
          getDefaultNodeDimensions(responseNode.type);

        // Create YouTube nodes in a grid layout (max 2 per row)
        const youtubeNodeDim = getDefaultNodeDimensions("youtube");
        const horizontalGap = 30;
        const verticalGap = 30;
        const videosPerRow = 2;
        
        // Calculate starting position - center the grid below the response
        const numRows = Math.ceil(youtubeVideos.length / videosPerRow);
        const firstRowCount = Math.min(youtubeVideos.length, videosPerRow);
        const firstRowWidth = firstRowCount * youtubeNodeDim.width + (firstRowCount - 1) * horizontalGap;
        const startX = responseNode.x + (responseNodeDim.width / 2) - (firstRowWidth / 2);
        const startY = responseNode.y + responseNodeDim.height + 40;

        youtubeVideos.forEach((video, index) => {
          const row = Math.floor(index / videosPerRow);
          const col = index % videosPerRow;
          
          // Calculate videos in current row for centering
          const videosInRow = Math.min(videosPerRow, youtubeVideos.length - row * videosPerRow);
          const rowWidth = videosInRow * youtubeNodeDim.width + (videosInRow - 1) * horizontalGap;
          const rowStartX = responseNode.x + (responseNodeDim.width / 2) - (rowWidth / 2);
          
          const targetX = rowStartX + col * (youtubeNodeDim.width + horizontalGap);
          const targetY = startY + row * (youtubeNodeDim.height + verticalGap);

          const freePos = findFreePosition(
            targetX,
            targetY,
            youtubeNodeDim.width,
            youtubeNodeDim.height,
            nodesWithQuery,
            nodeDimensionsRef.current,
            "below"
          );

          const youtubeNode = createNode("youtube", freePos.x, freePos.y);
          treeManager.addNode(youtubeNode);
          treeManager.patchNode(youtubeNode.id, {
            value: video.videoId,
            explanation: video.explanation,
          });
          treeManager.linkNodes(responseNodeId, youtubeNode.id);
          nodesWithQuery[youtubeNode.id] = {
            ...youtubeNode,
            value: video.videoId,
            explanation: video.explanation,
          };
        });
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

        // Calculate the center X of the response node
        const responseNodeCenterX = currentResponseNode.x + responseNodeDim.width / 2;
        
        // Place directly below the response node (and any YouTube videos)
        const newNodeDim = getDefaultNodeDimensions("input");
        const targetX = responseNodeCenterX - newNodeDim.width / 2;
        let targetY = currentResponseNode.y + responseNodeDim.height + 90;
        
        // If there are YouTube videos, place the input below them (accounting for grid layout)
        if (youtubeVideos.length > 0) {
          const youtubeNodeDim = getDefaultNodeDimensions("youtube");
          const videosPerRow = 2;
          const numRows = Math.ceil(youtubeVideos.length / videosPerRow);
          const verticalGap = 30;
          // Add space for all rows of videos
          targetY += numRows * (youtubeNodeDim.height + verticalGap) + 50;
        }

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
      await handleCascadeUpdate(responseNodeId, nodesWithQuery);

      logger.info('[INPUT] Stream completed', logData);
    },
    [graphCanvasRef, handleCascadeUpdate, selectedModel, selectedImageModel, webSearchEnabled]
  );

  return {
    onInputSubmit,
  };
}
