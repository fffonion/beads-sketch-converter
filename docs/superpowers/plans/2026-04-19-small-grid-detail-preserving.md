# Small-Grid Detail-Preserving Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve thin structured details such as clothing-front `X` marks when converting images to small logical grids, even if that keeps more colors.

**Architecture:** Add a per-cell detail-signal pass in `Rust/WASM`, consume that signal during converted-image sampling in TypeScript, and thread a protected-cell mask into near-color reduction so protected detail survives. Existing behavior remains the fallback when no strong detail signal is present.

**Tech Stack:** TypeScript, Bun tests, Rust, WebAssembly, existing `detecter` build pipeline

---

### Task 1: Lock The Regression With Tests

**Files:**
- Modify: `tests/chart-processor.test.ts`
- Test: `tests/chart-processor.test.ts`

- [ ] **Step 1: Write the failing regression tests**

Add tests that:

```ts
test("converted-image sampling should preserve a thin x-like detail at small grid sizes", async () => {
  // Build a synthetic raster with a bright garment patch and a dark thin X.
  // Process at a small target grid so the current sampler averages the X away.
  // Assert at least one central logical cell stays materially darker than the garment field.
});

test("photo color reduction should keep protected structured detail while still merging isolated noise", () => {
  // Reuse reduceColorsPhotoshopStyle with a protection mask.
  // Assert protected cells keep their source color.
  // Assert an unprotected isolated near-color pixel still gets merged.
});
```

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run: `bun test tests/chart-processor.test.ts`
Expected: FAIL on the new detail-preservation assertions.

- [ ] **Step 3: Commit the red state if desired**

```bash
git add tests/chart-processor.test.ts
git commit -m "test: add small-grid detail preservation regression"
```

### Task 2: Add Rust/WASM Detail Signal Export

**Files:**
- Modify: `detecter/src/lib.rs`
- Create: `detecter/src/detail_signal.rs`
- Modify: `detecter/src/edge_enhance.rs` if shared helpers are extracted
- Modify: `src/lib/detecter.ts`
- Test: `tests/chart-processor.test.ts`

- [ ] **Step 1: Define the result buffer contract**

Document and implement a fixed layout like:

```rust
// header: cell_count
// per cell: [protected, energy_milli, contrast_milli, r, g, b]
```

- [ ] **Step 2: Implement the Rust patch analysis**

Write minimal code that:

```rust
pub(crate) fn compute_detail_signal(
    rgba: &[u8],
    width: usize,
    height: usize,
    grid_width: usize,
    grid_height: usize,
) -> Vec<i32> {
    // Iterate each target patch, compute luma/detail metrics,
    // detect minority dark structure, and emit compact per-cell scores.
}
```

- [ ] **Step 3: Export the new WASM function**

Add an extern similar to:

```rust
#[unsafe(no_mangle)]
pub extern "C" fn detail_signal(
    ptr: *const u8,
    len: usize,
    width: u32,
    height: u32,
    grid_width: u32,
    grid_height: u32,
) -> u32
```

- [ ] **Step 4: Add the TypeScript wrapper**

Expose a helper like:

```ts
export async function computeDetailSignalWithWasm(
  raster: RasterImageLike,
  gridWidth: number,
  gridHeight: number,
): Promise<{ protectedMask: Uint8Array; suggestedRgb: Array<[number, number, number] | null> }>
```

- [ ] **Step 5: Run targeted tests/build to keep this layer green**

Run: `bun test tests/chart-processor.test.ts`
Expected: The new regression may still fail, but no WASM wrapper/runtime regressions should appear outside the new assertions.

### Task 3: Use The Signal During Converted-Image Sampling

**Files:**
- Modify: `src/lib/chart-processor.ts`
- Test: `tests/chart-processor.test.ts`

- [ ] **Step 1: Thread detail-signal data into converted-image sampling**

Update `convertImageToLogicalGrid` so it:

```ts
const detailSignal = await computeDetailSignalWithWasm(cropped, gridWidth, gridHeight);
return sampleRegularGrid(cropped, gridWidth, gridHeight, samplingStrategy, pixelArtBias, detailSignal);
```

- [ ] **Step 2: Teach sampling to prefer structure colors for protected cells**

Add the minimal extension:

```ts
function sampleRegularGrid(..., detailSignal?: DetailSignalResult): RasterImage {
  // If a cell is protected and has a suggested structure color,
  // blend toward that color instead of using only average/main representative color.
}
```

- [ ] **Step 3: Run the targeted tests and verify the regression turns green**

Run: `bun test tests/chart-processor.test.ts`
Expected: The thin-detail regression now passes.

### Task 4: Protect Those Cells From Near-Color Reduction

**Files:**
- Modify: `src/lib/chart-processor.ts`
- Test: `tests/chart-processor.test.ts`

- [ ] **Step 1: Extend reduction options with a protection mask**

Add:

```ts
export interface ReduceColorsOptions {
  preserveEdges?: boolean;
  protectedMask?: Uint8Array | null;
}
```

- [ ] **Step 2: Skip protected pixels during replacement**

Implement the minimal guard:

```ts
if (protectedMask?.[index]) {
  copy original pixel;
  continue;
}
```

- [ ] **Step 3: Run the targeted reduction tests**

Run: `bun test tests/chart-processor.test.ts`
Expected: Protected structured detail survives, isolated unprotected noise still merges.

### Task 5: Full Verification

**Files:**
- Modify: `src/lib/chart-processor.ts`
- Modify: `src/lib/detecter.ts`
- Modify: `detecter/src/lib.rs`
- Create: `detecter/src/detail_signal.rs`
- Modify: `tests/chart-processor.test.ts`

- [ ] **Step 1: Run focused automated verification**

Run: `bun test tests/chart-processor.test.ts`
Expected: PASS

- [ ] **Step 2: Run full project verification**

Run: `bun test`
Expected: PASS

- [ ] **Step 3: Run production build verification**

Run: `bun run build`
Expected: exit code `0`

- [ ] **Step 4: Optionally validate with the real sample image**

Use the local sample `D:\fffonion\Downloads\IMG_6255.jpg` through the app or a focused script to confirm the clothing-front `X` remains visible at `40` width.

- [ ] **Step 5: Commit**

```bash
git add detecter/src/lib.rs detecter/src/detail_signal.rs src/lib/detecter.ts src/lib/chart-processor.ts tests/chart-processor.test.ts docs/superpowers/specs/2026-04-19-detail-preserving-40w-design.md docs/superpowers/plans/2026-04-19-detail-preserving-40w.md
git commit -m "feat: preserve thin detail in small-grid image conversion"
```
