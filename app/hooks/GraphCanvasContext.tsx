"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useGraphCanvas, type TreeManager } from "./useGraphCanvas";
import type { GraphNodes } from "../types/graph";

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
};

export const GraphCanvasProvider = ({
  children,
  initialNodes,
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
      }}
    >
      {children}
    </GraphCanvasContext.Provider>
  );
};
