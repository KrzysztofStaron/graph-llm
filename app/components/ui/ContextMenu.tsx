import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useRef } from "react";
import {
  ChevronRight,
  Trash2,
  MessageCircle,
  Merge,
  Eraser,
  Plus,
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

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    // Use capture phase to catch clicks before they bubble
    document.addEventListener("mousedown", handleClickOutside, true);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside, true);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={menuRef}
          initial={{ opacity: 0, scale: 0.95, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -10 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className="fixed z-50 min-w-[180px] rounded-lg border border-white/10 bg-[#0a0a0a] shadow-lg backdrop-blur-sm"
          style={{
            left: `${x}px`,
            top: `${y}px`,
            pointerEvents: "auto",
          }}
        >
          <div className="py-1">
            {items.map((item, index) => {
              let Icon = ChevronRight;

              if (item.label.includes("Delete")) {
                Icon = item.label.includes("[ with children ]")
                  ? Trash2
                  : Eraser;
              } else if (item.label.toLowerCase().includes("new")) {
                Icon = Plus;
              } else if (item.label.includes("Ask Question")) {
                Icon = MessageCircle;
              }

              // Parse label to extract "[ with children ]" part
              const hasChildrenPart = item.label.includes("[ with children ]");
              const mainLabel = hasChildrenPart
                ? item.label.replace(" [ with children ]", "")
                : item.label;

              return (
                <button
                  key={index}
                  onClick={() => {
                    item.onClick();
                    onClose();
                  }}
                  className={`w-full px-4 py-2 text-left text-sm font-mono text-white bg-transparent group   ${
                    item.label.includes("[ with children ]")
                      ? "hover:bg-red-400"
                      : item.label.includes("Delete")
                      ? "hover:bg-red-400"
                      : "hover:bg-white"
                  } hover:text-black transition-all duration-200 flex items-center gap-2`}
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
