import { ResponseNode as ResponseNodeType } from "@/app/types/graph";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { memo, useMemo } from "react";
import React from "react";

type ResponseNodeProps = {
  node: ResponseNodeType;
  isSelected?: boolean;
  currentWordIndex?: number | null;
  audioWords?: Array<{ word: string; start: number; end: number }>;
};

const arraysEqual = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

// Shared markdown components to avoid recreating on every render
const markdownComponents = {
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="text-3xl font-semibold tracking-tight mb-3 mt-2">
      {children}
    </h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="text-2xl font-semibold tracking-tight mb-3 mt-4">
      {children}
    </h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="text-xl font-semibold tracking-tight mb-2 mt-4">
      {children}
    </h3>
  ),
  h4: ({ children }: { children?: React.ReactNode }) => (
    <h4 className="text-lg font-semibold tracking-tight mb-2 mt-3">
      {children}
    </h4>
  ),
  h5: ({ children }: { children?: React.ReactNode }) => (
    <h5 className="text-base font-semibold tracking-tight mb-2 mt-3">
      {children}
    </h5>
  ),
  h6: ({ children }: { children?: React.ReactNode }) => (
    <h6 className="text-base font-semibold tracking-tight mb-2 mt-3 opacity-90">
      {children}
    </h6>
  ),
  p: ({ children }: { children?: React.ReactNode }) => {
    // This will be overridden when highlighting is active
    return <p className="mb-2 last:mb-0">{children}</p>;
  },
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="ml-2">{children}</li>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em className="italic">{children}</em>
  ),
  a: ({ children, href }: { children?: React.ReactNode; href?: string }) => (
    <a
      href={href}
      className="underline underline-offset-4 decoration-white/30 hover:decoration-white/70"
      rel="noreferrer"
      target="_blank"
    >
      {children}
    </a>
  ),
  code: ({
    children,
    className,
  }: {
    children?: React.ReactNode;
    className?: string;
  }) => {
    const isInline = !className;
    return isInline ? (
      <code className="bg-white/10 px-1 py-0.5 rounded text-sm font-mono">
        {children}
      </code>
    ) : (
      <code className={className}>{children}</code>
    );
  },
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="bg-white/10 p-2 rounded overflow-x-auto mb-2">
      {children}
    </pre>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="border-l-2 border-white/15 pl-3 italic text-white/85 my-3">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="border-white/10 my-6" />,
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="overflow-x-auto mb-2">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }: { children?: React.ReactNode }) => (
    <thead className="bg-white/5">{children}</thead>
  ),
  tbody: ({ children }: { children?: React.ReactNode }) => (
    <tbody>{children}</tbody>
  ),
  tr: ({ children }: { children?: React.ReactNode }) => (
    <tr className="border-b border-white/10 last:border-b-0">{children}</tr>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="border border-white/10 px-2 py-1 text-left font-semibold align-top">
      {children}
    </th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="border border-white/10 px-2 py-1 align-top">{children}</td>
  ),
};

// Helper to extract plain text and split by spaces for word indexing
const extractTextWords = (content: string): string[] => {
  // Strip markdown syntax for word counting (rough approximation)
  const plainText = content
    .replace(/```[\s\S]*?```/g, "") // Remove code blocks
    .replace(/`[^`]+`/g, "") // Remove inline code
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1") // Convert links to text
    .replace(/#+\s+/g, "") // Remove headers
    .replace(/\*\*([^\*]+)\*\*/g, "$1") // Remove bold
    .replace(/\*([^\*]+)\*/g, "$1") // Remove italic
    .replace(/^\s*[-*+]\s+/gm, "") // Remove list markers
    .replace(/^\s*\d+\.\s+/gm, ""); // Remove numbered list markers

  // Split by spaces and filter empty strings
  return plainText.split(/\s+/).filter((word) => word.length > 0);
};

// Memoized chunk renderer - only re-renders when its specific content changes
const MarkdownChunk = memo(
  function MarkdownChunk({
    content,
    highlightWordIndices,
    wordIndexOffset,
  }: {
    content: string;
    highlightWordIndices?: Set<number>;
    wordIndexOffset: number;
  }) {
    // Track current word index within this chunk
    let currentWordIndex = wordIndexOffset;

    // Helper function to recursively highlight words in React nodes by index
    const highlightTextInNode = (
      node: React.ReactNode,
      key = 0
    ): React.ReactNode => {
      if (!highlightWordIndices || highlightWordIndices.size === 0) {
        return node;
      }

      if (typeof node === "string") {
        const parts: React.ReactElement[] = [];
        const words = node.split(/(\s+)/); // Split by spaces but keep the spaces
        let partIndex = 0;

        for (const word of words) {
          if (word.trim() === "") {
            // This is whitespace, add it with a key
            parts.push(
              <React.Fragment key={`${key}-part-${partIndex++}`}>
                {word}
              </React.Fragment>
            );
          } else {
            // This is a word - use current index and increment
            const wordIndex = currentWordIndex++;
            if (highlightWordIndices.has(wordIndex)) {
              parts.push(
                <mark
                  key={`${key}-highlight-${partIndex++}`}
                  className="bg-yellow-500/30 text-yellow-200 rounded"
                >
                  {word}
                </mark>
              );
            } else {
              parts.push(
                <React.Fragment key={`${key}-part-${partIndex++}`}>
                  {word}
                </React.Fragment>
              );
            }
          }
        }

        return parts.length > 0 ? <>{parts}</> : node;
      }

      if (Array.isArray(node)) {
        return node.map((item, idx) => highlightTextInNode(item, idx));
      }

      if (React.isValidElement(node)) {
        const props = node.props as { children?: React.ReactNode };
        return React.cloneElement(
          node as React.ReactElement<{ children?: React.ReactNode }>,
          { key: node.key || key },
          props.children
            ? React.Children.map(props.children, (child, idx) =>
                highlightTextInNode(child, idx)
              )
            : props.children
        );
      }

      return node;
    };

    // Create custom components with highlight
    const componentsWithHighlight = {
      ...markdownComponents,
      // Override paragraph component to highlight words in its children
      p: ({ children }: { children?: React.ReactNode }) => (
        <p className="mb-2 last:mb-0">{highlightTextInNode(children)}</p>
      ),
    };

    return (
      <ReactMarkdown
        remarkPlugins={[remarkMath, remarkGfm]}
        rehypePlugins={[rehypeKatex]}
        components={componentsWithHighlight}
      >
        {content}
      </ReactMarkdown>
    );
  },
  (prev, next) =>
    prev.content === next.content &&
    prev.highlightWordIndices === next.highlightWordIndices &&
    prev.wordIndexOffset === next.wordIndexOffset
);

// Normalize math delimiters in content
const normalizeMath = (raw: string) =>
  raw
    .replace(/\\\[([\s\S]*?)\\\]/g, (_match, math) => `$$${math}$$`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_match, math) => `$${math}$`);

// Split markdown into stable chunks (by double newlines, preserving code blocks)
const splitIntoChunks = (content: string): string[] => {
  const chunks: string[] = [];
  let currentChunk = "";
  let inCodeBlock = false;

  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track code block state
    if (line.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
    }

    currentChunk += (currentChunk ? "\n" : "") + line;

    // Split on empty lines, but not inside code blocks
    if (!inCodeBlock && line === "" && currentChunk.trim()) {
      chunks.push(currentChunk);
      currentChunk = "";
    }
  }

  // Add remaining content
  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
};

export const ResponseNode = memo(
  function ResponseNode({
    node,
    isSelected = false,
    currentWordIndex,
  }: ResponseNodeProps) {
    const rawContent = node.value;
    const isLoading = rawContent.length === 0;

    // Memoize chunk splitting and math normalization
    const chunks = useMemo(() => {
      const normalized = normalizeMath(rawContent);
      return splitIntoChunks(normalized);
    }, [rawContent]);

    // Calculate word index offsets for each chunk and highlight indices
    const { chunkWordOffsets, highlightIndices } = useMemo(() => {
      const normalized = normalizeMath(rawContent);
      const allWords = extractTextWords(normalized);
      const offsets: number[] = [0];

      let currentOffset = 0;
      for (let i = 0; i < chunks.length - 1; i++) {
        const chunkWords = extractTextWords(chunks[i]);
        currentOffset += chunkWords.length;
        offsets.push(currentOffset);
      }

      // Calculate sliding window of 5 words around currentWordIndex
      const highlightSet = new Set<number>();
      if (
        currentWordIndex !== null &&
        currentWordIndex !== undefined &&
        currentWordIndex >= 0 &&
        currentWordIndex < allWords.length
      ) {
        const windowSize = 5;
        const halfWindow = Math.floor(windowSize / 2); // 2
        const startIndex = Math.max(0, currentWordIndex - halfWindow);
        const endIndex = Math.min(
          allWords.length - 1,
          currentWordIndex + halfWindow
        );

        for (let i = startIndex; i <= endIndex; i++) {
          highlightSet.add(i);
        }
      }

      return {
        chunkWordOffsets: offsets,
        highlightIndices: highlightSet,
      };
    }, [rawContent, chunks, currentWordIndex]);

    return (
      <div className="max-w-[808px] min-w-[200px] flex items-center group">
        <div
          className="relative w-full items-center gap-3 overflow-hidden rounded-3xl bg-linear-to-tr p-px from-white/5 to-white/20"
          style={{
            boxShadow: isSelected
              ? "0 0 0 2px rgba(255, 255, 255, 0.5), 0 0 20px rgba(255, 255, 255, 0.3)"
              : undefined,
            transition: "box-shadow 0.2s ease",
          }}
        >
          <div className="block resize-none py-5 px-8 w-full rounded-3xl border-none bg-[#0a0a0a] text-white max-w-none">
            {isLoading ? (
              <div className="flex items-center gap-3 text-white/70">
                <div className="size-4 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" />
                <p className="text-sm font-mono">Loading…</p>
              </div>
            ) : (
              chunks.map((chunk, index) => {
                return (
                  <MarkdownChunk
                    key={index}
                    content={chunk}
                    highlightWordIndices={highlightIndices}
                    wordIndexOffset={chunkWordOffsets[index]}
                  />
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  },
  (prev, next) => {
    return (
      prev.node.value === next.node.value &&
      arraysEqual(prev.node.parentIds, next.node.parentIds) &&
      arraysEqual(prev.node.childrenIds, next.node.childrenIds) &&
      prev.isSelected === next.isSelected &&
      prev.currentWordIndex === next.currentWordIndex &&
      prev.audioWords === next.audioWords
    );
  }
);
