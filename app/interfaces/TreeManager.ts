import type {
  GraphNode,
  GraphNodes,
  InputNode,
  NodeDimensions,
  NodeType,
  ResponseNode,
  ContextNode,
  DocumentNode,
  ImageContextNode,
} from "../types/graph";

import type { ChatMessage } from "./aiService";

export type GraphAction =
  | { type: "PATCH_NODE"; id: string; patch: Partial<GraphNode> }
  | { type: "ADD_NODE"; node: GraphNode }
  | { type: "LINK"; fromId: string; toId: string }
  | {
      type: "MOVE_NODE";
      id: string;
      dx: number;
      dy: number;
      setPinned?: boolean;
    }
  | { type: "DELETE_CASCADE"; id: string }
  | { type: "DELETE_NODE_DETACH"; id: string }
  | { type: "RESTORE_NODES"; nodes: GraphNodes };

export class TreeManager {
  constructor(private dispatch: (action: GraphAction) => void) {}

  /**
   * Checks if a node has any descendant of the specified type.
   * @param nodes - All nodes in the graph
   * @param nodeId - The starting node ID to check descendants from
   * @param nodeType - The type of node to search for
   * @returns true if any descendant matches the specified type
   */
  static hasDescendant(
    nodes: GraphNodes,
    nodeId: string,
    nodeType: NodeType
  ): boolean {
    const visited = new Set<string>();

    const checkDescendants = (currentNodeId: string): boolean => {
      if (visited.has(currentNodeId)) return false;
      visited.add(currentNodeId);

      const currentNode = nodes[currentNodeId];
      if (!currentNode) return false;

      // Check if current node matches the target type
      if (currentNode.type === nodeType) {
        return true;
      }

      // Recursively check all children
      for (const childId of currentNode.childrenIds) {
        if (checkDescendants(childId)) {
          return true;
        }
      }

      return false;
    };

    // Start checking from the node's direct children
    const startNode = nodes[nodeId];
    if (!startNode) return false;

    for (const childId of startNode.childrenIds) {
      if (checkDescendants(childId)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Finds all descendant response nodes starting from a given node, grouped by depth level (BFS).
   * Returns an array of arrays, where each inner array contains response nodes at the same depth.
   * Depth is measured by the number of response nodes encountered, not total nodes.
   */
  static findDescendantResponseNodes(
    startNodeId: string,
    nodes: GraphNodes
  ): ResponseNode[][] {
    const result: ResponseNode[][] = [];
    const visited = new Set<string>();

    // Queue contains [nodeId, responseDepth] pairs
    // responseDepth tracks how many response nodes we've passed through
    const queue: Array<{ nodeId: string; responseDepth: number }> = [];

    // Start with the children of the start node
    const startNode = nodes[startNodeId];
    if (!startNode) return result;

    for (const childId of startNode.childrenIds) {
      queue.push({ nodeId: childId, responseDepth: 0 });
    }

    while (queue.length > 0) {
      const { nodeId, responseDepth } = queue.shift()!;

      // Skip if already visited (cycle protection)
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      const node = nodes[nodeId];
      if (!node) continue;

      let nextDepth = responseDepth;

      // If it's a response node, add it to the appropriate depth level
      if (node.type === "response") {
        while (result.length <= responseDepth) {
          result.push([]);
        }
        result[responseDepth].push(node as ResponseNode);
        // Increment depth for children since we passed through a response node
        nextDepth = responseDepth + 1;
      }

      // Add all children to the queue
      for (const childId of node.childrenIds) {
        if (!visited.has(childId)) {
          queue.push({ nodeId: childId, responseDepth: nextDepth });
        }
      }
    }

    return result;
  }

  static buildChatML(
    nodes: GraphNodes,
    startNode: GraphNode | undefined
  ): ChatMessage[] {
    if (!startNode) {
      console.warn("buildChatML: startNode is undefined");
      return [];
    }

    const normalizedTree: Record<
      number,
      { type: NodeType; value: string; id: string }[]
    > = {
      0: [],
    };

    const traverse = (currentNode: GraphNode, level: number) => {
      if (!normalizedTree[level]) {
        normalizedTree[level] = [];
      }

      normalizedTree[level].push({
        type: currentNode.type,
        value: currentNode.value,
        id: currentNode.id,
      });

      currentNode.parentIds.forEach((parentId) => {
        const parentNode = nodes[parentId];
        if (parentNode) {
          traverse(parentNode, level + 1);
        } else {
          console.warn(`buildChatML: Parent node ${parentId} not found`);
        }
      });
    };

    traverse(startNode, 0);

    // normalizedTree has this structure: level -> nodes[]

    const maxLevel = Math.max(...Object.keys(normalizedTree).map(Number));
    const messages = [];

    const wrapContextMetadata = (node: GraphNode) => {
      return `<node id="${node.id}" parentIds="${node.parentIds.join(
        ","
      )}" type="${node.type}">${node.value}</node>`;
    };

    for (let level = 0; level <= maxLevel; level++) {
      const levelNodesRaw = normalizedTree[level];
      if (!levelNodesRaw || levelNodesRaw.length === 0) continue;

      // Deduplicate nodes by id at this level
      const seenIds = new Set<string>();
      const levelNodes = levelNodesRaw.filter((node) => {
        if (seenIds.has(node.id)) {
          return false;
        }
        seenIds.add(node.id);
        return true;
      });

      const roleType = levelNodes[0].type;

      // Determine the role based on node type
      const role: "user" | "assistant" =
        roleType === "context" ||
        roleType === "input" ||
        roleType === "image-context" ||
        roleType === "document"
          ? "user"
          : "assistant";

      // Check if there are any image nodes at this level
      const hasImages = levelNodes.some(
        (node) => node.type === "image-context"
      );

      if (hasImages) {
        // Use OpenAI vision format: content as array
        const contentArray: Array<
          | { type: "text"; text: string }
          | { type: "image_url"; image_url: { url: string } }
        > = [];

        // Collect all text nodes
        const textNodes = levelNodes.filter(
          (node) => node.type !== "image-context"
        );
        if (textNodes.length > 0) {
          const mergedText = textNodes
            .map((node) => wrapContextMetadata(nodes[node.id] as GraphNode))
            .join("<separatorOfContextualData />");

          contentArray.push({
            type: "text",
            text: mergedText,
          });
        }

        // Add image nodes
        const imageNodes = levelNodes.filter(
          (node) => node.type === "image-context"
        );
        imageNodes.forEach((node) => {
          contentArray.push({
            type: "image_url",
            image_url: { url: node.value },
          });
        });

        messages.push({
          role,
          content: contentArray,
        });
      } else {
        // Standard text-only format
        const mergedNodes = levelNodes.map((node) =>
          wrapContextMetadata(nodes[node.id] as GraphNode)
        );

        messages.push({
          role,
          content: mergedNodes.join("<separatorOfContextualData />"),
        });
      }
    }

    const ret = [
      {
        role: "system",
        content: `You are an experimental LLM based on graphs called GraphAI at graphai.one, each piece of information is a node in the graph, 
          and the connections between the nodes are the edges. When responding don't include metadata tags, 
          only the content of the nodes. As metadata is only for the LLM to understand the connections between the nodes, 
          it's not part of the response. You can use markdown and latex for formatting purposes. Try not to send walls of text.

          Don't leak <separatorOfContextualData /> in your responses.
          Don't leak <node id="..." parentIds="..." type="...">...</node> in your responses.
          
          CRUCIAL:
          - don't include internal tags in your responses
          - don't include internal tags in your responses
          - don't include internal tags in your responses

          Core rule:  Responses = content only. Tags/metadata stay invisible (backend graph only). No more leaks. Clean slate!

          Supported Document Types:
          The system can parse and process various document formats:
          - PDF files (.pdf) - Text-based and scanned PDFs
          - Microsoft Word documents (.docx)
          - Microsoft Excel spreadsheets (.xlsx) - Converted to CSV format
          - Microsoft PowerPoint presentations (.pptx)
          - HTML files (.html, .htm)
          - Plain text files (.txt)
          - Markdown files (.md)
          - JSON files (.json)
          - CSV files (.csv)
          
          When document nodes are provided, they contain parsed text content from these file formats. Use the content as context for your responses.
          `,
      },
      ...messages.reverse(),
    ] as ChatMessage[];

    console.log(ret);

    return ret;
  }

  patchNode(id: string, patch: Partial<GraphNode>): void {
    this.dispatch({ type: "PATCH_NODE", id, patch });
  }

  addNode(node: GraphNode): void {
    this.dispatch({ type: "ADD_NODE", node });
  }

  linkNodes(fromId: string, toId: string): void {
    this.dispatch({ type: "LINK", fromId, toId });
  }

  moveNode(id: string, dx: number, dy: number, setPinned?: boolean): void {
    this.dispatch({ type: "MOVE_NODE", id, dx, dy, setPinned });
  }

  deleteNode(id: string): void {
    this.dispatch({ type: "DELETE_CASCADE", id });
  }

  deleteNodeDetach(id: string): void {
    this.dispatch({ type: "DELETE_NODE_DETACH", id });
  }
}

// Deep copy function for GraphNodes
export const deepCopyNodes = (nodes: GraphNodes): GraphNodes => {
  const copy: GraphNodes = {};
  for (const [id, node] of Object.entries(nodes)) {
    copy[id] = {
      ...node,
      parentIds: [...node.parentIds],
      childrenIds: [...node.childrenIds],
    };
  }
  return copy;
};

export function graphReducer(
  nodes: GraphNodes,
  action: GraphAction
): GraphNodes {
  switch (action.type) {
    case "RESTORE_NODES": {
      return deepCopyNodes(action.nodes);
    }
    case "PATCH_NODE": {
      const node = nodes[action.id];
      if (!node) return nodes;
      return { ...nodes, [action.id]: { ...node, ...action.patch } };
    }
    case "ADD_NODE": {
      return { ...nodes, [action.node.id]: action.node };
    }
    case "LINK": {
      const fromNode = nodes[action.fromId];
      const toNode = nodes[action.toId];
      if (!fromNode || !toNode) return nodes;

      return {
        ...nodes,
        [action.fromId]: {
          ...fromNode,
          childrenIds: fromNode.childrenIds.includes(action.toId)
            ? fromNode.childrenIds
            : [...fromNode.childrenIds, action.toId],
        },
        [action.toId]: {
          ...toNode,
          parentIds: toNode.parentIds.includes(action.fromId)
            ? toNode.parentIds
            : [...toNode.parentIds, action.fromId],
        },
      };
    }
    case "MOVE_NODE": {
      const node = nodes[action.id];
      if (!node) return nodes;
      const updated: GraphNode = {
        ...node,
        x: node.x + action.dx,
        y: node.y + action.dy,
      };
      if (action.setPinned !== undefined) {
        updated.pinned = action.setPinned;
      }
      return {
        ...nodes,
        [action.id]: updated,
      };
    }
    case "DELETE_CASCADE": {
      const startNode = nodes[action.id];
      if (!startNode) return nodes;

      // DFS to collect nodes to delete
      // Rule: stop (and keep) a branch when we hit a node with >1 parent
      const toDelete = new Set<string>();
      const stack: string[] = [action.id];

      while (stack.length > 0) {
        const nodeId = stack.pop()!;

        // Skip if already processed
        if (toDelete.has(nodeId)) continue;

        const node = nodes[nodeId];
        if (!node) continue;

        // For non-start nodes, check if this node has a parent outside the deletion set
        if (nodeId !== action.id) {
          // If node has >1 parent, stop here (keep this node and its descendants)
          if (node.parentIds.length > 1) continue;

          // If node has any parent not in toDelete, it still has a valid parent - keep it
          const hasParentOutsideDeleteSet = node.parentIds.some(
            (parentId) => !toDelete.has(parentId)
          );
          if (hasParentOutsideDeleteSet) continue;
        }

        // Mark for deletion
        toDelete.add(nodeId);

        // Add children to stack for DFS traversal
        for (const childId of node.childrenIds) {
          if (!toDelete.has(childId)) {
            stack.push(childId);
          }
        }
      }

      // Build the updated nodes object
      const updatedNodes: GraphNodes = {};

      for (const [nodeId, node] of Object.entries(nodes)) {
        // Skip nodes that are being deleted
        if (toDelete.has(nodeId)) continue;

        // Filter out deleted nodes from parentIds and childrenIds
        updatedNodes[nodeId] = {
          ...node,
          parentIds: node.parentIds.filter((id) => !toDelete.has(id)),
          childrenIds: node.childrenIds.filter((id) => !toDelete.has(id)),
        };
      }

      return updatedNodes;
    }
    case "DELETE_NODE_DETACH": {
      const nodeToDelete = nodes[action.id];
      if (!nodeToDelete) return nodes;

      // Build updated nodes object
      const updatedNodes: GraphNodes = {};

      for (const [nodeId, node] of Object.entries(nodes)) {
        // Skip the node being deleted
        if (nodeId === action.id) continue;

        // Remove the deleted node from parentIds and childrenIds
        updatedNodes[nodeId] = {
          ...node,
          parentIds: node.parentIds.filter(
            (parentId) => parentId !== action.id
          ),
          childrenIds: node.childrenIds.filter(
            (childId) => childId !== action.id
          ),
        };
      }

      return updatedNodes;
    }
  }
}

export function createNode(type: "input", x: number, y: number): InputNode;
export function createNode(
  type: "response",
  x: number,
  y: number
): ResponseNode;
export function createNode(type: "context", x: number, y: number): ContextNode;
export function createNode(
  type: "image-context",
  x: number,
  y: number
): ImageContextNode;
export function createNode(
  type: "document",
  x: number,
  y: number
): DocumentNode;

export function createNode(type: NodeType, x: number, y: number): GraphNode {
  const id = crypto.randomUUID();

  return {
    id,
    type,
    x,
    y,
    value: "",
    parentIds: [],
    childrenIds: [],
  };
}
