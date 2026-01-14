import { useEffect, useRef } from "react";
import { useLatest } from "./useLatest";

interface UseKeyboardShortcutsProps {
  onFitView?: () => void;
  onClearSelection?: () => void;
  onUndo?: () => void;
  onQuickMenu?: () => void;
  onPanCanvas?: (dx: number, dy: number) => void;
}

export function useKeyboardShortcuts({
  onFitView,
  onClearSelection,
  onUndo,
  onQuickMenu,
  onPanCanvas,
}: UseKeyboardShortcutsProps) {
  const panSpeed = 3; // pixels per frame at 60fps - smooth and fast
  const initialPanSpeed = 5; // Same speed for consistent feel
  const animationFrameRef = useRef<number | null>(null);
  const pressedKeysRef = useRef<Set<string>>(new Set());

  // Use useLatest for all callbacks - prevents effect re-runs while keeping callbacks fresh
  const onPanCanvasRef = useLatest(onPanCanvas);
  const onFitViewRef = useLatest(onFitView);
  const onClearSelectionRef = useLatest(onClearSelection);
  const onUndoRef = useLatest(onUndo);
  const onQuickMenuRef = useLatest(onQuickMenu);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const animate = () => {
      const panCanvas = onPanCanvasRef.current;
      if (!panCanvas) {
        animationFrameRef.current = null;
        return;
      }

      let dx = 0;
      let dy = 0;
      
      if (pressedKeysRef.current.has("ArrowLeft")) dx += panSpeed; // Left arrow moves left (flipped)
      if (pressedKeysRef.current.has("ArrowRight")) dx -= panSpeed; // Right arrow moves right (flipped)
      if (pressedKeysRef.current.has("ArrowUp")) dy += panSpeed; // Up arrow moves up (flipped)
      if (pressedKeysRef.current.has("ArrowDown")) dy -= panSpeed; // Down arrow moves down (flipped)

      // Always continue animation loop if there are any pressed keys
      if (pressedKeysRef.current.size > 0) {
        if (dx !== 0 || dy !== 0) {
          panCanvas(dx, dy);
        }
        // Continue animation loop as long as keys are pressed
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        // No keys pressed, stop animation
        animationFrameRef.current = null;
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if typing in input/textarea
      if (
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLInputElement
      ) {
        return;
      }

      // Handle arrow keys for panning
      if (
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight" ||
        e.key === "ArrowUp" ||
        e.key === "ArrowDown"
      ) {
        e.preventDefault();
        
        // Check if panCanvas is available
        if (!onPanCanvasRef.current) return;
        
        // Add key to pressed keys set (even if already there, to handle key repeat)
        const wasAlreadyPressed = pressedKeysRef.current.has(e.key);
        pressedKeysRef.current.add(e.key);
        
        // If this is the first time pressing this key, do an immediate pan for responsiveness
        if (!wasAlreadyPressed) {
          let dx = 0;
          let dy = 0;
          if (e.key === "ArrowLeft") dx += initialPanSpeed; // Left arrow moves left (flipped)
          if (e.key === "ArrowRight") dx -= initialPanSpeed; // Right arrow moves right (flipped)
          if (e.key === "ArrowUp") dy += initialPanSpeed; // Up arrow moves up (flipped)
          if (e.key === "ArrowDown") dy -= initialPanSpeed; // Down arrow moves down (flipped)
          // Call immediately, synchronously for zero lag
          onPanCanvasRef.current(dx, dy);
        }
        
        // Start animation loop if not already running
        if (animationFrameRef.current === null) {
          animationFrameRef.current = requestAnimationFrame(animate);
        }

        return;
      }

      if (e.key === "f") {
        onFitViewRef.current?.();
      }
      if (e.key === "Escape") {
        onClearSelectionRef.current?.();
      }
      // Handle Ctrl+Z (or Cmd+Z on Mac) for undo
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        onUndoRef.current?.();
      }

      // ctrl + k for quick menu
      if (e.key == "k" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        onQuickMenuRef.current?.();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // Remove key from pressed keys set
      if (
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight" ||
        e.key === "ArrowUp" ||
        e.key === "ArrowDown"
      ) {
        pressedKeysRef.current.delete(e.key);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, []);
}
