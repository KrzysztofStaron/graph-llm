import { ContextNode as ContextNodeType } from "@/app/types/graph";
import { FileText } from "lucide-react";
import { memo } from "react";

type ContextNodeProps = {
  node: ContextNodeType;
};

const arraysEqual = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);

export const ContextNode = memo(
  function ContextNode({ node }: ContextNodeProps) {
    return (
      <div
        className="w-24 h-24 flex items-center justify-center overflow-hidden rounded-3xl bg-gradient-to-tr p-px from-white/5 to-white/20"
        data-node-id={node.id}
      >
        <div className="w-full h-full flex items-center justify-center rounded-3xl border-none bg-[#0a0a0a] text-white">
          <FileText className="size-8" />
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
