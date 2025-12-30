import { memo } from "react";
import { ContextNode as ContextNodeType } from "@/app/types/graph";
import { FileText } from "lucide-react";

type ContextNodeProps = {
  node: ContextNodeType;
  isSelected?: boolean;
};

function arraysEqual(a: string[], b: string[]) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

const ContextNodeContent = ({
  node: _node,
  isSelected = false,
}: ContextNodeProps) => {
  return (
    <div className="flex items-center group">
      <div
        className="w-24 h-24 flex items-center justify-center overflow-hidden rounded-3xl bg-linear-to-tr p-px from-white/5 to-white/20"
        style={{
          boxShadow: isSelected
            ? "0 0 0 2px rgba(255, 255, 255, 0.5), 0 0 20px rgba(255, 255, 255, 0.3)"
            : undefined,
          transition: "box-shadow 0.2s ease",
        }}
      >
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
    arraysEqual(prev.node.childrenIds, next.node.childrenIds) &&
    prev.isSelected === next.isSelected
);

ContextNode.displayName = "ContextNode";
