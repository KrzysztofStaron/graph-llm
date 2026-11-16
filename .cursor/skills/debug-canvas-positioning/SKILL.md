---
name: debug-canvas-positioning
description: Debug and fix graph canvas node placement — off-center replies, images, Reasoning/Generating pills, late follow-ups, 1×1 spawn, dragged nodes snapping back, and ResizeObserver races. Use when a node sits under the wrong parent, X slides, follow-up appears late or on the spinner, or anyone mentions placement, seats, settle, centering, GraphCanvas, or waitForPaintedImage.
---

# Debug canvas positioning

This is not React Flow. Nodes are absolutely positioned (`left`/`top` = `node.x`/`node.y`) on a D3 pan/zoom canvas. Layout is measured boxes plus `patchNode({ x, y })`.

## Invariants

- A node is **seated** (`seat: { hostId, flow, shift }`) or **hand-placed** (no seat). Only `settle` writes a seated node's x/y. Nothing automatic moves a hand-placed node.
- A seat counts only while its host exists and is in `parentIds`. Otherwise the node is hand-placed.
- `hang` picks a seat once, at spawn. `settle` re-derives positions from seats and measured sizes and never searches. Applying its moves and calling it again returns `[]`.
- Flow "below": child center x = host center x + `shift`. Gap is `CHILD_BELOW_PARENT_GAP` (35). Siblings in one lane stack, videos first.
- Lanes are 880 apart. Replies and summaries are capped at `LANE_WIDTH` (808), so a node never outgrows its lane.
- `settle` skips unmeasured nodes. A node keeps its spawn spot until its first size report, and nothing is placed under an unmeasured host. This is what keeps a saved canvas still on load.
- In `hang` and `drop`, unmeasured nodes are obstacles at default size, so nodes spawned in one tick see each other.
- A drag is `DRAG_NODES` → `dragNodes`. It unseats the grabbed nodes and carries what is seated under them.
- Pointer coordinates go through `toCanvasPoint`. `CanvasPoint` is branded, so a screen point does not type-check.
- Write absolute `x`/`y` through `treeManager.patchNode`. `patchNode` cannot write `seat`.
- `nodesRef` is the live graph. Child `useLayoutEffect` / ResizeObserver can run before React commits. Sync the ref in `dispatchAndSync` **and** `useLayoutEffect`. Never assign `nodesRef.current = nodes` during render.
- `updateNodeDimension` runs `settle` even when `sizeChanged` is false. Gating it on size change leaves a 1×1 spawn stuck.

## Where it lives

| Piece | File |
|---|---|
| `hang`, `drop`, `settle`, `dragNodes` | `app/utils/placement.ts` |
| Size report → `settle` | `app/app/GraphCanvas/GraphCanvas.tsx` (`updateNodeDimension`) |
| Reply / video spawn, align after paint | `app/hooks/spawnPredictedNode.ts`, `app/hooks/useAIChat.ts` |
| Follow-up input | `app/hooks/ensureFollowUpInput.ts` |
| Pointer placements | `app/hooks/useContextMenu.ts`, `app/hooks/useFileUpload.ts`, `app/app/page.tsx` |
| Drag | `app/app/GraphCanvas/hooks/usePointerGestures.ts` → `DRAG_NODES` in `app/interfaces/TreeManager.ts` |
| Image-ready check | `app/utils/imageLayoutReady.ts` |
| Per-node RO | `app/app/GraphCanvas/components/nodes/GraphNodeFrame.tsx` |
| Image card | `app/app/GraphCanvas/components/nodes/ImageResponseNode.tsx` (`w-[520px]`, Grid Reveal **canvas**) |

Defaults in `getDefaultNodeDimensions`: input `400×120`, response `400×80`, image-response `520×520`.

## Debug first (measure, do not guess)

Pick the host and child `[data-node-id]`. Read `offsetWidth`/`offsetHeight`, stored `x`/`y`, and `seat`.

```
hostCenterX  = host.x + hostWidth / 2
childCenterX = child.x + childWidth / 2   // must equal hostCenterX + seat.shift
```

A 400-wide prompt at `x=-200` is center `0`. A 520-wide image under it should be at `x=-260`.

Ask, in order:

1. Is the node seated? No `seat` means the user dragged it or it predates seats. `settle` will not touch it.
2. Is the seat valid? `seat.hostId` must exist and be in `parentIds`.
3. Did `settle` run with a measured node? If `liveNode` was missing from `nodesRef`, or the node has no size yet, it no-ops.
4. Which width was used? `liveCanvas` reads the DOM for the node and its host.
5. Is follow-up waiting on `waitForPaintedImage` / `imageHasLayoutSize`?
6. Did submit fire twice (`mousedown` + `click`)? Guard lives on `InputFieldNode` + `isSubmittingRef`.

Do not add a second canvas-level ResizeObserver.

## Failure catalog

**Image never left spawn (`x≈-1`, width later 520/606).** Type swap `response` → `image-response` grew the card and `settle` never saw it. Fix: `settle` on every size report, `commitAlignedNode` after paint, `scheduleAlignWhenPainted` (up to 30 rAF, width > 20).

**Follow-up under the image, image under nothing.** The image was never measured, so nothing under it was placed. Fix the image first.

**Follow-up ~15s late.** Grid Reveal is a 520px canvas (`[data-slot='grid-reveal']`), no `<img>`. Ready = shell + reveal (or a real painted `<img>`) above `IMAGE_LAYOUT_MIN_PX` (20). Do not hardcode 606. The response pill has no reveal and must stay “not ready”.

**Reasoning / Loading / Generating off-center.** First RO ran before `nodesRef` had the node. Sync refs before paint.

**Follow-up on the spinner.** Spawn follow-up only when `hasRenderableContent`. `settle` does not stack a follow-up under a reply that is still pending.

**Dragged node snaps back.** Something wrote its x/y as if it were seated. A drag must go through `DRAG_NODES`, which clears the seat.

**Seated node jumps below a node the user placed.** Expected. A seated node hops below a hand-placed node in its slot and keeps its center. It never slides sideways.

**Old saved graph does not recenter replies.** Expected. Nodes saved before seats have none, so they are hand-placed.

**Restored or dropped node lands off-screen.** A screen point was passed as a canvas point. Convert with `toCanvasPoint`.

**Gap in a video stack after dragging one out.** Known. The stack closes on the next size report under that host, not on drag.

**Deleted node comes back.** After abort-on-delete, bail if `nodesRef.current[id]` is gone before `patchNode` or follow-up spawn.

## Fix rules

- Measure from the DOM.
- Center lock is the feature. Do not “nudge X a bit”.
- Never write a seated node's x/y outside `settle`. Never search for room inside `settle`.
- After a type swap, wait until the **new** card is in the DOM, then `commitAlignedNode`.
- No `any`. No extra try/catch. Do not start `pnpm run dev`.
- Add a unit test next to the contract you change (`placement.test.ts`, `TreeManager.test.ts`, `imageLayoutReady.test.ts`).

## Verify

`pnpm test`. `placement.test.ts` includes a seeded random-graph property test.

Live check: prompt, pill, image card, and follow-up share one center X. Follow-up appears when the 520 card is on the canvas. A dragged reply stays put while it streams.
