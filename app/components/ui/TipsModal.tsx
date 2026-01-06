import { AnimatePresence, motion } from "framer-motion";
import { X, Keyboard, MousePointer2, Hand, Upload, Smartphone } from "lucide-react";
import React, { useEffect, useState } from "react";
import Image from "next/image";

interface TipsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const TipsModal = ({ isOpen, onClose }: TipsModalProps) => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Detect mobile by pointer capability (coarse pointer = touch)
    const checkMobile = () => {
      const hasCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
      const hasNoHover = window.matchMedia("(hover: none)").matches;
      setIsMobile(hasCoarsePointer || hasNoHover);
    };

    checkMobile();
    
    // Listen for changes (e.g., external monitor connected)
    const coarsePointerQuery = window.matchMedia("(pointer: coarse)");
    const hoverQuery = window.matchMedia("(hover: none)");
    
    const handleChange = () => checkMobile();
    
    coarsePointerQuery.addEventListener?.("change", handleChange);
    hoverQuery.addEventListener?.("change", handleChange);
    
    return () => {
      coarsePointerQuery.removeEventListener?.("change", handleChange);
      hoverQuery.removeEventListener?.("change", handleChange);
    };
  }, []);
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <React.Fragment key={`tips-modal-${isOpen}`}>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px] pointer-events-auto"
            onClick={onClose}
            aria-hidden="true"
          />
          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[92vw] max-w-[700px] max-h-[85vh] overflow-y-auto rounded-lg border border-white/10 bg-[#0a0a0a] shadow-lg backdrop-blur-sm pointer-events-auto"
            role="dialog"
            aria-labelledby="tips-modal-title"
            aria-modal="true"
          >
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#0a0a0a]">
              <h2
                id="tips-modal-title"
                className="text-white font-medium text-lg tracking-tight flex items-center gap-2"
              >
                {isMobile ? (
                  <Smartphone className="size-5" />
                ) : (
                  <Keyboard className="size-5" />
                )}
                How to Use GraphAI
              </h2>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                aria-label="Close tips"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Content */}
            <div className="px-6 py-5 space-y-6">
              {isMobile ? (
                /* Mobile Touch Gestures */
                <>
                  <section>
                    <h3 className="text-white/80 font-mono text-sm uppercase tracking-wider mb-3">
                      Touch Gestures
                    </h3>
                    <div className="space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="flex items-center gap-2 min-w-[100px]">
                          <Hand className="size-4 text-white/60" />
                          <span className="text-white/90 font-mono text-xs">
                            Drag
                          </span>
                        </div>
                        <p className="text-white/70 text-sm leading-relaxed">
                          Drag nodes with one finger
                        </p>
                      </div>

                      <div className="flex items-start gap-3">
                        <div className="flex items-center gap-2 min-w-[100px]">
                          <Hand className="size-4 text-white/60" />
                          <span className="text-white/90 font-mono text-xs">
                            Long press
                          </span>
                        </div>
                        <p className="text-white/70 text-sm leading-relaxed">
                          Long press (~450ms) on a node or empty canvas to open context menu
                        </p>
                      </div>

                      <div className="flex items-start gap-3">
                        <div className="flex items-center gap-2 min-w-[100px]">
                          <Hand className="size-4 text-white/60" />
                          <span className="text-white/90 font-mono text-xs">
                            Tap
                          </span>
                        </div>
                        <p className="text-white/70 text-sm leading-relaxed">
                          Tap a node to select it; tap empty canvas to clear selection
                        </p>
                      </div>

                      <div className="flex items-start gap-3">
                        <div className="flex items-center gap-2 min-w-[100px]">
                          <Hand className="size-4 text-white/60" />
                          <span className="text-white/90 font-mono text-xs">
                            Two-finger tap
                          </span>
                        </div>
                        <p className="text-white/70 text-sm leading-relaxed">
                          Two-finger tap on a node to toggle multi-select
                        </p>
                      </div>
                    </div>
                  </section>
                </>
              ) : (
                /* Desktop Keyboard & Mouse */
                <>
                  <section>
                    <h3 className="text-white/80 font-mono text-sm uppercase tracking-wider mb-3">
                      Keyboard Shortcuts
                    </h3>
                    <div className="space-y-2">
                      <div className="flex items-start gap-3">
                        <kbd className="px-2 py-1 rounded bg-white/5 border border-white/10 text-white/90 font-mono text-xs min-w-[80px] text-center">
                          ⌘/Ctrl+K
                        </kbd>
                        <p className="text-white/70 text-sm leading-relaxed">
                          Open model selection menu
                        </p>
                      </div>
                      <div className="flex items-start gap-3">
                        <kbd className="px-2 py-1 rounded bg-white/5 border border-white/10 text-white/90 font-mono text-xs min-w-[80px] text-center">
                          F
                        </kbd>
                        <p className="text-white/70 text-sm leading-relaxed">
                          Auto-center and fit the entire tree to viewport
                        </p>
                      </div>
                    </div>
                  </section>

                  <section>
                    <h3 className="text-white/80 font-mono text-sm uppercase tracking-wider mb-3">
                      Mouse Actions
                    </h3>
                    <div className="space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="flex items-center  gap-2 min-w-[80px]">
                          <MousePointer2 className="size-4 text-white/60" />
                          <span className="text-white/90 font-mono text-xs">
                            Right click
                          </span>
                        </div>
                        <div className="flex-1">
                          <p className="text-white/70 text-sm leading-relaxed mb-2">
                            Open context menu with actions
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3">
                        <div className="flex items-center gap-2 min-w-[80px]">
                          <Hand className="size-4 text-white/60" />
                          <span className="text-white/90 font-mono text-xs">
                            Shift+click
                          </span>
                        </div>
                        <p className="text-white/70 text-sm leading-relaxed">
                          Multi-select nodes (hold Shift and click multiple nodes)
                        </p>
                      </div>

                      <div className="flex items-start gap-3">
                        <div className="flex items-center gap-2 min-w-[80px]">
                          <Upload className="size-4 text-white/60" />
                          <span className="text-white/90 font-mono text-xs">
                            Drag & drop
                          </span>
                        </div>
                        <p className="text-white/70 text-sm leading-relaxed">
                          Drag and drop files onto the canvas to upload them as context
                        </p>
                      </div>
                    </div>
                  </section>
                </>
              )}

              {/* Workflows Section */}
              <section>
                <h3 className="text-white/80 font-mono text-sm uppercase tracking-wider mb-3">
                  Common Workflows
                </h3>
                <div className="space-y-4">
                  {/* Multi-context workflow */}
                  <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <h4 className="text-white/90 font-mono text-sm mb-2">
                      Create node from multiple sources
                    </h4>
                    <ol className="space-y-1 mb-3 text-white/70 text-sm list-decimal list-inside">
                      <li>
                        <span className="font-mono text-xs bg-white/5 px-1 rounded">
                          {isMobile ? "Two-finger tap" : "Shift+click"}
                        </span>{" "}
                        to select multiple nodes
                      </li>
                      <li>
                        <span className="font-mono text-xs bg-white/5 px-1 rounded">
                          {isMobile ? "Long press" : "Right click"}
                        </span>{" "}
                        on any selected node
                      </li>
                      <li>
                        Choose{" "}
                        <span className="font-mono text-xs bg-white/5 px-1 rounded">
                          Ask Question
                        </span>{" "}
                        from context menu
                      </li>
                    </ol>
                    <div className="rounded overflow-hidden border border-white/10">
                      <Image
                        src="/multiContext.png"
                        alt="Multi-context example showing selected nodes"
                        width={600}
                        height={300}
                        className="w-full h-auto"
                      />
                    </div>
                  </div>

                  {/* Branch workflow */}
                  <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <h4 className="text-white/90 font-mono text-sm mb-2">
                      Branch out from a node
                    </h4>
                    <ol className="space-y-1 mb-3 text-white/70 text-sm list-decimal list-inside">
                      <li>
                        <span className="font-mono text-xs bg-white/5 px-1 rounded">
                          {isMobile ? "Long press" : "Right click"}
                        </span>{" "}
                        on the node you want to branch from
                      </li>
                      <li>
                        Choose{" "}
                        <span className="font-mono text-xs bg-white/5 px-1 rounded">
                          Ask Question
                        </span>{" "}
                        from context menu
                      </li>
                      <li>Type your question and submit</li>
                    </ol>
                    <div className="rounded overflow-hidden border border-white/10">
                      <Image
                        src="/branchOut.png"
                        alt="Branch out example showing context menu on a node"
                        width={600}
                        height={300}
                        className="w-full h-auto"
                      />
                    </div>
                  </div>

                  {/* Starting from scratch workflow */}
                  <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <h4 className="text-white/90 font-mono text-sm mb-2">
                      Starting from scratch
                    </h4>
                    <ol className="space-y-1 mb-3 text-white/70 text-sm list-decimal list-inside">
                      <li>
                        <span className="font-mono text-xs bg-white/5 px-1 rounded">
                          {isMobile ? "Long press" : "Right click"}
                        </span>{" "}
                        on any empty space on the canvas
                      </li>
                      <li>
                        Choose either{" "}
                        <span className="font-mono text-xs bg-white/5 px-1 rounded">
                          New Question
                        </span>{" "}
                        or{" "}
                        <span className="font-mono text-xs bg-white/5 px-1 rounded">
                          New Context
                        </span>{" "}
                        from context menu
                      </li>
                      <li>Add your content and submit</li>
                    </ol>
                    <div className="rounded overflow-hidden border border-white/10">
                      <Image
                        src="/freeStart.png"
                        alt="Starting from scratch example showing context menu on empty canvas"
                        width={600}
                        height={300}
                        className="w-full h-auto"
                      />
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </motion.div>
        </React.Fragment>
      )}
    </AnimatePresence>
  );
};

export default TipsModal;

