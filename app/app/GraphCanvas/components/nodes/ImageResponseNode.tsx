import { ImageResponseNode as ImageResponseNodeType } from "@/app/types/graph";
import { memo, useState, useEffect } from "react";

type ImageResponseNodeProps = {
  node: ImageResponseNodeType;
  isSelected?: boolean;
};

const arraysEqual = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

// Hook to detect touch/mobile devices
function useIsTouchDevice() {
  const [isTouch, setIsTouch] = useState(false);
  
  useEffect(() => {
    const checkTouch = () => {
      setIsTouch(
        'ontouchstart' in window || 
        navigator.maxTouchPoints > 0
      );
    };
    checkTouch();
    window.addEventListener('touchstart', () => setIsTouch(true), { once: true });
  }, []);
  
  return isTouch;
}

// Animated loading indicator component
const ImageLoadingIndicator = () => (
  <div className="flex flex-col items-center justify-center gap-4 p-12">
    {/* Animated image icon */}
    <div className="relative w-16 h-16">
      {/* Outer rotating ring */}
      <div className="absolute inset-0 rounded-lg border-2 border-white/20 border-t-white/70 animate-spin" />
      
      {/* Inner image icon */}
      <div className="absolute inset-2 flex items-center justify-center">
        <svg
          className="w-8 h-8 text-white/70"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      </div>
      
      {/* Pulsing dots */}
      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex gap-1">
        <div className="w-1.5 h-1.5 rounded-full bg-white/70 animate-pulse" style={{ animationDelay: '0ms' }} />
        <div className="w-1.5 h-1.5 rounded-full bg-white/70 animate-pulse" style={{ animationDelay: '150ms' }} />
        <div className="w-1.5 h-1.5 rounded-full bg-white/70 animate-pulse" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
    
    <p className="text-sm font-mono text-white/70">Processing image…</p>
  </div>
);

export const ImageResponseNode = memo(
  function ImageResponseNode({
    node,
    isSelected = false,
  }: ImageResponseNodeProps) {
    const [isLoaded, setIsLoaded] = useState(false);
    const [hasError, setHasError] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const isTouchDevice = useIsTouchDevice();
    // Show loading when value is empty or undefined
    const isLoading = (!node.value || node.value === "") && !node.error;

    const handleDownload = async () => {
      if (!node.value || isDownloading) return;
      
      setIsDownloading(true);
      
      // Check if we're on iOS Safari (doesn't support programmatic downloads well)
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      
      if (isIOS) {
        // On iOS, open in new tab - user can long-press to save
        window.open(node.value, '_blank');
        setIsDownloading(false);
        return;
      }
      
      // For other devices, try programmatic download
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
      <div 
        className="flex items-center group"
        style={{
          maxWidth: "606px",
        }}
      >
        <div
          className="relative items-center gap-3 overflow-hidden rounded-3xl bg-linear-to-tr p-px from-white/5 to-white/20"
          style={{
            boxShadow: isSelected
              ? "0 0 0 2px rgba(255, 255, 255, 0.5), 0 0 20px rgba(255, 255, 255, 0.3)"
              : undefined,
            transition: "box-shadow 0.2s ease",
          }}
        >
          <div className="flex flex-col items-center justify-center rounded-3xl border-none bg-[#0a0a0a] overflow-hidden">
            {isLoading ? (
              <ImageLoadingIndicator />
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
                    <div className="size-5 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" />
                  </div>
                )}
                <img
                  src={node.value}
                  alt={node.prompt || "Generated image"}
                  draggable={false}
                  className={`max-w-full h-auto object-contain transition-opacity duration-300 ${
                    isLoaded ? "opacity-100" : "opacity-0"
                  }`}
                  style={{ maxWidth: "606px" }}
                  onLoad={() => setIsLoaded(true)}
                  onError={() => setHasError(true)}
                />
                
                {/* Overlay with actions - always visible on touch, hover on desktop */}
                <div 
                  className={`absolute inset-0 flex items-end justify-center ${
                    isTouchDevice 
                      ? 'opacity-100' 
                      : 'bg-black/0 hover:bg-black/40 opacity-0 hover:opacity-100 transition-opacity duration-150'
                  }`}
                >
                  <div className="flex gap-2 p-3">
                    <button
                      onClick={handleDownload}
                      onMouseDown={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      onTouchStart={(e) => e.stopPropagation()}
                      disabled={isDownloading}
                      className={`px-3 py-2 rounded-lg text-white text-xs font-medium flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${
                        isTouchDevice 
                          ? 'bg-black/70 backdrop-blur-sm min-w-24 justify-center shadow-lg' 
                          : 'bg-white/10 backdrop-blur-sm hover:bg-white/20'
                      } ${isDownloading ? 'opacity-50' : ''}`}
                      aria-label="Download image"
                    >
                      {isDownloading ? (
                        <div className="size-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                      )}
                      {isTouchDevice ? 'Save' : 'Download'}
                    </button>
                    <a
                      href={node.value}
                      target="_blank"
                      rel="noopener noreferrer"
                      onMouseDown={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      onTouchStart={(e) => e.stopPropagation()}
                      className={`px-3 py-2 rounded-lg text-white text-xs font-medium flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${
                        isTouchDevice 
                          ? 'bg-black/70 backdrop-blur-sm min-w-24 justify-center shadow-lg' 
                          : 'bg-white/10 backdrop-blur-sm hover:bg-white/20'
                      }`}
                      aria-label="Open image in new tab"
                    >
                      <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
              <div className="px-4 py-2 border-t border-white/5 bg-white/2" style={{ width: "100%" }}>
                <p className="text-xs text-white/40 font-mono line-clamp-2" style={{ maxWidth: "606px" }}>
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

