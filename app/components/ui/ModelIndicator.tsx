import { useAppSelector } from "../../store/hooks";
import { availableModels } from "../../store/settingsSlice";
import { Globe } from "lucide-react";

export const ModelIndicator = ({onClick}: {onClick: () => void}) => {
  const selectedModel = useAppSelector((state) => state.settings.selectedModel);
  const isBackendAvaliable = true;

  const currentModel = availableModels.find(
    (model) => model.value === selectedModel
  );

  const isWebSearchEnabled = useAppSelector((state) => state.settings.webSearchEnabled);

  if (!currentModel) return null;

  return (
    <button className="pointer-events-auto cursor-pointer" onClick={onClick}>
      <div className="px-3 py-1.5 rounded-md border border-white/10 bg-[#0a0a0a]/80 backdrop-blur-sm shadow-lg hover:bg-white/5 transition-colors">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-white/60">
            {currentModel.label}
          </span>
          <div className="relative flex items-center">
            <Globe 
              className={`size-3 transition-all duration-300 ${
                isWebSearchEnabled 
                  ? "text-green-400/80 animate-pulse" 
                  : "text-white/30"
              }`}
            />
          </div>
        </div>
      </div>
    </button>
  );
};
