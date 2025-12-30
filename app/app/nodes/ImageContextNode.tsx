import { ImageContextNode as ImageContextNodeType } from "@/app/types/graph";
import { memo } from "react";

type ImageContextNodeProps = {
  node: ImageContextNodeType;
  isSelected?: boolean;
};

const arraysEqual = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

export const ImageContextNode = memo(
  function ImageContextNode({
    node,
    isSelected = false,
  }: ImageContextNodeProps) {
    return (
      <div className="flex items-center group">
        <div
          className="max-w-[464px] inline-flex items-center justify-center overflow-hidden rounded-3xl bg-linear-to-tr p-px from-white/5 to-white/20"
          style={{
            boxShadow: isSelected
              ? "0 0 0 2px rgba(255, 255, 255, 0.5), 0 0 20px rgba(255, 255, 255, 0.3)"
              : undefined,
            transition: "box-shadow 0.2s ease",
          }}
        >
          <div className="flex items-center justify-center rounded-3xl border-none bg-[#0a0a0a] overflow-hidden">
            {node.value ? (
              <img
                src={node.value}
                alt="Context"
                className="max-w-[464px] h-auto object-contain"
              />
            ) : (
              <div className="text-white/30 p-8">No image</div>
            )}
          </div>
        </div>
      </div>
    );
  },
  (prev, next) => {
    // Only re-render when value, parentIds, childrenIds, or isSelected change
    return (
      prev.node.value === next.node.value &&
      arraysEqual(prev.node.parentIds, next.node.parentIds) &&
      arraysEqual(prev.node.childrenIds, next.node.childrenIds) &&
      prev.isSelected === next.isSelected
    );
  }
);
