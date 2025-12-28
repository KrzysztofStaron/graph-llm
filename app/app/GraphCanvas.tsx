import { motion } from "framer-motion";
import { InputFieldNode, ResponseNode, ContextNode } from "./nodes";
import { GraphNode, GraphNodes } from "../types/graph";
import { useEffect, useRef, useState, useCallback } from "react";
import * as d3 from "d3";
import { Maximize } from "lucide-react";

interface GraphCanvasProps {
  nodes: GraphNodes;
  transform: { x: number; y: number; k: number };
  setTransform: (transform: { x: number; y: number; k: number }) => void;
  onMouseDown: (e: React.MouseEvent, nodeId?: string) => void;
  onInputSubmit: (query: string, caller: GraphNode) => void;
  onAddNodeFromResponse: (responseNode: GraphNode, position: "left" | "right") => void;
}

type NodeDimensions = Record<string, { width: number; height: number }>;

const getNodeCenter = (node: GraphNode, dimensions: NodeDimensions) => {
  const dim = dimensions[node.id];
  const width = dim?.width ?? (node.type === "context" ? 96 : 400);
  const height = dim?.height ?? (node.type === "context" ? 96 : node.type === "input" ? 120 : 80);

  return {
    x: node.x + width / 2,
    y: node.y + height / 2,
  };
};

export const GraphCanvas = ({
  nodes,
  transform,
  setTransform,
  onMouseDown,
  onInputSubmit,
  onAddNodeFromResponse,
}: GraphCanvasProps) => {
  const nodeArray = Object.values(nodes);
  const edges = nodeArray.flatMap(node => node.childrenIds.map(to => ({ from: node.id, to })));

  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [nodeDimensions, setNodeDimensions] = useState<NodeDimensions>({});
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<HTMLDivElement, unknown> | null>(null);

  const updateNodeDimension = useCallback((nodeId: string, width: number, height: number) => {
    setNodeDimensions(prev => {
      const existing = prev[nodeId];
      if (existing && existing.width === width && existing.height === height) {
        return prev;
      }
      return { ...prev, [nodeId]: { width, height } };
    });
  }, []);

  const fitView = useCallback(
    (duration = 750) => {
      if (!viewportRef.current || !zoomBehaviorRef.current || nodeArray.length === 0) return;

      const padding = 100;
      const { clientWidth, clientHeight } = viewportRef.current;

      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;

      nodeArray.forEach(node => {
        const dim = nodeDimensions[node.id] || {
          width: node.type === "context" ? 96 : 400,
          height: node.type === "context" ? 96 : node.type === "input" ? 120 : 80,
        };
        minX = Math.min(minX, node.x);
        minY = Math.min(minY, node.y);
        maxX = Math.max(maxX, node.x + dim.width);
        maxY = Math.max(maxY, node.y + dim.height);
      });

      const contentWidth = maxX - minX;
      const contentHeight = maxY - minY;

      if (contentWidth <= 0 || contentHeight <= 0) return;

      const scale = Math.min(
        (clientWidth - padding * 2) / contentWidth,
        (clientHeight - padding * 2) / contentHeight,
        1.5 // Max scale when fitting
      );

      const tx = clientWidth / 2 - (minX + contentWidth / 2) * scale;
      const ty = clientHeight / 2 - (minY + contentHeight / 2) * scale;

      const newTransform = d3.zoomIdentity.translate(tx, ty).scale(scale);

      d3.select(viewportRef.current)
        .transition()
        .duration(duration)
        .call(zoomBehaviorRef.current.transform, newTransform);
    },
    [nodeArray, nodeDimensions]
  );

  // Initialize zoom behavior
  useEffect(() => {
    if (!viewportRef.current) return;

    const zoom = d3
      .zoom<HTMLDivElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", event => {
        const { x, y, k } = event.transform;
        if (contentRef.current) {
          contentRef.current.style.transform = `translate(${x}px, ${y}px) scale(${k})`;
        }
        setTransform({ x, y, k });
      })
      .filter(event => {
        // Only allow zoom/pan if not clicking on buttons or inputs
        const target = event.target as HTMLElement;

        // Always allow zoom with wheel (unless stopped by stopPropagation)
        if (event.type === "wheel") return true;

        // For other events (mousedown, touchstart), filter out interactive elements and nodes
        return (
          !event.button &&
          target.tagName !== "BUTTON" &&
          target.tagName !== "TEXTAREA" &&
          target.tagName !== "INPUT" &&
          !target.closest(".cursor-pointer") &&
          !target.closest(".cursor-text") &&
          // Prevent panning if we are clicking directly on a node's drag handle
          !target.closest("[data-node-id]")
        );
      });

    const svg = d3.select(viewportRef.current);
    svg.call(zoom);
    zoomBehaviorRef.current = zoom;

    // Set initial transform without transition
    svg.call(zoom.transform, d3.zoomIdentity.translate(transform.x, transform.y).scale(transform.k));

    return () => {
      svg.on(".zoom", null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "f" && !(e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement)) {
        fitView();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [fitView]);

  // Set up ResizeObserver to track all node dimensions
  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;

    const observer = new ResizeObserver(entries => {
      entries.forEach(entry => {
        const element = entry.target as HTMLElement;
        const nodeId = element.dataset.nodeId;
        if (nodeId) {
          updateNodeDimension(nodeId, element.offsetWidth, element.offsetHeight);
        }
      });
    });

    // Use MutationObserver to detect when nodes are added/removed
    const mutationObserver = new MutationObserver(() => {
      const nodeElements = container.querySelectorAll<HTMLElement>("[data-node-id]");
      nodeElements.forEach(element => {
        observer.observe(element);
      });
    });

    mutationObserver.observe(container, { childList: true, subtree: true });

    // Initial observation of existing nodes
    const nodeElements = container.querySelectorAll<HTMLElement>("[data-node-id]");
    nodeElements.forEach(element => {
      observer.observe(element);
    });

    return () => {
      observer.disconnect();
      mutationObserver.disconnect();
    };
  }, [updateNodeDimension]);

  return (
    <div className="relative w-full h-screen overflow-hidden">
      <motion.div
        ref={viewportRef}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="w-full h-screen overflow-hidden pointer-events-auto cursor-grab active:cursor-grabbing select-none"
      >
        <div
          ref={contentRef}
          className="relative origin-top-left"
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})`,
          }}
        >
          {/* SVG inside container so it transforms with nodes - no clipping issues */}
          <svg
            className="absolute pointer-events-none"
            style={{
              overflow: "visible",
              left: 0,
              top: 0,
              width: 1,
              height: 1,
            }}
          >
            {edges.map(edge => {
              const fromNode = nodes[edge.from];
              const toNode = nodes[edge.to];
              if (!fromNode || !toNode) return null;
              const from = getNodeCenter(fromNode, nodeDimensions);
              const to = getNodeCenter(toNode, nodeDimensions);
              return (
                <line
                  key={`${edge.from}-${edge.to}`}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke="rgba(255, 255, 255, 0.2)"
                  strokeWidth={2}
                />
              );
            })}
          </svg>

          {nodeArray.map(node => (
            <div
              key={node.id}
              className={`absolute cursor-move ${node.type === "response" ? "w-max" : ""}`}
              data-node-id={node.id}
              style={{ left: node.x, top: node.y }}
              onMouseDown={e => {
                onMouseDown(e, node.id);
              }}
            >
              {node.type === "input" && (
                <InputFieldNode node={node} onInputSubmit={query => onInputSubmit(query, node)} />
              )}
              {node.type === "response" && (
                <ResponseNode node={node} onAddNode={position => onAddNodeFromResponse(node, position)} />
              )}
              {node.type === "context" && <ContextNode node={node} />}
            </div>
          ))}
        </div>
      </motion.div>

      {/* UI Controls */}
      <div className="absolute bottom-6 right-6 flex flex-col gap-2 z-50">
        <button
          onClick={() => fitView()}
          className="p-3 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 backdrop-blur-md text-white transition-all active:scale-95"
          title="Fit to view (F)"
        >
          <Maximize className="size-5" />
        </button>
      </div>
    </div>
  );
};
