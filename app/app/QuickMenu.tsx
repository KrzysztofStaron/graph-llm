import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, Check } from "lucide-react";
import React, { useEffect, useState, useRef } from "react";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { setSelectedModel, availableModels } from "../store/settingsSlice";

const QuickMenu = ({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) => {
  const dispatch = useAppDispatch();
  const selectedModel = useAppSelector((state) => state.settings.selectedModel);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (isOpen) {
      const currentIndex = availableModels.findIndex(
        (model) => model.value === selectedModel
      );
      setFocusedIndex(currentIndex >= 0 ? currentIndex : 0);
    }
  }, [isOpen, selectedModel]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex((prev) => (prev + 1) % availableModels.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex((prev) =>
          prev === 0 ? availableModels.length - 1 : prev - 1
        );
      } else if (e.key === "Tab") {
        e.preventDefault();
        if (e.shiftKey) {
          setFocusedIndex((prev) =>
            prev === 0 ? availableModels.length - 1 : prev - 1
          );
        } else {
          setFocusedIndex((prev) => (prev + 1) % availableModels.length);
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        handleModelSelect(availableModels[focusedIndex].value);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, focusedIndex]);

  const handleModelSelect = (modelValue: string) => {
    dispatch(setSelectedModel(modelValue));
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop to block canvas interactions */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px] pointer-events-auto"
            onClick={onClose}
          />
          {/* Menu */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 flex items-center justify-center w-[500px] h-min rounded-lg border border-white/10 bg-[#0a0a0a] shadow-lg backdrop-blur-sm pointer-events-auto"
          >
            <div className="py-1 w-full">
              <div className="px-4 py-2 text-xs font-mono text-white/40 uppercase tracking-wider">
                Select Model
              </div>
              {availableModels.map((model, index) => {
                const isSelected = selectedModel === model.value;
                const isFocused = focusedIndex === index;
                const Icon = isSelected ? Check : ChevronRight;

                return (
                  <button
                    key={model.value}
                    ref={(el) => (buttonRefs.current[index] = el)}
                    onClick={() => handleModelSelect(model.value)}
                    className={`w-full px-4 py-2 text-left text-sm font-mono group hover:bg-white hover:text-black transition-all duration-200 flex items-center gap-2 ${
                      isFocused
                        ? "bg-white/50 text-black"
                        : "bg-transparent"
                    } ${
                      isSelected && !isFocused ? "text-white" : !isFocused ? "text-white/70" : ""
                    }`}
                  >
                    <Icon
                      className={`size-4 opacity-60 group-hover:translate-x-2 transition-all duration-200 ${
                        isSelected || isFocused ? "opacity-100" : ""
                      } ${isFocused ? "translate-x-2" : ""}`}
                    />
                    <span className={`group-hover:translate-x-2 transition-all duration-200 ${
                      isFocused ? "translate-x-2" : ""
                    }`}>
                      {model.label}
                    </span>
                    <span className={`ml-auto text-xs opacity-40 group-hover:opacity-60 ${
                      isFocused ? "opacity-60" : ""
                    }`}>
                      {model.value.split("/")[0]}
                    </span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default QuickMenu;
