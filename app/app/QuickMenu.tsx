import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronRight, Check, Globe } from "lucide-react";
import React, { useEffect, useState, useRef, useCallback } from "react";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { 
  setSelectedModel, 
  setSelectedImageModel,
  setWebSearchEnabled,
  availableModels, 
  availableImageModels,
  ModelOption 
} from "../store/settingsSlice";

const SettingsModal = ({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) => {
  const dispatch = useAppDispatch();
  const selectedModel = useAppSelector((state) => state.settings.selectedModel);
  const selectedImageModel = useAppSelector((state) => state.settings.selectedImageModel);
  const webSearchEnabled = useAppSelector((state) => state.settings.webSearchEnabled);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const shouldReduceMotion = useReducedMotion();

  const allModels = [...availableModels, ...availableImageModels];
  
  // Detect mobile device
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => {
      const hasCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
      const hasNoHover = window.matchMedia("(hover: none)").matches;
      setIsMobile(hasCoarsePointer || hasNoHover);
    };
    checkMobile();
  }, []);
  
  const getInitialIndex = () => {
    // On mobile, don't pre-select/focus any model
    if (isMobile) return -1;
    
    // On desktop, focus the currently selected model
    const currentIndex = allModels.findIndex(
      (model) => model.value === selectedModel || model.value === selectedImageModel
    );
    return currentIndex >= 0 ? currentIndex : 0;
  };

  const [focusedIndex, setFocusedIndex] = useState(getInitialIndex);

  // Reset focus when modal opens, respecting mobile/desktop state
  useEffect(() => {
    if (isOpen) {
      setFocusedIndex(getInitialIndex());
    }
  }, [isOpen, isMobile]);

  const handleModelSelect = useCallback(
    (modelValue: string, isImageModel: boolean) => {
      if (isImageModel) {
        dispatch(setSelectedImageModel(modelValue));
      } else {
        dispatch(setSelectedModel(modelValue));
      }
      onClose();
    },
    [dispatch, onClose]
  );

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex((prev) => {
          if (prev === -1) return 0; // Start from first item if no focus
          return (prev + 1) % allModels.length;
        });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex((prev) => {
          if (prev === -1) return allModels.length - 1; // Start from last item if no focus
          return prev === 0 ? allModels.length - 1 : prev - 1;
        });
      } else if (e.key === "Tab") {
        e.preventDefault();
        if (e.shiftKey) {
          setFocusedIndex((prev) => {
            if (prev === -1) return allModels.length - 1;
            return prev === 0 ? allModels.length - 1 : prev - 1;
          });
        } else {
          setFocusedIndex((prev) => {
            if (prev === -1) return 0;
            return (prev + 1) % allModels.length;
          });
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (focusedIndex === -1) return; // No action if nothing focused
        const model = allModels[focusedIndex];
        const isImageModel = availableImageModels.some(m => m.value === model.value);
        handleModelSelect(model.value, isImageModel);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, focusedIndex, handleModelSelect, onClose, allModels]);

  return (
    <AnimatePresence>
      {isOpen && (
        <React.Fragment key={`menu-${isOpen}`}>
          {/* Backdrop to block canvas interactions */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.15 }}
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px] pointer-events-auto"
            onClick={onClose}
            aria-hidden="true"
          />
          {/* Menu */}
          <motion.div
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: -10 }}
            animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 flex items-center justify-center w-[500px] max-w-[calc(100vw-32px)] h-min rounded-lg border border-white/10 bg-[#0a0a0a] shadow-lg backdrop-blur-sm pointer-events-auto"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-modal-title"
          >
            <div className="py-1 w-full">
              <div id="settings-modal-title" className="px-4 py-2 text-xs font-mono text-white/40 uppercase tracking-wider">
                Settings
              </div>
              
              {/* Main Model Section */}
              <div className="px-4 py-2 text-xs font-mono text-white/30 uppercase tracking-wider">
                Main Model
              </div>
              {availableModels.map((model, index) => {
                const isSelected = selectedModel === model.value;
                const isFocused = focusedIndex === index;
                const Icon = isSelected ? Check : ChevronRight;

                return (
                  <button
                    key={model.value}
                    ref={(el) => {
                      buttonRefs.current[index] = el;
                      if (isFocused) {
                        el?.focus();
                      }
                    }}
                    onClick={() => handleModelSelect(model.value, false)}
                    aria-pressed={isSelected}
                    tabIndex={isFocused ? 0 : -1}
                    className={`w-full px-4 py-2 text-left text-sm font-mono group hover:bg-white hover:text-black transition-[background-color,transform] duration-200 flex items-center gap-2 min-w-0 focus:outline-none ${
                      isFocused ? "bg-white/90 text-black" : "bg-transparent"
                    } ${
                      isSelected && !isFocused
                        ? "text-white"
                        : !isFocused
                        ? "text-white/70"
                        : ""
                    }`}
                  >
                    <Icon
                      className={`size-4 opacity-60 group-hover:translate-x-2 transition-all duration-200 ${
                        isSelected || isFocused ? "opacity-100" : ""
                      } ${isFocused ? "translate-x-2" : ""}`}
                    />
                    <span
                      className={`min-w-0 flex-1 truncate group-hover:translate-x-2 transition-all duration-200 ${
                        isFocused ? "translate-x-2" : ""
                      }`}
                    >
                      {model.label}
                    </span>
                    <span
                      className={`ml-auto shrink-0 text-xs opacity-40 group-hover:opacity-60 ${
                        isFocused ? "opacity-60" : ""
                      }`}
                    >
                      {model.value.split("/")[0]}
                    </span>
                  </button>
                );
              })}

              {/* Image Generation Model Section */}
              <div className="px-4 py-2 mt-4 text-xs font-mono text-white/30 uppercase tracking-wider">
                Image Generation Model
              </div>
              {availableImageModels.map((model, index) => {
                const actualIndex = availableModels.length + index;
                const isSelected = selectedImageModel === model.value;
                const isFocused = focusedIndex === actualIndex;
                const Icon = isSelected ? Check : ChevronRight;

                return (
                  <button
                    key={model.value}
                    ref={(el) => {
                      buttonRefs.current[actualIndex] = el;
                      if (isFocused) {
                        el?.focus();
                      }
                    }}
                    onClick={() => handleModelSelect(model.value, true)}
                    aria-pressed={isSelected}
                    tabIndex={isFocused ? 0 : -1}
                    className={`w-full px-4 py-2 text-left text-sm font-mono group hover:bg-white hover:text-black transition-[background-color,transform] duration-200 flex items-center gap-2 min-w-0 focus:outline-none ${
                      isFocused ? "bg-white/90 text-black" : "bg-transparent"
                    } ${
                      isSelected && !isFocused
                        ? "text-white"
                        : !isFocused
                        ? "text-white/70"
                        : ""
                    }`}
                  >
                    <Icon
                      className={`size-4 opacity-60 group-hover:translate-x-2 transition-all duration-200 ${
                        isSelected || isFocused ? "opacity-100" : ""
                      } ${isFocused ? "translate-x-2" : ""}`}
                    />
                    <span
                      className={`min-w-0 flex-1 truncate group-hover:translate-x-2 transition-all duration-200 ${
                        isFocused ? "translate-x-2" : ""
                      }`}
                    >
                      {model.label}
                    </span>
                    <span
                      className={`ml-auto shrink-0 text-xs opacity-40 group-hover:opacity-60 ${
                        isFocused ? "opacity-60" : ""
                      }`}
                    >
                      {model.value.split("/")[0]}
                    </span>
                  </button>
                );
              })}

              {/* Web Search Feature Section */}
              <div className="px-4 py-2 mt-4 text-xs font-mono text-white/30 uppercase tracking-wider">
                Features
              </div>
              <button
                onClick={() => dispatch(setWebSearchEnabled(!webSearchEnabled))}
                aria-pressed={webSearchEnabled}
                className="w-full px-4 py-2 text-left text-sm font-mono group hover:bg-white hover:text-black transition-[background-color,transform] duration-200 flex items-center gap-2 min-w-0 focus:outline-none"
              >
                <Globe
                  className={`size-4 transition-all duration-200 ${
                    webSearchEnabled ? "opacity-100 text-green-400" : "opacity-40"
                  } group-hover:opacity-100`}
                />
                <span className="min-w-0 flex-1 truncate text-white/70 group-hover:text-black">
                  Web Search
                </span>
                <div className={`ml-auto shrink-0 w-10 h-5 rounded-full transition-colors duration-200 relative ${
                  webSearchEnabled ? "bg-green-500" : "bg-white/20"
                }`}>
                  <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform duration-200 ${
                    webSearchEnabled ? "translate-x-5" : "translate-x-0"
                  }`} />
                </div>
              </button>
            </div>
          </motion.div>
        </React.Fragment>
      )}
    </AnimatePresence>
  );
};

export default SettingsModal;
