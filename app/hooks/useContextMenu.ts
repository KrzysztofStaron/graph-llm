/* eslint-disable react-hooks/refs */
import { useState } from "react";
import { GraphCanvasRef } from "../app/GraphCanvas/GraphCanvas";
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

  const handleRequestContextMenu = (
    clientX: number,
    clientY: number,
    nodeId?: string
  ) => {
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
  };

  const closeContextMenu = () => {
    setContextMenu(null);
  };

  // Helper predicates for node types
  const isResponseLike = (node: { type: string }) =>
    node.type === "response" || node.type === "image-response";

  const isContextLike = (node: { type: string }) =>
    node.type === "context" ||
    node.type === "image-context" ||
    node.type === "document";

  // Delete handlers
  const handleDeleteSingle = (nodeId: string) => {
    const treeManager = graphCanvasRef.current?.treeManager;
    if (treeManager) {
      treeManager.deleteNodeDetach(nodeId);
    }
  };

  const handleDeleteSingleWithChildren = (nodeId: string) => {
    const treeManager = graphCanvasRef.current?.treeManager;
    if (treeManager) {
      treeManager.deleteNode(nodeId);
    }
  };

  const handleDeleteAll = (selectedNodeIds: Set<string>) => {
    const treeManager = graphCanvasRef.current?.treeManager;
    if (treeManager) {
      selectedNodeIds.forEach((nodeId) => {
        treeManager.deleteNodeDetach(nodeId);
      });
    }
  };

  const handleDeleteAllWithChildren = (selectedNodeIds: Set<string>) => {
    const treeManager = graphCanvasRef.current?.treeManager;
    if (treeManager) {
      selectedNodeIds.forEach((nodeId) => {
        treeManager.deleteNode(nodeId);
      });
    }
  };

  // Creation handlers
  const handleNewQuestionOnCanvas = () => {
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
  };

  const handleAskQuestion = () => {
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
  };

  const handleAddContext = () => {
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
  };

  const handleUploadContext = () => {
    if (contextMenu) {
      onUploadContext({
        x: contextMenu.canvasX,
        y: contextMenu.canvasY,
      });
    }
  };

  const handleListen = () => {
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
  };

  // Link context-like nodes to a response-like node
  const handleLink = () => {
    const nodes = graphCanvasRef.current?.nodes;
    const selectedNodeIds = graphCanvasRef.current?.selectedNodeIds;
    const treeManager = graphCanvasRef.current?.treeManager;
    if (!nodes || !selectedNodeIds || !treeManager) return;

    const selectedArray = Array.from(selectedNodeIds);
    
    // Find the single response-like node
    const responseLikeIds = selectedArray.filter((id) => {
      const node = nodes[id];
      return node && isResponseLike(node);
    });

    // Find all context-like nodes
    const contextLikeIds = selectedArray.filter((id) => {
      const node = nodes[id];
      return node && isContextLike(node);
    });

    if (responseLikeIds.length !== 1 || contextLikeIds.length === 0) return;

    const responseId = responseLikeIds[0];

    // Link each context-like node to the response node
    contextLikeIds.forEach((ctxId) => {
      treeManager.linkNodes(ctxId, responseId);
    });
  };

  // Separate (single node): disconnect all parents and children
  const handleSeparate = (nodeId: string) => {
    const treeManager = graphCanvasRef.current?.treeManager;
    if (treeManager) {
      treeManager.detachNode(nodeId);
    }
  };

  // Remove edges between selected nodes (multi-select)
  const handleRemoveEdgesBetween = (selectedNodeIds: Set<string>) => {
    const treeManager = graphCanvasRef.current?.treeManager;
    if (treeManager) {
      treeManager.removeEdgesBetween(Array.from(selectedNodeIds));
    }
  };

  // Build context menu items based on state
  const getContextMenuItems = (): ContextMenuItem[] => {
    if (!contextMenu) return [];
    const nodes = graphCanvasRef.current?.nodes;
    const selectedNodeIds = graphCanvasRef.current
      ?.selectedNodeIds as Set<string>;

    if (!nodes || !selectedNodeIds) return [];

    const isActingUponNodes = selectedNodeIds.size > 0;

    // State 1: Acting upon nodes (when nodes are selected)
    if (isActingUponNodes) {
      const items: ContextMenuItem[] = [];

      const selectedArray = Array.from(selectedNodeIds);

      // Check if at least one selected node is non-input
      const hasNonInputSelected = selectedArray.some((nodeId) => {
        const node = nodes[nodeId];
        return node && node.type !== "input";
      });

      // Show "Ask Question" only if at least one selected node is non-input
      if (hasNonInputSelected) {
        items.push({ label: "Ask Question", onClick: handleAskQuestion });
      }

      // Check for Link visibility: exactly 1 response-like + at least 1 context-like (and nothing else)
      const responseLikeCount = selectedArray.filter((id) => {
        const node = nodes[id];
        return node && isResponseLike(node);
      }).length;

      const contextLikeCount = selectedArray.filter((id) => {
        const node = nodes[id];
        return node && isContextLike(node);
      }).length;

      const showLink =
        responseLikeCount === 1 &&
        contextLikeCount >= 1 &&
        responseLikeCount + contextLikeCount === selectedNodeIds.size;

      if (showLink) {
        items.push({ label: "Link", onClick: handleLink });
      }

      // Show "Listen" for any selected nodes that have text content (but not images or image responses)
      const hasTextContent = selectedArray.some((nodeId) => {
        const node = nodes[nodeId];
        return (
          node &&
          node.type !== "image-context" &&
          node.type !== "image-response" &&
          node.value &&
          node.value.trim().length > 0
        );
      });

      if (hasTextContent) {
        items.push({ label: "Listen", onClick: handleListen });
      }

      // Separate / Remove edge logic
      if (selectedNodeIds.size === 1) {
        const nodeId = selectedArray[0];
        const node = nodes[nodeId];
        // Show "Separate" only if node has connections
        if (
          node &&
          (node.parentIds.length > 0 || node.childrenIds.length > 0)
        ) {
          items.push({
            label: "Separate",
            onClick: () => handleSeparate(nodeId),
          });
        }
      } else if (selectedNodeIds.size >= 2) {
        // Check if there's at least one edge among selected nodes
        const hasEdgeBetweenSelected = selectedArray.some((nodeId) => {
          const node = nodes[nodeId];
          if (!node) return false;
          return (
            node.parentIds.some((pid) => selectedNodeIds.has(pid)) ||
            node.childrenIds.some((cid) => selectedNodeIds.has(cid))
          );
        });

        if (hasEdgeBetweenSelected) {
          items.push({
            label: "Remove edge",
            onClick: () => handleRemoveEdgesBetween(selectedNodeIds),
          });
        }
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

    // Show "Listen" if node has text content (but not for images or image responses)
    if (
      node.type !== "image-context" &&
      node.type !== "image-response" &&
      node.value &&
      node.value.trim().length > 0
    ) {
      items.push({ label: "Listen", onClick: handleListen });
    }

    // Show "Separate" if node has connections
    if (node.parentIds.length > 0 || node.childrenIds.length > 0) {
      items.push({
        label: "Separate",
        onClick: () => handleSeparate(node.id),
      });
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
  };

  return {
    contextMenu,
    contextMenuItems: getContextMenuItems(),
    handleRequestContextMenu,
    closeContextMenu,
  };
}
