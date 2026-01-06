import { GraphNode } from "@/app/types/GraphCanvas.types";

import { AnimatePresence, motion } from "framer-motion";
import React, { useContext } from "react";

import { InputFieldNode } from "./InputFieldNode";
import { ResponseNode } from "./ResponseNode";
import { ImageResponseNode } from "./ImageResponseNode";
import { ContextNode } from "./ContextNode";
import { ImageContextNode } from "./ImageContextNode";
import { DocumentNode } from "./DocumentNode";
import { SummaryNode } from "./SummaryNode";

import { CanvasContext } from "@/app/app/GraphCanvas/GraphCanvas";

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
  const nodeArray = Object.values(nodes);

  return (
    <>
      <AnimatePresence mode="popLayout" initial={false}>
        {nodeArray.map((node) => {
          const isSelected = selectedNodeIds.has(node.id);
          return (
            <motion.div
              key={node.id}
              className={`absolute cursor-move ${
                node.type === "response" ? "w-max" : ""
              }`}
              data-node-id={node.id}
              style={{
                left: node.x,
                top: node.y,
                transformOrigin: "center center",
              }}
              initial={{ scale: 0, opacity: 0 }}
              animate={{
                scale: 1,
                opacity: 1,
                transition: {
                  duration: 0.2,
                  ease: "easeOut",
                },
              }}
              exit={{
                scale: 0,
                opacity: 0,
                transition: {
                  duration: 0.2,
                  ease: "easeIn",
                },
              }}
              onPointerDown={(e) => {
                handleNodePointerDown(e, node.id);
              }}
              onDoubleClick={(e) => {
                if (node.type === "context" && setEditingContextNodeId) {
                  e.stopPropagation();
                  setEditingContextNodeId(node.id);
                }
              }}
            >
              {node.type === "input" && (
                <InputFieldNode
                  node={node}
                  isSelected={isSelected}
                  nodes={nodes}
                  onInputSubmit={(query) => onInputSubmit(query, node)}
                  onDelete={() => onDeleteNode(node.id)}
                />
              )}
              {node.type === "response" && (
                <ResponseNode node={node} isSelected={isSelected} />
              )}
              {node.type === "image-response" && (
                <ImageResponseNode node={node} isSelected={isSelected} />
              )}
              {node.type === "context" && (
                <ContextNode node={node} isSelected={isSelected} />
              )}
              {node.type === "image-context" && (
                <ImageContextNode node={node} isSelected={isSelected} />
              )}
              {node.type === "document" && (
                <DocumentNode node={node} isSelected={isSelected} />
              )}
              {node.type === "summary" && (
                <SummaryNode node={node} isSelected={isSelected} />
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </>
  );
};

export default NodesRenderer;
