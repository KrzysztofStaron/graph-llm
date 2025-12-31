import React from "react";
import { useAppSelector } from "../../store/hooks";
import { availableModels } from "../../store/settingsSlice";

export const ModelIndicator = () => {
  const selectedModel = useAppSelector((state) => state.settings.selectedModel);

  const currentModel = availableModels.find(
    (model) => model.value === selectedModel
  );

  if (!currentModel) return null;

  return (
    <div className="fixed bottom-4 right-4 z-40 pointer-events-none">
      <div className="px-3 py-1.5 rounded-md border border-white/10 bg-[#0a0a0a]/80 backdrop-blur-sm shadow-lg">
        <div className="flex items-center gap-2">
          <div className="size-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs font-mono text-white/60">
            {currentModel.label}
          </span>
        </div>
      </div>
    </div>
  );
};
