import { ResponseNode as ResponseNodeType } from "@/app/types/graph";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { Check, Copy, X } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";

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
    <p className="mb-2 last:mb-0 whitespace-pre-wrap">{children}</p>
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
    <strong className="font-semibold inline">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em className="italic inline">{children}</em>
  ),
  a: ({ children, href }: { children?: React.ReactNode; href?: string }) => (
    <a
      href={href}
      className="underline underline-offset-4 decoration-white/30 hover:decoration-white/70 inline-block"
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
    <div className="overflow-x-auto mb-2 not-prose">
      <table className="w-full border-collapse text-sm table-auto">{children}</table>
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
    <th className="border border-white/10 px-3 py-2 text-left font-semibold align-top whitespace-nowrap">
      {children}
    </th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="border border-white/10 px-3 py-2 align-top">{children}</td>
  ),
};

// Memoized chunk renderer - only re-renders when its specific content changes
const MarkdownChunk = memo(
  function MarkdownChunk({ content }: { content: string }) {
    // Only enable math rendering if content contains actual LaTeX delimiters
    // Supports both single $ for inline math and $$ for block math
    const hasMath = /\$[\s\S]+?\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]/.test(content);
    
    const remarkPlugins = hasMath
      ? [remarkGfm, [remarkMath, { singleDollarTextMath: true }]]
      : [remarkGfm];
    
    return (
      <div className="markdown-content">
        <ReactMarkdown
          remarkPlugins={remarkPlugins as any}
          rehypePlugins={hasMath ? [rehypeKatex] : []}
          components={markdownComponents}
        >
          {content}
        </ReactMarkdown>
      </div>
    );
  },
  (prev, next) => prev.content === next.content
);

// Normalize math delimiters and fix common markdown issues
function normalizeMath(raw: string) {
  let normalized = raw
    .replace(/\\\[([\s\S]*?)\\\]/g, (_match, math) => `$$${math}$$`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_match, math) => `$${math}$`);
  
  // Check if content contains markdown tables - if so, skip normalization to avoid breaking them
  const hasTable = /\|.*\|.*\n\|[\s:-]+\|/.test(normalized);
  
  if (hasTable) {
    // Only do minimal processing for table content
    return normalized;
  }
  
  // Fix common markdown formatting issues from AI responses
  // particularly from web search results that may have malformed emphasis
  normalized = normalized
    // Fix orphaned asterisks that are separated by spaces (e.g., "* *text")
    // This often happens when markdown emphasis is malformed
    // But NOT in list items or tables
    .replace(/([^*\n])\*\s+\*([^*])/g, '$1$2')
    // Fix cases where there's no space between text and emphasis markers
    .replace(/([a-zA-Z0-9])(\*+)([a-zA-Z])/g, '$1 $2$3')
    .replace(/([a-zA-Z])(\*+)([a-zA-Z0-9])/g, '$1$2 $3')
    // Clean up any malformed emphasis markers (odd number of asterisks that would break parsing)
    .replace(/(\*{3,})/g, (match) => {
      const len = match.length;
      // Convert odd sequences of 3+ asterisks to proper pairs
      return len % 2 === 0 ? match : match.slice(0, len - 1);
    })
    // Fix multiple spaces that might have been introduced
    .replace(/  +/g, ' ');
  
  return normalized;
}

// Split markdown into stable chunks (by double newlines, preserving code blocks and tables)
function splitIntoChunks(content: string): string[] {
  const chunks: string[] = [];
  let currentChunk = "";
  let inCodeBlock = false;
  let inTable = false;

  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track code block state
    if (line.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
    }

    // Track table state - tables have pipes in them
    const isTableLine = line.includes("|") && !inCodeBlock;
    const isTableDelimiter = /^\|[\s:-]+\|/.test(line.trim());
    
    if (isTableLine || isTableDelimiter) {
      inTable = true;
    } else if (inTable && line.trim() === "") {
      // Empty line after table content - table might be ending
      // Check if next line is also a table line
      const nextLine = lines[i + 1];
      if (nextLine && !nextLine.includes("|")) {
        inTable = false;
      }
    } else if (inTable && !isTableLine) {
      inTable = false;
    }

    currentChunk += (currentChunk ? "\n" : "") + line;

    // Split on empty lines, but not inside code blocks or tables
    if (!inCodeBlock && !inTable && line === "" && currentChunk.trim()) {
      chunks.push(currentChunk);
      currentChunk = "";
    }
  }

  // Add remaining content
  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

export const ResponseNode = memo(
  function ResponseNode({ node, isSelected = false }: ResponseNodeProps) {
    const rawContent = node.value;
    const reasoning = node.reasoning || "";
    const isLoading = rawContent.length === 0 && !node.error;
    const isFailed = !!node.error;
    const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">(
      "idle"
    );
    const [reasoningExpanded, setReasoningExpanded] = useState(true);
    const resetTimerRef = useRef<number | null>(null);

    useEffect(() => {
      return () => {
        if (resetTimerRef.current !== null) {
          window.clearTimeout(resetTimerRef.current);
        }
      };
    }, []);

    // Memoize chunk splitting and math normalization
    const chunks = useMemo(() => {
      const normalized = normalizeMath(rawContent);
      return splitIntoChunks(normalized);
    }, [rawContent]);

    const handleCopy = () => {
      const text = rawContent.trim();
      if (!text) return;

      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
        resetTimerRef.current = null;
      }

      void navigator.clipboard
        .writeText(text)
        .then(() => {
          setCopyStatus("copied");
          resetTimerRef.current = window.setTimeout(() => {
            setCopyStatus("idle");
            resetTimerRef.current = null;
          }, 1200);
        })
        .catch(() => {
          setCopyStatus("failed");
          resetTimerRef.current = window.setTimeout(() => {
            setCopyStatus("idle");
            resetTimerRef.current = null;
          }, 1600);
        });
    };

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
          {!isLoading && !isFailed && rawContent.trim().length > 0 && (
            <div className="absolute top-3 right-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={handleCopy}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                className="px-3 py-1.5 rounded-lg bg-white/10 backdrop-blur-sm text-white/90 text-xs font-medium hover:bg-white/20 transition-colors flex items-center gap-1.5"
                aria-label="Copy response"
              >
                {copyStatus === "copied" ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    Copied
                  </>
                ) : copyStatus === "failed" ? (
                  <>
                    <X className="w-3.5 h-3.5" />
                    Failed
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Copy
                  </>
                )}
              </button>
            </div>
          )}
          <div className="block resize-none py-5 px-8 w-full rounded-3xl border-none bg-[#0a0a0a] text-white max-w-none break-words leading-relaxed">
            {/* Reasoning section */}
            {reasoning && !isFailed && (
              <div className="mb-4 pb-4 border-b border-white/10">
                <button
                  onClick={() => setReasoningExpanded(!reasoningExpanded)}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="flex items-center gap-2 text-sm font-mono text-white/50 hover:text-white/70 transition-colors mb-2"
                >
                  <svg
                    className={`w-3 h-3 transition-transform ${reasoningExpanded ? 'rotate-90' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  Reasoning
                </button>
                {reasoningExpanded && (
                  <div className="text-sm text-white/60 whitespace-pre-wrap font-mono pl-5">
                    {reasoning}
                  </div>
                )}
              </div>
            )}
            
            {isLoading ? (
              <div className="flex items-center gap-3 text-white/70">
                <div className="size-4 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" />
                <p className="text-sm font-mono">{reasoning ? "Generating response…" : "Reasoning…"}</p>
              </div>
            ) : isFailed ? (
              <div className="flex items-start gap-3 text-red-400">
                <div className="size-4 mt-0.5 shrink-0">
                  <svg
                    viewBox="0 0 16 16"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-full h-full"
                  >
                    <circle
                      cx="8"
                      cy="8"
                      r="7"
                      stroke="currentColor"
                      strokeWidth="2"
                    />
                    <path
                      d="M5 5L11 11M11 5L5 11"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold mb-1">
                    Failed to generate response
                  </p>
                  <p className="text-sm text-red-300/80 font-mono">
                    {node.error}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-0">
                {chunks.map((chunk, index) => (
                  <MarkdownChunk key={index} content={chunk} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  },
  (prev, next) => {
    return (
      prev.node.value === next.node.value &&
      prev.node.reasoning === next.node.reasoning &&
      prev.node.error === next.node.error &&
      arraysEqual(prev.node.parentIds, next.node.parentIds) &&
      arraysEqual(prev.node.childrenIds, next.node.childrenIds) &&
      prev.isSelected === next.isSelected
    );
  }
);
