import { ResponseNode as ResponseNodeType } from "@/app/types/graph";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

export const ResponseNode = ({ node }: { node: ResponseNodeType }) => {
  const rawContent = node.value;
  const isLoading = rawContent.length === 0;

  // Preprocess content to normalize math delimiters
  // Convert [ ... ] to $$ ... $$ for display math and ( ... ) to $ ... $ for inline math
  const content = rawContent
    // Convert display math: [ ... ] blocks (especially multiline)
    .replace(/\[([\s\S]*?)\]/g, (match, math, offset) => {
      // Check if it's likely math (contains LaTeX commands or math symbols)
      const isMath =
        /\\[a-zA-Z]+|\\[{}_^]|frac|sqrt|sum|int|begin|end|aligned|matrix|pmatrix|bmatrix|alpha|beta|gamma|pi|theta|lambda|mu|sigma|delta|Delta/.test(
          math
        );
      // Also check if it's on its own line(s) or preceded by text ending with certain patterns
      const before = rawContent.substring(Math.max(0, offset - 20), offset);
      const after = rawContent.substring(
        offset + match.length,
        Math.min(rawContent.length, offset + match.length + 20)
      );
      const isStandalone = /[\n:]/.test(before.slice(-1)) || /[\n\.]/.test(after[0] || "");

      if (isMath && (isStandalone || math.includes("\\begin") || math.includes("\\end"))) {
        return `$$${math}$$`;
      }
      return match;
    })
    // Convert inline math: ( ... ) containing LaTeX
    .replace(/\(([^)]+)\)/g, (match, math) => {
      // Only convert if it contains LaTeX commands
      if (/\\[a-zA-Z]+|\\[{}_^]|frac|sqrt|sum|int/.test(math)) {
        return `$${math}$`;
      }
      return match;
    });

  return (
    <div className="max-w-[768px]">
      <div className="relative w-full items-center gap-3 overflow-hidden rounded-3xl bg-linear-to-tr p-px from-white/5 to-white/20">
        <div className="block resize-none py-5 pl-4 pr-4 w-full rounded-3xl border-none bg-[#0a0a0a] text-white max-w-none">
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
                p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
                li: ({ children }) => <li className="ml-2">{children}</li>,
                strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                em: ({ children }) => <em className="italic">{children}</em>,
                code: ({ children, className }) => {
                  const isInline = !className;
                  return isInline ? (
                    <code className="bg-white/10 px-1 py-0.5 rounded text-sm font-mono">{children}</code>
                  ) : (
                    <code className={className}>{children}</code>
                  );
                },
                pre: ({ children }) => <pre className="bg-white/10 p-2 rounded overflow-x-auto mb-2">{children}</pre>,
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
};
