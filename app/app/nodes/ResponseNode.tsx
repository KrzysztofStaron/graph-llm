import { ResponseNode as ResponseNodeType } from "@/app/types/graph";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { memo } from "react";

type ResponseNodeProps = {
  node: ResponseNodeType;
};

const arraysEqual = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);

export const ResponseNode = memo(
  function ResponseNode({ node }: ResponseNodeProps) {
    const rawContent = node.value;
    const isLoading = rawContent.length === 0;

    // Preprocess content to normalize math delimiters
    // Convert \[ ... \] to $$ ... $$ for display math and \( ... \) to $ ... $ for inline math
    const content = rawContent
      // Convert display math: \[ ... \] to $$ ... $$
      .replace(/\\\[([\s\S]*?)\\\]/g, (_match, math) => `$$${math}$$`)
      // Convert inline math: \( ... \) to $ ... $
      .replace(/\\\(([\s\S]*?)\\\)/g, (_match, math) => `$${math}$`);

    return (
      <div className="max-w-[808px] min-w-[200px]">
        <div className="relative w-full items-center gap-3 overflow-hidden rounded-3xl bg-linear-to-tr p-px from-white/5 to-white/20">
          <div className="block resize-none py-5 px-8 w-full rounded-3xl border-none bg-[#0a0a0a] text-white max-w-none">
            {isLoading ? (
              <div className="flex items-center gap-3 text-white/70">
                <div className="size-4 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" />
                <p className="text-sm font-mono">Loading…</p>
              </div>
            ) : (
              <ReactMarkdown
                remarkPlugins={[remarkMath, remarkGfm]}
                rehypePlugins={[rehypeKatex]}
                components={{
                  h1: ({ children }) => <h1 className="text-3xl font-semibold tracking-tight mb-3 mt-2">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-2xl font-semibold tracking-tight mb-3 mt-4">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-xl font-semibold tracking-tight mb-2 mt-4">{children}</h3>,
                  h4: ({ children }) => <h4 className="text-lg font-semibold tracking-tight mb-2 mt-3">{children}</h4>,
                  h5: ({ children }) => (
                    <h5 className="text-base font-semibold tracking-tight mb-2 mt-3">{children}</h5>
                  ),
                  h6: ({ children }) => (
                    <h6 className="text-base font-semibold tracking-tight mb-2 mt-3 opacity-90">{children}</h6>
                  ),
                  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                  ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
                  li: ({ children }) => <li className="ml-2">{children}</li>,
                  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                  em: ({ children }) => <em className="italic">{children}</em>,
                  a: ({ children, href }) => (
                    <a
                      href={href}
                      className="underline underline-offset-4 decoration-white/30 hover:decoration-white/70"
                      rel="noreferrer"
                      target="_blank"
                    >
                      {children}
                    </a>
                  ),
                  code: ({ children, className }) => {
                    const isInline = !className;
                    return isInline ? (
                      <code className="bg-white/10 px-1 py-0.5 rounded text-sm font-mono">{children}</code>
                    ) : (
                      <code className={className}>{children}</code>
                    );
                  },
                  pre: ({ children }) => <pre className="bg-white/10 p-2 rounded overflow-x-auto mb-2">{children}</pre>,
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-2 border-white/15 pl-3 italic text-white/85 my-3">
                      {children}
                    </blockquote>
                  ),
                  hr: () => <hr className="border-white/10 my-6" />,
                  table: ({ children }) => (
                    <div className="overflow-x-auto mb-2">
                      <table className="w-full border-collapse text-sm">{children}</table>
                    </div>
                  ),
                  thead: ({ children }) => <thead className="bg-white/5">{children}</thead>,
                  tbody: ({ children }) => <tbody>{children}</tbody>,
                  tr: ({ children }) => <tr className="border-b border-white/10 last:border-b-0">{children}</tr>,
                  th: ({ children }) => (
                    <th className="border border-white/10 px-2 py-1 text-left font-semibold align-top">{children}</th>
                  ),
                  td: ({ children }) => <td className="border border-white/10 px-2 py-1 align-top">{children}</td>,
                }}
              >
                {content}
              </ReactMarkdown>
            )}
          </div>
        </div>
      </div>
    );
  },
  (prev, next) => {
    // Only re-render when value, parentIds, or childrenIds change
    return (
      prev.node.value === next.node.value &&
      arraysEqual(prev.node.parentIds, next.node.parentIds) &&
      arraysEqual(prev.node.childrenIds, next.node.childrenIds)
    );
  }
);
