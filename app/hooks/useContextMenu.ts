/* eslint-disable react-hooks/refs */
import { useState, useCallback, useMemo } from "react";
import { GraphCanvasRef } from "../app/GraphCanvas";
import { createNode } from "../interfaces/TreeManager";
import { findFreePosition, getDefaultNodeDimensions } from "../utils/placement";
import { ContextMenuItem } from "../components/ui/ContextMenu";

type ContextMenuState = {
  isOpen: boolean;
  x: number;
  y: number;
  target: { kind: "canvas" } | { kind: "node"; nodeId: string };
  canvasX: number;
  canvasY: number;
};

interface UseContextMenuProps {
  graphCanvasRef: React.RefObject<GraphCanvasRef | null>;
  onUploadContext: (canvasPoint: { x: number; y: number }) => void;
  onListen: (targetNodeIds: string[]) => void;
}

interface UseContextMenuReturn {
  contextMenu: ContextMenuState | null;
  contextMenuItems: ContextMenuItem[];
  handleRequestContextMenu: (
    clientX: number,
    clientY: number,
    nodeId?: string
  ) => void;
  closeContextMenu: () => void;
}

export function useContextMenu({
  graphCanvasRef,
  onUploadContext,
  onListen,
}: UseContextMenuProps): UseContextMenuReturn {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const handleRequestContextMenu = useCallback(
    (clientX: number, clientY: number, nodeId?: string) => {
      const transform = graphCanvasRef.current?.transform;
      if (!transform) return;

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
    []
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Delete handlers
  const handleDeleteSingle = useCallback(
    (nodeId: string) => {
      const treeManager = graphCanvasRef.current?.treeManager;
      if (treeManager) {
        treeManager.deleteNodeDetach(nodeId);
      }
    },
    [graphCanvasRef]
  );

  const handleDeleteSingleWithChildren = useCallback(
    (nodeId: string) => {
      const treeManager = graphCanvasRef.current?.treeManager;
      if (treeManager) {
        treeManager.deleteNode(nodeId);
      }
    },
    [graphCanvasRef]
  );

  const handleDeleteAll = useCallback(
    (selectedNodeIds: Set<string>) => {
      const treeManager = graphCanvasRef.current?.treeManager;
      if (treeManager) {
        selectedNodeIds.forEach((nodeId) => {
          treeManager.deleteNodeDetach(nodeId);
        });
      }
    },
    [graphCanvasRef]
  );

  const handleDeleteAllWithChildren = useCallback(
    (selectedNodeIds: Set<string>) => {
      const treeManager = graphCanvasRef.current?.treeManager;
      if (treeManager) {
        selectedNodeIds.forEach((nodeId) => {
          treeManager.deleteNode(nodeId);
        });
      }
    },
    [graphCanvasRef]
  );

  // Creation handlers
  const handleNewQuestionOnCanvas = useCallback(() => {
    if (!contextMenu) return;
    const nodesRef = graphCanvasRef.current?.nodesRef;
    const nodeDimensionsRef = graphCanvasRef.current?.nodeDimensionsRef;
    const treeManager = graphCanvasRef.current?.treeManager;
    if (!nodesRef || !nodeDimensionsRef || !treeManager) return;

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
  }, [contextMenu, graphCanvasRef]);

  const handleAskQuestion = useCallback(() => {
    if (!contextMenu) return;
    const nodes = graphCanvasRef.current?.nodes;
    const nodesRef = graphCanvasRef.current?.nodesRef;
    const nodeDimensionsRef = graphCanvasRef.current?.nodeDimensionsRef;
    const treeManager = graphCanvasRef.current?.treeManager;
    const selectedNodeIds = graphCanvasRef.current?.selectedNodeIds;
    if (
      !nodes ||
      !nodesRef ||
      !nodeDimensionsRef ||
      !treeManager ||
      !selectedNodeIds
    )
      return;

    let eligibleParentIds: string[] = [];

    // If nodes are selected, use selected nodes
    if (selectedNodeIds.size > 0) {
      eligibleParentIds = Array.from(selectedNodeIds).filter((nodeId) => {
        const node = nodes[nodeId];
        return node && node.type !== "input";
      }) as string[];
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

    // Link all eligible parent nodes
    eligibleParentIds.forEach((parentId) => {
      treeManager.linkNodes(parentId, newInputNode.id);
    });
  }, [contextMenu, graphCanvasRef]);

  const handleAddContext = useCallback(() => {
    if (!contextMenu) return;
    const nodes = graphCanvasRef.current?.nodes;
    const nodesRef = graphCanvasRef.current?.nodesRef;
    const nodeDimensionsRef = graphCanvasRef.current?.nodeDimensionsRef;
    const treeManager = graphCanvasRef.current?.treeManager;
    if (!nodes || !nodesRef || !nodeDimensionsRef || !treeManager) return;

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
  }, [contextMenu, graphCanvasRef]);

  const handleUploadContext = useCallback(() => {
    if (contextMenu) {
      onUploadContext({
        x: contextMenu.canvasX,
        y: contextMenu.canvasY,
      });
    }
  }, [contextMenu, onUploadContext]);

  const handleListen = useCallback(() => {
    if (!contextMenu) return;
    const nodes = graphCanvasRef.current?.nodes;
    const selectedNodeIds = graphCanvasRef.current?.selectedNodeIds;
    if (!nodes || !selectedNodeIds) return;

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

    onListen(targetNodeIds);
  }, [contextMenu, graphCanvasRef, onListen]);

  // Build context menu items based on state
  const contextMenuItems: ContextMenuItem[] = useMemo(() => {
    if (!contextMenu) return [];
    const nodes = graphCanvasRef.current?.nodes;
    const selectedNodeIds = graphCanvasRef.current
      ?.selectedNodeIds as Set<string>;

    if (!nodes || !selectedNodeIds) return [];

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
        items.push({ label: "Ask Question", onClick: handleAskQuestion });
      }

      // Show "Listen" for any selected nodes that have text content (but not images)
      const hasTextContent = Array.from(selectedNodeIds).some((nodeId) => {
        const node = nodes[nodeId];
        return (
          node &&
          node.type !== "image-context" &&
          node.value &&
          node.value.trim().length > 0
        );
      });

      if (hasTextContent) {
        items.push({ label: "Listen", onClick: handleListen });
      }

      const nodeId = Array.from(selectedNodeIds)[0];

      const hasChildren = Array.from(selectedNodeIds).some((nodeId) => {
        const node = nodes[nodeId];
        return node && node.childrenIds.length > 0;
      });

      // Always show "Delete"
      if (selectedNodeIds.size == 1) {
        items.push({
          label: "Delete",
          onClick: () => handleDeleteSingle(nodeId),
        });
      } else {
        items.push({
          label: "Delete All",
          onClick: () => handleDeleteAll(selectedNodeIds),
        });
      }

      // Show "Delete [ with children ]" if node has children
      if (hasChildren == false) {
        // do nothing
      } else if (selectedNodeIds.size == 1) {
        items.push({
          label: "Delete [ with children ]",
          onClick: () => handleDeleteSingleWithChildren(nodeId),
        });
      } else {
        items.push({
          label: "Delete All [ with children ]",
          onClick: () => handleDeleteAllWithChildren(selectedNodeIds),
        });
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
      items.push({ label: "Ask Question", onClick: handleAskQuestion });
    }

    // Show "Listen" if node has text content (but not for images)
    if (
      node.type !== "image-context" &&
      node.value &&
      node.value.trim().length > 0
    ) {
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
  }, [
    contextMenu,
    graphCanvasRef,
    handleAskQuestion,
    handleListen,
    handleDeleteSingle,
    handleDeleteAll,
    handleDeleteSingleWithChildren,
    handleDeleteAllWithChildren,
    handleNewQuestionOnCanvas,
    handleAddContext,
    handleUploadContext,
  ]);

  return {
    contextMenu,
    contextMenuItems,
    handleRequestContextMenu,
    closeContextMenu,
  };
}
