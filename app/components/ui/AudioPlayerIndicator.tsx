import { motion } from "framer-motion";
import { X, Volume2, Loader2 } from "lucide-react";

interface AudioPlayerIndicatorProps {
  onStop: () => void;
  isLoading?: boolean;
}

export const AudioPlayerIndicator = ({
  onStop,
  isLoading = false,
}: AudioPlayerIndicatorProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-lg border border-white/10 bg-[#0a0a0a] shadow-lg backdrop-blur-sm"
    >
      <div className="flex items-center gap-2">
        {isLoading ? (
          <Loader2 className="size-4 text-white animate-spin" />
        ) : (
          <Volume2 className="size-4 text-white animate-pulse" />
        )}
        <span className="text-sm font-mono text-white">
          {isLoading ? "Generating audio..." : "Playing audio..."}
        </span>
      </div>
      {!isLoading && (
        <button
          onClick={onStop}
          className="p-1.5 rounded hover:bg-white/10 transition-colors group"
          aria-label="Stop audio"
        >
          <X className="size-4 text-white/70 group-hover:text-white transition-colors" />
        </button>
      )}
    </motion.div>
  );
};
