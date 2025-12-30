import { motion, AnimatePresence } from "framer-motion";
import { InputFieldNode } from "./nodes/InputFieldNode";
import { ResponseNode } from "./nodes/ResponseNode";
import { ContextNode } from "./nodes/ContextNode";
import { ImageContextNode } from "./nodes/ImageContextNode";
import { GraphNode, GraphNodes } from "../types/graph";
import { useEffect, useRef, useState, useCallback } from "react";
import * as d3 from "d3";
import { ParticleEffect } from "../components/ui/ParticleEffect";
import { resolveLocalCollisions } from "../utils/collisionResolver";

interface GraphCanvasProps {
  nodes: GraphNodes;
  transform: { x: number; y: number; k: number };
  setTransform: (transform: { x: number; y: number; k: number }) => void;
  onMouseDown: (e: React.MouseEvent, nodeId?: string) => void;
  onInputSubmit: (query: string, caller: GraphNode) => void;
  onDeleteNode: (nodeId: string) => void;
  onContextNodeDoubleClick?: (nodeId: string) => void;
  onDropFilesAsContext?: (
    files: FileList,
    canvasPoint: { x: number; y: number }
  ) => void;
  onNodeDimensionsChange?: (dimensions: NodeDimensions) => void;
  onRequestNodeMove?: (nodeId: string, dx: number, dy: number) => void;
  onRequestContextMenu?: (
    clientX: number,
    clientY: number,
    nodeId?: string
  ) => void;
  selectedNodeIds?: Set<string>;
  onClearSelection?: () => void;
}

type NodeDimensions = Record<string, { width: number; height: number }>;

const getNodeCenter = (node: GraphNode, dimensions: NodeDimensions) => {
  const dim = dimensions[node.id];
  const width =
    dim?.width ??
    (node.type === "context" ? 176 : node.type === "image-context" ? 232 : 400);
  const height =
    dim?.height ??
    (node.type === "context"
      ? 96
      : node.type === "image-context"
      ? 192
      : node.type === "input"
      ? 120
      : 80);

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
  onDeleteNode,
  onContextNodeDoubleClick,
  onDropFilesAsContext,
  onNodeDimensionsChange,
  onRequestNodeMove,
  onRequestContextMenu,
  selectedNodeIds,
  onClearSelection,
}: GraphCanvasProps) => {
  const nodeArray = Object.values(nodes);
  const edges = nodeArray.flatMap((node) =>
    node.childrenIds.map((to) => ({ from: node.id, to }))
  );

  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [nodeDimensions, setNodeDimensions] = useState<NodeDimensions>({});
  const [appearingNodes, setAppearingNodes] = useState<
    Record<string, { x: number; y: number }>
  >({});
  const [deletingNodes, setDeletingNodes] = useState<
    Record<string, { x: number; y: number }>
  >({});
  const nodesSnapshotRef = useRef<GraphNodes>(nodes);
  const hasMountedRef = useRef(false);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<
    HTMLDivElement,
    unknown
  > | null>(null);

  const updateNodeDimension = useCallback(
    (nodeId: string, width: number, height: number) => {
      setNodeDimensions((prev) => {
        const existing = prev[nodeId];
        if (
          existing &&
          existing.width === width &&
          existing.height === height
        ) {
          return prev;
        }
        const updated = { ...prev, [nodeId]: { width, height } };

        // Defer parent state updates and side effects to avoid React warnings
        requestAnimationFrame(() => {
          // Notify parent of dimension changes
          onNodeDimensionsChange?.(updated);

          // If this is a response node that grew, trigger collision resolution
          const node = nodes[nodeId];
          if (
            node?.type === "response" &&
            existing &&
            onRequestNodeMove &&
            (height > existing.height + 5 || width > existing.width + 5)
          ) {
            // Run collision resolution multiple times for more aggressive push
            const moves = resolveLocalCollisions(nodeId, nodes, updated);
            for (const move of moves) {
              onRequestNodeMove(move.nodeId, move.dx, move.dy);
            }
          }
        });

        return updated;
      });
    },
    [onNodeDimensionsChange, onRequestNodeMove, nodes]
  );

  const fitView = useCallback(
    (duration = 750) => {
      if (
        !viewportRef.current ||
        !zoomBehaviorRef.current ||
        nodeArray.length === 0
      )
        return;

      const padding = 250;
      const { clientWidth, clientHeight } = viewportRef.current;

      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;

      nodeArray.forEach((node) => {
        const dim = nodeDimensions[node.id] || {
          width:
            node.type === "context"
              ? 176
              : node.type === "image-context"
              ? 232
              : 400,
          height:
            node.type === "context"
              ? 96
              : node.type === "image-context"
              ? 192
              : node.type === "input"
              ? 120
              : 80,
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

  // Handle canvas clicks to clear selection (before d3-zoom processes them)
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !onClearSelection) return;

    const handleCanvasMouseDown = (e: MouseEvent) => {
      // Don't clear selection on right-click (button 2)
      if (e.button === 2) return;

      const target = e.target as HTMLElement;

      // Only handle if clicking on canvas background (not on a node)
      const closestNode = target.closest("[data-node-id]");
      if (!closestNode && !e.shiftKey) {
        onClearSelection();
      }
    };

    // Use capture phase to fire before d3-zoom
    viewport.addEventListener("mousedown", handleCanvasMouseDown, true);

    return () => {
      viewport.removeEventListener("mousedown", handleCanvasMouseDown, true);
    };
  }, [onClearSelection]);

  // Initialize zoom behavior
  useEffect(() => {
    if (!viewportRef.current) return;

    const zoom = d3
      .zoom<HTMLDivElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        const { x, y, k } = event.transform;
        if (contentRef.current) {
          contentRef.current.style.transform = `translate(${x}px, ${y}px) scale(${k})`;
        }
        setTransform({ x, y, k });
      })
      .filter((event) => {
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
    svg.call(
      zoom.transform,
      d3.zoomIdentity.translate(transform.x, transform.y).scale(transform.k)
    );

    return () => {
      svg.on(".zoom", null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "f" &&
        !(
          e.target instanceof HTMLTextAreaElement ||
          e.target instanceof HTMLInputElement
        )
      ) {
        fitView();
      }
      if (
        e.key === "Escape" &&
        !(
          e.target instanceof HTMLTextAreaElement ||
          e.target instanceof HTMLInputElement
        )
      ) {
        onClearSelection?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [fitView, onClearSelection]);

  // Track node appear/delete to show particle effects
  useEffect(() => {
    const currentNodeIds = new Set(Object.keys(nodes));
    const previousNodes = nodesSnapshotRef.current;

    // Skip particles on the very first render
    if (hasMountedRef.current === false) {
      hasMountedRef.current = true;
      nodesSnapshotRef.current = nodes;
      return;
    }

    // Find newly added nodes
    Object.keys(nodes).forEach((nodeId) => {
      if (previousNodes[nodeId]) return;

      const addedNode = nodes[nodeId];
      const dim = nodeDimensions[nodeId] || {
        width:
          addedNode.type === "context"
            ? 176
            : addedNode.type === "image-context"
            ? 232
            : addedNode.type === "input"
            ? 400
            : 200,
        height:
          addedNode.type === "context"
            ? 96
            : addedNode.type === "image-context"
            ? 192
            : addedNode.type === "input"
            ? 120
            : 80,
      };

      const center = {
        x: addedNode.x + dim.width / 2,
        y: addedNode.y + dim.height / 2,
      };

      const screenX = center.x * transform.k + transform.x;
      const screenY = center.y * transform.k + transform.y;

      setAppearingNodes((prev) => ({
        ...prev,
        [nodeId]: { x: screenX, y: screenY },
      }));

      setTimeout(() => {
        setAppearingNodes((prev) => {
          const next = { ...prev };
          delete next[nodeId];
          return next;
        });
      }, 200);
    });

    // Find deleted nodes
    Object.keys(previousNodes).forEach((nodeId) => {
      if (!currentNodeIds.has(nodeId)) {
        // Node was deleted, get its center position from the snapshot
        const deletedNode = previousNodes[nodeId];
        if (deletedNode) {
          const dim = nodeDimensions[nodeId] || {
            width:
              deletedNode.type === "context"
                ? 176
                : deletedNode.type === "image-context"
                ? 232
                : deletedNode.type === "input"
                ? 400
                : 200,
            height:
              deletedNode.type === "context"
                ? 96
                : deletedNode.type === "image-context"
                ? 192
                : deletedNode.type === "input"
                ? 120
                : 80,
          };
          const center = {
            x: deletedNode.x + dim.width / 2,
            y: deletedNode.y + dim.height / 2,
          };

          // Apply transform to get screen coordinates
          const screenX = center.x * transform.k + transform.x;
          const screenY = center.y * transform.k + transform.y;

          setDeletingNodes((prev) => ({
            ...prev,
            [nodeId]: { x: screenX, y: screenY },
          }));

          // Remove after animation completes
          setTimeout(() => {
            setDeletingNodes((prev) => {
              const next = { ...prev };
              delete next[nodeId];
              return next;
            });
          }, 200);
        }
      }
    });

    // Update snapshot
    nodesSnapshotRef.current = nodes;
  }, [nodes, nodeDimensions, transform]);

  // Set up ResizeObserver to track all node dimensions
  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      entries.forEach((entry) => {
        const element = entry.target as HTMLElement;
        const nodeId = element.dataset.nodeId;
        if (nodeId) {
          updateNodeDimension(
            nodeId,
            element.offsetWidth,
            element.offsetHeight
          );
        }
      });
    });

    // Use MutationObserver to detect when nodes are added/removed
    const mutationObserver = new MutationObserver(() => {
      const nodeElements =
        container.querySelectorAll<HTMLElement>("[data-node-id]");
      nodeElements.forEach((element) => {
        observer.observe(element);
      });
    });

    mutationObserver.observe(container, { childList: true, subtree: true });

    // Initial observation of existing nodes
    const nodeElements =
      container.querySelectorAll<HTMLElement>("[data-node-id]");
    nodeElements.forEach((element) => {
      observer.observe(element);
    });

    return () => {
      observer.disconnect();
      mutationObserver.disconnect();
    };
  }, [updateNodeDimension]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (!onDropFilesAsContext || !e.dataTransfer.files.length) return;

      // Convert screen coordinates to canvas coordinates
      const canvasX = (e.clientX - transform.x) / transform.k;
      const canvasY = (e.clientY - transform.y) / transform.k;

      onDropFilesAsContext(e.dataTransfer.files, { x: canvasX, y: canvasY });
    },
    [onDropFilesAsContext, transform]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!onRequestContextMenu) return;

      e.preventDefault();
      e.stopPropagation();

      // Check if click was on a node
      const nodeElement = (e.target as HTMLElement).closest(
        "[data-node-id]"
      ) as HTMLElement | null;
      const nodeId = nodeElement?.dataset.nodeId;

      onRequestContextMenu(e.clientX, e.clientY, nodeId);
    },
    [onRequestContextMenu]
  );

  return (
    <div className="relative w-full h-screen overflow-hidden">
      <motion.div
        ref={viewportRef}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="w-full h-screen overflow-hidden pointer-events-auto cursor-grab active:cursor-grabbing select-none"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onContextMenu={handleContextMenu}
        onMouseDown={(e) => {
          // Don't handle right-clicks
          if (e.button === 2) return;

          // Only handle if clicking directly on the viewport (not on a node)
          const target = e.target as HTMLElement;
          const closestNode = target.closest(
            "[data-node-id]"
          ) as HTMLElement | null;
          if (!closestNode) {
            onMouseDown(e);
          }
        }}
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
            <AnimatePresence>
              {edges.map((edge) => {
                const fromNode = nodes[edge.from];
                const toNode = nodes[edge.to];
                if (!fromNode || !toNode) return null;
                const from = getNodeCenter(fromNode, nodeDimensions);
                const to = getNodeCenter(toNode, nodeDimensions);
                const isAppearing = edge.to in appearingNodes;
                return (
                  <motion.line
                    key={`${edge.from}-${edge.to}`}
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke="white"
                    strokeWidth={2}
                    initial={isAppearing ? { opacity: 0 } : { opacity: 0.2 }}
                    animate={{ opacity: 0.2 }}
                    transition={{
                      duration: 0.2,
                      ease: "easeOut",
                    }}
                  />
                );
              })}
            </AnimatePresence>
          </svg>

          <AnimatePresence mode="popLayout" initial={false}>
            {nodeArray.map((node) => {
              const isSelected = selectedNodeIds?.has(node.id) ?? false;
              return (
                <motion.div
                  key={node.id}
                  className={`absolute cursor-move ${
                    node.type === "response" ? "w-max" : ""
                  }`}
                  data-node-id={node.id}
                  style={{
                    left: node.x,
                    top: node.y,
                    transformOrigin: "center center",
                    boxShadow: isSelected
                      ? "0 0 0 2px rgba(255, 255, 255, 0.5), 0 0 20px rgba(255, 255, 255, 0.3)"
                      : undefined,
                    transition: "box-shadow 0.2s ease",
                  }}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{
                    scale: 1,
                    opacity: 1,
                    transition: {
                      duration: 0.2,
                      ease: "easeOut",
                    },
                  }}
                  exit={{
                    scale: 0,
                    opacity: 0,
                    transition: {
                      duration: 0.2,
                      ease: "easeIn",
                    },
                  }}
                  onMouseDown={(e) => {
                    onMouseDown(e, node.id);
                  }}
                  onDoubleClick={(e) => {
                    if (node.type === "context" && onContextNodeDoubleClick) {
                      e.stopPropagation();
                      onContextNodeDoubleClick(node.id);
                    }
                  }}
                >
                  {node.type === "input" && (
                    <InputFieldNode
                      node={node}
                      onInputSubmit={(query) => onInputSubmit(query, node)}
                      onDelete={() => onDeleteNode(node.id)}
                    />
                  )}
                  {node.type === "response" && <ResponseNode node={node} />}
                  {node.type === "context" && <ContextNode node={node} />}
                  {node.type === "image-context" && (
                    <ImageContextNode node={node} />
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Particle effects for appearing nodes - outside transform container */}
      {Object.entries(appearingNodes).map(([nodeId, position]) => (
        <ParticleEffect
          key={nodeId}
          x={position.x}
          y={position.y}
          onComplete={() => {
            setAppearingNodes((prev) => {
              const next = { ...prev };
              delete next[nodeId];
              return next;
            });
          }}
        />
      ))}

      {/* Particle effects for deleted nodes - outside transform container */}
      {Object.entries(deletingNodes).map(([nodeId, position]) => (
        <ParticleEffect
          key={nodeId}
          x={position.x}
          y={position.y}
          onComplete={() => {
            setDeletingNodes((prev) => {
              const next = { ...prev };
              delete next[nodeId];
              return next;
            });
          }}
        />
      ))}
    </div>
  );
};
