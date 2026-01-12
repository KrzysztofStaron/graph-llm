import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import {
  ChevronRight,
  Trash2,
  MessageCircle,
  Eraser,
  Plus,
  Upload,
  Minus,
  Delete,
  Headphones,
  Link2,
  Unlink2,
  Pencil,
} from "lucide-react";
import MonoLabel from "./MonoLabel";

export interface ContextMenuItem {
  label: string;
  onClick: () => void;
}

interface ContextMenuProps {
  isOpen: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
  selectedNodeCount: number;
}

export const ContextMenu = ({
  isOpen,
  x,
  y,
  items,
  onClose,
  selectedNodeCount,
}: ContextMenuProps) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState({ x, y });
  const [focusedIndex, setFocusedIndex] = useState(0);
  const shouldReduceMotion = useReducedMotion();

  // Reset position when menu opens or coordinates change
  useEffect(() => {
    if (isOpen) {
      setAdjustedPosition({ x, y });
    }
  }, [isOpen, x, y]);

  // Adjust position to keep menu within viewport bounds
  useEffect(() => {
    if (!isOpen || !menuRef.current) return;

    const menu = menuRef.current;
    const menuRect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let adjustedX = x;
    let adjustedY = y;

    // Add padding from edges (especially important for mobile)
    const edgePadding = 8;

    // Check right edge
    if (adjustedX + menuRect.width > viewportWidth - edgePadding) {
      adjustedX = viewportWidth - menuRect.width - edgePadding;
    }

    // Check left edge
    if (adjustedX < edgePadding) {
      adjustedX = edgePadding;
    }

    // Check bottom edge
    if (adjustedY + menuRect.height > viewportHeight - edgePadding) {
      adjustedY = viewportHeight - menuRect.height - edgePadding;
    }

    // Check top edge
    if (adjustedY < edgePadding) {
      adjustedY = edgePadding;
    }

    setAdjustedPosition({ x: adjustedX, y: adjustedY });
  }, [isOpen, x, y, items]);

  // Reset focus when menu opens
  useEffect(() => {
    if (isOpen) {
      setFocusedIndex(0);
      // Focus first button when menu opens
      setTimeout(() => {
        const firstButton = menuRef.current?.querySelector('button');
        firstButton?.focus();
      }, 0);
    }
  }, [isOpen, items]);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex((prev) => (prev + 1) % items.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex((prev) => (prev - 1 + items.length) % items.length);
      } else if (e.key === "Home") {
        e.preventDefault();
        setFocusedIndex(0);
      } else if (e.key === "End") {
        e.preventDefault();
        setFocusedIndex(items.length - 1);
      }
    };

    // Use capture phase to catch clicks/taps before they bubble
    document.addEventListener("pointerdown", handleClickOutside, true);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handleClickOutside, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose, items.length]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={menuRef}
          initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: -10 }}
          animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
          exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: -10 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className="fixed z-50 min-w-[180px] rounded-lg border border-white/10 bg-[#0a0a0a] shadow-lg backdrop-blur-sm"
          role="menu"
          aria-label={`Context menu${selectedNodeCount > 0 ? ` for ${selectedNodeCount} selected ${selectedNodeCount === 1 ? 'node' : 'nodes'}` : ''}`}
          style={{
            left: `${adjustedPosition.x}px`,
            top: `${adjustedPosition.y}px`,
            pointerEvents: "auto",
          }}
        >
          <div className="py-1">
            {items.map((item, index) => {
              let Icon = ChevronRight;

              if (item.label.includes("Delete")) {
                Icon = item.label.includes("[ with children ]")
                  ? Trash2
                  : Delete;
              } else if (item.label === "Edit") {
                Icon = Pencil;
              } else if (item.label.toLowerCase().includes("new")) {
                Icon = Plus;
              } else if (item.label.includes("Ask Question")) {
                Icon = MessageCircle;
              } else if (item.label.includes("Upload Context")) {
                Icon = Upload;
              } else if (item.label.includes("Listen")) {
                Icon = Headphones;
              } else if (item.label === "Link") {
                Icon = Link2;
              } else if (
                item.label === "Separate" ||
                item.label === "Remove edge"
              ) {
                Icon = Unlink2;
              }

              // Parse label to extract "[ with children ]" part
              const hasChildrenPart = item.label.includes("[ with children ]");
              const mainLabel = hasChildrenPart
                ? item.label.replace(" [ with children ]", "")
                : item.label;

              const isFocused = focusedIndex === index;
              
              return (
                <button
                  key={index}
                  role="menuitem"
                  tabIndex={isFocused ? 0 : -1}
                  ref={(el) => {
                    if (isFocused) {
                      el?.focus();
                    }
                  }}
                  onClick={() => {
                    item.onClick();
                    onClose();
                  }}
                  className={`w-full px-4 py-2 text-left text-sm font-mono text-white bg-transparent group focus:outline-none ${
                    item.label.includes("[ with children ]")
                      ? "hover:bg-red-400"
                      : item.label.includes("Delete")
                      ? "hover:bg-red-400"
                      : "hover:bg-white"
                  } hover:text-black transition-all duration-200 flex items-center gap-2 ${isFocused ? 'bg-white/10' : ''}`}
                >
                  <Icon
                    className={`size-4 opacity-60 group-hover:translate-x-2 transition-all duration-200`}
                  />
                  <span className="group-hover:translate-x-2 transition-all duration-200">
                    {mainLabel}
                  </span>

                  {hasChildrenPart && (
                    <MonoLabel
                      text="with children"
                      className="group-hover:translate-x-2 transition-all duration-200"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
