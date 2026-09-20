---
name: debug-canvas-positioning
description: Debug and fix graph canvas node placement — off-center replies, images, Reasoning/Generating pills, late follow-ups, 1×1 spawn, and ResizeObserver races. Use when a node sits under the wrong parent, X slides, follow-up appears late or on the spinner, or anyone mentions placement, centering, GraphCanvas, or waitForPaintedImage.
---

# Debug canvas positioning

This is not React Flow. Nodes are absolutely positioned (`left`/`top` = `node.x`/`node.y`) on a D3 pan/zoom canvas. Layout is measured boxes plus `patchNode({ x, y })`.

## Invariants

- Child horizontal center equals parent horizontal center: `x = parentX + parentWidth/2 - childWidth/2`.
- `placeCenteredBelowOrForce` locks X. Collision search only walks **down** in Y.
- Gap is `CHILD_BELOW_PARENT_GAP` (35). Unmeasured nodes have no rect — they are not obstacles.
- Write **absolute** `x`/`y` through `treeManager.patchNode`. Do not apply leftover relative `dx` from an old MOVE.
- `nodesRef` is the live graph. Child `useLayoutEffect` / ResizeObserver can run before React commits. Sync the ref in `dispatchAndSync` **and** `useLayoutEffect`. Never assign `nodesRef.current = nodes` during render.
- `updateNodeDimension` must still run the layout pass when `sizeChanged` is false. Gating the move on size change leaves a 1×1 spawn stuck.
- If `liveNode` is missing from `nodesRef`, layout silently no-ops. That is the usual “never recentered” bug.

## Where it lives

| Piece | File |
|---|---|
| Geometry | `app/utils/placement.ts` |
| RO → moves | `app/utils/nodeResizeLayout.ts` → `layoutMovesForMeasuredNode` |
| Spawn / align / follow-up | `app/hooks/useAIChat.ts` |
| Image-ready check | `app/utils/imageLayoutReady.ts` |
| Ref sync + size reports | `app/app/GraphCanvas/GraphCanvas.tsx` |
| Per-node RO | `app/app/GraphCanvas/components/nodes/GraphNodeFrame.tsx` |
| Image card | `app/app/GraphCanvas/components/nodes/ImageResponseNode.tsx` (`w-[520px]`, Grid Reveal **canvas**) |

Defaults in `getDefaultNodeDimensions`: input `400×120`, response `400×80`, image-response `520×520`.

## Debug first (measure, do not guess)

Pick the parent and child `[data-node-id]`. Read `offsetWidth`/`offsetHeight` and store `x`/`y`.

```
parentCenterX = parent.x + parentWidth / 2
childCenterX  = child.x + childWidth / 2
```

They must match. A 400-wide prompt at `x=-200` is center `0`. A 520-wide image should be at `x=-260`.

Ask, in order:

1. Did layout run? If `liveNode` was missing, it did not.
2. Which width was used — stored dimensions or live DOM? Prefer `readDomNodeSize`.
3. Is the node still the 1×1 spawn or the old Reasoning pill?
4. Is follow-up waiting on `waitForPaintedImage` / `imageHasLayoutSize`?
5. Did submit fire twice (`mousedown` + `click`)? Guard lives on `InputFieldNode` + `isSubmittingRef`.

Do not add a second canvas-level ResizeObserver. Two observers double-MOVE.

## Failure catalog

**Image never left spawn (`x≈-1`, width later 520/606).** Type swap `response` → `image-response` grew the card; layout skipped because `sizeChanged` was false or `nodesRef` lacked the node. Fix: always layout after measure; `commitAlignedNode` after paint; `scheduleAlignWhenPainted` (up to 30 rAF, width > 20).

**Follow-up under the image, image under nothing.** Image layout never ran; follow-up used the image’s leftover spawn box. Fix the image first.

**Follow-up ~15s late.** `imageHasLayoutSize` used to require a DOM `<img>` ≥ `min(naturalWidth, 606)`. Grid Reveal is a 520px canvas (`[data-slot='grid-reveal']`), no `<img>`. Ready = shell + reveal (or a real painted `<img>`) above `IMAGE_LAYOUT_MIN_PX` (20). Do not hardcode 606. The response pill has no reveal and must stay “not ready”.

**Reasoning / Loading / Generating off-center.** First RO ran in the child’s `useLayoutEffect` before the parent copied `nodes` into `nodesRef`. Sync refs before paint. Re-align on every intermediate resize (`scheduleAlignWhenPainted` + signature RO in `GraphNodeFrame`).

**X slides when the slot is occupied.** Force search used to walk sideways. Only accept `(desired.x, desired.y + n * gridStep)`.

**Follow-up on the spinner.** Spawn follow-up only when `hasRenderableContent` (non-empty `value`). Spawn the input at 400px, not 1×1.

**Caption / reveal grows height after follow-up.** Width is known at first 520 paint. Extra height should push descendants via `updateNodeDimension` → `layoutMovesAfterResize`. Do not wait for the full Grid Reveal animation (~18s) before spawning.

**Deleted node comes back / layout writes a ghost.** After abort-on-delete, bail if `nodesRef.current[id]` is gone before `patchNode` or follow-up spawn. `waitForPaintedImage(nodeId, nodesRef)` resolves when the node disappears.

**Double image gens.** `onMouseDown` and `onClick` both called `handleSubmit`. Click must not submit; `isSubmittingRef` stays.

## Fix rules

- Measure from the DOM. Strip synthetic edge cases.
- Center lock is the feature. Do not “nudge X a bit”.
- After a type swap, wait until the **new** card is in the DOM (grid-reveal or complete img), then `commitAlignedNode`.
- Keep `dispatchAndSync` as the write path so `nodesRef` is current before the next RO.
- No `any`. No extra try/catch. Do not start `pnpm run dev`.
- Add a unit test next to the contract you change (`placement.test.ts`, `imageLayoutReady.test.ts`, `nodeResizeLayout.test.ts`).

## Verify

`pnpm test` (or `pnpm exec tsx --test` on the files above).

Live check: prompt center, intermediate-pill center, image-card center, follow-up center — all the same X. Follow-up appears when the 520 card is on the canvas, not after a 15s timeout.
