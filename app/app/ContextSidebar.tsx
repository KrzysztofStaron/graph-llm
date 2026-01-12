"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type ContextSidebarProps = {
  value: string;
  onChange?: (value: string) => void;
  onClose: (finalValue: string) => void;
};

export const ContextSidebar = ({
  value,
  onChange,
  onClose,
}: ContextSidebarProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [localValue, setLocalValue] = useState(value);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);

  // Sync with external value changes (if any)
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Store previously focused element and focus textarea on mount
  useEffect(() => {
    previouslyFocusedElementRef.current = document.activeElement as HTMLElement;
    textareaRef.current?.focus();
    
    // Focus trap: prevent focus from leaving sidebar
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        const focusableElements = sidebarRef.current?.querySelectorAll(
          'button, textarea, [href], input, select, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusableElements || focusableElements.length === 0) return;
        
        const firstElement = focusableElements[0] as HTMLElement;
        const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;
        
        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };
    
    sidebarRef.current?.addEventListener('keydown', handleKeyDown);
    return () => {
      sidebarRef.current?.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Restore focus when sidebar closes
  useEffect(() => {
    return () => {
      if (previouslyFocusedElementRef.current) {
        previouslyFocusedElementRef.current.focus();
      }
    };
  }, []);

  const handleClose = () => {
    onClose(localValue);
  };

  // Handle Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [localValue, onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40 pointer-events-auto"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Sidebar */}
      <div
        ref={sidebarRef}
        className="fixed right-0 top-0 h-full w-[400px] bg-[#111] border-l border-white/10 z-50 pointer-events-auto flex flex-col shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="context-sidebar-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 id="context-sidebar-title" className="text-white font-medium text-lg tracking-tight">
            Edit Context
          </h2>
          <button
            ref={closeButtonRef}
            onClick={handleClose}
            className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors focus:outline-none"
            aria-label="Close context editor"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-5 overflow-hidden">
          <label htmlFor="context-textarea" className="sr-only">
            Context content
          </label>
          <textarea
            id="context-textarea"
            ref={textareaRef}
            value={localValue}
            onChange={(e) => {
              setLocalValue(e.target.value);
              onChange?.(e.target.value);
            }}
            placeholder="Enter context content..."
            className="w-full h-full bg-[#0a0a0a] border border-white/10 rounded-xl p-4 text-white text-sm leading-relaxed resize-none focus:outline-none placeholder:text-white/30"
            aria-label="Context content editor"
          />
        </div>
      </div>
    </>
  );
};
