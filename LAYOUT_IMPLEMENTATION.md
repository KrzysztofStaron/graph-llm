# Smart Layout Implementation Summary

This document summarizes the automatic layout system implemented for the graph-llm application.

## Overview

The system provides **local, incremental auto-placement** for nodes with **collision-aware positioning** during streaming, while respecting user intent (pinned nodes).

## Key Features

### 1. Pinned Nodes (User Intent Preservation)
- **Location**: `app/types/graph.ts`, `app/hooks/useGraphCanvas.ts`
- Nodes gain a `pinned?: boolean` flag
- When a user drags a node, it becomes `pinned: true` on first movement
- Pinned nodes are protected from auto-layout (only tiny nudges allowed)

### 2. Node Dimension Tracking
- **Location**: `app/hooks/useGraphCanvas.ts`, `app/hooks/GraphCanvasContext.tsx`, `app/app/GraphCanvas.tsx`
- Real DOM dimensions flow from `GraphCanvas` (ResizeObserver) → context → placement logic
- Enables accurate collision detection with actual rendered sizes

### 3. Smart Placement Algorithm
- **Location**: `app/utils/layout.ts`
- **Algorithm**: Spiral/grid search from target position
- **Features**:
  - Direction-aware (prefers "below" for vertical flow, "right" for horizontal)
  - Rectangle intersection detection with configurable gap
  - Fast coarse-grid search (configurable step size)
  - Fallback to target position if no free spot found

### 4. Collision Resolution During Streaming
- **Location**: `app/utils/collisionResolver.ts`, `app/app/GraphCanvas.tsx`
- Triggered when response nodes grow significantly (>10px)
- **Strategy**:
  - Push **unpinned** neighbors away smoothly
  - If only **pinned** nodes overlap → move the **response** node instead
  - Mixed case → push unpinned, tiny nudge pinned (respects user intent)
- Uses `requestAnimationFrame` for smooth, incremental movement

### 5. Integration Points
- **Location**: `app/app/AppPage.tsx`
- Smart placement applied to:
  1. Creating response nodes below input nodes
  2. Auto-creating follow-up input nodes after streaming completes
  3. Dropping multiple files as context nodes (batch placement)
  4. Adding input nodes from context/response buttons

### 6. Tuning Constants
- **Location**: `app/globals.ts`
- All layout behavior controlled via `LAYOUT_CONFIG`:
  - `gapPx`: Minimum spacing between nodes (24px)
  - `gridStepPx`: Search precision (20px)
  - `maxSearchRings`: Search extent (50 rings)
  - `pushStepPx`: Collision push speed (8px/frame)
  - `pinnedMaxNudgePx`: Max pinned node movement (3px/frame)

## Behavior Summary

### When nodes auto-appear:
- System finds the nearest free spot using spiral search
- Respects preferred direction (e.g., below parent for vertical flow)
- Never overlaps existing nodes (with gap)

### During streaming (response node grows):
- Detects dimension changes via ResizeObserver
- Resolves overlaps locally (only nearby nodes)
- Unpinned nodes smoothly slide away
- Pinned nodes stay put (or tiny nudge if absolutely necessary)
- No global reflow

### When user drags:
- Node becomes pinned immediately on first move
- Auto-layout will not move it again
- User placement is final and respected

## Testing Checklist

- [ ] Auto-created input below tall response never overlaps existing nodes
- [ ] Streaming a response near other nodes gently pushes unpinned nodes aside
- [ ] Drag any node: after release it stays where you put it
- [ ] Streaming nearby does not meaningfully move pinned nodes
- [ ] No global reflow: only streaming response and immediate neighbors move
- [ ] Dropping multiple files creates staggered, non-overlapping context nodes

## Tuning Guide

If you want to adjust the feel:

- **More spacing**: Increase `gapPx`
- **Faster collision push**: Increase `pushStepPx`
- **More respect for pinned nodes**: Decrease `pinnedMaxNudgePx`
- **More precise placement**: Decrease `gridStepPx` (slower search)
- **Handle denser graphs**: Increase `maxSearchRings`

All constants are in `app/globals.ts` under `LAYOUT_CONFIG`.
