import { memo } from "react";
import { ContextNode as ContextNodeType } from "@/app/types/graph";
import { FileText } from "lucide-react";

type ContextNodeProps = {
  node: ContextNodeType;
};

function arraysEqual(a: string[], b: string[]) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

const ContextNodeContent = ({ node }: ContextNodeProps) => {
  return (
    <div className="flex items-center group">
      <div className="w-24 h-24 flex items-center justify-center overflow-hidden rounded-3xl bg-gradient-to-tr p-px from-white/5 to-white/20">
        <div className="w-full h-full flex items-center justify-center rounded-3xl border-none bg-[#0a0a0a] text-white">
          <FileText className="size-8" />
        </div>
      </div>
    </div>
  );
};

export const ContextNode = memo(
  (props: ContextNodeProps) => <ContextNodeContent {...props} />,
  (prev, next) =>
    prev.node.value === next.node.value &&
    arraysEqual(prev.node.parentIds, next.node.parentIds) &&
    arraysEqual(prev.node.childrenIds, next.node.childrenIds)
);

ContextNode.displayName = "ContextNode";
