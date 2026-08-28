/**
 * Fixture test cases for eval harness
 */

import { EvalTask } from "./types";

export const FIXTURE_TASKS: EvalTask[] = [
  {
    id: "basic-math",
    query: "What is 2 + 2?",
    expectedKeywords: ["4", "four"],
    minLength: 1,
    maxLength: 1000,
  },
  {
    id: "explanation",
    query: "Explain what a graph is in 2 sentences.",
    minLength: 50,
    maxLength: 500,
    shouldNotContain: ["error", "cannot", "unable"],
  },
  {
    id: "reasoning",
    query: "If a tree falls in a forest and no one is around, does it make a sound?",
    minLength: 30,
    maxLength: 1000,
  },
  {
    id: "code-example",
    query: "Show me a simple Python function that adds two numbers.",
    expectedKeywords: ["def", "return"],
    minLength: 20,
    maxLength: 500,
  },
  {
    id: "comparison",
    query: "What's the difference between a linked list and an array?",
    minLength: 50,
    maxLength: 1000,
  },
];

/**
 * Mock responses for dry-run mode
 */
export const MOCK_RESPONSES: Record<string, string> = {
  "basic-math": "4",
  "explanation":
    "A graph is a data structure consisting of nodes (vertices) and edges connecting them. It's used to model relationships between objects in various domains like social networks, maps, and computer networks.",
  "reasoning":
    "Yes, it does make a sound. Sound is a physical phenomenon caused by vibrations in air molecules, which occurs regardless of whether there's an observer present to hear it.",
  "code-example": `Here's a simple function:

\`\`\`python
def add_numbers(a, b):
    return a + b
\`\`\`

This function takes two parameters and returns their sum.`,
  "comparison":
    "Arrays store elements in contiguous memory with fixed size and constant-time access by index. Linked lists store elements in nodes with pointers, allowing dynamic size and efficient insertions/deletions but slower access time.",
};
