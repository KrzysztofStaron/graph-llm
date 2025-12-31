import { ResponseNode as ResponseNodeType } from "@/app/types/graph";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { memo, useMemo } from "react";

type ResponseNodeProps = {
  node: ResponseNodeType;
  isSelected?: boolean;
};

const arraysEqual = (a: string[], b: string[]) => {
  return a.length === b.length && a.every((v, i) => v === b[i]);
};

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
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-2 last:mb-0">{children}</p>
  ),
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

// Memoized chunk renderer - only re-renders when its specific content changes
const MarkdownChunk = memo(
  function MarkdownChunk({ content }: { content: string }) {
    return (
      <ReactMarkdown
        remarkPlugins={[remarkMath, remarkGfm]}
        rehypePlugins={[rehypeKatex]}
        components={markdownComponents}
      >
        {content}
      </ReactMarkdown>
    );
  },
  (prev, next) => prev.content === next.content
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
  function ResponseNode({ node, isSelected = false }: ResponseNodeProps) {
    const rawContent = node.value;
    const isLoading = rawContent.length === 0;

    // Memoize chunk splitting and math normalization
    const chunks = useMemo(() => {
      const normalized = normalizeMath(rawContent);
      return splitIntoChunks(normalized);
    }, [rawContent]);

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
              chunks.map((chunk, index) => (
                <MarkdownChunk key={index} content={chunk} />
              ))
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
      prev.isSelected === next.isSelected
    );
  }
);
