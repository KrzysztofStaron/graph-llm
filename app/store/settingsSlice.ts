import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface ModelOption {
  label: string;
  value: string;
}

export const availableModels: ModelOption[] = [
  {
    label: "Grok",
    value: "x-ai/grok-4.1-fast",
  },
  {
    label: "Gemini",
    value: "google/gemini-3-flash-preview",
  },
  {
    label: "Claude",
    value: "anthropic/claude-sonnet-4.5",
  },
];
/*   {
    label: "Kimi K2",
    value: "moonshotai/kimi-k2-thinking",
  },

  */
interface SettingsState {
  selectedModel: string;
}

const initialState: SettingsState = {
  selectedModel: availableModels[0].value, // Default to Grok
};

const settingsSlice = createSlice({
  name: "settings",
  initialState,
  reducers: {
    setSelectedModel: (state, action: PayloadAction<string>) => {
      state.selectedModel = action.payload;
    },
  },
});

export const { setSelectedModel } = settingsSlice.actions;
export default settingsSlice.reducer;
