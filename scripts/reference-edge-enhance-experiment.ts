import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  collapseOpenBackgroundAreas,
  debugMatchLogicalRasterToPalette,
  enhancePixelOutlineContinuity,
  projectEdgeEnhanceStrength,
  reduceColorsPhotoshopStyle,
  type EditableCell,
} from "../src/lib/chart-processor";
import { computeDetailSignalWithWasm, enhanceEdgesWithFftWasm } from "../src/lib/detecter";
import {
  buildLogicalProtectionMask,
  sampleConvertedImageGrid,
  stylizeLogicalRaster,
} from "../src/lib/image-conversion";
import {
  applyGuidedEdgeDarkening,
  buildCellBoundaryMask,
  cellToRgb,
  expandGuidedSelectionAlongBoundary,
  expandGuidedSelectionByHysteresis,
  pickDominantDarkCell,
  projectSourceEdgeActivation,
  projectSourceEdgeGradientActivation,
  rgbLuma,
  selectSourceGuidedBoundaryIndices,
  type RasterImage,
  type Rgb,
} from "../src/lib/source-edge-guided-post";

interface CropBox {
  left: number;
  top: number;
  size: number;
}

interface AxisFit {
  start: number;
  pitch: number;
  positions: number[];
}

interface TargetMasks {
  outline: boolean[];
  interior: boolean[];
  background: boolean[];
}

interface DetailSignalResult {
  protectedMask: Uint8Array;
  suggestedRgb: Array<Rgb | null>;
  energy: Float32Array;
  contrast: Float32Array;
}

interface IntegratedGuidedResult {
  cells: EditableCell[];
  meta: {
    activationThreshold: number;
    activationPercentile: number;
    minDarken: number;
    maxCandidateLuma: number;
    overrideLabel: string | null;
    selectedIndices: number[];
  };
}

interface GuidedPreset {
  label: string;
  activationPercentile: number;
  lowActivationPercentile?: number;
  minDarken: number;
  maxCandidateLuma: number;
  minSupport: number;
  bridge: boolean;
  overrideDominantDark: boolean;
  maskMode: "boundary" | "silhouette";
  activationMode: "delta" | "gradient";
  selectionMode?: "direct" | "hysteresis";
}

interface VariantMeta {
  requestedStrength: number;
  effectiveStrength: number;
  activationThreshold: number;
  activationPercentile: number;
  minDarken: number;
  maxCandidateLuma: number;
  minSupport: number;
  bridge: boolean;
  overrideLabel: string | null;
  selectedCells: number;
  selectedIndices?: number[];
}

interface CandidateResult {
  label: string;
  requestedStrength: number;
  effectiveStrength: number;
  activationThreshold: number;
  activationPercentile: number;
  minDarken: number;
  maxCandidateLuma: number;
  minSupport: number;
  bridge: boolean;
  overrideLabel: string | null;
  selectedCells: number;
  colorDistance: number;
  occupancyDistance: number;
  outlineDistance: number;
  interiorDistance: number;
  backgroundNoise: number;
  darkenedOutlineCells: number;
  totalScore: number;
}

const SOURCE_IMAGE_PATH = "D:/fffonion/Downloads/IMG_6255.jpg";
const TARGET_IMAGE_PATH = "D:/fffonion/Downloads/IMG_6266.JPG";
const OUTPUT_DIR = join(process.cwd(), "output", "reference-edge-enhance-experiment");
const GRID_SIZE = 40;
const COLOR_SYSTEM_ID = "mard_221";
const RENDER_STYLE_BIAS = 100;
const POST_UI_REQUESTED_STRENGTH = 100;
const FFT_GUIDE_STRENGTH = 100;
const REDUCE_TOLERANCE = 16;
const GUIDED_PRESETS: GuidedPreset[] = [
  { label: "guided-p85-d12-l116-s1", activationPercentile: 85, minDarken: 12, maxCandidateLuma: 116, minSupport: 1, bridge: false, overrideDominantDark: false, maskMode: "boundary", activationMode: "delta" },
  { label: "guided-p90-d14-l104-s1", activationPercentile: 90, minDarken: 14, maxCandidateLuma: 104, minSupport: 1, bridge: false, overrideDominantDark: false, maskMode: "boundary", activationMode: "delta" },
  { label: "guided-p95-d16-l92-s2", activationPercentile: 95, minDarken: 16, maxCandidateLuma: 92, minSupport: 2, bridge: false, overrideDominantDark: false, maskMode: "boundary", activationMode: "delta" },
  { label: "guided-p97-d18-l80-s2", activationPercentile: 97, minDarken: 18, maxCandidateLuma: 80, minSupport: 2, bridge: false, overrideDominantDark: false, maskMode: "boundary", activationMode: "delta" },
  { label: "guided-p98-d20-l72-s2", activationPercentile: 98, minDarken: 20, maxCandidateLuma: 72, minSupport: 2, bridge: false, overrideDominantDark: false, maskMode: "boundary", activationMode: "delta" },
  { label: "gradient-p85-d12-l116-s1", activationPercentile: 85, minDarken: 12, maxCandidateLuma: 116, minSupport: 1, bridge: false, overrideDominantDark: false, maskMode: "boundary", activationMode: "gradient" },
  { label: "gradient-p90-d14-l104-s2", activationPercentile: 90, minDarken: 14, maxCandidateLuma: 104, minSupport: 2, bridge: false, overrideDominantDark: false, maskMode: "boundary", activationMode: "gradient" },
  { label: "gradient-p95-d16-l92-s2", activationPercentile: 95, minDarken: 16, maxCandidateLuma: 92, minSupport: 2, bridge: false, overrideDominantDark: false, maskMode: "boundary", activationMode: "gradient" },
  { label: "silhouette-p75-d10-l128-s1", activationPercentile: 75, minDarken: 10, maxCandidateLuma: 128, minSupport: 1, bridge: false, overrideDominantDark: false, maskMode: "silhouette", activationMode: "delta" },
  { label: "silhouette-p85-d12-l116-s1", activationPercentile: 85, minDarken: 12, maxCandidateLuma: 116, minSupport: 1, bridge: false, overrideDominantDark: false, maskMode: "silhouette", activationMode: "delta" },
  { label: "silhouette-p85-d12-l116-s1-override", activationPercentile: 85, minDarken: 12, maxCandidateLuma: 116, minSupport: 1, bridge: false, overrideDominantDark: true, maskMode: "silhouette", activationMode: "delta" },
  { label: "silhouette-hys-p93-65-d10-l128", activationPercentile: 93, lowActivationPercentile: 65, minDarken: 10, maxCandidateLuma: 128, minSupport: 0, bridge: false, overrideDominantDark: false, maskMode: "silhouette", activationMode: "delta", selectionMode: "hysteresis" },
  { label: "silhouette-hys-p95-70-d10-l128", activationPercentile: 95, lowActivationPercentile: 70, minDarken: 10, maxCandidateLuma: 128, minSupport: 0, bridge: false, overrideDominantDark: false, maskMode: "silhouette", activationMode: "delta", selectionMode: "hysteresis" },
  { label: "silhouette-hys-p95-75-d12-l116", activationPercentile: 95, lowActivationPercentile: 75, minDarken: 12, maxCandidateLuma: 116, minSupport: 0, bridge: false, overrideDominantDark: false, maskMode: "silhouette", activationMode: "delta", selectionMode: "hysteresis" },
  { label: "silhouette-hys-p97-85-d14-l104-override", activationPercentile: 97, lowActivationPercentile: 85, minDarken: 14, maxCandidateLuma: 104, minSupport: 0, bridge: false, overrideDominantDark: true, maskMode: "silhouette", activationMode: "delta", selectionMode: "hysteresis" },
  { label: "silhouette-hys-p98-90-d16-l92-override", activationPercentile: 98, lowActivationPercentile: 90, minDarken: 16, maxCandidateLuma: 92, minSupport: 0, bridge: false, overrideDominantDark: true, maskMode: "silhouette", activationMode: "gradient", selectionMode: "hysteresis" },
  { label: "guided-p85-d12-l116-s1-override", activationPercentile: 85, minDarken: 12, maxCandidateLuma: 116, minSupport: 1, bridge: false, overrideDominantDark: true, maskMode: "boundary", activationMode: "delta" },
  { label: "guided-p90-d14-l104-s2-override-bridge", activationPercentile: 90, minDarken: 14, maxCandidateLuma: 104, minSupport: 2, bridge: true, overrideDominantDark: true, maskMode: "boundary", activationMode: "delta" },
  { label: "guided-p95-d16-l92-s2-override-bridge", activationPercentile: 95, minDarken: 16, maxCandidateLuma: 92, minSupport: 2, bridge: true, overrideDominantDark: true, maskMode: "boundary", activationMode: "delta" },
];

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const source = loadRasterWithPowerShell(SOURCE_IMAGE_PATH);
  const target = loadRasterWithPowerShell(TARGET_IMAGE_PATH);
  const crop = loadBaselineCrop();
  const cropped = cropRaster(source, crop);
  const targetCells = extractTargetGrid(target);
  const targetMasks = buildTargetMasks(targetCells);

  const { logical, protectedMask } = await sampleCropToLogicalGrid(
    cropped,
    GRID_SIZE,
    GRID_SIZE,
    RENDER_STYLE_BIAS,
  );
  const reducedLogical = reduceColorsPhotoshopStyle(logical, REDUCE_TOLERANCE, {
    preserveEdges: true,
    protectedMask,
  }).image;
  const matchedCells = debugMatchLogicalRasterToPalette(
    reducedLogical,
    COLOR_SYSTEM_ID,
    false,
    RENDER_STYLE_BIAS,
  );
  const collapsedMatched = collapseOpenBackgroundAreas(matchedCells, GRID_SIZE, GRID_SIZE);
  const fftEnhancedCropped = (await enhanceEdgesWithFftWasm(cropped, FFT_GUIDE_STRENGTH)) as RasterImage;
  const fftLogical = sampleConvertedImageGrid(
    fftEnhancedCropped,
    GRID_SIZE,
    GRID_SIZE,
    Math.min(50, RENDER_STYLE_BIAS),
  ).logical;
  const fftMatched = collapseOpenBackgroundAreas(
    debugMatchLogicalRasterToPalette(
      fftLogical,
      COLOR_SYSTEM_ID,
      false,
      RENDER_STYLE_BIAS,
    ),
    GRID_SIZE,
    GRID_SIZE,
  );
  const sourceActivation = projectSourceEdgeActivation(cropped, fftEnhancedCropped, GRID_SIZE, GRID_SIZE);
  const sourceGradientActivation = projectSourceEdgeGradientActivation(
    cropped,
    fftEnhancedCropped,
    GRID_SIZE,
    GRID_SIZE,
  );
  const boundaryMask = unionMasks(
    buildCellBoundaryMask(collapsedMatched, GRID_SIZE, GRID_SIZE, 18),
    buildCellBoundaryMask(fftMatched, GRID_SIZE, GRID_SIZE, 18),
  );
  const silhouetteMask = unionMasks(
    buildSilhouetteMask(collapsedMatched, GRID_SIZE, GRID_SIZE),
    buildSilhouetteMask(fftMatched, GRID_SIZE, GRID_SIZE),
  );

  const results: CandidateResult[] = [];
  const variants: Array<{ label: string; cells: EditableCell[]; meta: VariantMeta }> = [
    {
      label: "matched",
      cells: collapsedMatched,
      meta: {
        requestedStrength: 0,
        effectiveStrength: 0,
        activationThreshold: 0,
        activationPercentile: 0,
        minDarken: 0,
        maxCandidateLuma: 255,
        minSupport: 0,
        bridge: false,
        overrideLabel: null,
        selectedCells: 0,
      },
    },
  ];

  const postUiStrength = projectEdgeEnhanceStrength(POST_UI_REQUESTED_STRENGTH);
  variants.push({
    label: `post-ui-${POST_UI_REQUESTED_STRENGTH}`,
    cells: collapseOpenBackgroundAreas(
      enhancePixelOutlineContinuity(
        matchedCells,
        GRID_SIZE,
        GRID_SIZE,
        postUiStrength,
        null,
      ),
      GRID_SIZE,
      GRID_SIZE,
    ),
    meta: {
      requestedStrength: POST_UI_REQUESTED_STRENGTH,
      effectiveStrength: postUiStrength,
      activationThreshold: 0,
      activationPercentile: 0,
      minDarken: 0,
      maxCandidateLuma: 255,
      minSupport: 0,
      bridge: true,
      overrideLabel: null,
      selectedCells: 0,
    },
  });
  const integratedGuided = applyIntegratedSourceGuidedPostEdgeEnhance(
    collapsedMatched,
    GRID_SIZE,
    GRID_SIZE,
    postUiStrength,
    {
      edgeLogical: fftLogical,
      deltaActivation: sourceActivation,
      gradientActivation: sourceGradientActivation,
    },
  );
  variants.push({
    label: `integrated-post-ui-${POST_UI_REQUESTED_STRENGTH}`,
    cells: collapseOpenBackgroundAreas(
      enhancePixelOutlineContinuity(
        integratedGuided.cells,
        GRID_SIZE,
        GRID_SIZE,
        postUiStrength,
        null,
      ),
      GRID_SIZE,
      GRID_SIZE,
    ),
    meta: {
      requestedStrength: POST_UI_REQUESTED_STRENGTH,
      effectiveStrength: postUiStrength,
      activationThreshold: integratedGuided.meta.activationThreshold,
      activationPercentile: integratedGuided.meta.activationPercentile,
      minDarken: integratedGuided.meta.minDarken,
      maxCandidateLuma: integratedGuided.meta.maxCandidateLuma,
      minSupport: 0,
      bridge: true,
      overrideLabel: integratedGuided.meta.overrideLabel,
      selectedCells: integratedGuided.meta.selectedIndices.length,
      selectedIndices: integratedGuided.meta.selectedIndices,
    },
  });

  const boundaryIndices = Array.from(boundaryMask.entries())
    .filter(([, value]) => value > 0)
    .map(([index]) => index);
  const dominantDarkEdgeCell =
    pickDominantDarkCell(fftMatched, boundaryIndices, 60) ??
    pickDominantDarkCell(collapsedMatched, boundaryIndices, 60) ??
    pickDominantDarkCell(fftMatched, boundaryIndices, 90) ??
    pickDominantDarkCell(collapsedMatched, boundaryIndices, 90);

  for (const preset of GUIDED_PRESETS) {
    const activationMap = preset.activationMode === "gradient" ? sourceGradientActivation : sourceActivation;
    const activeMask = preset.maskMode === "silhouette" ? silhouetteMask : boundaryMask;
    const activationThreshold = pickActivationThreshold(activationMap, preset.activationPercentile);
    const selectedIndices =
      preset.selectionMode === "hysteresis"
        ? expandGuidedSelectionByHysteresis(
            collapsedMatched,
            fftMatched,
            activationMap,
            GRID_SIZE,
            GRID_SIZE,
            {
              highThreshold: activationThreshold,
              lowThreshold: pickActivationThreshold(
                activationMap,
                preset.lowActivationPercentile ?? Math.max(0, preset.activationPercentile - 10),
              ),
              minDarken: preset.minDarken,
              maxCandidateLuma: preset.maxCandidateLuma,
              boundaryMask: activeMask,
            },
          )
        : applyGuidedEdgeDarkening(
            collapsedMatched,
            fftMatched,
            activationMap,
            GRID_SIZE,
            GRID_SIZE,
            {
              activationThreshold,
              minDarken: preset.minDarken,
              maxCandidateLuma: preset.maxCandidateLuma,
              minSupport: preset.minSupport,
              boundaryMask: activeMask,
            },
          ).selectedIndices;
    let cells = collapseOpenBackgroundAreas(
      preset.overrideDominantDark && dominantDarkEdgeCell
        ? applyOverrideCell(collapsedMatched, selectedIndices, dominantDarkEdgeCell)
        : applySelectedEdgeCells(collapsedMatched, fftMatched, selectedIndices),
      GRID_SIZE,
      GRID_SIZE,
    );
    if (preset.bridge) {
      cells = collapseOpenBackgroundAreas(
        enhancePixelOutlineContinuity(
          cells,
          GRID_SIZE,
          GRID_SIZE,
          postUiStrength,
          null,
        ),
        GRID_SIZE,
        GRID_SIZE,
      );
    }
    variants.push({
      label: preset.label,
      cells,
      meta: {
        requestedStrength: POST_UI_REQUESTED_STRENGTH,
        effectiveStrength: postUiStrength,
        activationThreshold,
        activationPercentile: preset.activationPercentile,
        minDarken: preset.minDarken,
        maxCandidateLuma: preset.maxCandidateLuma,
        minSupport: preset.minSupport,
        bridge: preset.bridge,
        overrideLabel: preset.overrideDominantDark ? dominantDarkEdgeCell?.label ?? null : null,
        selectedCells: selectedIndices.length,
        selectedIndices,
      },
    });
  }

  for (const variant of variants) {
    const rgbCells = variant.cells.map(cellToRgb);
    const metrics = scoreGrid(
      rgbCells,
      targetCells,
      targetMasks,
      collapsedMatched.map(cellToRgb),
    );
    results.push({
      label: variant.label,
      requestedStrength: variant.meta.requestedStrength,
      effectiveStrength: variant.meta.effectiveStrength,
      activationThreshold: Number(variant.meta.activationThreshold.toFixed(6)),
      activationPercentile: variant.meta.activationPercentile,
      minDarken: variant.meta.minDarken,
      maxCandidateLuma: variant.meta.maxCandidateLuma,
      minSupport: variant.meta.minSupport,
      bridge: variant.meta.bridge,
      overrideLabel: variant.meta.overrideLabel,
      selectedCells: variant.meta.selectedCells,
      ...metrics,
    });
    writeBmp(
      join(OUTPUT_DIR, `${variant.label}.bmp`),
      renderGridBitmap(rgbCells, GRID_SIZE, GRID_SIZE, 18),
    );
    if (variant.meta.selectedIndices) {
      writeBmp(
        join(OUTPUT_DIR, `${variant.label}-selected.bmp`),
        renderSelectionBitmap(variant.meta.selectedIndices, GRID_SIZE, GRID_SIZE, 18),
      );
    }
  }

  writeBmp(join(OUTPUT_DIR, "source-fft-logical.bmp"), renderGridBitmap(rasterToRgbCells(fftLogical), GRID_SIZE, GRID_SIZE, 18));
  writeBmp(join(OUTPUT_DIR, "source-fft-matched.bmp"), renderGridBitmap(fftMatched.map(cellToRgb), GRID_SIZE, GRID_SIZE, 18));
  writeBmp(join(OUTPUT_DIR, "source-fft-activation.bmp"), renderActivationBitmap(sourceActivation, GRID_SIZE, GRID_SIZE, 18));
  writeBmp(join(OUTPUT_DIR, "source-fft-gradient-activation.bmp"), renderActivationBitmap(sourceGradientActivation, GRID_SIZE, GRID_SIZE, 18));
  writeBmp(join(OUTPUT_DIR, "source-fft-boundary-mask.bmp"), renderMaskBitmap(boundaryMask, GRID_SIZE, GRID_SIZE, 18));
  writeBmp(join(OUTPUT_DIR, "source-fft-silhouette-mask.bmp"), renderMaskBitmap(silhouetteMask, GRID_SIZE, GRID_SIZE, 18));
  writeBmp(join(OUTPUT_DIR, "target-grid.bmp"), renderGridBitmap(targetCells, GRID_SIZE, GRID_SIZE, 18));
  writeFileSync(
    join(OUTPUT_DIR, "analysis.json"),
    JSON.stringify(
      {
        crop,
        fftGuideStrength: FFT_GUIDE_STRENGTH,
        renderStyleBias: RENDER_STYLE_BIAS,
        colorSystemId: COLOR_SYSTEM_ID,
        activationStats: summarizeActivation(sourceActivation),
        gradientActivationStats: summarizeActivation(sourceGradientActivation),
        results,
      },
      null,
      2,
    ),
  );

  console.log(
    JSON.stringify(
      {
        crop,
        activationStats: summarizeActivation(sourceActivation),
        gradientActivationStats: summarizeActivation(sourceGradientActivation),
        results,
      },
      null,
      2,
    ),
  );
}

function loadBaselineCrop(): CropBox {
  const analysis = JSON.parse(
    readFileSync(join(process.cwd(), "output", "reference-crop-hybrid-search", "analysis.json"), "utf8"),
  ) as { refined: CropBox };
  return analysis.refined;
}

async function sampleCropToLogicalGrid(
  source: RasterImage,
  width: number,
  height: number,
  renderStyleBias: number,
): Promise<{ logical: RasterImage; protectedMask: Uint8Array }> {
  const detailSignal = normalizeDetailSignal(
    await computeDetailSignalWithWasm(source, width, height),
    width,
    height,
  );
  const sampled = sampleConvertedImageGrid(source, width, height, renderStyleBias);
  const detailAdjusted = detailSignal
    ? applyDetailSignalToLogicalRaster(sampled.logical, detailSignal)
    : sampled.logical;
  const protectedMask = buildLogicalProtectionMask(
    detailAdjusted,
    detailSignal?.protectedMask ?? null,
  );
  const logical =
    sampled.profile.cleanupPasses > 0
      ? stylizeLogicalRaster(detailAdjusted, {
          cleanupTolerance: sampled.profile.cleanupTolerance,
          cleanupPasses: sampled.profile.cleanupPasses,
          protectedMask,
        })
      : detailAdjusted;
  return {
    logical,
    protectedMask: buildLogicalProtectionMask(logical, protectedMask),
  };
}

function normalizeDetailSignal(
  detailSignal: Awaited<ReturnType<typeof computeDetailSignalWithWasm>>,
  gridWidth: number,
  gridHeight: number,
): DetailSignalResult | null {
  if (!detailSignal) {
    return null;
  }

  const cellCount = gridWidth * gridHeight;
  if (
    detailSignal.protectedMask.length !== cellCount ||
    detailSignal.suggestedRgb.length !== cellCount ||
    detailSignal.energy.length !== cellCount ||
    detailSignal.contrast.length !== cellCount
  ) {
    return null;
  }

  return {
    protectedMask: detailSignal.protectedMask,
    suggestedRgb: detailSignal.suggestedRgb.map((rgb) => (rgb ? [rgb[0], rgb[1], rgb[2]] : null)),
    energy: detailSignal.energy,
    contrast: detailSignal.contrast,
  };
}

function applyDetailSignalToLogicalRaster(logical: RasterImage, detailSignal: DetailSignalResult) {
  const data = new Uint8ClampedArray(logical.data);
  const cellCount = logical.width * logical.height;
  for (let index = 0; index < cellCount; index += 1) {
    if (detailSignal.protectedMask[index] !== 1) {
      continue;
    }
    const suggested = detailSignal.suggestedRgb[index];
    if (!suggested) {
      continue;
    }
    const offset = index * 4;
    const current: Rgb = [
      data[offset] ?? 255,
      data[offset + 1] ?? 255,
      data[offset + 2] ?? 255,
    ];
    const currentLuma = rgbToGray(current);
    const suggestedLuma = rgbToGray(suggested);
    if (suggestedLuma >= currentLuma - 10) {
      continue;
    }
    const detailWeight = Math.max(
      0.52,
      Math.min(0.8, 0.52 + detailSignal.contrast[index] * 0.9 + detailSignal.energy[index] * 0.8),
    );
    data[offset] = clampToByte(current[0] * (1 - detailWeight) + suggested[0] * detailWeight);
    data[offset + 1] = clampToByte(current[1] * (1 - detailWeight) + suggested[1] * detailWeight);
    data[offset + 2] = clampToByte(current[2] * (1 - detailWeight) + suggested[2] * detailWeight);
  }
  return {
    width: logical.width,
    height: logical.height,
    data,
  };
}

function extractTargetGrid(image: RasterImage) {
  const columnFit = fitTargetAxis(buildAxisDarkness(image, "x"));
  const rowFit = fitTargetAxis(buildAxisDarkness(image, "y"));
  const cells: Rgb[] = [];
  for (let row = 0; row < GRID_SIZE; row += 1) {
    for (let column = 0; column < GRID_SIZE; column += 1) {
      cells.push(
        sampleSparseCell(
          image,
          columnFit.positions[column]!,
          rowFit.positions[row]!,
          columnFit.positions[column + 1]!,
          rowFit.positions[row + 1]!,
        ),
      );
    }
  }
  return cells;
}

function fitTargetAxis(scores: Float32Array): AxisFit {
  let best: AxisFit & { score: number } | null = null;
  for (let pitch = 24; pitch <= 34; pitch += 0.1) {
    for (let start = 0; start <= 180; start += 0.5) {
      if (start + pitch * GRID_SIZE >= scores.length - 1) {
        continue;
      }
      const positions = Array.from({ length: GRID_SIZE + 1 }, (_, index) => Math.round(start + pitch * index));
      let score = 0;
      for (const position of positions) {
        score += sampleAxisScore(scores, position);
      }
      if (!best || score > best.score) {
        best = { start, pitch, positions, score };
      }
    }
  }
  if (!best) {
    throw new Error("failed to fit target grid");
  }
  return best;
}

function buildTargetMasks(cells: Rgb[]): TargetMasks {
  const outline = cells.map((cell, index) => {
    if (!isOccupied(cell)) {
      return false;
    }
    if (rgbLuma(cell) < 90) {
      return true;
    }
    const row = Math.floor(index / GRID_SIZE);
    const column = index % GRID_SIZE;
    const offsets = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ] as const;
    for (const [rowOffset, columnOffset] of offsets) {
      const nextRow = row + rowOffset;
      const nextColumn = column + columnOffset;
      if (nextRow < 0 || nextRow >= GRID_SIZE || nextColumn < 0 || nextColumn >= GRID_SIZE) {
        return true;
      }
      if (!isOccupied(cells[nextRow * GRID_SIZE + nextColumn]!)) {
        return true;
      }
    }
    return false;
  });
  const interior = cells.map((cell, index) => isOccupied(cell) && !outline[index]);
  const background = cells.map((cell) => !isOccupied(cell));
  return { outline, interior, background };
}

function buildSilhouetteMask(cells: EditableCell[], gridWidth: number, gridHeight: number) {
  const mask = new Uint8Array(cells.length);
  for (let index = 0; index < cells.length; index += 1) {
    const rgb = cellToRgb(cells[index]!);
    if (!isOccupied(rgb)) {
      continue;
    }
    const row = Math.floor(index / gridWidth);
    const column = index % gridWidth;
    for (const [rowOffset, columnOffset] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ] as const) {
      const nextRow = row + rowOffset;
      const nextColumn = column + columnOffset;
      if (nextRow < 0 || nextRow >= gridHeight || nextColumn < 0 || nextColumn >= gridWidth) {
        mask[index] = 1;
        break;
      }
      if (!isOccupied(cellToRgb(cells[nextRow * gridWidth + nextColumn]!))) {
        mask[index] = 1;
        break;
      }
    }
  }
  return mask;
}

function scoreGrid(
  cells: Rgb[],
  targetCells: Rgb[],
  masks: TargetMasks,
  matchedBaseline: Rgb[],
) {
  let colorDistance = 0;
  let occupancyDistance = 0;
  let outlineDistance = 0;
  let interiorDistance = 0;
  let backgroundNoise = 0;
  let darkenedOutlineCells = 0;

  for (let index = 0; index < targetCells.length; index += 1) {
    const candidate = cells[index]!;
    const target = targetCells[index]!;
    const baseline = matchedBaseline[index]!;
    const distance = rgbDistance(candidate, target);
    colorDistance += distance;
    occupancyDistance += Number(isOccupied(candidate) !== isOccupied(target));
    if (masks.outline[index]) {
      outlineDistance += Math.abs(rgbLuma(candidate) - rgbLuma(target));
      if (rgbLuma(candidate) + 1 < rgbLuma(baseline)) {
        darkenedOutlineCells += 1;
      }
    }
    if (masks.interior[index]) {
      interiorDistance += distance;
    }
    if (masks.background[index] && isOccupied(candidate)) {
      backgroundNoise += 1;
    }
  }

  return {
    colorDistance: Number(colorDistance.toFixed(6)),
    occupancyDistance,
    outlineDistance: Number(outlineDistance.toFixed(6)),
    interiorDistance: Number(interiorDistance.toFixed(6)),
    backgroundNoise,
    darkenedOutlineCells,
    totalScore: Number((colorDistance + occupancyDistance * 140 + backgroundNoise * 22).toFixed(6)),
  };
}

function pickActivationThreshold(activation: Float32Array, percentile: number) {
  const positive = Array.from(activation).filter((value) => value > 0).sort((left, right) => left - right);
  if (positive.length === 0) {
    return Number.POSITIVE_INFINITY;
  }
  const normalizedPercentile = clamp(percentile, 0, 100) / 100;
  const index = Math.min(
    positive.length - 1,
    Math.max(0, Math.round(normalizedPercentile * (positive.length - 1))),
  );
  return positive[index]!;
}

function summarizeActivation(activation: Float32Array) {
  const positive = Array.from(activation).filter((value) => value > 0).sort((left, right) => left - right);
  const max = positive.length > 0 ? positive[positive.length - 1]! : 0;
  const meanPositive =
    positive.length > 0 ? positive.reduce((sum, value) => sum + value, 0) / positive.length : 0;
  return {
    positiveCellCount: positive.length,
    max: Number(max.toFixed(6)),
    meanPositive: Number(meanPositive.toFixed(6)),
    p50: Number(percentileValue(positive, 50).toFixed(6)),
    p75: Number(percentileValue(positive, 75).toFixed(6)),
    p85: Number(percentileValue(positive, 85).toFixed(6)),
    p90: Number(percentileValue(positive, 90).toFixed(6)),
    p95: Number(percentileValue(positive, 95).toFixed(6)),
  };
}

function percentileValue(values: number[], percentile: number) {
  if (values.length === 0) {
    return 0;
  }
  const index = Math.min(
    values.length - 1,
    Math.max(0, Math.round((clamp(percentile, 0, 100) / 100) * (values.length - 1))),
  );
  return values[index]!;
}

function rasterToRgbCells(raster: RasterImage) {
  const cells: Rgb[] = [];
  for (let index = 0; index < raster.width * raster.height; index += 1) {
    const offset = index * 4;
    cells.push([
      raster.data[offset] ?? 255,
      raster.data[offset + 1] ?? 255,
      raster.data[offset + 2] ?? 255,
    ]);
  }
  return cells;
}

function renderActivationBitmap(activation: Float32Array, gridWidth: number, gridHeight: number, scale: number) {
  const max = Math.max(1, ...activation);
  const cells = Array.from(activation, (value) => {
    const level = Math.round((value / max) * 255);
    return [level, level, level] as Rgb;
  });
  return renderGridBitmap(cells, gridWidth, gridHeight, scale);
}

function renderSelectionBitmap(selectedIndices: number[], gridWidth: number, gridHeight: number, scale: number) {
  const selected = new Set(selectedIndices);
  const cells: Rgb[] = Array.from({ length: gridWidth * gridHeight }, (_, index) =>
    selected.has(index) ? [20, 24, 32] : [255, 255, 255],
  );
  return renderGridBitmap(cells, gridWidth, gridHeight, scale);
}

function renderMaskBitmap(mask: Uint8Array, gridWidth: number, gridHeight: number, scale: number) {
  const cells: Rgb[] = Array.from({ length: gridWidth * gridHeight }, (_, index) =>
    mask[index] ? [20, 24, 32] : [255, 255, 255],
  );
  return renderGridBitmap(cells, gridWidth, gridHeight, scale);
}

function unionMasks(left: Uint8Array, right: Uint8Array) {
  const length = Math.min(left.length, right.length);
  const merged = new Uint8Array(length);
  for (let index = 0; index < length; index += 1) {
    merged[index] = left[index] || right[index] ? 1 : 0;
  }
  return merged;
}

function applyIntegratedSourceGuidedPostEdgeEnhance(
  cells: EditableCell[],
  gridWidth: number,
  gridHeight: number,
  strength: number,
  edgeGuide: {
    edgeLogical: RasterImage;
    deltaActivation: Float32Array;
    gradientActivation: Float32Array;
  },
): IntegratedGuidedResult {
  const edgeMatched = collapseOpenBackgroundAreas(
    debugMatchLogicalRasterToPalette(
      edgeGuide.edgeLogical,
      COLOR_SYSTEM_ID,
      false,
      100,
    ),
    gridWidth,
    gridHeight,
  );
  const silhouetteMask = unionMasks(
    buildSilhouetteMask(cells, gridWidth, gridHeight),
    buildSilhouetteMask(edgeMatched, gridWidth, gridHeight),
  );
  const strengthNorm = clamp(strength, 0, 100) / 100;
  const dominantDarkCell = pickDominantDarkCell(
    edgeMatched,
    collectMaskIndices(silhouetteMask),
    Math.max(72, 148 - strengthNorm * 24),
  );
  const minDarken = dominantDarkCell ? 6 + strengthNorm * 10 : 10 + strengthNorm * 18;
  const maxCandidateLuma = dominantDarkCell
    ? Math.max(84, 176 - strengthNorm * 28)
    : Math.max(42, 124 - strengthNorm * 52);
  const selectedIndices = selectSourceGuidedBoundaryIndices(
    cells,
    edgeMatched,
    edgeGuide.deltaActivation,
    edgeGuide.gradientActivation,
    gridWidth,
    gridHeight,
    {
      strength,
      boundaryMask: silhouetteMask,
      minDarken,
      maxCandidateLuma,
    },
  );
  if (selectedIndices.length === 0) {
    return {
      cells,
      meta: {
        activationThreshold: Number.POSITIVE_INFINITY,
        activationPercentile: 0,
        minDarken,
        maxCandidateLuma,
        overrideLabel: null,
        selectedIndices,
      },
    };
  }

  return {
    cells: dominantDarkCell
      ? applyOverrideCell(cells, selectedIndices, dominantDarkCell)
      : applySelectedEdgeCells(cells, edgeMatched, selectedIndices),
    meta: {
      activationThreshold: 0,
      activationPercentile: 0,
      minDarken,
      maxCandidateLuma,
      overrideLabel: dominantDarkCell?.label ?? null,
      selectedIndices,
    },
  };
}

function collectMaskIndices(mask: Uint8Array) {
  const indices: number[] = [];
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index]) {
      indices.push(index);
    }
  }
  return indices;
}

function applyOverrideCell(baseCells: EditableCell[], selectedIndices: number[], overrideCell: EditableCell) {
  const selected = new Set(selectedIndices);
  return baseCells.map((cell, index) =>
    selected.has(index)
      ? {
          ...overrideCell,
          source: "detected" as const,
        }
      : { ...cell },
  );
}

function applySelectedEdgeCells(baseCells: EditableCell[], edgeCells: EditableCell[], selectedIndices: number[]) {
  const selected = new Set(selectedIndices);
  return baseCells.map((cell, index) =>
    selected.has(index)
      ? {
          ...edgeCells[index],
          source: "detected" as const,
        }
      : { ...cell },
  );
}

function sampleHybridPatch(image: RasterImage, left: number, top: number, right: number, bottom: number): Rgb {
  const sparse = sampleSparseCell(image, left, top, right, bottom);
  const pixels = collectPatchPixels(image, left, top, right, bottom);
  const ranked = [...pixels].sort((a, b) => rgbLuma(a) - rgbLuma(b));
  const trim = Math.floor(ranked.length * 0.15);
  const trimmedMean = averageRgb(ranked.slice(trim, ranked.length - trim));
  if (isOccupied(sparse) !== isOccupied(trimmedMean)) {
    return sparse;
  }
  return trimmedMean;
}

function sampleSparseCell(image: RasterImage, left: number, top: number, right: number, bottom: number): Rgb {
  const width = Math.max(2, right - left);
  const height = Math.max(2, bottom - top);
  const samples: Rgb[] = [];
  const points = [
    [0.22, 0.22],
    [0.78, 0.22],
    [0.22, 0.78],
    [0.78, 0.78],
    [0.5, 0.18],
    [0.5, 0.82],
  ] as const;
  for (const [rx, ry] of points) {
    const x = clamp(Math.round(left + width * rx), left + 1, right - 2);
    const y = clamp(Math.round(top + height * ry), top + 1, bottom - 2);
    samples.push(readPixel(image, x, y));
  }
  return averageRgb(samples);
}

function collectPatchPixels(image: RasterImage, left: number, top: number, right: number, bottom: number) {
  const pixels: Rgb[] = [];
  for (let y = top + 1; y < bottom - 1; y += 1) {
    for (let x = left + 1; x < right - 1; x += 1) {
      pixels.push(readPixel(image, x, y));
    }
  }
  return pixels;
}

function readPixel(image: RasterImage, x: number, y: number): Rgb {
  const index = (y * image.width + x) * 4;
  return [image.data[index]!, image.data[index + 1]!, image.data[index + 2]!];
}

function cropRaster(image: RasterImage, crop: CropBox): RasterImage {
  const data = new Uint8ClampedArray(crop.size * crop.size * 4);
  for (let y = 0; y < crop.size; y += 1) {
    for (let x = 0; x < crop.size; x += 1) {
      const sourceX = clamp(crop.left + x, 0, image.width - 1);
      const sourceY = clamp(crop.top + y, 0, image.height - 1);
      const sourceIndex = (sourceY * image.width + sourceX) * 4;
      const targetIndex = (y * crop.size + x) * 4;
      data[targetIndex] = image.data[sourceIndex]!;
      data[targetIndex + 1] = image.data[sourceIndex + 1]!;
      data[targetIndex + 2] = image.data[sourceIndex + 2]!;
      data[targetIndex + 3] = 255;
    }
  }
  return {
    width: crop.size,
    height: crop.size,
    data,
  };
}

function averageRgb(samples: Rgb[]) {
  if (samples.length === 0) {
    return [255, 255, 255];
  }
  let red = 0;
  let green = 0;
  let blue = 0;
  for (const sample of samples) {
    red += sample[0];
    green += sample[1];
    blue += sample[2];
  }
  return [
    Math.round(red / samples.length),
    Math.round(green / samples.length),
    Math.round(blue / samples.length),
  ];
}

function buildAxisDarkness(image: RasterImage, axis: "x" | "y") {
  const scores = new Float32Array(axis === "x" ? image.width : image.height);
  if (axis === "x") {
    for (let x = 0; x < image.width; x += 1) {
      let sum = 0;
      for (let y = 0; y < image.height; y += 1) {
        sum += 255 - pixelLuma(image, x, y);
      }
      scores[x] = sum / image.height;
    }
  } else {
    for (let y = 0; y < image.height; y += 1) {
      let sum = 0;
      for (let x = 0; x < image.width; x += 1) {
        sum += 255 - pixelLuma(image, x, y);
      }
      scores[y] = sum / image.width;
    }
  }
  return scores;
}

function sampleAxisScore(scores: Float32Array, center: number) {
  let score = 0;
  for (let offset = -2; offset <= 2; offset += 1) {
    const index = center + offset;
    if (index < 0 || index >= scores.length) {
      continue;
    }
    const weight = offset === 0 ? 1 : Math.abs(offset) === 1 ? 0.7 : 0.35;
    score += scores[index]! * weight;
  }
  return score;
}

function renderGridBitmap(cells: Rgb[], gridWidth: number, gridHeight: number, scale: number) {
  const bitmap = createBitmap(gridWidth * scale, gridHeight * scale);
  for (let row = 0; row < gridHeight; row += 1) {
    for (let column = 0; column < gridWidth; column += 1) {
      fillRect(bitmap, column * scale, row * scale, scale, scale, cells[row * gridWidth + column]!);
    }
  }
  return bitmap;
}

function rgbDistance(left: Rgb, right: Rgb) {
  return Math.sqrt(
    (left[0] - right[0]) * (left[0] - right[0]) +
      (left[1] - right[1]) * (left[1] - right[1]) +
      (left[2] - right[2]) * (left[2] - right[2]),
  );
}

function pixelLuma(image: RasterImage, x: number, y: number) {
  const index = (y * image.width + x) * 4;
  return image.data[index]! * 0.299 + image.data[index + 1]! * 0.587 + image.data[index + 2]! * 0.114;
}

function isOccupied(rgb: Rgb) {
  return rgbLuma(rgb) < 242;
}

function rgbToGray(rgb: Rgb) {
  return rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function clampToByte(value: number) {
  return clamp(Math.round(value), 0, 255);
}

function createBitmap(width: number, height: number) {
  const data = new Uint8ClampedArray(width * height * 4);
  data.fill(255);
  return { width, height, data };
}

function fillRect(
  bitmap: { width: number; height: number; data: Uint8ClampedArray },
  left: number,
  top: number,
  width: number,
  height: number,
  rgb: Rgb,
) {
  for (let y = top; y < top + height; y += 1) {
    for (let x = left; x < left + width; x += 1) {
      const index = (y * bitmap.width + x) * 4;
      bitmap.data[index] = rgb[0];
      bitmap.data[index + 1] = rgb[1];
      bitmap.data[index + 2] = rgb[2];
      bitmap.data[index + 3] = 255;
    }
  }
}

function writeBmp(
  filePath: string,
  bitmap: { width: number; height: number; data: Uint8ClampedArray },
) {
  const pixelBytes = bitmap.width * bitmap.height * 4;
  const fileSize = 54 + pixelBytes;
  const output = Buffer.alloc(fileSize);
  output.write("BM", 0, 2, "ascii");
  output.writeUInt32LE(fileSize, 2);
  output.writeUInt32LE(54, 10);
  output.writeUInt32LE(40, 14);
  output.writeInt32LE(bitmap.width, 18);
  output.writeInt32LE(bitmap.height, 22);
  output.writeUInt16LE(1, 26);
  output.writeUInt16LE(32, 28);
  output.writeUInt32LE(0, 30);
  output.writeUInt32LE(pixelBytes, 34);
  output.writeInt32LE(2835, 38);
  output.writeInt32LE(2835, 42);

  let offset = 54;
  for (let row = bitmap.height - 1; row >= 0; row -= 1) {
    for (let column = 0; column < bitmap.width; column += 1) {
      const index = (row * bitmap.width + column) * 4;
      output[offset] = bitmap.data[index + 2]!;
      output[offset + 1] = bitmap.data[index + 1]!;
      output[offset + 2] = bitmap.data[index]!;
      output[offset + 3] = bitmap.data[index + 3]!;
      offset += 4;
    }
  }
  writeFileSync(filePath, output);
}

function loadRasterWithPowerShell(imagePath: string): RasterImage {
  const escapedPath = imagePath.replace(/'/g, "''");
  const command = `
Add-Type -AssemblyName System.Drawing
$path = '${escapedPath}'
$source = [System.Drawing.Bitmap]::FromFile($path)
try {
  $bitmap = New-Object System.Drawing.Bitmap($source.Width, $source.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.DrawImage($source, 0, 0, $source.Width, $source.Height)
  } finally {
    $graphics.Dispose()
  }
  $rect = New-Object System.Drawing.Rectangle(0, 0, $bitmap.Width, $bitmap.Height)
  $data = $bitmap.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  try {
    $length = [Math]::Abs($data.Stride) * $bitmap.Height
    $bytes = New-Object byte[] $length
    [Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $length)
    [Console]::Write((@{
      width = $bitmap.Width
      height = $bitmap.Height
      stride = [Math]::Abs($data.Stride)
      data = [Convert]::ToBase64String($bytes)
    } | ConvertTo-Json -Compress))
  } finally {
    $bitmap.UnlockBits($data)
    $bitmap.Dispose()
  }
} finally {
  $source.Dispose()
}`.trim();

  const result = Bun.spawnSync({
    cmd: ["powershell", "-NoProfile", "-Command", command],
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) {
    throw new Error(Buffer.from(result.stderr).toString("utf8"));
  }

  const decoded = JSON.parse(Buffer.from(result.stdout).toString("utf8")) as {
    width: number;
    height: number;
    stride: number;
    data: string;
  };
  const bgra = Buffer.from(decoded.data, "base64");
  const rgba = new Uint8ClampedArray(decoded.width * decoded.height * 4);
  for (let y = 0; y < decoded.height; y += 1) {
    for (let x = 0; x < decoded.width; x += 1) {
      const sourceIndex = y * decoded.stride + x * 4;
      const targetIndex = (y * decoded.width + x) * 4;
      rgba[targetIndex] = bgra[sourceIndex + 2] ?? 0;
      rgba[targetIndex + 1] = bgra[sourceIndex + 1] ?? 0;
      rgba[targetIndex + 2] = bgra[sourceIndex] ?? 0;
      rgba[targetIndex + 3] = bgra[sourceIndex + 3] ?? 255;
    }
  }
  return {
    width: decoded.width,
    height: decoded.height,
    data: rgba,
  };
}

await main();
