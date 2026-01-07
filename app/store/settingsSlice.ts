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

export const availableImageModels: ModelOption[] = [
  {
    label: "Nano Banana",
    value: "google/gemini-2.5-flash-image",
  },
  {
    label: "Nano Banana Pro",
    value: "google/gemini-3-pro-image-preview",
  },
];
/*   {
    label: "Kimi K2",
    value: "moonshotai/kimi-k2-thinking",
  },

  */
interface SettingsState {
  selectedModel: string;
  selectedImageModel: string;
  webSearchEnabled: boolean;
}

const initialState: SettingsState = {
  selectedModel: availableModels[0].value, // Default to Grok
  selectedImageModel: availableImageModels[1].value, // Default to Nano Banana pro
  webSearchEnabled: true, // Default to enabled
};

const settingsSlice = createSlice({
  name: "settings",
  initialState,
  reducers: {
    setSelectedModel: (state, action: PayloadAction<string>) => {
      state.selectedModel = action.payload;
    },
    setSelectedImageModel: (state, action: PayloadAction<string>) => {
      state.selectedImageModel = action.payload;
    },
    setWebSearchEnabled: (state, action: PayloadAction<boolean>) => {
      state.webSearchEnabled = action.payload;
    },
  },
});

export const { setSelectedModel, setSelectedImageModel, setWebSearchEnabled } = settingsSlice.actions;
export default settingsSlice.reducer;
