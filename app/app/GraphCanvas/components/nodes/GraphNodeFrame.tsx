import { GraphNode } from "@/app/types/GraphCanvas.types";
import { CanvasContext } from "@/app/app/GraphCanvas/GraphCanvas";
import { motion } from "framer-motion";
import { useContext, useLayoutEffect, useRef } from "react";

function layoutSignature(node: GraphNode): string {
  const reasoning = node.type === "response" ? node.reasoning ?? "" : "";
  const explanation = node.type === "youtube" ? node.explanation ?? "" : "";
  return [
    node.type,
    node.value,
    node.error ?? "",
    reasoning,
    explanation,
  ].join("\0");
}

export function GraphNodeFrame({
  node,
  isSelected,
  onPointerDown,
  onDoubleClick,
  children,
}: {
  node: GraphNode;
  isSelected: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onDoubleClick?: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  const { reportNodeSize } = useContext(CanvasContext);
  const ref = useRef<HTMLDivElement>(null);
  const signature = layoutSignature(node);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const report = () => {
      const width = element.offsetWidth;
      const height = element.offsetHeight;
      if (width <= 0 || height <= 0) {
        return;
      }
      reportNodeSize(node.id, width, height);
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(element);
    element.addEventListener("load", report, true);
    return () => {
      observer.disconnect();
      element.removeEventListener("load", report, true);
    };
  }, [node.id, reportNodeSize]);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    if (element.offsetWidth <= 0 || element.offsetHeight <= 0) {
      return;
    }
    reportNodeSize(node.id, element.offsetWidth, element.offsetHeight);
  }, [node.id, signature, isSelected, reportNodeSize]);

  return (
    <motion.div
      ref={ref}
      className={`absolute cursor-move has-[[data-editing]]:z-40 ${node.type === "response" ? "w-max" : ""}`}
      data-node-id={node.id}
      suppressHydrationWarning
      style={{
        left: node.x,
        top: node.y,
        transformOrigin: "center center",
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
    >
      {children}
    </motion.div>
  );
}
