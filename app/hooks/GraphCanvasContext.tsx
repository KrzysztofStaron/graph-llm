"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useGraphCanvas, type TreeManager } from "./useGraphCanvas";
import type { GraphNodes } from "../types/graph";

type GraphCanvasContextValue = {
  transform: { x: number; y: number; k: number };
  setTransform: (transform: { x: number; y: number; k: number }) => void;
  nodes: GraphNodes;
  nodesRef: React.MutableRefObject<GraphNodes>;
  treeManager: TreeManager;
  handleMouseDown: (e: React.MouseEvent, nodeId?: string) => void;
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
  const graphCanvasState = useGraphCanvas(initialNodes);

  return (
    <GraphCanvasContext.Provider value={graphCanvasState}>
      {children}
    </GraphCanvasContext.Provider>
  );
};
