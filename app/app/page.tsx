"use client";

/* eslint-disable react-hooks/refs */

import { useEffect, useState, useRef, useCallback } from "react";
import { motion, useAnimate } from "framer-motion";
import { AnimatePresence } from "framer-motion";
import { GraphCanvas } from "./GraphCanvas/GraphCanvas";
import { ContextSidebar } from "./ContextSidebar";
import { ContextStoragePanel } from "../components/ContextStoragePanel";
import { ContextMenu } from "../components/ui/ContextMenu";
import { AudioPlayerIndicator } from "../components/ui/AudioPlayerIndicator";
import { ModelIndicator } from "../components/ui/ModelIndicator";
import TipsModal from "../components/ui/TipsModal";
import { useAudioPlayer } from "../hooks/useAudioPlayer";
import { UPLOAD_CONTEXT_ACCEPT, useFileUpload } from "../hooks/useFileUpload";
import { useContextMenu } from "../hooks/useContextMenu";
import { useAIChat } from "../hooks/useAIChat";
import { globals } from "../globals";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import SettingsModal from "./QuickMenu";
import { HelpCircle, Settings } from "lucide-react";
import { createNode } from "../interfaces/TreeManager";
import { findFreePosition, getDefaultNodeDimensions } from "../utils/placement";
import { compressImage } from "../utils/imageCompression";
import { parseDocumentWithFallback } from "../utils/documentParserClient";
import { PLAIN_TEXT_EXTENSIONS, DOCUMENT_EXTENSIONS } from "../hooks/useFileUpload";
import { useContextStorage } from "../hooks/useContextStorage";
import type { StoredItem } from "../hooks/useContextStorage";

const AppPageContent = () => {
  const graphCanvasRef = useRef<React.ElementRef<typeof GraphCanvas>>(null);

  // Load initial nodes from localStorage if available
  const [initialNodes, setInitialNodes] = useState<any>(null);
  const [initialTransform, setInitialTransform] = useState<any>(undefined);

  useEffect(() => {
    const saved = localStorage.getItem("graph-nodes");
    if (saved) {
      try {
        setInitialNodes(JSON.parse(saved));
      } catch (e) {
        setInitialNodes(globals.initialNodes);
      }
    } else {
      setInitialNodes(globals.initialNodes);
    }

    const savedTransform = localStorage.getItem("graph-transform");
    if (savedTransform) {
      try {
        setInitialTransform(JSON.parse(savedTransform));
      } catch (e) {
        setInitialTransform(undefined);
      }
    }
  }, []);

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
    onEditContext: (nodeId) => {
      setEditingContextNodeId(nodeId);
    },
    onEditInput: (nodeId) => {
      const node = graphCanvasRef.current?.nodes[nodeId];
      if (node && node.type === "input") {
        const nodeElement = document.querySelector(`[data-node-id="${nodeId}"]`);
        if (nodeElement) {
          // Find the inner container div where the listener is attached
          const innerElement = nodeElement.querySelector('.w-\\[400px\\]');
          const targetElement = innerElement || nodeElement;
          const event = new CustomEvent("editInput", { bubbles: true });
          targetElement.dispatchEvent(event);
        }
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
  const [tipsOpen, setTipsOpen] = useState(false);
  const [storagePanelOpen, setStoragePanelOpen] = useState(false);

  useKeyboardShortcuts({
    onQuickMenu: () => {
      setQuickMenuOpen((prev) => {
        return !prev;
      });
    },
  });

  const handleRestoreNode = useCallback((
    node: import("../types/GraphCanvas.types").GraphNode,
    canvasPoint: { x: number; y: number }
  ) => {
    const nodesRef = graphCanvasRef.current?.nodesRef;
    const nodeDimensionsRef = graphCanvasRef.current?.nodeDimensionsRef;
    const treeManager = graphCanvasRef.current?.treeManager;
    if (!nodesRef || !nodeDimensionsRef || !treeManager) return;

    const workingNodes = { ...nodesRef.current };
    const newNodeDim = getDefaultNodeDimensions(node.type);
    const freePos = findFreePosition(
      canvasPoint.x,
      canvasPoint.y,
      newNodeDim.width,
      newNodeDim.height,
      workingNodes,
      nodeDimensionsRef.current,
      "below"
    );

    const restoredNode = {
      ...node,
      x: freePos.x,
      y: freePos.y,
      id: `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      parentIds: [],
      childrenIds: [],
    };

    treeManager.addNode(restoredNode);
  }, [graphCanvasRef]);

  const handleRestoreFile = useCallback(async (
    file: File,
    canvasPoint: { x: number; y: number }
  ) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    await onDropFilesAsContext(dataTransfer.files, canvasPoint);
  }, [onDropFilesAsContext]);

  const { addNode: addNodeToStorage } = useContextStorage();

  const handleNodeDroppedToStorage = (nodeId: string) => {
    const treeManager = graphCanvasRef.current?.treeManager;
    const nodes = graphCanvasRef.current?.nodes;
    if (!treeManager || !nodes) return;

    const node = nodes[nodeId];
    if (!node) return;

    // Add node to storage
    addNodeToStorage(node);

    // Remove node from canvas
    treeManager.deleteNode(nodeId);
  };

  // Handle storage item drops on canvas
  useEffect(() => {
    const handleStorageItemDrop = (e: CustomEvent<{ item: StoredItem; canvasPoint: { x: number; y: number } }>) => {
      const { item, canvasPoint } = e.detail;

      if (item.type === "file") {
        // Convert stored file back to File object
        const blob = item.mimeType.startsWith("image/")
          ? dataURLtoBlob(item.data)
          : new Blob([item.data], { type: item.mimeType });
        const file = new File([blob], item.name, { type: item.mimeType });
        handleRestoreFile(file, canvasPoint);
      } else {
        handleRestoreNode(item.node, canvasPoint);
      }
    };

    window.addEventListener("storageItemDrop", handleStorageItemDrop as EventListener);
    return () => window.removeEventListener("storageItemDrop", handleStorageItemDrop as EventListener);
  }, [handleRestoreFile, handleRestoreNode]);

  function dataURLtoBlob(dataURL: string): Blob {
    const arr = dataURL.split(",");
    const mime = arr[0].match(/:(.*?);/)?.[1] || "image/jpeg";
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  }

  return (
    <div className="relative w-full h-screen">
      {initialNodes && (
        <GraphCanvas
          ref={graphCanvasRef}
          initialNodes={initialNodes}
          initialTransform={initialTransform}
          onInputSubmit={onInputSubmit}
          setEditingContextNodeId={setEditingContextNodeId}
          onDropFilesAsContext={onDropFilesAsContext}
          onRequestNodeMove={handleRequestNodeMove}
          onRequestContextMenu={handleRequestContextMenu}
          onNodeDragToStorage={handleNodeDroppedToStorage}
        />
      )}
      {quickMenuOpen && (
        <SettingsModal
          isOpen={quickMenuOpen}
          onClose={() => setQuickMenuOpen(false)}
        />
      )}
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
      <div className="fixed bottom-4 right-4 z-40 flex items-center gap-2 pointer-events-auto">
        <ModelIndicator onClick={() => setQuickMenuOpen(prev => !prev)} />
        <button
          onClick={() => setQuickMenuOpen(prev => !prev)}
          className="pointer-events-auto cursor-pointer"
          aria-label="Open settings"
        >
          <div className="px-3 py-1.5 rounded-md border border-white/10 bg-[#0a0a0a]/80 backdrop-blur-sm shadow-lg hover:bg-white/5 transition-colors">
            <Settings className="size-4 text-white/60" />
          </div>
        </button>
      </div>
      <button
        onClick={() => setTipsOpen(true)}
        className="fixed top-4 right-4 z-40 pointer-events-auto cursor-pointer"
        aria-label="Show tips and keyboard shortcuts"
      >
        <div className="px-3 py-1.5 rounded-md border border-white/10 bg-[#0a0a0a]/80 backdrop-blur-sm shadow-lg hover:bg-white/5 transition-colors">
          <div className="flex items-center gap-2">
            <HelpCircle className="size-4 text-white/60" />
            <span className="text-xs font-mono text-white/60">
              Tips
            </span>
          </div>
        </div>
      </button>
      <TipsModal isOpen={tipsOpen} onClose={() => setTipsOpen(false)} />
      <ContextStoragePanel
        isOpen={storagePanelOpen}
        onToggle={() => setStoragePanelOpen((prev) => !prev)}
        onRestoreNode={handleRestoreNode}
        onRestoreFile={handleRestoreFile}
        onNodeDropped={handleNodeDroppedToStorage}
      />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={UPLOAD_CONTEXT_ACCEPT}
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
