import { useState, useCallback, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import { createNode } from "../hooks/useGraphCanvas";
import { TreeManager } from "../interfaces/TreeManager";
import { GraphCanvas } from "./GraphCanvas";
import { ContextSidebar } from "./ContextSidebar";
import { GraphNode, GraphNodes } from "../types/graph";
import { aiService } from "../interfaces/aiService";
import {
  GraphCanvasProvider,
  useGraphCanvasContext,
} from "../hooks/GraphCanvasContext";
import { findFreePosition, getDefaultNodeDimensions } from "../utils/placement";
import { compressImage } from "../utils/imageCompression";
import { ContextMenu, ContextMenuItem } from "../components/ui/ContextMenu";
import { parseDocumentWithFallback } from "../utils/documentParserClient";
import { AudioPlayerIndicator } from "../components/ui/AudioPlayerIndicator";
import { useAudioPlayer } from "../hooks/useAudioPlayer";

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
    setNodeDimensions,
    nodeDimensionsRef,
    selectedNodeIds,
    clearSelection,
  } = useGraphCanvasContext();

  // Context node editing state
  const [editingContextNodeId, setEditingContextNodeId] = useState<
    string | null
  >(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    x: number;
    y: number;
    target: { kind: "canvas" } | { kind: "node"; nodeId: string };
    canvasX: number;
    canvasY: number;
  } | null>(null);

  // File input ref for upload context
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Audio playback hook
  const {
    isPlayingAudio,
    isLoadingAudio,
    playAudio,
    stopAudio,
    currentWordIndex,
    words: audioWords,
  } = useAudioPlayer();

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

  const handleRequestNodeMove = useCallback(
    (nodeId: string, dx: number, dy: number) => {
      treeManager.moveNode(nodeId, dx, dy);
    },
    [treeManager]
  );

  const handleRequestContextMenu = useCallback(
    (clientX: number, clientY: number, nodeId?: string) => {
      // Convert client coordinates to canvas coordinates
      const canvasX = (clientX - transform.x) / transform.k;
      const canvasY = (clientY - transform.y) / transform.k;

      setContextMenu({
        isOpen: true,
        x: clientX,
        y: clientY,
        target: nodeId ? { kind: "node", nodeId } : { kind: "canvas" },
        canvasX,
        canvasY,
      });
    },
    [transform]
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Context menu actions - Delete handlers
  const handleDeleteSingle = useCallback(
    (nodeId: string) => {
      treeManager.deleteNodeDetach(nodeId);
    },
    [treeManager]
  );

  const handleDeleteSingleWithChildren = useCallback(
    (nodeId: string) => {
      treeManager.deleteNode(nodeId);
    },
    [treeManager]
  );

  const handleDeleteAll = useCallback(
    (selectedNodeIds: Set<string>) => {
      selectedNodeIds.forEach((nodeId) => {
        treeManager.deleteNodeDetach(nodeId);
      });
    },
    [treeManager]
  );

  const handleDeleteAllWithChildren = useCallback(
    (selectedNodeIds: Set<string>) => {
      selectedNodeIds.forEach((nodeId) => {
        treeManager.deleteNode(nodeId);
      });
    },
    [treeManager]
  );

  // Context menu actions - Creation handlers
  const handleNewQuestionOnCanvas = useCallback(() => {
    if (!contextMenu) return;

    const newNodeDim = getDefaultNodeDimensions("input");
    const freePos = findFreePosition(
      contextMenu.canvasX,
      contextMenu.canvasY,
      newNodeDim.width,
      newNodeDim.height,
      nodesRef.current,
      nodeDimensionsRef.current,
      "below"
    );

    const newInputNode = createNode("input", freePos.x, freePos.y);
    treeManager.addNode(newInputNode);
    nodesRef.current = { ...nodesRef.current, [newInputNode.id]: newInputNode };
  }, [contextMenu, treeManager, nodesRef, nodeDimensionsRef]);

  const handleAskQuestion = useCallback(() => {
    if (!contextMenu) return;

    let eligibleParentIds: string[] = [];

    // If nodes are selected, use selected nodes
    if (selectedNodeIds.size > 0) {
      eligibleParentIds = Array.from(selectedNodeIds).filter((nodeId) => {
        const node = nodes[nodeId];
        return node && node.type !== "input";
      });
    } else if (contextMenu.target.kind === "node") {
      // If no nodes selected but right-clicking a node, use that node if it's non-input
      const clickedNode = nodes[contextMenu.target.nodeId];
      if (clickedNode && clickedNode.type !== "input") {
        eligibleParentIds = [clickedNode.id];
      }
    }

    if (eligibleParentIds.length === 0) return;

    // Calculate target position - if right-clicking on a node, place directly below it
    let targetX = contextMenu.canvasX;
    let targetY = contextMenu.canvasY;

    if (contextMenu.target.kind === "node") {
      const clickedNode = nodes[contextMenu.target.nodeId];
      if (clickedNode) {
        const nodeDim =
          nodeDimensionsRef.current[clickedNode.id] ||
          getDefaultNodeDimensions(clickedNode.type);

        // Calculate node center X position
        const nodeCenterX = clickedNode.x + nodeDim.width / 2;

        // Determine if click was to the left or right of center
        const clickOffset = contextMenu.canvasX - nodeCenterX;

        // Place directly below, but offset slightly based on click position
        // Use a small offset (e.g., 40px) to the left or right based on click position
        const horizontalOffset =
          clickOffset < 0 ? -80 : clickOffset > 0 ? 80 : 0;

        targetX = clickedNode.x + horizontalOffset;
        targetY = clickedNode.y + nodeDim.height + 30;
      }
    }

    const newNodeDim = getDefaultNodeDimensions("input");
    const freePos = findFreePosition(
      targetX,
      targetY,
      newNodeDim.width,
      newNodeDim.height,
      nodesRef.current,
      nodeDimensionsRef.current,
      "below"
    );

    const newInputNode = createNode("input", freePos.x, freePos.y);
    treeManager.addNode(newInputNode);
    nodesRef.current = { ...nodesRef.current, [newInputNode.id]: newInputNode };

    // Link all eligible parent nodes
    eligibleParentIds.forEach((parentId) => {
      treeManager.linkNodes(parentId, newInputNode.id);
    });
  }, [
    contextMenu,
    treeManager,
    nodesRef,
    nodeDimensionsRef,
    selectedNodeIds,
    nodes,
  ]);

  const handleAddContext = useCallback(() => {
    if (!contextMenu) return;

    let targetX = contextMenu.canvasX;
    let targetY = contextMenu.canvasY;

    // If right-clicking on a node, place directly below it
    if (contextMenu.target.kind === "node") {
      const clickedNode = nodes[contextMenu.target.nodeId];
      if (clickedNode) {
        const nodeDim =
          nodeDimensionsRef.current[clickedNode.id] ||
          getDefaultNodeDimensions(clickedNode.type);
        targetX = clickedNode.x;
        targetY = clickedNode.y + nodeDim.height + 30;
      }
    }

    const newNodeDim = getDefaultNodeDimensions("context");
    const freePos = findFreePosition(
      targetX,
      targetY,
      newNodeDim.width,
      newNodeDim.height,
      nodesRef.current,
      nodeDimensionsRef.current,
      "below"
    );

    const newContextNode = createNode("context", freePos.x, freePos.y);
    treeManager.addNode(newContextNode);
    nodesRef.current = {
      ...nodesRef.current,
      [newContextNode.id]: newContextNode,
    };
  }, [contextMenu, treeManager, nodesRef, nodeDimensionsRef, nodes]);

  const onDropFilesAsContext = useCallback(
    async (files: FileList, canvasPoint: { x: number; y: number }) => {
      const acceptedExtensions = [".txt", ".md", ".json", ".csv"];
      const documentExtensions = [
        ".pdf",
        ".docx",
        ".pptx",
        ".xlsx",
        ".html",
        ".htm",
      ];
      const fileArray = Array.from(files);

      // Separate file types
      const imageFiles = fileArray.filter((file) =>
        file.type.startsWith("image/")
      );
      // Include plain text files in document files now
      const documentFiles = fileArray.filter(
        (file) =>
          acceptedExtensions.some((ext) =>
            file.name.toLowerCase().endsWith(ext)
          ) ||
          documentExtensions.some((ext) =>
            file.name.toLowerCase().endsWith(ext)
          ) ||
          file.type === "application/pdf" ||
          file.type ===
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
          file.type ===
            "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
          file.type ===
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
          file.type === "text/html" ||
          file.type.startsWith("text/")
      );

      if (imageFiles.length === 0 && documentFiles.length === 0) return;

      let nodeIndex = 0;

      // Keep track of nodes as we create them for collision detection
      const workingNodes = { ...nodesRef.current };

      // Create image context nodes
      for (const file of imageFiles) {
        // Compress image before converting to data URL
        const dataUrl = await compressImage(file);

        // Stagger positions: prefer stacking vertically below, slight horizontal offset
        const targetX = canvasPoint.x + nodeIndex * 40;
        const targetY = canvasPoint.y + nodeIndex * 120;

        const newNodeDim = getDefaultNodeDimensions("image-context");
        const freePos = findFreePosition(
          targetX,
          targetY,
          newNodeDim.width,
          newNodeDim.height,
          workingNodes,
          nodeDimensionsRef.current,
          "below"
        );

        const newImageContextNode = createNode(
          "image-context",
          freePos.x,
          freePos.y
        );
        const nodeWithValue = { ...newImageContextNode, value: dataUrl };
        treeManager.addNode(nodeWithValue);
        workingNodes[nodeWithValue.id] = nodeWithValue;
        nodeIndex++;
      }

      // Create document nodes (includes plain text files now)
      for (const file of documentFiles) {
        // For plain text files (.txt, .md, .json, .csv), parse directly
        // For other document types, use the parser with fallback
        let parseResult;
        const isPlainText = acceptedExtensions.some((ext) =>
          file.name.toLowerCase().endsWith(ext)
        );

        if (isPlainText) {
          // Parse plain text files directly and format with filename
          const text = await file.text();
          parseResult = {
            text: `FILENAME:${file.name}\n\n${text}`,
            filename: file.name,
          };
        } else {
          // Use parser with fallback for other document types
          parseResult = await parseDocumentWithFallback(file);
        }

        if (parseResult.error) {
          console.error(`Failed to parse ${file.name}:`, parseResult.error);
          continue;
        }

        // Stagger positions: prefer stacking vertically below, slight horizontal offset
        const targetX = canvasPoint.x + nodeIndex * 40;
        const targetY = canvasPoint.y + nodeIndex * 120;

        const newNodeDim = getDefaultNodeDimensions("document");
        const freePos = findFreePosition(
          targetX,
          targetY,
          newNodeDim.width,
          newNodeDim.height,
          workingNodes,
          nodeDimensionsRef.current,
          "below"
        );

        const newDocumentNode = createNode("document", freePos.x, freePos.y);
        const nodeWithValue = {
          ...newDocumentNode,
          value: parseResult.text,
        };
        treeManager.addNode(nodeWithValue);
        workingNodes[nodeWithValue.id] = nodeWithValue;
        nodeIndex++;
      }
    },
    [treeManager, nodesRef, nodeDimensionsRef]
  );

  const uploadContextCanvasPointRef = useRef<{ x: number; y: number } | null>(
    null
  );

  const handleUploadContext = useCallback(() => {
    // Store canvas coordinates before opening file dialog (context menu will close)
    if (contextMenu) {
      uploadContextCanvasPointRef.current = {
        x: contextMenu.canvasX,
        y: contextMenu.canvasY,
      };
    }
    fileInputRef.current?.click();
  }, [contextMenu]);

  const handleFileInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      // Use stored canvas coordinates
      const canvasPoint = uploadContextCanvasPointRef.current;
      if (!canvasPoint) return;

      await onDropFilesAsContext(files, canvasPoint);

      // Reset the input so the same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      // Clear the stored coordinates
      uploadContextCanvasPointRef.current = null;
    },
    [onDropFilesAsContext]
  );

  // Handle Listen action - convert selected nodes' text to speech
  const handleListen = useCallback(() => {
    if (!contextMenu) return;

    // Get nodes to process
    let targetNodeIds: string[] = [];

    if (selectedNodeIds.size > 0) {
      // Use selected nodes
      targetNodeIds = Array.from(selectedNodeIds);
    } else if (contextMenu.target.kind === "node") {
      // Use the clicked node
      targetNodeIds = [contextMenu.target.nodeId];
    }

    if (targetNodeIds.length === 0) return;

    // Play audio with sorted nodes (nodes lower in tree play last)
    // Include timestamps for word-level highlighting
    playAudio(targetNodeIds, nodes, true);
  }, [contextMenu, selectedNodeIds, nodes, playAudio]);

  // Build context menu items based on state (acting upon nodes vs not acting upon nodes)
  // Note: Handlers use refs but are only called on user interaction, not during render
  const contextMenuItems: ContextMenuItem[] = (() => {
    if (!contextMenu) return [];

    const isActingUponNodes = selectedNodeIds.size > 0;

    // State 1: Acting upon nodes (when nodes are selected)
    if (isActingUponNodes) {
      const items: ContextMenuItem[] = [];

      // Check if at least one selected node is non-input
      const hasNonInputSelected = Array.from(selectedNodeIds).some((nodeId) => {
        const node = nodes[nodeId];
        return node && node.type !== "input";
      });

      // Show "Ask Question" only if at least one selected node is non-input
      if (hasNonInputSelected) {
        // eslint-disable-next-line react-hooks/refs
        items.push({ label: "Ask Question", onClick: handleAskQuestion });
      }

      // Show "Listen" for any selected nodes that have text content
      const hasTextContent = Array.from(selectedNodeIds).some((nodeId) => {
        const node = nodes[nodeId];
        return node && node.value && node.value.trim().length > 0;
      });
      if (hasTextContent) {
        items.push({ label: "Listen", onClick: handleListen });
      }

      // Determine delete options based on selection count
      if (selectedNodeIds.size <= 1) {
        // Single selection: use single node delete handlers
        const nodeId = Array.from(selectedNodeIds)[0];
        const node = nodes[nodeId];

        if (node) {
          // Always show "Delete"
          items.push({
            label: "Delete",
            onClick: () => handleDeleteSingle(nodeId),
          });

          // Show "Delete [ with children ]" if node has children
          if (node.childrenIds.length > 0) {
            items.push({
              label: "Delete [ with children ]",
              onClick: () => handleDeleteSingleWithChildren(nodeId),
            });
          }
        }
      } else {
        // Multiple selection: use delete all handlers
        // Check if at least one selected node has children
        const hasAnyChildren = Array.from(selectedNodeIds).some((nodeId) => {
          const node = nodes[nodeId];
          return node && node.childrenIds.length > 0;
        });

        // Always show "Delete All"
        items.push({
          label: "Delete All",
          onClick: () => handleDeleteAll(selectedNodeIds),
        });

        // Show "Delete All [ with children ]" if at least one node has children
        if (hasAnyChildren) {
          items.push({
            label: "Delete All [ with children ]",
            onClick: () => handleDeleteAllWithChildren(selectedNodeIds),
          });
        }
      }

      return items;
    }

    // State 2: Not acting upon nodes (when no nodes are selected)
    if (contextMenu.target.kind === "canvas") {
      return [
        { label: "New Question", onClick: handleNewQuestionOnCanvas },
        { label: "New Context", onClick: handleAddContext },
        { label: "Upload Context", onClick: handleUploadContext },
      ];
    }

    // Not acting upon nodes, but clicking on a specific node
    const node = nodes[contextMenu.target.nodeId];
    if (!node) return [];

    const items: ContextMenuItem[] = [];

    // Show "Ask Question" for non-input nodes (creates and links)
    if (node.type !== "input") {
      // eslint-disable-next-line react-hooks/refs
      items.push({ label: "Ask Question", onClick: handleAskQuestion });
    }

    // Show "Listen" if node has text content
    if (node.value && node.value.trim().length > 0) {
      items.push({ label: "Listen", onClick: handleListen });
    }

    // Always show "Delete"
    items.push({
      label: "Delete",
      onClick: () => handleDeleteSingle(node.id),
    });

    // Show "Delete [ with children ]" if node has children
    if (node.childrenIds.length > 0) {
      items.push({
        label: "Delete [ with children ]",
        onClick: () => handleDeleteSingleWithChildren(node.id),
      });
    }

    return items;
  })();

  const onInputSubmit = async (query: string, caller: GraphNode) => {
    // Get the current node from nodesRef to use up-to-date position (may have been moved by collision resolution)
    const currentCaller = nodesRef.current[caller.id] || caller;

    // Find the first response child node
    let responseNodeId = currentCaller.childrenIds.find((childId) => {
      const childNode = nodesRef.current[childId];
      return childNode?.type === "response";
    });

    let responseNode: GraphNode;

    // Create updated nodes object with the query value set - this will be mutated as we stream responses
    const updatedCaller = { ...currentCaller, value: query };
    const nodesWithQuery = { ...nodesRef.current, [caller.id]: updatedCaller };

    // Set the value to query of the InputFieldNode
    treeManager.patchNode(caller.id, { value: query });

    // Prepare the response node
    if (responseNodeId) {
      // put existing response node into loading state

      treeManager.patchNode(responseNodeId, { value: "" });
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
        onDeleteNode={(nodeId) => treeManager.deleteNode(nodeId)}
        onContextNodeDoubleClick={handleContextNodeDoubleClick}
        onDropFilesAsContext={onDropFilesAsContext}
        onNodeDimensionsChange={setNodeDimensions}
        onRequestNodeMove={handleRequestNodeMove}
        onRequestContextMenu={handleRequestContextMenu}
        selectedNodeIds={selectedNodeIds}
        onClearSelection={clearSelection}
        currentWordIndex={currentWordIndex}
        audioWords={audioWords}
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
      {contextMenu && (
        <ContextMenu
          isOpen={contextMenu.isOpen}
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={closeContextMenu}
          selectedNodeCount={selectedNodeIds.size}
        />
      )}
      <AnimatePresence>
        {(isPlayingAudio || isLoadingAudio) && (
          <AudioPlayerIndicator onStop={stopAudio} isLoading={isLoadingAudio} />
        )}
      </AnimatePresence>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".txt,.md,.json,.csv,image/*"
        onChange={handleFileInputChange}
        className="hidden"
      />
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
