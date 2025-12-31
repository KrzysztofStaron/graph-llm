# Redux Implementation - Model Selection

## Overview
Implemented global state management using Redux Toolkit for model selection across the application.

## What Was Added

### 1. Redux Store Structure
- **`app/store/index.ts`** - Main store configuration
- **`app/store/settingsSlice.ts`** - Settings slice with model selection state
- **`app/store/hooks.ts`** - Typed Redux hooks for TypeScript
- **`app/store/ReduxProvider.tsx`** - Client-side Redux provider component

### 2. Available Models
The following models are now selectable:
- **Grok** - `x-ai/grok-beta`
- **Gemini** - `google/gemini-2.0-flash-exp:free`
- **Claude** - `anthropic/claude-3.5-sonnet`
- **GPT-4o** - `openai/gpt-4o`
- **Llama 3.3 70B** - `meta-llama/llama-3.3-70b-instruct`

### 3. QuickMenu Rebuild
- **File**: `app/app/QuickMenu.tsx`
- Now displays all available models
- Shows checkmark for currently selected model
- Displays provider name (e.g., "x-ai", "google") on the right
- Clicking a model updates the global Redux state

### 4. AI Chat Integration
- **File**: `app/hooks/useAIChat.ts`
- Updated to read selected model from Redux store
- Passes selected model to all AI service calls
- Both initial queries and cascading updates use the selected model

### 5. Visual Indicator
- **File**: `app/components/ui/ModelIndicator.tsx`
- Fixed indicator in bottom-right corner
- Shows currently selected model name
- Green pulsing dot for visual feedback

### 6. Layout Integration
- **File**: `app/layout.tsx`
- Wrapped app with ReduxProvider
- All pages now have access to Redux store

## How to Use

### Opening the Quick Menu
Press the keyboard shortcut (check `useKeyboardShortcuts.ts` for the key binding) to open the QuickMenu.

### Selecting a Model
1. Open the QuickMenu
2. Click on any model to select it
3. The menu will close and the model indicator will update
4. All subsequent AI queries will use the selected model

### Adding New Models
Edit `app/store/settingsSlice.ts` and add to the `availableModels` array:

```typescript
{
  label: "Model Name",
  value: "provider/model-id",
}
```

## Dependencies Added
- `@reduxjs/toolkit` - Redux state management
- `react-redux` - React bindings for Redux

## State Structure
```typescript
{
  settings: {
    selectedModel: string // e.g., "x-ai/grok-beta"
  }
}
```

## Future Enhancements
- Add more model options
- Persist selected model to localStorage
- Add model-specific settings (temperature, max tokens, etc.)
- Add keyboard shortcuts for quick model switching
