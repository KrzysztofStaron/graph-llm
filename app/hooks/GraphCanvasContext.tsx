"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useGraphCanvas, type TreeManager } from "./useGraphCanvas";
import type { GraphNodes, GraphNode } from "../types/graph";

export type NodeDimensions = Record<string, { width: number; height: number }>;

type GraphCanvasContextValue = {
  transform: { x: number; y: number; k: number };
  setTransform: (transform: { x: number; y: number; k: number }) => void;
  nodes: GraphNodes;
  nodesRef: React.MutableRefObject<GraphNodes>;
  treeManager: TreeManager;
  handleMouseDown: (e: React.MouseEvent, nodeId?: string) => void;
  nodeDimensions: NodeDimensions;
  setNodeDimensions: (dimensions: NodeDimensions) => void;
  nodeDimensionsRef: React.MutableRefObject<NodeDimensions>;
  selectedNodeIds: Set<string>;
  selectNode: (nodeId: string) => void;
  deselectNode: (nodeId: string) => void;
  toggleNodeSelection: (nodeId: string) => void;
  clearSelection: () => void;
  onInputSubmit?: (query: string, caller: GraphNode) => void | Promise<void>;
  onDeleteNode?: (nodeId: string) => void;
  onContextNodeDoubleClick?: (nodeId: string) => void;
  onDropFilesAsContext?: (
    files: FileList,
    canvasPoint: { x: number; y: number }
  ) => void | Promise<void>;
  onRequestNodeMove?: (nodeId: string, dx: number, dy: number) => void;
  onRequestContextMenu?: (
    clientX: number,
    clientY: number,
    nodeId?: string
  ) => void;
};

const GraphCanvasContext = createContext<GraphCanvasContextValue | undefined>(
  undefined
);

export const useGraphCanvasContext = () => {
  const context = useContext(GraphCanvasContext);
  if (!context) {
    throw new Error(
      "useGraphCanvasContext must be used within GraphCanvasProvider"
    );
  }
  return context;
};

type GraphCanvasProviderProps = {
  children: ReactNode;
  initialNodes: GraphNodes;
  onInputSubmit?: (query: string, caller: GraphNode) => void | Promise<void>;
  onDeleteNode?: (nodeId: string) => void;
  onContextNodeDoubleClick?: (nodeId: string) => void;
  onDropFilesAsContext?: (
    files: FileList,
    canvasPoint: { x: number; y: number }
  ) => void | Promise<void>;
  onRequestNodeMove?: (nodeId: string, dx: number, dy: number) => void;
  onRequestContextMenu?: (
    clientX: number,
    clientY: number,
    nodeId?: string
  ) => void;
};

export const GraphCanvasProvider = ({
  children,
  initialNodes,
  onInputSubmit,
  onDeleteNode,
  onContextNodeDoubleClick,
  onDropFilesAsContext,
  onRequestNodeMove,
  onRequestContextMenu,
}: GraphCanvasProviderProps) => {
  const {
    transform,
    setTransform,
    nodes,
    nodesRef,
    treeManager,
    handleMouseDown,
    nodeDimensions,
    setNodeDimensions,
    nodeDimensionsRef,
    selectedNodeIds,
    selectNode,
    deselectNode,
    toggleNodeSelection,
    clearSelection,
  } = useGraphCanvas(initialNodes);

  return (
    <GraphCanvasContext.Provider
      value={{
        transform,
        setTransform,
        nodes,
        nodesRef,
        treeManager,
        handleMouseDown,
        nodeDimensions,
        setNodeDimensions,
        nodeDimensionsRef,
        selectedNodeIds,
        selectNode,
        deselectNode,
        toggleNodeSelection,
        clearSelection,
        onInputSubmit,
        onDeleteNode:
          onDeleteNode ?? ((nodeId) => treeManager.deleteNode(nodeId)),
        onContextNodeDoubleClick,
        onDropFilesAsContext,
        onRequestNodeMove,
        onRequestContextMenu,
      }}
    >
      {children}
    </GraphCanvasContext.Provider>
  );
};

export const GraphCanvasHandlerProvider = ({
  children,
  onInputSubmit,
  onDeleteNode,
  onContextNodeDoubleClick,
  onDropFilesAsContext,
  onRequestNodeMove,
  onRequestContextMenu,
}: Omit<GraphCanvasProviderProps, "initialNodes">) => {
  const baseContext = useGraphCanvasContext();

  return (
    <GraphCanvasContext.Provider
      value={{
        ...baseContext,
        onInputSubmit: onInputSubmit ?? baseContext.onInputSubmit,
        onDeleteNode: onDeleteNode ?? baseContext.onDeleteNode,
        onContextNodeDoubleClick:
          onContextNodeDoubleClick ?? baseContext.onContextNodeDoubleClick,
        onDropFilesAsContext:
          onDropFilesAsContext ?? baseContext.onDropFilesAsContext,
        onRequestNodeMove: onRequestNodeMove ?? baseContext.onRequestNodeMove,
        onRequestContextMenu:
          onRequestContextMenu ?? baseContext.onRequestContextMenu,
      }}
    >
      {children}
    </GraphCanvasContext.Provider>
  );
};
