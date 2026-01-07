import type {
  GraphNode,
  GraphNodes,
  InputNode,
  NodeType,
  ResponseNode,
  ImageResponseNode,
  ContextNode,
  DocumentNode,
  ImageContextNode,
  SummaryNode,
} from "../types/graph";

import { aiService, type ChatMessage } from "./aiService";

export type GraphAction =
  | { type: "PATCH_NODE"; id: string; patch: Partial<GraphNode> }
  | { type: "ADD_NODE"; node: GraphNode }
  | { type: "LINK"; fromId: string; toId: string }
  | { type: "UNLINK"; fromId: string; toId: string }
  | { type: "DETACH_NODE"; id: string }
  | { type: "REMOVE_EDGES_BETWEEN"; nodeIds: string[] }
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
   * Includes both text responses and image responses.
   */
  static findDescendantResponseNodes(
    startNodeId: string,
    nodes: GraphNodes
  ): (ResponseNode | ImageResponseNode)[][] {
    const result: (ResponseNode | ImageResponseNode)[][] = [];
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

      // If it's a response node (text or image), add it to the appropriate depth level
      if (node.type === "response" || node.type === "image-response") {
        while (result.length <= responseDepth) {
          result.push([]);
        }
        result[responseDepth].push(node as ResponseNode | ImageResponseNode);
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

    // Global visited set to prevent processing the same node multiple times
    const visited = new Set<string>();
    
    // Track how many times a node appears in the current path (for loop detection)
    const pathCount = new Map<string, number>();

    const traverse = (currentNode: GraphNode, level: number) => {
      // Check if we've already visited this node globally
      if (visited.has(currentNode.id)) {
        return;
      }

      // Track visits in the current path for loop detection
      const currentPathCount = pathCount.get(currentNode.id) || 0;
      
      // If this node has appeared 3 times in the current path, terminate this branch
      if (currentPathCount >= 3) {
        console.warn(`buildChatML: Loop detected for node ${currentNode.id}, terminating path`);
        return;
      }

      // Mark as visited globally
      visited.add(currentNode.id);
      
      // Increment path count
      pathCount.set(currentNode.id, currentPathCount + 1);

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
      
      // Decrement path count after traversing children (backtrack)
      pathCount.set(currentNode.id, currentPathCount);
    };

    traverse(startNode, 0);

    // normalizedTree has this structure: level -> nodes[]

    const maxLevel = Math.max(...Object.keys(normalizedTree).map(Number));
    
    // Create a mapping from node UUID to sequential node number (to avoid triggering safety filters)
    const nodeIdMap = new Map<string, number>();
    let nodeCounter = 1;
    
    // Assign sequential IDs to all nodes across all levels
    for (let level = maxLevel; level >= 0; level--) {
      const levelNodes = normalizedTree[level];
      if (!levelNodes) continue;
      
      // Deduplicate by id
      const seenIds = new Set<string>();
      levelNodes.forEach((node) => {
        if (!seenIds.has(node.id) && !nodeIdMap.has(node.id)) {
          nodeIdMap.set(node.id, nodeCounter++);
          seenIds.add(node.id);
        }
      });
    }
    
    const messages = [];

    const wrapContextMetadata = (node: GraphNode) => {
      if (node.type === "summary") {
        // Parse summary nodes as straight assistant messages (no metadata wrappers)
        return node.value;
      }

      // Use a simpler format that won't trigger data leakage safety filters
      // Map UUIDs to sequential numbers to avoid looking like leaked credentials
      const nodeNum = nodeIdMap.get(node.id) || 0;
      const typeLabel = node.type === "input" ? "Q" : 
                       node.type === "response" ? "A" : 
                       node.type === "image-response" ? "IMG" :
                       node.type === "document" ? "DOC" :
                       node.type === "context" ? "CTX" : 
                       node.type.toUpperCase();
      
      // Include parent references using mapped sequential IDs
      const parentRefs = node.parentIds
        .map(pid => {
          const parentNode = nodes[pid];
          if (!parentNode) return null;
          const parentNum = nodeIdMap.get(pid);
          const parentLabel = parentNode.type === "input" ? "Q" : 
                             parentNode.type === "response" ? "A" : 
                             parentNode.type === "image-response" ? "IMG" :
                             parentNode.type === "document" ? "DOC" :
                             parentNode.type === "context" ? "CTX" : 
                             parentNode.type === "summary" ? "SUM" :
                             parentNode.type.toUpperCase();
          return `${parentLabel}${parentNum}`;
        })
        .filter(ref => ref !== null)
        .join(",");
      
      const parentInfo = parentRefs ? ` replying-to="${parentRefs}"` : "";
      
      return `[${typeLabel}${nodeNum}${parentInfo}]\n${node.value}\n[/${typeLabel}${nodeNum}]`;
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
      // response and image-response are assistant messages, everything else is user
      const role: "user" | "assistant" =
        roleType === "context" ||
        roleType === "input" ||
        roleType === "image-context" ||
        roleType === "document"
          ? "user"
          : "assistant";

      // Check if there are any image nodes at this level (context images or response images)
      const hasImages = levelNodes.some(
        (node) => node.type === "image-context" || node.type === "image-response"
      );

      if (hasImages) {
        // Use OpenAI vision format: content as array
        const contentArray: Array<
          | { type: "text"; text: string }
          | { type: "image_url"; image_url: { url: string } }
        > = [];

        // Collect all text nodes (exclude both image-context and image-response)
        const textNodes = levelNodes.filter(
          (node) => node.type !== "image-context" && node.type !== "image-response"
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

        // Add image nodes (both image-context and image-response)
        const imageNodes = levelNodes.filter(
          (node) => node.type === "image-context" || node.type === "image-response"
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
        content: `You are an experimental LLM based on graphs called GraphAI at graphai.one. It is ${new Date().toLocaleDateString()} and ${new Date().toLocaleTimeString()}.
          
          IMAGE GENERATION (CRITICAL):
          - You have access to a 'generate_image' tool.
          - If the user asks for ANY visual content (image, drawing, visualization, diagram, car, cat, etc.), you MUST call 'generate_image'.
          - DO NOT write any text response when you call the tool.
          - Call 'generate_image' IMMEDIATELY with a descriptive prompt.
          
          GRAPH STRUCTURE:
          Each piece of information is a node in the graph, and connections between the nodes are the edges. 
          When responding don't include metadata tags, only the content of the nodes. 
          You can use markdown and latex for formatting. Try not to send walls of text.

          CRITICAL FORMATTING RULE:
          User messages contain metadata markers showing the graph structure:
          - [Q1 replying-to="A2"]...[/Q1] = Question node #1, replying to Answer #2
          - [A1]...[/A1] = Answer node #1 (no parent)
          - [IMG1]...[/IMG1] = Image response node #1 (may appear with images in context)
          - [DOC1 replying-to="Q3"]...[/DOC1] = Document node #1, replying to Question #3
          - [CTX1]...[/CTX1] = Context node #1
          - <separatorOfContextualData /> = Separates multiple nodes at the same level
          
          The "replying-to" attribute shows which previous nodes this node is connected to (its parents in the graph).
          These markers are ONLY for understanding context flow and MUST NEVER appear in your responses.
          
          ❌ WRONG: [A5 replying-to="Q4"]Your answer here[/A5]
          ✅ CORRECT: Your answer here
          
          Example conversation:
          User: [Q1]
          What is 2+2?
          [/Q1]
          You: 4
          
          User: [Q2 replying-to="A1"]
          Can you explain why?
          [/Q2]
          You: Addition is the mathematical operation that combines two numbers...
          
          RULES:
          - NEVER wrap your responses in [Q], [A], [IMG], [DOC], [CTX] or any metadata markers
          - NEVER include replying-to attributes or <separatorOfContextualData /> in responses
          - Use the replying-to information to understand conversation context and thread relationships
          - Your responses should be pure content, markdown, and LaTeX only
          - The system handles all graph metadata automatically

          Supported Document Types:
          The system can parse and process various document formats:
          - PDF (.pdf), Word (.docx), Excel (.xlsx), PowerPoint (.pptx), HTML (.html/.htm), TXT (.txt), MD (.md), JSON (.json), CSV (.csv).
          - When document nodes are provided, they contain parsed text content. Use it as context.

          Your creator is @krzysztofstaron at X
          `,
      },
      ...messages.reverse(),
    ] as ChatMessage[];


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

  unlinkNodes(fromId: string, toId: string): void {
    this.dispatch({ type: "UNLINK", fromId, toId });
  }

  detachNode(id: string): void {
    this.dispatch({ type: "DETACH_NODE", id });
  }

  removeEdgesBetween(nodeIds: string[]): void {
    this.dispatch({ type: "REMOVE_EDGES_BETWEEN", nodeIds });
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
    case "UNLINK": {
      const fromNode = nodes[action.fromId];
      const toNode = nodes[action.toId];
      if (!fromNode || !toNode) return nodes;

      return {
        ...nodes,
        [action.fromId]: {
          ...fromNode,
          childrenIds: fromNode.childrenIds.filter((id) => id !== action.toId),
        },
        [action.toId]: {
          ...toNode,
          parentIds: toNode.parentIds.filter((id) => id !== action.fromId),
        },
      };
    }
    case "DETACH_NODE": {
      const nodeToDetach = nodes[action.id];
      if (!nodeToDetach) return nodes;

      const updatedNodes: GraphNodes = {};

      for (const [nodeId, node] of Object.entries(nodes)) {
        if (nodeId === action.id) {
          // For the target node, clear all connections
          updatedNodes[nodeId] = {
            ...node,
            parentIds: [],
            childrenIds: [],
          };
        } else {
          // For other nodes, remove references to the detached node
          updatedNodes[nodeId] = {
            ...node,
            parentIds: node.parentIds.filter((pid) => pid !== action.id),
            childrenIds: node.childrenIds.filter((cid) => cid !== action.id),
          };
        }
      }

      return updatedNodes;
    }
    case "REMOVE_EDGES_BETWEEN": {
      const selectedSet = new Set(action.nodeIds);
      const updatedNodes: GraphNodes = {};

      for (const [nodeId, node] of Object.entries(nodes)) {
        if (selectedSet.has(nodeId)) {
          // For nodes in the selection, filter out edges to other selected nodes
          updatedNodes[nodeId] = {
            ...node,
            parentIds: node.parentIds.filter((pid) => !selectedSet.has(pid)),
            childrenIds: node.childrenIds.filter((cid) => !selectedSet.has(cid)),
          };
        } else {
          // For nodes outside the selection, keep them unchanged
          updatedNodes[nodeId] = node;
        }
      }

      return updatedNodes;
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
export function createNode(
  type: "image-response",
  x: number,
  y: number
): ImageResponseNode;
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
export function createNode(
  type: "summary",
  x: number,
  y: number
): SummaryNode;

export function createNode(type: NodeType, x: number, y: number): GraphNode {
  const id = crypto.randomUUID();

  const baseNode = {
    id,
    type,
    x,
    y,
    value: "",
    parentIds: [],
    childrenIds: [],
  };

  // Add prompt field for image-response nodes
  if (type === "image-response") {
    return {
      ...baseNode,
      type: "image-response",
      prompt: undefined,
    } as ImageResponseNode;
  }

  return baseNode as GraphNode;
}

export async function summarizeNodes(nodes: GraphNodes): Promise<{
  summary: string;
  images: string[];
}> {
  // Step 1: Identify image nodes and get their transcriptions in parallel
  const imageNodes = Object.values(nodes).filter(
    (node) => node.type === "image-context" || node.type === "image-response"
  );

  const imageTranscripts = new Map<string, string>();

  if (imageNodes.length > 0) {
    const transcriptionPromises = imageNodes.map(async (node) => {
      const visionMessages: ChatMessage[] = [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Describe this image in detail. Focus on the key content and information it conveys.",
            },
            {
              type: "image_url",
              image_url: { url: node.value },
            },
          ],
        },
      ];

      const transcript = await aiService.chat(visionMessages);
      return { id: node.id, transcript };
    });

    const results = await Promise.all(transcriptionPromises);
    results.forEach(({ id, transcript }) => {
      imageTranscripts.set(id, transcript);
    });
  }

  // Step 2: Build context with proper parent relationships
  // Create a mapping from node UUID to sequential node number
  const nodeIdMap = new Map<string, number>();
  let nodeCounter = 1;

  Object.keys(nodes).forEach((nodeId) => {
    nodeIdMap.set(nodeId, nodeCounter++);
  });

  // Step 3: Build structured content for each node
  const nodeContents: string[] = [];

  Object.values(nodes).forEach((node) => {
    const nodeNum = nodeIdMap.get(node.id) || 0;
    const typeLabel =
      node.type === "input"
        ? "Q"
        : node.type === "response"
          ? "A"
          : node.type === "image-response"
            ? "IMG"
            : node.type === "document"
              ? "DOC"
              : node.type === "context"
                ? "CTX"
                : node.type.toUpperCase();

    // Include parent references
    const parentRefs = node.parentIds
      .map((pid) => {
        const parentNode = nodes[pid];
        if (!parentNode) return null;
        const parentNum = nodeIdMap.get(pid);
        const parentLabel =
          parentNode.type === "input"
            ? "Q"
            : parentNode.type === "response"
              ? "A"
              : parentNode.type === "image-response"
                ? "IMG"
                : parentNode.type === "document"
                  ? "DOC"
                  : parentNode.type === "context"
                    ? "CTX"
                    : parentNode.type.toUpperCase();
        return `${parentLabel}${parentNum}`;
      })
      .filter((ref) => ref !== null)
      .join(",");

    const parentInfo = parentRefs ? ` (replying to: ${parentRefs})` : "";

    // Get content - use transcript for images, otherwise use node value
    let content: string;
    if (node.type === "image-context" || node.type === "image-response") {
      const transcript = imageTranscripts.get(node.id);
      content = transcript
        ? `[Image: ${transcript}]`
        : `[Image at ${node.value}]`;
    } else {
      content = node.value;
    }

    nodeContents.push(`[${typeLabel}${nodeNum}${parentInfo}]\n${content}`);
  });

  // Step 4: Create summary request
  const allContent = nodeContents.join("\n\n");

  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You are a helpful assistant that creates concise summaries. The content you receive is structured as a graph of interconnected nodes. Each node is labeled with its type and ID, and may reference parent nodes it replies to.",
    },
    {
      role: "user",
      content: `Please provide a concise summary of the following graph content:\n\n${allContent}`,
    },
  ];

  const response = await aiService.fastChat(messages);
  return {summary: response, images: imageNodes.map((node) => node.value)};
}