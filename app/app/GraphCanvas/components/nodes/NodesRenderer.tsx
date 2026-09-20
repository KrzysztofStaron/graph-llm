import type { GraphNode, GraphNodes } from "@/app/types/GraphCanvas.types";

import { AnimatePresence } from "framer-motion";
import { useContext } from "react";

import { GraphNodeFrame } from "./GraphNodeFrame";
import { InputFieldNode } from "./InputFieldNode";
import { ResponseNode } from "./ResponseNode";
import { ImageResponseNode } from "./ImageResponseNode";
import { ContextNode } from "./ContextNode";
import { ImageContextNode } from "./ImageContextNode";
import { DocumentNode } from "./DocumentNode";
import { SummaryNode } from "./SummaryNode";
import { YouTubeNode } from "./YouTubeNode";

import { CanvasContext } from "@/app/app/GraphCanvas/GraphCanvas";

function NodeBody({
  node,
  isSelected,
  nodes,
  onInputSubmit,
  onDeleteNode,
}: {
  node: GraphNode;
  isSelected: boolean;
  nodes: GraphNodes;
  onInputSubmit: (query: string, node: GraphNode) => void;
  onDeleteNode: (nodeId: string) => void;
}) {
  if (node.type === "input") {
    return (
      <InputFieldNode
        node={node}
        isSelected={isSelected}
        nodes={nodes}
        onInputSubmit={(query) => onInputSubmit(query, node)}
        onDelete={() => onDeleteNode(node.id)}
      />
    );
  }
  if (node.type === "response") {
    return <ResponseNode node={node} isSelected={isSelected} />;
  }
  if (node.type === "image-response") {
    return <ImageResponseNode node={node} isSelected={isSelected} />;
  }
  if (node.type === "context") {
    return <ContextNode node={node} isSelected={isSelected} />;
  }
  if (node.type === "image-context") {
    return <ImageContextNode node={node} isSelected={isSelected} />;
  }
  if (node.type === "document") {
    return <DocumentNode node={node} isSelected={isSelected} />;
  }
  if (node.type === "summary") {
    return <SummaryNode node={node} isSelected={isSelected} />;
  }
  return <YouTubeNode node={node} isSelected={isSelected} />;
}

const NodesRenderer = ({
  selectedNodeIds,
  handleNodePointerDown,
  setEditingContextNodeId,
  onInputSubmit,
  onDeleteNode,
}: {
  selectedNodeIds: Set<string>;
  handleNodePointerDown: (e: React.PointerEvent, nodeId: string) => void;
  setEditingContextNodeId?: (nodeId: string | null) => void;
  onInputSubmit: (query: string, node: GraphNode) => void;
  onDeleteNode: (nodeId: string) => void;
}) => {
  const { nodes } = useContext(CanvasContext);

  return (
    <AnimatePresence mode="popLayout" initial={false}>
      {Object.values(nodes).map((node) => {
        const isSelected = selectedNodeIds.has(node.id);
        return (
          <GraphNodeFrame
            key={node.id}
            node={node}
            isSelected={isSelected}
            onPointerDown={(e) => handleNodePointerDown(e, node.id)}
            onDoubleClick={
              node.type === "context" && setEditingContextNodeId
                ? (e) => {
                    e.stopPropagation();
                    setEditingContextNodeId(node.id);
                  }
                : undefined
            }
          >
            <NodeBody
              node={node}
              isSelected={isSelected}
              nodes={nodes}
              onInputSubmit={onInputSubmit}
              onDeleteNode={onDeleteNode}
            />
          </GraphNodeFrame>
        );
      })}
    </AnimatePresence>
  );
};

export default NodesRenderer;
