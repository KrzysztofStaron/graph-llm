import { YouTubeNode as YouTubeNodeType } from "@/app/types/graph";
import { memo } from "react";

type YouTubeNodeProps = {
  node: YouTubeNodeType;
  isSelected?: boolean;
};

const arraysEqual = (a: string[], b: string[]) => {
  return a.length === b.length && a.every((v, i) => v === b[i]);
};

export const YouTubeNode = memo(
  function YouTubeNode({ node, isSelected = false }: YouTubeNodeProps) {
    const videoId = node.value;
    const explanation = node.explanation;
    const isFailed = !!node.error;

    return (
      <div
        className="flex items-center group"
        style={{
          maxWidth: "640px",
          minWidth: "480px",
        }}
      >
        <div
          className="relative w-full items-center gap-3 overflow-hidden rounded-3xl bg-linear-to-tr p-px from-white/5 to-white/20"
          style={{
            boxShadow: isSelected
              ? "0 0 0 2px rgba(255, 255, 255, 0.5), 0 0 20px rgba(255, 255, 255, 0.3)"
              : undefined,
            transition: "box-shadow 0.2s ease",
          }}
        >
          <div
            className="block py-5 px-6 w-full rounded-3xl border-none bg-[#0a0a0a] text-white"
          >
            {isFailed ? (
              <div className="flex items-start gap-3 text-red-400">
                <div className="size-4 mt-0.5 shrink-0">
                  <svg
                    viewBox="0 0 16 16"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-full h-full"
                  >
                    <circle
                      cx="8"
                      cy="8"
                      r="7"
                      stroke="currentColor"
                      strokeWidth="2"
                    />
                    <path
                      d="M5 5L11 11M11 5L5 11"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold mb-1">
                    Failed to embed YouTube video
                  </p>
                  <p className="text-sm text-red-300/80 font-mono">
                    {node.error}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {explanation && (
                  <p className="text-sm text-white/70 mb-3">
                    {explanation}
                  </p>
                )}
                <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
                  <iframe
                    className="absolute top-0 left-0 w-full h-full rounded-xl"
                    src={`https://www.youtube.com/embed/${videoId}`}
                    title="YouTube video player"
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  },
  (prev, next) => {
    return (
      prev.node.value === next.node.value &&
      prev.node.explanation === next.node.explanation &&
      prev.node.error === next.node.error &&
      arraysEqual(prev.node.parentIds, next.node.parentIds) &&
      arraysEqual(prev.node.childrenIds, next.node.childrenIds) &&
      prev.isSelected === next.isSelected
    );
  }
);

