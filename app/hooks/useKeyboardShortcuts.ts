import { useEffect } from "react";

interface UseKeyboardShortcutsProps {
  onFitView: () => void;
  onClearSelection: () => void;
  onUndo: () => void;
}

export function useKeyboardShortcuts({
  onFitView,
  onClearSelection,
  onUndo,
}: UseKeyboardShortcutsProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if typing in input/textarea
      if (
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLInputElement
      ) {
        return;
      }

      if (e.key === "f") {
        onFitView();
      }
      if (e.key === "Escape") {
        onClearSelection();
      }
      // Handle Ctrl+Z (or Cmd+Z on Mac) for undo
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        onUndo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onFitView, onClearSelection, onUndo]);
}
