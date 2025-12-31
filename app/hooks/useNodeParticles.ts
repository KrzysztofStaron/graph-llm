import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type Dispatch,
  type SetStateAction,
} from "react";
import { GraphNode, GraphNodes, NodeDimensions, Vector2 } from "../types/graph";
import { getDefaultNodeDimensions } from "../utils/placement";

interface UseNodeParticlesProps {
  nodes: GraphNodes;
  localNodeDimensions: NodeDimensions;
  transform: { x: number; y: number; k: number };
}

interface UseNodeParticlesReturn {
  appearingNodes: Record<string, Vector2>;
  deletingNodes: Record<string, Vector2>;
  setAppearingNodes: Dispatch<SetStateAction<Record<string, Vector2>>>;
  setDeletingNodes: Dispatch<SetStateAction<Record<string, Vector2>>>;
}

export function useNodeParticles({
  nodes,
  localNodeDimensions,
  transform,
}: UseNodeParticlesProps): UseNodeParticlesReturn {
  const [appearingNodes, setAppearingNodes] = useState<Record<string, Vector2>>(
    {}
  );
  const [deletingNodes, setDeletingNodes] = useState<Record<string, Vector2>>(
    {}
  );
  const nodesSnapshotRef = useRef<GraphNodes>(nodes);
  const hasMountedRef = useRef<boolean>(false);

  // Helper function to show particle effect for a node
  const showParticleEffect = useCallback(
    (
      node: GraphNode,
      nodeId: string,
      setState: Dispatch<SetStateAction<Record<string, Vector2>>>
    ) => {
      const dim =
        localNodeDimensions[nodeId] || getDefaultNodeDimensions(node.type);

      const center = {
        x: node.x + dim.width / 2,
        y: node.y + dim.height / 2,
      };

      const screenX = center.x * transform.k + transform.x;
      const screenY = center.y * transform.k + transform.y;

      setState((prev) => ({
        ...prev,
        [nodeId]: { x: screenX, y: screenY },
      }));

      setTimeout(() => {
        setState((prev) => {
          const next = { ...prev };
          delete next[nodeId];
          return next;
        });
      }, 200);
    },
    [localNodeDimensions, transform]
  );

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
      showParticleEffect(addedNode, nodeId, setAppearingNodes);
    });

    // Find deleted nodes
    Object.keys(previousNodes).forEach((nodeId) => {
      if (!currentNodeIds.has(nodeId)) {
        const deletedNode = previousNodes[nodeId];
        if (deletedNode) {
          showParticleEffect(deletedNode, nodeId, setDeletingNodes);
        }
      }
    });

    // Update snapshot
    nodesSnapshotRef.current = nodes;
  }, [nodes, localNodeDimensions, transform, showParticleEffect]);

  return {
    appearingNodes,
    deletingNodes,
    setAppearingNodes,
    setDeletingNodes,
  };
}
