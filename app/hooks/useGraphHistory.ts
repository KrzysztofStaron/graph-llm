import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  type Dispatch,
} from "react";
import { type GraphNodes } from "../types/graph";
import {
  type GraphAction,
  deepCopyNodes,
  TreeManager,
} from "../interfaces/TreeManager";

interface UseGraphHistoryProps {
  nodes: GraphNodes;
  nodesRef: React.MutableRefObject<GraphNodes>;
  dispatch: Dispatch<GraphAction>;
}

interface UseGraphHistoryReturn {
  dispatchWithHistory: (action: GraphAction) => void;
  treeManager: TreeManager;
  undo: () => void;
  isUndoingRef: React.MutableRefObject<boolean>;
}

export function useGraphHistory({
  nodes,
  nodesRef,
  dispatch,
}: UseGraphHistoryProps): UseGraphHistoryReturn {
  const [history, setHistory] = useState<GraphNodes[]>([]);
  const historyRef = useRef(history);
  const isUndoingRef = useRef(false);
  const shouldSaveHistoryAfterUpdateRef = useRef(false);
  const skipNextHistorySavesRef = useRef(0);

  // Wrapped dispatch that captures history before applying actions
  const dispatchWithHistory = useCallback(
    (action: GraphAction) => {
      // Skip history capture if we're restoring state (undo operation)
      if (action.type === "RESTORE_NODES" || isUndoingRef.current) {
        dispatch(action);
        return;
      }

      // For input node value patches (submissions), save history AFTER the patch
      // This ensures the submitted value is preserved in history, not the empty state
      if (action.type === "PATCH_NODE" && action.patch.value !== undefined) {
        const node = nodesRef.current[action.id];
        if (
          node &&
          node.type === "input" &&
          node.value === "" &&
          action.patch.value !== ""
        ) {
          // This is an input submission - apply the patch first, then save history after state updates
          // Also skip history for the next few actions (ADD_NODE, LINK) that typically follow submission
          shouldSaveHistoryAfterUpdateRef.current = true;
          skipNextHistorySavesRef.current = 3; // Skip next 3 actions (typically ADD_NODE, LINK, and maybe another)
          dispatch(action);
          return;
        }
      }

      // Skip history for actions that follow input submission
      if (skipNextHistorySavesRef.current > 0) {
        skipNextHistorySavesRef.current--;
        dispatch(action);
        return;
      }

      const currentNodes = nodesRef.current;
      const currentHistory = historyRef.current;
      // Save current state to history before applying action
      const snapshot = deepCopyNodes(currentNodes);
      const newHistory = [...currentHistory, snapshot];

      // Limit history to 3 steps (remove oldest when adding 4th)
      const trimmedHistory = newHistory.slice(-3);

      setHistory(trimmedHistory);
      historyRef.current = trimmedHistory;

      // Apply the action
      dispatch(action);
    },
    // nodesRef is stable and doesn't need to be in deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dispatch]
  );

  // TreeManager
  const treeManager = useMemo(
    () => new TreeManager(dispatchWithHistory),
    [dispatchWithHistory]
  );

  // Update historyRef when history changes
  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  // Handle deferred history saves (for input submissions)
  useEffect(() => {
    // If we need to save history after an update (e.g., input submission),
    // do it now that the state has been updated
    if (shouldSaveHistoryAfterUpdateRef.current) {
      shouldSaveHistoryAfterUpdateRef.current = false;
      const currentNodes = nodesRef.current;
      const currentHistory = historyRef.current;

      // Save current state to history
      const snapshot = deepCopyNodes(currentNodes);
      const newHistory = [...currentHistory, snapshot];

      // Limit history to 3 steps (remove oldest when adding 4th)
      const trimmedHistory = newHistory.slice(-3);

      setHistory(trimmedHistory);
      historyRef.current = trimmedHistory;
    }
  }, [nodes, nodesRef]);

  // Undo function: restore previous state from history
  const undo = useCallback(() => {
    if (history.length === 0) return;

    const previousState = history[history.length - 1];
    const newHistory = history.slice(0, -1);

    // Set flag to skip history capture and collision resolution
    isUndoingRef.current = true;

    // Restore the previous state
    setHistory(newHistory);
    historyRef.current = newHistory;

    // Restore nodes using RESTORE_NODES action
    dispatchWithHistory({ type: "RESTORE_NODES", nodes: previousState });

    // Reset flag after a short delay to allow async dimension updates to complete
    // This prevents collision resolution from running during undo
    setTimeout(() => {
      isUndoingRef.current = false;
    }, 100);
  }, [history, dispatchWithHistory]);

  return {
    dispatchWithHistory,
    treeManager,
    undo,
    isUndoingRef,
  };
}
