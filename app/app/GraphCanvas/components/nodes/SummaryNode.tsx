import { memo } from "react";
import { SummaryNode as SummaryNodeType } from "@/app/types/graph";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

type SummaryNodeProps = {
  node: SummaryNodeType;
  isSelected?: boolean;
};

function arraysEqual(a: string[], b: string[]) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export const SummaryNode = memo(
  function SummaryNode({ node, isSelected = false }: SummaryNodeProps) {
    return (
      <div className="max-w-[808px] min-w-[240px] flex items-center group">
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
            <div className="text-xs font-mono text-white/60 mb-3">Summary</div>
            <ReactMarkdown
              remarkPlugins={[remarkMath, remarkGfm]}
              rehypePlugins={[rehypeKatex]}
            >
              {node.value}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    );
  },
  (prev, next) =>
    prev.node.value === next.node.value &&
    arraysEqual(prev.node.parentIds, next.node.parentIds) &&
    arraysEqual(prev.node.childrenIds, next.node.childrenIds) &&
    prev.isSelected === next.isSelected
);

SummaryNode.displayName = "SummaryNode";


