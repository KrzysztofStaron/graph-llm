"use client";

/* eslint-disable react-hooks/refs */

import { useEffect } from "react";
import { motion, useAnimate } from "framer-motion";
import { useState, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import { GraphCanvas } from "./GraphCanvas/GraphCanvas";
import { ContextSidebar } from "./ContextSidebar";
import { ContextMenu } from "../components/ui/ContextMenu";
import { AudioPlayerIndicator } from "../components/ui/AudioPlayerIndicator";
import { useAudioPlayer } from "../hooks/useAudioPlayer";
import { useFileUpload } from "../hooks/useFileUpload";
import { useContextMenu } from "../hooks/useContextMenu";
import { useAIChat } from "../hooks/useAIChat";
import { globals } from "../globals";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";

const AppPageContent = () => {
  const graphCanvasRef = useRef<React.ElementRef<typeof GraphCanvas>>(null);

  // Context node editing state
  const [editingContextNodeId, setEditingContextNodeId] = useState<
    string | null
  >(null);

  // Audio playback hook
  // prettier-ignore
  const { isPlayingAudio, isLoadingAudio, playAudio, stopAudio } = useAudioPlayer();

  // File upload hook
  const {
    onDropFilesAsContext,
    handleUploadContext: handleUploadContextBase,
    fileInputRef,
    handleFileInputChange,
  } = useFileUpload({ graphCanvasRef });

  // Context menu hook
  const {
    contextMenu,
    contextMenuItems,
    handleRequestContextMenu,
    closeContextMenu,
  } = useContextMenu({
    graphCanvasRef,
    onUploadContext: handleUploadContextBase,
    onListen: (targetNodeIds) => {
      const nodes = graphCanvasRef.current?.nodes;
      if (nodes) {
        playAudio(targetNodeIds, nodes, true);
      }
    },
  });

  // AI chat hook
  const { onInputSubmit } = useAIChat({ graphCanvasRef });

  const handleRequestNodeMove = (nodeId: string, dx: number, dy: number) => {
    const treeManager = graphCanvasRef.current?.treeManager;
    if (treeManager) {
      treeManager.moveNode(nodeId, dx, dy);
    }
  };

  const [quickMenuOpen, setQuickMenuOpen] = useState(false);

  useKeyboardShortcuts({
    onQuickMenu: () => {
      setQuickMenuOpen((prev) => {
        console.log("prev", prev);
        return !prev;
      });
    },
  });

  return (
    <div className="relative w-full h-screen">
      <GraphCanvas
        ref={graphCanvasRef}
        initialNodes={globals.initialNodes}
        onInputSubmit={onInputSubmit}
        setEditingContextNodeId={setEditingContextNodeId}
        onDropFilesAsContext={onDropFilesAsContext}
        onRequestNodeMove={handleRequestNodeMove}
        onRequestContextMenu={handleRequestContextMenu}
      />
      {editingContextNodeId && (
        <ContextSidebar
          value={
            graphCanvasRef.current?.nodes[editingContextNodeId]?.value || ""
          }
          onClose={(finalValue) => {
            if (editingContextNodeId) {
              const treeManager = graphCanvasRef.current?.treeManager;
              if (treeManager) {
                treeManager.patchNode(editingContextNodeId, {
                  value: finalValue,
                });
              }
            }
            setEditingContextNodeId(null);
          }}
        />
      )}
      {contextMenu && (
        <ContextMenu
          isOpen={contextMenu.isOpen}
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={closeContextMenu}
          selectedNodeCount={graphCanvasRef.current?.selectedNodeIds.size ?? 0}
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
          backgroundSize: `40px 40px`,
          backgroundImage:
            "radial-gradient(circle, rgba(255, 255, 255, 0.1) 1px, transparent 1px)",
          backgroundColor: "#0a0a0a",
          opacity: 0.4,
          backgroundPosition: `0px 0px`,
        }}
      />
    </div>
  );
};

export default function AppRoute() {
  const [scope, animate] = useAnimate();

  useEffect(() => {
    const init = async () => {
      await animate(".dot-grid-background", { opacity: 1 }, { duration: 0 });
      await animate(".app-page-container", { opacity: 1 }, { duration: 0 });
    };
    init();
  }, [animate]);

  return (
    <motion.div
      ref={scope}
      className="relative min-h-screen"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.1 }}
    >
      <div className="app-page-container absolute inset-0 z-20 pointer-events-none">
        <AppPageContent />
      </div>
    </motion.div>
  );
}
