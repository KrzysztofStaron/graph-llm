import { useState, useCallback } from "react";
import { createNode, TreeManager } from "../hooks/useGraphCanvas";
import { GraphCanvas } from "./GraphCanvas";
import { ContextSidebar } from "./ContextSidebar";
import { GraphNode, GraphNodes } from "../types/graph";
import { aiService } from "../interfaces/aiService";
import {
  GraphCanvasProvider,
  useGraphCanvasContext,
} from "../hooks/GraphCanvasContext";
import { findFreePosition, getDefaultNodeDimensions } from "../utils/placement";
import { ContextMenu, ContextMenuItem } from "../components/ui/ContextMenu";

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

  // Context menu actions
  const handleAskQuestion = useCallback(() => {
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

  const handleAddContext = useCallback(() => {
    if (!contextMenu) return;

    const newNodeDim = getDefaultNodeDimensions("context");
    const freePos = findFreePosition(
      contextMenu.canvasX,
      contextMenu.canvasY,
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
  }, [contextMenu, treeManager, nodesRef, nodeDimensionsRef]);

  const handleNewQuestion = useCallback(() => {
    if (!contextMenu || contextMenu.target.kind !== "node") return;

    const clickedNode = nodes[contextMenu.target.nodeId];
    if (!clickedNode) return;

    const targetX = contextMenu.canvasX;
    const targetY = contextMenu.canvasY;

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

    // If 2+ nodes are selected, link all selected nodes (excluding InputFieldNodes) as parents
    if (selectedNodeIds.size >= 2) {
      const eligibleParentIds = Array.from(selectedNodeIds).filter((nodeId) => {
        const node = nodes[nodeId];
        return node && node.type !== "input";
      });

      // Link all eligible selected nodes as parents
      eligibleParentIds.forEach((parentId) => {
        treeManager.linkNodes(parentId, newInputNode.id);
      });
    } else {
      // Default behavior: link clicked node as parent
      treeManager.linkNodes(clickedNode.id, newInputNode.id);
    }
  }, [
    contextMenu,
    nodes,
    treeManager,
    nodesRef,
    nodeDimensionsRef,
    selectedNodeIds,
  ]);

  const handleDelete = useCallback(() => {
    if (!contextMenu || contextMenu.target.kind !== "node") return;

    // Use deleteNodeDetach when implemented, for now use deleteNode
    // treeManager.deleteNodeDetach(contextMenu.target.nodeId);
    // For now, we'll implement this in the next todo
    treeManager.deleteNodeDetach(contextMenu.target.nodeId);
  }, [contextMenu, treeManager]);

  const handleDeleteWithChildren = useCallback(() => {
    if (!contextMenu || contextMenu.target.kind !== "node") return;

    treeManager.deleteNode(contextMenu.target.nodeId);
  }, [contextMenu, treeManager]);

  // Build context menu items based on target
  // Note: Handlers use refs but are only called on user interaction, not during render
  const contextMenuItems: ContextMenuItem[] = (() => {
    if (!contextMenu) return [];

    if (contextMenu.target.kind === "canvas") {
      return [
        { label: "> Ask Question", onClick: handleAskQuestion },
        { label: "> Add Context", onClick: handleAddContext },
      ];
    }

    const node = nodes[contextMenu.target.nodeId];
    const items: ContextMenuItem[] = [];

    // Only show "New Question" if node is not an input node
    // Handlers are callbacks that use refs, but are only invoked on user click, not during render
    if (node && node.type !== "input") {
      items.push({ label: "> New Question", onClick: handleNewQuestion });
    }

    items.push(
      { label: "> Delete", onClick: handleDelete },
      { label: "> Delete [ and children ]", onClick: handleDeleteWithChildren }
    );

    return items;
  })();

  const onAddInputNode = (fromNode: GraphNode, position: "left" | "right") => {
    const nodeElement = document.querySelector(
      `[data-node-id="${fromNode.id}"]`
    ) as HTMLElement;
    const height = nodeElement?.offsetHeight ?? 96;

    // Position directly below parent with minimal offset
    const offsetX = position === "left" ? -50 : 50; // Small horizontal offset
    const targetX = fromNode.x + offsetX;
    const targetY = fromNode.y + height + 30; // Closer vertical spacing

    // Use smart placement to find a free spot, preferring below
    const newNodeDim = getDefaultNodeDimensions("input");
    const freePos = findFreePosition(
      targetX,
      targetY,
      newNodeDim.width,
      newNodeDim.height,
      nodesRef.current,
      nodeDimensionsRef.current,
      "below" // Always prefer below
    );

    const newInputNode = createNode("input", freePos.x, freePos.y);

    // Add to tree and update the ref immediately so rapid clicks work
    treeManager.addNode(newInputNode);
    treeManager.linkNodes(fromNode.id, newInputNode.id);

    // Immediately update the ref so the next call sees this node
    nodesRef.current = { ...nodesRef.current, [newInputNode.id]: newInputNode };
  };

  const onDropFilesAsContext = useCallback(
    async (files: FileList, canvasPoint: { x: number; y: number }) => {
      const acceptedExtensions = [".txt", ".md", ".json", ".csv"];
      const fileArray = Array.from(files);

      // Separate text files and image files
      const textFiles = fileArray.filter((file) =>
        acceptedExtensions.some((ext) => file.name.toLowerCase().endsWith(ext))
      );
      const imageFiles = fileArray.filter((file) =>
        file.type.startsWith("image/")
      );

      if (textFiles.length === 0 && imageFiles.length === 0) return;

      let nodeIndex = 0;

      // Keep track of nodes as we create them for collision detection
      const workingNodes = { ...nodesRef.current };

      // Create text context nodes
      for (const file of textFiles) {
        const text = await file.text();

        // Stagger positions: prefer stacking vertically below, slight horizontal offset
        const targetX = canvasPoint.x + nodeIndex * 40;
        const targetY = canvasPoint.y + nodeIndex * 120;

        const newNodeDim = getDefaultNodeDimensions("context");
        const freePos = findFreePosition(
          targetX,
          targetY,
          newNodeDim.width,
          newNodeDim.height,
          workingNodes,
          nodeDimensionsRef.current,
          "below"
        );

        const newContextNode = createNode("context", freePos.x, freePos.y);
        const nodeWithValue = { ...newContextNode, value: text };
        treeManager.addNode(nodeWithValue);
        workingNodes[nodeWithValue.id] = nodeWithValue;
        nodeIndex++;
      }

      // Create image context nodes
      for (const file of imageFiles) {
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.readAsDataURL(file);
        });

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
    },
    [treeManager, nodesRef, nodeDimensionsRef]
  );

  const onInputSubmit = async (query: string, caller: GraphNode) => {
    // Find the first response child node
    let responseNodeId = caller.childrenIds.find((childId) => {
      const childNode = nodesRef.current[childId];
      return childNode?.type === "response";
    });

    let responseNode: GraphNode;

    // Create updated nodes object with the query value set - this will be mutated as we stream responses
    const updatedCaller = { ...caller, value: query };
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
      const callerElement = document.querySelector(
        `[data-node-id="${caller.id}"]`
      ) as HTMLElement;
      const callerHeight = callerElement?.offsetHeight ?? 120;

      const targetX = caller.x;
      const targetY = caller.y + callerHeight + 30; // Tight spacing

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
      const nodeElement = document.querySelector(
        `[data-node-id="${responseNode.id}"]`
      ) as HTMLElement;
      const height = nodeElement?.offsetHeight ?? 80;

      const targetX = responseNode.x;
      const targetY = responseNode.y + height + 30; // Tight spacing

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
        onAddNodeFromResponse={onAddInputNode}
        onAddNodeFromContext={onAddInputNode}
        onDeleteNode={(nodeId) => treeManager.deleteNode(nodeId)}
        onContextNodeDoubleClick={handleContextNodeDoubleClick}
        onDropFilesAsContext={onDropFilesAsContext}
        onNodeDimensionsChange={setNodeDimensions}
        onRequestNodeMove={handleRequestNodeMove}
        onRequestContextMenu={handleRequestContextMenu}
        selectedNodeIds={selectedNodeIds}
        onClearSelection={clearSelection}
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
        />
      )}
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
