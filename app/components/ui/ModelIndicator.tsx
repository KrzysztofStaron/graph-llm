import { useAppSelector } from "../../store/hooks";
import { availableModels } from "../../store/settingsSlice";

export const ModelIndicator = ({onClick}: {onClick: () => void}) => {
  const selectedModel = useAppSelector((state) => state.settings.selectedModel);
  const isBackendAvaliable = true;

  const currentModel = availableModels.find(
    (model) => model.value === selectedModel
  );

  if (!currentModel) return null;

  return (
    <button className="pointer-events-auto cursor-pointer hidden lg:block" onClick={onClick}>
      <div className="px-3 py-1.5 rounded-md border border-white/10 bg-[#0a0a0a]/80 backdrop-blur-sm shadow-lg hover:bg-white/5 transition-colors">
        <div className="flex items-center gap-2">
          {!isBackendAvaliable  && <div className="size-2 rounded-full bg-red-500 animate-pulse" /> }
          <span className="text-xs font-mono text-white/60">
            {currentModel.label}
          </span>
        </div>
      </div>
    </button>
  );
};
