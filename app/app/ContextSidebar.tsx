"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type ContextSidebarProps = {
  value: string;
  onChange: (value: string) => void;
  onClose: (finalValue: string) => void;
};

export const ContextSidebar = ({
  value,
  onChange,
  onClose,
}: ContextSidebarProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [localValue, setLocalValue] = useState(value);

  // Sync with external value changes (if any)
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Focus textarea on mount
  useEffect(() => {
    textareaRef.current?.focus();
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
      />

      {/* Sidebar */}
      <div className="fixed right-0 top-0 h-full w-[400px] bg-[#111] border-l border-white/10 z-50 pointer-events-auto flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 className="text-white font-medium text-lg tracking-tight">
            Edit Context
          </h2>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-5 overflow-hidden">
          <textarea
            ref={textareaRef}
            value={localValue}
            onChange={(e) => {
              setLocalValue(e.target.value);
              onChange(e.target.value);
            }}
            placeholder="Enter context content..."
            className="w-full h-full bg-[#0a0a0a] border border-white/10 rounded-xl p-4 text-white text-sm leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-white/20 placeholder:text-white/30"
          />
        </div>
      </div>
    </>
  );
};
