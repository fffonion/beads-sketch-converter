# Small-Grid Detail-Preserving Conversion Design

**Context**

Current image-to-pixel conversion can lose thin garment marks and crossing strokes when the target grid is very small. `40` cells wide is one example, not a hard-coded target. The current pipeline already has FFT-based edge enhancement, but it operates on the raster before grid sampling and does not explicitly protect small structured details during representative-color selection and color reduction.

**Problem**

For photo-like inputs converted into a small `W x H` logical grid, local details such as a clothing-front `X` can be averaged away before palette matching. Once a cell has already collapsed to a flat representative color, later outline continuity logic cannot reliably reconstruct the intended mark.

**Goal**

Preserve thin, high-contrast, structured marks at small target grid sizes even if this increases palette color count locally. The implementation should prefer keeping true small structures over aggressive near-color merging.

**Non-Goals**

- Reconstruct semantic detail from already-quantized cells without source evidence.
- Replace the existing palette matching or chart detection architecture.
- Make grayscale mode or raw pixel-art detection use a different pipeline.

**Approach**

Add a detail-signal path in `Rust/WASM` that analyzes each target grid patch against the original cropped raster and emits a per-cell score indicating whether the patch contains a likely preserved thin structure. The signal is advisory rather than generative: TypeScript still owns representative-color selection and palette matching, but it uses the signal to bias sampling toward structure colors and to skip destructive color reduction for protected cells. The heuristics should scale from the requested grid size rather than branch on a fixed width such as `40`.

**Why FFT Is Only Part Of The Solution**

FFT/high-pass response is useful as evidence that a patch still contains high-frequency structure after cropping, but it cannot alone decide the final cell color. JPEG noise, fabric texture, shadows, and real marks all create high-frequency energy. The actual decision must combine:

- high-frequency energy,
- local dark-vs-bright contrast,
- minority-color occupancy inside the patch,
- and simple structural continuity across neighboring cells.

**Pipeline Changes**

1. Keep the existing crop-to-ratio behavior.
2. Before sampling to the logical grid, send the cropped raster plus target grid size into `Rust/WASM`.
3. `Rust/WASM` computes, for each logical cell:
   - normalized detail energy,
   - minority dark-structure confidence,
   - a suggested structure color sampled from the patch,
   - and a boolean-like protected flag.
4. TypeScript sampling blends the existing representative color with the WASM-suggested structure color when the detail signal is strong enough.
5. `reduceColorsPhotoshopStyle` accepts an optional protection mask and does not merge protected source colors away.

**Rust/WASM Responsibilities**

- Perform the heavier patch math close to the existing FFT and edge-enhancement utilities.
- Reuse luma/detail computations already present in `detecter/src/edge_enhance.rs` where practical.
- Return compact per-cell data through linear memory to avoid repeated JS-side pixel iteration.

**TypeScript Responsibilities**

- Invoke the new WASM export only for `converted-from-image` flow.
- Use the returned per-cell structure hints in `convertImageToLogicalGrid`.
- Thread the resulting protection mask into `reduceColorsPhotoshopStyle`.
- Leave raw pixel-art and chart-detected flows unchanged unless they already route through converted-image sampling.

**Behavior Rules**

- Detail protection is only enabled for converted images, not embedded chart metadata.
- Protected cells may increase logical and palette color count; this is acceptable.
- If the detail signal is weak or absent, fall back to the current representative-color path.
- Color reduction must continue to remove isolated noise; only structured or repeated minority details should survive.

**Testing**

- Add regression tests that fail under the current implementation with synthetic thin `X`-like structures sampled down to small grids.
- Add targeted tests for protection-aware color reduction so isolated noise is still merged while structured detail is preserved.
- Verify the existing FFT edge enhancement tests remain green.

**Risks**

- Over-protection can preserve texture noise and create dirty-looking charts.
- An overly strong structure-color override can thicken strokes or introduce false marks.
- JS/WASM glue errors can cause memory-layout bugs if the result buffer format is underspecified.

**Mitigations**

- Keep the new signal advisory and gated by multiple heuristics.
- Preserve current behavior as the fallback path.
- Cover the buffer format and reduction-mask behavior with explicit tests.
