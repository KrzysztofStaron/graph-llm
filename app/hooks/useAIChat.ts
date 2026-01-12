import { useCallback } from "react";
import { GraphCanvasRef } from "../app/GraphCanvas/GraphCanvas";
import { GraphNode, GraphNodes, ImageResponseNode } from "../types/";
import { createNode, TreeManager } from "../interfaces/TreeManager";
import { findFreePosition, getDefaultNodeDimensions } from "../utils/placement";
import { aiService, StreamResponse } from "../interfaces/aiService";
import { useAppSelector } from "../store/hooks";
import logger from "../utils/logger";

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
          const patch: { value: string; error: undefined; reasoning?: undefined } = { value: "", error: undefined };
          if (node.type === "response") {
            patch.reasoning = undefined;
          }
          treeManager.patchNode(node.id, patch);
          const updatedNode = {
            ...currentNodes[node.id],
            value: "",
            error: undefined,
          };
          if (node.type === "response") {
            (updatedNode as any).reasoning = undefined;
          }
          currentNodes[node.id] = updatedNode as GraphNode;
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
    },
    [graphCanvasRef, selectedModel, selectedImageModel, webSearchEnabled]
  );

  const onInputSubmit = useCallback(
    async (query: string, caller: GraphNode) => {
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

        console.log('callerDim', callerDim);
        console.log('currentCaller', currentCaller);

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

      logger.info('[INPUT] Starting AI stream for user input', {
        query: query.substring(0, 100),
        callerId: caller.id.substring(0, 8),
        callerType: caller.type,
        responseNodeId: responseNodeId.substring(0, 8),
        isNewNode: !existingResponseNodeId,
        model: selectedModel,
      });

      // Send the query - use the locally updated nodes object
      let mainChunkCount = 0;
      const result = await aiService
        .streamChat(
          TreeManager.buildChatML(nodesWithQuery, updatedCaller),
          (response) => {
            mainChunkCount++;
            if (mainChunkCount === 1 || mainChunkCount % 10 === 0) {
              logger.debug('[INPUT] Streaming chunk', {
                chunkNumber: mainChunkCount,
                currentLength: response.length,
                preview: response.substring(response.length - 50),
              });
            }
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
            logger.info('[INPUT] Image generation triggered', {
              responseNodeId: responseNodeId.substring(0, 8),
              prompt,
            });
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
            logger.info('[INPUT] YouTube video callback triggered', {
              videoId,
              explanation,
              currentCount: youtubeVideos.length,
              newCount: youtubeVideos.length + 1,
            });
            
            // Collect all YouTube videos - can be multiple
            youtubeVideos.push({ videoId, explanation });
            
            logger.info('[INPUT] YouTube video added to array', {
              totalVideos: youtubeVideos.length,
              allVideoIds: youtubeVideos.map(v => v.videoId),
            });
          }
        )
        .catch((error) => {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          logger.error('[INPUT] Stream error', {
            responseNodeId: responseNodeId.substring(0, 8),
            error: errorMessage,
          });
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

      logger.info('[INPUT] Stream completed', {
        responseNodeId: responseNodeId.substring(0, 8),
        resultType: result.type,
        totalChunks: mainChunkCount,
        contentLength: result.content?.length || 0,
        contentPreview: result.content?.substring(0, 100) || '',
        youtubeVideosCount: youtubeVideos.length,
        youtubeVideoIds: youtubeVideos.map(v => v.videoId),
      });

      logger.info('[INPUT] About to process YouTube videos', {
        hasVideos: youtubeVideos.length > 0,
        videoCount: youtubeVideos.length,
        videos: youtubeVideos,
      });

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
        logger.info('[INPUT] Creating YouTube nodes', {
          count: youtubeVideos.length,
          videos: youtubeVideos.map(v => v.videoId),
        });

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

        // Place directly below the response node (and any YouTube videos)
        const targetX = currentResponseNode.x;
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
    [graphCanvasRef, cascadeUpdateDescendants, selectedModel, selectedImageModel, webSearchEnabled]
  );

  return {
    onInputSubmit,
  };
}
