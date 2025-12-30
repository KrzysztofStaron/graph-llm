import type {
  GraphNode,
  GraphNodes,
  NodeType,
  ResponseNode,
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
  | { type: "DELETE_NODE_DETACH"; id: string };

export class TreeManager {
  constructor(private dispatch: (action: GraphAction) => void) {}

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
        roleType === "image-context"
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
            .map((node) => node.value)
            .join("<separatorOfContextualData />");

          contentArray.push({
            type: "text",
            text: wrapContextMetadata(nodes[textNodes[0].id]),
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
