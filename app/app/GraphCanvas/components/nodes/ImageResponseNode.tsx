import { ImageResponseNode as ImageResponseNodeType } from "@/app/types/graph";
import { memo, useState } from "react";

type ImageResponseNodeProps = {
  node: ImageResponseNodeType;
  isSelected?: boolean;
};

const arraysEqual = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

export const ImageResponseNode = memo(
  function ImageResponseNode({
    node,
    isSelected = false,
  }: ImageResponseNodeProps) {
    const [isLoaded, setIsLoaded] = useState(false);
    const [hasError, setHasError] = useState(false);
    const isLoading = !node.value && !node.error;

    const handleDownload = async () => {
      if (!node.value) return;
      
      const response = await fetch(node.value);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `generated-image-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };

    return (
      <div className="flex items-center group max-w-[520px]">
        <div
          className="relative w-full inline-flex items-center justify-center overflow-hidden rounded-3xl bg-linear-to-tr p-px from-emerald-500/20 to-teal-400/30"
          style={{
            boxShadow: isSelected
              ? "0 0 0 2px rgba(16, 185, 129, 0.6), 0 0 24px rgba(16, 185, 129, 0.3)"
              : undefined,
            transition: "box-shadow 0.2s ease",
          }}
        >
          <div className="flex flex-col items-center justify-center rounded-3xl border-none bg-[#0a0a0a] overflow-hidden w-full">
            {isLoading ? (
              <div className="flex items-center justify-center gap-3 p-8 text-white/70">
                <div className="size-5 rounded-full border-2 border-emerald-500/30 border-t-emerald-400 animate-spin" />
                <p className="text-sm font-mono">Generating image…</p>
              </div>
            ) : node.error || hasError ? (
              <div className="flex items-start gap-3 p-6 text-red-400">
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
                    Failed to generate image
                  </p>
                  <p className="text-sm text-red-300/80 font-mono">
                    {node.error || "Image failed to load"}
                  </p>
                </div>
              </div>
            ) : (
              <div className="relative">
                {!isLoaded && (
                  <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a]">
                    <div className="size-5 rounded-full border-2 border-emerald-500/30 border-t-emerald-400 animate-spin" />
                  </div>
                )}
                <img
                  src={node.value}
                  alt={node.prompt || "Generated image"}
                  className={`max-w-[500px] h-auto object-contain transition-opacity duration-300 ${
                    isLoaded ? "opacity-100" : "opacity-0"
                  }`}
                  onLoad={() => setIsLoaded(true)}
                  onError={() => setHasError(true)}
                />
                
                {/* Overlay with actions on hover */}
                <div className="absolute inset-0 bg-black/0 hover:bg-black/40 transition-colors duration-200 flex items-end justify-center opacity-0 hover:opacity-100">
                  <div className="flex gap-2 p-3">
                    <button
                      onClick={handleDownload}
                      className="px-3 py-1.5 rounded-lg bg-white/10 backdrop-blur-sm text-white/90 text-xs font-medium hover:bg-white/20 transition-colors flex items-center gap-1.5"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Download
                    </button>
                    <a
                      href={node.value}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-lg bg-white/10 backdrop-blur-sm text-white/90 text-xs font-medium hover:bg-white/20 transition-colors flex items-center gap-1.5"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      Open
                    </a>
                  </div>
                </div>
              </div>
            )}
            
            {/* Show prompt if available */}
            {node.prompt && isLoaded && !hasError && (
              <div className="w-full px-4 py-2 border-t border-white/5 bg-white/[0.02]">
                <p className="text-xs text-white/40 font-mono line-clamp-2">
                  {node.prompt}
                </p>
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
      prev.node.error === next.node.error &&
      prev.node.prompt === next.node.prompt &&
      arraysEqual(prev.node.parentIds, next.node.parentIds) &&
      arraysEqual(prev.node.childrenIds, next.node.childrenIds) &&
      prev.isSelected === next.isSelected
    );
  }
);

