import { ImageResponseNode as ImageResponseNodeType } from "@/app/types/graph";
import GridReveal from "@/components/ui/grid-reveal";
import { memo, useEffect, useState } from "react";

type ImageResponseNodeProps = {
  node: ImageResponseNodeType;
  isSelected?: boolean;
};

const arraysEqual = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

function useIsTouchDevice() {
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    setIsTouch("ontouchstart" in window || navigator.maxTouchPoints > 0);
    window.addEventListener("touchstart", () => setIsTouch(true), { once: true });
  }, []);

  return isTouch;
}

export const ImageResponseNode = memo(
  function ImageResponseNode({
    node,
    isSelected = false,
  }: ImageResponseNodeProps) {
    const [isLoaded, setIsLoaded] = useState(false);
    const [hasError, setHasError] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [showActions, setShowActions] = useState(false);
    const isTouchDevice = useIsTouchDevice();
    const isLoading = (!node.value || node.value === "") && !node.error;
    const src = isLoading ? null : node.value;

    useEffect(() => {
      setIsLoaded(false);
      setHasError(false);
    }, [node.value]);

    const handleDownload = async () => {
      if (!node.value || isDownloading) return;

      setIsDownloading(true);

      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

      if (isIOS) {
        window.open(node.value, "_blank");
        setIsDownloading(false);
        return;
      }

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
      setIsDownloading(false);
    };

    return (
      <div className="group flex items-center" style={{ maxWidth: "606px" }}>
        <div
          className="relative w-full overflow-hidden rounded-3xl"
          style={{
            boxShadow: isSelected
              ? "0 0 0 2px rgba(255, 255, 255, 0.5), 0 0 20px rgba(255, 255, 255, 0.3)"
              : undefined,
            transition: "box-shadow 0.2s ease",
          }}
        >
          {node.error || hasError ? (
            <div className="flex items-start gap-3 bg-[#0a0a0a] p-6 text-red-400">
              <div className="mt-0.5 size-4 shrink-0">
                <svg viewBox="0 0 16 16" fill="none" className="h-full w-full">
                  <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="2" />
                  <path
                    d="M5 5L11 11M11 5L5 11"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <p className="mb-1 text-sm font-semibold">Failed to generate image</p>
                <p className="font-mono text-sm text-red-300/80">
                  {node.error || "Image failed to load"}
                </p>
              </div>
            </div>
          ) : (
            <div
              className="relative cursor-pointer"
              onClick={() => setShowActions((prev) => !prev)}
            >
              <GridReveal
                src={src}
                alt={node.prompt || "Generated image"}
                caption={src ? "Finishing…" : "Processing image…"}
                estimatedDuration={18000}
                aspect={1}
                onRevealComplete={() => setIsLoaded(true)}
                onError={() => setHasError(true)}
                className="rounded-3xl bg-[#0a0a0a]"
              />

              {isLoaded && (
                <div
                  className={`absolute inset-0 flex items-end justify-center transition-opacity duration-150 ${
                    isTouchDevice
                      ? showActions
                        ? "bg-black/30 opacity-100"
                        : "pointer-events-none opacity-0"
                      : "bg-black/0 opacity-0 hover:bg-black/40 hover:opacity-100"
                  }`}
                >
                  <div className="flex gap-2 p-3" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={handleDownload}
                      onMouseDown={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      onTouchStart={(e) => e.stopPropagation()}
                      disabled={isDownloading}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${
                        isTouchDevice
                          ? "min-w-24 justify-center bg-black/70 shadow-lg backdrop-blur-sm"
                          : "bg-white/10 backdrop-blur-sm hover:bg-white/20"
                      } ${isDownloading ? "opacity-50" : ""}`}
                      aria-label="Download image"
                    >
                      {isDownloading ? (
                        <span className="size-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      ) : (
                        <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                          />
                        </svg>
                      )}
                      {isTouchDevice ? "Save" : "Download"}
                    </button>
                    <a
                      href={node.value}
                      target="_blank"
                      rel="noopener noreferrer"
                      onMouseDown={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      onTouchStart={(e) => e.stopPropagation()}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${
                        isTouchDevice
                          ? "min-w-24 justify-center bg-black/70 shadow-lg backdrop-blur-sm"
                          : "bg-white/10 backdrop-blur-sm hover:bg-white/20"
                      }`}
                      aria-label="Open image in new tab"
                    >
                      <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                        />
                      </svg>
                      Open
                    </a>
                  </div>
                </div>
              )}
            </div>
          )}

          {node.prompt && isLoaded && !hasError && (
            <div className="border-t border-white/5 bg-white/2 px-4 py-2" style={{ width: "100%" }}>
              <p className="line-clamp-2 font-mono text-xs text-white/40" style={{ maxWidth: "606px" }}>
                {node.prompt}
              </p>
            </div>
          )}
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
