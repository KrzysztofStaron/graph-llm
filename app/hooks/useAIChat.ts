import { useCallback, useEffect, useRef } from "react";
import { GraphCanvasRef } from "../app/GraphCanvas/GraphCanvas";
import { GraphNode, GraphNodes, NodeDimensions } from "../types/GraphCanvas.types";
import { createNode, TreeManager } from "../interfaces/TreeManager";
import {
  getDefaultNodeDimensions,
  hasRenderableContent,
  placeCenteredBelowOrForce,
} from "../utils/placement";
import { imageHasLayoutSize } from "../utils/imageLayoutReady";
import { aiService } from "../interfaces/aiService";
import { useAppSelector } from "../store/hooks";
import logger from "../utils/logger";
import { cascadeUpdateDescendants } from "../utils/cascadeUpdate";

function readDomNodeSize(nodeId: string): { width: number; height: number } | undefined {
  const element = document.querySelector(`[data-node-id="${nodeId}"]`);
  if (!(element instanceof HTMLElement)) {
    return undefined;
  }
  const width = element.offsetWidth;
  const height = element.offsetHeight;
  if (width <= 0 || height <= 0) {
    return undefined;
  }
  return { width, height };
}

function alignChildUnderParent(args: {
  child: GraphNode;
  parentId: string;
  nodes: GraphNodes;
  dimensions: NodeDimensions;
}): { node: GraphNode; dimensions: NodeDimensions } {
  const parent = args.nodes[args.parentId];
  const childDim = readDomNodeSize(args.child.id) ?? args.dimensions[args.child.id];
  const parentDim = parent
    ? (readDomNodeSize(parent.id) ?? args.dimensions[parent.id])
    : undefined;
  if (!parent || !childDim || !parentDim) {
    return { node: args.child, dimensions: args.dimensions };
  }
  const dimensions = {
    ...args.dimensions,
    [args.child.id]: childDim,
    [parent.id]: parentDim,
  };
  const placed = placeCenteredBelowOrForce({
    parentX: parent.x,
    parentY: parent.y,
    parentWidth: parentDim.width,
    parentHeight: parentDim.height,
    childWidth: childDim.width,
    childHeight: childDim.height,
    nodes: args.nodes,
    dimensions,
    ignoreIds: [args.child.id, ...args.child.childrenIds],
  });
  return {
    node: { ...args.child, x: placed.x, y: placed.y },
    dimensions,
  };
}

function commitAlignedNode(args: {
  node: GraphNode;
  parent: GraphNode;
  nodesRef: { current: GraphNodes };
  nodeDimensionsRef: { current: NodeDimensions };
  treeManager: TreeManager;
  nodesWithQuery: GraphNodes;
}): GraphNode {
  const current = args.nodesRef.current[args.node.id] ?? args.node;
  const parent = args.nodesRef.current[args.parent.id] ?? args.parent;
  const aligned = alignChildUnderParent({
    child: current,
    parentId: parent.id,
    nodes: {
      ...args.nodesRef.current,
      [parent.id]: parent,
      [current.id]: current,
    },
    dimensions: args.nodeDimensionsRef.current,
  });
  args.nodeDimensionsRef.current = aligned.dimensions;
  args.treeManager.patchNode(args.node.id, {
    x: aligned.node.x,
    y: aligned.node.y,
  });
  args.nodesRef.current[args.node.id] = aligned.node;
  args.nodesWithQuery[args.node.id] = aligned.node;
  return aligned.node;
}

function scheduleAlignWhenPainted(args: {
  nodeId: string;
  parent: GraphNode;
  nodesRef: { current: GraphNodes };
  nodeDimensionsRef: { current: NodeDimensions };
  treeManager: TreeManager;
  nodesWithQuery: GraphNodes;
}) {
  let attempts = 0;
  const tick = () => {
    attempts += 1;
    const current = args.nodesRef.current[args.nodeId];
    const size = readDomNodeSize(args.nodeId);
    if (current && size && size.width > 20) {
      commitAlignedNode({
        node: current,
        parent: args.parent,
        nodesRef: args.nodesRef,
        nodeDimensionsRef: args.nodeDimensionsRef,
        treeManager: args.treeManager,
        nodesWithQuery: args.nodesWithQuery,
      });
    }
    if (attempts < 30) {
      requestAnimationFrame(tick);
    }
  };
  requestAnimationFrame(tick);
}

function waitForPaintedImage(nodeId: string): Promise<void> {
  return new Promise((resolve) => {
    const started = performance.now();
    const poll = () => {
      if (imageHasLayoutSize(nodeId) || performance.now() - started > 15000) {
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
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export function useAIChat({ graphCanvasRef }: UseAIChatProps): UseAIChatReturn {
  const selectedModel = useAppSelector((state) => state.settings.selectedModel);
  const selectedImageModel = useAppSelector((state) => state.settings.selectedImageModel);
  const webSearchEnabled = useAppSelector((state) => state.settings.webSearchEnabled);
  const abortByResponseIdRef = useRef(new Map<string, AbortController>());

  const abortStream = useCallback((responseId: string) => {
    const existing = abortByResponseIdRef.current.get(responseId);
    if (!existing) return;
    existing.abort();
    abortByResponseIdRef.current.delete(responseId);
  }, []);

  useEffect(() => {
    const abortMap = abortByResponseIdRef.current;
    return () => {
      for (const controller of abortMap.values()) {
        controller.abort();
      }
      abortMap.clear();
    };
  }, []);

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
        errorName?: string;
        errorStack?: string;
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
        responseNodeId = existingResponseNodeId;
        abortStream(responseNodeId);
        const existingNode = nodesRef.current[responseNodeId];
        if (!existingNode) return;
        const patch: {
          value: string;
          error: undefined;
          status: "streaming";
          reasoning?: undefined;
        } = { value: "", error: undefined, status: "streaming" };
        if (existingNode.type === "response") {
          patch.reasoning = undefined;
        }
        treeManager.patchNode(responseNodeId, patch);
        responseNode = { ...existingNode, ...patch };
        nodesWithQuery[responseNodeId] = responseNode;
        scheduleAlignWhenPainted({
          nodeId: responseNodeId,
          parent: currentCaller,
          nodesRef,
          nodeDimensionsRef,
          treeManager,
          nodesWithQuery,
        });
      } else {
        // create a new response node with smart placement - close to parent
        const callerDim =
          readDomNodeSize(caller.id) ?? nodeDimensionsRef.current[caller.id];
        const freePos = placeCenteredBelowOrForce({
          parentX: currentCaller.x,
          parentY: currentCaller.y,
          parentWidth: callerDim?.width ?? 0,
          parentHeight: callerDim?.height ?? 0,
          childWidth: 1,
          childHeight: 1,
          nodes: nodesWithQuery,
          dimensions: nodeDimensionsRef.current,
        });

        const newNode = {
          ...createNode("response", freePos.x, freePos.y),
          parentIds: [caller.id],
        };
        responseNodeId = newNode.id;
        const streamingNode = { ...newNode, status: "streaming" as const };
        treeManager.addNode(streamingNode);
        treeManager.linkNodes(caller.id, newNode.id);
        nodesRef.current[streamingNode.id] = streamingNode;

        responseNode = streamingNode;
        nodesWithQuery[newNode.id] = streamingNode;
        nodesWithQuery[caller.id] = {
          ...nodesWithQuery[caller.id],
          childrenIds: nodesWithQuery[caller.id].childrenIds.includes(newNode.id)
            ? nodesWithQuery[caller.id].childrenIds
            : [...nodesWithQuery[caller.id].childrenIds, newNode.id],
        };
        scheduleAlignWhenPainted({
          nodeId: responseNodeId,
          parent: currentCaller,
          nodesRef,
          nodeDimensionsRef,
          treeManager,
          nodesWithQuery,
        });
      }

      const streamController = new AbortController();
      abortByResponseIdRef.current.set(responseNodeId, streamController);

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
              status: "streaming",
            });
            const live = nodesWithQuery[responseNodeId];
            if (live) {
              nodesWithQuery[responseNodeId] = {
                ...live,
                value: response,
                error: undefined,
                status: "streaming",
              };
            }
          },
          { model: selectedModel, imageModel: selectedImageModel, webSearchEnabled, signal: streamController.signal },
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
              status: "streaming",
            });
            const live = nodesWithQuery[responseNodeId];
            if (live) {
              nodesWithQuery[responseNodeId] = {
                ...live,
                type: "image-response",
                value: "",
                error: undefined,
                status: "streaming",
              };
            }
            
            imageResult = { url: imageUrl, prompt };
            scheduleAlignWhenPainted({
              nodeId: responseNodeId,
              parent: currentCaller,
              nodesRef,
              nodeDimensionsRef,
              treeManager,
              nodesWithQuery,
            });
          },
          // onReasoning callback - called when reasoning tokens are streamed
          (reasoning) => {
            const live = nodesWithQuery[responseNodeId];
            if (live?.type !== "response") return;
            treeManager.patchNode(responseNodeId, {
              reasoning,
            });
            nodesWithQuery[responseNodeId] = {
              ...live,
              reasoning,
            };
          },
          // onYoutube callback - called when YouTube video tool is detected
          (videoId, explanation) => {
            // Collect all YouTube videos - can be multiple
            youtubeVideos.push({ videoId, explanation });
          }
        )
        .catch((error) => {
          abortByResponseIdRef.current.delete(responseNodeId);
          if (isAbortError(error)) return "aborted";
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          const errorName = error instanceof Error ? error.name : 'Unknown';
          const errorStack = error instanceof Error ? error.stack : undefined;
          
          logData.error = errorMessage;
          logData.errorName = errorName;
          logData.errorStack = errorStack;
          
          treeManager.patchNode(responseNodeId, { error: errorMessage, status: "error" });
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

      // If the request failed, don't create follow-up nodes or cascade updates
      abortByResponseIdRef.current.delete(responseNodeId);
      if (result === "aborted") return;
      if (result === null) {
        const errorMessage = logData.error || 'Unknown error';
        logger.error(`[INPUT_STREAM] [FAIL] Input Stream Failed: ${errorMessage}`, logData);
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
          status: "done",
        });
        nodesWithQuery[responseNodeId] = {
          ...nodesWithQuery[responseNodeId],
          type: "image-response",
          value: result.content,
          prompt: result.prompt,
          status: "done",
        };
        await waitForPaintedImage(responseNodeId);
        responseNode = commitAlignedNode({
          node: nodesRef.current[responseNodeId] ?? nodesWithQuery[responseNodeId],
          parent: currentCaller,
          nodesRef,
          nodeDimensionsRef,
          treeManager,
          nodesWithQuery,
        });
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
          status: "done",
        });
        nodesWithQuery[responseNodeId] = {
          ...nodesWithQuery[responseNodeId],
          type: "response",
          value: finalValue,
          status: "done",
        };
        responseNode = commitAlignedNode({
          node: nodesRef.current[responseNodeId] ?? nodesWithQuery[responseNodeId],
          parent: currentCaller,
          nodesRef,
          nodeDimensionsRef,
          treeManager,
          nodesWithQuery,
        });
      }

      // Create YouTube nodes if any were collected during streaming
      if (youtubeVideos.length > 0) {
        const responseDim =
          readDomNodeSize(responseNodeId) ?? nodeDimensionsRef.current[responseNodeId];
        const youtubeSize = getDefaultNodeDimensions("youtube");
        youtubeVideos.forEach((video) => {
          const freePos = placeCenteredBelowOrForce({
            parentX: responseNode.x,
            parentY: responseNode.y,
            parentWidth: responseDim?.width ?? 0,
            parentHeight: responseDim?.height ?? 0,
            childWidth: youtubeSize.width,
            childHeight: youtubeSize.height,
            nodes: nodesWithQuery,
            dimensions: nodeDimensionsRef.current,
          });

          const youtubeNode = {
            ...createNode("youtube", freePos.x, freePos.y),
            parentIds: [responseNodeId],
          };
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
      const finishedNode =
        nodesRef.current[responseNodeId] || nodesWithQuery[responseNodeId];
      if (!finishedNode) return;
      const alreadyHasFollowUp =
        finishedNode.childrenIds.some(
          (childId) => nodesRef.current[childId]?.type === "input"
        ) ||
        Object.values(nodesWithQuery).some(
          (node) => node.type === "input" && node.parentIds.includes(responseNodeId)
        );
      if (hasRenderableContent(finishedNode) && !alreadyHasFollowUp) {
        const responseDim =
          readDomNodeSize(responseNodeId) ?? nodeDimensionsRef.current[responseNodeId];
        const inputSize = getDefaultNodeDimensions("input");
        const freePos = placeCenteredBelowOrForce({
          parentX: finishedNode.x,
          parentY: finishedNode.y,
          parentWidth: responseDim?.width ?? 0,
          parentHeight: responseDim?.height ?? 0,
          childWidth: inputSize.width,
          childHeight: inputSize.height,
          nodes: nodesWithQuery,
          dimensions: nodeDimensionsRef.current,
        });

        const newInputNode = {
          ...createNode("input", freePos.x, freePos.y),
          parentIds: [responseNodeId],
        };

        treeManager.addNode(newInputNode);
        treeManager.linkNodes(responseNodeId, newInputNode.id);
        nodesWithQuery[newInputNode.id] = newInputNode;
      }

      // Cascading updates: find all descendant response nodes and update them level by level
      await handleCascadeUpdate(responseNodeId, nodesWithQuery);

      // Comprehensive completion log with observability status
      const completionType = result.type === "image" ? 'Image' : 'Text';
      const nodeCount = Object.keys(nodesWithQuery).length;
      const finalMessage = `Input Flow Complete: ${completionType} response (${logData.totalChunks} chunks, ${youtubeVideos.length} videos, ${nodeCount} total nodes)`;
      
      logger.info(`[INPUT_STREAM] [OK] ${finalMessage}`, {
        ...logData,
        nodeCount,
        finalMessage,
      });
    },
    [abortStream, graphCanvasRef, handleCascadeUpdate, selectedModel, selectedImageModel, webSearchEnabled]
  );

  return {
    onInputSubmit,
  };
}
