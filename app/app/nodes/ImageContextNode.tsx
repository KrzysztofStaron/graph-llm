import { ImageContextNode as ImageContextNodeType } from "@/app/types/graph";
import { PlusIcon } from "lucide-react";
import { memo } from "react";

type ImageContextNodeProps = {
  node: ImageContextNodeType;
  onAddNode?: (position: "left" | "right") => void;
};

const arraysEqual = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

export const ImageContextNode = memo(
  function ImageContextNode({ node, onAddNode }: ImageContextNodeProps) {
    const handleAddLeft = (e: React.MouseEvent) => {
      e.stopPropagation();
      onAddNode?.("left");
    };

    const handleAddRight = (e: React.MouseEvent) => {
      e.stopPropagation();
      onAddNode?.("right");
    };

    return (
      <div className="flex items-center group">
        <button
          className="size-[40px]"
          onClick={handleAddLeft}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <PlusIcon
            size={30}
            className="invisible group-hover:visible rounded-full border border-white/10"
          />
        </button>
        <div className="max-w-96 flex items-center justify-center overflow-hidden rounded-3xl bg-gradient-to-tr p-px from-white/5 to-white/20">
          <div className="w-full h-full flex items-center justify-center rounded-3xl border-none bg-[#0a0a0a] overflow-hidden">
            {node.value ? (
              <img
                src={node.value}
                alt="Context"
                className="max-w-full max-h-96 object-contain"
              />
            ) : (
              <div className="text-white/30 p-8">No image</div>
            )}
          </div>
        </div>
        <button
          className="size-[40px]"
          onClick={handleAddRight}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <PlusIcon
            size={30}
            className="invisible group-hover:visible rounded-full border border-white/10"
          />
        </button>
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
