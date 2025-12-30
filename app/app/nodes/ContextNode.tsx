import { memo } from "react";
import { ContextNode as ContextNodeType } from "@/app/types/graph";
import { FileText, PlusIcon } from "lucide-react";

type ContextNodeProps = {
  node: ContextNodeType;
  onAddNode?: (position: "left" | "right") => void;
};

function arraysEqual(a: string[], b: string[]) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

const ContextNodeContent = ({ node, onAddNode }: ContextNodeProps) => {
  function handleAdd(pos: "left" | "right") {
    return (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      onAddNode?.(pos);
    };
  }

  return (
    <div className="flex items-center group">
      <button
        className="size-[40px]"
        onClick={handleAdd("left")}
        onMouseDown={(e) => e.stopPropagation()}
        tabIndex={-1}
        aria-label="Add node to left"
        type="button"
      >
        <PlusIcon
          size={30}
          className="invisible group-hover:visible rounded-full border border-white/10"
        />
      </button>
      <div className="w-24 h-24 flex items-center justify-center overflow-hidden rounded-3xl bg-gradient-to-tr p-px from-white/5 to-white/20">
        <div className="w-full h-full flex items-center justify-center rounded-3xl border-none bg-[#0a0a0a] text-white">
          <FileText className="size-8" />
        </div>
      </div>
      <button
        className="size-[40px]"
        onClick={handleAdd("right")}
        onMouseDown={(e) => e.stopPropagation()}
        tabIndex={-1}
        aria-label="Add node to right"
        type="button"
      >
        <PlusIcon
          size={30}
          className="invisible group-hover:visible rounded-full border border-white/10"
        />
      </button>
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
