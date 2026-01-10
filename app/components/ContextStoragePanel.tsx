"use client";

import { ChevronLeft, ChevronRight, X, File, Image as ImageIcon, FileText, Upload, Trash2 } from "lucide-react";
import { useState, useRef, useCallback, useEffect } from "react";
import { useContextStorage, type StoredItem } from "../hooks/useContextStorage";
import { GraphNode } from "../types/GraphCanvas.types";
import { UPLOAD_CONTEXT_ACCEPT } from "../hooks/useFileUpload";

interface ContextStoragePanelProps {
  isOpen: boolean;
  onToggle: () => void;
  onRestoreNode: (node: GraphNode, canvasPoint: { x: number; y: number }) => void;
  onRestoreFile: (file: File, canvasPoint: { x: number; y: number }) => void;
  onNodeDropped: (nodeId: string) => void;
}

export function ContextStoragePanel({
  isOpen,
  onToggle,
  onRestoreNode,
  onRestoreFile,
  onNodeDropped,
}: ContextStoragePanelProps) {
  const { storedItems, addFile, addNode, removeItem } = useContextStorage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const handleFileUpload = useCallback(async () => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      for (const file of Array.from(files)) {
        await addFile(file);
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [addFile]
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent, item: StoredItem) => {
      setDraggedItemId(item.id);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("application/json", JSON.stringify(item));
    },
    []
  );

  const handleDragEnd = useCallback(() => {
    setDraggedItemId(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set to false if we're leaving the panel itself
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
      setIsDraggingOver(false);
    }
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingOver(false);

      // Check if dropping files
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        for (const file of Array.from(files)) {
          await addFile(file);
        }
        return;
      }

      // Check if dropping a stored item from storage
      const storedItemData = e.dataTransfer.getData("application/json");
      if (storedItemData) {
        try {
          const item = JSON.parse(storedItemData) as StoredItem;
          // Item is being dragged from storage, not dropped to storage
          // This handler is for dropping items FROM storage TO canvas
          return;
        } catch {
          // Not a stored item
        }
      }
    },
    [addFile]
  );


  const getItemIcon = (item: StoredItem) => {
    if (item.type === "file") {
      if (item.mimeType.startsWith("image/")) {
        return <ImageIcon className="size-4" />;
      }
      return <FileText className="size-4" />;
    }
    return <File className="size-4" />;
  };

  const getItemName = (item: StoredItem) => {
    if (item.type === "file") {
      return item.name;
    }
    const nodeType = item.node.type;
    if (nodeType === "context" || nodeType === "document") {
      const preview = item.node.value.substring(0, 30);
      return `${nodeType}: ${preview}${item.node.value.length > 30 ? "..." : ""}`;
    }
    return `${nodeType} node`;
  };

  const handleItemClick = useCallback(
    (item: StoredItem, e: React.MouseEvent) => {
      // On click, restore to center of viewport (in screen coordinates)
      // Get viewport element to calculate center correctly
      const viewportElement = document.querySelector('[data-viewport]') as HTMLElement | null;
      if (!viewportElement) return;

      const viewportRect = viewportElement.getBoundingClientRect();
      const viewportCenter = {
        x: viewportRect.left + viewportRect.width / 2,
        y: viewportRect.top + viewportRect.height / 2,
      };

      if (item.type === "file") {
        // Convert stored file back to File object
        const blob = item.mimeType.startsWith("image/")
          ? dataURLtoBlob(item.data)
          : new Blob([item.data], { type: item.mimeType });
        const file = new File([blob], item.name, { type: item.mimeType });
        onRestoreFile(file, viewportCenter);
      } else {
        onRestoreNode(item.node, viewportCenter);
      }
    },
    [onRestoreFile, onRestoreNode]
  );

  // Desktop only - hide on mobile
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const checkDesktop = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };
    checkDesktop();
    window.addEventListener("resize", checkDesktop);
    return () => window.removeEventListener("resize", checkDesktop);
  }, []);

  if (!isDesktop) {
    return null;
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={UPLOAD_CONTEXT_ACCEPT}
        onChange={handleFileInputChange}
        className="hidden"
      />
      <div
        className={`fixed left-0 top-0 h-full z-30 pointer-events-auto transition-transform duration-300 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div
          data-storage-panel
          className="h-full w-[320px] bg-[#111] border-r border-white/10 flex flex-col shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <h2 className="text-white font-medium text-sm tracking-tight">
              Context Storage
            </h2>
            <div className="flex items-center gap-1">
              <button
                onClick={handleFileUpload}
                className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                aria-label="Upload file"
              >
                <Upload className="size-4" />
              </button>
              <button
                onClick={onToggle}
                className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                aria-label="Toggle panel"
              >
                <ChevronLeft className="size-4" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div
            className="flex-1 overflow-y-auto p-3"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {storedItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-4">
                <File className="size-12 text-white/20 mb-3" />
                <p className="text-white/40 text-sm mb-2">
                  No items in storage
                </p>
                <p className="text-white/20 text-xs">
                  Drag files or nodes here, or click upload
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {storedItems.map((item) => (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, item)}
                    onDragEnd={handleDragEnd}
                    onClick={(e) => handleItemClick(item, e)}
                    className={`group relative p-3 rounded-lg border border-white/10 bg-[#0a0a0a] hover:bg-white/5 cursor-move transition-colors ${
                      draggedItemId === item.id ? "opacity-50" : ""
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="text-white/60 mt-0.5">
                        {getItemIcon(item)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-xs font-medium truncate">
                          {getItemName(item)}
                        </p>
                        <p className="text-white/30 text-[10px] mt-0.5">
                          {item.type === "file"
                            ? formatFileSize(item.data.length)
                            : item.node.type}
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeItem(item.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-white/10 text-white/40 hover:text-white transition-all"
                        aria-label="Remove item"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Toggle button when closed */}
      {!isOpen && (
        <button
          onClick={onToggle}
          className="fixed left-0 top-1/2 -translate-y-1/2 z-30 p-2 bg-[#111] border-r border-t border-b border-white/10 rounded-r-lg hover:bg-white/5 transition-colors pointer-events-auto"
          aria-label="Open storage panel"
        >
          <ChevronRight className="size-4 text-white/60" />
        </button>
      )}
    </>
  );
}

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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

