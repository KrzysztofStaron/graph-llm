import { ImageContextNode as ImageContextNodeType } from "@/app/types/graph";
import { memo } from "react";

type ImageContextNodeProps = {
  node: ImageContextNodeType;
};

const arraysEqual = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

export const ImageContextNode = memo(
  function ImageContextNode({ node }: ImageContextNodeProps) {
    return (
      <div className="flex items-center group">
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
